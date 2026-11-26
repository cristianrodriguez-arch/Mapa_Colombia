/* Pruebas de la subpestaña "Digital" de Ventas, sin Apps Script ni navegador.
 *   node tests/test_digital.js
 * Servidor: digConstruir_ (Code.js) con un libro falso (hojas MAESTRA y BUDGET YTG).
 * Cliente:  JsDigital.html (KPI, % SO DIG, subcanal, árbol Cliente › BU › EAN y Performance).
 */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const dir = path.join(__dirname, '..', 'Apps Script');
let ok = 0;
function t(n, fn) { try { fn(); ok++; console.log('  ✓ ' + n); } catch (e) { console.log('  ✗ ' + n + '\n    ' + e.message); process.exitCode = 1; } }
const plano = x => JSON.parse(JSON.stringify(x));
const cerca = (a, b, tol) => assert.ok(Math.abs(a - b) <= (tol || 1e-9), 'esperado ' + b + ', salió ' + a);

/* ---------- Servidor ---------- */
function hoja(filas) {
  return {
    getLastColumn: () => Math.max(...filas.map(f => f.length)),
    getLastRow: () => filas.length,
    getRange: (r, c, nr, nc) => ({ getValues: () => filas.slice(r - 1, r - 1 + nr).map(f => {
      const o = []; for (let i = 0; i < nc; i++) o.push(f[c - 1 + i] === undefined ? '' : f[c - 1 + i]); return o; }) })
  };
}
function servidor() {
  const ctx = { console, Date, Math, JSON, String, Number, Object, Array, isNaN, isFinite, parseFloat, parseInt, RegExp, Error,
    Logger: { log() {} }, Utilities: { formatDate: (d, z, f) => f === 'yyyy' ? String(d.getUTCFullYear()) : String(d.getUTCMonth() + 1) } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, 'Code.js'), 'utf8'), ctx);
  return ctx;
}
const ENC = ['Fecha', 'Sold To ID', 'Origin', 'Ean_isdin', 'Ean_description', 'BU', 'BRAND', 'Canal', 'Sub_Canal', 'Currency', 'Affiliate',
  'Units', 'Amount', 'Fecha (año)', 'Fecha (trimestre)', 'Fecha (índice de meses)', 'Fecha (mes)'];
function fila(fecha, sap, cli, ean, desc, bu, canal, sub, aff, und, imp) {
  const [d, m, a] = fecha.split('/');
  return [fecha, sap, cli, ean, desc, bu, 'MARCA ' + bu, canal, sub, 'COP', aff, und, imp, Number(a), 'Tri1', Number(m), 'x'];
}
const MAESTRA = [ENC,
  // 2025: Medipiel tienda 100 / web 20 · 2026: tienda 120 / web 30 / app 10 (mismo mes, marzo)
  fila('01/03/2025', 11026712, 'MEDIPIEL S.A.', 8429420070875, 'FOTO A', 'Foto', 'TIENDA', 'TIENDA', 'Colombia', 10, '100'),
  fila('01/03/2025', 11026712, 'MEDIPIEL S.A.', 8429420070875, 'FOTO A', 'Foto', 'DIGITAL', 'WEB', 'Colombia', 2, '20'),
  fila('01/03/2026', 11026712, 'MEDIPIEL S.A.', 8429420070875, 'FOTO A', 'Foto', 'TIENDA', 'TIENDA', 'Colombia', 12, '120'),
  fila('01/03/2026', 11026712, 'MEDIPIEL S.A.', 8429420070875, 'FOTO A', 'Foto', 'DIGITAL', 'WEB', 'Colombia', 3, '30'),
  fila('1/03/2026', 11026712, 'MEDIPIEL S.A.', '8.429.420.104.518', 'DERMA B', 'Derma', 'DIGITAL', 'APP', 'Colombia', 1, '10,5'),
  // Panamá: fuera con el Affiliate por defecto
  fila('01/03/2026', 111, 'ARROCHA', 8429420070875, 'FOTO A', 'Foto', 'TIENDA', 'TIENDA', 'Panama', 4, '400'),
  ['', '', '', '', '', '', '', '', '', '', '', '', '']];
