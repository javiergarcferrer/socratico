"""Entradas del buscador que salen del grafo compilado (`datos/grafo/`), leídas
de sus nodos por `scripts/busqueda-grafo.mjs`:

- cada decreto, ley y resolución con ficha propia —el mismo número, título,
  fecha y enlace que dicen su ficha, el explorador y el servidor MCP—.
  Reemplazan a las entradas de las instantáneas que llevan a la misma ficha
  (`fuera_del_grafo`): una norma se busca como la describe el grafo, y el
  buscador encuentra los decretos del registro completo, no solo los de la
  normativa reciente. Lo que no es nodo —las leyes sin ficha, que abren su
  PDF; los reglamentos; las fes de errata y la segunda norma de un número
  repetido— sigue saliendo de las instantáneas;
- cada proveedor sin contratos desde 2015 con medidas de la DGCP o contratos
  de obra, que la historia de contratos no trae.
"""
import json
import pathlib
import re
import subprocess
import unicodedata

# Una norma con ficha: `/normativa/{tipo}/{número}`, como `nodoDeRuta` (lib/grafo.ts).
FICHA = re.compile(r"^/normativa/(decreto|ley|resolucion)/(\d{1,4}-\d{2,4})$")
TIPO = {"Decreto": "decreto", "Ley": "ley", "Resolución": "resolucion"}


def canonico(tipo: str, numero: str) -> str:
    """El `numeroCanonico` de lib/grafo.ts: «47-2020» es la Ley 47-20."""
    n = re.sub(r"\s+", "", numero)
    return re.sub(r"^(\d{1,4})-(?:19|20)(\d{2})$", r"\1-\2", n) if tipo in ("ley", "decreto") else n


def _llano(s: str) -> str:
    """El título sin tildes, mayúsculas ni signos: lo que lo identifica."""
    s = "".join(c for c in unicodedata.normalize("NFD", s or "") if unicodedata.category(c) != "Mn")
    return re.sub(r"\W+", "", s.lower())


def entradas(raiz: pathlib.Path) -> tuple[list[dict], dict[str, str]]:
    """Las entradas y la fecha de corte de cada grafo de fuente que las trae."""
    salida = subprocess.run(
        ["node", "--no-warnings", str(raiz / "scripts" / "busqueda-grafo.mjs")],
        cwd=raiz,
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    d = json.loads(salida)
    return d["entradas"], d["cortes"]


def fuera_del_grafo(grafo: list[dict], otras: list[dict], reparar) -> list[dict]:
    """Las entradas de las instantáneas que el grafo no trae ya: ni las que
    llevan a la ficha de un nodo, ni el PDF de una norma cuyo número y título
    son los de un nodo (dos decretos con el número 108-23 abren su PDF; el que
    el registro da por ficha es el nodo, el otro sigue aquí). `reparar` deja
    los dos títulos como los verá quien busca antes de compararlos."""
    fichas = {e["h"] for e in grafo}
    titulos = {(e["h"], _llano(reparar(e["ti"]))) for e in grafo}
    out = []
    for e in otras:
        h = e.get("h") or ""
        m = FICHA.match(h)
        if m and f"/normativa/{m[1]}/{canonico(m[1], m[2])}" in fichas:
            continue
        tipo, _, numero = (e.get("x") or "").partition(" ")
        t = TIPO.get(tipo)
        if not m and t and (f"/normativa/{t}/{canonico(t, numero.strip())}", _llano(reparar(e["ti"]))) in titulos:
            continue
        out.append(e)
    return out
