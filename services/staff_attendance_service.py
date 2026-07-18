"""
Staff attendance service — business logic layer sitting between routes
and the staff attendance repository. Mirrors AttendanceService (student
attendance) but the "roster" is simply every teacher in the school —
there's no class grouping for staff the way there is for students.
"""
import calendar
from datetime import date as date_cls

from repositories.staff_attendance_repository import StaffAttendanceRepository
from utils.validators import validate_staff_attendance_mark_payload
from utils.logger import get_logger

logger = get_logger(__name__)


class StaffAttendanceValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("; ".join(errors))


def _month_range(month, year):
    """Return (start_date, end_date) ISO strings covering a calendar month."""
    month = int(month)
    year = int(year)
    last_day = calendar.monthrange(year, month)[1]
    start = date_cls(year, month, 1).isoformat()
    end = date_cls(year, month, last_day).isoformat()
    return start, end


class StaffAttendanceService:

    def __init__(self, repository: StaffAttendanceRepository):
        self.repository = repository

    def get_roster(self, date):
        """Every teacher, alongside today's attendance status (None if
        not yet marked)."""
        teachers = self.repository.find_all_teachers()
        existing = {
            r["teacher_id"]: r
            for r in self.repository.find_by_date(date)
        }

        roster = []
        for t in teachers:
            rec = existing.get(t["id"])
            roster.append({
                "teacher_id": t["id"],
                "teacher_name": t["name"],
                "subject": t.get("subject"),
                "status": rec["status"] if rec else None,
                "remarks": rec["remarks"] if rec else "",
            })

        return {"date": date, "teachers": roster}

    def mark_attendance(self, data, marked_by):
        errors = validate_staff_attendance_mark_payload(data)
        if errors:
            logger.warning(f"Staff attendance validation failed: {errors} | payload={data}")
            raise StaffAttendanceValidationError(errors)

        date = data["date"]
        self.repository.upsert_bulk(date, data["records"], marked_by)
        logger.info(
            f"Staff attendance marked: date={date} "
            f"records={len(data['records'])} by={marked_by}"
        )

    def get_teacher_history(self, teacher_id, month, year):
        start, end = _month_range(month, year)
        records = self.repository.find_by_teacher_range(teacher_id, start, end)

        present = sum(1 for r in records if r["status"] == "Present")
        absent = sum(1 for r in records if r["status"] == "Absent")
        late = sum(1 for r in records if r["status"] == "Late")
        leave = sum(1 for r in records if r["status"] == "Leave")
        total = len(records)
        percentage = round((present + late) / total * 100, 1) if total else 0.0

        return {
            "teacher_id": teacher_id,
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

    def get_staff_summary(self, month, year):
        start, end = _month_range(month, year)
        rows = self.repository.find_staff_summary(start, end)
        working_days = self.repository.count_marked_days(start, end)

        summary = []
        for r in rows:
            total = r["total_marked"] or 0
            present_like = (r["present_count"] or 0) + (r["late_count"] or 0)
            pct = round(present_like / total * 100, 1) if total else 0.0
            summary.append({**r, "attendance_percentage": pct})

        return {
            "month": month,
            "year": year,
            "working_days": working_days,
            "teachers": summary,
        }
