# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es este directorio

Proyecto de Google Apps Script (clasp) vinculado a la hoja de cálculo **"MAESTRO PDV's"** (`1fILFlz4cO4mmW-oOnhTuewCicoWJ8bzFUUAN30GaewI`). El directorio padre (`Bricks CO/`) tiene su propio CLAUDE.md con el pipeline Python que genera los bricks — leerlo antes de tocar nada relacionado con bricks.

**Contiene DOS proyectos lógicos en el mismo contenedor de script; no mezclarlos:**

1. **Web app "Visor PDV + Bricks"** — `Code.js` + `Index.html` + los módulos que este inyecta (`Estilos.html`, `JsNucleo.html`, `JsFiltros.html`, `JsMapa.html`, `JsPaneles.html`, más `JsVentasMtd.html` y `JsSIvsSO.html`). **Tres pestañas de nivel superior**: **Ventas MTD** (la primera y la que abre por defecto), **SI vs SO** y **Mapa**. Las definiciones de cada KPI, sus fuentes, contra qué se comparan y los hallazgos de la auditoría del 2026-10-03 están en [DOCUMENTACION_KPIS.md](DOCUMENTACION_KPIS.md) — **leerlo antes de tocar una fórmula**. Lo que sigue en esta sección describe el **Mapa**. Dashboard para un **Gerente de Zona** (equipo de visitadores / merch), no un explorador de datos genérico: las decisiones que debe soportar son de cobertura y priorización de PDV. Leaflet sin frameworks sobre teselas de OpenStreetMap. Layout tipo Power BI (rediseño 2026-09-22): **cabecera** con la marca a la izquierda, la barra de filtros multi-selección al centro y "Limpiar filtros" a la derecha; **área central** con el mapa; **panel derecho** con las tarjetas de KPI arriba y, debajo, un panel con pestañas Tabla · Análisis · Brick.
   - **Regla de layout que NO se debe romper**: el dashboard mide `100vh` y **cada panel hace scroll por dentro** (`min-height:0` en los hijos del grid + `overflow-y:auto` en el panel). Nada de contenido apilado en el flujo de la página. Antes la lista de PDV y la tabla resumen se apilaban debajo del mapa y la página llegaba a 2.400px de alto, con el resumen fuera de pantalla — inservible como dashboard. Si se agrega una sección nueva, va **dentro** de un panel existente (o como pestaña), nunca al final del `<body>`. Detalles del grid que sostienen la regla: `.app` es `grid-template-rows:auto auto minmax(0,1fr)` y `.cuerpo` lleva `grid-template-rows:minmax(0,1fr)` — sin esa fila explícita la altura la fija el contenido del panel derecho y el mapa se encoge cuando hay poco que mostrar. `.topbar` tiene `max-height:45vh` como tope de seguridad.
   - **Traducción de términos**: el CRM es de Salesforce (Europa) y usa palabras que no son las que se usan en Colombia. Las etiquetas visibles ya están traducidas (dato interno sin tocar, solo la etiqueta): "Región" → **Departamento**, "Población" → **Ciudad**, "Grupo de compras" → **Cliente**, "NIF/CIF" → **NIT**. Si aparece un campo nuevo del CRM, revisar si necesita el mismo tratamiento antes de mostrarlo tal cual.
   - **`Conectados`** es un supuesto sin confirmar: cuenta PDV con `ID Cliente SAP` diligenciado (no hay un campo "conectado" explícito en el CRM). **`Visitados`** cuenta PDV con `Delegado` (columna "Delegado Name") asignado — no hay fecha de última visita en los datos, así que es la única señal de cobertura disponible. Ajustar en `kpisGeneral()`/`renderTablaRail()` (JsPaneles.html) si el significado de negocio real es otro.
2. **Herramientas de menú de la hoja** — `Menú Principal.js`, `Módulo Cruce de Datos.js`, `Módulo Geocodificación.js`, `Módulo Centros Médicos.js`. Proyecto aparte (menú "🛠️ Herramientas Datos": geocodificación, cruce CRM vs Sell Out, buscador de centros médicos). **No modificarlos al trabajar en el visor**; solo cuidar que no haya colisiones de nombres de funciones globales (todo comparte el mismo scope global de GAS).

## Geocodificación: cómo se obtiene el Código Postal

