// ============================================
// STUDENTS.JS — Students list page, student
// modal CRUD, filtering, printing, admission
// number, and photo upload.
// ============================================

let studentPhotoFile = null;   // currently-selected File object, pending upload
let studentCurrentPhotoPath = null; // photo already on file for the student being edited

// ============================================
// STUDENTS MODULE (FULL)
// ============================================
// ============================================
// STUDENT QUICK VIEW MODAL
// A read-only popup for jumping to a student from a list on another
// page (Promotions roster, Examination merit lists, Results marksheets)
// without leaving that page and losing in-progress, unsaved work there.
// Injected once into document.body, same pattern as the Fee History modal.
// ============================================
let studentQuickViewCurrentId = null;
let studentQuickViewCurrentName = null;

function ensureStudentQuickViewDom() {
    if (document.getElementById('studentQuickViewOverlay')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
        <div id="studentQuickViewOverlay" class="modal-overlay">
            <div class="modal" style="max-width:480px;">
                <div class="modal-header">
                    <h2 id="studentQuickViewTitle">Student</h2>
                    <span class="close-btn" onclick="closeStudentQuickView()">&times;</span>
                </div>
                <div class="modal-body" id="studentQuickViewBody">
                    <div class="loading">Loading...</div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-ghost" onclick="showFeeHistoryModal(studentQuickViewCurrentId, studentQuickViewCurrentName)">💰 Fee History</button>
                    <button type="button" class="btn btn-primary" onclick="openFullStudentRecord()">✏ Edit Full Record</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(wrap.firstElementChild);
}

window.showStudentQuickView = async function(studentId) {
    if (!studentId) return;
    ensureStudentQuickViewDom();
    studentQuickViewCurrentId = studentId;
    studentQuickViewCurrentName = null;
    document.getElementById('studentQuickViewOverlay').classList.add('active');
    const body = document.getElementById('studentQuickViewBody');
    body.innerHTML = '<div class="loading">Loading...</div>';
    try {
        const s = await fetchAPI(`/students/${studentId}`);
        studentQuickViewCurrentName = s.name || '';
        document.getElementById('studentQuickViewTitle').innerText = s.name || 'Student';
        body.innerHTML = `
            <div style="display:flex; gap:14px; align-items:flex-start; margin-bottom:14px;">
                ${s.photo_path ? `<img src="${s.photo_path}" style="width:72px;height:72px;border-radius:10px;object-fit:cover;border:1px solid var(--border,#334155);">` : ''}
                <div>
                    <div style="font-weight:700; font-size:16px;">${escapeHtml(s.name || '-')}</div>
                    <div style="color:var(--muted,#94a3b8); font-size:13px;">${escapeHtml(s.grade || '-')} · Roll No. ${s.roll_no != null ? escapeHtml(String(s.roll_no)) : '-'}</div>
                </div>
            </div>
            <div class="form-grid" style="font-size:13px;">
                <div class="form-group"><label>Admission No.</label>${escapeHtml(s.admission_no || '-')}</div>
                <div class="form-group"><label>Gender</label>${escapeHtml(s.gender || '-')}</div>
                <div class="form-group"><label>Date of Birth</label>${escapeHtml(s.dob || '-')}</div>
                <div class="form-group"><label>Phone</label>${escapeHtml(s.phone || '-')}</div>
                <div class="form-group"><label>Email</label>${escapeHtml(s.email || '-')}</div>
                <div class="form-group"><label>Join Date</label>${escapeHtml(s.join_date || '-')}</div>
                <div class="form-group full"><label>Address</label>${escapeHtml(s.address || '-')}</div>
                <div class="form-group"><label>Parent Name</label>${escapeHtml(s.parent_name || '-')}</div>
                <div class="form-group"><label>Parent Phone</label>${escapeHtml(s.parent_phone || '-')}</div>
            </div>
        `;
    } catch (e) {
        body.innerHTML = '<div style="color:var(--red);">Failed to load student.</div>';
    }
};

window.closeStudentQuickView = function() {
    const el = document.getElementById('studentQuickViewOverlay');
    if (el) el.classList.remove('active');
};

// The one action from Quick View that DOES leave the current page —
// used only when the user explicitly asks to edit the full record.
window.openFullStudentRecord = async function() {
    if (!studentQuickViewCurrentId) return;
    const id = studentQuickViewCurrentId;
    closeStudentQuickView();
    await loadPage('students');
    await editStudent(id);
};

async function loadStudents() {
    try {
        // Fetch both students and classes in parallel
        const [studentsData, classesData] = await Promise.all([
            fetchAPI('/students'),
            fetchAPI('/classes')
        ]);

        const students = studentsData.students || [];
        const classes = classesData.classes || [];

        // Build dropdown options from real class names
        const gradeOptions = classes.map(c =>
            `<option value="${escapeHtml(c.class_name)}">${escapeHtml(c.class_name)}</option>`
        ).join('');

        const html = `
            <div class="page-header">
                <div class="page-title">Students</div>
                <div class="page-sub">Manage student records, admissions, and profiles.</div>
                <button onclick="printStudentsList()" class="btn btn-primary" style="float:right; margin-top:-50px;">🖨 Print List</button>
            </div>
            <div class="card">
                <div class="toolbar">
                    <div class="search-wrap"><input type="text" id="studentSearch" placeholder="Search name, ID, admission no..."></div>
                    <select id="gradeFilter" class="filter">
                        <option value="">All Grades</option>
                        ${classes.map(c => `<option value="${c.class_name}">${c.class_name}</option>`).join('')}
                    </select>
                    <button onclick="filterStudents()" class="btn btn-ghost btn-sm">Filter</button>
                    <button onclick="resetRollNumbersForSelectedGrade()" class="btn btn-ghost btn-sm">🔄 Reset Roll Numbers</button>
                    <button onclick="showStudentModal()" class="btn btn-primary">+ Add Student</button>
                </div>
                <div class="table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr><th></th><th>ID</th><th>Roll No</th><th>Admission No</th><th>Name</th><th>Grade</th><th>Gender</th><th>Parent</th><th>Phone</th><th>Actions</th></tr>
                        </thead>
                        <tbody id="studentsTableBody">
                            ${students.map(studentRowHtml).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            <!-- Student Modal -->
            <div id="studentModal" class="modal-overlay">
                <div class="modal">
                    <div class="modal-header">
                        <h2 id="studentModalTitle">Add Student</h2>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <button type="button" id="studentFeeHistoryBtn" class="btn btn-ghost btn-sm" style="display:none;" onclick="openFeeHistoryFromStudentModal()">💰 Fee History</button>
                            <span class="close-btn" onclick="closeStudentModal()">&times;</span>
                        </div>
                    </div>
                    <div class="modal-body">
                        <form id="studentForm" onsubmit="event.preventDefault(); saveStudent();">
                            <input type="hidden" id="studentId">
                            <div style="display:flex; gap:16px; align-items:flex-start; margin-bottom:14px;">
                                <div>
                                    <img id="studentPhotoPreview" src="" alt="" style="width:84px;height:84px;border-radius:10px;object-fit:cover;background:var(--card2,#1e293b);border:1px solid var(--border,#334155);display:none;">
                                    <div id="studentPhotoPlaceholder" style="width:84px;height:84px;border-radius:10px;background:var(--card2,#1e293b);border:1px dashed var(--border,#334155);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--muted,#94a3b8);text-align:center;">No Photo</div>
                                </div>
                                <div style="flex:1;">
                                    <label>Student Photo</label>
                                    <input type="file" id="studentPhotoInput" accept="image/png,image/jpeg,image/webp" onchange="onStudentPhotoSelected(event)">
                                    <div style="font-size:11px;color:var(--muted,#94a3b8);margin-top:4px;">JPG/PNG/WebP, up to 3MB. Used on ID cards and the admission form.</div>
                                </div>
                            </div>
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="studentAdmissionNo">Admission No.</label>
                                    <input type="text" id="studentAdmissionNo" placeholder="Auto-generated">
                                </div>
                                <div class="form-group">
                                    <label for="studentRollNo">Roll No.</label>
                                    <input type="number" id="studentRollNo" placeholder="Auto (via Reset Roll Numbers)" min="1">
                                </div>
                                <div class="form-group">
                                    <label for="studentGrade">Grade *</label>
                                    <select id="studentGrade" required>
                                        <option value="">Select Class</option>
                                        ${gradeOptions}
                                    </select>
                                </div>
                                <div class="form-group full">
                                    <label for="studentName">Full Name *</label>
                                    <input type="text" id="studentName" required>
                                </div>
                                <div class="form-group">
                                    <label for="studentGender">Gender</label>
                                    <select id="studentGender">
                                        <option value="">Select</option>
                                        <option>Male</option>
                                        <option>Female</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="studentDob">Date of Birth</label>
                                    <input type="date" id="studentDob">
                                </div>
                                <div class="form-group">
                                    <label for="studentPhone">Phone</label>
                                    <input type="text" id="studentPhone">
                                </div>
                                <div class="form-group">
                                    <label for="studentEmail">Email</label>
                                    <input type="email" id="studentEmail">
                                </div>
                                <div class="form-group full">
                                    <label for="studentAddress">Address</label>
                                    <input type="text" id="studentAddress">
                                </div>
                                <div class="form-group">
                                    <label for="studentParentName">Parent Name</label>
                                    <input type="text" id="studentParentName">
                                </div>
                                <div class="form-group">
                                    <label for="studentParentPhone">Parent Phone</label>
                                    <input type="text" id="studentParentPhone">
                                </div>
                                <div class="form-group">
                                    <label for="studentJoinDate">Join Date</label>
                                    <input type="date" id="studentJoinDate">
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-ghost" onclick="closeStudentModal()">Cancel</button>
                                <button type="submit" class="btn btn-primary">Save Student</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('page-content').innerHTML = html;
    } catch (error) {
        console.error(error);
        document.getElementById('page-content').innerHTML = '<div class="loading">Failed to load students.</div>';
    }
}

function studentPhotoThumbHtml(s) {
    if (s.photo_path) {
        return `<img src="${escapeHtml(s.photo_path)}" alt="" style="width:32px;height:32px;border-radius:6px;object-fit:cover;" onerror="this.style.display='none';">`;
    }
    return `<div style="width:32px;height:32px;border-radius:6px;background:var(--card2,#1e293b);"></div>`;
}

function studentRowHtml(s) {
    return `
        <tr>
            <td>${studentPhotoThumbHtml(s)}</td>
            <td style="font-family:monospace;color:var(--accent)">${escapeHtml(s.id)}</td>
            <td style="text-align:center;">${s.roll_no != null ? escapeHtml(String(s.roll_no)) : '-'}</td>
            <td style="font-family:monospace;">${escapeHtml(s.admission_no || '-')}</td>
            <td style="font-weight:500">${escapeHtml(s.name)}</td>
            <td><span class="badge badge-blue">${escapeHtml(s.grade)}</span></td>
            <td>${escapeHtml(s.gender || '-')}</td>
            <td>${escapeHtml(s.parent_name || '-')}</td>
            <td>${escapeHtml(s.phone || '-')}</td>
            <td class="actions">
                <button onclick="editStudent('${escapeHtml(s.id)}')" class="btn btn-ghost btn-sm">✏ Edit</button>
                <button onclick="printAdmissionForm('${escapeHtml(s.id)}')" class="btn btn-ghost btn-sm">🎫 Admission Form</button>
                <button onclick="printStudentCard('${escapeHtml(s.id)}')" class="btn btn-ghost btn-sm">🖨 ID Card</button>
                <button onclick="deleteStudent('${escapeHtml(s.id)}')" class="btn btn-danger btn-sm">🗑 Delete</button>
            </td>
        </tr>
    `;
}

// ==================== STUDENT MODAL FUNCTIONS ====================

window.showStudentModal = async function() {
    const modal = document.getElementById('studentModal');
    if (!modal) return;

    document.getElementById('studentModalTitle').innerText = 'Add Student';
    document.getElementById('studentForm').reset();
    document.getElementById('studentId').value = '';
    resetStudentPhotoUI();
    const feeHistoryBtn = document.getElementById('studentFeeHistoryBtn');
    if (feeHistoryBtn) feeHistoryBtn.style.display = 'none';
    modal.classList.add('active');

    // Pre-fill the next admission number — still editable/overridable
    // before saving, this is just a sensible default.
    try {
        const res = await fetchAPI('/students/next-admission-no');
        document.getElementById('studentAdmissionNo').value = res.admission_no || '';
    } catch (e) {
        console.error('Could not fetch next admission number', e);
    }
};

window.closeStudentModal = function() {
    const modal = document.getElementById('studentModal');
    if (modal) modal.classList.remove('active');
};

function resetStudentPhotoUI() {
    studentPhotoFile = null;
    studentCurrentPhotoPath = null;
    const input = document.getElementById('studentPhotoInput');
    if (input) input.value = '';
    const preview = document.getElementById('studentPhotoPreview');
    const placeholder = document.getElementById('studentPhotoPlaceholder');
    if (preview) { preview.style.display = 'none'; preview.src = ''; }
    if (placeholder) placeholder.style.display = 'flex';
}

window.onStudentPhotoSelected = function(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
        showAlert('Photo is too large — max 3MB', 'error');
        event.target.value = '';
        return;
    }

    studentPhotoFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('studentPhotoPreview');
        const placeholder = document.getElementById('studentPhotoPlaceholder');
        if (preview) { preview.src = e.target.result; preview.style.display = 'block'; }
        if (placeholder) placeholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
};

async function uploadPendingStudentPhoto(sid) {
    if (!studentPhotoFile) return;
    try {
        const formData = new FormData();
        formData.append('photo', studentPhotoFile);
        const response = await fetch(`${API_BASE}/students/${sid}/photo`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || data.error || 'Photo upload failed');
        }
    } catch (e) {
        console.error(e);
        showAlert('Student saved, but photo upload failed: ' + e.message, 'error');
    } finally {
        studentPhotoFile = null;
    }
}

window.saveStudent = async function() {
    const id = document.getElementById('studentId').value;
    const data = {
        name: document.getElementById('studentName').value,
        grade: document.getElementById('studentGrade').value,
        gender: document.getElementById('studentGender').value,
        dob: document.getElementById('studentDob').value,
        phone: document.getElementById('studentPhone').value,
        email: document.getElementById('studentEmail').value,
        address: document.getElementById('studentAddress').value,
        parent_name: document.getElementById('studentParentName').value,
        parent_phone: document.getElementById('studentParentPhone').value,
        join_date: document.getElementById('studentJoinDate').value,
        admission_no: document.getElementById('studentAdmissionNo').value.trim(),
        roll_no: document.getElementById('studentRollNo').value.trim()
    };
    if (!data.name || !data.grade) {
        showAlert('Please fill in all required fields', 'error');
        return;
    }
    try {
        let sid = id;
        if (id) {
            await fetchAPI(`/students/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        } else {
            const res = await fetchAPI('/students', { method: 'POST', body: JSON.stringify(data) });
            sid = res.id;
        }

        await uploadPendingStudentPhoto(sid);

        showAlert(id ? 'Student updated successfully' : 'Student added successfully');
        closeStudentModal();
        await loadStudents();
    } catch (e) {
        console.error(e);
    }
};

