"""
EduAdmin — School Management System - REST API Backend
Run: pip install flask flask-cors && python app.py
API runs on: http://127.0.0.1:5004

This file only wires the Flask app together (config, CORS, sessions,
before_request hooks, Blueprint registration, static frontend route).
Everything else lives in its own module:
  - License system            -> utils/license.py
  - Password hashing          -> utils/security.py
  - Login/session/bootstrap   -> services/auth_service.py (routes/auth.py)
  - User management           -> services/user_service.py (routes/users.py)
  - Dashboard summary         -> services/dashboard_service.py (routes/dashboard.py)
  - School settings           -> services/settings_service.py (routes/settings.py)
  - Demo data seeding         -> database.py (seed_sample_data)
"""
from flask import Flask, request, session, jsonify, send_from_directory
from flask_cors import CORS

from config import SECRET_KEY, CORS_RESOURCES, SESSION_CONFIG, UPLOADS_DIR
from utils.auth import require_login
from utils.license import generate_license_key, verify_license, check_license  # noqa: F401 (re-exported for run.py)
from database import init_db, seed_sample_data  # noqa: F401 (re-exported for run.py / manual use)
from repositories.user_repository import UserRepository
from services.auth_service import AuthService
from routes import register_routes

app = Flask(__name__)
app.secret_key = SECRET_KEY

# Safe permissive fallback parameters mapping for local cross-origins setups
CORS(app, supports_credentials=True, resources=CORS_RESOURCES)

app.config.update(**SESSION_CONFIG)

# Register modular Blueprints (students, teachers, auth, users, dashboard, ...)
register_routes(app)


# ============================================
# LICENSE ENFORCEMENT — runs before everything else
# ============================================
# Checked on every request (not just at startup) so an already-running
# server stops working the moment the license expires, without needing
# a restart. Blocks both API calls and page loads once invalid/expired,
# and shows a proper in-browser message instead of the app just crashing
# or silently closing.
@app.before_request
def license_gate():
    # Always allow static assets through, otherwise the "license expired"
    # page itself couldn't load its CSS/JS.
    if request.path.startswith('/static'):
        return
    # Public status endpoint so the expired page (and an "expiring soon"
    # banner in the main app) can show the real message/expiry date.
    if request.path == '/api/license-status':
        return

    status = check_license()
    if status['valid']:
        return

    if request.path.startswith('/api'):
        return jsonify({
            "error": status['message'],
            "license_expired": status['expired'],
            "license_invalid": status['key_invalid'],
        }), 402

    # Any HTML page request (/, /parent-portal, or anything else)
    return app.send_static_file('license_expired.html'), 402


@app.route('/api/license-status')
def api_license_status():
    """Public, read-only license status — safe to expose (no secrets),
    used by the frontend to show expiry warnings / the blocked-page message."""
    status = check_license()
    return jsonify({
        "valid": status['valid'],
        "expired": status['expired'],
        "message": status['message'],
        "expiry_date": status['expiry_date'],
        "days_remaining": status['days_remaining'],
        "clock_rollback": status.get('clock_rollback', False),
        "time_source": status.get('time_source'),
    })


# ============================================
# SESSION INITIALIZATION
# ============================================
@app.before_request
def init_session():
    """Initialize session on first visit to prevent auto-login"""
    # Only handle GET requests to the root path
    if request.path == '/' and request.method == 'GET':
        # Check if this is a fresh session
        if not session.get('_session_initialized'):
            # Clear any existing session data
            session.clear()
            session['_session_initialized'] = True
            print("🔒 New session initialized - user not logged in")


# ============================================
# BEFORE REQUEST - AUTHENTICATION CHECK
# ============================================
app.before_request(require_login)


# ============================================
# MULTI-USER AUTHENTICATION SYSTEM (bootstrap)
# ============================================
def init_user_table():
    """Create the users table (if missing) and seed the default admin.
    Thin wrapper kept for run.py; real logic lives in AuthService."""
    AuthService(UserRepository()).bootstrap()


# ==================== STATIC FRONTEND ====================
@app.route('/')
def index():
    return app.send_static_file('index.html')


@app.route('/parent-portal')
def parent_portal_page():
    return app.send_static_file('parent.html')


@app.route('/admission-apply')
def admission_apply_page():
    return app.send_static_file('admission_apply.html')


@app.route('/uploads/<path:filename>')
def serve_upload(filename):
    # send_from_directory guards against path traversal (../..) on its own.
    return send_from_directory(UPLOADS_DIR, filename)


# ==================== MAIN ====================
##if __name__ == "__main__":
##    init_db()
##    init_user_table()
##    print("\n" + "="*50)
##    print("  EduAdmin School Management System API")
##    print("  Backend API: http://127.0.0.1:5004")
##    print("  Frontend: http://127.0.0.1:5004")
##    print("  Default Admin: admin / admin123")
##    print("="*50 + "\n")
##    app.run(debug=False, port=5004)
