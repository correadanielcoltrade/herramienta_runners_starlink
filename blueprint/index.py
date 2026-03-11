import os
import json
import re
import io
from datetime import datetime, date
from flask import Blueprint, render_template, request, redirect, url_for, flash, send_file, send_from_directory, jsonify
import pandas as pd
from blueprint.storage import data_file, get_data_dir, write_json_atomic

index_bp = Blueprint('inicio', __name__, url_prefix='/inicio')

# Datos persistentes (fuera del repo por defecto, configurable con APP_DATA_DIR)
DATA_DIR = get_data_dir()
JSON_PATH = data_file("mercadolibre.json")
TEMPLATE_XLSX = data_file("DataMercadoLibre.xlsx")
COMPRAS_PATH = data_file("datoscompras.json")
RECEPCIONES_PATH = data_file("recepciones_compras.json")

# Asegurar que la carpeta existe
os.makedirs(os.path.dirname(JSON_PATH), exist_ok=True)


# ----------------------------- Helpers -----------------------------
def parse_price_text(text):
    """Extrae números de un string de precio y devuelve int (valor en pesos sin separadores)."""
    if text is None:
        return None
    s = str(text)
    digits = re.sub(r"[^\d]", "", s)
    if not digits:
        return None
    try:
        return int(digits)
    except Exception:
        try:
            return int(float(digits))
        except Exception:
            return None

def to_python_native(v):
    """Convierte tipos pandas/numpy a tipos nativos para json."""
    try:
        import numpy as _np
    except Exception:
        _np = None
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except Exception:
        pass
    if _np is not None:
        if isinstance(v, (_np.integer,)):
            return int(v)
        if isinstance(v, (_np.floating,)):
            return float(v)
        if isinstance(v, (_np.bool_,)):
            return bool(v)
    if isinstance(v, (int, float, bool, str)):
        return v
    if isinstance(v, (datetime,)):
        return v.strftime("%d/%m/%Y")
    return str(v)

def parse_to_date(value):
    """
    Convierte distintos formatos a datetime.date.
    Acepta objetos date/datetime o strings en varios formatos.
    Devuelve datetime.date o None.
    """
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()

    s = str(value).strip()
    if not s:
        return None

    fmts = [
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%Y/%m/%d",
        "%d.%m.%Y",
        "%Y.%m.%d",
        "%d%m%Y",
        "%Y%m%d"
    ]
    for fmt in fmts:
        try:
            dt = datetime.strptime(s, fmt)
            return dt.date()
        except Exception:
            continue

    digits = ''.join(ch for ch in s if ch.isdigit())
    if len(digits) == 8:
        for fmt in ("%d%m%Y", "%Y%m%d"):
            try:
                dt = datetime.strptime(digits, fmt)
                return dt.date()
            except Exception:
                continue
    return None

def normalize_date_to_ddmmyyyy(value):
    d = parse_to_date(value)
    return d.strftime("%d/%m/%Y") if d else None

def _read_json_list(path):
    """Lee un JSON y garantiza lista como salida."""
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
            if isinstance(data, dict):
                return [data]
            return []
    except Exception:
        return []

def _to_int(value, default=0):
    try:
        if value is None or value == "":
            return default
        return int(value)
    except Exception:
        try:
            return int(float(value))
        except Exception:
            return default

def _to_float(value, default=0.0):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except Exception:
        return default

def _calcular_totales_compra(compra):
    if not isinstance(compra, dict):
        return compra
    precio_sin = _to_float(compra.get("precio_unitario_sin_iva", 0), 0.0)
    precio_con = _to_float(compra.get("precio_unitario_con_iva", 0), 0.0)
    cantidad = max(0, _to_int(compra.get("cantidad_comprada", 0), 0))
    flete = _to_float(compra.get("valor_flete", 0), 0.0)

    precio_base = precio_con if precio_con > 0 else precio_sin
    iva_total = max(0.0, (precio_con - precio_sin) * cantidad)
    valor_total = (precio_base * cantidad) + flete

    compra["precio_unitario_sin_iva"] = precio_sin
    compra["precio_unitario_con_iva"] = precio_con
    compra["cantidad_comprada"] = cantidad
    compra["valor_flete"] = flete
    compra["iva_total"] = iva_total
    compra["valor_total_compra"] = valor_total
    return compra

