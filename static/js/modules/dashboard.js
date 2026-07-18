// ============================================
// DASHBOARD.JS — Dashboard summary page.
// ============================================

let dashboardSelectedYear = new Date().getFullYear();
let dashboardRefreshTimer = null;
const DASHBOARD_REFRESH_MS = 60000; // auto-refresh while the dashboard tab is open

// ============================================
// DASHBOARD MODULE
// ============================================
async function loadDashboard(year) {
    if (year) dashboardSelectedYear = year;
    try {
        const data = await fetchAPI(`/dashboard?year=${dashboardSelectedYear}`);
        const canViewFinancials = !!data.can_view_financials;

        const attendanceValue = data.attendance_total ? `${data.attendance_percent}%` : '—';
        const attendanceSub = data.attendance_total
            ? `${data.attendance_present}/${data.attendance_total} present today`
            : 'No attendance marked today';

        const staffAttendanceValue = data.staff_attendance_total ? `${data.staff_attendance_percent}%` : '—';
        const staffAttendanceSub = data.staff_attendance_total
            ? `${data.staff_attendance_present}/${data.staff_attendance_total} present today`
            : 'No staff attendance marked today';

        const netBalance = (data.fees_collected || 0) - (data.expenses_this_month || 0);

        const yearNow = new Date().getFullYear();
        const yearOptions = [yearNow, yearNow - 1, yearNow - 2, yearNow - 3, yearNow - 4]
            .map(y => `<option value="${y}" ${y === dashboardSelectedYear ? 'selected' : ''}>${y}</option>`)
            .join('');

        const financialKpis = canViewFinancials ? `
                <div class="kpi-card"><div class="kpi-label">Fees Collected</div><div class="kpi-value" style="font-size:18px">PKR ${(data.fees_collected || 0).toLocaleString()}</div><div class="kpi-sub" style="color:var(--red)">PKR ${(data.fees_pending || 0).toLocaleString()} pending</div></div>
                <div class="kpi-card"><div class="kpi-label">Expenses (This Month)</div><div class="kpi-value" style="font-size:18px; color:var(--red)">PKR ${(data.expenses_this_month || 0).toLocaleString()}</div><div class="kpi-sub" style="color:${netBalance >= 0 ? 'var(--green)' : 'var(--red)'}">Net: PKR ${netBalance.toLocaleString()}</div></div>` : '';

        const financialChartCard = canViewFinancials ? `
                <div class="card"><div class="card-title">Fee Collection vs Expenses (${dashboardSelectedYear})</div><canvas id="feeChart" height="160"></canvas></div>` : '';

        const defaultersCard = (canViewFinancials && (data.top_defaulters || []).length) ? `
            <div class="card" id="defaultersCard">
                <div class="card-title">Top Fee Defaulters</div>
                <div class="table-wrap"><table class="data-table"><thead><tr><th>Student</th><th>Balance Due</th></tr></thead><tbody>${data.top_defaulters.map(d => `<tr><td>${escapeHtml(d.student_name || d.student_id || '-')}</td><td style="color:var(--red)">PKR ${parseInt(d.balance || 0).toLocaleString()}</td></tr>`).join('')}</tbody></table></div>
            </div>` : '';

        const recentFeesCard = canViewFinancials ? `
            <div class="card" id="recentFeesCard">
                <div class="card-title">Recent Fee Transactions</div>
                <div class="table-wrap"><table class="data-table"><thead><tr><th>Student</th><th>Fee Type</th><th>Paid</th><th>Status</th><th>Date</th></tr></thead><tbody>${(data.recent_fees || []).map(fee => `<tr><td>${escapeHtml(fee.student_name || '-')}</td><td>${escapeHtml(fee.fee_type || '-')}</td><td>PKR ${parseInt(fee.paid_amount || 0).toLocaleString()}</td><td>${fee.status === 'Paid' ? '<span class="badge badge-green">Paid</span>' : fee.status === 'Pending' ? '<span class="badge badge-red">Pending</span>' : '<span class="badge badge-yellow">Partial</span>'}</td><td>${fee.paid_date || fee.due_date || '-'}</td></tr>`).join('')}</tbody></table></div>
            </div>` : '';

        const html = `
            <div class="page-header">
                <div class="page-title">Dashboard</div>
                <div class="page-sub">Overview of school performance and finances.</div>
                <div style="float:right; margin-top:-52px; display:flex; gap:8px; align-items:center;">
                    <select id="dashboardYearSelect" class="filter" onchange="loadDashboard(parseInt(this.value))" style="padding:6px 10px;">${yearOptions}</select>
                    <button onclick="printDashboardReport()" class="btn btn-primary">🖨 Print Dashboard</button>
                </div>
            </div>
            <div class="kpi-grid">
                <div class="kpi-card"><div class="kpi-label">Total Students</div><div class="kpi-value">${data.students || 0}</div><div class="kpi-sub">Enrolled this year</div></div>
                <div class="kpi-card"><div class="kpi-label">Total Teachers</div><div class="kpi-value">${data.teachers || 0}</div><div class="kpi-sub">Active staff</div></div>
                <div class="kpi-card"><div class="kpi-label">Classes</div><div class="kpi-value">${data.classes || 0}</div><div class="kpi-sub">Active classes</div></div>
                <div class="kpi-card"><div class="kpi-label">Student Attendance Today</div><div class="kpi-value" style="color:${data.attendance_total ? 'var(--green)' : '#fff'}">${attendanceValue}</div><div class="kpi-sub">${attendanceSub}</div></div>
                <div class="kpi-card"><div class="kpi-label">Staff Attendance Today</div><div class="kpi-value" style="color:${data.staff_attendance_total ? 'var(--green)' : '#fff'}">${staffAttendanceValue}</div><div class="kpi-sub">${staffAttendanceSub}</div></div>
                <div class="kpi-card"><div class="kpi-label">Low Stock Items</div><div class="kpi-value" style="color:${(data.low_stock_count || 0) > 0 ? 'var(--yellow)' : '#fff'}">${data.low_stock_count || 0}</div><div class="kpi-sub">At or below reorder level</div></div>
                <div class="kpi-card"><div class="kpi-label">Pending Leave Requests</div><div class="kpi-value" style="color:${(data.pending_leaves_count || 0) > 0 ? 'var(--yellow)' : '#fff'}">${data.pending_leaves_count || 0}</div><div class="kpi-sub">Awaiting review</div></div>
                <div class="kpi-card"><div class="kpi-label">Overdue Library Books</div><div class="kpi-value" style="color:${(data.library_overdue_count || 0) > 0 ? 'var(--yellow)' : '#fff'}">${data.library_overdue_count || 0}</div><div class="kpi-sub">Not yet returned</div></div>${financialKpis}
            </div>
            <div class="charts-grid">${financialChartCard}
                <div class="card"><div class="card-title">Grade Distribution</div><canvas id="gradeChart" height="160"></canvas></div>
            </div>
            <div class="charts-grid">
                <div class="card"><div class="card-title">Attendance Trend (Last 14 Days)</div><canvas id="attendanceChart" height="160"></canvas></div>
                <div class="card"><div class="card-title">Students per Class</div><canvas id="classChart" height="160"></canvas></div>
            </div>
            ${defaultersCard}
            ${recentFeesCard}
        `;
        document.getElementById('page-content').innerHTML = html;
        setTimeout(() => {
            if (charts.feeChart) charts.feeChart.destroy();
            if (charts.gradeChart) charts.gradeChart.destroy();
            if (charts.attendanceChart) charts.attendanceChart.destroy();
            if (charts.classChart) charts.classChart.destroy();

            const feeCtx = document.getElementById('feeChart');
            const gradeCtx = document.getElementById('gradeChart');
            const attendanceCtx = document.getElementById('attendanceChart');
            const classCtx = document.getElementById('classChart');

            if (feeCtx && data.months && data.fee_monthly) {
                charts.feeChart = new Chart(feeCtx, { type:'bar', data:{ labels:data.months, datasets:[
                    { label:'Collected', data:data.fee_monthly, backgroundColor:'rgba(59,130,246,0.7)', borderRadius:6 },
                    { label:'Expenses', data:data.expense_monthly || [], backgroundColor:'rgba(239,68,68,0.7)', borderRadius:6 }
                ] }, options:{ responsive:true, maintainAspectRatio:true, plugins:{ legend:{ display:true, labels:{ color:'#94a3b8' } } }, scales:{ x:{ grid:{ color:'#1e3a5f' }, ticks:{ color:'#64748b' } }, y:{ grid:{ color:'#1e3a5f' }, ticks:{ color:'#64748b', callback:(v)=>'PKR '+(v/1000)+'k' } } } } });
            }
            if (gradeCtx && data.grade_labels && data.grade_data) {
                charts.gradeChart = new Chart(gradeCtx, { type:'doughnut', data:{ labels:data.grade_labels, datasets:[{ data:data.grade_data, backgroundColor:['#22c55e','#3b82f6','#60a5fa','#a855f7','#f59e0b','#ef4444'], borderWidth:0 }] }, options:{ responsive:true, maintainAspectRatio:true, plugins:{ legend:{ position:'bottom', labels:{ color:'#94a3b8', font:{ size:11 } } } } } });
            }
            if (attendanceCtx && data.attendance_trend) {
                charts.attendanceChart = new Chart(attendanceCtx, { type:'line', data:{ labels:data.attendance_trend.map(r=>r.date), datasets:[{ label:'Present %', data:data.attendance_trend.map(r=>r.percent), borderColor:'#22c55e', backgroundColor:'rgba(34,197,94,0.15)', tension:0.35, fill:true, pointRadius:3 }] }, options:{ responsive:true, maintainAspectRatio:true, plugins:{ legend:{ display:false } }, scales:{ x:{ grid:{ color:'#1e3a5f' }, ticks:{ color:'#64748b' } }, y:{ min:0, max:100, grid:{ color:'#1e3a5f' }, ticks:{ color:'#64748b', callback:(v)=>v+'%' } } } } });
            }
            if (classCtx && data.class_labels && data.class_data) {
                charts.classChart = new Chart(classCtx, { type:'bar', data:{ labels:data.class_labels, datasets:[{ label:'Students', data:data.class_data, backgroundColor:'rgba(168,85,247,0.7)', borderRadius:6 }] }, options:{ indexAxis:'y', responsive:true, maintainAspectRatio:true, plugins:{ legend:{ display:false } }, scales:{ x:{ grid:{ color:'#1e3a5f' }, ticks:{ color:'#64748b' } }, y:{ grid:{ color:'#1e3a5f' }, ticks:{ color:'#64748b', font:{ size:11 } } } } } });
            }
        }, 100);

        scheduleDashboardAutoRefresh();
    } catch (error) { console.error(error); document.getElementById('page-content').innerHTML = '<div class="loading">Failed to load dashboard.</div>'; }
}

// Keeps the dashboard numbers fresh while it's the visible tab; stops
// itself the moment the user navigates elsewhere so it never runs (or
// fetches) in the background against other pages.
function scheduleDashboardAutoRefresh() {
    if (dashboardRefreshTimer) clearInterval(dashboardRefreshTimer);
    dashboardRefreshTimer = setInterval(() => {
        if (currentPage !== 'dashboard') {
            clearInterval(dashboardRefreshTimer);
            dashboardRefreshTimer = null;
            return;
        }
        loadDashboard(dashboardSelectedYear);
    }, DASHBOARD_REFRESH_MS);
}

function printDashboardReport() {
    const kpis = document.querySelector('.kpi-grid')?.outerHTML || '';
    const chartGrids = Array.from(document.querySelectorAll('.charts-grid')).map(el => el.outerHTML).join('');
    const defaulters = document.getElementById('defaultersCard')?.outerHTML || '';
    const recent = document.getElementById('recentFeesCard')?.outerHTML || '';
    printPreview(kpis+chartGrids+defaulters+recent, 'School Dashboard Report');
}
