#!/usr/bin/env python3
"""Genera public/data/leyes.json: todas las leyes que publica la Consultoría Jurídica.

`build-normativa.py` guarda los últimos cuatro años por tipo; esta instantánea
guarda el histórico completo de un solo tipo —las leyes— para que el buscador
y la ficha `/normativa/ley/[numero]` alcancen la Ley 47-20 o la 1494 de 1947.

Mecánica verificada (2026-09-27, desde una máquina local):

  · `POST /api/consultas/search` con `DocumentTypeCode: 1` y
    `PublicationYear: ""` devuelve **todas** las leyes en una sola respuesta
    JSON (201, ~12.500 filas, ~10 s): no hace falta ir año por año. Con un año
    (`"2020"`) devuelve un subconjunto de esa misma lista.
  · La serie empieza en 1844. Los números con año (`47-20`, `16-2000`) son la
    norma desde mediados de los noventa; antes, la ley lleva un número solo
    (`1494`), a veces con «BIS».
  · El origen repite algunas leyes (la misma cargada dos veces): una ley es su
    número y su fecha de promulgación, como en `build-busqueda.py`.
  · La Consultoría responde 403 al egreso de Vercel (Cloudflare): en
    producción la ficha cae a esta instantánea cuando la ley no está en
    `normativa.json` (`lib/normativa.ts`).

Una petición, con User-Agent identificable. Regenerar de vez en cuando —el
Congreso aprueba unas pocas decenas de leyes al año—:

    python3 scripts/build-leyes.py

Requiere red con acceso a www.consultoria.gov.do (p. ej. una máquina local).
"""
import datetime
import json
import pathlib
import re
import urllib.request

BASE = "https://www.consultoria.gov.do"
UA = "Socratico-Inteligencia/1.0 (instantanea leyes; herramienta independiente)"
SALIDA = pathlib.Path(__file__).resolve().parent.parent / "public" / "data" / "leyes.json"
# Filas compactas: una lista por ley en este orden, sin repetir las claves.
CAMPOS = ["DocId", "Numero", "Titulo", "Gaceta", "FechaPromulgacion", "Institucion"]


def texto(s) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip()


def leyes() -> list:
    req = urllib.request.Request(
        f"{BASE}/api/consultas/search",
        data=json.dumps({
            "DocumentTypeCode": 1, "DocumentNumber": "", "FullText": "",
            "Name": "", "LastName": "", "Identification": "", "Charge": "",
            "Institution": 0, "President": 0, "Consultor": 0, "Career": 0,
            "Guild": 0, "PensionType": 0, "PublicationYear": "",
        }).encode(),
        headers={"User-Agent": UA, "Accept": "application/json", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        if "json" not in (r.headers.get("content-type") or ""):
            raise SystemExit(f"respuesta inesperada: {r.headers.get('content-type')}")
        return json.load(r)


def main() -> None:
    crudas = leyes()
    print(f"filas del origen: {len(crudas)}")
    vistas: set[tuple[str, str]] = set()
    filas = []
    for f in crudas:
        if f.get("TipoDocumento") != 1 or not texto(f.get("Titulo")):
            continue
        numero = texto(f.get("Numero"))
        fecha = texto(f.get("FechaPromulgacion"))[:10]
        clave = (numero, fecha)
        if clave in vistas:
            continue
        vistas.add(clave)
        filas.append([
            f.get("DocId"),
            numero,
            texto(f.get("Titulo")),
            texto(f.get("Gaceta")) or None,
            fecha or None,
            texto(f.get("Institucion")) or None,
        ])
    # De la más reciente a la más antigua; a igual fecha, por número y DocId.
    filas.sort(key=lambda r: (r[4] or "", r[1], r[0] or 0), reverse=True)
    anios = sorted(r[4][:4] for r in filas if r[4])
    print(f"leyes únicas: {len(filas)} ({anios[0]}–{anios[-1]})")
    SALIDA.write_text(json.dumps({
        "generadoEn": datetime.date.today().isoformat(),
        "campos": CAMPOS,
        "leyes": filas,
    }, ensure_ascii=False, separators=(",", ":")))
    print(f"→ {SALIDA} ({SALIDA.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
