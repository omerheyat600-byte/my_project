"""
Staff attendance data model. Mirrors AttendanceRecord (student
attendance) but keyed by teacher_id instead of student_id/class_id —
staff attendance is a single whole-school roster per day, not grouped
by class.
"""
from dataclasses import dataclass
from typing import Optional

STAFF_ATTENDANCE_STATUSES = ["Present", "Absent", "Late", "Leave"]


@dataclass
class StaffAttendanceRecord:
    id: Optional[int]
    teacher_id: str
    teacher_name: Optional[str]
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
            teacher_id=row["teacher_id"],
            teacher_name=row["teacher_name"],
            date=row["date"],
            status=row["status"],
            remarks=row["remarks"],
            marked_by=row["marked_by"],
            marked_at=row["marked_at"],
        )

    def to_dict(self):
        return {
            "id": self.id,
            "teacher_id": self.teacher_id,
            "teacher_name": self.teacher_name,
            "date": self.date,
            "status": self.status,
            "remarks": self.remarks,
            "marked_by": self.marked_by,
            "marked_at": self.marked_at,
        }
