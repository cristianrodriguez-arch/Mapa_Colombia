#!/usr/bin/env bash
# /finalizar — después del commit: integra lo del compañero, prueba, compara con Apps Script y sube.
#   bash .claude/scripts/finalizar.sh [--simular] [--pisar-remoto]
#   --simular       hace todo menos clasp push y git push
#   --pisar-remoto  sube aunque el proyecto en Google tenga cambios que no están en GitHub
cd "$(git rev-parse --show-toplevel)" || exit 1
simular=0; pisar=0
for a in "$@"; do
  case $a in --simular) simular=1 ;; --pisar-remoto) pisar=1 ;; esac
done

[ "$(git branch --show-current)" = main ] || { echo "PARADO: no estás en main."; exit 1; }
if [ -n "$(git status --porcelain)" ]; then
  echo "PARADO: quedan cambios sin commitear:"
  git status --short
  exit 1
fi

# 1. Integrar lo del compañero ANTES de subir: si no, el clasp push pisaría lo suyo.
if ! git pull --rebase --quiet origin main 2>&1; then
  echo "PARADO: conflicto al integrar con GitHub. Archivos en conflicto:"
  git diff --name-only --diff-filter=U
  exit 1
fi
pendientes=$(git log --oneline origin/main..HEAD)
[ -n "$pendientes" ] || { echo "NADA QUE SUBIR: no hay commits nuevos."; exit 0; }

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

# 3. ¿Alguien editó en el editor web (o hizo clasp push sin git push)? Cada archivo del
#    proyecto en Google debe coincidir con GitHub (origin/main), con lo nuestro (HEAD) o
#    con lo que subimos con /probar (.git/probar_ultimo).
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
    nombre=$(basename "$f")
    igual=0
    for ref in origin/main HEAD; do
      if git cat-file -e "$ref:Apps Script/$nombre" 2>/dev/null &&
         cmp -s <(tr -d '\r' < "$f") <(git show "$ref:Apps Script/$nombre" | tr -d '\r'); then
        igual=1; break
      fi
    done
    # Lo que subiste tú con /probar no es un cambio ajeno.
    [ $igual = 0 ] && [ -f ".git/probar_ultimo/$nombre" ] &&
      cmp -s <(tr -d '\r' < "$f") <(tr -d '\r' < ".git/probar_ultimo/$nombre") && igual=1
    [ $igual = 1 ] || desfase="$desfase  $nombre"$'\n'
  done
  rm -rf "$tmp"
  if [ -n "$desfase" ]; then
    echo "PARADO: el proyecto en Google tiene cambios que no están en GitHub (no se subió nada):"
    printf '%s' "$desfase"
    exit 1
  fi
  echo "APPS SCRIPT: coincide con GitHub"
fi

if [ $simular = 1 ]; then
  echo "SIMULACIÓN: todo listo; no se hizo clasp push ni git push. Se subiría:"
  echo "$pendientes"
  exit 0
fi

# 4. Subir: primero Apps Script, luego GitHub. --force solo evita la pregunta interactiva
#    del manifiesto (appsscript.json), que ya se comparó en el paso 3.
if ! salida=$(clasp push --force 2>&1); then
  echo "PARADO: clasp push falló:"; echo "$salida" | tail -n 10
  exit 1
fi
echo "CLASP PUSH: OK"
rm -rf .git/probar_ultimo   # lo probado con /probar ya quedó subido de verdad
if ! git push --quiet origin main 2>&1; then
  echo "PARADO: GitHub rechazó el push (seguramente el compañero subió algo justo ahora). Volver a ejecutar /finalizar."
  exit 1
fi
echo "GIT PUSH: OK. Subido:"
echo "$pendientes"
