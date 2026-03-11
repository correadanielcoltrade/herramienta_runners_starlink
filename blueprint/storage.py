import json
import os
import shutil
import tempfile
from typing import Any

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