const BUDGET = [['Fecha', 'Sold To ID', 'Origin', 'Amount'],
  ['01/04/2026', '11026712', 'MEDIPIEL S.A.', '50'], ['01/05/2026', '11026712', 'MEDIPIEL S.A.', '22.000'], ['', '', '', '']];
function libro(h) { return { getSpreadsheetTimeZone: () => 'America/Bogota', getSheetByName: n => h[n] || null,
  getSheets: () => Object.keys(h).map(n => ({ getName: () => n })) }; }

const S = servidor();
const CUBO = plano(S.digConstruir_(libro({ MAESTRA: hoja(MAESTRA), 'BUDGET YTG': hoja(BUDGET) })));

t('Servidor: cubo agregado con meses, canales, affiliates, EAN como texto y budget por cliente y mes', () => {
  assert.deepStrictEqual(CUBO.meses, ['2025-03', '2026-03']);
  assert.deepStrictEqual(CUBO.affiliates, ['Colombia', 'Panama']);
  assert.deepStrictEqual(CUBO.canales.map(c => c.join('|')).sort(), ['DIGITAL|APP', 'DIGITAL|WEB', 'TIENDA|TIENDA']);
  assert.deepStrictEqual(CUBO.skus.map(s => s[0]), ['8429420070875', '8429420104518'], 'EAN numérico o con puntos → dígitos');
  assert.strictEqual(CUBO.clientes[0][0], '11026712');
  const app = CUBO.f.find(r => CUBO.canales[r[3]][1] === 'APP');
  assert.strictEqual(app[6], 11, 'importe con coma decimal (10,5 → redondeo a pesos)');
  assert.deepStrictEqual(CUBO.b.sort(), [[0, '2026-04', 50], [0, '2026-05', 22000]], 'budget por cliente y mes (22.000 con punto de miles)');
  assert.strictEqual(CUBO.meta.filasLeidas, 6);
});
t('Servidor: sin la hoja BUDGET YTG el cubo sale igual y lo avisa', () => {
  const c = plano(S.digConstruir_(libro({ MAESTRA: hoja(MAESTRA) })));
  assert.strictEqual(c.b.length, 0);
  assert.ok(/BUDGET YTG/.test(c.meta.budget.error));
});
t('Servidor: falta una columna obligatoria = error con el nombre', () => {
  const sinCanal = MAESTRA.map(f => f.filter((x, i) => i !== 7));
  assert.throws(() => S.digConstruir_(libro({ MAESTRA: hoja(sinCanal) })), /canal/);
});

/* ---------- Cliente ---------- */
function cliente() {
  const els = {};
  const get = id => els[id] || (els[id] = { id, innerHTML: '', innerText: '', value: '', style: {}, hidden: false, dataset: {},
    classList: { toggle() {}, remove() {}, add() {} }, setAttribute() {} });
  const ctx = { document: { getElementById: get, querySelector: () => null, querySelectorAll: () => [] }, console, Intl, Math, JSON,
    Date, Number, String, Object, Array, isFinite, isNaN, parseInt, parseFloat, Float64Array,
    window: {}, localStorage: { getItem: () => null, setItem() {} }, setTimeout: f => f(), alert() {},
    FMT: new Intl.NumberFormat('es-CO'), esc: s => String(s == null ? '' : s), normTxt: s => String(s),
    esGas: () => false, me: e => String(e), cargarLib: () => {}, Selector: function () {},
    SIVSO_MESES: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
    mtdPintarChips() {}, mtdCsvFecha: () => 'x', mtdDescargarCsv() {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, 'JsDigital.html'), 'utf8').match(/<script>([\s\S]*)<\/script>/)[1], ctx);
  ctx.dgRecibir(JSON.parse(JSON.stringify(CUBO)));
  return ctx;
}

