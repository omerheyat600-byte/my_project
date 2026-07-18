"""
Report repository — read-only aggregate queries used by the Reports /
Analytics page. Pulls from students, fees, attendance, exam_sessions /
student_results, and expenses. Nothing here writes to the database.
"""
from repositories.base_repository import BaseRepository


class ReportRepository(BaseRepository):
    table = "students"

    # ---------- Enrollment ----------

    def enrollment_total(self):
        row = self._fetchone("SELECT COUNT(*) c FROM students")
        return row["c"] if row else 0

    def enrollment_by_grade(self):
        rows = self._fetchall("""
            SELECT grade, COUNT(*) c FROM students GROUP BY grade ORDER BY grade
        """)
        return [dict(r) for r in rows]

    def enrollment_by_gender(self):
        rows = self._fetchall("""
            SELECT COALESCE(NULLIF(TRIM(gender), ''), 'Unspecified') as gender, COUNT(*) c
            FROM students GROUP BY gender
        """)
        return [dict(r) for r in rows]

    def enrollment_trend(self):
        """Students joined per calendar month, wherever join_date is set."""
        rows = self._fetchall("""
            SELECT DATE_FORMAT(join_date, '%%Y-%%m') as month, COUNT(*) c
            FROM students
            WHERE join_date IS NOT NULL AND join_date != ''
            GROUP BY month
            ORDER BY month
        """)
        return [dict(r) for r in rows]

    # ---------- Fees ----------

    def fees_summary(self, start, end):
        row = self._fetchone("""
            SELECT
                COALESCE(SUM(amount - COALESCE(discount_amount,0) + COALESCE(fine_amount,0)), 0) as total_billed,
                COALESCE(SUM(paid_amount), 0) as total_collected,
                COALESCE(SUM((amount - COALESCE(discount_amount,0) + COALESCE(fine_amount,0)) - paid_amount), 0) as total_pending
            FROM fees
            WHERE due_date BETWEEN ? AND ?
        """, (start, end))
        return dict(row) if row else {"total_billed": 0, "total_collected": 0, "total_pending": 0}

    def fees_by_month(self, start, end):
        rows = self._fetchall("""
            SELECT month, COALESCE(SUM(paid_amount), 0) collected,
                   COALESCE(SUM(amount - COALESCE(discount_amount,0) + COALESCE(fine_amount,0)), 0) billed
            FROM fees
            WHERE due_date BETWEEN ? AND ?
            GROUP BY month
            ORDER BY month
        """, (start, end))
        return [dict(r) for r in rows]

    def fees_by_status(self, start, end):
        rows = self._fetchall("""
            SELECT status, COUNT(*) c,
                   COALESCE(SUM(amount - COALESCE(discount_amount,0) + COALESCE(fine_amount,0)), 0) total
            FROM fees
            WHERE due_date BETWEEN ? AND ?
            GROUP BY status
        """, (start, end))
        return [dict(r) for r in rows]

    def fees_detail(self, start, end):
        rows = self._fetchall("""
            SELECT id, student_id, student_name, fee_type, month, amount, paid_amount, status, due_date, paid_date
            FROM fees
            WHERE due_date BETWEEN ? AND ?
            ORDER BY due_date DESC
        """, (start, end))
        return [dict(r) for r in rows]

    # ---------- Attendance ----------

    def attendance_summary(self, start, end):
        rows = self._fetchall("""
            SELECT status, COUNT(*) c
            FROM attendance
            WHERE date BETWEEN ? AND ?
            GROUP BY status
        """, (start, end))
        return [dict(r) for r in rows]

    def attendance_by_class(self, start, end):
        rows = self._fetchall("""
            SELECT c.class_name,
                   SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) as present,
                   COUNT(*) as total
            FROM attendance a
            JOIN classes c ON a.class_id = c.id
            WHERE a.date BETWEEN ? AND ?
            GROUP BY c.class_name
            ORDER BY c.class_name
        """, (start, end))
        return [dict(r) for r in rows]

    def attendance_detail(self, start, end):
        rows = self._fetchall("""
            SELECT a.date, a.student_id, a.student_name, c.class_name, a.status, a.remarks
            FROM attendance a
            LEFT JOIN classes c ON a.class_id = c.id
            WHERE a.date BETWEEN ? AND ?
            ORDER BY a.date DESC
        """, (start, end))
        return [dict(r) for r in rows]

    # ---------- Academic ----------

    def academic_by_exam(self):
        rows = self._fetchall("""
            SELECT es.id as exam_id, es.term, es.year, c.class_name,
                   AVG(sr.percentage) as avg_percentage,
                   COUNT(sr.id) as student_count
            FROM exam_sessions es
            JOIN classes c ON es.class_id = c.id
            LEFT JOIN student_results sr ON sr.exam_id = es.id
            GROUP BY es.id
            ORDER BY es.exam_date DESC
        """)
        return [dict(r) for r in rows]

    def academic_grade_distribution(self, exam_id=None):
        if exam_id:
            rows = self._fetchall(
                "SELECT grade, COUNT(*) c FROM student_results WHERE exam_id = ? GROUP BY grade",
                (exam_id,)
            )
        else:
            rows = self._fetchall("SELECT grade, COUNT(*) c FROM student_results GROUP BY grade")
        return [dict(r) for r in rows]

    def academic_detail(self, exam_id=None):
        sql = """
            SELECT sr.student_id, sr.student_name, es.term, es.year, c.class_name,
                   sr.total_obtained, sr.total_marks, sr.percentage, sr.grade, sr.position
            FROM student_results sr
            JOIN exam_sessions es ON sr.exam_id = es.id
            JOIN classes c ON es.class_id = c.id
        """
        params = ()
        if exam_id:
            sql += " WHERE sr.exam_id = ?"
            params = (exam_id,)
        sql += " ORDER BY es.exam_date DESC, sr.percentage DESC"
        rows = self._fetchall(sql, params)
        return [dict(r) for r in rows]

    # ---------- Financial (fee collection vs. expenses) ----------

    def expenses_summary(self, start, end):
        row = self._fetchone(
            "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date BETWEEN ? AND ?",
            (start, end)
        )
        return row["total"] if row else 0

    def expenses_by_category(self, start, end):
        rows = self._fetchall("""
            SELECT category, COALESCE(SUM(amount), 0) as total
            FROM expenses
            WHERE date BETWEEN ? AND ?
            GROUP BY category
            ORDER BY total DESC
        """, (start, end))
        return [dict(r) for r in rows]
