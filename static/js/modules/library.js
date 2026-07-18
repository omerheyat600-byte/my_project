// ============================================
// LIBRARY.JS — Library page: catalog, issue/return,
// fines, and reservation queue.
// ============================================

let libraryStudentsCache = [];
let libraryBooksCache = [];

async function loadLibrary() {
    try {
        const [dashboard, booksData, studentsData] = await Promise.all([
            fetchAPI('/library/dashboard'),
            fetchAPI('/library/books'),
            fetchAPI('/students'),
        ]);

        libraryStudentsCache = studentsData.students || [];
        libraryBooksCache = booksData.books || [];

        const html = `
            <div class="page-header">
                <div class="page-title">Library</div>
                <div class="page-sub">Catalog, issue/return, fines, and reservations.</div>
            </div>
            <div class="kpi-grid">
                <div class="kpi-card"><div class="kpi-label">Total Books</div><div class="kpi-value">${dashboard.total_books || 0}</div></div>
                <div class="kpi-card"><div class="kpi-label">Copies Available</div><div class="kpi-value" style="color:var(--green)">${dashboard.available_copies || 0}/${dashboard.total_copies || 0}</div></div>
                <div class="kpi-card"><div class="kpi-label">Currently Issued</div><div class="kpi-value">${dashboard.issued_count || 0}</div></div>
                <div class="kpi-card"><div class="kpi-label">Overdue</div><div class="kpi-value" style="color:var(--red)">${dashboard.overdue_count || 0}</div></div>
                <div class="kpi-card"><div class="kpi-label">Pending Fines</div><div class="kpi-value" style="color:var(--red)">PKR ${Number(dashboard.pending_fines || 0).toLocaleString()}</div></div>
                <div class="kpi-card"><div class="kpi-label">Active Reservations</div><div class="kpi-value">${dashboard.active_reservations || 0}</div></div>
            </div>

            <div class="card" style="margin-bottom:0;">
                <div class="toolbar" style="border-bottom:1px solid #334155; padding-bottom:0;">
                    <button class="btn btn-ghost btn-sm library-tab-btn active" data-tab="catalog" onclick="switchLibraryTab('catalog')">📚 Catalog</button>
                    <button class="btn btn-ghost btn-sm library-tab-btn" data-tab="issues" onclick="switchLibraryTab('issues')">📗 Issued Books</button>
                    <button class="btn btn-ghost btn-sm library-tab-btn" data-tab="reservations" onclick="switchLibraryTab('reservations')">⏳ Reservations</button>
                    <button class="btn btn-ghost btn-sm library-tab-btn" data-tab="fines" onclick="switchLibraryTab('fines')">💵 Fines</button>
                </div>
            </div>

            <div id="libraryCatalogTab"></div>
            <div id="libraryIssuesTab" style="display:none;"></div>
            <div id="libraryReservationsTab" style="display:none;"></div>
            <div id="libraryFinesTab" style="display:none;"></div>

            ${renderBookModal()}
            ${renderIssueModal()}
            ${renderReserveModal()}
        `;
        document.getElementById('page-content').innerHTML = html;
        renderLibraryCatalogTab(libraryBooksCache, booksData.categories || []);
    } catch (e) {
        console.error(e);
        document.getElementById('page-content').innerHTML = '<div class="loading">Failed to load library.</div>';
    }
}

window.switchLibraryTab = async function(tab) {
    document.querySelectorAll('.library-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    ['catalog', 'issues', 'reservations', 'fines'].forEach(t => {
        const el = document.getElementById(`library${t.charAt(0).toUpperCase() + t.slice(1)}Tab`);
        if (el) el.style.display = (t === tab) ? 'block' : 'none';
    });
    if (tab === 'issues') await loadLibraryIssuesTab();
    if (tab === 'reservations') await loadLibraryReservationsTab();
    if (tab === 'fines') await loadLibraryFinesTab();
};

