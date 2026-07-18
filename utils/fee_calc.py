"""
Shared fee-status calculation logic, used by fee creation/update, voucher
generation, and bulk voucher generation.
"""
from datetime import datetime


def calculate_fee_status(amount, paid):
    """Return 'Paid' / 'Partial' / 'Pending' based on net amount vs paid.

    `amount` here should be the NET payable amount (original amount minus
    any discount/scholarship, plus any late fine) — not the raw fee
    amount — so status stays accurate once discounts/fines are involved.
    """
    if paid >= amount:
        return "Paid"
    elif paid > 0:
        return "Partial"
    return "Pending"


def calculate_net_amount(amount, discount_amount=0, fine_amount=0):
    """Net payable = original amount - discount/scholarship + late fine."""
    amount = float(amount or 0)
    discount_amount = float(discount_amount or 0)
    fine_amount = float(fine_amount or 0)
    return amount - discount_amount + fine_amount


def calculate_late_fine(due_date, fine_per_day, grace_days=0, today=None):
    """
    Calculate a late fine for an overdue fee.

    due_date: 'YYYY-MM-DD' string (or falsy if there's no due date, in
        which case no fine applies).
    fine_per_day: PKR charged per day overdue, past the grace period.
    grace_days: number of days after due_date before the fine starts
        accruing (e.g. 5 means the first 5 days late are free).
    today: optional datetime for testability; defaults to now.

    Returns 0 if the fee isn't overdue (or has no due date).
    """
    if not due_date:
        return 0

    try:
        due = datetime.strptime(due_date, '%Y-%m-%d')
    except ValueError:
        return 0

    today = today or datetime.now()
    days_late = (today - due).days - int(grace_days or 0)

    if days_late <= 0:
        return 0

    return round(days_late * float(fine_per_day or 0), 2)
