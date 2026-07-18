// ============================================
// SETTINGS.JS — Settings page, monthly fee
// generation, and unpaid-fee carry-forward.
// ============================================

// ============================================
// SETTINGS PAGE
// ============================================
async function loadLicenseInfoBox() {
    const box = document.getElementById('licenseInfoBox');
    if (!box) return;
    try {
        const response = await fetch(`${API_BASE}/license-status`, { credentials: 'include' });
        const data = await response.json();

        const statusBadge = data.valid
            ? (data.days_remaining !== null && data.days_remaining <= 15
                ? '<span class="badge badge-yellow">Expiring Soon</span>'
                : '<span class="badge badge-green">Active</span>')
            : '<span class="badge badge-red">' + (data.expired ? 'Expired' : 'Invalid') + '</span>';

        box.innerHTML = `
            <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:14px; font-size:14px;">
                <div><span style="color:var(--muted);">Status:</span> ${statusBadge}</div>
                <div><span style="color:var(--muted);">Expiry Date:</span> ${escapeHtml(data.expiry_date || 'Perpetual (no expiry)')}</div>
                ${data.days_remaining !== null ? `<div><span style="color:var(--muted);">Days Remaining:</span> ${data.days_remaining}</div>` : ''}
            </div>
            <div style="margin-top:10px; font-size:13px; color:var(--muted);">${escapeHtml(data.message || '')}</div>
        `;
    } catch (e) {
        box.innerHTML = '<div style="color:var(--muted); font-size:13px;">Unable to load license status.</div>';
    }
}

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

            <div class="card" style="margin-top: 20px;">
                <div class="card-title">Notifications</div>
                <div class="form-group" style="margin-top:10px;">
                    <label style="display:flex; align-items:center; gap:10px;">
                        <input type="checkbox" id="smsAlertsToggle" ${settings.sms_alerts_enabled === 'true' ? 'checked' : ''}>
                        Enable SMS Alerts for Absences
                    </label>
                    <div style="font-size:12px; color:#94a3b8;">Sends an SMS to parents when a student is marked Absent or Late.</div>
                </div>
                <button onclick="saveSmsSetting()" class="btn btn-ghost btn-sm" style="margin-top:8px;">Save SMS Setting</button>
            </div>
            <div class="card" style="margin-top: 20px;">
                <div class="card-title">🤖 AI Configuration</div>
                <div style="font-size:12px; color:#94a3b8; margin-bottom:12px;">
                    Powers the AI Tools module (Question Paper Generator, and more). Add an API key for one provider below.
                    If no key is set, or a request fails, AI Tools automatically fall back to offline/local generation — no internet or key required.
                </div>
                <div id="aiSettingsBox"><div class="loading">Loading…</div></div>
            </div>
            <div class="card" style="margin-top: 20px;">
                <div class="card-title">License</div>
                <div id="licenseInfoBox">Loading…</div>
            </div>
        `;
        document.getElementById('page-content').innerHTML = html;
        loadLicenseInfoBox();
        loadAiSettingsBox();
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

async function loadAiSettingsBox() {
    const box = document.getElementById('aiSettingsBox');
    if (!box) return;
    try {
        const s = await fetchAPI('/settings/ai');
        const providers = [
            { key: 'openai', label: 'OpenAI', placeholder: 'sk-...', model: 'gpt-4o-mini' },
            { key: 'gemini', label: 'Google Gemini', placeholder: 'AIza...', model: 'gemini-2.0-flash' },
            { key: 'anthropic', label: 'Anthropic Claude', placeholder: 'sk-ant-...', model: 'claude-3-5-sonnet-latest' },
        ];
        box.innerHTML = `
            <div class="form-group" style="margin-bottom:14px;">
                <label for="aiProvider">Active Provider</label>
                <select id="aiProvider" style="width:100%; max-width:260px; padding:10px; border-radius:6px; border:1px solid #475569; background:#0f172a; color:#f8fafc;" onchange="renderAiProviderFields()">
                    <option value="">None (offline/local only)</option>
                    ${providers.map(p => `<option value="${p.key}" ${s.ai_provider === p.key ? 'selected' : ''}>${p.label}</option>`).join('')}
                </select>
            </div>
            <div id="aiProviderFields">
                ${providers.map(p => `
                    <div class="ai-provider-field" data-provider="${p.key}" style="display:${s.ai_provider === p.key ? 'grid' : 'none'}; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:10px;">
                        <div class="form-group">
                            <label>${p.label} API Key ${s[`ai_api_key_${p.key}_set`] ? `<span style="color:#4ade80;">(set — ${escapeHtml(s[`ai_api_key_${p.key}_hint`] || '')})</span>` : ''}</label>
                            <input type="password" id="aiKey_${p.key}" placeholder="${s[`ai_api_key_${p.key}_set`] ? 'Leave blank to keep current key' : p.placeholder}" style="width:100%; padding:10px; border-radius:6px; border:1px solid #475569; background:#0f172a; color:#f8fafc;">
                        </div>
                        <div class="form-group">
                            <label>Model</label>
                            <input type="text" id="aiModel_${p.key}" value="${escapeHtml(s[`ai_model_${p.key}`] || '')}" placeholder="${p.model}" style="width:100%; padding:10px; border-radius:6px; border:1px solid #475569; background:#0f172a; color:#f8fafc;">
                        </div>
                    </div>
                `).join('')}
            </div>
            <button onclick="saveAiSettings()" class="btn btn-primary btn-sm" style="margin-top:6px;">💾 Save AI Settings</button>
        `;
    } catch (e) {
        box.innerHTML = '<div style="color:#94a3b8; font-size:13px;">Unable to load AI settings.</div>';
    }
}

window.renderAiProviderFields = function () {
    const selected = document.getElementById('aiProvider')?.value || '';
    document.querySelectorAll('.ai-provider-field').forEach(el => {
        el.style.display = el.dataset.provider === selected ? 'grid' : 'none';
    });
};

window.saveAiSettings = async function () {
    const provider = document.getElementById('aiProvider')?.value || '';
    const payload = { ai_provider: provider };
    ['openai', 'gemini', 'anthropic'].forEach(p => {
        const key = document.getElementById(`aiKey_${p}`)?.value;
        if (key) payload[`ai_api_key_${p}`] = key;
        payload[`ai_model_${p}`] = document.getElementById(`aiModel_${p}`)?.value || '';
    });
    try {
        await fetchAPI('/settings/ai', { method: 'POST', body: JSON.stringify(payload) });
        showAlert('AI settings saved', 'success');
        await loadAiSettingsBox();
    } catch (e) {
        showAlert('Failed to save AI settings: ' + e.message, 'error');
    }
};

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

// Save SMS Alerts Setting
window.saveSmsSetting = async function() {
    const enabled = document.getElementById('smsAlertsToggle').checked;
    try {
        await fetchAPI('/settings/sms', {
            method: 'POST',
            body: JSON.stringify({ enabled })
        });
        showAlert('SMS setting saved', 'success');
    } catch (e) {
        showAlert('Failed to save SMS setting', 'error');
    }
};
