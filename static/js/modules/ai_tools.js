// ============================================
// AI_TOOLS.JS — AI Features module.
// Built so far: 📝 AI Question Paper Generator, 💬 Report Card Remarks.
// The rest of the requested AI Features (Timetable
// Generator, Lesson Planner, Performance Analysis,
// Fee Prediction, Attendance Risk Prediction) are
// wired in as placeholder tabs, ready to be filled
// in one by one.
// ============================================

let currentAiTab = 'qpaper';
let aiQpSections = [{ type: 'MCQ', count: 5, marks_each: 1, topics: '', difficulty: 'Medium' }];
let aiLastGeneratedPaper = null;
let aiClassesCache = [];

// Report Card Remarks tab state
let remarksCtx = { classId: '', term: 'Term 1', year: String(new Date().getFullYear()), examId: null, tone: 'encouraging', mode: 'auto' };
let remarksData = null;

const AI_TABS = [
    { key: 'qpaper', label: '📝 Question Paper Generator', ready: true },
    { key: 'qbank', label: '🗂️ Question Bank', ready: true },
    { key: 'papers', label: '📄 Saved Papers', ready: true },
    { key: 'remarks', label: '💬 Report Card Remarks', ready: true },
    { key: 'timetable-ai', label: '🗓️ Timetable Generator', ready: true },
    { key: 'lesson', label: '📋 Lesson Planner', ready: true },
    { key: 'performance', label: '📈 Performance Analysis', ready: true },
    { key: 'fee-predict', label: '💰 Fee Prediction', ready: true },
    { key: 'attendance-risk', label: '⚠️ Attendance Risk', ready: true },
];

const AI_QUESTION_TYPES = ['MCQ', 'Short Answer', 'Long Answer', 'Fill in the Blanks', 'True/False'];
const AI_DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

// ==================== PAGE ENTRY ====================
async function loadAiTools() {
    document.getElementById('page-content').innerHTML = `
        <div class="page-header">
            <div class="page-title">🤖 AI Tools</div>
            <div class="page-sub">AI-assisted features for teachers and admins — works with a configured AI key (Settings → AI Configuration) or fully offline.</div>
        </div>
        <div class="toolbar no-print" style="flex-wrap:wrap;">
            ${AI_TABS.map(t => `<button onclick="switchAiTab('${t.key}')" id="aiTab_${t.key}" class="btn ${t.key === currentAiTab ? 'btn-primary' : 'btn-ghost'} btn-sm">${t.label}${t.ready ? '' : ' <span style="opacity:.6;">(soon)</span>'}</button>`).join('')}
        </div>
        <div id="aiTabContent"><div class="loading">Loading…</div></div>
    `;
    try {
        const data = await fetchAPI('/classes');
        aiClassesCache = data.classes || [];
    } catch (e) { console.error(e); }
    await switchAiTab(currentAiTab);
}

window.switchAiTab = async function (tab) {
    currentAiTab = tab;
    AI_TABS.forEach(t => {
        const btn = document.getElementById(`aiTab_${t.key}`);
        if (btn) btn.className = `btn ${t.key === tab ? 'btn-primary' : 'btn-ghost'} btn-sm`;
    });
    const box = document.getElementById('aiTabContent');
    box.innerHTML = '<div class="loading">Loading…</div>';
    try {
        if (tab === 'qpaper') await renderQuestionPaperTab(box);
        else if (tab === 'qbank') await renderQuestionBankTab(box);
        else if (tab === 'papers') await renderSavedPapersTab(box);
        else if (tab === 'remarks') await renderRemarksTab(box);
        else if (tab === 'timetable-ai') await renderTimetableGenTab(box);
        else if (tab === 'lesson') await renderLessonPlanTab(box);
        else if (tab === 'performance') await renderPerformanceTab(box);
        else if (tab === 'fee-predict') await renderFeePredictTab(box);
        else if (tab === 'attendance-risk') await renderAttendanceRiskTab(box);
        else renderComingSoonTab(box, AI_TABS.find(t => t.key === tab));
    } catch (e) {
        console.error('AI tab render error', e);
        box.innerHTML = '<div class="loading">Failed to load this section.</div>';
    }
};

function renderComingSoonTab(box, tabDef) {
    box.innerHTML = `
        <div class="card" style="text-align:center; padding:50px 20px; color:#94a3b8;">
            <div style="font-size:36px; margin-bottom:10px;">🚧</div>
            <div style="font-size:16px; font-weight:600; color:#e2e8f0; margin-bottom:6px;">${escapeHtml(tabDef ? tabDef.label.replace(/^[^\s]+\s/, '') : 'This feature')} — coming soon</div>
            <div style="font-size:13px;">Being added next, module by module. 📝 Question Paper Generator is ready to use now.</div>
        </div>
    `;
}

function aiCard(title, bodyHtml, actionsHtml) {
    return `
        <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
                <h3 style="margin:0; color:var(--text); font-size:16px;">${escapeHtml(title)}</h3>
                <div style="display:flex; gap:8px;">${actionsHtml || ''}</div>
            </div>
            ${bodyHtml}
        </div>
    `;
}

function aiClassOptions(selected) {
    return '<option value="">General / Not class-specific</option>' +
        aiClassesCache.map(c => `<option value="${c.id}" ${String(c.id) === String(selected) ? 'selected' : ''}>${escapeHtml(c.class_name)}</option>`).join('');
}

