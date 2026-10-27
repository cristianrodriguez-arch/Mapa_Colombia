---
description: Enviar — commit con buen mensaje, rama al día con main, pruebas y push de TU rama + texto del PR (no publica nada)
argument-hint: "[nota opcional para el commit]"
disable-model-invocation: true
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(git log:*), Bash(bash .claude/scripts/enviar.sh:*)
---

Rama actual:
!`git branch --show-current`

Cambios sin commitear:
!`git status --short`
!`git diff --stat HEAD`

Commits de la rama que no están en main:
!`git log --oneline origin/main..HEAD`

Nota del usuario para el commit (puede venir vacía): $ARGUMENTS

Responde en español y breve. El usuario invocó /enviar, así que aquí SÍ está autorizado el `git push` **de su rama** (nunca de main). No hay `clasp push` ni publicación.

Si está en **main**, para: ofrece crear la rama con /rama (se lleva los cambios sin commitear).

## 1. Commit (si hay cambios sin commitear)

Si entra algún secreto o dato de clientes (`sfe-prod-*.json`, credenciales `*.json`, `config.py`, `MAESTRO PDV's*.xlsx`, `Apps Script/datos_sheets/`), para y avisa (el hook también lo bloquea). Si no, `git add -A` y `git commit`. Nunca `--no-verify`.

El mensaje es lo que el revisor y el compañero leerán: escríbelo **para una persona**, en lenguaje de negocio.

```
<tipo>(<área>): <qué cambió, en una frase>

- <qué cambió y para qué — una línea por cambio>
Ojo: <algo que el otro deba saber o hacer> (solo si aplica)

Co-Authored-By: <línea de co-autoría de Claude>
```

Tipos: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`. Áreas: `visor`, `mapa`, `mtd`, `sivso`, `yoobic`, `bricks`, `etl`, `colaboracion`. Si hay temas distintos, un commit por tema (y avisa si deberían ser PR distintos).

## 2. Subir la rama

Ejecuta `bash .claude/scripts/enviar.sh`. Pone la rama al día con main (rebase), corre todas las pruebas y hace `git push --force-with-lease` de la rama. Si para:
- **Conflicto con main** → explica qué archivos chocan y pregunta cómo resolverlos (mantener lo de ambos); luego `git rebase --continue` y repite.
- **Pruebas fallidas** → muestra el fallo y ofrece arreglarlo.
- **GitHub rechazó el push** → muestra el error; no uses `--force`.

## 3. Texto del PR

Entrega el enlace que imprimió el script y el texto listo para pegar, con la plantilla `.github/pull_request_template.md`:
- **Título** = `tipo(área): qué cambió` (será el mensaje en main con *Squash and merge*).
- **¿Qué cambia? / ¿Por qué? / ¿Cómo se probó? / Ojo para el equipo**, en lenguaje de negocio.
- Termina el cuerpo con la línea de atribución de Claude Code.

Cierre: "PR listo para revisión de <Cristian si el autor es Sebas; Sebas si es Cristian>. Tras el merge, el líder publica con /publicar."
