"""
Exam service — business logic for the structured exam-session subsystem
(marksheet grid, mark submission with leaderboard/positions, gazette).
"""
from repositories.exam_repository import ExamRepository
from utils.grading import grade_from_score, gpa_from_score
from utils.logger import get_logger

logger = get_logger(__name__)


class ExamClassNotFoundError(Exception):
    pass


class ExamNotFoundError(Exception):
    pass


class ExamValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("; ".join(errors))


class ExamResultLockedError(Exception):
    pass


class StudentNotFoundInExamError(Exception):
    pass


class ExamService:

    def __init__(self, repository: ExamRepository):
        self.repository = repository

    def get_marksheet(self, class_id, term, year):
        exam_id = self.repository.find_or_create(class_id, term, year)

        class_name = self.repository.find_class_name(class_id)
        if not class_name:
            raise ExamClassNotFoundError("Class not found")

        students = self.repository.find_students_by_grade(class_name)
        subject_list = self.repository.find_class_subjects(class_id)
        marks_map = self.repository.find_marks_matrix(exam_id)

        matrix = []
        for st in students:
            sid = st["id"]
            matrix.append({
                "student_id": sid,
                "name": st["name"],
                "subjects": {
                    sub: marks_map.get(sid, {}).get(sub, None)
                    for sub in subject_list
                }
            })

        return {
            "exam_id": exam_id,
            "class_id": class_id,
            "class_name": class_name,
            "term": term,
            "year": year,
            "subjects": subject_list,
            "students": matrix
        }

    def submit_marks(self, exam_id, marks_data):
        if not exam_id:
            raise ExamValidationError(["exam_id required"])

        exam = self.repository.find_exam_session(exam_id)
        if exam and exam.get("result_locked"):
            raise ExamResultLockedError("Result is locked for this exam. Unlock it before editing marks.")

        subject_max_marks = (
            self.repository.find_class_subjects_max_marks(exam["class_id"]) if exam else {}
        )

        subject_rows = []
        result_rows = []
        leaderboard = []

        for entry in marks_data:
            student_id = entry.get("student_id")
            subjects = entry.get("subjects", {})

            total_obtained = 0
            total_marks = 0

            for subject, obtained in subjects.items():
                if obtained in (None, "", " "):
                    continue
                try:
                    obtained = float(obtained)
                except (TypeError, ValueError):
                    continue

                total_subject = subject_max_marks.get(subject, 100)
                total_obtained += obtained
                total_marks += total_subject
                subject_rows.append((student_id, subject, obtained, total_subject))

            student_name = self.repository.find_student_name(student_id)
            percentage = (total_obtained / total_marks * 100) if total_marks else 0
            grade = grade_from_score(total_obtained, total_marks)
            gpa = gpa_from_score(total_obtained, total_marks)

            leaderboard.append((student_id, student_name, total_obtained, total_marks, percentage, grade, gpa))
            result_rows.append((student_id, student_name, total_obtained, total_marks, percentage, grade, gpa))

        leaderboard.sort(key=lambda x: x[4], reverse=True)
        position_updates = [(idx, row[0]) for idx, row in enumerate(leaderboard, 1)]

        self.repository.submit_marks(exam_id, subject_rows, result_rows, position_updates)
        logger.info(f"Exam marks submitted: exam_id={exam_id}, {len(marks_data)} student(s)")

        return exam_id

    def get_gazette(self, exam_id):
        exam = self.repository.find_exam_session(exam_id)
        if not exam:
            raise ExamNotFoundError("Exam not found")

        class_name = self.repository.find_class_name(exam["class_id"]) or "Unknown"
        subject_list = self.repository.find_class_subjects(exam["class_id"])
        student_results = self.repository.find_student_results_with_names(exam_id)
        marks_map = self.repository.find_marks_matrix(exam_id)

        gazette = []
        for sr in student_results:
            sid = sr["student_id"]
            gazette.append({
                "roll_no": sr["position"],
                "student_name": sr["student_name"],
                "student_id": sid,
                "subjects": {
                    sub: marks_map.get(sid, {}).get(sub, "-")
                    for sub in subject_list
                },
                "total_obtained": sr["total_obtained"],
                "total_marks": sr["total_marks"],
                "percentage": round(sr["percentage"], 2),
                "grade": sr["grade"],
                "position": sr["position"]
            })

        return {
            "exam_id": exam_id,
            "class_name": class_name,
            "term": exam["term"],
            "year": exam["year"],
            "subjects": subject_list,
            "gazette": gazette
        }

    # ==========================================================
    # DATE SHEET
    # ==========================================================

    def get_datesheet(self, exam_id):
        exam = self.repository.find_exam_session(exam_id)
        if not exam:
            raise ExamNotFoundError("Exam not found")
        return self.repository.find_datesheet(exam_id)

    def save_datesheet_entry(self, exam_id, data, entry_id=None):
        subject = (data.get("subject") or "").strip()
        exam_date = (data.get("exam_date") or "").strip()
        if not subject or not exam_date:
            raise ExamValidationError(["subject and exam_date are required"])

        start_time = (data.get("start_time") or "").strip()
        end_time = (data.get("end_time") or "").strip()
        room = (data.get("room") or "").strip()

        return self.repository.save_datesheet_entry(
            exam_id, subject, exam_date, start_time, end_time, room, entry_id
        )

    def delete_datesheet_entry(self, entry_id):
        self.repository.delete_datesheet_entry(entry_id)

    def save_datesheet_bulk(self, exam_id, rows):
        """
        Upsert an entire date sheet in one call — one row per subject.
        Rows missing a subject are ignored. Rows missing exam_date are
        skipped (not saved) rather than failing the whole batch, so a
        partially-filled date sheet can still be saved and finished later.
        """
        exam = self.repository.find_exam_session(exam_id)
        if not exam:
            raise ExamNotFoundError("Exam not found")

        entries = []
        for row in (rows or []):
            subject = (row.get("subject") or "").strip()
            if not subject:
                continue
            exam_date = (row.get("exam_date") or "").strip()
            if not exam_date:
                continue
            start_time = (row.get("start_time") or "").strip()
            end_time = (row.get("end_time") or "").strip()
            room = (row.get("room") or "").strip()
            entry_id = row.get("id")
            entries.append((subject, exam_date, start_time, end_time, room, entry_id))

        if not entries:
            return []

        return self.repository.save_datesheet_bulk(exam_id, entries)

    # ==========================================================
    # SEATING PLAN
    # ==========================================================

    def get_seating(self, exam_id):
        exam = self.repository.find_exam_session(exam_id)
        if not exam:
            raise ExamNotFoundError("Exam not found")
        return self.repository.find_seating(exam_id)

    def generate_seating(self, exam_id, rooms):
        """rooms: list of {room, capacity}. Assigns students of the exam's
        class to rooms round-robin, in student-id order, seat-by-seat."""
        exam = self.repository.find_exam_session(exam_id)
        if not exam:
            raise ExamNotFoundError("Exam not found")
        if not rooms:
            raise ExamValidationError(["At least one room is required"])

        students = self.repository.find_students_for_class(exam["class_id"])
        students.sort(key=lambda s: s["id"])

        entries = []
        room_idx = 0
        seat_counters = {r["room"]: 0 for r in rooms}
        for student in students:
            # find next room with remaining capacity
            attempts = 0
            while attempts < len(rooms):
                room = rooms[room_idx % len(rooms)]
                room_name = room["room"]
                capacity = int(room.get("capacity") or 0)
                if capacity <= 0 or seat_counters[room_name] < capacity:
                    seat_counters[room_name] += 1
                    seat_no = f"{room_name}-{seat_counters[room_name]:02d}"
                    entries.append((student["id"], student["name"], room_name, seat_no))
                    room_idx += 1
                    break
                room_idx += 1
                attempts += 1
            else:
                # all rooms full — overflow into the last room anyway
                room_name = rooms[-1]["room"]
                seat_counters[room_name] += 1
                seat_no = f"{room_name}-{seat_counters[room_name]:02d}"
                entries.append((student["id"], student["name"], room_name, seat_no))

        self.repository.save_seating(exam_id, entries)
        logger.info(f"Seating plan generated: exam_id={exam_id}, {len(entries)} student(s)")
        return self.repository.find_seating(exam_id)

    def save_seating_manual(self, exam_id, entries_data):
        entries = []
        for e in entries_data:
            student_id = e.get("student_id")
            if not student_id:
                continue
            student_name = e.get("student_name") or self.repository.find_student_name(student_id)
            entries.append((student_id, student_name, e.get("room", ""), e.get("seat_no", "")))
        self.repository.save_seating(exam_id, entries)
        return self.repository.find_seating(exam_id)

    # ==========================================================
    # RESULT LOCK / PUBLISH
    # ==========================================================

    def get_status(self, exam_id):
        exam = self.repository.find_exam_session(exam_id)
        if not exam:
            raise ExamNotFoundError("Exam not found")
        return {
            "exam_id": exam_id,
            "result_locked": bool(exam.get("result_locked")),
            "result_published": bool(exam.get("result_published")),
        }

    def lock_result(self, exam_id):
        self._ensure_exam_exists(exam_id)
        self.repository.set_lock_status(exam_id, True)
        logger.info(f"Result locked: exam_id={exam_id}")

    def unlock_result(self, exam_id):
        self._ensure_exam_exists(exam_id)
        self.repository.set_lock_status(exam_id, False)
        logger.info(f"Result unlocked: exam_id={exam_id}")

    def publish_result(self, exam_id):
        self._ensure_exam_exists(exam_id)
        self.repository.set_publish_status(exam_id, True)
        logger.info(f"Result published: exam_id={exam_id}")

    def unpublish_result(self, exam_id):
        self._ensure_exam_exists(exam_id)
        self.repository.set_publish_status(exam_id, False)
        logger.info(f"Result unpublished: exam_id={exam_id}")

    def _ensure_exam_exists(self, exam_id):
        exam = self.repository.find_exam_session(exam_id)
        if not exam:
            raise ExamNotFoundError("Exam not found")
        return exam

    # ==========================================================
    # GRACE MARKS
    # ==========================================================

    def apply_grace_marks(self, exam_id, student_id, subject, grace_marks):
        exam = self._ensure_exam_exists(exam_id)
        if exam.get("result_locked"):
            raise ExamResultLockedError("Result is locked for this exam. Unlock it before adjusting grace marks.")

        try:
            grace_marks = float(grace_marks)
        except (TypeError, ValueError):
            raise ExamValidationError(["grace_marks must be a number"])

        subjects = self.repository.find_subject_marks_for_student(exam_id, student_id)
        if not subjects:
            raise StudentNotFoundInExamError("No marks found for this student in this exam")
        if subject not in [s["subject"] for s in subjects]:
            raise ExamValidationError([f"Subject '{subject}' not found for this student"])

        self.repository.apply_grace_marks(exam_id, student_id, subject, grace_marks)

        # Recompute the student's aggregate result from all subjects
        # (base obtained marks + any grace marks applied per subject),
        # capped so grace marks can never push a subject above its total.
        subjects = self.repository.find_subject_marks_for_student(exam_id, student_id)
        total_obtained = 0.0
        total_marks = 0.0
        total_grace = 0.0
        for s in subjects:
            base = s["obtained_marks"] or 0
            grace = s["grace_marks"] or 0
            total = s["total_marks"] or 0
            adjusted = min(base + grace, total)
            total_obtained += adjusted
            total_marks += total
            total_grace += grace

        percentage = (total_obtained / total_marks * 100) if total_marks else 0
        grade = grade_from_score(total_obtained, total_marks)
        gpa = gpa_from_score(total_obtained, total_marks)

        self.repository.recompute_student_result(
            exam_id, student_id, total_obtained, total_marks, percentage, grade, gpa, total_grace
        )
        self.repository.recompute_positions(exam_id)
        logger.info(f"Grace marks applied: exam_id={exam_id}, student_id={student_id}, subject={subject}, grace={grace_marks}")

    # ==========================================================
    # GPA / CGPA
    # ==========================================================

    def get_gpa_list(self, exam_id):
        self._ensure_exam_exists(exam_id)
        return self.repository.find_gpa_list(exam_id)

    def get_cgpa(self, student_id):
        rows = self.repository.find_all_gpas_for_student(student_id)
        if not rows:
            return {"student_id": student_id, "cgpa": None, "exams": []}
        avg = sum(r["gpa"] for r in rows if r["gpa"] is not None) / len(rows)
        return {
            "student_id": student_id,
            "cgpa": round(avg, 2),
            "exams": rows
        }

    # ==========================================================
    # POSITION HOLDERS / MERIT LIST
    # ==========================================================

    def get_position_holders(self, exam_id, top_n=3):
        self._ensure_exam_exists(exam_id)
        return self.repository.find_top_students(exam_id, top_n)

    def get_merit_list(self, term, year, top_n=10, class_id=None):
        if not term or not year:
            raise ExamValidationError(["term and year are required"])
        return self.repository.find_merit_list(term, year, top_n, class_id)

    # ==========================================================
    # ADMIT CARD
    # ==========================================================

    def get_admit_card(self, exam_id, student_id):
        exam = self._ensure_exam_exists(exam_id)
        student = self.repository.find_student_by_id(student_id)
        if not student:
            raise StudentNotFoundInExamError("Student not found")

        class_name = self.repository.find_class_name(exam["class_id"]) or ""
        datesheet = self.repository.find_datesheet(exam_id)
        seat = self.repository.find_seating_for_student(exam_id, student_id)

        return {
            "exam_id": exam_id,
            "term": exam["term"],
            "year": exam["year"],
            "class_name": class_name,
            "student_id": student["id"],
            "student_name": student["name"],
            "father_name": student.get("parent_name"),
            "photo_path": student.get("photo_path"),
            "room": seat["room"] if seat else None,
            "seat_no": seat["seat_no"] if seat else None,
            "datesheet": datesheet,
        }

    def get_bulk_admit_cards(self, exam_id):
        exam = self._ensure_exam_exists(exam_id)
        students = self.repository.find_students_for_class(exam["class_id"])
        return [self.get_admit_card(exam_id, s["id"]) for s in students]
