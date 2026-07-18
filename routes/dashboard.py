"""
Dashboard routes (Blueprint). Thin HTTP layer — all logic lives in
services/dashboard_service.py.
"""
from flask import Blueprint, jsonify, request, session

from repositories.dashboard_repository import DashboardRepository
from services.dashboard_service import DashboardService
from utils.auth import require_role

dashboard_bp = Blueprint('dashboard', __name__)

dashboard_repository = DashboardRepository()
dashboard_service = DashboardService(dashboard_repository)


@dashboard_bp.route('/api/dashboard', methods=['GET'])
@require_role('viewer')
def api_dashboard():
    year = request.args.get('year', type=int)
    role = session.get('role', 'viewer')
    return jsonify(dashboard_service.get_dashboard_data(year=year, role=role))
