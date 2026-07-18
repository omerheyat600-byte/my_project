"""
Class service — business logic layer sitting between routes and the
class repository. Also owns class-subject management, since subjects
are always scoped to (and meaningless without) a class.
"""
import pymysql

from models.school_class import SchoolClass
from repositories.class_repository import ClassRepository
from utils.validators import validate_class_payload, validate_class_subject_payload
from utils.logger import get_logger

logger = get_logger(__name__)


class ClassNotFoundError(Exception):
    pass


class ClassValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("; ".join(errors))


class DuplicateClassNameError(Exception):
    pass


class SubjectLimitExceededError(Exception):
    pass


class DuplicateSubjectError(Exception):
    pass


class ClassService:

    def __init__(self, repository: ClassRepository):
        self.repository = repository

    # ---------- Classes ----------

    def list_classes(self, query=""):
        classes = self.repository.find_all(query)
        return {"classes": [c.to_dict() for c in classes]}

    def get_class(self, cid):
        school_class = self.repository.find_by_id(cid)
        if not school_class:
            logger.warning(f"Class lookup failed — not found: {cid}")
            raise ClassNotFoundError("Class not found")
        return school_class.to_dict()

    def create_class(self, data):
        errors = validate_class_payload(data)
        if errors:
            logger.warning(f"Class validation failed: {errors} | payload={data}")
            raise ClassValidationError(errors)

        if self.repository.find_by_name(data['class_name']):
            logger.warning(f"Class create failed — duplicate name: {data['class_name']}")
            raise DuplicateClassNameError("Class name already exists")

        teacher_id = data.get('class_teacher', '')
        teacher_name = self.repository.find_teacher_name(teacher_id) if teacher_id else None

        school_class = SchoolClass.from_dict(data, class_teacher_name=teacher_name)
        new_id = self.repository.create(school_class)
        logger.info(f"Class created: {new_id} ({school_class.class_name})")
        return new_id

    def update_class(self, cid, data):
        errors = validate_class_payload(data)
        if errors:
            logger.warning(f"Class validation failed on update: {errors} | id={cid}")
            raise ClassValidationError(errors)

        if not self.repository.exists(cid):
            logger.warning(f"Class update failed — not found: {cid}")
            raise ClassNotFoundError("Class not found")

        if self.repository.find_by_name(data['class_name'], exclude_id=cid):
            logger.warning(f"Class update failed — duplicate name: {data['class_name']}")
            raise DuplicateClassNameError("Class name already exists")

        teacher_id = data.get('class_teacher', '')
        teacher_name = self.repository.find_teacher_name(teacher_id) if teacher_id else None

        school_class = SchoolClass.from_dict(data, id=cid, class_teacher_name=teacher_name)
        self.repository.update(cid, school_class)
        logger.info(f"Class updated: {cid}")

    def delete_class(self, cid):
        if not self.repository.exists(cid):
            logger.warning(f"Class delete failed — not found: {cid}")
            raise ClassNotFoundError("Class not found")

        self.repository.delete(cid)
        logger.info(f"Class deleted: {cid}")

    # ---------- Class subjects ----------

    def list_subjects(self, class_id):
        if not self.repository.exists(class_id):
            raise ClassNotFoundError("Class not found")

        if not self.repository.class_subjects_table_exists():
            # Surfaced as a 500 by the route — this indicates the schema
            # wasn't initialized correctly, not a user error.
            raise RuntimeError("class_subjects table missing. Run init_db()")

        subjects = self.repository.find_subjects(class_id)
        return {"subjects": [s.to_dict() for s in subjects]}

    def add_subject(self, class_id, data):
        errors = validate_class_subject_payload(data)
        if errors:
            logger.warning(f"Class-subject validation failed: {errors} | class_id={class_id}")
            raise ClassValidationError(errors)

        subject_name = data.get('subject_name', '').strip()
        try:
            max_marks = int(data.get('max_marks', 100))
        except (TypeError, ValueError):
            max_marks = 100

        max_allowed = self.repository.get_max_subjects(class_id)
        if max_allowed is None:
            logger.warning(f"Add subject failed — class not found: {class_id}")
            raise ClassNotFoundError("Class not found")

        current_count = self.repository.count_subjects(class_id)
        if current_count >= max_allowed:
            logger.warning(
                f"Add subject failed — limit reached for class {class_id} "
                f"({current_count}/{max_allowed})"
            )
            raise SubjectLimitExceededError(
                f"Cannot add subject. This class already has {current_count} "
                f"subject(s) (max {max_allowed})."
            )

        try:
            self.repository.add_subject(class_id, subject_name, max_marks)
        except pymysql.err.IntegrityError:
            logger.warning(f"Add subject failed — duplicate: {subject_name} in class {class_id}")
            raise DuplicateSubjectError("Subject already exists for this class")

        logger.info(f"Subject added: {subject_name} to class {class_id}")

    def remove_subject(self, class_id, subject_name):
        subject_name = subject_name.strip()
        self.repository.remove_subject(class_id, subject_name)
        logger.info(f"Subject removed: {subject_name} from class {class_id}")

    def update_subject_max(self, class_id, subject_name, data):
        try:
            new_max = int(data.get('max_marks', 0))
        except (TypeError, ValueError):
            raise ClassValidationError(["Invalid max marks"])

        if new_max <= 0:
            raise ClassValidationError(["Max marks must be greater than 0"])

        subject_name = subject_name.strip()
        self.repository.update_subject_max(class_id, subject_name, new_max)
        logger.info(f"Subject max marks updated: {subject_name} in class {class_id} -> {new_max}")
