"""
Fee routes (Blueprint). Thin HTTP layer — all logic lives in
services/fee_service.py.
"""
from datetime import datetime
from flask import Blueprint, request, session

from repositories.fee_repository import FeeRepository
from repositories.charity_fund_repository import CharityFundRepository
from repositories.accounts_repository import (
    ChartOfAccountRepository, VoucherRepository, AccountsReportRepository,
)
from services.fee_service import (
    FeeService,
    FeeNotFoundError,
    FeeValidationError,
    ClassNotFoundForFeesError,
)
from services.charity_fund_service import (
    CharityFundService,
    CharityFundValidationError,
    InsufficientFundsError,
)
from services.accounts_service import AccountsService
from services.fee_accounting_service import FeeAccountingService
from utils.auth import require_role
from utils.response import success_response, error_response

fees_bp = Blueprint('fees', __name__)

fee_repository = FeeRepository()
charity_fund_repository = CharityFundRepository()
charity_fund_service = CharityFundService(charity_fund_repository)
# Fee <-> Accounts bridge: posts a Receipt/Payment voucher automatically
# whenever a fee's paid_amount changes, against per-fee-type Income
# accounts and the Cash/Bank account matching the payment method.
accounts_service = AccountsService(
    ChartOfAccountRepository(), VoucherRepository(), AccountsReportRepository()
)
fee_accounting_service = FeeAccountingService(accounts_service)
fee_service = FeeService(
    fee_repository,
    charity_fund_service=charity_fund_service,
    fee_accounting_service=fee_accounting_service,
)


@fees_bp.route('/api/fees', methods=['GET'])
@require_role('accountant')
def api_get_fees():
    q = request.args.get('q', '').strip()
    status_filter = request.args.get('status', '').strip()
    include_voided = request.args.get('include_voided', '').lower() in ('1', 'true', 'yes')
    result = fee_service.list_fees(q, status_filter, include_voided)
    return success_response(result)


@fees_bp.route('/api/fees', methods=['POST'])
@require_role('accountant')
def api_create_fee():
    data = request.json or {}
    try:
        created_ids = fee_service.create_fees(data, created_by=session.get('username'))
        return success_response(
            {"ids": created_ids},
            message=f"{len(created_ids)} fee records added successfully",
            status=201
        )
    except FeeValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except Exception as e:
        return error_response(str(e), status=500)


@fees_bp.route('/api/fees/<int:fid>', methods=['PUT'])
@require_role('accountant')
def api_update_fee(fid):
    data = request.json or {}
    try:
        fee_service.update_fee(fid, data, created_by=session.get('username'))
        return success_response(message="Fee record updated successfully")
    except FeeValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except FeeNotFoundError as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)


@fees_bp.route('/api/fees/<int:fid>', methods=['DELETE'])
@require_role('accountant')
def api_delete_fee(fid):
    try:
        body = request.get_json(silent=True) or {}
        reason = (body.get('reason') or '').strip() or None
        fee_service.void_fee(fid, reason=reason, created_by=session.get('username'))
        return success_response(message="Fee record voided successfully")
    except FeeNotFoundError as e:
        return error_response(str(e), status=404)


@fees_bp.route('/api/fees/generate', methods=['POST'])
@require_role('accountant')
def api_generate_fees():
    try:
        fee_service.generate_monthly_fees()
        return success_response(message="Monthly fees generated successfully")
    except Exception as e:
        return error_response(str(e), status=500)


@fees_bp.route('/api/fees/carry-forward', methods=['POST'])
@require_role('accountant')
def api_carry_forward_fees():
    try:
        added = fee_service.carry_forward_fees()
        return success_response({"added": added}, message=f"Carried forward {added} unpaid fees")
    except Exception as e:
        return error_response(str(e), status=500)


@fees_bp.route('/api/fees/accounts-sync', methods=['POST'])
@require_role('accountant')
def api_fees_accounts_sync():
    """
    One-time / on-demand backfill: posts ledger vouchers for any fee
    payment that hasn't been posted to Accounts yet (e.g. fees paid
    before this integration existed). Safe to run repeatedly — already
    posted fees are skipped.
    """
    try:
        posted = fee_service.sync_all_to_accounts(created_by=session.get('username'))
        return success_response({"posted": posted}, message=f"Synced {posted} fee payment(s) to Accounts")
    except Exception as e:
        return error_response(str(e), status=500)


