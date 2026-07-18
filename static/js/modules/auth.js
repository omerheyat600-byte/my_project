// ============================================
// AUTH.JS — Login, session/auth state, logout,
// and role-based menu visibility.
// ============================================

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

