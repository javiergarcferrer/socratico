#!/usr/bin/env python3
"""Genera public/data/senales.json: las señales de las compras públicas, por
proveedor y por institución, calculadas sobre el registro entero de la DGCP.

Una señal es un patrón que el registro deja ver y que merece revisión; no es
una acusación ni un hallazgo de irregularidad. Cada regla es cerrada, se
escribe aquí con su umbral, y cada señal lleva las cifras con que se cumple
para que el lector la compruebe en su ficha. Nunca se combina en una
puntuación: cinco reglas no hacen un juicio.

Lee, sin clave (docs/INFRAESTRUCTURA.md §5.1):

- `…/api-dgcp/v1/tablas/contratos?Type=csv` y `…/tablas/procesos?Type=csv`,
  las mismas tablas de `scripts/build-historico.py`, con su misma regla de
  contrato → institución por el prefijo del código (>95 % de los procesos);
- `public/data/sanciones.json` (`scripts/build-sanciones.py`): las medidas de
  la DGCP sobre cada RPE, con sus fechas;
- `public/data/rnc/{0..9}.json` (`scripts/build-rnc.py`): el inicio de
  operaciones y el estado de cada proveedor persona jurídica en el padrón de
  la DGII;
- `…/tablas/proveedores?Type=csv&inhabilitados=false`, el Registro de
  Proveedores entero, del que se leen **solo** `RPE`, `TIPO_PERSONA` y
  `FORMA_JURIDICA`: el archivo trae teléfonos, correos y contactos, y nada de
  eso se lee. `fisica` marca a la persona natural, cuya fila no se ofrece a
  los buscadores (Ley 172-13), como en el directorio de medidas.

Como en el histórico, se cuentan solo contratos en pesos, no cancelados y por
debajo de RD$10 mil millones (los atípicos).

Las reglas, por proveedor:

- `medida`: contratos adjudicados mientras regía una medida de la DGCP que le
  impide venderle al Estado (inhabilitación, suspensión o cancelación de
  oficio, prohibición por cargo público, proceso o condena penal). La medida
  rige desde la fecha más tardía con que la DGCP la registró (la misma
  resolución sale a veces dos veces con fechas distintas) hasta su fecha de
  habilitación o el primer levantamiento posterior. Una medida sin fecha de
  fin sobre un registro que hoy está «Activo» no se usa: no se sabe cuándo
  terminó, y se calla antes que adivinar.
- `nueva`: una empresa (no un consorcio, que nace para una licitación: lo
  dice la forma jurídica del Registro de Proveedores o su razón social) que
  recibió su primer contrato a menos de `DIAS_NUEVA` días de iniciar
  operaciones ante la DGII y sumó RD$`MONTO_NUEVA` o más en los doce meses
  siguientes.
- `padron`: una empresa que el padrón de la DGII da en suspensión, de baja o
  en cese temporal a su corte, con contratos adjudicados en los doce meses
  anteriores a ese corte. El padrón dice el estado de hoy, no desde cuándo.

Por institución (unidad de compra):

- `concentracion`: desde el 1 de enero de `DESDE_CONCENTRACION`, un solo
  proveedor se lleva el `PCT_CONCENTRACION` % o más de lo que contrató, sobre
  un total de RD$`MONTO_CONCENTRACION` o más.
- `excepcion`: en los doce meses de procesos publicados hasta el corte, el
  `PCT_EXCEPCION` % o más del monto estimado va por una vía de excepción
  (proveedor único, urgencia, emergencia, exclusividad…), sobre un total de
  RD$`MONTO_EXCEPCION` o más. Se publica también la mediana del país.

Uso:
    python3 scripts/build-senales.py              # descarga las dos tablas
    python3 scripts/build-senales.py --local DIR  # usa contratos.csv, procesos.csv y proveedores.csv de DIR
"""
import collections
import csv
import datetime
import importlib.util
import io
import json
import pathlib
import re
import statistics
import sys
import time

RAIZ = pathlib.Path(__file__).resolve().parent.parent
DATOS = RAIZ / "public" / "data"
SALIDA = DATOS / "senales.json"

_spec = importlib.util.spec_from_file_location("historico", RAIZ / "scripts" / "build-historico.py")
historico = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(historico)

ATIPICO = historico.ATIPICO

