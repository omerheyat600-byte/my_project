"""
Staff attendance repository — the only layer allowed to talk directly
to SQLite for staff_attendance data. Mirrors AttendanceRepository's
shape, minus the class_id/grade roster lookup since staff attendance
is one whole-school roster per day rather than per-class.
"""
from database import transaction
from repositories.base_repository import BaseRepository


class StaffAttendanceRepository(BaseRepository):
    table = "staff_attendance"
    id_column = "id"

    # ---------- Roster ----------

    def find_all_teachers(self):
        rows = self._fetchall("SELECT id, name, subject FROM teachers ORDER BY name")
        return [dict(r) for r in rows]

    # ---------- Marking ----------

    def find_by_date(self, date):
        rows = self._fetchall("SELECT * FROM staff_attendance WHERE date=?", (date,))
        return [dict(r) for r in rows]

    def upsert_bulk(self, date, records, marked_by):
        """
        Insert or update one attendance row per teacher for a given date.
        `records` is a list of dicts: {teacher_id, teacher_name, status, remarks}.
        Relies on the UNIQUE(teacher_id, date) constraint.
        """
        with transaction() as db:
            for r in records:
                db.execute("""
                    INSERT INTO staff_attendance
                        (teacher_id, teacher_name, date, status, remarks, marked_by, marked_at)
                    VALUES (?,?,?,?,?,?, CURRENT_TIMESTAMP)
                    ON DUPLICATE KEY UPDATE
                        status=VALUES(status),
                        remarks=VALUES(remarks),
                        teacher_name=VALUES(teacher_name),
                        marked_by=VALUES(marked_by),
                        marked_at=CURRENT_TIMESTAMP
                """, (
                    r["teacher_id"], r.get("teacher_name"), date,
                    r["status"], r.get("remarks"), marked_by
                ))

    # ---------- Reporting ----------

    def find_by_teacher_range(self, teacher_id, start_date, end_date):
        rows = self._fetchall("""
            SELECT * FROM staff_attendance
            WHERE teacher_id=? AND date BETWEEN ? AND ?
            ORDER BY date
        """, (teacher_id, start_date, end_date))
        return [dict(r) for r in rows]

    def find_staff_summary(self, start_date, end_date):
        """Per-teacher present/absent/late/leave counts over a date range."""
        rows = self._fetchall("""
            SELECT
                teacher_id,
                teacher_name,
                SUM(CASE WHEN status='Present' THEN 1 ELSE 0 END) AS present_count,
                SUM(CASE WHEN status='Absent'  THEN 1 ELSE 0 END) AS absent_count,
                SUM(CASE WHEN status='Late'    THEN 1 ELSE 0 END) AS late_count,
                SUM(CASE WHEN status='Leave'   THEN 1 ELSE 0 END) AS leave_count,
                COUNT(*) AS total_marked
            FROM staff_attendance
            WHERE date BETWEEN ? AND ?
            GROUP BY teacher_id, teacher_name
            ORDER BY teacher_name
        """, (start_date, end_date))
        return [dict(r) for r in rows]

    def count_marked_days(self, start_date, end_date):
        """Number of distinct calendar days staff attendance was taken."""
        row = self._fetchone("""
            SELECT COUNT(DISTINCT date) AS c FROM staff_attendance
            WHERE date BETWEEN ? AND ?
        """, (start_date, end_date))
        return row["c"] if row else 0
