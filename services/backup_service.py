"""
Backup & Restore service — business logic for creating full-system
backup ZIPs and restoring from one.

A backup ZIP contains:
    /database/school_dump.sql   — a full logical snapshot (schema + data)
                                  of the MySQL database, taken via
                                  `mysqldump --single-transaction` so it's
                                  a consistent point-in-time copy even
                                  while the app is live.
    /uploads/...                — every file under config.UPLOADS_DIR,
                                  whatever subfolders exist (students,
                                  documents, idcards, and any future
                                  folder someone adds later — nothing is
                                  hardcoded, the whole tree is walked)
    /settings/settings.json     — school_settings table, exported as
                                  human-readable JSON as a convenience/
                                  redundant safety net (it's already
                                  inside school_dump.sql too)
    /notifications/history.json — notification_log table, same reasoning

Restore is deliberately conservative:
    1. The uploaded ZIP is validated (valid zip, contains a database
       dump entry that looks like a genuine SQL dump) before anything
       is touched.
    2. A fresh safety backup of the CURRENT state is taken automatically
       before any destructive step, so a bad restore is itself
       recoverable.
    3. The dump is imported by piping it straight into the `mysql`
       client against the live database. Unlike the old SQLite version
       of this service, MySQL has no single-file atomic swap — the
       import runs table-by-table (mysqldump emits DROP TABLE IF EXISTS
       + CREATE TABLE + INSERT per table), so a failure partway through
       can leave some tables already replaced. The pre-restore safety
       backup exists precisely for that scenario: re-run restore with
       it if an import fails midway.
"""
import os
import io
import json
import shutil
import subprocess
import tempfile
import threading
import time
import zipfile
from datetime import datetime

import config
from repositories.backup_repository import BackupRepository
from utils.logger import get_logger

logger = get_logger(__name__)

DUMP_ENTRY = "database/school_dump.sql"
SETTINGS_ENTRY = "settings/settings.json"
NOTIFICATIONS_ENTRY = "notifications/history.json"


class BackupError(Exception):
    """Raised for backup-creation failures (disk full, permission denied, etc.)."""
    pass


class InvalidBackupError(Exception):
    """Raised when a backup ZIP fails validation (corrupted, missing, wrong format)."""
    pass


class RestoreError(Exception):
    """Raised for restore failures."""
    pass


