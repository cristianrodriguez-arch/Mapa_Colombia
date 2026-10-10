/* Pruebas de la pestaña "Ventas" (JsVentas.html) y del DOH objetivo del servidor, sin navegador.
 *   node tests/test_ventas.js
 *
 * Regla del usuario (2026-10-10): SOLO DATOS REALES. Hay una prueba que falla si
 * reaparece una proyección, un "esperado a hoy" o un inventario estimado.
 */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const dir = path.join(__dirname, '..', 'Apps Script');

function crearDom() {
  const els = {};
  const get = id => els[id] || (els[id] = { id, innerHTML: '', innerText: '', value: '', style: {}, hidden: false,
    classList: { toggle() {}, remove() {}, add() {}, contains: () => false }, children: [], dataset: {}, setAttribute() {} });
  return { getElementById: get, querySelectorAll: () => [], els };
}
function cargar() {
  const document = crearDom();
  const ctx = {
    document, console, Intl, Math, JSON, Date, Number, String, Object, Array, isFinite, isNaN, parseInt, parseFloat,
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
  vm.runInContext(leer('JsVentas.html'), ctx);
  ['sivsoAnioFil', 'sivsoCliente'].forEach(id => { document.getElementById(id).value = id === 'sivsoAnioFil' ? '2026' : ''; });
  document.getElementById('sivsoPromNInput').value = '3';
  return ctx;
}
const plano = x => JSON.parse(JSON.stringify(x));
let ok = 0;
function t(n, fn) { try { fn(); ok++; console.log('  ✓ ' + n); } catch (e) { console.log('  ✗ ' + n + '\n    ' + e.message); process.exitCode = 1; } }
const cerca = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= (tol || 1e-6), (msg || '') + ' esperado ' + b + ', salió ' + a);

console.log('Ventas · calendario de Colombia');
const c0 = cargar();
t('festivos 2026 (Ley Emiliani + Pascua): los 18 exactos', () => {
  const f = Object.keys(c0.vtFestivosCO(2026)).sort();
  assert.deepStrictEqual(f, ['2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03', '2026-05-01',
    '2026-05-18', '2026-06-08', '2026-06-15', '2026-06-29', '2026-07-20', '2026-08-07', '2026-08-17', '2026-10-12',
    '2026-11-02', '2026-11-16', '2026-12-08', '2026-12-25']);
});
t('octubre 2026: 21 días hábiles (12-oct festivo); al 9-oct van 7', () => {
  assert.strictEqual(c0.vtHabilesMes(2026, 10, null), 21);
  assert.strictEqual(c0.vtHabilesMes(2026, 10, 9), 7);
});
t('Pascua: 2025 = 20-abr, 2027 = 28-mar', () => {
  const p = d => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  assert.strictEqual(p(c0.vtPascua(2025)), '2025-4-20'); assert.strictEqual(p(c0.vtPascua(2027)), '2027-3-28');
});

