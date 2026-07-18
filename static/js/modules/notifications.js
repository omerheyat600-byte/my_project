// ============================================
// NOTIFICATIONS.JS — Notification Center: sent
// SMS history, bulk fee-reminder SMS, and
// one-off manual SMS to a parent.
// ============================================

let notifSelectedIds = new Set();   // student_ids checked in the fee-reminders tab
let notifFeeRows = [];              // last-loaded fee-reminder preview rows
let notifHistoryPage = 1;

const NOTIF_STATUS_BADGE = {
    sent: 'badge-green',
    failed: 'badge-red',
};

const NOTIF_TYPE_BADGE = {
    attendance: 'badge-blue',
    fee_reminder: 'badge-yellow',
    manual: 'badge-purple',
};

// ==================== PAGE ENTRY ====================
async function loadNotifications() {
    const html = `
        <div class="page-header">
            <div class="page-title">Notification Center</div>
            <div class="page-sub">Review sent SMS history, and send fee-reminder or one-off messages to parents.</div>
        </div>
        <div class="card" style="margin-bottom:16px;">
            <div class="toolbar">
                <button onclick="showNotifTab('history')" id="notifTabBtn-history" class="btn btn-primary btn-sm">History</button>
                <button onclick="showNotifTab('feeReminders')" id="notifTabBtn-feeReminders" class="btn btn-ghost btn-sm">Fee Reminders</button>
                <button onclick="showNotifTab('manual')" id="notifTabBtn-manual" class="btn btn-ghost btn-sm">Send Manual SMS</button>
            </div>
        </div>
        <div id="notifTabBody"></div>
    `;
    document.getElementById('page-content').innerHTML = html;
    showNotifTab('history');
}

window.showNotifTab = function (tab) {
    ['history', 'feeReminders', 'manual'].forEach(t => {
        const btn = document.getElementById(`notifTabBtn-${t}`);
        if (btn) btn.className = (t === tab) ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
    });

    const body = document.getElementById('notifTabBody');
    if (!body) return;

    if (tab === 'history') renderNotifHistoryTab(body);
    if (tab === 'feeReminders') renderNotifFeeRemindersTab(body);
    if (tab === 'manual') renderNotifManualTab(body);
};

// ==================== HISTORY TAB ====================
function renderNotifHistoryTab(body) {
    body.innerHTML = `
        <div id="notifStatsRow" class="kpi-grid" style="margin-bottom:16px;"></div>
        <div class="card">
            <div class="toolbar">
                <select id="notifFilterStatus" class="filter">
                    <option value="">All statuses</option>
                    <option value="sent">Sent</option>
                    <option value="failed">Failed</option>
                </select>
                <select id="notifFilterType" class="filter">
                    <option value="">All types</option>
                    <option value="attendance">Attendance</option>
                    <option value="fee_reminder">Fee Reminder</option>
                    <option value="manual">Manual</option>
                </select>
                <input type="text" id="notifFilterSearch" class="filter" placeholder="Search student ID, phone, or message">
                <button onclick="loadNotifHistory(1)" class="btn btn-primary btn-sm">Search</button>
            </div>
            <div id="notifHistoryContainer"><div class="loading">Loading notification history...</div></div>
        </div>
    `;
    loadNotifStats();
    loadNotifHistory(1);
}

window.loadNotifStats = async function () {
    const row = document.getElementById('notifStatsRow');
    if (!row) return;
    try {
        const data = await fetchAPI('/notifications/stats');
        row.innerHTML = `
            <div class="kpi-card"><div class="kpi-label">Total Sent</div><div class="kpi-value">${data.total || 0}</div></div>
            <div class="kpi-card"><div class="kpi-label">Delivered</div><div class="kpi-value" style="color:var(--green)">${data.sent_count || 0}</div></div>
            <div class="kpi-card"><div class="kpi-label">Failed</div><div class="kpi-value" style="color:var(--red)">${data.failed_count || 0}</div></div>
            <div class="kpi-card"><div class="kpi-label">Sent Today</div><div class="kpi-value">${data.today_count || 0}</div></div>
        `;
    } catch (e) {
        console.error(e);
    }
};

