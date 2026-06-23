/* ============================================================
   CONFIGURACIÓN
   Pega aquí la URL de tu Web App de Apps Script (termina en /exec)
   ============================================================ */
const API_URL = 'https://script.google.com/macros/s/AKfycbwlYjmEcfMXG3Ul1pP2vR5Juvh_VVGYsoOYYksY7lDxXKMzr_43GIdrkQz0cm1FnvXl9g/exec';

/* ============================================================
   HELPERS DE LLAMADAS A LA API
   ============================================================ */
async function apiGet(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  return res.json();
}

async function apiPost(action, payload = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload })
  });
  return res.json();
}

/* ============================================================
   ESTADO
   ============================================================ */
let listaActualId = localStorage.getItem('listaActualId') || null;
let itemsActuales = [];
let tipoSeleccionado = 'SALIDA';
let chartEstado = null;
let chartItems = null;
let chartMovimientos = null;

/* ============================================================
   TABS
   ============================================================ */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'dashboard') cargarDashboard();
  });
});

/* ============================================================
   TOGGLE TIPO (Entrada / Salida)
   ============================================================ */
document.querySelectorAll('.tipo-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tipo-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    tipoSeleccionado = btn.dataset.tipo;
  });
});

/* ============================================================
   INICIO
   ============================================================ */
async function init() {
  const resp = await apiGet('responsables');
  const select = document.getElementById('select-responsable');
  select.innerHTML = '';
  (resp.responsables || []).forEach(r => {
    const opt = document.createElement('option');
    opt.value = r;
    opt.textContent = r;
    select.appendChild(opt);
  });

  const respAut = await apiGet('autorizadores');
  const selectAut = document.getElementById('select-autorizador');
  selectAut.innerHTML = '';
  (respAut.autorizadores || []).forEach(r => {
    const opt = document.createElement('option');
    opt.value = r;
    opt.textContent = r;
    selectAut.appendChild(opt);
  });

  if (listaActualId) {
    const detalle = await apiGet('listaDetalle', { id: listaActualId });
    if (detalle.success && detalle.lista.estado === 'Pendiente') {
      mostrarPanelConLista(detalle.lista, detalle.items);
    } else {
      localStorage.removeItem('listaActualId');
      listaActualId = null;
    }
  }
}
init();

/* ============================================================
   CREAR LISTA
   ============================================================ */
document.getElementById('btn-crear-lista').addEventListener('click', async () => {
  const responsable = document.getElementById('select-responsable').value;
  const numeroDocumento = document.getElementById('input-documento').value.trim();
  const btn = document.getElementById('btn-crear-lista');
  btn.disabled = true;

  const resp = await apiPost('crearLista', { responsable, numeroDocumento });
  btn.disabled = false;

  if (!resp.success) { alert(resp.message || 'No se pudo crear la lista'); return; }

  listaActualId = resp.id;
  localStorage.setItem('listaActualId', listaActualId);
  mostrarPanelConLista(resp, []);
});

function mostrarPanelConLista(lista, items) {
  document.getElementById('panel-sin-lista').classList.add('hidden');
  document.getElementById('panel-con-lista').classList.remove('hidden');
  document.getElementById('lista-responsable-actual').textContent = lista.responsable;
  document.getElementById('lista-fecha-actual').textContent =
    'Iniciada: ' + formatearFecha(lista.fechaCreacion) +
    (lista.numeroDocumento ? ' · Doc: ' + lista.numeroDocumento : '');
  itemsActuales = items || [];
  renderItems();
  document.getElementById('input-sku').focus();
}

/* ============================================================
   VISTA PREVIA AL ESCANEAR SKU (antes de agregar)
   ============================================================ */
const inputSku = document.getElementById('input-sku');
const inputCantidad = document.getElementById('input-cantidad');
const previewFeedback = document.getElementById('preview-feedback');
const scanFeedback = document.getElementById('scan-feedback');

inputSku.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  buscarPreviaSku();
});
document.getElementById('btn-buscar-sku').addEventListener('click', buscarPreviaSku);

