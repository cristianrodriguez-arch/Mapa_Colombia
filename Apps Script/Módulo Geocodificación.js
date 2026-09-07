/****************************************************
 * CONFIGURACIÓN GENERAL
 ****************************************************/

const NOMBRE_HOJA_BRICKS = "Bricks";
const PRIMERA_FILA_DATOS = 2;

// Pausa entre llamadas secuenciales. La Geocoding API admite ~50 QPS, así que
// 50 ms sobra; los picos los absorbe el backoff de fetchAllGeocode_().
const PAUSA_API_MS = 50;

// Reintentos con backoff ante OVER_QUERY_LIMIT / UNKNOWN_ERROR / 5xx.
const MAX_REINTENTOS_API = 3;

// Llamadas en paralelo (UrlFetchApp.fetchAll) del modo "solo Código Postal":
// 4.200 filas de una en una no caben en los 6 minutos de Apps Script.
const LOTE_FETCH = 20;

// Apps Script corta la ejecución a los 6 minutos. Paramos antes, volcamos lo
// hecho y avisamos cuántas filas quedan: la siguiente corrida retoma sola.
const MINUTOS_MAXIMOS_EJECUCION = 5;

// Región/idioma: sin esto Google puede resolver una dirección colombiana en
// otro país y devolver un CP que no es de Colombia.
const REGION_GEOCODE = "co";
const IDIOMA_GEOCODE = "es";

// Si Google solo tiene postal_code_prefix (área postal, no el CP exacto) lo
// guardamos igual, marcado como aproximado en Notas.
const ACEPTAR_PREFIJO_POSTAL = true;

// Marca en Notas para las filas donde Google NO tiene CP: así no se vuelve a
// gastar cuota en ellas en cada corrida.
const NOTA_CP_NO_DISPONIBLE = "CP no disponible en Google";

// Ponlo en true para UNA corrida si quieres reintentar las filas marcadas
// arriba (por ejemplo, después de que Google amplíe cobertura).
const FORZAR_REINTENTO_CP = false;

// Si quieres que, cuando no caiga dentro de ningún polígono,
// asigne el brick más cercano por centroide, cambia esto a true.
// Recomendación inicial: dejarlo en false para evitar errores.
const USAR_BRICK_MAS_CERCANO_SI_NO_CAE = false;
const DISTANCIA_MAXIMA_BRICK_CERCANO_METROS = 500;

// Pequeña tolerancia para puntos que caen justo en bordes.
const TOLERANCIA_BBOX = 0.00001;

// Las columnas de la hoja de direcciones se localizan por ENCABEZADO, no por
// posición fija. Antes eran números fijos (E=Dirección Completa, F=Latitud...)
// y bastó con insertar una columna "Departamento" para que el script quedara
// escribiendo la latitud encima de la fórmula de Dirección Completa, la
// longitud encima de la Latitud, etc. — todo un lugar corrido silenciosamente.
// resolverColumnas_() ubica cada columna por su encabezado al inicio de cada
// corrida, así que insertar/mover/agregar columnas ya no descuadra nada.
const NOMBRES_COLUMNA = {
  ID: "id",
  CALLE: "calle",
  COMPLEMENTO: "complemento",
  CIUDAD: "ciudad",
  DIRECCION_COMPLETA: "direccion_completa",
  LATITUD: "latitud",
  LONGITUD: "longitud",
  PLACE_ID: "place_id",
  MAPS: "enlace_google_maps",
  CALLE_NORMALIZADA: "calle_normalizada",
  COMPLEMENTO_NORMALIZADO: "complemento_normalizado",
  POSTAL_CODE: "postal_code",
  ID_BRICK: "id_brick",
  BRICK: "brick",
  NOTAS: "notas"
};


/**
 * Localiza cada columna de NOMBRES_COLUMNA por su encabezado (normalizado:
 * minúsculas, sin tildes, espacios → "_") en la fila 1 de la hoja activa.
 * Devuelve COL en base 1 (para getRange) e IDX en base 0 (para arrays de
 * getValues()), más el total de columnas de la hoja.
 */
function resolverColumnas_(sheet) {
  if (sheet.getName() === NOMBRE_HOJA_BRICKS) {
    throw new Error("Estás parado en la hoja Bricks. Ejecuta esto desde la hoja de direcciones.");
  }

  const numColumnas = sheet.getLastColumn();

  if (numColumnas === 0) {
    throw new Error("La hoja activa ('" + sheet.getName() + "') no tiene encabezados.");
  }

  const headers = sheet.getRange(1, 1, 1, numColumnas).getValues()[0].map(normalizarHeader_);

  const COL = {};
  const IDX = {};

  Object.keys(NOMBRES_COLUMNA).forEach(function (clave) {
    const nombre = NOMBRES_COLUMNA[clave];
    const idx = headers.indexOf(nombre);

    if (idx === -1) {
      throw new Error(
        "La hoja activa ('" + sheet.getName() + "') no tiene la columna '" + nombre + "'. " +
        "Ejecuta esto desde la hoja de direcciones, o revisa si el encabezado cambió de nombre."
      );
    }

    IDX[clave] = idx;
    COL[clave] = idx + 1;
  });

  return { COL: COL, IDX: IDX, numColumnas: numColumnas };
}


/****************************************************
 * FUNCIÓN PRINCIPAL
 * Geocodifica, resuelve Código Postal y asigna bricks
 ****************************************************/

function obtenerDatosCompletos() {
  procesarDirecciones_({
    geocodificar: true
  });
}


/****************************************************
 * FUNCIÓN OPCIONAL
 * Solo asigna bricks usando Latitud y Longitud existentes.
 * No consume Google Maps API.
 ****************************************************/

function asignarBricksSolo() {
  procesarDirecciones_({
    geocodificar: false
  });
}


/****************************************************
 * COMPLETAR SOLO CÓDIGO POSTAL
 *
 * Para filas que YA tienen coordenadas y Place ID pero no CP (era el caso de
 * las 4.202 filas de la hoja). No re-geocodifica la dirección ni toca bricks:
 * hace un reverse geocode por coordenada, que es de donde sale el CP.
 * Va en lotes paralelos, así que la hoja completa entra en una sola corrida.
 ****************************************************/

