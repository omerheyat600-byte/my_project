"""
Attendance data model.
"""
from dataclasses import dataclass
from typing import Optional

ATTENDANCE_STATUSES = ["Present", "Absent", "Late", "Leave"]


@dataclass
class AttendanceRecord:
    id: Optional[int]
    student_id: str
    student_name: Optional[str]
    class_id: int
    date: str
    status: str = "Present"
    remarks: Optional[str] = None
    marked_by: Optional[str] = None
    marked_at: Optional[str] = None

    @classmethod
    def from_row(cls, row):
        if row is None:
            return None
        return cls(
            id=row["id"],
            student_id=row["student_id"],
            student_name=row["student_name"],
            class_id=row["class_id"],
            date=row["date"],
            status=row["status"],
            remarks=row["remarks"],
            marked_by=row["marked_by"],
            marked_at=row["marked_at"],
        )

    def to_dict(self):
        return {
            "id": self.id,
            "student_id": self.student_id,
            "student_name": self.student_name,
            "class_id": self.class_id,
            "date": self.date,
            "status": self.status,
            "remarks": self.remarks,
            "marked_by": self.marked_by,
            "marked_at": self.marked_at,
        }
