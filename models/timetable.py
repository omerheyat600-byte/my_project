"""
Timetable data model.
"""
from dataclasses import dataclass
from typing import Optional

DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]


@dataclass
class TimetableSlot:
    id: Optional[int]
    class_id: int
    day_of_week: str
    period_number: int
    start_time: Optional[str]
    end_time: Optional[str]
    subject: str
    teacher_id: Optional[str] = None
    teacher_name: Optional[str] = None

    @classmethod
    def from_row(cls, row):
        if row is None:
            return None
        return cls(
            id=row["id"],
            class_id=row["class_id"],
            day_of_week=row["day_of_week"],
            period_number=row["period_number"],
            start_time=row["start_time"],
            end_time=row["end_time"],
            subject=row["subject"],
            teacher_id=row["teacher_id"],
            teacher_name=row["teacher_name"],
        )

    def to_dict(self):
        return {
            "id": self.id,
            "class_id": self.class_id,
            "day_of_week": self.day_of_week,
            "period_number": self.period_number,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "subject": self.subject,
            "teacher_id": self.teacher_id,
            "teacher_name": self.teacher_name,
        }
