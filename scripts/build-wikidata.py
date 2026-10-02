#!/usr/bin/env python3
"""Genera public/data/wikidata.json: el identificador de Wikidata (QID) de los
nodos del grafo que lo tienen sin dudas —provincias, instituciones,
entidades financieras y personas con cargo público—, para `owl:sameAs` en
el RDF y `sameAs` en el schema.org de cada ficha (lib/wikidata.ts).

Mecánica en docs/INFRAESTRUCTURA.md §5.7: el servicio SPARQL de Wikidata
(`query.wikidata.org`) veta `/sparql` en su robots, y `www.wikidata.org` solo
deja leer un elemento que ya se conoce. Las búsquedas van a la **réplica de
Wikidata de QLever** (`qlever.dev/api/wikidata`, Universidad de Friburgo),
cuyo robots no tiene reglas: pocas consultas, UA identificable, GET.

**Solo el QID.** Ni descripciones, ni fotos, ni biografías, ni nada que
Wikidata diga de una persona entra a la plataforma. Y **solo sin dudas**: una
correspondencia se guarda si es única en los dos sentidos.

- Provincias: las divisiones de primer nivel del país (P150 de Q786), por su
  nombre normalizado.
- Instituciones: elementos con país República Dominicana (Q786) que son
  organismo público (Q327333), ministerio (Q192350), organización
  gubernamental (Q2659904), empresa estatal (Q270791), organización armada
  (Q17149090), organización (Q43229) o universidad (Q3918), con sus
  subclases, por nombre exacto normalizado (etiqueta o alias en español).
- Entidades financieras: bancos (Q22687, Q848507), instituciones financieras
  (Q650241), cooperativas (Q4539, Q745877), asociaciones de ahorros (Q2091703),
  aseguradoras (Q2143354), fondos de pensiones (Q182103) y empresas estatales
  (Q270791) con país República Dominicana, por nombre o razón social exactos.
  Cada QID de clase se verificó por su etiqueta el 30-09-2026.
- Personas: los titulares del cargo de Presidente de la República (Q607982)
  contra quien firmó decretos, por palabras del nombre; y las personas con
  ciudadanía dominicana y algún cargo (P39) contra las personas con un cargo
  obligado a declarar, por nombre completo exacto de tres o más palabras.

Uso:
    python3 scripts/build-wikidata.py
"""
import datetime
import json
import pathlib
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "data" / "wikidata.json"
UA = "Socratico-Inteligencia/1.0 (identificadores de Wikidata; herramienta independiente)"
QLEVER = "https://qlever.dev/api/wikidata"
PREFIJOS = """PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
"""

_ultima = 0.0


PAUSA = 6.0


def consultar(sparql: str) -> list[dict]:
    """Una consulta a QLever, con seis segundos entre consultas y un reintento.
    Un 429 se respeta: se espera lo que diga `Retry-After` (a lo sumo dos
    minutos) antes del único reintento."""
    global _ultima
    for intento in (1, 2):
        espera = PAUSA - (time.monotonic() - _ultima)
        if espera > 0:
            time.sleep(espera)
        url = f"{QLEVER}?{urllib.parse.urlencode({'query': PREFIJOS + sparql})}"
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                if "json" not in (r.headers.get("content-type") or ""):
                    raise RuntimeError(f"content-type inesperado {r.headers.get('content-type')!r}")
                datos = json.load(r)
            _ultima = time.monotonic()
            return [{k: v["value"] for k, v in b.items()} for b in datos["results"]["bindings"]]
        except Exception as e:  # noqa: BLE001 — un reintento y fuera
            _ultima = time.monotonic()
            if intento == 2:
                raise
            despues = 5
            if getattr(e, "code", None) == 429:
                try:
                    despues = min(120, int(e.headers.get("Retry-After") or 60))  # type: ignore[attr-defined]
                except ValueError:
                    despues = 60
            print(f"  reintento en {despues} s: {e}", file=sys.stderr)
            time.sleep(despues)
    raise AssertionError


