"""
Admission service — business logic layer for the Online Admission module:
  Application intake -> Test Marks -> Waiting List / Approval -> Student
  record creation (auto ID + admission no, via StudentService).
"""
from datetime import date

from database import rand_id  # noqa: F401 (kept for parity with StudentService; ids come via StudentService)
from models.admission import Admission, ADMISSION_STATUSES
from repositories.admission_repository import AdmissionRepository
from repositories.class_repository import ClassRepository
from services.student_service import StudentService, StudentValidationError
from utils.logger import get_logger

logger = get_logger(__name__)


class AdmissionNotFoundError(Exception):
    pass


class AdmissionValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("; ".join(errors))


class SeatsFullError(Exception):
    """Raised on approval when the target class has no free seats left,
    so the caller can offer the waiting list instead."""
    pass


def _validate_application(data):
    errors = []
    if not (data.get("name") or "").strip():
        errors.append("Applicant name is required")
    if not (data.get("grade_applied") or "").strip():
        errors.append("Grade applied for is required")
    if not (data.get("father_name") or "").strip():
        errors.append("Father/Guardian name is required")
    if not (data.get("phone") or "").strip():
        errors.append("Phone number is required")
    return errors


class AdmissionService:

    def __init__(self, repository: AdmissionRepository, class_repository: ClassRepository,
                 student_service: StudentService):
        self.repository = repository
        self.class_repository = class_repository
        self.student_service = student_service

    # ---------------------------------------------------------------
    # Application intake (public "Online Admission Form")
    # ---------------------------------------------------------------

    def submit_application(self, data):
        errors = _validate_application(data)
        if errors:
            logger.warning(f"Admission application validation failed: {errors}")
            raise AdmissionValidationError(errors)

        applicant_no = self.repository.find_next_applicant_no(date.today().year)
        admission = Admission.from_dict(data, applicant_no=applicant_no)
        aid = self.repository.create(admission)
        logger.info(f"Admission application received: {applicant_no} ({admission.name}) for {admission.grade_applied}")
        return {"id": aid, "applicant_no": applicant_no}

    def track_application(self, applicant_no):
        """Public status lookup — returns a trimmed view (no internal id churn)."""
        admission = self.repository.find_by_applicant_no(applicant_no)
        if not admission:
            raise AdmissionNotFoundError("No application found with that applicant number")
        d = admission.to_dict()
        d.pop("student_id", None)
        return d

    def set_photo(self, aid, photo_path):
        if not self.repository.exists(aid):
            raise AdmissionNotFoundError("Application not found")
        self.repository.set_photo_path(aid, photo_path)

    # ---------------------------------------------------------------
    # Admin: listing / lookup
    # ---------------------------------------------------------------

    def list_admissions(self, query="", status="", grade_filter=""):
        admissions = self.repository.find_all(query, status, grade_filter)
        grades = self.repository.find_distinct_grades()
        counts = self.repository.counts_by_status()
        return {
            "admissions": [a.to_dict() for a in admissions],
            "grades": grades,
            "counts": counts,
            "statuses": ADMISSION_STATUSES,
        }

    def get_admission(self, aid):
        admission = self.repository.find_by_id(aid)
        if not admission:
            raise AdmissionNotFoundError("Application not found")
        return admission.to_dict()

    def get_waiting_list(self, grade_filter=""):
        """Merit-ordered waiting list — highest test marks first, since that's
        who should be offered the next open seat."""
        admissions = self.repository.find_all("", "Waiting", grade_filter)
        ranked = sorted(
            admissions,
            key=lambda a: (a.test_marks is None, -(a.test_marks or 0))
        )
        return [a.to_dict() for a in ranked]

    def update_application(self, aid, data):
        errors = _validate_application(data)
        if errors:
            raise AdmissionValidationError(errors)
        if not self.repository.exists(aid):
            raise AdmissionNotFoundError("Application not found")
        existing = self.repository.find_by_id(aid)
        admission = Admission.from_dict(data, id=aid, applicant_no=existing.applicant_no)
        self.repository.update(aid, admission)
        logger.info(f"Admission application updated: {existing.applicant_no}")

    def delete_admission(self, aid):
        if not self.repository.exists(aid):
            raise AdmissionNotFoundError("Application not found")
        self.repository.delete(aid)
        logger.info(f"Admission application deleted: id={aid}")

    # ---------------------------------------------------------------
    # Admission Test Marks
    # ---------------------------------------------------------------

    def record_test_marks(self, aid, marks, total=100, test_date=None):
        admission = self.repository.find_by_id(aid)
        if not admission:
            raise AdmissionNotFoundError("Application not found")
        try:
            marks = float(marks)
            total = float(total) if total not in (None, "") else 100.0
        except (TypeError, ValueError):
            raise AdmissionValidationError(["Test marks and total must be numbers"])
        if marks < 0 or total <= 0 or marks > total:
            raise AdmissionValidationError(["Test marks must be between 0 and the total marks"])

        test_date = test_date or date.today().isoformat()
        self.repository.set_test_marks(aid, marks, total, test_date, status="Tested")
        logger.info(f"Admission test marks recorded: {admission.applicant_no} = {marks}/{total}")
        return {"percentage": round(marks / total * 100, 2)}

    # ---------------------------------------------------------------
    # Seats / capacity
    # ---------------------------------------------------------------

    def _seats_status(self, grade_applied):
        """Returns (capacity, seats_taken) for the class matching
        grade_applied. capacity of 0/None means uncapped (no class row,
        or capacity intentionally left at 0 -> unlimited)."""
        match = self.class_repository.find_by_name(grade_applied)
        if not match:
            return None, None
        school_class = self.class_repository.find_by_id(match["id"])
        capacity = school_class.capacity if school_class else 0
        taken = self.repository.count_approved_for_grade(grade_applied)
        return capacity, taken

    def get_seat_availability(self, grade_applied):
        capacity, taken = self._seats_status(grade_applied)
        if capacity in (None, 0):
            return {"capacity": capacity, "taken": taken, "seats_left": None}
        return {"capacity": capacity, "taken": taken, "seats_left": max(capacity - taken, 0)}

    # ---------------------------------------------------------------
    # Waiting List / Admission Approval / Student ID Auto Generate
    # ---------------------------------------------------------------

    def waitlist_admission(self, aid, remarks=None):
        admission = self.repository.find_by_id(aid)
        if not admission:
            raise AdmissionNotFoundError("Application not found")
        if admission.status == "Approved":
            raise AdmissionValidationError(
                ["This application is already approved and has a linked student record; "
                 "it can't be moved back to the waiting list"]
            )
        self.repository.set_status(aid, "Waiting", remarks)
        logger.info(f"Admission moved to waiting list: {admission.applicant_no}")

    def reject_admission(self, aid, remarks=None):
        admission = self.repository.find_by_id(aid)
        if not admission:
            raise AdmissionNotFoundError("Application not found")
        if admission.status == "Approved":
            raise AdmissionValidationError(
                ["This application is already approved and has a linked student record; "
                 "it can't be rejected"]
            )
        self.repository.set_status(aid, "Rejected", remarks)
        logger.info(f"Admission rejected: {admission.applicant_no}")

    def approve_admission(self, aid, force=False, join_date=None):
        """
        Approves an applicant: checks class seat capacity (unless `force`
        is set by an admin overriding it), then creates the real Student
        record — reusing StudentService, which auto-generates the Student
        ID and the next admission number — and links it back to this
        application.
        """
        admission = self.repository.find_by_id(aid)
        if not admission:
            raise AdmissionNotFoundError("Application not found")
        if admission.status == "Approved":
            raise AdmissionValidationError(["This application is already approved"])

        capacity, taken = self._seats_status(admission.grade_applied)
        if not force and capacity not in (None, 0) and taken >= capacity:
            raise SeatsFullError(
                f"No seats left in {admission.grade_applied} ({taken}/{capacity} filled). "
                "Move to waiting list, or approve anyway to override."
            )

        student_payload = {
            "name": admission.name,
            "grade": admission.grade_applied,
            "gender": admission.gender,
            "dob": admission.dob,
            "phone": admission.phone,
            "email": admission.email,
            "address": admission.address,
            "parent_name": admission.father_name,
            "parent_phone": admission.phone,
            "join_date": join_date or date.today().isoformat(),
            "photo_path": admission.photo_path,
        }
        try:
            sid = self.student_service.create_student(student_payload)
        except StudentValidationError as e:
            raise AdmissionValidationError(e.errors)

        self.repository.mark_approved(aid, sid)
        logger.info(f"Admission approved: {admission.applicant_no} -> student {sid}")
        return {"student_id": sid}
