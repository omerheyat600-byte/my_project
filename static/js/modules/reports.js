// ============================================
// REPORTS.JS — Reports / Analytics page.
// Five tabs (Enrollment, Fees, Attendance,
// Academic, Financial), each with KPI cards,
// a simple CSS bar chart, a detail table, a
// CSV export, and a print/Save-as-PDF button.
// Financial tab only shows for accountant/admin.
// ============================================

let currentReportTab = 'enrollment';

// Cache of the last-rendered report's raw data + filter params, keyed by tab.
// Used by printCurrentReport() to build a clean, self-contained print
// document instead of scraping the live (dark-themed, CSS-var-dependent) DOM.
let lastReportData = {};

function reportBar(label, value, max) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return `
        <div style="margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--muted); margin-bottom:4px;">
                <span>${escapeHtml(label)}</span><span>${value}</span>
            </div>
            <div style="background:var(--card2); border-radius:6px; height:8px; overflow:hidden;">
                <div style="background:linear-gradient(90deg, var(--accent), var(--purple)); height:100%; width:${pct}%;"></div>
            </div>
        </div>
    `;
}

// Print-safe bar: plain hex colors only, no CSS variables, since the print
// window has none of the app's theme stylesheet loaded.
function printReportBar(label, value, max) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return `
        <div style="margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; font-size:12px; color:#555; margin-bottom:4px;">
                <span>${escapeHtml(label)}</span><span>${value}</span>
            </div>
            <div style="background:#e5e7eb; border-radius:6px; height:8px; overflow:hidden;">
                <div style="background:#3b82f6; height:100%; width:${pct}%;"></div>
            </div>
        </div>
    `;
}

function printKpiCard(label, value, sub, color) {
    return `
        <div style="border:1px solid #ddd; border-radius:8px; padding:14px; min-width:150px; flex:1;">
            <div style="font-size:12px; color:#666; margin-bottom:6px;">${escapeHtml(label)}</div>
            <div style="font-size:20px; font-weight:700; ${color ? `color:${color};` : ''}">${value}</div>
            ${sub ? `<div style="font-size:11px; color:#888; margin-top:4px;">${escapeHtml(sub)}</div>` : ''}
        </div>
    `;
}

function printKpiGrid(cardsHtml) {
    return `<div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:18px;">${cardsHtml}</div>`;
}

function printSectionTitle(text) {
    return `<h3 style="margin:22px 0 10px; font-size:15px; color:#222;">${escapeHtml(text)}</h3>`;
}

function printTable(headers, rowsHtml) {
    return `
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
            <thead>
                <tr>${headers.map(h => `<th style="border:1px solid #ccc; padding:8px; background:#f3f3f3; text-align:left;">${escapeHtml(h)}</th>`).join('')}</tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
    `;
}

async function loadReports() {
    const html = `
        <div class="page-header">
            <div class="page-title">Reports &amp; Analytics</div>
            <div class="page-sub">Enrollment, fees, attendance, and academic performance at a glance.</div>
        </div>

        <div class="toolbar no-print">
            <button onclick="switchReportTab('enrollment')" id="reportTabEnrollment" class="btn btn-primary btn-sm">🎓 Enrollment</button>
            <button onclick="switchReportTab('fees')" id="reportTabFees" class="btn btn-ghost btn-sm">💰 Fees</button>
            <button onclick="switchReportTab('attendance')" id="reportTabAttendance" class="btn btn-ghost btn-sm">🗓️ Attendance</button>
            <button onclick="switchReportTab('academic')" id="reportTabAcademic" class="btn btn-ghost btn-sm">📝 Academic</button>
            ${currentUser?.role === 'admin' || currentUser?.role === 'accountant'
                ? `<button onclick="switchReportTab('financial')" id="reportTabFinancial" class="btn btn-ghost btn-sm">📊 Financial</button>`
                : ''}
        </div>

        <div id="reportContent"><div class="loading">Loading report…</div></div>
    `;
    document.getElementById('page-content').innerHTML = html;
    await switchReportTab(currentReportTab);
}

