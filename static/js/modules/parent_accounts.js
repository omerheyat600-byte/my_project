// ============================================
// PARENT_ACCOUNTS.JS — Admin page for managing
// Parent Portal login accounts (create/link to a
// student, reset password, activate/deactivate).
// Talks to /api/admin/parent-accounts (NOT
// /api/parent/... which is the parent-facing API).
// ============================================

async function loadParentAccounts() {
    if (currentUser?.role !== 'admin') {
        showAlert('Admin access required', 'error');
        return;
    }

    try {
        const data = await fetchAPI('/admin/parent-accounts');
        const accounts = data.parent_accounts || [];
        const html = `
            <div class="page-header">
                <div class="page-title">Parent Accounts</div>
                <div class="page-sub">Create and manage Parent Portal logins, each linked to one student.</div>
                <button onclick="showParentAccountModal()" class="btn btn-primary" style="float:right; margin-top:-50px;">+ Add Parent Account</button>
            </div>
            <div class="card">
                <div class="table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th>Parent Name</th>
                                <th>Student</th>
                                <th>Status</th>
                                <th>Last Login</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${accounts.map(a => `
                                <tr>
                                    <td style="font-weight:500">${escapeHtml(a.username)}</td>
                                    <td>${escapeHtml(a.full_name || '-')}</td>
                                    <td>${escapeHtml(a.student_name || a.student_id)} <span style="color:var(--muted); font-size:12px;">(${escapeHtml(a.student_id)})</span></td>
                                    <td>${a.is_active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Disabled</span>'}</td>
                                    <td style="font-size:12px;color:#94a3b8;">${a.last_login ? new Date(a.last_login).toLocaleDateString() : 'Never'}</td>
                                    <td class="actions">
                                        <button onclick="resetParentPassword(${a.id})" class="btn btn-ghost btn-sm">🔑</button>
                                        <button onclick="toggleParentAccountStatus(${a.id}, ${a.is_active ? 0 : 1})" class="btn btn-ghost btn-sm">
                                            ${a.is_active ? '🔒' : '🔓'}
                                        </button>
                                        <button onclick="deleteParentAccount(${a.id})" class="btn btn-danger btn-sm">🗑</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    ${accounts.length === 0 ? '<div class="loading">No parent accounts yet.</div>' : ''}
                </div>
            </div>

            <!-- Parent Account Modal -->
            <div id="parentAccountModal" class="modal-overlay">
                <div class="modal" style="max-width:500px;">
                    <div class="modal-header">
                        <h2>Add Parent Account</h2>
                        <span class="close-btn" onclick="closeParentAccountModal()">&times;</span>
                    </div>
                    <div class="modal-body">
                        <form id="parentAccountForm" onsubmit="event.preventDefault(); saveParentAccount();">
                            <div class="form-grid">
                                <div class="form-group full">
                                    <label for="paStudent">Student *</label>
                                    <select id="paStudent" required>
                                        <option value="">Loading students...</option>
                                    </select>
                                </div>
                                <div class="form-group full">
                                    <label for="paUsername">Username *</label>
                                    <input type="text" id="paUsername" required>
                                </div>
                                <div class="form-group full">
                                    <label for="paFullName">Parent Full Name</label>
                                    <input type="text" id="paFullName">
                                </div>
                                <div class="form-group full">
                                    <label for="paPhone">Phone</label>
                                    <input type="text" id="paPhone">
                                </div>
                                <div class="form-group full">
                                    <label for="paPassword">Password</label>
                                    <input type="text" id="paPassword" placeholder="Leave blank to auto-generate">
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-ghost" onclick="closeParentAccountModal()">Cancel</button>
                                <button type="submit" class="btn btn-primary">Create Account</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('page-content').innerHTML = html;
    } catch (error) {
        console.error(error);
        document.getElementById('page-content').innerHTML = '<div class="loading">Failed to load parent accounts.</div>';
    }
}

// ==================== MODAL ====================

window.showParentAccountModal = async function() {
    const modal = document.getElementById('parentAccountModal');
    if (!modal) return;
    document.getElementById('parentAccountForm').reset();

    const select = document.getElementById('paStudent');
    select.innerHTML = '<option value="">Loading students...</option>';
    try {
        const data = await fetchAPI('/students/list');
        const students = data.students || [];
        select.innerHTML = '<option value="">Select student</option>' +
            students.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)} (${escapeHtml(s.id)})</option>`).join('');
    } catch (e) {
        select.innerHTML = '<option value="">Failed to load students</option>';
    }

    modal.classList.add('active');
};

window.closeParentAccountModal = function() {
    const modal = document.getElementById('parentAccountModal');
    if (modal) modal.classList.remove('active');
};

window.saveParentAccount = async function() {
    const data = {
        student_id: document.getElementById('paStudent').value,
        username: document.getElementById('paUsername').value,
        full_name: document.getElementById('paFullName').value,
        phone: document.getElementById('paPhone').value,
        password: document.getElementById('paPassword').value,
    };

    if (!data.student_id || !data.username) {
        showAlert('Please select a student and enter a username', 'error');
        return;
    }

    try {
        const result = await fetchAPI('/admin/parent-accounts', { method: 'POST', body: JSON.stringify(data) });
        closeParentAccountModal();
        await loadParentAccounts();
        showAlert(`Account created. Temporary password: ${result.temporary_password}`);
    } catch (error) {
        showAlert(error.message, 'error');
    }
};

// ==================== ROW ACTIONS ====================

window.resetParentPassword = async function(id) {
    if (!confirm('Generate a new password for this parent account?')) return;
    try {
        const result = await fetchAPI(`/admin/parent-accounts/${id}/reset-password`, { method: 'POST' });
        showAlert(`New temporary password: ${result.temporary_password}`);
    } catch (error) {
        showAlert('Failed to reset password', 'error');
    }
};

window.toggleParentAccountStatus = async function(id, isActive) {
    try {
        const endpoint = isActive ? 'activate' : 'deactivate';
        await fetchAPI(`/admin/parent-accounts/${id}/${endpoint}`, { method: 'POST' });
        showAlert(`Account ${isActive ? 'activated' : 'deactivated'} successfully`);
        await loadParentAccounts();
    } catch (error) {
        showAlert('Failed to update account status', 'error');
    }
};

window.deleteParentAccount = async function(id) {
    if (!confirm('Are you sure you want to delete this parent account?')) return;
    try {
        await fetchAPI(`/admin/parent-accounts/${id}`, { method: 'DELETE' });
        showAlert('Parent account deleted successfully');
        await loadParentAccounts();
    } catch (error) {
        showAlert('Failed to delete parent account', 'error');
    }
};
