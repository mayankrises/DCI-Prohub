from __future__ import annotations

import hashlib
import os
from typing import Any

from config.feature_flags import MAX_FILE_SIZE_BYTES
from repositories.db import get_collab_db_client
from repositories.document_repository import DocumentRepository

SUPPORTED_MIME_TYPES = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
}
BUCKET = "project-documents"


class DocumentService:
    def __init__(self):
        self.supabase = get_collab_db_client()
        self.repo = DocumentRepository()
        self._ensure_bucket_exists()

    def _ensure_bucket_exists(self) -> None:
        try:
            names = []
            for bucket in self.supabase.storage.list_buckets():
                names.append(getattr(bucket, "name", None) or (bucket.get("name") if isinstance(bucket, dict) else None))
            if BUCKET not in names:
                self.supabase.storage.create_bucket(BUCKET, options={"public": False})
        except Exception:
            pass

    @staticmethod
    def validate_file(filename: str, mime_type: str, size_bytes: int) -> None:
        if size_bytes <= 0:
            raise ValueError("The uploaded file is empty.")
        if size_bytes > MAX_FILE_SIZE_BYTES:
            raise ValueError(f"File size exceeds the {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB limit.")
        extension = os.path.splitext(filename)[1].lower()
        if mime_type not in SUPPORTED_MIME_TYPES or extension not in set(SUPPORTED_MIME_TYPES.values()):
            raise ValueError("Unsupported file type. Only PDF, PNG and JPEG files are allowed.")

    @staticmethod
    def calculate_hash(file_bytes: bytes) -> str:
        return hashlib.sha256(file_bytes).hexdigest()

    def _save_file(
        self,
        project_id: int,
        document_id: int,
        file_bytes: bytes,
        filename: str,
        mime_type: str,
        revision_label: str,
        actor_user_id: str,
    ) -> dict[str, Any]:
        self.validate_file(filename, mime_type, len(file_bytes))
        digest = self.calculate_hash(file_bytes)
        duplicate = self.repo.check_duplicate_hash(project_id, digest)
        if duplicate:
            return {
                "duplicate": True,
                "existing_file_id": duplicate["id"],
                "message": f"This exact file already exists under document {duplicate['document_id']}.",
            }

        versions = self.repo.get_versions_by_document(document_id)
        next_version = int(versions[0].get("version_number") or 0) + 1 if versions else 1
        version = self.repo.create_version(
            project_id=project_id,
            document_id=document_id,
            version_number=next_version,
            revision_label=revision_label or f"Rev-{next_version - 1}",
            created_by=actor_user_id,
            notes="Initial document upload" if next_version == 1 else "New document version",
        )

        extension = os.path.splitext(filename)[1].lower()
        safe_name = "".join(character if character.isalnum() or character in ".-_" else "_" for character in filename)
        path = f"projects/{project_id}/documents/{document_id}/versions/{version['id']}/original/{safe_name}"
        file_row = self.repo.create_file(
            project_id=project_id,
            document_id=document_id,
            version_id=version["id"],
            storage_path=path,
            original_filename=filename,
            display_filename=filename,
            mime_type=mime_type,
            file_extension=extension,
            size_bytes=len(file_bytes),
            sha256_hash=digest,
            uploaded_by=actor_user_id,
            metadata={"revision_label": revision_label},
        )

        try:
            self.supabase.storage.from_(BUCKET).upload(
                path=path,
                file=file_bytes,
                file_options={"content-type": mime_type, "upsert": "false"},
            )
        except Exception as exc:
            self.supabase.table("document_files").delete().eq("id", file_row["id"]).execute()
            self.supabase.table("document_versions").delete().eq("id", version["id"]).execute()
            raise RuntimeError(f"Storage upload failed: {exc}") from exc

        self._record_audit(project_id, file_row["id"], "upload" if next_version == 1 else "upload_new_version", actor_user_id)
        return {
            "duplicate": False,
            "file_id": file_row["id"],
            "document_id": document_id,
            "version_id": version["id"],
            "version_number": next_version,
            "revision_label": version.get("revision_label"),
        }

    def upload_document(
        self,
        project_id: int,
        document_id: int,
        file_bytes: bytes,
        filename: str,
        mime_type: str,
        actor_user_id: str,
        revision_label: str = "Rev-0",
    ) -> dict[str, Any]:
        return self._save_file(project_id, document_id, file_bytes, filename, mime_type, revision_label, actor_user_id)

    def create_version(
        self,
        project_id: int,
        document_id: int,
        file_bytes: bytes,
        filename: str,
        mime_type: str,
        revision_label: str,
        actor_user_id: str,
    ) -> dict[str, Any]:
        return self._save_file(project_id, document_id, file_bytes, filename, mime_type, revision_label, actor_user_id)

    def create_download_url(self, file_id: str, actor_user_id: str) -> str:
        file_record = self.repo.get_file_by_id(file_id)
        if not file_record:
            raise ValueError("Document file not found.")
        result = self.supabase.storage.from_(BUCKET).create_signed_url(file_record["storage_path"], 300)
        return self._extract_url(result)

    def get_viewer_payload(self, file_id: str, actor_user_id: str) -> dict[str, Any]:
        file_record = self.repo.get_file_by_id(file_id)
        if not file_record:
            raise ValueError("Document file not found.")
        result = self.supabase.storage.from_(BUCKET).create_signed_url(file_record["storage_path"], 600)
        return {
            "file_id": file_record["id"],
            "document_id": file_record["document_id"],
            "version_id": file_record["version_id"],
            "original_filename": file_record["original_filename"],
            "mime_type": file_record["mime_type"],
            "signed_url": self._extract_url(result),
        }

    @staticmethod
    def _extract_url(result: Any) -> str:
        if isinstance(result, dict):
            return str(result.get("signedURL") or result.get("signedUrl") or result.get("signed_url") or "")
        return str(getattr(result, "signed_url", ""))

    def _record_audit(self, project_id: int, file_id: str, action: str, actor_user_id: str) -> None:
        try:
            self.supabase.table("collaboration_audit_events").insert({
                "project_id": project_id,
                "entity_type": "document_file",
                "entity_id": file_id,
                "action": action,
                "actor_user_id": actor_user_id,
                "metadata": {"file_id": file_id},
            }).execute()
        except Exception:
            pass
