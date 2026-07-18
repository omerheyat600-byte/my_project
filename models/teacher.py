"""
Teacher data model.
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class Teacher:
    id: Optional[str]
    name: str
    subject: str
    gender: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    qualification: Optional[str] = None
    salary: float = 0
    join_date: Optional[str] = None

    @classmethod
    def from_row(cls, row):
        if row is None:
            return None
        return cls(
            id=row["id"],
            name=row["name"],
            subject=row["subject"],
            gender=row["gender"],
            phone=row["phone"],
            email=row["email"],
            qualification=row["qualification"],
            salary=row["salary"],
            join_date=row["join_date"],
        )

    @classmethod
    def from_dict(cls, data, id=None):
        return cls(
            id=id,
            name=data.get('name'),
            subject=data.get('subject'),
            gender=data.get('gender'),
            phone=data.get('phone'),
            email=data.get('email'),
            qualification=data.get('qualification'),
            salary=float(data.get('salary', 0) or 0),
            join_date=data.get('join_date'),
        )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "subject": self.subject,
            "gender": self.gender,
            "phone": self.phone,
            "email": self.email,
            "qualification": self.qualification,
            "salary": self.salary,
            "join_date": self.join_date,
        }
