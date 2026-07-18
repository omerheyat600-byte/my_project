"""
Lesson Planner — service layer (AI Tools).

Same two-path pattern as ai_paper_service.py / remarks_service.py:
  - "ai"      : prompts the configured AI provider for a structured
                lesson plan (objectives, warm-up, main activities,
                assessment, homework, differentiation notes).
  - "offline" : a generic editable scaffold built from the subject/
                topic/duration alone — no internet/API key required.
                It's intentionally generic (this is more open-ended
                than remarks or question banks, so there's no
                meaningful rule-based content to generate), but it
                still saves the teacher from a blank page and is
                fully editable after generation.
"""
from repositories.lesson_plan_repository import LessonPlanRepository
from repositories.settings_repository import SettingsRepository
from utils.ai_client import call_ai, extract_json, is_configured, AIProviderNotConfiguredError, AIProviderError
from utils.logger import get_logger

logger = get_logger(__name__)


class LessonPlanValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors if isinstance(errors, list) else [errors]
        super().__init__("; ".join(self.errors))


class LessonPlanNotFoundError(Exception):
    pass


class LessonPlanService:

    def __init__(self, repository: LessonPlanRepository, settings_repository: SettingsRepository):
        self.repository = repository
        self.settings_repository = settings_repository

    # ==========================================================
    # GENERATE
    # ==========================================================

    def generate_plan(self, params, created_by=None):
        errors = self._validate(params)
        if errors:
            raise LessonPlanValidationError(errors)

        subject = params["subject"].strip()
        topic = params["topic"].strip()
        try:
            duration_minutes = int(params.get("duration_minutes") or 40)
        except (TypeError, ValueError):
            duration_minutes = 40
        class_id = params.get("class_id") or None
        mode = (params.get("mode") or "auto").strip().lower()
        grade_level = (params.get("grade_level") or "").strip()

        warning = None
        if mode == "offline":
            content, used_mode = self._generate_offline(subject, topic, duration_minutes), "offline"
        elif mode == "ai":
            content, used_mode = self._generate_ai(subject, topic, duration_minutes, grade_level), "ai"
        else:  # auto
            if is_configured(self.settings_repository):
                try:
                    content, used_mode = self._generate_ai(subject, topic, duration_minutes, grade_level), "ai"
                except (AIProviderNotConfiguredError, AIProviderError) as e:
                    logger.warning(f"AI lesson plan generation failed, falling back to offline: {e}")
                    warning = f"AI generation failed ({e}); used the offline scaffold instead."
                    content, used_mode = self._generate_offline(subject, topic, duration_minutes), "offline"
            else:
                warning = "No AI provider is configured in Settings — used the offline scaffold."
                content, used_mode = self._generate_offline(subject, topic, duration_minutes), "offline"

        plan_id = self.repository.save_plan(
            class_id=class_id,
            subject=subject,
            topic=topic,
            duration_minutes=duration_minutes,
            generation_mode=used_mode,
            content=content,
            created_by=created_by,
        )

        result = self.repository.find_plan_by_id(plan_id)
        result["generation_mode_used"] = used_mode
        if warning:
            result["warning"] = warning
        return result

    def _validate(self, params):
        errors = []
        if not (params.get("subject") or "").strip():
            errors.append("Subject is required")
        if not (params.get("topic") or "").strip():
            errors.append("Topic is required")
        return errors

    # ==========================================================
    # READ / DELETE
    # ==========================================================

    def list_plans(self, class_id=None, subject=None):
        return self.repository.find_plans(class_id, subject)

    def get_plan(self, plan_id):
        plan = self.repository.find_plan_by_id(plan_id)
        if not plan:
            raise LessonPlanNotFoundError("Lesson plan not found")
        return plan

    def delete_plan(self, plan_id):
        if not self.repository.find_plan_by_id(plan_id):
            raise LessonPlanNotFoundError("Lesson plan not found")
        self.repository.delete_plan(plan_id)

    # ==========================================================
    # AI GENERATION
    # ==========================================================

    def _generate_ai(self, subject, topic, duration_minutes, grade_level):
        grade_line = f"Grade/Class level: {grade_level}\n" if grade_level else ""
        prompt = f"""Write a classroom lesson plan.

Subject: {subject}
Topic: {topic}
{grade_line}Lesson duration: {duration_minutes} minutes

Respond with ONLY a JSON object (no markdown, no prose) in exactly this shape:
{{
  "objectives": ["learning objective 1", "learning objective 2", "..."],
  "materials": ["material/resource 1", "material/resource 2", "..."],
  "warm_up": {{"duration_minutes": 5, "description": "how the lesson opens"}},
  "main_activities": [
    {{"title": "activity name", "duration_minutes": 15, "description": "what happens, step by step"}}
  ],
  "assessment": "how the teacher checks understanding during/after the lesson",
  "homework": "follow-up task for students, or empty string if none",
  "differentiation": "brief note on supporting struggling students and stretching advanced ones"
}}

Keep activity durations realistic and roughly summing to the lesson duration given above."""

        raw = call_ai(
            self.settings_repository,
            prompt,
            system="You are an experienced, practical schoolteacher writing a lesson plan for a colleague to use directly in class.",
            max_tokens=1200,
        )
        data = extract_json(raw)
        return self._sanitize_content(data, subject, topic, duration_minutes)

    def _sanitize_content(self, data, subject, topic, duration_minutes):
        """AI responses can omit fields or use the wrong shape — always
        return a complete, predictable structure for the frontend."""
        def _list(v):
            return [str(x).strip() for x in v if str(x).strip()] if isinstance(v, list) else []

        def _str(v):
            return str(v).strip() if v is not None else ""

        warm_up = data.get("warm_up") if isinstance(data.get("warm_up"), dict) else {}
        activities = data.get("main_activities") if isinstance(data.get("main_activities"), list) else []
        clean_activities = []
        for a in activities:
            if isinstance(a, dict) and a.get("title"):
                clean_activities.append({
                    "title": _str(a.get("title")),
                    "duration_minutes": a.get("duration_minutes") or 0,
                    "description": _str(a.get("description")),
                })

        return {
            "subject": subject,
            "topic": topic,
            "duration_minutes": duration_minutes,
            "objectives": _list(data.get("objectives")) or [f"Understand the key concepts of {topic}"],
            "materials": _list(data.get("materials")),
            "warm_up": {
                "duration_minutes": warm_up.get("duration_minutes", 5),
                "description": _str(warm_up.get("description")),
            },
            "main_activities": clean_activities,
            "assessment": _str(data.get("assessment")),
            "homework": _str(data.get("homework")),
            "differentiation": _str(data.get("differentiation")),
        }

    # ==========================================================
    # OFFLINE (generic scaffold) GENERATION
    # ==========================================================

    def _generate_offline(self, subject, topic, duration_minutes):
        warm_up_minutes = max(5, round(duration_minutes * 0.15))
        main_minutes = max(10, duration_minutes - warm_up_minutes - 5)
        first_half = round(main_minutes * 0.6)
        second_half = main_minutes - first_half

        return {
            "subject": subject,
            "topic": topic,
            "duration_minutes": duration_minutes,
            "objectives": [
                f"Students will be able to explain the key ideas of {topic}.",
                f"Students will be able to apply {topic} to a simple example or problem.",
            ],
            "materials": ["Whiteboard/marker", "Textbook chapter on this topic", "Handout or worksheet (prepare in advance)"],
            "warm_up": {
                "duration_minutes": warm_up_minutes,
                "description": f"Ask students what they already know about {topic}. Write responses on the board and use them to introduce today's lesson.",
            },
            "main_activities": [
                {
                    "title": "Direct instruction",
                    "duration_minutes": first_half,
                    "description": f"Explain the core concepts of {topic} using the textbook/board. Use examples and check understanding with quick questions.",
                },
                {
                    "title": "Guided practice",
                    "duration_minutes": second_half,
                    "description": f"Students work individually or in pairs on practice questions/exercises related to {topic}, while the teacher circulates and helps.",
                },
            ],
            "assessment": f"Ask 2-3 students to explain {topic} in their own words, or do a quick 3-question check at the end of class.",
            "homework": f"Assign a small set of practice questions on {topic} from the textbook.",
            "differentiation": "For students who finish early, extend with a harder application question. For students struggling, pair them with a peer or provide a simpler worked example.",
        }
