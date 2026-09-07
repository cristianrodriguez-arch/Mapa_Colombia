/**
 * ============================================================
 * VISOR PDV + BRICKS + SELL OUT — Backend de la Web App
 * ============================================================
 * Fuente de datos (un solo archivo, se abre por ID):
 *   • 'Bricks'                     -> polígonos GeoJSON de las zonas
 *   • 'CO_Puntos_Maestro clientes' -> maestro de PDV (Nº Oficina Farmacia,
 *                                     Potencial Cliente, coordenadas)
 *   • 'Sell Out 2026'              -> ventas: Fecha | POS_ID | ISDIN_PDV_DESC |
 *                                     BU | Units | Amount
 *
 * El cruce entre ventas y maestro es POS_ID <-> 'Nº Oficina Farmacia'.
 *
 * Endpoints (devuelven STRINGS JSON; el cliente hace JSON.parse):
 *   getBricksJson() · getPuntosJson() · getVentasJson() · getDiagnosticoJson()
 */

var NOMBRE_HOJA_PUNTOS = 'CO_Puntos_Maestro clientes';
var VISOR_HOJA_BRICKS  = 'Bricks';
var NOMBRE_HOJA_VENTAS = 'Sell Out 2026';

var SPREADSHEET_ID = '1fILFlz4cO4mmW-oOnhTuewCicoWJ8bzFUUAN30GaewI';

function abrirHoja_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('Visor PDV + Bricks Colombia')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ============================================================
 * Utilidades compartidas
 * ============================================================ */

/** Convierte una celda a número. Tolera coma decimal, miles y espacios. */
function parseNumero_(valor) {
  if (valor === null || valor === undefined || valor === '') return NaN;
  if (typeof valor === 'number') return valor;

  var s = valor.toString().trim().replace(/\s+/g, '');
  if (s === '') return NaN;

  var tieneComa = s.indexOf(',') !== -1;
  var tienePunto = s.indexOf('.') !== -1;

  if (tieneComa && tienePunto) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(/,/g, '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (tieneComa) {
    var partes = s.split(',');
    s = partes.shift() + '.' + partes.join('');
  }

  var n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}

function parseCoord_(valor) { return parseNumero_(valor); }

/** Normaliza POS_ID para el cruce: mayúsculas, sin espacios. */
function normalizarPos_(valor) {
  if (valor === null || valor === undefined) return '';
  return valor.toString().trim().toUpperCase().replace(/\s+/g, '');
}

/** Clave de mes 'YYYY-MM'. Tolera Date, d/m/yyyy y yyyy-mm-dd. */
function mesDe_(valor) {
  if (valor === null || valor === undefined || valor === '') return '';

  var d = null;
  if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor.getTime())) {
    d = valor;
  } else {
    var s = valor.toString().trim();
    var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) {
      d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    } else {
      m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
      if (m) d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
  }
  if (!d || isNaN(d.getTime())) return '';

  var mes = d.getMonth() + 1;
  return d.getFullYear() + '-' + (mes < 10 ? '0' + mes : '' + mes);
}

/** Índice de la primera columna cuyo encabezado contenga alguno de los fragmentos. */
function buscarCol_(headers, fragmentos) {
  for (var f = 0; f < fragmentos.length; f++) {
    for (var i = 0; i < headers.length; i++) {
      if (headers[i].indexOf(fragmentos[f]) !== -1) return i;
    }
  }
  return -1;
}

/**
 * Devuelve una geometría GeoJSON pura (Polygon/MultiPolygon) desde cualquier
 * variante: Geometry, Feature, FeatureCollection o arreglo suelto de coordenadas.
 */
function normalizarGeometria_(obj) {
  if (!obj || typeof obj !== 'object') return null;

  if (obj.type === 'FeatureCollection' && obj.features && obj.features.length) {
    var geoms = [];
    for (var i = 0; i < obj.features.length; i++) {
      var g = normalizarGeometria_(obj.features[i]);
      if (!g) continue;
      if (g.type === 'Polygon') geoms.push(g.coordinates);
      else if (g.type === 'MultiPolygon') geoms = geoms.concat(g.coordinates);
    }
    if (geoms.length === 0) return null;
    return geoms.length === 1
      ? { type: 'Polygon', coordinates: geoms[0] }
      : { type: 'MultiPolygon', coordinates: geoms };
  }

  if (obj.type === 'Feature') return normalizarGeometria_(obj.geometry);

  if (obj.type === 'Polygon' || obj.type === 'MultiPolygon') {
    if (!obj.coordinates || !obj.coordinates.length) return null;
    return { type: obj.type, coordinates: obj.coordinates };
  }

  // Exportadores que guardan solo el arreglo de coordenadas, sin 'type'
  if (Object.prototype.toString.call(obj) === '[object Array]' && obj.length) {
    return { type: 'Polygon', coordinates: obj };
  }

  return null;
}

