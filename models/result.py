"""
Result data model (legacy flat `results` table — one row per
student/subject/term/year).
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class Result:
    id: Optional[int]
    student_id: str
    student_name: Optional[str]
    subject: str
    obtained_marks: float
    total_marks: float
    grade: Optional[str]
    term: Optional[str]
    year: Optional[str]
    exam_date: Optional[str]

    @classmethod
    def from_row(cls, row):
        if row is None:
            return None
        return cls(
            id=row["id"],
            student_id=row["student_id"],
            student_name=row["student_name"],
            subject=row["subject"],
            obtained_marks=row["obtained_marks"],
            total_marks=row["total_marks"],
            grade=row["grade"],
            term=row["term"],
            year=row["year"],
            exam_date=row["exam_date"],
        )

    def to_dict(self):
        return {
            "id": self.id,
            "student_id": self.student_id,
            "student_name": self.student_name,
            "subject": self.subject,
            "obtained_marks": self.obtained_marks,
            "total_marks": self.total_marks,
            "grade": self.grade,
            "term": self.term,
            "year": self.year,
            "exam_date": self.exam_date,
        }
