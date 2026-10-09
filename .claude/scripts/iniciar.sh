#!/usr/bin/env bash
# /iniciar — trae lo último de GitHub y de Apps Script.
# La salida es compacta a propósito: Claude solo la lee para resumir lo que hizo el compañero.
cd "$(git rev-parse --show-toplevel)" || exit 1

rama=$(git branch --show-current)
[ "$rama" = main ] || echo "AVISO: estás en la rama '$rama', no en main."

# clasp pull pisaría cambios locales sin guardar en Apps Script/
if [ -n "$(git status --porcelain)" ]; then
  echo "PARADO: hay cambios sin commitear:"
  git status --short
  exit 1
fi

antes=$(git rev-parse HEAD)
if ! git pull --rebase --quiet origin main 2>&1; then
  echo "PARADO: git pull no pudo integrar (conflicto). Archivos en conflicto:"
  git diff --name-only --diff-filter=U
  exit 1
fi

if [ "$(git rev-parse HEAD)" = "$antes" ]; then
  echo "SIN COMMITS NUEVOS"
else
  echo "COMMITS NUEVOS (del más antiguo al más reciente):"
  git log --reverse --no-merges --date=format:'%a %d/%m %H:%M' \
    --format='### %an · %ad%n%s%n%b' --shortstat "$antes..HEAD" | grep -v '^Co-Authored-By:'
fi

if ! clasp pull >/dev/null 2>&1; then
  echo "PARADO: clasp pull falló — ejecutar 'clasp login' con la cuenta que tiene acceso al proyecto."
  exit 1
fi

# clasp escribe con LF y Git en Windows marca esos archivos como modificados aunque el
# contenido sea idéntico: si no hay diferencia real ni archivos nuevos, se restauran.
if [ -z "$(git diff -- 'Apps Script/' 2>/dev/null)" ] && [ -z "$(git ls-files --others --exclude-standard -- 'Apps Script/')" ]; then
  git checkout -q -- 'Apps Script/'
  echo "APPS SCRIPT: igual a GitHub"
else
  echo "APPS SCRIPT: DESFASE — el proyecto en Google tiene cambios que no están en GitHub:"
  git status --short -- 'Apps Script/'
  git diff --stat -- 'Apps Script/' 2>/dev/null
fi
