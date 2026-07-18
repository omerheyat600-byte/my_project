// ============================================
// EXAMINATION.JS — Examination Module.
// Date Sheet, Seating Plan, Admit Card, Result
// Lock/Publish, Grace Marks, GPA/CGPA, Position
// Holders, Merit List — all built on top of the
// existing exam-session subsystem (results.js).
// ============================================

let examCtx = { classId: '', term: 'Term 1', year: String(new Date().getFullYear()), examId: null, className: '' };
let currentExamTab = 'datesheet';
const EXAM_TABS = [
    { key: 'datesheet', label: '🗓️ Date Sheet' },
    { key: 'seating', label: '🪑 Seating Plan' },
    { key: 'admitcard', label: '🪪 Admit Card' },
    { key: 'lockpublish', label: '🔒 Result Lock/Publish' },
    { key: 'gracemarks', label: '➕ Grace Marks' },
    { key: 'gpa', label: '🎯 GPA/CGPA' },
    { key: 'positions', label: '🏆 Position Holders' },
    { key: 'meritlist', label: '📋 Merit List' },
];

async function loadExamination() {
    let classes = [];
    try {
        const classesData = await fetchAPI('/classes');
        classes = classesData.classes || [];
    } catch (e) { /* ignore */ }

    if (!examCtx.classId && classes.length) examCtx.classId = classes[0].id;

    const html = `
        <div class="page-header">
            <div class="page-title">Examination Module</div>
            <div class="page-sub">Date sheets, seating plans, admit cards, result lock/publish, grace marks, GPA/CGPA, position holders and the school merit list.</div>
        </div>

        <div class="card" style="margin-bottom: 16px;">
            <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:center; background: var(--card2); padding: 10px 16px; border-radius: 8px;">
                <label style="color:#94a3b8; font-weight:500; font-size:13px;">Class:</label>
                <select id="examClassSelect" class="filter" style="min-width:160px;">
                    ${classes.map(c => `<option value="${c.id}" ${String(c.id) === String(examCtx.classId) ? 'selected' : ''}>${escapeHtml(c.class_name)}</option>`).join('')}
                </select>

                <label style="color:#94a3b8; font-weight:500; font-size:13px;">Term:</label>
                <select id="examTermSelect" class="filter" style="min-width:100px;">
                    ${['Term 1', 'Term 2', 'Term 3', 'Annual'].map(t => `<option ${t === examCtx.term ? 'selected' : ''}>${t}</option>`).join('')}
                </select>

                <label style="color:#94a3b8; font-weight:500; font-size:13px;">Year:</label>
                <input type="text" id="examYearSelect" value="${escapeHtml(examCtx.year)}" class="filter" style="width:80px; text-align:center;">

                <button class="btn btn-primary" onclick="loadExamContext()">📂 Load Exam</button>
                <span id="examStatusBadges" style="margin-left:auto;"></span>
            </div>
        </div>

        <div class="toolbar no-print" id="examTabBar" style="flex-wrap:wrap;">
            ${EXAM_TABS.map(t => `<button onclick="switchExamTab('${t.key}')" id="examTab_${t.key}" class="btn ${t.key === currentExamTab ? 'btn-primary' : 'btn-ghost'} btn-sm">${t.label}</button>`).join('')}
        </div>

        <div id="examTabContent"><div class="loading">Loading…</div></div>
    `;
    document.getElementById('page-content').innerHTML = html;
    await loadExamContext();
}

window.loadExamContext = async function() {
    const classId = document.getElementById('examClassSelect')?.value;
    const term = document.getElementById('examTermSelect')?.value;
    const year = document.getElementById('examYearSelect')?.value;

    if (!classId || !term || !year) {
        showAlert('Please select class, term, and year.', 'error');
        return;
    }

    examCtx.classId = classId;
    examCtx.term = term;
    examCtx.year = year;

    const box = document.getElementById('examTabContent');
    box.innerHTML = '<div class="loading">Loading exam…</div>';

    try {
        const sheet = await fetchAPI(`/exam/class/${classId}/marksheet?term=${encodeURIComponent(term)}&year=${encodeURIComponent(year)}`);
        examCtx.examId = sheet.exam_id;
        examCtx.className = sheet.class_name;
        await renderExamStatusBadges();
        await switchExamTab(currentExamTab);
    } catch (e) {
        console.error(e);
        box.innerHTML = '<div class="loading">Failed to load this class/term/year.</div>';
    }
};

async function renderExamStatusBadges() {
    const el = document.getElementById('examStatusBadges');
    if (!el || !examCtx.examId) return;
    try {
        const status = await fetchAPI(`/exam/${examCtx.examId}/status`);
        el.innerHTML = `
            <span class="badge ${status.result_locked ? 'badge-red' : 'badge-green'}">${status.result_locked ? '🔒 Locked' : '🔓 Unlocked'}</span>
            <span class="badge ${status.result_published ? 'badge-blue' : 'badge-yellow'}" style="margin-left:6px;">${status.result_published ? '📢 Published' : '📝 Draft'}</span>
        `;
    } catch (e) { el.innerHTML = ''; }
}