window.editStudent = async function(id) {
    try {
        const student = await fetchAPI(`/students/${id}`);
        document.getElementById('studentModalTitle').innerText = 'Edit Student';
        document.getElementById('studentId').value = student.id;
        document.getElementById('studentAdmissionNo').value = student.admission_no || '';
        document.getElementById('studentRollNo').value = student.roll_no != null ? student.roll_no : '';
        document.getElementById('studentName').value = student.name || '';
        document.getElementById('studentGrade').value = student.grade || '';
        document.getElementById('studentGender').value = student.gender || '';
        document.getElementById('studentDob').value = student.dob || '';
        document.getElementById('studentPhone').value = student.phone || '';
        document.getElementById('studentEmail').value = student.email || '';
        document.getElementById('studentAddress').value = student.address || '';
        document.getElementById('studentParentName').value = student.parent_name || '';
        document.getElementById('studentParentPhone').value = student.parent_phone || '';
        document.getElementById('studentJoinDate').value = student.join_date || '';

        resetStudentPhotoUI();
        if (student.photo_path) {
            studentCurrentPhotoPath = student.photo_path;
            const preview = document.getElementById('studentPhotoPreview');
            const placeholder = document.getElementById('studentPhotoPlaceholder');
            if (preview) { preview.src = student.photo_path; preview.style.display = 'block'; }
            if (placeholder) placeholder.style.display = 'none';
        }

        const feeHistoryBtn = document.getElementById('studentFeeHistoryBtn');
        if (feeHistoryBtn) feeHistoryBtn.style.display = 'inline-block';

        document.getElementById('studentModal').classList.add('active');
    } catch (e) {
        showAlert('Failed to load student data', 'error');
    }
};

