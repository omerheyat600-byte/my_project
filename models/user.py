"""
User data model.
"""
from dataclasses import dataclass
from typing import Optional

# User roles and their access levels (single source of truth is
# utils/auth.py, since require_login/require_role live there too and
# are imported by every route module).
from utils.auth import USER_ROLES  # noqa: F401  (re-exported for convenience)


@dataclass
class User:
    id: Optional[int]
    username: str
    full_name: str
    email: Optional[str]
    role: str
    is_active: int = 1

    @classmethod
    def from_dict(cls, data, id=None):
        return cls(
            id=id,
            username=data.get('username'),
            full_name=data.get('full_name'),
            email=data.get('email', ''),
            role=data.get('role'),
            is_active=1 if data.get('is_active', True) else 0,
        )

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "full_name": self.full_name,
            "email": self.email,
            "role": self.role,
            "is_active": self.is_active,
        }
