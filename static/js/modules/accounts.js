// ============================================
// ACCOUNTS.JS — Accounts Module.
// Chart of Accounts, Journal/Payment/Receipt Vouchers,
// Cash Book, Bank Book, Ledger, Trial Balance,
// Profit & Loss, Balance Sheet.
// ============================================

let currentAccountsTab = 'cashbook';
const ACCOUNTS_TABS = [
    { key: 'cashbook', label: '💵 Cash Book' },
    { key: 'bankbook', label: '🏦 Bank Book' },
    { key: 'journal', label: '📓 Journal Voucher' },
    { key: 'payment', label: '📤 Payment Voucher' },
    { key: 'receipt', label: '📥 Receipt Voucher' },
    { key: 'ledger', label: '📒 Ledger' },
    { key: 'trialbalance', label: '⚖️ Trial Balance' },
    { key: 'pl', label: '📈 Profit & Loss' },
    { key: 'balancesheet', label: '🧾 Balance Sheet' },
    { key: 'coa', label: '🗂️ Chart of Accounts' },
];

let acctChartCache = null; // list of chart-of-accounts rows, cached per page-load

function todayStr() { return new Date().toISOString().slice(0, 10); }
function monthStartStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
function fmtMoney(n) { return 'PKR ' + (parseFloat(n || 0)).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }

async function getChartOfAccounts(force = false) {
    if (acctChartCache && !force) return acctChartCache;
    try {
        const data = await fetchAPI('/accounts/chart?active_only=1');
        acctChartCache = data.accounts || [];
    } catch (e) { acctChartCache = []; }
    return acctChartCache;
}

function acctOptions(accounts, opts = {}) {
    const filtered = accounts.filter(a => {
        if (opts.category && a.category !== opts.category) return false;
        if (opts.categoryIn && !opts.categoryIn.includes(a.category)) return false;
        if (opts.accountType && a.account_type !== opts.accountType) return false;
        return true;
    });
    return filtered.map(a => `<option value="${a.id}">${escapeHtml(a.code)} — ${escapeHtml(a.name)}</option>`).join('');
}

async function loadAccounts() {
    const html = `
        <div class="page-header">
            <div class="page-title">Accounts</div>
            <div class="page-sub">Cash Book, Bank Book, Vouchers, Ledger, Trial Balance, Profit &amp; Loss and Balance Sheet.</div>
        </div>
        <div class="toolbar no-print" id="acctTabBar" style="flex-wrap:wrap;">
            ${ACCOUNTS_TABS.map(t => `<button onclick="switchAccountsTab('${t.key}')" id="acctTab_${t.key}" class="btn ${t.key === currentAccountsTab ? 'btn-primary' : 'btn-ghost'} btn-sm">${t.label}</button>`).join('')}
        </div>
        <div id="acctTabContent"><div class="loading">Loading…</div></div>
    `;
    document.getElementById('page-content').innerHTML = html;
    acctChartCache = null;
    await getChartOfAccounts(true);
    await switchAccountsTab(currentAccountsTab);
}

window.switchAccountsTab = async function (tab) {
    currentAccountsTab = tab;
    ACCOUNTS_TABS.forEach(t => {
        const btn = document.getElementById(`acctTab_${t.key}`);
        if (btn) btn.className = `btn ${t.key === tab ? 'btn-primary' : 'btn-ghost'} btn-sm`;
    });
    const box = document.getElementById('acctTabContent');
    box.innerHTML = '<div class="loading">Loading…</div>';
    try {
        if (tab === 'cashbook') await renderCashBankBookTab(box, 'cash', 'Cash Book', '/accounts/cash-book');
        else if (tab === 'bankbook') await renderCashBankBookTab(box, 'bank', 'Bank Book', '/accounts/bank-book');
        else if (tab === 'journal') await renderVoucherListTab(box, 'Journal', 'Journal Vouchers', 'showJournalVoucherModal');
        else if (tab === 'payment') await renderVoucherListTab(box, 'Payment', 'Payment Vouchers', 'showPaymentVoucherModal');
        else if (tab === 'receipt') await renderVoucherListTab(box, 'Receipt', 'Receipt Vouchers', 'showReceiptVoucherModal');
        else if (tab === 'ledger') await renderLedgerTab(box);
        else if (tab === 'trialbalance') await renderTrialBalanceTab(box);
        else if (tab === 'pl') await renderProfitLossTab(box);
        else if (tab === 'balancesheet') await renderBalanceSheetTab(box);
        else if (tab === 'coa') await renderChartOfAccountsTab(box);
    } catch (e) {
        console.error(e);
        box.innerHTML = '<div class="loading">Failed to load this tab.</div>';
    }
};

