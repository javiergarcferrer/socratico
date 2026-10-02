#!/usr/bin/env python3
"""Genera public/data/bcrd.json: la inflación (IPC) y las llegadas de pasajeros
por vía aérea que publica el Banco Central en su CDN.

Los dos archivos están en el formato viejo de Excel (BIFF, `.xls`), que el
lector de XLSX de la plataforma (`leerZip` en lib/deuda.ts) no abre; por eso
se leen aquí, en build, y la app sirve la instantánea (lib/bcrd.ts). Mecánica
verificada en docs/INFRAESTRUCTURA.md §5.4 (2026-09-24). Regenerar cuando el BCRD
publique un mes nuevo (el IPC sale a principios de mes; las llegadas, con un
mes más de rezago):

    python3 scripts/build-bcrd.py

**Dependencia de build**: `xlrd` 2.x (el único lector de BIFF puro Python;
`pip install --user xlrd`). Solo la usa este script: la app nunca la importa y
no va en package.json ni en el despliegue.

Qué lee:

- **IPC** `precios/documents/ipc_base_2019-2020.xls` → 200
  `application/octet-stream`, ~115 KB. Una hoja, «IPC base 2019-2020», serie
  empalmada desde 1984. Columnas: A = año (solo en la fila de enero; a veces
  texto «1984», a veces número 2026.0), B = mes, C = índice, D = variación
  mensual %, E = acumulada desde diciembre, F = variación de 12 meses %
  (la interanual), G = promedio de 12 meses. Entre años hay una fila vacía.
- **Llegadas** `sector-turismo/documents/lleg_total.xls` → 200
  `application/vnd.ms-excel`, ~800 KB. Cuatro hojas: no residentes (1978–),
  residentes (1993–), «Llegada total 93-26» y un resumen anual. En las tres
  mensuales A = año (fila propia: 1993.0 … «2026*») o nombre del mes, B = el
  mes. «*» = «Cifras sujetas a rectificación». **Ojo**: el total viene como
  entero con ruido de coma flotante (945865.9999999956) y el reparto
  residentes / no residentes sí trae decimales de verdad desde 1987: es un
  reparto estimado del total, no un conteo. Se marca `estimado` solo el mes
  cuyo **total** trae decimales reales (más de 0.01 de un entero).

Se niega a escribir si lo leído no es plausible (inflación fuera de −10..50 %,
llegadas ≤ 0, menos de 36 meses) o si el total no cuadra con la suma de
residentes y no residentes.
"""
import datetime
import json
import os
import re
import sys
import time
import urllib.request

try:
    import xlrd  # dependencia de build, ver la cabecera
except ImportError:
    sys.exit("Falta xlrd (dependencia de build): pip install --user xlrd")

BASE = "https://cdn.bancentral.gov.do/documents/estadisticas"
URL_IPC = f"{BASE}/precios/documents/ipc_base_2019-2020.xls"
URL_LLEGADAS = f"{BASE}/sector-turismo/documents/lleg_total.xls"
UA = "Socratico-Inteligencia/1.0 (series del BCRD; herramienta independiente)"
BIFF = bytes.fromhex("D0CF11E0")  # cabecera OLE2 de un .xls
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
         "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
N = 36
SALIDA = os.path.join(os.path.dirname(__file__), "..", "public", "data", "bcrd.json")


