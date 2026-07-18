"""
Accounts Module data models — Chart of Accounts, Vouchers and Voucher
Entries. The module is a small but real double-entry ledger:

  * Every voucher (Journal / Payment / Receipt) is stored as one row in
    accounts_vouchers plus two-or-more balanced rows in
    accounts_voucher_entries (debit/credit lines against a
    chart_of_accounts account).
  * Cash Book / Bank Book / Ledger / Trial Balance / P&L / Balance Sheet
    are all just different views/aggregations over those entries —
    see repositories/accounts_repository.py.
"""
from dataclasses import dataclass, field
from typing import Optional, List

ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Income", "Expense"]

# Normal balance side for each account type — used to decide whether a
# positive (debit - credit) net should be displayed as a Dr or Cr balance.
NORMAL_DEBIT_TYPES = {"Asset", "Expense"}
NORMAL_CREDIT_TYPES = {"Liability", "Equity", "Income"}

# 'cash' / 'bank' accounts feed the Cash Book / Bank Book views;
# 'general' accounts are everything else (income, expense, receivable...).
ACCOUNT_CATEGORIES = ["cash", "bank", "general"]

VOUCHER_TYPES = ["Journal", "Payment", "Receipt"]

BALANCE_SIDES = ["Dr", "Cr"]


@dataclass
class ChartOfAccount:
    id: Optional[int]
    code: str
    name: str
    account_type: str
    category: str = "general"
    opening_balance: float = 0.0
    opening_balance_type: str = "Dr"
    is_active: bool = True
    is_system: bool = False

    @classmethod
    def from_dict(cls, data, id=None):
        return cls(
            id=id,
            code=(data.get("code") or "").strip(),
            name=(data.get("name") or "").strip(),
            account_type=data.get("account_type"),
            category=data.get("category") or "general",
            opening_balance=float(data.get("opening_balance", 0) or 0),
            opening_balance_type=data.get("opening_balance_type") or "Dr",
            is_active=bool(int(data.get("is_active", 1))) if data.get("is_active") is not None else True,
            is_system=bool(data.get("is_system", False)),
        )

    def to_dict(self):
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "account_type": self.account_type,
            "category": self.category,
            "opening_balance": self.opening_balance,
            "opening_balance_type": self.opening_balance_type,
            "is_active": self.is_active,
            "is_system": self.is_system,
        }


@dataclass
class VoucherEntry:
    account_id: int
    debit: float = 0.0
    credit: float = 0.0
    particulars: str = ""

    @classmethod
    def from_dict(cls, data):
        return cls(
            account_id=int(data.get("account_id")),
            debit=float(data.get("debit", 0) or 0),
            credit=float(data.get("credit", 0) or 0),
            particulars=data.get("particulars") or "",
        )

    def to_dict(self):
        return {
            "account_id": self.account_id,
            "debit": self.debit,
            "credit": self.credit,
            "particulars": self.particulars,
        }


@dataclass
class Voucher:
    id: Optional[int]
    voucher_no: Optional[str]
    voucher_type: str
    voucher_date: str
    party_name: Optional[str] = ""
    narration: Optional[str] = ""
    reference_no: Optional[str] = ""
    total_amount: float = 0.0
    created_by: Optional[str] = None
    entries: List[VoucherEntry] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data, id=None, voucher_no=None):
        entries = [VoucherEntry.from_dict(e) for e in (data.get("entries") or [])]
        return cls(
            id=id,
            voucher_no=voucher_no,
            voucher_type=data.get("voucher_type"),
            voucher_date=data.get("voucher_date") or data.get("date"),
            party_name=data.get("party_name") or "",
            narration=data.get("narration") or "",
            reference_no=data.get("reference_no") or "",
            total_amount=float(data.get("total_amount", 0) or 0),
            created_by=data.get("created_by"),
            entries=entries,
        )

    def to_dict(self):
        return {
            "id": self.id,
            "voucher_no": self.voucher_no,
            "voucher_type": self.voucher_type,
            "voucher_date": self.voucher_date,
            "party_name": self.party_name,
            "narration": self.narration,
            "reference_no": self.reference_no,
            "total_amount": self.total_amount,
            "created_by": self.created_by,
            "entries": [e.to_dict() for e in self.entries],
        }
