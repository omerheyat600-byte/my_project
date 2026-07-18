"""
Class repository — the only layer allowed to talk directly to SQLite
for class and class-subject data.
"""
import pymysql

from database import get_db, transaction
from models.school_class import SchoolClass, ClassSubject
from repositories.base_repository import BaseRepository


class ClassRepository(BaseRepository):
    table = "classes"
    id_column = "id"

    # ---------- Classes ----------

    def find_all(self, query=""):
        sql = "SELECT * FROM classes WHERE 1=1"
        params = []

        if query:
            sql += " AND class_name LIKE ?"
            params.append(f"%{query}%")

        rows = self._fetchall(sql, params)
        return [SchoolClass.from_row(r) for r in rows]

    def find_by_id(self, cid):
        row = super().find_by_id(cid)
        return SchoolClass.from_row(row)

    def find_by_name(self, class_name, exclude_id=None):
        if exclude_id is not None:
            row = self._fetchone(
                "SELECT id FROM classes WHERE class_name=? AND id!=?",
                (class_name, exclude_id)
            )
        else:
            row = self._fetchone(
                "SELECT id FROM classes WHERE class_name=?",
                (class_name,)
            )
        return row

    def find_teacher_name(self, teacher_id):
        row = self._fetchone("SELECT name FROM teachers WHERE id=?", (teacher_id,))
        return row["name"] if row else None

    def create(self, school_class: SchoolClass):
        with transaction() as db:
            cursor = db.execute("""
                INSERT INTO classes(
                    class_name, grade_level, section,
                    class_teacher, class_teacher_name,
                    room_number, schedule, capacity, max_subjects
                ) VALUES (?,?,?,?,?,?,?,?,?)
            """, (
                school_class.class_name,
                school_class.grade_level,
                school_class.section,
                school_class.class_teacher,
                school_class.class_teacher_name,
                school_class.room_number,
                school_class.schedule,
                school_class.capacity,
                school_class.max_subjects,
            ))
            new_id = cursor.lastrowid
        return new_id

    def update(self, cid, school_class: SchoolClass):
        with transaction() as db:
            db.execute("""
                UPDATE classes SET
                    class_name=?, grade_level=?, section=?,
                    class_teacher=?, class_teacher_name=?,
                    room_number=?, schedule=?, capacity=?, max_subjects=?
                WHERE id=?
            """, (
                school_class.class_name,
                school_class.grade_level,
                school_class.section,
                school_class.class_teacher,
                school_class.class_teacher_name,
                school_class.room_number,
                school_class.schedule,
                school_class.capacity,
                school_class.max_subjects,
                cid,
            ))

    # ---------- Class subjects ----------

    def class_subjects_table_exists(self):
        db_conn = get_db()
        try:
            db_conn.execute("SELECT 1 FROM class_subjects LIMIT 1")
            return True
        except pymysql.err.OperationalError:
            return False
        finally:
            db_conn.close()

    def find_subjects(self, class_id):
        rows = self._fetchall("""
            SELECT subject_name, max_marks
            FROM class_subjects
            WHERE class_id = ?
            ORDER BY subject_name
        """, (class_id,))
        return [ClassSubject.from_row(r) for r in rows]

    def count_subjects(self, class_id):
        row = self._fetchone(
            "SELECT COUNT(*) as cnt FROM class_subjects WHERE class_id=?",
            (class_id,)
        )
        return row['cnt'] if row else 0

    def get_max_subjects(self, class_id):
        row = self._fetchone(
            "SELECT IFNULL(max_subjects, 10) as max_subjects FROM classes WHERE id=?",
            (class_id,)
        )
        return row['max_subjects'] if row else None

    def add_subject(self, class_id, subject_name, max_marks):
        with transaction() as db:
            db.execute("""
                INSERT INTO class_subjects (class_id, subject_name, max_marks)
                VALUES (?, ?, ?)
            """, (class_id, subject_name, max_marks))

    def remove_subject(self, class_id, subject_name):
        with transaction() as db:
            db.execute("""
                DELETE FROM class_subjects
                WHERE class_id=? AND subject_name=?
            """, (class_id, subject_name))

    def update_subject_max(self, class_id, subject_name, new_max):
        with transaction() as db:
            db.execute("""
                UPDATE class_subjects
                SET max_marks=?
                WHERE class_id=? AND subject_name=?
            """, (new_max, class_id, subject_name))
