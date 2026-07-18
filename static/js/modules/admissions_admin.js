// ============================================
// ADMISSIONS_ADMIN.JS — Online Admission module:
// application review, test marks, waiting list,
// and admission approval (auto Student ID).
// ============================================

let admissionsCurrentStatus = '';
let admissionsCurrentGrade = '';
let admissionsCache = [];

async function loadAdmissions() {
    try {
        const data = await fetchAPI(`/admissions?status=${encodeURIComponent(admissionsCurrentStatus)}&grade=${encodeURIComponent(admissionsCurrentGrade)}`);
        admissionsCache = data.admissions || [];
        const grades = data.grades || [];
        const counts = data.counts || {};
        const statuses = data.statuses || ['Pending', 'Tested', 'Waiting', 'Approved', 'Rejected'];

        const applyUrl = `${window.location.origin}/admission-apply`;

        const html = `
            <div class="page-header">
                <div class="page-title">Online Admission</div>
                <div class="page-sub">Application form, test marks, waiting list, and admission approval.</div>
            </div>

            <div class="card" style="margin-bottom:16px;">
                <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
                    <div style="font-size:13px; color:var(--muted,#94a3b8);">
                        Share this link with applicants — no login required:<br>
                        <code style="color:var(--text,#f8fafc);">${applyUrl}</code>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="btn btn-ghost btn-sm" onclick="admissionsCopyLink('${applyUrl}')">📋 Copy Link</button>
                        <button class="btn btn-ghost btn-sm" onclick="window.open('${applyUrl}', '_blank')">🔗 Open Form</button>
                    </div>
                </div>
            </div>

            <div class="card" style="margin-bottom:16px;">
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    ${admissionsStatusPill('', 'All', admissionsSumCounts(counts))}
                    ${statuses.map(s => admissionsStatusPill(s, s, counts[s] || 0)).join('')}
                </div>
            </div>

            <div class="card">
                <div class="toolbar">
                    <div class="search-wrap"><input type="text" id="admissionSearch" placeholder="Search name, applicant no, phone, CNIC..." onkeyup="if(event.key==='Enter') filterAdmissions()"></div>
                    <select id="admissionGradeFilter" class="filter" onchange="filterAdmissions()">
                        <option value="">All Grades</option>
                        ${grades.map(g => `<option value="${escapeHtml(g)}" ${g === admissionsCurrentGrade ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('')}
                    </select>
                    <button onclick="filterAdmissions()" class="btn btn-ghost btn-sm">Filter</button>
                    <button onclick="loadWaitingListView()" class="btn btn-ghost btn-sm">📋 Waiting List</button>
                </div>
                <div class="table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Applicant No</th><th>Name</th><th>Grade Applied</th><th>Phone</th>
                                <th>Test Marks</th><th>Status</th><th>Applied</th><th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="admissionsTableBody">
                            ${admissionsCache.map(admissionRowHtml).join('') || '<tr><td colspan="8" style="text-align:center; color:var(--muted,#94a3b8);">No applications found.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            ${admissionModalsHtml()}
        `;
        document.getElementById('page-content').innerHTML = html;
    } catch (error) {
        console.error('Load admissions error:', error);
        document.getElementById('page-content').innerHTML = '<div class="loading">Failed to load admissions</div>';
    }
}

function admissionsSumCounts(counts) {
    return Object.values(counts).reduce((a, b) => a + b, 0);
}

function admissionsStatusPill(status, label, count) {
    const active = admissionsCurrentStatus === status;
    return `<button class="btn ${active ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="admissionsFilterStatus('${status}')">${escapeHtml(label)} (${count})</button>`;
}

function admissionsFilterStatus(status) {
    admissionsCurrentStatus = status;
    loadAdmissions();
}

function filterAdmissions() {
    admissionsCurrentGrade = document.getElementById('admissionGradeFilter')?.value || '';
    const q = document.getElementById('admissionSearch')?.value || '';
    fetchAPI(`/admissions?q=${encodeURIComponent(q)}&status=${encodeURIComponent(admissionsCurrentStatus)}&grade=${encodeURIComponent(admissionsCurrentGrade)}`)
        .then(data => {
            admissionsCache = data.admissions || [];
            const tbody = document.getElementById('admissionsTableBody');
            if (tbody) {
                tbody.innerHTML = admissionsCache.map(admissionRowHtml).join('') || '<tr><td colspan="8" style="text-align:center; color:var(--muted,#94a3b8);">No applications found.</td></tr>';
            }
        })
        .catch(() => showAlert('Failed to filter applications', 'error'));
}

function admissionsCopyLink(url) {
    navigator.clipboard.writeText(url).then(
        () => showAlert('Application link copied to clipboard', 'success'),
        () => showAlert('Could not copy link', 'error')
    );
}

const ADMISSION_STATUS_BADGE = {
    Pending: 'badge-yellow', Tested: 'badge-blue', Waiting: 'badge-purple',
    Approved: 'badge-green', Rejected: 'badge-red'
};

function admissionRowHtml(a) {
    const badgeClass = ADMISSION_STATUS_BADGE[a.status] || 'badge-blue';
    const marks = (a.test_marks !== null && a.test_marks !== undefined) ? `${a.test_marks}/${a.test_total}` : '—';
    const appliedDate = (a.applied_date || '').split(' ')[0];

    let actions = `<button class="btn btn-ghost btn-sm" onclick="viewAdmission(${a.id})">View</button>`;
    if (a.status === 'Pending' || a.status === 'Tested' || a.status === 'Waiting') {
        actions += `<button class="btn btn-ghost btn-sm" onclick="showTestMarksModal(${a.id})">Test Marks</button>`;
        actions += `<button class="btn btn-primary btn-sm" onclick="approveAdmission(${a.id})">Approve</button>`;
        if (a.status !== 'Waiting') {
            actions += `<button class="btn btn-ghost btn-sm" onclick="waitlistAdmission(${a.id})">Waitlist</button>`;
        }
        actions += `<button class="btn btn-ghost btn-sm" onclick="rejectAdmission(${a.id})" style="color:#ef4444;">Reject</button>`;
    }
    if (a.status === 'Approved' && a.student_id) {
        actions += `<span style="font-size:11px; color:var(--muted,#94a3b8);">→ ${escapeHtml(a.student_id)}</span>`;
    }
    actions += `<button class="btn btn-ghost btn-sm" onclick="deleteAdmission(${a.id})" style="color:#ef4444;">🗑</button>`;

    return `<tr>
        <td>${escapeHtml(a.applicant_no)}</td>
        <td>${escapeHtml(a.name)}</td>
        <td>${escapeHtml(a.grade_applied)}</td>
        <td>${escapeHtml(a.phone || '-')}</td>
        <td>${marks}</td>
        <td><span class="badge ${badgeClass}">${escapeHtml(a.status)}</span></td>
        <td>${appliedDate}</td>
        <td style="white-space:nowrap;">${actions}</td>
    </tr>`;
}

function admissionModalsHtml() {
    return `
    <!-- View Modal -->
    <div id="admissionViewModal" class="modal-overlay">
        <div class="modal">
            <div class="modal-header">
                <h2>Application Details</h2>
                <span class="close-btn" onclick="closeModal('admissionViewModal')">&times;</span>
            </div>
            <div class="modal-body" id="admissionViewBody"></div>
        </div>
    </div>

    <!-- Test Marks Modal -->
    <div id="testMarksModal" class="modal-overlay">
        <div class="modal">
            <div class="modal-header">
                <h2>Admission Test Marks</h2>
                <span class="close-btn" onclick="closeModal('testMarksModal')">&times;</span>
            </div>
            <div class="modal-body">
                <form onsubmit="event.preventDefault(); saveTestMarks();">
                    <input type="hidden" id="testMarksAdmissionId">
                    <div class="form-grid">
                        <div class="form-group">
                            <label for="testMarksObtained">Obtained Marks *</label>
                            <input type="number" id="testMarksObtained" step="0.01" min="0" required>
                        </div>
                        <div class="form-group">
                            <label for="testMarksTotal">Total Marks</label>
                            <input type="number" id="testMarksTotal" step="0.01" min="1" value="100">
                        </div>
                        <div class="form-group">
                            <label for="testMarksDate">Test Date</label>
                            <input type="date" id="testMarksDate">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-ghost" onclick="closeModal('testMarksModal')">Cancel</button>
                        <button type="submit" class="btn btn-primary">Save Marks</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- Waiting List Modal -->
    <div id="waitingListModal" class="modal-overlay">
        <div class="modal">
            <div class="modal-header">
                <h2>Waiting List (merit order)</h2>
                <span class="close-btn" onclick="closeModal('waitingListModal')">&times;</span>
            </div>
            <div class="modal-body" id="waitingListBody"></div>
        </div>
    </div>`;
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
}
function openModalById(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

function viewAdmission(id) {
    const a = admissionsCache.find(x => x.id === id);
    if (!a) return;
    const body = document.getElementById('admissionViewBody');
    body.innerHTML = `
        <div class="form-grid">
            <div><b>Applicant No:</b> ${escapeHtml(a.applicant_no)}</div>
            <div><b>Status:</b> ${escapeHtml(a.status)}</div>
            <div><b>Name:</b> ${escapeHtml(a.name)}</div>
            <div><b>Father/Guardian:</b> ${escapeHtml(a.father_name || '-')}</div>
            <div><b>CNIC/B-Form:</b> ${escapeHtml(a.cnic_bform || '-')}</div>
            <div><b>DOB:</b> ${escapeHtml(a.dob || '-')}</div>
            <div><b>Gender:</b> ${escapeHtml(a.gender || '-')}</div>
            <div><b>Grade Applied:</b> ${escapeHtml(a.grade_applied)}</div>
            <div><b>Phone:</b> ${escapeHtml(a.phone || '-')}</div>
            <div><b>Email:</b> ${escapeHtml(a.email || '-')}</div>
            <div style="grid-column:1/-1;"><b>Address:</b> ${escapeHtml(a.address || '-')}</div>
            <div><b>Previous School:</b> ${escapeHtml(a.previous_school || '-')}</div>
            <div><b>Test Marks:</b> ${a.test_marks !== null && a.test_marks !== undefined ? `${a.test_marks}/${a.test_total}` : '-'}</div>
            <div><b>Applied:</b> ${escapeHtml(a.applied_date || '-')}</div>
            ${a.remarks ? `<div style="grid-column:1/-1;"><b>Remarks:</b> ${escapeHtml(a.remarks)}</div>` : ''}
            ${a.student_id ? `<div style="grid-column:1/-1;"><b>Student ID:</b> ${escapeHtml(a.student_id)}</div>` : ''}
        </div>`;
    openModalById('admissionViewModal');
}

function showTestMarksModal(id) {
    const a = admissionsCache.find(x => x.id === id);
    document.getElementById('testMarksAdmissionId').value = id;
    document.getElementById('testMarksObtained').value = a?.test_marks ?? '';
    document.getElementById('testMarksTotal').value = a?.test_total ?? 100;
    document.getElementById('testMarksDate').value = new Date().toISOString().slice(0, 10);
    openModalById('testMarksModal');
}

async function saveTestMarks() {
    const id = document.getElementById('testMarksAdmissionId').value;
    const marks = document.getElementById('testMarksObtained').value;
    const total = document.getElementById('testMarksTotal').value;
    const testDate = document.getElementById('testMarksDate').value;
    try {
        await fetchAPI(`/admissions/${id}/test-marks`, {
            method: 'POST',
            body: JSON.stringify({ marks, total, test_date: testDate })
        });
        showAlert('Test marks saved', 'success');
        closeModal('testMarksModal');
        loadAdmissions();
    } catch (error) {
        // fetchAPI already surfaced the error via showAlert.
    }
}

async function approveAdmission(id, force = false) {
    if (!force && !confirm('Approve this application? A Student record with an auto-generated ID will be created.')) return;
    try {
        const response = await fetch(`${API_BASE}/admissions/${id}/approve`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force })
        });
        const data = await response.json();
        if (!response.ok) {
            if (data.seats_full && !force) {
                if (confirm(`${data.message}\n\nApprove anyway (override seat limit)?`)) {
                    return approveAdmission(id, true);
                }
                return;
            }
            showAlert(data.message || 'Failed to approve application', 'error');
            return;
        }
        showAlert(`Approved — Student ID ${data.student_id} created`, 'success');
        loadAdmissions();
    } catch (error) {
        showAlert('Network error — failed to approve application', 'error');
    }
}