async function buscarPreviaSku() {
  const sku = inputSku.value.trim();
  if (!sku) return;

  previewFeedback.textContent = 'Buscando...';
  previewFeedback.className = 'feedback';

  const resp = await apiGet('buscarSku', { sku });
  if (!resp.success) {
    previewFeedback.textContent = resp.message || 'SKU no encontrado';
    previewFeedback.className = 'feedback error';
    inputSku.select();
    return;
  }

  previewFeedback.textContent = '✓ ' + resp.descripcion + ' (stock ref: ' + resp.stock + ')';
  previewFeedback.className = 'feedback ok';
  inputCantidad.focus();
  inputCantidad.select();
}

inputCantidad.addEventListener('keydown', e => { if (e.key === 'Enter') agregarSku(); });
document.getElementById('btn-agregar-sku').addEventListener('click', agregarSku);

async function agregarSku() {
  const sku = inputSku.value.trim();
  const cantidad = Number(inputCantidad.value);

  if (!sku) { inputSku.focus(); return; }
  if (!cantidad || cantidad <= 0) { inputCantidad.focus(); inputCantidad.select(); return; }

  scanFeedback.textContent = 'Guardando...';
  scanFeedback.className = 'feedback';

  const resp = await apiPost('agregarItem', {
    listaId: listaActualId, sku, tipo: tipoSeleccionado, cantidad
  });

  if (!resp.success) {
    scanFeedback.textContent = resp.message || 'No se pudo agregar';
    scanFeedback.className = 'feedback error';
    return;
  }

  itemsActuales.push(resp.item);
  renderItems();
  scanFeedback.textContent = '✓ Agregado a la lista: ' + resp.item.descripcion + ' (se registrará en Movimientos al cerrar)';
  scanFeedback.className = 'feedback ok';

  inputSku.value = '';
  inputCantidad.value = '1';
  previewFeedback.textContent = '';
  inputSku.focus();
}

function renderItems() {
  const body = document.getElementById('items-body');
  body.innerHTML = '';
  itemsActuales.forEach((item, idx) => {
    const tr = document.createElement('tr');
    const tipoClass = item.tipo === 'ENTRADA' ? 'entrada' : 'salida';
    tr.innerHTML = `
      <td>${item.sku}</td>
      <td>${item.descripcion}</td>
      <td><span class="tipo-pill ${tipoClass}">${item.tipo}</span></td>
      <td>${item.cantidad}</td>
      <td>${item.stock}</td>
      <td><button class="row-delete" data-idx="${idx}">Quitar</button></td>
    `;
    body.appendChild(tr);
  });
  document.getElementById('items-count').textContent =
    itemsActuales.length + (itemsActuales.length === 1 ? ' producto' : ' productos');

  body.querySelectorAll('.row-delete').forEach(b => {
    b.addEventListener('click', () => eliminarItem(Number(b.dataset.idx)));
  });
}

async function eliminarItem(itemIndex) {
  if (!confirm('¿Quitar este producto de la lista?')) return;
  const resp = await apiPost('eliminarItem', { listaId: listaActualId, itemIndex });
  if (resp.success) {
    itemsActuales.splice(itemIndex, 1);
    renderItems();
  }
}

/* ============================================================
   SCANNER DE CÁMARA (html5-qrcode)
   Soporta EAN-13, EAN-8, Code 128, Code 39, UPC-A, UPC-E
   Permite elegir entre todas las cámaras disponibles del
   dispositivo, útil cuando la cámara trasera principal no
   detecta bien los códigos de barras.
   ============================================================ */
const modalScanner       = document.getElementById('modal-scanner');
const scannerStatus      = document.getElementById('scanner-status');
const panelSelectorCam   = document.getElementById('panel-selector-camara');
const listaCamaras       = document.getElementById('lista-camaras');
const btnCambiarCamara   = document.getElementById('btn-cambiar-camara');

let html5QrCode          = null;
let scannerActivo        = false;
let camarasDisponibles   = [];   // [{ id, label }]
let camaraActualId       = null;

const FORMATOS_BARCODE = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR
];

document.getElementById('btn-escanear').addEventListener('click', abrirScanner);
document.getElementById('modal-scanner-cerrar').addEventListener('click', cerrarScanner);
btnCambiarCamara.addEventListener('click', mostrarSelectorCamara);

