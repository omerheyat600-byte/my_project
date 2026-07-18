"""
User management routes (Blueprint). Thin HTTP layer — all logic lives
in services/user_service.py.
"""
from flask import Blueprint, request, jsonify

from repositories.user_repository import UserRepository
from services.user_service import (
    UserService,
    UserValidationError,
    UsernameTakenError,
    LastAdminError,
)
from utils.auth import require_role

users_bp = Blueprint('users', __name__)

user_repository = UserRepository()
user_service = UserService(user_repository)


@users_bp.route('/api/users', methods=['GET'])
@require_role('admin')
def api_get_users():
    return jsonify({"users": user_service.list_users()})


@users_bp.route('/api/users', methods=['POST'])
@require_role('admin')
def api_create_user():
    data = request.json or {}
    try:
        user_service.create_user(data)
        return jsonify({"message": "User created successfully"}), 201
    except UserValidationError as e:
        return jsonify({"error": e.errors[0] if e.errors else "Invalid data"}), 400
    except UsernameTakenError as e:
        return jsonify({"error": str(e)}), 400


@users_bp.route('/api/users/<int:user_id>', methods=['PUT'])
@require_role('admin')
def api_update_user(user_id):
    data = request.json or {}
    try:
        user_service.update_user(user_id, data)
        return jsonify({"message": "User updated successfully"})
    except UserValidationError as e:
        return jsonify({"error": e.errors[0] if e.errors else "Invalid data"}), 400


@users_bp.route('/api/users/<int:user_id>', methods=['DELETE'])
@require_role('admin')
def api_delete_user(user_id):
    try:
        user_service.delete_user(user_id)
        return jsonify({"message": "User deleted successfully"})
    except LastAdminError as e:
        return jsonify({"error": str(e)}), 400
