"""
Backup & Restore routes (Blueprint). Thin HTTP layer — all logic lives
in services/backup_service.py.

Restricted to admin only — backup contains the entire database
(everyone's data) and restore is a destructive, whole-system action.
"""
import os
import tempfile

from flask import Blueprint, request, session, send_file

from repositories.backup_repository import BackupRepository
from services.backup_service import (
    BackupService,
    BackupError,
    InvalidBackupError,
    RestoreError,
)
from utils.auth import require_role
from utils.response import success_response, error_response

backup_bp = Blueprint('backup', __name__)

backup_repository = BackupRepository()
backup_service = BackupService(backup_repository)


@backup_bp.route('/api/backup/create', methods=['POST'])
@require_role('admin')
def api_create_backup():
    created_by = session.get('username')
    try:
        result = backup_service.create_backup(created_by=created_by)
        return success_response(result, message=f"Backup created: {result['filename']}", status=201)
    except BackupError as e:
        return error_response(str(e), status=500)
    except Exception as e:
        return error_response(f"Unexpected error creating backup: {e}", status=500)


@backup_bp.route('/api/backup/history', methods=['GET'])
@require_role('admin')
def api_backup_history():
    backups = backup_service.list_backups()
    action_log = backup_service.get_action_history()
    return success_response({"backups": backups, "action_log": action_log})


@backup_bp.route('/api/backup/download/<path:filename>', methods=['GET'])
@require_role('admin')
def api_download_backup(filename):
    try:
        path = backup_service.get_backup_path(filename)
        return send_file(path, as_attachment=True, download_name=filename)
    except InvalidBackupError as e:
        return error_response(str(e), status=404)


@backup_bp.route('/api/backup/restore', methods=['POST'])
@require_role('admin')
def api_restore_backup():
    """
    Accepts either:
      - a multipart file upload under the 'backup_file' field (user
        picked a ZIP from their computer), or
      - JSON { "filename": "..." } referring to an existing backup
        already in the backup history/folder.
    Requires { "confirm": true } (as a form field or JSON key) as a
    second, server-side confirmation gate on top of whatever the UI
    already asked — restore is destructive and irreversible without
    the auto-generated safety backup.
    """
    restored_by = session.get('username')

    uploaded_file = request.files.get('backup_file')
    if uploaded_file:
        confirm = request.form.get('confirm')
    else:
        confirm = (request.json or {}).get('confirm')

    if str(confirm).lower() not in ('true', '1', 'yes'):
        return error_response(
            "Restore requires explicit confirmation (confirm=true).", status=400
        )

    temp_path = None
    try:
        if uploaded_file:
            if not uploaded_file.filename.endswith('.zip'):
                return error_response("Please upload a .zip backup file.", status=400)
            fd, temp_path = tempfile.mkstemp(suffix=".zip")
            os.close(fd)
            uploaded_file.save(temp_path)
            zip_path = temp_path
        else:
            data = request.json or {}
            filename = data.get('filename')
            if not filename:
                return error_response(
                    "Provide either a backup_file upload or a filename of an existing backup.",
                    status=400
                )
            zip_path = backup_service.get_backup_path(filename)

        result = backup_service.restore_backup(zip_path, restored_by=restored_by)
        return success_response(result, message=(
            "Restore completed successfully. The application will restart "
            "automatically in a few seconds — please refresh if it doesn't reload on its own."
        ))

    except InvalidBackupError as e:
        return error_response(str(e), status=400)
    except RestoreError as e:
        return error_response(str(e), status=500)
    except Exception as e:
        return error_response(f"Unexpected error during restore: {e}", status=500)
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass


@backup_bp.route('/api/backup/<path:filename>', methods=['DELETE'])
@require_role('admin')
def api_delete_backup(filename):
    deleted_by = session.get('username')
    try:
        backup_service.delete_backup(filename, deleted_by=deleted_by)
        return success_response(message="Backup deleted")
    except InvalidBackupError as e:
        return error_response(str(e), status=404)
    except BackupError as e:
        return error_response(str(e), status=500)
