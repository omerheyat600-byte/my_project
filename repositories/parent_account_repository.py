"""
Parent account repository — the only layer allowed to talk directly to
SQLite for parent_accounts data. Table itself is created up-front by
database.init_db(), same as every other table (unlike `users`, which is
lazily bootstrapped, this one has no seeded default row so there's
nothing to bootstrap).
"""
from database import transaction
from models.parent_account import ParentAccount
from repositories.base_repository import BaseRepository
from utils.security import hash_password


class ParentAccountRepository(BaseRepository):
    table = "parent_accounts"
    id_column = "id"

    # ---------- Reads ----------

    def find_all(self):
        rows = self._fetchall("""
            SELECT pa.*, s.name AS student_name, s.grade AS student_grade
            FROM parent_accounts pa
            LEFT JOIN students s ON pa.student_id = s.id
            ORDER BY pa.created_at DESC
        """)
        return [dict(r) for r in rows]

    def find_by_id(self, pid):
        row = super().find_by_id(pid)
        return ParentAccount.from_row(row)

    def find_by_username(self, username):
        return self._fetchone(
            "SELECT id, username, password_hash, student_id, full_name, is_active FROM parent_accounts WHERE username = ?",
            (username,)
        )

    def find_active_by_id(self, pid):
        return self._fetchone(
            "SELECT id, username, student_id, full_name FROM parent_accounts WHERE id = ? AND is_active = 1",
            (pid,)
        )

    def find_by_student_id(self, student_id):
        rows = self._fetchall(
            "SELECT * FROM parent_accounts WHERE student_id = ?",
            (student_id,)
        )
        return [dict(r) for r in rows]

    def username_exists(self, username):
        return self._fetchone("SELECT 1 FROM parent_accounts WHERE username = ?", (username,)) is not None

    # ---------- Writes ----------

    def create(self, account: ParentAccount, password):
        with transaction() as db:
            cursor = db.execute("""
                INSERT INTO parent_accounts (username, password_hash, student_id, full_name, phone)
                VALUES (?, ?, ?, ?, ?)
            """, (
                account.username,
                hash_password(password),
                account.student_id,
                account.full_name,
                account.phone,
            ))
            new_id = cursor.lastrowid
        return new_id

    def set_active(self, pid, is_active):
        with transaction() as db:
            db.execute("UPDATE parent_accounts SET is_active = ? WHERE id = ?", (1 if is_active else 0, pid))

    def reset_password(self, pid, new_password):
        with transaction() as db:
            db.execute(
                "UPDATE parent_accounts SET password_hash = ? WHERE id = ?",
                (hash_password(new_password), pid)
            )

    def update_last_login(self, pid):
        try:
            with transaction() as db:
                db.execute("UPDATE parent_accounts SET last_login = CURRENT_TIMESTAMP WHERE id = ?", (pid,))
        except Exception:
            pass
