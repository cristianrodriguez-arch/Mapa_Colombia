#!/usr/bin/env bash
# /probar — sube lo local a Apps Script para verlo en la URL /dev, SIN tocar GitHub.
#   bash .claude/scripts/probar.sh [--pisar-remoto]
# Reemplaza al `clasp push` manual: antes de subir trae lo del compañero y corre las
# pruebas, y no pisa cambios ajenos que estén en Google y no en GitHub.
cd "$(git rev-parse --show-toplevel)" || exit 1
pisar=0; [ "$1" = --pisar-remoto ] && pisar=1

[ "$(git branch --show-current)" = main ] || { echo "PARADO: no estás en main."; exit 1; }

# 1. Lo del compañero primero: clasp push reemplaza el proyecto ENTERO en Google.
#    --autostash guarda tus cambios sin commitear, integra y los vuelve a poner.
if ! git pull --rebase --autostash --quiet origin main 2>&1; then
  echo "PARADO: conflicto al integrar con GitHub. Archivos en conflicto:"
  git diff --name-only --diff-filter=U
  exit 1
fi

# 2. Pruebas: un error de sintaxis en un solo Js*.html rompe toda la web app.
fallo=0; n=0
for t in tests/*.js; do
  n=$((n + 1))
  if ! salida=$(node "$t" 2>&1); then
    echo "FALLA $t:"; echo "$salida" | tail -n 15; fallo=1
  fi
done
[ $fallo = 0 ] || { echo "PARADO: pruebas fallidas, no se subió nada."; exit 1; }
echo "PRUEBAS: $n/$n OK"

# 3. Cada archivo en Google debe ser de GitHub (origin/main), de tu último commit (HEAD),
#    de tu copia local o de tu último /probar. Si no, es trabajo de otra persona.
ultimo=.git/probar_ultimo
if [ $pisar = 0 ]; then
  tmp=$(mktemp -d)
  sed 's/"rootDir": *"[^"]*"/"rootDir": "."/' .clasp.json > "$tmp/.clasp.json"
  if ! (cd "$tmp" && clasp pull >/dev/null 2>&1); then
    rm -rf "$tmp"
    echo "PARADO: clasp pull falló — ejecutar 'clasp login' con la cuenta que tiene acceso al proyecto."
    exit 1
  fi
  desfase=""
  for f in "$tmp"/*; do
    nombre=$(basename "$f"); igual=0
    for ref in origin/main HEAD; do
      if git cat-file -e "$ref:Apps Script/$nombre" 2>/dev/null &&
         cmp -s <(tr -d '\r' < "$f") <(git show "$ref:Apps Script/$nombre" | tr -d '\r'); then
        igual=1; break
      fi
    done
    for local in "Apps Script/$nombre" "$ultimo/$nombre"; do
      [ $igual = 0 ] && [ -f "$local" ] && cmp -s <(tr -d '\r' < "$f") <(tr -d '\r' < "$local") && igual=1
    done
    [ $igual = 1 ] || desfase="$desfase  $nombre"$'\n'
  done
  rm -rf "$tmp"
  if [ -n "$desfase" ]; then
    echo "PARADO: el proyecto en Google tiene cambios que no están ni en GitHub ni en tu copia (no se subió nada):"
    printf '%s' "$desfase"
    exit 1
  fi
fi

# 4. Subir solo a Apps Script y guardar copia de lo subido (dentro de .git, nunca se
#    commitea) para que /finalizar no lo confunda con cambios ajenos.
if ! salida=$(clasp push --force 2>&1); then
  echo "PARADO: clasp push falló:"; echo "$salida" | tail -n 10
  exit 1
fi
rm -rf "$ultimo"; mkdir -p "$ultimo"
cp "Apps Script"/*.html "Apps Script"/*.js "Apps Script"/appsscript.json "$ultimo"/ 2>/dev/null
echo "CLASP PUSH: OK (GitHub sin tocar)"
pendiente=$(git status --porcelain)
[ -n "$pendiente" ] && echo "SIN COMMITEAR (cerrar con /finalizar):" && git status --short
exit 0
