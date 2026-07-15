from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.lock_service import LockService

router = APIRouter()


class LockPayload(BaseModel):
    file_id: str
    actor_user_id: str


class LeasePayload(BaseModel):
    lock_id: str
    lock_token: str
    actor_user_id: str


class ForceReleasePayload(BaseModel):
    lock_id: str
    reason: str = "Released by administrator"
    actor_user_id: str


@router.get("/status")
def lock_status(file_id: str, actor_user_id: str) -> dict:
    return LockService().get_lock_status_payload(file_id, actor_user_id)


@router.post("/acquire")
def acquire_lock(payload: LockPayload) -> dict:
    result = LockService().acquire_lock(payload.file_id, payload.actor_user_id)
    if isinstance(result, list) and result:
        result = result[0]
    if not isinstance(result, dict):
        raise HTTPException(status_code=500, detail="The lock service returned an invalid response.")
    return result


@router.post("/heartbeat")
def heartbeat(payload: LeasePayload) -> dict:
    try:
        return LockService().heartbeat(payload.lock_id, payload.lock_token, payload.actor_user_id)
    except PermissionError as exc:
        raise HTTPException(status_code=423, detail=str(exc)) from exc


@router.post("/release")
def release_lock(payload: LeasePayload) -> dict:
    LockService().release_lock(payload.lock_id, payload.lock_token, payload.actor_user_id)
    return {"released": True}


@router.post("/force-release")
def force_release(payload: ForceReleasePayload) -> dict:
    LockService().force_release(payload.lock_id, payload.reason, payload.actor_user_id)
    return {"released": True}
