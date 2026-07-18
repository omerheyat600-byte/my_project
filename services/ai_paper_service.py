"""
AI Question Paper Generator — service layer.

Two generation paths, both producing the same paper shape:
  - "ai"      : prompts the configured AI provider (utils/ai_client) for
                the questions, then saves them into the local question
                bank so they can be reused offline later.
  - "offline" : draws from the local ai_question_bank table, no
                internet/API key required.

generate_paper() with mode="auto" (the default) tries AI first when a
provider is configured, and transparently falls back to offline mode
if it isn't configured or the call fails — the caller is told which
path was actually used via `generation_mode` / `warning` in the result,
so nothing is silently different from what was asked for.
"""
import random

from repositories.ai_paper_repository import AIPaperRepository
from repositories.settings_repository import SettingsRepository
from utils.ai_client import call_ai, extract_json, is_configured, AIProviderNotConfiguredError, AIProviderError
from utils.logger import get_logger

logger = get_logger(__name__)

QUESTION_TYPES = ["MCQ", "Short Answer", "Long Answer", "Fill in the Blanks", "True/False"]
DIFFICULTIES = ["Easy", "Medium", "Hard"]


class PaperValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors if isinstance(errors, list) else [errors]
        super().__init__("; ".join(self.errors))


class PaperNotFoundError(Exception):
    pass


