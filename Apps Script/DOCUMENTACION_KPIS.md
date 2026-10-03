# Documentación de KPIs, filtros y rendimiento — Visor Cobertura Estratégica

> Para el equipo (y para Claude). Resume **de dónde sale cada cifra**, **cómo se calcula**, **contra qué se compara**,
> qué encontró la auditoría del 2026-10-03 y **qué quedó corregido o pendiente**. Complementa a
> [CLAUDE.md](CLAUDE.md) (arquitectura) — si algo de aquí contradice al código, manda el código; avísanos.
>
> `.md` dentro de `Apps Script/` **no** lo sube `clasp push` (solo `.js`, `.html` y `appsscript.json`), así que es seguro tenerlo aquí.

## 1. Mapa rápido

| Pestaña | Archivo cliente | Endpoint del servidor | Fuente |
|---|---|---|---|
| **Ventas MTD** (primera hoja, por defecto) | `JsVentasMtd.html` | `getVentasMtdCompletoJson(forzar)` | Libro `1hViwAW2…` ("Ventas - YTD"): hojas `CUMPLIMIENTO`, `PLANTILLA`, `Historico de ventas` |
| **SI vs SO** | `JsSIvsSO.html` | `getSIvsSOJson(forzar)` | Libro "Carga Looker" `1_eW3f95…`, hoja `Data` |
| **Mapa** | `JsMapa.html`, `JsFiltros.html`, `JsPaneles.html` | 5 endpoints (`getPuntosJson`, `getBricksJson`, `getVentasJson`, `getPortafolioJson`, `getAsignacionesJson`) | Hojas del MAESTRO PDV's + JSON del ETL en Drive |

Todos los endpoints devuelven **strings JSON ASCII** (`jsonAscii_`), se cachean por trozos (`conCache_`) y aceptan `forzar=true`
(botón **Actualizar**) para saltar la caché.

## 2. Glosario (lo que más confunde)

| Término | Significado real | Dónde se verificó |
|---|---|---|
| **Mes de corte / periodo** | Mes que indica la celda de control de `CUMPLIMIENTO` ("cambie el número para cambiar el mes", p. ej. `O1`=1-sep-2026, `P1`=9). **Es un mes CERRADO**, no el mes en curso. El servidor lo devuelve en `meta.periodo`. | Hoja CUMPLIMIENTO, fila 1 |
| **"-1" (Real -1, A-1, YTD-1)** | **El mismo mes (o rango) del AÑO ANTERIOR.** NO es "el mes anterior". | PLANTILLA `Real -1` de Cruz Verde / Medipiel / Bella Piel = Histórico sep-2025 al peso (6.744 / 3.678 / 3.105 M) |
| **`Real` vs `Real (LOCAL)`** | En PLANTILLA, `Real` (última columna) concilia con CUMPLIMIENTO y el Histórico (17.722 M); `Real (LOCAL)` suma 17.375 M (28 filas difieren). Se usa `Real`. | Σ de las tres hojas, sep-2026 |
| **`Real -1 (LOCAL)` de CUMPLIMIENTO** | Tiene **otra base** que el `Real -1` de PLANTILLA/Histórico (Cruz Verde: 6.152 M vs 6.744 M). **No se usa.** El A-1 sale de PLANTILLA. | Comparación por cliente |
| **SAP ID (`id`)** | Clave común de las tres hojas de MTD. Sin SAP ID se usa `N:<nombre normalizado>`. | `mtdIdCliente_` |
| **KAM `SIN KAM` / `OTRO`** | `SIN KAM` = cliente sin ejecutivo asignado. `OTRO` + SAP `1` = fila contable "ISDIN" (se marca `interno`, entra al total porque CUMPLIMIENTO lo incluye). | CUMPLIMIENTO |
| **Corte de un año** | Último mes con venta de ese año (`mtdCortes` / `sivsoCortes`). Todo "contra el año anterior" se recorta a ese corte. | — |

## 3. KPIs por pestaña

