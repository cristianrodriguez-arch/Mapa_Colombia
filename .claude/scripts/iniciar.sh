#!/usr/bin/env bash
# /iniciar — deja la máquina lista y cuenta qué pasó en el equipo.
# La salida es compacta a propósito: Claude la lee para resumir lo que hizo el compañero.
source "$(dirname "$0")/comun.sh"
configurar_git
echo "GIT: configurado (hooks del equipo, rebase, prune)"

if ! git fetch --quiet --prune origin; then
  echo "PARADO: no se pudo conectar con GitHub."; exit 1
fi

rama=$(git branch --show-current)
vistoAntes=$(git rev-parse main)   # main como la vimos la última vez

# main local = espejo de origin/main (nadie commitea ahí; los hooks lo impiden)
if [ "$rama" = main ]; then
  if ! git merge --ff-only --quiet origin/main 2>&1; then
    echo "PARADO: tu main local tiene commits que no están en GitHub (no debería pasar). Avisar a Claude."; exit 1
  fi
else
  git fetch --quiet origin main:main 2>/dev/null || echo "AVISO: no pude actualizar el main local."
fi
ahora=$(git rev-parse main)

echo "RAMA: ${rama:-(sin rama, HEAD suelto)}"
if [ -n "$(git status --porcelain)" ]; then
  echo "CAMBIOS SIN COMMITEAR:"; git status --short
fi

if [ "$vistoAntes" = "$ahora" ]; then
  echo "MAIN: SIN COMMITS NUEVOS"
else
  echo "MAIN: COMMITS NUEVOS desde la última vez (del más antiguo al más reciente):"
  git log --reverse --no-merges --date=format:'%a %d/%m %H:%M' \
    --format='### %an · %ad%n%s%n%b' --shortstat "$vistoAntes..$ahora" | grep -v '^Co-Authored-By:'
fi

if [ -n "$rama" ] && [ "$rama" != main ]; then
  atras=$(git rev-list --count HEAD..origin/main)
  adelante=$(git rev-list --count origin/main..HEAD)
  echo "TU RAMA: $adelante commit(s) propios; le faltan $atras de main (/probar y /enviar la ponen al día)"
fi

# Lo que el compañero tiene en curso: ramas en GitHub que todavía no entraron a main
enCurso=$(git for-each-ref --no-merged origin/main --sort=-committerdate \
  --format='%(refname:short)|%(authorname)|%(committerdate:relative)|%(subject)' refs/remotes/origin \
  | grep -v -E '^origin/(main|HEAD)\|')
if [ -n "$enCurso" ]; then
  echo "EN CURSO (ramas en GitHub sin entrar a main):"
  echo "$enCurso" | sed 's#^origin/#  #'
fi

# Ramas locales cuya rama remota ya se borró = su PR ya entró a main
terminadas=$(git for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads | grep '\[gone\]' | cut -d' ' -f1)
if [ -n "$terminadas" ]; then
  echo "RAMAS TERMINADAS (su PR ya entró a main; se borran con 'git branch -D <rama>'):"
  echo "$terminadas" | sed 's/^/  /'
fi

if command -v gh >/dev/null 2>&1; then
  prs=$(gh pr list --limit 10 2>/dev/null)
  [ -n "$prs" ] && { echo "PULL REQUESTS ABIERTOS:"; echo "$prs"; }
fi
exit 0
