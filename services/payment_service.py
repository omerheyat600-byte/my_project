"""
Payment service — orchestrates the JazzCash Hosted Checkout flow:
initiating a payment against a fee record, and reconciling JazzCash's
callback with that fee once payment completes.
"""
from datetime import datetime

from repositories.payment_repository import PaymentRepository
from repositories.fee_repository import FeeRepository
from services.fee_service import FeeService
from utils import jazzcash
from utils.logger import get_logger

logger = get_logger(__name__)


class PaymentNotFoundError(Exception):
    pass


class FeeAlreadyPaidError(Exception):
    pass


class InvalidCallbackError(Exception):
    pass


class PaymentService:

    def __init__(self, payment_repository: PaymentRepository = None,
                 fee_repository: FeeRepository = None,
                 fee_service: FeeService = None):
        self.payment_repository = payment_repository or PaymentRepository()
        self.fee_repository = fee_repository or FeeRepository()
        self.fee_service = fee_service or FeeService(self.fee_repository)

    def initiate_jazzcash_payment(self, fee_id, student_id):
        """
        Build the Hosted Checkout form fields for a given fee. student_id
        must come from the parent's session (enforced by the route) —
        never trusted from the request body — so a parent can never
        generate a payment link for another family's fee.
        """
        fee_row = self.fee_repository.find_by_id(fee_id)
        if not fee_row:
            raise PaymentNotFoundError("Fee record not found")
        fee = dict(fee_row)

        if str(fee['student_id']) != str(student_id):
            # Don't reveal that the fee_id exists at all to the wrong parent.
            raise PaymentNotFoundError("Fee record not found")

        outstanding = float(fee['amount']) - float(fee['paid_amount'] or 0)
        if outstanding <= 0:
            raise FeeAlreadyPaidError("This fee is already fully paid")

        txn_ref_no = f"EDU{datetime.now().strftime('%Y%m%d%H%M%S')}{fee_id}"
        self.payment_repository.create(fee_id, student_id, txn_ref_no, outstanding)

        fields = jazzcash.build_checkout_fields(
            txn_ref_no=txn_ref_no,
            amount=outstanding,
            bill_reference=f"FEE{fee_id}",
            description=f"{fee.get('fee_type', 'Fee')} - {fee.get('month', '')}".strip(' -'),
        )
        logger.info(f"JazzCash payment initiated: fee_id={fee_id} txn_ref_no={txn_ref_no} amount={outstanding}")

        return {
            "post_url": jazzcash.checkout_url(),
            "fields": fields,
            "txn_ref_no": txn_ref_no,
            "amount": outstanding,
        }

    def handle_jazzcash_callback(self, response_fields):
        """
        Called from the pp_ReturnURL route with whatever JazzCash POSTed
        back. Verifies the secure hash first — an unverified response is
        never trusted, regardless of what pp_ResponseCode claims.
        """
        if not jazzcash.verify_response(response_fields):
            logger.warning(f"JazzCash callback failed hash verification: txn_ref_no={response_fields.get('pp_TxnRefNo')}")
            raise InvalidCallbackError("Response signature verification failed")

        txn_ref_no = response_fields.get("pp_TxnRefNo")
        payment = self.payment_repository.find_by_txn_ref(txn_ref_no)
        if not payment:
            logger.warning(f"JazzCash callback for unknown txn_ref_no={txn_ref_no}")
            raise PaymentNotFoundError("Unknown transaction")

        # Already reconciled (e.g. JazzCash retried the redirect) — don't
        # double-credit the fee.
        if payment['status'] in ('Success', 'Failed'):
            return {
                "success": payment['status'] == 'Success',
                "fee_id": payment['fee_id'],
                "amount": payment['amount'],
                "message": "This payment was already recorded.",
            }

        success = jazzcash.is_success(response_fields)
        status = "Success" if success else "Failed"

        self.payment_repository.update_status(
            txn_ref_no=txn_ref_no,
            status=status,
            gateway_txn_id=response_fields.get("pp_RetreivalReferenceNo") or txn_ref_no,
            response_code=response_fields.get("pp_ResponseCode"),
            response_message=response_fields.get("pp_ResponseMessage"),
            raw_response=response_fields,
        )

        if success:
            fee_row = dict(self.fee_repository.find_by_id(payment['fee_id']))
            new_paid = float(fee_row['paid_amount'] or 0) + float(payment['amount'])
            self.fee_service.update_fee(payment['fee_id'], {
                "student_id": fee_row['student_id'],
                "fee_type": fee_row['fee_type'],
                "month": fee_row['month'],
                "amount": fee_row['amount'],
                "paid_amount": new_paid,
                "due_date": fee_row['due_date'],
                "paid_date": datetime.now().strftime('%Y-%m-%d'),
            })
            logger.info(f"JazzCash payment succeeded: txn_ref_no={txn_ref_no} fee_id={payment['fee_id']}")
        else:
            logger.info(
                f"JazzCash payment failed: txn_ref_no={txn_ref_no} "
                f"code={response_fields.get('pp_ResponseCode')}"
            )

        return {
            "success": success,
            "fee_id": payment['fee_id'],
            "amount": payment['amount'],
            "message": response_fields.get("pp_ResponseMessage", ""),
        }
