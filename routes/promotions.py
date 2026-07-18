"""
Student Promotion / Year Rollover routes (Blueprint). Thin HTTP layer —
all logic lives in services/promotion_service.py.
"""
from flask import Blueprint, request, session

from repositories.promotion_repository import PromotionRepository
from services.promotion_service import (
    PromotionService,
    PromotionNotFoundError,
    PromotionValidationError,
)
from utils.auth import require_role
from utils.response import success_response, error_response

promotions_bp = Blueprint('promotions', __name__)

promotion_repository = PromotionRepository()
promotion_service = PromotionService(promotion_repository)


def _current_user():
    return session.get('full_name') or session.get('username') or session.get('user_id')


# ---------------------------------------------------------------
# Setup screen: classes with headcounts, and a class roster preview
# ---------------------------------------------------------------

@promotions_bp.route('/api/promotions/classes', methods=['GET'])
@require_role('teacher')
def api_promotion_classes():
    return success_response({"classes": promotion_service.list_classes()})


@promotions_bp.route('/api/promotions/preview', methods=['GET'])
@require_role('teacher')
def api_promotion_preview():
    from_class = request.args.get('from_class', '').strip()
    try:
        result = promotion_service.preview(from_class)
        return success_response(result)
    except PromotionValidationError as e:
        return error_response("; ".join(e.errors), status=400)


# ---------------------------------------------------------------
# Run a promotion batch
# ---------------------------------------------------------------

@promotions_bp.route('/api/promotions/run', methods=['POST'])
@require_role('admin')
def api_promotion_run():
    data = request.json or {}
    try:
        batch = promotion_service.run_promotion(data, created_by=_current_user())
        return success_response({"batch": batch}, message="Promotion completed successfully", status=201)
    except PromotionValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except Exception as e:
        return error_response(str(e), status=500)


# ---------------------------------------------------------------
# History
# ---------------------------------------------------------------

@promotions_bp.route('/api/promotions/batches', methods=['GET'])
@require_role('teacher')
def api_promotion_batches():
    return success_response({"batches": promotion_service.list_batches()})


@promotions_bp.route('/api/promotions/batches/<int:batch_id>', methods=['GET'])
@require_role('teacher')
def api_promotion_batch_detail(batch_id):
    try:
        batch = promotion_service.get_batch_detail(batch_id)
        return success_response({"batch": batch})
    except PromotionNotFoundError as e:
        return error_response(str(e), status=404)


@promotions_bp.route('/api/promotions/batches/<int:batch_id>/undo', methods=['POST'])
@require_role('admin')
def api_promotion_batch_undo(batch_id):
    try:
        batch = promotion_service.undo_batch(batch_id, undone_by=_current_user())
        return success_response({"batch": batch}, message="Promotion batch undone")
    except PromotionNotFoundError as e:
        return error_response(str(e), status=404)
    except PromotionValidationError as e:
        return error_response("; ".join(e.errors), status=400)


# ---------------------------------------------------------------
# Find — search every promotion record ever created, across all
# batches, by student id/name or from/to class.
# ---------------------------------------------------------------

@promotions_bp.route('/api/promotions/search', methods=['GET'])
@require_role('teacher')
def api_promotion_search():
    q = request.args.get('q', '').strip()
    return success_response(promotion_service.search(q))
