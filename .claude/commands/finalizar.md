---
description: Cierre de sesión — commit, git pull, pruebas, clasp push y git push
argument-hint: "[mensaje de commit opcional]"
disable-model-invocation: true
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(git pull:*), Bash(git push:*), Bash(git log:*), Bash(git show:*), Bash(node tests/*), Bash(clasp pull:*), Bash(clasp push:*), Bash(clasp status:*)
---

Rutina de CIERRE de trabajo. Ejecuta los pasos en orden, desde la raíz del repo, y detente si algo falla. Responde en español. El usuario la invocó explícitamente, así que aquí SÍ está autorizado el `clasp push` (excepción a la regla de `Apps Script/CLAUDE.md`).

Mensaje de commit indicado por el usuario (puede venir vacío): $ARGUMENTS

1. **Revisar cambios**: `git status --short` y `git diff --stat`.
   - Comprueba que no entren secretos ni datos de clientes (`*.json` de credenciales, `MAESTRO PDV's*.xlsx`, `config.py`, `Apps Script/datos_sheets/`). Si aparece alguno, para y avisa.

2. **Commit** (si hay cambios): `git add -A` y `git commit`.
   - Usa el mensaje del usuario si lo dio; si no, redacta uno en español con el estilo del repo (`feat(visor): …`, `fix(sivso): …`, `docs: …`) a partir del diff.
   - Termina el mensaje con la línea de co-autoría de Claude.
   - Si no hay cambios ni commits pendientes de subir, dilo y termina.

3. **Integrar lo del compañero ANTES de subir**: `git pull --rebase origin main`.
   - Es obligatorio antes del `clasp push`: si no, se pisa en Apps Script lo que el otro ya subió.
   - Si hay conflicto, para y explícalo; no lo resuelvas sin preguntar.

4. **Pruebas** (un error de sintaxis en un solo `Js*.html` rompe toda la web app): corre TODOS los `tests/*.js` con `node`, uno por uno — hoy `test_servidor_mtd.js`, `test_cliente_mtd.js`, `test_cliente_sivso.js`, `test_yoobic.js` y `chequeo_sintaxis_html.js` (si aparece uno nuevo, también).
   - Si alguna falla, NO hagas `clasp push` ni `git push`: muestra el error y para.

5. **Comparar con el remoto antes de pisarlo**: copia `.clasp.json` a una carpeta temporal (fuera del repo) cambiando `rootDir` a `"."`, ejecuta `clasp pull` allí y compara cada archivo de código (`.js`, `.html`, `appsscript.json`) contra `origin/main` (`git show origin/main:"Apps Script/<archivo>"`): si todos usan `/finalizar`, el remoto debe coincidir con lo último subido a Git.
   - Si el remoto tiene cambios que no están en Git (alguien editó en el editor web o hizo `clasp push` sin `git push`), PARA: muéstralos y pregunta si incorporarlos antes o pisarlos.
   - Borra la carpeta temporal al terminar.

6. **Apps Script**: `clasp push`.
   - Si pide confirmación por cambio del manifiesto, pregunta al usuario. Si falla por autenticación, que ejecute `clasp login`.
   - Recuerda: `clasp push` actualiza el código (HEAD). Si la web app usa una implementación versionada, la URL de producción sigue sirviendo la versión anterior: hay que crear una nueva versión del deployment (Implementar → Administrar implementaciones) o probar con la URL `/dev`. Ver sección 8 de `Apps Script/DOCUMENTACION_KPIS.md`.

7. **Git**: `git push origin main`.
   - Si lo rechaza porque el compañero subió algo entretanto, repite desde el paso 3.

8. Cierra con un resumen corto: commits subidos (`git log --oneline` de lo que se empujó), resultado de las pruebas, y confirmación de `clasp push` y `git push`.
