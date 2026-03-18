/* =======================================================
   ARASCO Maintenance Monitor — Dashboard Application
   ======================================================= */

// Register Chart.js datalabels plugin globally
Chart.register(ChartDataLabels);

// ─── Global State ───────────────────────────────────────
window.dashboardState = {
    rawData: null,
    selectedSite: 'All',
    selectedLine: 'All',
    startDate: null,   // Date object or null (no lower bound)
    endDate: null,      // Date object or null (no upper bound)
    activeFilter: { type: null, value: null },
    drillLevel: 'month',
    drillContext: null,
    charts: {},
    topN: { breakdownLines: 'all', breakdownEquipments: 'all' },
    contextTarget: null // for right-click drill-through
};

const COLORS = {
    primary: '#2E6DA4',
    highlight: '#1A73E8',
    navy: '#0D2137',
    greenGood: '#1D8348',
    red: '#E74C3C',
    targetGreen: '#2ECC40',
    electrical: '#2E6DA4',
    mechanical: '#1B4F72',
    utilities: '#2ECC40',
    budgetOk: '#2ECC40',
    budgetWarn: '#F5A623',
    budgetOver: '#E74C3C',
    rcaDone: '#2ECC40',
    rcaPlan: '#2E6DA4',
    sites: { KFM: '#2E6DA4', DFM: '#E74C3C', ARCHEM: '#2ECC40' }
};

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── Utility Functions ──────────────────────────────────

function col(row, ...names) {
    // Flexible column accessor: finds first matching key
    const keys = Object.keys(row);
    for (const name of names) {
        const lower = name.toLowerCase();
        const found = keys.find(k => k.trim().toLowerCase().includes(lower));
        if (found !== undefined) return row[found];
    }
    return null;
}

function colKey(row, ...names) {
    const keys = Object.keys(row);
    for (const name of names) {
        const lower = name.toLowerCase();
        const found = keys.find(k => k.trim().toLowerCase().includes(lower));
        if (found !== undefined) return found;
    }
    return null;
}

