from __future__ import annotations

import io
from datetime import datetime, timezone

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from backend.services.export_service import generate_history_report, generate_updated_workbook
from backend.services.import_service import import_workbook, preview_workbook
from repositories.db import get_db_client

router = APIRouter()


@router.get("")
@router.get("/")
def list_imports(project_id: int | None = None, include_archived: bool = False) -> list[dict]:
    client = get_db_client()
    query = client.table("imports").select("*")
    if project_id is not None:
        query = query.eq("project_id", project_id)
    if not include_archived:
        query = query.neq("import_status", "archived")
    result = query.order("uploaded_at", desc=True).execute()
    return result.data or []


@router.post("/preview")
async def preview_import(file: UploadFile = File(...)) -> dict:
    content = await file.read()
    try:
        return preview_workbook(content, file.filename)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("")
@router.post("/")
async def upload_import(
    file: UploadFile = File(...),
    project_id: int = Form(...),
    actor_user_id: str = Form("system"),
    mode: str = Form("replace"),
) -> dict:
    if mode not in {"replace", "version", "separate"}:
        raise HTTPException(status_code=422, detail="mode must be replace, version, or separate.")
    content = await file.read()
    try:
        return import_workbook(
            get_db_client(),
            content,
            file.filename or "workbook.xlsx",
            project_id,
            actor_user_id,
            mode,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/{import_id}/preview")
def preview_saved_import(import_id: int, limit: int = 20) -> list[dict]:
    limit = max(1, min(limit, 200))
    client = get_db_client()
    result = (
        client.table("documents")
        .select(
            "id,document_number,document_title,discipline,vendor,dci_status,returned_code,revision,"
            "planned_submission_date,actual_submission_date,review_date,remarks"
        )
        .eq("import_id", import_id)
        .order("original_row_number")
        .limit(limit)
        .execute()
    )
    return result.data or []


def _active_import(project_id: int) -> dict:
    result = (
        get_db_client().table("imports")
        .select("*")
        .eq("project_id", project_id)
        .eq("is_active", True)
        .eq("import_status", "complete")
        .order("uploaded_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="No active workbook exists for this project.")
    return result.data[0]


@router.get("/export/workbook")
def export_workbook(project_id: int, actor_user_id: str = "system") -> StreamingResponse:
    client = get_db_client()
    active = _active_import(project_id)
    data = generate_updated_workbook(client, active["id"])
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    filename = f"DCI_Project_{project_id}_Updated_{stamp}.xlsx"
    try:
        client.table("export_records").insert({
            "import_id": active["id"],
            "export_type": "workbook",
            "exported_by": actor_user_id,
            "filename": filename,
            "row_count": active.get("row_count", 0),
            "success": True,
        }).execute()
    except Exception:
        pass
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/history")
def export_history(project_id: int, actor_user_id: str = "system") -> StreamingResponse:
    client = get_db_client()
    active = _active_import(project_id)
    data = generate_history_report(client, active["id"])
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    filename = f"DCI_Project_{project_id}_History_{stamp}.xlsx"
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
