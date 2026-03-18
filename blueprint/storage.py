import json
import os
import shutil
import tempfile
import zipfile
from datetime import datetime
from typing import Any

from blueprint.db import is_db_configured
from blueprint import db_store

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.normpath(os.path.join(BASE_DIR, ".."))
LEGACY_DATA_DIR = os.path.join(PROJECT_ROOT, "data")


def get_data_dir() -> str:
    """
    Carpeta de datos persistente.
    - APP_DATA_DIR tiene prioridad.
    - Si no existe, usa un directorio fuera del repo para evitar sobrescrituras en despliegues.
    """
    custom = os.getenv("APP_DATA_DIR", "").strip()
    if custom:
        path = os.path.abspath(os.path.expanduser(custom))
    else:
        # Render: si hay disco persistente montado (comunmente /var/data), usarlo
        render_hint = os.getenv("RENDER") or os.getenv("RENDER_SERVICE_ID")
        render_candidates = ["/var/data", "/data"] if render_hint else []
        render_path = next((p for p in render_candidates if os.path.isdir(p)), "")
        if render_path:
            path = os.path.join(render_path, "runners_starlink_data")
        else:
            base = os.getenv("LOCALAPPDATA") or os.path.expanduser("~")
            path = os.path.join(base, "runners_starlink_data")

    os.makedirs(path, exist_ok=True)
    return os.path.normpath(path)


def data_file(filename: str, bootstrap_from_legacy: bool = True) -> str:
    """
    Devuelve la ruta persistente de un archivo de datos.
    Si no existe, puede copiar automáticamente el archivo del ./data legado.
    """
    path = os.path.join(get_data_dir(), filename)
    if bootstrap_from_legacy and not os.path.exists(path):
        legacy = os.path.join(LEGACY_DATA_DIR, filename)
        if os.path.exists(legacy):
            os.makedirs(os.path.dirname(path), exist_ok=True)
            shutil.copy2(legacy, path)
    return os.path.normpath(path)


def get_backup_dir() -> str:
    path = os.path.join(get_data_dir(), "backups")
    os.makedirs(path, exist_ok=True)
    return os.path.normpath(path)


def list_data_files(extensions=(".json", ".xlsx")) -> list[str]:
    data_dir = get_data_dir()
    files = []
    try:
        for name in os.listdir(data_dir):
            if name.startswith("."):
                continue
            if name == "backups":
                continue
            full = os.path.join(data_dir, name)
            if not os.path.isfile(full):
                continue
            if extensions and not name.lower().endswith(tuple(extensions)):
                continue
            files.append(full)
    except Exception:
        return []
    return files


def create_backup_zip(extensions=(".json", ".xlsx")) -> dict:
    backup_dir = get_backup_dir()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    zip_name = f"backup_{timestamp}.zip"
    zip_path = os.path.join(backup_dir, zip_name)

    files = []
    temp_dir = None

    if is_db_configured():
        temp_dir = os.path.join(backup_dir, f".tmp_backup_{timestamp}")
        os.makedirs(temp_dir, exist_ok=True)

        snapshots = {
            "datoscompras.json": db_store.fetch_compras(),
            "recepciones_compras.json": db_store.fetch_recepciones(),
            "login.json": db_store.fetch_users(),
        }

        for name, payload in snapshots.items():
            path = os.path.join(temp_dir, name)
            write_json_atomic(path, payload, indent=2)
            files.append(path)

        # Incluir archivos xlsx locales si existen
        data_dir = get_data_dir()
        try:
            for name in os.listdir(data_dir):
                if not name.lower().endswith(".xlsx"):
                    continue
                full = os.path.join(data_dir, name)
                if os.path.isfile(full):
                    files.append(full)
        except Exception:
            pass
    else:
        files = list_data_files(extensions=extensions)

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in files:
            zf.write(path, arcname=os.path.basename(path))

    if temp_dir:
        try:
            shutil.rmtree(temp_dir)
        except Exception:
            pass

    return {
        "zip_name": zip_name,
        "zip_path": os.path.normpath(zip_path),
        "count": len(files),
        "files": [os.path.basename(p) for p in files]
    }


def write_json_atomic(path: str, payload: Any, indent: int = 4) -> None:
    """
    Escritura atómica para evitar archivos JSON truncados/corruptos.
    """
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)

    fd, temp_path = tempfile.mkstemp(prefix=".tmp_", suffix=".json", dir=parent or None)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=indent, ensure_ascii=False)
        os.replace(temp_path, path)
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