function parseDate(val) {
    if (!val) return null;
    if (val instanceof Date) return normalizeDate(val);
    if (typeof val === 'number') {
        // Excel serial date
        const epoch = new Date(1899, 11, 30);
        return normalizeDate(new Date(epoch.getTime() + val * 86400000));
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : normalizeDate(d);
}

// Fix SheetJS date rounding: dates near 23:59 should snap to the next midnight
function normalizeDate(d) {
    if (!d || !(d instanceof Date) || isNaN(d.getTime())) return d;
    if (d.getHours() >= 12) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function monthKey(date) {
    if (!date) return null;
    const d = parseDate(date);
    if (!d) return null;
    return `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

function monthSort(a, b) {
    const pa = parseMonthKey(a), pb = parseMonthKey(b);
    if (!pa || !pb) return 0;
    return pa.getTime() - pb.getTime();
}

function parseMonthKey(key) {
    if (!key) return null;
    const parts = key.split(' ');
    if (parts.length !== 2) return null;
    const mi = MONTHS_SHORT.indexOf(parts[0]);
    if (mi === -1) return null;
    return new Date(parseInt(parts[1]), mi, 1);
}

function formatNum(n, decimals = 0) {
    if (n == null || isNaN(n)) return '--';
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatSAR(n) {
    if (n == null || isNaN(n)) return '--';
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function num(val) {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
}

function destroyChart(name) {
    if (dashboardState.charts[name]) {
        dashboardState.charts[name].destroy();
        dashboardState.charts[name] = null;
    }
}

function destroyAllCharts() {
    Object.keys(dashboardState.charts).forEach(destroyChart);
}

// ─── Data Loading ───────────────────────────────────────

async function loadData() {
    const response = await fetch('/api/dashboard-data?_cb=' + Date.now());
    if (!response.ok) throw new Error('API request failed: ' + response.status);
    const apiData = await response.json();

    const data = {
        linePerformance: apiData.linePerformance || [],
        breakdown: apiData.breakdown || [],
        projectTracking: [],
        spareParts: apiData.spareParts || [],
        siteMaintenance: apiData.siteMaintenance || [],
        rca: apiData.rca || [],
        details: []
    };

    // Map API snake_case fields to original column names so col() works unchanged
    data.linePerformance.forEach(r => {
        r._date = r.date ? new Date(r.date + 'T00:00:00') : null;
        r._month = monthKey(r._date);
        r._site = (r.site_id || '').trim();
        r._line = (r.line_id || '').trim();
        r.Running_Time = r.running_time;
        r.Downtime_Electrical = r.downtime_electrical;
        r.Downtime_Mechanical = r.downtime_mechanical;
        r.Downtime_Utilities = r.downtime_utilities;
        r.Site_ID = r.site_id;
        r.Line_ID = r.line_id;
        r.Date = r.date;
    });

    data.breakdown.forEach(r => {
        r._date = r.date ? new Date(r.date + 'T00:00:00') : null;
        r._month = monthKey(r._date);
        r._site = (r.site_id || '').trim();
        r._line = (r.line_id || '').trim();
        r.Breakdown_Duration = r.breakdown_duration;
        r.Total_Breakdown = r.breakdown_duration;
        r.Total_Breakdown_Minutes = r.breakdown_duration;
        r.Equipment_ID = r.equipment_id;
        r.Line_ID = r.line_id;
        r.Site_ID = r.site_id;
        r.Breakdown_Reason = r.breakdown_reason;
        r.Corrective_Action = r.corrective_action;
        r.Preventive_Action = r.preventive_action;
        r.Maintenance_Issue = r.maintenance_issue;
        r.Type = r.type;
        r.Date = r.date;
    });

    data.spareParts.forEach(r => {
        r._date = r.date ? new Date(r.date + 'T00:00:00') : null;
        r._month = monthKey(r._date);
        r._site = (r.site_id || '').trim();
        r.Total = r.sp_cost;
        r.SP_Cost = r.sp_cost;
        r.Budget_Cost = r.budget_cost;
        r.Site_ID = r.site_id;
    });

    data.siteMaintenance.forEach(r => {
        r._date = r.date ? new Date(r.date + 'T00:00:00') : null;
        r._month = monthKey(r._date);
        r._site = (r.site_id || '').trim();
        r.PM_Scheduled = r.pm_scheduled;
        r.PM_Completed = r.pm_completed;
        r.Corrective_tasks = r.corrective_tasks;
        r.Site_ID = r.site_id;
    });

    data.rca.forEach(r => {
        r._date = r.incident_date ? new Date(r.incident_date + 'T00:00:00') : null;
        r._month = monthKey(r._date);
        r._site = (r.site_id || '').trim();
        r.Completed = r.completed;
        r.Site_ID = r.site_id;
        r.Incident_ID = r.incident_id;
        r['Incident ID'] = r.incident_id;
    });

    // Build plant→line mapping
    const lineMap = {};
    [...data.linePerformance, ...data.breakdown].forEach(r => {
        const s = r._site, l = r._line;
        if (s && l) {
            if (!lineMap[s]) lineMap[s] = new Set();
            lineMap[s].add(l);
        }
    });
    data._lineMap = {};
    Object.keys(lineMap).sort().forEach(s => {
        data._lineMap[s] = [...lineMap[s]].sort();
    });

    return data;
}

// ─── Filter Logic ───────────────────────────────────────

function getDateRange(data) {
    let min = null, max = null;
    const allRows = [...data.linePerformance, ...data.breakdown, ...data.spareParts];
    allRows.forEach(r => {
        if (r._date) {
            if (!min || r._date < min) min = r._date;
            if (!max || r._date > max) max = r._date;
        }
    });
    return { min, max };
}

function setDateInputDefaults(data) {
    const range = getDateRange(data);
    const startInput = document.getElementById('start-date');
    const endInput = document.getElementById('end-date');
    if (range.min && range.max) {
        startInput.min = toISODate(range.min);
        endInput.max = toISODate(range.max);
        // Default: most recent month with actual SP cost data for at least 2 sites
        const monthCosts = {};
        data.spareParts.forEach(r => {
            if (r._month && num(col(r, 'Total', 'SP_Cost')) > 0) {
                if (!monthCosts[r._month]) monthCosts[r._month] = { count: 0, date: r._date };
                monthCosts[r._month].count++;
            }
        });
        let effectiveMax = range.max;
        const sortedMonths = Object.keys(monthCosts).sort(monthSort).reverse();
        for (const m of sortedMonths) {
            if (monthCosts[m].count >= 2) { effectiveMax = monthCosts[m].date; break; }
        }
        if (!effectiveMax && sortedMonths.length) effectiveMax = monthCosts[sortedMonths[0]].date;
        const recentStart = new Date(effectiveMax.getFullYear(), effectiveMax.getMonth(), 1);
        const recentEnd = new Date(effectiveMax.getFullYear(), effectiveMax.getMonth() + 1, 0); // last day of month
        startInput.value = toISODate(recentStart);
        endInput.value = toISODate(recentEnd);
        // Cross-constrain: From cannot exceed To and vice versa
        endInput.min = toISODate(recentStart);
        startInput.max = toISODate(recentEnd);
        dashboardState.startDate = recentStart;
        dashboardState.endDate = recentEnd;
    }
}

function toISODate(d) {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function populateLineFilter(data, site) {
    const dropdown = document.getElementById('line-dropdown');
    const display = document.getElementById('line-display');
    const lineMap = data._lineMap || {};
    const sites = site === 'All' ? Object.keys(lineMap).sort() : (lineMap[site] ? [site] : []);

    let html = '<label class="multi-select-item"><input type="checkbox" value="All" checked> All Lines</label>';
    sites.forEach(s => {
        (lineMap[s] || []).forEach(l => {
            const val = site === 'All' ? `${s}|${l}` : l;
            const label = site === 'All' ? `${s} - ${l}` : l;
            html += `<label class="multi-select-item"><input type="checkbox" value="${val}"> ${label}</label>`;
        });
    });
    dropdown.innerHTML = html;
    display.textContent = 'All Lines';
    dashboardState.selectedLine = 'All';
}

function getSelectedLines() {
    const checkboxes = document.querySelectorAll('#line-dropdown input[type="checkbox"]');
    const allCb = checkboxes[0]; // "All" checkbox
    if (allCb && allCb.checked) return 'All';
    const selected = [];
    checkboxes.forEach(cb => { if (cb.checked && cb.value !== 'All') selected.push(cb.value); });
    return selected.length === 0 ? 'All' : selected;
}

function updateLineDisplay() {
    const display = document.getElementById('line-display');
    const selected = getSelectedLines();
    if (selected === 'All') {
        display.textContent = 'All Lines';
    } else if (selected.length === 1) {
        const label = selected[0].includes('|') ? selected[0].split('|')[1] : selected[0];
        display.textContent = label;
    } else {
        display.textContent = `${selected.length} Lines`;
    }
}

function filterByAll(arr, site, startDate, endDate, line) {
    return arr.filter(r => {
        const siteMatch = site === 'All' || r._site === site;
        let dateMatch = true;
        if (startDate && r._date) dateMatch = r._date >= startDate;
        else if (startDate && !r._date) dateMatch = false;
        if (dateMatch && endDate && r._date) {
            const endOfDay = new Date(endDate);
            endOfDay.setHours(23, 59, 59, 999);
            dateMatch = r._date <= endOfDay;
        } else if (endDate && !r._date) dateMatch = false;
        let lineMatch = true;
        if (line && line !== 'All') {
            if (Array.isArray(line)) {
                lineMatch = line.some(l => {
                    if (l.includes('|')) { const [ls, ll] = l.split('|'); return r._site === ls && r._line === ll; }
                    return r._line === l;
                });
            } else if (line.includes('|')) {
                const [ls, ll] = line.split('|');
                lineMatch = r._site === ls && r._line === ll;
            } else {
                lineMatch = r._line === line;
            }
        }
        return siteMatch && dateMatch && lineMatch;
    });
}

// For data without _line (spareParts, siteMaintenance, rca) — filter by site + date only
function filterBySiteAndDate(arr, site, startDate, endDate) {
    return arr.filter(r => {
        const siteMatch = site === 'All' || r._site === site;
        let dateMatch = true;
        if (startDate && r._date) dateMatch = r._date >= startDate;
        else if (startDate && !r._date) dateMatch = false;
        if (dateMatch && endDate && r._date) {
            const endOfDay = new Date(endDate);
            endOfDay.setHours(23, 59, 59, 999);
            dateMatch = r._date <= endOfDay;
        } else if (endDate && !r._date) dateMatch = false;
        return siteMatch && dateMatch;
    });
}

function filterBySite(arr, site) {
    return site === 'All' ? arr : arr.filter(r => r._site === site);
}

// Filter SP data by months that overlap with the selected date range
function filterSPByMonth(arr, site, startDate, endDate) {
    return arr.filter(r => {
        const siteMatch = site === 'All' || r._site === site;
        if (!siteMatch) return false;
        if (!r._date) return false;
        // Get the month range for this SP row (first to last day of month)
        const monthStart = new Date(r._date.getFullYear(), r._date.getMonth(), 1);
        const monthEnd = new Date(r._date.getFullYear(), r._date.getMonth() + 1, 0, 23, 59, 59);
        if (startDate && monthEnd < startDate) return false;
        if (endDate && monthStart > endDate) return false;
        return true;
    });
}

function getMostRecentDate(data) {
    let max = null;
    data.linePerformance.forEach(r => { if (r._date && (!max || r._date > max)) max = r._date; });
    data.breakdown.forEach(r => { if (r._date && (!max || r._date > max)) max = r._date; });
    return max;
}

// ─── KPI Calculations ───────────────────────────────────

function renderKPIs(data, site, startDate, endDate, line) {
    // Line Availability
    const lpData = filterByAll(data.linePerformance, site, startDate, endDate, line);
    let running = 0, downE = 0, downM = 0, downU = 0;
    lpData.forEach(r => {
        running += num(col(r, 'Running_Time'));
        downE += num(col(r, 'Downtime_Electrical'));
        downM += num(col(r, 'Downtime_Mechanical'));
        downU += num(col(r, 'Downtime_Utilities'));
    });
    const totalTime = running + downE + downM + downU;
    const laVal = document.getElementById('kpi-la-value');
    if (totalTime > 0) {
        const la = (running / totalTime) * 100;
        laVal.textContent = la.toFixed(2) + '%';
        laVal.className = 'kpi-value ' + (la >= 95 ? 'green' : 'red');
    } else {
        laVal.textContent = '(Blank)';
        laVal.className = 'kpi-value';
    }

    // Spare Parts Cost — filter by month overlap, not exact dates
    const spData = filterSPByMonth(data.spareParts, site, startDate, endDate);
    const spVal = document.getElementById('kpi-sp-value');
    const spSub = document.getElementById('kpi-sp-sub');
    if (spData.length > 0) {
        let totalCost = 0, budgetCost = 0;
        // Group by site+month to avoid duplicates
        const seen = new Map();
        spData.forEach(r => {
            const key = `${r._site || ''}|${r._month || ''}`;
            if (!seen.has(key)) seen.set(key, []);
            seen.get(key).push(r);
        });
        seen.forEach(rows => {
            rows.forEach(r => {
                totalCost += num(col(r, 'Total', 'SP_Cost'));
                budgetCost += num(col(r, 'Budget_Cost', 'Budget'));
            });
        });
        spVal.textContent = formatSAR(totalCost) + ' SAR';
        const siteLabel = site === 'All' ? 'Overall' : site;
        const dateLabel = startDate && endDate ? `${toISODate(startDate)} to ${toISODate(endDate)}` : 'All Dates';
        spSub.innerHTML = `${siteLabel} | ${dateLabel}<br><span class="budget-arrow">▼</span> ${formatSAR(budgetCost)} vs Budget`;
    } else {
        spVal.textContent = '(Blank)';
        spSub.textContent = '';
    }

    // PM Completion Rate — filter by month overlap
    const smData = filterSPByMonth(data.siteMaintenance, site, startDate, endDate);
    const pmVal = document.getElementById('kpi-pm-value');
    const pmSub = document.getElementById('kpi-pm-sub');
    if (smData.length > 0) {
        let scheduled = 0, completed = 0;
        smData.forEach(r => {
            scheduled += num(col(r, 'PM_Scheduled', 'Scheduled'));
            completed += num(col(r, 'PM_Completed', 'Completed'));
        });
        if (scheduled > 0) {
            const rate = (completed / scheduled) * 100;
            pmVal.textContent = rate.toFixed(1) + '%';
            pmVal.className = 'kpi-value ' + (rate >= 90 ? 'green' : 'red');
            pmSub.textContent = `${completed} / ${scheduled} tasks`;
        } else {
            pmVal.textContent = '(Blank)';
            pmVal.className = 'kpi-value';
            pmSub.textContent = '';
        }
    } else {
        pmVal.textContent = '(Blank)';
        pmVal.className = 'kpi-value';
        pmSub.textContent = '';
    }

    // Corrective Tasks — filter by month overlap
    const ctData = filterSPByMonth(data.siteMaintenance, site, startDate, endDate);
    const ctVal = document.getElementById('kpi-ct-value');
    const ctSub = document.getElementById('kpi-ct-sub');
    if (ctData.length > 0) {
        let totalTasks = 0;
        ctData.forEach(r => { totalTasks += num(col(r, 'Corrective_tasks', 'Corrective')); });
        ctVal.textContent = formatNum(totalTasks);
        ctVal.className = 'kpi-value';
        const dateLabel = startDate && endDate ? `${toISODate(startDate)} to ${toISODate(endDate)}` : 'All dates';
        ctSub.textContent = dateLabel;
    } else {
        ctVal.textContent = '(Blank)';
        ctVal.className = 'kpi-value';
        ctSub.textContent = '';
    }
}

// ─── Line Availability Chart ────────────────────────────

function renderLineAvailabilityChart(data, site, startDate, endDate, line) {
    destroyChart('lineAvailability');
    const ctx = document.getElementById('chart-line-availability').getContext('2d');

    const lpData = filterByAll(data.linePerformance, site, startDate, endDate, line);
    const months = [...new Set(lpData.map(r => r._month).filter(Boolean))].sort(monthSort);
    const sites = site === 'All' ? [...new Set(lpData.map(r => r._site).filter(Boolean))] : [site];

    const datasets = sites.map(s => {
        const vals = months.map(m => {
            const rows = lpData.filter(r => r._site === s && r._month === m);
            let run = 0, dE = 0, dM = 0, dU = 0;
            rows.forEach(r => {
                run += num(col(r, 'Running_Time'));
                dE += num(col(r, 'Downtime_Electrical'));
                dM += num(col(r, 'Downtime_Mechanical'));
                dU += num(col(r, 'Downtime_Utilities'));
            });
            const total = run + dE + dM + dU;
            return total > 0 ? (run / total) * 100 : null;
        });
        return {
            label: s,
            data: vals,
            borderColor: COLORS.sites[s] || COLORS.primary,
            backgroundColor: (COLORS.sites[s] || COLORS.primary) + '33',
            borderWidth: 2,
            pointRadius: 4,
            tension: 0.3,
            fill: false
        };
    });

    // Target line at 95%
    datasets.push({
        label: 'Target (95%)',
        data: months.map(() => 95),
        borderColor: COLORS.targetGreen,
        borderDash: [6, 4],
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        datalabels: { display: false }
    });

    dashboardState.charts.lineAvailability = new Chart(ctx, {
        type: 'line',
        data: { labels: months, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                datalabels: {
                    align: 'top', font: { size: 10, weight: 'bold' },
                    formatter: v => v != null ? v.toFixed(1) + '%' : '',
                    color: '#333'
                }
            },
            scales: {
                x: {
                    offset: true,
                    ticks: { font: { size: 12, weight: 'bold' } }
                },
                y: {
                    min: (() => {
                        const dataVals = datasets.slice(0, -1).flatMap(ds => ds.data).filter(v => v != null);
                        if (!dataVals.length) return 85;
                        const minVal = Math.min(...dataVals);
                        return Math.max(0, Math.floor(minVal / 5) * 5 - 5);
                    })(),
                    max: 100,
                    ticks: { callback: v => v + '%' }
                }
            }
        }
    });
}

// ─── Downtime by Type Pie Chart ─────────────────────────

function renderDowntimePieChart(data, site, startDate, endDate, line) {
    destroyChart('downtimePie');
    const ctx = document.getElementById('chart-downtime-type').getContext('2d');

    let lpData = filterByAll(data.linePerformance, site, startDate, endDate, line);

    // Check if cross-filter is active on a breakdown line
    const af = dashboardState.activeFilter;
    if (af.type === 'line' && af.value) {
        // Filter line performance to matching line
        const parts = af.value.split('_');
        if (parts.length >= 2) {
            const afSite = parts[0];
            const afLine = parts.slice(1).join('_');
            lpData = lpData.filter(r => r._site === afSite && col(r, 'Line_ID') === afLine);
        }
    }

    let dE = 0, dM = 0, dU = 0;
    lpData.forEach(r => {
        dE += num(col(r, 'Downtime_Electrical'));
        dM += num(col(r, 'Downtime_Mechanical'));
        dU += num(col(r, 'Downtime_Utilities'));
    });
    const total = dE + dM + dU;

    dashboardState.charts.downtimePie = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Electrical', 'Mechanical', 'Utilities'],
            datasets: [{
                data: [dE, dM, dU],
                backgroundColor: [COLORS.electrical, COLORS.mechanical, COLORS.utilities],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            cutout: '40%',
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                datalabels: {
                    color: '#fff', font: { size: 11, weight: 'bold' },
                    formatter: (v) => {
                        if (total === 0) return '';
                        const pct = ((v / total) * 100).toFixed(1);
                        return `${formatNum(v)}\n(${pct}%)`;
                    }
                }
            }
        }
    });
}

// ─── RCA Status Table ───────────────────────────────────

function renderRCATable(data, site, startDate, endDate) {
    const container = document.getElementById('rca-table-container');
    const rcaData = filterBySiteAndDate(data.rca, site, startDate, endDate);

    const sites = site === 'All' ? [...new Set(rcaData.map(r => r._site).filter(Boolean))].sort() : [site];

    // Count by site
    const counts = {};
    sites.forEach(s => {
        const siteRows = rcaData.filter(r => r._site === s);
        const incidentIds = new Set();
        let actions = 0, done = 0, pending = 0, plan = 0;
        siteRows.forEach(r => {
            const id = col(r, 'Incident ID', 'Incident_ID');
            if (id != null) incidentIds.add(id);
            actions++;
            const status = (col(r, 'Completed', 'Completed (Y/N)') || '').toString().trim().toLowerCase();
            if (status === 'done' || status === 'y' || status === 'yes') done++;
            else if (status === 'plan' || status === 'planned') plan++;
            else pending++;
        });
        counts[s] = { incidents: incidentIds.size, actions, done, pending, plan };
    });

    // Build table
    let html = '<table class="data-table"><thead><tr><th>RCA</th>';
    sites.forEach(s => { html += `<th>${s}</th>`; });
    html += '<th>Total</th></tr></thead><tbody>';

    const rows = [
        { key: 'incidents', label: 'Incidents' },
        { key: 'actions', label: 'Actions' },
        { key: 'done', label: 'Done' },
        { key: 'pending', label: 'Pending' },
        { key: 'plan', label: 'Plan' }
    ];

    rows.forEach(({ key, label }) => {
        html += `<tr><td><strong>${label}</strong></td>`;
        let total = 0;
        sites.forEach(s => {
            const v = counts[s] ? counts[s][key] : 0;
            total += v;
            const cls = key === 'done' ? 'cell-done' : key === 'plan' ? 'cell-plan' : 'cell-number';
            html += `<td class="${cls}">${v}</td>`;
        });
        const cls = key === 'done' ? 'cell-done' : key === 'plan' ? 'cell-plan' : 'cell-number';
        html += `<td class="${cls}">${total}</td></tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

// ─── Breakdown Lines Bar Chart ──────────────────────────

function getBreakdownByLine(data, site, startDate, endDate, line) {
    const bd = filterByAll(data.breakdown, site, startDate, endDate, line)
        .filter(r => (col(r, 'Maintenance_Issue', 'Maintenance Issue') || 'Y').toUpperCase() !== 'N');
    const agg = {};
    bd.forEach(r => {
        const lineId = col(r, 'Line_ID');
        const s = r._site || '';
        const dur = num(col(r, 'Breakdown_Duration', 'Total_Breakdown'));
        const key = site === 'All' ? `${s}_${lineId}` : lineId;
        agg[key] = (agg[key] || 0) + dur;
    });
    return Object.entries(agg)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value);
}

function renderBreakdownLinesChart(data, site, startDate, endDate, line) {
    destroyChart('breakdownLines');
    const ctx = document.getElementById('chart-breakdown-lines').getContext('2d');

    let items = getBreakdownByLine(data, site, startDate, endDate, line);
    const topN = dashboardState.topN.breakdownLines;
    if (topN !== 'all') items = items.slice(0, parseInt(topN));

    const af = dashboardState.activeFilter;
    const bgColors = items.map((item, i) => {
        if (af.type === 'equipment' && af.value) {
            const bd = filterByAll(data.breakdown, site, startDate, endDate, line);
            const eqId = af.value;
            const hasEquip = bd.some(r => {
                const lineKey = site === 'All' ? `${r._site}_${col(r, 'Line_ID')}` : col(r, 'Line_ID');
                return lineKey === item.label && col(r, 'Equipment_ID') === eqId;
            });
            return hasEquip ? COLORS.primary : COLORS.primary + '4D';
        }
        if (af.type === 'line' && af.value) {
            return item.label === af.value ? COLORS.highlight : COLORS.primary + '4D';
        }
        return i === 0 ? COLORS.highlight : COLORS.primary;
    });

    const canvas = document.getElementById('chart-breakdown-lines');
    const inner = document.getElementById('bar-inner-lines');
    const canvasHeight = Math.max(240, items.length * 28);
    inner.style.height = canvasHeight + 'px';

    dashboardState.charts.breakdownLines = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: items.map(i => i.label),
            datasets: [{
                data: items.map(i => i.value),
                backgroundColor: bgColors,
                borderRadius: 3,
                barThickness: 18
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: {
                    anchor: 'end', align: 'end',
                    font: { size: 10, weight: 'bold' },
                    color: '#333',
                    formatter: v => formatNum(v)
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                y: { grid: { display: false }, ticks: { font: { size: 10 } } }
            },
            onClick: (e, elements) => handleBarClick(e, elements, 'line', items),
            onHover: (e, elements) => {
                e.native.target.style.cursor = elements.length ? 'pointer' : 'default';
            }
        }
    });

    // Right-click for drill-through
    canvas.oncontextmenu = (e) => handleBarContextMenu(e, 'line', items, 'breakdownLines');
    // Double-click for direct drill-through
    canvas.ondblclick = (e) => handleBarDblClick(e, 'line', items, 'breakdownLines');
}

// ─── Breakdown Equipments Bar Chart ─────────────────────

function getBreakdownByEquipment(data, site, startDate, endDate, line) {
    const bd = filterByAll(data.breakdown, site, startDate, endDate, line)
        .filter(r => (col(r, 'Maintenance_Issue', 'Maintenance Issue') || 'Y').toUpperCase() !== 'N');
    const agg = {};
    bd.forEach(r => {
        const eqId = col(r, 'Equipment_ID') || 'Unknown';
        const dur = num(col(r, 'Breakdown_Duration', 'Total_Breakdown'));
        agg[eqId] = (agg[eqId] || 0) + dur;
    });
    return Object.entries(agg)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value);
}