function completarCodigosPostales() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();

  const cols = resolverColumnas_(sheet);
  const IDX = cols.IDX;

  const lastRow = sheet.getLastRow();

  if (lastRow < PRIMERA_FILA_DATOS) {
    ss.toast("No hay filas para procesar.", "Proceso terminado", 5);
    return;
  }

  const numFilas = lastRow - PRIMERA_FILA_DATOS + 1;

  forzarFormatoTexto_(sheet, numFilas, cols);

  const valores = sheet.getRange(PRIMERA_FILA_DATOS, 1, numFilas, cols.numColumnas).getValues();
  const apiKey = obtenerApiKey_();

  // 1. Filas candidatas.
  const pendientes = [];

  let yaTenianCp = 0;
  let sinCoordenada = 0;
  let marcadasSinCp = 0;

  for (let f = 0; f < numFilas; f++) {
    const fila = valores[f];

    if (String(fila[IDX.POSTAL_CODE] || "").trim() !== "") {
      yaTenianCp++;
      continue;
    }

    if (!FORZAR_REINTENTO_CP && String(fila[IDX.NOTAS] || "").indexOf(NOTA_CP_NO_DISPONIBLE) !== -1) {
      marcadasSinCp++;
      continue;
    }

    const lat = convertirNumero_(fila[IDX.LATITUD]);
    const lng = convertirNumero_(fila[IDX.LONGITUD]);

    if (!esNumeroValido_(lat) || !esNumeroValido_(lng)) {
      sinCoordenada++;
      continue;
    }

    pendientes.push({ fila: f, lat: lat, lng: lng, cp: null, fuente: "" });
  }

  if (pendientes.length === 0) {
    ss.toast(
      "Nada por hacer: " + yaTenianCp + " ya tenían CP, " + sinCoordenada +
      " sin coordenadas, " + marcadasSinCp + " marcadas como sin CP en Google.",
      "Código Postal",
      8
    );
    return;
  }

  // 2. Resolución por lotes paralelos.
  const inicio = Date.now();

  let resueltos = 0;
  let aproximados = 0;
  let sinDato = 0;
  let procesadas = 0;
  let cortadoPorTiempo = false;

  try {
    for (let desde = 0; desde < pendientes.length; desde += LOTE_FETCH) {
      if (tiempoAgotado_(inicio)) {
        cortadoPorTiempo = true;
        break;
      }

      const lote = pendientes.slice(desde, desde + LOTE_FETCH);

      // Paso 1: reverse geocode filtrado a postal_code.
      const respuestas = fetchAllGeocode_(lote.map(function (p) {
        return urlGeocode_({ latlng: p.lat + "," + p.lng, result_type: "postal_code" }, apiKey);
      }));

      const faltantes = [];

      for (let i = 0; i < lote.length; i++) {
        const hallado = extraerCodigoPostal_(respuestas[i] ? respuestas[i].results : null);

        if (hallado) {
          lote[i].cp = hallado;
          lote[i].fuente = "reverse result_type=postal_code";
        } else {
          faltantes.push(i);
        }
      }

      // Paso 2: reverse geocode completo para las que no resolvieron. El CP a
      // veces viaja dentro de un result de otro tipo (street_address, etc.).
      if (faltantes.length > 0) {
        const respuestas2 = fetchAllGeocode_(faltantes.map(function (i) {
          return urlGeocode_({ latlng: lote[i].lat + "," + lote[i].lng }, apiKey);
        }));

        for (let k = 0; k < faltantes.length; k++) {
          const i = faltantes[k];
          const hallado = extraerCodigoPostal_(respuestas2[k] ? respuestas2[k].results : null);

          if (hallado) {
            lote[i].cp = hallado;
            lote[i].fuente = "reverse completo";
          }
        }
      }

      // 3. Volcado al array (una sola escritura a la hoja al final).
      for (let i = 0; i < lote.length; i++) {
        const p = lote[i];
        const fila = valores[p.fila];

        procesadas++;

        if (p.cp) {
          fila[IDX.POSTAL_CODE] = p.cp.codigo;
          fila[IDX.NOTAS] = combinarNotasCp_(fila[IDX.NOTAS], textoNotaCp_(p.cp, p.fuente));

          resueltos++;

          if (p.cp.aproximado) {
            aproximados++;
          }
        } else {
          fila[IDX.NOTAS] = combinarNotasCp_(fila[IDX.NOTAS], NOTA_CP_NO_DISPONIBLE);
          sinDato++;
        }
      }
    }
  } finally {
    escribirSalida_(sheet, valores, numFilas, cols);
  }

  const resumen =
    "Filas revisadas: " + procesadas + " de " + pendientes.length + " pendientes. " +
    "CP resuelto: " + resueltos + " (" + aproximados + " aproximados). " +
    "Sin CP en Google: " + sinDato + ".";

  if (cortadoPorTiempo) {
    SpreadsheetApp.getUi().alert(
      "Corte por tiempo (límite de Apps Script)\n\n" + resumen +
      "\n\nQuedan " + (pendientes.length - procesadas) + " filas. " +
      "Vuelve a ejecutar 'Completar solo Código Postal' para continuar donde quedó."
    );
  } else {
    SpreadsheetApp.getUi().alert("Código Postal completado\n\n" + resumen);
  }
}


/****************************************************
 * DIAGNÓSTICO
 * Muestra qué devuelve Google para UNA dirección o coordenada.
 * No escribe nada en la hoja.
 ****************************************************/

