"""
Data Import routes (Blueprint). Thin HTTP layer — all logic lives in
services/import_service.py.

Lets an admin bring Students, Classes, Teachers, or Fees in from an
Excel file exported from another system (or filled in by hand using the
downloadable template).
"""
import os
import tempfile

from flask import Blueprint, request, send_file, session

from repositories.student_repository import StudentRepository
from repositories.class_repository import ClassRepository
from repositories.teacher_repository import TeacherRepository
from repositories.fee_repository import FeeRepository
from repositories.charity_fund_repository import CharityFundRepository
from repositories.accounts_repository import (
    ChartOfAccountRepository, VoucherRepository, AccountsReportRepository,
)
from services.student_service import StudentService
from services.class_service import ClassService
from services.teacher_service import TeacherService
from services.fee_service import FeeService
from services.charity_fund_service import CharityFundService
from services.accounts_service import AccountsService
from services.fee_accounting_service import FeeAccountingService
from services.import_service import ImportService, ImportEntityNotSupportedError
from utils.auth import require_role
from utils.response import success_response, error_response

import_bp = Blueprint('import_data', __name__)

# Reuse the same service layer everything else uses, so an imported row
# gets identical validation/side-effects (fee accounting sync included)
# to one entered by hand through the UI.
accounts_service = AccountsService(
    ChartOfAccountRepository(), VoucherRepository(), AccountsReportRepository()
)
fee_accounting_service = FeeAccountingService(accounts_service)
charity_fund_service = CharityFundService(CharityFundRepository())

import_service = ImportService(
    student_service=StudentService(StudentRepository()),
    class_service=ClassService(ClassRepository()),
    teacher_service=TeacherService(TeacherRepository()),
    fee_service=FeeService(
        FeeRepository(),
        charity_fund_service=charity_fund_service,
        fee_accounting_service=fee_accounting_service,
    ),
)

ALLOWED_ENTITIES = ("students", "classes", "teachers", "fees")


@import_bp.route('/api/import/template/<entity>', methods=['GET'])
@require_role('admin')
def api_import_template(entity):
    if entity not in ALLOWED_ENTITIES:
        return error_response(f"Unknown import type: {entity}", status=404)
    try:
        wb = import_service.generate_template(entity)
        fd, temp_path = tempfile.mkstemp(suffix=".xlsx")
        os.close(fd)
        wb.save(temp_path)
        return send_file(
            temp_path,
            as_attachment=True,
            download_name=f"{entity}_import_template.xlsx",
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except ImportEntityNotSupportedError as e:
        return error_response(str(e), status=404)


@import_bp.route('/api/import/<entity>', methods=['POST'])
@require_role('admin')
def api_import_run(entity):
    if entity not in ALLOWED_ENTITIES:
        return error_response(f"Unknown import type: {entity}", status=404)

    uploaded_file = request.files.get('import_file')
    if not uploaded_file or not uploaded_file.filename:
        return error_response("Please choose an Excel (.xlsx) file to import.", status=400)
    if not uploaded_file.filename.lower().endswith(('.xlsx', '.xlsm')):
        return error_response("Only .xlsx Excel files are supported.", status=400)

    temp_path = None
    try:
        fd, temp_path = tempfile.mkstemp(suffix=".xlsx")
        os.close(fd)
        uploaded_file.save(temp_path)

        result = import_service.run_import(entity, temp_path, created_by=session.get('username'))
        msg = f"Imported {result['imported']} of {result['total_rows']} row(s)"
        if result['skipped']:
            msg += f", {result['skipped']} skipped as duplicates"
        error_count = len(result['errors']) - result['skipped']
        if error_count > 0:
            msg += f", {error_count} failed"
        return success_response(result, message=msg)
    except ImportEntityNotSupportedError as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(f"Import failed: {e}", status=500)
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
