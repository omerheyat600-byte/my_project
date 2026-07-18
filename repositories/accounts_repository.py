"""
Accounts repository — the only layer allowed to talk directly to SQLite
for chart-of-accounts, vouchers and all the reporting views built on top
of them (Cash Book, Bank Book, Ledger, Trial Balance, P&L, Balance Sheet).

Everything reporting-related is derived from a single source of truth —
accounts_voucher_entries (the debit/credit lines) — so Cash Book, Bank
Book, Ledger etc. can never drift out of sync with each other.
"""
from datetime import date

from database import get_db, transaction
from models.account import ChartOfAccount, Voucher, VoucherEntry, NORMAL_DEBIT_TYPES
from repositories.base_repository import BaseRepository


class ChartOfAccountRepository(BaseRepository):
    table = "chart_of_accounts"
    id_column = "id"

    def find_all(self, account_type="", category="", active_only=True, q=""):
        sql = "SELECT * FROM chart_of_accounts WHERE 1=1"
        params = []
        if active_only:
            sql += " AND is_active=1"
        if account_type:
            sql += " AND account_type=?"
            params.append(account_type)
        if category:
            sql += " AND category=?"
            params.append(category)
        if q:
            sql += " AND (name LIKE ? OR code LIKE ?)"
            params.extend([f"%{q}%", f"%{q}%"])
        sql += " ORDER BY code"
        return [dict(r) for r in self._fetchall(sql, params)]

    def find_by_id(self, account_id):
        row = super().find_by_id(account_id)
        return dict(row) if row else None

    def find_by_code(self, code):
        row = self._fetchone("SELECT * FROM chart_of_accounts WHERE code=?", (code,))
        return dict(row) if row else None

    def create(self, account: ChartOfAccount):
        with transaction() as db:
            cursor = db.execute("""
                INSERT INTO chart_of_accounts
                    (code, name, account_type, category, opening_balance, opening_balance_type, is_active, is_system)
                VALUES (?,?,?,?,?,?,?,?)
            """, (
                account.code, account.name, account.account_type, account.category,
                account.opening_balance, account.opening_balance_type,
                1 if account.is_active else 0, 1 if account.is_system else 0,
            ))
            return cursor.lastrowid

    def update(self, account_id, account: ChartOfAccount):
        with transaction() as db:
            db.execute("""
                UPDATE chart_of_accounts SET
                    code=?, name=?, account_type=?, category=?,
                    opening_balance=?, opening_balance_type=?, is_active=?
                WHERE id=?
            """, (
                account.code, account.name, account.account_type, account.category,
                account.opening_balance, account.opening_balance_type,
                1 if account.is_active else 0, account_id,
            ))

    def is_system(self, account_id):
        row = self._fetchone("SELECT is_system FROM chart_of_accounts WHERE id=?", (account_id,))
        return bool(row and row["is_system"])

    def is_in_use(self, account_id):
        row = self._fetchone(
            "SELECT 1 FROM accounts_voucher_entries WHERE account_id=? LIMIT 1", (account_id,)
        )
        return row is not None


