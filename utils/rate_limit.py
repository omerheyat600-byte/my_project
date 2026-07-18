"""
Login brute-force protection: a small in-memory lockout tracker shared
by the admin login (routes/auth.py) and parent portal login
(routes/parent_auth.py) endpoints.

Tracks failed attempts per *username* (so a locked-out account stays
locked no matter which IP is trying it) and per *IP* (so one IP can't
just cycle through many different usernames to dodge the per-account
limit). Whichever key hits the threshold first locks the request out.

In-memory and process-local by design — this app runs as a single
waitress process per deployment (one school, one server), so no
shared store (Redis etc.) is needed. If this ever runs as multiple
processes behind a load balancer, this would need to move to a shared
store to stay effective.
"""
import threading
import time

MAX_ATTEMPTS = 5
WINDOW_SECONDS = 15 * 60   # failed attempts older than this don't count
LOCKOUT_SECONDS = 15 * 60  # how long a key stays locked once tripped

_lock = threading.Lock()
_attempts = {}  # key -> {"count": int, "first_attempt": float, "locked_until": float|None}


def _get_entry(key):
    entry = _attempts.get(key)
    now = time.monotonic()
    if entry and (now - entry["first_attempt"]) > WINDOW_SECONDS and not entry.get("locked_until"):
        # Window expired with no lockout triggered — start fresh.
        entry = None
    if not entry:
        entry = {"count": 0, "first_attempt": now, "locked_until": None}
        _attempts[key] = entry
    return entry


def check_locked(*keys):
    """Return seconds remaining if ANY of the given keys is currently
    locked out, otherwise None."""
    with _lock:
        now = time.monotonic()
        remaining = None
        for key in keys:
            entry = _attempts.get(key)
            if entry and entry.get("locked_until") and entry["locked_until"] > now:
                left = entry["locked_until"] - now
                if remaining is None or left > remaining:
                    remaining = left
        return int(remaining) + 1 if remaining else None


def record_failure(*keys):
    """Record a failed attempt against each key; locks any key that
    crosses MAX_ATTEMPTS within WINDOW_SECONDS."""
    with _lock:
        now = time.monotonic()
        for key in keys:
            entry = _get_entry(key)
            entry["count"] += 1
            if entry["count"] >= MAX_ATTEMPTS:
                entry["locked_until"] = now + LOCKOUT_SECONDS


def record_success(*keys):
    """Clear tracked failures for each key (called on successful login)."""
    with _lock:
        for key in keys:
            _attempts.pop(key, None)


def client_ip(request):
    """Best-effort client IP. Honors X-Forwarded-For (Render and most
    reverse proxies set this) since request.remote_addr would
    otherwise just be the proxy's own address for every request."""
    forwarded = request.headers.get('X-Forwarded-For', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.remote_addr or 'unknown'
