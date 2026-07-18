"""
Expense service — business logic layer sitting between routes and the
expense repository.
"""
from datetime import datetime

from models.expense import Expense, EXPENSE_CATEGORIES
from repositories.expense_repository import ExpenseRepository
from services.expense_accounting_service import ExpenseAccountingService
from utils.validators import validate_expense_payload
from utils.logger import get_logger

logger = get_logger(__name__)


class ExpenseNotFoundError(Exception):
    pass


class ExpenseValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("; ".join(errors))


class ExpenseService:

    def __init__(self, repository: ExpenseRepository,
                 expense_accounting_service: ExpenseAccountingService = None):
        self.repository = repository
        self.expense_accounting_service = expense_accounting_service

    # ---------- Expense <-> Accounts sync ----------

    def _sync_accounting(self, eid, created_by=None):
        """Posts (or reverses) the ledger delta for this expense's current
        amount. No-op if no ExpenseAccountingService was wired in (e.g.
        older callers/tests that don't need Accounts integration).
        Returns a warning string if the posting was skipped/failed, so
        the caller can surface it instead of failing silently."""
        if not self.expense_accounting_service:
            return None
        fresh = self.repository.find_by_id(eid)
        if fresh:
            _, warning = self.expense_accounting_service.sync_expense_payment(fresh, created_by)
            return warning
        return None

    def sync_all_to_accounts(self, created_by=None):
        """
        One-time / on-demand backfill for expenses that were created
        before the Accounts integration existed. Safe to run anytime —
        already-posted expenses are untouched since their delta is 0.
        Returns (posted_count, warnings).
        """
        if not self.expense_accounting_service:
            return 0, []
        all_expenses = self.repository.find_all()
        return self.expense_accounting_service.sync_all(all_expenses, created_by)

    def list_expenses(self, query="", category_filter=""):
        expenses = self.repository.find_all(query, category_filter)
        total = sum(e["amount"] for e in expenses)
        return {
            "expenses": expenses,
            "total": total,
            "count": len(expenses),
            "categories": EXPENSE_CATEGORIES,
        }

    def create_expense(self, data, created_by=None):
        errors = validate_expense_payload(data)
        if errors:
            logger.warning(f"Expense validation failed: {errors} | payload={data}")
            raise ExpenseValidationError(errors)

        expense = Expense.from_dict(data)
        new_id = self.repository.create(expense)
        logger.info(f"Expense created: {new_id} ({expense.category}, {expense.amount})")
        warning = self._sync_accounting(new_id, created_by)
        return new_id, warning

    def update_expense(self, eid, data, created_by=None):
        errors = validate_expense_payload(data)
        if errors:
            logger.warning(f"Expense validation failed on update: {errors} | id={eid}")
            raise ExpenseValidationError(errors)

        if not self.repository.exists(eid):
            logger.warning(f"Expense update failed — not found: {eid}")
            raise ExpenseNotFoundError("Expense not found")

        expense = Expense.from_dict(data, id=eid)
        self.repository.update(eid, expense)
        logger.info(f"Expense updated: {eid}")
        warning = self._sync_accounting(eid, created_by)
        return warning

    def delete_expense(self, eid, created_by=None):
        if not self.repository.exists(eid):
            logger.warning(f"Expense delete failed — not found: {eid}")
            raise ExpenseNotFoundError("Expense not found")

        warning = None
        if self.expense_accounting_service:
            expense = self.repository.find_by_id(eid)
            _, warning = self.expense_accounting_service.reverse_expense(expense, created_by)

        self.repository.delete(eid)
        logger.info(f"Expense deleted: {eid}")
        return warning

    # ---------- Vouchers (printable receipts of already-recorded expenses) ----------

    def _build_voucher(self, expense):
        return {
            "id": expense["id"],
            "voucher_no": f"EXP-{int(expense['id']):06d}",
            "category": expense["category"],
            "description": expense.get("description"),
            "amount": expense["amount"],
            "payment_method": expense.get("payment_method"),
            "reference_no": expense.get("reference_no"),
            "date": expense.get("date"),
            "generated_on": datetime.now().strftime("%Y-%m-%d"),
        }

    def get_expense_voucher(self, eid):
        expense = self.repository.find_by_id(eid)
        if not expense:
            raise ExpenseNotFoundError("Expense not found")
        return self._build_voucher(expense)

    def get_bulk_expense_vouchers(self, category_filter="", date_from="", date_to=""):
        expenses = self.repository.find_all(
            category_filter=category_filter, date_from=date_from, date_to=date_to
        )
        return {
            "vouchers": [self._build_voucher(e) for e in expenses],
            "category": category_filter,
            "date_from": date_from,
            "date_to": date_to,
        }
