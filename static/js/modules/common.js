// ============================================
// COMMON.JS — Shared config, constants, and utility
// functions used across all other modules.
// Must be loaded FIRST.
// ============================================

// ============================================
// API CONFIGURATION
// ============================================
const API_BASE = 'http://127.0.0.1:5004/api';

// Add this at the top of your app.js after API_BASE
let SCHOOL_NAME = 'Qamar Public High School';

// Function to load school settings


// ==================== ALERT & HELPERS ====================
function showAlert(message, type = 'success') {
    const alertDiv = document.getElementById('alert-container');
    if (!alertDiv) return;
    alertDiv.innerHTML = `<div class="alert alert-${type}">${escapeHtml(message)}</div>`;
    setTimeout(() => { alertDiv.innerHTML = ''; }, 3000);
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getGradeBadge(grade) {
    if (!grade) return '<span class="badge badge-red">N/A</span>';
    const g = String(grade).trim();
    if (['A+', 'A'].includes(g)) return `<span class="badge badge-green">${g}</span>`;
    if (['B+', 'B'].includes(g)) return `<span class="badge badge-blue">${g}</span>`;
    if (g === 'C') return `<span class="badge badge-yellow">${g}</span>`;
    return `<span class="badge badge-red">${g}</span>`;
}

async function printPreview(content, title) {
    const printWindow = window.open('', '_blank');
    const currentDate = new Date().toLocaleString();
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head><title>${escapeHtml(title)}</title>
        <style>
            body { font-family: Arial; padding: 30px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ccc; padding: 8px; }
            th { background: #f3f3f3; }
            .print-letterhead { text-align: center; border-bottom: 2px solid #334155; padding-bottom: 12px; margin-bottom: 16px; }
            .print-letterhead .school-name { font-size: 20px; font-weight: 800; color: #0f172a; }
            .print-letterhead .report-title { font-size: 14px; color: #475569; margin-top: 2px; }
        </style>
        </head>
        <body>
            <div class="print-letterhead">
                <div class="school-name">${escapeHtml(typeof SCHOOL_NAME !== 'undefined' ? SCHOOL_NAME : 'School')}</div>
                <div class="report-title">${escapeHtml(title)}</div>
            </div>
            <p>Generated: ${currentDate}</p>
            ${content}
            <script>
                window.onload = () => setTimeout(() => window.print(), 500);
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// ==================== API WRAPPER ====================
async function fetchAPI(url, options = {}) {
    try {
        const response = await fetch(`${API_BASE}${url}`, {
            ...options,
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });
        if (response.status === 401) {
            document.getElementById('loginOverlay').style.display = 'flex';
            throw new Error('Session expired. Please login again.');
        }
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || data.message || 'API request failed');
        }
        return data;
    } catch (error) {
        showAlert(error.message, 'error');
        throw error;
    }
}async function loadSchoolSettings() {
    try {
        const settings = await fetchAPI('/settings');
        if (settings.school_name) {
            SCHOOL_NAME = settings.school_name;
        }
    } catch (e) {
        console.log('Using default school name');
    }
}

// Update all theme body functions to use SCHOOL_NAME
// Example for modern theme:
const THEMES = {
    modern: {
        css: `
            .card-modern { font-family: 'Inter', system-ui, sans-serif; color: #1e293b; padding: 36px; background: #fff; margin:0; font-size: 16px; }
            .card-modern .header { display: flex; align-items: center; gap: 28px; padding-bottom: 22px; border-bottom: 2px dashed #cbd5e1; margin-bottom: 28px; }
            .card-modern .logo-section { flex-shrink: 0; width: 150px; height: 150px; overflow: hidden; border-radius: 80%; border: 1px solid whte; background: #fff; display: flex; align-items: center; justify-content: center; }
            .card-modern .logo-section img { width: 85%; height: 85%; object-fit: contain; }
            .card-modern .header-text { flex: 1; }
            .card-modern .school-title { font-size: 32px; font-weight: 800; color: #0f172a; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;  text-align: center; }
            .card-modern .school-sub { font-size: 15px; color: #64748b; margin: 4px 0 0 0; font-weight: 500;  text-align: center;  }
            .card-modern .badge-title { display: inline-block; background: #0f172a; color: #fff; padding: 6px 28px; font-weight: 700; font-size: 14px; text-transform: uppercase; border-radius: 30px; margin-top: 10px;  text-align: center;  }.card-modern .header-text {
    text-align: center;
}
            .card-modern .info-card { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 22px; border-radius: 8px; margin-bottom: 22px; }
            .card-modern .info-item { font-size: 15px; margin: 4px 0; color: #334155; }
            .card-modern .info-label { font-weight: 600; color: #64748b; display: inline-block; width: 120px; }
            .card-modern table { width: 100%; border-collapse: collapse; margin-bottom: 22px; font-size: 15px; }
            .card-modern th { background: #0f172a; color: #fff; padding: 11px 15px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
            .card-modern td { padding: 9px 13px; }
            .card-modern .summary-container { display: flex; justify-content: flex-end; margin-top: 14px; }
            .card-modern .summary-table { width: auto; min-width: 360px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 15px; }
            .card-modern .summary-table td { padding: 10px 18px; border-bottom: 1px solid #e2e8f0; }
            .card-modern .sig-section { display: flex; justify-content: space-between; margin-top: 48px; font-size: 14px; }
            .card-modern .sig-line { width: 190px; border-top: 1px solid #94a3b8; text-align: center; padding-top: 8px; font-weight: 600; color: #475569; }
            @media print { .no-print { display: none; } body { padding: 0; margin: 0; } .card-modern { padding: 28px; } }
        `,
        body: (student, results, term, totalObtained, totalMarks, overallPct, overallGrade) => {
            const studentClass = student.grade || 'N/A';
            let subjectRows = '';
            results.forEach(r => {
                const sub = r.subject;
                const obtained = parseFloat(r.obtained_marks || 0);
                const maxMarks = parseFloat(r.total_marks || 100);
                const pctStr = r.total_marks ? ((r.obtained_marks / r.total_marks) * 100).toFixed(0) + '%' : '0%';
                const letterGrade = r.grade || 'A';
                subjectRows += `
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td style="padding: 8px 13px; text-align: left; font-weight: 600; color: #1e293b;">${escapeHtml(sub)}</td>
                        <td style="padding: 8px 13px; text-align: center; color: #64748b;">${maxMarks}</td>
                        <td style="padding: 8px 13px; text-align: center; font-weight: 700; color: #0f172a;">${obtained}</td>
                        <td style="padding: 8px 13px; text-align: center; font-weight: 600; color: #2563eb;">${pctStr}</td>
                        <td style="padding: 8px 13px; text-align: center;"><span style="background: #f1f5f9; padding: 4px 14px; border-radius: 4px; font-weight: 700; font-size: 13px;">${escapeHtml(letterGrade)}</span></td>
                    </tr>`;
            });
            return `
                <div class="card-modern">
                    <div class="header">
                        <div class="logo-section">
                            <img src="/static/images/logo.png" alt="School Logo" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'width:90px;height:90px;display:flex;align-items:center;justify-content:center;background:#eee;border-radius:50%;font-size:15px;font-weight:bold;color:#333;\\'>LOGO</div>'">
                        </div>
                        <div class="header-text">
                            <div class="school-title">${SCHOOL_NAME}</div>
                            <div class="school-sub">Dedicated to Excellence in Education</div>
                            <div class="badge-title">Official Student Result Card</div>
                        </div>
                    </div>
                    <div class="info-card">
                        <div>
                            <div class="info-item"><span class="info-label">Student Name:</span> <strong style="color:#0f172a;">${escapeHtml(student.name)}</strong></div>
                            <div class="info-item"><span class="info-label">Student ID:</span> ${escapeHtml(student.id)}</div>
                            <div class="info-item"><span class="info-label">Class / Grade:</span> ${escapeHtml(studentClass)}</div>
                        </div>
                        <div style="text-align: right;">
                            <div class="info-item"><span class="info-label">Exam Term:</span> <strong>${escapeHtml(term)}</strong></div>
                            <div class="info-item"><span class="info-label">Academic Year:</span> 2026</div>
                            <div class="info-item"><span class="info-label">Issue Date:</span> ${new Date().toLocaleDateString()}</div>
                        </div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th style="text-align: left; border-top-left-radius: 6px;">Subject</th>
                                <th style="width: 12%;">Total</th>
                                <th style="width: 12%;">Obtained</th>
                                <th style="width: 12%;">%</th>
                                <th style="width: 12%; border-top-right-radius: 6px;">Grade</th>
                            </tr>
                        </thead>
                        <tbody>${subjectRows}</tbody>
                    </table>
                    <div class="summary-container">
                        <table class="summary-table">
                            <tr><td style="width:60%;">Max Allowable Marks:</td><td style="text-align: right; font-weight: 600;">${totalMarks}</td></tr>
                            <tr><td>Total Marks Secured:</td><td style="text-align: right; font-weight: 700; color: #0f172a;">${totalObtained}</td></tr>
                            <tr style="background: #f8fafc; font-weight: bold;"><td>Final Percentage:</td><td style="text-align: right; color: #2563eb; font-size: 18px;">${overallPct}%</td></tr>
                            <tr style="background: #f1f5f9; font-weight: bold;"><td>Overall Grade:</td><td style="text-align: right; font-size: 18px;">${overallGrade}</td></tr>
                        </table>
                    </div>
                    <div class="sig-section">
                        <div class="sig-line">In-Charge Teacher</div>
                        <div class="sig-line">Principal / Controller</div>
                    </div>
                </div>
            `;
        }
    },

    classic: {
        css: `
            .card-classic { font-family: 'Georgia', serif; color: #222; padding: 28px; background: #fff; font-size: 16px; }
            .card-classic .outer-border { border: 5px solid #1e3a8a; padding: 6px; }
            .card-classic .inner-border { border: 1px solid #1e3a8a; padding: 28px; }
            .card-classic .school-header { display: flex; align-items: center; gap: 28px; margin-bottom: 28px;  text-align: center; }
            .card-classic .logo-section { flex-shrink: 0; width: 150px; height: 150px; overflow: hidden; border: 1px solid #fff; border-radius: 50%; background: #fff; display: flex; align-items: center; justify-content: center; }
            .card-classic .logo-section img { width: 85%; height: 85%; object-fit: contain; }
            .card-classic .header-text { flex: 1; }
            .card-classic .school-name {
    font-size: 34px;
    font-weight: bold;
    color: #1e3a8a;
    font-family: 'Times New Roman', serif;
    margin: 0;
    text-align: center;          /* ✅ صحیح */
}

.card-classic .sub-heading {
    font-size: 14px;
    font-style: italic;
    color: #555;
    margin-top: 4px;
    text-transform: uppercase;
    letter-spacing: 1px;
    text-align: center;          /* ✅ صحیح */
}

.card-classic .title {
    font-size: 18px;
    font-weight: bold;
    margin-top: 12px;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: #1e3a8a;
    border-bottom: 2px solid #1e3a8a;
    display: inline-block;
    padding-bottom: 4px;
    text-align: center;          /* ✅ صحیح */
}
            .card-classic .meta-table { width: 100%; margin-bottom: 22px; font-size: 15px; border-bottom: 1px solid #ccc; padding-bottom: 16px; }
            .card-classic .data-table { width: 100%; border-collapse: collapse; margin-bottom: 22px; font-size: 15px; }
            .card-classic .data-table th { border: 1px solid #1e3a8a; padding: 10px 13px; background: #f0f4f8; font-size: 13px; font-weight: bold; text-transform: uppercase; color: #1e3a8a; }
            .card-classic .data-table td { border: 1px solid #ccc; padding: 8px 13px; text-align: center; font-family: sans-serif; }
            .card-classic .total-row { font-weight: bold; background: #f0f4f8; }
            .card-classic .signatures { display: flex; justify-content: space-between; margin-top: 55px; font-size: 14px; }
            .card-classic .line { width: 190px; border-top: 1px dashed #222; text-align: center; padding-top: 6px; }
        `,
        body: (student, results, term, totalObtained, totalMarks, overallPct, overallGrade) => {
            const studentClass = student.grade || 'N/A';
            let subjectRows = '';
            results.forEach(r => {
                const sub = r.subject;
                const obtained = parseFloat(r.obtained_marks || 0);
                const maxMarks = parseFloat(r.total_marks || 100);
                const pctStr = r.total_marks ? ((r.obtained_marks / r.total_marks) * 100).toFixed(0) + '%' : '0%';
                const letterGrade = r.grade || 'A';
                subjectRows += `
                    <tr>
                        <td style="text-align: left; font-weight: bold; font-family: serif; padding: 8px 13px;">${escapeHtml(sub)}</td>
                        <td style="padding: 8px 13px;">${maxMarks}</td>
                        <td style="font-weight: bold; padding: 8px 13px;">${obtained}</td>
                        <td style="padding: 8px 13px;">${pctStr}</td>
                        <td style="font-weight: bold; padding: 8px 13px;">${escapeHtml(letterGrade)}</td>
                    </tr>`;
            });
            return `
                <div class="card-classic">
                    <div class="outer-border">
                        <div class="inner-border">
                            <div class="school-header">
                                <div class="logo-section">
                                    <img src="/static/images/logo.png" alt="School Logo" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'width:90px;height:90px;display:flex;align-items:center;justify-content:center;background:#eee;border-radius:50%;font-size:15px;font-weight:bold;color:#333;\\'>LOGO</div>'">
                                </div>
                                <div class="header-text">
                                    <div class="school-name">${SCHOOL_NAME}</div>
                                    <div class="sub-heading">Government Registered Institution</div>
                                    <div class="title">Academic Achievement Report</div>
                                </div>
                            </div>
                            <table class="meta-table" style="border:none;">
                                <tr>
                                    <td style="width:50%; padding: 4px 0;"><strong>Student:</strong> ${escapeHtml(student.name)}</td>
                                    <td style="text-align: right; padding: 4px 0;"><strong>Term:</strong> ${escapeHtml(term)}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 4px 0;"><strong>ID:</strong> ${escapeHtml(student.id)}</td>
                                    <td style="text-align: right; padding: 4px 0;"><strong>Year:</strong> 2026</td>
                                </tr>
                                <tr>
                                    <td style="padding: 4px 0;"><strong>Class:</strong> ${escapeHtml(studentClass)}</td>
                                    <td style="text-align: right; padding: 4px 0;"><strong>Date:</strong> ${new Date().toLocaleDateString()}</td>
                                </tr>
                            </table>
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th style="text-align: left; width: 40%;">Subject</th>
                                        <th>Total</th>
                                        <th>Obtained</th>
                                        <th>%</th>
                                        <th>Grade</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${subjectRows}
                                    <tr class="total-row">
                                        <td style="text-align: left; padding: 8px 13px;">GRAND TOTALS</td>
                                        <td style="padding: 8px 13px;">${totalMarks}</td>
                                        <td style="padding: 8px 13px;">${totalObtained}</td>
                                        <td style="padding: 8px 13px;">${overallPct}%</td>
                                        <td style="padding: 8px 13px;">${overallGrade}</td>
                                    </tr>
                                </tbody>
                            </table>
                            <div class="signatures">
                                <div class="line">Class In-Charge</div>
                                <div class="line">Principal Stamp</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    },

    minimalist: {
        css: `
            .card-minimalist { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #2d3748; padding: 28px; line-height: 1.55; font-size: 16px; }
            .card-minimalist .header-flex { display: flex; align-items: center; gap: 28px; border-bottom: 1px solid #e2e8f0; padding-bottom: 18px; margin-bottom: 22px; }
            .card-minimalist .logo-section { flex-shrink: 0; width: 150px; height: 150px; overflow: hidden; border-radius: 50%; background: #fff; display: flex; align-items: center; justify-content: center; border: 1px solid #fff; }
            .card-minimalist .logo-section img { width: 85%; height: 85%; object-fit: contain; }
            .card-minimalist .school-main { font-size: 28px; font-weight: 700; color: #1a202c; }
            .card-minimalist .report-tag { font-size: 14px; background: #e6fffa; color: #00a389; padding: 4px 14px; font-weight: 600; border-radius: 4px; display: inline-block; margin-left: 12px; }
            .card-minimalist .meta-strip { display: flex; justify-content: space-between; font-size: 13px; color: #718096; margin-bottom: 22px; background: #f7fafc; padding: 14px 18px; border-radius: 6px; }
            .card-minimalist table { width: 100%; border-collapse: collapse; margin-bottom: 22px; font-size: 15px; }
            .card-minimalist th { text-align: left; padding: 8px 13px; font-size: 12px; color: #718096; text-transform: uppercase; border-bottom: 2px solid #edf2f7; letter-spacing: 0.5px; }
            .card-minimalist td { padding: 8px 13px; font-size: 15px; border-bottom: 1px solid #edf2f7; }
            .card-minimalist .grid-container { display: grid; grid-template-columns: 1fr 1fr; gap: 35px; margin-top: 18px; }
            .card-minimalist .summary-box { border: 1px solid #edf2f7; padding: 18px; border-radius: 6px; background: #fff; }
            .card-minimalist .summary-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 15px; border-bottom: 1px dashed #edf2f7; }
            .card-minimalist .summary-row:last-child { border: none; font-weight: bold; font-size: 16px; color: #00a389; }
            .card-minimalist .sign-box { display: flex; align-items: flex-end; justify-content: space-around; font-size: 13px; font-weight: 500; color: #718096; padding-top: 18px; }
        `,
        body: (student, results, term, totalObtained, totalMarks, overallPct, overallGrade) => {
            const studentClass = student.grade || 'N/A';
            let subjectRows = '';
            results.forEach(r => {
                const sub = r.subject;
                const obtained = parseFloat(r.obtained_marks || 0);
                const maxMarks = parseFloat(r.total_marks || 100);
                const pctStr = r.total_marks ? ((r.obtained_marks / r.total_marks) * 100).toFixed(0) + '%' : '0%';
                const letterGrade = r.grade || 'A';
                subjectRows += `
                    <tr>
                        <td style="font-weight: 500; padding: 6px 13px;">${escapeHtml(sub)}</td>
                        <td style="text-align: center; color: #718096; padding: 6px 13px;">${maxMarks}</td>
                        <td style="text-align: center; font-weight: 600; padding: 6px 13px;">${obtained}</td>
                        <td style="text-align: center; color: #4a5568; padding: 6px 13px;">${pctStr}</td>
                        <td style="text-align: right; font-weight: 600; padding: 6px 13px;">${escapeHtml(letterGrade)}</td>
                    </tr>`;
            });
            return `
                <div class="card-minimalist">
                    <div class="header-flex">
                        <div class="logo-section">
                            <img src="/static/images/logo.png" alt="School Logo" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'width:78px;height:78px;display:flex;align-items:center;justify-content:center;background:#eee;border-radius:50%;font-size:14px;font-weight:bold;color:#333;\\'>LOGO</div>'">
                        </div>
                        <div>
                            <div class="school-main">${SCHOOL_NAME} <span class="report-tag">Report Card</span></div>
                            <div style="font-size: 13px; color: #718096;">Lahore, Pakistan</div>
                        </div>
                    </div>
                    <div class="meta-strip">
                        <div><strong>Student:</strong> ${escapeHtml(student.name)} (${escapeHtml(student.id)})</div>
                        <div><strong>Class:</strong> ${escapeHtml(studentClass)}</div>
                        <div><strong>Term:</strong> ${escapeHtml(term)}</div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 40%;">Subject</th>
                                <th style="text-align: center;">Total</th>
                                <th style="text-align: center;">Obtained</th>
                                <th style="text-align: center;">%</th>
                                <th style="text-align: right;">Grade</th>
                            </tr>
                        </thead>
                        <tbody>${subjectRows}</tbody>
                    </table>
                    <div class="grid-container">
                        <div class="sign-box">
                            <div style="border-top: 1px solid #cbd5e0; width: 160px; text-align: center; padding-top: 6px;">Teacher</div>
                            <div style="border-top: 1px solid #cbd5e0; width: 160px; text-align: center; padding-top: 6px;">Principal</div>
                        </div>
                        <div class="summary-box">
                            <div class="summary-row"><span>Total Max Marks:</span><span>${totalMarks}</span></div>
                            <div class="summary-row"><span>Total Secured:</span><span>${totalObtained}</span></div>
                            <div class="summary-row"><span>Percentage / Grade:</span><span>${overallPct}% (${overallGrade})</span></div>
                        </div>
                    </div>
                </div>
            `;
        }
    },

    'slate-grid': {
        css: `
            .card-slate-grid { font-family: system-ui, -apple-system, sans-serif; background: #fff; padding: 28px; color: #1e293b; margin: 0; font-size: 16px; }
            .card-slate-grid .layout-wrapper { display: grid; grid-template-columns: 220px 1fr; gap: 28px; }
            .card-slate-grid .sidebar-panel { background: #0f172a; color: #f8fafc; padding: 28px 22px; border-radius: 12px; display: flex; flex-direction: column; justify-content: space-between; }
            .card-slate-grid .school-brand { border-bottom: 1px solid #334155; padding-bottom: 18px; margin-bottom: 18px; text-align: center; }
            .card-slate-grid .logo-section { width: 130px; height: 130px; margin: 0 auto 12px; overflow: hidden; border-radius: 50%; border: 2px solid #fff; background: #fff; display: flex; align-items: center; justify-content: center; }
            .card-slate-grid .logo-section img { width: 90%; height: 90%; object-fit: contain; }
            .card-slate-grid .school-brand h2 { font-size: 18px; font-weight: 800; margin: 0; color: #f8fafc; line-height: 1.25; word-wrap: break-word; }
            .card-slate-grid .profile-data { font-size: 13px; line-height: 1.65; }
            .card-slate-grid .profile-heading { font-size: 11px; text-transform: uppercase; color: #94a3b8; letter-spacing: 1px; margin-top: 14px; }
            .card-slate-grid .main-panel { padding: 8px 0; }
            .card-slate-grid .doc-title { font-size: 22px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a; margin: 0 0 18px 0; border-bottom: 2px solid #0f172a; padding-bottom: 5px; }
            .card-slate-grid table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 15px; }
            .card-slate-grid th { background: #f8fafc; border-bottom: 2px solid #cbd5e1; padding: 8px 13px; text-align: center; font-size: 12px; text-transform: uppercase; color: #475569; letter-spacing: 0.5px; }
            .card-slate-grid td { padding: 6px 13px; }
            .card-slate-grid .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; background: #f1f5f9; padding: 18px; border-radius: 8px; text-align: center; }
            .card-slate-grid .metric-card { background: #fff; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0; }
            .card-slate-grid .metric-val { font-size: 20px; font-weight: 800; color: #0f172a; }
            .card-slate-grid .metric-lbl { font-size: 11px; text-transform: uppercase; color: #64748b; margin-top: 2px; }
            .card-slate-grid .signs { display: flex; justify-content: space-between; margin-top: 28px; padding-top: 14px; border-top: 1px dashed #e2e8f0; font-size: 12px; font-weight: 600; color: #64748b; }
        `,
        body: (student, results, term, totalObtained, totalMarks, overallPct, overallGrade) => {
            const studentClass = student.grade || 'N/A';
            let subjectRows = '';
            results.forEach(r => {
                const sub = r.subject;
                const obtained = parseFloat(r.obtained_marks || 0);
                const maxMarks = parseFloat(r.total_marks || 100);
                const pctStr = r.total_marks ? ((r.obtained_marks / r.total_marks) * 100).toFixed(0) + '%' : '0%';
                const letterGrade = r.grade || 'A';
                subjectRows += `
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td style="padding: 6px 13px; text-align: left; font-weight: 600; color: #334155;">${escapeHtml(sub)}</td>
                        <td style="padding: 6px 13px; text-align: center; color: #64748b;">${maxMarks}</td>
                        <td style="padding: 6px 13px; text-align: center; font-weight: 700; color: #0f172a;">${obtained}</td>
                        <td style="padding: 6px 13px; text-align: center; color: #475569;">${pctStr}</td>
                        <td style="padding: 6px 13px; text-align: center; font-weight: bold; color:#0284c7;">${escapeHtml(letterGrade)}</td>
                    </tr>`;
            });
            return `
                <div class="card-slate-grid">
                    <div class="layout-wrapper">
                        <div class="sidebar-panel">
                            <div>
                                <div class="school-brand">
                                    <div class="logo-section">
                                        <img src="/static/images/logo.png" alt="School Logo" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'width:90px;height:90px;display:flex;align-items:center;justify-content:center;background:#eee;border-radius:50%;font-size:15px;font-weight:bold;color:#333;\\'>LOGO</div>'">
                                    </div>
                                    <h2>${escapeHtml(SCHOOL_NAME)}</h2>
                                    <div style="font-size: 11px; color: #38bdf8; font-weight: 600;">ACADEMIC RESULT CARD</div>
                                </div>
                                <div class="profile-data">
                                    <div class="profile-heading">Student</div>
                                    <div style="font-size: 16px; font-weight: 700; color: #fff;">${escapeHtml(student.name)}</div>
                                    <div>ID: #${escapeHtml(student.id)}</div>
                                    <div class="profile-heading">Class</div>
                                    <div style="font-weight: 600;">${escapeHtml(studentClass)}</div>
                                    <div class="profile-heading">Session</div>
                                    <div>Term: ${escapeHtml(term)}</div>
                                </div>
                            </div>
                            <div style="font-size: 11px; color: #64748b; text-align: center; border-top: 1px solid #334155; padding-top: 10px;">
                                Verified Record
                            </div>
                        </div>
                        <div class="main-panel">
                            <div class="doc-title">Student Achievement</div>
                            <table>
                                <thead>
                                    <tr>
                                        <th style="text-align: left;">Subject</th>
                                        <th style="width: 12%;">Max</th>
                                        <th style="width: 12%;">Secured</th>
                                        <th style="width: 12%;">%</th>
                                        <th style="width: 12%;">Grade</th>
                                    </tr>
                                </thead>
                                <tbody>${subjectRows}</tbody>
                            </table>
                            <div class="summary-grid">
                                <div class="metric-card">
                                    <div class="metric-val">${totalObtained}/${totalMarks}</div>
                                    <div class="metric-lbl">Total Score</div>
                                </div>
                                <div class="metric-card" style="border-left: 3px solid #0284c7;">
                                    <div class="metric-val" style="color: #0284c7;">${overallPct}%</div>
                                    <div class="metric-lbl">Average</div>
                                </div>
                                <div class="metric-card" style="border-left: 3px solid #22c55e;">
                                    <div class="metric-val" style="color: #22c55e;">${overallGrade}</div>
                                    <div class="metric-lbl">Grade</div>
                                </div>
                            </div>
                            <div class="signs">
                                <div>Teacher Signature</div>
                                <div>Registrar Stamp</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    },

    'royal-emblem': {
        css: `
            .card-royal { font-family: 'Times New Roman', Times, serif; background: #fafaf9; padding: 28px; color: #451a03; font-size: 16px; }
            .card-royal .gold-frame { border: 6px double #b45309; padding: 8px; background: #fff; }
            .card-royal .inner-frame { border: 1px solid #b45309; padding: 28px; }
            .card-royal .emblem-header { display: flex; align-items: center; gap: 28px; margin-bottom: 22px; }
            .card-royal .logo-section { flex-shrink: 0; width: 150px; height: 150px; overflow: hidden; border-radius: 50%; border: 2px solid #fff; background: #fff; display: flex; align-items: center; justify-content: center; }
            .card-royal .logo-section img { width: 85%; height: 85%; object-fit: contain; }
            .card-royal .header-text { flex: 1; text-align: center; }
            .card-royal .school-title { font-size: 34px; font-weight: bold; color: #78350f; letter-spacing: 1px; margin: 0; }
            .card-royal .school-loc { font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: #b45309; margin-top: 4px; font-weight: 600; }
            .card-royal .doc-badge { margin-top: 6px; font-size: 16px; font-style: italic; font-weight: bold; border-bottom: 2px solid #78350f; display: inline-block; padding: 0 32px 4px 32px; color: #78350f; }
            .card-royal .meta-box { width: 100%; border-collapse: collapse; font-size: 15px; margin-bottom: 18px; font-family: 'Times New Roman', Times, serif; }
            .card-royal .meta-box td { padding: 4px 8px; border-bottom: 1px solid #f5e0b3; }
            .card-royal table.data-table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 15px; }
            .card-royal table.data-table th { background: #fef3c7; color: #78350f; border: 1px solid #b45309; padding: 8px 13px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
            .card-royal table.data-table td { padding: 6px 13px; border: 1px solid #e2e8f0; }
            .card-royal .summary-strip { background: #fef3c7; border: 1px solid #b45309; border-radius: 4px; padding: 10px 22px; display: flex; justify-content: space-around; font-size: 14px; font-weight: bold; margin-bottom: 28px; text-transform: uppercase; }
            .card-royal .footer-signs { display: flex; justify-content: space-between; margin-top: 35px; padding: 0 32px; }
            .card-royal .sign-line { width: 180px; border-top: 1px solid #78350f; text-align: center; padding-top: 6px; font-size: 13px; font-weight: bold; color: #78350f; }
        `,
        body: (student, results, term, totalObtained, totalMarks, overallPct, overallGrade) => {
            const studentClass = student.grade || 'N/A';
            let subjectRows = '';
            results.forEach(r => {
                const sub = r.subject;
                const obtained = parseFloat(r.obtained_marks || 0);
                const maxMarks = parseFloat(r.total_marks || 100);
                const pctStr = r.total_marks ? ((r.obtained_marks / r.total_marks) * 100).toFixed(0) + '%' : '0%';
                const letterGrade = r.grade || 'A';
                subjectRows += `
                    <tr>
                        <td style="padding: 6px 13px; text-align: left; font-family: serif; font-weight: bold;">${escapeHtml(sub)}</td>
                        <td style="padding: 6px 13px; text-align: center;">${maxMarks}</td>
                        <td style="padding: 6px 13px; text-align: center; font-weight: bold;">${obtained}</td>
                        <td style="padding: 6px 13px; text-align: center; color: #78350f;">${pctStr}</td>
                        <td style="padding: 6px 13px; text-align: center; font-weight: bold; color: #b45309;">${escapeHtml(letterGrade)}</td>
                    </tr>`;
            });
            return `
                <div class="card-royal">
                    <div class="gold-frame">
                        <div class="inner-frame">
                            <div class="emblem-header">
                                <div class="logo-section">
                                    <img src="/static/images/logo.png" alt="School Logo" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'width:90px;height:90px;display:flex;align-items:center;justify-content:center;background:#eee;border-radius:50%;font-size:15px;font-weight:bold;color:#333;\\'>LOGO</div>'">
                                </div>
                                <div class="header-text">
                                    <div class="school-title">${SCHOOL_NAME}</div>
                                    <div class="school-loc">Official Scholastic Transcript</div>
                                    <div class="doc-badge">Certificate of Academic Progress</div>
                                </div>
                            </div>
                            <table class="meta-box">
                                <tr>
                                    <td style="width: 15%; font-weight: bold; color:#b45309;">Scholar:</td>
                                    <td style="width: 45%; font-size: 17px; font-weight: bold;">${escapeHtml(student.name)}</td>
                                    <td style="width: 15%; font-weight: bold; color:#b45309;">Roll ID:</td>
                                    <td>${escapeHtml(student.id)}</td>
                                </tr>
                                <tr>
                                    <td style="font-weight: bold; color:#b45309;">Class:</td>
                                    <td><strong>${escapeHtml(studentClass)}</strong></td>
                                    <td style="font-weight: bold; color:#b45309;">Term:</td>
                                    <td><strong>${escapeHtml(term)}</strong></td>
                                </tr>
                                <tr>
                                    <td style="font-weight: bold; color:#b45309;">Year:</td>
                                    <td>2026</td>
                                    <td style="font-weight: bold; color:#b45309;">Date:</td>
                                    <td>${new Date().toLocaleDateString()}</td>
                                </tr>
                            </table>
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th style="text-align: left; width: 40%;">Course</th>
                                        <th style="width: 12%;">Max</th>
                                        <th style="width: 12%;">Secured</th>
                                        <th style="width: 12%;">%</th>
                                        <th style="width: 12%;">Grade</th>
                                    </tr>
                                </thead>
                                <tbody>${subjectRows}</tbody>
                            </table>
                            <div class="summary-strip">
                                <div>Score: <span style="color:#78350f;">${totalObtained}/${totalMarks}</span></div>
                                <div>Percent: <span style="color:#78350f;">${overallPct}%</span></div>
                                <div>Grade: <span style="color:#78350f;">${overallGrade}</span></div>
                            </div>
                            <div class="footer-signs">
                                <div class="sign-line">Controller of Examinations</div>
                                <div class="sign-line">Headmaster</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    },

    diagonal: {
    css: `
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');
        .card-diagonal { font-family: 'Poppins', sans-serif; background: #f0f2f5; padding: 15px; display: flex; justify-content: center; }
        .card-diagonal .result-card-container { width: 100%; max-width: 210mm; background: #ffffff; padding: 24px; position: relative; border: 2px solid #1a252f; box-shadow: 0 4px 15px rgba(0,0,0,0.1); font-size: 13.5px; }
        .card-diagonal .header-wrapper { position: relative; display: flex; justify-content: space-between; align-items: center; border-bottom: 4px solid #1a252f; padding-bottom: 15px; margin-bottom: 19px; min-height: 110px; }
        .card-diagonal .header-wrapper::before { content: ''; position: absolute; top: -24px; left: -24px; width: 40%; height: calc(100% + 48px); background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%); clip-path: polygon(0 0, 100% 0, 75% 100%, 0% 100%); z-index: 1; }
        .card-diagonal .header-wrapper::after { content: ''; position: absolute; top: -24px; left: -24px; width: 43%; height: calc(100% + 48px); background: #3498db; clip-path: polygon(0 0, 100% 0, 78% 100%, 0% 100%); z-index: 0; opacity: 0.8; }
        .card-diagonal .logo-section { position: relative; z-index: 2; width: 130px; height: 130px; background: #ffffff; border-radius: 50%; border: 3px solid #3498db; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 8px rgba(0,0,0,0.1); overflow: hidden; flex-shrink: 0; }
        .card-diagonal .logo-section img { width: 100%; height: 100%;  border-radius: 50%;   object-fit: cover; object-position: center; display: block; }
        .card-diagonal .school-title-block { text-align: right; flex-grow: 1; padding-left: 24px; z-index: 2; }
        .card-diagonal .school-title-block h1 { font-size: 24px; font-weight: 700; color: #1a252f; letter-spacing: 1px; text-transform: uppercase; margin: 0; }
        .card-diagonal .badge-title-container { margin: 12px 0; display: flex; justify-content: center; }
        .card-diagonal .document-badge { border: 2px solid #1a252f; padding: 5px 27px; font-weight: 700; font-size: 15px; text-transform: uppercase; letter-spacing: 1.5px; color: #1a252f; background: #fdfdfd; box-shadow: 3px 3px 0px #1a252f; }
        .card-diagonal .exam-session-sub { text-align: center; font-size: 12px; font-weight: 600; margin-bottom: 15px; text-decoration: underline; }
        .card-diagonal .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; padding: 0 7px; }
        .card-diagonal .info-item { display: flex; align-items: baseline; }
        .card-diagonal .info-label { font-size: 12px; font-weight: 600; color: #2c3e50; min-width: 90px; }
        .card-diagonal .info-value { flex-grow: 1; border-bottom: 1px dashed #1a252f; font-size: 12px; color: #333; padding-left: 7px; }
        .card-diagonal .marks-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 12px; }
        .card-diagonal .marks-table th { background-color: #ffffff; color: #1a252f; border: 2px solid #1a252f; padding: 7px 11px; font-weight: 700; font-size: 11px; text-transform: uppercase; }
        .card-diagonal .marks-table td { border: 1px solid #1a252f; padding: 5px 11px; text-align: center; }
        .card-diagonal .marks-table td:nth-child(2) { text-align: left; font-weight: 600; }
        .card-diagonal .marks-table tr.total-row td { font-weight: 700; background-color: #f8f9fa; border-top: 2px solid #1a252f; border-bottom: 2px solid #1a252f; }
        .card-diagonal .bottom-meta-box { display: flex; justify-content: space-between; align-items: center; margin: 12px 0; padding: 0 7px; }
        .card-diagonal .result-status { font-size: 13px; font-weight: 700; }
        .card-diagonal .result-status span { border-bottom: 1px solid #000; padding: 0 19px; }
        .card-diagonal .remarks-panel { border: 2px solid #1a252f; padding: 12px 17px; margin-bottom: 30px; position: relative; }
        .card-diagonal .remarks-title { position: absolute; top: -12px; left: 19px; background: #ffffff; padding: 0 10px; font-weight: 600; font-size: 11px; }
        .card-diagonal .remarks-lines { line-height: 2; height: 38px; font-size: 12px; }
        .card-diagonal .signature-block { display: flex; flex-direction: column; align-items: center; width: 160px; margin-left: auto; text-align: center; }
        .card-diagonal .signature-line { width: 100%; border-top: 1.5px solid #1a252f; margin-top: 30px; padding-top: 5px; font-size: 11px; font-weight: 600; color: #2c3e50; }
        @media print { .card-diagonal .result-card-container { box-shadow: none; border: 2px solid #000; } }
    `,
    body: (student, results, term, totalObtained, totalMarks, overallPct, overallGrade) => {
        const studentClass = student.grade || 'N/A';
        const parentName = student.parent_name || '—';
        const rollNo = student.id || '—';

        let subjectRows = '';
        results.forEach((r, index) => {
            const sr = index + 1;
            const sub = r.subject;
            const obtained = parseFloat(r.obtained_marks || 0);
            const maxMarks = parseFloat(r.total_marks || 100);
            const pct = maxMarks ? (obtained / maxMarks) * 100 : 0;
            const remarks = (pct >= 40) ? 'Pass' : 'Fail';
            subjectRows += `
                <tr>
                    <td style="padding: 4px 9px;">${sr}</td>
                    <td style="text-align:left; font-weight:600; padding: 4px 9px;">${escapeHtml(sub)}</td>
                    <td style="padding: 4px 9px;">${maxMarks}</td>
                    <td style="padding: 4px 9px;">${obtained}</td>
                    <td style="padding: 4px 9px;">${remarks}</td>
                </tr>`;
        });

        const totalSubjects = results.length;
        for (let i = totalSubjects + 1; i <= 9; i++) {
            subjectRows += `
                <tr>
                    <td style="padding: 4px 9px;">${i}</td>
                    <td style="padding: 4px 9px;"></td>
                    <td style="padding: 4px 9px;"></td>
                    <td style="padding: 4px 9px;"></td>
                    <td style="padding: 4px 9px;"></td>
                </tr>`;
        }

        const overallResult = (overallPct >= 40) ? 'Pass' : 'Fail';

        return `
            <div class="card-diagonal">
                <div class="result-card-container">
                    <div class="header-wrapper">
                        <div class="logo-section">
                            <img src="/static/images/logo.png" alt="School Logo" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'width:80px;height:80px;display:flex;align-items:center;justify-content:center;background:#eee;border-radius:50%;font-size:14px;font-weight:bold;color:#333;\\'>LOGO</div>'">
                        </div>
                        <div class="school-title-block">
                            <h1>${SCHOOL_NAME}</h1>
                        </div>
                    </div>

                    <div class="badge-title-container">
                        <div class="document-badge">Student Result Card</div>
                    </div>
                    <div class="exam-session-sub">${escapeHtml(term)} Exam ${new Date().getFullYear()}</div>

                    <div class="info-grid">
                        <div class="info-item">
                            <div class="info-label">Name:</div>
                            <div class="info-value">${escapeHtml(student.name)}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Father:</div>
                            <div class="info-value">${escapeHtml(parentName)}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Class:</div>
                            <div class="info-value">${escapeHtml(studentClass)}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Roll No:</div>
                            <div class="info-value">${escapeHtml(rollNo)}</div>
                        </div>
                    </div>

                    <table class="marks-table">
                        <thead>
                            <tr>
                                <th style="width: 8%;">#</th>
                                <th style="width: 42%;">Subject</th>
                                <th style="width: 15%;">Total</th>
                                <th style="width: 15%;">Obtained</th>
                                <th style="width: 20%;">Remarks</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${subjectRows}
                            <tr class="total-row">
                                <td></td>
                                <td>G.Total</td>
                                <td>${totalMarks}</td>
                                <td>${totalObtained}</td>
                                <td></td>
                            </tr>
                        </tbody>
                    </table>

                    <div class="bottom-meta-box">
                        <div class="result-status">Result: <span>${overallResult}</span></div>
                    </div>

                    <div class="remarks-panel">
                        <div class="remarks-title">Remarks</div>
                        <div class="remarks-lines">${overallPct >= 70 ? 'Excellent performance!' : overallPct >= 50 ? 'Good effort, keep improving.' : 'Needs more focus.'}</div>
                    </div>

                    <div class="signature-block">
                        <div class="signature-line">Principal Signature</div>
                    </div>
                </div>
            </div>
        `;
    }
}
};



// ============================================
// EXTRACT NUMBER HELPER   👈 ADD HERE
// ============================================
function extractNumber(str) {
    if (!str) return null;
    const match = String(str).match(/\d+/);
    return match ? parseInt(match[0]) : null;
}