# Medidas que impiden venderle al Estado mientras rigen (lib/medidas.ts).
IMPIDEN = {
    "inhabilitacion-permanente", "inhabilitacion-temporal", "inhabilitacion",
    "prohibicion", "penal", "vinculo", "condena", "suspension", "cancelacion",
}
DIAS_NUEVA = 365
MONTO_NUEVA = 10_000_000
DESDE_CONCENTRACION = 2023
PCT_CONCENTRACION = 50
MONTO_CONCENTRACION = 50_000_000
PCT_EXCEPCION = 50
MONTO_EXCEPCION = 100_000_000
INACTIVOS = {"SUSPENDIDO", "DADO DE BAJA", "CESE TEMPORAL"}
URL_RPE = f"{historico.BASE}/proveedores?Type=csv&inhabilitados=false"
CONSORCIO = re.compile(r"\b(consorcio|joint venture|uni[oó]n temporal)\b", re.I)


def dia(s: str) -> str:
    s = (s or "")[:10]
    return s if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s) else ""


def menos_dias(iso: str, n: int) -> str:
    return (datetime.date.fromisoformat(iso) - datetime.timedelta(days=n)).isoformat()


def ventanas_de_medida(p: dict) -> list[dict]:
    """Los intervalos [desde, hasta) en que una medida impedía vender."""
    eventos = sorted(p["eventos"], key=lambda e: e["fecha"] or "")
    levantamientos = [e["fecha"] for e in eventos if e["tipo"] == "levantamiento" and e["fecha"]]
    # La misma medida registrada dos veces: se toma la fecha más tardía.
    medidas: dict[tuple, dict] = {}
    for e in eventos:
        if e["tipo"] not in IMPIDEN or not e["fecha"]:
            continue
        desde = max(e["fecha"], e.get("fechaResolucion") or "")
        clave = (e["tipo"], e.get("resolucion") or e["motivo"])
        if clave not in medidas or desde > medidas[clave]["desde"]:
            medidas[clave] = {"tipo": e["tipo"], "desde": desde, "hasta": e["hasta"]}
    ventanas = []
    for m in medidas.values():
        fin = m["hasta"]
        posteriores = [f for f in levantamientos if f > m["desde"]]
        if posteriores:
            fin = min(fin or "9999-12-31", posteriores[0])
        if not fin:
            if p["estadoRpe"] == "Activo":
                continue
            fin = None
        if fin and fin <= m["desde"]:
            continue
        ventanas.append({**m, "hasta": fin})
    return ventanas


