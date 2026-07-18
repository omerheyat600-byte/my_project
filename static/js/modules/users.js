// ============================================
// USERS.JS — User management page (admin CRUD
// for system user accounts).
// ============================================


// Load User Management Page
async function loadUsers() {
    if (currentUser?.role !== 'admin') {
        showAlert('Admin access required', 'error');
        return;
    }
    
    try {
        const data = await fetchAPI('/users');
        const html = `
            <div class="page-header">
                <div class="page-title">User Management</div>
                <div class="page-sub">Manage system users and permissions.</div>
                <button onclick="showUserModal()" class="btn btn-primary" style="float:right; margin-top:-50px;">+ Add User</button>
            </div>
            <div class="card">
                <div class="table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th>Full Name</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Last Login</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(data.users || []).map(u => `
                                <tr>
                                    <td style="font-weight:500">${escapeHtml(u.username)}</td>
                                    <td>${escapeHtml(u.full_name)}</td>
                                    <td>${escapeHtml(u.email || '-')}</td>
                                    <td><span class="badge badge-purple">${escapeHtml(u.role)}</span></td>
                                    <td>${u.is_active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Disabled</span>'}</td>
                                    <td style="font-size:12px;color:#94a3b8;">${u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}</td>
                                    <td class="actions">
                                        <button onclick="editUser(${u.id})" class="btn btn-ghost btn-sm">✏</button>
                                        <button onclick="toggleUserStatus(${u.id}, ${u.is_active ? 0 : 1})" class="btn btn-ghost btn-sm">
                                            ${u.is_active ? '🔒' : '🔓'}
                                        </button>
                                        <button onclick="deleteUser(${u.id})" class="btn btn-danger btn-sm">🗑</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <!-- User Modal -->
            <div id="userModal" class="modal-overlay">
                <div class="modal" style="max-width:500px;">
                    <div class="modal-header">
                        <h2 id="userModalTitle">Add User</h2>
                        <span class="close-btn" onclick="closeUserModal()">&times;</span>
                    </div>
                    <div class="modal-body">
                        <form id="userForm" onsubmit="event.preventDefault(); saveUser();">
                            <input type="hidden" id="userId">
                            <div class="form-grid">
                                <div class="form-group full">
                                    <label for="userUsername">Username *</label>
                                    <input type="text" id="userUsername" required>
                                </div>
                                <div class="form-group full">
                                    <label for="userFullName">Full Name *</label>
                                    <input type="text" id="userFullName" required>
                                </div>
                                <div class="form-group full">
                                    <label for="userEmail">Email</label>
                                    <input type="email" id="userEmail">
                                </div>
                                <div class="form-group">
                                    <label for="userPassword">Password *</label>
                                    <input type="password" id="userPassword">
                                </div>
                                <div class="form-group">
                                    <label for="userRole">Role *</label>
                                    <select id="userRole" required>
                                        <option value="viewer">Viewer (Read Only)</option>
                                        <option value="accountant">Accountant (Fees & Expenses)</option>
                                        <option value="teacher">Teacher (Students, Results, Classes)</option>
                                        <option value="admin">Administrator (Full Access)</option>
                                    </select>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-ghost" onclick="closeUserModal()">Cancel</button>
                                <button type="submit" class="btn btn-primary">Save User</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('page-content').innerHTML = html;
    } catch (error) {
        console.error(error);
        document.getElementById('page-content').innerHTML = '<div class="loading">Failed to load users.</div>';
    }
}

// User Modal Functions
window.showUserModal = function(userData = null) {
    const modal = document.getElementById('userModal');
    if (!modal) return;
    
    const isEdit = !!userData;
    document.getElementById('userModalTitle').innerText = isEdit ? 'Edit User' : 'Add User';
    document.getElementById('userForm').reset();
    document.getElementById('userId').value = userData?.id || '';
    
    if (isEdit) {
        document.getElementById('userUsername').value = userData.username;
        document.getElementById('userUsername').disabled = true;
        document.getElementById('userFullName').value = userData.full_name;
        document.getElementById('userEmail').value = userData.email || '';
        document.getElementById('userRole').value = userData.role;
        document.getElementById('userPassword').placeholder = 'Leave blank to keep current';
        document.getElementById('userPassword').required = false;
    } else {
        document.getElementById('userUsername').disabled = false;
        document.getElementById('userPassword').required = true;
        document.getElementById('userPassword').placeholder = 'Enter password';
    }
    
    modal.classList.add('active');
};

window.closeUserModal = function() {
    const modal = document.getElementById('userModal');
    if (modal) modal.classList.remove('active');
};

window.saveUser = async function() {
    const id = document.getElementById('userId').value;
    const data = {
        username: document.getElementById('userUsername').value,
        full_name: document.getElementById('userFullName').value,
        email: document.getElementById('userEmail').value,
        password: document.getElementById('userPassword').value,
        role: document.getElementById('userRole').value
    };
    
    if (!data.username || !data.full_name || !data.role) {
        showAlert('Please fill all required fields', 'error');
        return;
    }
    
    if (!id && !data.password) {
        showAlert('Password is required for new users', 'error');
        return;
    }
    
    try {
        if (id) {
            await fetchAPI(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
            showAlert('User updated successfully');
        } else {
            await fetchAPI('/users', { method: 'POST', body: JSON.stringify(data) });
            showAlert('User added successfully');
        }
        closeUserModal();
        await loadUsers();
    } catch (error) {
        showAlert(error.message, 'error');
    }
};

window.editUser = async function(id) {
    try {
        const data = await fetchAPI('/users');
        const user = (data.users || []).find(u => u.id === id);
        if (user) {
            showUserModal(user);
        }
    } catch (error) {
        showAlert('Failed to load user data', 'error');
    }
};

window.toggleUserStatus = async function(id, isActive) {
    try {
        await fetchAPI(`/users/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ is_active: isActive })
        });
        showAlert(`User ${isActive ? 'activated' : 'disabled'} successfully`);
        await loadUsers();
    } catch (error) {
        showAlert('Failed to update user status', 'error');
    }
};

window.deleteUser = async function(id) {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
        await fetchAPI(`/users/${id}`, { method: 'DELETE' });
        showAlert('User deleted successfully');
        await loadUsers();
    } catch (error) {
        showAlert('Failed to delete user', 'error');
    }
};


