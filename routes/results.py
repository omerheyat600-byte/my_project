"""
Result routes (Blueprint). Covers three closely related surfaces that all
live under the "Results" module in your migration list:

  1. Legacy flat results CRUD + result cards        (ResultService)
  2. Excel bulk-grid entry                          (ResultService)
  3. Structured exam-session workflow (marksheet /
     submit / gazette)                              (ExamService)

Thin HTTP layer — all logic lives in services/result_service.py and
services/exam_service.py.
"""
from datetime import datetime

from flask import Blueprint, request

from repositories.result_repository import ResultRepository
from repositories.exam_repository import ExamRepository
from services.result_service import (
    ResultService,
    ResultNotFoundError,
    ResultValidationError,
    ClassNotFoundForResultsError,
    NoStudentsFoundError,
    StudentNotFoundForResultError,
)
from services.exam_service import (
    ExamService,
    ExamClassNotFoundError,
    ExamNotFoundError,
    ExamValidationError,
    ExamResultLockedError,
)
from utils.auth import require_role
from utils.response import success_response, error_response

results_bp = Blueprint('results', __name__)

result_repository = ResultRepository()
result_service = ResultService(result_repository)

exam_repository = ExamRepository()
exam_service = ExamService(exam_repository)


# ---------- Legacy results CRUD ----------

@results_bp.route('/api/results', methods=['GET'])
@require_role('viewer')
def api_get_results():
    q = request.args.get('q', '').strip()
    student_filter = request.args.get('student_id', '').strip()
    term_filter = request.args.get('term', '').strip()
    class_filter = request.args.get('class', '').strip()
    date_from = request.args.get('date_from', '').strip()
    date_to = request.args.get('date_to', '').strip()

    result = result_service.list_results(q, student_filter, term_filter, class_filter, date_from, date_to)
    return success_response(result)


@results_bp.route('/api/results', methods=['POST'])
@require_role('teacher')
def api_create_result():
    data = request.json or {}
    try:
        new_id = result_service.create_result(data)
        return success_response({"id": new_id}, message="Result added successfully", status=201)
    except ResultValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except Exception as e:
        return error_response(str(e), status=500)


@results_bp.route('/api/results/<int:rid>', methods=['PUT'])
@require_role('teacher')
def api_update_result(rid):
    data = request.json or {}
    try:
        result_service.update_result(rid, data)
        return success_response(message="Result updated successfully")
    except ResultValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except ResultNotFoundError as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)


@results_bp.route('/api/results/<int:rid>', methods=['DELETE'])
@require_role('teacher')
def api_delete_result(rid):
    try:
        result_service.delete_result(rid)
        return success_response(message="Result deleted successfully")
    except ResultNotFoundError as e:
        return error_response(str(e), status=404)


@results_bp.route('/api/results/card/<sid>', methods=['GET'])
@require_role('viewer')
def api_result_card(sid):
    try:
        card = result_service.get_result_card(sid)
        return success_response(card)
    except StudentNotFoundForResultError as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)


@results_bp.route('/api/results/bulk-cards', methods=['GET'])
@require_role('viewer')
def api_bulk_result_cards():
    class_id = request.args.get('class_id', '').strip()
    term = request.args.get('term', '').strip()
    year = request.args.get('year', '').strip()

    if not class_id or not term or not year:
        return error_response("class_id, term, and year are required", status=400)

    try:
        cards = result_service.get_bulk_result_cards(class_id, term, year)
        return success_response(cards)
    except ClassNotFoundForResultsError as e:
        return error_response(str(e), status=404)
    except NoStudentsFoundError as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)


# ---------- Excel bulk grid ----------

@results_bp.route('/api/results/excel-sheet', methods=['GET'])
@require_role('teacher')
def api_get_excel_sheet():
    grade = request.args.get('grade', '').strip()
    class_id = request.args.get('class_id', '').strip()
    term = request.args.get('term', '').strip()
    year = request.args.get('year', '').strip()

    try:
        sheet = result_service.get_excel_sheet(grade, class_id, term, year)
        return success_response(sheet)
    except Exception as e:
        return error_response(str(e), status=500)


@results_bp.route('/api/results/excel-save', methods=['POST'])
@require_role('teacher')
def api_save_excel_sheet():
    data = request.json or {}
    try:
        result_service.save_excel_sheet(data)
        return success_response(message="Bulk results saved successfully")
    except Exception as e:
        return error_response(str(e), status=500)


# ---------- Exam sessions ----------

@results_bp.route('/api/exam/class/<int:class_id>/marksheet', methods=['GET'])
@require_role('teacher')
def get_exam_marksheet(class_id):
    term = request.args.get('term', 'Term 1')
    year = request.args.get('year', str(datetime.now().year))

    try:
        sheet = exam_service.get_marksheet(class_id, term, year)
        return success_response(sheet)
    except ExamClassNotFoundError as e:
        return error_response(str(e), status=404)


@results_bp.route('/api/exam/submit', methods=['POST'])
@require_role('teacher')
def submit_exam_marks():
    data = request.json or {}
    exam_id = data.get('exam_id')
    marks_data = data.get('data', [])

    try:
        exam_service.submit_marks(exam_id, marks_data)
        return success_response({"exam_id": exam_id}, message="Marks saved successfully")
    except ExamResultLockedError as e:
        return error_response(str(e), status=423)
    except ExamValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except Exception as e:
        return error_response(str(e), status=500)


@results_bp.route('/api/exam/<int:exam_id>/gazette', methods=['GET'])
@require_role('viewer')
def get_exam_gazette(exam_id):
    try:
        gazette = exam_service.get_gazette(exam_id)
        return success_response(gazette)
    except ExamNotFoundError as e:
        return error_response(str(e), status=404)
