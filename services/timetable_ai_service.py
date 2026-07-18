"""
Timetable Generator — service layer (AI Tools).

Same two-path pattern as the other AI Features: an "ai" path that asks
the configured provider for a *soft preference* (subject ordering /
which subjects work best earlier in the day), and an "offline" path
that just uses a sensible default ordering. Either way, the actual
grid-filling and conflict avoidance is done by deterministic Python —
never by the AI — because a wrong/hallucinated timetable (double-
booking a teacher across two classes, say) is a real-world problem,
not a cosmetic one. This mirrors how grace marks / voided ledger
entries etc. are handled elsewhere in this codebase: AI (or any
generation shortcut) proposes, the backend is the source of truth.

Uses the existing `timetable` table directly (class_id, day_of_week,
period_number, unique together) — no new table needed.
"""
from models.timetable import TimetableSlot, DAYS_OF_WEEK
from repositories.class_repository import ClassRepository
from repositories.teacher_repository import TeacherRepository
from repositories.timetable_repository import TimetableRepository
from repositories.settings_repository import SettingsRepository
from utils.ai_client import call_ai, extract_json, is_configured, AIProviderNotConfiguredError, AIProviderError
from utils.logger import get_logger

logger = get_logger(__name__)


class TimetableGenClassNotFoundError(Exception):
    pass


class TimetableGenValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors if isinstance(errors, list) else [errors]
        super().__init__("; ".join(self.errors))


