"""
Notification log data model.
"""
from dataclasses import dataclass
from typing import Optional

NOTIFICATION_STATUSES = ["sent", "failed"]
NOTIFICATION_RELATED_TYPES = ["attendance", "fee_reminder", "manual"]


@dataclass
class NotificationLog:
    id: Optional[int]
    student_id: str
    parent_phone: str
    message: str
    status: str
    sent_at: Optional[str] = None
    error: Optional[str] = None
    related_to: Optional[str] = None
    related_id: Optional[int] = None

    @classmethod
    def from_row(cls, row):
        if row is None:
            return None
        return cls(
            id=row["id"],
            student_id=row["student_id"],
            parent_phone=row["parent_phone"],
            message=row["message"],
            status=row["status"],
            sent_at=row["sent_at"],
            error=row["error"],
            related_to=row["related_to"],
            related_id=row["related_id"],
        )

    def to_dict(self):
        return {
            "id": self.id,
            "student_id": self.student_id,
            "parent_phone": self.parent_phone,
            "message": self.message,
            "status": self.status,
            "sent_at": self.sent_at,
            "error": self.error,
            "related_to": self.related_to,
            "related_id": self.related_id,
        }
