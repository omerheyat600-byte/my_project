"""
Repository for the Lesson Planner (AI Tools): saved generated lesson
plans. Same shape pattern as AIPaperRepository's question_papers half —
a JSON content blob plus queryable class/subject columns for filtering.
"""
import json

from database import transaction
from repositories.base_repository import BaseRepository


class LessonPlanRepository(BaseRepository):
    table = "lesson_plans"

    def save_plan(self, class_id, subject, topic, duration_minutes,
                  generation_mode, content, created_by):
        with transaction() as db:
            cur = db.execute("""
                INSERT INTO lesson_plans
                (class_id, subject, topic, duration_minutes, generation_mode, content_json, created_by)
                VALUES (?,?,?,?,?,?,?)
            """, (class_id, subject, topic, duration_minutes, generation_mode,
                  json.dumps(content), created_by))
            return cur.lastrowid

    def find_plans(self, class_id=None, subject=None):
        sql = """
            SELECT p.id, p.class_id, c.class_name, p.subject, p.topic, p.duration_minutes,
                   p.generation_mode, p.created_by, p.created_at
            FROM lesson_plans p
            LEFT JOIN classes c ON p.class_id = c.id
            WHERE 1=1
        """
        params = []
        if class_id:
            sql += " AND p.class_id=?"
            params.append(class_id)
        if subject:
            sql += " AND p.subject=?"
            params.append(subject)
        sql += " ORDER BY p.id DESC"
        return [dict(r) for r in self._fetchall(sql, tuple(params))]

    def find_plan_by_id(self, plan_id):
        row = self._fetchone("""
            SELECT p.*, c.class_name
            FROM lesson_plans p
            LEFT JOIN classes c ON p.class_id = c.id
            WHERE p.id=?
        """, (plan_id,))
        if not row:
            return None
        plan = dict(row)
        plan["content"] = json.loads(plan["content_json"])
        return plan

    def delete_plan(self, plan_id):
        with transaction() as db:
            db.execute("DELETE FROM lesson_plans WHERE id=?", (plan_id,))