window.loadNotifHistory = async function (page = 1) {
    const container = document.getElementById('notifHistoryContainer');
    if (!container) return;

    const status = document.getElementById('notifFilterStatus')?.value || '';
    const relatedTo = document.getElementById('notifFilterType')?.value || '';
    const q = document.getElementById('notifFilterSearch')?.value.trim() || '';
    notifHistoryPage = page;

    container.innerHTML = '<div class="loading">Loading notification history...</div>';

    const params = new URLSearchParams({ page: String(page), per_page: '25' });
    if (status) params.set('status', status);
    if (relatedTo) params.set('related_to', relatedTo);
    if (q) params.set('q', q);

    try {
        const data = await fetchAPI(`/notifications/history?${params.toString()}`);
        const records = data.records || [];

        if (!records.length) {
            container.innerHTML = '<div class="loading">No notifications found for these filters.</div>';
            return;
        }

        const rows = records.map(r => `
            <tr>
                <td style="white-space:nowrap;">${escapeHtml(r.sent_at || '-')}</td>
                <td>${escapeHtml(r.student_id || '-')}</td>
                <td style="white-space:nowrap;">${escapeHtml(r.parent_phone || '-')}</td>
                <td><span class="badge ${NOTIF_TYPE_BADGE[r.related_to] || 'badge-blue'}">${escapeHtml(r.related_to || '-')}</span></td>
                <td><span class="badge ${NOTIF_STATUS_BADGE[r.status] || 'badge-red'}">${escapeHtml(r.status)}</span></td>
                <td title="${escapeHtml(r.message)}" style="max-width:320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(r.message)}</td>
                <td>${escapeHtml(r.error || '-')}</td>
            </tr>
        `).join('');

        container.innerHTML = `
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>Sent At</th><th>Student ID</th><th>Phone</th><th>Type</th><th>Status</th><th>Message</th><th>Error</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <div class="toolbar" style="margin-top:12px; justify-content:space-between;">
                <span style="color:var(--muted); font-size:13px;">Page ${data.page} of ${data.total_pages} — ${data.total} total</span>
                <div>
                    <button class="btn btn-ghost btn-sm" ${data.page <= 1 ? 'disabled' : ''} onclick="loadNotifHistory(${data.page - 1})">Prev</button>
                    <button class="btn btn-ghost btn-sm" ${data.page >= data.total_pages ? 'disabled' : ''} onclick="loadNotifHistory(${data.page + 1})">Next</button>
                </div>
            </div>
        `;
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="loading">Failed to load notification history.</div>';
    }
};

// ==================== FEE REMINDERS TAB ====================
function renderNotifFeeRemindersTab(body) {
    body.innerHTML = `
        <div class="card">
            <div class="toolbar">
                <select id="notifFeeClassFilter" class="filter">
                    <option value="">All classes</option>
                </select>
                <button onclick="loadNotifFeeReminders()" class="btn btn-ghost btn-sm">Reload</button>
                <button onclick="notifToggleSelectAll()" class="btn btn-ghost btn-sm">Select / Unselect All (with phone)</button>
                <button onclick="notifSendFeeReminders(false)" class="btn btn-primary btn-sm">Send to Selected</button>
                <button onclick="notifSendFeeReminders(true)" class="btn btn-primary btn-sm">Send to All Pending</button>
            </div>
            <div id="notifFeeSummary" class="kpi-grid" style="margin-bottom:16px;"></div>
            <div id="notifFeeContainer"><div class="loading">Loading students with pending fees...</div></div>
        </div>
    `;
    notifSelectedIds = new Set();
    loadNotifFeeReminders();
}

window.loadNotifFeeReminders = async function () {
    const container = document.getElementById('notifFeeContainer');
    const summary = document.getElementById('notifFeeSummary');
    if (!container) return;

    const classFilter = document.getElementById('notifFeeClassFilter')?.value || '';
    container.innerHTML = '<div class="loading">Loading students with pending fees...</div>';

    try {
        const params = new URLSearchParams();
        if (classFilter) params.set('class_name', classFilter);
        const data = await fetchAPI(`/notifications/fee-reminders/preview?${params.toString()}`);
        notifFeeRows = data.students || [];

        // Populate the class dropdown once, from whatever classes show up (only on unfiltered load).
        if (!classFilter) {
            const classSelect = document.getElementById('notifFeeClassFilter');
            const classes = [...new Set(notifFeeRows.map(r => r.student_class).filter(Boolean))].sort();
            if (classSelect) {
                classSelect.innerHTML = '<option value="">All classes</option>' +
                    classes.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
            }
        }

        if (summary) {
            summary.innerHTML = `
                <div class="kpi-card"><div class="kpi-label">Students with Dues</div><div class="kpi-value">${data.total_students}</div></div>
                <div class="kpi-card"><div class="kpi-label">Total Outstanding</div><div class="kpi-value">Rs. ${Number(data.total_outstanding || 0).toLocaleString()}</div></div>
                <div class="kpi-card"><div class="kpi-label">Missing Phone Number</div><div class="kpi-value" style="color:var(--red)">${data.missing_phone_count}</div></div>
            `;
        }

        renderNotifFeeTable(container);
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="loading">Failed to load fee-reminder list.</div>';
    }
};

