// ============================================
// PROMOTIONS.JS — Student Promotion / Year Rollover.
// Four tabs: Run Promotion (setup + roster + decisions), History
// (past batches, view detail, undo), Find (search every promotion
// record ever created, across all batches), and Help (quick reference).
// Reuses fetchAPI / escapeHtml / showAlert / printPreview from common.js.
// ============================================

let currentPromotionTab = 'run';
let promotionRoster = [];      // current class roster with per-student decisions
let promotionFromClass = '';
let promotionClassesCache = [];
let promotionHistoryCache = []; // last-loaded batches, for client-side filtering

const PROMOTION_TABS = [
    { key: 'run', label: '🎓 Run Promotion' },
    { key: 'history', label: '🕘 History' },
    { key: 'find', label: '🔍 Find' },
    { key: 'help', label: '❓ Help' },
];

const PROMOTION_DECISION_BADGE = {
    Promoted: 'badge-green',
    Retained: 'badge-yellow',
    Graduated: 'badge-blue',
    Left: 'badge-red',
};

async function loadPromotions() {
    const html = `
        <div class="page-header">
            <div class="page-title">Student Promotion</div>
            <div class="page-sub">Promote a class to the next grade at year-end, or record retentions, graduations and withdrawals.</div>
        </div>
        <div class="toolbar no-print" style="flex-wrap:wrap;">
            ${PROMOTION_TABS.map(t => `<button onclick="switchPromotionTab('${t.key}')" id="promoTab_${t.key}" class="btn ${t.key === currentPromotionTab ? 'btn-primary' : 'btn-ghost'} btn-sm">${t.label}</button>`).join('')}
        </div>
        <div id="promotionTabContent"><div class="loading">Loading…</div></div>
    `;
    document.getElementById('page-content').innerHTML = html;
    await switchPromotionTab(currentPromotionTab);
}

window.switchPromotionTab = async function (tab) {
    currentPromotionTab = tab;
    PROMOTION_TABS.forEach(t => {
        const btn = document.getElementById(`promoTab_${t.key}`);
        if (btn) btn.className = `btn ${t.key === tab ? 'btn-primary' : 'btn-ghost'} btn-sm`;
    });
    const box = document.getElementById('promotionTabContent');
    box.innerHTML = '<div class="loading">Loading…</div>';
    try {
        if (tab === 'run') await renderRunPromotionTab(box);
        else if (tab === 'history') await renderPromotionHistoryTab(box);
        else if (tab === 'find') await renderPromotionFindTab(box);
        else await renderPromotionHelpTab(box);
    } catch (e) {
        console.error(e);
        box.innerHTML = '<div class="loading">Failed to load this tab.</div>';
    }
};

