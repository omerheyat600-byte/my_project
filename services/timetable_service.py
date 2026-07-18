"""
Timetable service — business logic layer sitting between routes and the
timetable repository.
"""
from models.timetable import TimetableSlot, DAYS_OF_WEEK
from repositories.timetable_repository import TimetableRepository
from utils.validators import validate_timetable_slot_payload
from utils.logger import get_logger

logger = get_logger(__name__)


class TimetableValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("; ".join(errors))


class ClassNotFoundError(Exception):
    pass


class TeacherConflictError(Exception):
    """Raised when a teacher is already booked in another class for the
    same day/period."""
    pass


class TimetableService:

    def __init__(self, repository: TimetableRepository):
        self.repository = repository

    def get_class_timetable(self, class_id):
        class_name = self.repository.find_class_name(class_id)
        if not class_name:
            raise ClassNotFoundError("Class not found")

        slots = self.repository.find_by_class(class_id)
        max_period = max([s.period_number for s in slots], default=0)

        return {
            "class_id": class_id,
            "class_name": class_name,
            "days": DAYS_OF_WEEK,
            "max_period": max(max_period, 6),  # always show at least 6 period rows
            "slots": [s.to_dict() for s in slots],
        }

    def save_slot(self, data):
        errors = validate_timetable_slot_payload(data)
        if errors:
            logger.warning(f"Timetable validation failed: {errors} | payload={data}")
            raise TimetableValidationError(errors)

        class_id = data["class_id"]
        day_of_week = data["day_of_week"]
        period_number = int(data["period_number"])
        teacher_id = data.get("teacher_id") or None

        if not self.repository.find_class_name(class_id):
            raise ClassNotFoundError("Class not found")

        if teacher_id:
            conflict_class = self.repository.find_teacher_conflict(
                day_of_week, period_number, teacher_id, exclude_class_id=class_id
            )
            if conflict_class:
                raise TeacherConflictError(
                    f"This teacher is already scheduled in {conflict_class} "
                    f"on {day_of_week}, period {period_number}"
                )

        slot = TimetableSlot(
            id=None,
            class_id=class_id,
            day_of_week=day_of_week,
            period_number=period_number,
            start_time=data.get("start_time"),
            end_time=data.get("end_time"),
            subject=data["subject"],
            teacher_id=teacher_id,
            teacher_name=data.get("teacher_name"),
        )
        self.repository.upsert_slot(slot)
        logger.info(
            f"Timetable slot saved: class={class_id} {day_of_week} period={period_number} "
            f"subject={slot.subject}"
        )

    def delete_slot(self, class_id, day_of_week, period_number):
        if day_of_week not in DAYS_OF_WEEK:
            raise TimetableValidationError([f"day_of_week must be one of {', '.join(DAYS_OF_WEEK)}"])

        self.repository.delete_slot(class_id, day_of_week, int(period_number))
        logger.info(f"Timetable slot deleted: class={class_id} {day_of_week} period={period_number}")

    def get_teacher_timetable(self, teacher_id):
        slots = self.repository.find_by_teacher(teacher_id)
        return {
            "teacher_id": teacher_id,
            "days": DAYS_OF_WEEK,
            "slots": slots,
        }
