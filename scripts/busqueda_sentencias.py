"""Entradas del buscador para las sentencias del Tribunal Constitucional y del
Tribunal Superior Electoral, desde `public/data/sentencias.json`
(`scripts/build-sentencias.py`).

El título es el «Relativo a» del listado: la acción, las partes y el acto
atacado, que es por donde alguien busca una sentencia («amparo contra la
Policía Nacional», «Junta Central Electoral»). El número y el expediente van
en el texto auxiliar con sus variantes de escritura (`TC/0123/24`,
`TC-0123-24`, `0123/24`), porque así se citan en la prensa y en otras
sentencias. Ningún listado trae la materia como campo propio: está dentro de
la descripción. El enlace es la ficha del Tribunal (el PDF no está en el
listado), externa.
"""
import json
import pathlib
import re


def _variantes(numero: str) -> list[str]:
    """«TC/0123/24» → «TC/0123/24 TC-0123-24 TC 0123-24 0123/24 123/24»."""
    m = re.fullmatch(r"(TC|TSE)[-/ ]?0*(\d+)[-/](\d{2,4})", numero, re.I)
    if not m:
        return [numero]
    sigla, n, anio = m[1].upper(), m[2], m[3]
    ancho = n.zfill(4)
    return list(
        dict.fromkeys(
            [numero, f"{sigla}/{ancho}/{anio}", f"{sigla}-{ancho}-{anio}", f"{sigla} {ancho}-{anio}", f"{ancho}/{anio}", f"{n}/{anio}"]
        )
    )


def _entrada(s: dict, tribunal: str, href: str) -> dict:
    e = {
        "t": "sentencia",
        "ti": s.get("r") or f"Sentencia {s['n']}",
        "x": " ".join(_variantes(s["n"]) + ([s["x"]] if s.get("x") else [])),
        "d": s["n"],
        "on": tribunal,
        "h": href,
        "e": 1,
        "p": 1,
    }
    if s.get("f"):
        e["f"] = s["f"]
    return e


def entradas(datos: pathlib.Path) -> tuple[list[dict], str]:
    j = json.loads((datos / "sentencias.json").read_text(encoding="utf-8"))
    plantilla = j["ficha_tc"]
    r: list[dict] = []
    for s in j["tc"]:
        # La ficha se deriva del número salvo que la instantánea diga otra cosa.
        href = s.get("u") or plantilla.format(f"{s['n'][3:7]}{s['n'][8:10]}")
        r.append(_entrada(s, "Tribunal Constitucional", href))
    for s in j["tse"]:
        r.append(_entrada(s, "Tribunal Superior Electoral", s["u"]))
    return r, j["generado"]