function diagnosticarCodigoPostal() {
  const ui = SpreadsheetApp.getUi();

  const respuesta = ui.prompt(
    "Diagnóstico de Código Postal",
    'Escribe una dirección completa o unas coordenadas "lat,lng".\n' +
    "No se escribe nada en la hoja.",
    ui.ButtonSet.OK_CANCEL
  );

  if (respuesta.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const entrada = String(respuesta.getResponseText() || "").trim();

  if (entrada === "") {
    return;
  }

  const apiKey = obtenerApiKey_();
  const coords = parsearLatLng_(entrada);
  const lineas = [];

  let lat = coords ? coords.lat : null;
  let lng = coords ? coords.lng : null;

  const urlPrimaria = coords
    ? urlGeocode_({ latlng: lat + "," + lng }, apiKey)
    : urlGeocode_({ address: entrada, components: "country:CO" }, apiKey);

  lineas.push("Entrada: " + entrada);
  lineas.push("Llamada primaria: " + (coords ? "reverse (latlng)" : "forward (address)"));

  const json = fetchAllGeocode_([urlPrimaria])[0];

  if (!json) {
    lineas.push("Sin respuesta de Google (error de red o cuota).");
    mostrarDiagnostico_(lineas);
    return;
  }

  lineas.push("status: " + json.status + " | results: " + ((json.results || []).length));

  const results = json.results || [];

  for (let r = 0; r < results.length; r++) {
    const cp = codigoPostalDeResult_(results[r]);

    lineas.push(
      "  [" + r + "] types=" + (results[r].types || []).join(",") +
      " | postal_code: " + (cp ? cp.codigo + " (" + cp.origen + ")" : "no")
    );
  }

  if (!coords && results.length > 0 && results[0].geometry) {
    lat = results[0].geometry.location.lat;
    lng = results[0].geometry.location.lng;
    lineas.push("Coordenada obtenida: " + formatearCoordenada_(lat) + ", " + formatearCoordenada_(lng));
  }

  const resuelto = resolverCodigoPostal_(json, lat, lng, apiKey, !!coords, lineas);

  lineas.push("");
  lineas.push(resuelto
    ? "RESULTADO: " + resuelto.codigo + (resuelto.aproximado ? " (APROXIMADO)" : "") +
      " | origen " + resuelto.origen + " | vía " + resuelto.fuente
    : "RESULTADO: Google no tiene código postal para este punto.");

  mostrarDiagnostico_(lineas);
}


function mostrarDiagnostico_(lineas) {
  const texto = lineas.join("\n");

  Logger.log(texto);

  SpreadsheetApp.getUi().alert(
    texto.length > 4000 ? texto.substring(0, 4000) + "\n[...ver Registros de ejecución]" : texto
  );
}


/****************************************************
 * PROCESADOR GENERAL
 ****************************************************/

function procesarDirecciones_(opciones) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();

  const cols = resolverColumnas_(sheet);
  const IDX = cols.IDX;

  const lastRow = sheet.getLastRow();

  if (lastRow < PRIMERA_FILA_DATOS) {
    ss.toast("No hay filas para procesar.", "Proceso terminado", 5);
    return;
  }

  const numFilas = lastRow - PRIMERA_FILA_DATOS + 1;

  forzarFormatoTexto_(sheet, numFilas, cols);

  // Una sola lectura y una sola escritura: fila por fila con getValue()/
  // setValue() son ~60.000 llamadas y la ejecución muere antes de terminar.
  const valores = sheet.getRange(PRIMERA_FILA_DATOS, 1, numFilas, cols.numColumnas).getValues();

  const bricks = cargarBricks_(ss);
  const apiKey = opciones.geocodificar ? obtenerApiKey_() : "";

  const inicio = Date.now();
  const enlacesPendientes = [];

  let procesadas = 0;
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
      const filaHoja = PRIMERA_FILA_DATOS + f;

      const direccion = String(fila[IDX.DIRECCION_COMPLETA] || "").trim();
      const ciudad = String(fila[IDX.CIUDAD] || "").trim();

      let lat = convertirNumero_(fila[IDX.LATITUD]);
      let lng = convertirNumero_(fila[IDX.LONGITUD]);

      // Si venían con coma decimal, las dejamos con punto decimal.
      if (esNumeroValido_(lat)) {
        fila[IDX.LATITUD] = formatearCoordenada_(lat);
      }

      if (esNumeroValido_(lng)) {
        fila[IDX.LONGITUD] = formatearCoordenada_(lng);
      }

      const notaPrevia = String(fila[IDX.NOTAS] || "");

      const tieneLatLng = esNumeroValido_(lat) && esNumeroValido_(lng);
      const tienePlaceId = String(fila[IDX.PLACE_ID] || "").trim() !== "";
      const tieneMaps = String(fila[IDX.MAPS] || "").trim() !== "";
      const tieneIdBrick = String(fila[IDX.ID_BRICK] || "").trim() !== "";
      const tieneBrick = String(fila[IDX.BRICK] || "").trim() !== "";
      const tieneCp = String(fila[IDX.POSTAL_CODE] || "").trim() !== "";

      // Una fila sin CP no está terminada: antes el CP no entraba en esta
      // condición y las filas ya geocodificadas se saltaban para siempre.
      const cpYaIntentado = !FORZAR_REINTENTO_CP && notaPrevia.indexOf(NOTA_CP_NO_DISPONIBLE) !== -1;
      const cpCerrado = tieneCp || cpYaIntentado;

      // Si está todo completo, no hacemos nada.
      if (opciones.geocodificar && tieneLatLng && tienePlaceId && tieneMaps && tieneIdBrick && tieneBrick && cpCerrado) {
        continue;
      }

      // En modo solo bricks, saltamos filas que ya tengan Id Brick y Brick.
      if (!opciones.geocodificar && tieneIdBrick && tieneBrick) {
        continue;
      }

      procesadas++;

      const notas = [];

      let jsonPrimario = null;
      let primarioFueReverse = false;

      /****************************************************
       * 1. GEOCODIFICACIÓN
       ****************************************************/

      if (opciones.geocodificar) {
        const necesitaGoogle = !tieneLatLng || !tienePlaceId || !tieneMaps;

        if (necesitaGoogle) {
          if (!tieneLatLng && direccion === "") {
            notas.push("Sin dirección ni coordenadas");
          } else {
            primarioFueReverse = tieneLatLng;

            const url = tieneLatLng
              ? urlGeocode_({ latlng: lat + "," + lng }, apiKey)
              : urlGeocode_({ address: direccion, components: "country:CO" }, apiKey);

            jsonPrimario = fetchAllGeocode_([url])[0];

            if (jsonPrimario && jsonPrimario.status === "OK" && (jsonPrimario.results || []).length > 0) {
              const result = jsonPrimario.results[0];

              if (!tieneLatLng) {
                lat = result.geometry.location.lat;
                lng = result.geometry.location.lng;

                fila[IDX.LATITUD] = formatearCoordenada_(lat);
                fila[IDX.LONGITUD] = formatearCoordenada_(lng);
              }

              const pid = result.place_id || "";

              fila[IDX.PLACE_ID] = pid;

              enlacesPendientes.push({
                filaHoja: filaHoja,
                url:
                  "https://www.google.com/maps/search/?api=1&query=" +
                  encodeURIComponent(formatearCoordenada_(lat) + "," + formatearCoordenada_(lng)) +
                  "&query_place_id=" +
                  encodeURIComponent(pid)
              });

              guardarDireccionNormalizada_(result, fila, IDX);

              notas.push("Geocodificación OK");
            } else {
              notas.push("Error API: " + (jsonPrimario ? jsonPrimario.status : "sin respuesta"));
            }

            Utilities.sleep(PAUSA_API_MS);
          }
        }

        /****************************************************
         * 2. CÓDIGO POSTAL
         * Va aparte de la geocodificación: una fila puede tener ya
         * coordenadas y Place ID y seguir sin CP, y ese es el caso normal
         * en Colombia (ver resolverCodigoPostal_).
         ****************************************************/

        if (!cpCerrado) {
          const latCp = convertirNumero_(fila[IDX.LATITUD]);
          const lngCp = convertirNumero_(fila[IDX.LONGITUD]);

          const cp = resolverCodigoPostal_(jsonPrimario, latCp, lngCp, apiKey, primarioFueReverse, null);

          if (cp) {
            fila[IDX.POSTAL_CODE] = cp.codigo;
            notas.push(textoNotaCp_(cp, cp.fuente));
          } else {
            notas.push(NOTA_CP_NO_DISPONIBLE);
          }
        } else if (cpYaIntentado) {
          // Se conserva la marca para no reintentar en la próxima corrida.
          notas.push(NOTA_CP_NO_DISPONIBLE);
        }
      }

      /****************************************************
       * 3. ASIGNACIÓN DE BRICK
       ****************************************************/

      const latFinal = convertirNumero_(fila[IDX.LATITUD]);
      const lngFinal = convertirNumero_(fila[IDX.LONGITUD]);

      if (esNumeroValido_(latFinal) && esNumeroValido_(lngFinal)) {
        const match = buscarBrick_(latFinal, lngFinal, ciudad, bricks);

        if (match && match.brick) {
          fila[IDX.ID_BRICK] = match.brick.brick_id;
          fila[IDX.BRICK] = match.brick.nombre_brick;

          let notaBrick =
            "Brick asignado: " +
            match.brick.brick_id +
            " | " +
            match.metodo +
            " | Confianza " +
            match.confianza;

          if (!match.ciudadCoincide) {
            notaBrick += " | Revisar ciudad";
          }

          notas.push(notaBrick);
        } else {
          fila[IDX.ID_BRICK] = "";
          fila[IDX.BRICK] = "";

          notas.push("Sin brick exacto");
        }
      } else {
        notas.push("Sin coordenadas para asignar brick");
      }

      if (notas.length > 0) {
        fila[IDX.NOTAS] = notas.join(" | ");
      }
    }
  } finally {
    escribirSalida_(sheet, valores, numFilas, cols);
    escribirEnlacesMaps_(sheet, enlacesPendientes, cols);
  }

  const mensaje = opciones.geocodificar
    ? "Geocodificación, código postal y bricks: " + procesadas + " filas procesadas."
    : "Asignación de bricks: " + procesadas + " filas procesadas.";

  if (cortadoPorTiempo) {
    SpreadsheetApp.getUi().alert(
      "Corte por tiempo (límite de Apps Script)\n\n" + mensaje +
      "\n\nSe alcanzó la fila " + (PRIMERA_FILA_DATOS + ultimaFila) + " de " + lastRow +
      ". Lo hecho ya quedó guardado: vuelve a ejecutar la misma opción para continuar."
    );
  } else {
    ss.toast(mensaje, "Proceso completado", 5);
  }
}


