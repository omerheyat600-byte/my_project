"""
Shared grade-calculation logic.

Your original app.py computed letter grades in two separate places with
identical thresholds (grade_from_score(), and a second inline if/elif
chain inside the Excel bulk-save endpoint) — one of the duplication
issues flagged in the earlier code review. Both now call this single
function.
"""


def grade_from_score(obtained, total):
    """Calculate a letter grade from obtained/total marks."""
    if not total:
        return "N/A"
    pct = (obtained / total) * 100
    if pct >= 90:
        return "A+"
    if pct >= 80:
        return "A"
    if pct >= 70:
        return "B+"
    if pct >= 60:
        return "B"
    if pct >= 50:
        return "C"
    if pct >= 40:
        return "D"
    return "F"


# GPA points on a 4.0 scale, keyed to the same thresholds as grade_from_score
# so a grade and its GPA point always agree.
GPA_SCALE = [
    (90, "A+", 4.0),
    (80, "A", 3.7),
    (70, "B+", 3.3),
    (60, "B", 3.0),
    (50, "C", 2.5),
    (40, "D", 2.0),
    (0, "F", 0.0),
]


def gpa_from_score(obtained, total):
    """Calculate a GPA point (0.0 - 4.0) from obtained/total marks."""
    if not total:
        return 0.0
    pct = (obtained / total) * 100
    for threshold, _label, points in GPA_SCALE:
        if pct >= threshold:
            return points
    return 0.0
