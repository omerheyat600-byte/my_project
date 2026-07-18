"""
Reports / Analytics routes (Blueprint). Thin HTTP layer — all logic
lives in services/report_service.py. Financial data is restricted to
admins since it includes expenses; the other reports are available to
any logged-in viewer-and-above role, matching the rest of the app.
"""
from datetime import date

from flask import Blueprint, request, jsonify, Response

from services.report_service import ReportService
from utils.auth import require_role

reports_bp = Blueprint('reports', __name__)

report_service = ReportService()


def _date_params():
    return request.args.get('start'), request.args.get('end')


@reports_bp.route('/api/reports/enrollment', methods=['GET'])
@require_role('viewer')
def api_reports_enrollment():
    return jsonify(report_service.enrollment_report())


@reports_bp.route('/api/reports/fees', methods=['GET'])
@require_role('viewer')
def api_reports_fees():
    start, end = _date_params()
    return jsonify(report_service.fees_report(start, end))


@reports_bp.route('/api/reports/attendance', methods=['GET'])
@require_role('viewer')
def api_reports_attendance():
    start, end = _date_params()
    return jsonify(report_service.attendance_report(start, end))


@reports_bp.route('/api/reports/academic', methods=['GET'])
@require_role('viewer')
def api_reports_academic():
    exam_id = request.args.get('exam_id', type=int)
    return jsonify(report_service.academic_report(exam_id))


@reports_bp.route('/api/reports/financial', methods=['GET'])
@require_role('accountant')
def api_reports_financial():
    start, end = _date_params()
    return jsonify(report_service.financial_report(start, end))


@reports_bp.route('/api/reports/export/<report_type>', methods=['GET'])
@require_role('viewer')
def api_reports_export(report_type):
    if report_type == 'financial':
        # Contains expense data — enforce the same accountant-level rule
        # used by the on-screen financial report and by expenses/fees routes.
        from flask import session
        from utils.auth import USER_ROLES
        if USER_ROLES.get(session.get('role', 'viewer'), 0) < USER_ROLES.get('accountant', 0):
            return jsonify({"error": "Insufficient permissions"}), 403

    start, end = _date_params()
    exam_id = request.args.get('exam_id', type=int)

    try:
        rows, fieldnames = report_service.export_rows(report_type, start, end, exam_id)
    except ValueError:
        return jsonify({"error": "Unknown report type"}), 400

    csv_data = report_service.rows_to_csv(rows, fieldnames)
    filename = f"{report_type}_report_{date.today().isoformat()}.csv"

    return Response(
        csv_data,
        mimetype='text/csv',
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
