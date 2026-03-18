import json
import os
from typing import Any, Dict, List

from psycopg2.extras import Json

from blueprint.db import is_db_configured, db_cursor
from blueprint.storage import data_file


def _read_json_list(path: str) -> List[Dict[str, Any]]:
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                return [x for x in data if isinstance(x, dict)]
            if isinstance(data, dict):
                return [data]
            return []
    except Exception:
        return []


def _table_is_empty(table: str) -> bool:
    with db_cursor() as cur:
        cur.execute(f"SELECT COUNT(*) AS total FROM {table}")
        row = cur.fetchone()
    return int(row["total"]) == 0 if row else True


def bootstrap_from_json() -> Dict[str, Any]:
    """
    Migra datos JSON existentes a Postgres si las tablas estan vacias.
    Controlado por la variable DB_BOOTSTRAP_FROM_JSON (default=1).
    """
    if not is_db_configured():
        return {"skipped": True, "reason": "db_not_configured"}

    enabled = os.getenv("DB_BOOTSTRAP_FROM_JSON", "1").strip().lower()
    if enabled in {"0", "false", "no"}:
        return {"skipped": True, "reason": "disabled"}

    compras_path = data_file("datoscompras.json")
    recepciones_path = data_file("recepciones_compras.json")
    users_path = data_file("login.json")

    compras = _read_json_list(compras_path)
    recepciones = _read_json_list(recepciones_path)
    users = _read_json_list(users_path)

    result = {
        "compras_importadas": 0,
        "recepciones_importadas": 0,
        "usuarios_importados": 0,
        "skipped": False,
    }

    compra_ids: set[int] = set()

    if compras and _table_is_empty("compras"):
        with db_cursor() as cur:
            for compra in compras:
                compra_id = compra.get("id")
                payload = dict(compra)
                payload.pop("id", None)
                if compra_id is None:
                    cur.execute(
                        "INSERT INTO compras (data) VALUES (%s)",
                        (Json(payload),),
                    )
                else:
                    try:
                        compra_id_int = int(compra_id)
                    except Exception:
                        compra_id_int = None
                    if compra_id_int is None:
                        cur.execute(
                            "INSERT INTO compras (data) VALUES (%s)",
                            (Json(payload),),
                        )
                        result["compras_importadas"] += 1
                        continue
                    cur.execute(
                        "INSERT INTO compras (id, data) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING",
                        (compra_id_int, Json(payload)),
                    )
                result["compras_importadas"] += 1
            cur.execute(
                "SELECT setval(pg_get_serial_sequence('compras', 'id'), "
                "COALESCE((SELECT MAX(id) FROM compras), 1), true)"
            )

    # Siempre obtener IDs reales de compras antes de insertar recepciones
    with db_cursor() as cur:
        cur.execute("SELECT id FROM compras")
        compra_ids = {int(r["id"]) for r in (cur.fetchall() or [])}

    if recepciones and _table_is_empty("recepciones"):
        if not compra_ids:
            result["recepciones_skipped"] = "no_compras"
            return result
        with db_cursor() as cur:
            for recep in recepciones:
                compra_id = recep.get("id_compra")
                if compra_id is None:
                    continue
                try:
                    compra_id_int = int(compra_id)
                except Exception:
                    continue
                if compra_id_int not in compra_ids:
                    continue
                payload = dict(recep)
                recep_id = payload.pop("id", None)
                payload.pop("id_compra", None)
                if recep_id is None:
                    cur.execute(
                        "INSERT INTO recepciones (id_compra, data) VALUES (%s, %s)",
                        (compra_id_int, Json(payload)),
                    )
                else:
                    cur.execute(
                        "INSERT INTO recepciones (id, id_compra, data) "
                        "VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING",
                        (int(recep_id), compra_id_int, Json(payload)),
                    )
                result["recepciones_importadas"] += 1
            cur.execute(
                "SELECT setval(pg_get_serial_sequence('recepciones', 'id'), "
                "COALESCE((SELECT MAX(id) FROM recepciones), 1), true)"
            )

    if users and _table_is_empty("usuarios"):
        with db_cursor() as cur:
            for user in users:
                correo = str(user.get("correo", "")).strip().lower()
                contrasena = str(user.get("contrasena", "") or "").strip()
                roles = user.get("roles", [])
                cur.execute(
                    "INSERT INTO usuarios (correo, contrasena, roles) VALUES (%s, %s, %s) "
                    "ON CONFLICT (correo) DO NOTHING",
                    (correo, contrasena, Json(roles)),
                )
                result["usuarios_importados"] += 1

    return result
