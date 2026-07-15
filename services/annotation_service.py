from repositories.annotation_repository import AnnotationRepository
from repositories.document_repository import DocumentRepository
from repositories.db import get_collab_db_client
from services.auth_service import MOCK_USERS
import re

class AnnotationService:
    def __init__(self):
        self.repo = AnnotationRepository()
        self.doc_repo = DocumentRepository()
        self.supabase = get_collab_db_client()

    def list_annotations(self, file_id: str, include_resolved: bool = True,
                         actor_user_id: str = None) -> list:
        annotations = self.repo.list_annotations(file_id, include_resolved)
        for ann in annotations:
            ann["replies"] = self.repo.list_replies(ann["id"])
        return annotations

    def _verify_lock(self, file_id: str, user_id: str, lock_token: str) -> bool:
        from datetime import datetime, timezone
        res = (
            self.supabase.table("document_locks")
            .select("*")
            .eq("document_file_id", file_id)
            .eq("is_active", True)
            .eq("locked_by", user_id)
            .eq("lock_token", lock_token)
            .execute()
        )
        if not res.data:
            return False
        lock = res.data[0]
        expires_at = datetime.fromisoformat(lock["expires_at"].replace("Z", "+00:00"))
        return expires_at > datetime.now(timezone.utc)

    def create_annotation(self, payload: dict, lock_token: str, actor_user_id: str) -> dict:
        file_id = payload["document_file_id"]
        if not self._verify_lock(file_id, actor_user_id, lock_token):
            raise PermissionError("You do not hold a valid edit lock on this document file.")

        file_rec = self.doc_repo.get_file_by_id(file_id)
        if not file_rec:
            raise ValueError("Document file not found.")

        ann = self.repo.create_annotation(
            project_id=file_rec["project_id"],
            document_id=file_rec["document_id"],
            version_id=file_rec["version_id"],
            file_id=file_id,
            page_number=payload["page_number"],
            annotation_type=payload["annotation_type"],
            geometry=payload["geometry"],
            comment_text=payload["comment_text"],
            created_by=actor_user_id,
            severity=payload.get("severity", "normal")
        )
        self._parse_and_create_mentions(ann["id"], None, payload["comment_text"], actor_user_id)
        self._record_audit(file_rec["project_id"], ann["id"], "create_annotation", actor_user_id)
        return ann

    def update_annotation(self, annotation_id: str, expected_row_version: int,
                          changes: dict, lock_token: str, actor_user_id: str) -> dict:
        ann = self.repo.get_annotation_by_id(annotation_id)
        if not ann:
            raise ValueError("Annotation not found.")
        if not self._verify_lock(ann["document_file_id"], actor_user_id, lock_token):
            raise PermissionError("You do not hold a valid edit lock on this document file.")
        updated = self.repo.update_annotation(annotation_id, expected_row_version, changes, actor_user_id)
        if "comment_text" in changes:
            self._parse_and_create_mentions(annotation_id, None, changes["comment_text"], actor_user_id)
        self._record_audit(ann["project_id"], annotation_id, "update_annotation", actor_user_id)
        return updated

    def resolve_annotation(self, annotation_id: str, resolution_note: str, actor_user_id: str) -> dict:
        ann = self.repo.get_annotation_by_id(annotation_id)
        if not ann:
            raise ValueError("Annotation not found.")
        resolved = self.repo.resolve_annotation(annotation_id, resolution_note, actor_user_id)
        self._record_audit(ann["project_id"], annotation_id, "resolve_annotation", actor_user_id)
        self._create_notification(ann["project_id"], "annotation_resolved",
                                  "Annotation Resolved",
                                  f"Resolved comment on doc: {resolution_note}",
                                  annotation_id, actor_user_id)
        return resolved

    def reopen_annotation(self, annotation_id: str, actor_user_id: str) -> dict:
        ann = self.repo.get_annotation_by_id(annotation_id)
        if not ann:
            raise ValueError("Annotation not found.")
        reopened = self.repo.reopen_annotation(annotation_id, actor_user_id)
        self._record_audit(ann["project_id"], annotation_id, "reopen_annotation", actor_user_id)
        return reopened

    def delete_annotation(self, annotation_id: str, lock_token: str, actor_user_id: str) -> dict:
        ann = self.repo.get_annotation_by_id(annotation_id)
        if not ann:
            raise ValueError("Annotation not found.")
        if not self._verify_lock(ann["document_file_id"], actor_user_id, lock_token):
            raise PermissionError("You do not hold a valid edit lock on this document file.")
        deleted = self.repo.delete_annotation(annotation_id, actor_user_id)
        self._record_audit(ann["project_id"], annotation_id, "delete_annotation", actor_user_id)
        return deleted

    def create_reply(self, annotation_id: str, reply_text: str, actor_user_id: str) -> dict:
        ann = self.repo.get_annotation_by_id(annotation_id)
        if not ann:
            raise ValueError("Annotation not found.")
        reply = self.repo.create_reply(annotation_id, ann["project_id"], reply_text, actor_user_id)
        self._parse_and_create_mentions(annotation_id, reply["id"], reply_text, actor_user_id)
        self._record_audit(ann["project_id"], annotation_id, "reply_created", actor_user_id)
        if ann["created_by"] != actor_user_id:
            self._create_notification(ann["project_id"], "annotation_replied",
                                      f"New reply from {actor_user_id}",
                                      reply_text, annotation_id, actor_user_id)
        return reply

    def _parse_and_create_mentions(self, annotation_id: str, reply_id: str | None,
                                   text: str, actor_user_id: str):
        mentions = re.findall(r"@([\w\s.@]+)", text)
        for mention in mentions:
            mention_clean = mention.strip().lower()
            for user in MOCK_USERS:
                if (user["email"].lower() == mention_clean or
                        user["name"].lower() == mention_clean or
                        user["name"].lower().split()[0] == mention_clean):
                    self.repo.create_mention(
                        annotation_id=annotation_id,
                        reply_id=reply_id,
                        mentioned_user_id=user["id"],
                        mentioned_by=actor_user_id
                    )
                    try:
                        ann = self.repo.get_annotation_by_id(annotation_id)
                        self.supabase.table("notifications").insert({
                            "project_id": ann["project_id"],
                            "notification_type": "annotation_mentioned",
                            "title": "You were mentioned in a comment",
                            "message": text[:200],
                            "entity_type": "annotation",
                            "entity_id": annotation_id,
                            "created_by": actor_user_id
                        }).execute()
                    except Exception:
                        pass

    def _create_notification(self, project_id: int, notif_type: str, title: str,
                             message: str, entity_id: str, actor_user_id: str):
        try:
            self.supabase.table("notifications").insert({
                "project_id": project_id,
                "notification_type": notif_type,
                "title": title,
                "message": message,
                "entity_type": "annotation",
                "entity_id": entity_id,
                "created_by": actor_user_id
            }).execute()
        except Exception:
            pass

    def _record_audit(self, project_id: int, entity_id: str, action: str, actor_user_id: str):
        try:
            self.supabase.table("collaboration_audit_events").insert({
                "project_id": project_id,
                "entity_type": "annotation",
                "entity_id": entity_id,
                "action": action,
                "actor_user_id": actor_user_id
            }).execute()
        except Exception:
            pass
