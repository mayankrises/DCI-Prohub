from __future__ import annotations

import csv
import io
import math
import os
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import fitz
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from repositories.db import get_collab_db_client

router = APIRouter()
BUCKET = "project-documents"

class CycleCreate(BaseModel):
    project_id: int
    document_id: int
    target_revision: str = "Rev-0"
    clean_version_id: str | None = None
    review_scope: str = "internal"
    contractor_organisation: str = "Contractor"
    consultant_organisation: str = "Consultant"
    due_date: str | None = None
    actor_user_id: str

class CommentCreate(BaseModel):
    project_id: int
    document_id: int
    review_cycle_id: str | None = None
    version_id: str | None = None
    document_file_id: str | None = None
    page_number: int = Field(default=1, ge=1)
    comment_text: str = Field(min_length=1)
    geometry: dict[str, Any]
    style: dict[str, Any] = Field(default_factory=dict)
    visibility: str = "internal"
    priority: str = "normal"
    category: str | None = None
    raised_by: str
    raised_by_org: str = "contractor"
    assigned_to: str | None = None
    assigned_org: str = "consultant"
    internal_document_id: int | None = None
    internal_version_id: str | None = None

class ResponseCreate(BaseModel):
    response_text: str = Field(min_length=1)
    response_type: str = "reply"
    actor_user_id: str
    actor_org: str = "consultant"

class CommentPatch(BaseModel):
    comment_text: str | None = None
    assigned_to: str | None = None
    priority: str | None = None
    category: str | None = None
    closure_remarks: str | None = None
    actor_user_id: str

class ResolutionPayload(BaseModel):
    message: str = Field(min_length=1)
    actor_user_id: str
    actor_org: str = "contractor"

class SnapshotPayload(BaseModel):
    source_file_id: str
    review_cycle_id: str | None = None
    actor_user_id: str
    notes: str = "Comments issued"


def db():
    return get_collab_db_client()


def _notify(project_id: int, user_id: str | None, title: str, message: str, entity_id: str | None = None):
    if not user_id:
        return
    try:
        note = db().table("notifications").insert({
            "project_id": project_id, "notification_type": "review_comment", "title": title,
            "message": message, "entity_type": "review_comment", "entity_id": entity_id,
        }).execute().data[0]
        db().table("notification_recipients").insert({"notification_id": note["id"], "user_id": user_id}).execute()
    except Exception:
        pass


def _hydrate_comments(rows: list[dict]) -> list[dict]:
    if not rows:
        return []
    ids = [r["id"] for r in rows]
    responses = db().table("review_comment_responses").select("*").in_("comment_id", ids).order("created_at").execute().data or []
    grouped: dict[str, list[dict]] = {}
    for response in responses:
        grouped.setdefault(response["comment_id"], []).append(response)
    for row in rows:
        row["responses"] = grouped.get(row["id"], [])
        row["latest_response"] = row["responses"][-1]["response_text"] if row["responses"] else ""
    return rows

@router.get("/cycles")
def list_cycles(project_id: int, document_id: int | None = None):
    query = db().table("review_cycles").select("*").eq("project_id", project_id)
    if document_id is not None:
        query = query.eq("document_id", document_id)
    return query.order("created_at", desc=True).execute().data or []

@router.post("/cycles")
def create_cycle(payload: CycleCreate):
    existing = db().table("review_cycles").select("cycle_number").eq("document_id", payload.document_id).eq("target_revision", payload.target_revision).eq("review_scope", payload.review_scope).order("cycle_number", desc=True).limit(1).execute().data or []
    cycle_number = int(existing[0]["cycle_number"]) + 1 if existing else 1
    row = payload.model_dump(exclude={"actor_user_id"}) | {"cycle_number": cycle_number, "created_by": payload.actor_user_id}
    result = db().table("review_cycles").insert(row).execute().data
    return result[0]

@router.get("/comments")
def list_comments(project_id: int, document_id: int | None = None, review_cycle_id: str | None = None, version_id: str | None = None, status: str | None = None, assigned_to: str | None = None):
    query = db().table("review_comments").select("*").eq("project_id", project_id)
    if document_id is not None: query = query.eq("document_id", document_id)
    if review_cycle_id: query = query.eq("review_cycle_id", review_cycle_id)
    if version_id: query = query.eq("version_id", version_id)
    if status: query = query.eq("status", status)
    if assigned_to: query = query.eq("assigned_to", assigned_to)
    return _hydrate_comments(query.order("raised_at", desc=False).execute().data or [])

