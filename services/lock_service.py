from repositories.lock_repository import LockRepository
from services.auth_service import MOCK_USERS
from repositories.db import get_collab_db_client
from datetime import datetime, timezone

class LockService:
    def __init__(self):
        self.repo = LockRepository()
        self.supabase = get_collab_db_client()

    def acquire_lock(self, file_id: str, actor_user_id: str) -> dict:
        """Attempt to acquire or renew a lock lease."""
        res = self.repo.acquire_lock(file_id, actor_user_id, lease_seconds=120)
        action = "lock_acquired" if (isinstance(res, dict) and res.get("acquired")) else "lock_denied"
        self._record_audit(file_id, action, actor_user_id)
        return res

    def heartbeat(self, lock_id: str, lock_token: str, actor_user_id: str) -> dict:
        """Send a heartbeat renewal signal to maintain the lease."""
        res = self.repo.heartbeat(lock_id, lock_token, actor_user_id, lease_seconds=120)
        if not res:
            raise PermissionError("Lock lease could not be renewed. It may have expired or been taken over.")
        return res

    def release_lock(self, lock_id: str, lock_token: str, actor_user_id: str) -> None:
        """Release the lease voluntarily."""
        res = self.supabase.table("document_locks").select("document_file_id").eq("id", lock_id).execute()
        self.repo.release_lock(lock_id, lock_token, actor_user_id)
        if res.data:
            self._record_audit(res.data[0]["document_file_id"], "lock_released", actor_user_id)

    def force_release(self, lock_id: str, reason: str, actor_user_id: str) -> None:
        """Force release a lock by an administrator."""
        res = self.supabase.table("document_locks").select("document_file_id").eq("id", lock_id).execute()
        self.repo.force_release_lock(lock_id, reason, actor_user_id)
        if res.data:
            file_id = res.data[0]["document_file_id"]
            self._record_audit(file_id, "lock_force_released", actor_user_id)
            try:
                self.supabase.table("notifications").insert({
                    "notification_type": "lock_force_released",
                    "title": "Document Lock Released",
                    "message": f"Lock released: {reason}",
                    "entity_type": "document_file",
                    "entity_id": file_id,
                    "created_by": actor_user_id
                }).execute()
            except Exception:
                pass

    def get_lock_status_payload(self, file_id: str, current_user_id: str) -> dict:
        """Retrieve active lock status for the viewer banner."""
        lock = self.repo.get_active_lock_for_file(file_id)
        if not lock:
            return {"is_locked": False, "owner_name": None, "expired": False, "is_owner": False}

        now = datetime.now(timezone.utc)
        expires_at = datetime.fromisoformat(lock["expires_at"].replace("Z", "+00:00"))
        expired = expires_at <= now
        is_owner = str(lock["locked_by"]) == str(current_user_id)

        owner_name = "Unknown User"
        for u in MOCK_USERS:
            if str(u["id"]) == str(lock["locked_by"]):
                owner_name = u["name"]
                break

        return {
            "is_locked": True,
            "lock_id": lock["id"],
            "lock_token": str(lock["lock_token"]),
            "owner_id": str(lock["locked_by"]),
            "owner_name": owner_name,
            "expired": expired,
            "is_owner": is_owner
        }

    def _record_audit(self, file_id: str, action: str, actor_user_id: str):
        try:
            res = self.supabase.table("document_files").select("project_id").eq("id", file_id).execute()
            if res.data:
                self.supabase.table("collaboration_audit_events").insert({
                    "project_id": res.data[0]["project_id"],
                    "entity_type": "document_file",
                    "entity_id": file_id,
                    "action": action,
                    "actor_user_id": actor_user_id
                }).execute()
        except Exception:
            pass
