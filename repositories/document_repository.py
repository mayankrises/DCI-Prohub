from __future__ import annotations

from repositories.db import get_collab_db_client


class DocumentRepository:
    def __init__(self):
        self.supabase = get_collab_db_client()

    def get_current_version(self, document_id: int) -> dict | None:
        result = self.supabase.table("document_versions").select("*").eq("document_id", document_id).eq("is_current", True).limit(1).execute()
        return result.data[0] if result.data else None

    def get_version_by_id(self, version_id: str) -> dict | None:
        result = self.supabase.table("document_versions").select("*").eq("id", version_id).limit(1).execute()
        return result.data[0] if result.data else None

    def get_current_file(self, document_id: int) -> dict | None:
        result = self.supabase.table("document_files").select("*").eq("document_id", document_id).eq("is_current", True).eq("is_deleted", False).limit(1).execute()
        return result.data[0] if result.data else None

    def get_file_by_id(self, file_id: str) -> dict | None:
        result = self.supabase.table("document_files").select("*").eq("id", file_id).eq("is_deleted", False).limit(1).execute()
        return result.data[0] if result.data else None

    def create_version(
        self,
        project_id: int,
        document_id: int,
        version_number: int,
        revision_label: str | None = None,
        created_by: str | None = None,
        notes: str | None = None,
    ) -> dict:
        self.supabase.table("document_versions").update({"is_current": False}).eq("document_id", document_id).execute()
        result = self.supabase.table("document_versions").insert({
            "project_id": project_id,
            "document_id": document_id,
            "version_number": version_number,
            "revision_label": revision_label,
            "version_status": "active",
            "created_by": created_by,
            "is_current": True,
            "notes": notes,
        }).execute()
        if not result.data:
            raise RuntimeError("Failed to create document version record.")
        return result.data[0]

    def create_file(self, **values) -> dict:
        document_id = values["document_id"]
        self.supabase.table("document_files").update({"is_current": False}).eq("document_id", document_id).execute()
        row = {
            "project_id": values["project_id"],
            "document_id": document_id,
            "version_id": values["version_id"],
            "storage_bucket": values.get("storage_bucket", "project-documents"),
            "storage_path": values["storage_path"],
            "original_filename": values["original_filename"],
            "display_filename": values["display_filename"],
            "mime_type": values["mime_type"],
            "file_extension": values.get("file_extension"),
            "size_bytes": values["size_bytes"],
            "sha256_hash": values["sha256_hash"],
            "page_count": values.get("page_count"),
            "image_width": values.get("image_width"),
            "image_height": values.get("image_height"),
            "uploaded_by": values.get("uploaded_by"),
            "is_current": True,
            "is_deleted": False,
            "metadata": values.get("metadata") or {},
        }
        result = self.supabase.table("document_files").insert(row).execute()
        if not result.data:
            raise RuntimeError("Failed to create document file record.")
        return result.data[0]

    def check_duplicate_hash(self, project_id: int, sha256_hash: str) -> dict | None:
        result = self.supabase.table("document_files").select("*").eq("project_id", project_id).eq("sha256_hash", sha256_hash).eq("is_deleted", False).limit(1).execute()
        return result.data[0] if result.data else None

    def list_files_for_project(self, project_id: int) -> list[dict]:
        result = self.supabase.table("document_files").select("*").eq("project_id", project_id).eq("is_current", True).eq("is_deleted", False).order("uploaded_at", desc=True).execute()
        return result.data or []

    # Backward-compatible alias used by the old router.
    def list_files_by_project(self, project_id: int) -> list[dict]:
        return self.list_files_for_project(project_id)

    def get_versions_by_document(self, document_id: int) -> list[dict]:
        result = self.supabase.table("document_versions").select("*").eq("document_id", document_id).order("version_number", desc=True).execute()
        return result.data or []

    def get_files_by_version(self, version_id: str) -> list[dict]:
        result = self.supabase.table("document_files").select("*").eq("version_id", version_id).eq("is_deleted", False).execute()
        return result.data or []