async function waitlistAdmission(id) {
    const remarks = prompt('Optional note for the waiting list:') || '';
    try {
        await fetchAPI(`/admissions/${id}/waitlist`, { method: 'POST', body: JSON.stringify({ remarks }) });
        showAlert('Moved to waiting list', 'success');
        loadAdmissions();
    } catch (error) {
        // fetchAPI already surfaced the error via showAlert.
    }
}

async function rejectAdmission(id) {
    const remarks = prompt('Reason for rejection (optional):') || '';
    if (!confirm('Reject this application?')) return;
    try {
        await fetchAPI(`/admissions/${id}/reject`, { method: 'POST', body: JSON.stringify({ remarks }) });
        showAlert('Application rejected', 'success');
        loadAdmissions();
    } catch (error) {
        // fetchAPI already surfaced the error via showAlert.
    }
}

async function deleteAdmission(id) {
    if (!confirm('Delete this application permanently?')) return;
    try {
        await fetchAPI(`/admissions/${id}`, { method: 'DELETE' });
        showAlert('Application deleted', 'success');
        loadAdmissions();
    } catch (error) {
        // fetchAPI already surfaced the error via showAlert.
    }
}

async function loadWaitingListView() {
    openModalById('waitingListModal');
    const body = document.getElementById('waitingListBody');
    body.innerHTML = '<div class="loading">Loading...</div>';
    try {
        const data = await fetchAPI(`/admissions/waiting-list?grade=${encodeURIComponent(admissionsCurrentGrade)}`);
        const list = data.waiting_list || [];
        if (!list.length) {
            body.innerHTML = '<div style="color:var(--muted,#94a3b8);">No one on the waiting list.</div>';
            return;
        }
        body.innerHTML = `
            <table class="data-table">
                <thead><tr><th>#</th><th>Applicant No</th><th>Name</th><th>Grade</th><th>Test Marks</th><th>Action</th></tr></thead>
                <tbody>
                    ${list.map((a, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td>${escapeHtml(a.applicant_no)}</td>
                            <td>${escapeHtml(a.name)}</td>
                            <td>${escapeHtml(a.grade_applied)}</td>
                            <td>${a.test_marks !== null && a.test_marks !== undefined ? `${a.test_marks}/${a.test_total}` : '—'}</td>
                            <td><button class="btn btn-primary btn-sm" onclick="closeModal('waitingListModal'); approveAdmission(${a.id});">Approve</button></td>
                        </tr>`).join('')}
                </tbody>
            </table>`;
    } catch (error) {
        body.innerHTML = '<div style="color:#ef4444;">Failed to load waiting list</div>';
    }
}