function renderBreakdownEquipmentsChart(data, site, startDate, endDate, line) {
    destroyChart('breakdownEquipments');
    const ctx = document.getElementById('chart-breakdown-equipments').getContext('2d');

    let items = getBreakdownByEquipment(data, site, startDate, endDate, line);
    const topN = dashboardState.topN.breakdownEquipments;
    if (topN !== 'all') items = items.slice(0, parseInt(topN));

    const af = dashboardState.activeFilter;
    const bgColors = items.map((item, i) => {
        if (af.type === 'line' && af.value) {
            const bd = filterByAll(data.breakdown, site, startDate, endDate, line);
            const lineVal = af.value;
            const hasLine = bd.some(r => {
                const lineKey = site === 'All' ? `${r._site}_${col(r, 'Line_ID')}` : col(r, 'Line_ID');
                return lineKey === lineVal && (col(r, 'Equipment_ID') || 'Unknown') === item.label;
            });
            return hasLine ? COLORS.primary : COLORS.primary + '4D';
        }
        if (af.type === 'equipment' && af.value) {
            return item.label === af.value ? COLORS.highlight : COLORS.primary + '4D';
        }
        return i === 0 ? COLORS.highlight : COLORS.primary;
    });

    const canvas = document.getElementById('chart-breakdown-equipments');
    const inner = document.getElementById('bar-inner-equipments');
    const canvasHeight = Math.max(240, items.length * 28);
    inner.style.height = canvasHeight + 'px';

    dashboardState.charts.breakdownEquipments = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: items.map(i => i.label),
            datasets: [{
                data: items.map(i => i.value),
                backgroundColor: bgColors,
                borderRadius: 3,
                barThickness: 18
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: {
                    anchor: 'end', align: 'end',
                    font: { size: 10, weight: 'bold' },
                    color: '#333',
                    formatter: v => formatNum(v)
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                y: { grid: { display: false }, ticks: { font: { size: 10 } } }
            },
            onClick: (e, elements) => handleBarClick(e, elements, 'equipment', items),
            onHover: (e, elements) => {
                e.native.target.style.cursor = elements.length ? 'pointer' : 'default';
            }
        }
    });

    canvas.oncontextmenu = (e) => handleBarContextMenu(e, 'equipment', items, 'breakdownEquipments');
    canvas.ondblclick = (e) => handleBarDblClick(e, 'equipment', items, 'breakdownEquipments');
}

