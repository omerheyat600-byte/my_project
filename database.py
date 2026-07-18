"""
Database connection helpers and schema initialization (MySQL).

This module used to talk to a local SQLite file. It's been converted to
MySQL via PyMySQL. To keep the ~40 repository files that call
`db.execute(sql, params)` with `?` placeholders working unmodified,
`get_db()` returns a thin wrapper around a PyMySQL connection that:

  - translates the SQLite-style `?` placeholders to PyMySQL's `%s`
  - only passes args through to PyMySQL when there actually are any,
    so literal `%` characters in queries without bound parameters
    (e.g. DATE_FORMAT(..., '%Y-%m')) are left alone
  - exposes `.execute()` returning the underlying cursor directly, so
    the existing `db.execute(...).fetchone()` / `.lastrowid` call
    pattern keeps working exactly as it did with sqlite3

Row access (`row["col"]`) keeps working because every cursor uses
PyMySQL's DictCursor, which returns plain dicts.
"""
import random
import string
from contextlib import contextmanager

import pymysql
import pymysql.cursors
from dbutils.pooled_db import PooledDB

import config


# ─────────────────────────────────────────────
# Connection pool. Every repository method calls get_db()/db.close()
# around a single query (a pattern inherited from the old
# sqlite3.connect()-per-call style), which used to mean a brand new
# TCP handshake to MySQL on every single query — expensive, and a
# real bottleneck under concurrent users. PooledDB keeps a small pool
# of live connections open and hands them out on get_db(); calling
# .close() on the wrapper just returns the connection to the pool
# instead of tearing it down, so no call sites needed to change.
# ─────────────────────────────────────────────
_pool = PooledDB(
    creator=pymysql,
    maxconnections=20,
    mincached=0,
    maxcached=10,
    blocking=True,
    ping=1,  # ping and reconnect stale connections before handing them out
    host=config.MYSQL_HOST,
    port=config.MYSQL_PORT,
    user=config.MYSQL_USER,
    password=config.MYSQL_PASSWORD,
    database=config.MYSQL_DB,
    charset=config.MYSQL_CHARSET,
    autocommit=False,
)


class MySQLConnection:
    """Thin adapter that makes a PyMySQL connection look like the
    sqlite3.Connection shortcut API the rest of the app was written
    against (conn.execute(sql, params) -> cursor)."""

    def __init__(self, conn):
        self._conn = conn

    @staticmethod
    def _translate(sql):
        # SQLite-style positional placeholders -> PyMySQL's.
        # Safe here because the codebase never uses a literal "?" in
        # SQL text (all wildcards for LIKE are passed inside bound
        # parameter values, e.g. f"%{term}%", never written into the
        # query string itself).
        return sql.replace("?", "%s")

    def execute(self, sql, params=None):
        cursor = self._conn.cursor(pymysql.cursors.DictCursor)
        sql = self._translate(sql)
        if params:
            cursor.execute(sql, params)
        else:
            cursor.execute(sql)
        return cursor

    def executemany(self, sql, seq_of_params):
        cursor = self._conn.cursor(pymysql.cursors.DictCursor)
        cursor.executemany(self._translate(sql), seq_of_params)
        return cursor

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()

    # Escape hatch for anything that needs the raw PyMySQL connection.
    @property
    def raw(self):
        return self._conn


def get_db():
    """Return a pooled MySQL connection wrapped for the sqlite-style
    db.execute(sql, params) call pattern used throughout the app.
    db.close() returns it to the pool rather than disconnecting."""
    conn = _pool.connection()
    return MySQLConnection(conn)


@contextmanager
def transaction():
    """
    Context manager wrapping a unit of work in a single transaction.
    Commits on success, rolls back on any exception, always closes the
    connection. Use whenever more than one write needs to succeed or
    fail together (bulk updates, multi-table writes, etc).

    Usage:
        with transaction() as db:
            db.execute("UPDATE students SET grade=? WHERE id=?", (...))
            db.execute("UPDATE fees SET ... WHERE student_id=?", (...))
    """
    db = get_db()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def rand_id(prefix):
    """
    Generates a unique random ID (e.g., STU-123 or TCH-456)
    and verifies that it doesn't already exist in the database.
    """
    db = get_db()
    table = "students" if prefix == "STU" else "teachers"
    try:
        while True:
            digits = "".join(random.choices(string.digits, k=3))
            candidate_id = f"{prefix}-{digits}"
            row = db.execute(f"SELECT 1 FROM {table} WHERE id=?", (candidate_id,)).fetchone()
            if not row:
                return candidate_id
    finally:
        db.close()


# ─────────────────────────────────────────────
# Schema-introspection helpers (replace SQLite's PRAGMA table_info /
# CREATE INDEX IF NOT EXISTS, neither of which MySQL supports).
# ─────────────────────────────────────────────

def _column_exists(db, table, column):
    row = db.execute(
        """
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
        """,
        (table, column),
    ).fetchone()
    return row is not None


def _add_column_if_missing(db, table, column, ddl):
    """ddl is the column type/constraint fragment, e.g. "TEXT" or
    "INTEGER DEFAULT 0"."""
    if not _column_exists(db, table, column):
        db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")


def _index_exists(db, table, index_name):
    row = db.execute(
        """
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
        """,
        (table, index_name),
    ).fetchone()
    return row is not None


def _create_index_if_missing(db, index_name, table, columns_sql, unique=False):
    if _index_exists(db, table, index_name):
        return
    kind = "UNIQUE INDEX" if unique else "INDEX"
    db.execute(f"CREATE {kind} {index_name} ON {table}({columns_sql})")


