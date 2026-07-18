"""
Library data models: Book (catalog), LibraryIssue (issue/return + fine),
LibraryReservation (waiting queue for a fully-issued book).
"""
from dataclasses import dataclass
from typing import Optional

BOOK_CATEGORIES = [
    'Fiction', 'Non-Fiction', 'Science', 'Mathematics', 'History',
    'Biography', 'Reference', 'Textbook', 'Islamiat', 'Urdu Literature',
    'Children', 'Other'
]

ISSUE_STATUSES = ['Issued', 'Returned', 'Lost']
RESERVATION_STATUSES = ['Waiting', 'Ready', 'Fulfilled', 'Cancelled', 'Expired']


@dataclass
class Book:
    id: Optional[int]
    title: str
    author: Optional[str]
    isbn: Optional[str]
    category: Optional[str]
    publisher: Optional[str]
    total_copies: int
    available_copies: int
    shelf_location: Optional[str]
    added_date: Optional[str] = None

    @classmethod
    def from_dict(cls, data, id=None, available_copies=None):
        total = int(data.get('total_copies', 1) or 1)
        return cls(
            id=id,
            title=data.get('title'),
            author=data.get('author'),
            isbn=data.get('isbn'),
            category=data.get('category'),
            publisher=data.get('publisher'),
            total_copies=total,
            available_copies=total if available_copies is None else available_copies,
            shelf_location=data.get('shelf_location'),
        )

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "author": self.author,
            "isbn": self.isbn,
            "category": self.category,
            "publisher": self.publisher,
            "total_copies": self.total_copies,
            "available_copies": self.available_copies,
            "shelf_location": self.shelf_location,
            "added_date": self.added_date,
        }


@dataclass
class LibraryIssue:
    id: Optional[int]
    book_id: int
    student_id: str
    student_name: Optional[str]
    issue_date: str
    due_date: str
    return_date: Optional[str] = None
    status: str = 'Issued'
    fine_amount: float = 0
    fine_paid: bool = False
    remarks: Optional[str] = None
    issued_by: Optional[str] = None

    def to_dict(self):
        return {
            "id": self.id,
            "book_id": self.book_id,
            "student_id": self.student_id,
            "student_name": self.student_name,
            "issue_date": self.issue_date,
            "due_date": self.due_date,
            "return_date": self.return_date,
            "status": self.status,
            "fine_amount": self.fine_amount,
            "fine_paid": bool(self.fine_paid),
            "remarks": self.remarks,
            "issued_by": self.issued_by,
        }


@dataclass
class LibraryReservation:
    id: Optional[int]
    book_id: int
    student_id: str
    student_name: Optional[str]
    status: str = 'Waiting'
    queue_position: int = 1
    reserved_date: Optional[str] = None
    notified_at: Optional[str] = None

    def to_dict(self):
        return {
            "id": self.id,
            "book_id": self.book_id,
            "student_id": self.student_id,
            "student_name": self.student_name,
            "status": self.status,
            "queue_position": self.queue_position,
            "reserved_date": self.reserved_date,
            "notified_at": self.notified_at,
        }