/****************************************************
 * CÓDIGO POSTAL: RESOLUCIÓN EN CASCADA
 *
 * Por qué hace falta: en Colombia la Geocoding API casi nunca devuelve el
 * componente postal_code en el primer result de una búsqueda por dirección.
 * Las direcciones tipo "Calle 30, Barranquilla" resuelven a nivel de vía
 * (types=route) o de negocio (establishment), y una vía entera atraviesa
 * varios códigos postales, así que Google no le adjunta ninguno. El CP sí
 * existe, pero hay que pedirlo por coordenada.
 *
 * Cascada:
 *   a) barrer TODOS los results de la respuesta que ya tenemos (el CP suele
 *      venir en un result de menor granularidad, no en results[0]);
 *   b) reverse geocode con result_type=postal_code (el área postal del punto);
 *   c) reverse geocode completo, por si el CP viaja dentro de otro result.
 ****************************************************/

function resolverCodigoPostal_(jsonPrimario, lat, lng, apiKey, primarioFueReverse, lineasLog) {
  if (jsonPrimario && jsonPrimario.results) {
    const enPrimario = extraerCodigoPostal_(jsonPrimario.results);

    if (enPrimario) {
      return anotarFuente_(enPrimario, "respuesta principal", lineasLog);
    }
  }

  if (!esNumeroValido_(lat) || !esNumeroValido_(lng)) {
    return null;
  }

  const reverseFiltrado = fetchAllGeocode_([
    urlGeocode_({ latlng: lat + "," + lng, result_type: "postal_code" }, apiKey)
  ])[0];

  if (lineasLog) {
    lineasLog.push("Fallback b) result_type=postal_code → status " +
      (reverseFiltrado ? reverseFiltrado.status : "sin respuesta"));
  }

  if (reverseFiltrado && reverseFiltrado.results) {
    const hallado = extraerCodigoPostal_(reverseFiltrado.results);

    if (hallado) {
      return anotarFuente_(hallado, "reverse result_type=postal_code", lineasLog);
    }
  }

  // Si la llamada primaria ya era un reverse completo, (c) sería repetirla.
  if (primarioFueReverse) {
    return null;
  }

  const reverseCompleto = fetchAllGeocode_([urlGeocode_({ latlng: lat + "," + lng }, apiKey)])[0];

  if (lineasLog) {
    lineasLog.push("Fallback c) reverse completo → status " +
      (reverseCompleto ? reverseCompleto.status : "sin respuesta"));
  }

  if (reverseCompleto && reverseCompleto.results) {
    const hallado = extraerCodigoPostal_(reverseCompleto.results);

    if (hallado) {
      return anotarFuente_(hallado, "reverse completo", lineasLog);
    }
  }

  return null;
}