### 3.1 Ventas MTD

| KPI / tabla | Fórmula | Comparativa | Filtros que lo afectan |
|---|---|---|---|
| **Venta** | Σ `Real (LOCAL)` del mes de corte de los clientes filtrados | `Plan` (Σ `Current Plan (LOCAL)`) y `A-1` (Σ PLANTILLA `Real -1`, +Δ %) | Canal · KAM · Cliente |
| **% Cumplimiento** | Σ real ÷ Σ plan (**ponderado**, no promedio de %) solo si plan > 0; si no, "sin plan" (gris) | Semáforo: ≥ 100 % negro, ≥ 85 %/70 % gris, < 70 % rojo | ídem |
| **Acumulado año** | Σ `Real (año)` | `Plan YTD` (Σ plan del Histórico hasta el mes de corte) y `Plan año` | ídem |
| **Por Cliente** | una fila por cliente de CUMPLIMIENTO; `% Cumpl = real/plan` (plan>0); `Δ vs A-1 = (venta−A-1)/A-1` (A-1>0; "Nuevo" si no hay base) | A-1 | ídem |
| **Por KAM** | agrupa los clientes filtrados por KAM; clic en una fila filtra por ese KAM | A-1 | ídem |
| **Por Producto** | PLANTILLA consolidada por **nombre de producto** (varios EAN → un producto); `Δ vs A-1` | A-1 | ídem (cruce por SAP ID) |
| **Histórico por cliente** | Σ real y plan del año elegido, en los meses elegidos **hasta el corte** | mismo corte del año anterior (cruce por SAP ID); el total A-1 incluye clientes que ya no venden | ídem + Año · Trimestre · Mes |
| **Por Trimestre** | 4 barras venta vs plan del año | — | Canal · KAM · Cliente (no Mes/Trimestre) |

Reglas:
- **Un solo conjunto de filtros** (`mtdFiltros`: `canal`, `kam`, `cliente`; multi-selección; OR dentro, AND entre dimensiones; opciones en cascada)
  produce `mtdIdsFiltrados()` y **todas** las secciones lo leen. Cambiar filtros solo con `setMtdFiltro(dim, arr)`.
- Los filtros se recuerdan en `localStorage` (`mtdFiltros_v1`).
- Atributos KAM/canal: los de CUMPLIMIENTO (cartera actual); para clientes que solo existen en el histórico, los de su última fila.

### 3.2 SI vs SO

| KPI / tabla | Fórmula |
|---|---|
| **Sell In / Sell Out** | Σ de `Real (LOCAL)` (o `Real #` en modo unidades) por `Type` = SI / SO, año elegido |
| **ΔSI / ΔSO** | `(actual − A-1)/A-1`; A-1 = año anterior **recortado al mismo corte** (ene–corte vs ene–corte) |
| **% SO / SI** | SO ÷ SI (si SI > 0) |
| **Prom SO (Nm)** | Σ SO de los N meses **calendario** que terminan en el corte del año elegido ÷ N (meses sin dato = 0). La ventana puede cruzar el año. |
| **INV** | Inventario del **último mes con fila `Type=INV`** del año elegido, **sumado** sobre cliente×producto. Productos/clientes sin foto ese mes = 0. |
| **% Part SI / SO** | cuota sobre el total visible |
| **Donut BU** | Participación del SO por BU, **solo BU con SO neto > 0** (las devoluciones netas se avisan aparte) |
| **DDI / Diferencia INV** | **No implementados** (la hoja `DIAS DE INV` está rota). Propuesta por confirmar con el equipo: `DDI = INV ÷ (Prom SO ÷ 30)` |

## 4. Orden por encabezado (`mtdTabla`)

Helper único en `JsVentasMtd.html` (lo usan también las tablas de SI vs SO). `mtdTabla({id, columnas, filas, total, orden, fila, alOrdenar})`.

