"""
Exam session data model (structured exam-session subsystem — separate
from the legacy flat `results` table, backed by exam_sessions /
student_results / student_result_subjects).
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class ExamSession:
    id: Optional[int]
    class_id: int
    term: str
    year: str
    exam_date: Optional[str] = None

    @classmethod
    def from_row(cls, row):
        if row is None:
            return None
        return cls(
            id=row["id"],
            class_id=row["class_id"],
            term=row["term"],
            year=row["year"],
            exam_date=row["exam_date"],
        )

    def to_dict(self):
        return {
            "id": self.id,
            "class_id": self.class_id,
            "term": self.term,
            "year": self.year,
            "exam_date": self.exam_date,
        }
