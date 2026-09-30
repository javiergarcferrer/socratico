#!/usr/bin/env python3
"""Genera public/data/funcionarios.json: quién ocupa cada cargo público y qué
cargos ha ocupado cada persona, según lo que el propio Estado publica.

Es la capa de personas del grafo (docs/PLAN-ACCESO.md §6 quater): la ficha
`/funcionarios/[slug]`, el directorio `/funcionarios` y el bloque «¿Quién la
dirige?» de cada institución. Mecánica verificada en docs/AUDITORIA.md §H
(cuarta pasada, 2026-09-29). Una lectura por fuente, en build, con el
User-Agent identificable; nunca en una visita.

Fuentes, en el orden en que se leen:

1. **MAP — Directorio de Funcionarios** del Observatorio de Servicios Públicos
   (`observicios.gob.do`, el mismo que enlaza el Portal Único de
   Transparencia). `POST /back/api/portal/funcionarios` con `{page, rows}`: es
   la consulta que hace la página pública, sin sesión ni clave; `rows: 500`
   baja los ~6,150 servidores en 13 lecturas. Trae nombre, cargo, unidad,
   institución, número y fecha del decreto y un orden jerárquico. Se
   **descartan al leer** el género, los teléfonos, el correo, la extensión,
   la foto y los dos campos de declaración jurada (`declara` viene en falso
   para todos, el Presidente incluido: no es fiable).
2. **Consultoría Jurídica — todos los decretos** (`POST /api/consultas/search`
   con `DocumentTypeCode: 3` y el año vacío, una lectura, ~75 MB, ~60 s):
   78,834 desde 1844, con el **firmante** (`Presidente`). Las designaciones y
   los ceses se leen del **título** desde el 16-08-1996, cuando nombra a una
   sola persona («QUE DESIGNA AL SEÑOR X, CARGO»). Los que nombran a varias
   («QUE DESIGNA FUNCIONARIOS EN DISTINTAS DEPENDENCIAS») se leen del **PDF**
   (`GET /api/document/{DocId}`, con texto, «Artículo N.- X queda designado
   Y») desde el 16-08-2012; antes el PDF es un escaneo con OCR ruidoso
   («seiior», «Alfred0») y no se lee. La cédula que trae la fila del buscador
   **no se guarda nunca**: se descarta antes de escribir la caché.
3. **Altas cortes y órganos**: Suprema Corte y Consejo del Poder Judicial (WP
   REST de `poderjudicial.gob.do`; su servidor omite el intermedio de
   Sectigo, que va en `scripts/certificados/`), Tribunal Constitucional (HTML),
   Tribunal Superior Electoral (WP REST de `tse.do`, con las gestiones
   anteriores), Junta Central Electoral (titulares y suplentes, HTML) y
   Defensor del Pueblo (WP REST). Solo nombre, cargo y período: las
   biografías traen cónyuge, hijos y lugar de nacimiento y no se leen.
4. **JCE — relación de candidatos electos en las municipales de 2024**
   (XLSX, ~3,860 filas): alcaldes, vicealcaldes, regidores, directores,
   subdirectores y vocales de distrito municipal, con su partido y sus votos.
   Se descarta el sexo.
5. **Congreso**: los legisladores del período en `public/data/congreso.json`
   (sin red).

Una persona es su **nombre normalizado** (sin tildes, en minúscula): nunca la
cédula. Dos fuentes que escriben el nombre igual son la misma persona; si lo
escriben distinto, son dos fichas, y la ficha lo avisa. La única excepción es
el firmante de los decretos, que la Consultoría escribe corto («LUIS
ABINADER»): se ata a quien el MAP pone como Presidente de la República solo si
todas las palabras de la firma están en su nombre.

**Persona expuesta políticamente.** La Ley 155-17 (art. 2, núm. 19) dice que
«los cargos considerados PEP serán todos aquellos funcionarios obligados a
presentar declaración jurada de bienes», y esos los enumera la Ley 311-14 en
su art. 2. `numeral_311()` asigna el numeral por el texto del cargo, con
reglas conservadoras: si no casa con claridad, no se marca. Nunca se publica
un parentesco (docs/DECISIONES.md, «Es familiar de no se publica»).

Se niega a escribir si una fuente principal llega vacía o por debajo de lo
plausible. Regenerar tras un día de decretos masivos o cada semana:

    python3 scripts/build-funcionarios.py [--cache DIR] [--sin-red]

**Dependencias de build**: `pdfminer.six` (lee el texto de los PDF; pypdf
parte palabras como «Alm ánzar») y `openpyxl` (el XLSX de la JCE). Solo las
usa este script: la app no las importa y no van en package.json.
"""
import argparse
import datetime
import html as htmlmod
import io
import json
import pathlib
import re
import signal
import ssl
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
# El registro de decretos se lee igual aquí y en scripts/build-decretos.py.
from consultoria_decretos import (CONSULTORIA, fecha_de_cache, fecha_iso,  # noqa: E402
                                  firmas_presidenciales, leer_decretos, limpio)

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "data" / "funcionarios.json"
INSTITUCIONES = RAIZ / "public" / "data" / "instituciones.json"
CONGRESO = RAIZ / "public" / "data" / "congreso.json"
CERT_PJ = RAIZ / "scripts" / "certificados" / "sectigo-ov-r36.pem"

UA = "Socratico-Inteligencia/1.0 (funcionarios y cargos públicos; herramienta independiente)"

MAP_URL = "https://observicios.gob.do/back/api/portal/funcionarios"
MAP_PUBLICO = "https://observicios.gob.do/officials"
JCE_ELECTOS = ("https://elecciones2024.jce.gob.do/DesktopModules/EasyDNNNews/DocumentDownload.ashx"
               "?portalid=0&moduleid=469&articleid=10&documentid=14")
JCE_ELECTOS_PAGINA = ("https://elecciones2024.jce.gob.do/sala-de-prensa/"
                      "relacion-general-definitiva-del-computo-del-proceso-municipal-2024")
SCJ = "https://poderjudicial.gob.do/wp-json/wp/v2/pages?slug=jueces-actuales-spj&_fields=id,link,modified,content"
CPJ = "https://poderjudicial.gob.do/wp-json/wp/v2/pages?slug=composicion-cpj&_fields=id,link,modified,content"
TC = "https://tribunalconstitucional.gob.do/sobre-el-tc/pleno/magistrados/"
TSE = "https://tse.do/wp-json/wp/v2/pages?slug=pleno-tse&_fields=id,link,modified,content"
JCE_TITULARES = "https://jce.gob.do/Miembros-Titulares"
JCE_SUPLENTES = "https://jce.gob.do/Miembros-Suplentes"
DEFENSOR = ("https://defensordelpueblo.gob.do/wp-json/wp/v2/pages?slug=despacho-defensor-del-pueblo"
            "&_fields=id,link,modified,content")

DESDE_TITULOS = "1996-08-16"
DESDE_PDF = "2012-08-16"

# ---------------------------------------------------------------- red

_ultimo: dict[str, float] = {}


class Rechazo(Exception):
    """El origen dijo que no (403, 470, desafío): no se reintenta ni se rodea."""


class NoExiste(Exception):
    """El origen dice que eso no está (404, 410): no se reintenta."""


# Los PDF que no se pudieron bajar por la red (no los que no existen): si son
# muchos, la instantánea no se escribe.
_fallos_pdf: list[int] = []


def pedir(url: str, *, datos: bytes | None = None, tipo: str | None = None,
          cabeceras: dict | None = None, pausa: float = 1.0, espera: int = 60,
          contexto: ssl.SSLContext | None = None) -> tuple[bytes, dict]:
    """GET (o el POST de consulta que hace la página pública), con pausa por
    host, un reintento ante fallo de red y validación del content-type."""
    host = urllib.parse.urlsplit(url).netloc
    for intento in (1, 2):
        falta = pausa - (time.monotonic() - _ultimo.get(host, 0.0))
        if falta > 0:
            time.sleep(falta)
        h = {"User-Agent": UA, "Accept": "*/*", "Accept-Encoding": "identity"}
        h.update(cabeceras or {})
        req = urllib.request.Request(url, data=datos, headers=h, method="POST" if datos is not None else "GET")
        try:
            with urllib.request.urlopen(req, timeout=espera, context=contexto) as r:
                cuerpo = r.read()
                meta = {"tipo": r.headers.get("content-type") or "",
                        "codificacion": r.headers.get("content-encoding") or "",
                        "modificado": r.headers.get("last-modified") or ""}
        except urllib.error.HTTPError as e:
            _ultimo[host] = time.monotonic()
            if e.code in (401, 403, 429, 470):
                raise Rechazo(f"{url}: HTTP {e.code}")
            if e.code in (404, 410):
                raise NoExiste(f"{url}: HTTP {e.code}")
            if intento == 2:
                raise
            time.sleep(5)
            continue
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            _ultimo[host] = time.monotonic()
            if intento == 2:
                raise
            print(f"  reintento tras: {e}", file=sys.stderr)
            time.sleep(5)
            continue
        _ultimo[host] = time.monotonic()
        if meta["codificacion"] == "br":
            try:
                import brotli  # noqa: PLC0415 — solo si el origen fuerza brotli (la JCE)
            except ImportError:
                raise Rechazo(f"{url}: responde en brotli y falta el módulo `brotli`")
            cuerpo = brotli.decompress(cuerpo)
        if tipo and not re.search(tipo, meta["tipo"], re.I):
            raise Rechazo(f"{url}: se esperaba {tipo} y llegó {meta['tipo']!r}")
        return cuerpo, meta
    raise RuntimeError("inalcanzable")


