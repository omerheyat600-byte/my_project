// ============================================
// NAVIGATION.JS — SPA page routing (loadPage),
// results printing helpers, and result-card
// theme selector wiring.
// ============================================

// ==================== NAVIGATION ====================
let currentPage = 'dashboard';
let charts = {};

// ==================== SIDEBAR MENU SEARCH ====================
// Lightweight client-side filter over the sidebar's own nav links —
// separate from the topbar's Global Search, which searches data
// records (students, fees, etc.) rather than menu items.
window.filterSidebarNav = function(query) {
    const q = (query || '').trim().toLowerCase();
    const nav = document.getElementById('sidebarNav');
    if (!nav) return;
    let anyVisible = false;
    nav.querySelectorAll('.nav-item').forEach(item => {
        const matches = !q || item.textContent.toLowerCase().includes(q);
        item.style.display = matches ? '' : 'none';
        if (matches) anyVisible = true;
    });
    let hint = document.getElementById('sidebarSearchNoMatch');
    if (!q || anyVisible) {
        if (hint) hint.style.display = 'none';
    } else {
        if (!hint) {
            hint = document.createElement('div');
            hint.id = 'sidebarSearchNoMatch';
            hint.style.cssText = 'padding:8px 14px; font-size:12px; color:var(--muted,#94a3b8);';
            hint.textContent = 'No matching menu items.';
            nav.appendChild(hint);
        }
        hint.style.display = 'block';
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    const isAuth = await checkAuth();
    const overlay = document.getElementById('loginOverlay');
    if (!isAuth) {
        overlay.style.display = 'flex';
        return;
    }
    overlay.style.display = 'none';

    if (currentUser) {
        showUserInfo(currentUser);
        updateMenuByRole(currentUser.role);
    }

    checkLicenseBanner();

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

async function checkLicenseBanner() {
    try {
        const response = await fetch(`${API_BASE}/license-status`, { credentials: 'include' });
        const data = await response.json();

        const expiryLabel = document.getElementById('licenseExpiryLabel');
        if (expiryLabel) {
            if (data.expiry_date) {
                expiryLabel.textContent = `License valid until: ${data.expiry_date}`;
                expiryLabel.title = data.message || '';
            } else if (data.valid) {
                expiryLabel.textContent = 'Perpetual license';
                expiryLabel.title = '';
            } else {
                expiryLabel.textContent = '';
            }
        }

        const banner = document.getElementById('licenseBanner');
        if (!banner) return;
        if (data.valid && data.days_remaining !== null && data.days_remaining <= 15) {
            banner.textContent = `⚠️ ${data.message}`;
            banner.style.display = 'block';
        } else {
            banner.style.display = 'none';
        }
    } catch (e) {
        // Non-critical — don't block the UI if this check fails
    }
}

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
        case 'promotions': await loadPromotions(); break;
        case 'admissions': await loadAdmissions(); break;
        case 'teachers': await loadTeachers(); break;
        case 'classes': await loadClasses(); break;
        case 'attendance': await loadAttendance(); break;
        case 'staff-attendance': await loadStaffAttendance(); break;
        case 'timetable': await loadTimetable(); break;
        case 'notifications': await loadNotifications(); break;
        case 'results': await loadResults(); break;
        case 'examination': await loadExamination(); break;
        case 'fees': await loadFees(); break;
        case 'expenses': await loadExpenses(); break;
        case 'accounts': await loadAccounts(); break;
        case 'hr': await loadHR(); break;
        case 'users': await loadUsers(); break;
        case 'parent-accounts': await loadParentAccounts(); break;
        case 'library': await loadLibrary(); break;
        case 'inventory': await loadInventory(); break;
        case 'id-cards': await loadIdCards(); break;
       case 'reports':await loadReports();break;
        case 'ai-tools': await loadAiTools(); break;
        case 'settings': await loadSettings(); break;
        case 'backup': await loadBackup(); break;
        case 'import-data': await loadImportData(); break;
        case 'help': await loadHelp(); break;
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


