from fastapi import APIRouter
from services.notification_service import NotificationService
router=APIRouter()
@router.get("")
@router.get("/")
def list_notifications(user_id:str,limit:int=50): return NotificationService().list_notifications(user_id,limit)
@router.post("/{recipient_id}/read")
def mark_read(recipient_id:str): NotificationService().mark_read(recipient_id); return {"ok":True}
@router.post("/read-all")
def mark_all(user_id:str): NotificationService().mark_all_read(user_id); return {"ok":True}
