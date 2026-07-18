"""
Teacher service — business logic layer sitting between routes and the
teacher repository.
"""
from database import rand_id
from models.teacher import Teacher
from repositories.teacher_repository import TeacherRepository
from utils.validators import validate_teacher_payload
from utils.logger import get_logger

logger = get_logger(__name__)


class TeacherNotFoundError(Exception):
    pass


class TeacherValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("; ".join(errors))


class TeacherService:

    def __init__(self, repository: TeacherRepository):
        self.repository = repository

    def list_teachers(self, query="", subject_filter=""):
        teachers = self.repository.find_all(query, subject_filter)
        subjects = self.repository.find_distinct_subjects()
        return {
            "teachers": [t.to_dict() for t in teachers],
            "subjects": subjects,
        }

    def get_teacher(self, tid):
        teacher = self.repository.find_by_id(tid)
        if not teacher:
            logger.warning(f"Teacher lookup failed — not found: {tid}")
            raise TeacherNotFoundError("Teacher not found")
        return teacher.to_dict()

    def create_teacher(self, data):
        errors = validate_teacher_payload(data)
        if errors:
            logger.warning(f"Teacher validation failed: {errors} | payload={data}")
            raise TeacherValidationError(errors)

        tid = rand_id("TCH")
        teacher = Teacher.from_dict(data, id=tid)
        self.repository.create(teacher)
        logger.info(f"Teacher created: {tid} ({teacher.name})")
        return tid

    def update_teacher(self, tid, data):
        errors = validate_teacher_payload(data)
        if errors:
            logger.warning(f"Teacher validation failed on update: {errors} | id={tid}")
            raise TeacherValidationError(errors)

        if not self.repository.exists(tid):
            logger.warning(f"Teacher update failed — not found: {tid}")
            raise TeacherNotFoundError("Teacher not found")

        teacher = Teacher.from_dict(data, id=tid)
        self.repository.update(tid, teacher)
        logger.info(f"Teacher updated: {tid}")

    def delete_teacher(self, tid):
        if not self.repository.exists(tid):
            logger.warning(f"Teacher delete failed — not found: {tid}")
            raise TeacherNotFoundError("Teacher not found")

        self.repository.delete(tid)
        logger.info(f"Teacher deleted: {tid}")

    def list_id_name(self):
        return self.repository.find_id_name_list()
