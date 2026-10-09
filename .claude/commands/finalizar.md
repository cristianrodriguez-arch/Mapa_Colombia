---
description: Cierre — commit con buen resumen para el compañero, pruebas, clasp push y git push
argument-hint: "[nota opcional para el commit]"
disable-model-invocation: true
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(git log:*), Bash(bash .claude/scripts/finalizar.sh:*)
---

Cambios sin commitear:
!`git status --short`
!`git diff --stat HEAD`

Commits locales todavía sin subir:
!`git log --oneline origin/main..HEAD`

Nota del usuario para el commit (puede venir vacía): $ARGUMENTS

Responde en español y breve. El usuario invocó /finalizar, así que aquí SÍ está autorizado el `clasp push`.

## 1. Commit (si hay cambios sin commitear)

Si entra algún secreto o dato de clientes (credenciales `*.json`, `MAESTRO PDV's*.xlsx`, `config.py`, `Apps Script/datos_sheets/`), para y avisa. Si no, `git add -A` y `git commit`.

El mensaje es lo que el compañero leerá en su `/iniciar`: escríbelo **para él**, no para una máquina.

```
<tipo>(<área>): <qué cambió, en una frase>

- <qué cambió y para qué, en lenguaje de negocio — una línea por cambio>
- …
Ojo: <algo que el otro deba saber o hacer> (solo si aplica)

Co-Authored-By: <línea de co-autoría de Claude>
```

Tipos: `feat` (algo nuevo), `fix` (arreglo), `docs`, `chore`. Área: `visor`, `mapa`, `mtd`, `sivso`, `yoobic`, `bricks`, `etl`…

Redáctalo con lo que ya sabes de esta conversación. Solo si no basta (cambios hechos fuera del chat), mira `git diff` de los archivos concretos que necesites, nunca el diff completo de archivos grandes. Si hay cambios de temas distintos, haz un commit por tema.

## 2. Subir

Ejecuta `bash .claude/scripts/finalizar.sh`. Integra lo del compañero, corre las pruebas, comprueba que nadie editó en el editor web y hace `clasp push` + `git push`. Si para:
- **Conflicto** → explica qué archivos chocan y pregunta cómo resolverlo.
- **Pruebas fallidas** → muestra el fallo y ofrece arreglarlo.
- **Cambios en Google que no están en GitHub** → muestra la lista y pregunta: traerlos a GitHub primero (`clasp pull` + commit) o pisarlos (`bash .claude/scripts/finalizar.sh --pisar-remoto`).
- **GitHub rechazó el push** → ejecuta el script una vez más.

## 3. Cierre

En 2–3 líneas: qué se subió y un recordatorio de que la URL de producción del visor sigue sirviendo la versión anterior hasta crear una nueva versión en *Implementar → Administrar implementaciones* (la URL `/dev` ya muestra lo nuevo).
