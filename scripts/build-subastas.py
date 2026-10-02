#!/usr/bin/env python3
"""Genera public/data/subastas.json: las subastas de bonos en pesos del
Ministerio de Hacienda y Economía, del consolidado anual que publica la
Dirección General de Crédito Público.

Mecánica verificada el 2026-09-24 (docs/INFRAESTRUCTURA.md §5.3, Crédito Público):

- **Listado por año**: `GET /emisiones/subastas?dlAnio=AAAA&tipocontenido=Resultados`
  (el mismo formulario GET de la página; el selector llega hasta 2009) → HTML
  con un bloque «Consolidado» que enlaza **un solo archivo por año**, que se
  reescribe con cada subasta:
    2026 → `/Content/subastas/consolidados/2026/02Consolidado.xlsx` (10/09/2026, XLSX)
    2025 → `/Content/subastas/consolidados/2025/02Consolidado.xls`  (01/07/2025, **BIFF**)
  La extensión cambia de un año a otro: se sigue el enlace, no se supone.
  robots.txt de creditopublico.gob.do responde 404 (sin reglas).
- **El consolidado**: una hoja; cabecera en la fila de «Fecha Subasta» con
  Subasta | Fecha Subasta | Fecha Vencimiento | Subastado | Demandado |
  Bid to Cover Ratio | Adjudicado | Tasa de Corte, en **pesos** y la tasa como
  fracción (0.1044 = 10.44 %). La columna «Subasta» solo va en la primera fila
  de cada bono («MH1-2041\\nMonto de Emisión RD$100,000.0 MM\\nCupón 12.0000%»)
  y se propaga hacia abajo. Cada subasta competitiva va seguida de su
  **segunda ronda no competitiva** al día siguiente (demandado = subastado,
  ratio 1, misma tasa). Debajo, una fila de totales y otra con un solo monto
  en «Adjudicado» (2025: 80,000 M; 2026: 0) que cuadra con lo que falta por
  colocar de las emisiones — **hipótesis**, el archivo no la rotula.
  Arriba, «Monto Colocado por Subasta» = total adjudicado del año.
- **Trampas**: las fechas mezclan serie de Excel (46086) y texto
  («25/03/2026», «29/05/2041»). En 2026, la subasta del 8 de septiembre trae
  como vencimiento el **11/09/2026** (tres días después) dentro del bloque
  MH2-2041: el resultado publicado en PDF dice «Fecha de Liquidación: viernes
  11 de septiembre de 2026» y vencimiento «29 de mayo de 2041», así que es la
  fecha de liquidación en la columna equivocada. **No se corrige**: la fila se
  conserva y se marca (`alerta`), con el plazo en `null`.

Se niega a escribir si lo leído no es plausible: tasa fuera de 2–25 %, montos
no positivos, adjudicado > demandado, fechas fuera del año del archivo, un año
sin filas, o si las filas no suman la fila de totales del propio archivo.

    python3 scripts/build-subastas.py

**Dependencia de build**: `xlrd` 2.x para el `.xls` de 2025 (la misma que
`scripts/build-bcrd.py`). La app nunca la importa.
"""
import datetime
import html as htmlmod
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import zipfile

try:
    import xlrd  # dependencia de build, ver la cabecera
except ImportError:
    sys.exit("Falta xlrd (dependencia de build): pip install --user xlrd")

BASE = "https://www.creditopublico.gob.do"
UA = "Socratico-Inteligencia/1.0 (banca y subastas; herramienta independiente)"
ANIOS = (2025, 2026)
EXCEL_0 = datetime.date(1899, 12, 30)
SALIDA = os.path.join(os.path.dirname(__file__), "..", "public", "data", "subastas.json")
XLSX_FIRMA = b"PK"
XLS_FIRMA = bytes.fromhex("D0CF11E0")


def bajar(url: str, tipos: str) -> tuple[bytes, str]:
    """GET con UA identificable, 25 s, un reintento y validación de tipo."""
    for intento in (1, 2):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=25) as r:
                tipo = r.headers.get("Content-Type", "")
                cuerpo = r.read()
            if not re.search(tipos, tipo, re.I):
                raise RuntimeError(f"content-type inesperado {tipo!r}")
            return cuerpo, tipo
        except Exception as err:  # noqa: BLE001 — un reintento, luego se aborta
            if intento == 2:
                sys.exit(f"{url}: {err}")
    raise AssertionError