// ============================================
// CASH BOOK / BANK BOOK (shared renderer)
// ============================================
async function renderCashBankBookTab(box, category, title, endpoint) {
    const accounts = (await getChartOfAccounts()).filter(a => a.category === category);
    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div class="toolbar">
                <label style="color:#94a3b8;font-size:13px;">From:</label>
                <input type="date" id="acctBookFrom" class="filter" value="${monthStartStr()}">
                <label style="color:#94a3b8;font-size:13px;">To:</label>
                <input type="date" id="acctBookTo" class="filter" value="${todayStr()}">
                <select id="acctBookAccount" class="filter"><option value="">All ${escapeHtml(title)} Accounts</option>${accounts.map(a => `<option value="${a.id}">${escapeHtml(a.code)} — ${escapeHtml(a.name)}</option>`).join('')}</select>
                <button class="btn btn-ghost btn-sm" onclick="loadCashBankBook('${category}','${endpoint}')">Filter</button>
                <button class="btn btn-primary btn-sm" onclick="printCashBankBook('${category}','${title}')" style="margin-left:auto;">🖨 Print</button>
            </div>
        </div>
        <div id="acctBookResult"><div class="loading">Loading…</div></div>
    `;
    await loadCashBankBook(category, endpoint);
}

window.loadCashBankBook = async function (category, endpoint) {
    const from = document.getElementById('acctBookFrom')?.value || '';
    const to = document.getElementById('acctBookTo')?.value || '';
    const accountId = document.getElementById('acctBookAccount')?.value || '';
    let url = `${endpoint}?date_from=${from}&date_to=${to}`;
    if (accountId) url += `&account_id=${accountId}`;
    const data = await fetchAPI(url);
    const result = document.getElementById('acctBookResult');
    if (!result) return;

    const s = data.summary || {};
    let html = `
        <div class="kpi-grid">
            <div class="kpi-card"><div class="kpi-label">Opening Balance</div><div class="kpi-value">${fmtMoney(s.opening_balance)}</div></div>
            <div class="kpi-card"><div class="kpi-label">Total Receipts (Dr)</div><div class="kpi-value" style="color:var(--green)">${fmtMoney(s.total_receipts)}</div></div>
            <div class="kpi-card"><div class="kpi-label">Total Payments (Cr)</div><div class="kpi-value" style="color:var(--red)">${fmtMoney(s.total_payments)}</div></div>
            <div class="kpi-card"><div class="kpi-label">Closing Balance</div><div class="kpi-value">${fmtMoney(s.closing_balance)} ${s.closing_balance_side || ''}</div></div>
        </div>
    `;

    (data.accounts || []).forEach(acc => {
        html += `<div class="card" style="margin-top:12px;">
            <h3 style="margin:0 0 10px 0;">${escapeHtml(acc.account.code)} — ${escapeHtml(acc.account.name)}</h3>
            <div class="table-wrap"><table class="data-table">
                <thead><tr><th>Date</th><th>Voucher #</th><th>Type</th><th>Particulars</th><th style="text-align:right">Receipt (Dr)</th><th style="text-align:right">Payment (Cr)</th><th style="text-align:right">Balance</th></tr></thead>
                <tbody>
                    <tr style="font-weight:600;background:var(--card2)"><td colspan="6">Opening Balance</td><td style="text-align:right">${fmtMoney(acc.opening_balance)} ${acc.opening_balance_side}</td></tr>
                    ${(acc.entries || []).map(e => `<tr>
                        <td>${e.voucher_date || '-'}</td>
                        <td>${escapeHtml(e.voucher_no || '-')}</td>
                        <td><span class="badge badge-blue">${escapeHtml(e.voucher_type || '-')}</span></td>
                        <td>${escapeHtml(e.particulars || e.narration || '-')}</td>
                        <td style="text-align:right; color:var(--green)">${e.debit ? fmtMoney(e.debit) : ''}</td>
                        <td style="text-align:right; color:var(--red)">${e.credit ? fmtMoney(e.credit) : ''}</td>
                        <td style="text-align:right">${fmtMoney(e.balance)} ${e.balance_side}</td>
                    </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:#94a3b8;">No transactions in this period</td></tr>'}
                    <tr style="font-weight:700;background:var(--card2)"><td colspan="4">Closing Balance</td><td style="text-align:right;color:var(--green)">${fmtMoney(acc.total_debit)}</td><td style="text-align:right;color:var(--red)">${fmtMoney(acc.total_credit)}</td><td style="text-align:right">${fmtMoney(acc.closing_balance)} ${acc.closing_balance_side}</td></tr>
                </tbody>
            </table></div>
        </div>`;
    });

    if (!(data.accounts || []).length) html += `<div class="card" style="margin-top:12px;"><div class="loading">No ${escapeHtml(category)} accounts found. Add one in Chart of Accounts.</div></div>`;

    result.innerHTML = html;
    window._lastAcctBook = data;
};

window.printCashBankBook = function (category, title) {
    const data = window._lastAcctBook;
    if (!data) { showAlert('Nothing to print yet', 'error'); return; }
    let content = `<h3>${escapeHtml(title)}</h3>`;
    (data.accounts || []).forEach(acc => {
        content += `<h4>${escapeHtml(acc.account.code)} — ${escapeHtml(acc.account.name)}</h4>
        <table class="data-table"><thead><tr><th>Date</th><th>Voucher #</th><th>Particulars</th><th>Receipt</th><th>Payment</th><th>Balance</th></tr></thead><tbody>
        <tr><td colspan="5">Opening Balance</td><td>${fmtMoney(acc.opening_balance)} ${acc.opening_balance_side}</td></tr>
        ${(acc.entries || []).map(e => `<tr><td>${e.voucher_date || '-'}</td><td>${escapeHtml(e.voucher_no || '-')}</td><td>${escapeHtml(e.particulars || '-')}</td><td>${e.debit ? fmtMoney(e.debit) : ''}</td><td>${e.credit ? fmtMoney(e.credit) : ''}</td><td>${fmtMoney(e.balance)} ${e.balance_side}</td></tr>`).join('')}
        <tr><td colspan="5">Closing Balance</td><td>${fmtMoney(acc.closing_balance)} ${acc.closing_balance_side}</td></tr>
        </tbody></table>`;
    });
    printPreview(content, title);
};

