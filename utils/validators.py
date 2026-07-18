"""
Input validation helpers.
"""
from models.attendance import ATTENDANCE_STATUSES
from models.timetable import DAYS_OF_WEEK


def validate_attendance_mark_payload(data):
    """
    Validate the payload used to bulk-mark attendance for a class on a date.
    Expected shape: {"class_id": int, "date": "YYYY-MM-DD", "records": [
        {"student_id": "STU-001", "status": "Present", "remarks": ""}, ...
    ]}
    Returns a list of error messages (empty list means valid).
    """
    errors = []

    if not data.get("class_id"):
        errors.append("class_id is required")

    if not data.get("date"):
        errors.append("date is required")

    records = data.get("records")
    if not records or not isinstance(records, list):
        errors.append("records must be a non-empty list")
    else:
        for i, r in enumerate(records):
            if not r.get("student_id"):
                errors.append(f"records[{i}]: student_id is required")
            status = r.get("status")
            if status not in ATTENDANCE_STATUSES:
                errors.append(
                    f"records[{i}]: status must be one of {', '.join(ATTENDANCE_STATUSES)}"
                )

    return errors


def validate_staff_attendance_mark_payload(data):
    """
    Validate the payload used to bulk-mark staff attendance for a date.
    Expected shape: {"date": "YYYY-MM-DD", "records": [
        {"teacher_id": "TCH-001", "status": "Present", "remarks": ""}, ...
    ]}
    Returns a list of error messages (empty list means valid).
    """
    from models.staff_attendance import STAFF_ATTENDANCE_STATUSES

    errors = []

    if not data.get("date"):
        errors.append("date is required")

    records = data.get("records")
    if not records or not isinstance(records, list):
        errors.append("records must be a non-empty list")
    else:
        for i, r in enumerate(records):
            if not r.get("teacher_id"):
                errors.append(f"records[{i}]: teacher_id is required")
            status = r.get("status")
            if status not in STAFF_ATTENDANCE_STATUSES:
                errors.append(
                    f"records[{i}]: status must be one of {', '.join(STAFF_ATTENDANCE_STATUSES)}"
                )

    return errors


def validate_student_payload(data):
    """
    Validate the payload used to create/update a student.
    Returns a list of error messages (empty list means valid).
    """
    errors = []

    if not data.get("name"):
        errors.append("Name is required")

    if not data.get("grade"):
        errors.append("Grade is required")

    return errors


def validate_teacher_payload(data):
    """
    Validate the payload used to create/update a teacher.
    Returns a list of error messages (empty list means valid).
    """
    errors = []

    if not data.get("name"):
        errors.append("Name is required")

    if not data.get("subject"):
        errors.append("Subject is required")

    salary = data.get("salary", 0)
    if salary not in (None, ""):
        try:
            float(salary)
        except (TypeError, ValueError):
            errors.append("Salary must be a number")

    return errors


def validate_class_payload(data):
    """
    Validate the payload used to create/update a class.
    Returns a list of error messages (empty list means valid).
    """
    errors = []

    if not data.get("class_name"):
        errors.append("class_name is required")

    if not data.get("grade_level"):
        errors.append("grade_level is required")

    return errors


def validate_class_subject_payload(data):
    """
    Validate the payload used to add a subject to a class.
    Returns a list of error messages (empty list means valid).
    """
    errors = []

    if not (data.get("subject_name") or "").strip():
        errors.append("Subject name is required")

    return errors


def validate_fee_payload(data):
    """
    Validate the payload used to create/update a fee record.
    Returns a list of error messages (empty list means valid).
    """
    errors = []

    if not data.get("student_id"):
        errors.append("student_id is required")

    try:
        float(data.get("amount", 0))
    except (TypeError, ValueError):
        errors.append("amount must be a number")

    try:
        float(data.get("paid_amount", 0))
    except (TypeError, ValueError):
        errors.append("paid_amount must be a number")

    try:
        float(data.get("discount_amount", 0) or 0)
    except (TypeError, ValueError):
        errors.append("discount_amount must be a number")

    try:
        float(data.get("fine_amount", 0) or 0)
    except (TypeError, ValueError):
        errors.append("fine_amount must be a number")

    return errors


def validate_expense_payload(data):
    """
    Validate the payload used to create/update an expense record.
    Returns a list of error messages (empty list means valid).
    """
    errors = []

    if not data.get("category"):
        errors.append("category is required")

    try:
        float(data.get("amount", 0))
    except (TypeError, ValueError):
        errors.append("amount must be a number")

    return errors


