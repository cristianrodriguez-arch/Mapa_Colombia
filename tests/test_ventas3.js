/* Pruebas de la pestaña "Ventas 3.0" (JsVentas3.html) y de sus endpoints en Code.js, sin navegador.
 *   node tests/test_ventas3.js
 * El ETL que produce los s3_*.json se prueba aparte: python tests/test_etl_s3.py
 */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const dir = path.join(__dirname, '..', 'Apps Script');

function crearDom() {
  const els = {};
  const get = id => els[id] || (els[id] = { id, innerHTML: '', innerText: '', value: '', style: {}, hidden: false,
    classList: { toggle() {}, remove() {}, add() {}, contains: () => false }, children: [], dataset: {}, setAttribute() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800 }) });
  return { getElementById: get, querySelectorAll: () => [], els };
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
  vm.runInContext(leer('JsVentas3.html'), ctx);
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

function nuevo() { const c = cargar(); c.vt3Recibir(plano(CUBO)); return c; }
function filas(c) { const M = c.vt3Modelo(); return M ? M.filas : null; }
function porNombre(l) { const o = {}; l.forEach(x => { o[x.nombre] = x; }); return o; }

console.log('Ventas 3.0 · medidas (definiciones del Power BI)');
const c = nuevo();
t('por defecto: meses del último año (ene–mar 2026), unidades, dimensión Cliente', () => {
  assert.deepStrictEqual(plano(c.vt3E.sel), [3, 4, 5]);
  assert.strictEqual(c.vt3E.unidad, '#'); assert.strictEqual(c.vt3E.dim, 'cli');
});
t('AC, PY, ΔPY, ΔPY% y var % vs mes pasado por cliente', () => {
  const f = porNombre(filas(c)), cv = f['DROGUERIAS CRUZ VERDE SAS'], mp = f['MEDIPIEL S.A.'];
  assert.strictEqual(cv.ac, 53); assert.strictEqual(cv.py, 45); assert.strictEqual(cv.dpy, 8);
  cerca(cv.dpyp, 53 / 45 - 1); cerca(cv.vmp, 17 / 19 - 1);           // mar (7+10) vs feb (14+5)
  assert.strictEqual(mp.ac, 45); assert.strictEqual(mp.py, 60); cerca(mp.dpyp, -0.25); cerca(mp.vmp, 0);
});
t('KPI: resultado, promedio mensual, Total PDV y promedio por PDV', () => {
  const T = c.vt3Modelo().tot;
  assert.strictEqual(T.ac, 98); assert.strictEqual(T.py, 105);
  cerca(T.prom, 98 / 3); assert.strictEqual(T.nPdv, 3); cerca(T.promPdv, 98 / 3);
});
t('$ usa el importe; # las unidades', () => {
  const k = nuevo(); k.vt3SetUnidad('$');
  assert.strictEqual(porNombre(filas(k))['MEDIPIEL S.A.'].ac, 450);
});
t('selección rápida "Último": un solo mes y la var. vs mes pasado contra el anterior', () => {
  const k = nuevo(); k.vt3SelRapida('u1');
  assert.deepStrictEqual(plano(k.vt3E.sel), [5]);
  const cv = porNombre(filas(k))['DROGUERIAS CRUZ VERDE SAS'];
  assert.strictEqual(cv.ac, 17); assert.strictEqual(cv.py, 15);
});
t('sin año anterior en los datos: PY y ΔPY quedan vacíos (no en cero)', () => {
  const k = cargar(); const d = plano(CUBO);
  d.meses = ['2026-01', '2026-02', '2026-03']; d.cs = d.cs.filter(r => r[2] >= 3).map(r => [r[0], r[1], r[2] - 3, r[3], r[4]]);
  d.pm = d.pm.filter(r => r[1] >= 3).map(r => [r[0], r[1] - 3, r[2], r[3]]); d.demoPs = [];
  k.vt3Recibir(d);
  const cv = porNombre(filas(k))['DROGUERIAS CRUZ VERDE SAS'];
  assert.strictEqual(cv.py, null); assert.strictEqual(cv.dpy, null); assert.strictEqual(cv.dpyp, null);
});