/* ---- Payloads de prueba (cifras reales de oct-2026 donde aplica) ---- */
const MTD = {
  v: 2,
  clientes: [
    { id: '11026707', sapId: '11026707', cliente: 'DROGUERIAS CRUZ VERDE SAS', kam: 'ANGELICA MONSALVE', canal: 'Cadenas',
      realMes: 680955516, planMes: 4608141753, realAnio: 34435041390, planAnio: 55070384205, interno: 0, error: 0 },
    { id: '11026712', sapId: '11026712', cliente: 'MEDIPIEL S.A.S.', kam: 'SARA CARDONA', canal: 'Tiendas de piel',
      realMes: 28784218, planMes: 3600000000, realAnio: 17711009856, planAnio: 29496073702, interno: 0, error: 0 },
    { id: '11099998', sapId: '11099998', cliente: 'NUEVO SAS', kam: 'SARA CARDONA', canal: 'Tiendas de piel',
      realMes: 30000000, planMes: 120000000, realAnio: 30000000, planAnio: 120000000, interno: 0, error: 0 },
    { id: '1', sapId: '1', cliente: 'ISDIN', kam: 'OTRO', canal: 'SIN CANAL', realMes: 29000000, planMes: 0,
      realAnio: 196187091, planAnio: 0, interno: 1, error: 0 }],
  productos: ['FP FUSION WATER MAGIC SPF50 50ML', 'FP FWATER MAGIC COLOR MEDIUM SPF50 50ML'],
  // PLANTILLA: [id, idxProducto, venta, A-1 A LA FECHA, unidades]
  prod: [['11026707', 0, 400000000, 300000000, 4000], ['11026707', 1, 280955516, 161586108, 3000],
         ['11026712', 0, 28784218, 8055426, 300], ['1', 0, 29000000, 1802379, 10]],
  // Histórico: el mismo mes del año pasado COMPLETO es lo rayado de la barra
  hist: [[2025, 10, '11026707', 4789834118, 4500000000], [2025, 10, '11026712', 2400000000, 2000000000],
         [2025, 9, '11026707', 4150026294, 4000000000], [2026, 9, '11026707', 4560494148, 4516433538],
         [2026, 10, '11026707', 680955516, 4608141753]],
  histClientes: {},
  meta: { periodo: { anio: 2026, mes: 10, fuente: 'test' }, libroActualizado: '2026-10-10T08:00:00',
    actualizadoEn: '2026-10-10T08:05:00', errores: {}, conciliacion: {}, clientesConError: [] }
};
// SI vs SO: sell-out hasta ago-2026, SI hasta sep-2026. [mes, iCli, iProd, si, siU, so, soU, inv, invU, tieneInv]
const SO = { v: 2,
  clientes: [['11026707', 'DROGUERIAS CRUZ VERDE SAS', 'ANGELICA MONSALVE', 'Cadenas'],
             ['11026712', 'MEDIPIEL S.A.S.', 'SARA CARDONA', 'Tiendas de piel'],
             ['111', 'COMPAÑIA ASTOR S.A.', 'PEREZ NATALIA', 'Cadenas']],
  productos: [['P1', 'FP FUSION WATER MAGIC SPF50 50ML', 'Foto', 'FP'], ['P2', 'FP FWATER MAGIC COLOR MEDIUM SPF50 50ML', 'Foto', 'FP']],
  filas: [], doh: { '11026707': 60, '111': 30 } };
const MESES = ['06', '07', '08'];
// Cruz Verde: SO 3.000 M/mes (P1 2.000 + P2 1.000); INV ago = 9.000 M (90 días), P2 sin inventario → quiebre de P2.
// Año anterior: SO 2.700 M/mes → su sell-out CRECE (+11,1 %).
for (const mm of MESES) {
  const ag = mm === '08';
  SO.filas.push(['2026-' + mm, 0, 0, 2000e6, 200, 2000e6, 180, ag ? 9000e6 : 0, ag ? 900 : 0, ag ? 1 : 0]);
  SO.filas.push(['2026-' + mm, 0, 1, 1000e6, 100, 1000e6, 90, 0, 0, ag ? 1 : 0]);
  SO.filas.push(['2025-' + mm, 0, 0, 1800e6, 0, 1800e6, 0, 0, 0, 0]);
  SO.filas.push(['2025-' + mm, 0, 1, 900e6, 0, 900e6, 0, 0, 0, 0]);
}
SO.filas.push(['2026-09', 0, 0, 2500e6, 250, 0, 0, 0, 0, 0]);       // SI de septiembre: fuera de la ventana (sin SO aún)
// Medipiel: SO 1.500 M/mes (año anterior 1.800 → CAE), INV ago = 1.200 M = 24 días (bajo un objetivo por defecto de 60)
for (const mm of MESES) {
  SO.filas.push(['2026-' + mm, 1, 0, 1500e6, 0, 1500e6, 0, mm === '08' ? 1200e6 : 0, 0, mm === '08' ? 1 : 0]);
  SO.filas.push(['2025-' + mm, 1, 0, 1600e6, 0, 1800e6, 0, 0, 0, 0]);
}
// Astor: solo reporta sell-out (no está en CUMPLIMIENTO), sin año anterior
for (const mm of MESES)
  SO.filas.push(['2026-' + mm, 2, 0, 300e6, 0, 300e6, 0, mm === '08' ? 100e6 : 0, 0, mm === '08' ? 1 : 0]);

function nuevo(mtd, so) { const k = cargar(); k.onVentasMtdCargado(plano(mtd || MTD)); k.onSIvsSOCargado(plano(so || SO)); return k; }
const c = nuevo();
const M = c.vtModelo();
const cli = id => M.todos.find(x => x.id === id);

