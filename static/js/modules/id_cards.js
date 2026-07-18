// ============================================
// ID_CARDS.JS — Modern, professional Student &
// Staff ID card generator. Supports:
//   • Individual quick-print (from the Students /
//     Teachers tables, or the ID Cards page)
//   • Class-wise batch print (whole class at once)
//   • Whole-staff batch print
// Card layout: CR80 wallet size (3.375in x 2.125in),
// navy + gold academic theme matching the rest of
// the app's printable documents (report cards, etc).
// ============================================

const ID_CARD_MONOGRAM_COLORS = [
    ['#0f172a', '#c9a227'], // navy / gold (brand default)
    ['#1e3a5f', '#c9a227'],
    ['#0f172a', '#3b82f6'],
    ['#1e3a5f', '#22c55e'],
];

function idCardInitials(name) {
    if (!name) return '?';
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function idCardMonogramColor(seed) {
    let hash = 0;
    const s = String(seed || '');
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
    return ID_CARD_MONOGRAM_COLORS[hash % ID_CARD_MONOGRAM_COLORS.length];
}

function currentIdCardValidity() {
    const y = new Date().getFullYear();
    return `${y}-${y + 1}`;
}

function idCardLogoHtml(size) {
    return `<img src="/static/images/logo.png" alt="Logo" style="width:${size}px;height:${size}px;object-fit:contain;border-radius:50%;background:#fff;padding:3px;"
                 onerror="this.onerror=null;this.outerHTML='<div style=\\'width:${size}px;height:${size}px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.32)}px;font-weight:800;color:#0f172a;\\'>🏫</div>';">`;
}

/**
 * Renders one modern, professional wallet-sized ID card.
 * type: 'student' | 'teacher'
 */
function renderIdCardHtml(person, type, validThru) {
    const isStudent = type === 'student';
    const [base, accent] = idCardMonogramColor(person.id);
    const roleLabel = isStudent ? 'STUDENT IDENTITY CARD' : 'FACULTY IDENTITY CARD';
    const designation = isStudent ? `Class ${escapeHtml(person.grade || '-')}` : escapeHtml(person.subject || 'Faculty');

    const detailRows = isStudent ? `
        <div class="idc-row"><span class="idc-label">Father / Guardian</span><span class="idc-value">${escapeHtml(person.parent_name || '-')}</span></div>
        <div class="idc-row"><span class="idc-label">Date of Birth</span><span class="idc-value">${escapeHtml(person.dob || '-')}</span></div>
        <div class="idc-row"><span class="idc-label">Emergency Contact</span><span class="idc-value">${escapeHtml(person.parent_phone || person.phone || '-')}</span></div>
    ` : `
        <div class="idc-row"><span class="idc-label">Qualification</span><span class="idc-value">${escapeHtml(person.qualification || '-')}</span></div>
        <div class="idc-row"><span class="idc-label">Contact</span><span class="idc-value">${escapeHtml(person.phone || '-')}</span></div>
        <div class="idc-row"><span class="idc-label">Joined</span><span class="idc-value">${escapeHtml(person.join_date || '-')}</span></div>
    `;

    const avatarHtml = person.photo_path
        ? `<img src="${escapeHtml(person.photo_path)}" class="idc-photo" style="box-shadow: 0 0 0 2px ${accent};"
                onerror="this.onerror=null; this.outerHTML='<div class=\\'idc-monogram\\' style=\\'background:${base}; box-shadow: 0 0 0 2px ${accent};\\'>${escapeHtml(idCardInitials(person.name))}</div>';">`
        : `<div class="idc-monogram" style="background:${base}; box-shadow: 0 0 0 2px ${accent};">${escapeHtml(idCardInitials(person.name))}</div>`;

    return `
        <div class="idc-card" style="border-color:${base};">
            <div class="idc-header" style="background:${base};">
                <div class="idc-header-top">
                    ${idCardLogoHtml(34)}
                    <div class="idc-header-text">
                        <div class="idc-school">${escapeHtml(SCHOOL_NAME || 'School')}</div>
                        <div class="idc-role" style="color:${accent};">${roleLabel}</div>
                    </div>
                </div>
            </div>
            <div class="idc-accent" style="background:${accent};"></div>
            <div class="idc-body">
                ${avatarHtml}
                <div class="idc-identity">
                    <div class="idc-name">${escapeHtml(person.name || '-')}</div>
                    <div class="idc-designation">${designation}</div>
                    <div class="idc-idpill" style="border-color:${base}; color:${base};">${escapeHtml(isStudent ? (person.admission_no || person.id) : person.id)}</div>
                </div>
            </div>
            <div class="idc-details">${detailRows}</div>
            <div class="idc-footer" style="background:${base};">
                <div class="idc-valid">Valid Thru: <strong>${escapeHtml(validThru)}</strong></div>
                <div class="idc-signature">Authorized Signatory</div>
            </div>
        </div>
    `;
}

function idCardStyles() {
    return `
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', 'Inter', Arial, sans-serif; background: #f1f5f9; padding: 24px; margin: 0; }
        .idc-toolbar { text-align:center; margin-bottom: 18px; }
        .idc-toolbar button {
            background:#0f172a; color:#fff; border:none; padding:10px 22px; border-radius:6px;
            font-size:14px; font-weight:600; cursor:pointer; letter-spacing:0.3px;
        }
        .idc-sheet { display: flex; flex-wrap: wrap; gap: 16px; justify-content: flex-start; }
        .idc-card {
            width: 324px; min-height: 204px;
            border: 1.5px solid #0f172a; border-radius: 10px; background: #fff;
            overflow: hidden; position: relative; page-break-inside: avoid;
            box-shadow: 0 2px 6px rgba(15,23,42,0.18);
            display: flex; flex-direction: column;
        }
        .idc-header { padding: 10px 12px 8px 12px; }
        .idc-header-top { display: flex; align-items: center; gap: 10px; }
        .idc-header-text { min-width: 0; }
        .idc-school { color: #fff; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 230px; }
        .idc-role { font-size: 9.5px; font-weight: 700; letter-spacing: 1px; margin-top: 2px; }
        .idc-accent { height: 3px; width: 100%; }
        .idc-body { display: flex; gap: 12px; padding: 12px 12px 8px 12px; align-items: center; }
        .idc-monogram {
            width: 56px; height: 56px; border-radius: 10px; color: #fff; flex-shrink: 0;
            display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800;
        }
        .idc-photo {
            width: 56px; height: 56px; border-radius: 10px; flex-shrink: 0;
            object-fit: cover; background: #e2e8f0;
        }
        .idc-identity { min-width: 0; }
        .idc-name { font-size: 15.5px; font-weight: 800; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 210px; }
        .idc-designation { font-size: 11.5px; color: #475569; font-weight: 600; margin-top: 2px; }
        .idc-idpill { display:inline-block; margin-top: 5px; font-family: 'Consolas', monospace; font-size: 10.5px; font-weight: 700; border: 1px solid; border-radius: 20px; padding: 1px 10px; }
        .idc-details { padding: 0 14px 8px 14px; flex: 1; }
        .idc-row { display: flex; justify-content: space-between; gap: 8px; font-size: 10.5px; padding: 2.5px 0; border-bottom: 1px dotted #e2e8f0; }
        .idc-label { color: #94a3b8; font-weight: 600; }
        .idc-value { color: #1e293b; font-weight: 600; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px; }
        .idc-footer { display: flex; justify-content: space-between; align-items: center; padding: 6px 14px; color: #fff; font-size: 9.5px; }
        .idc-signature { border-top: 1px solid rgba(255,255,255,0.5); padding-top: 2px; font-weight: 600; }
        @media print {
            .idc-toolbar { display: none; }
            body { background: #fff; padding: 10px; }
            .idc-card { box-shadow: none; }
        }
    `;
}

function openIdCardPrintWindow(cardsHtml, title) {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head><title>${escapeHtml(title)}</title><style>${idCardStyles()}</style></head>
        <body>
            <div class="idc-toolbar"><button onclick="window.print()">🖨 Print ID Card${cardsHtml.split('idc-card').length > 2 ? 's' : ''}</button></div>
            <div class="idc-sheet">${cardsHtml}</div>
            <script>
                window.onload = () => setTimeout(() => window.print(), 400);
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// ==================== INDIVIDUAL QUICK PRINT ====================
// Overrides the older plain-text detail dumps with a real ID card.
window.printStudentCard = async function(id) {
    const s = await fetchAPI(`/students/${id}`);
    const html = renderIdCardHtml(s, 'student', currentIdCardValidity());
    openIdCardPrintWindow(html, `Student ID Card - ${s.name}`);
};

window.printTeacherCard = async function(id) {
    const t = await fetchAPI(`/teachers/${id}`);
    const html = renderIdCardHtml(t, 'teacher', currentIdCardValidity());
    openIdCardPrintWindow(html, `Staff ID Card - ${t.name}`);
};

// ==================== ID CARDS PAGE (class-wise / batch) ====================
let idCardType = 'student';
let idCardPreselectClass = null;

// Jump here from the Classes page's 🪪 quick button
window.goToClassIdCards = function(classId) {
    idCardPreselectClass = classId;
    loadPage('id-cards');
};

async function loadIdCards() {
    try {
        const classesData = await fetchAPI('/classes');
        const classes = classesData.classes || [];

        document.getElementById('page-content').innerHTML = `
            <div class="page-header">
                <div class="page-title">ID Cards</div>
                <div class="page-sub">Generate and print professional ID cards — one at a time, or a whole class/staff list in one batch.</div>
            </div>
            <div class="card">
                <div class="toolbar">
                    <button id="idCardTabStudents" class="btn btn-primary btn-sm" onclick="switchIdCardType('student')">👥 Students</button>
                    <button id="idCardTabTeachers" class="btn btn-ghost btn-sm" onclick="switchIdCardType('teacher')">👤 Staff</button>
                    <select id="idCardClassFilter" class="filter" onchange="filterIdCardList()">
                        <option value="">All Classes</option>
                        ${classes.map(c => `<option value="${escapeHtml(c.class_name)}">${escapeHtml(c.class_name)}</option>`).join('')}
                    </select>
                    <div class="search-wrap"><input type="text" id="idCardSearch" placeholder="Search..." oninput="filterIdCardList()"></div>
                    <div style="flex:1"></div>
                    <button class="btn btn-ghost btn-sm" onclick="toggleSelectAllIdCards()">☑ Select All</button>
                    <button class="btn btn-primary btn-sm" onclick="printSelectedIdCards()">🖨 Print Selected</button>
                    <button class="btn btn-primary btn-sm" onclick="printClassIdCards()">🎓 Print Whole Class</button>
                </div>
                <div class="table-wrap">
                    <table class="data-table">
                        <thead id="idCardTableHead"><tr><th></th><th>ID</th><th>Name</th><th>Class</th><th>Gender</th></tr></thead>
                        <tbody id="idCardTableBody"><tr><td colspan="5">Loading...</td></tr></tbody>
                    </table>
                </div>
            </div>
        `;

        if (idCardPreselectClass) {
            document.getElementById('idCardClassFilter').value = idCardPreselectClass;
        }
        await filterIdCardList();
    } catch (e) {
        console.error(e);
        document.getElementById('page-content').innerHTML = '<div class="loading">Failed to load ID Cards page.</div>';
    }
}

window.switchIdCardType = function(type) {
    idCardType = type;
    document.getElementById('idCardTabStudents').className = type === 'student' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
    document.getElementById('idCardTabTeachers').className = type === 'teacher' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
    const classFilter = document.getElementById('idCardClassFilter');
    if (classFilter) classFilter.style.display = type === 'student' ? '' : 'none';
    const head = document.getElementById('idCardTableHead');
    if (head) {
        head.innerHTML = type === 'student'
            ? '<tr><th></th><th>ID</th><th>Name</th><th>Class</th><th>Gender</th></tr>'
            : '<tr><th></th><th>ID</th><th>Name</th><th>Subject</th><th>Gender</th></tr>';
    }
    filterIdCardList();
};

window.filterIdCardList = async function() {
    const tbody = document.getElementById('idCardTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';

    const search = document.getElementById('idCardSearch')?.value || '';
    try {
        if (idCardType === 'student') {
            const grade = document.getElementById('idCardClassFilter')?.value || '';
            const data = await fetchAPI(`/students?q=${encodeURIComponent(search)}&grade=${encodeURIComponent(grade)}`);
            const students = data.students || [];
            tbody.innerHTML = students.map(s => `
                <tr>
                    <td><input type="checkbox" class="id-card-check" data-id="${escapeHtml(s.id)}"></td>
                    <td style="font-family:monospace;color:var(--accent)">${escapeHtml(s.id)}</td>
                    <td>${escapeHtml(s.name)}</td>
                    <td><span class="badge badge-blue">${escapeHtml(s.grade)}</span></td>
                    <td>${escapeHtml(s.gender || '-')}</td>
                </tr>
            `).join('') || '<tr><td colspan="5">No students found.</td></tr>';
        } else {
            const data = await fetchAPI(`/teachers?q=${encodeURIComponent(search)}`);
            const teachers = data.teachers || [];
            tbody.innerHTML = teachers.map(t => `
                <tr>
                    <td><input type="checkbox" class="id-card-check" data-id="${escapeHtml(t.id)}"></td>
                    <td style="font-family:monospace;color:var(--accent)">${escapeHtml(t.id)}</td>
                    <td>${escapeHtml(t.name)}</td>
                    <td><span class="badge badge-purple">${escapeHtml(t.subject)}</span></td>
                    <td>${escapeHtml(t.gender || '-')}</td>
                </tr>
            `).join('') || '<tr><td colspan="5">No staff found.</td></tr>';
        }
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="5">Failed to load.</td></tr>';
    }
};

window.toggleSelectAllIdCards = function() {
    const boxes = document.querySelectorAll('.id-card-check');
    const allChecked = Array.from(boxes).length > 0 && Array.from(boxes).every(b => b.checked);
    boxes.forEach(b => { b.checked = !allChecked; });
};

async function renderCardsForIds(ids) {
    const validThru = currentIdCardValidity();
    const cards = await Promise.all(ids.map(async id => {
        const person = idCardType === 'student'
            ? await fetchAPI(`/students/${id}`)
            : await fetchAPI(`/teachers/${id}`);
        return renderIdCardHtml(person, idCardType, validThru);
    }));
    return cards.join('');
}

window.printSelectedIdCards = async function() {
    const ids = Array.from(document.querySelectorAll('.id-card-check:checked')).map(b => b.dataset.id);
    if (ids.length === 0) {
        showAlert('Select at least one row to print', 'error');
        return;
    }
    try {
        const html = await renderCardsForIds(ids);
        openIdCardPrintWindow(html, `${idCardType === 'student' ? 'Student' : 'Staff'} ID Cards (${ids.length})`);
    } catch (e) {
        console.error(e);
        showAlert('Failed to generate ID cards', 'error');
    }
};

// One-click "print the whole visible list" — the class-wise batch print.
window.printClassIdCards = async function() {
    const ids = Array.from(document.querySelectorAll('.id-card-check')).map(b => b.dataset.id);
    if (ids.length === 0) {
        showAlert('No rows to print — adjust your filters first', 'error');
        return;
    }
    const classFilter = document.getElementById('idCardClassFilter')?.value;
    const label = idCardType === 'student'
        ? (classFilter || 'All Students')
        : 'All Staff';
    try {
        const html = await renderCardsForIds(ids);
        openIdCardPrintWindow(html, `${label} — ID Cards (${ids.length})`);
    } catch (e) {
        console.error(e);
        showAlert('Failed to generate ID cards', 'error');
    }
};