class TimetableGeneratorService:

    def __init__(self, class_repository: ClassRepository, teacher_repository: TeacherRepository,
                 timetable_repository: TimetableRepository, settings_repository: SettingsRepository):
        self.class_repository = class_repository
        self.teacher_repository = teacher_repository
        self.timetable_repository = timetable_repository
        self.settings_repository = settings_repository

    # ==========================================================
    # CONTEXT — what the generator form should show/default to
    # ==========================================================

    def get_context(self, class_id):
        class_name = self.timetable_repository.find_class_name(class_id)
        if not class_name:
            raise TimetableGenClassNotFoundError("Class not found")

        subjects = self.class_repository.find_subjects(class_id)
        subject_names = [s.subject_name for s in subjects]

        subject_teachers = {}
        for name in subject_names:
            teachers = self.teacher_repository.find_all(subject_filter=name)
            subject_teachers[name] = [{"id": t.id, "name": t.name} for t in teachers]

        existing_slots = self.timetable_repository.find_by_class(class_id)

        return {
            "class_id": class_id,
            "class_name": class_name,
            "subjects": subject_names,
            "subject_teachers": subject_teachers,
            "days_of_week": DAYS_OF_WEEK,
            "existing_slot_count": len(existing_slots),
        }

    # ==========================================================
    # GENERATE
    # ==========================================================

    def generate(self, class_id, params, created_by=None):
        class_name = self.timetable_repository.find_class_name(class_id)
        if not class_name:
            raise TimetableGenClassNotFoundError("Class not found")

        errors = []
        days = [d for d in (params.get("days") or DAYS_OF_WEEK[:5]) if d in DAYS_OF_WEEK]
        if not days:
            errors.append("At least one valid day is required")
        try:
            periods_per_day = int(params.get("periods_per_day") or 7)
            if periods_per_day < 1 or periods_per_day > 15:
                errors.append("Periods per day must be between 1 and 15")
        except (TypeError, ValueError):
            errors.append("Periods per day must be a number")
            periods_per_day = 7
        try:
            period_duration = int(params.get("period_duration_minutes") or 40)
        except (TypeError, ValueError):
            period_duration = 40
        start_time = params.get("start_time") or "08:00"
        break_periods = set(int(p) for p in (params.get("break_periods") or []) if str(p).isdigit())
        overwrite = bool(params.get("overwrite", False))
        mode = (params.get("mode") or "auto").strip().lower()

        subjects = self.class_repository.find_subjects(class_id)
        subject_names = [s.subject_name for s in subjects]
        if not subject_names:
            errors.append("This class has no subjects configured yet (Classes → Subjects)")
        if errors:
            raise TimetableGenValidationError(errors)

        teachable_periods = [(d, p) for d in days for p in range(1, periods_per_day + 1) if p not in break_periods]
        total_slots = len(teachable_periods)

        subject_periods = params.get("subject_periods") or {}
        subject_periods = self._normalize_subject_periods(subject_names, subject_periods, total_slots)

        # ---- ordering preference (AI or offline default) ----
        warning = None
        if mode == "offline":
            order, used_mode = subject_names, "offline"
        elif mode == "ai":
            order, used_mode = self._ai_subject_order(class_name, subject_names), "ai"
        else:  # auto
            if is_configured(self.settings_repository):
                try:
                    order, used_mode = self._ai_subject_order(class_name, subject_names), "ai"
                except (AIProviderNotConfiguredError, AIProviderError) as e:
                    logger.warning(f"AI timetable ordering failed, using default order: {e}")
                    warning = f"AI suggestion failed ({e}); used default subject ordering."
                    order, used_mode = subject_names, "offline"
            else:
                warning = "No AI provider is configured in Settings — used default subject ordering."
                order, used_mode = subject_names, "offline"

        # AI might drop/invent subjects — sanitize back to the real list
        order = [s for s in order if s in subject_names]
        for s in subject_names:
            if s not in order:
                order.append(s)

        # ---- teacher resolution: first teacher on file for each subject ----
        subject_teacher = {}
        for name in subject_names:
            teachers = self.teacher_repository.find_all(subject_filter=name)
            subject_teacher[name] = teachers[0] if teachers else None

        # ---- existing slots (to respect overwrite=False) ----
        existing = {(s.day_of_week, s.period_number): s for s in self.timetable_repository.find_by_class(class_id)}

        grid, conflicts = self._fill_grid(
            days, periods_per_day, break_periods, order, subject_periods,
            subject_teacher, class_id, existing, overwrite
        )

        saved = 0
        for (day, period), cell in grid.items():
            if cell is None or cell.get("_skip_save"):
                continue
            teacher = cell["teacher"]
            slot = TimetableSlot(
                id=None,
                class_id=class_id,
                day_of_week=day,
                period_number=period,
                start_time=self._period_start(start_time, period_duration, period),
                end_time=self._period_end(start_time, period_duration, period),
                subject=cell["subject"],
                teacher_id=teacher.id if teacher else None,
                teacher_name=teacher.name if teacher else None,
            )
            self.timetable_repository.upsert_slot(slot)
            saved += 1

        result = {
            "class_id": class_id,
            "class_name": class_name,
            "slots_saved": saved,
            "generation_mode_used": used_mode,
            "subject_periods": subject_periods,
            "conflicts": conflicts,
            "days": days,
            "periods_per_day": periods_per_day,
            "break_periods": sorted(break_periods),
            "timetable": [s.to_dict() for s in self.timetable_repository.find_by_class(class_id)],
        }
        if warning:
            result["warning"] = warning
        return result

    # ==========================================================
    # SUBJECT PERIOD DISTRIBUTION
    # ==========================================================

    def _normalize_subject_periods(self, subject_names, requested, total_slots):
        """Fill in any subjects missing from `requested` by splitting the
        remaining weekly slots as evenly as possible."""
        result = {}
        remaining_slots = total_slots
        remaining_subjects = []
        for name in subject_names:
            if name in requested:
                try:
                    count = max(0, int(requested[name]))
                except (TypeError, ValueError):
                    count = 0
                result[name] = count
                remaining_slots -= count
            else:
                remaining_subjects.append(name)

        if remaining_subjects and remaining_slots > 0:
            base = remaining_slots // len(remaining_subjects)
            extra = remaining_slots % len(remaining_subjects)
            for i, name in enumerate(remaining_subjects):
                result[name] = base + (1 if i < extra else 0)
        else:
            for name in remaining_subjects:
                result[name] = 0

        return result

    # ==========================================================
    # GRID FILLING (deterministic, conflict-aware)
    # ==========================================================

    def _fill_grid(self, days, periods_per_day, break_periods, order, subject_periods,
                    subject_teacher, class_id, existing, overwrite):
        grid = {}
        conflicts = []

        for d in days:
            for p in range(1, periods_per_day + 1):
                if p in break_periods:
                    grid[(d, p)] = {"subject": "Break", "teacher": None, "_skip_save": True}
                elif not overwrite and (d, p) in existing:
                    ex = existing[(d, p)]
                    grid[(d, p)] = {"subject": ex.subject, "teacher": None, "_skip_save": True}
                else:
                    grid[(d, p)] = None  # open slot

        open_slots = [(d, p) for d in days for p in range(1, periods_per_day + 1) if grid[(d, p)] is None]

        # Round-robin over subjects (in preference order) rather than
        # filling one subject at a time, so a subject's periods spread
        # across the week instead of clustering on one or two days.
        interleaved = self._interleave(order, subject_periods)

        day_subject_count = {d: {} for d in days}  # per-day count per subject, to avoid clustering

        for subject in interleaved:
            if not open_slots:
                break
            teacher = subject_teacher.get(subject)

            placed = False
            # Prefer a day where this subject hasn't appeared yet today, and
            # where the teacher isn't already booked in another class.
            for idx, (d, p) in enumerate(open_slots):
                same_day_count = day_subject_count[d].get(subject, 0)
                teacher_busy = (
                    teacher is not None and
                    self.timetable_repository.find_teacher_conflict(d, p, teacher.id, exclude_class_id=class_id) is not None
                )
                if same_day_count == 0 and not teacher_busy:
                    grid[(d, p)] = {"subject": subject, "teacher": teacher}
                    day_subject_count[d][subject] = same_day_count + 1
                    open_slots.pop(idx)
                    placed = True
                    break

            if not placed:
                # relax the "not already today" rule, keep the teacher-conflict check
                for idx, (d, p) in enumerate(open_slots):
                    teacher_busy = (
                        teacher is not None and
                        self.timetable_repository.find_teacher_conflict(d, p, teacher.id, exclude_class_id=class_id) is not None
                    )
                    if not teacher_busy:
                        grid[(d, p)] = {"subject": subject, "teacher": teacher}
                        day_subject_count[d][subject] = day_subject_count[d].get(subject, 0) + 1
                        open_slots.pop(idx)
                        placed = True
                        break

            if not placed and open_slots:
                # last resort: relax the teacher-conflict rule too, and flag it
                d, p = open_slots.pop(0)
                grid[(d, p)] = {"subject": subject, "teacher": teacher}
                day_subject_count[d][subject] = day_subject_count[d].get(subject, 0) + 1
                if teacher is not None:
                    conflicts.append(
                        f"{subject} on {d} period {p}: {teacher.name} may already be teaching "
                        f"another class at this time — please review."
                    )

        return grid, conflicts

    def _interleave(self, order, subject_periods):
        """[MathA, EngA, MathB, EngB, ...] instead of [MathA, MathB, ..., EngA, ...],
        so subjects spread across the week instead of clustering."""
        remaining = {name: subject_periods.get(name, 0) for name in order}
        out = []
        while any(remaining.values()):
            for name in order:
                if remaining[name] > 0:
                    out.append(name)
                    remaining[name] -= 1
        return out

    # ==========================================================
    # TIME HELPERS
    # ==========================================================

    def _period_start(self, start_time, duration_minutes, period_number):
        return self._add_minutes(start_time, duration_minutes * (period_number - 1))

    def _period_end(self, start_time, duration_minutes, period_number):
        return self._add_minutes(start_time, duration_minutes * period_number)

    def _add_minutes(self, hhmm, minutes):
        try:
            h, m = (int(x) for x in hhmm.split(":")[:2])
        except (ValueError, AttributeError):
            h, m = 8, 0
        total = h * 60 + m + minutes
        total %= 24 * 60
        return f"{total // 60:02d}:{total % 60:02d}"

    # ==========================================================
    # AI SUBJECT ORDERING (soft preference only)
    # ==========================================================

    def _ai_subject_order(self, class_name, subject_names):
        prompt = f"""A school is building a weekly class timetable for {class_name}.
The subjects taught in this class are: {", ".join(subject_names)}.

Suggest the best ORDER to prioritize these subjects for earlier time
slots in the day (e.g. subjects needing focus/concentration like Math
or Science are usually best earlier; lighter subjects like Art or
Games later). This is only a scheduling preference, not a full
timetable.

Respond with ONLY a JSON object (no markdown, no prose) in exactly
this shape:
{{"order": ["Subject A", "Subject B", ...]}}

The array must contain exactly these subjects, each exactly once,
using the exact spelling given: {", ".join(subject_names)}"""

        raw = call_ai(
            self.settings_repository,
            prompt,
            system="You are a helpful school administrator experienced in academic scheduling.",
            max_tokens=300,
        )
        data = extract_json(raw)
        order = data.get("order")
        if not isinstance(order, list) or not order:
            raise AIProviderError("AI response did not contain a valid subject order")
        return order
