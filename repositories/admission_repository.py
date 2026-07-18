"""
Admission repository — the only layer allowed to talk directly to SQLite
for online-admission-applicant data.
"""
from database import get_db, transaction
from models.admission import Admission
from repositories.base_repository import BaseRepository


class AdmissionRepository(BaseRepository):
    table = "admissions"
    id_column = "id"

    def find_all(self, query="", status="", grade_filter=""):
        sql = "SELECT * FROM admissions WHERE 1=1"
        params = []

        if query:
            sql += " AND (name LIKE ? OR applicant_no LIKE ? OR phone LIKE ? OR cnic_bform LIKE ?)"
            params.extend([f"%{query}%"] * 4)

        if status:
            sql += " AND status=?"
            params.append(status)

        if grade_filter:
            sql += " AND grade_applied=?"
            params.append(grade_filter)

        sql += " ORDER BY applied_date DESC"
        rows = self._fetchall(sql, params)
        return [Admission.from_row(r) for r in rows]

    def find_by_id(self, aid):
        row = super().find_by_id(aid)
        return Admission.from_row(row)

    def find_by_applicant_no(self, applicant_no):
        row = self._fetchone("SELECT * FROM admissions WHERE applicant_no=?", (applicant_no,))
        return Admission.from_row(row)

    def create(self, admission: Admission):
        with transaction() as db:
            cur = db.execute("""
                INSERT INTO admissions(
                    applicant_no, name, father_name, cnic_bform, dob, gender,
                    grade_applied, phone, email, address, previous_school,
                    photo_path, status, applied_date
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, CURRENT_TIMESTAMP)
            """, (
                admission.applicant_no,
                admission.name,
                admission.father_name,
                admission.cnic_bform,
                admission.dob,
                admission.gender,
                admission.grade_applied,
                admission.phone,
                admission.email,
                admission.address,
                admission.previous_school,
                admission.photo_path,
                admission.status,
            ))
            return cur.lastrowid

    def update(self, aid, admission: Admission):
        with transaction() as db:
            db.execute("""
                UPDATE admissions SET
                    name=?, father_name=?, cnic_bform=?, dob=?, gender=?,
                    grade_applied=?, phone=?, email=?, address=?, previous_school=?
                WHERE id=?
            """, (
                admission.name,
                admission.father_name,
                admission.cnic_bform,
                admission.dob,
                admission.gender,
                admission.grade_applied,
                admission.phone,
                admission.email,
                admission.address,
                admission.previous_school,
                aid,
            ))

    def set_photo_path(self, aid, photo_path):
        with transaction() as db:
            db.execute("UPDATE admissions SET photo_path=? WHERE id=?", (photo_path, aid))

    def set_test_marks(self, aid, test_marks, test_total, test_date, status):
        with transaction() as db:
            db.execute(
                "UPDATE admissions SET test_marks=?, test_total=?, test_date=?, status=? WHERE id=?",
                (test_marks, test_total, test_date, status, aid)
            )

    def set_status(self, aid, status, remarks=None):
        with transaction() as db:
            db.execute(
                "UPDATE admissions SET status=?, remarks=? WHERE id=?",
                (status, remarks, aid)
            )

    def mark_approved(self, aid, student_id):
        with transaction() as db:
            db.execute(
                "UPDATE admissions SET status='Approved', student_id=?, approved_date=CURRENT_TIMESTAMP WHERE id=?",
                (student_id, aid)
            )

    def count_approved_for_grade(self, grade_applied):
        row = self._fetchone(
            "SELECT COUNT(*) c FROM admissions WHERE grade_applied=? AND status='Approved'",
            (grade_applied,)
        )
        return row["c"] if row else 0

    def find_next_applicant_no(self, year):
        """Sequential applicant number 'APP-YYYY-NNNN', resetting each year."""
        prefix = f"APP-{year}-"
        row = self._fetchone(
            "SELECT applicant_no FROM admissions WHERE applicant_no LIKE ? ORDER BY applicant_no DESC LIMIT 1",
            (f"{prefix}%",)
        )
        next_seq = 1
        if row and row["applicant_no"]:
            try:
                next_seq = int(row["applicant_no"].split("-")[-1]) + 1
            except (ValueError, IndexError):
                next_seq = 1
        return f"{prefix}{next_seq:04d}"

    def find_distinct_grades(self):
        rows = self._fetchall("SELECT DISTINCT grade_applied FROM admissions ORDER BY grade_applied")
        return [r["grade_applied"] for r in rows]

    def counts_by_status(self):
        rows = self._fetchall("SELECT status, COUNT(*) c FROM admissions GROUP BY status")
        return {r["status"]: r["c"] for r in rows}
