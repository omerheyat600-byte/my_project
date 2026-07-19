"""
License key generation/verification, moved out of app.py.

Layers of protection, each closing a gap the previous one leaves open:

  1. Key + expiry binding: generate_license_key(company_name, expiry_date)
     bakes the expiry date INTO the key hash together with the private
     LICENSE_SALT. Editing the expiry date in license.key by hand,
     without also having a new key generated for that exact date,
     invalidates the license rather than extending it — only whoever
     holds LICENSE_SALT (generate_key.py) can issue a key for a date.

  2. Local watermark: every check records "today" into the app's own
     sqlite database. If the OS clock is ever seen going BACKWARD
     relative to that stored watermark, the license is blocked. This
     catches someone rolling the clock back after the app has already
     run at least once.

  3. Network time (the important one): on every check, if the machine
     has internet access, we ask a well-known HTTPS server what the
     real date is (via the standard 'Date' response header every web
     server sends — no API key needed) and use THAT instead of the OS
     clock. This closes the gap layer 2 can't: someone winding the
     clock back BEFORE the app's very first run, when no watermark
     exists yet to compare against. Network time is cached for several
     minutes (using a monotonic clock immune to wall-clock changes) so
     this doesn't hit the network on every request.

  4. Legacy perpetual key ("B9C8C5BD98A65D37") is kept working with no
     expiry check at all, for installs activated before expiry dates
     existed — this file's rollback/network logic doesn't apply to it.

Honest limit: if the machine has NO internet at all and someone rolls
the clock back before the very first run, layer 2 has nothing to
compare against yet and can't catch it. Closing that completely would
require a licensing server the app must always reach, which isn't
practical for an offline desktop deployment like this one.
"""
import os
import time
import hashlib
import urllib.request
from datetime import date, timedelta, timezone
from email.utils import parsedate_to_datetime

from config import BASE_DIR, LICENSE_SALT, LICENSE_COMPANY_NAME, LICENSE_WARNING_DAYS

# Perpetual license kept for backward compatibility with installs that
# were activated before expiry dates existed. Never expires.
LEGACY_PERPETUAL_KEY = "B9C8C5BD98A65D37"

WATERMARK_KEY = 'license_clock_watermark'

# Well-known HTTPS hosts used only to read their standard 'Date' response
# header — not a time API, just ordinary web servers everyone can reach.
_NETWORK_TIME_HOSTS = ["https://www.google.com", "https://www.cloudflare.com"]
_NETWORK_TIMEOUT_SECONDS = 1.5
_NETWORK_RECHECK_SECONDS = 600      # re-verify against the network every 10 min
_NETWORK_FAIL_BACKOFF_SECONDS = 120  # don't retry immediately after a failed attempt (offline)

_network_time_cache = {"checked_at_monotonic": None, "date": None}


def generate_license_key(company_name, expiry_date):
    """Generate a license key tied to a company name AND an expiry date."""
    raw = f"{company_name}:{expiry_date}:{LICENSE_SALT}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16].upper()


def _read_license_file():
    key = os.environ.get("LICENSE_KEY", "").strip()
    expiry = os.environ.get("LICENSE_EXPIRY", "").strip()
    source = "env"

    try:
        with open(os.path.join(BASE_DIR, "license.key"), "r", encoding="utf-8") as f:
            lines = [line.strip() for line in f if line.strip()]

        if not key and len(lines) >= 1:
            key = lines[0]

        if not expiry and len(lines) >= 2:
            expiry = lines[1]

        if lines:
            source = "license.key"

    except FileNotFoundError:
        pass

    return key, expiry, source


def _fetch_network_date():
    """Ask a well-known HTTPS server what today's date is via its
    standard 'Date' response header. Returns a date object, or None if
    every host is unreachable (offline)."""
    for url in _NETWORK_TIME_HOSTS:
        try:
            req = urllib.request.Request(url, method='HEAD')
            with urllib.request.urlopen(req, timeout=_NETWORK_TIMEOUT_SECONDS) as resp:
                date_header = resp.headers.get('Date')
                if date_header:
                    dt = parsedate_to_datetime(date_header)
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    return dt.astimezone(timezone.utc).date()
        except Exception:
            continue
    return None