window.switchExamTab = async function(tab) {
    currentExamTab = tab;
    EXAM_TABS.forEach(t => {
        const btn = document.getElementById(`examTab_${t.key}`);
        if (btn) btn.className = `btn ${t.key === tab ? 'btn-primary' : 'btn-ghost'} btn-sm`;
    });

    const box = document.getElementById('examTabContent');
    box.innerHTML = '<div class="loading">Loading…</div>';

    if (tab !== 'meritlist' && !examCtx.examId) {
        box.innerHTML = '<div class="loading">Load a class, term, and year above first.</div>';
        return;
    }

    try {
        if (tab === 'datesheet') await renderDateSheetTab(box);
        else if (tab === 'seating') await renderSeatingTab(box);
        else if (tab === 'admitcard') await renderAdmitCardTab(box);
        else if (tab === 'lockpublish') await renderLockPublishTab(box);
        else if (tab === 'gracemarks') await renderGraceMarksTab(box);
        else if (tab === 'gpa') await renderGpaTab(box);
        else if (tab === 'positions') await renderPositionHoldersTab(box);
        else if (tab === 'meritlist') await renderMeritListTab(box);
    } catch (e) {
        console.error(e);
        box.innerHTML = '<div class="loading">Failed to load this tab.</div>';
    }
};

// ============================================
// DATE SHEET
// ============================================
// dsRows holds one row per subject in the loaded class, pre-filled with
// any existing date sheet entry. Everything is edited inline in the
// table (click a cell, type) — there's no more one-subject-at-a-time
// add form. The "Apply to all" bar lets a single date, time pair, or
// room be stamped onto every subject in one click instead of repeating
// the same value row by row.
let dsRows = [];

async function renderDateSheetTab(box) {
    const [dsData, subjectsData] = await Promise.all([
        fetchAPI(`/exam/${examCtx.examId}/datesheet`),
        fetchAPI(`/classes/${examCtx.classId}/subjects`)
    ]);
    const existing = dsData.datesheet || [];
    const classSubjects = (subjectsData.subjects || []).map(s => s.subject_name || s.name);

    // One row per class subject, merged with its existing entry (if any).
    dsRows = classSubjects.map(subject => {
        const match = existing.find(r => (r.subject || '').trim().toLowerCase() === subject.trim().toLowerCase());
        return match
            ? { id: match.id, subject, exam_date: match.exam_date || '', start_time: match.start_time || '', end_time: match.end_time || '', room: match.room || '' }
            : { id: null, subject, exam_date: '', start_time: '', end_time: '', room: '' };
    });
    // Keep any saved entries whose subject no longer matches the class's
    // current subject list, so nothing gets silently dropped.
    existing.forEach(r => {
        if (!classSubjects.some(s => s.trim().toLowerCase() === (r.subject || '').trim().toLowerCase())) {
            dsRows.push({ id: r.id, subject: r.subject, exam_date: r.exam_date || '', start_time: r.start_time || '', end_time: r.end_time || '', room: r.room || '' });
        }
    });

    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div class="card-title">Apply to All Subjects</div>
            <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end;">
                <div><label style="font-size:12px; color:#94a3b8;">Date</label><br>
                    <input type="date" id="dsApplyDate" class="filter"></div>
                <div><label style="font-size:12px; color:#94a3b8;">Start Time</label><br>
                    <input type="time" id="dsApplyStart" class="filter"></div>
                <div><label style="font-size:12px; color:#94a3b8;">End Time</label><br>
                    <input type="time" id="dsApplyEnd" class="filter"></div>
                <div><label style="font-size:12px; color:#94a3b8;">Room</label><br>
                    <input type="text" id="dsApplyRoom" class="filter" placeholder="Room" style="width:100px;"></div>
                <button class="btn btn-ghost btn-sm" onclick="applyDateSheetToAll('date')">📅 Apply Date to All</button>
                <button class="btn btn-ghost btn-sm" onclick="applyDateSheetToAll('time')">⏰ Apply Time to All</button>
                <button class="btn btn-ghost btn-sm" onclick="applyDateSheetToAll('room')">🚪 Apply Room to All</button>
            </div>
            <div style="color:#94a3b8; font-size:12px; margin-top:8px;">Fill in a value above and click Apply — it's stamped onto every subject below. You can still fine-tune any individual subject's date, time, or room directly in the table.</div>
            ${!classSubjects.length ? '<div style="color:#f59e0b; font-size:12px; margin-top:8px;">This class has no subjects assigned yet — add them under Classes → Subjects first.</div>' : ''}
        </div>

        <div class="card">
            <div class="card-title" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <span>Date Sheet — ${escapeHtml(examCtx.className || '')} (${escapeHtml(examCtx.term)} ${escapeHtml(examCtx.year)})</span>
                <span>
                    <button class="btn btn-primary btn-sm" onclick="saveDateSheetAll()">💾 Save Date Sheet</button>
                    <button class="btn btn-ghost btn-sm" onclick="printDateSheet()">🖨️ Print Date Sheet</button>
                </span>
            </div>
            <div class="table-wrap">
                <table class="data-table" id="dsTable">
                    <thead><tr><th>Subject</th><th>Date</th><th>Start</th><th>End</th><th>Room</th></tr></thead>
                    <tbody>
                        ${dsRows.length ? dsRows.map((r, i) => `
                            <tr>
                                <td>${escapeHtml(r.subject)}</td>
                                <td><input type="date" class="filter ds-cell" data-idx="${i}" data-field="exam_date" value="${escapeHtml(r.exam_date)}" style="width:150px;"></td>
                                <td><input type="time" class="filter ds-cell" data-idx="${i}" data-field="start_time" value="${escapeHtml(r.start_time)}" style="width:110px;"></td>
                                <td><input type="time" class="filter ds-cell" data-idx="${i}" data-field="end_time" value="${escapeHtml(r.end_time)}" style="width:110px;"></td>
                                <td><input type="text" class="filter ds-cell" data-idx="${i}" data-field="room" value="${escapeHtml(r.room)}" placeholder="Room" style="width:100px;"></td>
                            </tr>
                        `).join('') : '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">No subjects assigned to this class yet.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    box.querySelectorAll('.ds-cell').forEach(input => {
        input.addEventListener('input', () => {
            const idx = Number(input.dataset.idx);
            dsRows[idx][input.dataset.field] = input.value;
        });
    });
}