// Opens the Fee History modal (defined in fees.js) for whichever student
// is currently loaded into the Add/Edit Student form.
window.openFeeHistoryFromStudentModal = function() {
    const id = document.getElementById('studentId').value;
    const name = document.getElementById('studentName').value;
    if (!id) {
        showAlert('Save the student first to view their fee history.', 'error');
        return;
    }
    showFeeHistoryModal(id, name);
};

window.deleteStudent = async function(id) {
    if (confirm('Delete this student?')) {
        try {
            await fetchAPI(`/students/${id}`, { method: 'DELETE' });
            showAlert('Student deleted successfully');
            await loadStudents();
        } catch (e) {
            console.error(e);
        }
    }
};

window.filterStudents = async function() {
    const search = document.getElementById('studentSearch')?.value || '';
    const grade = document.getElementById('gradeFilter')?.value || '';
    const data = await fetchAPI(`/students?q=${encodeURIComponent(search)}&grade=${encodeURIComponent(grade)}`);
    const tbody = document.getElementById('studentsTableBody');
    if (tbody) {
        tbody.innerHTML = (data.students || []).map(studentRowHtml).join('');
    }
};

window.resetRollNumbersForSelectedGrade = async function() {
    const grade = document.getElementById('gradeFilter')?.value || '';
    if (!grade) { showAlert('Select a class in the grade filter first, then Reset Roll Numbers', 'error'); return; }
    if (!confirm(`Re-assign roll numbers 1..N (alphabetical) for every active student in "${grade}"? This overwrites any existing roll numbers in this class.`)) return;
    try {
        const res = await fetchAPI('/students/reset-roll-numbers', { method: 'POST', body: JSON.stringify({ grade }) });
        showAlert(res.message || 'Roll numbers reset');
        await filterStudents();
    } catch (e) {
        console.error(e);
    }
};

window.printStudentsList = async function() {
    const data = await fetchAPI('/students');
    let rows = '';
    (data.students || []).forEach(s => {
        rows += `<tr><td>${escapeHtml(s.id)}</td><td>${s.roll_no != null ? escapeHtml(String(s.roll_no)) : '-'}</td><td>${escapeHtml(s.admission_no || '-')}</td><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.grade)}</td><td>${escapeHtml(s.gender || '-')}</td><td>${escapeHtml(s.parent_name || '-')}</td><td>${escapeHtml(s.phone || '-')}</td></tr>`;
    });
    printPreview(`<h3>Students List - Total: ${(data.students || []).length}</h3><table class="data-table"><thead><tr><th>ID</th><th>Roll No</th><th>Admission No</th><th>Name</th><th>Grade</th><th>Gender</th><th>Parent</th><th>Phone</th></tr></thead><tbody>${rows}</tbody></table>`, 'Students Report');
};

// printStudentCard() lives in id_cards.js — renders a real
// modern, professional wallet-sized ID card.
// printAdmissionForm() lives in admission.js — renders the
// printable admission form document.
