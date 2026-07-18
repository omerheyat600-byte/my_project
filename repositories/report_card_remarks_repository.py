"""
Repository for Report Card Remarks (AI Tools).

One row per (exam_id, student_id). Generation writes/overwrites via
upsert(); a teacher's manual edit afterwards goes through the same
upsert() with generation_mode='manual', so there's only ever one
remark on record per student per exam — no separate history table,
matching how ai_question_bank/question_papers keep things simple.
"""
from database import transaction
from repositories.base_repository import BaseRepository


class ReportCardRemarksRepository(BaseRepository):
    table = "report_card_remarks"

    def find_by_exam_and_student(self, exam_id, student_id):
        row = self._fetchone(
            "SELECT * FROM report_card_remarks WHERE exam_id=? AND student_id=?",
            (exam_id, student_id)
        )
        return dict(row) if row else None

    def find_all_for_exam(self, exam_id):
        """Returns {student_id: remark_row} for every remark saved against this exam."""
        rows = self._fetchall(
            "SELECT * FROM report_card_remarks WHERE exam_id=?",
            (exam_id,)
        )
        return {r["student_id"]: dict(r) for r in rows}

    def upsert(self, exam_id, student_id, overall_remark, strengths,
               improvement_areas, generation_mode="offline", created_by=None):
        existing = self.find_by_exam_and_student(exam_id, student_id)
        with transaction() as db:
            if existing:
                db.execute("""
                    UPDATE report_card_remarks
                    SET overall_remark=?, strengths=?, improvement_areas=?,
                        generation_mode=?, created_by=?, updated_at=CURRENT_TIMESTAMP
                    WHERE exam_id=? AND student_id=?
                """, (overall_remark, strengths, improvement_areas,
                      generation_mode, created_by, exam_id, student_id))
                return existing["id"]
            else:
                cur = db.execute("""
                    INSERT INTO report_card_remarks
                    (exam_id, student_id, overall_remark, strengths, improvement_areas,
                     generation_mode, created_by)
                    VALUES (?,?,?,?,?,?,?)
                """, (exam_id, student_id, overall_remark, strengths, improvement_areas,
                      generation_mode, created_by))
                return cur.lastrowid

    def delete_for_exam_student(self, exam_id, student_id):
        with transaction() as db:
            db.execute(
                "DELETE FROM report_card_remarks WHERE exam_id=? AND student_id=?",
                (exam_id, student_id)
            )
