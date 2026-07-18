// ============================================
// API CONFIGURATION
// ============================================
const API_BASE = 'http://127.0.0.1:5004/api';

// Add this at the top of your app.js after API_BASE
let SCHOOL_NAME = 'Qamar Public High School';

// Function to load school settings

// ============================================
// USER MANAGEMENT MODULE
// ============================================

let currentUser = null;

// Update the checkAuth function
async function checkAuth() {
    try {
        const response = await fetch(`${API_BASE}/check-auth`, { credentials: 'include' });
        if (response.ok) {	
            const data = await response.json();
            currentUser = data;
            return data.authenticated || false;
        }
        return false;
    } catch {
        return false;
    }
}

// Update login function
async function login() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    errorDiv.style.display = 'none';

    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            document.getElementById('loginOverlay').style.display = 'none';
            
            showUserInfo(currentUser);
            updateMenuByRole(currentUser.role);
            await loadSchoolSettings();
            loadPage('dashboard');
        } else {
            const data = await response.json();
            errorDiv.textContent = data.error || 'Login failed';
            errorDiv.style.display = 'block';
        }
    } catch (e) {
        errorDiv.textContent = 'Network error. Try again.';
        errorDiv.style.display = 'block';
    }
}

// Show user info
function showUserInfo(user) {
    const userInfo = document.getElementById('userInfo');
    if (userInfo) {
        userInfo.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="color: #94a3b8;">👤</span>
                <span style="color: #e2e8f0; font-weight: 500;">${escapeHtml(user.full_name || user.username)}</span>
                <span class="badge badge-purple" style="font-size: 10px; padding: 2px 8px;">${escapeHtml(user.role)}</span>
                <button onclick="logout()" class="btn btn-ghost btn-sm" style="padding: 2px 10px; color: #f87171;">Logout</button>
            </div>
        `;
        userInfo.style.display = 'block';
    }
}
// Add this function to your main JavaScript file (where login is handled)
function updateSidebarUser(userData) {
    const sidebarUsername = document.getElementById('sidebar-username');
    const sidebarFullName = document.getElementById('sidebar-fullname');
    
    if (sidebarUsername) {
        sidebarUsername.textContent = userData.username || 'User';
        sidebarUsername.style.display = 'block';
    }
    if (sidebarFullName) {
        sidebarFullName.textContent = userData.full_name || '';
        sidebarFullName.style.display = 'block';
    }
}

// Update your login success handler
function handleLoginSuccess(response) {
    if (response.user) {
        // Store user data
        localStorage.setItem('user', JSON.stringify(response.user));
        
        // Update sidebar
        updateSidebarUser(response.user);
        
        // Navigate to dashboard
        window.location.href = '/dashboard';
    }
}

// Add this to your page load function
function checkAuthStatus() {
    fetch('/api/check-auth', {
        credentials: 'include'
    })
    .then(response => response.json())
    .then(data => {
        if (data.authenticated && data.username) {
            updateSidebarUser({
                username: data.username,
                full_name: data.full_name
            });
            // Show logged-in state
        } else {
            // Show login form, hide sidebar username
            document.getElementById('sidebar-username').style.display = 'none';
            document.getElementById('sidebar-fullname').style.display = 'none';
        }
    });
}

// Call this on page load
document.addEventListener('DOMContentLoaded', checkAuthStatus);
// Update menu based on role
function updateMenuByRole(role) {
    const adminItems = document.querySelectorAll('.nav-item.admin-only');
    const teacherItems = document.querySelectorAll('.nav-item.teacher-only');
    const accountantItems = document.querySelectorAll('.nav-item.accountant-only');
    
    const roleLevels = {
        'admin': 100,
        'teacher': 50,
        'accountant': 30,
        'viewer': 10
    };
    
    const userLevel = roleLevels[role] || 0;
    
    // Show/hide menu items
    adminItems.forEach(item => {
        item.style.display = userLevel >= 100 ? 'flex' : 'none';
    });
    
    teacherItems.forEach(item => {
        item.style.display = userLevel >= 50 ? 'flex' : 'none';
    });
    
    accountantItems.forEach(item => {
        item.style.display = userLevel >= 30 ? 'flex' : 'none';
    });
}

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

// ==================== LOGOUT ====================
async function logout() {
    try {
        await fetch(`${API_BASE}/logout`, { method: 'POST', credentials: 'include' });
    } catch (e) {
        console.error('Logout error:', e);
    }
    // Clear session data
    currentUser = null;
    document.getElementById('loginOverlay').style.display = 'flex';
    document.getElementById('page-content').innerHTML = '';
    // Also clear any user info display
    const userInfo = document.getElementById('userInfo');
    if (userInfo) userInfo.innerHTML = '';
}
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
        </style>
        </head>
        <body>
            <h2>${escapeHtml(title)}</h2>
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
            .card-slate-grid .school-brand h2 { font-size: 20px; font-weight: 800; margin: 0; color: #f8fafc; }
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
                                    <h2>QAMAR PUBLIC</h2>
                                    <div style="font-size: 11px; color: #38bdf8; font-weight: 600;">HIGH SCHOOL</div>
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

// ==================== NAVIGATION ====================
let currentPage = 'dashboard';
let charts = {};

document.addEventListener('DOMContentLoaded', async () => {
    const isAuth = await checkAuth();
    const overlay = document.getElementById('loginOverlay');
    if (!isAuth) {
        overlay.style.display = 'flex';
        return;
    }
    overlay.style.display = 'none';
	
	await loadSchoolSettings();


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
        case 'users': await loadUsers(); break;
        case 'settings': await loadSettings(); break;
        default: contentDiv.innerHTML = '<div class="loading">Page not found</div>';
    }
    // 👇 ADD THIS LINE
    toggleThemeSelector(page);
}
// ============================================
// SUBJECT DROPDOWN (for Result Modal)
// ============================================
window.loadSubjectDropdown = async function(studentId, selectedSubject = null) {
    const subjectSelect = document.getElementById('resultSubject');
    if (!subjectSelect) return;

    if (!studentId) {
        subjectSelect.innerHTML = '<option value="">Select student first</option>';
        return;
    }

    subjectSelect.innerHTML = '<option value="">Loading subjects...</option>';
    subjectSelect.disabled = true;

    try {
        const subjects = await getSubjectsForStudent(studentId);
        subjectSelect.disabled = false;

        if (!subjects || subjects.length === 0) {
            subjectSelect.innerHTML = `
                <option value="">No subjects available</option>
                <option value="" disabled>━━━━━━━━━━━━━━━━━━━━</option>
                <option value="" disabled>⚠️ No class or subjects found</option>
            `;
            return;
        }

        let html = '<option value="">Select subject</option>';
        subjects.forEach(sub => {
            const name = sub.subject_name || sub.name;
            const selected = (selectedSubject === name) ? 'selected' : '';
            html += `<option value="${escapeHtml(name)}" ${selected}>${escapeHtml(name)}</option>`;
        });
        subjectSelect.innerHTML = html;

    } catch(error) {
        console.error('Subject dropdown error:', error);
        subjectSelect.disabled = false;
        subjectSelect.innerHTML = `
            <option value="">Error loading subjects</option>
            <option value="" disabled>Please try again</option>
        `;
        showAlert('Failed to load subjects', 'error');
    }
};
// ============================================
// PRINT RESULTS LIST
// ============================================
window.printResults = async function() {
    try {
        const data = await fetchAPI('/results');
        const results = data.results || [];
        if (!results.length) {
            showAlert('No results to print', 'error');
            return;
        }
        
        let rows = '';
        results.forEach(r => {
            rows += `<tr>
                <td>${escapeHtml(r.student_name || '-')}</td>
                <td>${escapeHtml(r.subject || '-')}</td>
                <td style="text-align:center">${r.obtained_marks || 0}</td>
                <td style="text-align:center">${r.total_marks || 0}</td>
                <td style="text-align:center">${escapeHtml(r.grade || 'N/A')}</td>
                <td>${escapeHtml(r.term || '-')}</td>
                <td>${r.year || '-'}</td>
            </tr>`;
        });
        
        const content = `
            <h3>Results List</h3>
            <p><strong>Total Records:</strong> ${results.length}</p>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Student</th>
                        <th>Subject</th>
                        <th>Obtained</th>
                        <th>Total</th>
                        <th>Grade</th>
                        <th>Term</th>
                        <th>Year</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
        printPreview(content, 'Results List');
    } catch (error) {
        console.error('Print results error:', error);
        showAlert('Failed to print results', 'error');
    }
};
// ============================================
// RESULT CARD THEME SELECTOR
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('defaultResultCardTheme') || 'modern';
    const selector = document.getElementById('resultCardThemeSelector');
    if (selector) selector.value = savedTheme;
});
window.saveDefaultTheme = function(themeValue) {
    localStorage.setItem('defaultResultCardTheme', themeValue);
    if (typeof showAlert === 'function') {
        showAlert(`Default layout theme switched to ${themeValue.toUpperCase()} successfully!`, 'success');
    }
};
// ============================================
// TOGGLE THEME SELECTOR BASED ON PAGE
// ============================================
// ============================================
// TOGGLE THEME SELECTOR BASED ON PAGE
// ============================================
function toggleThemeSelector(page) {
    const container = document.getElementById('themeSelectorContainer');
    if (!container) return;

    const resultsPages = ['results', 'exam', 'marksheet', 'gazette', 'result-cards'];
    if (resultsPages.includes(page)) {
        container.style.display = 'block';
        // Only render if empty
        if (container.innerHTML.trim() === '') {
            const savedTheme = localStorage.getItem('defaultResultCardTheme') || 'modern';
            container.innerHTML = `
                <div class="card" style="margin-bottom: 20px; padding: 15px; background: #1e293b; border-radius: 8px; border: 1px solid #334155;">
                    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                        <div>
                            <h4 style="margin: 0; color: #f8fafc; font-size: 15px; font-weight: 600;">Result Card Print Design</h4>
                            <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">Choose your preferred printing layout template style for report cards.</p>
                        </div>
                        <div>
                            <select id="resultCardThemeSelector" onchange="saveDefaultTheme(this.value)" style="padding: 8px 12px; border-radius: 6px; border: 1px solid #475569; font-weight: 500; background-color: #0f172a; color: #f8fafc; cursor: pointer; font-size: 13px;">
                                <option value="modern" ${savedTheme === 'modern' ? 'selected' : ''}>Style 1: Modern Corporate (Navy & Slate)</option>
                                <option value="classic" ${savedTheme === 'classic' ? 'selected' : ''}>Style 2: Classic Academic (Traditional Border)</option>
                                <option value="minimalist" ${savedTheme === 'minimalist' ? 'selected' : ''}>Style 3: Minimalist Crisp (Clean Green Accent)</option>
                                <option value="slate-grid" ${savedTheme === 'slate-grid' ? 'selected' : ''}>Style 4: Modern Slate Grid (Asymmetric Profile Layout)</option>
                                <option value="royal-emblem" ${savedTheme === 'royal-emblem' ? 'selected' : ''}>Style 5: Royal Gold Certificate (Prestigious Institutional Theme)</option>
                                <option value="diagonal" ${savedTheme === 'diagonal' ? 'selected' : ''}>Style 6: Diagonal Accent (Poppins, Bold Header)</option>
                            </select>
                        </div>
                    </div>
                </div>
            `;
        }
    } else {
        container.style.display = 'none';
        container.innerHTML = ''; // Clear when hiding
    }
}