window.switchReportTab = async function(tab) {
    currentReportTab = tab;
    ['Enrollment', 'Fees', 'Attendance', 'Academic', 'Financial'].forEach(t => {
        const btn = document.getElementById(`reportTab${t}`);
        if (btn) btn.className = t.toLowerCase() === tab ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
    });

    const box = document.getElementById('reportContent');
    box.innerHTML = '<div class="loading">Loading report…</div>';

    try {
        if (tab === 'enrollment') await renderEnrollmentReport(box);
        else if (tab === 'fees') await renderFeesReport(box);
        else if (tab === 'attendance') await renderAttendanceReport(box);
        else if (tab === 'academic') await renderAcademicReport(box);
        else if (tab === 'financial') await renderFinancialReport(box);
    } catch (e) {
        box.innerHTML = '<div class="loading">Failed to load this report.</div>';
    }
};

function reportActionBar(reportType, extraParams) {
    return `
        <div class="toolbar no-print" style="justify-content:flex-end;">
            <button class="btn btn-ghost btn-sm" onclick="exportReportCsv('${reportType}', ${JSON.stringify(extraParams || {}).replace(/"/g, '&quot;')})">⬇️ Export CSV</button>
            <button class="btn btn-ghost btn-sm" onclick="printCurrentReport()">🖨️ Print / Save as PDF</button>
        </div>
    `;
}

window.exportReportCsv = function(reportType, params = {}) {
    const query = new URLSearchParams(params).toString();
    window.location.href = `${API_BASE}/reports/export/${reportType}${query ? '?' + query : ''}`;
};

window.printCurrentReport = function() {
    const cached = lastReportData[currentReportTab];
    if (!cached) { showAlert('Nothing to print yet — load the report first.', 'error'); return; }

    let body = '';
    const title = `${currentReportTab.charAt(0).toUpperCase() + currentReportTab.slice(1)} Report`;

    if (currentReportTab === 'enrollment') body = buildEnrollmentPrintHtml(cached.data);
    else if (currentReportTab === 'fees') body = buildFeesPrintHtml(cached.data);
    else if (currentReportTab === 'attendance') body = buildAttendancePrintHtml(cached.data);
    else if (currentReportTab === 'academic') body = buildAcademicPrintHtml(cached.data);
    else if (currentReportTab === 'financial') body = buildFinancialPrintHtml(cached.data);

    printPreview(body, title);
};

// ==================== PRINT TEMPLATE BUILDERS ====================
// Each builder takes the raw report data (already fetched for the live view)
// and produces plain, self-contained HTML with inline hex-color styling only.
// None of it depends on the app's dark-theme CSS variables, and none of it
// includes toolbar/filter/button chrome from the live page.

function buildEnrollmentPrintHtml(data) {
    const byGrade = data.by_grade || [];
    const byGender = data.by_gender || [];
    const maxGrade = Math.max(1, ...byGrade.map(g => g.c));

    return `
        ${printKpiGrid([
            printKpiCard('Total Students', data.total_students),
            printKpiCard('Classes Represented', byGrade.length, 'Distinct grades'),
            printKpiCard('Gender Split', byGender.map(g => `${escapeHtml(g.gender)}: ${g.c}`).join(' · ') || '-')
        ].join(''))}
        ${printSectionTitle('Students by Grade')}
        ${byGrade.length ? byGrade.map(g => printReportBar(g.grade, g.c, maxGrade)).join('') : '<p style="color:#888;">No students yet.</p>'}
    `;
}

