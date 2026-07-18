// ============================================
// INVENTORY.JS — Inventory page: Uniform, Books,
// Stationery catalogs, Stock In / Stock Out ledger,
// Purchases, and Vendors.
// ============================================

let inventoryVendorsCache = [];
let inventoryItemsCache = { Uniform: [], Books: [], Stationery: [] };
let inventoryAllItemsCache = [];
let inventoryPurchasesCache = [];
let inventoryLedgerCache = { 'stock-in': [], 'stock-out': [] };
let inventoryActiveTab = 'uniform';

const INVENTORY_TYPE_TABS = [
    { tab: 'uniform', type: 'Uniform', label: 'Uniform' },
    { tab: 'books', type: 'Books', label: 'Books' },
    { tab: 'stationery', type: 'Stationery', label: 'Stationery' },
];

async function loadInventory() {
    try {
        const [dashboard, vendorsData, itemsData] = await Promise.all([
            fetchAPI('/inventory/dashboard'),
            fetchAPI('/inventory/vendors'),
            fetchAPI('/inventory/items'),
        ]);

        inventoryVendorsCache = vendorsData.vendors || [];
        inventoryAllItemsCache = itemsData.items || [];
        INVENTORY_TYPE_TABS.forEach(t => {
            inventoryItemsCache[t.type] = inventoryAllItemsCache.filter(i => i.type === t.type);
        });

        const lowStock = dashboard.low_stock_items || [];

        const html = `
            <div class="page-header">
                <div class="page-title">Inventory</div>
                <div class="page-sub">Uniform, books &amp; stationery stock, purchases, and vendors.</div>
            </div>
            <div class="kpi-grid">
                <div class="kpi-card"><div class="kpi-label">Total Items</div><div class="kpi-value">${dashboard.total_items || 0}</div></div>
                <div class="kpi-card"><div class="kpi-label">Stock Value</div><div class="kpi-value" style="color:var(--green)">PKR ${Number(dashboard.total_stock_value || 0).toLocaleString()}</div></div>
                <div class="kpi-card"><div class="kpi-label">Low Stock Items</div><div class="kpi-value" style="color:var(--red)">${dashboard.low_stock_count || 0}</div></div>
                <div class="kpi-card"><div class="kpi-label">Vendors</div><div class="kpi-value">${dashboard.total_vendors || 0}</div></div>
                <div class="kpi-card"><div class="kpi-label">Purchases (This Month)</div><div class="kpi-value">PKR ${Number(dashboard.purchases_this_month || 0).toLocaleString()}</div></div>
            </div>

            ${lowStock.length ? `
            <div class="card" style="border-left:3px solid var(--red);">
                <div style="font-weight:600; margin-bottom:8px;">⚠️ Low Stock Alerts</div>
                <div style="display:flex; flex-wrap:wrap; gap:8px;">
                    ${lowStock.map(i => `<span class="badge badge-red">${escapeHtml(i.name)}: ${i.quantity_in_stock} ${escapeHtml(i.unit)} left</span>`).join('')}
                </div>
            </div>` : ''}

            <div class="card" style="margin-bottom:0;">
                <div class="toolbar" style="border-bottom:1px solid #334155; padding-bottom:0; flex-wrap:wrap;">
                    <button class="btn btn-ghost btn-sm inventory-tab-btn active" data-tab="uniform" onclick="switchInventoryTab('uniform')">👔 Uniform</button>
                    <button class="btn btn-ghost btn-sm inventory-tab-btn" data-tab="books" onclick="switchInventoryTab('books')">📚 Books</button>
                    <button class="btn btn-ghost btn-sm inventory-tab-btn" data-tab="stationery" onclick="switchInventoryTab('stationery')">✏️ Stationery</button>
                    <button class="btn btn-ghost btn-sm inventory-tab-btn" data-tab="stock-in" onclick="switchInventoryTab('stock-in')">📥 Stock In</button>
                    <button class="btn btn-ghost btn-sm inventory-tab-btn" data-tab="stock-out" onclick="switchInventoryTab('stock-out')">📤 Stock Out</button>
                    <button class="btn btn-ghost btn-sm inventory-tab-btn" data-tab="purchases" onclick="switchInventoryTab('purchases')">🧾 Purchase</button>
                    <button class="btn btn-ghost btn-sm inventory-tab-btn" data-tab="vendors" onclick="switchInventoryTab('vendors')">🏬 Vendors</button>
                </div>
            </div>

            <div id="inventoryUniformTab"></div>
            <div id="inventoryBooksTab" style="display:none;"></div>
            <div id="inventoryStationeryTab" style="display:none;"></div>
            <div id="inventoryStockInTab" style="display:none;"></div>
            <div id="inventoryStockOutTab" style="display:none;"></div>
            <div id="inventoryPurchasesTab" style="display:none;"></div>
            <div id="inventoryVendorsTab" style="display:none;"></div>

            ${renderInventoryItemModal()}
            ${renderStockMovementModal('in')}
            ${renderStockMovementModal('out')}
            ${renderPurchaseModal()}
            ${renderVendorModal()}
        `;
        document.getElementById('page-content').innerHTML = html;
        renderInventoryItemsTab('Uniform', inventoryItemsCache.Uniform);
    } catch (e) {
        console.error(e);
        document.getElementById('page-content').innerHTML = '<div class="loading">Failed to load inventory.</div>';
    }
}

