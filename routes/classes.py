"""
Class routes (Blueprint). Thin HTTP layer — all logic lives in
services/class_service.py.
"""
from flask import Blueprint, request

from repositories.class_repository import ClassRepository
from services.class_service import (
    ClassService,
    ClassNotFoundError,
    ClassValidationError,
    DuplicateClassNameError,
    SubjectLimitExceededError,
    DuplicateSubjectError,
)
from utils.auth import require_role
from utils.response import success_response, error_response

classes_bp = Blueprint('classes', __name__)

class_repository = ClassRepository()
class_service = ClassService(class_repository)


# ---------- Classes ----------

@classes_bp.route('/api/classes', methods=['GET'])
@require_role('viewer')
def api_get_classes():
    q = request.args.get('q', '').strip()
    result = class_service.list_classes(q)
    return success_response(result)


@classes_bp.route('/api/classes', methods=['POST'])
@require_role('teacher')
def api_create_class():
    data = request.json or {}
    try:
        new_id = class_service.create_class(data)
        return success_response({"id": new_id}, message="Class created successfully", status=201)
    except ClassValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except DuplicateClassNameError as e:
        return error_response(str(e), status=400)
    except Exception as e:
        return error_response(str(e), status=500)


@classes_bp.route('/api/classes/<int:cid>', methods=['GET'])
@require_role('viewer')
def api_get_class(cid):
    try:
        school_class = class_service.get_class(cid)
        return success_response(school_class)
    except ClassNotFoundError as e:
        return error_response(str(e), status=404)


@classes_bp.route('/api/classes/<int:cid>', methods=['PUT'])
@require_role('teacher')
def api_update_class(cid):
    data = request.json or {}
    try:
        class_service.update_class(cid, data)
        return success_response(message="Class updated successfully")
    except ClassValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except ClassNotFoundError as e:
        return error_response(str(e), status=404)
    except DuplicateClassNameError as e:
        return error_response(str(e), status=400)
    except Exception as e:
        return error_response(str(e), status=500)


@classes_bp.route('/api/classes/<int:cid>', methods=['DELETE'])
@require_role('teacher')
def api_delete_class(cid):
    try:
        class_service.delete_class(cid)
        return success_response(message="Class deleted successfully")
    except ClassNotFoundError as e:
        return error_response(str(e), status=404)


# ---------- Class subjects ----------

@classes_bp.route('/api/classes/<int:class_id>/subjects', methods=['GET'])
@require_role('viewer')
def api_get_class_subjects(class_id):
    try:
        result = class_service.list_subjects(class_id)
        return success_response(result)
    except ClassNotFoundError as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)


@classes_bp.route('/api/classes/<int:class_id>/subjects', methods=['POST'])
@require_role('teacher')
def api_add_class_subject(class_id):
    data = request.json or {}
    try:
        class_service.add_subject(class_id, data)
        return success_response(message="Subject added successfully", status=201)
    except ClassValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except ClassNotFoundError as e:
        return error_response(str(e), status=404)
    except SubjectLimitExceededError as e:
        return error_response(str(e), status=400)
    except DuplicateSubjectError as e:
        return error_response(str(e), status=400)
    except Exception as e:
        return error_response(str(e), status=500)


@classes_bp.route('/api/classes/<int:class_id>/subjects/<subject_name>', methods=['DELETE'])
@require_role('teacher')
def api_remove_class_subject(class_id, subject_name):
    class_service.remove_subject(class_id, subject_name)
    return success_response(message="Subject removed successfully")


@classes_bp.route('/api/classes/<int:class_id>/subjects/<subject_name>', methods=['PUT'])
@require_role('teacher')
def api_update_subject_max(class_id, subject_name):
    data = request.json or {}
    try:
        class_service.update_subject_max(class_id, subject_name, data)
        return success_response(message="Subject max marks updated")
    except ClassValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except Exception as e:
        return error_response(str(e), status=500)
