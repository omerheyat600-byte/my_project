// ============================================
// TIMETABLE.JS — Weekly class timetable grid,
// slot editor modal, and per-teacher schedule view.
// ============================================

let ttCurrentClassId = null;
let ttCurrentData = null;

// ==================== PAGE ENTRY ====================
async function loadTimetable() {
    try {
        const [classesData, teachersData] = await Promise.all([
            fetchAPI('/classes'),
            fetchAPI('/teachers/list'),
        ]);
        window.ttClassesList = classesData.classes || [];
        window.ttTeachersList = teachersData.teachers || [];

        const html = `
            <div class="page-header">
                <div class="page-title">Timetable</div>
                <div class="page-sub">Weekly class schedules and teacher assignments.</div>
            </div>
            <div class="card" style="margin-bottom:16px;">
                <div class="toolbar">
                    <button onclick="showTimetableTab('class')" id="ttTabBtn-class" class="btn btn-primary btn-sm">Class Timetable</button>
                    <button onclick="showTimetableTab('teacher')" id="ttTabBtn-teacher" class="btn btn-ghost btn-sm">Teacher View</button>
                </div>
            </div>
            <div id="timetableTabBody"></div>

            <div id="ttSlotModal" class="modal-overlay">
                <div class="modal">
                    <div class="modal-header"><h2 id="ttSlotModalTitle">Edit Period</h2><span class="close-btn" onclick="closeTtSlotModal()">&times;</span></div>
                    <div class="modal-body">
                        <form id="ttSlotForm" onsubmit="event.preventDefault(); saveTtSlot();">
                            <input type="hidden" id="ttSlotClassId">
                            <input type="hidden" id="ttSlotDay">
                            <input type="hidden" id="ttSlotPeriod">
                            <div class="form-grid">
                                <div class="form-group full">
                                    <label id="ttSlotLabel">Monday — Period 1</label>
                                </div>
                                <div class="form-group">
                                    <label for="ttSlotSubject">Subject *</label>
                                    <select id="ttSlotSubject"></select>
                                </div>
                                <div class="form-group">
                                    <label for="ttSlotTeacher">Teacher</label>
                                    <select id="ttSlotTeacher"><option value="">-- None --</option></select>
                                </div>
                                <div class="form-group">
                                    <label for="ttSlotStart">Start Time</label>
                                    <input type="time" id="ttSlotStart">
                                </div>
                                <div class="form-group">
                                    <label for="ttSlotEnd">End Time</label>
                                    <input type="time" id="ttSlotEnd">
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-danger" onclick="deleteTtSlot()">Clear Period</button>
                                <button type="button" class="btn btn-ghost" onclick="closeTtSlotModal()">Cancel</button>
                                <button type="submit" class="btn btn-primary">Save Period</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('page-content').innerHTML = html;
        showTimetableTab('class');
    } catch (e) {
        console.error(e);
        document.getElementById('page-content').innerHTML = '<div class="loading">Failed to load timetable.</div>';
    }
}

window.showTimetableTab = function (tab) {
    ['class', 'teacher'].forEach(t => {
        const btn = document.getElementById(`ttTabBtn-${t}`);
        if (btn) btn.className = (t === tab) ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
    });
    const body = document.getElementById('timetableTabBody');
    if (!body) return;
    if (tab === 'class') renderTtClassTab(body);
    if (tab === 'teacher') renderTtTeacherTab(body);
};

function ttClassOptions(selectedId) {
    return (window.ttClassesList || []).map(c =>
        `<option value="${c.id}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(c.class_name)}</option>`
    ).join('');
}

function ttTeacherOptions(selectedId) {
    return (window.ttTeachersList || []).map(t =>
        `<option value="${t.id}" ${String(t.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(t.name)}</option>`
    ).join('');
}

// ==================== CLASS TIMETABLE TAB ====================
function renderTtClassTab(body) {
    body.innerHTML = `
        <div class="card">
            <div class="toolbar">
                <select id="ttClassSelect" class="filter">
                    <option value="">Select class</option>
                    ${ttClassOptions()}
                </select>
                <button onclick="loadTtGrid()" class="btn btn-ghost btn-sm">Load Timetable</button>
                <button onclick="ttAddPeriodRow()" class="btn btn-ghost btn-sm">+ Add Period Row</button>
            </div>
            <div id="ttGridContainer"><div class="loading">Select a class, then click "Load Timetable".</div></div>
        </div>
    `;
}