def validate_user_payload(data, roles, require_password=True):
    """
    Validate the payload used to create/update a user account.
    Returns a list of error messages (empty list means valid).
    """
    errors = []

    if not data.get("username"):
        errors.append("username is required")

    if require_password and not data.get("password"):
        errors.append("password is required")

    if not data.get("full_name"):
        errors.append("full_name is required")

    role = data.get("role")
    if not role:
        errors.append("role is required")
    elif role not in roles:
        errors.append("Invalid role")

    return errors


def validate_result_payload(data):
    """
    Validate the payload used to create/update a legacy result row.
    Returns a list of error messages (empty list means valid).
    """
    errors = []

    if not data.get("student_id"):
        errors.append("student_id is required")

    if not data.get("subject"):
        errors.append("subject is required")

    try:
        float(data.get("obtained_marks", 0))
        float(data.get("total_marks", 0))
    except (TypeError, ValueError):
        errors.append("Invalid marks")

    return errors



def validate_timetable_slot_payload(data):
    """
    Validate the payload used to create/update a single timetable slot.
    Expected shape: {class_id, day_of_week, period_number, subject,
                      start_time?, end_time?, teacher_id?}
    Returns a list of error messages (empty list means valid).
    """
    errors = []

    if not data.get("class_id"):
        errors.append("class_id is required")

    if data.get("day_of_week") not in DAYS_OF_WEEK:
        errors.append(f"day_of_week must be one of {', '.join(DAYS_OF_WEEK)}")

    try:
        period = int(data.get("period_number"))
        if period < 1:
            errors.append("period_number must be a positive number")
    except (TypeError, ValueError):
        errors.append("period_number must be a number")

    if not data.get("subject"):
        errors.append("subject is required")

    return errors


def validate_library_book_payload(data):
    """
    Validate the payload used to create/update a library book (catalog entry).
    Expected shape: {title, author?, isbn?, category?, publisher?,
                      total_copies, shelf_location?}
    Returns a list of error messages (empty list means valid).
    """
    errors = []

    if not data.get("title"):
        errors.append("title is required")

    try:
        total_copies = int(data.get("total_copies", 1))
        if total_copies < 1:
            errors.append("total_copies must be at least 1")
    except (TypeError, ValueError):
        errors.append("total_copies must be a number")

    return errors


def validate_library_issue_payload(data):
    """
    Validate the payload used to issue a book to a student.
    Expected shape: {book_id, student_id, student_name?, issue_date?,
                      due_date?, loan_days?}
    Returns a list of error messages (empty list means valid).
    """
    errors = []

    if not data.get("book_id"):
        errors.append("book_id is required")

    if not data.get("student_id"):
        errors.append("student_id is required")

    return errors


def validate_chart_of_account_payload(data):
    """
    Validate the payload used to create/update a Chart of Accounts entry.
    Returns a list of error messages (empty list means valid).
    """
    from models.account import ACCOUNT_TYPES, ACCOUNT_CATEGORIES, BALANCE_SIDES

    errors = []

    if not (data.get("code") or "").strip():
        errors.append("code is required")

    if not (data.get("name") or "").strip():
        errors.append("name is required")

    if data.get("account_type") not in ACCOUNT_TYPES:
        errors.append(f"account_type must be one of {', '.join(ACCOUNT_TYPES)}")

    category = data.get("category") or "general"
    if category not in ACCOUNT_CATEGORIES:
        errors.append(f"category must be one of {', '.join(ACCOUNT_CATEGORIES)}")

    try:
        float(data.get("opening_balance", 0) or 0)
    except (TypeError, ValueError):
        errors.append("opening_balance must be a number")

    ob_type = data.get("opening_balance_type") or "Dr"
    if ob_type not in BALANCE_SIDES:
        errors.append("opening_balance_type must be 'Dr' or 'Cr'")

    return errors


