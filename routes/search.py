"""
Global search routes (Blueprint). Thin HTTP layer — logic lives in
services/search_service.py.
"""
from flask import Blueprint, request, jsonify

from services.search_service import search_service
from utils.auth import require_role

search_bp = Blueprint('search', __name__)


@search_bp.route('/api/search', methods=['GET'])
@require_role('viewer')
def api_global_search():
    query = request.args.get('q', '').strip()
    if len(query) < 2:
        return jsonify([])
    results = search_service.search(query)
    return jsonify(results)