console.log('Ventas · solo datos reales');
t('no existe ninguna proyección, "esperado a hoy" ni inventario estimado en el modelo', () => {
  ['proy', 'esperado', 'cumplProy', 'brecha', 'metodo'].forEach(k => {
    assert.strictEqual(cli('11026707')[k], undefined, 'cliente.' + k); assert.strictEqual(M.tot[k], undefined, 'total.' + k);
  });
  ['invEst', 'dohEst', 'espacio', 'soEst'].forEach(k => assert.strictEqual(cli('11026707').sal[k], undefined, 'sal.' + k));
});
t('ninguna vista (clientes, fichas, productos, ambos modos) muestra proyecciones ni estimaciones', () => {
  const k = nuevo(), malas = /proyecci|proyectad|esperado|estimad|cerraría|cabe /i;
  const revisar = (que) => { const h = k.document.els.vtCuerpo.innerHTML + (k.document.els.vtLista.innerHTML || '');
    const m = h.match(malas); assert.ok(!m, que + ': apareció "' + (m && m[0]) + '"'); };
  ['plan', 'so'].forEach(modo => {
    k.vtSetModo(modo);
    k.vtVer('clientes'); revisar('clientes ' + modo);
    k.vtAbrirClienteId('11026707'); revisar('ficha cliente ' + modo);
    k.vtVer('productos'); revisar('productos ' + modo);
    k.vtAbrirProducto(k.vtNormProd('FP FUSION WATER MAGIC SPF50 50ML')); revisar('ficha producto ' + modo);
  });
});

console.log('Ventas · modo "vs plan" (mes en curso)');
t('día de datos = día anterior a la modificación del libro → hábil 7 de 21, quedan 14', () => {
  assert.strictEqual(M.av.trans, 7); assert.strictEqual(M.av.tot, 21); assert.strictEqual(M.av.rest, 14);
  assert.strictEqual(M.av.cerrado, false); assert.strictEqual(M.av.fecha.getDate(), 9);
});
t('vs A-1 compara contra el año pasado A LA MISMA FECHA, sin prorratear', () => {
  cerca(cli('11026707').dA1, 680955516 / 461586108 - 1, 1e-9);
});
t('lo rayado = el mismo mes del año pasado completo (Histórico)', () => {
  assert.strictEqual(cli('11026707').a1Mes, 4789834118);
  const b = c.vtBarraDatos(cli('11026707'), 'plan');
  assert.strictEqual(b.pista, 4608141753); assert.strictEqual(b.rayado, 4789834118);
  assert.strictEqual(b.barra, 680955516); assert.strictEqual(b.raya, 461586108);
});
t('Δ y Δ% contra la Venta -1 (a la misma fecha), y rótulos "Venta -1" / "Venta YTD" (nada de "A-1")', () => {
  const x = cli('11026707');
  assert.strictEqual(x.dA1Abs, 680955516 - 461586108);
  assert.strictEqual(M.tot.dA1Abs, M.tot.real - M.tot.a1);
  const k = nuevo(); k.vtSetModo('plan'); k.vtVer('clientes');
  const h = k.document.els.vtCuerpo.innerHTML + k.document.els.vtLista.innerHTML;
  assert.ok(/Venta -1/.test(h) && /Venta YTD/.test(h) && /Δ%/.test(h));
  assert.ok(!/A-1/.test(h), 'quedó un "A-1" visible');
  assert.ok(!/había facturado el/.test(h), 'quedó la frase del % facturado el año pasado');
});
t('falta para el plan y Venta YTD (real ÷ plan del año, Δ% vs Venta -1 YTD)', () => {
  const x = cli('11026707');
  assert.strictEqual(x.falta, 4608141753 - 680955516);
  cerca(x.cumplAnio, 34435041390 / 55070384205, 1e-12);
  cerca(x.dA1Ytd, 34435041390 / (4150026294 + 461586108) - 1, 1e-12);
});

