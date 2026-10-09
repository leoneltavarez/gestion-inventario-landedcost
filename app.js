const API_URL = 'https://script.google.com/macros/s/AKfycbwvXg595uwxls3WMOOo9hrN31fJpPI7ENCM8E9jT1jwdUtKGaT-bvw1SrATEdRmEoAZ/exec';

let globalState = {
  tasaUSD: 60.00,
  productos: [],
  movimientos: [],
  categorias: [],
  tiposMovimiento: [],
  html5QrCode: null,
  isScanning: false
};

let chartCapitalProd = null;
let chartInversionCat = null;
let chartVentasMensuales = null;

document.addEventListener('DOMContentLoaded', () => {
  configurarEventosUI();
  cargarDatosBackend();
});

// NAVEGACIÓN ENTRE VISTAS
function mostrarSeccion(seccionId, elementoMenu) {
  document.querySelectorAll('.app-section').forEach(sec => sec.style.display = 'none');
  
  const target = document.getElementById(seccionId);
  if (target) target.style.display = 'block';

  if (elementoMenu) {
    document.querySelectorAll('#sidebar-menu a').forEach(a => {
      a.classList.remove('active-link', 'text-white');
      a.classList.add('text-secondary');
    });
    elementoMenu.classList.add('active-link', 'text-white');
    elementoMenu.classList.remove('text-secondary');
  }

  if (seccionId !== 'escaner-section') {
    detenerEscanerQR();
  }
}

// 1. OBTENER DATOS DE GOOGLE SHEETS
async function cargarDatosBackend() {
  mostrarCargando(true);
  try {
    const response = await fetch(`${API_URL}?action=getDatos`);
    const data = await response.json();

    if (data.status === 'success') {
      globalState.tasaUSD = data.tasaUSD || 60.00;
      globalState.productos = data.productos || [];
      globalState.movimientos = data.movimientos || [];
      globalState.categorias = data.categorias || [];
      globalState.tiposMovimiento = data.tiposMovimiento || [];

      actualizarIndicadorTasa();
      actualizarDashboardMetrics();
      renderizarTablaInventario(globalState.productos);
      renderizarTablaCatalogo(globalState.productos);
      renderizarTablaMovimientos(globalState.movimientos);
      renderizarGraficos();
      poblarSelectores();
      poblarFiltroMeses();
    } else {
      mostrarNotificacion('Error del servidor: ' + data.message, 'danger');
    }
  } catch (error) {
    console.error('Error al conectar:', error);
    mostrarNotificacion('Error de conexión con Google Sheets', 'danger');
  } finally {
    mostrarCargando(false);
  }
}

