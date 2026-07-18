"""
User service — business logic layer sitting between the users routes
and the user repository (account management, distinct from AuthService
which only deals with login/session).
"""
import pymysql

from models.user import User
from repositories.user_repository import UserRepository
from utils.auth import USER_ROLES
from utils.logger import get_logger
from utils.security import hash_password
from utils.validators import validate_user_payload

logger = get_logger(__name__)


class UserNotFoundError(Exception):
    pass


class UserValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("; ".join(errors))


class UsernameTakenError(Exception):
    pass


class LastAdminError(Exception):
    pass


class UserService:

    def __init__(self, repository: UserRepository):
        self.repository = repository

    def list_users(self):
        return self.repository.find_all()

    def create_user(self, data):
        errors = validate_user_payload(data, USER_ROLES, require_password=True)
        if errors:
            logger.warning(f"User validation failed: {errors} | payload={data}")
            raise UserValidationError(errors)

        user = User.from_dict(data)
        try:
            new_id = self.repository.create(user, data['password'])
        except pymysql.err.IntegrityError:
            logger.warning(f"User create failed — username already exists: {data.get('username')}")
            raise UsernameTakenError("Username already exists")

        logger.info(f"User created: {new_id} ({user.username}, {user.role})")
        return new_id

    def update_user(self, user_id, data):
        updates = []
        params = []

        if data.get('full_name'):
            updates.append("full_name = ?")
            params.append(data['full_name'])
        if data.get('email') is not None:
            updates.append("email = ?")
            params.append(data['email'])
        if data.get('role') and data['role'] in USER_ROLES:
            updates.append("role = ?")
            params.append(data['role'])
        if data.get('is_active') is not None:
            updates.append("is_active = ?")
            params.append(1 if data['is_active'] else 0)
        if data.get('password'):
            updates.append("password_hash = ?")
            params.append(hash_password(data['password']))

        if not updates:
            raise UserValidationError(["No fields to update"])

        params.append(user_id)
        self.repository.update_fields(user_id, updates, params)
        logger.info(f"User updated: {user_id}")

    def delete_user(self, user_id):
        admin_count = self.repository.count_active_admins()
        user = self.repository.find_role_by_id(user_id)

        if user and user['role'] == 'admin' and admin_count <= 1:
            logger.warning(f"Refused to delete last admin user: {user_id}")
            raise LastAdminError("Cannot delete the last admin user")

        self.repository.delete(user_id)
        logger.info(f"User deleted: {user_id}")
