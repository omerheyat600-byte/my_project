"""
Password hashing helpers shared by the auth and user-management layers.

Uses bcrypt for all new hashes. Old sha256 hashes (format '<salt>:<hex>',
produced by the previous version of this module) are still verified
correctly so existing users aren't locked out after this upgrade — the
auth layer re-hashes them to bcrypt transparently on next successful login
(see AuthService.login's `needs_rehash` handling).
"""
import bcrypt

# Old-format hashes look like "<32-hex-char-salt>:<64-hex-char-sha256>".
# bcrypt hashes always start with one of these prefixes, so this is
# enough to reliably tell the two formats apart.
_BCRYPT_PREFIXES = ("$2a$", "$2b$", "$2y$")


def is_bcrypt_hash(hashed):
    return isinstance(hashed, str) and hashed.startswith(_BCRYPT_PREFIXES)


def hash_password(password):
    """Hash a plaintext password with bcrypt. Returns a str (utf-8)."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password, hashed):
    """Verify a plaintext password against a hash from hash_password.

    Transparently supports both bcrypt hashes (new) and the legacy
    '<salt>:<sha256>' format (old), so existing DB rows keep working.
    """
    if not hashed:
        return False
    try:
        if is_bcrypt_hash(hashed):
            return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
        # Legacy sha256 fallback
        import hashlib
        salt, hash_val = hashed.split(':')
        return hash_val == hashlib.sha256((salt + password).encode()).hexdigest()
    except Exception:
        return False
