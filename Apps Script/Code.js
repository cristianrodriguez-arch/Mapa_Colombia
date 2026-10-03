/**
 * ============================================================
 * VISOR COBERTURA ESTRATÉGICA — Backend (Code.gs)
 * ============================================================
 * Lee los JSON que genera etl_sellout.py desde Drive y los sirve
 * al frontend (Index.html).
 *
 * ARCHIVOS QUE CONSUME (carpeta _visor_json en Drive):
 *   so_pdv.json          PDV × BU × mes        → base del mapa
 *   so_portafolio.json   SKU × mes + catálogo  → panel de portafolio
 *   so_indice.json       PDV → fragmento       → enrutador detalle por PDV
 *   so_detalle_NN.json   PDV × SKU × mes       → portafolio de un PDV
 *   so_sku_indice.json   SKU → fragmento       → enrutador análisis producto
 *   so_sku_NN.json       SKU × PDV × mes       → distribución de un producto
 *   so_manifiesto.json   metadatos             → diagnóstico
 *
 * Además lee, directo del Sheet (no del Drive/ETL), la hoja 'Asignacion'
 * (VM/LAM por PDV) vía getAsignacionesJson().
 *
 * CONFIGURACIÓN: solo hay que revisar CARPETA_JSON_ID y SPREADSHEET_ID.
 *
 * DESPUÉS DE CADA CORRIDA DEL ETL: ejecutar limpiarCache().
 */

/* ============================================================
 * CONFIGURACIÓN
 * ============================================================ */

var CARPETA_JSON_ID = '1Kg2WPunJtn-KjeNdhsEN4ojT6q00JPhm';
var SPREADSHEET_ID  = '1fILFlz4cO4mmW-oOnhTuewCicoWJ8bzFUUAN30GaewI';

var NOMBRE_HOJA_PUNTOS     = 'CO_Puntos_Maestro clientes';
var VISOR_HOJA_BRICKS      = 'Bricks';
var NOMBRE_HOJA_ASIGNACION = 'Asignacion';

var CACHE_SEGUNDOS   = 21600;   // 6 horas
var CACHE_TROZO      = 90000;   // CacheService acepta 100 KB por clave
var CACHE_MAX_TROZOS = 60;      // ~5.4 MB máximo por archivo

// Capas del mapa que salen de la hoja de cálculo (antes se leían COMPLETAS en
// cada carga de página). 6 h; limpiarCache() y getXxxJson(true) las refrescan.
var CACHE_PUNTOS_CLAVE = 'mapa_puntos';
var CACHE_BRICKS_CLAVE = 'mapa_bricks';
var CACHE_ASIG_CLAVE   = 'mapa_asignaciones';

/* ============================================================
 * Entrada de la Web App
 * ============================================================ */