// ============================================
// CATALOG TAB
// ============================================
function renderLibraryCatalogTab(books, categories) {
    const el = document.getElementById('libraryCatalogTab');
    if (!el) return;
    el.innerHTML = `
        <div class="card">
            <div class="toolbar">
                <div class="search-wrap"><input type="text" id="bookSearch" placeholder="Search title, author, ISBN..."></div>
                <select id="bookCategoryFilter" class="filter"><option value="">All Categories</option>${categories.map(c => `<option value="${c}">${c}</option>`).join('')}</select>
                <button onclick="filterBooks()" class="btn btn-ghost btn-sm">Filter</button>
                <button onclick="showBookModal()" class="btn btn-primary">+ Add Book</button>
            </div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>Title</th><th>Author</th><th>Category</th><th>ISBN</th><th>Available</th><th>Shelf</th><th>Actions</th></tr></thead>
                    <tbody id="booksTableBody">${renderBookRows(books)}</tbody>
                </table>
            </div>
        </div>
    `;
}

function renderBookRows(books) {
    if (!books.length) return '<tr><td colspan="7" class="empty-hint">No books in the catalog yet.</td></tr>';
    return books.map(b => `
        <tr>
            <td style="font-weight:500">${escapeHtml(b.title)}</td>
            <td>${escapeHtml(b.author || '-')}</td>
            <td>${b.category ? `<span class="badge badge-purple">${escapeHtml(b.category)}</span>` : '-'}</td>
            <td>${escapeHtml(b.isbn || '-')}</td>
            <td>${b.available_copies > 0
                ? `<span class="badge badge-green">${b.available_copies}/${b.total_copies}</span>`
                : `<span class="badge badge-red">0/${b.total_copies}</span>`}</td>
            <td>${escapeHtml(b.shelf_location || '-')}</td>
            <td class="actions">
                ${b.available_copies > 0
                    ? `<button onclick="showIssueModal(${b.id})" class="btn btn-primary btn-sm">Issue</button>`
                    : `<button onclick="showReserveModal(${b.id})" class="btn btn-ghost btn-sm">Reserve</button>`}
                <button onclick="editBook(${b.id})" class="btn btn-ghost btn-sm">✏</button>
                <button onclick="deleteBook(${b.id})" class="btn btn-danger btn-sm">🗑</button>
            </td>
        </tr>
    `).join('');
}

window.filterBooks = async function() {
    const q = document.getElementById('bookSearch')?.value || '';
    const category = document.getElementById('bookCategoryFilter')?.value || '';
    let url = `/library/books?q=${encodeURIComponent(q)}`;
    if (category) url += `&category=${encodeURIComponent(category)}`;
    const data = await fetchAPI(url);
    libraryBooksCache = data.books || [];
    const tbody = document.getElementById('booksTableBody');
    if (tbody) tbody.innerHTML = renderBookRows(libraryBooksCache);
};

function renderBookModal() {
    return `
        <div id="bookModal" class="modal-overlay">
            <div class="modal">
                <div class="modal-header"><h2 id="bookModalTitle">Add Book</h2><span class="close-btn" onclick="closeBookModal()">&times;</span></div>
                <div class="modal-body">
                    <form id="bookForm" onsubmit="event.preventDefault(); saveBook();">
                        <input type="hidden" id="bookId">
                        <div class="form-grid">
                            <div class="form-group full"><label for="bookTitle">Title *</label><input type="text" id="bookTitle" required></div>
                            <div class="form-group"><label for="bookAuthor">Author</label><input type="text" id="bookAuthor"></div>
                            <div class="form-group"><label for="bookIsbn">ISBN</label><input type="text" id="bookIsbn"></div>
                            <div class="form-group">
                                <label for="bookCategory">Category</label>
                                <select id="bookCategory">
                                    ${['Fiction','Non-Fiction','Science','Mathematics','History','Biography','Reference','Textbook','Islamiat','Urdu Literature','Children','Other'].map(c => `<option>${c}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group"><label for="bookPublisher">Publisher</label><input type="text" id="bookPublisher"></div>
                            <div class="form-group"><label for="bookTotalCopies">Total Copies *</label><input type="number" min="1" id="bookTotalCopies" value="1" required></div>
                            <div class="form-group"><label for="bookShelf">Shelf Location</label><input type="text" id="bookShelf" placeholder="e.g. Rack B-3"></div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-ghost" onclick="closeBookModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary">Save Book</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
}

