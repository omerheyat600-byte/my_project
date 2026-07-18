// ============================================
// FEES.JS — Fees page, vouchers, and fees CRUD.
// ============================================

// ============================================
// FEE HISTORY MODAL
// A per-student ledger showing every fee record — Tuition, Transport,
// Exam, Books, Lab, and any custom "Other" type — in one place, with
// status, paid date, and outstanding balance. Injected once into
// document.body so it can be opened from anywhere (the student modal,
// the fees list, etc.) without needing the Fees page to be loaded.
// ============================================
let feeHistoryCurrentStudent = { id: null, name: null };

function ensureFeeHistoryModalDom() {
    if (document.getElementById('feeHistoryModalOverlay')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
        <div id="feeHistoryModalOverlay" class="modal-overlay">
            <div class="modal" style="max-width:960px;">
                <div class="modal-header">
                    <h2 id="feeHistoryModalTitle">Fee History</h2>
                    <span class="close-btn" onclick="closeFeeHistoryModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <div id="feeHistoryKpis" class="kpi-grid" style="margin-bottom:14px;"></div>
                    <div class="toolbar" style="margin-bottom:10px;">
                        <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
                            <input type="checkbox" id="feeHistoryShowVoided" onchange="reloadFeeHistory()"> Show voided records
                        </label>
                        <button class="btn btn-ghost btn-sm" style="margin-left:auto;" onclick="printFeeHistory()">🖨 Print</button>
                    </div>
                    <div class="table-wrap">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Fee Type</th><th>Month</th><th>Amount</th><th>Discount</th>
                                    <th>Fine</th><th>Net Payable</th><th>Paid</th><th>Balance</th>
                                    <th>Due Date</th><th>Paid Date</th><th>Status</th>
                                </tr>
                            </thead>
                            <tbody id="feeHistoryTableBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(wrap.firstElementChild);
}

window.showFeeHistoryModal = async function(studentId, studentName) {
    if (!studentId) {
        showAlert('No student selected.', 'error');
        return;
    }
    ensureFeeHistoryModalDom();
    feeHistoryCurrentStudent = { id: studentId, name: studentName || '' };
    document.getElementById('feeHistoryModalTitle').innerText = `Fee History — ${studentName || studentId}`;
    document.getElementById('feeHistoryShowVoided').checked = false;
    document.getElementById('feeHistoryModalOverlay').classList.add('active');
    await reloadFeeHistory();
};

window.closeFeeHistoryModal = function() {
    const el = document.getElementById('feeHistoryModalOverlay');
    if (el) el.classList.remove('active');
};

function feeHistoryRowsHtml(fees) {
    if (fees.length === 0) {
        return '<tr><td colspan="11" style="text-align:center; color:#94a3b8;">No fee records for this student yet.</td></tr>';
    }
    return fees.map(f => {
        const discount = parseFloat(f.discount_amount || 0);
        const fine = parseFloat(f.fine_amount || 0);
        const net = parseFloat(f.amount || 0) - discount + fine;
        const paid = parseFloat(f.paid_amount || 0);
        const balance = net - paid;
        return `
            <tr style="${f.is_voided ? 'opacity:0.55;' : ''}">
                <td>${escapeHtml(f.fee_type)}${f.is_voided ? ' <span class="badge" style="background:#7f1d1d;color:#fecaca;" title="' + escapeHtml(f.voided_reason || 'No reason given') + '">VOIDED</span>' : ''}</td>
                <td>${escapeHtml(f.month || '-')}</td>
                <td style="text-align:right;">PKR ${parseFloat(f.amount || 0).toLocaleString()}</td>
                <td style="text-align:right; color:${discount > 0 ? 'var(--green)' : 'inherit'};" title="${escapeHtml(f.discount_reason || '')}">${discount > 0 ? '-PKR ' + discount.toLocaleString() : '-'}</td>
                <td style="text-align:right; color:${fine > 0 ? 'var(--red)' : 'inherit'};">${fine > 0 ? 'PKR ' + fine.toLocaleString() : '-'}</td>
                <td style="text-align:right; font-weight:600;">PKR ${net.toLocaleString()}</td>
                <td style="text-align:right;">PKR ${paid.toLocaleString()}</td>
                <td style="text-align:right; font-weight:600; color:${balance > 0 ? 'var(--red)' : 'inherit'};">PKR ${balance.toLocaleString()}</td>
                <td>${f.due_date || '-'}</td>
                <td>${f.paid_date || '-'}</td>
                <td>${f.status === 'Paid' ? '<span class="badge badge-green">Paid</span>' :
                    f.status === 'Pending' ? '<span class="badge badge-red">Pending</span>' :
                    '<span class="badge badge-yellow">Partial</span>'}</td>
            </tr>
        `;
    }).join('');
}

window.reloadFeeHistory = async function() {
    if (!feeHistoryCurrentStudent.id) return;
    const tbody = document.getElementById('feeHistoryTableBody');
    const kpis = document.getElementById('feeHistoryKpis');
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;">Loading...</td></tr>';
    try {
        const showVoided = document.getElementById('feeHistoryShowVoided')?.checked || false;
        const params = new URLSearchParams();
        params.append('student_id', feeHistoryCurrentStudent.id);
        if (showVoided) params.append('include_voided', '1');

        const data = await fetchAPI(`/fees/report?${params.toString()}`);
        const fees = (data.fees || []).slice().sort((a, b) => (b.due_date || '').localeCompare(a.due_date || ''));
        const summary = data.summary || {};

        kpis.innerHTML = `
            <div class="kpi-card"><div class="kpi-label">Total Billed</div><div class="kpi-value">PKR ${Number(summary.total_amount || 0).toLocaleString()}</div></div>
            <div class="kpi-card"><div class="kpi-label">Total Paid</div><div class="kpi-value" style="color:var(--green);">PKR ${Number(summary.total_paid || 0).toLocaleString()}</div></div>
            <div class="kpi-card"><div class="kpi-label">Balance Due</div><div class="kpi-value" style="color:var(--red);">PKR ${Number(summary.total_unpaid || 0).toLocaleString()}</div></div>
        `;
        tbody.innerHTML = feeHistoryRowsHtml(fees);
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; color:var(--red);">Failed to load fee history.</td></tr>';
        showAlert('Failed to load fee history: ' + error.message, 'error');
    }
};

window.printFeeHistory = async function() {
    if (!feeHistoryCurrentStudent.id) return;
    try {
        const showVoided = document.getElementById('feeHistoryShowVoided')?.checked || false;
        const params = new URLSearchParams();
        params.append('student_id', feeHistoryCurrentStudent.id);
        if (showVoided) params.append('include_voided', '1');

        const data = await fetchAPI(`/fees/report?${params.toString()}`);
        const fees = data.fees || [];
        const summary = data.summary || {};

        let rows = '';
        fees.forEach(f => {
            const discount = parseFloat(f.discount_amount || 0);
            const fine = parseFloat(f.fine_amount || 0);
            const net = parseFloat(f.amount || 0) - discount + fine;
            const paid = parseFloat(f.paid_amount || 0);
            const balance = net - paid;
            rows += `<tr>
                <td style="border:1px solid #ccc;padding:6px;">${escapeHtml(f.fee_type)}</td>
                <td style="border:1px solid #ccc;padding:6px;">${escapeHtml(f.month || '-')}</td>
                <td style="border:1px solid #ccc;padding:6px;text-align:right;">Rs. ${parseFloat(f.amount || 0).toLocaleString()}</td>
                <td style="border:1px solid #ccc;padding:6px;text-align:right;">Rs. ${discount.toLocaleString()}</td>
                <td style="border:1px solid #ccc;padding:6px;text-align:right;">Rs. ${fine.toLocaleString()}</td>
                <td style="border:1px solid #ccc;padding:6px;text-align:right;">Rs. ${net.toLocaleString()}</td>
                <td style="border:1px solid #ccc;padding:6px;text-align:right;">Rs. ${paid.toLocaleString()}</td>
                <td style="border:1px solid #ccc;padding:6px;text-align:right;">Rs. ${balance.toLocaleString()}</td>
                <td style="border:1px solid #ccc;padding:6px;">${f.due_date || '-'}</td>
                <td style="border:1px solid #ccc;padding:6px;">${f.paid_date || '-'}</td>
                <td style="border:1px solid #ccc;padding:6px;">${escapeHtml(f.status)}</td>
            </tr>`;
        });

        printPreview(`
            <h3>Fee History — ${escapeHtml(feeHistoryCurrentStudent.name || feeHistoryCurrentStudent.id)}</h3>
            <p>
                <strong>Total Billed:</strong> Rs. ${Number(summary.total_amount || 0).toLocaleString()} |
                <strong>Paid:</strong> Rs. ${Number(summary.total_paid || 0).toLocaleString()} |
                <strong>Balance:</strong> Rs. ${Number(summary.total_unpaid || 0).toLocaleString()}
            </p>
            <table style="width:100%; border-collapse:collapse;">
                <thead>
                    <tr>
                        <th style="border:1px solid #ccc;padding:6px;">Fee Type</th><th style="border:1px solid #ccc;padding:6px;">Month</th>
                        <th style="border:1px solid #ccc;padding:6px;">Amount</th><th style="border:1px solid #ccc;padding:6px;">Discount</th>
                        <th style="border:1px solid #ccc;padding:6px;">Fine</th><th style="border:1px solid #ccc;padding:6px;">Net Payable</th>
                        <th style="border:1px solid #ccc;padding:6px;">Paid</th><th style="border:1px solid #ccc;padding:6px;">Balance</th>
                        <th style="border:1px solid #ccc;padding:6px;">Due Date</th><th style="border:1px solid #ccc;padding:6px;">Paid Date</th>
                        <th style="border:1px solid #ccc;padding:6px;">Status</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `, `Fee History - ${feeHistoryCurrentStudent.name || feeHistoryCurrentStudent.id}`);
    } catch (error) {
        showAlert('Failed to print fee history: ' + error.message, 'error');
    }
};

async function loadFees() {
    try {
        const [studentsData, classesData] = await Promise.all([
            fetchAPI('/students'),
            fetchAPI('/classes')
        ]);

        const students = studentsData.students || [];
        const classes = classesData.classes || [];
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];

        const html = `
            <div class="page-header">
                <div class="page-title">Fees</div>
                <div class="page-sub">Manage fee records and generate vouchers.</div>
                <div style="float:right; margin-top:-50px;">
                    <button onclick="printFees()" class="btn btn-primary" style="margin-right: 10px;">🖨 Print</button>
                    <button onclick="exportFeesCSV()" class="btn btn-success">📥 Export CSV</button>
                </div>
            </div>

            <!-- Tab Switcher -->
            <div style="display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 1px solid #334155; padding-bottom: 10px;">
                <button onclick="switchFeesView('list')" id="feeTabList" class="btn btn-primary" style="padding: 8px 16px;">📋 Records List</button>
                <button onclick="switchFeesView('voucher')" id="feeTabVoucher" class="btn btn-ghost" style="padding: 8px 16px;">🧾 Vouchers</button>
                <button onclick="switchFeesView('charity')" id="feeTabCharity" class="btn btn-ghost" style="padding: 8px 16px;">💛 Charity Fund</button>
            </div>

            <!-- LIST VIEW -->
            <div id="feeListViewSection" class="view-section">
                <!-- Summary Cards -->
                <div id="feeSummary" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px;">
                    <div class="kpi-card"><div class="kpi-label">Total Fees (Net)</div><div id="feeTotalAmount" class="kpi-value">0</div></div>
                    <div class="kpi-card"><div class="kpi-label">Total Paid</div><div id="feeTotalPaid" class="kpi-value" style="color: var(--green);">0</div></div>
                    <div class="kpi-card"><div class="kpi-label">Total Unpaid</div><div id="feeTotalUnpaid" class="kpi-value" style="color: var(--red);">0</div></div>
                    <div class="kpi-card"><div class="kpi-label">Records</div><div id="feeCount" class="kpi-value">0</div></div>
                </div>

                <!-- Filter Bar -->
                <div class="card" style="margin-bottom: 20px;">
                    <div class="toolbar" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;">
                        <input type="text" id="feeSearch" placeholder="Search fees..." class="filter">
                        <select id="feeMonth" class="filter">
                            <option value="">All Months</option>
                            ${months.map(m => `<option value="${m}">${m}</option>`).join('')}
                        </select>
                        <input type="number" id="feeYear" class="filter" placeholder="Year" value="${new Date().getFullYear()}">
                        <select id="feeClass" class="filter">
                            <option value="">All Classes</option>
                            ${classes.map(c => `<option value="${c.class_name}">${c.class_name}</option>`).join('')}
                        </select>
                        <select id="feeStudent" class="filter">
                            <option value="">All Students</option>
                            ${students.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                        </select>
                        <select id="feeStatus" class="filter">
                            <option value="all">All Status</option>
                            <option value="paid">Paid</option>
                            <option value="unpaid">Unpaid</option>
                        </select>
                        <label style="color:#94a3b8;font-size:13px;display:flex;align-items:center;gap:4px;">
                            <input type="checkbox" id="feeShowVoided" onchange="applyFeeFilters()"> Show voided
                        </label>
                        <button onclick="applyFeeFilters()" class="btn btn-primary">🔍 Apply</button>
                        <button onclick="clearFeeFilters()" class="btn btn-ghost">🗑 Clear</button>
                        <button onclick="showFeeModal()" class="btn btn-primary">+ Add Fee</button>
                        <button onclick="recalculateFines()" class="btn btn-ghost" title="Recalculate late fines for all overdue unpaid fees">⏱ Recalculate Fines</button>
                        <button onclick="showFineSettingsModal()" class="btn btn-ghost" title="Set late fine rate and grace period">⚙ Fine Settings</button>
                        <button onclick="syncFeesToAccounts()" class="btn btn-ghost" title="Post any fee payments not yet reflected in Accounts (Cash Book, Ledger, Trial Balance)">🔗 Sync to Accounts</button>
                    </div>
                </div>

                <!-- Fee Table -->
                <div class="card">
                    <div class="table-wrap">
                        <table class="data-table" id="feeTable">
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th>Class</th>
                                    <th>Fee Type</th>
                                    <th>Month</th>
                                    <th>Amount</th>
                                    <th>Discount</th>
                                    <th>Fine</th>
                                    <th>Net Payable</th>
                                    <th>Paid</th>
                                    <th>Due Date</th>
                                    <th>Paid Date</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="feeTableBody">
                                <tr><td colspan="13" style="text-align:center;">Apply filters to load data</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- VOUCHER VIEW -->
            <div id="feeVoucherViewSection" class="view-section" style="display: none;">
                <div class="card" style="margin-bottom: 20px;">
                    <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; background: var(--card2); padding: 10px 16px; border-radius: 8px;">
                        <label style="color: #94a3b8; font-weight: 500; font-size: 13px;">Class:</label>
                        <select id="voucherClass" class="filter" style="min-width: 120px; flex: 1;">
                            <option value="">-- Select Class --</option>
                            ${classes.map(c => `<option value="${c.class_name}">${c.class_name}</option>`).join('')}
                        </select>
                        <label style="color: #94a3b8; font-weight: 500; font-size: 13px;">Month:</label>
                        <select id="voucherMonth" class="filter" style="min-width: 100px; flex: 0.5;">
                            ${months.map(m => `<option value="${m}">${m}</option>`).join('')}
                        </select>
                        <label style="color: #94a3b8; font-weight: 500; font-size: 13px;">Year:</label>
                        <input type="number" id="voucherYear" class="filter" value="${new Date().getFullYear()}" style="width: 80px;">
                        <button onclick="generateBulkVouchers()" class="btn btn-primary">📋 Generate Vouchers</button>
                        <button onclick="printVouchers()" class="btn btn-success">🖨 Print All</button>
                    </div>
                </div>

                <div class="card">
                    <div class="table-wrap">
                        <table class="data-table" id="voucherTable">
                            <thead>
                                <tr>
                                    <th><input type="checkbox" id="selectAllVouchers" onchange="toggleSelectAllVouchers()"></th>
                                    <th>Student</th>
                                    <th>Class</th>
                                    <th>Month</th>
                                    <th>Prev. Pending</th>
                                    <th>Current Fee</th>
                                    <th>Paid</th>
                                    <th>Balance</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody id="voucherTableBody">
                                <tr><td colspan="10" style="text-align:center;">Select a class and month, then generate.</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- CHARITY FUND VIEW -->
            <div id="feeCharityViewSection" class="view-section" style="display: none;">
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 20px;">
                    <div class="kpi-card">
                        <div class="kpi-label">Charity Fund Balance</div>
                        <div id="charityFundBalance" class="kpi-value" style="color: var(--green);">0</div>
                    </div>
                    <div class="kpi-card" style="display:flex; align-items:center; justify-content:flex-end;">
                        <button onclick="showDisbursementModal()" class="btn btn-primary">💸 Record Disbursement</button>
                    </div>
                </div>

                <div class="card">
                    <div class="table-wrap">
                        <table class="data-table" id="charityLedgerTable">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Source</th>
                                    <th>Description</th>
                                    <th>Amount</th>
                                    <th>Balance After</th>
                                    <th>By</th>
                                </tr>
                            </thead>
                            <tbody id="charityLedgerBody">
                                <tr><td colspan="7" style="text-align:center;">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Fee Modal (unchanged) -->
           <!-- Fee Modal -->
			<div id="feeModal" class="modal-overlay">
				<div class="modal" style="max-width: 700px;">
					<div class="modal-header">
						<h2 id="feeModalTitle">Add Fee Records</h2>
						<span class="close-btn" onclick="closeFeeModal()">&times;</span>
					</div>
					<div class="modal-body">
						<form id="feeForm" onsubmit="event.preventDefault(); saveFee();">
							<input type="hidden" id="feeId">

							<!-- Student and common fields -->
							<div class="form-grid">
								<div class="form-group full">
									<label for="feeStudentId">Student *</label>
									<select id="feeStudentId" required>
										<option value="">Select Student</option>
										${students.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
									</select>
								</div>
								<div class="form-group">
									<label for="feeMonth">Month *</label>
									<input type="text" id="feeMonth" required value="${new Date().toLocaleString('default', { month: 'long' })}">
								</div>
								<div class="form-group">
									<label for="feeDueDate">Due Date</label>
									<input type="date" id="feeDueDate">
								</div>
							</div>

							<!-- Dynamic Fee Rows -->
							<div style="margin: 15px 0;">
								<label style="font-weight:600; display:block; margin-bottom:6px;">Fee Breakdown</label>
								<div id="feeRowsContainer"></div>
								<button type="button" id="addFeeRowBtn" class="btn btn-ghost btn-sm" style="margin-top:6px;">+ Add Charge</button>
							</div>

							<div class="modal-footer">
								<button type="button" class="btn btn-ghost" onclick="closeFeeModal()">Cancel</button>
								<button type="submit" class="btn btn-primary">Save All Fees</button>
							</div>
						</form>
					</div>
				</div>
			</div>

			<!-- Fine Settings Modal -->
			<div id="fineSettingsModal" class="modal-overlay">
				<div class="modal" style="max-width: 420px;">
					<div class="modal-header">
						<h2>Late Fine Settings</h2>
						<span class="close-btn" onclick="closeFineSettingsModal()">&times;</span>
					</div>
					<div class="modal-body">
						<form id="fineSettingsForm" onsubmit="event.preventDefault(); saveFineSettings();">
							<div class="form-grid">
								<div class="form-group full">
									<label for="fineRatePerDay">Fine Per Day (PKR)</label>
									<input type="number" id="fineRatePerDay" step="0.01" min="0" required>
								</div>
								<div class="form-group full">
									<label for="fineGraceDays">Grace Period (days after due date)</label>
									<input type="number" id="fineGraceDays" step="1" min="0" required>
								</div>
							</div>
							<p style="color:#94a3b8; font-size:12px; margin-top:6px;">
								Fees overdue beyond the grace period accrue this amount for every day late.
								Use "Recalculate Fines" on the Fees page to apply these settings to existing unpaid fees.
							</p>
							<div class="modal-footer">
								<button type="button" class="btn btn-ghost" onclick="closeFineSettingsModal()">Cancel</button>
								<button type="submit" class="btn btn-primary">Save Settings</button>
							</div>
						</form>
					</div>
				</div>
			</div>

			<!-- Charity Fund Disbursement Modal -->
			<div id="disbursementModal" class="modal-overlay">
				<div class="modal" style="max-width: 420px;">
					<div class="modal-header">
						<h2>Record Disbursement</h2>
						<span class="close-btn" onclick="closeDisbursementModal()">&times;</span>
					</div>
					<div class="modal-body">
						<form id="disbursementForm" onsubmit="event.preventDefault(); saveDisbursement();">
							<p style="color:#94a3b8; font-size:12px; margin-bottom:10px;">
								Available balance: <strong id="disbursementAvailableBalance">0</strong>
							</p>
							<div class="form-grid">
								<div class="form-group full">
									<label for="disbursementAmount">Amount (PKR)</label>
									<input type="number" id="disbursementAmount" step="0.01" min="0.01" required>
								</div>
								<div class="form-group full">
									<label for="disbursementDescription">Description / Purpose</label>
									<textarea id="disbursementDescription" rows="3" required placeholder="e.g. Books for STU-102, uniform for STU-118"></textarea>
								</div>
							</div>
							<div class="modal-footer">
								<button type="button" class="btn btn-ghost" onclick="closeDisbursementModal()">Cancel</button>
								<button type="submit" class="btn btn-primary">Save Disbursement</button>
							</div>
						</form>
					</div>
				</div>
			</div>
    `;

        document.getElementById('page-content').innerHTML = html;

        // Automatically apply filters (list view)
        applyFeeFilters();

        // Set default month for voucher (current month)
        const now = new Date();
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                            'July', 'August', 'September', 'October', 'November', 'December'];
        document.getElementById('voucherMonth').value = monthNames[now.getMonth()];
        document.getElementById('voucherYear').value = now.getFullYear();

        // Add event listener for "Enter" key on search fields
        document.getElementById('feeSearch').addEventListener('keyup', function(e) {
            if (e.key === 'Enter') applyFeeFilters();
        });

    } catch (e) {
        console.error(e);
        document.getElementById('page-content').innerHTML = '<div class="loading">Failed to load fees.</div>';
    }
}
// ============================================
// VOUCHER FUNCTIONS
// ============================================

