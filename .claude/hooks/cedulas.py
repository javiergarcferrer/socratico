#!/usr/bin/env python3
"""Nunca la cédula (docs/DECISIONES.md, «La cédula de un título oficial»).

Ninguna instantánea de `public/data` —que se sirve tal cual— puede guardar la
cédula de una persona, ni siquiera la que traiga un título oficial. Recorre
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

for archivo in sorted((raiz / "public" / "data").rglob("*")):
    if not archivo.is_file() or archivo.suffix not in (".json", ".tsv", ".gz"):
        continue
    try:
        if archivo.suffix == ".gz":
            texto = gzip.open(archivo, "rt", encoding="utf-8", errors="replace").read()
        else:
            texto = archivo.read_text(encoding="utf-8", errors="replace")
    except OSError:
        continue
    hallados = cedulas_en(texto)
    if hallados:
        print(f"{archivo.relative_to(raiz)}: {len(hallados)} · …{hallados[0]}…")