def _derive_estado_recepcion(cantidad, recibidas):
    if cantidad > 0:
        if recibidas >= cantidad:
            return "Completa"
        if recibidas == 0:
            return "Pendiente"
        return "Parcial"
    return "Pendiente"


@index_bp.route('/api/resumen-compras', methods=['GET'])
def resumen_compras_api():
    """
    Endpoint de resumen para dashboard.
    Unifica compras + recepciones para que funcione con roles de compras y recepcion.
    """
    compras = _read_json_list(COMPRAS_PATH)
    recepciones = _read_json_list(RECEPCIONES_PATH)
    recepciones_dict = {
        r.get("id_compra"): r
        for r in recepciones
        if isinstance(r, dict) and r.get("id_compra") is not None
    }

    salida = []
    for compra in compras:
        if not isinstance(compra, dict):
            continue

        compra = _calcular_totales_compra(dict(compra))
        id_compra = compra.get("id")
        cantidad = max(0, _to_int(compra.get("cantidad_comprada", 0), 0))

        recep = recepciones_dict.get(id_compra, {})
        unidades_recibidas = max(
            0,
            _to_int(recep.get("unidades_recibidas", compra.get("unidades_recibidas", 0)), 0)
        )
        if cantidad > 0:
            unidades_recibidas = min(unidades_recibidas, cantidad)

        unidades_faltantes = max(0, cantidad - unidades_recibidas)
        estado_recepcion = _derive_estado_recepcion(cantidad, unidades_recibidas)

        salida.append({
            **compra,
            "unidades_recibidas": unidades_recibidas,
            "unidades_faltantes": unidades_faltantes,
            "estado_recepcion": estado_recepcion
        })

    return jsonify(salida)


# ----------------------------- Rutas -----------------------------
@index_bp.route('/', methods=['GET'])
def index():
    """
    Página principal: muestra registros, permite filtrar por rango de fecha.
    (La importación se realiza en /import)
    """
    filter_from_raw = request.args.get("filter_from", "").strip()
    filter_to_raw = request.args.get("filter_to", "").strip()
    # compat: single date param
    filter_date_raw = request.args.get("filter_date", "").strip()
    if filter_date_raw and not (filter_from_raw or filter_to_raw):
        filter_from_raw = filter_date_raw
        filter_to_raw = filter_date_raw

    date_from = parse_to_date(filter_from_raw) if filter_from_raw else None
    date_to = parse_to_date(filter_to_raw) if filter_to_raw else None

    # cargar JSON
    all_data = []
    try:
        if os.path.exists(JSON_PATH) and os.path.getsize(JSON_PATH) > 0:
            with open(JSON_PATH, "r", encoding="utf-8") as f:
                try:
                    all_data = json.load(f)
                    if not isinstance(all_data, list):
                        all_data = [all_data]
                except json.JSONDecodeError:
                    all_data = []
    except Exception:
        all_data = []

    # Construir lista con índices globales para permitir borrar por índice real
    records_with_index = []
    if date_from or date_to:
        for i, rec in enumerate(all_data):
            fecha_raw = rec.get("scraped_at") or rec.get("scrapedAt") or rec.get("fecha") or None
            rec_date = parse_to_date(fecha_raw)
            if not rec_date:
                continue
            if date_from and date_to:
                if date_from <= rec_date <= date_to:
                    rec_copy = dict(rec)
                    rec_copy["_idx"] = i
                    records_with_index.append(rec_copy)
            elif date_from and not date_to:
                if rec_date == date_from:
                    rec_copy = dict(rec)
                    rec_copy["_idx"] = i
                    records_with_index.append(rec_copy)
            elif date_to and not date_from:
                if rec_date == date_to:
                    rec_copy = dict(rec)
                    rec_copy["_idx"] = i
                    records_with_index.append(rec_copy)
    else:
        for i, rec in enumerate(all_data):
            rec_copy = dict(rec)
            rec_copy["_idx"] = i
            records_with_index.append(rec_copy)

    total_count = len(all_data)
    filtered_count = len(records_with_index) if (date_from or date_to) else 0
    display_list = records_with_index[:500]  # limitar a 500 para no cargar demasiado

    relative_path_display = JSON_PATH
    return render_template(
        'index.html',
        path=relative_path_display,
        count=total_count,
        filtered_count=filtered_count,
        filter_from=filter_from_raw,
        filter_to=filter_to_raw,
        date_from_normalized=normalize_date_to_ddmmyyyy(filter_from_raw),
        date_to_normalized=normalize_date_to_ddmmyyyy(filter_to_raw),
        records=display_list
    )


