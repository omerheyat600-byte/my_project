"""
Accounts service — business logic layer sitting between routes and the
accounts repository. Owns voucher-number generation, the auto-construction
of balanced double-entry lines for Payment/Receipt vouchers, and Chart of
Accounts bookkeeping rules (e.g. system accounts can't be deleted).
"""
from models.account import ChartOfAccount, Voucher, VoucherEntry
from repositories.accounts_repository import (
    ChartOfAccountRepository, VoucherRepository, AccountsReportRepository,
)
from utils.validators import (
    validate_chart_of_account_payload,
    validate_journal_voucher_payload,
    validate_payment_receipt_payload,
)
from utils.logger import get_logger

logger = get_logger(__name__)


class AccountNotFoundError(Exception):
    pass


class AccountValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("; ".join(errors))


class AccountInUseError(Exception):
    pass


class VoucherNotFoundError(Exception):
    pass


class VoucherValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("; ".join(errors))


class VoucherInUseError(Exception):
    """Raised when trying to delete a voucher that was auto-posted from
    another module (e.g. a Fee payment) and is still linked there —
    deleting it directly would silently desync that module's ledger."""
    pass


class AccountsService:

    def __init__(self, coa_repository: ChartOfAccountRepository,
                 voucher_repository: VoucherRepository,
                 report_repository: AccountsReportRepository):
        self.coa_repository = coa_repository
        self.voucher_repository = voucher_repository
        self.report_repository = report_repository

    # ==================== CHART OF ACCOUNTS ====================
    def list_accounts(self, account_type="", category="", active_only=True, q=""):
        return self.coa_repository.find_all(account_type, category, active_only, q)

    def create_account(self, data):
        errors = validate_chart_of_account_payload(data)
        if errors:
            raise AccountValidationError(errors)
        if self.coa_repository.find_by_code(data.get("code").strip()):
            raise AccountValidationError([f"An account with code '{data['code']}' already exists"])

        account = ChartOfAccount.from_dict(data)
        new_id = self.coa_repository.create(account)
        logger.info(f"Chart of Accounts: created {account.code} ({account.name})")
        return new_id

    def update_account(self, account_id, data):
        existing = self.coa_repository.find_by_id(account_id)
        if not existing:
            raise AccountNotFoundError("Account not found")

        errors = validate_chart_of_account_payload(data)
        if errors:
            raise AccountValidationError(errors)

        dup = self.coa_repository.find_by_code(data.get("code").strip())
        if dup and dup["id"] != account_id:
            raise AccountValidationError([f"An account with code '{data['code']}' already exists"])

        account = ChartOfAccount.from_dict(data, id=account_id)
        account.is_system = bool(existing.get("is_system"))
        self.coa_repository.update(account_id, account)
        logger.info(f"Chart of Accounts: updated {account_id}")

    def delete_account(self, account_id):
        existing = self.coa_repository.find_by_id(account_id)
        if not existing:
            raise AccountNotFoundError("Account not found")
        if existing.get("is_system"):
            raise AccountInUseError("This is a system account and cannot be deleted")
        if self.coa_repository.is_in_use(account_id):
            raise AccountInUseError("This account has voucher entries posted against it and cannot be deleted")
        self.coa_repository.delete(account_id)
        logger.info(f"Chart of Accounts: deleted {account_id}")

    # ==================== VOUCHERS ====================
    def list_vouchers(self, voucher_type="", date_from="", date_to="", q="", include_voided=False):
        vouchers = self.voucher_repository.find_all(voucher_type, date_from, date_to, q, include_voided)
        total = sum(v["total_amount"] for v in vouchers if not v.get("is_voided"))
        return {"vouchers": vouchers, "count": len(vouchers), "total": round(total, 2)}

    def get_voucher(self, voucher_id):
        voucher = self.voucher_repository.find_by_id_with_entries(voucher_id)
        if not voucher:
            raise VoucherNotFoundError("Voucher not found")
        return voucher

    def create_journal_voucher(self, data, created_by=None):
        errors = validate_journal_voucher_payload(data)
        if errors:
            raise VoucherValidationError(errors)

        entries = [VoucherEntry.from_dict(e) for e in data["entries"]]
        total = round(sum(e.debit for e in entries), 2)
        voucher_no = self.voucher_repository.generate_voucher_no("Journal")

        voucher = Voucher(
            id=None, voucher_no=voucher_no, voucher_type="Journal",
            voucher_date=data["voucher_date"], party_name=data.get("party_name", ""),
            narration=data.get("narration", ""), reference_no=data.get("reference_no", ""),
            total_amount=total, created_by=created_by, entries=entries,
        )
        new_id = self.voucher_repository.create(voucher)
        logger.info(f"Journal Voucher created: {voucher_no} (PKR {total})")
        return new_id, voucher_no

    def _create_cash_bank_voucher(self, voucher_type, data, created_by=None):
        """Shared builder for Payment ('cash/bank out') and Receipt
        ('cash/bank in') vouchers: one leg against the chosen cash/bank
        account, one leg per line item against an income/expense/other
        account, always balanced by construction."""
        errors = validate_payment_receipt_payload(data)
        if errors:
            raise VoucherValidationError(errors)

        cash_bank_account_id = int(data["cash_bank_account_id"])
        total = round(sum(float(ln.get("amount", 0) or 0) for ln in data["lines"]), 2)

        entries = []
        for ln in data["lines"]:
            amount = round(float(ln.get("amount", 0) or 0), 2)
            particulars = ln.get("particulars") or data.get("narration") or ""
            if voucher_type == "Payment":
                entries.append(VoucherEntry(account_id=int(ln["account_id"]), debit=amount, credit=0, particulars=particulars))
            else:  # Receipt
                entries.append(VoucherEntry(account_id=int(ln["account_id"]), debit=0, credit=amount, particulars=particulars))

        cash_bank_particulars = data.get("narration") or (data.get("party_name") or "")
        if voucher_type == "Payment":
            entries.append(VoucherEntry(account_id=cash_bank_account_id, debit=0, credit=total, particulars=cash_bank_particulars))
        else:
            entries.append(VoucherEntry(account_id=cash_bank_account_id, debit=total, credit=0, particulars=cash_bank_particulars))

        voucher_no = self.voucher_repository.generate_voucher_no(voucher_type)
        voucher = Voucher(
            id=None, voucher_no=voucher_no, voucher_type=voucher_type,
            voucher_date=data["voucher_date"], party_name=data.get("party_name", ""),
            narration=data.get("narration", ""), reference_no=data.get("reference_no", ""),
            total_amount=total, created_by=created_by, entries=entries,
        )
        new_id = self.voucher_repository.create(voucher)
        logger.info(f"{voucher_type} Voucher created: {voucher_no} (PKR {total})")
        return new_id, voucher_no

    def create_payment_voucher(self, data, created_by=None):
        return self._create_cash_bank_voucher("Payment", data, created_by)

    def create_receipt_voucher(self, data, created_by=None):
        return self._create_cash_bank_voucher("Receipt", data, created_by)

    def void_voucher(self, voucher_id, reason=None, voided_by=None):
        """
        Soft-delete a voucher: marks it voided instead of removing it, so
        it drops out of Cash Book/Bank Book/Ledger/Trial Balance/P&L/
        Balance Sheet while the row (and its entries) stay on record for
        audit purposes — a real accountant never tears a page out of the
        cash book, they draw a line through it and note why.
        """
        if not self.voucher_repository.exists(voucher_id):
            raise VoucherNotFoundError("Voucher not found")
        if self.voucher_repository.is_linked_to_fee(voucher_id):
            # This voucher was auto-posted by the Fees module. Voiding it
            # here directly would make Accounts show the money as never
            # received while Fees still shows the record as paid — the
            # two modules would silently disagree about the same rupee.
            logger.warning(f"Voucher void blocked (linked to a fee): {voucher_id}")
            raise VoucherInUseError(
                "This voucher was auto-generated from a fee payment and can't be voided directly. "
                "To reverse it, void the fee record (or reduce its paid amount) instead — "
                "that will post a proper reversing voucher automatically."
            )
        if self.voucher_repository.is_linked_to_expense(voucher_id):
            # Same reasoning, for the Expenses module.
            logger.warning(f"Voucher void blocked (linked to an expense): {voucher_id}")
            raise VoucherInUseError(
                "This voucher was auto-generated from an expense record and can't be voided directly. "
                "To reverse it, edit or delete the expense record instead — "
                "that will post a proper reversing voucher automatically."
            )
        self.voucher_repository.void(voucher_id, reason, voided_by)
        logger.info(f"Voucher voided: {voucher_id} (reason={reason!r})")

    # ==================== REPORTS ====================
    def cash_book(self, date_from=None, date_to=None, account_id=None):
        return self.report_repository.cash_book(date_from, date_to, account_id)

    def bank_book(self, date_from=None, date_to=None, account_id=None):
        return self.report_repository.bank_book(date_from, date_to, account_id)

    def ledger(self, account_id, date_from=None, date_to=None):
        result = self.report_repository.ledger(account_id, date_from, date_to)
        if result is None:
            raise AccountNotFoundError("Account not found")
        return result

    def trial_balance(self, as_of_date=None):
        return self.report_repository.trial_balance(as_of_date)

    def profit_and_loss(self, date_from=None, date_to=None):
        return self.report_repository.profit_and_loss(date_from, date_to)

    def balance_sheet(self, as_of_date=None):
        return self.report_repository.balance_sheet(as_of_date)