function anotarFuente_(cp, fuente, lineasLog) {
  cp.fuente = fuente;

  if (lineasLog) {
    lineasLog.push("→ CP " + cp.codigo + " encontrado en: " + fuente);
  }

  return cp;
}


/**
 * Busca el CP en TODOS los results y en TODOS sus address_components.
 * Antes solo se miraba results[0], que es justo donde no viene.
 */
function extraerCodigoPostal_(results) {
  if (!results || results.length === 0) {
    return null;
  }

  let prefijo = null;

  for (let r = 0; r < results.length; r++) {
    const hallado = codigoPostalDeResult_(results[r]);

    if (hallado && hallado.origen === "postal_code") {
      return hallado;
    }

    if (hallado && !prefijo) {
      prefijo = hallado;
    }
  }

  if (prefijo && ACEPTAR_PREFIJO_POSTAL) {
    return prefijo;
  }

  return null;
}


function codigoPostalDeResult_(result) {
  const components = (result && result.address_components) || [];

  let prefijo = null;

  for (let c = 0; c < components.length; c++) {
    const types = components[c].types || [];
    const valor = String(components[c].long_name || components[c].short_name || "").trim();

    if (valor === "") {
      continue;
    }

    if (types.indexOf("postal_code") !== -1) {
      return {
        codigo: valor,
        origen: "postal_code",
        aproximado: !esCodigoPostalCompleto_(valor),
        fuente: ""
      };
    }

    if (!prefijo && types.indexOf("postal_code_prefix") !== -1) {
      prefijo = {
        codigo: valor,
        origen: "postal_code_prefix",
        aproximado: true,
        fuente: ""
      };
    }
  }

  return prefijo;
}


function esCodigoPostalCompleto_(valor) {
  return /^\d{6}$/.test(String(valor).trim());
}


function textoNotaCp_(cp, fuente) {
  const via = fuente || cp.fuente || "";

  return cp.aproximado
    ? "CP aproximado " + cp.codigo + " (" + cp.origen + (via ? " vía " + via : "") + ")"
    : "CP " + cp.codigo + (via ? " (" + via + ")" : "");
}


/**
 * Reemplaza el segmento de CP de una nota existente sin borrar el resto
 * (la nota del brick, por ejemplo).
 */
function combinarNotasCp_(notaPrevia, notaCp) {
  const segmentos = String(notaPrevia || "")
    .split("|")
    .map(function (s) {
      return s.trim();
    })
    .filter(function (s) {
      return s !== "" && !esSegmentoCp_(s);
    });

  segmentos.push(notaCp);

  return segmentos.join(" | ");
}


function esSegmentoCp_(segmento) {
  return (
    segmento === NOTA_CP_NO_DISPONIBLE ||
    segmento.indexOf("CP ") === 0 ||
    segmento.indexOf("CP aproximado ") === 0
  );
}


/****************************************************
 * LLAMADAS A LA GEOCODING API
 ****************************************************/

function urlGeocode_(params, apiKey) {
  const partes = [];

  Object.keys(params).forEach(function (clave) {
    partes.push(clave + "=" + encodeURIComponent(params[clave]));
  });

  partes.push("language=" + IDIOMA_GEOCODE);
  partes.push("region=" + REGION_GEOCODE);
  partes.push("key=" + encodeURIComponent(apiKey));

  return "https://maps.googleapis.com/maps/api/geocode/json?" + partes.join("&");
}


/**
 * Pide varias URLs en paralelo y devuelve un array de JSON ya parseados
 * (null en la posición de las que fallaron). Reintenta con backoff las que
 * vuelven con OVER_QUERY_LIMIT / error transitorio, para que un pico de
 * cuota no deje huecos silenciosos en la hoja.
 */
function fetchAllGeocode_(urls) {
  const resultados = [];

  for (let i = 0; i < urls.length; i++) {
    resultados.push(null);
  }

  let pendientes = urls.map(function (url, i) {
    return i;
  });

  for (let intento = 0; intento <= MAX_REINTENTOS_API && pendientes.length > 0; intento++) {
    if (intento > 0) {
      Utilities.sleep(Math.pow(2, intento) * 500);
    }

    const peticiones = pendientes.map(function (i) {
      return { url: urls[i], muteHttpExceptions: true };
    });

    let respuestas = null;

    try {
      respuestas = UrlFetchApp.fetchAll(peticiones);
    } catch (e) {
      continue;
    }

    const siguenPendientes = [];

    for (let k = 0; k < pendientes.length; k++) {
      const i = pendientes[k];
      const json = parsearRespuestaGeocode_(respuestas[k]);

      if (json === null) {
        siguenPendientes.push(i);
        continue;
      }

      // REQUEST_DENIED es un problema de configuración (clave, API no
      // habilitada, restricciones): cortar la corrida en vez de escribir
      // 4.000 filas con el mismo error en Notas.
      if (json.status === "REQUEST_DENIED") {
        throw new Error(
          "Google rechazó la petición (" + json.status + "): " +
          (json.error_message || "revisa la propiedad GOOGLE_MAPS_API_KEY, que la Geocoding API esté habilitada y que la clave no tenga restricciones de referrer.")
        );
      }

      if (json.status === "OVER_QUERY_LIMIT" || json.status === "UNKNOWN_ERROR") {
        siguenPendientes.push(i);
        continue;
      }

      resultados[i] = json;
    }

    pendientes = siguenPendientes;
  }

  return resultados;
}


