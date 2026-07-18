"""
Fee Prediction — service layer (AI Tools).

Money is involved, so — same principle as Timetable and Performance
Analysis — every number here (risk score, outstanding balance,
predicted collection rate) is computed deterministically from real
fee records. AI (when configured) only adds a short narrative
describing the computed numbers; it is never asked to produce a risk
score or a rupee amount itself.

Risk scoring is a simple, explainable rule (not a black box): it
looks at how often a student's fee was paid late or left unpaid past
its due date historically, plus whether they currently have an
overdue balance.
"""
from datetime import date

from repositories.fee_prediction_repository import FeePredictionRepository
from repositories.settings_repository import SettingsRepository
from utils.ai_client import call_ai, is_configured, AIProviderNotConfiguredError, AIProviderError
from utils.logger import get_logger

logger = get_logger(__name__)


class FeePredictionStudentNotFoundError(Exception):
    pass


class FeePredictionService:

    def __init__(self, repository: FeePredictionRepository, settings_repository: SettingsRepository):
        self.repository = repository
        self.settings_repository = settings_repository

    # ==========================================================
    # SCHOOL-WIDE / CLASS-WIDE
    # ==========================================================

    def analyze_class(self, class_name=None, mode="auto"):
        history = self.repository.find_all_fee_history(class_name)
        if not history:
            return {"has_data": False, "message": "No fee records found."}

        by_student = {}
        for row in history:
            by_student.setdefault(row["student_id"], {"name": row["student_name"], "grade": row["grade"], "records": []})
            by_student[row["student_id"]]["records"].append(row)

        student_risks = [
            self._score_student(sid, info["name"], info["grade"], info["records"])
            for sid, info in by_student.items()
        ]
        student_risks.sort(key=lambda r: r["risk_score"], reverse=True)

        overall = self._build_overall_stats(student_risks, history)
        narrative, used_mode, warning = self._get_narrative(mode, overall, student_risks, student_id=None)

        result = {
            "has_data": True,
            "class_name": class_name,
            "overall": overall,
            "students": student_risks,
            "narrative": narrative,
            "generation_mode_used": used_mode,
        }
        if warning:
            result["warning"] = warning
        return result

    # ==========================================================
    # SINGLE STUDENT
    # ==========================================================

    def analyze_student(self, student_id, mode="auto"):
        student = self.repository.find_student_name_grade(student_id)
        if not student:
            raise FeePredictionStudentNotFoundError("Student not found")

        records = self.repository.find_fee_history_for_student(student_id)
        if not records:
            return {"has_data": False, "student_id": student_id, "student_name": student["name"],
                     "message": "No fee records found for this student yet."}

        risk = self._score_student(student_id, student["name"], student["grade"], records)
        narrative, used_mode, warning = self._get_narrative(mode, None, [risk], student_id=student_id)

        result = {
            "has_data": True,
            "student": risk,
            "narrative": narrative,
            "generation_mode_used": used_mode,
        }
        if warning:
            result["warning"] = warning
        return result

    # ==========================================================
    # RISK SCORING (deterministic)
    # ==========================================================

    def _score_student(self, student_id, name, grade, records):
        today = date.today().isoformat()

        paid_on_time = paid_late = unpaid_overdue = unpaid_not_due = 0
        current_outstanding = 0.0
        billed_total = 0.0

        for r in records:
            net = (r["amount"] or 0) - (r["discount_amount"] or 0) + (r["fine_amount"] or 0)
            paid = r["paid_amount"] or 0
            balance = net - paid
            billed_total += net
            is_paid = (r["status"] == "Paid") or balance <= 0.01

            if is_paid:
                if r["paid_date"] and r["due_date"] and r["paid_date"] > r["due_date"]:
                    paid_late += 1
                else:
                    paid_on_time += 1
            else:
                if r["due_date"] and r["due_date"] < today:
                    unpaid_overdue += 1
                    current_outstanding += balance
                else:
                    unpaid_not_due += 1

        billed_history = paid_on_time + paid_late + unpaid_overdue  # excludes not-yet-due
        problem_count = paid_late + unpaid_overdue
        problem_rate = (problem_count / billed_history) if billed_history else 0

        avg_monthly_fee = (billed_total / len(records)) if records else 0
        overdue_multiple = (current_outstanding / avg_monthly_fee) if avg_monthly_fee else 0

        risk_score = round(min(100, problem_rate * 70 + min(overdue_multiple, 3) * 10))

        if risk_score >= 50 or overdue_multiple >= 2:
            risk_level = "high"
        elif risk_score >= 20 or unpaid_overdue > 0:
            risk_level = "medium"
        else:
            risk_level = "low"

        return {
            "student_id": student_id,
            "student_name": name,
            "grade": grade,
            "months_billed": len(records),
            "paid_on_time": paid_on_time,
            "paid_late": paid_late,
            "unpaid_overdue": unpaid_overdue,
            "current_outstanding": round(current_outstanding, 2),
            "risk_score": risk_score,
            "risk_level": risk_level,
            "likely_to_default_next_month": risk_level in ("high", "medium") and (unpaid_overdue > 0 or paid_late > 0),
        }

    def _build_overall_stats(self, student_risks, history):
        total_students = len(student_risks)
        high = sum(1 for r in student_risks if r["risk_level"] == "high")
        medium = sum(1 for r in student_risks if r["risk_level"] == "medium")
        low = total_students - high - medium
        total_outstanding = round(sum(r["current_outstanding"] for r in student_risks), 2)

        paid_records = [r for r in history if r["status"] == "Paid" or ((r["amount"] or 0) - (r["discount_amount"] or 0) + (r["fine_amount"] or 0) - (r["paid_amount"] or 0)) <= 0.01]
        collection_rate = round((len(paid_records) / len(history)) * 100, 1) if history else 0

        return {
            "total_students": total_students,
            "high_risk_count": high,
            "medium_risk_count": medium,
            "low_risk_count": low,
            "total_outstanding": total_outstanding,
            "historical_collection_rate_pct": collection_rate,
            "predicted_next_month_collection_rate_pct": collection_rate,  # best estimate = historical rate, stated plainly as such
        }

    # ==========================================================
    # NARRATIVE (AI or offline — describes the numbers, never invents them)
    # ==========================================================

    def _get_narrative(self, mode, overall, student_risks, student_id):
        mode = (mode or "auto").strip().lower()
        warning = None
        if mode == "offline":
            return self._offline_narrative(overall, student_risks, student_id), "offline", None
        if mode == "ai":
            return self._ai_narrative(overall, student_risks, student_id), "ai", None

        if is_configured(self.settings_repository):
            try:
                return self._ai_narrative(overall, student_risks, student_id), "ai", None
            except (AIProviderNotConfiguredError, AIProviderError) as e:
                logger.warning(f"AI fee-risk narrative failed, falling back to offline: {e}")
                warning = f"AI narrative failed ({e}); used the offline summary instead."
                return self._offline_narrative(overall, student_risks, student_id), "offline", warning
        else:
            warning = "No AI provider is configured in Settings — used the offline summary."
            return self._offline_narrative(overall, student_risks, student_id), "offline", warning

    def _ai_narrative(self, overall, student_risks, student_id):
        if student_id:
            r = student_risks[0]
            prompt = f"""Summarize this student's fee payment reliability in 2-3 sentences for a school administrator.

Student: {r['student_name']} ({r['grade']})
Months billed: {r['months_billed']}
Paid on time: {r['paid_on_time']}, Paid late: {r['paid_late']}, Currently overdue/unpaid: {r['unpaid_overdue']}
Current outstanding balance: Rs. {r['current_outstanding']}
Risk level: {r['risk_level']}

Only state facts supported by the numbers above. Do not invent reasons for late payment. End with one practical, respectful suggestion for the school (e.g. a reminder call, a payment plan) if risk level is medium or high."""
        else:
            top = student_risks[:5]
            top_lines = "\n".join(f"- {s['student_name']} ({s['grade']}): risk {s['risk_level']}, outstanding Rs. {s['current_outstanding']}" for s in top)
            prompt = f"""Summarize this school's fee collection risk picture in 3-4 sentences for an administrator.

Total students analyzed: {overall['total_students']}
High risk: {overall['high_risk_count']}, Medium risk: {overall['medium_risk_count']}, Low risk: {overall['low_risk_count']}
Total currently outstanding: Rs. {overall['total_outstanding']}
Historical collection rate: {overall['historical_collection_rate_pct']}%

Top at-risk students:
{top_lines}

Only state facts supported by the numbers above. Do not invent reasons for non-payment. Mention the collection rate, the scale of high-risk students, and one practical, respectful next step (e.g. reminders, payment plans for high-risk families)."""

        raw = call_ai(
            self.settings_repository,
            prompt,
            system="You are a careful, respectful school administrator. You only report what the data shows, and you never assume bad intent behind late payment.",
            max_tokens=350,
        )
        return raw.strip()

    def _offline_narrative(self, overall, student_risks, student_id):
        if student_id:
            r = student_risks[0]
            if r["risk_level"] == "high":
                base = f"{r['student_name']} has a high fee payment risk: {r['paid_late']} late payment(s) and {r['unpaid_overdue']} currently overdue, with an outstanding balance of Rs. {r['current_outstanding']}."
                suggestion = " A reminder call or a payment plan conversation is recommended."
            elif r["risk_level"] == "medium":
                base = f"{r['student_name']} has a moderate fee payment risk, with {r['paid_late']} late payment(s) on record and a current outstanding balance of Rs. {r['current_outstanding']}."
                suggestion = " A friendly reminder before the next due date may help."
            else:
                base = f"{r['student_name']}'s fee payments have been reliable, with {r['paid_on_time']} of {r['months_billed']} months paid on time."
                suggestion = ""
            return base + suggestion

        parts = [
            f"Out of {overall['total_students']} students, {overall['high_risk_count']} are at high risk and {overall['medium_risk_count']} at medium risk of missing next month's fee payment.",
            f"Total outstanding across these students is Rs. {overall['total_outstanding']}, against a historical collection rate of {overall['historical_collection_rate_pct']}%.",
        ]
        if overall["high_risk_count"] > 0:
            parts.append("Reaching out to high-risk families before the next due date, or offering a payment plan, would likely help improve collection.")
        return " ".join(parts)
