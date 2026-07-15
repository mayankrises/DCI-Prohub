from repositories.db import get_collab_db_client

class GroupService:
    def __init__(self):
        self.supabase = get_collab_db_client()

    def create_group(self, project_id: int, group_name: str, description: str,
                     group_type: str, actor_user_id: str) -> dict:
        row = {"project_id": project_id, "group_name": group_name,
               "description": description, "group_type": group_type,
               "created_by": actor_user_id}
        res = self.supabase.table("project_groups").insert(row).execute()
        if not res.data:
            raise RuntimeError("Failed to create project group.")
        return res.data[0]

    def list_groups(self, project_id: int) -> list:
        res = (
            self.supabase.table("project_groups")
            .select("*")
            .eq("project_id", project_id)
            .eq("is_active", True)
            .order("group_name", desc=False)
            .execute()
        )
        return res.data or []

    def get_group_by_id(self, group_id: str) -> dict | None:
        res = self.supabase.table("project_groups").select("*").eq("id", group_id).execute()
        return res.data[0] if res.data else None

    def delete_group(self, group_id: str) -> dict | None:
        res = (self.supabase.table("project_groups")
               .update({"is_active": False}).eq("id", group_id).execute())
        return res.data[0] if res.data else None

    def add_member(self, project_id: int, group_id: str, user_id: str,
                   role: str, actor_user_id: str) -> dict:
        row = {"project_id": project_id, "group_id": group_id,
               "user_id": user_id, "member_role": role, "added_by": actor_user_id}
        res = self.supabase.table("project_group_members").insert(row).execute()
        if not res.data:
            raise RuntimeError("Failed to add user to group.")
        return res.data[0]

    def remove_member(self, group_id: str, user_id: str) -> None:
        self.supabase.table("project_group_members") \
            .delete().eq("group_id", group_id).eq("user_id", user_id).execute()

    def list_members(self, group_id: str) -> list:
        res = (
            self.supabase.table("project_group_members")
            .select("*")
            .eq("group_id", group_id)
            .eq("is_active", True)
            .execute()
        )
        return res.data or []

    def expand_group_recipients(self, group_id: str) -> list[str]:
        members = self.list_members(group_id)
        return [str(m["user_id"]) for m in members]