def contexto_pj() -> ssl.SSLContext:
    """TLS con el intermedio que el servidor del Poder Judicial no envía."""
    ctx = ssl.create_default_context()
    ctx.load_verify_locations(cafile=str(CERT_PJ))
    return ctx


# ---------------------------------------------------------------- texto

PARTICULAS = {"de", "del", "la", "las", "los", "y", "e", "o", "u", "en", "para", "por", "a",
              "al", "con", "ante", "sobre", "sin", "entre", "el"}


def sin_tildes(s: str) -> str:
    return unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode()


def clave(nombre: str) -> str:
    """La clave de una persona: el nombre sin tildes, signos ni mayúsculas."""
    s = sin_tildes(nombre).lower()
    s = re.sub(r"[^a-z0-9ñ ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def slug(nombre: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", clave(nombre)).strip("-")[:90]


def capital(palabra: str) -> str:
    """«d’aza» → «D’Aza», «pérez-tejada» → «Pérez-Tejada», «(el» → «(El»."""
    def primera(p: str) -> str:
        m = re.search(r"[^\W\d_]", p)
        return p[:m.start()] + p[m.start()].upper() + p[m.start() + 1:] if m else p
    partes = re.split(r"([\-’'])", palabra)
    return "".join(primera(p) if p not in "-’'" else p for p in partes)


def en_titulo(s: str, sigla_max: int = 8) -> str:
    """Un texto en MAYÚSCULAS a tipo título español: partículas en minúscula,
    siglas entre paréntesis intactas («(DIECOM)»)."""
    s = limpio(s)
    if not s:
        return s
    s = re.sub(r"\.(?=[A-ZÁÉÍÓÚÑ])", ". ", s)          # «F.BONELLY» → «F. BONELLY»
    salida = []
    for i, w in enumerate(s.split(" ")):
        if re.fullmatch(r"[A-ZÁÉÍÓÚÑ]\.", w):                # una inicial: «A.», no la partícula «a»
            salida.append(w)
            continue
        # Una sigla entre paréntesis se queda como está: «(DIECOM)». Con tilde
        # es una palabra, no una sigla: «(HONORÍFICA)».
        if re.fullmatch(r"\([A-Z0-9\.\-]{2,%d}\)[,;.]?" % sigla_max, w):
            salida.append(w)
            continue
        if re.fullmatch(r"[IVXL]{2,5}[,;.]?", w):
            salida.append(w)
            continue
        base = w.lower()
        salida.append(base if i > 0 and base.strip(",.;") in PARTICULAS else capital(base))
    return " ".join(salida)


def nombre_legible(n: str) -> str:
    """Un nombre como lo escribe la fuente, o a tipo título si viene en mayúsculas."""
    n = limpio(n)
    letras = [c for c in n if c.isalpha()]
    mayus = sum(1 for c in letras if c.isupper())
    if letras and mayus / len(letras) > 0.8:
        return en_titulo(n)
    # «Pablo ULLOA»: un apellido en mayúsculas dentro de un nombre normal.
    return " ".join(capital(w.lower()) if len(w) > 2 and w.isupper() else w for w in n.split(" "))


def cargo_legible(c: str) -> str:
    c = limpio(c)
    if not c:
        return c
    letras = [x for x in c if x.isalpha()]
    if letras and sum(1 for x in letras if x.isupper()) / len(letras) > 0.8:
        c = en_titulo(c)
    return c[:1].upper() + c[1:]


# ---------------------------------------------------------- nombres válidos

# Palabras que no pueden estar en un nombre de persona: si aparecen, la
# expresión regular tomó un pedazo del cargo o del título.
NO_NOMBRE = set("""
representante organizacion ministerio ministro ministra direccion director directora consejo comision
secretaria secretario republica nacional instituto banco junta oficina cuerpo fuerza fuerzas embajada
embajador embajadora consul viceministro viceministra general dominicana dominicano gobierno estado
decreto articulo presidente presidenta vicepresidente administrador administradora gerente sus
funcionarios varios varias siguientes personas miembros senores senoras cargo cargos provincia municipio
distrito ayuntamiento hospital universidad autoridad superintendencia tribunal corte procuraduria
gobernador gobernadora subdirector subdirectora encargado encargada asesor asesora coordinador coordinadora
inspector inspectora jefe jefa comandante subsecretario subsecretaria tesorero tesorera contralor contralora
procurador procuradora juez jueza agregado agregada consejero consejera delegado delegada interventor
interventora comisionado comisionada supervisor supervisora presidencia aeropuerto edificio oficinas
departamento division unidad administracion proyecto nombre bomberos
""".split())
# «nombre»: «QUE DESIGNA CON EL NOMBRE DE X EL EDIFICIO…» pone un nombre a una
# obra y no nombra a nadie; el mismo título puede designar además a una persona
# («…Y DESIGNA A LA DRA. X, DIRECTORA»), que sí se lee.


def es_nombre(n: str) -> bool:
    palabras = clave(n).split()
    if not 2 <= len(palabras) <= 9:
        return False
    if any(p in NO_NOMBRE for p in palabras):
        return False
    if re.search(r"\d", n):
        return False
    # Una letra suelta sin punto es un corte del reconocimiento óptico
    # («W illiams»), no una inicial («Leonel A. Muñoz»).
    for w in n.split():
        w = w.strip(",;:")
        if len(w) == 1 and w.lower() not in ("y", "e"):
            return False
    return sum(1 for p in palabras if p not in PARTICULAS) >= 2


# Un tratamiento pegado al nombre («Sr. Adriano…», «Licda Neliza…») no es el
# nombre; un sujeto en plural («Los Dres. …», «Los Agregados…») nombra a varias
# personas a la vez y esta lectura no sabe separarlas: se descarta.
TRATAMIENTO_NOMBRE = re.compile(
    # «De manera honorífica al señor X», «Al Sra. X», «El. Ing. X»: lo que
    # queda delante del nombre cuando el título lo trae con su preposición.
    r"^(?:de\s+manera\s+honor[ií]fica\s+)?(?:(?:al|a\s+la|el\.?|la)\s+)?"
    r"(?:(?:se[ñn]or(?:a|ita)?|sr(?:a|ta)?\.?|lic(?:da|do)?\.?|licenciad[oa]|dr(?:a)?\.?|"
    r"doctor(?:a)?|ing\.?|ingenier[oa]|arq\.?|arquitect[oa]|prof\.?|profesor(?:a)?|monse[ñn]or)\s+)+",
    re.I,
)


def depurar_nombre(n: str | None) -> str | None:
    n = limpio(n or "")
    if re.match(r"(?i)(?:los|las)\s", n):
        return None
    n = TRATAMIENTO_NOMBRE.sub("", n)
    return n if es_nombre(n) else None


# ------------------------------------------------ títulos de los decretos

TRATAMIENTO = (
    r"(?:SE(?:Ñ|N)OR(?:A|ITA)?|SR(?:A|TA)?\.?|LICENCIAD[OA]|LIC(?:DA|DO)?\.?|DOCTOR(?:A)?|DRA?\.?|INGENIER[OA]|ING\.?|"
    r"ARQUITECT[OA]|ARQ\.?|AGR[OÓ]NOMO|AGRON\.?|PROFESOR(?:A)?|PROF\.?|MONSE(?:Ñ|N)OR|PADRE|REVERENDO|"
    r"MAGISTRAD[OA]|EMBAJADOR(?:A)?|MINISTRO CONSEJERO)"
)
GRADO = (
    r"(?:GENERAL DE (?:BRIGADA|DIVISI[OÓ]N)(?: PILOTO)?|MAYOR GENERAL(?: PILOTO)?|TENIENTE GENERAL(?: PILOTO)?|"
    r"CONTRALMIRANTE|VICEALMIRANTE|ALMIRANTE|CORONEL(?: PILOTO)?|TENIENTE CORONEL(?: PILOTO)?|"
    r"CAPIT[AÁ]N DE (?:NAV[IÍ]O|FRAGATA|CORBETA)|MAYOR(?: PILOTO)?|CAPIT[AÁ]N(?: PILOTO)?|"
    r"PRIMER TENIENTE|SEGUNDO TENIENTE|COMISIONAD[OA])"
)
# Rama tras el nombre: «, ERD», «, E.R.D.,», «, FARD.», «, P.N.», «ERD (DEM)», y las
# siglas de antes de 2008: «, F.A.D.,», «, E.N.,», «, M. de G.,».
RAMA = (r"(?:\s*,?\s*\(?(?:E\.?\s?R\.?\s?D|A\.?\s?R\.?\s?D|F\.?\s?A\.?\s?R\.?\s?D|F\.?\s?A\.?\s?D|E\.\s?N|"
        r"M\.\s?DE\s?G|P\.?\s?N|M\.?\s?I\.?\s?D\.?\s?E)"
        r"\.?\)?(?:\s*\((?:DEM|DESN|DEMA|MA)\)\.?)?)")
PALABRA = r"[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ'’\.\-]*"
NOMBRE = rf"{PALABRA}(?:\s+(?:DE LOS|DE LAS|DE LA|DEL|DE|Y|{PALABRA}))*?"
TRATS = rf"(?:(?:{TRATAMIENTO})\.?\s+)*"
VERBO = r"(?:DESIGNA|NOMBRA|CONFIRMA|RATIFICA|ENCARGA)(?:\s+INTERINAMENTE)?"

