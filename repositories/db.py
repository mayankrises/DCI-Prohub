
from __future__ import annotations

import os
from threading import Lock

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

_primary_client: Client | None = None
_collab_client: Client | None = None

_client_lock = Lock()


def load_secrets() -> dict[str, str | None]:
    """Load Supabase credentials from environment variables."""

    return {
        "SUPABASE_URL": os.getenv("SUPABASE_URL"),
        "SUPABASE_SERVICE_ROLE_KEY": os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
        "COLLAB_SUPABASE_URL": os.getenv("COLLAB_SUPABASE_URL"),
        "COLLAB_SUPABASE_SERVICE_ROLE_KEY": os.getenv(
            "COLLAB_SUPABASE_SERVICE_ROLE_KEY"
        ),
    }


def _make_client(url_key: str, key_key: str) -> Client:
    secrets = load_secrets()

    url = secrets.get(url_key)
    key = secrets.get(key_key)

    if not url or not key:
        raise ValueError(
            f"{url_key} and {key_key} must be configured "
            "as environment variables."
        )

    return create_client(url, key)


def get_db_client() -> Client:
    global _primary_client

    if _primary_client is None:
        with _client_lock:
            if _primary_client is None:
                _primary_client = _make_client(
                    "SUPABASE_URL",
                    "SUPABASE_SERVICE_ROLE_KEY",
                )

    return _primary_client


def get_collab_db_client() -> Client:
    """Return the collaboration client or fall back to the primary project."""

    global _collab_client

    if _collab_client is None:
        with _client_lock:
            if _collab_client is None:
                secrets = load_secrets()

                if (
                    secrets.get("COLLAB_SUPABASE_URL")
                    and secrets.get("COLLAB_SUPABASE_SERVICE_ROLE_KEY")
                ):
                    _collab_client = _make_client(
                        "COLLAB_SUPABASE_URL",
                        "COLLAB_SUPABASE_SERVICE_ROLE_KEY",
                    )
                else:
                    _collab_client = get_db_client()

    return _collab_client


def reset_clients() -> None:
    """Reset cached clients, useful in tests."""

    global _primary_client, _collab_client

    _primary_client = None
    _collab_client = None