function doGet(e) {
  // Ruteo opcional por ?accion=... para consumir los endpoints como API REST.
  // Sin parámetro (el caso normal de la web app) sigue devolviendo el HTML.
  var accion = (e && e.parameter && e.parameter.accion) || '';
  if (accion === 'getVentasMtdJson') {
    return ContentService.createTextOutput(getVentasMtdJson())
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (accion === 'getSIvsSOJson') {
    return ContentService.createTextOutput(getSIvsSOJson())
      .setMimeType(ContentService.MimeType.JSON);
  }

  // createTemplateFromFile + evaluate(): obligatorio para que se procesen los
  // <?!= include('...') ?> con los que Index.html ensambla Estilos y los Js*.
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Cobertura Estratégica · ISDIN Colombia')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function abrirHoja_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/* ============================================================
 * Lectura de Drive con caché por trozos
 * ============================================================ */

function carpetaJson_() {
  if (!CARPETA_JSON_ID || CARPETA_JSON_ID.indexOf('PEGAR') === 0) {
    throw new Error('Falta configurar CARPETA_JSON_ID en Code.gs.');
  }
  try {
    return DriveApp.getFolderById(CARPETA_JSON_ID);
  } catch (e) {
    throw new Error('No pude abrir la carpeta de Drive (' + CARPETA_JSON_ID + '): ' + e.message);
  }
}

function leerArchivoDrive_(nombre) {
  var cache = CacheService.getScriptCache();
  var meta  = cache.get('meta::' + nombre);

  if (meta) {
    var n = Number(meta), claves = [];
    for (var i = 0; i < n; i++) claves.push('t::' + nombre + '::' + i);
    var trozos = cache.getAll(claves), partes = [], ok = true;
    for (var j = 0; j < n; j++) {
      var t = trozos['t::' + nombre + '::' + j];
      if (!t) { ok = false; break; }
      partes.push(t);
    }
    if (ok) return partes.join('');
  }

  var it = carpetaJson_().getFilesByName(nombre);
  if (!it.hasNext()) {
    throw new Error("No encontré '" + nombre + "' en Drive. Corre etl_sellout.py.");
  }
  var texto = it.next().getBlob().getDataAsString('UTF-8');

  // Se guarda por trozos (por bytes, ver trocear_) y se anota el nombre en un
  // registro para que limpiarCache() pueda borrar TAMBIÉN los fragmentos
  // so_detalle_NN / so_sku_NN (antes quedaban viejos hasta 6 h tras el ETL).
  if (mtdCacheGuardar_(nombre, texto, CACHE_SEGUNDOS)) registrarClaveDrive_(nombre);
  return texto;
}

var CLAVE_REGISTRO_DRIVE = 'registro_drive';

function registrarClaveDrive_(nombre) {
  var cache = CacheService.getScriptCache(), lista = [];
  try { lista = JSON.parse(cache.get(CLAVE_REGISTRO_DRIVE) || '[]'); } catch (e) { lista = []; }
  if (lista.indexOf(nombre) === -1) {
    lista.push(nombre);
    try { cache.put(CLAVE_REGISTRO_DRIVE, JSON.stringify(lista), CACHE_SEGUNDOS); } catch (e2) { /* nada */ }
  }
}

/** Ejecutar tras cada corrida del ETL. Borra todos los JSON de Drive cacheados. */
function limpiarCache() {
  var cache = CacheService.getScriptCache(), lista = [];
  try { lista = JSON.parse(cache.get(CLAVE_REGISTRO_DRIVE) || '[]'); } catch (e) { lista = []; }
  ['so_pdv.json', 'so_portafolio.json', 'so_indice.json', 'so_sku_indice.json', 'so_manifiesto.json']
    .forEach(function(n) { if (lista.indexOf(n) === -1) lista.push(n); });
  lista.forEach(mtdCacheQuitar_);
  cache.remove(CLAVE_REGISTRO_DRIVE);
  // Las capas que salen de la hoja de cálculo (mapa) también dependen del ETL.
  [CACHE_PUNTOS_CLAVE, CACHE_BRICKS_CLAVE, CACHE_ASIG_CLAVE].forEach(mtdCacheQuitar_);
  Logger.log('Caché limpiada (' + lista.length + ' archivos de Drive + capas del mapa).');
  return 'OK';
}

function nombreFrag_(prefijo, n) {
  var num = parseInt(n, 10);
  if (isNaN(num) || num < 0) {
    throw new Error('Fragmento inválido para ' + prefijo + ': ' + JSON.stringify(n) +
                    '. Revisa el índice generado por etl_sellout.py.');
  }
  var s = String(num);
  while (s.length < 2) s = '0' + s;
  return prefijo + s + '.json';
}

/**
 * Número de fragmento de un PDV en so_indice.json. El ETL guarda cada PDV
 * como objeto {desc, frag, unidades, importe}; se acepta también un número
 * suelto por compatibilidad. Devuelve NaN si no hay fragmento válido.
 */
function fragDePdv_(entrada) {
  if (entrada !== null && typeof entrada === 'object') entrada = entrada.frag;
  return parseInt(entrada, 10);
}

/**
 * so_detalle_NN.json trae {fragmento, meses, pdv: {POS_ID: {SKU: serie}}}.
 * Devuelve el mapa de PDV; si el archivo viene plano ({POS_ID: ...}) lo usa tal cual.
 */
function pdvsDeFragmento_(datos) {
  return (datos && datos.pdv && typeof datos.pdv === 'object') ? datos.pdv : (datos || {});
}

/* ============================================================
 * Endpoints — ventas
 * ============================================================ */

/** PDV × BU × mes. Base del mapa. */
function getVentasJson() {
  return leerArchivoDrive_('so_pdv.json');
}

/** SKU × mes + catálogo de productos. */
function getPortafolioJson() {
  return leerArchivoDrive_('so_portafolio.json');
}

/** Portafolio de UN PDV (bajo demanda, al hacer clic en un marcador). */
function getDetallePdvJson(posId) {
  var pos = normalizarPos_(posId);
  if (!pos) return JSON.stringify({ posId: '', productos: {} });

  var indice = JSON.parse(leerArchivoDrive_('so_indice.json'));
  var entrada = indice.pdv ? indice.pdv[pos] : undefined;
  if (entrada === undefined) {
    return JSON.stringify({ posId: pos, productos: {}, aviso: 'PDV sin ventas.' });
  }
  var frag  = fragDePdv_(entrada);
  var datos = JSON.parse(leerArchivoDrive_(nombreFrag_('so_detalle_', parseInt(frag, 10))));
  return JSON.stringify({ posId: pos, productos: pdvsDeFragmento_(datos)[pos] || {} });
}

/** Portafolio agregado de varios PDV (todos los de un brick). */
function getDetalleAgregadoJson(posIdsCsv) {
  var lista = (posIdsCsv || '').split(',').map(normalizarPos_).filter(Boolean);
  if (!lista.length) {
    return JSON.stringify({ productos: {}, pdvConsultados: 0, pdvConVentas: 0 });
  }

  var vistos = {}, unicos = [];
  lista.forEach(function(p) { if (!vistos[p]) { vistos[p] = 1; unicos.push(p); } });

  var indice  = JSON.parse(leerArchivoDrive_('so_indice.json'));
  var porFrag = {}, encontrados = 0;
  unicos.forEach(function(pos) {
    var entrada = indice.pdv ? indice.pdv[pos] : undefined;
    if (entrada === undefined) return;
    var f = fragDePdv_(entrada);
    if (isNaN(f)) return;
    if (!porFrag[f]) porFrag[f] = [];
    porFrag[f].push(pos);
    encontrados++;
  });

  var acc = {};
  Object.keys(porFrag).forEach(function(f) {
    // Las claves de porFrag son strings (Object.keys): se convierten a entero.
    var datos = pdvsDeFragmento_(JSON.parse(
      leerArchivoDrive_(nombreFrag_('so_detalle_', parseInt(f, 10)))));
    porFrag[f].forEach(function(pos) {
      var skus = datos[pos];
      if (!skus) return;
      Object.keys(skus).forEach(function(sku) {
        if (!acc[sku]) acc[sku] = {};
        skus[sku].forEach(function(t) {
          var s = acc[sku][t[0]];
          if (!s) s = acc[sku][t[0]] = [0, 0];
          s[0] += t[1]; s[1] += t[2];
        });
      });
    });
  });

  var productos = {};
  Object.keys(acc).forEach(function(sku) {
    var serie = [];
    Object.keys(acc[sku]).forEach(function(im) {
      serie.push([Number(im), acc[sku][im][0], acc[sku][im][1]]);
    });
    serie.sort(function(a, b) { return a[0] - b[0]; });
    productos[sku] = serie;
  });

  return JSON.stringify({
    productos: productos, pdvConsultados: unicos.length, pdvConVentas: encontrados
  });
}

/* ============================================================
 * Endpoint nuevo: distribución geográfica de UN producto
 * ============================================================
 * Responde "¿dónde rota este SKU?". El frontend lo usa para
 * recolorear el mapa por ventas de ese producto y para calcular
 * cobertura, precio promedio ponderado y brechas.
 *
 * Devuelve: { sku, pdv: { 'POS_ID': [[iMes, units, amount], ...] } }
 */
/**
 * Cantidad de SKUs distintos vendidos (histórico, no filtrado por período) por cada
 * PDV de la lista. Usado por la tabla ampliada del panel de brick (columna "#SKUs"):
 * mismo agrupamiento por fragmento que getDetalleAgregadoJson(), pero devuelve un
 * conteo por PDV en vez de sumar todo junto.
 */
function getConteoSkuJson(posIdsCsv) {
  var lista = (posIdsCsv || '').split(',').map(normalizarPos_).filter(Boolean);
  if (!lista.length) return JSON.stringify({ conteo: {} });

  var vistos = {}, unicos = [];
  lista.forEach(function(p) { if (!vistos[p]) { vistos[p] = 1; unicos.push(p); } });

  var indice  = JSON.parse(leerArchivoDrive_('so_indice.json'));
  var porFrag = {};
  unicos.forEach(function(pos) {
    var entrada = indice.pdv ? indice.pdv[pos] : undefined;
    if (entrada === undefined) return;
    var f = fragDePdv_(entrada);
    if (isNaN(f)) return;
    if (!porFrag[f]) porFrag[f] = [];
    porFrag[f].push(pos);
  });

  var conteo = {};
  Object.keys(porFrag).forEach(function(f) {
    var datos = pdvsDeFragmento_(JSON.parse(
      leerArchivoDrive_(nombreFrag_('so_detalle_', parseInt(f, 10)))));
    porFrag[f].forEach(function(pos) {
      var skus = datos[pos];
      conteo[pos] = skus ? Object.keys(skus).length : 0;
    });
  });

  return JSON.stringify({ conteo: conteo });
}

function getDistribucionSkuJson(sku) {
  var s = (sku || '').toString().trim();
  if (!s) return JSON.stringify({ sku: '', pdv: {} });

  var indice = JSON.parse(leerArchivoDrive_('so_sku_indice.json'));
  var frag   = indice.sku ? indice.sku[s] : undefined;
  if (frag === undefined) {
    return JSON.stringify({ sku: s, pdv: {}, aviso: 'Producto sin ventas registradas.' });
  }
  var datos = JSON.parse(leerArchivoDrive_(nombreFrag_('so_sku_', parseInt(frag, 10))));
  return JSON.stringify({ sku: s, pdv: datos[s] || {} });
}

/* ============================================================
 * Endpoints — geografía (Google Sheets)
 * ============================================================ */

function getBricksJson(forzar) {
  return conCache_(CACHE_BRICKS_CLAVE, CACHE_SEGUNDOS, construirBricks_, forzar === true);
}

function construirBricks_() {
  var sheet = abrirHoja_().getSheetByName(VISOR_HOJA_BRICKS);
  if (!sheet) {
    throw new Error("No se encontró la hoja '" + VISOR_HOJA_BRICKS + "'. " +
                    "Disponibles: " + listarPestanas_().join(' | '));
  }

  var data    = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });

  var iId     = buscarCol_(headers, ['brick_id', 'brick id', 'brickid', 'id_brick']);
  var iGeo    = buscarCol_(headers, ['geometria_geojson', 'geometría_geojson', 'geojson',
                                     'geometria', 'geometría', 'polygon', 'poligono']);
  var iNombre = buscarCol_(headers, ['nombre_brick', 'nombre brick']);
  var iNom2   = buscarCol_(headers, ['nombre']);
  var iZona   = buscarCol_(headers, ['zona']);
  var iCiudad = buscarCol_(headers, ['ciudad']);
  var iDpto   = buscarCol_(headers, ['departamento', 'depto']);

  if (iId === -1 || iGeo === -1) {
    throw new Error("Faltan columnas de ID y geometría. Encabezados: " + headers.join(' | '));
  }

  var bricks = [], conGeo = 0, sinGeo = 0, errores = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i], bid = row[iId];
    if (!bid || !bid.toString().trim()) continue;

    var geom = null, raw = row[iGeo];
    if (raw && raw.toString().trim()) {
      try { geom = normalizarGeometria_(JSON.parse(raw.toString())); }
      catch (e) { if (errores.length < 3) errores.push(bid + ': ' + raw.toString().substring(0, 60)); }
    }
    if (geom) conGeo++; else sinGeo++;

    bricks.push({
      brickId:      bid.toString().trim(),
      nombre:       iNom2   !== -1 ? String(row[iNom2])   : '',
      zona:         iZona   !== -1 ? String(row[iZona])   : '',
      ciudad:       iCiudad !== -1 ? String(row[iCiudad]) : '',
      departamento: iDpto   !== -1 ? String(row[iDpto])   : '',
      nombreBrick:  iNombre !== -1 ? String(row[iNombre]) : '',
      geometry:     geom
    });
  }

  return {
    texto: jsonAscii_({
      bricks: bricks,
      stats: { filas: bricks.length, conGeometria: conGeo,
               sinGeometria: sinGeo, erroresMuestra: errores }
    }),
    cachear: bricks.length > 0
  };
}

function getPuntosJson(forzar) {
  return conCache_(CACHE_PUNTOS_CLAVE, CACHE_SEGUNDOS, construirPuntos_, forzar === true);
}

