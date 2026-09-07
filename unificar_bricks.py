# -*- coding: utf-8 -*-
"""
Unifica los KML de bricks de Colombia (kml_fuentes/) en Colombia_Bricks.kml
y Colombia_Bricks.xlsx con el esquema estandar:

    brick_id      -> codigo corto estable, <= 10 caracteres (ej. "BOG-001"),
                     apto para el campo de brick del CRM
    nombre        -> nombre del brick (barrio/comuna/UPU/zona ruta)
    zona          -> nivel intermedio: localidad para Bogota, la ciudad para el resto
    ciudad        -> ciudad
    departamento  -> departamento
    nombre_brick  -> "ZONA, NOMBRE" (ej. "CALI, SANTA ELENA")

Los brick_id viven en brick_ids.csv (registro persistente): un codigo ya
asignado NUNCA cambia; los bricks nuevos reciben el siguiente numero libre de
su ciudad. No borrar ese archivo — es la memoria de los codigos ya cargados
en CRM.

Los placemarks que comparten nombre_brick (comunas partidas de Medellin) se
fusionan en un solo brick MultiPolygon, de modo que nombre_brick es unico.

Todos los textos se normalizan: MAYUSCULAS y sin tildes (se conserva la Ñ).
KML y Excel se generan juntos desde el mismo GeoDataFrame: nunca editar uno
a mano — cambiar las fuentes o MAPEOS y volver a ejecutar este script.
El Excel incluye ademas centroide, bounding box y la geometria en GeoJSON
por brick, para reutilizar los bricks fuera de aqui (Apps Script, etc.)
sin depender del KML.

Uso:  python unificar_bricks.py
"""

import csv
import json
import subprocess
import sys
import unicodedata
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape


def asegurar_librerias():
    """Instala las librerias necesarias si no estan disponibles."""
    faltantes = []
    for lib in ("geopandas", "shapely", "openpyxl"):
        try:
            __import__(lib)
        except ImportError:
            faltantes.append(lib)
    if faltantes:
        print(f"Instalando librerias faltantes: {', '.join(faltantes)}")
        subprocess.check_call([sys.executable, "-m", "pip", "install", *faltantes])


asegurar_librerias()

import geopandas as gpd  # noqa: E402
from shapely.geometry import MultiPolygon, Polygon, mapping  # noqa: E402
from shapely.ops import unary_union  # noqa: E402

NS = {"kml": "http://www.opengis.net/kml/2.2"}
RAIZ = Path(__file__).parent
CARPETA_FUENTES = RAIZ / "kml_fuentes"
RUTA_LOCALIDADES_BOGOTA = RAIZ / "Localidad_Bogota.kml"
ARCHIVO_SALIDA = RAIZ / "Colombia_Bricks.kml"
ARCHIVO_EXCEL = RAIZ / "Colombia_Bricks.xlsx"
ARCHIVO_GEOJSON = RAIZ / "Colombia_Bricks.geojson"  # para Leaflet (web app)
ARCHIVO_IDS = RAIZ / "brick_ids.csv"  # registro persistente de brick_id (no borrar)

CAMPOS = ["brick_id", "nombre", "zona", "ciudad", "departamento", "nombre_brick"]

# Excel limita cada celda a 32.767 caracteres; margen para geometria_geojson
LIMITE_CELDA_EXCEL = 32000

# Google My Maps rechaza KML > 5 MB: se simplifica la geometria (tolerancia en
# grados; 0.00005 ~ 5.5 m, imperceptible a escala de ciudad) y se redondean
# las coordenadas a 6 decimales (~10 cm). Subir la tolerancia si vuelve a crecer.
TOLERANCIA_SIMPLIFICACION = 0.00005
DECIMALES_COORDENADA = 6

