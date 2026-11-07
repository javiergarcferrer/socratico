"""Entradas del corpus del buscador desde public/data/leyes.json (scripts/build-leyes.py).

Una entrada por ley, del mismo tipo y forma que las normas de `build-busqueda.py`
(`normas()`), para que el integrador deduplique por tipo, número y fecha. Qué ley
tiene ficha no lo decide este módulo: lo dice el grafo compilado (`fichas`, las
de los nodos que trae `busqueda_grafo`), que la regla vive una sola vez, en
`leyesConFicha()` de lib/normativa.ts. Con ficha, el enlace va a
`/normativa/ley/{número}` con el número canónico de `numeroCanonico`
(lib/grafo.ts: «47-2020» es la Ley 47-20) y el integrador la cambia por la
entrada del grafo; sin ella, al PDF de la Consultoría.
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


def entradas(datos: pathlib.Path, fichas: set[str]) -> tuple[list[dict], str]:
    crudo = json.loads((datos / "leyes.json").read_text())
    campos = crudo["campos"]
    filas = [dict(zip(campos, fila)) for fila in crudo["leyes"]]
    out = []
    # La misma ley cargada con dos fechas (37-17, 62-00…) es una sola entrada:
    # la más reciente, que es la primera (el archivo viene de la más nueva a la
    # más vieja).
    vistas: set[tuple[str, str]] = set()
    for f in filas:
        numero = (f.get("Numero") or "").strip()
        n = canonico(numero)
        clave = (n, re.sub(r"\W+", "", (f.get("Titulo") or "").lower()))
        if re.fullmatch(r"\d{1,4}-\d{2,4}", n) and clave in vistas:
            continue
        vistas.add(clave)
        con_ficha = f"/normativa/ley/{n}" in fichas
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
