"""
Accounts Module routes (Blueprint). Thin HTTP layer — all logic lives in
services/accounts_service.py.

Covers: Chart of Accounts, Journal/Payment/Receipt Vouchers, Cash Book,
Bank Book, Ledger, Trial Balance, Profit & Loss, Balance Sheet.
"""
from flask import Blueprint, request, session

from repositories.accounts_repository import (
    ChartOfAccountRepository, VoucherRepository, AccountsReportRepository,
)
from services.accounts_service import (
    AccountsService,
    AccountNotFoundError, AccountValidationError, AccountInUseError,
    VoucherNotFoundError, VoucherValidationError, VoucherInUseError,
)
from utils.auth import require_role
from utils.response import success_response, error_response

accounts_bp = Blueprint('accounts', __name__)

accounts_service = AccountsService(
    ChartOfAccountRepository(), VoucherRepository(), AccountsReportRepository()
)


# ==================== CHART OF ACCOUNTS ====================
@accounts_bp.route('/api/accounts/chart', methods=['GET'])
@require_role('accountant')
def api_list_chart_of_accounts():
    account_type = request.args.get('account_type', '').strip()
    category = request.args.get('category', '').strip()
    q = request.args.get('q', '').strip()
    active_only = request.args.get('active_only', '1') != '0'
    accounts = accounts_service.list_accounts(account_type, category, active_only, q)
    return success_response({"accounts": accounts, "count": len(accounts)})


@accounts_bp.route('/api/accounts/chart', methods=['POST'])
@require_role('accountant')
def api_create_chart_of_account():
    data = request.json or {}
    try:
        new_id = accounts_service.create_account(data)
        return success_response({"id": new_id}, message="Account created successfully", status=201)
    except AccountValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except Exception as e:
        return error_response(str(e), status=500)


@accounts_bp.route('/api/accounts/chart/<int:account_id>', methods=['PUT'])
@require_role('accountant')
def api_update_chart_of_account(account_id):
    data = request.json or {}
    try:
        accounts_service.update_account(account_id, data)
        return success_response(message="Account updated successfully")
    except AccountValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except AccountNotFoundError as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)


@accounts_bp.route('/api/accounts/chart/<int:account_id>', methods=['DELETE'])
@require_role('accountant')
def api_delete_chart_of_account(account_id):
    try:
        accounts_service.delete_account(account_id)
        return success_response(message="Account deleted successfully")
    except AccountNotFoundError as e:
        return error_response(str(e), status=404)
    except AccountInUseError as e:
        return error_response(str(e), status=409)


# ==================== VOUCHERS ====================
@accounts_bp.route('/api/accounts/vouchers', methods=['GET'])
@require_role('accountant')
def api_list_vouchers():
    voucher_type = request.args.get('voucher_type', '').strip()
    date_from = request.args.get('date_from', '').strip()
    date_to = request.args.get('date_to', '').strip()
    q = request.args.get('q', '').strip()
    include_voided = request.args.get('include_voided', '').lower() in ('1', 'true', 'yes')
    result = accounts_service.list_vouchers(voucher_type, date_from, date_to, q, include_voided)
    return success_response(result)


@accounts_bp.route('/api/accounts/vouchers/<int:voucher_id>', methods=['GET'])
@require_role('accountant')
def api_get_voucher(voucher_id):
    try:
        voucher = accounts_service.get_voucher(voucher_id)
        return success_response({"voucher": voucher})
    except VoucherNotFoundError as e:
        return error_response(str(e), status=404)


@accounts_bp.route('/api/accounts/vouchers/journal', methods=['POST'])
@require_role('accountant')
def api_create_journal_voucher():
    data = request.json or {}
    try:
        new_id, voucher_no = accounts_service.create_journal_voucher(
            data, created_by=session.get('username')
        )
        return success_response({"id": new_id, "voucher_no": voucher_no},
                                 message="Journal voucher created successfully", status=201)
    except VoucherValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except Exception as e:
        return error_response(str(e), status=500)


