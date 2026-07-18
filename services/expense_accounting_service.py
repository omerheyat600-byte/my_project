"""
Expense Accounting service — bridges the Expenses module to the Accounts
module so that recording/editing an expense automatically posts a
balanced double-entry voucher (Payment) against the right per-category
Expense account and the right Cash/Bank account, without staff ever
having to create a voucher by hand.

Same design as FeeAccountingService (see that file for the fuller
rationale) — the short version:

  * DELTA-BASED — tracks how much of an expense's `amount` has already
    been posted (expense_payment_postings) and only posts the
    DIFFERENCE each time an expense is saved. Safe to call on every
    create/update without ever double-posting the same rupee.

  * REVERSIBLE, NEVER EDITED — editing an expense down or deleting it
    posts a new reversing voucher instead of touching the original one.

  * TRACEABLE — every voucher carries reference_no='EXP-<id>'.

  * NON-BLOCKING — if the required accounts can't be resolved, the
    expense save itself is NOT blocked; the gap is logged and can be
    fixed via sync_all() once Chart of Accounts is corrected.
"""
from datetime import date

from services.accounts_service import AccountsService, VoucherValidationError
from repositories.expense_payment_posting_repository import ExpensePaymentPostingRepository
from utils.logger import get_logger

logger = get_logger(__name__)

# expense category -> Chart of Accounts code for its Expense account.
# Matched case-insensitively. Anything unmapped (e.g. "Events", which has
# no dedicated COA line) falls back to DEFAULT_EXPENSE_ACCOUNT_CODE.
EXPENSE_CATEGORY_ACCOUNT_CODES = {
    "salaries": "5001",
    "utilities": "5002",
    "maintenance": "5003",
    "stationery": "5004",
    "transport": "5005",
}
DEFAULT_EXPENSE_ACCOUNT_CODE = "5006"  # Other Expense

# payment_method -> Chart of Accounts code for the Cash/Bank (Asset) side.
# Same mapping FeeAccountingService uses, kept as its own copy here so
# the two bridges stay independent (one module's Chart of Accounts
# hiccup shouldn't require touching the other's code).
PAYMENT_METHOD_ACCOUNT_CODES = {
    "cash": "1001",
    "bank": "1002",
    "bank transfer": "1002",
    "cheque": "1002",
    "online": "1002",
    "jazzcash": "1002",
}
DEFAULT_CASH_BANK_ACCOUNT_CODE = "1001"  # Cash in Hand