window.applyDateSheetToAll = function(kind) {
    const box = document.getElementById('dsTable');
    if (!box) return;

    if (kind === 'date') {
        const val = document.getElementById('dsApplyDate')?.value;
        if (!val) { showAlert('Pick a date to apply first.', 'error'); return; }
        dsRows.forEach((r, i) => { r.exam_date = val; setDsCell(i, 'exam_date', val); });
    } else if (kind === 'time') {
        const start = document.getElementById('dsApplyStart')?.value;
        const end = document.getElementById('dsApplyEnd')?.value;
        if (!start && !end) { showAlert('Set a start and/or end time to apply first.', 'error'); return; }
        dsRows.forEach((r, i) => {
            if (start) { r.start_time = start; setDsCell(i, 'start_time', start); }
            if (end) { r.end_time = end; setDsCell(i, 'end_time', end); }
        });
    } else if (kind === 'room') {
        const val = document.getElementById('dsApplyRoom')?.value.trim();
        if (!val) { showAlert('Enter a room to apply first.', 'error'); return; }
        dsRows.forEach((r, i) => { r.room = val; setDsCell(i, 'room', val); });
    }
};

function setDsCell(idx, field, value) {
    const input = document.querySelector(`.ds-cell[data-idx="${idx}"][data-field="${field}"]`);
    if (input) input.value = value;
}

window.saveDateSheetAll = async function() {
    const rows = dsRows
        .filter(r => r.subject && r.exam_date)
        .map(r => ({ id: r.id, subject: r.subject, exam_date: r.exam_date, start_time: r.start_time, end_time: r.end_time, room: r.room }));

    if (!rows.length) { showAlert('Set at least one subject\'s date before saving.', 'error'); return; }

    try {
        await fetchAPI(`/exam/${examCtx.examId}/datesheet/bulk`, {
            method: 'POST',
            body: JSON.stringify({ rows })
        });
        showAlert('Date sheet saved.', 'success');
        await switchExamTab('datesheet');
    } catch (e) {
        showAlert(e.message || 'Failed to save date sheet.', 'error');
    }
};

window.printDateSheet = async function() {
    const data = await fetchAPI(`/exam/${examCtx.examId}/datesheet`);
    const rows = data.datesheet || [];
    const body = `
        <p><strong>Class:</strong> ${escapeHtml(examCtx.className || '')} &nbsp; <strong>${escapeHtml(examCtx.term)} ${escapeHtml(examCtx.year)}</strong></p>
        <table class="data-table">
            <thead><tr><th>Subject</th><th>Date</th><th>Start</th><th>End</th><th>Room</th></tr></thead>
            <tbody>${rows.map(r => `<tr><td>${escapeHtml(r.subject)}</td><td>${escapeHtml(r.exam_date || '-')}</td><td>${escapeHtml(r.start_time || '-')}</td><td>${escapeHtml(r.end_time || '-')}</td><td>${escapeHtml(r.room || '-')}</td></tr>`).join('')}</tbody>
        </table>
    `;
    printPreview(body, 'Examination Date Sheet');
};

// ============================================
// SEATING PLAN
// ============================================
let seatingRoomRows = 1;

