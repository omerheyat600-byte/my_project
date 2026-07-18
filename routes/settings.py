"""
School settings routes (Blueprint). Thin HTTP layer — all logic lives
in services/settings_service.py.
"""
from flask import Blueprint, request, jsonify

from repositories.settings_repository import SettingsRepository
from services.settings_service import SettingsService, SettingsValidationError
from utils.auth import require_role

settings_bp = Blueprint('settings', __name__)

settings_repository = SettingsRepository()
settings_service = SettingsService(settings_repository)


@settings_bp.route('/api/settings', methods=['GET'])
@require_role('viewer')
def api_get_settings():
    """Get school settings"""
    try:
        return jsonify(settings_service.get_settings())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@settings_bp.route('/api/settings', methods=['POST'])
@require_role('admin')
def api_update_settings():
    """Update school settings"""
    try:
        data = request.json or {}
        settings_service.update_settings(data)
        return jsonify({"message": "Settings updated successfully"})
    except SettingsValidationError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@settings_bp.route('/api/settings/sms', methods=['POST'])
@require_role('admin')
def api_update_sms_setting():
    """Enable/disable SMS alerts for student absences"""
    try:
        data = request.json or {}
        settings_service.update_sms_alerts(bool(data.get('enabled')))
        return jsonify({"message": "SMS setting saved"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@settings_bp.route('/api/settings/ai', methods=['GET'])
@require_role('admin')
def api_get_ai_settings():
    """Get AI provider configuration (API keys are never returned in full)"""
    try:
        return jsonify(settings_service.get_ai_settings())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@settings_bp.route('/api/settings/ai', methods=['POST'])
@require_role('admin')
def api_update_ai_settings():
    """Update AI provider configuration"""
    try:
        data = request.json or {}
        settings_service.update_ai_settings(data)
        return jsonify({"message": "AI settings saved"})
    except SettingsValidationError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
