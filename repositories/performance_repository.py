"""
Repository for the Performance Analysis AI tool.

Purely additive/read-only: reuses the exam_sessions / student_results /
student_result_subjects tables that repositories/exam_repository.py
already writes to (Examination module). No new tables — this is
analysis over data that already exists.
"""
from repositories.base_repository import BaseRepository


class PerformanceRepository(BaseRepository):
    table = "student_results"

    def find_student_name(self, student_id):
        row = self._fetchone("SELECT name FROM students WHERE id=?", (student_id,))
        return row["name"] if row else None

    def find_result_history(self, student_id):
        """Every exam this student has a locked/entered result for, oldest first."""
        rows = self._fetchall("""
            SELECT sr.exam_id, es.term, es.year, es.exam_date, c.class_name,
                   sr.total_obtained, sr.total_marks, sr.percentage, sr.grade, sr.position
            FROM student_results sr
            JOIN exam_sessions es ON sr.exam_id = es.id
            JOIN classes c ON es.class_id = c.id
            WHERE sr.student_id=?
            ORDER BY es.year, es.term, es.exam_date
        """, (student_id,))
        return [dict(r) for r in rows]

    def find_subject_history(self, student_id):
        """Every subject-level mark this student has, across all exams, oldest first."""
        rows = self._fetchall("""
            SELECT srs.exam_id, es.term, es.year, es.exam_date, srs.subject,
                   srs.obtained_marks, srs.total_marks
            FROM student_result_subjects srs
            JOIN exam_sessions es ON srs.exam_id = es.id
            WHERE srs.student_id=?
            ORDER BY es.year, es.term, es.exam_date
        """, (student_id,))
        return [dict(r) for r in rows]

    def find_class_average_for_exam(self, exam_id):
        row = self._fetchone(
            "SELECT AVG(percentage) as avg_pct FROM student_results WHERE exam_id=?",
            (exam_id,)
        )
        return round(row["avg_pct"], 2) if row and row["avg_pct"] is not None else None