# «Designa al señor…», y también como a veces lo escribe el título: «designa la
# señora…», «nombra al la señora…».
UNO = re.compile(
    rf"\b(?P<verbo>{VERBO})\s+(?:(?:AL|A LA|A)\s+)?(?:(?:LA|EL)\s+)?{TRATS}(?:(?P<grado>{GRADO})\s*,?\s+)?"
    rf"{TRATS}(?P<nombre>{NOMBRE})(?P<rama>{RAMA})?\s*,\s*(?:COMO\s+)?(?P<cargo>[^;]+?)(?=\.\s|\.$|;|$)"
)
ASCIENDE = re.compile(
    rf"\bASCIENDE\s+(?:AL|A LA)\s+{TRATS}(?:(?P<grado>{GRADO})\s*,?\s+)?{TRATS}(?P<nombre>{NOMBRE})(?P<rama>{RAMA})?\s*,?\s*"
    rf"AL RANGO DE [^,]+?,?\s*Y\s+(?:LO|LA)\s+(?:DESIGNA|NOMBRA)\s+(?:COMO\s+)?(?P<cargo>[^;]+?)(?=\.\s|\.$|;|$)"
)
DESIGNO = re.compile(
    rf"\bQUE\s+(?:DESIGN[OÓ]|NOMBR[OÓ])\s+(?:AL|A LA|A)\s+{TRATS}(?:(?P<grado>{GRADO})\s*,?\s+)?"
    rf"{TRATS}(?P<nombre>{NOMBRE})(?P<rama>{RAMA})?\s*,\s*(?:COMO\s+)?(?P<cargo>[^;]+?)(?=\.\s|\.$|;|$)"
)
RENUNCIA = re.compile(
    rf"\bACEPTA\s+LA\s+RENUNCIA\s+(?:PRESENTADA\s+POR\s+(?:EL\s+|LA\s+)?|DEL?\s+|DE LA\s+){TRATS}(?:(?P<grado>{GRADO})\s*,?\s+)?"
    rf"{TRATS}(?P<nombre>{NOMBRE})(?P<rama>{RAMA})?\s*,?\s*(?:AL CARGO DE|COMO|A SU CARGO DE)\s+(?P<cargo>[^;]+?)(?=\.\s|\.$|;|$)"
)
EXCLUIR_TITULO = re.compile(r"EXEQU[AÁ]TUR|PENSI[OÓ]N|JUBILACI[OÓ]N|CONDECORACI[OÓ]N|NATURALIZ|INDULTO|CONMUTA|"
                            r"PERSONALIDAD JUR[IÍ]DICA|INCORPORA")
VARIOS = re.compile(r"\b(A LOS|A LAS|VARIOS|VARIAS|FUNCIONARIOS|MIEMBROS|SIGUIENTES|\(\d+\))\b")
# Donde un cargo del título deja de ser el cargo: sigue otra persona o un detalle.
CORTE_CARGO = re.compile(r",?\s+Y\s+(?:A|AL|A LA|A LOS|A LAS)\s+(?:SE(?:Ñ|N)OR|[A-ZÁÉÍÓÚÑ]{3,}\s+[A-ZÁÉÍÓÚÑ]).*$|"
                         r",\s*(?:CON SUELDO|EN SUSTITUCI[OÓ]N|EN ADICI[OÓ]N|QUIEN\b|MEDIANTE\b).*$|"
                         r"\.\s*(?:DEROGA|MODIFICA|DEJA|DISPONE)\b.*$|"
                         r",?\s+Y\s+(?:DICTA|DISPONE|DEROGA|MODIFICA|DEJA SIN EFECTO)\b.*$|"
                         r",?\s+Y\s+(?:A\s+)?(?:VARIOS|OTROS|DIVERSOS)\s+(?:FUNCIONARIOS|MIEMBROS|SERVIDORES)\b.*$|"
                         r",?\s+Y\s+(?:NOMBRA|DESIGNA|CONFIRMA)\b.*\b(?:VARIOS|OTROS|DIVERSOS)\b.*$")


def personas_del_titulo(titulo: str) -> tuple[list[dict], bool]:
    """Las designaciones y ceses que el título dice con nombre, y si el
    decreto nombra a varias personas (entonces manda el PDF)."""
    t = re.sub(r"\s+", " ", (titulo or "").upper()).strip()
    if EXCLUIR_TITULO.search(t):
        return [], False
    # «Designa a X y a Y, subdirector de … y gobernador de …, respectivamente»:
    # el título empareja por orden y esta lectura los cruzaría. Manda el PDF;
    # antes de que se lean los PDF, esas designaciones no se toman.
    if re.search(r"\bRESPECTIVAMENTE\b", t):
        return [], True
    varios = bool(VARIOS.search(t))
    hallados: list[tuple[str, re.Match]] = []
    for m in ASCIENDE.finditer(t):
        hallados.append(("designa", m))
    for m in UNO.finditer(t):
        verbo = m.group("verbo")
        hallados.append(("confirma" if verbo.startswith(("CONFIRMA", "RATIFICA")) else "designa", m))
    for m in DESIGNO.finditer(t):
        hallados.append(("cesa", m))
    for m in RENUNCIA.finditer(t):
        hallados.append(("renuncia", m))
    salida = []
    vistos = set()
    for mov, m in hallados:
        nombre = limpio(m.group("nombre"))
        if re.search(r"\sY\s", nombre) and not re.search(r"\bDE\s+\S+\s+Y\s", nombre):
            varios = True
            continue
        if re.match(r"(?:LOS|LAS)\s", nombre):
            varios = True
            continue
        nombre = depurar_nombre(nombre)
        if not nombre:
            continue
        # «…, y al señor Z, director de…»: lo que siguió a la coma es otra persona.
        if re.match(r"Y\s+(?:A|AL|A LA|A LOS|A LAS)\s", m.group("cargo")):
            varios = True
            continue
        cargo = CORTE_CARGO.sub("", m.group("cargo"))
        if re.search(r",\s+Y\s+(?:A|AL|A LA|A LOS|A LAS)\s", m.group("cargo")):
            varios = True
        cargo = limpio(cargo)
        if len(cargo) < 4 or es_nombre(cargo):
            continue
        k = (clave(nombre), mov)
        if k in vistos:
            continue
        vistos.add(k)
        salida.append({"mov": mov, "nombre": nombre, "grado": limpio(m.group("grado") or "") or None,
                       "cargo": cargo})
    return salida, varios


# La provincia de una gobernación, como la escribe la fuente: la unidad del MAP
# («Oficina de Gobernación Provincial de La Vega») o el cargo del decreto
# («Gobernadora Civil de la Provincia Pedernales»). La interfaz la casa con su
# tabla de provincias y alias (lib/provincias.ts); lo que no case no se asigna.
GOBERNACION = re.compile(
    r"^(?:oficina de )?gobernaci[oó]n provincial de (?P<unidad>[^,;(]+)|"
    r"^gobernador[a]?(?: civil)?(?: interin[oa])?(?: provincial)? de la provincia (?:de )?(?P<cargo>[^,;(]+)",
    re.I,
)


def provincia_de_gobernacion(texto: str | None) -> str | None:
    m = GOBERNACION.match(limpio(texto or ""))
    if not m:
        return None
    return nombre_legible(limpio(m.group("unidad") or m.group("cargo")).rstrip("."))


def es_designacion(titulo: str) -> bool:
    t = sin_tildes((titulo or "").upper())
    if EXCLUIR_TITULO.search((titulo or "").upper()):
        return False
    return bool(re.search(r"\b(DESIGNA|NOMBRA|CONFIRMA|RATIFICA|ENCARGA|INTEGRA)\b", t) or
                re.search(r"\b(QUE DESIGNO|QUE NOMBRO|ACEPTA LA RENUNCIA|DEJA SIN EFECTO)\b", t))


# -------------------------------------------------- artículos de un PDF

GRADO_PDF = (r"(?:General de (?:Brigada|División)(?: Piloto)?|Mayor General(?: Piloto| Técnico de Aviación)?|"
             r"Teniente General(?: Piloto)?|Técnico de Aviación|"
             r"Contralmirante|Vicealmirante|Almirante|Coronel(?: Piloto)?|Teniente Coronel(?: Piloto)?|"
             r"Capitán de (?:Navío|Fragata|Corbeta)|Mayor(?: Piloto)?|Capitán(?: Piloto)?|Primer Teniente|"
             r"Segundo Teniente|Comisionad[oa])")
TRAT_PDF = (r"(?:(?:señor(?:a|ita)?|Sr(?:a|ta)?\.|Lic(?:da|do)?\.|Lie(?:da)?\.|Licenciad[oa]|Dr(?:a)?\.|Doctor(?:a)?|Ing\.|Ingenier[oa]|"
            r"Arq\.|Arquitect[oa]|Prof\.|Profesor(?:a)?|Monseñor|Embajador(?:a)?|Magistrad[oa])\s+)*")
