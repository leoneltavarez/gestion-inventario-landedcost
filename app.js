// CONFIGURACIÓN API GOOGLE APPS SCRIPT
const API_URL = 'https://script.google.com/macros/s/AKfycbwvXg595uwxls3WMOOo9hrN31fJpPI7ENCM8E9jT1jwdUtKGaT-bvw1SrATEdRmEoAZ/exec';

let globalState = {
  tasaUSD: 60.00,
  productos: [],
  categorias: [],
  tiposMovimiento: [],
  html5QrCode: null,
  isScanning: false
};

document.addEventListener('DOMContentLoaded', () => {
  configurarEventosUI();
  cargarDatosBackend();
});

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
        <button class="btn btn-sm btn-outline-secondary" onclick="verCodigoQR('${p.sku}', '${p.urlQR}')" title="Ver QR">
          <i class="bi bi-qr-code"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
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

// 4. NUEVO PRODUCTO
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

// 5. REGISTRAR MOVIMIENTO
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

// 6. CAMARA QR
function iniciarEscanerQR() {
  const container = document.getElementById('container-escaner-camara');
  if (container) container.style.display = 'block';

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
    mostrarNotificacion("No se detectó cámara o permiso denegado", "danger");
  });
}

function detenerEscanerQR() {
  const container = document.getElementById('container-escaner-camara');
  if (container) container.style.display = 'none';

  if (globalState.html5QrCode && globalState.isScanning) {
    globalState.html5QrCode.stop().then(() => {
      globalState.isScanning = false;
    });
  }
}

function onScanSuccess(decodedText) {
  detenerEscanerQR();
  mostrarNotificacion(`QR Escaneado: ${decodedText}`, 'info');
  
  const prod = globalState.productos.find(p => p.sku.toLowerCase() === decodedText.toLowerCase());
  if (prod) {
    abrirModalMovimiento(prod.sku);
  } else {
    mostrarNotificacion(`SKU ${decodedText} no encontrado en la hoja`, 'warning');
  }
}

// 7. UTILS Y EVENTOS
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
  alert(mensaje);
}

function mostrarCargando(mostrar) {
  const spinner = document.getElementById('loading-spinner');
  if (spinner) spinner.style.display = mostrar ? 'block' : 'none';
}