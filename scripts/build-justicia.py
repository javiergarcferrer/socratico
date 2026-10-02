#!/usr/bin/env python3
"""Genera public/data/justicia.json: cuántas solicitudes entran y salen de los
tribunales de jurisdicción ordinaria en un mes, por departamento judicial.

Regenerar cuando el Poder Judicial publique un mes nuevo (suele ser a las
tres o cuatro semanas del cierre):

    python3 scripts/build-justicia.py

Mecánica verificada el 2026-09-24 (docs/INFRAESTRUCTURA.md §5.6):

- `transparencia.poderjudicial.gob.do/robots.txt` solo veta `/reportePDF/`.
  El índice `…/estadisticas_judiciales/BoletinesEstadisticos` es HTML de
  ASP.NET (~690 KB) que enlaza 943 PDF/XLSX con nombres **irregulares**
  (`_1`, `_(1)`, `_data`, `_1_2`, `dic`/`sept` abreviados, «Original» por
  «Ordinaria» en el texto del enlace, un octubre de 2023 rotulado «Juzgados de
  Paz»). Por eso el script **lee el índice** en vez de construir la URL.
- La serie que se usa es `EST_02_tribunales_de_jurisdiccion_ordinaria_<mes>_<año>.xlsx`:
  una hoja «Ent y Sal» con la entrada y la salida de «solicitudes de servicio
  judicial» del mes, por departamento judicial (11 filas + TOTAL) y por
  categoría de tribunal (corte de apelación, primera instancia, juzgado de
  paz, cada una «y equivalentes»). Cada mes trae además un gemelo «Data»
  (`_1.xlsx`, `EST_data_de_…`) con la data cruda: se descarta por el texto del
  enlace y por el nombre.
- **Es mensual, no acumulado**: junio de 2026 suma 123,326 entradas y julio
  129,375; un acumulado de enero a julio sería varias veces mayor.
- La hoja dice «Salidas sin considerar la fecha de entrada» y «Cifras de
  carácter preliminar, sujetas a verificación». La salida de un mes puede ser
  de una solicitud que entró meses antes: la tasa salidas/entradas mide si el
  tribunal da abasto ese mes, no qué parte de lo que entró se resolvió.

Contrato: GET solamente, User-Agent identificable, content-type validado, y
**no escribe nada** si la hoja no cuadra (departamentos que no suman el total,
totales fuera de rango, meses que no coinciden con el nombre del archivo).
Peticiones por corrida: el índice + el XLSX del último mes + el del mismo mes
un año antes, si está listado (3, con un reintento como mucho por archivo).
"""
import datetime
import html as htmlmod
import io
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
import zipfile

ORIGEN = "https://transparencia.poderjudicial.gob.do"
INDICE = f"{ORIGEN}/transparencia/estadisticas_judiciales/BoletinesEstadisticos"
UA = "Socratico-Inteligencia/1.0 (justicia; herramienta independiente)"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
SALIDA = "public/data/justicia.json"

MESES = {
    "enero": 1, "ene": 1, "febrero": 2, "feb": 2, "marzo": 3, "mar": 3,
    "abril": 4, "abr": 4, "mayo": 5, "may": 5, "junio": 6, "jun": 6,
    "julio": 7, "jul": 7, "agosto": 8, "ago": 8, "septiembre": 9,
    "setiembre": 9, "sept": 9, "sep": 9, "octubre": 10, "oct": 10,
    "noviembre": 11, "nov": 11, "diciembre": 12, "dic": 12,
}

# Los 11 departamentos judiciales, con su nombre en caja normal. La hoja los
# trae en mayúsculas; la clave es el nombre sin tildes.
DEPARTAMENTOS = {
    "BARAHONA": "Barahona",
    "DISTRITO NACIONAL": "Distrito Nacional",
    "LA VEGA": "La Vega",
    "MONTE CRISTI": "Montecristi",
    "MONTECRISTI": "Montecristi",
    "PUERTO PLATA": "Puerto Plata",
    "SAN CRISTOBAL": "San Cristóbal",
    "SAN FRANCISCO DE MACORIS": "San Francisco de Macorís",
    "SAN JUAN DE LA MAGUANA": "San Juan de la Maguana",
    "SAN PEDRO DE MACORIS": "San Pedro de Macorís",
    "SANTIAGO": "Santiago",
    "SANTO DOMINGO": "Santo Domingo",
}