class AIPaperService:

    def __init__(self, repository: AIPaperRepository, settings_repository: SettingsRepository):
        self.repository = repository
        self.settings_repository = settings_repository

    # ==========================================================
    # GENERATE
    # ==========================================================

    def generate_paper(self, params, created_by=None):
        errors = self._validate(params)
        if errors:
            raise PaperValidationError(errors)

        mode = (params.get("mode") or "auto").strip().lower()
        sections_spec = params["sections"]
        warning = None

        if mode == "offline":
            sections, used_mode = self._generate_offline(params, sections_spec), "offline"
        elif mode == "ai":
            sections, used_mode = self._generate_ai(params, sections_spec), "ai"
        else:  # auto
            if is_configured(self.settings_repository):
                try:
                    sections, used_mode = self._generate_ai(params, sections_spec), "ai"
                except (AIProviderNotConfiguredError, AIProviderError) as e:
                    logger.warning(f"AI generation failed, falling back to offline: {e}")
                    warning = f"AI generation failed ({e}); used the offline question bank instead."
                    sections, used_mode = self._generate_offline(params, sections_spec), "offline"
            else:
                warning = "No AI provider is configured in Settings — used the offline question bank."
                sections, used_mode = self._generate_offline(params, sections_spec), "offline"

        total_marks = sum(q.get("marks", 0) for s in sections for q in s["questions"])
        content = {
            "title": params.get("title") or f"{params['subject']} — {params.get('term', '')} {params.get('year', '')}".strip(),
            "instructions": params.get("instructions", ""),
            "sections": sections,
        }

        paper_id = self.repository.save_paper(
            class_id=params.get("class_id"),
            subject=params["subject"],
            term=params.get("term"),
            year=params.get("year"),
            title=content["title"],
            duration_minutes=params.get("duration_minutes"),
            total_marks=total_marks,
            instructions=params.get("instructions", ""),
            generation_mode=used_mode,
            content=content,
            created_by=created_by,
        )

        result = self.repository.find_paper_by_id(paper_id)
        result["generation_mode_used"] = used_mode
        if warning:
            result["warning"] = warning
        return result

    def _validate(self, params):
        errors = []
        if not params.get("subject"):
            errors.append("Subject is required")
        sections = params.get("sections")
        if not sections or not isinstance(sections, list):
            errors.append("At least one section (question type + count) is required")
        else:
            for s in sections:
                if not s.get("type"):
                    errors.append("Each section needs a question type")
                try:
                    if int(s.get("count", 0)) <= 0:
                        errors.append(f"Section '{s.get('type', '?')}' needs a question count greater than 0")
                except (TypeError, ValueError):
                    errors.append(f"Section '{s.get('type', '?')}' has an invalid count")
        return errors

    # ==========================================================
    # OFFLINE (QUESTION BANK) GENERATION
    # ==========================================================

    def _generate_offline(self, params, sections_spec):
        subject = params["subject"]
        class_id = params.get("class_id")
        sections = []

        for spec in sections_spec:
            q_type = spec["type"]
            count = int(spec["count"])
            marks_each = float(spec.get("marks_each") or 1)
            topic = (spec.get("topics") or "").strip() or None
            difficulty = (spec.get("difficulty") or "").strip() or None

            picked = self._pick_offline_questions(subject, class_id, q_type, topic, difficulty, count)

            questions = []
            for q in picked:
                questions.append({
                    "question_text": q["question_text"],
                    "options": q.get("options") or [],
                    "correct_answer": q.get("correct_answer"),
                    "marks": marks_each,
                    "topic": q.get("topic"),
                    "from_bank_id": q["id"],
                })

            shortfall = count - len(questions)
            for i in range(shortfall):
                questions.append({
                    "question_text": f"[Add manually — not enough '{q_type}' questions in the Question Bank"
                                      f"{' for topic ' + topic if topic else ''}. "
                                      f"Add more via AI Tools → Question Bank, or switch to AI mode.]",
                    "options": [],
                    "correct_answer": None,
                    "marks": marks_each,
                    "topic": topic,
                    "from_bank_id": None,
                })

            sections.append({
                "type": q_type,
                "instructions": spec.get("instructions") or self._default_section_instructions(q_type, count, marks_each),
                "questions": questions,
            })

        return sections

    def _pick_offline_questions(self, subject, class_id, q_type, topic, difficulty, count):
        # Progressively relax filters so the bank gets used as much as
        # possible rather than immediately falling back to a placeholder.
        attempts = [
            dict(subject=subject, class_id=class_id, question_type=q_type, topic=topic, difficulty=difficulty),
            dict(subject=subject, class_id=class_id, question_type=q_type, topic=topic, difficulty=None),
            dict(subject=subject, class_id=class_id, question_type=q_type, topic=None, difficulty=None),
            dict(subject=subject, class_id=None, question_type=q_type, topic=None, difficulty=None),
        ]
        picked = []
        picked_ids = set()
        for filt in attempts:
            if len(picked) >= count:
                break
            candidates = [q for q in self.repository.find_questions(**filt) if q["id"] not in picked_ids]
            random.shuffle(candidates)
            for q in candidates:
                if len(picked) >= count:
                    break
                picked.append(q)
                picked_ids.add(q["id"])
        return picked

    def _default_section_instructions(self, q_type, count, marks_each):
        total = count * marks_each
        if q_type == "MCQ":
            return f"Choose the correct option for each question. ({count} × {marks_each:g} = {total:g} marks)"
        if q_type == "Fill in the Blanks":
            return f"Fill in the blanks. ({count} × {marks_each:g} = {total:g} marks)"
        if q_type == "True/False":
            return f"State whether each statement is True or False. ({count} × {marks_each:g} = {total:g} marks)"
        return f"Answer the following. ({count} × {marks_each:g} = {total:g} marks)"

    # ==========================================================
    # AI GENERATION
    # ==========================================================

    def _generate_ai(self, params, sections_spec):
        prompt = self._build_prompt(params, sections_spec)
        system = (
            "You are an experienced school exam-paper setter. You write clear, age-appropriate, "
            "curriculum-relevant exam questions and respond with STRICT JSON ONLY — no prose, "
            "no markdown fences, no commentary before or after the JSON."
        )
        raw = call_ai(self.settings_repository, prompt, system=system, max_tokens=3000)
        try:
            parsed = extract_json(raw)
        except ValueError as e:
            raise AIProviderError(f"Could not parse AI response as JSON: {e}")

        sections = self._normalize_ai_sections(parsed, sections_spec)
        self._save_ai_questions_to_bank(params, sections)
        return sections

    def _build_prompt(self, params, sections_spec):
        class_label = params.get("class_label") or ""
        lines = [
            f"Create an exam question paper for Subject: {params['subject']}"
            + (f", Class: {class_label}" if class_label else "")
            + (f", Term: {params.get('term')}" if params.get('term') else "")
            + ".",
            "Sections required:",
        ]
        for i, s in enumerate(sections_spec, 1):
            lines.append(
                f"{i}. Type: {s['type']}, Count: {s['count']}, Marks each: {s.get('marks_each') or 1}, "
                f"Topics: {s.get('topics') or 'general syllabus'}, Difficulty: {s.get('difficulty') or 'Medium'}"
            )
        lines.append(
            "\nRespond with STRICT JSON only, in exactly this shape:\n"
            '{"sections": [{"type": "<question type>", "questions": [ '
            '{"question_text": "...", "options": ["..."] (MCQ only, else []), '
            '"correct_answer": "...", "topic": "..."} ] }]}'
        )
        lines.append("For MCQ questions, provide exactly 4 options and put the correct one's text in correct_answer.")
        lines.append("For True/False, correct_answer must be exactly \"True\" or \"False\" and options must be [].")
        return "\n".join(lines)

    def _normalize_ai_sections(self, parsed, sections_spec):
        raw_sections = parsed.get("sections") if isinstance(parsed, dict) else None
        if not raw_sections:
            raise AIProviderError("AI response did not contain a 'sections' array")

        by_type = {s["type"]: s for s in raw_sections if s.get("type")}
        sections = []
        for spec in sections_spec:
            q_type = spec["type"]
            marks_each = float(spec.get("marks_each") or 1)
            count = int(spec["count"])
            src = by_type.get(q_type, {"questions": []})
            raw_questions = (src.get("questions") or [])[:count]

            questions = []
            for q in raw_questions:
                if not q.get("question_text"):
                    continue
                questions.append({
                    "question_text": q["question_text"],
                    "options": q.get("options") or [],
                    "correct_answer": q.get("correct_answer"),
                    "marks": marks_each,
                    "topic": q.get("topic") or spec.get("topics"),
                    "from_bank_id": None,
                })

            shortfall = count - len(questions)
            for _ in range(shortfall):
                questions.append({
                    "question_text": f"[AI returned fewer '{q_type}' questions than requested — add one manually.]",
                    "options": [],
                    "correct_answer": None,
                    "marks": marks_each,
                    "topic": spec.get("topics"),
                    "from_bank_id": None,
                })

            sections.append({
                "type": q_type,
                "instructions": spec.get("instructions") or self._default_section_instructions(q_type, count, marks_each),
                "questions": questions,
            })
        return sections

    def _save_ai_questions_to_bank(self, params, sections):
        """Every real (non-placeholder) AI-generated question gets saved
        into the bank tagged source='ai', so offline mode gets stronger
        every time AI mode is used."""
        for section in sections:
            for q in section["questions"]:
                if not q.get("question_text") or q["question_text"].startswith("["):
                    continue
                try:
                    self.repository.add_question(
                        class_id=params.get("class_id"),
                        subject=params["subject"],
                        topic=q.get("topic"),
                        question_type=section["type"],
                        question_text=q["question_text"],
                        options=q.get("options"),
                        correct_answer=q.get("correct_answer"),
                        marks=q.get("marks", 1),
                        difficulty=params.get("difficulty") or "Medium",
                        source="ai",
                    )
                except Exception as e:
                    logger.warning(f"Could not save AI question to bank: {e}")

    # ==========================================================
    # SAVED PAPERS
    # ==========================================================

    def list_papers(self, class_id=None, subject=None):
        return self.repository.find_papers(class_id, subject)

    def get_paper(self, paper_id):
        paper = self.repository.find_paper_by_id(paper_id)
        if not paper:
            raise PaperNotFoundError("Question paper not found")
        return paper

    def delete_paper(self, paper_id):
        if not self.repository.find_paper_by_id(paper_id):
            raise PaperNotFoundError("Question paper not found")
        self.repository.delete(paper_id)

    # ==========================================================
    # QUESTION BANK CRUD
    # ==========================================================

    def list_bank_questions(self, subject=None, class_id=None, question_type=None, topic=None):
        return self.repository.find_questions(subject=subject, class_id=class_id,
                                                question_type=question_type, topic=topic)

    def add_bank_question(self, data):
        errors = []
        if not data.get("subject"):
            errors.append("Subject is required")
        if not data.get("question_text"):
            errors.append("Question text is required")
        if errors:
            raise PaperValidationError(errors)

        return self.repository.add_question(
            class_id=data.get("class_id"),
            subject=data["subject"],
            topic=data.get("topic"),
            question_type=data.get("question_type") or "Short Answer",
            question_text=data["question_text"],
            options=data.get("options"),
            correct_answer=data.get("correct_answer"),
            marks=data.get("marks") or 1,
            difficulty=data.get("difficulty") or "Medium",
            source="manual",
        )

    def delete_bank_question(self, question_id):
        self.repository.delete_question(question_id)

    def bank_stats(self, subject=None, class_id=None):
        return {
            q_type: self.repository.count_questions(subject=subject, class_id=class_id, question_type=q_type)
            for q_type in QUESTION_TYPES
        }
