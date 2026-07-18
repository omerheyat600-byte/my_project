"""
Payment routes (Blueprint) — JazzCash Hosted Checkout flow.

/initiate is parent-authenticated: student_id is pulled from the
parent session exactly like every other Parent Portal route, never
from the request body (see PaymentService.initiate_jazzcash_payment).

/callback is the pp_ReturnURL JazzCash redirects the parent's browser
to after payment. It's intentionally NOT behind @require_parent_login
— by the time JazzCash redirects here, we verify authenticity via the
HMAC secure hash instead of a session cookie, since a lost session
(e.g. an in-app browser clearing cookies mid-redirect) shouldn't be
able to leave a real payment unrecorded.
"""
from flask import Blueprint, request, session, render_template_string

from services.payment_service import (
    PaymentService,
    PaymentNotFoundError,
    FeeAlreadyPaidError,
    InvalidCallbackError,
)
from utils.auth import require_parent_login
from utils.response import success_response, error_response
from utils.logger import get_logger

payments_bp = Blueprint('payments', __name__)
payment_service = PaymentService()
logger = get_logger(__name__)


@payments_bp.route('/api/payments/jazzcash/initiate', methods=['POST'])
@require_parent_login
def api_initiate_jazzcash_payment():
    data = request.json or {}
    fee_id = data.get('fee_id')
    if not fee_id:
        return error_response("fee_id is required", status=400)

    student_id = session.get('parent_student_id')
    try:
        result = payment_service.initiate_jazzcash_payment(fee_id, student_id)
        return success_response(result)
    except PaymentNotFoundError as e:
        return error_response(str(e), status=404)
    except FeeAlreadyPaidError as e:
        return error_response(str(e), status=400)
    except Exception as e:
        logger.error(f"JazzCash initiate failed: {e}")
        return error_response("Could not start payment", status=500)


@payments_bp.route('/api/payments/jazzcash/callback', methods=['POST', 'GET'])
def api_jazzcash_callback():
    # JazzCash posts form-encoded fields here after the parent completes
    # (or abandons/fails) payment on their hosted page.
    response_fields = request.form.to_dict() if request.method == 'POST' else request.args.to_dict()

    try:
        result = payment_service.handle_jazzcash_callback(response_fields)
    except InvalidCallbackError:
        return render_template_string(
            CALLBACK_PAGE, success=False, message="Could not verify this payment response."
        ), 400
    except PaymentNotFoundError:
        return render_template_string(
            CALLBACK_PAGE, success=False, message="Transaction not recognized."
        ), 404
    except Exception as e:
        logger.error(f"JazzCash callback error: {e}")
        return render_template_string(
            CALLBACK_PAGE, success=False, message="Something went wrong recording this payment."
        ), 500

    return render_template_string(
        CALLBACK_PAGE,
        success=result['success'],
        message=result['message'] or ('Payment received.' if result['success'] else 'Payment was not successful.'),
    )


# Minimal, self-contained confirmation page — the parent's browser lands
# here straight from JazzCash, so it can't assume the Parent Portal's own
# JS/CSS bundle is loaded. Auto-redirects back into the portal.
CALLBACK_PAGE = """
<!DOCTYPE html>
<html>
<head>
    <title>{{ 'Payment Successful' if success else 'Payment Status' }}</title>
    <meta http-equiv="refresh" content="4;url=/parent-portal">
    <style>
        body { font-family: Arial, sans-serif; display:flex; align-items:center; justify-content:center;
               height:100vh; margin:0; background:#f3f4f6; }
        .card { background:#fff; border-radius:12px; padding:36px 44px; text-align:center;
                box-shadow:0 4px 20px rgba(0,0,0,0.08); max-width:360px; }
        .icon { font-size:48px; margin-bottom:12px; }
        h2 { margin:0 0 8px; color:{{ '#16a34a' if success else '#dc2626' }}; }
        p { color:#555; margin:0 0 18px; }
        a { color:#3b82f6; text-decoration:none; font-weight:600; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">{{ '✅' if success else '⚠️' }}</div>
        <h2>{{ 'Payment Successful' if success else 'Payment Not Completed' }}</h2>
        <p>{{ message }}</p>
        <a href="/parent-portal">Return to Parent Portal</a>
    </div>
</body>
</html>
"""
