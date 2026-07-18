"""
Student repository — the only layer allowed to talk directly to SQLite
for student-related data.
"""
from database import get_db, transaction
from models.student import Student
from repositories.base_repository import BaseRepository


class StudentRepository(BaseRepository):
    table = "students"
    id_column = "id"

    def find_all(self, query="", grade_filter=""):
        sql = "SELECT * FROM students WHERE 1=1"
        params = []

        if query:
            sql += " AND (name LIKE ? OR id LIKE ? OR admission_no LIKE ?)"
            params.extend([f"%{query}%", f"%{query}%", f"%{query}%"])

        if grade_filter:
            sql += " AND grade=?"
            params.append(grade_filter)

        rows = self._fetchall(sql, params)
        return [Student.from_row(r) for r in rows]

    def find_distinct_grades(self):
        rows = self._fetchall("SELECT DISTINCT grade FROM students ORDER BY grade")
        return [r["grade"] for r in rows]

    def find_by_id(self, sid):
        row = super().find_by_id(sid)
        return Student.from_row(row)

    def create(self, student: Student):
        with transaction() as db:
            db.execute("""
                INSERT INTO students(
                    id,name,grade,gender,dob,phone,email,address,
                    parent_name,parent_phone,join_date,admission_no,photo_path,roll_no
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                student.id,
                student.name,
                student.grade,
                student.gender,
                student.dob,
                student.phone,
                student.email,
                student.address,
                student.parent_name,
                student.parent_phone,
                student.join_date,
                student.admission_no,
                student.photo_path,
                student.roll_no,
            ))
        return student

    def update(self, sid, student: Student):
        with transaction() as db:
            db.execute("""
                UPDATE students SET
                    name=?, grade=?, gender=?, dob=?, phone=?,
                    email=?, address=?, parent_name=?, parent_phone=?, join_date=?,
                    admission_no=?, photo_path=?, roll_no=?
                WHERE id=?
            """, (
                student.name,
                student.grade,
                student.gender,
                student.dob,
                student.phone,
                student.email,
                student.address,
                student.parent_name,
                student.parent_phone,
                student.join_date,
                student.admission_no,
                student.photo_path,
                student.roll_no,
                sid,
            ))

    def set_photo_path(self, sid, photo_path):
        """Update just the photo — used by the photo upload endpoint so it
        doesn't need to round-trip the entire student record."""
        with transaction() as db:
            db.execute("UPDATE students SET photo_path=? WHERE id=?", (photo_path, sid))

    def find_active_by_grade(self, grade):
        """Students currently sitting in `grade` (the free-text class_name
        value stored on students.grade) who are still Active — used to
        build the roster for a promotion run."""
        rows = self._fetchall(
            "SELECT * FROM students WHERE grade=? AND (status IS NULL OR status='Active') ORDER BY name",
            (grade,)
        )
        return [Student.from_row(r) for r in rows]

    def set_grade_and_status(self, sid, grade, status, db=None):
        """Update just grade + status — used by the Promotion module.
        Accepts an optional already-open `db` connection so it can be
        folded into a caller's larger transaction (a promotion run
        touches many students plus the promotion_batches/records tables
        and must all commit or roll back together)."""
        if db is not None:
            db.execute("UPDATE students SET grade=?, status=? WHERE id=?", (grade, status, sid))
            return
        with transaction() as conn:
            conn.execute("UPDATE students SET grade=?, status=? WHERE id=?", (grade, status, sid))

    def set_roll_no(self, sid, roll_no):
        """Manually set/clear a single student's roll number."""
        with transaction() as db:
            db.execute("UPDATE students SET roll_no=? WHERE id=?", (roll_no, sid))

    def reset_roll_numbers_for_class(self, grade, db=None):
        """
        Re-assign roll numbers 1..N to every currently-Active student in
        `grade`, in alphabetical name order — the standard convention for
        a fresh academic year / after a promotion. Accepts an optional
        already-open `db` connection so a Promotion batch can fold this
        into its own transaction (grade change + roll reset land or roll
        back together). Returns the number of students updated.
        """
        if db is not None:
            rows = db.execute(
                "SELECT id FROM students WHERE grade=? AND (status IS NULL OR status='Active') ORDER BY name",
                (grade,)
            ).fetchall()
            for i, row in enumerate(rows, start=1):
                db.execute("UPDATE students SET roll_no=? WHERE id=?", (i, row["id"]))
            return len(rows)

        with transaction() as conn:
            rows = conn.execute(
                "SELECT id FROM students WHERE grade=? AND (status IS NULL OR status='Active') ORDER BY name",
                (grade,)
            ).fetchall()
            for i, row in enumerate(rows, start=1):
                conn.execute("UPDATE students SET roll_no=? WHERE id=?", (i, row["id"]))
            return len(rows)

    def admission_no_exists(self, admission_no, exclude_id=None):
        if not admission_no:
            return False
        sql = "SELECT 1 FROM students WHERE admission_no=?"
        params = [admission_no]
        if exclude_id:
            sql += " AND id!=?"
            params.append(exclude_id)
        return self._fetchone(sql, params) is not None

    def find_by_admission_no(self, admission_no):
        """Used by the data-import feature to resolve which student a row
        (e.g. a fee record from an external file) belongs to, when the
        source data only has an admission number and not our internal
        STU-xxxx id."""
        if not admission_no:
            return None
        row = self._fetchone("SELECT * FROM students WHERE admission_no=?", (admission_no,))
        return Student.from_row(row) if row else None

    def find_next_admission_no(self, year):
        """
        Next sequential admission number for the given year, formatted
        'YYYY-NNNN' (e.g. '2026-0047') and resetting to 0001 each new
        year — the numbering convention schools here actually use on
        paper admission registers, rather than one endless global count.
        """
        prefix = f"{year}-"
        row = self._fetchone(
            "SELECT admission_no FROM students WHERE admission_no LIKE ? ORDER BY admission_no DESC LIMIT 1",
            (f"{prefix}%",)
        )
        next_seq = 1
        if row and row["admission_no"]:
            try:
                next_seq = int(row["admission_no"].split("-")[-1]) + 1
            except (ValueError, IndexError):
                next_seq = 1
        return f"{prefix}{next_seq:04d}"

    def find_id_name_list(self):
        rows = self._fetchall("SELECT id, name FROM students")
        return [dict(r) for r in rows]

    def find_all_with_grade(self):
        """All students with just id + grade — used by the grade-repair maintenance job."""
        rows = self._fetchall("SELECT id, grade FROM students")
        return [dict(r) for r in rows]

    def find_all_class_names(self):
        """Used by the grade-repair maintenance job to map old grades to class names."""
        rows = self._fetchall("SELECT id, class_name FROM classes")
        return [r['class_name'] for r in rows]

    def bulk_update_grades(self, updates):
        """
        Apply many (student_id, new_grade) updates atomically — either all
        of them land or none do, so a failure partway through never leaves
        the students table half-migrated.
        """
        if not updates:
            return 0
        with transaction() as db:
            for sid, new_grade in updates:
                db.execute("UPDATE students SET grade=? WHERE id=?", (new_grade, sid))
        return len(updates)
