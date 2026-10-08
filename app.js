// CONFIGURACIÓN API GOOGLE APPS SCRIPT
const API_URL = 'https://script.google.com/macros/s/AKfycbwvXg595uwxls3WMOOo9hrN31fJpPI7ENCM8E9jT1jwdUtKGaT-bvw1SrATEdRmEoAZ/exec';

// ESTADO GLOBAL DE LA APLICACIÓN
let globalState = {
  tasaUSD: 60.00,
  productos: [],
  categorias: [],
  tiposMovimiento: [],
  html5QrCode: null,
  isScanning: false
};

// EVENTO DE INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', () => {
  inicializarApp();
});

async function inicializarApp() {
  configurarEventosUI();
  await cargarDatosBackend();
}

// 1. CARGAR DATOS DESDE APPS SCRIPT (BACKEND)
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
      poblarSelectores();
    } else {
      mostrarNotificacion('Error al cargar datos: ' + data.message, 'danger');
    }
  } catch (error) {
    console.error('Error fetching data:', error);
    mostrarNotificacion('Error de conexión con el servidor de Google', 'danger');
  } finally {
    mostrarCargando(false);
  }
}

// 2. ACTUALIZACIÓN DE MÉTRICAS Y DASHBOARD
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

  // Renderizar en el DOM
  const elemCount = document.getElementById('metric-total-productos');
  const elemStock = document.getElementById('metric-stock-total');
  const elemCapUSD = document.getElementById('metric-capital-usd');
  const elemCapDOP = document.getElementById('metric-capital-dop');
  const elemMargen = document.getElementById('metric-margen-promedio');
  const elemGanancia = document.getElementById('metric-ganancia-potencial');

  if (elemCount) elemCount.textContent = countProductos;
  if (elemStock) elemStock.textContent = stockTotal;
  if (elemCapUSD) elemCapUSD.textContent = `$${capitalInvertidoUSD.toFixed(2)}`;
  if (elemCapDOP) elemCapDOP.textContent = `RD$ ${capitalInvertidoDOP.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
  if (elemMargen) elemMargen.textContent = `${margenPromedio.toFixed(1)}%`;
  if (elemGanancia) elemGanancia.textContent = `RD$ ${gananciaTotalDOP.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
}

function actualizarIndicadorTasa() {
  const elemTasa = document.getElementById('input-tasa-dop');
  if (elemTasa) elemTasa.value = globalState.tasaUSD;
}

