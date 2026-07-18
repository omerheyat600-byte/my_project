"""
Notification routes (Blueprint). Thin HTTP layer — all logic lives in
services/notification_service.py.
"""
from flask import Blueprint, request

from repositories.notification_repository import NotificationRepository
from repositories.fee_repository import FeeRepository
from services.notification_service import NotificationService, NotificationValidationError
from utils.auth import require_role
from utils.response import success_response, error_response

notifications_bp = Blueprint('notifications', __name__)

notification_repository = NotificationRepository()
fee_repository = FeeRepository()
notification_service = NotificationService(notification_repository, fee_repository)


@notifications_bp.route('/api/notifications/history', methods=['GET'])
@require_role('viewer')
def api_get_history():
    status = request.args.get('status', '').strip()
    related_to = request.args.get('related_to', '').strip()
    q = request.args.get('q', '').strip()
    page = request.args.get('page', '1').strip()
    per_page = request.args.get('per_page', '25').strip()

    try:
        result = notification_service.get_history(status, related_to, q, page, per_page)
        return success_response(result)
    except NotificationValidationError as e:
        return error_response(str(e), status=400)


@notifications_bp.route('/api/notifications/stats', methods=['GET'])
@require_role('viewer')
def api_get_stats():
    return success_response(notification_service.get_stats())


@notifications_bp.route('/api/notifications/send', methods=['POST'])
@require_role('teacher')
def api_send_manual():
    data = request.json or {}
    try:
        result = notification_service.send_manual(data.get('student_id'), data.get('message'))
    except NotificationValidationError as e:
        return error_response(str(e), status=400)

    if result['status'] == 'sent':
        return success_response(result, message="Message sent successfully")
    return error_response(f"SMS failed: {result.get('error') or 'unknown error'}", status=502, data=result)


@notifications_bp.route('/api/notifications/fee-reminders/preview', methods=['GET'])
@require_role('accountant')
def api_preview_fee_reminders():
    class_name = request.args.get('class_name', '').strip()
    return success_response(notification_service.preview_fee_reminders(class_name))


@notifications_bp.route('/api/notifications/fee-reminders/send', methods=['POST'])
@require_role('accountant')
def api_send_fee_reminders():
    data = request.json or {}
    student_ids = data.get('student_ids')
    class_name = (data.get('class_name') or '').strip()

    try:
        result = notification_service.send_fee_reminders(student_ids, class_name)
    except NotificationValidationError as e:
        return error_response(str(e), status=400)

    return success_response(
        result,
        message=f"{result['sent']} reminder(s) sent, {result['failed']} failed, {result['skipped']} skipped"
    )
