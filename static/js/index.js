// static/js/index.js
document.addEventListener("DOMContentLoaded", () => {

  // elementos
  const filterDesde = document.getElementById("filter-fecha-desde");
  const filterHasta = document.getElementById("filter-fecha-hasta");
  const filterEstado = document.getElementById("filter-estado");
  const filterProveedor = document.getElementById("filter-proveedor");
  const filterResponsable = document.getElementById("filter-responsable");
  const filterCliente = document.getElementById("filter-cliente");
  const btnAplicar = document.getElementById("btn-aplicar-filtros");
  const btnLimpiar = document.getElementById("btn-limpiar-filtros");
  const searchBox = document.getElementById("searchBox");

  const statTotalCompras = document.getElementById("stat-total-compras");
  const statOrdenesCompletas = document.getElementById("stat-ordenes-completas");
  const statOrdenesPendientes = document.getElementById("stat-ordenes-pendientes");
  const statTotalUnidades = document.getElementById("stat-total-unidades");
  const statUnidadesRecibidas = document.getElementById("stat-unidades-recibidas");
  const statUnidadesFaltantes = document.getElementById("stat-unidades-faltantes");
  const statValorTotal = document.getElementById("stat-valor-total");
  const statValorRecibido = document.getElementById("stat-valor-recibido");
  const statValorFaltante = document.getElementById("stat-valor-faltante");

  const faltantesBody = document.getElementById("faltantes-body");
  const faltantesCount = document.getElementById("faltantes-count");
  const recibidasBody = document.getElementById("recibidas-body");
  const recibidasCount = document.getElementById("recibidas-count");
  const pendientesBody = document.getElementById("pendientes-body");
  const pendientesCount = document.getElementById("pendientes-count");
  const canReadRecepcionesApi =
    Boolean(document.querySelector('a[href="/recepciones/"]')) ||
    Boolean(document.querySelector('a[href="/admin-panel/"]'));

  // Estado local
  let allCompras = [];

  // helpers
  function normalizeDateForFilter(v) {
    if (!v && v !== 0) return "";
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (s.includes("T")) return s.split("T")[0];
    const m = s.match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : "";
  }

  function parseNumber(v) {
    if (v === null || v === undefined || v === "") return 0;
    const n = Number(String(v).toString().replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function fmtMoney(v) {
    return Number(v || 0).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
  }

  function normalizeEstado(value) {
    return String(value || "").trim().toLowerCase();
  }

  function deriveEstadoFromValues(cantidad, recibidas) {
    if (cantidad > 0) {
      if (recibidas >= cantidad) return "completa";
      if (recibidas === 0) return "pendiente";
      return "parcial";
    }
    return "";
  }

  function buildOrderKey(item, idx) {
    const oc = String(item.oc_coltrade || "").trim().toLowerCase();
    if (oc) return `oc:${oc}`;

    if (item.id !== null && item.id !== undefined && String(item.id).trim() !== "") {
      return `id:${String(item.id).trim()}`;
    }

    const fallback = [
      item.pedido_proveedor,
      item.factura_proveedor,
      item.proveedor,
      item.nombre,
      normalizeDateForFilter(item.fecha_compra)
    ]
      .map(v => String(v || "").trim().toLowerCase())
      .join("|");

    if (fallback.replace(/\|/g, "")) return `fb:${fallback}`;
    return `row:${idx}`;
  }

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

  async function fetchJsonArray(url) {
    try {
      const res = await fetch(url, { headers: { "Accept": "application/json" } });
      const data = await safeReadJson(res);
      return {
        ok: res.ok && Array.isArray(data),
        status: res.status,
        data: Array.isArray(data) ? data : []
      };
    } catch (_) {
      return { ok: false, status: 0, data: [] };
    }
  }

  function buildResumenFromRecepcion(comprasBase, recepciones) {
    const recepcionesMap = new Map();
    (Array.isArray(recepciones) ? recepciones : []).forEach(r => {
      if (!r || r.id_compra === null || r.id_compra === undefined) return;
      recepcionesMap.set(Number(r.id_compra), r);
    });

    return (Array.isArray(comprasBase) ? comprasBase : []).map(c => {
      const id = Number(c.id ?? c.id_compra ?? 0);
      const recep = recepcionesMap.get(id) || {};
      const cantidad = Math.max(0, parseNumber(c.cantidad_comprada ?? c.cantidad_compra ?? 0));
      const recibidasRaw = Math.max(0, parseNumber(recep.unidades_recibidas ?? 0));
      const recibidas = cantidad > 0 ? Math.min(recibidasRaw, cantidad) : recibidasRaw;
      const faltantes = Math.max(0, parseNumber(recep.unidades_faltantes ?? (cantidad - recibidas)));
      const estado = normalizeEstado(recep.estado_recepcion) || deriveEstadoFromValues(cantidad, recibidas);

      return {
        id,
        fecha_compra: c.fecha_compra || "",
        responsable_compra: c.responsable_compra || "",
        nombre: c.nombre || c.cliente || "",
        descripcion: c.descripcion || c.producto || "",
        proveedor: c.proveedor || "",
        oc_coltrade: c.oc_coltrade || "",
        pedido_proveedor: c.pedido_proveedor || "",
        factura_proveedor: c.factura_proveedor || "",
        cantidad_comprada: cantidad,
        precio_unitario_sin_iva: parseNumber(c.precio_unitario_sin_iva || 0),
        precio_unitario_con_iva: parseNumber(c.precio_unitario_con_iva || 0),
        valor_flete: parseNumber(c.valor_flete || 0),
        valor_total_compra: parseNumber(c.valor_total_compra || 0),
        unidades_recibidas: recibidas,
        unidades_faltantes: faltantes,
        estado_recepcion: estado
      };
    });
  }

  // cargar datos desde el endpoint que ya tienes
  async function fetchData() {
    try {
      // 1) Usuarios compras/admin (endpoint principal)
      const comprasResp = await fetchJsonArray("/datos-compras/api");
      if (comprasResp.ok) {
        allCompras = comprasResp.data;
        populateFilters(allCompras);
        applyAndRender();
        return;
      }

      let comprasRecepResp = { ok: false, status: -1, data: [] };
      if (canReadRecepcionesApi) {
        // 2) Usuarios recepcion/admin (combinar endpoints recepciones)
        comprasRecepResp = await fetchJsonArray("/recepciones/api/compras");
        if (comprasRecepResp.ok) {
          const recepResp = await fetchJsonArray("/recepciones/api");
          allCompras = buildResumenFromRecepcion(comprasRecepResp.data, recepResp.data);
          populateFilters(allCompras);
          applyAndRender();
          return;
        }
      }

      // 3) Fallback final al endpoint unificado (si existe en esta version backend)
      const resumenResp = await fetchJsonArray("/inicio/api/resumen-compras");
      if (resumenResp.ok) {
        allCompras = resumenResp.data;
        populateFilters(allCompras);
        applyAndRender();
        return;
      }

      throw new Error(
        `Error cargando datos: compras=${comprasResp.status}, recepcion=${comprasRecepResp.status}, resumen=${resumenResp.status}`
      );
    } catch (err) {
      console.error(err);
      faltantesBody.innerHTML = `<tr><td colspan="8" class="muted">Error al cargar datos.</td></tr>`;
      if (recibidasBody) recibidasBody.innerHTML = `<tr><td colspan="8" class="muted">Error al cargar datos.</td></tr>`;
      if (pendientesBody) pendientesBody.innerHTML = `<tr><td colspan="8" class="muted">Error al cargar datos.</td></tr>`;
    }
  }

  // llenar selects con valores unicos
  function uniqueSorted(arr) {
    return Array.from(new Set(arr.filter(Boolean))).sort((a,b)=> String(a).localeCompare(String(b)));
  }
  function populateFilters(data) {
    const proveedores = uniqueSorted(data.map(d => d.proveedor));
    const responsables = uniqueSorted(data.map(d => d.responsable_compra));
    const clientes = uniqueSorted(data.map(d => d.nombre));

    // helper fill
    function fillSelect(sel, values) {
      if (!sel) return;
      const current = sel.value || "";
      sel.innerHTML = `<option value="">Todos</option>` + values.map(v=>`<option value="${escapeHtmlAttr(v)}">${escapeHtml(v)}</option>`).join("");
      if (current) sel.value = current;
    }

    fillSelect(filterProveedor, proveedores);
    fillSelect(filterResponsable, responsables);
    fillSelect(filterCliente, clientes);
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
  }
  function escapeHtmlAttr(s){ return (s===null||s===undefined)?"":String(s).replaceAll('"','&quot;'); }

  // filtrar y renderizar todo
  function applyAndRender() {
    const desde = filterDesde?.value || "";
    const hasta = filterHasta?.value || "";
    const estado = (filterEstado?.value || "").trim().toLowerCase();
    const proveedor = (filterProveedor?.value || "").trim().toLowerCase();
    const responsable = (filterResponsable?.value || "").trim().toLowerCase();
    const cliente = (filterCliente?.value || "").trim().toLowerCase();
    const q = (searchBox?.value || "").trim().toLowerCase();

    // aplicar filtros
    const filtered = allCompras.filter(item => {
      // fecha
      const fcStr = normalizeDateForFilter(item.fecha_compra);
      if (desde) {
        if (!fcStr || new Date(fcStr) < new Date(desde)) return false;
      }
      if (hasta) {
        if (!fcStr || new Date(fcStr) > new Date(hasta)) return false;
      }

      // estado derivado o campo
      const estadoItem = normalizeEstado(item.estado_recepcion) || deriveEstadoFromItem(item);
      if (estado && estadoItem !== estado) return false;

      if (proveedor && (String(item.proveedor || "").toLowerCase().indexOf(proveedor) === -1)) return false;
      if (responsable && (String(item.responsable_compra || "").toLowerCase().indexOf(responsable) === -1)) return false;
      if (cliente && (String(item.nombre || "").toLowerCase().indexOf(cliente) === -1)) return false;

      // busqueda global: buscar en todas las propiedades relevantes
      if (q) {
        // keys to ignore except values; we'll check common text fields
        const hay = [
          item.responsable_compra, item.nombre, item.descripcion,
          item.proveedor, item.oc_coltrade, item.pedido_proveedor, item.factura_proveedor
        ].some(v => v && String(v).toLowerCase().includes(q));
        if (!hay) return false;
      }

      return true;
    });

    renderStats(filtered);
    renderFaltantesTable(filtered);
    renderRecibidasTable(filtered);
    renderPendientesTable(filtered);
  }

  // derivar estado en caso de no venir
  function deriveEstadoFromItem(item) {
    const cantidad = Math.max(0, parseNumber(item.cantidad_comprada || item.cantidad_compra || 0));
    const recibidasRaw = Math.max(0, parseNumber(item.unidades_recibidas || 0));
    const recibidas = cantidad > 0 ? Math.min(recibidasRaw, cantidad) : recibidasRaw;
    return deriveEstadoFromValues(cantidad, recibidas);
  }

  function computeValores(item, cantidad, recibidas, faltantes) {
    const precioSin = parseNumber(item.precio_unitario_sin_iva || 0);
    const precioCon = parseNumber(item.precio_unitario_con_iva || 0);
    const flete = parseNumber(item.valor_flete || 0);
    const precioBase = precioCon > 0 ? precioCon : precioSin;

    let total = parseNumber(item.valor_total_compra || 0);
    if (!total) total = (precioBase * cantidad) + flete;

    let fleteRec = 0;
    let fleteFalt = 0;
    if (cantidad > 0 && flete > 0) {
      fleteRec = flete * (recibidas / cantidad);
      fleteFalt = flete * (faltantes / cantidad);
    }

    return {
      precioBase,
      flete,
      total,
      valorRecibido: (precioBase * recibidas) + fleteRec,
      valorFaltante: (precioBase * faltantes) + fleteFalt
    };
  }

  // calcular y renderizar tarjetas
  function renderStats(data) {
    const totalCompras = data.length;
    let totalOrdenesCompletas = 0;
    let totalOrdenesPendientes = 0;
    let totalUnidades = 0;
    let totalRecibidas = 0;
    let totalFaltantes = 0;
    let valorTotal = 0;
    let valorRecibido = 0;
    let valorFaltante = 0;

    data.forEach((item) => {
      const cantidad = Math.max(0, parseNumber(item.cantidad_comprada || item.cantidad_compra || 0));
      const recibidasRaw = Math.max(0, parseNumber(item.unidades_recibidas || 0));
      const recibidas = cantidad > 0 ? Math.min(recibidasRaw, cantidad) : recibidasRaw;
      const faltantes = Math.max(0, parseNumber(item.unidades_faltantes ?? (cantidad - recibidas)));
      const estadoItem = normalizeEstado(item.estado_recepcion) || deriveEstadoFromValues(cantidad, recibidas);
      const valores = computeValores(item, cantidad, recibidas, faltantes);

      totalUnidades += cantidad;
      totalRecibidas += recibidas;
      totalFaltantes += faltantes;

      valorTotal += valores.total;
      valorRecibido += valores.valorRecibido;
      valorFaltante += valores.valorFaltante;
      if (estadoItem === "completa") totalOrdenesCompletas += 1;
      if (estadoItem === "pendiente") totalOrdenesPendientes += 1;
    });

    statTotalCompras.textContent = totalCompras.toLocaleString();
    if (statOrdenesCompletas) statOrdenesCompletas.textContent = totalOrdenesCompletas.toLocaleString();
    if (statOrdenesPendientes) statOrdenesPendientes.textContent = totalOrdenesPendientes.toLocaleString();
    statTotalUnidades.textContent = totalUnidades.toLocaleString();
    statUnidadesRecibidas.textContent = totalRecibidas.toLocaleString();
    statUnidadesFaltantes.textContent = totalFaltantes.toLocaleString();
    statValorTotal.textContent = fmtMoney(valorTotal);
    statValorRecibido.textContent = fmtMoney(valorRecibido);
    statValorFaltante.textContent = fmtMoney(valorFaltante);
  }

  // render tabla de faltantes (solo parciales)
  function renderFaltantesTable(data) {
    const filas = data
      .map(item => {
        const cantidad = Math.max(0, parseNumber(item.cantidad_comprada || item.cantidad_compra || 0));
        const recibidasRaw = Math.max(0, parseNumber(item.unidades_recibidas || 0));
        const recibidas = cantidad > 0 ? Math.min(recibidasRaw, cantidad) : recibidasRaw;
        const faltantes = Math.max(0, parseNumber(item.unidades_faltantes ?? (cantidad - recibidas)));
        const estado = normalizeEstado(item.estado_recepcion) || deriveEstadoFromValues(cantidad, recibidas);
        const valores = computeValores(item, cantidad, recibidas, faltantes);
        return { item, cantidad, recibidas, faltantes, valores, estado };
      })
      .filter(r => (r.estado === "parcial" && r.recibidas > 0 && r.faltantes > 0));

    if (filas.length === 0) {
      faltantesBody.innerHTML = `<tr><td colspan="8" class="muted">No hay ordenes parcialmente recibidas con los filtros aplicados.</td></tr>`;
      faltantesCount.textContent = "0";
      return;
    }

    const rowsHtml = filas.map(r => {
      const fecha = normalizeDateForFilter(r.item.fecha_compra) || "";
      const valorF = r.valores.valorFaltante;
      return `<tr>
        <td>${escapeHtml(fecha)}</td>
        <td>${escapeHtml(r.item.oc_coltrade || "")}</td>
        <td>${escapeHtml(r.item.pedido_proveedor || "")}</td>
        <td>${escapeHtml(r.item.factura_proveedor || "")}</td>
        <td>${escapeHtml(r.item.proveedor || "")}</td>
        <td style="text-align:right;">${r.cantidad.toLocaleString()}</td>
        <td style="text-align:right;">${r.faltantes.toLocaleString()}</td>
        <td style="text-align:right;">${fmtMoney(valorF)}</td>
      </tr>`;
    }).join("");

    faltantesBody.innerHTML = rowsHtml;
    faltantesCount.textContent = String(filas.length);
  }

  function mapCompraRow(item) {
    const cantidad = Math.max(0, parseNumber(item.cantidad_comprada || item.cantidad_compra || 0));
    const recibidasRaw = Math.max(0, parseNumber(item.unidades_recibidas || 0));
    const recibidas = cantidad > 0 ? Math.min(recibidasRaw, cantidad) : recibidasRaw;
    const faltantes = Math.max(0, parseNumber(item.unidades_faltantes ?? (cantidad - recibidas)));
    const estado = normalizeEstado(item.estado_recepcion) || deriveEstadoFromValues(cantidad, recibidas);
    const valores = computeValores(item, cantidad, recibidas, faltantes);
    return { item, cantidad, recibidas, faltantes, valores, estado };
  }

  function renderRecibidasTable(data) {
    if (!recibidasBody || !recibidasCount) return;

    const filas = data
      .map(mapCompraRow)
      .filter(r => r.estado === "completa");

    if (filas.length === 0) {
      recibidasBody.innerHTML = `<tr><td colspan="8" class="muted">No hay ordenes completas con los filtros aplicados.</td></tr>`;
      recibidasCount.textContent = "0";
      return;
    }

    const rowsHtml = filas.map(r => {
      const fecha = normalizeDateForFilter(r.item.fecha_compra) || "";
      const valorRec = r.valores.valorRecibido;
      return `<tr>
        <td>${escapeHtml(fecha)}</td>
        <td>${escapeHtml(r.item.oc_coltrade || "")}</td>
        <td>${escapeHtml(r.item.pedido_proveedor || "")}</td>
        <td>${escapeHtml(r.item.factura_proveedor || "")}</td>
        <td>${escapeHtml(r.item.proveedor || "")}</td>
        <td style="text-align:right;">${r.cantidad.toLocaleString()}</td>
        <td style="text-align:right;">${r.recibidas.toLocaleString()}</td>
        <td style="text-align:right;">${fmtMoney(valorRec)}</td>
      </tr>`;
    }).join("");

    recibidasBody.innerHTML = rowsHtml;
    recibidasCount.textContent = String(filas.length);
  }

  function renderPendientesTable(data) {
    if (!pendientesBody || !pendientesCount) return;

    const filas = data
      .map(mapCompraRow)
      .filter(r => r.estado === "pendiente");

    if (filas.length === 0) {
      pendientesBody.innerHTML = `<tr><td colspan="8" class="muted">No hay ordenes pendientes con los filtros aplicados.</td></tr>`;
      pendientesCount.textContent = "0";
      return;
    }

    const rowsHtml = filas.map(r => {
      const fecha = normalizeDateForFilter(r.item.fecha_compra) || "";
      const valorPend = r.valores.valorFaltante;
      return `<tr>
        <td>${escapeHtml(fecha)}</td>
        <td>${escapeHtml(r.item.oc_coltrade || "")}</td>
        <td>${escapeHtml(r.item.pedido_proveedor || "")}</td>
        <td>${escapeHtml(r.item.factura_proveedor || "")}</td>
        <td>${escapeHtml(r.item.proveedor || "")}</td>
        <td style="text-align:right;">${r.cantidad.toLocaleString()}</td>
        <td style="text-align:right;">${r.faltantes.toLocaleString()}</td>
        <td style="text-align:right;">${fmtMoney(valorPend)}</td>
      </tr>`;
    }).join("");

    pendientesBody.innerHTML = rowsHtml;
    pendientesCount.textContent = String(filas.length);
  }

  // Eventos UI
  if (btnAplicar) btnAplicar.addEventListener("click", (e)=>{ e.preventDefault(); applyAndRender(); });
  if (btnLimpiar) {
    btnLimpiar.addEventListener("click", (e)=> {
      e.preventDefault();
      filterDesde.value = "";
      filterHasta.value = "";
      filterEstado.value = "";
      filterProveedor.value = "";
      filterResponsable.value = "";
      filterCliente.value = "";
      if (searchBox) searchBox.value = "";
      applyAndRender();
    });
  }

  // debounce para searchBox
  let tSearch = null;
  if (searchBox) {
    searchBox.addEventListener("input", (e) => {
      clearTimeout(tSearch);
      tSearch = setTimeout(()=> applyAndRender(), 180);
    });
    // ESC borra
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        searchBox.value = "";
        applyAndRender();
      }
    });
  }

  // init
  fetchData();
});
