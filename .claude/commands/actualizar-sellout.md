---
description: Datos — actualiza el Sell Out (paso 3) y el inventario del visor corriendo el ETL en este computador
disable-model-invocation: true
allowed-tools: Bash(bash .claude/scripts/actualizar_sellout.sh:*)
argument-hint: "[todo | inv]"
---
Modo pedido (vacío = Sell Out del paso 3 + inventario): $ARGUMENTS

Responde en español y breve. El usuario invocó /actualizar-sellout: aquí SÍ está autorizado correr el ETL (`etl_sellout.py`), que solo lee los libros de Drive y escribe los JSON en la carpeta `_visor_json`. No hay git, `clasp push` ni publicación.

Ejecuta `bash .claude/scripts/actualizar_sellout.sh $ARGUMENTS` (tarda unos minutos; usa un timeout de 10 min).
- Sin argumento: Sell Out del paso 3 (`s3_*`) + inventario (`s3_inv*.json`). Es lo normal cuando llega un archivo nuevo del paso 3.
- `todo`: además los `so_*` del mapa.
- `inv`: solo el inventario (cuando solo cambiaron los Consolidados o los maestros de EAN / PDV).

Si para:
- **Falta config.py o una ruta** → di cuál y que revise que Google Drive para escritorio esté abierto.
- **El ETL falla** → muestra el error en lenguaje simple y ofrece revisarlo.

Cierre en 2–3 líneas con lo que actualizó: meses que quedaron (búscalos en la salida del ETL), clientes / PDV y el % de inventario que cruzó, si la salida lo muestra. Recuerda pulsar «Actualizar» en el visor o correr `limpiarCache()` para que lea los archivos nuevos.
