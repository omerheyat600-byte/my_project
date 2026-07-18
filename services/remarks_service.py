"""
Report Card Remarks — service layer (AI Tools).

Same two-path pattern as services/ai_paper_service.py:
  - "ai"      : prompts the configured AI provider (utils/ai_client) for
                a short overall remark + strengths + improvement areas,
                based on that student's subject-wise marks for one exam.
  - "offline" : a rule-based fallback using grade/percentage thresholds
                and the student's own best/weakest subjects — no
                internet/API key required, so this still works on an
                offline school PC.

generate_for_student() with mode="auto" (the default) tries AI first
when a provider is configured, and falls back to offline generation
if it isn't configured or the call fails, same as question papers.
"""
from repositories.exam_repository import ExamRepository
from repositories.report_card_remarks_repository import ReportCardRemarksRepository
from repositories.settings_repository import SettingsRepository
from utils.ai_client import call_ai, extract_json, is_configured, AIProviderNotConfiguredError, AIProviderError
from utils.grading import grade_from_score
from utils.logger import get_logger

logger = get_logger(__name__)

TONES = ["encouraging", "formal", "concise"]


class RemarksExamNotFoundError(Exception):
    pass


class RemarksStudentNotFoundError(Exception):
    pass


class RemarksValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors if isinstance(errors, list) else [errors]
        super().__init__("; ".join(self.errors))


