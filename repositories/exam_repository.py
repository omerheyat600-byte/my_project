"""
Exam repository — the only layer allowed to talk directly to SQLite
for the exam-session subsystem (exam_sessions / student_results /
student_result_subjects).
"""
from datetime import datetime

from database import transaction
from models.exam import ExamSession
from repositories.base_repository import BaseRepository


class ExamRepository(BaseRepository):
    table = "exam_sessions"
    id_column = "id"

    def find_by_id(self, exam_id):
        row = super().find_by_id(exam_id)
        return ExamSession.from_row(row)

    def find_or_create(self, class_id, term, year):
        """
        Atomic find-or-create: previously this did a SELECT then an INSERT
        as two separate steps, which left a race window where two near-
        simultaneous requests for the same class/term/year (e.g. a
        double-click on "Load Marksheet") could each pass the SELECT
        before either INSERT landed, creating two exam_sessions rows for
        what should be one exam. INSERT OR IGNORE against the UNIQUE
        (class_id, term, year) constraint closes that window: whichever
        request's INSERT lands first wins, the second is silently
        ignored, and both then read back the same single row.
        """
        with transaction() as db:
            db.execute("""
                INSERT IGNORE INTO exam_sessions (class_id, term, year, exam_date)
                VALUES (?,?,?,?)
            """, (class_id, term, year, datetime.now().date().isoformat()))
            row = db.execute(
                "SELECT id FROM exam_sessions WHERE class_id=? AND term=? AND year=?",
                (class_id, term, year)
            ).fetchone()
        return row["id"]

    def find_class_name(self, class_id):
        row = self._fetchone("SELECT class_name FROM classes WHERE id=?", (class_id,))
        return row["class_name"] if row else None

    def find_class_subjects_max_marks(self, class_id):
        """{subject_name: max_marks} for every subject configured on this
        class, so mark submission can score each subject against its own
        configured total instead of assuming every subject is out of 100."""
        rows = self._fetchall(
            "SELECT subject_name, max_marks FROM class_subjects WHERE class_id=?",
            (class_id,)
        )
        return {r["subject_name"]: (r["max_marks"] or 100) for r in rows}

    def find_class_subjects(self, class_id):
        rows = self._fetchall(
            "SELECT subject_name FROM class_subjects WHERE class_id=?",
            (class_id,)
        )
        return [r["subject_name"] for r in rows]

    def find_students_by_grade(self, class_name):
        rows = self._fetchall("SELECT id, name FROM students WHERE grade=?", (class_name,))
        return [dict(r) for r in rows]

    def find_student_name(self, student_id):
        row = self._fetchone("SELECT name FROM students WHERE id=?", (student_id,))
        return row["name"] if row else ""

    def find_marks_matrix(self, exam_id):
        rows = self._fetchall("""
            SELECT student_id, subject, obtained_marks
            FROM student_result_subjects
            WHERE exam_id=?
        """, (exam_id,))
        marks_map = {}
        for r in rows:
            marks_map.setdefault(r["student_id"], {})[r["subject"]] = r["obtained_marks"]
        return marks_map

    def submit_marks(self, exam_id, subject_rows, result_rows, position_updates):
        """
        Apply an entire exam-marks submission as ONE transaction:
        per-subject marks, per-student aggregate results, and leaderboard
        positions all land together or not at all.

        subject_rows: list of (student_id, subject, obtained, total_subject)
        result_rows: list of (student_id, student_name, total_obtained, total_marks, percentage, grade, gpa)
        position_updates: list of (position, student_id)
        """
        with transaction() as db:
            for student_id, subject, obtained, total_subject in subject_rows:
                db.execute("""
                    INSERT INTO student_result_subjects
                    (exam_id, student_id, subject, obtained_marks, total_marks)
                    VALUES (?,?,?,?,?)
                    ON DUPLICATE KEY UPDATE
                        obtained_marks=VALUES(obtained_marks),
                        total_marks=VALUES(total_marks)
                """, (exam_id, student_id, subject, obtained, total_subject))

            for student_id, student_name, total_obtained, total_marks, percentage, grade, gpa in result_rows:
                db.execute("""
                    INSERT INTO student_results
                    (exam_id, student_id, student_name, total_obtained, total_marks, percentage, grade, gpa)
                    VALUES (?,?,?,?,?,?,?,?)
                    ON DUPLICATE KEY UPDATE
                        total_obtained=VALUES(total_obtained),
                        total_marks=VALUES(total_marks),
                        percentage=VALUES(percentage),
                        grade=VALUES(grade),
                        gpa=VALUES(gpa)
                """, (exam_id, student_id, student_name, total_obtained, total_marks, percentage, grade, gpa))

            for position, student_id in position_updates:
                db.execute("""
                    UPDATE student_results
                    SET position=?
                    WHERE exam_id=? AND student_id=?
                """, (position, exam_id, student_id))

    def find_exam_session(self, exam_id):
        row = self._fetchone("SELECT * FROM exam_sessions WHERE id=?", (exam_id,))
        return dict(row) if row else None

    def find_student_results_with_names(self, exam_id):
        rows = self._fetchall("""
            SELECT sr.*, s.name as student_name
            FROM student_results sr
            JOIN students s ON sr.student_id = s.id
            WHERE sr.exam_id=?
            ORDER BY sr.position
        """, (exam_id,))
        return [dict(r) for r in rows]

    # ==========================================================
    # DATE SHEET
    # ==========================================================

    def find_datesheet(self, exam_id):
        rows = self._fetchall("""
            SELECT * FROM exam_datesheet WHERE exam_id=? ORDER BY exam_date, start_time
        """, (exam_id,))
        return [dict(r) for r in rows]

    def save_datesheet_entry(self, exam_id, subject, exam_date, start_time, end_time, room, entry_id=None):
        with transaction() as db:
            if entry_id:
                cur = db.execute("""
                    UPDATE exam_datesheet
                    SET subject=?, exam_date=?, start_time=?, end_time=?, room=?
                    WHERE id=? AND exam_id=?
                """, (subject, exam_date, start_time, end_time, room, entry_id, exam_id))
                if cur.rowcount:
                    return entry_id
                # entry_id didn't match any row under this exam (stale id,
                # or it belongs to a different exam) — insert instead of
                # silently discarding the data.
            cur = db.execute("""
                INSERT INTO exam_datesheet (exam_id, subject, exam_date, start_time, end_time, room)
                VALUES (?,?,?,?,?,?)
            """, (exam_id, subject, exam_date, start_time, end_time, room))
            return cur.lastrowid

    def delete_datesheet_entry(self, entry_id):
        with transaction() as db:
            db.execute("DELETE FROM exam_datesheet WHERE id=?", (entry_id,))

    def save_datesheet_bulk(self, exam_id, entries):
        """
        Upsert many date sheet rows in a single transaction. Each entry is
        (subject, exam_date, start_time, end_time, room, entry_id) — entry_id
        is None for a new row (insert) or an existing row id (update).
        Returns the list of ids in the same order as `entries`.
        """
        result_ids = []
        with transaction() as db:
            for subject, exam_date, start_time, end_time, room, entry_id in entries:
                if entry_id:
                    cur = db.execute("""
                        UPDATE exam_datesheet
                        SET subject=?, exam_date=?, start_time=?, end_time=?, room=?
                        WHERE id=? AND exam_id=?
                    """, (subject, exam_date, start_time, end_time, room, entry_id, exam_id))
                    if cur.rowcount:
                        result_ids.append(entry_id)
                        continue
                    # entry_id was stale (didn't match a row under this
                    # exam) — insert instead of silently dropping the row.
                cur = db.execute("""
                    INSERT INTO exam_datesheet (exam_id, subject, exam_date, start_time, end_time, room)
                    VALUES (?,?,?,?,?,?)
                """, (exam_id, subject, exam_date, start_time, end_time, room))
                result_ids.append(cur.lastrowid)
        return result_ids

    # ==========================================================
    # SEATING PLAN
    # ==========================================================

    def find_seating(self, exam_id):
        rows = self._fetchall("""
            SELECT * FROM exam_seating WHERE exam_id=? ORDER BY room, seat_no
        """, (exam_id,))
        return [dict(r) for r in rows]

    def clear_seating(self, exam_id):
        with transaction() as db:
            db.execute("DELETE FROM exam_seating WHERE exam_id=?", (exam_id,))

    def save_seating(self, exam_id, entries):
        """entries: list of (student_id, student_name, room, seat_no)"""
        with transaction() as db:
            db.execute("DELETE FROM exam_seating WHERE exam_id=?", (exam_id,))
            for student_id, student_name, room, seat_no in entries:
                db.execute("""
                    INSERT INTO exam_seating (exam_id, student_id, student_name, room, seat_no)
                    VALUES (?,?,?,?,?)
                """, (exam_id, student_id, student_name, room, seat_no))

    # ==========================================================
    # RESULT LOCK / PUBLISH
    # ==========================================================

    def set_lock_status(self, exam_id, locked):
        with transaction() as db:
            db.execute("UPDATE exam_sessions SET result_locked=? WHERE id=?", (1 if locked else 0, exam_id))

    def set_publish_status(self, exam_id, published):
        with transaction() as db:
            db.execute("UPDATE exam_sessions SET result_published=? WHERE id=?", (1 if published else 0, exam_id))

    # ==========================================================
    # GRACE MARKS
    # ==========================================================

    def apply_grace_marks(self, exam_id, student_id, subject, grace_marks):
        with transaction() as db:
            db.execute("""
                UPDATE student_result_subjects
                SET grace_marks=?
                WHERE exam_id=? AND student_id=? AND subject=?
            """, (grace_marks, exam_id, student_id, subject))

    def find_subject_marks_for_student(self, exam_id, student_id):
        rows = self._fetchall("""
            SELECT * FROM student_result_subjects WHERE exam_id=? AND student_id=?
        """, (exam_id, student_id))
        return [dict(r) for r in rows]

    def recompute_student_result(self, exam_id, student_id, total_obtained, total_marks, percentage, grade, gpa, total_grace):
        with transaction() as db:
            db.execute("""
                UPDATE student_results
                SET total_obtained=?, total_marks=?, percentage=?, grade=?, gpa=?, grace_marks=?
                WHERE exam_id=? AND student_id=?
            """, (total_obtained, total_marks, percentage, grade, gpa, total_grace, exam_id, student_id))

    def recompute_positions(self, exam_id):
        rows = self._fetchall("""
            SELECT student_id, percentage FROM student_results WHERE exam_id=?
            ORDER BY percentage DESC, total_obtained DESC
        """, (exam_id,))
        with transaction() as db:
            for idx, row in enumerate(rows, 1):
                db.execute("""
                    UPDATE student_results SET position=? WHERE exam_id=? AND student_id=?
                """, (idx, exam_id, row["student_id"]))

    # ==========================================================
    # GPA / CGPA
    # ==========================================================

    def find_gpa_list(self, exam_id):
        rows = self._fetchall("""
            SELECT sr.*, s.name as student_name
            FROM student_results sr
            JOIN students s ON sr.student_id = s.id
            WHERE sr.exam_id=?
            ORDER BY sr.gpa DESC
        """, (exam_id,))
        return [dict(r) for r in rows]

    def find_all_gpas_for_student(self, student_id):
        rows = self._fetchall("""
            SELECT sr.gpa, sr.percentage, es.term, es.year, es.id as exam_id
            FROM student_results sr
            JOIN exam_sessions es ON sr.exam_id = es.id
            WHERE sr.student_id=? AND sr.gpa IS NOT NULL
            ORDER BY es.year, es.term
        """, (student_id,))
        return [dict(r) for r in rows]

    # ==========================================================
    # POSITION HOLDERS / MERIT LIST
    # ==========================================================

    def find_top_students(self, exam_id, top_n):
        rows = self._fetchall("""
            SELECT sr.*, s.name as student_name
            FROM student_results sr
            JOIN students s ON sr.student_id = s.id
            WHERE sr.exam_id=?
            ORDER BY sr.position ASC
            LIMIT ?
        """, (exam_id, top_n))
        return [dict(r) for r in rows]

    def find_merit_list(self, term, year, top_n, class_id=None):
        params = [term, year]
        class_filter = ""
        if class_id:
            class_filter = "AND es.class_id=?"
            params.append(class_id)
        params.append(top_n)
        rows = self._fetchall(f"""
            SELECT sr.*, s.name as student_name, c.class_name, c.id as class_id
            FROM student_results sr
            JOIN exam_sessions es ON sr.exam_id = es.id
            JOIN students s ON sr.student_id = s.id
            JOIN classes c ON es.class_id = c.id
            WHERE es.term=? AND es.year=? {class_filter}
            ORDER BY sr.percentage DESC, sr.total_obtained DESC
            LIMIT ?
        """, tuple(params))
        return [dict(r) for r in rows]

    # ==========================================================
    # ADMIT CARD
    # ==========================================================

    def find_students_for_class(self, class_id):
        class_name = self.find_class_name(class_id)
        if not class_name:
            return []
        return self.find_students_by_grade(class_name)

    def find_student_by_id(self, student_id):
        row = self._fetchone("SELECT * FROM students WHERE id=?", (student_id,))
        return dict(row) if row else None

    def find_seating_for_student(self, exam_id, student_id):
        row = self._fetchone("""
            SELECT * FROM exam_seating WHERE exam_id=? AND student_id=?
        """, (exam_id, student_id))
        return dict(row) if row else None
