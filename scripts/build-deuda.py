#!/usr/bin/env python3
"""Genera public/data/deuda.json: el saldo de la deuda del SPNF y su serie.

Crédito Público publica el saldo como XLSX («Saldo Evolución Deuda del Sector
Público No Financiero»), pero su servidor (on-premise en RD) no responde al
egreso de Vercel, así que lib/deuda.ts intenta la lectura en vivo y cae a esta
instantánea. Regenerar cuando haya un mes nuevo:

    python3 scripts/build-deuda.py

Requiere red con acceso a creditopublico.gob.do (una máquina local o un
sandbox con egreso; verificado el 2026-09-23 desde uno).

Qué lee (docs/INFRAESTRUCTURA.md §5.3):

- **La serie**: `/inicio/estadisticas?dlAnio=AAAA` lista los XLSX de cada año.
  El origen **no conserva todos los meses**: de cada año cerrado quedan el
  cierre de diciembre y los tres trimestres (marzo, junio, septiembre); del año
  en curso, los dos últimos meses y los trimestres. La carpeta del mes lleva un
  número de orden que no es estable entre años (`14Al 30 de Junio` en 2021,
  `16Al 30 de Junio` en 2016), así que el script **lee el listado** en vez de
  adivinar la URL; una URL inventada devuelve 200 con una página HTML, y por
  eso se valida el content-type de cada respuesta.
- **El saldo de cada archivo**: la hoja trae dos columnas «Saldo», la de
  apertura (31 de diciembre del año anterior, columna C) y la de cierre del
  período (columna M), con su fecha como número de serie de Excel en la fila
  de debajo. El saldo del período es **la de cierre**. Hasta esta versión el
  script leía la columna C y publicaba como «Jul-26» el saldo del 31 de
  diciembre de 2025.
- **El histórico anual** (`/historico/saldo/01Saldo Deuda Histórico …`):
  cierre de cada año con interna, externa y % del PIB, metodología nueva.
"""
import datetime
import html as htmlmod
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import zipfile

BASE = "https://www.creditopublico.gob.do"
UA = "Socratico-Inteligencia/1.0 (instantanea de deuda; herramienta independiente)"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
PRIMER_ANIO = 2015  # antes, el listado no publica «Saldo Evolución»
EXCEL_0 = datetime.date(1899, 12, 30)
MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
                "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]


def get(url: str) -> tuple[bytes, str]:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read(), r.headers.get("Content-Type", "")


def listado(anio: int | None) -> list[str]:
    url = f"{BASE}/inicio/estadisticas" + (f"?dlAnio={anio}" if anio else "")
    cuerpo, tipo = get(url)
    if "text/html" not in tipo:
        raise RuntimeError(f"{url}: content-type inesperado {tipo!r}")
    html = cuerpo.decode("utf-8", "replace")
    return [htmlmod.unescape(h) for h in
            re.findall(r'href="(/Content/estadisticas/[^"]+\.xlsx)"', html)]


def xlsx(ruta: str) -> tuple[zipfile.ZipFile, str] | None:
    url = BASE + urllib.parse.quote(ruta)
    cuerpo, tipo = get(url)
    if XLSX not in tipo:
        print(f"  ! {ruta}: no es un XLSX ({tipo})", file=sys.stderr)
        return None
    return zipfile.ZipFile(io.BytesIO(cuerpo)), url


def filas(z: zipfile.ZipFile, hoja: str = "xl/worksheets/sheet1.xml") -> list[dict]:
    try:
        shared = z.read("xl/sharedStrings.xml").decode("utf-8", "replace")
        strs = [re.sub(r"<[^>]+>", "", t)
                for t in re.findall(r"<si>(.*?)</si>", shared, re.S)]
    except KeyError:
        strs = []
    sxml = z.read(hoja).decode("utf-8", "replace")
    out = []
    for rxml in re.findall(r'<row[^>]*r="\d+"[^>]*>(.*?)</row>', sxml, re.S):
        celdas = {}
        for c in re.finditer(
            r'<c r="([A-Z]+)\d+"(?:[^>]* t="([a-z]+)")?[^>]*>'
            r"(?:<f[^>]*/>|<f[^>]*>[^<]*</f>)?(?:<v>([^<]*)</v>)?", rxml):
            col, t, v = c.group(1), c.group(2), c.group(3)
            if v is None:
                continue
            if t == "s":
                v = strs[int(v)] if int(v) < len(strs) else v
            celdas[col] = v.strip()
        out.append(celdas)
    return out


def numero(v: str | None) -> float | None:
    try:
        return float(v) if v not in (None, "") else None
    except ValueError:
        return None


def fecha_excel(v: str | None) -> datetime.date | None:
    n = numero(v)
    if n is None or not 30000 < n < 60000:
        return None
    return EXCEL_0 + datetime.timedelta(days=int(n))


