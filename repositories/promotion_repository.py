"""
Promotion repository — the only layer allowed to talk directly to SQLite
for promotion_batches / promotion_records, and the one place that mutates
students.grade / students.status as part of a promotion run.

A "batch" is one promotion run (e.g. "Grade 9-A -> Grade 10-A, 2026-2027")
containing one "record" per student with their individual decision
(Promoted / Retained / Graduated / Left). Running a batch and undoing a
batch are each wrapped in a single transaction so the students table and
the audit trail (promotion_batches/promotion_records) can never drift out
of sync with each other.
"""
from database import get_db, transaction
from repositories.base_repository import BaseRepository
from repositories.student_repository import StudentRepository
from models.promotion import (
    DECISION_TO_STUDENT_STATUS,
    BATCH_STATUS_COMPLETED,
    BATCH_STATUS_UNDONE,
)


class PromotionRepository(BaseRepository):
    table = "promotion_batches"
    id_column = "id"

    def __init__(self):
        self.student_repository = StudentRepository()

    # ---------- Rosters / lookups used to build the promotion screen ----------

    def find_class_roster(self, class_name):
        """Active students currently in `class_name`, as dicts."""
        students = self.student_repository.find_active_by_grade(class_name)
        return [s.to_dict() for s in students]

    def find_all_classes_with_counts(self):
        """Every class plus how many Active students currently sit in it —
        used to populate the 'From Class' dropdown with headcounts."""
        rows = self._fetchall("""
            SELECT c.id, c.class_name, c.grade_level, c.section,
                   COUNT(s.id) AS student_count
            FROM classes c
            LEFT JOIN students s
                ON s.grade = c.class_name AND (s.status IS NULL OR s.status = 'Active')
            GROUP BY c.id
            ORDER BY
                CAST(CASE WHEN c.grade_level REGEXP '^[0-9]' THEN c.grade_level ELSE '0' END AS SIGNED),
                c.class_name
        """)
        return [dict(r) for r in rows]

    def suggest_next_class(self, from_class):
        """Best-guess 'next class' for a given class_name, based on
        grade_level (+1) and same section where possible. Returns None if
        nothing matches — the user can always pick manually."""
        current = self._fetchone("SELECT * FROM classes WHERE class_name=?", (from_class,))
        if not current:
            return None
        try:
            next_level = str(int(current["grade_level"]) + 1)
        except (TypeError, ValueError):
            return None

        # Prefer same section at the next grade level.
        row = self._fetchone(
            "SELECT class_name FROM classes WHERE grade_level=? AND section=?",
            (next_level, current["section"])
        )
        if not row:
            row = self._fetchone(
                "SELECT class_name FROM classes WHERE grade_level=? ORDER BY class_name LIMIT 1",
                (next_level,)
            )
        return row["class_name"] if row else None

    # ---------- Running / undoing a promotion batch ----------

    def create_batch_with_records(self, header, records):
        """
        header: dict with from_class, to_class, from_academic_year,
                to_academic_year, remarks, created_by
        records: list of dicts, each with student_id, student_name,
                 from_class, to_class, decision, remarks

        Applies every students.grade/status update AND writes the audit
        trail rows in one transaction. Returns the new batch_id.
        """
        counts = {"Promoted": 0, "Retained": 0, "Graduated": 0, "Left": 0}

        with transaction() as db:
            cursor = db.execute("""
                INSERT INTO promotion_batches
                    (from_class, to_class, from_academic_year, to_academic_year,
                     remarks, created_by, total_students, status)
                VALUES (?,?,?,?,?,?,?,?)
            """, (
                header.get("from_class"),
                header.get("to_class"),
                header.get("from_academic_year"),
                header.get("to_academic_year"),
                header.get("remarks"),
                header.get("created_by"),
                len(records),
                BATCH_STATUS_COMPLETED,
            ))
            batch_id = cursor.lastrowid

            for rec in records:
                decision = rec["decision"]
                counts[decision] = counts.get(decision, 0) + 1
                to_status = DECISION_TO_STUDENT_STATUS.get(decision, "Active")

                db.execute("""
                    INSERT INTO promotion_records
                        (batch_id, student_id, student_name, from_class, to_class,
                         from_status, to_status, decision, remarks)
                    VALUES (?,?,?,?,?,?,?,?,?)
                """, (
                    batch_id,
                    rec["student_id"],
                    rec.get("student_name"),
                    rec.get("from_class"),
                    rec.get("to_class"),
                    "Active",
                    to_status,
                    decision,
                    rec.get("remarks"),
                ))

                self.student_repository.set_grade_and_status(
                    rec["student_id"], rec.get("to_class"), to_status, db=db
                )

            # Roll numbers reset at every new academic year: any class that
            # now holds Active students as a result of this batch (i.e. was
            # someone's destination via Promoted or Retained) gets its roll
            # numbers re-assigned 1..N in alphabetical order — covering
            # both a class of newly-promoted students and a class of
            # students who were Retained back into it.
            classes_to_reset = {
                rec.get("to_class") for rec in records
                if rec.get("to_class") and DECISION_TO_STUDENT_STATUS.get(rec["decision"]) == "Active"
            }
            for class_name in classes_to_reset:
                self.student_repository.reset_roll_numbers_for_class(class_name, db=db)

            db.execute("""
                UPDATE promotion_batches SET
                    promoted_count=?, retained_count=?, graduated_count=?, left_count=?
                WHERE id=?
            """, (
                counts.get("Promoted", 0), counts.get("Retained", 0),
                counts.get("Graduated", 0), counts.get("Left", 0), batch_id,
            ))

        return batch_id

    def undo_batch(self, batch_id, undone_by):
        """Reverts every student in this batch back to their pre-promotion
        class/status, then marks the batch Undone. Safe to call only on a
        batch whose status is still 'Completed' (enforced by the service
        layer, which reads current status before calling this)."""
        with transaction() as db:
            records = db.execute(
                "SELECT * FROM promotion_records WHERE batch_id=?", (batch_id,)
            ).fetchall()

            for rec in records:
                self.student_repository.set_grade_and_status(
                    rec["student_id"], rec["from_class"], rec["from_status"], db=db
                )

            # Mirror the same roll-number reset that a promotion run does.
            # Two sets of classes need re-numbering after an undo: the
            # classes students are restored INTO (their roster grew), and
            # the classes they're removed FROM (their roster shrank) — both
            # need fresh 1..N numbers to stay consistent.
            classes_to_reset = {
                rec["from_class"] for rec in records
                if rec["from_class"] and rec["from_status"] == "Active"
            }
            classes_to_reset |= {rec["to_class"] for rec in records if rec["to_class"]}
            for class_name in classes_to_reset:
                self.student_repository.reset_roll_numbers_for_class(class_name, db=db)

            db.execute("""
                UPDATE promotion_batches
                SET status=?, undone_at=CURRENT_TIMESTAMP, undone_by=?
                WHERE id=?
            """, (BATCH_STATUS_UNDONE, undone_by, batch_id))

    # ---------- History ----------

    def find_all_batches(self):
        rows = self._fetchall("SELECT * FROM promotion_batches ORDER BY id DESC")
        return [dict(r) for r in rows]

    def find_batch_by_id(self, batch_id):
        row = self._fetchone("SELECT * FROM promotion_batches WHERE id=?", (batch_id,))
        return dict(row) if row else None

    def find_records_by_batch(self, batch_id):
        rows = self._fetchall(
            "SELECT * FROM promotion_records WHERE batch_id=? ORDER BY student_name",
            (batch_id,)
        )
        return [dict(r) for r in rows]

    # ---------- Find / search across every batch ----------

    def search_records(self, query):
        """Search every promotion record ever created (across all batches)
        by student id/name or from/to class — this is how a user answers
        'which class was this student promoted from/to, and when?' without
        having to remember which batch it was in."""
        q = f"%{query}%"
        rows = self._fetchall("""
            SELECT pr.*, pb.from_academic_year, pb.to_academic_year,
                   pb.promotion_date, pb.status AS batch_status
            FROM promotion_records pr
            JOIN promotion_batches pb ON pb.id = pr.batch_id
            WHERE pr.student_id LIKE ? OR pr.student_name LIKE ?
               OR pr.from_class LIKE ? OR pr.to_class LIKE ?
            ORDER BY pr.created_at DESC
        """, (q, q, q, q))
        return [dict(r) for r in rows]