// 3. RENDERIZADO DE TABLA DE INVENTARIO
function renderizarTablaInventario(listaProductos) {
  const tbody = document.getElementById('tabla-inventario-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (listaProductos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4">No hay productos registrados en el inventario.</td></tr>`;
    return;
  }

  listaProductos.forEach(p => {
    const tr = document.createElement('tr');
    
    tr.innerHTML = `
      <td><span class="badge bg-secondary font-monospace">${p.sku}</span></td>
      <td class="fw-bold">${p.producto}</td>
      <td><span class="badge bg-outline-info text-dark">${p.categoria}</span></td>
      <td class="text-center"><span class="badge ${p.stockActual > 5 ? 'bg-success' : 'bg-warning text-dark'}">${p.stockActual}</span></td>
      <td>$${(Number(p.costoTotalLandedUSD) || 0).toFixed(3)}</td>
      <td>RD$ ${(Number(p.precioVentaDOP) || 0).toFixed(2)}</td>
      <td><span class="text-success fw-bold">${(Number(p.margenPct) || 0).toFixed(1)}%</span></td>
      <td class="text-center">
        <button class="btn btn-sm btn-outline-primary me-1" onclick="abrirModalMovimiento('${p.sku}')" title="Registrar Movimiento">
          <i class="bi bi-box-arrow-up-down"></i>
        </button>
        <button class="btn btn-sm btn-outline-secondary" onclick="verCodigoQR('${p.sku}', '${p.urlQR}')" title="Ver QR">
          <i class="bi bi-qr-code"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 4. POBLAR SELECTORES Y DROPDOWNS
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

// 5. REGISTRAR NUEVO PRODUCTO
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

  if (!payload.sku || !payload.producto) {
    mostrarNotificacion('Por favor completa el SKU y Nombre del producto.', 'warning');
    return;
  }

  mostrarCargando(true);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'agregarProducto', payload: payload })
    });

    const res = await response.json();
    if (res.status === 'success') {
      mostrarNotificacion('Producto guardado con éxito', 'success');
      cerrarModal('modalNuevoProducto');
      document.getElementById('form-nuevo-producto').reset();
      await cargarDatosBackend();
    } else {
      mostrarNotificacion('Error: ' + res.message, 'danger');
    }
  } catch (error) {
    console.error('Error al guardar:', error);
    mostrarNotificacion('Error al conectar con la API', 'danger');
  } finally {
    mostrarCargando(false);
  }
}

// 6. REGISTRAR MOVIMIENTO (ENTRADA / SALIDA / VENTA)
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
      mostrarNotificacion('Movimiento registrado correctamente', 'success');
      cerrarModal('modalMovimiento');
      await cargarDatosBackend();
    } else {
      mostrarNotificacion('Error: ' + res.message, 'danger');
    }
  } catch (error) {
    mostrarNotificacion('Error al registrar movimiento', 'danger');
  } finally {
    mostrarCargando(false);
  }
}

// 7. ESCÁNER QR EN VIVO CON CÁMARA
function iniciarEscanerQR() {
  const qrRegion = document.getElementById('reader');
  if (!qrRegion) return;

  if (globalState.isScanning) {
    detenerEscanerQR();
    return;
  }

  globalState.html5QrCode = new Html5Qrcode("reader");
  const config = { fps: 10, qrbox: { width: 250, height: 250 } };

  globalState.html5QrCode.start(
    { facingMode: "environment" },
    config,
    onScanSuccess,
    onScanFailure
  ).then(() => {
    globalState.isScanning = true;
    actualizarBotonEscaner(true);
  }).catch(err => {
    console.error("Error al iniciar cámara:", err);
    mostrarNotificacion("No se pudo acceder a la cámara", "danger");
  });
}

function detenerEscanerQR() {
  if (globalState.html5QrCode && globalState.isScanning) {
    globalState.html5QrCode.stop().then(() => {
      globalState.isScanning = false;
      actualizarBotonEscaner(false);
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
    mostrarNotificacion(`SKU ${decodedText} no encontrado en el inventario`, 'warning');
  }
}

function onScanFailure(error) {
  // Ignorar errores continuos de búsqueda de frame QR
}

function actualizarBotonEscaner(activo) {
  const btn = document.getElementById('btn-toggle-escaner');
  if (btn) {
    btn.textContent = activo ? 'Detener Cámara' : 'Abrir Cámara QR';
    btn.className = activo ? 'btn btn-danger' : 'btn btn-primary';
  }
}

// 8. FUNCIONES AUXILIARES DE UI Y MODALES
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

function verCodigoQR(sku, urlQR) {
  const imgElem = document.getElementById('img-qr-code');
  const titleElem = document.getElementById('modal-qr-sku');
  if (imgElem) imgElem.src = urlQR || `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${sku}`;
  if (titleElem) titleElem.textContent = `Código QR - ${sku}`;

  const modalElem = document.getElementById('modalVerQR');
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
  const container = document.getElementById('toast-container') || document.body;
  const alertDiv = document.createElement('div');
  alertDiv.className = `alert alert-${tipo} alert-dismissible fade show position-fixed bottom-0 end-0 m-3 z-index-modal`;
  alertDiv.style.zIndex = '9999';
  alertDiv.innerHTML = `
    ${mensaje}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  `;
  container.appendChild(alertDiv);

  setTimeout(() => {
    alertDiv.remove();
  }, 4000);
}

function mostrarCargando(mostrar) {
  const spinner = document.getElementById('loading-spinner');
  if (spinner) spinner.style.display = mostrar ? 'block' : 'none';
}