// API Configuration
const API_BASE = 'http://127.0.0.1:5001/api';

// State
let currentPage = 'dashboard';
let charts = {};

// ================= ALERT =================
function showAlert(message, type = 'success') {
    const alertDiv = document.getElementById('alert-container');
    if (!alertDiv) return;

    alertDiv.innerHTML = `<div class="alert alert-${type}">${escapeHtml(message)}</div>`;

    setTimeout(() => {
        alertDiv.innerHTML = '';
    }, 3000);
}

// ================= API WRAPPER =================
async function fetchAPI(url, options = {}) {
    try {
        const response = await fetch(`${API_BASE}${url}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || data.message || 'API request failed');
        }
    
        return data;

    } catch (error) {
        showAlert(error.message, 'error');
        throw error;
    }
}

// ================= GRADES =================
function getGradeBadge(grade) {
    if (!grade) return '<span class="badge badge-red">N/A</span>';

    const g = String(grade).trim();

    if (['A+', 'A'].includes(g)) return `<span class="badge badge-green">${g}</span>`;
    if (['B+', 'B'].includes(g)) return `<span class="badge badge-blue">${g}</span>`;
    if (g === 'C') return `<span class="badge badge-yellow">${g}</span>`;

    return `<span class="badge badge-red">${g}</span>`;
}

// ================= HTML ESCAPE =================
function escapeHtml(text) {
    if (text === null || text === undefined) return '';

    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ================= PRINT =================
async function printPreview(content, title) {
    const printWindow = window.open('', '_blank');
    const currentDate = new Date().toLocaleString();

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${escapeHtml(title)}</title>
            <style>
                body { font-family: Arial; padding: 30px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #ccc; padding: 8px; }
                th { background: #f3f3f3; }
            </style>
        </head>
        <body>
            <h2>${escapeHtml(title)}</h2>
            <p>Generated: ${currentDate}</p>
            ${content}
            <script>
                window.onload = () => setTimeout(() => window.print(), 500);
            </script>
        </body>
        </html>
    `);

    printWindow.document.close();
}

// ================= NAVIGATION =================
document.addEventListener('DOMContentLoaded', () => {
    const items = document.querySelectorAll('.nav-item');

    items.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();

            const page = item.dataset.page;
            if (page) loadPage(page);
        });
    });

    loadPage('dashboard');
});

async function loadPage(page) {
    currentPage = page;
    document.querySelectorAll('.nav-item').forEach(item => {
        item.dataset.page === page ? item.classList.add('active') : item.classList.remove('active');
    });
    const contentDiv = document.getElementById('page-content');
    if (!contentDiv) return;
    contentDiv.innerHTML = '<div class="loading">Loading...</div>';
    switch(page) {
        case 'dashboard': await loadDashboard(); break;
        case 'students': await loadStudents(); break;
        case 'teachers': await loadTeachers(); break;
        case 'classes': await loadClasses(); break;
        case 'results': await loadResults(); break;
        case 'fees': await loadFees(); break;
        case 'expenses': await loadExpenses(); break;
        default: contentDiv.innerHTML = '<div class="loading">Page not found</div>';
    }
}

// ============================================
// GLOBAL RESULT FUNCTIONS (Enhanced)
// ============================================

window.switchResultsView = function(view) {
    const listView = document.getElementById('resultsListViewSection');
    const excelView = document.getElementById('resultsExcelViewSection');
    const tabList = document.getElementById('tabListView');
    const tabExcel = document.getElementById('tabExcelView');
    
    if (view === 'list') {
        if (listView) listView.style.display = 'block';
        if (excelView) excelView.style.display = 'none';
        if (tabList) { tabList.classList.add('btn-primary'); tabList.classList.remove('btn-ghost'); }
        if (tabExcel) { tabExcel.classList.add('btn-ghost'); tabExcel.classList.remove('btn-primary'); }
    } else {
        if (listView) listView.style.display = 'none';
        if (excelView) excelView.style.display = 'block';
        if (tabList) { tabList.classList.add('btn-ghost'); tabList.classList.remove('btn-primary'); }
        if (tabExcel) { tabExcel.classList.add('btn-primary'); tabExcel.classList.remove('btn-ghost'); }
    }
};

window.showResultModal = function() {
    const modal = document.getElementById('resultModal');
    if (!modal) return;
    document.getElementById('resultModalTitle').innerText = 'Add Result';
    document.getElementById('resultForm').reset();
    document.getElementById('resultId').value = '';
    document.getElementById('resultTotalMarks').value = '100';
    document.getElementById('resultYear').value = new Date().getFullYear().toString();
    // Clear subject dropdown
    const subjectSelect = document.getElementById('resultSubject');
    if (subjectSelect) subjectSelect.innerHTML = '<option value="">Select subject</option>';
    const studentSelect = document.getElementById('resultStudentId');
    if (studentSelect && !studentSelect._listenerAttached) {
        studentSelect.addEventListener('change', async function() {
            await loadSubjectDropdown(this.value);
        });
        studentSelect._listenerAttached = true;
    }
    modal.classList.add('active');
};

window.closeResultModal = function() {
    const modal = document.getElementById('resultModal');
    if (modal) modal.classList.remove('active');
};

