from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.annotation_service import AnnotationService

router = APIRouter()

class CreateAnnotationPayload(BaseModel):
    file_id: str
    annotation_type: str
    page_number: int = 1
    geometry: dict
    comment_text: str = ""
    actor_user_id: str
    style: dict = {}

class ReplyPayload(BaseModel):
    reply_text: str
    actor_user_id: str

class ResolvePayload(BaseModel):
    actor_user_id: str

@router.get("/")
def list_annotations(file_id: str):
    svc = AnnotationService()
    anns = svc.repo.list_annotations(file_id, include_resolved=True)
    for a in anns:
        a["replies"] = svc.repo.list_replies(a["id"])
    return anns

@router.post("/")
def create_annotation(payload: CreateAnnotationPayload):
    svc = AnnotationService()
    ann = svc.add_annotation(
        file_id=payload.file_id,
        annotation_type=payload.annotation_type,
        page_number=payload.page_number,
        geometry=payload.geometry,
        comment_text=payload.comment_text,
        actor_user_id=payload.actor_user_id,
        style=payload.style,
    )
    return ann

@router.patch("/{annotation_id}/resolve")
def resolve_annotation(annotation_id: str, payload: ResolvePayload):
    svc = AnnotationService()
    return svc.resolve_annotation(annotation_id, payload.actor_user_id)

@router.delete("/{annotation_id}")
def delete_annotation(annotation_id: str, actor_user_id: str):
    svc = AnnotationService()
    svc.delete_annotation(annotation_id, actor_user_id)
    return {"success": True}

@router.post("/{annotation_id}/replies")
def add_reply(annotation_id: str, payload: ReplyPayload):
    svc = AnnotationService()
    return svc.add_reply(annotation_id, payload.reply_text, payload.actor_user_id)
