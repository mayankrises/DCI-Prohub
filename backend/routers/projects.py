from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from repositories.db import get_db_client

router = APIRouter()


class ProjectCreate(BaseModel):
    project_name: str = Field(min_length=1, max_length=200)
    contractor: str = ""
    client: str = ""
    review_period_days: int = Field(default=21, ge=1, le=90)


class ProjectUpdate(BaseModel):
    project_name: str | None = Field(default=None, min_length=1, max_length=200)
    contractor: str | None = None
    client: str | None = None
    review_period_days: int | None = Field(default=None, ge=1, le=90)
    is_active: bool | None = None


def _attach_import_summary(projects: list[dict]) -> list[dict]:
    if not projects:
        return []
    client = get_db_client()
    project_ids = [project["id"] for project in projects]
    response = (
        client.table("imports")
        .select("id,project_id,original_filename,row_count,uploaded_at,version_number,import_status")
        .in_("project_id", project_ids)
        .eq("is_active", True)
        .order("uploaded_at", desc=True)
        .execute()
    )
    latest: dict[int, dict] = {}
    for item in response.data or []:
        latest.setdefault(item["project_id"], item)
    return [{**project, "active_import": latest.get(project["id"])} for project in projects]


@router.get("")
@router.get("/")
def list_projects() -> list[dict]:
    client = get_db_client()
    result = (
        client.table("projects")
        .select("*")
        .eq("is_active", True)
        .order("updated_at", desc=True)
        .execute()
    )
    return _attach_import_summary(result.data or [])


@router.post("")
@router.post("/")
def create_project(payload: ProjectCreate) -> dict:
    client = get_db_client()
    row = payload.model_dump()
    created = client.table("projects").insert(row).execute()
    if not created.data:
        raise HTTPException(status_code=500, detail="Project could not be created.")
    return {**created.data[0], "active_import": None}


@router.get("/{project_id}")
def get_project(project_id: int) -> dict:
    client = get_db_client()
    result = client.table("projects").select("*").eq("id", project_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Project not found.")
    return _attach_import_summary(result.data)[0]


@router.patch("/{project_id}")
def update_project(project_id: int, payload: ProjectUpdate) -> dict:
    changes = payload.model_dump(exclude_none=True)
    if not changes:
        return get_project(project_id)
    client = get_db_client()
    updated = client.table("projects").update(changes).eq("id", project_id).execute()
    if not updated.data:
        raise HTTPException(status_code=404, detail="Project not found.")
    return _attach_import_summary(updated.data)[0]