function construirPuntos_() {
  var sheet = abrirHoja_().getSheetByName(NOMBRE_HOJA_PUNTOS);
  if (!sheet) {
    throw new Error("No se encontró la hoja '" + NOMBRE_HOJA_PUNTOS + "'. " +
                    "Disponibles: " + listarPestanas_().join(' | '));
  }

  var data    = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });

  var idIdx     = buscarCol_(headers, ['id cuenta']);
  var idSapIdx  = buscarCol_(headers, ['id cliente sap']);
  var nameIdx   = buscarCol_(headers, ['nombre de la cuenta']);
  var grupoIdx  = buscarCol_(headers, ['grupo de compras']);
  var canalIdx  = buscarCol_(headers, ['channel']);
  var regIdx    = buscarCol_(headers, ['región', 'region']);
  var pobIdx    = buscarCol_(headers, ['población', 'poblacion']);
  var calleIdx  = buscarCol_(headers, ['calle']);
  var numIdx    = buscarCol_(headers, ['número/piso', 'numero/piso']);
  var brickIdx  = buscarCol_(headers, ['brick ubicación', 'brick ubicacion']);
  var latIdx    = buscarCol_(headers, ['latitud']);
  var lngIdx    = buscarCol_(headers, ['longitud']);
  var posIdIdx  = buscarCol_(headers, ['oficina farmacia', 'oficina de farmacia']);
  var potIdx    = buscarCol_(headers, ['potencial cliente', 'potencial']);
  var afinIdx   = buscarCol_(headers, ['afinidad']);

  if (latIdx === -1 || lngIdx === -1) {
    throw new Error("No encontré 'Latitud'/'Longitud'.");
  }

  var puntos = [], filas = 0, sinCoord = 0, conPos = 0, duplicados = 0, visto = {};
  function txt(row, i) { return (i !== -1 && row[i] != null) ? row[i].toString().trim() : ''; }

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!txt(row, idIdx) && !txt(row, nameIdx)) continue;
    filas++;

    var lat = parseNum_(row[latIdx]), lng = parseNum_(row[lngIdx]);
    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0) ||
        lat < -90 || lat > 90 || lng < -180 || lng > 180) { sinCoord++; continue; }

    var posId = normalizarPos_(txt(row, posIdIdx));
    if (posId) conPos++;
    // Un mismo POS_ID en varias filas (en el snapshot hay ~30 repetidos) haría
    // que el cliente sume SU venta una vez por fila. Se conservan todos los
    // puntos en el mapa, pero solo el primero es "dueño" de la venta: los
    // demás salen con dup:1 y el cliente les asigna venta 0.
    var dup = 0;
    if (posId && posId !== '0') {
      if (visto[posId]) { dup = 1; duplicados++; } else visto[posId] = 1;
    }

    puntos.push({
      id: txt(row, idIdx), idSap: txt(row, idSapIdx), posId: posId,
      name:      txt(row, nameIdx)  || 'Sin Nombre',
      lat: lat, lng: lng,
      grupo:     txt(row, grupoIdx) || 'Sin Grupo',
      channel:   txt(row, canalIdx) || 'Sin Canal',
      region:    txt(row, regIdx)   || 'Sin Región',
      poblacion: txt(row, pobIdx)   || 'Sin Población',
      potencial: txt(row, potIdx)   || 'Sin Potencial',
      afinidad:  txt(row, afinIdx),
      direccion: [txt(row, calleIdx), txt(row, numIdx)].filter(Boolean).join(' ') || 'Sin Dirección',
      brickCrm:  txt(row, brickIdx),
      dup:       dup
    });
  }

  return {
    texto: jsonAscii_({
      puntos: puntos,
      stats: { filas: filas, conCoordenada: puntos.length, sinCoordenada: sinCoord,
               conPosId: conPos, posIdDuplicados: duplicados,
               columnaPosIdDetectada: posIdIdx !== -1 ? String(data[0][posIdIdx]) : '(no encontrada)' }
    }),
    cachear: puntos.length > 0
  };
}

/* ============================================================
 * Endpoint — cobertura comercial (Google Sheets)
 * ============================================================ */

/**
 * Hoja 'Asignacion': quién (VM o LAM) tiene asignado cada PDV. Cruza por
 * 'Nº Oficina Farmacia' (mismo POS_ID normalizado que el resto del visor).
 * Un PDV puede tener más de una fila (p. ej. un VM y un LAM a la vez),
 * así que devuelve un arreglo de asignaciones por PDV, no una sola.
 */
function getAsignacionesJson(forzar) {
  return conCache_(CACHE_ASIG_CLAVE, CACHE_SEGUNDOS, construirAsignaciones_, forzar === true);
}

function construirAsignaciones_() {
  var sheet = abrirHoja_().getSheetByName(NOMBRE_HOJA_ASIGNACION);
  if (!sheet) {
    return { texto: jsonAscii_({ pdv: {}, aviso: "No se encontró la hoja '" + NOMBRE_HOJA_ASIGNACION + "'." }),
             cachear: false };
  }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { texto: jsonAscii_({ pdv: {} }), cachear: false };
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });

  var iPos      = buscarCol_(headers, ['oficina farmacia', 'oficina de farmacia']);
  var iDelegado = buscarCol_(headers, ['delegado']);
  var iCuentaId = buscarCol_(headers, ['id cuenta']);
  var iCuentaNom= buscarCol_(headers, ['nombre de la cuenta']);
  var iTipo     = buscarCol_(headers, ['tipo de registro']);
  var iTeam     = buscarCol_(headers, ['team']);

  if (iPos === -1) {
    throw new Error("No encontré 'Nº Oficina Farmacia' en la hoja '" + NOMBRE_HOJA_ASIGNACION +
                    "'. Encabezados: " + headers.join(' | '));
  }

  var pdv = {};
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var pos = normalizarPos_(row[iPos]);
    var delegado = iDelegado !== -1 ? String(row[iDelegado] || '').trim() : '';
    if (!pos || !delegado) continue;
    var asignacion = {
      delegado:     delegado,
      team:         iTeam      !== -1 ? String(row[iTeam]       || '').trim() : '',
      tipo:         iTipo      !== -1 ? String(row[iTipo]       || '').trim() : '',
      cuentaId:     iCuentaId  !== -1 ? String(row[iCuentaId]   || '').trim() : '',
      cuentaNombre: iCuentaNom !== -1 ? String(row[iCuentaNom]  || '').trim() : ''
    };
    if (!pdv[pos]) pdv[pos] = [];
    pdv[pos].push(asignacion);
  }

  return { texto: jsonAscii_({ pdv: pdv }), cachear: true };
}

/* ============================================================
 * Diagnóstico
 * ============================================================ */

function getDiagnosticoJson() {
  var d = { drive: {}, bricks: {}, puntos: {}, cruce: {} };

  try {
    var carpeta = carpetaJson_(), archivos = [], it = carpeta.getFiles();
    while (it.hasNext()) {
      var f = it.next();
      archivos.push(f.getName() + ' (' + Math.round(f.getSize() / 1024) + ' KB)');
    }
    d.drive.carpeta  = carpeta.getName();
    d.drive.archivos = archivos.sort();
    try { d.drive.manifiesto = JSON.parse(leerArchivoDrive_('so_manifiesto.json')); }
    catch (e) { d.drive.manifiesto = 'No disponible: ' + e.message; }
    d.drive.indiceSkuDisponible = archivos.some(function(a) { return a.indexOf('so_sku_indice') === 0; });
  } catch (e) { d.drive.error = e.message; }

  try {
    var pb = JSON.parse(getBricksJson());
    d.bricks = { total: pb.bricks.length, conGeometria: pb.stats.conGeometria,
                 sinGeometria: pb.stats.sinGeometria };
    for (var i = 0; i < pb.bricks.length; i++) {
      if (pb.bricks[i].geometry) {
        var g = pb.bricks[i].geometry;
        d.bricks.ejemplo = {
          brickId: pb.bricks[i].brickId, tipo: g.type,
          primerVertice: g.type === 'Polygon' ? g.coordinates[0][0] : g.coordinates[0][0][0]
        };
        break;
      }
    }
  } catch (e) { d.bricks.error = e.message; }

  try {
    var pp = JSON.parse(getPuntosJson());
    d.puntos = pp.stats;
    var indice = JSON.parse(leerArchivoDrive_('so_indice.json'));
    var ventas = indice.pdv || {};
    var cruzan = 0, sinPos = 0;
    pp.puntos.forEach(function(p) {
      if (!p.posId || p.posId === '0') { sinPos++; return; }
      if (ventas[p.posId] !== undefined) cruzan++;
    });
    d.cruce = {
      pdvTotales: pp.puntos.length, pdvSinPosId: sinPos, pdvQueCruzan: cruzan,
      porcentaje: pp.puntos.length ? Math.round(100 * cruzan / pp.puntos.length) + '%' : '0%'
    };
  } catch (e) { d.puntos.error = e.message; }

  return JSON.stringify(d, null, 2);
}

function probarConexion() {
  try {
    var carpeta = carpetaJson_(), archivos = [], it = carpeta.getFiles();
    while (it.hasNext()) archivos.push(it.next().getName());
    archivos.sort();
    var haySku = archivos.some(function(a) { return a.indexOf('so_sku_') === 0; });
    Logger.log('Carpeta "' + carpeta.getName() + '" accesible.');
    Logger.log('Archivos (' + archivos.length + '): ' + archivos.join(', '));
    Logger.log(haySku ? 'Índice por SKU disponible: análisis de producto activo.'
                      : 'FALTA el índice por SKU. Corre el ETL actualizado.');
    return 'OK: ' + archivos.length + ' archivos.';
  } catch (e) {
    Logger.log('Error: ' + e.message);
    return 'ERROR: ' + e.message;
  }
}

