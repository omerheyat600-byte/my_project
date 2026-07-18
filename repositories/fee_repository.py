"""
Fee repository — the only layer allowed to talk directly to SQLite for
fee-related data (the `fees` table, plus read-only lookups against
`students` needed to denormalize student_name / build vouchers).
"""
from database import transaction
from models.fee import Fee
from repositories.base_repository import BaseRepository


class FeeRepository(BaseRepository):
    table = "fees"
    id_column = "id"

    # ---------- Reads ----------

    def find_all(self, query="", status_filter="", include_voided=False):
        sql = """
            SELECT f.*, s.grade as student_class
            FROM fees f
            LEFT JOIN students s ON f.student_id = s.id
            WHERE 1=1
        """
        params = []

        if not include_voided:
            sql += " AND (f.is_voided=0 OR f.is_voided IS NULL)"

        if query:
            sql += " AND (f.student_name LIKE ? OR f.fee_type LIKE ?)"
            params.extend([f"%{query}%", f"%{query}%"])

        if status_filter:
            sql += " AND f.status=?"
            params.append(status_filter)

        sql += " ORDER BY f.student_name, f.month DESC"

        rows = self._fetchall(sql, params)
        return [dict(r) for r in rows]

    def find_report(self, month="", year="", class_name="", student_id="", status="", include_voided=False):
        sql = """
            SELECT f.*, s.grade as student_class
            FROM fees f
            LEFT JOIN students s ON f.student_id = s.id
            WHERE 1=1
        """
        params = []
        if not include_voided:
            sql += " AND (f.is_voided=0 OR f.is_voided IS NULL)"

        if month:
            sql += " AND f.month = ?"
            params.append(month)
        if year:
            sql += " AND YEAR(f.due_date) = ?"
            params.append(year)
        if class_name:
            sql += " AND s.grade = ?"
            params.append(class_name)
        if student_id:
            sql += " AND f.student_id = ?"
            params.append(student_id)

        if status == 'paid':
            sql += " AND f.status = 'Paid'"
        elif status == 'unpaid':
            sql += " AND f.status != 'Paid'"

        sql += " ORDER BY f.student_name, f.month DESC"

        rows = self._fetchall(sql, params)
        return [dict(r) for r in rows]

    def find_all_students(self):
        rows = self._fetchall("SELECT id, name FROM students")
        return [dict(r) for r in rows]

    def find_active_students(self):
        rows = self._fetchall("SELECT id, name FROM students")
        return [dict(r) for r in rows]

    def find_student_name(self, student_id):
        row = self._fetchone("SELECT name FROM students WHERE id=?", (student_id,))
        return row["name"] if row else ""

    def find_student(self, student_id):
        row = self._fetchone("SELECT * FROM students WHERE id=?", (student_id,))
        return dict(row) if row else None

    def find_students_by_grade(self, class_name):
        rows = self._fetchall("SELECT * FROM students WHERE grade=?", (class_name,))
        return [dict(r) for r in rows]

    def find_by_id(self, fid):
        row = self._fetchone("SELECT * FROM fees WHERE id=?", (fid,))
        return dict(row) if row else None

    def find_fees_for_student(self, student_id):
        rows = self._fetchall(
            "SELECT * FROM fees WHERE student_id=? AND (is_voided=0 OR is_voided IS NULL) ORDER BY due_date",
            (student_id,)
        )
        return [dict(r) for r in rows]

    def find_existing_fee_for_month(self, student_id, month, year):
        row = self._fetchone("""
            SELECT id FROM fees
            WHERE student_id = ? AND month = ? AND YEAR(due_date) = ?
            AND (is_voided=0 OR is_voided IS NULL)
        """, (student_id, month, str(year)))
        return row["id"] if row else None

    def find_students_with_unpaid_fees(self):
        rows = self._fetchall("""
            SELECT DISTINCT student_id, student_name
            FROM fees
            WHERE status != 'Paid'
            AND month != DATE_FORMAT(NOW(), '%%M')
            AND (is_voided=0 OR is_voided IS NULL)
        """)
        return [dict(r) for r in rows]

    def find_unpaid_with_contact(self, class_name=""):
        """One row per student with outstanding dues, along with parent
        contact info — the source list for bulk fee-reminder SMS."""
        sql = """
            SELECT
                f.student_id,
                f.student_name,
                s.grade AS student_class,
                s.parent_phone,
                SUM((f.amount - COALESCE(f.discount_amount,0) + COALESCE(f.fine_amount,0)) - f.paid_amount) AS total_unpaid,
                COUNT(*) AS pending_count,
                MIN(f.due_date) AS earliest_due_date
            FROM fees f
            LEFT JOIN students s ON f.student_id = s.id
            WHERE f.status != 'Paid' AND (f.is_voided=0 OR f.is_voided IS NULL)
        """
        params = []
        if class_name:
            sql += " AND s.grade = ?"
            params.append(class_name)
        sql += """
            GROUP BY f.student_id, f.student_name, s.grade, s.parent_phone
            ORDER BY f.student_name
        """
        rows = self._fetchall(sql, params)
        return [dict(r) for r in rows]

    def find_total_unpaid(self, student_id):
        row = self._fetchone("""
            SELECT COALESCE(SUM((amount - COALESCE(discount_amount,0) + COALESCE(fine_amount,0)) - paid_amount),0) as total_unpaid
            FROM fees
            WHERE student_id = ? AND status != 'Paid' AND (is_voided=0 OR is_voided IS NULL)
        """, (student_id,))
        return row["total_unpaid"] if row else 0

    def find_overdue_unpaid(self):
        """Fees that are not fully paid and have a due date — the candidate
        set for late-fine recalculation."""
        rows = self._fetchall("""
            SELECT * FROM fees
            WHERE status != 'Paid' AND due_date IS NOT NULL AND due_date != ''
            AND (is_voided=0 OR is_voided IS NULL)
        """)
        return [dict(r) for r in rows]

    # ---------- Writes ----------

    def create_many(self, fees):
        """
        Insert many fee records atomically — either all of them land or
        none do (used by both single-record and bulk /api/fees POST).
        """
        created_ids = []
        with transaction() as db:
            for fee in fees:
                cursor = db.execute("""
                    INSERT INTO fees(
                        student_id, student_name, fee_type, month,
                        amount, paid_amount, status, due_date, paid_date,
                        discount_amount, discount_reason, fine_amount, payment_method
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, (
                    fee.student_id, fee.student_name, fee.fee_type, fee.month,
                    fee.amount, fee.paid_amount, fee.status, fee.due_date, fee.paid_date,
                    fee.discount_amount, fee.discount_reason, fee.fine_amount, fee.payment_method
                ))
                created_ids.append(cursor.lastrowid)
        return created_ids

    def update(self, fid, fee: Fee):
        with transaction() as db:
            db.execute("""
                UPDATE fees SET
                    student_id=?, student_name=?, fee_type=?, month=?,
                    amount=?, paid_amount=?, status=?, due_date=?, paid_date=?,
                    discount_amount=?, discount_reason=?, fine_amount=?, payment_method=?
                WHERE id=?
            """, (
                fee.student_id, fee.student_name, fee.fee_type, fee.month,
                fee.amount, fee.paid_amount, fee.status, fee.due_date, fee.paid_date,
                fee.discount_amount, fee.discount_reason, fee.fine_amount, fee.payment_method,
                fid
            ))

    def update_fine(self, fid, fine_amount, status):
        """Used by fee-fine recalculation — updates just the fine amount
        and resulting status without touching the rest of the record."""
        with transaction() as db:
            db.execute(
                "UPDATE fees SET fine_amount=?, status=? WHERE id=?",
                (fine_amount, status, fid)
            )

    def is_fine_credited(self, fid):
        row = self._fetchone("SELECT fine_credited FROM fees WHERE id=?", (fid,))
        return bool(row["fine_credited"]) if row else False

    def mark_fine_credited(self, fid):
        with transaction() as db:
            db.execute("UPDATE fees SET fine_credited=1 WHERE id=?", (fid,))

    def bulk_insert_generated(self, rows):
        """
        rows: list of (student_id, student_name, due_date, month) tuples.
        All generated fee rows are inserted in one transaction.
        """
        if not rows:
            return 0
        with transaction() as db:
            for student_id, student_name, due_date, month in rows:
                db.execute("""
                    INSERT INTO fees (student_id, student_name, fee_type, amount, paid_amount, status, due_date, month)
                    VALUES (?, ?, 'Tuition Fee', 15000, 0, 'Pending', ?, ?)
                """, (student_id, student_name, due_date, month))
        return len(rows)

    def bulk_insert_carry_forward(self, rows):
        """
        rows: list of (student_id, student_name, unpaid_amount, due_date, month) tuples.
        All carry-forward rows are inserted in one transaction.
        """
        if not rows:
            return 0
        with transaction() as db:
            for student_id, student_name, unpaid_amount, due_date, month in rows:
                db.execute("""
                    INSERT INTO fees (student_id, student_name, fee_type, amount, paid_amount, status, due_date, month)
                    VALUES (?, ?, 'Tuition Fee (Carry Forward)', ?, 0, 'Pending', ?, ?)
                """, (student_id, student_name, unpaid_amount, due_date, month))
        return len(rows)
