from typing import List, Dict, Any
from flask import Blueprint, render_template, request, jsonify
from blueprint.user_store import load_users, save_users

admin_panel_bp = Blueprint("admin_panel", __name__, url_prefix="/admin-panel")

ALLOWED_ROLES = {"compras", "recepcion", "admin"}


def _read_users() -> List[Dict[str, Any]]:
    return load_users()


def _write_users(users: List[Dict[str, Any]]) -> None:
    save_users(users)


def _normalize_email(value: str) -> str:
    return (value or "").strip().lower()


def _normalize_roles(roles_raw) -> List[str]:
    if not isinstance(roles_raw, list):
        return []
    roles = []
    for r in roles_raw:
        rr = str(r or "").strip().lower()
        if rr in ALLOWED_ROLES and rr not in roles:
            roles.append(rr)
    return roles


def _count_admins(users: List[Dict[str, Any]]) -> int:
    return sum(1 for u in users if "admin" in _normalize_roles(u.get("roles", [])))


@admin_panel_bp.route("/", methods=["GET"])
def admin_page():
    return render_template("admin_panel.html")


@admin_panel_bp.route("/api/users", methods=["GET"])
def api_get_users():
    try:
        users = _read_users()
    except Exception as e:
        return jsonify({"msg": "Error leyendo usuarios", "error": str(e)}), 500

    out = []
    for u in users:
        correo = _normalize_email(u.get("correo", ""))
        if not correo:
            continue
        roles = _normalize_roles(u.get("roles", []))
        out.append({
            "correo": correo,
            "roles": roles,
            "has_password": bool(str(u.get("contrasena", "")).strip())
        })
    out.sort(key=lambda x: x["correo"])
    return jsonify(out)


@admin_panel_bp.route("/api/users", methods=["POST"])
def api_create_user():
    payload = request.get_json() or {}
    correo = _normalize_email(payload.get("correo", ""))
    contrasena = str(payload.get("contrasena", "") or "").strip()
    roles = _normalize_roles(payload.get("roles", []))

    if not correo or "@" not in correo:
        return jsonify({"msg": "Correo invalido"}), 400
    if not contrasena:
        return jsonify({"msg": "Contrasena requerida"}), 400
    if not roles:
        return jsonify({"msg": "Debes asignar al menos un rol"}), 400

    try:
        users = _read_users()
    except Exception as e:
        return jsonify({"msg": "Error leyendo usuarios", "error": str(e)}), 500

    if any(_normalize_email(u.get("correo", "")) == correo for u in users):
        return jsonify({"msg": "El usuario ya existe"}), 409

    users.append({
        "correo": correo,
        "contrasena": contrasena,
        "roles": roles
    })
    try:
        _write_users(users)
    except Exception as e:
        return jsonify({"msg": "Error guardando usuarios", "error": str(e)}), 500

    return jsonify({"msg": "Usuario creado", "correo": correo}), 201


@admin_panel_bp.route("/api/users/<path:correo>", methods=["PUT"])
def api_update_user(correo):
    correo_original = _normalize_email(correo)
    if not correo_original:
        return jsonify({"msg": "Correo invalido"}), 400

    payload = request.get_json() or {}
    correo_nuevo = _normalize_email(payload.get("correo", correo_original))
    contrasena_nueva = str(payload.get("contrasena", "") or "").strip()
    roles_nuevos = _normalize_roles(payload.get("roles", []))

    if not correo_nuevo or "@" not in correo_nuevo:
        return jsonify({"msg": "Correo invalido"}), 400
    if not roles_nuevos:
        return jsonify({"msg": "Debes asignar al menos un rol"}), 400

    try:
        users = _read_users()
    except Exception as e:
        return jsonify({"msg": "Error leyendo usuarios", "error": str(e)}), 500

    idx = next((i for i, u in enumerate(users) if _normalize_email(u.get("correo", "")) == correo_original), -1)
    if idx == -1:
        return jsonify({"msg": "Usuario no encontrado"}), 404

    if correo_nuevo != correo_original:
        if any(_normalize_email(u.get("correo", "")) == correo_nuevo for u in users):
            return jsonify({"msg": "El correo nuevo ya existe"}), 409

    # Evitar dejar el sistema sin admins
    if "admin" not in roles_nuevos:
        current_roles = _normalize_roles(users[idx].get("roles", []))
        removing_admin = "admin" in current_roles
        if removing_admin and _count_admins(users) <= 1:
            return jsonify({"msg": "No puedes quitar el ultimo usuario admin"}), 400

    users[idx]["correo"] = correo_nuevo
    users[idx]["roles"] = roles_nuevos
    if contrasena_nueva:
        users[idx]["contrasena"] = contrasena_nueva

    try:
        _write_users(users)
    except Exception as e:
        return jsonify({"msg": "Error guardando usuarios", "error": str(e)}), 500

    return jsonify({"msg": "Usuario actualizado", "correo": correo_nuevo})


@admin_panel_bp.route("/api/users/<path:correo>", methods=["DELETE"])
def api_delete_user(correo):
    correo = _normalize_email(correo)
    if not correo:
        return jsonify({"msg": "Correo invalido"}), 400

    try:
        users = _read_users()
    except Exception as e:
        return jsonify({"msg": "Error leyendo usuarios", "error": str(e)}), 500

    idx = next((i for i, u in enumerate(users) if _normalize_email(u.get("correo", "")) == correo), -1)
    if idx == -1:
        return jsonify({"msg": "Usuario no encontrado"}), 404

    user_roles = _normalize_roles(users[idx].get("roles", []))
    if "admin" in user_roles and _count_admins(users) <= 1:
        return jsonify({"msg": "No puedes eliminar el ultimo usuario admin"}), 400

    users.pop(idx)
    try:
        _write_users(users)
    except Exception as e:
        return jsonify({"msg": "Error guardando usuarios", "error": str(e)}), 500

    return jsonify({"msg": "Usuario eliminado", "correo": correo})
