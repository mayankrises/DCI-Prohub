from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from services.document_service import DocumentService
from services.auth_service import MOCK_USERS

router = APIRouter()

DEMO_PROJECT_ID = 1

@router.get("/")
def list_documents(project_id: int = DEMO_PROJECT_ID):
    svc = DocumentService()
    files = svc.repo.list_files_by_project(project_id)
    versions = {}
    for f in files:
        vid = f.get("version_id")
        if vid and vid not in versions:
            v = svc.repo.get_version_by_id(vid)
            if v:
                versions[vid] = v
    result = []
    for f in files:
        v = versions.get(f.get("version_id"), {})
        result.append({
            "id": f["id"],
            "document_id": f.get("document_id"),
            "version_id": f.get("version_id"),
            "original_filename": f["original_filename"],
            "size_bytes": f.get("size_bytes", 0),
            "mime_type": f.get("mime_type"),
            "uploaded_at": f.get("uploaded_at") or f.get("created_at"),
            "version_number": v.get("version_number", 1),
            "revision_label": v.get("revision_label", "Rev-0"),
        })
    return result

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    project_id: int = Form(DEMO_PROJECT_ID),
    document_name: str = Form(""),
    actor_user_id: str = Form(...),
    document_id: int | None = Form(None),
):
    content = await file.read()
    mime = file.content_type or "application/pdf"
    filename = document_name.strip() or file.filename or "document.pdf"
    if not any(filename.lower().endswith(ext) for ext in [".pdf", ".png", ".jpg", ".jpeg"]):
        ext = "." + (file.filename or "doc.pdf").rsplit(".", 1)[-1].lower()
        filename = filename + ext

    svc = DocumentService()
    if not document_id:
        # Create a stub document entry first
        doc_res = svc.supabase.table("documents").insert({
            "project_id": project_id,
            "document_name": filename,
            "document_type": "general",
            "created_by": actor_user_id
        }).execute()
        if not doc_res.data:
            raise HTTPException(status_code=500, detail="Failed to create document record.")
        document_id = doc_res.data[0]["id"]

    result = svc.upload_document(
        project_id=project_id,
        document_id=document_id,
        file_bytes=content,
        filename=filename,
        mime_type=mime,
        actor_user_id=actor_user_id
    )
    if result.get("duplicate"):
        raise HTTPException(status_code=409, detail=result["message"])
    return {"file_id": result["file_id"], "document_id": document_id}

@router.get("/{file_id}/signed-url")
def get_signed_url(file_id: str):
    svc = DocumentService()
    url = svc.create_download_url(file_id, "system")
    return {"signed_url": url}