def main() -> None:
    if "--local" in sys.argv:
        d = pathlib.Path(sys.argv[sys.argv.index("--local") + 1])
        t_contratos = (d / "contratos.csv").read_text("utf-8", "replace")
        t_procesos = (d / "procesos.csv").read_text("utf-8", "replace")
        t_rpe = (d / "proveedores.csv").read_text("utf-8", "replace")
    else:
        print("Descargando procesos…", file=sys.stderr)
        t_procesos = historico.bajar(historico.URL_PROCESOS)
        time.sleep(3)
        print("Descargando contratos…", file=sys.stderr)
        t_contratos = historico.bajar(historico.URL_CONTRATOS)
        time.sleep(3)
        print("Descargando el Registro de Proveedores…", file=sys.stderr)
        t_rpe = historico.bajar(URL_RPE)

    consorcios: set[str] = set()
    fisicas: set[str] = set()
    for r in csv.DictReader(io.StringIO(t_rpe)):
        rpe = (r.get("RPE") or "").strip()
        if (r.get("FORMA_JURIDICA") or "").strip().lower() == "consorcio":
            consorcios.add(rpe)
        if (r.get("TIPO_PERSONA") or "").strip().lower() == "persona natural":
            fisicas.add(rpe)
    del t_rpe
    if len(consorcios) < 100 or len(fisicas) < 10_000:
        sys.exit(f"Registro de Proveedores incompleto ({len(consorcios)} consorcios, {len(fisicas)} personas naturales): no se escribe.")

    sanciones = json.loads((DATOS / "sanciones.json").read_text("utf-8"))
    padron: dict[str, tuple[str, str]] = {}
    corte_padron = ""
    for n in range(10):
        f = json.loads((DATOS / "rnc" / f"{n}.json").read_text("utf-8"))
        corte_padron = f["corteDgii"]
        for rpe, (_rnc, _act, inicio, estado) in f["filas"].items():
            padron[rpe] = (dia(inicio or ""), f["estados"][estado].split("|")[0])

    # ── Procesos: prefijo → unidad, nombres, y excepciones de doce meses ──
    por_prefijo: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    nombre_uc: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    procesos = []
    corte_procesos = ""
    for r in csv.DictReader(io.StringIO(t_procesos)):
        codigo = r.get("CODIGO_PROCESO") or ""
        uc = (r.get("CODIGO_UNIDAD_COMPRA") or "").strip()
        if not codigo or not uc.isdigit():
            continue
        por_prefijo[codigo.split("-")[0]][uc] += 1
        nombre_uc[uc][(r.get("UNIDAD_COMPRA") or "").strip()] += 1
        fecha = dia(r.get("FECHA_PUBLICACION") or "")
        if not fecha or fecha > datetime.date.today().isoformat():
            continue
        corte_procesos = max(corte_procesos, fecha)
        if (r.get("MONEDA") or "").strip() != "DOP" or (r.get("ESTADO_PROCESO") or "").strip() == "Cancelado":
            continue
        excepcion = (r.get("MODALIDAD") or "").strip() == "Procesos de Excepción" or (
            (r.get("TIPO_EXCEPCION") or "").strip() not in ("", "Proceso ordinario"))
        procesos.append((uc, fecha, historico.num(r.get("MONTO_ESTIMADO", "")), excepcion))
    prefijo_uc = {}
    for p, c in por_prefijo.items():
        uc, n = c.most_common(1)[0]
        if n / sum(c.values()) > 0.95:
            prefijo_uc[p] = uc
    nombres = {uc: c.most_common(1)[0][0] for uc, c in nombre_uc.items()}

    # ── Contratos ──
    contratos: dict[str, list[tuple[str, float]]] = collections.defaultdict(list)
    razon: dict[str, str] = {}
    por_inst: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    corte = ""
    n_contratos = 0
    for r in csv.DictReader(io.StringIO(t_contratos)):
        n_contratos += 1
        if (r.get("ESTADO_CONTRATO") or "").strip() in historico.EXCLUIDOS:
            continue
        if (r.get("MONEDA") or "").strip() != "DOP":
            continue
        fecha = dia(r.get("FECHA_ADJUDICACION") or r.get("FECHA_CREACION_CONTRATO") or "")
        if not fecha or fecha < "2015":
            continue
        valor = historico.num(r.get("VALOR_CONTRATADO", ""))
        if valor >= ATIPICO:
            continue
        corte = max(corte, fecha)
        rpe = (r.get("RPE") or "").strip()
        if not rpe.isdigit():
            continue
        contratos[rpe].append((fecha, valor))
        razon[rpe] = " ".join((r.get("RAZON_SOCIAL") or "").split())
        codigo = (r.get("CODIGO_CONTRATO") or "").strip()
        uc = None if codigo.startswith("DO1.") else prefijo_uc.get(codigo.split("-")[0])
        if uc and fecha >= f"{DESDE_CONCENTRACION}-01-01":
            por_inst[uc][rpe] += valor

    if n_contratos < 500_000 or len(procesos) < 100_000:
        sys.exit(f"Tablas incompletas ({n_contratos} contratos, {len(procesos)} procesos): no se escribe.")
    if len(padron) < 50_000 or len(sanciones["proveedores"]) < 1_000:
        sys.exit("Padrón o medidas incompletos: corre antes build-rnc.py y build-sanciones.py.")

    proveedores: dict[str, dict] = {}

    def senal(rpe: str, s: dict) -> None:
        proveedores.setdefault(rpe, {"nombre": razon.get(rpe, ""), "fisica": rpe in fisicas, "senales": []})["senales"].append(s)

    # medida
    for p in sanciones["proveedores"]:
        rpe = p["rpe"]
        for v in ventanas_de_medida(p):
            dentro = [(f, m) for f, m in contratos.get(rpe, [])
                      if f > v["desde"] and (v["hasta"] is None or f < v["hasta"])]
            if dentro:
                senal(rpe, {
                    "tipo": "medida", "medida": v["tipo"], "desde": v["desde"], "hasta": v["hasta"],
                    "contratos": len(dentro), "monto": round(sum(m for _, m in dentro)),
                    "primero": min(f for f, _ in dentro), "ultimo": max(f for f, _ in dentro),
                })

    # nueva y padrón
    desde_padron = menos_dias(corte_padron, 365)
    for rpe, cs in contratos.items():
        if rpe not in padron:
            continue
        inicio, estado = padron[rpe]
        primero = min(f for f, _ in cs)
        if inicio and rpe not in consorcios and not CONSORCIO.search(razon.get(rpe, "")):
            dias = (datetime.date.fromisoformat(primero) - datetime.date.fromisoformat(inicio)).days
            if 0 <= dias < DIAS_NUEVA:
                hasta = (datetime.date.fromisoformat(primero) + datetime.timedelta(days=365)).isoformat()
                anio = [(f, m) for f, m in cs if f < hasta]
                monto = sum(m for _, m in anio)
                if monto >= MONTO_NUEVA:
                    senal(rpe, {"tipo": "nueva", "inicio": inicio, "primero": primero, "dias": dias,
                                "contratos": len(anio), "monto": round(monto)})
        if estado in INACTIVOS:
            recientes = [(f, m) for f, m in cs if desde_padron <= f <= corte_padron]
            if recientes:
                senal(rpe, {"tipo": "padron", "estado": estado.capitalize(), "contratos": len(recientes),
                            "monto": round(sum(m for _, m in recientes)),
                            "ultimo": max(f for f, _ in recientes)})

    instituciones: dict[str, dict] = {}

    def senal_inst(uc: str, s: dict) -> None:
        instituciones.setdefault(uc, {"nombre": nombres.get(uc, ""), "senales": []})["senales"].append(s)

    # concentración
    for uc, c in por_inst.items():
        total = sum(c.values())
        rpe, mayor = c.most_common(1)[0]
        if total >= MONTO_CONCENTRACION and 100 * mayor / total >= PCT_CONCENTRACION:
            senal_inst(uc, {"tipo": "concentracion", "rpe": rpe, "proveedor": razon.get(rpe, ""), "fisica": rpe in fisicas,
                            "pct": round(100 * mayor / total, 1), "monto": round(mayor), "total": round(total),
                            "proveedores": len(c), "desde": f"{DESDE_CONCENTRACION}-01-01"})

    # excepción
    desde_exc = menos_dias(corte_procesos, 365)
    exc: dict[str, list] = collections.defaultdict(lambda: [0.0, 0.0, 0, 0])
    for uc, fecha, monto, excepcion in procesos:
        if fecha <= desde_exc:
            continue
        e = exc[uc]
        e[0] += monto
        e[2] += 1
        if excepcion:
            e[1] += monto
            e[3] += 1
    elegibles = {uc: e for uc, e in exc.items() if e[0] >= MONTO_EXCEPCION}
    mediana = statistics.median(e[1] / e[0] for e in elegibles.values()) if elegibles else 0
    for uc, e in elegibles.items():
        if 100 * e[1] / e[0] >= PCT_EXCEPCION:
            senal_inst(uc, {"tipo": "excepcion", "pct": round(100 * e[1] / e[0], 1), "monto": round(e[1]),
                            "total": round(e[0]), "procesos": e[3], "deProcesos": e[2],
                            "desde": desde_exc, "hasta": corte_procesos})

    salida = {
        "generado": datetime.date.today().isoformat(),
        "corte": corte,
        "corteProcesos": corte_procesos,
        "cortePadron": corte_padron,
        "corteMedidas": sanciones["fuentes"]["dgcp"]["corte"],
        "fuentes": [historico.URL_CONTRATOS, historico.URL_PROCESOS],
        "reglas": {
            "diasNueva": DIAS_NUEVA, "montoNueva": MONTO_NUEVA,
            "desdeConcentracion": f"{DESDE_CONCENTRACION}-01-01", "pctConcentracion": PCT_CONCENTRACION,
            "montoConcentracion": MONTO_CONCENTRACION, "pctExcepcion": PCT_EXCEPCION,
            "montoExcepcion": MONTO_EXCEPCION, "medianaExcepcion": round(100 * mediana, 1),
            "institucionesExcepcion": len(elegibles), "atipico": ATIPICO,
        },
        "proveedores": proveedores,
        "instituciones": instituciones,
    }
    SALIDA.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")))
    cuenta = collections.Counter(s["tipo"] for v in [*proveedores.values(), *instituciones.values()] for s in v["senales"])
    print(f"{len(proveedores)} proveedores y {len(instituciones)} instituciones con señales: {dict(cuenta)}; "
          f"corte {corte}, procesos {corte_procesos}, padrón {corte_padron}", file=sys.stderr)


if __name__ == "__main__":
    main()