PAL_PDF = r"[A-ZÁÉÍÓÚÑÜ][a-záéíóúñüA-ZÁÉÍÓÚÑÜ'’\.\-]*"
NOMBRE_PDF = rf"{PAL_PDF}(?:\s+(?:de los|de las|de la|del|de|y|De|Del|{PAL_PDF}))*?"
ART_QUEDA = re.compile(
    rf"^(?:(?:El|La)\s+)?(?:(?P<grado>{GRADO_PDF})\s*,?\s+)?{TRAT_PDF}(?P<nombre>{NOMBRE_PDF})\s*"
    rf"(?:\((?P<rama>[A-Z\.\s]{{2,12}})\))?\s*"
    rf"(?:,\s*(?P<rama2>E\.?R\.?D|A\.?R\.?D|F\.?A\.?R\.?D|F\.?\s?A\.?\s?D|E\.?\s?N|M\.\s?de\s?G|P\.?\s?N)\.?\s*)?,?\s*"
    rf"(?:(?:es|fue)\s+ascendid[oa]\s+a[l]?\s+(?:rango de\s+)?[^,]+?,?\s*(?:y\s+)?)?"
    rf"queda(?:n)?\s+(?P<mov>designad[oa]s?|nombrad[oa]s?|confirmad[oa]s?|ratificad[oa]s?|encargad[oa]s?)\s+"
    rf"(?:(?:como|en el cargo de|en calidad de)\s+)?(?P<cargo>.+)$"
)
ART_SE = re.compile(
    rf"^Se\s+(?P<mov>designa|nombra|confirma|ratifica)\s+(?:(?:a|al)\s+)?(?:(?:la|el)\s+)?{TRAT_PDF}"
    rf"(?:(?P<grado>{GRADO_PDF})\s*,?\s+)?(?P<nombre>{NOMBRE_PDF})\s*(?:\((?P<rama>[A-Z\.\s]{{2,12}})\))?\s*,\s*"
    rf"(?:(?:como|en el cargo de)\s+)?(?P<cargo>.+)$"
)
# «El Coronel X (PN), es ascendido al rango de general de brigada»: un ascenso sin
# cargo, pero un oficial general es PEP (Ley 311-14, art. 2, num. 23).
ART_ASCIENDE = re.compile(
    rf"^(?:(?:El|La)\s+)?(?P<grado>{GRADO_PDF})\s*,?\s+(?P<nombre>{NOMBRE_PDF})\s*(?:\((?P<rama>[A-Z\.\s]{{2,12}})\))?\s*,?\s*"
    rf"(?:es|son|queda)\s+ascendid[oa]s?\s+al?\s+(?:rango de\s+)?(?P<nuevo>[^,.;]+?)\s*\.?$"
)
SUSTITUCION = re.compile(rf",?\s*en\s+sustituci[oó]n\s+de(?:l| la)?\s+{TRAT_PDF}(?:(?:{GRADO_PDF})\s*,?\s+)?"
                         rf"(?P<nombre>{NOMBRE_PDF})(?=\s*(?:,|\(|\.|;|$| quien| designad| en | que ))", re.I)
FIN_CARGO = re.compile(r",?\s*(?:en\s+sustituci[oó]n\s+de|con\s+sueldo|quien\s+ocupar[aá]|"
                       r"designad[oa]\s+mediante|en\s+adici[oó]n\s+a).*$", re.I)


def texto_normalizado(texto: str) -> str:
    t = texto.replace(" ", " ").replace("​", "")
    t = re.sub(r"^\s*-\s*\d+\s*-\s*$", " ", t, flags=re.M)      # «-24-» del pie de página
    t = re.sub(r"^\s*_{5,}\s*$", " ", t, flags=re.M)             # la raya del folio
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\s*\n\s*", " ", t)
    return t


def articulos(texto: str) -> list[str]:
    t = texto_normalizado(texto)
    i = re.search(r"D\s?E\s?C\s?R\s?E\s?T\s?O\s*:", t)
    if i:
        t = t[i.end():]
    fin = re.search(r"\bDADO\s+en\b", t)
    if fin:
        t = t[:fin.start()]
    partes = re.split(r"\b(?:Art[íi]culo|ART[ÍI]CULO|Art\.)\s*(?:\d+|[ÚU]nico|UNICO)\s*[\.\-–:]*\s*", t)
    return [limpio(p) for p in partes[1:] if limpio(p)]


def personas_del_pdf(texto: str) -> list[dict]:
    salida = []
    for art in articulos(texto):
        m = ART_QUEDA.match(art) or ART_SE.match(art)
        if not m:
            a = ART_ASCIENDE.match(art)
            ascendido = depurar_nombre(a.group("nombre")) if a else None
            if ascendido:
                nuevo = limpio(a.group("nuevo"))
                salida.append({"mov": "asciende", "nombre": ascendido, "grado": nuevo[:1].upper() + nuevo[1:],
                               "cargo": f"Ascenso a {nuevo}", "sustituye": None})
            continue
        nombre = depurar_nombre(m.group("nombre"))
        if not nombre:
            continue
        cargo_bruto = m.group("cargo")
        sust = SUSTITUCION.search(cargo_bruto)
        cargo = limpio(FIN_CARGO.sub("", cargo_bruto))
        cargo = re.sub(r"\.\s.*$", "", cargo)          # lo que sigue al primer punto es otra disposición
        if len(cargo) < 4:
            continue
        mov = m.group("mov").lower()
        salida.append({
            "mov": "confirma" if mov.startswith(("confirm", "ratific")) else "designa",
            "nombre": nombre,
            "grado": limpio(m.group("grado") or "") or None,
            "cargo": cargo,
            "sustituye": depurar_nombre(sust.group("nombre")) if sust else None,
        })
    return salida


# ------------------------------------------------ institución de un cargo

