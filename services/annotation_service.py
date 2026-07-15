from __future__ import annotations

import re
from datetime import datetime, timezone

from repositories.annotation_repository import AnnotationRepository
from repositories.db import get_collab_db_client
from repositories.document_repository import DocumentRepository
from services.auth_service import MOCK_USERS


class AnnotationService:
    def __init__(self):
        self.repo = AnnotationRepository()
        self.doc_repo = DocumentRepository()
        self.supabase = get_collab_db_client()

    def list_annotations(self, file_id: str, include_resolved: bool = True) -> list[dict]:
        annotations = self.repo.list_annotations(file_id, include_resolved)
        for annotation in annotations:
            annotation["replies"] = self.repo.list_replies(annotation["id"])
        return annotations

    def _verify_lock(self, file_id: str, user_id: str, lock_token: str) -> bool:
        result = (
            self.supabase.table("document_locks")
            .select("id")
            .eq("document_file_id", file_id)
            .eq("is_active", True)
            .eq("locked_by", user_id)
            .eq("lock_token", lock_token)
            .gt("expires_at", datetime.now(timezone.utc).isoformat())
            .limit(1)
            .execute()
        )
        return bool(result.data)

    def create_annotation(self, payload: dict, lock_token: str, actor_user_id: str) -> dict:
        file_id = payload["file_id"]
        if not self._verify_lock(file_id, actor_user_id, lock_token):
            raise PermissionError("You do not hold the active edit lock for this file.")
        file_record = self.doc_repo.get_file_by_id(file_id)
        if not file_record:
            raise ValueError("Document file not found.")
        annotation = self.repo.create_annotation(
            project_id=file_record["project_id"],
            document_id=file_record["document_id"],
            version_id=file_record["version_id"],
            file_id=file_id,
            page_number=payload.get("page_number", 1),
            annotation_type=payload["annotation_type"],
            geometry=payload["geometry"],
            comment_text=payload.get("comment_text", ""),
            created_by=actor_user_id,
            style=payload.get("style") or {},
            severity=payload.get("severity", "normal"),
        )
        self._create_mentions(annotation["id"], None, annotation.get("comment_text") or "", actor_user_id)
        return annotation

    def resolve_annotation(self, annotation_id: str, resolution_note: str, actor_user_id: str) -> dict:
        if not self.repo.get_annotation_by_id(annotation_id):
            raise ValueError("Annotation not found.")
        return self.repo.resolve_annotation(annotation_id, resolution_note, actor_user_id)

    def reopen_annotation(self, annotation_id: str, actor_user_id: str) -> dict:
        if not self.repo.get_annotation_by_id(annotation_id):
            raise ValueError("Annotation not found.")
        return self.repo.reopen_annotation(annotation_id, actor_user_id)

    def delete_annotation(self, annotation_id: str, lock_token: str, actor_user_id: str) -> dict:
        annotation = self.repo.get_annotation_by_id(annotation_id)
        if not annotation:
            raise ValueError("Annotation not found.")
        if not self._verify_lock(annotation["document_file_id"], actor_user_id, lock_token):
            raise PermissionError("You do not hold the active edit lock for this file.")
        return self.repo.delete_annotation(annotation_id, actor_user_id)

    def create_reply(self, annotation_id: str, reply_text: str, actor_user_id: str) -> dict:
        annotation = self.repo.get_annotation_by_id(annotation_id)
        if not annotation:
            raise ValueError("Annotation not found.")
        reply = self.repo.create_reply(annotation_id, annotation["project_id"], reply_text, actor_user_id)
        self._create_mentions(annotation_id, reply["id"], reply_text, actor_user_id)
        return reply

    def _create_mentions(self, annotation_id: str, reply_id: str | None, text: str, actor_user_id: str) -> None:
        tokens = {token.strip().lower() for token in re.findall(r"@([\w.@-]+)", text)}
        for user in MOCK_USERS:
            candidates = {user["email"].lower(), user["name"].lower(), user["name"].split()[0].lower()}
            if tokens & candidates:
                self.repo.create_mention(annotation_id, reply_id, user["id"], actor_user_id)
