"""
Expense Payment Postings repository — a thin trace/lookup table recording
how much of each expense has already been posted to the Accounts module
ledger, and via which voucher.

Same design as fee_payment_postings: this table only tracks the
*mapping*; it is NOT the source of truth for money — the actual balanced
debit/credit entries live in accounts_voucher_entries and are never
edited or deleted once posted (only reversed by a new voucher). Rows
here cascade-delete if the expense itself is deleted, which is safe
because vouchers carry their own reference_no ('EXP-<id>') and stay in
the ledger untouched by that cascade.
"""
from database import transaction
from repositories.base_repository import BaseRepository


class ExpensePaymentPostingRepository(BaseRepository):
    table = "expense_payment_postings"
    id_column = "id"

    def get_total_posted(self, expense_id):
        """Net amount already posted to the ledger for this expense (sum
        of all deltas posted so far — positive payments minus reversals)."""
        row = self._fetchone(
            "SELECT COALESCE(SUM(amount), 0) AS total FROM expense_payment_postings WHERE expense_id=?",
            (expense_id,)
        )
        return float(row["total"]) if row else 0.0

    def find_by_expense(self, expense_id):
        rows = self._fetchall("""
            SELECT epp.*, av.voucher_no, av.voucher_type, av.voucher_date
            FROM expense_payment_postings epp
            JOIN accounts_vouchers av ON av.id = epp.voucher_id
            WHERE epp.expense_id=?
            ORDER BY epp.id
        """, (expense_id,))
        return [dict(r) for r in rows]

    def create(self, expense_id, voucher_id, amount):
        with transaction() as db:
            cursor = db.execute(
                "INSERT INTO expense_payment_postings (expense_id, voucher_id, amount) VALUES (?,?,?)",
                (expense_id, voucher_id, amount)
            )
            return cursor.lastrowid
