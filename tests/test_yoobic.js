/* Pruebas de la integración Yoobic (Perfect Store) sin Google Apps Script ni navegador.
 *   · Servidor: Code.js (getYoobicJson / getYoobicFotosJson) con hojas falsas.
 *   · Cliente : JsYoobic.html (filtros, última encuesta, agotados, capas del mapa, popup).
 *
 *   node tests/test_yoobic.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const dir = path.join(__dirname, '..', 'Apps Script');

let ok = 0;
/* deepStrictEqual entre realms de vm falla por prototipo aunque el contenido sea igual. */
const eq = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);
function t(n, fn) { try { fn(); ok++; console.log('  ✓ ' + n); } catch (e) { console.log('  ✗ ' + n + '\n    ' + e.message); process.exitCode = 1; } }

/* ══════════════════════════ SERVIDOR ══════════════════════════ */

const col = l => { let n = 0; for (const c of l) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };
function fila(celdas) { const f = new Array(100).fill(''); Object.keys(celdas).forEach(k => { f[col(k)] = celdas[k]; }); return f; }

const PRE = 'https://assets.yoobic.com/image/upload/';
const encabezado = fila({
  A: 'mission_id', C: 'store_client_id', D: 'store_title', I: 'date', L: 'user_full_name',
  N: 'Puntuación Perfect Store', O: 'Disponibilidad', P: 'Lineal', Q: 'Permanente', R: 'Temporal',
  T: 'FP FUSION WATER', U: 'FP GEL CREAM', V: 'FP AGE REPAIR', W: 'FP COMPACT', X: 'P5', Y: 'P6', Z: 'P7', AA: '', AB: 'P9',
  AE: 'INVISIBLE STICK', BU: 'LANZAMIENTO X',
  BZ: 'Fotoprotector exhibido',                 // empieza por "Foto" pero NO es foto
  CN: 'Foto - Planograma ISDIN', CO: 'Foto - Planograma ISDIN'
});
// 8-oct-2026 00:30 UTC = 7-oct-2026 19:30 en Bogotá: la fecha debe salir del 7 (zona del libro)
const filaA = fila({
  A: 'M-1', C: 'ID0000000000001AAA', D: 'Tienda Yoobic 1', I: new Date(Date.UTC(2026, 9, 8, 0, 30)), L: 'SEBASTIAN GUTIERREZ',
  N: 78, O: 35, P: 20, Q: 15, R: 8,
  T: 'Sí', U: 'No', V: 'N/A', W: 'No aplica', X: '', Y: 'NO', Z: 'si', AB: 1, AE: 'No', BU: 'Sí',
  BZ: 'Sí',
  CN: PRE + 'v1/t/a.jpg, ' + PRE + 'v1/t/b.jpg', CO: '-'
});
const filaGuion = fila({ C: '-', I: '-', L: '-', CN: '-' });          // segunda fila de cabecera de algunos export
const filaB = fila({
  A: '', C: 'ID0000000000002BBB', D: 'Tienda 2', I: '2026-09-01T10:00:00Z', L: 'ANA',
  N: 50, O: 20, P: 10, Q: 10, R: 5,                                  // 45 ≠ 50 → descuadre
  T: 'No', CN: 'https://otra.cdn/x.png'
});
const direcciones = [
  ['Id_cuenta_18', 'Nombre de la cuenta', 'Cliente', 'Departamento', 'Ciudad', 'Dirección', 'Latitud', 'Longitud'],
  ['ID0000000000001xyz', 'BELLA PIEL BUENAVISTA', 'BELLA PIEL', 'CÓRDOBA', 'Montería', 'Carrera 6 #68-72', '8,75', '-75,88']
];

