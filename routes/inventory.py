"""
Inventory routes (Blueprint). Thin HTTP layer — all logic lives in
services/inventory_service.py.

Sub-areas: Vendors, Items (Uniform / Books / Stationery), Stock In /
Stock Out, and Purchases.
"""
from flask import Blueprint, request, session

from repositories.inventory_repository import InventoryRepository
from services.inventory_service import (
    InventoryService,
    InventoryValidationError,
    VendorNotFoundError,
    ItemNotFoundError,
    PurchaseNotFoundError,
    InsufficientStockError,
    VendorInUseError,
)
from utils.auth import require_role
from utils.response import success_response, error_response

inventory_bp = Blueprint('inventory', __name__)

inventory_repository = InventoryRepository()
inventory_service = InventoryService(inventory_repository)


def _current_user():
    return session.get('username') or session.get('user_id')


# ---------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------

@inventory_bp.route('/api/inventory/dashboard', methods=['GET'])
@require_role('viewer')
def api_inventory_dashboard():
    return success_response(inventory_service.get_dashboard())


# ---------------------------------------------------------------
# Vendors
# ---------------------------------------------------------------

@inventory_bp.route('/api/inventory/vendors', methods=['GET'])
@require_role('viewer')
def api_get_vendors():
    q = request.args.get('q', '').strip()
    return success_response(inventory_service.list_vendors(q))


@inventory_bp.route('/api/inventory/vendors/<int:vendor_id>', methods=['GET'])
@require_role('viewer')
def api_get_vendor(vendor_id):
    try:
        return success_response(inventory_service.get_vendor(vendor_id))
    except VendorNotFoundError as e:
        return error_response(str(e), status=404)


@inventory_bp.route('/api/inventory/vendors', methods=['POST'])
@require_role('teacher')
def api_create_vendor():
    data = request.json or {}
    try:
        new_id = inventory_service.create_vendor(data)
        return success_response({"id": new_id}, message="Vendor added successfully", status=201)
    except InventoryValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except Exception as e:
        return error_response(str(e), status=500)


@inventory_bp.route('/api/inventory/vendors/<int:vendor_id>', methods=['PUT'])
@require_role('teacher')
def api_update_vendor(vendor_id):
    data = request.json or {}
    try:
        inventory_service.update_vendor(vendor_id, data)
        return success_response(message="Vendor updated successfully")
    except InventoryValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except VendorNotFoundError as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)


@inventory_bp.route('/api/inventory/vendors/<int:vendor_id>', methods=['DELETE'])
@require_role('admin')
def api_delete_vendor(vendor_id):
    try:
        inventory_service.delete_vendor(vendor_id)
        return success_response(message="Vendor deleted successfully")
    except VendorNotFoundError as e:
        return error_response(str(e), status=404)
    except VendorInUseError as e:
        return error_response(str(e), status=409)


# ---------------------------------------------------------------
# Items (Uniform / Books / Stationery)
# ---------------------------------------------------------------

@inventory_bp.route('/api/inventory/items', methods=['GET'])
@require_role('viewer')
def api_get_items():
    item_type = request.args.get('type', '').strip()
    q = request.args.get('q', '').strip()
    low_stock = request.args.get('low_stock', '').strip().lower() in ('1', 'true', 'yes')
    try:
        return success_response(inventory_service.list_items(item_type, q, low_stock))
    except InventoryValidationError as e:
        return error_response("; ".join(e.errors), status=400)


@inventory_bp.route('/api/inventory/items/<int:item_id>', methods=['GET'])
@require_role('viewer')
def api_get_item(item_id):
    try:
        return success_response(inventory_service.get_item(item_id))
    except ItemNotFoundError as e:
        return error_response(str(e), status=404)


@inventory_bp.route('/api/inventory/items', methods=['POST'])
@require_role('teacher')
def api_create_item():
    data = request.json or {}
    try:
        new_id = inventory_service.create_item(data)
        return success_response({"id": new_id}, message="Item added successfully", status=201)
    except InventoryValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except Exception as e:
        return error_response(str(e), status=500)


