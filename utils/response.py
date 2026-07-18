"""
Standardized JSON response helpers used across all route handlers.

Shape:
    {
        "success": true | false,
        "message": "...",
        "error": "..." | undefined,     (present on failure — legacy key
                                          your existing frontend reads)
        "data": {...} | [...] | {},     (nested, for new/consistent access)
        ...and, when data is a dict, ITS KEYS ARE ALSO FLATTENED to the
        top level (e.g. "students", "grades", "id") — because the
        existing frontend (static/js/app.js) reads fields straight off
        the top-level response object (data.students, data.teachers,
        data.classes, ...), not from data.data.*.

    This keeps the response self-describing and consistent (success/
    message always present) WITHOUT breaking every list/table in the
    UI that expects the old flat shape. New code can use response.data.*
    going forward; existing frontend code keeps working unchanged.
"""
from flask import jsonify


def success_response(data=None, message="", status=200):
    """Build a successful JSON response, flattened for frontend compatibility."""
    body = {"success": True, "message": message}

    if isinstance(data, dict):
        body.update(data)   # flatten: data.students, data.id, etc. at top level
        body["data"] = data  # also nested, for consistent/new-style access
    elif data is not None:
        body["data"] = data

    return jsonify(body), status


def error_response(message, status=400, data=None):
    """Build an error response, flattened for frontend compatibility."""
    body = {"success": False, "message": message, "error": message}

    if isinstance(data, dict):
        body.update(data)
        body["data"] = data
    elif data is not None:
        body["data"] = data

    return jsonify(body), status
