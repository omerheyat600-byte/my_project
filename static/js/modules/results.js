// ============================================
// RESULTS.JS — Result cards, result matrix,
// filtering/exporting, and results CRUD.
// ============================================

// ============================================
// THEME HELPERS – each theme returns { css, body(student, results, term) }
// ============================================
// ============================================
// THEME HELPERS – each theme returns { css, body(student, results, term) }
// ============================================


// ============================================
// BULK RESULT CARDS PRINT (USES SAME THEME)
// ============================================
window.printBulkResultCards = async function() {
    const gradeSelect = document.getElementById('excelGradeFilter');
    const selectedOption = gradeSelect.options[gradeSelect.selectedIndex];
    const classId = selectedOption?.dataset?.classId;
    const term = document.getElementById('excelTermFilter')?.value;
    const year = document.getElementById('excelYearFilter')?.value;

    if (!classId) { showAlert('Please select a class first.', 'error'); return; }
    if (!term || !year) { showAlert('Please select term and year.', 'error'); return; }

    try {
        const data = await fetchAPI(`/results/bulk-cards?class_id=${classId}&term=${encodeURIComponent(term)}&year=${encodeURIComponent(year)}`);
        if (!data.students || data.students.length === 0) {
            showAlert('No result data found for this class/term/year.', 'error');
            return;
        }

        const activeTheme = localStorage.getItem('defaultResultCardTheme') || 'modern';
        const theme = THEMES[activeTheme];
        if (!theme) {
            showAlert('Invalid theme selected', 'error');
            return;
        }

        // Generate each card's HTML using the same theme.body()
        let cardsHtml = '';
        data.students.forEach((student, index) => {
            // Reconstruct results array for this student
            const results = student.subjects.map(sub => ({
                subject: sub.subject,
                obtained_marks: sub.obtained,
                total_marks: sub.total,
                grade: sub.grade
            }));
            const totalObtained = student.total_obtained || 0;
            const totalMarks = student.total_marks || 0;
            const overallPct = student.percentage || 0;
            const overallGrade = student.overall_grade || 'N/A';

            // Build a fake student object
            const studentObj = {
                id: student.student_id,
                name: student.student_name,
                grade: student.class_name
            };

            // Add page break between cards (except last one)
            const pageBreak = (index < data.students.length - 1) ? `
                <div style="page-break-after: always; border-bottom: 2px dashed #334155; margin: 20px 0; padding-bottom: 20px;"></div>
            ` : '';

            cardsHtml += theme.body(studentObj, results, term, totalObtained, totalMarks, overallPct, overallGrade) + pageBreak;
        });

        // Open print window with the theme's CSS
        const printWindow = window.open('', '_blank', 'width=900,height=800');
        if (!printWindow) {
            showAlert('Please allow popups for this site.', 'error');
            return;
        }

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Bulk Result Cards - ${escapeHtml(data.class_name)}</title>
                <style>
                    /* Reset styles for print */
                    * { box-sizing: border-box; }
                    body { 
                        margin: 0; 
                        padding: 20px; 
                        background: #f1f5f9; 
                        font-family: Arial, sans-serif;
                    }
                    .no-print { 
                        text-align: center; 
                        margin-bottom: 20px; 
                    }
                    .card-wrapper {
                        max-width: 900px;
                        margin: 0 auto 30px auto;
                        background: white;
                        border-radius: 8px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        overflow: hidden;
                        page-break-after: always;
                    }
                    .card-wrapper:last-child {
                        page-break-after: avoid;
                    }
                    
                    /* Theme CSS */
                    ${theme.css}
                    
                    @media print {
                        body { 
                            background: white; 
                            padding: 0; 
                            margin: 0;
                        }
                        .no-print { 
                            display: none; 
                        }
                        .card-wrapper {
                            box-shadow: none;
                            border-radius: 0;
                            margin: 0 auto;
                            page-break-after: always;
                        }
                        .card-wrapper:last-child {
                            page-break-after: avoid;
                        }
                        .card-modern, .card-classic, .card-minimalist, 
                        .card-slate-grid, .card-royal, .card-diagonal {
                            page-break-inside: avoid;
                            margin: 0;
                            padding: 10px;
                        }
                    }
                    
                    /* Card container styles */
                    .card-modern, .card-classic, .card-minimalist, 
                    .card-slate-grid, .card-royal, .card-diagonal {
                        background: white;
                        margin: 0;
                        padding: 15px;
                    }
                </style>
            </head>
            <body>
                <div class="no-print">
                    <button onclick="window.print();" style="padding:12px 30px; background:#0f172a; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:16px;">
                        🖨️ Print All Cards
                    </button>
                    <button onclick="window.close();" style="padding:12px 30px; background:#ef4444; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:16px; margin-left:10px;">
                        ✕ Close
                    </button>
                    <div style="margin-top: 10px; font-size: 14px; color: #64748b;">
                        Class: ${escapeHtml(data.class_name)} | Term: ${escapeHtml(term)} | Year: ${escapeHtml(year)} | Total Students: ${data.students.length}
                    </div>
                </div>
                
                <div id="cards-container">
                    ${cardsHtml}
                </div>
                
                <script>
                    // Auto-print after a short delay (optional - user can click print button)
                    setTimeout(function() {
                        // Don't auto-print, let user decide
                    }, 500);
                <\/script>
            </body>
            </html>
        `);
        printWindow.document.close();
        showAlert(`Loaded ${data.students.length} cards for printing.`, 'success');
        
    } catch (error) {
        console.error('Bulk print error:', error);
        showAlert('Failed to load bulk print data.', 'error');
    }
};
// ============================================
// SINGLE STUDENT RESULT CARD PRINT
// ============================================
window.printStudentResultCard = async function(studentId) {
    try {
        const data = await fetchAPI(`/results/card/${studentId}`);
        const student = data.student;
        const results = data.results || [];
        const term = results[0]?.term || 'Term 1';
        const totalObtained = data.total_obtained || 0;
        const totalMarks = data.total_marks || 0;
        const overallPct = data.percentage || 0;
        const overallGrade = data.overall_grade || 'N/A';

        const activeTheme = localStorage.getItem('defaultResultCardTheme') || 'modern';
        const theme = THEMES[activeTheme];
        if (!theme) {
            showAlert('Invalid theme selected', 'error');
            return;
        }

        const cardHTML = theme.body(student, results, term, totalObtained, totalMarks, overallPct, overallGrade);

        const printWindow = window.open('', '_blank', 'width=900,height=800');
        if (!printWindow) {
            showAlert('Please allow popups for this site.', 'error');
            return;
        }

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Result Card - ${escapeHtml(student.name)}</title>
                <style>
                    * { box-sizing: border-box; }
                    body { 
                        margin: 0; 
                        padding: 20px; 
                        background: #f1f5f9; 
                        font-family: Arial, sans-serif;
                    }
                    .no-print { 
                        text-align: center; 
                        margin-bottom: 20px; 
                    }
                    .card-container {
                        max-width: 900px;
                        margin: 0 auto;
                        background: white;
                        border-radius: 8px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        overflow: hidden;
                    }
                    ${theme.css}
                    @media print {
                        body { background: white; padding: 0; margin: 0; }
                        .no-print { display: none; }
                        .card-container {
                            box-shadow: none;
                            border-radius: 0;
                            margin: 0;
                        }
                    }
                    .card-modern, .card-classic, .card-minimalist, 
                    .card-slate-grid, .card-royal, .card-diagonal {
                        background: white;
                        margin: 0;
                        padding: 15px;
                    }
                </style>
            </head>
            <body>
                <div class="no-print">
                    <button onclick="window.print();" style="padding:12px 30px; background:#0f172a; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:16px;">
                        🖨️ Print
                    </button>
                    <button onclick="window.close();" style="padding:12px 30px; background:#ef4444; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:16px; margin-left:10px;">
                        ✕ Close
                    </button>
                    <div style="margin-top: 10px; font-size: 14px; color: #64748b;">
                        Student: ${escapeHtml(student.name)} | ID: ${escapeHtml(student.id)} | Term: ${escapeHtml(term)}
                    </div>
                </div>
                <div class="card-container">
                    ${cardHTML}
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
        
    } catch (error) {
        console.error(error);
        showAlert('Failed to load result card', 'error');
    }
};
// ============================================
// PRINT RESULTS SUMMARY (Ranked)
// ============================================
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
// RESULT MODAL
// ============================================
window.showResultModal = function() {
    const modal = document.getElementById('resultModal');
    if (!modal) return;
    document.getElementById('resultModalTitle').innerText = 'Add Result';
    document.getElementById('resultForm').reset();
    document.getElementById('resultId').value = '';
    document.getElementById('resultTotalMarks').value = '100';
    document.getElementById('resultYear').value = new Date().getFullYear().toString();

    const subjectSelect = document.getElementById('resultSubject');
    if (subjectSelect) {
        subjectSelect.innerHTML = '<option value="">Select subject</option>' +
            window.ALL_SCHOOL_SUBJECTS.map(sub => `<option value="${escapeHtml(sub)}">${escapeHtml(sub)}</option>`).join('');
    }

    const studentSelect = document.getElementById('resultStudentId');
    if (studentSelect && !studentSelect._listenerAttached) {
        studentSelect.addEventListener('change', async function() {
            await window.loadSubjectDropdown(this.value);
        });
        studentSelect._listenerAttached = true;
    }
    modal.classList.add('active');
};

window.closeResultModal = function() {
    const modal = document.getElementById('resultModal');
    if (modal) modal.classList.remove('active');
};

// ============================================
// QUICK ADD RESULT (for "+ Enter" buttons)
// ============================================
window.quickAddResult = async function(studentId, subjectName) {
    window.showResultModal();
    const studentSelect = document.getElementById('resultStudentId');
    if (studentSelect) studentSelect.value = studentId;
    await window.loadSubjectDropdown(studentId, subjectName);
    const subjectSelect = document.getElementById('resultSubject');
    if (subjectSelect) subjectSelect.value = subjectName;
};

// ============================================
// BUILD RESULTS MATRIX (for list filters)
// ============================================
async function buildResultsMatrixRows(filters = {}) {
    const { search = '', studentId = '', term = '', classFilter = '', dateFrom = '', dateTo = '' } = filters;

    const [resultsData, classesData, studentsData] = await Promise.all([
        fetchAPI('/results'),
        fetchAPI('/classes'),
        fetchAPI('/students')
    ]);

    const students = studentsData.students || [];
    const classes = classesData.classes || [];
    const savedResults = resultsData.results || [];

    // Cache subjects per class
    const classSubjectsCache = new Map();
    for (const cls of classes) {
        if (!cls.id || !cls.class_name) continue;
        try {
            const subData = await fetchAPI(`/classes/${cls.id}/subjects`);
            classSubjectsCache.set(cls.class_name.trim(), subData.subjects || []);
        } catch (err) {
            classSubjectsCache.set(cls.class_name.trim(), []);
        }
    }

    const savedRecordsMap = new Map();
    savedResults.forEach(r => {
        if (!r.student_id || !r.subject || !r.term) return;
        const key = `${r.student_id.trim()}_${r.subject.trim()}_${r.term.trim()}`;
        savedRecordsMap.set(key, r);
    });

    const filteredStudents = students.filter(s => {
        if (studentId && s.id !== studentId) return false;
        if (classFilter && s.grade !== classFilter) return false;
        if (search) {
            const query = search.toLowerCase();
            const nameMatch = s.name ? s.name.toLowerCase().includes(query) : false;
            const idMatch = s.id ? s.id.toLowerCase().includes(query) : false;
            if (!nameMatch && !idMatch) return false;
        }
        return true;
    });

    let generatedRows = [];
    let recordCounter = 0;

    for (const student of filteredStudents) {
        const studentGrade = (student.grade || '').trim();
        if (!studentGrade) continue;
        const subjectsList = classSubjectsCache.get(studentGrade) || [];
        if (subjectsList.length === 0) continue;

        subjectsList.forEach(subjectItem => {
            const subjectName = (subjectItem.subject_name || subjectItem.name || '').trim();
            const defaultMaxMarks = Number(subjectItem.max_marks || 100);
            const termsToProcess = term ? [term] : ['Term 1', 'Term 2', 'Term 3', 'Annual'];

            termsToProcess.forEach(currentTerm => {
                const uniqueKey = `${student.id.trim()}_${subjectName}_${currentTerm.trim()}`;
                const record = savedRecordsMap.get(uniqueKey);

                if (dateFrom && record && record.exam_date && record.exam_date < dateFrom) return;
                if (dateTo && record && record.exam_date && record.exam_date > dateTo) return;
                if ((dateFrom || dateTo) && !record) return;

                let obtained = '-';
                let total = defaultMaxMarks;
                let percentage = '-';
                let gradeBadge = '<span class="badge badge-red">Pending</span>';
                let recordId = '';
                let examDate = '-';
                let currentYear = record?.year || new Date().getFullYear();

                if (record) {
                    obtained = Number(record.obtained_marks || 0);
                    total = Number(record.total_marks || defaultMaxMarks);
                    percentage = `${((obtained / total) * 100).toFixed(0)}%`;
                    gradeBadge = getGradeBadge(record.grade);
                    recordId = record.id;
                    examDate = record.exam_date || '-';
                    recordCounter++;
                }

                generatedRows.push({
                    studentId: student.id,
                    studentName: student.name,
                    studentClass: studentGrade,
                    subject: subjectName,
                    obtained_marks: obtained,
                    total_marks: total,
                    percentage: percentage,
                    grade: gradeBadge,
                    rawGrade: record?.grade || 'N/A',
                    term: currentTerm,
                    year: currentYear,
                    exam_date: examDate,
                    id: recordId
                });
            });
        });
    }

    return { rows: generatedRows, activeSavedCount: recordCounter };
}

// ============================================
// FILTER FUNCTIONS
// ============================================
window.filterResults = async function() {
    const search = document.getElementById('resultSearch')?.value || '';
    const studentId = document.getElementById('studentResultFilter')?.value || '';
    const term = document.getElementById('termFilter')?.value || '';
    const classFilter = document.getElementById('classResultFilter')?.value || '';
    try {
        const tbody = document.getElementById('resultsTableBody');
        if (!tbody) return;
        const dataMatrix = await buildResultsMatrixRows({ search, studentId, term, classFilter });
        tbody.innerHTML = dataMatrix.rows.map(r => `
            <tr>
                <td style="font-weight:500">${escapeHtml(r.studentName)}</td>
                <td><span class="badge badge-blue">${escapeHtml(r.studentClass)}</span></td>
                <td>${escapeHtml(r.subject)}</td>
                <td style="text-align:center; font-weight:bold;">${r.obtained_marks}</td>
                <td style="text-align:center">${r.total_marks}</td>
                <td style="text-align:center">${r.percentage}</td>
                <td style="text-align:center">${r.grade}</td>
                <td><span class="badge badge-purple">${escapeHtml(r.term)}</span></td>
                <td>${r.year}</td>
                <td>${r.exam_date}</td>
                <td class="actions">
                    ${r.id ? `
                        <button onclick="editResult(${r.id})">✏</button>
                        <button onclick="printStudentResultCard('${r.studentId}')">🖨</button>
                        <button onclick="deleteResult(${r.id})">🗑</button>
                    ` : `
                        <span style="font-size:11px; color:#64748b; font-style:italic;">Not Entered</span>
                    `}
                </td>
            </tr>
        `).join('');
    } catch (error) {
        showAlert('Failed to load results matrix layout', 'error');
    }
};

window.filterResultsAdvanced = async function() {
    const search = document.getElementById('resultSearch')?.value || '';
    const studentId = document.getElementById('studentResultFilter')?.value || '';
    const term = document.getElementById('termFilter')?.value || '';
    const classFilter = document.getElementById('classResultFilter')?.value || '';
    const dateFrom = document.getElementById('dateFromFilter')?.value || '';
    const dateTo = document.getElementById('dateToFilter')?.value || '';
    try {
        const tbody = document.getElementById('resultsTableBody');
        if (!tbody) return;
        const dataMatrix = await buildResultsMatrixRows({ search, studentId, term, classFilter, dateFrom, dateTo });
        tbody.innerHTML = dataMatrix.rows.map(r => `
            <tr>
                <td style="font-weight:500">${escapeHtml(r.studentName)}</td>
                <td><span class="badge badge-blue">${escapeHtml(r.studentClass)}</span></td>
                <td>${escapeHtml(r.subject)}</td>
                <td style="text-align:center; font-weight:bold;">${r.obtained_marks}</td>
                <td style="text-align:center">${r.total_marks}</td>
                <td style="text-align:center">${r.percentage}</td>
                <td style="text-align:center">${r.grade}</td>
                <td><span class="badge badge-purple">${escapeHtml(r.term)}</span></td>
                <td>${r.year}</td>
                <td>${r.exam_date}</td>
                <td class="actions">
                    ${r.id ? `
                        <button onclick="editResult(${r.id})">✏</button>
                        <button onclick="printStudentResultCard('${r.studentId}')">🖨</button>
                        <button onclick="deleteResult(${r.id})">🗑</button>
                    ` : `
                        <span style="font-size:11px; color:#64748b; font-style:italic;">Not Entered</span>
                    `}
                </td>
            </tr>
        `).join('');
        showAlert(`Found ${dataMatrix.activeSavedCount} entered records.`, 'success');
    } catch (err) {
        showAlert('Filter matrix configuration failed', 'error');
    }
};

window.clearDateFilters = function() {
    const dateFrom = document.getElementById('dateFromFilter');
    const dateTo = document.getElementById('dateToFilter');
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    window.filterResultsAdvanced();
};

window.exportResultsToCSV = async function() {
    try {
        const search = document.getElementById('resultSearch')?.value || '';
        const studentId = document.getElementById('studentResultFilter')?.value || '';
        const term = document.getElementById('termFilter')?.value || '';
        const classFilter = document.getElementById('classResultFilter')?.value || '';
        const dateFrom = document.getElementById('dateFromFilter')?.value || '';
        const dateTo = document.getElementById('dateToFilter')?.value || '';
        const dataMatrix = await buildResultsMatrixRows({ search, studentId, term, classFilter, dateFrom, dateTo });
        const results = dataMatrix.rows || [];
        if (!results.length) { showAlert('No data to export', 'error'); return; }
        const headers = ['Student ID', 'Student Name', 'Class', 'Subject', 'Obtained Marks', 'Total Marks', 'Percentage', 'Grade', 'Term', 'Year', 'Exam Date'];
        const csvRows = [headers];
        results.forEach(r => {
            csvRows.push([
                r.studentId, r.studentName, r.studentClass, r.subject,
                r.obtained_marks, r.total_marks, r.percentage, r.rawGrade,
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
        showAlert('CSV exported successfully.');
    } catch (error) {
        showAlert('Failed to export CSV', 'error');
    }
};

// ============================================
// CRUD OPERATIONS FOR RESULTS
// ============================================
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
            await window.loadSubjectDropdown(result.student_id, result.subject);
            document.getElementById('resultModal').classList.add('active');
        }
    } catch (error) {
        showAlert('Failed to load result data', 'error');
    }
};

window.saveResult = async function() {
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
            await fetchAPI(`/results/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        } else {
            await fetchAPI('/results', { method: 'POST', body: JSON.stringify(data) });
        }
        showAlert('Saved successfully');
        closeResultModal();
        loadResults();
    } catch (e) {
        showAlert('Save failed', 'error');
    }
};