def consolidados(anio: int) -> list[dict]:
    """Los enlaces al consolidado del año en la página de subastas."""
    url = f"{BASE}/emisiones/subastas?dlAnio={anio}&tipocontenido=Resultados"
    cuerpo, _ = bajar(url, r"text/html")
    pagina = cuerpo.decode("utf-8", "replace")
    out = []
    for m in re.finditer(
        r'href="(/Content/subastas/consolidados/(\d{4})/[^"]+\.xlsx?)"(.*?)</a>', pagina, re.S
    ):
        if int(m.group(2)) != anio:
            continue
        pub = re.search(r"(\d{2})/(\d{2})/(\d{4})\s*\|", m.group(3))
        out.append({
            "ruta": htmlmod.unescape(m.group(1)),
            "publicado": f"{pub.group(3)}-{pub.group(2)}-{pub.group(1)}" if pub else None,
        })
    return out


# ── Lectura de la hoja: {fila: {columna: valor}} con valor float o str ──────────

def hoja_xlsx(cuerpo: bytes) -> dict[int, dict[str, object]]:
    z = zipfile.ZipFile(io.BytesIO(cuerpo))
    try:
        shared = z.read("xl/sharedStrings.xml").decode("utf-8", "replace")
        strs = [htmlmod.unescape(re.sub(r"<[^>]+>", "", t))
                for t in re.findall(r"<si>(.*?)</si>", shared, re.S)]
    except KeyError:
        strs = []
    sxml = z.read("xl/worksheets/sheet1.xml").decode("utf-8", "replace")
    filas: dict[int, dict[str, object]] = {}
    for rxml in re.finditer(r'<row[^>]*r="(\d+)"[^>]*>(.*?)</row>', sxml, re.S):
        celdas: dict[str, object] = {}
        for c in re.finditer(r'<c r="([A-Z]+)\d+"([^>]*?)(?:/>|>(.*?)</c>)', rxml.group(2), re.S):
            cuerpo_c = c.group(3) or ""
            v = re.search(r"<v>([^<]*)</v>", cuerpo_c)
            if v:
                val: object = v.group(1)
                if 't="s"' in c.group(2):
                    val = strs[int(val)] if int(val) < len(strs) else val
                elif 't="str"' not in c.group(2):
                    try:
                        val = float(val)
                    except ValueError:
                        pass
            else:
                t = re.search(r"<t[^>]*>([^<]*)</t>", cuerpo_c)
                if not t:
                    continue
                val = htmlmod.unescape(t.group(1))
            if val == "":
                continue
            celdas[c.group(1)] = val
        if celdas:
            filas[int(rxml.group(1))] = celdas
    return filas


def hoja_xls(cuerpo: bytes) -> dict[int, dict[str, object]]:
    s = xlrd.open_workbook(file_contents=cuerpo).sheet_by_index(0)
    filas: dict[int, dict[str, object]] = {}
    for r in range(s.nrows):
        celdas: dict[str, object] = {}
        for c in range(s.ncols):
            v = s.cell_value(r, c)
            if v in ("", None):
                continue
            celdas[xlrd.colname(c)] = v
        if celdas:
            filas[r + 1] = celdas
    return filas


# ── Interpretación ─────────────────────────────────────────────────────────────

def norm(t: object) -> str:
    import unicodedata
    s = unicodedata.normalize("NFD", str(t)).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().lower()


def fecha(v: object) -> datetime.date | None:
    """Serie de Excel (46086.0) o texto «25/03/2026»."""
    if isinstance(v, float):
        if 30000 < v < 80000:
            return EXCEL_0 + datetime.timedelta(days=int(v))
        return None
    m = re.fullmatch(r"\s*(\d{1,2})/(\d{1,2})/(\d{4})\s*", str(v))
    if m:
        try:
            return datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            return None
    return None


def numero(v: object) -> float | None:
    if isinstance(v, float):
        return v
    try:
        return float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


def instrumento(texto: str) -> dict:
    """«MH1-2041\\nMonto de Emisión RD$100,000.0 MM\\nCupón 12.0000%»."""
    nombre = re.search(r"\b([A-Z]{1,4}\d?-\d{4})\b", texto)
    emision = re.search(r"RD\$\s*([\d,]+(?:\.\d+)?)\s*MM", texto)
    cupon = re.search(r"Cup[oó]n\s*([\d.]+)\s*%", texto)
    return {
        "nombre": nombre.group(1) if nombre else texto.split("\n")[0].strip(),
        "emisionMillones": float(emision.group(1).replace(",", "")) if emision else None,
        "cupon": float(cupon.group(1)) if cupon else None,
    }


COLUMNAS = {
    "subasta": "instrumento",
    "fecha subasta": "fecha",
    "fecha vencimiento": "vencimiento",
    "subastado": "subastado",
    "demandado": "demandado",
    "bid to cover ratio": "ratio",
    "adjudicado": "adjudicado",
    "tasa de corte": "tasa",
}


