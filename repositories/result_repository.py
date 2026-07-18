"""
Result repository — the only layer allowed to talk directly to SQLite
for the legacy flat `results` table (individual result rows, result
cards, bulk cards, and the Excel bulk-grid entry endpoints).
"""
from database import transaction
from models.result import Result
from repositories.base_repository import BaseRepository


class ResultRepository(BaseRepository):
    table = "results"
    id_column = "id"

    # ---------- Legacy CRUD ----------

    def find_all_filtered(self, query="", student_id="", term="", class_filter="",
                           date_from="", date_to=""):
        sql = """
            SELECT r.*, s.grade as student_class
            FROM results r
            LEFT JOIN students s ON r.student_id = s.id
            WHERE r.id IN (
                SELECT MAX(id)
                FROM results
                GROUP BY student_id, subject, term, year
            )
        """
        params = []

        if query:
            sql += " AND (r.student_name LIKE ? OR r.subject LIKE ?)"
            params.extend([f"%{query}%", f"%{query}%"])

        if student_id:
            sql += " AND r.student_id=?"
            params.append(student_id)

        if term:
            sql += " AND r.term=?"
            params.append(term)

        if class_filter:
            sql += " AND s.grade LIKE ?"
            params.append(f"%{class_filter}%")

        if date_from and date_to:
            sql += " AND r.exam_date BETWEEN ? AND ?"
            params.extend([date_from, date_to])
        elif date_from:
            sql += " AND r.exam_date >= ?"
            params.append(date_from)
        elif date_to:
            sql += " AND r.exam_date <= ?"
            params.append(date_to)

        sql += " ORDER BY r.exam_date DESC, r.student_name"

        rows = self._fetchall(sql, params)
        return [dict(r) for r in rows]

    def find_students_for_dropdown(self):
        rows = self._fetchall("SELECT id, name FROM students ORDER BY name")
        return [dict(r) for r in rows]

    def find_student_name(self, student_id):
        row = self._fetchone("SELECT name FROM students WHERE id=?", (student_id,))
        return row["name"] if row else ""

    def find_by_id(self, rid):
        row = super().find_by_id(rid)
        return Result.from_row(row)

    def create(self, result: Result):
        with transaction() as db:
            cursor = db.execute("""
                INSERT INTO results(
                    student_id,student_name,subject,
                    obtained_marks,total_marks,grade,
                    term,year,exam_date
                ) VALUES (?,?,?,?,?,?,?,?,?)
            """, (
                result.student_id,
                result.student_name,
                result.subject,
                result.obtained_marks,
                result.total_marks,
                result.grade,
                result.term,
                result.year,
                result.exam_date,
            ))
            new_id = cursor.lastrowid
        return new_id

    def update(self, rid, result: Result):
        with transaction() as db:
            db.execute("""
                UPDATE results SET
                    student_id=?, student_name=?, subject=?,
                    obtained_marks=?, total_marks=?, grade=?,
                    term=?, year=?, exam_date=?
                WHERE id=?
            """, (
                result.student_id,
                result.student_name,
                result.subject,
                result.obtained_marks,
                result.total_marks,
                result.grade,
                result.term,
                result.year,
                result.exam_date,
                rid,
            ))

    # ---------- Result card / bulk cards ----------

    def find_student(self, sid):
        row = self._fetchone("SELECT * FROM students WHERE id=?", (sid,))
        return dict(row) if row else None

    def find_results_for_student(self, sid):
        rows = self._fetchall(
            "SELECT * FROM results WHERE student_id=? ORDER BY exam_date DESC, subject",
            (sid,)
        )
        return [dict(r) for r in rows]

    def find_class_name(self, class_id):
        row = self._fetchone("SELECT class_name FROM classes WHERE id = ?", (class_id,))
        return row["class_name"] if row else None

    def find_students_by_grade(self, class_name):
        rows = self._fetchall(
            "SELECT id, name FROM students WHERE TRIM(LOWER(grade)) = TRIM(LOWER(?)) ORDER BY name",
            (class_name,)
        )
        return [dict(r) for r in rows]

    def find_results_for_students_term_year(self, student_ids, term, year):
        if not student_ids:
            return []
        placeholders = ','.join('?' for _ in student_ids)
        rows = self._fetchall(f"""
            SELECT student_id, subject, obtained_marks, total_marks, grade
            FROM results
            WHERE student_id IN ({placeholders})
            AND term = ?
            AND year = ?
        """, student_ids + [term, year])
        return [dict(r) for r in rows]

    # ---------- Parent portal ----------

    def find_exam_results_for_student(self, student_id):
        """Term-based exam results (student_results / student_result_subjects)
        for a single student, newest exam first — used by the Parent Portal."""
        exams = self._fetchall("""
            SELECT sr.exam_id, sr.total_obtained, sr.total_marks, sr.percentage,
                   sr.grade, sr.position, es.term, es.year, es.exam_date
            FROM student_results sr
            JOIN exam_sessions es ON sr.exam_id = es.id
            WHERE sr.student_id = ?
            ORDER BY es.exam_date DESC, es.id DESC
        """, (student_id,))

        out = []
        for exam in exams:
            exam_dict = dict(exam)
            subjects = self._fetchall("""
                SELECT subject, obtained_marks, total_marks
                FROM student_result_subjects
                WHERE exam_id = ? AND student_id = ?
                ORDER BY subject
            """, (exam_dict["exam_id"], student_id))
            exam_dict["subjects"] = [dict(s) for s in subjects]
            out.append(exam_dict)
        return out

    def find_legacy_result_batches_for_student(self, student_id):
        """Group the legacy flat `results` table into exam-like batches
        (one per term/year) so the Parent Portal can show results that
        were entered through the simple per-subject form/Excel grid
        instead of the structured exam-session workflow. Newest first."""
        from utils.grading import grade_from_score

        batches = self._fetchall("""
            SELECT term, year,
                   MAX(exam_date) as exam_date,
                   SUM(obtained_marks) as total_obtained,
                   SUM(total_marks) as total_marks
            FROM results
            WHERE student_id = ?
            GROUP BY term, year
            ORDER BY MAX(exam_date) DESC, year DESC
        """, (student_id,))

        out = []
        for batch in batches:
            batch_dict = dict(batch)
            subjects = self._fetchall("""
                SELECT subject, obtained_marks, total_marks, grade
                FROM results
                WHERE student_id = ? AND term = ? AND year = ?
                ORDER BY subject
            """, (student_id, batch_dict["term"], batch_dict["year"]))

            total_obtained = batch_dict["total_obtained"] or 0
            total_marks = batch_dict["total_marks"] or 0
            batch_dict["percentage"] = round((total_obtained / total_marks) * 100, 2) if total_marks else 0
            batch_dict["grade"] = grade_from_score(total_obtained, total_marks)
            batch_dict["position"] = None
            batch_dict["subjects"] = [dict(s) for s in subjects]
            out.append(batch_dict)
        return out

    # ---------- Excel bulk grid ----------

    def find_class_id_by_name(self, class_name):
        row = self._fetchone("SELECT id FROM classes WHERE class_name = ?", (class_name,))
        return row['id'] if row else None

    def find_class_name_like(self, grade):
        row = self._fetchone("SELECT class_name FROM classes WHERE class_name LIKE ?", (f"{grade}%",))
        return row['class_name'] if row else None

    def find_class_subjects(self, class_id):
        rows = self._fetchall(
            "SELECT subject_name, max_marks FROM class_subjects WHERE class_id=?",
            (class_id,)
        )
        return [{"name": r["subject_name"], "max_marks": r["max_marks"]} for r in rows]

    def find_students_by_grade_pattern(self, grade):
        rows = self._fetchall(
            "SELECT id, name FROM students WHERE TRIM(LOWER(grade)) LIKE ? ORDER BY name",
            (f"%{grade}%",)
        )
        return [dict(r) for r in rows]

    def find_marks_for_term_year(self, term, year):
        rows = self._fetchall(
            "SELECT student_id, subject, obtained_marks FROM results WHERE term=? AND year=?",
            (term, year)
        )
        return [dict(r) for r in rows]

    def find_subject_max_marks(self, class_id, subject_name):
        row = self._fetchone(
            "SELECT max_marks FROM class_subjects WHERE class_id=? AND subject_name=?",
            (class_id, subject_name)
        )
        return row['max_marks'] if row else None

    def find_existing_result_id(self, student_id, subject, term, year):
        row = self._fetchone(
            "SELECT id FROM results WHERE student_id=? AND subject=? AND term=? AND year=?",
            (student_id, subject, term, year)
        )
        return row['id'] if row else None

    def bulk_save_grid(self, upserts, deletes):
        """
        Apply an entire Excel-grid save as one transaction: every cell
        update/insert/delete either all lands or none does.

        upserts: list of tuples
            (existing_id_or_None, student_id, student_name, subject,
             obtained_marks, total_marks, grade, term, year, exam_date)
        deletes: list of tuples (student_id, subject, term, year)
        """
        with transaction() as db:
            for (existing_id, student_id, student_name, subject,
                 obtained_marks, total_marks, grade, term, year, exam_date) in upserts:
                if existing_id:
                    db.execute("""
                        UPDATE results
                        SET obtained_marks=?, total_marks=?, grade=?, student_name=?
                        WHERE id=?
                    """, (obtained_marks, total_marks, grade, student_name, existing_id))
                else:
                    db.execute("""
                        INSERT INTO results
                        (student_id, student_name, subject, obtained_marks, total_marks, grade, term, year, exam_date)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (student_id, student_name, subject, obtained_marks, total_marks, grade, term, year, exam_date))

            for (student_id, subject, term, year) in deletes:
                db.execute(
                    "DELETE FROM results WHERE student_id=? AND subject=? AND term=? AND year=?",
                    (student_id, subject, term, year)
                )
