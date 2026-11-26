# Riel de navegación "vidrio" · Isdin Core (2026-11-22)

Réplica de la **experiencia** de la referencia "Glassy Sidebar V10" (capturas del usuario, expandido y
colapsado) con la **identidad** ISDIN. De la referencia se toma estructura, comportamiento y sensación;
nada de su marca, textos ni iconos.

Fuentes de identidad, en orden: (1) manual `williamcorrea-hash/manual-identidad-visual-ISDIN`
(`docs/identidad-visual.md`, `apps-script/identidad.html`); (2) brandcolorcode.com/isdin
(negro `#2B2830`, rojo `#E41F33`).

## Fase 1 · Análisis de la referencia → adaptación ISDIN

| # | Elemento de la referencia | Cómo es | Adaptación en Isdin Core |
|---|---|---|---|
| 1 | **Arquitectura** | Marca + buscador ⌘K arriba; navegación principal (5 destinos, uno desplegable); sección "Projects" con contadores; tarjeta de plan; perfil al pie | Marca ISDIN + "Buscar…" (Ctrl/⌘ K, salta a cualquier informe); destinos **Ventas** (desplegable con sus 4 informes), **Mapa**, **Perfect Store**; sección **Filtros activos** (informes con filtros puestos y cuántos); tarjeta **Tema** (claro / oscuro); perfil del usuario de Google |
| 2 | **Layout** | Panel flotante (margen ~10 px, radio ~28 px), 2 columnas: menú (~190 px) + **franja de acciones** (~44 px) a la derecha; colapsado = píldora de ~56 px | Igual: panel flotante de 272 px (menú + franja de 48 px); colapsado de 76 px. El contenido se corre con la transición de la rejilla `.shell` |
| 3 | **Tipografía** | Sans geométrica; título 14/600, subtítulo 11/400, ítems 13/500, rótulo de sección 10/600 mayúsculas con interletrado | Montserrat (sustituta de Gotham, manual §3): marca 15/700, subtítulo 11/400, ítems 13.5/500, sección 11/600 mayúsculas (manual: etiquetas 12/500 mayúsculas), cifras tabulares |
| 4 | **Color y superficies** | Vidrio azul arriba → casi negro abajo; ítems en píldoras translúcidas con borde de luz; activo blanco; acentos de color en puntos y badge naranja | Oscuro: vidrio desde el **negro ISDIN #2B2830** con luz durazno arriba; activo blanco. Claro: vidrio blanco sobre el lienzo; activo en **tinta #2B2830**. Puntos de sección = paleta de series del manual (#D09375, #B8A186, #FFB48F, #8A8A8A); badge = durazno 60 |
| 5 | **Glassmorphism** | Fondo translúcido + blur fuerte, borde 1 px de luz, brillo superior (inset), sombra difusa; detrás hay un fondo con estrellas/gradiente que hace que el vidrio "se vea" | `--glass-*` por modo: blur 24 px + saturate 160 %, borde rgba blanco, `inset 0 1px 0` de brillo, sombra larga. Detrás: las luces cálidas fijas del lienzo (modo oscuro) y un velo durazno suave (claro). Respaldo sólido con `@supports not (backdrop-filter)` y `prefers-reduced-transparency` |
| 6 | **Componentes** | Botón circular de marca; botón ‹ colapsar; input de búsqueda con kbd; ítems (normal, hover, activo, desplegado); chevron; badge; encabezado de sección con "+"; fila de proyecto (punto, nombre, contador); tarjeta con anillo y botón "Upgrade"; perfil (avatar con punto de estado, nombre, correo, "…"); franja con botón primario cuadrado y 3 secundarios + rótulo vertical | Todos, con funciones reales: botón de marca (abre/cierra), buscador con lista de resultados navegable con flechas, ítems con estados, Ventas con chevron que abre sus 4 informes, contador = n.º de filtros, tarjeta Tema con anillo + botón "Cambiar", perfil con iniciales (el "…" abre el diagnóstico). Franja: **Actualizar** (primario), **Limpiar filtros**, **Ir arriba** y rótulo vertical con el destino activo |
| 7 | **Movimiento** | Expandir/colapsar con ancho animado y fundido de etiquetas (~250 ms); hover que aclara el vidrio (~150 ms); el activo "se conecta" a la franja con esquinas cóncavas; tooltips en colapsado | `--motion-fast 150ms`, `--motion-base 250ms`, `--motion-slow 400ms`, `--ease-std cubic-bezier(.2,0,0,1)`, `--ease-emph cubic-bezier(.3,0,0,1)`. Solo `transform`/`opacity` en los textos; el ancho lo anima la rejilla. Esquinas cóncavas con gradiente radial. Tooltips en colapsado. Cambio de tema con View Transitions (fundido), con respaldo inmediato. `prefers-reduced-motion` = sin animaciones |
| 8 | **Modo oscuro** | La referencia solo existe en oscuro | Se construye el claro como espejo: vidrio blanco, tinta ISDIN, activo invertido (tinta con texto blanco) |
| 9 | **Responsive** | Panel fijo de escritorio | ≥ 1001 px: empuja el contenido y se recuerda; 601–1000 px: colapsado fijo y el expandido como cajón modal con velo; ≤ 600 px: barra inferior de vidrio en píldora (ya existente) y el cajón desde "Más" |
| 10 | **Fortalezas / debilidades** | + jerarquía clara, estados obvios, densidad buena. − Texto gris claro sobre vidrio oscuro con bajo contraste; iconos sin nombre en colapsado; objetivos de 32 px | Texto secundario ≥ 4.5:1 sobre el vidrio (se usa un vidrio denso, 80–88 % opaco, para garantizarlo); `aria-label` + tooltip en colapsado; objetivos ≥ 44 px |