def leer(filas: dict[int, dict[str, object]], anio: int) -> dict:
    cab = next((n for n, f in sorted(filas.items())
                if any(norm(v) == "fecha subasta" for v in f.values())), None)
    if cab is None:
        sys.exit(f"{anio}: no encontré la cabecera «Fecha Subasta»")
    col = {COLUMNAS[norm(v)]: c for c, v in filas[cab].items() if norm(v) in COLUMNAS}
    faltan = {"instrumento", "fecha", "subastado", "demandado", "adjudicado", "tasa"} - col.keys()
    if faltan:
        sys.exit(f"{anio}: faltan columnas {sorted(faltan)}")

    colocado = None
    for n, f in filas.items():
        if n < cab and any(norm(v) == "monto colocado por subasta" for v in f.values()):
            colocado = next((numero(v) for v in f.values() if numero(v)), None)

    actual: dict | None = None
    salida: list[dict] = []
    totales = None
    restante = None
    for n in sorted(k for k in filas if k > cab):
        f = filas[n]
        texto = f.get(col["instrumento"])
        if isinstance(texto, str) and texto.strip():
            actual = instrumento(texto)
        d = fecha(f.get(col["fecha"], ""))
        if d is None:
            if totales is None and numero(f.get(col["subastado"])) and numero(f.get(col["adjudicado"])):
                totales = {k: numero(f.get(col[k])) for k in ("subastado", "demandado", "adjudicado")}
            elif totales is not None and restante is None and set(f) == {col["adjudicado"]}:
                restante = numero(f[col["adjudicado"]])
            continue
        if actual is None:
            sys.exit(f"{anio} fila {n}: subasta sin bono")
        tasa = numero(f.get(col["tasa"]))
        if tasa is not None and tasa < 1:
            tasa *= 100  # el archivo la trae como fracción
        venc = fecha(f.get(col["vencimiento"], "")) if "vencimiento" in col else None
        fila = {
            "fecha": d.isoformat(),
            "instrumento": actual["nombre"],
            "emisionMillones": actual["emisionMillones"],
            "cupon": actual["cupon"],
            "vencimiento": venc.isoformat() if venc else None,
            "plazoAnios": None,
            "ronda": "competitiva",
            "subastado": numero(f.get(col["subastado"])),
            "demandado": numero(f.get(col["demandado"])),
            "adjudicado": numero(f.get(col["adjudicado"])),
            "ratioArchivo": numero(f.get(col["ratio"])) if "ratio" in col else None,
            "tasaCorte": round(tasa, 4) if tasa is not None else None,
            "alerta": None,
            "fila": n,
        }
        salida.append(fila)
    return {"filas": salida, "totales": totales, "colocado": colocado, "restante": restante}


def revisar(anio: int, leido: dict) -> list[str]:
    """Marca lo raro fila a fila; devuelve lo que impide escribir."""
    errores: list[str] = []
    filas = leido["filas"]
    if not filas:
        return [f"{anio}: el consolidado no trae filas"]
    previa = None
    for f in filas:
        d = datetime.date.fromisoformat(f["fecha"])
        donde = f"{anio} fila {f['fila']} ({f['fecha']})"
        if d.year != anio:
            errores.append(f"{donde}: fecha fuera del año del archivo")
        for k in ("subastado", "demandado", "adjudicado"):
            if not f[k] or f[k] <= 0:
                errores.append(f"{donde}: {k} no positivo")
        if f["tasaCorte"] is None or not 2 <= f["tasaCorte"] <= 25:
            errores.append(f"{donde}: tasa de corte implausible {f['tasaCorte']}")
        if f["demandado"] and f["adjudicado"] and f["adjudicado"] > f["demandado"] + 1:
            errores.append(f"{donde}: adjudicado mayor que demandado")
        # Segunda ronda: mismo bono, 1–3 días después, misma tasa, demanda = oferta.
        if (previa and previa["instrumento"] == f["instrumento"]
                and 1 <= (d - datetime.date.fromisoformat(previa["fecha"])).days <= 3
                and previa["ronda"] == "competitiva"
                and abs((previa["tasaCorte"] or 0) - (f["tasaCorte"] or 0)) < 1e-6
                and abs(f["demandado"] - f["subastado"]) < 1):
            f["ronda"] = "segunda"
        # El ratio del archivo contra la cuenta.
        if f["ratioArchivo"] is not None and f["subastado"]:
            cuenta = f["demandado"] / f["subastado"]
            if abs(cuenta - f["ratioArchivo"]) > 0.001:
                f["alerta"] = (f"El archivo dice que la demanda cubrió {f['ratioArchivo']:.2f} veces "
                               f"lo ofrecido; la cuenta da {cuenta:.2f}.")
        # Vencimiento contra el año que lleva el nombre del bono.
        anio_bono = re.search(r"-(\d{4})$", f["instrumento"])
        if f["vencimiento"]:
            v = datetime.date.fromisoformat(f["vencimiento"])
            dias = (v - d).days
            if anio_bono and v.year != int(anio_bono.group(1)):
                f["alerta"] = (
                    f"El archivo trae como vencimiento el {v.strftime('%d/%m/%Y')}, "
                    f"{dias} días después de la subasta, pero el bono {f['instrumento']} vence en "
                    f"{anio_bono.group(1)}. Se deja como lo publicó Crédito Público y no se calcula el plazo."
                )
                print(f"  ! {donde}: vencimiento sospechoso {v} para {f['instrumento']}", file=sys.stderr)
            elif dias > 0:
                f["plazoAnios"] = round(dias / 365.25, 1)
        previa = f

    t = leido["totales"]
    if t is None:
        errores.append(f"{anio}: sin fila de totales para cuadrar")
    else:
        for k in ("subastado", "demandado", "adjudicado"):
            suma = sum(f[k] for f in filas)
            if t[k] is None or abs(suma - t[k]) > 1000:
                errores.append(f"{anio}: la suma de {k} ({suma:,.0f}) no cuadra con el total ({t[k]})")
    if leido["colocado"] is not None and abs(leido["colocado"] - sum(f["adjudicado"] for f in filas)) > 1000:
        errores.append(f"{anio}: «Monto Colocado» no cuadra con lo adjudicado")
    return errores


