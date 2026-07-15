from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from services.task_service import TaskService

router = APIRouter()


class CreateTaskPayload(BaseModel):
    project_id: int
    title: str = Field(min_length=1)
    description: str = ""
    priority: str = "normal"
    task_type: str = "general"
    actor_user_id: str
    document_id: int | None = None
    annotation_id: str | None = None


class UpdateTaskPayload(BaseModel):
    status: str | None = None
    priority: str | None = None
    title: str | None = None
    description: str | None = None
    actor_user_id: str = "system"
    row_version: int | None = None


@router.get("")
@router.get("/")
def list_tasks(project_id: int) -> list[dict]:
    return TaskService().list_board(project_id)


@router.post("")
@router.post("/")
def create_task(payload: CreateTaskPayload) -> dict:
    return TaskService().create_task(**payload.model_dump())


@router.patch("/{task_id}")
def update_task(task_id: str, payload: UpdateTaskPayload) -> dict:
    values = payload.model_dump(exclude_none=True)
    actor = values.pop("actor_user_id", "system")
    expected = values.pop("row_version", None)
    return TaskService().update_task(task_id, values, actor, expected)
