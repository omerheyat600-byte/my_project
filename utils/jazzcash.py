"""
JazzCash Hosted Checkout helpers.

Flow: the parent's browser is redirected (via an auto-submitting POST
form built by the frontend) to JazzCash's own hosted payment page —
they enter wallet/card details there, never on our site, so we stay
out of PCI scope entirely. JazzCash then POSTs the result back to our
pp_ReturnURL.

Security relies entirely on the secure hash: only someone who knows
JAZZCASH_INTEGRITY_SALT can compute a hash that matches, so every
inbound callback is HMAC-verified before we trust anything in it
(including whether it claims success).

IMPORTANT — verify before going live: JazzCash's exact field list and
hash format have shifted across integration-guide versions and differ
slightly by pp_TxnType (wallet vs card vs over-the-counter). What's
below is the common baseline from JazzCash's Hosted Checkout /
Redirection API docs. Confirm field names, the checkout URL, and the
hash algorithm against the merchant integration PDF JazzCash sends you
at signup, and test every scenario (success, failure, expiry) in
Sandbox before switching JAZZCASH_ENV to 'production'.
"""
import hashlib
import hmac
from datetime import datetime, timedelta

import config


def _secure_hash(fields: dict) -> str:
    """
    HMAC-SHA256 over all fields, sorted by key, values joined with '&'
    (keys are NOT included in the hashed string — only values), the
    whole thing prefixed with the integrity salt and '&'. The HMAC key
    is also the integrity salt. This is JazzCash's documented
    algorithm — do not reorder or reformat without re-checking it
    against the current integration guide.
    """
    salt = config.JAZZCASH_INTEGRITY_SALT
    sorted_keys = sorted(fields.keys())
    joined_values = '&'.join(str(fields[k]) for k in sorted_keys if fields[k] not in (None, ''))
    to_hash = f"{salt}&{joined_values}"
    return hmac.new(salt.encode(), to_hash.encode(), hashlib.sha256).hexdigest()


def build_checkout_fields(txn_ref_no: str, amount: float, bill_reference: str, description: str) -> dict:
    """
    Build the full pp_* field set for a Hosted Checkout form POST,
    including the computed pp_SecureHash.

    amount is in PKR (rupees) — JazzCash expects paisa (rupees * 100),
    converted here so callers never have to remember that.
    """
    now = datetime.now()
    expiry = now + timedelta(minutes=config.JAZZCASH_TXN_EXPIRY_MINUTES)

    fields = {
        "pp_Version": "1.1",
        "pp_TxnType": "MPAY",
        "pp_Language": "EN",
        "pp_MerchantID": config.JAZZCASH_MERCHANT_ID,
        "pp_SubMerchantID": "",
        "pp_Password": config.JAZZCASH_PASSWORD,
        "pp_BankID": "",
        "pp_ProductID": "",
        "pp_TxnRefNo": txn_ref_no,
        "pp_Amount": str(int(round(amount * 100))),
        "pp_TxnCurrency": "PKR",
        "pp_TxnDateTime": now.strftime("%Y%m%d%H%M%S"),
        "pp_BillReference": bill_reference,
        "pp_Description": description,
        "pp_TxnExpiryDateTime": expiry.strftime("%Y%m%d%H%M%S"),
        "pp_ReturnURL": config.JAZZCASH_RETURN_URL,
    }
    fields["pp_SecureHash"] = _secure_hash(fields)
    return fields


def checkout_url() -> str:
    return config.JAZZCASH_SANDBOX_URL if config.JAZZCASH_ENV == 'sandbox' else config.JAZZCASH_PRODUCTION_URL


def verify_response(response_fields: dict) -> bool:
    """
    Recompute the secure hash over everything JazzCash sent back
    (excluding pp_SecureHash itself) and compare using a constant-time
    comparison. Only trust a callback if this returns True — never
    branch on pp_ResponseCode before this check passes.
    """
    incoming_hash = response_fields.get("pp_SecureHash", "")
    if not incoming_hash or not config.JAZZCASH_INTEGRITY_SALT:
        return False
    fields_to_check = {k: v for k, v in response_fields.items() if k != "pp_SecureHash"}
    expected = _secure_hash(fields_to_check)
    return hmac.compare_digest(expected, incoming_hash)


def is_success(response_fields: dict) -> bool:
    """JazzCash uses response code '000' for a successful transaction."""
    return response_fields.get("pp_ResponseCode") == "000"
