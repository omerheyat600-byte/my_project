"""
Class data model.

Named `SchoolClass` (not `Class`) since `class` is a reserved word in
Python and would shadow the builtin if used directly.
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class SchoolClass:
    id: Optional[int]
    class_name: str
    grade_level: str
    section: Optional[str] = None
    class_teacher: Optional[str] = None
    class_teacher_name: Optional[str] = None
    room_number: Optional[str] = None
    schedule: Optional[str] = None
    capacity: int = 0
    max_subjects: int = 20

    @classmethod
    def from_row(cls, row):
        if row is None:
            return None
        return cls(
            id=row["id"],
            class_name=row["class_name"],
            grade_level=row["grade_level"],
            section=row["section"],
            class_teacher=row["class_teacher"],
            class_teacher_name=row["class_teacher_name"],
            room_number=row["room_number"],
            schedule=row["schedule"],
            capacity=row["capacity"],
            max_subjects=row["max_subjects"],
        )

    @classmethod
    def from_dict(cls, data, id=None, class_teacher_name=None):
        return cls(
            id=id,
            class_name=data.get('class_name'),
            grade_level=data.get('grade_level'),
            section=data.get('section'),
            class_teacher=data.get('class_teacher', ''),
            class_teacher_name=class_teacher_name,
            room_number=data.get('room_number'),
            schedule=data.get('schedule'),
            capacity=int(data.get('capacity', 0) or 0),
            max_subjects=int(data.get('max_subjects', 20) or 20),
        )

    def to_dict(self):
        return {
            "id": self.id,
            "class_name": self.class_name,
            "grade_level": self.grade_level,
            "section": self.section,
            "class_teacher": self.class_teacher,
            "class_teacher_name": self.class_teacher_name,
            "room_number": self.room_number,
            "schedule": self.schedule,
            "capacity": self.capacity,
            "max_subjects": self.max_subjects,
        }


@dataclass
class ClassSubject:
    class_id: int
    subject_name: str
    max_marks: int = 100

    @classmethod
    def from_row(cls, row):
        if row is None:
            return None
        return cls(
            class_id=row["class_id"] if "class_id" in row.keys() else None,
            subject_name=row["subject_name"],
            max_marks=row["max_marks"],
        )

    def to_dict(self):
        return {
            "subject_name": self.subject_name,
            "max_marks": self.max_marks,
        }
