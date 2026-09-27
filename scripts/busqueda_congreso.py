"""Entradas del buscador para el Congreso: legisladores e iniciativas.

Lee `public/data/congreso.json` (lo arma `scripts/build-congreso.py`) y
devuelve las entradas del corpus que junta `scripts/build-busqueda.py`:

- **Legisladores** (`t="legislador"`, peso 0): nombre, cámara, demarcación y
  partido, con enlace a su ficha `/congreso/legisladores/{id}`
  (`enlace.legislador` de lib/grafo.ts).
- **Iniciativas** (`t="iniciativa"`, peso 1): título, número de expediente,
  tipo, tema, número de promulgación y título reformulado, con enlace a `/congreso/{id}`
  (`enlace.iniciativa`). La instantánea las trae en columnas
  (`iniciativas.campos` / `filas`, con catálogos de tipo, condición y tema).
"""
import json
import pathlib

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


def _condicion(condicion: str, promulgacion: str) -> str:
    if promulgacion:
        return "Promulgada"
    c = condicion.upper()
    for raiz, etiqueta in ETIQUETA_CONDICION:
        if raiz in c:
            return etiqueta
    return c.capitalize()


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


def _iniciativa(fila: list, cat: dict) -> dict:
    iid, numero, titulo, tipo_i, cond_i, fd, grupo_i = fila[:7]
    np = fila[7] if len(fila) > 7 else ""
    tm = fila[8] if len(fila) > 8 else ""
    tipo = cat["tipos"][tipo_i]
    x = [numero, tipo, cat["grupos"][grupo_i]]
    if np:
        x.append(f"Ley {np}" if tipo == "Proyecto de Ley" else np)
    if tm:
        x.append(tm)
    return _limpio({
        "t": "iniciativa",
        "ti": titulo,
        "x": " ".join(filter(None, x)),
        "d": " · ".join(filter(None, [tipo, _condicion(cat["condiciones"][cond_i], np)])),
        "on": "Congreso Nacional",
        "h": f"/congreso/{iid}",
        "f": fd,
        "p": 1,
    })


def entradas(datos: pathlib.Path) -> tuple[list[dict], str]:
    """(entradas del corpus, fecha ISO de la instantánea)."""
    doc = json.loads((datos / "congreso.json").read_text())
    legs = sorted(doc["legisladores"], key=lambda l: (l["n"].lower(), l["id"]))
    cat = doc["iniciativas"]
    filas = sorted(cat["filas"], key=lambda f: (f[5], f[0]), reverse=True)
    salida = [_legislador(l) for l in legs] + [_iniciativa(f, cat) for f in filas]
    return salida, doc["generado"][:10]
