"""
One-time script to fill missing 'month' values in the fees table.
Uses the month from 'due_date' if available.
"""

from datetime import datetime

from database import get_db

MONTH_NAMES = [
    None, "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


def update_fee_months():
    db = get_db()
    try:
        # First, check how many records have missing month
        row = db.execute("SELECT COUNT(*) c FROM fees WHERE (month IS NULL OR month = '')").fetchone()
        missing_count = row["c"]
        print(f"📊 Found {missing_count} records with missing month.")

        if missing_count == 0:
            print("✅ No records need updating. Exiting.")
            return

        # Update month using due_date (MONTH() parses a 'YYYY-MM-DD' string
        # directly, same as SQLite's strftime('%m', due_date) did).
        update_sql = """
            UPDATE fees
            SET month = CASE MONTH(due_date)
                WHEN 1 THEN 'January'
                WHEN 2 THEN 'February'
                WHEN 3 THEN 'March'
                WHEN 4 THEN 'April'
                WHEN 5 THEN 'May'
                WHEN 6 THEN 'June'
                WHEN 7 THEN 'July'
                WHEN 8 THEN 'August'
                WHEN 9 THEN 'September'
                WHEN 10 THEN 'October'
                WHEN 11 THEN 'November'
                WHEN 12 THEN 'December'
            END
            WHERE (month IS NULL OR month = '')
        """
        try:
            cursor = db.execute(update_sql)
            db.commit()
            updated = cursor.rowcount
            print(f"✅ Successfully updated {updated} records.")

            # Records with a missing due_date too: fall back to the current month.
            current_month = datetime.now().strftime('%B')
            cursor = db.execute("""
                UPDATE fees
                SET month = ?
                WHERE (month IS NULL OR month = '')
                  AND (due_date IS NULL OR due_date = '')
            """, (current_month,))
            db.commit()
            extra = cursor.rowcount
            if extra:
                print(f"ℹ️ Set {extra} additional records to current month '{current_month}' (no due_date).")
        except Exception as e:
            db.rollback()
            print(f"❌ Error updating records: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    print("🔄 Running fee month update script...")
    update_fee_months()
