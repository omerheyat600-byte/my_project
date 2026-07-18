"""
Automatic daily backup scheduler.

Runs as a daemon thread inside the same process (no external scheduler
or extra dependency needed — this app runs as a single long-lived
waitress process per school). Every day at BACKUP_HOUR:BACKUP_MINUTE
local time it calls BackupService.create_backup(), then deletes
automatic backups older than RETENTION_DAYS so the backups folder
doesn't grow forever.

Manual backups (created from the Backup page in the UI) are labeled
differently and are never touched by the retention cleanup here —
only backups this scheduler itself created (label="auto") are subject
to auto-deletion.
"""
import threading
import time
from datetime import datetime, timedelta

from utils.logger import get_logger

logger = get_logger(__name__)

BACKUP_HOUR = 2      # 2 AM local server time
BACKUP_MINUTE = 0
RETENTION_DAYS = 14  # keep the last 14 automatic backups

_started = False
_lock = threading.Lock()


def _seconds_until_next_run():
    now = datetime.now()
    target = now.replace(hour=BACKUP_HOUR, minute=BACKUP_MINUTE, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return (target - now).total_seconds()


def _run_backup_and_cleanup():
    from services.backup_service import BackupService
    service = BackupService()
    try:
        result = service.create_backup(created_by="system", label="auto")
        logger.info(f"Automatic backup created: {result.get('filename')}")
    except Exception as e:
        logger.error(f"Automatic backup failed: {e}")
        return

    try:
        cutoff = datetime.now() - timedelta(days=RETENTION_DAYS)
        for b in service.list_backups():
            if "_auto" not in b["filename"]:
                continue  # only clean up backups this scheduler created
            created_at = b["created_at"]
            if isinstance(created_at, str):
                try:
                    created_at = datetime.fromisoformat(created_at)
                except ValueError:
                    continue
            if not isinstance(created_at, datetime):
                continue
            if created_at < cutoff:
                service.delete_backup(b["filename"], deleted_by="system (retention cleanup)")
                logger.info(f"Deleted old automatic backup: {b['filename']}")
    except Exception as e:
        logger.error(f"Backup retention cleanup failed: {e}")


def _loop():
    while True:
        sleep_seconds = _seconds_until_next_run()
        logger.info(f"Next automatic backup in {sleep_seconds / 3600:.1f} hour(s)")
        time.sleep(sleep_seconds)
        _run_backup_and_cleanup()


def start():
    """Start the background scheduler thread. Safe to call more than
    once — only the first call actually starts anything."""
    global _started
    with _lock:
        if _started:
            return
        _started = True
    thread = threading.Thread(target=_loop, name="backup-scheduler", daemon=True)
    thread.start()
    logger.info("Automatic daily backup scheduler started.")
