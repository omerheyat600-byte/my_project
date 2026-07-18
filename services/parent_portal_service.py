"""
Parent Portal service — everything a logged-in parent is allowed to
see, always scoped to the single student their account is linked to.
Every method takes student_id as an argument; routes must always pass
the student_id from the session, never from the request, so a parent
can never view another student's data.
"""
from datetime import date, timedelta

from repositories.attendance_repository import AttendanceRepository
from repositories.fee_repository import FeeRepository
from repositories.notification_repository import NotificationRepository
from repositories.result_repository import ResultRepository
from repositories.student_repository import StudentRepository


class ParentPortalService:

    def __init__(self,
                 student_repository: StudentRepository = None,
                 fee_repository: FeeRepository = None,
                 result_repository: ResultRepository = None,
                 attendance_repository: AttendanceRepository = None,
                 notification_repository: NotificationRepository = None):
        self.student_repository = student_repository or StudentRepository()
        self.fee_repository = fee_repository or FeeRepository()
        self.result_repository = result_repository or ResultRepository()
        self.attendance_repository = attendance_repository or AttendanceRepository()
        self.notification_repository = notification_repository or NotificationRepository()

    def get_student(self, student_id):
        student = self.student_repository.find_by_id(student_id)
        return student.to_dict() if student else None

    def get_fees(self, student_id):
        return {
            "fees": self.fee_repository.find_fees_for_student(student_id),
            "total_unpaid": self.fee_repository.find_total_unpaid(student_id),
        }

    def get_results(self, student_id):
        """Combined results for the parent, merging BOTH result systems:
        the structured exam-session workflow and the legacy flat per-subject
        entry form/Excel grid. Previously only structured exam results were
        surfaced here, so any student whose marks were entered through the
        legacy form silently showed "No exam results yet" — even though
        results existed. Both sources are now merged and sorted by date so
        the true latest result always surfaces, regardless of which entry
        method was used.
        """
        structured = self.result_repository.find_exam_results_for_student(student_id)
        for exam in structured:
            exam["source"] = "exam"

        legacy = self.result_repository.find_legacy_result_batches_for_student(student_id)
        for batch in legacy:
            batch["source"] = "legacy"

        combined = structured + legacy
        combined.sort(key=lambda r: r.get("exam_date") or "", reverse=True)

        return {
            "exams": combined,
            "legacy_results": self.result_repository.find_results_for_student(student_id),
        }

    def get_attendance(self, student_id, days=30):
        end_date = date.today()
        start_date = end_date - timedelta(days=days)
        records = self.attendance_repository.find_by_student_range(
            student_id, start_date.isoformat(), end_date.isoformat()
        )
        present = sum(1 for r in records if r['status'] == 'Present')
        absent = sum(1 for r in records if r['status'] == 'Absent')
        late = sum(1 for r in records if r['status'] == 'Late')
        leave = sum(1 for r in records if r['status'] == 'Leave')
        return {
            "records": records,
            "summary": {
                "present": present,
                "absent": absent,
                "late": late,
                "leave": leave,
                "total_marked": len(records),
            },
        }

    def get_notifications(self, student_id, limit=25):
        return {"notifications": self.notification_repository.find_by_student(student_id, limit)}

    def get_dashboard(self, student_id):
        """Combined snapshot for the Parent Portal home screen."""
        student = self.get_student(student_id)
        fees = self.get_fees(student_id)
        results = self.get_results(student_id)
        attendance = self.get_attendance(student_id, days=30)
        notifications = self.get_notifications(student_id, limit=5)

        return {
            "student": student,
            "fees_summary": {"total_unpaid": fees["total_unpaid"], "recent_fees": fees["fees"][:5]},
            "recent_exams": results["exams"][:3],
            "attendance_summary": attendance["summary"],
            "recent_notifications": notifications["notifications"],
        }