// ─── Breakdown Duration Trend (Scatter) ─────────────────

function renderDurationTrendChart(data, site, startDate, endDate, line) {
    destroyChart('durationTrend');
    const ctx = document.getElementById('chart-duration-trend').getContext('2d');

    let bd = filterByAll(data.breakdown, site, startDate, endDate, line);

    const af = dashboardState.activeFilter;
    if (af.type === 'line' && af.value) {
        bd = bd.filter(r => {
            const lineKey = site === 'All' ? `${r._site}_${col(r, 'Line_ID')}` : col(r, 'Line_ID');
            return lineKey === af.value;
        });
    } else if (af.type === 'equipment' && af.value) {
        bd = bd.filter(r => (col(r, 'Equipment_ID') || 'Unknown') === af.value);
    }

    const level = dashboardState.drillLevel;
    const sites = site === 'All' ? [...new Set(bd.map(r => r._site).filter(Boolean))].sort() : [site];

    // Group data by drill level
    function groupKey(date) {
        if (!date) return null;
        const d = parseDate(date);
        if (!d) return null;
        const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
        switch (level) {
            case 'year': return `${y}`;
            case 'quarter': return `Q${Math.floor(m / 3) + 1} ${y}`;
            case 'month': return `${MONTHS_SHORT[m]} ${y}`;
            case 'day': return `${m + 1}/${day}/${y}`;
            default: return `${MONTHS_SHORT[m]} ${y}`;
        }
    }

    const allLabels = [...new Set(bd.map(r => groupKey(r._date)).filter(Boolean))];
    // Sort labels chronologically
    allLabels.sort((a, b) => {
        const da = parseLabelDate(a, level), db = parseLabelDate(b, level);
        return (da || 0) - (db || 0);
    });

    const datasets = sites.map(s => {
        const siteData = bd.filter(r => r._site === s);
        const grouped = {};
        siteData.forEach(r => {
            const k = groupKey(r._date);
            if (k) grouped[k] = (grouped[k] || 0) + num(col(r, 'Breakdown_Duration', 'Total_Breakdown'));
        });
        return {
            label: s,
            data: allLabels.map(l => grouped[l] || 0),
            backgroundColor: (COLORS.sites[s] || COLORS.primary) + '99',
            borderColor: COLORS.sites[s] || COLORS.primary,
            pointRadius: 6,
            pointHoverRadius: 8
        };
    });

    dashboardState.charts.durationTrend = new Chart(ctx, {
        type: 'scatter',
        data: {
            labels: allLabels,
            datasets: datasets.map(ds => ({
                ...ds,
                data: allLabels.map((l, i) => ({ x: i, y: ds.data[i] }))
            }))
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
                datalabels: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ${formatNum(ctx.parsed.y)} min`
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    ticks: {
                        callback: (v) => allLabels[v] || '',
                        maxRotation: 45,
                        font: { size: 10 }
                    },
                    title: { display: true, text: level.charAt(0).toUpperCase() + level.slice(1), font: { size: 11 } }
                },
                y: { beginAtZero: true, title: { display: true, text: 'Minutes', font: { size: 11 } } }
            }
        }
    });
}

function parseLabelDate(label, level) {
    if (!label) return 0;
    switch (level) {
        case 'year': return new Date(parseInt(label), 0, 1).getTime();
        case 'quarter': {
            const parts = label.split(' ');
            const q = parseInt(parts[0].replace('Q', ''));
            const y = parseInt(parts[1]);
            return new Date(y, (q - 1) * 3, 1).getTime();
        }
        case 'month': return parseMonthKey(label)?.getTime() || 0;
        case 'day': return new Date(label).getTime() || 0;
        default: return 0;
    }
}

// ─── Spare Parts Cost Table ─────────────────────────────

function renderSPCostTable(data, site, startDate, endDate) {
    const container = document.getElementById('sp-cost-table-container');
    const spData = filterSPByMonth(data.spareParts, site, startDate, endDate);
    const sites = site === 'All' ? [...new Set(spData.map(r => r._site).filter(Boolean))].sort() : [site];

    let html = '<table class="data-table"><thead><tr><th>Site</th><th>Actual</th><th>Budget</th><th>Variance</th><th>Status</th></tr></thead><tbody>';

    let grandActual = 0, grandBudget = 0;

    sites.forEach(s => {
        const rows = spData.filter(r => r._site === s);
        let actual = 0, budget = 0;
        rows.forEach(r => {
            actual += num(col(r, 'Total', 'SP_Cost'));
            budget += num(col(r, 'Budget_Cost', 'Budget'));
        });
        grandActual += actual;
        grandBudget += budget;
        const variance = budget > 0 ? ((actual - budget) / budget) * 100 : 0;
        const statusCls = variance <= 0 ? 'green' : variance <= 10 ? 'amber' : 'red';

        html += `<tr>
            <td><strong>${s}</strong></td>
            <td>${formatSAR(actual)}</td>
            <td>${formatSAR(budget)}</td>
            <td><span class="variance-text ${statusCls}">▼ ${variance.toFixed(1)}%</span></td>
            <td><span class="status-dot ${statusCls}"></span>${statusCls === 'green' ? 'Within' : statusCls === 'amber' ? 'Slightly Over' : 'Over'}</td>
        </tr>`;
    });

    // Total row
    const totalVar = grandBudget > 0 ? ((grandActual - grandBudget) / grandBudget) * 100 : 0;
    html += `<tr class="total-row">
        <td>Total</td>
        <td>${formatSAR(grandActual)}</td>
        <td>${formatSAR(grandBudget)}</td>
        <td>▼ ${totalVar.toFixed(1)}%</td>
        <td></td>
    </tr>`;

    html += '</tbody></table>';
    container.innerHTML = html;
}

// ─── Spare Parts Cost Trend Chart ───────────────────────

function renderSPCostTrendChart(data, site, startDate, endDate) {
    destroyChart('spCostTrend');
    const ctx = document.getElementById('chart-sp-cost-trend').getContext('2d');

    const spData = filterSPByMonth(data.spareParts, site, startDate, endDate);
    const months = [...new Set(spData.map(r => r._month).filter(Boolean))].sort(monthSort);

    const budgetByMonth = {}, actualByMonth = {};
    months.forEach(m => { budgetByMonth[m] = 0; actualByMonth[m] = 0; });
    spData.forEach(r => {
        if (!r._month) return;
        budgetByMonth[r._month] += num(col(r, 'Budget_Cost', 'Budget'));
        actualByMonth[r._month] += num(col(r, 'Total', 'SP_Cost'));
    });

    const budgetVals = months.map(m => budgetByMonth[m]);
    const actualWithinVals = months.map(m => Math.min(actualByMonth[m], budgetByMonth[m]));
    const actualOverVals = months.map(m => Math.max(0, actualByMonth[m] - budgetByMonth[m]));
    const varianceVals = months.map(m => {
        const b = budgetByMonth[m];
        return b > 0 ? ((actualByMonth[m] - b) / b) * 100 : 0;
    });

    dashboardState.charts.spCostTrend = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [
                {
                    label: 'Budget',
                    data: budgetVals,
                    backgroundColor: COLORS.primary,
                    stack: 'budget',
                    order: 2,
                    datalabels: { display: false }
                },
                {
                    label: 'Actual (Within)',
                    data: actualWithinVals,
                    backgroundColor: COLORS.budgetOk,
                    stack: 'actual',
                    order: 2,
                    datalabels: { display: false }
                },
                {
                    label: 'Actual (Over)',
                    data: actualOverVals,
                    backgroundColor: COLORS.navy,
                    stack: 'actual',
                    order: 2,
                    datalabels: { display: false }
                },
                {
                    label: 'Variance %',
                    data: varianceVals,
                    type: 'line',
                    borderColor: COLORS.budgetOk,
                    backgroundColor: COLORS.budgetOk + '33',
                    pointRadius: 4,
                    borderWidth: 2,
                    yAxisID: 'y1',
                    order: 1,
                    fill: false,
                    datalabels: {
                        display: true,
                        align: 'top',
                        font: { size: 9 },
                        color: COLORS.budgetOk,
                        formatter: v => v.toFixed(0) + '%'
                    }
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                datalabels: {} // individual dataset config
            },
            scales: {
                x: { ticks: { font: { size: 10 }, maxRotation: 45 } },
                y: {
                    position: 'left',
                    title: { display: true, text: 'Cost (SAR)', font: { size: 11 } },
                    ticks: { callback: v => formatSAR(v) }
                },
                y1: {
                    position: 'right',
                    title: { display: true, text: 'Variance %', font: { size: 11 } },
                    ticks: { callback: v => v + '%' },
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}

// ─── Cross-Filtering ────────────────────────────────────

let _clickTimer = null;
function handleBarClick(event, elements, type, items) {
    // Delay single-click to allow double-click detection
    if (_clickTimer) { clearTimeout(_clickTimer); _clickTimer = null; return; }
    _clickTimer = setTimeout(() => {
        _clickTimer = null;
        const af = dashboardState.activeFilter;
        if (!elements || elements.length === 0) {
            if (af.type) {
                dashboardState.activeFilter = { type: null, value: null };
                refreshCrossFilteredCharts();
            }
            return;
        }
        const idx = elements[0].index;
        const clicked = items[idx]?.label;
        if (af.type === type && af.value === clicked) {
            dashboardState.activeFilter = { type: null, value: null };
        } else {
            dashboardState.activeFilter = { type, value: clicked };
        }
        refreshCrossFilteredCharts();
    }, 300);
}

function refreshCrossFilteredCharts() {
    const { rawData, selectedSite, startDate, endDate, selectedLine } = dashboardState;
    renderBreakdownLinesChart(rawData, selectedSite, startDate, endDate, selectedLine);
    renderBreakdownEquipmentsChart(rawData, selectedSite, startDate, endDate, selectedLine);
    renderDurationTrendChart(rawData, selectedSite, startDate, endDate, selectedLine);
    renderDowntimePieChart(rawData, selectedSite, startDate, endDate, selectedLine);
}

// ─── Drill-Through (Context Menu + Modal) ───────────────

function handleBarDblClick(event, type, items, chartName) {
    const chart = dashboardState.charts[chartName];
    if (!chart) return;
    const points = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
    if (!points || points.length === 0) return;
    const idx = points[0].index;
    const clicked = items[idx]?.label;
    if (!clicked) return;
    dashboardState.contextTarget = { type, value: clicked };
    openDrillThroughModal();
}

function handleBarContextMenu(event, type, items, chartName) {
    event.preventDefault();
    const chart = dashboardState.charts[chartName];
    if (!chart) return;

    const points = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
    if (!points || points.length === 0) return;

    const idx = points[0].index;
    const clicked = items[idx]?.label;
    if (!clicked) return;

    dashboardState.contextTarget = { type, value: clicked };

    const menu = document.getElementById('context-menu');
    menu.classList.remove('hidden');
    menu.style.left = event.pageX + 'px';
    menu.style.top = event.pageY + 'px';
}

function openDrillThroughModal() {
    const target = dashboardState.contextTarget;
    if (!target) return;

    const { rawData, selectedSite, startDate, endDate, selectedLine } = dashboardState;
    let bd = filterByAll(rawData.breakdown, selectedSite, startDate, endDate, selectedLine);

    let title = 'Breakdown Detail';
    if (target.type === 'line') {
        title = `Breakdown Detail \u2014 Line: ${target.value}`;
        bd = bd.filter(r => {
            const lineKey = selectedSite === 'All' ? `${r._site}_${col(r, 'Line_ID')}` : col(r, 'Line_ID');
            return lineKey === target.value;
        });
    } else if (target.type === 'equipment') {
        title = `Breakdown Detail — Equipment: ${target.value}`;
        bd = bd.filter(r => (col(r, 'Equipment_ID') || 'Unknown') === target.value);
    }

    document.getElementById('modal-title').textContent = title;

    // Build table
    let totalMin = 0;
    let html = '<table class="data-table"><thead><tr><th>Date</th><th>Site</th><th>Line</th><th>Equipment</th><th>Duration (min)</th><th>Maint. Issue</th><th>Reason</th><th>Corrective Action</th><th>Preventive Action</th></tr></thead><tbody>';
    bd.forEach(r => {
        const dur = num(col(r, 'Breakdown_Duration', 'Total_Breakdown'));
        totalMin += dur;
        const d = r._date;
        const dateStr = d ? `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}` : '';
        const maintIssue = col(r, 'Maintenance_Issue', 'Maintenance Issue') || '';
        html += `<tr>
            <td>${dateStr}</td>
            <td>${r._site || ''}</td>
            <td>${col(r, 'Line_ID') || ''}</td>
            <td>${col(r, 'Equipment_ID') || ''}</td>
            <td class="cell-number">${formatNum(dur)}</td>
            <td>${maintIssue}</td>
            <td>${col(r, 'Breakdown_Reason') || ''}</td>
            <td>${col(r, 'Corrective_Action') || ''}</td>
            <td>${col(r, 'Preventive_Action') || ''}</td>
        </tr>`;
    });
    html += `<tr class="total-row"><td colspan="4">Total</td><td class="cell-number">${formatNum(totalMin)}</td><td colspan="4"></td></tr>`;
    html += '</tbody></table>';

    document.getElementById('modal-table-container').innerHTML = html;
    document.getElementById('breakdown-detail-modal').classList.remove('hidden');
}

// ─── Date Hierarchy Drill ───────────────────────────────

const DRILL_LEVELS = ['year', 'quarter', 'month', 'day'];

function drillUp() {
    const idx = DRILL_LEVELS.indexOf(dashboardState.drillLevel);
    if (idx > 0) {
        dashboardState.drillLevel = DRILL_LEVELS[idx - 1];
        const { rawData, selectedSite, startDate, endDate, selectedLine } = dashboardState;
        renderDurationTrendChart(rawData, selectedSite, startDate, endDate, selectedLine);
    }
}

function drillDown() {
    const idx = DRILL_LEVELS.indexOf(dashboardState.drillLevel);
    if (idx < DRILL_LEVELS.length - 1) {
        dashboardState.drillLevel = DRILL_LEVELS[idx + 1];
        const { rawData, selectedSite, startDate, endDate, selectedLine } = dashboardState;
        renderDurationTrendChart(rawData, selectedSite, startDate, endDate, selectedLine);
    }
}

// ─── Full Render ────────────────────────────────────────

function renderAll() {
    const data = dashboardState.rawData;
    const site = dashboardState.selectedSite;
    const sd = dashboardState.startDate;
    const ed = dashboardState.endDate;
    const line = dashboardState.selectedLine;

    // Clear cross-filter on full re-render
    dashboardState.activeFilter = { type: null, value: null };
    dashboardState.drillLevel = 'month';

    destroyAllCharts();
    renderKPIs(data, site, sd, ed, line);
    renderLineAvailabilityChart(data, site, sd, ed, line);
    renderDowntimePieChart(data, site, sd, ed, line);
    renderRCATable(data, site, sd, ed);
    renderBreakdownLinesChart(data, site, sd, ed, line);
    renderDurationTrendChart(data, site, sd, ed, line);
    renderSPCostTable(data, site, sd, ed);
    renderBreakdownEquipmentsChart(data, site, sd, ed, line);
    renderSPCostTrendChart(data, site, sd, ed);
}

// ─── Event Listeners ────────────────────────────────────

function setupEventListeners() {
    // Plant filter — also update line filter cascade
    document.getElementById('plant-filter').addEventListener('change', (e) => {
        dashboardState.selectedSite = e.target.value;
        populateLineFilter(dashboardState.rawData, e.target.value);
        renderAll();
    });

    // Line filter — multi-select dropdown toggle
    const lineDisplay = document.getElementById('line-display');
    const lineDropdown = document.getElementById('line-dropdown');
    lineDisplay.addEventListener('click', (e) => {
        e.stopPropagation();
        lineDropdown.classList.toggle('hidden');
    });
    lineDropdown.addEventListener('change', (e) => {
        const cb = e.target;
        if (cb.value === 'All' && cb.checked) {
            // "All" checked: uncheck others
            lineDropdown.querySelectorAll('input[type="checkbox"]').forEach(c => { if (c.value !== 'All') c.checked = false; });
        } else if (cb.value !== 'All') {
            // Individual line toggled: uncheck "All"
            lineDropdown.querySelector('input[value="All"]').checked = false;
            // If nothing selected, re-check "All"
            const anyChecked = [...lineDropdown.querySelectorAll('input[type="checkbox"]')].some(c => c.checked && c.value !== 'All');
            if (!anyChecked) lineDropdown.querySelector('input[value="All"]').checked = true;
        }
        dashboardState.selectedLine = getSelectedLines();
        updateLineDisplay();
        renderAll();
    });
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!document.getElementById('line-filter').contains(e.target)) {
            lineDropdown.classList.add('hidden');
        }
    });

    // Date range filters
    const startInput = document.getElementById('start-date');
    const endInput = document.getElementById('end-date');
    startInput.addEventListener('change', (e) => {
        dashboardState.startDate = e.target.value ? new Date(e.target.value + 'T00:00:00') : null;
        endInput.min = e.target.value || '';
        renderAll();
    });
    endInput.addEventListener('change', (e) => {
        dashboardState.endDate = e.target.value ? new Date(e.target.value + 'T23:59:59') : null;
        startInput.max = e.target.value || '';
        renderAll();
    });

    // Toggle buttons (Top N)
    document.querySelectorAll('.toggle-buttons').forEach(group => {
        group.addEventListener('click', (e) => {
            const btn = e.target.closest('.toggle-btn');
            if (!btn) return;
            group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const val = btn.dataset.value;
            const target = group.id;
            const { rawData, selectedSite, startDate, endDate, selectedLine } = dashboardState;
            if (target === 'toggle-breakdown-lines') {
                dashboardState.topN.breakdownLines = val;
                renderBreakdownLinesChart(rawData, selectedSite, startDate, endDate, selectedLine);
            } else if (target === 'toggle-breakdown-equipments') {
                dashboardState.topN.breakdownEquipments = val;
                renderBreakdownEquipmentsChart(rawData, selectedSite, startDate, endDate, selectedLine);
            }
        });
    });

    // Drill buttons
    document.getElementById('drill-up').addEventListener('click', drillUp);
    document.getElementById('drill-down').addEventListener('click', drillDown);

    // Context menu
    document.getElementById('drill-through-option').addEventListener('click', () => {
        document.getElementById('context-menu').classList.add('hidden');
        openDrillThroughModal();
    });

    // Close context menu on click outside
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('context-menu');
        if (!menu.contains(e.target)) {
            menu.classList.add('hidden');
        }
    });

    // Modal back button
    document.getElementById('modal-back-btn').addEventListener('click', () => {
        document.getElementById('breakdown-detail-modal').classList.add('hidden');
    });

    // Close modal on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.getElementById('breakdown-detail-modal').classList.add('hidden');
            document.getElementById('context-menu').classList.add('hidden');
        }
    });

    // Refresh button — bump cache and hard reload
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            refreshBtn.classList.add('spinning');
            const url = new URL(window.location.href);
            url.searchParams.set('_cb', Date.now());
            window.location.href = url.toString();
        });
    }
}

// ─── Logo Background Removal ────────────────────────────
function processLogo() {
    const img = document.querySelector('.logo-img');
    if (!img) return;
    const apply = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imageData.data;
        for (let i = 0; i < d.length; i += 4) {
            const brightness = (d[i] + d[i + 1] + d[i + 2]) / 3;
            if (brightness < 120) {
                // Dark pixel → make transparent
                d[i + 3] = 0;
            } else {
                // Light pixel → make fully white and opaque
                d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
                d[i + 3] = Math.min(255, (brightness - 120) * 2);
            }
        }
        ctx.putImageData(imageData, 0, 0);
        img.src = canvas.toDataURL('image/png');
    };
    if (img.complete && img.naturalWidth > 0) apply();
    else img.onload = apply;
}

// ─── Initialize ─────────────────────────────────────────

async function init() {
    try {
        processLogo();
        const data = await loadData();
        dashboardState.rawData = data;

        // Set up filters
        setDateInputDefaults(data);
        populateLineFilter(data, 'All');

        // Update date
        const latestDate = getMostRecentDate(data);
        if (latestDate) {
            document.getElementById('data-updated').textContent =
                `Data updated: ${latestDate.getMonth() + 1}/${latestDate.getDate()}/${latestDate.getFullYear()}`;
        }

        setupEventListeners();

        // Hide loading, show content
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('dashboard-content').classList.remove('hidden');

        renderAll();
    } catch (err) {
        console.error('Failed to load dashboard:', err);
        document.getElementById('loading').innerHTML =
            `<p style="color:#E74C3C">Failed to load data. Make sure "ARASCO Dashboard Data.xlsx" is in the same folder.<br><small>${err.message}</small></p>`;
    }
}

init();
