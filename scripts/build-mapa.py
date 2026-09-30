#!/usr/bin/env python3
"""Genera public/data/mapa.json: las 32 demarcaciones del país como trazados
SVG listos para pintar, sin servidor de teselas, sin clave y sin librería.

Fuente: los límites administrativos oficiales de la Oficina Nacional de
Estadística (ONE), publicados en el Humanitarian Data Exchange de la ONU como
COD-AB `cod-ab-dom` (licencia CC BY-IGO, se atribuye en la interfaz). Nivel
`admin2` = provincias: 32 polígonos (31 provincias y el Distrito Nacional),
`valid_on` 2021-06-29. Verificado el 2026-09-30: `package_show` responde 200,
el ZIP de GeoJSON pesa 54 MB y trae de `admin0` a `admin4` (municipios y
distritos municipales incluidos, para un mapa más fino después).

Por qué una instantánea y no un mapa de teselas: la invariante de la
plataforma (sin claves, sin terceros en el navegador del lector) y el tamaño.
El GeoJSON de provincias pesa 6.6 MB con 221,647 vértices; aquí se proyecta y
simplifica a unos pocos KB.

Cómo se simplifica sin dejar rendijas: la ONE comparte los vértices exactos
en cada frontera entre provincias (74,695 vértices en dos anillos, 41 en tres).
Un vértice cuyo conjunto de provincias cambia respecto del vecino es un
**nudo** y no se toca; entre dos nudos, el tramo se simplifica con
Douglas-Peucker siempre en el mismo sentido canónico, así que las dos
provincias que lo comparten reciben exactamente la misma línea.

Proyección: equirectangular con el coseno de la latitud media (18.8°), que a
esta escala no se distingue de una conforme. Norte arriba.

Uso:
    python3 scripts/build-mapa.py                  # baja el ZIP y genera
    python3 scripts/build-mapa.py --local ARCHIVO  # usa dom_admin2.geojson ya bajado
"""
import collections
import datetime
import io
import json
import math
import pathlib
import sys
import unicodedata
import urllib.request
import zipfile

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "data" / "mapa.json"
PAQUETE = "https://data.humdata.org/api/3/action/package_show?id=cod-ab-dom"
FUENTE = "https://data.humdata.org/dataset/cod-ab-dom"
UA = "Socratico-Inteligencia/1.0 (mapa de provincias; herramienta independiente)"

ANCHO = 1000  # ancho del viewBox; el alto sale de la proporción del país
TOLERANCIA = 1.2  # en unidades del viewBox (1 u ≈ 0.39 km): ~0.5 km
AREA_MINIMA = 6.0  # islotes de menos de 6 u² (~0.9 km²) no se dibujan
LAT_MEDIA = 18.8

# Nombre de la ONE (sin «Provincia ») → slug de lib/provincias.ts.
SLUGS = {
    "Distrito Nacional": "distrito-nacional",
    "Baoruco": "bahoruco",
}


def slug(nombre: str) -> str:
    n = nombre.removeprefix("Provincia ").strip()
    if n in SLUGS:
        return SLUGS[n]
    s = unicodedata.normalize("NFD", n).encode("ascii", "ignore").decode().lower()
    return "-".join("".join(c if c.isalnum() else " " for c in s).split())


def bajar_geojson() -> bytes:
    req = urllib.request.Request(PAQUETE, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        recursos = json.load(r)["result"]["resources"]
    url = next(x["url"] for x in recursos if x["name"] == "dom_admin_boundaries.geojson.zip")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=600) as r:
        crudo = r.read()
    with zipfile.ZipFile(io.BytesIO(crudo)) as z:
        return z.read("dom_admin2.geojson")


def proyectar(lon: float, lat: float) -> tuple[float, float]:
    return lon * math.cos(math.radians(LAT_MEDIA)), -lat


def dp(puntos: list, tol: float) -> list:
    """Douglas-Peucker iterativo; conserva los dos extremos."""
    if len(puntos) < 3:
        return puntos
    guardar = [False] * len(puntos)
    guardar[0] = guardar[-1] = True
    pila = [(0, len(puntos) - 1)]
    while pila:
        a, b = pila.pop()
        (ax, ay), (bx, by) = puntos[a], puntos[b]
        dx, dy = bx - ax, by - ay
        largo = math.hypot(dx, dy)
        peor, idx = 0.0, -1
        for i in range(a + 1, b):
            px, py = puntos[i]
            d = abs(dy * (px - ax) - dx * (py - ay)) / largo if largo else math.hypot(px - ax, py - ay)
            if d > peor:
                peor, idx = d, i
        if peor > tol and idx > 0:
            guardar[idx] = True
            pila += [(a, idx), (idx, b)]
    return [p for p, g in zip(puntos, guardar) if g]


