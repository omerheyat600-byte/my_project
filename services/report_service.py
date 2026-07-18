"""
Report service — sits between routes/reports.py and the repository.
Shapes raw aggregate data into the response each report tab needs, and
builds CSV exports (plain stdlib csv module — no extra dependency,
keeps the PyInstaller .exe build simple).
"""
import csv
import io
from datetime import date

from repositories.report_repository import ReportRepository

FAR_PAST = "0001-01-01"
FAR_FUTURE = "9999-12-31"


class ReportService:

    def __init__(self, repository: ReportRepository = None):
        self.repository = repository or ReportRepository()

    @staticmethod
    def _default_month_range():
        end = date.today()
        start = end.replace(day=1)
        return start.isoformat(), end.isoformat()

    # ---------- Report bundles (used by the on-screen tabs) ----------

    def enrollment_report(self):
        return {
            "total_students": self.repository.enrollment_total(),
            "by_grade": self.repository.enrollment_by_grade(),
            "by_gender": self.repository.enrollment_by_gender(),
            "trend": self.repository.enrollment_trend(),
        }

    def fees_report(self, start=None, end=None):
        start = start or FAR_PAST
        end = end or FAR_FUTURE
        return {
            "start": start, "end": end,
            "summary": self.repository.fees_summary(start, end),
            "by_month": self.repository.fees_by_month(start, end),
            "by_status": self.repository.fees_by_status(start, end),
            "detail": self.repository.fees_detail(start, end),
        }

    def attendance_report(self, start=None, end=None):
        default_start, default_end = self._default_month_range()
        start = start or default_start
        end = end or default_end

        by_status = self.repository.attendance_summary(start, end)
        total = sum(r["c"] for r in by_status)
        present = next((r["c"] for r in by_status if r["status"] == "Present"), 0)
        overall_percentage = round((present / total) * 100, 1) if total else 0

        return {
            "start": start, "end": end,
            "by_status": by_status,
            "by_class": self.repository.attendance_by_class(start, end),
            "detail": self.repository.attendance_detail(start, end),
            "overall_percentage": overall_percentage,
            "total_marked": total,
        }

    def academic_report(self, exam_id=None):
        return {
            "exams": self.repository.academic_by_exam(),
            "grade_distribution": self.repository.academic_grade_distribution(exam_id),
            "detail": self.repository.academic_detail(exam_id),
        }

    def financial_report(self, start=None, end=None):
        start = start or FAR_PAST
        end = end or FAR_FUTURE
        fees_summary = self.repository.fees_summary(start, end)
        expenses_total = self.repository.expenses_summary(start, end)
        collected = fees_summary.get("total_collected", 0)

        return {
            "start": start, "end": end,
            "fees_collected": collected,
            "fees_pending": fees_summary.get("total_pending", 0),
            "expenses_total": expenses_total,
            "expenses_by_category": self.repository.expenses_by_category(start, end),
            "net": collected - expenses_total,
        }

    # ---------- CSV export ----------

    @staticmethod
    def rows_to_csv(rows, fieldnames):
        """Build a CSV string from a list of dicts. Used by every export
        endpoint so they all produce a consistent, Excel-friendly file."""
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
        return buffer.getvalue()

    def export_rows(self, report_type, start=None, end=None, exam_id=None):
        """Returns (rows, fieldnames) for the given report type, ready to
        hand to rows_to_csv(). Raises ValueError for an unknown type."""
        start = start or FAR_PAST
        end = end or FAR_FUTURE

        if report_type == 'enrollment':
            return self.repository.enrollment_by_grade(), ['grade', 'c']

        if report_type == 'fees':
            return (
                self.repository.fees_detail(start, end),
                ['id', 'student_id', 'student_name', 'fee_type', 'month',
                 'amount', 'paid_amount', 'status', 'due_date', 'paid_date'],
            )

        if report_type == 'attendance':
            return (
                self.repository.attendance_detail(start, end),
                ['date', 'student_id', 'student_name', 'class_name', 'status', 'remarks'],
            )

        if report_type == 'academic':
            return (
                self.repository.academic_detail(exam_id),
                ['student_id', 'student_name', 'term', 'year', 'class_name',
                 'total_obtained', 'total_marks', 'percentage', 'grade', 'position'],
            )

        if report_type == 'financial':
            return self.repository.expenses_by_category(start, end), ['category', 'total']

        raise ValueError(f"Unknown report type: {report_type}")
