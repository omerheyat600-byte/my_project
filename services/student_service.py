"""
Student service — business logic layer sitting between routes and the
student repository.
"""
import re
from datetime import date

from database import rand_id
from models.student import Student
from repositories.student_repository import StudentRepository
from utils.validators import validate_student_payload
from utils.logger import get_logger

logger = get_logger(__name__)


class StudentNotFoundError(Exception):
    pass


class StudentValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("; ".join(errors))


class StudentService:

    def __init__(self, repository: StudentRepository):
        self.repository = repository

    def list_students(self, query="", grade_filter=""):
        students = self.repository.find_all(query, grade_filter)
        grades = self.repository.find_distinct_grades()
        return {
            "students": [s.to_dict() for s in students],
            "grades": grades,
        }

    def get_student(self, sid):
        student = self.repository.find_by_id(sid)
        if not student:
            logger.warning(f"Student lookup failed — not found: {sid}")
            raise StudentNotFoundError("Student not found")
        return student.to_dict()

    def get_next_admission_no(self):
        """Suggested next admission number for the Add Student form to
        pre-fill (editable/overridable by the user before saving)."""
        return self.repository.find_next_admission_no(date.today().year)

    def create_student(self, data):
        errors = validate_student_payload(data)
        if errors:
            logger.warning(f"Student validation failed: {errors} | payload={data}")
            raise StudentValidationError(errors)

        admission_no = (data.get('admission_no') or '').strip()
        if admission_no:
            if self.repository.admission_no_exists(admission_no):
                raise StudentValidationError([f"Admission No. '{admission_no}' is already in use"])
        else:
            # Not supplied — assign the next one automatically rather than
            # leaving the record without one; every enrolled student should
            # have an admission number for the printed admission form / register.
            admission_no = self.repository.find_next_admission_no(date.today().year)

        sid = rand_id("STU")
        student = Student.from_dict({**data, 'admission_no': admission_no}, id=sid)
        self.repository.create(student)
        logger.info(f"Student created: {sid} ({student.name}), admission_no={admission_no}")
        return sid

    def update_student(self, sid, data):
        errors = validate_student_payload(data)
        if errors:
            logger.warning(f"Student validation failed on update: {errors} | id={sid}")
            raise StudentValidationError(errors)

        existing = self.repository.find_by_id(sid)
        if not existing:
            logger.warning(f"Student update failed — not found: {sid}")
            raise StudentNotFoundError("Student not found")

        # The edit form doesn't send `photo_path` — it's managed by the
        # dedicated photo upload endpoint — so fall back to whatever photo
        # is already on file rather than wiping it out on every edit.
        if 'photo_path' not in data or not data.get('photo_path'):
            data = {**data, 'photo_path': existing.photo_path}

        # Same idea for roll_no: it's normally managed by the Promotion
        # module (auto reset) or the dedicated reset-roll-numbers action,
        # not the edit form — so an edit that doesn't mention it shouldn't
        # blank out whatever roll number is already on file. An explicit
        # roll_no in the payload (including "" to clear it) still wins.
        if 'roll_no' not in data:
            data = {**data, 'roll_no': existing.roll_no}

        admission_no = (data.get('admission_no') or '').strip()
        if admission_no:
            if self.repository.admission_no_exists(admission_no, exclude_id=sid):
                raise StudentValidationError([f"Admission No. '{admission_no}' is already in use"])
        else:
            # Don't silently blank out an existing admission number just
            # because the edit form round-tripped an empty value.
            admission_no = existing.admission_no

        student = Student.from_dict({**data, 'admission_no': admission_no}, id=sid)
        self.repository.update(sid, student)
        logger.info(f"Student updated: {sid}")

    def set_photo(self, sid, photo_path):
        if not self.repository.exists(sid):
            raise StudentNotFoundError("Student not found")
        self.repository.set_photo_path(sid, photo_path)
        logger.info(f"Student photo updated: {sid}")

    def reset_roll_numbers(self, grade):
        """Re-assign roll numbers 1..N (alphabetical by name) to every
        Active student in `grade`. Used for a manual re-shuffle outside
        the Promotion flow — e.g. after new admissions land directly in
        a class without going through a promotion batch."""
        if not grade:
            raise StudentValidationError(["grade is required"])
        updated = self.repository.reset_roll_numbers_for_class(grade)
        logger.info(f"Roll numbers reset for class '{grade}': {updated} student(s)")
        return updated

    def set_roll_no(self, sid, roll_no):
        if not self.repository.exists(sid):
            raise StudentNotFoundError("Student not found")
        parsed = Student._parse_roll_no(roll_no)
        self.repository.set_roll_no(sid, parsed)
        logger.info(f"Roll number set manually: {sid} -> {parsed}")

    def delete_student(self, sid):
        if not self.repository.exists(sid):
            logger.warning(f"Student delete failed — not found: {sid}")
            raise StudentNotFoundError("Student not found")

        self.repository.delete(sid)
        logger.info(f"Student deleted: {sid}")

    def list_id_name(self):
        return self.repository.find_id_name_list()

    def fix_student_grades(self):
        """
        Repairs legacy "Grade N" values on the students table by matching
        them against the current class list (e.g. "Grade 10" -> "Grade 10 - A").
        All matched rows are applied in a single transaction.
        """
        class_map = self.repository.find_all_class_names()
        students = self.repository.find_all_with_grade()

        updates = []
        for student in students:
            old_grade = student['grade']
            match = re.search(r'Grade\s+(\d+)', old_grade, re.IGNORECASE)
            if not match:
                continue

            grade_num = match.group(1)
            possible_class = None
            for class_name in class_map:
                if class_name.startswith(f"Grade {grade_num}"):
                    possible_class = class_name
                    break

            if possible_class and old_grade != possible_class:
                updates.append((student['id'], possible_class))

        updated = self.repository.bulk_update_grades(updates)
        logger.info(f"Student grade repair complete: {updated} student(s) updated")
        return updated
