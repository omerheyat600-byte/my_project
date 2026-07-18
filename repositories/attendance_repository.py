"""
Attendance repository — the only layer allowed to talk directly to SQLite
for attendance data.
"""
from database import transaction
from repositories.base_repository import BaseRepository


class AttendanceRepository(BaseRepository):
    table = "attendance"
    id_column = "id"

    # ---------- Roster helpers (mirrors the class_id -> grade lookup
    # pattern already used by ExamRepository) ----------

    def find_class_name(self, class_id):
        row = self._fetchone("SELECT class_name FROM classes WHERE id=?", (class_id,))
        return row["class_name"] if row else None

    def find_students_by_grade(self, class_name):
        rows = self._fetchall(
            "SELECT id, name FROM students WHERE grade=? ORDER BY name",
            (class_name,)
        )
        return [dict(r) for r in rows]

    # ---------- Marking ----------

    def find_by_class_and_date(self, class_id, date):
        rows = self._fetchall(
            "SELECT * FROM attendance WHERE class_id=? AND date=?",
            (class_id, date)
        )
        return [dict(r) for r in rows]

    def upsert_bulk(self, class_id, date, records, marked_by):
        """
        Insert or update one attendance row per student for a given class/date.
        `records` is a list of dicts: {student_id, student_name, status, remarks}.
        Relies on the UNIQUE(student_id, date) constraint.
        """
        with transaction() as db:
            for r in records:
                db.execute("""
                    INSERT INTO attendance
                        (student_id, student_name, class_id, date, status, remarks, marked_by, marked_at)
                    VALUES (?,?,?,?,?,?,?, CURRENT_TIMESTAMP)
                    ON DUPLICATE KEY UPDATE
                        status=VALUES(status),
                        remarks=VALUES(remarks),
                        class_id=VALUES(class_id),
                        student_name=VALUES(student_name),
                        marked_by=VALUES(marked_by),
                        marked_at=CURRENT_TIMESTAMP
                """, (
                    r["student_id"], r.get("student_name"), class_id, date,
                    r["status"], r.get("remarks"), marked_by
                ))

    # ---------- Reporting ----------

    def find_by_student_range(self, student_id, start_date, end_date):
        rows = self._fetchall("""
            SELECT * FROM attendance
            WHERE student_id=? AND date BETWEEN ? AND ?
            ORDER BY date
        """, (student_id, start_date, end_date))
        return [dict(r) for r in rows]

    def find_class_summary(self, class_id, start_date, end_date):
        """Per-student present/absent/late/leave counts for a class over a date range."""
        rows = self._fetchall("""
            SELECT
                student_id,
                student_name,
                SUM(CASE WHEN status='Present' THEN 1 ELSE 0 END) AS present_count,
                SUM(CASE WHEN status='Absent'  THEN 1 ELSE 0 END) AS absent_count,
                SUM(CASE WHEN status='Late'    THEN 1 ELSE 0 END) AS late_count,
                SUM(CASE WHEN status='Leave'   THEN 1 ELSE 0 END) AS leave_count,
                COUNT(*) AS total_marked
            FROM attendance
            WHERE class_id=? AND date BETWEEN ? AND ?
            GROUP BY student_id, student_name
            ORDER BY student_name
        """, (class_id, start_date, end_date))
        return [dict(r) for r in rows]

    def count_marked_days(self, class_id, start_date, end_date):
        """Number of distinct calendar days attendance was taken for this class."""
        row = self._fetchone("""
            SELECT COUNT(DISTINCT date) AS c FROM attendance
            WHERE class_id=? AND date BETWEEN ? AND ?
        """, (class_id, start_date, end_date))
        return row["c"] if row else 0
