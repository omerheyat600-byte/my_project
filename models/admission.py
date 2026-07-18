"""
Admission (online admission applicant) data model.

Represents a candidate who applied for admission — separate from the
`students` table. A row here only becomes a Student once admission is
approved (see AdmissionService.approve_admission).
"""
from dataclasses import dataclass
from typing import Optional

ADMISSION_STATUSES = ["Pending", "Tested", "Waiting", "Approved", "Rejected"]


@dataclass
class Admission:
    id: Optional[int]
    applicant_no: str
    name: str
    grade_applied: str
    father_name: Optional[str] = None
    cnic_bform: Optional[str] = None
    dob: Optional[str] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    previous_school: Optional[str] = None
    photo_path: Optional[str] = None
    test_marks: Optional[float] = None
    test_total: Optional[float] = 100
    test_date: Optional[str] = None
    status: str = "Pending"
    applied_date: Optional[str] = None
    approved_date: Optional[str] = None
    student_id: Optional[str] = None
    remarks: Optional[str] = None

    @classmethod
    def from_row(cls, row):
        if row is None:
            return None
        return cls(
            id=row["id"],
            applicant_no=row["applicant_no"],
            name=row["name"],
            grade_applied=row["grade_applied"],
            father_name=row["father_name"],
            cnic_bform=row["cnic_bform"],
            dob=row["dob"],
            gender=row["gender"],
            phone=row["phone"],
            email=row["email"],
            address=row["address"],
            previous_school=row["previous_school"],
            photo_path=row["photo_path"],
            test_marks=row["test_marks"],
            test_total=row["test_total"],
            test_date=row["test_date"],
            status=row["status"],
            applied_date=row["applied_date"],
            approved_date=row["approved_date"],
            student_id=row["student_id"],
            remarks=row["remarks"],
        )

    @classmethod
    def from_dict(cls, data, id=None, applicant_no=None):
        return cls(
            id=id,
            applicant_no=applicant_no or data.get("applicant_no"),
            name=(data.get("name") or "").strip(),
            grade_applied=(data.get("grade_applied") or "").strip(),
            father_name=data.get("father_name"),
            cnic_bform=data.get("cnic_bform"),
            dob=data.get("dob"),
            gender=data.get("gender"),
            phone=data.get("phone"),
            email=data.get("email"),
            address=data.get("address"),
            previous_school=data.get("previous_school"),
            photo_path=data.get("photo_path"),
            status=data.get("status", "Pending"),
            remarks=data.get("remarks"),
        )

    def to_dict(self):
        return {
            "id": self.id,
            "applicant_no": self.applicant_no,
            "name": self.name,
            "grade_applied": self.grade_applied,
            "father_name": self.father_name,
            "cnic_bform": self.cnic_bform,
            "dob": self.dob,
            "gender": self.gender,
            "phone": self.phone,
            "email": self.email,
            "address": self.address,
            "previous_school": self.previous_school,
            "photo_path": self.photo_path,
            "test_marks": self.test_marks,
            "test_total": self.test_total,
            "test_date": self.test_date,
            "status": self.status,
            "applied_date": self.applied_date,
            "approved_date": self.approved_date,
            "student_id": self.student_id,
            "remarks": self.remarks,
        }
