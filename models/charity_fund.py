"""
Charity Fund data model — a single ledger entry (credit or debit).
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class CharityLedgerEntry:
    id: Optional[int]
    entry_type: str            # 'Credit' or 'Debit'
    amount: float
    source: str                 # 'Fine Credit', 'Disbursement', 'Manual'
    fee_id: Optional[int]
    description: Optional[str]
    balance_after: float
    created_by: Optional[str]
    created_at: Optional[str] = None

    def to_dict(self):
        return {
            "id": self.id,
            "entry_type": self.entry_type,
            "amount": self.amount,
            "source": self.source,
            "fee_id": self.fee_id,
            "description": self.description,
            "balance_after": self.balance_after,
            "created_by": self.created_by,
            "created_at": self.created_at,
        }