def bajar(url: str) -> bytes:
    """GET con UA identificable, un reintento, y validación de tipo y firma."""
    for intento in (1, 2):
        try:
            # La fecha como consulta: el CDN guarda copias viejas por
            # codificación, y una consulta nueva le hace pedir la vigente a su
            # origen (lib/pedir.ts, `delDiaBcrd`; docs/INFRAESTRUCTURA.md §5.4).
            fresca = f"{url}?d={datetime.date.today().isoformat()}"
            req = urllib.request.Request(fresca, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                tipo = r.headers.get("Content-Type", "")
                cuerpo = r.read()
            if not re.search(r"octet-stream|ms-excel", tipo, re.I):
                raise RuntimeError(f"content-type inesperado {tipo!r}")
            if not cuerpo.startswith(BIFF):
                raise RuntimeError("no empieza por D0 CF 11 E0: no es un .xls")
            print(f"  {url}: {len(cuerpo):,} bytes, {tipo}")
            return cuerpo
        except Exception as err:  # noqa: BLE001 — se reintenta una vez, luego se aborta
            if intento == 2:
                sys.exit(f"{url}: {err}")
            print(f"  ! {url}: {err}; reintento", file=sys.stderr)
            time.sleep(3)
    raise AssertionError


def num_mes(texto) -> int:
    t = str(texto).strip().lower().replace("setiembre", "septiembre")
    return MESES.index(t) + 1 if t in MESES else 0


def anio_de(celda) -> tuple[int, bool] | None:
    """1984.0, «1984», «2026*» → (año, preliminar)."""
    if isinstance(celda, float) and 1900 < celda < 2100 and celda == int(celda):
        return int(celda), False
    m = re.fullmatch(r"\s*(\d{4})\s*(\*?)\s*", str(celda))
    return (int(m.group(1)), bool(m.group(2))) if m else None


def es_num(v) -> bool:
    return isinstance(v, float)


# ── IPC ──────────────────────────────────────────────────────────────────────

def leer_ipc(datos: bytes) -> dict:
    hoja = xlrd.open_workbook(file_contents=datos).sheet_by_index(0)
    # Las columnas se ubican por sus rótulos; si el BCRD las mueve, se aborta.
    cab = [str(hoja.cell_value(r, c)).strip().lower() for r in (4, 5) for c in range(hoja.ncols)]
    if "indice" not in cab[: hoja.ncols] or "12 meses" not in cab[hoja.ncols:]:
        sys.exit("IPC: los rótulos de columna no están donde se esperaban")
    serie, anio = [], None
    for r in range(hoja.nrows):
        fila = hoja.row_values(r)
        a = anio_de(fila[0])
        if a:
            anio = a[0]
        mes = num_mes(fila[1])
        if not (anio and mes and es_num(fila[2]) and es_num(fila[3]) and es_num(fila[5])):
            continue
        serie.append([f"{anio}-{mes:02d}", round(fila[2], 4), round(fila[5], 2), round(fila[3], 2)])
    serie.sort(key=lambda f: f[0])
    if len(serie) < N + 12:
        sys.exit(f"IPC: solo {len(serie)} meses")
    ultimos = serie[-N:]
    for p, idx, ia, im in ultimos:
        if not (-10 <= ia <= 50 and -10 <= im <= 50 and idx > 0):
            sys.exit(f"IPC: valor implausible en {p}: índice {idx}, interanual {ia}, mensual {im}")
    nota = next((re.sub(r"\s+", " ", str(hoja.cell_value(r, 0))).strip()
                 for r in range(hoja.nrows - 1, hoja.nrows - 6, -1)
                 if "base" in str(hoja.cell_value(r, 0)).lower()), None)
    return {
        "serie": ultimos,
        "ultimo": ultimos[-1],
        "base": "octubre 2019 – septiembre 2020 = 100",
        "nota": nota,
        "fuente": URL_IPC,
        "corte": ultimos[-1][0],
    }


# ── Llegadas ─────────────────────────────────────────────────────────────────

def mensual(hoja) -> dict[str, tuple[float, bool]]:
    """{AAAA-MM: (valor mensual de la columna B, preliminar)} de una hoja mensual."""
    out, anio, prel = {}, None, False
    for r in range(hoja.nrows):
        a0 = hoja.cell_value(r, 0)
        a = anio_de(a0)
        if a:
            anio, prel = a
            continue
        mes = num_mes(a0)
        v = hoja.cell_value(r, 1)
        if anio and mes and es_num(v):
            out[f"{anio}-{mes:02d}"] = (v, prel)
    return out


def buscar_hoja(libro, patron: str):
    for h in libro.sheets():
        if re.search(patron, h.name, re.I):
            return h
    sys.exit(f"Llegadas: no hay hoja que case con {patron!r}; hojas: {libro.sheet_names()}")


def leer_llegadas(datos: bytes) -> dict:
    libro = xlrd.open_workbook(file_contents=datos)
    total = mensual(buscar_hoja(libro, r"^\s*llegada total"))
    no_res = mensual(buscar_hoja(libro, r"^\s*no residentes"))
    res = mensual(buscar_hoja(libro, r"^\s*residentes"))
    claves = sorted(total)
    if len(claves) < N + 12:
        sys.exit(f"Llegadas: solo {len(claves)} meses")
    serie = []
    for k in claves[-N:]:
        v, prel = total[k]
        if v <= 0:
            sys.exit(f"Llegadas: {k} trae {v}")
        nr, r_ = no_res.get(k, (None, False))[0], res.get(k, (None, False))[0]
        if nr is not None and r_ is not None and abs(nr + r_ - v) > max(2.0, v * 1e-4):
            sys.exit(f"Llegadas: {k} total {v} ≠ no residentes {nr} + residentes {r_}")
        serie.append({
            "periodo": k,
            "total": round(v),
            "noResidentes": None if nr is None else round(nr),
            "residentes": None if r_ is None else round(r_),
            "estimado": abs(v - round(v)) > 0.01,
            "preliminar": prel,
        })
    # Acumulado del año del último mes contra el mismo tramo del año anterior.
    ult = serie[-1]["periodo"]
    anio, mes = int(ult[:4]), int(ult[5:])

    def tramo(a: int) -> float | None:
        vals = [total.get(f"{a}-{m:02d}") for m in range(1, mes + 1)]
        return None if any(x is None for x in vals) else round(sum(x[0] for x in vals))

    actual, anterior = tramo(anio), tramo(anio - 1)
    return {
        "serie": serie,
        "acumulado": {
            "anio": anio,
            "hastaMes": mes,
            "valor": actual,
            "anterior": anterior,
            "variacion": None if not anterior else round((actual - anterior) / anterior * 100, 2),
        },
        # El reparto por residencia trae decimales: el BCRD lo estima sobre el total.
        "repartoEstimado": any(abs(no_res[k][0] - round(no_res[k][0])) > 0.01
                               for k in claves[-N:] if k in no_res),
        "alcance": "Pasajeros que llegan por vía aérea, residentes y no residentes; "
                   "no incluye cruceristas.",
        "fuente": URL_LLEGADAS,
        "corte": ult,
    }


def main() -> None:
    print("BCRD: IPC y llegadas")
    ipc = leer_ipc(bajar(URL_IPC))
    turismo = leer_llegadas(bajar(URL_LLEGADAS))
    salida = {
        "generado": datetime.date.today().isoformat(),
        "ipc": ipc,
        "turismo": turismo,
    }
    with open(SALIDA, "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    u = ipc["ultimo"]
    t = turismo["serie"][-1]
    ac = turismo["acumulado"]
    print(f"  IPC {u[0]}: índice {u[1]}, interanual {u[2]} %, mensual {u[3]} %")
    print(f"  Llegadas {t['periodo']}: {t['total']:,} (no residentes {t['noResidentes']:,}), "
          f"estimado={t['estimado']}, preliminar={t['preliminar']}")
    print(f"  Acumulado {ac['anio']} ene–{ac['hastaMes']:02d}: {ac['valor']:,} vs {ac['anterior']:,} "
          f"({ac['variacion']} %)")
    print(f"  → {os.path.normpath(SALIDA)} ({os.path.getsize(SALIDA):,} bytes)")


if __name__ == "__main__":
    main()
