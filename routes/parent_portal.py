"""
Parent Portal data routes (Blueprint). Thin HTTP layer — all logic
lives in services/parent_portal_service.py.

CRITICAL: every route pulls student_id from the parent session, never
from a query param or JSON body. This is the only thing standing
between a parent and another family's student data.
"""
from flask import Blueprint, session, jsonify

from services.parent_portal_service import ParentPortalService
from utils.auth import require_parent_login

parent_portal_bp = Blueprint('parent_portal', __name__)

parent_portal_service = ParentPortalService()


def _session_student_id():
    return session.get('parent_student_id')


@parent_portal_bp.route('/api/parent/dashboard', methods=['GET'])
@require_parent_login
def api_parent_dashboard():
    return jsonify(parent_portal_service.get_dashboard(_session_student_id()))


@parent_portal_bp.route('/api/parent/fees', methods=['GET'])
@require_parent_login
def api_parent_fees():
    return jsonify(parent_portal_service.get_fees(_session_student_id()))


@parent_portal_bp.route('/api/parent/results', methods=['GET'])
@require_parent_login
def api_parent_results():
    return jsonify(parent_portal_service.get_results(_session_student_id()))


@parent_portal_bp.route('/api/parent/attendance', methods=['GET'])
@require_parent_login
def api_parent_attendance():
    return jsonify(parent_portal_service.get_attendance(_session_student_id()))


@parent_portal_bp.route('/api/parent/notifications', methods=['GET'])
@require_parent_login
def api_parent_notifications():
    return jsonify(parent_portal_service.get_notifications(_session_student_id()))
