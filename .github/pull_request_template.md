## ¿Qué cambia?
<!-- En lenguaje de negocio, como se lo contarías al gerente: qué verá distinto el equipo. -->

## ¿Por qué?
<!-- El problema o el pedido que lo originó. -->

## ¿Cómo se probó?
<!-- Qué abriste en tu URL /dev y qué comprobaste. Si cambia una cifra: contra qué la comparaste. -->

## Ojo para el equipo
<!-- Pasos manuales (correr el ETL, limpiarCache(), instalar un trigger…) o riesgos. Borra la sección si no aplica. -->

## Antes de pedir revisión
- [ ] Lo probé con `/probar` en mi proyecto de pruebas
- [ ] Las pruebas de `tests/` pasan (`/enviar` las corre)
- [ ] No hay secretos ni datos de clientes
- [ ] Si cambió una cifra o una fuente de datos: actualicé README / `Apps Script/CLAUDE.md` / `DOCUMENTACION_KPIS.md`
- [ ] El título del PR sigue el formato `tipo(área): qué cambió` (será el mensaje del commit en `main`)