# ----------------- IMPORT / PLANTILLA -----------------
@index_bp.route('/import', methods=['POST'])
def import_excel():
    """
    Importa un archivo Excel (.xlsx/.xls). Normaliza columnas y guarda en JSON.
    Ahora soporta la columna 'category' (o 'categoria') y 'platform' (o 'plataforma').
    """
    if 'file' not in request.files:
        flash("No se envió ningún archivo.", "warning")
        return redirect(url_for('inicio.index'))

    file = request.files['file']
    if not file or not file.filename.lower().endswith(('.xlsx', '.xls')):
        flash("Sube un archivo Excel válido (.xlsx o .xls).", "warning")
        return redirect(url_for('inicio.index'))

    try:
        df = pd.read_excel(file)
    except Exception as e:
        flash(f"Error al leer Excel: {e}", "danger")
        return redirect(url_for('inicio.index'))

    # Mapeo de nombres de columnas (tolerante)
    mapping = {}
    for col in df.columns:
        nl = str(col).strip().lower()
        if nl in ("title", "titulo", "nombre"):
            mapping[col] = "title"
        elif nl in ("link", "url", "href"):
            mapping[col] = "link"
        elif nl in ("img", "image", "imagen", "img_src", "imagen_url"):
            mapping[col] = "img"
        elif nl in ("badge", "destacado"):
            mapping[col] = "badge"
        elif nl in ("seller", "vendedor", "tienda"):
            mapping[col] = "seller"
        elif nl in ("rating", "calificacion", "puntaje"):
            mapping[col] = "rating"
        elif nl in ("reviews_total", "reviews", "reseñas", "reseñas_total", "reviews total"):
            mapping[col] = "reviews_total"
        elif nl in ("previous_price", "precio_anterior", "precio anterior", "old_price"):
            mapping[col] = "previous_price"
        elif nl in ("current_price", "precio", "precio_actual", "price"):
            mapping[col] = "current_price"
        elif nl in ("discount", "descuento"):
            mapping[col] = "discount"
        elif nl in ("installments", "cuotas"):
            mapping[col] = "installments"
        elif nl in ("shipping", "envio", "envío"):
            mapping[col] = "shipping"
        elif nl in ("source_url", "origen", "fuente"):
            mapping[col] = "source_url"
        elif nl in ("scraped_at", "fecha", "scrape_date", "scraped"):
            mapping[col] = "scraped_at"
        elif nl in ("category", "categoria", "categoria_nombre"):
            mapping[col] = "category"
        elif nl in ("platform", "plataforma", "plataform"):
            # NUEVO: plataforma / platform
            mapping[col] = "platform"
        else:
            mapping[col] = col

    if mapping:
        df = df.rename(columns=mapping)

    # Normalizar columnas y tipos
    records = []
    for _, row in df.iterrows():
        rec = {}
        # incluir category y platform además de las otras columnas
        for k in ("category", "platform", "title", "link", "img", "badge", "seller", "discount", "installments", "shipping", "source_url"):
            if k in row and not pd.isna(row[k]):
                rec[k] = str(row[k]).strip()
            else:
                rec[k] = None

        # rating
        if "rating" in row and not pd.isna(row["rating"]):
            try:
                rec["rating"] = float(row["rating"])
            except Exception:
                try:
                    rec["rating"] = float(str(row["rating"]).replace(",", "."))
                except Exception:
                    rec["rating"] = None
        else:
            rec["rating"] = None

        # reviews_total
        if "reviews_total" in row and not pd.isna(row["reviews_total"]):
            try:
                rec["reviews_total"] = int(re.sub(r"[^\d]", "", str(row["reviews_total"])))
            except Exception:
                rec["reviews_total"] = None
        else:
            rec["reviews_total"] = None

        # prices
        if "previous_price" in row and not pd.isna(row["previous_price"]):
            rec["previous_price"] = parse_price_text(row["previous_price"])
        else:
            rec["previous_price"] = None
        if "current_price" in row and not pd.isna(row["current_price"]):
            rec["current_price"] = parse_price_text(row["current_price"])
        else:
            rec["current_price"] = None

        # scraped_at (normalizar fecha)
        if "scraped_at" in row and not pd.isna(row["scraped_at"]):
            norm = normalize_date_to_ddmmyyyy(row["scraped_at"])
            rec["scraped_at"] = norm if norm else str(row["scraped_at"]).strip()
        else:
            rec["scraped_at"] = datetime.now().strftime("%d/%m/%Y")

        # Convertir a tipos nativos y añadir
        rec_native = {k: to_python_native(v) for k, v in rec.items()}
        records.append(rec_native)

    # Cargar JSON existente y extender
    try:
        if os.path.exists(JSON_PATH) and os.path.getsize(JSON_PATH) > 0:
            with open(JSON_PATH, "r", encoding="utf-8") as f:
                try:
                    existing = json.load(f)
                    if not isinstance(existing, list):
                        existing = []
                except json.JSONDecodeError:
                    existing = []
        else:
            existing = []
    except Exception:
        existing = []

    existing.extend(records)
    try:
        write_json_atomic(JSON_PATH, existing, indent=4)
    except Exception as e:
        flash(f"Error al guardar JSON: {e}", "danger")
        return redirect(url_for('inicio.index'))

    flash(f"Se importaron {len(records)} registros desde el Excel ✅", "success")
    return redirect(url_for('inicio.index'))