def plano(s: str) -> str:
    s = sin_tildes(s).lower()
    s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"\bgral\b", "general", s)
    s = re.sub(r"\bdir\b", "direccion", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


# Del nombre del cargo al de la institución: «ministro de Educación» vive en
# el «Ministerio de Educación».
DEL_CARGO_A_LA_INSTITUCION = [
    (r"\bviceministr[oa]s?\b(?!.*\bministerio\b)", "ministerio"),
    (r"^ministr[oa]s?\b(?!\s+consejer)(?!.*\bministerio\b)", "ministerio"),
    (r"\b(sub)?director[a]? general de\b", "direccion general de"),
    (r"\b(sub)?director[a]? nacional de\b", "direccion nacional de"),
    (r"\bsuperintendente de\b", "superintendencia de"),
    (r"\bprocurador[a]? general de la republica\b", "procuraduria general de la republica"),
    (r"\bcontralor[a]? general de la republica\b", "contraloria general de la republica"),
    (r"\b(sub)?consultor[a]? juridic[oa] del poder ejecutivo\b", "consultoria juridica del poder ejecutivo"),
    (r"\btesorer[oa] nacional\b", "tesoreria nacional"),
]


VACIAS = {"de", "del", "la", "las", "los", "el", "y", "e", "para", "a", "al", "en", "rep", "dom",
          "republica", "dominicana", "dominicano", "municipal", "municipio"}


def palabras(s: str) -> frozenset:
    """Las palabras con contenido de un nombre, sin plural: «Oficina Nacional de
    Estadísticas» y «Oficina Nacional de Estadística» son la misma."""
    salida = set()
    for w in plano(s).split():
        if len(w) <= 1 or w in VACIAS:
            continue
        salida.add(w[:-2] if len(w) > 4 and w.endswith("es") else w[:-1] if len(w) > 3 and w.endswith("s") else w)
    return frozenset(salida)


# Nombres (del MAP o de una corte) que el emparejamiento por palabras no
# alcanza porque el cruce escribe la misma institución de otra forma. Uno por
# uno, verificado contra el cruce (id, nombre y capítulo): «Instituto de
# Auxilios» es el 5202 del Clasificador, que la DGCP llama «Instituto Nacional
# de Auxilios y Viviendas»; la Suprema Corte no tiene capítulo propio: es el
# Poder Judicial, capítulo 0301.
NOMBRE_A_INSTITUCION = {
    "suprema corte de justicia": 900301,  # «Poder Judicial», capítulo 0301
    "direccion general de la policia nacional": 144,  # «Policia Nacional», capítulo 0202
    "oficina nacional de evaluacion sismica y vulnerabilidad de infraestructura y edificaciones": 939,  # abreviada
    "autoridad portuaria dominicana": 687,  # «APORDOM (Autoridad Portuaria Dominicana)»
    "comision de fomento a la tecnificacion del sistema nacional de riego": 1158,  # «Tecnificación Nacional de Riego», 0210
    "ayuntamiento de el factor": 1055,  # «Alcaldía Municipal El Factor»
    "instituto de auxilios": 670,  # capítulo 5202 en los dos
}


class Instituciones:
    """El catálogo de `public/data/instituciones.json` y cómo se reconoce en un
    nombre o en un cargo. Mismo criterio que lib/grafo-servidor.ts: un enlace
    adivinado es peor que ninguno, así que ante la duda no se enlaza."""

    def __init__(self, ruta: pathlib.Path):
        datos = json.loads(ruta.read_text(encoding="utf-8"))["instituciones"]
        self.todas = datos
        self.por_plano: dict[str, list[dict]] = {}
        for i in datos:
            self.por_plano.setdefault(plano(i["nombre"]), []).append(i)
        self.patrones = sorted(
            ((plano(i["nombre"]), i) for i in datos if len(plano(i["nombre"])) >= 18),
            key=lambda x: -len(x[0]),
        )
        self.palabras = [(i, palabras(i["nombre"])) for i in datos]
        self.siglas: dict[str, list[dict]] = {}
        for i in datos:
            sig = (i.get("acronimo") or "").strip().upper()
            if 2 <= len(sig) <= 12 and re.fullmatch(r"[A-Z0-9]+", sig):
                self.siglas.setdefault(sig, []).append(i)
        self.mirex = next((i for i in datos if plano(i["nombre"]) == "ministerio de relaciones exteriores"), None)

    def por_nombre(self, nombre: str) -> dict | None:
        """El nombre de una institución tal como lo escribe otra fuente (el MAP,
        una corte): exacto, o por sus palabras con un ganador claro."""
        p = plano(nombre)
        if not p:
            return None
        if p in NOMBRE_A_INSTITUCION:
            return next((i for i in self.todas if i["id"] == NOMBRE_A_INSTITUCION[p]), None)
        exactas = self.por_plano.get(p, [])
        if len(exactas) == 1:
            return exactas[0]
        q = palabras(nombre)
        if not q:
            return None
        puntos = []
        for i, w in self.palabras:
            comunes = len(q & w)
            if comunes:
                puntos.append((comunes / len(q | w), i, w))
        puntos.sort(key=lambda x: -x[0])
        if not puntos:
            return None
        mejor, segundo = puntos[0], (puntos[1][0] if len(puntos) > 1 else 0.0)
        # Calibrado a mano sobre las 252 instituciones del MAP (docs/AUDITORIA.md §H):
        # 224 casan así y ninguna mal; las dudosas se quedan sin enlace.
        if mejor[0] >= 0.6 and mejor[0] - segundo >= 0.15:
            return mejor[1]
        # «Ministerio de Medio Ambiente» dentro de «Ministerio de Medio Ambiente y
        # Recursos Naturales»: todas sus palabras, la misma primera, y nadie más igual.
        primero = plano(nombre).split()[0]
        cabe = [i for j, i, w in puntos if j >= 0.5 and w <= q and plano(i["nombre"]).split()[0] == primero]
        return cabe[0] if len(cabe) == 1 else None

    def dentro(self, p: str) -> dict | None:
        texto = f" {p} "
        for patron, i in self.patrones:
            if f" {patron} " in texto:
                return i
        return None

    def de_cargo(self, cargo: str) -> dict | None:
        """La institución de un cargo escrito en un decreto: por su nombre
        completo dentro del cargo, por sus palabras (todas presentes, la más
        específica y sin empate), por sus siglas o, para el servicio exterior,
        el MIREX."""
        p = plano(cargo)
        for de, a in DEL_CARGO_A_LA_INSTITUCION:
            p = re.sub(de, a, p)
        i = self.dentro(p)
        if i:
            return i
        q = palabras(p)
        cabe = [(len(w), i) for i, w in self.palabras if len(w) >= 3 and w <= q]
        if cabe:
            cabe.sort(key=lambda x: -x[0])
            if len(cabe) == 1 or cabe[0][0] > cabe[1][0]:
                return cabe[0][1]
        for sig in re.findall(r"\(([A-Z0-9]{2,12})\)", cargo or ""):
            cand = self.siglas.get(sig, [])
            if len(cand) == 1:
                return cand[0]
        # Embajadores y cónsules son personal del servicio exterior (MIREX).
        if self.mirex and re.match(r"(embajador|consul|vicec?onsul|ministro consejero|ministra consejera|consejer[oa]|"
                                   r"representante permanente|representante alterno|agregad[oa])", p):
            return self.mirex
        return None


# --------------------------------------------- Ley 311-14, art. 2 (PEP)

LEY_311 = {
    1: "Presidente y Vicepresidente de la República",
    2: "Senadores y diputados",
    3: "Jueces de la Suprema Corte, de los tribunales superiores y demás jueces",
    4: "Jueces del Tribunal Constitucional",
    5: "Jueces del Tribunal Superior Electoral",
    6: "Procurador General, sus adjuntos y demás miembros del Ministerio Público",
    7: "Ministros y viceministros",
    8: "Defensor del Pueblo",
    9: "Gobernador, vicegobernador, gerente y contralor del Banco Central",
    10: "Miembros de la Cámara de Cuentas",
    11: "Miembros de la Junta Central Electoral",
    12: "Contralor General de la República",
    13: "Administradores y gerentes de los bancos del Estado",
    14: "Alcaldes, vicealcaldes, regidores y tesoreros municipales",
    15: "Directores y tesoreros de los distritos municipales",
    17: "Embajadores, cónsules generales y representantes ante organismos internacionales",
    18: "Administradores y subadministradores generales",
    19: "Directores nacionales y generales y subdirectores",
    20: "Presidentes, vicepresidentes, superintendentes y administradores de empresas del Estado",
    21: "Miembros de consejos de administración de órganos autónomos",
    22: "Gobernadores provinciales",
    23: "Oficiales generales y jefes de Estado Mayor",
    24: "Jefe y subjefe de la Policía Nacional",
    26: "Presidente de la Dirección Nacional de Control de Drogas",
    29: "Tesorero Nacional",
    30: "Rector y vicerrectores de la UASD",
    31: "Miembros de la Junta Monetaria",
    32: "Encargados de compras de los poderes, ministerios y direcciones generales",
}

REGLAS_311 = [
    (1, r"^(presidente|presidenta|vicepresidente|vicepresidenta) de la republica\b"),
    (2, r"^(senador|senadora|diputado|diputada)\b"),
    (4, r"^(juez|jueza|magistrad[oa])\b.*tribunal constitucional"),
    (5, r"^(juez|jueza|magistrad[oa])\b.*tribunal superior electoral"),
    (3, r"^(juez|jueza|magistrad[oa])\b.*(suprema corte|poder judicial|corte de apelacion|tribunal superior)"),
    (6, r"^(procurador|procuradora)( general| adjunt[oa]|a? general adjunt[oa])"),
    (7, r"^(ministr[oa]|viceministr[oa])\b(?!\s+consejer)"),
    (8, r"^defensor[a]? del pueblo"),
    (9, r"^(gobernador|gobernadora|vicegobernador|vicegobernadora|gerente|contralor|contralora)\b.*banco central"),
    (31, r"^miembro\b.*junta monetaria"),
    (10, r"^(miembro|presidente|presidenta|vicepresidente|vicepresidenta)\b.*camara de cuentas"),
    (11, r"^(miembro|presidente|presidenta|suplente)\b.*(junta central electoral|jce$)|"
         r"^(presidente|miembro)\b.*\bjce\b|^director[a]? nacional de (elecciones|registro civil)"),
    (12, r"^contralor[a]? general de la republica"),
    (13, r"^(administrador|administradora|subadministrador|subadministradora|gerente|subgerente)\b.*"
         r"(banco de reservas|banreservas|banco agricola|banco nacional de las exportaciones|bandex)"),
    (14, r"^(alcalde|alcaldesa|vicealcalde|vicealcaldesa|regidor|regidora|tesorer[oa] municipal)\b"),
    (15, r"^(director|directora|subdirector|subdirectora)[a]? (del distrito municipal|municipal|de distrito)|"
         r"^tesorer[oa] del distrito"),
    (17, r"^(embajador|embajadora|consul general|representante permanente|representante alterno|representante alterna)\b"),
    (29, r"^tesorer[oa] nacional"),
    (26, r"^presidente de la direccion nacional de control de drogas"),
    (24, r"^(director|subdirector)[a]? general de la policia nacional|^jefe de la policia"),
    (18, r"^(administrador|administradora|subadministrador|subadministradora|subaministrador)[a]?( general)?\b"),
    (19, r"^(director|directora|subdirector|subdirectora)[a]? (general|nacional|ejecutiv[oa])\b"),
    (20, r"^(superintendente|intendente)\b"),
    (22, r"^gobernador[a]?( civil)?( provincial)?( de la provincia| de la provincia de)?\b(?!.*banco central)"),
    (30, r"^(rector|rectora|vicerrector|vicerrectora)\b.*universidad autonoma de santo domingo"),
    (21, r"^(miembro|presidente|presidenta)( titular| suplente)? del? (consejo|directorio|junta) (de administracion|directiv[oa]|de directores|ejecutivo)"),
    (32, r"^encargad[oa] de(l departamento de)? compras"),
]
GRADOS_GENERALES = re.compile(r"general de (brigada|division)|mayor general|teniente general|contralmirante|"
                              r"vicealmirante|^almirante")


def numeral_311(cargo: str, institucion: str = "", grado: str | None = None) -> int | None:
    c = plano(cargo)
    ctx = f"{c} {plano(institucion)}".strip()
    for n, patron in REGLAS_311:
        if re.search(patron, c) or (n in (3, 4, 5, 9, 10, 11, 13, 21, 30, 31) and re.search(patron, ctx)):
            return n
    if grado and GRADOS_GENERALES.search(plano(grado)):
        return 23
    return None


# ----------------------------------------------------------------- lecturas

def leer_map(cache: pathlib.Path, sin_red: bool) -> tuple[list[dict], int]:
    ruta = cache / "map.json"
    if sin_red or (ruta.exists() and time.time() - ruta.stat().st_mtime < 86400):
        d = json.loads(ruta.read_text(encoding="utf-8"))
        return d["filas"], d["total"]
    filas, pagina, total = [], 1, 0
    campos = ("funcionarioId", "institucion", "funcionario", "cargoPrincipal", "unidadNombreCompleto",
              "decreto", "fechaDecreto", "estado", "orden")
    while True:
        cuerpo, _ = pedir(MAP_URL, datos=json.dumps({"page": pagina, "rows": 500}).encode(), tipo="json",
                          cabeceras={"Content-Type": "application/json", "Accept": "application/json"},
                          pausa=2.0, espera=90)
        c = json.loads(cuerpo)["content"]
        total = c["elementostotales"]
        # Lo personal (género, teléfonos, correo, foto, declaración) no se guarda ni en la caché.
        filas += [{k: x.get(k) for k in campos} for x in c["repuestas"]]
        print(f"  MAP página {pagina}/{c['paginastotales']}: {len(filas):,} de {total:,}")
        if pagina >= c["paginastotales"]:
            break
        pagina += 1
    ruta.write_text(json.dumps({"filas": filas, "total": total}, ensure_ascii=False), encoding="utf-8")
    return filas, total


class _Plazo(BaseException):
    """Hereda de BaseException a propósito: pdfminer atrapa `Exception` por
    dentro y se tragaría el plazo (un escaneo lo tuvo once minutos)."""


def _extraer(pdf: bytes, segundos: int = 40) -> str:
    """El texto de un PDF con pdfminer, que respeta las palabras; si tarda más
    de `segundos` (hay escaneos que lo cuelgan minutos), pypdf, que es rápido
    y a veces parte una palabra; si también falla, nada."""
    def plazo(*_):
        raise _Plazo()
    anterior = signal.signal(signal.SIGALRM, plazo)
    try:
        signal.alarm(segundos)
        try:
            from pdfminer.high_level import extract_text  # noqa: PLC0415 — dependencia de build
            return extract_text(io.BytesIO(pdf))
        except _Plazo:
            print("  pdfminer se pasó del plazo: se usa pypdf", file=sys.stderr)
        except Exception as e:  # un PDF roto no tumba la instantánea
            print(f"  pdfminer no pudo: {e}", file=sys.stderr)
        signal.alarm(segundos)
        try:
            import pypdf  # noqa: PLC0415 — dependencia de build
            return "\n".join((p.extract_text() or "") for p in pypdf.PdfReader(io.BytesIO(pdf)).pages)
        except (_Plazo, Exception) as e:
            print(f"  pypdf tampoco: {e!r}", file=sys.stderr)
            return ""
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, anterior)