- 1.er clic en un encabezado = **mayor → menor** (columnas de texto: A→Z); 2.º clic invierte; 3.er clic vuelve al orden por defecto.
- Nulos ("sin plan", sin base) **siempre al final**. La fila **TOTAL** nunca se ordena. El orden se conserva al volver a filtrar (`MTD_ORDEN`).
- `aria-sort` + flecha ▼/▲ en la columna activa; en móvil (≤ 700 px, donde el `<thead>` se oculta) hay un `<select>` + botón de dirección en el `<caption>`.
- El CSV exporta **lo que se ve** (`alOrdenar` entrega las filas en el orden mostrado).
- Para agregar una columna: añade `{k, t, tipo:'num'|'txt', celda(f, titulo)}` a `columnas`. `celda` devuelve el `<td>` (usa `mtdTd`, `mtdCeldaPct`, `mtdDeltaImp`).

## 5. Hallazgos de la auditoría (2026-10-03) y estado

| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| 1 | Subtítulo "Oct 2026" salía del reloj del navegador; los datos son de **septiembre** | Alta | ✅ `meta.periodo` desde la celda de control |
| 2 | "Venta -1 / ΔV-1" rotulado "mes anterior"; en realidad es el **mismo mes del año anterior** | Alta | ✅ rótulos A-1 / Δ vs A-1; columnas añadidas a Cliente, KAM y Producto |
| 3 | % Cumpl heredado de la hoja: 100 % con plan vacío (Saint-Priest, Dermamedica, Super Wow, ISDIN, Dermatológica con venta negativa) y 0 % rojo sin plan ni venta | Alta | ✅ `real/plan` solo con plan>0; "sin plan" en gris |
| 4 | Histórico: **YTD contra año completo anterior**. 2026 (ene–sep) 137.986 M vs 2025 completo 193.968 M → **−28,9 %**; contra el mismo corte (135.402 M) → **+1,9 %** | Alta | ✅ corte común (`mtdCortes`) |
| 5 | Total A-1 del histórico excluía clientes que ya no venden (2025: 113 clientes/mes, 2026: 73); cruce por **nombre** | Alta | ✅ cruce por SAP ID; total incluye clientes perdidos |
| 6 | Plan YTD sin corte (hoy oct–dic en 0, pero se cargará) | Media | ✅ plan recortado al corte |
| 7 | Fila interna ISDIN (SAP 1) y fila con `#N/A` (GRUPO EMPRESARIAL MGS) contadas como clientes; el `#N/A` pasaba a 0 en silencio | Media | ✅ marcadas (`interno`, `error`), avisadas en pantalla/Diagnóstico; "N clientes con venta o plan" |
| 8 | **Por Producto no se filtraba** (se creía que PLANTILLA no trae KAM/cliente: **sí trae SAP ID**) | Alta | ✅ filtra por SAP ID |
| 9 | "Actualizar" no saltaba la caché de 30 min; "Datos:" mostraba la hora de la caché | Alta | ✅ `forzar`; muestra la hora de lectura de la hoja |
| 10 | Una lectura vacía/con error se cacheaba 30 min | Media | ✅ no se cachea |
| 11 | **INV** se sobrescribía fila a fila (quedaba el de un solo cliente) y un mes sin fila INV pisaba la foto con 0 | Alta | ✅ foto del último mes con INV, sumada |
| 12 | ΔSI/ΔSO: año parcial vs año anterior completo | Alta | ✅ mismo corte |
| 13 | Prom SO ignoraba el año elegido, contaba meses sin dato fuera del divisor, total solo de productos listados | Media | ✅ ventana calendario hasta el corte |
| 14 | Fechas: `sivsoMes_` usaba getters UTC y `mtdFecha_` los de `Europe/Madrid` → riesgo de mes corrido | Media | ✅ zona del libro (`getSpreadsheetTimeZone`) en ambos |
| 15 | Donut roto con SO neto negativo; BU sin normalizar | Media | ✅ |
| 16 | Detección de columnas por subcadena sin validar (devolvía 0 en silencio y quedaba cacheado) | Media | 🟡 las **obligatorias** se validan con mensaje claro y se prefiere coincidencia exacta; las opcionales siguen por subcadena |
| 17 | `posId` duplicados (≈30) sumaban la misma venta varias veces en el mapa | Alta | ✅ `dup:1` y venta 0 en los repetidos |
| 18 | Cabecera: 7 llamadas + overlay global + Leaflet/Choices bloqueantes; `actualizar()` hasta 5 veces | Alta | ✅ ver §6 |
| 19 | `limpiarCache()` no borraba `so_detalle_NN`/`so_sku_NN` | Baja | ✅ registro de claves de Drive |
| 20 | Caché: trozo de 90.000 **caracteres** puede pasar 100 KB con tildes → `putAll` fallaba en silencio | Media | ✅ JSON ASCII / trozo de 30.000 si hay no-ASCII; ahora se registra en el log |

