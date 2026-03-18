import os
import threading
import webbrowser
import jwt

from dotenv import load_dotenv

# =========================
# Cargar variables de entorno (antes de importar blueprints)
# =========================
load_dotenv()

from flask import Flask, redirect, request, jsonify
from blueprint.index import index_bp
from blueprint.login import login_bp
from blueprint.datos_compras import datos_compras_bp
from blueprint.recepciones_compras import recepciones_bp
from blueprint.admin_panel import admin_panel_bp
from blueprint.storage import get_data_dir
from blueprint.db import init_db, is_db_configured
from blueprint.db_bootstrap import bootstrap_from_json

# =========================
# Configuracion de rutas
# =========================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_DIR = os.path.join(BASE_DIR, 'templates')
STATIC_DIR = os.path.join(BASE_DIR, 'static')

# =========================
# Crear aplicacion Flask
# =========================
app = Flask(__name__, template_folder=TEMPLATE_DIR, static_folder=STATIC_DIR)
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY') or 'dev-key-solo-para-desarrollo'
app.config['DATA_DIR'] = get_data_dir()
if is_db_configured():
    init_db()
    bootstrap_from_json()

# =========================
# Registrar blueprints
# =========================
app.register_blueprint(index_bp)
app.register_blueprint(login_bp)
app.register_blueprint(datos_compras_bp)
app.register_blueprint(recepciones_bp)
app.register_blueprint(admin_panel_bp)



# =====================================================
# PERMISOS POR ROL (IMPORTANTE: antes del before_request)
# =====================================================
ROLE_PERMISSIONS = {
    "compras": [
        "/inicio/",
        "/datos-compras/",
        "/datos-compras/api"
    ],
    "recepcion": [
        "/inicio/",
        "/recepciones/",
        "/recepciones/api"
    ],
    "admin": ["*"]
}

def _role_allows_path(roles, path):
    if not roles:
        return False

    if "admin" in roles:
        return True

    for role in roles:
        allowed_paths = ROLE_PERMISSIONS.get(role, [])
        for allowed in allowed_paths:
            if allowed == "*":
                return True
            if path.startswith(allowed):
                return True

    return False

# =========================
# Rutas publicas
# =========================
PUBLIC_PREFIXES = (
    '/iniciar-sesion',
    '/static',
    '/favicon.ico',
    '/robots.txt',
)

def _is_public_path(path: str) -> bool:
    return any(path.startswith(p) for p in PUBLIC_PREFIXES)

def _is_api_like_path(path: str) -> bool:
    # Soporta rutas tipo /api/... y /modulo/api...
    return "/api" in path

# =========================
# Validar JWT
# =========================
def _validate_token(token: str):
    try:
        if not token:
            return None
        payload = jwt.decode(
            token,
            app.config['SECRET_KEY'],
            algorithms=['HS256']
        )
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
    except Exception:
        return None

# =========================
# Guard global de autenticacion
# =========================
@app.before_request
def global_auth_guard():
    path = request.path
    is_api_like = _is_api_like_path(path)

    # Permitir rutas publicas
    if _is_public_path(path):
        return None

    # Permitir preflight CORS
    if request.method == 'OPTIONS':
        return None

    # Obtener token
    token = request.cookies.get('access_token')

    if not token:
        auth = request.headers.get('Authorization', '')
        if auth.startswith('Bearer '):
            token = auth.split(' ', 1)[1]

    payload = _validate_token(token)

    # Si token valido
    if payload:
        request.user = payload
        roles = payload.get('roles', [])

        if _role_allows_path(roles, path):
            return None

        # Autenticado pero sin permiso
        if request.is_json or is_api_like:
            return jsonify({"msg": "Prohibido - sin permiso"}), 403

        return redirect('/iniciar-sesion/')

    # No autenticado
    if request.is_json or is_api_like:
        return jsonify({"msg": "No autorizado"}), 401

    return redirect('/iniciar-sesion/')

# =========================
# Contexto global para templates
# =========================
@app.context_processor
def inject_user_to_templates():
    token = request.cookies.get('access_token')
    payload = _validate_token(token) if token else None

    def has_role(role):
        if not payload:
            return False
        roles = payload.get("roles", [])
        return role in roles or "admin" in roles

    return {
        'is_authenticated': bool(payload),
        'current_user': payload or {},
        'has_role': has_role
    }

# =========================
# Ruta raiz
# =========================
@app.route('/')
def root():
    return redirect('/iniciar-sesion/')

# =========================
# Abrir navegador automaticamente
# =========================
def abrir_navegador():
    webbrowser.open_new("http://localhost:3000/iniciar-sesion/")

# =========================
# Main
# =========================
if __name__ == '__main__':

    # Obligar login en cada reinicio
    app.config['SESSION_PERMANENT'] = False
    print(f"[DATA] Carpeta persistente: {app.config.get('DATA_DIR')}")

    if (
        os.environ.get("FLASK_ENV") != "production"
        and not os.environ.get("WERKZEUG_RUN_MAIN")
    ):
        threading.Timer(1.25, abrir_navegador).start()

    app.run(
        host='0.0.0.0',
        port=3000,
        debug=os.environ.get("FLASK_ENV") == "development",
        threaded=True
    )

