"""
Student Promotion / Year Rollover — shared constants.

No dataclass model here on purpose: promotion_batches / promotion_records
rows are passed around as plain dicts (same style as the Accounts and
Inventory modules), since the repository composes them from a couple of
different tables rather than mapping 1:1 onto a single row shape.
"""

# Decision options for a single student within a promotion batch.
PROMOTED = "Promoted"
RETAINED = "Retained"
GRADUATED = "Graduated"
LEFT = "Left"

PROMOTION_DECISIONS = [PROMOTED, RETAINED, GRADUATED, LEFT]

# Student.status values a promotion decision can result in.
DECISION_TO_STUDENT_STATUS = {
    PROMOTED: "Active",
    RETAINED: "Active",
    GRADUATED: "Graduated",
    LEFT: "Left",
}

BATCH_STATUS_COMPLETED = "Completed"
BATCH_STATUS_UNDONE = "Undone"