window.showBookModal = function() {
    document.getElementById('bookModalTitle').innerText = 'Add Book';
    document.getElementById('bookForm').reset();
    document.getElementById('bookId').value = '';
    document.getElementById('bookTotalCopies').value = 1;
    document.getElementById('bookModal').classList.add('active');
};
window.closeBookModal = function() { document.getElementById('bookModal').classList.remove('active'); };

window.editBook = function(id) {
    const book = libraryBooksCache.find(b => b.id === id);
    if (!book) return;
    document.getElementById('bookModalTitle').innerText = 'Edit Book';
    document.getElementById('bookId').value = book.id;
    document.getElementById('bookTitle').value = book.title || '';
    document.getElementById('bookAuthor').value = book.author || '';
    document.getElementById('bookIsbn').value = book.isbn || '';
    document.getElementById('bookCategory').value = book.category || 'Fiction';
    document.getElementById('bookPublisher').value = book.publisher || '';
    document.getElementById('bookTotalCopies').value = book.total_copies || 1;
    document.getElementById('bookShelf').value = book.shelf_location || '';
    document.getElementById('bookModal').classList.add('active');
};

window.saveBook = async function() {
    const id = document.getElementById('bookId').value;
    const data = {
        title: document.getElementById('bookTitle').value,
        author: document.getElementById('bookAuthor').value,
        isbn: document.getElementById('bookIsbn').value,
        category: document.getElementById('bookCategory').value,
        publisher: document.getElementById('bookPublisher').value,
        total_copies: parseInt(document.getElementById('bookTotalCopies').value || '1'),
        shelf_location: document.getElementById('bookShelf').value,
    };
    if (!data.title) { showAlert('Title is required', 'error'); return; }
    try {
        if (id) {
            await fetchAPI(`/library/books/${id}`, { method: 'PUT', body: JSON.stringify(data) });
            showAlert('Book updated');
        } else {
            await fetchAPI('/library/books', { method: 'POST', body: JSON.stringify(data) });
            showAlert('Book added');
        }
        closeBookModal();
        await loadLibrary();
    } catch (e) { console.error(e); }
};

window.deleteBook = async function(id) {
    if (!confirm('Delete this book from the catalog?')) return;
    try {
        await fetchAPI(`/library/books/${id}`, { method: 'DELETE' });
        showAlert('Book deleted');
        await loadLibrary();
    } catch (e) { console.error(e); }
};

// ============================================
// ISSUE MODAL (shared: catalog "Issue" action + reservation fulfillment)
// ============================================
function renderIssueModal() {
    return `
        <div id="issueModal" class="modal-overlay">
            <div class="modal">
                <div class="modal-header"><h2>Issue Book</h2><span class="close-btn" onclick="closeIssueModal()">&times;</span></div>
                <div class="modal-body">
                    <form id="issueForm" onsubmit="event.preventDefault(); saveIssue();">
                        <input type="hidden" id="issueBookId">
                        <div class="form-grid">
                            <div class="form-group full"><label>Book</label><input type="text" id="issueBookTitle" disabled></div>
                            <div class="form-group full">
                                <label for="issueStudentId">Student *</label>
                                <select id="issueStudentId" required>
                                    <option value="">Select Student</option>
                                    ${libraryStudentsCache.map(s => `<option value="${s.id}" data-name="${escapeHtml(s.name)}">${escapeHtml(s.name)} (${s.grade || ''})</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group"><label for="issueDate">Issue Date</label><input type="date" id="issueDate"></div>
                            <div class="form-group"><label for="issueDueDate">Due Date (optional — defaults to loan period)</label><input type="date" id="issueDueDate"></div>
                            <div class="form-group full"><label for="issueRemarks">Remarks</label><input type="text" id="issueRemarks"></div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-ghost" onclick="closeIssueModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary">Issue Book</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
}

