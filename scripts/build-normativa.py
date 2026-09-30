#!/usr/bin/env python3
"""Genera public/data/normativa.json: instantánea de la normativa del Ejecutivo.

La Consultoría Jurídica responde 403 al egreso de Vercel (y 201 desde otras
redes), así que lib/normativa.ts intenta la lectura en vivo y cae a esta
instantánea. Cubre los años que ofrece /normativa, por tipo, más la Gaceta
Oficial. Regenerar a menudo —se publican decretos cada semana—:

    python3 scripts/build-normativa.py

Requiere red con acceso a www.consultoria.gov.do (p. ej. una máquina local).
"""
import datetime
import json
import pathlib
import sys
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from privacidad import sin_cedula  # noqa: E402

BASE = "https://www.consultoria.gov.do"
UA = "Socratico-Inteligencia/1.0 (instantanea normativa; herramienta independiente)"
TIPOS = [1, 3, 4, 7]  # leyes, decretos, reglamentos, resoluciones
SALIDA = pathlib.Path(__file__).resolve().parent.parent / "public" / "data" / "normativa.json"


def pedir(url: str, cuerpo: dict | None = None):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(
        url,
        data=datos,
        headers={
            "User-Agent": UA,
            "Accept": "application/json",
            **({"Content-Type": "application/json"} if datos else {}),
        },
        method="POST" if datos else "GET",
    )
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)


def buscar(tipo: int, anio: int) -> list:
    filas = pedir(f"{BASE}/api/consultas/search", {
        "DocumentTypeCode": tipo, "DocumentNumber": "", "FullText": "",
        "Name": "", "LastName": "", "Identification": "", "Charge": "",
        "Institution": 0, "President": 0, "Consultor": 0, "Career": 0,
        "Guild": 0, "PensionType": 0, "PublicationYear": str(anio),
    })
    # Solo lo que la plataforma usa: la fila cruda lleva nombres de personas
    # designadas y campos vacíos que no hacen falta en el repositorio.
    # `Institucion` alimenta el cruce con las fichas de institución.
    # Un título puede traer la cédula de una persona: no se escribe.
    return [
        {k: (sin_cedula(f.get(k)) if k == "Titulo" else f.get(k)) for k in
         ("DocId", "TipoDocumento", "Tipo", "Numero", "Titulo", "Gaceta", "FechaPromulgacion",
          "Institucion")}
        for f in filas
    ]


def main() -> None:
    hoy = datetime.date.today()
    anios = [hoy.year - i for i in range(4)]
    busquedas = {}
    for tipo in TIPOS:
        for anio in anios:
            filas = buscar(tipo, anio)
            busquedas[f"{tipo}/{anio}"] = filas
            print(f"tipo {tipo} · {anio}: {len(filas)}")
    gacetas = [
        {k: g.get(k) for k in ("id", "title", "fileUrl", "year", "month", "status")}
        for g in pedir(f"{BASE}/api/documents?category=gacetas")
    ]
    print(f"gacetas: {len(gacetas)}")
    SALIDA.write_text(json.dumps({
        "generadoEn": hoy.isoformat(),
        "busquedas": busquedas,
        "gacetas": gacetas,
    }, ensure_ascii=False, separators=(",", ":")))
    print(f"→ {SALIDA} ({SALIDA.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
