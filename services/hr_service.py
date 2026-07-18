"""
HR service — business logic layer sitting between routes and the HR
repositories. Owns: leave-day calculation, leave/overtime approval
workflow, increments (which update the teacher's salary in place),
payroll generation (pulling in approved overtime + unpaid-leave
deductions automatically), and employee document bookkeeping.
"""
from datetime import date, datetime, timedelta

from models.hr import LeaveApplication, OvertimeEntry, Increment, PayrollRecord, EmployeeDocument
from repositories.hr_repository import (
    LeaveRepository, OvertimeRepository, IncrementRepository,
    PayrollRepository, EmployeeDocumentRepository,
)
from repositories.teacher_repository import TeacherRepository
from utils.validators import (
    validate_leave_application_payload, validate_overtime_payload,
    validate_increment_payload, validate_payroll_generate_payload,
    validate_employee_document_payload,
)
from utils.logger import get_logger

logger = get_logger(__name__)

MONTH_DAYS = 30  # simplified daily-rate divisor for leave deductions, consistent with common payroll practice


class HRValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("; ".join(errors))


class HRNotFoundError(Exception):
    pass


class TeacherNotFoundError(Exception):
    pass


class HRService:

    def __init__(self, leave_repo: LeaveRepository, overtime_repo: OvertimeRepository,
                 increment_repo: IncrementRepository, payroll_repo: PayrollRepository,
                 document_repo: EmployeeDocumentRepository, teacher_repo: TeacherRepository):
        self.leave_repo = leave_repo
        self.overtime_repo = overtime_repo
        self.increment_repo = increment_repo
        self.payroll_repo = payroll_repo
        self.document_repo = document_repo
        self.teacher_repo = teacher_repo

    def _teacher_or_raise(self, teacher_id):
        teacher = self.teacher_repo.find_by_id(teacher_id)
        if not teacher:
            raise TeacherNotFoundError(f"Employee '{teacher_id}' not found")
        return teacher

    # ==================== LEAVE APPLICATION / APPROVAL ====================
    def list_leave_applications(self, teacher_id="", status="", leave_type="", date_from="", date_to=""):
        return self.leave_repo.find_all(teacher_id, status, leave_type, date_from, date_to)

    def apply_leave(self, data):
        errors = validate_leave_application_payload(data)
        if errors:
            raise HRValidationError(errors)

        teacher = self._teacher_or_raise(data["teacher_id"])
        start = date.fromisoformat(data["start_date"])
        end = date.fromisoformat(data["end_date"])
        days = (end - start).days + 1

        leave = LeaveApplication.from_dict(data, days=days, teacher_name=teacher.name)
        new_id = self.leave_repo.create(leave)
        logger.info(f"Leave application submitted: {teacher.id} ({days} day(s), {leave.leave_type})")
        return new_id

    def _get_leave_or_raise(self, leave_id):
        leave = self.leave_repo.find_by_id(leave_id)
        if not leave:
            raise HRNotFoundError("Leave application not found")
        return leave

    def approve_leave(self, leave_id, reviewed_by, remarks=""):
        leave = self._get_leave_or_raise(leave_id)
        if leave["status"] != "Pending":
            raise HRValidationError([f"Only Pending applications can be approved (current status: {leave['status']})"])
        self.leave_repo.set_status(leave_id, "Approved", reviewed_by, remarks)
        logger.info(f"Leave application {leave_id} approved by {reviewed_by}")

    def reject_leave(self, leave_id, reviewed_by, remarks=""):
        leave = self._get_leave_or_raise(leave_id)
        if leave["status"] != "Pending":
            raise HRValidationError([f"Only Pending applications can be rejected (current status: {leave['status']})"])
        self.leave_repo.set_status(leave_id, "Rejected", reviewed_by, remarks)
        logger.info(f"Leave application {leave_id} rejected by {reviewed_by}")

    def cancel_leave(self, leave_id):
        leave = self._get_leave_or_raise(leave_id)
        if leave["status"] not in ("Pending", "Approved"):
            raise HRValidationError([f"Cannot cancel a leave application with status '{leave['status']}'"])
        self.leave_repo.set_status(leave_id, "Cancelled", leave.get("reviewed_by"), leave.get("review_remarks") or "")

    # ==================== OVERTIME ====================
    def list_overtime(self, teacher_id="", status="", date_from="", date_to=""):
        return self.overtime_repo.find_all(teacher_id, status, date_from, date_to)

    def add_overtime(self, data):
        errors = validate_overtime_payload(data)
        if errors:
            raise HRValidationError(errors)
        teacher = self._teacher_or_raise(data["teacher_id"])
        ot = OvertimeEntry.from_dict(data, teacher_name=teacher.name)
        new_id = self.overtime_repo.create(ot)
        logger.info(f"Overtime logged: {teacher.id} {ot.hours}h on {ot.date}")
        return new_id

    def _get_overtime_or_raise(self, overtime_id):
        ot = self.overtime_repo.find_by_id(overtime_id)
        if not ot:
            raise HRNotFoundError("Overtime entry not found")
        return ot

    def approve_overtime(self, overtime_id, approved_by):
        ot = self._get_overtime_or_raise(overtime_id)
        if ot["status"] != "Pending":
            raise HRValidationError([f"Only Pending overtime entries can be approved (current status: {ot['status']})"])
        self.overtime_repo.set_status(overtime_id, "Approved", approved_by)

    def reject_overtime(self, overtime_id, approved_by):
        ot = self._get_overtime_or_raise(overtime_id)
        if ot["status"] != "Pending":
            raise HRValidationError([f"Only Pending overtime entries can be rejected (current status: {ot['status']})"])
        self.overtime_repo.set_status(overtime_id, "Rejected", approved_by)

    def delete_overtime(self, overtime_id):
        if not self.overtime_repo.exists(overtime_id):
            raise HRNotFoundError("Overtime entry not found")
        self.overtime_repo.delete(overtime_id)

    # ==================== INCREMENTS ====================
    def list_increments(self, teacher_id=""):
        return self.increment_repo.find_all(teacher_id)

    def add_increment(self, data, approved_by=None):
        errors = validate_increment_payload(data)
        if errors:
            raise HRValidationError(errors)

        teacher = self._teacher_or_raise(data["teacher_id"])
        previous_salary = float(teacher.salary or 0)
        increment_type = data["increment_type"]
        increment_value = float(data["increment_value"])

        if increment_type == "Percentage":
            increment_amount = round(previous_salary * increment_value / 100, 2)
        else:
            increment_amount = round(increment_value, 2)
        new_salary = round(previous_salary + increment_amount, 2)

        increment = Increment(
            id=None, teacher_id=teacher.id, teacher_name=teacher.name,
            effective_date=data["effective_date"], previous_salary=previous_salary,
            increment_type=increment_type, increment_value=increment_value,
            increment_amount=increment_amount, new_salary=new_salary,
            reason=data.get("reason", ""), approved_by=approved_by,
        )
        new_id = self.increment_repo.create(increment)
        # Effective immediately: future payroll runs use the new salary.
        self.increment_repo.update_teacher_salary(teacher.id, new_salary)
        logger.info(f"Increment recorded: {teacher.id} {previous_salary} -> {new_salary}")
        return new_id, new_salary

    # ==================== PAYROLL / SALARY SLIP ====================
    def _period_bounds(self, month, year):
        month = str(month).zfill(2)
        year = str(year)
        first = f"{year}-{month}-01"
        # last day of month, safe across month lengths
        if month == "12":
            next_first = f"{int(year) + 1}-01-01"
        else:
            next_first = f"{year}-{str(int(month) + 1).zfill(2)}-01"
        last = (date.fromisoformat(next_first) - timedelta(days=1)).isoformat()
        return month, year, first, last

    def generate_payroll(self, data, generated_by=None):
        errors = validate_payroll_generate_payload(data)
        if errors:
            raise HRValidationError(errors)

        month, year, period_start, period_end = self._period_bounds(data["month"], data["year"])
        teacher_ids = data.get("teacher_ids") or None
        teachers = (
            [self._teacher_or_raise(tid) for tid in teacher_ids]
            if teacher_ids else self.teacher_repo.find_all()
        )

        generated, skipped = [], []
        for teacher in teachers:
            existing = self.payroll_repo.find_by_teacher_period(teacher.id, month, year)
            if existing and existing["status"] == "Paid":
                skipped.append({"teacher_id": teacher.id, "teacher_name": teacher.name, "reason": "Already paid"})
                continue

            basic_salary = float(teacher.salary or 0)
            overtime_amount = self.overtime_repo.approved_total_in_period(teacher.id, period_start, period_end)
            unpaid_days = self.leave_repo.approved_days_in_period(teacher.id, period_start, period_end, leave_type="Unpaid")
            leave_deduction = round((basic_salary / MONTH_DAYS) * unpaid_days, 2) if basic_salary else 0

            record = PayrollRecord(
                id=None, teacher_id=teacher.id, teacher_name=teacher.name,
                month=month, year=year, basic_salary=basic_salary,
                allowances=(existing["allowances"] if existing else 0),
                overtime_amount=overtime_amount,
                deductions=(existing["deductions"] if existing else 0),
                leave_deduction=leave_deduction, status="Draft", generated_by=generated_by,
            )
            record.compute_net()
            payroll_id, created = self.payroll_repo.upsert_draft(record)
            generated.append({
                "id": payroll_id, "teacher_id": teacher.id, "teacher_name": teacher.name,
                "net_salary": record.net_salary, "created": created,
            })

        logger.info(f"Payroll generated for {month}/{year}: {len(generated)} record(s), {len(skipped)} skipped")
        return {"month": month, "year": year, "generated": generated, "skipped": skipped}

    def list_payroll(self, month="", year="", teacher_id="", status=""):
        return self.payroll_repo.find_all(month, year, teacher_id, status)

    def get_payroll(self, payroll_id):
        record = self.payroll_repo.find_by_id(payroll_id)
        if not record:
            raise HRNotFoundError("Payroll record not found")
        return record

    def update_payroll(self, payroll_id, data):
        record = self.get_payroll(payroll_id)
        if record["status"] == "Paid":
            raise HRValidationError(["Cannot edit a payroll record that has already been marked Paid"])
        try:
            allowances = float(data.get("allowances", record["allowances"]))
            deductions = float(data.get("deductions", record["deductions"]))
        except (TypeError, ValueError):
            raise HRValidationError(["allowances/deductions must be numbers"])
        net_salary = round(
            record["basic_salary"] + allowances + record["overtime_amount"]
            - deductions - record["leave_deduction"], 2
        )
        self.payroll_repo.update_fields(payroll_id, allowances, deductions, net_salary)
        return net_salary

    def mark_payroll_paid(self, payroll_id, payment_date=None, payment_method="Cash"):
        record = self.get_payroll(payroll_id)
        if record["status"] == "Paid":
            raise HRValidationError(["This payroll record is already marked Paid"])
        payment_date = payment_date or datetime.now().date().isoformat()
        self.payroll_repo.mark_paid(payroll_id, payment_date, payment_method)
        logger.info(f"Payroll {payroll_id} marked Paid ({payment_method})")

    def delete_payroll(self, payroll_id):
        record = self.get_payroll(payroll_id)
        if record["status"] == "Paid":
            raise HRValidationError(["Cannot delete a payroll record that has already been marked Paid"])
        self.payroll_repo.delete(payroll_id)

    # ==================== EMPLOYEE DOCUMENTS ====================
    def list_documents(self, teacher_id="", document_type=""):
        return self.document_repo.find_all(teacher_id, document_type)

    def add_document(self, data, file_path, uploaded_by=None):
        errors = validate_employee_document_payload(data)
        if errors:
            raise HRValidationError(errors)
        teacher = self._teacher_or_raise(data["teacher_id"])
        doc = EmployeeDocument(
            id=None, teacher_id=teacher.id, teacher_name=teacher.name,
            document_type=data["document_type"],
            document_name=data.get("document_name") or data["document_type"],
            file_path=file_path, expiry_date=data.get("expiry_date"),
            notes=data.get("notes", ""), uploaded_by=uploaded_by,
        )
        new_id = self.document_repo.create(doc)
        logger.info(f"Employee document uploaded: {teacher.id} ({doc.document_type})")
        return new_id

    def get_document(self, doc_id):
        doc = self.document_repo.find_by_id(doc_id)
        if not doc:
            raise HRNotFoundError("Document not found")
        return doc

    def delete_document(self, doc_id):
        doc = self.get_document(doc_id)
        self.document_repo.delete(doc_id)
        return doc  # caller (route) removes the file from disk
