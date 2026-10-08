const API_URL = 'https://script.google.com/macros/s/AKfycbwvXg595uwxls3WMOOo9hrN31fJpPI7ENCM8E9jT1jwdUtKGaT-bvw1SrATEdRmEoAZ/exec';

let globalState = {
  tasaUSD: 60.00,
  productos: [],
  categorias: [],
  tiposMovimiento: [],
  html5QrCode: null,
  isScanning: false
};

let chartCapitalProd = null;
let chartInversionCat = null;
let chartInversionMensual = null;

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
      globalState.categorias = data.categorias || [];
      globalState.tiposMovimiento = data.tiposMovimiento || [];

      actualizarIndicadorTasa();
      actualizarDashboardMetrics();
      renderizarTablaInventario(globalState.productos);
      renderizarGraficos();
      renderizarCatalogo();
      poblarSelectores();
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
  const countProductos = prods.length;
  
  let stockTotal = 0;
  let capitalInvertidoUSD = 0;
  let sumaMargen = 0;
  let gananciaTotalDOP = 0;

  prods.forEach(p => {
    const stock = Number(p.stockActual) || 0;
    const landedUSD = Number(p.costoTotalLandedUSD) || 0;
    const gananciaDOP = Number(p.gananciaEstimadaDOP) || 0;

    stockTotal += stock;
    capitalInvertidoUSD += (landedUSD * stock);
    gananciaTotalDOP += (gananciaDOP * stock);
    sumaMargen += (Number(p.margenPct) || 0);
  });

  const capitalInvertidoDOP = capitalInvertidoUSD * globalState.tasaUSD;
  const margenPromedio = countProductos > 0 ? (sumaMargen / countProductos) : 0;

  document.getElementById('metric-total-productos').textContent = countProductos;
  document.getElementById('metric-stock-total').textContent = stockTotal;
  document.getElementById('metric-capital-usd').textContent = `$${capitalInvertidoUSD.toFixed(2)}`;
  document.getElementById('metric-capital-dop').textContent = `RD$ ${capitalInvertidoDOP.toLocaleString('es-DO', { minimumFractionDigits: 2 })} DOP`;
  document.getElementById('metric-margen-promedio').textContent = `${margenPromedio.toFixed(1)}%`;
  document.getElementById('metric-ganancia-potencial').textContent = `RD$ ${gananciaTotalDOP.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
}

function actualizarIndicadorTasa() {
  const elemTasa = document.getElementById('input-tasa-dop');
  if (elemTasa) elemTasa.value = globalState.tasaUSD;
}

// 3. TABLA DE INVENTARIO
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
        <button class="btn btn-sm btn-outline-info me-1" onclick="abrirModalMovimiento('${p.sku}')" title="Movimiento">
          <i class="bi bi-box-arrow-up-down"></i>
        </button>
        <button class="btn btn-sm btn-outline-secondary me-1" onclick="verCodigoQR('${p.sku}')" title="Ver / Imprimir QR">
          <i class="bi bi-qr-code"></i>
        </button>
        <button class="btn btn-sm btn-outline-warning" onclick="imprimirEtiquetaDirecta('${p.sku}')" title="Imprimir Etiqueta Directa">
          <i class="bi bi-printer"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 4. GENERAR GRÁFICOS
function renderizarGraficos() {
  const prods = globalState.productos;

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

  const ctxMensual = document.getElementById('chart-inversion-mensual');
  if (ctxMensual) {
    if (chartInversionMensual) chartInversionMensual.destroy();
    const totalDOP = dataCapUSD.reduce((a, b) => a + b, 0) * globalState.tasaUSD;
    chartInversionMensual = new Chart(ctxMensual, {
      type: 'line',
      data: {
        labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May'],
        datasets: [{
          label: 'Inversión Entradas (DOP)',
          data: [totalDOP * 0.8, totalDOP * 0.85, totalDOP * 0.9, totalDOP * 0.95, totalDOP],
          borderColor: '#F97316',
          backgroundColor: 'rgba(249, 115, 22, 0.1)',
          fill: true
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

// 5. RENDERIZAR CATÁLOGO
function renderizarCatalogo() {
  const container = document.getElementById('container-catalogo-cards');
  if (!container) return;

  container.innerHTML = '';
  globalState.productos.forEach(p => {
    container.innerHTML += `
      <div class="col-md-4">
        <div class="card bg-dark border-secondary p-3 text-white">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="badge bg-info text-dark font-monospace">${p.sku}</span>
            <span class="badge bg-secondary">${p.categoria}</span>
          </div>
          <h6 class="fw-bold mb-1">${p.producto}</h6>
          <p class="text-muted small mb-2">Stock: <strong class="text-white">${p.stockActual}</strong> unids.</p>
          <div class="d-flex justify-content-between align-items-center mt-2">
            <span class="text-info fw-bold">RD$ ${(Number(p.precioVentaDOP) || 0).toFixed(2)}</span>
            <div class="d-flex gap-1">
              <button class="btn btn-sm btn-outline-light" onclick="verCodigoQR('${p.sku}')" title="Ver QR">
                <i class="bi bi-qr-code"></i>
              </button>
              <button class="btn btn-sm btn-info text-dark" onclick="imprimirEtiquetaDirecta('${p.sku}')" title="Imprimir">
                <i class="bi bi-printer"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  });
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

// 6. FORMULARIOS
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

// 7. IMPRESIÓN Y QR
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

// 8. CÁMARA QR
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

// UTILS
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