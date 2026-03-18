# ARASCO Feed Maintenance Dashboard — Web Replacement

## Project Brief

Build a single-page web dashboard to replace the ARASCO Feed Maintenance Power BI dashboard. The website should read data from a local Excel file (`ARASCO Dashboard Data.xlsx`) and refresh data on page reload. Use a single page with a **Plant/Site filter dropdown** instead of multiple pages.

---

## 1. TECH STACK

- **HTML/CSS/JavaScript** (single `index.html` or with separate CSS/JS files)
- **Chart.js** (for all charts) — load via CDN
- **Chart.js Datalabels Plugin** — load via CDN (for showing values on bars)
- **SheetJS (xlsx)** — load via CDN to parse the Excel file at runtime
- No backend required. The Excel file sits alongside the HTML. On page load, fetch and parse the `.xlsx` file client-side using SheetJS.

---

## 2. DATA SOURCE — `ARASCO Dashboard Data.xlsx`

The workbook contains these sheets (all used):

| Sheet | Columns | Purpose |
|---|---|---|
| **Line_Performance** | `Date`, `Site_ID`, `Line_ID`, `Running_Time (min)`, `Downtime_Electrical (min)`, `Downtime_Mechanical (min)`, `Downtime_Utilities (min)` | Line availability and downtime calculations |
| **Breakdown** | `Date`, `Site_ID`, `Line_ID`, `Equipment_ID`, `Total_Breakdown_Minutes`, `Breakdown_Reason`, `Corrective_Action`, `Type` (Electrical/Mechanical/Utilities) | Breakdown lines, equipment breakdown, duration trends, drill-through detail |
| **Project_Tracking** | *(read dynamically)* | Corrective tasks tracking |
| **Spare_Parts_Cost** | `MMM/YY`, `Site_ID`, `Budget_Cost`, `SP_Cost`, `R&M_Cost`, `Consumables`, `Building_Cost`, `Total (261/262/202/202)`, `Actual vs Budget` | Spare parts cost KPI, table, trend |
| **Site_Maintenance** | *(read dynamically)* | PM Completion Rate |
| **RCA** | *(read dynamically — expect columns like `Site_ID`, `Status` with values Incidents/Actions/Done/Pending/Plan, etc.)* | RCA status table |
| **Details** | *(supplementary)* | Additional detail data |

**Important:**
- Read all sheet headers dynamically. If column names differ slightly, match by closest name. Parse dates properly.
- Aggregate data by month (`MMM YYYY`) for trend charts and by the most recent month for KPI cards.
- Handle both `M/D/YYYY` date formats and Excel serial date numbers.
- The `MMM/YY` column in `Spare_Parts_Cost` should be parsed as a month-year value (e.g., "Jan-26" = January 2026).

---

## 3. LAYOUT AND STRUCTURE

```
+-----------------------------------------------------------------------------------+
| [Sidebar]  |  ARASCO Maintenance Monitor              [Plant Filter] [Month Filter] |
|  Dark navy |-----------------------------------------------------------------------|
|  + green   | KPI ROW: [Line Avail %] [SP Cost] [PM Rate] [Corrective Tasks]       |
|  stripe    |-----------------------------------------------------------------------|
|  Icons     | ROW 2: [Line Availability Chart] [Downtime Pie] [RCA Status Table]   |
|            |-----------------------------------------------------------------------|
|  Logo      | ROW 3: [Breakdown Lines Bar] [Duration Trend] [SP Cost Table]        |
|  (upload)  |-----------------------------------------------------------------------|
|            | ROW 4: [Breakdown Equipments Bar] [SP Cost Trend Stacked Bar]        |
+-----------------------------------------------------------------------------------+
```

---

## 4. COLOR SCHEME (match exactly)