window.loadTtGrid = async function () {
    const classId = document.getElementById('ttClassSelect')?.value;
    const container = document.getElementById('ttGridContainer');
    if (!classId) {
        showAlert('Please select a class', 'error');
        return;
    }
    ttCurrentClassId = classId;
    container.innerHTML = '<div class="loading">Loading timetable...</div>';

    try {
        const data = await fetchAPI(`/timetable/class/${classId}`);
        ttCurrentData = data;
        renderTtGrid();
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="loading">Failed to load timetable.</div>';
    }
};

window.ttAddPeriodRow = function () {
    if (!ttCurrentData) {
        showAlert('Load a class timetable first', 'error');
        return;
    }
    ttCurrentData.max_period += 1;
    renderTtGrid();
};

function ttFindSlot(day, period) {
    return (ttCurrentData.slots || []).find(s => s.day_of_week === day && s.period_number === period);
}

function renderTtGrid() {
    const container = document.getElementById('ttGridContainer');
    const data = ttCurrentData;
    const days = data.days;

    let headerCells = days.map(d => `<th>${d}</th>`).join('');
    let bodyRows = '';
    for (let p = 1; p <= data.max_period; p++) {
        let cells = days.map(day => {
            const slot = ttFindSlot(day, p);
            if (slot) {
                return `<td class="tt-cell tt-filled" onclick="openTtSlotModal('${day}', ${p})">
                    <div style="font-weight:600;">${escapeHtml(slot.subject)}</div>
                    <div style="font-size:12px; color:var(--muted);">${escapeHtml(slot.teacher_name || '-')}</div>
                    ${slot.start_time ? `<div style="font-size:11px; color:var(--muted);">${slot.start_time}${slot.end_time ? ' - ' + slot.end_time : ''}</div>` : ''}
                </td>`;
            }
            return `<td class="tt-cell tt-empty" onclick="openTtSlotModal('${day}', ${p})">+ Add</td>`;
        }).join('');
        bodyRows += `<tr><td style="font-weight:600; text-align:center;">P${p}</td>${cells}</tr>`;
    }

    container.innerHTML = `
        <div style="margin:10px 0; color:var(--muted); font-size:13px;"><strong>${escapeHtml(data.class_name)}</strong></div>
        <style>
            .tt-cell { cursor:pointer; padding:10px; border:1px solid var(--border); vertical-align:top; min-width:120px; }
            .tt-cell.tt-empty { color:var(--muted); text-align:center; }
            .tt-cell.tt-filled:hover, .tt-cell.tt-empty:hover { background:var(--card2); }
        </style>
        <div class="table-wrap">
            <table class="data-table">
                <thead><tr><th>Period</th>${headerCells}</tr></thead>
                <tbody>${bodyRows}</tbody>
            </table>
        </div>
    `;
}

window.openTtSlotModal = async function (day, period) {
    if (!ttCurrentClassId) return;

    document.getElementById('ttSlotClassId').value = ttCurrentClassId;
    document.getElementById('ttSlotDay').value = day;
    document.getElementById('ttSlotPeriod').value = period;
    document.getElementById('ttSlotLabel').innerText = `${day} — Period ${period}`;

    // Populate subject dropdown from this class's assigned subjects
    const subjectSelect = document.getElementById('ttSlotSubject');
    subjectSelect.innerHTML = '<option value="">Loading subjects...</option>';
    try {
        const subjData = await fetchAPI(`/classes/${ttCurrentClassId}/subjects`);
        const subjects = subjData.subjects || [];
        subjectSelect.innerHTML = subjects.length
            ? subjects.map(s => `<option value="${escapeHtml(s.subject_name)}">${escapeHtml(s.subject_name)}</option>`).join('')
            : '<option value="">No subjects assigned to this class</option>';
    } catch (e) {
        subjectSelect.innerHTML = '<option value="">Failed to load subjects</option>';
    }

    document.getElementById('ttSlotTeacher').innerHTML = '<option value="">-- None --</option>' + ttTeacherOptions();

    const existing = ttFindSlot(day, period);
    if (existing) {
        document.getElementById('ttSlotModalTitle').innerText = 'Edit Period';
        subjectSelect.value = existing.subject;
        document.getElementById('ttSlotTeacher').value = existing.teacher_id || '';
        document.getElementById('ttSlotStart').value = existing.start_time || '';
        document.getElementById('ttSlotEnd').value = existing.end_time || '';
    } else {
        document.getElementById('ttSlotModalTitle').innerText = 'Add Period';
        document.getElementById('ttSlotStart').value = '';
        document.getElementById('ttSlotEnd').value = '';
    }

    document.getElementById('ttSlotModal').classList.add('active');
};

