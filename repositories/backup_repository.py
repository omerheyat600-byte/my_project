"""
Backup repository — the only layer allowed to talk directly to SQLite
for the backup_log table (the audit trail of every backup created,
restored, or failed). Follows the same self-migrating ensure_schema()
pattern as SettingsRepository/UserRepository, so no changes to
database.py's central schema block are needed.
"""
from database import get_db, transaction


class BackupRepository:

    def ensure_schema(self):
        with transaction() as db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS backup_log (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    filename VARCHAR(255) NOT NULL,
                    action VARCHAR(20) NOT NULL,        -- Created, Restored, Failed, Deleted
                    status VARCHAR(20) NOT NULL,        -- Success, Failed
                    size_bytes BIGINT,
                    performed_by VARCHAR(100),
                    details TEXT,
                    created_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

    def log_action(self, filename, action, status, size_bytes=None, performed_by=None, details=None):
        self.ensure_schema()
        with transaction() as db:
            db.execute("""
                INSERT INTO backup_log(filename, action, status, size_bytes, performed_by, details)
                VALUES (?,?,?,?,?,?)
            """, (filename, action, status, size_bytes, performed_by, details))

    def find_history(self, limit=100):
        self.ensure_schema()
        db = get_db()
        try:
            rows = db.execute(
                "SELECT * FROM backup_log ORDER BY created_at DESC, id DESC LIMIT ?",
                (limit,)
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            db.close()

    def merge_history(self, rows):
        """
        Re-insert log rows that existed before a restore but would
        otherwise be lost — because backup_log lives inside school.db,
        swapping in an older database snapshot silently reverts the
        audit log along with everything else, which would erase the
        very history a restore is supposed to be tracked in. Called
        with the pre-restore rows immediately after the swap, before
        the "Restored" entry for the restore itself is written, so the
        audit trail stays continuous instead of jumping backwards.

        Rows are matched on (filename, action, status, created_at,
        performed_by) rather than id, since id/autoincrement state
        differs between the pre-restore and post-restore databases.
        """
        if not rows:
            return
        self.ensure_schema()
        with transaction() as db:
            existing = db.execute(
                "SELECT filename, action, status, created_at, performed_by FROM backup_log"
            ).fetchall()
            existing_keys = {
                (e["filename"], e["action"], e["status"], e["created_at"], e["performed_by"])
                for e in existing
            }
            for r in rows:
                key = (r["filename"], r["action"], r["status"], r["created_at"], r["performed_by"])
                if key in existing_keys:
                    continue
                db.execute("""
                    INSERT INTO backup_log(filename, action, status, size_bytes, performed_by, details, created_at)
                    VALUES (?,?,?,?,?,?,?)
                """, (
                    r["filename"], r["action"], r["status"], r.get("size_bytes"),
                    r.get("performed_by"), r.get("details"), r["created_at"],
                ))
