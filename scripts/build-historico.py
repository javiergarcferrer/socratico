#!/usr/bin/env python3
"""Genera public/data/historico/: la historia entera de las compras públicas
desde 2015, agregada por año, por institución y por proveedor.

Dos descargas, sin clave, de la sección «Tablas» del portal de datos abiertos
de la DGCP (docs/INFRAESTRUCTURA.md §5.1, verificadas el 2026-09-24):

- `…/api-dgcp/v1/tablas/contratos?Type=csv` — ~115 MB, ~723 mil contratos
  desde 2015: código, estado, fecha de adjudicación, valor, moneda, objeto,
  RPE y razón social. **No trae la unidad de compra.**
- `…/api-dgcp/v1/tablas/procesos?Type=csv` — ~245 MB, ~631 mil procesos:
  código, unidad de compra, modalidad, excepción, estado, monto estimado y
  fecha de publicación.

Los parámetros de año y semestre que el portal pinta se **ignoran**: cada
tabla baja entera en una petición (3–6 s). Nunca se lee en una petición de
usuario: esto corre en build.

**Contrato → institución.** El código de contrato empieza por el prefijo de
la unidad de compra (`INFOTEP-2026-01420`), el mismo que abre los códigos de
sus procesos (`ITLA-DAF-CM-2026-0050`). El prefijo se resuelve contra la
tabla de procesos solo si un único código de unidad reúne más del 95 % de sus
procesos; así se asigna el 99.2 % de los contratos pero solo el ~91.5 % del
valor, porque el prefijo más grande que queda fuera es el del MOPC (lo
comparte con la OPRET: 82 % / 18 % de sus procesos). Los prefijos ambiguos y
los códigos viejos `DO1.PCCNTR.*` quedan «sin institución asignada», se
cuentan y se nombran (`sinAsignar`) con su monto: nunca se adivina.

**Lo que se suma.** Solo contratos en pesos (los ~270 en US$, € y £ se
cuentan aparte) y no cancelados. **Atípicos:** un contrato vigente o cerrado
de RD$10 mil millones o más no entra en ninguna suma y se lista con nombre y
apellido (13 el 2026-09-24, ~16 % del valor). Algunos parecen errores de
captura (RD$10,000,000,001 exactos por un servicio de Cultura); otros pueden
ser obras reales (la Autopista del Ámbar, la línea 2 del teleférico). Sin el
expediente no se distinguen: sumarlos podría dar la cifra creíble y falsa que
la plataforma no publica, y esconderlos callaría lo que el registro publica. Cada ficha de
institución y de proveedor dice además cuántos de los suyos quedaron fuera.

Sin teléfonos ni correos: estas tablas no los traen, y de todas formas no
se leerían (publicar no es exponer).

Uso:
    python3 scripts/build-historico.py              # descarga las dos tablas
    python3 scripts/build-historico.py --local DIR  # usa contratos.csv y procesos.csv de DIR
"""
import collections
import csv
import datetime
import io
import json
import pathlib
import sys
import time
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "data" / "historico"
UA = "Socratico-Inteligencia/1.0 (historico de compras publicas; herramienta independiente)"
BASE = "https://datosabiertos.dgcp.gob.do/api-dgcp/v1/tablas"
URL_CONTRATOS = f"{BASE}/contratos?Type=csv"
URL_PROCESOS = f"{BASE}/procesos?Type=csv"

ATIPICO = 10_000_000_000  # RD$10 mil millones
EXCLUIDOS = {"Cancelado"}
TOP_GLOBAL = 100
TOP_INSTITUCION = 12
TOP_CLIENTES = 8


def bajar(url: str) -> str:
    for intento in (1, 2):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=600) as r:
                tipo = r.headers.get("content-type", "")
                if "text/csv" not in tipo:
                    raise RuntimeError(f"{url}: content-type inesperado «{tipo}»")
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001 — un reintento y fuera
            if intento == 2:
                raise
            print(f"  reintento {url}: {e}", file=sys.stderr)
            time.sleep(10)
    raise AssertionError


