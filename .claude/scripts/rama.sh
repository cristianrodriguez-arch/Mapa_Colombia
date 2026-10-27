#!/usr/bin/env bash
# /rama — crea la rama de trabajo `tipo/descripcion-corta` desde el main de hoy.
#   bash .claude/scripts/rama.sh feat/ventas-cumplimiento
# Los cambios sin commitear viajan con la rama nueva (no se pierden).
source "$(dirname "$0")/comun.sh"
configurar_git

nombre=$1
if ! [[ "$nombre" =~ ^(feat|fix|docs|chore|refactor|test)/[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "PARADO: '$nombre' no es un nombre válido. Formato: tipo/descripcion-corta"
  echo "  tipo = feat, fix, docs, chore, refactor o test; minúsculas, números y guiones (ej. feat/ventas-cumplimiento)"
  exit 1
fi
if git show-ref --verify --quiet "refs/heads/$nombre" || git show-ref --verify --quiet "refs/remotes/origin/$nombre"; then
  echo "PARADO: la rama '$nombre' ya existe. Elige otro nombre o cámbiate a ella con: git switch $nombre"
  exit 1
fi

if ! git fetch --quiet origin; then
  echo "PARADO: no se pudo conectar con GitHub."; exit 1
fi
if [ "$(git branch --show-current)" = main ]; then
  git merge --ff-only --quiet origin/main 2>/dev/null ||
    { echo "PARADO: tu main local tiene commits que no están en GitHub. Avisar a Claude."; exit 1; }
else
  git fetch --quiet origin main:main 2>/dev/null || true
fi

# Desde origin/main (el de hoy), sin upstream: /enviar la publica con su mismo nombre.
if ! git switch --quiet --no-track -c "$nombre" origin/main 2>&1; then
  echo "PARADO: no se pudo crear la rama (¿cambios sin commitear que chocan con main?):"
  git status --short
  exit 1
fi
echo "RAMA CREADA: $nombre (desde main $(git rev-parse --short origin/main))"
[ -n "$(git status --porcelain)" ] && { echo "SE LLEVÓ TUS CAMBIOS SIN COMMITEAR:"; git status --short; }
exit 0
