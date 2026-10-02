#!/usr/bin/env python3
"""Genera public/data/obras.json: la inversión pública proyecto a proyecto,
unida a sus procesos de compra, sus contratos y su territorio.

Fuente: los datos abiertos de MapaInversiones (Ministerio de Hacienda y
Economía, sobre el Banco de Proyectos del SNIP y la DGCP), descarga directa y
sin clave desde https://mapainversiones.gob.do/DatosAbiertos
(docs/INFRAESTRUCTURA.md §5.9). Cuatro de sus quince CSV:

- `DatosAbiertosProyectosDeInversion.csv` (~4 MB): el proyecto, con su código
  SNIP, estado, valor, sector, entidad ejecutora y avance.
- `DatosAbiertosProyectosDeInversionXTerritorio.csv` (~7 MB): una fila por
  proyecto y municipio; de aquí salen las provincias.
- `DatosAbiertosProcesosXProyectosInv.csv` (~2 MB): procesos de compra por SNIP.
- `DatosAbiertosContratosXProyectosInv.csv` (~8 MB): contratos por SNIP, con el
  RPE del proveedor (`CodigoProveedor`, verificado contra la DGCP).

Son ~21 MB: no se bajan por request. Se consolidan aquí en dos archivos (`obras.json`,
el listado; `obras-detalle.json`, contratos y procesos por obra), recortados
a lo que la plataforma muestra —sin el objetivo largo del proyecto, con los 12 contratos y
procesos de mayor monto por obra y el total de todos—, y `lib/obras.ts` sirve
el resultado con la fecha de corte que declara la fuente.

Hallazgo que la interfaz dice en voz alta: en la fuente, `AvanceFisico` y
`AvanceFinanciero` traen **el mismo número en todos los proyectos** (3,611 de
3,611 el 2026-09-23). No se muestran como dos medidas: se muestra un «avance
declarado» y se explica por qué.

La entidad ejecutora se ata a la unidad de compra de la DGCP
(`public/data/instituciones.json`) por nombre normalizado, más la tabla
`EJECUTORAS` de abajo, curada a mano solo donde la correspondencia es
inequívoca. Lo que no casa queda sin institución, no adivinado.

Uso:
    python3 scripts/build-obras.py                # baja los cuatro CSV y genera
    python3 scripts/build-obras.py --local DIR    # usa CSV ya bajados en DIR
"""
import collections
import csv
import datetime
import io
import json
import pathlib
import re
import sys
import time
import unicodedata
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "data" / "obras.json"
# Los contratos y procesos de cada obra van aparte: el listado no los necesita
# y así no carga 2 MB que solo usa la ficha.
DETALLE = RAIZ / "public" / "data" / "obras-detalle.json"
BASE = "https://mapainversiones.gob.do/opendata/"
UA = "Socratico-Inteligencia/1.0 (instantanea de obras publicas; herramienta independiente)"
ARCHIVOS = {
    "proyectos": "DatosAbiertosProyectosDeInversion.csv",
    "territorio": "DatosAbiertosProyectosDeInversionXTerritorio.csv",
    "procesos": "DatosAbiertosProcesosXProyectosInv.csv",
    "contratos": "DatosAbiertosContratosXProyectosInv.csv",
}
TOPE_LISTA = 12

# Entidad ejecutora (tal como la escribe MapaInversiones) → unidad de compra DGCP.
# Solo las que el nombre normalizado no resuelve y cuya identidad es inequívoca.
# «Dirección de Desarrollo Provincial» queda fuera: el catálogo de la DGCP no
# tiene una unidad con ese nombre y no se adivina.
EJECUTORAS = {
    "COMISION PRESIDENCIAL DE APOYO AL DESARROLLO PROVINCIAL": 209,
    "COMITÉ EJECUTOR DE INFRAESTRUCTURA EN ZONAS TURÍSTICAS (CEIZTUR)": 589,
    "MINISTERIO DE DEPORTES Y RECREACION": 225,
    "CORPORACIÓN DEL ACUEDUCTO Y ALCANTARILLADO DE LA VEGA": 712,
    "MINISTERIO DE ECONOMIA, PLANIF. Y DESARROLLO": 131,
    "OFICINA NACIONAL DE ESTADISTICA": 218,
    "GABINETE DE POLITICAS SOCIALES": 178,
    "MINISTERIO  DE MEDIO AMBIENTE Y RECURSOS NATURALES": 260,
}

