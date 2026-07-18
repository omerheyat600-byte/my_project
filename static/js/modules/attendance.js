// ============================================
// ATTENDANCE.JS — Daily attendance marking,
// class monthly summary, and per-student history.
// ============================================

let attRosterState = {};      // { student_id: { status, remarks } }
let attCurrentClassId = null;
let attCurrentDate = null;

const ATT_STATUSES = ['Present', 'Absent', 'Late', 'Leave'];
const ATT_STATUS_BADGE = {
    Present: 'badge-green',
    Late: 'badge-yellow',
    Leave: 'badge-blue',
    Absent: 'badge-red',
};

function attTodayISO() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
}

// ==================== PAGE ENTRY ====================
async function loadAttendance() {
    try {
        const data = await fetchAPI('/classes');
        window.attClassesList = data.classes || [];

        const html = `
            <div class="page-header">
                <div class="page-title">Attendance</div>
                <div class="page-sub">Mark daily attendance and review attendance history.</div>
            </div>
            <div class="card" style="margin-bottom:16px;">
                <div class="toolbar">
                    <button onclick="showAttendanceTab('mark')" id="attTabBtn-mark" class="btn btn-primary btn-sm">Mark Attendance</button>
                    <button onclick="showAttendanceTab('classSummary')" id="attTabBtn-classSummary" class="btn btn-ghost btn-sm">Class Summary</button>
                    <button onclick="showAttendanceTab('studentHistory')" id="attTabBtn-studentHistory" class="btn btn-ghost btn-sm">Student History</button>
                </div>
            </div>
            <div id="attendanceTabBody"></div>
        `;
        document.getElementById('page-content').innerHTML = html;
        showAttendanceTab('mark');
    } catch (e) {
        console.error(e);
        document.getElementById('page-content').innerHTML = '<div class="loading">Failed to load attendance.</div>';
    }
}

window.showAttendanceTab = function (tab) {
    ['mark', 'classSummary', 'studentHistory'].forEach(t => {
        const btn = document.getElementById(`attTabBtn-${t}`);
        if (btn) btn.className = (t === tab) ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
    });

    const body = document.getElementById('attendanceTabBody');
    if (!body) return;

    if (tab === 'mark') renderAttMarkTab(body);
    if (tab === 'classSummary') renderAttClassSummaryTab(body);
    if (tab === 'studentHistory') renderAttStudentHistoryTab(body);
};

// ==================== CLASS DROPDOWN (shared) ====================
function attClassOptions(selectedId) {
    return (window.attClassesList || []).map(c =>
        `<option value="${c.id}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(c.class_name)}</option>`
    ).join('');
}

// ==================== MARK ATTENDANCE TAB ====================
function renderAttMarkTab(body) {
    const today = attTodayISO();
    body.innerHTML = `
        <div class="card">
            <div class="toolbar">
                <select id="attClassSelect" class="filter">
                    <option value="">Select class</option>
                    ${attClassOptions()}
                </select>
                <input type="date" id="attDate" class="filter" value="${today}">
                <button onclick="loadAttRoster()" class="btn btn-ghost btn-sm">Load Roster</button>
                <button onclick="attMarkAllPresent()" class="btn btn-ghost btn-sm">Mark All Present</button>
                <button onclick="saveAttendance()" class="btn btn-primary">Save Attendance</button>
            </div>
            <div id="attRosterContainer"><div class="loading">Select a class and date, then click "Load Roster".</div></div>
        </div>
    `;
}

window.loadAttRoster = async function () {
    const classId = document.getElementById('attClassSelect')?.value;
    const date = document.getElementById('attDate')?.value;
    const container = document.getElementById('attRosterContainer');

    if (!classId || !date) {
        showAlert('Please select a class and date', 'error');
        return;
    }

    attCurrentClassId = classId;
    attCurrentDate = date;
    container.innerHTML = '<div class="loading">Loading roster...</div>';

    try {
        const data = await fetchAPI(`/attendance/roster?class_id=${classId}&date=${date}`);
        attRosterState = {};
        (data.students || []).forEach(s => {
            attRosterState[s.student_id] = {
                status: s.status || 'Present',
                remarks: s.remarks || '',
                student_name: s.student_name,
            };
        });
        renderAttRosterTable(data);
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="loading">Failed to load roster.</div>';
    }
};

