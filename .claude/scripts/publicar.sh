#!/usr/bin/env bash
# /publicar — sube main a PRODUCCIÓN: clasp push al script de producción, versión nueva y la
# MISMA implementación (misma URL) apuntando a ella. Deja el tag produccion-vNN en git.
#   bash .claude/scripts/publicar.sh               muestra qué saldría y se detiene (no sube nada)
#   bash .claude/scripts/publicar.sh --confirmar   publica (Claude lo corre solo tras el sí del usuario)
#   --pisar-remoto  publica aunque en Google haya código que no está en git (lo decide el usuario)
source "$(dirname "$0")/comun.sh"
configurar_git
confirmar=0; pisar=0
for a in "$@"; do
  case $a in --confirmar) confirmar=1 ;; --pisar-remoto) pisar=1 ;; esac
done

[ "$(git branch --show-current)" = main ] || { echo "PARADO: se publica solo desde main (git switch main), después del merge del PR."; exit 1; }
if [ -n "$(git status --porcelain)" ]; then
  echo "PARADO: hay cambios sin commitear en main:"; git status --short; exit 1
fi
git fetch --quiet --tags origin || { echo "PARADO: no se pudo conectar con GitHub."; exit 1; }
git merge --ff-only --quiet origin/main 2>/dev/null ||
  { echo "PARADO: tu main local tiene commits que no están en GitHub (no debería pasar). Avisar a Claude."; exit 1; }

# Solo lo que clasp sube (los .md de Apps Script/ no van a Google).
CODIGO=(":(glob)Apps Script/*.js" ":(glob)Apps Script/*.html" "Apps Script/appsscript.json")
ultimo_tag=$(git tag --list 'produccion-v*' --sort=-v:refname | head -n 1)
if [ -n "$ultimo_tag" ]; then
  saldria=$(git log --oneline --no-merges "$ultimo_tag..HEAD" -- "${CODIGO[@]}")
  echo "ÚLTIMA PUBLICACIÓN: $ultimo_tag ($(git log -1 --format=%cd --date=format:'%d/%m %H:%M' "$ultimo_tag"))"
else
  saldria=$(git log --oneline --no-merges -10 -- "${CODIGO[@]}")
  echo "ÚLTIMA PUBLICACIÓN: sin tags todavía (es la primera publicación con /publicar)"
fi
if [ -n "$ultimo_tag" ] && [ -z "$saldria" ]; then
  echo "NADA QUE PUBLICAR: el código del visor no cambió desde $ultimo_tag."; exit 0
fi
echo "SALDRÍA A PRODUCCIÓN (cambios en el código del visor):"; echo "$saldria"

correr_pruebas || { echo "PARADO: pruebas fallidas en main, no se publicó nada."; exit 1; }

# ¿Alguien editó en el editor web de producción? Cada archivo en Google debe ser igual a main
# o a alguna versión que ya estuvo en git (eso es un retroceso hecho a propósito, no trabajo ajeno).
if [ $pisar = 0 ]; then
  tmp=$(mktemp -d)
  sed 's/"rootDir": *"[^"]*"/"rootDir": "."/' .clasp.json > "$tmp/.clasp.json"
  if ! (cd "$tmp" && clasp pull >/dev/null 2>&1); then
    rm -rf "$tmp"
    echo "PARADO: clasp pull falló — ejecutar 'clasp login' con la cuenta que tiene acceso al proyecto."; exit 1
  fi
  desfase=""
  for f in "$tmp"/*; do
    nombre=$(basename "$f"); igual=0
    for c in HEAD $(git log --format=%H -- "Apps Script/$nombre"); do
      if git cat-file -e "$c:Apps Script/$nombre" 2>/dev/null &&
         cmp -s <(tr -d '\r' < "$f") <(git show "$c:Apps Script/$nombre" | tr -d '\r'); then
        igual=1; break
      fi
    done
    [ $igual = 1 ] || desfase="$desfase  $nombre"$'\n'
  done
  rm -rf "$tmp"
  if [ -n "$desfase" ]; then
    echo "PARADO: en el editor web de producción hay código que no está en git (no se publicó nada):"
    printf '%s' "$desfase"
    echo "  Traerlo a git en una rama (y PR), o pisarlo con --pisar-remoto si el usuario lo decide."
    exit 1
  fi
  echo "APPS SCRIPT DE PRODUCCIÓN: sin ediciones ajenas"
fi

if [ $confirmar = 0 ]; then
  echo "SIN CONFIRMAR: no se subió nada. Para publicar: bash .claude/scripts/publicar.sh --confirmar"; exit 0
fi

# --force solo evita la pregunta interactiva del manifiesto (appsscript.json), ya comparado arriba.
if ! salida=$(clasp push --force 2>&1); then
  echo "PARADO: clasp push falló:"; echo "$salida" | tail -n 10; exit 1
fi
echo "CLASP PUSH: OK (script de producción)"
desc=$(git log -1 --format=%s | cut -c1-90)
if ! salida=$(clasp create-version "$desc" 2>&1); then
  echo "PARADO: código subido, pero no se pudo crear la versión (producción sigue igual):"; echo "$salida" | tail -n 5; exit 1
fi
version=$(echo "$salida" | grep -io 'version [0-9]\+' | grep -o '[0-9]\+' | tail -n 1)
if [ -z "$version" ] || ! salida=$(clasp update-deployment "$DEPLOY_PROD" -V "$version" -d "$desc" 2>&1); then
  echo "PARADO: se creó la versión ${version:-?} pero producción no se movió a ella:"; echo "$salida" | tail -n 5; exit 1
fi
echo "PUBLICADO: producción sirve ahora la versión $version (misma URL de siempre)."

tag="produccion-v$version"
if git tag -a "$tag" -m "Producción v$version: $desc" && git push --quiet origin "$tag" 2>&1; then
  echo "TAG: $tag (marca en git qué código tiene esta versión)"
else
  echo "AVISO: publicado, pero no se pudo crear/subir el tag $tag. Hacerlo a mano: git tag -a $tag -m '...' && git push origin $tag"
fi
exit 0