def validate_journal_voucher_payload(data):
    """
    Validate a manual Journal Voucher payload.
    Expected shape: {voucher_date, narration?, party_name?, reference_no?,
                      entries: [{account_id, debit, credit, particulars?}, ...]}
    Requires >=2 balanced entries (sum(debit) == sum(credit) > 0).
    Returns a list of error messages (empty list means valid).
    """
    errors = []

    if not data.get("voucher_date"):
        errors.append("voucher_date is required")

    entries = data.get("entries")
    if not entries or not isinstance(entries, list) or len(entries) < 2:
        errors.append("At least two ledger entries are required")
        return errors

    total_debit = 0.0
    total_credit = 0.0
    for i, e in enumerate(entries):
        if not e.get("account_id"):
            errors.append(f"entries[{i}]: account_id is required")
        try:
            debit = float(e.get("debit", 0) or 0)
            credit = float(e.get("credit", 0) or 0)
        except (TypeError, ValueError):
            errors.append(f"entries[{i}]: debit/credit must be numbers")
            continue
        if debit and credit:
            errors.append(f"entries[{i}]: a single line can't have both debit and credit")
        if debit < 0 or credit < 0:
            errors.append(f"entries[{i}]: amounts can't be negative")
        total_debit += debit
        total_credit += credit

    if not errors:
        if total_debit <= 0:
            errors.append("Total voucher amount must be greater than zero")
        elif round(total_debit, 2) != round(total_credit, 2):
            errors.append(f"Voucher is not balanced: total debit ({total_debit:.2f}) != total credit ({total_credit:.2f})")

    return errors


def validate_payment_receipt_payload(data):
    """
    Validate a Payment Voucher / Receipt Voucher payload built from a
    cash/bank account plus one or more expense/income lines.
    Expected shape: {voucher_date, cash_bank_account_id, party_name?,
                      narration?, reference_no?,
                      lines: [{account_id, amount, particulars?}, ...]}
    Returns a list of error messages (empty list means valid).
    """
    errors = []

    if not data.get("voucher_date"):
        errors.append("voucher_date is required")

    if not data.get("cash_bank_account_id"):
        errors.append("cash_bank_account_id is required")

    lines = data.get("lines")
    if not lines or not isinstance(lines, list):
        errors.append("At least one line item is required")
        return errors

    total = 0.0
    for i, ln in enumerate(lines):
        if not ln.get("account_id"):
            errors.append(f"lines[{i}]: account_id is required")
        try:
            amount = float(ln.get("amount", 0) or 0)
        except (TypeError, ValueError):
            errors.append(f"lines[{i}]: amount must be a number")
            continue
        if amount <= 0:
            errors.append(f"lines[{i}]: amount must be greater than zero")
        total += amount

    if not errors and total <= 0:
        errors.append("Total voucher amount must be greater than zero")

    return errors


def validate_inventory_vendor_payload(data):
    """
    Validate the payload used to create/update an inventory vendor.
    Expected shape: {name, contact_person?, phone?, email?, address?, supplies?, notes?}
    """
    errors = []
    if not data.get("name"):
        errors.append("name is required")
    return errors


def validate_inventory_item_payload(data):
    """
    Validate the payload used to create/update an inventory item
    (Uniform / Books / Stationery catalog entry).
    Expected shape: {name, type, category?, sku?, unit?, unit_price?,
                      quantity_in_stock?, reorder_level?, vendor_id?, notes?}
    """
    from models.inventory import ITEM_TYPES
    errors = []

    if not data.get("name"):
        errors.append("name is required")

    if data.get("type") not in ITEM_TYPES:
        errors.append(f"type must be one of {', '.join(ITEM_TYPES)}")

    try:
        if data.get("unit_price") is not None:
            if float(data.get("unit_price")) < 0:
                errors.append("unit_price cannot be negative")
    except (TypeError, ValueError):
        errors.append("unit_price must be a number")

    try:
        if data.get("reorder_level") is not None:
            if int(data.get("reorder_level")) < 0:
                errors.append("reorder_level cannot be negative")
    except (TypeError, ValueError):
        errors.append("reorder_level must be a number")

    return errors


def validate_stock_movement_payload(data):
    """
    Validate the payload used to record a Stock In / Stock Out movement.
    Expected shape: {item_id, quantity, reason?, movement_date?}
    """
    errors = []

    if not data.get("item_id"):
        errors.append("item_id is required")

    try:
        quantity = int(data.get("quantity"))
        if quantity <= 0:
            errors.append("quantity must be a positive number")
    except (TypeError, ValueError):
        errors.append("quantity must be a number")

    return errors


