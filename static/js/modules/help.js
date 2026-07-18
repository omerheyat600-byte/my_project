// ============================================
// HELP.JS — In-app user guide covering every
// module/function of the ERP. Pure front-end
// (no backend calls) — content is static and
// role-aware (admin-only sections are labeled).
// ============================================

let helpLang = 'en'; // 'en' or 'ur' — toggled via the language buttons on the Help page.
                       // Topics without a body_ur fall back to English with a small notice.

const HELP_TOPICS = [
    {
        id: 'getting-started',
        title: '🚀 Getting Started',
        body: `
            <h3>Logging in</h3>
            <p>Use the username and password given to you by your school administrator. After 5 wrong attempts in a row, the account is locked for 15 minutes for security — wait and try again, or ask an admin to reset your password.</p>

            <h3>User roles</h3>
            <ul>
                <li><strong>Admin</strong> — full access: Users, Settings, and everything else.</li>
                <li><strong>Teacher</strong> — can mark attendance, enter results, manage the timetable, and view most records.</li>
                <li><strong>Viewer</strong> — read-only access to view records (dashboard, students, fees, etc.) without editing.</li>
            </ul>
            <p>If a menu item is missing for you, it's because your role doesn't have access to it — ask an Admin if you believe you need it.</p>

            <h3>Logging out</h3>
            <p>Click the red <strong>Logout</strong> button at the bottom of the sidebar when you're done, especially on a shared computer.</p>
        `
    },
    {
        id: 'dashboard',
        title: '📊 Dashboard',
        body: `
            <p>The Dashboard is your home screen — it gives you an at-a-glance summary of the whole school:</p>
            <ul>
                <li>Total students, teachers, and classes</li>
                <li>Fees collected vs pending this period</li>
                <li>Recent fee payments</li>
                <li>Result distribution by grade</li>
                <li>Monthly fee collection trend chart</li>
            </ul>
            <p>Click <strong>📊 Dashboard</strong> in the sidebar at any time to come back here.</p>
        `
    },
    {
        id: 'students',
        title: '👥 Students',
        body: `
            <h3>Adding a student</h3>
            <p>Go to <strong>Students</strong> → click <strong>+ Add Student</strong> → fill in name, grade, guardian details, and phone number, then Save.</p>

            <h3>Searching / filtering</h3>
            <p>Use the search box on the Students page to find a student by name or ID, or filter by grade.</p>

            <h3>Editing or removing a student</h3>
            <p>Click the ✏️ Edit icon on a student's row to update their details, or 🗑️ Delete to remove them (this cannot be undone). Once you're editing an existing student, a <strong>💰 Fee History</strong> button appears at the top of the dialog — click it to see every fee record for that student in one place (see the Fees help section for details).</p>

            <h3>Roll No.</h3>
            <p>Roll No. is separate from Student ID and Admission No. — it's a per-class number (1, 2, 3...) that's meant to reset each academic year. You can type one in manually on the Edit form, or click <strong>🔄 Reset Roll Numbers</strong> (after picking a class in the grade filter) to auto-assign 1..N to every active student in that class, alphabetically by name. Roll numbers are also reset automatically for the affected class(es) whenever a <strong>Student Promotion</strong> batch is run or undone.</p>

            <p><strong>Tip:</strong> A student's <em>grade</em> field should match a class name exactly (e.g. "Grade 10-A") so that Attendance, Timetable, and Exams can find their classmates correctly.</p>
        `
    },
    {
        id: 'promotions',
        title: '🎓 Student Promotion',
        body: `
            <h3>Running a promotion</h3>
            <p>Go to <strong>Student Promotion → Run Promotion</strong>, pick a <strong>From Class</strong> (its active students load automatically), a default <strong>Promote To</strong> class and a <strong>To Academic Year</strong>, then set a decision for each student:</p>
            <ul>
                <li><strong>Promoted</strong> — moves to the To Class.</li>
                <li><strong>Retained</strong> — stays in the same class.</li>
                <li><strong>Graduated</strong> — finished their last class.</li>
                <li><strong>Left</strong> — withdrawn/transferred out.</li>
            </ul>
            <p>Click <strong>✅ Run Promotion</strong> to apply every decision at once.</p>

            <h3>Roll numbers</h3>
            <p>Every class that ends up with active students because of a promotion run (a destination class for Promoted or Retained students) automatically gets its Roll Numbers re-assigned 1..N, alphabetically by name — so roll numbers stay correct for the new academic year without any extra step. Undoing a batch resets roll numbers the same way for whichever class(es) it restores.</p>

            <h3>History &amp; Undo</h3>
            <p>Every run is saved as a batch under the <strong>History</strong> tab — view or print any batch, or click <strong>↩ Undo</strong> (Admin only) to revert every student in that batch back to their previous class/status.</p>

            <h3>Find</h3>
            <p>Use the <strong>Find</strong> tab to search a student's entire promotion history (by ID, name, or class) across every batch ever run — handy when you need to know when a specific student was promoted without hunting through the History list.</p>

            <p><strong>Note:</strong> Running or undoing a promotion needs an Admin account; Teachers and Viewers can browse History and Find.</p>
            <p><strong>Tip:</strong> Click a student's name in the roster to see their details in a quick popup — it won't lose your in-progress decisions the way navigating to the Students page would.</p>
        `
    },
    {
        id: 'admissions',
        title: '🧾 Online Admission',
        body: `
            <h3>Sharing the application form</h3>
            <p>The <strong>Copy Link</strong> / <strong>Open Form</strong> buttons at the top of the page give you a public link — applicants fill it in themselves, no login needed. Share it on your website, WhatsApp, or social media.</p>

            <h3>Application statuses</h3>
            <ul>
                <li><strong>Pending</strong> — just submitted, not yet reviewed.</li>
                <li><strong>Tested</strong> — an entry test score has been recorded (👁 View → Test Marks).</li>
                <li><strong>Waiting</strong> — placed on the waiting list (e.g. class currently full).</li>
                <li><strong>Approved</strong> — accepted; a Student record with an auto-generated Student ID is created automatically.</li>
                <li><strong>Rejected</strong> — not accepted.</li>
            </ul>
            <p>Click a status pill at the top to filter the list, or use the search box and grade filter.</p>

            <h3>Reviewing an application</h3>
            <p>Click 👁 <strong>View</strong> on a row to see the full application, record test marks, and then <strong>Approve</strong>, <strong>Waitlist</strong>, or <strong>Reject</strong> it. If a class is already at capacity, Approve will warn you and let an Admin override the seat limit if needed.</p>

            <h3>Waiting List</h3>
            <p>Click <strong>📋 Waiting List</strong> to see all waitlisted applicants together, so you can approve them as seats open up.</p>
        `
    },
    {
        id: 'teachers',
        title: '👤 Teachers',
        body: `
            <p>Manage teaching staff here: add new teachers, record their subject, contact details, qualification, and salary.</p>
            <ul>
                <li><strong>+ Add Teacher</strong> — create a new staff record.</li>
                <li><strong>Edit</strong> — update subject, contact info, or salary.</li>
                <li><strong>Delete</strong> — remove a teacher who has left the school.</li>
            </ul>
            <p>Teachers you add here become selectable as Class Teachers (Classes page) and in the Timetable.</p>
        `
    },
    {
        id: 'classes',
        title: '📚 Classes',
        body: `
            <p>Classes define the sections your school is organized into (e.g. "Grade 10-A"), each with a class teacher, room number, and capacity.</p>
            <ul>
                <li><strong>+ Add Class</strong> — create a new class/section.</li>
                <li>Assign a <strong>Class Teacher</strong> from your Teachers list.</li>
                <li>Set the <strong>Room Number</strong> and student <strong>Capacity</strong>.</li>
            </ul>
            <p>Classes are the backbone for Attendance and Timetable — create your classes first before using those modules.</p>
        `
    },
    {
        id: 'attendance',
        title: '🗓️ Attendance',
        body: `
            <h3>Marking attendance</h3>
            <ol>
                <li>Go to <strong>Attendance</strong>.</li>
                <li>Pick a <strong>Class</strong> and a <strong>Date</strong>.</li>
                <li>The roster loads every student in that class — mark each one <strong>Present, Absent, Late,</strong> or <strong>Leave</strong>.</li>
                <li>Add optional remarks, then click <strong>Save Attendance</strong>.</li>
            </ol>
            <p>You can re-open the same class/date later to correct a mistake — saving again simply updates the existing record.</p>

            <h3>Reports</h3>
            <ul>
                <li><strong>Student history</strong> — a monthly attendance record and percentage for one student.</li>
                <li><strong>Class summary</strong> — present/absent/late/leave counts for every student in a class over a month.</li>
            </ul>

            <h3>SMS alerts for absences</h3>
            <p>If enabled in <strong>Settings → Notifications</strong>, parents automatically get an SMS whenever their child is marked <strong>Absent</strong> or <strong>Late</strong>. Ask an Admin to turn this on or off.</p>
        `
    },
    {
        id: 'staff-attendance',
        title: '🧑\u200d🏫 Staff Attendance <span class="help-admin-badge">Admin only</span>',
        body: `
            <p>Tracks daily attendance for teaching staff, separately from student attendance — one roster per day covering everyone on the Teachers list.</p>

            <h3>Marking attendance</h3>
            <ol>
                <li>Go to <strong>Staff Attendance</strong> → pick a <strong>Date</strong> → click <strong>Load Roster</strong>.</li>
                <li>Every teacher appears — mark each one <strong>Present, Absent, Late,</strong> or <strong>Leave</strong>, with optional remarks.</li>
                <li>Click <strong>Save Attendance</strong>. Re-opening the same date later and saving again simply updates the existing record.</li>
            </ol>

            <h3>Reports</h3>
            <ul>
                <li><strong>Staff Summary</strong> — present/absent/late/leave counts for every teacher over a chosen month.</li>
                <li><strong>Teacher History</strong> — one teacher's full attendance record and percentage for a chosen month.</li>
            </ul>
        `
    },
    {
        id: 'timetable',
        title: '🕒 Timetable',
        body: `
            <p>Build the weekly class schedule, period by period.</p>
            <ul>
                <li>Select a class to view or edit its timetable.</li>
                <li>Click a period slot to assign a <strong>subject</strong> and <strong>teacher</strong>, with start/end time.</li>
                <li>The system warns you if a teacher is already booked for another class at the same day/period, to prevent double-booking.</li>
                <li>You can also look up a single teacher's full weekly schedule across all classes.</li>
            </ul>
        `
    },
    {
        id: 'results',
        title: '📄 Results',
        body: `
            <h3>Recording results</h3>
            <p>Create an exam session (e.g. "Term 1, 2026"), then enter marks per student per subject.</p>

            <h3>Result cards</h3>
            <p>Print or export a polished result card for any student, in several visual themes (including the "Modern Slate Grid" design) — the school name shown always comes from <strong>Settings</strong> automatically.</p>

            <h3>Class gazette</h3>
            <p>Generate a full class gazette (a grid of every student's marks for an exam) for record-keeping or notice-board printing.</p>

            <p><strong>Tip:</strong> Click a student's name in the marksheet list for a quick popup with their details, fee history, or a link to their full record.</p>
        `
    },
    {
        id: 'examination',
        title: '📝 Examination',
        body: `
            <h3>Loading an exam session</h3>
            <p>Go to <strong>Examination</strong>, choose a <strong>Class</strong>, <strong>Term</strong>, and <strong>Year</strong>, then click <strong>📂 Load Exam</strong>. This is the same exam session used by the Results marksheet — all eight sections below apply to the class/term/year you loaded.</p>

            <h3>🗓️ Date Sheet</h3>
            <p>Add one row per subject with its exam date, start/end time, and room. The subject dropdown is pulled directly from that class's assigned subjects (Classes → Subjects) — add subjects there first if the list is empty. Click <strong>✏️ Edit</strong> on any row to update it, or <strong>🗑 Delete</strong> to remove it. <strong>🖨️ Print Date Sheet</strong> gives a clean printable copy.</p>

            <h3>🪑 Seating Plan</h3>
            <p>Add one or more rooms with a name and seat capacity, then click <strong>🎲 Generate Seating Plan</strong> to auto-assign every student in the class to a room and seat number. <strong>🗑 Clear Plan</strong> removes the current assignment so you can regenerate it.</p>

            <h3>🪪 Admit Card</h3>
            <p>Pick a student and click <strong>🪪 Print Admit Card</strong> for a single card, or <strong>🖨️ Print All Admit Cards</strong> for the whole class. Each card pulls in the student's seat/room from the Seating Plan and the full Date Sheet automatically — generate those first for a complete card.</p>

            <h3>🔒 Result Lock / Publish</h3>
            <p><strong>Lock</strong> freezes marks entry and grace marks for this exam so teachers can no longer change them — use this once results are finalized. <strong>Publish</strong> controls whether the result becomes visible outside the admin panel (e.g. Parent Portal). Both can be reversed (unlock/unpublish) by an Admin.</p>

            <h3>➕ Grace Marks</h3>
            <p>Award extra marks to a student in a specific subject (e.g. for a moderation adjustment). The student's total, percentage, grade, GPA, and position recalculate automatically. Grace marks can't be applied while the result is locked.</p>

            <h3>🎯 GPA / CGPA</h3>
            <p>Shows each student's GPA (4.0 scale) for the loaded exam. Enter a Student ID under <strong>CGPA Lookup</strong> to see their cumulative GPA across every exam they've been graded in, with a term-by-term breakdown.</p>

            <h3>🏆 Position Holders</h3>
            <p>Shows the top-ranked students (1st, 2nd, 3rd, etc.) for the loaded class/exam. Change the <strong>Top</strong> number and click <strong>🔄 Refresh</strong> to show more or fewer positions, or <strong>🖨️ Print</strong> for a notice-board copy.</p>

            <h3>📋 Merit List</h3>
            <p>Ranks students by percentage across a Term/Year — set the Term, Year, and Top N and click <strong>🔍 Generate Merit List</strong>. Useful for school-wide (not just single-class) recognition lists.</p>

            <p><strong>Tip:</strong> Student names are clickable throughout Examination (Result Summary, GPA, Position Holders, Merit List) — click one for a quick popup with their details, fee history, or a link to their full record.</p>
        `
    },
    {
        id: 'fees',
        title: '💳 Fees',
        body: `
            <h3>Monthly fee generation</h3>
            <p>Go to <strong>Settings → Fee Management → Generate This Month's Fees</strong> to create this month's fee entries for every active student automatically.</p>

            <h3>Recording a payment</h3>
            <p>On the Fees page, find the student's fee entry and mark it Paid (fully or partially) — the status updates to <strong>Paid</strong>, <strong>Partial</strong>, or stays <strong>Unpaid</strong> automatically based on the amount received.</p>

            <h3>Carry-forward unpaid balances</h3>
            <p><strong>Settings → Carry Forward Unpaid Fees</strong> rolls any unpaid balance into the next month so nothing is lost track of.</p>

            <h3>Vouchers</h3>
            <p>Print a fee voucher/receipt for any student directly from their fee record.</p>

            <h3>Fee History</h3>
            <p>To see every fee record for one student — Tuition, Transport, Exam, Books, Lab, or any custom type — in a single ledger with status, paid date, and outstanding balance, click their name on the Fees list, or open <strong>Students</strong> → Edit that student → <strong>💰 Fee History</strong>. From there you can toggle whether voided records are shown, and 🖨️ Print the whole history.</p>
        `
    },
    {
        id: 'expenses',
        title: '💰 Expenses',
        body: `
            <p>Track school expenditure — salaries, utilities, supplies, maintenance, etc.</p>
            <ul>
                <li><strong>+ Add Expense</strong> — record category, amount, payment method, and a reference number.</li>
                <li>Use this alongside Fees to understand the school's overall cash flow on the Dashboard.</li>
            </ul>
        `
    },
    {
        id: 'accounts',
        title: '🧮 Accounts',
        body: `
            <p>Full double-entry bookkeeping on top of the school's Chart of Accounts. Use the tabs across the top to move between sections:</p>

            <h3>Cash Book / Bank Book</h3>
            <p>A running ledger of every cash and bank transaction, in date order, with a running balance — the day-to-day money-in/money-out view.</p>

            <h3>Journal / Payment / Receipt Vouchers</h3>
            <p>Every accounting entry is recorded as a voucher: <strong>Journal</strong> for general double-entry adjustments (debit/credit lines that must balance to zero), <strong>Payment</strong> for money going out, and <strong>Receipt</strong> for money coming in. Click <strong>+ Add</strong> on any of these tabs to record one, and 🖨️ to print/preview an existing voucher.</p>

            <h3>Ledger</h3>
            <p>Pick any account from the Chart of Accounts to see its full transaction history and running balance, sourced automatically from every voucher posted against it.</p>

            <h3>Trial Balance</h3>
            <p>Lists every account's debit/credit balance as of a chosen date — the two totals should always match. If they don't, it means a voucher somewhere wasn't posted as a balanced double entry.</p>

            <h3>Profit &amp; Loss / Balance Sheet</h3>
            <p><strong>Profit &amp; Loss</strong> summarizes income vs. expenses over a date range. <strong>Balance Sheet</strong> shows Assets, Liabilities, and Equity as of a chosen date. Both are generated from the same voucher data as everything else, so they always stay in sync with the Ledger.</p>

            <h3>Chart of Accounts</h3>
            <p>The list of every account (Asset, Liability, Equity, Income, Expense) available to post vouchers against. An Admin can add new accounts here as the school's bookkeeping needs grow.</p>
        `
    },
    {
        id: 'hr',
        title: '🧑\u200d💼 HR <span class="help-admin-badge">Admin only</span>',
        body: `
            <p>Manages staff leave, payroll, overtime, and documents for every employee. Use the tabs across the top to move between sections:</p>

            <h3>📝 Leave Application / ✅ Leave Approval</h3>
            <p>Staff submit leave requests (Casual, Sick, Annual, Unpaid, Maternity/Paternity, or Other) with a date range and reason under <strong>Leave Application</strong>. An Admin reviews pending requests under <strong>Leave Approval</strong> and Approves or Rejects each one; either side can Cancel a request that's still Pending or Approved.</p>

            <h3>💵 Payroll</h3>
            <p>Click <strong>Generate for All Employees</strong> to create this period's payroll entries in one go. Each entry can be adjusted (bonuses, deductions) via ✏️, then marked <strong>Mark Paid</strong> once disbursed, or 🖨️ printed as a salary slip.</p>

            <h3>🧾 Salary Slip</h3>
            <p>Pull up and print an individual employee's salary slip for a given pay period.</p>

            <h3>⏱ Overtime</h3>
            <p>Log extra hours worked for an employee; an Admin Approves or Rejects each entry the same way as leave requests.</p>

            <h3>📈 Increment</h3>
            <p>Record a salary increment for an employee — it takes effect on future payroll runs without altering past ones.</p>

            <h3>📁 Employee Documents</h3>
            <p>Upload and store documents (contracts, ID copies, certificates, etc.) against an employee's record for safekeeping.</p>
        `
    },
    {
        id: 'library',
        title: '📖 Library',
        body: `
            <h3>Catalog</h3>
            <p>Every book is a single catalog entry with a <strong>Total Copies</strong> count — the system tracks how many of those copies are currently available vs. issued out automatically. Add a book with <strong>+ Add Book</strong>, including title, author, ISBN, category, and shelf location so staff can physically find it later.</p>

            <h3>Issuing a book</h3>
            <p>Click <strong>Issue</strong> on any book with available copies, pick the student, and confirm. The due date defaults to the school's standard loan period but can be overridden per issue. A student can't be issued two active copies of the exact same book at once.</p>

            <h3>Returning a book</h3>
            <p>On the <strong>Issued Books</strong> tab, click <strong>Return</strong>. If it's returned after the due date, a late fine is calculated automatically (days late × the per-day rate). Use the "Overdue only" checkbox to quickly see what's late right now.</p>

            <h3>Lost books</h3>
            <p>If a student loses a book, click <strong>Lost</strong> instead of Return — this charges a fixed replacement fine and permanently removes that one copy from the catalog's total (it's not coming back into circulation).</p>

            <h3>Reservation queue</h3>
            <p>If every copy of a book is out, use <strong>Reserve</strong> instead of Issue to add a student to the waiting list. As soon as any copy of that book is returned, the student at the front of the queue automatically flips to <strong>"Ready"</strong> on the Reservations tab — a staff member then clicks <strong>Issue to Student</strong> to hand it over and complete the loan.</p>

            <h3>Fines</h3>
            <p>The Fines tab lists every unpaid late/lost fine across the whole library. Click <strong>Mark Paid</strong> once the student settles it — this is a manual confirmation, not an online payment.</p>
        `
    },
    {
        id: 'inventory',
        title: '📦 Inventory',
        body: `
            <p>Manages Uniform, Books, and Stationery stock, vendors, and purchases — separate from the Library's book-lending catalog.</p>

            <h3>Uniform / Books / Stationery tabs</h3>
            <p>Each is its own catalog of items with a unit price, stock quantity, and reorder level. Add an item with <strong>+ Add Item</strong>. Stock shown in red means it's at or below its reorder level — restock it soon.</p>

            <h3>Stock In / Stock Out</h3>
            <p>Manually adjust stock levels — Stock In for donations, returns, or corrections; Stock Out for issuing items to a class or writing off damage. Every entry is logged with a reference type, date, and reason so the ledger stays auditable.</p>

            <h3>Purchase (Purchase Orders)</h3>
            <p>Record a purchase from a vendor with <strong>+ Record Purchase</strong>. Choose status <strong>Received</strong> if the goods are in hand already (stock updates immediately), or <strong>Ordered</strong> if you're just placing the order.</p>
            <p>For an Ordered PO, click <strong>📥 Receive</strong> once the goods actually arrive — this adds the ordered quantity to stock and records who received it and when. Click <strong>🖨️ GRN</strong> on any received PO to print a Goods Received Note showing exactly what was received against that order.</p>

            <h3>Vendors</h3>
            <p>Your list of suppliers, with contact details and what they supply. A vendor with purchase history can't be deleted — deactivate it instead so old purchase records stay intact.</p>

            <p>Every list here has a 🖨️ <strong>Print</strong> button for a printable copy.</p>
        `
    },
    {
        id: 'id-cards',
        title: '🪪 ID Cards',
        body: `
            <p>Generate printable photo ID cards for students and staff.</p>

            <h3>Switching between Students and Staff</h3>
            <p>Use the <strong>👥 Students</strong> / <strong>👤 Staff</strong> buttons at the top to switch which list you're printing from. Filter by class or search by name to narrow it down.</p>

            <h3>Printing</h3>
            <ul>
                <li><strong>☑ Select All</strong> then <strong>🖨 Print Selected</strong> — print just the people you've ticked.</li>
                <li><strong>🎓 Print Whole Class</strong> — print every card for the class currently selected in the filter, in one batch.</li>
            </ul>
            <p>Each card includes the student/staff photo (if uploaded), name, ID, class/subject, and the school name — ready to cut out and laminate.</p>
        `
    },
    {
        id: 'reports',
        title: '📊 Reports',
        body: `
            <p>Analytics and printable summaries pulled live from the rest of the system — use the tabs at the top to switch report:</p>
            <ul>
                <li><strong>🎓 Enrollment</strong> — student counts by class, gender, and grade.</li>
                <li><strong>💰 Fees</strong> — collected vs. pending fees over a date range you choose.</li>
                <li><strong>🗓️ Attendance</strong> — attendance rate trends over a date range.</li>
                <li><strong>📝 Academic</strong> — result/grade distribution for a chosen exam.</li>
                <li><strong>📊 Financial</strong> — income vs. expense summary (Admin/Accountant only).</li>
            </ul>
            <p>Every report has <strong>📥 Export CSV</strong> to download the raw data, and <strong>🖨️ Print</strong> for a formatted printable copy.</p>
            <p><strong>Tip:</strong> On the Fees report, click a student's name to jump straight to their record in Students.</p>
        `
    },
    {
        id: 'ai-tools',
        title: '🤖 AI Tools',
        body: `
            <p>AI-assisted features for teachers and admins. All nine tools below are available: <strong>📝 Question Paper Generator</strong> (with its <strong>🗂️ Question Bank</strong> and <strong>📄 Saved Papers</strong>), <strong>💬 Report Card Remarks</strong>, <strong>🗓️ Timetable Generator</strong>, <strong>📋 Lesson Planner</strong>, <strong>📈 Performance Analysis</strong>, <strong>💰 Fee Prediction</strong>, and <strong>⚠️ Attendance Risk</strong>.</p>

            <h3>Setting up AI (optional)</h3>
            <p>Go to <strong>Settings → 🤖 AI Configuration</strong> and add an API key for OpenAI, Google Gemini, or Anthropic Claude — whichever one the school has. This is entirely optional: every AI Tool also works <strong>offline</strong> with no key and no internet, just with simpler, template-based output instead of AI-written text.</p>
            <p>Every tool that generates numbers you rely on — Fee Prediction, Attendance Risk, Performance Analysis, and the Timetable Generator's conflict-checking — always computes those numbers itself from your real records, whether or not AI is on. AI is only ever used to write the explanatory sentences around them, never to invent the figures.</p>

            <h3>📝 Question Paper Generator</h3>
            <p>Fill in Class, Subject, Term/Year, Duration, and add one or more <strong>Sections</strong> — each section is a question type (MCQ, Short Answer, Long Answer, Fill in the Blanks, True/False) with a count, marks per question, optional topics, and difficulty.</p>
            <p>Choose a <strong>Generation Mode</strong>: <strong>Auto</strong> (AI if configured, else the offline Question Bank), <strong>Force AI</strong>, or <strong>Offline / Question Bank only</strong>.</p>
            <p>Click <strong>🤖 Generate Paper</strong> — it's saved automatically and shown with <strong>🖨️ Print Paper</strong> and <strong>🔑 Print with Answer Key</strong> buttons.</p>

            <h3>🗂️ Question Bank &amp; 📄 Saved Papers</h3>
            <p>Your reusable local library of questions — add manually, or let it grow automatically (every AI-generated question is saved into the bank). Saved Papers lists every paper you've generated, with 👁 View, 🖨 Print, and 🗑 Delete.</p>

            <h3>💬 Report Card Remarks</h3>
            <p>Pick a Class, Term, and Year (this reuses the same exam session as Examination → Marksheet), choose a Tone (Encouraging / Formal / Concise), then generate remarks for one student or the whole class at once with <strong>🤖 Generate for students without remarks</strong>. Every remark is editable afterwards — click <strong>✏️ Edit</strong> to override the wording; an edited remark is marked "Manual" so you can tell what a teacher touched by hand.</p>

            <h3>🗓️ Timetable Generator</h3>
            <p>Pick a Class, the days to schedule, periods per day, period length, start time, and any break periods. It auto-splits periods-per-week evenly across the class's subjects (you can adjust each subject's count). Teachers are auto-matched from the Teachers module by subject.</p>
            <p><strong>Important:</strong> the generator always checks for teacher clashes against every other class's timetable before placing a period — it will never silently double-book a teacher. If a clash truly can't be avoided, it still fills the slot but flags it clearly under "Please review" so you can fix it by hand. AI mode only influences which subjects get earlier periods in the day (e.g. Math/Science before Art) — it never decides who's free.</p>

            <h3>📋 Lesson Planner</h3>
            <p>Enter Subject, Topic, optional Class, and Duration, then Generate. You get Objectives, Materials, a Warm-up, Main Activities (with timing), Assessment, Homework, and Differentiation notes — fully editable, saved automatically, and printable. Offline mode produces a generic but usable starting scaffold; AI mode tailors it to the actual topic.</p>

            <h3>📈 Performance Analysis</h3>
            <p>Search a student by name or ID to see their exam history over time: percentage trend vs. class average, best/worst exam, and a subject-by-subject breakdown with its own trend. The trend, averages, and subject breakdown are always calculated from real results — AI (if configured) only adds a short written summary describing what the numbers already show.</p>

            <h3>💰 Fee Prediction</h3>
            <p>Pick a Class (or leave blank for the whole school) and click Analyze. You'll see every active student's fee risk — High / Medium / Low — based on their real payment history: how often they've paid late, how many overdue unpaid months they currently have, and their current outstanding balance. Click <strong>👁 Details</strong> on any student for a fuller written summary. This is meant to help you follow up early, not to judge — treat "High risk" as a prompt for a friendly reminder call, not a label.</p>

            <h3>⚠️ Attendance Risk</h3>
            <p>Pick a Class (or the whole school) and a lookback window (14/30/60/90 days), then Analyze. Each student's attendance rate, longest recent run of consecutive absent days, and trend (improving/worsening/stable) are shown, with a High/Medium/Low risk rating — a sudden multi-day absence streak raises the risk even if the overall attendance percentage still looks fine. As with Fee Prediction, this is meant to prompt an early, caring check-in with the family, not to draw conclusions about why a student was absent.</p>
        `,
        body_ur: `
            <p>اساتذہ اور ایڈمن کے لیے AI کی مدد سے کام کرنے والے فیچرز۔ نیچے دیے گئے تمام نو ٹولز دستیاب ہیں: <strong>📝 سوالیہ پرچہ جنریٹر</strong> (اس کے ساتھ <strong>🗂️ سوالات کا ذخیرہ</strong> اور <strong>📄 محفوظ شدہ پرچے</strong>)، <strong>💬 رپورٹ کارڈ ریمارکس</strong>، <strong>🗓️ ٹائم ٹیبل جنریٹر</strong>، <strong>📋 لیسن پلانر</strong>، <strong>📈 کارکردگی کا تجزیہ</strong>، <strong>💰 فیس کی پیشگوئی</strong>، اور <strong>⚠️ حاضری کا خطرہ</strong>۔</p>

            <h3>AI کی ترتیب (اختیاری)</h3>
            <p><strong>Settings → 🤖 AI Configuration</strong> میں جا کر OpenAI، Google Gemini، یا Anthropic Claude میں سے کسی ایک کی API key شامل کریں — جو بھی اسکول کے پاس ہو۔ یہ بالکل اختیاری ہے: ہر AI ٹول بغیر کسی key اور انٹرنیٹ کے بھی <strong>آف لائن</strong> کام کرتا ہے، بس اس صورت میں AI کی بجائے سادہ، ٹیمپلیٹ پر مبنی نتیجہ ملتا ہے۔</p>
            <p>جن ٹولز کے اعداد و شمار پر آپ انحصار کرتے ہیں — فیس کی پیشگوئی، حاضری کا خطرہ، کارکردگی کا تجزیہ، اور ٹائم ٹیبل جنریٹر کی تصادم جانچ — وہ ہمیشہ آپ کے اصل ریکارڈ سے خود حساب لگاتے ہیں، چاہے AI فعال ہو یا نہ ہو۔ AI صرف ان اعداد کے گرد وضاحتی جملے لکھنے کے لیے استعمال ہوتا ہے، کبھی بھی اعداد خود بنانے کے لیے نہیں۔</p>

            <h3>📝 سوالیہ پرچہ جنریٹر</h3>
            <p>کلاس، مضمون، ٹرم/سال، اور دورانیہ درج کریں، اور ایک یا زیادہ <strong>سیکشنز</strong> شامل کریں — ہر سیکشن ایک سوال کی قسم ہے (MCQ، مختصر جواب، تفصیلی جواب، خالی جگہ پُر کریں، درست/غلط) جس میں تعداد، فی سوال نمبر، موضوعات، اور مشکل کی سطح شامل ہوتی ہے۔</p>
            <p><strong>جنریشن موڈ</strong> منتخب کریں: <strong>خودکار (Auto)</strong> (AI موجود ہو تو AI، ورنہ آف لائن سوالات کا ذخیرہ)، <strong>صرف AI</strong>، یا <strong>صرف آف لائن / سوالات کا ذخیرہ</strong>۔</p>
            <p><strong>🤖 Generate Paper</strong> پر کلک کریں — پرچہ خودکار طور پر محفوظ ہو جاتا ہے اور <strong>🖨️ Print Paper</strong> اور <strong>🔑 Print with Answer Key</strong> بٹنز کے ساتھ دکھایا جاتا ہے۔</p>

            <h3>🗂️ سوالات کا ذخیرہ اور 📄 محفوظ شدہ پرچے</h3>
            <p>یہ آپ کی اپنی، دوبارہ قابلِ استعمال سوالات کی لائبریری ہے — سوالات خود شامل کریں، یا انہیں خودکار طور پر بڑھنے دیں (ہر AI سے بنایا گیا سوال ذخیرے میں بھی محفوظ ہو جاتا ہے)۔ محفوظ شدہ پرچوں میں ہر بنایا گیا پرچہ 👁 دیکھنے، 🖨 پرنٹ کرنے، اور 🗑 حذف کرنے کے اختیار کے ساتھ ملتا ہے۔</p>

            <h3>💬 رپورٹ کارڈ ریمارکس</h3>
            <p>کلاس، ٹرم، اور سال منتخب کریں (یہ وہی امتحانی سیشن استعمال کرتا ہے جو Examination → Marksheet میں موجود ہے)، لہجہ (حوصلہ افزا / رسمی / مختصر) منتخب کریں، پھر ایک طالبعلم کے لیے یا <strong>🤖 Generate for students without remarks</strong> سے پوری کلاس کے لیے ایک ساتھ ریمارکس بنائیں۔ ہر ریمارک بعد میں تبدیل کیا جا سکتا ہے — الفاظ بدلنے کے لیے <strong>✏️ Edit</strong> پر کلک کریں؛ تبدیل شدہ ریمارک پر "Manual" کا نشان لگ جاتا ہے تاکہ معلوم ہو کہ کس ریمارک کو استاد نے خود لکھا ہے۔</p>

            <h3>🗓️ ٹائم ٹیبل جنریٹر</h3>
            <p>کلاس، شیڈول کے دن، روزانہ پیریڈز کی تعداد، پیریڈ کا دورانیہ، شروع ہونے کا وقت، اور کوئی بھی وقفے کے پیریڈز منتخب کریں۔ یہ کلاس کے مضامین میں ہفتہ وار پیریڈز خودکار طور پر برابر تقسیم کر دیتا ہے (ہر مضمون کی تعداد آپ خود بھی بدل سکتے ہیں)۔ اساتذہ کو مضمون کی بنیاد پر Teachers ماڈیول سے خودکار طور پر جوڑا جاتا ہے۔</p>
            <p><strong>اہم بات:</strong> جنریٹر پیریڈ رکھنے سے پہلے ہمیشہ باقی تمام کلاسوں کے ٹائم ٹیبل کے ساتھ استاد کے تصادم کی جانچ کرتا ہے — یہ کبھی بھی خاموشی سے کسی استاد کو دو جگہ ایک وقت میں نہیں رکھے گا۔ اگر تصادم واقعی ٹالا نہ جا سکے، تو پھر بھی پیریڈ بھر دیا جاتا ہے مگر اسے واضح طور پر "Please review" میں نشان زد کر دیا جاتا ہے تاکہ آپ اسے خود درست کر سکیں۔ AI موڈ صرف یہ طے کرتا ہے کہ کون سا مضمون دن کے ابتدائی پیریڈز میں رکھا جائے (مثلاً ریاضی/سائنس آرٹ سے پہلے) — یہ کبھی یہ فیصلہ نہیں کرتا کہ کون سا استاد خالی ہے۔</p>

            <h3>📋 لیسن پلانر</h3>
            <p>مضمون، موضوع، اختیاری کلاس، اور دورانیہ درج کریں، پھر Generate پر کلک کریں۔ آپ کو مقاصد (Objectives)، درکار سامان، وارم اپ، مرکزی سرگرمیاں (وقت کے ساتھ)، جانچ، گھر کا کام، اور مختلف صلاحیت کے طلبہ کے لیے ہدایات ملیں گی — یہ سب قابلِ ترمیم، خودکار طور پر محفوظ، اور پرنٹ کے قابل ہیں۔ آف لائن موڈ ایک عام مگر قابلِ استعمال ابتدائی خاکہ دیتا ہے؛ AI موڈ اسے اصل موضوع کے مطابق ڈھالتا ہے۔</p>

            <h3>📈 کارکردگی کا تجزیہ</h3>
            <p>نام یا آئی ڈی سے کسی طالبعلم کو تلاش کریں تاکہ ان کی امتحانی تاریخ وقت کے ساتھ دیکھی جا سکے: فیصد کا رجحان بمقابلہ کلاس کی اوسط، بہترین/کمزور ترین امتحان، اور مضمون بہ مضمون تفصیل، ہر مضمون کے اپنے رجحان کے ساتھ۔ رجحان، اوسط، اور مضمون کی تفصیل ہمیشہ اصل نتائج سے حساب کی جاتی ہے — AI (اگر فعال ہو) صرف ایک مختصر تحریری خلاصہ شامل کرتا ہے جو انہی اعداد کی وضاحت کرتا ہے۔</p>

            <h3>💰 فیس کی پیشگوئی</h3>
            <p>کلاس منتخب کریں (یا پوری اسکول کے لیے خالی چھوڑ دیں) اور Analyze پر کلک کریں۔ آپ کو ہر فعال طالبعلم کی فیس کا خطرہ نظر آئے گا — زیادہ / درمیانہ / کم — جو ان کی اصل ادائیگی کی تاریخ پر مبنی ہے: وہ کتنی بار دیر سے ادائیگی کرتے رہے ہیں، کتنے مہینوں کی ادائیگی ابھی تک واجب الادا ہے، اور فی الحال کتنی رقم باقی ہے۔ کسی بھی طالبعلم پر <strong>👁 Details</strong> پر کلک کر کے مکمل تحریری خلاصہ دیکھیں۔ اس کا مقصد جلد رابطہ کرنے میں مدد دینا ہے، فیصلہ سنانا نہیں — "زیادہ خطرہ" کو ایک دوستانہ یاد دہانی کال کی دعوت سمجھیں، الزام نہیں۔</p>

            <h3>⚠️ حاضری کا خطرہ</h3>
            <p>کلاس (یا پوری اسکول) اور مدت (14/30/60/90 دن) منتخب کریں، پھر Analyze پر کلک کریں۔ ہر طالبعلم کی حاضری کی شرح، حالیہ مسلسل غیر حاضری کے دنوں کی سب سے لمبی لڑی، اور رجحان (بہتر ہوتا / بگڑتا ہوا / مستحکم) ایک زیادہ/درمیانہ/کم خطرے کی درجہ بندی کے ساتھ دکھایا جاتا ہے — کئی دنوں کی مسلسل غیر حاضری خطرے کو بڑھا دیتی ہے چاہے مجموعی حاضری کا فیصد ابھی بھی ٹھیک نظر آ رہا ہو۔ فیس کی پیشگوئی کی طرح، اس کا مقصد بھی خاندان سے جلد اور ہمدردانہ رابطہ کرنے کی دعوت دینا ہے، نہ کہ غیر حاضری کی وجہ کے بارے میں کوئی نتیجہ اخذ کرنا۔</p>
        `
    },
    {
        id: 'notifications',
        title: '📨 Notifications',
        body: `
            <h3>What this page does</h3>
            <p>The Notification Center has three tabs:</p>
            <ul>
                <li><strong>History</strong> — every SMS ever sent by the system (attendance alerts, fee reminders, manual messages), with filters for status, type, and search, plus delivery stats.</li>
                <li><strong>Fee Reminders</strong> — lists every student with outstanding fees and their parent's phone number. Select students (or send to everyone) to bulk-text a payment reminder with the amount owed automatically filled in.</li>
                <li><strong>Send Manual SMS</strong> — send a one-off custom message to a single student's parent by Student ID.</li>
            </ul>
            <p>Every message sent from any tab is logged in <strong>History</strong>, along with whether it was delivered or failed.</p>

            <h3>Before any SMS can actually be delivered</h3>
            <p>Out of the box, the system runs in <strong>demo mode</strong> — every "send" is logged as successful but no real SMS goes out. To send real SMS, you need to connect an SMS gateway once. This only needs to be done <strong>one time</strong> by whoever manages the server — after that, all three tabs above work with real phones automatically.</p>

            <h3>Recommended method: turn an old Android phone into the gateway</h3>
            <p>This is the cheapest and most reliable option for a single school — it works with <strong>any network's SIM (Jazz, Zong, Ufone, Telenor)</strong> and uses that SIM's own SMS bundle, so there's no extra per-message cost and no online account needed.</p>
            <ol>
                <li>Get a spare Android phone and insert a SIM card with an active SMS bundle from your network of choice (Jazz, Zong, Ufone, or Telenor — all work the same way).</li>
                <li>On that phone, install the free, open-source <strong>"SMS Gateway for Android"</strong> app (also called SMSGate) from <strong>sms-gate.app</strong>. No registration or account is required.</li>
                <li>Open the app and switch on <strong>Local Server</strong> mode, then start the server. The app will display:
                    <ul>
                        <li>A local IP address and port, e.g. <code>192.168.1.50:8080</code></li>
                        <li>A username and password for the connection</li>
                    </ul>
                </li>
                <li>Connect that phone to the <strong>same WiFi network</strong> as the computer/server running this ERP, and keep it powered on with the app running whenever SMS should go out.</li>
                <li>On the server, open the <strong>.env</strong> file (ask an Admin/IT person if you don't have access) and add:
                    <pre style="background:#0f172a; padding:10px; border-radius:6px; overflow-x:auto;">SMSGATE_URL=http://192.168.1.50:8080/message
SMSGATE_USERNAME=&lt;username shown in the app&gt;
SMSGATE_PASSWORD=&lt;password shown in the app&gt;</pre>
                    (replace the IP with whatever the app shows on your phone)
                </li>
                <li>Restart the ERP server. From then on, every SMS sent from Attendance alerts, Fee Reminders, or Manual SMS is delivered through that phone, using its SIM's message bundle.</li>
            </ol>
            <p><strong>Which network to pick:</strong> Jazz, Zong, Ufone, and Telenor all work identically with this method — just buy whichever network's monthly SMS bundle is cheapest or has the best rate for the numbers you're texting (most parents), and put that SIM in the gateway phone. You are not limited to one network — you can even swap the SIM later without changing any code, since the app and setup steps stay the same.</p>
            <p><strong>Things to keep in mind:</strong></p>
            <ul>
                <li>The gateway phone must stay switched on, connected to WiFi, and have the app open in the background — if it's off, SMS sending will fail (it will show as "failed" in History with the error).</li>
                <li>Stay within your SIM's bundle limit and your network's fair-use policy — sending very large volumes very quickly can get a number flagged by the carrier.</li>
                <li>Phone numbers are automatically converted to the correct format (03xx…, +92xx…, spaces/dashes are all handled) — you don't need to reformat anything in Students' records.</li>
            </ul>

            <h3>Alternative: a network's official Corporate/Business Bulk SMS</h3>
            <p>Jazz, Zong, Ufone, and Telenor each also offer a formal <strong>Business/Corporate Bulk SMS</strong> service (with a branded sender name like "EduAdmin" instead of a phone number). This is a paid business service, not self-serve:</p>
            <ul>
                <li>Contact the network's business sales team (e.g. Jazz Business, Zong Business) and set up a corporate SMS account.</li>
                <li>They will give you an API endpoint and login credentials once the account is approved.</li>
                <li>Ask your IT person/developer to plug those details into the system's SMS settings — this is a one-time backend change, the Notification Center itself doesn't need anything different.</li>
            </ul>
            <p>This route costs more and takes longer to set up than the Android-phone method above, but gives you a professional branded sender name instead of a personal phone number — worth it for larger schools sending high volumes.</p>
        `
    },
    {
        id: 'users',
        title: '👥 Users <span class="help-admin-badge">Admin only</span>',
        body: `
            <p>Manage who can log in to the system and what they're allowed to do.</p>
            <ul>
                <li><strong>+ Add User</strong> — create a login for a new staff member, choosing a role (Admin, Teacher, or Viewer).</li>
                <li><strong>Edit</strong> — change a user's name, role, active status, or reset their password.</li>
                <li><strong>Delete</strong> — remove a user's access. The system will not let you delete the last remaining Admin account, to prevent lockout.</li>
            </ul>
            <p>If a user is repeatedly failing to log in, their account may be temporarily locked automatically — this clears itself after 15 minutes, or an Admin can resolve it by resetting their password.</p>
        `
    },
    {
        id: 'parent-accounts',
        title: '👨‍👩‍👧 Parent Accounts <span class="help-admin-badge">Admin only</span>',
        body: `
            <p>Create the login each parent uses on the separate <strong>Parent Portal</strong> page — where they can view their child's fees, attendance, results, and notifications, but nothing belonging to any other student.</p>
            <ul>
                <li><strong>+ Add Parent Account</strong> — link a username/password to a single student by Student ID. That parent will only ever see that one student's data.</li>
                <li><strong>Edit</strong> — update the linked student, reset the password, or rename the account.</li>
                <li><strong>Delete</strong> — revoke a parent's portal access entirely.</li>
            </ul>
            <p>A student can have more than one parent account linked (e.g. mother and father each with their own login), but one parent account is always tied to exactly one student.</p>
        `
    },
    {
        id: 'settings',
        title: '⚙️ Settings <span class="help-admin-badge">Admin only</span>',
        body: `
            <h3>General</h3>
            <p>Set the <strong>School Name</strong> shown across the whole system — dashboard, result cards, vouchers, and printouts.</p>

            <h3>Fee management</h3>
            <p>Generate this month's fees, or carry forward unpaid balances (see the Fees help section for details).</p>

            <h3>Notifications</h3>
            <p>Turn <strong>SMS Alerts for Absences</strong> on or off. When on, parents are texted automatically whenever a student is marked Absent or Late in Attendance.</p>
        `
    },
    {
        id: 'backup',
        title: '🗄️ Backup & Restore <span class="help-admin-badge">Admin only</span>',
        body: `
            <p>Creates a single ZIP file containing everything: the full database, every uploaded file (student photos, documents, ID card images, and any future upload folder), plus a human-readable export of settings and notification history.</p>

            <h3>Creating a backup</h3>
            <p>Click <strong>Create Backup Now</strong>. This can take a moment for a large database — the database itself is captured using <code>mysqldump</code>, so it's fine to do this while the app is in normal use.</p>

            <h3>Restoring</h3>
            <p>You can restore from a backup already listed in <strong>Backup History</strong>, or upload a ZIP from your computer with <strong>Restore from Uploaded File</strong>. Either way:</p>
            <ul>
                <li>The backup is validated first (checked for corruption) before anything on your system is touched.</li>
                <li>A fresh safety backup of your <em>current</em> data is taken automatically, so a restore can itself be undone by restoring that safety backup afterward.</li>
                <li>You'll be asked to confirm — this is a destructive action that replaces your current database and files.</li>
                <li>The application restarts automatically once restore finishes; if it doesn't reload on its own after a few seconds, refresh the page manually.</li>
            </ul>

            <h3>Backup History &amp; Action Log</h3>
            <p>The history table lists every backup you can currently download, restore, or delete. The Action Log below it is a full audit trail — every create, restore, delete, and failure, with who did it and when.</p>

            <p><strong>Tip:</strong> Download important backups off this machine periodically (a USB drive or cloud folder) — backups stored only on the same computer won't help if that computer's disk fails.</p>
        `
    },
    {
        id: 'import-data',
        title: '📥 Import Data',
        body: `
            <p>Brings data in from Excel — either exported from another system/database, or filled in using the built-in template. Covers Students, Classes, Teachers, and Fees.</p>

            <h3>Step 1 — Get the template</h3>
            <p>Pick the entity tab (Students / Classes / Teachers / Fees), then click <strong>⬇ Download Template</strong>. Columns marked with <strong>*</strong> in the template are required.</p>

            <h3>Step 2 — Fill it in</h3>
            <p>Fill the template directly, or paste your exported data into it as long as the column headers match. For <strong>Fees</strong>, each row must reference an existing student via <code>student_admission_no</code> (or <code>student_id</code> if re-importing from this same system) — import Students first if you haven't already.</p>

            <h3>Step 3 — Upload &amp; import</h3>
            <p>Choose the filled file (.xlsx/.xlsm) and click <strong>📤 Import</strong>. Records already in the system (matched by admission number for students, or class name for classes) are skipped automatically, so it's safe to re-run an import after fixing a few rows rather than starting over.</p>
        `
    },
    {
        id: 'search',
        title: '🔍 Global Search',
        body: `
            <p>The search box at the top of every page searches across the whole system at once: <strong>Students, Teachers, Classes, Fees, Results, Expenses, Users, Notifications,</strong> and <strong>Library Books</strong>.</p>
            <ul>
                <li>Type at least 2 characters to start seeing results.</li>
                <li>Each result is labeled with its type (e.g. "Student", "Book") so you can tell categories apart at a glance.</li>
                <li>Click any result to jump straight to that module's page.</li>
                <li>Click anywhere outside the search box to close the results.</li>
            </ul>
            <p><strong>Note:</strong> Attendance and Timetable aren't included — those are organized by class/date rather than by a searchable name, so they're best browsed directly from their own pages.</p>
        `
    },
];

