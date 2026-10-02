#!/usr/bin/env python3
"""Genera public/data/catalogo.json: el catálogo completo de conjuntos de
datos públicos de datos.gob.do (el portal de datos abiertos del Estado).

Mecánica verificada en docs/INFRAESTRUCTURA.md §5.10 (2026-09-24):

- `robots.txt` veta `/api/`, `/revision/`, `/dataset/rate/` y
  `/dataset/*/history`, y pide `Crawl-Delay: 10`. Este script no toca
  ninguna ruta vetada y espera **diez segundos antes de cada petición**.
- La búsqueda HTML `/dataset/?q=*:*&sort=name+asc&page=N` sí es
  server-rendered y recorre el catálogo entero: 20 tarjetas por página, 54
  páginas, **1,065 conjuntos públicos** el día de la recon (el rótulo del
  portal dice «1199 resultados» busques lo que busques: no se usa).
- Cada tarjeta trae slug, título, organización, formatos y grupos temáticos.
  Eso basta para un catálogo buscable que enlaza a la ficha del portal, que es
  donde viven los archivos. Las fichas (1,065 peticiones más, ~3 h 30 min con
  la espera) no se recorren aquí.

Unas 55 peticiones, ~10 minutos. Se detiene en la primera página vacía y
nunca pasa de 80.

Uso:
    python3 scripts/build-catalogo.py
"""
import datetime
import html
import json
import pathlib
import re
import sys
import time
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "data" / "catalogo.json"
UA = "Socratico-Inteligencia/1.0 (catalogo de datos abiertos; herramienta independiente)"
BASE = "https://datos.gob.do"
ESPERA = 10
TOPE = 80


def bajar(url: str) -> str:
    for intento in (1, 2):
        time.sleep(ESPERA)  # Crawl-Delay: 10, antes de cada petición
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                tipo = r.headers.get("content-type", "")
                if "text/html" not in tipo:
                    raise RuntimeError(f"content-type inesperado «{tipo}»")
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001 — un reintento y fuera
            if intento == 2:
                raise
            print(f"  reintento {url}: {e}", file=sys.stderr)
    raise AssertionError


def limpio(s: str) -> str:
    s = html.unescape(re.sub(r"<[^>]+>", " ", s))
    s = re.sub(r"\s+", " ", s).strip()
    return s.strip("“”❝❞\"' ").rstrip(".").strip("“”❝❞\"' ")


def tarjetas(pagina: str) -> list[dict]:
    salida = []
    for m in re.finditer(
        r'<a href="/dataset/([a-z0-9_-]+)" class="dob-dataset-link">(.*?)</a>', pagina, re.S
    ):
        slug, cuerpo = m.group(1), m.group(2)
        titulo = re.search(r"<h2>(.*?)</h2>", cuerpo, re.S)
        ps = re.findall(r"<p(?:\s[^>]*)?>(.*?)</p>", cuerpo, re.S)
        formatos = re.search(r'<p class="dob-formats">(.*?)</p>', cuerpo, re.S)
        grupos = [limpio(g) for g in re.findall(r'<span class="dob-group-tag(?! dob-group-empty)[^"]*">(.*?)</span>', cuerpo, re.S)]
        fmts = []
        if formatos:
            for f in limpio(formatos.group(1)).split(","):
                f = f.strip().lstrip(".").upper()
                if f and f not in fmts:
                    fmts.append(f)
        salida.append({
            "slug": slug,
            "titulo": limpio(titulo.group(1)) if titulo else slug,
            "org": limpio(ps[0]) if ps else "",
            "formatos": fmts,
            "grupos": grupos,
        })
    return salida


def main() -> None:
    # Robots primero, en cada corrida: si llegara a vetar la búsqueda, se para.
    time.sleep(ESPERA)
    req = urllib.request.Request(f"{BASE}/robots.txt", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        robots = r.read().decode("utf-8", "replace")
    if re.search(r"(?im)^disallow:\s*/dataset/?\s*$", robots):
        sys.exit("robots.txt veta /dataset/: no se recorre.")
    conjuntos: dict[str, dict] = {}
    for n in range(1, TOPE + 1):
        pagina = bajar(f"{BASE}/dataset/?q=*:*&sort=name+asc&page={n}")
        nuevas = tarjetas(pagina)
        if not nuevas:
            break
        for t in nuevas:
            conjuntos.setdefault(t["slug"], t)
        print(f"  página {n}: {len(nuevas)} (total {len(conjuntos)})", file=sys.stderr)
    if len(conjuntos) < 800:
        sys.exit(f"Solo {len(conjuntos)} conjuntos: algo cambió en el portal, no se escribe.")
    orgs: dict[str, int] = {}
    for c in conjuntos.values():
        orgs[c["org"]] = orgs.get(c["org"], 0) + 1
    SALIDA.write_text(json.dumps({
        "generado": datetime.date.today().isoformat(),
        "fuente": f"{BASE}/dataset/",
        "total": len(conjuntos),
        "organizaciones": len(orgs),
        "conjuntos": sorted(conjuntos.values(), key=lambda c: c["titulo"].lower()),
    }, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(conjuntos)} conjuntos de {len(orgs)} organizaciones", file=sys.stderr)


if __name__ == "__main__":
    main()
