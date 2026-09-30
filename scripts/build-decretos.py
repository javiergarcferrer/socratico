#!/usr/bin/env python3
"""Genera public/data/decretos/: el registro completo de decretos del Poder
Ejecutivo que publica la Consultoría Jurídica, partido por año.

Es el nodo «decreto» del grafo: la lista de los decretos que firmó cada
Presidente (`/funcionarios/[slug]/decretos`), la ficha de cualquier decreto
numerado «NNN-AA» aunque la Consultoría desafíe al egreso de Vercel
(`resolverNorma` en lib/normativa.ts cae aquí) y las aristas firmante →
decreto del grafo semántico. Mecánica en docs/AUDITORIA.md §4.1: una sola
lectura del buscador público (`scripts/consultoria_decretos.py`), compartida
con scripts/build-funcionarios.py por la misma caché.

Salida:

- `indice.json`: fecha, total, filas por año, la tabla de firmantes (su firma
  tal como la escribe la Consultoría, cuántos, sus tramos de firma y los años
  donde tiene filas) y la tabla de etiquetas de institución.
- `<año>.json`: `{"anio", "filas"}` con una fila por decreto,
  `[numero, fecha, titulo, docId, institucion, firmante, aviso]`; los dos
  índices apuntan a las tablas de `indice.json` (o `null`), y `aviso` es
  `"fuera"` si la fecha cae fuera de los tramos de firma de su firmante (un
  error de captura probable: hay decretos de 2017 atribuidos a quien firmó
  desde 2020), `"fecha"` si la fecha no casa con el año del número, o `null`.
- `sin-fecha.json`: lo que no trae fecha ni un número «NNN-AA» que la dé.

**Un número «NNN-AA» vive en el archivo de su año** (20AA si ya pasó, si no
19AA): así la ficha de un decreto se resuelve leyendo un solo archivo. Si la
fecha del origen no casa con el año del número (un «497-25» fechado el
1-1-1900), la fila va al año del número con su fecha tal cual y el aviso
`"fecha"`. Los números sin año («1234», de antes de los ochenta) se
repiten cada año: esos van al año de su fecha y se enlazan por su PDF.

Solo se guardan número, fecha, título, identificador del documento, la
etiqueta de institución y el firmante: la cédula y los demás campos de
persona del buscador no llegan ni a la caché.

Se niega a escribir si llegan menos de 75,000 decretos o si el año en curso o
el firmante vigente vienen vacíos. Regenerar cada semana, antes de
scripts/build-funcionarios.py (comparten la caché del día):

    python3 scripts/build-decretos.py [--cache DIR] [--sin-red]
"""
import argparse
import datetime
import json
import pathlib
import re
import sys
import tempfile
import time
import urllib.error
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from consultoria_decretos import (CONSULTORIA, fecha_de_cache, fecha_iso,  # noqa: E402
                                  firmas_presidenciales, leer_decretos, limpio)

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "data" / "decretos"
UA = "Socratico-Inteligencia/1.0 (registro de decretos; herramienta independiente)"

# «0-00» no es un número: el origen lo pone cuando no tiene uno.
NUMERO_ANIO = re.compile(r"^(?!0+-)\d{1,4}-(\d{2})$")


class Rechazo(Exception):
    """El origen dijo que no (403, 470, desafío): no se reintenta ni se rodea."""


def pedir(url: str, *, datos: bytes | None = None, tipo: str | None = None,
          cabeceras: dict | None = None, espera: int = 60) -> tuple[bytes, dict]:
    """El POST de consulta que hace el buscador público: UA identificable, un
    reintento ante fallo de red y el content-type validado."""
    for intento in (1, 2):
        h = {"User-Agent": UA, "Accept": "*/*", "Accept-Encoding": "identity"}
        h.update(cabeceras or {})
        req = urllib.request.Request(url, data=datos, headers=h, method="POST" if datos is not None else "GET")
        try:
            with urllib.request.urlopen(req, timeout=espera) as r:
                cuerpo = r.read()
                meta = {"tipo": r.headers.get("content-type") or ""}
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 429, 470):
                raise Rechazo(f"{url}: HTTP {e.code}")
            if intento == 2:
                raise
            time.sleep(5)
            continue
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            if intento == 2:
                raise
            print(f"  reintento tras: {e}", file=sys.stderr)
            time.sleep(5)
            continue
        if tipo and not re.search(tipo, meta["tipo"], re.I):
            raise Rechazo(f"{url}: se esperaba {tipo} y llegó {meta['tipo']!r}")
        return cuerpo, meta
    raise RuntimeError("inalcanzable")


def anio_del_numero(numero: str, este_anio: int) -> int | None:
    """«641-26» → 2026; «381-97» → 1997. El siglo es el más reciente que ya
    llegó: un «27» hoy es 1927."""
    m = NUMERO_ANIO.match(numero)
    if not m:
        return None
    aa = int(m.group(1))
    return 2000 + aa if 2000 + aa <= este_anio else 1900 + aa


