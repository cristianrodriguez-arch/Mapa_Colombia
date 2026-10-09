---
description: Inicio — trae lo último de GitHub y Apps Script y resume qué hizo el compañero
disable-model-invocation: true
allowed-tools: Bash(bash .claude/scripts/iniciar.sh:*), Bash(git stash:*), Bash(git checkout:*), Bash(git add:*), Bash(git commit:*)
---

Resultado de la sincronización (ya ejecutada):

!`bash .claude/scripts/iniciar.sh`

Responde en español y breve. No leas archivos ni ejecutes nada más salvo que arriba haya un PARADO o un DESFASE: el resumen sale solo de los mensajes de commit.

**Si hubo commits nuevos**, resúmelos agrupados por persona, en lenguaje claro (qué cambió en el visor o en los datos y para qué), sin hashes ni nombres de archivo salvo que importen. Si algún commit trae "Ojo:", ponlo primero. Formato:

> **Sebitotis** — 2 cambios (jue 08/10, noche)
> - Nueva pestaña Yoobic · Perfect Store: …
> - …
>
> **Ojo:** …

**Sin commits nuevos** → una línea.

**Si algo se paró:**
- Cambios sin commitear → muéstralos y pregunta: guardarlos aparte (`git stash`), commitearlos o dejarlo así. Después vuelve a ejecutar `bash .claude/scripts/iniciar.sh`.
- Conflicto en git pull o fallo de clasp → explica qué pasó en 1–2 líneas y para.
- DESFASE con Apps Script (alguien editó en el editor web sin pasar por GitHub) → muestra la lista y pregunta si conservar esos cambios (commit `chore(apps-script): traer cambios hechos en el editor web`) o descartarlos (`git checkout -- "Apps Script/"`). No decidas tú.

Termina con "Listo para trabajar." (o qué falta para estarlo).
