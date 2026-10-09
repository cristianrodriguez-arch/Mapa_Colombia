/* Pruebas de la tabla ampliada "Detalle de PDV" (JsPaneles.html) sin navegador:
 * se cargan JsFiltros.html + JsPaneles.html en un contexto vm con un DOM mínimo.
 *
 *   node tests/test_tabla_pdv.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const dir = path.join(__dirname, '..', 'Apps Script');

function crearDom() {
  const els = {};
  const get = id => els[id] || (els[id] = {
    id, innerHTML: '', innerText: '', value: '', style: {}, hidden: false, scrollTop: 0,
    options: [], classList: { toggle() {}, remove() {}, add() {} },
    setAttribute() {}, getAttribute() { return null; }
  });
  return { getElementById: get, querySelector: () => null, querySelectorAll: () => [], els };
}

function cargar() {
  const document = crearDom();
  const llamadas = [];
  const ctx = {
    document, console, Intl, Math, JSON, Date, Number, String, Object, Array, isFinite, isNaN, parseInt,
    window: {}, setTimeout: f => f(),
    FMT: new Intl.NumberFormat('es-CO'),
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    normTxt: s => String(s == null ? '' : s).toUpperCase().normalize('NFD').replace(/\p{Diacritic}/gu, ''),
    fd: v => '$ ' + new Intl.NumberFormat('es-CO').format(Math.round(v)),
    me: e => String(e), avisar() {}, esGas: () => true,
    // Estado global de JsNucleo que usan JsFiltros/JsPaneles
    puntosG: [], bricksG: [], ventasG: {}, productosG: {}, asignacionesG: {},
    conteoSkuG: {}, idxSel: {}, skuSel: '', distSku: null, listo: {}, fset: {}, SEM: { sin: '#9ca3af' },
    filtros: { grupo: [], channel: [], region: [], poblacion: [], potencial: [], agente: [], brick: [], zona: [], pdv: [], bu: [], mes: [] },
    // google.script.run falso: guarda cada llamada y responde con lo que diga el test
    respuestaConteo: {},
    google: { script: { run: null } }
  };
  const runner = () => {
    const r = { ok: null, fail: null };
    return {
      withSuccessHandler(f) { r.ok = f; return this; },
      withFailureHandler(f) { r.fail = f; return this; },
      getConteoSkuJson(csv) { llamadas.push(['conteo', csv]); r.ok(JSON.stringify({ conteo: ctx.respuestaConteo })); },
      getDetallePdvJson(pos) { llamadas.push(['detalle', pos]); r.ok(JSON.stringify({ posId: pos, productos: {} })); }
    };
  };
  Object.defineProperty(ctx.google.script, 'run', { get: runner });
  vm.createContext(ctx);
  for (const f of ['JsFiltros.html', 'JsPaneles.html']) {
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    vm.runInContext(html.match(/<script>([\s\S]*)<\/script>/)[1], ctx, { filename: f });
  }
  return { ctx, document, llamadas };
}

let ok = 0;
function t(n, fn) { try { fn(); ok++; console.log('  ✓ ' + n); } catch (e) { console.log('  ✗ ' + n + '\n    ' + e.message); process.exitCode = 1; } }
const eq = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);

console.log('Tabla ampliada · Detalle de PDV');

t('#SKUs: un PDV sin ventas queda en 0 y no se vuelve a pedir (antes: bucle de llamadas)', () => {
  const { ctx, document, llamadas } = cargar();
  document.getElementById('modalTabla').style.display = 'flex';
  ctx.respuestaConteo = { A: 5 };            // B no tiene ventas: el servidor no lo devuelve
  vm.runInContext("puntosG=[{posId:'A',name:'PDV A'},{posId:'B',name:'PDV B'}];filtros.mes=[];", ctx);
  ctx.renderTablaModal();
  eq(llamadas, [['conteo', 'A,B']]);
  eq({ A: ctx.conteoSkuG.A, B: ctx.conteoSkuG.B }, { A: 5, B: 0 });
  ctx.renderTablaModal();
  assert.strictEqual(llamadas.length, 1, 'no debe volver a pedir el conteo');
});

t('Portafolio del PDV: respeta período y BU, ordena y suma', () => {
  const { ctx } = cargar();
  ctx.productosG = { S1: { d: 'FOTO 1', bu: 'FOTO' }, S2: { d: 'DERMA 1', bu: 'DERMA' }, S3: { d: 'FOTO 2', bu: 'FOTO' } };
  vm.runInContext("idxSel={1:1,2:1};", ctx);
  const prods = {
    S1: [[0, 99, 9900], [1, 2, 200]],          // el mes 0 está fuera del período
    S2: [[1, 5, 500], [2, 1, 100]],
    S3: [[0, 3, 300]]                          // sin venta en el período: no aparece
  };
  let r = ctx.filasPortafolio(prods);
  eq(r.filas.map(f => [f.sku, f.total, f.unidades]), [['S2', 600, 6], ['S1', 200, 2]]);
  eq([r.total, r.unidades], [800, 8]);
  vm.runInContext("setFiltro('bu',['FOTO'])", ctx);
  r = ctx.filasPortafolio(prods);
  eq(r.filas.map(f => f.sku), ['S1']);
});

t('Etiqueta del agente: sale de Team (VM/LAM), no del tipo de cuenta', () => {
  const { ctx } = cargar();
  ctx.asignacionesG = { A: [{ delegado: 'ANA', team: 'LAM', tipo: 'Farmacia/Parafarmacia' }] };
  const h = ctx.marcaAgenteHtml({ posId: 'A' });
  assert.ok(h.includes('>LAM<'), h);
  assert.ok(!/farmacia/i.test(h), h);
});

t('Lista: TOTAL en <tfoot> y brick sin el prefijo de ciudad cuando hay una sola', () => {
  const { ctx, document } = cargar();
  document.getElementById('modalTabla').style.display = 'flex';
  ctx.bricksG = [{ brickId: 'CAL-1', nombre: 'ESTADIO', nombreBrick: 'CALI, ESTADIO', ciudad: 'CALI' }];
  ctx.conteoSkuG = { A: 3 };
  vm.runInContext("puntosG=[{posId:'A',name:'PDV A',_brick:'CAL-1'}];filtros.mes=[];", ctx);
  ctx.renderTablaModal();
  const h = document.getElementById('tablaDetalle').innerHTML;
  assert.ok(/<tfoot><tr class="fila-total">/.test(h), 'TOTAL en tfoot');
  assert.ok(h.includes('<td>ESTADIO</td>') && !h.includes('CALI, ESTADIO'), 'brick corto');
  assert.ok(document.getElementById('tablaTitulo').innerText.endsWith('· CALI'));
});

t('Clic en un PDV abre su ficha y "Volver" regresa a la lista con su scroll', () => {
  const { ctx, document, llamadas } = cargar();
  document.getElementById('modalTabla').style.display = 'flex';
  ctx.conteoSkuG = { A: 3 };
  vm.runInContext("puntosG=[{posId:'A',name:'PDV A'}];filtros.mes=[];", ctx);
  ctx.renderTablaModal();
  document.getElementById('tablaWrap').scrollTop = 120;
  ctx.verPdvTabla(0);
  assert.strictEqual(document.getElementById('tablaFicha').hidden, false);
  assert.strictEqual(document.getElementById('tablaWrap').hidden, true);
  assert.strictEqual(document.getElementById('tablaTitulo').innerText, 'PDV A');
  assert.ok(llamadas.some(l => l[0] === 'detalle' && l[1] === 'A'), 'pide el portafolio del PDV');
  document.getElementById('tablaWrap').scrollTop = 0;
  ctx.volverListaTabla();
  assert.strictEqual(document.getElementById('tablaFicha').hidden, true);
  assert.strictEqual(document.getElementById('tablaWrap').scrollTop, 120);
});

t('Orden por encabezado: texto A→Z y luego Z→A; número mayor→menor; vacíos al final', () => {
  const { ctx, document } = cargar();
  document.getElementById('modalTabla').style.display = 'flex';
  ctx.conteoSkuG = { A: 1, B: 9, C: 4 };
  ctx.asignacionesG = { A: [{ delegado: 'ÁNGELA', team: 'VM' }], C: [{ delegado: 'BETO', team: 'LAM' }] };
  vm.runInContext("puntosG=[{posId:'A',name:'zeta'},{posId:'B',name:'Alfa'},{posId:'C',name:'beta'}];filtros.mes=[];", ctx);
  const nombres = () => ctx.tablaFilas.map(f => f.p.name);
  ctx.ordenarTabla('pdv'); eq(nombres(), ['Alfa', 'beta', 'zeta']);
  ctx.ordenarTabla('pdv'); eq(nombres(), ['zeta', 'beta', 'Alfa']);
  ctx.ordenarTabla('sku'); eq(nombres(), ['Alfa', 'beta', 'zeta']);      // 9, 4, 1
  ctx.ordenarTabla('asig'); eq(nombres(), ['zeta', 'beta', 'Alfa']);     // ÁNGELA, BETO, (sin asignar al final)
  assert.ok(document.getElementById('tablaDetalle').innerHTML.includes('▲'), 'flecha del orden activo');
});

t('Ciudad del CRM: CALI / Cali / cali → CALI (sin tildes, conserva la Ñ)', () => {
  const { ctx } = cargar();
  eq(['CALI', 'Cali', ' cali ', 'Bogotá  D.C.', 'Peñol', 'medellín'].map(ctx.normGeo),
     ['CALI', 'CALI', 'CALI', 'BOGOTA D.C.', 'PEÑOL', 'MEDELLIN']);
});

t('Colores por delegado: 10 en una ciudad (Bogotá) sin repetir tono dentro del mismo equipo', () => {
  const { ctx } = cargar();
  const dels = [['F', 'LAM', 58], ['B', 'LAM', 49], ['M', 'LAM', 33], ['P', 'VM', 14], ['G', 'VM', 13],
                ['S', 'VM', 11], ['C', 'VM', 9], ['A', 'VM', 7], ['U', 'VM', 6], ['N', 'VM', 5]];
  const puntos = [], asig = {};
  let k = 0;
  dels.forEach(([d, team, n]) => { for (let i = 0; i < n; i++) { k++;
    puntos.push({ posId: 'P' + k, poblacion: 'BOGOTA' }); asig['P' + k] = [{ delegado: d, team }]; } });
  ctx.puntosG = puntos; ctx.asignacionesG = asig;
  const col = ctx.coloresDelegados();
  const vm = dels.filter(d => d[1] === 'VM').map(d => col[d[0]]);
  const lam = dels.filter(d => d[1] === 'LAM').map(d => col[d[0]]);
  assert.strictEqual(new Set(vm).size, vm.length, 'VM con tonos distintos');
  assert.strictEqual(new Set(lam).size, lam.length, 'LAM con tonos distintos');
  assert.ok(Object.values(col).every(c => ctx.PALETA_DELEGADOS.includes(c)), 'solo tonos de la paleta validada');
  // El LAM solo lleva anillo oscuro; un PDV con VM y LAM lleva el tono del LAM como anillo.
  eq(ctx.colorAgente({ posId: 'P1' }).ring, '#1f2937');
  ctx.asignacionesG.P1 = [{ delegado: 'F', team: 'LAM' }, { delegado: 'P', team: 'VM' }];
  const a = ctx.colorAgente({ posId: 'P1' });
  eq([a.fill, a.ring], [col.P, col.F]);
  eq(ctx.colorAgente({ posId: 'SIN' }).fill, ctx.SEM.sin);
});

t('Filtro Zona (de la tabla y la cabecera): cruza con los demás y da sus opciones en cascada', () => {
  const { ctx } = cargar();
  vm.runInContext(`puntosG=[{posId:'A',poblacion:'BOGOTA',_zona:'USAQUEN'},{posId:'B',poblacion:'BOGOTA',_zona:'SUBA'},
    {posId:'C',poblacion:'CALI',_zona:'CALI'}];`, ctx);
  vm.runInContext("setFiltro('poblacion',['BOGOTA'])", ctx);
  eq(ctx.opcionesDe('zona').map(o => o.valor), ['SUBA', 'USAQUEN']);
  vm.runInContext("setFiltro('zona',['SUBA'])", ctx);
  eq(ctx.visibles().map(p => p.posId), ['B']);
});

t('Descargar: la lista sale completa (no solo 500 filas), en el orden elegido y con el delegado y su equipo', () => {
  const { ctx, document } = cargar();
  document.getElementById('modalTabla').style.display = 'flex';
  let csv = null;
  ctx.mtdDescargarCsv = (filas, cols, nombre) => { csv = { filas, cols, nombre }; };
  ctx.mtdCsvFecha = () => '2026-10-09';
  ctx.asignacionesG = { P2: [{ delegado: 'ANA', team: 'VM' }] };
  vm.runInContext("TOPE_TABLA_MODAL=1;puntosG=[{posId:'P1',name:'Uno'},{posId:'P2',name:'Dos'}];filtros.mes=[];", ctx);
  ctx.ordenarTabla('pdv');
  ctx.descargarTablaPdv();
  eq(csv.filas.map(f => [f.pdv, f.asig]), [['Dos', 'ANA (VM)'], ['Uno', '']]);
  assert.strictEqual(csv.nombre, 'detalle_pdv_2026-10-09.csv');
});

console.log(ok + ' pruebas OK');
