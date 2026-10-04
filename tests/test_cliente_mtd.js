/* Pruebas de la lógica de JsVentasMtd.html sin navegador: se carga el <script> en un
 * contexto vm con un DOM mínimo falso. Los números son los REALES de la auditoría
 * (hoja "Historico de ventas", sep-2026).
 *
 *   node tests/test_cliente_mtd.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const dir = path.join(__dirname, '..', 'Apps Script');

/* ---- DOM falso mínimo ---- */
function crearDom() {
  const els = {};
  const get = id => els[id] || (els[id] = {
    id, innerHTML: '', innerText: '', value: '', style: {}, hidden: false,
    classList: { toggle() {}, remove() {}, add() {} }, children: [],
    setAttribute() {}, getAttribute() { return null; }
  });
  return { getElementById: get, querySelectorAll: () => [], els, createElement: () => ({}) };
}

function cargar(guardado) {
  const document = crearDom();
  const ctx = {
    document, console, Intl, Math, JSON, Date, Number, String, Object, Array, isFinite, isNaN, parseInt, parseFloat,
    window: {}, localStorage: { getItem: () => (guardado ? JSON.stringify(guardado) : null), setItem() {} },
    setTimeout: (f) => f(), alert() {},
    FMT: new Intl.NumberFormat('es-CO'),
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    normTxt: s => String(s == null ? '' : s).toUpperCase().normalize('NFD').replace(/\p{Diacritic}/gu, ''),
    esGas: () => false, me: e => String(e),
    cargarLib: () => {}, Selector: function () {}, mapaAlEntrar() {}
  };
  vm.createContext(ctx);
  const html = fs.readFileSync(path.join(dir, 'JsVentasMtd.html'), 'utf8');
  vm.runInContext(html.match(/<script>([\s\S]*)<\/script>/)[1].replace(/^let ventasMtdData/m, 'var ventasMtdData'), ctx);
  return ctx;
}

let ok = 0;
function t(n, fn) { try { fn(); ok++; console.log('  ✓ ' + n); } catch (e) { console.log('  ✗ ' + n + '\n    ' + e.message); process.exitCode = 1; } }
const num = x => Number(String(x).replace(/[^\d,-]/g, '').replace(',', '.'));

/* ---- Payload mínimo con los casos reales ----
 * Histórico (M = millones): 2025 completo = 193.968 ; ene–sep 2025 = 135.402 ; ene–sep 2026 = 137.986
 * Se reparten en un solo cliente por mes para reproducir los totales exactos.   */
const M = 1e6;
const m25 = [9215, 11802, 12907, 19185, 12315, 13013, 17461, 17147, 22357, 13701, 18967, 25898];
const m26 = [8681, 13287, 13666, 15963, 17279, 21056, 14233, 16099, 17722, 0, 0, 0];
const pl26 = [9639, 14847, 16593, 18496, 18116, 18524, 18078, 18247, 20710, 0, 0, 0];
const hist = [];
m25.forEach((v, i) => hist.push([2025, i + 1, 'A', v * M, 0]));
m26.forEach((v, i) => hist.push([2026, i + 1, 'A', v * M, pl26[i] * M]));
m25.forEach((v, i) => hist.push([2025, i + 1, 'P', 1000 * M, 0]));        // cliente perdido: vendió 12.000 M en 2025, nada en 2026
const payload = {
  v: 2,
  clientes: [
    { id: 'A', sapId: 'A', cliente: 'CLIENTE A', kam: 'ANGELICA MONSALVE', canal: 'Cadenas', realMes: 4560, planMes: 4516, realAnio: 33754, planAnio: 38312, interno: 0, error: 0 },
    { id: 'B', sapId: 'B', cliente: 'SAINT-PRIEST', kam: 'SERGIO MAGGI', canal: 'Tiendas de piel', realMes: 7, planMes: 0, realAnio: 159, planAnio: 161, interno: 0, error: 0 },
    { id: 'C', sapId: 'C', cliente: 'DERMATOLOGICA', kam: 'SIN KAM', canal: 'Tiendas de piel', realMes: -1, planMes: 0, realAnio: 25, planAnio: 840, interno: 0, error: 0 }],
  productos: ['PROD 1', 'PROD 2'],
  prod: [['A', 0, 300, 600, 10], ['A', 1, 100, 0, 5], ['B', 0, 7, 7, 1], ['C', 1, 0, 50, 0]],
  hist, histClientes: { A: ['CLIENTE A', 'ANGELICA MONSALVE', 'Cadenas'], P: ['CLIENTE PERDIDO', 'SIN KAM', 'Tiendas de piel'] },
  meta: { periodo: { anio: 2026, mes: 9 }, actualizadoEn: '2026-10-03T10:00:00Z', errores: {}, historico: { filas: hist.length, anioMin: 2025, anioMax: 2026 } }
};

