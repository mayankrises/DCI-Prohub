from repositories.db import get_collab_db_client
from datetime import datetime, timezone

class TaskService:
    def __init__(self):
        self.supabase = get_collab_db_client()

    def create_task(self, project_id: int, title: str, description: str = None,
                    priority: str = "normal", task_type: str = "general",
                    document_id: int = None, version_id: str = None,
                    annotation_id: str = None, actor_user_id: str = None) -> dict:
        row = {
            "project_id": project_id,
            "title": title,
            "description": description,
            "priority": priority,
            "task_type": task_type,
            "status": "unassigned",
            "document_id": document_id,
            "version_id": version_id,
            "annotation_id": annotation_id,
            "created_by": actor_user_id,
            "row_version": 1
        }
        res = self.supabase.table("tasks").insert(row).execute()
        if not res.data:
            raise RuntimeError("Failed to create task.")
        task = res.data[0]
        self._record_activity(task["id"], project_id, "created", "Task created", actor_user_id)
        return task

    def update_task(self, task_id: str, expected_row_version: int,
                    changes: dict, actor_user_id: str) -> dict:
        res = self.supabase.table("tasks").select("*").eq("id", task_id).execute()
        if not res.data:
            raise ValueError("Task not found.")
        task = res.data[0]
        if task["row_version"] != expected_row_version:
            raise RuntimeError("Conflict: the task was updated by another user.")

        row = {**changes, "row_version": expected_row_version + 1,
               "updated_by": actor_user_id,
               "updated_at": datetime.now(timezone.utc).isoformat()}
        update_res = (
            self.supabase.table("tasks")
            .update(row)
            .eq("id", task_id)
            .eq("row_version", expected_row_version)
            .execute()
        )
        if not update_res.data:
            raise RuntimeError("Failed to update task — conflict or record missing.")
        updated_task = update_res.data[0]

        for field, new_val in changes.items():
            old_val = task.get(field)
            if old_val != new_val:
                self._record_activity(
                    task_id, task["project_id"], "field_updated",
                    f"Updated {field} from '{old_val}' to '{new_val}'",
                    actor_user_id, field_name=field,
                    old_value=str(old_val), new_value=str(new_val)
                )
                if field == "status" and new_val == "completed":
                    self.supabase.table("tasks").update({
                        "completed_at": datetime.now(timezone.utc).isoformat()
                    }).eq("id", task_id).execute()
        return updated_task

    def assign_user(self, task_id: str, user_id: str, is_primary: bool, actor_user_id: str) -> dict:
        res = self.supabase.table("tasks").select("project_id, status").eq("id", task_id).execute()
        if not res.data:
            raise ValueError("Task not found.")
        task = res.data[0]

        if is_primary:
            self.supabase.table("task_assignees").update({"is_primary": False}).eq("task_id", task_id).execute()

        row = {"task_id": task_id, "user_id": user_id, "assignment_type": "user",
               "is_primary": is_primary, "assigned_by": actor_user_id}
        assign_res = self.supabase.table("task_assignees").insert(row).execute()
        if not assign_res.data:
            raise RuntimeError("Failed to assign user.")

        if task["status"] == "unassigned":
            self.supabase.table("tasks").update({"status": "assigned"}).eq("id", task_id).execute()

        self._record_activity(task_id, task["project_id"], "assigned", "Assigned user", actor_user_id)
        self._create_notification(task["project_id"], "task_assigned", "Task Assigned",
                                  f"You have been assigned to a task",
                                  task_id, user_id, actor_user_id)
        return assign_res.data[0]

    def assign_group(self, task_id: str, group_id: str, actor_user_id: str) -> dict:
        res = self.supabase.table("tasks").select("project_id").eq("id", task_id).execute()
        if not res.data:
            raise ValueError("Task not found.")
        task = res.data[0]
        row = {"task_id": task_id, "group_id": group_id, "assignment_type": "group",
               "is_primary": False, "assigned_by": actor_user_id}
        assign_res = self.supabase.table("task_assignees").insert(row).execute()
        if not assign_res.data:
            raise RuntimeError("Failed to assign group.")
        self._record_activity(task_id, task["project_id"], "group_assigned", "Assigned group", actor_user_id)
        return assign_res.data[0]

    def remove_assignee(self, task_id: str, assignee_row_id: str, actor_user_id: str) -> None:
        res = self.supabase.table("tasks").select("project_id").eq("id", task_id).execute()
        if not res.data:
            return
        self.supabase.table("task_assignees").delete().eq("id", assignee_row_id).execute()
        self._record_activity(task_id, res.data[0]["project_id"], "unassigned", "Removed assignee", actor_user_id)

    def list_board(self, project_id: int) -> list:
        res = (
            self.supabase.table("tasks")
            .select("*, task_assignees(*)")
            .eq("project_id", project_id)
            .eq("is_deleted", False)
            .execute()
        )
        return res.data or []

    def get_activity(self, task_id: str) -> list:
        res = (
            self.supabase.table("task_activity")
            .select("*")
            .eq("task_id", task_id)
            .order("performed_at", desc=True)
            .execute()
        )
        return res.data or []

    def _record_activity(self, task_id: str, project_id: int, activity_type: str,
                         message: str, actor_user_id: str, field_name: str = None,
                         old_value: str = None, new_value: str = None):
        try:
            self.supabase.table("task_activity").insert({
                "task_id": task_id, "project_id": project_id,
                "activity_type": activity_type, "field_name": field_name,
                "old_value": old_value, "new_value": new_value,
                "message": message, "performed_by": actor_user_id
            }).execute()
        except Exception:
            pass

    def _create_notification(self, project_id: int, notif_type: str, title: str,
                             message: str, entity_id: str, recipient_user_id: str,
                             actor_user_id: str):
        try:
            res = self.supabase.table("notifications").insert({
                "project_id": project_id, "notification_type": notif_type,
                "title": title, "message": message,
                "entity_type": "task", "entity_id": entity_id,
                "created_by": actor_user_id
            }).execute()
            if res.data:
                self.supabase.table("notification_recipients").insert({
                    "notification_id": res.data[0]["id"],
                    "user_id": recipient_user_id,
                    "in_app_status": "unread"
                }).execute()
        except Exception:
            pass