def plano(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s)).strip()


PARTICULAS = {"de", "del", "la", "las", "los", "y", "e"}


def palabras(s: str) -> set[str]:
    return {p for p in plano(s).split() if p not in PARTICULAS and len(p) > 1}


def qid(uri: str) -> str:
    return uri.rsplit("/", 1)[-1]


def etiquetas(filas: list[dict]) -> dict[str, set[str]]:
    """QID → sus nombres (etiqueta y alias) planos."""
    salida: dict[str, set[str]] = {}
    for f in filas:
        salida.setdefault(qid(f["item"]), set()).add(plano(f["nombre"]))
    return salida


def unico(pares: list[tuple[str, str]]) -> dict[str, str]:
    """De pares (nodo, QID) se quedan los únicos en los dos sentidos."""
    por_nodo: dict[str, set[str]] = {}
    por_qid: dict[str, set[str]] = {}
    for n, q in pares:
        por_nodo.setdefault(n, set()).add(q)
        por_qid.setdefault(q, set()).add(n)
    return {n: next(iter(qs)) for n, qs in por_nodo.items() if len(qs) == 1 and len(por_qid[next(iter(qs))]) == 1}


# ------------------------------------------------------------- provincias

def provincias() -> dict[str, str]:
    fuente = (RAIZ / "lib" / "provincias.ts").read_text(encoding="utf-8")
    nuestras = re.findall(r'slug:\s*"([^"]+)",\s*nombre:\s*"([^"]+)"', fuente)
    # Las divisiones de primer nivel del país (P150 de la República
    # Dominicana): las 31 provincias y el Distrito Nacional. Buscar el Distrito
    # por su etiqueta recorría todas las etiquetas y QLever lo rechazaba (429).
    filas = consultar("""
SELECT ?item ?nombre WHERE {
  wd:Q786 wdt:P150 ?item .
  { ?item rdfs:label ?nombre } UNION { ?item skos:altLabel ?nombre }
  FILTER(LANG(?nombre) = "es")
}""")
    nombres = etiquetas(filas)
    pares = []
    for slug, nombre in nuestras:
        buscado = plano(nombre)
        for q, ns in nombres.items():
            limpios = {re.sub(r"^provincia (de )?", "", n) for n in ns}
            if buscado in limpios:
                pares.append((slug, q))
    return unico(pares)


# ---------------------------------------------------------- instituciones

def instituciones() -> dict[str, str]:
    nuestras = json.loads((RAIZ / "public" / "data" / "instituciones.json").read_text(encoding="utf-8"))["instituciones"]
    filas = consultar("""
SELECT DISTINCT ?item ?nombre WHERE {
  VALUES ?clase { wd:Q327333 wd:Q192350 wd:Q2659904 wd:Q270791 wd:Q17149090 wd:Q43229 wd:Q3918 }
  ?item wdt:P17 wd:Q786 .
  ?item wdt:P31/wdt:P279* ?clase .
  { ?item rdfs:label ?nombre } UNION { ?item skos:altLabel ?nombre }
  FILTER(LANG(?nombre) = "es")
}""")
    nombres = etiquetas(filas)
    indice: dict[str, set[str]] = {}
    for q, ns in nombres.items():
        for n in ns:
            indice.setdefault(n, set()).add(q)
    pares = []
    for i in nuestras:
        for q in indice.get(plano(i["nombre"]), set()):
            pares.append((str(i["id"]), q))
    return unico(pares)


# ------------------------------------------------------ entidades financieras