console.log('Cliente · definiciones de KPI');
const c = cargar();
t('% cumplimiento: sin plan → null (la hoja decía 100 %); con plan → real/plan', () => {
  assert.strictEqual(c.mtdCumpl(7, 0), null);
  assert.strictEqual(c.mtdCumpl(-1, 0), null);
  assert.ok(Math.abs(c.mtdCumpl(4560, 4516) - 1.00974) < 1e-4);
});
t('sin plan se pinta gris neutro, no rojo', () => {
  assert.strictEqual(c.mtdSem(null)[1], '#9ca3af');
  assert.strictEqual(c.mtdSem(0.5)[1], '#e41f33');
  assert.ok(/sin plan/.test(c.mtdCeldaPct(null, 'x')));
});
t('Δ vs A-1: solo con base positiva; sin base y con venta → "Nuevo"', () => {
  assert.strictEqual(c.mtdDeltaV(100, 0), null);
  assert.strictEqual(c.mtdDeltaV(150, 100), 0.5);
  assert.ok(/Nuevo/.test(c.mtdDeltaImp(100, 0, 'x')));
  assert.ok(/–/.test(c.mtdDeltaImp(0, 0, 'x')));
});

console.log('Cliente · histórico con corte (el bug de −28,9 %)');
c.onVentasMtdCargado(JSON.parse(JSON.stringify(payload)));
t('el corte de 2026 es septiembre (último mes con venta), no diciembre', () => {
  assert.strictEqual(c.mtdCortes[2026], 9);
  assert.strictEqual(c.mtdCortes[2025], 12);
  assert.deepStrictEqual(Array.from(c.histAnios), [2026, 2025]);
});
t('YTD 2026 vs MISMO corte 2025 (cliente A): +1,9 %, no −28,9 %', () => {
  const ids = { A: 1 };
  const act = c.histAgruparPorCliente(2026, [1, 2, 3, 4, 5, 6, 7, 8, 9], ids).A.real;
  const ant = c.histAgruparPorCliente(2025, [1, 2, 3, 4, 5, 6, 7, 8, 9], ids).A.real;
  assert.strictEqual(act / M, 137986); assert.strictEqual(ant / M, 135402);
  const d = c.mtdDeltaV(act, ant);
  assert.ok(Math.abs(d - 0.0191) < 0.0005, 'Δ=' + d);
  const malo = c.mtdDeltaV(act, 193968 * M);   // la comparación vieja
  assert.ok(Math.abs(malo + 0.2886) < 0.001, 'viejo=' + malo);
});
t('renderHistorico: año 2026 elegido → corte jan–sep, incluye al cliente perdido en el total A-1', () => {
  c.document.getElementById('histAnioFil').value = '2026';
  c.document.getElementById('histTrimFil').value = '';
  c.document.getElementById('histMesFil').value = '';
  c.renderHistorico();
  const kpi = c.document.getElementById('mtdHistKpi').innerHTML;
  assert.ok(/Ventas YTD/.test(kpi), 'rotula YTD (año en curso)');
  // A-1 total = 135.402 (A) + 9 × 1.000 (P, ene–sep) = 144.402 M  →  Δ = 137.986/144.402 − 1 = −4,4 %
  assert.ok(/144\.402/.test(kpi.replace(/\s/g, '')), 'A-1 incluye al cliente perdido: ' + kpi);
  assert.ok(/-4,4/.test(kpi.replace('−', '-')), 'Δ = −4,4 %: ' + kpi);
});
t('un año cerrado se rotula "Año", no "YTD"', () => {
  c.document.getElementById('histAnioFil').value = '2025';
  c.renderHistorico();
  assert.ok(/Ventas del año/.test(c.document.getElementById('mtdHistKpi').innerHTML));
});
t('un trimestre fuera del corte no inventa datos (T4 2026)', () => {
  c.document.getElementById('histAnioFil').value = '2026';
  c.document.getElementById('histTrimFil').value = '4';
  c.renderHistorico();
  assert.ok(/Sin ventas en el periodo elegido/.test(c.document.getElementById('mtdHistTablaCliente').innerHTML));
  c.document.getElementById('histTrimFil').value = '';
});

