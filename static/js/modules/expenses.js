// ============================================
// EXPENSES.JS — Expenses page, CRUD, and printable vouchers.
// ============================================

let _expenseCategories = [];
let _lastLoadedVouchers = [];

async function loadExpenses() {
    try {
        const data = await fetchAPI('/expenses');
        _expenseCategories = data.categories || [];

        const html = `
            <div class="page-header">
                <div class="page-title">Expenses</div>
                <div class="page-sub">School expense tracking.</div>
            </div>

            <div class="card" style="margin-bottom: 16px;">
                <div style="display:flex; gap:8px; padding: 8px;">
                    <button onclick="switchExpensesView('list')" id="expTabList" class="btn btn-primary" style="padding: 8px 16px;">📋 List</button>
                    <button onclick="switchExpensesView('vouchers')" id="expTabVouchers" class="btn btn-ghost" style="padding: 8px 16px;">🧾 Vouchers</button>
                </div>
            </div>

            <!-- LIST VIEW -->
            <div id="expListViewSection" class="view-section">
                <div class="kpi-grid">
                    <div class="kpi-card"><div class="kpi-label">Total Expenses</div><div class="kpi-value" style="color:var(--red)">PKR ${(data.total || 0).toLocaleString()}</div></div>
                    <div class="kpi-card"><div class="kpi-label">Records</div><div class="kpi-value">${data.count || 0}</div></div>
                </div>
                <div class="card">
                    <div class="toolbar">
                        <div class="search-wrap"><input type="text" id="expenseSearch" placeholder="Search expenses..."></div>
                        <select id="categoryFilter" class="filter"><option value="">All Categories</option>${_expenseCategories.map(c => `<option value="${c}">${c}</option>`).join('')}</select>
                        <button onclick="filterExpenses()" class="btn btn-ghost btn-sm">Filter</button>
                        <button onclick="printExpenses()" class="btn btn-ghost btn-sm">🖨 Print Report</button>
                        <button onclick="syncExpensesToAccounts()" class="btn btn-ghost btn-sm" title="Post any expense amount not yet reflected in Accounts (Cash Book, Ledger, Trial Balance)">🔗 Sync to Accounts</button>
                        <button onclick="showExpenseModal()" class="btn btn-primary">+ Add Expense</button>
                    </div>
                    <div class="table-wrap">
                        <table class="data-table">
                            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Payment</th><th>Ref #</th><th>Actions</th></tr></thead>
                            <tbody id="expensesTableBody">${renderExpenseRows(data.expenses || [])}</tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- VOUCHER VIEW -->
            <div id="expVoucherViewSection" class="view-section" style="display:none;">
                <div class="card" style="margin-bottom: 20px;">
                    <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; background: var(--card2); padding: 10px 16px; border-radius: 8px;">
                        <label style="color: #94a3b8; font-weight: 500; font-size: 13px;">Category:</label>
                        <select id="voucherCategoryFilter" class="filter" style="min-width: 140px;">
                            <option value="">All Categories</option>
                            ${_expenseCategories.map(c => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                        <label style="color: #94a3b8; font-weight: 500; font-size: 13px;">From:</label>
                        <input type="date" id="voucherDateFrom" class="filter">
                        <label style="color: #94a3b8; font-weight: 500; font-size: 13px;">To:</label>
                        <input type="date" id="voucherDateTo" class="filter">
                        <button onclick="loadExpenseVouchers()" class="btn btn-primary">📋 Load Vouchers</button>
                        <button onclick="printExpenseVouchers()" class="btn btn-success">🖨 Print Selected/All</button>
                    </div>
                </div>
                <div class="card">
                    <div class="table-wrap">
                        <table class="data-table" id="expVoucherTable">
                            <thead>
                                <tr>
                                    <th><input type="checkbox" id="selectAllExpVouchers" onchange="toggleSelectAllExpVouchers()"></th>
                                    <th>Voucher No</th>
                                    <th>Date</th>
                                    <th>Category</th>
                                    <th>Description</th>
                                    <th>Amount</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="expVoucherTableBody"><tr><td colspan="7" style="text-align:center;">Set filters and click "Load Vouchers".</td></tr></tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div id="expenseModal" class="modal-overlay">
                <div class="modal">
                    <div class="modal-header"><h2 id="expenseModalTitle">Add Expense</h2><span class="close-btn" onclick="closeExpenseModal()">&times;</span></div>
                    <div class="modal-body">
                        <form id="expenseForm" onsubmit="event.preventDefault(); saveExpense();">
                            <input type="hidden" id="expenseId">
                            <div class="form-grid">
                                <div class="form-group"><label for="expenseCategory">Category *</label>
                                    <select id="expenseCategory"><option>Salaries</option><option>Utilities</option><option>Maintenance</option><option>Stationery</option><option>Transport</option><option>Events</option><option>Other</option></select>
                                </div>
                                <div class="form-group"><label for="expenseAmount">Amount (PKR) *</label><input type="number" step="0.01" id="expenseAmount" required></div>
                                <div class="form-group full"><label for="expenseDescription">Description</label><input type="text" id="expenseDescription"></div>
                                <div class="form-group"><label for="expensePaymentMethod">Payment Method</label>
                                    <select id="expensePaymentMethod"><option>Cash</option><option>Cheque</option><option>Bank Transfer</option><option>Online</option></select>
                                </div>
                                <div class="form-group"><label for="expenseReferenceNo">Reference No</label><input type="text" id="expenseReferenceNo"></div>
                                <div class="form-group"><label for="expenseDate">Date</label><input type="date" id="expenseDate"></div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-ghost" onclick="closeExpenseModal()">Cancel</button>

                                <button type="submit" class="btn btn-primary">Save Expense</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            <!-- LEDGER POSTINGS: shows exactly what got posted to Accounts for
                 an expense — the adjustment for an edited amount is a SEPARATE
                 voucher (dated today, not the original expense date), so it
                 won't show up in the Payment Vouchers tab filtered to the
                 original date. This view finds it regardless of tab/filter. -->
            <div id="expensePostingsModal" class="modal-overlay">
                <div class="modal">
                    <div class="modal-header"><h2>Accounts Ledger Postings</h2><span class="close-btn" onclick="closeExpensePostingsModal()">&times;</span></div>
                    <div class="modal-body">
                        <div id="expensePostingsBody">Loading…</div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-ghost" onclick="closeExpensePostingsModal()">Close</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('page-content').innerHTML = html;
    } catch (e) {
        console.error(e);
        document.getElementById('page-content').innerHTML = '<div class="loading">Failed to load expenses.</div>';
    }
}

function renderExpenseRows(expenses) {
    return (expenses || []).map(e => `
        <tr>
            <td>${e.date || '-'}</td>
            <td><span class="badge badge-purple">${escapeHtml(e.category)}</span></td>
            <td>${escapeHtml(e.description || '-')}</td>
            <td style="color:var(--red); text-align:right">PKR ${parseInt(e.amount || 0).toLocaleString()}</td>
            <td>${escapeHtml(e.payment_method || '-')}</td>
            <td>${escapeHtml(e.reference_no || '-')}</td>
            <td class="actions">
                <button onclick="editExpense(${e.id})" class="btn btn-ghost btn-sm">✏</button>
                <button onclick="printExpenseVoucher(${e.id})" class="btn btn-ghost btn-sm">🧾</button>
                <button onclick="viewExpensePostings(${e.id})" class="btn btn-ghost btn-sm" title="See exactly what this expense posted to Accounts (incl. edits/adjustments)">🔗</button>
                <button onclick="deleteExpense(${e.id})" class="btn btn-danger btn-sm">🗑</button>
            </td>
        </tr>
    `).join('');
}

// Shows every Accounts voucher auto-posted for this expense — the
// original entry AND any later adjustment/reversal from an edit — in one
// place. Solves the common confusion of "I edited the amount but nothing
// changed in Accounts": the adjustment is a real, separate voucher, it's
// just dated today (not the expense's date) and, for a decrease, filed
// under Receipt Vouchers rather than Payment Vouchers — easy to miss if
// you're only looking at one tab/date filter.
window.viewExpensePostings = async function(id) {
    const modal = document.getElementById('expensePostingsModal');
    const body = document.getElementById('expensePostingsBody');
    modal.classList.add('active');
    body.innerHTML = 'Loading…';
    try {
        const data = await fetchAPI(`/expenses/${id}/postings`);
        const postings = data.postings || [];
        if (postings.length === 0) {
            body.innerHTML = `<p style="color:#94a3b8;">No ledger postings found for this expense yet. If you just saved it, try refreshing — or check that this expense's category and payment method both map to an active Chart of Accounts account.</p>`;
            return;
        }
        const total = postings.reduce((sum, p) => sum + parseFloat(p.amount), 0);
        body.innerHTML = `
            <p style="color:#94a3b8;font-size:13px;margin-bottom:10px;">
                Net amount posted to Accounts: <strong style="color:var(--text);">PKR ${total.toLocaleString()}</strong>
                — this should match the expense's current amount.
            </p>
            <table class="data-table">
                <thead><tr><th>Voucher #</th><th>Type</th><th>Voucher Date</th><th style="text-align:right">Amount</th></tr></thead>
                <tbody>
                    ${postings.map(p => `
                        <tr>
                            <td><strong>${escapeHtml(p.voucher_no)}</strong></td>
                            <td>${escapeHtml(p.voucher_type)}${parseFloat(p.amount) < 0 ? ' <span style="color:#f87171;">(adjustment)</span>' : ''}</td>
                            <td>${p.voucher_date || '-'}</td>
                            <td style="text-align:right">PKR ${parseFloat(p.amount).toLocaleString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <p style="color:#94a3b8;font-size:12px;margin-top:10px;">
                Note: the original voucher is never edited — a change in amount posts as an extra
                adjustment voucher dated today. A decrease appears as a Receipt Voucher (money credited
                back to the expense account), so check that tab too if you're browsing Accounts manually.
            </p>
        `;
    } catch (e) {
        body.innerHTML = `<p style="color:var(--red);">Failed to load postings: ${escapeHtml(e.message || '')}</p>`;
    }
};

window.closeExpensePostingsModal = function() {
    document.getElementById('expensePostingsModal').classList.remove('active');
};

// ============================================
// TAB SWITCHING
// ============================================
window.switchExpensesView = function(view) {
    const listView = document.getElementById('expListViewSection');
    const voucherView = document.getElementById('expVoucherViewSection');
    const tabList = document.getElementById('expTabList');
    const tabVouchers = document.getElementById('expTabVouchers');

    const sections = { list: listView, vouchers: voucherView };
    const tabs = { list: tabList, vouchers: tabVouchers };

    Object.keys(sections).forEach(key => {
        if (sections[key]) sections[key].style.display = (key === view) ? 'block' : 'none';
        if (tabs[key]) {
            if (key === view) { tabs[key].classList.add('btn-primary'); tabs[key].classList.remove('btn-ghost'); }
            else { tabs[key].classList.add('btn-ghost'); tabs[key].classList.remove('btn-primary'); }
        }
    });

    if (view === 'vouchers' && _lastLoadedVouchers.length === 0) {
        loadExpenseVouchers();
    }
};

// ============================================
// LIST / CRUD FUNCTIONS
// ============================================
window.filterExpenses = async function() {
    const search = document.getElementById('expenseSearch')?.value || '';
    const cat = document.getElementById('categoryFilter')?.value || '';
    let url = `/expenses?q=${encodeURIComponent(search)}`;
    if (cat) url += `&category=${encodeURIComponent(cat)}`;
    const data = await fetchAPI(url);
    const tbody = document.getElementById('expensesTableBody');
    if (tbody) tbody.innerHTML = renderExpenseRows(data.expenses || []);
};

window.showExpenseModal = function() {
    const modal = document.getElementById('expenseModal');
    if (modal) { document.getElementById('expenseModalTitle').innerText = 'Add Expense'; document.getElementById('expenseForm').reset(); document.getElementById('expenseId').value = ''; modal.classList.add('active'); }
};

window.closeExpenseModal = function() {
    const modal = document.getElementById('expenseModal');
    if (modal) modal.classList.remove('active');
};

window.editExpense = async function(id) {
    try {
        const data = await fetchAPI('/expenses');
        const exp = (data.expenses || []).find(e => e.id === id);
        if (exp) {
            document.getElementById('expenseModalTitle').innerText = 'Edit Expense';
            document.getElementById('expenseId').value = exp.id;
            document.getElementById('expenseCategory').value = exp.category;
            document.getElementById('expenseAmount').value = exp.amount;
            document.getElementById('expenseDescription').value = exp.description || '';
            document.getElementById('expensePaymentMethod').value = exp.payment_method || '';
            document.getElementById('expenseReferenceNo').value = exp.reference_no || '';
            document.getElementById('expenseDate').value = exp.date || '';
            document.getElementById('expenseModal').classList.add('active');
        }
    } catch (e) { showAlert('Failed to load expense', 'error'); }
};

window.saveExpense = async function() {
    const id = document.getElementById('expenseId').value;
    const data = {
        category: document.getElementById('expenseCategory').value,
        amount: parseFloat(document.getElementById('expenseAmount').value),
        description: document.getElementById('expenseDescription').value,
        payment_method: document.getElementById('expensePaymentMethod').value,
        reference_no: document.getElementById('expenseReferenceNo').value,
        date: document.getElementById('expenseDate').value
    };
    if (!data.category || !data.amount) { showAlert('Please fill required fields', 'error'); return; }
    try {
        let result;
        if (id) { result = await fetchAPI(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }); showAlert('Expense updated'); }
        else { result = await fetchAPI('/expenses', { method: 'POST', body: JSON.stringify(data) }); showAlert('Expense added'); }
        // If the amount couldn't be posted to Accounts (e.g. Chart of
        // Accounts is missing an active account for this category/payment
        // method), say so explicitly — don't let it pass as a silent gap.
        if (result && result.accounting_warning) {
            showAlert(result.accounting_warning, 'error');
        }
        closeExpenseModal();
        await loadExpenses();
    } catch (e) { console.error(e); }
};

window.deleteExpense = async function(id) {
    if (confirm('Delete expense?')) {
        try {
            const result = await fetchAPI(`/expenses/${id}`, { method: 'DELETE' });
            showAlert('Expense deleted');
            if (result && result.accounting_warning) {
                showAlert(result.accounting_warning, 'error');
            }
            await loadExpenses();
        }
        catch (e) { console.error(e); }
    }
};

// One-time / on-demand backfill: posts any expense amount that hasn't
// been reflected in Accounts yet (e.g. because Chart of Accounts was
// missing an account when it was first saved). Safe to run repeatedly.
window.syncExpensesToAccounts = async function() {
    if (!confirm('Post any expense amounts not yet reflected in Accounts (Cash Book, Ledger, Trial Balance)?')) return;
    try {
        const result = await fetchAPI('/expenses/accounts-sync', { method: 'POST' });
        showAlert(result.message || `Synced ${result.posted} expense(s) to Accounts`);
        if (result.warnings && result.warnings.length > 0) {
            showAlert(result.warnings.join(' | '), 'error');
        }
    } catch (e) {
        showAlert('Failed to sync expenses to Accounts: ' + e.message, 'error');
    }
};

window.printExpenses = async function() {
    const data = await fetchAPI('/expenses');
    let rows = '';
    (data.expenses || []).forEach(e => {
        rows += `<tr><td>${e.date || '-'}</td><td>${escapeHtml(e.category)}</td><td>${escapeHtml(e.description || '-')}</td><td style="text-align:right">PKR ${e.amount.toLocaleString()}</td><td>${escapeHtml(e.payment_method || '-')}</td></tr>`;
    });
    printPreview(`<h3>Expenses Report - Total: PKR ${data.total.toLocaleString()}</h3><table class="data-table"><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Payment Method</th></tr></thead><tbody>${rows}</tbody></table>`, 'Expenses Report');
};

// ============================================
// VOUCHER (PRINTABLE RECEIPT) FUNCTIONS
// ============================================
window.loadExpenseVouchers = async function() {
    const tbody = document.getElementById('expVoucherTableBody');
    const category = document.getElementById('voucherCategoryFilter')?.value || '';
    const dateFrom = document.getElementById('voucherDateFrom')?.value || '';
    const dateTo = document.getElementById('voucherDateTo')?.value || '';

    let url = '/expenses/vouchers/bulk?';
    if (category) url += `category=${encodeURIComponent(category)}&`;
    if (dateFrom) url += `date_from=${encodeURIComponent(dateFrom)}&`;
    if (dateTo) url += `date_to=${encodeURIComponent(dateTo)}&`;

    try {
        const data = await fetchAPI(url);
        _lastLoadedVouchers = data.vouchers || [];

        if (!_lastLoadedVouchers.length) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No expenses found for these filters.</td></tr>';
            return;
        }

        tbody.innerHTML = _lastLoadedVouchers.map(v => `
            <tr>
                <td><input type="checkbox" class="exp-voucher-checkbox" data-id="${v.id}"></td>
                <td>${v.voucher_no}</td>
                <td>${v.date || '-'}</td>
                <td><span class="badge badge-purple">${escapeHtml(v.category)}</span></td>
                <td>${escapeHtml(v.description || '-')}</td>
                <td style="text-align:right">PKR ${parseInt(v.amount || 0).toLocaleString()}</td>
                <td class="actions"><button onclick="printExpenseVoucher(${v.id})" class="btn btn-ghost btn-sm">🖨</button></td>
            </tr>
        `).join('');
    } catch (e) {
        console.error(e);
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Failed to load vouchers.</td></tr>';
    }
};

window.toggleSelectAllExpVouchers = function() {
    const checked = document.getElementById('selectAllExpVouchers').checked;
    document.querySelectorAll('.exp-voucher-checkbox').forEach(cb => cb.checked = checked);
};

window.printExpenseVoucher = async function(id) {
    try {
        const voucher = await fetchAPI(`/expenses/voucher/${id}`);
        printPreview(generateExpenseVoucherHTML([voucher]), `Expense Voucher - ${voucher.voucher_no}`);
    } catch (e) {
        showAlert('Failed to print voucher: ' + e.message, 'error');
    }
};

window.printExpenseVouchers = function() {
    const checked = document.querySelectorAll('.exp-voucher-checkbox:checked');
    let toPrint;

    if (checked.length > 0) {
        const ids = new Set(Array.from(checked).map(cb => parseInt(cb.dataset.id)));
        toPrint = _lastLoadedVouchers.filter(v => ids.has(v.id));
    } else {
        toPrint = _lastLoadedVouchers;
    }

    if (!toPrint.length) {
        showAlert('No vouchers to print. Load vouchers first.', 'error');
        return;
    }

    printPreview(generateExpenseVoucherHTML(toPrint), 'Expense Vouchers');
};

function generateExpenseVoucherHTML(vouchers) {
    const today = new Date().toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' });

    const copies = vouchers.map(v => `
        <div class="voucher-copy">
            <div class="voucher-header">
                <div class="school-name">${escapeHtml(typeof SCHOOL_NAME !== 'undefined' ? SCHOOL_NAME : 'School')}</div>
                <div class="voucher-title">Expense Voucher</div>
            </div>
            <div class="voucher-meta">
                <div><strong>Voucher No:</strong> ${v.voucher_no}</div>
                <div><strong>Printed:</strong> ${today}</div>
                <div><strong>Expense Date:</strong> ${v.date || '-'}</div>
            </div>
            <div class="fee-table">
                <table>
                    <thead><tr><th>Description</th><th>Amount (PKR)</th></tr></thead>
                    <tbody>
                        <tr><td><strong>Category</strong></td><td>${escapeHtml(v.category)}</td></tr>
                        <tr><td>${escapeHtml(v.description || 'Expense payment')}</td><td>${(v.amount || 0).toLocaleString()}</td></tr>
                        <tr><td>Payment Method</td><td>${escapeHtml(v.payment_method || '-')}</td></tr>
                        <tr><td>Reference No</td><td>${escapeHtml(v.reference_no || '-')}</td></tr>
                        <tr class="total-row"><td><strong>Total</strong></td><td><strong>${(v.amount || 0).toLocaleString()}</strong></td></tr>
                    </tbody>
                </table>
            </div>
            <div class="signature-area">
                <div>_____________<br>Prepared By</div>
                <div>_____________<br>Approved By</div>
                <div>_____________<br>Accountant</div>
            </div>
            <div class="footer-text">System Generated Voucher</div>
        </div>
    `).join('<div style="page-break-after: always;"></div>');

    return `
        <style>
            .voucher-container { display:flex; flex-wrap:wrap; justify-content:space-around; max-width:1100px; margin:0 auto; background:#fff; padding:10px; font-family:'Segoe UI', Arial, sans-serif; }
            .voucher-copy { border:2px solid #1e293b; border-radius:6px; padding:16px; margin:10px auto; max-width:500px; background:#fff; font-size:13px; page-break-inside: avoid; }
            .voucher-header { text-align:center; border-bottom:2px solid #3b82f6; padding-bottom:6px; margin-bottom:10px; }
            .school-name { font-size:18px; font-weight:bold; color:#1e293b; }
            .voucher-title { font-size:14px; color:#3b82f6; font-weight:600; }
            .voucher-meta { display:flex; justify-content:space-between; flex-wrap:wrap; gap:6px; font-size:12px; margin-bottom:10px; color:#334155; }
            .fee-table table { width:100%; border-collapse:collapse; font-size:12px; }
            .fee-table td, .fee-table th { border:1px solid #cbd5e1; padding:6px 8px; }
            .fee-table th { background:#f1f5f9; text-align:left; }
            .fee-table td:last-child { text-align:right; }
            .total-row td { background:#f8fafc; }
            .signature-area { display:flex; justify-content:space-between; margin-top:30px; font-size:11px; text-align:center; color:#334155; }
            .footer-text { text-align:center; font-size:10px; color:#94a3b8; margin-top:14px; }
        </style>
        <div class="voucher-container">${copies}</div>
    `;
}