En Colombia la Geocoding API **casi nunca devuelve `postal_code` en `results[0]` de una búsqueda por dirección**: las direcciones tipo "Calle 30, Barranquilla" resuelven a nivel de vía (`types=route`) o de negocio (`establishment`), y una vía entera atraviesa varios códigos postales, así que Google no le adjunta ninguno. Por eso la hoja llegó a tener 4.202 filas con "Geocodificación OK" y **cero** códigos postales. El CP sí existe: hay que pedirlo por coordenada.

`resolverCodigoPostal_()` va en cascada y para en cuanto encuentra algo:
1. barre **todos** los `results` y todos sus `address_components` de la respuesta que ya se tiene (el CP suele venir en un result de menor granularidad, no en el primero);
2. reverse geocode con `result_type=postal_code` sobre lat/lng — **este es el que resuelve la mayoría**;
3. reverse geocode completo, por si el CP viaja dentro de un result de otro tipo (se salta si la llamada primaria ya era un reverse).

Detalles que no se deben romper:
- La columna **Postal Code se fuerza a formato texto (`@`)**: el CP colombiano tiene 6 dígitos y muchos empiezan por cero (Antioquia `05xxxx`, Atlántico `08xxxx`); como número, Sheets se come el cero inicial.
- Una fila **sin CP no cuenta como terminada** en el chequeo de "saltar fila completa". Antes el CP no entraba en esa condición y las filas ya geocodificadas se saltaban para siempre, así que ninguna corrida posterior las podía arreglar.
- Cuando Google realmente no tiene CP para el punto, se escribe `NOTA_CP_NO_DISPONIBLE` en Notas y esa fila no se reintenta en las siguientes corridas (si no, cada corrida vuelve a gastar cuota en las mismas filas imposibles). Para reintentarlas: `FORZAR_REINTENTO_CP = true` durante una corrida.
- Si solo hay `postal_code_prefix`, se guarda marcado como aproximado en Notas (`ACEPTAR_PREFIJO_POSTAL`).
- `region=co` + `components=country:CO`: sin eso Google puede resolver una dirección colombiana en otro país.
- `REQUEST_DENIED` **corta la corrida** con el `error_message` de Google (clave, API no habilitada, restricción de referrer) en vez de escribir el mismo error en miles de filas.

Rendimiento (el script se ejecutaba fila a fila y no cabía en los 6 min de Apps Script):
- Lectura y escritura **en bloque**. La columna **Dirección Completa es una fórmula** y no se toca; **Enlace Google Maps lleva RichText** y se escribe celda a celda solo cuando hay enlace nuevo.
- `completarCodigosPostales()` (menú "🏷️ Completar solo Código Postal") es la vía para las filas que ya tienen coordenadas: solo llena el CP, en lotes paralelos de `LOTE_FETCH` con `UrlFetchApp.fetchAll()`.
- Todas las funciones cortan a `MINUTOS_MAXIMOS_EJECUCION` (5), vuelcan lo hecho y avisan cuántas filas quedan; la siguiente corrida retoma sola gracias a la lógica de saltar filas completas.
- `diagnosticarCodigoPostal()` (menú "🔎") pide una dirección o `lat,lng` y muestra qué devolvió Google en cada paso de la cascada, sin escribir en la hoja. Es lo primero que hay que correr si alguien reporta que falta un CP.

## Buscador de Centros Médicos: por qué usa dos APIs de Google en cascada

`Módulo Centros Médicos.js` (hoja `buscador de Centros Médicos`: `Pais`, `Dirección`, `Nombre Centro médico`) resuelve el nombre del centro médico/consultorio en una dirección. No existe ninguna lista propia de centros médicos en el proyecto, así que es un problema de búsqueda, no de cruce de datos:

1. **Geocoding API** resuelve `"<Dirección>, <Pais>"` a una coordenada. A diferencia de `Módulo Geocodificación.js`, aquí **no se fija `region=co`**: el país es un dato de cada fila (la columna existe justo para eso), no una constante del proyecto.
2. **Places API (Nearby Search, legacy — no "Places API (New)")** busca alrededor de esa coordenada, en un radio de `RADIO_BUSQUEDA_CM_METROS` (150 m), y se queda con el resultado más cercano cuyo tipo esté en `TIPOS_LUGAR_SALUD_CM` (`hospital`, `doctor`, `dentist`, `physiotherapist`; se excluye `pharmacy` a propósito — una droguería no es un centro médico). El filtro por tipo se aplica **en el cliente sobre un solo Nearby Search sin `type`**, no con una búsqueda por tipo: la Places API solo acepta un `type` por request, y pagar 4 búsquedas por fila para cubrir los 4 tipos habría multiplicado el costo.

