import json
import os
from typing import Any, Dict, List

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.normpath(os.path.join(BASE_DIR, "..", "data"))
DEFAULT_USERS_FILE = os.path.join(DATA_DIR, "login.json")


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
    path = users_file_path()
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(users, f, indent=2, ensure_ascii=False)

    return path
