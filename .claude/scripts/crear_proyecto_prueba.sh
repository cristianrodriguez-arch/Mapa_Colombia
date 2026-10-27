#!/usr/bin/env bash
# Crea (una sola vez por persona) TU proyecto de Apps Script de pruebas y guarda su id
# en .clasp.dev.json (ignorado por git). /probar sube ahí; producción no se toca.
#   bash .claude/scripts/crear_proyecto_prueba.sh "<tu nombre>"
source "$(dirname "$0")/comun.sh"

nombre=$1
[ -n "$nombre" ] || { echo "PARADO: falta tu nombre. Uso: bash .claude/scripts/crear_proyecto_prueba.sh \"Sebas\""; exit 1; }
if [ -f .clasp.dev.json ]; then
  echo "YA EXISTE: .clasp.dev.json apunta a $(script_id .clasp.dev.json). Bórralo primero si quieres otro proyecto."
  exit 1
fi

# create-script escribe un .clasp.json donde se ejecuta: se hace en una carpeta temporal
# para no pisar el .clasp.json de producción.
tmp=$(mktemp -d)
if ! salida=$(cd "$tmp" && clasp create-script --type standalone --title "Mapa Colombia · pruebas $nombre" 2>&1); then
  rm -rf "$tmp"
  echo "PARADO: clasp no pudo crear el proyecto (¿'clasp login' hecho?):"; echo "$salida" | tail -n 5
  exit 1
fi
id=$(script_id "$tmp/.clasp.json"); rm -rf "$tmp"
[ -n "$id" ] || { echo "PARADO: se creó el proyecto pero no encontré su scriptId:"; echo "$salida" | tail -n 5; exit 1; }

# Mismo formato que .clasp.json, cambiando solo el scriptId.
sed "s/\"scriptId\"[[:space:]]*:[[:space:]]*\"[^\"]*\"/\"scriptId\": \"$id\"/" .clasp.json > .clasp.dev.json
echo "PROYECTO DE PRUEBA CREADO: $id (guardado en .clasp.dev.json, no se sube a Git)"
echo "SIGUIENTE:"
echo "  1. bash .claude/scripts/probar.sh   (sube el código por primera vez)"
echo "  2. clasp open-script -P .clasp.dev.json → Implementar → Probar implementaciones → copia la URL /dev"
echo "  3. Abre la URL una vez y autoriza los permisos que pida."
exit 0
