#!/usr/bin/env bash
# /probar — sube TU rama a TU proyecto de Apps Script de pruebas (URL /dev). No toca GitHub ni producción.
#   bash .claude/scripts/probar.sh
source "$(dirname "$0")/comun.sh"
configurar_git

rama=$(git branch --show-current)
[ -n "$rama" ] && [ "$rama" != main ] || { echo "PARADO: estás en '${rama:-HEAD suelto}'. Crea una rama de trabajo con /rama."; exit 1; }

# Cada persona prueba en SU proyecto: así nadie pisa el /dev del otro ni toca producción.
if [ ! -f .clasp.dev.json ]; then
  echo "SIN PROYECTO DE PRUEBA: falta .clasp.dev.json (tu copia personal del script; se crea una sola vez)."
  echo "Crearlo:  bash .claude/scripts/crear_proyecto_prueba.sh \"<tu nombre>\""
  exit 1
fi
if [ "$(script_id .clasp.dev.json)" = "$(script_id .clasp.json)" ]; then
  echo "PARADO: .clasp.dev.json apunta al script de PRODUCCIÓN. Debe ser tu proyecto de pruebas (bórralo y créalo de nuevo)."
  exit 1
fi

integrar_main || exit 1
correr_pruebas || { echo "PARADO: pruebas fallidas, no se subió nada."; exit 1; }

if ! salida=$(clasp push -P .clasp.dev.json --force 2>&1); then
  echo "PARADO: clasp push falló:"; echo "$salida" | tail -n 10
  exit 1
fi
echo "CLASP PUSH: OK (a tu proyecto de pruebas; GitHub y producción sin tocar)"
head_id=$(clasp list-deployments -P .clasp.dev.json 2>/dev/null | grep -i '@HEAD' | grep -o 'AKfycb[A-Za-z0-9_-]*' | head -n 1)
if [ -n "$head_id" ]; then
  echo "URL DE PRUEBA: https://script.google.com/macros/s/$head_id/dev"
else
  echo "URL DE PRUEBA: abre el editor (clasp open-script -P .clasp.dev.json) → Implementar → Probar implementaciones."
fi
[ -n "$(git status --porcelain)" ] && { echo "SIN COMMITEAR (cuando lo des por bueno: /enviar):"; git status --short; }
exit 0
