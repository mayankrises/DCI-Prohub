import os
from repositories.db import get_collab_db_client

REQUIRED_TABLES = [
    "document_versions",
    "document_files",
    "document_annotations",
    "annotation_replies",
    "annotation_mentions",
    "document_locks",
    "project_groups",
    "project_group_members",
    "notifications",
    "notification_recipients",
    "user_notification_preferences",
    "tasks",
    "task_assignees",
    "task_activity",
    "collaboration_audit_events"
]

def check_tables_exist() -> dict:
    """Check which required collaboration tables exist in the COLLAB database."""
    try:
        supabase = get_collab_db_client()
    except Exception:
        # Collab credentials not yet configured
        return {t: False for t in REQUIRED_TABLES}

    status = {}
    for table in REQUIRED_TABLES:
        try:
            supabase.table(table).select("*").limit(1).execute()
            status[table] = True
        except Exception as e:
            err_str = str(e).lower()
            if any(x in err_str for x in ("not found", "does not exist", "404", "pgrst116")):
                status[table] = False
            else:
                status[table] = False
    return status

def get_pending_migrations_sql() -> str:
    """Return the combined SQL of all migration files."""
    migrations_dir = os.path.join(os.path.dirname(__file__))
    sql_files = ["001_collaboration_schema.sql", "002_lock_function.sql"]
    combined = []
    for filename in sql_files:
        filepath = os.path.join(migrations_dir, filename)
        if os.path.exists(filepath):
            with open(filepath, "r") as f:
                combined.append(f"--- {filename} ---\n" + f.read())
    return "\n\n".join(combined)
