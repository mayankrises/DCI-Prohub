from repositories.db import get_collab_db_client
from datetime import datetime, timezone, timedelta

class LockRepository:
    def __init__(self):
        self.supabase = get_collab_db_client()

    def acquire_lock(self, file_id: str, user_id: str, lease_seconds: int = 120) -> dict:
        """Call the PostgreSQL RPC function to acquire/renew the lock atomically."""
        res = self.supabase.rpc("acquire_document_lock", {
            "p_document_file_id": file_id,
            "p_user_id": user_id,
            "p_lease_seconds": lease_seconds
        }).execute()
        if not res.data:
            raise RuntimeError("acquire_document_lock RPC did not return a value.")
        return res.data

    def heartbeat(self, lock_id: str, lock_token: str, user_id: str, lease_seconds: int = 120) -> dict | None:
        """Extend the lock lease."""
        new_expiry = (datetime.now(timezone.utc) + timedelta(seconds=lease_seconds)).isoformat()
        now = datetime.now(timezone.utc).isoformat()
        res = (
            self.supabase.table("document_locks")
            .update({"heartbeat_at": now, "expires_at": new_expiry})
            .eq("id", lock_id)
            .eq("lock_token", lock_token)
            .eq("locked_by", user_id)
            .eq("is_active", True)
            .execute()
        )
        return res.data[0] if res.data else None

    def release_lock(self, lock_id: str, lock_token: str, user_id: str, reason: str = "released") -> dict | None:
        """Release the lock voluntarily."""
        now = datetime.now(timezone.utc).isoformat()
        res = (
            self.supabase.table("document_locks")
            .update({"is_active": False, "released_at": now,
                     "released_by": user_id, "release_reason": reason})
            .eq("id", lock_id)
            .eq("lock_token", lock_token)
            .eq("locked_by", user_id)
            .eq("is_active", True)
            .execute()
        )
        return res.data[0] if res.data else None

    def force_release_lock(self, lock_id: str, reason: str, actor_user_id: str) -> dict | None:
        """Force release a lock by an admin."""
        now = datetime.now(timezone.utc).isoformat()
        res = (
            self.supabase.table("document_locks")
            .update({"is_active": False, "released_at": now,
                     "released_by": actor_user_id, "release_reason": f"forced: {reason}"})
            .eq("id", lock_id)
            .eq("is_active", True)
            .execute()
        )
        return res.data[0] if res.data else None

    def get_active_lock_for_file(self, file_id: str) -> dict | None:
        """Check for an active non-expired lock, auto-expiring stale ones."""
        now = datetime.now(timezone.utc).isoformat()
        # Expire stale locks first
        self.supabase.table("document_locks") \
            .update({"is_active": False, "release_reason": "expired"}) \
            .eq("document_file_id", file_id) \
            .eq("is_active", True) \
            .lte("expires_at", now) \
            .execute()
        res = (
            self.supabase.table("document_locks")
            .select("*")
            .eq("document_file_id", file_id)
            .eq("is_active", True)
            .execute()
        )
        return res.data[0] if res.data else None