@fees_bp.route('/api/fees/<int:fid>/postings', methods=['GET'])
@require_role('accountant')
def api_fee_postings(fid):
    """Returns the ledger vouchers auto-posted for this fee (audit trail)."""
    try:
        postings = fee_accounting_service.posting_repository.find_by_fee(fid)
        return success_response({"postings": postings})
    except Exception as e:
        return error_response(str(e), status=500)


@fees_bp.route('/api/fees/fine-settings', methods=['GET'])
@require_role('accountant')
def api_get_fine_settings():
    try:
        return success_response(fee_service.get_fine_settings())
    except Exception as e:
        return error_response(str(e), status=500)


@fees_bp.route('/api/fees/fine-settings', methods=['POST'])
@require_role('accountant')
def api_update_fine_settings():
    data = request.json or {}
    try:
        settings = fee_service.update_fine_settings(data)
        return success_response(settings, message="Fine settings updated successfully")
    except FeeValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except Exception as e:
        return error_response(str(e), status=500)


@fees_bp.route('/api/fees/recalculate-fines', methods=['POST'])
@require_role('accountant')
def api_recalculate_fines():
    try:
        result = fee_service.recalculate_fines()
        return success_response(
            result,
            message=f"Recalculated fines for {result['updated']} record(s)"
        )
    except Exception as e:
        return error_response(str(e), status=500)


@fees_bp.route('/api/fees/report', methods=['GET'])
@require_role('accountant')
def api_fees_report():
    month = request.args.get('month', '').strip()
    year = request.args.get('year', '').strip()
    class_name = request.args.get('class', '').strip()
    student_id = request.args.get('student_id', '').strip()
    status = request.args.get('status', '').strip()
    include_voided = request.args.get('include_voided', '').lower() in ('1', 'true', 'yes')
    try:
        report = fee_service.get_fees_report(month, year, class_name, student_id, status, include_voided)
        return success_response(report)
    except Exception as e:
        return error_response(str(e), status=500)


@fees_bp.route('/api/fees/voucher/student/<student_id>', methods=['GET'])
@require_role('accountant')
def api_get_student_voucher(student_id):
    month = request.args.get('month', '').strip()
    year = request.args.get('year', str(datetime.now().year)).strip()
    try:
        voucher = fee_service.get_student_voucher(student_id, month, year)
        return success_response(voucher)
    except FeeValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except FeeNotFoundError as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)


@fees_bp.route('/api/fees/vouchers/bulk', methods=['POST'])
@require_role('accountant')
def api_bulk_vouchers():
    data = request.json or {}
    class_name = data.get('class_name', '').strip()
    month = data.get('month', '').strip()
    year = data.get('year', str(datetime.now().year)).strip()
    try:
        vouchers = fee_service.get_bulk_vouchers(class_name, month, year)
        return success_response(vouchers)
    except FeeValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except ClassNotFoundForFeesError as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)


# ==================== CHARITY FUND ====================

@fees_bp.route('/api/fees/charity-fund/balance', methods=['GET'])
@require_role('accountant')
def api_charity_fund_balance():
    try:
        return success_response({"balance": charity_fund_service.get_balance()})
    except Exception as e:
        return error_response(str(e), status=500)


@fees_bp.route('/api/fees/charity-fund/ledger', methods=['GET'])
@require_role('accountant')
def api_charity_fund_ledger():
    try:
        return success_response(charity_fund_service.get_ledger())
    except Exception as e:
        return error_response(str(e), status=500)


@fees_bp.route('/api/fees/charity-fund/disburse', methods=['POST'])
@require_role('accountant')
def api_charity_fund_disburse():
    data = request.json or {}
    try:
        result = charity_fund_service.disburse(data, created_by=session.get('username'))
        return success_response(result, message="Disbursement recorded successfully", status=201)
    except CharityFundValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except InsufficientFundsError as e:
        return error_response(str(e), status=400)
    except Exception as e:
        return error_response(str(e), status=500)
