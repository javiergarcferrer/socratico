#!/usr/bin/env python3
"""Genera public/data/sentencias.json: todas las sentencias que publican en sus
listados el Tribunal Constitucional (desde 2012) y el Tribunal Superior
Electoral (desde 2021), para que el buscador de la plataforma las encuentre
por número, expediente o de qué tratan.

Las páginas `/constitucional` y `/tse` leen esos mismos listados en vivo, un
año a la vez (`lib/tc.ts`, `lib/tse.ts`); el buscador necesita todos los años
juntos y de antemano, y por eso esta instantánea. No sustituye a las páginas.

Mecánica verificada el 2026-09-27 con este User-Agent (docs/INFRAESTRUCTURA.md §5.6):

- **TC.** `tc.gob.do/robots.txt` responde 404: no hay reglas. Un año entero
  cabe en una respuesta: `GET /consultas/secretar%C3%ADa/sentencias?…&size=999999&filtery=AAAA&criteriay=years`
  (la ruta lleva «secretaría» con tilde). Tabla de cuatro columnas: número
  (`TC/0002/12`, enlazado a su ficha), fecha `DD-MM-AAAA`, «Referencia» (el
  expediente, texto libre; «N/D» en parte de 2012) y «Relativo a». Un año
  pesa hasta ~1,1 MB y tarda de 3 a 8 s. 15 peticiones para 2012–2026.
- **TSE.** `visorpdf.tse.do/robots.txt` responde 200 vacío: no hay reglas.
  `GET /?y=AAAA&s=` lista 60 filas por página; las siguientes son
  `?pos=N&y=AAAA&s=`, y se sigue el enlace «Siguiente» porque el paginador es
  una ventana. Misma tabla de cuatro columnas (número en un `<th>`, fecha
  «11 Dic 2024», expediente, «Relativo a»). El selector de años empieza en
  2021. La numeración es irregular (`TSE/007/2021`, `TSE-006-2021`, punto
  final) y un mismo número puede tener dos fichas: la clave es la ficha.
- **El PDF no está en ningún listado.** En el TC vive en un blob de Azure con
  un id opaco que solo da la ficha; en el TSE, la ficha lo incrusta en un
  `<iframe>` (y a veces es un .docx). Sacarlo exigiría una petición por
  sentencia (miles): no se hace. Cada fila enlaza a su **ficha** en el sitio
  del Tribunal, que es el camino al documento.
- El «Relativo a» del TSE arrastra a veces la fórmula de cierre («En la
  ciudad de Santo Domingo de Guzmán…»): se corta en el primer salto de
  párrafo. Los textos se recortan a `MAX_RELATIVO` caracteres: lo que sirve
  para encontrar la sentencia está al principio (la acción y las partes).
  Se quita el «Relativo a» con que empiezan muchas filas: es la cabecera.
- La ficha del TC se deriva del número (`TC/0002/12` → `…/sentencias/tc000212`)
  y solo se guarda (`u`) si alguna fila se aparta de la regla; la del TSE es
  opaca y va siempre.
- ⚠️ El visor del TSE pagina un orden con empates (misma fecha): en 2024
  escaneó 402 filas y solo 396 fichas distintas, así que alguna ficha salió
  en dos páginas y es posible que otras tantas no salieran en ninguna.

Contrato: GET solamente, User-Agent identificable, content-type validado, un
reintento, pausa de cortesía entre peticiones, y **no escribe nada** si un
tribunal no entrega la tabla en algún año (se conserva la instantánea
anterior). No hay datos de contacto: solo lo que el Tribunal publica en su
listado (número, fecha, expediente, de qué trata).

Uso:
    python3 scripts/build-sentencias.py
"""
import datetime
import html as htmlmod
import json
import re
import sys
import time
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from privacidad import sin_cedula  # noqa: E402

UA = "Socratico-Inteligencia/1.0 (sentencias para el buscador; herramienta independiente)"
TC = "https://tc.gob.do"
TC_RUTA = "/consultas/secretar%C3%ADa/sentencias"
TSE = "https://visorpdf.tse.do"
PRIMER_ANIO_TC = 2012
PRIMER_ANIO_TSE = 2021
MAX_PAGINAS_TSE = 20
MAX_RELATIVO = 300
PAUSA = 2.0
SALIDA = "public/data/sentencias.json"

MESES = {
    "ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6,
    "jul": 7, "ago": 8, "sep": 9, "set": 9, "oct": 10, "nov": 11, "dic": 12,
}


