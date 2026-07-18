"""
VENDOR-ONLY TOOL — do not ship this file to customer installs.

Generates a license key tied to a specific expiry date. Because the
key hash depends on LICENSE_SALT (kept only here / in utils/license.py),
only whoever runs this script can issue a key that will actually
validate for a given expiry date — a customer editing license.key's
date by hand cannot produce a matching key on their own.

Usage:
    python generate_key.py                  # 1-year license from today
    python generate_key.py 2027-06-30        # license expiring on this date
"""
import sys
import hashlib
from datetime import date, timedelta

LICENSE_SALT = "eduadmin-salt-2026-secure"
LICENSE_COMPANY_NAME = "Qamar Public School"


def generate_license_key(company_name, expiry_date):
    raw = f"{company_name}:{expiry_date}:{LICENSE_SALT}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16].upper()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        expiry_date = sys.argv[1]
        try:
            date.fromisoformat(expiry_date)
        except ValueError:
            print("❌ Expiry date must be in YYYY-MM-DD format.")
            sys.exit(1)
    else:
        expiry_date = (date.today() + timedelta(days=365)).isoformat()

    key = generate_license_key(LICENSE_COMPANY_NAME, expiry_date)

    print("=" * 50)
    print(f"  Company:      {LICENSE_COMPANY_NAME}")
    print(f"  Expiry date:  {expiry_date}")
    print(f"  License key:  {key}")
    print("=" * 50)
    print("\nWrite this into the customer's license.key file as two lines:")
    print(f"{key}\n{expiry_date}")
