"""
Inventory data models: Vendor, InventoryItem (Uniform / Books / Stationery),
Purchase (from a vendor), and StockMovement (Stock In / Stock Out ledger).
"""
from dataclasses import dataclass
from typing import Optional

ITEM_TYPES = ['Uniform', 'Books', 'Stationery']
MOVEMENT_TYPES = ['IN', 'OUT']
MOVEMENT_REFERENCE_TYPES = ['Purchase', 'Issue', 'Sale', 'Return', 'Adjustment', 'Damage']
PURCHASE_STATUSES = ['Ordered', 'Received', 'Cancelled']


@dataclass
class Vendor:
    id: Optional[int]
    name: str
    contact_person: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    address: Optional[str]
    supplies: Optional[str]
    notes: Optional[str]
    is_active: int = 1

    @classmethod
    def from_dict(cls, data, id=None):
        return cls(
            id=id,
            name=data.get('name'),
            contact_person=data.get('contact_person'),
            phone=data.get('phone'),
            email=data.get('email'),
            address=data.get('address'),
            supplies=data.get('supplies'),
            notes=data.get('notes'),
            is_active=1 if data.get('is_active', True) else 0,
        )


@dataclass
class InventoryItem:
    id: Optional[int]
    name: str
    type: str
    category: Optional[str]
    sku: Optional[str]
    unit: str
    unit_price: float
    quantity_in_stock: int
    reorder_level: int
    vendor_id: Optional[int]
    notes: Optional[str]
    is_active: int = 1

    @classmethod
    def from_dict(cls, data, id=None, quantity_in_stock=None):
        return cls(
            id=id,
            name=data.get('name'),
            type=data.get('type'),
            category=data.get('category'),
            sku=data.get('sku'),
            unit=data.get('unit') or 'pcs',
            unit_price=float(data.get('unit_price', 0) or 0),
            quantity_in_stock=int(data.get('quantity_in_stock', 0) or 0) if quantity_in_stock is None else quantity_in_stock,
            reorder_level=int(data.get('reorder_level', 0) or 0),
            vendor_id=data.get('vendor_id') or None,
            notes=data.get('notes'),
            is_active=1 if data.get('is_active', True) else 0,
        )