function renderAttRosterTable(data) {
    const container = document.getElementById('attRosterContainer');
    const students = data.students || [];

    if (!students.length) {
        container.innerHTML = '<div class="loading">No students found in this class.</div>';
        return;
    }

    const rows = students.map(s => {
        const state = attRosterState[s.student_id] || { status: 'Present', remarks: '' };
        const buttons = ATT_STATUSES.map(st => {
            const active = state.status === st ? 'btn-primary' : 'btn-ghost';
            return `<button type="button" class="btn ${active} btn-sm" onclick="attSetStatus('${s.student_id}','${st}')">${st}</button>`;
        }).join(' ');

        return `<tr>
            <td>${escapeHtml(s.student_name)}</td>
            <td id="attStatusBtns-${s.student_id}">${buttons}</td>
            <td><input type="text" placeholder="Remarks (optional)" value="${escapeHtml(state.remarks || '')}"
                onchange="attSetRemarks('${s.student_id}', this.value)" style="width:100%;"></td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <div style="margin:10px 0; color:var(--muted); font-size:13px;">
            <strong>${escapeHtml(data.class_name)}</strong> — ${data.date} — ${students.length} student(s)
        </div>
        <div class="table-wrap">
            <table class="data-table">
                <thead><tr><th>Student</th><th>Status</th><th>Remarks</th></tr></thead>
                <tbody id="attRosterTableBody">${rows}</tbody>
            </table>
        </div>
    `;
}

window.attSetStatus = function (studentId, status) {
    if (!attRosterState[studentId]) attRosterState[studentId] = {};
    attRosterState[studentId].status = status;

    const cell = document.getElementById(`attStatusBtns-${studentId}`);
    if (cell) {
        cell.innerHTML = ATT_STATUSES.map(st => {
            const active = status === st ? 'btn-primary' : 'btn-ghost';
            return `<button type="button" class="btn ${active} btn-sm" onclick="attSetStatus('${studentId}','${st}')">${st}</button>`;
        }).join(' ');
    }
};

window.attSetRemarks = function (studentId, value) {
    if (!attRosterState[studentId]) attRosterState[studentId] = {};
    attRosterState[studentId].remarks = value;
};

window.attMarkAllPresent = function () {
    Object.keys(attRosterState).forEach(id => attSetStatus(id, 'Present'));
    if (!Object.keys(attRosterState).length) {
        showAlert('Load a roster first', 'error');
    }
};

window.saveAttendance = async function () {
    if (!attCurrentClassId || !attCurrentDate) {
        showAlert('Please load a roster first', 'error');
        return;
    }

    const records = Object.entries(attRosterState).map(([student_id, s]) => ({
        student_id,
        student_name: s.student_name,
        status: s.status || 'Present',
        remarks: s.remarks || '',
    }));

    if (!records.length) {
        showAlert('No students to mark', 'error');
        return;
    }

    try {
        await fetchAPI('/attendance/mark', {
            method: 'POST',
            body: JSON.stringify({ class_id: parseInt(attCurrentClassId), date: attCurrentDate, records }),
        });
        showAlert('Attendance saved successfully');
    } catch (e) {
        console.error(e);
    }
};

// ==================== CLASS SUMMARY TAB ====================
function renderAttClassSummaryTab(body) {
    const now = new Date();
    body.innerHTML = `
        <div class="card">
            <div class="toolbar">
                <select id="attSummaryClass" class="filter">
                    <option value="">Select class</option>
                    ${attClassOptions()}
                </select>
                <select id="attSummaryMonth" class="filter">${attMonthOptions(now.getMonth() + 1)}</select>
                <input type="number" id="attSummaryYear" class="filter" style="width:100px;" value="${now.getFullYear()}">
                <button onclick="loadAttClassSummary()" class="btn btn-primary btn-sm">Load Summary</button>
            </div>
            <div id="attClassSummaryContainer"><div class="loading">Select a class, month, and year to view attendance summary.</div></div>
        </div>
    `;
}

function attMonthOptions(selected) {
    const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return names.map((n, i) => `<option value="${i + 1}" ${i + 1 === selected ? 'selected' : ''}>${n}</option>`).join('');
}

window.loadAttClassSummary = async function () {
    const classId = document.getElementById('attSummaryClass')?.value;
    const month = document.getElementById('attSummaryMonth')?.value;
    const year = document.getElementById('attSummaryYear')?.value;
    const container = document.getElementById('attClassSummaryContainer');

    if (!classId || !month || !year) {
        showAlert('Please select class, month, and year', 'error');
        return;
    }

    container.innerHTML = '<div class="loading">Loading summary...</div>';

    try {
        const data = await fetchAPI(`/attendance/summary?class_id=${classId}&month=${month}&year=${year}`);
        const rows = (data.students || []).map(s => `
            <tr>
                <td>${escapeHtml(s.student_name)}</td>
                <td style="text-align:center">${s.present_count}</td>
                <td style="text-align:center">${s.absent_count}</td>
                <td style="text-align:center">${s.late_count}</td>
                <td style="text-align:center">${s.leave_count}</td>
                <td style="text-align:center"><span class="badge ${s.attendance_percentage >= 75 ? 'badge-green' : 'badge-red'}">${s.attendance_percentage}%</span></td>
            </tr>
        `).join('');

        container.innerHTML = `
            <div class="kpi-grid">
                <div class="kpi-card"><div class="kpi-label">Class</div><div class="kpi-value">${escapeHtml(data.class_name)}</div></div>
                <div class="kpi-card"><div class="kpi-label">Working Days Marked</div><div class="kpi-value">${data.working_days}</div></div>
                <div class="kpi-card"><div class="kpi-label">Students</div><div class="kpi-value">${(data.students || []).length}</div></div>
            </div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>Student</th><th>Present</th><th>Absent</th><th>Late</th><th>Leave</th><th>Attendance %</th></tr></thead>
                    <tbody>${rows || '<tr><td colspan="6" style="text-align:center">No attendance records for this period.</td></tr>'}</tbody>
                </table>
            </div>
        `;
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="loading">Failed to load class summary.</div>';
    }
};

// ==================== STUDENT HISTORY TAB ====================
function renderAttStudentHistoryTab(body) {
    const now = new Date();
    body.innerHTML = `
        <div class="card">
            <div class="toolbar">
                <input type="text" id="attHistoryStudentId" class="filter" placeholder="Student ID (e.g. STU-001)">
                <select id="attHistoryMonth" class="filter">${attMonthOptions(now.getMonth() + 1)}</select>
                <input type="number" id="attHistoryYear" class="filter" style="width:100px;" value="${now.getFullYear()}">
                <button onclick="loadAttStudentHistory()" class="btn btn-primary btn-sm">Load History</button>
            </div>
            <div id="attStudentHistoryContainer"><div class="loading">Enter a student ID, month, and year to view attendance history.</div></div>
        </div>
    `;
}

window.loadAttStudentHistory = async function () {
    const studentId = document.getElementById('attHistoryStudentId')?.value.trim();
    const month = document.getElementById('attHistoryMonth')?.value;
    const year = document.getElementById('attHistoryYear')?.value;
    const container = document.getElementById('attStudentHistoryContainer');

    if (!studentId || !month || !year) {
        showAlert('Please enter student ID, month, and year', 'error');
        return;
    }

    container.innerHTML = '<div class="loading">Loading history...</div>';

    try {
        const data = await fetchAPI(`/attendance/student/${encodeURIComponent(studentId)}?month=${month}&year=${year}`);
        const rows = (data.records || []).map(r => `
            <tr>
                <td>${r.date}</td>
                <td><span class="badge ${ATT_STATUS_BADGE[r.status] || 'badge-red'}">${escapeHtml(r.status)}</span></td>
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
        container.innerHTML = '<div class="loading">Failed to load student history. Check the student ID and try again.</div>';
    }
};
