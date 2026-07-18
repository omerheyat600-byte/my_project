"""
HR Module routes (Blueprint). Thin HTTP layer — all logic lives in
services/hr_service.py.

Covers: Leave Application/Approval, Overtime, Increments, Payroll,
Salary Slip (a payroll record viewed/printed individually), and
Employee Documents.
"""
import os
import uuid

from flask import Blueprint, request, session
from werkzeug.utils import secure_filename

import config
from repositories.hr_repository import (
    LeaveRepository, OvertimeRepository, IncrementRepository,
    PayrollRepository, EmployeeDocumentRepository,
)
from repositories.teacher_repository import TeacherRepository
from services.hr_service import (
    HRService, HRValidationError, HRNotFoundError, TeacherNotFoundError,
)
from utils.auth import require_role
from utils.response import success_response, error_response

hr_bp = Blueprint('hr', __name__)

hr_service = HRService(
    LeaveRepository(), OvertimeRepository(), IncrementRepository(),
    PayrollRepository(), EmployeeDocumentRepository(), TeacherRepository()
)


def _handle(fn, *args, success_status=200, success_message=None, **kwargs):
    """Small shared wrapper so every route doesn't repeat the same
    try/except HRValidationError / HRNotFoundError / TeacherNotFoundError
    dance."""
    try:
        result = fn(*args, **kwargs)
        return result
    except HRValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except TeacherNotFoundError as e:
        return error_response(str(e), status=404)
    except HRNotFoundError as e:
        return error_response(str(e), status=404)


# ==================== LEAVE APPLICATION / APPROVAL ====================
@hr_bp.route('/api/hr/leave', methods=['GET'])
@require_role('accountant')
def api_list_leave():
    def run():
        data = hr_service.list_leave_applications(
            teacher_id=request.args.get('teacher_id', '').strip(),
            status=request.args.get('status', '').strip(),
            leave_type=request.args.get('leave_type', '').strip(),
            date_from=request.args.get('date_from', '').strip(),
            date_to=request.args.get('date_to', '').strip(),
        )
        return success_response({"applications": data, "count": len(data)})
    return _handle(run)


@hr_bp.route('/api/hr/leave', methods=['POST'])
@require_role('accountant')
def api_apply_leave():
    def run():
        new_id = hr_service.apply_leave(request.json or {})
        return success_response({"id": new_id}, message="Leave application submitted", status=201)
    return _handle(run)


@hr_bp.route('/api/hr/leave/<int:leave_id>/approve', methods=['PUT'])
@require_role('admin')
def api_approve_leave(leave_id):
    def run():
        remarks = (request.json or {}).get('remarks', '')
        hr_service.approve_leave(leave_id, session.get('username'), remarks)
        return success_response(message="Leave application approved")
    return _handle(run)


@hr_bp.route('/api/hr/leave/<int:leave_id>/reject', methods=['PUT'])
@require_role('admin')
def api_reject_leave(leave_id):
    def run():
        remarks = (request.json or {}).get('remarks', '')
        hr_service.reject_leave(leave_id, session.get('username'), remarks)
        return success_response(message="Leave application rejected")
    return _handle(run)


@hr_bp.route('/api/hr/leave/<int:leave_id>/cancel', methods=['PUT'])
@require_role('accountant')
def api_cancel_leave(leave_id):
    def run():
        hr_service.cancel_leave(leave_id)
        return success_response(message="Leave application cancelled")
    return _handle(run)


# ==================== OVERTIME ====================
@hr_bp.route('/api/hr/overtime', methods=['GET'])
@require_role('accountant')
def api_list_overtime():
    def run():
        data = hr_service.list_overtime(
            teacher_id=request.args.get('teacher_id', '').strip(),
            status=request.args.get('status', '').strip(),
            date_from=request.args.get('date_from', '').strip(),
            date_to=request.args.get('date_to', '').strip(),
        )
        return success_response({"entries": data, "count": len(data)})
    return _handle(run)


@hr_bp.route('/api/hr/overtime', methods=['POST'])
@require_role('accountant')
def api_add_overtime():
    def run():
        new_id = hr_service.add_overtime(request.json or {})
        return success_response({"id": new_id}, message="Overtime entry recorded", status=201)
    return _handle(run)


@hr_bp.route('/api/hr/overtime/<int:overtime_id>/approve', methods=['PUT'])
@require_role('admin')
def api_approve_overtime(overtime_id):
    def run():
        hr_service.approve_overtime(overtime_id, session.get('username'))
        return success_response(message="Overtime approved")
    return _handle(run)


@hr_bp.route('/api/hr/overtime/<int:overtime_id>/reject', methods=['PUT'])
@require_role('admin')
def api_reject_overtime(overtime_id):
    def run():
        hr_service.reject_overtime(overtime_id, session.get('username'))
        return success_response(message="Overtime rejected")
    return _handle(run)


@hr_bp.route('/api/hr/overtime/<int:overtime_id>', methods=['DELETE'])
@require_role('accountant')
def api_delete_overtime(overtime_id):
    def run():
        hr_service.delete_overtime(overtime_id)
        return success_response(message="Overtime entry deleted")
    return _handle(run)


# ==================== INCREMENTS ====================
@hr_bp.route('/api/hr/increments', methods=['GET'])
@require_role('accountant')
def api_list_increments():
    def run():
        data = hr_service.list_increments(teacher_id=request.args.get('teacher_id', '').strip())
        return success_response({"increments": data, "count": len(data)})
    return _handle(run)