# Huellas del reconocimiento óptico de un escaneo: «E1» por «El», «10s» por
# «los», «Seiior», y sobre todo una mayúscula suelta delante de su palabra
# («W illiams M uioz»). Un decreto así se cuenta y no se lee: sus nombres
# salen mal y una ficha con un nombre mal leído es peor que ninguna. «Lie.»
# por «Lic.» no cuenta: es un tratamiento y se descarta como tal.
OCR = re.compile(r"\b(?:E1|de1|a1|10s|lnspector|lnstituto|Repdblica|Seiior|seiior|Secretm)\b|"
                 r"(?<![\w.])[A-ZÁÉÍÓÚ] [a-záéíóúñ]{3,}\b")


def es_escaneo(texto: str) -> bool:
    return len(OCR.findall(texto)) >= 3


def texto_de_pdf(doc_id: int, cache: pathlib.Path, sin_red: bool) -> str | None:
    ruta = cache / "texto" / f"{doc_id}.txt"
    if ruta.exists():
        return ruta.read_text(encoding="utf-8")
    if sin_red:
        return None
    try:
        pdf, _ = pedir(f"{CONSULTORIA}/api/document/{doc_id}", tipo="pdf", pausa=1.5, espera=90)
    except (Rechazo, NoExiste) as e:
        print(f"  PDF {doc_id}: {e}", file=sys.stderr)
        return None
    except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
        # Un PDF que no baja no tumba la instantánea; muchos, sí (ver main).
        print(f"  PDF {doc_id}: no se pudo bajar ({e})", file=sys.stderr)
        _fallos_pdf.append(doc_id)
        return None
    if not pdf.startswith(b"%PDF"):
        return None
    texto = _extraer(pdf)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(texto, encoding="utf-8")
    return texto


def lineas_html(fragmento: str) -> list[str]:
    t = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", fragmento, flags=re.S | re.I)
    t = htmlmod.unescape(re.sub(r"<[^>]+>", "\n", t))
    return [limpio(x) for x in t.split("\n") if limpio(x)]


def wp_pagina(url: str, contexto=None) -> tuple[list[str], str | None, str | None]:
    cuerpo, _ = pedir(url, tipo="json", contexto=contexto)
    d = json.loads(cuerpo.decode("utf-8-sig"))
    if not d:
        return [], None, None
    return lineas_html(d[0]["content"]["rendered"]), d[0].get("modified"), d[0].get("link")


def leer_organos() -> tuple[list[dict], dict]:
    """Altas cortes y órganos constitucionales: cada uno por su lado; si uno
    no contesta, los demás siguen y el resumen lo dice."""
    filas: list[dict] = []
    estado: dict[str, dict] = {}

    def anota(organo, url, n, modificado=None, error=None):
        estado[organo] = {"url": url, "filas": n, "modificado": (modificado or "")[:10] or None, "error": error}

    # Suprema Corte de Justicia: «Magdo. Nombre» y el cargo en la línea siguiente.
    try:
        ls, mod, link = wp_pagina(SCJ, contexto_pj())
        vistos = set()
        for i, l in enumerate(ls[:-1]):
            m = re.match(r"^Magd[oa]\.\s+(.+)$", l)
            if m and clave(m.group(1)) not in vistos:
                vistos.add(clave(m.group(1)))
                filas.append({"organo": "scj", "nombre": m.group(1), "cargo": ls[i + 1],
                              "institucion": "Suprema Corte de Justicia", "url": link, "desde": None})
        anota("scj", link, len(vistos), mod)
    except Exception as e:
        anota("scj", SCJ, 0, error=str(e))
    # Consejo del Poder Judicial: nombre y, debajo, «Juez…» o «Consejer…».
    try:
        ls, mod, link = wp_pagina(CPJ, contexto_pj())
        vistos = set()
        for i, l in enumerate(ls[:-1]):
            sig = ls[i + 1]
            if re.match(r"^(Juez|Jueza|Consejer[oa])\b", sig) and es_nombre(l) and not l.startswith(("Juez", "Consejer")):
                if clave(l) in vistos:
                    continue
                vistos.add(clave(l))
                filas.append({"organo": "cpj", "nombre": l, "cargo": sig.rstrip("."),
                              "institucion": "Consejo del Poder Judicial", "url": link, "desde": None})
        anota("cpj", link, len(vistos), mod)
    except Exception as e:
        anota("cpj", CPJ, 0, error=str(e))
    # Tribunal Constitucional: <a href=".../magistrados/slug/"><strong>Nombre</strong></a><span>Cargo</span>.
    try:
        cuerpo, _ = pedir(TC, tipo="html")
        html = cuerpo.decode("utf-8", "replace")
        n = 0
        for m in re.finditer(r'<a[^>]*href="(/sobre-el-tc/pleno/magistrados/[^"]+)"[^>]*>\s*<strong>(.*?)</strong>\s*</a>'
                             r'\s*<span>(.*?)</span>', html, re.S):
            filas.append({"organo": "tc", "nombre": htmlmod.unescape(m.group(2)),
                          "cargo": limpio(htmlmod.unescape(m.group(3))) + " del Tribunal Constitucional",
                          "institucion": "Tribunal Constitucional", "url": TC, "desde": None})
            n += 1
        anota("tc", TC, n)
    except Exception as e:
        anota("tc", TC, 0, error=str(e))
    # Tribunal Superior Electoral: bloques «GESTIÓN A – B», nombres y luego cargos, por posición.
    try:
        ls, mod, link = wp_pagina(TSE)
        bloques: list[tuple[str, list[str], list[str]]] = []
        for l in ls:
            g = re.match(r"^GESTI[OÓ]N\s+(\d{4})\s*[–\-]\s*(\d{4})(\s*\(ACTUAL\))?", l, re.I)
            if g:
                bloques.append((f"{g.group(1)}-{g.group(2)}", [], []))
            elif bloques:
                (bloques[-1][2] if re.match(r"^Juez", l) else bloques[-1][1]).append(l)
        n = 0
        for periodo, nombres, cargos in bloques:
            actual = periodo == bloques[0][0]
            for nombre, cargo in zip(nombres, cargos):
                filas.append({"organo": "tse", "nombre": nombre, "cargo": f"{cargo} del Tribunal Superior Electoral",
                              "institucion": "Tribunal Superior Electoral", "url": link, "periodo": periodo,
                              "anterior": not actual, "desde": f"{periodo[:4]}-01-01" if not actual else None})
                n += 1
        anota("tse", link, n, mod)
    except Exception as e:
        anota("tse", TSE, 0, error=str(e))
    # Junta Central Electoral: «Nombre , Presidente JCE» / «Nombre , Miembro Titular».
    for organo, url, patron in (("jce", JCE_TITULARES, r"^(Presidente JCE|Miembro Titular)$"),
                                ("jce-suplentes", JCE_SUPLENTES, r"^Miembro suplente")):
        try:
            cuerpo, _ = pedir(url, tipo="html", pausa=2.0)
            ls = lineas_html(cuerpo.decode("utf-8", "replace"))
            periodo = None
            p = re.search(r"Gesti[oó]n\s+(\d{4})\s*-\s*(\d{4})", " ".join(ls[:400]))
            if p:
                periodo = f"{p.group(1)}-{p.group(2)}"
            n = 0
            for i, l in enumerate(ls):
                # «Nombre , Cargo»: la coma suelta se pierde al limpiar las líneas.
                if re.match(patron, l) and i >= 1 and es_nombre(ls[i - 1]):
                    cargo = "Presidente de la Junta Central Electoral" if l == "Presidente JCE" else (
                        "Miembro titular de la Junta Central Electoral" if l == "Miembro Titular"
                        else "Miembro suplente de la Junta Central Electoral")
                    filas.append({"organo": organo, "nombre": ls[i - 1], "cargo": cargo,
                                  "institucion": "Junta Central Electoral", "url": url, "periodo": periodo,
                                  "desde": None})
                    n += 1
            anota(organo, url, n)
        except Exception as e:
            anota(organo, url, 0, error=str(e))
    # Defensor del Pueblo: el nombre va justo antes de «Defensor del Pueblo».
    try:
        ls, mod, link = wp_pagina(DEFENSOR)
        n = 0
        for i, l in enumerate(ls):
            if l == "Defensor del Pueblo" and i > 0 and es_nombre(ls[i - 1]) and ls[i - 1] != "Compartir":
                filas.append({"organo": "defensor", "nombre": ls[i - 1], "cargo": "Defensor del Pueblo",
                              "institucion": "Defensor del Pueblo", "url": link, "desde": None})
                n = 1
                break
        anota("defensor", link, n, mod)
    except Exception as e:
        anota("defensor", DEFENSOR, 0, error=str(e))
    return filas, estado


