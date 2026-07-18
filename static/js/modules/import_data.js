// ============================================
// DATA IMPORT — bring Students, Classes, Teachers, or Fees in from an
// Excel file (exported from another system, or filled from our template).
// ============================================

const _importEntities = [
    { key: 'students', label: 'Students', icon: '🎓' },
    { key: 'classes', label: 'Classes', icon: '🏫' },
    { key: 'teachers', label: 'Teachers', icon: '👩‍🏫' },
    { key: 'fees', label: 'Fees', icon: '💰' },
];
let _importActiveEntity = 'students';

window.loadImportData = async function () {
    const html = `
        <div class="card" style="margin-bottom:16px;">
            <h2 style="margin-bottom:4px;">📥 Import Data</h2>
            <p style="color:#94a3b8;font-size:13px;">
                Bring data in from Excel — either exported from another system, or filled in
                using the template below. Already-existing records (matched by admission
                number / class name) are skipped automatically, so it's safe to re-run an
                import after fixing a few rows.
            </p>
        </div>

        <div class="card" style="margin-bottom:16px;">
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                ${_importEntities.map(e => `
                    <button onclick="switchImportEntity('${e.key}')" id="importTab_${e.key}"
                        class="btn ${e.key === _importActiveEntity ? 'btn-primary' : 'btn-ghost'}">
                        ${e.icon} ${e.label}
                    </button>
                `).join('')}
            </div>
        </div>

        <div class="card" style="margin-bottom:16px;">
            <h3 style="margin-bottom:10px;">Step 1 — Get the template</h3>
            <p style="color:#94a3b8;font-size:13px;margin-bottom:10px;">
                Download the template for <strong id="importEntityLabel">Students</strong>, fill it in
                (or paste your exported data into it, matching the column headers), then upload it below.
                Columns marked <strong>*</strong> in the template are required.
            </p>
            <button onclick="downloadImportTemplate()" class="btn btn-ghost">⬇ Download Template</button>
        </div>

        <div class="card" style="margin-bottom:16px;">
            <h3 style="margin-bottom:10px;">Step 2 — Upload &amp; import</h3>
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <input type="file" id="importFileInput" accept=".xlsx,.xlsm">
                <button onclick="runImport()" class="btn btn-primary">📤 Import</button>
            </div>
            <p id="importFileHint" style="color:#94a3b8;font-size:12px;margin-top:8px;">
                Have data in another database (MySQL, Access, another School ERP, etc.)? Export that
                data to Excel/CSV first — every database tool supports this — then import the file here.
            </p>
        </div>

        <div id="importResultArea"></div>
    `;
    document.getElementById('page-content').innerHTML = html;
};

window.switchImportEntity = function (entity) {
    _importActiveEntity = entity;
    _importEntities.forEach(e => {
        const btn = document.getElementById(`importTab_${e.key}`);
        if (btn) btn.className = `btn ${e.key === entity ? 'btn-primary' : 'btn-ghost'}`;
    });
    const meta = _importEntities.find(e => e.key === entity);
    document.getElementById('importEntityLabel').textContent = meta ? meta.label : entity;
    document.getElementById('importResultArea').innerHTML = '';

    const hint = document.getElementById('importFileHint');
    if (entity === 'fees') {
        hint.innerHTML = 'Fees must reference an existing student via <code>student_admission_no</code> (or <code>student_id</code> if re-importing from this same system) — import Students first if you haven\'t already.';
    } else {
        hint.innerHTML = 'Have data in another database (MySQL, Access, another School ERP, etc.)? Export that data to Excel/CSV first — every database tool supports this — then import the file here.';
    }
};

window.downloadImportTemplate = function () {
    window.open(`${API_BASE}/import/template/${_importActiveEntity}`, '_blank');
};

window.runImport = async function () {
    const fileInput = document.getElementById('importFileInput');
    const file = fileInput.files[0];
    if (!file) {
        showAlert('Please choose a file to import', 'error');
        return;
    }

    const resultArea = document.getElementById('importResultArea');
    resultArea.innerHTML = '<div class="loading">Importing…</div>';

    const formData = new FormData();
    formData.append('import_file', file);

    try {
        const response = await fetch(`${API_BASE}/import/${_importActiveEntity}`, {
            method: 'POST',
            credentials: 'include',
            body: formData,
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            resultArea.innerHTML = `<div class="card" style="border-color:var(--red);"><p style="color:var(--red);">${escapeHtml(result.error || result.message || 'Import failed')}</p></div>`;
            return;
        }

        showAlert(result.message);
        fileInput.value = '';

        const failedRows = (result.errors || []).filter(e => !e.reason.startsWith('Skipped'));
        const skippedRows = (result.errors || []).filter(e => e.reason.startsWith('Skipped'));

        resultArea.innerHTML = `
            <div class="card">
                <h3 style="margin-bottom:10px;">Import Result</h3>
                <div class="kpi-grid">
                    <div class="kpi-card"><div class="kpi-label">Total Rows</div><div class="kpi-value">${result.total_rows}</div></div>
                    <div class="kpi-card"><div class="kpi-label">Imported</div><div class="kpi-value" style="color:var(--green)">${result.imported}</div></div>
                    <div class="kpi-card"><div class="kpi-label">Skipped (duplicates)</div><div class="kpi-value" style="color:#f59e0b">${result.skipped}</div></div>
                    <div class="kpi-card"><div class="kpi-label">Failed</div><div class="kpi-value" style="color:var(--red)">${failedRows.length}</div></div>
                </div>
                ${(result.errors || []).length > 0 ? `
                    <div class="table-wrap" style="margin-top:14px;">
                        <table class="data-table">
                            <thead><tr><th>Row #</th><th>Reason</th></tr></thead>
                            <tbody>
                                ${skippedRows.map(e => `<tr><td>${e.row}</td><td style="color:#f59e0b;">${escapeHtml(e.reason)}</td></tr>`).join('')}
                                ${failedRows.map(e => `<tr><td>${e.row}</td><td style="color:var(--red);">${escapeHtml(e.reason)}</td></tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                    <p style="color:#94a3b8;font-size:12px;margin-top:8px;">Row # refers to the row in your uploaded Excel file (row 1 is the header). Fix these rows and re-upload — already-imported rows will be skipped automatically.</p>
                ` : '<p style="color:var(--green);margin-top:10px;">All rows imported cleanly.</p>'}
            </div>
        `;
    } catch (e) {
        resultArea.innerHTML = `<div class="card" style="border-color:var(--red);"><p style="color:var(--red);">Import failed: ${escapeHtml(e.message || '')}</p></div>`;
    }
};
