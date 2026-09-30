# Guía de Colaboración del Equipo

## Principios Fundamentales

- **Una sola rama (`main`)**: Todos trabajan en `main` directamente, sin crear ramas feature.
- **Cambios pequeños y frecuentes**: Commits descriptivos; cada commit es una pieza de trabajo que funciona.
- **Claude como asistente**: Tu equipo describe tareas en lenguaje natural; Claude las implementa y propone pull requests.
- **Transparencia**: Todos ven qué está haciendo el otro a través de los commits y PRs.

---

## Paso a Paso: Flujo de Trabajo

### 1️⃣ Clonar el Repositorio (Una sola vez)

**Cada persona del equipo hace esto SOLO UNA VEZ:**

```powershell
git clone https://github.com/[usuario]/[repo].git
cd "Universdad/Bricks CO"
```

Luego abre la carpeta en VSCode:

```powershell
code .
```

O en VSCode: `Ctrl+K, Ctrl+O` → selecciona la carpeta.

---

### 2️⃣ Antes de Empezar: Sincronizar con `main`

**Cada mañana o antes de trabajar:**

```powershell
git pull origin main
```

Esto trae los últimos cambios que hizo tu equipo.

---

### 3️⃣ Hacer un Cambio: En Palabras Simples

Tienes dos opciones:

#### **Opción A: Tú implementas, Claude revisa**
1. Haces los cambios en VSCode
2. Abres terminal: `git diff` → ves qué cambiaste
3. Usas Claude Code (`Ctrl+I` en VSCode) para que revise tu código

#### **Opción B: Claude implementa (RECOMENDADO para este flujo)**
1. En Claude Code describe lo que quieres en **lenguaje natural**:
   > "Añade una función en `asignar_bricks.py` que valide coordenadas antes de procesar"
2. Claude hace el cambio
3. Claude propone un PR con la descripción

---

### 4️⃣ Crear un Commit

**Cuando hayas terminado un cambio (pequeño, que funcione):**

```powershell
git add .
git commit -m "feat: descripción corta del cambio"
```

**Formato de mensaje (sigue este patrón):**

```
feat:     nueva funcionalidad
fix:      corrección de bug
refactor: cambio en código sin funcionalidad nueva
docs:     cambios en documentación
test:     agregar o actualizar tests
```

**Ejemplos válidos:**
```
feat: añadir validación de coordenadas en asignar_bricks.py
fix: corregir crash al procesar KML vacío
refactor: simplificar lógica de normalización
docs: actualizar COLABORACION.md
```

---

### 5️⃣ Subir Cambios a `main`

```powershell
git push origin main
```

**Eso es todo.** No hay ramas, no hay complejidad.

---

### 6️⃣ Hacer un Pull Request (Para Revisar Cambios)

Si quieres que otro miembro **revise formalmente** antes de pushearlo, **sin salir de la rama `main`**:

```powershell
# 1. Haz el cambio y crea el commit (no lo pushees aún)
git add .
git commit -m "feat: tu cambio"

# 2. Crea un PR en lenguaje natural usando Claude
# Escribe en Claude:
# "Tengo un commit listo: [pega el mensaje]. 
#  Puedes crear un PR describiendo esto en lenguaje de usuario?"

# 3. Claude genera el PR. Otra persona lo revisa.
# 4. Si tiene feedback, actualizas el commit y lo pusheas.
```

---

## Reglas de Oro

### ✅ SIEMPRE

- **Antes de trabajar**: `git pull origin main`
- **Commits pequeños**: Un cambio = un commit (no 10 cambios en uno)
- **Lenguaje natural en los PRs**: Explica QUÉ y POR QUÉ, no solo el código
- **Prueba antes de pushear**: Si es Python, ejecuta el script; si es Apps Script, revisa el visor
- **Cuidado con archivos especiales**:
  - **NUNCA** editar a mano: `brick_ids.csv` (la "memoria de códigos")
  - `Colombia_Bricks.kml/xlsx/geojson` — estos se generan automáticamente con `unificar_bricks.py`

### ❌ NUNCA

- No crees ramas (excepto si Cristian lo pide)
- No hagas un commit gigante con 20 cambios distintos
- No pushees código que no probaste
- No edites `brick_ids.csv` manualmente
- No fuerces un push (`git push --force`) — pregunta a Cristian

