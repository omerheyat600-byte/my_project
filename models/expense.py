"""
Expense data model.
"""
from dataclasses import dataclass
from typing import Optional

# Fixed category list used by the expenses form/report (unchanged from
# the original implementation).
EXPENSE_CATEGORIES = [
    'Salaries', 'Utilities', 'Maintenance',
    'Stationery', 'Transport', 'Events', 'Other'
]


@dataclass
class Expense:
    id: Optional[int]
    category: str
    description: Optional[str]
    amount: float
    payment_method: Optional[str]
    reference_no: Optional[str]
    date: Optional[str]

    @classmethod
    def from_dict(cls, data, id=None):
        return cls(
            id=id,
            category=data.get('category'),
            description=data.get('description'),
            amount=float(data.get('amount', 0) or 0),
            payment_method=data.get('payment_method'),
            reference_no=data.get('reference_no'),
            date=data.get('date'),
        )

    def to_dict(self):
        return {
            "id": self.id,
            "category": self.category,
            "description": self.description,
            "amount": self.amount,
            "payment_method": self.payment_method,
            "reference_no": self.reference_no,
            "date": self.date,
        }