function verDiagnostico() { Logger.log(getDiagnosticoJson()); }

/** Inserta otro archivo del proyecto en la plantilla: <?!= include('JsMapa') ?>. */
function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

/* ============================================================
 * Utilidades
 * ============================================================ */

function parseNum_(v) {
  if (v === null || v === undefined || v === '') return NaN;
  if (typeof v === 'number') return v;
  var s = v.toString().trim().replace(/\s+/g, '');
  if (!s) return NaN;
  var coma = s.indexOf(',') !== -1, punto = s.indexOf('.') !== -1;
  if (coma && punto) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(/,/g, '.') : s.replace(/,/g, '');
  } else if (coma) {
    var p = s.split(','); s = p[0] + '.' + p.slice(1).join('');
  }
  var n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}

function normalizarPos_(v) {
  if (!v) return '';
  return v.toString().trim().toUpperCase().replace(/\s+/g, '').replace(/:/g, '_');
}

function buscarCol_(headers, frags) {
  for (var f = 0; f < frags.length; f++) {
    for (var i = 0; i < headers.length; i++) {
      if (headers[i].indexOf(frags[f]) !== -1) return i;
    }
  }
  return -1;
}

function normalizarGeometria_(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.type === 'FeatureCollection' && obj.features) {
    var geoms = [];
    obj.features.forEach(function(ft) {
      var g = normalizarGeometria_(ft);
      if (!g) return;
      if (g.type === 'Polygon') geoms.push(g.coordinates);
      else if (g.type === 'MultiPolygon') geoms = geoms.concat(g.coordinates);
    });
    if (!geoms.length) return null;
    return geoms.length === 1 ? { type: 'Polygon', coordinates: geoms[0] }
                              : { type: 'MultiPolygon', coordinates: geoms };
  }
  if (obj.type === 'Feature') return normalizarGeometria_(obj.geometry);
  if (obj.type === 'Polygon' || obj.type === 'MultiPolygon') {
    return (obj.coordinates && obj.coordinates.length) ? obj : null;
  }
  if (Array.isArray(obj) && obj.length) return { type: 'Polygon', coordinates: obj };
  return null;
}

function listarPestanas_() {
  return abrirHoja_().getSheets().map(function(s) { return s.getName(); });
}

/* ============================================================
 * Caché por trozos (compartida por MTD, SI vs SO y el mapa)
 * ============================================================
 * CacheService acepta 100 KB POR CLAVE y el límite es en BYTES, no en
 * caracteres. Por eso todo lo que se cachea aquí sale de jsonAscii_() (solo
 * ASCII: 1 carácter = 1 byte) y, por si llega texto con tildes sin escapar,
 * trocear_() baja el tamaño del trozo a 30.000 caracteres (≤ 90 KB aunque
 * cada carácter pesara 3 bytes). Antes, un trozo de 90.000 caracteres con
 * muchas tildes superaba los 100 KB, el putAll fallaba y el error se
 * tragaba en silencio: la caché "no funcionaba" sin dejar rastro.
 */

/** JSON.stringify con todo carácter no ASCII escapado (\uXXXX): 1 char = 1 byte. */
function jsonAscii_(obj) {
  return JSON.stringify(obj).replace(/[\u007f-￿]/g, function(c) {
    return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
  });
}

function trocear_(texto) {
  var tam = /[^\x00-\x7f]/.test(texto) ? 30000 : CACHE_TROZO;
  var trozos = [];
  for (var i = 0; i < texto.length; i += tam) trozos.push(texto.substr(i, tam));
  return trozos;
}

function mtdCacheLeer_(clave) {
  var cache = CacheService.getScriptCache();
  var meta  = cache.get('meta::' + clave);
  if (!meta) return null;
  var n = Number(meta), claves = [];
  for (var i = 0; i < n; i++) claves.push('t::' + clave + '::' + i);
  var trozos = cache.getAll(claves), partes = [];
  for (var j = 0; j < n; j++) {
    var t = trozos['t::' + clave + '::' + j];
    if (!t) return null;   // trozo vencido: se vuelve a leer la hoja
    partes.push(t);
  }
  return partes.join('');
}

/** Devuelve true si quedó guardado. Avisa en el log cuando NO se pudo (antes era silencioso). */
function mtdCacheGuardar_(clave, texto, segundos) {
  var trozos = trocear_(texto);
  if (trozos.length > CACHE_MAX_TROZOS) {
    Logger.log('AVISO caché: ' + clave + ' pesa ' + Math.round(texto.length / 1024) + ' KB (' +
               trozos.length + ' trozos > tope ' + CACHE_MAX_TROZOS + '); NO se cachea y cada ' +
               'llamada volverá a leer la hoja.');
    return false;
  }
  var mapa = {};
  for (var i = 0; i < trozos.length; i++) mapa['t::' + clave + '::' + i] = trozos[i];
  mapa['meta::' + clave] = String(trozos.length);
  try {
    CacheService.getScriptCache().putAll(mapa, segundos);
    return true;
  } catch (e) {
    Logger.log('AVISO caché: putAll falló para ' + clave + ': ' + e.message);
    return false;
  }
}

/** Borra una clave cacheada por trozos (meta + todos sus trozos). */
function mtdCacheQuitar_(clave) {
  var cache = CacheService.getScriptCache(), claves = ['meta::' + clave];
  var meta = cache.get('meta::' + clave);
  if (meta) for (var i = 0; i < Number(meta); i++) claves.push('t::' + clave + '::' + i);
  cache.removeAll(claves);
}

/**
 * Patrón único de endpoint cacheado:
 *   1. si hay caché y no se pidió `forzar`, la devuelve;
 *   2. si no, toma un candado para que N usuarios con la caché fría no lean
 *      la misma hoja N veces a la vez (el que llega segundo encuentra la
 *      caché ya llena);
 *   3. `construir()` devuelve {texto, cachear}: un resultado vacío o con error
 *      NO se cachea (antes una hoja a medio refrescar dejaba el tablero vacío
 *      30 minutos).
 * `forzar` es lo que hace que el botón "Actualizar" funcione de verdad.
 */
function conCache_(clave, segundos, construir, forzar) {
  if (!forzar) {
    var hit = mtdCacheLeer_(clave);
    if (hit) return hit;
  }
  var lock = LockService.getScriptLock(), tengo = false;
  try { tengo = lock.tryLock(20000); } catch (e) { /* seguimos sin candado */ }
  try {
    if (!forzar && tengo) {
      var hit2 = mtdCacheLeer_(clave);
      if (hit2) return hit2;
    }
    var r = construir();
    if (r.cachear) mtdCacheGuardar_(clave, r.texto, segundos);
    return r.texto;
  } finally {
    if (tengo) { try { lock.releaseLock(); } catch (e2) { /* nada */ } }
  }
}

/* ============================================================
 * VENTAS MTD — pestaña 1 del dashboard
 * ============================================================
 * Lee TRES hojas del MISMO archivo (SPREADSHEET_ID_MTD) en UNA sola
 * ejecución y UN solo payload compacto (antes eran 2 llamadas, 2 aperturas
 * del libro y 2 lecturas completas):
 *   'CUMPLIMIENTO'        → KPIs, tabla de clientes y de KAM (1 fila por cliente)
 *   'PLANTILLA'           → tabla de productos (cliente × EAN; se consolida
 *                           por cliente × nombre de producto)
 *   'Historico de ventas' → serie mensual por cliente (real y plan) desde 2022
 *
 * Todo el cruce por KAM / canal / cliente ocurre en el navegador a través del
 * SAP ID, que es la clave común de las tres hojas.
 *
 * SIGNIFICADO DE LAS COLUMNAS (verificado contra los datos, sep-2026):
 *   'Real (LOCAL)' / 'Real'  venta del mes de CORTE (ver periodo abajo)
 *   'Real -1'                el MISMO MES DEL AÑO ANTERIOR (no el mes anterior):
 *                            PLANTILLA 'Real -1' de un cliente = Histórico de
 *                            ese cliente en el mismo mes del año previo.
 *   'Current Plan (LOCAL)'   meta del mes
 *   'Real (año)'             acumulado enero → mes de corte
 *   La hoja CUMPLIMIENTO trae también 'Real -1 (LOCAL)', que NO coincide con
 *   el Real -1 de PLANTILLA/Histórico (otra base); por eso no se usa.
 *
 * PERIODO: CUMPLIMIENTO tiene una celda de control ("cambie el número para
 * cambiar el mes", p. ej. O1 = 1-sep-2026, P1 = 9). El informe es del mes
 * CERRADO que indica esa celda, no del mes en curso: se devuelve en
 * meta.periodo para que la UI no use el reloj del navegador.
 *
 * Los encabezados se buscan por nombre exacto y, si no aparece, por
 * fragmentos (no por posición). Si falta una columna OBLIGATORIA el error lo
 * dice (antes devolvía 0 en silencio y quedaba cacheado).
 *
 * Caché: 'ventas_mtd_v2' 30 min; calentarCache() la mantiene tibia (trigger
 * de 15 min, ver instalarTriggerCache()). "Actualizar" en la UI pasa
 * forzar=true y se salta la caché.
 */