// ============================================
// SUBJECT GROUPS CONFIGURATION
// ============================================
const SUBJECT_GROUPS = {
    'Science Group': [
        { name: 'Physics', max_marks: 100 },
        { name: 'Chemistry', max_marks: 100 },
        { name: 'Biology', max_marks: 100 },
        { name: 'Mathematics', max_marks: 100 },
        { name: 'English', max_marks: 100 },
        { name: 'Urdu', max_marks: 100 },
        { name: 'Islamiat', max_marks: 100 },
        { name: 'Computer Science', max_marks: 100 },
        { name: 'Practical Physics', max_marks: 50 },
        { name: 'Practical Chemistry', max_marks: 50 },
        { name: 'Practical Biology', max_marks: 50 }
    ],
    'Arts Group': [
        { name: 'English', max_marks: 100 },
        { name: 'Urdu', max_marks: 100 },
        { name: 'Islamiat', max_marks: 100 },
        { name: 'History', max_marks: 100 },
        { name: 'Geographic', max_marks: 100 },
        { name: 'Pak Study', max_marks: 100 },
        { name: 'Punjabi', max_marks: 100 },
        { name: 'Fine Arts', max_marks: 100 },
        { name: 'Computer Science', max_marks: 100 }
    ],
    'Commerce Group': [
        { name: 'Mathematics', max_marks: 100 },
        { name: 'English', max_marks: 100 },
        { name: 'Urdu', max_marks: 100 },
        { name: 'Islamiat', max_marks: 100 },
        { name: 'Accounting', max_marks: 100 },
        { name: 'Economics', max_marks: 100 },
        { name: 'Business Studies', max_marks: 100 },
        { name: 'Computer Science', max_marks: 100 },
        { name: 'Statistics', max_marks: 100 }
    ],
    'All Subjects': [
        { name: 'Mathematics', max_marks: 100 },
        { name: 'English', max_marks: 100 },
        { name: 'Urdu', max_marks: 100 },
        { name: 'Islamiat', max_marks: 100 },
        { name: 'Science', max_marks: 100 },
        { name: 'Computer Science', max_marks: 100 },
        { name: 'Physics', max_marks: 100 },
        { name: 'Chemistry', max_marks: 100 },
        { name: 'Biology', max_marks: 100 },
        { name: 'History', max_marks: 100 },
        { name: 'Geographic', max_marks: 100 },
        { name: 'Pak Study', max_marks: 100 },
        { name: 'Punjabi', max_marks: 100 },
        { name: 'Accounting', max_marks: 100 },
        { name: 'Economics', max_marks: 100 },
        { name: 'Business Studies', max_marks: 100 },
        { name: 'Fine Arts', max_marks: 100 },
        { name: 'Statistics', max_marks: 100 }
    ]
};

// Individual quick add subjects (shown as chips)
const QUICK_SUBJECTS = [
    { name: 'Mathematics', max: 100 },
    { name: 'English', max: 100 },
    { name: 'Urdu', max: 100 },
    { name: 'Islamiat', max: 100 },
    { name: 'Physics', max: 100 },
    { name: 'Chemistry', max: 100 },
    { name: 'Biology', max: 100 },
    { name: 'Computer Science', max: 100 },
    { name: 'History', max: 100 },
    { name: 'Geographic', max: 100 },
    { name: 'Pak Study', max: 100 },
    { name: 'Accounting', max: 100 },
    { name: 'Economics', max: 100 },
    { name: 'Business Studies', max: 100 },
    { name: 'Practical Physics', max: 50 },
    { name: 'Practical Chemistry', max: 50 },
    { name: 'Practical Biology', max: 50 },
    { name: 'Fine Arts', max: 100 },
    { name: 'Punjabi', max: 100 },
    { name: 'Statistics', max: 100 },
    { name: 'Education', max: 100 },
    { name: 'Psychology', max: 100 },
    { name: 'Sociology', max: 100 },
    { name: 'Civics', max: 100 }
];
// ============================================
// GLOBAL SUBJECT LIST (for dropdown fallback)
// ============================================
window.ALL_SCHOOL_SUBJECTS = [
    "Biology", "Chemistry", "Computer", "Computer Science", "English",
    "Geographic", "History", "Islamiat Elective", "Islamiat", "Math Elective",
    "Mathematics", "Pak Study", "Physics", "Punjabi (B)", "Science", "Urdu"
];

// ============================================
// SUBJECT DROPDOWN (for Result Modal)
// ============================================
async function getSubjectsForStudent(studentId) {
    try {
        console.log('🔍 Getting subjects for student:', studentId);
        
        const student = await fetchAPI(`/students/${studentId}`);
        console.log('📚 Student data:', student);
        
        if (!student || !student.grade) {
            console.warn('❌ Student has no grade');
            return [];
        }
        
        let gradeName = student.grade.trim();
        console.log('📖 Student grade:', gradeName);
        
        const classesData = await fetchAPI('/classes');
        console.log('🏫 All classes:', classesData.classes.map(c => c.class_name));
        
        // Try multiple matching strategies
        let matchedClass = null;
        
        // Strategy 1: startsWith
        matchedClass = classesData.classes.find(c => 
            c.class_name.toLowerCase().startsWith(gradeName.toLowerCase())
        );
        if (matchedClass) {
            console.log('✅ Matched using startsWith:', matchedClass.class_name);
        }
        
        // Strategy 2: includes
        if (!matchedClass) {
            matchedClass = classesData.classes.find(c => 
                c.class_name.toLowerCase().includes(gradeName.toLowerCase())
            );
            if (matchedClass) {
                console.log('✅ Matched using includes:', matchedClass.class_name);
            }
        }
        
        // Strategy 3: extract numbers
        if (!matchedClass) {
            const gradeNum = gradeName.match(/\d+/);
            if (gradeNum) {
                matchedClass = classesData.classes.find(c => {
                    const classNum = c.class_name.match(/\d+/);
                    return classNum && classNum[0] === gradeNum[0];
                });
                if (matchedClass) {
                    console.log('✅ Matched using number extraction:', matchedClass.class_name);
                }
            }
        }
        
        if (!matchedClass) {
            console.error('❌ No class found for grade:', gradeName);
            console.log('💡 Available classes:', classesData.classes.map(c => c.class_name).join(', '));
            showAlert(
                `No class found for grade "${gradeName}". Available classes: ${classesData.classes.map(c => c.class_name).join(', ')}`,
                'error'
            );
            return [];
        }
        
        console.log('✅ Matched class:', matchedClass);
        
        const subjectsData = await fetchAPI(`/classes/${matchedClass.id}/subjects`);
        console.log('📚 Subjects for class:', subjectsData.subjects);
        
        return subjectsData.subjects || [];
        
    } catch (error) {
        console.error('❌ Failed loading subjects:', error);
        showAlert('Error loading subjects. Please try again.', 'error');
        return [];
    }
}
/**
 * Find and fix students whose grade doesn't match any class
 */
async function fixUnmatchedStudentGrades() {
    try {
        // 1. Get all students and classes
        const [studentsData, classesData] = await Promise.all([
            fetchAPI('/students'),
            fetchAPI('/classes')
        ]);

        const students = studentsData.students || [];
        const classes = classesData.classes || [];

        // 2. Build class name lookup with multiple variations
        const classLookup = new Map();
        classes.forEach(cls => {
            const variations = [
                cls.class_name,
                cls.class_name.toLowerCase(),
                cls.class_name.replace(/Grade\s*/i, '').trim(),
                cls.class_name.replace(/Class\s*/i, '').trim(),
                cls.class_name.replace(/[-\s]/g, ''),
                extractNumber(cls.class_name) ? `Grade ${extractNumber(cls.class_name)}` : null
            ].filter(Boolean);

            variations.forEach(v => {
                if (!classLookup.has(v)) {
                    classLookup.set(v, cls.class_name);
                }
            });
        });

        // 3. Check each student
        let fixedCount = 0;
        const fixes = [];

        for (const student of students) {
            const grade = student.grade.trim();
            const variations = [
                grade,
                grade.toLowerCase(),
                grade.replace(/Grade\s*/i, '').trim(),
                grade.replace(/Class\s*/i, '').trim(),
                grade.replace(/[-\s]/g, ''),
                extractNumber(grade) ? `Grade ${extractNumber(grade)}` : null
            ].filter(Boolean);

            // Check if any variation matches a class
            const hasMatch = variations.some(v => classLookup.has(v));

            if (!hasMatch) {
                // Try to find the closest class by number
                const gradeNum = extractNumber(grade);
                let suggestedClass = null;

                if (gradeNum) {
                    // Look for a class with the same number
                    suggestedClass = classes.find(c => 
                        extractNumber(c.class_name) === gradeNum
                    );
                }

                fixes.push({
                    student: student.name,
                    currentGrade: grade,
                    suggestedClass: suggestedClass?.class_name || 'No match found'
                });
                
                fixedCount++;
            }
        }

        // 4. Show results
        if (fixedCount > 0) {
            let message = `Found ${fixedCount} students with mismatched grades:\n\n`;
            fixes.forEach(f => {
                message += `• ${f.student}: "${f.currentGrade}" → suggested: "${f.suggestedClass}"\n`;
            });
            message += '\nWould you like to auto-fix these? (Update student grades to match suggested classes)';
            
            // You can implement the auto-fix logic here
            console.log('Mismatched students:', fixes);
        } else {
            showAlert('All students have matching grades!', 'success');
        }

        return fixes;

    } catch (error) {
        console.error('Error fixing grades:', error);
        showAlert('Failed to check student grades', 'error');
    }
}
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
                    <td style="font-weight:500">${escapeHtml(student.name)}</td>
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
                <div class="page-sub">Manage student records and profiles.</div>
                <button onclick="printStudentsList()" class="btn btn-primary" style="float:right; margin-top:-50px;">🖨 Print List</button>
            </div>
            <div class="card">
                <div class="toolbar">
                    <div class="search-wrap"><input type="text" id="studentSearch" placeholder="Search students..."></div>
                    <select id="gradeFilter" class="filter">
                        <option value="">All Grades</option>
                        ${classes.map(c => `<option value="${c.class_name}">${c.class_name}</option>`).join('')}
                    </select>
                    <button onclick="filterStudents()" class="btn btn-ghost btn-sm">Filter</button>
                    <button onclick="showStudentModal()" class="btn btn-primary">+ Add Student</button>
                </div>
                <div class="table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr><th>ID</th><th>Name</th><th>Grade</th><th>Gender</th><th>Parent</th><th>Phone</th><th>Actions</th></tr>
                        </thead>
                        <tbody id="studentsTableBody">
                            ${students.map(s => `
                                <tr>
                                    <td style="font-family:monospace;color:var(--accent)">${escapeHtml(s.id)}</td>
                                    <td style="font-weight:500">${escapeHtml(s.name)}</td>
                                    <td><span class="badge badge-blue">${escapeHtml(s.grade)}</span></td>
                                    <td>${escapeHtml(s.gender || '-')}</td>
                                    <td>${escapeHtml(s.parent_name || '-')}</td>
                                    <td>${escapeHtml(s.phone || '-')}</td>
                                    <td class="actions">
                                        <button onclick="editStudent('${escapeHtml(s.id)}')" class="btn btn-ghost btn-sm">✏ Edit</button>
                                        <button onclick="printStudentCard('${escapeHtml(s.id)}')" class="btn btn-ghost btn-sm">🖨 Print</button>
                                        <button onclick="deleteStudent('${escapeHtml(s.id)}')" class="btn btn-danger btn-sm">🗑 Delete</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            <!-- Student Modal -->
            <div id="studentModal" class="modal-overlay">
                <div class="modal">
                    <div class="modal-header">
                        <h2 id="studentModalTitle">Add Student</h2>
                        <span class="close-btn" onclick="closeStudentModal()">&times;</span>
                    </div>
                    <div class="modal-body">
                        <form id="studentForm" onsubmit="event.preventDefault(); saveStudent();">
                            <input type="hidden" id="studentId">
                            <div class="form-grid">
                                <div class="form-group full">
                                    <label for="studentName">Full Name *</label>
                                    <input type="text" id="studentName" required>
                                </div>
                                <div class="form-group full">
                                    <label for="studentGrade">Grade *</label>
                                    <select id="studentGrade" required>
                                        <option value="">Select Class</option>
                                        ${gradeOptions}
                                    </select>
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
		        // Load teachers list for dropdown
        const teachersData = await fetchAPI('/teachers/list');
        window.teachersList = teachersData.teachers || [];

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
                            <th>Max Subjects</th><th>Subjects</th><th>Actions</th>
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
            <td>${c.max_subjects || '-'}</td>
            <td><button class="btn btn-ghost btn-sm" onclick="manageSubjects(${c.id}, '${escapeHtml(c.class_name)}')">📚 Manage</button></td>
            <td>
                <button onclick="editClass(${c.id})" class="btn btn-ghost btn-sm">✏</button>
                <button onclick="deleteClass(${c.id})" class="btn btn-danger btn-sm">🗑</button>
            </td>
        </tr>
    `).join('');
    }
};
// ==================== STUDENT MODAL FUNCTIONS ====================