@accounts_bp.route('/api/accounts/vouchers/payment', methods=['POST'])
@require_role('accountant')
def api_create_payment_voucher():
    data = request.json or {}
    try:
        new_id, voucher_no = accounts_service.create_payment_voucher(
            data, created_by=session.get('username')
        )
        return success_response({"id": new_id, "voucher_no": voucher_no},
                                 message="Payment voucher created successfully", status=201)
    except VoucherValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except Exception as e:
        return error_response(str(e), status=500)


@accounts_bp.route('/api/accounts/vouchers/receipt', methods=['POST'])
@require_role('accountant')
def api_create_receipt_voucher():
    data = request.json or {}
    try:
        new_id, voucher_no = accounts_service.create_receipt_voucher(
            data, created_by=session.get('username')
        )
        return success_response({"id": new_id, "voucher_no": voucher_no},
                                 message="Receipt voucher created successfully", status=201)
    except VoucherValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except Exception as e:
        return error_response(str(e), status=500)


@accounts_bp.route('/api/accounts/vouchers/<int:voucher_id>', methods=['DELETE'])
@require_role('accountant')
def api_delete_voucher(voucher_id):
    try:
        body = request.get_json(silent=True) or {}
        reason = (body.get('reason') or '').strip() or None
        accounts_service.void_voucher(voucher_id, reason=reason, voided_by=session.get('username'))
        return success_response(message="Voucher voided successfully")
    except VoucherNotFoundError as e:
        return error_response(str(e), status=404)
    except VoucherInUseError as e:
        return error_response(str(e), status=409)


# ==================== CASH BOOK / BANK BOOK ====================
@accounts_bp.route('/api/accounts/cash-book', methods=['GET'])
@require_role('accountant')
def api_cash_book():
    date_from = request.args.get('date_from', '').strip() or None
    date_to = request.args.get('date_to', '').strip() or None
    account_id = request.args.get('account_id', '').strip()
    result = accounts_service.cash_book(date_from, date_to, int(account_id) if account_id else None)
    return success_response(result)


@accounts_bp.route('/api/accounts/bank-book', methods=['GET'])
@require_role('accountant')
def api_bank_book():
    date_from = request.args.get('date_from', '').strip() or None
    date_to = request.args.get('date_to', '').strip() or None
    account_id = request.args.get('account_id', '').strip()
    result = accounts_service.bank_book(date_from, date_to, int(account_id) if account_id else None)
    return success_response(result)


# ==================== LEDGER ====================
@accounts_bp.route('/api/accounts/ledger/<int:account_id>', methods=['GET'])
@require_role('accountant')
def api_ledger(account_id):
    date_from = request.args.get('date_from', '').strip() or None
    date_to = request.args.get('date_to', '').strip() or None
    try:
        result = accounts_service.ledger(account_id, date_from, date_to)
        return success_response(result)
    except AccountNotFoundError as e:
        return error_response(str(e), status=404)


# ==================== TRIAL BALANCE / P&L / BALANCE SHEET ====================
@accounts_bp.route('/api/accounts/trial-balance', methods=['GET'])
@require_role('accountant')
def api_trial_balance():
    as_of_date = request.args.get('as_of_date', '').strip() or None
    return success_response(accounts_service.trial_balance(as_of_date))


@accounts_bp.route('/api/accounts/profit-loss', methods=['GET'])
@require_role('accountant')
def api_profit_loss():
    date_from = request.args.get('date_from', '').strip() or None
    date_to = request.args.get('date_to', '').strip() or None
    return success_response(accounts_service.profit_and_loss(date_from, date_to))


@accounts_bp.route('/api/accounts/balance-sheet', methods=['GET'])
@require_role('accountant')
def api_balance_sheet():
    as_of_date = request.args.get('as_of_date', '').strip() or None
    return success_response(accounts_service.balance_sheet(as_of_date))