def area(anillo: list) -> float:
    return abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(anillo, anillo[1:] + anillo[:1]))) / 2


def main() -> None:
    if "--local" in sys.argv:
        crudo = pathlib.Path(sys.argv[sys.argv.index("--local") + 1]).read_bytes()
    else:
        crudo = bajar_geojson()
    datos = json.loads(crudo)
    feats = datos["features"]
    assert len(feats) == 32, f"se esperaban 32 demarcaciones, llegaron {len(feats)}"

    # Anillos en coordenadas originales (tuplas exactas para reconocer los compartidos).
    anillos = []  # (slug, índice de polígono, es hueco, [vértices])
    for f in feats:
        s = slug(f["properties"]["adm2_name"])
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for ip, poly in enumerate(polys):
            for ir, anillo in enumerate(poly):
                vs = [tuple(v[:2]) for v in anillo]
                if vs[0] == vs[-1]:
                    vs = vs[:-1]
                anillos.append((s, ip, ir > 0, vs))

    duenos = collections.defaultdict(set)
    for s, _, _, vs in anillos:
        for v in vs:
            duenos[v].add(s)

    # Proyección y extensión.
    todos = [proyectar(*v) for _, _, _, vs in anillos for v in vs]
    minx, maxx = min(p[0] for p in todos), max(p[0] for p in todos)
    miny, maxy = min(p[1] for p in todos), max(p[1] for p in todos)
    escala = ANCHO / (maxx - minx)
    alto = round((maxy - miny) * escala)

    def aviewbox(v):
        x, y = proyectar(*v)
        return ((x - minx) * escala, (y - miny) * escala)

    cache_tramos: dict = {}

    def simplificar(vs: list) -> list:
        n = len(vs)
        nudos = [i for i in range(n) if duenos[vs[i]] != duenos[vs[i - 1]] or duenos[vs[i]] != duenos[vs[(i + 1) % n]]]
        if not nudos:
            # Anillo sin fronteras (una isla entera): se ancla en el vértice menor.
            nudos = [min(range(n), key=lambda i: vs[i])]
        salida = []
        for k, a in enumerate(nudos):
            b = nudos[(k + 1) % len(nudos)]
            tramo = [vs[(a + j) % n] for j in range(((b - a) % n or n) + 1)]
            clave = (tramo[0], tramo[-1], len(tramo))
            inversa = (tramo[-1], tramo[0], len(tramo))
            if inversa in cache_tramos and inversa != clave:
                simp = list(reversed(cache_tramos[inversa]))
            else:
                if clave not in cache_tramos:
                    cache_tramos[clave] = dp([aviewbox(v) for v in tramo], TOLERANCIA)
                simp = cache_tramos[clave]
            salida += simp[:-1]
        return salida

    def fmt(x: float) -> str:
        return f"{x:.1f}".rstrip("0").rstrip(".")

    por_slug = collections.defaultdict(list)
    for s, _, hueco, vs in anillos:
        simp = simplificar(vs)
        if len(simp) < 3 or (not hueco and area(simp) < AREA_MINIMA):
            continue
        d = "M" + "L".join(f"{fmt(x)} {fmt(y)}" for x, y in simp) + "Z"
        por_slug[s].append(d)

    provincias = []
    for f in feats:
        p = f["properties"]
        s = slug(p["adm2_name"])
        cx, cy = aviewbox((p["center_lon"], p["center_lat"]))
        provincias.append({
            "slug": s,
            "pcode": p["adm2_pcode"],
            "nombre": p["adm2_name"].removeprefix("Provincia "),
            "d": "".join(por_slug[s]),
            "centro": [round(cx, 1), round(cy, 1)],
            "km2": round(p["area_sqkm"]),
        })
    provincias.sort(key=lambda x: x["pcode"])

    doc = {
        "generado": datetime.date.today().isoformat(),
        "fuente": FUENTE,
        "autor": "Oficina Nacional de Estadística (ONE), vía OCHA HDX",
        "licencia": "CC BY-IGO",
        "vigente": feats[0]["properties"].get("valid_on"),
        "viewBox": [0, 0, ANCHO, alto],
        "provincias": provincias,
    }
    SALIDA.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(provincias)} demarcaciones · viewBox {ANCHO}×{alto} · "
          f"{sum(x['d'].count('L') + 1 for x in provincias)} vértices · {SALIDA.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
