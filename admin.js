/**
 * admin.js — ARASCO Dashboard Admin Page
 * Spreadsheet-style data management with AG Grid
 */

// ─── Column Definitions ─────────────────────────────────

const SITES = ['KFM', 'DFM', 'ARCHEM'];

const TABLE_COLUMNS = {
    "line-performance": [
        { field: "id", headerName: "ID", width: 70, editable: false, pinned: 'left' },
        { field: "date", headerName: "Date", width: 130, editable: true,
          cellEditor: 'agTextCellEditor' },
        { field: "site_id", headerName: "Site", width: 110, editable: true,
          cellEditor: 'agSelectCellEditor',
          cellEditorParams: { values: SITES } },
        { field: "line_id", headerName: "Line", width: 120, editable: true },
        { field: "running_time", headerName: "Running Time (min)", width: 160,
          editable: true, type: 'numericColumn',
          valueParser: p => p.newValue === '' ? 0 : Number(p.newValue) },
        { field: "downtime_electrical", headerName: "DT Electrical (min)", width: 160,
          editable: true, type: 'numericColumn',
          valueParser: p => p.newValue === '' ? 0 : Number(p.newValue) },
        { field: "downtime_mechanical", headerName: "DT Mechanical (min)", width: 160,
          editable: true, type: 'numericColumn',
          valueParser: p => p.newValue === '' ? 0 : Number(p.newValue) },
        { field: "downtime_utilities", headerName: "DT Utilities (min)", width: 160,
          editable: true, type: 'numericColumn',
          valueParser: p => p.newValue === '' ? 0 : Number(p.newValue) },
    ],
    "breakdown": [
        { field: "id", headerName: "ID", width: 70, editable: false, pinned: 'left' },
        { field: "date", headerName: "Date", width: 130, editable: true },
        { field: "site_id", headerName: "Site", width: 110, editable: true,
          cellEditor: 'agSelectCellEditor',
          cellEditorParams: { values: SITES } },
        { field: "line_id", headerName: "Line", width: 120, editable: true },
        { field: "equipment_id", headerName: "Equipment", width: 140, editable: true },
        { field: "breakdown_duration", headerName: "Duration (min)", width: 130,
          editable: true, type: 'numericColumn',
          valueParser: p => p.newValue === '' ? 0 : Number(p.newValue) },
        { field: "breakdown_reason", headerName: "Reason", width: 220, editable: true },
        { field: "corrective_action", headerName: "Corrective Action", width: 220, editable: true },
        { field: "preventive_action", headerName: "Preventive Action", width: 220, editable: true },
        { field: "maintenance_issue", headerName: "Maint. Issue", width: 110, editable: true,
          cellEditor: 'agSelectCellEditor',
          cellEditorParams: { values: ['Y', 'N'] } },
        { field: "type", headerName: "Type", width: 120, editable: true },
    ],
    "spare-parts": [
        { field: "id", headerName: "ID", width: 70, editable: false, pinned: 'left' },
        { field: "date", headerName: "Month (YYYY-MM-DD)", width: 170, editable: true },
        { field: "site_id", headerName: "Site", width: 110, editable: true,
          cellEditor: 'agSelectCellEditor',
          cellEditorParams: { values: SITES } },
        { field: "budget_cost", headerName: "Budget Cost (SAR)", width: 160,
          editable: true, type: 'numericColumn',
          valueParser: p => p.newValue === '' ? 0 : Number(p.newValue),
          valueFormatter: p => p.value != null ? Number(p.value).toLocaleString() : '' },
        { field: "sp_cost", headerName: "Actual Cost (SAR)", width: 160,
          editable: true, type: 'numericColumn',
          valueParser: p => p.newValue === '' ? 0 : Number(p.newValue),
          valueFormatter: p => p.value != null ? Number(p.value).toLocaleString() : '' },
    ],
    "site-maintenance": [
        { field: "id", headerName: "ID", width: 70, editable: false, pinned: 'left' },
        { field: "date", headerName: "Month (YYYY-MM-DD)", width: 170, editable: true },
        { field: "site_id", headerName: "Site", width: 110, editable: true,
          cellEditor: 'agSelectCellEditor',
          cellEditorParams: { values: SITES } },
        { field: "pm_scheduled", headerName: "PM Scheduled", width: 140,
          editable: true, type: 'numericColumn',
          valueParser: p => p.newValue === '' ? 0 : Number(p.newValue) },
        { field: "pm_completed", headerName: "PM Completed", width: 140,
          editable: true, type: 'numericColumn',
          valueParser: p => p.newValue === '' ? 0 : Number(p.newValue) },
        { field: "corrective_tasks", headerName: "Corrective Tasks", width: 140,
          editable: true, type: 'numericColumn',
          valueParser: p => p.newValue === '' ? 0 : Number(p.newValue) },
    ],
    "rca": [
        { field: "id", headerName: "ID", width: 70, editable: false, pinned: 'left' },
        { field: "incident_date", headerName: "Incident Date", width: 140, editable: true },
        { field: "site_id", headerName: "Site", width: 110, editable: true,
          cellEditor: 'agSelectCellEditor',
          cellEditorParams: { values: SITES } },
        { field: "incident_id", headerName: "Incident ID", width: 140, editable: true },
        { field: "completed", headerName: "Status", width: 120, editable: true,
          cellEditor: 'agSelectCellEditor',
          cellEditorParams: { values: ['done', 'y', 'yes', 'plan', 'pending', ''] } },
    ],
};

