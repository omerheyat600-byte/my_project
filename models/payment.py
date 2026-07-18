"""
Payment data model — one row per online payment attempt against a fee
record, regardless of gateway (currently JazzCash only).
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class Payment:
    id: Optional[int]
    fee_id: int
    student_id: str
    txn_ref_no: str
    amount: float
    gateway: str
    status: str  # 'Initiated' | 'Success' | 'Failed'
    gateway_txn_id: Optional[str] = None
    response_code: Optional[str] = None
    response_message: Optional[str] = None

    def to_dict(self):
        return {
            "id": self.id,
            "fee_id": self.fee_id,
            "student_id": self.student_id,
            "txn_ref_no": self.txn_ref_no,
            "amount": self.amount,
            "gateway": self.gateway,
            "status": self.status,
            "gateway_txn_id": self.gateway_txn_id,
            "response_code": self.response_code,
            "response_message": self.response_message,
        }
