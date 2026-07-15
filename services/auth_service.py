import streamlit as st

MOCK_USERS = [
    {"id": "a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1", "name": "Rahul Sharma",  "email": "rahul@bpcl.in",  "role": "reviewer"},
    {"id": "b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2", "name": "Anita Verma",   "email": "anita@bpcl.in",  "role": "editor"},
    {"id": "c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3", "name": "Vikram Singh",  "email": "vikram@bpcl.in", "role": "document_controller"},
    {"id": "d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4", "name": "Admin User",    "email": "admin@bpcl.in",  "role": "project_admin"},
]

def get_current_user() -> dict | None:
    if "current_user" not in st.session_state:
        st.session_state["current_user"] = None
    return st.session_state["current_user"]

def login_user(user_dict: dict):
    st.session_state["current_user"] = user_dict
    st.rerun()

def logout_user():
    st.session_state["current_user"] = None
    st.rerun()

def render_auth_sidebar():
    """Render the collaboration login/logout widget in the sidebar."""
    st.sidebar.markdown("---")
    user = get_current_user()
    if user:
        st.sidebar.markdown(f"👤 **{user['name']}**")
        st.sidebar.caption(f"Role: `{user['role'].upper()}`  ·  {user['email']}")
        if st.sidebar.button("Log Out", key="auth_logout_btn", use_container_width=True):
            logout_user()
    else:
        st.sidebar.markdown("🔐 **Collaboration Login**")
        st.sidebar.caption("Pick a persona to test locks, annotations, and tasks:")
        options = [f"{u['name']} ({u['role'].title()})" for u in MOCK_USERS]
        selected_label = st.sidebar.selectbox("Choose Persona", options, key="auth_persona_select")
        selected_user = MOCK_USERS[options.index(selected_label)]
        if st.sidebar.button("Log In", key="auth_login_btn", type="primary", use_container_width=True):
            login_user(selected_user)

def has_permission(action: str) -> bool:
    """Role-based permission check."""
    user = get_current_user()
    if not user:
        return False
    role = user["role"]
    if role == "project_admin":
        return True
    matrix = {
        "upload_document":          ["document_controller", "editor"],
        "view_document":            ["document_controller", "editor", "reviewer", "viewer"],
        "download_original":        ["document_controller", "editor", "reviewer"],
        "add_annotation":           ["document_controller", "editor", "reviewer"],
        "resolve_annotation":       ["document_controller", "editor", "reviewer"],
        "delete_own_annotation":    ["document_controller", "editor", "reviewer"],
        "delete_others_annotation": ["document_controller"],
        "release_lock":             ["document_controller"],
        "create_group":             ["document_controller"],
        "assign_task":              ["document_controller", "editor", "reviewer"],
        "change_task_status":       ["document_controller", "editor", "reviewer"],
    }
    return role in matrix.get(action, [])
