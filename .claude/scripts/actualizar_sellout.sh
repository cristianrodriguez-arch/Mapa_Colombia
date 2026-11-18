#!/usr/bin/env bash
# /actualizar-sellout — corre el ETL de sell-out en ESTE computador y deja los JSON nuevos en la
# carpeta _visor_json de Drive (de ahí los lee el visor). No toca git, GitHub ni Apps Script.
#   bash .claude/scripts/actualizar_sellout.sh            Sell Out del paso 3 (s3_*) + inventario
#   bash .claude/scripts/actualizar_sellout.sh todo       lo anterior + los so_* del mapa
#   bash .claude/scripts/actualizar_sellout.sh inv        solo el inventario
cd "$(dirname "$0")/../.." || exit 1

modo="${1:-s3}"
case "$modo" in
  s3|"")  args=(--solo-s3);  que="Sell Out del paso 3 (s3_*) + inventario" ;;
  todo)   args=();           que="mapa (so_*) + Sell Out del paso 3 (s3_*) + inventario" ;;
  inv)    args=(--solo-inv); que="solo inventario (s3_inv.json y s3_inv_pdv.json)" ;;
  *) echo "PARADO: modo '$modo' no existe. Usa: (vacío) | todo | inv"; exit 1 ;;
esac

[ -f config.py ] || { echo "PARADO: falta config.py (cópialo de config.example.py y pon tus rutas)."; exit 1; }
py=python; command -v python >/dev/null 2>&1 || py=py

# Que las rutas de config.py existan antes de gastar minutos leyendo libros.
if ! faltan=$("$py" - <<'EOF'
import os, config as c
rutas = [f["ruta"] for f in getattr(c, "FUENTES_S3", [])]
rutas += [f["ruta"] for f in getattr(c, "FUENTES_INVENTARIO", [])]
for k in ("MAESTRO_EAN", "MAESTRO_PDV"):
    v = getattr(c, k, None)
    if v: rutas.append(v["ruta"])
if getattr(c, "RUTA_INVENTARIO", None): rutas.append(c.RUTA_INVENTARIO)
malas = [r for r in rutas if not os.path.exists(r)]
if not getattr(c, "FUENTES_INVENTARIO", None): malas.append("(config.py no tiene FUENTES_INVENTARIO)")
print("\n".join(malas))
raise SystemExit(1 if malas else 0)
EOF
); then
  echo "PARADO: estas rutas de config.py no existen (¿Google Drive para escritorio está abierto?):"
  echo "$faltan"; exit 1
fi

echo "ACTUALIZANDO: $que"
inicio=$(date +%s)
log=$(mktemp)
if ! PYTHONIOENCODING=utf-8 "$py" etl_sellout.py "${args[@]}" 2>&1 | tee "$log"; then
  echo "PARADO: el ETL falló (arriba el detalle)."; rm -f "$log"; exit 1
fi
if grep -qiE "traceback|error:" "$log"; then
  echo "PARADO: el ETL terminó con errores (arriba el detalle)."; rm -f "$log"; exit 1
fi
rm -f "$log"
echo "ETL OK en $(( $(date +%s) - inicio )) s"
echo "SIGUIENTE: en el visor pulsa «Actualizar» (o corre limpiarCache() en el editor de Apps Script) para que lea los archivos nuevos."
