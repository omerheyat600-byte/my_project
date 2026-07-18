"""
Library service — business logic layer sitting between the library
routes and the library repository.

Rules encoded here (not in the repository, not in routes):
  - A book can't be issued if it has zero available copies.
  - A student can't hold two active issues of the *same* book at once.
  - Returning a book automatically calculates a late fine (days late x
    per-day rate from Settings), and — if someone is waiting for that
    exact book — flips the front of the reservation queue to "Ready"
    so staff know to hand it to that student next (deliberately NOT
    auto-issued to them; a human still confirms the handover).
  - Losing a book charges a fixed replacement fine and permanently
    removes that copy from circulation (total_copies-- as well as
    available_copies), since it's never coming back.
"""
from datetime import date, datetime, timedelta

from models.library import Book, LibraryIssue, LibraryReservation, BOOK_CATEGORIES
from repositories.library_repository import LibraryRepository
from repositories.settings_repository import SettingsRepository
from utils.validators import validate_library_book_payload, validate_library_issue_payload
from utils.logger import get_logger

logger = get_logger(__name__)

DEFAULT_LOAN_DAYS = 14
DEFAULT_FINE_PER_DAY = 10          # PKR per day late
DEFAULT_LOST_BOOK_FINE = 500       # PKR flat replacement charge


class LibraryValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("; ".join(errors))


class BookNotFoundError(Exception):
    pass


class IssueNotFoundError(Exception):
    pass


class ReservationNotFoundError(Exception):
    pass


class NoCopiesAvailableError(Exception):
    pass


class DuplicateIssueError(Exception):
    pass


