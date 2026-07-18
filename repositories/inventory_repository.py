"""
Inventory repository — the only layer allowed to talk directly to SQLite
for inventory_vendors, inventory_items, inventory_purchases, and
inventory_stock_movements.
"""
from database import transaction
from models.inventory import Vendor, InventoryItem
from repositories.base_repository import BaseRepository


class InventoryRepository(BaseRepository):
    table = "inventory_items"
    id_column = "id"

    # ---------------------------------------------------------------
    # Vendors
    # ---------------------------------------------------------------

    def find_all_vendors(self, query=""):
        sql = "SELECT * FROM inventory_vendors WHERE 1=1"
        params = []
        if query:
            sql += " AND (name LIKE ? OR contact_person LIKE ? OR phone LIKE ?)"
            params.extend([f"%{query}%", f"%{query}%", f"%{query}%"])
        sql += " ORDER BY name"
        return [dict(r) for r in self._fetchall(sql, params)]

    def find_vendor_by_id(self, vendor_id):
        row = self._fetchone("SELECT * FROM inventory_vendors WHERE id=?", (vendor_id,))
        return dict(row) if row else None

    def create_vendor(self, vendor: Vendor):
        with transaction() as db:
            cursor = db.execute("""
                INSERT INTO inventory_vendors(
                    name, contact_person, phone, email, address, supplies, notes, is_active
                ) VALUES (?,?,?,?,?,?,?,?)
            """, (
                vendor.name, vendor.contact_person, vendor.phone, vendor.email,
                vendor.address, vendor.supplies, vendor.notes, vendor.is_active,
            ))
            return cursor.lastrowid

    def update_vendor(self, vendor_id, vendor: Vendor):
        with transaction() as db:
            db.execute("""
                UPDATE inventory_vendors SET
                    name=?, contact_person=?, phone=?, email=?, address=?,
                    supplies=?, notes=?, is_active=?
                WHERE id=?
            """, (
                vendor.name, vendor.contact_person, vendor.phone, vendor.email,
                vendor.address, vendor.supplies, vendor.notes, vendor.is_active,
                vendor_id,
            ))

    def delete_vendor(self, vendor_id):
        with transaction() as db:
            db.execute("DELETE FROM inventory_vendors WHERE id=?", (vendor_id,))

    def has_purchases(self, vendor_id):
        row = self._fetchone("SELECT 1 FROM inventory_purchases WHERE vendor_id=?", (vendor_id,))
        return row is not None

    # ---------------------------------------------------------------
    # Items (Uniform / Books / Stationery)
    # ---------------------------------------------------------------

    def find_all_items(self, item_type="", query="", low_stock_only=False):
        sql = "SELECT i.*, v.name as vendor_name FROM inventory_items i LEFT JOIN inventory_vendors v ON i.vendor_id = v.id WHERE 1=1"
        params = []
        if item_type:
            sql += " AND i.type=?"
            params.append(item_type)
        if query:
            sql += " AND (i.name LIKE ? OR i.sku LIKE ? OR i.category LIKE ?)"
            params.extend([f"%{query}%", f"%{query}%", f"%{query}%"])
        if low_stock_only:
            sql += " AND i.quantity_in_stock <= i.reorder_level"
        sql += " ORDER BY i.name"
        return [dict(r) for r in self._fetchall(sql, params)]

    def find_item_by_id(self, item_id):
        row = self._fetchone(
            "SELECT i.*, v.name as vendor_name FROM inventory_items i "
            "LEFT JOIN inventory_vendors v ON i.vendor_id = v.id WHERE i.id=?",
            (item_id,)
        )
        return dict(row) if row else None

    def create_item(self, item: InventoryItem):
        with transaction() as db:
            cursor = db.execute("""
                INSERT INTO inventory_items(
                    name, type, category, sku, unit, unit_price,
                    quantity_in_stock, reorder_level, vendor_id, notes, is_active
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
            """, (
                item.name, item.type, item.category, item.sku, item.unit, item.unit_price,
                item.quantity_in_stock, item.reorder_level, item.vendor_id, item.notes, item.is_active,
            ))
            return cursor.lastrowid

    def update_item(self, item_id, item: InventoryItem):
        with transaction() as db:
            db.execute("""
                UPDATE inventory_items SET
                    name=?, type=?, category=?, sku=?, unit=?, unit_price=?,
                    reorder_level=?, vendor_id=?, notes=?, is_active=?
                WHERE id=?
            """, (
                item.name, item.type, item.category, item.sku, item.unit, item.unit_price,
                item.reorder_level, item.vendor_id, item.notes, item.is_active,
                item_id,
            ))

    def delete_item(self, item_id):
        with transaction() as db:
            db.execute("DELETE FROM inventory_items WHERE id=?", (item_id,))

    def adjust_quantity(self, item_id, delta):
        """Increment/decrement quantity_in_stock by delta (can be negative)."""
        with transaction() as db:
            self.adjust_quantity_in_txn(db, item_id, delta)

    def adjust_quantity_in_txn(self, db, item_id, delta):
        """Adjust stock using an already-open transaction (see create_movement_in_txn)."""
        db.execute(
            "UPDATE inventory_items SET quantity_in_stock = quantity_in_stock + ? WHERE id=?",
            (delta, item_id)
        )

    def decrement_quantity_if_available(self, db, item_id, quantity):
        """
        Atomically decrement stock only if enough is available, using a
        single conditional UPDATE so concurrent stock-out requests can't
        both pass a separate "check" step and overdraw the same item.
        Returns True if the decrement was applied, False if there wasn't
        enough stock (caller must be inside an open transaction `db`).
        """
        cursor = db.execute(
            "UPDATE inventory_items SET quantity_in_stock = quantity_in_stock - ? "
            "WHERE id=? AND quantity_in_stock >= ?",
            (quantity, item_id, quantity)
        )
        return cursor.rowcount > 0

    # ---------------------------------------------------------------
    # Stock movements (Stock In / Stock Out ledger)
    # ---------------------------------------------------------------

    def create_movement(self, item_id, movement_type, quantity, reference_type,
                         reference_id, reason, movement_date, recorded_by):
        with transaction() as db:
            return self.create_movement_in_txn(
                db, item_id, movement_type, quantity, reference_type,
                reference_id, reason, movement_date, recorded_by,
            )

    def create_movement_in_txn(self, db, item_id, movement_type, quantity, reference_type,
                                reference_id, reason, movement_date, recorded_by):
        """Insert a movement row using an already-open transaction/connection.
        Callers that must keep the movement + quantity change (and, for
        purchases, the purchase row) atomic should use this together with
        `adjust_quantity_in_txn` inside a single `with transaction() as db:`
        block instead of calling the standalone helpers separately."""
        cursor = db.execute("""
            INSERT INTO inventory_stock_movements(
                item_id, movement_type, quantity, reference_type,
                reference_id, reason, movement_date, recorded_by
            ) VALUES (?,?,?,?,?,?,?,?)
        """, (
            item_id, movement_type, quantity, reference_type,
            reference_id, reason, movement_date, recorded_by,
        ))
        return cursor.lastrowid

    def find_all_movements(self, item_id="", movement_type="", item_type=""):
        sql = """
            SELECT m.*, i.name as item_name, i.type as item_type, i.unit as item_unit
            FROM inventory_stock_movements m
            LEFT JOIN inventory_items i ON m.item_id = i.id
            WHERE 1=1
        """
        params = []
        if item_id:
            sql += " AND m.item_id=?"
            params.append(item_id)
        if movement_type:
            sql += " AND m.movement_type=?"
            params.append(movement_type)
        if item_type:
            sql += " AND i.type=?"
            params.append(item_type)
        sql += " ORDER BY m.movement_date DESC, m.id DESC"
        return [dict(r) for r in self._fetchall(sql, params)]

    # ---------------------------------------------------------------
    # Purchases
    # ---------------------------------------------------------------

    def create_purchase(self, purchase_no, vendor_id, item_id, quantity, unit_price,
                         total_amount, purchase_date, status, notes, created_by,
                         movement=None):
        """
        Insert the purchase row and, when `movement` is provided (a dict of
        kwargs for create_movement_in_txn, used for "Received" purchases),
        the matching stock-in movement and quantity increment — all inside
        one transaction, so a purchase can never be recorded without its
        stock effects (or vice versa).
        """
        with transaction() as db:
            cursor = db.execute("""
                INSERT INTO inventory_purchases(
                    purchase_no, vendor_id, item_id, quantity, unit_price,
                    total_amount, purchase_date, status, notes, created_by
                ) VALUES (?,?,?,?,?,?,?,?,?,?)
            """, (
                purchase_no, vendor_id, item_id, quantity, unit_price,
                total_amount, purchase_date, status, notes, created_by,
            ))
            purchase_id = cursor.lastrowid

            if movement is not None:
                if movement.get("reference_id") is None:
                    movement = {**movement, "reference_id": purchase_id}
                self.create_movement_in_txn(db, **movement)
                self.adjust_quantity_in_txn(db, item_id, quantity)

            return purchase_id

    def find_all_purchases(self, vendor_id="", item_id="", status=""):
        sql = """
            SELECT p.*, v.name as vendor_name, i.name as item_name, i.type as item_type
            FROM inventory_purchases p
            LEFT JOIN inventory_vendors v ON p.vendor_id = v.id
            LEFT JOIN inventory_items i ON p.item_id = i.id
            WHERE 1=1
        """
        params = []
        if vendor_id:
            sql += " AND p.vendor_id=?"
            params.append(vendor_id)
        if item_id:
            sql += " AND p.item_id=?"
            params.append(item_id)
        if status:
            sql += " AND p.status=?"
            params.append(status)
        sql += " ORDER BY p.purchase_date DESC, p.id DESC"
        return [dict(r) for r in self._fetchall(sql, params)]

    def find_purchase_by_id(self, purchase_id):
        row = self._fetchone("""
            SELECT p.*, v.name as vendor_name, v.contact_person as vendor_contact,
                   v.phone as vendor_phone, i.name as item_name, i.type as item_type, i.unit as item_unit
            FROM inventory_purchases p
            LEFT JOIN inventory_vendors v ON p.vendor_id = v.id
            LEFT JOIN inventory_items i ON p.item_id = i.id
            WHERE p.id=?
        """, (purchase_id,))
        return dict(row) if row else None

    def mark_purchase_received_in_txn(self, db, purchase_id, received_date, received_by):
        db.execute("""
            UPDATE inventory_purchases SET status='Received', received_date=?, received_by=?
            WHERE id=?
        """, (received_date, received_by, purchase_id))

    def find_movements_for_purchase(self, purchase_id):
        """Items received against a given PO — the Stock In movement(s)
        posted with reference_type='Purchase' and reference_id=purchase_id."""
        rows = self._fetchall("""
            SELECT m.*, i.name as item_name, i.type as item_type, i.unit as item_unit
            FROM inventory_stock_movements m
            LEFT JOIN inventory_items i ON m.item_id = i.id
            WHERE m.reference_type='Purchase' AND m.reference_id=?
            ORDER BY m.id
        """, (purchase_id,))
        return [dict(r) for r in rows]

    def next_purchase_no(self):
        row = self._fetchone("SELECT COUNT(*) c FROM inventory_purchases")
        seq = (row["c"] if row else 0) + 1
        return f"PO-{seq:05d}"

    # ---------------------------------------------------------------
    # Dashboard stats
    # ---------------------------------------------------------------

    def get_stats(self):
        total_items = self._fetchone("SELECT COUNT(*) c FROM inventory_items")["c"]
        total_stock_value = self._fetchone(
            "SELECT COALESCE(SUM(quantity_in_stock * unit_price),0) c FROM inventory_items"
        )["c"]
        low_stock_count = self._fetchone(
            "SELECT COUNT(*) c FROM inventory_items WHERE quantity_in_stock <= reorder_level"
        )["c"]
        total_vendors = self._fetchone("SELECT COUNT(*) c FROM inventory_vendors")["c"]
        by_type = {
            r["type"]: r["c"] for r in self._fetchall(
                "SELECT type, COUNT(*) c FROM inventory_items GROUP BY type"
            )
        }
        purchases_this_month = self._fetchone(
            "SELECT COALESCE(SUM(total_amount),0) c FROM inventory_purchases "
            "WHERE DATE_FORMAT(purchase_date, '%%Y-%%m') = DATE_FORMAT(NOW(), '%%Y-%%m')"
        )["c"]
        return {
            "total_items": total_items,
            "total_stock_value": total_stock_value,
            "low_stock_count": low_stock_count,
            "total_vendors": total_vendors,
            "items_by_type": by_type,
            "purchases_this_month": purchases_this_month,
        }
