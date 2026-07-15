from __future__ import annotations

from fastapi import APIRouter

from repositories.db import get_db_client

router = APIRouter()

FALLBACK_USERS = [
    {"id": "a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1", "name": "Rahul Sharma", "email": "rahul@bpcl.in", "role": "reviewer", "initials": "RS"},
    {"id": "b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2", "name": "Anita Verma", "email": "anita@bpcl.in", "role": "editor", "initials": "AV"},
    {"id": "c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3", "name": "Vikram Singh", "email": "vikram@bpcl.in", "role": "document_controller", "initials": "VS"},
    {"id": "d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4", "name": "Admin User", "email": "admin@bpcl.in", "role": "project_admin", "initials": "AD"},
]


@router.get("")
@router.get("/")
def list_users(project_id: int | None = None) -> list[dict]:
    """Use app_users when configured, while retaining local demo personas."""
    try:
        client = get_db_client()
        query = client.table("app_users").select("id,name,email,role,initials,is_active").eq("is_active", True)
        users = query.order("name").execute().data or []
        if project_id is None or not users:
            return users or FALLBACK_USERS

        memberships = (
            client.table("project_members")
            .select("user_id,role")
            .eq("project_id", project_id)
            .eq("is_active", True)
            .execute()
        ).data or []
        roles = {item["user_id"]: item.get("role") for item in memberships}
        return [{**user, "role": roles.get(user["id"], user.get("role", "viewer"))} for user in users if user["id"] in roles]
    except Exception:
        return FALLBACK_USERS