class LibraryService:

    def __init__(self, repository: LibraryRepository = None, settings_repository: SettingsRepository = None):
        self.repository = repository or LibraryRepository()
        self.settings_repository = settings_repository or SettingsRepository()

    # ---------------------------------------------------------------
    # Settings (fine rate / loan period — editable from Settings page)
    # ---------------------------------------------------------------

    def get_fine_per_day(self):
        try:
            return float(self.settings_repository.get_setting('library_fine_per_day', str(DEFAULT_FINE_PER_DAY)))
        except (TypeError, ValueError):
            return DEFAULT_FINE_PER_DAY

    def get_loan_days(self):
        try:
            return int(self.settings_repository.get_setting('library_loan_days', str(DEFAULT_LOAN_DAYS)))
        except (TypeError, ValueError):
            return DEFAULT_LOAN_DAYS

    def get_lost_book_fine(self):
        try:
            return float(self.settings_repository.get_setting('library_lost_book_fine', str(DEFAULT_LOST_BOOK_FINE)))
        except (TypeError, ValueError):
            return DEFAULT_LOST_BOOK_FINE

    # ---------------------------------------------------------------
    # Catalog
    # ---------------------------------------------------------------

    def list_books(self, query="", category=""):
        books = self.repository.find_all_books(query, category)
        return {"books": books, "count": len(books), "categories": BOOK_CATEGORIES}

    def get_book(self, book_id):
        book = self.repository.find_book_by_id(book_id)
        if not book:
            raise BookNotFoundError("Book not found")
        return book

    def create_book(self, data):
        errors = validate_library_book_payload(data)
        if errors:
            logger.warning(f"Library book validation failed: {errors} | payload={data}")
            raise LibraryValidationError(errors)
        book = Book.from_dict(data)
        new_id = self.repository.create_book(book)
        logger.info(f"Library book added: {new_id} ({book.title})")
        return new_id

    def update_book(self, book_id, data):
        errors = validate_library_book_payload(data)
        if errors:
            raise LibraryValidationError(errors)

        existing = self.repository.find_book_by_id(book_id)
        if not existing:
            raise BookNotFoundError("Book not found")

        # Preserve currently-issued-out copies when total_copies changes:
        # available = new_total - (old_total - old_available)
        old_total = existing["total_copies"]
        old_available = existing["available_copies"]
        issued_out = old_total - old_available
        new_total = int(data.get('total_copies', old_total) or old_total)
        new_available = max(0, new_total - issued_out)

        book = Book.from_dict(data, id=book_id, available_copies=new_available)
        book.total_copies = new_total
        self.repository.update_book(book_id, book)
        logger.info(f"Library book updated: {book_id}")

    def delete_book(self, book_id):
        if not self.repository.find_book_by_id(book_id):
            raise BookNotFoundError("Book not found")
        if self.repository.has_active_issues(book_id):
            raise LibraryValidationError(["Cannot delete a book that currently has copies issued out"])
        self.repository.delete_book(book_id)
        logger.info(f"Library book deleted: {book_id}")

    # ---------------------------------------------------------------
    # Issue / Return
    # ---------------------------------------------------------------

    def list_issues(self, status="", student_id="", book_id="", overdue_only=False):
        today = date.today().isoformat()
        issues = self.repository.find_all_issues(status, student_id, book_id, overdue_only, today)
        return {"issues": issues, "count": len(issues)}

    def issue_book(self, data):
        errors = validate_library_issue_payload(data)
        if errors:
            raise LibraryValidationError(errors)

        book_id = int(data["book_id"])
        student_id = data["student_id"]

        book = self.repository.find_book_by_id(book_id)
        if not book:
            raise BookNotFoundError("Book not found")

        if book["available_copies"] <= 0:
            raise NoCopiesAvailableError(
                "No copies available. You can add this student to the reservation queue instead."
            )

        if self.repository.find_active_issue_for_student_book(student_id, book_id):
            raise DuplicateIssueError("This student already has an active copy of this book issued")

        issue_date = data.get("issue_date") or date.today().isoformat()
        loan_days = int(data.get("loan_days") or self.get_loan_days())
        due_date = data.get("due_date") or (
            datetime.fromisoformat(issue_date) + timedelta(days=loan_days)
        ).date().isoformat()

        issue = LibraryIssue(
            id=None,
            book_id=book_id,
            student_id=student_id,
            student_name=data.get("student_name"),
            issue_date=issue_date,
            due_date=due_date,
            status="Issued",
            fine_amount=0,
            fine_paid=False,
            remarks=data.get("remarks"),
            issued_by=data.get("issued_by"),
        )
        new_id = self.repository.create_issue(issue)
        logger.info(f"Book {book_id} issued to {student_id} (issue #{new_id}, due {due_date})")
        return new_id

    def calculate_fine(self, due_date_str, return_date_str, fine_per_day=None):
        """Days late x per-day rate. 0 if returned on/before the due date."""
        fine_per_day = self.get_fine_per_day() if fine_per_day is None else fine_per_day
        due = date.fromisoformat(due_date_str)
        returned = date.fromisoformat(return_date_str)
        days_late = (returned - due).days
        if days_late <= 0:
            return 0.0
        return round(days_late * fine_per_day, 2)

    def return_book(self, issue_id, return_date=None):
        issue = self.repository.find_issue_by_id(issue_id)
        if not issue:
            raise IssueNotFoundError("Issue record not found")
        if issue["status"] != "Issued":
            raise LibraryValidationError([f"This copy is already marked '{issue['status']}'"])

        return_date = return_date or date.today().isoformat()
        fine = self.calculate_fine(issue["due_date"], return_date)

        self.repository.mark_returned(issue_id, return_date, fine, issue["book_id"])
        logger.info(f"Book returned: issue #{issue_id}, fine={fine}")

        # If someone is waiting for this exact book, flip the front of the
        # queue to "Ready" so staff know to hand it over next. We deliberately
        # do NOT auto-issue it — a human confirms the handover.
        next_in_line = self.repository.find_next_waiting_reservation(issue["book_id"])
        if next_in_line:
            self.repository.update_reservation_status(
                next_in_line["id"], "Ready", notified_at=datetime.now().isoformat()
            )
            logger.info(f"Reservation #{next_in_line['id']} for book {issue['book_id']} is now Ready")

        return {"fine_amount": fine, "reservation_ready": bool(next_in_line)}

    def mark_lost(self, issue_id):
        issue = self.repository.find_issue_by_id(issue_id)
        if not issue:
            raise IssueNotFoundError("Issue record not found")
        if issue["status"] != "Issued":
            raise LibraryValidationError([f"This copy is already marked '{issue['status']}'"])

        fine = self.get_lost_book_fine()
        self.repository.mark_lost(issue_id, fine)

        # The copy is gone for good — remove it from the catalog's total,
        # not just from "available" (it was already subtracted from
        # available_copies when issued, so only total_copies needs to drop).
        book = self.repository.find_book_by_id(issue["book_id"])
        if book:
            book_obj = Book.from_dict(book, id=book["id"], available_copies=book["available_copies"])
            book_obj.total_copies = max(0, book["total_copies"] - 1)
            self.repository.update_book(book["id"], book_obj)

        logger.info(f"Book marked lost: issue #{issue_id}, fine={fine}")
        return fine

    def pay_fine(self, issue_id):
        issue = self.repository.find_issue_by_id(issue_id)
        if not issue:
            raise IssueNotFoundError("Issue record not found")
        if not issue["fine_amount"]:
            raise LibraryValidationError(["This issue has no fine to pay"])
        self.repository.mark_fine_paid(issue_id)
        logger.info(f"Fine paid: issue #{issue_id}")

    def list_pending_fines(self, student_id=""):
        fines = self.repository.find_pending_fines(student_id)
        total = sum(f["fine_amount"] for f in fines)
        return {"fines": fines, "total_pending": total, "count": len(fines)}

    # ---------------------------------------------------------------
    # Reservations
    # ---------------------------------------------------------------

    def list_reservations(self, book_id="", student_id="", status=""):
        reservations = self.repository.find_reservations(book_id, student_id, status)
        return {"reservations": reservations, "count": len(reservations)}

    def reserve_book(self, data):
        book_id = data.get("book_id")
        student_id = data.get("student_id")
        errors = []
        if not book_id:
            errors.append("book_id is required")
        if not student_id:
            errors.append("student_id is required")
        if errors:
            raise LibraryValidationError(errors)

        book_id = int(book_id)
        book = self.repository.find_book_by_id(book_id)
        if not book:
            raise BookNotFoundError("Book not found")

        queue_pos = self.repository.find_next_queue_position(book_id)
        reservation = LibraryReservation(
            id=None,
            book_id=book_id,
            student_id=student_id,
            student_name=data.get("student_name"),
            status="Waiting",
            queue_position=queue_pos,
        )
        new_id = self.repository.create_reservation(reservation)
        logger.info(f"Reservation created: book {book_id}, student {student_id}, position {queue_pos}")
        return new_id

    def cancel_reservation(self, reservation_id):
        reservation = self.repository.find_reservation_by_id(reservation_id)
        if not reservation:
            raise ReservationNotFoundError("Reservation not found")
        self.repository.update_reservation_status(reservation_id, "Cancelled")
        logger.info(f"Reservation cancelled: #{reservation_id}")

    def fulfill_reservation(self, reservation_id):
        """Staff confirms the waiting student has picked up the book that
        was held for them ('Ready' -> 'Fulfilled') and it's now issued to them."""
        reservation = self.repository.find_reservation_by_id(reservation_id)
        if not reservation:
            raise ReservationNotFoundError("Reservation not found")
        if reservation["status"] != "Ready":
            raise LibraryValidationError(["Only a 'Ready' reservation can be fulfilled"])

        new_issue_id = self.issue_book({
            "book_id": reservation["book_id"],
            "student_id": reservation["student_id"],
            "student_name": reservation["student_name"],
        })
        self.repository.update_reservation_status(reservation_id, "Fulfilled")
        logger.info(f"Reservation #{reservation_id} fulfilled as issue #{new_issue_id}")
        return new_issue_id

    # ---------------------------------------------------------------
    # Dashboard
    # ---------------------------------------------------------------

    def get_dashboard(self):
        return self.repository.get_stats(date.today().isoformat())
