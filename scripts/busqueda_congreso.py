"""Entradas del buscador para el Congreso: legisladores e iniciativas.

Lee `public/data/congreso.json` (lo arma `scripts/build-congreso.py`) y
devuelve las entradas del corpus que junta `scripts/build-busqueda.py`:

- **Legisladores** (`t="legislador"`, peso 0): nombre, cámara, demarcación y
  partido, con enlace a su ficha `/congreso/legisladores/{id}`
  (`enlace.legislador` de lib/grafo.ts).
- **Iniciativas** (`t="iniciativa"`, peso 1): título, número de expediente,
  tipo y condición, con enlace a `/congreso/{id}` (`enlace.iniciativa`). Si
  el título se modificó en el trámite, el nuevo va en el texto auxiliar para
  que también lo encuentre.
"""
import json
import pathlib
import re

# Condiciones del SIL en versales → cómo se leen: la misma tabla que
# `ETIQUETA_CONDICION` en lib/congreso.ts, en el mismo orden.
ETIQUETA_CONDICION = [
    ("PERIMID", "Perimida"),
    ("PROMULGAD", "Promulgada"),
    ("APROBAD", "Aprobada"),
    ("RECHAZAD", "Rechazada"),
    ("RETIRAD", "Retirada"),
    ("ARCHIVAD", "Archivada"),
    ("FUSIONAD", "Fusionada"),
    ("DEPOSITAD", "Depositada"),
    ("VIGENTE", "En trámite"),
]


def _condicion(ini: dict) -> str:
    if ini.get("np"):
        return "Promulgada"
    c = (ini.get("co") or "").upper()
    for raiz, etiqueta in ETIQUETA_CONDICION:
        if raiz in c:
            return etiqueta
    return c.capitalize() if c else (ini.get("es") or "")


def _limpio(d: dict) -> dict:
    return {k: v for k, v in d.items() if v not in (None, "")}


def _legislador(l: dict) -> dict:
    senado = l.get("c") == "senado"
    fn = (l.get("fn") or "").lower()
    if senado:
        cargo = "senadora" if "senadora" in fn else "senador"
    else:
        cargo = "diputada" if "diputada" in fn else "diputado"
    pr = l.get("pr") or ""
    if pr == "Nacional":
        donde = "de la lista nacional"
    elif pr == "En el exterior":
        donde = "por la comunidad en el exterior"
    else:
        donde = f"por {pr}" if pr else ""
    detalle = f"{cargo.capitalize()} {donde}".strip()
    if l.get("ci"):
        detalle += f", {l['ci'].lower()}"
    if l.get("ps"):
        detalle += f" · {l['ps']}"
    return _limpio({
        "t": "legislador",
        "ti": l["n"],
        "x": " ".join(filter(None, [cargo, "senado" if senado else "cámara de diputados", pr,
                                    l.get("ci"), l.get("ps"), l.get("pn")])),
        "d": detalle,
        "h": f"/congreso/legisladores/{l['id']}",
        "p": 0,
    })


def _iniciativa(i: dict) -> dict:
    tipo = i.get("tp") or ""
    cond = _condicion(i)
    x = [i.get("nu"), tipo, i.get("gr")]
    if i.get("np"):
        x.append(f"Ley {i['np']}" if re.match(r"^proyecto de ley|^ley", tipo, re.I) else i["np"])
    if i.get("tm"):
        x.append(i["tm"])
    return _limpio({
        "t": "iniciativa",
        "ti": i["ti"],
        "x": " ".join(filter(None, x)),
        "d": " · ".join(filter(None, [tipo, cond])),
        "on": "Congreso Nacional",
        "h": f"/congreso/{i['id']}",
        "f": i.get("fd"),
        "p": 1,
    })


def entradas(datos: pathlib.Path) -> tuple[list[dict], str]:
    """(entradas del corpus, fecha ISO de la instantánea)."""
    doc = json.loads((datos / "congreso.json").read_text())
    legs = sorted(doc["legisladores"], key=lambda l: (l["n"].lower(), l["id"]))
    inis = sorted(doc["iniciativas"], key=lambda i: (i.get("fd", ""), i["id"]), reverse=True)
    salida = [_legislador(l) for l in legs] + [_iniciativa(i) for i in inis]
    return salida, doc["generado"][:10]
