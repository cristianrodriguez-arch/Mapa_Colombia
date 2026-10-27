---
description: Rama — crea la rama de la tarea (tipo/descripcion-corta) desde el main de hoy; Claude propone el nombre y pregunta
argument-hint: "[qué vas a hacer]"
disable-model-invocation: true
allowed-tools: Bash(bash .claude/scripts/rama.sh:*), Bash(git status:*), Bash(git branch:*)
---

Rama actual y cambios sin commitear:
!`git branch --show-current`
!`git status --short`

Lo que el usuario va a hacer (puede venir vacío): $ARGUMENTS

Responde en español y breve.

1. Si no dijo qué va a hacer, pregúntaselo en una línea.
2. Propón **un** nombre `tipo/descripcion-corta` (tipo: `feat` algo nuevo, `fix` arreglo, `docs`, `chore` mantenimiento, `refactor`, `test`; minúsculas, sin tildes, palabras con guiones, 2–4 palabras; p. ej. `feat/ventas-cumplimiento`). Si el pedido mezcla temas independientes, propón una rama por tema y empieza por una.
3. **Pide confirmación del nombre.** Solo con el visto bueno ejecuta `bash .claude/scripts/rama.sh <nombre>`.
4. Si ya había cambios sin commitear, avisa que la rama nueva se los llevó.

Cierre: "Listo para trabajar en `<rama>`. Cuando quieras verlo funcionando: /probar; para mandarlo a revisión: /enviar."
