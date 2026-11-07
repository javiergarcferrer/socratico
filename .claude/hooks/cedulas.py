#!/usr/bin/env python3
"""Nunca la cédula.

Ninguna instantánea de `public/data` —que se sirve tal cual—, ni el volcado de
`datos/sparql/` —que se consulta por `/sparql`—, ni lo leído en el texto íntegro
(`datos/textos/`, en el repositorio público) puede guardar la cédula de una
persona, ni siquiera la que traiga un título oficial. Recorre
los JSON, los TSV y los `.gz` con las mismas formas que quita
`scripts/privacidad.py` al construir. Imprime un hallazgo por archivo; nada
si está limpio. Lo corre `verificar.sh --completo`.
"""

import gzip
import pathlib
import sys

raiz = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
sys.path.insert(0, str(raiz / "scripts"))
from privacidad import cedulas_en  # noqa: E402

TROZO = 8 * 1024 * 1024

archivos = (
    sorted((raiz / "public" / "data").rglob("*"))
    + sorted((raiz / "datos" / "sparql").glob("*.gz"))
    # Lo leído en el texto íntegro (§5.12): fuera de public/, pero viaja en el repositorio público.
    + sorted((raiz / "datos" / "textos").glob("*.json"))
)
for archivo in archivos:
    if not archivo.is_file() or archivo.suffix not in (".json", ".tsv", ".gz"):
        continue
    hallados = []
    try:
        if archivo.suffix == ".gz":
            # Por trozos de líneas enteras: el volcado de SPARQL pasa de 400 millones de caracteres
            # descomprimido, y una cédula no cruza un salto de línea en ninguno de estos formatos.
            with gzip.open(archivo, "rt", encoding="utf-8", errors="replace") as f:
                resto = ""
                while bloque := f.read(TROZO):
                    texto, _, resto = (resto + bloque).rpartition("\n")
                    hallados += cedulas_en(texto)
                hallados += cedulas_en(resto)
        else:
            hallados = cedulas_en(archivo.read_text(encoding="utf-8", errors="replace"))
    except OSError:
        continue
    if hallados:
        print(f"{archivo.relative_to(raiz)}: {len(hallados)} · …{hallados[0]}…")