class VoucherRepository(BaseRepository):
    table = "accounts_vouchers"
    id_column = "id"

    VOUCHER_PREFIX = {"Journal": "JV", "Payment": "PV", "Receipt": "RV"}

    def generate_voucher_no(self, voucher_type):
        prefix = self.VOUCHER_PREFIX.get(voucher_type, "VC")
        row = self._fetchone(
            "SELECT voucher_no FROM accounts_vouchers WHERE voucher_type=? ORDER BY id DESC LIMIT 1",
            (voucher_type,)
        )
        next_seq = 1
        if row and row["voucher_no"]:
            try:
                next_seq = int(str(row["voucher_no"]).split("-")[-1]) + 1
            except ValueError:
                next_seq = 1
        return f"{prefix}-{next_seq:05d}"

    def find_all(self, voucher_type="", date_from="", date_to="", q="", include_voided=False):
        sql = """
            SELECT * FROM accounts_vouchers WHERE 1=1
        """
        params = []
        if not include_voided:
            sql += " AND (is_voided=0 OR is_voided IS NULL)"
        if voucher_type:
            sql += " AND voucher_type=?"
            params.append(voucher_type)
        if date_from:
            sql += " AND voucher_date>=?"
            params.append(date_from)
        if date_to:
            sql += " AND voucher_date<=?"
            params.append(date_to)
        if q:
            sql += " AND (voucher_no LIKE ? OR party_name LIKE ? OR narration LIKE ? OR reference_no LIKE ?)"
            params.extend([f"%{q}%"] * 4)
        sql += " ORDER BY voucher_date DESC, id DESC"
        return [dict(r) for r in self._fetchall(sql, params)]

    def is_linked_to_fee(self, voucher_id):
        """True if a fee_payment_postings row still points at this voucher
        — i.e. it was auto-posted from a Fee payment and must be voided
        via the fee record (not directly), so the two modules stay in sync."""
        row = self._fetchone(
            "SELECT 1 FROM fee_payment_postings WHERE voucher_id=? LIMIT 1", (voucher_id,)
        )
        return row is not None

    def is_linked_to_expense(self, voucher_id):
        """Same as is_linked_to_fee, but for the Expenses <-> Accounts
        bridge — True if this voucher was auto-posted from an expense
        record and must be reversed via that expense (edit/delete it),
        not voided directly."""
        row = self._fetchone(
            "SELECT 1 FROM expense_payment_postings WHERE voucher_id=? LIMIT 1", (voucher_id,)
        )
        return row is not None

    def find_by_id_with_entries(self, voucher_id):
        voucher_row = self._fetchone("SELECT * FROM accounts_vouchers WHERE id=?", (voucher_id,))
        if not voucher_row:
            return None
        voucher = dict(voucher_row)
        entries = self._fetchall("""
            SELECT ave.*, coa.code AS account_code, coa.name AS account_name
            FROM accounts_voucher_entries ave
            JOIN chart_of_accounts coa ON coa.id = ave.account_id
            WHERE ave.voucher_id=?
            ORDER BY ave.id
        """, (voucher_id,))
        voucher["entries"] = [dict(e) for e in entries]
        return voucher

    def create(self, voucher: Voucher):
        with transaction() as db:
            cursor = db.execute("""
                INSERT INTO accounts_vouchers
                    (voucher_no, voucher_type, voucher_date, party_name, narration, reference_no, total_amount, created_by)
                VALUES (?,?,?,?,?,?,?,?)
            """, (
                voucher.voucher_no, voucher.voucher_type, voucher.voucher_date,
                voucher.party_name, voucher.narration, voucher.reference_no,
                voucher.total_amount, voucher.created_by,
            ))
            voucher_id = cursor.lastrowid
            for entry in voucher.entries:
                db.execute("""
                    INSERT INTO accounts_voucher_entries (voucher_id, account_id, particulars, debit, credit)
                    VALUES (?,?,?,?,?)
                """, (voucher_id, entry.account_id, entry.particulars, entry.debit, entry.credit))
            return voucher_id

    def update(self, voucher_id, voucher: Voucher):
        with transaction() as db:
            db.execute("""
                UPDATE accounts_vouchers SET
                    voucher_date=?, party_name=?, narration=?, reference_no=?, total_amount=?
                WHERE id=?
            """, (
                voucher.voucher_date, voucher.party_name, voucher.narration,
                voucher.reference_no, voucher.total_amount, voucher_id,
            ))
            db.execute("DELETE FROM accounts_voucher_entries WHERE voucher_id=?", (voucher_id,))
            for entry in voucher.entries:
                db.execute("""
                    INSERT INTO accounts_voucher_entries (voucher_id, account_id, particulars, debit, credit)
                    VALUES (?,?,?,?,?)
                """, (voucher_id, entry.account_id, entry.particulars, entry.debit, entry.credit))