window.switchFeesView = function(view) {
    const listView = document.getElementById('feeListViewSection');
    const voucherView = document.getElementById('feeVoucherViewSection');
    const charityView = document.getElementById('feeCharityViewSection');
    const tabList = document.getElementById('feeTabList');
    const tabVoucher = document.getElementById('feeTabVoucher');
    const tabCharity = document.getElementById('feeTabCharity');

    const sections = { list: listView, voucher: voucherView, charity: charityView };
    const tabs = { list: tabList, voucher: tabVoucher, charity: tabCharity };

    Object.keys(sections).forEach(key => {
        if (sections[key]) sections[key].style.display = (key === view) ? 'block' : 'none';
        if (tabs[key]) {
            if (key === view) {
                tabs[key].classList.add('btn-primary');
                tabs[key].classList.remove('btn-ghost');
            } else {
                tabs[key].classList.add('btn-ghost');
                tabs[key].classList.remove('btn-primary');
            }
        }
    });

    if (view === 'charity') {
        loadCharityFund();
    }
};

window.generateBulkVouchers = async function() {
    const class_name = document.getElementById('voucherClass').value;
    const month = document.getElementById('voucherMonth').value;
    const year = document.getElementById('voucherYear').value;

    if (!class_name || !month) {
        showAlert('Please select class and month.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/fees/vouchers/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ class_name, month, year })
        });
        if (!response.ok) throw new Error('Failed to generate vouchers');
        const data = await response.json();
        const vouchers = data.vouchers || [];
        const tbody = document.getElementById('voucherTableBody');
        if (vouchers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color: #94a3b8;">No vouchers generated.</td></tr>';
            return;
        }
		tbody.innerHTML = vouchers.map(v => {
			const totalCurrent = (v.current_fees || []).reduce((sum, f) => sum + (f.net_amount ?? f.amount), 0);
			const totalPaid = (v.current_fees || []).reduce((sum, f) => sum + f.paid_amount, 0);
			return `
				<tr>
					<td><input type="checkbox" class="voucher-checkbox" data-student-id="${v.student.id}"></td>
					<td>${escapeHtml(v.student.name)}</td>
					<td>${escapeHtml(v.student.grade)}</td>
					<td>${escapeHtml(month)} ${year}</td>
					<td style="text-align:right;">PKR ${v.previous_pending.toLocaleString()}</td>
					<td style="text-align:right;">PKR ${totalCurrent.toLocaleString()}</td>
					<td style="text-align:right;">PKR ${totalPaid.toLocaleString()}</td>
					<td style="text-align:right;">PKR ${v.balance.toLocaleString()}</td>
					<td>${v.status === 'Paid' ? '<span class="badge badge-green">Paid</span>' :
						v.status === 'Partial' ? '<span class="badge badge-yellow">Partial</span>' :
						'<span class="badge badge-red">Pending</span>'}</td>
					<td>
						<button onclick="printStudentVoucher('${v.student.id}', '${month}', '${year}')" class="btn btn-ghost btn-sm">🖨</button>
					</td>
				</tr>
			`;
		}).join('');
    } catch (error) {
        showAlert('Failed to generate vouchers: ' + error.message, 'error');
    }
};