# Codigo postal -> nombre comercial de la zona ruta (Cartagena)
ZONAS_RUTA_CARTAGENA = {
    "130001": "Centro / Bocagrande",
    "130002": "Crespo / Marbella",
    "130003": "Daniel Lemaitre / La Popa",
    "130004": "Olaya / Boston",
    "130005": "Olaya / Gaviotas",
    "130006": "Nuevo Paraíso / La Magdalena",
    "130007": "Rural Sur",
    "130008": "Bicentenario / La Carolina",
    "130009": "Rural Periférica",
    "130010": "Ternera / Santa Lucía",
    "130011": "Blas de Lezo / Socorro",
    "130012": "Nelson Mandela / San Pedro",
    "130013": "Mamonal / Industrial",
    "130014": "El Country / Calamares",
    "130015": "Nuevo Bosque / Piedra Bolívar",
    "130017": "Rural Norte",
    "130018": "Zona Insular",
    "130019": "Zona Costera",
    "130027": "Corregimientos Costeros",
}

# ---------------------------------------------------------------------------
# Mapeo por archivo: como obtener "nombre" desde cada estructura de origen.
# atributos = dict con los campos de ExtendedData (Data y SchemaData/SimpleData)
# nombre_placemark = contenido de <name> del Placemark (o None si no tiene)
# "zona" por defecto es la ciudad; Bogota la sobreescribe con la localidad
# mediante cruce espacial (ver asignar_localidades_bogota).
# "prefijo" = 3 letras con las que se forman los brick_id ("BOG" -> BOG-001).
# ---------------------------------------------------------------------------
MAPEOS = {
    # Barrios: solo tienen <name>, sin tabla de atributos
    "Brick_Bogota.kml": {
        "ciudad": "Bogotá",
        "departamento": "Bogotá D.C.",
        "prefijo": "BOG",
        "nombre": lambda nombre_placemark, atributos: nombre_placemark,
    },
    # Comunas: <name> con prefijo "MEDELLIN,"; ExtendedData sin poblar ("Pendiente")
    "Brick_Medellin.kml": {
        "ciudad": "Medellín",
        "departamento": "Antioquia",
        "prefijo": "MED",
        "nombre": lambda nombre_placemark, atributos: (
            nombre_placemark.split(",", 1)[-1] if nombre_placemark else None
        ),
    },
    # UPU: sin <name> por placemark; el nombre esta en SchemaData/nombre_upu
    "Brick_Cali.kml": {
        "ciudad": "Cali",
        "departamento": "Valle del Cauca",
        "prefijo": "CAL",
        "nombre": lambda nombre_placemark, atributos: atributos.get("nombre_upu"),
    },
    # Zonas postales: el codigo postal se traduce a nombre comercial de zona ruta
    "Brick_Cartagena.kml": {
        "ciudad": "Cartagena",
        "departamento": "Bolívar",
        "prefijo": "CTG",
        "nombre": lambda nombre_placemark, atributos: ZONAS_RUTA_CARTAGENA.get(
            atributos.get("Código Postal", "").strip(),
            atributos.get("name") or nombre_placemark,
        ),
    },
}


def normalizar(texto):
    """MAYUSCULAS, sin tildes (conserva la Ñ) y espacios colapsados."""
    if texto is None:
        return ""
    texto = str(texto).upper().replace("Ñ", "\0")
    texto = unicodedata.normalize("NFD", texto)
    texto = "".join(c for c in texto if unicodedata.category(c) != "Mn")
    texto = texto.replace("\0", "Ñ")
    return " ".join(texto.split())


def extraer_atributos(placemark):
    """Lee ExtendedData en sus dos variantes: <Data name=..> y <SimpleData name=..>."""
    atributos = {}
    for data in placemark.findall(".//kml:ExtendedData/kml:Data", NS):
        valor = data.find("kml:value", NS)
        atributos[data.get("name")] = (valor.text or "").strip() if valor is not None else ""
    for simple in placemark.findall(".//kml:ExtendedData//kml:SimpleData", NS):
        atributos[simple.get("name")] = (simple.text or "").strip()
    return atributos


def parsear_anillo(elemento_linearring):
    coords = []
    texto = elemento_linearring.find("kml:coordinates", NS).text or ""
    for tupla in texto.split():
        partes = tupla.split(",")
        coords.append((float(partes[0]), float(partes[1])))
    return coords


def extraer_poligonos(placemark):
    """Devuelve la geometria como Polygon/MultiPolygon (soporta MultiGeometry y huecos)."""
    poligonos = []
    for pol in placemark.findall(".//kml:Polygon", NS):
        exterior = parsear_anillo(pol.find(".//kml:outerBoundaryIs/kml:LinearRing", NS))
        huecos = [
            parsear_anillo(anillo)
            for anillo in pol.findall(".//kml:innerBoundaryIs/kml:LinearRing", NS)
        ]
        poligonos.append(Polygon(exterior, huecos))
    if not poligonos:
        return None
    return poligonos[0] if len(poligonos) == 1 else MultiPolygon(poligonos)