window.showStudentModal = function() {
    const modal = document.getElementById('studentModal');
    if (modal) {
        document.getElementById('studentModalTitle').innerText = 'Add Student';
        document.getElementById('studentForm').reset();
        document.getElementById('studentId').value = '';
        modal.classList.add('active');
    }
};

window.closeStudentModal = function() {
    const modal = document.getElementById('studentModal');
    if (modal) modal.classList.remove('active');
};

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
        join_date: document.getElementById('studentJoinDate').value
    };
    if (!data.name || !data.grade) {
        showAlert('Please fill in all required fields', 'error');
        return;
    }
    try {
        if (id) {
            await fetchAPI(`/students/${id}`, { method: 'PUT', body: JSON.stringify(data) });
            showAlert('Student updated successfully');
        } else {
            await fetchAPI('/students', { method: 'POST', body: JSON.stringify(data) });
            showAlert('Student added successfully');
        }
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
        document.getElementById('studentModal').classList.add('active');
    } catch (e) {
        showAlert('Failed to load student data', 'error');
    }
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
        tbody.innerHTML = (data.students || []).map(s => `
            <tr>
                <td style="font-family:monospace;color:var(--accent)">${escapeHtml(s.id)}</td>
                <td style="font-weight:500">${escapeHtml(s.name)}</td>
                <td><span class="badge badge-blue">${escapeHtml(s.grade)}</span></td>
                <td>${escapeHtml(s.gender || '-')}</td>
                <td>${escapeHtml(s.parent_name || '-')}</td>
                <td>${escapeHtml(s.phone || '-')}</td>
                <td class="actions">
                    <button onclick="editStudent('${escapeHtml(s.id)}')" class="btn btn-ghost btn-sm">✏ Edit</button>
                    <button onclick="printStudentCard('${escapeHtml(s.id)}')" class="btn btn-ghost btn-sm">🖨 Print</button>
                    <button onclick="deleteStudent('${escapeHtml(s.id)}')" class="btn btn-danger btn-sm">🗑 Delete</button>
                </td>
            </tr>
        `).join('');
    }
};

window.printStudentsList = async function() {
    const data = await fetchAPI('/students');
    let rows = '';
    (data.students || []).forEach(s => {
        rows += `<tr><td>${escapeHtml(s.id)}</td><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.grade)}</td><td>${escapeHtml(s.gender || '-')}</td><td>${escapeHtml(s.parent_name || '-')}</td><td>${escapeHtml(s.phone || '-')}</td></tr>`;
    });
    printPreview(`<h3>Students List - Total: ${(data.students || []).length}</h3><table class="data-table"><thead><tr><th>ID</th><th>Name</th><th>Grade</th><th>Gender</th><th>Parent</th><th>Phone</th></tr></thead><tbody>${rows}</tbody></table>`, 'Students Report');
};

window.printStudentCard = async function(id) {
    const s = await fetchAPI(`/students/${id}`);
    const printContent = `<div style="max-width:600px;margin:0 auto;"><h3 style="color:#3b82f6;">Student ID Card</h3><div style="border:2px solid #3b82f6;padding:20px;border-radius:10px;"><div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;"><div><strong>ID:</strong></div><div>${escapeHtml(s.id)}</div><div><strong>Name:</strong></div><div>${escapeHtml(s.name)}</div><div><strong>Grade:</strong></div><div>${escapeHtml(s.grade)}</div><div><strong>Gender:</strong></div><div>${escapeHtml(s.gender || '-')}</div><div><strong>DOB:</strong></div><div>${escapeHtml(s.dob || '-')}</div><div><strong>Phone:</strong></div><div>${escapeHtml(s.phone || '-')}</div><div><strong>Email:</strong></div><div>${escapeHtml(s.email || '-')}</div><div><strong>Address:</strong></div><div>${escapeHtml(s.address || '-')}</div><div><strong>Parent:</strong></div><div>${escapeHtml(s.parent_name || '-')}</div><div><strong>Parent Phone:</strong></div><div>${escapeHtml(s.parent_phone || '-')}</div><div><strong>Join Date:</strong></div><div>${escapeHtml(s.join_date || '-')}</div></div></div></div>`;
    printPreview(printContent, `Student ID Card - ${s.name}`);
};
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
                            <div class="form-group full">
                                <label for="classTeacher">Class Teacher</label>
                                <select id="classTeacher" style="width:100%; padding:10px; border-radius:6px; border:1px solid #475569; background:#0f172a; color:#f8fafc;">
                                    <option value="">-- Select Teacher --</option>
                                    ${(window.teachersList || []).map(t => 
                                        `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)} (${escapeHtml(t.subject)})</option>`
                                    ).join('')}
                                </select>
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
            <div class="modal" style="max-width: 700px; background: #0f172a;">
                <div class="modal-header" style="background: #1e293b; border-bottom: 1px solid #334155;">
                    <h2 id="subjectModalTitle" style="color: #f1f5f9;">Manage Subjects</h2>
                    <span class="close-btn" onclick="closeSubjectModal()" style="color: #94a3b8; cursor: pointer; font-size: 28px;">&times;</span>
                </div>
                <div class="modal-body" style="background: #0f172a; padding: 20px;">
                    <!-- Current Subjects List -->
                    <div id="subjectList"></div>
                    
                    <!-- Quick Add Section -->
                    <div style="margin: 20px 0; padding: 15px; background: #1e293b; border-radius: 8px; border: 1px solid #334155;">
                        <label style="font-weight: 600; display: block; margin-bottom: 10px; color: #e2e8f0;">⚡ Quick Add Subjects</label>
                        <div id="quickSubjectChips" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;"></div>
                        
                        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px;">
                            <button onclick="addSubjectGroup('Science Group')" class="btn btn-ghost btn-sm" style="background: #0c4a6e; color: #7dd3fc; border: 1px solid #0ea5e9; padding: 6px 14px; border-radius: 6px; cursor: pointer;">
                                🔬 Science Group
                            </button>
                            <button onclick="addSubjectGroup('Arts Group')" class="btn btn-ghost btn-sm" style="background: #4c1d3b; color: #f9a8d4; border: 1px solid #ec4899; padding: 6px 14px; border-radius: 6px; cursor: pointer;">
                                🎨 Arts Group
                            </button>
                            <button onclick="addSubjectGroup('Commerce Group')" class="btn btn-ghost btn-sm" style="background: #064e3b; color: #6ee7b7; border: 1px solid #10b981; padding: 6px 14px; border-radius: 6px; cursor: pointer;">
                                💼 Commerce Group
                            </button>
                            <button onclick="addSubjectGroup('All Subjects')" class="btn btn-ghost btn-sm" style="background: #713f12; color: #fcd34d; border: 1px solid #f59e0b; padding: 6px 14px; border-radius: 6px; cursor: pointer;">
                                📚 All Subjects
                            </button>
                        </div>
                    </div>
                    
                    <!-- Custom Add Section -->
                    <div style="margin: 15px 0; padding: 15px; border: 1px dashed #475569; border-radius: 8px; background: #1e293b;">
                        <label style="font-weight: 600; display: block; margin-bottom: 10px; color: #e2e8f0;">✏️ Add Custom Subject</label>
                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                            <input type="text" id="newSubjectName" placeholder="Subject name" style="flex: 2; min-width: 150px; padding: 8px 12px; background: #0f172a; border: 1px solid #475569; border-radius: 4px; color: #f1f5f9;">
                            <input type="number" id="newSubjectMaxMarks" placeholder="Max Marks" value="100" style="width: 120px; padding: 8px 12px; background: #0f172a; border: 1px solid #475569; border-radius: 4px; color: #f1f5f9;">
                            <select id="newSubjectCategory" style="width: 140px; padding: 8px 12px; background: #0f172a; border: 1px solid #475569; border-radius: 4px; color: #e2e8f0;">
                                <option value="">Category</option>
                                <option value="Science">Science</option>
                                <option value="Mathematics">Mathematics</option>
                                <option value="Languages">Languages</option>
                                <option value="Humanities">Humanities</option>
                                <option value="Practical">Practical</option>
                                <option value="Other">Other</option>
                            </select>
                            <button onclick="addSubject()" class="btn btn-primary" style="padding: 8px 16px; background: #2563eb; color: #fff; border: none; border-radius: 4px; cursor: pointer;">➕ Add</button>
                        </div>
                    </div>
                    
                    <!-- Bulk Add Section -->
                    <div style="margin: 15px 0; padding: 15px; border: 1px dashed #475569; border-radius: 8px; background: #1e293b;">
                        <label style="font-weight: 600; display: block; margin-bottom: 10px; color: #e2e8f0;">📋 Bulk Add Subjects</label>
                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                            <textarea id="bulkSubjectsInput" placeholder="Enter subjects (one per line)&#10;Example:&#10;Physics 100&#10;Chemistry 100&#10;Biology 100" style="flex: 3; min-width: 200px; height: 80px; padding: 8px; background: #0f172a; border: 1px solid #475569; border-radius: 4px; color: #e2e8f0;"></textarea>
                            <button onclick="bulkAddSubjects()" class="btn btn-success" style="align-self: flex-end; padding: 8px 16px; background: #16a34a; color: #fff; border: none; border-radius: 4px; cursor: pointer;">📥 Import Bulk</button>
                        </div>
                    </div>
                </div>
                <div class="modal-footer" style="background: #1e293b; border-top: 1px solid #334155; padding: 12px 20px;">
                    <button class="btn btn-ghost" onclick="closeSubjectModal()" style="padding: 8px 16px; color: #94a3b8; background: transparent; border: 1px solid #475569; border-radius: 4px; cursor: pointer;">Close</button>
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
/**
 * Remove a subject from the current class
 */