// ==================== 1. QUESTION PAPER GENERATOR ====================
async function renderQuestionPaperTab(box) {
    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div class="card-title">Paper Details</div>
            <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
                <div><label style="font-size:12px; color:#94a3b8;">Class</label><br>
                    <select id="qpClass" class="filter" style="min-width:160px;">${aiClassOptions()}</select></div>
                <div><label style="font-size:12px; color:#94a3b8;">Subject *</label><br>
                    <input type="text" id="qpSubject" class="filter" placeholder="e.g. Mathematics" style="min-width:150px;"></div>
                <div><label style="font-size:12px; color:#94a3b8;">Term</label><br>
                    <input type="text" id="qpTerm" class="filter" placeholder="e.g. Term 1" style="width:120px;"></div>
                <div><label style="font-size:12px; color:#94a3b8;">Year</label><br>
                    <input type="text" id="qpYear" class="filter" value="${new Date().getFullYear()}" style="width:90px;"></div>
                <div><label style="font-size:12px; color:#94a3b8;">Duration (min)</label><br>
                    <input type="number" id="qpDuration" class="filter" value="60" style="width:90px;"></div>
            </div>
            <div style="margin-bottom:10px;">
                <label style="font-size:12px; color:#94a3b8;">Title (optional)</label><br>
                <input type="text" id="qpTitle" class="filter" placeholder="Auto-generated if left blank" style="width:100%; max-width:420px;">
            </div>
            <div style="margin-bottom:10px;">
                <label style="font-size:12px; color:#94a3b8;">Instructions for Students (optional)</label><br>
                <textarea id="qpInstructions" class="filter" rows="2" style="width:100%; max-width:600px;" placeholder="e.g. Attempt all questions. Write neatly."></textarea>
            </div>
            <div>
                <label style="font-size:12px; color:#94a3b8;">Generation Mode</label><br>
                <select id="qpMode" class="filter" style="min-width:220px;">
                    <option value="auto">Auto (AI if configured, else offline)</option>
                    <option value="ai">Force AI</option>
                    <option value="offline">Offline / Question Bank only</option>
                </select>
            </div>
        </div>

        <div class="card" style="margin-bottom:16px;">
            <div class="card-title">Sections</div>
            <div id="qpSectionsList"></div>
            <button type="button" class="btn btn-ghost btn-sm" onclick="addQpSection()" style="margin-top:8px;">➕ Add Section</button>
        </div>

        <div style="margin-bottom:16px;">
            <button class="btn btn-primary" onclick="generateQuestionPaper()">🤖 Generate Paper</button>
        </div>

        <div id="qpResult"></div>
    `;
    renderQpSections();
}

function renderQpSections() {
    const list = document.getElementById('qpSectionsList');
    if (!list) return;
    list.innerHTML = aiQpSections.map((s, idx) => `
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid #334155;">
            <div><label style="font-size:11px; color:#94a3b8;">Type</label><br>
                <select class="filter" style="width:150px;" onchange="aiQpSections[${idx}].type=this.value">
                    ${AI_QUESTION_TYPES.map(t => `<option value="${t}" ${s.type === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select></div>
            <div><label style="font-size:11px; color:#94a3b8;">Count</label><br>
                <input type="number" class="filter" style="width:70px;" value="${s.count}" min="1" onchange="aiQpSections[${idx}].count=this.value"></div>
            <div><label style="font-size:11px; color:#94a3b8;">Marks each</label><br>
                <input type="number" class="filter" style="width:80px;" value="${s.marks_each}" step="0.5" min="0.5" onchange="aiQpSections[${idx}].marks_each=this.value"></div>
            <div><label style="font-size:11px; color:#94a3b8;">Topics</label><br>
                <input type="text" class="filter" style="width:180px;" value="${escapeHtml(s.topics)}" placeholder="comma-separated, optional" onchange="aiQpSections[${idx}].topics=this.value"></div>
            <div><label style="font-size:11px; color:#94a3b8;">Difficulty</label><br>
                <select class="filter" style="width:110px;" onchange="aiQpSections[${idx}].difficulty=this.value">
                    ${AI_DIFFICULTIES.map(d => `<option value="${d}" ${s.difficulty === d ? 'selected' : ''}>${d}</option>`).join('')}
                </select></div>
            <button type="button" class="btn btn-ghost btn-sm" onclick="removeQpSection(${idx})">✖</button>
        </div>
    `).join('');
}

window.addQpSection = function () {
    aiQpSections.push({ type: 'Short Answer', count: 5, marks_each: 2, topics: '', difficulty: 'Medium' });
    renderQpSections();
};
window.removeQpSection = function (idx) {
    aiQpSections.splice(idx, 1);
    if (!aiQpSections.length) aiQpSections.push({ type: 'MCQ', count: 5, marks_each: 1, topics: '', difficulty: 'Medium' });
    renderQpSections();
};

window.generateQuestionPaper = async function () {
    const classId = document.getElementById('qpClass')?.value || null;
    const subject = document.getElementById('qpSubject')?.value.trim();
    if (!subject) { showAlert('Subject is required', 'error'); return; }

    const payload = {
        class_id: classId || null,
        class_label: classId ? (aiClassesCache.find(c => String(c.id) === String(classId))?.class_name || '') : '',
        subject,
        term: document.getElementById('qpTerm')?.value.trim(),
        year: document.getElementById('qpYear')?.value.trim(),
        duration_minutes: parseInt(document.getElementById('qpDuration')?.value) || null,
        title: document.getElementById('qpTitle')?.value.trim(),
        instructions: document.getElementById('qpInstructions')?.value.trim(),
        mode: document.getElementById('qpMode')?.value || 'auto',
        sections: aiQpSections.map(s => ({
            type: s.type, count: parseInt(s.count) || 1, marks_each: parseFloat(s.marks_each) || 1,
            topics: s.topics, difficulty: s.difficulty
        })),
    };

    const resultBox = document.getElementById('qpResult');
    resultBox.innerHTML = '<div class="loading">Generating…</div>';
    try {
        const data = await fetchAPI('/ai/question-paper/generate', { method: 'POST', body: JSON.stringify(payload) });
        aiLastGeneratedPaper = data.paper;
        renderGeneratedPaper(resultBox, data.paper);
        showAlert('Question paper generated and saved', 'success');
    } catch (e) {
        resultBox.innerHTML = '';
        showAlert(e.message || 'Failed to generate paper', 'error');
    }
};

function renderGeneratedPaper(box, paper) {
    const modeBadge = paper.generation_mode_used === 'ai'
        ? '<span class="badge badge-purple">🤖 AI Generated</span>'
        : '<span class="badge badge-blue">📚 Offline / Question Bank</span>';
    const warningHtml = paper.warning ? `<div style="color:#f59e0b; font-size:12px; margin-top:6px;">⚠️ ${escapeHtml(paper.warning)}</div>` : '';

    const sectionsHtml = paper.content.sections.map((s, si) => `
        <div style="margin-bottom:16px;">
            <div style="font-weight:600; margin-bottom:4px;">Section ${si + 1}: ${escapeHtml(s.type)}</div>
            <div style="font-size:12px; color:#94a3b8; margin-bottom:8px;">${escapeHtml(s.instructions)}</div>
            <ol style="padding-left:20px;">
                ${s.questions.map(q => `
                    <li style="margin-bottom:8px; ${q.question_text.startsWith('[') ? 'color:#f59e0b;' : ''}">
                        ${escapeHtml(q.question_text)} <span style="color:#94a3b8; font-size:12px;">(${q.marks} marks)</span>
                        ${(q.options || []).length ? `<div style="margin-top:4px; padding-left:14px; font-size:13px;">${q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${escapeHtml(o)}`).join('&nbsp;&nbsp;&nbsp;')}</div>` : ''}
                    </li>
                `).join('')}
            </ol>
        </div>
    `).join('');

    box.innerHTML = aiCard(`${paper.title} ${modeBadge}`, `
            ${warningHtml}
            <p style="font-size:13px; color:#94a3b8;">Total Marks: <strong>${paper.total_marks}</strong> &nbsp; Duration: <strong>${paper.duration_minutes || '-'} min</strong> &nbsp; Subject: <strong>${escapeHtml(paper.subject)}</strong>${paper.class_name ? ` &nbsp; Class: <strong>${escapeHtml(paper.class_name)}</strong>` : ''}</p>
            ${sectionsHtml}
        `,
        `<button class="btn btn-primary btn-sm" onclick="printQuestionPaper(${paper.id}, false)">🖨️ Print Paper</button>
         <button class="btn btn-ghost btn-sm" onclick="printQuestionPaper(${paper.id}, true)">🔑 Print with Answer Key</button>`
    );
}

window.printQuestionPaper = async function (paperId, withAnswers) {
    try {
        const data = await fetchAPI(`/ai/question-paper/${paperId}`);
        const paper = data.paper;
        let content = `
            <div style="text-align:center; margin-bottom:14px;">
                <div style="font-size:12px;">${paper.class_name ? escapeHtml(paper.class_name) + ' — ' : ''}${escapeHtml(paper.subject)} ${paper.term ? '— ' + escapeHtml(paper.term) : ''} ${paper.year ? escapeHtml(paper.year) : ''}</div>
                <div style="font-size:12px; margin-top:4px;">Time: ${paper.duration_minutes || '-'} minutes &nbsp; | &nbsp; Total Marks: ${paper.total_marks}</div>
            </div>
        `;
        if (paper.instructions) content += `<p><strong>Instructions:</strong> ${escapeHtml(paper.instructions)}</p>`;

        paper.content.sections.forEach((s, si) => {
            content += `<div style="margin-top:14px;"><strong>Section ${si + 1}: ${escapeHtml(s.type)}</strong><br><span style="font-size:12px;">${escapeHtml(s.instructions)}</span>`;
            content += `<ol style="padding-left:20px;">`;
            s.questions.forEach(q => {
                content += `<li style="margin-bottom:10px;">${escapeHtml(q.question_text)} <span style="font-size:12px;">(${q.marks} marks)</span>`;
                if ((q.options || []).length) {
                    content += `<div style="margin-top:4px; padding-left:14px;">${q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${escapeHtml(o)}`).join('&nbsp;&nbsp;&nbsp;')}</div>`;
                }
                if (withAnswers && q.correct_answer) {
                    content += `<div style="margin-top:4px; padding-left:14px; color:#16a34a;"><strong>Answer:</strong> ${escapeHtml(q.correct_answer)}</div>`;
                }
                content += `</li>`;
            });
            content += `</ol></div>`;
        });

        printPreview(content, withAnswers ? `${paper.title} (Answer Key)` : paper.title);
    } catch (e) {
        showAlert('Failed to load paper for printing', 'error');
    }
};

