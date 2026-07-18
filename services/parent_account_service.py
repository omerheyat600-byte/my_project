"""
Parent account management service — the admin-facing counterpart to
ParentAuthService. Handles create/link/reset-password/activate/deactivate,
distinct from login/session logic.
"""
import secrets
import pymysql

from models.parent_account import ParentAccount
from repositories.parent_account_repository import ParentAccountRepository
from repositories.student_repository import StudentRepository
from utils.logger import get_logger

logger = get_logger(__name__)


class ParentAccountValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("; ".join(errors))


class StudentNotFoundError(Exception):
    pass


class UsernameTakenError(Exception):
    pass


class ParentAccountService:

    def __init__(self, repository: ParentAccountRepository, student_repository: StudentRepository = None):
        self.repository = repository
        self.student_repository = student_repository or StudentRepository()

    def list_accounts(self):
        return self.repository.find_all()

    def create_account(self, data):
        errors = []
        if not data.get('student_id'):
            errors.append("student_id is required")
        if not data.get('username'):
            errors.append("username is required")
        if errors:
            raise ParentAccountValidationError(errors)

        student = self.student_repository.find_by_id(data['student_id'])
        if not student:
            raise StudentNotFoundError(f"No student found with id {data['student_id']}")

        # Auto-generate a password if the admin didn't set one, so it can
        # be handed to the parent directly (shown once in the response).
        password = data.get('password') or secrets.token_urlsafe(6)

        account = ParentAccount.from_dict({
            "username": data['username'],
            "student_id": data['student_id'],
            "full_name": data.get('full_name') or student.parent_name,
            "phone": data.get('phone') or student.parent_phone,
        })

        try:
            new_id = self.repository.create(account, password)
        except pymysql.err.IntegrityError:
            raise UsernameTakenError("Username already exists")

        logger.info(f"Parent account created: {new_id} ({account.username}) for student {account.student_id}")
        return {"id": new_id, "username": account.username, "temporary_password": password}

    def reset_password(self, pid):
        """Generate and set a new random password, returning it once so
        the admin can relay it to the parent."""
        new_password = secrets.token_urlsafe(6)
        self.repository.reset_password(pid, new_password)
        logger.info(f"Parent account password reset: {pid}")
        return new_password

    def set_active(self, pid, is_active):
        self.repository.set_active(pid, is_active)
        logger.info(f"Parent account {'activated' if is_active else 'deactivated'}: {pid}")

    def delete_account(self, pid):
        self.repository.delete(pid)
        logger.info(f"Parent account deleted: {pid}")