**Pendientes / decisiones del equipo (no resueltas aquí):**
- **DDI y Diferencia INV** (fórmula por confirmar; ver §3.2).
- **Comparativa mes-contra-mes real** (si se quiere "vs mes anterior" hay que definirla: `Real -1` es año anterior).
- **`Real -1 (LOCAL)` de CUMPLIMIENTO ≠ `Real -1` de PLANTILLA**: se usa el de PLANTILLA/Histórico; conviene que quien mantiene la hoja confirme por qué difieren.
- **Seguridad**: la web app corre `USER_DEPLOYING` con `access: DOMAIN`: cualquier usuario del dominio ve el detalle por KAM/cliente. No hay filtro por usuario.
- ISDIN (SAP 1) entra al total porque CUMPLIMIENTO lo incluye; si se quiere excluir del KPI hay que decidirlo con Finanzas.
- La hoja `CUMPLIMIENTO` guarda una **tabla dinámica** en las columnas `O:R` (por KAM). El código **no** la lee; los totales por KAM de la pantalla se recalculan (y coinciden: Angélica Monsalve 7.314 M / plan 7.249 M / 100,9 % en la fecha de la auditoría).

## 6. Rendimiento: qué cambió

| Antes | Ahora |
|---|---|
| 7 `google.script.run` al abrir (2 de MTD + 5 del mapa), aunque la pestaña por defecto no usa el mapa | **1** llamada para Ventas MTD; el mapa (5 llamadas) arranca **en segundo plano** cuando MTD ya se pintó (`programarMapa`) o antes si el usuario abre "Mapa" |
| Overlay `position:fixed` que tapaba toda la app hasta que terminaran las 5 llamadas del mapa | Loader **local** dentro del panel del mapa |
| Leaflet y Choices como `<script>` en `<head>` (página en blanco hasta que respondían 2 CDN) | `cargarLib()` los inyecta bajo demanda; `preconnect` a los 2 CDN |
| `boot()` repintaba el mapa en cada respuesta (hasta 5 veces) | 1 vez al tener puntos+bricks+ventas y 1 al llegar las asignaciones; `actualizar()` no repinta con otra pestaña visible |
| MTD: 2 llamadas, 2 `openById`, `getDataRange()` de hojas de 25 columnas, objetos con claves repetidas | 1 ejecución, 1 `openById`, solo las columnas necesarias, payload con diccionarios/arreglos (≈ −60/70 %) |
| `getPuntosJson`/`getBricksJson`/`getAsignacionesJson` leían la hoja **entera en cada carga** | Caché 6 h (`conCache_`) |
| Primer usuario con caché fría esperaba la lectura | `calentarCache()` + trigger cada 15 min (ver §7) |
| N usuarios con caché fría → N lecturas simultáneas | `LockService`: el segundo encuentra la caché ya llena |

## 7. Operación y despliegue