// ==================== 2. QUESTION BANK ====================
async function renderQuestionBankTab(box) {
    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div class="card-title">Add Question to Bank</div>
            <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
                <select id="qbClass" class="filter" style="min-width:160px;">${aiClassOptions()}</select>
                <input type="text" id="qbSubject" class="filter" placeholder="Subject *" style="min-width:150px;">
                <input type="text" id="qbTopic" class="filter" placeholder="Topic (optional)" style="min-width:150px;">
                <select id="qbType" class="filter" onchange="toggleQbOptionsField()">${AI_QUESTION_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}</select>
                <select id="qbDifficulty" class="filter">${AI_DIFFICULTIES.map(d => `<option value="${d}">${d}</option>`).join('')}</select>
                <input type="number" id="qbMarks" class="filter" placeholder="Marks" value="1" step="0.5" style="width:80px;">
            </div>
            <textarea id="qbQuestionText" class="filter" rows="2" style="width:100%; margin-bottom:8px;" placeholder="Question text *"></textarea>
            <div id="qbOptionsField" style="display:none; margin-bottom:8px;">
                <label style="font-size:12px; color:#94a3b8;">Options (one per line, 4 recommended)</label>
                <textarea id="qbOptions" class="filter" rows="4" style="width:100%;" placeholder="Option A&#10;Option B&#10;Option C&#10;Option D"></textarea>
            </div>
            <input type="text" id="qbCorrectAnswer" class="filter" placeholder="Correct answer (optional but recommended)" style="width:100%; max-width:400px; margin-bottom:8px;">
            <div><button class="btn btn-primary btn-sm" onclick="addBankQuestion()">➕ Add to Bank</button></div>
        </div>

        <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:10px;">
                <div class="card-title" style="margin:0;">Question Bank</div>
                <div style="display:flex; gap:8px;">
                    <input type="text" id="qbFilterSubject" class="filter" placeholder="Filter by subject" style="width:140px;">
                    <button class="btn btn-ghost btn-sm" onclick="loadBankQuestions()">Filter</button>
                </div>
            </div>
            <div id="qbList"><div class="loading">Loading…</div></div>
        </div>
    `;
    await loadBankQuestions();
}

window.toggleQbOptionsField = function () {
    const type = document.getElementById('qbType')?.value;
    const field = document.getElementById('qbOptionsField');
    if (field) field.style.display = (type === 'MCQ') ? 'block' : 'none';
};

window.addBankQuestion = async function () {
    const subject = document.getElementById('qbSubject')?.value.trim();
    const questionText = document.getElementById('qbQuestionText')?.value.trim();
    if (!subject || !questionText) { showAlert('Subject and question text are required', 'error'); return; }

    const type = document.getElementById('qbType')?.value;
    const optionsRaw = document.getElementById('qbOptions')?.value || '';
    const options = type === 'MCQ' ? optionsRaw.split('\n').map(o => o.trim()).filter(Boolean) : [];

    const payload = {
        class_id: document.getElementById('qbClass')?.value || null,
        subject,
        topic: document.getElementById('qbTopic')?.value.trim(),
        question_type: type,
        question_text: questionText,
        options,
        correct_answer: document.getElementById('qbCorrectAnswer')?.value.trim() || null,
        marks: parseFloat(document.getElementById('qbMarks')?.value) || 1,
        difficulty: document.getElementById('qbDifficulty')?.value,
    };
    try {
        await fetchAPI('/ai/question-bank', { method: 'POST', body: JSON.stringify(payload) });
        showAlert('Question added to bank', 'success');
        document.getElementById('qbQuestionText').value = '';
        document.getElementById('qbOptions').value = '';
        document.getElementById('qbCorrectAnswer').value = '';
        await loadBankQuestions();
    } catch (e) {
        showAlert(e.message || 'Failed to add question', 'error');
    }
};

window.loadBankQuestions = async function () {
    const subject = document.getElementById('qbFilterSubject')?.value.trim() || '';
    const listEl = document.getElementById('qbList');
    if (!listEl) return;
    try {
        const data = await fetchAPI(`/ai/question-bank${subject ? '?subject=' + encodeURIComponent(subject) : ''}`);
        const questions = data.questions || [];
        listEl.innerHTML = `
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>Subject</th><th>Topic</th><th>Type</th><th>Question</th><th>Marks</th><th>Difficulty</th><th>Source</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${questions.length ? questions.map(q => `
                            <tr>
                                <td>${escapeHtml(q.subject)}</td>
                                <td>${escapeHtml(q.topic || '-')}</td>
                                <td>${escapeHtml(q.question_type)}</td>
                                <td style="max-width:320px;">${escapeHtml(q.question_text)}</td>
                                <td>${q.marks}</td>
                                <td>${escapeHtml(q.difficulty)}</td>
                                <td>${q.source === 'ai' ? '🤖 AI' : '✍️ Manual'}</td>
                                <td><button class="btn btn-ghost btn-sm" onclick="deleteBankQuestion(${q.id})">🗑</button></td>
                            </tr>
                        `).join('') : '<tr><td colspan="8" style="text-align:center; color:#94a3b8;">No questions in the bank yet.</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
    } catch (e) {
        listEl.innerHTML = '<div class="loading">Failed to load question bank.</div>';
    }
};

window.deleteBankQuestion = async function (id) {
    if (!confirm('Remove this question from the bank?')) return;
    try {
        await fetchAPI(`/ai/question-bank/${id}`, { method: 'DELETE' });
        await loadBankQuestions();
    } catch (e) {
        showAlert('Failed to delete question', 'error');
    }
};

