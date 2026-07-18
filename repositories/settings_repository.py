"""
Settings repository — the only layer allowed to talk directly to
MySQL for the school_settings table.
"""
from database import get_db, transaction

DEFAULT_SCHOOL_NAME = 'Qamar Public High School'


class SettingsRepository:

    def ensure_schema(self):
        with transaction() as db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS school_settings (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    setting_key VARCHAR(100) UNIQUE NOT NULL,
                    setting_value TEXT,
                    updated_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

    def get_school_name(self):
        self.ensure_schema()
        db = get_db()
        try:
            row = db.execute("""
                SELECT setting_value FROM school_settings WHERE setting_key = 'school_name'
            """).fetchone()
        finally:
            db.close()

        if row:
            return row['setting_value']

        # No value yet — persist and return the default.
        with transaction() as db:
            db.execute("""
                INSERT INTO school_settings (setting_key, setting_value)
                VALUES ('school_name', ?)
            """, (DEFAULT_SCHOOL_NAME,))
        return DEFAULT_SCHOOL_NAME

    def set_school_name(self, school_name):
        self.ensure_schema()
        with transaction() as db:
            db.execute("""
                INSERT INTO school_settings (setting_key, setting_value)
                VALUES ('school_name', ?)
                ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
            """, (school_name,))

    def get_setting(self, key, default='false'):
        self.ensure_schema()
        db = get_db()
        try:
            row = db.execute(
                "SELECT setting_value FROM school_settings WHERE setting_key=?", (key,)
            ).fetchone()
        finally:
            db.close()
        return row['setting_value'] if row else default

    def set_setting(self, key, value):
        self.ensure_schema()
        with transaction() as db:
            db.execute("""
                INSERT INTO school_settings (setting_key, setting_value)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
            """, (key, value))
