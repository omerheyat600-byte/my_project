"""
Performance Analysis — service layer (AI Tools).

Unlike the generative tools (remarks, lesson plans), this one is
fundamentally an analytics feature: trend/average/strength-weakness
numbers are always computed deterministically from real exam data —
AI is never asked to invent a number. The only thing the AI path adds
is a short narrative paragraph summarizing what the numbers already
say. The offline path builds the same narrative from a template, so
the feature is fully usable without any AI provider configured.
"""
from repositories.performance_repository import PerformanceRepository
from repositories.settings_repository import SettingsRepository
from utils.ai_client import call_ai, is_configured, AIProviderNotConfiguredError, AIProviderError
from utils.logger import get_logger

logger = get_logger(__name__)


class PerformanceStudentNotFoundError(Exception):
    pass


class PerformanceAnalysisService:

    def __init__(self, repository: PerformanceRepository, settings_repository: SettingsRepository):
        self.repository = repository
        self.settings_repository = settings_repository

    def analyze_student(self, student_id, mode="auto"):
        student_name = self.repository.find_student_name(student_id)
        if not student_name:
            raise PerformanceStudentNotFoundError("Student not found")

        history = self.repository.find_result_history(student_id)
        if not history:
            return {
                "student_id": student_id,
                "student_name": student_name,
                "has_data": False,
                "message": "No exam results found for this student yet.",
            }

        for h in history:
            h["class_average"] = self.repository.find_class_average_for_exam(h["exam_id"])

        subject_history = self.repository.find_subject_history(student_id)
        subject_breakdown = self._build_subject_breakdown(subject_history)

        overall = self._build_overall_stats(history)

        warning = None
        mode = (mode or "auto").strip().lower()
        if mode == "offline":
            narrative, used_mode = self._offline_narrative(student_name, overall, subject_breakdown), "offline"
        elif mode == "ai":
            narrative, used_mode = self._ai_narrative(student_name, overall, subject_breakdown), "ai"
        else:
            if is_configured(self.settings_repository):
                try:
                    narrative, used_mode = self._ai_narrative(student_name, overall, subject_breakdown), "ai"
                except (AIProviderNotConfiguredError, AIProviderError) as e:
                    logger.warning(f"AI performance narrative failed, falling back to offline: {e}")
                    warning = f"AI narrative failed ({e}); used the offline summary instead."
                    narrative, used_mode = self._offline_narrative(student_name, overall, subject_breakdown), "offline"
            else:
                warning = "No AI provider is configured in Settings — used the offline summary."
                narrative, used_mode = self._offline_narrative(student_name, overall, subject_breakdown), "offline"

        result = {
            "student_id": student_id,
            "student_name": student_name,
            "has_data": True,
            "history": history,
            "overall": overall,
            "subject_breakdown": subject_breakdown,
            "narrative": narrative,
            "generation_mode_used": used_mode,
        }
        if warning:
            result["warning"] = warning
        return result

    # ==========================================================
    # COMPUTED STATS (always deterministic)
    # ==========================================================

    def _build_overall_stats(self, history):
        percentages = [h["percentage"] for h in history if h["percentage"] is not None]
        avg_percentage = round(sum(percentages) / len(percentages), 2) if percentages else 0
        first_pct = percentages[0] if percentages else 0
        last_pct = percentages[-1] if percentages else 0
        delta = round(last_pct - first_pct, 2)

        if len(percentages) < 2:
            trend = "insufficient_data"
        elif delta > 3:
            trend = "improving"
        elif delta < -3:
            trend = "declining"
        else:
            trend = "stable"

        best = max(history, key=lambda h: h["percentage"] or 0)
        worst = min(history, key=lambda h: h["percentage"] or 0)

        return {
            "exam_count": len(history),
            "average_percentage": avg_percentage,
            "first_percentage": first_pct,
            "latest_percentage": last_pct,
            "trend": trend,
            "trend_delta": delta,
            "best_exam": {"term": best["term"], "year": best["year"], "percentage": best["percentage"]},
            "worst_exam": {"term": worst["term"], "year": worst["year"], "percentage": worst["percentage"]},
        }

    def _build_subject_breakdown(self, subject_history):
        by_subject = {}
        for row in subject_history:
            name = row["subject"]
            by_subject.setdefault(name, []).append(row)

        breakdown = []
        for name, rows in by_subject.items():
            pcts = [
                round((r["obtained_marks"] / r["total_marks"]) * 100, 1)
                for r in rows if r["total_marks"]
            ]
            if not pcts:
                continue
            avg_pct = round(sum(pcts) / len(pcts), 1)
            delta = round(pcts[-1] - pcts[0], 1) if len(pcts) >= 2 else 0
            if len(pcts) < 2:
                trend = "insufficient_data"
            elif delta > 5:
                trend = "improving"
            elif delta < -5:
                trend = "declining"
            else:
                trend = "stable"
            breakdown.append({
                "subject": name,
                "average_percentage": avg_pct,
                "exam_count": len(pcts),
                "trend": trend,
                "trend_delta": delta,
            })

        breakdown.sort(key=lambda b: b["average_percentage"], reverse=True)
        return breakdown

    # ==========================================================
    # NARRATIVE (AI or offline — describes the numbers, never invents them)
    # ==========================================================

    def _ai_narrative(self, student_name, overall, subject_breakdown):
        strengths = subject_breakdown[:2]
        weaknesses = [s for s in subject_breakdown if s["average_percentage"] < 60][-2:]

        subjects_lines = "\n".join(
            f"- {s['subject']}: {s['average_percentage']}% avg, trend: {s['trend']}" for s in subject_breakdown
        )
        prompt = f"""Summarize this student's academic performance in 3-4 sentences for a teacher/parent audience.

Student: {student_name}
Exams on record: {overall['exam_count']}
Average percentage across all exams: {overall['average_percentage']}%
Overall trend: {overall['trend']} (change of {overall['trend_delta']} points from first to most recent exam)
Best exam: {overall['best_exam']['term']} {overall['best_exam']['year']} ({overall['best_exam']['percentage']}%)
Most recent exam: {overall['latest_percentage']}%

Subject-wise averages:
{subjects_lines}

Only state facts supported by the numbers above — do not invent causes,
events, or personal circumstances. Mention the overall trend, name the
strongest and (if any) weakest subject(s), and end with one practical,
constructive suggestion."""

        raw = call_ai(
            self.settings_repository,
            prompt,
            system="You are a careful school academic advisor. You only report what the data shows.",
            max_tokens=350,
        )
        return raw.strip()

    def _offline_narrative(self, student_name, overall, subject_breakdown):
        first_name = student_name.split(" ")[0]
        parts = []

        if overall["trend"] == "improving":
            parts.append(f"{first_name}'s performance has been improving, up {abs(overall['trend_delta'])} percentage points from the first exam on record to the most recent one.")
        elif overall["trend"] == "declining":
            parts.append(f"{first_name}'s performance has declined by {abs(overall['trend_delta'])} percentage points from the first exam on record to the most recent one.")
        elif overall["trend"] == "stable":
            parts.append(f"{first_name}'s performance has stayed fairly consistent across exams, averaging {overall['average_percentage']}%.")
        else:
            parts.append(f"{first_name} has one exam on record so far, at {overall['latest_percentage']}%; a trend will be clearer after another exam.")

        if subject_breakdown:
            best = subject_breakdown[0]
            parts.append(f"The strongest subject is {best['subject']} ({best['average_percentage']}% average).")
            weak_candidates = [s for s in subject_breakdown if s["average_percentage"] < 60]
            if weak_candidates:
                worst = min(weak_candidates, key=lambda s: s["average_percentage"])
                parts.append(f"{worst['subject']} ({worst['average_percentage']}% average) would benefit from extra attention.")

        parts.append("Regular review and continued encouragement should help maintain or improve this trajectory.")
        return " ".join(parts)
