#!/usr/bin/env python3
"""Genera public/data/sismap.json: el ranking de gestión pública del SISMAP
(Ministerio de Administración Pública) para instituciones del Gobierno central
y para gobiernos locales.

Mecánica verificada en docs/INFRAESTRUCTURA.md §5.10 (y su verificación del
2026-09-23): tres tablas HTML servidas, sin SPA ni API que extraer.

- `https://sismap.gob.do/GestionPublica/Ranking/RankingView` — 181 organismos:
  posición, nombre, sector, valoración (%).
- `https://sismap.gob.do/Municipal/Ranking/RankingView?tipoOrganismoID=17` —
  160 ayuntamientos: posición, nombre, valor (%).
- `…?tipoOrganismoID=16` — 233 juntas de distrito municipal.

Tres peticiones en total. Es una instantánea y no una lectura en vivo porque
el cruce con las fichas de institución (por nombre) se decide aquí, con su
tabla de equivalencias curada, y se versiona. El SISMAP **no publica fecha de
corte** en estas páginas: la instantánea declara el día en que se consultó.

El cruce con `public/data/instituciones.json` es por nombre normalizado y,
si no, por coincidencia de palabras (Jaccard ≥ 0.85 con un único mejor
candidato). Lo que no casa queda sin enlace; nunca se adivina.

Uso:
    python3 scripts/build-sismap.py
"""
import datetime
import html
import json
import pathlib
import re
import sys
import time
import unicodedata
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "data" / "sismap.json"
UA = "Socratico-Inteligencia/1.0 (instantanea del ranking SISMAP; herramienta independiente)"
BASE = "https://sismap.gob.do"
TABLAS = {
    "instituciones": "/GestionPublica/Ranking/RankingView",
    "ayuntamientos": "/Municipal/Ranking/RankingView?tipoOrganismoID=17",
    "juntas": "/Municipal/Ranking/RankingView?tipoOrganismoID=16",
}

VACIAS = {"de", "del", "la", "las", "los", "el", "y", "e", "para", "municipal", "municipio",
          "ayuntamiento", "junta", "distrito", "s", "a"}


def bajar(ruta: str) -> str:
    for intento in (1, 2):
        try:
            req = urllib.request.Request(BASE + ruta, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                tipo = r.headers.get("content-type", "")
                if "text/html" not in tipo:
                    raise RuntimeError(f"{ruta}: content-type inesperado «{tipo}»")
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001 — un reintento y fuera
            if intento == 2:
                raise
            print(f"  reintento {ruta}: {e}", file=sys.stderr)
            time.sleep(5)
    raise AssertionError


def texto(celda: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", celda))).strip()


def filas(pagina: str) -> list[dict]:
    salida = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", pagina, re.S):
        celdas = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
        c = [texto(x) for x in celdas]
        if len(c) < 3 or not c[0].isdigit():
            continue
        pct = next((x for x in c[2:] if "%" in x), None)
        if pct is None:
            continue
        valor = float(re.sub(r"[^\d.]", "", pct) or 0)
        enlace = re.search(r'href="([^"#][^"]*)"', tr)
        salida.append({
            "posicion": int(c[0]),
            "nombre": c[1],
            "sector": c[2] if "%" not in c[2] else None,
            "valor": valor,
            "ficha": BASE + html.unescape(enlace.group(1)) if enlace else None,
        })
    return salida


def palabras(s: str) -> frozenset:
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"\bdir\b", "direccion", s)
    s = re.sub(r"\bgral\b", "general", s)
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return frozenset(w for w in s.split() if w not in VACIAS)


def main() -> None:
    instituciones = json.loads((RAIZ / "public" / "data" / "instituciones.json").read_text())["instituciones"]
    candidatos = [(palabras(i["nombre"]), i) for i in instituciones]
    exactas: dict[frozenset, list] = {}
    for p, i in candidatos:
        exactas.setdefault(p, []).append(i)

    def clase(nombre: str, tipo: str) -> str:
        """Institución, ayuntamiento o junta: «ayuntamiento», «junta» y «distrito»
        son palabras vacías para comparar, así que la clase se decide aparte y
        un ayuntamiento nunca casa con la junta de distrito del mismo nombre."""
        # «Junta» sola no hace gobierno local: la Junta de Aviación Civil y la
        # Junta Central Electoral son instituciones. Solo la junta de distrito.
        local = r"(?i)ayuntamiento|junta (de )?distrito|junta municipal|distrito municipal"
        if tipo != "Gobierno local" and not re.search(local, nombre):
            return "instituciones"
        return (
            "juntas"
            if re.search(r"(?i)junta (de )?distrito|junta municipal|distrito municipal", nombre)
            else "ayuntamientos"
        )

    def unidad(nombre: str, tabla: str):
        p = palabras(nombre)
        grupo = [i for i in exactas.get(p, []) if clase(i["nombre"], i["tipo"]) == tabla]
        if len(grupo) == 1:
            return grupo[0]["id"]
        mejores, tope = [], 0.0
        for q, i in candidatos:
            if clase(i["nombre"], i["tipo"]) != tabla or not q:
                continue
            j = len(p & q) / len(p | q)
            if j > tope:
                mejores, tope = [i], j
            elif j == tope:
                mejores.append(i)
        return mejores[0]["id"] if tope >= 0.85 and len(mejores) == 1 else None

    doc = {"consultado": datetime.date.today().isoformat(), "fuente": BASE}
    for clave, ruta in TABLAS.items():
        lista = filas(bajar(ruta))
        if len(lista) < 20:
            raise SystemExit(f"{ruta}: solo {len(lista)} filas; ¿cambió la página?")
        for f in lista:
            f["uc"] = unidad(f["nombre"], clave)
        # Dos filas del SISMAP no pueden apuntar a la misma ficha: si pasa, se
        # sueltan las dos antes que enlazar una mal.
        vistas: dict = {}
        for f in lista:
            if f["uc"]:
                vistas.setdefault(f["uc"], []).append(f)
        for fs in vistas.values():
            if len(fs) > 1:
                for f in fs:
                    f["uc"] = None
        doc[clave] = lista
        print(f"{clave}: {len(lista)} filas · {sum(1 for f in lista if f['uc'])} con ficha de institución")
        time.sleep(3)

    SALIDA.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")))
    print(f"→ {SALIDA} ({SALIDA.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
