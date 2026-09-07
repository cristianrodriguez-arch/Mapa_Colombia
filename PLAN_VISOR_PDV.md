# Plan: Visor de universo de puntos de venta (Apps Script + Leaflet)

**Decisiones tomadas (2026-07):** web app de Apps Script con Leaflet · llave sell-out↔maestro: `SF_ID = Id cuenta 18` · el brick viene poblado de Salesforce (`Brick Ubicación`) · consumo: gerencia + delegados · refresh mensual.

**Arquitectura en una línea:** Google Sheet maestro (2 hojas existentes + sell-out agregado) → Apps Script (endpoints JSON + control de acceso por correo) → página HTML con Leaflet que pinta la capa de bricks (`Colombia_Bricks.geojson`) y encima los puntos de venta, con filtros cruzados.

---

## Fase 0 — Calidad y homologación de datos (prerequisito de todo)

- [x] 0.1 Exportar bricks a GeoJSON desde `unificar_bricks.py` (`Colombia_Bricks.geojson`, 0.49 MB) — hecho.
- [ ] 0.2 **Auditoría de llave**: medir % de `SF_ID` del sell-out que cruza contra `Id cuenta 18` del maestro. Listar huérfanos (venta sin punto) y decidir qué hacer con ellos (fila "SIN ASIGNAR" vs excluir).
- [ ] 0.3 **Homologación de bricks**: comparar los valores distintos de `Brick Ubicación` (Salesforce) contra los 162 `nombre_brick` nuestros ("ZONA, NOMBRE"; cada uno tiene ademas un `brick_id` corto tipo BOG-001 para el campo de brick del CRM). Construir tabla de equivalencias para los que no coincidan textualmente y lista de PDV con brick vacío o no reconocido.
- [ ] 0.4 **Auditoría de coordenadas** del maestro: vacías, en (0,0), fuera del bounding box de Colombia, o lat/lon invertidas. Sin coordenada válida el punto no se pinta — decidir si se corrigen en Salesforce o se geocodifican aparte.
- [ ] 0.5 Auditoría de correos en `Asignaciones` (columna `Correo`): es la llave del filtro automático por delegado; deben ser los correos corporativos con los que entrarán a la web app.

## Fase 1 — Modelo de datos en Google Sheets

- [ ] 1.1 Crear (o consolidar en) un workbook único con hojas: `CO_Puntos_Maestro clientes`, `Asignaciones clientes delegados CO`, `Sellout_Staging`, `Sellout_Agregado`, `Homologacion_Bricks`, `Config`.
- [ ] 1.2 **El detalle del sell-out (fecha × EAN) NO entra a Sheets** — revienta el límite de celdas y las cuotas de Apps Script. Definir el agregado: `SF_ID × mes × Canal` con `Units` y `Amount` sumados.
- [ ] 1.3 Script de carga mensual: pegar el Excel del sell-out en `Sellout_Staging` → función Apps Script (menú personalizado "Actualizar datos") que agrega y reescribe `Sellout_Agregado` y registra fecha de corte en `Config`.
- [ ] 1.4 Hoja/consulta `PDV_360` (o construida en memoria por el script): maestro + flag asignado sí/no + delegado/team (desde Asignaciones) + KPIs de sell-out (desde el agregado), unida por `Id cuenta 18`.

## Fase 2 — Web app (Apps Script + Leaflet)

- [ ] 2.1 Proyecto Apps Script vinculado al workbook: `doGet()` + HtmlService (IFRAME) + Leaflet desde CDN.
- [ ] 2.2 Subir `Colombia_Bricks.geojson` a Drive (o incrustarlo como archivo del proyecto) y endpoint `getBricks()`.
- [ ] 2.3 Endpoints de datos: `getPuntos()` (id, nombre, lat, lon, canal, tipo, potencial, afinidad, brick, delegado, team, KPIs), `getFiltros()` (valores únicos). Servir JSON compacto (arrays, no objetos por fila) — con ~miles de PDV el payload importa.
- [ ] 2.4 Mapa base: capa de polígonos de bricks (coloreable por # PDV, ventas o % cobertura) + capa de puntos con clustering (Leaflet.markercluster) y color por estado (asignado / no asignado / sin venta).
- [ ] 2.5 Filtros combinables: departamento, ciudad, zona, brick, canal (Channel 2), tipo de registro, potencial, afinidad, grupo de compras, team, delegado, asignado sí/no. Los filtros afectan puntos, coloreado de bricks y KPIs a la vez.
- [ ] 2.6 Popup por punto: nombre de la cuenta, dirección, NIF, brick, delegado, fecha última visita, % cobertura, ventas último trimestre.
- [ ] 2.7 Panel de KPIs sobre la selección: # PDV, % asignado, % cobertura media, ventas, # delegados activos.
- [ ] 2.8 **Vista delegado**: al abrir, `Session.getActiveUser().getEmail()` se cruza con `Correo` de Asignaciones → si es delegado, la app arranca filtrada a sus cuentas (gerencia y correos en lista blanca ven todo).

## Fase 3 — Despliegue y operación mensual

- [ ] 3.1 Deploy como web app: "Ejecutar como usuario que accede" + acceso restringido al dominio corporativo. Verificar que delegados solo tengan acceso de lectura al Sheet (o mover lectura a "ejecutar como yo" con filtro en servidor si no se les puede compartir el Sheet).
- [ ] 3.2 Runbook mensual (1 página): 1) pegar sell-out en staging, 2) menú "Actualizar datos", 3) revisar hoja de validaciones, 4) avisar al equipo.
- [ ] 3.3 Validaciones automáticas post-carga con aviso por correo: % cruce SF_ID, bricks no homologados, coordenadas inválidas nuevas.
- [ ] 3.4 Piloto con 2–3 delegados y un gerente → ajustar filtros/KPIs → lanzamiento.

## Riesgos y límites conocidos

- Cuotas de Apps Script: 6 min por ejecución y ~30 s cómodos para un `google.script.run` — por eso el sell-out va pre-agregado y el payload compacto.
- Si el universo supera ~20–30k puntos, pasar de markers a `L.circleMarker` sobre canvas (`preferCanvas: true`).
- `Brick Ubicación` de Salesforce es la fuente del brick: cualquier brick nuevo debe existir en ambos lados (KML/GeoJSON y Salesforce) — la tabla `Homologacion_Bricks` es el punto único de reconciliación.
- El GeoJSON de bricks se regenera con `python unificar_bricks.py`; al cambiar bricks hay que resubir el archivo a Drive (tarea 2.2).
