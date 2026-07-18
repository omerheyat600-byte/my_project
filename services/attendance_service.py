"""
Attendance service — business logic layer sitting between routes and the
attendance repository.
"""
import calendar
from datetime import date as date_cls

from repositories.attendance_repository import AttendanceRepository
from repositories.notification_repository import NotificationRepository
from repositories.settings_repository import SettingsRepository
from utils.validators import validate_attendance_mark_payload
from utils.logger import get_logger
from utils.sms import send_sms

logger = get_logger(__name__)


class AttendanceValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("; ".join(errors))


class ClassNotFoundError(Exception):
    pass


def _month_range(month, year):
    """Return (start_date, end_date) ISO strings covering a calendar month."""
    month = int(month)
    year = int(year)
    last_day = calendar.monthrange(year, month)[1]
    start = date_cls(year, month, 1).isoformat()
    end = date_cls(year, month, last_day).isoformat()
    return start, end


class AttendanceService:

    def __init__(self, repository: AttendanceRepository, notification_repo=None):
        self.repository = repository
        self.notification_repo = notification_repo
        self.settings_repo = SettingsRepository()

    def get_class_roster(self, class_id, date):
        """Return every student in the class alongside today's attendance
        status (None if not yet marked)."""
        class_name = self.repository.find_class_name(class_id)
        if not class_name:
            raise ClassNotFoundError("Class not found")

        students = self.repository.find_students_by_grade(class_name)
        existing = {
            r["student_id"]: r
            for r in self.repository.find_by_class_and_date(class_id, date)
        }

        roster = []
        for s in students:
            rec = existing.get(s["id"])
            roster.append({
                "student_id": s["id"],
                "student_name": s["name"],
                "status": rec["status"] if rec else None,
                "remarks": rec["remarks"] if rec else "",
            })

        return {
            "class_id": class_id,
            "class_name": class_name,
            "date": date,
            "students": roster,
        }

    def mark_attendance(self, data, marked_by):
        errors = validate_attendance_mark_payload(data)
        if errors:
            logger.warning(f"Attendance validation failed: {errors} | payload={data}")
            raise AttendanceValidationError(errors)

        class_id = data["class_id"]
        date = data["date"]

        if not self.repository.find_class_name(class_id):
            raise ClassNotFoundError("Class not found")

        self.repository.upsert_bulk(class_id, date, data["records"], marked_by)
        logger.info(
            f"Attendance marked: class={class_id} date={date} "
            f"records={len(data['records'])} by={marked_by}"
        )

        # Optional SMS alert to parents when a student is marked Absent/Late,
        # controlled by the 'sms_alerts_enabled' school setting.
        sms_enabled = self.settings_repo.get_setting('sms_alerts_enabled', 'false') == 'true'
        if sms_enabled:
            for record in data['records']:
                if record.get('status') in ('Absent', 'Late'):
                    student_id = record['student_id']
                    student = self._get_student_phone(student_id)
                    if student and student.get('parent_phone'):
                        message = (
                            f"Dear Parent, your child {student['name']} was marked "
                            f"{record['status']} on {date}. Please contact the school for details."
                        )
                        success, error = send_sms(student['parent_phone'], message)
                        status = 'sent' if success else 'failed'
                        if self.notification_repo:
                            self.notification_repo.log(
                                student_id=student_id,
                                parent_phone=student['parent_phone'],
                                message=message,
                                status=status,
                                error=error,
                                related_to='attendance',
                                related_id=None,
                            )
                        if not success:
                            logger.error(f"SMS failed for {student_id}: {error}")

    def _get_student_phone(self, student_id):
        row = self.repository._fetchone("SELECT name, parent_phone FROM students WHERE id=?", (student_id,))
        return dict(row) if row else None

    def get_student_history(self, student_id, month, year):
        start, end = _month_range(month, year)
        records = self.repository.find_by_student_range(student_id, start, end)

        present = sum(1 for r in records if r["status"] == "Present")
        absent = sum(1 for r in records if r["status"] == "Absent")
        late = sum(1 for r in records if r["status"] == "Late")
        leave = sum(1 for r in records if r["status"] == "Leave")
        total = len(records)
        percentage = round((present + late) / total * 100, 1) if total else 0.0

        return {
            "student_id": student_id,
            "month": month,
            "year": year,
            "records": records,
            "present_count": present,
            "absent_count": absent,
            "late_count": late,
            "leave_count": leave,
            "total_marked": total,
            "attendance_percentage": percentage,
        }

    def get_class_summary(self, class_id, month, year):
        class_name = self.repository.find_class_name(class_id)
        if not class_name:
            raise ClassNotFoundError("Class not found")

        start, end = _month_range(month, year)
        rows = self.repository.find_class_summary(class_id, start, end)
        working_days = self.repository.count_marked_days(class_id, start, end)

        summary = []
        for r in rows:
            total = r["total_marked"] or 0
            present_like = (r["present_count"] or 0) + (r["late_count"] or 0)
            pct = round(present_like / total * 100, 1) if total else 0.0
            summary.append({**r, "attendance_percentage": pct})

        return {
            "class_id": class_id,
            "class_name": class_name,
            "month": month,
            "year": year,
            "working_days": working_days,
            "students": summary,
        }
