from fastapi import APIRouter
from repositories.db import get_db_client

router = APIRouter()

@router.get("/")
def list_projects():
    supabase = get_db_client()
    res = supabase.table("projects").select("id, project_name, contractor").order("id", desc=False).execute()
    return res.data or []
