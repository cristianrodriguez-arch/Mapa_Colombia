# Tareas pendientes del equipo

Tareas grandes que alguien pidió y todavía no están hechas. Cada una dice quién la lleva. Al terminarla, se borra de aquí en el mismo PR que la cierra (lo hecho queda en la historia de git y en la documentación).

Claude: si quien te habla es el responsable de una tarea, recuérdasela al empezar (`/iniciar`) y, antes de implementarla, resuelve con él las preguntas abiertas.

---

## Reestructurar la base de sell-in

- **Responsable:** Sebas
- **Pedida por:** Cristian, 2026-10-28
- **Issue en GitHub:** [#2](https://github.com/cristianrodriguez-arch/Mapa_Colombia/issues/2) (se cierra con el PR que la termine: `Closes #2`)

### Qué hay que hacer

El sell-out ya quedó unificado (una sola fuente: `etl_sellout.py` → `s3_*.json`). Falta lo mismo con el **sell-in**, que hoy el visor lee de muchas partes.

Reestructurar el libro **"Ventas - YTD"** (`1hViwAW2…`) para que el sell-in quede en solo dos hojas:

1. **Real sell-in** — solo la venta real de sell-in (mes, cliente/SAP ID, producto, valor en $ y unidades).
2. **Presupuesto y asignaciones** — el plan por cliente y mes, y a qué KAM / canal pertenece cada cliente. Pueden ir juntas en una misma hoja.

Después, que el visor (`Apps Script/Code.js`) lea el sell-in, el plan y el KAM solo de esas dos hojas.

### De dónde sale hoy el sell-in

| Hoja | Libro | Qué toma el visor | Pestaña |
|---|---|---|---|
| `SI_Appscript` | Ventas - YTD | sell-in (copia de la `Data` de Carga Looker, `Type` = SI) | Ventas |
| `PPTO_Appscript` | Ventas - YTD | plan (PPTO pasado a formato largo con `UNPIVOT_POR_GRUPOS`) | Ventas |
| `CUMPLIMIENTO`, `PLANTILLA`, `Historico de ventas` | Ventas - YTD | real y plan del mes, Real -1, histórico | Ventas MTD (clásico) |
| `Data` (`Type` = SI) | Carga Looker (`1_eW3f95…`) | sell-in contra sell-out | resumen "vs sell-out" |

Además, el KAM de cada cliente se toma de la columna `KAM encargado` de **cada** una de esas hojas, así que puede no coincidir entre pestañas. La hoja de asignaciones lo resuelve.

### Preguntas abiertas (definir con Cristian antes de empezar)

- De dónde se alimenta la hoja de real sell-in: de Carga Looker (como `SI_Appscript` hoy) o directo de SAP.
- El mes en curso (MTD) hoy solo vive en `CUMPLIMIENTO` / `PLANTILLA`: si la hoja de real sell-in lo incluye, o si Ventas MTD (clásico) se migra o se retira.
- Asignaciones: ¿una fila por cliente (SAP ID → KAM, canal) o con vigencia por mes, por si un cliente cambia de KAM?

### Hecho cuando

- El libro tiene las dos hojas, con encabezados fijos y documentados.
- `Code.js` lee sell-in, plan y KAM solo de ellas; las hojas viejas que ya no se usen quedan marcadas para retirar.
- Las cifras cuadran con las de hoy (`Apps Script/DOCUMENTACION_KPIS.md` §3.4): sell-in ene–sep 2026 = 137.985 M, plan ene–sep 2026 = 153.250 M, sell-in 2025 = 193.954 M.
- Pruebas de `tests/` y documentación (`Apps Script/CLAUDE.md`, `DOCUMENTACION_KPIS.md`) actualizadas en el mismo PR.
