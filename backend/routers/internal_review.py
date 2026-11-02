from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from repositories.db import get_collab_db_client
from services.notification_service import NotificationService
from services.document_service import DocumentService

router = APIRouter()
BUCKET = "project-documents"

CONTRACTOR_TEST_USERS = [
    "e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5",
    "11111111-2222-3333-4444-555555555555",
]
CONSULTANT_TEST_USERS = [
    "f6f6f6f6-f6f6-f6f6-f6f6-f6f6f6f6f6f6",
    "66666666-7777-8888-9999-000000000000",
]


def db():
    return get_collab_db_client()


def _safe_stem(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9._-]+", "_", value.strip())
    value = re.sub(r"_+", "_", value).strip("_.")
    return value or "DOCUMENT"


def _generated_filename(document_number: str, version_number: int, original_name: str) -> str:
    extension = Path(original_name or "document.pdf").suffix.lower() or ".pdf"
    return f"{_safe_stem(document_number)}_V{version_number}{extension}"


def _upload_version_file(
    *,
    project_id: int,
    internal_document_id: int,
    document_number: str,
    version_number: int,
    revision_date: str,
    remarks: str | None,
    actor_user_id: str,
    actor_org: str,
    upload: UploadFile,
    content: bytes,
) -> dict[str, Any]:
    if not content:
        raise HTTPException(422, "The uploaded file is empty.")

    generated = _generated_filename(document_number, version_number, upload.filename or "document.pdf")
    version_label = f"V{version_number}"
    digest = hashlib.sha256(content).hexdigest()
    client = db()

    duplicate = (
        client.table("internal_document_versions")
        .select("id")
        .eq("internal_document_id", internal_document_id)
        .eq("sha256_hash", digest)
        .limit(1)
        .execute()
        .data
        or []
    )
    if duplicate:
        raise HTTPException(409, "This exact file has already been uploaded for the document.")

    # Reuse the existing document file/version pipeline so the current viewer,
    # locking and annotation APIs work without a second PDF implementation.
    viewer_document_id = 10_000_000_000 + int(internal_document_id)
    try:
        viewer_result = DocumentService().upload_document(
            project_id=project_id,
            document_id=viewer_document_id,
            file_bytes=content,
            filename=generated,
            mime_type=upload.content_type or "application/octet-stream",
            actor_user_id=actor_user_id,
            revision_label=version_label,
        )
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(422 if isinstance(exc, ValueError) else 500, str(exc)) from exc
    if viewer_result.get("duplicate"):
        raise HTTPException(409, viewer_result.get("message") or "Duplicate file.")

    viewer_file_rows = (
        client.table("document_files")
        .select("*")
        .eq("id", viewer_result["file_id"])
        .limit(1)
        .execute()
        .data
        or []
    )
    if not viewer_file_rows:
        raise HTTPException(500, "Viewer file record was not created.")
    viewer_file = viewer_file_rows[0]

    client.table("internal_document_versions").update({"is_current": False}).eq(
        "internal_document_id", internal_document_id
    ).execute()

    rows = (
        client.table("internal_document_versions")
        .insert(
            {
                "project_id": project_id,
                "internal_document_id": internal_document_id,
                "version_number": version_number,
                "version_label": version_label,
                "revision_date": revision_date,
                "remarks": remarks,
                "storage_bucket": viewer_file["storage_bucket"],
                "storage_path": viewer_file["storage_path"],
                "original_filename": upload.filename or generated,
                "generated_filename": generated,
                "mime_type": viewer_file["mime_type"],
                "size_bytes": viewer_file["size_bytes"],
                "sha256_hash": digest,
                "uploaded_by": actor_user_id,
                "uploaded_by_org": actor_org,
                "is_current": True,
                "viewer_file_id": viewer_result["file_id"],
                "viewer_version_id": viewer_result["version_id"],
            }
        )
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(500, "Could not create the internal version record.")
    return rows[0]


def _hydrate_documents(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not rows:
        return []
    ids = [row["id"] for row in rows]
    versions = (
        db().table("internal_document_versions")
        .select("*")
        .in_("internal_document_id", ids)
        .order("version_number", desc=True)
        .execute()
        .data
        or []
    )
    comments = (
        db().table("review_comments")
        .select("internal_document_id,status")
        .in_("internal_document_id", ids)
        .execute()
        .data
        or []
    )
    version_map: dict[int, list[dict[str, Any]]] = {}
    for version in versions:
        version_map.setdefault(int(version["internal_document_id"]), []).append(version)
    counts: dict[int, dict[str, int]] = {}
    for comment in comments:
        document_id = int(comment.get("internal_document_id") or 0)
        bucket = counts.setdefault(document_id, {"open": 0, "resolved": 0})
        if comment.get("status") == "resolved":
            bucket["resolved"] += 1
        else:
            bucket["open"] += 1
    for row in rows:
        document_id = int(row["id"])
        row["versions"] = version_map.get(document_id, [])
        row["current_version"] = row["versions"][0] if row["versions"] else None
        row["comment_counts"] = counts.get(document_id, {"open": 0, "resolved": 0})
    return rows


@router.get("/dashboard")
def dashboard(project_id: int) -> dict[str, Any]:
    documents = list_documents(project_id)
    comments = (
        db().table("review_comments")
        .select("status,internal_document_id")
        .eq("project_id", project_id)
        .not_.is_("internal_document_id", "null")
        .execute()
        .data
        or []
    )
    packages = (
        db().table("internal_response_packages")
        .select("status,submitted_at")
        .eq("project_id", project_id)
        .execute()
        .data
        or []
    )

    status_counts: dict[str, int] = {}
    discipline_counts: dict[str, int] = {}
    for document in documents:
        status_counts[document["status"]] = status_counts.get(document["status"], 0) + 1
        discipline = document.get("discipline") or "Unspecified"
        discipline_counts[discipline] = discipline_counts.get(discipline, 0) + 1

    open_comments = sum(1 for row in comments if row.get("status") != "resolved")
    resolved_comments = sum(1 for row in comments if row.get("status") == "resolved")
    return {
        "kpis": {
            "total_documents": len(documents),
            "waiting_contractor": status_counts.get("waiting_contractor_review", 0),
            "waiting_consultant": status_counts.get("waiting_consultant_response", 0)
            + status_counts.get("consultant_responding", 0),
            "waiting_verification": status_counts.get("waiting_contractor_verification", 0),
            "ready_external": status_counts.get("ready_for_external_submission", 0),
            "open_comments": open_comments,
            "resolved_comments": resolved_comments,
            "submitted_packages": sum(1 for row in packages if row.get("status") == "submitted"),
        },
        "status_counts": status_counts,
        "discipline_counts": discipline_counts,
        "recent_documents": documents[:8],
    }


@router.get("/documents")
def list_documents(project_id: int, status: str | None = None, discipline: str | None = None):
    query = db().table("internal_documents").select("*").eq("project_id", project_id)
    if status:
        query = query.eq("status", status)
    if discipline:
        query = query.eq("discipline", discipline)
    rows = query.order("updated_at", desc=True).execute().data or []
    return _hydrate_documents(rows)


@router.post("/documents")
async def create_document(
    file: UploadFile = File(...),
    project_id: int = Form(...),
    document_number: str = Form(...),
    document_title: str = Form(...),
    discipline: str = Form(...),
    version_number: int = Form(0),
    revision_date: str = Form(...),
    remarks: str = Form(""),
    assigned_contractor_id: str | None = Form(None),
    assigned_consultant_id: str | None = Form(None),
    parent_document_id: int | None = Form(None),
    actor_user_id: str = Form(...),
):
    document_number = document_number.strip()
    document_title = document_title.strip()
    discipline = discipline.strip()
    if not document_number or not document_title or not discipline:
        raise HTTPException(422, "Document number, title and discipline are required.")

    client = db()
    inserted = (
        client.table("internal_documents")
        .insert(
            {
                "project_id": project_id,
                "document_number": document_number,
                "document_title": document_title,
                "discipline": discipline,
                "parent_document_id": parent_document_id,
                "assigned_contractor_id": assigned_contractor_id,
                "assigned_consultant_id": assigned_consultant_id or actor_user_id,
                "status": "waiting_contractor_review",
                "current_version_number": version_number,
                "created_by": actor_user_id,
            }
        )
        .execute()
        .data
        or []
    )
    if not inserted:
        raise HTTPException(500, "Could not create the internal document.")
    document = inserted[0]
    content = await file.read()
    version = _upload_version_file(
        project_id=project_id,
        internal_document_id=int(document["id"]),
        document_number=document_number,
        version_number=version_number,
        revision_date=revision_date,
        remarks=remarks,
        actor_user_id=actor_user_id,
        actor_org="consultant",
        upload=file,
        content=content,
    )

    recipients = [assigned_contractor_id] if assigned_contractor_id else CONTRACTOR_TEST_USERS
    NotificationService().notify_users(
        project_id,
        [recipient for recipient in recipients if recipient],
        "internal_document_uploaded",
        f"{document_number} {version['version_label']} is ready for review",
        f"{document_title} was uploaded by the consultant.",
        "internal_version",
        str(version["id"]),
        actor_user_id,
    )
    return {**document, "current_version": version}


@router.post("/documents/{internal_document_id}/versions")
async def upload_version(
    internal_document_id: int,
    file: UploadFile = File(...),
    revision_date: str = Form(...),
    remarks: str = Form(""),
    version_number: int | None = Form(None),
    actor_user_id: str = Form(...),
):
    client = db()
    rows = (
        client.table("internal_documents")
        .select("*")
        .eq("id", internal_document_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(404, "Internal document not found.")
    document = rows[0]
    next_number = (
        int(version_number)
        if version_number is not None
        else int(document.get("current_version_number") or 0) + 1
    )
    content = await file.read()
    version = _upload_version_file(
        project_id=int(document["project_id"]),
        internal_document_id=internal_document_id,
        document_number=document["document_number"],
        version_number=next_number,
        revision_date=revision_date,
        remarks=remarks,
        actor_user_id=actor_user_id,
        actor_org="consultant",
        upload=file,
        content=content,
    )
    client.table("internal_documents").update(
        {
            "current_version_number": next_number,
            "status": "waiting_contractor_review",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", internal_document_id).execute()

    contractor = document.get("assigned_contractor_id")
    recipients = [contractor] if contractor else CONTRACTOR_TEST_USERS
    NotificationService().notify_users(
        int(document["project_id"]),
        [recipient for recipient in recipients if recipient],
        "internal_version_uploaded",
        f"{document['document_number']} V{next_number} uploaded",
        "A clean updated version is ready for contractor review. Old annotations are not rendered on it.",
        "internal_version",
        str(version["id"]),
        actor_user_id,
    )
    return version


@router.get("/documents/{internal_document_id}/versions")
def list_versions(internal_document_id: int):
    return (
        db().table("internal_document_versions")
        .select("*")
        .eq("internal_document_id", internal_document_id)
        .order("version_number", desc=True)
        .execute()
        .data
        or []
    )


@router.get("/versions/{version_id}/signed-url")
def version_signed_url(version_id: str):
    rows = (
        db().table("internal_document_versions")
        .select("*")
        .eq("id", version_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(404, "Internal version not found.")
    version = rows[0]
    signed = db().storage.from_(version["storage_bucket"]).create_signed_url(
        version["storage_path"], 900
    )
    return {**version, "signed_url": signed.get("signedURL") or signed.get("signed_url")}


@router.get("/comments")
def internal_comments(
    project_id: int,
    internal_document_id: int | None = None,
    internal_version_id: str | None = None,
    assigned_to: str | None = None,
):
    query = db().table("review_comments").select("*").eq("project_id", project_id)
    query = query.not_.is_("internal_document_id", "null")
    if internal_document_id is not None:
        query = query.eq("internal_document_id", internal_document_id)
    if internal_version_id:
        query = query.eq("internal_version_id", internal_version_id)
    if assigned_to:
        query = query.eq("assigned_to", assigned_to)
    rows = query.order("raised_at").execute().data or []
    if not rows:
        return []
    ids = [row["id"] for row in rows]
    responses = (
        db().table("review_comment_responses")
        .select("*")
        .in_("comment_id", ids)
        .order("created_at")
        .execute()
        .data
        or []
    )
    grouped: dict[str, list[dict[str, Any]]] = {}
    for response in responses:
        grouped.setdefault(str(response["comment_id"]), []).append(response)
    for row in rows:
        row["responses"] = grouped.get(str(row["id"]), [])
    return rows


@router.get("/packages")
def list_packages(project_id: int, internal_document_id: int | None = None):
    query = db().table("internal_response_packages").select("*").eq("project_id", project_id)
    if internal_document_id is not None:
        query = query.eq("internal_document_id", internal_document_id)
    rows = query.order("submitted_at", desc=True).execute().data or []
    if not rows:
        return []
    ids = [row["id"] for row in rows]
    items = db().table("internal_response_package_items").select("*").in_("package_id", ids).execute().data or []
    grouped: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        grouped.setdefault(str(item["package_id"]), []).append(item)
    for row in rows:
        row["items"] = grouped.get(str(row["id"]), [])
    return rows


class PackageAccept(BaseModel):
    actor_user_id: str
    remarks: str = "Accepted by contractor."


@router.post("/packages/submit")
async def submit_response_package(
    project_id: int = Form(...),
    internal_document_id: int = Form(...),
    source_version_id: str = Form(...),
    responses_json: str = Form(...),
    package_remarks: str = Form(""),
    revision_date: str | None = Form(None),
    version_number: int | None = Form(None),
    actor_user_id: str = Form(...),
    revised_file: UploadFile | None = File(None),
):
    try:
        responses = json.loads(responses_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(422, "responses_json must be valid JSON.") from exc
    if not isinstance(responses, dict) or not responses:
        raise HTTPException(422, "Add a response for at least one CRS comment.")

    client = db()
    document_rows = (
        client.table("internal_documents")
        .select("*")
        .eq("id", internal_document_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not document_rows:
        raise HTTPException(404, "Internal document not found.")
    document = document_rows[0]

    comment_ids = list(responses.keys())
    comments = (
        client.table("review_comments")
        .select("*")
        .in_("id", comment_ids)
        .eq("internal_document_id", internal_document_id)
        .execute()
        .data
        or []
    )
    if len(comments) != len(comment_ids):
        raise HTTPException(422, "One or more comments do not belong to this internal document.")

    missing = [comment["comment_code"] for comment in comments if not str(responses.get(comment["id"], "")).strip()]
    if missing:
        raise HTTPException(422, f"Responses are required for: {', '.join(missing)}")

    submitted_version = None
    closure_method = "comment_only"
    closure_remarks = "Closed with comment."
    if revised_file is not None and revised_file.filename:
        if not revision_date:
            raise HTTPException(422, "Revision date is required when uploading an updated file.")
        next_number = (
            int(version_number)
            if version_number is not None
            else int(document.get("current_version_number") or 0) + 1
        )
        content = await revised_file.read()
        submitted_version = _upload_version_file(
            project_id=project_id,
            internal_document_id=internal_document_id,
            document_number=document["document_number"],
            version_number=next_number,
            revision_date=revision_date,
            remarks=package_remarks,
            actor_user_id=actor_user_id,
            actor_org="consultant",
            upload=revised_file,
            content=content,
        )
        closure_method = "updated_file"
        closure_remarks = f"Closed with uploading of file {submitted_version['version_label']}."
        client.table("internal_documents").update(
            {"current_version_number": next_number}
        ).eq("id", internal_document_id).execute()

    existing = (
        client.table("internal_response_packages")
        .select("package_number")
        .eq("internal_document_id", internal_document_id)
        .order("package_number", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    package_number = int(existing[0]["package_number"]) + 1 if existing else 1
    package_rows = (
        client.table("internal_response_packages")
        .insert(
            {
                "project_id": project_id,
                "internal_document_id": internal_document_id,
                "source_version_id": source_version_id,
                "submitted_version_id": submitted_version["id"] if submitted_version else None,
                "package_number": package_number,
                "status": "submitted",
                "closure_method": closure_method,
                "closure_remarks": closure_remarks,
                "package_remarks": package_remarks,
                "submitted_by": actor_user_id,
            }
        )
        .execute()
        .data
        or []
    )
    if not package_rows:
        raise HTTPException(500, "Could not create the response package.")
    package = package_rows[0]

    for comment in comments:
        response_text = str(responses[comment["id"]]).strip()
        response_row = (
            client.table("review_comment_responses")
            .insert(
                {
                    "comment_id": comment["id"],
                    "response_type": "reply",
                    "response_text": response_text,
                    "created_by": actor_user_id,
                    "created_by_org": "consultant",
                }
            )
            .execute()
            .data[0]
        )
        client.table("internal_response_package_items").insert(
            {
                "package_id": package["id"],
                "comment_id": comment["id"],
                "response_id": response_row["id"],
            }
        ).execute()
        client.table("review_comments").update(
            {
                "status": "awaiting_verification",
                "closure_remarks": closure_remarks,
                "response_package_id": package["id"],
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", comment["id"]).execute()

    client.table("internal_documents").update(
        {
            "status": "waiting_contractor_verification",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", internal_document_id).execute()

    contractor = document.get("assigned_contractor_id")
    recipients = [contractor] if contractor else CONTRACTOR_TEST_USERS
    NotificationService().notify_users(
        project_id,
        [recipient for recipient in recipients if recipient],
        "response_package_submitted",
        f"Package {package_number} submitted for {document['document_number']}",
        closure_remarks,
        "response_package",
        str(package["id"]),
        actor_user_id,
    )
    return {**package, "submitted_version": submitted_version}


@router.post("/packages/{package_id}/accept")
def accept_package(package_id: str, payload: PackageAccept):
    client = db()
    package_rows = (
        client.table("internal_response_packages")
        .select("*")
        .eq("id", package_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not package_rows:
        raise HTTPException(404, "Response package not found.")
    package = package_rows[0]
    items = (
        client.table("internal_response_package_items")
        .select("comment_id")
        .eq("package_id", package_id)
        .execute()
        .data
        or []
    )
    now = datetime.now(timezone.utc).isoformat()
    for item in items:
        client.table("review_comments").update(
            {
                "status": "resolved",
                "resolved_by": payload.actor_user_id,
                "resolved_at": now,
                "updated_at": now,
            }
        ).eq("id", item["comment_id"]).execute()
    client.table("internal_response_packages").update(
        {
            "status": "accepted",
            "accepted_by": payload.actor_user_id,
            "accepted_at": now,
        }
    ).eq("id", package_id).execute()
    client.table("internal_documents").update(
        {
            "status": "ready_for_external_submission",
            "updated_at": now,
        }
    ).eq("id", package["internal_document_id"]).execute()
    return {"ok": True, "resolved_comments": len(items)}


class PromotePayload(BaseModel):
    actor_user_id: str


@router.post("/documents/{internal_document_id}/send-to-external")
def send_to_external(internal_document_id: int, payload: PromotePayload):
    client = db()
    documents = (
        client.table("internal_documents")
        .select("*")
        .eq("id", internal_document_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not documents:
        raise HTTPException(404, "Internal document not found.")
    document = documents[0]
    if document.get("status") != "ready_for_external_submission":
        raise HTTPException(409, "The internal document is not ready for external submission.")
    versions = (
        client.table("internal_document_versions")
        .select("*")
        .eq("internal_document_id", internal_document_id)
        .eq("is_current", True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not versions:
        raise HTTPException(409, "No current internal version is available.")
    version = versions[0]
    queue_rows = (
        client.table("external_submission_queue")
        .upsert(
            {
                "project_id": document["project_id"],
                "internal_document_id": internal_document_id,
                "internal_version_id": version["id"],
                "status": "ready",
                "requested_by": payload.actor_user_id,
            },
            on_conflict="internal_document_id,internal_version_id",
        )
        .execute()
        .data
        or []
    )
    client.table("internal_documents").update(
        {"status": "sent_to_external_dci", "updated_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", internal_document_id).execute()
    return queue_rows[0] if queue_rows else {"ok": True}
