from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from services.document_service import DocumentService

router = APIRouter()


@router.get("")
@router.get("/")
def list_documents(project_id: int) -> list[dict]:
    service = DocumentService()
    result: list[dict] = []
    for file_record in service.repo.list_files_for_project(project_id):
        version = service.repo.get_version_by_id(file_record["version_id"]) or {}
        result.append({
            "id": file_record["id"],
            "document_id": file_record["document_id"],
            "version_id": file_record["version_id"],
            "original_filename": file_record["original_filename"],
            "display_filename": file_record.get("display_filename") or file_record["original_filename"],
            "size_bytes": file_record.get("size_bytes", 0),
            "mime_type": file_record.get("mime_type"),
            "uploaded_at": file_record.get("uploaded_at"),
            "version_number": version.get("version_number", 1),
            "revision_label": version.get("revision_label") or "Rev-0",
        })
    return result


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    project_id: int = Form(...),
    document_id: int | None = Form(None),
    actor_user_id: str = Form(...),
    document_name: str = Form(""),
    revision_label: str = Form("Rev-0"),
) -> dict:
    content = await file.read()
    resolved_document_id = document_id or int(datetime.now(timezone.utc).timestamp() * 1_000_000)
    filename = document_name.strip() or file.filename or "document.pdf"
    original_extension = "." + (file.filename or "document.pdf").rsplit(".", 1)[-1].lower()
    if not filename.lower().endswith((".pdf", ".png", ".jpg", ".jpeg")):
        filename += original_extension
    mime_type = file.content_type or "application/octet-stream"

    try:
        result = DocumentService().upload_document(
            project_id=project_id,
            document_id=resolved_document_id,
            file_bytes=content,
            filename=filename,
            mime_type=mime_type,
            actor_user_id=actor_user_id,
            revision_label=revision_label,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    if result.get("duplicate"):
        raise HTTPException(status_code=409, detail=result["message"])
    return result


@router.get("/{file_id}/signed-url")
def signed_url(file_id: str, actor_user_id: str = "system") -> dict:
    try:
        payload = DocumentService().get_viewer_payload(file_id, actor_user_id)
        return payload
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