@hr_bp.route('/api/hr/increments', methods=['POST'])
@require_role('admin')
def api_add_increment():
    def run():
        new_id, new_salary = hr_service.add_increment(request.json or {}, approved_by=session.get('username'))
        return success_response({"id": new_id, "new_salary": new_salary},
                                 message="Increment recorded and salary updated", status=201)
    return _handle(run)


# ==================== PAYROLL / SALARY SLIP ====================
@hr_bp.route('/api/hr/payroll/generate', methods=['POST'])
@require_role('admin')
def api_generate_payroll():
    def run():
        result = hr_service.generate_payroll(request.json or {}, generated_by=session.get('username'))
        return success_response(result, message=f"Payroll generated for {len(result['generated'])} employee(s)")
    return _handle(run)


@hr_bp.route('/api/hr/payroll', methods=['GET'])
@require_role('accountant')
def api_list_payroll():
    def run():
        data = hr_service.list_payroll(
            month=request.args.get('month', '').strip(),
            year=request.args.get('year', '').strip(),
            teacher_id=request.args.get('teacher_id', '').strip(),
            status=request.args.get('status', '').strip(),
        )
        total = sum(r["net_salary"] for r in data)
        return success_response({"records": data, "count": len(data), "total_net": round(total, 2)})
    return _handle(run)


@hr_bp.route('/api/hr/payroll/<int:payroll_id>', methods=['GET'])
@require_role('accountant')
def api_get_payroll(payroll_id):
    def run():
        record = hr_service.get_payroll(payroll_id)
        return success_response({"record": record})
    return _handle(run)


@hr_bp.route('/api/hr/payroll/<int:payroll_id>', methods=['PUT'])
@require_role('accountant')
def api_update_payroll(payroll_id):
    def run():
        net_salary = hr_service.update_payroll(payroll_id, request.json or {})
        return success_response({"net_salary": net_salary}, message="Payroll record updated")
    return _handle(run)


@hr_bp.route('/api/hr/payroll/<int:payroll_id>', methods=['DELETE'])
@require_role('admin')
def api_delete_payroll(payroll_id):
    def run():
        hr_service.delete_payroll(payroll_id)
        return success_response(message="Payroll record deleted")
    return _handle(run)


@hr_bp.route('/api/hr/payroll/<int:payroll_id>/mark-paid', methods=['PUT'])
@require_role('admin')
def api_mark_payroll_paid(payroll_id):
    def run():
        body = request.json or {}
        hr_service.mark_payroll_paid(payroll_id, body.get('payment_date'), body.get('payment_method', 'Cash'))
        return success_response(message="Payroll marked as Paid")
    return _handle(run)


# ==================== EMPLOYEE DOCUMENTS ====================
def _allowed_document_ext(filename):
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    return (ext in config.EMPLOYEE_DOCUMENT_ALLOWED_EXTENSIONS), ext


@hr_bp.route('/api/hr/documents', methods=['GET'])
@require_role('accountant')
def api_list_documents():
    def run():
        data = hr_service.list_documents(
            teacher_id=request.args.get('teacher_id', '').strip(),
            document_type=request.args.get('document_type', '').strip(),
        )
        return success_response({"documents": data, "count": len(data)})
    return _handle(run)


@hr_bp.route('/api/hr/documents', methods=['POST'])
@require_role('accountant')
def api_upload_document():
    teacher_id = request.form.get('teacher_id', '')
    document_type = request.form.get('document_type', '')
    document_name = request.form.get('document_name', '')
    expiry_date = request.form.get('expiry_date', '')
    notes = request.form.get('notes', '')

    file = request.files.get('file')
    if not file or not file.filename:
        return error_response("No file provided", status=400)

    ok, ext = _allowed_document_ext(file.filename)
    if not ok:
        return error_response(
            f"Unsupported file type. Allowed: {', '.join(sorted(config.EMPLOYEE_DOCUMENT_ALLOWED_EXTENSIONS))}",
            status=400
        )

    contents = file.read()
    if len(contents) > config.EMPLOYEE_DOCUMENT_MAX_BYTES:
        max_mb = config.EMPLOYEE_DOCUMENT_MAX_BYTES / (1024 * 1024)
        return error_response(f"File is too large — max {max_mb:.0f}MB", status=400)

    filename = secure_filename(f"{teacher_id}_{uuid.uuid4().hex[:8]}.{ext}")
    filepath = os.path.join(config.UPLOADS_EMPLOYEES_DIR, filename)

    def run():
        try:
            with open(filepath, 'wb') as f:
                f.write(contents)
        except OSError as e:
            raise HRValidationError([f"Failed to save file: {e}"])

        new_id = hr_service.add_document(
            {
                "teacher_id": teacher_id, "document_type": document_type,
                "document_name": document_name, "expiry_date": expiry_date, "notes": notes,
            },
            file_path=f"/uploads/employees/{filename}",
            uploaded_by=session.get('username'),
        )
        return success_response({"id": new_id}, message="Document uploaded successfully", status=201)

    return _handle(run)


@hr_bp.route('/api/hr/documents/<int:doc_id>', methods=['DELETE'])
@require_role('accountant')
def api_delete_document(doc_id):
    def run():
        doc = hr_service.delete_document(doc_id)
        if doc.get("file_path"):
            abs_path = os.path.join(config.UPLOADS_DIR, doc["file_path"].replace("/uploads/", "", 1))
            if os.path.exists(abs_path):
                try:
                    os.remove(abs_path)
                except OSError:
                    pass
        return success_response(message="Document deleted")
    return _handle(run)
