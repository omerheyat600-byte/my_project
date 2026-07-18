"""
Fee Accounting service — bridges the Fees module to the Accounts module so
that receiving/adjusting a fee payment automatically posts a balanced
double-entry voucher (Receipt/Payment) against the right per-fee-type
Income account and the right Cash/Bank account, without staff ever having
to create a voucher by hand.

Design notes (why it's built this way):

  * DELTA-BASED — a fee's `paid_amount` is an absolute value that staff
    can edit (not an append-only "add payment" log), so this service
    tracks how much of it has already been posted to the ledger
    (fee_payment_postings) and only posts the DIFFERENCE each time a fee
    is saved. This is what makes it safe to call on every create/update
    without ever double-posting the same rupee.

  * REVERSIBLE, NEVER EDITED — reducing paid_amount, deleting a fee, or
    waiving a previously-paid fee posts a new reversing voucher instead
    of editing/deleting the original one. Vouchers are treated as an
    immutable audit trail, same as a real accountant would never tear a
    page out of a cash book.

  * TRACEABLE — every voucher this service posts carries
    reference_no='FEE-<id>', so it can be traced back to its fee record
    even if the fee_payment_postings row is ever lost.

  * NON-BLOCKING — if the required accounts can't be resolved (e.g. the
    matching income account was deactivated in Chart of Accounts), the
    fee save itself is NOT blocked. The gap is logged so an accountant
    can fix Chart of Accounts and re-sync later via sync_all().
"""
from datetime import date

from services.accounts_service import AccountsService, VoucherValidationError
from repositories.fee_payment_posting_repository import FeePaymentPostingRepository
from utils.logger import get_logger

logger = get_logger(__name__)

# fee_type -> Chart of Accounts code for its Income account. Matched
# case-insensitively, and by substring, so variants like "Tuition Fee
# (Carry Forward)" still map to Tuition Fee Income. Anything that matches
# nothing falls back to DEFAULT_INCOME_ACCOUNT_CODE ("Other Income").
FEE_TYPE_INCOME_ACCOUNT_CODES = {
    "tuition fee": "4001",
    "admission fee": "4002",
    "transport fee": "4004",
    "exam fee": "4005",
    "books fee": "4006",
    "lab fee": "4007",
}
DEFAULT_INCOME_ACCOUNT_CODE = "4003"  # Other Income

# payment_method -> Chart of Accounts code for the Cash/Bank (Asset) side.
PAYMENT_METHOD_ACCOUNT_CODES = {
    "cash": "1001",
    "bank": "1002",
    "jazzcash": "1002",
    "online": "1002",
}
DEFAULT_CASH_BANK_ACCOUNT_CODE = "1001"  # Cash in Hand


class FeeAccountingService:

    def __init__(self, accounts_service: AccountsService,
                 posting_repository: FeePaymentPostingRepository = None):
        self.accounts_service = accounts_service
        self.posting_repository = posting_repository or FeePaymentPostingRepository()

    # ---------- Account resolution ----------

    def _resolve_income_account_id(self, fee_type):
        code = DEFAULT_INCOME_ACCOUNT_CODE
        key = (fee_type or "").strip().lower()
        if key in FEE_TYPE_INCOME_ACCOUNT_CODES:
            code = FEE_TYPE_INCOME_ACCOUNT_CODES[key]
        else:
            for name, mapped_code in FEE_TYPE_INCOME_ACCOUNT_CODES.items():
                if name in key:
                    code = mapped_code
                    break
        account = self.accounts_service.coa_repository.find_by_code(code)
        if not account or not account.get("is_active"):
            account = self.accounts_service.coa_repository.find_by_code(DEFAULT_INCOME_ACCOUNT_CODE)
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

    def sync_fee_payment(self, fee, created_by=None):
        """
        Call after a fee row is created or updated. Compares fee['paid_amount']
        against what's already been posted to the ledger for this fee and
        posts a Receipt (or reversing Payment) voucher for the DIFFERENCE
        only. Safe to call on every save — a no-op if nothing changed.

        `fee` should be the fresh dict as read back from FeeRepository
        (needs at least: id, fee_type, paid_amount, payment_method,
        student_name, month, paid_date).
        """
        fee_id = fee.get("id")
        if not fee_id:
            return None

        new_paid = float(fee.get("paid_amount") or 0)
        already_posted = self.posting_repository.get_total_posted(fee_id)
        delta = round(new_paid - already_posted, 2)

        if abs(delta) < 0.01:
            return None

        income_account_id = self._resolve_income_account_id(fee.get("fee_type"))
        cash_bank_account_id = self._resolve_cash_bank_account_id(fee.get("payment_method"))

        if not income_account_id or not cash_bank_account_id:
            logger.warning(
                f"Fee accounting: could not resolve accounts for fee #{fee_id} "
                f"(fee_type={fee.get('fee_type')!r}, payment_method={fee.get('payment_method')!r}) "
                f"— skipping auto-post. This amount stays unposted until Chart of Accounts "
                f"has an active Cash/Bank account and an Income account, then re-sync."
            )
            return None

        student_label = fee.get("student_name") or fee.get("student_id") or ""
        narration = (
            f"Fee {'received' if delta > 0 else 'payment adjustment reversed'}: "
            f"{fee.get('fee_type')} - {student_label} ({fee.get('month') or ''})"
        )
        # Positive delta (new/increased payment): backdate the Receipt to
        # the fee's own paid_date when available, so historical fees
        # synced later don't all pile up as "today" in the Cash Book.
        # Negative delta (reversal): always dated today — that's when the
        # reversal actually happens.
        voucher_date = (
            (fee.get("paid_date") or date.today().isoformat())
            if delta > 0 else date.today().isoformat()
        )

        voucher_data = {
            "voucher_date": voucher_date,
            "party_name": student_label,
            "narration": narration,
            "reference_no": f"FEE-{fee_id}",
            "cash_bank_account_id": cash_bank_account_id,
            "lines": [{
                "account_id": income_account_id,
                "amount": abs(delta),
                "particulars": narration,
            }],
        }

        try:
            if delta > 0:
                voucher_id, voucher_no = self.accounts_service.create_receipt_voucher(voucher_data, created_by)
            else:
                voucher_id, voucher_no = self.accounts_service.create_payment_voucher(voucher_data, created_by)
        except VoucherValidationError as e:
            logger.warning(f"Fee accounting: voucher creation failed for fee #{fee_id}: {e}")
            return None

        self.posting_repository.create(fee_id, voucher_id, delta)
        logger.info(f"Fee accounting: {voucher_no} posted for fee #{fee_id} (delta {delta})")
        return voucher_id

    def reverse_fee(self, fee, created_by=None):
        """
        Call BEFORE deleting a fee record. Posts a full reversing voucher
        for whatever net amount is currently posted against this fee, so
        the ledger reflects the deletion instead of silently keeping a
        stale income/cash entry with no fee behind it.
        """
        if not fee or not fee.get("id"):
            return None
        reversal_fee = dict(fee)
        reversal_fee["paid_amount"] = 0
        return self.sync_fee_payment(reversal_fee, created_by)

    def sync_all(self, fees, created_by=None):
        """
        One-time / on-demand backfill: run sync_fee_payment across every
        fee record passed in (e.g. all existing fees from before this
        integration existed). Already-synced fees are untouched (delta
        will be 0). Returns how many vouchers were newly posted.
        """
        posted = 0
        for fee in fees:
            voucher_id = self.sync_fee_payment(fee, created_by)
            if voucher_id:
                posted += 1
        return posted