function parsearRespuestaGeocode_(respuesta) {
  if (!respuesta) {
    return null;
  }

  const codigo = respuesta.getResponseCode();

  if (codigo >= 500) {
    return null;
  }

  try {
    return JSON.parse(respuesta.getContentText());
  } catch (e) {
    return null;
  }
}


/****************************************************
 * LECTURA / ESCRITURA DE LA HOJA
 ****************************************************/

// Columnas que este script puede escribir. NO incluye ID/CALLE/COMPLEMENTO/
// CIUDAD (entrada del usuario), DIRECCION_COMPLETA (fórmula) ni MAPS
// (RichText, se escribe aparte en escribirEnlacesMaps_).
const CLAVES_ESCRIBIBLES = [
  "LATITUD", "LONGITUD", "PLACE_ID",
  "CALLE_NORMALIZADA", "COMPLEMENTO_NORMALIZADO", "POSTAL_CODE",
  "ID_BRICK", "BRICK", "NOTAS"
];


function forzarFormatoTexto_(sheet, numFilas, cols) {
  // Latitud/Longitud como texto para conservar el punto decimal.
  sheet.getRange(PRIMERA_FILA_DATOS, cols.COL.LATITUD, numFilas, 1).setNumberFormat("@");
  sheet.getRange(PRIMERA_FILA_DATOS, cols.COL.LONGITUD, numFilas, 1).setNumberFormat("@");

  // El CP colombiano tiene 6 dígitos y muchos empiezan por cero (Antioquia
  // 05xxxx, Atlántico 08xxxx): como número, Sheets se come el cero inicial.
  sheet.getRange(PRIMERA_FILA_DATOS, cols.COL.POSTAL_CODE, numFilas, 1).setNumberFormat("@");
}


/**
 * Escribe cada columna de CLAVES_ESCRIBIBLES por separado, en la posición
 * real que resolverColumnas_() encontró por encabezado — no asume que estén
 * contiguas ni en un orden particular, así que una columna nueva insertada
 * en cualquier punto de la hoja no descuadra la escritura.
 */
function escribirSalida_(sheet, valores, numFilas, cols) {
  CLAVES_ESCRIBIBLES.forEach(function (clave) {
    const columna = [];

    for (let f = 0; f < numFilas; f++) {
      columna.push([valores[f][cols.IDX[clave]]]);
    }

    sheet.getRange(PRIMERA_FILA_DATOS, cols.COL[clave], numFilas, 1).setValues(columna);
  });

  SpreadsheetApp.flush();
}


function escribirEnlacesMaps_(sheet, enlaces, cols) {
  for (let i = 0; i < enlaces.length; i++) {
    const richText = SpreadsheetApp.newRichTextValue()
      .setText("Ver en Maps")
      .setLinkUrl(enlaces[i].url)
      .build();

    sheet.getRange(enlaces[i].filaHoja, cols.COL.MAPS).setRichTextValue(richText);
  }
}


function tiempoAgotado_(inicio) {
  return Date.now() - inicio > MINUTOS_MAXIMOS_EJECUCION * 60 * 1000;
}


/****************************************************
 * CARGA DE BRICKS DESDE LA HOJA Bricks
 ****************************************************/

function cargarBricks_(ss) {
  const sheet = ss.getSheetByName(NOMBRE_HOJA_BRICKS);

  if (!sheet) {
    throw new Error("No existe la hoja '" + NOMBRE_HOJA_BRICKS + "'.");
  }

  const data = sheet.getDataRange().getValues();

  if (data.length < 2) {
    throw new Error("La hoja Bricks no tiene datos.");
  }

  const headers = data[0].map(function (h) {
    return normalizarHeader_(h);
  });

  const idx = {
    brick_id: obtenerIndiceHeader_(headers, "brick_id"),
    nombre: obtenerIndiceHeader_(headers, "nombre"),
    zona: obtenerIndiceHeader_(headers, "zona"),
    ciudad: obtenerIndiceHeader_(headers, "ciudad"),
    departamento: obtenerIndiceHeader_(headers, "departamento"),
    nombre_brick: obtenerIndiceHeader_(headers, "nombre_brick"),
    lat_centroide: obtenerIndiceHeader_(headers, "lat_centroide"),
    lon_centroide: obtenerIndiceHeader_(headers, "lon_centroide"),
    lat_min: obtenerIndiceHeader_(headers, "lat_min"),
    lat_max: obtenerIndiceHeader_(headers, "lat_max"),
    lon_min: obtenerIndiceHeader_(headers, "lon_min"),
    lon_max: obtenerIndiceHeader_(headers, "lon_max"),
    geometria_geojson: obtenerIndiceHeader_(headers, "geometria_geojson")
  };

  const bricks = [];

  for (let r = 1; r < data.length; r++) {
    const row = data[r];

    const geometriaTexto = String(row[idx.geometria_geojson] || "").trim();

    if (geometriaTexto === "") {
      continue;
    }

    let geometria = null;

    try {
      geometria = JSON.parse(geometriaTexto);
    } catch (e) {
      continue;
    }

    const brick = {
      brick_id: String(row[idx.brick_id] || "").trim(),
      nombre: String(row[idx.nombre] || "").trim(),
      zona: String(row[idx.zona] || "").trim(),
      ciudad: String(row[idx.ciudad] || "").trim(),
      departamento: String(row[idx.departamento] || "").trim(),
      nombre_brick: String(row[idx.nombre_brick] || "").trim(),

      ciudad_norm: normalizarTexto_(row[idx.ciudad]),

      lat_centroide: convertirNumero_(row[idx.lat_centroide]),
      lon_centroide: convertirNumero_(row[idx.lon_centroide]),

      lat_min: convertirNumero_(row[idx.lat_min]),
      lat_max: convertirNumero_(row[idx.lat_max]),
      lon_min: convertirNumero_(row[idx.lon_min]),
      lon_max: convertirNumero_(row[idx.lon_max]),

      geometria: geometria
    };

    if (
      brick.brick_id &&
      brick.nombre_brick &&
      esNumeroValido_(brick.lat_min) &&
      esNumeroValido_(brick.lat_max) &&
      esNumeroValido_(brick.lon_min) &&
      esNumeroValido_(brick.lon_max)
    ) {
      bricks.push(brick);
    }
  }

  if (bricks.length === 0) {
    throw new Error("No se pudieron cargar bricks válidos desde la hoja Bricks.");
  }

  return bricks;
}


