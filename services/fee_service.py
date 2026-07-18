"""
Fee service — business logic for fee records, monthly generation,
carry-forward of unpaid balances, reporting, and voucher building.
"""
from datetime import datetime

from models.fee import Fee
from repositories.fee_repository import FeeRepository
from repositories.settings_repository import SettingsRepository
from services.charity_fund_service import CharityFundService
from services.fee_accounting_service import FeeAccountingService
from utils.fee_calc import calculate_fee_status, calculate_net_amount, calculate_late_fine
from utils.validators import validate_fee_payload
from utils.logger import get_logger

logger = get_logger(__name__)

DEFAULT_FINE_PER_DAY = 10          # PKR per day overdue, past the grace period
DEFAULT_FINE_GRACE_DAYS = 5        # days after due_date before a fine starts accruing


class FeeNotFoundError(Exception):
    pass


class FeeValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("; ".join(errors))


class ClassNotFoundForFeesError(Exception):
    pass


class FeeService:

    def __init__(self, repository: FeeRepository, settings_repository: SettingsRepository = None,
                 charity_fund_service: CharityFundService = None,
                 fee_accounting_service: FeeAccountingService = None):
        self.repository = repository
        self.settings_repository = settings_repository or SettingsRepository()
        self.charity_fund_service = charity_fund_service or CharityFundService()
        self.fee_accounting_service = fee_accounting_service

    # ---------- Fee <-> Accounts sync ----------

    def _sync_accounting(self, fid, created_by=None):
        """Posts (or reverses) the ledger delta for this fee's current
        paid_amount. No-op if no FeeAccountingService was wired in (e.g.
        older callers/tests that don't need Accounts integration)."""
        if not self.fee_accounting_service:
            return
        fresh = self.repository.find_by_id(fid)
        if fresh:
            self.fee_accounting_service.sync_fee_payment(fresh, created_by)

    def sync_all_to_accounts(self, created_by=None):
        """
        One-time / on-demand backfill for fees that were created/updated
        before the Accounts integration existed (or while it was
        misconfigured). Safe to run anytime — already-posted fees are
        untouched since their delta is 0.
        """
        if not self.fee_accounting_service:
            return 0
        all_fees = self.repository.find_all()
        return self.fee_accounting_service.sync_all(all_fees, created_by)



    def _maybe_credit_fine_to_charity(self, fid, created_by=None):
        """
        If this fee's late fine has been fully paid off (status is
        'Paid' and it carries a fine) and hasn't already been credited,
        credit the fine amount to the Charity Fund and mark it so a
        later edit of the same fee can never credit it twice.
        """
        fee = self.repository.find_by_id(fid)
        if not fee:
            return
        fine_amount = fee.get('fine_amount') or 0
        if fine_amount <= 0 or fee.get('status') != 'Paid':
            return
        if self.repository.is_fine_credited(fid):
            return
        self.charity_fund_service.credit_fine(fid, fine_amount, created_by)
        self.repository.mark_fine_credited(fid)

    # ---------- Fine settings (editable rate/grace period) ----------

    def get_fine_per_day(self):
        try:
            return float(self.settings_repository.get_setting('fee_fine_per_day', str(DEFAULT_FINE_PER_DAY)))
        except (TypeError, ValueError):
            return DEFAULT_FINE_PER_DAY

    def get_fine_grace_days(self):
        try:
            return int(self.settings_repository.get_setting('fee_fine_grace_days', str(DEFAULT_FINE_GRACE_DAYS)))
        except (TypeError, ValueError):
            return DEFAULT_FINE_GRACE_DAYS

    def get_fine_settings(self):
        return {
            "fine_per_day": self.get_fine_per_day(),
            "grace_days": self.get_fine_grace_days(),
        }

    def update_fine_settings(self, data):
        try:
            fine_per_day = float(data.get('fine_per_day', DEFAULT_FINE_PER_DAY))
            grace_days = int(data.get('grace_days', DEFAULT_FINE_GRACE_DAYS))
        except (TypeError, ValueError):
            raise FeeValidationError(["fine_per_day must be a number and grace_days must be an integer"])

        if fine_per_day < 0 or grace_days < 0:
            raise FeeValidationError(["fine_per_day and grace_days cannot be negative"])

        self.settings_repository.set_setting('fee_fine_per_day', str(fine_per_day))
        self.settings_repository.set_setting('fee_fine_grace_days', str(grace_days))
        logger.info(f"Fee fine settings updated: fine_per_day={fine_per_day}, grace_days={grace_days}")
        return self.get_fine_settings()

    # ---------- CRUD ----------

    def create_fees(self, payload, created_by=None):
        """
        Accepts either a single fee dict or a list of fee dicts (the
        original endpoint supported both for backward compatibility).
        All records are created atomically.
        """
        fee_items = payload if isinstance(payload, list) else [payload]

        fees = []
        for item in fee_items:
            student_id = item.get('student_id')
            if not student_id:
                continue

            errors = validate_fee_payload(item)
            if errors:
                logger.warning(f"Fee validation failed: {errors} | payload={item}")
                raise FeeValidationError(errors)

            amount = float(item.get('amount', 0))
            paid = float(item.get('paid_amount', 0))
            discount_amount = float(item.get('discount_amount', 0) or 0)
            discount_reason = (item.get('discount_reason') or '').strip() or None
            fine_amount = float(item.get('fine_amount', 0) or 0)
            payment_method = (item.get('payment_method') or 'Cash').strip() or 'Cash'
            student_name = self.repository.find_student_name(student_id)
            net_amount = calculate_net_amount(amount, discount_amount, fine_amount)
            status = calculate_fee_status(net_amount, paid)

            fees.append(Fee(
                id=None,
                student_id=student_id,
                student_name=student_name,
                fee_type=item.get('fee_type', 'Tuition Fee'),
                month=item.get('month'),
                amount=amount,
                paid_amount=paid,
                status=status,
                due_date=item.get('due_date'),
                paid_date=item.get('paid_date'),
                discount_amount=discount_amount,
                discount_reason=discount_reason,
                fine_amount=fine_amount,
                payment_method=payment_method,
            ))

        created_ids = self.repository.create_many(fees)
        logger.info(f"Fee record(s) created: {created_ids}")

        for fid in created_ids:
            self._maybe_credit_fine_to_charity(fid, created_by)
            self._sync_accounting(fid, created_by)

        return created_ids

    def update_fee(self, fid, data, created_by=None):
        errors = validate_fee_payload(data)
        if errors:
            logger.warning(f"Fee validation failed on update: {errors} | id={fid}")
            raise FeeValidationError(errors)

        if not self.repository.exists(fid):
            logger.warning(f"Fee update failed — not found: {fid}")
            raise FeeNotFoundError("Fee record not found")

        amount = float(data.get('amount', 0))
        paid = float(data.get('paid_amount', 0))
        discount_amount = float(data.get('discount_amount', 0) or 0)
        discount_reason = (data.get('discount_reason') or '').strip() or None
        fine_amount = float(data.get('fine_amount', 0) or 0)
        payment_method = (data.get('payment_method') or 'Cash').strip() or 'Cash'
        student_name = self.repository.find_student_name(data.get('student_id'))
        net_amount = calculate_net_amount(amount, discount_amount, fine_amount)
        status = calculate_fee_status(net_amount, paid)

        fee = Fee(
            id=fid,
            student_id=data.get('student_id'),
            student_name=student_name,
            fee_type=data.get('fee_type'),
            month=data.get('month'),
            amount=amount,
            paid_amount=paid,
            status=status,
            due_date=data.get('due_date'),
            paid_date=data.get('paid_date'),
            discount_amount=discount_amount,
            discount_reason=discount_reason,
            fine_amount=fine_amount,
            payment_method=payment_method,
        )
        self.repository.update(fid, fee)
        logger.info(f"Fee updated: {fid}")

        self._maybe_credit_fine_to_charity(fid, created_by)
        self._sync_accounting(fid, created_by)

    def void_fee(self, fid, reason=None, created_by=None):
        """
        Soft-delete a fee record: marks it voided instead of removing it,
        so the record (who paid what, when) is never actually lost —
        only excluded from active lists/reports going forward. Any
        already-posted ledger amount is reversed first (same as before),
        so Accounts and Fees stay in sync.
        """
        if not self.repository.exists(fid):
            logger.warning(f"Fee void failed — not found: {fid}")
            raise FeeNotFoundError("Fee record not found")
        fee = self.repository.find_by_id(fid)
        if self.fee_accounting_service:
            self.fee_accounting_service.reverse_fee(fee, created_by)
        self.repository.void(fid, reason, created_by)
        logger.info(f"Fee voided: {fid} (reason={reason!r})")

    def list_fees(self, query="", status_filter="", include_voided=False):
        fees = self.repository.find_all(query, status_filter, include_voided)

        total = 0
        collected = 0
        pending = 0
        for fee in fees:
            net_amount = calculate_net_amount(
                fee.get("amount"), fee.get("discount_amount"), fee.get("fine_amount")
            )
            paid = float(fee.get("paid_amount") or 0)
            status = fee.get("status", "Pending")

            total += net_amount
            collected += paid
            if status != 'Paid':
                pending += (net_amount - paid)

        students = self.repository.find_all_students()

        return {
            "fees": fees,
            "total": total,
            "collected": collected,
            "pending": pending,
            "students": students,
        }

    # ---------- Recurring fees ----------

    def generate_monthly_fees(self):
        students = self.repository.find_active_students()
        current_month = datetime.now().strftime('%B')
        current_year = datetime.now().year
        due_date = datetime.now().replace(day=28).strftime('%Y-%m-%d')

        rows = []
        for student in students:
            existing = self.repository.find_existing_fee_for_month(
                student['id'], current_month, current_year
            )
            if not existing:
                rows.append((student['id'], student['name'], due_date, current_month))

        generated = self.repository.bulk_insert_generated(rows)
        logger.info(f"Monthly fees generated: {generated} record(s) for {current_month} {current_year}")
        return generated

    def carry_forward_fees(self):
        students = self.repository.find_students_with_unpaid_fees()
        current_month = datetime.now().strftime('%B')
        current_year = datetime.now().year
        due_date = datetime.now().replace(day=28).strftime('%Y-%m-%d')

        rows = []
        for student in students:
            existing = self.repository.find_existing_fee_for_month(
                student['student_id'], current_month, current_year
            )
            if existing:
                continue

            unpaid = self.repository.find_total_unpaid(student['student_id'])
            if unpaid and unpaid > 0:
                rows.append((
                    student['student_id'], student['student_name'],
                    unpaid, due_date, current_month
                ))

        added = self.repository.bulk_insert_carry_forward(rows)
        logger.info(f"Carried forward {added} unpaid fee balance(s)")
        return added

    def recalculate_fines(self):
        """
        Scan all unpaid/partial fees with a due date and (re)calculate
        their late fine based on days overdue past the grace period, using
        the fine rate configured in Fine Settings. Triggered manually
        (mirrors the existing 'Generate' / 'Carry Forward' action buttons)
        so fines don't silently change amounts already shown to a parent.
        """
        fine_per_day = self.get_fine_per_day()
        grace_days = self.get_fine_grace_days()

        fees = self.repository.find_overdue_unpaid()
        updated = 0
        total_fine_added = 0

        for fee in fees:
            new_fine = calculate_late_fine(fee.get('due_date'), fine_per_day, grace_days)
            if new_fine == (fee.get('fine_amount') or 0):
                continue

            net_amount = calculate_net_amount(fee['amount'], fee.get('discount_amount'), new_fine)
            status = calculate_fee_status(net_amount, fee.get('paid_amount') or 0)
            self.repository.update_fine(fee['id'], new_fine, status)
            total_fine_added += (new_fine - (fee.get('fine_amount') or 0))
            updated += 1

        logger.info(f"Late fines recalculated: {updated} record(s) updated")
        return {"updated": updated, "total_fine_added": round(total_fine_added, 2)}

    # ---------- Reporting ----------

    def get_fees_report(self, month="", year="", class_name="", student_id="", status="", include_voided=False):
        fees = self.repository.find_report(month, year, class_name, student_id, status, include_voided)

        total_amount = sum(calculate_net_amount(f['amount'], f.get('discount_amount'), f.get('fine_amount')) for f in fees)
        total_paid = sum(f['paid_amount'] for f in fees)
        total_unpaid = total_amount - total_paid

        return {
            "fees": fees,
            "summary": {
                "total_amount": total_amount,
                "total_paid": total_paid,
                "total_unpaid": total_unpaid,
                "count": len(fees),
            }
        }

    # ---------- Vouchers ----------

    def _build_voucher(self, student, fees, month, year):
        """
        Shared voucher-building logic used by both the single-student
        voucher endpoint and the bulk class-voucher endpoint (previously
        duplicated verbatim in both routes).
        """
        previous_pending = 0
        current_fees = []
        total_current_amount = 0
        total_current_paid = 0

        for f in fees:
            f_year = ''
            if f['due_date']:
                try:
                    f_year = str(datetime.strptime(f['due_date'], '%Y-%m-%d').year)
                except ValueError:
                    f_year = year

            net_amount = calculate_net_amount(f['amount'], f.get('discount_amount'), f.get('fine_amount'))

            if f['month'] == month and f_year == year:
                current_fees.append({
                    'fee_type': f['fee_type'],
                    'amount': f['amount'],
                    'discount_amount': f.get('discount_amount') or 0,
                    'discount_reason': f.get('discount_reason'),
                    'fine_amount': f.get('fine_amount') or 0,
                    'net_amount': net_amount,
                    'paid_amount': f['paid_amount'],
                    'status': f['status'],
                    'due_date': f['due_date']
                })
                total_current_amount += net_amount
                total_current_paid += f['paid_amount']
            else:
                if f['status'] != 'Paid':
                    previous_pending += (net_amount - f['paid_amount'])

        total_due = previous_pending + total_current_amount
        balance = total_due - total_current_paid
        status = 'Paid' if balance <= 0 else ('Partial' if total_current_paid > 0 else 'Pending')

        return {
            'student': student,
            'previous_pending': previous_pending,
            'current_fees': current_fees,
            'total_due': total_due,
            'total_paid': total_current_paid,
            'balance': balance,
            'status': status,
        }

    def get_student_voucher(self, student_id, month, year=None):
        year = year or str(datetime.now().year)

        if not month:
            raise FeeValidationError(["Month is required"])

        student = self.repository.find_student(student_id)
        if not student:
            raise FeeNotFoundError("Student not found")

        fees = self.repository.find_fees_for_student(student_id)
        voucher = self._build_voucher(student, fees, month, year)
        voucher['month'] = month
        voucher['year'] = year
        return voucher

    def get_bulk_vouchers(self, class_name, month, year=None):
        year = year or str(datetime.now().year)

        if not class_name or not month:
            raise FeeValidationError(["class_name and month required"])

        students = self.repository.find_students_by_grade(class_name)
        if not students:
            raise ClassNotFoundForFeesError("No students found for this class")

        vouchers = []
        for student in students:
            fees = self.repository.find_fees_for_student(student['id'])
            vouchers.append(self._build_voucher(student, fees, month, year))

        return {
            'class_name': class_name,
            'month': month,
            'year': year,
            'vouchers': vouchers,
        }