function hoja(filas) { return { getDataRange: () => ({ getValues: () => filas }) }; }
function contextoServidor(hojas) {
  const cache = new Map();
  const ctx = {
    console, Date, Math, JSON, String, Number, Object, Array, isNaN, parseFloat, parseInt, RegExp, Error,
    Logger: { log() {} },
    Utilities: {
      formatDate: (d, zona, fmt) => {
        const p = new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
        const v = k => p.find(x => x.type === k).value;
        if (fmt === 'yyyy-MM-dd') return v('year') + '-' + v('month') + '-' + v('day');
        if (fmt === 'yyyy') return v('year');
        return String(Number(v('month')));
      }
    },
    CacheService: { getScriptCache: () => ({
      get: k => (cache.has(k) ? cache.get(k) : null),
      getAll: ks => { const o = {}; ks.forEach(k => { if (cache.has(k)) o[k] = cache.get(k); }); return o; },
      putAll: m => Object.keys(m).forEach(k => cache.set(k, m[k])), put: (k, v) => cache.set(k, v),
      remove: k => cache.delete(k), removeAll: ks => ks.forEach(k => cache.delete(k)) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    SpreadsheetApp: { openById: () => ({
      getSpreadsheetTimeZone: () => 'America/Bogota',
      getSheetByName: n => hojas[n] || null,
      getSheets: () => Object.keys(hojas).map(n => Object.assign({ getName: () => n }, hojas[n])) }) }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, 'Code.js'), 'utf8'), ctx);
  ctx.__cache = cache;
  return ctx;
}

console.log('Yoobic · servidor');
const S = contextoServidor({
  // nombre con otra capitalización: la hoja se encuentra igual
  'YOOBIC': hoja([encabezado, filaGuion, filaA, filaB]),
  'Direcciones con sus cuentas CO (Appsheets)': hoja(direcciones)
});
const D = JSON.parse(S.getYoobicJson(false));

t('letras de columna → índice (A, N, AB, BU)', () => {
  assert.deepStrictEqual(['A', 'N', 'AB', 'BU'].map(S.yoobicColIdx_), [0, 13, 27, 72]);
});
t('lee 2 misiones y descarta la fila de guiones (sin tienda)', () => {
  assert.strictEqual(D.misiones.length, 2);
  assert.strictEqual(D.meta.sinTienda, 1);
});
t('fecha SIN hora y en la zona horaria del libro (00:30 UTC del 8 → 7 de octubre)', () => {
  assert.strictEqual(D.misiones[0][1], '2026-10-07');
  assert.strictEqual(D.misiones[1][1], '2026-09-01');
});
t('puntajes oficiales por pilar (N:R), sin recalcular', () => {
  assert.deepStrictEqual(D.misiones[0].slice(3, 8), [78, 35, 20, 15, 8]);
});
t('control de calidad: cuenta 1 descuadre Global ≠ suma de pilares', () => {
  assert.strictEqual(D.meta.calidad.descuadres, 1);
});
t('productos salen del encabezado; la columna sin encabezado (AA) no es producto', () => {
  const nombres = D.productos.map(p => p[0]);
  assert.strictEqual(nombres[0], 'FP FUSION WATER');
  assert.ok(nombres.indexOf('') === -1);
  assert.strictEqual(D.productos.length, 8 /* T..AB sin AA */ + 1 /* AE */ + 1 /* BU */);
  assert.strictEqual(D.grupos[D.productos[9][1]], 'Lanzamientos Derma');
});
t('disponibilidad: Sí=1 · No=0 · "N/A"/"No aplica"/vacío = sin respuesta (NO es agotado)', () => {
  //  T    U    V     W           X       Y    Z    AB   AE   BU
  //  Sí   No   N/A   No aplica   vacío   NO   si   1    No   Sí
  assert.strictEqual(D.misiones[0][8], '10---01101');
});
t('cruce con Direcciones por los 15 primeros caracteres del Id (18 vs 18 con otro sufijo)', () => {
  const t1 = D.tiendas[0];
  assert.strictEqual(t1[1], 'BELLA PIEL BUENAVISTA');
  assert.strictEqual(t1[2], 'BELLA PIEL');
  assert.strictEqual(t1[4], 'Montería');
  assert.strictEqual(t1[6], 8.75); assert.strictEqual(t1[7], -75.88);
  assert.strictEqual(D.meta.tiendasSinCruceDirecciones, 1);
  assert.strictEqual(D.tiendas[1][1], 'Tienda 2');        // sin cruce: nombre de Yoobic
});
t('tipos de foto: solo "Foto - …" (no "Fotoprotector exhibido")', () => {
  assert.deepStrictEqual(D.tiposFoto, ['Foto - Planograma ISDIN']);
});
const F = JSON.parse(S.getYoobicFotosJson(false));
t('fotos: varias URL por celda, prefijo quitado, "-" ignorado, otra CDN intacta', () => {
  assert.deepStrictEqual(F.fotos['M-1'], [[0, 'v1/t/a.jpg'], [0, 'v1/t/b.jpg']]);
  const clave2 = D.misiones[1][10];
  assert.deepStrictEqual(F.fotos[clave2], [[0, 'https://otra.cdn/x.png']]);
  assert.strictEqual(F.prefijo, PRE);
});
t('la clave de misión une los dos endpoints (mission_id o tienda|fecha|delegado)', () => {
  assert.strictEqual(D.misiones[0][10], 'M-1');
  assert.ok(D.misiones[1][10].indexOf('ID0000000000002BBB|') === 0);
});
t('queda en caché y limpiarCacheYoobic() la borra', () => {
  assert.ok(S.__cache.has('meta::yoobic_v1'));
  S.limpiarCacheYoobic();
  assert.ok(!S.__cache.has('meta::yoobic_v1'));
});
t('sin hoja Yoobic: error claro con las hojas disponibles', () => {
  const S2 = contextoServidor({ Otra: hoja([['x']]) });
  assert.throws(() => S2.getYoobicJson(true), /No se encontr.* 'Yoobic'.*Otra/);
});

/* ══════════════════════════ CLIENTE ══════════════════════════ */

function contextoCliente() {
  const els = {};
  const get = id => els[id] || (els[id] = { id, innerHTML: '', innerText: '', value: '', style: {}, hidden: false,
    childNodes: [], options: [], selectedIndex: 0, classList: { toggle() {}, remove() {}, add() {} },
    querySelectorAll: () => [], querySelector: () => null });
  const tablas = {};
  const ctx = {
    console, Intl, Math, JSON, Date, Number, String, Object, Array, isFinite, isNaN, parseInt, parseFloat,
    document: { getElementById: get, querySelectorAll: () => [], querySelector: () => null },
    window: {}, setTimeout: f => f(), alert() {},
    SEM: { alto: '#1e8e3e', medio: '#f2b600', bajo: '#ef7d00', muybajo: '#e41f33', sin: '#9ca3af' },
    FMT: new Intl.NumberFormat('es-CO'),
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
    normTxt: s => String(s == null ? '' : s).toUpperCase(), em: m => m,
    esGas: () => false, me: e => String(e), cargarLib: () => {}, Selector: function () { this.fijar = () => {}; this.refrescar = () => {}; },
    pintarBarras() {}, mtdTabla: cfg => { tablas[cfg.id] = cfg; }, mtdVacio() {}, mtdPintarChips() {},
    mtdDescargarCsv() {}, mtdCsvFecha: () => 'hoy',
    mtdVistaActiva: 'mapa', mapaEstado: 'no', modoColor: 'rendimiento',
    puntosG: [], bricksG: [], geomB: [], pip: () => '', filtros: { mes: [] }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, 'JsYoobic.html'), 'utf8').match(/<script>([\s\S]*)<\/script>/)[1], ctx);
  ctx.__tablas = tablas;
  return ctx;
}

