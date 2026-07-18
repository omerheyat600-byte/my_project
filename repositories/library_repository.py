"""
Library repository — the only layer allowed to talk directly to SQLite
for library_books, library_issues, and library_reservations.
"""
from database import transaction
from models.library import Book, LibraryIssue, LibraryReservation
from repositories.base_repository import BaseRepository


class LibraryRepository(BaseRepository):
    table = "library_books"
    id_column = "id"

    # ---------------------------------------------------------------
    # Books (catalog)
    # ---------------------------------------------------------------

    def find_all_books(self, query="", category=""):
        sql = "SELECT * FROM library_books WHERE 1=1"
        params = []
        if query:
            sql += " AND (title LIKE ? OR author LIKE ? OR isbn LIKE ?)"
            params.extend([f"%{query}%", f"%{query}%", f"%{query}%"])
        if category:
            sql += " AND category=?"
            params.append(category)
        sql += " ORDER BY title"
        rows = self._fetchall(sql, params)
        return [dict(r) for r in rows]

    def find_book_by_id(self, book_id):
        row = self._fetchone("SELECT * FROM library_books WHERE id=?", (book_id,))
        return dict(row) if row else None

    def create_book(self, book: Book):
        with transaction() as db:
            cursor = db.execute("""
                INSERT INTO library_books(
                    title, author, isbn, category, publisher,
                    total_copies, available_copies, shelf_location
                ) VALUES (?,?,?,?,?,?,?,?)
            """, (
                book.title, book.author, book.isbn, book.category, book.publisher,
                book.total_copies, book.available_copies, book.shelf_location,
            ))
            new_id = cursor.lastrowid
        return new_id

    def update_book(self, book_id, book: Book):
        with transaction() as db:
            db.execute("""
                UPDATE library_books SET
                    title=?, author=?, isbn=?, category=?, publisher=?,
                    total_copies=?, available_copies=?, shelf_location=?
                WHERE id=?
            """, (
                book.title, book.author, book.isbn, book.category, book.publisher,
                book.total_copies, book.available_copies, book.shelf_location,
                book_id,
            ))

    def delete_book(self, book_id):
        with transaction() as db:
            db.execute("DELETE FROM library_books WHERE id=?", (book_id,))

    def has_active_issues(self, book_id):
        row = self._fetchone(
            "SELECT 1 FROM library_issues WHERE book_id=? AND status='Issued'",
            (book_id,)
        )
        return row is not None

    def adjust_available_copies(self, book_id, delta):
        """Increment/decrement available_copies by delta (can be negative)."""
        with transaction() as db:
            db.execute(
                "UPDATE library_books SET available_copies = available_copies + ? WHERE id=?",
                (delta, book_id)
            )

    # ---------------------------------------------------------------
    # Issues (issue / return / fines)
    # ---------------------------------------------------------------

    def find_all_issues(self, status="", student_id="", book_id="", overdue_only=False, today=None):
        sql = """
            SELECT li.*, b.title as book_title, b.author as book_author
            FROM library_issues li
            LEFT JOIN library_books b ON li.book_id = b.id
            WHERE 1=1
        """
        params = []
        if status:
            sql += " AND li.status=?"
            params.append(status)
        if student_id:
            sql += " AND li.student_id=?"
            params.append(student_id)
        if book_id:
            sql += " AND li.book_id=?"
            params.append(book_id)
        if overdue_only and today:
            sql += " AND li.status='Issued' AND li.due_date < ?"
            params.append(today)
        sql += " ORDER BY li.issue_date DESC, li.id DESC"
        rows = self._fetchall(sql, params)
        return [dict(r) for r in rows]

    def find_issue_by_id(self, issue_id):
        row = self._fetchone("""
            SELECT li.*, b.title as book_title, b.author as book_author
            FROM library_issues li
            LEFT JOIN library_books b ON li.book_id = b.id
            WHERE li.id=?
        """, (issue_id,))
        return dict(row) if row else None

    def find_active_issue_for_student_book(self, student_id, book_id):
        row = self._fetchone(
            "SELECT * FROM library_issues WHERE student_id=? AND book_id=? AND status='Issued'",
            (student_id, book_id)
        )
        return dict(row) if row else None

    def create_issue(self, issue: LibraryIssue):
        with transaction() as db:
            cursor = db.execute("""
                INSERT INTO library_issues(
                    book_id, student_id, student_name, issue_date, due_date,
                    status, fine_amount, fine_paid, remarks, issued_by
                ) VALUES (?,?,?,?,?,?,?,?,?,?)
            """, (
                issue.book_id, issue.student_id, issue.student_name,
                issue.issue_date, issue.due_date, issue.status,
                issue.fine_amount, int(issue.fine_paid), issue.remarks, issue.issued_by,
            ))
            db.execute(
                "UPDATE library_books SET available_copies = available_copies - 1 WHERE id=?",
                (issue.book_id,)
            )
            new_id = cursor.lastrowid
        return new_id

    def mark_returned(self, issue_id, return_date, fine_amount, book_id):
        with transaction() as db:
            db.execute("""
                UPDATE library_issues
                SET status='Returned', return_date=?, fine_amount=?
                WHERE id=?
            """, (return_date, fine_amount, issue_id))
            db.execute(
                "UPDATE library_books SET available_copies = available_copies + 1 WHERE id=?",
                (book_id,)
            )

    def mark_lost(self, issue_id, fine_amount):
        with transaction() as db:
            db.execute("""
                UPDATE library_issues SET status='Lost', fine_amount=? WHERE id=?
            """, (fine_amount, issue_id))

    def mark_fine_paid(self, issue_id):
        with transaction() as db:
            db.execute("UPDATE library_issues SET fine_paid=1 WHERE id=?", (issue_id,))

    def find_pending_fines(self, student_id=""):
        sql = "SELECT li.*, b.title as book_title FROM library_issues li LEFT JOIN library_books b ON li.book_id=b.id WHERE li.fine_amount > 0 AND li.fine_paid = 0"
        params = []
        if student_id:
            sql += " AND li.student_id=?"
            params.append(student_id)
        sql += " ORDER BY li.issue_date DESC"
        rows = self._fetchall(sql, params)
        return [dict(r) for r in rows]

    # ---------------------------------------------------------------
    # Reservations (waiting queue)
    # ---------------------------------------------------------------

    def find_reservations(self, book_id="", student_id="", status=""):
        sql = """
            SELECT lr.*, b.title as book_title
            FROM library_reservations lr
            LEFT JOIN library_books b ON lr.book_id = b.id
            WHERE 1=1
        """
        params = []
        if book_id:
            sql += " AND lr.book_id=?"
            params.append(book_id)
        if student_id:
            sql += " AND lr.student_id=?"
            params.append(student_id)
        if status:
            sql += " AND lr.status=?"
            params.append(status)
        sql += " ORDER BY lr.queue_position ASC, lr.reserved_date ASC"
        rows = self._fetchall(sql, params)
        return [dict(r) for r in rows]

    def find_next_queue_position(self, book_id):
        row = self._fetchone(
            "SELECT COALESCE(MAX(queue_position), 0) + 1 as next_pos FROM library_reservations "
            "WHERE book_id=? AND status IN ('Waiting','Ready')",
            (book_id,)
        )
        return row["next_pos"] if row else 1

    def create_reservation(self, reservation: LibraryReservation):
        with transaction() as db:
            cursor = db.execute("""
                INSERT INTO library_reservations(
                    book_id, student_id, student_name, status, queue_position
                ) VALUES (?,?,?,?,?)
            """, (
                reservation.book_id, reservation.student_id, reservation.student_name,
                reservation.status, reservation.queue_position,
            ))
            new_id = cursor.lastrowid
        return new_id

    def find_reservation_by_id(self, reservation_id):
        row = self._fetchone("SELECT * FROM library_reservations WHERE id=?", (reservation_id,))
        return dict(row) if row else None

    def find_next_waiting_reservation(self, book_id):
        row = self._fetchone(
            "SELECT * FROM library_reservations WHERE book_id=? AND status='Waiting' "
            "ORDER BY queue_position ASC LIMIT 1",
            (book_id,)
        )
        return dict(row) if row else None

    def update_reservation_status(self, reservation_id, status, notified_at=None):
        with transaction() as db:
            if notified_at is not None:
                db.execute(
                    "UPDATE library_reservations SET status=?, notified_at=? WHERE id=?",
                    (status, notified_at, reservation_id)
                )
            else:
                db.execute(
                    "UPDATE library_reservations SET status=? WHERE id=?",
                    (status, reservation_id)
                )

    # ---------------------------------------------------------------
    # Dashboard stats
    # ---------------------------------------------------------------

    def get_stats(self, today):
        total_books = self._fetchone("SELECT COUNT(*) c FROM library_books")["c"]
        total_copies = self._fetchone("SELECT COALESCE(SUM(total_copies),0) c FROM library_books")["c"]
        available_copies = self._fetchone("SELECT COALESCE(SUM(available_copies),0) c FROM library_books")["c"]
        issued_count = self._fetchone("SELECT COUNT(*) c FROM library_issues WHERE status='Issued'")["c"]
        overdue_count = self._fetchone(
            "SELECT COUNT(*) c FROM library_issues WHERE status='Issued' AND due_date < ?", (today,)
        )["c"]
        pending_fines = self._fetchone(
            "SELECT COALESCE(SUM(fine_amount),0) c FROM library_issues WHERE fine_amount > 0 AND fine_paid = 0"
        )["c"]
        active_reservations = self._fetchone(
            "SELECT COUNT(*) c FROM library_reservations WHERE status IN ('Waiting','Ready')"
        )["c"]
        return {
            "total_books": total_books,
            "total_copies": total_copies,
            "available_copies": available_copies,
            "issued_count": issued_count,
            "overdue_count": overdue_count,
            "pending_fines": pending_fines,
            "active_reservations": active_reservations,
        }
