"""
Payment repository — the only layer allowed to talk directly to
SQLite for the `payments` table (online gateway payment attempts).
"""
import json

from database import transaction
from repositories.base_repository import BaseRepository


class PaymentRepository(BaseRepository):
    table = "payments"
    id_column = "id"

    def create(self, fee_id, student_id, txn_ref_no, amount, gateway="jazzcash"):
        with transaction() as db:
            cursor = db.execute("""
                INSERT INTO payments (fee_id, student_id, txn_ref_no, amount, gateway, status)
                VALUES (?, ?, ?, ?, ?, 'Initiated')
            """, (fee_id, student_id, txn_ref_no, amount, gateway))
            return cursor.lastrowid

    def find_by_txn_ref(self, txn_ref_no):
        row = self._fetchone("SELECT * FROM payments WHERE txn_ref_no=?", (txn_ref_no,))
        return dict(row) if row else None

    def find_by_fee(self, fee_id):
        rows = self._fetchall(
            "SELECT * FROM payments WHERE fee_id=? ORDER BY created_at DESC", (fee_id,)
        )
        return [dict(r) for r in rows]

    def update_status(self, txn_ref_no, status, gateway_txn_id=None, response_code=None,
                       response_message=None, raw_response=None):
        with transaction() as db:
            db.execute("""
                UPDATE payments SET
                    status=?, gateway_txn_id=?, response_code=?, response_message=?,
                    raw_response=?, updated_at=CURRENT_TIMESTAMP
                WHERE txn_ref_no=?
            """, (
                status, gateway_txn_id, response_code, response_message,
                json.dumps(raw_response) if raw_response is not None else None,
                txn_ref_no
            ))
