"""
Fee data model.
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class Fee:
    id: Optional[int]
    student_id: str
    student_name: Optional[str]
    fee_type: str
    month: Optional[str]
    amount: float
    paid_amount: float
    status: str
    due_date: Optional[str]
    paid_date: Optional[str]
    discount_amount: float = 0
    discount_reason: Optional[str] = None
    fine_amount: float = 0
    payment_method: str = "Cash"

    @property
    def net_amount(self):
        """Amount actually payable after discount/scholarship and late fine."""
        return self.amount - (self.discount_amount or 0) + (self.fine_amount or 0)

    @property
    def balance(self):
        return self.net_amount - (self.paid_amount or 0)

    def to_dict(self):
        return {
            "id": self.id,
            "student_id": self.student_id,
            "student_name": self.student_name,
            "fee_type": self.fee_type,
            "month": self.month,
            "amount": self.amount,
            "paid_amount": self.paid_amount,
            "status": self.status,
            "due_date": self.due_date,
            "paid_date": self.paid_date,
            "discount_amount": self.discount_amount or 0,
            "discount_reason": self.discount_reason,
            "fine_amount": self.fine_amount or 0,
            "payment_method": self.payment_method or "Cash",
            "net_amount": self.net_amount,
            "balance": self.balance,
        }