def init_db():
    db = get_db()

    # ---- Create all tables (fresh installs get the final shape
    # directly; upgrades to an existing database happen further down
    # via the _add_column_if_missing() calls, mirroring the old
    # SQLite ALTER-TABLE-on-startup approach). ----
    statements = [
        """
        CREATE TABLE IF NOT EXISTS students (
            id VARCHAR(20) PRIMARY KEY,
            name VARCHAR(150) NOT NULL,
            grade VARCHAR(50) NOT NULL,
            gender VARCHAR(20),
            dob VARCHAR(20),
            phone VARCHAR(30),
            email VARCHAR(150),
            address TEXT,
            parent_name VARCHAR(150),
            parent_phone VARCHAR(30),
            join_date VARCHAR(20),
            admission_no VARCHAR(50) UNIQUE,
            photo_path TEXT,
            status VARCHAR(20) DEFAULT 'Active',
            roll_no INT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS admissions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            applicant_no VARCHAR(50) UNIQUE NOT NULL,
            name VARCHAR(150) NOT NULL,
            father_name VARCHAR(150),
            cnic_bform VARCHAR(30),
            dob VARCHAR(20),
            gender VARCHAR(20),
            grade_applied VARCHAR(50) NOT NULL,
            phone VARCHAR(30),
            email VARCHAR(150),
            address TEXT,
            previous_school VARCHAR(200),
            photo_path TEXT,
            test_marks DOUBLE,
            test_total DOUBLE DEFAULT 100,
            test_date VARCHAR(20),
            status VARCHAR(30) DEFAULT 'Pending',
            applied_date VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
            approved_date VARCHAR(30),
            student_id VARCHAR(20),
            remarks TEXT,
            FOREIGN KEY (student_id) REFERENCES students(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS teachers (
            id VARCHAR(20) PRIMARY KEY,
            name VARCHAR(150) NOT NULL,
            subject VARCHAR(100) NOT NULL,
            gender VARCHAR(20),
            phone VARCHAR(30),
            email VARCHAR(150),
            qualification VARCHAR(150),
            salary DOUBLE DEFAULT 0,
            join_date VARCHAR(20)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS classes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            class_name VARCHAR(50) UNIQUE NOT NULL,
            grade_level VARCHAR(50) NOT NULL,
            section VARCHAR(20),
            class_teacher VARCHAR(20),
            class_teacher_name VARCHAR(150),
            room_number VARCHAR(30),
            schedule VARCHAR(150),
            capacity INT DEFAULT 0,
            max_subjects INT DEFAULT 20
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS results (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id VARCHAR(20) NOT NULL,
            student_name VARCHAR(150),
            subject VARCHAR(100) NOT NULL,
            obtained_marks DOUBLE NOT NULL,
            total_marks DOUBLE NOT NULL DEFAULT 100,
            grade VARCHAR(10),
            term VARCHAR(30),
            year VARCHAR(10),
            exam_date VARCHAR(20)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS fees (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id VARCHAR(20) NOT NULL,
            student_name VARCHAR(150),
            fee_type VARCHAR(50),
            month VARCHAR(20),
            amount DOUBLE NOT NULL,
            paid_amount DOUBLE DEFAULT 0,
            status VARCHAR(20) DEFAULT 'Pending',
            due_date VARCHAR(20),
            paid_date VARCHAR(20),
            discount_amount DOUBLE DEFAULT 0,
            discount_reason VARCHAR(200),
            fine_amount DOUBLE DEFAULT 0,
            fine_credited INT DEFAULT 0
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS charity_fund_ledger (
            id INT AUTO_INCREMENT PRIMARY KEY,
            entry_type VARCHAR(20) NOT NULL,
            amount DOUBLE NOT NULL,
            source VARCHAR(50) NOT NULL,
            fee_id INT,
            description TEXT,
            balance_after DOUBLE NOT NULL DEFAULT 0,
            created_by VARCHAR(100),
            created_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
            FOREIGN KEY (fee_id) REFERENCES fees(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS fee_vouchers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id VARCHAR(20) NOT NULL,
            month VARCHAR(20) NOT NULL,
            year VARCHAR(10) NOT NULL,
            total_amount DOUBLE DEFAULT 0,
            paid_amount DOUBLE DEFAULT 0,
            pending_amount DOUBLE DEFAULT 0,
            previous_pending DOUBLE DEFAULT 0,
            due_date VARCHAR(20),
            generated_date VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
            status VARCHAR(20) DEFAULT 'Pending',
            FOREIGN KEY (student_id) REFERENCES students(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS expenses (
            id INT AUTO_INCREMENT PRIMARY KEY,
            category VARCHAR(100) NOT NULL,
            description TEXT,
            amount DOUBLE NOT NULL,
            payment_method VARCHAR(50),
            reference_no VARCHAR(50),
            date VARCHAR(20)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS class_subjects (
            id INT AUTO_INCREMENT PRIMARY KEY,
            class_id INT NOT NULL,
            subject_name VARCHAR(100) NOT NULL,
            max_marks INT DEFAULT 100,
            FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
            UNIQUE(class_id, subject_name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS exam_sessions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            class_id INT NOT NULL,
            term VARCHAR(30) NOT NULL,
            year VARCHAR(10) NOT NULL,
            exam_date VARCHAR(20),
            result_locked INT DEFAULT 0,
            result_published INT DEFAULT 0,
            FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS student_results (
            id INT AUTO_INCREMENT PRIMARY KEY,
            exam_id INT NOT NULL,
            student_id VARCHAR(20) NOT NULL,
            student_name VARCHAR(150),
            total_obtained DOUBLE DEFAULT 0,
            total_marks DOUBLE DEFAULT 0,
            percentage DOUBLE DEFAULT 0,
            grade VARCHAR(10),
            position INT,
            grace_marks DOUBLE DEFAULT 0,
            gpa DOUBLE,
            FOREIGN KEY (exam_id) REFERENCES exam_sessions(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS student_result_subjects (
            id INT AUTO_INCREMENT PRIMARY KEY,
            exam_id INT NOT NULL,
            student_id VARCHAR(20) NOT NULL,
            subject VARCHAR(100) NOT NULL,
            obtained_marks DOUBLE DEFAULT 0,
            total_marks DOUBLE DEFAULT 100,
            grace_marks DOUBLE DEFAULT 0,
            FOREIGN KEY (exam_id) REFERENCES exam_sessions(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS exam_datesheet (
            id INT AUTO_INCREMENT PRIMARY KEY,
            exam_id INT NOT NULL,
            subject VARCHAR(100) NOT NULL,
            exam_date VARCHAR(20),
            start_time VARCHAR(20),
            end_time VARCHAR(20),
            room VARCHAR(30),
            FOREIGN KEY (exam_id) REFERENCES exam_sessions(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS exam_seating (
            id INT AUTO_INCREMENT PRIMARY KEY,
            exam_id INT NOT NULL,
            student_id VARCHAR(20) NOT NULL,
            student_name VARCHAR(150),
            room VARCHAR(30),
            seat_no VARCHAR(20),
            FOREIGN KEY (exam_id) REFERENCES exam_sessions(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS attendance (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id VARCHAR(20) NOT NULL,
            student_name VARCHAR(150),
            class_id INT NOT NULL,
            date VARCHAR(20) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'Present',
            remarks TEXT,
            marked_by VARCHAR(100),
            marked_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
            FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
            UNIQUE(student_id, date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS timetable (
            id INT AUTO_INCREMENT PRIMARY KEY,
            class_id INT NOT NULL,
            day_of_week VARCHAR(15) NOT NULL,
            period_number INT NOT NULL,
            start_time VARCHAR(20),
            end_time VARCHAR(20),
            subject VARCHAR(100) NOT NULL,
            teacher_id VARCHAR(20),
            teacher_name VARCHAR(150),
            FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
            FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL,
            UNIQUE(class_id, day_of_week, period_number)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS parent_accounts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(100) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            student_id VARCHAR(20) NOT NULL,
            full_name VARCHAR(150),
            phone VARCHAR(30),
            is_active INT DEFAULT 1,
            created_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
            last_login VARCHAR(30),
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS notification_log (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id VARCHAR(20) NOT NULL,
            parent_phone VARCHAR(30) NOT NULL,
            message TEXT NOT NULL,
            status VARCHAR(20) DEFAULT 'pending',
            sent_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
            error TEXT,
            related_to VARCHAR(50),
            related_id INT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        # ==================== LIBRARY MODULE ====================
        """
        CREATE TABLE IF NOT EXISTS library_books (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            author VARCHAR(150),
            isbn VARCHAR(30),
            category VARCHAR(100),
            publisher VARCHAR(150),
            total_copies INT NOT NULL DEFAULT 1,
            available_copies INT NOT NULL DEFAULT 1,
            shelf_location VARCHAR(50),
            added_date VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS library_issues (
            id INT AUTO_INCREMENT PRIMARY KEY,
            book_id INT NOT NULL,
            student_id VARCHAR(20) NOT NULL,
            student_name VARCHAR(150),
            issue_date VARCHAR(20) NOT NULL,
            due_date VARCHAR(20) NOT NULL,
            return_date VARCHAR(20),
            status VARCHAR(20) NOT NULL DEFAULT 'Issued',
            fine_amount DOUBLE NOT NULL DEFAULT 0,
            fine_paid INT NOT NULL DEFAULT 0,
            remarks TEXT,
            issued_by VARCHAR(100),
            FOREIGN KEY (book_id) REFERENCES library_books(id) ON DELETE CASCADE,
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS library_reservations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            book_id INT NOT NULL,
            student_id VARCHAR(20) NOT NULL,
            student_name VARCHAR(150),
            reserved_date VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
            status VARCHAR(20) NOT NULL DEFAULT 'Waiting',
            queue_position INT NOT NULL DEFAULT 1,
            notified_at VARCHAR(30),
            FOREIGN KEY (book_id) REFERENCES library_books(id) ON DELETE CASCADE,
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        # ==================== ACCOUNTS MODULE ====================
        """
        CREATE TABLE IF NOT EXISTS chart_of_accounts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            code VARCHAR(20) UNIQUE NOT NULL,
            name VARCHAR(150) NOT NULL,
            account_type VARCHAR(20) NOT NULL,
            category VARCHAR(20) NOT NULL DEFAULT 'general',
            opening_balance DOUBLE NOT NULL DEFAULT 0,
            opening_balance_type VARCHAR(5) NOT NULL DEFAULT 'Dr',
            is_active INT NOT NULL DEFAULT 1,
            is_system INT NOT NULL DEFAULT 0,
            created_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS accounts_vouchers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            voucher_no VARCHAR(50) UNIQUE NOT NULL,
            voucher_type VARCHAR(20) NOT NULL,
            voucher_date VARCHAR(20) NOT NULL,
            party_name VARCHAR(150),
            narration TEXT,
            reference_no VARCHAR(50),
            total_amount DOUBLE NOT NULL DEFAULT 0,
            created_by VARCHAR(100),
            created_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS accounts_voucher_entries (
            id INT AUTO_INCREMENT PRIMARY KEY,
            voucher_id INT NOT NULL,
            account_id INT NOT NULL,
            particulars VARCHAR(255),
            debit DOUBLE NOT NULL DEFAULT 0,
            credit DOUBLE NOT NULL DEFAULT 0,
            FOREIGN KEY (voucher_id) REFERENCES accounts_vouchers(id) ON DELETE CASCADE,
            FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        # ==================== INVENTORY MODULE ====================
        """
        CREATE TABLE IF NOT EXISTS inventory_vendors (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(150) NOT NULL,
            contact_person VARCHAR(150),
            phone VARCHAR(30),
            email VARCHAR(150),
            address TEXT,
            supplies VARCHAR(255),
            notes TEXT,
            is_active INT NOT NULL DEFAULT 1,
            created_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS inventory_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(150) NOT NULL,
            type VARCHAR(30) NOT NULL,
            category VARCHAR(100),
            sku VARCHAR(50),
            unit VARCHAR(20) NOT NULL DEFAULT 'pcs',
            unit_price DOUBLE NOT NULL DEFAULT 0,
            quantity_in_stock INT NOT NULL DEFAULT 0,
            reorder_level INT NOT NULL DEFAULT 0,
            vendor_id INT,
            notes TEXT,
            is_active INT NOT NULL DEFAULT 1,
            created_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
            FOREIGN KEY (vendor_id) REFERENCES inventory_vendors(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS inventory_purchases (
            id INT AUTO_INCREMENT PRIMARY KEY,
            purchase_no VARCHAR(50) NOT NULL,
            vendor_id INT NOT NULL,
            item_id INT NOT NULL,
            quantity INT NOT NULL,
            unit_price DOUBLE NOT NULL,
            total_amount DOUBLE NOT NULL,
            purchase_date VARCHAR(20) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'Received',
            notes TEXT,
            created_by VARCHAR(100),
            created_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
            received_date VARCHAR(20),
            received_by VARCHAR(100),
            FOREIGN KEY (vendor_id) REFERENCES inventory_vendors(id) ON DELETE CASCADE,
            FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS inventory_stock_movements (
            id INT AUTO_INCREMENT PRIMARY KEY,
            item_id INT NOT NULL,
            movement_type VARCHAR(10) NOT NULL,
            quantity INT NOT NULL,
            reference_type VARCHAR(30) NOT NULL DEFAULT 'Adjustment',
            reference_id INT,
            reason TEXT,
            movement_date VARCHAR(20) NOT NULL,
            recorded_by VARCHAR(100),
            created_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
            FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        # ==================== HR MODULE ====================
        """
        CREATE TABLE IF NOT EXISTS hr_leave_applications (
            id INT AUTO_INCREMENT PRIMARY KEY,
            teacher_id VARCHAR(20) NOT NULL,
            teacher_name VARCHAR(150),
            leave_type VARCHAR(30) NOT NULL,
            start_date VARCHAR(20) NOT NULL,
            end_date VARCHAR(20) NOT NULL,
            days INT NOT NULL DEFAULT 1,
            reason TEXT,
            status VARCHAR(20) NOT NULL DEFAULT 'Pending',
            applied_date VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
            reviewed_by VARCHAR(100),
            reviewed_at VARCHAR(30),
            review_remarks TEXT,
            FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS hr_overtime (
            id INT AUTO_INCREMENT PRIMARY KEY,
            teacher_id VARCHAR(20) NOT NULL,
            teacher_name VARCHAR(150),
            date VARCHAR(20) NOT NULL,
            hours DOUBLE NOT NULL,
            rate_per_hour DOUBLE NOT NULL DEFAULT 0,
            amount DOUBLE NOT NULL DEFAULT 0,
            reason TEXT,
            status VARCHAR(20) NOT NULL DEFAULT 'Pending',
            approved_by VARCHAR(100),
            approved_at VARCHAR(30),
            created_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
            FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS hr_increments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            teacher_id VARCHAR(20) NOT NULL,
            teacher_name VARCHAR(150),
            effective_date VARCHAR(20) NOT NULL,
            previous_salary DOUBLE NOT NULL DEFAULT 0,
            increment_type VARCHAR(20) NOT NULL DEFAULT 'Fixed',
            increment_value DOUBLE NOT NULL DEFAULT 0,
            increment_amount DOUBLE NOT NULL DEFAULT 0,
            new_salary DOUBLE NOT NULL DEFAULT 0,
            reason TEXT,
            approved_by VARCHAR(100),
            created_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
            FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS hr_payroll (
            id INT AUTO_INCREMENT PRIMARY KEY,
            teacher_id VARCHAR(20) NOT NULL,
            teacher_name VARCHAR(150),
            month VARCHAR(2) NOT NULL,
            year VARCHAR(4) NOT NULL,
            basic_salary DOUBLE NOT NULL DEFAULT 0,
            allowances DOUBLE NOT NULL DEFAULT 0,
            overtime_amount DOUBLE NOT NULL DEFAULT 0,
            deductions DOUBLE NOT NULL DEFAULT 0,
            leave_deduction DOUBLE NOT NULL DEFAULT 0,
            net_salary DOUBLE NOT NULL DEFAULT 0,
            status VARCHAR(20) NOT NULL DEFAULT 'Draft',
            payment_date VARCHAR(20),
            payment_method VARCHAR(50),
            generated_by VARCHAR(100),
            generated_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
            FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
            UNIQUE(teacher_id, month, year)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS hr_employee_documents (
            id INT AUTO_INCREMENT PRIMARY KEY,
            teacher_id VARCHAR(20) NOT NULL,
            teacher_name VARCHAR(150),
            document_type VARCHAR(50) NOT NULL,
            document_name VARCHAR(200) NOT NULL,
            file_path TEXT,
            expiry_date VARCHAR(20),
            notes TEXT,
            uploaded_by VARCHAR(100),
            uploaded_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
            FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS staff_attendance (
            id INT AUTO_INCREMENT PRIMARY KEY,
            teacher_id VARCHAR(20) NOT NULL,
            teacher_name VARCHAR(150),
            date VARCHAR(20) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'Present',
            remarks TEXT,
            marked_by VARCHAR(100),
            marked_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
            FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
            UNIQUE(teacher_id, date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
    ]

    for stmt in statements:
        db.execute(stmt)

    # ---- Indexes ----
    for name, table, cols, unique in [
        ("idx_fee_vouchers_student", "fee_vouchers", "student_id", False),
        ("idx_fee_vouchers_month_year", "fee_vouchers", "month, year", False),
        ("idx_attendance_class_date", "attendance", "class_id, date", False),
        ("idx_attendance_student", "attendance", "student_id", False),
        ("idx_timetable_class", "timetable", "class_id", False),
        ("idx_timetable_teacher", "timetable", "teacher_id", False),
        ("idx_parent_accounts_student", "parent_accounts", "student_id", False),
        ("idx_library_issues_book", "library_issues", "book_id", False),
        ("idx_library_issues_student", "library_issues", "student_id", False),
        ("idx_library_issues_status", "library_issues", "status", False),
        ("idx_library_reservations_book", "library_reservations", "book_id", False),
        ("idx_library_reservations_student", "library_reservations", "student_id", False),
        ("idx_staff_attendance_date", "staff_attendance", "date", False),
        ("idx_staff_attendance_teacher", "staff_attendance", "teacher_id", False),
        ("idx_coa_type", "chart_of_accounts", "account_type", False),
        ("idx_coa_category", "chart_of_accounts", "category", False),
        ("idx_vouchers_type", "accounts_vouchers", "voucher_type", False),
        ("idx_vouchers_date", "accounts_vouchers", "voucher_date", False),
        ("idx_voucher_entries_voucher", "accounts_voucher_entries", "voucher_id", False),
        ("idx_voucher_entries_account", "accounts_voucher_entries", "account_id", False),
        ("idx_inventory_items_type", "inventory_items", "type", False),
        ("idx_inventory_items_vendor", "inventory_items", "vendor_id", False),
        ("idx_inventory_purchases_vendor", "inventory_purchases", "vendor_id", False),
        ("idx_inventory_purchases_item", "inventory_purchases", "item_id", False),
        ("idx_inventory_movements_item", "inventory_stock_movements", "item_id", False),
        ("idx_inventory_movements_type", "inventory_stock_movements", "movement_type", False),
        ("idx_hr_leave_teacher", "hr_leave_applications", "teacher_id", False),
        ("idx_hr_leave_status", "hr_leave_applications", "status", False),
        ("idx_hr_leave_dates", "hr_leave_applications", "start_date, end_date", False),
        ("idx_hr_overtime_teacher", "hr_overtime", "teacher_id", False),
        ("idx_hr_overtime_date", "hr_overtime", "date", False),
        ("idx_hr_overtime_status", "hr_overtime", "status", False),
        ("idx_hr_increments_teacher", "hr_increments", "teacher_id", False),
        ("idx_hr_payroll_teacher", "hr_payroll", "teacher_id", False),
        ("idx_hr_payroll_period", "hr_payroll", "year, month", False),
        ("idx_hr_documents_teacher", "hr_employee_documents", "teacher_id", False),
    ]:
        _create_index_if_missing(db, name, table, cols, unique)

    # These two UNIQUE indexes back the INSERT ... ON DUPLICATE KEY UPDATE
    # upserts used by /api/exam/submit (submit_exam_marks).
    _create_index_if_missing(
        db, "idx_student_results_unique", "student_results", "exam_id, student_id", unique=True
    )
    _create_index_if_missing(
        db, "idx_student_result_subjects_unique", "student_result_subjects",
        "exam_id, student_id, subject", unique=True
    )

    # Prevents duplicate exam_sessions rows for the same class/term/year
    # (see ExamRepository.find_or_create). Guarded in a try/except: if an
    # existing database already has duplicate rows from before this fix,
    # creating the index would fail — and since this runs on every
    # startup, an unguarded failure here would crash the app permanently.
    try:
        _create_index_if_missing(
            db, "idx_exam_sessions_unique", "exam_sessions", "class_id, term, year", unique=True
        )
    except Exception as e:
        print(f"⚠️ Could not add exam_sessions uniqueness constraint (likely pre-existing duplicate rows): {e}")

    # Now check and add missing columns for existing databases (mirrors
    # the old PRAGMA table_info() upgrade path, using INFORMATION_SCHEMA
    # instead).
    _add_column_if_missing(db, "classes", "max_subjects", "INT DEFAULT 10")
    _add_column_if_missing(db, "students", "admission_no", "VARCHAR(50)")
    _add_column_if_missing(db, "students", "photo_path", "TEXT")

    # Unique index on admission_no. Like SQLite, MySQL's UNIQUE index
    # allows any number of NULLs to coexist (NULL is never considered
    # equal to NULL), so existing rows with no admission number yet are
    # unaffected — no WHERE-filtered index needed (MySQL doesn't support
    # partial indexes anyway).
    _create_index_if_missing(db, "idx_students_admission_no", "students", "admission_no", unique=True)

    # ---- Examination Module additions: result lock/publish flags, grace
    # marks, GPA. ----
    _add_column_if_missing(db, "exam_sessions", "result_locked", "INT DEFAULT 0")
    _add_column_if_missing(db, "exam_sessions", "result_published", "INT DEFAULT 0")
    _add_column_if_missing(db, "student_results", "grace_marks", "DOUBLE DEFAULT 0")
    _add_column_if_missing(db, "student_results", "gpa", "DOUBLE")
    _add_column_if_missing(db, "student_result_subjects", "grace_marks", "DOUBLE DEFAULT 0")

    _create_index_if_missing(db, "idx_exam_datesheet_exam", "exam_datesheet", "exam_id")
    _create_index_if_missing(db, "idx_exam_seating_exam", "exam_seating", "exam_id")
    _create_index_if_missing(db, "idx_exam_seating_unique", "exam_seating", "exam_id, student_id", unique=True)

    # ---- Accounts Module: seed a default Chart of Accounts. Idempotent
    # (INSERT IGNORE keyed on the UNIQUE `code` column) so it's safe to
    # run on every startup, including on pre-existing databases that were
    # created before this module existed. ----
    db.executemany("""
        INSERT IGNORE INTO chart_of_accounts
            (code, name, account_type, category, opening_balance, opening_balance_type, is_system)
        VALUES (?,?,?,?,?,?,?)
    """, [
        ("1001", "Cash in Hand",              "Asset",     "cash",    0, "Dr", 1),
        ("1002", "Bank Account - Main",       "Asset",     "bank",    0, "Dr", 1),
        ("1003", "Student Fees Receivable",   "Asset",     "general", 0, "Dr", 0),
        ("2001", "Accounts Payable",          "Liability", "general", 0, "Cr", 0),
        ("3001", "Owner's Capital",           "Equity",    "general", 0, "Cr", 0),
        ("3002", "Retained Earnings",         "Equity",    "general", 0, "Cr", 0),
        ("4001", "Tuition Fee Income",        "Income",    "general", 0, "Cr", 0),
        ("4002", "Admission Fee Income",      "Income",    "general", 0, "Cr", 0),
        ("4003", "Other Income",              "Income",    "general", 0, "Cr", 0),
        ("4004", "Transport Fee Income",      "Income",    "general", 0, "Cr", 0),
        ("4005", "Exam Fee Income",           "Income",    "general", 0, "Cr", 0),
        ("4006", "Books Fee Income",          "Income",    "general", 0, "Cr", 0),
        ("4007", "Lab Fee Income",            "Income",    "general", 0, "Cr", 0),
        ("5001", "Salaries Expense",          "Expense",   "general", 0, "Dr", 0),
        ("5002", "Utilities Expense",         "Expense",   "general", 0, "Dr", 0),
        ("5003", "Maintenance Expense",       "Expense",   "general", 0, "Dr", 0),
        ("5004", "Stationery Expense",        "Expense",   "general", 0, "Dr", 0),
        ("5005", "Transport Expense",         "Expense",   "general", 0, "Dr", 0),
        ("5006", "Other Expense",             "Expense",   "general", 0, "Dr", 0),
    ])

    # ---- Inventory: PO receiving. ----
    _add_column_if_missing(db, "inventory_purchases", "received_date", "VARCHAR(20)")
    _add_column_if_missing(db, "inventory_purchases", "received_by", "VARCHAR(100)")
    _create_index_if_missing(db, "idx_inventory_movements_reference", "inventory_stock_movements", "reference_type, reference_id")

    # ---- AI Features: Question Paper Generator. ----
    db.execute("""
        CREATE TABLE IF NOT EXISTS ai_question_bank (
            id INT AUTO_INCREMENT PRIMARY KEY,
            class_id INT,
            subject VARCHAR(100) NOT NULL,
            topic VARCHAR(150),
            question_type VARCHAR(30) NOT NULL DEFAULT 'Short Answer',
            question_text TEXT NOT NULL,
            options_json TEXT,
            correct_answer TEXT,
            marks DOUBLE DEFAULT 1,
            difficulty VARCHAR(20) DEFAULT 'Medium',
            source VARCHAR(20) DEFAULT 'manual',
            created_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
            FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)

    db.execute("""
        CREATE TABLE IF NOT EXISTS question_papers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            class_id INT,
            subject VARCHAR(100) NOT NULL,
            term VARCHAR(30),
            year VARCHAR(10),
            title VARCHAR(200),
            duration_minutes INT,
            total_marks DOUBLE,
            instructions TEXT,
            generation_mode VARCHAR(20) DEFAULT 'offline',
            content_json LONGTEXT NOT NULL,
            created_by VARCHAR(100),
            created_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
            FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)

    _create_index_if_missing(db, "idx_ai_qbank_lookup", "ai_question_bank", "subject, class_id, question_type")
    _create_index_if_missing(db, "idx_question_papers_lookup", "question_papers", "subject, class_id")

    # ---- Student Promotion / Year Rollover Module ----
    _add_column_if_missing(db, "students", "status", "VARCHAR(20) DEFAULT 'Active'")
    _add_column_if_missing(db, "students", "roll_no", "INT")

    db.execute("""
        CREATE TABLE IF NOT EXISTS promotion_batches (
            id INT AUTO_INCREMENT PRIMARY KEY,
            from_class VARCHAR(50) NOT NULL,
            to_class VARCHAR(50),
            from_academic_year VARCHAR(10),
            to_academic_year VARCHAR(10) NOT NULL,
            promotion_date VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
            remarks TEXT,
            created_by VARCHAR(100),
            total_students INT DEFAULT 0,
            promoted_count INT DEFAULT 0,
            retained_count INT DEFAULT 0,
            graduated_count INT DEFAULT 0,
            left_count INT DEFAULT 0,
            status VARCHAR(20) DEFAULT 'Completed',
            undone_at VARCHAR(30),
            undone_by VARCHAR(100)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)

    db.execute("""
        CREATE TABLE IF NOT EXISTS promotion_records (
            id INT AUTO_INCREMENT PRIMARY KEY,
            batch_id INT NOT NULL,
            student_id VARCHAR(20) NOT NULL,
            student_name VARCHAR(150),
            from_class VARCHAR(50),
            to_class VARCHAR(50),
            from_status VARCHAR(20) DEFAULT 'Active',
            to_status VARCHAR(20) DEFAULT 'Active',
            decision VARCHAR(30) NOT NULL,
            remarks TEXT,
            created_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
            FOREIGN KEY (batch_id) REFERENCES promotion_batches(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)

    _create_index_if_missing(db, "idx_promotion_records_batch", "promotion_records", "batch_id")
    _create_index_if_missing(db, "idx_promotion_records_student", "promotion_records", "student_id")
    _create_index_if_missing(db, "idx_promotion_batches_status", "promotion_batches", "status")

    # ---- Fees Module enhancement: discounts/scholarships + late fines ----
    _add_column_if_missing(db, "fees", "discount_amount", "DOUBLE DEFAULT 0")
    _add_column_if_missing(db, "fees", "discount_reason", "VARCHAR(200)")
    _add_column_if_missing(db, "fees", "fine_amount", "DOUBLE DEFAULT 0")

    # ---- Charity Fund: guard against crediting the same fine twice ----
    _add_column_if_missing(db, "fees", "fine_credited", "INT DEFAULT 0")

    _create_index_if_missing(db, "idx_charity_ledger_created_at", "charity_fund_ledger", "created_at")

    # ---- Fees <-> Accounts integration ----
    # payment_method (Cash/Bank/JazzCash) decides which Asset account
    # (Cash in Hand vs Bank Account) gets debited when a fee payment is
    # auto-posted to the ledger. Defaults to 'Cash' so existing/legacy
    # fee rows behave exactly as before.
    _add_column_if_missing(db, "fees", "payment_method", "VARCHAR(20) DEFAULT 'Cash'")

    # Soft-delete ("void") support for fees — financial records are never
    # hard-deleted; they're marked voided (with who/why/when) so the full
    # history stays intact for audits, and any already-posted ledger
    # amount can still be traced back to the fee that generated it.
    _add_column_if_missing(db, "fees", "is_voided", "INT DEFAULT 0")
    _add_column_if_missing(db, "fees", "voided_reason", "VARCHAR(255)")
    _add_column_if_missing(db, "fees", "voided_by", "VARCHAR(100)")
    _add_column_if_missing(db, "fees", "voided_at", "VARCHAR(30)")

    # fee_payment_postings: a trace/lookup table recording how much of a
    # fee's paid_amount has already been posted to the Accounts ledger,
    # and via which voucher. FeeAccountingService reads the SUM of this
    # per fee_id and only posts the DIFFERENCE on every save (delta-based),
    # so editing/receiving a fee payment never double-posts. Rows here
    # cascade-delete if the fee is deleted — safe, because the actual
    # vouchers/entries (the real ledger) are never deleted, only reversed,
    # and remain traceable via their reference_no ('FEE-<id>').
    db.execute("""
        CREATE TABLE IF NOT EXISTS fee_payment_postings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            fee_id INT NOT NULL,
            voucher_id INT NOT NULL,
            amount DOUBLE NOT NULL,
            created_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
            FOREIGN KEY (fee_id) REFERENCES fees(id) ON DELETE CASCADE,
            FOREIGN KEY (voucher_id) REFERENCES accounts_vouchers(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    _create_index_if_missing(db, "idx_fee_payment_postings_fee", "fee_payment_postings", "fee_id")

    # expense_payment_postings: same pattern as fee_payment_postings, but
    # for the Expenses <-> Accounts bridge. An expense amount is typically
    # set once (unlike a fee's editable paid_amount), but this stays
    # delta-based for the same reason: safe to call sync on every save,
    # and edits/deletes post an adjusting/reversing voucher instead of
    # ever touching a previously-posted ledger entry.
    db.execute("""
        CREATE TABLE IF NOT EXISTS expense_payment_postings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            expense_id INT NOT NULL,
            voucher_id INT NOT NULL,
            amount DOUBLE NOT NULL,
            created_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
            FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
            FOREIGN KEY (voucher_id) REFERENCES accounts_vouchers(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    _create_index_if_missing(db, "idx_expense_payment_postings_expense", "expense_payment_postings", "expense_id")

    # Soft-delete ("void") support for Accounts vouchers — same reasoning
    # as fees: a posted voucher is part of the permanent ledger trail and
    # is never hard-deleted, only voided (excluded from Cash Book, Bank
    # Book, Ledger, Trial Balance, P&L, Balance Sheet) while remaining on
    # record for audits.
    _add_column_if_missing(db, "accounts_vouchers", "is_voided", "INT DEFAULT 0")
    _add_column_if_missing(db, "accounts_vouchers", "voided_reason", "VARCHAR(255)")
    _add_column_if_missing(db, "accounts_vouchers", "voided_by", "VARCHAR(100)")
    _add_column_if_missing(db, "accounts_vouchers", "voided_at", "VARCHAR(30)")

    # ---- AI Features: Report Card Remarks. One row per (exam, student) —
    # generated via the configured AI provider (utils/ai_client) with an
    # offline rule-based fallback, same pattern as the Question Paper
    # Generator. Editable afterwards by a teacher (generation_mode then
    # becomes 'manual'), and cleared automatically if the exam session
    # itself is deleted. ----
    db.execute("""
        CREATE TABLE IF NOT EXISTS report_card_remarks (
            id INT AUTO_INCREMENT PRIMARY KEY,
            exam_id INT NOT NULL,
            student_id VARCHAR(20) NOT NULL,
            overall_remark TEXT,
            strengths TEXT,
            improvement_areas TEXT,
            generation_mode VARCHAR(20) DEFAULT 'offline',
            created_by VARCHAR(100),
            created_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
            updated_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
            UNIQUE KEY uniq_remark_exam_student (exam_id, student_id),
            FOREIGN KEY (exam_id) REFERENCES exam_sessions(id) ON DELETE CASCADE,
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    _create_index_if_missing(db, "idx_report_card_remarks_exam", "report_card_remarks", "exam_id")

    # ---- AI Features: Lesson Planner. Saved lesson plans, same shape
    # pattern as question_papers (a JSON content blob + queryable
    # class/subject columns for filtering the saved-plans list). ----
    db.execute("""
        CREATE TABLE IF NOT EXISTS lesson_plans (
            id INT AUTO_INCREMENT PRIMARY KEY,
            class_id INT,
            subject VARCHAR(100) NOT NULL,
            topic VARCHAR(200) NOT NULL,
            duration_minutes INT DEFAULT 40,
            generation_mode VARCHAR(20) DEFAULT 'offline',
            content_json LONGTEXT NOT NULL,
            created_by VARCHAR(100),
            created_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP),
            FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    _create_index_if_missing(db, "idx_lesson_plans_lookup", "lesson_plans", "subject, class_id")

    # ---- Dashboard performance indexes: the summary dashboard filters/
    # aggregates these tables by date, status, and stock level on every
    # load, so they need indexes to stay fast as the tables grow. ----
    _create_index_if_missing(db, "idx_attendance_date", "attendance", "date")
    _create_index_if_missing(db, "idx_expenses_date", "expenses", "date")
    _create_index_if_missing(db, "idx_fees_status", "fees", "status")
    _create_index_if_missing(db, "idx_fees_paid_date", "fees", "paid_date")
    _create_index_if_missing(db, "idx_inventory_items_stock", "inventory_items", "is_active, quantity_in_stock, reorder_level")
    _create_index_if_missing(db, "idx_hr_leave_status", "hr_leave_applications", "status")
    _create_index_if_missing(db, "idx_staff_attendance_date", "staff_attendance", "date")
    _create_index_if_missing(db, "idx_library_issues_status", "library_issues", "status, due_date")

    db.commit()
    db.close()


def seed_sample_data(db):
    """Insert a small set of demo rows (students/teachers/classes/results/
    fees/expenses) for a fresh install. Safe to call repeatedly — every
    insert uses INSERT IGNORE."""
    try:
        # =====================
        # STUDENTS
        # =====================
        db.executemany("""
        INSERT IGNORE INTO students(
            id,name,grade,gender,dob,phone,email,address,
            parent_name,parent_phone,join_date
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
        """, [
            ("STU-001","Ahmed Ali","Grade 10","Male","2008-05-12","0312-1234567","ahmed@school.pk","House 5, Lahore","Mr. Ali Hassan","0300-1234567","2020-04-01"),
            ("STU-002","Sara Khan","Grade 9","Female","2009-03-22","0321-2345678","sara@school.pk","Block B, Karachi","Mr. Imran Khan","0333-2345678","2021-04-01"),
            ("STU-003","Usman Raza","Grade 8","Male","2010-07-15","0345-3456789","usman@school.pk","Gulberg, Lahore","Mr. Raza Shah","0344-3456789","2021-04-01"),
            ("STU-004","Aisha Malik","Grade 7","Female","2011-01-10","0311-4567890","aisha@school.pk","F-8, Islamabad","Mrs. Nadia Malik","0311-4567890","2022-04-01"),
        ])

        # =====================
        # TEACHERS
        # =====================
        db.executemany("""
        INSERT IGNORE INTO teachers(
            id,name,subject,gender,phone,email,qualification,salary,join_date
        ) VALUES (?,?,?,?,?,?,?,?,?)
        """, [
            ("TCH-001","Mr. Adnan Bhatti","Mathematics","Male","0300-1111111","adnan@school.pk","MSc Mathematics",75000,"2018-01-15"),
            ("TCH-002","Ms. Hina Basit","English","Female","0311-2222222","hina@school.pk","MA English",65000,"2019-03-10"),
        ])

        # =====================
        # CLASSES
        # =====================
        db.executemany("""
        INSERT IGNORE INTO classes(
            class_name,grade_level,section,class_teacher,
            class_teacher_name,room_number,schedule,capacity
        ) VALUES (?,?,?,?,?,?,?,?)
        """, [
            ("Grade 10-A","10","A","TCH-001","Mr. Adnan Bhatti","R-302","Mon-Fri 8am-2pm",40),
            ("Grade 9-A","9","A","TCH-002","Ms. Hina Basit","R-301","Mon-Fri 8am-2pm",40),
        ])

        # =====================
        # RESULTS
        # =====================
        db.executemany("""
        INSERT IGNORE INTO results(
            student_id,student_name,subject,obtained_marks,
            total_marks,grade,term,year,exam_date
        ) VALUES (?,?,?,?,?,?,?,?,?)
        """, [
            ("STU-001","Ahmed Ali","Mathematics",88,100,"A","Term 1","2024","2024-03-15"),
            ("STU-002","Sara Khan","English",92,100,"A+","Term 1","2024","2024-03-15"),
        ])

        # =====================
        # FEES
        # =====================
        db.executemany("""
        INSERT IGNORE INTO fees(
            student_id,student_name,fee_type,amount,
            paid_amount,due_date,paid_date,status,month
        ) VALUES (?,?,?,?,?,?,?,?,?)
        """, [
            ("STU-001","Ahmed Ali","Tuition Fee",15000,15000,"2024-01-31","2024-01-20","Paid","January"),
        ])

        # =====================
        # EXPENSES
        # =====================
        db.executemany("""
        INSERT IGNORE INTO expenses(
            category,description,amount,payment_method,reference_no,date
        ) VALUES (?,?,?,?,?,?)
        """, [
            ("Salaries","Staff salaries",580000,"Bank","SAL-01","2024-01-31"),
        ])

        db.commit()

    except Exception as e:
        db.rollback()
        print("Seed Error:", e)
