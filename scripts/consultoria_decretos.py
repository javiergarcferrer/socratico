"""El registro de decretos de la Consultoría Jurídica: una sola lectura,
compartida por scripts/build-decretos.py (el registro por año) y
scripts/build-funcionarios.py (designaciones y firmantes).

`POST /api/consultas/search` con `DocumentTypeCode: 3` y el año vacío es la
consulta que hace el buscador público: sin sesión ni clave, responde de una
vez los ~78,800 decretos desde 1844 (~75 MB, ~60 s). Mecánica en
docs/INFRAESTRUCTURA.md §5.6. Solo se guardan seis campos: la cédula, el monto de
una pensión y los campos de persona que trae la fila no se escriben ni en la
caché.

Cada script trae su `pedir` (su User-Agent identificable, su pausa, su
validación de content-type); aquí solo vive lo que los dos deben hacer igual.
"""
import datetime
import json
import pathlib
import re
import time
import unicodedata

CONSULTORIA = "https://www.consultoria.gov.do"
CAMPOS = ("DocId", "Numero", "Titulo", "FechaPromulgacion", "Presidente", "Institucion")


def limpio(s: str) -> str:
    s = unicodedata.normalize("NFC", s or "")
    return re.sub(r"\s+", " ", s.replace("​", "").replace("\xa0", " ")).strip(" ,.;:")


def fecha_iso(s: str | None) -> str | None:
    if not s:
        return None
    s = s.strip()
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return m.group(0)
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", s)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    return None


def leer_decretos(cache: pathlib.Path, sin_red: bool, pedir) -> list[dict]:
    """Todos los decretos, de la caché si tiene menos de un día (o siempre con
    `sin_red`); si no, una lectura. `pedir(url, datos=…, tipo=…, espera=…,
    cabeceras=…)` es el del script que llama y devuelve `(cuerpo, meta)`."""
    ruta = cache / "decretos.json"
    if sin_red or (ruta.exists() and time.time() - ruta.stat().st_mtime < 86400):
        return json.loads(ruta.read_text(encoding="utf-8"))
    cuerpo = json.dumps({
        "DocumentTypeCode": 3, "DocumentNumber": "", "FullText": "", "Name": "", "LastName": "",
        "Identification": "", "Charge": "", "Institution": 0, "President": 0, "Consultor": 0,
        "Career": 0, "Guild": 0, "PensionType": 0, "PublicationYear": "",
    }).encode()
    crudo, _ = pedir(f"{CONSULTORIA}/api/consultas/search", datos=cuerpo, tipo="json", espera=300,
                     cabeceras={"Content-Type": "application/json", "Accept": "application/json"})
    filas = [{k: f.get(k) for k in CAMPOS} for f in json.loads(crudo)]
    ruta.write_text(json.dumps(filas, ensure_ascii=False), encoding="utf-8")
    return filas


def fecha_de_cache(cache: pathlib.Path, *nombres: str) -> str | None:
    """La fecha (UTC) del archivo de caché más reciente de los nombrados: con
    `--sin-red`, la instantánea dice cuándo se leyó el origen, no cuándo se
    rehízo."""
    fechas = [(cache / n).stat().st_mtime for n in nombres if (cache / n).exists()]
    if not fechas:
        return None
    return datetime.datetime.fromtimestamp(max(fechas), datetime.timezone.utc).date().isoformat()


def firmas_presidenciales(decretos: list[dict]) -> dict[str, dict]:
    """Cuántos decretos firmó cada quien y entre qué fechas. Un puñado de
    fechas lejos del resto es un error de captura (hay decretos de «Luis
    Abinader» fechados en 1900 y en 2017) y no cuenta para el rango; sí para
    el total. `tramos` son los períodos de firma que cuentan: una fila del
    registro fuera de todos ellos es un error de captura probable."""
    fechas: dict[str, list[str]] = {}
    for d in decretos:
        f = limpio(d.get("Presidente") or "")
        fecha = fecha_iso(d.get("FechaPromulgacion"))
        if f and fecha:
            fechas.setdefault(f, []).append(fecha)
    salida: dict[str, dict] = {}
    for f, lista in fechas.items():
        lista.sort()
        dias = [datetime.date.fromisoformat(x) for x in lista]
        # Tramos de firmas sin un hueco de más de un año. Un tramo diminuto es un
        # error de captura (dos decretos de «Luis Abinader» fechados en 1900); un
        # período anterior del mismo presidente es un tramo grande y cuenta.
        tramos: list[list[str]] = [[lista[0]]]
        for k in range(1, len(lista)):
            if (dias[k] - dias[k - 1]).days > 365:
                tramos.append([])
            tramos[-1].append(lista[k])
        buenos = [t for t in tramos if len(t) >= max(5, len(lista) // 100)] or tramos
        salida[f] = {"n": len(lista), "desde": buenos[0][0], "hasta": buenos[-1][-1],
                     "tramos": [[t[0], t[-1]] for t in buenos]}
    return salida
