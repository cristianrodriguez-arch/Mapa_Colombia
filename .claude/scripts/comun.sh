#!/usr/bin/env bash
# Funciones compartidas por los scripts del equipo (/iniciar, /rama, /probar, /enviar, /publicar).
# Se carga con: source "$(dirname "$0")/comun.sh"
cd "$(git rev-parse --show-toplevel)" || exit 1

# Implementación de PRODUCCIÓN del visor (la URL que usa el equipo, "2.7_Mapa_Estrategico").
# Publicar = crear una versión nueva y mover ESTA implementación a ella: la URL no cambia.
# Nunca `clasp deploy` sin -i: eso crea una implementación nueva, con otro link.
DEPLOY_PROD=AKfycbyZkO9dO6K8H5I_j_t5HPrYkhbp2r14Oe8M7yhFpxg3KVVpmnuPu-o7ftnBDodEjwxC

# Hooks del equipo (.githooks/: bloquean commit/push a main y secretos), pull con rebase
# y limpieza de ramas remotas borradas. Idempotente: se puede llamar siempre.
configurar_git() {
  git config core.hooksPath .githooks
  git config pull.rebase true
  git config rebase.autoStash true
  git config fetch.prune true
}

# scriptId de un archivo de proyecto de clasp (.clasp.json / .clasp.dev.json).
script_id() {
  grep -o '"scriptId"[[:space:]]*:[[:space:]]*"[^"]*"' "$1" 2>/dev/null | sed 's/.*"\([^"]*\)"$/\1/'
}

# Pone la rama actual al día con origin/main (rebase; los cambios sin commitear se guardan
# y se vuelven a poner solos). Si hay conflicto se detiene y lista los archivos.
integrar_main() {
  if ! git fetch --quiet origin; then
    echo "PARADO: no se pudo conectar con GitHub."; return 1
  fi
  git fetch --quiet origin main:main 2>/dev/null || true   # main local = espejo de origin/main
  if ! git rebase --autostash --quiet origin/main >/dev/null 2>&1; then
    echo "PARADO: conflicto al poner tu rama al día con main. Archivos en conflicto:"
    git diff --name-only --diff-filter=U | sed 's/^/  /'
    echo "  Resolver, 'git add <archivo>' y 'git rebase --continue' (o 'git rebase --abort' para dejarlo como estaba)."
    return 1
  fi
  echo "RAMA AL DÍA CON MAIN"
}

# Todas las pruebas: tests/*.js (un error de sintaxis en un solo Js*.html rompe toda la
# web app) y el test del ETL de Ventas 3.0. Lo mismo que corre GitHub Actions en cada PR.
correr_pruebas() {
  local fallo=0 n=0 t salida py
  for t in tests/*.js; do
    n=$((n + 1))
    if ! salida=$(node "$t" 2>&1); then
      echo "FALLA $t:"; echo "$salida" | tail -n 15; fallo=1
    fi
  done
  py=$(command -v python || command -v python3)
  if [ -z "$py" ]; then
    echo "AVISO: no hay Python; no se corrió tests/test_etl_s3.py (GitHub Actions sí lo correrá)."
  else
    n=$((n + 1))
    if ! salida=$("$py" tests/test_etl_s3.py 2>&1); then
      echo "FALLA tests/test_etl_s3.py:"; echo "$salida" | tail -n 15; fallo=1
    fi
  fi
  [ $fallo = 0 ] || return 1
  echo "PRUEBAS: $n/$n OK"
}

# Dueño/repositorio en GitHub, sacado del remoto (sirve para armar enlaces).
repo_github() {
  git remote get-url origin | sed -E 's#^(https://github\.com/|git@github\.com:)##; s#\.git$##'
}
