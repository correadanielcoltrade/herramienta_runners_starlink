// static/js/datos_compras.js
document.addEventListener("DOMContentLoaded", () => {

  // -----------------------
  // Helpers
  // -----------------------
  const $ = (id) => document.getElementById(id);
  const getValue = (id, d = "") => { const el = $(id); return el ? el.value : d; };
  const getNumber = (id, d = 0) => {
    const el = $(id);
    if (!el) return d;
    const v = el.value;
    if (v === "" || v === null || v === undefined) return d;
    const n = Number(v);
    return Number.isNaN(n) ? d : n;
  };
  const setValue = (id, v) => { const el = $(id); if (el) el.value = v; };

  const tablaBody = $("tabla-body");
  const guardarBtn = $("guardar-btn");
  const modalTitle = $("modal-title");

  function safe(v, d = "") { return (v === undefined || v === null) ? d : v; }
  function fmtNumber(v) {
    if (v === null || v === undefined || v === "") return "";
    const n = Number(String(v).replace(/,/g, ""));
    if (Number.isNaN(n)) return v;
    return n.toLocaleString();
  }
  function normalizeDateForDisplay(value) {
    if (!value && value !== 0) return "";
    const s = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (s.includes("T")) return s.split("T")[0];
    const m = s.match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : s;
  }

  // debounce helper
  function debounce(fn, wait = 250) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  // -----------------------
  // Estado en memoria
  // -----------------------
  let allCompras = [];     // original purchases
  let allRecepciones = []; // original receptions
  const canReadRecepcionesApi =
    Boolean(document.querySelector('a[href="/recepciones/"]')) ||
    Boolean(document.querySelector('a[href="/admin-panel/"]'));


    // --- Import / Export / Template buttons ---
    const btnDescargarPlantilla = $("btn-descargar-plantilla");
    const inputImportFile = $("input-import-file");
    const btnExportar = $("btn-exportar");
    const btnExportFaltantes = $("btn-export-faltantes");
    

  if (btnDescargarPlantilla) {
    btnDescargarPlantilla.addEventListener("click", (e) => {
      e.preventDefault();
      // descarga directa
      window.location.href = "/datos-compras/template.xlsx";
    });
  }

  if (btnExportar) {
    btnExportar.addEventListener("click", (e) => {
      e.preventDefault();
      // descargar export (navegador abrirá diálogo)
      window.location.href = "/datos-compras/export";
    });
  }

  if (btnExportFaltantes) {
  btnExportFaltantes.addEventListener("click", (e) => {
    e.preventDefault();
    // descarga directa del endpoint que exporta solo faltantes
    window.location.href = "/datos-compras/export/faltantes";
  });
}


  if (inputImportFile) {
    inputImportFile.addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (!confirm(`Vas a importar el archivo: ${f.name}\n¿Continuar?`)) {
        inputImportFile.value = "";
        return;
      }

      const form = new FormData();
      form.append("file", f);

      try {
        const res = await fetch("/datos-compras/import", {
          method: "POST",
          body: form
        });

        if (!res.ok) {
          const txt = await res.text().catch(()=>"");
          alert("Error en import: " + res.status + " " + txt);
          inputImportFile.value = "";
          return;
        }

        const data = await res.json();
        let msg = `Importado: ${data.imported}\n`;
        if (data.errors && data.errors.length) {
          msg += `Errores: ${data.errors.length} (ver consola)\n`;
          console.error("Import errors:", data.errors);
        }
        if (data.new_rows) {
          msg += `Filas añadidas: ${data.new_rows.map(r=>r.id).join(", ")}`;
        }
        alert(msg);
        inputImportFile.value = "";
        // recargar tabla
        await cargarDatos();
      } catch (err) {
        console.error("Error importando:", err);
        alert("Error importando (revisa consola)");
        inputImportFile.value = "";
      }
    });
  }


  // -----------------------
  // Modal
  // -----------------------
  const modal = $("modal-compra");
  const btnNuevo = $("btn-nuevo");
  const btnCerrar = $("cerrar-modal");
  const btnLimpiar = $("limpiar-btn");
  const form = $("form-datos-compras");
  const inputId = $("id");

  const EDITABLE_FIELDS = [
    "fecha_compra",
    "responsable_compra",
    "codigo",
    "nombre",
    "tipo_id",
    "identificacion",
    "tipo_empresa",
    "email",
    "precio_unitario_sin_iva",
    "precio_unitario_con_iva",
    "cantidad_comprada",
    "valor_total_compra",
    "descripcion",
    "tipo_compra",
    "pedido_proveedor",
    "factura_proveedor",
    "oc_coltrade",
    "estado_compra",
    "tipo_entrega",
    "fecha_llegada_nodo",
    "fecha_confirmacion_recoleccion",
    "proveedor",
    "tienda_compra",
    "palabra_clave_meli",
    "banco_origen",
    "observaciones"
  ];

  function prepararModoCrear() {
    if (form) form.reset();
    if (inputId) inputId.value = "";
    if (modalTitle) modalTitle.textContent = "Nueva Compra";
    if (guardarBtn) guardarBtn.textContent = "Guardar";
    calcularValorTotal();
  }

  function prepararModoEditar(item) {
    if (!item) return;
    EDITABLE_FIELDS.forEach((fieldId) => {
      const v = item[fieldId];
      if (fieldId.includes("fecha_")) {
        setValue(fieldId, normalizeDateForDisplay(v));
      } else {
        setValue(fieldId, v ?? "");
      }
    });
    if (inputId) inputId.value = safe(item.id, "");
    if (modalTitle) modalTitle.textContent = `Editar Compra #${safe(item.id, "")}`;
    if (guardarBtn) guardarBtn.textContent = "Actualizar";
    calcularValorTotal();
  }


  function abrirModal() {
    if (!modal) return;
    modal.classList.remove("hidden");
    document.documentElement.style.overflow = "hidden";
    setTimeout(() => {
      const first = form?.querySelector("input:not([type=hidden]):not([disabled]), textarea, select");
      if (first) first.focus();
    }, 50);
  }
  function cerrarModal() {
    if (!modal) return;
    modal.classList.add("hidden");
    document.documentElement.style.overflow = "";
  }

  if (btnNuevo) btnNuevo.addEventListener("click", (e) => {
    e.preventDefault();
    prepararModoCrear();
    abrirModal();
  });
  if (btnCerrar) btnCerrar.addEventListener("click", (e) => { e.preventDefault(); cerrarModal(); });
  if (btnLimpiar && form) {
    btnLimpiar.addEventListener("click", (e) => {
      e.preventDefault();
      if (inputId?.value) {
        const currentId = Number(inputId.value);
        const currentItem = allCompras.find(x => Number(x.id) === currentId);
        if (currentItem) prepararModoEditar(currentItem);
        else prepararModoCrear();
      } else {
        prepararModoCrear();
      }
    });
  }

  if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) cerrarModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) cerrarModal(); });

  // -----------------------
  // Filtros: UI elements
  // -----------------------
  const filterSearch = $("filter-search");
  const filterFechaDesde = $("filter-fecha-desde");
  const filterFechaHasta = $("filter-fecha-hasta");
  const filterEstadoRecepcion = $("filter-estado-recepcion");
  const btnAplicarFiltros = $("btn-aplicar-filtros");
  const btnLimpiarFiltros = $("btn-limpiar-filtros");
  const tablaElement = document.querySelector(".tabla-section table");
  const tablaHeaderRow = document.querySelector(".tabla-section thead tr");
  const btnColumnas = $("btn-columnas");
  const btnColumnasReset = $("btn-columnas-reset");
  const columnasControl = $("columnas-control");
  const columnasPanel = $("columnas-panel");
  const columnasList = $("columnas-list");
  const COLUMN_PREF_KEY = "datos_compras_visible_columns_v1";
  let columnConfig = [];

  // -----------------------
  // Auto-calculo valor_total_compra
  // -----------------------
  const priceId = "precio_unitario_sin_iva";
  const qtyId = "cantidad_comprada";
  const valorTotalId = "valor_total_compra";

  function calcularValorTotal() {
    const precio = getNumber(priceId, 0);
    const cantidad = getNumber(qtyId, 0);
    const total = precio * cantidad;
    setValue(valorTotalId, isFinite(total) ? total.toFixed(2) : "");
  }
  const priceEl = $(priceId);
  const qtyEl = $(qtyId);
  if (priceEl) priceEl.addEventListener("input", calcularValorTotal);
  if (qtyEl) qtyEl.addEventListener("input", calcularValorTotal);

  // -----------------------
  // Columnas visibles (show/hide)
  // -----------------------
  function saveColumnPrefs() {
    try {
      const payload = {};
      columnConfig.forEach(c => { payload[c.index] = c.visible; });
      localStorage.setItem(COLUMN_PREF_KEY, JSON.stringify(payload));
    } catch (_) {}
  }

  function loadColumnPrefs() {
    try {
      const raw = localStorage.getItem(COLUMN_PREF_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      columnConfig.forEach(c => {
        if (Object.prototype.hasOwnProperty.call(parsed, c.index)) {
          c.visible = Boolean(parsed[c.index]);
        }
      });
    } catch (_) {}
  }

  function renderColumnOptions() {
    if (!columnasList) return;
    columnasList.innerHTML = "";

    columnConfig.forEach(c => {
      const option = document.createElement("label");
      option.className = "column-option";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = c.visible;
      input.dataset.index = String(c.index);

      const text = document.createElement("span");
      text.textContent = c.label;

      option.appendChild(input);
      option.appendChild(text);
      columnasList.appendChild(option);
    });
  }

  function setColumnVisible(index, visible) {
    const config = columnConfig.find(c => c.index === index);
    if (!config) return false;

    const visibles = columnConfig.filter(c => c.visible).length;
    if (!visible && visibles <= 1) return false;

    config.visible = visible;
    return true;
  }

  function applyColumnVisibility() {
    if (!tablaElement || !columnConfig.length) return;

    const rows = tablaElement.querySelectorAll("tr");
    rows.forEach(row => {
      const cells = Array.from(row.children);
      if (cells.length === 1 && cells[0].colSpan > 1) return;

      columnConfig.forEach(c => {
        const cell = cells[c.index];
        if (!cell) return;
        cell.style.display = c.visible ? "" : "none";
      });
    });
  }

  function initializeColumnSelector() {
    if (!tablaHeaderRow || !columnasPanel || !columnasList) return;

    const headers = Array.from(tablaHeaderRow.querySelectorAll("th"));
    columnConfig = headers.map((th, idx) => ({
      index: idx,
      label: (th.textContent || "").trim() || `Columna ${idx + 1}`,
      visible: true
    }));

    loadColumnPrefs();
    if (!columnConfig.some(c => c.visible)) {
      columnConfig.forEach(c => { c.visible = true; });
    }
    renderColumnOptions();
    applyColumnVisibility();

    if (btnColumnas) {
      btnColumnas.addEventListener("click", (e) => {
        e.preventDefault();
        columnasPanel.classList.toggle("hidden");
      });
    }

    if (btnColumnasReset) {
      btnColumnasReset.addEventListener("click", (e) => {
        e.preventDefault();
        columnConfig.forEach(c => { c.visible = true; });
        renderColumnOptions();
        applyColumnVisibility();
        saveColumnPrefs();
      });
    }

    columnasList.addEventListener("change", (e) => {
      const input = e.target.closest("input[type='checkbox']");
      if (!input) return;
      const index = Number(input.dataset.index);
      if (!Number.isFinite(index)) return;

      const ok = setColumnVisible(index, input.checked);
      if (!ok) {
        input.checked = true;
        return;
      }
      applyColumnVisibility();
      saveColumnPrefs();
    });

    document.addEventListener("click", (e) => {
      if (columnasPanel.classList.contains("hidden")) return;
      if (columnasControl && !columnasControl.contains(e.target)) {
        columnasPanel.classList.add("hidden");
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !columnasPanel.classList.contains("hidden")) {
        columnasPanel.classList.add("hidden");
      }
    });
  }

  // -----------------------
  // Render rows
  // -----------------------
  function renderRows(comprasToRender, recepcionesDict) {
    if (!tablaBody) return;
    tablaBody.innerHTML = "";

    comprasToRender.forEach(item => {
      const id = safe(item.id, "");
      const fecha_compra = safe(item.fecha_compra, "");
      const responsable_compra = safe(item.responsable_compra, "");
      const codigo = safe(item.codigo, "");
      const nombre = safe(item.nombre, "");
      const tipo_id = safe(item.tipo_id, "");
      const identificacion = safe(item.identificacion, "");
      const tipo_empresa = safe(item.tipo_empresa, "");
      const email = safe(item.email, "");
      const precio_unitario_sin_iva = safe(item.precio_unitario_sin_iva, "");
      const precio_unitario_con_iva = safe(item.precio_unitario_con_iva, "");
      const cantidad_comprada = safe(item.cantidad_comprada, "");
      const valor_total_compra = safe(item.valor_total_compra,
        (precio_unitario_sin_iva && cantidad_comprada) ? (Number(precio_unitario_sin_iva) * Number(cantidad_comprada)) : ""
      );
      const descripcion = safe(item.descripcion, "");
      const tipo_compra = safe(item.tipo_compra, "");
      const pedido_proveedor = safe(item.pedido_proveedor, "");
      const factura_proveedor = safe(item.factura_proveedor, "");
      const oc_coltrade = safe(item.oc_coltrade, "");
      const estado_compra = safe(item.estado_compra, "");
      const tipo_entrega = safe(item.tipo_entrega, "");
      const fecha_llegada_nodo = safe(item.fecha_llegada_nodo, "");
      const fecha_confirmacion_recoleccion = safe(item.fecha_confirmacion_recoleccion, "");
      const proveedor = safe(item.proveedor, "");
      const tienda_compra = safe(item.tienda_compra, "");
      const palabra_clave_meli = safe(item.palabra_clave_meli, "");
      const recepcion_en_odoo_from_compras = safe(item.recepcion_en_odoo, "");
      const fecha_recibo_from_compras = safe(item.fecha_recibo, "");
      const banco_origen = safe(item.banco_origen, "");
      const observaciones = safe(item.observaciones, "");
      const observaciones_ops_from_compras = safe(item.observaciones_ops, "");

      const recep = recepcionesDict[id] || {};
      let recepcion_rc_odoo = "";
      if (recep.rc_odoo !== undefined && recep.rc_odoo !== null && recep.rc_odoo !== "") {
        if (typeof recep.rc_odoo === "boolean") recepcion_rc_odoo = recep.rc_odoo ? "Si" : "No";
        else recepcion_rc_odoo = String(recep.rc_odoo);
      } else {
        recepcion_rc_odoo = recepcion_en_odoo_from_compras;
      }

      const fecha_recibo_recepcion =
        safe(recep.fecha_recibo_odoo, safe(recep.fecha_recibo, safe(recep.fecha_llegada, "")));
      const fecha_recibo_final = normalizeDateForDisplay(fecha_recibo_recepcion || fecha_recibo_from_compras);
      const observaciones_ops = safe(recep.observaciones_ops, observaciones_ops_from_compras);
      const unidades_recibidas = (recep.unidades_recibidas !== undefined && recep.unidades_recibidas !== null)
        ? recep.unidades_recibidas
        : safe(item.unidades_recibidas, 0);
      const unidades_faltantes = (recep.unidades_faltantes !== undefined && recep.unidades_faltantes !== null)
        ? recep.unidades_faltantes
        : (cantidad_comprada ? Number(cantidad_comprada) - Number(unidades_recibidas) : "");
      const estado_recepcion = safe(recep.estado_recepcion, safe(item.estado_recepcion, ""));

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${id}</td>
        <td>${fecha_compra}</td>
        <td>${responsable_compra}</td>
        <td>${codigo}</td>
        <td>${nombre}</td>
        <td>${tipo_id}</td>
        <td>${identificacion}</td>
        <td>${tipo_empresa}</td>
        <td>${email}</td>
        <td>${fmtNumber(precio_unitario_sin_iva)}</td>
        <td>${fmtNumber(precio_unitario_con_iva)}</td>
        <td class="cantidad-pedida">${fmtNumber(cantidad_comprada)}</td>
        <td>${fmtNumber(valor_total_compra)}</td>
        <td>${descripcion}</td>
        <td>${tipo_compra}</td>
        <td>${pedido_proveedor}</td>
        <td>${factura_proveedor}</td>
        <td>${oc_coltrade}</td>
        <td>${estado_compra}</td>
        <td>${tipo_entrega}</td>
        <td>${fecha_llegada_nodo}</td>
        <td>${fecha_confirmacion_recoleccion}</td>
        <td>${proveedor}</td>
        <td>${tienda_compra}</td>
        <td>${palabra_clave_meli}</td>
        <td>${recepcion_rc_odoo}</td>
        <td>${fecha_recibo_final}</td>
        <td>${banco_origen}</td>
        <td>${observaciones}</td>
        <td>${observaciones_ops}</td>
        <td class="unidades-recibidas">${fmtNumber(unidades_recibidas)}</td>
        <td class="unidades-faltantes">${fmtNumber(unidades_faltantes)}</td>
        <td><strong>${estado_recepcion}</strong></td>
        <td>
          <div class="row-actions">
            <button type="button" class="btn btn-row btn-edit" data-id="${id}">Editar</button>
            <button type="button" class="btn btn-row btn-delete" data-id="${id}">Eliminar</button>
          </div>
        </td>
      `;
      tablaBody.appendChild(row);

      // estado visual
      const pedidoNum = Number(cantidad_comprada) || 0;
const recibidasNum = Number(unidades_recibidas) || 0;
let faltantesNum = Number(unidades_faltantes);
if (!Number.isFinite(faltantesNum)) faltantesNum = Math.max(0, pedidoNum - recibidasNum);

const tdPedido = row.querySelector(".cantidad-pedida");
const tdRec = row.querySelector(".unidades-recibidas");
const tdFalt = row.querySelector(".unidades-faltantes");

[tdPedido, tdRec, tdFalt].forEach(el => {
  if (el) el.classList.remove("estado-completo","estado-pendiente","estado-faltante");
});

let claseEstado = "";
if (pedidoNum === 0 && recibidasNum === 0) claseEstado = "";
else if (recibidasNum >= pedidoNum && pedidoNum > 0) claseEstado = "estado-completo";
else if (recibidasNum === 0) claseEstado = "estado-pendiente";
else if (recibidasNum < pedidoNum) claseEstado = "estado-faltante";

if (claseEstado) {
  if (tdRec) tdRec.classList.add(claseEstado);
  if (tdFalt) tdFalt.classList.add(claseEstado);
  if (tdPedido) tdPedido.classList.add(claseEstado);
  row.classList.add(claseEstado);
}

if (tdFalt) tdFalt.title = `Faltantes: ${faltantesNum}`;
if (tdRec) tdRec.title = `Recibidas: ${recibidasNum}`;
if (tdPedido) tdPedido.title = `Pedido: ${pedidoNum}`;

    });

    applyColumnVisibility();
  }

  // -----------------------
  // apply filters and render
  // -----------------------
  function applyFiltersAndRender() {
    const search = (filterSearch?.value || "").trim().toLowerCase();
    const desde = filterFechaDesde?.value || "";
    const hasta = filterFechaHasta?.value || "";
    const estadoFilter = (filterEstadoRecepcion?.value || "").trim().toLowerCase();

    // recepciones dict
    const recepcionesDict = {};
    allRecepciones.forEach(r => { if (r && r.id_compra != null) recepcionesDict[r.id_compra] = r; });

    function deriveEstado(recep, compra) {
      const rEstado = (recep?.estado_recepcion || compra?.estado_recepcion || "").toString().trim().toLowerCase();
      if (rEstado) return rEstado;
      const cantidad = Number(compra?.cantidad_comprada) || 0;
      const recibidas = Number(recep?.unidades_recibidas ?? compra?.unidades_recibidas ?? 0) || 0;
      if (cantidad > 0) {
        if (recibidas >= cantidad) return "completa";
        if (recibidas === 0) return "pendiente";
        return "parcial";
      }
      return "";
    }

    const filtered = allCompras.filter(item => {
      // fecha_compra filter
      if (desde || hasta) {
        const fc = item.fecha_compra ? new Date(normalizeDateForDisplay(item.fecha_compra)) : null;
        if (desde) {
          const d = new Date(desde);
          if (!fc || fc < d) return false;
        }
        if (hasta) {
          const h = new Date(hasta);
          h.setHours(23,59,59,999);
          if (!fc || fc > h) return false;
        }
      }

      // SEARCH: ONLY text fields, IGNORING dates and numeric values
      if (search) {
        // keys to explicitly EXCLUDE from search (includes the block from responsable -> observaciones_ops and other numeric/date keys)
        const excludeKeys = new Set([
          "fecha_compra",
          "tipo_id",
          "identificacion",
          "tipo_empresa",
          "email",
          "precio_unitario_sin_iva",
          "precio_unitario_con_iva",
          "cantidad_comprada",
          "valor_total_compra",
          "fecha_llegada_nodo",
          "fecha_confirmacion_recoleccion",
          "fecha_recibo",
          "banco_origen",
          "unidades_recibidas",
          "unidades_faltantes",
          "observaciones",
          "observaciones_ops"
        ]);

        // Acceptable text fields will be any field NOT in excludeKeys and that is not numeric/date
        const datePattern = /^\d{4}-\d{2}-\d{2}/;
        const numberPattern = /^-?\d+(\.\d+)?$/;

        // Merge compra + recepcion (so we can search fields coming from recepciones as well)
        const rec = recepcionesDict[item.id] || {};
        const merged = Object.assign({}, item, rec);

        const hay = Object.entries(merged).some(([k, v]) => {
          if (excludeKeys.has(k)) return false;
          if (v === null || v === undefined) return false;
          const s = String(v).trim();
          if (!s) return false;
          // skip if looks like date
          if (datePattern.test(s)) return false;
          // skip if numeric (clean punctuation)
          if (numberPattern.test(s.replace(/[,\.\s]/g, ""))) return false;
          // then check contains
          return s.toLowerCase().includes(search);
        });

        if (!hay) return false;
      }

      // estado_recepcion filter
      if (estadoFilter) {
        const rec = recepcionesDict[item.id] || {};
        const estadoDer = deriveEstado(rec, item).toLowerCase();
        if (estadoFilter === "parcial") {
          if (estadoDer !== "parcial") return false;
        } else {
          if (estadoDer !== estadoFilter) return false;
        }
      }

      return true;
    });

    renderRows(filtered, recepcionesDict);
  }

  const debouncedApply = debounce(applyFiltersAndRender, 200);

  // eventos filtros
  if (filterSearch) filterSearch.addEventListener("input", () => debouncedApply());
  if (filterFechaDesde) filterFechaDesde.addEventListener("change", () => applyFiltersAndRender());
  if (filterFechaHasta) filterFechaHasta.addEventListener("change", () => applyFiltersAndRender());
  if (filterEstadoRecepcion) filterEstadoRecepcion.addEventListener("change", () => applyFiltersAndRender());
  if (btnAplicarFiltros) btnAplicarFiltros.addEventListener("click", (e) => { e.preventDefault(); applyFiltersAndRender(); });
  if (btnLimpiarFiltros) btnLimpiarFiltros.addEventListener("click", (e) => {
    e.preventDefault();
    if (filterSearch) filterSearch.value = "";
    if (filterFechaDesde) filterFechaDesde.value = "";
    if (filterFechaHasta) filterFechaHasta.value = "";
    if (filterEstadoRecepcion) filterEstadoRecepcion.value = "";
    applyFiltersAndRender();
  });

  // -----------------------
  // Cargar datos
  // -----------------------
  async function safeReadJson(res) {
    if (!res) return null;
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("application/json")) return null;
    try {
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  async function cargarDatos() {
    if (!tablaBody) return;
    try {
      const resCompras = await fetch("/datos-compras/api", {
        headers: { "Accept": "application/json" }
      });

      if (!resCompras.ok) {
        tablaBody.innerHTML = `<tr><td colspan="34">Error al cargar datos compras (${resCompras.status})</td></tr>`;
        return;
      }

      let recepcionesData = [];
      if (canReadRecepcionesApi) {
        const resRecepciones = await fetch("/recepciones/api", {
          headers: { "Accept": "application/json" }
        });
        if (resRecepciones.ok) {
          const parsedRecepciones = await safeReadJson(resRecepciones);
          if (Array.isArray(parsedRecepciones)) recepcionesData = parsedRecepciones;
        }
      }

      const compras = await safeReadJson(resCompras);
      if (!Array.isArray(compras)) {
        tablaBody.innerHTML = `<tr><td colspan="34">Respuesta invalida del API de compras.</td></tr>`;
        return;
      }

      allCompras = Array.isArray(compras) ? compras : [];
      allRecepciones = Array.isArray(recepcionesData) ? recepcionesData : [];

      applyFiltersAndRender();
    } catch (err) {
      console.error("Error en cargarDatos:", err);
      if (tablaBody) tablaBody.innerHTML = `<tr><td colspan="34">Error al procesar datos</td></tr>`;
    }
  }

  // -----------------------
  // Editar / Eliminar (acciones en tabla)
  // -----------------------
  if (tablaBody) {
    tablaBody.addEventListener("click", async (e) => {
      const btnEdit = e.target.closest(".btn-edit");
      const btnDelete = e.target.closest(".btn-delete");

      if (btnEdit) {
        const id = Number(btnEdit.dataset.id);
        if (!Number.isFinite(id)) return;
        const item = allCompras.find(x => Number(x.id) === id);
        if (!item) {
          alert("No se encontro el registro para editar.");
          return;
        }
        prepararModoEditar(item);
        abrirModal();
        return;
      }

      if (btnDelete) {
        const id = Number(btnDelete.dataset.id);
        if (!Number.isFinite(id)) return;

        const item = allCompras.find(x => Number(x.id) === id);
        const ref = item?.oc_coltrade || item?.pedido_proveedor || item?.codigo || `ID ${id}`;
        const ok = confirm(`Se eliminara el registro ${ref}.\nEsta accion no se puede deshacer.\n\nDeseas continuar?`);
        if (!ok) return;

        try {
          const res = await fetch(`/datos-compras/api/${id}`, {
            method: "DELETE"
          });
          if (!res.ok) {
            const txt = await res.text().catch(()=>"");
            alert("Error eliminando registro: " + res.status + "\n" + txt);
            return;
          }
          await cargarDatos();
          if (inputId?.value && Number(inputId.value) === id) cerrarModal();
          alert("Registro eliminado correctamente.");
        } catch (err) {
          console.error("Error eliminando compra:", err);
          alert("Error eliminando registro (revisa consola).");
        }
      }
    });
  }

  // -----------------------
  // Guardar compra
  // -----------------------
  if (guardarBtn) {
    guardarBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const currentId = getValue("id").trim();
      const payload = {
        fecha_compra: getValue("fecha_compra"),
        responsable_compra: getValue("responsable_compra"),
        codigo: getValue("codigo"),
        nombre: getValue("nombre"),
        tipo_id: getValue("tipo_id"),
        identificacion: getValue("identificacion"),
        tipo_empresa: getValue("tipo_empresa"),
        email: getValue("email"),
        precio_unitario_sin_iva: getNumber("precio_unitario_sin_iva", 0),
        precio_unitario_con_iva: getNumber("precio_unitario_con_iva", 0),
        cantidad_comprada: getNumber("cantidad_comprada", 0),
        valor_total_compra: getNumber("valor_total_compra", 0),
        descripcion: getValue("descripcion"),
        tipo_compra: getValue("tipo_compra"),
        pedido_proveedor: getValue("pedido_proveedor"),
        factura_proveedor: getValue("factura_proveedor"),
        oc_coltrade: getValue("oc_coltrade"),
        estado_compra: getValue("estado_compra"),
        tipo_entrega: getValue("tipo_entrega"),
        fecha_llegada_nodo: getValue("fecha_llegada_nodo"),
        fecha_confirmacion_recoleccion: getValue("fecha_confirmacion_recoleccion"),
        proveedor: getValue("proveedor"),
        tienda_compra: getValue("tienda_compra"),
        palabra_clave_meli: getValue("palabra_clave_meli"),
        banco_origen: getValue("banco_origen"),
        observaciones: getValue("observaciones")
      };

      if (!payload.valor_total_compra || payload.valor_total_compra === 0) payload.valor_total_compra = Number(payload.precio_unitario_sin_iva) * Number(payload.cantidad_comprada);

      try {
        const isEdit = Boolean(currentId);
        const url = isEdit ? `/datos-compras/api/${currentId}` : "/datos-compras/api";
        const method = isEdit ? "PUT" : "POST";

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const txt = await res.text().catch(()=>"");
          console.error("Error al guardar compra", res.status, txt);
          alert("Error al guardar compra: " + res.status);
          return;
        }

        await cargarDatos();
        cerrarModal();
        alert(isEdit ? "Compra actualizada correctamente" : "Compra guardada correctamente");
      } catch (err) {
        console.error("Error guardando compra:", err);
        alert("Error al guardar (ver consola)");
      }
    });
  } else {
    console.warn("guardar-btn no encontrado en DOM.");
  }

  // -----------------------
  // Inicial
  // -----------------------
  initializeColumnSelector();
  prepararModoCrear();
  calcularValorTotal();
  cargarDatos();

});