console.log('Cliente · filtros globales (un KAM filtra TODA la hoja)');
t('KAM = ANGELICA MONSALVE → solo su cliente en KPI, tabla de clientes, KAM, productos e histórico', () => {
  c.setMtdFiltro('kam', ['ANGELICA MONSALVE']);
  c.document.getElementById('histAnioFil').value = '2026';
  c.renderVentasMtd();
  const e = c.document.els;
  assert.ok(/4\.560/.test(num0(e.mtdKpiVenta.innerText)), 'KPI venta = 4.560: ' + e.mtdKpiVenta.innerText);
  assert.ok(/CLIENTE A/.test(e.mtdTablaClientes.innerHTML) && !/SAINT-PRIEST/.test(e.mtdTablaClientes.innerHTML));
  // Estilo Looker: la tabla Por KAM NO se encoge; muestra a todos, el elegido resaltado y los demás atenuados.
  assert.ok(/ANGELICA MONSALVE/.test(e.mtdTablaKam.innerHTML) && /SERGIO MAGGI/.test(e.mtdTablaKam.innerHTML));
  assert.strictEqual(c.mtdVistaKam.length, 3);
  assert.strictEqual((e.mtdTablaKam.innerHTML.match(/class="clicable sel"/g) || []).length, 1);
  assert.strictEqual((e.mtdTablaKam.innerHTML.match(/class="clicable atenuada"/g) || []).length, 2);
  assert.ok(/TOTAL SELECCIÓN/.test(e.mtdTablaKam.innerHTML));
  // Por Producto filtrado por SAP: A tiene PROD 1 (300) y PROD 2 (100); B y C no deben aparecer
  assert.ok(/PROD 1/.test(e.mtdTablaProductos.innerHTML));
  assert.strictEqual(c.mtdVistaProductos.length, 2);
  assert.strictEqual(c.mtdVistaProductos.reduce((s, p) => s + p.ventaMes, 0), 400);
  // Histórico: el cliente perdido (KAM SIN KAM) queda fuera
  assert.ok(!/CLIENTE PERDIDO/.test(e.mtdHistTablaCliente.innerHTML));
});
t('sin filtros vuelve el universo completo (3 clientes con venta/plan: A, B y C)', () => {
  c.setMtdFiltro('kam', []);
  c.renderVentasMtd();
  assert.strictEqual(c.mtdVistaClientes.length, 3);
  assert.ok(/3 clientes con venta o plan/.test(c.document.els.mtdKpiPctDet.innerText));
});
t('OR dentro de una dimensión y AND entre dimensiones', () => {
  c.setMtdFiltro('kam', ['ANGELICA MONSALVE', 'SERGIO MAGGI']); c.setMtdFiltro('canal', ['Tiendas de piel']);
  assert.deepStrictEqual(Object.keys(c.mtdIdsFiltrados()), ['B']);
  c.setMtdFiltro('kam', []); c.setMtdFiltro('canal', []);
});
t('cascada de opciones: con canal=Cadenas, KAM solo ofrece los de ese canal', () => {
  c.setMtdFiltro('canal', ['Cadenas']);
  assert.deepStrictEqual(c.mtdOpciones('kam').map(o => o.valor), ['ANGELICA MONSALVE']);
  c.setMtdFiltro('canal', []);
});
function num0(s) { return String(s).replace(/\s/g, ' '); }