1. `clasp push` — suben **juntos** `Code.js` y los 6 `.html` (`Index`, `Estilos`, `JsNucleo`, `JsFiltros`, `JsMapa`, `JsPaneles`) **más** `JsVentasMtd` y `JsSIvsSO`. Un push parcial rompe la plantilla (ver CLAUDE.md).
2. Crear **nueva versión** del deployment (o probar en la URL `/dev`).
3. **Una sola vez**, desde el editor de Apps Script: ejecutar `instalarTriggerCache()` (pedirá autorizar un permiso nuevo para triggers). Programa `calentarCache` cada 15 min. `quitarTriggerCache()` lo retira.
4. Verificar con `verVentasMtd()` y `verSIvsSO()` (Registro de ejecución). `verVentasMtd` imprime la **conciliación** de las tres hojas; los tres importes del mes de corte deben coincidir (17.722 M en sep-2026). El Diagnóstico de la web app muestra lo mismo y la app avisa en pantalla si difieren > 0,5 %.
5. Tras cambiar datos en las hojas: botón **Actualizar** (fuerza lectura) o `limpiarCacheMtd()` / `limpiarCacheSIvsSO()`. Tras el ETL del mapa: `limpiarCache()` (ahora también borra las capas del mapa).
6. La clave de caché de MTD cambió a `ventas_mtd_v2` y la de SI vs SO a `si_vs_so_v2`; las antiguas se limpian solas con `limpiarCacheMtd()`.
7. `?accion=getVentasMtdJson` (REST) **ahora devuelve el payload v2** (compacto, con histórico incluido) — si algún consumidor externo usaba la forma antigua (`cumplimiento.filas`), hay que adaptarlo.

### Formato del payload de Ventas MTD (v2)
```
{ v:2,
  clientes:[{id, sapId, cliente, kam, canal, realMes, planMes, realAnio, planAnio, interno, error}],
  productos:[nombre,…],                 // diccionario
  prod:[[idCliente, idxProducto, venta, ventaA1, unidades],…],   // PLANTILLA consolidada
  hist:[[anio, mes, idCliente, real, plan],…],                   // sin filas 0/0
  histClientes:{idCliente:[cliente, kam, canal]},
  meta:{actualizadoEn, periodo:{anio,mes,fuente}, conciliacion:{cumplimiento,plantilla,historico},
        errores:{…}, clientesConError:[…], productosSinNombre, historico:{…}} }
```
SI vs SO v2: `{v:2, clientes:[[sap,nombre,kam,canal]], productos:[[id,nombre,bu,marca]], filas:[[mes,iCli,iProd,si,siU,so,soU,inv,invU,tieneInv]], meta}`.

## 8. Pruebas (sin Apps Script ni navegador)

Viven en `tests/` (fuera de `Apps Script/` para que `clasp` no las suba). Requieren solo Node:

```bash
node tests/test_servidor_mtd.js     # Code.js con hojas simuladas: caché, forzar, fechas/zona, columnas, dup de POS ID
node tests/test_cliente_mtd.js      # JsVentasMtd: KPI, corte YTD (−28,9 % → +1,9 %), filtros que propagan, orden
node tests/test_cliente_sivso.js    # JsSIvsSO: INV, Δ al mismo corte, Prom SO calendario, donut
node tests/chequeo_sintaxis_html.js # un error de sintaxis en UN Js*.html rompe toda la web app
```
Los casos usan los **números reales** de la auditoría (sep-2026). Para ver la interfaz: `python construir_preview.py` (modo mock; ver CLAUDE.md).

## 9. Evidencia de la conciliación (sep-2026, tomada de las hojas reales)

| Fuente | Σ venta del mes |
|---|---|
| `CUMPLIMIENTO` (`Real (LOCAL)`) | 17.721,6 M |
| `PLANTILLA` (`Real`) | 17.722 M |
| `Historico de ventas` (sep-2026) | 17.722 M |
| Pivot de la hoja CUMPLIMIENTO ("Suma total") | 17.721,6 M |

Histórico por año (Σ `Real (LOCAL)`): 2025 completo = 193.968 M; ene–sep 2025 = 135.402 M; ene–sep 2026 = 137.986 M. Meses oct–dic 2026 vienen en 0 (real y plan).