def pedir(url: str, espera: int = 90) -> str:
    """GET con un reintento; exige HTML."""
    ultimo = None
    for intento in range(2):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
            with urllib.request.urlopen(req, timeout=espera) as r:
                tipo = r.headers.get("Content-Type", "")
                if "text/html" not in tipo:
                    raise RuntimeError(f"content-type inesperado: {tipo}")
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001 — se reintenta una vez y se informa
            ultimo = e
            if intento == 0:
                time.sleep(PAUSA * 3)
    raise RuntimeError(f"{url}: {ultimo}")


class Tabla(HTMLParser):
    """Las filas de la tabla cuya cabecera dice «Relativo a»: por celda, su
    texto y el primer enlace. También anota si la página ofrece «Siguiente»."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.en_tabla = False
        self.es_la_tabla = False
        self.filas: list[list[tuple[str, str | None]]] = []
        self.fila: list[tuple[str, str | None]] | None = None
        self.celda: list[str] | None = None
        self.href: str | None = None
        self.cabecera: list[str] = []
        self.en_thead = False
        self.en_a = False
        self.texto_a: list[str] = []
        self.siguiente = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "table":
            self.en_tabla, self.es_la_tabla, self.cabecera = True, False, []
        elif tag == "thead":
            self.en_thead = True
        elif tag == "tr" and self.en_tabla and not self.en_thead:
            self.fila = []
        elif tag in ("td", "th") and self.fila is not None:
            self.celda, self.href = [], None
        elif tag == "br" and self.celda is not None:
            self.celda.append("\n")
        elif tag == "a":
            self.en_a, self.texto_a = True, []
            if self.celda is not None and self.href is None:
                self.href = a.get("href")

    def handle_endtag(self, tag):
        if tag == "thead":
            self.en_thead = False
            self.es_la_tabla = any("Relativo a" in c for c in self.cabecera)
        elif tag in ("td", "th") and self.fila is not None and self.celda is not None:
            self.fila.append(("".join(self.celda), self.href))
            self.celda = None
        elif tag == "tr" and self.fila is not None:
            if self.es_la_tabla:
                self.filas.append(self.fila)
            self.fila = None
        elif tag == "table":
            self.en_tabla = False
        elif tag == "a":
            self.en_a = False
            if "".join(self.texto_a).strip() == "Siguiente":
                self.siguiente = True

    def handle_data(self, data):
        if self.en_thead:
            self.cabecera.append(data)
        if self.celda is not None:
            self.celda.append(data)
        if self.en_a:
            self.texto_a.append(data)


def limpio(s: str) -> str:
    return re.sub(r"\s+", " ", htmlmod.unescape(s).replace("\xa0", " ")).strip()


def relativo(s: str) -> str:
    # Primer párrafo: el TSE arrastra la fórmula de cierre tras un salto doble.
    primero = re.split(r"\n\s*\n", s.replace("\r", ""), maxsplit=1)[0]
    # «Relativo a…» ya es la cabecera de la columna: no se repite en cada fila.
    t = re.sub(r"^relativ[oa] a\s+", "", limpio(primero), flags=re.I)
    t = t[:1].upper() + t[1:]
    if len(t) > MAX_RELATIVO:
        t = t[:MAX_RELATIVO].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    # El TC escribe a veces la cédula de una parte («RNC núm. …»): no se escribe.
    return sin_cedula(t)


def tabla(html: str) -> Tabla:
    p = Tabla()
    p.feed(html)
    return p


def ficha_tc(numero: str) -> str:
    """La ficha de una sentencia del TC; la misma regla en scripts/busqueda_sentencias.py."""
    return f"{TC}{TC_RUTA}/tc{numero[3:7]}{numero[8:10]}"


def tc_anio(anio: int) -> list[dict]:
    url = f"{TC}{TC_RUTA}?searchCriteria=&searchString=&size=999999&filtery={anio}&criteriay=years&order=Date"
    p = tabla(pedir(url))
    if not p.es_la_tabla and not p.filas:
        raise RuntimeError(f"TC {anio}: la página no trae la tabla de sentencias")
    r = []
    for fila in p.filas:
        if len(fila) < 4 or not fila[0][1]:
            continue
        numero = limpio(fila[0][0])
        f = re.fullmatch(r"(\d{2})-(\d{2})-(\d{4})", limpio(fila[1][0]))
        if not re.fullmatch(r"TC/\d{4}/\d{2}", numero) or not f:
            continue
        exp = limpio(fila[2][0])
        s = {
            "n": numero,
            "f": f"{f[3]}-{f[2]}-{f[1]}",
            "r": relativo(fila[3][0]),
        }
        # La ficha se deriva del número (`TC/0002/12` → `…/sentencias/tc000212`,
        # verificado en las 11 393 filas de 2012–2026): solo se guarda si difiere.
        ficha = urllib.request.urljoin(TC, fila[0][1]).replace("secretaría", "secretar%C3%ADa")
        if ficha != ficha_tc(numero):
            s["u"] = ficha
        if exp and not re.fullmatch(r"n/?d", exp, re.I):
            s["x"] = exp
        r.append(s)
    if p.filas and not r:
        raise RuntimeError(f"TC {anio}: {len(p.filas)} filas y ninguna legible")
    print(f"  TC {anio}: {len(r)} de {len(p.filas)} filas", file=sys.stderr)
    return r


def fecha_tse(t: str) -> str | None:
    m = re.fullmatch(r"(\d{1,2})\s+([a-záéíóú]+)\.?\s+(\d{4})", limpio(t), re.I)
    if not m:
        return None
    mes = MESES.get(m[2][:3].lower())
    dia = int(m[1])
    if not mes or not 1 <= dia <= 31:
        return None
    return f"{m[3]}-{mes:02d}-{dia:02d}"


def tse_anio(anio: int) -> list[dict]:
    vistas: dict[str, dict] = {}
    escaneadas = 0
    pagina, siguiente = 0, True
    while siguiente and pagina < MAX_PAGINAS_TSE:
        pagina += 1
        url = f"{TSE}/?pos={pagina}&y={anio}&s=" if pagina > 1 else f"{TSE}/?y={anio}&s="
        p = tabla(pedir(url, 30))
        if not p.es_la_tabla:
            raise RuntimeError(f"TSE {anio} p{pagina}: la página no trae la tabla de sentencias")
        leidas = 0
        for fila in p.filas:
            escaneadas += 1
            if len(fila) < 4 or not fila[0][1]:
                continue
            numero = re.sub(r"[.,;\s]+$", "", limpio(fila[0][0]))
            if not re.fullmatch(r"TSE[-/ ]?\d+[-/]\d{4}", numero, re.I):
                continue
            ficha = urllib.request.urljoin(TSE, fila[0][1])
            leidas += 1
            if ficha in vistas:
                continue
            s = {"n": numero, "r": relativo(fila[3][0]), "u": ficha}
            f = fecha_tse(fila[1][0])
            if f:
                s["f"] = f
            exp = re.sub(r"[.,;\s]+$", "", limpio(fila[2][0]))
            if exp:
                s["x"] = exp
            vistas[ficha] = s
        if p.filas and not leidas:
            raise RuntimeError(f"TSE {anio} p{pagina}: {len(p.filas)} filas y ninguna legible")
        siguiente = p.siguiente and leidas > 0
        time.sleep(PAUSA / 2)
    if siguiente:
        raise RuntimeError(f"TSE {anio}: el tope de {MAX_PAGINAS_TSE} páginas cortó la lectura")
    print(f"  TSE {anio}: {len(vistas)} de {escaneadas} filas en {pagina} páginas", file=sys.stderr)
    return list(vistas.values())


def num(s: dict) -> int:
    m = re.search(r"(\d+)[-/]\d{2,4}$", s["n"])
    return int(m[1]) if m else 0


def orden(lista: list[dict]) -> list[dict]:
    # Fecha descendente, luego número descendente, luego ficha: estable.
    return sorted(lista, key=lambda s: (s.get("f") or "", num(s), s.get("u", s["n"])), reverse=True)


def main() -> None:
    hoy = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-4)))
    tc: list[dict] = []
    for anio in range(hoy.year, PRIMER_ANIO_TC - 1, -1):
        tc += tc_anio(anio)
        time.sleep(PAUSA)
    tse: list[dict] = []
    for anio in range(hoy.year, PRIMER_ANIO_TSE - 1, -1):
        tse += tse_anio(anio)

    # El listado del TC es por año: una sentencia no aparece en dos años, pero
    # si el portal repitiera una fila, cuenta una vez.
    tc = list({s["n"]: s for s in tc}.values())
    if len(tc) < 1000 or len(tse) < 100:
        sys.exit(f"cobertura sospechosa (TC {len(tc)}, TSE {len(tse)}): no se escribe nada")

    salida = {
        "generado": hoy.date().isoformat(),
        "fuentes": {
            "tc": f"{TC}{TC_RUTA}",
            "tse": f"{TSE}/",
        },
        # Plantilla de la ficha del TC; «{}» es el número sin barras en minúscula.
        "ficha_tc": f"{TC}{TC_RUTA}/tc{{}}",
        "tc": orden(tc),
        "tse": orden(tse),
    }
    with open(SALIDA, "w", encoding="utf-8") as fh:
        json.dump(salida, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"TC {len(tc)} · TSE {len(tse)} → {SALIDA}", file=sys.stderr)


if __name__ == "__main__":
    main()
