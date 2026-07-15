import os
import sys
from supabase import create_client, Client

# Simple in-memory cache for Supabase clients to avoid streamlit dependency in FastAPI
_db_client = None
_collab_db_client = None

def load_secrets():
    """Load secrets from environment or .streamlit/secrets.toml using tomllib."""
    # 1. Check environment variables
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    collab_url = os.environ.get("COLLAB_SUPABASE_URL")
    collab_key = os.environ.get("COLLAB_SUPABASE_SERVICE_ROLE_KEY")

    if url and key and collab_url and collab_key:
        return {
            "SUPABASE_URL": url,
            "SUPABASE_SERVICE_ROLE_KEY": key,
            "COLLAB_SUPABASE_URL": collab_url,
            "COLLAB_SUPABASE_SERVICE_ROLE_KEY": collab_key
        }

    # 2. Try loading from secrets.toml
    try:
        import tomllib
    except ImportError:
        # Fallback for python < 3.11
        try:
            import tomli as tomllib
        except ImportError:
            tomllib = None

    if tomllib:
        for path in [".streamlit/secrets.toml", "../.streamlit/secrets.toml"]:
            abs_path = os.path.abspath(path)
            if os.path.exists(abs_path):
                with open(abs_path, "rb") as f:
                    try:
                        return tomllib.load(f)
                    except Exception:
                        pass
    
    # 3. Fallback to Streamlit secrets if running inside Streamlit
    try:
        import streamlit as st
        return {
            "SUPABASE_URL": st.secrets.get("SUPABASE_URL"),
            "SUPABASE_SERVICE_ROLE_KEY": st.secrets.get("SUPABASE_SERVICE_ROLE_KEY"),
            "COLLAB_SUPABASE_URL": st.secrets.get("COLLAB_SUPABASE_URL"),
            "COLLAB_SUPABASE_SERVICE_ROLE_KEY": st.secrets.get("COLLAB_SUPABASE_SERVICE_ROLE_KEY")
        }
    except Exception:
        pass

    return {}

def get_db_client() -> Client:
    """Return a cached Supabase client for the primary DCI database."""
    global _db_client
    if _db_client is None:
        secrets = load_secrets()
        url = secrets.get("SUPABASE_URL")
        key = secrets.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.")
        _db_client = create_client(url, key)
    return _db_client

def get_collab_db_client() -> Client:
    """Return a cached Supabase client for the SEPARATE collaboration database."""
    global _collab_db_client
    if _collab_db_client is None:
        secrets = load_secrets()
        url = secrets.get("COLLAB_SUPABASE_URL")
        key = secrets.get("COLLAB_SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise ValueError("COLLAB_SUPABASE_URL and COLLAB_SUPABASE_SERVICE_ROLE_KEY must be configured.")
        _collab_db_client = create_client(url, key)
    return _collab_db_client
