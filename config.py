"""
Application configuration: paths, secrets, and CORS/session settings.
"""
import os
import sys
import secrets
from dotenv import load_dotenv

# ─────────────────────────────────────────────
# BASE DIRECTORY (handles both script and frozen .exe execution)
# ─────────────────────────────────────────────
if getattr(sys, 'frozen', False):
    # Running as compiled .exe
    BASE_DIR = os.path.dirname(sys.executable)
else:
    # Running as normal Python script
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ─────────────────────────────────────────────
# LOGGING
# ─────────────────────────────────────────────
LOG_DIR = os.path.join(BASE_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "app.log")

# ─────────────────────────────────────────────
# BACKUP & RESTORE
# ─────────────────────────────────────────────
# Where generated backup ZIPs live.
BACKUP_DIR = os.path.join(BASE_DIR, "backups")
os.makedirs(BACKUP_DIR, exist_ok=True)

# Any files the app stores on disk (as opposed to in the database) —
# a backup must sweep all of these, and any future upload folder added
# under UPLOADS_DIR is automatically included without further changes
# since BackupService walks the whole tree rather than naming subfolders.
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
UPLOADS_STUDENTS_DIR = os.path.join(UPLOADS_DIR, "students")
UPLOADS_DOCUMENTS_DIR = os.path.join(UPLOADS_DIR, "documents")
UPLOADS_IDCARDS_DIR = os.path.join(UPLOADS_DIR, "idcards")
UPLOADS_EMPLOYEES_DIR = os.path.join(UPLOADS_DIR, "employees")
for _dir in (UPLOADS_DIR, UPLOADS_STUDENTS_DIR, UPLOADS_DOCUMENTS_DIR, UPLOADS_IDCARDS_DIR, UPLOADS_EMPLOYEES_DIR):
    os.makedirs(_dir, exist_ok=True)

STUDENT_PHOTO_ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}
STUDENT_PHOTO_MAX_BYTES = 3 * 1024 * 1024  # 3 MB

EMPLOYEE_DOCUMENT_ALLOWED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "webp", "doc", "docx"}
EMPLOYEE_DOCUMENT_MAX_BYTES = 8 * 1024 * 1024  # 8 MB

# Load environment variables from .env
load_dotenv(os.path.join(BASE_DIR, '.env'), override=True)

# ─────────────────────────────────────────────
# DATABASE (MySQL)
# ─────────────────────────────────────────────
# All five are overridable via .env. Defaults match a typical local
# MySQL/XAMPP/WAMP install so a fresh checkout "just works" against a
# local server with an empty root password.
MYSQL_HOST = os.environ.get("MYSQL_HOST", "127.0.0.1")
MYSQL_PORT = int(os.environ.get("MYSQL_PORT", "3306"))
MYSQL_USER = os.environ.get("MYSQL_USER", "root")
MYSQL_PASSWORD = os.environ.get("MYSQL_PASSWORD", "MyNewPass123!")
MYSQL_DB = os.environ.get("MYSQL_DB", "school_erp")
# utf8mb4 so names, addresses, etc. can hold any Unicode character
# (emoji included) — plain utf8 in MySQL is a 3-byte subset that will
# reject some valid input.
MYSQL_CHARSET = "utf8mb4"

# ─────────────────────────────────────────────
# LICENSE SYSTEM
# ─────────────────────────────────────────────
# Secret salt – keep this private and change it!
LICENSE_SALT = "eduadmin-salt-2026-secure"
# Name baked into every license key together with its expiry date and
# the salt above — only someone who knows LICENSE_SALT can produce a
# key that matches a given expiry date, so a customer editing the
# license file's expiry date by hand (without a matching new key)
# invalidates the license rather than extending it.
LICENSE_COMPANY_NAME = "Qamar Public School"
# A license expiring within this many days shows a "renew soon" notice
# in the admin UI instead of an outright block.
LICENSE_WARNING_DAYS = 15

# ─────────────────────────────────────────────
# SCHOOL CONFIGURATION
# ─────────────────────────────────────────────
SCHOOL_NAME = 'Qamar Public High School'

# ─────────────────────────────────────────────
# FLASK SECRET KEY
# ─────────────────────────────────────────────
SECRET_KEY = os.environ.get('SECRET_KEY')
if not SECRET_KEY:
    # Fallback for development only – DO NOT use in production
    SECRET_KEY = secrets.token_hex(32)
    print("⚠️ WARNING: Using auto-generated secret key. Set SECRET_KEY environment variable for production.")

# ─────────────────────────────────────────────
# CORS CONFIGURATION
# ─────────────────────────────────────────────
# Comma-separated extra origins via env var (e.g. a custom domain pointed
# at Render). The Flask app serves the frontend itself on the same origin
# as the API, so this list is only needed for cross-origin access.
_extra_origins = [o.strip() for o in os.environ.get("CORS_EXTRA_ORIGINS", "").split(",") if o.strip()]

CORS_RESOURCES = {
    r"/api/*": {"origins": ["http://127.0.0.1:5004", "http://localhost:5004"] + _extra_origins}
}

# ─────────────────────────────────────────────
# SESSION / COOKIE CONFIGURATION
# ─────────────────────────────────────────────
# Defaults to True (required for HTTPS deployments like Render — cookies
# marked Secure are dropped by browsers over plain http://). For local
# testing on http://127.0.0.1, set SESSION_COOKIE_SECURE=False in your
# local .env file; do NOT set it to False in Render's env vars.
SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "True").strip().lower() == "true"

SESSION_CONFIG = dict(
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=SESSION_COOKIE_SECURE,
    SESSION_COOKIE_HTTPONLY=True
)
