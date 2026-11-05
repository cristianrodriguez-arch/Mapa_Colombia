/* Pruebas de la lógica del servidor (Code.js) sin Google Apps Script.
 * Se carga Code.js en un contexto vm con stubs de SpreadsheetApp / CacheService /
 * LockService / Utilities / Logger y hojas falsas que reproducen los casos reales
 * encontrados en la auditoría (ver Apps Script/DOCUMENTACION_KPIS.md).
 *
 *   node tests/test_servidor_mtd.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const rutaCode = path.join(__dirname, '..', 'Apps Script', 'Code.js');

/* ---- Hoja falsa ---- */
function hoja(filas) {
  return {
    getLastColumn: () => Math.max(...filas.map(f => f.length)),
    getLastRow: () => filas.length,
    getRange: (r, c, nr, nc) => ({
      getValues: () => filas.slice(r - 1, r - 1 + nr).map(f => {
        const o = []; for (let i = 0; i < nc; i++) o.push(f[c - 1 + i] === undefined ? '' : f[c - 1 + i]); return o;
      })
    }),
    getDataRange: () => ({ getValues: () => filas })
  };
}

function nuevoContexto(hojas, tz) {
  const cache = new Map();
  let lecturas = 0;
  const ctx = {
    console, Date, Math, JSON, String, Number, Object, Array, isNaN, parseFloat, parseInt, RegExp, Error,
    Logger: { log() {} },
    Utilities: {
      formatDate: (d, zona, fmt) => {
        const p = new Intl.DateTimeFormat('en-US', { timeZone: zona, year: 'numeric', month: 'numeric' }).formatToParts(d);
        const v = t => p.find(x => x.type === t).value;
        return fmt === 'yyyy' ? v('year') : String(Number(v('month')));
      }
    },
    CacheService: {
      getScriptCache: () => ({
        get: k => (cache.has(k) ? cache.get(k) : null),
        getAll: ks => { const o = {}; ks.forEach(k => { if (cache.has(k)) o[k] = cache.get(k); }); return o; },
        putAll: m => {
          Object.keys(m).forEach(k => {
            if (Buffer.byteLength(m[k], 'utf8') > 100 * 1024) throw new Error('Argument too large: value');
            cache.set(k, m[k]);
          });
        },
        put: (k, v) => cache.set(k, v), remove: k => cache.delete(k),
        removeAll: ks => ks.forEach(k => cache.delete(k))
      })
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    SpreadsheetApp: {
      openById: () => ({
        getSpreadsheetTimeZone: () => tz,
        getSheetByName: n => { if (hojas[n]) lecturas++; return hojas[n] || null; },
        getSheets: () => Object.keys(hojas).map(n => ({ getName: () => n }))
      })
    }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(rutaCode, 'utf8'), ctx);
  ctx.__cache = cache;
  ctx.__lecturas = () => lecturas;
  return ctx;
}

/* ---- Datos de prueba (casos reales de sep-2026) ---- */
const SEP2026 = 46266;                        // 1-sep-2026 (serial de Sheets)
const cumplimiento = [
  ['SAP ID', 'CLIENTE', 'KAM ENCARGADO', 'Canal', 'Real -1 (LOCAL)', 'Real (LOCAL)', 'Current Plan (LOCAL)', 'CUMPL.', 'Real (año)', 'Current Plan (año)', '', '', '', '', SEP2026, 9, '(cambie el número para cambiar el mes)'],
  [11026707, 'DROGUERIAS CRUZ VERDE SAS', 'ANGELICA MONSALVE', 'Cadenas', 6152779368, 4560494148, 4516433538, 1.0097, 33754085874, 38312458004],
  [11026925, 'SAINT-PRIEST S.A.S', 'SERGIO MAGGI', 'Tiendas de piel', 13083626, 7769795, '', 1, 159105553, 161942410],   // sin plan: la hoja dice 100 %
  [11026722, 'DERMATOLOGICA S.A', 'SIN KAM', 'Tiendas de piel', 93121389, -1222499, 0, 1, 25790922, 840000000],
  [1, 'ISDIN', 'OTRO', '', 0, 28972282, '', 1, 196187091],                                                         // fila interna
  [11058519, 'GRUPO EMPRESARIAL MGS S.A.S', '', '', 0, "#N/A (Did not find value '11058519' in MATCH evaluation.)", 0, "#N/A (x)", 0],
  ['', 'Total general', '', '', 1, 1, 1, 1, 1, 1]                                                                    // fila de total: se ignora
];
const plantilla = [
  ['CLIENTE', 'KAM ENCARGADO', 'SAP ID', 'EAN', 'Real -1 ', 'Real (LOCAL)', 'Real #', 'BU', 'Brand', 'Product', 'Real'],
  ['DROGUERIAS CRUZ VERDE SAS', 'ANGELICA MONSALVE', 11026707, 8429420248977, 2547634464, 389044296, 4344, 'Foto', 'FP', 'FP FUSION WATER MAGIC SPF50 50ML', 389044296],
  ['DROGUERIAS CRUZ VERDE SAS', 'ANGELICA MONSALVE', 11026707, 8429420111111, 100, 50, 10, 'Foto', 'FP', 'FP FUSION WATER MAGIC SPF50 50ML', 50],   // otro EAN, mismo nombre
  ['DROGUERIAS CRUZ VERDE SAS', 'ANGELICA MONSALVE', 11026707, 8429420369474, 0, 356803056, 3984, '', '', '', 356803056],            // sin nombre
  ['SAINT-PRIEST S.A.S', 'SERGIO MAGGI', 11026925, 8429420248977, 0, 0, 0, 'Foto', 'FP', 'FP FUSION WATER MAGIC SPF50 50ML', 0]       // todo cero: se descarta
];
// Fechas: serial, Date y texto d/m/aaaa
const d = (y, m) => new Date(Date.UTC(y, m - 1, 1, 5, 0, 0));   // 1-mes 00:00 en America/Bogota = 05:00 UTC
const historico = [
  ['FECHA', 'SAP ID', 'Real (LOCAL)', 'CLIENTE', 'KAM ENCARGADO', 'Current Plan (LOCAL)', 'Canal', 'Sell Out Plan', 'Sell Out Real', 'x', 'y'],
  [d(2025, 9), 11026707, 6744000000, 'DROGUERIAS CRUZ VERDE SAS', 'ANGELICA MONSALVE', 5000000000, 'Cadenas', 0, 0],
  [d(2026, 8), 11026707, 4283000000, 'DROGUERIAS CRUZ VERDE SAS', 'ANGELICA MONSALVE', 4500000000, 'Cadenas', 0, 0],
  [SEP2026, 11026707, 4560494148, 'DROGUERIAS CRUZ VERDE SAS', 'ANGELICA MONSALVE', 4516433538, 'Cadenas', 0, 0],
  ['1/10/2026', 11026707, 0, 'DROGUERIAS CRUZ VERDE SAS', 'ANGELICA MONSALVE', 0, 'Cadenas', 0, 0],                  // futuro en cero: no se envía
  [d(2025, 9), 11099999, 500000000, 'CLIENTE PERDIDO SAS', 'SIN KAM', 0, 'Tiendas de piel', 0, 0]                     // cliente que ya no está en CUMPLIMIENTO
];

let ok = 0;
function t(nombre, fn) { try { fn(); ok++; console.log('  ✓ ' + nombre); } catch (e) { console.log('  ✗ ' + nombre + '\n    ' + e.message); process.exitCode = 1; } }

console.log('Servidor · Ventas MTD');
const ctx = nuevoContexto({ CUMPLIMIENTO: hoja(cumplimiento), PLANTILLA: hoja(plantilla), 'Historico de ventas': hoja(historico) }, 'America/Bogota');
const p = JSON.parse(ctx.getVentasMtdCompletoJson());

t('sin errores de lectura', () => assert.deepStrictEqual(p.meta.errores, {}));
t('periodo sale de la celda de control (sep-2026), no del reloj', () => {
  assert.strictEqual(p.meta.periodo.anio, 2026); assert.strictEqual(p.meta.periodo.mes, 9);
});
t('se ignora la fila de total y quedan 5 clientes', () => assert.strictEqual(p.clientes.length, 5));
t('KAM/canal vacíos se normalizan a SIN KAM / SIN CANAL', () => {
  const mgs = p.clientes.find(c => c.sapId === '11058519');
  assert.strictEqual(mgs.kam, 'SIN KAM'); assert.strictEqual(mgs.canal, 'SIN CANAL');
});
t('#N/A se marca como error y vale 0 (no rompe)', () => {
  const mgs = p.clientes.find(c => c.sapId === '11058519');
  assert.strictEqual(mgs.error, 1); assert.strictEqual(mgs.realMes, 0);
  assert.deepStrictEqual(Array.from(p.meta.clientesConError), ['GRUPO EMPRESARIAL MGS S.A.S']);
});
t('la fila SAP 1 / ISDIN se marca interna', () => assert.strictEqual(p.clientes.find(c => c.sapId === '1').interno, 1));
t('NO se hereda el % de la hoja (Saint-Priest sin plan: planMes 0)', () => {
  const sp = p.clientes.find(c => c.sapId === '11026925');
  assert.strictEqual(sp.planMes, 0); assert.strictEqual(sp.cumplPct, undefined);
});
t('venta negativa se conserva (Dermatológica)', () => assert.strictEqual(p.clientes.find(c => c.sapId === '11026722').realMes, -1222499));
t('productos: mismo nombre con 2 EAN se consolida; sin nombre → SIN PRODUCTO; todo-cero se descarta', () => {
  assert.deepStrictEqual(Array.from(p.productos), ['FP FUSION WATER MAGIC SPF50 50ML', 'SIN PRODUCTO']);
  const f = p.prod.find(r => r[0] === '11026707' && r[1] === 0);
  assert.deepStrictEqual(Array.from(f), ['11026707', 0, 389044346, 2547634564, 4354]);
  assert.strictEqual(p.prod.length, 2);
  assert.strictEqual(p.meta.productosSinNombre, 1);
});
t('histórico: Date en zona Bogotá cae en el mes correcto y el cero-futuro no se envía', () => {
  const meses = p.hist.map(r => r[0] + '-' + r[1]);
  assert.deepStrictEqual(meses, ['2025-9', '2026-8', '2026-9', '2025-9']);
});
t('histórico usa SAP ID (no nombre) y trae diccionario de clientes, incl. el cliente perdido', () => {
  assert.strictEqual(p.hist[0][2], '11026707');
  assert.deepStrictEqual(Array.from(p.histClientes['11099999']), ['CLIENTE PERDIDO SAS', 'SIN KAM', 'Tiendas de piel']);
});
t('conciliación de las 3 hojas del mes de corte', () => {
  const c = p.meta.conciliacion;
  assert.strictEqual(c.historico, 4560494148);
  assert.strictEqual(c.cumplimiento, 4560494148 + 7769795 - 1222499 + 28972282);   // suma de las filas leídas
});
t('el payload es ASCII puro (1 carácter = 1 byte para CacheService)', () => {
  const texto = ctx.getVentasMtdCompletoJson();
  assert.ok(!/[^\x00-\x7f]/.test(texto));
});

console.log('Servidor · caché');
t('segunda llamada sale de la caché (no vuelve a abrir hojas)', () => {
  const antes = ctx.__lecturas();
  ctx.getVentasMtdCompletoJson();
  assert.strictEqual(ctx.__lecturas(), antes);
});
t('forzar=true se salta la caché ("Actualizar" funciona)', () => {
  const antes = ctx.__lecturas();
  ctx.getVentasMtdCompletoJson(true);
  assert.ok(ctx.__lecturas() > antes);
});
t('un resultado con error NO se cachea', () => {
  const c2 = nuevoContexto({ CUMPLIMIENTO: hoja(cumplimiento), 'Historico de ventas': hoja(historico) }, 'America/Bogota');   // falta PLANTILLA
  const r = JSON.parse(c2.getVentasMtdCompletoJson());
  assert.ok(r.meta.errores.plantilla);
  assert.strictEqual(c2.__cache.size, 0);
  assert.ok(r.clientes.length > 0);   // las otras secciones siguen vivas
});
t('un trozo con muchas tildes no supera 100 KB (antes el putAll fallaba en silencio)', () => {
  const grande = 'ñ'.repeat(200000);
  assert.strictEqual(ctx.mtdCacheGuardar_('prueba', grande, 60), true);
  assert.strictEqual(ctx.mtdCacheLeer_('prueba'), grande);
});
t('falta una columna obligatoria → error claro, no ceros en silencio', () => {
  const sinReal = cumplimiento.map(f => f.filter((_, i) => i !== 5));
  const c3 = nuevoContexto({ CUMPLIMIENTO: hoja(sinReal), PLANTILLA: hoja(plantilla), 'Historico de ventas': hoja(historico) }, 'America/Bogota');
  const r = JSON.parse(c3.getVentasMtdCompletoJson());
  assert.ok(/realMes/.test(r.meta.errores.cumplimiento), r.meta.errores.cumplimiento);
});

console.log('Servidor · fechas / zona horaria');
t('1-ene 00:00 hora Madrid = 31-dic 23:00 UTC → sigue siendo enero en la zona del libro', () => {
  const fecha = new Date(Date.UTC(2026, 0, 1, 0, 0, 0) - 3600 * 1000);   // 2026-01-01T00:00 en Madrid (UTC+1 en invierno)
  const f = ctx.mtdFecha_(fecha, 'Europe/Madrid');
  assert.deepStrictEqual([f.anio, f.mes], [2026, 1]);
  assert.strictEqual(ctx.sivsoMes_(fecha, 'Europe/Madrid'), '2026-01');   // con getUTCMonth daba 2025-12
});
t('serial numérico y texto d/m/aaaa', () => {
  assert.deepStrictEqual(Object.assign({}, ctx.mtdFecha_(46266, 'America/Bogota')), { anio: 2026, mes: 9 });
  assert.deepStrictEqual(Object.assign({}, ctx.mtdFecha_('1/01/2022', 'America/Bogota')), { anio: 2022, mes: 1 });
  assert.strictEqual(ctx.mtdFecha_('basura', 'America/Bogota'), null);
});

console.log('Servidor · SI vs SO');
const data = [
  ['Fecha', 'SAP ID', 'Product', 'Real (LOCAL)', 'Real #', 'Type', 'CLIENTE', 'KAM ENCARGADO', 'Channel', 'BU', 'EAN', 'Product ID', 'Brand'],
  [d(2026, 8), 11, 'PROD A', 100, 1, 'SI', 'CLI 1', 'K1', 'Cadenas', 'Foto', 1, 7, 'FP'],
  [d(2026, 8), 11, 'PROD A', 60, 1, 'SO', 'CLI 1', 'K1', 'Cadenas', 'Foto', 1, 7, 'FP'],
  [d(2026, 8), 11, 'PROD A', 30, 3, 'INV', 'CLI 1', 'K1', 'Cadenas', 'Foto', 1, 7, 'FP'],
  [d(2026, 9), 11, 'PROD A', 80, 1, 'SO', 'CLI 1', 'K1', 'Cadenas', 'Foto', 1, 7, 'FP'],            // sep: SO sin foto de INV
  [d(2026, 9), 11, 'PROD A', 5, 1, 'ST', 'CLI 1', 'K1', 'Cadenas', 'Foto', 1, 7, 'FP']              // Sell Through: se ignora
];
const c4 = nuevoContexto({ Data: hoja(data) }, 'America/Bogota');
const s = JSON.parse(c4.getSIvsSOJson());
t('agrega por mes × cliente × producto y marca tieneInv solo donde hubo fila INV', () => {
  assert.strictEqual(s.filas.length, 2);
  const ago = s.filas.find(f => f[0] === '2026-08'), sep = s.filas.find(f => f[0] === '2026-09');
  assert.deepStrictEqual(Array.from(ago), ['2026-08', 0, 0, 100, 1, 60, 1, 30, 3, 1]);
  assert.strictEqual(sep[9], 0);   // sin INV: no es "inventario 0"
});
t('diccionarios de clientes y productos; ST ignorado', () => {
  assert.deepStrictEqual(Array.from(s.clientes[0]), ['11', 'CLI 1', 'K1', 'Cadenas']);
  assert.deepStrictEqual(Array.from(s.productos[0]), ['7', 'PROD A', 'Foto', 'FP']);
  assert.strictEqual(s.meta.origen.filasTipoIgnorado, 1);
});

console.log('Servidor · mapa (PDV)');
const maestro = [
  ['Id cuenta 18', 'Nombre de la cuenta', 'Ubicación: Coordenadas (Latitud)', 'Ubicación: Coordenadas (Longitud)', 'Nº Oficina Farmacia'],
  ['A1', 'PDV UNO', '4,66', '-74,08', '8301160397'],
  ['A2', 'PDV DOS (mismo POS ID)', '4,70', '-74,10', '8301160397'],
  ['A3', 'PDV TRES', '6,25', '-75,57', '900793687'],
  ['A4', 'SIN POS', '3,44', '-76,52', '']
];
const c5 = nuevoContexto({ 'CO_Puntos_Maestro clientes': hoja(maestro) }, 'America/Bogota');
const pts = JSON.parse(c5.getPuntosJson());
t('POS ID repetido: se conservan los 4 puntos pero solo el primero es dueño de la venta (dup:1 en los demás)', () => {
  assert.strictEqual(pts.puntos.length, 4);
  assert.deepStrictEqual(Array.from(pts.puntos.map(p => p.dup)), [0, 1, 0, 0]);
  assert.strictEqual(pts.stats.posIdDuplicados, 1);
});
t('las capas del mapa se cachean (segunda llamada no vuelve a abrir la hoja)', () => {
  const antes = c5.__lecturas();
  c5.getPuntosJson();
  assert.strictEqual(c5.__lecturas(), antes);
});

// Caché comprimida: un texto > 400 KB se guarda con gzip + base64 y se lee igual.
t('caché: un dato grande se guarda comprimido (meta "z:") y se lee idéntico; uno chico queda sin comprimir', () => {
  const zlib = require('zlib');
  const c7 = nuevoContexto({}, 'America/Bogota');
  const blob = b => ({ getBytes: () => b, getDataAsString: () => Buffer.from(b).toString('utf8') });
  Object.assign(c7.Utilities, {
    newBlob: (x) => blob(typeof x === 'string' ? Buffer.from(x, 'utf8') : Buffer.from(x)),
    gzip: b => blob(zlib.gzipSync(Buffer.from(b.getBytes()))),
    ungzip: b => blob(zlib.gunzipSync(Buffer.from(b.getBytes()))),
    base64Encode: b => Buffer.from(b).toString('base64'),
    base64Decode: s => Buffer.from(s, 'base64'),
    sleep() {}
  });
  const grande = JSON.stringify({ filas: Array.from({ length: 60000 }, (_, i) => [i, 'CLIENTE ' + (i % 300), i * 7]) });
  assert.ok(grande.length > 400000);
  let n = 0;
  const leer = () => c7.conCache_('prueba_grande', 600, () => { n++; return { texto: grande, cachear: true }; });
  assert.strictEqual(leer(), grande);
  assert.ok(String(c7.__cache.get('meta::prueba_grande')).startsWith('z:'));
  assert.strictEqual(leer(), grande);                                       // segunda vez sale de la caché
  assert.strictEqual(n, 1);
  c7.conCache_('prueba_chica', 600, () => ({ texto: '{"a":1}', cachear: true }));
  assert.strictEqual(c7.__cache.get('meta::prueba_chica'), '1');
  assert.ok(!c7.__cache.has('construyendo::prueba_grande'));               // la marca se limpia al terminar
  // Archivos del ETL (leerArchivoDrive_: mapa, Sell Out, inventario) con la caché comprimida.
  // Antes leerArchivoDrive_ no entendía el meta "z:N" y desde la 2.ª carga devolvía "" (el mapa
  // se quedaba en "Cargando Sell Out…" con so_pdv.json de 4,5 MB).
  let lecturasDrive = 0;
  c7.leerDeDriveConReintento_ = () => { lecturasDrive++; return grande; };
  assert.strictEqual(c7.leerArchivoDrive_('so_pdv.json'), grande);
  assert.ok(String(c7.__cache.get('meta::so_pdv.json')).startsWith('z:'));
  assert.strictEqual(c7.leerArchivoDrive_('so_pdv.json'), grande);          // 2.ª vez: de la caché, idéntico
  assert.strictEqual(lecturasDrive, 1);
});

// Coordenadas sin punto decimal: valores reales de la hoja de oct-2026 (Sheets en
// español leyó "4.670942" como 4.670.942). Código postal = pista del departamento.
const sinComa = [
  ['Id cuenta 18', 'Nombre de la cuenta', 'Ubicación: Código Postal', 'Ubicación: Coordenadas (Latitud)', 'Ubicación: Coordenadas (Longitud)', 'Nº Oficina Farmacia', '#REF!'],
  ['B1', 'BARRANQUILLA', 80020, 1101388, -7482838, 'P1', '#REF!'],
  ['B2', 'BOGOTA', 110111, 46997874, -740505315, 'P2', ''],
  ['B3', 'BOGOTA PRECISION', 110221, 4666598556533950, -7405249259005390, 'P3', ''],
  ['B4', 'VALLEDUPAR', 200001, 1047521, -7325003, 'P4', ''],
  ['B5', 'NEIVA', 410010, 29308508, -752894546, 'P5', ''],
  ['B6', 'BUCARAMANGA', 680006, 710595, -7313945, 'P6', ''],
  ['B7', 'SIN COORDENADA', 760010, '', '', 'P7', ''],
  ['B8', 'MEDELLIN', 50034, 61989499, -755884815, 'P8', ''],
  ['B9', 'BOGOTA YA BIEN', 111211, 4.670942, -74.061899, 'P9', ''],
  ['B10', 'MEDELLIN TEXTO', 50021, '6.222.569', '-755.748.834', 'P10', ''],
  ['B11', 'CARTAGENA SIN CP', '', 1042331, -755123456, 'P11', ''],
  ['B12', 'PASTO', 520001, 12136, -7728111, 'P12', ''],
  ['B13', 'IPIALES', 524060, 8303, -7764421, 'P13', '']
];
const c6 = nuevoContexto({ 'CO_Puntos_Maestro clientes': hoja(sinComa) }, 'America/Bogota');
const pts6 = JSON.parse(c6.getPuntosJson());
const porNombre = {}; pts6.puntos.forEach(p => { porNombre[p.name] = [p.lat, p.lng]; });
t('coordenadas sin coma: se recupera el punto decimal según el departamento del código postal', () => {
  const cerca = (n, [a, b]) => { const v = porNombre[n]; assert.ok(v, n + ' no salió'); assert.ok(Math.abs(v[0] - a) < 1e-6 && Math.abs(v[1] - b) < 1e-6, n + ': ' + v); };
  cerca('BARRANQUILLA', [11.01388, -74.82838]);
  cerca('BOGOTA', [4.6997874, -74.0505315]);
  cerca('BOGOTA PRECISION', [4.66659855653395, -74.0524925900539]);
  cerca('VALLEDUPAR', [10.47521, -73.25003]);
  cerca('NEIVA', [2.9308508, -75.2894546]);
  cerca('BUCARAMANGA', [7.10595, -73.13945]);
  cerca('MEDELLIN', [6.1989499, -75.5884815]);
  cerca('BOGOTA YA BIEN', [4.670942, -74.061899]);
  cerca('MEDELLIN TEXTO', [6.222569, -75.5748834]);
  cerca('CARTAGENA SIN CP', [10.42331, -75.5123456]);
  cerca('PASTO', [1.2136, -77.28111]);
  cerca('IPIALES', [0.8303, -77.64421]);
  assert.strictEqual(pts6.puntos.length, 12);
  assert.strictEqual(pts6.stats.conPosId, 12);
  assert.strictEqual(pts6.stats.coordenadasSinComaReparadas, 11);
  assert.strictEqual(pts6.stats.reparadasSinCodigoPostal, 1);
  assert.strictEqual(pts6.stats.motivosSinCoordenada.vacia, 1);
});

console.log('\n' + ok + ' pruebas OK' + (process.exitCode ? ' · HAY FALLAS' : ''));
