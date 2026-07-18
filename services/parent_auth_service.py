"""
Parent auth service — login/session logic for the Parent Portal.

Deliberately separate from AuthService/UserRepository: parent accounts
are a completely different table with no role/permission concept — a
parent can only ever see the one student they're linked to.
"""
from repositories.parent_account_repository import ParentAccountRepository
from utils.logger import get_logger
from utils.security import verify_password, is_bcrypt_hash

logger = get_logger(__name__)


class ParentAuthError(Exception):
    """Raised for any parent login failure. `status` lets the route pick the HTTP code."""
    def __init__(self, message, status=401):
        self.status = status
        super().__init__(message)


class ParentAuthService:

    def __init__(self, repository: ParentAccountRepository):
        self.repository = repository

    def login(self, username, password):
        """Validate credentials and return {id, username, student_id, full_name}, or raise ParentAuthError."""
        if not username or not password:
            raise ParentAuthError("Missing username or password", status=400)

        account = self.repository.find_by_username(username)
        if not account:
            raise ParentAuthError("Invalid credentials", status=401)

        if not account['is_active']:
            raise ParentAuthError("Account is inactive. Please contact the school office.", status=403)

        if not verify_password(password, account['password_hash']):
            raise ParentAuthError("Invalid credentials", status=401)

        if not is_bcrypt_hash(account['password_hash']):
            try:
                self.repository.reset_password(account['id'], password)
                logger.info(f"Upgraded password hash to bcrypt for parent: {account['username']}")
            except Exception as e:
                logger.warning(f"Could not upgrade password hash for {account['username']}: {e}")

        self.repository.update_last_login(account['id'])
        logger.info(f"Parent logged in: {account['username']} (student {account['student_id']})")

        return {
            "id": account['id'],
            "username": account['username'],
            "student_id": account['student_id'],
            "full_name": account['full_name'],
        }

    def get_active_session_account(self, parent_id):
        """Return {id, username, student_id, full_name} for a still-active account, or None."""
        account = self.repository.find_active_by_id(parent_id)
        return dict(account) if account else None
