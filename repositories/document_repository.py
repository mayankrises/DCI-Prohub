from repositories.db import get_collab_db_client

class DocumentRepository:
    def __init__(self):
        self.supabase = get_collab_db_client()

    def get_current_version(self, document_id: int) -> dict | None:
        """Fetch the current version row of a document."""
        res = (
            self.supabase.table("document_versions")
            .select("*")
            .eq("document_id", document_id)
            .eq("is_current", True)
            .execute()
        )
        return res.data[0] if res.data else None

    def get_current_file(self, document_id: int) -> dict | None:
        """Fetch the current file metadata row of a document."""
        res = (
            self.supabase.table("document_files")
            .select("*")
            .eq("document_id", document_id)
            .eq("is_current", True)
            .eq("is_deleted", False)
            .execute()
        )
        return res.data[0] if res.data else None

    def get_file_by_id(self, file_id: str) -> dict | None:
        """Fetch a specific file record by its UUID."""
        res = (
            self.supabase.table("document_files")
            .select("*")
            .eq("id", file_id)
            .execute()
        )
        return res.data[0] if res.data else None

    def create_version(self, project_id: int, document_id: int, version_number: int,
                       revision_label: str = None, created_by: str = None, notes: str = None) -> dict:
        """Insert a new document version row. Sets is_current to True and deactivates others."""
        self.supabase.table("document_versions").update({"is_current": False}).eq("document_id", document_id).execute()

        row = {
            "project_id": project_id,
            "document_id": document_id,
            "version_number": version_number,
            "revision_label": revision_label,
            "version_status": "active",
            "created_by": created_by,
            "is_current": True,
            "notes": notes
        }
        res = self.supabase.table("document_versions").insert(row).execute()
        if not res.data:
            raise RuntimeError("Failed to create document version record.")
        return res.data[0]

    def create_file(self, project_id: int, document_id: int, version_id: str, storage_path: str,
                    original_filename: str, display_filename: str, mime_type: str, file_extension: str,
                    size_bytes: int, sha256_hash: str, page_count: int = None, image_width: int = None,
                    image_height: int = None, uploaded_by: str = None, metadata: dict = None) -> dict:
        """Insert a new document file row and set is_current = True."""
        self.supabase.table("document_files").update({"is_current": False}).eq("document_id", document_id).execute()

        row = {
            "project_id": project_id,
            "document_id": document_id,
            "version_id": version_id,
            "storage_bucket": "project-documents",
            "storage_path": storage_path,
            "original_filename": original_filename,
            "display_filename": display_filename,
            "mime_type": mime_type,
            "file_extension": file_extension,
            "size_bytes": size_bytes,
            "sha256_hash": sha256_hash,
            "page_count": page_count,
            "image_width": image_width,
            "image_height": image_height,
            "uploaded_by": uploaded_by,
            "is_current": True,
            "is_deleted": False,
            "metadata": metadata or {}
        }
        res = self.supabase.table("document_files").insert(row).execute()
        if not res.data:
            raise RuntimeError("Failed to create document file record.")
        return res.data[0]

    def check_duplicate_hash(self, project_id: int, sha256_hash: str) -> dict | None:
        """Check if a file with the same hash already exists in the project."""
        res = (
            self.supabase.table("document_files")
            .select("*")
            .eq("project_id", project_id)
            .eq("sha256_hash", sha256_hash)
            .eq("is_deleted", False)
            .execute()
        )
        return res.data[0] if res.data else None

    def list_files_for_project(self, project_id: int) -> list:
        """List all active files in the project."""
        res = (
            self.supabase.table("document_files")
            .select("*, document_versions(version_number, revision_label)")
            .eq("project_id", project_id)
            .eq("is_current", True)
            .eq("is_deleted", False)
            .execute()
        )
        return res.data or []

    def get_versions_by_document(self, document_id: int) -> list:
        """Get all versions of a document."""
        res = (
            self.supabase.table("document_versions")
            .select("*")
            .eq("document_id", document_id)
            .order("version_number", desc=True)
            .execute()
        )
        return res.data or []

    def get_files_by_version(self, version_id: str) -> list:
        """Get all files associated with a specific version."""
        res = (
            self.supabase.table("document_files")
            .select("*")
            .eq("version_id", version_id)
            .eq("is_deleted", False)
            .execute()
        )
        return res.data or []
