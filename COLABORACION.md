# Guía de colaboración del equipo

Cómo trabajamos Cristian y Sebas (y quien se sume) sobre este repositorio sin pisarnos y sin romper producción. Lo importante lo hacen los comandos de Claude Code; esta guía explica el porqué.

## Principios

1. **`main` siempre funciona y es lo que se publica.** Nadie trabaja ni sube directo a `main`: se actualiza solo con el *merge* de un pull request (PR).
2. **Una tarea = una rama = un PR.** Ramas cortas (horas o pocos días), de una sola persona.
3. **Otra persona revisa antes de que entre.** Sebas es el **líder**: revisa y aprueba los PR de Cristian y decide cuándo se publica a producción. Los PR de Sebas los revisa Cristian.
4. **Cada quien prueba en su propia copia del script de Apps Script.** Nadie toca el `/dev` del otro ni producción para probar.
5. **Publicar es un paso aparte y deliberado**, después del merge. Un commit o un merge nunca cambia por sí solo lo que ve el equipo.
6. **Los mensajes de commit y de PR se escriben para una persona**, en lenguaje de negocio: es lo que el compañero lee al empezar su día.

> `main` **no** está protegida en la configuración de GitHub (decisión del equipo). Las reglas se sostienen con estos comandos, con los *hooks* versionados de `.githooks/` (bloquean commits y push a `main` y los secretos) y con la disciplina de todos.

## El flujo, paso a paso

```
/iniciar → /rama → (trabajar con Claude) → /probar → /enviar → PR revisado y aprobado → merge → /publicar
```

| Comando | Qué hace | Quién |
|---|---|---|
| `/iniciar` | Trae lo último de `main`, **resume qué hizo el compañero**, avisa qué tiene en curso y deja el git configurado (hooks, rebase). Si estás en `main`, te ayuda a abrir la rama de la tarea. | Todos, cada vez que empiezan |
| `/rama [qué vas a hacer]` | Crea `tipo/descripcion-corta` desde el `main` de hoy. Claude propone el nombre y **te pregunta antes de crearla**. | Todos |
| `/probar` | Pone tu rama al día con `main`, corre las pruebas y sube el código a **tu** proyecto de pruebas (URL `/dev`). No toca GitHub ni producción. | Todos |
| `/enviar [nota]` | Commit con buen mensaje, rebase sobre `main`, pruebas y `git push` **de tu rama**. Te entrega el enlace y el texto del PR. No publica nada. | Todos |
| `/publicar` | Sube `main` a producción: versión nueva, la misma URL de siempre y un tag `produccion-vNN`. Primero muestra qué saldría y **pide confirmación**. | El líder, o quien él autorice |

Los comandos viven en `.claude/commands/` y sus scripts en `.claude/scripts/` (todo versionado). Si algo se detiene, el script dice `PARADO:` y por qué; Claude lo explica y propone qué hacer.

### 1. Empezar el día: `/iniciar`
Siempre. Te cuenta los cambios nuevos de `main` agrupados por persona, las ramas que el compañero tiene en marcha (para no duplicar trabajo ni tocar los mismos archivos) y los PR abiertos. También limpia el aviso de ramas ya terminadas.

### 2. Una rama por tarea: `/rama`
Nombre `tipo/descripcion-corta`, en minúsculas y con guiones:

| Tipo | Para | Ejemplo |
|---|---|---|
| `feat` | algo nuevo | `feat/ventas-cumplimiento` |
| `fix` | un arreglo | `fix/mtd-fechas` |
| `docs` | solo documentación | `docs/guia-colaboracion` |
| `chore` | mantenimiento, scripts, configuración | `chore/limpiar-kml` |
| `refactor` / `test` | reordenar código / pruebas | `refactor/selectores` |

- **Una rama es de una sola persona.** Si necesitas algo de la rama del compañero, pídele que la envíe y la mergee.
- Si la tarea mezcla temas independientes, son **ramas distintas** (PR chicos se revisan rápido y se revierten fácil).
- Si ya empezaste a editar estando en `main`, no pasa nada: la rama nueva se lleva tus cambios sin commitear. Lo que no se puede es *commitear* en `main` (el hook lo bloquea).

### 3. Trabajar y probar: `/probar`
Pide los cambios a Claude en lenguaje natural y, cuando quieras verlos funcionando, `/probar`. Sube el código de tu rama a **tu** proyecto de pruebas.

**Una sola vez por persona** (si falta `.clasp.dev.json`, `/probar` te guía):
```bash
npm i -g @google/clasp && clasp login            # cuenta con acceso a los libros
pip install -r requirements.txt                   # para la prueba del ETL
bash .claude/scripts/crear_proyecto_prueba.sh "<tu nombre>"
```
Eso crea un script vacío en tu cuenta y guarda su id en `.clasp.dev.json` (ignorado por git, nunca se sube). Luego, en su editor: *Implementar → Probar implementaciones* para obtener tu URL `/dev` y autorizar permisos. El script usa `openById`, así que lee los mismos libros que producción: **ojo, es el mismo dato real**; el visor (`Code.js`) solo lee, así que probar no modifica los libros. Las herramientas del menú de la hoja (geocodificación, cruce) sí escriben, pero no corren desde tu proyecto de pruebas.