var SPREADSHEET_ID_MTD = '1hViwAW2zhLky4bg8uOsmlmeHa9AnLm5KtcWRvSrzoGw';

var HOJA_MTD_CUMPLIMIENTO = 'CUMPLIMIENTO';
var HOJA_MTD_PLANTILLA    = 'PLANTILLA';
var HOJA_MTD_HISTORICO    = 'Historico de ventas';

var CACHE_MTD_CLAVE    = 'ventas_mtd_v2';
var CACHE_MTD_SEGUNDOS = 1800;   // 30 min

/** Minúsculas, sin tildes y con espacios colapsados, para comparar encabezados. */
function mtdNorm_(v) {
  var s = String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, ' ');
  try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (err) { /* sin normalize */ }
  return s;
}

/**
 * Índice del primer encabezado que contiene TODOS los fragmentos de `incluye`
 * y ninguno de `excluye`. Devuelve null si no hay ninguno (nunca lanza error).
 * Más estricto que buscarCol_: distingue 'Real (LOCAL)' de 'Real -1 (LOCAL)'.
 */
function mtdCol_(headers, incluye, excluye) {
  excluye = excluye || [];
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i];
    if (!h) continue;
    var ok = true;
    for (var a = 0; a < incluye.length; a++) {
      if (h.indexOf(mtdNorm_(incluye[a])) === -1) { ok = false; break; }
    }
    if (!ok) continue;
    for (var b = 0; b < excluye.length; b++) {
      if (h.indexOf(mtdNorm_(excluye[b])) !== -1) { ok = false; break; }
    }
    if (ok) return i;
  }
  return null;
}

/** Primera alternativa de columna que exista: mtdColAlt_(h, [[inc, exc], ...]). */
function mtdColAlt_(headers, alternativas) {
  for (var i = 0; i < alternativas.length; i++) {
    var idx = mtdCol_(headers, alternativas[i][0], alternativas[i][1]);
    if (idx !== null) return idx;
  }
  return null;
}

/**
 * Coincidencia EXACTA (normalizada) con alguno de `nombres`, en orden de
 * preferencia; si ninguno aparece, cae a `respaldo` (mtdColAlt_). Evita que
 * 'real' agarre 'Real #' o 'cumpl' agarre '% Cumpl Año' por orden de columnas.
 */
function mtdColEx_(headers, nombres, respaldo) {
  for (var n = 0; n < nombres.length; n++) {
    var buscado = mtdNorm_(nombres[n]);
    for (var i = 0; i < headers.length; i++) if (headers[i] === buscado) return i;
  }
  return respaldo ? mtdColAlt_(headers, respaldo) : null;
}

/** Lanza un error claro si falta una columna obligatoria. */
function mtdExigir_(col, claves, nombreHoja, headersRaw) {
  var faltan = claves.filter(function(k) { return col[k] === null || col[k] === undefined; });
  if (faltan.length) {
    throw new Error("En la hoja '" + nombreHoja + "' no encontré la(s) columna(s): " + faltan.join(', ') +
                    ". Encabezados: " + headersRaw.map(function(h) { return String(h); })
                                                  .filter(String).join(' | '));
  }
}

/**
 * Valor numérico de una celda (0 si no es número). Usa parseNum_ existente,
 * salvo en un caso que parseNum_ no cubre: importes en texto con puntos de
 * miles al estilo colombiano ("3.100.000.000" o "1.234.567,89"), donde
 * parseFloat leería 3,1. El patrón exige grupos de exactamente 3 dígitos,
 * así que un decimal normal como "3.1" sigue yendo por parseNum_.
 */
function mtdNum_(row, idx) {
  if (idx === null || idx === undefined) return 0;
  var v = row[idx];
  if (typeof v === 'string') {
    var s = v.replace(/[$\s]/g, '');
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
      var n2 = parseFloat(s.replace(/\./g, '').replace(',', '.'));
      return isNaN(n2) ? 0 : n2;
    }
  }
  var n = parseNum_(v);
  return isNaN(n) ? 0 : n;
}

function mtdTexto_(row, idx) {
  if (idx === null || idx === undefined) return '';
  return String(row[idx] == null ? '' : row[idx]).trim();
}

/** true si la celda es un error de fórmula ("#N/A (Did not find…)", "#REF!", …). */
function mtdEsError_(row, idx) {
  if (idx === null || idx === undefined) return false;
  var v = row[idx];
  return typeof v === 'string' && v.charAt(0) === '#';
}

/** Las filas de totales de la hoja se ignoran: el total se recalcula aquí. */
function mtdEsFilaTotal_(texto) {
  var t = mtdNorm_(texto);
  return t === '' ? false : (t.indexOf('total') === 0 || t.indexOf('gran total') === 0 ||
                             t.indexOf('suma total') === 0);
}

/** Entero redondeado (pesos / unidades): recorta decimales de punto flotante del payload. */
function mtdRed_(n) { return Math.round(n); }

/**
 * {anio, mes} de una celda de fecha, en la ZONA HORARIA DEL LIBRO. Antes se
 * usaban los getters del script (Europe/Madrid) o UTC según la pestaña: un
 * 1-ene a medianoche podía caer en diciembre. Acepta Date, serial de Sheets
 * (número) o texto d/m/aaaa ("1/01/2022").
 */
function mtdFecha_(valor, tz) {
  if (valor instanceof Date) {
    if (isNaN(valor.getTime())) return null;
    return { anio: Number(Utilities.formatDate(valor, tz, 'yyyy')),
             mes:  Number(Utilities.formatDate(valor, tz, 'M')) };
  }
  if (typeof valor === 'number' && valor > 20000 && valor < 80000) {
    var d = new Date(Math.round((valor - 25569) * 86400 * 1000));   // serial → UTC (sin hora)
    return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
  }
  var s = (valor == null ? '' : valor).toString().trim();
  var partes = s.split('/');
  if (partes.length === 3) {
    var anio = parseInt(partes[2], 10), mes = parseInt(partes[1], 10);
    if (isNaN(anio) || isNaN(mes) || mes < 1 || mes > 12) return null;
    return { anio: anio, mes: mes };
  }
  return null;
}

/**
 * Lee un bloque rectangular de una hoja leyendo SOLO las columnas que hacen
 * falta (hasta la última columna mapeada) y no getDataRange(): el histórico
 * mide 25 columnas y solo se usan 9. `resolver(headers)` devuelve el mapa
 * {clave: índice|null}. Devuelve {headersRaw, col, data} (data = filas 2..n).
 */
function mtdLeerBloque_(hoja, resolver) {
  var ultCol = hoja.getLastColumn(), ultFila = hoja.getLastRow();
  if (ultCol < 1 || ultFila < 1) return { headersRaw: [], col: {}, data: [] };
  var headersRaw = hoja.getRange(1, 1, 1, ultCol).getValues()[0];
  var col = resolver(headersRaw.map(mtdNorm_));
  var maxIdx = 0;
  Object.keys(col).forEach(function(k) { if (col[k] !== null && col[k] > maxIdx) maxIdx = col[k]; });
  var data = ultFila > 1 ? hoja.getRange(2, 1, ultFila - 1, maxIdx + 1).getValues() : [];
  return { headersRaw: headersRaw, col: col, data: data };
}

function mtdHoja_(libro, nombre, obligatoria) {
  var hoja = libro.getSheetByName(nombre);
  if (!hoja && obligatoria) {
    throw new Error("No se encontró la hoja '" + nombre + "' en el archivo de Ventas MTD. " +
                    'Hojas disponibles: ' + libro.getSheets().map(function(s) { return s.getName(); }).join(' | '));
  }
  if (!hoja) throw new Error("No existe la hoja '" + nombre + "'.");
  return hoja;
}

/** Clave de cliente común a las tres hojas: SAP ID, o el nombre normalizado si no hay. */
function mtdIdCliente_(sapId, cliente) {
  return sapId ? String(sapId) : ('N:' + mtdNorm_(cliente));
}

/**
 * Periodo del informe a partir de la celda de control de CUMPLIMIENTO: busca
 * la nota "cambie el numero para cambiar el mes" en la fila 1; la celda
 * anterior es el mes (1-12) y la anterior a esa es la fecha (1-sep-2026).
 */