class BackupService:

    def __init__(self, repository: BackupRepository = None):
        self.repository = repository or BackupRepository()

    # ------------------------------------------------------------------
    # mysqldump / mysql client helpers
    # ------------------------------------------------------------------

    def _mysqldump_cmd(self):
        return [
            os.environ.get("MYSQLDUMP_PATH", "mysqldump"),
            "-h", str(config.MYSQL_HOST),
            "-P", str(config.MYSQL_PORT),
            "-u", config.MYSQL_USER,
            "--single-transaction",
            "--routines",
            "--triggers",
            "--default-character-set=utf8mb4",
            config.MYSQL_DB,
        ]

    def _mysql_cmd(self):
        return [
            os.environ.get("MYSQL_CLI_PATH", "mysql"),
            "-h", str(config.MYSQL_HOST),
            "-P", str(config.MYSQL_PORT),
            "-u", config.MYSQL_USER,
            "--default-character-set=utf8mb4",
            config.MYSQL_DB,
        ]

    def _mysql_env(self):
        # Pass the password via env var rather than -p on the command
        # line, so it never shows up in a process listing.
        env = os.environ.copy()
        if config.MYSQL_PASSWORD:
            env["MYSQL_PWD"] = config.MYSQL_PASSWORD
        return env

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    def create_backup(self, created_by=None, label=None):
        """Build a single ZIP containing the database, all uploads, and
        JSON exports of settings/notifications. Returns backup metadata.
        Raises BackupError on any failure (and logs it)."""
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
        suffix = f"_{label}" if label else ""
        filename = f"Backup_{timestamp}{suffix}.zip"
        final_path = os.path.join(config.BACKUP_DIR, filename)
        tmp_path = final_path + ".tmp"

        try:
            with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zf:
                self._write_database_snapshot(zf)
                self._write_uploads(zf)
                self._write_settings_export(zf)
                self._write_notifications_export(zf)

            os.replace(tmp_path, final_path)
            size_bytes = os.path.getsize(final_path)

            self.repository.log_action(
                filename=filename, action="Created", status="Success",
                size_bytes=size_bytes, performed_by=created_by,
            )
            logger.info(f"Backup created: {filename} ({size_bytes} bytes) by {created_by}")

            return {
                "filename": filename,
                "size_bytes": size_bytes,
                "created_at": datetime.now().isoformat(),
                "created_by": created_by,
            }

        except OSError as e:
            self._cleanup(tmp_path)
            message = self._describe_os_error(e)
            self.repository.log_action(
                filename=filename, action="Created", status="Failed",
                performed_by=created_by, details=message,
            )
            logger.error(f"Backup creation failed: {filename} — {message}")
            raise BackupError(message) from e

        except Exception as e:
            self._cleanup(tmp_path)
            self.repository.log_action(
                filename=filename, action="Created", status="Failed",
                performed_by=created_by, details=str(e),
            )
            logger.error(f"Backup creation failed: {filename} — {e}")
            raise BackupError(f"Backup failed: {e}") from e

    def _write_database_snapshot(self, zf):
        """Use mysqldump for a consistent logical snapshot (schema +
        data) of the whole database, instead of touching MySQL's own
        data files directly."""
        with tempfile.NamedTemporaryFile(suffix=".sql", delete=False) as tmp:
            dump_path = tmp.name
        try:
            with open(dump_path, "wb") as out:
                try:
                    result = subprocess.run(
                        self._mysqldump_cmd(), stdout=out, stderr=subprocess.PIPE,
                        env=self._mysql_env(), timeout=600,
                    )
                except FileNotFoundError as e:
                    raise BackupError(
                        "mysqldump was not found on PATH. Install the MySQL client "
                        "tools, or set the MYSQLDUMP_PATH environment variable to "
                        "its full location."
                    ) from e

            if result.returncode != 0:
                raise BackupError(
                    f"mysqldump failed: {result.stderr.decode(errors='replace').strip()}"
                )
            if os.path.getsize(dump_path) == 0:
                raise BackupError("mysqldump produced an empty file — nothing was backed up.")

            zf.write(dump_path, DUMP_ENTRY)
        finally:
            self._cleanup(dump_path)

    def _write_uploads(self, zf):
        """Walk the whole uploads tree so any future upload folder is
        automatically included without touching this code."""
        if not os.path.isdir(config.UPLOADS_DIR):
            return
        for root, _dirs, files in os.walk(config.UPLOADS_DIR):
            for f in files:
                full_path = os.path.join(root, f)
                rel_path = os.path.relpath(full_path, config.BASE_DIR)
                zf.write(full_path, rel_path.replace(os.sep, "/"))

    def _write_settings_export(self, zf):
        try:
            from repositories.settings_repository import SettingsRepository
            settings_repo = SettingsRepository()
            settings_repo.ensure_schema()
            from database import get_db
            db = get_db()
            try:
                rows = db.execute("SELECT setting_key, setting_value FROM school_settings").fetchall()
                data = {r["setting_key"]: r["setting_value"] for r in rows}
            finally:
                db.close()
            zf.writestr(SETTINGS_ENTRY, json.dumps(data, indent=2, ensure_ascii=False))
        except Exception as e:
            # Settings export is a convenience extra, not the source of
            # truth (that's inside school_dump.sql) — don't fail the
            # whole backup over it, just note it didn't happen.
            logger.warning(f"Settings export skipped: {e}")

    def _write_notifications_export(self, zf):
        try:
            from database import get_db
            db = get_db()
            try:
                rows = db.execute(
                    "SELECT * FROM notification_log ORDER BY sent_at DESC LIMIT 5000"
                ).fetchall()
                data = [dict(r) for r in rows]
            finally:
                db.close()
            zf.writestr(NOTIFICATIONS_ENTRY, json.dumps(data, indent=2, ensure_ascii=False, default=str))
        except Exception as e:
            logger.warning(f"Notifications export skipped: {e}")

    # ------------------------------------------------------------------
    # List / history
    # ------------------------------------------------------------------

    def list_backups(self):
        """Merge the audit log with what's actually on disk, so a
        manually-deleted file or an untracked file both show correctly."""
        history = self.repository.find_history()
        on_disk = {}
        if os.path.isdir(config.BACKUP_DIR):
            for f in os.listdir(config.BACKUP_DIR):
                if f.endswith(".zip"):
                    full_path = os.path.join(config.BACKUP_DIR, f)
                    on_disk[f] = {
                        "filename": f,
                        "size_bytes": os.path.getsize(full_path),
                        "created_at": datetime.fromtimestamp(os.path.getmtime(full_path)).isoformat(),
                    }

        backups = []
        seen = set()
        for h in history:
            if h["action"] != "Created" or h["status"] != "Success":
                continue
            fname = h["filename"]
            if fname in seen:
                continue
            seen.add(fname)
            exists = fname in on_disk
            backups.append({
                "filename": fname,
                "size_bytes": h["size_bytes"] or (on_disk[fname]["size_bytes"] if exists else 0),
                "created_at": h["created_at"],
                "created_by": h["performed_by"],
                "exists_on_disk": exists,
            })

        # Any files on disk with no matching log entry (e.g. manually copied in)
        for fname, meta in on_disk.items():
            if fname not in seen:
                backups.append({
                    "filename": fname,
                    "size_bytes": meta["size_bytes"],
                    "created_at": meta["created_at"],
                    "created_by": None,
                    "exists_on_disk": True,
                })

        backups.sort(key=lambda b: b["created_at"], reverse=True)
        return backups

    def get_action_history(self, limit=100):
        """Full audit trail (Created/Restored/Failed/Deleted), not just
        the successful-creates list used for the backups table."""
        return self.repository.find_history(limit)

    def get_backup_path(self, filename):
        self._assert_safe_filename(filename)
        path = os.path.join(config.BACKUP_DIR, filename)
        if not os.path.exists(path):
            raise InvalidBackupError(f"Backup file not found: {filename}")
        return path

    def delete_backup(self, filename, deleted_by=None):
        self._assert_safe_filename(filename)
        path = os.path.join(config.BACKUP_DIR, filename)
        if not os.path.exists(path):
            raise InvalidBackupError(f"Backup file not found: {filename}")
        try:
            os.remove(path)
            self.repository.log_action(
                filename=filename, action="Deleted", status="Success", performed_by=deleted_by,
            )
        except OSError as e:
            message = self._describe_os_error(e)
            self.repository.log_action(
                filename=filename, action="Deleted", status="Failed",
                performed_by=deleted_by, details=message,
            )
            raise BackupError(message) from e

    # ------------------------------------------------------------------
    # Validate
    # ------------------------------------------------------------------

    def validate_backup_zip(self, path):
        """Check the ZIP is well-formed and contains what looks like a
        genuine database dump before anything is touched. Returns a
        summary dict. Raises InvalidBackupError on any problem."""
        if not zipfile.is_zipfile(path):
            raise InvalidBackupError("This file is not a valid ZIP archive (it may be corrupted).")

        with zipfile.ZipFile(path, "r") as zf:
            bad_entry = zf.testzip()
            if bad_entry:
                raise InvalidBackupError(f"Backup archive is corrupted (bad entry: {bad_entry}).")

            names = zf.namelist()
            if DUMP_ENTRY not in names:
                raise InvalidBackupError(
                    f"This doesn't look like a backup from this application — "
                    f"missing {DUMP_ENTRY}."
                )

            with tempfile.NamedTemporaryFile(suffix=".sql", delete=False) as tmp:
                tmp.write(zf.read(DUMP_ENTRY))
                tmp_dump_path = tmp.name

            try:
                self._verify_dump_integrity(tmp_dump_path)
            finally:
                self._cleanup(tmp_dump_path)

            has_uploads = any(n.startswith("uploads/") for n in names)
            has_settings = SETTINGS_ENTRY in names
            has_notifications = NOTIFICATIONS_ENTRY in names

        return {
            "valid": True,
            "has_database": True,
            "has_uploads": has_uploads,
            "has_settings": has_settings,
            "has_notifications": has_notifications,
            "entry_count": len(names),
        }

    def _verify_dump_integrity(self, dump_path):
        """MySQL has no single 'integrity_check' command the way SQLite
        does — instead this checks the extracted file looks like a real
        SQL dump (non-empty, contains at least one CREATE TABLE) before
        it's ever fed into a live restore."""
        try:
            size = os.path.getsize(dump_path)
        except OSError as e:
            raise InvalidBackupError(f"The database dump inside this backup is not readable: {e}") from e
        if size == 0:
            raise InvalidBackupError("The database dump inside this backup is empty.")
        with open(dump_path, "r", encoding="utf-8", errors="replace") as f:
            head = f.read(65536)
        if "CREATE TABLE" not in head.upper():
            raise InvalidBackupError(
                "The database dump inside this backup doesn't look like a valid "
                "SQL dump — it may be corrupted or from an incompatible export."
            )

    # ------------------------------------------------------------------
    # Restore
    # ------------------------------------------------------------------

    def restore_backup(self, uploaded_zip_path, restored_by=None, restart_app=True):
        """
        Restore the database and uploads from a validated backup ZIP.
        Takes an automatic safety backup of the current state first.
        Raises InvalidBackupError / RestoreError on failure — nothing on
        disk is touched until validation has already passed.
        """
        validation = self.validate_backup_zip(uploaded_zip_path)

        safety_backup = None
        try:
            safety_backup = self.create_backup(
                created_by=restored_by, label="pre_restore_safety"
            )
            logger.info(f"Pre-restore safety backup created: {safety_backup['filename']}")
        except BackupError as e:
            # If we can't even snapshot the current state, refuse to
            # proceed — restoring without a safety net is exactly the
            # kind of thing that turns a mistake into data loss.
            raise RestoreError(
                f"Restore aborted: could not create a safety backup of the current "
                f"data first ({e}). Nothing has been changed."
            ) from e

        extract_dir = tempfile.mkdtemp(prefix="school_restore_")
        try:
            with zipfile.ZipFile(uploaded_zip_path, "r") as zf:
                zf.extractall(extract_dir)

            extracted_dump = os.path.join(extract_dir, DUMP_ENTRY.replace("/", os.sep))
            self._verify_dump_integrity(extracted_dump)

            # backup_log lives inside the dump like everything else, so
            # importing an older snapshot would silently roll the audit
            # trail back too — including erasing the record of this very
            # restore. Capture it now, before the import, so it can be
            # merged back in right after.
            pre_restore_log = self.repository.find_history(limit=1000)

            # Pipe the dump straight into the mysql client against the
            # live database. mysqldump's output includes DROP TABLE IF
            # EXISTS before each CREATE TABLE, so this naturally replaces
            # every table in the dump.
            with open(extracted_dump, "rb") as f:
                try:
                    result = subprocess.run(
                        self._mysql_cmd(), stdin=f, stderr=subprocess.PIPE,
                        env=self._mysql_env(), timeout=900,
                    )
                except FileNotFoundError as e:
                    raise RestoreError(
                        "The mysql client was not found on PATH. Install the MySQL "
                        "client tools, or set the MYSQL_CLI_PATH environment variable "
                        "to its full location. Your previous data was NOT changed; a "
                        f"safety backup was saved as {safety_backup['filename']}."
                    ) from e

            if result.returncode != 0:
                raise RestoreError(
                    f"Importing the backup into MySQL failed: "
                    f"{result.stderr.decode(errors='replace').strip()}. "
                    f"A safety backup of your data before this attempt was saved as "
                    f"{safety_backup['filename']} — restore from it if some tables "
                    f"were only partially replaced."
                )

            self._restore_uploads(extract_dir)

            # Restore audit-log continuity, then record the restore
            # itself — in that order, so this new entry gets a clean
            # incrementing id after history is back in place rather than
            # colliding with whatever id sequence the old snapshot had.
            self.repository.merge_history(pre_restore_log)

            self.repository.log_action(
                filename=os.path.basename(uploaded_zip_path), action="Restored", status="Success",
                performed_by=restored_by,
                details=f"Safety backup: {safety_backup['filename']}",
            )
            logger.info(f"Restore completed successfully by {restored_by}")

            if restart_app:
                self._schedule_soft_restart()

            return {
                "restored": True,
                "safety_backup": safety_backup["filename"],
                "validation": validation,
                "restart_scheduled": restart_app,
            }

        except InvalidBackupError as e:
            self.repository.log_action(
                filename=os.path.basename(uploaded_zip_path), action="Restored", status="Failed",
                performed_by=restored_by, details=str(e),
            )
            raise RestoreError(str(e)) from e

        except RestoreError:
            self.repository.log_action(
                filename=os.path.basename(uploaded_zip_path), action="Restored", status="Failed",
                performed_by=restored_by, details="See error above",
            )
            raise

        except OSError as e:
            message = self._describe_os_error(e)
            self.repository.log_action(
                filename=os.path.basename(uploaded_zip_path), action="Restored", status="Failed",
                performed_by=restored_by, details=message,
            )
            raise RestoreError(
                f"{message} A safety backup was saved as {safety_backup['filename']}."
            ) from e

        except Exception as e:
            self.repository.log_action(
                filename=os.path.basename(uploaded_zip_path), action="Restored", status="Failed",
                performed_by=restored_by, details=str(e),
            )
            logger.error(f"Restore failed: {e}")
            raise RestoreError(
                f"Restore failed: {e}. A safety backup of your data before this "
                f"attempt was saved as {safety_backup['filename']}."
            ) from e

        finally:
            shutil.rmtree(extract_dir, ignore_errors=True)

    def _restore_uploads(self, extract_dir):
        """Mirror each uploads subfolder present in the backup. A
        subfolder absent from the backup (e.g. an older backup taken
        before a new upload category existed) is left untouched rather
        than wiped, since its absence is ambiguous — it could mean 'there
        was nothing there' or 'this backup predates that feature'."""
        backup_uploads_dir = os.path.join(extract_dir, "uploads")
        if not os.path.isdir(backup_uploads_dir):
            return

        for entry in os.listdir(backup_uploads_dir):
            src = os.path.join(backup_uploads_dir, entry)
            if not os.path.isdir(src):
                continue
            dest = os.path.join(config.UPLOADS_DIR, entry)
            if os.path.exists(dest):
                shutil.rmtree(dest)
            shutil.copytree(src, dest)

    def _schedule_soft_restart(self):
        """
        Best-effort process restart: re-exec the current process image
        a couple seconds after this returns, giving the HTTP response
        time to actually reach the browser first.

        This is deliberately best-effort. os.execv() reliably restarts
        a plain `python run.py` process or a PyInstaller onefile build
        launched directly, but this cannot be guaranteed for every
        possible deployment (e.g. running under some process
        supervisors that don't tolerate execv, or unusual packaging).
        If it fails, it's logged and swallowed — restore has already
        succeeded and been committed to the database at this point, so a
        failed auto-restart just means the user needs to restart the
        app manually, not that anything was lost.
        """
        import sys

        def _restart():
            time.sleep(2)
            try:
                logger.info("Restarting application process after restore...")
                os.execv(sys.executable, [sys.executable] + sys.argv)
            except Exception as e:
                logger.warning(
                    f"Automatic restart after restore failed ({e}). "
                    f"Please restart the application manually to load the restored data."
                )

        threading.Thread(target=_restart, daemon=True).start()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _assert_safe_filename(self, filename):
        """Reject path traversal attempts (../, absolute paths, etc.)
        before touching the filesystem with a user-supplied filename."""
        if not filename or os.path.basename(filename) != filename or ".." in filename:
            raise InvalidBackupError("Invalid backup filename.")
        if not filename.endswith(".zip"):
            raise InvalidBackupError("Invalid backup filename.")

    def _describe_os_error(self, e: OSError) -> str:
        if isinstance(e, PermissionError):
            return (
                "Permission denied writing to the backup folder. Check that the "
                "application has write access to its own directory."
            )
        if getattr(e, "errno", None) == 28:  # ENOSPC
            return "Not enough disk space to complete the backup."
        return f"File system error: {e}"

    def _cleanup(self, path):
        try:
            if path and os.path.exists(path):
                os.remove(path)
        except OSError:
            pass