def financieras() -> dict[str, str]:
    banca = json.loads((RAIZ / "public" / "data" / "banca.json").read_text(encoding="utf-8"))["entidades"]
    filas = consultar("""
SELECT DISTINCT ?item ?nombre WHERE {
  VALUES ?clase { wd:Q22687 wd:Q650241 wd:Q4539 wd:Q2143354 wd:Q745877 wd:Q2091703 wd:Q848507 wd:Q182103 wd:Q270791 }
  ?item wdt:P17 wd:Q786 .
  ?item wdt:P31/wdt:P279* ?clase .
  { ?item rdfs:label ?nombre } UNION { ?item skos:altLabel ?nombre }
  FILTER(LANG(?nombre) = "es" || LANG(?nombre) = "en")
}""")
    nombres = etiquetas(filas)
    indice: dict[str, set[str]] = {}
    for q, ns in nombres.items():
        for n in ns:
            indice.setdefault(n, set()).add(q)
    pares = []
    for e in banca:
        for n in {e.get("nombre"), e.get("razonSocial")} - {None, ""}:
            for q in indice.get(plano(n), set()):
                pares.append((e["slug"], q))
    return unico(pares)


# ---------------------------------------------------------------- personas

def personas() -> dict[str, str]:
    func = json.loads((RAIZ / "public" / "data" / "funcionarios.json").read_text(encoding="utf-8"))["personas"]
    salida: list[tuple[str, str]] = []

    # 1. Quien firmó decretos contra los titulares de la Presidencia, por palabras:
    # «Luis Abinader» está entero en «Luis Rodolfo Abinader Corona».
    filas = consultar("""
SELECT DISTINCT ?item ?nombre WHERE {
  ?item wdt:P39 wd:Q607982 .
  { ?item rdfs:label ?nombre } UNION { ?item skos:altLabel ?nombre }
  FILTER(LANG(?nombre) = "es")
}""")
    presidentes = etiquetas(filas)
    firmantes = [p for p in func if p.get("f")]
    for p in firmantes:
        nuestras = palabras(" ".join([p["n"], *(p.get("a") or [])]))
        candidatos = {q for q, ns in presidentes.items() if any(palabras(n) and palabras(n) <= nuestras for n in ns)}
        if len(candidatos) == 1:
            salida.append((p["id"], next(iter(candidatos))))

    # 2. Dominicanos con algún cargo en Wikidata contra quien tiene un cargo
    # obligado a declarar, por nombre completo exacto de tres palabras o más.
    filas = consultar("""
SELECT DISTINCT ?item ?nombre WHERE {
  ?item wdt:P27 wd:Q786 .
  ?item wdt:P31 wd:Q5 .
  ?item wdt:P39 ?cargo .
  { ?item rdfs:label ?nombre } UNION { ?item skos:altLabel ?nombre }
  FILTER(LANG(?nombre) = "es" || LANG(?nombre) = "en")
}""")
    indice: dict[str, set[str]] = {}
    for q, ns in etiquetas(filas).items():
        for n in ns:
            indice.setdefault(n, set()).add(q)
    for p in func:
        if not p.get("pep") and not p.get("leg"):
            continue
        for n in {p["n"], *(p.get("a") or [])}:
            if len(palabras(n)) < 3:
                continue
            for q in indice.get(plano(n), set()):
                salida.append((p["id"], q))
    return unico(salida)


def main() -> None:
    print("Wikidata (réplica de QLever)…")
    resultado = {
        "generado": datetime.date.today().isoformat(),
        "fuente": QLEVER,
        "provincias": provincias(),
        "instituciones": instituciones(),
        "financieras": financieras(),
        "personas": personas(),
    }
    if len(resultado["provincias"]) < 30:
        sys.exit(f"Solo {len(resultado['provincias'])} provincias con QID (se esperaban 32): no se escribe.")
    SALIDA.write_text(json.dumps(resultado, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
    print(f"→ {SALIDA.relative_to(RAIZ)}: " + ", ".join(
        f"{len(resultado[k])} {k}" for k in ("provincias", "instituciones", "financieras", "personas")))


if __name__ == "__main__":
    main()
