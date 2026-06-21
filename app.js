/* ============================================================
   CONFIGURACIÓN
   Pega aquí la URL de tu Web App de Apps Script (termina en /exec)
   ============================================================ */
const API_URL = 'PEGA_AQUI_TU_URL_DE_APPS_SCRIPT';

/* ============================================================
   HELPERS DE LLAMADAS A LA API
   - GET para lecturas
   - POST con Content-Type text/plain para evitar el preflight
     CORS que Apps Script no puede responder correctamente
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
let chartEstado = null;
let chartItems = null;

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
   INICIO: cargar responsables y revisar si hay lista en curso
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
  const btn = document.getElementById('btn-crear-lista');
  btn.disabled = true;

  const resp = await apiPost('crearLista', { responsable });
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
    'Iniciada: ' + formatearFecha(lista.fechaCreacion);
  itemsActuales = items || [];
  renderItems();
  document.getElementById('input-sku').focus();
}

/* ============================================================
   AGREGAR SKU
   ============================================================ */
const inputSku = document.getElementById('input-sku');
const feedback = document.getElementById('scan-feedback');

document.getElementById('btn-agregar-sku').addEventListener('click', agregarSku);
inputSku.addEventListener('keydown', e => { if (e.key === 'Enter') agregarSku(); });

async function agregarSku() {
  const sku = inputSku.value.trim();
  if (!sku) return;

  feedback.textContent = 'Buscando...';
  feedback.className = 'feedback';

  const resp = await apiPost('agregarItem', { listaId: listaActualId, sku });

  if (!resp.success) {
    feedback.textContent = resp.message || 'SKU no encontrado';
    feedback.className = 'feedback error';
    inputSku.select();
    return;
  }

  itemsActuales.push(resp.item);
  renderItems();
  feedback.textContent = '✓ ' + resp.item.descripcion;
  feedback.className = 'feedback ok';
  inputSku.value = '';
  inputSku.focus();
}

function renderItems() {
  const body = document.getElementById('items-body');
  body.innerHTML = '';
  itemsActuales.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.sku}</td>
      <td>${item.descripcion}</td>
      <td>${item.stock}</td>
      <td><button class="row-delete" data-sku="${item.sku}">Quitar</button></td>
    `;
    body.appendChild(tr);
  });
  document.getElementById('items-count').textContent =
    itemsActuales.length + (itemsActuales.length === 1 ? ' producto' : ' productos');

  body.querySelectorAll('.row-delete').forEach(b => {
    b.addEventListener('click', () => eliminarItem(b.dataset.sku));
  });
}

async function eliminarItem(sku) {
  const resp = await apiPost('eliminarItem', { listaId: listaActualId, sku });
  if (resp.success) {
    itemsActuales = itemsActuales.filter(i => i.sku !== sku);
    renderItems();
  }
}

/* ============================================================
   CERRAR LISTA
   ============================================================ */
document.getElementById('btn-cerrar-lista').addEventListener('click', async () => {
  if (!confirm('¿Cerrar esta lista? No podrás seguir agregando productos.')) return;

  const resp = await apiPost('cerrarLista', { listaId: listaActualId });
  if (!resp.success) { alert(resp.message || 'No se pudo cerrar la lista'); return; }

  localStorage.removeItem('listaActualId');
  listaActualId = null;
  itemsActuales = [];

  document.getElementById('panel-con-lista').classList.add('hidden');
  document.getElementById('panel-sin-lista').classList.remove('hidden');
  document.getElementById('scan-feedback').textContent = '';
});

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
    formatearFecha(detalle.lista.fechaCreacion) + ' → ' + formatearFecha(detalle.lista.fechaCierre);

  const body = document.getElementById('modal-items-body');
  body.innerHTML = '';
  detalle.items.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${item.sku}</td><td>${item.descripcion}</td><td>${item.stock}</td>`;
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

/* ============================================================
   UTILS
   ============================================================ */
function formatearFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}
