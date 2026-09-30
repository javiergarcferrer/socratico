#!/usr/bin/env python3
"""Genera public/data/historico/rnc.json: el RNC de nueve cifras de cada
proveedor de la historia de compras, para que el grafo ate lo que una
institución contrató a la persona jurídica que lo cobró.

Sin red: cruza dos instantáneas que ya están en el repositorio.

- `public/data/historico/proveedores/{0..9}.json` (`scripts/build-historico.py`):
  los proveedores con contratos desde 2015, por RPE.
- `public/data/empresas/filas/*.tsv.gz` (`scripts/build-empresas.py`): el
  padrón de la DGII, cuya última columna son los RPE que el Registro de
  Proveedores del Estado da a cada RNC.

Solo entran los RPE de la historia cuyo RNC es de una persona jurídica (nueve
cifras en el padrón): una persona física no tiene RNC propio en el padrón de
empresas, y su número de documento es una cédula, que no se guarda nunca.
Un RPE que el padrón diera a dos RNC no se ata a ninguno (se cuenta).

Se corre **después** de `build-historico.py` y `build-empresas.py`.

Uso:
    python3 scripts/build-historico-rnc.py
"""
import datetime
import gzip
import json
import pathlib
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
DATOS = RAIZ / "public" / "data"
SALIDA = DATOS / "historico" / "rnc.json"


def main() -> None:
    rpes: set[str] = set()
    corte = None
    for n in range(10):
        d = json.loads((DATOS / "historico" / "proveedores" / f"{n}.json").read_text())
        corte = corte or d.get("corte")
        rpes.update(d["filas"].keys())

    rnc_de: dict[str, str] = {}
    dobles: set[str] = set()
    meta = json.loads((DATOS / "empresas" / "meta.json").read_text())
    for archivo in sorted((DATOS / "empresas" / "filas").glob("*.tsv.gz")):
        for linea in gzip.decompress(archivo.read_bytes()).decode("utf-8").split("\n"):
            partes = linea.split("\t")
            if len(partes) < 6 or not partes[5]:
                continue
            rnc = partes[0]
            if len(rnc) != 9 or not rnc.isdigit():
                continue
            for rpe in partes[5].split(","):
                if rpe not in rpes:
                    continue
                if rpe in rnc_de and rnc_de[rpe] != rnc:
                    dobles.add(rpe)
                rnc_de[rpe] = rnc
    for rpe in dobles:
        rnc_de.pop(rpe, None)

    salida = {
        "generado": datetime.date.today().isoformat(),
        "corteHistorico": corte,
        "cortePadron": meta.get("corteDgii"),
        "proveedores": len(rpes),
        "conRnc": len(rnc_de),
        "dobles": len(dobles),
        "rnc": dict(sorted(rnc_de.items(), key=lambda x: int(x[0]))),
    }
    SALIDA.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")))
    print(
        f"{len(rnc_de)} de {len(rpes)} proveedores con RNC de persona jurídica "
        f"({len(dobles)} RPE con dos RNC, sin atar), {SALIDA.stat().st_size / 1e6:.1f} MB",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