console.log('Cliente · filtrado cruzado (clic en tablas, estilo Looker)');
const E = c.document.els, filaDe = (id, pred) => Array.from(c.MTD_TABLAS[id].vista).findIndex(pred);
t('mtdAlternarFiltro agrega y quita; se acumulan varios', () => {
  c.mtdLimpiarFiltros();
  c.mtdAlternarFiltro('kam', 'ANGELICA MONSALVE'); c.mtdAlternarFiltro('kam', 'SERGIO MAGGI');
  assert.deepStrictEqual(Array.from(c.mtdFiltros.kam), ['ANGELICA MONSALVE', 'SERGIO MAGGI']);
  c.mtdAlternarFiltro('kam', 'ANGELICA MONSALVE');
  assert.deepStrictEqual(Array.from(c.mtdFiltros.kam), ['SERGIO MAGGI']);
  c.mtdLimpiarFiltros();
});
t('clic en una fila (mtdClicTabla) filtra por su clave: Por KAM, Por Cliente y Por Producto', () => {
  c.renderVentasMtd();
  c.mtdClicTabla('mtdTablaKam', filaDe('mtdTablaKam', f => f.kam === 'SERGIO MAGGI'));
  assert.deepStrictEqual(Array.from(c.mtdFiltros.kam), ['SERGIO MAGGI']);
  c.mtdLimpiarFiltros();                                                  // con el KAM puesto, A ya no está en la tabla
  c.mtdClicTabla('mtdTablaClientes', filaDe('mtdTablaClientes', f => f.id === 'A'));
  assert.deepStrictEqual(Array.from(c.mtdFiltros.cliente), ['A']);       // clave = SAP ID, no el nombre
  c.mtdLimpiarFiltros();
  c.mtdClicTabla('mtdTablaProductos', filaDe('mtdTablaProductos', f => f.nombre === 'PROD 2'));
  assert.deepStrictEqual(Array.from(c.mtdFiltros.producto), ['PROD 2']);  // clave = nombre
  c.mtdLimpiarFiltros();
  assert.ok(c.MTD_DIMS.every(d => c.mtdFiltros[d].length === 0), 'Limpiar vacía también producto');
});
t('las filas llevan data-i, tabindex y aria-selected (accesible por teclado)', () => {
  c.renderVentasMtd();
  const h = E.mtdTablaKam.innerHTML;
  assert.ok(/data-i="0"/.test(h) && /tabindex="0"/.test(h) && /aria-selected="false"/.test(h) && /onclick="mtdClicTabla\('mtdTablaKam',0\)"/.test(h));
});
t('Por Cliente no se encoge al elegir un cliente: KPI cambia, la tabla sigue con los 3', () => {
  c.mtdAlternarFiltro('cliente', 'A');
  assert.strictEqual(c.mtdVistaClientes.length, 3);
  assert.ok(/4\.560/.test(num0(E.mtdKpiVenta.innerText)));
  assert.ok(/TOTAL SELECCIÓN/.test(E.mtdTablaClientes.innerHTML));
  assert.strictEqual((E.mtdTablaClientes.innerHTML.match(/class="clicable sel"/g) || []).length, 1);
  // otras tablas sí se filtran: Por KAM solo conserva el KAM de ese cliente
  assert.strictEqual(c.mtdVistaKam.length, 1);
  c.mtdLimpiarFiltros();
});
t('con selección, el TOTAL suma solo lo elegido y cuadra con el KPI', () => {
  c.mtdAlternarFiltro('kam', 'ANGELICA MONSALVE');
  const h = E.mtdTablaKam.innerHTML, total = h.slice(h.lastIndexOf('class="total"'));
  assert.ok(/4\.560/.test(num0(total)) && !/SERGIO/.test(total), total);
  c.mtdLimpiarFiltros();
});
t('filtro de producto: Venta, A-1 y unidades se recalculan desde prod; Plan y Acumulado quedan "n/d"', () => {
  c.mtdAlternarFiltro('producto', 'PROD 1');           // A: 300 (A-1 600, 10 u) + B: 7 (A-1 7, 1 u)
  assert.ok(/307/.test(num0(E.mtdKpiVenta.innerText)), E.mtdKpiVenta.innerText);
  assert.ok(/607/.test(num0(E.mtdKpiVentaDet.innerHTML)) && /11 unidades/.test(E.mtdKpiVentaDet.innerHTML));
  assert.strictEqual(E.mtdKpiPct.innerText, 'n/d');
  assert.strictEqual(E.mtdKpiAnio.innerText, 'n/d');
  assert.ok(/no existe por producto/.test(E.mtdKpiPctDet.innerText + E.mtdKpiAnioDet.innerHTML));
  // Por Cliente: solo quienes vendieron ese producto (C no), con Plan/Cumpl/Año en n/d
  assert.strictEqual(c.mtdVistaClientes.length, 2);
  assert.ok(/class="nd"/.test(E.mtdTablaClientes.innerHTML) && !/sin plan/.test(E.mtdTablaClientes.innerHTML));
  assert.strictEqual(c.mtdVistaClientes.find(f => f.id === 'A').planMes, null);
  // Por Producto sigue mostrando ambos productos: el elegido resaltado, el otro atenuado
  assert.strictEqual(c.mtdVistaProductos.length, 2);
  assert.ok(/class="clicable atenuada"/.test(E.mtdTablaProductos.innerHTML) && /class="clicable sel"/.test(E.mtdTablaProductos.innerHTML));
  // El histórico no trae producto: avisa
  assert.strictEqual(E.mtdHistNotaProd.hidden, false);
  c.mtdAlternarFiltro('producto', 'PROD 1');
  assert.strictEqual(E.mtdHistNotaProd.hidden, true);
  assert.strictEqual(E.mtdKpiPct.innerText.includes('n/d'), false);
});
t('producto + KAM se combinan (AND); el KPI de venta es solo de ese KAM y producto', () => {
  c.mtdAlternarFiltro('producto', 'PROD 2'); c.mtdAlternarFiltro('kam', 'ANGELICA MONSALVE');   // A/PROD 2 = 100
  assert.ok(/\b100\b/.test(num0(E.mtdKpiVenta.innerText)), E.mtdKpiVenta.innerText);
  c.mtdLimpiarFiltros();
});
t('chips de filtros activos: un chip por valor, con el nombre del cliente, y vacío = oculto', () => {
  c.mtdLimpiarFiltros();
  assert.strictEqual(E.mtdChips.hidden, true);
  c.mtdAlternarFiltro('kam', 'SERGIO MAGGI'); c.mtdAlternarFiltro('cliente', 'B'); c.mtdAlternarFiltro('producto', 'PROD 1');
  const h = E.mtdChips.innerHTML;
  assert.strictEqual(E.mtdChips.hidden, false);
  assert.ok(/KAM: SERGIO MAGGI/.test(h) && /Cliente: SAINT-PRIEST/.test(h) && /Producto: PROD 1/.test(h) && /Quitar todos/.test(h), h);
  c.mtdQuitarChip('mtdChips', 2);                                   // quita el chip de producto
  assert.deepStrictEqual(Array.from(c.mtdFiltros.producto), []);
  c.mtdLimpiarChips('mtdChips');
  assert.ok(c.MTD_DIMS.every(d => c.mtdFiltros[d].length === 0));
});
t('más de 4 valores en una dimensión se agrupan en un solo chip', () => {
  c.setMtdFiltro('cliente', ['A', 'B', 'C', 'P', 'X']); c.renderVentasMtd();
  assert.ok(/Cliente: 5 seleccionados/.test(E.mtdChips.innerHTML));
  c.mtdLimpiarFiltros();
});
t('repintar la tabla conserva el scroll interno (antes saltaba al inicio al hacer clic)', () => {
  const el = c.document.getElementById('mtdTablaClientes'), padre = { scrollTop: 0 };
  let html = ''; el.parentNode = padre;
  Object.defineProperty(el, 'innerHTML', { get: () => html, set: v => { html = v; padre.scrollTop = 0; }, configurable: true });
  padre.scrollTop = 150;
  c.mtdAlternarFiltro('kam', 'SERGIO MAGGI');
  assert.strictEqual(padre.scrollTop, 150);
  c.mtdLimpiarFiltros();
});
t('clic en una barra de trimestre alterna el trimestre del histórico', () => {
  c.document.getElementById('histAnioFil').value = '2026';
  c.histAlternarTrim(2);
  assert.strictEqual(c.document.getElementById('histTrimFil').value, '2');
  assert.ok(/hist-barcol clicable sel/.test(E.mtdHistGraficoTrimestre.innerHTML) && /hist-barcol clicable atenuada/.test(E.mtdHistGraficoTrimestre.innerHTML));
  assert.strictEqual((E.mtdHistGraficoTrimestre.innerHTML.match(/hist-barcol/g) || []).length, 4);   // sigue mostrando los 4
  c.histAlternarTrim(2);
  assert.strictEqual(c.document.getElementById('histTrimFil').value, '');
});
t('persistencia: se restauran solo valores que aún existen, producto incluido', () => {
  const c2 = cargar({ canal: [], kam: ['ANGELICA MONSALVE', 'FANTASMA'], cliente: [], producto: ['PROD 2', 'NO EXISTE'] });
  c2.onVentasMtdCargado(JSON.parse(JSON.stringify(payload)));
  assert.deepStrictEqual(Array.from(c2.mtdFiltros.kam), ['ANGELICA MONSALVE']);
  assert.deepStrictEqual(Array.from(c2.mtdFiltros.producto), ['PROD 2']);
});