function buildFeesPrintHtml(data) {
    const byMonth = data.by_month || [];
    const maxMonth = Math.max(1, ...byMonth.map(m => Number(m.billed)));
    const detail = data.detail || [];

    const rows = detail.slice(0, 50).map(f => `
        <tr>
            <td style="border:1px solid #ccc; padding:6px;">${escapeHtml(f.student_name || f.student_id)}</td>
            <td style="border:1px solid #ccc; padding:6px;">${escapeHtml(f.fee_type || '-')}</td>
            <td style="border:1px solid #ccc; padding:6px;">${escapeHtml(f.month || '-')}</td>
            <td style="border:1px solid #ccc; padding:6px;">Rs. ${Number(f.amount || 0).toLocaleString()}</td>
            <td style="border:1px solid #ccc; padding:6px;">Rs. ${Number(f.paid_amount || 0).toLocaleString()}</td>
            <td style="border:1px solid #ccc; padding:6px;">${escapeHtml(f.status || '-')}</td>
            <td style="border:1px solid #ccc; padding:6px;">${escapeHtml(f.due_date || '-')}</td>
        </tr>
    `).join('');

    return `
        <p style="color:#666; font-size:12px;">Period: ${data.start !== '0001-01-01' ? escapeHtml(data.start) : 'All time'} to ${data.end !== '9999-12-31' ? escapeHtml(data.end) : 'present'}</p>
        ${printKpiGrid([
            printKpiCard('Total Billed', `Rs. ${Number(data.summary.total_billed).toLocaleString()}`),
            printKpiCard('Total Collected', `Rs. ${Number(data.summary.total_collected).toLocaleString()}`, null, '#16a34a'),
            printKpiCard('Total Pending', `Rs. ${Number(data.summary.total_pending).toLocaleString()}`, null, '#dc2626')
        ].join(''))}
        ${printSectionTitle('Billed by Month')}
        ${byMonth.length ? byMonth.map(m => printReportBar(m.month || '-', Number(m.billed), maxMonth)).join('') : '<p style="color:#888;">No fee records in this range.</p>'}
        ${printSectionTitle(`Fee Records (${detail.length})`)}
        ${detail.length ? printTable(['Student', 'Type', 'Month', 'Amount', 'Paid', 'Status', 'Due'], rows) : '<p style="color:#888;">No fee records in this range.</p>'}
        ${detail.length > 50 ? `<p style="color:#888; font-size:12px;">Showing first 50 of ${detail.length} — export CSV for the full list.</p>` : ''}
    `;
}

function buildAttendancePrintHtml(data) {
    const byClass = data.by_class || [];
    const byStatus = data.by_status || [];
    const maxTotal = Math.max(1, ...byClass.map(x => x.total));

    return `
        <p style="color:#666; font-size:12px;">Period: ${escapeHtml(data.start)} to ${escapeHtml(data.end)}</p>
        ${printKpiGrid([
            printKpiCard('Overall Attendance', `${data.overall_percentage}%`, `${data.total_marked} records marked`),
            ...byStatus.map(s => printKpiCard(s.status, s.c))
        ].join(''))}
        ${printSectionTitle('Attendance by Class')}
        ${byClass.length ? byClass.map(c => printReportBar(c.class_name, c.present, maxTotal)).join('') : '<p style="color:#888;">No attendance marked in this range.</p>'}
    `;
}

function buildAcademicPrintHtml(data) {
    const exams = data.exams || [];
    const gradeDist = data.grade_distribution || [];
    const maxGrade = Math.max(1, ...gradeDist.map(g => g.c));

    const rows = exams.map(e => `
        <tr>
            <td style="border:1px solid #ccc; padding:6px;">${escapeHtml(e.class_name)}</td>
            <td style="border:1px solid #ccc; padding:6px;">${escapeHtml(e.term)}</td>
            <td style="border:1px solid #ccc; padding:6px;">${escapeHtml(e.year)}</td>
            <td style="border:1px solid #ccc; padding:6px;">${e.avg_percentage !== null ? Number(e.avg_percentage).toFixed(1) + '%' : '-'}</td>
            <td style="border:1px solid #ccc; padding:6px;">${e.student_count}</td>
        </tr>
    `).join('');

    return `
        ${printSectionTitle('Grade Distribution')}
        ${gradeDist.length ? gradeDist.map(g => printReportBar(g.grade || 'N/A', g.c, maxGrade)).join('') : '<p style="color:#888;">No results recorded yet.</p>'}
        ${printSectionTitle('Exam Averages')}
        ${exams.length ? printTable(['Class', 'Term', 'Year', 'Avg %', 'Students'], rows) : '<p style="color:#888;">No exams recorded yet.</p>'}
    `;
}

