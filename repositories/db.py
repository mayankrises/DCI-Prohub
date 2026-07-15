from __future__ import annotations

import os
from pathlib import Path
from threading import Lock
from typing import Any

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

_primary_client: Client | None = None
_collab_client: Client | None = None
_client_lock = Lock()


def _load_toml_secrets() -> dict[str, Any]:
    try:
        import tomllib
    except ImportError:  # pragma: no cover - only for Python 3.10
        import tomli as tomllib  # type: ignore

    candidates = [
        Path.cwd() / ".streamlit" / "secrets.toml",
        Path(__file__).resolve().parents[1] / ".streamlit" / "secrets.toml",
    ]
    for path in candidates:
        if not path.exists():
            continue
        try:
            with path.open("rb") as handle:
                return tomllib.load(handle)
        except (OSError, ValueError):
            continue
    return {}


def load_secrets() -> dict[str, Any]:
    """Read database credentials from environment first, then Streamlit secrets."""
    values: dict[str, Any] = {
        "SUPABASE_URL": os.getenv("SUPABASE_URL"),
        "SUPABASE_SERVICE_ROLE_KEY": os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
        "COLLAB_SUPABASE_URL": os.getenv("COLLAB_SUPABASE_URL"),
        "COLLAB_SUPABASE_SERVICE_ROLE_KEY": os.getenv("COLLAB_SUPABASE_SERVICE_ROLE_KEY"),
    }
    toml_values = _load_toml_secrets()
    for key in tuple(values):
        if not values[key]:
            values[key] = toml_values.get(key)
    return values


def _make_client(url_key: str, key_key: str) -> Client:
    secrets = load_secrets()
    url = secrets.get(url_key)
    key = secrets.get(key_key)
    print("=================================")
    print("CONNECTING TO:")
    print(url)
    print("=================================")
    if not url or not key:
        raise ValueError(f"{url_key} and {key_key} must be configured in .env or .streamlit/secrets.toml.")
    return create_client(str(url), str(key))


def get_db_client() -> Client:
    global _primary_client
    if _primary_client is None:
        with _client_lock:
            if _primary_client is None:
                _primary_client = _make_client("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
    return _primary_client


def get_collab_db_client() -> Client:
    """Return the collaboration client; fall back to the primary project when desired."""
    global _collab_client
    if _collab_client is None:
        with _client_lock:
            if _collab_client is None:
                secrets = load_secrets()
                if secrets.get("COLLAB_SUPABASE_URL") and secrets.get("COLLAB_SUPABASE_SERVICE_ROLE_KEY"):
                    _collab_client = _make_client(
                        "COLLAB_SUPABASE_URL",
                        "COLLAB_SUPABASE_SERVICE_ROLE_KEY",
                    )
                else:
                    _collab_client = get_db_client()
    return _collab_client


def reset_clients() -> None:
    """Useful in tests after changing environment variables."""
    global _primary_client, _collab_client
    _primary_client = None
    _collab_client = None
