from __future__ import annotations

MOCK_USERS = [
    {"id": "a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1", "name": "Rahul Sharma", "email": "rahul@bpcl.in", "role": "reviewer"},
    {"id": "b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2", "name": "Anita Verma", "email": "anita@bpcl.in", "role": "editor"},
    {"id": "c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3", "name": "Vikram Singh", "email": "vikram@bpcl.in", "role": "document_controller"},
    {"id": "d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4", "name": "Admin User", "email": "admin@bpcl.in", "role": "project_admin"},
]

PERMISSIONS = {
    "upload_document": {"editor", "document_controller", "project_admin"},
    "view_document": {"reviewer", "editor", "document_controller", "project_admin", "viewer"},
    "download_original": {"reviewer", "editor", "document_controller", "project_admin", "viewer"},
    "add_annotation": {"reviewer", "editor", "document_controller", "project_admin"},
    "resolve_annotation": {"reviewer", "editor", "document_controller", "project_admin"},
    "delete_others_annotation": {"document_controller", "project_admin"},
    "release_lock": {"document_controller", "project_admin"},
    "create_group": {"document_controller", "project_admin"},
    "assign_task": {"reviewer", "editor", "document_controller", "project_admin"},
    "change_task_status": {"reviewer", "editor", "document_controller", "project_admin"},
}


def has_role_permission(role: str | None, action: str) -> bool:
    return bool(role and role in PERMISSIONS.get(action, set()))


def get_current_user() -> dict | None:
    try:
        import streamlit as st
    except ImportError:
        return None
    return st.session_state.get("current_user")


def login_user(user_dict: dict) -> None:
    import streamlit as st
    st.session_state["current_user"] = user_dict
    st.rerun()


def logout_user() -> None:
    import streamlit as st
    st.session_state["current_user"] = None
    st.rerun()


def has_permission(action: str) -> bool:
    user = get_current_user()
    return has_role_permission(user.get("role") if user else None, action)


def render_auth_sidebar() -> None:
    import streamlit as st
    st.sidebar.markdown("---")
    user = get_current_user()
    if user:
        st.sidebar.markdown(f"👤 **{user['name']}**")
        st.sidebar.caption(f"Role: `{user['role'].upper()}` · {user['email']}")
        if st.sidebar.button("Log Out", key="auth_logout_btn", use_container_width=True):
            logout_user()
        return
    options = [f"{user['name']} ({user['role'].title()})" for user in MOCK_USERS]
    selected = st.sidebar.selectbox("Choose Persona", options, key="auth_persona_select")
    if st.sidebar.button("Log In", key="auth_login_btn", type="primary", use_container_width=True):
        login_user(MOCK_USERS[options.index(selected)])
