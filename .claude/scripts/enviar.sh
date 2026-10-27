#!/usr/bin/env bash
# /enviar — después del commit: pone la rama al día con main, corre las pruebas y sube LA RAMA.
#   bash .claude/scripts/enviar.sh
# No toca main, ni Apps Script, ni producción. El PR se abre en GitHub con el enlace que imprime.
source "$(dirname "$0")/comun.sh"
configurar_git

rama=$(git branch --show-current)
[ -n "$rama" ] && [ "$rama" != main ] || { echo "PARADO: estás en '${rama:-HEAD suelto}'. Crea una rama de trabajo con /rama."; exit 1; }
if [ -n "$(git status --porcelain)" ]; then
  echo "PARADO: quedan cambios sin commitear:"; git status --short; exit 1
fi

integrar_main || exit 1
propios=$(git log --oneline origin/main..HEAD)
[ -n "$propios" ] || { echo "NADA QUE ENVIAR: tu rama no tiene commits que no estén en main."; exit 0; }
correr_pruebas || { echo "PARADO: pruebas fallidas, no se subió nada."; exit 1; }

# --force-with-lease: tras el rebase la historia de TU rama cambia; nunca pisa trabajo ajeno
# (si alguien más subió a esta rama, GitHub lo rechaza).
if ! salida=$(git push --quiet --force-with-lease -u origin "$rama" 2>&1); then
  echo "PARADO: GitHub rechazó el push de la rama:"; echo "$salida" | tail -n 5; exit 1
fi
echo "RAMA SUBIDA: $rama"
echo "COMMITS EN EL PR:"; echo "$propios"
echo "ABRIR O VER EL PR: https://github.com/$(repo_github)/compare/main...$rama?expand=1"
exit 0