@index_bp.route('/download-template', methods=['GET'])
def download_template():
    """
    Sirve la plantilla DataMercadoLibre.xlsx desde data/
    """
    if not os.path.exists(TEMPLATE_XLSX):
        flash("Plantilla no encontrada en data/DataMercadoLibre.xlsx", "danger")
        return redirect(url_for('inicio.index'))

    directory = os.path.dirname(TEMPLATE_XLSX)
    filename = os.path.basename(TEMPLATE_XLSX)
    return send_from_directory(directory, filename, as_attachment=True)


# ----------------- ELIMINAR -----------------
@index_bp.route('/delete_all', methods=['POST'])
def delete_all():
    try:
        if os.path.exists(JSON_PATH):
            write_json_atomic(JSON_PATH, [], indent=4)
            flash("Registros eliminados correctamente ✅", "success")
        else:
            write_json_atomic(JSON_PATH, [], indent=4)
            flash("Archivo JSON creado vacío (no había registros antes).", "info")
    except Exception as e:
        flash(f"Error al eliminar registros: {e}", "danger")
    return redirect(url_for('inicio.index'))


@index_bp.route('/delete_filtered', methods=['POST'])
def delete_filtered():
    date_from_raw = request.form.get("date_from", "").strip()
    date_to_raw = request.form.get("date_to", "").strip()
    single_raw = request.form.get("date", "").strip()
    if single_raw and not (date_from_raw or date_to_raw):
        date_from_raw = single_raw
        date_to_raw = single_raw

    if not (date_from_raw or date_to_raw):
        flash("No se recibió fecha(s) para eliminar.", "warning")
        return redirect(url_for('inicio.index'))

    date_from = parse_to_date(date_from_raw) if date_from_raw else None
    date_to = parse_to_date(date_to_raw) if date_to_raw else None

    if not date_from and not date_to:
        flash("Formato de fecha no reconocido. Usa los selectores de fecha.", "warning")
        return redirect(url_for('inicio.index'))

    if date_from and not date_to:
        date_to = date_from
    if date_to and not date_from:
        date_from = date_to

    try:
        if os.path.exists(JSON_PATH) and os.path.getsize(JSON_PATH) > 0:
            with open(JSON_PATH, "r", encoding="utf-8") as f:
                try:
                    data = json.load(f)
                    if not isinstance(data, list):
                        data = [data]
                except json.JSONDecodeError:
                    data = []
        else:
            data = []
    except Exception as e:
        flash(f"Error al leer JSON: {e}", "danger")
        return redirect(url_for('inicio.index'))

    remaining = []
    removed_count = 0
    for rec in data:
        fecha_raw = rec.get("scraped_at") or rec.get("scrapedAt") or rec.get("fecha") or None
        rec_date = parse_to_date(fecha_raw)
        if not rec_date:
            remaining.append(rec)
            continue
        if date_from <= rec_date <= date_to:
            removed_count += 1
            continue
        remaining.append(rec)

    try:
        write_json_atomic(JSON_PATH, remaining, indent=4)
    except Exception as e:
        flash(f"Error al escribir JSON: {e}", "danger")
        return redirect(url_for('inicio.index'))

    flash(f"Se eliminaron {removed_count} registro(s) entre {normalize_date_to_ddmmyyyy(date_from_raw)} y {normalize_date_to_ddmmyyyy(date_to_raw)}.", "success")
    return redirect(url_for('inicio.index'))


