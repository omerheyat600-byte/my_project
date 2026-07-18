"""
HR Module data models — Leave Applications, Overtime, Increments, Payroll
and Employee Documents. "Employee" here means a row in the existing
`teachers` table (the app's only staff master), so every HR record links
back to teachers.id the same way staff_attendance already does.
"""
from dataclasses import dataclass
from typing import Optional

LEAVE_TYPES = ["Casual", "Sick", "Annual", "Unpaid", "Maternity/Paternity", "Other"]
LEAVE_STATUSES = ["Pending", "Approved", "Rejected", "Cancelled"]

OVERTIME_STATUSES = ["Pending", "Approved", "Rejected"]

INCREMENT_TYPES = ["Fixed", "Percentage"]

PAYROLL_STATUSES = ["Draft", "Paid"]
PAYMENT_METHODS = ["Cash", "Bank Transfer", "Cheque", "Online"]

EMPLOYEE_DOCUMENT_TYPES = ["CNIC", "Contract", "Certificate", "Resume", "Experience Letter", "Other"]


@dataclass
class LeaveApplication:
    id: Optional[int]
    teacher_id: str
    teacher_name: Optional[str]
    leave_type: str
    start_date: str
    end_date: str
    days: int
    reason: Optional[str] = ""
    status: str = "Pending"
    applied_date: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    review_remarks: Optional[str] = None

    @classmethod
    def from_dict(cls, data, id=None, days=0, teacher_name=None):
        return cls(
            id=id,
            teacher_id=data.get("teacher_id"),
            teacher_name=teacher_name,
            leave_type=data.get("leave_type"),
            start_date=data.get("start_date"),
            end_date=data.get("end_date"),
            days=days,
            reason=data.get("reason") or "",
            status=data.get("status") or "Pending",
        )


@dataclass
class OvertimeEntry:
    id: Optional[int]
    teacher_id: str
    teacher_name: Optional[str]
    date: str
    hours: float
    rate_per_hour: float
    amount: float
    reason: Optional[str] = ""
    status: str = "Pending"

    @classmethod
    def from_dict(cls, data, id=None, teacher_name=None):
        hours = float(data.get("hours", 0) or 0)
        rate = float(data.get("rate_per_hour", 0) or 0)
        return cls(
            id=id,
            teacher_id=data.get("teacher_id"),
            teacher_name=teacher_name,
            date=data.get("date"),
            hours=hours,
            rate_per_hour=rate,
            amount=round(hours * rate, 2),
            reason=data.get("reason") or "",
            status=data.get("status") or "Pending",
        )


@dataclass
class Increment:
    id: Optional[int]
    teacher_id: str
    teacher_name: Optional[str]
    effective_date: str
    previous_salary: float
    increment_type: str
    increment_value: float
    increment_amount: float
    new_salary: float
    reason: Optional[str] = ""
    approved_by: Optional[str] = None


@dataclass
class PayrollRecord:
    id: Optional[int]
    teacher_id: str
    teacher_name: Optional[str]
    month: str
    year: str
    basic_salary: float
    allowances: float = 0
    overtime_amount: float = 0
    deductions: float = 0
    leave_deduction: float = 0
    net_salary: float = 0
    status: str = "Draft"
    payment_date: Optional[str] = None
    payment_method: Optional[str] = None
    generated_by: Optional[str] = None

    def compute_net(self):
        self.net_salary = round(
            self.basic_salary + self.allowances + self.overtime_amount
            - self.deductions - self.leave_deduction, 2
        )
        return self.net_salary


@dataclass
class EmployeeDocument:
    id: Optional[int]
    teacher_id: str
    teacher_name: Optional[str]
    document_type: str
    document_name: str
    file_path: Optional[str]
    expiry_date: Optional[str] = None
    notes: Optional[str] = ""
    uploaded_by: Optional[str] = None
