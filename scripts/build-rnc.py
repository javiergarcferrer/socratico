#!/usr/bin/env python3
"""Genera public/data/rnc/*.json: el registro tributario (DGII) de cada
proveedor del Estado que es persona jurídica, indexado por su RPE.

Dos descargas, sin clave (docs/INFRAESTRUCTURA.md §5.1):

1. **El Registro de Proveedores del Estado entero**, que la DGCP sirve como
   archivo en su sección «Tablas» de datos abiertos:
   `https://datosabiertos.dgcp.gob.do/api-dgcp/v1/tablas/proveedores?Type=csv&inhabilitados=false`
   (~80 MB, ~138 mil filas). La API paginada
   no se puede recorrer, pero la tabla se descarga de una vez. De ella se leen
   **solo** `RPE`, `NUMERO_DOCUMENTO` y `TIPO_DOCUMENTO`: el archivo trae
   teléfonos, correos y personas de contacto, y nada de eso se guarda ni se
   imprime (publicar no es exponer).
2. **El padrón de contribuyentes de la DGII**:
   `https://dgii.gov.do/app/WebApps/Consultas/RNC/RNC_CONTRIBUYENTES.zip`
   (~27 MB comprimido, ~790 mil filas, Windows-1252).

El cruce se **acota a los proveedores con RNC de 9 dígitos** —personas
jurídicas—. El padrón también lista personas físicas por cédula; no se
cruzan: a una persona se la identifica ya por su nombre en la ficha, y su
actividad tributaria no añade nada que la plataforma necesite.

Se guarda por proveedor: RNC, actividad económica declarada, fecha de inicio
de operaciones, estado y régimen de pago. Diez archivos por el último dígito
del RPE, para que una ficha lea ~1/10 del total.

Uso:
    python3 scripts/build-rnc.py                  # descarga las dos fuentes
    python3 scripts/build-rnc.py --local DIR      # usa proveedores.csv y rnc.zip ya bajados en DIR
"""
import csv
import datetime
import io
import json
import pathlib
import re
import sys
import time
import urllib.request
import zipfile

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "data" / "rnc"
UA = "Socratico-Inteligencia/1.0 (cruce de proveedores con el padron RNC; herramienta independiente)"
URL_RPE = ("https://datosabiertos.dgcp.gob.do/api-dgcp/v1/tablas/proveedores"
           "?Type=csv&inhabilitados=false")
URL_DGII = "https://dgii.gov.do/app/WebApps/Consultas/RNC/RNC_CONTRIBUYENTES.zip"


def bajar(url: str, tipos: tuple[str, ...]) -> tuple[bytes, str]:
    for intento in (1, 2):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=300) as r:
                tipo = r.headers.get("content-type", "")
                if not any(t in tipo for t in tipos):
                    raise RuntimeError(f"{url}: content-type inesperado «{tipo}»")
                return r.read(), r.headers.get("last-modified", "")
        except Exception as e:  # noqa: BLE001 — un reintento y fuera
            if intento == 2:
                raise
            print(f"  reintento: {e}", file=sys.stderr)
            time.sleep(10)
    raise AssertionError


def fecha_iso(v: str):
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", (v or "").strip())
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


MESES = {m: i + 1 for i, m in enumerate(
    ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"])}


def corte_iso(m):
    """«…_Actualizado_19_Sep_2026.csv» → 2026-09-19 (el nombre del archivo es el corte)."""
    if not m or m.group(2).lower()[:3] not in MESES:
        return None
    return f"{m.group(3)}-{MESES[m.group(2).lower()[:3]]:02d}-{int(m.group(1)):02d}"


def main() -> None:
    local = None
    if "--local" in sys.argv:
        local = pathlib.Path(sys.argv[sys.argv.index("--local") + 1])

    if local:
        crudo_rpe = (local / "proveedores.csv").read_bytes()
        crudo_zip, lm_dgii = (local / "rnc.zip").read_bytes(), ""
    else:
        crudo_rpe, _ = bajar(URL_RPE, ("text/csv",))
        crudo_zip, lm_dgii = bajar(URL_DGII, ("zip",))

    # 1. RPE → RNC (solo esas tres columnas; el resto se descarta al leer).
    rpe_rnc: dict[str, str] = {}
    total_rpe = 0
    for f in csv.DictReader(io.StringIO(crudo_rpe.decode("utf-8-sig"))):
        total_rpe += 1
        doc = re.sub(r"\D", "", f.get("NUMERO_DOCUMENTO") or "")
        if f.get("TIPO_DOCUMENTO") == "RNC" and len(doc) == 9 and f.get("RPE", "").isdigit():
            rpe_rnc[f["RPE"]] = doc
    del crudo_rpe
    rnc_buscados = set(rpe_rnc.values())

    # 2. Padrón de la DGII, solo las filas de esos RNC.
    z = zipfile.ZipFile(io.BytesIO(crudo_zip))
    nombre = z.infolist()[0].filename
    corte = re.search(r"(\d{1,2})_(\w{3})_(\d{4})", nombre)
    texto = z.read(nombre).decode("cp1252", errors="replace")
    padron = {}
    total_padron = 0
    for fila in csv.reader(io.StringIO(texto)):
        if not fila or fila[0] == "RNC" or len(fila) < 6:
            continue
        total_padron += 1
        rnc = fila[0].strip()
        if rnc in rnc_buscados:
            padron[rnc] = (
                re.sub(r"\s+", " ", fila[2]).strip(),
                fecha_iso(fila[3]),
                fila[4].strip(),
                fila[5].strip(),
            )
    del texto

    # 3. Diez archivos por el último dígito del RPE, con diccionario propio.
    SALIDA.mkdir(parents=True, exist_ok=True)
    meta = {
        "generado": datetime.date.today().isoformat(),
        "archivoDgii": nombre,
        "corteDgii": corte_iso(corte),
        "modificadoDgii": lm_dgii,
        "proveedores": total_rpe,
        "conRnc": len(rpe_rnc),
        "enPadron": 0,
        "padron": total_padron,
    }
    fragmentos = {str(d): {"actividades": [], "estados": [], "filas": {}} for d in range(10)}
    indices = {d: ({}, {}) for d in fragmentos}
    for rpe, rnc in rpe_rnc.items():
        p = padron.get(rnc)
        if not p:
            continue
        meta["enPadron"] += 1
        d = rpe[-1]
        frag, (ia, ie) = fragmentos[d], indices[d]
        act, inicio, estado, regimen = p
        if act not in ia:
            ia[act] = len(frag["actividades"]); frag["actividades"].append(act)
        est = f"{estado}|{regimen}"
        if est not in ie:
            ie[est] = len(frag["estados"]); frag["estados"].append(est)
        frag["filas"][rpe] = [rnc, ia[act], inicio, ie[est]]

    for d, frag in fragmentos.items():
        (SALIDA / f"{d}.json").write_text(
            json.dumps({**meta, **frag}, ensure_ascii=False, separators=(",", ":")))
    (SALIDA / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))

    peso = sum((SALIDA / f"{d}.json").stat().st_size for d in fragmentos) // 1024
    print(f"{total_rpe} proveedores en el RPE · {len(rpe_rnc)} con RNC de 9 dígitos · "
          f"{meta['enPadron']} en el padrón de la DGII ({total_padron} contribuyentes, {nombre})")
    print(f"→ {SALIDA}/0..9.json ({peso} KB en total)")


if __name__ == "__main__":
    main()
