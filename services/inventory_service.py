"""
Inventory service — business logic layer sitting between the inventory
routes and the inventory repository.

Covers five sub-areas that share one catalog table (inventory_items,
disambiguated by `type` = Uniform / Books / Stationery):
  - Vendors            — suppliers the school buys from.
  - Items              — Uniform / Books / Stationery catalog + stock levels.
  - Stock In / Stock Out — manual stock ledger movements (damage, return,
                            adjustment, issue to a class, etc).
  - Purchases          — a purchase from a Vendor for an Item; recording a
                          "Received" purchase automatically posts a matching
                          Stock In movement and raises quantity_in_stock, so
                          stock levels and purchase history never drift apart.
"""
from datetime import date

from models.inventory import Vendor, InventoryItem, ITEM_TYPES, PURCHASE_STATUSES
from repositories.inventory_repository import InventoryRepository
from utils.validators import (
    validate_inventory_vendor_payload,
    validate_inventory_item_payload,
    validate_stock_movement_payload,
    validate_inventory_purchase_payload,
)
from utils.logger import get_logger

logger = get_logger(__name__)


class InventoryValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("; ".join(errors))


class VendorNotFoundError(Exception):
    pass


class ItemNotFoundError(Exception):
    pass


class PurchaseNotFoundError(Exception):
    pass


class InsufficientStockError(Exception):
    pass


class VendorInUseError(Exception):
    pass