function mtdPeriodoDeControl_(headersRaw, tz) {
  for (var i = 0; i < headersRaw.length; i++) {
    if (mtdNorm_(headersRaw[i]).indexOf('cambie el numero') === -1) continue;
    var f = i >= 2 ? mtdFecha_(headersRaw[i - 2], tz) : null;
    var m = i >= 1 ? Number(headersRaw[i - 1]) : NaN;
    if (f) return { anio: f.anio, mes: f.mes, fuente: 'celda de control de CUMPLIMIENTO' };
    if (m >= 1 && m <= 12) return { anio: null, mes: m, fuente: 'celda de control de CUMPLIMIENTO' };
  }
  return null;
}

/* ---------- Lectura de cada hoja ---------- */

function mtdLeerCumplimiento_(libro, tz) {
  var hoja = mtdHoja_(libro, HOJA_MTD_CUMPLIMIENTO, true);
  var b = mtdLeerBloque_(hoja, function(h) {
    return {
      sapId:    mtdColEx_(h, ['sap id'], [[['sap'], []]]),
      cliente:  mtdColEx_(h, ['cliente'], [[['cliente'], []]]),
      kam:      mtdColEx_(h, ['kam encargado'], [[['kam'], []]]),
      canal:    mtdColEx_(h, ['canal'], [[['canal'], []]]),
      realMes:  mtdColEx_(h, ['real (local)'], [[['real'], ['-1', 'anterior', 'plan', 'ano', 'anio', '#']]]),
      planMes:  mtdColEx_(h, ['current plan (local)'], [[['plan'], ['ano', 'anio', '-1']]]),
      realAnio: mtdColEx_(h, ['real (ano)'], [[['real', 'ano'], ['plan']], [['real', 'anio'], ['plan']]]),
      planAnio: mtdColEx_(h, ['current plan (ano)'], [[['plan', 'ano'], []], [['plan', 'anio'], []]])
    };
  });
  mtdExigir_(b.col, ['cliente', 'realMes', 'planMes'], HOJA_MTD_CUMPLIMIENTO, b.headersRaw);
  var col = b.col;

  var filas = [], ignoradas = 0, conError = [], sumReal = 0;
  for (var i = 0; i < b.data.length; i++) {
    var row = b.data[i];
    var cliente = mtdTexto_(row, col.cliente);
    var sapId   = mtdTexto_(row, col.sapId);
    if (!cliente && !sapId) continue;
    if (mtdEsFilaTotal_(cliente)) { ignoradas++; continue; }

    var error = mtdEsError_(row, col.realMes) || mtdEsError_(row, col.planMes) ||
                mtdEsError_(row, col.realAnio) || mtdEsError_(row, col.planAnio);
    if (error) conError.push(cliente || sapId);

    var realMes = mtdNum_(row, col.realMes);
    sumReal += realMes;
    // El % de cumplimiento NO se toma de la hoja: ahí vale 1 (100 %) cuando el
    // plan está vacío y 0 cuando no hay plan ni venta. Lo calcula el cliente
    // como real/plan solo si plan > 0.
    filas.push({
      id:       mtdIdCliente_(sapId, cliente),
      sapId:    sapId,
      cliente:  cliente,
      kam:      mtdTexto_(row, col.kam)   || 'SIN KAM',
      canal:    mtdTexto_(row, col.canal) || 'SIN CANAL',
      realMes:  mtdRed_(realMes),
      planMes:  mtdRed_(mtdNum_(row, col.planMes)),
      realAnio: mtdRed_(mtdNum_(row, col.realAnio)),
      planAnio: mtdRed_(mtdNum_(row, col.planAnio)),
      // 'interno': fila contable de ISDIN (SAP ID 1, KAM "OTRO"), no es un cliente.
      interno:  sapId === '1' ? 1 : 0,
      error:    error ? 1 : 0
    });
  }

  return {
    filas: filas, sumReal: sumReal, filasTotalIgnoradas: ignoradas, conError: conError,
    periodo: mtdPeriodoDeControl_(b.headersRaw, tz)
  };
}

/**
 * PLANTILLA: una fila por cliente × EAN. Se consolida por cliente × NOMBRE de
 * producto (un mismo producto tiene varios EAN) y se devuelve como arreglos
 * [clienteId, idxProducto, venta, ventaA1, unidades] con el nombre en un
 * diccionario aparte: ~9.800 filas como objetos pesaban ~1 MB.
 */
function mtdLeerProductos_(libro) {
  var hoja = mtdHoja_(libro, HOJA_MTD_PLANTILLA, true);
  var b = mtdLeerBloque_(hoja, function(h) {
    return {
      sapId:    mtdColEx_(h, ['sap id'], [[['sap'], []]]),
      cliente:  mtdColEx_(h, ['cliente'], [[['cliente'], []]]),
      nombre:   mtdColEx_(h, ['product'], [[['product'], ['id']], [['nombre'], []], [['descripci'], []]]),
      // 'Real' (exacto) = importe que concilia con CUMPLIMIENTO; 'Real (LOCAL)'
      // difiere en ~28 filas. 'Real -1' = mismo mes del año anterior.
      venta:    mtdColEx_(h, ['real'], [[['real'], ['-1', 'anterior', 'plan', 'ano', 'anio', 'local', '#']]]),
      ventaA1:  mtdColEx_(h, ['real -1'], [[['real', '-1'], ['plan']], [['anterior'], ['plan']]]),
      unidades: mtdColEx_(h, ['real #'], [[['unidad'], []], [['unit'], []]])
    };
  });
  mtdExigir_(b.col, ['nombre', 'venta'], HOJA_MTD_PLANTILLA, b.headersRaw);
  if (b.col.sapId === null && b.col.cliente === null) {
    throw new Error("En la hoja '" + HOJA_MTD_PLANTILLA + "' no encontré 'SAP ID' ni 'CLIENTE'.");
  }
  var col = b.col;

  var nombres = [], idxNombre = {}, agr = {}, sumVenta = 0, sinNombre = 0;
  for (var i = 0; i < b.data.length; i++) {
    var row = b.data[i];
    var nombre = mtdTexto_(row, col.nombre);
    if (mtdEsFilaTotal_(nombre)) continue;

    var venta = mtdNum_(row, col.venta), ant = mtdNum_(row, col.ventaA1), und = mtdNum_(row, col.unidades);
    if (!venta && !ant && !und) continue;

    var cliente = mtdTexto_(row, col.cliente);
    var id = mtdIdCliente_(mtdTexto_(row, col.sapId), cliente);
    if (!nombre) { nombre = 'SIN PRODUCTO'; sinNombre++; }
    if (idxNombre[nombre] === undefined) { idxNombre[nombre] = nombres.length; nombres.push(nombre); }
    var k = id + '|' + idxNombre[nombre];
    var a = agr[k];
    if (!a) a = agr[k] = [id, idxNombre[nombre], 0, 0, 0];
    a[2] += venta; a[3] += ant; a[4] += und;
    sumVenta += venta;
  }
  var filas = Object.keys(agr).map(function(k) {
    var a = agr[k];
    return [a[0], a[1], mtdRed_(a[2]), mtdRed_(a[3]), mtdRed_(a[4])];
  });
  return { productos: nombres, filas: filas, sumVenta: sumVenta, filasSinNombre: sinNombre };
}

/**
 * Histórico: arreglos [anio, mes, clienteId, real, plan] + diccionario
 * clienteId → [cliente, kam, canal] (último dato conocido de cada cliente).
 * El cruce es por SAP ID (antes por NOMBRE, y el servidor tiraba el SAP ID).
 * Las filas con real = 0 y plan = 0 (p. ej. los meses futuros que la hoja ya
 * trae en blanco) no se envían.
 */