console.log('Cliente · orden por encabezado');
t('1.er clic = mayor a menor; 2.º = menor a mayor; 3.º = vuelve al orden por defecto', () => {
  c.renderVentasMtd();
  c.mtdOrdenar('mtdTablaClientes', 'planMes');
  assert.deepStrictEqual(Array.from(c.mtdVistaClientes.map(f => f.planMes)), [4516, 0, 0]);
  c.mtdOrdenar('mtdTablaClientes', 'planMes');
  assert.strictEqual(c.mtdVistaClientes[0].planMes, 0);
  assert.strictEqual(c.mtdVistaClientes[2].planMes, 4516);
  c.mtdOrdenar('mtdTablaClientes', 'planMes');
  assert.strictEqual(c.mtdVistaClientes[0].realMes, 4560);     // defecto: venta del mes desc
});
t('texto: 1.er clic A→Z', () => {
  c.mtdOrdenar('mtdTablaClientes', 'cliente');
  assert.deepStrictEqual(Array.from(c.mtdVistaClientes.map(f => f.cliente)), ['CLIENTE A', 'DERMATOLOGICA', 'SAINT-PRIEST']);
  c.mtdOrdenar('mtdTablaClientes', 'cliente'); c.mtdOrdenar('mtdTablaClientes', 'cliente');
});
t('% cumplimiento: los "sin plan" (null) quedan SIEMPRE al final, en ambas direcciones', () => {
  c.mtdOrdenar('mtdTablaClientes', 'cumplPct');
  assert.strictEqual(c.mtdVistaClientes[0].id, 'A');
  c.mtdOrdenar('mtdTablaClientes', 'cumplPct');
  assert.strictEqual(c.mtdVistaClientes[0].id, 'A');           // único con valor, sigue primero
  c.mtdOrdenar('mtdTablaClientes', 'cumplPct');
});
t('la fila TOTAL se mantiene al final y fuera del orden; aria-sort marca la columna activa', () => {
  c.mtdOrdenar('mtdTablaClientes', 'realMes');
  const h = c.document.els.mtdTablaClientes.innerHTML;
  assert.ok(h.lastIndexOf('class="total"') > h.lastIndexOf('SAINT-PRIEST'), 'TOTAL después de la última fila');
  assert.ok(/aria-sort="descending"[^>]*>Venta Mes/.test(h));
  c.mtdOrdenar('mtdTablaClientes', 'realMes'); c.mtdOrdenar('mtdTablaClientes', 'realMes');
});
t('el orden elegido se conserva al volver a filtrar', () => {
  c.mtdOrdenar('mtdTablaClientes', 'planMes');
  c.setMtdFiltro('canal', ['Tiendas de piel']); c.renderVentasMtd();
  assert.deepStrictEqual(Array.from(c.mtdVistaClientes.map(f => f.id)).length, 2);
  assert.ok(/aria-sort="descending"[^>]*>Plan Mes/.test(c.document.els.mtdTablaClientes.innerHTML));
  c.setMtdFiltro('canal', []); c.mtdOrdenar('mtdTablaClientes', 'planMes'); c.mtdOrdenar('mtdTablaClientes', 'planMes');
});
t('el CSV exporta lo que se ve (orden mostrado)', () => {
  c.renderVentasMtd();                       // sin filtros activos
  c.mtdOrdenar('mtdTablaKam', 'kam');
  assert.deepStrictEqual(Array.from(c.mtdVistaKam.map(k => k.kam)), ['ANGELICA MONSALVE', 'SERGIO MAGGI', 'SIN KAM']);
});

console.log('Cliente · periodo y avisos');
t('subtítulo sale de meta.periodo (septiembre 2026), no del reloj', () => {
  c.mtdRotularPeriodo({ periodo: { anio: 2026, mes: 9 } });
  assert.ok(/Septiembre 2026/.test(c.document.els.mtdSubtitulo.innerText));
  assert.ok(/mes cerrado/.test(c.document.els.mtdSubtitulo.innerText) || /mes en curso/.test(c.document.els.mtdSubtitulo.innerText));
});
t('aviso cuando las hojas no concilian (> 0,5 %)', () => {
  c.mtdAvisosPayload({ conciliacion: { cumplimiento: 1000, plantilla: 1000, historico: 1100 }, errores: {} });
  assert.ok(/no concilian/.test(c.document.els.mtdAvisos.innerHTML));
  c.mtdAvisosPayload({ conciliacion: { cumplimiento: 1000, plantilla: 1000, historico: 1001 }, errores: {} });
  assert.ok(c.document.els.mtdAvisos.hidden);
});

console.log('\n' + ok + ' pruebas OK' + (process.exitCode ? ' · HAY FALLAS' : ''));
