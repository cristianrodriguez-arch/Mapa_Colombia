---
description: Prueba — sube tu rama a TU proyecto de Apps Script de pruebas (URL /dev); no toca GitHub ni producción
disable-model-invocation: true
allowed-tools: Bash(bash .claude/scripts/probar.sh:*), Bash(bash .claude/scripts/crear_proyecto_prueba.sh:*)
---

Responde en español y breve. El usuario invocó /probar, así que aquí SÍ está autorizado el `clasp push` **al proyecto de pruebas personal** (`.clasp.dev.json`), nunca a producción ni a GitHub.

Ejecuta `bash .claude/scripts/probar.sh`. Pone tu rama al día con main (rebase), corre las pruebas y sube el código a tu proyecto de pruebas. No hace commit ni `git push`. Si para:
- **Estás en main** → ofrece crear la rama (/rama).
- **SIN PROYECTO DE PRUEBA** → es la primera vez de esta persona. Explica en 2 líneas que cada quien prueba en su propia copia del script para no pisarse, y pregunta con qué nombre quiere crearla; con su respuesta ejecuta `bash .claude/scripts/crear_proyecto_prueba.sh "<nombre>"`, sigue con las instrucciones que imprime (abrir el editor, Implementar → Probar implementaciones, autorizar permisos) y luego repite `probar.sh`.
- **Conflicto con main** → explica qué archivos chocan y pregunta cómo resolverlos.
- **Pruebas fallidas** → muestra el fallo y ofrece arreglarlo.

Cierre en 2–3 líneas: ya se ve en la URL de prueba (dásela si el script la imprimió) y, cuando lo dé por bueno, el siguiente paso es /enviar.