| Element | Color |
|---|---|
| Left sidebar background | `#0D2137` (very dark navy) |
| Sidebar green accent stripe (left edge) | `#2ECC40` (bright green, ~6px wide strip on the far left of the sidebar) |
| Page background | `#F0F0F0` (light gray) |
| Card backgrounds | `#FFFFFF` |
| Card border/shadow | Subtle `rgba(0,0,0,0.08)` shadow |
| Title "ARASCO Maintenance Monitor" | `#0D2137` (dark navy), bold, top-right area |
| Active filter/tab highlight text | `#E8771E` (orange) |
| Non-active tab text | `#555555` (gray) |
| Chart bars (primary) | `#2E6DA4` (medium blue) |
| Chart bars (highlight/top item) | `#1A73E8` (brighter blue) |
| Table header row background | `#1B4F72` (dark teal-navy) |
| Table header text | `#FFFFFF` |
| KPI big number | `#0D2137` (dark navy) |
| Line Availability percentage (large) | `#1D8348` (dark green) when >=95%, `#E74C3C` (red) when <95% |
| Target line (95%) | Green dashed line `#2ECC40` |
| Pie chart — Electrical | `#2E6DA4` (blue) |
| Pie chart — Mechanical | `#1B4F72` (dark navy) |
| Pie chart — Utilities | `#2ECC40` (green) |
| Budget status: Within Budget (<=0%) | Green dot `#2ECC40` |
| Budget status: Slightly Over (<=10%) | Amber dot `#F5A623` |
| Budget status: Over Budget (>10%) | Red dot `#E74C3C` |
| RCA "Done" cell highlight | `#2ECC40` (green background) |
| RCA "Plan" cell highlight | `#2E6DA4` (blue background) |
| SP Cost Trend — Budget bar | `#2E6DA4` (blue) |
| SP Cost Trend — Actual (within budget) | `#2ECC40` (green) |
| SP Cost Trend — Actual (over budget) | `#0D2137` (dark navy) |
| SP Cost Trend — Variance line | `#2ECC40` (green line overlay) |

---

## 5. FILTER BEHAVIOR

- **Single dropdown** at top-right labeled **"Plant"** with options: `All (Overall)`, `KFM`, `DFM`, `ARCHEM`
- Default selection: `All (Overall)`
- When a specific plant is selected, ALL charts, KPIs, and tables filter to that `Site_ID`
- When `All` is selected, aggregate data across all 3 plants
- Add a **Month/Date range** filter as a secondary dropdown showing available months in `MMM YYYY` format, defaulting to the most recent month

---

## 6. DASHBOARD COMPONENTS (detailed specs)

### 6a. KPI Cards Row (top row — 4 cards side by side)

1. **Line Availability %**
   - Calculation: `SUM(Running_Time) / (SUM(Running_Time) + SUM(Downtime_Electrical) + SUM(Downtime_Mechanical) + SUM(Downtime_Utilities)) x 100`
   - Display as large percentage (e.g., "99.13%") in green if >=95%, red if <95%
   - Small text below: "Target: 95%"
   - Show for filtered site(s) and selected month

2. **Spare Parts Cost**
   - From `Spare_Parts_Cost` sheet, show the `Total` column value for the selected month and site
   - Subtitle: "Site-level | [Month Year]"
   - Below: "down-arrow [Budget] vs Budget" (show budget amount with down arrow)

3. **PM Completion Rate**
   - From `Site_Maintenance` sheet
   - Display as percentage or "(Blank)" if no data

4. **Corrective Tasks**
   - From `Project_Tracking` sheet
   - Display count or "(Blank)" if no data

### 6b. Line Availability Chart

- **Type:** Line chart
- **X-axis:** Months
- **Y-axis:** Percentage (95%-100% range ideally)
- **Lines:** One line per site (DFM, KFM — use different markers/colors). When a single plant is filtered, show just that one line.
- **Reference line:** Horizontal green dashed line at 95% (target)
- Data point labels showing percentage value

### 6c. Downtime by Type

