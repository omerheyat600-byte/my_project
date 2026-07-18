"""
Timetable repository — the only layer allowed to talk directly to SQLite
for timetable data.
"""
from database import transaction
from models.timetable import TimetableSlot, DAYS_OF_WEEK
from repositories.base_repository import BaseRepository

# CASE expression to sort weekdays in natural order rather than alphabetically
_DAY_ORDER_SQL = "CASE day_of_week " + " ".join(
    f"WHEN '{d}' THEN {i}" for i, d in enumerate(DAYS_OF_WEEK)
) + " ELSE 99 END"


class TimetableRepository(BaseRepository):
    table = "timetable"
    id_column = "id"

    def find_class_name(self, class_id):
        row = self._fetchone("SELECT class_name FROM classes WHERE id=?", (class_id,))
        return row["class_name"] if row else None

    def find_by_class(self, class_id):
        rows = self._fetchall(
            f"SELECT * FROM timetable WHERE class_id=? ORDER BY {_DAY_ORDER_SQL}, period_number",
            (class_id,)
        )
        return [TimetableSlot.from_row(r) for r in rows]

    def find_by_teacher(self, teacher_id):
        rows = self._fetchall(f"""
            SELECT t.*, c.class_name
            FROM timetable t
            JOIN classes c ON c.id = t.class_id
            WHERE t.teacher_id=?
            ORDER BY {_DAY_ORDER_SQL}, t.period_number
        """, (teacher_id,))
        return [dict(r) for r in rows]

    def find_teacher_conflict(self, day_of_week, period_number, teacher_id, exclude_class_id=None):
        """Return the class_name a teacher is already booked in for this
        day/period, or None if there's no conflict."""
        sql = """
            SELECT c.class_name FROM timetable t
            JOIN classes c ON c.id = t.class_id
            WHERE t.day_of_week=? AND t.period_number=? AND t.teacher_id=?
        """
        params = [day_of_week, period_number, teacher_id]
        if exclude_class_id is not None:
            sql += " AND t.class_id != ?"
            params.append(exclude_class_id)
        row = self._fetchone(sql, params)
        return row["class_name"] if row else None

    def upsert_slot(self, slot: TimetableSlot):
        with transaction() as db:
            db.execute("""
                INSERT INTO timetable
                    (class_id, day_of_week, period_number, start_time, end_time, subject, teacher_id, teacher_name)
                VALUES (?,?,?,?,?,?,?,?)
                ON DUPLICATE KEY UPDATE
                    start_time=VALUES(start_time),
                    end_time=VALUES(end_time),
                    subject=VALUES(subject),
                    teacher_id=VALUES(teacher_id),
                    teacher_name=VALUES(teacher_name)
            """, (
                slot.class_id, slot.day_of_week, slot.period_number,
                slot.start_time, slot.end_time, slot.subject,
                slot.teacher_id, slot.teacher_name
            ))

    def delete_slot(self, class_id, day_of_week, period_number):
        with transaction() as db:
            db.execute(
                "DELETE FROM timetable WHERE class_id=? AND day_of_week=? AND period_number=?",
                (class_id, day_of_week, period_number)
            )