/* ------ Abrir scanner ------ */
async function abrirScanner() {
  modalScanner.classList.remove('hidden');
  panelSelectorCam.classList.add('hidden');
  btnCambiarCamara.classList.add('hidden');
  scannerStatus.textContent = 'Buscando cámaras disponibles...';
  scannerStatus.className = 'feedback';

  try {
    camarasDisponibles = await Html5Qrcode.getCameras();
  } catch (err) {
    scannerStatus.textContent = 'Permiso de cámara denegado. Actívalo en la configuración del navegador.';
    scannerStatus.className = 'feedback error';
    return;
  }

  if (!camarasDisponibles || camarasDisponibles.length === 0) {
    scannerStatus.textContent = 'No se encontró ninguna cámara en este dispositivo.';
    scannerStatus.className = 'feedback error';
    return;
  }

  if (camarasDisponibles.length === 1) {
    // Solo una cámara → iniciar directamente
    await iniciarCamara(camarasDisponibles[0].id);
  } else {
    // Varias cámaras → mostrar selector
    mostrarSelectorCamara();
  }
}

/* ------ Mostrar selector de cámaras ------ */
function mostrarSelectorCamara() {
  // Si el scanner estaba activo, detenerlo para poder cambiar
  if (scannerActivo) detenerCamaraActual();

  listaCamaras.innerHTML = '';
  camarasDisponibles.forEach(cam => {
    const btn = document.createElement('button');
    btn.className = 'btn-camara' + (cam.id === camaraActualId ? ' activa' : '');

    // Etiqueta legible: si el label está vacío o es genérico, poner nombre amigable
    const label = cam.label || '';
    let nombre = label;
    if (!nombre || nombre.toLowerCase().includes('facing back') || nombre.toLowerCase().includes('environment')) {
      nombre = '📷 Cámara trasera';
    } else if (nombre.toLowerCase().includes('facing front') || nombre.toLowerCase().includes('user')) {
      nombre = '🤳 Cámara frontal';
    } else {
      // Acortar labels muy largos (algunos dispositivos ponen el ID completo)
      nombre = '📷 ' + (label.length > 40 ? label.substring(0, 40) + '…' : label);
    }

    btn.textContent = nombre + (cam.id === camaraActualId ? '  ✓ en uso' : '');
    btn.type = 'button';
    btn.addEventListener('click', () => iniciarCamara(cam.id));
    listaCamaras.appendChild(btn);
  });

  panelSelectorCam.classList.remove('hidden');
  document.getElementById('reader').innerHTML = '';
  scannerStatus.textContent = 'Elige la cámara que quieres usar:';
  scannerStatus.className = 'feedback';
  btnCambiarCamara.classList.add('hidden');
}

/* ------ Iniciar una cámara específica por ID ------ */
async function iniciarCamara(camaraId) {
  panelSelectorCam.classList.add('hidden');
  scannerStatus.textContent = 'Iniciando cámara...';
  scannerStatus.className = 'feedback';

  // Asegurarse de que no haya instancia previa activa
  await detenerCamaraActual();

  try {
    html5QrCode = new Html5Qrcode('reader', {
      formatsToSupport: FORMATOS_BARCODE,
      verbose: false
    });

    await html5QrCode.start(
      camaraId,
      {
        fps: 12,
        qrbox: { width: 280, height: 120 },
        aspectRatio: 1.5
      },
      onScanExitoso,
      () => {}   // errores por frame silenciosos (normal mientras enfoca)
    );

    scannerActivo = true;
    camaraActualId = camaraId;
    scannerStatus.textContent = 'Apunta la cámara al código de barras';

    // Mostrar botón "Cambiar cámara" solo si hay más de una disponible
    if (camarasDisponibles.length > 1) {
      btnCambiarCamara.classList.remove('hidden');
    }

  } catch (err) {
    let mensaje = 'No se pudo iniciar esta cámara.';
    if (err.toString().includes('Permission')) {
      mensaje = 'Permiso de cámara denegado. Actívalo en la configuración del navegador.';
    }
    scannerStatus.textContent = mensaje;
    scannerStatus.className = 'feedback error';

    // Si falla, volver al selector para que pruebe otra
    if (camarasDisponibles.length > 1) {
      setTimeout(mostrarSelectorCamara, 1500);
    }
  }
}

/* ------ Detener la cámara activa sin cerrar el modal ------ */
async function detenerCamaraActual() {
  if (html5QrCode && scannerActivo) {
    try { await html5QrCode.stop(); } catch (_) {}
    html5QrCode = null;
    scannerActivo = false;
  }
  document.getElementById('reader').innerHTML = '';
}

