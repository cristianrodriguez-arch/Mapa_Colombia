---
description: Prueba — sube lo local a Apps Script (URL /dev) sin tocar GitHub; reemplaza el clasp push manual
argument-hint: ""
disable-model-invocation: true
allowed-tools: Bash(bash .claude/scripts/probar.sh:*)
---

Responde en español y breve. El usuario invocó /probar, así que aquí SÍ está autorizado el `clasp push` (no el `git push`).

Ejecuta `bash .claude/scripts/probar.sh`. Trae lo del compañero (`git pull --autostash`), corre las pruebas, comprueba que en Google no haya trabajo ajeno y hace `clasp push`. No hace commit ni `git push`. Si para:
- **Conflicto** → explica qué archivos chocan y pregunta cómo resolverlo.
- **Pruebas fallidas** → muestra el fallo y ofrece arreglarlo.
- **Cambios en Google que no están ni en GitHub ni en tu copia** → muestra la lista y pregunta: traerlos (`clasp pull` + commit) o pisarlos (`bash .claude/scripts/probar.sh --pisar-remoto`). No decidas tú.

Cierre en 2–3 líneas:
- Ya se ve en la URL **/dev** del visor (la de producción sigue con la versión anterior).
- Mientras no corras **/finalizar**, el código de prueba está en Google pero no en GitHub: si el compañero hace `/iniciar` verá un DESFASE con tu trabajo a medias. Cierra con /finalizar cuando lo des por bueno.