# ----------------- ELIMINAR UNO -----------------
@index_bp.route('/delete/<int:idx>', methods=['POST'])
def delete_single(idx):
    """
    Elimina un único registro por su índice real en el JSON (0-based).
    """
    try:
        if os.path.exists(JSON_PATH) and os.path.getsize(JSON_PATH) > 0:
            with open(JSON_PATH, "r", encoding="utf-8") as f:
                try:
                    data = json.load(f)
                    if not isinstance(data, list):
                        data = [data]
                except json.JSONDecodeError:
                    data = []
        else:
            data = []
    except Exception as e:
        flash(f"Error al leer JSON: {e}", "danger")
        return redirect(url_for('inicio.index'))

    if idx < 0 or idx >= len(data):
        flash("Índice inválido o registro ya eliminado.", "warning")
        return redirect(url_for('inicio.index'))

    try:
        removed = data.pop(idx)
        write_json_atomic(JSON_PATH, data, indent=4)
        title = removed.get("title") if isinstance(removed, dict) else None
        flash(f"Registro eliminado: {title or f'Índice {idx}'}", "success")
    except Exception as e:
        flash(f"Error al eliminar el registro: {e}", "danger")

    return redirect(url_for('inicio.index'))


# ----------------- EXPORTAR A EXCEL -----------------
@index_bp.route('/download-excel', methods=['GET'])
def download_excel():
    """
    Lee mercadolibre.json y devuelve un Excel con su contenido.
    """
    try:
        if os.path.exists(JSON_PATH) and os.path.getsize(JSON_PATH) > 0:
            with open(JSON_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if not isinstance(data, list):
                    data = [data]
        else:
            data = []
    except Exception as e:
        flash(f"Error al leer JSON para exportar: {e}", "danger")
        return redirect(url_for('inicio.index'))

    if not data:
        flash("No hay datos para exportar.", "warning")
        return redirect(url_for('inicio.index'))

    df = pd.json_normalize(data)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='mercadolibre')
    output.seek(0)

    filename = f"mercadolibre_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return send_file(output, download_name=filename, as_attachment=True)
