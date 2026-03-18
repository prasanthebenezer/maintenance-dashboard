"""
server.py — ARASCO Dashboard Backend (FastAPI)

Run:
    python server.py
    or: uvicorn server:app --host 0.0.0.0 --port 8080 --reload
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, Query, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import sqlite3
import json
import uvicorn
from pathlib import Path
from contextlib import contextmanager
from typing import Optional
import tempfile
import subprocess

BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "dashboard.db"

app = FastAPI(title="ARASCO Dashboard API")


# Prevent browser caching of HTML pages so nav changes are always fresh
class NoCacheHTMLMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        ct = response.headers.get("content-type", "")
        if "text/html" in ct:
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        return response

app.add_middleware(NoCacheHTMLMiddleware)

# ─── Table Configuration ─────────────────────────────────

TABLE_MAP = {
    "line-performance": "line_performance",
    "breakdown": "breakdown",
    "spare-parts": "spare_parts_cost",
    "site-maintenance": "site_maintenance",
    "rca": "rca",
}

COLUMN_WHITELIST = {
    "line_performance": ["date", "site_id", "line_id", "running_time",
                         "downtime_electrical", "downtime_mechanical", "downtime_utilities"],
    "breakdown": ["date", "site_id", "line_id", "equipment_id", "breakdown_duration",
                  "breakdown_reason", "corrective_action", "preventive_action",
                  "maintenance_issue", "type"],
    "spare_parts_cost": ["date", "site_id", "budget_cost", "sp_cost"],
    "site_maintenance": ["date", "site_id", "pm_scheduled", "pm_completed", "corrective_tasks"],
    "rca": ["incident_date", "site_id", "incident_id", "completed"],
}

# ─── Database Connection ─────────────────────────────────

@contextmanager
def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
    finally:
        conn.close()


# ─── Page Routes ─────────────────────────────────────────

NO_CACHE = {"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"}

@app.get("/")
async def serve_dashboard():
    return FileResponse(BASE_DIR / "index.html", headers=NO_CACHE)

@app.get("/admin")
async def serve_admin():
    return FileResponse(BASE_DIR / "admin.html", headers=NO_CACHE)


# ─── Dashboard Data Endpoint ─────────────────────────────

@app.get("/api/dashboard-data")
async def get_dashboard_data():
    """Return all tables in one response for the dashboard frontend."""
    with get_db() as conn:
        result = {}
        for key, table in [
            ("linePerformance", "line_performance"),
            ("breakdown", "breakdown"),
            ("spareParts", "spare_parts_cost"),
            ("siteMaintenance", "site_maintenance"),
            ("rca", "rca"),
        ]:
            rows = conn.execute(f"SELECT * FROM {table}").fetchall()
            result[key] = [dict(r) for r in rows]
    return result


# ─── Metadata Endpoint ───────────────────────────────────

@app.get("/api/meta")
async def get_meta():
    """Return table schemas and row counts for admin UI."""
    with get_db() as conn:
        tables = {}
        for url_name, sql_name in TABLE_MAP.items():
            count = conn.execute(f"SELECT COUNT(*) FROM {sql_name}").fetchone()[0]
            cols = [
                {"name": row[1], "type": row[2], "notnull": bool(row[3]), "pk": bool(row[5])}
                for row in conn.execute(f"PRAGMA table_info({sql_name})").fetchall()
            ]
            tables[url_name] = {"sql_name": sql_name, "count": count, "columns": cols}
        return tables


# ─── Excel Upload (must be before {table_name} routes) ───

@app.post("/api/upload-excel")
async def upload_excel(
    file: UploadFile = File(...),
    mode: str = Query(default="replace")
):
    """Upload an Excel file to replace or append to the database."""
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(400, "File must be .xlsx or .xls")

    tmp_path = Path(tempfile.mktemp(suffix=".xlsx"))
    try:
        content = await file.read()
        with open(tmp_path, "wb") as f:
            f.write(content)

        # Import using convert_db module
        import convert_db
        success = convert_db.run_import(str(tmp_path), str(DB_PATH), append=(mode == "append"))
        if not success:
            raise HTTPException(500, "Import failed")

        return {"status": "success", "mode": mode, "filename": file.filename}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Import error: {str(e)}")
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except PermissionError:
            pass  # Windows may still hold the file; temp dir will clean up


# ─── CRUD Endpoints ──────────────────────────────────────

@app.get("/api/{table_name}")
async def list_rows(
    table_name: str,
    site_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = Query(default=50000, le=100000),
    offset: int = 0
):
    sql_table = TABLE_MAP.get(table_name)
    if not sql_table:
        raise HTTPException(404, f"Table '{table_name}' not found")

    conditions = []
    params = []

    if site_id:
        conditions.append("site_id = ?")
        params.append(site_id)

    date_col = "incident_date" if sql_table == "rca" else "date"
    if date_from:
        conditions.append(f"{date_col} >= ?")
        params.append(date_from)
    if date_to:
        conditions.append(f"{date_col} <= ?")
        params.append(date_to)

    where = " WHERE " + " AND ".join(conditions) if conditions else ""
    query = f"SELECT * FROM {sql_table}{where} ORDER BY id LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
        count_params = params[:-2]
        count = conn.execute(f"SELECT COUNT(*) FROM {sql_table}{where}", count_params).fetchone()[0]

    return {
        "table": table_name,
        "total": count,
        "limit": limit,
        "offset": offset,
        "data": [dict(r) for r in rows]
    }


@app.get("/api/{table_name}/{row_id}")
async def get_row(table_name: str, row_id: int):
    sql_table = TABLE_MAP.get(table_name)
    if not sql_table:
        raise HTTPException(404)
    with get_db() as conn:
        row = conn.execute(f"SELECT * FROM {sql_table} WHERE id = ?", [row_id]).fetchone()
        if not row:
            raise HTTPException(404, f"Row {row_id} not found")
        return dict(row)


@app.post("/api/{table_name}")
async def create_rows(table_name: str, request: Request):
    sql_table = TABLE_MAP.get(table_name)
    if not sql_table:
        raise HTTPException(404)

    body = await request.json()
    allowed = COLUMN_WHITELIST[sql_table]
    rows = body if isinstance(body, list) else [body]

    with get_db() as conn:
        inserted_ids = []
        for row in rows:
            cols = [k for k in row if k in allowed]
            vals = [row[k] for k in cols]
            if not cols:
                # Insert with defaults
                cursor = conn.execute(f"INSERT INTO {sql_table} DEFAULT VALUES")
            else:
                placeholders = ", ".join(["?"] * len(cols))
                col_str = ", ".join(cols)
                cursor = conn.execute(
                    f"INSERT INTO {sql_table} ({col_str}) VALUES ({placeholders})", vals
                )
            inserted_ids.append(cursor.lastrowid)
        conn.commit()

    return {"inserted": len(inserted_ids), "ids": inserted_ids}


@app.put("/api/{table_name}/{row_id}")
async def update_row(table_name: str, row_id: int, request: Request):
    sql_table = TABLE_MAP.get(table_name)
    if not sql_table:
        raise HTTPException(404)

    body = await request.json()
    allowed = COLUMN_WHITELIST[sql_table]
    cols = [k for k in body if k in allowed]
    if not cols:
        raise HTTPException(400, "No valid columns to update")

    set_clause = ", ".join(f"{c} = ?" for c in cols)
    vals = [body[c] for c in cols] + [row_id]

    with get_db() as conn:
        result = conn.execute(f"UPDATE {sql_table} SET {set_clause} WHERE id = ?", vals)
        conn.commit()
        if result.rowcount == 0:
            raise HTTPException(404, f"Row {row_id} not found")

    return {"updated": row_id}


@app.delete("/api/{table_name}/{row_id}")
async def delete_row(table_name: str, row_id: int):
    sql_table = TABLE_MAP.get(table_name)
    if not sql_table:
        raise HTTPException(404)

    with get_db() as conn:
        result = conn.execute(f"DELETE FROM {sql_table} WHERE id = ?", [row_id])
        conn.commit()
        if result.rowcount == 0:
            raise HTTPException(404)

    return {"deleted": row_id}


# ─── Bulk Operations ─────────────────────────────────────

@app.post("/api/{table_name}/bulk-update")
async def bulk_update(table_name: str, request: Request):
    """Accept array of cell changes: [{"id": 5, "field": "running_time", "value": 450}, ...]"""
    sql_table = TABLE_MAP.get(table_name)
    if not sql_table:
        raise HTTPException(404)

    changes = await request.json()
    allowed = COLUMN_WHITELIST[sql_table]

    with get_db() as conn:
        updated = 0
        for change in changes:
            row_id = change.get("id")
            field = change.get("field")
            value = change.get("value")
            if not row_id or field not in allowed:
                continue
            conn.execute(f"UPDATE {sql_table} SET {field} = ? WHERE id = ?", [value, row_id])
            updated += 1
        conn.commit()

    return {"updated": updated}


@app.post("/api/{table_name}/bulk-delete")
async def bulk_delete(table_name: str, request: Request):
    """Accept array of IDs to delete: [1, 2, 3]"""
    sql_table = TABLE_MAP.get(table_name)
    if not sql_table:
        raise HTTPException(404)

    ids = await request.json()
    if not isinstance(ids, list):
        raise HTTPException(400, "Expected array of IDs")

    with get_db() as conn:
        placeholders = ", ".join(["?"] * len(ids))
        result = conn.execute(f"DELETE FROM {sql_table} WHERE id IN ({placeholders})", ids)
        conn.commit()

    return {"deleted": result.rowcount}


# ─── Static Files (catch-all, must be last) ──────────────

app.mount("/", StaticFiles(directory=str(BASE_DIR), html=True), name="static")


# ─── Entry Point ─────────────────────────────────────────

if __name__ == "__main__":
    if not DB_PATH.exists():
        print("Database not found. Creating empty tables...")
        import convert_db
        convert_db.create_tables_only(str(DB_PATH))
        print("Run 'python convert_db.py' to import data from Excel.")

    print(f"Starting ARASCO Dashboard Server on http://0.0.0.0:8080")
    print(f"  Dashboard: http://localhost:8080")
    print(f"  Admin:     http://localhost:8080/admin")
    uvicorn.run(app, host="0.0.0.0", port=8080)