class RemarksService:

    def __init__(self, exam_repository: ExamRepository,
                 remarks_repository: ReportCardRemarksRepository,
                 settings_repository: SettingsRepository):
        self.exam_repository = exam_repository
        self.remarks_repository = remarks_repository
        self.settings_repository = settings_repository

    # ==========================================================
    # READ — class list merged with any remarks already saved
    # ==========================================================

    def get_remarks_for_exam(self, exam_id):
        exam = self.exam_repository.find_exam_session(exam_id)
        if not exam:
            raise RemarksExamNotFoundError("Exam not found")

        class_name = self.exam_repository.find_class_name(exam["class_id"]) or "Unknown"
        student_results = self.exam_repository.find_student_results_with_names(exam_id)
        remarks_map = self.remarks_repository.find_all_for_exam(exam_id)

        students = []
        for sr in student_results:
            sid = sr["student_id"]
            remark = remarks_map.get(sid)
            students.append({
                "student_id": sid,
                "student_name": sr["student_name"],
                "total_obtained": sr["total_obtained"],
                "total_marks": sr["total_marks"],
                "percentage": round(sr["percentage"], 2) if sr["percentage"] is not None else 0,
                "grade": sr["grade"],
                "position": sr["position"],
                "remark": {
                    "overall_remark": remark["overall_remark"],
                    "strengths": remark["strengths"],
                    "improvement_areas": remark["improvement_areas"],
                    "generation_mode": remark["generation_mode"],
                    "updated_at": remark["updated_at"],
                } if remark else None,
            })

        return {
            "exam_id": exam_id,
            "class_name": class_name,
            "term": exam["term"],
            "year": exam["year"],
            "students": students,
        }

    # ==========================================================
    # GENERATE — single student
    # ==========================================================

    def generate_for_student(self, exam_id, student_id, mode="auto", tone="encouraging", created_by=None):
        exam = self.exam_repository.find_exam_session(exam_id)
        if not exam:
            raise RemarksExamNotFoundError("Exam not found")

        tone = tone if tone in TONES else "encouraging"
        subject_marks = self.exam_repository.find_subject_marks_for_student(exam_id, student_id)
        if not subject_marks:
            raise RemarksStudentNotFoundError("No marks found for this student in this exam")

        student_name = self.exam_repository.find_student_name(student_id) or student_id
        total_obtained = sum(s["obtained_marks"] for s in subject_marks)
        total_marks = sum(s["total_marks"] for s in subject_marks)
        percentage = round((total_obtained / total_marks) * 100, 2) if total_marks else 0
        overall_grade = grade_from_score(total_obtained, total_marks)

        context = {
            "student_name": student_name,
            "class_name": self.exam_repository.find_class_name(exam["class_id"]) or "",
            "term": exam["term"],
            "year": exam["year"],
            "percentage": percentage,
            "grade": overall_grade,
            "subjects": [
                {
                    "subject": s["subject"],
                    "obtained": s["obtained_marks"],
                    "total": s["total_marks"],
                    "pct": round((s["obtained_marks"] / s["total_marks"]) * 100, 1) if s["total_marks"] else 0,
                }
                for s in subject_marks
            ],
        }

        warning = None
        if mode == "offline":
            remark, used_mode = self._generate_offline(context, tone), "offline"
        elif mode == "ai":
            remark, used_mode = self._generate_ai(context, tone), "ai"
        else:  # auto
            if is_configured(self.settings_repository):
                try:
                    remark, used_mode = self._generate_ai(context, tone), "ai"
                except (AIProviderNotConfiguredError, AIProviderError) as e:
                    logger.warning(f"AI remark generation failed, falling back to offline: {e}")
                    warning = f"AI generation failed ({e}); used the offline template instead."
                    remark, used_mode = self._generate_offline(context, tone), "offline"
            else:
                warning = "No AI provider is configured in Settings — used the offline template."
                remark, used_mode = self._generate_offline(context, tone), "offline"

        self.remarks_repository.upsert(
            exam_id, student_id,
            overall_remark=remark["overall_remark"],
            strengths=remark["strengths"],
            improvement_areas=remark["improvement_areas"],
            generation_mode=used_mode,
            created_by=created_by,
        )

        result = self.remarks_repository.find_by_exam_and_student(exam_id, student_id)
        result["student_name"] = student_name
        result["generation_mode_used"] = used_mode
        if warning:
            result["warning"] = warning
        return result

    # ==========================================================
    # GENERATE — whole class for one exam
    # ==========================================================

    def generate_bulk(self, exam_id, mode="auto", tone="encouraging", created_by=None,
                       overwrite_existing=False):
        exam = self.exam_repository.find_exam_session(exam_id)
        if not exam:
            raise RemarksExamNotFoundError("Exam not found")

        student_results = self.exam_repository.find_student_results_with_names(exam_id)
        if not student_results:
            return {"generated": 0, "skipped": 0, "failed": []}

        existing_map = self.remarks_repository.find_all_for_exam(exam_id) if not overwrite_existing else {}

        generated, skipped, failed = 0, 0, []
        for sr in student_results:
            sid = sr["student_id"]
            if sid in existing_map:
                skipped += 1
                continue
            try:
                self.generate_for_student(exam_id, sid, mode=mode, tone=tone, created_by=created_by)
                generated += 1
            except Exception as e:
                logger.warning(f"Remark generation failed for student {sid}: {e}")
                failed.append({"student_id": sid, "error": str(e)})

        return {"generated": generated, "skipped": skipped, "failed": failed}

    # ==========================================================
    # MANUAL EDIT / DELETE
    # ==========================================================

    def save_manual(self, exam_id, student_id, overall_remark, strengths, improvement_areas, created_by=None):
        errors = []
        if not (overall_remark or "").strip():
            errors.append("Overall remark is required")
        if errors:
            raise RemarksValidationError(errors)

        self.remarks_repository.upsert(
            exam_id, student_id,
            overall_remark=overall_remark.strip(),
            strengths=(strengths or "").strip(),
            improvement_areas=(improvement_areas or "").strip(),
            generation_mode="manual",
            created_by=created_by,
        )
        return self.remarks_repository.find_by_exam_and_student(exam_id, student_id)

    def delete_remark(self, exam_id, student_id):
        self.remarks_repository.delete_for_exam_student(exam_id, student_id)

    # ==========================================================
    # AI GENERATION
    # ==========================================================

    def _generate_ai(self, context, tone):
        tone_instruction = {
            "encouraging": "warm, encouraging, and specific — praise effort as well as results",
            "formal": "formal and measured, suitable for an official report card",
            "concise": "brief and to the point, 1-2 short sentences per field",
        }[tone]

        subjects_lines = "\n".join(
            f"- {s['subject']}: {s['obtained']}/{s['total']} ({s['pct']}%)" for s in context["subjects"]
        )
        prompt = f"""Write report card remarks for a school student, in a {tone_instruction} tone.

Student: {context['student_name']}
Class: {context['class_name']}
Term/Year: {context['term']} {context['year']}
Overall: {context['percentage']}% (Grade {context['grade']})

Subject-wise marks:
{subjects_lines}

Respond with ONLY a JSON object (no markdown, no prose) in exactly this shape:
{{
  "overall_remark": "2-3 sentence overall comment on the student's performance this term",
  "strengths": "1-2 sentence note on the student's strongest subject(s)/areas",
  "improvement_areas": "1-2 sentence constructive note on what to focus on next term"
}}

Do not invent facts not supported by the marks above. Refer to the student by first name only."""

        raw = call_ai(
            self.settings_repository,
            prompt,
            system="You are a helpful, fair-minded schoolteacher writing report card comments.",
            max_tokens=500,
        )
        data = extract_json(raw)
        return {
            "overall_remark": (data.get("overall_remark") or "").strip(),
            "strengths": (data.get("strengths") or "").strip(),
            "improvement_areas": (data.get("improvement_areas") or "").strip(),
        }

    # ==========================================================
    # OFFLINE (rule-based) GENERATION
    # ==========================================================

    def _generate_offline(self, context, tone):
        first_name = (context["student_name"] or "The student").split(" ")[0]
        pct = context["percentage"]
        grade = context["grade"]
        subjects = context["subjects"]

        if pct >= 90:
            band = f"an outstanding {pct}% (Grade {grade})"
        elif pct >= 80:
            band = f"a very strong {pct}% (Grade {grade})"
        elif pct >= 70:
            band = f"a good {pct}% (Grade {grade})"
        elif pct >= 60:
            band = f"a satisfactory {pct}% (Grade {grade})"
        elif pct >= 50:
            band = f"a passing {pct}% (Grade {grade}), with room to grow"
        else:
            band = f"{pct}% (Grade {grade}), below the expected level"

        overall_remark = f"{first_name} scored {band} this term."
        if tone == "encouraging":
            overall_remark += " Keep up the consistent effort and stay engaged in class."
        elif tone == "formal":
            overall_remark += " Continued attention to coursework is recommended."

        sorted_subjects = sorted(subjects, key=lambda s: s["pct"], reverse=True)
        if sorted_subjects:
            best = sorted_subjects[:2]
            best_names = ", ".join(s["subject"] for s in best)
            strengths = f"{first_name} performed particularly well in {best_names}."
        else:
            strengths = "No subject data available to highlight strengths."

        weak = [s for s in sorted_subjects if s["pct"] < 50]
        if weak:
            weak_names = ", ".join(s["subject"] for s in weak[:2])
            improvement_areas = f"Extra practice is recommended in {weak_names} to build confidence and improve results."
        elif sorted_subjects and sorted_subjects[-1]["pct"] < 70:
            improvement_areas = f"A little more focus on {sorted_subjects[-1]['subject']} would help going forward."
        else:
            improvement_areas = "No specific weak areas — encourage the student to keep up this level across all subjects."

        return {
            "overall_remark": overall_remark,
            "strengths": strengths,
            "improvement_areas": improvement_areas,
        }
