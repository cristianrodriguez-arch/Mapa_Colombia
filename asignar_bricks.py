# -*- coding: utf-8 -*-
"""
Asigna el brick a cada punto de venta por sus coordenadas (cruce espacial
contra los poligonos de kml_fuentes/, en precision completa, sin simplificar).

Acepta como entrada:
  - un .xlsx o .csv local (descarga del Sheets), o
  - una URL de Google Sheets compartida como "Cualquier persona con el enlace".

Uso:
  python asignar_bricks.py "<archivo.xlsx>" ["<nombre de hoja>"]
  python asignar_bricks.py "https://docs.google.com/spreadsheets/d/<ID>/edit..."

Genera: <entrada>_con_brick.xlsx — espejo de la hoja (mismas filas, mismo
orden) + 3 columnas al final, listas para pegar en el Sheets:
  Brick_Asignado : nombre_brick "ZONA, NOMBRE"; si el punto no cruza con
                   ningun poligono, la ciudad del CRM como pseudo-brick
                   (columna "Poblacion OK" o "Poblacion").
  Brick_ID       : codigo corto estable del brick (<= 10 caracteres, ej.
                   BOG-001) — el valor que cabe en el campo de brick del CRM.
                   Vacio cuando no hubo cruce con un brick real (CIUDAD_CRM,
                   SIN_COORDENADA, etc.).
  Brick_Metodo   : DENTRO / CERCANO_<m>M / CIUDAD_CRM / SIN_COORDENADA /
                   COORDENADA_INVALIDA / FUERA_DE_BRICKS
"""

import re
import sys
import urllib.request
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import Point

import unificar_bricks as u

RAIZ = Path(__file__).parent
# Punto fuera de todo brick: se acepta el brick mas cercano hasta esta distancia
MAX_DISTANCIA_METROS = 550
CRS_METRICO = "EPSG:3116"  # MAGNA-SIRGAS / Colombia Bogota
# Bounding box de Colombia para detectar coordenadas erroneas
LAT_MIN, LAT_MAX, LON_MIN, LON_MAX = -4.3, 13.6, -82.0, -66.0


def descargar_si_es_url(entrada):
    """Si la entrada es una URL de Google Sheets, la descarga como xlsx local."""
    m = re.search(r"docs\.google\.com/spreadsheets/d/([\w-]+)", entrada)
    if not m:
        return Path(entrada)
    url = f"https://docs.google.com/spreadsheets/d/{m.group(1)}/export?format=xlsx"
    destino = RAIZ / "descarga_sheets.xlsx"
    print(f"Descargando Sheets -> {destino.name}")
    try:
        urllib.request.urlretrieve(url, destino)
    except Exception as e:
        sys.exit(
            f"No se pudo descargar ({e}).\n"
            "Verifica que el Sheets este compartido como "
            "'Cualquier persona con el enlace puede ver'."
        )
    return destino


def cargar_tabla(ruta, hoja=None):
    if ruta.suffix.lower() == ".csv":
        return pd.read_csv(ruta, dtype=str)
    return pd.read_excel(ruta, sheet_name=hoja if hoja else 0, dtype=str)


def detectar_columna(df, *palabras):
    """Encuentra la columna cuyo nombre contiene todas las palabras (sin tildes)."""
    for col in df.columns:
        col_norm = u.normalizar(col)
        if all(u.normalizar(p) in col_norm for p in palabras):
            return col
    return None


def a_numero(serie):
    """Convierte texto a float tolerando coma decimal."""
    return pd.to_numeric(
        serie.astype(str).str.strip().str.replace(",", ".", regex=False),
        errors="coerce",
    )


def cargar_bricks():
    """Bricks en precision completa (misma logica que el KML, sin simplificar)."""
    return gpd.GeoDataFrame(u.construir_filas(), geometry="geometry", crs="EPSG:4326")