def saldo_de(z: zipfile.ZipFile) -> dict | None:
    """El saldo de cierre del período de un XLSX de «Saldo Evolución»."""
    fs = filas(z)
    # La fila de cabecera con dos «Saldo»; debajo, sus fechas de serie Excel.
    col_cierre = fecha = None
    for k, f in enumerate(fs[:-1]):
        cols = [c for c, v in f.items() if re.match(r"^Saldo\b", v, re.I)]
        if len(cols) >= 2:
            fechas = {c: fecha_excel(fs[k + 1].get(c)) for c in cols}
            fechas = {c: d for c, d in fechas.items() if d}
            if fechas:
                col_cierre = max(fechas, key=lambda c: fechas[c])
                fecha = fechas[col_cierre]
            break
    if not col_cierre:
        return None
    valores = {}
    for f in fs:
        # La etiqueta va en la B desde 2020 y en la C antes.
        et = f.get("B") or f.get("C", "")
        if re.match(r"^Deuda\s+P[uú]blica\s+Total", et) and "total" not in valores:
            valores["total"] = numero(f.get(col_cierre))
        elif re.search(r"Deuda\s+Externa\s+Total", et) and "externa" not in valores:
            valores["externa"] = numero(f.get(col_cierre))
        elif re.search(r"Deuda\s+Interna\s+Total", et) and "interna" not in valores:
            valores["interna"] = numero(f.get(col_cierre))
    if not valores.get("total"):
        return None
    return {
        "fecha": fecha.isoformat(),
        "total": round(valores["total"], 2),
        "externa": round(valores.get("externa") or 0, 2),
        "interna": round(valores.get("interna") or 0, 2),
    }


def periodo_de(fecha: str) -> str:
    """«2026-07-31» → «Jul-26», la etiqueta que ya usa la hoja del origen."""
    d = datetime.date.fromisoformat(fecha)
    return f"{MESES_CORTOS[d.month - 1]}-{str(d.year)[2:]}"


def historico(enlaces: list[str]) -> list[dict]:
    ruta = next((h for h in enlaces if re.search(r"/historico/saldo/01Saldo", h)), None)
    if not ruta:
        return []
    r = xlsx(ruta)
    if not r:
        return []
    z, _ = r
    anual = []
    for f in filas(z):
        # Columnas K–O: metodología nueva (año, interna, externa, total, % PIB).
        m = re.search(r"(\d{4})\s*$", f.get("K", ""))
        interna, externa = numero(f.get("L")), numero(f.get("M"))
        if not m or interna is None or externa is None:
            continue
        total = numero(f.get("N")) or interna + externa
        anual.append({
            "anio": int(m.group(1)),
            "total": round(total, 2),
            "externa": round(externa, 2),
            "interna": round(interna, 2),
            "pctPib": round(numero(f.get("O")), 2) if numero(f.get("O")) else None,
        })
    return sorted(anual, key=lambda a: a["anio"])


def main() -> None:
    hoy = datetime.date.today()
    enlaces_hoy = listado(None)
    rutas: list[str] = []
    for anio in range(PRIMER_ANIO, hoy.year + 1):
        lista = enlaces_hoy if anio == hoy.year else listado(anio)
        rutas += [h for h in lista
                  if f"/anual/{anio}/" in h and re.search(r"Saldo\s+Evoluci", h, re.I)]
        time.sleep(0.4)

    por_fecha: dict[str, dict] = {}
    for ruta in rutas:
        r = xlsx(ruta)
        time.sleep(0.3)
        if not r:
            continue
        z, url = r
        s = saldo_de(z)
        if not s:
            print(f"  ! {ruta}: sin fila de Deuda Pública Total", file=sys.stderr)
            continue
        # «Diciembre» y «Al 31 de Diciembre» son el mismo cierre: gana el primero.
        por_fecha.setdefault(s["fecha"], {**s, "fuente": url})
        print(f"  {s['fecha']}  US${s['total']:>10,.1f}M  {ruta.split('/')[4]}")

    serie = sorted(por_fecha.values(), key=lambda s: s["fecha"])
    assert serie, "no se leyó ningún saldo"
    ultimo = serie[-1]
    anual = historico(enlaces_hoy)

    data = {
        "generadoEn": hoy.isoformat(),
        # Campos de siempre: el último cierre publicado (lo leen el panorama,
        # /finanzas y /fuentes a través de getDeuda()).
        "periodo": periodo_de(ultimo["fecha"]),
        "fecha": ultimo["fecha"],
        "saldoTotal": ultimo["total"],
        "saldoExterna": ultimo["externa"],
        "saldoInterna": ultimo["interna"],
        "fuente": ultimo["fuente"],
        "serie": serie,
        "anual": anual,
    }
    with open("public/data/deuda.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f"{data['periodo']}: total US${ultimo['total']:,.1f}M "
          f"(ext {ultimo['externa']:,.1f} / int {ultimo['interna']:,.1f}); "
          f"{len(serie)} cierres, {len(anual)} años -> public/data/deuda.json")


if __name__ == "__main__":
    main()
