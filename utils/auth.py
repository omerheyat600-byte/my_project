"""
Shared authentication/authorization helpers (session role-checks).

NOTE: this file isn't part of the structure you listed, but require_login /
require_role / USER_ROLES are used by student routes AND by every other
route still living in app.py. Pulling them out here avoids a circular
import between app.py and routes/students.py while keeping app.py slim.
"""
from flask import request, session, jsonify

# User roles
USER_ROLES = {
    'admin': 100,      # Full access
    'teacher': 50,     # Can manage students, results, classes
    'accountant': 30,  # Can manage fees and expenses only
    'viewer': 10       # Read-only access
}


def require_login():
    """Check authentication before each request"""
    # Allow CORS preflight (OPTIONS) requests
    if request.method == 'OPTIONS':
        return

    # Public endpoints – no login required
    public_paths = [
        '/api/login',
        '/api/logout',
        '/api/check-auth',
        '/api/session-check',
        '/api/license-status',
        # REMOVE '/api/settings' - it should require authentication
        # '/api/test-schema' was previously public — removed: it dumped raw
        # DB table/column names to anyone, unauthenticated. It's a dev
        # debugging aid, not something end users need, so it now requires
        # an admin session like any other schema-revealing endpoint.
    ]

    # Allow static files
    if request.path.startswith('/static'):
        return

    # Allow root path and the parent-portal / admission-apply pages to serve HTML
    if request.path in ('/', '/parent-portal', '/admission-apply') and request.method == 'GET':
        return

    # Online Admission Form — public, unauthenticated: a candidate applying
    # has no account yet. Everything else under /api/admissions/ (listing,
    # test marks, approval, ...) stays behind the normal admin/@require_role
    # checks below since it isn't in this exemption list.
    public_admission_paths = (
        request.path == '/api/admissions/apply'
        or request.path.startswith('/api/admissions/track/')
        or request.path == '/api/admissions/seats'
        or request.path == '/api/admissions/classes'
        or (request.path.startswith('/api/admissions/') and request.path.endswith('/photo'))
    )
    if public_admission_paths:
        return

    # Parent Portal API routes (/api/parent/...) have their own session
    # namespace and their own require_parent_login guard — they are a
    # completely separate login system from the admin `users` table, so
    # they're intentionally exempt from the admin `logged_in` check below.
    # (Admin-side parent-account management lives under /api/admin/... and
    # is NOT covered by this exemption — it still requires an admin session.)
    if request.path.startswith('/api/parent/'):
        return

    # Check if it's an API endpoint
    if request.path.startswith('/api'):
        # Allow public endpoints
        if request.path in public_paths:
            return

        # Check authentication for all other API endpoints
        if not session.get('logged_in'):
            return jsonify({"error": "Unauthorized"}), 401


def require_parent_login(f):
    """Guard for Parent Portal routes. Uses a completely separate session
    namespace (parent_logged_in / parent_id / parent_student_id) from the
    admin session, so an admin session and a parent session can't be
    confused with each other."""
    def wrapper(*args, **kwargs):
        if not session.get('parent_logged_in'):
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    wrapper.__name__ = f.__name__
    return wrapper


def require_role(min_role):
    def decorator(f):
        def wrapper(*args, **kwargs):
            if not session.get('logged_in'):
                return jsonify({"error": "Unauthorized"}), 401
            user_role = session.get('role', 'viewer')
            if USER_ROLES.get(user_role, 0) < USER_ROLES.get(min_role, 0):
                return jsonify({"error": "Insufficient permissions"}), 403
            return f(*args, **kwargs)
        wrapper.__name__ = f.__name__
        return wrapper
    return decorator
