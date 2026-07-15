from fastapi import APIRouter
from pydantic import BaseModel
from services.task_service import TaskService

router = APIRouter()

class CreateTaskPayload(BaseModel):
    project_id: int
    title: str
    description: str = ""
    priority: str = "normal"
    task_type: str = "general"
    actor_user_id: str

class UpdateTaskPayload(BaseModel):
    status: str | None = None
    priority: str | None = None
    actor_user_id: str | None = None

@router.get("/")
def list_tasks(project_id: int = 1):
    svc = TaskService()
    return svc.list_board(project_id)

@router.post("/")
def create_task(payload: CreateTaskPayload):
    svc = TaskService()
    return svc.create_task(
        project_id=payload.project_id,
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        task_type=payload.task_type,
        actor_user_id=payload.actor_user_id
    )

@router.patch("/{task_id}")
def update_task(task_id: str, payload: UpdateTaskPayload):
    svc = TaskService()
    changes = {k: v for k, v in payload.model_dump().items() if v is not None and k != "actor_user_id"}
    return svc.update_task(task_id, 0, changes, payload.actor_user_id or "system")
