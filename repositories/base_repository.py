"""
Generic repository base class.

Modules that follow the same pattern as Student (Teacher, Class, Fee,
Result, Attendance, Expenses, Users, ...) can subclass this to avoid
rewriting the same find/delete/exists boilerplate for every table.

Subclasses set `table` and `id_column`, and add their own
create/update/find_all methods for anything more specific than plain
lookups (joins, filters, model mapping, etc).
"""
from database import get_db, transaction


class BaseRepository:
    table = None
    id_column = "id"

    def _fetchone(self, sql, params=()):
        db = get_db()
        try:
            return db.execute(sql, params).fetchone()
        finally:
            db.close()

    def _fetchall(self, sql, params=()):
        db = get_db()
        try:
            return db.execute(sql, params).fetchall()
        finally:
            db.close()

    def find_by_id(self, id_value):
        """Return the raw row for this id, or None. Subclasses typically
        wrap this in their own find_by_id to map the row to a model."""
        return self._fetchone(
            f"SELECT * FROM {self.table} WHERE {self.id_column}=?",
            (id_value,)
        )

    def exists(self, id_value):
        row = self._fetchone(
            f"SELECT 1 FROM {self.table} WHERE {self.id_column}=?",
            (id_value,)
        )
        return row is not None

    def delete(self, id_value):
        with transaction() as db:
            db.execute(
                f"DELETE FROM {self.table} WHERE {self.id_column}=?",
                (id_value,)
            )

    def void(self, id_value, reason=None, voided_by=None):
        """
        Soft-delete: marks the row as voided instead of physically
        removing it, so financial/audit history is never actually lost.
        Requires the table to have is_voided/voided_reason/voided_by/
        voided_at columns (fees, accounts_vouchers).
        """
        from datetime import datetime
        with transaction() as db:
            db.execute(
                f"""UPDATE {self.table} SET
                    is_voided=1, voided_reason=?, voided_by=?, voided_at=?
                    WHERE {self.id_column}=?""",
                (reason, voided_by, datetime.now().isoformat(timespec='seconds'), id_value)
            )

    def count(self):
        row = self._fetchone(f"SELECT COUNT(*) c FROM {self.table}")
        return row["c"] if row else 0
