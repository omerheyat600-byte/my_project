"""
AI Question Paper Generator routes (Blueprint).
Thin HTTP layer — all logic lives in services/ai_paper_service.py.
"""
from flask import Blueprint, request, session

from repositories.ai_paper_repository import AIPaperRepository
from repositories.settings_repository import SettingsRepository
from services.ai_paper_service import AIPaperService, PaperValidationError, PaperNotFoundError
from utils.auth import require_role
from utils.response import success_response, error_response

ai_paper_bp = Blueprint('ai_paper', __name__)

ai_paper_repository = AIPaperRepository()
settings_repository = SettingsRepository()
ai_paper_service = AIPaperService(ai_paper_repository, settings_repository)


def _current_user():
    return session.get('username') or session.get('user_id')


# ---------- Generate / Saved Papers ----------

@ai_paper_bp.route('/api/ai/question-paper/generate', methods=['POST'])
@require_role('teacher')
def api_generate_paper():
    data = request.json or {}
    try:
        paper = ai_paper_service.generate_paper(data, created_by=_current_user())
        return success_response({"paper": paper}, message="Question paper generated")
    except PaperValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except Exception as e:
        return error_response(str(e), status=500)


@ai_paper_bp.route('/api/ai/question-paper', methods=['GET'])
@require_role('viewer')
def api_list_papers():
    class_id = request.args.get('class_id', '').strip() or None
    subject = request.args.get('subject', '').strip() or None
    return success_response({"papers": ai_paper_service.list_papers(class_id, subject)})


@ai_paper_bp.route('/api/ai/question-paper/<int:paper_id>', methods=['GET'])
@require_role('viewer')
def api_get_paper(paper_id):
    try:
        return success_response({"paper": ai_paper_service.get_paper(paper_id)})
    except PaperNotFoundError as e:
        return error_response(str(e), status=404)


@ai_paper_bp.route('/api/ai/question-paper/<int:paper_id>', methods=['DELETE'])
@require_role('teacher')
def api_delete_paper(paper_id):
    try:
        ai_paper_service.delete_paper(paper_id)
        return success_response(message="Question paper deleted")
    except PaperNotFoundError as e:
        return error_response(str(e), status=404)


# ---------- Question Bank ----------

@ai_paper_bp.route('/api/ai/question-bank', methods=['GET'])
@require_role('viewer')
def api_list_bank_questions():
    subject = request.args.get('subject', '').strip() or None
    class_id = request.args.get('class_id', '').strip() or None
    question_type = request.args.get('question_type', '').strip() or None
    topic = request.args.get('topic', '').strip() or None
    return success_response({"questions": ai_paper_service.list_bank_questions(subject, class_id, question_type, topic)})


@ai_paper_bp.route('/api/ai/question-bank', methods=['POST'])
@require_role('teacher')
def api_add_bank_question():
    data = request.json or {}
    try:
        qid = ai_paper_service.add_bank_question(data)
        return success_response({"id": qid}, message="Question added to bank")
    except PaperValidationError as e:
        return error_response("; ".join(e.errors), status=400)


@ai_paper_bp.route('/api/ai/question-bank/<int:question_id>', methods=['DELETE'])
@require_role('teacher')
def api_delete_bank_question(question_id):
    ai_paper_service.delete_bank_question(question_id)
    return success_response(message="Question removed from bank")


@ai_paper_bp.route('/api/ai/question-bank/stats', methods=['GET'])
@require_role('viewer')
def api_bank_stats():
    subject = request.args.get('subject', '').strip() or None
    class_id = request.args.get('class_id', '').strip() or None
    return success_response({"stats": ai_paper_service.bank_stats(subject, class_id)})