def leer_electos(cache: pathlib.Path, sin_red: bool) -> list[dict]:
    ruta = cache / "electos-2024.xlsx"
    if not ruta.exists() and not sin_red:
        cuerpo, meta = pedir(JCE_ELECTOS, tipo=r"octet-stream|spreadsheet", pausa=2.0, espera=90)
        if not cuerpo.startswith(b"PK"):
            raise Rechazo("la JCE no devolvió un XLSX (¿desafío?)")
        ruta.write_bytes(cuerpo)
    if not ruta.exists():
        return []
    import openpyxl  # noqa: PLC0415 — dependencia de build
    wb = openpyxl.load_workbook(ruta, read_only=True, data_only=True)
    filas = list(wb.worksheets[0].iter_rows(values_only=True))
    cab = next(i for i, f in enumerate(filas) if f and f[0] == "PROVINCIA")
    nombres = [str(c or "").strip() for c in filas[cab]]
    col = {n: i for i, n in enumerate(nombres)}
    salida = []
    for f in filas[cab + 1:]:
        if not f or not f[col["CARGO"]]:
            continue
        salida.append({
            "provincia": limpio(str(f[col["PROVINCIA"]] or "")),
            "municipio": limpio(str(f[col["MUNICIPIO"]] or "")),
            "circunscripcion": limpio(str(f[col["CIRC."]] or "")) or None,
            "distrito": limpio(str(f[col["DISTRITO MUNICIPAL"]] or "")) or None,
            "cargo": limpio(str(f[col["CARGO"]])),
            "posicion": f[col["POSICION_ELEC"]],
            "partido": limpio(str(f[col["ORGANIZACION POLITICA"]] or "")) or None,
            "nombre": limpio(str(f[col["NOMBRE/APELLIDO"]] or "")),
            "votos": f[col["VOTOS"]] if isinstance(f[col["VOTOS"]], (int, float)) else None,
            # El sexo del candidato no se lee.
        })
    return salida


# --------------------------------------------------------------- armado

class Registro:
    def __init__(self):
        self.personas: dict[str, dict] = {}

    def persona(self, nombre: str) -> dict:
        k = clave(nombre)
        p = self.personas.get(k)
        if not p:
            p = {"clave": k, "nombres": {}, "cargos": [], "firma": None, "legislador": None}
            self.personas[k] = p
        legible = nombre_legible(nombre)
        p["nombres"][legible] = p["nombres"].get(legible, 0) + 1
        return p

    def cargo(self, nombre: str, c: dict, peso: int = 1) -> dict:
        p = self.persona(nombre)
        legible = nombre_legible(nombre)
        p["nombres"][legible] += peso - 1
        firma = (c.get("t"), c.get("dec", [None])[0] if c.get("dec") else None, c.get("m"), c.get("o"))
        if not any((x.get("t"), x.get("dec", [None])[0] if x.get("dec") else None, x.get("m"), x.get("o")) == firma
                   for x in p["cargos"]):
            p["cargos"].append({k: v for k, v in c.items() if v is not None})
        return p