window.showIssueModal = function(bookId) {
    const book = libraryBooksCache.find(b => b.id === bookId);
    document.getElementById('issueBookId').value = bookId;
    document.getElementById('issueBookTitle').value = book ? book.title : '';
    document.getElementById('issueForm').reset();
    document.getElementById('issueBookId').value = bookId;
    document.getElementById('issueBookTitle').value = book ? book.title : '';
    document.getElementById('issueDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('issueModal').classList.add('active');
};
window.closeIssueModal = function() { document.getElementById('issueModal').classList.remove('active'); };

window.saveIssue = async function() {
    const bookId = document.getElementById('issueBookId').value;
    const studentSelect = document.getElementById('issueStudentId');
    const studentId = studentSelect.value;
    const studentName = studentSelect.selectedOptions[0]?.dataset.name || '';
    if (!studentId) { showAlert('Please select a student', 'error'); return; }

    const data = {
        book_id: parseInt(bookId),
        student_id: studentId,
        student_name: studentName,
        issue_date: document.getElementById('issueDate').value,
        due_date: document.getElementById('issueDueDate').value || undefined,
        remarks: document.getElementById('issueRemarks').value,
    };
    try {
        await fetchAPI('/library/issue', { method: 'POST', body: JSON.stringify(data) });
        showAlert('Book issued successfully');
        closeIssueModal();
        await loadLibrary();
    } catch (e) { console.error(e); }
};

// ============================================
// RESERVE MODAL
// ============================================
function renderReserveModal() {
    return `
        <div id="reserveModal" class="modal-overlay">
            <div class="modal">
                <div class="modal-header"><h2>Reserve Book</h2><span class="close-btn" onclick="closeReserveModal()">&times;</span></div>
                <div class="modal-body">
                    <p style="color:var(--muted); font-size:13px; margin-bottom:12px;">All copies of this book are currently out. Add this student to the waiting list — they'll move to "Ready" automatically when a copy is returned.</p>
                    <form id="reserveForm" onsubmit="event.preventDefault(); saveReservation();">
                        <input type="hidden" id="reserveBookId">
                        <div class="form-grid">
                            <div class="form-group full"><label>Book</label><input type="text" id="reserveBookTitle" disabled></div>
                            <div class="form-group full">
                                <label for="reserveStudentId">Student *</label>
                                <select id="reserveStudentId" required>
                                    <option value="">Select Student</option>
                                    ${libraryStudentsCache.map(s => `<option value="${s.id}" data-name="${escapeHtml(s.name)}">${escapeHtml(s.name)} (${s.grade || ''})</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-ghost" onclick="closeReserveModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary">Add to Waiting List</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
}

window.showReserveModal = function(bookId) {
    const book = libraryBooksCache.find(b => b.id === bookId);
    document.getElementById('reserveForm').reset();
    document.getElementById('reserveBookId').value = bookId;
    document.getElementById('reserveBookTitle').value = book ? book.title : '';
    document.getElementById('reserveModal').classList.add('active');
};
window.closeReserveModal = function() { document.getElementById('reserveModal').classList.remove('active'); };

window.saveReservation = async function() {
    const bookId = document.getElementById('reserveBookId').value;
    const studentSelect = document.getElementById('reserveStudentId');
    const studentId = studentSelect.value;
    const studentName = studentSelect.selectedOptions[0]?.dataset.name || '';
    if (!studentId) { showAlert('Please select a student', 'error'); return; }

    try {
        await fetchAPI('/library/reservations', {
            method: 'POST',
            body: JSON.stringify({ book_id: parseInt(bookId), student_id: studentId, student_name: studentName }),
        });
        showAlert('Added to reservation queue');
        closeReserveModal();
        await loadLibrary();
    } catch (e) { console.error(e); }
};

// ============================================
// ISSUED BOOKS TAB
// ============================================
async function loadLibraryIssuesTab(overdueOnly = false) {
    const el = document.getElementById('libraryIssuesTab');
    if (!el) return;
    el.innerHTML = '<div class="loading">Loading...</div>';
    try {
        let url = '/library/issues?status=Issued';
        if (overdueOnly) url += '&overdue=true';
        const data = await fetchAPI(url);
        const issues = data.issues || [];
        el.innerHTML = `
            <div class="card">
                <div class="toolbar">
                    <label style="display:flex; align-items:center; gap:6px; font-size:13px;">
                        <input type="checkbox" id="overdueOnlyToggle" ${overdueOnly ? 'checked' : ''} onchange="loadLibraryIssuesTab(this.checked)"> Overdue only
                    </label>
                </div>
                <div class="table-wrap">
                    <table class="data-table">
                        <thead><tr><th>Book</th><th>Student</th><th>Issued</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead>
                        <tbody>${renderIssueRows(issues)}</tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (e) {
        console.error(e);
        el.innerHTML = '<div class="loading">Failed to load issued books.</div>';
    }
}

function renderIssueRows(issues) {
    if (!issues.length) return '<tr><td colspan="6" class="empty-hint">No books currently issued.</td></tr>';
    const today = new Date().toISOString().slice(0, 10);
    return issues.map(i => {
        const overdue = i.status === 'Issued' && i.due_date < today;
        return `
            <tr>
                <td style="font-weight:500">${escapeHtml(i.book_title || '-')}</td>
                <td>${escapeHtml(i.student_name || i.student_id)}</td>
                <td>${i.issue_date || '-'}</td>
                <td>${i.due_date || '-'}</td>
                <td>${overdue ? '<span class="badge badge-red">Overdue</span>' : '<span class="badge badge-blue">Issued</span>'}</td>
                <td class="actions">
                    <button onclick="returnBook(${i.id})" class="btn btn-primary btn-sm">Return</button>
                    <button onclick="markBookLost(${i.id})" class="btn btn-danger btn-sm">Lost</button>
                </td>
            </tr>
        `;
    }).join('');
}

window.returnBook = async function(issueId) {
    if (!confirm('Mark this book as returned?')) return;
    try {
        const result = await fetchAPI(`/library/return/${issueId}`, { method: 'POST', body: JSON.stringify({}) });
        showAlert(result.message || 'Book returned');
        await loadLibraryIssuesTab();
    } catch (e) { console.error(e); }
};

window.markBookLost = async function(issueId) {
    if (!confirm('Mark this book as lost? A replacement fine will be charged.')) return;
    try {
        const result = await fetchAPI(`/library/issues/${issueId}/lost`, { method: 'POST' });
        showAlert(result.message || 'Marked as lost');
        await loadLibraryIssuesTab();
    } catch (e) { console.error(e); }
};

// ============================================
// RESERVATIONS TAB
// ============================================
async function loadLibraryReservationsTab() {
    const el = document.getElementById('libraryReservationsTab');
    if (!el) return;
    el.innerHTML = '<div class="loading">Loading...</div>';
    try {
        const data = await fetchAPI('/library/reservations');
        const reservations = (data.reservations || []).filter(r => ['Waiting', 'Ready'].includes(r.status));
        el.innerHTML = `
            <div class="card">
                <div class="table-wrap">
                    <table class="data-table">
                        <thead><tr><th>Book</th><th>Student</th><th>Position</th><th>Status</th><th>Reserved</th><th>Actions</th></tr></thead>
                        <tbody>${renderReservationRows(reservations)}</tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (e) {
        console.error(e);
        el.innerHTML = '<div class="loading">Failed to load reservations.</div>';
    }
}

function renderReservationRows(reservations) {
    if (!reservations.length) return '<tr><td colspan="6" class="empty-hint">No active reservations.</td></tr>';
    return reservations.map(r => `
        <tr>
            <td style="font-weight:500">${escapeHtml(r.book_title || '-')}</td>
            <td>${escapeHtml(r.student_name || r.student_id)}</td>
            <td>#${r.queue_position}</td>
            <td>${r.status === 'Ready' ? '<span class="badge badge-green">Ready for pickup</span>' : '<span class="badge badge-yellow">Waiting</span>'}</td>
            <td>${(r.reserved_date || '').slice(0, 10)}</td>
            <td class="actions">
                ${r.status === 'Ready' ? `<button onclick="fulfillReservation(${r.id})" class="btn btn-primary btn-sm">Issue to Student</button>` : ''}
                <button onclick="cancelReservation(${r.id})" class="btn btn-danger btn-sm">Cancel</button>
            </td>
        </tr>
    `).join('');
}

window.cancelReservation = async function(id) {
    if (!confirm('Cancel this reservation?')) return;
    try {
        await fetchAPI(`/library/reservations/${id}/cancel`, { method: 'POST' });
        showAlert('Reservation cancelled');
        await loadLibraryReservationsTab();
    } catch (e) { console.error(e); }
};

window.fulfillReservation = async function(id) {
    if (!confirm('Issue this book to the waiting student now?')) return;
    try {
        await fetchAPI(`/library/reservations/${id}/fulfill`, { method: 'POST' });
        showAlert('Book issued to student');
        await loadLibraryReservationsTab();
    } catch (e) { console.error(e); }
};

// ============================================
// FINES TAB
// ============================================
async function loadLibraryFinesTab() {
    const el = document.getElementById('libraryFinesTab');
    if (!el) return;
    el.innerHTML = '<div class="loading">Loading...</div>';
    try {
        const data = await fetchAPI('/library/fines');
        const fines = data.fines || [];
        el.innerHTML = `
            <div class="card">
                <div class="page-sub" style="margin-bottom:10px;">Total pending: <strong style="color:var(--red)">PKR ${Number(data.total_pending || 0).toLocaleString()}</strong></div>
                <div class="table-wrap">
                    <table class="data-table">
                        <thead><tr><th>Book</th><th>Student</th><th>Due Date</th><th>Returned</th><th>Fine</th><th>Actions</th></tr></thead>
                        <tbody>${renderFineRows(fines)}</tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (e) {
        console.error(e);
        el.innerHTML = '<div class="loading">Failed to load fines.</div>';
    }
}

function renderFineRows(fines) {
    if (!fines.length) return '<tr><td colspan="6" class="empty-hint">No pending fines. 🎉</td></tr>';
    return fines.map(f => `
        <tr>
            <td style="font-weight:500">${escapeHtml(f.book_title || '-')}</td>
            <td>${escapeHtml(f.student_name || f.student_id)}</td>
            <td>${f.due_date || '-'}</td>
            <td>${f.return_date || '-'}</td>
            <td style="color:var(--red)">PKR ${Number(f.fine_amount || 0).toLocaleString()}</td>
            <td class="actions"><button onclick="payLibraryFine(${f.id})" class="btn btn-primary btn-sm">Mark Paid</button></td>
        </tr>
    `).join('');
}

window.payLibraryFine = async function(issueId) {
    if (!confirm('Mark this fine as paid?')) return;
    try {
        await fetchAPI(`/library/fines/${issueId}/pay`, { method: 'POST' });
        showAlert('Fine marked as paid');
        await loadLibraryFinesTab();
    } catch (e) { console.error(e); }
};