def num(s: str) -> float:
    try:
        return float(s or 0)
    except ValueError:
        return 0.0


def main() -> None:
    if "--local" in sys.argv:
        d = pathlib.Path(sys.argv[sys.argv.index("--local") + 1])
        t_contratos = (d / "contratos.csv").read_text("utf-8", "replace")
        t_procesos = (d / "procesos.csv").read_text("utf-8", "replace")
    else:
        print("Descargando procesos…", file=sys.stderr)
        t_procesos = bajar(URL_PROCESOS)
        time.sleep(3)
        print("Descargando contratos…", file=sys.stderr)
        t_contratos = bajar(URL_CONTRATOS)

    # ── Procesos: prefijo → unidad, nombres de unidad, series por año ──
    por_prefijo: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    nombre_uc: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    proc_anio: dict[int, dict] = collections.defaultdict(
        lambda: {"n": 0, "excepcion": 0, "modalidades": collections.Counter()})
    proc_uc_anio: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    n_procesos = 0
    for r in csv.DictReader(io.StringIO(t_procesos)):
        codigo = r.get("CODIGO_PROCESO") or ""
        uc = (r.get("CODIGO_UNIDAD_COMPRA") or "").strip()
        if not codigo or not uc.isdigit():
            continue
        n_procesos += 1
        por_prefijo[codigo.split("-")[0]][uc] += 1
        nombre_uc[uc][(r.get("UNIDAD_COMPRA") or "").strip()] += 1
        anio = int((r.get("FECHA_PUBLICACION") or "0")[:4] or 0)
        if anio < 2015:
            continue
        a = proc_anio[anio]
        a["n"] += 1
        a["modalidades"][(r.get("MODALIDAD") or "Sin modalidad").strip()] += 1
        if (r.get("TIPO_EXCEPCION") or "").strip() not in ("", "Proceso ordinario"):
            a["excepcion"] += 1
        proc_uc_anio[uc][anio] += 1

    prefijo_uc: dict[str, str] = {}
    ambiguos = []
    for p, c in por_prefijo.items():
        uc, n = c.most_common(1)[0]
        if n / sum(c.values()) > 0.95:
            prefijo_uc[p] = uc
        else:
            ambiguos.append(p)
    nombres = {uc: c.most_common(1)[0][0] for uc, c in nombre_uc.items()}

    # ── Contratos ──
    anios: dict[int, dict] = collections.defaultdict(lambda: {"n": 0, "monto": 0.0, "sinUc": 0})
    inst: dict[str, dict] = collections.defaultdict(
        lambda: {"anios": collections.defaultdict(lambda: [0, 0.0]),
                 "prov": collections.defaultdict(lambda: [0, 0.0])})
    prov: dict[str, dict] = {}
    atipicos = []
    otras_monedas = collections.Counter()
    cancelados = 0
    sin_uc = 0
    sin_uc_monto = 0.0
    sin_asignar: dict[str, list] = collections.defaultdict(lambda: [0, 0.0])
    atip_uc: dict[str, list] = collections.defaultdict(lambda: [0, 0.0])
    atip_rpe: dict[str, list] = collections.defaultdict(lambda: [0, 0.0])
    corte = ""
    n_contratos = 0
    for r in csv.DictReader(io.StringIO(t_contratos)):
        n_contratos += 1
        estado = (r.get("ESTADO_CONTRATO") or "").strip()
        if estado in EXCLUIDOS:
            cancelados += 1
            continue
        moneda = (r.get("MONEDA") or "").strip()
        if moneda != "DOP":
            otras_monedas[moneda or "?"] += 1
            continue
        fecha = (r.get("FECHA_ADJUDICACION") or r.get("FECHA_CREACION_CONTRATO") or "")[:10]
        if len(fecha) != 10 or fecha[:4] < "2015":
            continue
        corte = max(corte, fecha)
        anio = int(fecha[:4])
        valor = num(r.get("VALOR_CONTRATADO", ""))
        codigo = (r.get("CODIGO_CONTRATO") or "").strip()
        uc = prefijo_uc.get(codigo.split("-")[0]) if not codigo.startswith("DO1.") else None
        rpe = (r.get("RPE") or "").strip()
        razon = " ".join((r.get("RAZON_SOCIAL") or "").split())
        if valor >= ATIPICO:
            if uc:
                atip_uc[uc][0] += 1
                atip_uc[uc][1] += valor
            if rpe.isdigit():
                atip_rpe[rpe][0] += 1
                atip_rpe[rpe][1] += valor
            atipicos.append({
                "codigo": codigo, "fecha": fecha, "valor": round(valor), "estado": estado,
                "rpe": rpe or None, "proveedor": razon, "uc": int(uc) if uc else None,
                "institucion": nombres.get(uc) if uc else None,
            })
            continue
        a = anios[anio]
        a["n"] += 1
        a["monto"] += valor
        if uc:
            i = inst[uc]
            i["anios"][anio][0] += 1
            i["anios"][anio][1] += valor
            if rpe:
                i["prov"][rpe][0] += 1
                i["prov"][rpe][1] += valor
        else:
            a["sinUc"] += 1
            sin_uc += 1
            sin_uc_monto += valor
            sp = sin_asignar["DO1 (códigos antiguos)" if codigo.startswith("DO1.") else codigo.split("-")[0]]
            sp[0] += 1
            sp[1] += valor
        if rpe.isdigit():
            p = prov.get(rpe)
            if p is None:
                p = prov[rpe] = {"nombre": razon, "anios": collections.defaultdict(lambda: [0, 0.0]),
                                 "clientes": collections.defaultdict(lambda: [0, 0.0]),
                                 "desde": fecha, "hasta": fecha}
            p["anios"][anio][0] += 1
            p["anios"][anio][1] += valor
            p["desde"] = min(p["desde"], fecha)
            if fecha >= p["hasta"]:
                p["hasta"] = fecha
                if razon:
                    p["nombre"] = razon  # la razón social más reciente
            if uc:
                p["clientes"][uc][0] += 1
                p["clientes"][uc][1] += valor

    if n_contratos < 500_000 or n_procesos < 500_000:
        sys.exit(f"Tablas incompletas ({n_contratos} contratos, {n_procesos} procesos): no se escribe.")

    def total(d):
        return sum(v[1] for v in d.values()), sum(v[0] for v in d.values())

    generado = datetime.date.today().isoformat()
    SALIDA.mkdir(parents=True, exist_ok=True)
    (SALIDA / "proveedores").mkdir(exist_ok=True)

    top_prov = sorted(prov.items(), key=lambda kv: -total(kv[1]["anios"])[0])[:TOP_GLOBAL]
    top_inst = sorted(inst.items(), key=lambda kv: -total(kv[1]["anios"])[0])[:TOP_GLOBAL]
    resumen = {
        "generado": generado,
        "corte": corte,
        "fuentes": [URL_CONTRATOS, URL_PROCESOS],
        "contratosLeidos": n_contratos,
        "procesosLeidos": n_procesos,
        "cancelados": cancelados,
        "otrasMonedas": dict(otras_monedas),
        "sinInstitucion": sin_uc,
        "sinInstitucionMonto": round(sin_uc_monto),
        "sinAsignar": [
            {"prefijo": k, "contratos": v[0], "monto": round(v[1]),
             "unidades": [nombres.get(u, u) for u, _ in por_prefijo.get(k, collections.Counter()).most_common(3)]}
            for k, v in sorted(sin_asignar.items(), key=lambda kv: -kv[1][1])[:10]
        ],
        "prefijosAmbiguos": sorted(ambiguos),
        "umbralAtipico": ATIPICO,
        "anios": [
            {"anio": y, "contratos": anios[y]["n"], "monto": round(anios[y]["monto"]),
             "procesos": proc_anio[y]["n"] if y in proc_anio else 0,
             "excepcion": proc_anio[y]["excepcion"] if y in proc_anio else 0,
             "modalidades": dict(proc_anio[y]["modalidades"].most_common(8)) if y in proc_anio else {}}
            for y in sorted(set(anios) | set(proc_anio))
        ],
        "proveedores": [
            {"rpe": rpe, "nombre": p["nombre"], "monto": round(total(p["anios"])[0]),
             "contratos": total(p["anios"])[1], "desde": p["desde"], "hasta": p["hasta"]}
            for rpe, p in top_prov
        ],
        "instituciones": [
            {"uc": int(uc), "nombre": nombres.get(uc, ""), "monto": round(total(i["anios"])[0]),
             "contratos": total(i["anios"])[1]}
            for uc, i in top_inst
        ],
        "atipicos": sorted(atipicos, key=lambda a: -a["valor"]),
    }
    (SALIDA / "resumen.json").write_text(json.dumps(resumen, ensure_ascii=False, separators=(",", ":")))

    # Por institución: serie anual [año, contratos, monto, procesos] y sus
    # principales proveedores [rpe, nombre, contratos, monto].
    por_inst = {}
    for uc in set(inst) | set(proc_uc_anio) | set(atip_uc):
        i = inst.get(uc)
        ys = sorted(set(i["anios"] if i else []) | set(proc_uc_anio.get(uc, {})))
        serie = [[y, i["anios"][y][0] if i and y in i["anios"] else 0,
                  round(i["anios"][y][1]) if i and y in i["anios"] else 0,
                  proc_uc_anio.get(uc, {}).get(y, 0)] for y in ys]
        top = sorted(i["prov"].items(), key=lambda kv: -kv[1][1])[:TOP_INSTITUCION] if i else []
        por_inst[uc] = {
            "nombre": nombres.get(uc, ""),
            "serie": serie,
            "top": [[rpe, prov[rpe]["nombre"] if rpe in prov else "", v[0], round(v[1])] for rpe, v in top],
            "proveedores": len(i["prov"]) if i else 0,
            "atipicos": [atip_uc[uc][0], round(atip_uc[uc][1])] if uc in atip_uc else None,
        }
    (SALIDA / "instituciones.json").write_text(
        json.dumps({"generado": generado, "corte": corte, "filas": por_inst},
                   ensure_ascii=False, separators=(",", ":")))

    # Por proveedor, en diez fragmentos por el último dígito del RPE.
    fragmentos: dict[str, dict] = {str(d): {} for d in range(10)}
    for rpe, p in prov.items():
        clientes = sorted(p["clientes"].items(), key=lambda kv: -kv[1][1])
        fragmentos[rpe[-1]][rpe] = {
            "n": p["nombre"],
            "d": p["desde"],
            "h": p["hasta"],
            "s": [[y, v[0], round(v[1])] for y, v in sorted(p["anios"].items())],
            "c": [[int(uc), v[0], round(v[1])] for uc, v in clientes[:TOP_CLIENTES]],
            "k": len(clientes),
            "a": [atip_rpe[rpe][0], round(atip_rpe[rpe][1])] if rpe in atip_rpe else None,
        }
    for dgt, filas in fragmentos.items():
        (SALIDA / "proveedores" / f"{dgt}.json").write_text(
            json.dumps({"generado": generado, "corte": corte, "filas": filas},
                       ensure_ascii=False, separators=(",", ":")))

    print(f"{n_contratos} contratos, {n_procesos} procesos; {len(prov)} proveedores, "
          f"{len(por_inst)} unidades; {len(atipicos)} atípicos; {sin_uc} sin institución; corte {corte}",
          file=sys.stderr)


if __name__ == "__main__":
    main()
