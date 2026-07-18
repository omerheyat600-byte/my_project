// ============================================
// STAFF_ATTENDANCE.JS — Daily staff attendance
// marking, whole-staff monthly summary, and
// per-teacher history. Mirrors attendance.js
// (student attendance) but keyed by teacher_id
// with no class grouping — one roster per day.
// ============================================

let staffAttRosterState = {};   // { teacher_id: { status, remarks, teacher_name } }
let staffAttCurrentDate = null;

const STAFF_ATT_STATUSES = ['Present', 'Absent', 'Late', 'Leave'];
const STAFF_ATT_STATUS_BADGE = {
    Present: 'badge-green',
    Late: 'badge-yellow',
    Leave: 'badge-blue',
    Absent: 'badge-red',
};

function staffAttTodayISO() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
}

// ==================== PAGE ENTRY ====================
async function loadStaffAttendance() {
    const html = `
        <div class="page-header">
            <div class="page-title">Staff Attendance</div>
            <div class="page-sub">Mark daily staff attendance and review attendance history.</div>
        </div>
        <div class="card" style="margin-bottom:16px;">
            <div class="toolbar">
                <button onclick="showStaffAttTab('mark')" id="staffAttTabBtn-mark" class="btn btn-primary btn-sm">Mark Attendance</button>
                <button onclick="showStaffAttTab('staffSummary')" id="staffAttTabBtn-staffSummary" class="btn btn-ghost btn-sm">Staff Summary</button>
                <button onclick="showStaffAttTab('teacherHistory')" id="staffAttTabBtn-teacherHistory" class="btn btn-ghost btn-sm">Teacher History</button>
            </div>
        </div>
        <div id="staffAttendanceTabBody"></div>
    `;
    document.getElementById('page-content').innerHTML = html;
    showStaffAttTab('mark');
}

window.showStaffAttTab = function (tab) {
    ['mark', 'staffSummary', 'teacherHistory'].forEach(t => {
        const btn = document.getElementById(`staffAttTabBtn-${t}`);
        if (btn) btn.className = (t === tab) ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
    });

    const body = document.getElementById('staffAttendanceTabBody');
    if (!body) return;

    if (tab === 'mark') renderStaffAttMarkTab(body);
    if (tab === 'staffSummary') renderStaffAttSummaryTab(body);
    if (tab === 'teacherHistory') renderStaffAttHistoryTab(body);
};

// ==================== MARK ATTENDANCE TAB ====================
function renderStaffAttMarkTab(body) {
    const today = staffAttTodayISO();
    body.innerHTML = `
        <div class="card">
            <div class="toolbar">
                <input type="date" id="staffAttDate" class="filter" value="${today}">
                <button onclick="loadStaffAttRoster()" class="btn btn-ghost btn-sm">Load Roster</button>
                <button onclick="staffAttMarkAllPresent()" class="btn btn-ghost btn-sm">Mark All Present</button>
                <button onclick="saveStaffAttendance()" class="btn btn-primary">Save Attendance</button>
            </div>
            <div id="staffAttRosterContainer"><div class="loading">Select a date, then click "Load Roster".</div></div>
        </div>
    `;
}

window.loadStaffAttRoster = async function () {
    const date = document.getElementById('staffAttDate')?.value;
    const container = document.getElementById('staffAttRosterContainer');

    if (!date) {
        showAlert('Please select a date', 'error');
        return;
    }

    staffAttCurrentDate = date;
    container.innerHTML = '<div class="loading">Loading roster...</div>';

    try {
        const data = await fetchAPI(`/staff-attendance/roster?date=${date}`);
        staffAttRosterState = {};
        (data.teachers || []).forEach(t => {
            staffAttRosterState[t.teacher_id] = {
                status: t.status || 'Present',
                remarks: t.remarks || '',
                teacher_name: t.teacher_name,
            };
        });
        renderStaffAttRosterTable(data);
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="loading">Failed to load roster.</div>';
    }
};

