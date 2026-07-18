"""
Library routes (Blueprint). Thin HTTP layer — all logic lives in
services/library_service.py.
"""
from flask import Blueprint, request

from repositories.library_repository import LibraryRepository
from repositories.settings_repository import SettingsRepository
from services.library_service import (
    LibraryService,
    LibraryValidationError,
    BookNotFoundError,
    IssueNotFoundError,
    ReservationNotFoundError,
    NoCopiesAvailableError,
    DuplicateIssueError,
)
from utils.auth import require_role
from utils.response import success_response, error_response

library_bp = Blueprint('library', __name__)

library_repository = LibraryRepository()
settings_repository = SettingsRepository()
library_service = LibraryService(library_repository, settings_repository)


# ---------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------

@library_bp.route('/api/library/dashboard', methods=['GET'])
@require_role('viewer')
def api_library_dashboard():
    return success_response(library_service.get_dashboard())


# ---------------------------------------------------------------
# Books (catalog)
# ---------------------------------------------------------------

@library_bp.route('/api/library/books', methods=['GET'])
@require_role('viewer')
def api_get_books():
    q = request.args.get('q', '').strip()
    category = request.args.get('category', '').strip()
    return success_response(library_service.list_books(q, category))


@library_bp.route('/api/library/books/<int:book_id>', methods=['GET'])
@require_role('viewer')
def api_get_book(book_id):
    try:
        return success_response(library_service.get_book(book_id))
    except BookNotFoundError as e:
        return error_response(str(e), status=404)


@library_bp.route('/api/library/books', methods=['POST'])
@require_role('teacher')
def api_create_book():
    data = request.json or {}
    try:
        new_id = library_service.create_book(data)
        return success_response({"id": new_id}, message="Book added successfully", status=201)
    except LibraryValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except Exception as e:
        return error_response(str(e), status=500)


@library_bp.route('/api/library/books/<int:book_id>', methods=['PUT'])
@require_role('teacher')
def api_update_book(book_id):
    data = request.json or {}
    try:
        library_service.update_book(book_id, data)
        return success_response(message="Book updated successfully")
    except LibraryValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except BookNotFoundError as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)


@library_bp.route('/api/library/books/<int:book_id>', methods=['DELETE'])
@require_role('teacher')
def api_delete_book(book_id):
    try:
        library_service.delete_book(book_id)
        return success_response(message="Book deleted successfully")
    except LibraryValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except BookNotFoundError as e:
        return error_response(str(e), status=404)


# ---------------------------------------------------------------
# Issue / Return
# ---------------------------------------------------------------

@library_bp.route('/api/library/issues', methods=['GET'])
@require_role('viewer')
def api_get_issues():
    status = request.args.get('status', '').strip()
    student_id = request.args.get('student_id', '').strip()
    book_id = request.args.get('book_id', '').strip()
    overdue_only = request.args.get('overdue', '').lower() == 'true'
    return success_response(library_service.list_issues(status, student_id, book_id, overdue_only))


@library_bp.route('/api/library/issue', methods=['POST'])
@require_role('teacher')
def api_issue_book():
    data = request.json or {}
    try:
        new_id = library_service.issue_book(data)
        return success_response({"id": new_id}, message="Book issued successfully", status=201)
    except LibraryValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except BookNotFoundError as e:
        return error_response(str(e), status=404)
    except NoCopiesAvailableError as e:
        return error_response(str(e), status=409)
    except DuplicateIssueError as e:
        return error_response(str(e), status=409)
    except Exception as e:
        return error_response(str(e), status=500)


@library_bp.route('/api/library/return/<int:issue_id>', methods=['POST'])
@require_role('teacher')
def api_return_book(issue_id):
    data = request.json or {}
    try:
        result = library_service.return_book(issue_id, data.get('return_date'))
        msg = "Book returned successfully"
        if result["fine_amount"]:
            msg += f" — fine of PKR {result['fine_amount']} applies"
        if result["reservation_ready"]:
            msg += ". Next student in the reservation queue is now ready to collect it."
        return success_response(result, message=msg)
    except LibraryValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except IssueNotFoundError as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)


@library_bp.route('/api/library/issues/<int:issue_id>/lost', methods=['POST'])
@require_role('teacher')
def api_mark_lost(issue_id):
    try:
        fine = library_service.mark_lost(issue_id)
        return success_response({"fine_amount": fine}, message=f"Marked as lost — fine of PKR {fine} applies")
    except LibraryValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except IssueNotFoundError as e:
        return error_response(str(e), status=404)


# ---------------------------------------------------------------
# Fines
# ---------------------------------------------------------------

@library_bp.route('/api/library/fines', methods=['GET'])
@require_role('viewer')
def api_get_fines():
    student_id = request.args.get('student_id', '').strip()
    return success_response(library_service.list_pending_fines(student_id))


@library_bp.route('/api/library/fines/<int:issue_id>/pay', methods=['POST'])
@require_role('accountant')
def api_pay_fine(issue_id):
    try:
        library_service.pay_fine(issue_id)
        return success_response(message="Fine marked as paid")
    except LibraryValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except IssueNotFoundError as e:
        return error_response(str(e), status=404)


# ---------------------------------------------------------------
# Reservations
# ---------------------------------------------------------------

@library_bp.route('/api/library/reservations', methods=['GET'])
@require_role('viewer')
def api_get_reservations():
    book_id = request.args.get('book_id', '').strip()
    student_id = request.args.get('student_id', '').strip()
    status = request.args.get('status', '').strip()
    return success_response(library_service.list_reservations(book_id, student_id, status))


@library_bp.route('/api/library/reservations', methods=['POST'])
@require_role('teacher')
def api_create_reservation():
    data = request.json or {}
    try:
        new_id = library_service.reserve_book(data)
        return success_response({"id": new_id}, message="Reservation created successfully", status=201)
    except LibraryValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except BookNotFoundError as e:
        return error_response(str(e), status=404)


@library_bp.route('/api/library/reservations/<int:reservation_id>/cancel', methods=['POST'])
@require_role('teacher')
def api_cancel_reservation(reservation_id):
    try:
        library_service.cancel_reservation(reservation_id)
        return success_response(message="Reservation cancelled")
    except ReservationNotFoundError as e:
        return error_response(str(e), status=404)


@library_bp.route('/api/library/reservations/<int:reservation_id>/fulfill', methods=['POST'])
@require_role('teacher')
def api_fulfill_reservation(reservation_id):
    try:
        new_issue_id = library_service.fulfill_reservation(reservation_id)
        return success_response({"issue_id": new_issue_id}, message="Reservation fulfilled — book issued")
    except LibraryValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except ReservationNotFoundError as e:
        return error_response(str(e), status=404)
    except (BookNotFoundError, NoCopiesAvailableError, DuplicateIssueError) as e:
        return error_response(str(e), status=409)
