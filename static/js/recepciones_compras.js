// static/js/recepciones_compras.js
document.addEventListener("DOMContentLoaded", () => {
  const tabla = document.getElementById("tabla-recepciones");

  // referencias filtro (se asumen en el HTML)
  const filtroEstadoEl = document.getElementById("filter-estado-recepcion-recep");
  const btnLimpiarFiltro = document.getElementById("btn-limpiar-filtro-recep");
  const inputBusquedaEl = document.getElementById("input-busqueda-recep"); // <-- buscador global
  const pageSizeSelect = document.getElementById("recepciones-page-size");
  const pagePrevBtn = document.getElementById("recepciones-page-prev");
  const pageNextBtn = document.getElementById("recepciones-page-next");
  const pageInfo = document.getElementById("recepciones-page-info");
  const pageTotal = document.getElementById("recepciones-page-total");

  // =======================
  // Helpers
  // =======================
  // Normaliza cualquier string de fecha para que quede en YYYY-MM-DD
  // Soporta:
  //  - "YYYY-MM-DD"         -> retorna igual
  //  - "YYYY-MM-DDTHH:MM:SS" -> retorna "YYYY-MM-DD"
  //  - "2026-02-18T14:03:35.448Z" -> retorna "2026-02-18"
  //  - null/undefined -> ""
  function normalizeDateForInput(value) {
    if (!value && value !== 0) return "";
    const s = String(value);
    // si ya es YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // si tiene T (ISO) tomar parte antes de T
    if (s.includes("T")) return s.split("T")[0];
    // intentar extraer pattern de fecha en la cadena
    const m = s.match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : "";
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
  function escapeAttr(str) { return escapeHtml(str); }

  // determina el estado derivado (igual lógica que en datos_compras)
  function deriveEstado(recep, compra) {
    const rEstado = (recep?.estado_recepcion || compra?.estado_recepcion || "")?.toString()?.trim()?.toLowerCase();
    if (rEstado) return rEstado;
    const cantidad = Number(compra?.cantidad_comprada ?? compra?.cantidad_compra ?? 0) || 0;
    const recibidas = Number(recep?.unidades_recibidas ?? compra?.unidades_recibidas ?? 0) || 0;
    if (cantidad > 0) {
      if (recibidas >= cantidad) return "completa";
      if (recibidas === 0) return "pendiente";
      return "parcial";
    }
    return "";
  }

  // Aplica clase visual según pedido / recibidas
  function aplicarEstadoVisual(tr, pedidoNum, recibidasNum) {
    tr.classList.remove("estado-completo", "estado-pendiente", "estado-faltante");

    const pedido = Number.isFinite(Number(pedidoNum)) ? Number(pedidoNum) : 0;
    const recibidas = Number.isFinite(Number(recibidasNum)) ? Number(recibidasNum) : 0;

    if (pedido === 0 && recibidas === 0) return;

    if (recibidas >= pedido && pedido > 0) {
      tr.classList.add("estado-completo");
      return;
    }
    if (recibidas === 0) {
      tr.classList.add("estado-pendiente");
      return;
    }
    if (recibidas < pedido) {
      tr.classList.add("estado-faltante");
      return;
    }
  }

  // -----------------------
  // BUSCADOR GLOBAL
  // -----------------------
  // texto de búsqueda global (en memoria)
  let textoBusqueda = "";

  function cumpleBusquedaGlobal(compra, recep) {
    if (!textoBusqueda) return true;
    const texto = textoBusqueda.toLowerCase();

    // combinar compra + recepcion para buscar en ambos
    const combinado = { ...compra, ...recep };

    return Object.values(combinado).some(valor => {
      if (valor === null || valor === undefined) return false;
      // convertir a string y normalizar
      return String(valor).toLowerCase().includes(texto);
    });
  }

  // =======================
  // Estado en memoria (para poder re-render con filtros)
  // =======================
  let lastCompras = [];
  let lastRecepcionesDict = {};
  const pageState = {
    page: 1,
    pageSize: 10
  };

  function updatePaginationUI(totalItems) {
    const totalPages = Math.max(1, Math.ceil(totalItems / pageState.pageSize));
    if (pageState.page > totalPages) pageState.page = totalPages;

    if (pageInfo) pageInfo.textContent = `Pagina ${pageState.page} de ${totalPages}`;
    if (pageTotal) pageTotal.textContent = `${totalItems.toLocaleString()} registros`;
    if (pagePrevBtn) pagePrevBtn.disabled = pageState.page <= 1;
    if (pageNextBtn) pageNextBtn.disabled = pageState.page >= totalPages;
    if (pageSizeSelect) pageSizeSelect.value = String(pageState.pageSize);
  }

  // =======================
  // Cargar datos desde backend
  // =======================
  async function loadData() {
    if (!tabla) return;
    try {
      const [resCompras, resRecepciones] = await Promise.all([
        fetch("/recepciones/api/compras"),
        fetch("/recepciones/api")
      ]);

      if (!resCompras.ok) throw new Error("/recepciones/api/compras -> " + resCompras.status);
      if (!resRecepciones.ok) throw new Error("/recepciones/api -> " + resRecepciones.status);

      const compras = await resCompras.json();
      const recepciones = await resRecepciones.json();

      const recepcionesDict = {};
      recepciones.forEach(r => { if (r && r.id_compra != null) recepcionesDict[r.id_compra] = r; });

      // guardar en memoria
      lastCompras = Array.isArray(compras) ? compras : [];
      lastRecepcionesDict = recepcionesDict;

      // render
      renderTable(lastCompras, lastRecepcionesDict);
    } catch (err) {
      console.error("Error cargando datos recepciones:", err);
      if (tabla) tabla.innerHTML = `<tr><td colspan="15">Error al cargar datos: ${escapeHtml(err.message || String(err))}</td></tr>`;
    }
  }

  // =======================
  // Render tabla (aplica filtro si existe)
  // =======================
  function renderTable(compras, recepcionesDict) {
    if (!tabla) return;
    tabla.innerHTML = "";

    const filtro = (filtroEstadoEl?.value || "").trim().toLowerCase();
    const filtered = [];

    compras.forEach(item => {
      const idCompra = item.id;
      const recep = recepcionesDict[idCompra] || {};

      // derivar estado y aplicar filtro (si aplica)
      const estadoDer = deriveEstado(recep, item) || "";

      if (filtro && filtro !== "" && estadoDer !== filtro) {
        // no mostrar esta fila
        return;
      }

      // FILTRO BUSQUEDA GLOBAL
      if (!cumpleBusquedaGlobal(item, recep)) {
        return;
      }

      filtered.push({ item, recep });
    });

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageState.pageSize));
    if (pageState.page > totalPages) pageState.page = totalPages;

    if (totalItems === 0) {
      tabla.innerHTML = `<tr><td colspan="15">No hay registros con los filtros aplicados.</td></tr>`;
      updatePaginationUI(0);
      return;
    }

    const start = (pageState.page - 1) * pageState.pageSize;
    const end = start + pageState.pageSize;
    const pageRows = filtered.slice(start, end);

    pageRows.forEach(({ item, recep }) => {
      const idCompra = item.id;
      const cliente = item.cliente || item.nombre || "";
      const producto = item.producto || item.descripcion || "";
      const oc_coltrade = item.oc_coltrade || "";
      const pedido_proveedor = item.pedido_proveedor || "";
      const factura_proveedor = item.factura_proveedor || "";
      const proveedor = item.proveedor || "";
      const cantidad_compra = Number(item.cantidad_compra ?? item.cantidad_comprada ?? 0);

      // valores para inputs (normalizados)
      const rc_odoo_val = (recep.rc_odoo === true || String(recep.rc_odoo).toLowerCase() === "si") ? "Si" : (String(recep.rc_odoo) === "No" ? "No" : (recep.rc_odoo || "No"));
      const fecha_recibo_odoo_val = normalizeDateForInput(recep.fecha_recibo_odoo || recep.fecha_recibo);
      const metodo_entrega_val = recep.metodo_entrega || "";
      const unidades_recibidas_val = Number(recep.unidades_recibidas || 0);
      const unidades_faltantes_val = Number(recep.unidades_faltantes ?? (cantidad_compra - unidades_recibidas_val));
      const observaciones_ops_val = recep.observaciones_ops || "";

      const tr = document.createElement("tr");

      tr.dataset.idCompra = String(idCompra);
      tr.dataset.cantidadCompra = String(cantidad_compra);

      tr.innerHTML = `
        <td class="cell-id">${escapeHtml(String(idCompra))}</td>
        <td class="cell-cliente"><div class="readonly">${escapeHtml(cliente)}</div></td>
        <td class="cell-producto"><div class="readonly">${escapeHtml(producto)}</div></td>
        <td class="cell-oc"><div class="readonly">${escapeHtml(oc_coltrade)}</div></td>
        <td class="cell-pedido"><div class="readonly">${escapeHtml(pedido_proveedor)}</div></td>
        <td class="cell-factura"><div class="readonly">${escapeHtml(factura_proveedor)}</div></td>
        <td class="cell-proveedor"><div class="readonly">${escapeHtml(proveedor)}</div></td>
        <td class="cell-cantidad"><div class="readonly">${cantidad_compra}</div></td>

        <td class="cell-rc">
          <select id="rc_odoo-${idCompra}">
            <option value="No"${rc_odoo_val === "No" ? " selected" : ""}>No</option>
            <option value="Si"${rc_odoo_val === "Si" ? " selected" : ""}>Si</option>
          </select>
        </td>
        <td class="cell-fecha-odoo"><input type="date" id="fecha_recibo_odoo-${idCompra}" value="${escapeAttr(fecha_recibo_odoo_val)}"></td>
        <td class="cell-metodo"><input type="text" id="metodo_entrega-${idCompra}" value="${escapeAttr(metodo_entrega_val)}"></td>

        <td class="cell-recibidas"><input type="number" id="unidades_recibidas-${idCompra}" min="0" max="${cantidad_compra}" value="${unidades_recibidas_val}"></td>
        <td class="cell-faltantes"><input type="number" id="unidades_faltantes-${idCompra}" readonly value="${unidades_faltantes_val}"></td>
        <td class="cell-observ"><input type="text" id="observaciones_ops-${idCompra}" value="${escapeAttr(observaciones_ops_val)}"></td>

        <td class="cell-accion">
          <button id="guardar-${idCompra}" class="guardar-btn">Guardar</button>
        </td>
      `;

      tabla.appendChild(tr);

      // obtener refs
      const recibidasEl = document.getElementById(`unidades_recibidas-${idCompra}`);
      const faltantesEl = document.getElementById(`unidades_faltantes-${idCompra}`);

      // aplicar estado visual inicial
      aplicarEstadoVisual(tr, cantidad_compra, unidades_recibidas_val);

      // listener para calcular faltantes y actualizar estado al escribir
      if (recibidasEl) {
        recibidasEl.addEventListener("input", (e) => {
          const v = parseInt(e.target.value || "0", 10);
          const recibidasActual = Number.isFinite(v) ? v : 0;

          const pedido = Number.isFinite(Number(tr.dataset.cantidadCompra)) ? Number(tr.dataset.cantidadCompra) : 0;
          const calc = Math.max(0, pedido - recibidasActual);
          if (faltantesEl) faltantesEl.value = calc;

          aplicarEstadoVisual(tr, pedido, recibidasActual);
        });
      }

      // handler guardar por fila (igual que antes)
      const btnGuardar = document.getElementById(`guardar-${idCompra}`);
      if (btnGuardar) {
        btnGuardar.addEventListener("click", async () => {
          try {
            btnGuardar.disabled = true;
            btnGuardar.textContent = "Guardando...";

            const rc_odoo_val_now = document.getElementById(`rc_odoo-${idCompra}`)?.value || "No";
            const fecha_recibo_odoo_now = document.getElementById(`fecha_recibo_odoo-${idCompra}`)?.value || "";
            const metodo_entrega_now = document.getElementById(`metodo_entrega-${idCompra}`)?.value || "";
            const unidades_recibidas_now = Number(document.getElementById(`unidades_recibidas-${idCompra}`)?.value || 0);
            const observaciones_ops_now = document.getElementById(`observaciones_ops-${idCompra}`)?.value || "";

            const cantidad_compra_from_dataset = Number.isFinite(Number(tr.dataset.cantidadCompra)) ? Number(tr.dataset.cantidadCompra) : 0;
            const unidades_faltantes_now = Math.max(0, cantidad_compra_from_dataset - unidades_recibidas_now);

            const payload = {
              id_compra: idCompra,
              cliente: cliente,
              producto: producto,
              oc_coltrade: oc_coltrade,
              pedido_proveedor: pedido_proveedor,
              factura_proveedor: factura_proveedor,
              proveedor: proveedor,
              rc_odoo: rc_odoo_val_now,
              fecha_recibo_odoo: fecha_recibo_odoo_now,
              metodo_entrega: metodo_entrega_now,
              cantidad_compra: cantidad_compra_from_dataset,
              unidades_recibidas: unidades_recibidas_now,
              unidades_faltantes: unidades_faltantes_now,
              observaciones_ops: observaciones_ops_now
            };

            const res = await fetch("/recepciones/api/guardar", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            });

            if (!res.ok) {
              const txt = await res.text().catch(() => "");
              throw new Error("HTTP " + res.status + " " + txt);
            }

            let responseJson = null;
            try { responseJson = await res.json(); } catch (e) { responseJson = null; }

            let saved = null;
            if (responseJson) {
              if (responseJson.saved) saved = responseJson.saved;
              else saved = responseJson;
            }

            if (saved && saved.id_compra) {
              if (document.getElementById(`fecha_recibo_odoo-${idCompra}`)) {
                document.getElementById(`fecha_recibo_odoo-${idCompra}`).value = normalizeDateForInput(saved.fecha_recibo_odoo || saved.fecha_recibo);
              }
              if (document.getElementById(`unidades_recibidas-${idCompra}`)) {
                document.getElementById(`unidades_recibidas-${idCompra}`).value = saved.unidades_recibidas ?? unidades_recibidas_now;
              }
              if (document.getElementById(`unidades_faltantes-${idCompra}`)) {
                document.getElementById(`unidades_faltantes-${idCompra}`).value = saved.unidades_faltantes ?? unidades_faltantes_now;
              }
              if (document.getElementById(`rc_odoo-${idCompra}`)) {
                const sel = document.getElementById(`rc_odoo-${idCompra}`);
                sel.value = saved.rc_odoo ?? sel.value;
              }

              const pedidoLatest = Number.isFinite(Number(tr.dataset.cantidadCompra)) ? Number(tr.dataset.cantidadCompra) : 0;
              const recibidasLatest = Number(document.getElementById(`unidades_recibidas-${idCompra}`)?.value || 0);
              aplicarEstadoVisual(tr, pedidoLatest, recibidasLatest);
            } else {
              await loadData();
            }

            try { await fetch("/datos-compras/api"); } catch (e) { /* noop */ }

            alert("Recepción guardada");
          } catch (err) {
            console.error("Error guardando recepcion:", err);
            alert("Error guardando recepcion: " + (err.message || String(err)));
          } finally {
            btnGuardar.disabled = false;
            btnGuardar.textContent = "Guardar";
          }
        });
      }
    }); // end pageRows.forEach

    updatePaginationUI(totalItems);
  } // end renderTable

  // =======================
  // Eventos filtro
  // =======================
  if (filtroEstadoEl) {
    filtroEstadoEl.addEventListener("change", () => {
      pageState.page = 1;
      // re-render usando los datos en memoria (lastCompras)
      renderTable(lastCompras, lastRecepcionesDict);
    });
  }

  // buscador global: escucha y re-render
  if (inputBusquedaEl) {
    inputBusquedaEl.addEventListener("input", (e) => {
      textoBusqueda = (e.target.value || "").trim().toLowerCase();
      pageState.page = 1;
      renderTable(lastCompras, lastRecepcionesDict);
    });
  }

  if (btnLimpiarFiltro) {
    btnLimpiarFiltro.addEventListener("click", () => {
      if (filtroEstadoEl) filtroEstadoEl.value = "";
      if (inputBusquedaEl) inputBusquedaEl.value = "";
      textoBusqueda = "";
      pageState.page = 1;
      renderTable(lastCompras, lastRecepcionesDict);
    });
  }

  if (pagePrevBtn) {
    pagePrevBtn.addEventListener("click", () => {
      if (pageState.page > 1) {
        pageState.page -= 1;
        renderTable(lastCompras, lastRecepcionesDict);
      }
    });
  }

  if (pageNextBtn) {
    pageNextBtn.addEventListener("click", () => {
      pageState.page += 1;
      renderTable(lastCompras, lastRecepcionesDict);
    });
  }

  if (pageSizeSelect) {
    pageSizeSelect.addEventListener("change", () => {
      const nextSize = Number(pageSizeSelect.value || 10);
      pageState.pageSize = Number.isFinite(nextSize) ? nextSize : 10;
      pageState.page = 1;
      renderTable(lastCompras, lastRecepcionesDict);
    });
  }

  // =======================
  // Inicio
  // =======================
  loadData();
});