/* ------ Scan exitoso ------ */
async function onScanExitoso(codigoBarras) {
  if (!scannerActivo) return;
  if (navigator.vibrate) navigator.vibrate(80);

  await cerrarScanner();

  const inputSkuEl = document.getElementById('input-sku');
  inputSkuEl.value = codigoBarras.trim();

  const previewFb = document.getElementById('preview-feedback');
  previewFb.textContent = 'Buscando...';
  previewFb.className = 'feedback';

  const resp = await apiGet('buscarSku', { sku: codigoBarras.trim() });
  if (!resp.success) {
    previewFb.textContent = resp.message || 'SKU no encontrado';
    previewFb.className = 'feedback error';
    inputSkuEl.select();
    return;
  }

  previewFb.textContent = '✓ ' + resp.descripcion + ' (stock ref: ' + resp.stock + ')';
  previewFb.className = 'feedback ok';

  const cantidadEl = document.getElementById('input-cantidad');
  cantidadEl.focus();
  cantidadEl.select();
}

/* ------ Cerrar scanner completamente ------ */
async function cerrarScanner() {
  await detenerCamaraActual();
  panelSelectorCam.classList.add('hidden');
  btnCambiarCamara.classList.add('hidden');
  scannerStatus.textContent = '';
  modalScanner.classList.add('hidden');
}


const modalCierre = document.getElementById('modal-cierre');
const inputPin = document.getElementById('input-pin');
const cierreFeedback = document.getElementById('cierre-feedback');

document.getElementById('btn-abrir-cierre').addEventListener('click', () => {
  inputPin.value = '';
  cierreFeedback.textContent = '';
  modalCierre.classList.remove('hidden');
  inputPin.focus();
});

document.getElementById('modal-cierre-cerrar').addEventListener('click', () => {
  modalCierre.classList.add('hidden');
});

inputPin.addEventListener('keydown', e => { if (e.key === 'Enter') confirmarCierre(); });
document.getElementById('btn-confirmar-cierre').addEventListener('click', confirmarCierre);

async function confirmarCierre() {
  const autorizadoPor = document.getElementById('select-autorizador').value;
  const pin = inputPin.value.trim();

  if (!pin) { inputPin.focus(); return; }

  cierreFeedback.textContent = 'Verificando...';
  cierreFeedback.className = 'feedback';

  const resp = await apiPost('cerrarLista', { listaId: listaActualId, autorizadoPor, pin });

  if (!resp.success) {
    cierreFeedback.textContent = resp.message || 'No se pudo cerrar la lista';
    cierreFeedback.className = 'feedback error';
    inputPin.value = '';
    inputPin.focus();
    return;
  }

  modalCierre.classList.add('hidden');

  localStorage.removeItem('listaActualId');
  listaActualId = null;
  itemsActuales = [];

  document.getElementById('panel-con-lista').classList.add('hidden');
  document.getElementById('panel-sin-lista').classList.remove('hidden');
  document.getElementById('input-documento').value = '';
  scanFeedback.textContent = '';
  previewFeedback.textContent = '';
}

/* ============================================================
   DASHBOARD
   ============================================================ */
async function cargarDashboard() {
  const resp = await apiGet('listas');
  if (!resp.success) return;

  const { pendientes, cerradas } = resp;

  document.getElementById('stat-pendientes').textContent = pendientes.length;
  document.getElementById('stat-cerradas').textContent = cerradas.length;
  document.getElementById('stat-total').textContent = pendientes.length + cerradas.length;

  const totalItems = [...pendientes, ...cerradas].reduce((acc, l) => acc + (l.totalItems || 0), 0);
  document.getElementById('stat-items').textContent = totalItems;

  renderTablaPendientes(pendientes);
  renderTablaCerradas(cerradas);
  renderChartEstado(pendientes.length, cerradas.length);
  renderChartItems([...pendientes, ...cerradas]);

  const resumen = await apiGet('resumenMovimientos');
  if (resumen.success) renderChartMovimientos(resumen.totalEntrada, resumen.totalSalida);
}