function buildFinancialPrintHtml(data) {
    const byCategory = data.expenses_by_category || [];
    const maxCategory = Math.max(1, ...byCategory.map(c => Number(c.total)));

    return `
        <p style="color:#666; font-size:12px;">Period: ${data.start !== '0001-01-01' ? escapeHtml(data.start) : 'All time'} to ${data.end !== '9999-12-31' ? escapeHtml(data.end) : 'present'}</p>
        ${printKpiGrid([
            printKpiCard('Fees Collected', `Rs. ${Number(data.fees_collected).toLocaleString()}`, null, '#16a34a'),
            printKpiCard('Fees Pending', `Rs. ${Number(data.fees_pending).toLocaleString()}`, null, '#dc2626'),
            printKpiCard('Total Expenses', `Rs. ${Number(data.expenses_total).toLocaleString()}`),
            printKpiCard('Net (Collected − Expenses)', `Rs. ${Number(data.net).toLocaleString()}`, null, data.net >= 0 ? '#16a34a' : '#dc2626')
        ].join(''))}
        ${printSectionTitle('Expenses by Category')}
        ${byCategory.length ? byCategory.map(c => printReportBar(c.category, Number(c.total), maxCategory)).join('') : '<p style="color:#888;">No expenses recorded in this range.</p>'}
    `;
}

// ==================== ENROLLMENT ====================

async function renderEnrollmentReport(box) {
    const data = await fetchAPI('/reports/enrollment');
    lastReportData.enrollment = { data };
    const byGrade = data.by_grade || [];
    const byGender = data.by_gender || [];
    const maxGrade = Math.max(1, ...byGrade.map(g => g.c));

    box.innerHTML = `
        ${reportActionBar('enrollment')}
        <div class="kpi-grid">
            <div class="kpi-card">
                <div class="kpi-label">Total Students</div>
                <div class="kpi-value">${data.total_students}</div>
                <div class="kpi-sub">Currently enrolled</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Classes Represented</div>
                <div class="kpi-value">${byGrade.length}</div>
                <div class="kpi-sub">Distinct grades</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Gender Split</div>
                <div class="kpi-value">${byGender.map(g => `${escapeHtml(g.gender)}: ${g.c}`).join(' · ')}</div>
                <div class="kpi-sub">By recorded gender</div>
            </div>
        </div>
        <div class="card">
            <div class="card-title">Students by Grade</div>
            ${byGrade.length ? byGrade.map(g => reportBar(g.grade, g.c, maxGrade)).join('') : '<div class="empty-hint">No students yet.</div>'}
        </div>
    `;
}

// ==================== FEES ====================

