import os
import hashlib
from repositories.db import get_collab_db_client
from repositories.document_repository import DocumentRepository
from config.feature_flags import MAX_FILE_SIZE_BYTES

SUPPORTED_MIME_TYPES = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg"
}

class DocumentService:
    def __init__(self):
        self.supabase = get_collab_db_client()
        self.repo = DocumentRepository()
        self._ensure_bucket_exists()

    def _ensure_bucket_exists(self):
        """Create the private storage bucket in the collab project if missing."""
        try:
            buckets = self.supabase.storage.list_buckets()
            existing = [b.name for b in buckets]
            if "project-documents" not in existing:
                self.supabase.storage.create_bucket("project-documents")
        except Exception:
            pass

    def validate_file(self, filename: str, mime_type: str, size_bytes: int):
        if size_bytes > MAX_FILE_SIZE_BYTES:
            raise ValueError(f"File size exceeds the {MAX_FILE_SIZE_BYTES // (1024*1024)} MB limit.")
        ext = os.path.splitext(filename)[1].lower()
        if mime_type not in SUPPORTED_MIME_TYPES or ext not in SUPPORTED_MIME_TYPES.values():
            raise ValueError("Unsupported file type. Only PDF and PNG/JPEG images are allowed.")

    def calculate_hash(self, file_bytes: bytes) -> str:
        return hashlib.sha256(file_bytes).hexdigest()

    def upload_document(self, project_id: int, document_id: int, file_bytes: bytes,
                        filename: str, mime_type: str, actor_user_id: str) -> dict:
        self.validate_file(filename, mime_type, len(file_bytes))
        file_hash = self.calculate_hash(file_bytes)

        dup = self.repo.check_duplicate_hash(project_id, file_hash)
        if dup:
            return {
                "duplicate": True,
                "existing_file_id": dup["id"],
                "message": f"This exact file already exists under document {dup['document_id']}."
            }

        version = self.repo.create_version(
            project_id=project_id, document_id=document_id,
            version_number=1, revision_label="Rev-0",
            created_by=actor_user_id, notes="Initial document upload"
        )

        ext = os.path.splitext(filename)[1].lower()
        safe_name = "".join(c if c.isalnum() or c in (".", "-", "_") else "_" for c in filename)
        storage_path = f"projects/{project_id}/documents/{document_id}/versions/{version['id']}/original/{safe_name}"

        doc_file = self.repo.create_file(
            project_id=project_id, document_id=document_id,
            version_id=version["id"], storage_path=storage_path,
            original_filename=filename, display_filename=filename,
            mime_type=mime_type, file_extension=ext,
            size_bytes=len(file_bytes), sha256_hash=file_hash,
            uploaded_by=actor_user_id
        )

        try:
            self.supabase.storage.from_("project-documents").upload(
                path=storage_path, file=file_bytes,
                file_options={"content-type": mime_type, "upsert": "true"}
            )
        except Exception as e:
            self.supabase.table("document_files").delete().eq("id", doc_file["id"]).execute()
            self.supabase.table("document_versions").delete().eq("id", version["id"]).execute()
            raise RuntimeError(f"Storage upload failed: {e}")

        self._record_audit(project_id, doc_file["id"], "upload", actor_user_id)
        return {"duplicate": False, "file_id": doc_file["id"]}

    def create_version(self, project_id: int, document_id: int, file_bytes: bytes,
                       filename: str, mime_type: str, revision_label: str, actor_user_id: str) -> dict:
        self.validate_file(filename, mime_type, len(file_bytes))
        file_hash = self.calculate_hash(file_bytes)

        versions = self.repo.get_versions_by_document(document_id)
        next_v = (versions[0]["version_number"] + 1) if versions else 1

        version = self.repo.create_version(
            project_id=project_id, document_id=document_id,
            version_number=next_v, revision_label=revision_label,
            created_by=actor_user_id, notes=f"New version: {revision_label}"
        )

        ext = os.path.splitext(filename)[1].lower()
        safe_name = "".join(c if c.isalnum() or c in (".", "-", "_") else "_" for c in filename)
        storage_path = f"projects/{project_id}/documents/{document_id}/versions/{version['id']}/original/{safe_name}"

        doc_file = self.repo.create_file(
            project_id=project_id, document_id=document_id,
            version_id=version["id"], storage_path=storage_path,
            original_filename=filename, display_filename=filename,
            mime_type=mime_type, file_extension=ext,
            size_bytes=len(file_bytes), sha256_hash=file_hash,
            uploaded_by=actor_user_id
        )

        try:
            self.supabase.storage.from_("project-documents").upload(
                path=storage_path, file=file_bytes,
                file_options={"content-type": mime_type, "upsert": "true"}
            )
        except Exception as e:
            self.supabase.table("document_files").delete().eq("id", doc_file["id"]).execute()
            self.supabase.table("document_versions").delete().eq("id", version["id"]).execute()
            raise RuntimeError(f"Storage upload failed: {e}")

        self._record_audit(project_id, doc_file["id"], "upload_new_version", actor_user_id)
        return {"file_id": doc_file["id"]}

    def create_download_url(self, file_id: str, actor_user_id: str) -> str:
        file_rec = self.repo.get_file_by_id(file_id)
        if not file_rec:
            raise ValueError("Document file not found.")
        res = self.supabase.storage.from_("project-documents").create_signed_url(
            path=file_rec["storage_path"], expires_in=300
        )
        return self._extract_url(res)

    def get_viewer_payload(self, file_id: str, actor_user_id: str) -> dict:
        file_rec = self.repo.get_file_by_id(file_id)
        if not file_rec:
            raise ValueError("Document file not found.")
        res = self.supabase.storage.from_("project-documents").create_signed_url(
            path=file_rec["storage_path"], expires_in=600
        )
        return {
            "file_id": file_rec["id"],
            "document_id": file_rec["document_id"],
            "version_id": file_rec["version_id"],
            "original_filename": file_rec["original_filename"],
            "mime_type": file_rec["mime_type"],
            "signed_url": self._extract_url(res)
        }

    def _extract_url(self, res) -> str:
        if isinstance(res, dict):
            return res.get("signedURL") or res.get("signedUrl") or str(res)
        return getattr(res, "signed_url", str(res))

    def _record_audit(self, project_id: int, file_id: str, action: str, actor_user_id: str):
        try:
            self.supabase.table("collaboration_audit_events").insert({
                "project_id": project_id,
                "entity_type": "document_file",
                "entity_id": file_id,
                "action": action,
                "actor_user_id": actor_user_id,
                "metadata": {"file_id": file_id}
            }).execute()
        except Exception:
            pass
