---
description: Inicio — trae lo último de main, resume qué hizo el equipo y deja el git configurado
disable-model-invocation: true
allowed-tools: Bash(bash .claude/scripts/iniciar.sh:*), Bash(bash .claude/scripts/rama.sh:*), Bash(git branch -D:*)
---

Resultado de la sincronización (ya ejecutada):

!`bash .claude/scripts/iniciar.sh`

Responde en español y breve. No leas archivos ni ejecutes nada más salvo que arriba haya un PARADO: el resumen sale solo de los mensajes de commit.

**Si hubo commits nuevos en main**, resúmelos agrupados por persona, en lenguaje claro (qué cambió en el visor o en los datos y para qué), sin hashes ni nombres de archivo salvo que importen. Si algún commit trae "Ojo:", ponlo primero. Formato:

> **Sebitotis** — 2 cambios (jue 08/10, noche)
> - Nueva pestaña Yoobic · Perfect Store: …
> - …
>
> **Ojo:** …

**Sin commits nuevos** → una línea.

**Además, solo si aparecen en la salida:**
- **EN CURSO**: dile qué tiene el compañero en marcha (rama y de qué trata, por el nombre y el último commit) para que no dupliquen trabajo ni toquen los mismos archivos.
- **TU RAMA … le faltan N de main**: avisa que /probar y /enviar la ponen al día.
- **PULL REQUESTS ABIERTOS**: menciónalos; si alguno espera revisión suya, dilo.
- **RAMAS TERMINADAS**: ofrece borrarlas (`git branch -D <rama>`); solo las borras si el usuario dice que sí.

**Si se paró** (PARADO) → explica qué pasó en 1–2 líneas y para.

**Cierre según dónde esté el usuario:**
- Está en **main** (o sin rama) → pregúntale qué va a trabajar. Con su respuesta propón un nombre de rama `tipo/descripcion-corta` (tipo: feat, fix, docs, chore, refactor o test; minúsculas y guiones) y **pide confirmación**; con el visto bueno ejecuta `bash .claude/scripts/rama.sh <nombre>`. Si ya tiene cambios sin commitear en main, la rama se los lleva consigo: avísalo.
- Ya está en una **rama de trabajo** → "Listo para trabajar en `<rama>`."
