"""
Fee Payment Postings repository — a thin trace/lookup table recording how
much of each fee's paid_amount has already been posted to the Accounts
module ledger, and via which voucher.

This table only tracks the *mapping*; it is NOT the source of truth for
money — the actual balanced debit/credit entries live in
accounts_voucher_entries and are never edited or deleted once posted
(only reversed by a new voucher). Rows here cascade-delete if the fee
itself is deleted (see database.py), which is safe because vouchers
carry their own reference_no ('FEE-<id>') and stay in the ledger
untouched by that cascade.
"""
from database import transaction
from repositories.base_repository import BaseRepository


class FeePaymentPostingRepository(BaseRepository):
    table = "fee_payment_postings"
    id_column = "id"

    def get_total_posted(self, fee_id):
        """Net amount already posted to the ledger for this fee (sum of
        all deltas posted so far — positive receipts minus reversals)."""
        row = self._fetchone(
            "SELECT COALESCE(SUM(amount), 0) AS total FROM fee_payment_postings WHERE fee_id=?",
            (fee_id,)
        )
        return float(row["total"]) if row else 0.0

    def find_by_fee(self, fee_id):
        rows = self._fetchall("""
            SELECT fpp.*, av.voucher_no, av.voucher_type, av.voucher_date
            FROM fee_payment_postings fpp
            JOIN accounts_vouchers av ON av.id = fpp.voucher_id
            WHERE fpp.fee_id=?
            ORDER BY fpp.id
        """, (fee_id,))
        return [dict(r) for r in rows]

    def create(self, fee_id, voucher_id, amount):
        with transaction() as db:
            cursor = db.execute(
                "INSERT INTO fee_payment_postings (fee_id, voucher_id, amount) VALUES (?,?,?)",
                (fee_id, voucher_id, amount)
            )
            return cursor.lastrowid
