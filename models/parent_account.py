"""
Parent account data model — a login belonging to a single student's
parent/guardian, scoped to that one student for the lifetime of the
account (re-linking is an admin action, not something the parent can do).
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class ParentAccount:
    id: Optional[int]
    username: str
    student_id: str
    full_name: Optional[str] = None
    phone: Optional[str] = None
    is_active: int = 1

    @classmethod
    def from_dict(cls, data, id=None):
        return cls(
            id=id,
            username=data.get('username'),
            student_id=data.get('student_id'),
            full_name=data.get('full_name'),
            phone=data.get('phone'),
            is_active=1 if data.get('is_active', True) else 0,
        )

    @classmethod
    def from_row(cls, row):
        if row is None:
            return None
        return cls(
            id=row["id"],
            username=row["username"],
            student_id=row["student_id"],
            full_name=row["full_name"],
            phone=row["phone"],
            is_active=row["is_active"],
        )

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "student_id": self.student_id,
            "full_name": self.full_name,
            "phone": self.phone,
            "is_active": self.is_active,
        }
