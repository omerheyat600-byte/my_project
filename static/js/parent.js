// ============================================
// PARENT.JS — Login, sidebar navigation, and
// page rendering for the standalone Parent
// Portal. Fully independent of the admin app.js
// bundle.
// ============================================

const PARENT_API_BASE = '/api/parent';
let currentParentPage = 'dashboard';

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showAlert(message, type = 'success') {
    const alertDiv = document.getElementById('alert-container');
    if (!alertDiv) return;
    alertDiv.innerHTML = `<div class="alert alert-${type}">${escapeHtml(message)}</div>`;
    setTimeout(() => { alertDiv.innerHTML = ''; }, 3000);
}

function gradeBadge(grade) {
    if (!grade) return '<span class="badge badge-red">N/A</span>';
    const g = String(grade).trim();
    if (['A+', 'A'].includes(g)) return `<span class="badge badge-green">${escapeHtml(g)}</span>`;
    if (['B+', 'B'].includes(g)) return `<span class="badge badge-blue">${escapeHtml(g)}</span>`;
    if (g === 'C') return `<span class="badge badge-yellow">${escapeHtml(g)}</span>`;
    return `<span class="badge badge-red">${escapeHtml(g)}</span>`;
}

function statusBadge(status) {
    const s = (status || '').toLowerCase();
    if (s === 'paid' || s === 'sent') return `<span class="badge badge-green">${escapeHtml(status)}</span>`;
    if (s === 'partial') return `<span class="badge badge-yellow">${escapeHtml(status)}</span>`;
    if (s === 'pending' || s === 'failed') return `<span class="badge badge-red">${escapeHtml(status)}</span>`;
    return `<span class="badge badge-blue">${escapeHtml(status || '-')}</span>`;
}

async function parentFetch(path, options = {}) {
    const response = await fetch(`${PARENT_API_BASE}${path}`, {
        ...options,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    if (response.status === 401) {
        document.getElementById('loginOverlay').classList.add('active');
        throw new Error('Session expired. Please log in again.');
    }
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || 'Request failed');
    }
    return data;
}

// ==================== LOGIN / LOGOUT ====================

