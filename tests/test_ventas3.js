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

/* Las pruebas del sell-out fijan su fuente y "Año" (la pestaña abre en sell-in y "Último"). */
function enSellOut(c) { c.vt3E.src = 'so'; c.vt3E.unidad = '#'; c.vt3E.rap = 'anio'; return c; }
function nuevo() { const c = enSellOut(cargar()); c.vt3Recibir(plano(CUBO), 'so'); return c; }
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
  const k = enSellOut(cargar()); const d = plano(CUBO);
  d.meses = ['2026-01', '2026-02', '2026-03']; d.cs = d.cs.filter(r => r[2] >= 3).map(r => [r[0], r[1], r[2] - 3, r[3], r[4]]);
  d.pm = d.pm.filter(r => r[1] >= 3).map(r => [r[0], r[1] - 3, r[2], r[3]]); d.demoPs = [];
  k.vt3Recibir(d, 'so');
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
t('clic en filas: se acumulan como filtro SIN cambiar de vista; otro clic la quita', () => {
  const k = nuevo(); k.vt3PintarCuerpo();
  const idx = n => k.vt3Filas.findIndex(x => x.nombre === n);
  k.vt3Alternar(idx('DROGUERIAS CRUZ VERDE SAS'));
  assert.strictEqual(k.vt3E.dim, 'cli'); assert.deepStrictEqual(plano(k.vt3E.f.cli), [0]);
  let M = k.vt3Modelo(), f = porNombre(M.filas);
  assert.strictEqual(M.filas.length, 2);                      // la vista no se encoge: Medipiel sigue, atenuada
  assert.strictEqual(f['DROGUERIAS CRUZ VERDE SAS'].sel, true); assert.strictEqual(f['MEDIPIEL S.A.'].atenuada, true);
  assert.strictEqual(M.tot.ac, 53); assert.strictEqual(M.tot.nPdv, 2);   // TOTAL y tarjetas: solo lo elegido
  k.vt3Alternar(idx('MEDIPIEL S.A.')); assert.deepStrictEqual(plano(k.vt3E.f.cli).sort(), [0, 1]);
  assert.strictEqual(k.vt3Modelo().tot.ac, 98);
  k.vt3Alternar(idx('DROGUERIAS CRUZ VERDE SAS')); assert.deepStrictEqual(plano(k.vt3E.f.cli), [1]);
  k.vt3SetDim('sku'); f = porNombre(filas(k));                 // el detalle: cambiando de vista
  assert.deepStrictEqual(Object.keys(f), ['PROD A']); assert.strictEqual(f['PROD A'].ac, 45);
  assert.strictEqual(k.vt3Fuente().tipo, 'cs');
});
t('vista Punto de venta con PDV elegidos: todos los PDV a la vista, los elegidos resaltados', () => {
  const k = nuevo(); k.vt3SetDim('pdv'); k.vt3PintarCuerpo();
  k.vt3Alternar(k.vt3Filas.findIndex(x => x.nombre === 'PDV 3'));
  assert.strictEqual(k.vt3Fuente().tipo, 'pm');
  const M = k.vt3Modelo(); assert.strictEqual(M.filas.length, 3); assert.strictEqual(M.tot.ac, 45);
  k.vt3Render(); assert.ok(/vt3-fila sel/.test(k.document.els.vt3Contenido.innerHTML) && /atenuada/.test(k.document.els.vt3Contenido.innerHTML));
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
  const cache = new Map();
  const ctx = { console, Date, Math, JSON, String, Number, Object, Array, isNaN, parseFloat, parseInt, RegExp, Error, Logger: { log() {} },
    CacheService: { getScriptCache: () => ({ get: k => (cache.has(k) ? cache.get(k) : null), remove: k => cache.delete(k),
      removeAll: ks => ks.forEach(k => cache.delete(k)) }) } };
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

/* ---- Sell-in + plan (piloto): mismo cubo, otra fuente ----
 * Meses propios (empiezan en dic-2024 y llegan a abr-2026: el sell-in va un mes adelante).
 * Cruz Verde · PROD A (EAN E1 y E1b): 2025 ene–mar 80 c/u · 2026 ene–abr 100 c/u · plan 80 c/u  → 400 / 320
 * Medipiel   · PROD B (EAN E2):       2025 ene–mar 60 c/u · 2026 ene–abr  50 c/u · plan 50,50,50,100 → 200 / 250
 * Farmatodo: plan 30 c/u en 2026 y NINGUNA venta → 0 / 120      (unidades = importe ÷ 10) */
const SI_MESES = ['2024-12', '2025-01', '2025-02', '2025-03', '2026-01', '2026-02', '2026-03', '2026-04'];
const SI_CS = [], SI_PL = [];
[1, 2, 3].forEach(m => { SI_CS.push([0, 0, m, 8, 80]); SI_CS.push([1, 1, m, 6, 60]); });
[4, 5, 6, 7].forEach((m, j) => { SI_CS.push([0, 0, m, 10, 100]); SI_CS.push([1, 1, m, 5, 50]);
  SI_PL.push([0, m, 80]); SI_PL.push([1, m, j === 3 ? 100 : 50]); SI_PL.push([2, m, 30]); });
const SI = { v: 1, fuente: 'si', generado: '2026-10-10T12:00:00', meses: SI_MESES,
  clientes: [['11026707', 'DROGUERIAS CRUZ VERDE SAS', 'ANGELICA MONSALVE'], ['11026712', 'MEDIPIEL S.A.', 'SARA CARDONA'],
             ['11049529', 'FARMATODO COLOMBIA S.A.', 'ANGELICA MONSALVE']],
  skus: [['1226', 'PROD A', 'Foto', '', ['E1', 'E1b']], ['77', 'PROD B', 'Derma', '', ['E2']]],
  cs: SI_CS, pl: SI_PL, bus: ['DERMA', 'FOTO'], pdv: [], pm: [], meta: { errores: {} } };
function conSi() { const k = nuevo(); k.vt3Recibir(plano(SI), 'si'); k.vt3SetFuente('si'); return k; }

console.log('Ventas 3.0 · sell-in y plan');
t('el último mes sale de los datos de CADA fuente: "Año" = ene–abr 2026 en sell-in, en $', () => {
  const k = conSi();
  assert.strictEqual(k.vt3E.src, 'si'); assert.deepStrictEqual(plano(k.vt3E.sel), [4, 5, 6, 7]);
  assert.strictEqual(k.vt3E.unidad, '$');
  k.vt3SelRapida('u1'); assert.deepStrictEqual(plano(k.vt3E.sel), [7]);
  k.vt3SetFuente('so'); assert.deepStrictEqual(plano(k.vt3E.sel), [5]);   // "Último" del sell-out = mar 2026
  assert.strictEqual(k.vt3E.unidad, '#');                                // cada fuente recuerda su unidad
});
t('Plan y % Cumpl. por cliente; el cliente con plan y sin venta aparece con 0 %', () => {
  const k = conSi(), M = k.vt3Modelo(), f = porNombre(M.filas);
  assert.strictEqual(M.plCols, true);
  const cv = f['DROGUERIAS CRUZ VERDE SAS'], mp = f['MEDIPIEL S.A.'], fa = f['FARMATODO COLOMBIA S.A.'];
  assert.strictEqual(cv.ac, 400); assert.strictEqual(cv.py, 240); assert.strictEqual(cv.pl, 320); cerca(cv.cump, 1.25);
  assert.strictEqual(mp.ac, 200); assert.strictEqual(mp.pl, 250); cerca(mp.cump, 0.8);
  assert.strictEqual(fa.ac, 0); assert.strictEqual(fa.pl, 120); assert.strictEqual(fa.cump, 0);
  assert.strictEqual(M.tot.ac, 600); assert.strictEqual(M.tot.pl, 690); cerca(M.tot.cump, 600 / 690);
  assert.strictEqual(M.tot.nPdv, null);   // el sell-in no trae punto de venta
});
t('plan solo de los meses elegidos y con el filtro de KAM', () => {
  const k = conSi(); k.vt3SelRapida('u1'); k.vt3SetKam('SARA CARDONA');
  const M = k.vt3Modelo(); assert.strictEqual(M.filas.length, 1);
  assert.strictEqual(M.filas[0].pl, 100); assert.strictEqual(M.tot.pl, 100); cerca(M.tot.cump, 0.5);
});
t('plan n/d en #, con filtro de BU o producto y en meses sin plan; por BU no hay columnas', () => {
  const k = conSi();
  k.vt3SetUnidad('#'); assert.ok(/solo existe en \$/.test(k.vt3SinPlan())); assert.strictEqual(k.vt3Modelo().plCols, false);
  k.vt3SetUnidad('$'); k.vt3E.f.bu = ['FOTO']; assert.ok(/por cliente/.test(k.vt3SinPlan()));
  assert.strictEqual(k.vt3Modelo().tot.pl, undefined);
  k.vt3E.f.bu = []; k.vt3SetDim('bu'); assert.strictEqual(k.vt3Modelo().plCols, false);
  assert.strictEqual(k.vt3Modelo().tot.pl, 690);   // el total sí: todos los clientes
  k.vt3E.sel = [1, 2, 3]; assert.ok(/estos meses/.test(k.vt3SinPlan()));
});
t('al cambiar de fuente: cliente por SAP ID, producto por EAN, meses a mano por nombre', () => {
  const k = nuevo();
  k.vt3E.f.cli = [1]; k.vt3E.f.sku = [0];        // sell-out: Medipiel y el producto de EAN E1
  k.vt3AlternarMes(3);                           // a mano: feb–mar 2026 (índices 4 y 5 del sell-out)
  k.vt3Recibir(plano(SI), 'si'); k.vt3SetFuente('si');
  assert.deepStrictEqual(plano(k.vt3E.f.cli), [1]); assert.deepStrictEqual(plano(k.vt3E.f.sku), [0]);
  assert.deepStrictEqual(plano(k.vt3E.sel), [5, 6]);   // los mismos meses en el sell-in
  k.vt3SetFuente('so'); assert.deepStrictEqual(plano(k.vt3E.sel), [4, 5]); assert.deepStrictEqual(plano(k.vt3E.f.sku), [0]);
});
t('sell-in sin Punto de venta: la dimensión PDV no se puede elegir; el clic en un producto filtra sin moverse', () => {
  const k = nuevo(); k.vt3SetDim('pdv'); k.vt3Recibir(plano(SI), 'si'); k.vt3SetFuente('si');
  assert.strictEqual(k.vt3E.dim, 'cli');
  k.vt3SetDim('pdv'); assert.strictEqual(k.vt3E.dim, 'cli');
  k.vt3SetDim('sku'); k.vt3PintarCuerpo(); k.vt3Alternar(0);
  assert.strictEqual(k.vt3E.dim, 'sku'); assert.strictEqual(k.vt3E.f.sku.length, 1); assert.strictEqual(k.vt3Fuente().tipo, 'cs');
});
t('al abrir: Sell-in primero en el switch, sell-in activo y "Último" mes', () => {
  const k = cargar();
  assert.strictEqual(k.VT3_FUENTES[0][0], 'si'); assert.strictEqual(k.vt3E.src, 'si'); assert.strictEqual(k.vt3E.rap, 'u1');
  k.vt3Recibir(plano(SI), 'si');
  assert.deepStrictEqual(plano(k.vt3E.sel), [7]); assert.strictEqual(k.vt3E.unidad, '$');
  k.vt3Render(); assert.ok(/Sell-in<\/button>.*Sell-out<\/button>/.test(k.document.els.vt3FuenteSw.innerHTML));
});
t('clic en clientes con plan: Plan y % Cumpl. del TOTAL solo de los elegidos', () => {
  const k = conSi(); k.vt3PintarCuerpo();
  k.vt3Alternar(k.vt3Filas.findIndex(x => x.nombre === 'MEDIPIEL S.A.'));
  const M = k.vt3Modelo(); assert.strictEqual(M.filas.length, 3);
  assert.strictEqual(M.tot.ac, 200); assert.strictEqual(M.tot.pl, 250); cerca(M.tot.cump, 0.8);
});
t('render del sell-in: switch, tarjetas de plan, columnas Plan y % Cumpl., datos hasta abr 2026', () => {
  const k = conSi(); k.vt3Render();
  const els = k.document.els;
  assert.ok(/Sell-in/.test(els.vt3FuenteSw.innerHTML) && /activo/.test(els.vt3FuenteSw.innerHTML));
  assert.ok(/Plan \(\$\)/.test(els.vt3Kpis.innerHTML) && /% Cumplimiento/.test(els.vt3Kpis.innerHTML));
  assert.ok(/con-plan/.test(els.vt3Contenido.innerHTML) && /% Cumpl\./.test(els.vt3Contenido.innerHTML));
  assert.ok(/datos hasta/.test(els.vt3Sub.innerText) && /2026/.test(els.vt3Sub.innerText) && /SI_Appscript/.test(els.vt3Sub.innerText));
  k.vt3SetVista('tabla'); assert.ok(/% Cumpl\./.test(els.vt3Contenido.innerHTML) || /vt3Tabla/.test(els.vt3Contenido.innerHTML));
  assert.ok(!/proyecci|esperado|estimad/i.test(els.vt3Cuerpo.innerHTML + els.vt3Kpis.innerHTML));
});
t('el sell-out sigue igual: sin columnas de plan y con Total PDV', () => {
  const k = nuevo(); k.vt3SetUnidad('$'); const M = k.vt3Modelo();
  assert.strictEqual(M.plCols, false); assert.strictEqual(M.tot.pl, undefined); assert.strictEqual(M.tot.nPdv, 3);
});

/* ---- Resumen del mes arriba (el de la pestaña Ventas), con sus datos de ejemplo ---- */
console.log('Ventas 3.0 · resumen del mes (el de la pestaña Ventas)');
function conVentas() {
  const k = cargar();
  const leer = f => fs.readFileSync(path.join(dir, f), 'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
  vm.runInContext(leer('JsSIvsSO.html'), k); vm.runInContext(leer('JsVentas.html'), k);
  ['sivsoAnioFil', 'sivsoCliente'].forEach(id => { k.document.getElementById(id).value = id === 'sivsoAnioFil' ? '2026' : ''; });
  k.document.getElementById('sivsoPromNInput').value = '3';
  k.onVentasMtdCargado(k.mtdDatosDemo()); k.onSIvsSOCargado(k.sivsoDatosDemo());
  k.mtdVistaActiva = 'ventas3';
  return k;
}
t('arriba va el mismo resumen de Ventas: venta del mes vs plan, Venta -1 y YTD; sus switches mandan a Ventas 3.0', () => {
  const k = conVentas(); k.vt3Recibir(plano(SI), 'si'); k.vt3Render();
  const h = k.document.els.vt3Resumen.innerHTML;
  assert.ok(/Venta del mes/.test(h) && /Venta YTD/.test(h) && /Todos los clientes/.test(h), 'resumen');
  assert.ok(/vt3ResSetModo\('so'\)/.test(h) && !/onclick="vtSetModo/.test(h), 'switches propios');
  const todos = k.vtTotales(k.vtModelo().todos, k.vtA1Fuera(k.vtModelo().todos, () => true)).real;
  assert.ok(new RegExp(k.mtdMoneda(todos).replace(/[$.]/g, '\\$&')).test(h), 'venta del mes de toda la cartera');
});
t('el resumen sigue el KAM y los clientes elegidos con clic en Ventas 3.0', () => {
  const k = conVentas(); k.vt3Recibir(plano(SI), 'si');
  const M = k.vtModelo(), kam = M.todos[0].kam;
  k.vt3SetKam(kam);
  assert.ok(new RegExp('Cartera de ' + k.vtCorto(kam)).test(k.document.els.vt3Resumen.innerHTML), 'cartera del KAM');
  k.vt3SetKam(''); k.vt3E.f.cli = [0]; k.vt3Render();   // Cruz Verde (11026707), también en el demo de Ventas
  const cv = M.todos.find(x => x.sap === '11026707');
  assert.ok(cv && new RegExp(k.mtdMoneda(cv.real).replace(/[$.]/g, '\\$&')).test(k.document.els.vt3Resumen.innerHTML), 'venta del cliente elegido');
  k.vt3ResSetModo('so'); assert.strictEqual(k.vtEstado.modo, 'so');
  assert.ok(/vs sell-out/.test(k.document.els.vt3Resumen.innerHTML));
  assert.ok(!/proyecci|esperado|estimad/i.test(k.document.els.vt3Resumen.innerHTML));
});
t('un solo selector de meses: el resumen no trae el suyo y su "vs sell-out" usa los meses del panel lateral', () => {
  const k = conVentas(); k.vt3Recibir(plano(SI), 'si'); k.vt3ResSetModo('so');
  const h = k.document.els.vt3Resumen.innerHTML;
  assert.ok(!/SetVent|Último mes|3 meses/.test(h), 'sin selector de meses en el resumen');
  const kMax = k.vtSO.kMax, ventana = () => k.vtModelo(k.vt3VentanaResumen()).w;
  let w = ventana(); assert.deepStrictEqual([w.k0, w.k1], [kMax, kMax]);            // "Último" (por defecto)
  k.vt3SelRapida('u3'); w = ventana(); assert.deepStrictEqual([w.k0, w.k1], [kMax - 2, kMax]);
  k.vt3SelRapida('anio'); w = ventana(); assert.strictEqual(w.k0, Math.floor(kMax / 12) * 12);
  k.vt3E.rap = null; k.vt3E.sel = [4, 5];                                               // a mano: ene–feb 2026
  w = ventana(); assert.deepStrictEqual([w.k0, w.k1], [2026 * 12, Math.min(2026 * 12 + 1, kMax)]);
});
t('la pestaña Ventas no se entera: su modelo y su selector de meses siguen igual', () => {
  const k = conVentas(); k.vtEstado.vent = 3; k.vtMod = null;
  const antes = k.vtModelo(); k.vt3Recibir(plano(SI), 'si'); k.vt3Render();
  assert.strictEqual(k.vtModelo(), antes); assert.strictEqual(k.vtEstado.vent, 3);
  k.vtEstado.modo = 'so';
  assert.ok(/onclick="vtSetVent\(1\)"/.test(k.vtHtmlSwitches(true)), 'en Ventas (vs sell-out) el selector de meses sigue');
});
t('el switch Sell-in | Sell-out va dentro del panel, junto a Cliente / BU / Producto', () => {
  const k = conSi(); k.vt3Render();
  assert.ok(/<div class="vt-switches"><div id="vt3FuenteSw"><\/div><div class="vt-switch" role="group" aria-label="Dimensión">/
    .test(k.document.els.vt3Cuerpo.innerHTML));
});

/* ---- Servidor: SI_Appscript + PPTO_Appscript ---- */
console.log('Servidor · sell-in y plan de Ventas 3.0');
function hoja(filas) {
  return { getLastColumn: () => Math.max(...filas.map(f => f.length)), getLastRow: () => filas.length,
    getRange: (r, c, nr, nc) => ({ getValues: () => filas.slice(r - 1, r - 1 + nr).map(f => {
      const o = []; for (let i = 0; i < nc; i++) o.push(f[c - 1 + i] === undefined ? '' : f[c - 1 + i]); return o; }) }) };
}
function servidorHojas(hojas) {
  const cache = new Map();
  const ctx = { console, Date, Math, JSON, String, Number, Object, Array, isNaN, parseFloat, parseInt, RegExp, Error, Logger: { log() {} },
    CacheService: { getScriptCache: () => ({ get: k => (cache.has(k) ? cache.get(k) : null),
      getAll: ks => { const o = {}; ks.forEach(k => { if (cache.has(k)) o[k] = cache.get(k); }); return o; },
      putAll: m => Object.keys(m).forEach(k => cache.set(k, m[k])), put: (k, v) => cache.set(k, v),
      remove: k => cache.delete(k), removeAll: ks => ks.forEach(k => cache.delete(k)) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    SpreadsheetApp: { openById: () => ({ getSpreadsheetTimeZone: () => 'America/Bogota',
      getSheetByName: n => (hojas[n] ? hoja(hojas[n]) : null), getSheets: () => Object.keys(hojas).map(n => ({ getName: () => n })) }) } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, 'Code.js'), 'utf8'), ctx);
  ctx.__cache = cache;
  return ctx;
}
const ENC_SI = ['Fecha', 'SAP ID', 'Product', 'Real (LOCAL)', 'Real #', 'Type', 'CLIENTE', 'KAM ENCARGADO', 'Channel', 'BU', 'EAN', 'Product ID', 'Brand'];
const HOJA_SI = [ENC_SI,
  ['1/09/2026', 11026707, 'FP GEL 50ML', 1000, 10, 'SI', 'DROGUERIAS CRUZ VERDE SAS', 'ANGELICA MONSALVE', 'Cadenas', 'Foto', 8429420303348, 1226, 'FOTOPROTECCION'],
  ['1/08/2026', 11026707, 'FP GEL 50ML', 500, 5, 'SI', 'DROGUERIAS CRUZ VERDE SAS', 'ANGELICA MONSALVE', 'Cadenas', 'Foto', 8429420999999, 1226, 'FOTOPROTECCION'],
  ['1/09/2026', 11026707, 'FP GEL 50ML', 300, 3, 'SI', 'DROGUERIAS CRUZ VERDE SAS', 'ANGELICA MONSALVE', 'Cadenas', 'Foto', 8429420303348, '', ''],
  ['1/09/2026', 41000123, 'ISDIN WOMAN', 200, 2, 'SI', 'ISDIN', 'ISDIN', '', 'Derma', 8429420111111, 555, 'WOMAN'],
  ['1/09/2026', 91031136, 'ISDINCEUTICS X', 100, 1, 'SI', 'ISDIN', 'ISDIN', '', 'Isdinceutics', 8429420222222, 556, ''],
  ['1/09/2026', 11026712, 'OTRA COSA', 999, 9, 'SO', 'MEDIPIEL S.A.', 'SARA CARDONA', '', 'Foto', 8429420303348, 1226, ''],
  ['1/09/2026', '', '', 0, 0, 'SI', '', '', '', '', '', '', ''],
  ['1/07/2025', 11026707, 'FP GEL 50ML', 400, 4, 'SI', 'DROGUERIAS CRUZ VERDE SAS', 'ANGELICA MONSALVE', 'Cadenas', 'Foto', 8429420303348, 1226, 'FOTOPROTECCION']];
const HOJA_PPTO = [['SAP ID', 'CLIENTE', 'KAM ENCARGADO', 'Fecha', 'Plan'],
  [11026707, 'DROGUERIAS CRUZ VERDE SAS', 'ANGELICA MONSALVE', '1/09/2026', 1200],
  [11026707, 'DROGUERIAS CRUZ VERDE SAS', 'ANGELICA MONSALVE', '1/10/2026', 1300],
  [11049529, 'FARMATODO COLOMBIA S.A.', 'ANGELICA MONSALVE', '1/09/2026', 700]];
t('meses = solo los que tienen sell-in; Type ≠ SI y filas sin cliente fuera; ventas internas en el SAP ID 1', () => {
  const d = servidorHojas({ SI_Appscript: HOJA_SI, PPTO_Appscript: HOJA_PPTO }).v3siConstruir_();
  assert.deepStrictEqual(plano(d.meses), ['2025-07', '2026-08', '2026-09']); assert.strictEqual(d.meta.ultimoMes, '2026-09');
  const ids = d.clientes.map(c => c[0]);
  assert.deepStrictEqual(plano(ids), ['11026707', '1', '11049529']);
  assert.strictEqual(d.clientes[1][1], 'ISDIN (ventas internas)');
  assert.strictEqual(d.meta.fuentes.sellIn.filas.otroTipo, 1); assert.strictEqual(d.meta.fuentes.sellIn.filas.sinCliente, 1);
  const internas = d.cs.filter(r => r[0] === 1).reduce((s, r) => s + r[4], 0); assert.strictEqual(internas, 300);
});
t('producto por Product ID: junta sus EAN y adopta la fila sin ID que trae el mismo EAN', () => {
  const d = servidorHojas({ SI_Appscript: HOJA_SI, PPTO_Appscript: HOJA_PPTO }).v3siConstruir_();
  const iP = d.skus.findIndex(s => s[0] === '1226');
  assert.deepStrictEqual(plano(d.skus[iP][4]).sort(), ['8429420303348', '8429420999999']);
  assert.strictEqual(d.skus[iP][2], 'Foto'); assert.strictEqual(d.skus[iP][3], 'FOTOPROTECCION');
  const sep = d.cs.find(r => r[0] === 0 && r[1] === iP && r[2] === 2);
  assert.deepStrictEqual(plano(sep), [0, iP, 2, 13, 1300]);
  assert.strictEqual(d.skus.length, 3);
});
t('plan: solo meses con sell-in; cliente con plan y sin venta entra al catálogo', () => {
  const d = servidorHojas({ SI_Appscript: HOJA_SI, PPTO_Appscript: HOJA_PPTO }).v3siConstruir_();
  assert.deepStrictEqual(plano(d.pl).sort(), [[0, 2, 1200], [2, 2, 700]]);
  assert.strictEqual(d.meta.fuentes.plan.filas.fueraDeMeses, 1); assert.strictEqual(d.meta.fuentes.plan.filas.nuevos, 1);
  assert.strictEqual(d.meta.fuentes.plan.total, 3200); assert.deepStrictEqual(plano(d.meta.errores), {});
});
t('plan con celdas en error o calculando: avisa y NO se cachea; sin la hoja de plan, el sell-in igual sale', () => {
  const ppto = HOJA_PPTO.map(r => r.slice()); ppto[3][4] = '#ERROR!';
  const s = servidorHojas({ SI_Appscript: HOJA_SI, PPTO_Appscript: ppto });
  const d = JSON.parse(s.getVentas3SiJson(false));
  assert.ok(/calculando/.test(d.meta.errores.plan)); assert.strictEqual(s.__cache.size, 0);
  const s2 = servidorHojas({ SI_Appscript: HOJA_SI });
  const d2 = JSON.parse(s2.getVentas3SiJson(false));
  assert.ok(d2.cs.length > 0 && d2.pl.length === 0 && /PPTO_Appscript/.test(d2.meta.errores.plan));
  const s3 = servidorHojas({ SI_Appscript: HOJA_SI, PPTO_Appscript: HOJA_PPTO });
  s3.getVentas3SiJson(false); assert.ok(s3.__cache.size > 0);   // todo bien: sí se cachea
});
t('sin la hoja SI_Appscript: error claro', () => {
  assert.throws(() => servidorHojas({ PPTO_Appscript: HOJA_PPTO }).v3siConstruir_(), /SI_Appscript/);
});

console.log('\n' + ok + ' pruebas OK');
