"""Prueba del ETL de Ventas 3.0 (ejecutar_s3 en etl_sellout.py) con dos libros de ejemplo.

    python tests/test_etl_s3.py

Reproduce lo que trae la hoja 'Final' de los "3. Affiliate_Master so": el de 2025 SIN
columna POS_ID y el de 2026 con filas de Panamá que el filtro Affiliate = Colombia debe
descartar. El PDV es el POS_ID (SAP ID + código interno): en 2025 se toma el que su SF_ID
tiene en 2026 y, si no, las demás reglas de resolver_pos_id. No necesita config.py ni toca Drive.
"""
import json
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
import etl_sellout as etl  # noqa: E402

from openpyxl import Workbook  # noqa: E402

ENC_2025 = ["Fecha", "Sold To ID", "SF_ID", "Ean_isdin", "Canal", "Sub_Canal", "Ean_description", "Origin",
            "Units", "Amount", "Currency", "Affiliate", "ISDIN_PDV_DESC", "Ciudad_cliente",
            "Departamento_cliente", "CP Description", "KAM"]
ENC_2026 = ENC_2025[:13] + ["POS_ID"] + ENC_2025[13:]


def fila(enc, **v):
    return [v.get(h) for h in enc]


def libro(ruta, enc, filas, dim):
    wb = Workbook()
    ws = wb.active
    ws.title = "Final"
    ws.append(enc)
    for f in filas:
        ws.append(f)
    d = wb.create_sheet("DIM Productos")
    d.append(["SUB FAMILIA", "NUEVA REF.", "ANTERIOR REF.", "ISDIN EAN"])
    for ean, bu in dim:
        d.append([bu, "", "", ean])
    wb.save(ruta)


ok = 0


