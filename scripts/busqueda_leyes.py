"""Entradas del corpus del buscador desde public/data/leyes.json (scripts/build-leyes.py).

Una entrada por ley, del mismo tipo y forma que las normas de `build-busqueda.py`
(`normas()`), para que el integrador deduplique por tipo, número y fecha. El
enlace va a la ficha `/normativa/ley/{número}` con el número canónico de
`numeroCanonico` (lib/grafo.ts): «47-2020» es la Ley 47-20. Las leyes con
número solo (antes de los noventa) o con «BIS» no tienen ficha: enlazan al PDF
de la Consultoría.
"""
import json
import pathlib
import re

# El texto de una norma, PDF `inline`, en el sitio de la Consultoría
# (lib/normativa.ts): donde va una ley sin ficha propia —las anteriores a los
# noventa, con número sin año, o las que el origen repite con un mismo
# número—. Lo abre el navegador de quien busca; el 403 que la Consultoría da
# al egreso de Vercel no lo alcanza.
DOCUMENTO = "https://www.consultoria.gov.do/api/document"


def canonico(numero: str) -> str:
    """El `numeroCanonico` de lib/grafo.ts para leyes y decretos."""
    n = re.sub(r"\s+", "", numero)
    return re.sub(r"^(\d{1,4})-(?:19|20)(\d{2})$", r"\1-\2", n)


def entradas(datos: pathlib.Path) -> tuple[list[dict], str]:
    crudo = json.loads((datos / "leyes.json").read_text())
    campos = crudo["campos"]
    out = []
    for fila in crudo["leyes"]:
        f = dict(zip(campos, fila))
        numero = (f.get("Numero") or "").strip()
        n = canonico(numero)
        # «0-00» es un marcador del origen que cuatro leyes de 1921 comparten:
        # no identifica una ley, así que no lleva ficha.
        con_ficha = re.fullmatch(r"\d{1,4}-\d{2,4}", n) and not re.fullmatch(r"0+-\d+", n)
        e = {
            "t": "norma",
            "ti": f["Titulo"],
            "x": f"Ley {numero}".strip(),
            "d": f"Ley {numero}".strip(),
            "h": f"/normativa/ley/{n}" if con_ficha else f"{DOCUMENTO}/{f['DocId']}" if f.get("DocId") else None,
            "e": None if con_ficha or not f.get("DocId") else 1,
            "f": f.get("FechaPromulgacion"),
        }
        out.append({k: v for k, v in e.items() if v not in (None, "")})
    return out, crudo["generadoEn"]
