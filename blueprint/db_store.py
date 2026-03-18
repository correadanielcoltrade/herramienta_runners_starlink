from typing import Any, Dict, List, Optional

from psycopg2.extras import Json

from blueprint.db import db_cursor


def _merge_row(row: Dict[str, Any], extra: Dict[str, Any]) -> Dict[str, Any]:
    data = row.get("data") if isinstance(row, dict) else {}
    if not isinstance(data, dict):
        data = {}
    return {**data, **extra}


def fetch_compras() -> List[Dict[str, Any]]:
    with db_cursor() as cur:
        cur.execute("SELECT id, data FROM compras ORDER BY id ASC")
        rows = cur.fetchall() or []
    return [_merge_row(r, {"id": r.get("id")}) for r in rows]


def fetch_compra_by_id(compra_id: int) -> Optional[Dict[str, Any]]:
    with db_cursor() as cur:
        cur.execute("SELECT id, data FROM compras WHERE id = %s", (compra_id,))
        row = cur.fetchone()
    if not row:
        return None
    return _merge_row(row, {"id": row.get("id")})


def insert_compra(payload: Dict[str, Any]) -> int:
    with db_cursor() as cur:
        cur.execute(
            "INSERT INTO compras (data) VALUES (%s) RETURNING id",
            (Json(payload),),
        )
        row = cur.fetchone()
    return int(row["id"])


def update_compra(compra_id: int, payload: Dict[str, Any]) -> int:
    with db_cursor() as cur:
        cur.execute(
            "UPDATE compras SET data = %s, updated_at = NOW() WHERE id = %s",
            (Json(payload), compra_id),
        )
        return int(cur.rowcount)


def delete_compra(compra_id: int) -> int:
    with db_cursor() as cur:
        cur.execute("DELETE FROM compras WHERE id = %s", (compra_id,))
        return int(cur.rowcount)


def fetch_compras_ids(ids: List[int]) -> List[int]:
    if not ids:
        return []
    with db_cursor() as cur:
        cur.execute("SELECT id FROM compras WHERE id = ANY(%s)", (ids,))
        rows = cur.fetchall() or []
    return [int(r["id"]) for r in rows]


def delete_compras(ids: List[int]) -> int:
    if not ids:
        return 0
    with db_cursor() as cur:
        cur.execute("DELETE FROM compras WHERE id = ANY(%s)", (ids,))
        return int(cur.rowcount)


def fetch_recepciones() -> List[Dict[str, Any]]:
    with db_cursor() as cur:
        cur.execute("SELECT id, id_compra, data FROM recepciones ORDER BY id ASC")
        rows = cur.fetchall() or []
    return [
        _merge_row(r, {"id": r.get("id"), "id_compra": r.get("id_compra")})
        for r in rows
    ]


def fetch_recepciones_map() -> Dict[int, Dict[str, Any]]:
    receps = fetch_recepciones()
    out: Dict[int, Dict[str, Any]] = {}
    for r in receps:
        if not r or r.get("id_compra") is None:
            continue
        try:
            key = int(r.get("id_compra"))
        except Exception:
            continue
        out[key] = r
    return out


def fetch_recepcion_by_compra(compra_id: int) -> Optional[Dict[str, Any]]:
    with db_cursor() as cur:
        cur.execute(
            "SELECT id, id_compra, data FROM recepciones WHERE id_compra = %s",
            (compra_id,),
        )
        row = cur.fetchone()
    if not row:
        return None
    return _merge_row(row, {"id": row.get("id"), "id_compra": row.get("id_compra")})


def insert_recepcion(compra_id: int, payload: Dict[str, Any]) -> int:
    with db_cursor() as cur:
        cur.execute(
            "INSERT INTO recepciones (id_compra, data) VALUES (%s, %s) RETURNING id",
            (compra_id, Json(payload)),
        )
        row = cur.fetchone()
    return int(row["id"])


def update_recepcion(recepcion_id: int, payload: Dict[str, Any]) -> int:
    with db_cursor() as cur:
        cur.execute(
            "UPDATE recepciones SET data = %s, updated_at = NOW() WHERE id = %s",
            (Json(payload), recepcion_id),
        )
        return int(cur.rowcount)


def delete_recepciones_by_compra_ids(ids: List[int]) -> int:
    if not ids:
        return 0
    with db_cursor() as cur:
        cur.execute("DELETE FROM recepciones WHERE id_compra = ANY(%s)", (ids,))
        return int(cur.rowcount)


def count_recepciones_by_compra_id(compra_id: int) -> int:
    with db_cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) AS total FROM recepciones WHERE id_compra = %s",
            (compra_id,),
        )
        row = cur.fetchone()
    return int(row["total"]) if row else 0


def count_recepciones_by_compra_ids(ids: List[int]) -> int:
    if not ids:
        return 0
    with db_cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) AS total FROM recepciones WHERE id_compra = ANY(%s)",
            (ids,),
        )
        row = cur.fetchone()
    return int(row["total"]) if row else 0


def fetch_users() -> List[Dict[str, Any]]:
    with db_cursor() as cur:
        cur.execute(
            "SELECT correo, contrasena, roles FROM usuarios ORDER BY correo ASC"
        )
        rows = cur.fetchall() or []
    out = []
    for r in rows:
        roles = r.get("roles")
        if roles is None:
            roles = []
        out.append(
            {
                "correo": r.get("correo", ""),
                "contrasena": r.get("contrasena", ""),
                "roles": roles,
            }
        )
    return out


def replace_users(users: List[Dict[str, Any]]) -> None:
    with db_cursor() as cur:
        cur.execute("DELETE FROM usuarios")
        for u in users:
            correo = str(u.get("correo", "")).strip().lower()
            contrasena = str(u.get("contrasena", "") or "").strip()
            roles = u.get("roles", [])
            cur.execute(
                "INSERT INTO usuarios (correo, contrasena, roles) VALUES (%s, %s, %s)",
                (correo, contrasena, Json(roles)),
            )