/* ============================================================
 * Endpoint: Bricks
 * ============================================================ */
function getBricksJson() {
  var sheet = abrirHoja_().getSheetByName(VISOR_HOJA_BRICKS);
  if (!sheet) {
    throw new Error("No se encontró la pestaña '" + VISOR_HOJA_BRICKS +
                    "'. Pestañas disponibles: " + listarPestanas_().join(' | '));
  }

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return JSON.stringify({ bricks: [], stats: { filas: 0, conGeometria: 0, sinGeometria: 0, erroresMuestra: [] } });
  }

  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });

  // Detección flexible: tolera 'brick_id', 'brick id', 'geojson', 'geometria', etc.
  var iId     = buscarCol_(headers, ['brick_id', 'brick id', 'brickid', 'id_brick']);
  var iGeo    = buscarCol_(headers, ['geometria_geojson', 'geometría_geojson', 'geojson', 'geometria', 'geometría', 'polygon', 'poligono']);
  var iNombre = buscarCol_(headers, ['nombre_brick', 'nombre brick']);
  var iNom2   = buscarCol_(headers, ['nombre']);
  var iZona   = buscarCol_(headers, ['zona']);
  var iCiudad = buscarCol_(headers, ['ciudad']);
  var iDpto   = buscarCol_(headers, ['departamento', 'depto']);

  if (iId === -1 || iGeo === -1) {
    throw new Error("En la hoja '" + VISOR_HOJA_BRICKS + "' no encontré las columnas de ID y geometría.\n" +
                    "Encabezados leídos: " + headers.join(' | '));
  }

  var bricks = [];
  var conGeometria = 0, sinGeometria = 0;
  var erroresMuestra = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var brickId = row[iId];
    if (!brickId || brickId.toString().trim() === '') continue;

    var geometry = null;
    var raw = row[iGeo];
    if (raw !== null && raw !== undefined && raw.toString().trim() !== '') {
      try {
        geometry = normalizarGeometria_(JSON.parse(raw.toString()));
      } catch (e) {
        geometry = null;
        if (erroresMuestra.length < 3) {
          erroresMuestra.push(brickId + ' -> ' + raw.toString().substring(0, 60));
        }
      }
    }
    if (geometry) conGeometria++; else sinGeometria++;

    bricks.push({
      brickId: brickId.toString().trim(),
      nombre: iNom2 !== -1 ? String(row[iNom2]) : '',
      zona: iZona !== -1 ? String(row[iZona]) : '',
      ciudad: iCiudad !== -1 ? String(row[iCiudad]) : '',
      departamento: iDpto !== -1 ? String(row[iDpto]) : '',
      nombreBrick: iNombre !== -1 ? String(row[iNombre]) : '',
      geometry: geometry
    });
  }

  return JSON.stringify({
    bricks: bricks,
    stats: {
      filas: bricks.length,
      conGeometria: conGeometria,
      sinGeometria: sinGeometria,
      erroresMuestra: erroresMuestra
    }
  });
}

/* ============================================================
 * Endpoint: Puntos de venta (maestro)
 * ============================================================ */