def iterar_placemarks(ruta):
    """Genera (nombre_placemark, atributos, geometria) por cada Placemark con poligono."""
    arbol = ET.parse(ruta)
    for placemark in arbol.getroot().iter(f"{{{NS['kml']}}}Placemark"):
        geometria = extraer_poligonos(placemark)
        if geometria is None:
            continue
        elemento_nombre = placemark.find("kml:name", NS)
        nombre_placemark = (
            elemento_nombre.text.strip()
            if elemento_nombre is not None and elemento_nombre.text
            else None
        )
        yield nombre_placemark, extraer_atributos(placemark), geometria


def leer_archivo(ruta, mapeo):
    """Extrae los bricks de un KML fuente aplicando su mapeo al esquema estandar."""
    filas = []
    for nombre_placemark, atributos, geometria in iterar_placemarks(ruta):
        nombre = mapeo["nombre"](nombre_placemark, atributos)
        filas.append(
            {
                "nombre": normalizar(nombre) or "SIN NOMBRE",
                "zona": normalizar(mapeo["ciudad"]),  # Bogota se sobreescribe luego
                "ciudad": normalizar(mapeo["ciudad"]),
                "departamento": normalizar(mapeo["departamento"]),
                "geometry": geometria,
            }
        )
    return filas


def asignar_localidades_bogota(filas):
    """Asigna a cada brick de Bogota su localidad (zona) por mayor area de traslape."""
    if not RUTA_LOCALIDADES_BOGOTA.exists():
        print(f"AVISO: no se encontro {RUTA_LOCALIDADES_BOGOTA.name}; "
              "los bricks de Bogota quedan con zona=BOGOTA.")
        return
    localidades = [
        (normalizar(nombre), geometria)
        for nombre, _, geometria in iterar_placemarks(RUTA_LOCALIDADES_BOGOTA)
        if nombre
    ]
    sin_localidad = 0
    for fila in filas:
        if fila["ciudad"] != "BOGOTA":
            continue
        brick = fila["geometry"]
        mejor_nombre, mejor_area = None, 0.0
        for nombre_localidad, geometria_localidad in localidades:
            if not brick.intersects(geometria_localidad):
                continue
            area = brick.intersection(geometria_localidad).area
            if area > mejor_area:
                mejor_nombre, mejor_area = nombre_localidad, area
        if mejor_nombre:
            fila["zona"] = mejor_nombre
        else:
            sin_localidad += 1
    if sin_localidad:
        print(f"AVISO: {sin_localidad} bricks de Bogota no cruzaron con ninguna "
              "localidad y quedan con zona=BOGOTA.")


def fusionar_duplicados(filas):
    """Une en un solo brick (MultiPolygon) los placemarks que comparten nombre_brick.

    Ocurre en Medellin: dos comunas vienen partidas en dos placemarks disjuntos
    con el mismo nombre. Asi nombre_brick queda como clave unica.
    """
    por_nombre = {}
    for fila in filas:
        previa = por_nombre.get(fila["nombre_brick"])
        if previa is None:
            por_nombre[fila["nombre_brick"]] = fila
        else:
            previa["geometry"] = unary_union([previa["geometry"], fila["geometry"]])
    fusionados = len(filas) - len(por_nombre)
    if fusionados:
        print(f"AVISO: {fusionados} placemarks con nombre_brick repetido "
              "fusionados en un solo brick.")
    return list(por_nombre.values())


