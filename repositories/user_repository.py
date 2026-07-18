"""
User repository — the only layer allowed to talk directly to SQLite
for user/account data.
"""
from database import transaction
from models.user import User
from repositories.base_repository import BaseRepository
from utils.security import hash_password


class UserRepository(BaseRepository):
    table = "users"
    id_column = "id"

    def ensure_schema(self):
        """Create the users table if it doesn't already exist."""
        with transaction() as db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    username VARCHAR(100) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    full_name VARCHAR(150) NOT NULL,
                    email VARCHAR(150),
                    role VARCHAR(30) NOT NULL DEFAULT 'viewer',
                    is_active INT DEFAULT 1,
                    created_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
                    last_login VARCHAR(30)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

    def seed_default_admin(self):
        """Create the default admin account only if no admin/user row exists yet."""
        admin = self._fetchone("SELECT id FROM users WHERE username = 'admin'")
        if admin:
            return False

        with transaction() as db:
            db.execute("""
                INSERT INTO users (username, password_hash, full_name, email, role)
                VALUES (?, ?, ?, ?, ?)
            """, ('admin', hash_password('admin123'), 'System Administrator', 'admin@school.com', 'admin'))
        return True

    def find_all(self):
        rows = self._fetchall("""
            SELECT id, username, full_name, email, role, is_active, created_at, last_login
            FROM users
            ORDER BY username
        """)
        return [dict(r) for r in rows]

    def find_by_username(self, username):
        return self._fetchone(
            "SELECT id, username, password_hash, full_name, role, is_active FROM users WHERE username = ?",
            (username,)
        )

    def find_active_by_id(self, user_id):
        return self._fetchone(
            "SELECT id, username, full_name, role FROM users WHERE id = ? AND is_active = 1",
            (user_id,)
        )

    def find_role_by_id(self, user_id):
        return self._fetchone("SELECT role FROM users WHERE id=?", (user_id,))

    def count_active_admins(self):
        row = self._fetchone("SELECT COUNT(*) as c FROM users WHERE role='admin' AND is_active=1")
        return row['c'] if row else 0

    def create(self, user: User, password):
        with transaction() as db:
            cursor = db.execute("""
                INSERT INTO users (username, password_hash, full_name, email, role)
                VALUES (?, ?, ?, ?, ?)
            """, (
                user.username,
                hash_password(password),
                user.full_name,
                user.email,
                user.role,
            ))
            new_id = cursor.lastrowid
        return new_id

    def update_fields(self, user_id, updates, params):
        """updates: list of 'col = ?' fragments, params: matching values (id appended by caller)."""
        with transaction() as db:
            db.execute(f"""
                UPDATE users SET {', '.join(updates)}
                WHERE id = ?
            """, params)

    def update_last_login(self, user_id):
        try:
            with transaction() as db:
                db.execute("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?", (user_id,))
        except Exception:
            pass

    def get_columns(self):
        """Column metadata for the users table (used by the debug /api/test-schema endpoint)."""
        rows = self._fetchall(
            "SELECT column_name, data_type, is_nullable, column_default "
            "FROM information_schema.columns "
            "WHERE table_schema = DATABASE() AND table_name = 'users' "
            "ORDER BY ordinal_position"
        )
        return [dict(col) for col in rows]
