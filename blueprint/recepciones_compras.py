import os
import json
from flask import Blueprint, render_template, request, jsonify
from blueprint.storage import data_file, write_json_atomic
from blueprint.db import is_db_configured
from blueprint import db_store

recepciones_bp = Blueprint('recepciones_compras', __name__, url_prefix='/recepciones')

COMPRAS_FILE = data_file("datoscompras.json")
RECEPCIONES_FILE = data_file("recepciones_compras.json")

def _read_json(path):
    if not os.path.exists(path):
        return []
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def _write_json(path, data):
    write_json_atomic(path, data, indent=4)

def _read_compras():
    if is_db_configured():
        return db_store.fetch_compras()
    return _read_json(COMPRAS_FILE)

def _read_recepciones():
    if is_db_configured():
        return db_store.fetch_recepciones()
    return _read_json(RECEPCIONES_FILE)

def _clean_recepcion_fields(data):
    if not isinstance(data, dict):
        return data
    data.pop("fecha_llegada", None)
    return data

@recepciones_bp.route('/')
def page():
    return render_template('recepciones_compras.html')

# endpoint para que el front obtenga compras pre-cargadas (solo campos necesarios)
@recepciones_bp.route('/api/compras', methods=['GET'])
def compras_para_recepcion():
    compras = _read_compras()
    # devolvemos campos de solo lectura para recepciones y resumen
    salida = []
    for c in compras:
        salida.append({
            "id": c.get("id"),
            "fecha_compra": c.get("fecha_compra"),
            "responsable_compra": c.get("responsable_compra"),
            "nombre": c.get("nombre"),
            "cliente": c.get("nombre"),
            "descripcion": c.get("descripcion"),
            "producto": c.get("descripcion"),
            "oc_coltrade": c.get("oc_coltrade"),
            "pedido_proveedor": c.get("pedido_proveedor"),
            "factura_proveedor": c.get("factura_proveedor"),
            "proveedor": c.get("proveedor"),
            "cantidad_compra": c.get("cantidad_comprada"),
            "cantidad_comprada": c.get("cantidad_comprada"),
            "precio_unitario_sin_iva": c.get("precio_unitario_sin_iva"),
            "precio_unitario_con_iva": c.get("precio_unitario_con_iva"),
            "valor_flete": c.get("valor_flete"),
            "iva_total": c.get("iva_total"),
            "valor_total_compra": c.get("valor_total_compra"),
            "estado_recepcion": c.get("estado_recepcion")
        })
    return jsonify(salida)

# obtener recepciones guardadas
@recepciones_bp.route('/api', methods=['GET'])
def get_recepciones():
    recepciones = _read_recepciones()
    salida = []
    for r in recepciones:
        salida.append(_clean_recepcion_fields(dict(r)))
    return jsonify(salida)