class AccountsReportRepository:
    """Read-only aggregation queries powering Cash Book, Bank Book, Ledger,
    Trial Balance, Profit & Loss and Balance Sheet. All dates are plain
    'YYYY-MM-DD' strings, which sort/compare correctly as text in SQLite."""

    def _account(self, account_id):
        db = get_db()
        try:
            row = db.execute("SELECT * FROM chart_of_accounts WHERE id=?", (account_id,)).fetchone()
            return dict(row) if row else None
        finally:
            db.close()

    def _opening_signed(self, account):
        sign = 1 if account["opening_balance_type"] == "Dr" else -1
        return float(account["opening_balance"] or 0) * sign

    def _movements_before(self, account_id, before_date):
        """Net (debit - credit) of all entries strictly before `before_date`."""
        db = get_db()
        try:
            row = db.execute("""
                SELECT COALESCE(SUM(ave.debit),0) d, COALESCE(SUM(ave.credit),0) c
                FROM accounts_voucher_entries ave
                JOIN accounts_vouchers av ON av.id = ave.voucher_id
                WHERE ave.account_id=? AND av.voucher_date < ?
                AND (av.is_voided=0 OR av.is_voided IS NULL)
            """, (account_id, before_date)).fetchone()
            return float(row["d"] or 0) - float(row["c"] or 0)
        finally:
            db.close()

    def _movements_between(self, account_id, date_from=None, date_to=None):
        db = get_db()
        try:
            sql = """
                SELECT COALESCE(SUM(ave.debit),0) d, COALESCE(SUM(ave.credit),0) c
                FROM accounts_voucher_entries ave
                JOIN accounts_vouchers av ON av.id = ave.voucher_id
                WHERE ave.account_id=? AND (av.is_voided=0 OR av.is_voided IS NULL)
            """
            params = [account_id]
            if date_from:
                sql += " AND av.voucher_date>=?"
                params.append(date_from)
            if date_to:
                sql += " AND av.voucher_date<=?"
                params.append(date_to)
            row = db.execute(sql, params).fetchone()
            return float(row["d"] or 0), float(row["c"] or 0)
        finally:
            db.close()

    def account_balance_asof(self, account_id, as_of_date=None):
        """Net signed balance (Dr positive / Cr negative) as of & including
        as_of_date (None = all time)."""
        account = self._account(account_id)
        if not account:
            return 0.0
        opening = self._opening_signed(account)
        d, c = self._movements_between(account_id, None, as_of_date)
        return opening + d - c

    # ---------------- LEDGER (single account, chronological) ----------------
    def ledger(self, account_id, date_from=None, date_to=None):
        account = self._account(account_id)
        if not account:
            return None

        opening_signed = self._opening_signed(account)
        movements_before = self._movements_before(account_id, date_from) if date_from else 0.0
        opening_balance = opening_signed + movements_before

        db = get_db()
        try:
            sql = """
                SELECT av.id AS voucher_id, av.voucher_no, av.voucher_type, av.voucher_date,
                       av.party_name, av.narration, ave.particulars, ave.debit, ave.credit
                FROM accounts_voucher_entries ave
                JOIN accounts_vouchers av ON av.id = ave.voucher_id
                WHERE ave.account_id=? AND (av.is_voided=0 OR av.is_voided IS NULL)
            """
            params = [account_id]
            if date_from:
                sql += " AND av.voucher_date>=?"
                params.append(date_from)
            if date_to:
                sql += " AND av.voucher_date<=?"
                params.append(date_to)
            sql += " ORDER BY av.voucher_date, av.id"
            rows = [dict(r) for r in db.execute(sql, params).fetchall()]
        finally:
            db.close()

        running = opening_balance
        entries = []
        total_debit = 0.0
        total_credit = 0.0
        for r in rows:
            running += float(r["debit"] or 0) - float(r["credit"] or 0)
            total_debit += float(r["debit"] or 0)
            total_credit += float(r["credit"] or 0)
            entries.append({
                **r,
                "balance": round(running, 2),
                "balance_side": "Dr" if running >= 0 else "Cr",
            })

        return {
            "account": account,
            "opening_balance": round(opening_balance, 2),
            "opening_balance_side": "Dr" if opening_balance >= 0 else "Cr",
            "entries": entries,
            "total_debit": round(total_debit, 2),
            "total_credit": round(total_credit, 2),
            "closing_balance": round(running, 2),
            "closing_balance_side": "Dr" if running >= 0 else "Cr",
        }

    # ---------------- CASH BOOK / BANK BOOK (one or more accounts) ----------------
    def _book(self, category, date_from=None, date_to=None, account_id=None):
        db = get_db()
        try:
            sql = "SELECT * FROM chart_of_accounts WHERE category=? AND is_active=1"
            params = [category]
            if account_id:
                sql += " AND id=?"
                params.append(account_id)
            sql += " ORDER BY code"
            accounts = [dict(r) for r in db.execute(sql, params).fetchall()]
        finally:
            db.close()

        books = []
        grand_opening = 0.0
        grand_debit = 0.0
        grand_credit = 0.0
        grand_closing = 0.0
        for acc in accounts:
            ledger_data = self.ledger(acc["id"], date_from, date_to)
            books.append(ledger_data)
            grand_opening += ledger_data["opening_balance"]
            grand_debit += ledger_data["total_debit"]
            grand_credit += ledger_data["total_credit"]
            grand_closing += ledger_data["closing_balance"]

        return {
            "accounts": books,
            "summary": {
                "opening_balance": round(grand_opening, 2),
                "total_receipts": round(grand_debit, 2),
                "total_payments": round(grand_credit, 2),
                "closing_balance": round(grand_closing, 2),
                "closing_balance_side": "Dr" if grand_closing >= 0 else "Cr",
            }
        }

    def cash_book(self, date_from=None, date_to=None, account_id=None):
        return self._book("cash", date_from, date_to, account_id)

    def bank_book(self, date_from=None, date_to=None, account_id=None):
        return self._book("bank", date_from, date_to, account_id)

    def _opening_balance_equity_net(self, accounts):
        """Net signed (Dr positive) contra needed so that accounts carrying
        a manually-entered opening_balance don't throw off the Trial
        Balance / Balance Sheet. Opening balances are single-sided data
        (one column on chart_of_accounts, no counter-entry), so summing
        account_balance_asof() across all accounts alone won't balance
        unless every opening balance was entered in matching Dr/Cr pairs.
        This computes the one-line "Opening Balance Equity" plug that
        would make it balance, WITHOUT posting anything to
        accounts_voucher_entries — it's derived purely from the existing
        opening_balance columns each time a report runs, so it can never
        double-count against movements the way a persisted offsetting
        voucher would.
        """
        total = sum(self._opening_signed(acc) for acc in accounts)
        return -total

    # ---------------- TRIAL BALANCE ----------------
    def trial_balance(self, as_of_date=None):
        db = get_db()
        try:
            accounts = [dict(r) for r in db.execute(
                "SELECT * FROM chart_of_accounts WHERE is_active=1 ORDER BY code"
            ).fetchall()]
        finally:
            db.close()

        rows = []
        total_debit = 0.0
        total_credit = 0.0
        for acc in accounts:
            net = self.account_balance_asof(acc["id"], as_of_date)
            if abs(net) < 0.005:
                debit_bal, credit_bal = 0.0, 0.0
            elif net > 0:
                debit_bal, credit_bal = round(net, 2), 0.0
            else:
                debit_bal, credit_bal = 0.0, round(-net, 2)
            total_debit += debit_bal
            total_credit += credit_bal
            rows.append({
                "account_id": acc["id"], "code": acc["code"], "name": acc["name"],
                "account_type": acc["account_type"],
                "debit_balance": debit_bal, "credit_balance": credit_bal,
            })

        obe_net = self._opening_balance_equity_net(accounts)
        if abs(obe_net) >= 0.005:
            if obe_net > 0:
                obe_debit, obe_credit = round(obe_net, 2), 0.0
            else:
                obe_debit, obe_credit = 0.0, round(-obe_net, 2)
            total_debit += obe_debit
            total_credit += obe_credit
            rows.append({
                "account_id": None, "code": "", "name": "Opening Balance Equity (system)",
                "account_type": "Equity",
                "debit_balance": obe_debit, "credit_balance": obe_credit,
            })

        return {
            "as_of_date": as_of_date,
            "rows": rows,
            "total_debit": round(total_debit, 2),
            "total_credit": round(total_credit, 2),
            "balanced": abs(round(total_debit, 2) - round(total_credit, 2)) < 0.01,
        }

    # ---------------- PROFIT & LOSS ----------------
    def profit_and_loss(self, date_from=None, date_to=None):
        db = get_db()
        try:
            income_accounts = [dict(r) for r in db.execute(
                "SELECT * FROM chart_of_accounts WHERE account_type='Income' AND is_active=1 ORDER BY code"
            ).fetchall()]
            expense_accounts = [dict(r) for r in db.execute(
                "SELECT * FROM chart_of_accounts WHERE account_type='Expense' AND is_active=1 ORDER BY code"
            ).fetchall()]
        finally:
            db.close()

        income_rows = []
        total_income = 0.0
        for acc in income_accounts:
            d, c = self._movements_between(acc["id"], date_from, date_to)
            amount = round(c - d, 2)  # income is normally a credit balance
            if amount:
                total_income += amount
                income_rows.append({"account_id": acc["id"], "code": acc["code"], "name": acc["name"], "amount": amount})

        expense_rows = []
        total_expense = 0.0
        for acc in expense_accounts:
            d, c = self._movements_between(acc["id"], date_from, date_to)
            amount = round(d - c, 2)  # expense is normally a debit balance
            if amount:
                total_expense += amount
                expense_rows.append({"account_id": acc["id"], "code": acc["code"], "name": acc["name"], "amount": amount})

        net_profit = round(total_income - total_expense, 2)
        return {
            "date_from": date_from, "date_to": date_to,
            "income": income_rows, "total_income": round(total_income, 2),
            "expenses": expense_rows, "total_expense": round(total_expense, 2),
            "net_profit": net_profit,
            "result_label": "Net Profit" if net_profit >= 0 else "Net Loss",
        }

    # ---------------- BALANCE SHEET ----------------
    def balance_sheet(self, as_of_date=None):
        db = get_db()
        try:
            accounts = [dict(r) for r in db.execute(
                "SELECT * FROM chart_of_accounts WHERE is_active=1 ORDER BY code"
            ).fetchall()]
        finally:
            db.close()

        assets, liabilities, equity = [], [], []
        total_assets = total_liabilities = total_equity = 0.0

        for acc in accounts:
            net = self.account_balance_asof(acc["id"], as_of_date)
            if acc["account_type"] == "Asset":
                amount = round(net, 2)
                if amount:
                    total_assets += amount
                    assets.append({"account_id": acc["id"], "code": acc["code"], "name": acc["name"], "amount": amount})
            elif acc["account_type"] == "Liability":
                amount = round(-net, 2)  # liabilities normally carry a credit balance
                if amount:
                    total_liabilities += amount
                    liabilities.append({"account_id": acc["id"], "code": acc["code"], "name": acc["name"], "amount": amount})
            elif acc["account_type"] == "Equity":
                amount = round(-net, 2)
                if amount:
                    total_equity += amount
                    equity.append({"account_id": acc["id"], "code": acc["code"], "name": acc["name"], "amount": amount})

        # Roll accumulated net profit/loss (all Income/Expense movement up to
        # as_of_date) into Equity as "Current Period Profit & Loss" so the
        # sheet balances even though profit/loss is never manually posted
        # to Retained Earnings.
        pl = self.profit_and_loss(None, as_of_date)
        if abs(pl["net_profit"]) >= 0.005:
            equity.append({
                "account_id": None, "code": "", "name": "Current Profit & Loss (accumulated)",
                "amount": pl["net_profit"],
            })
            total_equity += pl["net_profit"]

        obe_net = self._opening_balance_equity_net(accounts)
        if abs(obe_net) >= 0.005:
            obe_amount = round(-obe_net, 2)
            equity.append({
                "account_id": None, "code": "", "name": "Opening Balance Equity (system)",
                "amount": obe_amount,
            })
            total_equity += obe_amount

        return {
            "as_of_date": as_of_date,
            "assets": assets, "total_assets": round(total_assets, 2),
            "liabilities": liabilities, "total_liabilities": round(total_liabilities, 2),
            "equity": equity, "total_equity": round(total_equity, 2),
            "total_liabilities_and_equity": round(total_liabilities + total_equity, 2),
            "balanced": abs(round(total_assets, 2) - round(total_liabilities + total_equity, 2)) < 0.01,
        }