window.deleteResult = async function(id) {
    if (!confirm('Are you sure you want to delete this result?')) return;
    try {
        await fetchAPI(`/results/${id}`, { method: 'DELETE' });
        showAlert('Result deleted successfully');
        await loadResults();
    } catch (error) {
        showAlert('Failed to delete result', 'error');
    }
};

// ============================================
// SWITCH VIEW (List / Excel)
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

// ============================================
// MAIN RESULTS LOAD FUNCTION (IMPROVED)
// ============================================
async function loadResults() {
    try {
        const [resultsData, classesData, studentsData] = await Promise.all([
            fetchAPI('/results'),
            fetchAPI('/classes'),
            fetchAPI('/students')
        ]);

        const students = studentsData.students || [];
        const classes = classesData.classes || [];
        const savedResults = resultsData.results || [];

        // Build cache: class name -> subjects
        const classSubjectsCache = new Map();
        for (const cls of classes) {
            if (!cls.id || !cls.class_name) continue;
            try {
                const subData = await fetchAPI(`/classes/${cls.id}/subjects`);
                classSubjectsCache.set(cls.class_name.trim(), subData.subjects || []);
            } catch {
                classSubjectsCache.set(cls.class_name.trim(), []);
            }
        }

        // Build student -> grade map
        const studentClassMap = new Map();
        students.forEach(s => studentClassMap.set(s.id, s.grade || '-'));

        // Generate list rows
        const currentGradeFilter = document.getElementById('classResultFilter')?.value || '';
        const studentsToRender = students.filter(s => !currentGradeFilter || s.grade === currentGradeFilter);

        let listRowsHtml = '';
        studentsToRender.forEach(student => {
            const studentClass = studentClassMap.get(student.id) || '-';
            const subjectsList = classSubjectsCache.get(studentClass) || [];
            if (subjectsList.length === 0) {
                // If no subjects assigned, show a placeholder row
                listRowsHtml += `<tr><td colspan="11" style="text-align:center; color:#94a3b8;">No subjects assigned for ${escapeHtml(student.name)}</td></tr>`;
                return;
            }

            subjectsList.forEach(subjectItem => {
                const subjectName = subjectItem.subject_name || subjectItem.name;
                const match = savedResults.find(r => r.student_id === student.id && r.subject === subjectName);
                let obtained = '-';
                let total = '-';
                let percentageStr = '-';
                let gradeBadge = '<span class="badge badge-ghost">Pending</span>';
                let term = document.getElementById('termFilter')?.value || 'Term 1';
                let year = '2026';
                let examDate = '-';
                let actionButtons = '';

                if (match) {
                    obtained = parseFloat(match.obtained_marks || 0);
                    total = parseFloat(match.total_marks || 100);
                    percentageStr = match.total_marks ? ((match.obtained_marks / match.total_marks) * 100).toFixed(0) + '%' : '0%';
                    gradeBadge = getGradeBadge(match.grade);
                    term = match.term;
                    year = match.year || '2026';
                    examDate = match.exam_date || '-';
                    actionButtons = `
                        <button onclick="editResult(${match.id})" class="btn btn-ghost btn-sm">✏</button>
                        <button onclick="printStudentResultCard('${match.student_id}')" class="btn btn-ghost btn-sm">🖨</button>
                        <button onclick="deleteResult(${match.id})" class="btn btn-danger btn-sm">🗑</button>
                    `;
                } else {
                    actionButtons = `
                        <button onclick="quickAddResult('${student.id}', '${escapeHtml(subjectName)}')" class="btn btn-primary btn-sm" style="padding: 2px 6px; font-size: 11px;">+ Enter</button>
                    `;
                }

                listRowsHtml += `<tr>
                    <td style="font-weight:500"><a href="#" onclick="event.preventDefault(); showStudentQuickView('${escapeHtml(student.id)}')" style="color:var(--accent); cursor:pointer;">${escapeHtml(student.name)}</a></td>
                    <td><span class="badge badge-blue">${escapeHtml(studentClass)}</span></td>
                    <td>${escapeHtml(subjectName)}</td>
                    <td style="text-align:center">${obtained}</td>
                    <td style="text-align:center">${total}</td>
                    <td style="text-align:center">${percentageStr}</td>
                    <td style="text-align:center">${gradeBadge}</td>
                    <td><span class="badge badge-purple">${escapeHtml(term)}</span></td>
                    <td>${year}</td>
                    <td>${examDate}</td>
                    <td class="actions">${actionButtons}</td>
                </tr>`;
            });
        });

        if (!listRowsHtml) {
            listRowsHtml = `<tr><td colspan="11" style="text-align:center;">No student records found.</td></tr>`;
        }

       const html = `
    <div class="page-header">
        <div class="page-title">Results</div>
        <div class="page-sub">Academic results and performance tracking.</div>
        <div style="float: right; margin-top: -50px;">
            <button onclick="printResultsSummary()" class="btn btn-success" style="margin-right: 10px;">📊 Print Summary</button>
            <button onclick="printResults()" class="btn btn-primary">🖨 Print List</button>
        </div>
    </div>

    <!-- Filter Bar (5 columns) -->
    <div class="card" style="margin-bottom: 20px;">
        <div class="toolbar" style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; align-items: center;">

            <div class="search-wrap" style="position: relative;">
                <input type="text" id="resultSearch" placeholder="Search results..." style="width: 100%; padding-left: 32px;">
            </div>

            <select id="studentResultFilter" class="filter" style="width: 100%;">
                <option value="">All Students</option>
                ${students.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
            </select>

            <select id="classResultFilter" class="filter" style="width: 100%;" onchange="loadResults()">
                <option value="">All Classes</option>
                ${[...new Set(students.map(s => s.grade).filter(Boolean))].map(c => `<option value="${c}" ${currentGradeFilter === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
            </select>

            <select id="termFilter" class="filter" style="width: 100%;">
                <option value="">All Terms</option>
                <option>Term 1</option><option>Term 2</option><option>Term 3</option><option>Annual</option>
            </select>

            <div style="display: flex; gap: 8px; width: 100%;">
                <button onclick="filterResults()" class="btn btn-ghost btn-sm" style="flex: 1;">🔍 Filter</button>
                <button onclick="showResultModal()" class="btn btn-primary btn-sm" style="flex: 1;">+ Add</button>
            </div>

        </div>
    </div>

    <!-- Date Range Filter Bar (3 columns) -->
    <div class="card" style="margin-bottom: 20px; background: #1e293b; padding: 12px 16px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr 2fr; gap: 15px; align-items: end;">
            <div class="form-group">
                <label style="color: #94a3b8; font-size: 12px;">Date From</label>
                <input type="date" id="dateFromFilter" class="filter" style="width: 100%;">
            </div>
            <div class="form-group">
                <label style="color: #94a3b8; font-size: 12px;">Date To</label>
                <input type="date" id="dateToFilter" class="filter" style="width: 100%;">
            </div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button onclick="filterResultsAdvanced()" class="btn btn-primary">🔍 Apply</button>
                <button onclick="clearDateFilters()" class="btn btn-ghost">🗑 Clear</button>
                <button onclick="exportResultsToCSV()" class="btn btn-success">📥 Export CSV</button>
            </div>
        </div>
    </div>

    <!-- View Tabs -->
    <div style="display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 1px solid #334155; padding-bottom: 10px;">
        <button onclick="switchResultsView('list')" id="tabListView" class="btn btn-primary" style="padding: 8px 16px;">📋 Records List View</button>
        <button onclick="switchResultsView('excel')" id="tabExcelView" class="btn btn-ghost" style="padding: 8px 16px;">📊 Excel Bulk Entry Grid</button>
    </div>

    <!-- List View -->
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
                        ${listRowsHtml}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- Excel View -->
    <div id="resultsExcelViewSection" class="view-section" style="display: none;">
        <div class="card" style="margin-bottom: 20px;">
            <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; background: var(--card2); padding: 10px 16px; border-radius: 8px;">
                <label style="color: #94a3b8; font-weight: 500; font-size: 13px;">Class:</label>
                <select id="excelGradeFilter" class="filter" style="min-width: 120px; flex: 1;">
                    <option value="">-- Choose Class --</option>
                    ${classes.map(c => `<option value="${escapeHtml(c.grade_level)}" data-class-id="${c.id}">${escapeHtml(c.class_name)}</option>`).join('')}
                </select>

                <label style="color: #94a3b8; font-weight: 500; font-size: 13px;">Term:</label>
                <select id="excelTermFilter" class="filter" style="min-width: 100px; flex: 0.5;">
                    <option>Term 1</option><option>Term 2</option><option>Term 3</option><option>Annual</option>
                </select>

                <label style="color: #94a3b8; font-weight: 500; font-size: 13px;">Year:</label>
                <input type="text" id="excelYearFilter" value="2026" class="filter" style="width: 70px; text-align: center;">

                <button onclick="loadExcelSpreadsheet()" class="btn btn-primary">📊 Open Spreadsheet</button>
                <button onclick="printBulkResultCards()" class="btn btn-success" style="background-color: #22c55e; color: #fff;">🖨 Print All Cards</button>
            </div>
        </div>

        <div class="card" id="excelSheetCard" style="display: none;">
            <div class="toolbar" style="justify-content: space-between;">
                <div class="card-title" style="margin: 0; color: #f8fafc; font-size: 16px;">Interactive Marks Matrix</div>
                <button onclick="saveExcelSpreadsheet()" class="btn btn-success" style="background-color: #22c55e; color: #fff;">💾 Save All Changes</button>
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
                                        ${students.map(s => `<option value="${s.id}">${escapeHtml(s.name)} (${escapeHtml(s.grade || 'No Class')})</option>`).join('')}
                                    </select>
                                </div>
                                <div class="form-group full">
                                    <label for="resultSubject">Subject *</label>
                                    <select id="resultSubject" required>
                                        <option value="">Select subject</option>
                                        ${window.ALL_SCHOOL_SUBJECTS.map(sub => `<option value="${escapeHtml(sub)}">${escapeHtml(sub)}</option>`).join('')}
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
// EXCEL GRID FUNCTIONS (unchanged, included for completeness)
// ============================================
window.loadExcelSpreadsheet = async function() {
    const gradeSelect = document.getElementById('excelGradeFilter');
    const selectedOption = gradeSelect.options[gradeSelect.selectedIndex];
    const classId = selectedOption?.dataset.classId || '';
    const grade = selectedOption?.dataset.gradeLevel || selectedOption.value;
    const term = document.getElementById('excelTermFilter')?.value;
    const year = document.getElementById('excelYearFilter')?.value;
    if (!grade) { showAlert('Please select a class', 'error'); return; }
    try {
        const data = await fetchAPI(`/results/excel-sheet?grade=${encodeURIComponent(grade)}&class_id=${classId}&term=${encodeURIComponent(term)}&year=${encodeURIComponent(year)}`);
        const subjects = data.subjects || [];
        const students = data.students || [];
        if (!students.length) { showAlert('No students found for this class filter.', 'error'); return; }
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
                let val = (student.marks && student.marks[sub.name] !== undefined) ? student.marks[sub.name] : '';
                thead += `<td><input type="number" class="marks-input" data-student-id="${escapeHtml(studentId)}" data-subject="${escapeHtml(sub.name)}" value="${val}" step="0.01" min="0" max="${sub.max_marks}" style="width:80px"></td>`;
            });
            thead += '</tr>';
        });
        thead += '</tbody>';
        table.innerHTML = thead;
        window._currentExcelContext = { students, subjects, term, year, grade, classId };
        document.getElementById('excelSheetCard').style.display = 'block';
        showAlert('Spreadsheet loaded successfully.', 'success');
    } catch (error) {
        showAlert('Could not load spreadsheet grid data.', 'error');
    }
};

window.saveExcelSpreadsheet = async function() {
    const ctx = window._currentExcelContext;
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
    for (let [studentId, data] of studentMarksMap.entries()) {
        rows.push({ student_id: studentId, student_name: data.student_name, marks: data.marks });
    }
    try {
        const response = await fetch(`${API_BASE}/results/excel-save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                grade: ctx.grade,
                class_id: ctx.classId,
                term: ctx.term,
                year: ctx.year,
                rows
            })
        });
        if (!response.ok) throw new Error('Save failed');
        const result = await response.json();
        showAlert(result.message || 'Saved successfully!', 'success');
        await loadResults();
        switchResultsView('list');
    } catch (error) {
        showAlert('Failed to save marks.', 'error');
    }
};


