"""
Notification service — business logic layer sitting between the
notifications routes and the notification/fee repositories.

Two things live here:
  - History/stats over the existing notification_log table (populated
    today only by the attendance SMS-alert flow).
  - A Notification Center: ad-hoc single SMS to one parent, and bulk
    fee-reminder SMS to every parent with outstanding dues.
"""
from repositories.notification_repository import NotificationRepository
from repositories.fee_repository import FeeRepository
from repositories.settings_repository import SettingsRepository
from utils.logger import get_logger
from utils.sms import send_sms

logger = get_logger(__name__)


class NotificationValidationError(Exception):
    pass


class NotificationService:

    def __init__(self, notification_repo: NotificationRepository, fee_repo: FeeRepository,
                 settings_repo: SettingsRepository = None):
        self.notification_repo = notification_repo
        self.fee_repo = fee_repo
        self.settings_repo = settings_repo or SettingsRepository()

    # ---------- History / stats ----------

    def get_history(self, status="", related_to="", q="", page=1, per_page=25):
        try:
            page = max(1, int(page or 1))
            per_page = max(1, min(int(per_page or 25), 200))
        except ValueError:
            raise NotificationValidationError("page and per_page must be numbers")

        offset = (page - 1) * per_page
        records = self.notification_repo.find_all(status, related_to, q, per_page, offset)
        total = self.notification_repo.count_all(status, related_to, q)

        return {
            "records": records,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page if total else 1,
        }

    def get_stats(self):
        return self.notification_repo.get_stats()

    # ---------- Manual single send ----------

    def send_manual(self, student_id, message):
        student_id = (student_id or "").strip()
        message = (message or "").strip()

        if not student_id:
            raise NotificationValidationError("student_id is required")
        if not message:
            raise NotificationValidationError("message is required")

        student = self.notification_repo.find_student_contact(student_id)
        if not student:
            raise NotificationValidationError("Student not found")
        if not student.get("parent_phone"):
            raise NotificationValidationError("This student has no parent phone number on file")

        success, error = send_sms(student["parent_phone"], message)
        status = "sent" if success else "failed"

        self.notification_repo.log(
            student_id=student_id,
            parent_phone=student["parent_phone"],
            message=message,
            status=status,
            error=error,
            related_to="manual",
            related_id=None,
        )

        if not success:
            logger.error(f"Manual SMS failed for {student_id}: {error}")

        return {
            "status": status,
            "error": error,
            "student_name": student.get("name"),
            "parent_phone": student.get("parent_phone"),
        }

    # ---------- Bulk fee reminders ----------

    def _build_fee_message(self, row):
        school_name = self.settings_repo.get_school_name()
        amount = row.get("total_unpaid") or 0
        return (
            f"Dear Parent, a total of Rs. {amount:,.0f} in school fees is pending for "
            f"{row['student_name']}. Kindly clear the dues at your earliest convenience. "
            f"- {school_name}"
        )

    def preview_fee_reminders(self, class_name=""):
        rows = self.fee_repo.find_unpaid_with_contact(class_name)

        preview = []
        total_outstanding = 0
        missing_phone = 0
        for r in rows:
            has_phone = bool(r.get("parent_phone"))
            if not has_phone:
                missing_phone += 1
            total_outstanding += r.get("total_unpaid") or 0
            preview.append({
                **r,
                "has_phone": has_phone,
                "message_preview": self._build_fee_message(r),
            })

        return {
            "students": preview,
            "total_students": len(preview),
            "total_outstanding": total_outstanding,
            "missing_phone_count": missing_phone,
        }

    def send_fee_reminders(self, student_ids=None, class_name=""):
        rows = self.fee_repo.find_unpaid_with_contact(class_name)

        if student_ids:
            wanted = set(student_ids)
            rows = [r for r in rows if r["student_id"] in wanted]

        if not rows:
            raise NotificationValidationError("No matching students with outstanding fees found")

        sent, failed, skipped = 0, 0, 0
        results = []

        for r in rows:
            phone = r.get("parent_phone")
            if not phone:
                skipped += 1
                results.append({
                    "student_id": r["student_id"],
                    "student_name": r["student_name"],
                    "status": "skipped",
                    "error": "No parent phone number on file",
                })
                continue

            message = self._build_fee_message(r)
            success, error = send_sms(phone, message)
            status = "sent" if success else "failed"

            self.notification_repo.log(
                student_id=r["student_id"],
                parent_phone=phone,
                message=message,
                status=status,
                error=error,
                related_to="fee_reminder",
                related_id=None,
            )

            if success:
                sent += 1
            else:
                failed += 1
                logger.error(f"Fee reminder SMS failed for {r['student_id']}: {error}")

            results.append({
                "student_id": r["student_id"],
                "student_name": r["student_name"],
                "status": status,
                "error": error,
            })

        logger.info(f"Fee reminders sent: sent={sent} failed={failed} skipped={skipped}")

        return {
            "sent": sent,
            "failed": failed,
            "skipped": skipped,
            "results": results,
        }