console.log('Ventas 3.0 · dimensiones, filtros y fuentes');
t('Producto, BU y Punto de venta', () => {
  const k = nuevo();
  k.vt3SetDim('sku'); let f = porNombre(filas(k));
  assert.strictEqual(f['PROD A'].ac, 78); assert.strictEqual(f['PROD A'].py, 90); assert.strictEqual(f['PROD B'].ac, 20);
  k.vt3SetDim('bu'); f = porNombre(filas(k));
  assert.strictEqual(f.FOTO.ac, 78); assert.strictEqual(f.DERMA.py, 15);
  k.vt3SetDim('pdv'); f = porNombre(filas(k));
  assert.strictEqual(f['PDV 1'].ac, 33); assert.strictEqual(f['PDV 3'].py, 60);
  assert.strictEqual(k.vt3Fuente().tipo, 'pm');
});
t('clic en un cliente: filtra por él y baja a sus productos', () => {
  const k = nuevo(); filas(k); k.vt3PintarCuerpo();
  const i = k.vt3Filas.findIndex(x => x.nombre === 'DROGUERIAS CRUZ VERDE SAS');
  k.vt3Drill(i);
  assert.strictEqual(k.vt3E.dim, 'sku'); assert.deepStrictEqual(plano(k.vt3E.f.cli), [0]);
  const f = porNombre(filas(k));
  assert.strictEqual(f['PROD A'].ac, 33); assert.strictEqual(f['PROD B'].ac, 20);
  assert.strictEqual(k.vt3Fuente().tipo, 'cs');
});
t('filtro de PDV → usa el detalle PDV × producto de ESE PDV', () => {
  const k = nuevo(); k.vt3E.f.pdv = [0]; k.vt3SetDim('sku');
  assert.deepStrictEqual(plano(k.vt3Fuente()), { tipo: 'ps', req: { pdv: [0] } });
  filas(k);   // primera vez pide el detalle
  const f = porNombre(filas(k));
  assert.deepStrictEqual(Object.keys(f), ['PROD A']); assert.strictEqual(f['PROD A'].ac, 33);
  assert.strictEqual(k.vt3Modelo().tot.nPdv, 1);
});
t('Punto de venta filtrado por producto → detalle de ESE producto', () => {
  const k = nuevo(); k.vt3E.f.sku = [1]; k.vt3SetDim('pdv');
  assert.deepStrictEqual(plano(k.vt3Fuente()), { tipo: 'ps', req: { sku: [1] } });
  filas(k); const f = porNombre(filas(k));
  assert.deepStrictEqual(Object.keys(f), ['PDV 2']); assert.strictEqual(f['PDV 2'].ac, 20);
});
t('Punto de venta filtrado por BU → archivo PDV × mes de ese BU', () => {
  const k = nuevo(); k.vt3E.f.bu = ['FOTO']; k.vt3SetDim('pdv');
  assert.strictEqual(k.vt3Fuente().tipo, 'pb');
  filas(k); const f = porNombre(filas(k));
  assert.deepStrictEqual(Object.keys(f).sort(), ['PDV 1', 'PDV 3']); assert.strictEqual(f['PDV 3'].ac, 45);
  assert.strictEqual(k.vt3Modelo().tot.nPdv, 2);
});
t('filtro de KAM', () => {
  const k = nuevo(); k.vt3SetKam('SARA CARDONA');
  assert.deepStrictEqual(plano(filas(k).map(x => x.nombre)), ['MEDIPIEL S.A.']);
  assert.strictEqual(k.vt3Modelo().tot.nPdv, 1);
});
t('render: gráfico y tabla sin errores; títulos y rótulos', () => {
  const k = nuevo(); k.vt3Render();
  const h = k.document.els.vt3Contenido.innerHTML;
  assert.ok(/vt3-chart/.test(h) && /ΔPY%/.test(h) && /Var % vs mes pasado/.test(h));
  assert.ok(/Crecimiento por cliente/.test(k.document.els.vt3Titulo.innerText));
  k.vt3SetDim('bu'); assert.ok(/por BU/.test(k.document.els.vt3Titulo.innerText));
  k.vt3SetVista('tabla'); assert.ok(/vt3Tabla/.test(k.document.els.vt3Contenido.innerHTML));
  assert.ok(!/proyecci|esperado|estimad/i.test(k.document.els.vt3Cuerpo.innerHTML));
});
t('formato corto con coma decimal y sin "−0 %"', () => {
  const k = nuevo(); k.vt3SetUnidad('$');
  assert.strictEqual(k.vt3Num(47448000000), '$47,4 MM'); assert.strictEqual(k.vt3Num(740200000), '$740 M');
  k.vt3SetUnidad('#'); assert.strictEqual(k.vt3Num(1765276), '1,8 M');
  assert.strictEqual(k.vt3Pct(-0.001), '0%'); assert.strictEqual(k.vt3Pct(0.1778), '+18%');
});