function renderTablaPendientes(pendientes) {
  const body = document.getElementById('pendientes-body');
  body.innerHTML = '';
  if (pendientes.length === 0) {
    body.innerHTML = '<tr><td colspan="4" class="muted">No hay listas pendientes</td></tr>';
    return;
  }
  pendientes.forEach(l => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${l.responsable}</td>
      <td>${formatearFecha(l.fechaCreacion)}</td>
      <td>${l.totalItems}</td>
      <td><button class="btn small primary" data-id="${l.id}">Continuar</button></td>
    `;
    body.appendChild(tr);
  });
  body.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => continuarLista(b.dataset.id));
  });
}

function renderTablaCerradas(cerradas) {
  const body = document.getElementById('cerradas-body');
  body.innerHTML = '';
  if (cerradas.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="muted">No hay listas cerradas todavía</td></tr>';
    return;
  }
  cerradas.forEach(l => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${l.responsable}</td>
      <td>${formatearFecha(l.fechaCreacion)}</td>
      <td>${formatearFecha(l.fechaCierre)}</td>
      <td>${l.totalItems}</td>
      <td><button class="btn small" data-id="${l.id}">Ver detalle</button></td>
    `;
    body.appendChild(tr);
  });
  body.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => verDetalle(b.dataset.id));
  });
}

async function continuarLista(id) {
  const detalle = await apiGet('listaDetalle', { id });
  if (!detalle.success) return;
  listaActualId = id;
  localStorage.setItem('listaActualId', id);
  document.querySelector('.tab-btn[data-tab="nueva"]').click();
  mostrarPanelConLista(detalle.lista, detalle.items);
}

async function verDetalle(id) {
  const detalle = await apiGet('listaDetalle', { id });
  if (!detalle.success) return;

  document.getElementById('modal-titulo').textContent = 'Lista de ' + detalle.lista.responsable;
  document.getElementById('modal-subtitulo').textContent =
    formatearFecha(detalle.lista.fechaCreacion) + ' → ' + formatearFecha(detalle.lista.fechaCierre) +
    (detalle.lista.numeroDocumento ? ' · Doc: ' + detalle.lista.numeroDocumento : '') +
    (detalle.lista.autorizadoPor ? ' · Autorizó: ' + detalle.lista.autorizadoPor : '');

  const body = document.getElementById('modal-items-body');
  body.innerHTML = '';
  detalle.items.forEach(item => {
    const tipoClass = item.tipo === 'ENTRADA' ? 'entrada' : 'salida';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${item.sku}</td><td>${item.descripcion}</td><td><span class="tipo-pill ${tipoClass}">${item.tipo}</span></td><td>${item.cantidad}</td>`;
    body.appendChild(tr);
  });

  document.getElementById('modal-detalle').classList.remove('hidden');
}
document.getElementById('modal-cerrar').addEventListener('click', () => {
  document.getElementById('modal-detalle').classList.add('hidden');
});

/* ============================================================
   GRÁFICOS
   ============================================================ */
function renderChartEstado(pendientes, cerradas) {
  const ctx = document.getElementById('chart-estado');
  if (chartEstado) chartEstado.destroy();
  chartEstado = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Pendientes', 'Cerradas'],
      datasets: [{
        data: [pendientes, cerradas],
        backgroundColor: ['#d98c00', '#1ea672'],
        borderWidth: 0
      }]
    },
    options: {
      plugins: { legend: { position: 'bottom', labels: { font: { family: 'Manrope' } } } },
      cutout: '65%'
    }
  });
}

function renderChartItems(listas) {
  const top = [...listas].sort((a, b) => b.totalItems - a.totalItems).slice(0, 8);
  const ctx = document.getElementById('chart-items');
  if (chartItems) chartItems.destroy();
  chartItems = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map(l => l.responsable),
      datasets: [{
        label: 'Productos',
        data: top.map(l => l.totalItems),
        backgroundColor: '#2d5bff',
        borderRadius: 6,
        maxBarThickness: 36
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

function renderChartMovimientos(totalEntrada, totalSalida) {
  const ctx = document.getElementById('chart-movimientos');
  if (chartMovimientos) chartMovimientos.destroy();
  chartMovimientos = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Entradas', 'Salidas'],
      datasets: [{
        data: [totalEntrada, totalSalida],
        backgroundColor: ['#1ea672', '#d9445e'],
        borderWidth: 0
      }]
    },
    options: {
      plugins: { legend: { position: 'bottom', labels: { font: { family: 'Manrope' } } } },
      cutout: '65%'
    }
  });
}

/* ============================================================
   UTILS
   ============================================================ */
function formatearFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}