Si falta país o dirección, si Google no geocodifica, o si no hay ningún lugar de salud dentro del radio, la celda se deja vacía — nunca se inventa un dato. Como no hay columna de estado (no se pidió), una fila vacía no distingue "no procesada" de "procesada sin resultado": volver a ejecutar la herramienta reintenta (y vuelve a cobrar) esas filas. Sí hay una caché en memoria por corrida (clave `país|dirección` normalizada con `normalizarTexto_`) para no pagar dos veces la misma dirección repetida en varias filas.

Costo: Places API Nearby Search es una API aparte de Geocoding, con su propio costo por búsqueda (más caro que un geocode) — hay que habilitarla en el mismo proyecto de Google Cloud que la `GOOGLE_MAPS_API_KEY` antes de usar esta herramienta con volumen.

### Las columnas se localizan por encabezado, no por número fijo

**Incidente real (2026-08-11)**: la hoja de direcciones tenía las columnas hardcodeadas por número (`COL.LATITUD = 6`, etc.). El usuario insertó una columna "Departamento" en medio del esquema para enriquecer la fórmula de Dirección Completa, y todo lo que venía después se corrió un lugar — si el script hubiera corrido con el mapeo viejo, habría escrito la latitud encima de la fórmula de Dirección Completa, la longitud encima de la Latitud, etc. en toda fila nueva que procesara.

Arreglo: `resolverColumnas_(sheet)` lee la fila de encabezados al inicio de cada corrida y ubica cada columna por su nombre normalizado (`NOMBRES_COLUMNA`), devolviendo `{ COL, IDX, numColumnas }` (`COL` base 1 para `getRange`, `IDX` base 0 para arrays de `getValues()`). Se pasa como parámetro a todo lo que necesita columnas — `forzarFormatoTexto_`, `escribirSalida_`, `escribirEnlacesMaps_`, `guardarDireccionNormalizada_` — nada depende de un número de columna fijo ni de que las columnas sean contiguas. Insertar/mover una columna ya no rompe nada; **falta** una columna esperada sí sigue siendo un error (mensaje claro con el nombre del encabezado que no encontró).

`escribirSalida_` ya no asume bloques contiguos: escribe cada columna de `CLAVES_ESCRIBIBLES` por separado, una llamada `setValues` por columna (todas las filas de una vez), en la posición real que resolvió `resolverColumnas_`.

Pruebas locales de la lógica pura (sin GAS): se carga el archivo en un contexto `vm` de Node con stubs de `UrlFetchApp`/`SpreadsheetApp`, y una hoja falsa (`crearHojaFake`) parametrizada por un array de encabezados — incluye el caso exacto del incidente (encabezados con "Departamento" insertado) para que no se repita en silencio.

## Ventas MTD, SI vs SO y pruebas (resumen; detalle en DOCUMENTACION_KPIS.md)

- **Un solo endpoint por pestaña** (`getVentasMtdCompletoJson(forzar)`, `getSIvsSOJson(forzar)`), payload compacto v2, cacheado con `conCache_` (candado, no cachea vacíos/errores, `forzar` salta la caché). **No usar `getDataRange()` completo**: `mtdLeerBloque_` lee solo hasta la última columna mapeada. Las columnas se buscan por nombre **exacto** y luego por subcadena (`mtdColEx_`); las obligatorias se validan (`mtdExigir_`) en vez de devolver 0 en silencio.
- **Todo lo que se cachea sale de `jsonAscii_`** (1 carácter = 1 byte): CacheService limita a 100 KB **bytes** por clave.
- **Ventas MTD**: un solo conjunto de filtros globales (`mtdFiltros`, multi-selección, se cambia solo con `setMtdFiltro`) produce `mtdIdsFiltrados()` y **todas** las secciones lo leen (cruce por SAP ID). Las tablas se pintan con el helper `mtdTabla` (clic en encabezado = mayor→menor; TOTAL fijo). Definiciones que **no se deben revertir**: `Real -1`/A-1 = **mismo mes del año anterior**; % cumplimiento = real/plan solo con plan>0; todo "contra el año anterior" se recorta al **mismo corte** (último mes con venta); el periodo sale de la hoja, no del reloj.
- **Fechas**: siempre con la zona horaria del libro (`mtdFecha_(valor, tz)`); nunca getters UTC/locales del script (`appsscript.json` está en `Europe/Madrid`).
- **Pruebas** (Node, sin GAS ni navegador): `node tests/test_servidor_mtd.js`, `tests/test_cliente_mtd.js`, `tests/test_cliente_sivso.js` y `tests/chequeo_sintaxis_html.js` (un error de sintaxis en UN `Js*.html` rompe toda la web app). Corre las cuatro antes de cada `clasp push`.
- **Caché tibia**: `instalarTriggerCache()` (una vez, desde el editor) programa `calentarCache` cada 15 min.

