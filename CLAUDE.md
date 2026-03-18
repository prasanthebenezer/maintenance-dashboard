# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A single-page web dashboard replacing the ARASCO Feed Maintenance Power BI report. Reads data from a local Excel file (`ARASCO Dashboard Data.xlsx`) client-side using SheetJS. No backend, no build step, no package manager.

## Running the Dashboard

Since this is a static site that uses `fetch()` to load the Excel file, it **cannot be opened directly as a file** (CORS restriction). Serve it with a local HTTP server:

```bash
# Python (most systems)
python -m http.server 8080

# Node.js (if available)
npx serve .
# or
npx http-server .
```

Then open `http://localhost:8080` in a browser. Data refreshes on page reload.

## File Structure

```
/
├── index.html                    # Single-page app, all markup
├── styles.css                    # All styling
├── app.js                        # Data loading, filtering, chart rendering
└── ARASCO Dashboard Data.xlsx    # Data source (user-placed, not in source control)
```

All CDN dependencies are loaded in `index.html` (no npm/node_modules):
- **Chart.js** — all charts
- **Chart.js Datalabels Plugin** — value labels on bars
- **SheetJS (xlsx)** — client-side Excel parsing

## Architecture

### Three-layer design

1. **Data layer** (`loadData()` in `app.js`) — fetches the `.xlsx` on page load via `fetch()`, parses all 7 sheets using SheetJS, stores raw data in memory. Runs once; subsequent filter changes use in-memory data.

2. **State** — `window.dashboardState` global tracks:
   - `activeFilter` (`{ type, value }`) — current cross-filter selection from bar chart clicks
   - `drillLevel` — date hierarchy level for the Breakdown Duration Trend (`year/quarter/month/day`)
   - `selectedSite` / `selectedMonth` — top-level dropdown filter values

3. **Presentation layer** (`index.html` + `styles.css`) — CSS Grid layout with a fixed 80px sidebar + main content area. Charts rendered by Chart.js instances stored as variables.

### Key behavioral rules

- **Filter dropdown changes** (Plant/Month): destroy and recreate Chart.js instances to avoid canvas reuse errors.
- **Cross-filtering** (bar chart clicks): call `chart.update()` with filtered datasets — do NOT destroy/recreate.
- **Missing data**: always degrade gracefully with "(Blank)" or "No Data" — never throw.
- **Date parsing**: handle both `M/D/YYYY` strings and Excel serial date numbers. Column name matching should be case-insensitive and trim whitespace.

## Data Source — Excel Sheets

| Sheet | Key columns | Used for |
|---|---|---|
| `Line_Performance` | Date, Site_ID, Line_ID, Running_Time (min), Downtime_Electrical/Mechanical/Utilities (min) | Line Availability KPI + chart |
| `Breakdown` | Date, Site_ID, Line_ID, Equipment_ID, Total_Breakdown_Minutes, Breakdown_Reason, Corrective_Action, Type | Breakdown charts + drill-through table |
| `Spare_Parts_Cost` | MMM/YY, Site_ID, Budget_Cost, SP_Cost, Total | SP Cost KPI, table, trend chart |
| `Site_Maintenance` | *(dynamic)* | PM Completion Rate KPI |
| `Project_Tracking` | *(dynamic)* | Corrective Tasks KPI |
| `RCA` | Site_ID, Status (Incidents/Actions/Done/Pending/Plan) | RCA Status table |
| `Details` | *(supplementary)* | Additional detail |

**Line Availability formula:** `SUM(Running_Time) / (SUM(Running_Time) + SUM(Downtime_Electrical) + SUM(Downtime_Mechanical) + SUM(Downtime_Utilities)) × 100`

## Color Scheme (exact values)

| Purpose | Color |
|---|---|
| Sidebar background | `#0D2137` |
| Sidebar left accent stripe (6px) | `#2ECC40` |
| Page background | `#F0F0F0` |
| Card background | `#FFFFFF` |
| Active filter text | `#E8771E` |
| Chart bars (primary) | `#2E6DA4` |
| Chart bars (highlighted/top item) | `#1A73E8` |
| Table header background | `#1B4F72` |
| KPI number / title | `#0D2137` |
| Line Availability ≥95% | `#1D8348` (green) |
| Line Availability <95% | `#E74C3C` (red) |
| 95% target reference line | `#2ECC40` dashed |
| Budget within / Actual within | `#2ECC40` |
| Budget slightly over (≤10%) | `#F5A623` |
| Budget over (>10%) | `#E74C3C` |

## Advanced Interactions

- **Cross-filtering**: clicking a bar in "Breakdown Lines" or "Breakdown Equipments" dims other bars to ~30% opacity and filters related charts. Clicking again deselects. Use `dashboardState.activeFilter` to track state.
- **Drill-through modal**: right-click (or double-click) on a bar opens a full-screen overlay with a filtered Breakdown detail table. Controlled by a hidden `<div id="breakdown-detail-modal">`. Use `e.preventDefault()` on chart canvases to suppress the browser context menu.
- **Date hierarchy drill** (Breakdown Duration Trend): drill-down/up buttons cycle through year → quarter → month → day. Current level stored in `dashboardState.drillLevel`.
- **Logo upload**: stored as Base64 in `localStorage` under key `arasco_logo`. On load, check localStorage and render circular logo at sidebar bottom, or show placeholder with "أراسكو / ARASCO" text.

## Specification Reference

Full design and data specifications are in `ARASCO_Dashboard_Prompt.md`. This is the authoritative source for layout, component specs, and interaction behavior.
