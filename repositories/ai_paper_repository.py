"""
Repository for the AI Question Paper Generator: the local question
bank (used for offline generation and reuse of AI-generated questions)
and saved generated papers.
"""
import json

from database import transaction
from repositories.base_repository import BaseRepository


class AIPaperRepository(BaseRepository):
    table = "question_papers"

    # ==========================================================
    # QUESTION BANK
    # ==========================================================

    def find_questions(self, subject=None, class_id=None, question_type=None,
                        topic=None, difficulty=None, limit=None):
        sql = """
            SELECT qb.*, c.class_name
            FROM ai_question_bank qb
            LEFT JOIN classes c ON qb.class_id = c.id
            WHERE 1=1
        """
        params = []
        if subject:
            sql += " AND qb.subject = ?"
            params.append(subject)
        if class_id:
            sql += " AND (qb.class_id = ? OR qb.class_id IS NULL)"
            params.append(class_id)
        if question_type:
            sql += " AND qb.question_type = ?"
            params.append(question_type)
        if topic:
            sql += " AND qb.topic LIKE ?"
            params.append(f"%{topic}%")
        if difficulty:
            sql += " AND qb.difficulty = ?"
            params.append(difficulty)
        sql += " ORDER BY qb.id DESC"
        if limit:
            sql += " LIMIT ?"
            params.append(limit)

        rows = self._fetchall(sql, tuple(params))
        return [self._map_question(dict(r)) for r in rows]

    def _map_question(self, row):
        if row.get("options_json"):
            try:
                row["options"] = json.loads(row["options_json"])
            except (TypeError, ValueError):
                row["options"] = []
        else:
            row["options"] = []
        return row

    def add_question(self, class_id, subject, topic, question_type, question_text,
                      options, correct_answer, marks, difficulty, source="manual"):
        with transaction() as db:
            cur = db.execute("""
                INSERT INTO ai_question_bank
                (class_id, subject, topic, question_type, question_text, options_json,
                 correct_answer, marks, difficulty, source)
                VALUES (?,?,?,?,?,?,?,?,?,?)
            """, (class_id, subject, topic, question_type, question_text,
                  json.dumps(options) if options else None,
                  correct_answer, marks, difficulty, source))
            return cur.lastrowid

    def delete_question(self, question_id):
        with transaction() as db:
            db.execute("DELETE FROM ai_question_bank WHERE id=?", (question_id,))

    def count_questions(self, subject=None, class_id=None, question_type=None):
        sql = "SELECT COUNT(*) c FROM ai_question_bank WHERE 1=1"
        params = []
        if subject:
            sql += " AND subject=?"
            params.append(subject)
        if class_id:
            sql += " AND (class_id=? OR class_id IS NULL)"
            params.append(class_id)
        if question_type:
            sql += " AND question_type=?"
            params.append(question_type)
        row = self._fetchone(sql, tuple(params))
        return row["c"] if row else 0

    # ==========================================================
    # SAVED PAPERS
    # ==========================================================

    def save_paper(self, class_id, subject, term, year, title, duration_minutes,
                    total_marks, instructions, generation_mode, content, created_by):
        with transaction() as db:
            cur = db.execute("""
                INSERT INTO question_papers
                (class_id, subject, term, year, title, duration_minutes, total_marks,
                 instructions, generation_mode, content_json, created_by)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)
            """, (class_id, subject, term, year, title, duration_minutes, total_marks,
                  instructions, generation_mode, json.dumps(content), created_by))
            return cur.lastrowid

    def find_papers(self, class_id=None, subject=None):
        sql = """
            SELECT p.id, p.class_id, c.class_name, p.subject, p.term, p.year, p.title,
                   p.duration_minutes, p.total_marks, p.generation_mode, p.created_by, p.created_at
            FROM question_papers p
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

    def find_paper_by_id(self, paper_id):
        row = self._fetchone("""
            SELECT p.*, c.class_name
            FROM question_papers p
            LEFT JOIN classes c ON p.class_id = c.id
            WHERE p.id=?
        """, (paper_id,))
        if not row:
            return None
        paper = dict(row)
        paper["content"] = json.loads(paper["content_json"])
        return paper