def main():
    if len(sys.argv) < 2:
        sys.exit('Uso: python asignar_bricks.py "<archivo.xlsx|.csv o URL>" ["<hoja>"]')
    ruta = descargar_si_es_url(sys.argv[1])
    if not ruta.exists():
        sys.exit(f"No existe el archivo: {ruta}")
    hoja = sys.argv[2] if len(sys.argv) > 2 else None

    df = cargar_tabla(ruta, hoja)
    col_lat = detectar_columna(df, "latitud") or detectar_columna(df, "lat")
    col_lon = detectar_columna(df, "longitud") or detectar_columna(df, "lon")
    if not col_lat or not col_lon:
        sys.exit(f"No encontre columnas de coordenadas. Columnas: {list(df.columns)}")
    print(f"Filas: {len(df)} | Latitud: '{col_lat}' | Longitud: '{col_lon}'")

    lat, lon = a_numero(df[col_lat]), a_numero(df[col_lon])
    coord_valida = (
        lat.between(LAT_MIN, LAT_MAX) & lon.between(LON_MIN, LON_MAX)
    ).fillna(False)

    bricks = cargar_bricks()
    puntos = gpd.GeoDataFrame(
        {"_fila": df.index[coord_valida]},
        geometry=[Point(x, y) for x, y in zip(lon[coord_valida], lat[coord_valida])],
        crs="EPSG:4326",
    )

    # 1) Punto dentro de un brick
    dentro = gpd.sjoin(puntos, bricks, how="left", predicate="within")
    dentro = dentro[~dentro.index.duplicated(keep="first")]  # bordes compartidos

    # 2) Sin brick contenedor -> el mas cercano dentro del umbral
    sin_match = dentro["nombre_brick"].isna()
    if sin_match.any():
        cercanos = gpd.sjoin_nearest(
            puntos.loc[sin_match.values].to_crs(CRS_METRICO),
            bricks.to_crs(CRS_METRICO),
            how="left",
            max_distance=MAX_DISTANCIA_METROS,
            distance_col="_dist",
        )
        cercanos = cercanos[~cercanos.index.duplicated(keep="first")]
    else:
        cercanos = None

    # Volcar resultados al dataframe original
    df["Brick_Asignado"] = ""
    df["Brick_ID"] = ""
    df["Brick_Metodo"] = "SIN_COORDENADA"
    invalida = (lat.notna() | lon.notna()) & ~coord_valida
    df.loc[invalida, "Brick_Metodo"] = "COORDENADA_INVALIDA"

    def volcar(resultado, metodo):
        for idx, r in resultado.iterrows():
            if pd.isna(r["nombre_brick"]):
                continue
            df.at[r["_fila"], "Brick_Asignado"] = r["nombre_brick"]
            df.at[r["_fila"], "Brick_ID"] = r["brick_id"]
            df.at[r["_fila"], "Brick_Metodo"] = metodo(r)

    df.loc[coord_valida[coord_valida].index, "Brick_Metodo"] = "FUERA_DE_BRICKS"
    volcar(dentro, lambda r: "DENTRO")
    if cercanos is not None:
        volcar(cercanos, lambda r: f"CERCANO_{round(r['_dist'])}M")

    # Fallback: sin brick -> la ciudad del CRM como pseudo-brick
    col_ciudad = (
        detectar_columna(df, "poblacion", "ok")
        or detectar_columna(df, "poblacion")
        or detectar_columna(df, "ciudad")
    )
    if col_ciudad:
        print(f"Fallback ciudad CRM: '{col_ciudad}'")
        sin_brick = df["Brick_Asignado"] == ""
        ciudad_crm = df.loc[sin_brick, col_ciudad].map(u.normalizar)
        con_ciudad = sin_brick & (ciudad_crm != "").reindex(df.index, fill_value=False)
        df.loc[con_ciudad, "Brick_Asignado"] = ciudad_crm[con_ciudad[con_ciudad].index]
        df.loc[con_ciudad, "Brick_Metodo"] = "CIUDAD_CRM"

    salida = ruta.with_name(ruta.stem + "_con_brick.xlsx")
    with pd.ExcelWriter(salida, engine="openpyxl") as escritor:
        df.to_excel(escritor, sheet_name="Puntos", index=False)
        df["Brick_Metodo"].str.replace(r"CERCANO_\d+M", "CERCANO", regex=True) \
            .value_counts().rename("total").reset_index() \
            .to_excel(escritor, sheet_name="Resumen", index=False)

    print("\nResultado:")
    print(df["Brick_Metodo"].str.replace(r"CERCANO_\d+M", "CERCANO", regex=True)
          .value_counts().to_string())
    print(f"\nExportado: {salida}")


if __name__ == "__main__":
    main()
