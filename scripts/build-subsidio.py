#!/usr/bin/env python3
"""Genera public/data/subsidio-electrico.json: lo que el Tesoro transfiere
cada año a las empresas eléctricas del Estado (las tres distribuidoras y la
transmisora), según la API de datos abiertos del SIGEF.

Mecánica verificada en docs/INFRAESTRUCTURA.md §5.2 (2026-09-24), la misma API que
ya lee `scripts/build-fiscal.py`:

    GET https://api-sigef.hacienda.gob.do/servicios/datosabiertos/portaltransparencia/gastos/transferencias/{año}/{mes}/json?seccion=11111&capitulo=0999
    → 200 (`content-type: application/csv` con cuerpo JSON: se valida el
      cuerpo, no la cabecera), ~60 filas por año: institución receptora, mes
      devengado, presupuesto, devengado, pagado. ~20 s por año cerrado; el año
      en curso puede tardar más de un minuto.

Se leen las transferencias del capítulo 0999 (Administración de Obligaciones
del Tesoro) cuyas receptoras son EDENORTE, EDESUR, EDEESTE, ETED, EGEHID o
la antigua CDEEE (que hasta 2023 recibía la transferencia y la repartía). **Es lo que el Tesoro transfiere, no todo el costo del sector**: no
incluye el subsidio al GLP ni lo que pagan otras vías; se declara así.

Uso:
    python3 scripts/build-subsidio.py
"""
import collections
import datetime
import json
import pathlib
import re
import sys
import time
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "data" / "subsidio-electrico.json"
UA = "Socratico-Inteligencia/1.0 (subsidio electrico del SIGEF; herramienta independiente)"
BASE = ("https://api-sigef.hacienda.gob.do/servicios/datosabiertos/portaltransparencia"
        "/gastos/transferencias/{anio}/{mes}/json?seccion=11111&capitulo=0999")
PRIMER_ANIO = 2019
ELECTRICAS = re.compile(r"EGEHID|GENERACI[OÓ]N HIDROEL[EÉ]CTRICA|EDENORTE|EDESUR|EDEESTE|ETED|TRANSMISI[OÓ]N EL[EÉ]CTRICA|CDEEE|CORPORACI[OÓ]N DOMINICANA DE EMPRESAS EL[EÉ]CTRICAS|DISTRIBUIDORA DE ELECTRICIDAD", re.I)


def bajar(anio: int, mes: int) -> list[dict]:
    url = BASE.format(anio=anio, mes=mes)
    for intento in (1, 2):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=240) as r:
                cuerpo = r.read().decode("utf-8", "replace").strip()
            if not cuerpo.startswith("["):
                raise RuntimeError(f"{url}: el cuerpo no es un arreglo JSON")
            return json.loads(cuerpo)
        except Exception as e:  # noqa: BLE001 — un reintento y fuera
            if intento == 2:
                raise
            print(f"  reintento {anio}: {e}", file=sys.stderr)
            time.sleep(10)
    raise AssertionError


def corto(nombre: str) -> str:
    for k in ("EGEHID", "EDENORTE", "EDESUR", "EDEESTE", "ETED", "CDEEE"):
        if k in nombre.upper():
            return k
    if re.search(r"TRANSMISI", nombre, re.I):
        return "ETED"
    if re.search(r"CORPORACI", nombre, re.I):
        return "CDEEE"
    return nombre.strip()


def main() -> None:
    hoy = datetime.date.today()
    anios = []
    receptoras_vistas = collections.Counter()
    mensual_actual: dict[int, float] = collections.defaultdict(float)
    for anio in range(PRIMER_ANIO, hoy.year + 1):
        mes = 12 if anio < hoy.year else hoy.month
        filas = bajar(anio, mes)
        por = collections.defaultdict(lambda: {"devengado": 0.0, "pagado": 0.0, "vigente": 0.0})
        ultimo_mes = 0
        for f in filas:
            nombre = f.get("NOMBRE INSTITUCION RECEPTORA") or ""
            receptoras_vistas[nombre] += 1
            if not ELECTRICAS.search(nombre):
                continue
            k = corto(nombre)
            dev = float(f.get("DEVENGADO") or 0)
            por[k]["devengado"] += dev
            por[k]["pagado"] += float(f.get("PAGADO") or 0)
            # El vigente llega como delta mensual, igual que en build-fiscal.py.
            por[k]["vigente"] += float(f.get("PRESUPUESTO VIGENTE") or 0)
            m = int(f.get("MES DEVENGADO") or 0)
            if dev:
                ultimo_mes = max(ultimo_mes, m)
            if anio == hoy.year:
                mensual_actual[m] += dev
        total = sum(v["devengado"] for v in por.values())
        anios.append({
            "anio": anio,
            "hastaMes": ultimo_mes if anio == hoy.year else 12,
            "devengado": round(total),
            "pagado": round(sum(v["pagado"] for v in por.values())),
            "vigente": round(sum(v["vigente"] for v in por.values())),
            "empresas": {k: {kk: round(vv) for kk, vv in v.items()} for k, v in sorted(por.items())},
        })
        print(f"  {anio}: RD${total:,.0f}", file=sys.stderr)
        time.sleep(3)

    cerrados = [a for a in anios if a["anio"] < hoy.year]
    if not cerrados or any(a["devengado"] <= 0 for a in cerrados):
        sys.exit("Un año cerrado sin transferencias eléctricas: el origen cambió, no se escribe.")
    SALIDA.write_text(json.dumps({
        "generado": hoy.isoformat(),
        "fuente": BASE.format(anio=hoy.year, mes=hoy.month),
        "anios": anios,
        "mensualActual": [[m, round(v)] for m, v in sorted(mensual_actual.items()) if v],
        "otrasReceptoras": [n for n, _ in receptoras_vistas.most_common() if not ELECTRICAS.search(n)][:12],
    }, ensure_ascii=False, separators=(",", ":")))
    print(f"Escrito {SALIDA}", file=sys.stderr)


if __name__ == "__main__":
    main()