window.removeSubject = async function(subjectName) {
    if (!currentClassId) {
        showAlert('No class selected', 'error');
        return;
    }
    
    if (!subjectName) {
        showAlert('Subject name is required', 'error');
        return;
    }
    
    // Confirm before removing
    if (!confirm(`Are you sure you want to remove "${subjectName}" from this class?`)) {
        return;
    }
    
    try {
        const encodedSubject = encodeURIComponent(subjectName);
        await fetchAPI(`/classes/${currentClassId}/subjects/${encodedSubject}`, {
            method: 'DELETE'
        });
        
        showAlert(`✅ Removed "${subjectName}" successfully`, 'success');
        await refreshSubjectList();
        
    } catch (error) {
        console.error('Remove subject error:', error);
        showAlert(`❌ Failed to remove "${subjectName}": ${error.message}`, 'error');
    }
};

/**
 * Update max marks for a subject
 */
window.updateSubjectMax = async function(subjectName) {
    if (!currentClassId) {
        showAlert('No class selected', 'error');
        return;
    }
    
    const inputId = `editMax_${subjectName}`;
    const input = document.getElementById(inputId);
    
    if (!input) {
        showAlert('Could not find input field', 'error');
        return;
    }
    
    const newMax = parseFloat(input.value);
    
    if (!newMax || newMax <= 0) {
        showAlert('Please enter a valid max marks (greater than 0)', 'error');
        return;
    }
    
    try {
        const encodedSubject = encodeURIComponent(subjectName);
        await fetchAPI(`/classes/${currentClassId}/subjects/${encodedSubject}`, {
            method: 'PUT',
            body: JSON.stringify({ max_marks: newMax })
        });
        
        showAlert(`✅ Updated "${subjectName}" max marks to ${newMax}`, 'success');
        await refreshSubjectList();
        
    } catch (error) {
        console.error('Update subject max error:', error);
        showAlert(`❌ Failed to update "${subjectName}": ${error.message}`, 'error');
    }
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
    const teacherId = document.getElementById('classTeacher').value;
    
    const data = {
        class_name: document.getElementById('className').value,
        grade_level: document.getElementById('classGradeLevel').value,
        section: document.getElementById('classSection').value,
        class_teacher: teacherId,
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
// ============================================
// ENHANCED SUBJECT MANAGEMENT
// ============================================

/**
 * Refresh the subject list and quick add chips
 */
/**
 * Refresh the subject list and quick add chips
 */
async function refreshSubjectList(maxSubjects) {
    if (!currentClassId) return;
    
    try {
        const data = await fetchAPI(`/classes/${currentClassId}/subjects`);
        const subjects = data.subjects || [];
        
        // Update title with count
        const title = document.getElementById('subjectModalTitle');
        if (title) {
            const count = subjects.length;
            title.innerHTML = `Manage Subjects: ${escapeHtml(currentClassName)} (${count}/${maxSubjects || 20})`;
        }
        
        // Render subject list
        const div = document.getElementById('subjectList');
        if (!div) return;
        
        if (subjects.length === 0) {
            div.innerHTML = `
                <div style="text-align: center; padding: 30px; color: #94a3b8;">
                    <div style="font-size: 48px; margin-bottom: 10px;">📚</div>
                    <p style="font-size: 16px; font-weight: 500; color: #64748b;">No subjects added yet</p>
                    <p style="font-size: 13px; color: #94a3b8;">Use the quick add buttons below or add custom subjects</p>
                </div>
            `;
        } else {
            let html = `
                <div style="margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; padding: 8px 0;">
                    <span style="font-weight: 600; color: #f1f5f9;">${subjects.length} subjects assigned</span>
                    <button onclick="clearAllSubjects()" class="btn btn-danger btn-sm" style="padding: 4px 12px;">🗑 Clear All</button>
                </div>
                <ul style="list-style: none; padding: 0; max-height: 300px; overflow-y: auto; margin: 0;">
            `;
            
            subjects.forEach(sub => {
                html += `
                    <li style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-bottom: 1px solid #334155; background: #1e293b; border-radius: 6px; margin-bottom: 6px;">
                        <span style="color: #e2e8f0;">
                            <strong style="color: #f1f5f9;">${escapeHtml(sub.subject_name)}</strong>
                            <span style="color: #94a3b8; font-size: 12px; margin-left: 10px;">Max: ${sub.max_marks}</span>
                            ${sub.category ? `<span style="color: #64748b; font-size: 12px; margin-left: 8px;">📁 ${escapeHtml(sub.category)}</span>` : ''}
                        </span>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <input type="number" id="editMax_${escapeHtml(sub.subject_name)}" value="${sub.max_marks}" style="width: 70px; padding: 4px 6px; border: 1px solid #475569; border-radius: 4px; background: #0f172a; color: #e2e8f0; font-size: 13px;">
                            <button onclick="updateSubjectMax('${escapeHtml(sub.subject_name)}')" class="btn btn-ghost btn-sm" style="padding: 4px 8px; color: #60a5fa; background: transparent; border: none; cursor: pointer; font-size: 14px;" title="Update max marks">💾</button>
                            <button onclick="removeSubject('${escapeHtml(sub.subject_name)}')" class="btn btn-danger btn-sm" style="padding: 4px 8px; color: #f87171; background: transparent; border: none; cursor: pointer; font-size: 14px;" title="Remove subject">✕</button>
                        </div>
                    </li>
                `;
            });
            
            html += '</ul>';
            div.innerHTML = html;
        }
        
        // Render quick add chips
        renderQuickSubjectChips(subjects);
        
    } catch (e) {
        console.error('Refresh subjects error:', e);
        showAlert('Failed to refresh subjects', 'error');
    }
}

/**
 * Render quick add subject chips
 */
function renderQuickSubjectChips(existingSubjects) {
    const chipsDiv = document.getElementById('quickSubjectChips');
    if (!chipsDiv) return;
    
    const existingNames = existingSubjects.map(s => s.subject_name);
    const available = QUICK_SUBJECTS.filter(cs => !existingNames.includes(cs.name));
    
    if (available.length === 0) {
        chipsDiv.innerHTML = `
            <span style="color: #4ade80; font-size: 13px; font-weight: 500;">✅ All common subjects added!</span>
            <button onclick="showAllSubjects()" class="btn btn-ghost btn-sm" style="color: #60a5fa; background: transparent; border: 1px solid #60a5fa; padding: 4px 12px; border-radius: 16px; cursor: pointer;">📚 Show All</button>
        `;
        return;
    }
    
    chipsDiv.innerHTML = available.map(cs =>
        `<button class="btn btn-ghost btn-sm" onclick="addQuickSubject('${escapeHtml(cs.name)}', ${cs.max})" 
            style="background: #1e293b; border: 1px solid #475569; padding: 6px 14px; border-radius: 20px; cursor: pointer; color: #e2e8f0; font-size: 13px; transition: all 0.2s;"
            onmouseover="this.style.background='#334155'; this.style.borderColor='#60a5fa';"
            onmouseout="this.style.background='#1e293b'; this.style.borderColor='#475569';">
            ${escapeHtml(cs.name)} (${cs.max})
        </button>`
    ).join('');
}/**
 * Add a subject group
 */
window.addSubjectGroup = async function(groupName) {
    if (!currentClassId) {
        showAlert('No class selected', 'error');
        return;
    }
    
    const group = SUBJECT_GROUPS[groupName];
    if (!group) {
        showAlert('Group not found', 'error');
        return;
    }
    
    // Check how many subjects can be added
    const maxSubjects = parseInt(document.getElementById('subjectModalTitle')?.textContent?.match(/\d+\)/)?.[0]?.replace(/[^0-9]/g, '') || 20);
    
    let added = 0;
    let skipped = 0;
    let errors = [];
    
    for (const subject of group) {
        try {
            await fetchAPI(`/classes/${currentClassId}/subjects`, {
                method: 'POST',
                body: JSON.stringify({
                    subject_name: subject.name,
                    max_marks: subject.max_marks,
                    category: subject.category || ''
                })
            });
            added++;
        } catch (error) {
            if (error.message.includes('already exists')) {
                skipped++;
            } else {
                errors.push(`${subject.name}: ${error.message}`);
            }
        }
    }
    
    // Show result message
    let message = `✅ Added ${added} subjects`;
    if (skipped > 0) message += `, ${skipped} already existed`;
    if (errors.length > 0) message += `\n⚠️ Errors: ${errors.join(', ')}`;
    
    showAlert(message, errors.length > 0 ? 'warning' : 'success');
    await refreshSubjectList();
};

/**
 * Bulk add subjects from textarea
 */
window.bulkAddSubjects = async function() {
    if (!currentClassId) {
        showAlert('No class selected', 'error');
        return;
    }
    
    const input = document.getElementById('bulkSubjectsInput');
    if (!input) return;
    
    const lines = input.value.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    
    if (lines.length === 0) {
        showAlert('Please enter at least one subject', 'error');
        return;
    }
    
    let added = 0;
    let skipped = 0;
    let errors = [];
    
    for (const line of lines) {
        // Parse format: "SubjectName" or "SubjectName 100" or "SubjectName:100"
        let name = line;
        let maxMarks = 100;
        
        // Try to extract max marks
        const parts = line.split(/[:\t]+/);
        if (parts.length === 2) {
            name = parts[0].trim();
            const marks = parseFloat(parts[1].trim());
            if (!isNaN(marks)) maxMarks = marks;
        } else {
            // Try to find number at the end
            const match = line.match(/^(.*?)\s+(\d+)$/);
            if (match) {
                name = match[1].trim();
                maxMarks = parseInt(match[2]);
            }
        }
        
        if (!name) continue;
        
        try {
            await fetchAPI(`/classes/${currentClassId}/subjects`, {
                method: 'POST',
                body: JSON.stringify({
                    subject_name: name,
                    max_marks: maxMarks
                })
            });
            added++;
        } catch (error) {
            if (error.message.includes('already exists')) {
                skipped++;
            } else {
                errors.push(`${name}: ${error.message}`);
            }
        }
    }
    
    let message = `✅ Added ${added} subjects`;
    if (skipped > 0) message += `, ${skipped} already existed`;
    if (errors.length > 0) message += `\n⚠️ Errors: ${errors.join(', ')}`;
    
    showAlert(message, errors.length > 0 ? 'warning' : 'success');
    input.value = '';
    await refreshSubjectList();
};

/**
 * Clear all subjects from a class (with confirmation)
 */
window.clearAllSubjects = async function() {
    if (!currentClassId) return;
    
    const subjects = await fetchAPI(`/classes/${currentClassId}/subjects`);
    if (!subjects.subjects || subjects.subjects.length === 0) {
        showAlert('No subjects to clear', 'info');
        return;
    }
    
    if (!confirm(`Remove all ${subjects.subjects.length} subjects from this class?`)) return;
    
    let removed = 0;
    let errors = [];
    
    for (const sub of subjects.subjects) {
        try {
            await fetchAPI(`/classes/${currentClassId}/subjects/${encodeURIComponent(sub.subject_name)}`, {
                method: 'DELETE'
            });
            removed++;
        } catch (error) {
            errors.push(sub.subject_name);
        }
    }
    
    showAlert(`✅ Removed ${removed} subjects${errors.length > 0 ? `, ⚠️ Failed: ${errors.join(', ')}` : ''}`, 
              errors.length > 0 ? 'warning' : 'success');
    await refreshSubjectList();
};

/**
 * Show all available subjects (for reference)
 */
window.showAllSubjects = function() {
    const allSubjects = QUICK_SUBJECTS.map(s => `${s.name} (${s.max})`).join('\n');
    alert(`📚 All Available Subjects:\n\n${allSubjects}\n\nTotal: ${QUICK_SUBJECTS.length} subjects`);
};

/**
 * Add a single quick subject
 */
window.addQuickSubject = async function(name, maxMarks) {
    if (!currentClassId) {
        showAlert('No class selected', 'error');
        return;
    }
    
    try {
        await fetchAPI(`/classes/${currentClassId}/subjects`, {
            method: 'POST',
            body: JSON.stringify({
                subject_name: name,
                max_marks: maxMarks
            })
        });
        showAlert(`✅ Added "${name}" successfully`, 'success');
        await refreshSubjectList();
    } catch (error) {
        if (error.message.includes('already exists')) {
            showAlert(`⚠️ "${name}" already exists`, 'warning');
        } else {
            showAlert(`❌ Failed to add "${name}": ${error.message}`, 'error');
        }
    }
};

// Add keyboard shortcuts for the subject modal
document.addEventListener('keydown', function(e) {
    // Ctrl+Enter to add subject when in input field
    if (e.ctrlKey && e.key === 'Enter') {
        const input = document.getElementById('newSubjectName');
        if (input && document.activeElement === input) {
            e.preventDefault();
            addSubject();
        }
    }
    
    // Escape to close modal
    if (e.key === 'Escape') {
        const modal = document.getElementById('subjectModal');
        if (modal && modal.classList.contains('active')) {
            closeSubjectModal();
        }
    }
});

/**
 * Add a single subject to the current class
 */
window.addSubject = async function(subjectName, maxMarks) {
    const name = subjectName || document.getElementById('newSubjectName')?.value.trim();
    const marks = maxMarks !== undefined ? maxMarks : parseInt(document.getElementById('newSubjectMaxMarks')?.value || 100);
    const category = document.getElementById('newSubjectCategory')?.value || '';
    
    if (!name) {
        showAlert('Please enter a subject name', 'error');
        return;
    }
    
    if (!currentClassId) {
        showAlert('No class selected. Please open a class first.', 'error');
        return;
    }
    
    try {
        await fetchAPI(`/classes/${currentClassId}/subjects`, {
            method: 'POST',
            body: JSON.stringify({
                subject_name: name,
                max_marks: marks,
                category: category
            })
        });
        
        showAlert(`✅ Added "${name}" successfully`, 'success');
        
        // Clear inputs
        const nameInput = document.getElementById('newSubjectName');
        const marksInput = document.getElementById('newSubjectMaxMarks');
        const categorySelect = document.getElementById('newSubjectCategory');
        
        if (nameInput) nameInput.value = '';
        if (marksInput) marksInput.value = '100';
        if (categorySelect) categorySelect.value = '';
        
        await refreshSubjectList();
        
    } catch (error) {
        if (error.message && error.message.includes('already exists')) {
            showAlert(`⚠️ "${name}" already exists in this class`, 'warning');
        } else {
            showAlert(`❌ Failed to add "${name}": ${error.message}`, 'error');
        }
    }
};
// ============================================
// FEES MODULE (FULL)
// ============================================
// ============================================
// FEES MODULE (ENHANCED WITH REPORT FEATURES)
// ============================================
async function loadFees() {
    try {
        const [studentsData, classesData] = await Promise.all([
            fetchAPI('/students'),
            fetchAPI('/classes')
        ]);

        const students = studentsData.students || [];
        const classes = classesData.classes || [];
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];

        const html = `
            <div class="page-header">
                <div class="page-title">Fees</div>
                <div class="page-sub">Manage fee records and generate vouchers.</div>
                <div style="float:right; margin-top:-50px;">
                    <button onclick="printFees()" class="btn btn-primary" style="margin-right: 10px;">🖨 Print</button>
                    <button onclick="exportFeesCSV()" class="btn btn-success">📥 Export CSV</button>
                </div>
            </div>

            <!-- Tab Switcher -->
            <div style="display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 1px solid #334155; padding-bottom: 10px;">
                <button onclick="switchFeesView('list')" id="feeTabList" class="btn btn-primary" style="padding: 8px 16px;">📋 Records List</button>
                <button onclick="switchFeesView('voucher')" id="feeTabVoucher" class="btn btn-ghost" style="padding: 8px 16px;">🧾 Vouchers</button>
            </div>

            <!-- LIST VIEW -->
            <div id="feeListViewSection" class="view-section">
                <!-- Summary Cards -->
                <div id="feeSummary" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px;">
                    <div class="kpi-card"><div class="kpi-label">Total Fees</div><div id="feeTotalAmount" class="kpi-value">0</div></div>
                    <div class="kpi-card"><div class="kpi-label">Total Paid</div><div id="feeTotalPaid" class="kpi-value" style="color: var(--green);">0</div></div>
                    <div class="kpi-card"><div class="kpi-label">Total Unpaid</div><div id="feeTotalUnpaid" class="kpi-value" style="color: var(--red);">0</div></div>
                    <div class="kpi-card"><div class="kpi-label">Records</div><div id="feeCount" class="kpi-value">0</div></div>
                </div>

                <!-- Filter Bar -->
                <div class="card" style="margin-bottom: 20px;">
                    <div class="toolbar" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;">
                        <input type="text" id="feeSearch" placeholder="Search fees..." class="filter">
                        <select id="feeMonth" class="filter">
                            <option value="">All Months</option>
                            ${months.map(m => `<option value="${m}">${m}</option>`).join('')}
                        </select>
                        <input type="number" id="feeYear" class="filter" placeholder="Year" value="${new Date().getFullYear()}">
                        <select id="feeClass" class="filter">
                            <option value="">All Classes</option>
                            ${classes.map(c => `<option value="${c.class_name}">${c.class_name}</option>`).join('')}
                        </select>
                        <select id="feeStudent" class="filter">
                            <option value="">All Students</option>
                            ${students.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                        </select>
                        <select id="feeStatus" class="filter">
                            <option value="all">All Status</option>
                            <option value="paid">Paid</option>
                            <option value="unpaid">Unpaid</option>
                        </select>
                        <button onclick="applyFeeFilters()" class="btn btn-primary">🔍 Apply</button>
                        <button onclick="clearFeeFilters()" class="btn btn-ghost">🗑 Clear</button>
                        <button onclick="showFeeModal()" class="btn btn-primary">+ Add Fee</button>
                    </div>
                </div>

                <!-- Fee Table -->
                <div class="card">
                    <div class="table-wrap">
                        <table class="data-table" id="feeTable">
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th>Class</th>
                                    <th>Fee Type</th>
                                    <th>Month</th>
                                    <th>Amount</th>
                                    <th>Paid</th>
                                    <th>Due Date</th>
                                    <th>Paid Date</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="feeTableBody">
                                <tr><td colspan="10" style="text-align:center;">Apply filters to load data</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- VOUCHER VIEW -->
            <div id="feeVoucherViewSection" class="view-section" style="display: none;">
                <div class="card" style="margin-bottom: 20px;">
                    <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; background: var(--card2); padding: 10px 16px; border-radius: 8px;">
                        <label style="color: #94a3b8; font-weight: 500; font-size: 13px;">Class:</label>
                        <select id="voucherClass" class="filter" style="min-width: 120px; flex: 1;">
                            <option value="">-- Select Class --</option>
                            ${classes.map(c => `<option value="${c.class_name}">${c.class_name}</option>`).join('')}
                        </select>
                        <label style="color: #94a3b8; font-weight: 500; font-size: 13px;">Month:</label>
                        <select id="voucherMonth" class="filter" style="min-width: 100px; flex: 0.5;">
                            ${months.map(m => `<option value="${m}">${m}</option>`).join('')}
                        </select>
                        <label style="color: #94a3b8; font-weight: 500; font-size: 13px;">Year:</label>
                        <input type="number" id="voucherYear" class="filter" value="${new Date().getFullYear()}" style="width: 80px;">
                        <button onclick="generateBulkVouchers()" class="btn btn-primary">📋 Generate Vouchers</button>
                        <button onclick="printVouchers()" class="btn btn-success">🖨 Print All</button>
                    </div>
                </div>

                <div class="card">
                    <div class="table-wrap">
                        <table class="data-table" id="voucherTable">
                            <thead>
                                <tr>
                                    <th><input type="checkbox" id="selectAllVouchers" onchange="toggleSelectAllVouchers()"></th>
                                    <th>Student</th>
                                    <th>Class</th>
                                    <th>Month</th>
                                    <th>Prev. Pending</th>
                                    <th>Current Fee</th>
                                    <th>Paid</th>
                                    <th>Balance</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody id="voucherTableBody">
                                <tr><td colspan="10" style="text-align:center;">Select a class and month, then generate.</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Fee Modal (unchanged) -->
           <!-- Fee Modal -->
			<div id="feeModal" class="modal-overlay">
				<div class="modal" style="max-width: 700px;">
					<div class="modal-header">
						<h2 id="feeModalTitle">Add Fee Records</h2>
						<span class="close-btn" onclick="closeFeeModal()">&times;</span>
					</div>
					<div class="modal-body">
						<form id="feeForm" onsubmit="event.preventDefault(); saveFee();">
							<input type="hidden" id="feeId">

							<!-- Student and common fields -->
							<div class="form-grid">
								<div class="form-group full">
									<label for="feeStudentId">Student *</label>
									<select id="feeStudentId" required>
										<option value="">Select Student</option>
										${students.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
									</select>
								</div>
								<div class="form-group">
									<label for="feeMonth">Month *</label>
									<input type="text" id="feeMonth" required value="${new Date().toLocaleString('default', { month: 'long' })}">
								</div>
								<div class="form-group">
									<label for="feeDueDate">Due Date</label>
									<input type="date" id="feeDueDate">
								</div>
							</div>

							<!-- Dynamic Fee Rows -->
							<div style="margin: 15px 0;">
								<label style="font-weight:600; display:block; margin-bottom:6px;">Fee Breakdown</label>
								<div id="feeRowsContainer">
									<div class="fee-row" style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
										<select class="fee-type-select" style="flex:2; padding:6px;">
											<option value="Tuition Fee">Tuition Fee</option>
											<option value="Transport Fee">Transport Fee</option>
											<option value="Exam Fee">Exam Fee</option>
											<option value="Books Fee">Books Fee</option>
											<option value="Lab Fee">Lab Fee</option>
											<option value="Other">Other</option>
										</select>
										<input type="text" class="fee-custom-type" placeholder="Custom type" style="flex:1; display:none; padding:6px;">
										<input type="number" class="fee-amount" placeholder="Amount" step="0.01" style="flex:1; padding:6px;">
										<input type="number" class="fee-paid" placeholder="Paid" step="0.01" value="0" style="flex:1; padding:6px;">
										<button type="button" class="btn btn-danger btn-sm remove-fee-row" style="padding:2px 8px;">✕</button>
									</div>
								</div>
								<button type="button" id="addFeeRowBtn" class="btn btn-ghost btn-sm" style="margin-top:6px;">+ Add Charge</button>
							</div>

							<div class="modal-footer">
								<button type="button" class="btn btn-ghost" onclick="closeFeeModal()">Cancel</button>
								<button type="submit" class="btn btn-primary">Save All Fees</button>
							</div>
						</form>
					</div>
				</div>
			</div>
    `;

        document.getElementById('page-content').innerHTML = html;

        // Automatically apply filters (list view)
        applyFeeFilters();

        // Set default month for voucher (current month)
        const now = new Date();
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                            'July', 'August', 'September', 'October', 'November', 'December'];
        document.getElementById('voucherMonth').value = monthNames[now.getMonth()];
        document.getElementById('voucherYear').value = now.getFullYear();

        // Add event listener for "Enter" key on search fields
        document.getElementById('feeSearch').addEventListener('keyup', function(e) {
            if (e.key === 'Enter') applyFeeFilters();
        });

    } catch (e) {
        console.error(e);
        document.getElementById('page-content').innerHTML = '<div class="loading">Failed to load fees.</div>';
    }
}
// ============================================
// VOUCHER FUNCTIONS
// ============================================

