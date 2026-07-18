# SQLite → MySQL conversion notes

This project now runs on MySQL (via PyMySQL) instead of a local
`school.db` SQLite file. Read this before you run it.

## 1. Requirements

- MySQL 8.0.13+ (needed for expression `DEFAULT (CURRENT_TIMESTAMP)`
  on VARCHAR columns — see "Why timestamps are still VARCHAR" below).
  MariaDB 10.2+ works the same way.
- `PyMySQL` is now in `requirements.txt` — run
  `pip install -r requirements.txt` again after pulling this.
- For the Backup/Restore module: `mysqldump` and `mysql` command-line
  clients must be reachable — either on `PATH`, or point to them
  explicitly with the `MYSQLDUMP_PATH` / `MYSQL_CLI_PATH` environment
  variables (e.g. if you're running XAMPP/WAMP, that's usually
  `...\mysql\bin\mysqldump.exe`).

## 2. One-time setup

1. Create an empty database (name must match `MYSQL_DB` below):
   ```sql
   CREATE DATABASE school_erp CHARACTER SET utf8mb4;
   ```
2. Add your connection details to `.env` (defaults shown match a local
   install with an empty root password):
   ```
   MYSQL_HOST=127.0.0.1
   MYSQL_PORT=3306
   MYSQL_USER=root
   MYSQL_PASSWORD=
   MYSQL_DB=school_erp
   ```
3. Run the app as usual (`python run.py`). `init_db()` creates every
   table on first launch, same as it did for SQLite before.

There is nothing to import from the old `school.db` automatically —
see "Moving existing data" below if you have live data to bring over.

## 3. What changed, and why

- **`database.py`** was rewritten around a small wrapper
  (`MySQLConnection`) that translates the app's SQLite-style
  `db.execute(sql, params)` / `?` placeholder calls into PyMySQL's
  `%s` placeholders, so the ~40 repository files that call
  `get_db()` / `transaction()` didn't need to change one by one.
  Row access (`row["col"]`) still works because every query uses
  PyMySQL's `DictCursor`.
- **Schema**: every `CREATE TABLE` was translated to MySQL syntax
  (`AUTO_INCREMENT` instead of `AUTOINCREMENT`, `DOUBLE` instead of
  `REAL`, `ENGINE=InnoDB` for foreign keys, etc). SQLite's
  `PRAGMA table_info` / `CREATE INDEX IF NOT EXISTS` (neither of
  which MySQL supports) were replaced with helpers that check
  `information_schema` first.
- **Upserts**: every `INSERT ... ON CONFLICT(...) DO UPDATE SET
  col=excluded.col` became `INSERT ... ON DUPLICATE KEY UPDATE
  col=VALUES(col)`.
- **`INSERT OR IGNORE`** became `INSERT IGNORE`.
- **Date functions**: `strftime('%Y', x)` → `YEAR(x)`,
  `strftime('%m', x)` → `DATE_FORMAT(x, '%m')`,
  `date('now')` → `CURDATE()`, etc.
- **Backup/Restore** (`services/backup_service.py`) no longer uses
  SQLite's file-level backup API (there's no MySQL equivalent for
  copying "the database file"). It now shells out to `mysqldump`
  to produce a `.sql` dump inside the backup ZIP, and to the `mysql`
  client to restore one. One real behavioural difference: SQLite's
  restore was a single atomic file swap; a MySQL restore replays the
  dump table-by-table, so a failure partway through can leave some
  tables already replaced. The automatic pre-restore safety backup
  exists specifically to cover that case.
- **Exceptions**: `sqlite3.IntegrityError` / `sqlite3.OperationalError`
  catches became `pymysql.err.IntegrityError` /
  `pymysql.err.OperationalError`.

## 4. Why so many `TEXT` columns became `VARCHAR`

MySQL's `TEXT` type can't have a `DEFAULT` value at all (not even
`CURRENT_TIMESTAMP`), and can't be used in a `UNIQUE` constraint or
index without an explicit prefix length. The old schema used `TEXT`
for almost everything, including short fields like `status`,
`admission_no`, and `created_at`, that had a `DEFAULT` or a `UNIQUE`
constraint. Those became `VARCHAR(n)`. Genuinely free-text fields
with no default/index (`address`, `remarks`, `narration`, `notes`,
etc.) were left as `TEXT`.

## 5. Why timestamps are still `VARCHAR`, not `DATETIME`

The old SQLite schema stored every date/time as plain text
(`'2024-01-31'`, `'2024-01-31 10:22:11'`) and the app does its own
formatting in Python — nothing relies on SQLite's own date type.
Switching these columns to native `DATETIME`/`DATE` would make
PyMySQL return Python `datetime`/`date` objects instead of strings,
which would silently change what `jsonify()` sends to the frontend
(Flask's JSON encoder formats `datetime` very differently from the
app's own `'YYYY-MM-DD'` strings) and could break any JS that slices
or compares those values as strings. To avoid that behavioural
change, timestamp columns stayed `VARCHAR` with an **expression
default** — `created_at VARCHAR(30) DEFAULT (CURRENT_TIMESTAMP)` —
which MySQL evaluates and casts to a string automatically, giving
the exact same `'YYYY-MM-DD HH:MM:SS'` format SQLite produced. This
is why MySQL 8.0.13+ is required (expression defaults on non-numeric
columns are an 8.0.13+ feature).

## 6. Moving existing data out of the old `school.db`

This conversion does **not** include a data-migration script — it
converts the application code, not your existing rows. If you have
real data in the old SQLite file you need to carry over, the
straightforward path is:

```bash
pip install sqlite3-to-mysql
sqlite3mysql -f school.db -d school_erp -u root -h 127.0.0.1
```

(or any equivalent SQLite→MySQL data-transfer tool). Run `init_db()`
first so the target schema exists, review the tool's type mapping
against section 4/5 above, and test against a copy of the database
before pointing it at production data.

## 7. Fees ↔ Accounts integration (merged update)

A later update added automatic ledger posting from the Fees module
(`services/fee_accounting_service.py`, `repositories/fee_payment_posting_repository.py`)
plus soft-delete ("void") for fees and vouchers instead of hard
deletes. It's merged into this MySQL version with the same treatment
as everything else:

- New `fees` columns: `payment_method`, `is_voided`, `voided_reason`,
  `voided_by`, `voided_at` (all added via `_add_column_if_missing`,
  safe on an existing database).
- New `accounts_vouchers` columns: `is_voided`, `voided_reason`,
  `voided_by`, `voided_at`.
- New `fee_payment_postings` table (MySQL DDL, `AUTO_INCREMENT` /
  `DOUBLE` / `ENGINE=InnoDB` as usual).
- 4 new Chart of Accounts seed rows (`4004`–`4007`, per-fee-type
  income accounts) added to the existing `INSERT IGNORE` seed list.
- All new/changed queries (`is_voided` filters, `is_linked_to_fee`)
  use the same `?`-placeholder style as everything else, so they pass
  through the existing `db.execute()` shim unchanged — no new
  MySQL-specific translation was needed for this part.

## 8. Not tested against a live MySQL server

This conversion was done in a sandboxed environment without network
access to a MySQL server, so it's been checked for syntax validity
and consistency (every file compiles, every SQLite-specific pattern
was searched for and converted) but **not actually run against
MySQL**. Please test it against your MySQL instance — start with
`python run.py` against a fresh empty database and click through the
main modules (students, fees, attendance, exams) — before relying on
it, and let me know if anything throws an error so it can be fixed.
