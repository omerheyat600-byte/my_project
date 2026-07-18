"""
Expense repository — the only layer allowed to talk directly to SQLite
for expense data.
"""
from database import transaction
from models.expense import Expense
from repositories.base_repository import BaseRepository


class ExpenseRepository(BaseRepository):
    table = "expenses"
    id_column = "id"

    def find_by_id(self, eid):
        row = self._fetchone("SELECT * FROM expenses WHERE id=?", (eid,))
        return dict(row) if row else None

    def find_all(self, query="", category_filter="", date_from="", date_to=""):
        sql = "SELECT * FROM expenses WHERE 1=1"
        params = []

        if query:
            sql += " AND (description LIKE ? OR category LIKE ?)"
            params.extend([f"%{query}%", f"%{query}%"])

        if category_filter:
            sql += " AND category=?"
            params.append(category_filter)

        if date_from:
            sql += " AND date>=?"
            params.append(date_from)

        if date_to:
            sql += " AND date<=?"
            params.append(date_to)

        sql += " ORDER BY date DESC, id DESC"

        rows = self._fetchall(sql, params)
        return [dict(r) for r in rows]

    def create(self, expense: Expense):
        with transaction() as db:
            cursor = db.execute("""
                INSERT INTO expenses(category, description, amount, payment_method, reference_no, date)
                VALUES (?,?,?,?,?,?)
            """, (
                expense.category, expense.description, expense.amount,
                expense.payment_method, expense.reference_no, expense.date
            ))
            new_id = cursor.lastrowid
        return new_id

    def update(self, eid, expense: Expense):
        with transaction() as db:
            db.execute("""
                UPDATE expenses SET
                    category=?, description=?, amount=?, payment_method=?, reference_no=?, date=?
                WHERE id=?
            """, (
                expense.category, expense.description, expense.amount,
                expense.payment_method, expense.reference_no, expense.date,
                eid
            ))