function renderNotifFeeTable(container) {
    if (!notifFeeRows.length) {
        container.innerHTML = '<div class="loading">No students with pending fees found.</div>';
        return;
    }

    const rows = notifFeeRows.map(r => {
        const disabled = !r.has_phone;
        const checked = notifSelectedIds.has(r.student_id) ? 'checked' : '';
        return `<tr style="${disabled ? 'opacity:0.5;' : ''}">
            <td><input type="checkbox" ${disabled ? 'disabled' : ''} ${checked} onchange="notifToggleRow('${r.student_id}', this.checked)"></td>
            <td>${escapeHtml(r.student_name)}</td>
            <td>${escapeHtml(r.student_class || '-')}</td>
            <td style="text-align:center">${r.pending_count}</td>
            <td style="text-align:right">Rs. ${Number(r.total_unpaid || 0).toLocaleString()}</td>
            <td style="white-space:nowrap;">${r.has_phone ? escapeHtml(r.parent_phone) : '<span class="badge badge-red">No phone</span>'}</td>
            <td title="${escapeHtml(r.message_preview)}" style="max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(r.message_preview)}</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <div class="table-wrap">
            <table class="data-table">
                <thead><tr><th></th><th>Student</th><th>Class</th><th>Pending Fees</th><th>Amount Due</th><th>Parent Phone</th><th>Message Preview</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

window.notifToggleRow = function (studentId, checked) {
    if (checked) notifSelectedIds.add(studentId);
    else notifSelectedIds.delete(studentId);
};

window.notifToggleSelectAll = function () {
    const eligible = notifFeeRows.filter(r => r.has_phone).map(r => r.student_id);
    const allSelected = eligible.length > 0 && eligible.every(id => notifSelectedIds.has(id));
    if (allSelected) {
        notifSelectedIds = new Set();
    } else {
        notifSelectedIds = new Set(eligible);
    }
    renderNotifFeeTable(document.getElementById('notifFeeContainer'));
};

window.notifSendFeeReminders = async function (sendAll) {
    const classFilter = document.getElementById('notifFeeClassFilter')?.value || '';
    let studentIds = null;

    if (!sendAll) {
        studentIds = Array.from(notifSelectedIds);
        if (!studentIds.length) {
            showAlert('Select at least one student first', 'error');
            return;
        }
    }

    const count = sendAll ? notifFeeRows.filter(r => r.has_phone).length : studentIds.length;
    if (!count) {
        showAlert('No eligible students (with a phone number) to send to', 'error');
        return;
    }
    if (!confirm(`Send fee-reminder SMS to ${count} parent(s)? This cannot be undone.`)) return;

    try {
        const body = { class_name: classFilter };
        if (studentIds) body.student_ids = studentIds;
        const result = await fetchAPI('/notifications/fee-reminders/send', {
            method: 'POST',
            body: JSON.stringify(body),
        });
        showAlert(`${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped`);
        notifSelectedIds = new Set();
        loadNotifFeeReminders();
        loadNotifStats();
    } catch (e) {
        console.error(e);
    }
};

// ==================== MANUAL SMS TAB ====================
function renderNotifManualTab(body) {
    body.innerHTML = `
        <div class="card" style="max-width:520px;">
            <div class="form-group">
                <label>Student ID</label>
                <input type="text" id="notifManualStudentId" class="filter" style="width:100%;" placeholder="e.g. STU-001">
            </div>
            <div class="form-group" style="margin-top:12px;">
                <label>Message</label>
                <textarea id="notifManualMessage" class="filter" style="width:100%; min-height:120px;" placeholder="Type the message to send to the parent's phone..."></textarea>
            </div>
            <button onclick="notifSendManual()" class="btn btn-primary" style="margin-top:12px;">Send SMS</button>
            <div style="margin-top:10px; color:var(--muted); font-size:12px;">
                Sends an SMS to the parent phone number on file for this student, and logs it in the notification history.
            </div>
        </div>
    `;
}

window.notifSendManual = async function () {
    const studentId = document.getElementById('notifManualStudentId')?.value.trim();
    const message = document.getElementById('notifManualMessage')?.value.trim();

    if (!studentId || !message) {
        showAlert('Please enter a student ID and a message', 'error');
        return;
    }

    try {
        const result = await fetchAPI('/notifications/send', {
            method: 'POST',
            body: JSON.stringify({ student_id: studentId, message }),
        });
        showAlert(`Message sent to ${result.student_name || studentId}'s parent (${result.parent_phone || ''})`);
        document.getElementById('notifManualMessage').value = '';
        loadNotifStats();
    } catch (e) {
        console.error(e);
    }
};
