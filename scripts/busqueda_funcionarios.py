"""Entradas del buscador para las personas con cargo público.

Lee `public/data/funcionarios.json` (lo arma `scripts/build-funcionarios.py`)
y devuelve una entrada por persona (`t="funcionario"`): su nombre y sus otras
grafías, el cargo que encabeza su ficha como detalle, y como texto auxiliar
unos pocos de sus cargos e instituciones, para que «ministro de educación» o
«alcalde de Santiago» la encuentren. Enlaza a `/funcionarios/{id}`
(`enlace.funcionario` de lib/grafo.ts).

Sin vector: un nombre de persona no dice de qué trata (el criterio de
legisladores y proveedores). Peso 0 si alguno de sus cargos obliga a declarar
patrimonio (PEP, Ley 311-14), 1 si no. Quien solo figura como legislador ya
tiene su entrada de legislador y no se repite.
"""
import json


def _actual(c: dict) -> bool:
    return c.get("m") == "vigente" or (c.get("m") == "electo" and c.get("per") == "2024-2028")


def _principal(p: dict) -> dict | None:
    actuales = [c for c in p["c"] if _actual(c)]
    if actuales:
        return sorted(actuales, key=lambda c: c.get("n") or 99)[0]
    return next((c for c in p["c"] if c.get("m") not in ("cesa", "sustituido")), p["c"][0] if p["c"] else None)


def entradas(datos) -> tuple[list[dict], str]:
    d = json.loads((datos / "funcionarios.json").read_text(encoding="utf-8"))
    out = []
    for p in d["personas"]:
        if p["c"] and all(c.get("o") == "congreso" for c in p["c"]):
            continue
        c = _principal(p)
        if c:
            detalle = c["t"]
        elif p.get("f"):
            detalle = f"Firmó {p['f']['decretos']:,} decretos del Poder Ejecutivo"
        else:
            continue
        # Pocos cargos y pocas instituciones: el texto auxiliar viaja entero
        # en cada arranque en frío del buscador.
        cargos = list(dict.fromkeys(x["t"] for x in p["c"] if x is not c))[:3]
        insts = list(dict.fromkeys(x["in"] for x in p["c"] if x.get("in")))[:2]
        aux = " · ".join([*(p.get("a") or [])[:2], *cargos, *insts])[:320]
        out.append({
            "t": "funcionario",
            "ti": p["n"],
            "x": aux,
            "d": detalle,
            "h": f"/funcionarios/{p['id']}",
            "p": 0 if p.get("pep") else 1,
        })
    return out, d["generado"]
