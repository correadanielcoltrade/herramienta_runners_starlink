import os
import threading
from contextlib import contextmanager

import psycopg2
from psycopg2.pool import ThreadedConnectionPool
from psycopg2.extras import RealDictCursor


_POOL = None
_POOL_LOCK = threading.Lock()


def is_db_configured() -> bool:
    if os.getenv("DATABASE_URL", "").strip():
        return True
    required = ("DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD")
    return all(os.getenv(k, "").strip() for k in required)


def _resolve_sslmode() -> str:
    env = os.getenv("DB_SSLMODE", "").strip()
    if env:
        return env

    url = os.getenv("DATABASE_URL", "")
    host = os.getenv("DB_HOST", "")
    if "render.com" in (url or "") or "render.com" in (host or ""):
        return "require"

    return "prefer"


def _build_pool() -> ThreadedConnectionPool:
    url = os.getenv("DATABASE_URL", "").strip()
    sslmode = _resolve_sslmode()

    if url:
        if "sslmode=" in url:
            return ThreadedConnectionPool(1, 10, dsn=url)
        return ThreadedConnectionPool(1, 10, dsn=url, sslmode=sslmode)

    host = os.getenv("DB_HOST", "").strip()
    name = os.getenv("DB_NAME", "").strip()
    user = os.getenv("DB_USER", "").strip()
    password = os.getenv("DB_PASSWORD", "").strip()
    port = os.getenv("DB_PORT", "5432").strip()

    return ThreadedConnectionPool(
        1,
        10,
        host=host,
        dbname=name,
        user=user,
        password=password,
        port=port,
        sslmode=sslmode,
    )


def get_pool() -> ThreadedConnectionPool:
    global _POOL
    if _POOL is None:
        with _POOL_LOCK:
            if _POOL is None:
                _POOL = _build_pool()
    return _POOL


@contextmanager
def db_cursor():
    if not is_db_configured():
        raise RuntimeError("DB no configurada. Define DATABASE_URL o DB_* en entorno.")

    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


def init_db() -> None:
    if not is_db_configured():
        return

    schema_sql = """
    CREATE TABLE IF NOT EXISTS compras (
        id SERIAL PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS recepciones (
        id SERIAL PRIMARY KEY,
        id_compra INTEGER NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_recepciones_id_compra ON recepciones(id_compra);

    CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        correo TEXT NOT NULL UNIQUE,
        contrasena TEXT NOT NULL,
        roles JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """

    with db_cursor() as cur:
        cur.execute(schema_sql)
