"""
Promotion service — business logic layer sitting between routes and the
promotion repository. Validation lives here so the route stays a thin
HTTP wrapper, matching every other module in this app.
"""
from models.promotion import PROMOTION_DECISIONS, BATCH_STATUS_COMPLETED
from repositories.promotion_repository import PromotionRepository
from utils.logger import get_logger

logger = get_logger(__name__)


class PromotionNotFoundError(Exception):
    pass


class PromotionValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("; ".join(errors))


class PromotionService:

    def __init__(self, repository: PromotionRepository):
        self.repository = repository

    # ---------- Setup screen ----------

    def list_classes(self):
        return self.repository.find_all_classes_with_counts()

    def preview(self, from_class):
        if not from_class:
            raise PromotionValidationError(["from_class is required"])

        roster = self.repository.find_class_roster(from_class)
        suggested_to_class = self.repository.suggest_next_class(from_class)

        return {
            "from_class": from_class,
            "suggested_to_class": suggested_to_class,
            "students": roster,
            "count": len(roster),
            "decisions": PROMOTION_DECISIONS,
        }

    # ---------- Running a batch ----------

    def run_promotion(self, data, created_by):
        errors = self._validate_run_payload(data)
        if errors:
            logger.warning(f"Promotion validation failed: {errors}")
            raise PromotionValidationError(errors)

        from_class = data["from_class"]
        default_to_class = data.get("to_class") or ""
        to_academic_year = data["to_academic_year"]

        records = []
        for item in data["decisions"]:
            decision = item.get("decision") or "Promoted"
            student_id = item["student_id"]
            student_name = item.get("student_name")

            if decision == "Promoted":
                to_class = item.get("to_class") or default_to_class
            elif decision == "Retained":
                to_class = from_class
            else:  # Graduated / Left — no longer in an active class
                to_class = item.get("to_class") or ""

            records.append({
                "student_id": student_id,
                "student_name": student_name,
                "from_class": from_class,
                "to_class": to_class,
                "decision": decision,
                "remarks": item.get("remarks"),
            })

        header = {
            "from_class": from_class,
            "to_class": default_to_class,
            "from_academic_year": data.get("from_academic_year"),
            "to_academic_year": to_academic_year,
            "remarks": data.get("remarks"),
            "created_by": created_by,
        }

        batch_id = self.repository.create_batch_with_records(header, records)
        logger.info(
            f"Promotion batch {batch_id} run: {from_class} -> {default_to_class} "
            f"({len(records)} students) by {created_by}"
        )
        return self.get_batch_detail(batch_id)

    def _validate_run_payload(self, data):
        errors = []

        if not data.get("from_class"):
            errors.append("from_class is required")
        if not data.get("to_academic_year"):
            errors.append("to_academic_year is required")

        decisions = data.get("decisions")
        if not decisions or not isinstance(decisions, list):
            errors.append("decisions must be a non-empty list of students")
            return errors

        for i, item in enumerate(decisions):
            if not item.get("student_id"):
                errors.append(f"decisions[{i}]: student_id is required")
            decision = item.get("decision") or "Promoted"
            if decision not in PROMOTION_DECISIONS:
                errors.append(
                    f"decisions[{i}]: decision must be one of {', '.join(PROMOTION_DECISIONS)}"
                )
            if decision == "Promoted" and not (item.get("to_class") or data.get("to_class")):
                errors.append(f"decisions[{i}]: to_class is required for a Promoted decision")

        return errors

    # ---------- History ----------

    def list_batches(self):
        return self.repository.find_all_batches()

    def get_batch_detail(self, batch_id):
        batch = self.repository.find_batch_by_id(batch_id)
        if not batch:
            raise PromotionNotFoundError("Promotion batch not found")
        batch["records"] = self.repository.find_records_by_batch(batch_id)
        return batch

    def undo_batch(self, batch_id, undone_by):
        batch = self.repository.find_batch_by_id(batch_id)
        if not batch:
            raise PromotionNotFoundError("Promotion batch not found")
        if batch["status"] != BATCH_STATUS_COMPLETED:
            raise PromotionValidationError(["This batch has already been undone"])

        self.repository.undo_batch(batch_id, undone_by)
        logger.info(f"Promotion batch {batch_id} undone by {undone_by}")
        return self.get_batch_detail(batch_id)

    # ---------- Find ----------

    def search(self, query):
        query = (query or "").strip()
        if not query:
            return {"query": query, "records": [], "count": 0}
        records = self.repository.search_records(query)
        return {"query": query, "records": records, "count": len(records)}
