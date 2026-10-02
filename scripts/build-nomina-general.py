#!/usr/bin/env python3
"""Genera public/data/nomina-general.json: la Nómina Pública General del
Estado que publica el Ministerio de Administración Pública (MAP), agregada.

Mecánica verificada en docs/INFRAESTRUCTURA.md §5.8 (2026-09-24):

    GET https://map.gob.do/datosabiertos/data/nomina_publica_general_estado/csv?year=2026&month=7
    → 200 text/csv, ~62 MB, 492,488 filas: Nombre_del_empleado, Institución,
      Cargo, Estatus, Suelto_Bruto [sic], Género, Mes, Año.
    → 404 para un mes que aún no se publica.

robots de map.gob.do: solo veta `/wp-admin/`. Son dos descargas por corrida
(el último mes publicado y el anterior, para decir qué cambió), nunca en una
visita.

**No se guarda ningún nombre ni el género.** Del archivo se leen institución,
cargo, estatus y sueldo bruto, y se agregan:

- por institución: plazas, masa, mediana, percentil 90, máximo, plazas por
  estatus, y plazas y masa del mes anterior;
- por institución y cargo: plazas, masa, mediana, mínimo y máximo;
- los 40 cargos mejor pagados del Estado (sueldo más alto de cada
  institución × cargo).

Es la fuente que cubre lo que la foto transversal de `/nomina` no alcanza
(Educación, el Servicio Nacional de Salud, la Procuraduría…), pero no trae el
área: por eso vive en su propia página, servida desde el servidor, y no se
mezcla con la foto que el explorador descarga entera.

Uso:
    python3 scripts/build-nomina-general.py
    python3 scripts/build-nomina-general.py --local ACTUAL.csv ANTERIOR.csv
"""
import collections
import csv
import datetime
import io
import json
import pathlib
import re
import statistics
import sys
import time
import unicodedata
import urllib.error
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "data" / "nomina-general.json"
INSTITUCIONES = RAIZ / "public" / "data" / "instituciones.json"
UA = "Socratico-Inteligencia/1.0 (nomina publica general del MAP; herramienta independiente)"
URL = "https://map.gob.do/datosabiertos/data/nomina_publica_general_estado/csv?year={a}&month={m}"
MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto",
         "Septiembre", "Octubre", "Noviembre", "Diciembre"]


def bajar(anio: int, mes: int) -> str | None:
    url = URL.format(a=anio, m=mes)
    for intento in (1, 2):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=600) as r:
                tipo = r.headers.get("content-type", "")
                if "text/csv" not in tipo:
                    raise RuntimeError(f"{url}: content-type inesperado «{tipo}»")
                return r.read().decode("utf-8-sig", "replace")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None  # el mes aún no está publicado
            if intento == 2:
                raise
        except Exception:  # noqa: BLE001 — un reintento y fuera
            if intento == 2:
                raise
        time.sleep(10)
    return None


def norm(s: str) -> str:
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def leer(texto: str):
    filas = []
    for r in csv.DictReader(io.StringIO(texto)):
        try:
            sueldo = float((r.get("Suelto_Bruto") or r.get("Sueldo_Bruto") or "0").replace(",", ""))
        except ValueError:
            continue
        inst = " ".join((r.get("Institución") or "").split())
        cargo = " ".join((r.get("Cargo") or "").split()) or "Sin cargo declarado"
        estatus = " ".join((r.get("Estatus") or "").split()) or "Sin estatus"
        if not inst:
            continue
        filas.append((inst, cargo, estatus, sueldo))
    return filas


def percentil(v: list[float], p: float) -> float:
    v = sorted(v)
    return v[min(len(v) - 1, int(p * len(v)))]