/****************************************************
 * BÚSQUEDA DEL BRICK
 ****************************************************/

function buscarBrick_(lat, lng, ciudad, bricks) {
  const ciudadNorm = normalizarTexto_(ciudad);

  // 1. Ciudad + bounding box + polígono.
  const candidatosCiudad = bricks.filter(function (brick) {
    return (
      ciudadCompatible_(ciudadNorm, brick.ciudad_norm) &&
      pasaBoundingBox_(lat, lng, brick)
    );
  });

  const exactoCiudad = buscarEnPoligonos_(lat, lng, candidatosCiudad);

  if (exactoCiudad) {
    return {
      brick: exactoCiudad,
      metodo: "Dentro del polígono",
      confianza: "Alta",
      ciudadCoincide: true
    };
  }

  // 2. Segundo intento: sin filtro de ciudad.
  const candidatosSinCiudad = bricks.filter(function (brick) {
    return pasaBoundingBox_(lat, lng, brick);
  });

  const exactoSinCiudad = buscarEnPoligonos_(lat, lng, candidatosSinCiudad);

  if (exactoSinCiudad) {
    return {
      brick: exactoSinCiudad,
      metodo: "Dentro del polígono sin filtro ciudad",
      confianza: "Media",
      ciudadCoincide: false
    };
  }

  // 3. Opcional: brick más cercano por centroide.
  if (USAR_BRICK_MAS_CERCANO_SI_NO_CAE) {
    const cercano = buscarBrickMasCercano_(lat, lng, ciudadNorm, bricks);

    if (cercano) {
      return {
        brick: cercano.brick,
        metodo: "Centroide más cercano (" + Math.round(cercano.distancia) + " m)",
        confianza: "Baja",
        ciudadCoincide: cercano.ciudadCoincide
      };
    }
  }

  return null;
}


function buscarEnPoligonos_(lat, lng, candidatos) {
  for (let i = 0; i < candidatos.length; i++) {
    const brick = candidatos[i];

    if (geometriaContienePunto_(lat, lng, brick.geometria)) {
      return brick;
    }
  }

  return null;
}


function pasaBoundingBox_(lat, lng, brick) {
  return (
    lat >= brick.lat_min - TOLERANCIA_BBOX &&
    lat <= brick.lat_max + TOLERANCIA_BBOX &&
    lng >= brick.lon_min - TOLERANCIA_BBOX &&
    lng <= brick.lon_max + TOLERANCIA_BBOX
  );
}


function buscarBrickMasCercano_(lat, lng, ciudadNorm, bricks) {
  let mejor = null;

  for (let i = 0; i < bricks.length; i++) {
    const brick = bricks[i];

    if (!esNumeroValido_(brick.lat_centroide) || !esNumeroValido_(brick.lon_centroide)) {
      continue;
    }

    const ciudadCoincide = ciudadCompatible_(ciudadNorm, brick.ciudad_norm);

    if (ciudadNorm && !ciudadCoincide) {
      continue;
    }

    const distancia = distanciaHaversineMetros_(
      lat,
      lng,
      brick.lat_centroide,
      brick.lon_centroide
    );

    if (!mejor || distancia < mejor.distancia) {
      mejor = {
        brick: brick,
        distancia: distancia,
        ciudadCoincide: ciudadCoincide
      };
    }
  }

  if (mejor && mejor.distancia <= DISTANCIA_MAXIMA_BRICK_CERCANO_METROS) {
    return mejor;
  }

  return null;
}


/****************************************************
 * LÓGICA GEOJSON: POINT IN POLYGON
 ****************************************************/

function geometriaContienePunto_(lat, lng, geometria) {
  if (!geometria || !geometria.type || !geometria.coordinates) {
    return false;
  }

  if (geometria.type === "Polygon") {
    return poligonoContienePunto_(lat, lng, geometria.coordinates);
  }

  if (geometria.type === "MultiPolygon") {
    for (let i = 0; i < geometria.coordinates.length; i++) {
      if (poligonoContienePunto_(lat, lng, geometria.coordinates[i])) {
        return true;
      }
    }
  }

  return false;
}


function poligonoContienePunto_(lat, lng, polygonCoordinates) {
  if (!polygonCoordinates || polygonCoordinates.length === 0) {
    return false;
  }

  const anilloExterior = polygonCoordinates[0];

  if (!anilloContienePunto_(lat, lng, anilloExterior)) {
    return false;
  }

  // Si cae dentro de un hueco interno, no pertenece al polígono.
  for (let i = 1; i < polygonCoordinates.length; i++) {
    const hueco = polygonCoordinates[i];

    if (anilloContienePunto_(lat, lng, hueco)) {
      return false;
    }
  }

  return true;
}