## Deploy

- El usuario ejecuta `clasp push` **manualmente** — no pushear desde Claude.
- **Un `clasp push` a medias rompe el visor de forma engañosa**: si falta alguno de los ocho archivos (`Index`, `Estilos`, `JsNucleo`, `JsFiltros`, `JsMapa`, `JsPaneles`, `JsVentasMtd`, `JsSIvsSO`) o el `Code.js` con `include()`, la plantilla de `Index.html` falla al evaluarse y Apps Script reporta el error **colgado de otro archivo, en la línea 1** (visto: `ReferenceError: x is not defined (línea 1, archivo "Módulo Cruce de Datos")`). No buscar el bug en el archivo que menciona: verificar primero que los ocho estén en el editor y repetir el push.
- Tras un push, la URL de producción de la web app **sigue sirviendo la versión desplegada anterior**: hay que crear una nueva versión del deployment (Implementar → Administrar implementaciones → editar → nueva versión) o probar con la URL `/dev` (implementación de prueba), que siempre sirve el código más reciente. Si "no se ve nada" tras un cambio, revisar esto primero.
- `appsscript.json`: web app con `executeAs: USER_DEPLOYING`, `access: DOMAIN`, V8.

## Arquitectura del visor

**Esta sección se reescribió el 2026-09-22 con el rediseño a layout Power BI + filtros multi-selección. Verificar siempre contra los archivos antes de confiar en un identificador citado aquí; si algo no aparece con `grep`, esta sección quedó desactualizada.**

### Cómo se arma la página

- `doGet()` sirve `Index.html` **como plantilla** (`createTemplateFromFile(...).evaluate()`), porque `Index.html` es solo la estructura y trae los demás archivos con los scriptlets `<?!= include('X') ?>`. `include()` vive en `Code.js`. Si alguien vuelve a `createHtmlOutputFromFile`, los scriptlets salen como texto y la página queda en blanco.
- Reparto de responsabilidades (un archivo = una responsabilidad; no mezclar):

  | Archivo | Qué contiene |
  |---|---|
  | `Index.html` | Solo estructura HTML + los `include` + `iniciarUIBasica();` al final. Leaflet y Choices **ya no** van en el `<head>` (los inyecta `cargarLib`) |
  | `Estilos.html` | Todo el CSS (variables de color, grid, tarjetas, tablas, overrides de Choices) |
  | `JsNucleo.html` | Formatos, estado global, carga de los 5 endpoints, `boot()`, datos mock |
  | `JsFiltros.html` | Modelo de filtros del mapa, `pasa()`, medidas (`ventaPDV`/`ventaSku`), `Selector` (reutilizable: admite ganchos `ops`/`sel`/`alCambiar`, lo usan también los filtros de Ventas MTD), `iniciarUIBasica()` e `iniciarMapaUI()` |
  | `JsMapa.html` | Leaflet: bricks, PDV, escalas de color, leyenda, popups |
  | `JsPaneles.html` | `actualizar()`, KPIs, tabla, gráficas de barras, panel de brick, modal |