def asignar_brick_ids(filas):
    """Asigna a cada brick su codigo corto estable (<= 10 caracteres, ej. BOG-001).

    brick_ids.csv es la memoria de los codigos: los ya asignados nunca cambian
    (ya viven en el CRM); un brick nuevo recibe el siguiente numero libre de su
    ciudad y se agrega al registro. Si un brick desaparece de las fuentes, su
    codigo queda reservado y no se reutiliza.
    """
    registro = {}
    if ARCHIVO_IDS.exists():
        with open(ARCHIVO_IDS, newline="", encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                registro[r["nombre_brick"]] = r["brick_id"]

    prefijos = {normalizar(m["ciudad"]): m["prefijo"] for m in MAPEOS.values()}
    contador = {}
    for brick_id in registro.values():
        pref, num = brick_id.rsplit("-", 1)
        contador[pref] = max(contador.get(pref, 0), int(num))

    nuevos = 0
    for fila in sorted(filas, key=lambda f: (f["ciudad"], f["nombre_brick"])):
        if fila["nombre_brick"] not in registro:
            pref = prefijos.get(fila["ciudad"])
            if pref is None:
                sys.exit(f"La ciudad {fila['ciudad']} no tiene 'prefijo' en MAPEOS; "
                         "agregarlo para poder generar sus brick_id.")
            contador[pref] = contador.get(pref, 0) + 1
            registro[fila["nombre_brick"]] = f"{pref}-{contador[pref]:03d}"
            nuevos += 1
    for fila in filas:
        fila["brick_id"] = registro[fila["nombre_brick"]]

    if nuevos:
        with open(ARCHIVO_IDS, "w", newline="", encoding="utf-8-sig") as f:
            escritor = csv.writer(f)
            escritor.writerow(["brick_id", "nombre_brick"])
            for nombre, brick_id in sorted(registro.items(), key=lambda kv: kv[1]):
                escritor.writerow([brick_id, nombre])
        print(f"{nuevos} brick_id nuevos registrados en {ARCHIVO_IDS.name}")


def construir_filas():
    """Lee todas las fuentes y devuelve las filas completas del esquema estandar
    (geometria en precision original, sin simplificar). Es el unico camino de
    construccion de bricks: lo usan este script y asignar_bricks.py."""
    filas = []
    for ruta in sorted(CARPETA_FUENTES.glob("*.kml")):
        mapeo = MAPEOS.get(ruta.name)
        if mapeo is None:
            print(f"AVISO: {ruta.name} no tiene mapeo definido en MAPEOS, se omite.")
            continue
        nuevas = leer_archivo(ruta, mapeo)
        print(f"{ruta.name}: {len(nuevas)} poligonos -> ciudad={normalizar(mapeo['ciudad'])}")
        filas.extend(nuevas)
    asignar_localidades_bogota(filas)
    for fila in filas:
        fila["nombre_brick"] = f"{fila['zona']}, {fila['nombre']}"
    filas = fusionar_duplicados(filas)
    asignar_brick_ids(filas)
    return filas


def exportar_kml(gdf, ruta):
    """Escribe el KML unificado: nombre_brick en <name>, todos los campos en ExtendedData."""
    partes = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<kml xmlns="http://www.opengis.net/kml/2.2">',
        "<Document><name>Colombia Bricks</name>",
    ]
    d = DECIMALES_COORDENADA
    for _, fila in gdf.iterrows():
        geom = fila.geometry
        poligonos = geom.geoms if geom.geom_type == "MultiPolygon" else [geom]
        kml_poligonos = []
        for pol in poligonos:
            anillos = [
                "<outerBoundaryIs><LinearRing><coordinates>"
                + " ".join(f"{x:.{d}f},{y:.{d}f}" for x, y in pol.exterior.coords)
                + "</coordinates></LinearRing></outerBoundaryIs>"
            ]
            for interior in pol.interiors:
                anillos.append(
                    "<innerBoundaryIs><LinearRing><coordinates>"
                    + " ".join(f"{x:.{d}f},{y:.{d}f}" for x, y in interior.coords)
                    + "</coordinates></LinearRing></innerBoundaryIs>"
                )
            kml_poligonos.append("<Polygon>" + "".join(anillos) + "</Polygon>")
        cuerpo = (
            kml_poligonos[0]
            if len(kml_poligonos) == 1
            else "<MultiGeometry>" + "".join(kml_poligonos) + "</MultiGeometry>"
        )
        datos = "".join(
            f'<Data name="{campo}"><value>{escape(fila[campo])}</value></Data>'
            for campo in CAMPOS
        )
        partes.append(
            "<Placemark>"
            f"<name>{escape(fila['nombre_brick'])}</name>"
            f"<ExtendedData>{datos}</ExtendedData>"
            + cuerpo
            + "</Placemark>"
        )
    partes.append("</Document></kml>")
    ruta.write_text("\n".join(partes), encoding="utf-8")