// 2. MÉTRICAS
function actualizarDashboardMetrics() {
  const prods = globalState.productos;
  const movs = globalState.movimientos;
  const countProductos = prods.length;
  
  let stockTotal = 0;
  let capitalInvertidoUSD = 0;
  let gananciaTotalDOP = 0;
  let ventasTotalesDOP = 0;

  prods.forEach(p => {
    const stock = Number(p.stockActual) || 0;
    const landedUSD = Number(p.costoTotalLandedUSD) || 0;
    const gananciaDOP = Number(p.gananciaEstimadaDOP) || 0;

    stockTotal += stock;
    capitalInvertidoUSD += (landedUSD * stock);
    gananciaTotalDOP += (gananciaDOP * stock);
  });

  movs.forEach(m => {
    if (m.tipo === 'Venta') {
      ventasTotalesDOP += (Number(m.totalDOP) || 0);
    }
  });

  const capitalInvertidoDOP = capitalInvertidoUSD * globalState.tasaUSD;

  document.getElementById('metric-total-productos').textContent = countProductos;
  document.getElementById('metric-stock-total').textContent = stockTotal;
  document.getElementById('metric-capital-usd').textContent = `$${capitalInvertidoUSD.toFixed(2)}`;
  document.getElementById('metric-capital-dop').textContent = `RD$ ${capitalInvertidoDOP.toLocaleString('es-DO', { minimumFractionDigits: 2 })} DOP`;
  document.getElementById('metric-ventas-totales').textContent = `RD$ ${ventasTotalesDOP.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
  document.getElementById('metric-ganancia-potencial').textContent = `RD$ ${gananciaTotalDOP.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
}

function actualizarIndicadorTasa() {
  const elemTasa = document.getElementById('input-tasa-dop');
  if (elemTasa) elemTasa.value = globalState.tasaUSD;
}

// 3. TABLA DE INVENTARIO RESUMIDO
function renderizarTablaInventario(listaProductos) {
  const tbody = document.getElementById('tabla-inventario-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (listaProductos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No hay productos disponibles.</td></tr>`;
    return;
  }

  listaProductos.forEach(p => {
    const tr = document.createElement('tr');
    
    tr.innerHTML = `
      <td><span class="badge bg-secondary font-monospace">${p.sku}</span></td>
      <td class="fw-bold text-white">${p.producto}</td>
      <td><span class="badge bg-dark-card border border-secondary text-info">${p.categoria}</span></td>
      <td class="text-center"><span class="badge ${p.stockActual > 5 ? 'bg-success' : 'bg-warning text-dark'}">${p.stockActual}</span></td>
      <td>$${(Number(p.costoTotalLandedUSD) || 0).toFixed(3)}</td>
      <td class="text-info fw-bold">RD$ ${(Number(p.precioVentaDOP) || 0).toFixed(2)}</td>
      <td><span class="text-success fw-bold">${(Number(p.margenPct) || 0).toFixed(1)}%</span></td>
      <td class="text-center">
        <div class="btn-group btn-group-sm" role="group">
          <button class="btn btn-outline-info" onclick="abrirModalMovimiento('${p.sku}')" title="Registrar Movimiento">
            <i class="bi bi-box-arrow-up-down"></i>
          </button>
          <button class="btn btn-outline-light" onclick="verCodigoQR('${p.sku}')" title="Ver Código QR">
            <i class="bi bi-qr-code"></i>
          </button>
          <button class="btn btn-warning text-dark fw-bold" onclick="imprimirEtiquetaDirecta('${p.sku}')" title="Imprimir Etiqueta">
            <i class="bi bi-printer-fill"></i> Etiqueta
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 4. CATÁLOGO EXTENDIDO (TABLA CON SCROLL)
function renderizarTablaCatalogo(listaProductos) {
  const tbody = document.getElementById('tabla-catalogo-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (listaProductos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center py-3 text-muted">No hay productos registrados.</td></tr>`;
    return;
  }

  listaProductos.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="badge bg-secondary font-monospace">${p.sku}</span></td>
      <td class="fw-bold text-white">${p.producto}</td>
      <td><span class="badge bg-dark border border-secondary text-info">${p.categoria}</span></td>
      <td class="text-center">${p.stockInicial || 0}</td>
      <td class="text-center"><span class="badge ${p.stockActual > 5 ? 'bg-success' : 'bg-warning text-dark'}">${p.stockActual}</span></td>
      <td>$${(Number(p.precioCompraUSD) || 0).toFixed(2)}</td>
      <td>$${(Number(p.costoTotalLandedUSD) || 0).toFixed(3)}</td>
      <td class="text-info fw-bold">RD$ ${(Number(p.precioVentaDOP) || 0).toFixed(2)}</td>
      <td><span class="text-success fw-bold">${(Number(p.margenPct) || 0).toFixed(1)}%</span></td>
      <td class="text-center">
        <button class="btn btn-sm btn-warning text-dark fw-bold" onclick="imprimirEtiquetaDirecta('${p.sku}')">
          <i class="bi bi-printer-fill"></i> Etiqueta
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 5. RENDEREAR HISTORIAL DE MOVIMIENTOS
function renderizarTablaMovimientos(listaMovimientos) {
  const tbody = document.getElementById('tabla-movimientos-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (listaMovimientos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-3 text-muted">No se han registrado movimientos.</td></tr>`;
    return;
  }

  listaMovimientos.forEach(m => {
    const tr = document.createElement('tr');
    const badgeClass = m.tipo === 'Venta' ? 'bg-success' : (m.tipo === 'Entrada' ? 'bg-info text-dark' : 'bg-warning text-dark');
    
    tr.innerHTML = `
      <td class="small text-muted">${m.fecha || ''}</td>
      <td><span class="badge ${badgeClass}">${m.tipo}</span></td>
      <td><span class="font-monospace text-info">${m.sku}</span></td>
      <td class="fw-bold text-white">${m.producto}</td>
      <td class="text-center fw-bold">${m.cantidad}</td>
      <td>RD$ ${(Number(m.precioUnitarioDOP) || 0).toFixed(2)}</td>
      <td class="fw-bold text-success">RD$ ${(Number(m.totalDOP) || 0).toFixed(2)}</td>
      <td class="small text-muted">${m.notas || '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

// 6. FILTROS DE MOVIMIENTOS
function poblarFiltroMeses() {
  const selectMes = document.getElementById('filtro-mes-movimiento');
  if (!selectMes) return;

  const mesesSet = new Set();
  globalState.movimientos.forEach(m => {
    if (m.anoMes) mesesSet.add(m.anoMes);
  });

  selectMes.innerHTML = '<option value="TODOS">Todos los Meses</option>';
  mesesSet.forEach(mes => {
    selectMes.innerHTML += `<option value="${mes}">${mes}</option>`;
  });
}

function filtrarTablaMovimientos() {
  const tipoSel = document.getElementById('filtro-tipo-movimiento').value;
  const mesSel = document.getElementById('filtro-mes-movimiento').value;

  const filtrados = globalState.movimientos.filter(m => {
    const cumpleTipo = (tipoSel === 'TODOS' || m.tipo === tipoSel);
    const cumpleMes = (mesSel === 'TODOS' || m.anoMes === mesSel);
    return cumpleTipo && cumpleMes;
  });

  renderizarTablaMovimientos(filtrados);
}

// 7. EXPORTAR A EXCEL (.XLSX)
function exportarExcel() {
  if (globalState.productos.length === 0) {
    mostrarNotificacion('No hay datos para exportar', 'warning');
    return;
  }

  const wb = XLSX.utils.book_new();

  const wsProductos = XLSX.utils.json_to_sheet(globalState.productos);
  XLSX.utils.book_append_sheet(wb, wsProductos, "Inventario_Productos");

  const wsMovimientos = XLSX.utils.json_to_sheet(globalState.movimientos);
  XLSX.utils.book_append_sheet(wb, wsMovimientos, "Historial_Movimientos");

  XLSX.writeFile(wb, `Inventario_EmprendedorPRO_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// 8. GENERAR GRÁFICOS DINÁMICOS POR VENTAS REALES
function renderizarGraficos() {
  const prods = globalState.productos;
  const movs = globalState.movimientos;

  const labelsProd = prods.map(p => p.sku);
  const dataCapUSD = prods.map(p => (Number(p.costoTotalLandedUSD) || 0) * (Number(p.stockActual) || 0));

  const ctxProd = document.getElementById('chart-capital-producto');
  if (ctxProd) {
    if (chartCapitalProd) chartCapitalProd.destroy();
    chartCapitalProd = new Chart(ctxProd, {
      type: 'bar',
      data: {
        labels: labelsProd,
        datasets: [{
          label: 'Inversión (USD)',
          data: dataCapUSD,
          backgroundColor: '#38BDF8'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { ticks: { color: '#9CA3AF' } }, x: { ticks: { color: '#9CA3AF' } } }
      }
    });
  }

  const catMap = {};
  prods.forEach(p => {
    const cat = p.categoria || 'Sin Categoría';
    const cap = (Number(p.costoTotalLandedUSD) || 0) * (Number(p.stockActual) || 0);
    catMap[cat] = (catMap[cat] || 0) + cap;
  });

  const ctxCat = document.getElementById('chart-inversion-categoria');
  if (ctxCat) {
    if (chartInversionCat) chartInversionCat.destroy();
    chartInversionCat = new Chart(ctxCat, {
      type: 'doughnut',
      data: {
        labels: Object.keys(catMap),
        datasets: [{
          data: Object.values(catMap),
          backgroundColor: ['#38BDF8', '#34D399', '#FBBF24', '#F87171', '#C084FC']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#9CA3AF' } } }
      }
    });
  }

  const ventasMesMap = {};
  movs.forEach(m => {
    if (m.tipo === 'Venta') {
      const mesKey = m.anoMes || '2026-10';
      ventasMesMap[mesKey] = (ventasMesMap[mesKey] || 0) + (Number(m.totalDOP) || 0);
    }
  });

  const labelsVentas = Object.keys(ventasMesMap).length > 0 ? Object.keys(ventasMesMap) : ['2026-10'];
  const dataVentas = Object.keys(ventasMesMap).length > 0 ? Object.values(ventasMesMap) : [0];

  const ctxVentas = document.getElementById('chart-ventas-mensuales');
  if (ctxVentas) {
    if (chartVentasMensuales) chartVentasMensuales.destroy();
    chartVentasMensuales = new Chart(ctxVentas, {
      type: 'line',
      data: {
        labels: labelsVentas,
        datasets: [{
          label: 'Ventas Totales (RD$)',
          data: dataVentas,
          borderColor: '#F59E0B',
          backgroundColor: 'rgba(245, 158, 11, 0.15)',
          fill: true,
          tension: 0.3,
          pointRadius: 6,
          pointBackgroundColor: '#F59E0B'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#9CA3AF' } } },
        scales: { y: { ticks: { color: '#9CA3AF' } }, x: { ticks: { color: '#9CA3AF' } } }
      }
    });
  }
}

function poblarSelectores() {
  const selectCat = document.getElementById('modal-producto-categoria');
  const selectTipo = document.getElementById('modal-movimiento-tipo');

  if (selectCat) {
    selectCat.innerHTML = '<option value="">Seleccione Categoría...</option>';
    globalState.categorias.forEach(cat => {
      selectCat.innerHTML += `<option value="${cat}">${cat}</option>`;
    });
  }

  if (selectTipo) {
    selectTipo.innerHTML = '';
    globalState.tiposMovimiento.forEach(tipo => {
      selectTipo.innerHTML += `<option value="${tipo}">${tipo}</option>`;
    });
  }
}

// 9. FORMULARIOS
async function guardarProducto(event) {
  event.preventDefault();
  const payload = {
    sku: document.getElementById('input-sku').value.trim(),
    producto: document.getElementById('input-nombre').value.trim(),
    categoria: document.getElementById('modal-producto-categoria').value,
    stockInicial: Number(document.getElementById('input-stock-inicial').value) || 0,
    precioCompraUSD: Number(document.getElementById('input-precio-usd').value) || 0,
    shippingTotalUSD: Number(document.getElementById('input-shipping-usd').value) || 0,
    importChargesUSD: Number(document.getElementById('input-import-usd').value) || 0,
    salesTaxUSD: Number(document.getElementById('input-tax-usd').value) || 0,
    paymentFeeUSD: Number(document.getElementById('input-fee-usd').value) || 0,
    courierFleteDOP: Number(document.getElementById('input-flete-dop').value) || 0,
    precioVentaDOP: Number(document.getElementById('input-precio-venta-dop').value) || 0
  };

  mostrarCargando(true);
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'agregarProducto', payload: payload })
    });
    const res = await response.json();
    if (res.status === 'success') {
      mostrarNotificacion('Producto registrado con éxito', 'success');
      cerrarModal('modalNuevoProducto');
      document.getElementById('form-nuevo-producto').reset();
      await cargarDatosBackend();
    } else {
      mostrarNotificacion('Error: ' + res.message, 'danger');
    }
  } catch (error) {
    mostrarNotificacion('Error de conexión al guardar', 'danger');
  } finally {
    mostrarCargando(false);
  }
}

async function guardarMovimiento(event) {
  event.preventDefault();
  const payload = {
    sku: document.getElementById('mov-sku').value,
    producto: document.getElementById('mov-producto-nombre').value,
    tipo: document.getElementById('modal-movimiento-tipo').value,
    cantidad: Number(document.getElementById('mov-cantidad').value) || 1,
    precioUnitarioDOP: Number(document.getElementById('mov-precio-dop').value) || 0,
    notas: document.getElementById('mov-notas').value
  };

  mostrarCargando(true);
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'registrarMovimiento', payload: payload })
    });
    const res = await response.json();
    if (res.status === 'success') {
      mostrarNotificacion('Movimiento guardado con éxito', 'success');
      cerrarModal('modalMovimiento');
      await cargarDatosBackend();
    } else {
      mostrarNotificacion('Error: ' + res.message, 'danger');
    }
  } catch (error) {
    mostrarNotificacion('Error al conectar con el servidor', 'danger');
  } finally {
    mostrarCargando(false);
  }
}

// 10. IMPRESIÓN Y QR
function verCodigoQR(sku) {
  const prod = globalState.productos.find(p => p.sku === sku);
  if (!prod) return;

  const imgElem = document.getElementById('img-qr-code');
  const titleElem = document.getElementById('modal-qr-sku');
  const nameElem = document.getElementById('print-product-name');
  const skuElem = document.getElementById('print-product-sku');
  const priceElem = document.getElementById('print-product-price');

  const qrUrl = prod.urlQR || `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${sku}`;

  if (imgElem) imgElem.src = qrUrl;
  if (titleElem) titleElem.textContent = `Código QR - ${sku}`;
  if (nameElem) nameElem.textContent = prod.producto;
  if (skuElem) skuElem.textContent = prod.sku;
  if (priceElem) priceElem.textContent = `RD$ ${(Number(prod.precioVentaDOP) || 0).toFixed(2)}`;

  const modalElem = document.getElementById('modalVerQR');
  if (modalElem) {
    const modal = new bootstrap.Modal(modalElem);
    modal.show();
  }
}

function imprimirEtiquetaActual() {
  window.print();
}

function imprimirEtiquetaDirecta(sku) {
  verCodigoQR(sku);
  setTimeout(() => {
    window.print();
  }, 400);
}

// 11. CÁMARA QR
function iniciarEscanerQR() {
  if (globalState.isScanning) return;

  globalState.html5QrCode = new Html5Qrcode("reader");
  const config = { fps: 10, qrbox: { width: 200, height: 200 } };

  globalState.html5QrCode.start(
    { facingMode: "environment" },
    config,
    onScanSuccess
  ).then(() => {
    globalState.isScanning = true;
  }).catch(err => {
    mostrarNotificacion("Asegúrate de permitir el acceso a la cámara", "danger");
  });
}

function detenerEscanerQR() {
  if (globalState.html5QrCode && globalState.isScanning) {
    globalState.html5QrCode.stop().then(() => {
      globalState.isScanning = false;
    });
  }
}

function onScanSuccess(decodedText) {
  detenerEscanerQR();
  mostrarNotificacion(`Código escaneado: ${decodedText}`, 'info');
  
  const prod = globalState.productos.find(p => p.sku.toLowerCase() === decodedText.toLowerCase());
  if (prod) {
    abrirModalMovimiento(prod.sku);
  } else {
    mostrarNotificacion(`El SKU ${decodedText} no existe en el inventario`, 'warning');
  }
}

// UTILS Y EVENTOS BUSQUEDA
function configurarEventosUI() {
  const formProd = document.getElementById('form-nuevo-producto');
  if (formProd) formProd.addEventListener('submit', guardarProducto);

  const formMov = document.getElementById('form-nuevo-movimiento');
  if (formMov) formMov.addEventListener('submit', guardarMovimiento);

  const searchInput = document.getElementById('input-busqueda-inventario');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const text = e.target.value.toLowerCase();
      const filtrados = globalState.productos.filter(p => 
        p.sku.toLowerCase().includes(text) || p.producto.toLowerCase().includes(text)
      );
      renderizarTablaInventario(filtrados);
    });
  }

  const searchCatInput = document.getElementById('input-busqueda-catalogo');
  if (searchCatInput) {
    searchCatInput.addEventListener('input', (e) => {
      const text = e.target.value.toLowerCase();
      const filtrados = globalState.productos.filter(p => 
        p.sku.toLowerCase().includes(text) || p.producto.toLowerCase().includes(text) || p.categoria.toLowerCase().includes(text)
      );
      renderizarTablaCatalogo(filtrados);
    });
  }
}

function abrirModalMovimiento(sku) {
  const prod = globalState.productos.find(p => p.sku === sku);
  if (!prod) return;

  document.getElementById('mov-sku').value = prod.sku;
  document.getElementById('mov-producto-nombre').value = prod.producto;
  document.getElementById('mov-precio-dop').value = prod.precioVentaDOP;

  const modalElem = document.getElementById('modalMovimiento');
  if (modalElem) {
    const modal = new bootstrap.Modal(modalElem);
    modal.show();
  }
}

function cerrarModal(modalId) {
  const modalElem = document.getElementById(modalId);
  if (modalElem) {
    const modal = bootstrap.Modal.getInstance(modalElem);
    if (modal) modal.hide();
  }
}

function mostrarNotificacion(mensaje, tipo = 'info') {
  alert(mensaje);
}

function mostrarCargando(mostrar) {
  const spinner = document.getElementById('loading-spinner');
  if (spinner) spinner.style.display = mostrar ? 'block' : 'none';
}