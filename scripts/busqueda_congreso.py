"""Entradas del buscador para el Congreso: legisladores e iniciativas.

Lee `public/data/congreso.json` (lo arma `scripts/build-congreso.py`) y
devuelve las entradas del corpus que junta `scripts/build-busqueda.py`:

- **Legisladores** (`t="legislador"`, peso 0): nombre, cámara, demarcación y
  partido, con enlace a la ficha de **su persona** `/funcionarios/{persona}`
  (una persona, un nodo: `datos/votos/legisladores.json`, que arma
  `scripts/build-legisladores.py`), donde está su sección Congreso. Quien tiene
  además otros cargos ya entra como funcionario (`busqueda_funcionarios.py`), con
  su escaño: no se repite aquí. Los diputados de 2020-2024 que ya no están en
  el directorio entran por su período, y el bufete directivo de hoy, en el texto.
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


def _casamiento(datos: pathlib.Path) -> tuple[dict, dict]:
    """(legisladorId → su fila de legisladores.json, persona → cargos añadidos), o vacíos sin el archivo."""
    ruta = datos.parent.parent / "datos" / "votos" / "legisladores.json"
    if not ruta.exists():
        return {}, {}
    d = json.loads(ruta.read_text())
    cargos: dict[str, list[str]] = {}
    for a in d["adiciones"]:
        cargos.setdefault(a["persona"], []).extend(c["t"] for c in a["cargos"] if c.get("m") == "electo")
    return {l["id"]: l for l in d["legisladores"]}, cargos


def _legislador(l: dict, fila: dict | None = None, extra: list[str] | None = None) -> dict:
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
        "h": f"/funcionarios/{fila['persona']}" if fila and fila.get("persona") else f"/congreso/legisladores/{l['id']}",
        "p": 0,
    })


def _anterior(fila: dict) -> dict:
    """Un diputado de un período anterior que ya no está en el directorio."""
    per = sorted(fila["periodos"])[-1]
    p = fila["periodos"][per]
    funcion = p.get("funcion") or "Diputación"
    donde = f" por {p['provincia']}" if p.get("provincia") else ""
    return _limpio({
        "t": "legislador",
        "ti": fila["nombre"],
        "x": " ".join(filter(None, [funcion.lower(), "cámara de diputados", p.get("provincia"), p.get("partido"), per])),
        "d": f"{funcion}{donde}, período {per}" + (f" · {p['partido']}" if p.get("partido") else ""),
        "h": f"/funcionarios/{fila['persona']}",
        "p": 1,
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
    casados, extra = _casamiento(datos)
    personas = json.loads((datos / "funcionarios.json").read_text())["personas"]
    con_otros = {p["id"] for p in personas if any(c.get("o") != "congreso" for c in p["c"])}
    en_directorio = {l["id"] for l in legs}
    salida = []
    for l in legs:
        fila = casados.get(l["id"])
        if fila and fila.get("persona") in con_otros:
            continue
        e = _legislador(l, fila)
        bufete = [t for t in extra.get((fila or {}).get("persona"), []) if "Cámara de Diputados, año" in t]
        if bufete:
            e["x"] = f"{e['x']} {' '.join(bufete)}"
            e["d"] = f"{bufete[0]} · {e['d']}"
        salida.append(e)
    for lid, fila in sorted(casados.items()):
        if lid not in en_directorio and fila.get("persona") and fila["persona"] not in con_otros and fila["camara"] == "diputados":
            salida.append(_anterior(fila))
    salida += [_iniciativa(f, cat) for f in filas]
    return salida, doc["generado"][:10]
