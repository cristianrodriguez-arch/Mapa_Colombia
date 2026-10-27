---
description: Publicar — sube main a producción (versión nueva, misma URL, tag produccion-vNN); solo desde main y con confirmación
disable-model-invocation: true
allowed-tools: Bash(bash .claude/scripts/publicar.sh:*), Bash(git switch main:*), Bash(git status:*)
---

Resultado de la revisión previa (no se subió nada todavía):

!`bash .claude/scripts/publicar.sh`

Responde en español y breve. El usuario invocó /publicar: aquí SÍ están autorizados el `clasp push` al script de producción y mover la implementación de producción, **pero solo después de su confirmación explícita en este turno**.

- **PARADO: se publica solo desde main** → ofrece `git switch main` (si hay cambios sin commitear, para: primero /enviar) y repite /publicar.
- **NADA QUE PUBLICAR** → dilo en una línea.
- **PARADO: pruebas fallidas** → muestra el fallo; main está roto, se arregla con un PR `fix/…`.
- **PARADO: en el editor web de producción hay código que no está en git** → muestra la lista y pregunta: traerlo a git (rama + PR) o pisarlo. Solo si el usuario dice pisarlo: `bash .claude/scripts/publicar.sh --confirmar --pisar-remoto`.
- **SIN CONFIRMAR** → resume en lenguaje de negocio qué verá distinto el equipo (de la lista "SALDRÍA A PRODUCCIÓN") y **pregunta si publica**. Con el sí: `bash .claude/scripts/publicar.sh --confirmar`.

Si tras confirmar falla crear la versión o mover producción, muestra el error y ofrece reintentar solo ese paso (`clasp create-version` + `clasp update-deployment <DEPLOY_PROD de comun.sh> -V <n>`). Nunca `clasp deploy` sin `-i`: crea una implementación nueva con otro link.

Cierre en 2–3 líneas: versión publicada, tag creado y que la URL del equipo no cambió. Para volver atrás: *Implementar → Administrar implementaciones → editar → elegir la versión anterior*.