def main() -> None:
    if "--local" in sys.argv:
        i = sys.argv.index("--local")
        actual_txt = pathlib.Path(sys.argv[i + 1]).read_text("utf-8-sig", "replace")
        anterior_txt = pathlib.Path(sys.argv[i + 2]).read_text("utf-8-sig", "replace")
        m = re.search(r",(\w+),(\d{4})\s*$", actual_txt.strip().splitlines()[-1])
        anio, mes = int(m.group(2)), MESES.index(m.group(1)) + 1
    else:
        hoy = datetime.date.today()
        anio, mes, actual_txt = hoy.year, hoy.month, None
        for _ in range(12):  # hacia atrás hasta el último mes publicado
            actual_txt = bajar(anio, mes)
            if actual_txt:
                break
            mes -= 1
            if mes == 0:
                anio, mes = anio - 1, 12
            time.sleep(3)
        if not actual_txt:
            sys.exit("Ningún mes publicado en los últimos doce: no se escribe.")
        time.sleep(3)
        a2, m2 = (anio, mes - 1) if mes > 1 else (anio - 1, 12)
        anterior_txt = bajar(a2, m2) or ""

    filas = leer(actual_txt)
    previas = leer(anterior_txt) if anterior_txt else []
    if len(filas) < 300_000:
        sys.exit(f"Solo {len(filas)} filas: el archivo cambió o vino incompleto, no se escribe.")
    ceros = sum(1 for f in filas if f[3] <= 0)
    if ceros / len(filas) > 0.02:
        sys.exit(f"{ceros} plazas en RD$0 (> 2 %): no se escribe.")

    ant = collections.defaultdict(lambda: [0, 0.0])
    for inst, _, _, s in previas:
        ant[inst][0] += 1
        ant[inst][1] += s

    # Cruce con las fichas de institución: nombre normalizado exacto; si no,
    # sin enlace. Nunca se adivina.
    fichas = {}
    try:
        for f in json.loads(INSTITUCIONES.read_text("utf-8"))["instituciones"]:
            fichas.setdefault(norm(f["nombre"]), f["id"])
    except Exception:  # noqa: BLE001
        pass

    por_inst: dict[str, list[float]] = collections.defaultdict(list)
    estatus: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    por_cargo: dict[tuple[str, str], list[float]] = collections.defaultdict(list)
    for inst, cargo, est, s in filas:
        por_inst[inst].append(s)
        estatus[inst][est] += 1
        por_cargo[(inst, cargo)].append(s)

    instituciones = []
    for nombre, v in sorted(por_inst.items(), key=lambda kv: -len(kv[1])):
        cargos = sorted(
            ((c, vs) for (i, c), vs in por_cargo.items() if i == nombre),
            key=lambda kv: -len(kv[1]),
        )
        instituciones.append({
            "nombre": nombre,
            "uc": fichas.get(norm(nombre)),
            "plazas": len(v),
            "masa": round(sum(v)),
            "mediana": round(statistics.median(v)),
            "p90": round(percentil(v, 0.9)),
            "maximo": round(max(v)),
            "estatus": dict(estatus[nombre].most_common()),
            "anterior": [ant[nombre][0], round(ant[nombre][1])] if nombre in ant else None,
            # [cargo, plazas, masa, mediana, mínimo, máximo]
            "cargos": [[c, len(vs), round(sum(vs)), round(statistics.median(vs)), round(min(vs)), round(max(vs))]
                       for c, vs in cargos],
        })

    mejor_pagados = sorted(
        ((round(max(vs)), i, c, len(vs)) for (i, c), vs in por_cargo.items()),
        reverse=True,
    )[:40]
    todos = [f[3] for f in filas]
    salida = {
        "generado": datetime.date.today().isoformat(),
        "anio": anio,
        "mes": mes,
        "fuente": URL.format(a=anio, m=mes),
        "anterior": {"anio": anio if mes > 1 else anio - 1, "mes": mes - 1 if mes > 1 else 12,
                     "plazas": len(previas), "masa": round(sum(f[3] for f in previas))} if previas else None,
        "plazas": len(filas),
        "masa": round(sum(todos)),
        "mediana": round(statistics.median(todos)),
        "estatus": dict(collections.Counter(f[2] for f in filas).most_common()),
        "mejorPagados": [{"sueldo": s, "institucion": i, "cargo": c, "plazas": n,
                          "uc": fichas.get(norm(i))} for s, i, c, n in mejor_pagados],
        "instituciones": instituciones,
    }
    SALIDA.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")))
    print(f"{MESES[mes - 1]} {anio}: {len(filas)} plazas, RD${sum(todos):,.0f}, "
          f"{len(instituciones)} instituciones ({sum(1 for i in instituciones if i['uc'])} con ficha)",
          file=sys.stderr)


if __name__ == "__main__":
    main()