@router.post("/comments")
def create_comment(payload: CommentCreate):
    number = db().rpc("next_review_comment_number", {"p_document_id": payload.document_id}).execute().data
    number = int(number)
    code = f"C-{number:03d}"
    row = payload.model_dump() | {"comment_number": number, "comment_code": code}

    # Inner Circle versions reuse the existing document viewer records. Infer the
    # explicit internal document/version context from the viewer file/version so
    # old annotations never leak onto the next clean version.
    if not row.get("internal_document_id"):
        internal = []
        if payload.document_file_id:
            internal = db().table("internal_document_versions").select("id,internal_document_id").eq("viewer_file_id", payload.document_file_id).limit(1).execute().data or []
        if not internal and payload.version_id:
            internal = db().table("internal_document_versions").select("id,internal_document_id").eq("viewer_version_id", payload.version_id).limit(1).execute().data or []
        if internal:
            row["internal_document_id"] = internal[0]["internal_document_id"]
            row["internal_version_id"] = internal[0]["id"]

    result = db().table("review_comments").insert(row).execute().data
    if not result: raise HTTPException(500, "Could not create comment")
    saved = result[0]
    if saved.get("internal_document_id"):
        try:
            db().table("internal_documents").update({
                "status": "waiting_consultant_response",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", saved["internal_document_id"]).execute()
        except Exception:
            pass
    _notify(payload.project_id, payload.assigned_to, f"{code} assigned to you", payload.comment_text, saved["id"])
    return saved

@router.patch("/comments/{comment_id}")
def edit_comment(comment_id: str, payload: CommentPatch):
    values = payload.model_dump(exclude_none=True, exclude={"actor_user_id"}) | {"updated_at": datetime.now(timezone.utc).isoformat()}
    result = db().table("review_comments").update(values).eq("id", comment_id).execute().data
    if not result: raise HTTPException(404, "Comment not found")
    return result[0]

@router.post("/comments/{comment_id}/responses")
def add_response(comment_id: str, payload: ResponseCreate):
    comment_rows = db().table("review_comments").select("*").eq("id", comment_id).limit(1).execute().data or []
    if not comment_rows: raise HTTPException(404, "Comment not found")
    comment = comment_rows[0]
    response = db().table("review_comment_responses").insert({
        "comment_id": comment_id, "response_text": payload.response_text, "response_type": payload.response_type,
        "created_by": payload.actor_user_id, "created_by_org": payload.actor_org,
    }).execute().data[0]
    next_status = "awaiting_verification" if payload.actor_org == "consultant" else "responded"
    db().table("review_comments").update({"status": next_status, "updated_at": datetime.now(timezone.utc).isoformat()}).eq("id", comment_id).execute()
    _notify(comment["project_id"], comment.get("raised_by"), f"Response added to {comment['comment_code']}", payload.response_text, comment_id)
    return response

@router.post("/comments/{comment_id}/resolve")
def resolve(comment_id: str, payload: ResolutionPayload):
    now = datetime.now(timezone.utc).isoformat()
    db().table("review_comment_responses").insert({"comment_id": comment_id, "response_text": payload.message, "response_type": "resolution", "created_by": payload.actor_user_id, "created_by_org": payload.actor_org}).execute()
    result = db().table("review_comments").update({"status":"resolved","resolved_by":payload.actor_user_id,"resolved_at":now,"closure_remarks":payload.message,"updated_at":now}).eq("id",comment_id).execute().data
    if not result: raise HTTPException(404,"Comment not found")
    return result[0]

@router.post("/comments/{comment_id}/reopen")
def reopen(comment_id: str, payload: ResolutionPayload):
    now = datetime.now(timezone.utc).isoformat()
    db().table("review_comment_responses").insert({"comment_id": comment_id, "response_text": payload.message, "response_type": "reopen", "created_by": payload.actor_user_id, "created_by_org": payload.actor_org}).execute()
    result = db().table("review_comments").update({"status":"reopened","resolved_by":None,"resolved_at":None,"closure_remarks":None,"updated_at":now}).eq("id",comment_id).execute().data
    return result[0]

@router.get("/crs")
def crs(project_id: int, document_id: int | None = None, status: str | None = None):
    return list_comments(project_id, document_id=document_id, status=status)

@router.get("/crs/export.csv")
def export_crs(project_id: int, document_id: int | None = None, status: str | None = None):
    rows = list_comments(project_id, document_id=document_id, status=status)
    output = io.StringIO()
    columns = ["comment_code","document_id","page_number","comment_text","latest_response","status","priority","category","raised_by_org","assigned_org","raised_at","resolved_at","closure_remarks"]
    writer = csv.DictWriter(output, fieldnames=columns); writer.writeheader()
    for row in rows: writer.writerow({key: row.get(key, "") for key in columns})
    filename = f"project_{project_id}_CRS.csv" if document_id is None else f"document_{document_id}_CRS.csv"
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition":f'attachment; filename="{filename}"'})


def _arrow(page: fitz.Page, start: fitz.Point, end: fitz.Point, color=(1,0,0), width=1.5):
    page.draw_line(start, end, color=color, width=width)
    angle = math.atan2(start.y-end.y, start.x-end.x)
    length = 9
    p1 = fitz.Point(end.x + length*math.cos(angle+0.45), end.y + length*math.sin(angle+0.45))
    p2 = fitz.Point(end.x + length*math.cos(angle-0.45), end.y + length*math.sin(angle-0.45))
    page.draw_polyline([p1,end,p2], color=color, width=width)

@router.post("/snapshots/generate")
def generate_snapshot(payload: SnapshotPayload):
    client = db()
    file_rows = client.table("document_files").select("*").eq("id", payload.source_file_id).limit(1).execute().data or []
    if not file_rows: raise HTTPException(404,"Source file not found")
    source = file_rows[0]
    if source.get("mime_type") != "application/pdf": raise HTTPException(422,"Commented snapshots currently support PDF files only")
    raw = client.storage.from_(source["storage_bucket"]).download(source["storage_path"])
    pdf = fitz.open(stream=raw, filetype="pdf")
    comments = list_comments(source["project_id"], document_id=source["document_id"])
    comments = [c for c in comments if not c.get("version_id") or c.get("version_id") == source["version_id"]]
    for comment in comments:
        page_index = max(0, min(len(pdf)-1, int(comment.get("page_number",1))-1)); page = pdf[page_index]; rect = page.rect
        g = comment.get("geometry") or {}; style = comment.get("style") or {}
        sx,sy = float(g.get("start_x",g.get("x",.2))),float(g.get("start_y",g.get("y",.2)))
        ex,ey = float(g.get("end_x",g.get("box_x",sx+.15))),float(g.get("end_y",g.get("box_y",sy)))
        start,end = fitz.Point(sx*rect.width,sy*rect.height),fitz.Point(ex*rect.width,ey*rect.height)
        _arrow(page,start,end)
        bx,by = float(g.get("box_x",ex)),float(g.get("box_y",ey)); bw=float(g.get("box_width",.28)); bh=float(g.get("box_height",.10))
        box=fitz.Rect(bx*rect.width,by*rect.height,min(rect.width,(bx+bw)*rect.width),min(rect.height,(by+bh)*rect.height))
        page.draw_rect(box,color=(1,0,0),fill=(1,1,.88),width=1)
        page.insert_textbox(box,f"{comment['comment_code']}\n{comment['comment_text']}",fontsize=float(style.get("font_size",9)),fontname="helv",color=(0,0,0),align=0)
    data = pdf.tobytes(garbage=4,deflate=True); pdf.close()
    existing = client.table("review_snapshots").select("issue_number").eq("version_id",source["version_id"]).order("issue_number",desc=True).limit(1).execute().data or []
    issue = int(existing[0]["issue_number"])+1 if existing else 1
    base = os.path.splitext(source["original_filename"])[0]
    path=f"projects/{source['project_id']}/documents/{source['document_id']}/versions/{source['version_id']}/commented/{base}_commented_issue_{issue:02d}.pdf"
    client.storage.from_(source["storage_bucket"]).upload(path=path, file=data, file_options={"content-type":"application/pdf","upsert":"false"})
    file_row=client.table("document_files").insert({
        "project_id":source["project_id"],"document_id":source["document_id"],"version_id":source["version_id"],"storage_bucket":source["storage_bucket"],"storage_path":path,
        "original_filename":f"{base}_commented_issue_{issue:02d}.pdf","display_filename":f"{base} — Commented Issue {issue}","mime_type":"application/pdf","file_extension":".pdf","size_bytes":len(data),
        "sha256_hash":__import__('hashlib').sha256(data).hexdigest(),"uploaded_by":payload.actor_user_id,"is_current":False,"is_deleted":False,"file_role":"commented_snapshot","source_file_id":source["id"],"issue_number":issue,
        "metadata":{"notes":payload.notes}
    }).execute().data[0]
    snapshot=client.table("review_snapshots").insert({"project_id":source["project_id"],"document_id":source["document_id"],"review_cycle_id":payload.review_cycle_id,"version_id":source["version_id"],"source_file_id":source["id"],"commented_file_id":file_row["id"],"issue_number":issue,"issued_by":payload.actor_user_id,"comment_count":len(comments),"notes":payload.notes}).execute().data[0]
    return snapshot | {"commented_file":file_row}

@router.get("/versions/{document_id}")
def versions(document_id: int):
    versions = db().table("document_versions").select("*").eq("document_id",document_id).order("version_number",desc=True).execute().data or []
    files = db().table("document_files").select("*").eq("document_id",document_id).eq("is_deleted",False).order("uploaded_at",desc=True).execute().data or []
    for version in versions: version["files"]=[f for f in files if f["version_id"]==version["id"]]
    return versions