window.printStudentVoucher = async function(studentId, month, year) {
    try {
        const response = await fetch(`${API_BASE}/fees/voucher/student/${studentId}?month=${encodeURIComponent(month)}&year=${encodeURIComponent(year)}`, {
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to fetch voucher');
        const voucher = await response.json();
        // Use printPreview to show voucher
        const content = generateVoucherHTML(voucher);
        printPreview(content, `Fee Voucher - ${voucher.student.name}`);
    } catch (error) {
        showAlert('Failed to print voucher: ' + error.message, 'error');
    }
};

window.printVouchers = function() {
    const rows = document.querySelectorAll('#voucherTableBody tr');
    const checked = document.querySelectorAll('.voucher-checkbox:checked');
    const toPrint = checked.length > 0 ? checked : rows;

    if (toPrint.length === 0) {
        showAlert('No vouchers to print.', 'error');
        return;
    }

    const month = document.getElementById('voucherMonth').value;
    const year = document.getElementById('voucherYear').value;
    const studentIds = [];
    toPrint.forEach(el => {
        if (el.type === 'checkbox') {
            const id = el.dataset.studentId;
            if (id) studentIds.push(id);
        } else {
            const checkbox = el.querySelector('.voucher-checkbox');
            if (checkbox) studentIds.push(checkbox.dataset.studentId);
        }
    });

    if (studentIds.length === 0) {
        showAlert('No students selected.', 'error');
        return;
    }

    Promise.all(studentIds.map(id => 
        fetch(`${API_BASE}/fees/voucher/student/${id}?month=${encodeURIComponent(month)}&year=${encodeURIComponent(year)}`, { credentials: 'include' })
            .then(res => res.json())
    )).then(vouchers => {
        let combinedHTML = '';
        vouchers.forEach((v, index) => {
            combinedHTML += generateVoucherHTML(v);
            if (index < vouchers.length - 1) {
                combinedHTML += '<div style="page-break-after: always;"></div>';
            }
        });
        printPreview(combinedHTML, 'Fee Vouchers');
    }).catch(error => {
        showAlert('Error printing vouchers: ' + error.message, 'error');
    });
};

window.toggleSelectAllVouchers = function() {
    const checked = document.getElementById('selectAllVouchers').checked;
    document.querySelectorAll('.voucher-checkbox').forEach(cb => cb.checked = checked);
};

function generateVoucherHTML(voucher) {
    const s = voucher.student;
    const currentFees = voucher.current_fees || [];
    const prevPending = voucher.previous_pending || 0;
    const totalDue = voucher.total_due || 0;
    const totalPaid = voucher.total_paid || 0;
    const balance = voucher.balance || 0;
    const status = voucher.status || 'Pending';
    const month = voucher.month;
    const year = voucher.year;

    const voucherNo = `V-${year}-${s.id}`;
    const today = new Date().toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' });

    function copyHTML(label) {
        // Build fee rows
        let feeRows = '';
        currentFees.forEach(f => {
            feeRows += `
                <tr>
                    <td>${escapeHtml(f.fee_type)}</td>
                    <td>${f.amount.toLocaleString()}</td>
                </tr>
            `;
            if (f.discount_amount) {
                feeRows += `
                    <tr>
                        <td>Discount${f.discount_reason ? ' (' + escapeHtml(f.discount_reason) + ')' : ''}</td>
                        <td>-${f.discount_amount.toLocaleString()}</td>
                    </tr>
                `;
            }
            if (f.fine_amount) {
                feeRows += `
                    <tr>
                        <td>Late Fine</td>
                        <td>${f.fine_amount.toLocaleString()}</td>
                    </tr>
                `;
            }
        });
        if (!feeRows) {
            feeRows = `<tr><td colspan="2" style="text-align:center; color:#94a3b8;">No current fees</td></tr>`;
        }

        return `
            <div class="voucher-copy">
                <div class="copy-label">${label}</div>
                <div class="voucher-header">
                    <div class="school-name">${SCHOOL_NAME}</div>
                    <div class="voucher-title">Fee Voucher</div>
                </div>
                <div class="voucher-meta">
                    <div><strong>Voucher No:</strong> ${voucherNo}</div>
                    <div><strong>Date:</strong> ${today}</div>
                    <div><strong>Month:</strong> ${month} ${year}</div>
                </div>
                <div class="student-info">
                    <div><strong>Student:</strong> ${escapeHtml(s.name)}</div>
                    <div><strong>Father:</strong> ${escapeHtml(s.parent_name || '—')}</div>
                    <div><strong>ID:</strong> ${escapeHtml(s.id)}</div>
                    <div><strong>Class:</strong> ${escapeHtml(s.grade)}</div>
                </div>
                <div class="fee-table">
                    <table>
                        <thead><tr><th>Description</th><th>Amount (PKR)</th></tr></thead>
                        <tbody>
                            <tr><td><strong>Previous Months Balance</strong></td><td>${prevPending.toLocaleString()}</td></tr>
                            ${feeRows}
                            <tr class="total-row"><td><strong>Total Due</strong></td><td><strong>${totalDue.toLocaleString()}</strong></td></tr>
                            <tr><td>Paid Amount</td><td>${totalPaid.toLocaleString()}</td></tr>
                            <tr class="balance-row"><td><strong>Balance Due</strong></td><td><strong>${balance.toLocaleString()}</strong></td></tr>
                        </tbody>
                    </table>
                </div>
                <div class="fee-status">
                    <span>Status: <strong>${status}</strong></span>
                </div>
                <div class="signature-area">
                    <div>_____________<br>Student's Sign</div>
                    <div>_____________<br>Parent's Sign</div>
                    <div>_____________<br>Principal's Sign</div>
                </div>
                <div class="footer-text">System Generated Voucher</div>
            </div>
        `;
    }

    return `
        <style>
            .voucher-container {
                display: flex;
                flex-wrap: wrap;
                justify-content: space-around;
                max-width: 1100px;
                margin: 0 auto;
                background: #fff;
                padding: 10px;
                font-family: 'Segoe UI', Arial, sans-serif;
            }
            .voucher-copy {
                flex: 1 1 30%;
                min-width: 280px;
                max-width: 32%;
                border: 2px solid #1e293b;
                border-radius: 6px;
                padding: 12px 10px;
                margin: 5px;
                background: #fff;
                box-shadow: 0 1px 4px rgba(0,0,0,0.05);
                font-size: 12px;
                page-break-inside: avoid;
            }
            .copy-label {
                text-align: center;
                font-size: 12px;
                font-weight: bold;
                color: #1e293b;
                border-bottom: 2px dashed #94a3b8;
                padding-bottom: 4px;
                margin-bottom: 8px;
                letter-spacing: 1px;
                background: #f1f5f9;
                border-radius: 4px;
                padding: 4px 0;
            }
            .voucher-header {
                text-align: center;
                border-bottom: 2px solid #3b82f6;
                padding-bottom: 6px;
                margin-bottom: 8px;
            }
            .school-name {
                font-size: 18px;
                font-weight: 800;
                color: #0f172a;
                letter-spacing: 0.5px;
            }
            .voucher-title {
                font-size: 14px;
                font-weight: 600;
                color: #3b82f6;
                margin-top: 2px;
            }
            .voucher-meta {
                display: flex;
                justify-content: space-between;
                font-size: 11px;
                background: #f8fafc;
                padding: 4px 8px;
                border-radius: 4px;
                margin-bottom: 8px;
                flex-wrap: wrap;
            }
            .student-info {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 2px 12px;
                font-size: 12px;
                margin-bottom: 8px;
                background: #f1f5f9;
                padding: 6px 10px;
                border-radius: 4px;
            }
            .student-info div {
                padding: 2px 0;
            }
            .fee-table table {
                width: 100%;
                border-collapse: collapse;
                font-size: 11px;
                margin: 6px 0;
            }
            .fee-table th, .fee-table td {
                border: 1px solid #cbd5e1;
                padding: 4px 6px;
                text-align: left;
            }
            .fee-table th {
                background: #0f172a;
                color: #f8fafc;
                font-weight: 600;
                font-size: 10px;
            }
            .fee-table .total-row td {
                font-weight: bold;
                background: #e2e8f0;
            }
            .fee-table .balance-row td {
                font-weight: bold;
                background: #dbeafe;
                color: #1e3a8a;
            }
            .fee-status {
                margin: 6px 0;
                font-size: 13px;
                text-align: center;
            }
            .fee-status strong {
                padding: 2px 12px;
                border-radius: 12px;
                background: ${status === 'Paid' ? '#22c55e' : status === 'Partial' ? '#f59e0b' : '#ef4444'};
                color: #fff;
                display: inline-block;
                font-size: 12px;
            }
            .signature-area {
                display: flex;
                justify-content: space-between;
                margin-top: 12px;
                font-size: 10px;
                text-align: center;
            }
            .signature-area div {
                width: 30%;
                border-top: 1px solid #94a3b8;
                padding-top: 4px;
            }
            .footer-text {
                margin-top: 8px;
                font-size: 9px;
                color: #64748b;
                text-align: center;
                border-top: 1px dashed #cbd5e1;
                padding-top: 6px;
            }
            @media print {
                body { background: #fff; padding: 0; margin: 0; }
                .voucher-container { max-width: 100%; padding: 2mm; }
                .voucher-copy {
                    border: 1px solid #000;
                    box-shadow: none;
                    margin: 2mm;
                    flex: 1 1 30%;
                    max-width: 32%;
                    page-break-inside: avoid;
                }
            }
            @media (max-width: 700px) {
                .voucher-copy {
                    flex: 1 1 100%;
                    max-width: 100%;
                }
            }
        </style>
        <div class="voucher-container">
            ${copyHTML('SCHOOL COPY')}
            ${copyHTML('PARENT COPY')}
            ${copyHTML('BANK COPY')}
        </div>
    `;
}


// ============================================
// FEES MODAL FUNCTIONS (Global)
// ============================================

window.showFeeModal = function() {
    const modal = document.getElementById('feeModal');
    if (modal) {
        document.getElementById('feeModalTitle').innerText = 'Add Fee Records';
        document.getElementById('feeForm').reset();
        document.getElementById('feeId').value = '';
        // Set default month
        const now = new Date();
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        document.getElementById('feeMonth').value = monthNames[now.getMonth()];
        
        // 🆕 Clear existing rows and add one default row
        const container = document.getElementById('feeRowsContainer');
        container.innerHTML = ''; // remove any old rows
        addFeeRow('Tuition Fee', '', '0');
        
        // 🆕 Attach the "Add Row" button listener (if not already attached)
        const addBtn = document.getElementById('addFeeRowBtn');
        // Remove any previous listener to avoid duplicates
        addBtn.replaceWith(addBtn.cloneNode(true));
        const newAddBtn = document.getElementById('addFeeRowBtn');
        newAddBtn.addEventListener('click', function() {
            addFeeRow('Tuition Fee', '', '0');
        });
        
        modal.classList.add('active');
    }
};

window.closeFeeModal = function() {
    const modal = document.getElementById('feeModal');
    if (modal) modal.classList.remove('active');
};

window.editFee = async function(id) {
    try {
        const data = await fetchAPI('/fees');
        const fee = (data.fees || []).find(f => f.id === id);
        if (fee) {
            await openFeeGroupModal(fee.student_id, fee.month);
        }
    } catch(e) {
        showAlert('Failed to load fee', 'error');
    }
};

// Opens the fee dialog pre-loaded with EVERY fee-type record for a given
// student + month (Tuition, Transport, Exam, etc.) as separate rows —
// the same layout used when the fees were first generated. This lets staff
// receive payment across all fee types in one dialog/one save, instead of
// opening a separate dialog per fee type.
window.openFeeGroupModal = async function(studentId, month) {
    try {
        const data = await fetchAPI('/fees');
        const feesForGroup = (data.fees || []).filter(
            f => String(f.student_id) === String(studentId) && f.month === month
        );
        if (feesForGroup.length === 0) return;

        const modal = document.getElementById('feeModal');
        modal.classList.add('active');
        document.getElementById('feeModalTitle').innerText = 'Receive / Edit Fee Payment';
        document.getElementById('feeStudentId').value = studentId;
        document.getElementById('feeMonth').value = month || '';
        document.getElementById('feeDueDate').value = feesForGroup[0].due_date || '';
        document.getElementById('feeId').value = ''; // group mode — each row tracks its own id

        const container = document.getElementById('feeRowsContainer');
        container.innerHTML = '';
        feesForGroup.forEach(fee => {
            addFeeRow(fee.fee_type, fee.amount, fee.paid_amount, fee.discount_amount, fee.discount_reason, fee.fine_amount, fee.id, fee.payment_method || 'Cash');
        });
    } catch (e) {
        showAlert('Failed to load fee records', 'error');
    }
};

window.saveFee = async function() {
    const feeId = document.getElementById('feeId').value;
    const studentId = document.getElementById('feeStudentId').value;
    const month = document.getElementById('feeMonth').value;
    const dueDate = document.getElementById('feeDueDate').value;

    if (!studentId || !month) {
        showAlert('Please select a student and month.', 'error');
        return;
    }

    const rows = document.querySelectorAll('.fee-row');
    const rowsToCreate = [];
    const rowsToUpdate = []; // { id, payload }
    let hasError = false;

    rows.forEach(row => {
        const typeSelect = row.querySelector('.fee-type-select');
        const customInput = row.querySelector('.fee-custom-type');
        const amountInput = row.querySelector('.fee-amount');
        const paidInput = row.querySelector('.fee-paid');
        const discountInput = row.querySelector('.fee-discount-amount');
        const discountReasonInput = row.querySelector('.fee-discount-reason');
        const fineInput = row.querySelector('.fee-fine-amount');
        const paymentMethodInput = row.querySelector('.fee-payment-method');

        let feeType = typeSelect.value;
        if (feeType === 'Other') {
            feeType = customInput.value.trim() || 'Other';
        }
        const amount = parseFloat(amountInput.value);
        const paid = parseFloat(paidInput.value) || 0;
        const discountAmount = parseFloat(discountInput?.value) || 0;
        const discountReason = discountReasonInput?.value.trim() || null;
        const fineAmount = parseFloat(fineInput?.value) || 0;
        const paymentMethod = paymentMethodInput?.value || 'Cash';

        if (!feeType || isNaN(amount) || amount <= 0) {
            hasError = true;
            showAlert('Each row must have a valid fee type and amount.', 'error');
            return;
        }
        if (discountAmount > amount) {
            hasError = true;
            showAlert('Discount cannot be greater than the fee amount.', 'error');
            return;
        }

        const payload = {
            student_id: studentId,
            fee_type: feeType,
            month: month,
            amount: amount,
            paid_amount: paid,
            due_date: dueDate,
            paid_date: paid > 0 ? new Date().toISOString().split('T')[0] : null,
            discount_amount: discountAmount,
            discount_reason: discountReason,
            fine_amount: fineAmount,
            payment_method: paymentMethod
        };

        // Rows loaded from an existing record (data-fee-id set by
        // openFeeGroupModal/editFee) get updated in place; brand-new rows
        // (e.g. added via "+ Add Charge") get created. This lets one save
        // cover Tuition + Transport + Exam etc. together instead of one
        // dialog submission per fee type.
        const rowFeeId = row.dataset.feeId;
        if (rowFeeId) {
            rowsToUpdate.push({ id: parseInt(rowFeeId, 10), payload });
        } else {
            rowsToCreate.push(payload);
        }
    });

    if (hasError || (rowsToCreate.length === 0 && rowsToUpdate.length === 0)) return;

    try {
        const updatePromises = rowsToUpdate.map(({ id, payload }) =>
            fetch(`${API_BASE}/fees/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            }).then(res => {
                if (!res.ok) throw new Error('Failed to update a fee record');
                return res.json();
            })
        );

        const createPromise = rowsToCreate.length > 0
            ? fetch(`${API_BASE}/fees`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(rowsToCreate)
            }).then(res => {
                if (!res.ok) throw new Error('Failed to save new fee rows');
                return res.json();
            })
            : Promise.resolve(null);

        await Promise.all([...updatePromises, createPromise]);

        showAlert('Fee(s) saved successfully', 'success');
        await applyFeeFilters();

        // Reopen the same student + month group with the freshly saved
        // values, instead of just closing the modal — lets staff
        // immediately continue receiving payment for any remaining fee
        // types without hunting for each row separately.
        await openFeeGroupModal(studentId, month);
    } catch (error) {
        showAlert('Error saving fees: ' + error.message, 'error');
    }
};

window.deleteFee = async function(id) {
    if (!confirm('Void this fee record? It will be removed from active lists/reports, but kept on file for audit — any already-received payment will be automatically reversed in Accounts.')) return;
    const reason = prompt('Reason for voiding this fee record (optional):') || '';
    try {
        await fetchAPI(`/fees/${id}`, {
            method: 'DELETE',
            body: JSON.stringify({ reason })
        });
        showAlert('Fee record voided');
        await applyFeeFilters();
    } catch(e) {
        console.error(e);
        showAlert('Error voiding fee', 'error');
    }
};

// ============================================
// LATE FINE FUNCTIONS
// ============================================
window.recalculateFines = async function() {
    if (!confirm('Recalculate late fines for all overdue unpaid fees based on current Fine Settings?')) return;
    try {
        const result = await fetchAPI('/fees/recalculate-fines', { method: 'POST' });
        showAlert(result.message || `Recalculated fines for ${result.updated} record(s)`, 'success');
        await applyFeeFilters();
    } catch (e) {
        showAlert('Failed to recalculate fines: ' + e.message, 'error');
    }
};

// One-time / on-demand backfill: posts any fee payment that hasn't been
// reflected in the Accounts module yet (e.g. fees paid before the
// Fees<->Accounts integration existed) as proper Receipt/Payment
// vouchers. Safe to run repeatedly — already-synced fees are skipped.
window.syncFeesToAccounts = async function() {
    if (!confirm('Post any fee payments not yet reflected in Accounts (Cash Book, Ledger, Trial Balance)?')) return;
    try {
        const result = await fetchAPI('/fees/accounts-sync', { method: 'POST' });
        showAlert(result.message || `Synced ${result.posted} fee payment(s) to Accounts`, 'success');
    } catch (e) {
        showAlert('Failed to sync fees to Accounts: ' + e.message, 'error');
    }
};

window.showFineSettingsModal = async function() {
    const modal = document.getElementById('fineSettingsModal');
    if (!modal) return;
    try {
        const settings = await fetchAPI('/fees/fine-settings');
        document.getElementById('fineRatePerDay').value = settings.fine_per_day ?? 10;
        document.getElementById('fineGraceDays').value = settings.grace_days ?? 5;
        modal.classList.add('active');
    } catch (e) {
        showAlert('Failed to load fine settings: ' + e.message, 'error');
    }
};

window.closeFineSettingsModal = function() {
    const modal = document.getElementById('fineSettingsModal');
    if (modal) modal.classList.remove('active');
};

window.saveFineSettings = async function() {
    const finePerDay = parseFloat(document.getElementById('fineRatePerDay').value);
    const graceDays = parseInt(document.getElementById('fineGraceDays').value, 10);

    if (isNaN(finePerDay) || finePerDay < 0 || isNaN(graceDays) || graceDays < 0) {
        showAlert('Please enter valid, non-negative values.', 'error');
        return;
    }

    try {
        await fetchAPI('/fees/fine-settings', {
            method: 'POST',
            body: JSON.stringify({ fine_per_day: finePerDay, grace_days: graceDays })
        });
        showAlert('Fine settings saved', 'success');
        closeFineSettingsModal();
    } catch (e) {
        showAlert('Failed to save fine settings: ' + e.message, 'error');
    }
};

// ============================================
// CHARITY FUND FUNCTIONS
// ============================================
window.loadCharityFund = async function() {
    const tbody = document.getElementById('charityLedgerBody');
    try {
        const data = await fetchAPI('/fees/charity-fund/ledger');
        const balance = data.balance ?? 0;
        document.getElementById('charityFundBalance').innerText = balance;

        const entries = data.entries || [];
        if (!entries.length) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No charity fund activity yet.</td></tr>';
            return;
        }

        tbody.innerHTML = entries.map(e => `
            <tr>
                <td>${e.created_at ? e.created_at.split(' ')[0] : ''}</td>
                <td style="color: ${e.entry_type === 'Credit' ? 'var(--green)' : 'var(--red)'};">${e.entry_type}</td>
                <td>${e.source}</td>
                <td>${e.description || ''}</td>
                <td>${e.amount}</td>
                <td>${e.balance_after}</td>
                <td>${e.created_by || '-'}</td>
            </tr>
        `).join('');
    } catch (e) {
        console.error(e);
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Failed to load charity fund ledger.</td></tr>';
    }
};

window.showDisbursementModal = async function() {
    const modal = document.getElementById('disbursementModal');
    if (!modal) return;
    document.getElementById('disbursementForm').reset();
    try {
        const data = await fetchAPI('/fees/charity-fund/balance');
        document.getElementById('disbursementAvailableBalance').innerText = data.balance ?? 0;
    } catch (e) {
        document.getElementById('disbursementAvailableBalance').innerText = '0';
    }
    modal.classList.add('active');
};

window.closeDisbursementModal = function() {
    const modal = document.getElementById('disbursementModal');
    if (modal) modal.classList.remove('active');
};

window.saveDisbursement = async function() {
    const amount = parseFloat(document.getElementById('disbursementAmount').value);
    const description = document.getElementById('disbursementDescription').value.trim();

    if (isNaN(amount) || amount <= 0) {
        showAlert('Please enter a valid amount.', 'error');
        return;
    }
    if (!description) {
        showAlert('Please enter a description.', 'error');
        return;
    }

    try {
        const result = await fetchAPI('/fees/charity-fund/disburse', {
            method: 'POST',
            body: JSON.stringify({ amount, description })
        });
        showAlert(result.message || 'Disbursement recorded', 'success');
        closeDisbursementModal();
        await loadCharityFund();
    } catch (e) {
        showAlert('Failed to record disbursement: ' + e.message, 'error');
    }
};

// ============================================
// FEES FILTER FUNCTIONS
// ============================================
window.applyFeeFilters = async function() {
    const search = document.getElementById('feeSearch')?.value || '';
    const month = document.getElementById('feeMonth')?.value || '';
    const year = document.getElementById('feeYear')?.value || '';
    const class_name = document.getElementById('feeClass')?.value || '';
    const student_id = document.getElementById('feeStudent')?.value || '';
    const status = document.getElementById('feeStatus')?.value || 'all';
    const showVoided = document.getElementById('feeShowVoided')?.checked || false;

    const params = new URLSearchParams();
    if (search) params.append('q', search);
    if (month) params.append('month', month);
    if (year) params.append('year', year);
    if (class_name) params.append('class', class_name);
    if (student_id) params.append('student_id', student_id);
    if (status) params.append('status', status);
    if (showVoided) params.append('include_voided', '1');

    try {
        const data = await fetchAPI(`/fees/report?${params.toString()}`);
        const fees = data.fees || [];
        const summary = data.summary || {};

        // Update summary
        document.getElementById('feeTotalAmount').textContent = 'PKR ' + (summary.total_amount || 0).toLocaleString();
        document.getElementById('feeTotalPaid').textContent = 'PKR ' + (summary.total_paid || 0).toLocaleString();
        document.getElementById('feeTotalUnpaid').textContent = 'PKR ' + (summary.total_unpaid || 0).toLocaleString();
        document.getElementById('feeCount').textContent = summary.count || 0;

        // Update table
        const tbody = document.getElementById('feeTableBody');
        if (fees.length === 0) {
            tbody.innerHTML = '<tr><td colspan="13" style="text-align:center; color: #94a3b8;">No records found.</td></tr>';
            return;
        }

        tbody.innerHTML = fees.map(f => {
            const discount = parseFloat(f.discount_amount || 0);
            const fine = parseFloat(f.fine_amount || 0);
            const netAmount = parseFloat(f.amount || 0) - discount + fine;
            return `
            <tr style="${f.is_voided ? 'opacity:0.55;' : ''}">
                <td style="font-weight:500;"><a href="#" onclick="event.preventDefault(); showFeeHistoryModal('${escapeHtml(String(f.student_id))}', '${escapeHtml(f.student_name).replace(/'/g, "\\'")}')" style="color:var(--accent); cursor:pointer;" title="View fee history">${escapeHtml(f.student_name)}</a>${f.is_voided ? ' <span class="badge" style="background:#7f1d1d;color:#fecaca;" title="' + escapeHtml(f.voided_reason || 'No reason given') + ' — voided by ' + escapeHtml(f.voided_by || '-') + ' on ' + escapeHtml(f.voided_at || '-') + '">VOIDED</span>' : ''}</td>
                <td>${escapeHtml(f.student_class || '-')}</td>
                <td>${escapeHtml(f.fee_type)}</td>
                <td>${escapeHtml(f.month || '-')}</td>
                <td style="text-align:right;">PKR ${parseFloat(f.amount || 0).toLocaleString()}</td>
                <td style="text-align:right; color:${discount > 0 ? 'var(--green)' : 'inherit'};" title="${escapeHtml(f.discount_reason || '')}">${discount > 0 ? '-PKR ' + discount.toLocaleString() : '-'}</td>
                <td style="text-align:right; color:${fine > 0 ? 'var(--red)' : 'inherit'};">${fine > 0 ? 'PKR ' + fine.toLocaleString() : '-'}</td>
                <td style="text-align:right; font-weight:600;">PKR ${netAmount.toLocaleString()}</td>
                <td style="text-align:right;">PKR ${parseFloat(f.paid_amount || 0).toLocaleString()}</td>
                <td>${f.due_date || '-'}</td>
                <td>${f.paid_date || '-'}</td>
                <td>${f.status === 'Paid' ? '<span class="badge badge-green">Paid</span>' :
                    f.status === 'Pending' ? '<span class="badge badge-red">Pending</span>' :
                    '<span class="badge badge-yellow">Partial</span>'}</td>
                <td class="actions">
                    ${f.is_voided ? '' : `
                    <button onclick="editFee(${f.id})" class="btn btn-ghost btn-sm">✏</button>
                    <button onclick="deleteFee(${f.id})" class="btn btn-danger btn-sm" title="Void this fee record">🚫</button>
                    `}
                </td>
            </tr>
        `;
        }).join('');

    } catch (error) {
        showAlert('Failed to load fees: ' + error.message, 'error');
    }
};

window.clearFeeFilters = function() {
    document.getElementById('feeSearch').value = '';
    document.getElementById('feeMonth').value = '';
    document.getElementById('feeYear').value = '';
    document.getElementById('feeClass').value = '';
    document.getElementById('feeStudent').value = '';
    document.getElementById('feeStatus').value = 'all';
    applyFeeFilters();
};

// ============================================
// EXPORT FEES TO CSV
// ============================================
window.exportFeesCSV = async function() {
    const search = document.getElementById('feeSearch')?.value || '';
    const month = document.getElementById('feeMonth')?.value || '';
    const year = document.getElementById('feeYear')?.value || '';
    const class_name = document.getElementById('feeClass')?.value || '';
    const student_id = document.getElementById('feeStudent')?.value || '';
    const status = document.getElementById('feeStatus')?.value || 'all';

    const params = new URLSearchParams();
    if (search) params.append('q', search);
    if (month) params.append('month', month);
    if (year) params.append('year', year);
    if (class_name) params.append('class', class_name);
    if (student_id) params.append('student_id', student_id);
    if (status) params.append('status', status);

    try {
        const data = await fetchAPI(`/fees/report?${params.toString()}`);
        const fees = data.fees || [];
        if (fees.length === 0) {
            showAlert('No data to export.', 'error');
            return;
        }

        const headers = ['Student', 'Class', 'Fee Type', 'Month', 'Amount', 'Discount', 'Fine', 'Net Payable', 'Paid', 'Due Date', 'Paid Date', 'Status'];
        const rows = fees.map(f => [
            f.student_name,
            f.student_class || '',
            f.fee_type,
            f.month || '',
            f.amount,
            f.discount_amount || 0,
            f.fine_amount || 0,
            (parseFloat(f.amount || 0) - parseFloat(f.discount_amount || 0) + parseFloat(f.fine_amount || 0)),
            f.paid_amount,
            f.due_date || '',
            f.paid_date || '',
            f.status
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = `fees_${new Date().toISOString().slice(0,10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        showAlert('CSV exported successfully!', 'success');
    } catch (error) {
        showAlert('Export failed: ' + error.message, 'error');
    }
};
window.printFees = async function() {
    // Get current filter values
    const search = document.getElementById('feeSearch')?.value || '';
    const month = document.getElementById('feeMonth')?.value || '';
    const year = document.getElementById('feeYear')?.value || '';
    const class_name = document.getElementById('feeClass')?.value || '';
    const student_id = document.getElementById('feeStudent')?.value || '';
    const status = document.getElementById('feeStatus')?.value || 'all';

    const params = new URLSearchParams();
    if (search) params.append('q', search);
    if (month) params.append('month', month);
    if (year) params.append('year', year);
    if (class_name) params.append('class', class_name);
    if (student_id) params.append('student_id', student_id);
    if (status && status !== 'all') params.append('status', status);

    try {
        const data = await fetchAPI(`/fees/report?${params.toString()}`);
        const fees = data.fees || [];
        const summary = data.summary || {};

        if (fees.length === 0) {
            showAlert('No data to print.', 'error');
            return;
        }

        let rows = '';
        fees.forEach(f => {
            const discount = parseFloat(f.discount_amount || 0);
            const fine = parseFloat(f.fine_amount || 0);
            const net = parseFloat(f.amount || 0) - discount + fine;
            rows += `<tr>
                <td>${escapeHtml(f.student_name)}</td>
                <td>${escapeHtml(f.student_class || '-')}</td>
                <td>${escapeHtml(f.fee_type)}</td>
                <td style="text-align:right">PKR ${parseInt(f.amount || 0).toLocaleString()}</td>
                <td style="text-align:right">PKR ${discount.toLocaleString()}</td>
                <td style="text-align:right">PKR ${fine.toLocaleString()}</td>
                <td style="text-align:right">PKR ${net.toLocaleString()}</td>
                <td style="text-align:right">PKR ${parseInt(f.paid_amount || 0).toLocaleString()}</td>
                <td>${escapeHtml(f.status)}</td>
                <td>${f.due_date || '-'}</td>
                <td>${f.paid_date || '-'}</td>
            </tr>`;
        });

        printPreview(`
            <h3>Fees Report</h3>
            <p>
                <strong>Total (Net):</strong> PKR ${summary.total_amount.toLocaleString()} |
                <strong>Collected:</strong> PKR ${summary.total_paid.toLocaleString()} |
                <strong>Unpaid:</strong> PKR ${summary.total_unpaid.toLocaleString()} |
                <strong>Records:</strong> ${summary.count}
            </p>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Student</th><th>Class</th><th>Fee Type</th>
                        <th>Amount</th><th>Discount</th><th>Fine</th><th>Net Payable</th>
                        <th>Paid</th><th>Status</th>
                        <th>Due Date</th><th>Paid Date</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `, 'Fees Report');
    } catch (error) {
        showAlert('Failed to print: ' + error.message, 'error');
    }
};

function addFeeRow(feeType = '', amount = '', paid = '0', discountAmount = '0', discountReason = '', fineAmount = '0', feeId = null, paymentMethod = 'Cash') {
    const container = document.getElementById('feeRowsContainer');
    const row = document.createElement('div');
    row.className = 'fee-row';
    // Remembers the existing fee record this row represents (if any), so
    // saveFee() knows whether to UPDATE it or CREATE a new one. Rows added
    // fresh (e.g. via "+ Add Charge") have no feeId and are always created.
    row.dataset.feeId = feeId || '';
    row.style.cssText = 'display:flex; flex-direction:column; gap:6px; padding:8px; margin-bottom:8px; border:1px solid #334155; border-radius:6px;';
    row.innerHTML = `
        <div style="display:flex; gap:8px; align-items:center;">
            <select class="fee-type-select" style="flex:2; padding:6px;">
                <option value="Tuition Fee" ${feeType === 'Tuition Fee' ? 'selected' : ''}>Tuition Fee</option>
                <option value="Transport Fee" ${feeType === 'Transport Fee' ? 'selected' : ''}>Transport Fee</option>
                <option value="Exam Fee" ${feeType === 'Exam Fee' ? 'selected' : ''}>Exam Fee</option>
                <option value="Books Fee" ${feeType === 'Books Fee' ? 'selected' : ''}>Books Fee</option>
                <option value="Lab Fee" ${feeType === 'Lab Fee' ? 'selected' : ''}>Lab Fee</option>
                <option value="Other" ${feeType === 'Other' ? 'selected' : ''}>Other</option>
            </select>
            <input type="text" class="fee-custom-type" placeholder="Custom type" style="flex:1; display:${feeType === 'Other' ? 'inline' : 'none'}; padding:6px;">
            <input type="number" class="fee-amount" placeholder="Amount" step="0.01" style="flex:1; padding:6px;" value="${amount}">
            <input type="number" class="fee-paid" placeholder="Paid" step="0.01" style="flex:1; padding:6px;" value="${paid}">
            <button type="button" class="btn btn-danger btn-sm remove-fee-row" style="padding:2px 8px;">✕</button>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
            <label style="font-size:12px; color:#94a3b8; flex:0 0 auto;">Discount</label>
            <input type="number" class="fee-discount-amount" placeholder="Discount / Scholarship" step="0.01" style="flex:1; padding:6px;" value="${discountAmount || 0}">
            <input type="text" class="fee-discount-reason" placeholder="Reason (e.g. Merit Scholarship)" style="flex:2; padding:6px;" value="${escapeHtml(discountReason || '')}">
            <label style="font-size:12px; color:#94a3b8; flex:0 0 auto;">Fine</label>
            <input type="number" class="fee-fine-amount" placeholder="Late Fine" step="0.01" style="flex:1; padding:6px;" value="${fineAmount || 0}">
            <label style="font-size:12px; color:#94a3b8; flex:0 0 auto;" title="Which Cash/Bank account this payment posts to in Accounts">Received via</label>
            <select class="fee-payment-method" style="flex:1; padding:6px;">
                <option value="Cash" ${paymentMethod === 'Cash' ? 'selected' : ''}>Cash</option>
                <option value="Bank" ${paymentMethod === 'Bank' ? 'selected' : ''}>Bank</option>
                <option value="JazzCash" ${paymentMethod === 'JazzCash' ? 'selected' : ''}>JazzCash</option>
            </select>
        </div>
    `;
    container.appendChild(row);

    // Handle "Other" selection
    const select = row.querySelector('.fee-type-select');
    const customInput = row.querySelector('.fee-custom-type');
    select.addEventListener('change', function() {
        customInput.style.display = this.value === 'Other' ? 'inline' : 'none';
        if (this.value !== 'Other') customInput.value = '';
    });

    // Remove row
    row.querySelector('.remove-fee-row').addEventListener('click', function() {
        if (container.children.length > 1) {
            row.remove();
        } else {
            showAlert('At least one fee row is required.', 'warning');
        }
    });
}



