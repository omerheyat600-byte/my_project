"""
Auth routes (Blueprint). Thin HTTP layer — all logic lives in
services/auth_service.py.
"""
from flask import Blueprint, request, session, jsonify

from repositories.user_repository import UserRepository
from services.auth_service import AuthService, AuthError
from utils.auth import require_role
from utils.logger import get_logger
from utils.rate_limit import check_locked, record_failure, record_success, client_ip

logger = get_logger(__name__)

auth_bp = Blueprint('auth', __name__)

user_repository = UserRepository()
auth_service = AuthService(user_repository)


@auth_bp.route('/api/login', methods=['POST'])
def api_login():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON"}), 400

        username = (data.get('username') or '').strip().lower()
        ip = client_ip(request)
        user_key = f"user:{username}"
        ip_key = f"ip:{ip}"

        locked_seconds = check_locked(user_key, ip_key)
        if locked_seconds:
            minutes = max(1, locked_seconds // 60)
            return jsonify({"error": f"Too many failed attempts. Try again in about {minutes} minute(s)."}), 429

        try:
            user = auth_service.login(data.get('username'), data.get('password'))
        except AuthError as e:
            record_failure(user_key, ip_key)
            return jsonify({"error": str(e)}), e.status

        record_success(user_key, ip_key)

        # Clear any existing session first
        session.clear()

        # Set session
        session.permanent = True
        session['user_id'] = user['id']
        session['username'] = user['username']
        session['full_name'] = user['full_name']
        session['role'] = user['role']
        session['logged_in'] = True
        session['_session_initialized'] = True

        print("✅ Session set:", dict(session))

        return jsonify({
            "message": "Login successful",
            "user": {
                "username": user['username'],
                "full_name": user['full_name'],
                "role": user['role']
            }
        }), 200

    except Exception as e:
        print("\n❌ LOGIN ERROR:")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Server error: " + str(e)}), 500


@auth_bp.route('/api/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify({"message": "Logged out"}), 200


@auth_bp.route('/api/check-auth', methods=['GET'])
def api_check_auth():
    if not session.get('logged_in'):
        return jsonify({"authenticated": False}), 401

    user = auth_service.get_active_session_user(session.get('user_id'))
    if not user:
        # User no longer exists – clear the session
        session.clear()
        return jsonify({"authenticated": False}), 401

    return jsonify({
        "authenticated": True,
        "username": user['username'],
        "full_name": user['full_name'],
        "role": user['role']
    }), 200


@auth_bp.route('/api/session-check', methods=['GET'])
def session_check():
    return jsonify({
        "logged_in": session.get('logged_in', False),
        "username": session.get('username', None),
        "role": session.get('role', None),
        "session": dict(session)
    })


@auth_bp.route('/api/test-schema', methods=['GET'])
@require_role('admin')
def test_schema():
    try:
        return jsonify({"columns": auth_service.get_table_columns()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@auth_bp.route('/api/debug-session', methods=['GET'])
def debug_session():
    """Debug endpoint to check session data (development only)"""
    return jsonify({
        "session": dict(session),
        "logged_in": session.get('logged_in', False),
        "username": session.get('username', None),
        "full_name": session.get('full_name', None),
        "role": session.get('role', None),
        "session_initialized": session.get('_session_initialized', False)
    })
