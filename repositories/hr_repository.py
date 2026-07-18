"""
HR repository — the only layer allowed to talk directly to SQLite for
Leave Applications, Overtime, Increments, Payroll and Employee Documents.
"""
from database import get_db, transaction
from repositories.base_repository import BaseRepository


class LeaveRepository(BaseRepository):
    table = "hr_leave_applications"
    id_column = "id"

    def find_all(self, teacher_id="", status="", leave_type="", date_from="", date_to=""):
        sql = "SELECT * FROM hr_leave_applications WHERE 1=1"
        params = []
        if teacher_id:
            sql += " AND teacher_id=?"
            params.append(teacher_id)
        if status:
            sql += " AND status=?"
            params.append(status)
        if leave_type:
            sql += " AND leave_type=?"
            params.append(leave_type)
        if date_from:
            sql += " AND end_date>=?"
            params.append(date_from)
        if date_to:
            sql += " AND start_date<=?"
            params.append(date_to)
        sql += " ORDER BY applied_date DESC, id DESC"
        return [dict(r) for r in self._fetchall(sql, params)]

    def find_by_id(self, leave_id):
        row = super().find_by_id(leave_id)
        return dict(row) if row else None

    def create(self, leave):
        with transaction() as db:
            cursor = db.execute("""
                INSERT INTO hr_leave_applications
                    (teacher_id, teacher_name, leave_type, start_date, end_date, days, reason, status)
                VALUES (?,?,?,?,?,?,?,?)
            """, (
                leave.teacher_id, leave.teacher_name, leave.leave_type,
                leave.start_date, leave.end_date, leave.days, leave.reason, leave.status,
            ))
            return cursor.lastrowid

    def set_status(self, leave_id, status, reviewed_by, remarks=""):
        with transaction() as db:
            db.execute("""
                UPDATE hr_leave_applications
                SET status=?, reviewed_by=?, reviewed_at=CURRENT_TIMESTAMP, review_remarks=?
                WHERE id=?
            """, (status, reviewed_by, remarks, leave_id))

    def approved_days_in_period(self, teacher_id, date_from, date_to, leave_type=None):
        """Sum of Approved leave days for a teacher overlapping [date_from,
        date_to] (used by payroll to compute unpaid-leave deductions)."""
        sql = """
            SELECT start_date, end_date, days FROM hr_leave_applications
            WHERE teacher_id=? AND status='Approved' AND start_date<=? AND end_date>=?
        """
        params = [teacher_id, date_to, date_from]
        if leave_type:
            sql += " AND leave_type=?"
            params.append(leave_type)
        rows = self._fetchall(sql, params)
        # Clip each leave span to the requested period so a leave that only
        # partially overlaps the payroll month isn't counted in full.
        from datetime import date as _date
        d_from = _date.fromisoformat(date_from)
        d_to = _date.fromisoformat(date_to)
        total = 0
        for r in rows:
            s = max(_date.fromisoformat(r["start_date"]), d_from)
            e = min(_date.fromisoformat(r["end_date"]), d_to)
            if e >= s:
                total += (e - s).days + 1
        return total


class OvertimeRepository(BaseRepository):
    table = "hr_overtime"
    id_column = "id"

    def find_all(self, teacher_id="", status="", date_from="", date_to=""):
        sql = "SELECT * FROM hr_overtime WHERE 1=1"
        params = []
        if teacher_id:
            sql += " AND teacher_id=?"
            params.append(teacher_id)
        if status:
            sql += " AND status=?"
            params.append(status)
        if date_from:
            sql += " AND date>=?"
            params.append(date_from)
        if date_to:
            sql += " AND date<=?"
            params.append(date_to)
        sql += " ORDER BY date DESC, id DESC"
        return [dict(r) for r in self._fetchall(sql, params)]

    def find_by_id(self, overtime_id):
        row = super().find_by_id(overtime_id)
        return dict(row) if row else None

    def create(self, ot):
        with transaction() as db:
            cursor = db.execute("""
                INSERT INTO hr_overtime (teacher_id, teacher_name, date, hours, rate_per_hour, amount, reason, status)
                VALUES (?,?,?,?,?,?,?,?)
            """, (ot.teacher_id, ot.teacher_name, ot.date, ot.hours, ot.rate_per_hour, ot.amount, ot.reason, ot.status))
            return cursor.lastrowid

    def set_status(self, overtime_id, status, approved_by):
        with transaction() as db:
            db.execute("""
                UPDATE hr_overtime SET status=?, approved_by=?, approved_at=CURRENT_TIMESTAMP WHERE id=?
            """, (status, approved_by, overtime_id))

    def approved_total_in_period(self, teacher_id, date_from, date_to):
        row = self._fetchone("""
            SELECT COALESCE(SUM(amount),0) total FROM hr_overtime
            WHERE teacher_id=? AND status='Approved' AND date>=? AND date<=?
        """, (teacher_id, date_from, date_to))
        return float(row["total"] or 0)