window.switchFeesView = function(view) {
    const listView = document.getElementById('feeListViewSection');
    const voucherView = document.getElementById('feeVoucherViewSection');
    const tabList = document.getElementById('feeTabList');
    const tabVoucher = document.getElementById('feeTabVoucher');

    if (view === 'list') {
        if (listView) listView.style.display = 'block';
        if (voucherView) voucherView.style.display = 'none';
        if (tabList) { tabList.classList.add('btn-primary'); tabList.classList.remove('btn-ghost'); }
        if (tabVoucher) { tabVoucher.classList.add('btn-ghost'); tabVoucher.classList.remove('btn-primary'); }
    } else {
        if (listView) listView.style.display = 'none';
        if (voucherView) voucherView.style.display = 'block';
        if (tabList) { tabList.classList.add('btn-ghost'); tabList.classList.remove('btn-primary'); }
        if (tabVoucher) { tabVoucher.classList.add('btn-primary'); tabVoucher.classList.remove('btn-ghost'); }
    }
};

window.generateBulkVouchers = async function() {
    const class_name = document.getElementById('voucherClass').value;
    const month = document.getElementById('voucherMonth').value;
    const year = document.getElementById('voucherYear').value;

    if (!class_name || !month) {
        showAlert('Please select class and month.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/fees/vouchers/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ class_name, month, year })
        });
        if (!response.ok) throw new Error('Failed to generate vouchers');
        const data = await response.json();
        const vouchers = data.vouchers || [];
        const tbody = document.getElementById('voucherTableBody');
        if (vouchers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color: #94a3b8;">No vouchers generated.</td></tr>';
            return;
        }
		tbody.innerHTML = vouchers.map(v => {
			const totalCurrent = (v.current_fees || []).reduce((sum, f) => sum + f.amount, 0);
			const totalPaid = (v.current_fees || []).reduce((sum, f) => sum + f.paid_amount, 0);
			return `
				<tr>
					<td><input type="checkbox" class="voucher-checkbox" data-student-id="${v.student.id}"></td>
					<td>${escapeHtml(v.student.name)}</td>
					<td>${escapeHtml(v.student.grade)}</td>
					<td>${escapeHtml(month)} ${year}</td>
					<td style="text-align:right;">PKR ${v.previous_pending.toLocaleString()}</td>
					<td style="text-align:right;">PKR ${totalCurrent.toLocaleString()}</td>
					<td style="text-align:right;">PKR ${totalPaid.toLocaleString()}</td>
					<td style="text-align:right;">PKR ${v.balance.toLocaleString()}</td>
					<td>${v.status === 'Paid' ? '<span class="badge badge-green">Paid</span>' :
						v.status === 'Partial' ? '<span class="badge badge-yellow">Partial</span>' :
						'<span class="badge badge-red">Pending</span>'}</td>
					<td>
						<button onclick="printStudentVoucher('${v.student.id}', '${month}', '${year}')" class="btn btn-ghost btn-sm">🖨</button>
					</td>
				</tr>
			`;
		}).join('');
    } catch (error) {
        showAlert('Failed to generate vouchers: ' + error.message, 'error');
    }
};