// Basic filter (with class)
window.filterResults = async function () {
    const search = document.getElementById('resultSearch')?.value || '';
    const studentId = document.getElementById('studentResultFilter')?.value || '';
    const term = document.getElementById('termFilter')?.value || '';
    const classFilter = document.getElementById('classResultFilter')?.value || '';

    let url = `/results?q=${encodeURIComponent(search)}`;
    if (studentId) url += `&student_id=${encodeURIComponent(studentId)}`;
    if (term) url += `&term=${encodeURIComponent(term)}`;
    if (classFilter) url += `&class=${encodeURIComponent(classFilter)}`;

    try {
        const data = await fetchAPI(url);
        const tbody = document.getElementById('resultsTableBody');

        const studentsData = await fetchAPI('/students');
        const studentClassMap = new Map(
            (studentsData.students || []).map(s => [s.id, s.grade || '-'])
        );

        if (!tbody) return;

        tbody.innerHTML = (data.results || []).map(r => {

            const obtained = Number(r.obtained_marks || 0);
            const total = Number(r.total_marks || 1);
            const percentage = ((obtained / total) * 100).toFixed(0);
            const studentClass = studentClassMap.get(r.student_id) || '-';

            return `
                <tr>
                    <td>${escapeHtml(r.student_name)}</td>
                    <td><span class="badge badge-blue">${escapeHtml(studentClass)}</span></td>
                    <td>${escapeHtml(r.subject)}</td>
                    <td style="text-align:center">${obtained}</td>
                    <td style="text-align:center">${total}</td>
                    <td style="text-align:center">${percentage}%</td>
                    <td style="text-align:center">${getGradeBadge(r.grade)}</td>
                    <td><span class="badge badge-purple">${escapeHtml(r.term)}</span></td>
                    <td>${r.year || '-'}</td>
                    <td>${r.exam_date || '-'}</td>
                    <td class="actions">
                        <button onclick="editResult(${r.id})">✏</button>
                        <button onclick="printStudentResultCard('${r.student_id}')">🖨</button>
                        <button onclick="deleteResult(${r.id})">🗑</button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error(error);
        showAlert('Failed to load results', 'error');
    }
};

// Advanced filter with date range
window.filterResultsAdvanced = async function () {
    const search = document.getElementById('resultSearch')?.value || '';
    const studentId = document.getElementById('studentResultFilter')?.value || '';
    const term = document.getElementById('termFilter')?.value || '';
    const classFilter = document.getElementById('classResultFilter')?.value || '';
    const dateFrom = document.getElementById('dateFromFilter')?.value || '';
    const dateTo = document.getElementById('dateToFilter')?.value || '';

    let url = `/results?q=${encodeURIComponent(search)}`;
    if (studentId) url += `&student_id=${studentId}`;
    if (term) url += `&term=${term}`;
    if (classFilter) url += `&class=${classFilter}`;
    if (dateFrom) url += `&date_from=${dateFrom}`;
    if (dateTo) url += `&date_to=${dateTo}`;

    try {
        const data = await fetchAPI(url);
        const tbody = document.getElementById('resultsTableBody');

        if (!tbody) return;

        const studentsData = await fetchAPI('/students');
        const studentClassMap = new Map(
            (studentsData.students || []).map(s => [s.id, s.grade || '-'])
        );

        tbody.innerHTML = (data.results || []).map(r => {

            const obtained = Number(r.obtained_marks || 0);
            const total = Number(r.total_marks || 1);
            const percentage = ((obtained / total) * 100).toFixed(0);

            return `
                <tr>
                    <td>${escapeHtml(r.student_name)}</td>
                    <td><span class="badge badge-blue">${studentClassMap.get(r.student_id) || '-'}</span></td>
                    <td>${escapeHtml(r.subject)}</td>
                    <td>${obtained}</td>
                    <td>${total}</td>
                    <td>${percentage}%</td>
                    <td>${getGradeBadge(r.grade)}</td>
                    <td>${r.term}</td>
                    <td>${r.year || '-'}</td>
                    <td>${r.exam_date || '-'}</td>
                    <td>
                        <button onclick="editResult(${r.id})">✏</button>
                        <button onclick="deleteResult(${r.id})">🗑</button>
                    </td>
                </tr>
            `;
        }).join('');

        showAlert(`Found ${data.results.length} results`, 'success');

    } catch (err) {
        console.error(err);
        showAlert('Filter failed', 'error');
    }
};

window.clearDateFilters = function() {
    const dateFrom = document.getElementById('dateFromFilter');
    const dateTo = document.getElementById('dateToFilter');
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    filterResultsAdvanced();
};

window.exportResultsToCSV = async function() {
    try {
        const search = document.getElementById('resultSearch')?.value || '';
        const studentId = document.getElementById('studentResultFilter')?.value || '';
        const term = document.getElementById('termFilter')?.value || '';
        const classFilter = document.getElementById('classResultFilter')?.value || '';
        const dateFrom = document.getElementById('dateFromFilter')?.value || '';
        const dateTo = document.getElementById('dateToFilter')?.value || '';
        
        let url = `/results?q=${encodeURIComponent(search)}`;
        if (studentId) url += `&student_id=${encodeURIComponent(studentId)}`;
        if (term) url += `&term=${encodeURIComponent(term)}`;
        if (classFilter) url += `&class=${encodeURIComponent(classFilter)}`;
        if (dateFrom) url += `&date_from=${encodeURIComponent(dateFrom)}`;
        if (dateTo) url += `&date_to=${encodeURIComponent(dateTo)}`;
        
        const data = await fetchAPI(url);
        const results = data.results || [];
        if (!results.length) { showAlert('No data to export', 'error'); return; }
        
        const studentsData = await fetchAPI('/students');
        const studentClassMap = new Map();
        (studentsData.students || []).forEach(s => studentClassMap.set(s.id, s.grade || '-'));
        
        const headers = ['Student ID', 'Student Name', 'Class', 'Subject', 'Obtained Marks', 'Total Marks', 'Percentage', 'Grade', 'Term', 'Year', 'Exam Date'];
        const csvRows = [headers];
        
        results.forEach(r => {
            const percentage = ((r.obtained_marks / r.total_marks) * 100).toFixed(2);
            const studentClass = studentClassMap.get(r.student_id) || '-';
            csvRows.push([
                r.student_id, r.student_name, studentClass, r.subject,
                r.obtained_marks, r.total_marks, percentage + '%', r.grade,
                r.term, r.year, r.exam_date || ''
            ]);
        });
        
        const csvContent = csvRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url_ = URL.createObjectURL(blob);
        link.setAttribute('href', url_);
        link.setAttribute('download', `results_export_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url_);
        showAlert(`Exported ${results.length} records to CSV`);
    } catch (error) {
        console.error('Export failed:', error);
        showAlert('Failed to export data', 'error');
    }
};

window.editResult = async function(id) {
    try {
        const data = await fetchAPI('/results');
        const result = (data.results || []).find(r => r.id === id);
        if (result) {
            document.getElementById('resultModalTitle').innerText = 'Edit Result';
            document.getElementById('resultId').value = result.id;
            document.getElementById('resultStudentId').value = result.student_id;
            document.getElementById('resultTerm').value = result.term;
            document.getElementById('resultYear').value = result.year;
            document.getElementById('resultObtainedMarks').value = result.obtained_marks;
            document.getElementById('resultTotalMarks').value = result.total_marks;
            document.getElementById('resultExamDate').value = result.exam_date || '';
            await loadSubjectDropdown(result.student_id, result.subject);
            document.getElementById('resultModal').classList.add('active');
        }
    } catch (error) {
        showAlert('Failed to load result data', 'error');
    }
};

window.saveResult = async function () {
    const id = document.getElementById('resultId').value;

    const data = {
        student_id: document.getElementById('resultStudentId').value,
        subject: document.getElementById('resultSubject').value,
        term: document.getElementById('resultTerm').value,
        year: document.getElementById('resultYear').value,
        obtained_marks: parseFloat(document.getElementById('resultObtainedMarks').value),
        total_marks: parseFloat(document.getElementById('resultTotalMarks').value),
        exam_date: document.getElementById('resultExamDate').value
    };

    try {
        if (id) {
            await fetchAPI(`/results/${id}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
        } else {
            await fetchAPI(`/results`, {
                method: 'POST',
                body: JSON.stringify(data)
            });
        }

        showAlert('Saved successfully');
        closeResultModal();
        loadResults();

    } catch (e) {
        console.error(e);
        showAlert('Save failed', 'error');
    }
};

window.deleteResult = async function(id) {

    if (!confirm('Are you sure you want to delete this result?')) return;

    try {

        await fetchAPI(`/results/${id}`, {
            method: 'DELETE'
        });

        showAlert('Result deleted successfully');

        await loadResults();

    } catch (error) {

        console.error('Delete error:', error);

        showAlert('Failed to delete result', 'error');
    }
};



// =============================
// LOAD SUBJECT DROPDOWN
// =============================

async function loadSubjectDropdown(studentId, selectedSubject = null) {

    const subjectSelect = document.getElementById('resultSubject');

    if (!subjectSelect) return;


    if (!studentId) {

        subjectSelect.innerHTML =
            '<option value="">Select subject</option>';

        return;
    }


    try {

        const subjects = await getSubjectsForStudent(studentId);


        let html =
            '<option value="">Select subject</option>';


        subjects.forEach(sub => {


            // Backend returns object:
            // {subject_name:"Math", max_marks:100}

            let name = sub.subject_name || sub.name;


            const selected =
                selectedSubject === name
                ? 'selected'
                : '';


            html += `
                <option value="${escapeHtml(name)}" ${selected}>
                    ${escapeHtml(name)}
                </option>
            `;

        });


        subjectSelect.innerHTML = html;


    } catch(error){

        console.error(
            "Subject dropdown error:",
            error
        );

        subjectSelect.innerHTML =
        '<option value="">No subjects found</option>';
    }
}




// =============================
// GET STUDENT SUBJECTS
// =============================

async function getSubjectsForStudent(studentId){

    try {


        const student =
            await fetchAPI(`/students/${studentId}`);



        if(!student || !student.grade){

            return [];
        }



        let gradeName =
            student.grade.trim();



        const classesData =
            await fetchAPI('/classes');



        const matchedClass =
            classesData.classes.find(c =>

                c.class_name === gradeName

            );



        if(!matchedClass){

            console.warn(
                "Class not found:",
                gradeName
            );

            return [];
        }



        const subjectsData =
            await fetchAPI(
                `/classes/${matchedClass.id}/subjects`
            );



        return subjectsData.subjects || [];



    }catch(error){


        console.error(
            "Failed loading subjects:",
            error
        );


        return [];

    }
}
// ============================================
// RESULTS MODULE - MAIN LOAD FUNCTION
// ============================================

async function loadResults() {
    try {
        const [resultsData, classesData, studentsData] = await Promise.all([
            fetchAPI('/results'),
            fetchAPI('/classes'),
            fetchAPI('/students')
        ]);
        
        const studentClassMap = new Map();
        (studentsData.students || []).forEach(s => studentClassMap.set(s.id, s.grade || '-'));
        
        const html = `
            <div class="page-header">
                <div class="page-title">Results</div>
                <div class="page-sub">Academic results and performance tracking.</div>
                <div style="float: right; margin-top: -50px;">
                    <button onclick="printResultsSummary()" class="btn btn-success" style="margin-right: 10px;">📊 Print Summary</button>
                    <button onclick="printResults()" class="btn btn-primary">🖨 Print List</button>
                </div>
            </div>

            <!-- Filter Bar -->
            <div class="card" style="margin-bottom: 20px;">
                <div class="toolbar">
                    <div class="search-wrap"><input type="text" id="resultSearch" placeholder="Search results..."></div>
                    <select id="studentResultFilter" class="filter">
                        <option value="">All Students</option>
                        ${(studentsData.students || []).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
                    </select>
                    <select id="classResultFilter" class="filter">
                        <option value="">All Classes</option>
                        ${[...new Set((studentsData.students || []).map(s => s.grade).filter(Boolean))].map(c => `<option value="${c}">${escapeHtml(c)}</option>`).join('')}
                    </select>
                    <select id="termFilter" class="filter">
                        <option value="">All Terms</option>
                        <option>Term 1</option><option>Term 2</option><option>Term 3</option><option>Annual</option>
                    </select>
                    <button onclick="filterResults()" class="btn btn-ghost btn-sm">Filter</button>
                    <button onclick="showResultModal()" class="btn btn-primary">+ Add Result</button>
                </div>
            </div>

            <!-- Date Range Filter Bar -->
                   <div class="card" style="margin-bottom: 20px; background: #1e293b;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px;">
                <div class="form-group">
                    <label style="color: #94a3b8; font-size: 12px;">Date From</label>
                    <input type="date" id="dateFromFilter" class="filter" style="width: 100%;">
                </div>
                <div class="form-group">
                    <label style="color: #94a3b8; font-size: 12px;">Date To</label>
                    <input type="date" id="dateToFilter" class="filter" style="width: 100%;">
                </div>
                <div class="form-group" style="display: flex; gap: 10px; align-items: flex-end;">
                    <button onclick="filterResultsAdvanced()" class="btn btn-primary">🔍 Apply Date Filter</button>
                    <button onclick="clearDateFilters()" class="btn btn-ghost">🗑 Clear</button>
                    <button onclick="exportResultsToCSV()" class="btn btn-success">📥 Export CSV</button>
                </div>
            </div>
        </div>
            <div style="display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 1px solid #334155; padding-bottom: 10px;">
                <button onclick="switchResultsView('list')" id="tabListView" class="btn btn-primary" style="padding: 8px 16px;">📋 Records List View</button>
                <button onclick="switchResultsView('excel')" id="tabExcelView" class="btn btn-ghost" style="padding: 8px 16px;">📊 Excel Bulk Entry Grid</button>
            </div>
            
            <div id="resultsListViewSection" class="view-section">
                <div class="card">
                    <div class="table-wrap">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Student Name</th><th>Class/Grade</th><th>Subject</th><th>Obtained</th>
                                    <th>Total</th><th>%</th><th>Grade</th><th>Term</th><th>Year</th><th>Exam Date</th><th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="resultsTableBody">
                                ${(resultsData.results || []).map(r => {
                                    const percentage = ((r.obtained_marks / r.total_marks) * 100).toFixed(0);
                                    const studentClass = studentClassMap.get(r.student_id) || '-';
                                    return `<tr>
                                        <td style="font-weight:500">${escapeHtml(r.student_name)}</td>
                                        <td><span class="badge badge-blue">${escapeHtml(studentClass)}</span></td>
                                        <td>${escapeHtml(r.subject)}</td>
                                        <td style="text-align:center">${parseInt(r.obtained_marks)}</td>
                                        <td style="text-align:center">${parseInt(r.total_marks)}</td>
                                        <td style="text-align:center">${percentage}%</td>
                                        <td style="text-align:center">${getGradeBadge(r.grade)}</td>
                                        <td><span class="badge badge-purple">${escapeHtml(r.term)}</span></td>
                                        <td>${r.year || '-'}</td>
                                        <td>${r.exam_date || '-'}</td>
                                        <td class="actions">
                                            <button onclick="editResult(${r.id})" class="btn btn-ghost btn-sm">✏</button>
                                            <button onclick="printStudentResultCard('${r.student_id}')" class="btn btn-ghost btn-sm">🖨 Card</button>
                                            <button onclick="deleteResult(${r.id})" class="btn btn-danger btn-sm">🗑</button>
                                        </td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div id="resultsExcelViewSection" class="view-section" style="display: none;">
                <div class="card" style="margin-bottom: 20px;">
                    <div class="toolbar">
                        <label style="color: #94a3b8; font-weight: 500;">Select Class/Grade:</label>
                        <select id="excelGradeFilter" class="filter" style="min-width: 150px;">
                            <option value="">-- Choose Class --</option>
                            ${(classesData.classes || []).map(c => `<option value="${escapeHtml(c.class_name)}" data-class-id="${c.id}">${escapeHtml(c.class_name)}</option>`).join('')}
                        </select>
                        <label style="color: #94a3b8; font-weight: 500;">Term:</label>
                        <select id="excelTermFilter" class="filter">
                            <option>Term 1</option><option>Term 2</option><option>Term 3</option><option>Annual</option>
                        </select>
                        <label style="color: #94a3b8; font-weight: 500;">Year:</label>
                        <input type="text" id="excelYearFilter" value="2026" class="filter" style="width: 80px; text-align: center;">
                        <button onclick="loadExcelSpreadsheet()" class="btn btn-primary">📊 Open Spreadsheet</button>
                    </div>
                </div>
                <div class="card" id="excelSheetCard" style="display: none;">
                    <div class="toolbar" style="justify-content: space-between;">
                        <div class="card-title" style="margin: 0; color: #f8fafc; font-size: 16px;">Interactive Marks Matrix</div>
                        <button onclick="saveExcelSpreadsheet()" class="btn btn-success" style="background-color: #22c55e;">💾 Save All Changes</button>
                    </div>
                    <div class="table-wrap">
                        <table class="data-table excel-grid" id="excelGridTable" style="width: 100%; border-collapse: collapse;">
                            <thead id="excelHeader"></thead>
                            <tbody id="excelBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Result Modal -->
            <div id="resultModal" class="modal-overlay">
                <div class="modal">
                    <div class="modal-header">
                        <h2 id="resultModalTitle">Add Result</h2>
                        <span class="close-btn" onclick="closeResultModal()">&times;</span>
                    </div>
                    <div class="modal-body">
                        <form id="resultForm" onsubmit="event.preventDefault(); saveResult();">
                            <input type="hidden" id="resultId">
                            <div class="form-grid">
                                <div class="form-group full">
                                    <label for="resultStudentId">Student *</label>
                                    <select id="resultStudentId" required>
                                        <option value="">Select Student</option>
                                        ${(studentsData.students || []).map(s => `<option value="${s.id}">${escapeHtml(s.name)} (${escapeHtml(s.grade || 'No Class')})</option>`).join('')}
                                    </select>
                                </div>
                                <div class="form-group full">
                                    <label for="resultSubject">Subject *</label>
                                    <select id="resultSubject" required>
                                        <option value="">Select subject</option>
                                    </select>
                                </div>
                                <div class="form-group"><label for="resultTerm">Term</label><select id="resultTerm"><option>Term 1</option><option>Term 2</option><option>Term 3</option><option>Annual</option></select></div>
                                <div class="form-group"><label for="resultYear">Year</label><input type="text" id="resultYear" value="2026"></div>
                                <div class="form-group"><label for="resultObtainedMarks">Obtained Marks *</label><input type="number" step="0.01" id="resultObtainedMarks" required></div>
                                <div class="form-group"><label for="resultTotalMarks">Total Marks *</label><input type="number" step="0.01" id="resultTotalMarks" value="100" required></div>
                                <div class="form-group"><label for="resultExamDate">Exam Date</label><input type="date" id="resultExamDate"></div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-ghost" onclick="closeResultModal()">Cancel</button>
                                <button type="submit" class="btn btn-primary">Save Result</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('page-content').innerHTML = html;
    } catch (error) {
        console.error('Failed to load results:', error);
        document.getElementById('page-content').innerHTML = '<div class="loading">Failed to load results.</div>';
    }
}

// ============================================
// EXCEL GRID FUNCTIONS
// ============================================

window.loadExcelSpreadsheet = async function() {
    const grade = document.getElementById('excelGradeFilter')?.value;
    const term = document.getElementById('excelTermFilter')?.value;
    const year = document.getElementById('excelYearFilter')?.value;
    if (!grade) { showAlert('Please select a class', 'error'); return; }
    try {
        const data = await fetchAPI(`/results/excel-sheet?grade=${encodeURIComponent(grade)}&term=${encodeURIComponent(term)}&year=${encodeURIComponent(year)}`);
        const subjects = data.subjects || [];
        const students = data.students || [];
        if (!students.length) { showAlert('No students found.', 'error'); return; }
        const table = document.getElementById('excelGridTable');
        if (!table) return;
        table.innerHTML = '';
        let thead = '<thead><tr><th>Student Name</th><th>Student ID</th>';
        subjects.forEach(sub => {
        thead += `<th>${escapeHtml(sub.name)} (Max: ${sub.max_marks})</th>`;
       });
       thead += '</tr></thead><tbody>';
        students.forEach(student => {
            const studentId = student.student_id || student.id;
            const studentName = student.student_name || student.name;
            thead += `<tr>
                <td><strong>${escapeHtml(studentName)}</strong></td>
                <td>${escapeHtml(studentId)}</td>`;
            subjects.forEach(sub => {
                let val = (student.marks && student.marks[sub] !== undefined) ? student.marks[sub] : '';
                thead+=`<td><input type="number" class="marks-input" data-student-id="${escapeHtml(studentId)}" data-subject="${escapeHtml(sub.name)}" value="${val}" step="0.01" min="0" max="${sub.max_marks}" style="width:80px"></td>`;});
            
            thead += '</tr>';
        });
        thead += '</tbody>';
        table.innerHTML = thead;
        window._currentExcelContext = { students, subjects, term, year, grade };
        document.getElementById('excelSheetCard').style.display = 'block';
        showAlert('Spreadsheet loaded.', 'success');
    } catch (error) { showAlert('Could not load spreadsheet.', 'error'); }
};

window.saveExcelSpreadsheet = async function() {
    const ctx = window._currentExcelContext;
     const subjects = ctx.subjects;
    if (!ctx) { showAlert('No data to save.', 'error'); return; }
    const rows = [];
    const inputs = document.querySelectorAll('#excelGridTable .marks-input');
    const studentMarksMap = new Map();
    inputs.forEach(input => {
        const studentId = input.getAttribute('data-student-id');
        const subject = input.getAttribute('data-subject');
        let obtainedMarks = input.value.trim() === '' ? null : parseFloat(input.value.trim());
        if (!studentMarksMap.has(studentId)) {
            const student = ctx.students.find(s => (s.student_id || s.id) === studentId);
            studentMarksMap.set(studentId, { student_name: student ? (student.student_name || student.name) : '', marks: {} });
        }
        studentMarksMap.get(studentId).marks[subject] = obtainedMarks;
    });
    for (let [studentId, data] of studentMarksMap.entries()) rows.push({ student_id: studentId, student_name: data.student_name, marks: data.marks });
    try {
        const response = await fetch(`${API_BASE}/results/excel-save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grade: ctx.grade, term: ctx.term, year: ctx.year, rows }) });
        if (!response.ok) throw new Error('Save failed');
        const result = await response.json();
        showAlert(result.message || 'Saved successfully!');
        await loadResults();
        switchResultsView('list');
    } catch (error) { showAlert('Failed to save marks.', 'error'); }
};

// ============================================
// PRINT FUNCTIONS (for results)
// ============================================

async function printResults() {
    const data = await fetchAPI('/results');
    let rows = '';
    (data.results || []).forEach(r => {
        const pct = ((r.obtained_marks / r.total_marks) * 100).toFixed(0);
        rows += `<tr><td>${escapeHtml(r.student_name)}</td><td>${escapeHtml(r.subject)}</td><td style="text-align:center">${r.obtained_marks}</td><td style="text-align:center">${r.total_marks}</td><td style="text-align:center">${pct}%</td><td style="text-align:center">${escapeHtml(r.grade)}</td><td style="text-align:center">${escapeHtml(r.term)} ${r.year}</td></tr>`;
    });
    printPreview(`<h3>Results List</h3><table><thead><tr><th>Student</th><th>Subject</th><th>Obtained</th><th>Total</th><th>%</th><th>Grade</th><th>Term</th></tr></thead><tbody>${rows}</tbody></table>`, 'Results List');
}

async function printStudentResultCard(studentId) {
    try {
        const data = await fetchAPI(`/results?student_id=${studentId}`);
        if (!data.results || !data.results.length) { showAlert('No results found', 'error'); return; }
        const student = await fetchAPI(`/students/${studentId}`);
        let totalObtained = 0, totalMarks = 0, subjectRows = '';
        data.results.forEach(r => {
            totalObtained += r.obtained_marks;
            totalMarks += r.total_marks;
            const pct = ((r.obtained_marks / r.total_marks) * 100).toFixed(0);
            subjectRows += `<tr><td>${escapeHtml(r.subject)}</td><td style="text-align:center">${r.obtained_marks}</td><td style="text-align:center">${r.total_marks}</td><td style="text-align:center">${pct}%</td><td style="text-align:center">${escapeHtml(r.grade)}</td><td style="text-align:center">${escapeHtml(r.term)}</td></tr>`;
        });
        const overallPct = ((totalObtained / totalMarks) * 100).toFixed(0);
        let overallGrade = 'F';
        if (overallPct >= 90) overallGrade = 'A+';
        else if (overallPct >= 80) overallGrade = 'A';
        else if (overallPct >= 70) overallGrade = 'B+';
        else if (overallPct >= 60) overallGrade = 'B';
        else if (overallPct >= 50) overallGrade = 'C';
        else if (overallPct >= 40) overallGrade = 'D';
        const printContent = `<h2>Result Card - ${escapeHtml(student.name)}</h2>
            <div><strong>ID:</strong> ${student.id} | <strong>Grade:</strong> ${student.grade}</div>
            <table><thead><tr><th>Subject</th><th>Obtained</th><th>Total</th><th>%</th><th>Grade</th><th>Term</th></tr></thead><tbody>${subjectRows}</tbody></table>
            <div><strong>Total:</strong> ${totalObtained}/${totalMarks} | <strong>Percentage:</strong> ${overallPct}% | <strong>Grade:</strong> ${overallGrade}</div>`;
        printPreview(printContent, `Result Card - ${student.name}`);
    } catch (error) { showAlert('Failed to load result card', 'error'); }
}

async function printResultsSummary() {
    const data = await fetchAPI('/results');
    const results = data.results || [];
    if (!results.length) { showAlert('No results', 'error'); return; }
    const studentMap = new Map();
    results.forEach(r => {
        if (!studentMap.has(r.student_id)) studentMap.set(r.student_id, { name: r.student_name, id: r.student_id, totalObtained: 0, totalMarks: 0 });
        const s = studentMap.get(r.student_id);
        s.totalObtained += r.obtained_marks;
        s.totalMarks += r.total_marks;
    });
    const summary = [];
    for (let s of studentMap.values()) {
        const pct = (s.totalObtained / s.totalMarks) * 100;
        let grade = 'F';
        if (pct >= 90) grade = 'A+';
        else if (pct >= 80) grade = 'A';
        else if (pct >= 70) grade = 'B+';
        else if (pct >= 60) grade = 'B';
        else if (pct >= 50) grade = 'C';
        else if (pct >= 40) grade = 'D';
        summary.push({ ...s, percentage: pct.toFixed(2), grade });
    }
    summary.sort((a, b) => parseFloat(b.percentage) - parseFloat(a.percentage));
    let rank = 1;
    for (let i = 0; i < summary.length; i++) {
        if (i > 0 && summary[i].percentage !== summary[i-1].percentage) rank = i+1;
        summary[i].rank = rank;
    }
    let rows = '';
    summary.forEach(s => rows += `<tr><td style="text-align:center">${s.rank}</td><td>${escapeHtml(s.name)}</td><td>${s.id}</td><td style="text-align:center">${s.totalObtained}/${s.totalMarks}</td><td style="text-align:center">${s.percentage}%</td><td style="text-align:center">${escapeHtml(s.grade)}</td></tr>`);
    printPreview(`<h3>Results Summary</h3><table><thead><tr><th>Rank</th><th>Student</th><th>ID</th><th>Marks</th><th>%</th><th>Grade</th></tr></thead><tbody>${rows}</tbody></table>`, 'Results Summary');
}

// ============================================
// DASHBOARD MODULE
// ============================================
async function loadDashboard() {
    try {
        const data = await fetchAPI('/dashboard');
        const html = `
            <div class="page-header">
                <div class="page-title">Dashboard</div>
                <div class="page-sub">Overview of school performance and finances.</div>
                <button onclick="printDashboardReport()" class="btn btn-primary" style="float:right; margin-top:-50px;">🖨 Print Dashboard</button>
            </div>
            <div class="kpi-grid">
                <div class="kpi-card"><div class="kpi-label">Total Students</div><div class="kpi-value">${data.students || 0}</div><div class="kpi-sub">Enrolled this year</div></div>
                <div class="kpi-card"><div class="kpi-label">Total Teachers</div><div class="kpi-value">${data.teachers || 0}</div><div class="kpi-sub">Active staff</div></div>
                <div class="kpi-card"><div class="kpi-label">Classes</div><div class="kpi-value">${data.classes || 0}</div><div class="kpi-sub">Active classes</div></div>
                <div class="kpi-card"><div class="kpi-label">Fees Collected</div><div class="kpi-value" style="font-size:18px">PKR ${(data.fees_collected || 0).toLocaleString()}</div><div class="kpi-sub" style="color:var(--red)">PKR ${(data.fees_pending || 0).toLocaleString()} pending</div></div>
            </div>
            <div class="charts-grid">
                <div class="card"><div class="card-title">Fee Collection (Jan–Jun)</div><canvas id="feeChart" height="160"></canvas></div>
                <div class="card"><div class="card-title">Grade Distribution</div><canvas id="gradeChart" height="160"></canvas></div>
            </div>
            <div class="card">
                <div class="card-title">Recent Fee Transactions</div>
                <div class="table-wrap"><table class="data-table"><thead><tr><th>Student</th><th>Fee Type</th><th>Paid</th><th>Status</th><th>Date</th></tr></thead><tbody>${(data.recent_fees || []).map(fee => `<tr><td>${escapeHtml(fee.student_name || '-')}</td><td>${escapeHtml(fee.fee_type || '-')}</td><td>PKR ${parseInt(fee.paid_amount || 0).toLocaleString()}</td><td>${fee.status === 'Paid' ? '<span class="badge badge-green">Paid</span>' : fee.status === 'Pending' ? '<span class="badge badge-red">Pending</span>' : '<span class="badge badge-yellow">Partial</span>'}</td><td>${fee.paid_date || fee.due_date || '-'}</td></tr>`).join('')}</tbody></table></div>
            </div>
        `;
        document.getElementById('page-content').innerHTML = html;
        setTimeout(() => {
            if (charts.feeChart) charts.feeChart.destroy();
            if (charts.gradeChart) charts.gradeChart.destroy();
            const feeCtx = document.getElementById('feeChart');
            const gradeCtx = document.getElementById('gradeChart');
            if (feeCtx && data.months && data.fee_monthly) {
                charts.feeChart = new Chart(feeCtx, { type:'bar', data:{ labels:data.months, datasets:[{ label:'Collected', data:data.fee_monthly, backgroundColor:'rgba(59,130,246,0.7)', borderRadius:6 }] }, options:{ responsive:true, maintainAspectRatio:true, plugins:{ legend:{ display:false } }, scales:{ x:{ grid:{ color:'#1e3a5f' }, ticks:{ color:'#64748b' } }, y:{ grid:{ color:'#1e3a5f' }, ticks:{ color:'#64748b', callback:(v)=>'PKR '+(v/1000)+'k' } } } } });
            }
            if (gradeCtx && data.grade_labels && data.grade_data) {
                charts.gradeChart = new Chart(gradeCtx, { type:'doughnut', data:{ labels:data.grade_labels, datasets:[{ data:data.grade_data, backgroundColor:['#22c55e','#3b82f6','#60a5fa','#a855f7','#f59e0b','#ef4444'], borderWidth:0 }] }, options:{ responsive:true, maintainAspectRatio:true, plugins:{ legend:{ position:'bottom', labels:{ color:'#94a3b8', font:{ size:11 } } } } } });
            }
        }, 100);
    } catch (error) { console.error(error); document.getElementById('page-content').innerHTML = '<div class="loading">Failed to load dashboard.</div>'; }
}

function printDashboardReport() {
    const kpis = document.querySelector('.kpi-grid')?.outerHTML || '';
    const charts = document.querySelector('.charts-grid')?.outerHTML || '';
    const recent = document.querySelector('.card:last-child')?.outerHTML || '';
    printPreview(kpis+charts+recent, 'School Dashboard Report');
}

// ============================================
// STUDENTS MODULE (FULL)
// ============================================
async function loadStudents() {
    try {
        const data = await fetchAPI('/students');
        const html = `
            <div class="page-header"><div class="page-title">Students</div><div class="page-sub">Manage student records and profiles.</div><button onclick="printStudentsList()" class="btn btn-primary" style="float:right; margin-top:-50px;">🖨 Print List</button></div>
            <div class="card">
                <div class="toolbar">
                    <div class="search-wrap"><input type="text" id="studentSearch" placeholder="Search students..."></div>
                    <select id="gradeFilter" class="filter"><option value="">All Grades</option>${(data.grades || []).map(g => `<option value="${g}">${g}</option>`).join('')}</select>
                    <button onclick="filterStudents()" class="btn btn-ghost btn-sm">Filter</button>
                    <button onclick="showStudentModal()" class="btn btn-primary">+ Add Student</button>
                </div>
                <div class="table-wrap"><table class="data-table"><thead><tr><th>ID</th><th>Name</th><th>Grade</th><th>Gender</th><th>Parent</th><th>Phone</th><th>Actions</th></tr></thead><tbody id="studentsTableBody">${(data.students || []).map(s => `<tr><td style="font-family:monospace;color:var(--accent)">${escapeHtml(s.id)}</td><td style="font-weight:500">${escapeHtml(s.name)}</td><td><span class="badge badge-blue">${escapeHtml(s.grade)}</span></td><td>${escapeHtml(s.gender || '-')}</td><td>${escapeHtml(s.parent_name || '-')}</td><td>${escapeHtml(s.phone || '-')}</td><td class="actions"><button onclick="editStudent('${escapeHtml(s.id)}')" class="btn btn-ghost btn-sm">✏ Edit</button><button onclick="printStudentCard('${escapeHtml(s.id)}')" class="btn btn-ghost btn-sm">🖨 Print</button><button onclick="deleteStudent('${escapeHtml(s.id)}')" class="btn btn-danger btn-sm">🗑 Delete</button></td></tr>`).join('')}</tbody></table></div>
            </div>
            <div id="studentModal" class="modal-overlay"><div class="modal"><div class="modal-header"><h2 id="studentModalTitle">Add Student</h2><span class="close-btn" onclick="closeStudentModal()">&times;</span></div><div class="modal-body"><form id="studentForm" onsubmit="event.preventDefault(); saveStudent();"><input type="hidden" id="studentId"><div class="form-grid"><div class="form-group full"><label for="studentName">Full Name *</label><input type="text" id="studentName" required></div><div class="form-group"><label for="studentGrade">Grade *</label><select id="studentGrade" required>${[5,6,7,8,9,10,11,12].map(g => `<option>Grade ${g}</option>`).join('')}</select></div><div class="form-group"><label for="studentGender">Gender</label><select id="studentGender"><option value="">Select</option><option>Male</option><option>Female</option></select></div><div class="form-group"><label for="studentDob">Date of Birth</label><input type="date" id="studentDob"></div><div class="form-group"><label for="studentPhone">Phone</label><input type="text" id="studentPhone"></div><div class="form-group"><label for="studentEmail">Email</label><input type="email" id="studentEmail"></div><div class="form-group full"><label for="studentAddress">Address</label><input type="text" id="studentAddress"></div><div class="form-group"><label for="studentParentName">Parent Name</label><input type="text" id="studentParentName"></div><div class="form-group"><label for="studentParentPhone">Parent Phone</label><input type="text" id="studentParentPhone"></div><div class="form-group"><label for="studentJoinDate">Join Date</label><input type="date" id="studentJoinDate"></div></div><div class="modal-footer"><button type="button" class="btn btn-ghost" onclick="closeStudentModal()">Cancel</button><button type="submit" class="btn btn-primary">Save Student</button></div></form></div></div></div>
        `;
        document.getElementById('page-content').innerHTML = html;
    } catch (error) { console.error(error); document.getElementById('page-content').innerHTML = '<div class="loading">Failed to load students.</div>'; }
}

window.filterStudents = async function() {
    const search = document.getElementById('studentSearch')?.value || '';
    const grade = document.getElementById('gradeFilter')?.value || '';
    const data = await fetchAPI(`/students?q=${encodeURIComponent(search)}&grade=${encodeURIComponent(grade)}`);
    const tbody = document.getElementById('studentsTableBody');
    if (tbody) {
        tbody.innerHTML = (data.students || []).map(s => `<tr><td style="font-family:monospace;color:var(--accent)">${escapeHtml(s.id)}</td><td style="font-weight:500">${escapeHtml(s.name)}</td><td><span class="badge badge-blue">${escapeHtml(s.grade)}</span></td><td>${escapeHtml(s.gender || '-')}</td><td>${escapeHtml(s.parent_name || '-')}</td><td>${escapeHtml(s.phone || '-')}</td><td class="actions"><button onclick="editStudent('${escapeHtml(s.id)}')" class="btn btn-ghost btn-sm">✏ Edit</button><button onclick="printStudentCard('${escapeHtml(s.id)}')" class="btn btn-ghost btn-sm">🖨 Print</button><button onclick="deleteStudent('${escapeHtml(s.id)}')" class="btn btn-danger btn-sm">🗑 Delete</button></td></tr>`).join('');
    }
};

window.showStudentModal = function() { const modal = document.getElementById('studentModal'); if(modal) { document.getElementById('studentModalTitle').innerText = 'Add Student'; document.getElementById('studentForm').reset(); document.getElementById('studentId').value = ''; modal.classList.add('active'); } };
window.closeStudentModal = function() { const modal = document.getElementById('studentModal'); if(modal) modal.classList.remove('active'); };
window.editStudent = async function(id) { try { const student = await fetchAPI(`/students/${id}`); document.getElementById('studentModalTitle').innerText = 'Edit Student'; document.getElementById('studentId').value = student.id; document.getElementById('studentName').value = student.name || ''; document.getElementById('studentGrade').value = student.grade || ''; document.getElementById('studentGender').value = student.gender || ''; document.getElementById('studentDob').value = student.dob || ''; document.getElementById('studentPhone').value = student.phone || ''; document.getElementById('studentEmail').value = student.email || ''; document.getElementById('studentAddress').value = student.address || ''; document.getElementById('studentParentName').value = student.parent_name || ''; document.getElementById('studentParentPhone').value = student.parent_phone || ''; document.getElementById('studentJoinDate').value = student.join_date || ''; document.getElementById('studentModal').classList.add('active'); } catch(e) { showAlert('Failed to load student data', 'error'); } };
window.saveStudent = async function() { const id = document.getElementById('studentId').value; const data = { name: document.getElementById('studentName').value, grade: document.getElementById('studentGrade').value, gender: document.getElementById('studentGender').value, dob: document.getElementById('studentDob').value, phone: document.getElementById('studentPhone').value, email: document.getElementById('studentEmail').value, address: document.getElementById('studentAddress').value, parent_name: document.getElementById('studentParentName').value, parent_phone: document.getElementById('studentParentPhone').value, join_date: document.getElementById('studentJoinDate').value }; if(!data.name || !data.grade) { showAlert('Please fill in all required fields', 'error'); return; } try { if(id) { await fetchAPI(`/students/${id}`, { method:'PUT', body:JSON.stringify(data) }); showAlert('Student updated successfully'); } else { await fetchAPI('/students', { method:'POST', body:JSON.stringify(data) }); showAlert('Student added successfully'); } closeStudentModal(); await loadStudents(); } catch(e) { console.error(e); } };
window.deleteStudent = async function(id) { if(confirm('Delete this student?')) { try { await fetchAPI(`/students/${id}`, { method:'DELETE' }); showAlert('Student deleted successfully'); await loadStudents(); } catch(e) { console.error(e); } } };
window.printStudentsList = async function() { const data = await fetchAPI('/students'); let rows = ''; (data.students || []).forEach(s => { rows += `<tr><td>${escapeHtml(s.id)}</td><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.grade)}</td><td>${escapeHtml(s.gender || '-')}</td><td>${escapeHtml(s.parent_name || '-')}</td><td>${escapeHtml(s.phone || '-')}</td></tr>`; }); printPreview(`<h3>Students List - Total: ${(data.students || []).length}</h3><table class="data-table"><thead><tr><th>ID</th><th>Name</th><th>Grade</th><th>Gender</th><th>Parent</th><th>Phone</th></tr></thead><tbody>${rows}</tbody></table>`, 'Students Report'); };
window.printStudentCard = async function(id) { const s = await fetchAPI(`/students/${id}`); const printContent = `<div style="max-width:600px;margin:0 auto;"><h3 style="color:#3b82f6;">Student ID Card</h3><div style="border:2px solid #3b82f6;padding:20px;border-radius:10px;"><div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;"><div><strong>ID:</strong></div><div>${escapeHtml(s.id)}</div><div><strong>Name:</strong></div><div>${escapeHtml(s.name)}</div><div><strong>Grade:</strong></div><div>${escapeHtml(s.grade)}</div><div><strong>Gender:</strong></div><div>${escapeHtml(s.gender || '-')}</div><div><strong>DOB:</strong></div><div>${escapeHtml(s.dob || '-')}</div><div><strong>Phone:</strong></div><div>${escapeHtml(s.phone || '-')}</div><div><strong>Email:</strong></div><div>${escapeHtml(s.email || '-')}</div><div><strong>Address:</strong></div><div>${escapeHtml(s.address || '-')}</div><div><strong>Parent:</strong></div><div>${escapeHtml(s.parent_name || '-')}</div><div><strong>Parent Phone:</strong></div><div>${escapeHtml(s.parent_phone || '-')}</div><div><strong>Join Date:</strong></div><div>${escapeHtml(s.join_date || '-')}</div></div></div></div>`; printPreview(printContent, `Student ID Card - ${s.name}`); };

// ============================================
// TEACHERS MODULE (FULL)
// ============================================
async function loadTeachers() {
    try {
        const data = await fetchAPI('/teachers');
        const html = `
            <div class="page-header"><div class="page-title">Teachers</div><div class="page-sub">Manage teaching staff.</div><button onclick="printTeachersList()" class="btn btn-primary" style="float:right; margin-top:-50px;">🖨 Print List</button></div>
            <div class="card">
                <div class="toolbar">
                    <div class="search-wrap"><input type="text" id="teacherSearch" placeholder="Search teachers..."></div>
                    <select id="subjectFilter" class="filter"><option value="">All Subjects</option>${(data.subjects || []).map(s => `<option value="${s}">${s}</option>`).join('')}</select>
                    <button onclick="filterTeachers()" class="btn btn-ghost btn-sm">Filter</button>
                    <button onclick="showTeacherModal()" class="btn btn-primary">+ Add Teacher</button>
                </div>
                <div class="table-wrap"><table class="data-table"><thead><tr><th>ID</th><th>Name</th><th>Subject</th><th>Gender</th><th>Qualification</th><th>Salary</th><th>Actions</th></tr></thead><tbody id="teachersTableBody">${(data.teachers || []).map(t => `<tr><td style="font-family:monospace;color:var(--accent)">${escapeHtml(t.id)}</td><td style="font-weight:500">${escapeHtml(t.name)}</td><td><span class="badge badge-purple">${escapeHtml(t.subject)}</span></td><td>${escapeHtml(t.gender || '-')}</td><td>${escapeHtml(t.qualification || '-')}</td><td>PKR ${parseInt(t.salary || 0).toLocaleString()}</td><td class="actions"><button onclick="editTeacher('${escapeHtml(t.id)}')" class="btn btn-ghost btn-sm">✏ Edit</button><button onclick="printTeacherCard('${escapeHtml(t.id)}')" class="btn btn-ghost btn-sm">🖨 Print</button><button onclick="deleteTeacher('${escapeHtml(t.id)}')" class="btn btn-danger btn-sm">🗑 Delete</button></td></tr>`).join('')}</tbody></table></div>
            </div>
            <div id="teacherModal" class="modal-overlay"><div class="modal"><div class="modal-header"><h2 id="teacherModalTitle">Add Teacher</h2><span class="close-btn" onclick="closeTeacherModal()">&times;</span></div><div class="modal-body"><form id="teacherForm" onsubmit="event.preventDefault(); saveTeacher();"><input type="hidden" id="teacherId"><div class="form-grid"><div class="form-group full"><label for="teacherName">Full Name *</label><input type="text" id="teacherName" required></div><div class="form-group full"><label for="teacherSubject">Subject *</label><input type="text" id="teacherSubject" required></div><div class="form-group"><label for="teacherGender">Gender</label><select id="teacherGender"><option value="">Select</option><option>Male</option><option>Female</option></select></div><div class="form-group"><label for="teacherPhone">Phone</label><input type="text" id="teacherPhone"></div><div class="form-group"><label for="teacherEmail">Email</label><input type="email" id="teacherEmail"></div><div class="form-group"><label for="teacherQualification">Qualification</label><input type="text" id="teacherQualification"></div><div class="form-group"><label for="teacherSalary">Salary (PKR)</label><input type="number" id="teacherSalary"></div><div class="form-group"><label for="teacherJoinDate">Join Date</label><input type="date" id="teacherJoinDate"></div></div><div class="modal-footer"><button type="button" class="btn btn-ghost" onclick="closeTeacherModal()">Cancel</button><button type="submit" class="btn btn-primary">Save Teacher</button></div></form></div></div></div>
        `;
        document.getElementById('page-content').innerHTML = html;
    } catch(error) { console.error(error); document.getElementById('page-content').innerHTML = '<div class="loading">Failed to load teachers.</div>'; }
}

window.filterTeachers = async function() { const search = document.getElementById('teacherSearch')?.value || ''; const subject = document.getElementById('subjectFilter')?.value || ''; const data = await fetchAPI(`/teachers?q=${encodeURIComponent(search)}&subject=${encodeURIComponent(subject)}`); const tbody = document.getElementById('teachersTableBody'); if(tbody) tbody.innerHTML = (data.teachers || []).map(t => `<tr><td style="font-family:monospace;color:var(--accent)">${escapeHtml(t.id)}</td><td style="font-weight:500">${escapeHtml(t.name)}</td><td><span class="badge badge-purple">${escapeHtml(t.subject)}</span></td><td>${escapeHtml(t.gender || '-')}</td><td>${escapeHtml(t.qualification || '-')}</td><td>PKR ${parseInt(t.salary || 0).toLocaleString()}</td><td class="actions"><button onclick="editTeacher('${escapeHtml(t.id)}')" class="btn btn-ghost btn-sm">✏</button><button onclick="printTeacherCard('${escapeHtml(t.id)}')" class="btn btn-ghost btn-sm">🖨</button><button onclick="deleteTeacher('${escapeHtml(t.id)}')" class="btn btn-danger btn-sm">🗑</button></td></tr>`).join(''); };
window.showTeacherModal = function() { const modal = document.getElementById('teacherModal'); if(modal) { document.getElementById('teacherModalTitle').innerText = 'Add Teacher'; document.getElementById('teacherForm').reset(); document.getElementById('teacherId').value = ''; modal.classList.add('active'); } };
window.closeTeacherModal = function() { const modal = document.getElementById('teacherModal'); if(modal) modal.classList.remove('active'); };
window.editTeacher = async function(id) { try { const t = await fetchAPI(`/teachers/${id}`); document.getElementById('teacherModalTitle').innerText = 'Edit Teacher'; document.getElementById('teacherId').value = t.id; document.getElementById('teacherName').value = t.name || ''; document.getElementById('teacherSubject').value = t.subject || ''; document.getElementById('teacherGender').value = t.gender || ''; document.getElementById('teacherPhone').value = t.phone || ''; document.getElementById('teacherEmail').value = t.email || ''; document.getElementById('teacherQualification').value = t.qualification || ''; document.getElementById('teacherSalary').value = t.salary || ''; document.getElementById('teacherJoinDate').value = t.join_date || ''; document.getElementById('teacherModal').classList.add('active'); } catch(e) { showAlert('Failed to load teacher data', 'error'); } };
window.saveTeacher = async function() { const id = document.getElementById('teacherId').value; const data = { name: document.getElementById('teacherName').value, subject: document.getElementById('teacherSubject').value, gender: document.getElementById('teacherGender').value, phone: document.getElementById('teacherPhone').value, email: document.getElementById('teacherEmail').value, qualification: document.getElementById('teacherQualification').value, salary: document.getElementById('teacherSalary').value, join_date: document.getElementById('teacherJoinDate').value }; if(!data.name || !data.subject) { showAlert('Please fill required fields', 'error'); return; } try { if(id) { await fetchAPI(`/teachers/${id}`, { method:'PUT', body:JSON.stringify(data) }); showAlert('Teacher updated'); } else { await fetchAPI('/teachers', { method:'POST', body:JSON.stringify(data) }); showAlert('Teacher added'); } closeTeacherModal(); await loadTeachers(); } catch(e) { console.error(e); } };
window.deleteTeacher = async function(id) { if(confirm('Delete teacher?')) { try { await fetchAPI(`/teachers/${id}`, { method:'DELETE' }); showAlert('Teacher deleted'); await loadTeachers(); } catch(e) { console.error(e); } } };
window.printTeachersList = async function() { const data = await fetchAPI('/teachers'); let rows = ''; (data.teachers || []).forEach(t => { rows += `<tr><td>${escapeHtml(t.id)}</td><td>${escapeHtml(t.name)}</td><td>${escapeHtml(t.subject)}</td><td>${escapeHtml(t.gender||'-')}</td><td>${escapeHtml(t.qualification||'-')}</td><td>PKR ${parseInt(t.salary||0).toLocaleString()}</td></tr>`; }); printPreview(`<h3>Teachers List - Total: ${(data.teachers || []).length}</h3><table class="data-table"><thead><tr><th>ID</th><th>Name</th><th>Subject</th><th>Gender</th><th>Qualification</th><th>Salary</th></tr></thead><tbody>${rows}</tbody></table>`, 'Teachers Report'); };
window.printTeacherCard = async function(id) { const t = await fetchAPI(`/teachers/${id}`); const printContent = `<div style="max-width:600px;margin:0 auto;"><h3 style="color:#3b82f6;">Teacher ID Card</h3><div style="border:2px solid #3b82f6;padding:20px;border-radius:10px;"><div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;"><div><strong>ID:</strong></div><div>${escapeHtml(t.id)}</div><div><strong>Name:</strong></div><div>${escapeHtml(t.name)}</div><div><strong>Subject:</strong></div><div>${escapeHtml(t.subject)}</div><div><strong>Gender:</strong></div><div>${escapeHtml(t.gender||'-')}</div><div><strong>Qualification:</strong></div><div>${escapeHtml(t.qualification||'-')}</div><div><strong>Phone:</strong></div><div>${escapeHtml(t.phone||'-')}</div><div><strong>Email:</strong></div><div>${escapeHtml(t.email||'-')}</div><div><strong>Salary:</strong></div><div>PKR ${parseInt(t.salary||0).toLocaleString()}</div><div><strong>Join Date:</strong></div><div>${escapeHtml(t.join_date||'-')}</div></div></div></div>`; printPreview(printContent, `Teacher ID Card - ${t.name}`); };

let currentClassId = null, currentClassName = null;

async function loadClasses() {
    try {
        const data = await fetchAPI('/classes');

        document.getElementById('page-content').innerHTML = `
        <div class="page-header">
            <div class="page-title">Classes</div>
            <div class="page-sub">Manage school classes and assign subjects.</div>
            <button onclick="printClasses()" class="btn btn-primary" style="float:right; margin-top:-50px;">🖨 Print Classes</button>
        </div>

        <div class="card">
            <div class="toolbar">
                <input id="classSearch" placeholder="Search classes..." class="search-wrap">
                <button onclick="filterClasses()" class="btn btn-ghost btn-sm">Search</button>
                <button onclick="showClassModal()" class="btn btn-primary">+ Add Class</button>
            </div>

            <div class="table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Class Name</th><th>Grade</th><th>Teacher</th>
                            <th>Room</th><th>Schedule</th><th>Capacity</th>
                            <th>Subjects</th><th>Max Subjects</th><th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="classesTableBody">
                        ${(data.classes || []).map(c => `
                            <tr>
                                <td>${escapeHtml(c.class_name)}</td>
                                <td><span class="badge badge-blue">${escapeHtml(c.grade_level)}</span></td>
                                <td>${escapeHtml(c.class_teacher_name || '-')}</td>
                                <td>${escapeHtml(c.room_number || '-')}</td>
                                <td>${escapeHtml(c.schedule || '-')}</td>
                                <td>${c.capacity || '-'}</td>
                                <td>${c.max_subjects || '-'}</td>
                                <td><button class="btn btn-ghost btn-sm" onclick="manageSubjects(${c.id}, '${escapeHtml(c.class_name)}')">📚 Manage</button></td>
                                <td>
                                    <button onclick="editClass(${c.id})" class="btn btn-ghost btn-sm">✏</button>
                                    <button onclick="deleteClass(${c.id})" class="btn btn-danger btn-sm">🗑</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        ${classModalHTML()}
        ${subjectModalHTML()}
        `;
    } catch (e) {
        console.error(e);
        document.getElementById('page-content').innerHTML =
            '<div class="loading">Failed to load classes.</div>';
    }
}
// ==================== CLASS MODAL HTML ====================
function classModalHTML() {
    return `
        <div id="classModal" class="modal-overlay">
            <div class="modal">
                <div class="modal-header">
                    <h2 id="classModalTitle">Add Class</h2>
                    <span class="close-btn" onclick="closeClassModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <form id="classForm" onsubmit="event.preventDefault(); saveClass();">
                        <input type="hidden" id="classId">
                        <div class="form-grid">
                            <div class="form-group full">
                                <label for="className">Class Name *</label>
                                <input type="text" id="className" placeholder="e.g. Grade 9-A" required>
                            </div>
                            <div class="form-group">
                                <label for="classGradeLevel">Grade Level *</label>
                                <input type="text" id="classGradeLevel" required>
                            </div>
                            <div class="form-group">
                                <label for="classSection">Section</label>
                                <input type="text" id="classSection">
                            </div>
                            <div class="form-group">
                                <label for="classRoomNumber">Room Number</label>
                                <input type="text" id="classRoomNumber">
                            </div>
                            <div class="form-group">
                                <label for="classSchedule">Schedule</label>
                                <input type="text" id="classSchedule" placeholder="Mon-Fri 8am-2pm">
                            </div>
                            <div class="form-group">
                                <label for="classCapacity">Capacity</label>
                                <input type="number" id="classCapacity">
                            </div>
                            <div class="form-group">
                                <label for="classMaxSubjects">Max Subjects</label>
                                <input type="number" id="classMaxSubjects" min="1" max="50" value="20">
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-ghost" onclick="closeClassModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary">Save Class</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
}

function subjectModalHTML() {
    return `
        <div id="subjectModal" class="modal-overlay">
            <div class="modal" style="max-width:600px;">
                <div class="modal-header">
                    <h2 id="subjectModalTitle">Manage Subjects</h2>
                    <span class="close-btn" onclick="closeSubjectModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <div id="subjectList"></div>
                    <div style="margin: 15px 0;">
                        <label>Quick Add Subjects:</label>
                        <div id="quickSubjectChips" style="display:flex; flex-wrap:wrap; gap:8px; margin-top:5px;"></div>
                    </div>
                    <div class="form-group">
                        <label>Add New Subject</label>
                        <div style="display:flex; gap:10px;">
                            <input type="text" id="newSubjectName" placeholder="Subject name" style="flex:2;">
                            <input type="number" id="newSubjectMaxMarks" placeholder="Max Marks" value="100" style="width:100px;">
                            <button onclick="addSubject()" class="btn btn-primary">Add</button>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-ghost" onclick="closeSubjectModal()">Close</button>
                </div>
            </div>
        </div>
    `;
}
window.manageSubjects = async function(classId, className) {
    currentClassId = classId;
    currentClassName = className;
    const classData = await fetchAPI(`/classes/${classId}`);
    const maxSubjects = classData.max_subjects || 10;
    document.getElementById('subjectModalTitle').innerHTML = 
        `Manage Subjects: ${escapeHtml(className)} (0/${maxSubjects})`;
    await refreshSubjectList(maxSubjects);
    document.getElementById('subjectModal').classList.add('active');
};
// ==================== CLASS HELPER FUNCTIONS ====================
window.filterClasses = async function() {
    const search = document.getElementById('classSearch')?.value || '';
    const data = await fetchAPI(`/classes?q=${encodeURIComponent(search)}`);
    const tbody = document.getElementById('classesTableBody');
    if (tbody) {
        tbody.innerHTML = (data.classes || []).map(c => `
        <tr>
            <td>${escapeHtml(c.class_name)}</td>
            <td><span class="badge badge-blue">${escapeHtml(c.grade_level)}</span></td>
            <td>${escapeHtml(c.class_teacher_name || '-')}</td>
            <td>${escapeHtml(c.room_number || '-')}</td>
            <td>${escapeHtml(c.schedule || '-')}</td>
            <td>${c.capacity || '-'}</td>
            <td>${c.max_subjects || '-'}${c.max_subjects !== undefined ? '' : ''}   <!-- Add this cell -->
            <td><button class="btn btn-ghost btn-sm" onclick="manageSubjects(${c.id}, '${escapeHtml(c.class_name)}')">📚 Manage</button></td>
            <td>
                <button onclick="editClass(${c.id})" class="btn btn-ghost btn-sm">✏</button>
                <button onclick="deleteClass(${c.id})" class="btn btn-danger btn-sm">🗑</button>
            </td>
        </tr>
    `).join('');
    }
};

window.printClasses = async function() {
    const data = await fetchAPI('/classes');
    let rows = '';
    (data.classes || []).forEach(c => {
        rows += `<tr><td>${escapeHtml(c.class_name)}</td><td>${escapeHtml(c.grade_level)}</td>
                 <td>${escapeHtml(c.class_teacher_name || '-')}</td><td>${escapeHtml(c.room_number || '-')}</td>
                 <td>${escapeHtml(c.schedule || '-')}</td><td>${c.capacity || '-'}</td></tr>`;
    });
    printPreview(`<h3>Classes List</h3><table><thead><tr><th>Class Name</th><th>Grade</th><th>Teacher</th><th>Room</th><th>Schedule</th><th>Capacity</th></tr></thead><tbody>${rows}</tbody></table>`, 'Classes Report');
};

window.showClassModal = function() {
    const modal = document.getElementById('classModal');
    if (modal) {
        document.getElementById('classModalTitle').innerText = 'Add Class';
        document.getElementById('classForm').reset();
        document.getElementById('classId').value = '';
        modal.classList.add('active');
    }
};

window.closeClassModal = function() {
    const modal = document.getElementById('classModal');
    if (modal) modal.classList.remove('active');
};

window.editClass = async function(id) {
    try {
        const c = await fetchAPI(`/classes/${id}`);
        document.getElementById('classModalTitle').innerText = 'Edit Class';
        document.getElementById('classId').value = c.id;
        document.getElementById('className').value = c.class_name || '';
        document.getElementById('classGradeLevel').value = c.grade_level || '';
        document.getElementById('classSection').value = c.section || '';
        document.getElementById('classRoomNumber').value = c.room_number || '';
        document.getElementById('classSchedule').value = c.schedule || '';
        document.getElementById('classCapacity').value = c.capacity || '';
        document.getElementById('classModal').classList.add('active');
        document.getElementById('classMaxSubjects').value = c.max_subjects || 20;
    } catch(e) {
        showAlert('Failed to load class', 'error');
    }
};

window.saveClass = async function() {
    const id = document.getElementById('classId').value;
    const data = {
        class_name: document.getElementById('className').value,
        grade_level: document.getElementById('classGradeLevel').value,
        section: document.getElementById('classSection').value,
        class_teacher: '',
        room_number: document.getElementById('classRoomNumber').value,
        schedule: document.getElementById('classSchedule').value,
        capacity: parseInt(document.getElementById('classCapacity').value) || 0,
        max_subjects: parseInt(document.getElementById('classMaxSubjects').value) || 20
    };
    if (!data.class_name || !data.grade_level) {
        showAlert('Please fill required fields', 'error');
        return;
    }
    try {
        if (id) {
            await fetchAPI(`/classes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
            showAlert('Class updated');
        } else {
            await fetchAPI('/classes', { method: 'POST', body: JSON.stringify(data) });
            showAlert('Class added');
        }
        closeClassModal();
        await loadClasses();
    } catch(e) {
        showAlert(e.message, 'error');
    }
};
window.deleteClass = async function(id) {
    if (confirm('Delete this class?')) {
        try {
            await fetchAPI(`/classes/${id}`, { method: 'DELETE' });
            showAlert('Class deleted');
            await loadClasses();
        } catch(e) {
            showAlert('Delete failed', 'error');
        }
    }
};

window.closeSubjectModal = function() {
    const modal = document.getElementById('subjectModal');
    if (modal) modal.classList.remove('active');
    currentClassId = null;
    currentClassName = null;
};
// ==================== SUBJECT MANAGEMENT (REFRESH LIST) ====================
async function refreshSubjectList(maxSubjects) {
    if (!currentClassId) return;
    try {
        const data = await fetchAPI(`/classes/${currentClassId}/subjects`);
        const subjects = data.subjects || [];
        const title = document.getElementById('subjectModalTitle');
        if (title) {
            const count = subjects.length;
            title.innerHTML = `Manage Subjects: ${escapeHtml(currentClassName)} (${count}/${maxSubjects})`;
        }
        const div = document.getElementById('subjectList');
        if (!div) return;
        if (subjects.length === 0) {
            div.innerHTML = '<p style="color:var(--muted)">No subjects added yet.</p>';
        } else {
            let html = '<ul style="list-style:none; padding:0;">';
            subjects.forEach(sub => {
                html += `
                    <li style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border);">
                        <span><strong>${escapeHtml(sub.subject_name)}</strong> (Max: ${sub.max_marks})</span>
                        <div>
                            <input type="number" id="editMax_${escapeHtml(sub.subject_name)}" value="${sub.max_marks}" style="width:70px; margin-right:10px;" placeholder="Max">
                            <button onclick="updateSubjectMax('${escapeHtml(sub.subject_name)}')" class="btn btn-ghost btn-sm">Update Max</button>
                            <button onclick="removeSubject('${escapeHtml(sub.subject_name)}')" class="btn btn-danger btn-sm">Remove</button>
                        </div>
                    </li>
                `;
            });
            html += '</ul>';
            div.innerHTML = html;
        }

        // Quick add chips
        const commonSubjects = [
            { name: "Mathematics", max: 100 }, { name: "English", max: 100 }, { name: "Urdu", max: 100 },
            { name: "Science", max: 100 }, { name: "Islamiat", max: 100 }, { name: "Computer", max: 100 },
            { name: "Physics", max: 100 }, { name: "Chemistry", max: 100 }, { name: "Biology", max: 100 },
            { name: "Practical", max: 50 }
        ];
        const existingNames = subjects.map(s => s.subject_name);
        const available = commonSubjects.filter(cs => !existingNames.includes(cs.name));
        const chipsDiv = document.getElementById('quickSubjectChips');
        if (chipsDiv) {
            chipsDiv.innerHTML = available.map(cs =>
                `<button class="btn btn-ghost btn-sm" onclick="addQuickSubject('${escapeHtml(cs.name)}', ${cs.max})">${escapeHtml(cs.name)} (${cs.max})</button>`
            ).join('');
        }
    } catch(e) {
        console.error('Refresh subjects error:', e);
    }
}
window.updateSubjectMax = async function(subjectName) {
    const newMax = document.getElementById(`editMax_${subjectName}`).value;
    if (!newMax || newMax <= 0) {
        showAlert('Please enter a valid max marks', 'error');
        return;
    }
    try {
        await fetchAPI(`/classes/${currentClassId}/subjects/${encodeURIComponent(subjectName)}`, {
            method: 'PUT',
            body: JSON.stringify({ max_marks: parseInt(newMax) })
        });
        showAlert('Subject max marks updated');
        await refreshSubjectList();
    } catch(e) {
        showAlert(e.message, 'error');
    }
};

window.removeSubject = async function(subjectName) {
    if (!confirm(`Remove subject "${subjectName}"?`)) return;
    try {
        await fetchAPI(`/classes/${currentClassId}/subjects/${encodeURIComponent(subjectName)}`, {
            method: 'DELETE'
        });
        showAlert('Subject removed');
        await refreshSubjectList();
    } catch(e) {
        showAlert('Failed to remove subject', 'error');
    }
};

window.addSubject = async function(subjectName, maxMarks) {
    const name = subjectName || document.getElementById('newSubjectName').value.trim();
    const marks = maxMarks !== undefined ? maxMarks : parseInt(document.getElementById('newSubjectMaxMarks')?.value || 100);
    if (!name) { showAlert('Please enter subject name','error'); return; }
    try {
        await fetchAPI(`/classes/${currentClassId}/subjects`, {
            method: 'POST',
            body: JSON.stringify({ subject_name: name, max_marks: marks })
        });
        showAlert('Subject added');
        document.getElementById('newSubjectName').value = '';
        if(document.getElementById('newSubjectMaxMarks')) document.getElementById('newSubjectMaxMarks').value = 100;
        await refreshSubjectList();
    } catch(e) {
        showAlert(e.message, 'error');
    }
};

window.addQuickSubject = function(name, maxMarks) {
    addSubject(name, maxMarks);
};

// ============================================
// FEES MODULE (FULL)
// ============================================
async function loadFees() {
    try {
        const data = await fetchAPI('/fees');
        const html = `
            <div class="page-header"><div class="page-title">Fees</div><div class="page-sub">Fee collection and payment tracking.</div><button onclick="printFees()" class="btn btn-primary" style="float:right; margin-top:-50px;">🖨 Print Fees</button></div>
            <div class="kpi-grid"><div class="kpi-card"><div class="kpi-label">Total Fees</div><div class="kpi-value">PKR ${(data.total || 0).toLocaleString()}</div></div><div class="kpi-card"><div class="kpi-label">Collected</div><div class="kpi-value" style="color:var(--green)">PKR ${(data.collected || 0).toLocaleString()}</div></div><div class="kpi-card"><div class="kpi-label">Pending</div><div class="kpi-value" style="color:var(--red)">PKR ${(data.pending || 0).toLocaleString()}</div></div></div>
            <div class="card">
                <div class="toolbar">
                    <div class="search-wrap"><input type="text" id="feeSearch" placeholder="Search fees..."></div>
                    <select id="statusFilter" class="filter"><option value="">All Status</option><option>Paid</option><option>Pending</option><option>Partial</option></select>
                    <button onclick="filterFees()" class="btn btn-ghost btn-sm">Filter</button>
                    <button onclick="showFeeModal()" class="btn btn-primary">+ Add Fee</button>
                </div>
                <div class="table-wrap"><table class="data-table"><thead><tr><th>Student</th><th>Class</th><th>Fee Type</th><th>Amount</th><th>Paid</th><th>Due Date</th><th>Status</th><th>Actions</th></tr></thead><tbody id="feesTableBody">${(data.fees || []).map(f => `<tr><td style="font-weight:500">${escapeHtml(f.student_name)}</td><td>${escapeHtml(f.student_class || '-')}</td><td>${escapeHtml(f.fee_type)}</td><td style="text-align:right">PKR ${parseInt(f.amount || 0).toLocaleString()}</td><td style="text-align:right">PKR ${parseInt(f.paid_amount || 0).toLocaleString()}</td><td>${f.due_date || '-'}</td><td>${f.status === 'Paid' ? '<span class="badge badge-green">Paid</span>' : f.status === 'Pending' ? '<span class="badge badge-red">Pending</span>' : '<span class="badge badge-yellow">Partial</span>'}</td><td class="actions"><button onclick="editFee(${f.id})" class="btn btn-ghost btn-sm">✏</button><button onclick="deleteFee(${f.id})" class="btn btn-danger btn-sm">🗑</button></td></tr>`).join('')}</tbody></table></div>
            </div>
            <div id="feeModal" class="modal-overlay"><div class="modal"><div class="modal-header"><h2 id="feeModalTitle">Add Fee Record</h2><span class="close-btn" onclick="closeFeeModal()">&times;</span></div><div class="modal-body"><form id="feeForm" onsubmit="event.preventDefault(); saveFee();"><input type="hidden" id="feeId"><div class="form-grid"><div class="form-group full"><label for="feeStudentId">Student *</label><select id="feeStudentId" required><option value="">Select Student</option>${(data.students || []).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}</select></div><div class="form-group"><label for="feeType">Fee Type</label><select id="feeType"><option>Tuition Fee</option><option>Exam Fee</option><option>Transport Fee</option><option>Library Fee</option><option>Other</option></select></div><div class="form-group"><label for="feeMonth">Month</label><input type="text" id="feeMonth"></div><div class="form-group"><label for="feeAmount">Total Amount *</label><input type="number" step="0.01" id="feeAmount" required></div><div class="form-group"><label for="feePaidAmount">Paid Amount</label><input type="number" step="0.01" id="feePaidAmount" value="0"></div><div class="form-group"><label for="feeDueDate">Due Date</label><input type="date" id="feeDueDate"></div><div class="form-group"><label for="feePaidDate">Paid Date</label><input type="date" id="feePaidDate"></div></div><div class="modal-footer"><button type="button" class="btn btn-ghost" onclick="closeFeeModal()">Cancel</button><button type="submit" class="btn btn-primary">Save Fee</button></div></form></div></div></div>
        `;
        document.getElementById('page-content').innerHTML = html;
    } catch(e) { console.error(e); document.getElementById('page-content').innerHTML = '<div class="loading">Failed to load fees.</div>'; }
}
window.filterFees = async function() { const search = document.getElementById('feeSearch')?.value||''; const status = document.getElementById('statusFilter')?.value||''; let url = `/fees?q=${encodeURIComponent(search)}`; if(status) url += `&status=${encodeURIComponent(status)}`; const data = await fetchAPI(url); const tbody = document.getElementById('feesTableBody'); if(tbody) tbody.innerHTML = (data.fees||[]).map(f => `<tr><td style="font-weight:500">${escapeHtml(f.student_name)}</td><td>${escapeHtml(f.student_class||'-')}</td><td>${escapeHtml(f.fee_type)}</td><td style="text-align:right">PKR ${parseInt(f.amount||0).toLocaleString()}</td><td style="text-align:right">PKR ${parseInt(f.paid_amount||0).toLocaleString()}</td><td>${f.due_date||'-'}</td><td>${f.status==='Paid'?'<span class="badge badge-green">Paid</span>':f.status==='Pending'?'<span class="badge badge-red">Pending</span>':'<span class="badge badge-yellow">Partial</span>'}</td><td class="actions"><button onclick="editFee(${f.id})" class="btn btn-ghost btn-sm">✏</button><button onclick="deleteFee(${f.id})" class="btn btn-danger btn-sm">🗑</button></td></tr>`).join(''); };
window.showFeeModal = function() { const modal = document.getElementById('feeModal'); if(modal){ document.getElementById('feeModalTitle').innerText='Add Fee Record'; document.getElementById('feeForm').reset(); document.getElementById('feeId').value=''; document.getElementById('feePaidAmount').value='0'; modal.classList.add('active'); } };
window.closeFeeModal = function() { const modal = document.getElementById('feeModal'); if(modal) modal.classList.remove('active'); };
window.editFee = async function(id) { try { const data = await fetchAPI('/fees'); const fee = (data.fees||[]).find(f=>f.id===id); if(fee) { document.getElementById('feeModalTitle').innerText='Edit Fee Record'; document.getElementById('feeId').value=fee.id; document.getElementById('feeStudentId').value=fee.student_id; document.getElementById('feeType').value=fee.fee_type; document.getElementById('feeMonth').value=fee.month||''; document.getElementById('feeAmount').value=fee.amount; document.getElementById('feePaidAmount').value=fee.paid_amount; document.getElementById('feeDueDate').value=fee.due_date||''; document.getElementById('feePaidDate').value=fee.paid_date||''; document.getElementById('feeModal').classList.add('active'); } } catch(e){ showAlert('Failed to load fee','error'); } };
window.saveFee = async function() { const id = document.getElementById('feeId').value; const data = { student_id: document.getElementById('feeStudentId').value, fee_type: document.getElementById('feeType').value, month: document.getElementById('feeMonth').value, amount: parseFloat(document.getElementById('feeAmount').value), paid_amount: parseFloat(document.getElementById('feePaidAmount').value||0), due_date: document.getElementById('feeDueDate').value, paid_date: document.getElementById('feePaidDate').value }; if(!data.student_id || !data.amount) { showAlert('Please fill required fields','error'); return; } try { if(id) { await fetchAPI(`/fees/${id}`, { method:'PUT', body:JSON.stringify(data) }); showAlert('Fee record updated'); } else { await fetchAPI('/fees', { method:'POST', body:JSON.stringify(data) }); showAlert('Fee record added'); } closeFeeModal(); await loadFees(); } catch(e){ console.error(e); } };
window.deleteFee = async function(id) { if(confirm('Delete fee record?')) { try { await fetchAPI(`/fees/${id}`, { method:'DELETE' }); showAlert('Fee record deleted'); await loadFees(); } catch(e){ console.error(e); } } };
window.printFees = async function() { const data = await fetchAPI('/fees'); let rows=''; (data.fees||[]).forEach(f=>{ rows+=`<tr><td>${escapeHtml(f.student_name)}</td><td>${escapeHtml(f.student_class||'-')}</td><td>${escapeHtml(f.fee_type)}</td><td style="text-align:right">PKR ${parseInt(f.amount).toLocaleString()}</td><td style="text-align:right">PKR ${parseInt(f.paid_amount).toLocaleString()}</td><td>${escapeHtml(f.status)}</td><td>${f.due_date||'-'}</td></tr>`; }); printPreview(`<h3>Fees Report</h3><p><strong>Total:</strong> PKR ${data.total.toLocaleString()} | <strong>Collected:</strong> PKR ${data.collected.toLocaleString()} | <strong>Pending:</strong> PKR ${data.pending.toLocaleString()}</p><table class="data-table"><thead><tr><th>Student</th><th>Class</th><th>Fee Type</th><th>Amount</th><th>Paid</th><th>Status</th><th>Due Date</th></tr></thead><tbody>${rows}</tbody></table>`,'Fees Report'); };

// ============================================
// EXPENSES MODULE (FULL)
// ============================================
async function loadExpenses() {
    try {
        const data = await fetchAPI('/expenses');
        const html = `
            <div class="page-header"><div class="page-title">Expenses</div><div class="page-sub">School expense tracking.</div><button onclick="printExpenses()" class="btn btn-primary" style="float:right; margin-top:-50px;">🖨 Print Expenses</button></div>
            <div class="kpi-grid"><div class="kpi-card"><div class="kpi-label">Total Expenses</div><div class="kpi-value" style="color:var(--red)">PKR ${(data.total||0).toLocaleString()}</div></div><div class="kpi-card"><div class="kpi-label">Records</div><div class="kpi-value">${data.count||0}</div></div></div>
            <div class="card">
                <div class="toolbar">
                    <div class="search-wrap"><input type="text" id="expenseSearch" placeholder="Search expenses..."></div>
                    <select id="categoryFilter" class="filter"><option value="">All Categories</option>${(data.categories||[]).map(c=>`<option value="${c}">${c}</option>`).join('')}</select>
                    <button onclick="filterExpenses()" class="btn btn-ghost btn-sm">Filter</button>
                    <button onclick="showExpenseModal()" class="btn btn-primary">+ Add Expense</button>
                </div>
                <div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Payment</th><th>Ref #</th><th>Actions</th></tr></thead><tbody id="expensesTableBody">${(data.expenses||[]).map(e=>`<tr><td>${e.date||'-'}</td><td><span class="badge badge-purple">${escapeHtml(e.category)}</span></td><td>${escapeHtml(e.description||'-')}</td><td style="color:var(--red); text-align:right">PKR ${parseInt(e.amount||0).toLocaleString()}</td><td>${escapeHtml(e.payment_method||'-')}</td><td>${escapeHtml(e.reference_no||'-')}</td><td class="actions"><button onclick="editExpense(${e.id})" class="btn btn-ghost btn-sm">✏</button><button onclick="deleteExpense(${e.id})" class="btn btn-danger btn-sm">🗑</button></td></tr>`).join('')}</tbody></table></div>
            </div>
            <div id="expenseModal" class="modal-overlay"><div class="modal"><div class="modal-header"><h2 id="expenseModalTitle">Add Expense</h2><span class="close-btn" onclick="closeExpenseModal()">&times;</span></div><div class="modal-body"><form id="expenseForm" onsubmit="event.preventDefault(); saveExpense();"><input type="hidden" id="expenseId"><div class="form-grid"><div class="form-group"><label for="expenseCategory">Category *</label><select id="expenseCategory"><option>Salaries</option><option>Utilities</option><option>Maintenance</option><option>Stationery</option><option>Transport</option><option>Events</option><option>Other</option></select></div><div class="form-group"><label for="expenseAmount">Amount (PKR) *</label><input type="number" step="0.01" id="expenseAmount" required></div><div class="form-group full"><label for="expenseDescription">Description</label><input type="text" id="expenseDescription"></div><div class="form-group"><label for="expensePaymentMethod">Payment Method</label><select id="expensePaymentMethod"><option>Cash</option><option>Cheque</option><option>Bank Transfer</option><option>Online</option></select></div><div class="form-group"><label for="expenseReferenceNo">Reference No</label><input type="text" id="expenseReferenceNo"></div><div class="form-group"><label for="expenseDate">Date</label><input type="date" id="expenseDate"></div></div><div class="modal-footer"><button type="button" class="btn btn-ghost" onclick="closeExpenseModal()">Cancel</button><button type="submit" class="btn btn-primary">Save Expense</button></div></form></div></div></div>
        `;
        document.getElementById('page-content').innerHTML = html;
    } catch(e){ console.error(e); document.getElementById('page-content').innerHTML = '<div class="loading">Failed to load expenses.</div>'; }
}
window.filterExpenses = async function() { const search = document.getElementById('expenseSearch')?.value||''; const cat = document.getElementById('categoryFilter')?.value||''; let url = `/expenses?q=${encodeURIComponent(search)}`; if(cat) url+=`&category=${encodeURIComponent(cat)}`; const data = await fetchAPI(url); const tbody = document.getElementById('expensesTableBody'); if(tbody) tbody.innerHTML = (data.expenses||[]).map(e=>`<tr><td>${e.date||'-'}</td><td><span class="badge badge-purple">${escapeHtml(e.category)}</span></td><td>${escapeHtml(e.description||'-')}</td><td style="text-align:right">PKR ${parseInt(e.amount).toLocaleString()}</td><td>${escapeHtml(e.payment_method||'-')}</td><td>${escapeHtml(e.reference_no||'-')}</td><td class="actions"><button onclick="editExpense(${e.id})" class="btn btn-ghost btn-sm">✏</button><button onclick="deleteExpense(${e.id})" class="btn btn-danger btn-sm">🗑</button></td></tr>`).join(''); };
window.showExpenseModal = function() { const modal = document.getElementById('expenseModal'); if(modal){ document.getElementById('expenseModalTitle').innerText='Add Expense'; document.getElementById('expenseForm').reset(); document.getElementById('expenseId').value=''; modal.classList.add('active'); } };
window.closeExpenseModal = function() { const modal = document.getElementById('expenseModal'); if(modal) modal.classList.remove('active'); };
window.editExpense = async function(id) { try { const data = await fetchAPI('/expenses'); const exp = (data.expenses||[]).find(e=>e.id===id); if(exp) { document.getElementById('expenseModalTitle').innerText='Edit Expense'; document.getElementById('expenseId').value=exp.id; document.getElementById('expenseCategory').value=exp.category; document.getElementById('expenseAmount').value=exp.amount; document.getElementById('expenseDescription').value=exp.description||''; document.getElementById('expensePaymentMethod').value=exp.payment_method||''; document.getElementById('expenseReferenceNo').value=exp.reference_no||''; document.getElementById('expenseDate').value=exp.date||''; document.getElementById('expenseModal').classList.add('active'); } } catch(e){ showAlert('Failed to load expense','error'); } };
window.saveExpense = async function() { const id = document.getElementById('expenseId').value; const data = { category: document.getElementById('expenseCategory').value, amount: parseFloat(document.getElementById('expenseAmount').value), description: document.getElementById('expenseDescription').value, payment_method: document.getElementById('expensePaymentMethod').value, reference_no: document.getElementById('expenseReferenceNo').value, date: document.getElementById('expenseDate').value }; if(!data.category || !data.amount) { showAlert('Please fill required fields','error'); return; } try { if(id) { await fetchAPI(`/expenses/${id}`, { method:'PUT', body:JSON.stringify(data) }); showAlert('Expense updated'); } else { await fetchAPI('/expenses', { method:'POST', body:JSON.stringify(data) }); showAlert('Expense added'); } closeExpenseModal(); await loadExpenses(); } catch(e){ console.error(e); } };
window.deleteExpense = async function(id) { if(confirm('Delete expense?')) { try { await fetchAPI(`/expenses/${id}`, { method:'DELETE' }); showAlert('Expense deleted'); await loadExpenses(); } catch(e){ console.error(e); } } };
window.printExpenses = async function() { const data = await fetchAPI('/expenses'); let rows=''; (data.expenses||[]).forEach(e=>{ rows+=`<tr><td>${e.date||'-'}</td><td>${escapeHtml(e.category)}</td><td>${escapeHtml(e.description||'-')}</td><td style="text-align:right">PKR ${e.amount.toLocaleString()}</td><td>${escapeHtml(e.payment_method||'-')}</td></tr>`; }); printPreview(`<h3>Expenses Report - Total: PKR ${data.total.toLocaleString()}</h3><table class="data-table"><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Payment Method</th></tr></thead><tbody>${rows}</tbody></table>`,'Expenses Report'); };