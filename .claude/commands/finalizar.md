---
description: Cierre — commit con buen resumen para el compañero, pruebas, clasp push, git push y publicar la versión para el equipo
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

Responde en español y breve. El usuario invocó /finalizar, así que aquí SÍ están autorizados el `clasp push` y publicar en producción. Si en la nota del usuario dice "sin publicar" (o equivalente), ejecuta el script con `--sin-publicar`.

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

Ejecuta `bash .claude/scripts/finalizar.sh`. Integra lo del compañero, corre las pruebas, comprueba que nadie editó en el editor web hace `clasp push` + `git push` y **publica**: crea una versión nueva y mueve a ella la implementación de producción que ya existe (la URL del equipo no cambia). Si para:
- **Conflicto** → explica qué archivos chocan y pregunta cómo resolverlo.
- **Pruebas fallidas** → muestra el fallo y ofrece arreglarlo.
- **Cambios en Google que no están en GitHub** → muestra la lista y pregunta: traerlos a GitHub primero (`clasp pull` + commit) o pisarlos (`bash .claude/scripts/finalizar.sh --pisar-remoto`).
- **GitHub rechazó el push** → ejecuta el script una vez más.
- **No se pudo crear la versión o mover producción** → el código ya está en GitHub y en Apps Script; muestra el error y ofrece reintentar solo ese paso (`clasp create-version` + `clasp update-deployment <ID de producción del script> -V <n>`). Nunca `clasp deploy` sin `-i`: crea una implementación nueva con otro link.

## 3. Cierre

En 2–3 líneas: qué se subió y qué versión quedó publicada en producción (misma URL de siempre). Si se usó `--sin-publicar`, recuerda que el equipo sigue viendo la versión anterior. Para volver a una versión anterior: *Implementar → Administrar implementaciones → editar → elegir la versión*.