async function renderFeesReport(box, start, end) {
    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    const query = params.toString();
    const data = await fetchAPI(`/reports/fees${query ? '?' + query : ''}`);
    lastReportData.fees = { data };

    const byMonth = data.by_month || [];
    const maxMonth = Math.max(1, ...byMonth.map(m => Number(m.billed)));

    box.innerHTML = `
        ${reportActionBar('fees', { start: data.start, end: data.end })}
        <div class="toolbar no-print">
            <div class="form-group"><label>From</label><input type="date" id="feesReportStart" value="${data.start !== '0001-01-01' ? data.start : ''}"></div>
            <div class="form-group"><label>To</label><input type="date" id="feesReportEnd" value="${data.end !== '9999-12-31' ? data.end : ''}"></div>
            <button class="btn btn-primary btn-sm" style="align-self:flex-end;" onclick="applyFeesReportFilter()">Apply</button>
        </div>
        <div class="kpi-grid">
            <div class="kpi-card">
                <div class="kpi-label">Total Billed</div>
                <div class="kpi-value">Rs. ${Number(data.summary.total_billed).toLocaleString()}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Total Collected</div>
                <div class="kpi-value" style="color:var(--green);">Rs. ${Number(data.summary.total_collected).toLocaleString()}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Total Pending</div>
                <div class="kpi-value" style="color:var(--red);">Rs. ${Number(data.summary.total_pending).toLocaleString()}</div>
            </div>
        </div>
        <div class="card">
            <div class="card-title">Billed by Month</div>
            ${byMonth.length ? byMonth.map(m => reportBar(m.month || '-', Number(m.billed), maxMonth)).join('') : '<div class="empty-hint">No fee records in this range.</div>'}
        </div>
        <div class="section-title">Fee Records (${data.detail.length})</div>
        <div class="card">
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>Student</th><th>Type</th><th>Month</th><th>Amount</th><th>Paid</th><th>Status</th><th>Due</th></tr></thead>
                    <tbody>
                        ${data.detail.slice(0, 50).map(f => `
                            <tr>
                                <td><a href="#" onclick="event.preventDefault(); openStudentFromReport('${escapeHtml(String(f.student_id))}')" style="color:var(--accent); cursor:pointer;" title="Open student record">${escapeHtml(f.student_name || f.student_id)}</a></td>
                                <td>${escapeHtml(f.fee_type || '-')}</td>
                                <td>${escapeHtml(f.month || '-')}</td>
                                <td>Rs. ${Number(f.amount).toLocaleString()}</td>
                                <td>Rs. ${Number(f.paid_amount).toLocaleString()}</td>
                                <td>${escapeHtml(f.status)}</td>
                                <td>${escapeHtml(f.due_date || '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            ${data.detail.length > 50 ? `<div class="empty-hint">Showing first 50 of ${data.detail.length} — export CSV for the full list.</div>` : ''}
            ${data.detail.length === 0 ? '<div class="empty-hint">No fee records in this range.</div>' : ''}
        </div>
    `;
}

// Jumps from any report table's student cell straight to that student's
// Add/Edit Student dialog (switches to the Students page first, since the
// modal only exists in that page's DOM, then opens it in edit mode).
window.openStudentFromReport = async function(studentId) {
    if (!studentId) return;
    await loadPage('students');
    await editStudent(studentId);
};

window.applyFeesReportFilter = async function() {
    const start = document.getElementById('feesReportStart').value;
    const end = document.getElementById('feesReportEnd').value;
    await renderFeesReport(document.getElementById('reportContent'), start, end);
};

// ==================== ATTENDANCE ====================

async function renderAttendanceReport(box, start, end) {
    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    const query = params.toString();
    const data = await fetchAPI(`/reports/attendance${query ? '?' + query : ''}`);
    lastReportData.attendance = { data };

    const byClass = data.by_class || [];

    box.innerHTML = `
        ${reportActionBar('attendance', { start: data.start, end: data.end })}
        <div class="toolbar no-print">
            <div class="form-group"><label>From</label><input type="date" id="attReportStart" value="${data.start}"></div>
            <div class="form-group"><label>To</label><input type="date" id="attReportEnd" value="${data.end}"></div>
            <button class="btn btn-primary btn-sm" style="align-self:flex-end;" onclick="applyAttendanceReportFilter()">Apply</button>
        </div>
        <div class="kpi-grid">
            <div class="kpi-card">
                <div class="kpi-label">Overall Attendance</div>
                <div class="kpi-value">${data.overall_percentage}%</div>
                <div class="kpi-sub">${data.total_marked} records marked</div>
            </div>
            ${(data.by_status || []).map(s => `
                <div class="kpi-card">
                    <div class="kpi-label">${escapeHtml(s.status)}</div>
                    <div class="kpi-value">${s.c}</div>
                </div>
            `).join('')}
        </div>
        <div class="card">
            <div class="card-title">Attendance by Class</div>
            ${byClass.length ? byClass.map(c => reportBar(c.class_name, c.present, Math.max(1, ...byClass.map(x => x.total)))).join('') : '<div class="empty-hint">No attendance marked in this range.</div>'}
        </div>
    `;
}

window.applyAttendanceReportFilter = async function() {
    const start = document.getElementById('attReportStart').value;
    const end = document.getElementById('attReportEnd').value;
    await renderAttendanceReport(document.getElementById('reportContent'), start, end);
};

// ==================== ACADEMIC ====================

async function renderAcademicReport(box, examId) {
    const query = examId ? `?exam_id=${examId}` : '';
    const data = await fetchAPI(`/reports/academic${query}`);
    lastReportData.academic = { data };
    const exams = data.exams || [];
    const gradeDist = data.grade_distribution || [];
    const maxGrade = Math.max(1, ...gradeDist.map(g => g.c));

    box.innerHTML = `
        ${reportActionBar('academic', examId ? { exam_id: examId } : {})}
        <div class="toolbar no-print">
            <div class="form-group" style="min-width:240px;">
                <label>Exam</label>
                <select id="academicExamFilter" class="filter" onchange="applyAcademicReportFilter()">
                    <option value="">All exams</option>
                    ${exams.map(e => `<option value="${e.exam_id}" ${String(examId) === String(e.exam_id) ? 'selected' : ''}>${escapeHtml(e.class_name)} — ${escapeHtml(e.term)} ${escapeHtml(e.year)}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="card">
            <div class="card-title">Grade Distribution</div>
            ${gradeDist.length ? gradeDist.map(g => reportBar(g.grade || 'N/A', g.c, maxGrade)).join('') : '<div class="empty-hint">No results recorded yet.</div>'}
        </div>
        <div class="section-title">Exam Averages</div>
        <div class="card">
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>Class</th><th>Term</th><th>Year</th><th>Avg %</th><th>Students</th></tr></thead>
                    <tbody>
                        ${exams.map(e => `
                            <tr>
                                <td>${escapeHtml(e.class_name)}</td>
                                <td>${escapeHtml(e.term)}</td>
                                <td>${escapeHtml(e.year)}</td>
                                <td>${e.avg_percentage !== null ? Number(e.avg_percentage).toFixed(1) + '%' : '-'}</td>
                                <td>${e.student_count}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            ${exams.length === 0 ? '<div class="empty-hint">No exams recorded yet.</div>' : ''}
        </div>
    `;
}

window.applyAcademicReportFilter = async function() {
    const examId = document.getElementById('academicExamFilter').value;
    await renderAcademicReport(document.getElementById('reportContent'), examId || null);
};

// ==================== FINANCIAL ====================

async function renderFinancialReport(box, start, end) {
    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    const query = params.toString();
    const data = await fetchAPI(`/reports/financial${query ? '?' + query : ''}`);
    lastReportData.financial = { data };

    const byCategory = data.expenses_by_category || [];
    const maxCategory = Math.max(1, ...byCategory.map(c => Number(c.total)));

    box.innerHTML = `
        ${reportActionBar('financial', { start: data.start, end: data.end })}
        <div class="toolbar no-print">
            <div class="form-group"><label>From</label><input type="date" id="finReportStart" value="${data.start !== '0001-01-01' ? data.start : ''}"></div>
            <div class="form-group"><label>To</label><input type="date" id="finReportEnd" value="${data.end !== '9999-12-31' ? data.end : ''}"></div>
            <button class="btn btn-primary btn-sm" style="align-self:flex-end;" onclick="applyFinancialReportFilter()">Apply</button>
        </div>
        <div class="kpi-grid">
            <div class="kpi-card">
                <div class="kpi-label">Fees Collected</div>
                <div class="kpi-value" style="color:var(--green);">Rs. ${Number(data.fees_collected).toLocaleString()}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Fees Pending</div>
                <div class="kpi-value" style="color:var(--red);">Rs. ${Number(data.fees_pending).toLocaleString()}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Total Expenses</div>
                <div class="kpi-value">Rs. ${Number(data.expenses_total).toLocaleString()}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Net (Collected − Expenses)</div>
                <div class="kpi-value" style="color:${data.net >= 0 ? 'var(--green)' : 'var(--red)'};">Rs. ${Number(data.net).toLocaleString()}</div>
            </div>
        </div>
        <div class="card">
            <div class="card-title">Expenses by Category</div>
            ${byCategory.length ? byCategory.map(c => reportBar(c.category, Number(c.total), maxCategory)).join('') : '<div class="empty-hint">No expenses recorded in this range.</div>'}
        </div>
    `;
}

window.applyFinancialReportFilter = async function() {
    const start = document.getElementById('finReportStart').value;
    const end = document.getElementById('finReportEnd').value;
    await renderFinancialReport(document.getElementById('reportContent'), start, end);
};