# Las tres categorías de tribunal, por la palabra que las distingue en la cabecera.
CATEGORIAS = (("corte", "CORTE"), ("primeraInstancia", "PRIMERA"), ("paz", "PAZ"))


def sin_tildes(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn").upper().strip()


def get(url: str, tipo_esperado: str) -> bytes:
    ultimo: Exception | None = None
    for intento in (1, 2):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                tipo = r.headers.get("Content-Type", "")
                if tipo_esperado not in tipo:
                    raise RuntimeError(f"content-type inesperado {tipo!r}")
                return r.read()
        except Exception as err:  # noqa: BLE001 — se reintenta una vez y se informa
            ultimo = err
            if intento == 1:
                time.sleep(2)
    raise RuntimeError(f"{url}: {ultimo}")


def candidatos(indice: str) -> dict[tuple[int, int], list[str]]:
    """XLSX de la serie EST_02 agrupados por (año, mes), el archivo «limpio» primero."""
    por_mes: dict[tuple[int, int], list[str]] = {}
    patron = re.compile(
        r"EST_02_tribunales_de_jurisdiccion_ordinaria_([a-z]+)_(\d{4})([^/]*)\.xlsx$", re.I)
    for m in re.finditer(r'<a[^>]*href="([^"]+\.xlsx)"[^>]*>([^<]*)</a>', indice, re.I):
        href, texto = htmlmod.unescape(m.group(1)), htmlmod.unescape(m.group(2))
        nombre = href.rsplit("/", 1)[-1]
        p = patron.search(nombre)
        if not p or re.search(r"\bdata\b", texto, re.I) or "data" in nombre.lower():
            continue
        mes = MESES.get(p.group(1).lower())
        if not mes:
            continue
        url = urllib.parse.urljoin(INDICE, href)
        lista = por_mes.setdefault((int(p.group(2)), mes), [])
        # Sin sufijo primero: `julio_2026.xlsx` antes que `julio_2026_1.xlsx`.
        if p.group(3):
            lista.append(url)
        else:
            lista.insert(0, url)
    return por_mes


def celdas(z: zipfile.ZipFile) -> dict[int, dict[str, str]]:
    """Filas de la primera hoja: {fila: {columna: valor}} con las cadenas resueltas."""
    try:
        shared = z.read("xl/sharedStrings.xml").decode("utf-8", "replace")
        strs = [htmlmod.unescape("".join(re.findall(r"<t[^>]*>(.*?)</t>", si, re.S)))
                for si in re.findall(r"<si>(.*?)</si>", shared, re.S)]
    except KeyError:
        strs = []
    wb = z.read("xl/workbook.xml").decode("utf-8", "replace")
    rels = z.read("xl/_rels/workbook.xml.rels").decode("utf-8", "replace")
    hojas = re.findall(r'<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"', wb)
    # La hoja «Ent y Sal» si está; si no, la primera.
    nombre, rid = next(((n, r) for n, r in hojas if re.search(r"ent.*sal", n, re.I)), hojas[0])
    destino = re.search(rf'Id="{re.escape(rid)}"[^>]*Target="([^"]+)"', rels)
    if not destino:
        destino = re.search(rf'Target="([^"]+)"[^>]*Id="{re.escape(rid)}"', rels)
    ruta = "xl/" + destino.group(1).lstrip("/").removeprefix("xl/")
    sxml = z.read(ruta).decode("utf-8", "replace")
    out: dict[int, dict[str, str]] = {}
    for c in re.finditer(r'<c r="([A-Z]+)(\d+)"([^>]*?)(?:/>|>(.*?)</c>)', sxml, re.S):
        col, fila, attrs, inner = c.group(1), int(c.group(2)), c.group(3), c.group(4) or ""
        v = re.search(r"<v>(.*?)</v>", inner, re.S)
        if v:
            val = v.group(1)
            if 't="s"' in attrs:
                val = strs[int(val)] if int(val) < len(strs) else ""
        else:
            t = re.search(r"<t[^>]*>(.*?)</t>", inner, re.S)
            if not t:
                continue
            val = htmlmod.unescape(t.group(1))
        out.setdefault(fila, {})[col] = val.strip()
    return out


def entero(v: str | None) -> int | None:
    try:
        f = float(v) if v not in (None, "") else None
    except ValueError:
        return None
    return int(round(f)) if f is not None and f >= 0 else None


def leer_hoja(z: zipfile.ZipFile, anio: int, mes: int) -> dict:
    """Lee la hoja y la valida; lanza si algo no cuadra."""
    filas = celdas(z)
    texto = " ".join(v for f in filas.values() for v in f.values() if not re.fullmatch(r"[\d.]+", v))
    plano = sin_tildes(texto)
    if "JURISDICCION ORDINARIA" not in plano or "ENTRADA Y SALIDA" not in plano:
        raise ValueError("la hoja no es la de entrada y salida de jurisdicción ordinaria")

    # El mes declarado en la hoja tiene que ser el del nombre del archivo.
    nombres = {v: k for k, v in MESES.items() if len(k) > 4 or k == "mayo"}
    declarado = re.search(r"\b(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|SETIEMBRE|"
                          r"OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+(?:DE(?:L)?\s+)?(\d{4})\b", plano)
    if not declarado or MESES[declarado.group(1).lower()] != mes or int(declarado.group(2)) != anio:
        raise ValueError(f"la hoja dice {declarado.group(0) if declarado else '(sin mes)'}, "
                         f"el archivo {nombres.get(mes, mes)} {anio}")

    cab = next((n for n, f in sorted(filas.items())
                if sin_tildes(f.get("A", "")) == "DEPARTAMENTO JUDICIAL"), None)
    if cab is None:
        raise ValueError("sin la cabecera «DEPARTAMENTO JUDICIAL»")
    arriba, abajo = filas[cab], filas.get(cab + 1, {})
    col_te = next((c for c, v in arriba.items() if sin_tildes(v) == "TOTAL ENTRADA"), None)
    col_ts = next((c for c, v in arriba.items() if sin_tildes(v) == "TOTAL SALIDAS"), None)
    if not col_te or not col_ts:
        raise ValueError("sin las columnas TOTAL ENTRADA / TOTAL SALIDAS")

    def orden(c: str) -> int:
        n = 0
        for ch in c:
            n = n * 26 + ord(ch) - 64
        return n

    # Columnas de cada categoría: a la izquierda del total de entrada son
    # entradas; entre los dos totales, salidas.
    cats: dict[str, dict[str, str]] = {k: {} for k, _ in CATEGORIAS}
    for c, v in abajo.items():
        lado = "entradas" if orden(c) < orden(col_te) else "salidas" if orden(c) < orden(col_ts) else None
        for clave, palabra in CATEGORIAS:
            if lado and palabra in sin_tildes(v):
                cats[clave][lado] = c
    if any(len(v) != 2 for v in cats.values()):
        raise ValueError(f"categorías de tribunal incompletas: {cats}")

    def fila_de(f: dict[str, str]) -> dict:
        e, s = entero(f.get(col_te)), entero(f.get(col_ts))
        if e is None or s is None:
            raise ValueError(f"fila sin números: {f}")
        por = {k: {"entradas": entero(f.get(cols["entradas"])) or 0,
                   "salidas": entero(f.get(cols["salidas"])) or 0} for k, cols in cats.items()}
        if sum(p["entradas"] for p in por.values()) != e or sum(p["salidas"] for p in por.values()) != s:
            raise ValueError(f"las categorías no suman el total: {f}")
        return {"entradas": e, "salidas": s, "tasa": round(s / e, 4) if e else None, "categorias": por}

    departamentos, total, nota = [], None, ""
    for n in sorted(k for k in filas if k > cab + 1):
        a = filas[n].get("A", "")
        clave = sin_tildes(a)
        if clave == "TOTAL":
            total = fila_de(filas[n])
        elif clave in DEPARTAMENTOS:
            departamentos.append({"nombre": DEPARTAMENTOS[clave], **fila_de(filas[n])})
        elif total is not None and a:
            nota += " " + a
        elif a and total is None:
            raise ValueError(f"fila desconocida en la tabla: {a!r}")

    if total is None:
        raise ValueError("sin fila TOTAL")
    if len(departamentos) != 11 or len({d["nombre"] for d in departamentos}) != 11:
        raise ValueError(f"se esperaban 11 departamentos judiciales, hay {len(departamentos)}")
    for campo in ("entradas", "salidas"):
        suma = sum(d[campo] for d in departamentos)
        if suma != total[campo]:
            raise ValueError(f"los departamentos suman {suma} {campo}, el TOTAL dice {total[campo]}")
    # Rango de lo plausible para un mes del país: 2024–2026 rondan 100–130 mil.
    if not 30_000 <= total["entradas"] <= 400_000 or not 0.3 <= total["salidas"] / total["entradas"] <= 1.6:
        raise ValueError(f"totales inverosímiles: {total['entradas']} entradas, {total['salidas']} salidas")

    departamentos.sort(key=lambda d: (-(d["tasa"] or 0), d["nombre"]))
    return {
        "mes": f"{anio}-{mes:02d}",
        "preliminar": "PRELIMINAR" in sin_tildes(nota),
        "nota": re.sub(r"\s+", " ", nota).strip(),
        "entradas": total["entradas"],
        "salidas": total["salidas"],
        "tasa": total["tasa"],
        "categorias": total["categorias"],
        "departamentos": departamentos,
    }


def leer_mes(urls: list[str], anio: int, mes: int) -> dict | None:
    # Como mucho dos archivos por mes: el limpio y, si no cuadra, el siguiente.
    for url in urls[:2]:
        try:
            z = zipfile.ZipFile(io.BytesIO(get(url, XLSX)))
            hoja = leer_hoja(z, anio, mes)
        except Exception as err:  # noqa: BLE001 — se informa y se prueba el siguiente
            print(f"  ! {url.rsplit('/', 1)[-1]}: {err}", file=sys.stderr)
            continue
        finally:
            time.sleep(0.5)
        pdf = re.sub(r"\.xlsx$", ".pdf", url)
        return {**hoja, "fuente": url, "pdf": pdf}
    return None


def main() -> None:
    indice = get(INDICE, "text/html").decode("utf-8", "replace")
    por_mes = candidatos(indice)
    pdfs = set(urllib.parse.urljoin(INDICE, htmlmod.unescape(h))
               for h in re.findall(r'href="([^"]+\.pdf)"', indice, re.I))
    if len(por_mes) < 12:
        sys.exit(f"el índice lista solo {len(por_mes)} meses de la serie EST_02: ¿cambió de forma?")

    (anio, mes) = max(por_mes)
    actual = leer_mes(por_mes[(anio, mes)], anio, mes)
    if not actual:
        sys.exit(f"no se pudo leer {mes:02d}/{anio}: no se escribe nada")
    anterior = None
    if (anio - 1, mes) in por_mes:
        anterior = leer_mes(por_mes[(anio - 1, mes)], anio - 1, mes)
        if not anterior:
            print(f"  ! {mes:02d}/{anio - 1} listado pero ilegible: se publica sin comparación",
                  file=sys.stderr)
    for d in (actual, anterior):
        if d and d["pdf"] not in pdfs:
            d["pdf"] = None

    data = {
        "generadoEn": datetime.date.today().isoformat(),
        "indice": INDICE,
        "mesesListados": len(por_mes),
        "actual": actual,
        "anterior": anterior,
    }
    with open(SALIDA, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f"{actual['mes']}: {actual['entradas']:,} entradas, {actual['salidas']:,} salidas "
          f"({actual['tasa']:.1%}), preliminar={actual['preliminar']}; "
          + (f"{anterior['mes']}: {anterior['entradas']:,} / {anterior['salidas']:,} ({anterior['tasa']:.1%})"
             if anterior else "sin año anterior")
          + f"; {len(por_mes)} meses en el índice -> {SALIDA}")


if __name__ == "__main__":
    main()
