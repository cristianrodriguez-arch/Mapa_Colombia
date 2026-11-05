/* Pruebas de la pestaña "SO · Sell Out" (JsSO.html), sin navegador.
 *   node tests/test_so.js
 * Usa el mismo cubo de prueba que tests/test_ventas3.js (el cubo del ETL paso 3).
 */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const dir = path.join(__dirname, '..', 'Apps Script');

function crearDom() {
  const els = {};
  const get = id => els[id] || (els[id] = { id, innerHTML: '', innerText: '', value: '', style: {}, hidden: false,
    classList: { toggle() {}, remove() {}, add() {}, contains: () => false }, children: [], dataset: {}, setAttribute() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800 }) });
  return { getElementById: get, querySelectorAll: () => [], querySelector: () => null, els };
}
function cargar() {
  const document = crearDom();
  const ctx = {
    document, console, Intl, Math, JSON, Date, Number, String, Object, Array, isFinite, isNaN, parseInt, parseFloat, Float64Array,
    window: {}, localStorage: { getItem: () => null, setItem() {} }, setTimeout: f => f(), alert() {},
    FMT: new Intl.NumberFormat('es-CO'),
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    normTxt: s => String(s == null ? '' : s).toUpperCase().normalize('NFD').replace(/\p{Diacritic}/gu, ''),
    esGas: () => false, me: e => String(e), cargarLib: () => {}, Selector: function () {}, mapaAlEntrar() {}
  };
  vm.createContext(ctx);
  const leer = f => fs.readFileSync(path.join(dir, f), 'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
  vm.runInContext(leer('JsVentasMtd.html').replace(/^let ventasMtdData/m, 'var ventasMtdData'), ctx);
  vm.runInContext(leer('JsSIvsSO.html'), ctx);
  vm.runInContext(leer('JsVentas3.html'), ctx);
  vm.runInContext(leer('JsSO.html'), ctx);
  return ctx;
}
const plano = x => JSON.parse(JSON.stringify(x));
let ok = 0;
function t(n, fn) { try { fn(); ok++; console.log('  ✓ ' + n); } catch (e) { console.log('  ✗ ' + n + '\n    ' + e.message); process.exitCode = 1; } }
const cerca = (a, b, tol) => assert.ok(Math.abs(a - b) <= (tol || 1e-9), 'esperado ' + b + ', salió ' + a);

/* ---- Cubo de prueba: 3 PDV, 2 clientes, 2 productos, ene–mar de 2025 y 2026 ----
 * PDV 1 (Cruz Verde) · producto A:  2025: 10,10,10   2026: 12,14,7
 * PDV 2 (Cruz Verde) · producto B:  2025:  5, 5, 5   2026:  5, 5,10
 * PDV 3 (Medipiel)   · producto A:  2025: 20,20,20   2026: 15,15,15     (importe = unidades × 10) */
const meses = ['2025-01', '2025-02', '2025-03', '2026-01', '2026-02', '2026-03'];
const serie = { '0|0': [10, 10, 10, 12, 14, 7], '1|1': [5, 5, 5, 5, 5, 10], '2|0': [20, 20, 20, 15, 15, 15] };
const ps = [];
Object.keys(serie).forEach(k => { const [p, s] = k.split('|').map(Number); serie[k].forEach((u, m) => ps.push([p, s, m, u, u * 10])); });
const pdvCli = [0, 0, 1];
const cs = {}, pm = {};
ps.forEach(([p, s, m, u, a]) => {
  const kc = pdvCli[p] + '|' + s + '|' + m, kp = p + '|' + m;
  (cs[kc] = cs[kc] || [pdvCli[p], s, m, 0, 0]); cs[kc][3] += u; cs[kc][4] += a;
  (pm[kp] = pm[kp] || [p, m, 0, 0]); pm[kp][2] += u; pm[kp][3] += a;
});
const CUBO = { v: 1, generado: '2026-10-10T12:00:00', meses,
  clientes: [['11026707', 'DROGUERIAS CRUZ VERDE SAS', 'ANGELICA MONSALVE'], ['11026712', 'MEDIPIEL S.A.', 'SARA CARDONA']],
  skus: [['E1', 'PROD A', 'FOTO', ''], ['E2', 'PROD B', 'DERMA', '']],
  pdv: [['SF1', 'PDV 1', 0, 'BOGOTA', 'BOGOTA', 'TIENDA'], ['SF2', 'PDV 2', 0, 'CALI', 'VALLE', 'TIENDA'],
        ['SF3', 'PDV 3', 1, 'MEDELLIN', 'ANTIOQUIA', 'DIGITAL']],
  cs: Object.values(cs), pm: Object.values(pm), bus: ['DERMA', 'FOTO'], fragmentos: { pdv: 32, sku: 16 },
  demoPs: ps, meta: { fuentes: [] } };


function nuevo() {
  const c = cargar();
  c.soRecibir(JSON.parse(JSON.stringify(CUBO)));
  c.soE.unidad = '#'; c.soE.anio = 2026; c.soE.meses = []; c.soE.trim = [];
  return c;
}
const tot = c => { const A = c.soAgregar('tot'); return c.soMedidas(A.g.T, c.soSel()); };

console.log('SO · Sell Out');
t('AC, PY, ΔPY, Promedio Selec, Promedio por PDV y Total PDV del año (ene–mar 2026 vs 2025)', () => {
  const c = nuevo(); const m = tot(c);
  assert.strictEqual(m.ac, 98); assert.strictEqual(m.py, 105); assert.strictEqual(m.dpy, -7);
  cerca(m.prom, 98 / 3);
  c.soRender(); c.soRender();
  const k = c.document.els.soKpis.innerHTML;
  assert.ok(/>3<\/div><div class="e">Total PDV/.test(k), k);
  assert.ok(!/Promedio Selec/.test(k), 'Promedio Selec ya no es tarjeta');
  assert.ok(c.document.els.soPromValor.innerHTML.indexOf(c.FMT.format(Math.round(98 / 3))) > -1);
});
t('filtro "Promedio Selec": elige los meses del promedio sin cambiar AC ni el resto', () => {
  const c = nuevo(); c.soRender();
  c.soAlternarProm(1); c.soAlternarProm(3);                     // ene (32) y mar (32) de 2026
  const A = c.soAgregar('tot'), m = c.soMedidas(A.g.T, c.soSel(), c.soSelProm());
  assert.strictEqual(m.ac, 98); cerca(m.prom, (32 + 32) / 2);
  assert.ok(c.document.els.soPromValor.innerHTML.indexOf('>32<') > -1, c.document.els.soPromValor.innerHTML);
  const P = c.soFilasDim('pdv', c.soSel()), p1 = P.filas.filter(f => f.nombre === 'PDV 1')[0];
  cerca(p1.prom, (12 + 7) / 2);                                  // columna Promedio Selec de Puntos de Venta
  c.soAlternarProm(1); c.soAlternarProm(3); cerca(c.soMedidas(A.g.T, c.soSel(), c.soSelProm()).prom, 98 / 3);
});
t('Mes y Trimestre recortan los meses elegidos; PY = los mismos meses del año anterior', () => {
  const c = nuevo(); c.soE.meses = [2];
  const m = tot(c); assert.strictEqual(m.ac, 34); assert.strictEqual(m.py, 35);
  c.soE.meses = []; c.soE.trim = [2]; assert.strictEqual(c.soSel().length, 0);
});
t('filtro de canal (atributo del PDV) usa PDV × mes; Total PDV respeta el filtro', () => {
  const c = nuevo(); c.soSetFiltro('canal', ['DIGITAL']);
  const m = tot(c); assert.strictEqual(m.ac, 45); assert.strictEqual(m.py, 60);
  const P = c.soAgregar('pdv'); assert.deepStrictEqual(plano(Object.keys(P.g)), ['2']);
});
t('BU + canal usa PDV × BU (pb) y la tabla de EAN con canal usa el detalle PDV × producto', () => {
  const c = nuevo(); c.soSetFiltro('canal', ['TIENDA']); c.soSetFiltro('bu', ['FOTO']);
  let A = c.soAgregar('tot'); if (!A) A = c.soAgregar('tot');
  assert.strictEqual(c.soMedidas(A.g.T, c.soSel()).ac, 33);
  c.soSetFiltro('bu', []);
  let M = c.soFilasDim('sku', c.soSel()); if (!M) M = c.soFilasDim('sku', c.soSel());
  const por = {}; M.filas.forEach(f => { por[f.nombre] = f.ac; });
  assert.deepStrictEqual(por, { 'PROD A': 33, 'PROD B': 20 });
});
t('clic en una fila filtra y la tabla de su dimensión la resalta (no desaparecen las demás)', () => {
  const c = nuevo(); c.soAlternar('cli', 1);
  assert.strictEqual(tot(c).ac, 45);
  const M = c.soFilasDim('cli', c.soSel());
  assert.strictEqual(M.filas.length, 2);
  assert.strictEqual(M.filas.filter(f => f.sel).length, 1);
  assert.strictEqual(M.tot.ac, 45);                                          // el total es el de lo elegido
  c.soAlternar('cli', 1); assert.strictEqual(tot(c).ac, 98);
});
t('las 4 vistas y lo de abajo se pintan sin NaN; el PDV abierto muestra sus EAN', () => {
  const c = nuevo();
  ['mensual', 'ean', 'cli', 'pdv'].forEach(v => {
    c.soSetVista(v); c.soRender();
    const h = c.document.els.soVisual.innerHTML;
    assert.ok(h.length > 50 && !/NaN|undefined|Infinity/.test(h), v + ': ' + h.slice(0, 160));
  });
  c.soAbrir(0); c.soPintarVisual();
  assert.ok(/so-hijo/.test(c.document.els.soVisual.innerHTML));
  ['soDonutCanal', 'soDonutBu', 'soTablaBu'].forEach(id => assert.ok(!/NaN|undefined/.test(c.document.els[id].innerHTML), id));
  assert.ok(/DIGITAL/.test(c.document.els.soDonutCanal.innerHTML));
});
t('inventario (Consolidado inventarios): siempre la foto del último mes con dato del año, por EAN y cliente; no aplica con filtros de PDV', () => {
  const c = nuevo();
  // s3_inv.json de prueba: hay foto en ene y feb de 2026 (no en mar); un cliente que el sell-out no conoce no entra.
  c.invD = c.invPreparar({ meses: ['2026-01', '2026-02'], clientes: [['11026707', 'CRUZ VERDE'], ['11026712', 'MEDIPIEL'], ['999', 'OTRO']],
    skus: [['E1', 'PROD A', 'FOTO'], ['E2', 'PROD B', 'DERMA']],
    inv: [[0, 0, 0, 50, 500], [0, 0, 1, 40, 400], [0, 1, 1, 8, 80], [1, 0, 1, 30, 300], [2, 0, 1, 99, 990]] });
  const sel = c.soSel(), ref = c.soInvRef(sel);
  assert.strictEqual(c.soD.meses[ref], '2026-02');                           // último mes con foto del año
  assert.strictEqual(JSON.stringify(c.soInvPor('sku', ref)), '{"0":70,"1":8}');
  assert.strictEqual(JSON.stringify(c.soInvPor('cli', ref)), '{"0":48,"1":30}');
  c.soE.meses = [1]; assert.strictEqual(c.soInvPor('tot', c.soInvRef(c.soSel())).T, 78);   // con enero elegido sigue siendo la de febrero
  c.soE.meses = []; c.soRender();
  assert.ok(/>78<\/div><div class="e">Inventario/.test(c.document.els.soKpis.innerHTML), c.document.els.soKpis.innerHTML);
  c.soSetVista('ean'); c.soRender();
  const h = c.document.els.soVisual.innerHTML;
  assert.ok(/Inv\. Feb/.test(h) && /class="num inv">70</.test(h), h.slice(0, 300));
  c.soAlternar('cli', 1);                                                    // el filtro de cliente recorta el inventario
  assert.strictEqual(JSON.stringify(c.soInvPor('sku', ref)), '{"0":30}');
  c.soAlternar('cli', 1); c.soSetFiltro('canal', ['DIGITAL']);
  assert.strictEqual(c.soInvEstado(c.soSel()).est, 'pdv');
});
t('inventario por punto de venta (Consolidado inventarios): columna de Puntos de Venta y tarjeta con filtros de PDV', () => {
  const c = nuevo();
  // s3_inv_pdv.json de prueba: foto de feb 2026; SF1 = PDV 1, SF3 = PDV 3; un PDV que el cubo no conoce no entra.
  c.invPdvD = { meses: ['2026-02'], pdv: ['SF1', 'SF3', 'OTRO'], inv: [[0, 0, 11, 110], [1, 0, 22, 220], [2, 0, 99, 990]] };
  const ref = c.soInvRef(c.soSel(), c.soInvPdvFilas());
  assert.strictEqual(c.soD.meses[ref], '2026-02');
  assert.strictEqual(JSON.stringify(c.soInvPorPdv(ref, 'pdv')), '{"0":11,"2":22}');
  c.soSetVista('pdv'); c.soRender();
  const h = c.document.els.soVisual.innerHTML;
  assert.ok(/Inv\. Feb/.test(h) && /class="num inv">22</.test(h), h.slice(0, 300));
  c.soSetFiltro('canal', ['DIGITAL']); c.soRender();                   // solo PDV 3: la tarjeta usa el inventario por PDV
  assert.ok(/>22<\/div><div class="e">Inventario/.test(c.document.els.soKpis.innerHTML), c.document.els.soKpis.innerHTML);
  c.soSetFiltro('canal', []); c.soSetFiltro('bu', ['FOTO']);
  assert.strictEqual(c.soInvPdvEstado(c.soSel()).est, 'prod');          // el archivo por PDV no trae producto
});

t('CSV: cada visual de Sell Out PDV se descarga con lo que muestra', () => {
  const c = nuevo(); const bajadas = [];
  c.mtdDescargarCsv = (filas, cols, nombre) => bajadas.push({ filas: plano(filas), cols: cols.map(x => x.titulo), nombre });
  c.soSetVista('mensual'); c.soRender(); c.soCsv('visual');
  c.soSetVista('ean'); c.soRender(); c.soCsv('visual');
  c.soCsv('canal'); c.soCsv('bu'); c.soCsv('bu_donut');
  assert.strictEqual(bajadas.length, 5);
  assert.ok(/^sell_out_mensual_2026_/.test(bajadas[0].nombre));
  assert.strictEqual(bajadas[0].filas[0].ac, 32); assert.strictEqual(bajadas[0].filas[0].py, 35);   // ene 2026 vs 2025
  assert.ok(bajadas[1].cols.indexOf('Inventario último mes (und)') > -1);
  assert.strictEqual(bajadas[1].filas.reduce((a, f) => a + f.ac, 0), 98);
  assert.strictEqual(bajadas[2].filas.reduce((a, f) => a + f.valor, 0), 98);
  assert.strictEqual(bajadas[3].filas.length, 2); assert.strictEqual(bajadas[4].filas.length, 2);
});

console.log('\n' + ok + ' pruebas OK' + (process.exitCode ? ' · HAY FALLAS' : ''));