NO_PERSONAS_FIRMANTES = re.compile(r"TRIUNVIRATO|JUNTA|CONGRESO|CONSEJO|GOBIERNO", re.I)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cache", default=str(pathlib.Path(tempfile.gettempdir()) / "socratico-funcionarios"))
    ap.add_argument("--sin-red", action="store_true", help="solo lo que ya está en la caché")
    ap.add_argument("--pdf-desde", default=DESDE_PDF)
    args = ap.parse_args()
    cache = pathlib.Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)
    # Sin red, la fecha es la de la lectura que está en la caché, no la de hoy.
    hoy = (args.sin_red and fecha_de_cache(cache, "map.json", "decretos.json")) or datetime.date.today().isoformat()

    inst = Instituciones(INSTITUCIONES)
    reg = Registro()

    # 1. MAP
    print("MAP — Directorio de Funcionarios…")
    mapa, total_map = leer_map(cache, args.sin_red)
    if len(mapa) < 5000 or len(mapa) != total_map:
        sys.exit(f"MAP: {len(mapa)} filas de {total_map}: no se escribe")
    sin_inst = {}
    for x in mapa:
        if x.get("estado") is False:
            continue
        nombre = limpio(x.get("funcionario") or "")
        cargo = limpio(x.get("cargoPrincipal") or "")
        if not es_nombre(nombre) or not cargo:
            continue
        institucion = limpio(x.get("institucion") or "")
        unidad = limpio(x.get("unidadNombreCompleto") or "")
        i = inst.por_nombre(institucion)
        if not i:
            sin_inst[institucion] = sin_inst.get(institucion, 0) + 1
        # «Ministro» a secas: el cargo se completa con la institución para
        # leerse solo y para el numeral de la Ley 311-14.
        completo = cargo
        if institucion and plano(institucion) not in plano(cargo) and not plano(cargo).endswith("de la republica"):
            completo = f"{cargo}, {institucion}"
        # Los gobernadores cuelgan de Interior y Policía; su provincia la dice la
        # unidad, y el cargo se lee mejor con ella: «Gobernadora de la provincia La Vega».
        provincia = provincia_de_gobernacion(unidad)
        if provincia and re.match(r"gobernador", plano(cargo)):
            completo = f"{cargo} de la provincia {provincia}"
        num = x.get("decreto") and limpio(x["decreto"])
        reg.cargo(nombre, {
            "t": cargo_legible(completo), "u": unidad if unidad and plano(unidad) not in ("despacho", plano(institucion)) else None,
            "i": i["id"] if i else None, "in": institucion or None, "pr": provincia,
            "d": fecha_iso(x.get("fechaDecreto")), "m": "vigente", "o": "map",
            "dec": [num, None, None] if num and re.fullmatch(r"\d{1,4}-\d{2}", num) else None,
            "pep": numeral_311(cargo, institucion), "n": x.get("orden"),
        }, peso=3)
    print(f"  {len(mapa):,} servidores; instituciones del MAP sin ficha: {len(sin_inst)}")

    # 2. Decretos
    print("Consultoría — todos los decretos…")
    decretos = leer_decretos(cache, args.sin_red, pedir)
    if len(decretos) < 75000:
        sys.exit(f"Consultoría: {len(decretos)} decretos: no se escribe")
    por_num = {}
    for d in decretos:
        por_num.setdefault(limpio(d.get("Numero") or ""), d)
    firmas = firmas_presidenciales(decretos)
    titulos = pdfs = sin_texto = 0
    pendientes_pdf = []
    for d in sorted(decretos, key=lambda d: d.get("FechaPromulgacion") or ""):
        fecha = fecha_iso(d.get("FechaPromulgacion"))
        if not fecha or fecha < DESDE_TITULOS:
            continue
        titulo = d.get("Titulo") or ""
        if not es_designacion(titulo):
            continue
        dec = [limpio(d.get("Numero") or ""), fecha, d.get("DocId")]
        hallados, varios = personas_del_titulo(titulo)
        if varios and fecha >= args.pdf_desde:
            pendientes_pdf.append((d, dec))
            continue
        if not hallados and fecha >= args.pdf_desde and re.search(r"\b(DESIGNA|NOMBRA)\b", titulo.upper()):
            pendientes_pdf.append((d, dec))
            continue
        for h in hallados:
            i = inst.de_cargo(h["cargo"])
            reg.cargo(h["nombre"], {
                "t": cargo_legible(h["cargo"]), "i": i["id"] if i else None, "pr": provincia_de_gobernacion(h["cargo"]),
                "d": fecha, "m": h["mov"],
                "o": "decreto", "dec": dec, "g": en_titulo(h["grado"]) if h["grado"] else None,
                "pep": numeral_311(h["cargo"], i["nombre"] if i else "", h["grado"]),
            })
            titulos += 1
    print(f"  designaciones y ceses leídos del título: {titulos:,}; decretos con varias personas: {len(pendientes_pdf):,}")
    escaneos = 0
    for k, (d, dec) in enumerate(pendientes_pdf, 1):
        texto = texto_de_pdf(d["DocId"], cache, args.sin_red)
        if k % 50 == 0:
            print(f"  PDF {k:,}/{len(pendientes_pdf):,}", flush=True)
        if not texto or len(texto.strip()) < 200:
            sin_texto += 1
            continue
        if es_escaneo(texto):
            escaneos += 1
            continue
        for h in personas_del_pdf(texto):
            i = inst.de_cargo(h["cargo"])
            reg.cargo(h["nombre"], {
                "t": cargo_legible(h["cargo"]), "i": i["id"] if i else None, "pr": provincia_de_gobernacion(h["cargo"]),
                "d": dec[1], "m": h["mov"],
                "o": "decreto", "dec": dec, "g": h["grado"],
                "pep": numeral_311(h["cargo"], i["nombre"] if i else "", h["grado"]),
            })
            pdfs += 1
            if h.get("sustituye"):
                reg.cargo(h["sustituye"], {
                    "t": cargo_legible(h["cargo"]), "i": i["id"] if i else None, "pr": provincia_de_gobernacion(h["cargo"]),
                    "d": dec[1], "m": "sustituido",
                    "o": "decreto", "dec": dec, "por": nombre_legible(h["nombre"]),
                    "pep": numeral_311(h["cargo"], i["nombre"] if i else ""),
                })
    print(f"  designaciones leídas de {len(pendientes_pdf) - sin_texto - escaneos:,} PDF: {pdfs:,} "
          f"({sin_texto} sin texto, {escaneos} escaneos que no se leen)")
    if len(_fallos_pdf) > max(20, len(pendientes_pdf) // 20):
        sys.exit(f"Consultoría: {len(_fallos_pdf)} PDF no bajaron por la red: no se escribe")

    # El firmante de los decretos. El vigente se ata a quien el MAP pone como
    # Presidente de la República si todas las palabras de la firma están en su nombre.
    presidente_map = next((p for p in reg.personas.values()
                           if any(c.get("o") == "map" and plano(c["t"]).startswith("presidente de la republica")
                                  for c in p["cargos"])), None)
    for firma, s in firmas.items():
        if NO_PERSONAS_FIRMANTES.search(firma) or s["n"] < 5:
            continue
        nombre = re.sub(r"^(DR|LIC|GRAL|GENERAL)\.?\s+", "", firma, flags=re.I)
        destino = None
        if presidente_map and set(clave(nombre).split()) <= set(presidente_map["clave"].split()) and s["hasta"] >= "2024-01-01":
            destino = presidente_map
        else:
            destino = reg.persona(nombre)
        destino["firma"] = {"como": en_titulo(firma), "clave": firma, "decretos": s["n"],
                            "desde": s["desde"], "hasta": s["hasta"]}

    # 3. Altas cortes y órganos
    print("Altas cortes y órganos constitucionales…")
    # Con --sin-red, lo último que se leyó de las cortes; sin caché, se leen.
    ruta_organos = cache / "organos.json"
    if args.sin_red and ruta_organos.exists():
        organos, estado_organos = json.loads(ruta_organos.read_text(encoding="utf-8"))
    else:
        organos, estado_organos = leer_organos()
        ruta_organos.write_text(json.dumps([organos, estado_organos], ensure_ascii=False), encoding="utf-8")
    for o in organos:
        i = inst.por_nombre(o["institucion"]) or inst.de_cargo(o["cargo"])
        reg.cargo(o["nombre"], {
            "t": cargo_legible(o["cargo"]), "i": i["id"] if i else None, "in": o["institucion"],
            "d": o.get("desde"), "m": "anterior" if o.get("anterior") else "vigente", "o": o["organo"],
            "per": o.get("periodo"), "url": o.get("url"),
            "pep": numeral_311(o["cargo"], o["institucion"]),
        }, peso=2)
    for org, e in estado_organos.items():
        print(f"  {org}: {e['filas']} {('· ' + e['error']) if e['error'] else ''}")
    if estado_organos.get("scj", {}).get("filas", 0) < 12 or estado_organos.get("tc", {}).get("filas", 0) < 9:
        print("  ⚠ la SCJ o el TC llegaron cortos: la instantánea lo declara", file=sys.stderr)

    # 4. Electos municipales 2024
    print("JCE — electos municipales de 2024…")
    try:
        electos = leer_electos(cache, args.sin_red)
        estado_electos = {"url": JCE_ELECTOS_PAGINA, "filas": len(electos), "error": None}
    except Rechazo as e:
        electos, estado_electos = [], {"url": JCE_ELECTOS_PAGINA, "filas": 0, "error": str(e)}
    locales = {plano(re.sub(r"^(ayuntamiento|junta|alcaldia)( del| de)?( distrito)?( municipal)?( del| de)?( municipio)?( de)?\s+",
                            "", plano(i["nombre"]))): i
               for i in inst.todas if i.get("tipo") == "Gobierno local"}
    ambiguos = set()
    vistos_locales: dict[str, int] = {}
    for i in inst.todas:
        if i.get("tipo") == "Gobierno local":
            k = plano(re.sub(r"^(ayuntamiento|junta|alcaldia)( del| de)?( distrito)?( municipal)?( del| de)?( municipio)?( de)?\s+",
                             "", plano(i["nombre"])))
            vistos_locales[k] = vistos_locales.get(k, 0) + 1
            if vistos_locales[k] > 1:
                ambiguos.add(k)
    for e in electos:
        if not es_nombre(e["nombre"]):
            continue
        dm = re.sub(r"\s*\(DM\)\s*$", "", e["distrito"] or "")
        lugar = dm or e["municipio"]
        k = plano(lugar)
        i = locales.get(k) if k not in ambiguos else None
        categoria = e["cargo"].upper()
        cargo_base = {"ALCALDE": "Alcalde", "VICEALCALDE": "Vicealcalde", "REGIDOR": "Regidor",
                      "DIRECTOR": "Director del distrito municipal", "SUBDIRECTOR": "Subdirector del distrito municipal",
                      "VOCAL": "Vocal del distrito municipal"}.get(categoria, en_titulo(e["cargo"]))
        # La JCE escribe «ALCALDE» para todas las personas; la ficha nombra el
        # puesto, que no presume el género de nadie: «Alcaldía de Nagua».
        puesto = {"ALCALDE": "Alcaldía", "VICEALCALDE": "Vicealcaldía", "REGIDOR": "Regiduría",
                  "DIRECTOR": "Dirección del distrito municipal", "SUBDIRECTOR": "Subdirección del distrito municipal",
                  "VOCAL": "Vocal del distrito municipal"}.get(categoria, en_titulo(e["cargo"]))
        if not dm:
            texto_cargo = f"{puesto} de {en_titulo(e['municipio'])}"
        elif "distrito municipal" in puesto:
            texto_cargo = f"{puesto} {en_titulo(dm)}, {en_titulo(e['municipio'])}"
        else:
            texto_cargo = f"{puesto} del distrito municipal {en_titulo(dm)}, {en_titulo(e['municipio'])}"
        if e.get("circunscripcion"):
            texto_cargo += f", {en_titulo(e['circunscripcion']).replace('Circ.', 'circunscripción')}"
        reg.cargo(e["nombre"], {
            "t": texto_cargo, "i": i["id"] if i else None, "pr": en_titulo(e["provincia"]),
            "d": "2024-04-24", "m": "electo", "o": "jce2024", "per": "2024-2028",
            "par": en_titulo(e["partido"]) if e.get("partido") else None,
            "v": int(e["votos"]) if e.get("votos") is not None else None,
            "pep": numeral_311(cargo_base) or (15 if categoria in ("DIRECTOR", "SUBDIRECTOR") else None),
        })
    print(f"  {len(electos):,} electos")

    # 5. Congreso
    congreso = json.loads(CONGRESO.read_text(encoding="utf-8"))
    for l in congreso["legisladores"]:
        camara = "Senador" if l.get("c") == "senado" else "Diputado"
        funcion = l.get("fn") or camara
        donde = l.get("pr") or ""
        cargo = f"{funcion} por {donde}" if donde else funcion
        if l.get("ci") and l.get("c") != "senado":
            cargo += f", {l['ci'].lower()}"
        p = reg.cargo(l["n"], {
            "t": cargo, "i": None, "pr": donde or None, "m": "electo", "o": "congreso", "per": "2024-2028",
            "par": l.get("pn"), "pep": 2,
        }, peso=3)
        p["legislador"] = l["id"]

    # Salida: cada persona con su nombre más usado y sus cargos, del más reciente al más viejo.
    personas = []
    usados: dict[str, int] = {}
    for p in reg.personas.values():
        if not p["cargos"] and not p["firma"]:
            continue
        nombre = max(p["nombres"].items(), key=lambda kv: (kv[1], sum(1 for c in kv[0] if ord(c) > 127)))[0]
        s = slug(nombre) or "persona"
        if s in usados:
            usados[s] += 1
            s = f"{s}-{usados[s]}"
        else:
            usados[s] = 1
        cargos = sorted(p["cargos"], key=lambda c: (c.get("m") not in ("vigente", "electo"), c.get("d") or "0000"),
                        reverse=False)
        cargos = sorted(cargos, key=lambda c: c.get("d") or ("9999" if c.get("m") in ("vigente", "electo") else "0000"),
                        reverse=True)
        alias = sorted(n for n in p["nombres"] if n != nombre)
        pep = sorted({c["pep"] for c in cargos if c.get("pep")})
        personas.append({"id": s, "n": nombre, "a": alias or None, "c": cargos, "f": p["firma"],
                         "leg": p["legislador"], "pep": pep or None})
    personas.sort(key=lambda x: clave(x["n"]))

    resumen = {
        "generado": hoy,
        "fuentes": {
            "map": {"url": MAP_PUBLICO, "filas": len(mapa), "corte": hoy,
                    "institucionesSinFicha": len(sin_inst)},
            "decretos": {"url": f"{CONSULTORIA}/", "total": len(decretos), "desdeTitulos": DESDE_TITULOS,
                         "desdePdf": args.pdf_desde, "designacionesTitulo": titulos,
                         "pdfLeidos": len(pendientes_pdf) - sin_texto - escaneos, "pdfSinTexto": sin_texto,
                         "pdfEscaneados": escaneos,
                         "designacionesPdf": pdfs, "firmantes": sum(1 for p in personas if p["f"])},
            "organos": estado_organos,
            "electos2024": estado_electos,
            "congreso": {"filas": len(congreso["legisladores"]), "fuente": congreso.get("fuente")},
        },
        "ley311": {str(k): v for k, v in LEY_311.items()},
        "personas": personas,
    }
    # Plausibilidad: el Presidente tiene que estar, con su firma.
    if not any(p["f"] and "presidente de la republica" in " ".join(plano(c["t"]) for c in p["c"]) for p in personas):
        sys.exit("no aparece el Presidente de la República con su firma: no se escribe")
    SALIDA.write_text(json.dumps(resumen, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    peso = SALIDA.stat().st_size
    print(f"→ {SALIDA.relative_to(RAIZ)}: {len(personas):,} personas, "
          f"{sum(len(p['c']) for p in personas):,} cargos, {peso / 1e6:.1f} MB")
    print("  instituciones del MAP sin ficha (las 15 mayores):",
          sorted(sin_inst.items(), key=lambda kv: -kv[1])[:15])


if __name__ == "__main__":
    main()
