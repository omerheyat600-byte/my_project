"""
Charity Fund service — business logic for the charity fund ledger.

The fund is credited automatically (by FeeService) whenever a fee's
late fine is fully paid off, and debited manually here via a
disbursement, which is validated against the current balance so the
fund can never go negative.
"""
from repositories.charity_fund_repository import CharityFundRepository
from utils.logger import get_logger

logger = get_logger(__name__)


class CharityFundValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("; ".join(errors))


class InsufficientFundsError(Exception):
    pass


class CharityFundService:

    def __init__(self, repository: CharityFundRepository = None):
        self.repository = repository or CharityFundRepository()

    def get_balance(self):
        return self.repository.get_balance()

    def get_ledger(self, limit=None):
        entries = self.repository.find_all(limit)
        return {
            "entries": entries,
            "balance": self.repository.get_balance(),
        }

    def credit_fine(self, fee_id, amount, created_by=None):
        """Called by FeeService when a fee's fine has been fully paid.
        Not exposed via a route — internal, service-to-service call."""
        if not amount or amount <= 0:
            return None
        description = f"Late fine credited from fee #{fee_id}"
        entry_id, balance = self.repository.add_entry(
            "Credit", amount, "Fine Credit", fee_id, description, created_by
        )
        logger.info(f"Charity fund credited {amount} from fee #{fee_id}; new balance {balance}")
        return entry_id

    def disburse(self, data, created_by=None):
        errors = []
        try:
            amount = float(data.get("amount", 0))
        except (TypeError, ValueError):
            amount = None
            errors.append("amount must be a number")

        description = (data.get("description") or "").strip()
        if not description:
            errors.append("description is required")

        if amount is not None and amount <= 0:
            errors.append("amount must be greater than zero")

        if errors:
            raise CharityFundValidationError(errors)

        current_balance = self.repository.get_balance()
        if amount > current_balance:
            raise InsufficientFundsError(
                f"Disbursement of {amount} exceeds available charity fund balance of {current_balance}"
            )

        entry_id, balance = self.repository.add_entry(
            "Debit", amount, "Disbursement", None, description, created_by
        )
        logger.info(f"Charity fund disbursed {amount} ({description}); new balance {balance}")
        return {"id": entry_id, "balance": balance}