window.printStudentVoucher = async function(studentId, month, year) {
    try {
        const response = await fetch(`${API_BASE}/fees/voucher/student/${studentId}?month=${encodeURIComponent(month)}&year=${encodeURIComponent(year)}`, {
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to fetch voucher');
        const voucher = await response.json();
        // Use printPreview to show voucher
        const content = generateVoucherHTML(voucher);
        printPreview(content, `Fee Voucher - ${voucher.student.name}`);
    } catch (error) {
        showAlert('Failed to print voucher: ' + error.message, 'error');
    }
};

window.printVouchers = function() {
    const rows = document.querySelectorAll('#voucherTableBody tr');
    const checked = document.querySelectorAll('.voucher-checkbox:checked');
    const toPrint = checked.length > 0 ? checked : rows;

    if (toPrint.length === 0) {
        showAlert('No vouchers to print.', 'error');
        return;
    }

    const month = document.getElementById('voucherMonth').value;
    const year = document.getElementById('voucherYear').value;
    const studentIds = [];
    toPrint.forEach(el => {
        if (el.type === 'checkbox') {
            const id = el.dataset.studentId;
            if (id) studentIds.push(id);
        } else {
            const checkbox = el.querySelector('.voucher-checkbox');
            if (checkbox) studentIds.push(checkbox.dataset.studentId);
        }
    });

    if (studentIds.length === 0) {
        showAlert('No students selected.', 'error');
        return;
    }

    Promise.all(studentIds.map(id => 
        fetch(`${API_BASE}/fees/voucher/student/${id}?month=${encodeURIComponent(month)}&year=${encodeURIComponent(year)}`, { credentials: 'include' })
            .then(res => res.json())
    )).then(vouchers => {
        let combinedHTML = '';
        vouchers.forEach((v, index) => {
            combinedHTML += generateVoucherHTML(v);
            if (index < vouchers.length - 1) {
                combinedHTML += '<div style="page-break-after: always;"></div>';
            }
        });
        printPreview(combinedHTML, 'Fee Vouchers');
    }).catch(error => {
        showAlert('Error printing vouchers: ' + error.message, 'error');
    });
};

window.toggleSelectAllVouchers = function() {
    const checked = document.getElementById('selectAllVouchers').checked;
    document.querySelectorAll('.voucher-checkbox').forEach(cb => cb.checked = checked);
};

function generateVoucherHTML(voucher) {
    const s = voucher.student;
    const currentFees = voucher.current_fees || [];
    const prevPending = voucher.previous_pending || 0;
    const totalDue = voucher.total_due || 0;
    const totalPaid = voucher.total_paid || 0;
    const balance = voucher.balance || 0;
    const status = voucher.status || 'Pending';
    const month = voucher.month;
    const year = voucher.year;

    const voucherNo = `V-${year}-${s.id}`;
    const today = new Date().toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' });

    function copyHTML(label) {
        // Build fee rows
        let feeRows = '';
        currentFees.forEach(f => {
            feeRows += `
                <tr>
                    <td>${escapeHtml(f.fee_type)}</td>
                    <td>${f.amount.toLocaleString()}</td>
                </tr>
            `;
        });
        if (!feeRows) {
            feeRows = `<tr><td colspan="2" style="text-align:center; color:#94a3b8;">No current fees</td></tr>`;
        }

        return `
            <div class="voucher-copy">
                <div class="copy-label">${label}</div>
                <div class="voucher-header">
                    <div class="school-name">${SCHOOL_NAME}</div>
                    <div class="voucher-title">Fee Voucher</div>
                </div>
                <div class="voucher-meta">
                    <div><strong>Voucher No:</strong> ${voucherNo}</div>
                    <div><strong>Date:</strong> ${today}</div>
                    <div><strong>Month:</strong> ${month} ${year}</div>
                </div>
                <div class="student-info">
                    <div><strong>Student:</strong> ${escapeHtml(s.name)}</div>
                    <div><strong>Father:</strong> ${escapeHtml(s.parent_name || '—')}</div>
                    <div><strong>ID:</strong> ${escapeHtml(s.id)}</div>
                    <div><strong>Class:</strong> ${escapeHtml(s.grade)}</div>
                </div>
                <div class="fee-table">
                    <table>
                        <thead><tr><th>Description</th><th>Amount (PKR)</th></tr></thead>
                        <tbody>
                            <tr><td><strong>Previous Months Balance</strong></td><td>${prevPending.toLocaleString()}</td></tr>
                            ${feeRows}
                            <tr class="total-row"><td><strong>Total Due</strong></td><td><strong>${totalDue.toLocaleString()}</strong></td></tr>
                            <tr><td>Paid Amount</td><td>${totalPaid.toLocaleString()}</td></tr>
                            <tr class="balance-row"><td><strong>Balance Due</strong></td><td><strong>${balance.toLocaleString()}</strong></td></tr>
                        </tbody>
                    </table>
                </div>
                <div class="fee-status">
                    <span>Status: <strong>${status}</strong></span>
                </div>
                <div class="signature-area">
                    <div>_____________<br>Student's Sign</div>
                    <div>_____________<br>Parent's Sign</div>
                    <div>_____________<br>Principal's Sign</div>
                </div>
                <div class="footer-text">System Generated Voucher</div>
            </div>
        `;
    }

    return `
        <style>
            .voucher-container {
                display: flex;
                flex-wrap: wrap;
                justify-content: space-around;
                max-width: 1100px;
                margin: 0 auto;
                background: #fff;
                padding: 10px;
                font-family: 'Segoe UI', Arial, sans-serif;
            }
            .voucher-copy {
                flex: 1 1 30%;
                min-width: 280px;
                max-width: 32%;
                border: 2px solid #1e293b;
                border-radius: 6px;
                padding: 12px 10px;
                margin: 5px;
                background: #fff;
                box-shadow: 0 1px 4px rgba(0,0,0,0.05);
                font-size: 12px;
                page-break-inside: avoid;
            }
            .copy-label {
                text-align: center;
                font-size: 12px;
                font-weight: bold;
                color: #1e293b;
                border-bottom: 2px dashed #94a3b8;
                padding-bottom: 4px;
                margin-bottom: 8px;
                letter-spacing: 1px;
                background: #f1f5f9;
                border-radius: 4px;
                padding: 4px 0;
            }
            .voucher-header {
                text-align: center;
                border-bottom: 2px solid #3b82f6;
                padding-bottom: 6px;
                margin-bottom: 8px;
            }
            .school-name {
                font-size: 18px;
                font-weight: 800;
                color: #0f172a;
                letter-spacing: 0.5px;
            }
            .voucher-title {
                font-size: 14px;
                font-weight: 600;
                color: #3b82f6;
                margin-top: 2px;
            }
            .voucher-meta {
                display: flex;
                justify-content: space-between;
                font-size: 11px;
                background: #f8fafc;
                padding: 4px 8px;
                border-radius: 4px;
                margin-bottom: 8px;
                flex-wrap: wrap;
            }
            .student-info {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 2px 12px;
                font-size: 12px;
                margin-bottom: 8px;
                background: #f1f5f9;
                padding: 6px 10px;
                border-radius: 4px;
            }
            .student-info div {
                padding: 2px 0;
            }
            .fee-table table {
                width: 100%;
                border-collapse: collapse;
                font-size: 11px;
                margin: 6px 0;
            }
            .fee-table th, .fee-table td {
                border: 1px solid #cbd5e1;
                padding: 4px 6px;
                text-align: left;
            }
            .fee-table th {
                background: #0f172a;
                color: #f8fafc;
                font-weight: 600;
                font-size: 10px;
            }
            .fee-table .total-row td {
                font-weight: bold;
                background: #e2e8f0;
            }
            .fee-table .balance-row td {
                font-weight: bold;
                background: #dbeafe;
                color: #1e3a8a;
            }
            .fee-status {
                margin: 6px 0;
                font-size: 13px;
                text-align: center;
            }
            .fee-status strong {
                padding: 2px 12px;
                border-radius: 12px;
                background: ${status === 'Paid' ? '#22c55e' : status === 'Partial' ? '#f59e0b' : '#ef4444'};
                color: #fff;
                display: inline-block;
                font-size: 12px;
            }
            .signature-area {
                display: flex;
                justify-content: space-between;
                margin-top: 12px;
                font-size: 10px;
                text-align: center;
            }
            .signature-area div {
                width: 30%;
                border-top: 1px solid #94a3b8;
                padding-top: 4px;
            }
            .footer-text {
                margin-top: 8px;
                font-size: 9px;
                color: #64748b;
                text-align: center;
                border-top: 1px dashed #cbd5e1;
                padding-top: 6px;
            }
            @media print {
                body { background: #fff; padding: 0; margin: 0; }
                .voucher-container { max-width: 100%; padding: 2mm; }
                .voucher-copy {
                    border: 1px solid #000;
                    box-shadow: none;
                    margin: 2mm;
                    flex: 1 1 30%;
                    max-width: 32%;
                    page-break-inside: avoid;
                }
            }
            @media (max-width: 700px) {
                .voucher-copy {
                    flex: 1 1 100%;
                    max-width: 100%;
                }
            }
        </style>
        <div class="voucher-container">
            ${copyHTML('SCHOOL COPY')}
            ${copyHTML('PARENT COPY')}
            ${copyHTML('BANK COPY')}
        </div>
    `;
}


// ============================================
// FEES MODAL FUNCTIONS (Global)
// ============================================

window.showFeeModal = function() {
    const modal = document.getElementById('feeModal');
    if (modal) {
        document.getElementById('feeModalTitle').innerText = 'Add Fee Records';
        document.getElementById('feeForm').reset();
        document.getElementById('feeId').value = '';
        // Set default month
        const now = new Date();
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        document.getElementById('feeMonth').value = monthNames[now.getMonth()];
        
        // 🆕 Clear existing rows and add one default row
        const container = document.getElementById('feeRowsContainer');
        container.innerHTML = ''; // remove any old rows
        addFeeRow('Tuition Fee', '', '0');
        
        // 🆕 Attach the "Add Row" button listener (if not already attached)
        const addBtn = document.getElementById('addFeeRowBtn');
        // Remove any previous listener to avoid duplicates
        addBtn.replaceWith(addBtn.cloneNode(true));
        const newAddBtn = document.getElementById('addFeeRowBtn');
        newAddBtn.addEventListener('click', function() {
            addFeeRow('Tuition Fee', '', '0');
        });
        
        modal.classList.add('active');
    }
};

window.closeFeeModal = function() {
    const modal = document.getElementById('feeModal');
    if (modal) modal.classList.remove('active');
};

window.editFee = async function(id) {
    try {
        const data = await fetchAPI('/fees');
        const fee = (data.fees || []).find(f => f.id === id);
        if (fee) {
            const modal = document.getElementById('feeModal');
            modal.classList.add('active');
            document.getElementById('feeModalTitle').innerText = 'Edit Fee Record';
            document.getElementById('feeStudentId').value = fee.student_id;
            document.getElementById('feeMonth').value = fee.month || '';
            document.getElementById('feeDueDate').value = fee.due_date || '';
            document.getElementById('feeId').value = fee.id; // store for update

            const container = document.getElementById('feeRowsContainer');
            container.innerHTML = '';
            addFeeRow(fee.fee_type, fee.amount, fee.paid_amount);
        }
    } catch(e) {
        showAlert('Failed to load fee', 'error');
    }
};

window.saveFee = async function() {
    const feeId = document.getElementById('feeId').value;
    const studentId = document.getElementById('feeStudentId').value;
    const month = document.getElementById('feeMonth').value;
    const dueDate = document.getElementById('feeDueDate').value;

    if (!studentId || !month) {
        showAlert('Please select a student and month.', 'error');
        return;
    }

    const rows = document.querySelectorAll('.fee-row');
    const feeItems = [];
    let hasError = false;

    rows.forEach(row => {
        const typeSelect = row.querySelector('.fee-type-select');
        const customInput = row.querySelector('.fee-custom-type');
        const amountInput = row.querySelector('.fee-amount');
        const paidInput = row.querySelector('.fee-paid');

        let feeType = typeSelect.value;
        if (feeType === 'Other') {
            feeType = customInput.value.trim() || 'Other';
        }
        const amount = parseFloat(amountInput.value);
        const paid = parseFloat(paidInput.value) || 0;

        if (!feeType || isNaN(amount) || amount <= 0) {
            hasError = true;
            showAlert('Each row must have a valid fee type and amount.', 'error');
            return;
        }

        feeItems.push({
            student_id: studentId,
            fee_type: feeType,
            month: month,
            amount: amount,
            paid_amount: paid,
            due_date: dueDate,
            paid_date: paid > 0 ? new Date().toISOString().split('T')[0] : null
        });
    });

    if (hasError || feeItems.length === 0) return;

    try {
        let url, method, body;
        if (feeId) {
            // Update the first row only (since editing single fee)
            const firstFee = feeItems[0];
            url = `/fees/${feeId}`;
            method = 'PUT';
            body = JSON.stringify(firstFee);
        } else {
            url = '/fees';
            method = 'POST';
            body = JSON.stringify(feeItems);
        }

        const response = await fetch(`${API_BASE}${url}`, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: body
        });
        if (!response.ok) throw new Error('Failed to save');
        const result = await response.json();
        showAlert(result.message || 'Fee saved successfully', 'success');
        closeFeeModal();
        await applyFeeFilters();
    } catch (error) {
        showAlert('Error saving fees: ' + error.message, 'error');
    }
};

window.deleteFee = async function(id) {
    if (confirm('Delete fee record?')) {
        try {
            await fetchAPI(`/fees/${id}`, { method: 'DELETE' });
            showAlert('Fee record deleted');
            await applyFeeFilters();
        } catch(e) {
            console.error(e);
            showAlert('Error deleting fee', 'error');
        }
    }
};

// ============================================
// FEES FILTER FUNCTIONS
// ============================================
window.applyFeeFilters = async function() {
    const search = document.getElementById('feeSearch')?.value || '';
    const month = document.getElementById('feeMonth')?.value || '';
    const year = document.getElementById('feeYear')?.value || '';
    const class_name = document.getElementById('feeClass')?.value || '';
    const student_id = document.getElementById('feeStudent')?.value || '';
    const status = document.getElementById('feeStatus')?.value || 'all';

    const params = new URLSearchParams();
    if (search) params.append('q', search);
    if (month) params.append('month', month);
    if (year) params.append('year', year);
    if (class_name) params.append('class', class_name);
    if (student_id) params.append('student_id', student_id);
    if (status) params.append('status', status);

    try {
        const data = await fetchAPI(`/fees/report?${params.toString()}`);
        const fees = data.fees || [];
        const summary = data.summary || {};

        // Update summary
        document.getElementById('feeTotalAmount').textContent = 'PKR ' + (summary.total_amount || 0).toLocaleString();
        document.getElementById('feeTotalPaid').textContent = 'PKR ' + (summary.total_paid || 0).toLocaleString();
        document.getElementById('feeTotalUnpaid').textContent = 'PKR ' + (summary.total_unpaid || 0).toLocaleString();
        document.getElementById('feeCount').textContent = summary.count || 0;

        // Update table
        const tbody = document.getElementById('feeTableBody');
        if (fees.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color: #94a3b8;">No records found.</td></tr>';
            return;
        }

        tbody.innerHTML = fees.map(f => `
            <tr>
                <td style="font-weight:500;">${escapeHtml(f.student_name)}</td>
                <td>${escapeHtml(f.student_class || '-')}</td>
                <td>${escapeHtml(f.fee_type)}</td>
                <td>${escapeHtml(f.month || '-')}</td>
                <td style="text-align:right;">PKR ${parseFloat(f.amount || 0).toLocaleString()}</td>
                <td style="text-align:right;">PKR ${parseFloat(f.paid_amount || 0).toLocaleString()}</td>
                <td>${f.due_date || '-'}</td>
                <td>${f.paid_date || '-'}</td>
                <td>${f.status === 'Paid' ? '<span class="badge badge-green">Paid</span>' :
                    f.status === 'Pending' ? '<span class="badge badge-red">Pending</span>' :
                    '<span class="badge badge-yellow">Partial</span>'}</td>
                <td class="actions">
                    <button onclick="editFee(${f.id})" class="btn btn-ghost btn-sm">✏</button>
                    <button onclick="deleteFee(${f.id})" class="btn btn-danger btn-sm">🗑</button>
                </td>
            </tr>
        `).join('');

    } catch (error) {
        showAlert('Failed to load fees: ' + error.message, 'error');
    }
};

window.clearFeeFilters = function() {
    document.getElementById('feeSearch').value = '';
    document.getElementById('feeMonth').value = '';
    document.getElementById('feeYear').value = '';
    document.getElementById('feeClass').value = '';
    document.getElementById('feeStudent').value = '';
    document.getElementById('feeStatus').value = 'all';
    applyFeeFilters();
};

// ============================================
// EXPORT FEES TO CSV
// ============================================
window.exportFeesCSV = async function() {
    const search = document.getElementById('feeSearch')?.value || '';
    const month = document.getElementById('feeMonth')?.value || '';
    const year = document.getElementById('feeYear')?.value || '';
    const class_name = document.getElementById('feeClass')?.value || '';
    const student_id = document.getElementById('feeStudent')?.value || '';
    const status = document.getElementById('feeStatus')?.value || 'all';

    const params = new URLSearchParams();
    if (search) params.append('q', search);
    if (month) params.append('month', month);
    if (year) params.append('year', year);
    if (class_name) params.append('class', class_name);
    if (student_id) params.append('student_id', student_id);
    if (status) params.append('status', status);

    try {
        const data = await fetchAPI(`/fees/report?${params.toString()}`);
        const fees = data.fees || [];
        if (fees.length === 0) {
            showAlert('No data to export.', 'error');
            return;
        }

        const headers = ['Student', 'Class', 'Fee Type', 'Month', 'Amount', 'Paid', 'Due Date', 'Paid Date', 'Status'];
        const rows = fees.map(f => [
            f.student_name,
            f.student_class || '',
            f.fee_type,
            f.month || '',
            f.amount,
            f.paid_amount,
            f.due_date || '',
            f.paid_date || '',
            f.status
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = `fees_${new Date().toISOString().slice(0,10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        showAlert('CSV exported successfully!', 'success');
    } catch (error) {
        showAlert('Export failed: ' + error.message, 'error');
    }
};
window.printFees = async function() {
    // Get current filter values
    const search = document.getElementById('feeSearch')?.value || '';
    const month = document.getElementById('feeMonth')?.value || '';
    const year = document.getElementById('feeYear')?.value || '';
    const class_name = document.getElementById('feeClass')?.value || '';
    const student_id = document.getElementById('feeStudent')?.value || '';
    const status = document.getElementById('feeStatus')?.value || 'all';

    const params = new URLSearchParams();
    if (search) params.append('q', search);
    if (month) params.append('month', month);
    if (year) params.append('year', year);
    if (class_name) params.append('class', class_name);
    if (student_id) params.append('student_id', student_id);
    if (status && status !== 'all') params.append('status', status);

    try {
        const data = await fetchAPI(`/fees/report?${params.toString()}`);
        const fees = data.fees || [];
        const summary = data.summary || {};

        if (fees.length === 0) {
            showAlert('No data to print.', 'error');
            return;
        }

        let rows = '';
        fees.forEach(f => {
            rows += `<tr>
                <td>${escapeHtml(f.student_name)}</td>
                <td>${escapeHtml(f.student_class || '-')}</td>
                <td>${escapeHtml(f.fee_type)}</td>
                <td style="text-align:right">PKR ${parseInt(f.amount || 0).toLocaleString()}</td>
                <td style="text-align:right">PKR ${parseInt(f.paid_amount || 0).toLocaleString()}</td>
                <td>${escapeHtml(f.status)}</td>
                <td>${f.due_date || '-'}</td>
                <td>${f.paid_date || '-'}</td>
            </tr>`;
        });

        printPreview(`
            <h3>Fees Report</h3>
            <p>
                <strong>Total:</strong> PKR ${summary.total_amount.toLocaleString()} |
                <strong>Collected:</strong> PKR ${summary.total_paid.toLocaleString()} |
                <strong>Unpaid:</strong> PKR ${summary.total_unpaid.toLocaleString()} |
                <strong>Records:</strong> ${summary.count}
            </p>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Student</th><th>Class</th><th>Fee Type</th>
                        <th>Amount</th><th>Paid</th><th>Status</th>
                        <th>Due Date</th><th>Paid Date</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `, 'Fees Report');
    } catch (error) {
        showAlert('Failed to print: ' + error.message, 'error');
    }
};

function addFeeRow(feeType = '', amount = '', paid = '0') {
    const container = document.getElementById('feeRowsContainer');
    const row = document.createElement('div');
    row.className = 'fee-row';
    row.style.cssText = 'display:flex; gap:8px; align-items:center; margin-bottom:6px;';
    row.innerHTML = `
        <select class="fee-type-select" style="flex:2; padding:6px;">
            <option value="Tuition Fee" ${feeType === 'Tuition Fee' ? 'selected' : ''}>Tuition Fee</option>
            <option value="Transport Fee" ${feeType === 'Transport Fee' ? 'selected' : ''}>Transport Fee</option>
            <option value="Exam Fee" ${feeType === 'Exam Fee' ? 'selected' : ''}>Exam Fee</option>
            <option value="Books Fee" ${feeType === 'Books Fee' ? 'selected' : ''}>Books Fee</option>
            <option value="Lab Fee" ${feeType === 'Lab Fee' ? 'selected' : ''}>Lab Fee</option>
            <option value="Other" ${feeType === 'Other' ? 'selected' : ''}>Other</option>
        </select>
        <input type="text" class="fee-custom-type" placeholder="Custom type" style="flex:1; display:${feeType === 'Other' ? 'inline' : 'none'}; padding:6px;">
        <input type="number" class="fee-amount" placeholder="Amount" step="0.01" style="flex:1; padding:6px;" value="${amount}">
        <input type="number" class="fee-paid" placeholder="Paid" step="0.01" style="flex:1; padding:6px;" value="${paid}">
        <button type="button" class="btn btn-danger btn-sm remove-fee-row" style="padding:2px 8px;">✕</button>
    `;
    container.appendChild(row);

    // Handle "Other" selection
    const select = row.querySelector('.fee-type-select');
    const customInput = row.querySelector('.fee-custom-type');
    select.addEventListener('change', function() {
        customInput.style.display = this.value === 'Other' ? 'inline' : 'none';
        if (this.value !== 'Other') customInput.value = '';
    });

    // Remove row
    row.querySelector('.remove-fee-row').addEventListener('click', function() {
        if (container.children.length > 1) {
            row.remove();
        } else {
            showAlert('At least one fee row is required.', 'warning');
        }
    });
}


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
window.printExpenses = async function() { const data = await fetchAPI('/expenses'); let rows=''; (data.expenses||[]).forEach(e=>{ rows+=`<tr><td>${e.date||'-'}</td><td>${escapeHtml(e.category)}</td><td>${escapeHtml(e.description||'-')}</td><td style="text-align:right">PKR ${e.amount.toLocaleString()}</td><td>${escapeHtml(e.payment_method||'-')}</td></tr>`; }); printPreview(`<h3>Expenses Report - Total: PKR ${data.total.toLocaleString()}</h3><table class="data-table"><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Payment Method</th></tr></thead><tbody>${rows}</tbody></table>`,'Expenses Report'); };// ============================================
// ============================================
// SETTINGS PAGE
// ============================================
async function loadSettings() {
    if (currentUser?.role !== 'admin') {
        showAlert('Admin access required', 'error');
        return;
    }
    
    try {
        const settings = await fetchAPI('/settings');
        
        const html = `
            <div class="page-header">
                <div class="page-title">School Settings</div>
                <div class="page-sub">Manage school configuration and preferences.</div>
            </div>
            <div class="card">
                <div class="card-title">General Settings</div>
                <form id="settingsForm" onsubmit="event.preventDefault(); saveSettings();">
                    <div class="form-grid">
                        <div class="form-group full">
                            <label for="schoolName">School Name</label>
                            <input type="text" id="schoolName" value="${escapeHtml(settings.school_name || 'Qamar Public High School')}" style="width:100%; padding:10px; border-radius:6px; border:1px solid #475569; background:#0f172a; color:#f8fafc;">
                        </div>
                    </div>
                    <div style="margin-top: 15px;">
                        <button type="submit" class="btn btn-primary">💾 Save Settings</button>
                        <button type="button" class="btn btn-ghost" onclick="loadPage('dashboard')">↩ Back</button>
                    </div>
                </form>
            </div>
            
            <div class="card" style="margin-top: 20px;">
                <div class="card-title">Fee Management</div>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <button onclick="generateMonthlyFees()" class="btn btn-primary">📋 Generate This Month's Fees</button>
                    <button onclick="carryForwardFees()" class="btn btn-warning">🔄 Carry Forward Unpaid Fees</button>
                </div>
                <div id="feeActionResult" style="margin-top: 10px;"></div>
            </div>
        `;
        document.getElementById('page-content').innerHTML = html;
    } catch (error) {
        console.error('Settings error:', error);
        document.getElementById('page-content').innerHTML = `
            <div class="page-header">
                <div class="page-title">School Settings</div>
                <div class="page-sub">Manage school configuration and preferences.</div>
            </div>
            <div class="card">
                <div class="card-title">Error Loading Settings</div>
                <div style="padding: 20px; color: #f87171;">
                    <p>⚠️ Could not load settings. Please check your connection and try again.</p>
                    <p style="font-size: 13px; color: #94a3b8; margin-top: 10px;">Error: ${escapeHtml(error.message)}</p>
                    <button onclick="loadSettings()" class="btn btn-primary" style="margin-top: 15px;">🔄 Retry</button>
                </div>
            </div>
        `;
    }
}

// Save Settings
window.saveSettings = async function() {
    const schoolName = document.getElementById('schoolName').value.trim();
    if (!schoolName) {
        showAlert('School name is required', 'error');
        return;
    }
    
    try {
        await fetchAPI('/settings', {
            method: 'POST',
            body: JSON.stringify({ school_name: schoolName })
        });
        SCHOOL_NAME = schoolName;  // ✅ Update global variable
        showAlert('Settings saved successfully!', 'success');
    } catch (error) {
        showAlert('Failed to save settings: ' + error.message, 'error');
    }
};

// Generate Monthly Fees
window.generateMonthlyFees = async function() {
    try {
        const result = await fetchAPI('/fees/generate', { method: 'POST' });
        document.getElementById('feeActionResult').innerHTML = `
            <div class="alert alert-success">✅ ${result.message}</div>
        `;
        showAlert(result.message, 'success');
    } catch (error) {
        document.getElementById('feeActionResult').innerHTML = `
            <div class="alert alert-error">❌ ${error.message}</div>
        `;
        showAlert('Failed to generate fees', 'error');
    }
};

// Carry Forward Unpaid Fees
window.carryForwardFees = async function() {
    try {
        const result = await fetchAPI('/fees/carry-forward', { method: 'POST' });
        document.getElementById('feeActionResult').innerHTML = `
            <div class="alert alert-success">✅ ${result.message}</div>
        `;
        showAlert(result.message, 'success');
    } catch (error) {
        document.getElementById('feeActionResult').innerHTML = `
            <div class="alert alert-error">❌ ${error.message}</div>
        `;
        showAlert('Failed to carry forward fees', 'error');
    }
};