console.log('Ventas · modo "vs sell-out" e inventario reportado');
t('ventana de 3 meses = jun–ago (último mes con sell-out); el SI de septiembre queda fuera', () => {
  assert.strictEqual(M.w.k0, 2026 * 12 + 5); assert.strictEqual(M.w.k1, 2026 * 12 + 7);
  const x = cli('11026707');
  assert.strictEqual(x.si, 9000e6); assert.strictEqual(x.so, 9000e6); cerca(x.ratio, 1);
  cerca(x.dSO, 9000e6 / 8100e6 - 1, 1e-12);
});
t('ventana de 1 mes y unidades', () => {
  const k = nuevo(); k.vtSetVent(1); k.vtSetUnidad('#');
  const x = k.vtModelo().todos.find(z => z.id === '11026707');
  assert.strictEqual(x.si, 300); assert.strictEqual(x.so, 270);
});
t('días de inventario REPORTADOS: INV del último mes ÷ (SO promedio 3 meses ÷ 30)', () => {
  cerca(cli('11026707').sal.dohRep, 90, 1e-9);
  cerca(cli('11026712').sal.dohRep, 24, 1e-9);
  assert.strictEqual(cli('11026707').sal.kInv, 2026 * 12 + 7);
});
t('tendencia del sell-out: 3 meses reportados vs los mismos meses del año anterior', () => {
  assert.strictEqual(cli('11026707').eSO, 'crece'); assert.strictEqual(cli('11026712').eSO, 'cae');
  assert.strictEqual(cli('111').eSO, 'sinbase');
});
t('acción: Cruz Verde (sobreinventario, crece) → vigilar · Medipiel (bajo, cae) → revisar quiebre · Astor (bajo, sin base) → empujar', () => {
  assert.strictEqual(cli('11026707').acc, 'vigilar');
  assert.strictEqual(cli('11026712').acc, 'quiebre'); assert.strictEqual(cli('11026712').objDef, true);
  assert.strictEqual(cli('111').acc, 'empujar'); assert.strictEqual(cli('111').obj, 30);
  assert.strictEqual(cli('11099998').acc, 'sinso');
});
t('matriz de acciones', () => {
  assert.strictEqual(c.vtAccion('alto', 'cae'), 'activar'); assert.strictEqual(c.vtAccion('alto', 'crece'), 'vigilar');
  assert.strictEqual(c.vtAccion('sano', 'crece'), 'oportunidad'); assert.strictEqual(c.vtAccion('sano', 'cae'), 'ok');
  assert.strictEqual(c.vtAccion('bajo', 'crece'), 'empujar'); assert.strictEqual(c.vtAccion('bajo', 'cae'), 'quiebre');
  assert.strictEqual(c.vtAccion('sindatos', 'crece'), 'sinso');
});
t('total del canal: DOH de la cartera con los inventarios reportados', () => {
  // Cruz Verde 9.000 / 3.000, Medipiel 1.200 / 1.500, Astor 100 / 300 (sin KAM filtrado)
  cerca(M.tot.dohRep, (9000e6 + 1200e6 + 100e6) / ((3000e6 + 1500e6 + 300e6) / 30), 1e-9);
});
t('sell-out con más de 4 meses de rezago = "sin sell-out reciente"', () => {
  const so = plano(SO); so.filas = so.filas.filter(f => f[1] !== 1 || f[0].startsWith('2025'));
  so.filas.push(['2026-02', 1, 0, 1, 0, 100, 0, 300, 0, 1]);
  const x = nuevo(MTD, so).vtModelo().todos.find(z => z.id === '11026712');
  assert.ok(x.sal.viejo); assert.strictEqual(x.eInv, 'sindatos'); assert.strictEqual(x.acc, 'sinso');
});