@inventory_bp.route('/api/inventory/items/<int:item_id>', methods=['PUT'])
@require_role('teacher')
def api_update_item(item_id):
    data = request.json or {}
    try:
        inventory_service.update_item(item_id, data)
        return success_response(message="Item updated successfully")
    except InventoryValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except ItemNotFoundError as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)


@inventory_bp.route('/api/inventory/items/<int:item_id>', methods=['DELETE'])
@require_role('admin')
def api_delete_item(item_id):
    try:
        inventory_service.delete_item(item_id)
        return success_response(message="Item deleted successfully")
    except ItemNotFoundError as e:
        return error_response(str(e), status=404)


# ---------------------------------------------------------------
# Stock In / Stock Out
# ---------------------------------------------------------------

@inventory_bp.route('/api/inventory/movements', methods=['GET'])
@require_role('viewer')
def api_get_movements():
    item_id = request.args.get('item_id', '').strip()
    movement_type = request.args.get('movement_type', '').strip()
    item_type = request.args.get('type', '').strip()
    return success_response(inventory_service.list_movements(item_id, movement_type, item_type))


@inventory_bp.route('/api/inventory/stock-in', methods=['POST'])
@require_role('teacher')
def api_stock_in():
    data = request.json or {}
    try:
        movement_id = inventory_service.stock_in(data, recorded_by=_current_user())
        return success_response({"id": movement_id}, message="Stock added successfully", status=201)
    except InventoryValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except ItemNotFoundError as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)


@inventory_bp.route('/api/inventory/stock-out', methods=['POST'])
@require_role('teacher')
def api_stock_out():
    data = request.json or {}
    try:
        movement_id = inventory_service.stock_out(data, recorded_by=_current_user())
        return success_response({"id": movement_id}, message="Stock removed successfully", status=201)
    except InventoryValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except ItemNotFoundError as e:
        return error_response(str(e), status=404)
    except InsufficientStockError as e:
        return error_response(str(e), status=409)
    except Exception as e:
        return error_response(str(e), status=500)


# ---------------------------------------------------------------
# Purchases
# ---------------------------------------------------------------

@inventory_bp.route('/api/inventory/purchases', methods=['GET'])
@require_role('viewer')
def api_get_purchases():
    vendor_id = request.args.get('vendor_id', '').strip()
    item_id = request.args.get('item_id', '').strip()
    status = request.args.get('status', '').strip()
    return success_response(inventory_service.list_purchases(vendor_id, item_id, status))


@inventory_bp.route('/api/inventory/purchases/<int:purchase_id>', methods=['GET'])
@require_role('viewer')
def api_get_purchase(purchase_id):
    try:
        return success_response(inventory_service.get_purchase(purchase_id))
    except PurchaseNotFoundError as e:
        return error_response(str(e), status=404)


@inventory_bp.route('/api/inventory/purchases/<int:purchase_id>/receiving', methods=['GET'])
@require_role('viewer')
def api_get_purchase_receiving(purchase_id):
    try:
        return success_response(inventory_service.get_purchase_receiving(purchase_id))
    except PurchaseNotFoundError as e:
        return error_response(str(e), status=404)


@inventory_bp.route('/api/inventory/purchases/<int:purchase_id>/receive', methods=['PUT'])
@require_role('teacher')
def api_receive_purchase(purchase_id):
    data = request.json or {}
    try:
        purchase = inventory_service.receive_purchase(purchase_id, data, received_by=_current_user())
        return success_response(purchase, message=f"{purchase['purchase_no']} marked as received")
    except PurchaseNotFoundError as e:
        return error_response(str(e), status=404)
    except InventoryValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except Exception as e:
        return error_response(str(e), status=500)


@inventory_bp.route('/api/inventory/purchases', methods=['POST'])
@require_role('teacher')
def api_create_purchase():
    data = request.json or {}
    try:
        new_id = inventory_service.create_purchase(data, created_by=_current_user())
        return success_response({"id": new_id}, message="Purchase recorded successfully", status=201)
    except InventoryValidationError as e:
        return error_response("; ".join(e.errors), status=400)
    except (VendorNotFoundError, ItemNotFoundError) as e:
        return error_response(str(e), status=404)
    except Exception as e:
        return error_response(str(e), status=500)
