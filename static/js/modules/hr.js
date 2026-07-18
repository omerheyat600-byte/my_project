// ============================================
// HR.JS — HR Module.
// Leave Application, Leave Approval, Payroll, Salary Slip,
// Overtime, Increment, Employee Documents.
// Reuses fmtMoney / todayStr / monthStartStr / closeModal from accounts.js
// and escapeHtml / fetchAPI / showAlert / printPreview from common.js.
// ============================================

let currentHrTab = 'leave_application';
const HR_TABS = [
    { key: 'leave_application', label: '📝 Leave Application' },
    { key: 'leave_approval', label: '✅ Leave Approval' },
    { key: 'payroll', label: '💵 Payroll' },
    { key: 'salary_slip', label: '🧾 Salary Slip' },
    { key: 'overtime', label: '⏱ Overtime' },
    { key: 'increment', label: '📈 Increment' },
    { key: 'documents', label: '📁 Employee Documents' },
];

const LEAVE_TYPES = ['Casual', 'Sick', 'Annual', 'Unpaid', 'Maternity/Paternity', 'Other'];
const DOCUMENT_TYPES = ['CNIC', 'Contract', 'Certificate', 'Resume', 'Experience Letter', 'Other'];

let hrEmployeeCache = null;

async function getEmployees(force = false) {
    if (hrEmployeeCache && !force) return hrEmployeeCache;
    try {
        const data = await fetchAPI('/teachers');
        hrEmployeeCache = data.teachers || [];
    } catch (e) { hrEmployeeCache = []; }
    return hrEmployeeCache;
}

function employeeOptions(employees, includeBlank = true) {
    return (includeBlank ? '<option value="">Select employee</option>' : '') +
        employees.map(t => `<option value="${t.id}">${escapeHtml(t.id)} — ${escapeHtml(t.name)}</option>`).join('');
}

function statusBadge(status) {
    const cls = { Approved: 'badge-green', Paid: 'badge-green', Pending: 'badge-yellow', Draft: 'badge-yellow', Rejected: 'badge-red', Cancelled: 'badge-red' }[status] || 'badge-blue';
    return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
}

async function loadHR() {
    const html = `
        <div class="page-header">
            <div class="page-title">HR</div>
            <div class="page-sub">Leave, Payroll, Overtime, Increments and Employee Documents.</div>
        </div>
        <div class="toolbar no-print" id="hrTabBar" style="flex-wrap:wrap;">
            ${HR_TABS.map(t => `<button onclick="switchHrTab('${t.key}')" id="hrTab_${t.key}" class="btn ${t.key === currentHrTab ? 'btn-primary' : 'btn-ghost'} btn-sm">${t.label}</button>`).join('')}
        </div>
        <div id="hrTabContent"><div class="loading">Loading…</div></div>
    `;
    document.getElementById('page-content').innerHTML = html;
    hrEmployeeCache = null;
    await getEmployees(true);
    await switchHrTab(currentHrTab);
}

window.switchHrTab = async function (tab) {
    currentHrTab = tab;
    HR_TABS.forEach(t => {
        const btn = document.getElementById(`hrTab_${t.key}`);
        if (btn) btn.className = `btn ${t.key === tab ? 'btn-primary' : 'btn-ghost'} btn-sm`;
    });
    const box = document.getElementById('hrTabContent');
    box.innerHTML = '<div class="loading">Loading…</div>';
    try {
        if (tab === 'leave_application') await renderLeaveApplicationTab(box);
        else if (tab === 'leave_approval') await renderLeaveApprovalTab(box);
        else if (tab === 'payroll') await renderPayrollTab(box);
        else if (tab === 'salary_slip') await renderSalarySlipTab(box);
        else if (tab === 'overtime') await renderOvertimeTab(box);
        else if (tab === 'increment') await renderIncrementTab(box);
        else if (tab === 'documents') await renderDocumentsTab(box);
    } catch (e) {
        console.error(e);
        box.innerHTML = '<div class="loading">Failed to load this tab.</div>';
    }
};

