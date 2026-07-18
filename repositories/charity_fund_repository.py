"""
Charity Fund repository — the only layer allowed to talk directly to
SQLite for the `charity_fund_ledger` table. Balance is derived by
always writing the running `balance_after` on every ledger row, so
reads never need to sum the whole table.
"""
from database import transaction
from repositories.base_repository import BaseRepository


class CharityFundRepository(BaseRepository):
    table = "charity_fund_ledger"
    id_column = "id"

    # ---------- Reads ----------

    def get_balance(self):
        row = self._fetchone(
            "SELECT balance_after FROM charity_fund_ledger ORDER BY id DESC LIMIT 1"
        )
        return row["balance_after"] if row else 0

    def find_all(self, limit=None):
        sql = "SELECT * FROM charity_fund_ledger ORDER BY id DESC"
        params = []
        if limit:
            sql += " LIMIT ?"
            params.append(limit)
        rows = self._fetchall(sql, params)
        return [dict(r) for r in rows]

    # ---------- Writes ----------

    def add_entry(self, entry_type, amount, source, fee_id, description, created_by):
        """
        Insert one ledger row, computing balance_after from the current
        balance inside the same transaction so concurrent writes can't
        produce two rows with the same stale balance.
        """
        with transaction() as db:
            row = db.execute(
                "SELECT balance_after FROM charity_fund_ledger ORDER BY id DESC LIMIT 1"
            ).fetchone()
            current_balance = row["balance_after"] if row else 0

            if entry_type == "Credit":
                new_balance = current_balance + amount
            else:
                new_balance = current_balance - amount

            cursor = db.execute("""
                INSERT INTO charity_fund_ledger(
                    entry_type, amount, source, fee_id, description,
                    balance_after, created_by
                ) VALUES (?,?,?,?,?,?,?)
            """, (
                entry_type, amount, source, fee_id, description,
                new_balance, created_by
            ))
            return cursor.lastrowid, new_balance