function anilloContienePunto_(lat, lng, ring) {
  let dentro = false;

  // En GeoJSON cada punto viene como [longitud, latitud].
  const x = lng;
  const y = lat;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = Number(ring[i][0]);
    const yi = Number(ring[i][1]);
    const xj = Number(ring[j][0]);
    const yj = Number(ring[j][1]);

    // Si cae exactamente sobre el borde, lo consideramos dentro.
    if (puntoEnSegmento_(x, y, xi, yi, xj, yj)) {
      return true;
    }

    const intersecta =
      (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersecta) {
      dentro = !dentro;
    }
  }

  return dentro;
}


function puntoEnSegmento_(px, py, x1, y1, x2, y2) {
  const epsilon = 1e-10;

  const cross = (py - y1) * (x2 - x1) - (px - x1) * (y2 - y1);

  if (Math.abs(cross) > epsilon) {
    return false;
  }

  const dot = (px - x1) * (x2 - x1) + (py - y1) * (y2 - y1);

  if (dot < -epsilon) {
    return false;
  }

  const lengthSquared = Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2);

  if (dot - lengthSquared > epsilon) {
    return false;
  }

  return true;
}


/****************************************************
 * DIRECCIÓN NORMALIZADA DESDE GOOGLE
 * (el código postal ya no sale de aquí: ver resolverCodigoPostal_)
 ****************************************************/

function guardarDireccionNormalizada_(result, fila, IDX) {
  const components = result.address_components || [];

  let calleOficial = "";
  let numeroOficial = "";
  let subpremiseOficial = "";
  let premiseOficial = "";

  for (let j = 0; j < components.length; j++) {
    const component = components[j];
    const types = component.types || [];

    if (types.indexOf("route") !== -1) {
      calleOficial = component.short_name || component.long_name || "";
    }

    if (types.indexOf("street_number") !== -1) {
      numeroOficial = component.long_name || "";
    }

    if (types.indexOf("subpremise") !== -1) {
      subpremiseOficial = component.long_name || "";
    }

    if (types.indexOf("premise") !== -1) {
      premiseOficial = component.long_name || "";
    }
  }

  const streetNum = numeroOficial.replace(/^#\s*/, "").trim();

  fila[IDX.CALLE_NORMALIZADA] = calleOficial.trim();

  let complementoCompleto = "";

  if (streetNum !== "") {
    complementoCompleto = "#" + streetNum;
  }

  let detAdicional = "";

  if (premiseOficial !== "") {
    detAdicional += " " + premiseOficial;
  }

  if (subpremiseOficial !== "") {
    detAdicional += " " + subpremiseOficial;
  }

  detAdicional = detAdicional.trim();

  if (detAdicional !== "") {
    if (complementoCompleto !== "") {
      complementoCompleto += " " + detAdicional;
    } else {
      complementoCompleto = detAdicional;
    }
  }

  fila[IDX.COMPLEMENTO_NORMALIZADO] = complementoCompleto.trim();
}


/****************************************************
 * HELPERS
 ****************************************************/

function obtenerApiKey_() {
  const apiKey = PropertiesService
    .getScriptProperties()
    .getProperty("GOOGLE_MAPS_API_KEY");

  if (!apiKey) {
    throw new Error("Falta configurar la propiedad GOOGLE_MAPS_API_KEY en Apps Script.");
  }

  return apiKey;
}


function obtenerIndiceHeader_(headers, nombre) {
  const idx = headers.indexOf(nombre);

  if (idx === -1) {
    throw new Error("No se encontró la columna '" + nombre + "' en la hoja Bricks.");
  }

  return idx;
}


function normalizarHeader_(texto) {
  return String(texto || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}


function normalizarTexto_(texto) {
  return String(texto || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function ciudadCompatible_(ciudadA, ciudadB) {
  const a = normalizarTexto_(ciudadA);
  const b = normalizarTexto_(ciudadB);

  if (!a || !b) {
    return true;
  }

  if (a === b) {
    return true;
  }

  // Casos tipo:
  // "BOGOTA DC" contiene "BOGOTA"
  // "SANTIAGO DE CALI" contiene "CALI"
  return a.indexOf(b) !== -1 || b.indexOf(a) !== -1;
}


function convertirNumero_(valor) {
  if (typeof valor === "number") {
    return valor;
  }

  if (valor === null || valor === undefined || valor === "") {
    return null;
  }

  const texto = String(valor)
    .replace(/,/g, ".")
    .trim();

  const numero = parseFloat(texto);

  return isNaN(numero) ? null : numero;
}


/**
 * Acepta "4.7109886,-74.072092" y también "4,7109886,-74,072092"
 * (coma decimal, como llega de algunos exports).
 */
function parsearLatLng_(entrada) {
  const partes = String(entrada).split(",").map(function (p) {
    return p.trim();
  });

  let lat = null;
  let lng = null;

  if (partes.length === 2) {
    lat = convertirNumero_(partes[0]);
    lng = convertirNumero_(partes[1]);
  } else if (partes.length === 4) {
    lat = convertirNumero_(partes[0] + "." + partes[1]);
    lng = convertirNumero_(partes[2] + "." + partes[3]);
  }

  if (!esNumeroValido_(lat) || !esNumeroValido_(lng)) {
    return null;
  }

  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }

  return { lat: lat, lng: lng };
}


function esNumeroValido_(valor) {
  return typeof valor === "number" && isFinite(valor);
}


function formatearCoordenada_(valor) {
  const numero = convertirNumero_(valor);

  if (!esNumeroValido_(numero)) {
    return "";
  }

  // 7 decimales es suficiente para precisión urbana.
  // Se devuelve como texto para que Sheets conserve el punto decimal.
  return numero.toFixed(7).replace(",", ".");
}


function distanciaHaversineMetros_(lat1, lng1, lat2, lng2) {
  const R = 6371000;

  const phi1 = gradosARadianes_(lat1);
  const phi2 = gradosARadianes_(lat2);
  const deltaPhi = gradosARadianes_(lat2 - lat1);
  const deltaLambda = gradosARadianes_(lng2 - lng1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}


function gradosARadianes_(grados) {
  return grados * Math.PI / 180;
}