ESTADOS = {
    "EJECUCIÓN": "En ejecución",
    "PARALIZADO": "Paralizado",
    "REEVALUACION": "En reevaluación",
    "REPROGRAMAR": "Por reprogramar",
}


def normalizar(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    s = re.sub(r"\bdir\b", "direccion", s)
    s = re.sub(r"\bgral\b", "general", s)
    s = re.sub(r"\b(de|del|la|las|los|el|y|e|para)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def titular(s: str) -> str:
    """«SANTO DOMINGO» → «Santo Domingo», con las palabras menudas en minúscula."""
    menudas = {"de", "del", "la", "las", "los", "el", "y", "e"}
    partes = (s or "").strip().lower().split()
    return " ".join(p if (i and p in menudas) else p[:1].upper() + p[1:] for i, p in enumerate(partes))


def bajar(nombre: str) -> tuple[bytes, str]:
    url = BASE + nombre
    for intento in (1, 2):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=180) as r:
                tipo = r.headers.get("content-type", "")
                if "csv" not in tipo:
                    raise RuntimeError(f"{nombre}: content-type inesperado «{tipo}»")
                return r.read(), r.headers.get("last-modified", "")
        except Exception as e:  # noqa: BLE001 — un reintento y fuera
            if intento == 2:
                raise
            print(f"  reintento {nombre}: {e}", file=sys.stderr)
            time.sleep(5)
    raise AssertionError


def leer(crudo: bytes) -> list[dict]:
    return list(csv.DictReader(io.StringIO(crudo.decode("utf-8-sig"))))


def num(v: str) -> float:
    try:
        return float(v or 0)
    except ValueError:
        return 0.0


def main() -> None:
    local = None
    if "--local" in sys.argv:
        local = pathlib.Path(sys.argv[sys.argv.index("--local") + 1])
    tablas, modificado = {}, {}
    for clave, nombre in ARCHIVOS.items():
        if local:
            tablas[clave] = leer((local / nombre).read_bytes())
            modificado[clave] = ""
        else:
            crudo, lm = bajar(nombre)
            tablas[clave] = leer(crudo)
            modificado[clave] = lm
        print(f"{nombre}: {len(tablas[clave])} filas")

    instituciones = json.loads((RAIZ / "public" / "data" / "instituciones.json").read_text())["instituciones"]
    por_nombre = collections.defaultdict(list)
    for i in instituciones:
        por_nombre[normalizar(i["nombre"])].append(i["id"])

    def unidad(entidad: str):
        if entidad in EJECUTORAS:
            return EJECUTORAS[entidad]
        ids = por_nombre.get(normalizar(entidad), [])
        return ids[0] if len(ids) == 1 else None

    # Territorio: provincias distintas por SNIP. «NACIONALES» es alcance nacional.
    provincias = collections.defaultdict(set)
    nacional = set()
    for t in tablas["territorio"]:
        snip = t["CodigoSNIP"].strip()
        if t["IdRegion"].strip() == "00" or t["NombreMunicipio"].strip().upper() == "NACIONALES":
            nacional.add(snip)
            continue
        if t["NombreDepartamento"].strip():
            provincias[snip].add(titular(t["NombreDepartamento"]))

    procesos = collections.defaultdict(list)
    for r in tablas["procesos"]:
        procesos[r["CodigoSnip"].strip()].append({
            "codigo": r["CodigoProceso"].strip(),
            "descripcion": (r["DescripcionProceso"] or r["Caratula"]).strip()[:140],
            "estado": r["EstadoProceso"].strip(),
            "modalidad": r["Modalidad"].strip(),
            "monto": round(num(r["MontoEstimado"]), 2),
        })

    contratos = collections.defaultdict(list)
    for c in tablas["contratos"]:
        contratos[c["CodigoSnip"].strip()].append({
            "codigo": c["CodigoContrato"].strip(),
            "proceso": c["CodigoProceso"].strip(),
            "descripcion": c["DescripcionContrato"].strip()[:140],
            "estado": c["EstadoContrato"].strip(),
            "monto": round(num(c["ValorContrato"]), 2),
            "rpe": c["CodigoProveedor"].strip(),
            "proveedor": c["Proveedor"].strip(),
        })

    VIGENTES = {"Activo", "Cerrado", "Modificado"}
    salida, vistos, corte = [], set(), ""
    sin_unidad = collections.Counter()
    detalle = {}
    for p in tablas["proyectos"]:
        snip = p["CodigoSNIP"].strip()
        if not snip or snip in vistos:
            continue  # dos SNIP repetidos en la fuente: se queda el primero
        vistos.add(snip)
        corte = max(corte, p["FechaCorteFuente"][:10])
        cs = contratos.get(snip, [])
        ps = procesos.get(snip, [])
        vig = [c for c in cs if c["estado"] in VIGENTES]
        uc = unidad(p["EntidadEjecutora"])
        if uc is None:
            sin_unidad[p["EntidadEjecutora"]] += 1
        salida.append({
            "snip": snip,
            "id": p["IdProyecto"].strip(),
            "nombre": re.sub(r"\s+", " ", p["NombreProyecto"]).strip(),
            "estado": ESTADOS.get(p["EstadoProyecto"].strip(), titular(p["EstadoProyecto"])),
            "valor": round(num(p["ValorDelProyecto"]), 2),
            "avance": round(num(p["AvanceFisico"]), 2),
            "sector": p["NombreSector"].strip(),
            "entidad": titular(p["EntidadEjecutora"]),
            "uc": uc,
            "inicio": p["FechaInicioProyecto"][:10] or None,
            "fin": p["FechaFinProyecto"][:10] or None,
            "nacional": snip in nacional and not provincias.get(snip),
            "provincias": sorted(provincias.get(snip, set())),
            "nContratos": len(cs),
            "montoContratado": round(sum(c["monto"] for c in vig), 2),
            "proveedores": len({c["rpe"] for c in cs if c["rpe"]}),
            "nProcesos": len(ps),
        })
        if cs or ps:
            detalle[snip] = {
                "contratos": sorted(cs, key=lambda c: -c["monto"])[:TOPE_LISTA],
                "procesos": sorted(ps, key=lambda r: -r["monto"])[:TOPE_LISTA],
            }
    salida.sort(key=lambda o: -o["valor"])

    # Índice proceso → SNIP, para enlazar desde /procesos/[codigo] aunque la DGCP
    # no traiga el SNIP en el proceso. Todos los procesos, no solo los recortados.
    indice = collections.defaultdict(set)
    for snip, ps in procesos.items():
        for r in ps:
            indice[r["codigo"]].add(snip)
    for snip, cs in contratos.items():
        for c in cs:
            indice[c["proceso"]].add(snip)
    validos = {o["snip"] for o in salida}
    indice = {k: sorted(v & validos) for k, v in indice.items() if v & validos}

    doc = {
        "generado": datetime.date.today().isoformat(),
        "corte": corte,
        "fuente": "https://mapainversiones.gob.do/DatosAbiertos",
        "archivos": {k: {"nombre": v, "modificado": modificado[k], "filas": len(tablas[k])}
                     for k, v in ARCHIVOS.items()},
        "proyectos": salida,
        "procesos": indice,
    }
    SALIDA.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")))
    DETALLE.write_text(json.dumps({"corte": corte, "obras": detalle}, ensure_ascii=False, separators=(",", ":")))

    con_uc = sum(1 for o in salida if o["uc"])
    print(f"{len(salida)} proyectos · {con_uc} atados a una unidad de compra · "
          f"{sum(1 for o in salida if o['provincias'])} con provincia · "
          f"{sum(1 for o in salida if o['nContratos'])} con contratos · {len(indice)} procesos indexados")
    print("Ejecutoras sin unidad de compra (proyectos):", sin_unidad.most_common(8))
    print(f"→ {SALIDA} ({SALIDA.stat().st_size // 1024} KB), corte {corte}")
    print(f"→ {DETALLE} ({DETALLE.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
