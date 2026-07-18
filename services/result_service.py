"""
Result service — business logic for the legacy flat results table:
CRUD, result cards, bulk cards, and the Excel bulk-grid entry endpoints.
"""
from datetime import datetime

from models.result import Result
from repositories.result_repository import ResultRepository
from utils.validators import validate_result_payload
from utils.grading import grade_from_score
from utils.logger import get_logger

logger = get_logger(__name__)


class ResultNotFoundError(Exception):
    pass


class ResultValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("; ".join(errors))


class ClassNotFoundForResultsError(Exception):
    pass


class NoStudentsFoundError(Exception):
    pass


class StudentNotFoundForResultError(Exception):
    pass


class ResultService:

    def __init__(self, repository: ResultRepository):
        self.repository = repository

    # ---------- Legacy CRUD ----------

    def list_results(self, query="", student_id="", term="", class_filter="",
                      date_from="", date_to=""):
        results = self.repository.find_all_filtered(
            query, student_id, term, class_filter, date_from, date_to
        )
        students = self.repository.find_students_for_dropdown()
        return {"results": results, "students": students}

    def create_result(self, data):
        errors = validate_result_payload(data)
        if errors:
            logger.warning(f"Result validation failed: {errors} | payload={data}")
            raise ResultValidationError(errors)

        student_name = self.repository.find_student_name(data.get('student_id'))
        obt = float(data.get('obtained_marks', 0))
        tot = float(data.get('total_marks', 0))
        grade = grade_from_score(obt, tot)

        result = Result(
            id=None,
            student_id=data.get('student_id'),
            student_name=student_name,
            subject=data.get('subject'),
            obtained_marks=obt,
            total_marks=tot,
            grade=grade,
            term=data.get('term'),
            year=data.get('year'),
            exam_date=data.get('exam_date'),
        )
        new_id = self.repository.create(result)
        logger.info(f"Result created: {new_id} (student={result.student_id}, subject={result.subject})")
        return new_id

    def update_result(self, rid, data):
        errors = validate_result_payload(data)
        if errors:
            logger.warning(f"Result validation failed on update: {errors} | id={rid}")
            raise ResultValidationError(errors)

        if not self.repository.exists(rid):
            logger.warning(f"Result update failed — not found: {rid}")
            raise ResultNotFoundError("Result not found")

        student_name = self.repository.find_student_name(data.get('student_id'))
        obt = float(data.get('obtained_marks', 0))
        tot = float(data.get('total_marks', 0))
        grade = grade_from_score(obt, tot)

        result = Result(
            id=rid,
            student_id=data.get('student_id'),
            student_name=student_name,
            subject=data.get('subject'),
            obtained_marks=obt,
            total_marks=tot,
            grade=grade,
            term=data.get('term'),
            year=data.get('year'),
            exam_date=data.get('exam_date'),
        )
        self.repository.update(rid, result)
        logger.info(f"Result updated: {rid}")

    def delete_result(self, rid):
        if not self.repository.exists(rid):
            logger.warning(f"Result delete failed — not found: {rid}")
            raise ResultNotFoundError("Result not found")

        self.repository.delete(rid)
        logger.info(f"Result deleted: {rid}")

    # ---------- Result card / bulk cards ----------

    def get_result_card(self, sid):
        student = self.repository.find_student(sid)
        if not student:
            raise StudentNotFoundForResultError("Student not found")

        results = self.repository.find_results_for_student(sid)
        if not results:
            return {
                "student": student,
                "results": [],
                "total_obtained": 0,
                "total_marks": 0,
                "percentage": 0,
                "overall_grade": "N/A",
                "year": ""
            }

        total_obtained = sum(r["obtained_marks"] for r in results)
        total_marks = sum(r["total_marks"] for r in results)
        percentage = round((total_obtained / total_marks) * 100) if total_marks else 0
        overall_grade = grade_from_score(total_obtained, total_marks)

        return {
            "student": student,
            "results": results,
            "total_obtained": total_obtained,
            "total_marks": total_marks,
            "percentage": percentage,
            "overall_grade": overall_grade,
            "year": results[0]["year"] if results else ""
        }

    def get_bulk_result_cards(self, class_id, term, year):
        class_name = self.repository.find_class_name(class_id)
        if not class_name:
            raise ClassNotFoundForResultsError("Class not found")

        students = self.repository.find_students_by_grade(class_name)
        if not students:
            raise NoStudentsFoundError("No students found for this class")

        student_ids = [s['id'] for s in students]
        results = self.repository.find_results_for_students_term_year(student_ids, term, year)

        results_map = {}
        for r in results:
            results_map.setdefault(r['student_id'], []).append({
                'subject': r['subject'],
                'obtained': r['obtained_marks'],
                'total': r['total_marks'],
                'grade': r['grade']
            })

        cards_data = []
        for s in students:
            sid = s['id']
            student_results = results_map.get(sid, [])
            total_obtained = sum(r['obtained'] for r in student_results)
            total_marks = sum(r['total'] for r in student_results)
            percentage = (total_obtained / total_marks * 100) if total_marks else 0
            overall_grade = grade_from_score(total_obtained, total_marks)

            cards_data.append({
                'student_id': sid,
                'student_name': s['name'],
                'class_name': class_name,
                'subjects': student_results,
                'total_obtained': total_obtained,
                'total_marks': total_marks,
                'percentage': round(percentage, 2),
                'overall_grade': overall_grade,
                'term': term,
                'year': year
            })

        return {
            'class_name': class_name,
            'term': term,
            'year': year,
            'students': cards_data
        }

    # ---------- Excel bulk grid ----------
    #
    # NOTE ON EXISTING BEHAVIOR: marks entered above a subject's max_marks
    # are silently capped rather than rejected. This matches the original
    # app.py exactly — it was flagged in the earlier code review as
    # something you may want to change to a hard validation error instead.
    # I left it as-is here since this migration is a structural move, not
    # a behavior change, but flagging again since we're formalizing this
    # module.

    def get_excel_sheet(self, grade="", class_id="", term="", year=""):
        class_name = None

        if class_id and str(class_id).isdigit():
            class_name = self.repository.find_class_name(int(class_id))

        if not class_name and grade:
            class_name = self.repository.find_class_name_like(grade)

        subjects = []
        if class_id and str(class_id).isdigit():
            subjects = self.repository.find_class_subjects(int(class_id))

        if not subjects:
            subjects = [
                {"name": "Mathematics", "max_marks": 100},
                {"name": "English", "max_marks": 100},
                {"name": "Urdu", "max_marks": 100},
                {"name": "Science", "max_marks": 100},
                {"name": "Islamiat", "max_marks": 100},
                {"name": "Computer Science", "max_marks": 100},
            ]

        students_rows = []
        if class_name:
            students_rows = self.repository.find_students_by_grade(class_name)
        elif grade:
            students_rows = self.repository.find_students_by_grade_pattern(grade)

        marks_rows = self.repository.find_marks_for_term_year(term, year)
        marks_map = {}
        for m in marks_rows:
            marks_map.setdefault(m["student_id"], {})[m["subject"]] = m["obtained_marks"]

        sheet_data = []
        for s in students_rows:
            sheet_data.append({
                "student_id": s["id"],
                "id": s["id"],
                "student_name": s["name"],
                "name": s["name"],
                "marks": {
                    sub["name"]: marks_map.get(s["id"], {}).get(sub["name"], "")
                    for sub in subjects
                }
            })

        return {
            "subjects": subjects,
            "students": sheet_data,
            "sheet": sheet_data,
            "rows": sheet_data
        }

    def save_excel_sheet(self, data):
        grade_val = data.get('grade')
        class_id = data.get('class_id')
        term = data.get('term')
        year = data.get('year')
        rows = data.get('rows', [])

        if not class_id and grade_val:
            class_id = self.repository.find_class_id_by_name(grade_val)

        upserts = []
        deletes = []

        for row in rows:
            student_id = row.get('student_id')
            student_name = row.get('student_name')
            marks_data = row.get('marks', {})

            for subject_name, obtained_val in marks_data.items():
                max_marks = 100
                if class_id:
                    found_max = self.repository.find_subject_max_marks(class_id, subject_name)
                    if found_max is not None:
                        max_marks = found_max

                if obtained_val is None or str(obtained_val).strip() == '':
                    deletes.append((student_id, subject_name, term, year))
                    continue

                try:
                    obtained_marks = float(obtained_val)
                except ValueError:
                    continue

                if obtained_marks > max_marks:
                    obtained_marks = max_marks  # soft cap — see note above

                grade_badge = grade_from_score(obtained_marks, max_marks)
                total_marks = max_marks

                existing_id = self.repository.find_existing_result_id(
                    student_id, subject_name, term, year
                )

                upserts.append((
                    existing_id, student_id, student_name, subject_name,
                    obtained_marks, total_marks, grade_badge, term, year,
                    datetime.now().strftime("%Y-%m-%d")
                ))

        self.repository.bulk_save_grid(upserts, deletes)
        logger.info(
            f"Excel grid saved: class_id={class_id}, term={term}, year={year}, "
            f"{len(upserts)} cell(s) upserted, {len(deletes)} cleared"
        )
