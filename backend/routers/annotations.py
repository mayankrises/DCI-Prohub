from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.annotation_service import AnnotationService

router = APIRouter()


class CreateAnnotationPayload(BaseModel):
    file_id: str
    annotation_type: str
    page_number: int = Field(default=1, ge=1)
    geometry: dict
    comment_text: str = ""
    actor_user_id: str
    lock_token: str
    style: dict = Field(default_factory=dict)
    severity: str = "normal"


class ReplyPayload(BaseModel):
    reply_text: str = Field(min_length=1)
    actor_user_id: str


class ResolvePayload(BaseModel):
    actor_user_id: str
    resolution_note: str = "Resolved"


class DeletePayload(BaseModel):
    actor_user_id: str
    lock_token: str


@router.get("")
@router.get("/")
def list_annotations(file_id: str, include_resolved: bool = True) -> list[dict]:
    return AnnotationService().list_annotations(file_id, include_resolved)


@router.post("")
@router.post("/")
def create_annotation(payload: CreateAnnotationPayload) -> dict:
    try:
        return AnnotationService().create_annotation(payload.model_dump(), payload.lock_token, payload.actor_user_id)
    except PermissionError as exc:
        raise HTTPException(status_code=423, detail=str(exc)) from exc


@router.patch("/{annotation_id}/resolve")
def resolve_annotation(annotation_id: str, payload: ResolvePayload) -> dict:
    return AnnotationService().resolve_annotation(annotation_id, payload.resolution_note, payload.actor_user_id)


@router.patch("/{annotation_id}/reopen")
def reopen_annotation(annotation_id: str, payload: ResolvePayload) -> dict:
    return AnnotationService().reopen_annotation(annotation_id, payload.actor_user_id)


@router.delete("/{annotation_id}")
def delete_annotation(annotation_id: str, actor_user_id: str, lock_token: str) -> dict:
    try:
        return AnnotationService().delete_annotation(annotation_id, lock_token, actor_user_id)
    except PermissionError as exc:
        raise HTTPException(status_code=423, detail=str(exc)) from exc


@router.post("/{annotation_id}/replies")
def add_reply(annotation_id: str, payload: ReplyPayload) -> dict:
    return AnnotationService().create_reply(annotation_id, payload.reply_text, payload.actor_user_id)
