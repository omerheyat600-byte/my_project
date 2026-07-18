"""
Attendance Risk — service layer (AI Tools).

Same discipline as Fee Prediction and Performance Analysis: risk
scores and streak counts are computed deterministically from real
attendance records. AI (when configured) only narrates the computed
numbers — it never guesses a rate or invents a reason for absence.
"""
from datetime import date, datetime, timedelta

from repositories.attendance_risk_repository import AttendanceRiskRepository
from repositories.settings_repository import SettingsRepository
from utils.ai_client import call_ai, is_configured, AIProviderNotConfiguredError, AIProviderError
from utils.logger import get_logger

logger = get_logger(__name__)

DEFAULT_WINDOW_DAYS = 30


class AttendanceRiskStudentNotFoundError(Exception):
    pass


class AttendanceRiskService:

    def __init__(self, repository: AttendanceRiskRepository, settings_repository: SettingsRepository):
        self.repository = repository
        self.settings_repository = settings_repository

    # ==========================================================
    # CLASS-WIDE / SCHOOL-WIDE
    # ==========================================================

    def analyze_class(self, class_name=None, window_days=DEFAULT_WINDOW_DAYS, mode="auto"):
        start_date, end_date = self._window(window_days)
        raw = self.repository.find_raw_attendance(start_date, end_date, class_name=class_name)
        if not raw:
            return {"has_data": False, "message": f"No attendance records found in the last {window_days} days."}

        by_student = {}
        for row in raw:
            by_student.setdefault(row["student_id"], {"name": row["student_name"], "grade": row["grade"], "records": []})
            by_student[row["student_id"]]["records"].append(row)

        student_risks = [
            self._score_student(sid, info["name"], info["grade"], info["records"])
            for sid, info in by_student.items()
        ]
        student_risks.sort(key=lambda r: r["risk_score"], reverse=True)

        overall = self._build_overall_stats(student_risks)
        narrative, used_mode, warning = self._get_narrative(mode, overall, student_risks, student_id=None, window_days=window_days)

        result = {
            "has_data": True,
            "class_name": class_name,
            "window_days": window_days,
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

    def analyze_student(self, student_id, window_days=DEFAULT_WINDOW_DAYS, mode="auto"):
        student = self.repository.find_student_name_grade(student_id)
        if not student:
            raise AttendanceRiskStudentNotFoundError("Student not found")

        start_date, end_date = self._window(window_days)
        records = self.repository.find_raw_attendance(start_date, end_date, student_id=student_id)
        if not records:
            return {"has_data": False, "student_id": student_id, "student_name": student["name"],
                     "message": f"No attendance records found for this student in the last {window_days} days."}

        risk = self._score_student(student_id, student["name"], student["grade"], records)
        narrative, used_mode, warning = self._get_narrative(mode, None, [risk], student_id=student_id, window_days=window_days)

        result = {"has_data": True, "student": risk, "narrative": narrative, "generation_mode_used": used_mode}
        if warning:
            result["warning"] = warning
        return result

    def _window(self, window_days):
        end = date.today()
        start = end - timedelta(days=window_days)
        return start.isoformat(), end.isoformat()

    # ==========================================================
    # RISK SCORING (deterministic)
    # ==========================================================

    def _score_student(self, student_id, name, grade, records):
        records = sorted(records, key=lambda r: r["date"])
        total = len(records)
        present = sum(1 for r in records if r["status"] == "Present")
        absent = sum(1 for r in records if r["status"] == "Absent")
        late = sum(1 for r in records if r["status"] == "Late")
        leave = sum(1 for r in records if r["status"] == "Leave")

        attendance_rate = round((present / total) * 100, 1) if total else 0

        # longest run of consecutive Absent-marked days (gaps in the
        # marked-day sequence, e.g. weekends/holidays, don't break the
        # streak — only a Present/Late/Leave day in between does)
        max_streak = current_streak = 0
        for r in records:
            if r["status"] == "Absent":
                current_streak += 1
                max_streak = max(max_streak, current_streak)
            else:
                current_streak = 0

        # trend: split window in half, compare absence rate of the two halves
        trend = "insufficient_data"
        if total >= 6:
            mid = total // 2
            first_half, second_half = records[:mid], records[mid:]
            first_absent_rate = sum(1 for r in first_half if r["status"] == "Absent") / len(first_half)
            second_absent_rate = sum(1 for r in second_half if r["status"] == "Absent") / len(second_half)
            delta = second_absent_rate - first_absent_rate
            if delta > 0.1:
                trend = "worsening"
            elif delta < -0.1:
                trend = "improving"
            else:
                trend = "stable"

        absence_rate = (absent + late * 0.5) / total if total else 0
        streak_bonus = min(30, max_streak * 10) if max_streak >= 2 else 0
        trend_bonus = 15 if trend == "worsening" else 0
        risk_score = round(min(100, absence_rate * 100 * 0.7 + streak_bonus + trend_bonus))

        if risk_score >= 50 or max_streak >= 3:
            risk_level = "high"
        elif risk_score >= 25 or max_streak >= 2:
            risk_level = "medium"
        else:
            risk_level = "low"

        return {
            "student_id": student_id,
            "student_name": name,
            "grade": grade,
            "days_marked": total,
            "present": present,
            "absent": absent,
            "late": late,
            "leave": leave,
            "attendance_rate_pct": attendance_rate,
            "current_absence_streak": max_streak,
            "trend": trend,
            "risk_score": risk_score,
            "risk_level": risk_level,
        }

    def _build_overall_stats(self, student_risks):
        total_students = len(student_risks)
        high = sum(1 for r in student_risks if r["risk_level"] == "high")
        medium = sum(1 for r in student_risks if r["risk_level"] == "medium")
        low = total_students - high - medium
        avg_rate = round(sum(r["attendance_rate_pct"] for r in student_risks) / total_students, 1) if total_students else 0

        return {
            "total_students": total_students,
            "high_risk_count": high,
            "medium_risk_count": medium,
            "low_risk_count": low,
            "average_attendance_rate_pct": avg_rate,
        }

    # ==========================================================
    # NARRATIVE (AI or offline)
    # ==========================================================

    def _get_narrative(self, mode, overall, student_risks, student_id, window_days):
        mode = (mode or "auto").strip().lower()
        warning = None
        if mode == "offline":
            return self._offline_narrative(overall, student_risks, student_id, window_days), "offline", None
        if mode == "ai":
            return self._ai_narrative(overall, student_risks, student_id, window_days), "ai", None

        if is_configured(self.settings_repository):
            try:
                return self._ai_narrative(overall, student_risks, student_id, window_days), "ai", None
            except (AIProviderNotConfiguredError, AIProviderError) as e:
                logger.warning(f"AI attendance-risk narrative failed, falling back to offline: {e}")
                warning = f"AI narrative failed ({e}); used the offline summary instead."
                return self._offline_narrative(overall, student_risks, student_id, window_days), "offline", warning
        else:
            warning = "No AI provider is configured in Settings — used the offline summary."
            return self._offline_narrative(overall, student_risks, student_id, window_days), "offline", warning

    def _ai_narrative(self, overall, student_risks, student_id, window_days):
        if student_id:
            r = student_risks[0]
            prompt = f"""Summarize this student's attendance pattern over the last {window_days} days in 2-3 sentences for a school administrator.

Student: {r['student_name']} ({r['grade']})
Days marked: {r['days_marked']}
Present: {r['present']}, Absent: {r['absent']}, Late: {r['late']}, Leave: {r['leave']}
Attendance rate: {r['attendance_rate_pct']}%
Longest recent run of consecutive absences: {r['current_absence_streak']} day(s)
Trend (first half vs second half of window): {r['trend']}
Risk level: {r['risk_level']}

Only state facts supported by the numbers above. Do not invent a reason for the absences. If risk level is medium or high, end with one respectful, practical next step (e.g. a check-in call with the family)."""
        else:
            top = student_risks[:5]
            top_lines = "\n".join(f"- {s['student_name']} ({s['grade']}): {s['attendance_rate_pct']}% attendance, {s['current_absence_streak']}-day streak, risk {s['risk_level']}" for s in top)
            prompt = f"""Summarize this school's/class's attendance risk picture over the last {window_days} days in 3-4 sentences for an administrator.

Total students analyzed: {overall['total_students']}
High risk: {overall['high_risk_count']}, Medium risk: {overall['medium_risk_count']}, Low risk: {overall['low_risk_count']}
Average attendance rate: {overall['average_attendance_rate_pct']}%

Most at-risk students:
{top_lines}

Only state facts supported by the numbers above. Do not invent reasons for absence. Mention the scale of at-risk students and one practical, respectful next step (e.g. reaching out to families of high-risk students)."""

        raw = call_ai(
            self.settings_repository,
            prompt,
            system="You are a careful, respectful school administrator. You only report what the data shows, and you never assume a cause behind a student's absences.",
            max_tokens=350,
        )
        return raw.strip()

    def _offline_narrative(self, overall, student_risks, student_id, window_days):
        if student_id:
            r = student_risks[0]
            if r["risk_level"] == "high":
                base = f"{r['student_name']} shows a high attendance risk over the last {window_days} days: {r['attendance_rate_pct']}% attendance"
                if r["current_absence_streak"] >= 2:
                    base += f", including a recent run of {r['current_absence_streak']} consecutive absent day(s)"
                base += "."
                suggestion = " A check-in call with the family is recommended."
            elif r["risk_level"] == "medium":
                base = f"{r['student_name']} shows a moderate attendance risk, at {r['attendance_rate_pct']}% attendance over the last {window_days} days."
                suggestion = " Worth keeping an eye on over the coming weeks."
            else:
                base = f"{r['student_name']}'s attendance has been steady, at {r['attendance_rate_pct']}% over the last {window_days} days."
                suggestion = ""
            return base + suggestion

        parts = [
            f"Out of {overall['total_students']} students, {overall['high_risk_count']} are at high attendance risk and {overall['medium_risk_count']} at medium risk, over the last {window_days} days.",
            f"Average attendance across this group is {overall['average_attendance_rate_pct']}%.",
        ]
        if overall["high_risk_count"] > 0:
            parts.append("Reaching out to the families of high-risk students is recommended before patterns become harder to reverse.")
        return " ".join(parts)