### 4. Enviar: `/enviar`
Claude escribe el commit para el revisor, el script pone la rama al día con `main` (rebase), corre **todas** las pruebas (`tests/*.js` y `tests/test_etl_s3.py`) y sube la rama. Después abres el PR con el enlace que te da, usando la plantilla (`.github/pull_request_template.md`): **qué cambia, por qué, cómo se probó y ojo para el equipo**.

- **Título del PR = `tipo(área): qué cambió`** (p. ej. `feat(visor): % de cumplimiento arriba en Ventas`). Los PR se mergean con **Squash and merge**, y ese título queda como el mensaje en `main`.
- GitHub corre las mismas pruebas en el PR (`.github/workflows/tests.yml`); no se mergea con la marca roja.
- Si tienes que cambiar algo tras la revisión, commitea en la misma rama y `/enviar` otra vez: el PR se actualiza solo.

### 5. Revisar y mergear (el líder)
Revisa el PR en GitHub: ¿se entiende qué cambia?, ¿las pruebas pasan?, ¿algo toca un archivo delicado (ver abajo)? Aprueba y mergea con **Squash and merge**, marcando **Delete branch**. Comenta en el PR en vez de arreglar por tu cuenta en la rama del otro.

### 6. Publicar: `/publicar`
Con el PR ya en `main`: `git switch main` y `/publicar`. Muestra los commits que saldrían, pide confirmación, sube a producción y deja el tag `produccion-vNN`. Se detiene si en el editor web de producción alguien cambió código que no está en GitHub. **Nadie edita código directo en el editor de Apps Script de producción.**

## Commits y PR

```
feat:     algo nuevo
fix:      un arreglo
refactor: cambia el código sin cambiar lo que hace
docs:     documentación
test:     pruebas
chore:    mantenimiento (scripts, configuración, colaboración)
```
Formato: `tipo(área): una frase`, y debajo una línea por cambio en lenguaje de negocio, y `Ojo:` si el otro debe hacer algo (correr el ETL, `limpiarCache()`…). Áreas: `visor`, `mapa`, `mtd`, `sivso`, `yoobic`, `bricks`, `etl`, `colaboracion`.

## Reglas

**Siempre**
- Empezar con `/iniciar`; una rama nueva por tarea.
- Probar en tu proyecto de pruebas antes de enviar.
- Commits y PR chicos y de un solo tema.
- Si cambia una cifra o su fuente, actualizar README / `Apps Script/CLAUDE.md` / `DOCUMENTACION_KPIS.md` en el mismo PR.

**Nunca**
- Commit ni push a `main` (los hooks lo bloquean). Salida de emergencia: `PERMITIR_MAIN=1`, solo el líder y avisando en el equipo.
- `git push --force` (el script usa `--force-with-lease` solo en tu rama).
- `git add -f`, ni `--no-verify` para saltarse los hooks.
- Subir secretos o datos de clientes: `sfe-prod-*.json`, `config.py`, `MAESTRO PDV's*.xlsx`, `Apps Script/datos_sheets/`. Las llaves viven en Script Properties o en `config.py` (local). Si una llave se sube por error, **se considera filtrada**: se revoca y se crea otra, no basta con borrar el commit.
- Editar a mano `brick_ids.csv` (memoria de códigos) ni los generados `Colombia_Bricks.kml/xlsx/geojson` (salen de `unificar_bricks.py`; un cambio ahí va en su propio PR).
- `clasp push` ni `clasp deploy` a mano: para eso están `/probar` y `/publicar`.

## Qué hacer cuando…

- **Mi rama quedó atrás de `main`** → `/probar` y `/enviar` la ponen al día solas (rebase).
- **Hay conflicto** → el script se detiene y lista los archivos. Díselo a Claude: resuelve manteniendo lo de ambos, `git rebase --continue` y repites. `git rebase --abort` deja todo como estaba.
- **El compañero y yo tocamos el mismo archivo** → `/iniciar` te muestra en qué anda cada uno; coordinen antes de empezar, sobre todo en `Code.js`, `Index.html` y los `Js*.html` grandes.
- **Algo roto llegó a producción** → *Implementar → Administrar implementaciones → editar → elegir la versión anterior* (vuelve en segundos), y después se arregla con un PR `fix/…` normal.
- **Urgencia real** → misma ruta, más corta: `fix/…`, `/enviar`, el líder aprueba en cuanto lo ve, `/publicar`. No hay atajos a `main`.
- **Tareas y pendientes** → *Issues* del repositorio en GitHub (con quién y para cuándo); el PR dice `Cierra #12`. No se usan TODO en el código ni un TAREAS.md.
- **Ver la historia** → `git log --oneline -20`, `git log --author=...`, o la pestaña *Commits* / *Pull requests* en GitHub. Los tags `produccion-vNN` marcan qué código está en cada versión publicada.

## Mejoras de GitHub que hoy NO están activas

Por decisión del equipo `main` no tiene protección. Si algún día se quiere que GitHub *obligue* lo que hoy es disciplina (Settings → Branches): exigir PR con 1 aprobación, exigir que pase el chequeo «Pruebas», prohibir force push. Y en Settings → General: *Automatically delete head branches*. `.github/CODEOWNERS` ya pide la revisión del líder automáticamente.

---
**Última actualización**: 2026-10-14 · **Mantenido por**: el equipo (cambios a esta guía = un PR `docs(colaboracion): …`)