class ExpenseAccountingService:

    def __init__(self, accounts_service: AccountsService,
                 posting_repository: ExpensePaymentPostingRepository = None):
        self.accounts_service = accounts_service
        self.posting_repository = posting_repository or ExpensePaymentPostingRepository()

    # ---------- Account resolution ----------

    def _resolve_expense_account_id(self, category):
        code = EXPENSE_CATEGORY_ACCOUNT_CODES.get(
            (category or "").strip().lower(), DEFAULT_EXPENSE_ACCOUNT_CODE
        )
        account = self.accounts_service.coa_repository.find_by_code(code)
        if not account or not account.get("is_active"):
            account = self.accounts_service.coa_repository.find_by_code(DEFAULT_EXPENSE_ACCOUNT_CODE)
        return account["id"] if account else None

    def _resolve_cash_bank_account_id(self, payment_method):
        code = PAYMENT_METHOD_ACCOUNT_CODES.get(
            (payment_method or "").strip().lower(), DEFAULT_CASH_BANK_ACCOUNT_CODE
        )
        account = self.accounts_service.coa_repository.find_by_code(code)
        if not account or not account.get("is_active"):
            account = self.accounts_service.coa_repository.find_by_code(DEFAULT_CASH_BANK_ACCOUNT_CODE)
        return account["id"] if account else None

    # ---------- Posting ----------

    def sync_expense_payment(self, expense, created_by=None):
        """
        Call after an expense row is created or updated. Compares
        expense['amount'] against what's already been posted to the
        ledger for this expense and posts a Payment (or reversing
        Receipt) voucher for the DIFFERENCE only. Safe to call on every
        save — a no-op if nothing changed.

        `expense` should be the fresh dict as read back from
        ExpenseRepository (needs at least: id, category, description,
        amount, payment_method, date).
        """
        expense_id = expense.get("id")
        if not expense_id:
            return None, None

        new_amount = float(expense.get("amount") or 0)
        already_posted = self.posting_repository.get_total_posted(expense_id)
        delta = round(new_amount - already_posted, 2)

        if abs(delta) < 0.01:
            return None, None

        expense_account_id = self._resolve_expense_account_id(expense.get("category"))
        cash_bank_account_id = self._resolve_cash_bank_account_id(expense.get("payment_method"))

        if not expense_account_id or not cash_bank_account_id:
            warning = (
                f"PKR {abs(delta):,.2f} could not be posted to Accounts for this expense — "
                f"no active Expense/Cash-Bank account was found for category "
                f"'{expense.get('category')}' / payment method '{expense.get('payment_method')}'. "
                f"Fix Chart of Accounts, then use 'Sync to Accounts' to post it."
            )
            logger.warning(f"Expense accounting: {warning} (expense #{expense_id})")
            return None, warning

        narration = (
            f"Expense {'recorded' if delta > 0 else 'adjustment reversed'}: "
            f"{expense.get('category')}" + (f" - {expense.get('description')}" if expense.get('description') else "")
        )
        # Positive delta (new/increased expense): backdate the Payment to
        # the expense's own date when available. Negative delta
        # (reversal): always dated today.
        voucher_date = (
            (expense.get("date") or date.today().isoformat())
            if delta > 0 else date.today().isoformat()
        )

        voucher_data = {
            "voucher_date": voucher_date,
            "party_name": expense.get("reference_no") or "",
            "narration": narration,
            "reference_no": f"EXP-{expense_id}",
            "cash_bank_account_id": cash_bank_account_id,
            "lines": [{
                "account_id": expense_account_id,
                "amount": abs(delta),
                "particulars": narration,
            }],
        }

        try:
            if delta > 0:
                voucher_id, voucher_no = self.accounts_service.create_payment_voucher(voucher_data, created_by)
            else:
                voucher_id, voucher_no = self.accounts_service.create_receipt_voucher(voucher_data, created_by)
        except VoucherValidationError as e:
            warning = f"PKR {abs(delta):,.2f} could not be posted to Accounts: {e}"
            logger.warning(f"Expense accounting: voucher creation failed for expense #{expense_id}: {e}")
            return None, warning

        self.posting_repository.create(expense_id, voucher_id, delta)
        logger.info(f"Expense accounting: {voucher_no} posted for expense #{expense_id} (delta {delta})")
        return voucher_id, None

    def reverse_expense(self, expense, created_by=None):
        """
        Call BEFORE deleting an expense record. Posts a full reversing
        voucher for whatever net amount is currently posted against this
        expense, so the ledger reflects the deletion instead of silently
        keeping a stale expense/cash entry with no record behind it.
        """
        if not expense or not expense.get("id"):
            return None, None
        reversal_expense = dict(expense)
        reversal_expense["amount"] = 0
        return self.sync_expense_payment(reversal_expense, created_by)

    def sync_all(self, expenses, created_by=None):
        """
        One-time / on-demand backfill: run sync_expense_payment across
        every expense record passed in (e.g. all existing expenses from
        before this integration existed). Already-synced expenses are
        untouched (delta will be 0). Returns (posted_count, warnings).
        """
        posted = 0
        warnings = []
        for expense in expenses:
            voucher_id, warning = self.sync_expense_payment(expense, created_by)
            if voucher_id:
                posted += 1
            if warning:
                warnings.append(f"Expense #{expense.get('id')}: {warning}")
        return posted, warnings