// ─── State ──────────────────────────────────────────────

let gridApi = null;
let currentTable = 'line-performance';
let pendingChanges = [];
let statusTimer = null;

// ─── Grid Functions ─────────────────────────────────────

async function loadTable(tableName) {
    currentTable = tableName;
    pendingChanges = [];
    updateSaveButton();

    showLoading('Loading data...');

    try {
        const resp = await fetch(`/api/${tableName}`);
        if (!resp.ok) throw new Error(`API error: ${resp.status}`);
        const result = await resp.json();

        const container = document.getElementById('grid-container');

        // Destroy existing grid
        if (gridApi) {
            gridApi.destroy();
            gridApi = null;
        }

        const gridOptions = {
            columnDefs: TABLE_COLUMNS[tableName],
            rowData: result.data,
            defaultColDef: {
                sortable: true,
                filter: true,
                resizable: true,
                minWidth: 60,
            },
            rowSelection: { mode: 'multiRow', checkboxes: true },
            undoRedoCellEditing: true,
            undoRedoCellEditingLimit: 50,
            animateRows: true,
            enableCellTextSelection: true,
            onCellValueChanged: (event) => {
                if (event.oldValue !== event.newValue) {
                    pendingChanges.push({
                        id: event.data.id,
                        field: event.colDef.field,
                        value: event.newValue
                    });
                    updateSaveButton();
                }
            },
            getRowId: (params) => String(params.data.id),
        };

        gridApi = agGrid.createGrid(container, gridOptions);
        document.getElementById('row-count').textContent = `${result.total} rows`;

        // Update active tab
        document.querySelectorAll('.tab').forEach(t => {
            t.classList.toggle('active', t.dataset.table === tableName);
        });

    } catch (err) {
        showStatus('Failed to load: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
}


async function saveChanges() {
    if (pendingChanges.length === 0) return;

    showLoading('Saving...');
    try {
        const resp = await fetch(`/api/${currentTable}/bulk-update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pendingChanges)
        });
        if (!resp.ok) throw new Error(`Save failed: ${resp.status}`);
        const result = await resp.json();
        pendingChanges = [];
        updateSaveButton();
        showStatus(`Saved ${result.updated} change(s)`, 'success');
    } catch (err) {
        showStatus('Save failed: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
}


async function addRow() {
    showLoading('Adding row...');
    try {
        const defaults = { site_id: 'KFM' };
        const resp = await fetch(`/api/${currentTable}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(defaults)
        });
        if (!resp.ok) throw new Error(`Add failed: ${resp.status}`);
        const result = await resp.json();
        // Reload grid to show new row
        await loadTable(currentTable);
        showStatus(`Row #${result.ids[0]} added`, 'success');
        // Scroll to bottom
        if (gridApi) {
            const lastRow = gridApi.getDisplayedRowCount() - 1;
            gridApi.ensureIndexVisible(lastRow, 'bottom');
        }
    } catch (err) {
        showStatus('Add failed: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
}


async function deleteSelected() {
    if (!gridApi) return;
    const selected = gridApi.getSelectedRows();
    if (selected.length === 0) {
        showStatus('No rows selected', 'info');
        return;
    }
    if (!confirm(`Delete ${selected.length} row(s)? This cannot be undone.`)) return;

    showLoading('Deleting...');
    try {
        const ids = selected.map(r => r.id);
        const resp = await fetch(`/api/${currentTable}/bulk-delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ids)
        });
        if (!resp.ok) throw new Error(`Delete failed: ${resp.status}`);
        const result = await resp.json();
        await loadTable(currentTable);
        showStatus(`Deleted ${result.deleted} row(s)`, 'success');
    } catch (err) {
        showStatus('Delete failed: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
}


async function uploadExcel() {
    const fileInput = document.getElementById('excel-file');
    const file = fileInput.files[0];
    if (!file) return;

    const mode = document.getElementById('upload-mode').value;
    if (mode === 'replace' && !confirm('This will REPLACE ALL existing data with the Excel file. Continue?')) {
        fileInput.value = '';
        return;
    }

    showLoading('Uploading and importing...');
    try {
        const formData = new FormData();
        formData.append('file', file);

        const resp = await fetch(`/api/upload-excel?mode=${mode}`, {
            method: 'POST',
            body: formData
        });
        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.detail || 'Upload failed');
        }
        showStatus('Upload successful! Reloading...', 'success');
        await loadTable(currentTable);
    } catch (err) {
        showStatus('Upload failed: ' + err.message, 'error');
    } finally {
        fileInput.value = '';
        hideLoading();
    }
}


// ─── UI Helpers ─────────────────────────────────────────

function updateSaveButton() {
    const btn = document.getElementById('btn-save');
    if (pendingChanges.length > 0) {
        btn.classList.add('has-changes');
        btn.innerHTML = `<i class="fas fa-save"></i> Save (${pendingChanges.length})`;
    } else {
        btn.classList.remove('has-changes');
        btn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
    }
}

function showStatus(msg, type) {
    const el = document.getElementById('status-msg');
    el.textContent = msg;
    el.className = 'status-msg ' + (type || '');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { el.textContent = ''; }, 5000);
}

function showLoading(text) {
    document.getElementById('loading-text').textContent = text || 'Loading...';
    document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}


// ─── Logo Background Removal (same as dashboard) ────────
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
                d[i + 3] = 0;
            } else {
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

// ─── Event Listeners ────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    processLogo();
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (pendingChanges.length > 0) {
                if (!confirm('You have unsaved changes. Discard and switch tables?')) return;
            }
            loadTable(tab.dataset.table);
        });
    });

    // Toolbar buttons
    document.getElementById('btn-add-row').addEventListener('click', addRow);
    document.getElementById('btn-delete-selected').addEventListener('click', deleteSelected);
    document.getElementById('btn-save').addEventListener('click', saveChanges);

    // Excel upload
    document.getElementById('btn-upload').addEventListener('click', () => {
        document.getElementById('excel-file').click();
    });
    document.getElementById('excel-file').addEventListener('change', uploadExcel);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveChanges();
        }
    });

    // Warn before leaving with unsaved changes
    window.addEventListener('beforeunload', (e) => {
        if (pendingChanges.length > 0) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // Load initial table
    loadTable('line-performance');
});
