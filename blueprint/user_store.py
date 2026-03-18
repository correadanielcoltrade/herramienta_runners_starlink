import json
import os
from typing import Any, Dict, List
from blueprint.storage import data_file, write_json_atomic
from blueprint.db import is_db_configured
from blueprint import db_store

DEFAULT_USERS_FILE = data_file("login.json")


def users_file_path() -> str:
    custom_path = os.getenv("LOGIN_USERS_FILE", "").strip()
    if custom_path:
        return custom_path
    return DEFAULT_USERS_FILE


def _coerce_users(data: Any) -> List[Dict[str, Any]]:
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, dict)]


def load_users() -> List[Dict[str, Any]]:
    if is_db_configured():
        return db_store.fetch_users()

    path = users_file_path()

    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return _coerce_users(json.load(f))

    env_users = os.getenv("LOGIN_USERS_JSON", "").strip()
    if not env_users:
        return []

    users = _coerce_users(json.loads(env_users))

    # Bootstrap users file so admin-panel writes to a file path.
    try:
        save_users(users)
    except Exception:
        pass

    return users


def save_users(users: List[Dict[str, Any]]) -> str:
    if is_db_configured():
        db_store.replace_users(users)
        return "db://usuarios"

    path = users_file_path()
    write_json_atomic(path, users, indent=2)

    return path
