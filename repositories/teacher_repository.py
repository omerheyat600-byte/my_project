"""
Teacher repository — the only layer allowed to talk directly to SQLite
for teacher-related data.
"""
from database import transaction
from models.teacher import Teacher
from repositories.base_repository import BaseRepository


class TeacherRepository(BaseRepository):
    table = "teachers"
    id_column = "id"

    def find_all(self, query="", subject_filter=""):
        sql = "SELECT * FROM teachers WHERE 1=1"
        params = []

        if query:
            sql += " AND (name LIKE ? OR id LIKE ?)"
            params.extend([f"%{query}%", f"%{query}%"])

        if subject_filter:
            sql += " AND subject=?"
            params.append(subject_filter)

        rows = self._fetchall(sql, params)
        return [Teacher.from_row(r) for r in rows]

    def find_distinct_subjects(self):
        rows = self._fetchall("SELECT DISTINCT subject FROM teachers ORDER BY subject")
        return [r["subject"] for r in rows]

    def find_by_id(self, tid):
        row = super().find_by_id(tid)
        return Teacher.from_row(row)

    def create(self, teacher: Teacher):
        with transaction() as db:
            db.execute("""
                INSERT INTO teachers(
                    id,name,subject,gender,phone,email,
                    qualification,salary,join_date
                ) VALUES (?,?,?,?,?,?,?,?,?)
            """, (
                teacher.id,
                teacher.name,
                teacher.subject,
                teacher.gender,
                teacher.phone,
                teacher.email,
                teacher.qualification,
                teacher.salary,
                teacher.join_date,
            ))
        return teacher

    def update(self, tid, teacher: Teacher):
        with transaction() as db:
            db.execute("""
                UPDATE teachers SET
                    name=?, subject=?, gender=?, phone=?,
                    email=?, qualification=?, salary=?, join_date=?
                WHERE id=?
            """, (
                teacher.name,
                teacher.subject,
                teacher.gender,
                teacher.phone,
                teacher.email,
                teacher.qualification,
                teacher.salary,
                teacher.join_date,
                tid,
            ))

    def find_id_name_list(self):
        rows = self._fetchall("SELECT id, name FROM teachers")
        return [dict(r) for r in rows]
