"""Arma una copia standalone del visor para revisarlo en el navegador.

El visor vive repartido en varios archivos de `Apps Script/` (Index.html +
Estilos.html + JsNucleo/JsFiltros/JsMapa/JsPaneles) que Apps Script une en
tiempo de ejecucion con los scriptlets `<?!= include('X') ?>`. Un navegador no
los entiende, asi que este script los resuelve y deja un unico HTML abrible:

    python construir_preview.py
    start preview_visor.html

Sin `google.script` el visor arranca en modo mock (ver `cargarMock()` en
JsNucleo.html), de modo que el layout, los filtros y el mapa se pueden revisar
sin desplegar nada. La salida va al directorio padre a proposito: cualquier
.html dentro de `Apps Script/` lo subiria `clasp push` al proyecto real.
"""

import pathlib
import re
import sys

RAIZ = pathlib.Path(__file__).resolve().parent
ORIGEN = RAIZ / "Apps Script"
SALIDA = RAIZ / "preview_visor.html"

INCLUDE = re.compile(r"""<\?!=\s*include\(\s*['"]([^'"]+)['"]\s*\)\s*;?\s*\?>""")


def resolver(texto: str, pila: tuple = ()) -> str:
    """Sustituye cada <?!= include('X') ?> por el contenido de X.html."""

    def reemplazar(m: "re.Match[str]") -> str:
        nombre = m.group(1)
        if nombre in pila:
            raise SystemExit(f"Include circular: {' -> '.join(pila + (nombre,))}")
        archivo = ORIGEN / f"{nombre}.html"
        if not archivo.exists():
            raise SystemExit(f"Falta {archivo} (lo pide un include de Index.html)")
        return resolver(archivo.read_text(encoding="utf-8"), pila + (nombre,))

    return INCLUDE.sub(reemplazar, texto)


def main() -> None:
    indice = ORIGEN / "Index.html"
    if not indice.exists():
        raise SystemExit(f"No encontre {indice}")
    html = resolver(indice.read_text(encoding="utf-8"))
    sobran = INCLUDE.findall(html)
    if sobran:
        raise SystemExit(f"Quedaron includes sin resolver: {sobran}")
    SALIDA.write_text(html, encoding="utf-8")
    print(f"{SALIDA}  ({len(html):,} caracteres)")


if __name__ == "__main__":
    sys.exit(main())