def _get_trusted_today():
    """
    Returns (today_date, source) where source is "network" (trusted,
    can't be spoofed by changing the local clock) or "local" (OS clock,
    only used when offline).

    Uses time.monotonic() for caching/backoff timing specifically
    because — unlike wall-clock time — it can't be wound backward by
    the user, so the cache itself can't be gamed into skipping checks.
    """
    now_mono = time.monotonic()
    cached_at = _network_time_cache["checked_at_monotonic"]
    cached_date = _network_time_cache["date"]

    if cached_at is not None:
        elapsed = now_mono - cached_at
        if cached_date is not None and elapsed < _NETWORK_RECHECK_SECONDS:
            return cached_date + timedelta(days=int(elapsed // 86400)), "network"
        if cached_date is None and elapsed < _NETWORK_FAIL_BACKOFF_SECONDS:
            return date.today(), "local"

    net_date = _fetch_network_date()
    _network_time_cache["checked_at_monotonic"] = now_mono
    _network_time_cache["date"] = net_date

    if net_date is not None:
        return net_date, "network"
    return date.today(), "local"


def _update_watermark_and_check_rollback(today, trusted):
    """
    Persist `today` as a watermark in the local sqlite database so a
    later OFFLINE check can detect the OS clock going backward.

    trusted=True (network-verified date): always advance the watermark,
    no rollback check needed — we already know the real date.
    trusted=False (OS clock, offline): if `today` is BEFORE the stored
    watermark, the clock was wound back since the last check.
    """
    try:
        from repositories.settings_repository import SettingsRepository
        repo = SettingsRepository()
        watermark = repo.get_setting(WATERMARK_KEY, '')
        today_str = today.isoformat()

        if not watermark:
            repo.set_setting(WATERMARK_KEY, today_str)
            return False

        watermark_date = date.fromisoformat(watermark)

        if not trusted and today < watermark_date:
            return True  # rollback detected

        if today >= watermark_date and today_str != watermark:
            repo.set_setting(WATERMARK_KEY, today_str)
        return False
    except Exception:
        # DB not reachable yet (e.g. very first import) — don't block
        # startup over this; the key/expiry check still applies normally.
        return False


def check_license():
    """
    Full license status, safe to surface to the end user.

    Returns:
        {
          "valid": bool,           # usable right now
          "expired": bool,         # authentic key, but past its expiry date
          "key_invalid": bool,     # missing / unrecognized / corrupted
          "clock_rollback": bool,  # system date appears to have been wound back
          "expiry_date": "YYYY-MM-DD" | None,
          "days_remaining": int | None,
          "time_source": "network" | "local" | None,
          "message": str,          # human-readable, safe to display
        }
    """
    key, expiry, source = _read_license_file()
    print(f"🔑 Key from {source}: '{key}' (expiry: {expiry or 'none / perpetual'})")

    if not key:
        return {
            "valid": False, "expired": False, "key_invalid": True, "clock_rollback": False,
            "expiry_date": None, "days_remaining": None, "time_source": None,
            "message": "No license key found. Please get a license to continue using EduAdmin.",
        }

    # Legacy perpetual key — always valid, no expiry to check, so no
    # clock rollback / network time check needed either.
    if key == LEGACY_PERPETUAL_KEY:
        return {
            "valid": True, "expired": False, "key_invalid": False, "clock_rollback": False,
            "expiry_date": None, "days_remaining": None, "time_source": None,
            "message": "License is valid.",
        }

    if not expiry:
        return {
            "valid": False, "expired": False, "key_invalid": True, "clock_rollback": False,
            "expiry_date": None, "days_remaining": None, "time_source": None,
            "message": "License file is missing its expiry date. Please contact support to get a valid license.",
        }

    try:
        expiry_dt = date.fromisoformat(expiry)
    except ValueError:
        return {
            "valid": False, "expired": False, "key_invalid": True, "clock_rollback": False,
            "expiry_date": expiry, "days_remaining": None, "time_source": None,
            "message": "License file is corrupted. Please contact support to get a valid license.",
        }

    expected_key = generate_license_key(LICENSE_COMPANY_NAME, expiry)
    if key != expected_key:
        return {
            "valid": False, "expired": False, "key_invalid": True, "clock_rollback": False,
            "expiry_date": expiry, "days_remaining": None, "time_source": None,
            "message": "Invalid license key. Please get a valid license to continue using EduAdmin.",
        }

    today, time_source = _get_trusted_today()

    if _update_watermark_and_check_rollback(today, trusted=(time_source == "network")):
        return {
            "valid": False, "expired": False, "key_invalid": False, "clock_rollback": True,
            "expiry_date": expiry, "days_remaining": None, "time_source": time_source,
            "message": (
                "Your system date/time appears to have been changed backward. "
                "Please correct your system clock to continue using EduAdmin."
            ),
        }

    days_remaining = (expiry_dt - today).days

    if days_remaining < 0:
        return {
            "valid": False, "expired": True, "key_invalid": False, "clock_rollback": False,
            "expiry_date": expiry, "days_remaining": days_remaining, "time_source": time_source,
            "message": (
                f"Your license expired on {expiry_dt.strftime('%d %B %Y')}. "
                "Please renew your license to continue using EduAdmin."
            ),
        }

    message = "License is valid."
    if days_remaining <= LICENSE_WARNING_DAYS:
        message = (
            f"Your license will expire on {expiry_dt.strftime('%d %B %Y')} "
            f"({days_remaining} day{'s' if days_remaining != 1 else ''} left). "
            "Please renew soon to avoid interruption."
        )

    return {
        "valid": True, "expired": False, "key_invalid": False, "clock_rollback": False,
        "expiry_date": expiry, "days_remaining": days_remaining, "time_source": time_source,
        "message": message,
    }


def verify_license():
    """Backward-compatible boolean check (used at startup by run.py).
    True only when the license is authentic AND not expired."""
    return check_license()["valid"]
