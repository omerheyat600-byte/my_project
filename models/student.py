"""
Student data model.
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class Student:
    id: Optional[str]
    name: str
    grade: str
    gender: Optional[str] = None
    dob: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    join_date: Optional[str] = None
    admission_no: Optional[str] = None
    photo_path: Optional[str] = None
    status: Optional[str] = "Active"
    roll_no: Optional[int] = None

    @classmethod
    def from_row(cls, row):
        """Build a Student from a DB row (dict)."""
        if row is None:
            return None
        keys = row.keys()
        return cls(
            id=row["id"],
            name=row["name"],
            grade=row["grade"],
            gender=row["gender"],
            dob=row["dob"],
            phone=row["phone"],
            email=row["email"],
            address=row["address"],
            parent_name=row["parent_name"],
            parent_phone=row["parent_phone"],
            join_date=row["join_date"],
            # Guard against pre-migration connections that don't have these
            # columns yet — checking dict keys is cheap.
            admission_no=row["admission_no"] if "admission_no" in keys else None,
            photo_path=row["photo_path"] if "photo_path" in keys else None,
            status=(row["status"] if "status" in keys else None) or "Active",
            roll_no=row["roll_no"] if "roll_no" in keys else None,
        )

    @classmethod
    def from_dict(cls, data, id=None):
        """Build a Student from a request payload dict."""
        return cls(
            id=id,
            name=data.get('name'),
            grade=data.get('grade'),
            gender=data.get('gender'),
            dob=data.get('dob'),
            phone=data.get('phone'),
            email=data.get('email'),
            address=data.get('address'),
            parent_name=data.get('parent_name'),
            parent_phone=data.get('parent_phone'),
            join_date=data.get('join_date'),
            admission_no=data.get('admission_no'),
            photo_path=data.get('photo_path'),
            status=data.get('status') or 'Active',
            roll_no=cls._parse_roll_no(data.get('roll_no')),
        )

    @staticmethod
    def _parse_roll_no(value):
        if value in (None, ''):
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "grade": self.grade,
            "gender": self.gender,
            "dob": self.dob,
            "phone": self.phone,
            "email": self.email,
            "address": self.address,
            "parent_name": self.parent_name,
            "parent_phone": self.parent_phone,
            "join_date": self.join_date,
            "admission_no": self.admission_no,
            "photo_path": self.photo_path,
            "status": self.status,
            "roll_no": self.roll_no,
        }