def main() -> None:
    archivos, filas, errores = [], [], []
    for anio in ANIOS:
        enlaces = consolidados(anio)
        if not enlaces:
            sys.exit(f"{anio}: la página no enlaza un consolidado")
        for e in enlaces:
            url = BASE + urllib.parse.quote(e["ruta"])
            if e["ruta"].lower().endswith(".xlsx"):
                cuerpo, tipo = bajar(url, r"spreadsheetml|octet-stream")
                if not cuerpo.startswith(XLSX_FIRMA):
                    sys.exit(f"{url}: no empieza por PK, no es un XLSX")
                hoja = hoja_xlsx(cuerpo)
            else:
                cuerpo, tipo = bajar(url, r"ms-excel|octet-stream")
                if not cuerpo.startswith(XLS_FIRMA):
                    sys.exit(f"{url}: no empieza por D0 CF 11 E0, no es un .xls")
                hoja = hoja_xls(cuerpo)
            print(f"  {url}: {len(cuerpo):,} bytes, {tipo}")
            leido = leer(hoja, anio)
            errores += revisar(anio, leido)
            for f in leido["filas"]:
                f.pop("fila")
                f.pop("ratioArchivo")
            filas += leido["filas"]
            archivos.append({
                "anio": anio,
                "url": url,
                "publicado": e["publicado"],
                "filas": len(leido["filas"]),
                "totales": leido["totales"],
                "colocado": leido["colocado"],
                "restantePorColocar": leido["restante"],
                # La hipótesis de la cabecera, comprobada: emisiones − adjudicado.
                "restanteCuadra": (
                    leido["restante"] is not None
                    and abs(sum({f["instrumento"]: (f["emisionMillones"] or 0) * 1e6 for f in leido["filas"]}.values())
                            - sum(f["adjudicado"] for f in leido["filas"]) - leido["restante"]) < 1000
                ),
            })
    if errores:
        sys.exit("No escribo subastas.json:\n  " + "\n  ".join(errores))

    filas.sort(key=lambda f: f["fecha"])
    salida = {
        "generado": datetime.date.today().isoformat(),
        "fuente": "Dirección General de Crédito Público, consolidado anual de subastas (Ministerio de Hacienda y Economía)",
        "pagina": f"{BASE}/emisiones/subastas",
        "archivos": archivos,
        "subastas": filas,
    }
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", encoding="utf-8") as fh:
        json.dump(salida, fh, ensure_ascii=False, separators=(",", ":"))
    alertas = sum(1 for f in filas if f["alerta"])
    print(f"subastas.json: {len(filas)} filas de {len(archivos)} archivos, {alertas} marcadas")
    for f in filas:
        print(f"  {f['fecha']} {f['instrumento']:9} {f['ronda']:11} "
              f"ofrecido {f['subastado']/1e6:>10,.1f} M  demandado {f['demandado']/1e6:>10,.1f} M  "
              f"adjudicado {f['adjudicado']/1e6:>10,.1f} M  tasa {f['tasaCorte']:.4f} %"
              f"{'  ⚠' if f['alerta'] else ''}")


if __name__ == "__main__":
    main()
