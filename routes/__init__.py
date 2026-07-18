"""
Central place to register all Blueprints with the Flask app.
"""
from routes.students import students_bp
from routes.teachers import teachers_bp
from routes.classes import classes_bp
from routes.results import results_bp
from routes.fees import fees_bp
from routes.expenses import expenses_bp
from routes.auth import auth_bp
from routes.users import users_bp
from routes.dashboard import dashboard_bp
from routes.settings import settings_bp
from routes.attendance import attendance_bp
from routes.timetable import timetable_bp
from routes.search import search_bp
from routes.notifications import notifications_bp
from routes.reports import reports_bp
from routes.parent_auth import parent_auth_bp
from routes.parent_portal import parent_portal_bp
from routes.parent_accounts import parent_accounts_bp
from routes.library import library_bp
from routes.staff_attendance import staff_attendance_bp
from routes.backup import backup_bp
from routes.admissions import admissions_bp
from routes.exams import exams_bp
from routes.accounts import accounts_bp
from routes.inventory import inventory_bp
from routes.ai_paper import ai_paper_bp
from routes.remarks import remarks_bp
from routes.timetable_ai import timetable_ai_bp
from routes.lesson_plan import lesson_plan_bp
from routes.performance import performance_bp
from routes.fee_prediction import fee_prediction_bp
from routes.attendance_risk import attendance_risk_bp
from routes.hr import hr_bp
from routes.promotions import promotions_bp
from routes.import_data import import_bp


def register_routes(app):
    app.register_blueprint(students_bp)
    app.register_blueprint(teachers_bp)
    app.register_blueprint(classes_bp)
    app.register_blueprint(results_bp)
    app.register_blueprint(fees_bp)
    app.register_blueprint(expenses_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(attendance_bp)
    app.register_blueprint(timetable_bp)
    app.register_blueprint(search_bp)
    app.register_blueprint(notifications_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(parent_auth_bp)
    app.register_blueprint(parent_portal_bp)
    app.register_blueprint(parent_accounts_bp)
    app.register_blueprint(library_bp)
    app.register_blueprint(staff_attendance_bp)
    app.register_blueprint(backup_bp)
    app.register_blueprint(admissions_bp)
    app.register_blueprint(exams_bp)
    app.register_blueprint(accounts_bp)
    app.register_blueprint(inventory_bp)
    app.register_blueprint(ai_paper_bp)
    app.register_blueprint(remarks_bp)
    app.register_blueprint(timetable_ai_bp)
    app.register_blueprint(lesson_plan_bp)
    app.register_blueprint(performance_bp)
    app.register_blueprint(fee_prediction_bp)
    app.register_blueprint(attendance_risk_bp)
    app.register_blueprint(hr_bp)
    app.register_blueprint(promotions_bp)
    app.register_blueprint(import_bp)