const PAYLOAD = {
  v: 1,
  pilares: [{ k: 'global', etiqueta: 'Global Perfect Store', max: 100 }, { k: 'disp', etiqueta: 'Disponibilidad de producto', max: 40 },
    { k: 'lineal', etiqueta: 'Espacio lineal', max: 25 }, { k: 'perm', etiqueta: 'Visibilidad permanente', max: 20 },
    { k: 'temp', etiqueta: 'Visibilidad de campaña/temporal', max: 15 }],
  grupos: ['Producto BU Foto', 'Producto Derma'],
  productos: [['FUSION WATER', 0], ['GEL CREAM', 0], ['UREADIN', 1]],
  tiposFoto: ['Foto - Planograma ISDIN'],
  delegados: ['SEBASTIAN', 'ANA'], campanas: ['Perfect Store'],
  tiendas: [['001ABCDEFGHIJKLxyz', 'Nombre Direcciones', 'CLI DIR', 'DEP DIR', 'CIU DIR', '', null, null, '', 1],
            ['002ABCDEFGHIJKLxyz', 'Solo Yoobic', '', '', '', '', null, null, '', 0]],
  misiones: [
    // tienda, fecha, delegado, G, D, L, P, T, disp, campaña, clave
    [0, '2026-08-10', 1, 60, 20, 15, 15, 10, '100', 0, 'a1'],
    [0, '2026-10-01', 0, 90, 38, 22, 18, 12, '011', 0, 'a2'],     // la más reciente de la tienda 0
    [1, '2026-09-15', 0, 40, 10, 10, 10, 10, '0-0', 0, 'b1']
  ],
  meta: {}
};