def orden_numero(numero: str) -> int:
    m = re.match(r"\d+", numero or "")
    return int(m.group(0)) if m else -1


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cache", default=str(pathlib.Path(tempfile.gettempdir()) / "socratico-funcionarios"))
    ap.add_argument("--sin-red", action="store_true", help="solo lo que ya está en la caché")
    args = ap.parse_args()
    cache = pathlib.Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)
    generado = (args.sin_red and fecha_de_cache(cache, "decretos.json")) or datetime.date.today().isoformat()
    este_anio = int(generado[:4])

    print("Consultoría — todos los decretos…")
    decretos = leer_decretos(cache, args.sin_red, pedir)
    if len(decretos) < 75000:
        sys.exit(f"Consultoría: {len(decretos)} decretos: no se escribe")

    firmas = firmas_presidenciales(decretos)
    # Firmantes por volumen: el índice más bajo es el que más firmó.
    claves = sorted(firmas, key=lambda f: (-firmas[f]["n"], f))
    idx_firmante = {f: k for k, f in enumerate(claves)}
    etiquetas: dict[str, int] = {}

    por_anio: dict[str, list[list]] = {}
    avisos = {"fuera": 0, "fecha": 0}
    anios_de: dict[str, set[int]] = {f: set() for f in claves}
    for d in decretos:
        numero = limpio(d.get("Numero") or "").replace(" ", "")
        fecha = fecha_iso(d.get("FechaPromulgacion"))
        titulo = limpio(d.get("Titulo") or "")
        firma = limpio(d.get("Presidente") or "")
        etiqueta = limpio(d.get("Institucion") or "")
        del_numero = anio_del_numero(numero, este_anio)
        aviso = None
        if del_numero is not None:
            anio = del_numero
            if fecha and int(fecha[:4]) != del_numero:
                aviso = "fecha"
        elif fecha:
            anio = int(fecha[:4])
        else:
            anio = None
        if aviso is None and fecha and firma in firmas:
            if not any(desde <= fecha <= hasta for desde, hasta in firmas[firma]["tramos"]):
                aviso = "fuera"
        if aviso:
            avisos[aviso] += 1
        if etiqueta and etiqueta not in etiquetas:
            etiquetas[etiqueta] = len(etiquetas)
        fila = [numero or None, fecha, titulo, d.get("DocId"),
                etiquetas[etiqueta] if etiqueta else None,
                idx_firmante.get(firma), aviso]
        clave_anio = str(anio) if anio else "sin-fecha"
        por_anio.setdefault(clave_anio, []).append(fila)
        if firma in anios_de and anio:
            anios_de[firma].add(anio)

    # Plausibilidad: el año en curso tiene decretos y el firmante vigente también.
    if len(por_anio.get(str(este_anio), [])) < 50:
        sys.exit(f"{este_anio}: {len(por_anio.get(str(este_anio), []))} decretos: no se escribe")
    vigente = max(firmas, key=lambda f: firmas[f]["hasta"])
    if firmas[vigente]["hasta"] < f"{este_anio - 1}-01-01":
        sys.exit(f"el firmante más reciente ({vigente}) firmó por última vez el {firmas[vigente]['hasta']}: no se escribe")

    SALIDA.mkdir(parents=True, exist_ok=True)
    for viejo in SALIDA.glob("*.json"):
        viejo.unlink()
    for clave_anio, filas in por_anio.items():
        # Del más reciente al más viejo; sin fecha al final del año; a igual
        # fecha, el número mayor primero.
        filas.sort(key=lambda f: (f[1] or "", orden_numero(f[0] or "")), reverse=True)
        cuerpo = {"anio": int(clave_anio) if clave_anio.isdigit() else None, "filas": filas}
        (SALIDA / f"{clave_anio}.json").write_text(
            json.dumps(cuerpo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    indice = {
        "generado": generado,
        "fuente": {"url": f"{CONSULTORIA}/", "total": len(decretos)},
        "anios": {k: len(v) for k, v in sorted(por_anio.items()) if k.isdigit()},
        "sinFecha": len(por_anio.get("sin-fecha", [])),
        "avisos": avisos,
        "firmantes": [{"clave": f, "n": firmas[f]["n"], "desde": firmas[f]["desde"], "hasta": firmas[f]["hasta"],
                       "tramos": firmas[f]["tramos"], "anios": sorted(anios_de[f])} for f in claves],
        "instituciones": list(etiquetas),
    }
    (SALIDA / "indice.json").write_text(json.dumps(indice, ensure_ascii=False, separators=(",", ":")),
                                        encoding="utf-8")
    peso = sum(p.stat().st_size for p in SALIDA.glob("*.json"))
    print(f"→ {SALIDA.relative_to(RAIZ)}/: {len(decretos):,} decretos en {len(por_anio)} archivos, "
          f"{len(claves)} firmantes, {peso / 1e6:.1f} MB; avisos: {avisos}")


if __name__ == "__main__":
    main()