// ============================================
// VOUCHER LISTS (Journal / Payment / Receipt)
// ============================================
async function renderVoucherListTab(box, voucherType, title, addModalFn) {
    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div class="toolbar">
                <input type="text" id="voucherSearch" class="filter" placeholder="Search voucher #, party, narration...">
                <label style="color:#94a3b8;font-size:13px;">From:</label>
                <input type="date" id="voucherFrom" class="filter">
                <label style="color:#94a3b8;font-size:13px;">To:</label>
                <input type="date" id="voucherTo" class="filter">
                <button class="btn btn-ghost btn-sm" onclick="loadVoucherList('${voucherType}')">Filter</button>
                <label style="color:#94a3b8;font-size:13px;display:flex;align-items:center;gap:4px;">
                    <input type="checkbox" id="voucherShowVoided" onchange="loadVoucherList('${voucherType}')"> Show voided
                </label>
                <button class="btn btn-primary" onclick="${addModalFn}()" style="margin-left:auto;">+ New ${escapeHtml(title.replace(/s$/, ''))}</button>
            </div>
        </div>
        <div id="voucherListResult"><div class="loading">Loading…</div></div>
        ${voucherType === 'Journal' ? journalVoucherModalHtml() : ''}
        ${voucherType === 'Payment' ? paymentReceiptModalHtml('Payment') : ''}
        ${voucherType === 'Receipt' ? paymentReceiptModalHtml('Receipt') : ''}
    `;
    await loadVoucherList(voucherType);
}

window.loadVoucherList = async function (voucherType) {
    const q = document.getElementById('voucherSearch')?.value || '';
    const from = document.getElementById('voucherFrom')?.value || '';
    const to = document.getElementById('voucherTo')?.value || '';
    const showVoided = document.getElementById('voucherShowVoided')?.checked || false;
    const data = await fetchAPI(`/accounts/vouchers?voucher_type=${voucherType}&q=${encodeURIComponent(q)}&date_from=${from}&date_to=${to}&include_voided=${showVoided ? '1' : '0'}`);
    const result = document.getElementById('voucherListResult');
    if (!result) return;
    result.innerHTML = `
        <div class="kpi-grid">
            <div class="kpi-card"><div class="kpi-label">Total ${escapeHtml(voucherType)} Vouchers</div><div class="kpi-value">${data.count || 0}</div></div>
            <div class="kpi-card"><div class="kpi-label">Total Amount</div><div class="kpi-value">${fmtMoney(data.total)}</div></div>
        </div>
        <div class="card" style="margin-top:12px;">
            <div class="table-wrap"><table class="data-table">
                <thead><tr><th>Voucher #</th><th>Date</th><th>Party</th><th>Narration</th><th style="text-align:right">Amount</th><th>Actions</th></tr></thead>
                <tbody>${(data.vouchers || []).map(v => `<tr style="${v.is_voided ? 'opacity:0.55;' : ''}">
                    <td><strong>${escapeHtml(v.voucher_no)}</strong>${v.is_voided ? ' <span class="badge" style="background:#7f1d1d;color:#fecaca;" title="' + escapeHtml(v.voided_reason || 'No reason given') + ' — voided by ' + escapeHtml(v.voided_by || '-') + ' on ' + escapeHtml(v.voided_at || '-') + '">VOIDED</span>' : ''}</td>
                    <td>${v.voucher_date || '-'}</td>
                    <td>${escapeHtml(v.party_name || '-')}</td>
                    <td>${escapeHtml(v.narration || '-')}${v.is_voided ? '<br><span style="color:#f87171;font-size:12px;">Reason: ' + escapeHtml(v.voided_reason || '-') + '</span>' : ''}</td>
                    <td style="text-align:right">${fmtMoney(v.total_amount)}</td>
                    <td class="actions">
                        <button onclick="viewVoucher(${v.id})" class="btn btn-ghost btn-sm">👁</button>
                        <button onclick="printVoucher(${v.id})" class="btn btn-ghost btn-sm">🖨</button>
                        ${v.is_voided ? '' : `<button onclick="deleteVoucher(${v.id},'${voucherType}')" class="btn btn-danger btn-sm" title="Void this voucher">🚫</button>`}
                    </td>
                </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">No vouchers found</td></tr>'}</tbody>
            </table></div>
        </div>
    `;
};

window.viewVoucher = async function (id) {
    try {
        const data = await fetchAPI(`/accounts/vouchers/${id}`);
        const v = data.voucher;
        const rows = (v.entries || []).map(e => `<tr><td>${escapeHtml(e.account_code)} — ${escapeHtml(e.account_name)}</td><td>${escapeHtml(e.particulars || '-')}</td><td style="text-align:right">${e.debit ? fmtMoney(e.debit) : ''}</td><td style="text-align:right">${e.credit ? fmtMoney(e.credit) : ''}</td></tr>`).join('');
        printPreview(`<h3>${escapeHtml(v.voucher_type)} Voucher — ${escapeHtml(v.voucher_no)}</h3>
            <p><strong>Date:</strong> ${v.voucher_date} &nbsp; <strong>Party:</strong> ${escapeHtml(v.party_name || '-')}</p>
            <p><strong>Narration:</strong> ${escapeHtml(v.narration || '-')}</p>
            <table class="data-table"><thead><tr><th>Account</th><th>Particulars</th><th>Debit</th><th>Credit</th></tr></thead><tbody>${rows}</tbody></table>`,
            `${v.voucher_type} Voucher ${v.voucher_no}`);
    } catch (e) { console.error(e); }
};
window.printVoucher = window.viewVoucher;

window.deleteVoucher = async function (id, voucherType) {
    if (!confirm('Void this voucher? It will be excluded from Cash Book, Bank Book, Ledger and Trial Balance, but kept on file for audit.')) return;
    const reason = prompt('Reason for voiding this voucher (optional):') || '';
    try {
        await fetchAPI(`/accounts/vouchers/${id}`, {
            method: 'DELETE',
            body: JSON.stringify({ reason })
        });
        showAlert('Voucher voided');
        await loadVoucherList(voucherType);
    } catch (e) { console.error(e); }
};

// ============================================
// JOURNAL VOUCHER — modal with dynamic Dr/Cr rows
// ============================================
function journalVoucherModalHtml() {
    return `
    <div id="journalVoucherModal" class="modal-overlay"><div class="modal" style="max-width:720px;">
        <div class="modal-header"><h2>New Journal Voucher</h2><span class="close-btn" onclick="closeModal('journalVoucherModal')">&times;</span></div>
        <div class="modal-body">
            <div class="form-grid">
                <div class="form-group"><label>Date *</label><input type="date" id="jvDate" value="${todayStr()}"></div>
                <div class="form-group"><label>Reference No</label><input type="text" id="jvReference"></div>
                <div class="form-group full"><label>Party Name</label><input type="text" id="jvParty"></div>
                <div class="form-group full"><label>Narration</label><input type="text" id="jvNarration" placeholder="Reason for this entry"></div>
            </div>
            <div class="table-wrap"><table class="data-table" id="jvEntriesTable">
                <thead><tr><th>Account</th><th>Particulars</th><th style="width:120px">Debit</th><th style="width:120px">Credit</th><th></th></tr></thead>
                <tbody id="jvEntriesBody"></tbody>
            </table></div>
            <button type="button" class="btn btn-ghost btn-sm" onclick="addJvRow()">+ Add Row</button>
            <div style="text-align:right; margin-top:10px; font-weight:600;">
                Total Debit: <span id="jvTotalDebit">0</span> &nbsp;|&nbsp; Total Credit: <span id="jvTotalCredit">0</span>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-ghost" onclick="closeModal('journalVoucherModal')">Cancel</button>
            <button class="btn btn-primary" onclick="saveJournalVoucher()">Save Voucher</button>
        </div>
    </div></div>`;
}

let jvRowCounter = 0;
window.showJournalVoucherModal = async function () {
    document.getElementById('jvDate').value = todayStr();
    document.getElementById('jvReference').value = '';
    document.getElementById('jvParty').value = '';
    document.getElementById('jvNarration').value = '';
    document.getElementById('jvEntriesBody').innerHTML = '';
    jvRowCounter = 0;
    addJvRow(); addJvRow();
    document.getElementById('journalVoucherModal').classList.add('active');
};

window.addJvRow = async function () {
    const accounts = await getChartOfAccounts();
    const rowId = `jvrow_${jvRowCounter++}`;
    const tr = document.createElement('tr');
    tr.id = rowId;
    tr.innerHTML = `
        <td><select class="filter jv-account" style="width:100%;"><option value="">Select account</option>${acctOptions(accounts)}</select></td>
        <td><input type="text" class="jv-particulars" style="width:100%;"></td>
        <td><input type="number" step="0.01" class="jv-debit" style="width:100%;" oninput="recalcJvTotals()" value="0"></td>
        <td><input type="number" step="0.01" class="jv-credit" style="width:100%;" oninput="recalcJvTotals()" value="0"></td>
        <td><button type="button" class="btn btn-danger btn-sm" onclick="document.getElementById('${rowId}').remove(); recalcJvTotals();">🗑</button></td>
    `;
    document.getElementById('jvEntriesBody').appendChild(tr);
};

window.recalcJvTotals = function () {
    let debit = 0, credit = 0;
    document.querySelectorAll('#jvEntriesBody tr').forEach(tr => {
        debit += parseFloat(tr.querySelector('.jv-debit')?.value || 0);
        credit += parseFloat(tr.querySelector('.jv-credit')?.value || 0);
    });
    document.getElementById('jvTotalDebit').textContent = debit.toFixed(2);
    document.getElementById('jvTotalCredit').textContent = credit.toFixed(2);
};

window.saveJournalVoucher = async function () {
    const entries = [];
    document.querySelectorAll('#jvEntriesBody tr').forEach(tr => {
        const accountId = tr.querySelector('.jv-account')?.value;
        const debit = parseFloat(tr.querySelector('.jv-debit')?.value || 0);
        const credit = parseFloat(tr.querySelector('.jv-credit')?.value || 0);
        const particulars = tr.querySelector('.jv-particulars')?.value || '';
        if (accountId && (debit || credit)) entries.push({ account_id: parseInt(accountId), debit, credit, particulars });
    });
    const payload = {
        voucher_date: document.getElementById('jvDate').value,
        reference_no: document.getElementById('jvReference').value,
        party_name: document.getElementById('jvParty').value,
        narration: document.getElementById('jvNarration').value,
        entries,
    };
    try {
        const res = await fetchAPI('/accounts/vouchers/journal', { method: 'POST', body: JSON.stringify(payload) });
        showAlert(`Journal voucher ${res.voucher_no} created`);
        closeModal('journalVoucherModal');
        await loadVoucherList('Journal');
    } catch (e) { console.error(e); }
};

// ============================================
// PAYMENT / RECEIPT VOUCHER — cash/bank leg + line items
// ============================================
function paymentReceiptModalHtml(kind) {
    const id = kind.toLowerCase();
    const cashBankLabel = kind === 'Payment' ? 'Pay From (Cash/Bank Account) *' : 'Receive Into (Cash/Bank Account) *';
    const lineLabel = kind === 'Payment' ? 'Expense / Payable Account' : 'Income / Receivable Account';
    return `
    <div id="${id}VoucherModal" class="modal-overlay"><div class="modal" style="max-width:720px;">
        <div class="modal-header"><h2>New ${kind} Voucher</h2><span class="close-btn" onclick="closeModal('${id}VoucherModal')">&times;</span></div>
        <div class="modal-body">
            <div class="form-grid">
                <div class="form-group"><label>Date *</label><input type="date" id="${id}Date" value="${todayStr()}"></div>
                <div class="form-group"><label>${escapeHtml(cashBankLabel)}</label><select id="${id}CashBankAccount" class="filter" style="width:100%;"></select></div>
                <div class="form-group"><label>Party Name</label><input type="text" id="${id}Party" placeholder="${kind === 'Payment' ? 'Paid to' : 'Received from'}"></div>
                <div class="form-group"><label>Reference No</label><input type="text" id="${id}Reference"></div>
                <div class="form-group full"><label>Narration</label><input type="text" id="${id}Narration"></div>
            </div>
            <div class="table-wrap"><table class="data-table" id="${id}LinesTable">
                <thead><tr><th>${escapeHtml(lineLabel)}</th><th>Particulars</th><th style="width:140px">Amount</th><th></th></tr></thead>
                <tbody id="${id}LinesBody"></tbody>
            </table></div>
            <button type="button" class="btn btn-ghost btn-sm" onclick="addPrLine('${id}')">+ Add Line</button>
            <div style="text-align:right; margin-top:10px; font-weight:600;">Total: <span id="${id}Total">0</span></div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-ghost" onclick="closeModal('${id}VoucherModal')">Cancel</button>
            <button class="btn btn-primary" onclick="savePrVoucher('${kind}')">Save Voucher</button>
        </div>
    </div></div>`;
}

let prRowCounter = 0;
async function openPrModal(kind) {
    const id = kind.toLowerCase();
    const accounts = await getChartOfAccounts();
    document.getElementById(`${id}Date`).value = todayStr();
    document.getElementById(`${id}CashBankAccount`).innerHTML = acctOptions(accounts, { categoryIn: ['cash', 'bank'] });
    document.getElementById(`${id}Party`).value = '';
    document.getElementById(`${id}Reference`).value = '';
    document.getElementById(`${id}Narration`).value = '';
    document.getElementById(`${id}LinesBody`).innerHTML = '';
    prRowCounter = 0;
    await addPrLine(id);
    document.getElementById(`${id}VoucherModal`).classList.add('active');
}
window.showPaymentVoucherModal = function () { openPrModal('Payment'); };
window.showReceiptVoucherModal = function () { openPrModal('Receipt'); };

window.addPrLine = async function (id) {
    const accounts = await getChartOfAccounts();
    const generalAccounts = accounts.filter(a => a.category === 'general');
    const rowId = `${id}row_${prRowCounter++}`;
    const tr = document.createElement('tr');
    tr.id = rowId;
    tr.innerHTML = `
        <td><select class="filter pr-account" style="width:100%;"><option value="">Select account</option>${generalAccounts.map(a => `<option value="${a.id}">${escapeHtml(a.code)} — ${escapeHtml(a.name)}</option>`).join('')}</select></td>
        <td><input type="text" class="pr-particulars" style="width:100%;"></td>
        <td><input type="number" step="0.01" class="pr-amount" style="width:100%;" oninput="recalcPrTotal('${id}')" value="0"></td>
        <td><button type="button" class="btn btn-danger btn-sm" onclick="document.getElementById('${rowId}').remove(); recalcPrTotal('${id}');">🗑</button></td>
    `;
    document.getElementById(`${id}LinesBody`).appendChild(tr);
};

window.recalcPrTotal = function (id) {
    let total = 0;
    document.querySelectorAll(`#${id}LinesBody tr`).forEach(tr => { total += parseFloat(tr.querySelector('.pr-amount')?.value || 0); });
    document.getElementById(`${id}Total`).textContent = total.toFixed(2);
};

window.savePrVoucher = async function (kind) {
    const id = kind.toLowerCase();
    const lines = [];
    document.querySelectorAll(`#${id}LinesBody tr`).forEach(tr => {
        const accountId = tr.querySelector('.pr-account')?.value;
        const amount = parseFloat(tr.querySelector('.pr-amount')?.value || 0);
        const particulars = tr.querySelector('.pr-particulars')?.value || '';
        if (accountId && amount) lines.push({ account_id: parseInt(accountId), amount, particulars });
    });
    const payload = {
        voucher_date: document.getElementById(`${id}Date`).value,
        cash_bank_account_id: document.getElementById(`${id}CashBankAccount`).value,
        party_name: document.getElementById(`${id}Party`).value,
        reference_no: document.getElementById(`${id}Reference`).value,
        narration: document.getElementById(`${id}Narration`).value,
        lines,
    };
    try {
        const res = await fetchAPI(`/accounts/vouchers/${id}`, { method: 'POST', body: JSON.stringify(payload) });
        showAlert(`${kind} voucher ${res.voucher_no} created`);
        closeModal(`${id}VoucherModal`);
        await loadVoucherList(kind);
    } catch (e) { console.error(e); }
};

window.closeModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
};

// ============================================
// LEDGER (single account view)
// ============================================
async function renderLedgerTab(box) {
    const accounts = await getChartOfAccounts();
    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div class="toolbar">
                <select id="ledgerAccount" class="filter" style="min-width:260px;"><option value="">Select account</option>${acctOptions(accounts)}</select>
                <label style="color:#94a3b8;font-size:13px;">From:</label>
                <input type="date" id="ledgerFrom" class="filter" value="${monthStartStr()}">
                <label style="color:#94a3b8;font-size:13px;">To:</label>
                <input type="date" id="ledgerTo" class="filter" value="${todayStr()}">
                <button class="btn btn-ghost btn-sm" onclick="loadLedger()">Show Ledger</button>
                <button class="btn btn-primary btn-sm" onclick="printLedger()" style="margin-left:auto;">🖨 Print</button>
            </div>
        </div>
        <div id="ledgerResult"></div>
    `;
}

window.loadLedger = async function () {
    const accountId = document.getElementById('ledgerAccount')?.value;
    const result = document.getElementById('ledgerResult');
    if (!accountId) { showAlert('Please select an account', 'error'); return; }
    const from = document.getElementById('ledgerFrom')?.value || '';
    const to = document.getElementById('ledgerTo')?.value || '';
    const data = await fetchAPI(`/accounts/ledger/${accountId}?date_from=${from}&date_to=${to}`);
    window._lastLedger = data;
    result.innerHTML = `
        <div class="kpi-grid">
            <div class="kpi-card"><div class="kpi-label">Opening Balance</div><div class="kpi-value">${fmtMoney(data.opening_balance)} ${data.opening_balance_side}</div></div>
            <div class="kpi-card"><div class="kpi-label">Total Debit</div><div class="kpi-value" style="color:var(--green)">${fmtMoney(data.total_debit)}</div></div>
            <div class="kpi-card"><div class="kpi-label">Total Credit</div><div class="kpi-value" style="color:var(--red)">${fmtMoney(data.total_credit)}</div></div>
            <div class="kpi-card"><div class="kpi-label">Closing Balance</div><div class="kpi-value">${fmtMoney(data.closing_balance)} ${data.closing_balance_side}</div></div>
        </div>
        <div class="card" style="margin-top:12px;">
            <h3 style="margin:0 0 10px 0;">${escapeHtml(data.account.code)} — ${escapeHtml(data.account.name)}</h3>
            <div class="table-wrap"><table class="data-table">
                <thead><tr><th>Date</th><th>Voucher #</th><th>Type</th><th>Particulars</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th><th style="text-align:right">Balance</th></tr></thead>
                <tbody>
                    <tr style="font-weight:600;background:var(--card2)"><td colspan="6">Opening Balance</td><td style="text-align:right">${fmtMoney(data.opening_balance)} ${data.opening_balance_side}</td></tr>
                    ${(data.entries || []).map(e => `<tr>
                        <td>${e.voucher_date}</td><td>${escapeHtml(e.voucher_no)}</td><td><span class="badge badge-blue">${escapeHtml(e.voucher_type)}</span></td>
                        <td>${escapeHtml(e.particulars || e.narration || '-')}</td>
                        <td style="text-align:right">${e.debit ? fmtMoney(e.debit) : ''}</td>
                        <td style="text-align:right">${e.credit ? fmtMoney(e.credit) : ''}</td>
                        <td style="text-align:right">${fmtMoney(e.balance)} ${e.balance_side}</td>
                    </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:#94a3b8;">No transactions in this period</td></tr>'}
                </tbody>
            </table></div>
        </div>
    `;
};

window.printLedger = function () {
    const data = window._lastLedger;
    if (!data) { showAlert('Select an account and show the ledger first', 'error'); return; }
    const rows = (data.entries || []).map(e => `<tr><td>${e.voucher_date}</td><td>${escapeHtml(e.voucher_no)}</td><td>${escapeHtml(e.particulars || '-')}</td><td>${e.debit ? fmtMoney(e.debit) : ''}</td><td>${e.credit ? fmtMoney(e.credit) : ''}</td><td>${fmtMoney(e.balance)} ${e.balance_side}</td></tr>`).join('');
    printPreview(`<h3>Ledger — ${escapeHtml(data.account.code)} ${escapeHtml(data.account.name)}</h3>
        <table class="data-table"><thead><tr><th>Date</th><th>Voucher #</th><th>Particulars</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>
        <tr><td colspan="5">Opening Balance</td><td>${fmtMoney(data.opening_balance)} ${data.opening_balance_side}</td></tr>
        ${rows}
        <tr><td colspan="5">Closing Balance</td><td>${fmtMoney(data.closing_balance)} ${data.closing_balance_side}</td></tr>
        </tbody></table>`, `Ledger - ${data.account.name}`);
};

// ============================================
// TRIAL BALANCE
// ============================================
async function renderTrialBalanceTab(box) {
    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div class="toolbar">
                <label style="color:#94a3b8;font-size:13px;">As of:</label>
                <input type="date" id="tbAsOf" class="filter" value="${todayStr()}">
                <button class="btn btn-ghost btn-sm" onclick="loadTrialBalance()">Show</button>
                <button class="btn btn-primary btn-sm" onclick="printTrialBalance()" style="margin-left:auto;">🖨 Print</button>
            </div>
        </div>
        <div id="tbResult"><div class="loading">Loading…</div></div>
    `;
    await loadTrialBalance();
}

window.loadTrialBalance = async function () {
    const asOf = document.getElementById('tbAsOf')?.value || '';
    const data = await fetchAPI(`/accounts/trial-balance?as_of_date=${asOf}`);
    window._lastTrialBalance = data;
    const result = document.getElementById('tbResult');
    const rows = (data.rows || []).filter(r => r.debit_balance || r.credit_balance);
    result.innerHTML = `
        <div class="card">
            <div class="table-wrap"><table class="data-table">
                <thead><tr><th>Code</th><th>Account</th><th>Type</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th></tr></thead>
                <tbody>
                    ${rows.map(r => `<tr><td>${escapeHtml(r.code)}</td><td>${escapeHtml(r.name)}</td><td><span class="badge badge-purple">${escapeHtml(r.account_type)}</span></td>
                        <td style="text-align:right">${r.debit_balance ? fmtMoney(r.debit_balance) : ''}</td>
                        <td style="text-align:right">${r.credit_balance ? fmtMoney(r.credit_balance) : ''}</td></tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">No posted transactions</td></tr>'}
                    <tr style="font-weight:700;background:var(--card2)"><td colspan="3">Total</td><td style="text-align:right">${fmtMoney(data.total_debit)}</td><td style="text-align:right">${fmtMoney(data.total_credit)}</td></tr>
                </tbody>
            </table></div>
            <div style="margin-top:10px;"><span class="badge ${data.balanced ? 'badge-green' : 'badge-red'}">${data.balanced ? '✅ Balanced' : '⚠️ Not Balanced'}</span></div>
        </div>
    `;
};

window.printTrialBalance = function () {
    const data = window._lastTrialBalance;
    if (!data) return;
    const rows = (data.rows || []).filter(r => r.debit_balance || r.credit_balance)
        .map(r => `<tr><td>${escapeHtml(r.code)}</td><td>${escapeHtml(r.name)}</td><td>${r.debit_balance ? fmtMoney(r.debit_balance) : ''}</td><td>${r.credit_balance ? fmtMoney(r.credit_balance) : ''}</td></tr>`).join('');
    printPreview(`<h3>Trial Balance ${data.as_of_date ? 'as of ' + data.as_of_date : ''}</h3>
        <table class="data-table"><thead><tr><th>Code</th><th>Account</th><th>Debit</th><th>Credit</th></tr></thead><tbody>${rows}
        <tr><td colspan="2">Total</td><td>${fmtMoney(data.total_debit)}</td><td>${fmtMoney(data.total_credit)}</td></tr></tbody></table>`, 'Trial Balance');
};

// ============================================
// PROFIT & LOSS
// ============================================
async function renderProfitLossTab(box) {
    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div class="toolbar">
                <label style="color:#94a3b8;font-size:13px;">From:</label>
                <input type="date" id="plFrom" class="filter" value="${monthStartStr()}">
                <label style="color:#94a3b8;font-size:13px;">To:</label>
                <input type="date" id="plTo" class="filter" value="${todayStr()}">
                <button class="btn btn-ghost btn-sm" onclick="loadProfitLoss()">Show</button>
                <button class="btn btn-primary btn-sm" onclick="printProfitLoss()" style="margin-left:auto;">🖨 Print</button>
            </div>
        </div>
        <div id="plResult"><div class="loading">Loading…</div></div>
    `;
    await loadProfitLoss();
}

window.loadProfitLoss = async function () {
    const from = document.getElementById('plFrom')?.value || '';
    const to = document.getElementById('plTo')?.value || '';
    const data = await fetchAPI(`/accounts/profit-loss?date_from=${from}&date_to=${to}`);
    window._lastPL = data;
    const result = document.getElementById('plResult');
    result.innerHTML = `
        <div class="kpi-grid">
            <div class="kpi-card"><div class="kpi-label">Total Income</div><div class="kpi-value" style="color:var(--green)">${fmtMoney(data.total_income)}</div></div>
            <div class="kpi-card"><div class="kpi-label">Total Expense</div><div class="kpi-value" style="color:var(--red)">${fmtMoney(data.total_expense)}</div></div>
            <div class="kpi-card"><div class="kpi-label">${escapeHtml(data.result_label)}</div><div class="kpi-value" style="color:${data.net_profit >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtMoney(Math.abs(data.net_profit))}</div></div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:12px;">
            <div class="card"><h3 style="margin:0 0 10px 0;">Income</h3>
                <table class="data-table"><thead><tr><th>Account</th><th style="text-align:right">Amount</th></tr></thead>
                <tbody>${(data.income || []).map(r => `<tr><td>${escapeHtml(r.name)}</td><td style="text-align:right">${fmtMoney(r.amount)}</td></tr>`).join('') || '<tr><td colspan="2" style="text-align:center;color:#94a3b8;">No income posted</td></tr>'}
                <tr style="font-weight:700;background:var(--card2)"><td>Total Income</td><td style="text-align:right">${fmtMoney(data.total_income)}</td></tr></tbody></table>
            </div>
            <div class="card"><h3 style="margin:0 0 10px 0;">Expenses</h3>
                <table class="data-table"><thead><tr><th>Account</th><th style="text-align:right">Amount</th></tr></thead>
                <tbody>${(data.expenses || []).map(r => `<tr><td>${escapeHtml(r.name)}</td><td style="text-align:right">${fmtMoney(r.amount)}</td></tr>`).join('') || '<tr><td colspan="2" style="text-align:center;color:#94a3b8;">No expenses posted</td></tr>'}
                <tr style="font-weight:700;background:var(--card2)"><td>Total Expense</td><td style="text-align:right">${fmtMoney(data.total_expense)}</td></tr></tbody></table>
            </div>
        </div>
    `;
};

window.printProfitLoss = function () {
    const data = window._lastPL;
    if (!data) return;
    printPreview(`<h3>Profit &amp; Loss Statement (${data.date_from || 'inception'} to ${data.date_to || 'today'})</h3>
        <h4>Income</h4><table class="data-table"><tbody>${(data.income || []).map(r => `<tr><td>${escapeHtml(r.name)}</td><td>${fmtMoney(r.amount)}</td></tr>`).join('')}<tr><td>Total Income</td><td>${fmtMoney(data.total_income)}</td></tr></tbody></table>
        <h4>Expenses</h4><table class="data-table"><tbody>${(data.expenses || []).map(r => `<tr><td>${escapeHtml(r.name)}</td><td>${fmtMoney(r.amount)}</td></tr>`).join('')}<tr><td>Total Expense</td><td>${fmtMoney(data.total_expense)}</td></tr></tbody></table>
        <h3>${escapeHtml(data.result_label)}: ${fmtMoney(Math.abs(data.net_profit))}</h3>`, 'Profit & Loss Statement');
};

// ============================================
// BALANCE SHEET
// ============================================
async function renderBalanceSheetTab(box) {
    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div class="toolbar">
                <label style="color:#94a3b8;font-size:13px;">As of:</label>
                <input type="date" id="bsAsOf" class="filter" value="${todayStr()}">
                <button class="btn btn-ghost btn-sm" onclick="loadBalanceSheet()">Show</button>
                <button class="btn btn-primary btn-sm" onclick="printBalanceSheet()" style="margin-left:auto;">🖨 Print</button>
            </div>
        </div>
        <div id="bsResult"><div class="loading">Loading…</div></div>
    `;
    await loadBalanceSheet();
}

window.loadBalanceSheet = async function () {
    const asOf = document.getElementById('bsAsOf')?.value || '';
    const data = await fetchAPI(`/accounts/balance-sheet?as_of_date=${asOf}`);
    window._lastBS = data;
    const result = document.getElementById('bsResult');
    result.innerHTML = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div class="card"><h3 style="margin:0 0 10px 0;">Assets</h3>
                <table class="data-table"><tbody>${(data.assets || []).map(r => `<tr><td>${escapeHtml(r.name)}</td><td style="text-align:right">${fmtMoney(r.amount)}</td></tr>`).join('') || '<tr><td colspan="2" style="text-align:center;color:#94a3b8;">No assets posted</td></tr>'}
                <tr style="font-weight:700;background:var(--card2)"><td>Total Assets</td><td style="text-align:right">${fmtMoney(data.total_assets)}</td></tr></tbody></table>
            </div>
            <div class="card">
                <h3 style="margin:0 0 10px 0;">Liabilities</h3>
                <table class="data-table"><tbody>${(data.liabilities || []).map(r => `<tr><td>${escapeHtml(r.name)}</td><td style="text-align:right">${fmtMoney(r.amount)}</td></tr>`).join('') || '<tr><td colspan="2" style="text-align:center;color:#94a3b8;">No liabilities posted</td></tr>'}
                <tr style="font-weight:700;background:var(--card2)"><td>Total Liabilities</td><td style="text-align:right">${fmtMoney(data.total_liabilities)}</td></tr></tbody></table>
                <h3 style="margin:16px 0 10px 0;">Equity</h3>
                <table class="data-table"><tbody>${(data.equity || []).map(r => `<tr><td>${escapeHtml(r.name)}</td><td style="text-align:right">${fmtMoney(r.amount)}</td></tr>`).join('') || '<tr><td colspan="2" style="text-align:center;color:#94a3b8;">No equity posted</td></tr>'}
                <tr style="font-weight:700;background:var(--card2)"><td>Total Equity</td><td style="text-align:right">${fmtMoney(data.total_equity)}</td></tr></tbody></table>
            </div>
        </div>
        <div class="card" style="margin-top:12px;">
            <div style="display:flex; justify-content:space-between; font-weight:700;">
                <span>Total Assets: ${fmtMoney(data.total_assets)}</span>
                <span>Total Liabilities + Equity: ${fmtMoney(data.total_liabilities_and_equity)}</span>
                <span class="badge ${data.balanced ? 'badge-green' : 'badge-red'}">${data.balanced ? '✅ Balanced' : '⚠️ Not Balanced'}</span>
            </div>
        </div>
    `;
};

window.printBalanceSheet = function () {
    const data = window._lastBS;
    if (!data) return;
    printPreview(`<h3>Balance Sheet as of ${data.as_of_date || todayStr()}</h3>
        <h4>Assets</h4><table class="data-table"><tbody>${(data.assets || []).map(r => `<tr><td>${escapeHtml(r.name)}</td><td>${fmtMoney(r.amount)}</td></tr>`).join('')}<tr><td>Total Assets</td><td>${fmtMoney(data.total_assets)}</td></tr></tbody></table>
        <h4>Liabilities</h4><table class="data-table"><tbody>${(data.liabilities || []).map(r => `<tr><td>${escapeHtml(r.name)}</td><td>${fmtMoney(r.amount)}</td></tr>`).join('')}<tr><td>Total Liabilities</td><td>${fmtMoney(data.total_liabilities)}</td></tr></tbody></table>
        <h4>Equity</h4><table class="data-table"><tbody>${(data.equity || []).map(r => `<tr><td>${escapeHtml(r.name)}</td><td>${fmtMoney(r.amount)}</td></tr>`).join('')}<tr><td>Total Equity</td><td>${fmtMoney(data.total_equity)}</td></tr></tbody></table>`,
        'Balance Sheet');
};

// ============================================
// CHART OF ACCOUNTS (foundation: manage the account list used everywhere above)
// ============================================
async function renderChartOfAccountsTab(box) {
    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div class="toolbar">
                <input type="text" id="coaSearch" class="filter" placeholder="Search accounts...">
                <select id="coaTypeFilter" class="filter"><option value="">All Types</option><option>Asset</option><option>Liability</option><option>Equity</option><option>Income</option><option>Expense</option></select>
                <button class="btn btn-ghost btn-sm" onclick="loadChartOfAccountsList()">Filter</button>
                <button class="btn btn-primary" onclick="showAccountModal()" style="margin-left:auto;">+ Add Account</button>
            </div>
        </div>
        <div id="coaResult"><div class="loading">Loading…</div></div>
        <div id="accountModal" class="modal-overlay"><div class="modal">
            <div class="modal-header"><h2 id="accountModalTitle">Add Account</h2><span class="close-btn" onclick="closeModal('accountModal')">&times;</span></div>
            <div class="modal-body">
                <input type="hidden" id="accountId">
                <div class="form-grid">
                    <div class="form-group"><label>Code *</label><input type="text" id="accountCode"></div>
                    <div class="form-group"><label>Name *</label><input type="text" id="accountName"></div>
                    <div class="form-group"><label>Type *</label><select id="accountType"><option>Asset</option><option>Liability</option><option>Equity</option><option>Income</option><option>Expense</option></select></div>
                    <div class="form-group"><label>Category</label><select id="accountCategory"><option value="general">General</option><option value="cash">Cash</option><option value="bank">Bank</option></select></div>
                    <div class="form-group"><label>Opening Balance</label><input type="number" step="0.01" id="accountOpeningBalance" value="0"></div>
                    <div class="form-group"><label>Balance Side</label><select id="accountOpeningBalanceType"><option value="Dr">Debit (Dr)</option><option value="Cr">Credit (Cr)</option></select></div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-ghost" onclick="closeModal('accountModal')">Cancel</button>
                <button class="btn btn-primary" onclick="saveAccount()">Save Account</button>
            </div>
        </div></div>
    `;
    await loadChartOfAccountsList();
}

window.loadChartOfAccountsList = async function () {
    const q = document.getElementById('coaSearch')?.value || '';
    const accountType = document.getElementById('coaTypeFilter')?.value || '';
    const data = await fetchAPI(`/accounts/chart?q=${encodeURIComponent(q)}&account_type=${accountType}&active_only=0`);
    const result = document.getElementById('coaResult');
    result.innerHTML = `
        <div class="card">
            <div class="table-wrap"><table class="data-table">
                <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Category</th><th style="text-align:right">Opening Balance</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>${(data.accounts || []).map(a => `<tr>
                    <td>${escapeHtml(a.code)}</td><td>${escapeHtml(a.name)}</td>
                    <td><span class="badge badge-purple">${escapeHtml(a.account_type)}</span></td>
                    <td>${escapeHtml(a.category)}</td>
                    <td style="text-align:right">${fmtMoney(a.opening_balance)} ${a.opening_balance_type}</td>
                    <td>${a.is_active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Inactive</span>'}</td>
                    <td class="actions">
                        <button onclick="editAccount(${a.id})" class="btn btn-ghost btn-sm">✏</button>
                        ${a.is_system ? '' : `<button onclick="deleteAccount(${a.id})" class="btn btn-danger btn-sm">🗑</button>`}
                    </td>
                </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:#94a3b8;">No accounts found</td></tr>'}</tbody>
            </table></div>
        </div>
    `;
    acctChartCache = null; // keep the shared cache fresh for other tabs
    await getChartOfAccounts(true);
};

window.showAccountModal = function () {
    document.getElementById('accountModalTitle').innerText = 'Add Account';
    document.getElementById('accountId').value = '';
    document.getElementById('accountCode').value = '';
    document.getElementById('accountName').value = '';
    document.getElementById('accountType').value = 'Asset';
    document.getElementById('accountCategory').value = 'general';
    document.getElementById('accountOpeningBalance').value = '0';
    document.getElementById('accountOpeningBalanceType').value = 'Dr';
    document.getElementById('accountModal').classList.add('active');
};

window.editAccount = async function (id) {
    const data = await fetchAPI('/accounts/chart?active_only=0');
    const a = (data.accounts || []).find(x => x.id === id);
    if (!a) return;
    document.getElementById('accountModalTitle').innerText = 'Edit Account';
    document.getElementById('accountId').value = a.id;
    document.getElementById('accountCode').value = a.code;
    document.getElementById('accountName').value = a.name;
    document.getElementById('accountType').value = a.account_type;
    document.getElementById('accountCategory').value = a.category;
    document.getElementById('accountOpeningBalance').value = a.opening_balance;
    document.getElementById('accountOpeningBalanceType').value = a.opening_balance_type;
    document.getElementById('accountModal').classList.add('active');
};

window.saveAccount = async function () {
    const id = document.getElementById('accountId').value;
    const payload = {
        code: document.getElementById('accountCode').value,
        name: document.getElementById('accountName').value,
        account_type: document.getElementById('accountType').value,
        category: document.getElementById('accountCategory').value,
        opening_balance: parseFloat(document.getElementById('accountOpeningBalance').value || 0),
        opening_balance_type: document.getElementById('accountOpeningBalanceType').value,
    };
    if (!payload.code || !payload.name) { showAlert('Please fill required fields', 'error'); return; }
    try {
        if (id) {
            await fetchAPI(`/accounts/chart/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
            showAlert('Account updated');
        } else {
            await fetchAPI('/accounts/chart', { method: 'POST', body: JSON.stringify(payload) });
            showAlert('Account added');
        }
        closeModal('accountModal');
        await loadChartOfAccountsList();
    } catch (e) { console.error(e); }
};

window.deleteAccount = async function (id) {
    if (!confirm('Delete this account?')) return;
    try {
        await fetchAPI(`/accounts/chart/${id}`, { method: 'DELETE' });
        showAlert('Account deleted');
        await loadChartOfAccountsList();
    } catch (e) { console.error(e); }
};