function renderStaffAttRosterTable(data) {
    const container = document.getElementById('staffAttRosterContainer');
    const teachers = data.teachers || [];

    if (!teachers.length) {
        container.innerHTML = '<div class="loading">No teachers found. Add teaching staff first.</div>';
        return;
    }

    const rows = teachers.map(t => {
        const state = staffAttRosterState[t.teacher_id] || { status: 'Present', remarks: '' };
        const buttons = STAFF_ATT_STATUSES.map(st => {
            const active = state.status === st ? 'btn-primary' : 'btn-ghost';
            return `<button type="button" class="btn ${active} btn-sm" onclick="staffAttSetStatus('${t.teacher_id}','${st}')">${st}</button>`;
        }).join(' ');

        return `<tr>
            <td>${escapeHtml(t.teacher_name)}</td>
            <td>${escapeHtml(t.subject || '-')}</td>
            <td id="staffAttStatusBtns-${t.teacher_id}">${buttons}</td>
            <td><input type="text" placeholder="Remarks (optional)" value="${escapeHtml(state.remarks || '')}"
                onchange="staffAttSetRemarks('${t.teacher_id}', this.value)" style="width:100%;"></td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <div style="margin:10px 0; color:var(--muted); font-size:13px;">
            ${data.date} — ${teachers.length} staff member(s)
        </div>
        <div class="table-wrap">
            <table class="data-table">
                <thead><tr><th>Teacher</th><th>Subject</th><th>Status</th><th>Remarks</th></tr></thead>
                <tbody id="staffAttRosterTableBody">${rows}</tbody>
            </table>
        </div>
    `;
}

window.staffAttSetStatus = function (teacherId, status) {
    if (!staffAttRosterState[teacherId]) staffAttRosterState[teacherId] = {};
    staffAttRosterState[teacherId].status = status;

    const cell = document.getElementById(`staffAttStatusBtns-${teacherId}`);
    if (cell) {
        cell.innerHTML = STAFF_ATT_STATUSES.map(st => {
            const active = status === st ? 'btn-primary' : 'btn-ghost';
            return `<button type="button" class="btn ${active} btn-sm" onclick="staffAttSetStatus('${teacherId}','${st}')">${st}</button>`;
        }).join(' ');
    }
};

window.staffAttSetRemarks = function (teacherId, value) {
    if (!staffAttRosterState[teacherId]) staffAttRosterState[teacherId] = {};
    staffAttRosterState[teacherId].remarks = value;
};

window.staffAttMarkAllPresent = function () {
    Object.keys(staffAttRosterState).forEach(id => staffAttSetStatus(id, 'Present'));
    if (!Object.keys(staffAttRosterState).length) {
        showAlert('Load a roster first', 'error');
    }
};

window.saveStaffAttendance = async function () {
    if (!staffAttCurrentDate) {
        showAlert('Please load a roster first', 'error');
        return;
    }

    const records = Object.entries(staffAttRosterState).map(([teacher_id, s]) => ({
        teacher_id,
        teacher_name: s.teacher_name,
        status: s.status || 'Present',
        remarks: s.remarks || '',
    }));

    if (!records.length) {
        showAlert('No staff to mark', 'error');
        return;
    }

    try {
        await fetchAPI('/staff-attendance/mark', {
            method: 'POST',
            body: JSON.stringify({ date: staffAttCurrentDate, records }),
        });
        showAlert('Staff attendance saved successfully');
    } catch (e) {
        console.error(e);
    }
};

// ==================== STAFF SUMMARY TAB ====================
function renderStaffAttSummaryTab(body) {
    const now = new Date();
    body.innerHTML = `
        <div class="card">
            <div class="toolbar">
                <select id="staffAttSummaryMonth" class="filter">${staffAttMonthOptions(now.getMonth() + 1)}</select>
                <input type="number" id="staffAttSummaryYear" class="filter" style="width:100px;" value="${now.getFullYear()}">
                <button onclick="loadStaffAttSummary()" class="btn btn-primary btn-sm">Load Summary</button>
            </div>
            <div id="staffAttSummaryContainer"><div class="loading">Select a month and year to view the staff attendance summary.</div></div>
        </div>
    `;
}

function staffAttMonthOptions(selected) {
    const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return names.map((n, i) => `<option value="${i + 1}" ${i + 1 === selected ? 'selected' : ''}>${n}</option>`).join('');
}

window.loadStaffAttSummary = async function () {
    const month = document.getElementById('staffAttSummaryMonth')?.value;
    const year = document.getElementById('staffAttSummaryYear')?.value;
    const container = document.getElementById('staffAttSummaryContainer');

    if (!month || !year) {
        showAlert('Please select month and year', 'error');
        return;
    }

    container.innerHTML = '<div class="loading">Loading summary...</div>';

    try {
        const data = await fetchAPI(`/staff-attendance/summary?month=${month}&year=${year}`);
        const rows = (data.teachers || []).map(t => `
            <tr>
                <td>${escapeHtml(t.teacher_name)}</td>
                <td style="text-align:center">${t.present_count}</td>
                <td style="text-align:center">${t.absent_count}</td>
                <td style="text-align:center">${t.late_count}</td>
                <td style="text-align:center">${t.leave_count}</td>
                <td style="text-align:center"><span class="badge ${t.attendance_percentage >= 75 ? 'badge-green' : 'badge-red'}">${t.attendance_percentage}%</span></td>
            </tr>
        `).join('');

        container.innerHTML = `
            <div class="kpi-grid">
                <div class="kpi-card"><div class="kpi-label">Working Days Marked</div><div class="kpi-value">${data.working_days}</div></div>
                <div class="kpi-card"><div class="kpi-label">Staff</div><div class="kpi-value">${(data.teachers || []).length}</div></div>
            </div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>Teacher</th><th>Present</th><th>Absent</th><th>Late</th><th>Leave</th><th>Attendance %</th></tr></thead>
                    <tbody>${rows || '<tr><td colspan="6" style="text-align:center">No attendance records for this period.</td></tr>'}</tbody>
                </table>
            </div>
        `;
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="loading">Failed to load staff summary.</div>';
    }
};

// ==================== TEACHER HISTORY TAB ====================
function renderStaffAttHistoryTab(body) {
    const now = new Date();
    body.innerHTML = `
        <div class="card">
            <div class="toolbar">
                <input type="text" id="staffAttHistoryTeacherId" class="filter" placeholder="Teacher ID (e.g. TCH-001)">
                <select id="staffAttHistoryMonth" class="filter">${staffAttMonthOptions(now.getMonth() + 1)}</select>
                <input type="number" id="staffAttHistoryYear" class="filter" style="width:100px;" value="${now.getFullYear()}">
                <button onclick="loadStaffAttHistory()" class="btn btn-primary btn-sm">Load History</button>
            </div>
            <div id="staffAttHistoryContainer"><div class="loading">Enter a teacher ID, month, and year to view attendance history.</div></div>
        </div>
    `;
}

window.loadStaffAttHistory = async function () {
    const teacherId = document.getElementById('staffAttHistoryTeacherId')?.value.trim();
    const month = document.getElementById('staffAttHistoryMonth')?.value;
    const year = document.getElementById('staffAttHistoryYear')?.value;
    const container = document.getElementById('staffAttHistoryContainer');

    if (!teacherId || !month || !year) {
        showAlert('Please enter teacher ID, month, and year', 'error');
        return;
    }

    container.innerHTML = '<div class="loading">Loading history...</div>';

    try {
        const data = await fetchAPI(`/staff-attendance/teacher/${encodeURIComponent(teacherId)}?month=${month}&year=${year}`);
        const rows = (data.records || []).map(r => `
            <tr>
                <td>${r.date}</td>
                <td><span class="badge ${STAFF_ATT_STATUS_BADGE[r.status] || 'badge-red'}">${escapeHtml(r.status)}</span></td>
                <td>${escapeHtml(r.remarks || '-')}</td>
            </tr>
        `).join('');

        container.innerHTML = `
            <div class="kpi-grid">
                <div class="kpi-card"><div class="kpi-label">Present</div><div class="kpi-value" style="color:var(--green)">${data.present_count}</div></div>
                <div class="kpi-card"><div class="kpi-label">Absent</div><div class="kpi-value" style="color:var(--red)">${data.absent_count}</div></div>
                <div class="kpi-card"><div class="kpi-label">Late</div><div class="kpi-value">${data.late_count}</div></div>
                <div class="kpi-card"><div class="kpi-label">Leave</div><div class="kpi-value">${data.leave_count}</div></div>
                <div class="kpi-card"><div class="kpi-label">Attendance %</div><div class="kpi-value">${data.attendance_percentage}%</div></div>
            </div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>Date</th><th>Status</th><th>Remarks</th></tr></thead>
                    <tbody>${rows || '<tr><td colspan="3" style="text-align:center">No records for this period.</td></tr>'}</tbody>
                </table>
            </div>
        `;
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="loading">Failed to load teacher history. Check the teacher ID and try again.</div>';
    }
};