console.log('Ventas · productos');
t('señales por producto (reportadas): quiebre, sobrestock, sin rotación', () => {
  assert.strictEqual(c.vtSenal({ kInv: 5, promSOInv: 10, dohRep: 5, inv: 1 }, 60), 'quiebre');
  assert.strictEqual(c.vtSenal({ kInv: 5, promSOInv: 10, dohRep: 130, inv: 1 }, 60), 'sobre');
  assert.strictEqual(c.vtSenal({ kInv: 5, promSOInv: 0, dohRep: null, inv: 50 }, 60), 'sinrot');
  assert.strictEqual(c.vtSenal({ kInv: 5, promSOInv: 10, dohRep: 60, inv: 1 }, 60), '');
  assert.strictEqual(c.vtSenal({ kInv: -1, promSOInv: 10, inv: 0 }, 60), '');   // sin foto de inventario: sin señal
});
t('Cruz Verde, producto 2: inventario 0 en la foto del cliente → riesgo de quiebre', () => {
  const P = c.vtModeloProductos();
  const p2 = P.idx[c.vtNormProd('FP FWATER MAGIC COLOR MEDIUM SPF50 50ML')];
  assert.strictEqual(p2.det.find(z => z.x.id === '11026707').senal, 'quiebre'); assert.strictEqual(p2.quiebre, 1);
  cerca(p2.dA1, 280955516 / 161586108 - 1, 1e-9);
  assert.strictEqual(p2.si, 3000e6); assert.strictEqual(p2.so, 3000e6);
});
t('DOH del producto solo con los clientes que reportan inventario', () => {
  const so = plano(SO);
  so.filas = so.filas.map(f => (f[1] === 1 ? [f[0], f[1], f[2], f[3], 0, f[5], 0, 0, 0, 0] : f));   // Medipiel sin inventario
  const k = nuevo(MTD, so), p1 = k.vtModeloProductos().idx[k.vtNormProd('FP FUSION WATER MAGIC SPF50 50ML')];
  const conInv = p1.det.filter(d => d.r && d.r.kInv >= 0);
  assert.ok(!conInv.some(d => d.x.id === '11026712'));
  const inv = conInv.reduce((a, d) => a + d.r.inv, 0), soInv = conInv.reduce((a, d) => a + d.r.promSOInv, 0);
  cerca(p1.doh, inv / (soInv / 30), 1e-9);
});

console.log('Ventas · totales, filtros y render');
t('cliente que solo reporta sell-out no suma venta, plan ni mes del año pasado', () => {
  const mtd = plano(MTD);
  mtd.hist.push([2025, 10, '111', 3000000000, 0]);
  mtd.histClientes['111'] = ['COMPAÑIA ASTOR S.A.', 'PEREZ NATALIA', 'Cadenas'];
  const k = nuevo(mtd), m = k.vtModelo(), astor = m.todos.find(x => x.id === '111');
  assert.strictEqual(astor.a1Mes, 0); assert.strictEqual(astor.plan, 0); assert.strictEqual(astor.real, 0);
});
t('total vs A-1 incluye el A-1 de clientes perdidos (como Ventas MTD), filtrado por KAM', () => {
  const mtd = plano(MTD);
  mtd.prod.push(['11055555', 0, 0, 500000000, 0]);
  mtd.histClientes['11055555'] = ['PERDIDO SAS', 'SARA CARDONA', 'Tiendas de piel'];
  const k = nuevo(mtd), m = k.vtModelo();
  cerca(m.tot.a1, m.filas.reduce((a, x) => a + x.a1, 0) + 500000000, 1);
  k.vtSetKam('ANGELICA MONSALVE');
  cerca(k.vtModelo().tot.a1, 461586108, 1);
});
t('filtro de KAM: la cartera y los totales se recalculan', () => {
  const k = nuevo(); k.vtSetKam('SARA CARDONA');
  const m = k.vtModelo();
  assert.deepStrictEqual(plano(m.filas.map(x => x.id)).sort(), ['11026712', '11099998']);
  cerca(m.tot.real, 28784218 + 30000000, 1);
});
t('un KAM recordado que ya no existe se descarta al pintar', () => {
  const k = nuevo(); k.vtEstado.kam = 'KAM QUE YA NO ESTA'; k.vtMod = null; k.vtRender();
  assert.strictEqual(k.vtEstado.kam, '');
});
t('casillas de la matriz y "sin sell-out" filtran la lista', () => {
  const k = nuevo();
  k.vtEstado.seg = 'm:alto:crece';
  assert.deepStrictEqual(plano(k.vtFiltrarLista(k.vtModelo()).map(x => x.id)), ['11026707']);
  k.vtEstado.seg = 'sinso';
  assert.deepStrictEqual(plano(k.vtFiltrarLista(k.vtModelo()).map(x => x.id)).sort(), ['1', '11099998']);
});
t('orden por defecto: "vs plan" = mayor falta para el plan; "vs sell-out" = mayor sell-out', () => {
  const k = nuevo();
  k.vtSetModo('plan'); k.vtVer('clientes'); assert.strictEqual(k.vtListaVista[0].id, '11026707');
  k.vtSetModo('so'); assert.strictEqual(k.vtEstado.orden, 'so'); assert.strictEqual(k.vtListaVista[0].id, '11026707');
});
t('Productos: el orden por encabezado se aplica a la lista completa, no solo a lo visible', () => {
  const k = nuevo(); k.vtVer('productos'); k.vtEstado.topeProd = 1;
  k.MTD_ORDEN.vtTablaProd = { k: 'nombre', dir: 'asc' }; k.vtPintarProductos();
  assert.deepStrictEqual(plano(k.vtProdVista.map(p => p.nombre)),
    ['FP FUSION WATER MAGIC SPF50 50ML', 'FP FWATER MAGIC COLOR MEDIUM SPF50 50ML']);
});
t('mes cerrado: no se rotula "a la misma fecha" ni quedan días hábiles', () => {
  const mtd = plano(MTD); mtd.meta.libroActualizado = '2026-11-05T08:00:00';
  const k = nuevo(mtd), m = k.vtModelo();
  assert.strictEqual(m.av.cerrado, true); assert.strictEqual(m.av.rest, 0);
  k.vtVer('clientes');
  assert.ok(!/a la misma fecha/.test(k.document.els.vtCuerpo.innerHTML.split('Cómo leer')[0]));
});

