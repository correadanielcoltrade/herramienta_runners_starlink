from flask import Blueprint, render_template, request, jsonify, current_app, make_response, redirect
import datetime
import jwt
from werkzeug.security import check_password_hash
from blueprint.user_store import load_users

login_bp = Blueprint('login', __name__, url_prefix='/iniciar-sesion')

@login_bp.route('/', methods=['GET'])
def login_page():
    return render_template('login.html')

@login_bp.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json() or {}
    correo = (data.get('correo') or data.get('email') or "").strip().lower()
    contrasena = data.get('contrasena') or data.get('password')

    if not correo or not contrasena:
        return jsonify({"msg": "correo y contrasena son requeridos"}), 400

    try:
        users = load_users()
    except Exception as e:
        return jsonify({"msg": "Error leyendo credenciales", "error": str(e)}), 500

    if not users:
        return jsonify({"msg": "No hay usuarios configurados en el servidor"}), 503

    user = next((u for u in users if str(u.get('correo', '')).strip().lower() == correo), None)
    if not user:
        return jsonify({"msg": "Credenciales invalidas"}), 401

    # si guardas hash en login.json:
    stored = user.get('contrasena', '')
    # si usas check_password_hash uncomment la siguiente linea:
    # if not check_password_hash(stored, contrasena):
    #     return jsonify({"msg": "Credenciales invalidas"}), 401

    # si guardas plain (no recomendado):
    if stored != contrasena:
        return jsonify({"msg": "Credenciales invalidas"}), 401

    roles = user.get('roles', [])  # lista de roles del usuario

    secret = current_app.config.get('SECRET_KEY', 'cambia_esto_por_una_clave_segura')
    payload = {
        "correo": correo,
        "roles": roles,
        "iat": datetime.datetime.utcnow(),
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=8)
    }
    token = jwt.encode(payload, secret, algorithm='HS256')
    if isinstance(token, bytes):
        token = token.decode('utf-8')

    resp = make_response(jsonify({"msg": "ok"}), 200)
    resp.set_cookie(
        'access_token',
        token,
        httponly=True,
        samesite='Lax',
        secure=False,   # poner True en produccion con HTTPS
        max_age=8*3600
    )
    return resp

@login_bp.route('/api/logout', methods=['POST'])
def api_logout():
    # Borrar la cookie (API)
    resp = make_response(jsonify({"msg": "logged out"}), 200)
    resp.set_cookie('access_token', '', expires=0)
    return resp

@login_bp.route('/logout', methods=['GET'])
def get_logout():
    """
    Ruta útil para redirecciones desde el frontend:
    Borra la cookie y redirige a la página de login.
    """
    resp = make_response(redirect('/iniciar-sesion/'))
    resp.set_cookie('access_token', '', expires=0)
    return resp