/* ---- Servidor: detalle por fragmentos ---- */
console.log('Servidor · Ventas 3.0');
function servidor(archivos) {
  const ctx = { console, Date, Math, JSON, String, Number, Object, Array, isNaN, parseFloat, parseInt, RegExp, Error, Logger: { log() {} } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, 'Code.js'), 'utf8'), ctx);
  ctx.__leidos = [];
  ctx.leerArchivoDrive_ = n => { ctx.__leidos.push(n); if (!(n in archivos)) throw new Error('no existe ' + n); return JSON.stringify(archivos[n]); };
  return ctx;
}
t('detalle por PDV: solo los fragmentos de esos PDV, filas [iPdv, iSku, iMes, und, imp]', () => {
  const s = servidor({ 's3_pdv_01.json': { generado: 'G1', filas: { 33: [[2, 5, 4, 40]], 1: [[0, 3, 1, 10]] } },
                       's3_pdv_02.json': { generado: 'G1', filas: { 2: [[1, 0, 7, 70]] } } });
  const r = JSON.parse(s.getVentas3DetalleJson(JSON.stringify({ pdv: [33], npdv: 32, nsku: 16, generado: 'G1' })));
  assert.deepStrictEqual(r.ps, [[33, 2, 5, 4, 40]]); assert.deepStrictEqual(plano(s.__leidos), ['s3_pdv_01.json']);
});
t('detalle por producto: filas reordenadas a [iPdv, iSku, …]', () => {
  const s = servidor({ 's3_sku_03.json': { generado: 'G1', filas: { 3: [[7, 0, 2, 20]] } } });
  const r = JSON.parse(s.getVentas3DetalleJson(JSON.stringify({ sku: [3], npdv: 32, nsku: 16, generado: 'G1' })));
  assert.deepStrictEqual(r.ps, [[7, 3, 0, 2, 20]]);
});
t('si el ETL corrió de nuevo (otro "generado"), avisa en vez de mezclar índices', () => {
  const s = servidor({ 's3_pdv_00.json': { generado: 'G2', filas: { 0: [[0, 0, 1, 1]] } } });
  const r = JSON.parse(s.getVentas3DetalleJson(JSON.stringify({ pdv: [0], npdv: 32, nsku: 16, generado: 'G1' })));
  assert.ok(r.error && /ETL/.test(r.error));
});
t('PDV × BU: un archivo por BU', () => {
  const s = servidor({ 's3_pb_01.json': { generado: 'G1', bu: 'FOTO', pb: [[0, 3, 12, 120]] } });
  assert.strictEqual(JSON.parse(s.getVentas3PbJson(1)).bu, 'FOTO');
});

console.log('\n' + ok + ' pruebas OK');