async function loadHelp() {
    const contentDiv = document.getElementById('page-content');
    if (!contentDiv) return;

    const listHtml = HELP_TOPICS.map(t => `
        <div class="help-topic-link" data-topic="${t.id}" onclick="showHelpTopic('${t.id}')"
             style="padding:10px 12px; border-radius:6px; cursor:pointer; font-size:13px; margin-bottom:4px;">
            ${t.title}
        </div>
    `).join('');

    contentDiv.innerHTML = `
        <div class="page-header">
            <div class="page-title">Help &amp; User Guide</div>
            <div class="page-sub">Step-by-step instructions for every feature in the system.</div>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:6px; margin-bottom:10px;">
            <button id="helpLangEn" class="btn btn-ghost btn-sm" onclick="setHelpLang('en')">English</button>
            <button id="helpLangUr" class="btn btn-ghost btn-sm" onclick="setHelpLang('ur')">اردو</button>
        </div>
        <div style="display:grid; grid-template-columns:260px 1fr; gap:20px; align-items:start;">
            <div class="card" style="padding:12px;">
                <input type="text" id="helpSearchBox" ="Filter topics..." autocomplete="off"
                    style="width:100%; padding:8px 10px; margin-bottom:10px; border-radius:6px; border:1px solid #334155; background:#0f172a; color:#f8fafc; font-size:13px;">
                <div id="helpTopicList">${listHtml}</div>
            </div>
            <div class="card" id="helpContentPane" style="min-height:300px; line-height:1.7;"></div>
        </div>
        <style>
            .help-topic-link:hover { background:#1e293b; }
            .help-topic-link.active { background:#0284c7; color:#fff; }
            .help-admin-badge { font-size:10px; background:#7c3aed; color:#fff; padding:2px 6px; border-radius:4px; margin-left:6px; vertical-align:middle; }
            #helpLangEn.active, #helpLangUr.active { background:#0284c7; color:#fff; }
            #helpContentPane h3 { margin-top:18px; margin-bottom:6px; font-size:15px; color:#38bdf8; }
            #helpContentPane h3:first-child { margin-top:0; }
            #helpContentPane ul, #helpContentPane ol { margin:6px 0 6px 22px; }
            #helpContentPane p { margin:6px 0; }
            #helpContentPane[dir="rtl"] { text-align:right; font-size:14.5px; }
            #helpContentPane[dir="rtl"] ul, #helpContentPane[dir="rtl"] ol { margin:6px 22px 6px 0; }
        </style>
    `;

    document.getElementById('helpSearchBox').addEventListener('keyup', filterHelpTopics);
    updateHelpLangButtons();

    // Show the first topic by default
    showHelpTopic(HELP_TOPICS[0].id);
}