async function renderSeatingTab(box) {
    const data = await fetchAPI(`/exam/${examCtx.examId}/seating`);
    const rows = data.seating || [];

    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div class="card-title">Generate Seating Plan</div>
            <div id="seatingRoomInputs">
                <div style="display:flex; gap:10px; margin-bottom:8px;">
                    <input type="text" class="filter seating-room-name" placeholder="Room name (e.g. Hall A)" style="min-width:180px;">
                    <input type="number" class="filter seating-room-capacity" placeholder="Capacity" style="width:100px;">
                </div>
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <button class="btn btn-ghost btn-sm" onclick="addSeatingRoomRow()">➕ Add Room</button>
                <button class="btn btn-primary" onclick="generateSeatingPlan()">🎲 Generate Seating Plan</button>
                <button class="btn btn-ghost" onclick="printSeatingPlan()">🖨️ Print Seating Plan</button>
                <button class="btn btn-danger" onclick="clearSeatingPlan()">🗑 Clear Plan</button>
            </div>
        </div>

        <div class="card">
            <div class="card-title">Seating Plan — ${escapeHtml(examCtx.className || '')} (${escapeHtml(examCtx.term)} ${escapeHtml(examCtx.year)})</div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>Student ID</th><th>Student Name</th><th>Room</th><th>Seat No.</th></tr></thead>
                    <tbody>
                        ${rows.length ? rows.map(r => `
                            <tr><td>${escapeHtml(r.student_id)}</td><td>${escapeHtml(r.student_name || '-')}</td><td>${escapeHtml(r.room || '-')}</td><td>${escapeHtml(r.seat_no || '-')}</td></tr>
                        `).join('') : '<tr><td colspan="4" style="text-align:center; color:#94a3b8;">No seating plan generated yet.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    seatingRoomRows = 1;
}

window.addSeatingRoomRow = function() {
    const container = document.getElementById('seatingRoomInputs');
    if (!container) return;
    const div = document.createElement('div');
    div.style.cssText = 'display:flex; gap:10px; margin-bottom:8px;';
    div.innerHTML = `
        <input type="text" class="filter seating-room-name" placeholder="Room name" style="min-width:180px;">
        <input type="number" class="filter seating-room-capacity" placeholder="Capacity" style="width:100px;">
    `;
    container.appendChild(div);
    seatingRoomRows++;
};

window.generateSeatingPlan = async function() {
    const names = document.querySelectorAll('.seating-room-name');
    const caps = document.querySelectorAll('.seating-room-capacity');
    const rooms = [];
    names.forEach((el, i) => {
        const room = el.value.trim();
        const capacity = parseInt(caps[i]?.value || '0', 10);
        if (room) rooms.push({ room, capacity });
    });

    if (!rooms.length) { showAlert('Add at least one room.', 'error'); return; }

    try {
        await fetchAPI(`/exam/${examCtx.examId}/seating/generate`, {
            method: 'POST',
            body: JSON.stringify({ rooms })
        });
        showAlert('Seating plan generated.', 'success');
        await switchExamTab('seating');
    } catch (e) {
        showAlert(e.message || 'Failed to generate seating plan.', 'error');
    }
};

window.clearSeatingPlan = async function() {
    if (!confirm('Clear the entire seating plan for this exam?')) return;
    try {
        await fetchAPI(`/exam/${examCtx.examId}/seating`, { method: 'DELETE' });
        showAlert('Seating plan cleared.', 'success');
        await switchExamTab('seating');
    } catch (e) {
        showAlert('Failed to clear seating plan.', 'error');
    }
};

window.printSeatingPlan = async function() {
    const data = await fetchAPI(`/exam/${examCtx.examId}/seating`);
    const rows = data.seating || [];
    const body = `
        <p><strong>Class:</strong> ${escapeHtml(examCtx.className || '')} &nbsp; <strong>${escapeHtml(examCtx.term)} ${escapeHtml(examCtx.year)}</strong></p>
        <table class="data-table">
            <thead><tr><th>Student ID</th><th>Student Name</th><th>Room</th><th>Seat No.</th></tr></thead>
            <tbody>${rows.map(r => `<tr><td>${escapeHtml(r.student_id)}</td><td>${escapeHtml(r.student_name || '-')}</td><td>${escapeHtml(r.room || '-')}</td><td>${escapeHtml(r.seat_no || '-')}</td></tr>`).join('')}</tbody>
        </table>
    `;
    printPreview(body, 'Examination Seating Plan');
};

// ============================================
// ADMIT CARD
// ============================================
async function renderAdmitCardTab(box) {
    const sheet = await fetchAPI(`/exam/class/${examCtx.classId}/marksheet?term=${encodeURIComponent(examCtx.term)}&year=${encodeURIComponent(examCtx.year)}`);
    const students = sheet.students || [];

    box.innerHTML = `
        <div class="card">
            <div class="card-title">Admit Cards — ${escapeHtml(examCtx.className || '')} (${escapeHtml(examCtx.term)} ${escapeHtml(examCtx.year)})</div>
            <div style="display:flex; gap:10px; align-items:center; margin-bottom:14px; flex-wrap:wrap;">
                <select id="admitCardStudent" class="filter" style="min-width:220px;">
                    ${students.map(s => `<option value="${escapeHtml(s.student_id)}">${escapeHtml(s.name)} (${escapeHtml(s.student_id)})</option>`).join('')}
                </select>
                <button class="btn btn-primary" onclick="printSingleAdmitCard()">🪪 Print Admit Card</button>
                <button class="btn btn-ghost" onclick="printAllAdmitCards()">🖨️ Print All Admit Cards</button>
            </div>
            <div style="color:#94a3b8; font-size:13px;">Admit cards include the student's seat/room (from the Seating Plan tab) and the full date sheet, so generate those first for a complete card.</div>
        </div>
    `;
}

function admitCardHtml(card) {
    const dsRows = (card.datesheet || []).map(d => `<tr><td>${escapeHtml(d.subject)}</td><td>${escapeHtml(d.exam_date || '-')}</td><td>${escapeHtml(d.start_time || '-')} - ${escapeHtml(d.end_time || '-')}</td><td>${escapeHtml(d.room || '-')}</td></tr>`).join('');
    return `
        <div style="border:2px solid #333; border-radius:10px; padding:20px; margin-bottom:24px; page-break-after:always; font-family:Arial;">
            <div style="display:flex; align-items:center; gap:16px; border-bottom:2px solid #333; padding-bottom:12px; margin-bottom:12px;">
                <img src="/static/images/logo.png" alt="Logo" style="width:60px; height:60px; object-fit:contain;" onerror="this.style.display='none'">
                <div>
                    <h2 style="margin:0;">${escapeHtml(typeof SCHOOL_NAME !== 'undefined' ? SCHOOL_NAME : 'School')}</h2>
                    <div style="font-size:14px; color:#555;">Admit Card — ${escapeHtml(card.term)} ${escapeHtml(card.year)}</div>
                </div>
            </div>
            <table style="width:100%; margin-bottom:12px;">
                <tr><td style="padding:4px 0;"><strong>Student Name:</strong> ${escapeHtml(card.student_name || '-')}</td><td><strong>Roll No / ID:</strong> ${escapeHtml(card.student_id)}</td></tr>
                <tr><td style="padding:4px 0;"><strong>Class:</strong> ${escapeHtml(card.class_name || '-')}</td><td><strong>Father Name:</strong> ${escapeHtml(card.father_name || '-')}</td></tr>
                <tr><td style="padding:4px 0;"><strong>Room:</strong> ${escapeHtml(card.room || '-')}</td><td><strong>Seat No.:</strong> ${escapeHtml(card.seat_no || '-')}</td></tr>
            </table>
            <div style="font-weight:600; margin-bottom:6px;">Examination Date Sheet</div>
            <table class="data-table"><thead><tr><th>Subject</th><th>Date</th><th>Time</th><th>Room</th></tr></thead><tbody>${dsRows || '<tr><td colspan="4" style="text-align:center;">Date sheet not published yet.</td></tr>'}</tbody></table>
        </div>
    `;
}

window.printSingleAdmitCard = async function() {
    const sid = document.getElementById('admitCardStudent')?.value;
    if (!sid) { showAlert('Select a student.', 'error'); return; }
    try {
        const card = await fetchAPI(`/exam/${examCtx.examId}/admit-card/${sid}`);
        printPreview(admitCardHtml(card), 'Admit Card');
    } catch (e) {
        showAlert('Failed to load admit card.', 'error');
    }
};

window.printAllAdmitCards = async function() {
    try {
        const data = await fetchAPI(`/exam/${examCtx.examId}/admit-cards`);
        const cards = data.admit_cards || [];
        if (!cards.length) { showAlert('No students found for this class.', 'error'); return; }
        printPreview(cards.map(admitCardHtml).join(''), 'Admit Cards');
    } catch (e) {
        showAlert('Failed to load admit cards.', 'error');
    }
};

// ============================================
// RESULT LOCK / PUBLISH
// ============================================
async function renderLockPublishTab(box) {
    const status = await fetchAPI(`/exam/${examCtx.examId}/status`);

    box.innerHTML = `
        <div class="card">
            <div class="card-title">Result Lock &amp; Publish — ${escapeHtml(examCtx.className || '')} (${escapeHtml(examCtx.term)} ${escapeHtml(examCtx.year)})</div>
            <p style="color:#94a3b8; font-size:13px;">Locking a result prevents teachers from editing marks or applying grace marks. Publishing makes the result visible to students/parents through the result card and parent portal views.</p>

            <div style="display:flex; gap:24px; flex-wrap:wrap; margin-top:16px;">
                <div class="card" style="flex:1; min-width:240px; background:var(--card2);">
                    <div style="font-weight:600; margin-bottom:10px;">Lock Status</div>
                    <span class="badge ${status.result_locked ? 'badge-red' : 'badge-green'}" style="font-size:14px;">${status.result_locked ? '🔒 Locked' : '🔓 Unlocked'}</span>
                    <div style="margin-top:14px; display:flex; gap:10px;">
                        <button class="btn btn-danger btn-sm" onclick="setResultLock(true)" ${status.result_locked ? 'disabled' : ''}>🔒 Lock Result</button>
                        <button class="btn btn-success btn-sm" onclick="setResultLock(false)" ${!status.result_locked ? 'disabled' : ''}>🔓 Unlock Result</button>
                    </div>
                </div>
                <div class="card" style="flex:1; min-width:240px; background:var(--card2);">
                    <div style="font-weight:600; margin-bottom:10px;">Publish Status</div>
                    <span class="badge ${status.result_published ? 'badge-blue' : 'badge-yellow'}" style="font-size:14px;">${status.result_published ? '📢 Published' : '📝 Draft'}</span>
                    <div style="margin-top:14px; display:flex; gap:10px;">
                        <button class="btn btn-primary btn-sm" onclick="setResultPublish(true)" ${status.result_published ? 'disabled' : ''}>📢 Publish Result</button>
                        <button class="btn btn-ghost btn-sm" onclick="setResultPublish(false)" ${!status.result_published ? 'disabled' : ''}>📝 Unpublish</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

window.setResultLock = async function(lock) {
    try {
        await fetchAPI(`/exam/${examCtx.examId}/${lock ? 'lock' : 'unlock'}`, { method: 'POST' });
        showAlert(`Result ${lock ? 'locked' : 'unlocked'}.`, 'success');
        await renderExamStatusBadges();
        await switchExamTab('lockpublish');
    } catch (e) {
        showAlert(e.message || 'Action failed.', 'error');
    }
};

window.setResultPublish = async function(publish) {
    try {
        await fetchAPI(`/exam/${examCtx.examId}/${publish ? 'publish' : 'unpublish'}`, { method: 'POST' });
        showAlert(`Result ${publish ? 'published' : 'unpublished'}.`, 'success');
        await renderExamStatusBadges();
        await switchExamTab('lockpublish');
    } catch (e) {
        showAlert(e.message || 'Action failed.', 'error');
    }
};

// ============================================
// GRACE MARKS
// ============================================
async function renderGraceMarksTab(box) {
    const [sheet, gpaData] = await Promise.all([
        fetchAPI(`/exam/class/${examCtx.classId}/marksheet?term=${encodeURIComponent(examCtx.term)}&year=${encodeURIComponent(examCtx.year)}`),
        fetchAPI(`/exam/${examCtx.examId}/gpa`)
    ]);
    const students = sheet.students || [];
    const subjects = sheet.subjects || [];
    const results = gpaData.gpa_list || [];
    const resultMap = new Map(results.map(r => [r.student_id, r]));

    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div class="card-title">Apply Grace Marks</div>
            <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end;">
                <div><label style="font-size:12px; color:#94a3b8;">Student</label><br>
                    <select id="gmStudent" class="filter" style="min-width:200px;">
                        ${students.map(s => `<option value="${escapeHtml(s.student_id)}">${escapeHtml(s.name)} (${escapeHtml(s.student_id)})</option>`).join('')}
                    </select></div>
                <div><label style="font-size:12px; color:#94a3b8;">Subject</label><br>
                    <select id="gmSubject" class="filter" style="min-width:150px;">
                        ${subjects.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
                    </select></div>
                <div><label style="font-size:12px; color:#94a3b8;">Grace Marks</label><br>
                    <input type="number" id="gmMarks" class="filter" style="width:100px;" value="0"></div>
                <button class="btn btn-primary" onclick="applyGraceMarks()">➕ Apply Grace Marks</button>
            </div>
        </div>

        <div class="card">
            <div class="card-title">Result Summary (after grace marks)</div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>Student</th><th>Total Obtained</th><th>Total Marks</th><th>Grace Applied</th><th>%</th><th>Grade</th><th>GPA</th><th>Position</th></tr></thead>
                    <tbody>
                        ${students.map(s => {
                            const r = resultMap.get(s.student_id);
                            return `<tr>
                                <td><a href="#" onclick="event.preventDefault(); showStudentQuickView('${escapeHtml(s.student_id)}')" style="color:var(--accent); cursor:pointer;">${escapeHtml(s.name)}</a></td>
                                <td>${r ? r.total_obtained : '-'}</td>
                                <td>${r ? r.total_marks : '-'}</td>
                                <td>${r ? (r.grace_marks || 0) : '-'}</td>
                                <td>${r ? r.percentage.toFixed(2) : '-'}</td>
                                <td>${r ? escapeHtml(r.grade || '-') : '-'}</td>
                                <td>${r ? r.gpa : '-'}</td>
                                <td>${r ? r.position : '-'}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

window.applyGraceMarks = async function() {
    const student_id = document.getElementById('gmStudent')?.value;
    const subject = document.getElementById('gmSubject')?.value;
    const grace_marks = document.getElementById('gmMarks')?.value;

    if (!student_id || !subject) { showAlert('Select a student and subject.', 'error'); return; }

    try {
        await fetchAPI(`/exam/${examCtx.examId}/grace-marks`, {
            method: 'POST',
            body: JSON.stringify({ student_id, subject, grace_marks })
        });
        showAlert('Grace marks applied.', 'success');
        await switchExamTab('gracemarks');
    } catch (e) {
        showAlert(e.message || 'Failed to apply grace marks (result may be locked).', 'error');
    }
};

// ============================================
// GPA / CGPA
// ============================================
async function renderGpaTab(box) {
    const data = await fetchAPI(`/exam/${examCtx.examId}/gpa`);
    const rows = data.gpa_list || [];

    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div class="card-title">GPA — ${escapeHtml(examCtx.className || '')} (${escapeHtml(examCtx.term)} ${escapeHtml(examCtx.year)})</div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>Student</th><th>%</th><th>Grade</th><th>GPA</th></tr></thead>
                    <tbody>
                        ${rows.length ? rows.map(r => `
                            <tr><td><a href="#" onclick="event.preventDefault(); showStudentQuickView('${escapeHtml(r.student_id)}')" style="color:var(--accent); cursor:pointer;">${escapeHtml(r.student_name)}</a></td><td>${r.percentage.toFixed(2)}</td><td>${escapeHtml(r.grade || '-')}</td><td><strong>${r.gpa ?? '-'}</strong></td></tr>
                        `).join('') : '<tr><td colspan="4" style="text-align:center; color:#94a3b8;">No results submitted yet for this exam.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="card">
            <div class="card-title">Look up a Student's CGPA</div>
            <div style="display:flex; gap:10px; align-items:center;">
                <input type="text" id="cgpaStudentId" class="filter" placeholder="Student ID (e.g. STU-001)" style="min-width:200px;">
                <button class="btn btn-primary" onclick="lookupCgpa()">🔍 Look Up CGPA</button>
            </div>
            <div id="cgpaResult" style="margin-top:14px;"></div>
        </div>
    `;
}

window.lookupCgpa = async function() {
    const sid = document.getElementById('cgpaStudentId')?.value.trim();
    if (!sid) { showAlert('Enter a student ID.', 'error'); return; }
    const box = document.getElementById('cgpaResult');
    box.innerHTML = '<div class="loading">Loading…</div>';
    try {
        const data = await fetchAPI(`/student/${encodeURIComponent(sid)}/cgpa`);
        if (data.cgpa === null) {
            box.innerHTML = '<div style="color:#94a3b8;">No exam results found for this student yet.</div>';
            return;
        }
        box.innerHTML = `
            <div style="font-size:22px; font-weight:700; margin-bottom:10px;">CGPA: ${data.cgpa}</div>
            <table class="data-table">
                <thead><tr><th>Term</th><th>Year</th><th>%</th><th>GPA</th></tr></thead>
                <tbody>${data.exams.map(e => `<tr><td>${escapeHtml(e.term)}</td><td>${escapeHtml(e.year)}</td><td>${e.percentage.toFixed(2)}</td><td>${e.gpa}</td></tr>`).join('')}</tbody>
            </table>
        `;
    } catch (e) {
        box.innerHTML = '<div style="color:#f87171;">Failed to load CGPA.</div>';
    }
};

// ============================================
// POSITION HOLDERS
// ============================================
async function renderPositionHoldersTab(box) {
    const data = await fetchAPI(`/exam/${examCtx.examId}/position-holders?top=3`);
    const rows = data.position_holders || [];
    renderPositionHoldersHtml(box, rows, 3);
}

function renderPositionHoldersHtml(box, rows, topN) {
    const medals = ['🥇', '🥈', '🥉'];
    box.innerHTML = `
        <div class="card">
            <div class="card-title">Position Holders — ${escapeHtml(examCtx.className || '')} (${escapeHtml(examCtx.term)} ${escapeHtml(examCtx.year)})</div>
            <div style="display:flex; gap:10px; align-items:center; margin-bottom:14px;">
                <label style="font-size:12px; color:#94a3b8;">Top:</label>
                <input type="number" id="posTopN" class="filter" value="${topN}" style="width:80px;">
                <button class="btn btn-primary btn-sm" onclick="reloadPositionHolders()">🔄 Refresh</button>
                <button class="btn btn-ghost btn-sm" onclick="printPositionHolders()">🖨️ Print</button>
            </div>
            <div style="display:flex; gap:16px; flex-wrap:wrap;">
                ${rows.length ? rows.map((r, i) => `
                    <div class="card" style="flex:1; min-width:200px; text-align:center; background:var(--card2);">
                        <div style="font-size:32px;">${medals[i] || '🎖️'}</div>
                        <div style="font-weight:700; font-size:16px; margin-top:6px;"><a href="#" onclick="event.preventDefault(); showStudentQuickView('${escapeHtml(r.student_id)}')" style="color:inherit; cursor:pointer;">${escapeHtml(r.student_name)}</a></div>
                        <div style="color:#94a3b8; font-size:13px;">Position ${r.position}</div>
                        <div style="margin-top:6px; font-size:14px;">${r.percentage.toFixed(2)}% &middot; ${escapeHtml(r.grade || '-')}</div>
                    </div>
                `).join('') : '<div style="color:#94a3b8;">No results submitted yet for this exam.</div>'}
            </div>
        </div>
    `;
}

window.reloadPositionHolders = async function() {
    const topN = parseInt(document.getElementById('posTopN')?.value || '3', 10);
    const box = document.getElementById('examTabContent');
    try {
        const data = await fetchAPI(`/exam/${examCtx.examId}/position-holders?top=${topN}`);
        renderPositionHoldersHtml(box, data.position_holders || [], topN);
    } catch (e) {
        showAlert('Failed to load position holders.', 'error');
    }
};

window.printPositionHolders = async function() {
    const topN = parseInt(document.getElementById('posTopN')?.value || '3', 10);
    const data = await fetchAPI(`/exam/${examCtx.examId}/position-holders?top=${topN}`);
    const rows = data.position_holders || [];
    const body = `
        <p><strong>Class:</strong> ${escapeHtml(examCtx.className || '')} &nbsp; <strong>${escapeHtml(examCtx.term)} ${escapeHtml(examCtx.year)}</strong></p>
        <table class="data-table">
            <thead><tr><th>Position</th><th>Student</th><th>%</th><th>Grade</th></tr></thead>
            <tbody>${rows.map(r => `<tr><td>${r.position}</td><td>${escapeHtml(r.student_name)}</td><td>${r.percentage.toFixed(2)}</td><td>${escapeHtml(r.grade || '-')}</td></tr>`).join('')}</tbody>
        </table>
    `;
    printPreview(body, 'Position Holders');
};

// ============================================
// MERIT LIST
// ============================================
async function renderMeritListTab(box) {
    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div class="card-title">Merit List</div>
            <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end;">
                <div><label style="font-size:12px; color:#94a3b8;">Term</label><br>
                    <select id="mlTerm" class="filter">${['Term 1', 'Term 2', 'Term 3', 'Annual'].map(t => `<option ${t === examCtx.term ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
                <div><label style="font-size:12px; color:#94a3b8;">Year</label><br>
                    <input type="text" id="mlYear" class="filter" style="width:80px;" value="${escapeHtml(examCtx.year)}"></div>
                <div><label style="font-size:12px; color:#94a3b8;">Top N</label><br>
                    <input type="number" id="mlTopN" class="filter" style="width:80px;" value="10"></div>
                <button class="btn btn-primary" onclick="loadMeritList()">🔍 Generate Merit List</button>
                <button class="btn btn-ghost" onclick="printMeritList()">🖨️ Print</button>
            </div>
            <div style="color:#94a3b8; font-size:13px; margin-top:8px;">Ranks students across all classes for the selected term/year, by percentage.</div>
        </div>
        <div class="card">
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>Rank</th><th>Student</th><th>Class</th><th>%</th><th>Grade</th><th>GPA</th></tr></thead>
                    <tbody id="meritListBody"><tr><td colspan="6" style="text-align:center; color:#94a3b8;">Click "Generate Merit List" to load results.</td></tr></tbody>
                </table>
            </div>
        </div>
    `;
}

async function fetchMeritList() {
    const term = document.getElementById('mlTerm')?.value;
    const year = document.getElementById('mlYear')?.value;
    const top = document.getElementById('mlTopN')?.value || 10;
    const data = await fetchAPI(`/exam/merit-list?term=${encodeURIComponent(term)}&year=${encodeURIComponent(year)}&top=${top}`);
    return data.merit_list || [];
}

window.loadMeritList = async function() {
    const tbody = document.getElementById('meritListBody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading…</td></tr>';
    try {
        const rows = await fetchMeritList();
        tbody.innerHTML = rows.length ? rows.map((r, i) => `
            <tr><td>${i + 1}</td><td><a href="#" onclick="event.preventDefault(); showStudentQuickView('${escapeHtml(r.student_id)}')" style="color:var(--accent); cursor:pointer;">${escapeHtml(r.student_name)}</a></td><td>${escapeHtml(r.class_name)}</td><td>${r.percentage.toFixed(2)}</td><td>${escapeHtml(r.grade || '-')}</td><td>${r.gpa ?? '-'}</td></tr>
        `).join('') : '<tr><td colspan="6" style="text-align:center; color:#94a3b8;">No results found for this term/year.</td></tr>';
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#f87171;">Failed to load merit list.</td></tr>';
    }
};

window.printMeritList = async function() {
    try {
        const rows = await fetchMeritList();
        const term = document.getElementById('mlTerm')?.value;
        const year = document.getElementById('mlYear')?.value;
        const body = `
            <p><strong>${escapeHtml(term)} ${escapeHtml(year)}</strong></p>
            <table class="data-table">
                <thead><tr><th>Rank</th><th>Student</th><th>Class</th><th>%</th><th>Grade</th><th>GPA</th></tr></thead>
                <tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(r.student_name)}</td><td>${escapeHtml(r.class_name)}</td><td>${r.percentage.toFixed(2)}</td><td>${escapeHtml(r.grade || '-')}</td><td>${r.gpa ?? '-'}</td></tr>`).join('')}</tbody>
            </table>
        `;
        printPreview(body, 'Merit List');
    } catch (e) {
        showAlert('Failed to print merit list.', 'error');
    }
};