// ============================================
// TAB 1: RUN PROMOTION
// ============================================
async function renderRunPromotionTab(box) {
    const data = await fetchAPI('/promotions/classes');
    promotionClassesCache = data.classes || [];

    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <h3 style="margin:0 0 10px 0;">Step 1: Select Class</h3>
            <div class="form-grid">
                <div class="form-group">
                    <label for="promoFromClass">From Class *</label>
                    <select id="promoFromClass" onchange="loadPromotionRoster()">
                        <option value="">Select class</option>
                        ${promotionClassesCache.map(c => `<option value="${escapeHtml(c.class_name)}">${escapeHtml(c.class_name)} (${c.student_count} active)</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label for="promoToClass">Promote To (default) *</label>
                    <select id="promoToClass">
                        <option value="">Select class</option>
                        ${promotionClassesCache.map(c => `<option value="${escapeHtml(c.class_name)}">${escapeHtml(c.class_name)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label for="promoFromYear">From Academic Year</label>
                    <input type="text" id="promoFromYear" placeholder="e.g. 2025-2026">
                </div>
                <div class="form-group">
                    <label for="promoToYear">To Academic Year *</label>
                    <input type="text" id="promoToYear" placeholder="e.g. 2026-2027">
                </div>
                <div class="form-group full">
                    <label for="promoRemarks">Batch Remarks</label>
                    <input type="text" id="promoRemarks" placeholder="Optional note about this promotion run">
                </div>
            </div>
        </div>
        <div id="promotionRosterCard"></div>
    `;
}

window.loadPromotionRoster = async function () {
    const fromClass = document.getElementById('promoFromClass').value;
    const rosterCard = document.getElementById('promotionRosterCard');
    promotionFromClass = fromClass;

    if (!fromClass) { rosterCard.innerHTML = ''; return; }

    rosterCard.innerHTML = '<div class="loading">Loading roster…</div>';
    try {
        const data = await fetchAPI(`/promotions/preview?from_class=${encodeURIComponent(fromClass)}`);
        promotionRoster = (data.students || []).map(s => ({
            student_id: s.id,
            student_name: s.name,
            decision: 'Promoted',
            to_class: data.suggested_to_class || '',
            remarks: '',
        }));

        if (data.suggested_to_class) {
            const toSelect = document.getElementById('promoToClass');
            if (toSelect && !toSelect.value) toSelect.value = data.suggested_to_class;
        }

        renderPromotionRosterTable(rosterCard, data.count);
    } catch (e) {
        console.error(e);
        rosterCard.innerHTML = '<div class="loading">Failed to load roster.</div>';
    }
};

function renderPromotionRosterTable(rosterCard, count) {
    if (!promotionRoster.length) {
        rosterCard.innerHTML = `<div class="card"><p>No active students found in this class.</p></div>`;
        return;
    }
    rosterCard.innerHTML = `
        <div class="card">
            <div class="toolbar">
                <h3 style="margin:0;">Step 2: Review Students (${count})</h3>
                <div class="search-wrap"><input type="text" id="promoRosterSearch" placeholder="Find student in this class..." onkeyup="filterPromotionRoster()"></div>
                <button onclick="setAllPromotionDecisions('Promoted')" class="btn btn-ghost btn-sm">Mark All Promoted</button>
                <button onclick="runPromotionBatch()" class="btn btn-primary">✅ Run Promotion</button>
            </div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>Student</th><th>Decision</th><th>To Class</th><th>Remarks</th></tr></thead>
                    <tbody id="promotionRosterBody">
                        ${promotionRoster.map((r, i) => `
                            <tr data-roster-row="${i}" data-search="${escapeHtml((r.student_id + ' ' + r.student_name).toLowerCase())}">
                                <td><a href="#" onclick="event.preventDefault(); showStudentQuickView('${escapeHtml(r.student_id)}')" style="color:var(--accent); cursor:pointer;" title="View student">${escapeHtml(r.student_id)} — ${escapeHtml(r.student_name)}</a></td>
                                <td>
                                    <select onchange="updatePromotionDecision(${i}, this.value)">
                                        <option value="Promoted" ${r.decision === 'Promoted' ? 'selected' : ''}>Promoted</option>
                                        <option value="Retained" ${r.decision === 'Retained' ? 'selected' : ''}>Retained</option>
                                        <option value="Graduated" ${r.decision === 'Graduated' ? 'selected' : ''}>Graduated</option>
                                        <option value="Left" ${r.decision === 'Left' ? 'selected' : ''}>Left</option>
                                    </select>
                                </td>
                                <td>
                                    <input type="text" value="${escapeHtml(r.to_class || '')}"
                                        id="promoToClassRow_${i}"
                                        ${r.decision === 'Promoted' ? '' : 'disabled'}
                                        onchange="promotionRoster[${i}].to_class = this.value">
                                </td>
                                <td><input type="text" placeholder="Optional" onchange="promotionRoster[${i}].remarks = this.value"></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

window.filterPromotionRoster = function () {
    const keyword = (document.getElementById('promoRosterSearch')?.value || '').trim().toLowerCase();
    document.querySelectorAll('#promotionRosterBody tr[data-search]').forEach(row => {
        row.style.display = row.dataset.search.includes(keyword) ? '' : 'none';
    });
};

window.updatePromotionDecision = function (index, decision) {
    promotionRoster[index].decision = decision;
    if (decision === 'Retained') {
        promotionRoster[index].to_class = promotionFromClass;
    } else if (decision === 'Graduated' || decision === 'Left') {
        promotionRoster[index].to_class = '';
    } else if (!promotionRoster[index].to_class) {
        promotionRoster[index].to_class = document.getElementById('promoToClass')?.value || '';
    }
    const input = document.getElementById(`promoToClassRow_${index}`);
    if (input) {
        input.value = promotionRoster[index].to_class || '';
        input.disabled = decision !== 'Promoted';
    }
};

window.setAllPromotionDecisions = function (decision) {
    const defaultToClass = document.getElementById('promoToClass')?.value || '';
    promotionRoster.forEach((r, i) => {
        r.decision = decision;
        r.to_class = decision === 'Promoted' ? (r.to_class || defaultToClass) : (decision === 'Retained' ? promotionFromClass : '');
    });
    const rosterCard = document.getElementById('promotionRosterCard');
    renderPromotionRosterTable(rosterCard, promotionRoster.length);
};

window.runPromotionBatch = async function () {
    const toClass = document.getElementById('promoToClass').value;
    const toYear = document.getElementById('promoToYear').value.trim();
    const fromYear = document.getElementById('promoFromYear').value.trim();
    const remarks = document.getElementById('promoRemarks').value.trim();

    if (!promotionFromClass) { showAlert('Select a class first', 'error'); return; }
    if (!toYear) { showAlert('To Academic Year is required', 'error'); return; }
    if (!promotionRoster.length) { showAlert('No students to promote', 'error'); return; }

    const promotedWithoutClass = promotionRoster.some(r => r.decision === 'Promoted' && !(r.to_class || toClass));
    if (promotedWithoutClass) { showAlert('Set a "To Class" for every Promoted student (or a default To Class above)', 'error'); return; }

    if (!confirm(`Run promotion for ${promotionRoster.length} student(s) from "${promotionFromClass}"? This updates their class/status immediately.`)) return;

    const payload = {
        from_class: promotionFromClass,
        to_class: toClass,
        from_academic_year: fromYear,
        to_academic_year: toYear,
        remarks: remarks,
        decisions: promotionRoster.map(r => ({
            student_id: r.student_id,
            student_name: r.student_name,
            decision: r.decision,
            to_class: r.to_class,
            remarks: r.remarks,
        })),
    };

    try {
        const res = await fetchAPI('/promotions/run', { method: 'POST', body: JSON.stringify(payload) });
        showAlert(`Promotion completed — ${res.batch.total_students} student(s) processed`);
        promotionRoster = [];
        document.getElementById('promotionRosterCard').innerHTML = '';
        document.getElementById('promoFromClass').value = '';
        await switchPromotionTab('history');
    } catch (e) {
        console.error(e);
    }
};

// ============================================
// TAB 2: HISTORY
// ============================================
async function renderPromotionHistoryTab(box) {
    const data = await fetchAPI('/promotions/batches');
    promotionHistoryCache = data.batches || [];

    box.innerHTML = `
        <div class="card">
            <div class="toolbar">
                <div class="search-wrap"><input type="text" id="promoHistorySearch" placeholder="Find by class, year or status..." onkeyup="filterPromotionHistory()"></div>
            </div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>Date</th><th>From Class</th><th>To Class</th><th>Academic Year</th><th>Students</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody id="promotionHistoryBody">
                        ${renderPromotionHistoryRows(promotionHistoryCache)}
                    </tbody>
                </table>
            </div>
        </div>
        <div id="promotionBatchDetail"></div>
    `;
}

function renderPromotionHistoryRows(batches) {
    if (!batches.length) return '<tr><td colspan="7" style="text-align:center;">No promotion batches yet.</td></tr>';
    return batches.map(b => `
        <tr data-search="${escapeHtml(((b.from_class || '') + ' ' + (b.to_class || '') + ' ' + (b.from_academic_year || '') + ' ' + (b.to_academic_year || '') + ' ' + (b.status || '')).toLowerCase())}">
            <td>${(b.promotion_date || '-').split(' ')[0]}</td>
            <td>${escapeHtml(b.from_class || '-')}</td>
            <td>${escapeHtml(b.to_class || '-')}</td>
            <td>${escapeHtml(b.from_academic_year || '-')} → ${escapeHtml(b.to_academic_year || '-')}</td>
            <td>${b.total_students} <span style="color:var(--muted, #888)">(${b.promoted_count}P / ${b.retained_count}R / ${b.graduated_count}G / ${b.left_count}L)</span></td>
            <td><span class="badge ${b.status === 'Undone' ? 'badge-red' : 'badge-green'}">${escapeHtml(b.status)}</span></td>
            <td class="actions">
                <button onclick="viewPromotionBatch(${b.id})" class="btn btn-ghost btn-sm">👁 View</button>
                ${b.status !== 'Undone' ? `<button onclick="undoPromotionBatch(${b.id})" class="btn btn-danger btn-sm">↩ Undo</button>` : ''}
            </td>
        </tr>
    `).join('');
}

window.filterPromotionHistory = function () {
    const keyword = (document.getElementById('promoHistorySearch')?.value || '').trim().toLowerCase();
    document.querySelectorAll('#promotionHistoryBody tr[data-search]').forEach(row => {
        row.style.display = row.dataset.search.includes(keyword) ? '' : 'none';
    });
};

window.viewPromotionBatch = async function (batchId) {
    const detailBox = document.getElementById('promotionBatchDetail');
    detailBox.innerHTML = '<div class="loading">Loading…</div>';
    try {
        const data = await fetchAPI(`/promotions/batches/${batchId}`);
        const b = data.batch;
        detailBox.innerHTML = `
            <div class="card" style="margin-top:16px;">
                <div class="toolbar">
                    <h3 style="margin:0;">Batch #${b.id} — ${escapeHtml(b.from_class)} → ${escapeHtml(b.to_class || '-')}</h3>
                    <button onclick="printPromotionBatch(${b.id})" class="btn btn-ghost btn-sm">🖨 Print</button>
                </div>
                ${b.remarks ? `<p><strong>Remarks:</strong> ${escapeHtml(b.remarks)}</p>` : ''}
                <div class="table-wrap">
                    <table class="data-table">
                        <thead><tr><th>Student</th><th>From</th><th>To</th><th>Decision</th><th>Remarks</th></tr></thead>
                        <tbody>
                            ${(b.records || []).map(r => `
                                <tr>
                                    <td>${escapeHtml(r.student_id)} — ${escapeHtml(r.student_name || '')}</td>
                                    <td>${escapeHtml(r.from_class || '-')}</td>
                                    <td>${escapeHtml(r.to_class || '-')}</td>
                                    <td><span class="badge ${PROMOTION_DECISION_BADGE[r.decision] || 'badge-blue'}">${escapeHtml(r.decision)}</span></td>
                                    <td>${escapeHtml(r.remarks || '-')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        detailBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
        console.error(e);
        detailBox.innerHTML = '<div class="loading">Failed to load batch detail.</div>';
    }
};

window.undoPromotionBatch = async function (batchId) {
    if (!confirm('Undo this promotion batch? Every student in it will be reverted to their previous class/status.')) return;
    try {
        await fetchAPI(`/promotions/batches/${batchId}/undo`, { method: 'POST' });
        showAlert('Promotion batch undone');
        await switchPromotionTab('history');
    } catch (e) {
        console.error(e);
    }
};

window.printPromotionBatch = async function (batchId) {
    try {
        const data = await fetchAPI(`/promotions/batches/${batchId}`);
        const b = data.batch;
        const rows = (b.records || []).map(r => `
            <tr>
                <td>${escapeHtml(r.student_id)}</td>
                <td>${escapeHtml(r.student_name || '')}</td>
                <td>${escapeHtml(r.from_class || '-')}</td>
                <td>${escapeHtml(r.to_class || '-')}</td>
                <td>${escapeHtml(r.decision)}</td>
            </tr>
        `).join('');
        const content = `
            <h3>Promotion Batch #${b.id} — ${escapeHtml(b.from_class)} to ${escapeHtml(b.to_class || '-')}</h3>
            <p><strong>Academic Year:</strong> ${escapeHtml(b.from_academic_year || '-')} → ${escapeHtml(b.to_academic_year || '-')}</p>
            <p><strong>Total Students:</strong> ${b.total_students}</p>
            <table class="data-table">
                <thead><tr><th>ID</th><th>Name</th><th>From</th><th>To</th><th>Decision</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        `;
        printPreview(content, `Promotion Batch #${b.id}`);
    } catch (e) {
        console.error(e);
        showAlert('Failed to print batch', 'error');
    }
};

// ============================================
// TAB 3: FIND — search every promotion record ever created, across
// every batch, by student ID/name or from/to class. Answers "when
// (and from/to which class) was this student promoted?" without
// having to remember or scroll through the batch history.
// ============================================
async function renderPromotionFindTab(box) {
    box.innerHTML = `
        <div class="card">
            <h3 style="margin:0 0 10px 0;">Find a Student's Promotion History</h3>
            <p style="margin:0 0 12px 0; color:var(--muted, #94a3b8); font-size:13px;">Search by Student ID, name, or class name (e.g. "STU-905", "Ahmed", or "Grade 9-A") to see every promotion decision ever recorded for a match, across all batches.</p>
            <div class="toolbar">
                <div class="search-wrap"><input type="text" id="promoFindInput" placeholder="Search student ID, name, or class..." onkeyup="if(event.key==='Enter') runPromotionFind();"></div>
                <button onclick="runPromotionFind()" class="btn btn-primary btn-sm">🔍 Search</button>
            </div>
            <div id="promotionFindResults"></div>
        </div>
    `;
    document.getElementById('promoFindInput').focus();
}

window.runPromotionFind = async function () {
    const q = document.getElementById('promoFindInput').value.trim();
    const resultsBox = document.getElementById('promotionFindResults');
    if (!q) { resultsBox.innerHTML = '<p>Type something to search.</p>'; return; }

    resultsBox.innerHTML = '<div class="loading">Searching…</div>';
    try {
        const data = await fetchAPI(`/promotions/search?q=${encodeURIComponent(q)}`);
        const records = data.records || [];
        if (!records.length) {
            resultsBox.innerHTML = `<p>No promotion records found for "${escapeHtml(q)}".</p>`;
            return;
        }
        resultsBox.innerHTML = `
            <div class="table-wrap" style="margin-top:12px;">
                <table class="data-table">
                    <thead><tr><th>Date</th><th>Student</th><th>From</th><th>To</th><th>Decision</th><th>Academic Year</th><th>Batch</th></tr></thead>
                    <tbody>
                        ${records.map(r => `
                            <tr>
                                <td>${(r.created_at || '-').split(' ')[0]}</td>
                                <td>${escapeHtml(r.student_id)} — ${escapeHtml(r.student_name || '')}</td>
                                <td>${escapeHtml(r.from_class || '-')}</td>
                                <td>${escapeHtml(r.to_class || '-')}</td>
                                <td><span class="badge ${PROMOTION_DECISION_BADGE[r.decision] || 'badge-blue'}">${escapeHtml(r.decision)}</span></td>
                                <td>${escapeHtml(r.from_academic_year || '-')} → ${escapeHtml(r.to_academic_year || '-')}</td>
                                <td>
                                    <button onclick="jumpToPromotionBatch(${r.batch_id})" class="btn btn-ghost btn-sm">Batch #${r.batch_id} ${r.batch_status === 'Undone' ? ' (Undone)' : ''}</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (e) {
        console.error(e);
        resultsBox.innerHTML = '<p>Search failed.</p>';
    }
};

window.jumpToPromotionBatch = async function (batchId) {
    await switchPromotionTab('history');
    await viewPromotionBatch(batchId);
};

// ============================================
// TAB 4: HELP — quick in-module reference. The same content is also
// registered as a topic on the main Help & User Guide page (see
// help.js) for people who browse help from there instead.
// ============================================
async function renderPromotionHelpTab(box) {
    box.innerHTML = `
        <div class="card" style="line-height:1.7;">
            <h3 style="margin-top:0; color:#38bdf8;">How Student Promotion works</h3>

            <h4 style="margin-bottom:4px;">1. Run Promotion</h4>
            <p style="margin-top:0;">Pick a <strong>From Class</strong> — its currently Active students load automatically. Pick a default <strong>Promote To</strong> class (the system suggests the next grade level for you) and a <strong>To Academic Year</strong>. For each student, choose a decision:</p>
            <ul>
                <li><span class="badge badge-green">Promoted</span> — moves to the "To Class" (per-student, editable if a student needs a different section).</li>
                <li><span class="badge badge-yellow">Retained</span> — stays in the same class for another year.</li>
                <li><span class="badge badge-blue">Graduated</span> — completed their final class; marked Graduated and removed from active classes.</li>
                <li><span class="badge badge-red">Left</span> — withdrawn/transferred out; marked Left.</li>
            </ul>
            <p>Use the search box above the roster to quickly find one student in a large class. Click <strong>✅ Run Promotion</strong> to apply all decisions at once.</p>
            <p><strong>Roll Numbers:</strong> any class that ends up with active students because of this run (a destination class for Promoted or Retained students) automatically gets its Roll Numbers re-assigned 1..N alphabetically — no separate step needed.</p>

            <h4 style="margin-bottom:4px;">2. History</h4>
            <p style="margin-top:0;">Every promotion run is saved as a batch. Search/filter the list by class, academic year, or status, then <strong>👁 View</strong> a batch to see every student's individual decision, or <strong>🖨 Print</strong> it for record-keeping.</p>

            <h4 style="margin-bottom:4px;">↩ Undo</h4>
            <p style="margin-top:0;">Made a mistake? Click <strong>↩ Undo</strong> on any batch that hasn't already been undone — every student in that batch is reverted to exactly the class/status they had before. A batch can only be undone once.</p>

            <h4 style="margin-bottom:4px;">3. Find</h4>
            <p style="margin-top:0;">Search across <em>every</em> promotion batch ever run — by Student ID, name, or class — to answer "when was this student promoted, and from/to which class?" without hunting through History manually. Click a result's batch button to jump straight to that batch's full detail.</p>

            <p style="margin-top:16px; color:var(--muted, #94a3b8); font-size:13px;"><strong>Note:</strong> Running a promotion and undoing a batch both require an Admin account. Teachers and Viewers can browse History and Find, but can't run or undo a promotion.</p>
        </div>
    `;
}
