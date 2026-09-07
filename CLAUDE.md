# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es este directorio

Proyecto de datos geoespaciales: 4 archivos KML con polígonos de zonas ("bricks") de ciudades de Colombia — Bogotá, Medellín, Cali y Cartagena. No es un repositorio git.

- `kml_fuentes/` — copia de los 4 KML originales (los del directorio raíz son los originales sin tocar).
- `Localidad_Bogota.kml` — 20 localidades de Bogotá; capa de referencia (NO es fuente de bricks, vive en la raíz). Se usa para asignar la `zona` de cada brick de Bogotá por mayor área de traslape.
- `unificar_bricks.py` — homologa los 4 esquemas al estándar `brick_id`, `nombre`, `zona`, `ciudad`, `departamento`, `nombre_brick` ("ZONA, NOMBRE", ej. "CALI, SANTA ELENA") y genera **juntos** `Colombia_Bricks.kml`, `Colombia_Bricks.xlsx` y `Colombia_Bricks.geojson` (este último alimenta la web app de Leaflet — ver `PLAN_VISOR_PDV.md`) (162 bricks; el Excel tiene hojas Bricks y Resumen). Ejecutar con `python unificar_bricks.py`. El mapeo por archivo está en el dict `MAPEOS`; para agregar una ciudad nueva basta con soltar el KML en `kml_fuentes/` y añadir su entrada allí (incluido su `prefijo` de 3 letras).
- `brick_id` — código corto estable ≤ 10 caracteres (`BOG-001`, `MED-001`, `CAL-001`, `CTG-001`), pensado para el campo de brick del CRM (limitado a 10 caracteres). El registro `brick_ids.csv` (brick_id → nombre_brick) es la **memoria de los códigos: nunca borrarlo ni editarlo a mano**; un código asignado no cambia jamás, los bricks nuevos reciben el siguiente número libre de su ciudad y los códigos de bricks retirados no se reutilizan.
- La hoja Bricks del Excel lleva además `lat_centroide`/`lon_centroide`, bounding box (`lat_min`/`lat_max`/`lon_min`/`lon_max`) y `geometria_geojson` (polígono simplificado en GeoJSON compacto), de modo que la tabla sola permite etiquetar puntos de venta desde Apps Script u otros proyectos (filtro por bounding box + punto-en-polígono). Si una geometría no cabe en la celda (límite Excel 32.767 caracteres), se re-simplifica solo esa columna (`geometria_para_celda`).
- Los placemarks que comparten `nombre_brick` (2 comunas de Medellín partidas en polígonos disjuntos) se fusionan en un solo brick MultiPolygon — por eso 18 placemarks de Medellín dan 16 bricks y el total es 162, no 164. `nombre_brick` es clave única.
- `asignar_bricks.py` — asigna brick a puntos de venta por coordenadas (cruce espacial con los polígonos en precisión completa, no los simplificados; reutiliza `construir_filas()` de `unificar_bricks.py`). Acepta .xlsx/.csv local o URL de Google Sheets compartida por enlace: `python asignar_bricks.py "<archivo o URL>"`. Genera `*_con_brick.xlsx` con `Brick_Asignado`, `Brick_ID` (vacío si no cruzó con un brick real) y `Brick_Metodo` (DENTRO / CERCANO_<m>M hasta 550 m / SIN_COORDENADA / COORDENADA_INVALIDA / FUERA_DE_BRICKS). Tolera coma decimal y detecta columnas lat/lon por nombre.
- Jerarquía: departamento > ciudad > zona > brick. La `zona` es la localidad solo en Bogotá; en las demás ciudades zona = ciudad. En Cartagena el `nombre` es el nombre comercial de la zona ruta (dict `ZONAS_RUTA_CARTAGENA`, clave = código postal), no el código postal.
- Normalización de todos los textos: MAYÚSCULAS y sin tildes (la Ñ se conserva) — función `normalizar()`.
- El KML de salida se mantiene < 5 MB (límite de Google My Maps): geometría simplificada (`TOLERANCIA_SIMPLIFICACION = 0.00005` grados ≈ 5.5 m) y coordenadas a 6 decimales. La simplificación ocurre DESPUÉS del cruce con localidades, así que no afecta la asignación de zona.
- **Regla de sincronía**: KML y Excel salen del mismo GeoDataFrame — nunca editarlos a mano; ante cualquier cambio, modificar las fuentes o `MAPEOS` y volver a ejecutar el script.
- El parseo se hace con `xml.etree` + shapely (no con `gpd.read_file`) porque el driver KML de fiona/pyogrio no lee los campos de `ExtendedData` y Medellín tiene bloques duplicados.
- Python 3.13 con geopandas 1.1.2 ya instalado en la máquina.

## Cómo trabajar con los archivos

- Los KML son grandes (0.8–2.8 MB) y varios están minificados en pocas líneas muy largas, por lo que la herramienta Read falla o trunca. Usa PowerShell con `[System.IO.File]::ReadAllText()` + regex (`[regex]::Matches`) para extraer fragmentos, o Grep para localizar patrones.
- Codificación: UTF-8 con caracteres acentuados en nombres de campos (p. ej. `Código Postal`, `Descripción`) — cuidado al escribir archivos desde PowerShell 5.1 (usar `-Encoding utf8`).

## Estructura de los datos: cada archivo tiene un esquema DISTINTO

No existe un esquema de atributos común; cualquier unificación requiere mapeo manual por archivo:

| Archivo | Placemarks | Unidad geográfica | Atributos |
|---|---|---|---|
| `Brick_Bogota.kml` | 112 | Barrios (nombre en `<name>`, p. ej. "SANTA BARBARA") | **Ninguno** — sin `ExtendedData`, solo el nombre |
| `Brick_Medellin.kml` | 18 | Comunas (`<name>` con formato `MEDELLIN,Popular - 1`) | `<Data>`: `Brick_ID`, `Nombre_Zona`, `Ventas_Ranking` — todos con valor placeholder `"Pendiente"` |
| `Brick_Cali.kml` | 15 | UPU (Unidades de Planificación Urbana, fuente IDESC) | `<Schema>`/`<SimpleData>`: `upu` (short), `nombre_upu`, `area_ha`, `estado`, `url1` |
| `Brick_Cartagena.kml` | 19 | Zonas postales | `<Data>`: `Descripción`, `name`, `Código Postal`, `Detalles` (URL) |

Particularidades importantes:
- **Medellín**: cada Placemark repite el bloque `<ExtendedData>` 3 veces (duplicación, KML técnicamente inválido); los tres campos están sin poblar (`Pendiente`).
- **Cali**: los Placemarks NO tienen `<name>` individual; el identificador está en el atributo `upu` / `nombre_upu` dentro de `SchemaData`.
- **Bogotá y Medellín** parecen exportados de la misma herramienta (carpetas `temp_Brick_*`, mismo estilo de línea roja `ff0000ff`); Cali y Cartagena provienen de fuentes oficiales/externas distintas.
- Coordenadas en WGS84 (lon,lat[,alt]); Bogotá incluye altitud `,0`, Medellín no.