function mtdLeerHistorico_(libro, tz) {
  var hoja = mtdHoja_(libro, HOJA_MTD_HISTORICO, true);
  var b = mtdLeerBloque_(hoja, function(h) {
    return {
      fecha:   mtdColEx_(h, ['fecha'], [[['fecha'], []], [['date'], []]]),
      sapId:   mtdColEx_(h, ['sap id'], [[['sap'], []]]),
      cliente: mtdColEx_(h, ['cliente'], [[['cliente'], []], [['customer'], []]]),
      kam:     mtdColEx_(h, ['kam encargado'], [[['kam'], []]]),
      canal:   mtdColEx_(h, ['canal'], [[['canal'], []], [['channel'], []]]),
      real:    mtdColEx_(h, ['real (local)'], [[['real'], ['plan', 'sell', '-1', '#']]]),
      plan:    mtdColEx_(h, ['current plan (local)'], [[['plan'], ['sell']]])
    };
  });
  mtdExigir_(b.col, ['fecha', 'real', 'plan'], HOJA_MTD_HISTORICO, b.headersRaw);
  if (b.col.sapId === null && b.col.cliente === null) {
    throw new Error("En la hoja '" + HOJA_MTD_HISTORICO + "' no encontré 'SAP ID' ni 'CLIENTE'.");
  }
  var col = b.col;

  var filas = [], clientes = {}, visto = {}, sinFecha = 0, sinCliente = 0;
  var anioMin = null, anioMax = null, ultimo = null;   // ultimo = {anio, mes} con real ≠ 0
  for (var i = 0; i < b.data.length; i++) {
    var row = b.data[i];
    var f = mtdFecha_(col.fecha === null ? null : row[col.fecha], tz);
    if (!f) { sinFecha++; continue; }
    var cliente = mtdTexto_(row, col.cliente);
    var sapId = mtdTexto_(row, col.sapId);
    if ((!cliente && !sapId) || mtdEsFilaTotal_(cliente)) { sinCliente++; continue; }
    var id = mtdIdCliente_(sapId, cliente);

    var real = mtdNum_(row, col.real), plan = mtdNum_(row, col.plan);
    if (anioMin === null || f.anio < anioMin) anioMin = f.anio;
    if (anioMax === null || f.anio > anioMax) anioMax = f.anio;

    var orden = f.anio * 12 + f.mes;
    if (visto[id] === undefined || orden >= visto[id]) {
      visto[id] = orden;
      clientes[id] = [cliente, mtdTexto_(row, col.kam) || 'SIN KAM', mtdTexto_(row, col.canal) || 'SIN CANAL'];
    }
    if (!real && !plan) continue;
    if (real && (ultimo === null || orden > ultimo.anio * 12 + ultimo.mes)) ultimo = { anio: f.anio, mes: f.mes };
    filas.push([f.anio, f.mes, id, mtdRed_(real), mtdRed_(plan)]);
  }
  return { filas: filas, clientes: clientes, anioMin: anioMin, anioMax: anioMax, ultimo: ultimo,
           sinFecha: sinFecha, sinCliente: sinCliente };
}

/** Σ real del histórico en un (anio, mes): sirve para la conciliación de las 3 hojas. */
function mtdSumaHistoricoMes_(filas, anio, mes) {
  var s = 0;
  for (var i = 0; i < filas.length; i++) if (filas[i][0] === anio && filas[i][1] === mes) s += filas[i][3];
  return s;
}

function mtdConstruirCompleto_() {
  var libro = SpreadsheetApp.openById(SPREADSHEET_ID_MTD);   // una sola apertura para las tres hojas
  var tz = libro.getSpreadsheetTimeZone();
  var errores = {}, meta = { versionPayload: 2, zonaHoraria: tz };
  var cumpl = null, prod = null, hist = null;

  try { cumpl = mtdLeerCumplimiento_(libro, tz); } catch (e) { errores.cumplimiento = e.message; Logger.log('MTD cumplimiento: ' + e.message); }
  try { prod  = mtdLeerProductos_(libro);        } catch (e) { errores.plantilla   = e.message; Logger.log('MTD plantilla: ' + e.message); }
  try { hist  = mtdLeerHistorico_(libro, tz);    } catch (e) { errores.historico   = e.message; Logger.log('MTD histórico: ' + e.message); }

  // Periodo: celda de control; si no hay año, el del último mes con venta del histórico.
  var periodo = cumpl && cumpl.periodo;
  if (periodo && !periodo.anio && hist && hist.ultimo) {
    periodo = { anio: hist.ultimo.mes >= periodo.mes ? hist.ultimo.anio : hist.ultimo.anio - 1,
                mes: periodo.mes, fuente: periodo.fuente + ' + año del histórico' };
  }
  if (!periodo && hist && hist.ultimo) {
    periodo = { anio: hist.ultimo.anio, mes: hist.ultimo.mes, fuente: 'último mes con venta del histórico' };
  }

  // Conciliación: las tres hojas deben dar la misma venta del mes de corte.
  var conc = { cumplimiento: cumpl ? mtdRed_(cumpl.sumReal) : null,
               plantilla:    prod  ? mtdRed_(prod.sumVenta) : null,
               historico:    (hist && periodo && periodo.anio) ? mtdSumaHistoricoMes_(hist.filas, periodo.anio, periodo.mes) : null };

  meta.actualizadoEn = new Date().toISOString();   // hora en que se LEYÓ la hoja (no la de la caché)
  meta.periodo = periodo || null;
  meta.errores = errores;
  meta.conciliacion = conc;
  meta.filasTotalIgnoradas = cumpl ? cumpl.filasTotalIgnoradas : 0;
  meta.clientesConError = cumpl ? cumpl.conError : [];
  meta.productosSinNombre = prod ? prod.filasSinNombre : 0;
  meta.historico = hist ? { anioMin: hist.anioMin, anioMax: hist.anioMax, sinFecha: hist.sinFecha,
                            sinCliente: hist.sinCliente, filas: hist.filas.length } : null;

  Logger.log('MTD: clientes=' + (cumpl ? cumpl.filas.length : 'ERR') + ' · producto×cliente=' +
             (prod ? prod.filas.length : 'ERR') + ' · histórico=' + (hist ? hist.filas.length : 'ERR') +
             ' · periodo=' + JSON.stringify(periodo) + ' · conciliación=' + JSON.stringify(conc));

  return {
    v: 2,
    clientes: cumpl ? cumpl.filas : [],
    productos: prod ? prod.productos : [],
    prod: prod ? prod.filas : [],
    hist: hist ? hist.filas : [],
    histClientes: hist ? hist.clientes : {},
    meta: meta
  };
}

/**
 * Todo lo de la primera pestaña en un solo payload (STRING JSON ASCII).
 * `forzar` (botón "Actualizar") se salta la caché de 30 min.
 */
function getVentasMtdCompletoJson(forzar) {
  return conCache_(CACHE_MTD_CLAVE, CACHE_MTD_SEGUNDOS, function() {
    var s = mtdConstruirCompleto_();
    var hayError = Object.keys(s.meta.errores).length > 0;
    return { texto: jsonAscii_(s), cachear: !hayError && s.clientes.length > 0 };
  }, forzar === true);
}

/** Alias de compatibilidad (REST ?accion=getVentasMtdJson): devuelve el payload v2. */
function getVentasMtdJson(forzar) { return getVentasMtdCompletoJson(forzar); }

/** Alias: el histórico viaja dentro del payload único. */
function getHistoricoVentasJson(forzar) { return getVentasMtdCompletoJson(forzar); }

/** Borra la caché de Ventas MTD (útil tras actualizar las hojas). */
function limpiarCacheMtd() {
  [CACHE_MTD_CLAVE, 'ventas_mtd', 'ventas_mtd_historico'].forEach(mtdCacheQuitar_);
  Logger.log('Caché de Ventas MTD limpiada (incluye el histórico).');
  return 'OK';
}

/** Diagnóstico manual desde el editor: resumen + conciliación de las tres hojas. */
function verVentasMtd() {
  var d = JSON.parse(getVentasMtdCompletoJson(true));
  Logger.log('Clientes: ' + d.clientes.length + ' · producto×cliente: ' + d.prod.length +
             ' · histórico: ' + d.hist.length);
  Logger.log('Periodo: ' + JSON.stringify(d.meta.periodo));
  Logger.log('Conciliación (deben ser iguales): ' + JSON.stringify(d.meta.conciliacion));
  Logger.log('Errores: ' + JSON.stringify(d.meta.errores));
  Logger.log('Primera fila cliente: ' + JSON.stringify(d.clientes[0]));
  Logger.log('Tamaño del payload: ' + Math.round(JSON.stringify(d).length / 1024) + ' KB');
}

/* ============================================================
 * SI vs SO — pestaña 3 del dashboard
 * ============================================================
 * Lee la hoja 'Data' del archivo "Carga Looker" (SPREADSHEET_ID_LOOKER):
 * una tabla de hechos plana con columna Type = SI / SO / ST / INV (mismo
 * patrón que usan los 4 campos calculados del Looker original — "Sell In
 * final", "Sell Out final", etc. — que solo resuelven el toggle $/# y dejan
 * el filtro real por Type a cada gráfico/tabla de Looker).
 *
 * Se agrega en el servidor por (mes × cliente × producto) — el grano más
 * fino que necesita esta pestaña — y el cruce por Canal/KAM/BU/Marca
 * ocurre en el navegador sobre ese arreglo, igual que el resto del
 * visor ("tocar un filtro nunca vuelve al servidor").
 *
 * Payload v2 compacto: dos diccionarios (clientes y productos, con sus
 * atributos) + filas como arreglos
 *   [mes, idxCliente, idxProducto, si, siU, so, soU, inv, invU, tieneInv]
 * El cliente las expande a objetos con los mismos nombres de campo que ya
 * usaba (sivsoExpandir_ en JsSIvsSO.html). `tieneInv` = 1 solo si hubo una
 * fila Type=INV: sin eso no se puede distinguir "inventario 0" de "no hay
 * foto de inventario ese mes".
 *
 * Fuera de alcance a propósito: Sell Through (Type=ST, no se usa en esta
 * pestaña) y DDI/"Diferencia INV" — la hoja 'DIAS DE INV' de donde saldría
 * esa fórmula está rota (A1 = texto congelado "#¡REF!"); se agrega cuando
 * se confirme el cálculo real con el equipo.
 */