- **Type:** Pie/Donut chart
- **Segments:** Electrical (blue #2E6DA4), Mechanical (dark navy #1B4F72), Utilities (green #2ECC40)
- **Labels:** Show count and percentage (e.g., "33 (48.53%)")
- **Legend:** Below the chart with colored dots

### 6d. RCA Status Table

- **Type:** Table
- **Columns:** `RCA`, then one column per Site (`DFM`, `KFM`, etc.), then `Total`
- **Rows:** Incidents, Actions, Done, Pending, Plan
- **Cell highlighting:** "Done" count cells with green background, "Plan" count cells with blue background
- When a single plant is selected, show only that plant's column plus Total

### 6e. Spare Parts Cost Table

- **Type:** Table with colored status indicators
- **Columns:** Site | Actual | Budget | Variance | Status
- **Status column:** Green dot if within budget (<=0%), amber dot if slightly over (<=10%), red dot if over budget (>10%)
- **Variance column:** Show percentage with down-arrow icon, colored to match status
- **Header:** Dark teal-navy background with white text

### 6f. All Breakdown Lines

- **Type:** Horizontal bar chart
- **Data:** From `Breakdown` sheet, aggregate `Total_Breakdown_Minutes` by `Line_ID` (prefixed with Site_ID on Overall view, e.g., "DFM_PPR5")
- **Sort:** Descending by duration
- **Toggle buttons:** `All` | `Top 5` | `Top 10` (pill-shaped buttons, dark background when active)
- Show value labels at end of each bar
- **Supports cross-filtering and drill-through** (see Section 12)

### 6g. Breakdown Duration Trend (Minutes)

- **Type:** Scatter/Bubble chart
- **X-axis:** Months (supports date hierarchy drill — see Section 12c)
- **Y-axis:** Total breakdown duration in minutes
- **Points:** Color-coded by site (ARCHEM, DFM, KFM)
- **Legend:** Colored dots with site names

### 6h. Spare Parts Cost Trend

- **Type:** Stacked bar chart with line overlay
- **X-axis:** Months
- **Bars:** Budget (blue), Actual Within Budget (green), Actual Over Budget (dark navy)
- **Line overlay:** Variance line (green)
- **Y-axis (left):** Cost amount
- **Y-axis (right):** Variance scale

### 6i. All Breakdown Equipments

- **Type:** Horizontal bar chart
- **Data:** From `Breakdown` sheet, aggregate by `Equipment_ID`
- **Sort:** Descending by duration
- **Toggle:** `All` | `Top 5` | `Top 10` (same pill button style)
- **Special:** The top item (e.g., "Waiting for material") should be highlighted with brighter blue and show value at end
- Show value labels at end of each bar
- **Supports cross-filtering and drill-through** (see Section 12)

---

## 7. LEFT SIDEBAR

- Fixed width (~80px)
- Background: `#0D2137` (dark navy)
- Far-left edge: 6px bright green strip (`#2ECC40`)
- Contains 3-4 white icon placeholders vertically centered (use Font Awesome or simple SVG icons for: settings/filter, clipboard/list, tools/wrench)
- Bottom: ARASCO logo area (uploadable — see Section 11)
- The sidebar should have subtle rounded corners on the right side

---

## 8. RESPONSIVE AND INTERACTIVITY

- Dashboard should be responsive but optimized for **1920x1080** desktop view
- Cards use CSS Grid or Flexbox with proper gaps
- Charts resize with their containers
- Hover tooltips on all charts (Chart.js defaults)
- The Top N toggle buttons (All/Top 5/Top 10) should actually filter the bars shown
- Filter dropdown changes should instantly re-render all components
- Add a "Data updated: MM/DD/YY" text in the top header area, derived from the most recent date in the data

---

## 9. DATA LOADING

```javascript
// Pseudocode for data loading
async function loadData() {
    const response = await fetch('ARASCO Dashboard Data.xlsx');
    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

    const linePerformance = XLSX.utils.sheet_to_json(workbook.Sheets['Line_Performance']);
    const breakdown = XLSX.utils.sheet_to_json(workbook.Sheets['Breakdown']);
    const spareParts = XLSX.utils.sheet_to_json(workbook.Sheets['Spare_Parts_Cost']);
    const siteMaintenance = XLSX.utils.sheet_to_json(workbook.Sheets['Site_Maintenance']);
    const rca = XLSX.utils.sheet_to_json(workbook.Sheets['RCA']);
    const projectTracking = XLSX.utils.sheet_to_json(workbook.Sheets['Project_Tracking']);
    const details = XLSX.utils.sheet_to_json(workbook.Sheets['Details']);

    return { linePerformance, breakdown, spareParts, siteMaintenance, rca, projectTracking, details };
}
```

- On page load, call `loadData()` then render all components
- On filter change, re-filter the already-loaded data and re-render charts
- Data refreshes on browser refresh (re-fetches the Excel file)

---

## 10. FILE STRUCTURE

```
/arasco-dashboard/
  ├── index.html                      (main page)
  ├── styles.css                      (all styling)
  ├── app.js                          (data loading, filtering, chart rendering)
  └── ARASCO Dashboard Data.xlsx      (data file — user places here)
```

---

## 11. ARASCO LOGO UPLOAD

Add a **logo upload** feature so the user can supply their own ARASCO logo:

- On first load (or if no logo is found), show a **placeholder** in the sidebar: a white circle/gear icon with the text "أراسكو" and "ARASCO" beneath it (styled in white on the dark navy background).
- At the bottom of the sidebar, include a small **camera/upload icon** overlay on the logo area. When clicked, it opens a file picker (`<input type="file" accept="image/*">`).
- When the user selects an image, store it in **`localStorage`** as a Base64 data URL.
- On every page load, check `localStorage` for the saved logo. If found, render it in the sidebar in place of the placeholder.
- The logo should display as a **circular/rounded image, ~80px wide**, centered in the sidebar, near the bottom.
- Add a small "X" button (visible on hover) on the logo to allow the user to remove the uploaded logo and revert to the placeholder.

```javascript
// Pseudocode for logo handling
function initLogo() {
    const savedLogo = localStorage.getItem('arasco_logo');
    if (savedLogo) {
        logoImg.src = savedLogo;
    } else {
        showPlaceholderLogo();
    }
}

logoUploadInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = () => {
        localStorage.setItem('arasco_logo', reader.result);
        logoImg.src = reader.result;
    };
    reader.readAsDataURL(file);
});
```

---

## 12. DRILL-DOWN AND CROSS-FILTERING FOR BREAKDOWN SECTIONS

### 12a. Cross-Filtering (Click-to-Filter)

When the user **clicks a bar** in either the "All Breakdown Lines" or "All Breakdown Equipments" chart:

- **Highlight** the clicked bar (full opacity) and **dim** all other bars (reduce to ~30% opacity).
- **Cross-filter** the other related charts on the dashboard:
  - Clicking a bar in **Breakdown Lines** (e.g., "DFM_PPR5") should filter:
    - **Breakdown Duration Trend** — show only duration data for that specific line
    - **All Breakdown Equipments** — show only equipments involved in breakdowns on that line
    - **Downtime by Type** pie chart — update to reflect only that line's downtime split
  - Clicking a bar in **Breakdown Equipments** (e.g., "Waiting for material") should filter:
    - **All Breakdown Lines** — show only lines where that equipment had breakdowns
    - **Breakdown Duration Trend** — show only duration for that equipment
- **Clicking the same bar again** (or clicking empty space) **deselects** and restores all charts to their unfiltered state.
- Apply a subtle **transition animation** (~200ms) when filtering/unfiltering.

### 12b. Drill-Through to Breakdown Detail Table

When the user **right-clicks** (or double-clicks for mobile-friendliness) on any bar in **"All Breakdown Lines"** or **"All Breakdown Equipments"**:

- Show a **small custom context menu** (not browser default) with a single option: **"Drill through -> Breakdown Table"** — styled with a white background, subtle shadow, and a drill icon.
- Prevent the browser's default right-click menu on chart canvases using `e.preventDefault()`.
- On selecting the drill-through option, open a **Breakdown Detail Table** modal/overlay page.
- The modal should have:
  - The same dark navy sidebar with the ARASCO logo and a **back-arrow button** (white circle with left arrow) to return to the main dashboard.
  - A data table with these columns (styled with dark navy `#1B4F72` header row, white header text):
    - Date | Site_ID | Line_ID | Equipment_ID | Total_Breakdown_Minutes | Breakdown_Reason | Corrective_Action
  - The table is pre-filtered based on what was clicked:
    - If a **line** was clicked (e.g., "DFM_PPR5"): filter to show all breakdown records for that Line_ID at that Site_ID
    - If an **equipment** was clicked (e.g., "Waiting for material"): filter to show all breakdown records for that Equipment_ID across all lines
  - A **Total row** at the bottom with dark navy background, showing the sum of `Total_Breakdown_Minutes`
  - Table rows should have alternating slight gray background for readability
  - Data comes from the **Breakdown** sheet

### 12c. Breakdown Duration Trend — Date Hierarchy Drill

The **Breakdown Duration Trend** chart should support drilling through a date hierarchy:

- **Default level:** Month (x-axis shows "Jan", "Feb", "Mar", etc.)
- **Drill-down levels:** Year -> Quarter -> Month -> Day
- Add small **drill-up and drill-down arrow buttons** in the top-left corner of the chart card, visible on hover.
- **Drill down:** When the user clicks a data point on the scatter chart, show the next level down for that period (e.g., clicking "Q1" drills into Jan, Feb, Mar)
- **Drill up:** The up-arrow button goes back up one level in the hierarchy
- Update the x-axis label to reflect the current level ("Year", "Quarter", "Month", "Day")
- Maintain the color coding by site (ARCHEM, DFM, KFM) at all drill levels

### 12d. Implementation Notes

- Use a global state variable (e.g., `window.dashboardState = { activeFilter: { type: null, value: null }, drillLevel: 'month' }`) to track active cross-filter selections and drill state.
- When cross-filtering is active, all Chart.js charts should be updated by calling `.update()` with new filtered datasets — do NOT destroy and recreate charts for cross-filtering (only destroy/recreate on full filter dropdown changes).
- For the drill-through modal, create a hidden `<div id="breakdown-detail-modal">` that slides in from the right or fades in as an overlay.
- The back button should animate the modal out and restore the main dashboard view.

---

## 13. IMPORTANT NOTES

- The Excel file column names may have slight variations — handle them flexibly (trim whitespace, case-insensitive matching).
- If a sheet or column is missing, show "(Blank)" or "No Data" gracefully in the relevant card/chart instead of crashing.
- All date parsing should handle both `M/D/YYYY` formats and Excel serial date numbers.
- Make sure all charts destroy and recreate on filter dropdown change to avoid canvas reuse errors.
- Use Chart.js datalabels plugin (via CDN) for showing values on bars.
