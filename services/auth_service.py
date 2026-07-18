"""
Auth service — business logic layer sitting between the auth routes
and the user repository (login, session bootstrap, default admin setup).
"""
from repositories.user_repository import UserRepository
from utils.logger import get_logger
from utils.security import verify_password, hash_password, is_bcrypt_hash

logger = get_logger(__name__)


class AuthError(Exception):
    """Raised for any login failure. `status` lets the route pick the HTTP code."""
    def __init__(self, message, status=401):
        self.status = status
        super().__init__(message)


class AuthService:

    def __init__(self, repository: UserRepository):
        self.repository = repository

    def bootstrap(self):
        """Create the users table (if missing) and seed the default admin."""
        try:
            self.repository.ensure_schema()
            created = self.repository.seed_default_admin()
            if created:
                logger.info("Default admin user created.")
            else:
                logger.info("Admin user already exists – skipping creation.")
            logger.info("Users table ready.")
        except Exception as e:
            logger.error(f"Error initializing users table: {e}")
            raise

    def login(self, username, password):
        """Validate credentials and return the user row as a dict, or raise AuthError."""
        if not username or not password:
            raise AuthError("Missing username or password", status=400)

        user = self.repository.find_by_username(username)
        if not user:
            raise AuthError("Invalid credentials", status=401)

        if not user['is_active']:
            raise AuthError("Account is inactive", status=403)

        if not verify_password(password, user['password_hash']):
            raise AuthError("Invalid credentials", status=401)

        # Transparent upgrade: old sha256 hashes get re-hashed to bcrypt
        # the moment we see the correct plaintext password, so users are
        # never forced to reset and every row converges to bcrypt over time.
        if not is_bcrypt_hash(user['password_hash']):
            try:
                self.repository.update_fields(
                    user['id'], ["password_hash = ?"], [hash_password(password), user['id']]
                )
                logger.info(f"Upgraded password hash to bcrypt for user: {user['username']}")
            except Exception as e:
                logger.warning(f"Could not upgrade password hash for {user['username']}: {e}")

        self.repository.update_last_login(user['id'])
        logger.info(f"User logged in: {user['username']}")

        return {
            "id": user['id'],
            "username": user['username'],
            "full_name": user['full_name'],
            "role": user['role'],
        }

    def get_active_session_user(self, user_id):
        """Return {username, full_name, role} for a still-active user, or None."""
        user = self.repository.find_active_by_id(user_id)
        return dict(user) if user else None

    def get_table_columns(self):
        return self.repository.get_columns()