## Fase 2 · Tokens (bloque "Riel de vidrio" de `Estilos.html`)

| Token | Claro | Oscuro | Nota |
|---|---|---|---|
| `--color-brand-ink` | `#2B2830` | `#2B2830` | Negro ISDIN (brandcolorcode); base de las superficies oscuras |
| `--color-brand-primary` | `#E41F33` | `#FF5A6A` | Rojo ISDIN; solo logo y "requiere atención". En oscuro se aclara para AA (5.0:1 sobre #2B2830) |
| `--rail-glass-bg` | `rgba(255,255,255,.80)` | `linear-gradient(rgba(208,147,117,.22) → rgba(43,40,48,.88))` | |
| `--rail-glass-blur` | `24px` | `24px` | `saturate(160%)` |
| `--rail-glass-border` | `rgba(43,40,48,.08)` | `rgba(255,255,255,.12)` | |
| `--rail-glass-highlight` | `inset 0 1px 0 rgba(255,255,255,.9)` | `inset 0 1px 0 rgba(255,255,255,.10)` | |
| `--rail-glass-shadow` | `0 12px 32px rgba(43,40,48,.10)` | `0 18px 40px rgba(0,0,0,.40)` | |
| `--rail-pill-bg` / hover | `rgba(43,40,48,.04)` / `.08` | `rgba(255,255,255,.06)` / `.12` | Píldoras de ítem |
| `--rail-active-bg` / `-fg` | `#2B2830` / `#FFFFFF` | `#FFFFFF` / `#2B2830` | Activo y franja de acciones |
| `--rail-text` / `-2` / `-muted` | `#2B2830` / `#414141` / `#6D6D6D` | `#F5F5F5` / `#E1E1E1` / `#B8B3AE` | Contrastes ≥ 4.5:1 sobre su vidrio |
| `--rail-focus` | `#A1725A` (anillo 2 px) | `#FFB48F` | Manual §2.3 pide durazno 70 (`#D09375`), pero da 2,6:1 sobre blanco y WCAG 1.4.11 pide 3:1: se usa durazno 80 (4,1:1) |
| Puntos de sección | `#D09375`, `#B8A186`, `#FFB48F`, `#8A8A8A` | iguales | Paleta de series del manual §4 |
| `--motion-*`, `--ease-*` | ver tabla de movimiento | | |
| Radios | panel 26 px, píldora 14 px, botón 12 px, circular 999 px | | |
| Espaciado | escala de 4 px (4·8·12·16·24) | | Manual §5 |
| z-index | riel 20; cajón modal 3000; velo 2999; buscador 3100 | | |

**Conflictos de marca y cómo se resolvieron**
1. El manual no define rojo ni negro de marca; brandcolorcode sí. Para la tinta de la interfaz se mantiene el
   manual (`#414141` / `#2E2E2E` en texto); el negro `#2B2830` se usa como base de superficies oscuras y como
   activo en claro (lo pide el brief y su contraste con blanco es 15:1).
2. El rojo `#E41F33` queda reservado al logotipo y a "requiere atención" (regla del visor); el acento de
   interacción y el foco son durazno, como dice el manual (§2.3).
3. Gotham no tiene licencia web confirmada (manual §10): se mantiene Montserrat.
4. Foco: el manual usa durazno 70; en claro no llega a 3:1, así que se baja un paso de la misma escala (durazno 80).
5. Atributo de tema: el brief dice `[data-theme="dark"]`; el visor ya usa `data-tema="oscuro"` en `<html>` y se conserva.
6. Logotipo: el SVG del manual (barras y letras en gris de marca, barra central roja; blanco en oscuro). El
   manual tiene pendiente confirmar el logo oficial con Marca.

## Fase 3 · Implementación

> **Ajuste del 2026-11-22 (pedido del usuario):** la franja de acciones de 48 px quedó pesada. Ahora es una
> **línea fina de 3 px** (el activo se sigue conectando a ella) y las acciones **Actualizar** y **Quitar todos los
> filtros** pasaron a la cabecera de cada pestaña como botones de icono, en lugar del botón de texto "Actualizar".
> Se quitaron "Volver arriba" y el rótulo vertical. El riel expandido pasa de 288 a 244 px.

| Archivo | Qué cambió |
|---|---|
| `Index.html` | Marcado nuevo de `.nav-rail` (cabecera, buscador, destinos, informes de Ventas, filtros activos, tema, usuario, franja); `#railTip` y `#railRes` (flotantes); script de tema que sigue al sistema si nunca se eligió uno |
| `Estilos.html` | Bloque "Riel de navegación vidrio" con los tokens `--rail-*`, `--motion-*`, `--ease-*` (reemplaza el riel Material 3) y sus tokens en oscuro; luces suaves en el lienzo claro |
| `JsNucleo.html` | `railMarcar`, `railAlternarSub`, `railPintarFiltros` (+ `MutationObserver` de los contadores), `railAccion`, `railTips`, buscador (`railBuscar`, `railTeclaBuscar`, `railIr`, Ctrl / ⌘ K), `railUsuario`; tema con View Transitions y seguimiento de `prefers-color-scheme` |
| `JsVentasMtd.html` | `mostrarVistaSuperior` llama `railMarcar(v)` |
| `Code.js` | `getUsuarioJson()` (correo del usuario que abre el visor) |
| `tests/test_riel.js` | Filtros activos, buscador y rótulo |

**Reutilizado**: `mostrarVistaSuperior`, `fijarRail` / `alternarRail`, `alternarTema`, los contadores de filtros de cada
vista, los botones Actualizar / Limpiar de cada vista (la franja los pulsa), `abrirDiag`. **Nuevo**: buscador, sección
Filtros activos, franja de acciones, tooltips, tarjeta de tema con interruptor, fila de usuario.

## Checklist de aceptación

| Criterio | Estado |
|---|---|
| Fidelidad estructural e interacción ≥ 90 % | Sí: panel flotante, cabecera, buscador ⌘K, píldoras, desplegable, sección con contadores, tarjeta, perfil, franja con rótulo vertical y activo conectado con esquinas cóncavas; colapsado en píldora con activo blanco y punto. Cambia: badge "3" y "Upgrade" (no hay dato real equivalente; se usan filtros activos y tema) |
| Color, tipografía y logo del manual | Sí, salvo el foco (ver conflicto 4) |
| Contraste AA | Texto 14,5:1 (claro) y 10,9:1 (oscuro); secundario 4,7–5,2:1 (claro) y 5,7:1 (oscuro); foco 4,1:1 / 8,4:1; activo 14,5:1 |
| Vidrio legible y con respaldo | Sí: vidrio denso (80–88 %), `@supports not (backdrop-filter)` y `prefers-reduced-transparency` |
| 60 fps, sin CLS, movimiento reducido | Textos con `transform` / `opacity`; el ancho lo anima la rejilla existente (como antes). `prefers-reduced-motion` apaga todo. No medido con herramientas de rendimiento |
| Responsive 360 / 768 / 1024 / 1440 / 1920 | Revisado con capturas en 1440 y 820. Celular: barra inferior de siempre y cajón |
| Lighthouse ≥ 90 | **No medido**: el depurador remoto de Chrome está bloqueado por política en esta máquina |
| Sin flash de tema | Sí: script en línea al inicio del `<body>` antes de pintar |
