"""
Dashboard repository — read-only aggregate queries pulled from several
tables (students, teachers, classes, fees, results) for the summary
dashboard.
"""
from database import get_db


class DashboardRepository:

    def counts(self):
        db = get_db()
        try:
            students = db.execute("SELECT COUNT(*) c FROM students").fetchone()["c"]
            teachers = db.execute("SELECT COUNT(*) c FROM teachers").fetchone()["c"]
            classes = db.execute("SELECT COUNT(*) c FROM classes").fetchone()["c"]
            return students, teachers, classes
        finally:
            db.close()

    def fees_collected(self):
        db = get_db()
        try:
            return db.execute("""
                SELECT COALESCE(SUM(paid_amount),0) s
                FROM fees
                WHERE status IN ('Paid', 'Partial')
            """).fetchone()["s"]
        finally:
            db.close()

    def fees_pending(self):
        db = get_db()
        try:
            return db.execute("""
                SELECT COALESCE(SUM((amount - COALESCE(discount_amount,0) + COALESCE(fine_amount,0)) - COALESCE(paid_amount,0)),0) s
                FROM fees
                WHERE status != 'Paid'
            """).fetchone()["s"]
        finally:
            db.close()

    def recent_fees(self, limit=6):
        db = get_db()
        try:
            return [
                dict(row) for row in db.execute(
                    "SELECT * FROM fees ORDER BY id DESC LIMIT ?", (limit,)
                ).fetchall()
            ]
        finally:
            db.close()

    def results_by_grade(self):
        db = get_db()
        try:
            rows = db.execute("""
                SELECT grade, COUNT(*) c
                FROM results
                GROUP BY grade
            """).fetchall()
            return [r["grade"] for r in rows], [r["c"] for r in rows]
        finally:
            db.close()

    def fee_monthly(self, year):
        db = get_db()
        try:
            rows = db.execute("""
                SELECT
                    DATE_FORMAT(paid_date, '%%m') as month,
                    COALESCE(SUM(paid_amount),0) as total
                FROM fees
                WHERE paid_date IS NOT NULL
                AND paid_amount > 0
                AND YEAR(paid_date) = ?
                GROUP BY DATE_FORMAT(paid_date, '%%m')
            """, (str(year),)).fetchall()
            return {r["month"]: r["total"] for r in rows}
        finally:
            db.close()

    def expense_monthly(self, year):
        db = get_db()
        try:
            rows = db.execute("""
                SELECT
                    DATE_FORMAT(date, '%%m') as month,
                    COALESCE(SUM(amount),0) as total
                FROM expenses
                WHERE date IS NOT NULL
                AND YEAR(date) = ?
                GROUP BY DATE_FORMAT(date, '%%m')
            """, (str(year),)).fetchall()
            return {r["month"]: r["total"] for r in rows}
        finally:
            db.close()

    def expenses_this_month(self):
        db = get_db()
        try:
            return db.execute("""
                SELECT COALESCE(SUM(amount),0) s
                FROM expenses
                WHERE YEAR(date) = YEAR(CURDATE()) AND MONTH(date) = MONTH(CURDATE())
            """).fetchone()["s"]
        finally:
            db.close()

    def attendance_today(self):
        db = get_db()
        try:
            row = db.execute("""
                SELECT
                    SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) present,
                    COUNT(*) total
                FROM attendance
                WHERE date = CURDATE()
            """).fetchone()
            present = row["present"] or 0
            total = row["total"] or 0
            return present, total
        finally:
            db.close()

    def attendance_trend(self, days=14):
        db = get_db()
        try:
            rows = db.execute("""
                SELECT
                    date,
                    SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) present,
                    COUNT(*) total
                FROM attendance
                WHERE date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
                GROUP BY date
                ORDER BY date
            """, (days - 1,)).fetchall()
            return [
                {
                    "date": r["date"],
                    "percent": round((r["present"] / r["total"]) * 100, 1) if r["total"] else 0
                }
                for r in rows
            ]
        finally:
            db.close()

    def low_stock_count(self):
        db = get_db()
        try:
            return db.execute("""
                SELECT COUNT(*) c
                FROM inventory_items
                WHERE is_active = 1 AND quantity_in_stock <= reorder_level
            """).fetchone()["c"]
        finally:
            db.close()

    def pending_leaves_count(self):
        db = get_db()
        try:
            return db.execute("""
                SELECT COUNT(*) c
                FROM hr_leave_applications
                WHERE status = 'Pending'
            """).fetchone()["c"]
        finally:
            db.close()

    def class_enrollment(self):
        db = get_db()
        try:
            rows = db.execute("""
                SELECT grade, COUNT(*) c
                FROM students
                WHERE status = 'Active'
                GROUP BY grade
                ORDER BY c DESC
            """).fetchall()
            return [r["grade"] for r in rows], [r["c"] for r in rows]
        finally:
            db.close()

    def top_fee_defaulters(self, limit=5):
        db = get_db()
        try:
            rows = db.execute("""
                SELECT
                    student_id,
                    student_name,
                    SUM((amount - COALESCE(discount_amount,0) + COALESCE(fine_amount,0)) - COALESCE(paid_amount,0)) AS balance
                FROM fees
                WHERE status != 'Paid'
                GROUP BY student_id, student_name
                HAVING balance > 0
                ORDER BY balance DESC
                LIMIT ?
            """, (limit,)).fetchall()
            return [dict(row) for row in rows]
        finally:
            db.close()

    def staff_attendance_today(self):
        db = get_db()
        try:
            row = db.execute("""
                SELECT
                    SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) present,
                    COUNT(*) total
                FROM staff_attendance
                WHERE date = CURDATE()
            """).fetchone()
            present = row["present"] or 0
            total = row["total"] or 0
            return present, total
        finally:
            db.close()

    def library_overdue_count(self):
        db = get_db()
        try:
            return db.execute("""
                SELECT COUNT(*) c
                FROM library_issues
                WHERE status = 'Issued' AND due_date < CURDATE()
            """).fetchone()["c"]
        finally:
            db.close()