// ============================================
// LEAVE APPLICATION
// ============================================
async function renderLeaveApplicationTab(box) {
    const employees = await getEmployees();
    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <h3 style="margin:0 0 10px 0;">Apply for Leave</h3>
            <div class="form-grid">
                <div class="form-group"><label>Employee *</label><select id="laEmployee">${employeeOptions(employees)}</select></div>
                <div class="form-group"><label>Leave Type *</label><select id="laType">${LEAVE_TYPES.map(t => `<option>${t}</option>`).join('')}</select></div>
                <div class="form-group"><label>Start Date *</label><input type="date" id="laStart" value="${todayStr()}"></div>
                <div class="form-group"><label>End Date *</label><input type="date" id="laEnd" value="${todayStr()}"></div>
                <div class="form-group full"><label>Reason</label><input type="text" id="laReason"></div>
            </div>
            <button class="btn btn-primary" onclick="submitLeaveApplication()">Submit Application</button>
        </div>
        <div class="card" style="margin-bottom:16px;">
            <div class="toolbar">
                <select id="laFilterEmployee" class="filter">${employeeOptions(employees).replace('Select employee', 'All Employees')}</select>
                <select id="laFilterStatus" class="filter"><option value="">All Status</option><option>Pending</option><option>Approved</option><option>Rejected</option><option>Cancelled</option></select>
                <button class="btn btn-ghost btn-sm" onclick="loadLeaveApplicationList()">Filter</button>
            </div>
        </div>
        <div id="laListResult"><div class="loading">Loading…</div></div>
    `;
    await loadLeaveApplicationList();
}

window.submitLeaveApplication = async function () {
    const payload = {
        teacher_id: document.getElementById('laEmployee').value,
        leave_type: document.getElementById('laType').value,
        start_date: document.getElementById('laStart').value,
        end_date: document.getElementById('laEnd').value,
        reason: document.getElementById('laReason').value,
    };
    if (!payload.teacher_id) { showAlert('Please select an employee', 'error'); return; }
    try {
        await fetchAPI('/hr/leave', { method: 'POST', body: JSON.stringify(payload) });
        showAlert('Leave application submitted');
        document.getElementById('laReason').value = '';
        await loadLeaveApplicationList();
    } catch (e) { console.error(e); }
};

window.loadLeaveApplicationList = async function () {
    const employeeId = document.getElementById('laFilterEmployee')?.value || '';
    const status = document.getElementById('laFilterStatus')?.value || '';
    const data = await fetchAPI(`/hr/leave?teacher_id=${employeeId}&status=${status}`);
    const result = document.getElementById('laListResult');
    if (!result) return;
    result.innerHTML = `
        <div class="card">
            <div class="table-wrap"><table class="data-table">
                <thead><tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>${(data.applications || []).map(a => `<tr>
                    <td>${escapeHtml(a.teacher_name || a.teacher_id)}</td>
                    <td>${escapeHtml(a.leave_type)}</td>
                    <td>${a.start_date}</td><td>${a.end_date}</td><td>${a.days}</td>
                    <td>${escapeHtml(a.reason || '-')}</td>
                    <td>${statusBadge(a.status)}</td>
                    <td class="actions">${a.status === 'Pending' || a.status === 'Approved' ? `<button onclick="cancelLeave(${a.id})" class="btn btn-danger btn-sm">Cancel</button>` : ''}</td>
                </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:#94a3b8;">No leave applications found</td></tr>'}</tbody>
            </table></div>
        </div>
    `;
};

window.cancelLeave = async function (id) {
    if (!confirm('Cancel this leave application?')) return;
    try {
        await fetchAPI(`/hr/leave/${id}/cancel`, { method: 'PUT' });
        showAlert('Leave application cancelled');
        await loadLeaveApplicationList();
    } catch (e) { console.error(e); }
};

// ============================================
// LEAVE APPROVAL
// ============================================
async function renderLeaveApprovalTab(box) {
    box.innerHTML = `<div id="leaveApprovalResult"><div class="loading">Loading…</div></div>`;
    await loadLeaveApprovalList();
}

window.loadLeaveApprovalList = async function () {
    const data = await fetchAPI('/hr/leave?status=Pending');
    const result = document.getElementById('leaveApprovalResult');
    if (!result) return;
    result.innerHTML = `
        <div class="kpi-grid">
            <div class="kpi-card"><div class="kpi-label">Pending Approvals</div><div class="kpi-value">${data.count || 0}</div></div>
        </div>
        <div class="card" style="margin-top:12px;">
            <div class="table-wrap"><table class="data-table">
                <thead><tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Applied On</th><th>Actions</th></tr></thead>
                <tbody>${(data.applications || []).map(a => `<tr>
                    <td>${escapeHtml(a.teacher_name || a.teacher_id)}</td>
                    <td>${escapeHtml(a.leave_type)}</td>
                    <td>${a.start_date}</td><td>${a.end_date}</td><td>${a.days}</td>
                    <td>${escapeHtml(a.reason || '-')}</td>
                    <td>${(a.applied_date || '').slice(0, 10)}</td>
                    <td class="actions">
                        <button onclick="reviewLeave(${a.id},'approve')" class="btn btn-primary btn-sm">Approve</button>
                        <button onclick="reviewLeave(${a.id},'reject')" class="btn btn-danger btn-sm">Reject</button>
                    </td>
                </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:#94a3b8;">No pending leave applications 🎉</td></tr>'}</tbody>
            </table></div>
        </div>
    `;
};

window.reviewLeave = async function (id, action) {
    const remarks = prompt(action === 'approve' ? 'Remarks (optional):' : 'Reason for rejection (optional):') || '';
    try {
        await fetchAPI(`/hr/leave/${id}/${action}`, { method: 'PUT', body: JSON.stringify({ remarks }) });
        showAlert(`Leave application ${action === 'approve' ? 'approved' : 'rejected'}`);
        await loadLeaveApprovalList();
    } catch (e) { console.error(e); }
};

// ============================================
// OVERTIME
// ============================================
async function renderOvertimeTab(box) {
    const employees = await getEmployees();
    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <h3 style="margin:0 0 10px 0;">Log Overtime</h3>
            <div class="form-grid">
                <div class="form-group"><label>Employee *</label><select id="otEmployee">${employeeOptions(employees)}</select></div>
                <div class="form-group"><label>Date *</label><input type="date" id="otDate" value="${todayStr()}"></div>
                <div class="form-group"><label>Hours *</label><input type="number" step="0.5" id="otHours" value="1"></div>
                <div class="form-group"><label>Rate / Hour *</label><input type="number" step="0.01" id="otRate" value="0"></div>
                <div class="form-group full"><label>Reason</label><input type="text" id="otReason"></div>
            </div>
            <button class="btn btn-primary" onclick="submitOvertime()">Log Overtime</button>
        </div>
        <div class="card" style="margin-bottom:16px;">
            <div class="toolbar">
                <select id="otFilterStatus" class="filter"><option value="">All Status</option><option>Pending</option><option>Approved</option><option>Rejected</option></select>
                <button class="btn btn-ghost btn-sm" onclick="loadOvertimeList()">Filter</button>
            </div>
        </div>
        <div id="otListResult"><div class="loading">Loading…</div></div>
    `;
    await loadOvertimeList();
}

window.submitOvertime = async function () {
    const payload = {
        teacher_id: document.getElementById('otEmployee').value,
        date: document.getElementById('otDate').value,
        hours: parseFloat(document.getElementById('otHours').value || 0),
        rate_per_hour: parseFloat(document.getElementById('otRate').value || 0),
        reason: document.getElementById('otReason').value,
    };
    if (!payload.teacher_id) { showAlert('Please select an employee', 'error'); return; }
    try {
        await fetchAPI('/hr/overtime', { method: 'POST', body: JSON.stringify(payload) });
        showAlert('Overtime entry recorded');
        document.getElementById('otReason').value = '';
        await loadOvertimeList();
    } catch (e) { console.error(e); }
};

window.loadOvertimeList = async function () {
    const status = document.getElementById('otFilterStatus')?.value || '';
    const data = await fetchAPI(`/hr/overtime?status=${status}`);
    const result = document.getElementById('otListResult');
    if (!result) return;
    result.innerHTML = `
        <div class="card">
            <div class="table-wrap"><table class="data-table">
                <thead><tr><th>Employee</th><th>Date</th><th>Hours</th><th>Rate</th><th>Amount</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>${(data.entries || []).map(o => `<tr>
                    <td>${escapeHtml(o.teacher_name || o.teacher_id)}</td><td>${o.date}</td><td>${o.hours}</td>
                    <td>${fmtMoney(o.rate_per_hour)}</td><td>${fmtMoney(o.amount)}</td>
                    <td>${escapeHtml(o.reason || '-')}</td><td>${statusBadge(o.status)}</td>
                    <td class="actions">${o.status === 'Pending' ? `
                        <button onclick="reviewOvertime(${o.id},'approve')" class="btn btn-primary btn-sm">Approve</button>
                        <button onclick="reviewOvertime(${o.id},'reject')" class="btn btn-danger btn-sm">Reject</button>
                    ` : `<button onclick="deleteOvertime(${o.id})" class="btn btn-ghost btn-sm">🗑</button>`}</td>
                </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:#94a3b8;">No overtime entries found</td></tr>'}</tbody>
            </table></div>
        </div>
    `;
};

window.reviewOvertime = async function (id, action) {
    try {
        await fetchAPI(`/hr/overtime/${id}/${action}`, { method: 'PUT' });
        showAlert(`Overtime ${action === 'approve' ? 'approved' : 'rejected'}`);
        await loadOvertimeList();
    } catch (e) { console.error(e); }
};

window.deleteOvertime = async function (id) {
    if (!confirm('Delete this overtime entry?')) return;
    try {
        await fetchAPI(`/hr/overtime/${id}`, { method: 'DELETE' });
        showAlert('Overtime entry deleted');
        await loadOvertimeList();
    } catch (e) { console.error(e); }
};

// ============================================
// INCREMENT
// ============================================
async function renderIncrementTab(box) {
    const employees = await getEmployees();
    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <h3 style="margin:0 0 10px 0;">Record Salary Increment</h3>
            <div class="form-grid">
                <div class="form-group"><label>Employee *</label><select id="incEmployee" onchange="showCurrentSalary()">${employeeOptions(employees)}</select></div>
                <div class="form-group"><label>Current Salary</label><input type="text" id="incCurrentSalary" readonly></div>
                <div class="form-group"><label>Effective Date *</label><input type="date" id="incDate" value="${todayStr()}"></div>
                <div class="form-group"><label>Increment Type *</label><select id="incType"><option value="Fixed">Fixed Amount</option><option value="Percentage">Percentage</option></select></div>
                <div class="form-group"><label>Value *</label><input type="number" step="0.01" id="incValue" value="0"></div>
                <div class="form-group full"><label>Reason</label><input type="text" id="incReason"></div>
            </div>
            <button class="btn btn-primary" onclick="submitIncrement()">Save Increment</button>
        </div>
        <div id="incListResult"><div class="loading">Loading…</div></div>
    `;
    await loadIncrementList();
}

window.showCurrentSalary = async function () {
    const employees = await getEmployees();
    const id = document.getElementById('incEmployee').value;
    const emp = employees.find(t => t.id === id);
    document.getElementById('incCurrentSalary').value = emp ? fmtMoney(emp.salary) : '';
};

window.submitIncrement = async function () {
    const payload = {
        teacher_id: document.getElementById('incEmployee').value,
        effective_date: document.getElementById('incDate').value,
        increment_type: document.getElementById('incType').value,
        increment_value: parseFloat(document.getElementById('incValue').value || 0),
        reason: document.getElementById('incReason').value,
    };
    if (!payload.teacher_id) { showAlert('Please select an employee', 'error'); return; }
    try {
        const res = await fetchAPI('/hr/increments', { method: 'POST', body: JSON.stringify(payload) });
        showAlert(`Increment saved — new salary: ${fmtMoney(res.new_salary)}`);
        document.getElementById('incValue').value = '0';
        document.getElementById('incReason').value = '';
        await getEmployees(true);
        await showCurrentSalary();
        await loadIncrementList();
    } catch (e) { console.error(e); }
};

window.loadIncrementList = async function () {
    const data = await fetchAPI('/hr/increments');
    const result = document.getElementById('incListResult');
    if (!result) return;
    result.innerHTML = `
        <div class="card">
            <div class="table-wrap"><table class="data-table">
                <thead><tr><th>Employee</th><th>Effective Date</th><th>Previous Salary</th><th>Type</th><th>Value</th><th>Increment</th><th>New Salary</th><th>Reason</th></tr></thead>
                <tbody>${(data.increments || []).map(i => `<tr>
                    <td>${escapeHtml(i.teacher_name || i.teacher_id)}</td><td>${i.effective_date}</td>
                    <td>${fmtMoney(i.previous_salary)}</td><td>${escapeHtml(i.increment_type)}</td>
                    <td>${i.increment_type === 'Percentage' ? i.increment_value + '%' : fmtMoney(i.increment_value)}</td>
                    <td style="color:var(--green)">+${fmtMoney(i.increment_amount)}</td>
                    <td><strong>${fmtMoney(i.new_salary)}</strong></td>
                    <td>${escapeHtml(i.reason || '-')}</td>
                </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:#94a3b8;">No increments recorded</td></tr>'}</tbody>
            </table></div>
        </div>
    `;
};

// ============================================
// PAYROLL
// ============================================
async function renderPayrollTab(box) {
    const employees = await getEmployees();
    const now = new Date();
    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <h3 style="margin:0 0 10px 0;">Generate Payroll</h3>
            <div class="toolbar">
                <select id="pgMonth" class="filter">${Array.from({ length: 12 }, (_, i) => `<option value="${String(i + 1).padStart(2, '0')}" ${i + 1 === now.getMonth() + 1 ? 'selected' : ''}>${new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}</option>`).join('')}</select>
                <select id="pgYear" class="filter">${Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map(y => `<option value="${y}" ${y === now.getFullYear() ? 'selected' : ''}>${y}</option>`).join('')}</select>
                <button class="btn btn-primary btn-sm" onclick="generatePayroll()">Generate for All Employees</button>
            </div>
            <p style="color:#94a3b8;font-size:13px;margin-top:8px;">Pulls each employee's current salary, adds approved overtime for the month, and deducts Unpaid leave days automatically. Re-running for the same month updates Draft records (Paid records are left untouched).</p>
        </div>
        <div class="card" style="margin-bottom:16px;">
            <div class="toolbar">
                <select id="prFilterMonth" class="filter"><option value="">All Months</option>${Array.from({ length: 12 }, (_, i) => `<option value="${String(i + 1).padStart(2, '0')}">${new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}</option>`).join('')}</select>
                <select id="prFilterYear" class="filter"><option value="">All Years</option>${Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map(y => `<option value="${y}">${y}</option>`).join('')}</select>
                <select id="prFilterStatus" class="filter"><option value="">All Status</option><option>Draft</option><option>Paid</option></select>
                <button class="btn btn-ghost btn-sm" onclick="loadPayrollList()">Filter</button>
            </div>
        </div>
        <div id="payrollListResult"><div class="loading">Loading…</div></div>
        <div id="payrollEditModal" class="modal-overlay"><div class="modal">
            <div class="modal-header"><h2>Adjust Payroll</h2><span class="close-btn" onclick="closeModal('payrollEditModal')">&times;</span></div>
            <div class="modal-body">
                <input type="hidden" id="peId">
                <div class="form-grid">
                    <div class="form-group"><label>Allowances</label><input type="number" step="0.01" id="peAllowances"></div>
                    <div class="form-group"><label>Deductions</label><input type="number" step="0.01" id="peDeductions"></div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-ghost" onclick="closeModal('payrollEditModal')">Cancel</button>
                <button class="btn btn-primary" onclick="savePayrollAdjustment()">Save</button>
            </div>
        </div></div>
    `;
    await loadPayrollList();
}

window.generatePayroll = async function () {
    const month = document.getElementById('pgMonth').value;
    const year = document.getElementById('pgYear').value;
    try {
        const res = await fetchAPI('/hr/payroll/generate', { method: 'POST', body: JSON.stringify({ month, year }) });
        showAlert(res.message || 'Payroll generated');
        await loadPayrollList();
    } catch (e) { console.error(e); }
};

window.loadPayrollList = async function () {
    const month = document.getElementById('prFilterMonth')?.value || '';
    const year = document.getElementById('prFilterYear')?.value || '';
    const status = document.getElementById('prFilterStatus')?.value || '';
    const data = await fetchAPI(`/hr/payroll?month=${month}&year=${year}&status=${status}`);
    const result = document.getElementById('payrollListResult');
    if (!result) return;
    result.innerHTML = `
        <div class="kpi-grid">
            <div class="kpi-card"><div class="kpi-label">Payroll Records</div><div class="kpi-value">${data.count || 0}</div></div>
            <div class="kpi-card"><div class="kpi-label">Total Net Payable</div><div class="kpi-value">${fmtMoney(data.total_net)}</div></div>
        </div>
        <div class="card" style="margin-top:12px;">
            <div class="table-wrap"><table class="data-table">
                <thead><tr><th>Employee</th><th>Period</th><th>Basic</th><th>Overtime</th><th>Allowances</th><th>Deductions</th><th>Leave Ded.</th><th>Net</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>${(data.records || []).map(p => `<tr>
                    <td>${escapeHtml(p.teacher_name || p.teacher_id)}</td>
                    <td>${p.month}/${p.year}</td>
                    <td>${fmtMoney(p.basic_salary)}</td>
                    <td style="color:var(--green)">${fmtMoney(p.overtime_amount)}</td>
                    <td>${fmtMoney(p.allowances)}</td>
                    <td style="color:var(--red)">${fmtMoney(p.deductions)}</td>
                    <td style="color:var(--red)">${fmtMoney(p.leave_deduction)}</td>
                    <td><strong>${fmtMoney(p.net_salary)}</strong></td>
                    <td>${statusBadge(p.status)}</td>
                    <td class="actions">
                        <button onclick="printSalarySlipById(${p.id})" class="btn btn-ghost btn-sm">🖨</button>
                        ${p.status === 'Draft' ? `
                            <button onclick="editPayroll(${p.id})" class="btn btn-ghost btn-sm">✏</button>
                            <button onclick="markPayrollPaid(${p.id})" class="btn btn-primary btn-sm">Mark Paid</button>
                            <button onclick="deletePayroll(${p.id})" class="btn btn-danger btn-sm">🗑</button>
                        ` : ''}
                    </td>
                </tr>`).join('') || '<tr><td colspan="10" style="text-align:center;color:#94a3b8;">No payroll records found. Generate payroll above.</td></tr>'}</tbody>
            </table></div>
        </div>
    `;
};

window.editPayroll = async function (id) {
    const data = await fetchAPI(`/hr/payroll/${id}`);
    const p = data.record;
    document.getElementById('peId').value = p.id;
    document.getElementById('peAllowances').value = p.allowances;
    document.getElementById('peDeductions').value = p.deductions;
    document.getElementById('payrollEditModal').classList.add('active');
};

window.savePayrollAdjustment = async function () {
    const id = document.getElementById('peId').value;
    const payload = {
        allowances: parseFloat(document.getElementById('peAllowances').value || 0),
        deductions: parseFloat(document.getElementById('peDeductions').value || 0),
    };
    try {
        await fetchAPI(`/hr/payroll/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
        showAlert('Payroll record updated');
        closeModal('payrollEditModal');
        await loadPayrollList();
    } catch (e) { console.error(e); }
};

window.markPayrollPaid = async function (id) {
    if (!confirm('Mark this payroll record as Paid? This cannot be undone.')) return;
    try {
        await fetchAPI(`/hr/payroll/${id}/mark-paid`, { method: 'PUT', body: JSON.stringify({ payment_date: todayStr(), payment_method: 'Cash' }) });
        showAlert('Payroll marked as Paid');
        await loadPayrollList();
    } catch (e) { console.error(e); }
};

window.deletePayroll = async function (id) {
    if (!confirm('Delete this draft payroll record?')) return;
    try {
        await fetchAPI(`/hr/payroll/${id}`, { method: 'DELETE' });
        showAlert('Payroll record deleted');
        await loadPayrollList();
    } catch (e) { console.error(e); }
};

// ============================================
// SALARY SLIP
// ============================================
async function renderSalarySlipTab(box) {
    const employees = await getEmployees();
    const now = new Date();
    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div class="toolbar">
                <select id="ssEmployee" class="filter" style="min-width:220px;">${employeeOptions(employees)}</select>
                <select id="ssMonth" class="filter">${Array.from({ length: 12 }, (_, i) => `<option value="${String(i + 1).padStart(2, '0')}" ${i + 1 === now.getMonth() + 1 ? 'selected' : ''}>${new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}</option>`).join('')}</select>
                <select id="ssYear" class="filter">${Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map(y => `<option value="${y}" ${y === now.getFullYear() ? 'selected' : ''}>${y}</option>`).join('')}</select>
                <button class="btn btn-ghost btn-sm" onclick="loadSalarySlip()">Show Slip</button>
                <button class="btn btn-primary btn-sm" onclick="printSalarySlip()" style="margin-left:auto;">🖨 Print</button>
            </div>
        </div>
        <div id="salarySlipResult"></div>
    `;
}

window.loadSalarySlip = async function () {
    const employeeId = document.getElementById('ssEmployee').value;
    if (!employeeId) { showAlert('Please select an employee', 'error'); return; }
    const month = document.getElementById('ssMonth').value;
    const year = document.getElementById('ssYear').value;
    const data = await fetchAPI(`/hr/payroll?teacher_id=${employeeId}&month=${month}&year=${year}`);
    const result = document.getElementById('salarySlipResult');
    const record = (data.records || [])[0];
    if (!record) {
        result.innerHTML = `<div class="card"><div class="loading">No payroll record found for this employee/period. Generate payroll first from the Payroll tab.</div></div>`;
        window._lastSalarySlip = null;
        return;
    }
    window._lastSalarySlip = record;
    result.innerHTML = renderSalarySlipHtml(record);
};

function renderSalarySlipHtml(p) {
    const monthName = new Date(2000, parseInt(p.month) - 1, 1).toLocaleString('default', { month: 'long' });
    return `
        <div class="card">
            <div style="text-align:center; margin-bottom:16px;">
                <h2 style="margin:0;">Salary Slip</h2>
                <p style="color:#94a3b8;margin:4px 0;">${monthName} ${p.year}</p>
            </div>
            <table class="data-table" style="margin-bottom:16px;">
                <tbody>
                    <tr><td style="width:50%;"><strong>Employee</strong></td><td>${escapeHtml(p.teacher_name || p.teacher_id)} (${escapeHtml(p.teacher_id)})</td></tr>
                    <tr><td><strong>Status</strong></td><td>${statusBadge(p.status)}</td></tr>
                    ${p.status === 'Paid' ? `<tr><td><strong>Payment Date</strong></td><td>${p.payment_date || '-'}</td></tr><tr><td><strong>Payment Method</strong></td><td>${escapeHtml(p.payment_method || '-')}</td></tr>` : ''}
                </tbody>
            </table>
            <table class="data-table">
                <thead><tr><th>Component</th><th style="text-align:right">Amount</th></tr></thead>
                <tbody>
                    <tr><td>Basic Salary</td><td style="text-align:right">${fmtMoney(p.basic_salary)}</td></tr>
                    <tr><td>Allowances</td><td style="text-align:right; color:var(--green)">+ ${fmtMoney(p.allowances)}</td></tr>
                    <tr><td>Overtime</td><td style="text-align:right; color:var(--green)">+ ${fmtMoney(p.overtime_amount)}</td></tr>
                    <tr><td>Deductions</td><td style="text-align:right; color:var(--red)">- ${fmtMoney(p.deductions)}</td></tr>
                    <tr><td>Unpaid Leave Deduction</td><td style="text-align:right; color:var(--red)">- ${fmtMoney(p.leave_deduction)}</td></tr>
                    <tr style="font-weight:700;background:var(--card2)"><td>Net Salary</td><td style="text-align:right">${fmtMoney(p.net_salary)}</td></tr>
                </tbody>
            </table>
        </div>
    `;
}

window.printSalarySlip = function () {
    if (!window._lastSalarySlip) { showAlert('Show a salary slip first', 'error'); return; }
    printPreview(renderSalarySlipHtml(window._lastSalarySlip), `Salary Slip - ${window._lastSalarySlip.teacher_name}`);
};

window.printSalarySlipById = async function (id) {
    const data = await fetchAPI(`/hr/payroll/${id}`);
    printPreview(renderSalarySlipHtml(data.record), `Salary Slip - ${data.record.teacher_name}`);
};

// ============================================
// EMPLOYEE DOCUMENTS
// ============================================
async function renderDocumentsTab(box) {
    const employees = await getEmployees();
    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <h3 style="margin:0 0 10px 0;">Upload Employee Document</h3>
            <div class="form-grid">
                <div class="form-group"><label>Employee *</label><select id="docEmployee">${employeeOptions(employees)}</select></div>
                <div class="form-group"><label>Document Type *</label><select id="docType">${DOCUMENT_TYPES.map(t => `<option>${t}</option>`).join('')}</select></div>
                <div class="form-group"><label>Document Name</label><input type="text" id="docName" placeholder="Optional label"></div>
                <div class="form-group"><label>Expiry Date</label><input type="date" id="docExpiry"></div>
                <div class="form-group full"><label>File *</label><input type="file" id="docFile"></div>
                <div class="form-group full"><label>Notes</label><input type="text" id="docNotes"></div>
            </div>
            <button class="btn btn-primary" onclick="uploadDocument()">Upload</button>
        </div>
        <div class="card" style="margin-bottom:16px;">
            <div class="toolbar">
                <select id="docFilterEmployee" class="filter">${employeeOptions(employees).replace('Select employee', 'All Employees')}</select>
                <select id="docFilterType" class="filter"><option value="">All Types</option>${DOCUMENT_TYPES.map(t => `<option>${t}</option>`).join('')}</select>
                <button class="btn btn-ghost btn-sm" onclick="loadDocumentsList()">Filter</button>
            </div>
        </div>
        <div id="docListResult"><div class="loading">Loading…</div></div>
    `;
    await loadDocumentsList();
}

window.uploadDocument = async function () {
    const teacherId = document.getElementById('docEmployee').value;
    const fileInput = document.getElementById('docFile');
    if (!teacherId) { showAlert('Please select an employee', 'error'); return; }
    if (!fileInput.files.length) { showAlert('Please choose a file', 'error'); return; }

    const formData = new FormData();
    formData.append('teacher_id', teacherId);
    formData.append('document_type', document.getElementById('docType').value);
    formData.append('document_name', document.getElementById('docName').value);
    formData.append('expiry_date', document.getElementById('docExpiry').value);
    formData.append('notes', document.getElementById('docNotes').value);
    formData.append('file', fileInput.files[0]);

    try {
        const response = await fetch(`${API_BASE}/hr/documents`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        const json = await response.json();
        if (!response.ok || !json.success) throw new Error(json.message || json.error || 'Upload failed');
        showAlert('Document uploaded successfully');
        document.getElementById('docFile').value = '';
        document.getElementById('docName').value = '';
        document.getElementById('docNotes').value = '';
        await loadDocumentsList();
    } catch (e) {
        console.error(e);
        showAlert(e.message || 'Upload failed', 'error');
    }
};

window.loadDocumentsList = async function () {
    const employeeId = document.getElementById('docFilterEmployee')?.value || '';
    const type = document.getElementById('docFilterType')?.value || '';
    const data = await fetchAPI(`/hr/documents?teacher_id=${employeeId}&document_type=${type}`);
    const result = document.getElementById('docListResult');
    if (!result) return;
    result.innerHTML = `
        <div class="card">
            <div class="table-wrap"><table class="data-table">
                <thead><tr><th>Employee</th><th>Type</th><th>Name</th><th>Expiry</th><th>Uploaded</th><th>Actions</th></tr></thead>
                <tbody>${(data.documents || []).map(d => `<tr>
                    <td>${escapeHtml(d.teacher_name || d.teacher_id)}</td>
                    <td>${escapeHtml(d.document_type)}</td>
                    <td>${escapeHtml(d.document_name || '-')}</td>
                    <td>${d.expiry_date || '-'}</td>
                    <td>${(d.uploaded_at || '').slice(0, 10)}</td>
                    <td class="actions">
                        <a href="${d.file_path}" target="_blank" class="btn btn-ghost btn-sm">👁 View</a>
                        <button onclick="deleteDocument(${d.id})" class="btn btn-danger btn-sm">🗑</button>
                    </td>
                </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">No documents found</td></tr>'}</tbody>
            </table></div>
        </div>
    `;
};

window.deleteDocument = async function (id) {
    if (!confirm('Delete this document?')) return;
    try {
        await fetchAPI(`/hr/documents/${id}`, { method: 'DELETE' });
        showAlert('Document deleted');
        await loadDocumentsList();
    } catch (e) { console.error(e); }
};
