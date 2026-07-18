"""
Admission routes (Blueprint). Thin HTTP layer — all logic lives in
services/admission_service.py.

Two audiences:
  - PUBLIC  (no login): submit an online application, track its status,
    check seat availability, upload a photo — everything a candidate/
    parent needs before they have any account.
  - ADMIN   (login required, role-gated): review applications, enter
    test marks, manage the waiting list, approve/reject.

The public endpoints are also whitelisted in utils/auth.py's
`public_paths` — adding a route here is not enough on its own.
"""
import os
import uuid

from flask import Blueprint, request
from werkzeug.utils import secure_filename

from config import UPLOADS_DIR
from repositories.admission_repository import AdmissionRepository
from repositories.class_repository import ClassRepository
from repositories.student_repository import StudentRepository
from services.admission_service import (
    AdmissionService,
    AdmissionNotFoundError,
    AdmissionValidationError,
    SeatsFullError,
)
from services.student_service import StudentService
from utils.auth import require_role
from utils.response import success_response, error_response

admissions_bp = Blueprint('admissions', __name__)

admission_repository = AdmissionRepository()
class_repository = ClassRepository()
student_service = StudentService(StudentRepository())
admission_service = AdmissionService(admission_repository, class_repository, student_service)

ALLOWED_PHOTO_EXT = {'.jpg', '.jpeg', '.png', '.webp'}


# ---------------------------------------------------------------
# PUBLIC — Online Admission Form
# ---------------------------------------------------------------

@admissions_bp.route('/api/admissions/apply', methods=['POST'])
def api_submit_application():
    data = request.json or {}
    try:
        result = admission_service.submit_application(data)
        return success_response(result, message=f"Application submitted — your reference number is {result['applicant_no']}", status=201)
    except AdmissionValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except Exception as e:
        return error_response(str(e), status=500)


@admissions_bp.route('/api/admissions/track/<applicant_no>', methods=['GET'])
def api_track_application(applicant_no):
    try:
        return success_response(admission_service.track_application(applicant_no))
    except AdmissionNotFoundError as e:
        return error_response(str(e), status=404)


@admissions_bp.route('/api/admissions/classes', methods=['GET'])
def api_public_class_list():
    """Public — just class names, for the online application form's grade
    dropdown. No capacity/teacher/room details exposed here."""
    classes = class_repository.find_all()
    return success_response({"classes": [c.class_name for c in classes]})


@admissions_bp.route('/api/admissions/seats', methods=['GET'])
def api_seat_availability():
    grade = request.args.get('grade', '').strip()
    if not grade:
        return error_response("grade is required", status=400)
    return success_response(admission_service.get_seat_availability(grade))


@admissions_bp.route('/api/admissions/<int:aid>/photo', methods=['POST'])
def api_upload_applicant_photo(aid):
    """Public — a candidate uploads their photo right after submitting,
    using the id returned by /apply. No auth, but scoped to a single
    freshly-created row, same trust model as the public apply endpoint."""
    if 'photo' not in request.files:
        return error_response("No photo file provided", status=400)
    file = request.files['photo']
    ext = os.path.splitext(file.filename or '')[1].lower()
    if ext not in ALLOWED_PHOTO_EXT:
        return error_response("Only JPG, PNG or WebP images are allowed", status=400)

    try:
        folder = os.path.join(UPLOADS_DIR, 'admissions')
        os.makedirs(folder, exist_ok=True)
        filename = f"{aid}_{uuid.uuid4().hex[:8]}{ext}"
        filename = secure_filename(filename)
        file.save(os.path.join(folder, filename))
        rel_path = f"/uploads/admissions/{filename}"
        admission_service.set_photo(aid, rel_path)
        return success_response({"photo_path": rel_path}, message="Photo uploaded")
    except AdmissionNotFoundError as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)


# ---------------------------------------------------------------
# ADMIN — Review, Test Marks, Waiting List, Approval
# ---------------------------------------------------------------

@admissions_bp.route('/api/admissions', methods=['GET'])
@require_role('viewer')
def api_list_admissions():
    q = request.args.get('q', '').strip()
    status = request.args.get('status', '').strip()
    grade = request.args.get('grade', '').strip()
    return success_response(admission_service.list_admissions(q, status, grade))


@admissions_bp.route('/api/admissions/waiting-list', methods=['GET'])
@require_role('viewer')
def api_waiting_list():
    grade = request.args.get('grade', '').strip()
    return success_response({"waiting_list": admission_service.get_waiting_list(grade)})


@admissions_bp.route('/api/admissions/<int:aid>', methods=['GET'])
@require_role('viewer')
def api_get_admission(aid):
    try:
        return success_response(admission_service.get_admission(aid))
    except AdmissionNotFoundError as e:
        return error_response(str(e), status=404)


@admissions_bp.route('/api/admissions/<int:aid>', methods=['PUT'])
@require_role('teacher')
def api_update_admission(aid):
    data = request.json or {}
    try:
        admission_service.update_application(aid, data)
        return success_response(message="Application updated")
    except AdmissionValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except AdmissionNotFoundError as e:
        return error_response(str(e), status=404)


@admissions_bp.route('/api/admissions/<int:aid>', methods=['DELETE'])
@require_role('admin')
def api_delete_admission(aid):
    try:
        admission_service.delete_admission(aid)
        return success_response(message="Application deleted")
    except AdmissionNotFoundError as e:
        return error_response(str(e), status=404)


@admissions_bp.route('/api/admissions/<int:aid>/test-marks', methods=['POST'])
@require_role('teacher')
def api_record_test_marks(aid):
    data = request.json or {}
    try:
        result = admission_service.record_test_marks(
            aid, data.get('marks'), data.get('total', 100), data.get('test_date')
        )
        return success_response(result, message="Test marks recorded")
    except AdmissionValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except AdmissionNotFoundError as e:
        return error_response(str(e), status=404)


@admissions_bp.route('/api/admissions/<int:aid>/waitlist', methods=['POST'])
@require_role('teacher')
def api_waitlist_admission(aid):
    data = request.json or {}
    try:
        admission_service.waitlist_admission(aid, data.get('remarks'))
        return success_response(message="Moved to waiting list")
    except AdmissionValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except AdmissionNotFoundError as e:
        return error_response(str(e), status=404)


@admissions_bp.route('/api/admissions/<int:aid>/reject', methods=['POST'])
@require_role('teacher')
def api_reject_admission(aid):
    data = request.json or {}
    try:
        admission_service.reject_admission(aid, data.get('remarks'))
        return success_response(message="Application rejected")
    except AdmissionValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except AdmissionNotFoundError as e:
        return error_response(str(e), status=404)


@admissions_bp.route('/api/admissions/<int:aid>/approve', methods=['POST'])
@require_role('admin')
def api_approve_admission(aid):
    """Admission Approval + Student ID Auto Generate in one step: on
    success a real Student row now exists (auto ID + admission no)."""
    data = request.json or {}
    force = bool(data.get('force'))
    try:
        result = admission_service.approve_admission(aid, force=force, join_date=data.get('join_date'))
        return success_response(result, message=f"Approved — Student ID {result['student_id']} created")
    except SeatsFullError as e:
        return error_response(str(e), status=409, data={"seats_full": True})
    except AdmissionValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except AdmissionNotFoundError as e:
        return error_response(str(e), status=404)
