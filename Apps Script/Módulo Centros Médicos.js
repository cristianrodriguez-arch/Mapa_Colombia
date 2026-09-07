/****************************************************
 * BUSCADOR DE CENTROS MÉDICOS
 *
 * Dado País + Dirección, intenta identificar el nombre del centro médico /
 * consultorio que existe en esa dirección. No hay ninguna lista propia de
 * centros médicos en el proyecto, así que la única fuente posible es Google:
 *   1) Geocoding API resuelve "Dirección, País" (el país tal cual lo
 *      escribió el usuario, sin fijar uno por defecto — para eso está la
 *      columna País) a una coordenada.
 *   2) Places API (Nearby Search) busca, alrededor de esa coordenada y en un
 *      radio corto, negocios de tipo salud (hospital/médico/odontólogo/
 *      fisioterapeuta) y se queda con el más cercano al punto geocodificado.
 * Si falta país o dirección, si Google no geocodifica, o si no hay ningún
 * lugar de salud dentro del radio, la celda se deja vacía — mejor vacío que
 * un dato inventado.
 *
 * Requiere que la "Places API" (legacy, no "Places API (New)") esté
 * habilitada en el mismo proyecto de Google Cloud que la
 * GOOGLE_MAPS_API_KEY: es una API distinta a la de Geocoding, con su propio
 * costo por búsqueda (más caro que un geocode). Como una fila puede repetir
 * la misma dirección, se cachea el resultado dentro de la misma corrida para
 * no pagar dos veces por la misma dirección.
 *
 * Una fila que quedó vacía (sin resultado) no se distingue de una fila que
 * nunca se ha procesado — no hay columna de estado, tal como se pidió — así
 * que volver a ejecutar esto reintenta (y vuelve a cobrar) esas filas.
 *
 * Reusa de Módulo Geocodificación.js: obtenerApiKey_, fetchAllGeocode_,
 * normalizarHeader_, normalizarTexto_, distanciaHaversineMetros_,
 * tiempoAgotado_, PAUSA_API_MS, PRIMERA_FILA_DATOS, MINUTOS_MAXIMOS_EJECUCION.
 ****************************************************/

const NOMBRE_HOJA_CENTROS_MEDICOS = "buscador de Centros Médicos";

// Radio alrededor del punto geocodificado en el que se acepta un lugar de
// salud como "el centro médico de esa dirección". Más allá de esto, es otro
// negocio de la cuadra y preferimos dejar la celda vacía.
const RADIO_BUSQUEDA_CM_METROS = 150;

// Tipos de lugar (Places API, tabla 1) que cuentan como centro médico /
// consultorio. Se deja fuera "pharmacy" (es una droguería, no un centro
// médico) aunque Google la agrupe en la misma categoría de salud.
const TIPOS_LUGAR_SALUD_CM = ["hospital", "doctor", "dentist", "physiotherapist"];

const NOMBRES_COLUMNA_CM = {
  PAIS: "pais",
  DIRECCION: "direccion",
  CENTRO_MEDICO: "nombre_centro_medico"
};


function buscarCentrosMedicos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(NOMBRE_HOJA_CENTROS_MEDICOS);

  if (!sheet) {
    SpreadsheetApp.getUi().alert("No existe la hoja '" + NOMBRE_HOJA_CENTROS_MEDICOS + "'.");
    return;
  }

  const cols = resolverColumnasCentrosMedicos_(sheet);
  const IDX = cols.IDX;

  const lastRow = sheet.getLastRow();

  if (lastRow < PRIMERA_FILA_DATOS) {
    ss.toast("No hay filas para procesar.", "Proceso terminado", 5);
    return;
  }

  const numFilas = lastRow - PRIMERA_FILA_DATOS + 1;
  const valores = sheet.getRange(PRIMERA_FILA_DATOS, 1, numFilas, cols.numColumnas).getValues();
  const apiKey = obtenerApiKey_();

  const cache = {};
  const inicio = Date.now();

  let procesadas = 0;
  let encontrados = 0;
  let sinResultado = 0;
  let sinGeocodificar = 0;
  let reutilizadasCache = 0;
  let cortadoPorTiempo = false;
  let ultimaFila = 0;

  try {
    for (let f = 0; f < numFilas; f++) {
      ultimaFila = f;

      if (tiempoAgotado_(inicio)) {
        cortadoPorTiempo = true;
        break;
      }

      const fila = valores[f];

      const pais = String(fila[IDX.PAIS] || "").trim();
      const direccion = String(fila[IDX.DIRECCION] || "").trim();
      const yaTieneCentro = String(fila[IDX.CENTRO_MEDICO] || "").trim() !== "";

      if (yaTieneCentro || pais === "" || direccion === "") {
        continue;
      }

      const clave = normalizarTexto_(pais) + "|" + normalizarTexto_(direccion);

      if (Object.prototype.hasOwnProperty.call(cache, clave)) {
        reutilizadasCache++;

        if (cache[clave]) {
          fila[IDX.CENTRO_MEDICO] = cache[clave];
          encontrados++;
        } else {
          sinResultado++;
        }

        continue;
      }

      procesadas++;

      const punto = geocodificarDireccionCM_(direccion, pais, apiKey);

      if (!punto) {
        sinGeocodificar++;
        cache[clave] = null;
        Utilities.sleep(PAUSA_API_MS);
        continue;
      }

      const nombreCentro = buscarLugarSaludCercano_(punto.lat, punto.lng, apiKey);
      cache[clave] = nombreCentro || null;

      if (nombreCentro) {
        fila[IDX.CENTRO_MEDICO] = nombreCentro;
        encontrados++;
      } else {
        sinResultado++;
      }

      Utilities.sleep(PAUSA_API_MS);
    }
  } finally {
    escribirCentrosMedicos_(sheet, valores, numFilas, cols);
  }

  const resumen =
    "Filas consultadas a Google: " + procesadas + " (" + reutilizadasCache + " resueltas por caché, dirección repetida). " +
    "Centro médico encontrado: " + encontrados + ". " +
    "Sin lugar de salud cerca (queda vacío): " + sinResultado + ". " +
    "Dirección no geocodificable (queda vacío): " + sinGeocodificar + ".";

  if (cortadoPorTiempo) {
    SpreadsheetApp.getUi().alert(
      "Corte por tiempo (límite de Apps Script)\n\n" + resumen +
      "\n\nSe alcanzó la fila " + (PRIMERA_FILA_DATOS + ultimaFila) + " de " + lastRow +
      ". Vuelve a ejecutar 'Buscar Centros Médicos' para continuar donde quedó."
    );
  } else {
    SpreadsheetApp.getUi().alert("Buscador de Centros Médicos\n\n" + resumen);
  }
}


