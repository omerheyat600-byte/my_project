"""
Repository for the Attendance Risk AI tool.

Purely additive/read-only over the existing `attendance` table — no
new tables. Reuses the same per-student summary query pattern as
repositories/attendance_repository.py, plus a raw per-day fetch (that
one doesn't expose) needed to detect consecutive-absence streaks.
"""
from repositories.base_repository import BaseRepository


class AttendanceRiskRepository(BaseRepository):
    table = "attendance"

    def find_active_students(self, class_name=None):
        if class_name:
            rows = self._fetchall(
                "SELECT id, name, grade FROM students WHERE status='Active' AND grade=? ORDER BY name",
                (class_name,)
            )
        else:
            rows = self._fetchall("SELECT id, name, grade FROM students WHERE status='Active' ORDER BY name")
        return [dict(r) for r in rows]

    def find_student_name_grade(self, student_id):
        row = self._fetchone("SELECT name, grade FROM students WHERE id=?", (student_id,))
        return dict(row) if row else None

    def find_class_id_for_grade(self, class_name):
        row = self._fetchone("SELECT id FROM classes WHERE class_name=?", (class_name,))
        return row["id"] if row else None

    def find_raw_attendance(self, start_date, end_date, class_name=None, student_id=None):
        """Every attendance row (one per student per marked day) in the
        window — used for both the summary counts and streak detection."""
        sql = """
            SELECT a.student_id, a.student_name, s.grade, a.date, a.status
            FROM attendance a
            JOIN students s ON a.student_id = s.id
            WHERE a.date BETWEEN ? AND ? AND s.status = 'Active'
        """
        params = [start_date, end_date]
        if class_name:
            sql += " AND s.grade = ?"
            params.append(class_name)
        if student_id:
            sql += " AND a.student_id = ?"
            params.append(student_id)
        sql += " ORDER BY a.student_id, a.date"
        rows = self._fetchall(sql, tuple(params))
        return [dict(r) for r in rows]