window.closeTtSlotModal = function () {
    document.getElementById('ttSlotModal').classList.remove('active');
};

window.saveTtSlot = async function () {
    const teacherSelect = document.getElementById('ttSlotTeacher');
    const teacherId = teacherSelect.value;
    const teacherName = teacherId ? teacherSelect.options[teacherSelect.selectedIndex].text : null;

    const payload = {
        class_id: parseInt(document.getElementById('ttSlotClassId').value),
        day_of_week: document.getElementById('ttSlotDay').value,
        period_number: parseInt(document.getElementById('ttSlotPeriod').value),
        subject: document.getElementById('ttSlotSubject').value,
        teacher_id: teacherId || null,
        teacher_name: teacherName,
        start_time: document.getElementById('ttSlotStart').value || null,
        end_time: document.getElementById('ttSlotEnd').value || null,
    };

    if (!payload.subject) {
        showAlert('Please select a subject', 'error');
        return;
    }

    try {
        await fetchAPI('/timetable/slot', { method: 'POST', body: JSON.stringify(payload) });
        showAlert('Period saved');
        closeTtSlotModal();
        await loadTtGrid();
    } catch (e) {
        console.error(e);
    }
};

window.deleteTtSlot = async function () {
    const classId = document.getElementById('ttSlotClassId').value;
    const day = document.getElementById('ttSlotDay').value;
    const period = document.getElementById('ttSlotPeriod').value;

    try {
        await fetchAPI(`/timetable/slot/${classId}/${day}/${period}`, { method: 'DELETE' });
        showAlert('Period cleared');
        closeTtSlotModal();
        await loadTtGrid();
    } catch (e) {
        console.error(e);
    }
};

// ==================== TEACHER VIEW TAB ====================
function renderTtTeacherTab(body) {
    body.innerHTML = `
        <div class="card">
            <div class="toolbar">
                <select id="ttTeacherSelect" class="filter">
                    <option value="">Select teacher</option>
                    ${ttTeacherOptions()}
                </select>
                <button onclick="loadTtTeacherSchedule()" class="btn btn-primary btn-sm">Load Schedule</button>
            </div>
            <div id="ttTeacherScheduleContainer"><div class="loading">Select a teacher to view their weekly schedule.</div></div>
        </div>
    `;
}

window.loadTtTeacherSchedule = async function () {
    const teacherId = document.getElementById('ttTeacherSelect')?.value;
    const container = document.getElementById('ttTeacherScheduleContainer');
    if (!teacherId) {
        showAlert('Please select a teacher', 'error');
        return;
    }
    container.innerHTML = '<div class="loading">Loading schedule...</div>';

    try {
        const data = await fetchAPI(`/timetable/teacher/${teacherId}`);
        const slots = data.slots || [];
        if (!slots.length) {
            container.innerHTML = '<div class="loading">No periods assigned to this teacher yet.</div>';
            return;
        }
        const rows = slots.map(s => `
            <tr>
                <td>${escapeHtml(s.day_of_week)}</td>
                <td style="text-align:center">${s.period_number}</td>
                <td>${escapeHtml(s.class_name)}</td>
                <td>${escapeHtml(s.subject)}</td>
                <td>${s.start_time ? `${s.start_time} - ${s.end_time || ''}` : '-'}</td>
            </tr>
        `).join('');
        container.innerHTML = `
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>Day</th><th>Period</th><th>Class</th><th>Subject</th><th>Time</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="loading">Failed to load teacher schedule.</div>';
    }
};