function resolverColumnasCentrosMedicos_(sheet) {
  const numColumnas = sheet.getLastColumn();

  if (numColumnas === 0) {
    throw new Error("La hoja '" + sheet.getName() + "' no tiene encabezados.");
  }

  const headers = sheet.getRange(1, 1, 1, numColumnas).getValues()[0].map(normalizarHeader_);

  const COL = {};
  const IDX = {};

  Object.keys(NOMBRES_COLUMNA_CM).forEach(function (clave) {
    const nombre = NOMBRES_COLUMNA_CM[clave];
    const idx = headers.indexOf(nombre);

    if (idx === -1) {
      throw new Error(
        "La hoja '" + sheet.getName() + "' no tiene la columna '" + nombre + "'. Revisa el encabezado."
      );
    }

    IDX[clave] = idx;
    COL[clave] = idx + 1;
  });

  return { COL: COL, IDX: IDX, numColumnas: numColumnas };
}


/**
 * Geocodifica "Dirección, País" tal cual lo escribió el usuario — sin fijar
 * region=co como en Módulo Geocodificación.js, porque aquí el país es un
 * dato de la fila, no una constante del proyecto.
 */
function geocodificarDireccionCM_(direccion, pais, apiKey) {
  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?address=" +
    encodeURIComponent(direccion + ", " + pais) +
    "&language=es&key=" + encodeURIComponent(apiKey);

  const json = fetchAllGeocode_([url])[0];

  if (!json || json.status !== "OK" || !(json.results || []).length) {
    return null;
  }

  const location = json.results[0].geometry.location;

  return { lat: location.lat, lng: location.lng };
}


/**
 * Un solo Nearby Search sin filtro de "type" (filtrar por tipo obligaría a
 * pagar una búsqueda por cada tipo de salud) y se filtra/ordena por
 * distancia en el cliente, quedándose con el lugar de salud más cercano al
 * punto geocodificado dentro de RADIO_BUSQUEDA_CM_METROS.
 */
function buscarLugarSaludCercano_(lat, lng, apiKey) {
  const url =
    "https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=" +
    lat + "," + lng +
    "&radius=" + RADIO_BUSQUEDA_CM_METROS +
    "&language=es&key=" + encodeURIComponent(apiKey);

  const json = fetchAllGeocode_([url])[0];

  if (!json || json.status !== "OK" || !(json.results || []).length) {
    return null;
  }

  let mejorNombre = null;
  let mejorDistancia = Infinity;

  for (let i = 0; i < json.results.length; i++) {
    const lugar = json.results[i];
    const tipos = lugar.types || [];

    const esSalud = TIPOS_LUGAR_SALUD_CM.some(function (tipo) {
      return tipos.indexOf(tipo) !== -1;
    });

    if (!esSalud || !lugar.geometry) {
      continue;
    }

    const distancia = distanciaHaversineMetros_(
      lat, lng,
      lugar.geometry.location.lat, lugar.geometry.location.lng
    );

    if (distancia < mejorDistancia) {
      mejorDistancia = distancia;
      mejorNombre = lugar.name;
    }
  }

  return (mejorNombre && mejorDistancia <= RADIO_BUSQUEDA_CM_METROS) ? mejorNombre : null;
}


function escribirCentrosMedicos_(sheet, valores, numFilas, cols) {
  const columna = [];

  for (let f = 0; f < numFilas; f++) {
    columna.push([valores[f][cols.IDX.CENTRO_MEDICO]]);
  }

  sheet.getRange(PRIMERA_FILA_DATOS, cols.COL.CENTRO_MEDICO, numFilas, 1).setValues(columna);
  SpreadsheetApp.flush();
}
