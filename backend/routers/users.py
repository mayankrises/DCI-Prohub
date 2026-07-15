from fastapi import APIRouter
from services.auth_service import MOCK_USERS

router = APIRouter()

@router.get("/")
def list_users():
    return MOCK_USERS