const INVENTORY_TAB_PANEL_ID = {
    uniform: 'inventoryUniformTab', books: 'inventoryBooksTab', stationery: 'inventoryStationeryTab',
    'stock-in': 'inventoryStockInTab', 'stock-out': 'inventoryStockOutTab',
    purchases: 'inventoryPurchasesTab', vendors: 'inventoryVendorsTab',
};

window.switchInventoryTab = async function (tab) {
    inventoryActiveTab = tab;
    document.querySelectorAll('.inventory-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    Object.values(INVENTORY_TAB_PANEL_ID).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    const panel = document.getElementById(INVENTORY_TAB_PANEL_ID[tab]);
    if (panel) panel.style.display = 'block';

    const typeTab = INVENTORY_TYPE_TABS.find(t => t.tab === tab);
    if (typeTab) {
        renderInventoryItemsTab(typeTab.type, inventoryItemsCache[typeTab.type]);
    } else if (tab === 'stock-in' || tab === 'stock-out') {
        await renderStockLedgerTab(tab);
    } else if (tab === 'purchases') {
        await renderPurchasesTab();
    } else if (tab === 'vendors') {
        renderVendorsTab(inventoryVendorsCache);
    }
};

// ---------------------------------------------------------------
// Uniform / Books / Stationery — shared item catalog rendering
// ---------------------------------------------------------------

function renderInventoryItemsTab(type, items) {
    const panelId = INVENTORY_TAB_PANEL_ID[type.toLowerCase()];
    const el = document.getElementById(panelId);
    if (!el) return;
    el.innerHTML = `
        <div class="card">
            <div class="toolbar">
                <div class="search-wrap"><input type="text" id="itemSearch_${type}" placeholder="Search ${escapeHtml(type.toLowerCase())} items..."></div>
                <button onclick="filterInventoryItems('${type}')" class="btn btn-ghost btn-sm">Filter</button>
                <button onclick="printInventoryItems('${type}')" class="btn btn-ghost btn-sm">🖨️ Print</button>
                <button onclick="showInventoryItemModal('${type}')" class="btn btn-primary">+ Add ${escapeHtml(type)} Item</button>
            </div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>Name</th><th>Category</th><th>SKU</th><th>Unit Price</th><th>Stock</th><th>Vendor</th><th>Actions</th></tr></thead>
                    <tbody id="itemsTableBody_${type}">${renderInventoryItemRows(items)}</tbody>
                </table>
            </div>
        </div>
    `;
}

function renderInventoryItemRows(items) {
    if (!items.length) return `<tr><td colspan="7" style="text-align:center; color:#94a3b8;">No items yet</td></tr>`;
    return items.map(i => `
        <tr>
            <td style="font-weight:500">${escapeHtml(i.name)}</td>
            <td>${escapeHtml(i.category || '-')}</td>
            <td>${escapeHtml(i.sku || '-')}</td>
            <td>PKR ${Number(i.unit_price || 0).toLocaleString()}</td>
            <td>${i.quantity_in_stock <= i.reorder_level
                ? `<span class="badge badge-red">${i.quantity_in_stock} ${escapeHtml(i.unit)}</span>`
                : `<span class="badge badge-green">${i.quantity_in_stock} ${escapeHtml(i.unit)}</span>`}</td>
            <td>${escapeHtml(i.vendor_name || '-')}</td>
            <td class="actions">
                <button onclick="editInventoryItem(${i.id})" class="btn btn-ghost btn-sm">✏</button>
                <button onclick="deleteInventoryItem(${i.id})" class="btn btn-danger btn-sm">🗑</button>
            </td>
        </tr>
    `).join('');
}

window.filterInventoryItems = async function (type) {
    const q = document.getElementById(`itemSearch_${type}`)?.value || '';
    const data = await fetchAPI(`/inventory/items?type=${encodeURIComponent(type)}&q=${encodeURIComponent(q)}`);
    inventoryItemsCache[type] = data.items || [];
    const tbody = document.getElementById(`itemsTableBody_${type}`);
    if (tbody) tbody.innerHTML = renderInventoryItemRows(inventoryItemsCache[type]);
};

window.printInventoryItems = async function (type) {
    const items = inventoryItemsCache[type] || [];
    const rows = items.length ? items.map(i => `
        <tr>
            <td>${escapeHtml(i.name)}</td>
            <td>${escapeHtml(i.category || '-')}</td>
            <td>${escapeHtml(i.sku || '-')}</td>
            <td>PKR ${Number(i.unit_price || 0).toLocaleString()}</td>
            <td>${i.quantity_in_stock} ${escapeHtml(i.unit)}</td>
            <td>${escapeHtml(i.vendor_name || '-')}</td>
        </tr>
    `).join('') : `<tr><td colspan="6" style="text-align:center; color:#94a3b8;">No items</td></tr>`;
    const body = `
        <table class="data-table">
            <thead><tr><th>Name</th><th>Category</th><th>SKU</th><th>Unit Price</th><th>Stock</th><th>Vendor</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;
    printPreview(body, `${type} Inventory`);
};

function renderInventoryItemModal() {
    return `
        <div id="inventoryItemModal" class="modal-overlay">
            <div class="modal">
                <div class="modal-header"><h2 id="inventoryItemModalTitle">Add Item</h2><span class="close-btn" onclick="closeInventoryItemModal()">&times;</span></div>
                <div class="modal-body">
                    <form id="inventoryItemForm" onsubmit="event.preventDefault(); saveInventoryItem();">
                        <input type="hidden" id="itemId">
                        <input type="hidden" id="itemType">
                        <div class="form-grid">
                            <div class="form-group full"><label for="itemName">Name *</label><input type="text" id="itemName" required></div>
                            <div class="form-group"><label for="itemCategory">Category</label><input type="text" id="itemCategory" placeholder="e.g. Size M, Grade 6, Item group"></div>
                            <div class="form-group"><label for="itemSku">SKU</label><input type="text" id="itemSku"></div>
                            <div class="form-group"><label for="itemUnit">Unit</label><input type="text" id="itemUnit" value="pcs"></div>
                            <div class="form-group"><label for="itemUnitPrice">Unit Price (PKR)</label><input type="number" min="0" step="0.01" id="itemUnitPrice" value="0"></div>
                            <div class="form-group"><label for="itemReorderLevel">Reorder Level</label><input type="number" min="0" id="itemReorderLevel" value="0"></div>
                            <div class="form-group full">
                                <label for="itemVendorId">Preferred Vendor</label>
                                <select id="itemVendorId">
                                    <option value="">— None —</option>
                                    ${inventoryVendorsCache.map(v => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group full"><label for="itemNotes">Notes</label><input type="text" id="itemNotes"></div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-ghost" onclick="closeInventoryItemModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary">Save Item</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
}

window.showInventoryItemModal = function (type) {
    document.getElementById('inventoryItemModalTitle').innerText = `Add ${type} Item`;
    document.getElementById('inventoryItemForm').reset();
    document.getElementById('itemId').value = '';
    document.getElementById('itemType').value = type;
    document.getElementById('itemUnit').value = 'pcs';
    document.getElementById('itemUnitPrice').value = 0;
    document.getElementById('itemReorderLevel').value = 0;
    document.getElementById('inventoryItemModal').classList.add('active');
};
window.closeInventoryItemModal = function () { document.getElementById('inventoryItemModal').classList.remove('active'); };

window.editInventoryItem = function (id) {
    const item = inventoryAllItemsCache.find(i => i.id === id);
    if (!item) return;
    document.getElementById('inventoryItemModalTitle').innerText = `Edit ${item.type} Item`;
    document.getElementById('itemId').value = item.id;
    document.getElementById('itemType').value = item.type;
    document.getElementById('itemName').value = item.name || '';
    document.getElementById('itemCategory').value = item.category || '';
    document.getElementById('itemSku').value = item.sku || '';
    document.getElementById('itemUnit').value = item.unit || 'pcs';
    document.getElementById('itemUnitPrice').value = item.unit_price || 0;
    document.getElementById('itemReorderLevel').value = item.reorder_level || 0;
    document.getElementById('itemVendorId').value = item.vendor_id || '';
    document.getElementById('itemNotes').value = item.notes || '';
    document.getElementById('inventoryItemModal').classList.add('active');
};

window.saveInventoryItem = async function () {
    const id = document.getElementById('itemId').value;
    const type = document.getElementById('itemType').value;
    const data = {
        name: document.getElementById('itemName').value,
        type,
        category: document.getElementById('itemCategory').value,
        sku: document.getElementById('itemSku').value,
        unit: document.getElementById('itemUnit').value || 'pcs',
        unit_price: parseFloat(document.getElementById('itemUnitPrice').value || '0'),
        reorder_level: parseInt(document.getElementById('itemReorderLevel').value || '0'),
        vendor_id: document.getElementById('itemVendorId').value || null,
        notes: document.getElementById('itemNotes').value,
    };
    if (!data.name) { showAlert('Name is required', 'error'); return; }
    try {
        if (id) {
            await fetchAPI(`/inventory/items/${id}`, { method: 'PUT', body: JSON.stringify(data) });
            showAlert('Item updated');
        } else {
            await fetchAPI('/inventory/items', { method: 'POST', body: JSON.stringify(data) });
            showAlert('Item added');
        }
        closeInventoryItemModal();
        await loadInventory();
        await switchInventoryTab(type.toLowerCase());
    } catch (e) { console.error(e); }
};

window.deleteInventoryItem = async function (id) {
    if (!confirm('Delete this item from inventory?')) return;
    try {
        await fetchAPI(`/inventory/items/${id}`, { method: 'DELETE' });
        showAlert('Item deleted');
        await loadInventory();
    } catch (e) { console.error(e); }
};

// ---------------------------------------------------------------
// Stock In / Stock Out ledger
// ---------------------------------------------------------------

async function renderStockLedgerTab(direction) {
    const movementType = direction === 'stock-in' ? 'IN' : 'OUT';
    const panelId = INVENTORY_TAB_PANEL_ID[direction];
    const el = document.getElementById(panelId);
    if (!el) return;
    el.innerHTML = '<div class="loading">Loading...</div>';
    const data = await fetchAPI(`/inventory/movements?movement_type=${movementType}`);
    const movements = data.movements || [];
    el.innerHTML = `
        <div class="card">
            <div class="toolbar">
                <button onclick="showStockMovementModal('${direction === 'stock-in' ? 'in' : 'out'}')" class="btn btn-primary">
                    ${direction === 'stock-in' ? '+ Record Stock In' : '+ Record Stock Out'}
                </button>
                <button onclick="printStockLedger('${direction}')" class="btn btn-ghost btn-sm">🖨️ Print</button>
            </div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>Date</th><th>Item</th><th>Type</th><th>Qty</th><th>Reference</th><th>Reason</th><th>Recorded By</th></tr></thead>
                    <tbody>
                        ${movements.length ? movements.map(m => `
                            <tr>
                                <td>${escapeHtml(m.movement_date)}</td>
                                <td>${escapeHtml(m.item_name || '-')}</td>
                                <td>${escapeHtml(m.item_type || '-')}</td>
                                <td>${m.quantity}</td>
                                <td>${escapeHtml(m.reference_type || '-')}</td>
                                <td>${escapeHtml(m.reason || '-')}</td>
                                <td>${escapeHtml(m.recorded_by || '-')}</td>
                            </tr>
                        `).join('') : `<tr><td colspan="7" style="text-align:center; color:#94a3b8;">No movements yet</td></tr>`}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    inventoryLedgerCache[direction] = movements;
}

window.printStockLedger = function (direction) {
    const movements = inventoryLedgerCache[direction] || [];
    const rows = movements.length ? movements.map(m => `
        <tr>
            <td>${escapeHtml(m.movement_date)}</td>
            <td>${escapeHtml(m.item_name || '-')}</td>
            <td>${escapeHtml(m.item_type || '-')}</td>
            <td>${m.quantity}</td>
            <td>${escapeHtml(m.reference_type || '-')}</td>
            <td>${escapeHtml(m.reason || '-')}</td>
            <td>${escapeHtml(m.recorded_by || '-')}</td>
        </tr>
    `).join('') : `<tr><td colspan="7" style="text-align:center; color:#94a3b8;">No movements</td></tr>`;
    const body = `
        <table class="data-table">
            <thead><tr><th>Date</th><th>Item</th><th>Type</th><th>Qty</th><th>Reference</th><th>Reason</th><th>Recorded By</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;
    printPreview(body, direction === 'stock-in' ? 'Stock In Ledger' : 'Stock Out Ledger');
}

function renderStockMovementModal(direction) {
    const label = direction === 'in' ? 'Stock In' : 'Stock Out';
    const refOptions = direction === 'in'
        ? ['Purchase', 'Return', 'Adjustment']
        : ['Issue', 'Sale', 'Damage', 'Adjustment'];
    return `
        <div id="stockMovementModal_${direction}" class="modal-overlay">
            <div class="modal">
                <div class="modal-header"><h2>${label}</h2><span class="close-btn" onclick="closeStockMovementModal('${direction}')">&times;</span></div>
                <div class="modal-body">
                    <form id="stockMovementForm_${direction}" onsubmit="event.preventDefault(); saveStockMovement('${direction}');">
                        <div class="form-grid">
                            <div class="form-group full">
                                <label for="movementItemId_${direction}">Item *</label>
                                <select id="movementItemId_${direction}" required>
                                    <option value="">Select Item</option>
                                    ${inventoryAllItemsCache.map(i => `<option value="${i.id}">${escapeHtml(i.name)} (${escapeHtml(i.type)}) — ${i.quantity_in_stock} ${escapeHtml(i.unit)} in stock</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group"><label for="movementQty_${direction}">Quantity *</label><input type="number" min="1" id="movementQty_${direction}" required></div>
                            <div class="form-group">
                                <label for="movementRefType_${direction}">Reference Type</label>
                                <select id="movementRefType_${direction}">
                                    ${refOptions.map(r => `<option>${r}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group"><label for="movementDate_${direction}">Date</label><input type="date" id="movementDate_${direction}"></div>
                            <div class="form-group full"><label for="movementReason_${direction}">Reason / Notes</label><input type="text" id="movementReason_${direction}"></div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-ghost" onclick="closeStockMovementModal('${direction}')">Cancel</button>
                            <button type="submit" class="btn btn-primary">${label}</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
}

window.showStockMovementModal = function (direction) {
    document.getElementById(`stockMovementForm_${direction}`).reset();
    document.getElementById(`stockMovementModal_${direction}`).classList.add('active');
};
window.closeStockMovementModal = function (direction) {
    document.getElementById(`stockMovementModal_${direction}`).classList.remove('active');
};

window.saveStockMovement = async function (direction) {
    const data = {
        item_id: document.getElementById(`movementItemId_${direction}`).value,
        quantity: parseInt(document.getElementById(`movementQty_${direction}`).value || '0'),
        reference_type: document.getElementById(`movementRefType_${direction}`).value,
        movement_date: document.getElementById(`movementDate_${direction}`).value || undefined,
        reason: document.getElementById(`movementReason_${direction}`).value,
    };
    if (!data.item_id || !data.quantity) { showAlert('Item and quantity are required', 'error'); return; }
    try {
        await fetchAPI(`/inventory/stock-${direction}`, { method: 'POST', body: JSON.stringify(data) });
        showAlert(direction === 'in' ? 'Stock added' : 'Stock removed');
        closeStockMovementModal(direction);
        await loadInventory();
        await switchInventoryTab(direction === 'in' ? 'stock-in' : 'stock-out');
    } catch (e) { console.error(e); }
};

// ---------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------

async function renderPurchasesTab() {
    const el = document.getElementById('inventoryPurchasesTab');
    if (!el) return;
    el.innerHTML = '<div class="loading">Loading...</div>';
    const data = await fetchAPI('/inventory/purchases');
    const purchases = data.purchases || [];
    inventoryPurchasesCache = purchases;
    el.innerHTML = `
        <div class="card">
            <div class="toolbar">
                <button onclick="showPurchaseModal()" class="btn btn-primary">+ Record Purchase</button>
                <button onclick="printPurchases()" class="btn btn-ghost btn-sm">🖨️ Print</button>
            </div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>PO #</th><th>Date</th><th>Vendor</th><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${purchases.length ? purchases.map(p => `
                            <tr>
                                <td style="font-weight:500">${escapeHtml(p.purchase_no)}</td>
                                <td>${escapeHtml(p.purchase_date)}</td>
                                <td>${escapeHtml(p.vendor_name || '-')}</td>
                                <td>${escapeHtml(p.item_name || '-')}</td>
                                <td>${p.quantity}</td>
                                <td>PKR ${Number(p.unit_price || 0).toLocaleString()}</td>
                                <td>PKR ${Number(p.total_amount || 0).toLocaleString()}</td>
                                <td><span class="badge ${p.status === 'Received' ? 'badge-green' : p.status === 'Cancelled' ? 'badge-red' : 'badge-purple'}">${escapeHtml(p.status)}</span></td>
                                <td class="actions">
                                    ${p.status === 'Ordered' ? `<button onclick="receivePurchase(${p.id})" class="btn btn-primary btn-sm">📥 Receive</button>` : ''}
                                    ${p.status === 'Received' ? `<button onclick="printPurchaseReceiving(${p.id})" class="btn btn-ghost btn-sm">🖨️ GRN</button>` : ''}
                                </td>
                            </tr>
                        `).join('') : `<tr><td colspan="9" style="text-align:center; color:#94a3b8;">No purchases yet</td></tr>`}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

window.printPurchases = function () {
    const purchases = inventoryPurchasesCache || [];
    const rows = purchases.length ? purchases.map(p => `
        <tr>
            <td>${escapeHtml(p.purchase_no)}</td>
            <td>${escapeHtml(p.purchase_date)}</td>
            <td>${escapeHtml(p.vendor_name || '-')}</td>
            <td>${escapeHtml(p.item_name || '-')}</td>
            <td>${p.quantity}</td>
            <td>PKR ${Number(p.unit_price || 0).toLocaleString()}</td>
            <td>PKR ${Number(p.total_amount || 0).toLocaleString()}</td>
            <td>${escapeHtml(p.status)}</td>
        </tr>
    `).join('') : `<tr><td colspan="8" style="text-align:center; color:#94a3b8;">No purchases</td></tr>`;
    const body = `
        <table class="data-table">
            <thead><tr><th>PO #</th><th>Date</th><th>Vendor</th><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;
    printPreview(body, 'Purchase Orders');
};

window.receivePurchase = async function (purchaseId) {
    const purchase = inventoryPurchasesCache.find(p => p.id === purchaseId);
    const label = purchase ? purchase.purchase_no : `#${purchaseId}`;
    if (!confirm(`Mark ${label} as received? This will add the ordered quantity to stock.`)) return;
    try {
        await fetchAPI(`/inventory/purchases/${purchaseId}/receive`, { method: 'PUT', body: JSON.stringify({}) });
        showAlert('Purchase order received — stock updated');
        await loadInventory();
        await switchInventoryTab('purchases');
    } catch (e) { console.error(e); }
};

window.printPurchaseReceiving = async function (purchaseId) {
    try {
        const data = await fetchAPI(`/inventory/purchases/${purchaseId}/receiving`);
        const p = data.purchase;
        const movements = data.movements || [];
        const rows = movements.length ? movements.map(m => `
            <tr>
                <td>${escapeHtml(m.item_name || '-')}</td>
                <td>${escapeHtml(m.item_type || '-')}</td>
                <td>${m.quantity} ${escapeHtml(m.item_unit || '')}</td>
                <td>${escapeHtml(m.movement_date)}</td>
                <td>${escapeHtml(m.recorded_by || '-')}</td>
            </tr>
        `).join('') : `<tr><td colspan="5" style="text-align:center; color:#94a3b8;">No receiving records found for this PO.</td></tr>`;
        const body = `
            <table style="width:100%; margin-bottom:14px;">
                <tr><td style="padding:4px 0;"><strong>PO #:</strong> ${escapeHtml(p.purchase_no)}</td><td><strong>Status:</strong> ${escapeHtml(p.status)}</td></tr>
                <tr><td style="padding:4px 0;"><strong>Vendor:</strong> ${escapeHtml(p.vendor_name || '-')}</td><td><strong>Vendor Phone:</strong> ${escapeHtml(p.vendor_phone || '-')}</td></tr>
                <tr><td style="padding:4px 0;"><strong>Ordered:</strong> ${escapeHtml(p.purchase_date)}</td><td><strong>Received:</strong> ${escapeHtml(p.received_date || '-')}</td></tr>
            </table>
            <div style="font-weight:600; margin-bottom:6px;">Items Received Against This PO</div>
            <table class="data-table">
                <thead><tr><th>Item</th><th>Type</th><th>Qty Received</th><th>Date</th><th>Received By</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        `;
        printPreview(body, `Goods Received — ${p.purchase_no}`);
    } catch (e) {
        showAlert('Failed to load receiving details', 'error');
    }
};

function renderPurchaseModal() {
    return `
        <div id="purchaseModal" class="modal-overlay">
            <div class="modal">
                <div class="modal-header"><h2>Record Purchase</h2><span class="close-btn" onclick="closePurchaseModal()">&times;</span></div>
                <div class="modal-body">
                    <form id="purchaseForm" onsubmit="event.preventDefault(); savePurchase();">
                        <div class="form-grid">
                            <div class="form-group full">
                                <label for="purchaseVendorId">Vendor *</label>
                                <select id="purchaseVendorId" required>
                                    <option value="">Select Vendor</option>
                                    ${inventoryVendorsCache.map(v => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group full">
                                <label for="purchaseItemId">Item *</label>
                                <select id="purchaseItemId" required onchange="onPurchaseItemChange()">
                                    <option value="">Select Item</option>
                                    ${inventoryAllItemsCache.map(i => `<option value="${i.id}" data-price="${i.unit_price}">${escapeHtml(i.name)} (${escapeHtml(i.type)})</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group"><label for="purchaseQty">Quantity *</label><input type="number" min="1" id="purchaseQty" required></div>
                            <div class="form-group"><label for="purchaseUnitPrice">Unit Price (PKR) *</label><input type="number" min="0" step="0.01" id="purchaseUnitPrice" required></div>
                            <div class="form-group"><label for="purchaseDate">Purchase Date</label><input type="date" id="purchaseDate"></div>
                            <div class="form-group">
                                <label for="purchaseStatus">Status</label>
                                <select id="purchaseStatus">
                                    <option value="Received">Received (adds to stock)</option>
                                    <option value="Ordered">Ordered (not yet received)</option>
                                </select>
                            </div>
                            <div class="form-group full"><label for="purchaseNotes">Notes</label><input type="text" id="purchaseNotes"></div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-ghost" onclick="closePurchaseModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary">Save Purchase</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
}

window.showPurchaseModal = function () {
    document.getElementById('purchaseForm').reset();
    document.getElementById('purchaseStatus').value = 'Received';
    document.getElementById('purchaseModal').classList.add('active');
};
window.closePurchaseModal = function () { document.getElementById('purchaseModal').classList.remove('active'); };

window.onPurchaseItemChange = function () {
    const select = document.getElementById('purchaseItemId');
    const opt = select.options[select.selectedIndex];
    const price = opt ? opt.dataset.price : null;
    if (price !== null && price !== undefined) {
        document.getElementById('purchaseUnitPrice').value = price;
    }
};

window.savePurchase = async function () {
    const data = {
        vendor_id: document.getElementById('purchaseVendorId').value,
        item_id: document.getElementById('purchaseItemId').value,
        quantity: parseInt(document.getElementById('purchaseQty').value || '0'),
        unit_price: parseFloat(document.getElementById('purchaseUnitPrice').value || '0'),
        purchase_date: document.getElementById('purchaseDate').value || undefined,
        status: document.getElementById('purchaseStatus').value,
        notes: document.getElementById('purchaseNotes').value,
    };
    if (!data.vendor_id || !data.item_id || !data.quantity) { showAlert('Vendor, item, and quantity are required', 'error'); return; }
    try {
        await fetchAPI('/inventory/purchases', { method: 'POST', body: JSON.stringify(data) });
        showAlert('Purchase recorded');
        closePurchaseModal();
        await loadInventory();
        await switchInventoryTab('purchases');
    } catch (e) { console.error(e); }
};

// ---------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------

function renderVendorsTab(vendors) {
    const el = document.getElementById('inventoryVendorsTab');
    if (!el) return;
    el.innerHTML = `
        <div class="card">
            <div class="toolbar">
                <button onclick="showVendorModal()" class="btn btn-primary">+ Add Vendor</button>
                <button onclick="printVendors()" class="btn btn-ghost btn-sm">🖨️ Print</button>
            </div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>Name</th><th>Contact Person</th><th>Phone</th><th>Email</th><th>Supplies</th><th>Actions</th></tr></thead>
                    <tbody id="vendorsTableBody">${renderVendorRows(vendors)}</tbody>
                </table>
            </div>
        </div>
    `;
}

window.printVendors = function () {
    const vendors = inventoryVendorsCache || [];
    const rows = vendors.length ? vendors.map(v => `
        <tr>
            <td>${escapeHtml(v.name)}</td>
            <td>${escapeHtml(v.contact_person || '-')}</td>
            <td>${escapeHtml(v.phone || '-')}</td>
            <td>${escapeHtml(v.email || '-')}</td>
            <td>${escapeHtml(v.supplies || '-')}</td>
        </tr>
    `).join('') : `<tr><td colspan="5" style="text-align:center; color:#94a3b8;">No vendors</td></tr>`;
    const body = `
        <table class="data-table">
            <thead><tr><th>Name</th><th>Contact Person</th><th>Phone</th><th>Email</th><th>Supplies</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;
    printPreview(body, 'Vendors');
};

function renderVendorRows(vendors) {
    if (!vendors.length) return `<tr><td colspan="6" style="text-align:center; color:#94a3b8;">No vendors yet</td></tr>`;
    return vendors.map(v => `
        <tr>
            <td style="font-weight:500">${escapeHtml(v.name)}</td>
            <td>${escapeHtml(v.contact_person || '-')}</td>
            <td>${escapeHtml(v.phone || '-')}</td>
            <td>${escapeHtml(v.email || '-')}</td>
            <td>${escapeHtml(v.supplies || '-')}</td>
            <td class="actions">
                <button onclick="editVendor(${v.id})" class="btn btn-ghost btn-sm">✏</button>
                <button onclick="deleteVendor(${v.id})" class="btn btn-danger btn-sm">🗑</button>
            </td>
        </tr>
    `).join('');
}

function renderVendorModal() {
    return `
        <div id="vendorModal" class="modal-overlay">
            <div class="modal">
                <div class="modal-header"><h2 id="vendorModalTitle">Add Vendor</h2><span class="close-btn" onclick="closeVendorModal()">&times;</span></div>
                <div class="modal-body">
                    <form id="vendorForm" onsubmit="event.preventDefault(); saveVendor();">
                        <input type="hidden" id="vendorId">
                        <div class="form-grid">
                            <div class="form-group full"><label for="vendorName">Name *</label><input type="text" id="vendorName" required></div>
                            <div class="form-group"><label for="vendorContactPerson">Contact Person</label><input type="text" id="vendorContactPerson"></div>
                            <div class="form-group"><label for="vendorPhone">Phone</label><input type="text" id="vendorPhone"></div>
                            <div class="form-group"><label for="vendorEmail">Email</label><input type="email" id="vendorEmail"></div>
                            <div class="form-group full"><label for="vendorSupplies">Supplies (e.g. Uniform, Books, Stationery)</label><input type="text" id="vendorSupplies"></div>
                            <div class="form-group full"><label for="vendorAddress">Address</label><input type="text" id="vendorAddress"></div>
                            <div class="form-group full"><label for="vendorNotes">Notes</label><input type="text" id="vendorNotes"></div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-ghost" onclick="closeVendorModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary">Save Vendor</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
}

window.showVendorModal = function () {
    document.getElementById('vendorModalTitle').innerText = 'Add Vendor';
    document.getElementById('vendorForm').reset();
    document.getElementById('vendorId').value = '';
    document.getElementById('vendorModal').classList.add('active');
};
window.closeVendorModal = function () { document.getElementById('vendorModal').classList.remove('active'); };

window.editVendor = function (id) {
    const vendor = inventoryVendorsCache.find(v => v.id === id);
    if (!vendor) return;
    document.getElementById('vendorModalTitle').innerText = 'Edit Vendor';
    document.getElementById('vendorId').value = vendor.id;
    document.getElementById('vendorName').value = vendor.name || '';
    document.getElementById('vendorContactPerson').value = vendor.contact_person || '';
    document.getElementById('vendorPhone').value = vendor.phone || '';
    document.getElementById('vendorEmail').value = vendor.email || '';
    document.getElementById('vendorSupplies').value = vendor.supplies || '';
    document.getElementById('vendorAddress').value = vendor.address || '';
    document.getElementById('vendorNotes').value = vendor.notes || '';
    document.getElementById('vendorModal').classList.add('active');
};

window.saveVendor = async function () {
    const id = document.getElementById('vendorId').value;
    const data = {
        name: document.getElementById('vendorName').value,
        contact_person: document.getElementById('vendorContactPerson').value,
        phone: document.getElementById('vendorPhone').value,
        email: document.getElementById('vendorEmail').value,
        supplies: document.getElementById('vendorSupplies').value,
        address: document.getElementById('vendorAddress').value,
        notes: document.getElementById('vendorNotes').value,
    };
    if (!data.name) { showAlert('Name is required', 'error'); return; }
    try {
        if (id) {
            await fetchAPI(`/inventory/vendors/${id}`, { method: 'PUT', body: JSON.stringify(data) });
            showAlert('Vendor updated');
        } else {
            await fetchAPI('/inventory/vendors', { method: 'POST', body: JSON.stringify(data) });
            showAlert('Vendor added');
        }
        closeVendorModal();
        await loadInventory();
        await switchInventoryTab('vendors');
    } catch (e) { console.error(e); }
};

window.deleteVendor = async function (id) {
    if (!confirm('Delete this vendor?')) return;
    try {
        await fetchAPI(`/inventory/vendors/${id}`, { method: 'DELETE' });
        showAlert('Vendor deleted');
        await loadInventory();
    } catch (e) { console.error(e); }
};