var SPREADSHEET_ID_LOOKER = '1_eW3f95MgTcwPUH5oyTo1qQbgt-45sf6EgsDYSbylzE';
var HOJA_LOOKER_DATA       = 'Data';
var CACHE_SIVSO_CLAVE      = 'si_vs_so_v2';
var CACHE_SIVSO_SEGUNDOS   = 1800;   // 30 min, igual que Ventas MTD

/** 'YYYY-MM' de una celda de fecha en la zona horaria del libro (ver mtdFecha_). */
function sivsoMes_(valor, tz) {
  var f = mtdFecha_(valor, tz);
  if (!f) return null;
  return f.anio + '-' + (f.mes < 10 ? '0' + f.mes : f.mes);
}

function sivsoLeerDatos_() {
  var libro = SpreadsheetApp.openById(SPREADSHEET_ID_LOOKER);
  var tz = libro.getSpreadsheetTimeZone();
  var hoja  = libro.getSheetByName(HOJA_LOOKER_DATA);
  if (!hoja) {
    throw new Error("No se encontró la hoja '" + HOJA_LOOKER_DATA + "' en el archivo Carga Looker. " +
                    'Hojas disponibles: ' + libro.getSheets().map(function(s) { return s.getName(); }).join(' | '));
  }

  var b = mtdLeerBloque_(hoja, function(h) {
    return {
      fecha:   mtdColEx_(h, ['fecha'], [[['fecha'], []]]),
      sapId:   mtdColEx_(h, ['sap id'], [[['sap', 'id'], []]]),
      prodId:  mtdColEx_(h, ['product id'], [[['product', 'id'], []]]),
      prodNom: mtdColEx_(h, ['product'], [[['product'], ['id']]]),
      real:    mtdColEx_(h, ['real (local)'], [[['real', 'local'], ['-1']]]),
      realN:   mtdColEx_(h, ['real #'], [[['real', '#'], []]]),
      tipo:    mtdColEx_(h, ['type'], [[['type'], []]]),
      cliente: mtdColEx_(h, ['cliente'], [[['cliente'], []]]),
      kam:     mtdColEx_(h, ['kam encargado'], [[['kam'], []]]),
      channel: mtdColEx_(h, ['channel'], [[['channel'], []]]),
      bu:      mtdColEx_(h, ['bu'], [[['bu'], []]]),
      brand:   mtdColEx_(h, ['brand'], [[['brand'], []]])
    };
  });
  mtdExigir_(b.col, ['fecha', 'sapId', 'prodId', 'real', 'tipo'], HOJA_LOOKER_DATA, b.headersRaw);
  var col = b.col;

  var cliIdx = {}, clientes = [], prodIdx = {}, productos = [];
  var acc = {}, filasOrigen = 0, sinFecha = 0, sinTipo = 0;
  for (var i = 0; i < b.data.length; i++) {
    var row = b.data[i];
    var mes  = sivsoMes_(row[col.fecha], tz);
    var tipo = mtdTexto_(row, col.tipo).toUpperCase();
    if (!mes) { sinFecha++; continue; }
    // Sell Through (Type=ST) se ignora a propósito: esta pestaña no lo usa.
    if (tipo !== 'SI' && tipo !== 'SO' && tipo !== 'INV') { sinTipo++; continue; }
    filasOrigen++;

    var sapId = mtdTexto_(row, col.sapId), prodId = mtdTexto_(row, col.prodId);
    // Atributos descriptivos: el primero que aparece de cada cliente / producto.
    if (cliIdx[sapId] === undefined) {
      cliIdx[sapId] = clientes.length;
      clientes.push([sapId, mtdTexto_(row, col.cliente), mtdTexto_(row, col.kam), mtdTexto_(row, col.channel)]);
    }
    if (prodIdx[prodId] === undefined) {
      prodIdx[prodId] = productos.length;
      productos.push([prodId, mtdTexto_(row, col.prodNom), mtdTexto_(row, col.bu).trim(), mtdTexto_(row, col.brand)]);
    }
    var key = mes + '|' + cliIdx[sapId] + '|' + prodIdx[prodId];
    var f = acc[key];
    if (!f) f = acc[key] = [mes, cliIdx[sapId], prodIdx[prodId], 0, 0, 0, 0, 0, 0, 0];
    var peso = mtdNum_(row, col.real), unidades = mtdNum_(row, col.realN);
    if (tipo === 'SI')      { f[3] += peso; f[4] += unidades; }
    else if (tipo === 'SO') { f[5] += peso; f[6] += unidades; }
    else                    { f[7] += peso; f[8] += unidades; f[9] = 1; }
  }

  var filas = Object.keys(acc).map(function(k) {
    var f = acc[k];
    return [f[0], f[1], f[2], mtdRed_(f[3]), mtdRed_(f[4]), mtdRed_(f[5]), mtdRed_(f[6]),
            mtdRed_(f[7]), mtdRed_(f[8]), f[9]];
  });
  return { filas: filas, clientes: clientes, productos: productos,
           meta: { totalFilasOrigen: filasOrigen, filasSinFecha: sinFecha, filasTipoIgnorado: sinTipo, zonaHoraria: tz } };
}

/**
 * Datos agregados de SI vs SO (mes × cliente × producto). Devuelve un STRING
 * JSON ASCII, igual que el resto de endpoints, con la caché de 30 min de
 * conCache_ (`forzar` = botón "Actualizar").
 */
function getSIvsSOJson(forzar) {
  return conCache_(CACHE_SIVSO_CLAVE, CACHE_SIVSO_SEGUNDOS, function() {
    var leido = sivsoLeerDatos_();
    var texto = jsonAscii_({
      v: 2,
      clientes: leido.clientes,
      productos: leido.productos,
      filas: leido.filas,
      meta: {
        actualizadoEn: new Date().toISOString(),
        totalFilas:    leido.filas.length,
        hoja:          HOJA_LOOKER_DATA,
        archivo:       SPREADSHEET_ID_LOOKER,
        origen:        leido.meta
      }
    });
    return { texto: texto, cachear: leido.filas.length > 0 };
  }, forzar === true);
}

/** Borra la caché de SI vs SO (útil tras actualizar la hoja Data). */
function limpiarCacheSIvsSO() {
  [CACHE_SIVSO_CLAVE, 'si_vs_so'].forEach(mtdCacheQuitar_);
  Logger.log('Caché de SI vs SO limpiada.');
  return 'OK';
}

/** Diagnóstico manual desde el editor. */
function verSIvsSO() {
  var d = JSON.parse(getSIvsSOJson(true));
  Logger.log('Filas agregadas: ' + d.meta.totalFilas + ' · clientes: ' + d.clientes.length +
             ' · productos: ' + d.productos.length + ' · origen: ' + JSON.stringify(d.meta.origen));
  Logger.log('Primera fila: ' + JSON.stringify(d.filas[0]));
}

/* ============================================================
 * Calentamiento de caché (para que el primer usuario no espere)
 * ============================================================
 * Con la caché fría cada pestaña lee sus hojas completas (varios segundos).
 * calentarCache() las llena de antemano; instalarTriggerCache() la programa
 * cada 15 min (la caché dura 30). Se instala UNA vez, desde el editor de
 * Apps Script (clasp push no instala triggers). quitarTriggerCache() lo retira.
 */

function calentarCache() {
  var pasos = [
    ['Ventas MTD', function() { return getVentasMtdCompletoJson(true); }],
    ['SI vs SO',   function() { return getSIvsSOJson(true); }],
    // Las del mapa duran 6 h: solo se llenan si faltan (no se fuerzan cada 15 min).
    ['Puntos',        function() { return getPuntosJson(false); }],
    ['Bricks',        function() { return getBricksJson(false); }],
    ['Asignaciones',  function() { return getAsignacionesJson(false); }]
  ];
  pasos.forEach(function(p) {
    var t0 = Date.now();
    try {
      var n = p[1]().length;
      Logger.log(p[0] + ': OK · ' + Math.round(n / 1024) + ' KB · ' + (Date.now() - t0) + ' ms');
    } catch (e) {
      Logger.log(p[0] + ': ERROR · ' + e.message);
    }
  });
}

function instalarTriggerCache() {
  quitarTriggerCache();
  ScriptApp.newTrigger('calentarCache').timeBased().everyMinutes(15).create();
  Logger.log('Trigger instalado: calentarCache cada 15 minutos.');
}

function quitarTriggerCache() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'calentarCache') ScriptApp.deleteTrigger(t);
  });
}
