"""
Parent Portal auth routes (Blueprint). Thin HTTP layer — all logic
lives in services/parent_auth_service.py. Session keys are namespaced
(parent_*) so they can never collide with, or be mistaken for, an
admin session.
"""
from flask import Blueprint, request, session, jsonify

from repositories.parent_account_repository import ParentAccountRepository
from services.parent_auth_service import ParentAuthService, ParentAuthError
from utils.logger import get_logger
from utils.rate_limit import check_locked, record_failure, record_success, client_ip

logger = get_logger(__name__)

parent_auth_bp = Blueprint('parent_auth', __name__)

parent_account_repository = ParentAccountRepository()
parent_auth_service = ParentAuthService(parent_account_repository)


@parent_auth_bp.route('/api/parent/login', methods=['POST'])
def api_parent_login():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON"}), 400

        username = (data.get('username') or '').strip().lower()
        ip = client_ip(request)
        user_key = f"parent:{username}"
        ip_key = f"ip:{ip}"

        locked_seconds = check_locked(user_key, ip_key)
        if locked_seconds:
            minutes = max(1, locked_seconds // 60)
            return jsonify({"error": f"Too many failed attempts. Try again in about {minutes} minute(s)."}), 429

        try:
            account = parent_auth_service.login(data.get('username'), data.get('password'))
        except ParentAuthError as e:
            record_failure(user_key, ip_key)
            return jsonify({"error": str(e)}), e.status

        record_success(user_key, ip_key)

        # Clear any existing parent session first, but never touch an
        # unrelated admin session key.
        session.pop('parent_logged_in', None)

        session.permanent = True
        session['parent_id'] = account['id']
        session['parent_username'] = account['username']
        session['parent_student_id'] = account['student_id']
        session['parent_full_name'] = account['full_name']
        session['parent_logged_in'] = True

        return jsonify({
            "message": "Login successful",
            "parent": {
                "username": account['username'],
                "full_name": account['full_name'],
                "student_id": account['student_id'],
            }
        }), 200

    except Exception as e:
        logger.error(f"Parent login error: {e}")
        return jsonify({"error": "Server error: " + str(e)}), 500


@parent_auth_bp.route('/api/parent/logout', methods=['POST'])
def api_parent_logout():
    for key in ('parent_logged_in', 'parent_id', 'parent_username', 'parent_student_id', 'parent_full_name'):
        session.pop(key, None)
    return jsonify({"message": "Logged out"}), 200


@parent_auth_bp.route('/api/parent/check-auth', methods=['GET'])
def api_parent_check_auth():
    if not session.get('parent_logged_in'):
        return jsonify({"authenticated": False}), 401

    account = parent_auth_service.get_active_session_account(session.get('parent_id'))
    if not account:
        session.pop('parent_logged_in', None)
        return jsonify({"authenticated": False}), 401

    return jsonify({
        "authenticated": True,
        "username": account['username'],
        "full_name": account['full_name'],
        "student_id": account['student_id'],
    }), 200
