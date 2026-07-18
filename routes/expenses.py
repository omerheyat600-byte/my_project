"""
Expense routes (Blueprint). Thin HTTP layer — all logic lives in
services/expense_service.py.
"""
from flask import Blueprint, request, session

from repositories.expense_repository import ExpenseRepository
from repositories.accounts_repository import (
    ChartOfAccountRepository, VoucherRepository, AccountsReportRepository,
)
from services.expense_service import (
    ExpenseService,
    ExpenseNotFoundError,
    ExpenseValidationError,
)
from services.accounts_service import AccountsService
from services.expense_accounting_service import ExpenseAccountingService
from utils.auth import require_role
from utils.response import success_response, error_response

expenses_bp = Blueprint('expenses', __name__)

expense_repository = ExpenseRepository()
# Expense <-> Accounts bridge: posts a Payment voucher automatically
# whenever an expense is recorded/edited/deleted, against the matching
# per-category Expense account and the Cash/Bank account for the
# payment method — same pattern as the Fee <-> Accounts bridge.
accounts_service = AccountsService(
    ChartOfAccountRepository(), VoucherRepository(), AccountsReportRepository()
)
expense_accounting_service = ExpenseAccountingService(accounts_service)
expense_service = ExpenseService(expense_repository, expense_accounting_service=expense_accounting_service)


@expenses_bp.route('/api/expenses', methods=['GET'])
@require_role('accountant')
def api_get_expenses():
    q = request.args.get('q', '').strip()
    category_filter = request.args.get('category', '').strip()
    result = expense_service.list_expenses(q, category_filter)
    return success_response(result)


@expenses_bp.route('/api/expenses', methods=['POST'])
@require_role('accountant')
def api_create_expense():
    data = request.json or {}
    try:
        new_id, warning = expense_service.create_expense(data, created_by=session.get('username'))
        return success_response(
            {"id": new_id, "accounting_warning": warning},
            message="Expense added successfully", status=201
        )
    except ExpenseValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except Exception as e:
        return error_response(str(e), status=500)


@expenses_bp.route('/api/expenses/<int:eid>', methods=['PUT'])
@require_role('accountant')
def api_update_expense(eid):
    data = request.json or {}
    try:
        warning = expense_service.update_expense(eid, data, created_by=session.get('username'))
        return success_response({"accounting_warning": warning}, message="Expense updated successfully")
    except ExpenseValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except ExpenseNotFoundError as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)


@expenses_bp.route('/api/expenses/<int:eid>', methods=['DELETE'])
@require_role('accountant')
def api_delete_expense(eid):
    try:
        warning = expense_service.delete_expense(eid, created_by=session.get('username'))
        return success_response({"accounting_warning": warning}, message="Expense deleted successfully")
    except ExpenseNotFoundError as e:
        return error_response(str(e), status=404)


# ==================== EXPENSE <-> ACCOUNTS SYNC ====================

@expenses_bp.route('/api/expenses/accounts-sync', methods=['POST'])
@require_role('accountant')
def api_expenses_accounts_sync():
    """
    One-time / on-demand backfill: posts ledger vouchers for any expense
    that hasn't been posted to Accounts yet (e.g. expenses recorded
    before this integration existed). Safe to run repeatedly — already
    posted expenses are skipped.
    """
    try:
        posted, warnings = expense_service.sync_all_to_accounts(created_by=session.get('username'))
        msg = f"Synced {posted} expense(s) to Accounts"
        if warnings:
            msg += f" — {len(warnings)} could not be posted (see details)"
        return success_response({"posted": posted, "warnings": warnings}, message=msg)
    except Exception as e:
        return error_response(str(e), status=500)


@expenses_bp.route('/api/expenses/<int:eid>/postings', methods=['GET'])
@require_role('accountant')
def api_expense_postings(eid):
    """Returns the ledger vouchers auto-posted for this expense (audit trail)."""
    try:
        postings = expense_accounting_service.posting_repository.find_by_expense(eid)
        return success_response({"postings": postings})
    except Exception as e:
        return error_response(str(e), status=500)


# ==================== VOUCHERS (printable receipts) ====================

@expenses_bp.route('/api/expenses/voucher/<int:eid>', methods=['GET'])
@require_role('accountant')
def api_get_expense_voucher(eid):
    try:
        voucher = expense_service.get_expense_voucher(eid)
        return success_response(voucher)
    except ExpenseNotFoundError as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)


@expenses_bp.route('/api/expenses/vouchers/bulk', methods=['GET'])
@require_role('accountant')
def api_bulk_expense_vouchers():
    category_filter = request.args.get('category', '').strip()
    date_from = request.args.get('date_from', '').strip()
    date_to = request.args.get('date_to', '').strip()
    try:
        result = expense_service.get_bulk_expense_vouchers(category_filter, date_from, date_to)
        return success_response(result)
    except Exception as e:
        return error_response(str(e), status=500)