- **Arranque en dos tiempos (no invertir; cambió el 2026-10-03)**: (1) `iniciarUIBasica()` pinta Ventas MTD y pide su **única** llamada al servidor, precargando Choices en paralelo; (2) cuando MTD ya se pintó, `programarMapa()` inicia el mapa **en segundo plano** (`iniciarMapa()`: `cargarLib('leaflet')` → `iniciarMapaUI()` → `cargarDatos()`), o antes si el usuario abre la pestaña Mapa (`mapaAlEntrar()`). Antes todo corría junto al abrir: 7 llamadas, un overlay que tapaba la app y dos CDN bloqueantes. El overlay es ahora **local** al panel del mapa (`.mapa-wrap`). `actualizar()` no recrea marcadores si Mapa no es la pestaña visible (`mapaSucio`; se repinta una vez al entrar) y `boot()` solo la dispara cuando hay puntos+bricks+ventas y cuando llegan las asignaciones. `fitBounds` se omite con el mapa oculto (0×0): el `ResizeObserver` reencuadra al mostrarlo. **Dentro de `iniciarMapaUI()`**, `iniciarSelectores()` va **antes** de `crearMapa()`. Mientras los filtros son `<select multiple>` nativos la cabecera mide cientos de píxeles y al mapa le quedan ~5 px; Leaflet cachea ese tamaño al construirse y después calcula un zoom absurdo. Además `observarTamano()` (JsMapa) vigila `.mapa-wrap` con un `ResizeObserver` y llama `map.invalidateSize()` + `reencuadrar()` en **cada** cambio real de tamaño: hace falta también porque el CSS de Choices llega por CDN y el layout vuelve a cambiar cuando aterriza.
- **Teselas**: OpenStreetMap. **No cambiar a CARTO** (Voyager/Positron): desde 2024 sus teselas raster exigen API key y devuelven la imagen con "API KEY REQUIRED" estampada encima; no fallan, así que ni siquiera se puede detectar con `tileerror`.

### Datos