async function parentLogin() {
    const username = document.getElementById('parentUsername').value;
    const password = document.getElementById('parentPassword').value;
    const errorDiv = document.getElementById('parentLoginError');
    errorDiv.style.display = 'none';

    try {
        const response = await fetch(`${PARENT_API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (response.ok) {
            document.getElementById('parentWelcome').textContent = data.parent.full_name || data.parent.username;
            document.getElementById('loginOverlay').classList.remove('active');
            await loadParentPage('dashboard');
        } else {
            errorDiv.textContent = data.error || 'Login failed';
            errorDiv.style.display = 'block';
        }
    } catch (e) {
        errorDiv.textContent = 'Network error. Please try again.';
        errorDiv.style.display = 'block';
    }
}

async function parentLogout() {
    try {
        await fetch(`${PARENT_API_BASE}/logout`, { method: 'POST', credentials: 'include' });
    } catch (e) { /* ignore */ }
    document.getElementById('loginOverlay').classList.add('active');
    document.getElementById('parentUsername').value = '';
    document.getElementById('parentPassword').value = '';
}

// ==================== SIDEBAR NAVIGATION ====================

const PARENT_PAGE_TITLES = {
    dashboard: 'Dashboard',
    fees: 'Fees',
    results: 'Results',
    attendance: 'Attendance',
    notifications: 'Notifications',
};

async function loadParentPage(page) {
    currentParentPage = page;
    document.querySelectorAll('.parent-nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });
    document.getElementById('parentTopbarTitle').textContent = PARENT_PAGE_TITLES[page] || 'Dashboard';

    const contentDiv = document.getElementById('page-content');
    contentDiv.innerHTML = '<div class="loading">Loading…</div>';

    switch (page) {
        case 'dashboard': await loadParentDashboard(); break;
        case 'fees': await loadParentFees(); break;
        case 'results': await loadParentResults(); break;
        case 'attendance': await loadParentAttendance(); break;
        case 'notifications': await loadParentNotifications(); break;
        default: contentDiv.innerHTML = '<div class="loading">Page not found</div>';
    }
}

// ==================== DASHBOARD ====================

async function loadParentDashboard() {
    try {
        const data = await parentFetch('/dashboard');
        const s = data.student || {};
        const att = data.attendance_summary || {};
        const latestExam = (data.recent_exams || [])[0];
        const fees = data.fees_summary?.recent_fees || [];
        const exams = data.recent_exams || [];
        const notifications = data.recent_notifications || [];

        document.getElementById('page-content').innerHTML = `
            <div class="card">
                <div class="card-title">Student</div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; font-size:14px;">
                    <div><span style="color:var(--muted);">Name:</span> <strong>${escapeHtml(s.name || '-')}</strong></div>
                    <div><span style="color:var(--muted);">Student ID:</span> ${escapeHtml(s.id || '-')}</div>
                    <div><span style="color:var(--muted);">Class:</span> ${escapeHtml(s.grade || '-')}</div>
                </div>
            </div>

            <div class="kpi-grid">
                <div class="kpi-card">
                    <div class="kpi-label">Outstanding Fees</div>
                    <div class="kpi-value">Rs. ${Number(data.fees_summary?.total_unpaid || 0).toLocaleString()}</div>
                    <div class="kpi-sub">Total unpaid balance</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Attendance (30 days)</div>
                    <div class="kpi-value">${att.total_marked ? `${att.present}/${att.total_marked}` : '—'}</div>
                    <div class="kpi-sub">${att.total_marked ? `${att.present} present, ${att.absent} absent, ${att.late} late` : 'No attendance marked yet'}</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Latest Exam</div>
                    <div class="kpi-value">${latestExam ? `${latestExam.percentage ?? '-'}%` : '—'}</div>
                    <div class="kpi-sub">${latestExam ? `${latestExam.term || ''} ${latestExam.year || ''} · Grade ${latestExam.grade || '-'}` : 'No exam results yet'}</div>
                </div>
            </div>

            <div class="section-title">Recent Fee Records</div>
            <div class="card">${fees.length ? `
                <table class="data-table">
                    <thead><tr><th>Month</th><th>Type</th><th>Amount</th><th>Paid</th><th>Status</th></tr></thead>
                    <tbody>
                        ${fees.map(f => `
                            <tr>
                                <td>${escapeHtml(f.month || '-')}</td>
                                <td>${escapeHtml(f.fee_type || '-')}</td>
                                <td>Rs. ${Number(f.amount || 0).toLocaleString()}</td>
                                <td>Rs. ${Number(f.paid_amount || 0).toLocaleString()}</td>
                                <td>${statusBadge(f.status)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            ` : '<div class="empty-hint">No fee records yet.</div>'}</div>

            <div class="section-title">Recent Exam Results</div>
            <div class="card">${renderExamBlocks(exams)}</div>

            <div class="section-title">Recent Notifications</div>
            <div class="card">${renderNotificationTable(notifications)}</div>
        `;
    } catch (e) {
        console.error('Dashboard load error:', e);
    }
}

function renderExamBlocks(exams) {
    if (!exams.length) return '<div class="empty-hint">No exam results yet.</div>';
    return exams.map(exam => `
        <div style="margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <strong>${escapeHtml(exam.term || '-')} ${escapeHtml(exam.year || '')}</strong>
                <span>${exam.percentage ?? '-'}% ${gradeBadge(exam.grade)}</span>
            </div>
            <table class="data-table">
                <thead><tr><th>Subject</th><th>Obtained</th><th>Total</th></tr></thead>
                <tbody>
                    ${(exam.subjects || []).map(sub => `
                        <tr>
                            <td>${escapeHtml(sub.subject)}</td>
                            <td>${sub.obtained_marks}</td>
                            <td>${sub.total_marks}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `).join('');
}

function renderNotificationTable(notifications) {
    if (!notifications.length) return '<div class="empty-hint">No notifications yet.</div>';
    return `
        <table class="data-table">
            <thead><tr><th>Date</th><th>Message</th><th>Status</th></tr></thead>
            <tbody>
                ${notifications.map(n => `
                    <tr>
                        <td>${escapeHtml(n.sent_at || '-')}</td>
                        <td>${escapeHtml(n.message || '-')}</td>
                        <td>${statusBadge(n.status)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// ==================== FEES PAGE (full history) ====================

async function loadParentFees() {
    try {
        const data = await parentFetch('/fees');
        const fees = data.fees || [];
        document.getElementById('page-content').innerHTML = `
            <div class="kpi-grid">
                <div class="kpi-card">
                    <div class="kpi-label">Total Outstanding</div>
                    <div class="kpi-value" style="color:var(--red)">Rs. ${Number(data.total_unpaid || 0).toLocaleString()}</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Total Records</div>
                    <div class="kpi-value">${fees.length}</div>
                </div>
            </div>
            <div class="card">
                ${fees.length ? `
                    <table class="data-table">
                        <thead><tr><th>Month</th><th>Fee Type</th><th>Amount</th><th>Discount</th><th>Fine</th><th>Paid</th><th>Balance</th><th>Status</th><th>Due Date</th><th>Paid Date</th></tr></thead>
                        <tbody>
                            ${fees.map(f => {
                                const discount = parseFloat(f.discount_amount || 0);
                                const fine = parseFloat(f.fine_amount || 0);
                                const net = parseFloat(f.amount || 0) - discount + fine;
                                const paid = parseFloat(f.paid_amount || 0);
                                const balance = net - paid;
                                return `
                                <tr>
                                    <td>${escapeHtml(f.month || '-')}</td>
                                    <td>${escapeHtml(f.fee_type || '-')}</td>
                                    <td>Rs. ${Number(f.amount || 0).toLocaleString()}</td>
                                    <td>${discount > 0 ? '-Rs. ' + discount.toLocaleString() : '-'}</td>
                                    <td>${fine > 0 ? 'Rs. ' + fine.toLocaleString() : '-'}</td>
                                    <td>Rs. ${paid.toLocaleString()}</td>
                                    <td style="font-weight:600; color:${balance > 0 ? 'var(--red)' : 'inherit'};">Rs. ${balance.toLocaleString()}</td>
                                    <td>${statusBadge(f.status)}</td>
                                    <td>${f.due_date || '-'}</td>
                                    <td>${f.paid_date || '-'}</td>
                                </tr>
                            `;
                            }).join('')}
                        </tbody>
                    </table>
                ` : '<div class="empty-hint">No fee records yet.</div>'}
            </div>
        `;
    } catch (e) {
        console.error('Fees load error:', e);
        document.getElementById('page-content').innerHTML = '<div class="loading">Failed to load fees.</div>';
    }
}

// ==================== RESULTS PAGE (full history) ====================

async function loadParentResults() {
    try {
        const data = await parentFetch('/results');
        const exams = data.exams || [];
        document.getElementById('page-content').innerHTML = `
            <div class="card">${renderExamBlocks(exams)}</div>
        `;
    } catch (e) {
        console.error('Results load error:', e);
        document.getElementById('page-content').innerHTML = '<div class="loading">Failed to load results.</div>';
    }
}

// ==================== ATTENDANCE PAGE (full history) ====================

async function loadParentAttendance() {
    try {
        const data = await parentFetch('/attendance');
        const records = data.records || [];
        const summary = data.summary || {};
        document.getElementById('page-content').innerHTML = `
            <div class="kpi-grid">
                <div class="kpi-card"><div class="kpi-label">Present</div><div class="kpi-value" style="color:var(--green)">${summary.present || 0}</div></div>
                <div class="kpi-card"><div class="kpi-label">Absent</div><div class="kpi-value" style="color:var(--red)">${summary.absent || 0}</div></div>
                <div class="kpi-card"><div class="kpi-label">Late</div><div class="kpi-value" style="color:var(--yellow)">${summary.late || 0}</div></div>
                <div class="kpi-card"><div class="kpi-label">Leave</div><div class="kpi-value">${summary.leave || 0}</div></div>
            </div>
            <div class="section-title">Last 30 Days</div>
            <div class="card">
                ${records.length ? `
                    <table class="data-table">
                        <thead><tr><th>Date</th><th>Status</th><th>Remarks</th></tr></thead>
                        <tbody>
                            ${records.map(r => `
                                <tr>
                                    <td>${r.date || '-'}</td>
                                    <td>${statusBadge(r.status)}</td>
                                    <td>${escapeHtml(r.remarks || '-')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : '<div class="empty-hint">No attendance marked yet.</div>'}
            </div>
        `;
    } catch (e) {
        console.error('Attendance load error:', e);
        document.getElementById('page-content').innerHTML = '<div class="loading">Failed to load attendance.</div>';
    }
}

// ==================== NOTIFICATIONS PAGE (full history) ====================

async function loadParentNotifications() {
    try {
        const data = await parentFetch('/notifications');
        const notifications = data.notifications || [];
        document.getElementById('page-content').innerHTML = `
            <div class="card">${renderNotificationTable(notifications)}</div>
        `;
    } catch (e) {
        console.error('Notifications load error:', e);
        document.getElementById('page-content').innerHTML = '<div class="loading">Failed to load notifications.</div>';
    }
}

// ==================== INIT ====================

document.addEventListener('DOMContentLoaded', async () => {
    document.querySelectorAll('.parent-nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            if (page) loadParentPage(page);
        });
    });

    try {
        const response = await fetch(`${PARENT_API_BASE}/check-auth`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            if (data.authenticated) {
                document.getElementById('parentWelcome').textContent = data.full_name || data.username;
                document.getElementById('loginOverlay').classList.remove('active');
                await loadParentPage('dashboard');
                return;
            }
        }
    } catch (e) { /* fall through to login */ }
    document.getElementById('loginOverlay').classList.add('active');
});