console.log('Yoobic · cliente');
const C = contextoCliente();
C.ybRecibir(JSON.parse(JSON.stringify(PAYLOAD)));

t('misiones ordenadas de la más reciente a la más antigua', () => {
  eq(C.ybMis.map(m => m.clave), ['a2', 'b1', 'a1']);
});
t('última encuesta por PDV = la más reciente de cada tienda', () => {
  eq(C.ybUltimas(C.ybMis).map(m => m.clave).sort(), ['a2', 'b1']);
});
t('nivel con umbrales absolutos: 85 % alto · 70 % medio · 50 % bajo', () => {
  assert.deepStrictEqual([.9, .85, .7, .6, .49, null].map(C.ybNivel), ['alto', 'alto', 'medio', 'bajo', 'muybajo', 'sin']);
});
t('sin mapa: atributos de la hoja Direcciones', () => {
  const t0 = C.ybTiendas[0];
  assert.strictEqual(t0.cliente, 'CLI DIR'); assert.strictEqual(t0.ciudad, 'CIU DIR'); assert.strictEqual(t0.zona, 'Sin zona');
});
t('con mapa: atributos del PDV del CRM (cruce por 15 caracteres) y Zona desde su brick', () => {
  C.puntosG = [{ id: '001ABCDEFGHIJKLQQQ', posId: 'P1', name: 'PDV MAPA', grupo: 'CRUZ VERDE', region: 'BOGOTÁ',
    poblacion: 'Bogota', direccion: 'Cra 1', lat: 4.6, lng: -74.1, _brick: 'BOG-094' }];
  C.bricksG = [{ brickId: 'BOG-094', zona: 'USAQUEN', ciudad: 'BOGOTA' }];
  C.ybAlCargarMapa();
  const t0 = C.ybTiendas[0];
  assert.strictEqual(t0.nombre, 'PDV MAPA'); assert.strictEqual(t0.cliente, 'CRUZ VERDE');
  assert.strictEqual(t0.zona, 'USAQUEN'); assert.strictEqual(t0.brick, 'BOG-094');
  assert.strictEqual(C.ybTiendas[1].cliente, 'Sin cliente');
});
t('filtro de fecha "En" (exacta), "Antes de" y "Después de" excluyen el propio día; intervalo inclusivo', () => {
  C.ybFecha = { modo: 'en', d1: '2026-09-15', d2: '' };
  eq(C.ybFiltradas(null).map(m => m.clave), ['b1']);
  C.ybFecha = { modo: 'antes', d1: '2026-09-15', d2: '' };
  eq(C.ybFiltradas(null).map(m => m.clave), ['a1']);
  C.ybFecha = { modo: 'despues', d1: '2026-09-15', d2: '' };
  eq(C.ybFiltradas(null).map(m => m.clave), ['a2']);
  C.ybFecha = { modo: 'intervalo', d1: '2026-08-10', d2: '2026-09-15' };
  eq(C.ybFiltradas(null).map(m => m.clave), ['b1', 'a1']);
  C.ybFecha = { modo: 'todo', d1: '', d2: '' };
});
t('filtro de delegado + cascada: las opciones de "del" ignoran su propio filtro', () => {
  C.setYbFiltro('del', ['ANA']);
  eq(C.ybFiltradas(null).map(m => m.clave), ['a1']);
  eq(C.ybOpciones('del').map(o => o.valor).sort(), ['ANA', 'SEBASTIAN']);
  C.setYbFiltro('del', []);
});
t('disponibilidad de una misión: "-" no cuenta; filtro de grupo limita los productos', () => {
  const b1 = C.ybMis.filter(m => m.clave === 'b1')[0];
  const d = C.ybDispMision(b1, C.ybProductosActivos());
  assert.strictEqual(d.no, 2); assert.strictEqual(d.si, 0);
  C.setYbFiltro('grupo', ['1']);
  assert.strictEqual(C.ybDispMision(b1, C.ybProductosActivos()).no, 1);
  C.setYbFiltro('grupo', []);
});
t('tabla de agotados (detalle) trae Departamento, Ciudad y Zona, según la última encuesta', () => {
  C.ybVistaAgot = 'detalle';
  C.ybRenderAgotados(C.ybFiltradas(null));
  const filas = C.__tablas.ybTablaAgot.filas;
  // a2 = '011' → 1 agotado (FUSION WATER) · b1 = '0-0' → 2 agotados. a1 (vieja) no cuenta.
  assert.strictEqual(filas.length, 3);
  const fw = filas.filter(f => f.pdv === 'PDV MAPA')[0];
  assert.strictEqual(fw.producto, 'FUSION WATER');
  assert.strictEqual(fw.depto, 'BOGOTÁ'); assert.strictEqual(fw.ciudad, 'Bogota'); assert.strictEqual(fw.zona, 'USAQUEN');
  assert.ok(C.__tablas.ybTablaAgot.columnas.some(c => c.t === 'Zona'));
});
t('"Todas las encuestas" incluye también la encuesta vieja', () => {
  C.ybAlcance = 'todas';
  C.ybRenderAgotados(C.ybFiltradas(null));
  assert.strictEqual(C.__tablas.ybTablaAgot.filas.length, 3 + 2);   // a1 = '100' → 2 agotados
  C.ybAlcance = 'ultima'; C.ybVistaAgot = 'pdv';
});
t('mapa: % del pilar del PDV (última encuesta) y promedio por brick', () => {
  C.modoColor = 'ps_disp';
  const p = C.puntosG[0];
  assert.strictEqual(C.ybPctPunto(p), 38 / 40);
  eq(C.ybPorBrick([p]), { 'BOG-094': 38 / 40 });
  C.modoColor = 'ps_global';
  assert.strictEqual(C.ybPctPunto(p), .9);
});
t('mapa: el filtro de meses del mapa elige la última encuesta DENTRO de esos meses', () => {
  C.filtros.mes = ['2026-08'];
  assert.strictEqual(C.ybPctPunto(C.puntosG[0]), .6);
  C.filtros.mes = [];
  assert.strictEqual(C.ybPctPunto(C.puntosG[0]), .9);
});
t('popup del PDV: Global, pilares, agotados y botón "Ver fotos"', () => {
  const h = C.ybPopupHtml(C.puntosG[0]);
  assert.ok(/Perfect Store/.test(h) && /90,0/.test(h) && /Ver fotos/.test(h));
  assert.ok(/1 producto agotado/.test(h));
  assert.ok(/Sin encuestas/.test(C.ybPopupHtml({ id: 'ZZZ', posId: 'X' })));
});
t('fotos: URL completa (prefijo repuesto) y ordinal por tipo ("… - 2")', () => {
  const fx = C.ybExpandirFotos({ prefijo: PRE, tipos: ['Foto - Planograma ISDIN', 'Foto - Temporal'],
    fotos: { a2: [[0, 'v1/a.jpg'], [1, 'v1/b.jpg'], [0, 'https://otra/c.jpg']] } });
  const f = fx.fotos.a2;
  assert.strictEqual(f[0].url, PRE + 'v1/a.jpg'); assert.strictEqual(f[2].url, 'https://otra/c.jpg');
  assert.deepStrictEqual(f.map(x => x.n), [1, 1, 2]);
  C.ybFotosData = fx;
  assert.strictEqual(C.ybTituloFoto(f[2]), 'Foto - Planograma ISDIN - 2');
});
t('miniatura: transformación de Cloudinary solo en URLs /image/upload/', () => {
  assert.strictEqual(C.ybMiniatura(PRE + 'v1/a.jpg'), PRE + 'c_fill,w_420,h_315,q_auto/v1/a.jpg');
  assert.strictEqual(C.ybMiniatura('https://otra/c.jpg'), 'https://otra/c.jpg');
});
t('los datos de prueba (mock) se expanden sin errores y cuadran Global = suma', () => {
  const C2 = contextoCliente();
  C2.ybRecibir(C2.ybDatosDemo());
  assert.ok(C2.ybMis.length > 100);
  C2.ybMis.slice(0, 20).forEach(m => assert.ok(Math.abs(m.s[0] - (m.s[1] + m.s[2] + m.s[3] + m.s[4])) < .2));
});

console.log('\n' + ok + ' pruebas OK');