/* ---- Servidor: DOH objetivo de 'Info SO-INV' sin leer las columnas de contraseñas ---- */
console.log('Servidor · DOH objetivo');
function codigo() {
  const ctx = { console, Date, Math, JSON, String, Number, Object, Array, isNaN, parseFloat, parseInt, RegExp, Error, Logger: { log() {} } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, 'Code.js'), 'utf8'), ctx);
  return ctx;
}
function hojaFalsa(filas, lecturas) {
  return { getLastColumn: () => Math.max(...filas.map(f => f.length)), getLastRow: () => filas.length,
    getRange: (r, col, nr, nc) => { if (lecturas) lecturas.push([r, col, nr, nc]);
      return { getValues: () => filas.slice(r - 1, r - 1 + nr).map(f => f.slice(col - 1, col - 1 + nc)) }; } };
}
t('lee SOLO las columnas SAP y DOH objetivo; "60 // Depende" → 60; vacío se omite', () => {
  const filas = [
    ['SAP', 'Chain', 'KAM ENCARGADO', 'Lista de precios', 'FUENTE', 'Usuario', 'Contraseña', 'DOH objetivo', 'CEDIS'],
    [11026696, 'CUTIS S.A.', 'ABADIA MIGUEL', 'Cutis', 'KAM', 'secreto@x.com', 'CLAVE1', 60, '1 BOG'],
    [11026702, 'PASTEUR', 'PEREZ NATALIA', 'Cadenas', 'url', 'usr', 'CLAVE2', '60 // Depende', 1],
    [11026707, 'CRUZ VERDE', 'X', 'x', 'x', 'usr', 'CLAVE3', 'Reajustar // 30', 1],
    [11026711, 'LASKIN', 'X', 'x', 'x', 'usr', 'CLAVE4', '', 1]];
  const lecturas = [], ctx = codigo();
  const doh = plano(ctx.sivsoLeerDohObjetivo_({ getSheetByName: n => (n === 'Info SO-INV' ? hojaFalsa(filas, lecturas) : null) }));
  assert.deepStrictEqual(doh, { '11026696': 60, '11026702': 60, '11026707': 30 });
  // Ninguna lectura de datos (fila ≥ 2) toca las columnas F (Usuario) ni G (Contraseña).
  lecturas.filter(l => l[0] >= 2).forEach(l => {
    for (let k = l[1]; k < l[1] + l[3]; k++) assert.ok(k !== 6 && k !== 7, 'leyó la columna ' + k + ': ' + JSON.stringify(l));
  });
  assert.strictEqual(ctx.mtdLibroActualizado_('x'), null);       // sin DriveApp no revienta
});
t('un encabezado "Usuario portal SAP" nunca se toma como la columna SAP', () => {
  const filas = [['Usuario portal SAP', 'Contraseña', 'Cliente SAP ID usuario', 'DOH objetivo'], ['user@x', 'CLAVE', 'abc', 60]];
  assert.deepStrictEqual(plano(codigo().sivsoLeerDohObjetivo_({ getSheetByName: () => hojaFalsa(filas) })), {});
});

console.log('\n' + ok + ' pruebas OK');