function getPuntosJson() {
  var sheet = abrirHoja_().getSheetByName(NOMBRE_HOJA_PUNTOS);
  if (!sheet) {
    throw new Error("No se encontró la pestaña '" + NOMBRE_HOJA_PUNTOS +
                    "'. Pestañas disponibles: " + listarPestanas_().join(' | '));
  }

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return JSON.stringify({ puntos: [], stats: { filas: 0, conCoordenada: 0, sinCoordenada: 0, conPosId: 0 } });
  }

  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });

  var idIdx        = buscarCol_(headers, ['id cuenta']);
  var idSapIdx     = buscarCol_(headers, ['id cliente sap']);
  var nameIdx      = buscarCol_(headers, ['nombre de la cuenta']);
  var grupoIdx     = buscarCol_(headers, ['grupo de compras']);
  var channelIdx   = buscarCol_(headers, ['channel']);
  var regionIdx    = buscarCol_(headers, ['región', 'region']);
  var poblacionIdx = buscarCol_(headers, ['población', 'poblacion']);
  var calleIdx     = buscarCol_(headers, ['calle']);
  var numeroIdx    = buscarCol_(headers, ['número/piso', 'numero/piso']);
  var brickCrmIdx  = buscarCol_(headers, ['brick ubicación', 'brick ubicacion']);
  var latIdx       = buscarCol_(headers, ['latitud']);
  var lngIdx       = buscarCol_(headers, ['longitud']);
  var posIdIdx     = buscarCol_(headers, ['oficina farmacia', 'oficina de farmacia']);
  var potencialIdx = buscarCol_(headers, ['potencial cliente', 'potencial']);
  var afinidadIdx  = buscarCol_(headers, ['afinidad']);
  var tipoRegIdx   = buscarCol_(headers, ['tipo de registro']);

  if (latIdx === -1 || lngIdx === -1) {
    throw new Error("No encontré columnas 'Latitud' y 'Longitud' en '" + NOMBRE_HOJA_PUNTOS + "'.");
  }

  var puntos = [];
  var filas = 0, sinCoordenada = 0, conPosId = 0;

  function texto_(row, i) {
    return (i !== -1 && row[i] !== null && row[i] !== undefined) ? row[i].toString().trim() : '';
  }

  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    if (texto_(row, idIdx) === '' && texto_(row, nameIdx) === '') continue;
    filas++;

    var lat = parseNumero_(row[latIdx]);
    var lng = parseNumero_(row[lngIdx]);

    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0) ||
        lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      sinCoordenada++;
      continue;
    }

    var posId = normalizarPos_(texto_(row, posIdIdx));
    if (posId !== '') conPosId++;

    var calle = texto_(row, calleIdx);
    var numero = texto_(row, numeroIdx);

    puntos.push({
      id: texto_(row, idIdx),
      idSap: texto_(row, idSapIdx),
      posId: posId,
      name: texto_(row, nameIdx) || 'Sin Nombre',
      lat: lat,
      lng: lng,
      grupo: texto_(row, grupoIdx) || 'Sin Grupo',
      channel: texto_(row, channelIdx) || 'Sin Canal',
      region: texto_(row, regionIdx) || 'Sin Región',
      poblacion: texto_(row, poblacionIdx) || 'Sin Población',
      potencial: texto_(row, potencialIdx) || 'Sin Potencial',
      afinidad: texto_(row, afinidadIdx),
      tipoRegistro: texto_(row, tipoRegIdx),
      direccion: [calle, numero].filter(function(x) { return x; }).join(' ') || 'Sin Dirección',
      brickCrm: texto_(row, brickCrmIdx)
    });
  }

  return JSON.stringify({
    puntos: puntos,
    stats: {
      filas: filas,
      conCoordenada: puntos.length,
      sinCoordenada: sinCoordenada,
      conPosId: conPosId,
      columnaPosIdDetectada: posIdIdx !== -1 ? String(data[0][posIdIdx]) : '(no encontrada)'
    }
  });
}

/* ============================================================
 * Endpoint: Sell Out agregado por POS_ID × mes
 * ============================================================ */
function getVentasJson() {
  var sheet = abrirHoja_().getSheetByName(NOMBRE_HOJA_VENTAS);
  if (!sheet) {
    throw new Error("No se encontró la pestaña '" + NOMBRE_HOJA_VENTAS +
                    "'. Pestañas disponibles: " + listarPestanas_().join(' | '));
  }

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return JSON.stringify({ meses: [], ventas: {}, stats: { filas: 0, ignoradas: 0, posUnicos: 0 } });
  }

  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });

  var fechaIdx  = buscarCol_(headers, ['fecha', 'date']);
  var posIdx    = buscarCol_(headers, ['pos_id', 'pos id']);
  var buIdx     = buscarCol_(headers, ['bu']);
  var unitsIdx  = buscarCol_(headers, ['units', 'unidades']);
  var amountIdx = buscarCol_(headers, ['amount', 'importe', 'venta']);

  if (fechaIdx === -1 || posIdx === -1 || amountIdx === -1) {
    throw new Error("En '" + NOMBRE_HOJA_VENTAS + "' faltan columnas obligatorias (Fecha, POS_ID, Amount).\n" +
                    "Encabezados leídos: " + headers.join(' | '));
  }

  var ventas = {}, mesesSet = {}, filas = 0, ignoradas = 0;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    var pos = normalizarPos_(row[posIdx]);
    if (pos === '') continue;

    var mes = mesDe_(row[fechaIdx]);
    if (mes === '') { ignoradas++; continue; }

    var a = parseNumero_(row[amountIdx]); if (isNaN(a)) a = 0;
    var u = unitsIdx !== -1 ? parseNumero_(row[unitsIdx]) : NaN; if (isNaN(u)) u = 0;

    filas++;
    mesesSet[mes] = 1;

    var v = ventas[pos];
    if (!v) v = ventas[pos] = { m: {}, bu: {} };

    var slot = v.m[mes];
    if (!slot) slot = v.m[mes] = { u: 0, a: 0 };
    slot.u += u;
    slot.a += a;

    if (buIdx !== -1) {
      var b = (row[buIdx] === null || row[buIdx] === undefined) ? '' : row[buIdx].toString().trim();
      if (b !== '') v.bu[b] = (v.bu[b] || 0) + a;
    }
  }

  return JSON.stringify({
    meses: Object.keys(mesesSet).sort(),
    ventas: ventas,
    stats: { filas: filas, ignoradas: ignoradas, posUnicos: Object.keys(ventas).length }
  });
}