def geometria_para_celda(geom, etiqueta):
    """Geometria como GeoJSON compacto que quepa en una celda de Excel.

    Si excede el limite se re-simplifica doblando la tolerancia hasta caber
    (solo afecta esta columna, no al KML/GeoJSON).
    """
    import shapely

    tolerancia = TOLERANCIA_SIMPLIFICACION or 0.00005
    texto = json.dumps(mapping(geom), separators=(",", ":"))
    while len(texto) > LIMITE_CELDA_EXCEL:
        tolerancia *= 2
        geom = shapely.set_precision(
            geom.simplify(tolerancia, preserve_topology=True),
            grid_size=10 ** -DECIMALES_COORDENADA,
        )
        anterior, texto = len(texto), json.dumps(mapping(geom), separators=(",", ":"))
        print(f"AVISO: geometria_geojson de {etiqueta} re-simplificada "
              f"(tolerancia {tolerancia}) para caber en la celda: "
              f"{anterior:,} -> {len(texto):,} caracteres.")
    return texto


def exportar_excel(gdf, ruta):
    """Escribe el Excel gemelo del KML: mismas filas, hoja Bricks + hoja Resumen.

    Ademas de los CAMPOS, la hoja Bricks lleva centroide, bounding box y
    geometria_geojson (poligono simplificado), para poder etiquetar puntos de
    venta desde la tabla sola (Apps Script u otros) sin depender del KML:
    filtro barato por bounding box y luego punto-en-poligono sobre el GeoJSON.
    """
    import pandas as pd

    d = DECIMALES_COORDENADA
    bricks = pd.DataFrame({campo: gdf[campo] for campo in CAMPOS})
    bricks["lat_centroide"] = [round(g.centroid.y, d) for g in gdf.geometry]
    bricks["lon_centroide"] = [round(g.centroid.x, d) for g in gdf.geometry]
    limites = gdf.geometry.bounds
    bricks["lat_min"] = limites["miny"].round(d).values
    bricks["lat_max"] = limites["maxy"].round(d).values
    bricks["lon_min"] = limites["minx"].round(d).values
    bricks["lon_max"] = limites["maxx"].round(d).values
    bricks["geometria_geojson"] = [
        geometria_para_celda(g, fila_id)
        for fila_id, g in zip(gdf["brick_id"], gdf.geometry)
    ]

    resumen = (
        bricks.groupby(["departamento", "ciudad", "zona"])
        .size()
        .reset_index(name="total_bricks")
    )
    with pd.ExcelWriter(ruta, engine="openpyxl") as escritor:
        bricks.to_excel(escritor, sheet_name="Bricks", index=False)
        resumen.to_excel(escritor, sheet_name="Resumen", index=False)


def main():
    filas = construir_filas()
    gdf = gpd.GeoDataFrame(filas, geometry="geometry", crs="EPSG:4326")
    gdf = gdf.sort_values("brick_id").reset_index(drop=True)
    if TOLERANCIA_SIMPLIFICACION:
        import shapely

        gdf["geometry"] = gdf.geometry.simplify(
            TOLERANCIA_SIMPLIFICACION, preserve_topology=True
        )
        # Recorta los decimales tambien en el GeoJSON (to_json no tiene opcion)
        gdf["geometry"] = shapely.set_precision(
            gdf.geometry.values, grid_size=10 ** -DECIMALES_COORDENADA
        )
    print(f"\nTotal unificado: {len(gdf)} bricks")
    print(gdf.groupby(["ciudad", "zona"]).size().to_string())

    exportar_kml(gdf, ARCHIVO_SALIDA)
    exportar_excel(gdf, ARCHIVO_EXCEL)
    ARCHIVO_GEOJSON.write_text(gdf.to_json(drop_id=True), encoding="utf-8")
    print(f"\nExportado: {ARCHIVO_SALIDA}")
    print(f"Exportado: {ARCHIVO_EXCEL}")
    print(f"Exportado: {ARCHIVO_GEOJSON}")


if __name__ == "__main__":
    main()
