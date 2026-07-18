"""
Dashboard service — business logic layer sitting between the dashboard
route and the dashboard repository.
"""
import time
from datetime import datetime

from repositories.dashboard_repository import DashboardRepository

MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# Roles allowed to see financial figures (fees, expenses, defaulters).
# Everyone with dashboard access (viewer+) sees the operational cards
# (students/teachers/attendance/inventory/leaves/library); financials
# are scoped narrower since they're sensitive and not every role needs
# them day to day.
FINANCIAL_ROLES = {"admin", "accountant"}

# Cache TTL: the dashboard fires ~10 queries per load. Most pages that
# link back here (or auto-refresh) don't need numbers fresher than a
# minute, so a short in-memory cache avoids hitting the DB on every
# nav/refresh without the numbers going noticeably stale.
CACHE_TTL_SECONDS = 60


class DashboardService:

    def __init__(self, repository: DashboardRepository):
        self.repository = repository
        self._cache = {}

    def get_dashboard_data(self, year=None, role="viewer"):
        year = year or datetime.now().year
        can_view_financials = role in FINANCIAL_ROLES

        cache_key = (year, can_view_financials)
        cached = self._cache.get(cache_key)
        if cached and (time.monotonic() - cached[0]) < CACHE_TTL_SECONDS:
            return cached[1]

        students, teachers, classes = self.repository.counts()
        attendance_present, attendance_total = self.repository.attendance_today()
        attendance_percent = round((attendance_present / attendance_total) * 100, 1) if attendance_total else None
        attendance_trend = self.repository.attendance_trend(days=14)
        staff_present, staff_total = self.repository.staff_attendance_today()
        staff_attendance_percent = round((staff_present / staff_total) * 100, 1) if staff_total else None
        low_stock_count = self.repository.low_stock_count()
        pending_leaves_count = self.repository.pending_leaves_count()
        library_overdue_count = self.repository.library_overdue_count()
        grade_labels, grade_data = self.repository.results_by_grade()
        class_labels, class_data = self.repository.class_enrollment()

        data = {
            "students": students,
            "teachers": teachers,
            "classes": classes,
            "attendance_present": attendance_present,
            "attendance_total": attendance_total,
            "attendance_percent": attendance_percent,
            "attendance_trend": attendance_trend,
            "staff_attendance_present": staff_present,
            "staff_attendance_total": staff_total,
            "staff_attendance_percent": staff_attendance_percent,
            "low_stock_count": low_stock_count,
            "pending_leaves_count": pending_leaves_count,
            "library_overdue_count": library_overdue_count,
            "grade_labels": grade_labels,
            "grade_data": grade_data,
            "class_labels": class_labels,
            "class_data": class_data,
            "months": MONTH_LABELS,
            "year": year,
            "can_view_financials": can_view_financials,
        }

        if can_view_financials:
            fee_map = self.repository.fee_monthly(year)
            expense_map = self.repository.expense_monthly(year)
            data.update({
                "fees_collected": self.repository.fees_collected(),
                "fees_pending": self.repository.fees_pending(),
                "recent_fees": self.repository.recent_fees(limit=6),
                "fee_monthly": [int(fee_map.get(f"{i:02d}", 0)) for i in range(1, 13)],
                "expense_monthly": [int(expense_map.get(f"{i:02d}", 0)) for i in range(1, 13)],
                "expenses_this_month": self.repository.expenses_this_month(),
                "top_defaulters": self.repository.top_fee_defaulters(limit=5),
            })

        self._cache[cache_key] = (time.monotonic(), data)
        return data