class IncrementRepository(BaseRepository):
    table = "hr_increments"
    id_column = "id"

    def find_all(self, teacher_id=""):
        sql = "SELECT * FROM hr_increments WHERE 1=1"
        params = []
        if teacher_id:
            sql += " AND teacher_id=?"
            params.append(teacher_id)
        sql += " ORDER BY effective_date DESC, id DESC"
        return [dict(r) for r in self._fetchall(sql, params)]

    def create(self, inc):
        with transaction() as db:
            cursor = db.execute("""
                INSERT INTO hr_increments
                    (teacher_id, teacher_name, effective_date, previous_salary, increment_type,
                     increment_value, increment_amount, new_salary, reason, approved_by)
                VALUES (?,?,?,?,?,?,?,?,?,?)
            """, (
                inc.teacher_id, inc.teacher_name, inc.effective_date, inc.previous_salary,
                inc.increment_type, inc.increment_value, inc.increment_amount, inc.new_salary,
                inc.reason, inc.approved_by,
            ))
            return cursor.lastrowid

    def update_teacher_salary(self, teacher_id, new_salary):
        with transaction() as db:
            db.execute("UPDATE teachers SET salary=? WHERE id=?", (new_salary, teacher_id))


class PayrollRepository(BaseRepository):
    table = "hr_payroll"
    id_column = "id"

    def find_all(self, month="", year="", teacher_id="", status=""):
        sql = "SELECT * FROM hr_payroll WHERE 1=1"
        params = []
        if month:
            sql += " AND month=?"
            params.append(month)
        if year:
            sql += " AND year=?"
            params.append(year)
        if teacher_id:
            sql += " AND teacher_id=?"
            params.append(teacher_id)
        if status:
            sql += " AND status=?"
            params.append(status)
        sql += " ORDER BY year DESC, month DESC, teacher_name"
        return [dict(r) for r in self._fetchall(sql, params)]

    def find_by_id(self, payroll_id):
        row = super().find_by_id(payroll_id)
        return dict(row) if row else None

    def find_by_teacher_period(self, teacher_id, month, year):
        row = self._fetchone(
            "SELECT * FROM hr_payroll WHERE teacher_id=? AND month=? AND year=?",
            (teacher_id, month, year)
        )
        return dict(row) if row else None

    def upsert_draft(self, record):
        """Insert a new payroll row, or overwrite an existing Draft row for
        the same teacher/month/year. Paid records are never touched by
        this (the service layer checks status before calling)."""
        existing = self.find_by_teacher_period(record.teacher_id, record.month, record.year)
        with transaction() as db:
            if existing:
                db.execute("""
                    UPDATE hr_payroll SET
                        basic_salary=?, allowances=?, overtime_amount=?, deductions=?,
                        leave_deduction=?, net_salary=?, generated_by=?, generated_at=CURRENT_TIMESTAMP
                    WHERE id=?
                """, (
                    record.basic_salary, record.allowances, record.overtime_amount,
                    record.deductions, record.leave_deduction, record.net_salary,
                    record.generated_by, existing["id"],
                ))
                return existing["id"], False
            else:
                cursor = db.execute("""
                    INSERT INTO hr_payroll
                        (teacher_id, teacher_name, month, year, basic_salary, allowances,
                         overtime_amount, deductions, leave_deduction, net_salary, status, generated_by)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                """, (
                    record.teacher_id, record.teacher_name, record.month, record.year,
                    record.basic_salary, record.allowances, record.overtime_amount,
                    record.deductions, record.leave_deduction, record.net_salary,
                    record.status, record.generated_by,
                ))
                return cursor.lastrowid, True

    def update_fields(self, payroll_id, allowances, deductions, net_salary):
        with transaction() as db:
            db.execute("""
                UPDATE hr_payroll SET allowances=?, deductions=?, net_salary=? WHERE id=?
            """, (allowances, deductions, net_salary, payroll_id))

    def mark_paid(self, payroll_id, payment_date, payment_method):
        with transaction() as db:
            db.execute("""
                UPDATE hr_payroll SET status='Paid', payment_date=?, payment_method=? WHERE id=?
            """, (payment_date, payment_method, payroll_id))


class EmployeeDocumentRepository(BaseRepository):
    table = "hr_employee_documents"
    id_column = "id"

    def find_all(self, teacher_id="", document_type=""):
        sql = "SELECT * FROM hr_employee_documents WHERE 1=1"
        params = []
        if teacher_id:
            sql += " AND teacher_id=?"
            params.append(teacher_id)
        if document_type:
            sql += " AND document_type=?"
            params.append(document_type)
        sql += " ORDER BY uploaded_at DESC, id DESC"
        return [dict(r) for r in self._fetchall(sql, params)]

    def find_by_id(self, doc_id):
        row = super().find_by_id(doc_id)
        return dict(row) if row else None

    def create(self, doc):
        with transaction() as db:
            cursor = db.execute("""
                INSERT INTO hr_employee_documents
                    (teacher_id, teacher_name, document_type, document_name, file_path, expiry_date, notes, uploaded_by)
                VALUES (?,?,?,?,?,?,?,?)
            """, (
                doc.teacher_id, doc.teacher_name, doc.document_type, doc.document_name,
                doc.file_path, doc.expiry_date, doc.notes, doc.uploaded_by,
            ))
            return cursor.lastrowid
