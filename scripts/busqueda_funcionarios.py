"""Entradas del buscador para las personas con cargo público.

Lee `public/data/funcionarios.json` (lo arma `scripts/build-funcionarios.py`)
y devuelve una entrada por persona (`t="funcionario"`): su nombre y sus otras
grafías, el cargo que encabeza su ficha como detalle, y como texto auxiliar
unos pocos de sus cargos e instituciones, para que «ministro de educación» o
«alcalde de Santiago» la encuentren. Enlaza a `/funcionarios/{id}`
(`enlace.funcionario` de lib/grafo.ts).

Sin vector: un nombre de persona no dice de qué trata (el criterio de
legisladores y proveedores). Peso 0 si es PEP hoy (un cargo obligado a
declarar patrimonio, de hoy o con fecha en los últimos tres años: la regla
de `pepVigente` en lib/funcionarios.ts), 1 si no. Quien solo figura como
legislador ya tiene su entrada de legislador y no se repite.
"""
import datetime
import json
import re

# La instantánea nombra el puesto de la JCE («Alcaldía de Nagua»); quien busca
# suele escribir a la persona («alcalde de Nagua»). Solo para el índice.
SINONIMOS = (("Alcaldía", "alcalde alcaldesa"), ("Vicealcaldía", "vicealcalde vicealcaldesa"),
             ("Regiduría", "regidor regidora"), ("Dirección del distrito municipal", "director directora"),
             ("Subdirección del distrito municipal", "subdirector subdirectora"))


def _actual(c: dict) -> bool:
    return c.get("m") == "vigente" or (c.get("m") == "electo" and c.get("per") == "2024-2028")


def _principal(p: dict) -> dict | None:
    actuales = [c for c in p["c"] if _actual(c)]
    if actuales:
        return sorted(actuales, key=lambda c: c.get("n") or 99)[0]
    return next((c for c in p["c"] if c.get("m") not in ("cesa", "sustituido")), p["c"][0] if p["c"] else None)


def _pep_hoy(p: dict, limite: str) -> bool:
    ultima = None
    for c in p["c"]:
        if c.get("pep") is None:
            continue
        if _actual(c):
            return True
        fin = re.search(r"(\d{4})\D*$", c.get("per") or "")
        fecha = f"{fin.group(1)}-12-31" if fin else c.get("d")
        if fecha and (ultima is None or fecha > ultima):
            ultima = fecha
    return ultima is not None and ultima >= limite


def entradas(datos) -> tuple[list[dict], str]:
    d = json.loads((datos / "funcionarios.json").read_text(encoding="utf-8"))
    hoy = datetime.date.today()
    limite = hoy.replace(year=hoy.year - 3, day=min(hoy.day, 28)).isoformat()
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
        sinonimos = next((v for k, v in SINONIMOS if c and c["t"].startswith(f"{k} ")), None)
        aux = " · ".join([*(p.get("a") or [])[:2], *([sinonimos] if sinonimos else []), *cargos, *insts])[:320]
        out.append({
            "t": "funcionario",
            "ti": p["n"],
            "x": aux,
            "d": detalle,
            "h": f"/funcionarios/{p['id']}",
            "p": 0 if _pep_hoy(p, limite) else 1,
        })
    return out, d["generado"]
