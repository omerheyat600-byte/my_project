"""
Repository for the Fee Prediction AI tool.

Purely additive/read-only over the existing `fees` table — no new
tables. Money is involved here, so every number this tool reports
(risk score, outstanding balance, predicted collection) is computed
by plain SQL/Python from real fee records — never generated or
guessed by AI.
"""
from repositories.base_repository import BaseRepository


class FeePredictionRepository(BaseRepository):
    table = "fees"

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

    def find_all_fee_history(self, class_name=None):
        """Every non-voided fee record for every active student, for
        school-wide/class-wide risk scoring in one query (avoids N+1)."""
        sql = """
            SELECT f.student_id, f.student_name, s.grade, f.fee_type, f.month, f.amount,
                   f.paid_amount, f.status, f.due_date, f.paid_date,
                   f.discount_amount, f.fine_amount
            FROM fees f
            JOIN students s ON f.student_id = s.id
            WHERE (f.is_voided = 0 OR f.is_voided IS NULL) AND s.status = 'Active'
        """
        params = []
        if class_name:
            sql += " AND s.grade = ?"
            params.append(class_name)
        sql += " ORDER BY f.student_id, f.due_date"
        rows = self._fetchall(sql, tuple(params))
        return [dict(r) for r in rows]

    def find_fee_history_for_student(self, student_id):
        rows = self._fetchall("""
            SELECT fee_type, month, amount, paid_amount, status, due_date, paid_date,
                   discount_amount, fine_amount
            FROM fees
            WHERE student_id=? AND (is_voided=0 OR is_voided IS NULL)
            ORDER BY due_date
        """, (student_id,))
        return [dict(r) for r in rows]
