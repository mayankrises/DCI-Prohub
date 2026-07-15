from repositories.db import get_collab_db_client
from datetime import datetime, timezone

class NotificationService:
    def __init__(self):
        self.supabase = get_collab_db_client()

    def notify_users(self, project_id: int, user_ids: list[str], notification_type: str,
                     title: str, message: str, entity_type: str = None,
                     entity_id: str = None, actor_user_id: str = None,
                     deduplication_key: str = None) -> dict:
        if not user_ids:
            return {}
        row = {
            "project_id": project_id, "notification_type": notification_type,
            "title": title, "message": message, "entity_type": entity_type,
            "entity_id": entity_id, "created_by": actor_user_id,
            "deduplication_key": deduplication_key
        }
        res = self.supabase.table("notifications").insert(row).execute()
        if not res.data:
            raise RuntimeError("Failed to create notification.")
        notification = res.data[0]
        recipient_rows = [{"notification_id": notification["id"], "user_id": uid,
                           "in_app_status": "unread"} for uid in set(user_ids)]
        self.supabase.table("notification_recipients").insert(recipient_rows).execute()
        return notification

    def notify_group(self, project_id: int, group_id: str, notification_type: str,
                     title: str, message: str, entity_type: str = None,
                     entity_id: str = None, actor_user_id: str = None) -> dict:
        res = (self.supabase.table("project_group_members")
               .select("user_id").eq("group_id", group_id).eq("is_active", True).execute())
        user_ids = [str(m["user_id"]) for m in res.data or []]
        return self.notify_users(project_id, user_ids, notification_type, title, message,
                                 entity_type, entity_id, actor_user_id)

    def list_notifications(self, user_id: str, limit: int = 50) -> list:
        res = (
            self.supabase.table("notification_recipients")
            .select("*, notifications(*)")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        flat_list = []
        for row in res.data or []:
            notif = row.get("notifications") or {}
            flat_list.append({
                "recipient_id": row["id"],
                "notification_id": row["notification_id"],
                "in_app_status": row["in_app_status"],
                "read_at": row["read_at"],
                "title": notif.get("title"),
                "message": notif.get("message"),
                "notification_type": notif.get("notification_type"),
                "entity_type": notif.get("entity_type"),
                "entity_id": notif.get("entity_id"),
                "created_at": row["created_at"]
            })
        return flat_list

    def get_unread_count(self, user_id: str) -> int:
        res = (self.supabase.table("notification_recipients")
               .select("id", count="exact")
               .eq("user_id", user_id)
               .eq("in_app_status", "unread")
               .execute())
        return res.count if res.count is not None else 0

    def mark_read(self, recipient_id: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        self.supabase.table("notification_recipients").update(
            {"in_app_status": "read", "read_at": now}
        ).eq("id", recipient_id).execute()

    def mark_all_read(self, user_id: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        self.supabase.table("notification_recipients").update(
            {"in_app_status": "read", "read_at": now}
        ).eq("user_id", user_id).eq("in_app_status", "unread").execute()
