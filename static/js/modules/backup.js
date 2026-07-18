// ============================================
// BACKUP.JS — Backup & Restore page: create a
// full backup, view history, download, restore
// from an existing backup or an uploaded file,
// and delete old backups.
// ============================================

let backupListCache = [];

function backupFormatSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(1)} ${units[i]}`;
}

function backupFormatDate(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString();
}

async function loadBackup() {
    const html = `
        <div class="page-header">
            <div class="page-title">Backup &amp; Restore</div>
            <div class="page-sub">Back up the entire database, uploaded files, and settings into a single ZIP — or restore from a previous one.</div>
        </div>

        <div class="card" style="margin-bottom:16px;">
            <div class="toolbar">
                <button onclick="createBackupNow()" id="createBackupBtn" class="btn btn-primary">🗄️ Create Backup Now</button>
                <button onclick="showRestoreUploadModal()" class="btn btn-ghost">⬆ Restore from Uploaded File</button>
                <button onclick="loadBackup()" class="btn btn-ghost btn-sm">🔄 Refresh</button>
            </div>
            <div id="backupProgress" style="display:none; padding:12px 0; color:var(--muted); font-size:13px;">
                ⏳ <span id="backupProgressText">Working...</span>
            </div>
        </div>

        <div class="section-title">Backup History</div>
        <div class="card">
            <div id="backupHistoryContainer"><div class="loading">Loading backups...</div></div>
        </div>

        <div class="section-title" style="margin-top:24px;">Action Log</div>
        <div class="card">
            <div id="backupActionLogContainer"><div class="loading">Loading...</div></div>
        </div>

        ${renderRestoreUploadModal()}
    `;
    document.getElementById('page-content').innerHTML = html;
    await refreshBackupHistory();
}

async function refreshBackupHistory() {
    const container = document.getElementById('backupHistoryContainer');
    const logContainer = document.getElementById('backupActionLogContainer');
    try {
        const data = await fetchAPI('/backup/history');
        backupListCache = data.backups || [];
        renderBackupHistoryTable(backupListCache);
        renderBackupActionLog(data.action_log || []);
    } catch (e) {
        console.error(e);
        if (container) container.innerHTML = '<div class="loading">Failed to load backup history.</div>';
        if (logContainer) logContainer.innerHTML = '';
    }
}

function renderBackupHistoryTable(backups) {
    const container = document.getElementById('backupHistoryContainer');
    if (!backups.length) {
        container.innerHTML = '<div class="empty-hint">No backups yet. Click "Create Backup Now" to make your first one.</div>';
        return;
    }
    container.innerHTML = `
        <div class="table-wrap">
            <table class="data-table">
                <thead><tr><th>Filename</th><th>Created</th><th>By</th><th>Size</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                    ${backups.map(b => `
                        <tr>
                            <td style="font-family:monospace; font-size:12px;">${escapeHtml(b.filename)}</td>
                            <td>${backupFormatDate(b.created_at)}</td>
                            <td>${escapeHtml(b.created_by || '-')}</td>
                            <td>${backupFormatSize(b.size_bytes)}</td>
                            <td>${b.exists_on_disk
                                ? '<span class="badge badge-green">Available</span>'
                                : '<span class="badge badge-red">Missing on disk</span>'}</td>
                            <td class="actions">
                                ${b.exists_on_disk ? `
                                    <button onclick="downloadBackup('${escapeHtml(b.filename)}')" class="btn btn-ghost btn-sm">⬇ Download</button>
                                    <button onclick="restoreExistingBackup('${escapeHtml(b.filename)}')" class="btn btn-primary btn-sm">Restore</button>
                                    <button onclick="deleteBackup('${escapeHtml(b.filename)}')" class="btn btn-danger btn-sm">🗑</button>
                                ` : ''}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderBackupActionLog(log) {
    const container = document.getElementById('backupActionLogContainer');
    if (!container) return;
    if (!log.length) {
        container.innerHTML = '<div class="empty-hint">No actions logged yet.</div>';
        return;
    }
    container.innerHTML = `
        <div class="table-wrap">
            <table class="data-table">
                <thead><tr><th>Date</th><th>Action</th><th>Filename</th><th>By</th><th>Status</th><th>Details</th></tr></thead>
                <tbody>
                    ${log.map(l => `
                        <tr>
                            <td>${backupFormatDate(l.created_at)}</td>
                            <td>${escapeHtml(l.action)}</td>
                            <td style="font-family:monospace; font-size:12px;">${escapeHtml(l.filename)}</td>
                            <td>${escapeHtml(l.performed_by || '-')}</td>
                            <td>${l.status === 'Success'
                                ? '<span class="badge badge-green">Success</span>'
                                : '<span class="badge badge-red">Failed</span>'}</td>
                            <td style="font-size:12px; color:var(--muted);">${escapeHtml(l.details || '-')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// ==================== CREATE ====================

window.createBackupNow = async function () {
    const btn = document.getElementById('createBackupBtn');
    const progress = document.getElementById('backupProgress');
    const progressText = document.getElementById('backupProgressText');

    btn.disabled = true;
    progress.style.display = 'block';
    progressText.textContent = 'Creating backup — this may take a moment for large databases...';

    try {
        const result = await fetchAPI('/backup/create', { method: 'POST' });
        showAlert(result.message || 'Backup created successfully');
        await refreshBackupHistory();
    } catch (e) {
        console.error(e);
    } finally {
        btn.disabled = false;
        progress.style.display = 'none';
    }
};

// ==================== DOWNLOAD ====================

window.downloadBackup = function (filename) {
    window.open(`${API_BASE}/backup/download/${encodeURIComponent(filename)}`, '_blank');
};

// ==================== DELETE ====================

window.deleteBackup = async function (filename) {
    if (!confirm(`Delete backup "${filename}"? This cannot be undone.`)) return;
    try {
        await fetchAPI(`/backup/${encodeURIComponent(filename)}`, { method: 'DELETE' });
        showAlert('Backup deleted');
        await refreshBackupHistory();
    } catch (e) {
        console.error(e);
    }
};

// ==================== RESTORE FROM EXISTING BACKUP ====================

window.restoreExistingBackup = async function (filename) {
    const confirmed = confirm(
        `⚠️ RESTORE FROM BACKUP\n\n` +
        `This will REPLACE your current database and uploaded files with the contents of:\n${filename}\n\n` +
        `A safety backup of your CURRENT data will be taken automatically first, so this can be undone ` +
        `by restoring that safety backup afterward if needed.\n\n` +
        `The application will restart automatically once restore completes.\n\n` +
        `Are you sure you want to continue?`
    );
    if (!confirmed) return;

    await performRestore({ filename, confirm: true });
};

// ==================== RESTORE FROM UPLOADED FILE ====================

function renderRestoreUploadModal() {
    return `
        <div id="restoreUploadModal" class="modal-overlay">
            <div class="modal">
                <div class="modal-header"><h2>Restore from Uploaded Backup</h2><span class="close-btn" onclick="closeRestoreUploadModal()">&times;</span></div>
                <div class="modal-body">
                    <p style="color:var(--muted); font-size:13px; margin-bottom:14px;">
                        Select a backup ZIP file from your computer. It will be validated before anything is changed,
                        and a safety backup of your current data will be taken automatically first.
                    </p>
                    <input type="file" id="restoreFileInput" accept=".zip">
                    <div class="modal-footer">
                        <button type="button" class="btn btn-ghost" onclick="closeRestoreUploadModal()">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="confirmRestoreUpload()">Validate &amp; Restore</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

window.showRestoreUploadModal = function () {
    document.getElementById('restoreFileInput').value = '';
    document.getElementById('restoreUploadModal').classList.add('active');
};
window.closeRestoreUploadModal = function () {
    document.getElementById('restoreUploadModal').classList.remove('active');
};

window.confirmRestoreUpload = async function () {
    const fileInput = document.getElementById('restoreFileInput');
    const file = fileInput.files?.[0];
    if (!file) {
        showAlert('Please select a backup ZIP file', 'error');
        return;
    }
    if (!file.name.endsWith('.zip')) {
        showAlert('Please select a .zip backup file', 'error');
        return;
    }

    const confirmed = confirm(
        `⚠️ RESTORE FROM UPLOADED FILE\n\n` +
        `This will REPLACE your current database and uploaded files with the contents of:\n${file.name}\n\n` +
        `A safety backup of your CURRENT data will be taken automatically first.\n\n` +
        `The application will restart automatically once restore completes.\n\n` +
        `Are you sure you want to continue?`
    );
    if (!confirmed) return;

    closeRestoreUploadModal();
    await performRestore({ file });
};

// ==================== SHARED RESTORE EXECUTION ====================

async function performRestore({ filename, file, confirm: confirmFlag = true }) {
    const progress = document.getElementById('backupProgress');
    const progressText = document.getElementById('backupProgressText');
    progress.style.display = 'block';
    progressText.textContent = 'Restoring — validating backup, then replacing data. Do not close this window...';

    try {
        let response;
        if (file) {
            const formData = new FormData();
            formData.append('backup_file', file);
            formData.append('confirm', 'true');
            response = await fetch(`${API_BASE}/backup/restore`, {
                method: 'POST',
                credentials: 'include',
                body: formData,
            });
        } else {
            response = await fetch(`${API_BASE}/backup/restore`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename, confirm: confirmFlag }),
            });
        }

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || data.message || 'Restore failed');
        }

        progressText.textContent = 'Restore complete! Reloading application...';
        showAlert(data.message || 'Restore completed successfully');

        // The backend attempts a best-effort process restart; either way,
        // reload the page after a few seconds so the browser picks up the
        // restored data once the server is back.
        setTimeout(() => window.location.reload(), 4000);

    } catch (e) {
        progress.style.display = 'none';
        showAlert(e.message || 'Restore failed', 'error');
        console.error(e);
        await refreshBackupHistory();
    }
}
