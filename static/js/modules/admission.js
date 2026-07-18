// ============================================
// ADMISSION.JS — Printable Student Admission
// Form: school letterhead, admission no, photo,
// student + guardian details, declaration, and
// signature lines. Opens in its own print window,
// same pattern as id_cards.js.
// ============================================

function admissionLogoHtml(size) {
    return `<img src="/static/images/logo.png" alt="Logo" style="width:${size}px;height:${size}px;object-fit:contain;border-radius:8px;background:#fff;"
                 onerror="this.onerror=null;this.outerHTML='<div style=\\'width:${size}px;height:${size}px;border-radius:8px;background:#0f172a;display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.4)}px;\\'>🏫</div>';">`;
}

function admissionFormStyles() {
    return `
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; padding: 24px; margin: 0; color: #0f172a; }
        .adm-toolbar { text-align: center; margin-bottom: 18px; }
        .adm-toolbar button {
            background: #0f172a; color: #fff; border: none; padding: 10px 22px; border-radius: 6px;
            font-size: 14px; font-weight: 600; cursor: pointer; letter-spacing: 0.3px;
        }
        .adm-page {
            width: 210mm; min-height: 297mm; margin: 0 auto 24px auto; background: #fff;
            padding: 16mm 14mm; page-break-after: always; box-shadow: 0 2px 8px rgba(15,23,42,0.15);
        }
        .adm-letterhead {
            display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #c9a227; padding-bottom: 12px; margin-bottom: 6px;
        }
        .adm-school-name { font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: 0.3px; }
        .adm-school-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
        .adm-title-row {
            display: flex; justify-content: space-between; align-items: center; margin: 14px 0 18px 0;
        }
        .adm-title { font-size: 16px; font-weight: 800; letter-spacing: 1px; color: #0f172a; text-transform: uppercase; }
        .adm-no-box { text-align: right; font-size: 12px; color: #334155; }
        .adm-no-box strong { color: #0f172a; font-family: 'Consolas', monospace; font-size: 14px; }
        .adm-body { display: flex; gap: 18px; }
        .adm-fields { flex: 1; }
        .adm-photo-box {
            width: 30mm; height: 36mm; border: 1.5px dashed #94a3b8; border-radius: 6px;
            display: flex; align-items: center; justify-content: center; flex-shrink: 0;
            font-size: 9px; color: #94a3b8; text-align: center; overflow: hidden;
        }
        .adm-photo-box img { width: 100%; height: 100%; object-fit: cover; }
        .adm-section-title {
            font-size: 12px; font-weight: 800; color: #fff; background: #0f172a; padding: 5px 10px;
            border-radius: 4px; text-transform: uppercase; letter-spacing: 0.6px; margin: 16px 0 10px 0;
        }
        .adm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; }
        .adm-field { border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
        .adm-field.full { grid-column: 1 / -1; }
        .adm-field-label { font-size: 9.5px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; }
        .adm-field-value { font-size: 13px; font-weight: 600; color: #0f172a; min-height: 18px; margin-top: 2px; }
        .adm-declaration {
            margin-top: 22px; font-size: 11px; color: #334155; line-height: 1.6;
            border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 14px; background: #f8fafc;
        }
        .adm-signatures { display: flex; justify-content: space-between; margin-top: 46px; }
        .adm-sign-block { width: 42%; text-align: center; }
        .adm-sign-line { border-top: 1.5px solid #0f172a; padding-top: 6px; font-size: 11px; font-weight: 700; color: #334155; }
        .adm-office-use {
            margin-top: 30px; border-top: 2px dashed #cbd5e1; padding-top: 12px; font-size: 10.5px; color: #64748b;
        }
        @media print {
            .adm-toolbar { display: none; }
            body { background: #fff; padding: 0; }
            .adm-page { box-shadow: none; margin: 0; width: auto; min-height: auto; }
        }
    `;
}

function admissionField(label, value, full) {
    return `<div class="adm-field${full ? ' full' : ''}"><div class="adm-field-label">${escapeHtml(label)}</div><div class="adm-field-value">${escapeHtml(value || '-')}</div></div>`;
}

/**
 * Builds one printable admission-form page for a single student.
 */
function renderAdmissionFormHtml(student) {
    const photoHtml = student.photo_path
        ? `<img src="${escapeHtml(student.photo_path)}" alt="Photo">`
        : 'Affix<br>Photograph';

    const today = new Date().toISOString().slice(0, 10);

    return `
        <div class="adm-page">
            <div class="adm-letterhead">
                ${admissionLogoHtml(56)}
                <div>
                    <div class="adm-school-name">${escapeHtml(SCHOOL_NAME || 'School')}</div>
                    <div class="adm-school-sub">Student Admission Record</div>
                </div>
            </div>

            <div class="adm-title-row">
                <div class="adm-title">Admission Form</div>
                <div class="adm-no-box">
                    Admission No.<br><strong>${escapeHtml(student.admission_no || '-')}</strong>
                </div>
            </div>

            <div class="adm-body">
                <div class="adm-fields">
                    <div class="adm-section-title">Student Information</div>
                    <div class="adm-grid">
                        ${admissionField('Full Name', student.name, true)}
                        ${admissionField('Class / Grade', student.grade)}
                        ${admissionField('Gender', student.gender)}
                        ${admissionField('Date of Birth', student.dob)}
                        ${admissionField('Student ID', student.id)}
                    </div>

                    <div class="adm-section-title">Guardian &amp; Contact Information</div>
                    <div class="adm-grid">
                        ${admissionField('Father / Guardian Name', student.parent_name, true)}
                        ${admissionField('Guardian Phone', student.parent_phone)}
                        ${admissionField('Student / Home Phone', student.phone)}
                        ${admissionField('Email', student.email)}
                        ${admissionField('Address', student.address, true)}
                    </div>
                </div>
                <div class="adm-photo-box">${photoHtml}</div>
            </div>

            <div class="adm-section-title">Enrollment</div>
            <div class="adm-grid">
                ${admissionField('Admission / Join Date', student.join_date || today)}
                ${admissionField('Form Printed On', today)}
            </div>

            <div class="adm-declaration">
                I hereby declare that the information provided above is true and correct to the best of my
                knowledge. I understand that any false information may result in cancellation of admission,
                and I agree to abide by the rules and regulations of ${escapeHtml(SCHOOL_NAME || 'the school')}.
            </div>

            <div class="adm-signatures">
                <div class="adm-sign-block"><div class="adm-sign-line">Parent / Guardian Signature</div></div>
                <div class="adm-sign-block"><div class="adm-sign-line">Principal / Admin Signature</div></div>
            </div>

            <div class="adm-office-use">
                <strong>For Office Use Only</strong> — Verified By: _______________  &nbsp;&nbsp; Fee Category: _______________ &nbsp;&nbsp; Remarks: _______________
            </div>
        </div>
    `;
}

function openAdmissionPrintWindow(pagesHtml, title) {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head><title>${escapeHtml(title)}</title><style>${admissionFormStyles()}</style></head>
        <body>
            <div class="adm-toolbar"><button onclick="window.print()">🖨 Print Admission Form</button></div>
            ${pagesHtml}
            <script>
                window.onload = () => setTimeout(() => window.print(), 400);
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// Single-student admission form — called from the Students table row action.
window.printAdmissionForm = async function(id) {
    try {
        const student = await fetchAPI(`/students/${id}`);
        openAdmissionPrintWindow(renderAdmissionFormHtml(student), `Admission Form - ${student.name}`);
    } catch (e) {
        console.error(e);
        showAlert('Failed to load student for admission form', 'error');
    }
};