- Al iniciar el **mapa** (no al abrir la app) el frontend hace **cinco llamadas paralelas** por `google.script.run`: `getPuntosJson()`, `getBricksJson()`, `getVentasJson()`, `getPortafolioJson()` y `getAsignacionesJson()`. Cada una marca su flag en `listo{}` y `boot()`/`actOverlay()` esperan a las cinco. Bajo demanda: `getDistribucionSkuJson(sku)`, `getDetallePdvJson`, `getDetalleAgregadoJson`, `getConteoSkuJson`.
- **Todos los endpoints devuelven strings JSON (`JSON.stringify`), nunca objetos**: la serialización de objetos grandes/anidados de `google.script.run` es lenta y falla en silencio. El cliente hace `JSON.parse`. Mantener este patrón al agregar un endpoint nuevo.
- **Tocar un filtro nunca vuelve al servidor**: todo el cruce ocurre en memoria sobre `puntosG`/`ventasG`/`asignacionesG`. Lo único que dispara una llamada durante la sesión es elegir un SKU (distribución), pedir un portafolio o abrir la tabla ampliada (#SKUs).
- Las columnas se localizan por fragmento de encabezado en minúsculas (`buscarCol_`), no por índice fijo: las hojas son export de Salesforce y los nombres pueden variar o traer un prefijo tipo `"Cuenta: Nombre de la cuenta"`.
- `parseNum_()` tolera números nativos, coma decimal ("4,7447"), separadores de miles y espacios. `normalizarPos_()` normaliza POS_ID (mayúsculas, sin espacios, `:` → `_`): es la clave de cruce entre PDV, ventas (Drive) y asignaciones (hoja `Asignacion`).
- `brickCrm` (texto libre del CRM en `Ubicación: Brick`) **no se normaliza** contra la hoja `Bricks`. El brick real de cada PDV para filtros y agregados es el geométrico (`p._brick`, punto-en-polígono en el cliente: `asignarBricks()`/`pip()` en JsMapa.html).

### Filtros multi-selección (el cambio grande de 2026-09-22)

- `filtros` es `{dim: [valores]}` — **arreglo, no un valor suelto**. Arreglo vacío = dimensión sin filtrar (antes era el string `'TODOS'`). Dimensiones: `grupo, channel, region, poblacion, potencial, agente, brick, pdv, bu, mes`. `skuSel` sigue aparte y es **uno solo**, porque dispara una consulta de distribución al servidor.
- `fset[dim]` es el espejo del arreglo como mapa, para que `pasa(p, ig)` sea O(1) por dimensión. **Siempre cambiar los filtros con `setFiltro(dim, arr)`**, que mantiene los dos en sync; escribir `filtros.x` a mano deja `fset` viejo y el filtro deja de aplicar.
- Semántica: **OR dentro de una dimensión, AND entre dimensiones**. `pasa(p, ig)` recibe la dimensión a ignorar para que cada desplegable calcule sus opciones sin excluirse a sí mismo (cascada).
- `filtros.mes` vacío = todos los meses; `recalcIdx()` traduce la selección a `idxSel` (índices de `mesesD`). El `<select id="fPreset">` (Todos / U3 / U6 / Año / Personalizado) escribe en `filtros.mes`; elegir meses a mano deja el preset en "Personalizado".
- **Agregar una dimensión nueva**: sumar su caso a `pasa()`, a `opcionesDe()`, una entrada a `CFG_SELECTORES` y su bloque `<label class="filtro">` con el `<select multiple>` en `Index.html`. El resto (cascada, conteos, chips, contador de "Limpiar filtros") sale solo.

### Choices.js y la clase `Selector`

- Los filtros son `<select multiple>` nativos **mejorados** con Choices.js 10.2.0 por CDN (jsDelivr). Si el CDN está bloqueado, `CHOICES_OK` queda en `false`, se avisa al usuario y los `<select>` nativos siguen funcionando: toda la lógica lee y escribe contra `filtros`, nunca contra el DOM de Choices.
- `Selector` (JsFiltros.html) encapsula cada control: `refrescar()` recalcula opciones y **solo repinta si cambió la firma** (opciones + conteos + selección); `pintar()` arma el payload y se lo entrega a Choices; `fijar()` fuerza el repintado cuando el cambio vino de fuera (clic en el mapa, en una barra, "Limpiar filtros").
- Decisiones que parecen raras pero tienen motivo:
  - `searchChoices:false` — la búsqueda la resuelve `pintar()` con `normTxt` (sin acentos). La búsqueda interna de Choices no ignora tildes: escribir "bogota" no encontraría "Bogotá".
  - `tope` por selector (250 en PDV, 300 en SKU, 400 en brick): a Choices solo se le entregan esas opciones, pero la búsqueda corre sobre la lista completa (`this.todas`). Sin el tope, cada repintado construiría 3.000+ opciones.
  - Al repintar se hace `removeActiveItems()` + `setChoices(..., replace)` con los elegidos marcados `selected`, para que no queden chips duplicados. Excepción: si **solo** cambió el texto de búsqueda (`firmaSel` igual), no se tocan los chips, para no perder el foco mientras se escribe.
  - Los conteos `(n)` van en la etiqueta de la lista pero se recortan del chip (`recortarChips()`): en un control de 140 px un chip "BELLA PIEL (23)" no cabe.
  - El CSS de Choices trae `.choices__list[aria-expanded]{width:100%}`; para darle ancho propio al desplegable hay que **ganar por especificidad** (`.filtros .choices .choices__list--dropdown`), no basta con `.choices__list--dropdown`.

### Paneles, mapa y tabla

- El panel derecho tiene las tarjetas de KPI arriba (`kpisGeneral()` / `kpisProducto()`) y debajo un panel con pestañas (`verVista('tabla'|'analisis'|'brick')`):
  - **Tabla** — `renderTablaRail()`: los PDV del universo filtrado ordenados por Sell Out, tope de `TOPE_TABLA_RAIL` (100) filas; clic en una fila la ubica en el mapa; "ampliar" abre el modal.
  - **Análisis** — brechas del producto, detalle de portafolio, Top 10 PDV, portafolio, y Sell Out por canal / cliente / departamento. Clic en una barra **añade o quita** ese valor del filtro (`alternarFiltro`), no lo reemplaza.
  - **Brick** — solo existe cuando hay **exactamente un** brick seleccionado (`brickUnico()`); si no, la pestaña se oculta.
- Clic en un polígono del mapa llama `aplicarFiltroBrick(id)`: aísla ese brick (y al repetir clic lo suelta) y abre la pestaña Brick. No hay popup de brick: el detalle se lee en el panel.
- Modal `#modalTabla` (`abrirTabla()`): columnas Brick/PDV/Sell Out $/Sell Out und./Asignado/#SKUs con fila TOTAL, tope `TOPE_TABLA_MODAL` (500) filas. El `<select id="tablaDim">` cambia el alcance entre "Selección actual", "Brick" y "Ciudad del brick" (las dos últimas se habilitan solo con un brick único). La columna #SKUs la pide en lote `getConteoSkuJson()` y se cachea en `conteoSkuG` (conteo histórico, no filtrado por período).
- Colores de bricks por ciudad (paleta categórica validada, orden fijo; no reordenar ni inventar tonos): BOGOTA `#2a78d6`, MEDELLIN `#008300`, CALI `#e87ba4`, CARTAGENA `#eda100`, BARRANQUILLA `#8b5cf6`. Ciudad nueva: siguiente slot de la paleta del skill dataviz.
- **Capas de bricks** (`<select id="modoColor">` → `cambiarModo()`/`recolorBricks()`): `rendimiento` (Sell Out), `conectado` (Sell Out solo de PDV con `idSap`), `asignado` (% de PDV con agente) y `ciudad`. Las cuatro comparten cuartiles (`crearEscala()`) y semáforo (`SEM`); `agBricks`/`agConectado`/`agAsignPorBrick` se recalculan en cada `actualizar()`. La **selección** de un brick se marca con grosor de línea y atenuando los demás, no con otro color.
- **Tamaño de los puntos**: el radio es ∝ **raíz** de la venta (`Math.sqrt`) para que el *área* represente la magnitud. No hay reescalado por zoom (los markers se recrean en cada `actualizar()`).
- La hoja **`Asignacion`** (columnas: `Delegado: Delegado Name`, `Cuenta: Id cuenta 18`, `Cuenta: Nombre de la cuenta`, `Cuenta: Tipo de registro de cuenta`, `Team`, `Nº Oficina Farmacia`) asigna un VM o un LAM a cada PDV. `getAsignacionesJson()` cruza por `Nº Oficina Farmacia` normalizado y devuelve `{pdv: {POS_ID: [{delegado,team,tipo,...}, ...]}}` — **arreglo**, porque un PDV puede tener un VM y un LAM a la vez. En el cliente, `asignacionesDe(p)`/`tieneAgente(p)`/`marcaAgenteHtml(p)` alimentan el ícono 👤 y el filtro "Agente"; `tagTipo(tipo)` pinta VM/LAM con `--ink`/`--ink-2`, sin colores nuevos.

## Estilo visual: emular Zebra BI (regla general)

Toda métrica o visual nuevo en este dashboard (tarjetas KPI, gráficas de barras, badges) debe seguir el lenguaje visual de **Zebra BI** (add-in de Power BI/Excel, estilo IBCS): alta densidad de información, cero elementos decorativos.
- Etiquetas de valor **directas** sobre la barra/punto, nunca depender de un eje o leyenda aparte (`pintarBarras()` ya sigue esto — mantenerlo al agregar gráficas).
- Tarjetas KPI **compactas**: poco padding, etiqueta pequeña en mayúsculas y el número grande. Desde el rediseño Power BI (2026-09-22, a pedido explícito del usuario) van centradas, sobre fondo blanco y con una sombra **muy** sutil (`--sombra`, 1-3 px de blur y 6 % de opacidad) — no es la sombra pesada de una tarjeta de material design, y sigue sin haber gradientes ni bordes gruesos. El acento de color va como franja lateral fina (`border-left`, solo en modo producto), nunca recoloreando la tarjeta entera (ver `.kpi`/`.kpi.modo-prod`).
- Color **con significado**, nunca decorativo: la paleta semáforo (`SEM`) ya existe para esto — no introducir colores nuevos que no codifiquen alto/medio/bajo/brecha/selección.
- Tipografía sans-serif chica, números con `font-variant-numeric:tabular-nums` (alineación de dígitos).
- Nada de 3D, gradientes ni iconografía decorativa — el único ícono admitido hoy es 👤 (`badge-agente`) para cobertura de agente, con significado, no decoración.

## Cómo ver el visor sin desplegar (revisión visual)

El visor ya no es un solo archivo: `Index.html` trae los scriptlets `<?!= include('X') ?>`, que solo entiende Apps Script. Para revisarlo en el navegador hay que resolverlos antes, desde el directorio padre:

```bash
python construir_preview.py      # genera ../preview_visor.html
```

Ese archivo se abre directo en el navegador: si no existe `google.script`, `cargarDatos()` entra en modo mock (`cargarMock()` en JsNucleo.html genera 360 PDV deterministas repartidos en Bogotá, Medellín, Cali y Cartagena, con bricks, ventas y asignaciones) y se puede evaluar el layout completo, los filtros y el mapa. **Revisar en el navegador antes de dar por bueno un cambio de UI** — problemas como el mapa de 5 px de alto, el solapamiento de puntos o el layout que crece a 2.400 px no se ven leyendo el código.

`preview_visor.html` se genera **fuera** de `Apps Script/` a propósito: cualquier `.html` dentro de esa carpeta lo subiría `clasp push` al proyecto real. Está en `.gitignore`; regenerarlo tras cada cambio (no editarlo a mano: se sobrescribe).

En esta máquina el **depurador remoto de Chrome está bloqueado por política corporativa** ("DevTools remote debugging is disallowed by the system admin"), así que Puppeteer/Playwright **no funcionan**. Lo que sí funciona es el modo screenshot nativo:

```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu \
  --no-sandbox --hide-scrollbars --window-size=1440,900 --virtual-time-budget=14000 \
  --screenshot="C:\ruta\absoluta\salida.png" "file:///c:/ruta/a/preview_visor.html"
```

Detalles que cuesta redescubrir:
- El `--screenshot` necesita **ruta absoluta de Windows**; con ruta relativa falla con "Access is denied".
- El viewport real es más bajo que `--window-size` (con 1600x950 el `innerHeight` es 852): el margen blanco al pie de la captura no es un bug de layout.
- Captura solo el viewport y **no permite interactuar**. Para ver un estado que requiere clic (una pestaña, un filtro desplegado, el modal), copiar `preview_visor.html` al scratchpad y parchear el arranque envolviendo el último `rec*` del mock — nunca tocar el archivo real:

```js
var _rec=recAsignaciones;
recAsignaciones=function(p){_rec(p);setTimeout(function(){
  setFiltro('poblacion',['BOGOTA','MEDELLIN']);SELECTORES.poblacion.fijar();
  actualizar();verVista('analisis');
},400)};
```

- Para inspeccionar valores en tiempo de ejecución (sin DevTools): escribirlos en `document.title` desde ese mismo parche y leerlos con `--dump-dom | grep -o "<title>[^<]*</title>"`. Los `setTimeout` largos pueden no dispararse dentro del presupuesto de tiempo virtual si hay red pendiente; envolver una función que ya se ejecuta (como `actualizar`) es más fiable que un temporizador suelto.

## Hojas relevantes del spreadsheet

- **`CO_Puntos_Maestro clientes`** (~4.740 filas de datos reales; la cuadrícula aparenta 126k filas pero están vacías). Export de Salesforce. Columnas clave: `Id cuenta 18`, `Nombre de la cuenta`, `Chain: Grupo de compras Name`, `Channel 2`, `Ubicación: Región: Region Name`, `Ubicación: Población`, `Ubicación: Calle` + `Ubicación: Número/Piso`, `Brick Ubicación` (texto libre del CRM, no confiable — a veces trae el `brick_id` corto en vez del nombre), `Ubicación: Coordenadas (Latitud)`/`(Longitud)`, `Units YTD`, `Delegado: Delegado Name` (agregada 2026-08; nombre del delegado/visitador asignado). Las dos columnas `Fecha de creación` se llaman igual (duplicadas).
- **`Bricks`** — espejo de la hoja Bricks de `Colombia_Bricks.xlsx` del proyecto padre (162 bricks: `brick_id`, `nombre`, `zona`, `ciudad`, `departamento`, `nombre_brick`, centroides, bounding box, `geometria_geojson`). No editarla a mano: se regenera con `python unificar_bricks.py` en el directorio padre y se vuelve a pegar/importar.
- **`buscador de Centros Médicos`** — `Pais`, `Dirección`, `Nombre Centro médico`. La llena `buscarCentrosMedicos()` (menú "🏥"); ver "Buscador de Centros Médicos" arriba.

`datos_sheets/` contiene **snapshots CSV locales** de esas dos hojas (UTF-8, tomados 2026-07-17 vía MCP de Google Sheets) para tener contexto sin llamar a la API. Son copias de referencia, no fuente de verdad — el visor siempre lee del spreadsheet en vivo.

## Cómo inspeccionar el spreadsheet

Hay dos servidores MCP de Google Sheets conectados (`gsheets-oauth` y `mcp-gsheets`). Para volúmenes grandes (miles de filas), delegar la lectura a subagentes para no inundar el contexto; los CSV de `datos_sheets/` suelen bastar.
