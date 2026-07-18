// ============================================
// CLASSES.JS — Classes list page, class CRUD,
// and per-class subject management.
// ============================================

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
                                    <button onclick="goToClassIdCards('${escapeHtml(c.class_name)}')" class="btn btn-ghost btn-sm" title="Print ID cards for this class">🪪</button>
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
                <button onclick="goToClassIdCards('${escapeHtml(c.class_name)}')" class="btn btn-ghost btn-sm" title="Print ID cards for this class">🪪</button>
                <button onclick="deleteClass(${c.id})" class="btn btn-danger btn-sm">🗑</button>
            </td>
        </tr>
    `).join('');
    }
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
                <button onclick="goToClassIdCards('${escapeHtml(c.class_name)}')" class="btn btn-ghost btn-sm" title="Print ID cards for this class">🪪</button>
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

