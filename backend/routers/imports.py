"""
DCI Excel Import / Export Router
Handles:
  POST /imports/upload   – parse & store a DCI workbook (.xlsx)
  GET  /imports/list     – list all imports for a project
  GET  /imports/export   – export filtered documents as xlsx
"""
import io
import sys
import os

# Allow imports from project root (dashboard.py functions live there)
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query
from fastapi.responses import StreamingResponse
from repositories.db import get_db_client

router = APIRouter()

DEMO_PROJECT_ID = 1


def _parse_workbook(file_bytes: bytes):
    """Delegate to dashboard.py's parser – it handles all the layout discovery."""
    try:
        from dashboard import (
            parse_workbook_bytes,
            validate_records,
            workbook_hash,
        )
        records, history, project_name, contractor = parse_workbook_bytes(file_bytes)
        warnings, errors = validate_records(records)
        file_hash = workbook_hash(file_bytes)
        return records, history, project_name, contractor, warnings, errors, file_hash
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Workbook parser unavailable: {e}")


@router.post("/upload")
async def upload_workbook(
    file: UploadFile = File(...),
    project_id: int = Form(DEMO_PROJECT_ID),
):
    if not file.filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Only .xlsx files are supported.")
    
    file_bytes = await file.read()
    
    try:
        records, history, project_name, contractor, warnings, errors, file_hash = _parse_workbook(file_bytes)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse workbook: {str(e)}")

    if errors:
        raise HTTPException(status_code=422, detail={"errors": errors, "warnings": warnings})

    supabase = get_db_client()

    # Check for duplicate hash
    existing = supabase.table("imports").select("id").eq("file_hash", file_hash).eq("project_id", project_id).execute()
    if existing.data:
        return {
            "import_id": existing.data[0]["id"],
            "status": "duplicate",
            "message": "This workbook has already been imported.",
            "warnings": warnings,
            "row_count": len(records),
        }

    # Create the import record
    import_res = supabase.table("imports").insert({
        "project_id": project_id,
        "display_name": file.filename,
        "file_hash": file_hash,
        "row_count": len(records),
        "import_status": "processing",
        "project_name": project_name or "",
        "contractor": contractor or "",
        "version_number": 1,
        "review_period_days": 21,
    }).execute()

    if not import_res.data:
        raise HTTPException(status_code=500, detail="Failed to create import record.")

    import_id = import_res.data[0]["id"]

    # Bulk insert documents in batches of 200
    doc_rows = []
    for r in records:
        doc_rows.append({
            "import_id": import_id,
            "document_number": r.get("doc_no", ""),
            "document_title": r.get("title", ""),
            "discipline": r.get("discipline") or "",
            "vendor": r.get("poc") or "",
            "status": r.get("status") or "",
            "approval_code": r.get("latest_code") or "",
            "revision": r.get("latest_rev") or "",
            "uploaded_date": r.get("latest_uploaded_date"),
            "from_eil_date": r.get("latest_from_eil_date"),
            "schedule_submission_date": r.get("schedule_submission_date"),
            "age_days": None,
            "remarks": r.get("remarks") or "",
        })

    BATCH = 200
    for i in range(0, len(doc_rows), BATCH):
        batch = doc_rows[i:i + BATCH]
        supabase.table("documents").insert(batch).execute()

    # Mark import complete
    supabase.table("imports").update({"import_status": "complete"}).eq("id", import_id).execute()

    return {
        "import_id": import_id,
        "status": "complete",
        "row_count": len(records),
        "project_name": project_name,
        "contractor": contractor,
        "warnings": warnings,
        "errors": [],
    }


@router.get("/list")
def list_imports(project_id: int = Query(DEMO_PROJECT_ID)):
    supabase = get_db_client()
    res = supabase.table("imports").select(
        "id, display_name, row_count, import_status, version_number, uploaded_at, project_name, contractor, review_period_days"
    ).eq("project_id", project_id).order("uploaded_at", desc=True).execute()
    return res.data or []


@router.get("/preview")
def preview_import(import_id: int = Query(...), limit: int = Query(20)):
    supabase = get_db_client()
    res = supabase.table("documents").select(
        "document_number, document_title, discipline, vendor, status, approval_code, revision, uploaded_date, age_days"
    ).eq("import_id", import_id).limit(limit).execute()
    return res.data or []


@router.get("/export")
def export_documents(project_id: int = Query(DEMO_PROJECT_ID)):
    """Export all documents from the latest import as an xlsx file."""
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl not installed")

    supabase = get_db_client()
    # Get latest active import
    imp_res = supabase.table("imports").select("id, display_name").eq("project_id", project_id)\
        .eq("import_status", "complete").order("uploaded_at", desc=True).limit(1).execute()
    if not imp_res.data:
        raise HTTPException(status_code=404, detail="No completed import found for this project.")

    import_id = imp_res.data[0]["id"]
    docs_res = supabase.table("documents").select("*").eq("import_id", import_id).execute()
    docs = docs_res.data or []

    # Build xlsx
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "DCI Register"

    COLS = ["document_number", "document_title", "discipline", "vendor",
            "status", "approval_code", "revision",
            "uploaded_date", "from_eil_date", "schedule_submission_date", "age_days", "remarks"]
    HEADERS = ["Doc No", "Title", "Discipline", "Vendor",
                "Status", "Approval Code", "Revision",
                "Last Uploaded", "EIL Return Date", "Scheduled Date", "Age (days)", "Remarks"]

    header_fill = PatternFill("solid", fgColor="E11D48")
    header_font = Font(color="FFFFFF", bold=True)

    for col_idx, header in enumerate(HEADERS, 1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center")

    for row_idx, doc in enumerate(docs, 2):
        for col_idx, col_key in enumerate(COLS, 1):
            ws.cell(row=row_idx, column=col_idx, value=doc.get(col_key, ""))

    # Auto-size columns
    for col in ws.columns:
        max_len = max((len(str(c.value or "")) for c in col), default=10)
        ws.column_dimensions[col[0].column_letter].width = min(max_len + 2, 40)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=DCI_Export_{import_id}.xlsx"}
    )