t('KPI: SO PDV = tienda, SO DIG = digital y % SO DIG = DIG ÷ (PDV + DIG); Panamá fuera por defecto', () => {
  const c = cliente();
  assert.strictEqual(c.dgE.anio, 2026);
  const sel = c.dgSel(), Sr = c.dgSerie(null);
  assert.strictEqual(c.dgSuma(Sr.t, sel), 120);
  assert.strictEqual(c.dgSuma(Sr.d, sel), 30 + 11);
  cerca(c.dgRatio(41, 161), 41 / 161);
  c.dgSetFiltro('aff', []);
  assert.strictEqual(c.dgSuma(c.dgSerie(null).t, sel), 120 + 400, 'sin Affiliate entra Panamá');
});
t('Sub canal: solo recorta la venta digital (la de tienda queda entera)', () => {
  const c = cliente();c.dgSetFiltro('sub', ['WEB']);
  const sel = c.dgSel(), Sr = c.dgSerie(null);
  assert.strictEqual(c.dgSuma(Sr.t, sel), 120);
  assert.strictEqual(c.dgSuma(Sr.d, sel), 30);
});
t('Unidades: con # las cifras salen de Units', () => {
  const c = cliente();c.dgSetUnidad('#');
  const Sr = c.dgSerie(null), sel = c.dgSel();
  assert.strictEqual(c.dgSuma(Sr.t, sel), 12);
  assert.strictEqual(c.dgSuma(Sr.d, sel), 4);
});
t('Comparación YTD: árbol Cliente › BU › EAN con YTD, YTD -1, ΔV-1 % y % SO DIG de cada año', () => {
  const c = cliente(), A = c.dgArbol(c.dgSel()), cli = A.N[0];
  assert.deepStrictEqual(plano(cli.v), [120, 41, 100, 20]);
  const m = c.dgMed(cli.v, 'MEDIPIEL', 0);
  cerca(m.var, 41 / 20 - 1); cerca(m.p, 41 / 161); cerca(m.ppy, 20 / 120);
  assert.deepStrictEqual(Object.keys(cli.h).sort(), ['Derma', 'Foto']);
  assert.deepStrictEqual(plano(cli.h.Foto.h[0].v), [120, 30, 100, 20]);
});
t('Performance: FY = SO DIG YTD (meses antes del budget) + Budget YTG; % Cumpl. = YTD ÷ FY', () => {
  const c = cliente(), P = c.dgPeriodoPerf();
  assert.strictEqual(P.Y, 2026); assert.strictEqual(P.m0, 4);
  c.dgPintarPerf();
  assert.strictEqual(c.dgCsvPerf.length, 1);
  const x = c.dgCsvPerf[0];
  assert.strictEqual(x.ytd, 41); assert.strictEqual(x.ytg, 22050); assert.strictEqual(x.fy, 41 + 22050);
  assert.strictEqual(x.py, 20); cerca(x.cumpl, 41 / 22091);
  c.dgSetFiltro('bu', ['Foto']); c.dgPintarPerf();
  assert.ok(/por cliente/.test(c.document.getElementById('dgPerf').innerHTML), 'con BU el budget no aplica y lo dice');
});
t('Render completo sin errores (demo) y fuera "Ventas Backup" del menú', () => {
  const c = cliente(); c.dgRecibir(c.dgDemo()); c.dgRender();
  assert.ok(c.document.getElementById('dgComp').innerHTML.indexOf('dg-comp') !== -1);
  const idx = fs.readFileSync(path.join(dir, 'Index.html'), 'utf8');
  assert.ok(idx.indexOf('Ventas Backup</span>') === -1 && idx.indexOf('btnVistaDigital') !== -1 && idx.indexOf("include('JsDigital')") !== -1);
});

console.log('\n' + ok + ' pruebas OK');