/* ============================================================
 * Endpoint: Diagnóstico
 * ============================================================
 * Responde tres preguntas: ¿existen las pestañas?, ¿hay geometría legible?,
 * ¿cuántos PDV cruzan con Sell Out?
 */
function getDiagnosticoJson() {
  var ss = abrirHoja_();
  var d = { pestanas: listarPestanas_(), bricks: {}, puntos: {}, ventas: {}, cruce: {} };

  // --- Bricks
  try {
    var hb = ss.getSheetByName(VISOR_HOJA_BRICKS);
    if (!hb) {
      d.bricks.error = "La pestaña '" + VISOR_HOJA_BRICKS + "' no existe";
    } else {
      var db = hb.getDataRange().getValues();
      d.bricks.encabezados = db.length ? db[0].map(String) : [];
      var pb = JSON.parse(getBricksJson());
      d.bricks.total = pb.bricks.length;
      d.bricks.conGeometria = pb.stats.conGeometria;
      d.bricks.sinGeometria = pb.stats.sinGeometria;
      d.bricks.erroresMuestra = pb.stats.erroresMuestra;
      var ej = null;
      for (var i = 0; i < pb.bricks.length; i++) {
        if (pb.bricks[i].geometry) { ej = pb.bricks[i]; break; }
      }
      d.bricks.ejemplo = ej ? {
        brickId: ej.brickId,
        tipo: ej.geometry.type,
        primerVertice: ej.geometry.type === 'Polygon'
          ? ej.geometry.coordinates[0][0]
          : ej.geometry.coordinates[0][0][0]
      } : null;
    }
  } catch (e) { d.bricks.error = e.message; }

  // --- Puntos
  var puntos = [];
  try {
    var pp = JSON.parse(getPuntosJson());
    puntos = pp.puntos;
    d.puntos = pp.stats;
    d.puntos.muestraPosId = puntos.filter(function(p) { return p.posId; })
                                  .slice(0, 5).map(function(p) { return p.posId; });
  } catch (e) { d.puntos.error = e.message; }

  // --- Ventas
  var ventas = {};
  try {
    var pv = JSON.parse(getVentasJson());
    ventas = pv.ventas;
    d.ventas = pv.stats;
    d.ventas.meses = pv.meses;
    d.ventas.muestraPosId = Object.keys(ventas).slice(0, 5);
  } catch (e) { d.ventas.error = e.message; }

  // --- Cruce
  var cruzan = 0, sinPos = 0, noEncontrados = [];
  puntos.forEach(function(p) {
    if (!p.posId) { sinPos++; return; }
    if (ventas[p.posId]) cruzan++;
    else if (noEncontrados.length < 5) noEncontrados.push(p.posId);
  });
  d.cruce = {
    pdvTotales: puntos.length,
    pdvSinPosId: sinPos,
    pdvQueCruzan: cruzan,
    porcentaje: puntos.length ? Math.round(100 * cruzan / puntos.length) + '%' : '0%',
    muestraNoEncontrados: noEncontrados
  };

  return JSON.stringify(d);
}

function listarPestanas_() {
  return abrirHoja_().getSheets().map(function(s) { return s.getName(); });
}

/** Ejecuta el diagnóstico desde el editor de Apps Script (resultado en el Registro). */
function verDiagnostico() {
  Logger.log(getDiagnosticoJson());
}