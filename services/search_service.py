"""
Search service — lightweight global search across the most commonly
looked-up entities. Reuses each module's own repository so the search
stays consistent with how that module already filters/looks up records.

Originally only covered Students, Teachers, Classes, and Fees — expanded
to also cover Results, Expenses, Users, Notifications, and Library
(books) so the search bar is actually useful across the whole app.
"""
from repositories.student_repository import StudentRepository
from repositories.teacher_repository import TeacherRepository
from repositories.class_repository import ClassRepository
from repositories.fee_repository import FeeRepository
from repositories.result_repository import ResultRepository
from repositories.expense_repository import ExpenseRepository
from repositories.user_repository import UserRepository
from repositories.notification_repository import NotificationRepository
from repositories.library_repository import LibraryRepository

RESULTS_PER_CATEGORY = 5


class SearchService:

    def __init__(self, student_repo=None, teacher_repo=None, class_repo=None, fee_repo=None,
                 result_repo=None, expense_repo=None, user_repo=None,
                 notification_repo=None, library_repo=None):
        self.student_repo = student_repo or StudentRepository()
        self.teacher_repo = teacher_repo or TeacherRepository()
        self.class_repo = class_repo or ClassRepository()
        self.fee_repo = fee_repo or FeeRepository()
        self.result_repo = result_repo or ResultRepository()
        self.expense_repo = expense_repo or ExpenseRepository()
        self.user_repo = user_repo or UserRepository()
        self.notification_repo = notification_repo or NotificationRepository()
        self.library_repo = library_repo or LibraryRepository()

    def _as_dict(self, item):
        return item if isinstance(item, dict) else item.to_dict()

    def search(self, query):
        query = (query or "").strip()
        if len(query) < 2:
            return []

        results = []

        try:
            for s in self.student_repo.find_all(query=query)[:RESULTS_PER_CATEGORY]:
                s = self._as_dict(s)
                results.append({
                    "type": "Student",
                    "id": s.get("id"),
                    "name": s.get("name"),
                    "subtitle": s.get("grade", ""),
                    "page": "students",
                })
        except Exception:
            pass

        try:
            for t in self.teacher_repo.find_all(query=query)[:RESULTS_PER_CATEGORY]:
                t = self._as_dict(t)
                results.append({
                    "type": "Teacher",
                    "id": t.get("id"),
                    "name": t.get("name"),
                    "subtitle": t.get("subject", ""),
                    "page": "teachers",
                })
        except Exception:
            pass

        try:
            for c in self.class_repo.find_all(query=query)[:RESULTS_PER_CATEGORY]:
                c = self._as_dict(c)
                results.append({
                    "type": "Class",
                    "id": c.get("id"),
                    "name": c.get("class_name"),
                    "subtitle": f"Grade {c.get('grade_level', '')}",
                    "page": "classes",
                })
        except Exception:
            pass

        try:
            for f in self.fee_repo.find_all(query=query)[:RESULTS_PER_CATEGORY]:
                f = self._as_dict(f)
                results.append({
                    "type": "Fee",
                    "id": f.get("id"),
                    "name": f.get("student_name"),
                    "subtitle": f"{f.get('fee_type', '')} — {f.get('status', '')}",
                    "page": "fees",
                })
        except Exception:
            pass

        try:
            for r in self.result_repo.find_all_filtered(query=query)[:RESULTS_PER_CATEGORY]:
                r = self._as_dict(r)
                results.append({
                    "type": "Result",
                    "id": r.get("id"),
                    "name": r.get("student_name"),
                    "subtitle": f"{r.get('subject', '')} — {r.get('term', '')} {r.get('year', '')}",
                    "page": "results",
                })
        except Exception:
            pass

        try:
            for e in self.expense_repo.find_all(query=query)[:RESULTS_PER_CATEGORY]:
                e = self._as_dict(e)
                results.append({
                    "type": "Expense",
                    "id": e.get("id"),
                    "name": e.get("category"),
                    "subtitle": f"{e.get('description', '') or ''} — PKR {e.get('amount', 0)}",
                    "page": "expenses",
                })
        except Exception:
            pass

        try:
            q_lower = query.lower()
            matched_users = [
                u for u in self.user_repo.find_all()
                if q_lower in (u.get("full_name") or "").lower()
                or q_lower in (u.get("username") or "").lower()
            ][:RESULTS_PER_CATEGORY]
            for u in matched_users:
                results.append({
                    "type": "User",
                    "id": u.get("id"),
                    "name": u.get("full_name"),
                    "subtitle": f"@{u.get('username', '')} — {u.get('role', '')}",
                    "page": "users",
                })
        except Exception:
            pass

        try:
            for n in self.notification_repo.find_all(q=query, limit=RESULTS_PER_CATEGORY):
                n = self._as_dict(n)
                results.append({
                    "type": "Notification",
                    "id": n.get("id"),
                    "name": n.get("student_id"),
                    "subtitle": (n.get("message") or "")[:60],
                    "page": "notifications",
                })
        except Exception:
            pass

        try:
            for b in self.library_repo.find_all_books(query=query)[:RESULTS_PER_CATEGORY]:
                results.append({
                    "type": "Book",
                    "id": b.get("id"),
                    "name": b.get("title"),
                    "subtitle": f"{b.get('author', '') or ''} — {b.get('available_copies', 0)}/{b.get('total_copies', 0)} available",
                    "page": "library",
                })
        except Exception:
            pass

        return results


search_service = SearchService()
