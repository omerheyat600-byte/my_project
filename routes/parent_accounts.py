"""
Admin routes for managing parent accounts (Blueprint). Thin HTTP layer
— all logic lives in services/parent_account_service.py. Lives under
/api/admin/... (NOT /api/parent/...) so it stays covered by the normal
admin `require_login` + `require_role('admin')` checks.
"""
from flask import Blueprint, request, jsonify

from repositories.parent_account_repository import ParentAccountRepository
from services.parent_account_service import (
    ParentAccountService,
    ParentAccountValidationError,
    StudentNotFoundError,
    UsernameTakenError,
)
from utils.auth import require_role

parent_accounts_bp = Blueprint('parent_accounts', __name__)

parent_account_repository = ParentAccountRepository()
parent_account_service = ParentAccountService(parent_account_repository)


@parent_accounts_bp.route('/api/admin/parent-accounts', methods=['GET'])
@require_role('admin')
def api_list_parent_accounts():
    return jsonify({"parent_accounts": parent_account_service.list_accounts()})


@parent_accounts_bp.route('/api/admin/parent-accounts', methods=['POST'])
@require_role('admin')
def api_create_parent_account():
    data = request.json or {}
    try:
        result = parent_account_service.create_account(data)
        return jsonify({
            "message": "Parent account created successfully",
            **result,
        }), 201
    except ParentAccountValidationError as e:
        return jsonify({"error": e.errors[0] if e.errors else "Invalid data"}), 400
    except StudentNotFoundError as e:
        return jsonify({"error": str(e)}), 404
    except UsernameTakenError as e:
        return jsonify({"error": str(e)}), 400


@parent_accounts_bp.route('/api/admin/parent-accounts/<int:pid>/reset-password', methods=['POST'])
@require_role('admin')
def api_reset_parent_password(pid):
    new_password = parent_account_service.reset_password(pid)
    return jsonify({"message": "Password reset successfully", "temporary_password": new_password})


@parent_accounts_bp.route('/api/admin/parent-accounts/<int:pid>/activate', methods=['POST'])
@require_role('admin')
def api_activate_parent_account(pid):
    parent_account_service.set_active(pid, True)
    return jsonify({"message": "Parent account activated"})


@parent_accounts_bp.route('/api/admin/parent-accounts/<int:pid>/deactivate', methods=['POST'])
@require_role('admin')
def api_deactivate_parent_account(pid):
    parent_account_service.set_active(pid, False)
    return jsonify({"message": "Parent account deactivated"})


@parent_accounts_bp.route('/api/admin/parent-accounts/<int:pid>', methods=['DELETE'])
@require_role('admin')
def api_delete_parent_account(pid):
    parent_account_service.delete_account(pid)
    return jsonify({"message": "Parent account deleted"})