# crear o actualizar recepcion (por id_compra)
@recepciones_bp.route('/api/guardar', methods=['POST'])
def guardar_recepcion():
    payload = request.get_json()
    if not payload:
        return jsonify({"msg": "payload vacio"}), 400

    id_compra = payload.get("id_compra")
    if not id_compra:
        return jsonify({"msg": "id_compra requerido"}), 400
    if is_db_configured():
        recep = db_store.fetch_recepcion_by_compra(id_compra)
        unidades_recibidas = int(payload.get("unidades_recibidas", 0))
        cantidad_compra = int(payload.get("cantidad_compra", 0))

        if recep:
            recep_payload = dict(recep)
            recep_payload.pop("id", None)
            recep_payload.pop("id_compra", None)
            recep_payload.update({
                "rc_odoo": payload.get("rc_odoo"),
                "fecha_recibo_odoo": payload.get("fecha_recibo_odoo"),
                "metodo_entrega": payload.get("metodo_entrega"),
                "unidades_recibidas": unidades_recibidas,
                "observaciones_ops": payload.get("observaciones_ops", "")
            })
            _clean_recepcion_fields(recep_payload)
            recep_payload["cantidad_compra"] = cantidad_compra
            recep_payload["unidades_faltantes"] = cantidad_compra - unidades_recibidas
            db_store.update_recepcion(recep.get("id"), recep_payload)
        else:
            recepcion_nueva = {
                "id_compra": id_compra,
                "cliente": payload.get("cliente"),
                "producto": payload.get("producto"),
                "oc_coltrade": payload.get("oc_coltrade"),
                "pedido_proveedor": payload.get("pedido_proveedor"),
                "factura_proveedor": payload.get("factura_proveedor"),
                "rc_odoo": payload.get("rc_odoo"),
                "fecha_recibo_odoo": payload.get("fecha_recibo_odoo"),
                "proveedor": payload.get("proveedor"),
                "metodo_entrega": payload.get("metodo_entrega"),
                "cantidad_compra": cantidad_compra,
                "unidades_recibidas": unidades_recibidas,
                "unidades_faltantes": cantidad_compra - unidades_recibidas,
                "observaciones_ops": payload.get("observaciones_ops", "")
            }
            db_store.insert_recepcion(id_compra, recepcion_nueva)

        # actualizar compra relacionada
        compra = db_store.fetch_compra_by_id(id_compra)
        if compra:
            rec = db_store.fetch_recepcion_by_compra(id_compra)
            if rec:
                compra["unidades_recibidas"] = rec.get("unidades_recibidas", 0)
                compra["unidades_faltantes"] = rec.get(
                    "unidades_faltantes",
                    compra.get("cantidad_comprada", 0),
                )
                if compra["unidades_recibidas"] == 0:
                    compra["estado_recepcion"] = "Pendiente"
                elif compra["unidades_faltantes"] > 0:
                    compra["estado_recepcion"] = "Parcial"
                else:
                    compra["estado_recepcion"] = "Completa"
                compra_payload = dict(compra)
                compra_payload.pop("id", None)
                db_store.update_compra(id_compra, compra_payload)

        saved = db_store.fetch_recepcion_by_compra(id_compra)
        return jsonify({"msg": "guardado", "saved": saved})

    recepciones = _read_json(RECEPCIONES_FILE)

    encontrado = False
    for r in recepciones:
        if r.get("id_compra") == id_compra:
            # actualizar solo los campos editables en recepcion
            r.update({
                "rc_odoo": payload.get("rc_odoo"),
                "fecha_recibo_odoo": payload.get("fecha_recibo_odoo"),
                "metodo_entrega": payload.get("metodo_entrega"),
                "unidades_recibidas": int(payload.get("unidades_recibidas", 0)),
                "observaciones_ops": payload.get("observaciones_ops", "")
            })
            _clean_recepcion_fields(r)
            # recalcular faltantes
            cantidad_compra = int(payload.get("cantidad_compra", 0))
            r["unidades_faltantes"] = cantidad_compra - r["unidades_recibidas"]
            encontrado = True
            break

    if not encontrado:
        nuevo_id = max([x.get("id", 0) for x in recepciones], default=0) + 1
        unidades_recibidas = int(payload.get("unidades_recibidas", 0))
        cantidad_compra = int(payload.get("cantidad_compra", 0))
        recepcion_nueva = {
            "id": nuevo_id,
            "id_compra": id_compra,
            "cliente": payload.get("cliente"),
            "producto": payload.get("producto"),
            "oc_coltrade": payload.get("oc_coltrade"),
            "pedido_proveedor": payload.get("pedido_proveedor"),
            "factura_proveedor": payload.get("factura_proveedor"),
            "rc_odoo": payload.get("rc_odoo"),
            "fecha_recibo_odoo": payload.get("fecha_recibo_odoo"),
            "proveedor": payload.get("proveedor"),
            "metodo_entrega": payload.get("metodo_entrega"),
            "cantidad_compra": cantidad_compra,
            "unidades_recibidas": unidades_recibidas,
            "unidades_faltantes": cantidad_compra - unidades_recibidas,
            "observaciones_ops": payload.get("observaciones_ops", "")
        }
        recepciones.append(recepcion_nueva)

    _write_json(RECEPCIONES_FILE, recepciones)


    # tambien actualizamos el archivo de compras para mantener sincronizacion simple
    compras = _read_json(COMPRAS_FILE)
    for c in compras:
        if c.get("id") == id_compra:
            # actualizar campos resumen en compra
            rec = next((x for x in recepciones if x.get("id_compra") == id_compra), None)
            if rec:
                c["unidades_recibidas"] = rec.get("unidades_recibidas", 0)
                c["unidades_faltantes"] = rec.get("unidades_faltantes", c.get("cantidad_comprada", 0))
                # actualizar estado_recepcion
                if c["unidades_recibidas"] == 0:
                    c["estado_recepcion"] = "Pendiente"
                elif c["unidades_faltantes"] > 0:
                    c["estado_recepcion"] = "Parcial"
                else:
                    c["estado_recepcion"] = "Completa"
    _write_json(COMPRAS_FILE, compras)

    saved = next((r for r in recepciones if r.get("id_compra") == id_compra), None)
    return jsonify({"msg": "guardado", "saved": saved})