---

## Sistema de Tareas: Usar ChatGPT/Claude como Coordinador

Si tu equipo quiere **coordinar trabajo paralelo**, puedes usar Claude como "gestor de tareas":

### Opción 1: TODO en el código

En cualquier archivo, escribe comentarios TODO:

```python
# TODO: Optimizar simplificación de geometrias (asignado a Juan)
# TODO: Agregar tests para asignar_bricks.py (asignado a María)
```

Claude puede listar TODOs: `grep -r "TODO" .`

### Opción 2: Archivo TAREAS.md

Crea `TAREAS.md` en la raíz:

```markdown
# Tareas en Progreso

- [ ] Validar coordenadas en `asignar_bricks.py` — **Juan** — 50%
- [ ] Refactorizar `unificar_bricks.py` — **María** — inicio
- [ ] Documenter filtros en `Apps Script/` — **Cristian** — revisión

# Tareas Completadas

- [x] Añadir `preview_visor.html` — Juan
```

Cada que termines algo:
```powershell
# Actualiza TAREAS.md
git add TAREAS.md
git commit -m "docs: marcar tarea como completada"
git push
```

---

## Ejemplo de Flujo Completo

**Escenario**: Tu equipo quiere agregar validación de coordenadas.

### Paso 1: Pedir a Claude
```
Cristian: "Quiero validar que las coordenadas en asignar_bricks.py 
sean WGS84 válidas antes de procesarlas. ¿Puedes hacerlo?"
```

### Paso 2: Claude Trabaja
Claude edita `asignar_bricks.py`, añade la función, la prueba.

### Paso 3: Claude Propone el PR
Claude crea un PR con descripción en lenguaje natural:
```
## ¿Qué cambio?
Agregué validación de coordenadas WGS84 antes de procesar puntos.

## Por qué?
Evita crashes si alguien pasa coords inválidas.

## Cómo probarlo?
python asignar_bricks.py datos_invalidos.xlsx
(Debe mostrar error descriptivo, no crash)
```

### Paso 4: Review & Merge
Otro miembro revisa el PR, comenta si necesita ajustes.

### Paso 5: Merge & Push
```powershell
git pull origin main  # Trae el PR mergeado
```

---

## Preguntas Frecuentes

### P: ¿Qué pasa si dos personas editan lo mismo al mismo tiempo?
**R**: Git muestra un **conflicto**. Solución: uno de ustedes hace `pull`, resuelve el conflicto (mantiene ambas líneas) y hace `push`. El otro hace `pull` de nuevo.

**Cómo evitarlo**: Coordinense por Slack: "Voy a editar `asignar_bricks.py` los próximos 20 min".

### P: ¿Puedo hacer push sin pasar por PR?
**R**: Sí, si es un cambio pequeño y obvio (p. ej., actualizar TAREAS.md, fix de typo). Para cambios grandes, siempre pasa por PR.

### P: ¿Qué pasa si alguien hace push de algo roto?
**R**: Alguien lo arregla rápido con otro commit `fix:`. La historia queda visible.

### P: ¿Cómo veo lo que hizo cada quien?
**R**: 
```powershell
git log --oneline        # Últimos 10 commits
git log --author="Juan"  # Solo commits de Juan
git blame asignar_bricks.py  # Quién editó cada línea
```

### P: ¿Necesito estar online todo el tiempo?
**R**: No. Puedes trabajar offline, hacer commits locales. Cuando tengas conexión: `git push origin main`.

---

## Checklist Antes de Pushear

- [ ] Hice `git pull origin main`
- [ ] Probé el cambio (ejecuté el script / reviré el visor)
- [ ] Mi commit es pequeño y descriptivo
- [ ] El mensaje dice QUÉ y POR QUÉ (no cómo)
- [ ] No edité archivos "prohibidos" (`brick_ids.csv`)
- [ ] No tengo líneas de debug/test sin usar
- [ ] Hice `git add .` (no `.gitignore` accidental)

---

## Contacto & Escaladas

- **Dudas técnicas**: Pregunten en Slack o a Claude Code
- **Conflictos graves**: Avisen a Cristian
- **Cambios al proceso**: Editen esta guía con `feat: ...` y avisen

---

**Última actualización**: 2026-09-30
**Mantenido por**: El equipo