def t(nombre, cond):
    global ok
    if cond:
        ok += 1
        print("  ✓ " + nombre)
    else:
        print("  ✗ " + nombre)
        raise SystemExit(1)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        f25, f26, salida = tmp / "am2025.xlsx", tmp / "am2026.xlsx", tmp / "salida"
        e = dict(Currency="COP", Affiliate="Colombia", Canal="TIENDA", Sub_Canal="TIENDA")
        libro(f25, ENC_2025, [
            fila(ENC_2025, Fecha=datetime(2025, 1, 1), **{"Sold To ID": "11026707", "SF_ID": "0014I00001AAA",
                 "Ean_isdin": "8429420248977", "Ean_description": "FP FUSION WATER", "Origin": "DROGUERIAS CRUZ VERDE SAS",
                 "Units": 10, "Amount": 1000, "ISDIN_PDV_DESC": "CV CENTRO", "Ciudad_cliente": "BOGOTA",
                 "KAM": "ANGELICA MONSALVE"}, **e),
            fila(ENC_2025, Fecha=datetime(2025, 2, 1), **{"Sold To ID": "11026707", "SF_ID": "0014I00001AAA",
                 "Ean_isdin": "8429420248977", "Ean_description": "FP FUSION WATER", "Origin": "DROGUERIAS CRUZ VERDE SAS",
                 "Units": "5", "Amount": "500,5", "ISDIN_PDV_DESC": "CV CENTRO", "KAM": "ANGELICA MONSALVE"}, **e),
            # SF_ID que ya viene como "SAPID_código" → ese es el POS_ID.
            fila(ENC_2025, Fecha=datetime(2025, 1, 1), **{"Sold To ID": "11026727", "SF_ID": "11026727_FI",
                 "Ean_isdin": "8470001901200", "Origin": "BELLA PIEL", "Units": 1, "Amount": 100,
                 "ISDIN_PDV_DESC": "FI_BELLA PIEL FERIA", "KAM": "MANUEL CAMARGO"}, **e),
            # SF_ID que no está en 2026 → SAP ID + código de la descripción (y casa con el POS_ID de 2026).
            fila(ENC_2025, Fecha=datetime(2025, 1, 1), **{"Sold To ID": "11049529", "SF_ID": "0014I00009ZZZQAA",
                 "Ean_isdin": "8470001901200", "Origin": "FARMATODO COLOMBIA S.A.", "Units": 2, "Amount": 200,
                 "ISDIN_PDV_DESC": "1023 - FARMATODO CENTRO MAYOR", "KAM": "ANGELICA MONSALVE"}, **e),
        ], [("8429420248977", "Foto")])
        libro(f26, ENC_2026, [
            fila(ENC_2026, Fecha=datetime(2026, 1, 1), **{"Sold To ID": "11026707", "SF_ID": "0014I00001AAA",
                 "POS_ID": "11026707:001", "Ean_isdin": "8429420248977", "Ean_description": "FP FUSION WATER MAGIC",
                 "Origin": "DROGUERIAS CRUZ VERDE SAS", "Units": 12, "Amount": 1200, "ISDIN_PDV_DESC": "CV CENTRO NUEVO",
                 "Ciudad_cliente": "BOGOTA", "Departamento_cliente": "BOGOTÁ", "KAM": "SARA CARDONA"}, **e),
            fila(ENC_2026, Fecha=datetime(2026, 1, 1), **{"Sold To ID": "11026712", "SF_ID": "MP_1",
                 "Ean_isdin": "8470001901200", "Ean_description": "REPARADOR LABIAL", "Origin": "MEDIPIEL S.A.",
                 "Units": 3, "Amount": 300, "ISDIN_PDV_DESC": "MEDIPIEL ANDINO", "KAM": "SARA CARDONA"}, **e),
            fila(ENC_2026, Fecha=datetime(2026, 1, 1), **{"Sold To ID": "11049529", "SF_ID": "001P10000NUEVOQAA",
                 "POS_ID": "11049529_1023", "Ean_isdin": "8470001901200", "Origin": "FARMATODO COLOMBIA S.A.",
                 "Units": 3, "Amount": 330, "ISDIN_PDV_DESC": "1023 - FARMATODO CENTRO MAYOR",
                 "KAM": "ANGELICA MONSALVE"}, **e),
            fila(ENC_2026, Fecha=datetime(2026, 1, 1), **{"Sold To ID": "111", "SF_ID": "111_S566",
                 "Ean_isdin": "8470001901200", "Origin": "ARROCHA", "Units": 4, "Amount": 73752,
                 "Currency": "USD", "Affiliate": "Panama", "Canal": "ND", "Sub_Canal": "ND", "KAM": "MANUEL CAMARGO"}),
        ], [("8429420248977", "Foto"), ("8470001901200", "Derma")])

        cfg = SimpleNamespace(
            CARPETA_SALIDA=str(salida), FILTROS={"affiliate": ["Colombia"]},
            DIMENSION_PRODUCTOS={"hoja": "DIM Productos", "fila_encabezados": 1, "clave": ["isdin ean", "ean"],
                                 "campos": {"bu": ["sub familia"]}},
            FUENTES_S3=[{"ruta": str(f25), "hoja": "Final"}, {"ruta": str(f26), "hoja": "Final"}],
            N_FRAGMENTOS_S3_PDV=4, N_FRAGMENTOS_S3_SKU=2)
        etl.ejecutar_s3(cfg)

        cubo = json.loads((salida / "s3_cubo.json").read_text(encoding="utf-8"))
        t("meses de los dos años, ordenados", cubo["meses"] == ["2025-01", "2025-02", "2026-01"])
        cli = {c[0]: c for c in cubo["clientes"]}
        t("Panamá queda fuera (filtro Affiliate)", "111" not in cli and len(cli) == 4)
        t("KAM del cliente = el de su mes más reciente", cli["11026707"][2] == "SARA CARDONA")
        pdv = {p[0]: p for p in cubo["pdv"]}
        t("PDV = POS_ID: el de 2025 (sin POS_ID) toma el que su SF_ID tiene en 2026 ('11026707:001' → '_')",
          "11026707_001" in pdv and "0014I00001AAA" not in pdv)
        t("SF_ID ya compuesto 'SAPID_código' = POS_ID", "11026727_FI" in pdv)
        t("SF_ID que no está en 2026: SAP ID + código de la descripción, y se junta con el POS_ID de 2026",
          "11049529_1023" in pdv and "0014I00009ZZZQAA" not in pdv and "001P10000NUEVOQAA" not in pdv)
        t("sin POS_ID ni forma de armarlo: se queda el SF_ID", "MP_1" in pdv and len(pdv) == 4)
        t("descripción del PDV = la más reciente", pdv["11026707_001"][1] == "CV CENTRO NUEVO")
        t("el manifiesto cuenta las filas de cada regla", cubo["meta"]["pdv_pos_id"] == {
            "pos_id": 2, "sf_id_en_otro_anio": 2, "sf_id_compuesto": 1, "codigo_descripcion": 1, "sin_pos_id": 1})
        ifa = [p[0] for p in cubo["pdv"]].index("11049529_1023")
        t("Farmatodo 1023: 2025 y 2026 en el MISMO punto de venta",
          sorted(r[1:] for r in cubo["pm"] if r[0] == ifa) == [[0, 2, 200], [2, 3, 330]])
        ic = [c[0] for c in cubo["clientes"]].index("11026707")
        ip = [p[0] for p in cubo["pdv"]].index("11026707_001")
        cs = sorted(r for r in cubo["cs"] if r[0] == ic)
        t("cliente × producto × mes con coma decimal ('500,5')",
          [r[2:] for r in cs] == [[0, 10, 1000], [1, 5, 500.5], [2, 12, 1200]])
        t("PDV × mes", sorted(r[1:] for r in cubo["pm"] if r[0] == ip) == [[0, 10, 1000], [1, 5, 500.5], [2, 12, 1200]])
        t("BU del producto sale de DIM Productos (en mayúsculas)",
          sorted(s[2] for s in cubo["skus"]) == ["DERMA", "FOTO"] and cubo["bus"] == ["DERMA", "FOTO"])
        pb = json.loads((salida / "s3_pb_01.json").read_text(encoding="utf-8"))
        t("un archivo PDV × mes por BU", pb["bu"] == "FOTO" and sorted(pb["pb"]) == sorted(
            [[ip, 0, 10, 1000], [ip, 1, 5, 500.5], [ip, 2, 12, 1200]]))
        frag = json.loads((salida / f"s3_pdv_{ip % 4:02d}.json").read_text(encoding="utf-8"))
        t("fragmento por PDV: [iSku, iMes, und, imp]", len(frag["filas"][str(ip)]) == 3)
        todos = list(salida.glob("s3_*.json"))
        t("todos los archivos llevan el mismo 'generado'",
          {json.loads(p.read_text(encoding="utf-8"))["generado"] for p in todos} == {cubo["generado"]})
        t("JSON en ASCII (la web app los cachea por trozos de 90 KB)",
          all(p.read_bytes().isascii() for p in todos))

        # ---- Inventario: "Consolidado inventarios Semestre N" + EAN MASTER + PDV MASTER ----
        def hoja(ruta, nombre, filas):
            wb = Workbook()
            ws = wb.active
            ws.title = nombre
            for f in filas:
                ws.append(f)
            wb.save(ruta)
        fsem, fean, fpdv, fprec = tmp / "sem.xlsx", tmp / "ean.xlsx", tmp / "pdv.xlsx", tmp / "transf.xlsx"
        enc = ["Fecha", "Origin", "Sold To ID", "Código_prod_cliente", "Descripcion_producto_cliente", "Units",
               "Código_local_cliente", "PDV descripción", "Llave de PDV", "Llave"]
        hoja(fsem, "Hoja1", [enc,
            # local "CV1" está en PDV MASTER con POS_ID 11026707:001 → PDV del cubo 11026707_001
            [datetime(2026, 2, 1), "DROGUERIAS CRUZ VERDE SAS", 11026707.0, "A1", "x", 6, "CV1", "", "", ""],
            # dos códigos del cliente con el mismo EAN: se suman; código "B9" único en el maestro (otro Origin)
            [datetime(2026, 2, 1), "DROGUERIAS CRUZ VERDE SAS", 11026707.0, "B9", "x", 2, "CV1", "", "", ""],
            # local fuera del maestro pero SAP + "_" + código = POS_ID del cubo
            [datetime(2026, 1, 1), "FARMATODO COLOMBIA S.A.", 11049529.0, "A1", "x", 3, "1023", "", "", ""],
            # sin PDV (bodega): cuenta en cliente × EAN pero no en PDV
            [datetime(2026, 2, 1), "MEDIPIEL S.A.", 11026712.0, "Z7", "x", 50, "CEDI", "", "", ""],
            # Panamá (no está en el cubo): fuera
            [datetime(2026, 2, 1), "ARROCHA", 111.0, "A1", "x", 9, "S566", "", "", ""]])
        hoja(fean, "Master_EAN", [["LISTA DE PRECIOS", "Origin", "Codigo_prod_cliente", "Descripcion_producto_cliente",
                                   "Ean_isdin", "Ean_description"],
            ["Cadenas", "DROGUERIAS CRUZ VERDE SAS", "A1", "x", 8429420248977.0, "FP FUSION"],
            ["Cadenas", "FARMATODO COLOMBIA S.A.", "A1", "x", 8470001901200.0, "LABIAL"],
            ["Cadenas", "OTRO", "B9", "x", 8429420248977.0, "FP FUSION"],
            ["Cadenas", "MEDIPIEL S.A.", "Z7", "x", 8470001901200.0, "LABIAL"]])
        hoja(fpdv, "Master_Puntos", [["Origin", "Código_local_cliente", "ISDIN_PDV_DESC", "SF_ID", "POS_ID"],
            ["DROGUERIAS CRUZ VERDE SAS", "CV1", "CV CENTRO", "0014I00001AAA", "11026707:001"]])
        hoja(fprec, "Consolidado", [["Fecha", "Sold To ID", "Inventario", "Ean_isdin", "Amount", "Currency"],
            [datetime(2026, 2, 1), 11026707.0, 4, 8429420248977.0, 400, "COP"]])
        cfg.FUENTES_INVENTARIO = [{"ruta": str(fsem), "hoja": "Hoja1"}]
        cfg.MAESTRO_EAN = {"ruta": str(fean), "hoja": "Master_EAN"}
        cfg.MAESTRO_PDV = {"ruta": str(fpdv), "hoja": "Master_Puntos"}
        cfg.RUTA_INVENTARIO = str(fprec)
        etl.ejecutar_inv(cfg)
        inv = json.loads((salida / "s3_inv.json").read_text(encoding="utf-8"))
        ipdv = json.loads((salida / "s3_inv_pdv.json").read_text(encoding="utf-8"))
        cl = [c[0] for c in inv["clientes"]]
        sk = [s_[0] for s_ in inv["skus"]]
        por = {(cl[r[0]], sk[r[1]], inv["meses"][r[2]]): (r[3], r[4]) for r in inv["inv"]}
        t("inventario: producto por EAN MASTER (Origin + código; código único como respaldo); pesos = und × precio",
          por[("11026707", "8429420248977", "2026-02")] == (8, 800))
        t("inventario: sin Panamá; la bodega cuenta por cliente",
          "111" not in cl and por[("11026712", "8470001901200", "2026-02")][0] == 50)
        t("inventario: BU del EAN sale del cubo", dict((s_[0], s_[2]) for s_ in inv["skus"])["8429420248977"] == "FOTO")
        pp = {(ipdv["pdv"][r[0]], ipdv["meses"][r[1]]): r[2] for r in ipdv["inv"]}
        t("inventario por PDV: PDV MASTER (POS_ID) y, si no, SAP + código local",
          pp == {("11026707_001", "2026-02"): 8, ("11049529_1023", "2026-01"): 3})
        t("inventario: cuenta lo que no cruza",
          inv["meta"]["filas"]["descartadas_cliente"] == 1 and inv["meta"]["filas"]["sin_pdv"] == 1
          and inv["meta"]["unidades_con_ean"] == 1.0)

        # ---- Mapa (so_*): los mismos dos libros, 2025 con el POS_ID deducido ----
        cfg.COLUMNAS = {"fecha": ["fecha"], "pos_id": ["pos_id", "pos id"], "pdv_desc": ["isdin pdv desc"],
                        "bu": ["bu"], "sku": ["ean isdin"], "prod_desc": ["ean description"],
                        "familia": ["familia"], "units": ["units"], "amount": ["amount"]}
        cfg.OBLIGATORIOS = ["fecha", "pos_id", "sku"]
        cfg.N_FRAGMENTOS, cfg.N_FRAGMENTOS_SKU = 4, 2
        etl.ejecutar(cfg, None)
        so = json.loads((salida / "so_pdv.json").read_text(encoding="utf-8"))
        man = json.loads((salida / "so_manifiesto.json").read_text(encoding="utf-8"))
        t("mapa: trae los meses de 2025 y 2026", so["meses"] == ["2025-01", "2025-02", "2026-01"])
        t("mapa: 2025 cae en el POS_ID de 2026 (mismo punto en el mapa)",
          "11026707_001" in so["pdv"] and "11049529_1023" in so["pdv"] and "11026727_FI" in so["pdv"])
        serie = so["pdv"]["11026707_001"]["bu"]["FOTO"]
        t("mapa: serie del PDV con los dos años", serie == [[0, 10, 1000], [1, 5, 500.5], [2, 12, 1200]])
        t("mapa: en 2026 una fila sin POS_ID se sigue descartando", "MP_1" not in so["pdv"])
        t("mapa: el manifiesto lista los dos libros y cómo salió el POS_ID",
          [o["pos_id"] for o in man["origen"]] == ["columna", "deducido"]
          and man["pdv_pos_id"]["sf_id_en_otro_anio"] == 2)
    print(f"\n{ok} pruebas OK")


if __name__ == "__main__":
    main()