class InventoryService:

    def __init__(self, repository: InventoryRepository = None):
        self.repository = repository or InventoryRepository()

    # ---------------------------------------------------------------
    # Dashboard
    # ---------------------------------------------------------------

    def get_dashboard(self):
        stats = self.repository.get_stats()
        low_stock_items = self.repository.find_all_items(low_stock_only=True)
        stats["low_stock_items"] = low_stock_items[:10]
        return stats

    # ---------------------------------------------------------------
    # Vendors
    # ---------------------------------------------------------------

    def list_vendors(self, query=""):
        vendors = self.repository.find_all_vendors(query)
        return {"vendors": vendors, "count": len(vendors)}

    def get_vendor(self, vendor_id):
        vendor = self.repository.find_vendor_by_id(vendor_id)
        if not vendor:
            raise VendorNotFoundError("Vendor not found")
        return vendor

    def create_vendor(self, data):
        errors = validate_inventory_vendor_payload(data)
        if errors:
            raise InventoryValidationError(errors)
        vendor = Vendor.from_dict(data)
        new_id = self.repository.create_vendor(vendor)
        logger.info(f"Inventory vendor added: {new_id} ({vendor.name})")
        return new_id

    def update_vendor(self, vendor_id, data):
        errors = validate_inventory_vendor_payload(data)
        if errors:
            raise InventoryValidationError(errors)
        existing = self.repository.find_vendor_by_id(vendor_id)
        if not existing:
            raise VendorNotFoundError("Vendor not found")
        vendor = Vendor.from_dict(data, id=vendor_id)
        self.repository.update_vendor(vendor_id, vendor)

    def delete_vendor(self, vendor_id):
        existing = self.repository.find_vendor_by_id(vendor_id)
        if not existing:
            raise VendorNotFoundError("Vendor not found")
        if self.repository.has_purchases(vendor_id):
            raise VendorInUseError("Cannot delete a vendor with purchase history — deactivate it instead")
        self.repository.delete_vendor(vendor_id)

    # ---------------------------------------------------------------
    # Items (Uniform / Books / Stationery)
    # ---------------------------------------------------------------

    def list_items(self, item_type="", query="", low_stock_only=False):
        if item_type and item_type not in ITEM_TYPES:
            raise InventoryValidationError([f"type must be one of {', '.join(ITEM_TYPES)}"])
        items = self.repository.find_all_items(item_type, query, low_stock_only)
        return {"items": items, "count": len(items), "types": ITEM_TYPES}

    def get_item(self, item_id):
        item = self.repository.find_item_by_id(item_id)
        if not item:
            raise ItemNotFoundError("Item not found")
        return item

    def create_item(self, data):
        errors = validate_inventory_item_payload(data)
        if errors:
            raise InventoryValidationError(errors)
        item = InventoryItem.from_dict(data)
        new_id = self.repository.create_item(item)
        logger.info(f"Inventory item added: {new_id} ({item.name}, {item.type})")
        return new_id

    def update_item(self, item_id, data):
        errors = validate_inventory_item_payload(data)
        if errors:
            raise InventoryValidationError(errors)
        existing = self.repository.find_item_by_id(item_id)
        if not existing:
            raise ItemNotFoundError("Item not found")
        item = InventoryItem.from_dict(data, id=item_id, quantity_in_stock=existing["quantity_in_stock"])
        self.repository.update_item(item_id, item)

    def delete_item(self, item_id):
        existing = self.repository.find_item_by_id(item_id)
        if not existing:
            raise ItemNotFoundError("Item not found")
        self.repository.delete_item(item_id)

    # ---------------------------------------------------------------
    # Stock In / Stock Out
    # ---------------------------------------------------------------

    def stock_in(self, data, recorded_by=None):
        errors = validate_stock_movement_payload(data)
        if errors:
            raise InventoryValidationError(errors)

        item = self.repository.find_item_by_id(data.get("item_id"))
        if not item:
            raise ItemNotFoundError("Item not found")

        quantity = int(data.get("quantity"))
        movement_date = data.get("movement_date") or date.today().isoformat()

        from database import transaction
        with transaction() as db:
            movement_id = self.repository.create_movement_in_txn(
                db,
                item_id=item["id"],
                movement_type="IN",
                quantity=quantity,
                reference_type=data.get("reference_type") or "Adjustment",
                reference_id=data.get("reference_id"),
                reason=data.get("reason"),
                movement_date=movement_date,
                recorded_by=recorded_by,
            )
            self.repository.adjust_quantity_in_txn(db, item["id"], quantity)
        logger.info(f"Stock IN: item={item['id']} qty={quantity}")
        return movement_id

    def stock_out(self, data, recorded_by=None):
        errors = validate_stock_movement_payload(data)
        if errors:
            raise InventoryValidationError(errors)

        item = self.repository.find_item_by_id(data.get("item_id"))
        if not item:
            raise ItemNotFoundError("Item not found")

        quantity = int(data.get("quantity"))
        movement_date = data.get("movement_date") or date.today().isoformat()

        from database import transaction
        with transaction() as db:
            applied = self.repository.decrement_quantity_if_available(db, item["id"], quantity)
            if not applied:
                # Re-read for an accurate message; someone else may have
                # moved stock (or deleted the item) between our earlier
                # read and this txn.
                current = self.repository.find_item_by_id(item["id"])
                if not current:
                    raise ItemNotFoundError("Item not found")
                raise InsufficientStockError(
                    f"Only {current['quantity_in_stock']} {current['unit']} of '{current['name']}' in stock"
                )
            movement_id = self.repository.create_movement_in_txn(
                db,
                item_id=item["id"],
                movement_type="OUT",
                quantity=quantity,
                reference_type=data.get("reference_type") or "Issue",
                reference_id=data.get("reference_id"),
                reason=data.get("reason"),
                movement_date=movement_date,
                recorded_by=recorded_by,
            )
        logger.info(f"Stock OUT: item={item['id']} qty={quantity}")
        return movement_id

    def list_movements(self, item_id="", movement_type="", item_type=""):
        movements = self.repository.find_all_movements(item_id, movement_type, item_type)
        return {"movements": movements, "count": len(movements)}

    # ---------------------------------------------------------------
    # Purchases (from a Vendor) — recording a "Received" purchase also
    # posts a Stock In movement and raises quantity_in_stock.
    # ---------------------------------------------------------------

    def list_purchases(self, vendor_id="", item_id="", status=""):
        purchases = self.repository.find_all_purchases(vendor_id, item_id, status)
        return {"purchases": purchases, "count": len(purchases)}

    def create_purchase(self, data, created_by=None):
        errors = validate_inventory_purchase_payload(data)
        if errors:
            raise InventoryValidationError(errors)

        vendor = self.repository.find_vendor_by_id(data.get("vendor_id"))
        if not vendor:
            raise VendorNotFoundError("Vendor not found")

        item = self.repository.find_item_by_id(data.get("item_id"))
        if not item:
            raise ItemNotFoundError("Item not found")

        quantity = int(data.get("quantity"))
        unit_price = float(data.get("unit_price", item["unit_price"]) or 0)
        total_amount = round(quantity * unit_price, 2)
        purchase_date = data.get("purchase_date") or date.today().isoformat()

        # Normalize status against the known set instead of exact-matching
        # a raw string, so "received"/"RECEIVED"/trailing space don't
        # silently skip the stock-in side effect.
        raw_status = (data.get("status") or "Received").strip()
        status_lookup = {s.lower(): s for s in PURCHASE_STATUSES}
        status = status_lookup.get(raw_status.lower())
        if status is None:
            raise InventoryValidationError([f"status must be one of {', '.join(PURCHASE_STATUSES)}"])

        purchase_no = self.repository.next_purchase_no()

        movement = None
        if status == "Received":
            movement = dict(
                item_id=item["id"],
                movement_type="IN",
                quantity=quantity,
                reference_type="Purchase",
                reference_id=None,  # purchase id isn't known until the insert below
                reason=f"Purchase {purchase_no} from {vendor['name']}",
                movement_date=purchase_date,
                recorded_by=created_by,
            )

        # Purchase row + (for "Received") the stock-in movement and
        # quantity increment all happen in one DB transaction, so a
        # purchase can never be persisted without its stock effects.
        purchase_id = self.repository.create_purchase(
            purchase_no=purchase_no,
            vendor_id=vendor["id"],
            item_id=item["id"],
            quantity=quantity,
            unit_price=unit_price,
            total_amount=total_amount,
            purchase_date=purchase_date,
            status=status,
            notes=data.get("notes"),
            created_by=created_by,
            movement=movement,
        )

        logger.info(f"Purchase recorded: {purchase_no} vendor={vendor['id']} item={item['id']} qty={quantity}")
        return purchase_id

    def get_purchase(self, purchase_id):
        purchase = self.repository.find_purchase_by_id(purchase_id)
        if not purchase:
            raise PurchaseNotFoundError("Purchase not found")
        return purchase

    def receive_purchase(self, purchase_id, data=None, received_by=None):
        """Mark an 'Ordered' purchase as 'Received': posts the matching
        Stock In movement and raises quantity_in_stock, in one transaction —
        mirrors what create_purchase does for purchases recorded as
        Received up-front, so stock and PO history never drift apart."""
        data = data or {}
        purchase = self.repository.find_purchase_by_id(purchase_id)
        if not purchase:
            raise PurchaseNotFoundError("Purchase not found")
        if purchase["status"] == "Received":
            raise InventoryValidationError(["This purchase order has already been received"])
        if purchase["status"] == "Cancelled":
            raise InventoryValidationError(["A cancelled purchase order cannot be received"])

        received_date = data.get("received_date") or date.today().isoformat()

        from database import transaction
        with transaction() as db:
            self.repository.create_movement_in_txn(
                db,
                item_id=purchase["item_id"],
                movement_type="IN",
                quantity=purchase["quantity"],
                reference_type="Purchase",
                reference_id=purchase["id"],
                reason=f"Received against {purchase['purchase_no']} from {purchase['vendor_name']}",
                movement_date=received_date,
                recorded_by=received_by,
            )
            self.repository.adjust_quantity_in_txn(db, purchase["item_id"], purchase["quantity"])
            self.repository.mark_purchase_received_in_txn(db, purchase_id, received_date, received_by)

        logger.info(f"Purchase received: {purchase['purchase_no']} (id={purchase_id})")
        return self.repository.find_purchase_by_id(purchase_id)

    def get_purchase_receiving(self, purchase_id):
        """PO + the stock movement(s) recording what was actually received
        against it — used for the Receiving screen and its print preview."""
        purchase = self.repository.find_purchase_by_id(purchase_id)
        if not purchase:
            raise PurchaseNotFoundError("Purchase not found")
        movements = self.repository.find_movements_for_purchase(purchase_id)
        return {"purchase": purchase, "movements": movements}
