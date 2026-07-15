from repositories.db import get_collab_db_client

class AnnotationRepository:
    def __init__(self):
        self.supabase = get_collab_db_client()

    def list_annotations(self, file_id: str, include_resolved: bool = True) -> list:
        """Fetch all non-deleted annotations for a document file."""
        query = (
            self.supabase.table("document_annotations")
            .select("*")
            .eq("document_file_id", file_id)
            .eq("is_deleted", False)
        )
        if not include_resolved:
            query = query.neq("status", "resolved")
        res = query.order("created_at", desc=False).execute()
        return res.data or []

    def get_annotation_by_id(self, annotation_id: str) -> dict | None:
        res = (
            self.supabase.table("document_annotations")
            .select("*")
            .eq("id", annotation_id)
            .execute()
        )
        return res.data[0] if res.data else None

    def create_annotation(self, project_id: int, document_id: int, version_id: str,
                          file_id: str, page_number: int, annotation_type: str,
                          geometry: dict, comment_text: str, created_by: str,
                          style: dict = None, severity: str = "normal") -> dict:
        row = {
            "project_id": project_id,
            "document_id": document_id,
            "version_id": version_id,
            "document_file_id": file_id,
            "page_number": page_number,
            "annotation_type": annotation_type,
            "geometry": geometry,
            "style": style or {},
            "comment_text": comment_text,
            "status": "open",
            "severity": severity,
            "created_by": created_by,
            "row_version": 1
        }
        res = self.supabase.table("document_annotations").insert(row).execute()
        if not res.data:
            raise RuntimeError("Failed to create document annotation.")
        return res.data[0]

    def update_annotation(self, annotation_id: str, expected_row_version: int,
                          changes: dict, updated_by: str) -> dict:
        row = {**changes, "row_version": expected_row_version + 1, "updated_by": updated_by}
        res = (
            self.supabase.table("document_annotations")
            .update(row)
            .eq("id", annotation_id)
            .eq("row_version", expected_row_version)
            .execute()
        )
        if not res.data:
            raise RuntimeError("Conflict: annotation was modified by another user or does not exist.")
        return res.data[0]

    def resolve_annotation(self, annotation_id: str, resolution_note: str, resolved_by: str) -> dict:
        row = {"status": "resolved", "resolved_by": resolved_by,
               "resolved_at": "now()", "resolution_note": resolution_note}
        res = self.supabase.table("document_annotations").update(row).eq("id", annotation_id).execute()
        if not res.data:
            raise RuntimeError("Failed to resolve annotation.")
        return res.data[0]

    def reopen_annotation(self, annotation_id: str, reopened_by: str) -> dict:
        row = {"status": "reopened", "resolved_by": None, "resolved_at": None,
               "resolution_note": None, "updated_by": reopened_by}
        res = self.supabase.table("document_annotations").update(row).eq("id", annotation_id).execute()
        if not res.data:
            raise RuntimeError("Failed to reopen annotation.")
        return res.data[0]

    def delete_annotation(self, annotation_id: str, deleted_by: str) -> dict:
        row = {"is_deleted": True, "deleted_by": deleted_by, "deleted_at": "now()"}
        res = self.supabase.table("document_annotations").update(row).eq("id", annotation_id).execute()
        if not res.data:
            raise RuntimeError("Failed to delete annotation.")
        return res.data[0]

    # ── Replies ──────────────────────────────────────────────────────────────

    def create_reply(self, annotation_id: str, project_id: int, reply_text: str, created_by: str) -> dict:
        row = {"annotation_id": annotation_id, "project_id": project_id,
               "reply_text": reply_text, "created_by": created_by}
        res = self.supabase.table("annotation_replies").insert(row).execute()
        if not res.data:
            raise RuntimeError("Failed to create annotation reply.")
        return res.data[0]

    def list_replies(self, annotation_id: str) -> list:
        res = (
            self.supabase.table("annotation_replies")
            .select("*")
            .eq("annotation_id", annotation_id)
            .eq("is_deleted", False)
            .order("created_at", desc=False)
            .execute()
        )
        return res.data or []

    def delete_reply(self, reply_id: str) -> dict:
        row = {"is_deleted": True, "deleted_at": "now()"}
        res = self.supabase.table("annotation_replies").update(row).eq("id", reply_id).execute()
        if not res.data:
            raise RuntimeError("Failed to delete reply.")
        return res.data[0]

    # ── Mentions ─────────────────────────────────────────────────────────────

    def create_mention(self, annotation_id: str = None, reply_id: str = None,
                       mentioned_user_id: str = None, mentioned_by: str = None) -> dict:
        row = {"annotation_id": annotation_id, "reply_id": reply_id,
               "mentioned_user_id": mentioned_user_id, "mentioned_by": mentioned_by}
        res = self.supabase.table("annotation_mentions").insert(row).execute()
        if not res.data:
            raise RuntimeError("Failed to create mention record.")
        return res.data[0]