// ==================== 3. SAVED PAPERS ====================
async function renderSavedPapersTab(box) {
    box.innerHTML = `<div class="card"><div class="card-title">Saved Question Papers</div><div id="papersList"><div class="loading">Loading…</div></div></div>`;
    const listEl = document.getElementById('papersList');
    try {
        const data = await fetchAPI('/ai/question-paper');
        const papers = data.papers || [];
        listEl.innerHTML = `
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>Title</th><th>Class</th><th>Subject</th><th>Term/Year</th><th>Marks</th><th>Mode</th><th>Created</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${papers.length ? papers.map(p => `
                            <tr>
                                <td>${escapeHtml(p.title)}</td>
                                <td>${escapeHtml(p.class_name || 'General')}</td>
                                <td>${escapeHtml(p.subject)}</td>
                                <td>${escapeHtml(p.term || '-')} ${escapeHtml(p.year || '')}</td>
                                <td>${p.total_marks}</td>
                                <td>${p.generation_mode === 'ai' ? '🤖 AI' : '📚 Offline'}</td>
                                <td>${escapeHtml((p.created_at || '').slice(0, 16))}</td>
                                <td class="actions">
                                    <button class="btn btn-ghost btn-sm" onclick="viewSavedPaper(${p.id})">👁 View</button>
                                    <button class="btn btn-ghost btn-sm" onclick="printQuestionPaper(${p.id}, false)">🖨</button>
                                    <button class="btn btn-danger btn-sm" onclick="deleteSavedPaper(${p.id})">🗑</button>
                                </td>
                            </tr>
                        `).join('') : '<tr><td colspan="8" style="text-align:center; color:#94a3b8;">No saved papers yet — generate one from the Question Paper Generator tab.</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
    } catch (e) {
        listEl.innerHTML = '<div class="loading">Failed to load saved papers.</div>';
    }
}

window.viewSavedPaper = async function (paperId) {
    await switchAiTab('qpaper');
    const data = await fetchAPI(`/ai/question-paper/${paperId}`);
    const resultBox = document.getElementById('qpResult');
    if (resultBox) renderGeneratedPaper(resultBox, data.paper);
};

window.deleteSavedPaper = async function (paperId) {
    if (!confirm('Delete this saved paper?')) return;
    try {
        await fetchAPI(`/ai/question-paper/${paperId}`, { method: 'DELETE' });
        await switchAiTab('papers');
    } catch (e) {
        showAlert('Failed to delete paper', 'error');
    }
};

// ==================== 4. REPORT CARD REMARKS ====================
async function renderRemarksTab(box) {
    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div class="card-title">Select Class &amp; Exam</div>
            <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end;">
                <div><label style="font-size:12px; color:#94a3b8;">Class *</label><br>
                    <select id="rmClass" class="filter" style="min-width:160px;">
                        <option value="">Select class...</option>
                        ${aiClassesCache.map(c => `<option value="${c.id}" ${String(c.id) === String(remarksCtx.classId) ? 'selected' : ''}>${escapeHtml(c.class_name)}</option>`).join('')}
                    </select></div>
                <div><label style="font-size:12px; color:#94a3b8;">Term</label><br>
                    <input type="text" id="rmTerm" class="filter" value="${escapeHtml(remarksCtx.term)}" style="width:120px;"></div>
                <div><label style="font-size:12px; color:#94a3b8;">Year</label><br>
                    <input type="text" id="rmYear" class="filter" value="${escapeHtml(remarksCtx.year)}" style="width:90px;"></div>
                <div><label style="font-size:12px; color:#94a3b8;">Tone</label><br>
                    <select id="rmTone" class="filter" style="width:140px;">
                        <option value="encouraging" ${remarksCtx.tone === 'encouraging' ? 'selected' : ''}>Encouraging</option>
                        <option value="formal" ${remarksCtx.tone === 'formal' ? 'selected' : ''}>Formal</option>
                        <option value="concise" ${remarksCtx.tone === 'concise' ? 'selected' : ''}>Concise</option>
                    </select></div>
                <div><label style="font-size:12px; color:#94a3b8;">Mode</label><br>
                    <select id="rmMode" class="filter" style="width:200px;">
                        <option value="auto" ${remarksCtx.mode === 'auto' ? 'selected' : ''}>Auto (AI if configured, else offline)</option>
                        <option value="ai" ${remarksCtx.mode === 'ai' ? 'selected' : ''}>Force AI</option>
                        <option value="offline" ${remarksCtx.mode === 'offline' ? 'selected' : ''}>Offline template</option>
                    </select></div>
                <button class="btn btn-primary btn-sm" onclick="loadRemarksClass()">Load Class</button>
            </div>
        </div>
        <div id="rmBody"></div>
    `;
    if (remarksCtx.classId) await loadRemarksClass();
}

window.loadRemarksClass = async function () {
    remarksCtx.classId = document.getElementById('rmClass')?.value || '';
    remarksCtx.term = document.getElementById('rmTerm')?.value.trim() || 'Term 1';
    remarksCtx.year = document.getElementById('rmYear')?.value.trim() || String(new Date().getFullYear());
    remarksCtx.tone = document.getElementById('rmTone')?.value || 'encouraging';
    remarksCtx.mode = document.getElementById('rmMode')?.value || 'auto';

    if (!remarksCtx.classId) { showAlert('Select a class first', 'error'); return; }

    const bodyEl = document.getElementById('rmBody');
    bodyEl.innerHTML = '<div class="loading">Loading…</div>';
    try {
        // Resolve/create the exam session for this class+term+year, same
        // as the Examination module does, then fetch the gazette + remarks.
        const sheet = await fetchAPI(`/exam/class/${remarksCtx.classId}/marksheet?term=${encodeURIComponent(remarksCtx.term)}&year=${encodeURIComponent(remarksCtx.year)}`);
        remarksCtx.examId = sheet.exam_id;
        remarksData = await fetchAPI(`/ai/remarks/${remarksCtx.examId}`);
        renderRemarksBody(bodyEl);
    } catch (e) {
        bodyEl.innerHTML = '';
        showAlert(e.message || 'Failed to load class results', 'error');
    }
};

function renderRemarksBody(bodyEl) {
    if (!remarksData || !remarksData.students || !remarksData.students.length) {
        bodyEl.innerHTML = '<div class="card" style="text-align:center; padding:30px; color:#94a3b8;">No marks entered yet for this class/term/year — enter results first in Examination → Marksheet.</div>';
        return;
    }
    const doneCount = remarksData.students.filter(s => s.remark).length;
    bodyEl.innerHTML = `
        <div class="card" style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div style="font-size:13px; color:#94a3b8;">
                ${escapeHtml(remarksData.class_name)} — ${escapeHtml(remarksData.term)} ${escapeHtml(remarksData.year)} ·
                ${doneCount}/${remarksData.students.length} student(s) have remarks
            </div>
            <button class="btn btn-primary btn-sm" onclick="generateRemarksBulk(false)">🤖 Generate for students without remarks</button>
        </div>
        <div id="rmList"></div>
    `;
    const listEl = document.getElementById('rmList');
    listEl.innerHTML = remarksData.students.map(s => renderRemarkCard(s)).join('');
}

function renderRemarkCard(s) {
    const modeBadge = !s.remark ? ''
        : s.remark.generation_mode === 'ai' ? '<span class="badge badge-purple">🤖 AI</span>'
        : s.remark.generation_mode === 'manual' ? '<span class="badge badge-blue">✍️ Manual</span>'
        : '<span class="badge badge-blue">📚 Offline</span>';

    return `
        <div class="card" id="rmCard_${s.student_id}" style="margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
                <div>
                    <span style="font-weight:600;">${escapeHtml(s.student_name)}</span>
                    <span style="color:#94a3b8; font-size:12px;"> (${escapeHtml(s.student_id)}) — ${s.percentage}% · Grade ${escapeHtml(s.grade || '-')}</span>
                    ${modeBadge}
                </div>
                <div style="display:flex; gap:6px;">
                    <button class="btn btn-ghost btn-sm" onclick="generateRemarkOne('${s.student_id}')">🤖 ${s.remark ? 'Regenerate' : 'Generate'}</button>
                    <button class="btn btn-ghost btn-sm" onclick="toggleRemarkEdit('${s.student_id}')">✏️ Edit</button>
                </div>
            </div>
            <div id="rmView_${s.student_id}">
                ${s.remark ? `
                    <div style="font-size:13px; margin-bottom:4px;"><strong>Overall:</strong> ${escapeHtml(s.remark.overall_remark || '')}</div>
                    <div style="font-size:13px; margin-bottom:4px;"><strong>Strengths:</strong> ${escapeHtml(s.remark.strengths || '')}</div>
                    <div style="font-size:13px;"><strong>To improve:</strong> ${escapeHtml(s.remark.improvement_areas || '')}</div>
                ` : '<div style="font-size:13px; color:#94a3b8;">No remark yet.</div>'}
            </div>
            <div id="rmEdit_${s.student_id}" style="display:none;"></div>
        </div>
    `;
}

function findRemarkStudent(studentId) {
    return remarksData?.students.find(s => String(s.student_id) === String(studentId));
}

window.generateRemarkOne = async function (studentId) {
    const card = document.getElementById(`rmCard_${studentId}`);
    try {
        const data = await fetchAPI('/ai/remarks/generate', {
            method: 'POST',
            body: JSON.stringify({
                exam_id: remarksCtx.examId, student_id: studentId,
                mode: remarksCtx.mode, tone: remarksCtx.tone,
            }),
        });
        const s = findRemarkStudent(studentId);
        if (s) s.remark = {
            overall_remark: data.remark.overall_remark,
            strengths: data.remark.strengths,
            improvement_areas: data.remark.improvement_areas,
            generation_mode: data.remark.generation_mode_used,
            updated_at: data.remark.updated_at,
        };
        if (card) card.outerHTML = renderRemarkCard(s);
        showAlert(data.remark.warning || 'Remark generated', 'success');
    } catch (e) {
        showAlert(e.message || 'Failed to generate remark', 'error');
    }
};

window.generateRemarksBulk = async function (overwriteExisting) {
    const bodyEl = document.getElementById('rmBody');
    try {
        const result = await fetchAPI('/ai/remarks/generate-bulk', {
            method: 'POST',
            body: JSON.stringify({
                exam_id: remarksCtx.examId, mode: remarksCtx.mode, tone: remarksCtx.tone,
                overwrite_existing: !!overwriteExisting,
            }),
        });
        remarksData = await fetchAPI(`/ai/remarks/${remarksCtx.examId}`);
        renderRemarksBody(bodyEl);
        showAlert(`Generated ${result.generated} remark(s)${result.skipped ? `, skipped ${result.skipped} already done` : ''}${result.failed.length ? `, ${result.failed.length} failed` : ''}`, 'success');
    } catch (e) {
        showAlert(e.message || 'Bulk generation failed', 'error');
    }
};

window.toggleRemarkEdit = function (studentId) {
    const s = findRemarkStudent(studentId);
    const viewEl = document.getElementById(`rmView_${studentId}`);
    const editEl = document.getElementById(`rmEdit_${studentId}`);
    if (!viewEl || !editEl) return;

    if (editEl.style.display === 'none') {
        const r = s?.remark || { overall_remark: '', strengths: '', improvement_areas: '' };
        editEl.innerHTML = `
            <div style="margin-bottom:6px;"><label style="font-size:11px; color:#94a3b8;">Overall</label>
                <textarea id="rmEditOverall_${studentId}" class="filter" rows="2" style="width:100%;">${escapeHtml(r.overall_remark || '')}</textarea></div>
            <div style="margin-bottom:6px;"><label style="font-size:11px; color:#94a3b8;">Strengths</label>
                <textarea id="rmEditStrengths_${studentId}" class="filter" rows="2" style="width:100%;">${escapeHtml(r.strengths || '')}</textarea></div>
            <div style="margin-bottom:6px;"><label style="font-size:11px; color:#94a3b8;">To improve</label>
                <textarea id="rmEditImprove_${studentId}" class="filter" rows="2" style="width:100%;">${escapeHtml(r.improvement_areas || '')}</textarea></div>
            <button class="btn btn-primary btn-sm" onclick="saveRemarkManual('${studentId}')">💾 Save</button>
            <button class="btn btn-ghost btn-sm" onclick="toggleRemarkEdit('${studentId}')">Cancel</button>
        `;
        viewEl.style.display = 'none';
        editEl.style.display = 'block';
    } else {
        editEl.style.display = 'none';
        viewEl.style.display = 'block';
    }
};

window.saveRemarkManual = async function (studentId) {
    const overall_remark = document.getElementById(`rmEditOverall_${studentId}`)?.value.trim();
    const strengths = document.getElementById(`rmEditStrengths_${studentId}`)?.value.trim();
    const improvement_areas = document.getElementById(`rmEditImprove_${studentId}`)?.value.trim();
    if (!overall_remark) { showAlert('Overall remark is required', 'error'); return; }
    try {
        await fetchAPI(`/ai/remarks/${remarksCtx.examId}/${studentId}`, {
            method: 'PUT',
            body: JSON.stringify({ overall_remark, strengths, improvement_areas }),
        });
        const s = findRemarkStudent(studentId);
        if (s) s.remark = { overall_remark, strengths, improvement_areas, generation_mode: 'manual' };
        const card = document.getElementById(`rmCard_${studentId}`);
        if (card) card.outerHTML = renderRemarkCard(s);
        showAlert('Remark saved', 'success');
    } catch (e) {
        showAlert(e.message || 'Failed to save remark', 'error');
    }
};

// ==================== 5. TIMETABLE GENERATOR ====================
const TT_ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
let ttGenCtx = {
    classId: '', days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    periodsPerDay: 7, periodDuration: 40, startTime: '08:00',
    breakPeriods: [], mode: 'auto', overwrite: false,
};
let ttGenContext = null;
let ttGenSubjectPeriods = {};
let ttGenResult = null;

async function renderTimetableGenTab(box) {
    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div class="card-title">Class</div>
            <select id="ttgClass" class="filter" style="min-width:200px;">
                <option value="">Select class...</option>
                ${aiClassesCache.map(c => `<option value="${c.id}" ${String(c.id) === String(ttGenCtx.classId) ? 'selected' : ''}>${escapeHtml(c.class_name)}</option>`).join('')}
            </select>
            <button class="btn btn-primary btn-sm" onclick="loadTimetableGenClass()" style="margin-left:8px;">Load</button>
        </div>
        <div id="ttgBody"></div>
    `;
    if (ttGenCtx.classId) await loadTimetableGenClass();
}

window.loadTimetableGenClass = async function () {
    ttGenCtx.classId = document.getElementById('ttgClass')?.value || '';
    if (!ttGenCtx.classId) { showAlert('Select a class first', 'error'); return; }

    const bodyEl = document.getElementById('ttgBody');
    bodyEl.innerHTML = '<div class="loading">Loading…</div>';
    try {
        ttGenContext = await fetchAPI(`/ai/timetable/context/${ttGenCtx.classId}`);
        if (!ttGenContext.subjects.length) {
            bodyEl.innerHTML = '<div class="card" style="text-align:center; padding:30px; color:#94a3b8;">This class has no subjects configured yet. Add subjects first in Classes → Subjects.</div>';
            return;
        }
        const totalSlots = ttGenCtx.days.length * ttGenCtx.periodsPerDay - ttGenCtx.breakPeriods.length * ttGenCtx.days.length;
        const base = Math.floor(totalSlots / ttGenContext.subjects.length);
        const extra = totalSlots % ttGenContext.subjects.length;
        ttGenSubjectPeriods = {};
        ttGenContext.subjects.forEach((s, i) => { ttGenSubjectPeriods[s] = base + (i < extra ? 1 : 0); });
        renderTimetableGenBody(bodyEl);
    } catch (e) {
        bodyEl.innerHTML = '';
        showAlert(e.message || 'Failed to load class', 'error');
    }
};

function renderTimetableGenBody(bodyEl) {
    bodyEl.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div class="card-title">Schedule Settings</div>
            <div style="display:flex; flex-wrap:wrap; gap:16px; margin-bottom:12px;">
                <div>
                    <label style="font-size:12px; color:#94a3b8;">Days</label><br>
                    ${TT_ALL_DAYS.map(d => `
                        <label style="font-size:12px; margin-right:8px;">
                            <input type="checkbox" class="ttgDayCheck" value="${d}" ${ttGenCtx.days.includes(d) ? 'checked' : ''} onchange="onTtgSettingsChange()"> ${d.slice(0, 3)}
                        </label>`).join('')}
                </div>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
                <div><label style="font-size:12px; color:#94a3b8;">Periods/day</label><br>
                    <input type="number" id="ttgPeriodsPerDay" class="filter" value="${ttGenCtx.periodsPerDay}" min="1" max="15" style="width:90px;" onchange="onTtgSettingsChange()"></div>
                <div><label style="font-size:12px; color:#94a3b8;">Period length (min)</label><br>
                    <input type="number" id="ttgDuration" class="filter" value="${ttGenCtx.periodDuration}" min="10" style="width:100px;"></div>
                <div><label style="font-size:12px; color:#94a3b8;">Start time</label><br>
                    <input type="time" id="ttgStartTime" class="filter" value="${ttGenCtx.startTime}" style="width:110px;"></div>
                <div><label style="font-size:12px; color:#94a3b8;">Break after period #</label><br>
                    <input type="text" id="ttgBreakPeriods" class="filter" placeholder="e.g. 4 (comma-separated)" value="${ttGenCtx.breakPeriods.join(',')}" style="width:160px;" onchange="onTtgSettingsChange()"></div>
                <div><label style="font-size:12px; color:#94a3b8;">Mode</label><br>
                    <select id="ttgMode" class="filter" style="width:220px;">
                        <option value="auto" ${ttGenCtx.mode === 'auto' ? 'selected' : ''}>Auto (AI ordering if configured)</option>
                        <option value="ai" ${ttGenCtx.mode === 'ai' ? 'selected' : ''}>Force AI ordering</option>
                        <option value="offline" ${ttGenCtx.mode === 'offline' ? 'selected' : ''}>Default ordering (offline)</option>
                    </select></div>
            </div>
            <label style="font-size:12px;">
                <input type="checkbox" id="ttgOverwrite" ${ttGenCtx.overwrite ? 'checked' : ''}> Overwrite existing timetable slots for this class
                ${ttGenContext.existing_slot_count ? `<span style="color:#94a3b8;"> (${ttGenContext.existing_slot_count} slot(s) already saved)</span>` : ''}
            </label>
        </div>

        <div class="card" style="margin-bottom:16px;">
            <div class="card-title">Periods per week, by subject</div>
            <div id="ttgSubjectPeriods" style="display:flex; flex-wrap:wrap; gap:10px;"></div>
            <div style="font-size:12px; color:#94a3b8; margin-top:8px;">Total available slots: <span id="ttgTotalSlots"></span></div>
        </div>

        <div style="margin-bottom:16px;">
            <button class="btn btn-primary" onclick="generateTimetable()">🤖 Generate Timetable</button>
        </div>

        <div id="ttgResult"></div>
    `;
    renderTtgSubjectPeriods();
}

function ttgTotalSlots() {
    return ttGenCtx.days.length * (ttGenCtx.periodsPerDay - ttGenCtx.breakPeriods.length);
}

window.onTtgSettingsChange = function () {
    ttGenCtx.days = Array.from(document.querySelectorAll('.ttgDayCheck:checked')).map(el => el.value);
    ttGenCtx.periodsPerDay = parseInt(document.getElementById('ttgPeriodsPerDay')?.value) || 7;
    ttGenCtx.breakPeriods = (document.getElementById('ttgBreakPeriods')?.value || '')
        .split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    renderTtgSubjectPeriods();
};

function renderTtgSubjectPeriods() {
    const el = document.getElementById('ttgSubjectPeriods');
    if (!el || !ttGenContext) return;
    el.innerHTML = ttGenContext.subjects.map(s => `
        <div>
            <label style="font-size:11px; color:#94a3b8;">${escapeHtml(s)}${ttGenContext.subject_teachers[s]?.length ? '' : ' <span style="color:#f59e0b;">(no teacher on file)</span>'}</label><br>
            <input type="number" class="filter" style="width:70px;" min="0" value="${ttGenSubjectPeriods[s] || 0}"
                onchange="ttGenSubjectPeriods['${s.replace(/'/g, "\\'")}'] = parseInt(this.value) || 0; updateTtgTotalDisplay();">
        </div>
    `).join('');
    updateTtgTotalDisplay();
}

function updateTtgTotalDisplay() {
    const sumEl = document.getElementById('ttgTotalSlots');
    if (!sumEl) return;
    const assigned = Object.values(ttGenSubjectPeriods).reduce((a, b) => a + b, 0);
    const total = ttgTotalSlots();
    sumEl.textContent = `${assigned} assigned / ${total} available`;
    sumEl.style.color = assigned > total ? '#ef4444' : (assigned < total ? '#f59e0b' : '#22c55e');
}

window.generateTimetable = async function () {
    ttGenCtx.periodDuration = parseInt(document.getElementById('ttgDuration')?.value) || 40;
    ttGenCtx.startTime = document.getElementById('ttgStartTime')?.value || '08:00';
    ttGenCtx.mode = document.getElementById('ttgMode')?.value || 'auto';
    ttGenCtx.overwrite = document.getElementById('ttgOverwrite')?.checked || false;

    if (!ttGenCtx.days.length) { showAlert('Select at least one day', 'error'); return; }

    const resultBox = document.getElementById('ttgResult');
    resultBox.innerHTML = '<div class="loading">Generating…</div>';
    try {
        ttGenResult = await fetchAPI('/ai/timetable/generate', {
            method: 'POST',
            body: JSON.stringify({
                class_id: ttGenCtx.classId,
                days: ttGenCtx.days,
                periods_per_day: ttGenCtx.periodsPerDay,
                period_duration_minutes: ttGenCtx.periodDuration,
                start_time: ttGenCtx.startTime,
                break_periods: ttGenCtx.breakPeriods,
                subject_periods: ttGenSubjectPeriods,
                mode: ttGenCtx.mode,
                overwrite: ttGenCtx.overwrite,
            }),
        });
        renderTimetableGenResult(resultBox);
        showAlert(ttGenResult.warning || `Timetable saved (${ttGenResult.slots_saved} slot(s))`, 'success');
    } catch (e) {
        resultBox.innerHTML = '';
        showAlert(e.message || 'Failed to generate timetable', 'error');
    }
};

function renderTimetableGenResult(box) {
    const r = ttGenResult;
    const modeBadge = r.generation_mode_used === 'ai'
        ? '<span class="badge badge-purple">🤖 AI-ordered</span>'
        : '<span class="badge badge-blue">📚 Default ordering</span>';

    const byDayPeriod = {};
    r.timetable.forEach(s => { byDayPeriod[`${s.day_of_week}_${s.period_number}`] = s; });

    const rows = [];
    for (let p = 1; p <= r.periods_per_day; p++) {
        const isBreak = r.break_periods.includes(p);
        rows.push(`
            <tr>
                <td style="font-weight:600;">${p}</td>
                ${r.days.map(d => {
                    if (isBreak) return `<td style="text-align:center; color:#94a3b8;">Break</td>`;
                    const slot = byDayPeriod[`${d}_${p}`];
                    if (!slot) return `<td style="text-align:center; color:#475569;">—</td>`;
                    return `<td>${escapeHtml(slot.subject)}${slot.teacher_name ? `<br><span style="font-size:11px; color:#94a3b8;">${escapeHtml(slot.teacher_name)}</span>` : ''}</td>`;
                }).join('')}
            </tr>
        `);
    }

    const conflictsHtml = r.conflicts.length ? `
        <div class="card" style="margin-bottom:16px; border-left:3px solid #ef4444;">
            <div class="card-title" style="color:#ef4444;">⚠️ Please review</div>
            ${r.conflicts.map(c => `<div style="font-size:13px; margin-bottom:4px;">${escapeHtml(c)}</div>`).join('')}
        </div>
    ` : '';

    box.innerHTML = `
        <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
                <div class="card-title" style="margin:0;">${escapeHtml(r.class_name)} — Generated Timetable</div>
                ${modeBadge}
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>Period</th>${r.days.map(d => `<th>${d.slice(0, 3)}</th>`).join('')}</tr></thead>
                    <tbody>${rows.join('')}</tbody>
                </table>
            </div>
        </div>
        ${conflictsHtml}
        <div style="margin-top:10px; font-size:12px; color:#94a3b8;">Saved to the Timetable module — visit Timetable → this class to fine-tune individual periods manually.</div>
    `;
}

// ==================== 6. LESSON PLANNER ====================
let lpLastGeneratedPlan = null;

async function renderLessonPlanTab(box) {
    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div class="card-title">Lesson Details</div>
            <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
                <div><label style="font-size:12px; color:#94a3b8;">Class (optional)</label><br>
                    <select id="lpClass" class="filter" style="min-width:160px;">${aiClassOptions()}</select></div>
                <div><label style="font-size:12px; color:#94a3b8;">Subject *</label><br>
                    <input type="text" id="lpSubject" class="filter" placeholder="e.g. Biology" style="min-width:150px;"></div>
                <div><label style="font-size:12px; color:#94a3b8;">Topic *</label><br>
                    <input type="text" id="lpTopic" class="filter" placeholder="e.g. Photosynthesis" style="min-width:200px;"></div>
                <div><label style="font-size:12px; color:#94a3b8;">Duration (min)</label><br>
                    <input type="number" id="lpDuration" class="filter" value="40" style="width:90px;"></div>
            </div>
            <div>
                <label style="font-size:12px; color:#94a3b8;">Generation Mode</label><br>
                <select id="lpMode" class="filter" style="min-width:220px;">
                    <option value="auto">Auto (AI if configured, else offline scaffold)</option>
                    <option value="ai">Force AI</option>
                    <option value="offline">Offline scaffold only</option>
                </select>
            </div>
        </div>
        <div style="margin-bottom:16px;">
            <button class="btn btn-primary" onclick="generateLessonPlan()">🤖 Generate Lesson Plan</button>
        </div>
        <div id="lpResult"></div>
        <div class="card" style="margin-top:20px;">
            <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
                Saved Lesson Plans
                <button class="btn btn-ghost btn-sm" onclick="loadSavedLessonPlans()">🔄 Refresh</button>
            </div>
            <div id="lpSavedList"><div class="loading">Loading…</div></div>
        </div>
    `;
    await loadSavedLessonPlans();
}

window.generateLessonPlan = async function () {
    const subject = document.getElementById('lpSubject')?.value.trim();
    const topic = document.getElementById('lpTopic')?.value.trim();
    if (!subject || !topic) { showAlert('Subject and Topic are required', 'error'); return; }

    const classId = document.getElementById('lpClass')?.value || null;
    const payload = {
        class_id: classId || null,
        subject,
        topic,
        duration_minutes: parseInt(document.getElementById('lpDuration')?.value) || 40,
        grade_level: classId ? (aiClassesCache.find(c => String(c.id) === String(classId))?.class_name || '') : '',
        mode: document.getElementById('lpMode')?.value || 'auto',
    };

    const resultBox = document.getElementById('lpResult');
    resultBox.innerHTML = '<div class="loading">Generating…</div>';
    try {
        const data = await fetchAPI('/ai/lesson-plan/generate', { method: 'POST', body: JSON.stringify(payload) });
        lpLastGeneratedPlan = data.plan;
        renderGeneratedLessonPlan(resultBox, data.plan);
        showAlert(data.plan.warning || 'Lesson plan generated and saved', 'success');
        await loadSavedLessonPlans();
    } catch (e) {
        resultBox.innerHTML = '';
        showAlert(e.message || 'Failed to generate lesson plan', 'error');
    }
};

function renderGeneratedLessonPlan(box, plan) {
    const c = plan.content;
    const modeBadge = plan.generation_mode_used === 'ai' || plan.generation_mode === 'ai'
        ? '<span class="badge badge-purple">🤖 AI Generated</span>'
        : '<span class="badge badge-blue">📚 Offline Scaffold</span>';

    box.innerHTML = `
        <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
                <div>
                    <div style="font-weight:600; font-size:15px;">${escapeHtml(c.subject)} — ${escapeHtml(c.topic)}</div>
                    <div style="font-size:12px; color:#94a3b8;">${plan.class_name ? escapeHtml(plan.class_name) + ' · ' : ''}${c.duration_minutes} minutes</div>
                </div>
                ${modeBadge}
            </div>

            <div style="margin-bottom:10px;"><strong>Objectives</strong>
                <ul style="margin:4px 0 0 18px;">${c.objectives.map(o => `<li>${escapeHtml(o)}</li>`).join('')}</ul></div>

            ${c.materials.length ? `<div style="margin-bottom:10px;"><strong>Materials</strong>
                <ul style="margin:4px 0 0 18px;">${c.materials.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul></div>` : ''}

            <div style="margin-bottom:10px;"><strong>Warm-up</strong> <span style="color:#94a3b8; font-size:12px;">(${c.warm_up.duration_minutes} min)</span>
                <div style="margin-top:2px;">${escapeHtml(c.warm_up.description)}</div></div>

            <div style="margin-bottom:10px;"><strong>Main Activities</strong>
                <ol style="margin:4px 0 0 18px;">
                    ${c.main_activities.map(a => `<li style="margin-bottom:6px;"><strong>${escapeHtml(a.title)}</strong> <span style="color:#94a3b8; font-size:12px;">(${a.duration_minutes} min)</span><div>${escapeHtml(a.description)}</div></li>`).join('')}
                </ol></div>

            ${c.assessment ? `<div style="margin-bottom:10px;"><strong>Assessment</strong><div style="margin-top:2px;">${escapeHtml(c.assessment)}</div></div>` : ''}
            ${c.homework ? `<div style="margin-bottom:10px;"><strong>Homework</strong><div style="margin-top:2px;">${escapeHtml(c.homework)}</div></div>` : ''}
            ${c.differentiation ? `<div style="margin-bottom:10px;"><strong>Differentiation</strong><div style="margin-top:2px;">${escapeHtml(c.differentiation)}</div></div>` : ''}

            <button class="btn btn-ghost btn-sm" onclick="printLessonPlan(${plan.id})" style="margin-top:6px;">🖨️ Print</button>
        </div>
    `;
}

window.loadSavedLessonPlans = async function () {
    const listEl = document.getElementById('lpSavedList');
    if (!listEl) return;
    listEl.innerHTML = '<div class="loading">Loading…</div>';
    try {
        const data = await fetchAPI('/ai/lesson-plan');
        const plans = data.plans || [];
        listEl.innerHTML = plans.length ? `
            <div class="table-wrap"><table class="data-table">
                <thead><tr><th>Subject</th><th>Topic</th><th>Class</th><th>Duration</th><th>Mode</th><th>Created</th><th></th></tr></thead>
                <tbody>
                    ${plans.map(p => `
                        <tr>
                            <td>${escapeHtml(p.subject)}</td>
                            <td>${escapeHtml(p.topic)}</td>
                            <td>${escapeHtml(p.class_name || 'General')}</td>
                            <td>${p.duration_minutes} min</td>
                            <td>${p.generation_mode === 'ai' ? '🤖 AI' : '📚 Offline'}</td>
                            <td>${escapeHtml((p.created_at || '').slice(0, 16))}</td>
                            <td class="actions">
                                <button class="btn btn-ghost btn-sm" onclick="viewSavedLessonPlan(${p.id})">👁 View</button>
                                <button class="btn btn-ghost btn-sm" onclick="printLessonPlan(${p.id})">🖨</button>
                                <button class="btn btn-danger btn-sm" onclick="deleteSavedLessonPlan(${p.id})">🗑</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table></div>
        ` : '<div style="text-align:center; color:#94a3b8; padding:16px;">No saved lesson plans yet — generate one above.</div>';
    } catch (e) {
        listEl.innerHTML = '<div class="loading">Failed to load saved lesson plans.</div>';
    }
};

window.viewSavedLessonPlan = async function (planId) {
    const data = await fetchAPI(`/ai/lesson-plan/${planId}`);
    const resultBox = document.getElementById('lpResult');
    if (resultBox) {
        renderGeneratedLessonPlan(resultBox, data.plan);
        resultBox.scrollIntoView({ behavior: 'smooth' });
    }
};

window.deleteSavedLessonPlan = async function (planId) {
    if (!confirm('Delete this lesson plan?')) return;
    try {
        await fetchAPI(`/ai/lesson-plan/${planId}`, { method: 'DELETE' });
        await loadSavedLessonPlans();
    } catch (e) {
        showAlert('Failed to delete lesson plan', 'error');
    }
};

window.printLessonPlan = async function (planId) {
    const data = await fetchAPI(`/ai/lesson-plan/${planId}`);
    const p = data.plan;
    const c = p.content;
    let content = `
        <div style="text-align:center; margin-bottom:14px;">
            <div style="font-size:14px; font-weight:600;">${escapeHtml(c.subject)} — ${escapeHtml(c.topic)}</div>
            <div style="font-size:12px;">${p.class_name ? escapeHtml(p.class_name) + ' — ' : ''}${c.duration_minutes} minutes</div>
        </div>
        <p><strong>Objectives:</strong></p>
        <ul>${c.objectives.map(o => `<li>${escapeHtml(o)}</li>`).join('')}</ul>
        ${c.materials.length ? `<p><strong>Materials:</strong></p><ul>${c.materials.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul>` : ''}
        <p><strong>Warm-up (${c.warm_up.duration_minutes} min):</strong> ${escapeHtml(c.warm_up.description)}</p>
        <p><strong>Main Activities:</strong></p>
        <ol>${c.main_activities.map(a => `<li><strong>${escapeHtml(a.title)}</strong> (${a.duration_minutes} min) — ${escapeHtml(a.description)}</li>`).join('')}</ol>
        ${c.assessment ? `<p><strong>Assessment:</strong> ${escapeHtml(c.assessment)}</p>` : ''}
        ${c.homework ? `<p><strong>Homework:</strong> ${escapeHtml(c.homework)}</p>` : ''}
        ${c.differentiation ? `<p><strong>Differentiation:</strong> ${escapeHtml(c.differentiation)}</p>` : ''}
    `;
    printPreview(content, `Lesson Plan — ${c.subject}: ${c.topic}`);
};

// ==================== 7. PERFORMANCE ANALYSIS ====================
let perfCurrentStudent = null;

async function renderPerformanceTab(box) {
    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div class="card-title">Find Student</div>
            <div style="display:flex; gap:8px;">
                <input type="text" id="perfSearch" class="filter" placeholder="Search by name or ID..." style="flex:1; min-width:200px;" onkeydown="if(event.key==='Enter') searchPerfStudent()">
                <button class="btn btn-primary btn-sm" onclick="searchPerfStudent()">Search</button>
            </div>
            <div id="perfSearchResults" style="margin-top:10px;"></div>
        </div>
        <div id="perfBody"></div>
    `;
}

window.searchPerfStudent = async function () {
    const q = document.getElementById('perfSearch')?.value.trim();
    if (!q) return;
    const resultsEl = document.getElementById('perfSearchResults');
    resultsEl.innerHTML = '<div class="loading">Searching…</div>';
    try {
        const data = await fetchAPI(`/students?q=${encodeURIComponent(q)}`);
        const students = (data.students || []).slice(0, 10);
        resultsEl.innerHTML = students.length ? students.map(s => `
            <button class="btn btn-ghost btn-sm" style="margin:2px;" onclick="loadPerfStudent('${s.id}')">${escapeHtml(s.name)} (${escapeHtml(s.id)}) — ${escapeHtml(s.grade || '')}</button>
        `).join('') : '<div style="color:#94a3b8; font-size:13px;">No students found.</div>';
    } catch (e) {
        resultsEl.innerHTML = '';
        showAlert('Search failed', 'error');
    }
};

window.loadPerfStudent = async function (studentId) {
    perfCurrentStudent = studentId;
    const bodyEl = document.getElementById('perfBody');
    bodyEl.innerHTML = '<div class="loading">Analyzing…</div>';
    try {
        const data = await fetchAPI(`/ai/performance/${studentId}`);
        renderPerfResult(bodyEl, data);
    } catch (e) {
        bodyEl.innerHTML = '';
        showAlert(e.message || 'Failed to analyze student', 'error');
    }
};

function renderPerfResult(box, data) {
    if (!data.has_data) {
        box.innerHTML = `<div class="card" style="text-align:center; padding:30px; color:#94a3b8;">${escapeHtml(data.student_name)}: ${escapeHtml(data.message)}</div>`;
        return;
    }

    const trendColor = { improving: '#22c55e', declining: '#ef4444', stable: '#94a3b8', insufficient_data: '#94a3b8' }[data.overall.trend];
    const trendIcon = { improving: '📈', declining: '📉', stable: '➡️', insufficient_data: '❔' }[data.overall.trend];
    const modeBadge = data.generation_mode_used === 'ai'
        ? '<span class="badge badge-purple">🤖 AI Summary</span>'
        : '<span class="badge badge-blue">📊 Computed Summary</span>';

    const historyRows = data.history.map(h => `
        <tr>
            <td>${escapeHtml(h.term)} ${escapeHtml(h.year)}</td>
            <td>${escapeHtml(h.class_name)}</td>
            <td>${h.percentage}%</td>
            <td>${h.class_average !== null ? h.class_average + '%' : '-'}</td>
            <td>${escapeHtml(h.grade || '-')}</td>
            <td>${h.position || '-'}</td>
        </tr>
    `).join('');

    const subjectRows = data.subject_breakdown.map(s => {
        const sIcon = { improving: '📈', declining: '📉', stable: '➡️', insufficient_data: '' }[s.trend];
        return `<tr><td>${escapeHtml(s.subject)}</td><td>${s.average_percentage}%</td><td>${s.exam_count}</td><td>${sIcon} ${s.trend.replace('_', ' ')}</td></tr>`;
    }).join('');

    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
                <div style="font-weight:600; font-size:16px;">${escapeHtml(data.student_name)}</div>
                ${modeBadge}
            </div>
            <div style="display:flex; gap:20px; flex-wrap:wrap; margin-bottom:12px;">
                <div><div style="font-size:12px; color:#94a3b8;">Average</div><div style="font-size:18px; font-weight:600;">${data.overall.average_percentage}%</div></div>
                <div><div style="font-size:12px; color:#94a3b8;">Latest</div><div style="font-size:18px; font-weight:600;">${data.overall.latest_percentage}%</div></div>
                <div><div style="font-size:12px; color:#94a3b8;">Trend</div><div style="font-size:18px; font-weight:600; color:${trendColor};">${trendIcon} ${data.overall.trend.replace('_', ' ')}</div></div>
                <div><div style="font-size:12px; color:#94a3b8;">Exams on record</div><div style="font-size:18px; font-weight:600;">${data.overall.exam_count}</div></div>
            </div>
            <div style="background:rgba(148,163,184,0.08); border-radius:8px; padding:12px; font-size:13px; line-height:1.5;">${escapeHtml(data.narrative)}</div>
            ${data.warning ? `<div style="margin-top:8px; font-size:12px; color:#f59e0b;">${escapeHtml(data.warning)}</div>` : ''}
        </div>

        <div style="display:flex; gap:16px; flex-wrap:wrap;">
            <div class="card" style="flex:2; min-width:320px;">
                <div class="card-title">Exam History</div>
                <div class="table-wrap"><table class="data-table">
                    <thead><tr><th>Exam</th><th>Class</th><th>%</th><th>Class Avg</th><th>Grade</th><th>Position</th></tr></thead>
                    <tbody>${historyRows}</tbody>
                </table></div>
            </div>
            <div class="card" style="flex:1; min-width:260px;">
                <div class="card-title">Subject Breakdown</div>
                <div class="table-wrap"><table class="data-table">
                    <thead><tr><th>Subject</th><th>Avg</th><th>Exams</th><th>Trend</th></tr></thead>
                    <tbody>${subjectRows}</tbody>
                </table></div>
            </div>
        </div>
    `;
}

// ==================== 8. FEE PREDICTION ====================
let feePredictData = null;

async function renderFeePredictTab(box) {
    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div class="card-title">Scope</div>
            <select id="fpClass" class="filter" style="min-width:200px;">
                <option value="">Whole school</option>
                ${aiClassesCache.map(c => `<option value="${escapeHtml(c.class_name)}">${escapeHtml(c.class_name)}</option>`).join('')}
            </select>
            <button class="btn btn-primary btn-sm" onclick="loadFeePrediction()" style="margin-left:8px;">Analyze</button>
        </div>
        <div id="fpBody"></div>
    `;
    await loadFeePrediction();
}

window.loadFeePrediction = async function () {
    const className = document.getElementById('fpClass')?.value || '';
    const bodyEl = document.getElementById('fpBody');
    bodyEl.innerHTML = '<div class="loading">Analyzing fee history…</div>';
    try {
        feePredictData = await fetchAPI(`/ai/fee-prediction/class${className ? '?class_name=' + encodeURIComponent(className) : ''}`);
        renderFeePredictBody(bodyEl);
    } catch (e) {
        bodyEl.innerHTML = '';
        showAlert(e.message || 'Failed to analyze fee data', 'error');
    }
};

function renderFeePredictBody(box) {
    const d = feePredictData;
    if (!d.has_data) {
        box.innerHTML = `<div class="card" style="text-align:center; padding:30px; color:#94a3b8;">${escapeHtml(d.message)}</div>`;
        return;
    }
    const o = d.overall;
    const modeBadge = d.generation_mode_used === 'ai'
        ? '<span class="badge badge-purple">🤖 AI Summary</span>'
        : '<span class="badge badge-blue">📊 Computed Summary</span>';

    const riskBadge = (level) => level === 'high'
        ? '<span class="badge badge-red">High</span>'
        : level === 'medium' ? '<span class="badge badge-yellow">Medium</span>' : '<span class="badge badge-green">Low</span>';

    const rows = d.students.map(s => `
        <tr>
            <td>${escapeHtml(s.student_name)}</td>
            <td>${escapeHtml(s.grade || '')}</td>
            <td>${riskBadge(s.risk_level)}</td>
            <td>${s.risk_score}</td>
            <td>${s.paid_late}</td>
            <td>${s.unpaid_overdue}</td>
            <td>Rs. ${s.current_outstanding.toLocaleString()}</td>
            <td><button class="btn btn-ghost btn-sm" onclick="loadFeePredictionStudent('${s.student_id}')">👁 Details</button></td>
        </tr>
    `).join('');

    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
                <div style="font-weight:600;">Fee Risk Overview</div>
                ${modeBadge}
            </div>
            <div style="display:flex; gap:20px; flex-wrap:wrap; margin-bottom:12px;">
                <div><div style="font-size:12px; color:#94a3b8;">Students Analyzed</div><div style="font-size:18px; font-weight:600;">${o.total_students}</div></div>
                <div><div style="font-size:12px; color:#94a3b8;">High Risk</div><div style="font-size:18px; font-weight:600; color:#ef4444;">${o.high_risk_count}</div></div>
                <div><div style="font-size:12px; color:#94a3b8;">Medium Risk</div><div style="font-size:18px; font-weight:600; color:#f59e0b;">${o.medium_risk_count}</div></div>
                <div><div style="font-size:12px; color:#94a3b8;">Total Outstanding</div><div style="font-size:18px; font-weight:600;">Rs. ${o.total_outstanding.toLocaleString()}</div></div>
                <div><div style="font-size:12px; color:#94a3b8;">Historical Collection Rate</div><div style="font-size:18px; font-weight:600;">${o.historical_collection_rate_pct}%</div></div>
            </div>
            <div style="background:rgba(148,163,184,0.08); border-radius:8px; padding:12px; font-size:13px; line-height:1.5;">${escapeHtml(d.narrative)}</div>
            ${d.warning ? `<div style="margin-top:8px; font-size:12px; color:#f59e0b;">${escapeHtml(d.warning)}</div>` : ''}
        </div>

        <div class="card">
            <div class="card-title">Students by Risk (highest first)</div>
            <div class="table-wrap"><table class="data-table">
                <thead><tr><th>Student</th><th>Class</th><th>Risk</th><th>Score</th><th>Late</th><th>Overdue</th><th>Outstanding</th><th></th></tr></thead>
                <tbody>${rows}</tbody>
            </table></div>
        </div>

        <div id="fpStudentDetail" style="margin-top:16px;"></div>
    `;
}

window.loadFeePredictionStudent = async function (studentId) {
    const detailEl = document.getElementById('fpStudentDetail');
    detailEl.innerHTML = '<div class="loading">Loading…</div>';
    try {
        const data = await fetchAPI(`/ai/fee-prediction/student/${studentId}`);
        const s = data.student;
        const modeBadge = data.generation_mode_used === 'ai'
            ? '<span class="badge badge-purple">🤖 AI</span>'
            : '<span class="badge badge-blue">📊 Computed</span>';
        detailEl.innerHTML = `
            <div class="card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <div style="font-weight:600;">${escapeHtml(s.student_name)} — Fee Payment Detail</div>
                    ${modeBadge}
                </div>
                <div style="font-size:13px; margin-bottom:8px;">
                    Months billed: ${s.months_billed} · On-time: ${s.paid_on_time} · Late: ${s.paid_late} · Overdue: ${s.unpaid_overdue} · Outstanding: Rs. ${s.current_outstanding.toLocaleString()}
                </div>
                <div style="background:rgba(148,163,184,0.08); border-radius:8px; padding:12px; font-size:13px; line-height:1.5;">${escapeHtml(data.narrative)}</div>
            </div>
        `;
        detailEl.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
        detailEl.innerHTML = '';
        showAlert('Failed to load student detail', 'error');
    }
};

// ==================== 9. ATTENDANCE RISK ====================
let attRiskData = null;

async function renderAttendanceRiskTab(box) {
    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div class="card-title">Scope</div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
                <div><label style="font-size:12px; color:#94a3b8;">Class</label><br>
                    <select id="arClass" class="filter" style="min-width:200px;">
                        <option value="">Whole school</option>
                        ${aiClassesCache.map(c => `<option value="${escapeHtml(c.class_name)}">${escapeHtml(c.class_name)}</option>`).join('')}
                    </select></div>
                <div><label style="font-size:12px; color:#94a3b8;">Window</label><br>
                    <select id="arWindow" class="filter" style="width:150px;">
                        <option value="14">Last 14 days</option>
                        <option value="30" selected>Last 30 days</option>
                        <option value="60">Last 60 days</option>
                        <option value="90">Last 90 days</option>
                    </select></div>
                <button class="btn btn-primary btn-sm" onclick="loadAttendanceRisk()">Analyze</button>
            </div>
        </div>
        <div id="arBody"></div>
    `;
    await loadAttendanceRisk();
}

window.loadAttendanceRisk = async function () {
    const className = document.getElementById('arClass')?.value || '';
    const windowDays = document.getElementById('arWindow')?.value || 30;
    const bodyEl = document.getElementById('arBody');
    bodyEl.innerHTML = '<div class="loading">Analyzing attendance history…</div>';
    try {
        const qs = new URLSearchParams({ window_days: windowDays });
        if (className) qs.set('class_name', className);
        attRiskData = await fetchAPI(`/ai/attendance-risk/class?${qs.toString()}`);
        renderAttendanceRiskBody(bodyEl);
    } catch (e) {
        bodyEl.innerHTML = '';
        showAlert(e.message || 'Failed to analyze attendance', 'error');
    }
};

function renderAttendanceRiskBody(box) {
    const d = attRiskData;
    if (!d.has_data) {
        box.innerHTML = `<div class="card" style="text-align:center; padding:30px; color:#94a3b8;">${escapeHtml(d.message)}</div>`;
        return;
    }
    const o = d.overall;
    const modeBadge = d.generation_mode_used === 'ai'
        ? '<span class="badge badge-purple">🤖 AI Summary</span>'
        : '<span class="badge badge-blue">📊 Computed Summary</span>';

    const riskBadge = (level) => level === 'high'
        ? '<span class="badge badge-red">High</span>'
        : level === 'medium' ? '<span class="badge badge-yellow">Medium</span>' : '<span class="badge badge-green">Low</span>';

    const trendIcon = { worsening: '📉', improving: '📈', stable: '➡️', insufficient_data: '' };

    const rows = d.students.map(s => `
        <tr>
            <td>${escapeHtml(s.student_name)}</td>
            <td>${escapeHtml(s.grade || '')}</td>
            <td>${riskBadge(s.risk_level)}</td>
            <td>${s.attendance_rate_pct}%</td>
            <td>${s.current_absence_streak}</td>
            <td>${trendIcon[s.trend] || ''} ${s.trend.replace('_', ' ')}</td>
            <td><button class="btn btn-ghost btn-sm" onclick="loadAttendanceRiskStudent('${s.student_id}')">👁 Details</button></td>
        </tr>
    `).join('');

    box.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
                <div style="font-weight:600;">Attendance Risk Overview (last ${d.window_days} days)</div>
                ${modeBadge}
            </div>
            <div style="display:flex; gap:20px; flex-wrap:wrap; margin-bottom:12px;">
                <div><div style="font-size:12px; color:#94a3b8;">Students Analyzed</div><div style="font-size:18px; font-weight:600;">${o.total_students}</div></div>
                <div><div style="font-size:12px; color:#94a3b8;">High Risk</div><div style="font-size:18px; font-weight:600; color:#ef4444;">${o.high_risk_count}</div></div>
                <div><div style="font-size:12px; color:#94a3b8;">Medium Risk</div><div style="font-size:18px; font-weight:600; color:#f59e0b;">${o.medium_risk_count}</div></div>
                <div><div style="font-size:12px; color:#94a3b8;">Avg Attendance Rate</div><div style="font-size:18px; font-weight:600;">${o.average_attendance_rate_pct}%</div></div>
            </div>
            <div style="background:rgba(148,163,184,0.08); border-radius:8px; padding:12px; font-size:13px; line-height:1.5;">${escapeHtml(d.narrative)}</div>
            ${d.warning ? `<div style="margin-top:8px; font-size:12px; color:#f59e0b;">${escapeHtml(d.warning)}</div>` : ''}
        </div>

        <div class="card">
            <div class="card-title">Students by Risk (highest first)</div>
            <div class="table-wrap"><table class="data-table">
                <thead><tr><th>Student</th><th>Class</th><th>Risk</th><th>Attendance</th><th>Absence Streak</th><th>Trend</th><th></th></tr></thead>
                <tbody>${rows}</tbody>
            </table></div>
        </div>

        <div id="arStudentDetail" style="margin-top:16px;"></div>
    `;
}

window.loadAttendanceRiskStudent = async function (studentId) {
    const windowDays = document.getElementById('arWindow')?.value || 30;
    const detailEl = document.getElementById('arStudentDetail');
    detailEl.innerHTML = '<div class="loading">Loading…</div>';
    try {
        const data = await fetchAPI(`/ai/attendance-risk/student/${studentId}?window_days=${windowDays}`);
        const s = data.student;
        const modeBadge = data.generation_mode_used === 'ai'
            ? '<span class="badge badge-purple">🤖 AI</span>'
            : '<span class="badge badge-blue">📊 Computed</span>';
        detailEl.innerHTML = `
            <div class="card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <div style="font-weight:600;">${escapeHtml(s.student_name)} — Attendance Detail</div>
                    ${modeBadge}
                </div>
                <div style="font-size:13px; margin-bottom:8px;">
                    Days marked: ${s.days_marked} · Present: ${s.present} · Absent: ${s.absent} · Late: ${s.late} · Leave: ${s.leave} · Rate: ${s.attendance_rate_pct}% · Longest recent streak: ${s.current_absence_streak} day(s)
                </div>
                <div style="background:rgba(148,163,184,0.08); border-radius:8px; padding:12px; font-size:13px; line-height:1.5;">${escapeHtml(data.narrative)}</div>
            </div>
        `;
        detailEl.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
        detailEl.innerHTML = '';
        showAlert('Failed to load student detail', 'error');
    }
};