def validate_inventory_purchase_payload(data):
    """
    Validate the payload used to record a Purchase from a Vendor.
    Expected shape: {vendor_id, item_id, quantity, unit_price, purchase_date?}
    """
    errors = []

    if not data.get("vendor_id"):
        errors.append("vendor_id is required")

    if not data.get("item_id"):
        errors.append("item_id is required")

    try:
        quantity = int(data.get("quantity"))
        if quantity <= 0:
            errors.append("quantity must be a positive number")
    except (TypeError, ValueError):
        errors.append("quantity must be a number")

    try:
        if data.get("unit_price") is not None:
            if float(data.get("unit_price")) < 0:
                errors.append("unit_price cannot be negative")
    except (TypeError, ValueError):
        errors.append("unit_price must be a number")

    if data.get("status") is not None:
        from models.inventory import PURCHASE_STATUSES
        if str(data.get("status")).strip().lower() not in [s.lower() for s in PURCHASE_STATUSES]:
            errors.append(f"status must be one of {', '.join(PURCHASE_STATUSES)}")

    return errors


def validate_leave_application_payload(data):
    """
    Validate a Leave Application payload.
    Expected shape: {teacher_id, leave_type, start_date, end_date, reason?}
    Returns a list of error messages (empty list means valid).
    """
    from models.hr import LEAVE_TYPES

    errors = []
    if not data.get("teacher_id"):
        errors.append("teacher_id is required")
    if data.get("leave_type") not in LEAVE_TYPES:
        errors.append(f"leave_type must be one of {', '.join(LEAVE_TYPES)}")
    if not data.get("start_date"):
        errors.append("start_date is required")
    if not data.get("end_date"):
        errors.append("end_date is required")
    if data.get("start_date") and data.get("end_date") and data["end_date"] < data["start_date"]:
        errors.append("end_date cannot be before start_date")
    return errors


def validate_overtime_payload(data):
    """
    Validate an Overtime entry payload.
    Expected shape: {teacher_id, date, hours, rate_per_hour, reason?}
    Returns a list of error messages (empty list means valid).
    """
    errors = []
    if not data.get("teacher_id"):
        errors.append("teacher_id is required")
    if not data.get("date"):
        errors.append("date is required")
    try:
        hours = float(data.get("hours", 0) or 0)
        if hours <= 0:
            errors.append("hours must be greater than zero")
    except (TypeError, ValueError):
        errors.append("hours must be a number")
    try:
        rate = float(data.get("rate_per_hour", 0) or 0)
        if rate < 0:
            errors.append("rate_per_hour cannot be negative")
    except (TypeError, ValueError):
        errors.append("rate_per_hour must be a number")
    return errors


def validate_increment_payload(data):
    """
    Validate an Increment payload.
    Expected shape: {teacher_id, effective_date, increment_type, increment_value, reason?}
    Returns a list of error messages (empty list means valid).
    """
    from models.hr import INCREMENT_TYPES

    errors = []
    if not data.get("teacher_id"):
        errors.append("teacher_id is required")
    if not data.get("effective_date"):
        errors.append("effective_date is required")
    if data.get("increment_type") not in INCREMENT_TYPES:
        errors.append(f"increment_type must be one of {', '.join(INCREMENT_TYPES)}")
    try:
        value = float(data.get("increment_value", 0) or 0)
        if value <= 0:
            errors.append("increment_value must be greater than zero")
    except (TypeError, ValueError):
        errors.append("increment_value must be a number")
    return errors


def validate_payroll_generate_payload(data):
    """
    Validate a payroll-generation request.
    Expected shape: {month, year, teacher_ids?}
    Returns a list of error messages (empty list means valid).
    """
    errors = []
    month = str(data.get("month") or "")
    year = str(data.get("year") or "")
    if not month or not month.zfill(2).isdigit() or not (1 <= int(month) <= 12):
        errors.append("month must be between 01 and 12")
    if not year or not year.isdigit() or len(year) != 4:
        errors.append("year must be a 4-digit year")
    return errors


def validate_employee_document_payload(data):
    """
    Validate the metadata for an Employee Document upload.
    Expected shape: {teacher_id, document_type, document_name?}
    Returns a list of error messages (empty list means valid).
    """
    from models.hr import EMPLOYEE_DOCUMENT_TYPES

    errors = []
    if not data.get("teacher_id"):
        errors.append("teacher_id is required")
    if data.get("document_type") not in EMPLOYEE_DOCUMENT_TYPES:
        errors.append(f"document_type must be one of {', '.join(EMPLOYEE_DOCUMENT_TYPES)}")
    return errors
