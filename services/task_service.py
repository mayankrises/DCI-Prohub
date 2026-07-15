from __future__ import annotations

from datetime import datetime, timezone

from repositories.db import get_collab_db_client

ALLOWED_STATUSES = {"unassigned", "assigned", "in_review", "completed"}
ALLOWED_PRIORITIES = {"low", "normal", "high", "critical"}


class TaskService:
    def __init__(self):
        self.supabase = get_collab_db_client()

    def create_task(
        self,
        project_id: int,
        title: str,
        description: str | None = None,
        priority: str = "normal",
        task_type: str = "general",
        document_id: int | None = None,
        version_id: str | None = None,
        annotation_id: str | None = None,
        actor_user_id: str | None = None,
    ) -> dict:
        if not title.strip():
            raise ValueError("Task title is required.")
        if priority not in ALLOWED_PRIORITIES:
            raise ValueError("Invalid task priority.")
        result = self.supabase.table("tasks").insert({
            "project_id": project_id,
            "title": title.strip(),
            "description": description or "",
            "priority": priority,
            "task_type": task_type,
            "status": "unassigned",
            "document_id": document_id,
            "version_id": version_id,
            "annotation_id": annotation_id,
            "created_by": actor_user_id,
            "row_version": 1,
        }).execute()
        if not result.data:
            raise RuntimeError("Failed to create task.")
        task = result.data[0]
        self._record_activity(task["id"], project_id, "created", "Task created", actor_user_id or "system")
        return task

    def update_task(self, task_id: str, changes: dict, actor_user_id: str, expected_row_version: int | None = None) -> dict:
        result = self.supabase.table("tasks").select("*").eq("id", task_id).limit(1).execute()
        if not result.data:
            raise ValueError("Task not found.")
        current = result.data[0]
        current_version = int(current.get("row_version") or 1)
        if expected_row_version is not None and expected_row_version != current_version:
            raise RuntimeError("Conflict: this task was changed by another user.")
        if "status" in changes and changes["status"] not in ALLOWED_STATUSES:
            raise ValueError("Invalid task status.")
        if "priority" in changes and changes["priority"] not in ALLOWED_PRIORITIES:
            raise ValueError("Invalid task priority.")

        row = {
            **changes,
            "row_version": current_version + 1,
            "updated_by": actor_user_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if changes.get("status") == "completed":
            row["completed_at"] = datetime.now(timezone.utc).isoformat()
        elif "status" in changes:
            row["completed_at"] = None
        updated = self.supabase.table("tasks").update(row).eq("id", task_id).eq("row_version", current_version).execute()
        if not updated.data:
            raise RuntimeError("Task update conflict. Refresh and try again.")
        for field, value in changes.items():
            if current.get(field) != value:
                self._record_activity(
                    task_id,
                    current["project_id"],
                    "field_updated",
                    f"Updated {field}",
                    actor_user_id,
                    field,
                    str(current.get(field)),
                    str(value),
                )
        return updated.data[0]

    def list_board(self, project_id: int) -> list[dict]:
        result = self.supabase.table("tasks").select("*, task_assignees(*)").eq("project_id", project_id).eq("is_deleted", False).order("created_at", desc=True).execute()
        return result.data or []

    def _record_activity(
        self,
        task_id: str,
        project_id: int,
        activity_type: str,
        message: str,
        actor_user_id: str,
        field_name: str | None = None,
        old_value: str | None = None,
        new_value: str | None = None,
    ) -> None:
        try:
            self.supabase.table("task_activity").insert({
                "task_id": task_id,
                "project_id": project_id,
                "activity_type": activity_type,
                "field_name": field_name,
                "old_value": old_value,
                "new_value": new_value,
                "message": message,
                "performed_by": actor_user_id,
            }).execute()
        except Exception:
            pass