window.setHelpLang = function (lang) {
    helpLang = lang;
    updateHelpLangButtons();
    const activeLink = document.querySelector('.help-topic-link.active');
    if (activeLink) showHelpTopic(activeLink.dataset.topic);
};

function updateHelpLangButtons() {
    const enBtn = document.getElementById('helpLangEn');
    const urBtn = document.getElementById('helpLangUr');
    if (enBtn) enBtn.classList.toggle('active', helpLang === 'en');
    if (urBtn) urBtn.classList.toggle('active', helpLang === 'ur');
}

window.showHelpTopic = function(topicId) {
    const topic = HELP_TOPICS.find(t => t.id === topicId);
    const pane = document.getElementById('helpContentPane');
    if (!topic || !pane) return;

    const showUrdu = helpLang === 'ur' && topic.body_ur;
    const notice = (helpLang === 'ur' && !topic.body_ur)
        ? `<div style="font-size:12px; color:#f59e0b; margin-bottom:10px;">اردو ترجمہ ابھی اس موضوع کے لیے دستیاب نہیں — نیچے انگریزی میں دکھایا جا رہا ہے۔ (Urdu translation isn't available for this topic yet — showing English below.)</div>`
        : '';

    pane.setAttribute('dir', showUrdu ? 'rtl' : 'ltr');
    pane.innerHTML = `<div class="card-title" style="margin-bottom:10px;">${topic.title}</div>${notice}${showUrdu ? topic.body_ur : topic.body}`;

    document.querySelectorAll('.help-topic-link').forEach(el => {
        el.classList.toggle('active', el.dataset.topic === topicId);
    });
};

function filterHelpTopics() {
    const keyword = document.getElementById('helpSearchBox').value.trim().toLowerCase();
    document.querySelectorAll('.help-topic-link').forEach(el => {
        const topic = HELP_TOPICS.find(t => t.id === el.dataset.topic);
        const haystack = (topic.title + ' ' + topic.body).toLowerCase();
        el.style.display = haystack.includes(keyword) ? '' : 'none';
    });
}
