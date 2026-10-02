#!/usr/bin/env python3
"""Genera public/data/instituciones.json: el cruce que convierte los catálogos
del Estado en una sola entidad «institución», y el universo entero de
entidades públicas que tienen presupuesto.

Dos catálogos dan el universo:

- las **unidades de compra** de la DGCP —la unidad más fina que tiene código
  estable—, cada una con su ficha y su id, el código de la DGCP;
- el **Clasificador Institucional** de la Dirección General de Presupuesto
  (DIGEPRES): la lista maestra de entidades del presupuesto, con su sector,
  capítulo, subcapítulo y unidad ejecutora. Cada capítulo que no tiene unidad
  de compra en la DGCP —el Senado, el Poder Judicial, el Banco Central, 145
  ayuntamientos y juntas de distrito— entra como institución propia con el id
  estable `900000 + capítulo` (el capítulo 7063 es la ficha 907063), porque
  los códigos de la DGCP no llegan a cuatro cifras.

Cada institución se ata a:

- su **capítulo presupuestario** (SIGEF), por el campo `codigo_capitulo` que la
  propia DGCP publica (`{año}{capítulo}{…}`): el cruce no es un emparejamiento
  de nombres, lo declara el Estado. `capitulo` es ese código solo si la
  instantánea del SIGEF (`fiscal.json`) tiene su ejecución; cuando el código de
  la DGCP no es el de la entidad y un alias la lleva a otro (abajo), `capitulo`
  es el de ese alias si el SIGEF lo tiene, o ninguno;
- su **capítulo del Clasificador** (`clasificador`) y con él su **sector**. Casi
  siempre es el mismo código; cuando la DGCP conserva uno que el clasificador
  ya retiró, la tabla `ALIAS_CODIGO`, la tabla `ALIAS_UNIDAD`, el anexo de
  entidades receptoras del propio clasificador o el nombre de un gobierno
  local lo llevan al vigente, y el script lo imprime. Lo que no tiene
  capítulo vigente toma el sector de la familia de su código (62xx son
  fideicomisos, 61xx empresas…) y `clasificador` queda en `null`;
- su **nómina**, por la tabla `NOMINA` de abajo, curada a mano contra el
  catálogo (solo cuando la correspondencia es inequívoca);
- sus **decretos**, por la etiqueta `Institucion` de la Consultoría Jurídica,
  emparejada por nombre normalizado. La etiqueta «Cámara de Cuentas» se
  excluye: la Consultoría la pone en todo nombramiento (el designado declara
  patrimonio ante la Cámara), no en lo que atañe a la Cámara;
- lo que el **Gobierno central le transfiere** según el cuadro «Clasificación
  institucional según entidad receptora» de DIGEPRES: el de la Ley de
  Presupuesto vigente (`transferencia`) y, si ya se depositó, el del proyecto
  del año siguiente (`transferenciaProyecto`). Solo cuando el capítulo es de
  una sola institución: el del Servicio Nacional de Salud no se reparte entre
  sus 186 hospitales.

Mecánica verificada el 2026-09-29 (la documenta docs/INFRAESTRUCTURA.md §5.7):

- `GET https://digepres.gob.do/wp-json/wp/v2/media?search=clasificador&…` →
  200 JSON (40 medios). El nombre del archivo del clasificador cambia con cada
  versión («Clasificador-Institucional.pdff_.pdf»): se toma el PDF más reciente
  cuyo título dice «Clasificador Institucional». El de hoy: 2,435,402 bytes,
  46 páginas, «Actualizado al: 09/01/2026», texto extraíble. Columnas SECTOR ·
  SUBSECTOR · ÁREA · SUBÁREA · SECCIÓN · PODERES · ENTIDAD · CAPÍTULO ·
  SUBCAPÍTULO · UNID. EJEC. · DENOMINACIÓN; la cabecera se repite en cada
  página, hay nombres partidos en dos renglones, unidades ejecutoras sin
  subcapítulo (5161 0001) o de tres cifras (7352 01 001), un subcapítulo sin
  unidad (7063 01 LAS SALINAS), un anexo de 38 entidades receptoras
  desconcentradas (2xxx, algunas con el capítulo al que se adscriben) y una
  bitácora de cambios al final. La columna ENTIDAD no es única: nunca es id.
- `https://digepres.gob.do/ley-de-presupuesto-general-del-estado-{año}/` y
  `…/proyecto-de-ley-de-presupuesto-{año}/` → 200 HTML con el enlace al XLSX
  «Clasificación Institucional según Entidad Receptora» (≈45 KB, una hoja:
  `CCCC - NOMBRE` en la columna A, el monto en la D, la suma de las filas
  cuadra al peso con el TOTAL GENERAL). El cuadro de la ley 2026 conserva en
  su título «Proyecto de Ley de Presupuesto 2026»: se declara tal cual. Las
  filas 2xxx son desconcentradas, 4xxx subsidios y 9xxx ONG: no son
  entidades del clasificador y no se usan; 7199 «AYUNTAMIENTOS» es una bolsa
  sin repartir.
- robots.txt de digepres.gob.do: `Disallow:` vacío.

**Dependencia de build**: un lector de PDF. `pypdf` si está instalado
(`pip install --user pypdf`); si no, `pdfminer.six`, más lento (~50 s), que
recompone las filas por su altura. Solo la usa este script: la app nunca la
importa y no va en package.json ni en el despliegue.

Se niega a escribir si lo leído no es plausible: menos de 500 capítulos, un
número de gobiernos locales distinto de 393, un cuadro de transferencias que
no cuadra con su total o que no cubre a los 393.

Es un archivo versionado, no una base de datos. Regenerar cuando cambie el
catálogo de unidades de compra, el clasificador (DIGEPRES lo actualiza en
enero), el presupuesto (diciembre y septiembre) o la instantánea de normativa:

    python3 scripts/build-instituciones.py
"""
import datetime
import html
import io
import json
import pathlib
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

try:
    import pypdf  # dependencia de build, ver la cabecera
except ImportError:
    pypdf = None
    try:
        from pdfminer.high_level import extract_pages
        from pdfminer.layout import LAParams, LTTextContainer, LTTextLine
    except ImportError:
        sys.exit("Falta un lector de PDF (dependencia de build): pip install --user pypdf")

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "data" / "instituciones.json"
DGCP = "https://datosabiertos.dgcp.gob.do/api-dgcp/v1/unidades_compra?limit=1000"
MEDIOS_DIGEPRES = (
    "https://digepres.gob.do/wp-json/wp/v2/media?search=clasificador"
    "&_fields=id,date,title,source_url,mime_type&per_page=100"
)
PAGINA_LEY = "https://digepres.gob.do/ley-de-presupuesto-general-del-estado-{anio}/"
PAGINA_PROYECTO = "https://digepres.gob.do/proyecto-de-ley-de-presupuesto-{anio}/"
UA = "Socratico-Inteligencia/1.0 (cruce de instituciones; herramienta independiente)"

# Código de nómina (scripts/build-nomina.py) → código de unidad de compra (DGCP).
# El Consejo del Café (CCDF) queda fuera: el catálogo solo tiene INDOCAFE, que
# es otra entidad.
NOMINA = {
    "CESAC": 811, "MSP": 240, "MESCYT": 264, "MINC": 259, "MEM": 916,
    "DIGEIG": 720, "CND": 893, "DEFCIVIL": 904, "JAC": 554,
    # Ampliación del 2026-09-23. El Poder Judicial (PJ) no tiene unidad de
    # compra en el catálogo de la DGCP: se ata abajo, por su capítulo.
    "DGCP": 7, "IDEICE": 869, "IAD": 724, "CGR": 139, "TSS": 545, "MIREX": 1,
    "S911": 887, "INABIMA": 812, "SVSP": 181, "DIGEPRES": 217, "LOTERIA": 655,
    # Ampliación del 2026-09-24, cada una por nombre exacto en el catálogo de
    # la DGCP. Fuera: Registro Inmobiliario (sin unidad de compra propia) y la
    # EGAEE (el catálogo solo trae el Instituto de Altos Estudios de las FFAA,
    # que la contiene pero no es ella). Comedores Económicos se ata a la única
    # unidad que tiene, aunque la DGCP la rotule «(Inactiva)».
    "MA": 226, "DAEH": 1379, "INAPA": 635, "CAASD": 625, "CEED": 200, "OMSA": 1414,
    "OPRET": 247, "MIVHED": 1154, "ETED": 612, "INESPRE": 633, "CESMET": 551,
    "INTRANT": 249, "DGBA": 977, "PROMIPYME": 255, "MEPYD": 131, "AYTOMOCA": 732,
    "INPOSDOM": 622, "AYTOSFM": 867, "FEDA": 673, "INTABACO": 693, "ONDP": 700,
    "CORAAPLATA": 629, "HDSSD": 747, "OGTIC": 703, "MAPRE": 134, "IDIAF": 825,
    "MAP": 175, "IDOPPRIL": 735, "SISALRIL": 591, "MMUJER": 174, "DGMUSEOS": 1369,
    "DGDF": 201, "LMD": 828, "DIGECOG": 2, "DIECOM": 1155, "MINPRE": 197,
    "AGN": 894, "ECO5RD": 1387, "TN": 222, "MERCADOM": 1006, "IIBI": 694,
    "CEIZTUR": 589, "ZOODOM": 837, "DGM": 253, "DEFENSOR": 964, "BNPHU": 940,
    "INAGUJA": 258, "INAP": 176, "CONADIS": 205, "CORPHOTELS": 733, "DGAPP": 1067,
    "CNSS": 586, "INESDYC": 874, "PROCOMPETENCIA": 831, "INM": 936, "ODAC": 872,
    "DIGERA": 1364, "HTDC": 1105, "CONALECHE": 889, "IGN": 981, "SIE": 637,
    "ANAMAR": 818,
}
# Nóminas de entidades sin unidad de compra: código de nómina → capítulo del
# clasificador (la ficha que el clasificador les da). Ampliación del 2026-09-29.
NOMINA_CLASIFICADOR = {"PJ": "0301"}

# Capítulos que la DGCP conserva y que el clasificador ya retiró, cuando la
# entidad sigue con otro código. Cada uno lo sostiene el propio clasificador.
ALIAS_CODIGO = {
    # Bitácora 2025-01: se inhabilitó 5126 y se creó 5009, la Superintendencia
    # de Bancos, entre los auxiliares financieros.
    "5126": "5009",
    # La Superintendencia de Valores es hoy la del Mercado de Valores, 5008
    # (auxiliar financiero).
    "5145": "5008",
    # Bitácora 2026-01: se inhabilitó el capítulo 0220 (Economía, Planificación
    # y Desarrollo) y 0205 pasó a llamarse «Ministerio de Hacienda y Economía»;
    # sus unidades ejecutoras están ahí (la ONE es 0205.01.0013; el SIUBEN,
    # 0205.01.0014).
    "0220": "0205",
}
# Unidades de compra cuyo capítulo en la DGCP no es el de la entidad y que se
# atan por su nombre, una por una.
ALIAS_UNIDAD = {
    580: "6123",  # Empresa de Generación Hidroeléctrica: la DGCP la deja en 6105, la extinta CDEEE
    612: "6124",  # Empresa de Transmisión Eléctrica: ídem
    718: "6130",  # Edeeste: ídem
    815: "6129",  # Edesur: ídem
    224: "5159",  # DGII: la DGCP la pone en 0999, obligaciones del Tesoro, que es una línea de deuda y no una entidad
}

ETIQUETA_NOMBRAMIENTOS = "camara de cuentas"

# El sector es el nivel del clasificador que un ciudadano reconoce: sector,
# subsector, área, subárea y sección, y en la Administración General la
# columna PODERES (2 es el Poder Ejecutivo; 1, el Legislativo; 3, el Judicial;
# el resto, la JCE, la Cámara de Cuentas, el Tribunal Constitucional, el
# Defensor del Pueblo, el TSE y la Defensa Pública).
SECTOR_POR_CLASE = {
    "1.1.1.1.2": "descentralizada",
    "1.1.1.1.3": "seguridad-social",
    "1.1.1.2.1": "local",
    "1.1.2.1.1": "empresa",
    "1.2.1.1.1": "financiera",
    "1.2.2.1.1": "financiera",
    "1.2.2.3.0": "financiera",
}
TIPO_POR_SECTOR = {
    "ejecutivo": "Institución",
    "descentralizada": "Institución descentralizada",
    "seguridad-social": "Seguridad social",
    "local": "Gobierno local",
    "empresa": "Empresa pública",
    "financiera": "Institución financiera",
}
LOCALES_ESPERADOS = 393


# ------------------------------------------------------------------- red

def bajar(url: str, tipos: tuple, timeout: int = 90) -> bytes:
    """GET con el User-Agent de la casa, un reintento y el content-type validado."""
    for intento in (1, 2):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                tipo = r.headers.get("content-type", "")
                if not any(t in tipo for t in tipos):
                    raise RuntimeError(f"{url}: content-type inesperado «{tipo}»")
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            if intento == 2:
                raise
            print(f"  reintento {url}: {e}", file=sys.stderr)
            time.sleep(5)
        except Exception as e:  # noqa: BLE001 — un reintento y fuera
            if intento == 2:
                raise
            print(f"  reintento {url}: {e}", file=sys.stderr)
            time.sleep(5)
    raise AssertionError


# ----------------------------------------------------------------- texto

def normalizar(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\([^)]*\)", " ", s)          # acrónimos entre paréntesis
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    s = re.sub(r"\b(dir|dir\.)\b", "direccion", s)
    s = re.sub(r"\bgral\b", "general", s)
    s = re.sub(r"\b(de|del|la|las|los|el|y|e|para)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def plano(s: str) -> str:
    """Sin tildes, en minúscula y con los signos como espacio."""
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s)).strip()


def limpio(s: str) -> str:
    """Un renglón del PDF: sin tabuladores ni glifos sin mapa, espacios simples."""
    s = re.sub(r"\(cid:\d+\)", " ", s.replace("\t", " "))
    return re.sub(r"\s+", " ", s).strip()


MENUDAS = {"de", "del", "la", "las", "los", "el", "y", "e", "en", "para", "por",
           "a", "al", "con", "sin", "o", "u"}


def legible(nombre: str) -> str:
    """«BANCO CENTRAL DE LA REPÚBLICA DOMINICANA» → «Banco Central de la
    República Dominicana». Las palabras del Estado no se tocan, solo la caja:
    lo que va entre paréntesis son siglas y se deja en mayúscula; las palabras
    menudas van en minúscula salvo al principio; una abreviatura con puntos
    («S.A.») conserva su forma."""
    nombre = re.sub(r"\(\s+", "(", re.sub(r"\s+\)", ")", nombre))
    salida = []
    dentro = False
    for i, token in enumerate(nombre.split(" ")):
        if token.startswith("("):
            dentro = True
        if dentro:
            salida.append(token)
        else:
            bajo = token.lower()
            letras = re.sub(r"[^\w]", "", bajo)
            if i > 0 and letras in MENUDAS:
                salida.append(bajo)
            elif re.fullmatch(r"(?:\w\.){2,}", bajo):
                salida.append(token.upper())
            else:
                salida.append("-".join(p[:1].upper() + p[1:] for p in bajo.split("-")))
        if token.endswith(")"):
            dentro = False
    return " ".join(salida)


# ------------------------------------------------------- el clasificador

def pdf_del_clasificador() -> dict:
    """El PDF más reciente cuyo título dice «Clasificador Institucional»."""
    medios = json.loads(bajar(MEDIOS_DIGEPRES, ("application/json",)))
    candidatos = [
        m for m in medios
        if m.get("mime_type") == "application/pdf"
        and "clasificador institucional" in plano(html.unescape(m["title"]["rendered"]))
    ]
    if not candidatos:
        raise SystemExit("DIGEPRES: ningún PDF titulado «Clasificador Institucional» en la biblioteca")
    return max(candidatos, key=lambda m: m["date"])


def paginas_pypdf(cuerpo: bytes) -> list:
    return [p.extract_text() or "" for p in pypdf.PdfReader(io.BytesIO(cuerpo)).pages]


def paginas_pdfminer(cuerpo: bytes) -> list:
    """pdfminer agrupa el texto por columnas: las filas se recomponen por su
    altura. La cabecera va en vertical (letras sueltas) y se descarta; un
    nombre en dos renglones deja el código centrado entre ambos
    («NOMBRE 1», «1 1 1 … 5191», «NOMBRE 2») y se vuelve a unir."""
    paginas = []
    for pagina in extract_pages(io.BytesIO(cuerpo), laparams=LAParams(line_margin=0.1)):
        piezas = []
        for caja in pagina:
            if not isinstance(caja, LTTextContainer):
                continue
            for linea in caja:
                if isinstance(linea, LTTextLine) and linea.get_text().strip():
                    piezas.append(((linea.y0 + linea.y1) / 2, linea.x0, linea.get_text().strip()))
        piezas.sort(key=lambda p: (-p[0], p[1]))
        filas = []
        for y, x, t in piezas:
            if filas and abs(filas[-1][0] - y) <= 2.5:
                filas[-1][1].append((x, t))
            else:
                filas.append([y, [(x, t)]])
        textos = [" ".join(t for _, t in sorted(f[1])) for f in filas]
        textos = [
            t for t in textos
            if not (all(len(w) <= 2 for w in t.split()) and not any(w.isdigit() for w in t.split()))
            and "DENOMINACIÓN" not in t and not t.startswith("UI DEPEND")
        ]
        solo_codigo = re.compile(r"^\d(?: \d{1,4})+$")
        salida = []
        i = 0
        while i < len(textos):
            t = textos[i]
            if (solo_codigo.match(t) and salida and not salida[-1][:1].isdigit()
                    and i + 1 < len(textos) and not textos[i + 1][:1].isdigit()):
                salida.append(f"{t} {salida.pop()}")
                salida.append(textos[i + 1])
                i += 2
                continue
            salida.append(t)
            i += 1
        paginas.append("\n".join(salida))
    return paginas


CABECERA = {
    "MINISTERIO DE HACIENDA", "MINISTERIO DE HACIENDA Y ECONOMÍA", "DIRECCIÓN GENERAL DE PRESUPUESTO (DIGEPRES)",
    "CLASIFICADOR INSTITUCIONAL", "UO", "SECTOR", "SUBSECTOR", "AREA", "SUBÁREA", "SECCIÓN", "PODERES",
    "ENTIDAD", "CAPÍTULO", "SUBCAPÍTULO", "UNID. EJEC.", "DENOMINACIÓN", "UI DEPEND.",
}
PREFIJO = r"^(\d) (\d) (\d) (\d) (\d) (\d{1,2}) (\d{1,3})"
RE_UE = re.compile(PREFIJO + r" (\d{4}) (\d{2}) (\d{3,4}) (\S.*)$")
RE_UE_SIN_SUB = re.compile(PREFIJO + r" (\d{4}) (\d{4}) (\D.*)$")
RE_SUB = re.compile(PREFIJO + r" (\d{4}) (\d{2}) (\D.*)$")
RE_CAP = re.compile(PREFIJO + r" (\d{4}) (\D.*)$")
RE_ENT = re.compile(PREFIJO + r" (\D.*)$")
RE_JERARQUIA = re.compile(r"^(1(?: \d{1,2}){0,5}) (\D.*)$")
RE_ANEXO = re.compile(r"^1 1 1 1 4 (?:\d{3} )?(2\d{3}) (\d{4}) (\D.*)$")


def parsear_clasificador(paginas: list) -> dict:
    caps: dict = {}
    subcapitulos = 0
    ues = 0
    entidades: dict = {}
    anexo: dict = {}
    actualizado = None
    ultimo = None  # (dict, clave) del último registro, para continuar su nombre
    zona = "cuerpo"
    for pagina in paginas:
        for cruda in pagina.split("\n"):
            linea = limpio(cruda)
            if not linea:
                continue
            if "Anexo del Clasificador" in linea:
                zona, ultimo = "anexo", None
                continue
            if linea.startswith("REVISIÓN FECHA") or "HISTORIAL DE CAMBIOS" in linea:
                zona = "bitacora"
            if zona == "bitacora":
                continue
            m = re.search(r"Actualizado al:\s*(\d{1,2})/(\d{1,2})/(\d{4})", linea)
            if m:
                actualizado = actualizado or f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
                ultimo = None
                continue
            if linea.upper() in CABECERA or re.fullmatch(r"\d+ de \d+", linea):
                ultimo = None
                continue
            if zona == "anexo":
                m = RE_ANEXO.match(linea)
                if m:
                    anexo[m.group(1)] = m.group(2)
                continue
            if RE_UE.match(linea) or RE_UE_SIN_SUB.match(linea):
                ues += 1
                ultimo = None
                continue
            if RE_SUB.match(linea):
                subcapitulos += 1
                ultimo = None
                continue
            m = RE_CAP.match(linea)
            if m:
                g = m.groups()
                if g[7] in caps:
                    raise SystemExit(f"clasificador: capítulo {g[7]} repetido («{linea}»)")
                caps[g[7]] = {"clase": ".".join(g[:5]), "poder": g[5], "entidad": g[6], "nombre": g[8]}
                ultimo = (caps[g[7]], "nombre")
                continue
            m = RE_ENT.match(linea)
            if m:
                g = m.groups()
                clave = (".".join(g[:5]), g[5], g[6])
                entidades.setdefault(clave, {"nombre": g[7]})
                ultimo = (entidades[clave], "nombre")
                continue
            if RE_JERARQUIA.match(linea):
                ultimo = None
                continue
            # Un nombre partido en dos renglones: el segundo es su continuación.
            if ultimo:
                ultimo[0][ultimo[1]] += " " + linea
    for c in caps.values():
        c["nombre"] = limpio(c["nombre"])
        ent = entidades.get((c["clase"], c["poder"], c["entidad"]))
        c["entidadNombre"] = limpio(ent["nombre"]) if ent else None
    return {"caps": caps, "subcapitulos": subcapitulos, "ues": ues, "anexo": anexo, "actualizado": actualizado}


def sector_de_capitulo(cap: dict) -> str:
    if cap["clase"] == "1.1.1.1.1":
        return "ejecutivo" if cap["poder"] == "2" else "poderes"
    sector = SECTOR_POR_CLASE.get(cap["clase"])
    if not sector:
        raise SystemExit(f"clasificador: clase {cap['clase']} desconocida («{cap['nombre']}»); ¿cambió el documento?")
    return sector


def sector_de_codigo(codigo: str) -> str:
    """El sector de un código que el clasificador ya no trae, por su familia."""
    if codigo.startswith("62"):
        return "fideicomiso"
    if codigo.startswith("61"):
        return "empresa"
    if codigo.startswith("50"):
        return "financiera"
    if codigo.startswith("52"):
        return "seguridad-social"
    if codigo.startswith("51"):
        return "descentralizada"
    if codigo.startswith("7"):
        return "local"
    if codigo[:2] in ("01", "03", "04"):
        return "poderes"
    return "ejecutivo"


def tipo_de_capitulo(cap: dict) -> str:
    sector = sector_de_capitulo(cap)
    if sector == "poderes":
        return {"1": "Poder Legislativo", "3": "Poder Judicial"}.get(cap["poder"], "Órgano constitucional")
    return TIPO_POR_SECTOR[sector]


def nombre_de_capitulo(cap: dict) -> str:
    """El nombre del capítulo en caja de lectura. El clasificador lo escribe en
    mayúsculas, pero su columna ENTIDAD suele repetirlo en caja normal: si dice
    lo mismo, letra por letra salvo la caja, se toma esa, que es la del
    Estado; si no, se pone en caja de lectura aquí."""
    nombre = re.sub(r"\(\s+", "(", re.sub(r"\s+\)", ")", cap["nombre"]))
    ent = cap["entidadNombre"]
    if ent and ent.upper() == nombre.upper() and ent != ent.upper():
        return ent
    return legible(nombre)


GENERICAS_LOCALES = re.compile(
    r"\b(ayuntamiento|alcaldia|municipal|municipio|junta|distrital|distrito|del|de|la|las|los|el|dm|y)\b"
)


def lugar(nombre: str, con_parentesis: bool = False) -> str:
    """El lugar de un gobierno local: «Junta Distrital de El Cedro» → «cedro»."""
    s = nombre if con_parentesis else re.sub(r"\([^)]*\)", " ", nombre)
    return re.sub(r"\s+", " ", GENERICAS_LOCALES.sub(" ", plano(s))).strip()


def clase_local(nombre: str) -> str:
    return "junta" if re.search(r"junta|distrital|distrito municipal", plano(nombre)) else "ayuntamiento"


# ------------------------------------------------ transferencias (XLSX)

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def filas_xlsx(cuerpo: bytes) -> list:
    """La primera hoja de un XLSX como filas {columna: texto}, sin dependencias."""
    z = zipfile.ZipFile(io.BytesIO(cuerpo))
    nombres = z.namelist()
    comunes = []
    if "xl/sharedStrings.xml" in nombres:
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(f"{NS}si"):
            comunes.append("".join(t.text or "" for t in si.iter(f"{NS}t")))
    hoja = "xl/worksheets/sheet1.xml"
    if hoja not in nombres:
        raise SystemExit("XLSX sin xl/worksheets/sheet1.xml")
    filas = []
    for row in ET.fromstring(z.read(hoja)).iter(f"{NS}row"):
        fila = {}
        for c in row.findall(f"{NS}c"):
            columna = re.match(r"[A-Z]+", c.get("r", "")).group(0)
            v = c.find(f"{NS}v")
            if c.get("t") == "s" and v is not None:
                fila[columna] = comunes[int(v.text)]
            elif c.get("t") == "inlineStr":
                fila[columna] = "".join(t.text or "" for t in c.iter(f"{NS}t"))
            elif v is not None:
                fila[columna] = v.text or ""
        filas.append(fila)
    return filas


def xlsx_de_pagina(url: str):
    """El enlace al cuadro de entidades receptoras en una página de DIGEPRES."""
    try:
        pagina = bajar(url, ("text/html",)).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    enlaces = re.findall(r'href="(https://digepres\.gob\.do/wp-content/uploads/[^"]*Receptora[^"]*\.xlsx)"', pagina, re.I)
    return enlaces[0] if enlaces else None


def cuadro_de_transferencias(tipo: str, anio: int, pagina: str, url: str) -> dict:
    filas = filas_xlsx(bajar(url, ("spreadsheetml", "octet-stream")))
    titulo = next((limpio(f.get("A", "")) for f in filas if "Presupuesto" in f.get("A", "")), "")
    m = re.search(r"Presupuesto\s+(\d{4})", titulo)
    if not m or int(m.group(1)) != anio:
        raise SystemExit(f"{url}: el título no es del presupuesto {anio} («{titulo}»)")
    montos = {}
    total = None
    for f in filas:
        a = (f.get("A") or "").strip()
        m = re.match(r"^(\d{4})\s*-\s*(.+)$", a)
        if m and f.get("D"):
            montos[m.group(1)] = round(float(f["D"]))
        elif a.upper() == "TOTAL GENERAL" and f.get("D"):
            total = round(float(f["D"]))
    if total is None or abs(sum(montos.values()) - total) > 1:
        raise SystemExit(f"{url}: las filas suman {sum(montos.values())} y el total dice {total}")
    return {"tipo": tipo, "anio": anio, "titulo": titulo, "pagina": pagina, "url": url, "montos": montos}


def cuadros_de_transferencias(hoy: datetime.date) -> list:
    """La ley vigente (este año o el anterior) y, si existe, el proyecto del siguiente."""
    ley = None
    for anio in (hoy.year, hoy.year - 1):
        url = xlsx_de_pagina(PAGINA_LEY.format(anio=anio))
        if url:
            ley = cuadro_de_transferencias("ley", anio, PAGINA_LEY.format(anio=anio), url)
            break
    if not ley:
        raise SystemExit("DIGEPRES: sin cuadro de entidades receptoras en la página de la Ley de Presupuesto")
    cuadros = [ley]
    for anio in (hoy.year + 1, hoy.year):
        if anio <= ley["anio"]:
            break
        url = xlsx_de_pagina(PAGINA_PROYECTO.format(anio=anio))
        if url:
            cuadros.append(cuadro_de_transferencias("proyecto", anio, PAGINA_PROYECTO.format(anio=anio), url))
            break
    return cuadros


# ------------------------------------------------------------------ main

def main() -> None:
    hoy = datetime.date.today()
    req = urllib.request.Request(DGCP, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        unidades = [u for u in json.load(r)["payload"]["content"] if u.get("estado") == "ACTIVA"]
    if len(unidades) < 500:
        raise SystemExit(f"DGCP: solo {len(unidades)} unidades de compra activas; ¿cambió la API?")

    fiscal = json.loads((RAIZ / "public" / "data" / "fiscal.json").read_text())
    capitulos = {i["codigo"]: i["nombre"] for i in fiscal["instituciones"]}

    normativa = json.loads((RAIZ / "public" / "data" / "normativa.json").read_text())
    etiquetas = set()
    for filas in normativa["busquedas"].values():
        for f in filas:
            if f.get("Institucion"):
                etiquetas.add(f["Institucion"].strip())
    por_nombre = {}
    for e in etiquetas:
        clave = normalizar(e)
        if clave and ETIQUETA_NOMBRAMIENTOS not in clave:
            por_nombre.setdefault(clave, []).append(e)

    # El clasificador.
    medio = pdf_del_clasificador()
    pdf = bajar(medio["source_url"], ("application/pdf",), timeout=180)
    if not pdf.startswith(b"%PDF-"):
        raise SystemExit(f"{medio['source_url']}: no es un PDF")
    motor = "pypdf" if pypdf else "pdfminer.six"
    clasif = parsear_clasificador(paginas_pypdf(pdf) if pypdf else paginas_pdfminer(pdf))
    caps = clasif["caps"]
    por_clase: dict = {}
    for c in caps.values():
        por_clase[c["clase"]] = por_clase.get(c["clase"], 0) + 1
    locales = [k for k, c in caps.items() if sector_de_capitulo(c) == "local"]
    if len(caps) < 500:
        raise SystemExit(f"clasificador: solo {len(caps)} capítulos; ¿cambió el documento?")
    if len(locales) != LOCALES_ESPERADOS:
        raise SystemExit(f"clasificador: {len(locales)} gobiernos locales y no {LOCALES_ESPERADOS}; verifícalo antes de escribir")
    if not clasif["actualizado"]:
        raise SystemExit("clasificador: sin fecha «Actualizado al»")
    print(f"Clasificador Institucional ({motor}, {len(pdf):,} bytes, actualizado al {clasif['actualizado']}): "
          f"{len(caps)} capítulos · {clasif['subcapitulos']} subcapítulos · {clasif['ues']} unidades ejecutoras")
    print("  por clase: " + " · ".join(f"{k} {v}" for k, v in sorted(por_clase.items())))

    # El cruce de siempre, unidad por unidad.
    nomina_por_uc = {uc: cod for cod, uc in NOMINA.items()}
    salida = []
    for u in unidades:
        cod = u["codigo_unidad_compra"]
        if cod >= 900000:
            raise SystemExit(f"DGCP: código {cod} en el rango reservado a los capítulos del clasificador")
        cap = (u.get("codigo_capitulo") or "")[4:8]
        salida.append({
            "id": cod,
            "nombre": u["unidad_compra"].strip(),
            "acronimo": (u.get("acronimo") or "").strip(),
            "tipo": u.get("tipo") or "",
            "capitulo": cap if cap in capitulos else None,
            "nomina": nomina_por_uc.get(cod),
            "consultoria": sorted(por_nombre.get(normalizar(u["unidad_compra"]), [])),
            "_crudo": cap,
        })

    # Cada unidad, a su capítulo del clasificador.
    lugares_locales: dict = {}
    for k in locales:
        lugares_locales.setdefault((clase_local(caps[k]["nombre"]), lugar(caps[k]["nombre"])), []).append(k)
    alias = []
    sin_capitulo = []
    for x in salida:
        crudo = x["_crudo"]
        destino, motivo = None, None
        if x["id"] in ALIAS_UNIDAD:
            destino, motivo = ALIAS_UNIDAD[x["id"]], "tabla por unidad"
        elif x["tipo"] == "Gobierno local" and crudo not in locales:
            candidatos = lugares_locales.get((clase_local(x["nombre"]), lugar(x["nombre"])), [])
            if len(candidatos) == 1:
                destino, motivo = candidatos[0], "gobierno local por su nombre"
        elif crudo in caps:
            destino = crudo
        elif crudo in ALIAS_CODIGO:
            destino, motivo = ALIAS_CODIGO[crudo], "tabla por código"
        elif crudo in clasif["anexo"]:
            destino, motivo = clasif["anexo"][crudo], "anexo de receptoras"
        if destino and destino not in caps:
            raise SystemExit(f"alias de {x['id']} a {destino}, que no está en el clasificador")
        if motivo:
            alias.append((x, crudo, destino, motivo))
        x["clasificador"] = destino
        # Si la DGCP guarda un código que no es el de la entidad (un capítulo
        # retirado, la línea de deuda 0999 en la DGII, el ministerio en que dejó
        # a una junta de distrito), el presupuesto que la ficha enseña es el del
        # capítulo vigente o ninguno: nunca el de otra entidad.
        if motivo:
            x["capitulo"] = destino if destino in capitulos else None
        if destino:
            x["sector"] = sector_de_capitulo(caps[destino])
        else:
            # Un gobierno local que la DGCP pone en un ministerio sigue siendo local.
            x["sector"] = "local" if x["tipo"] == "Gobierno local" else sector_de_codigo(crudo)
        x["dgcp"] = True
        if not destino:
            sin_capitulo.append(x)

    crudos = {x["_crudo"] for x in salida}
    print(f"DGCP: {len(salida)} unidades activas · {len(crudos)} capítulos distintos · "
          f"{sum(1 for c in crudos if c in caps)} en el clasificador")
    print(f"Alias ({len(alias)}):")
    for x, crudo, destino, motivo in alias:
        print(f"  {x['id']:>5} {x['nombre'][:60]:<60} {crudo} → {destino} ({motivo}: {caps[destino]['nombre'][:50]})")
    print(f"Sin capítulo vigente en el clasificador ({len(sin_capitulo)}), sector por la familia del código:")
    for x in sin_capitulo:
        print(f"  {x['id']:>5} {x['nombre'][:60]:<60} {x['_crudo']} → {x['sector']}")

    # Los capítulos sin unidad de compra: una institución cada uno.
    con_unidad = {x["clasificador"] for x in salida if x["clasificador"]}
    nomina_por_cap = {cap: cod for cod, cap in NOMINA_CLASIFICADOR.items()}
    nuevas = []
    for k in sorted(caps):
        if k in con_unidad:
            continue
        c = caps[k]
        sector = sector_de_capitulo(c)
        nombre = nombre_de_capitulo(c)
        siglas = re.search(r"\(([A-ZÁÉÍÓÚÑ0-9]{2,12})\)\s*$", nombre)
        nuevas.append({
            "id": 900000 + int(k),
            "nombre": nombre,
            "acronimo": siglas.group(1) if siglas and sector != "local" else "",
            "tipo": tipo_de_capitulo(c),
            "capitulo": k if k in capitulos else None,
            "nomina": nomina_por_cap.get(k),
            "consultoria": sorted(por_nombre.get(normalizar(nombre), [])),
            "clasificador": k,
            "sector": sector,
            "dgcp": False,
        })
    # Homónimos: un capítulo nuevo cuyo lugar coincide con el de una unidad de
    # la DGCP que la DGCP ata a otro capítulo. Se respeta el código de la DGCP.
    for n in nuevas:
        if n["sector"] != "local":
            continue
        base = (clase_local(n["nombre"]), lugar(n["nombre"]))
        for x in salida:
            if x["sector"] == "local" and (clase_local(x["nombre"]), lugar(x["nombre"])) == base:
                print(f"  homónimo: {n['id']} {n['nombre']} ≠ DGCP {x['id']} {x['nombre']} (capítulo {x['clasificador']})")

    todas = salida + nuevas

    # Transferencias del Gobierno central, solo al capítulo de una sola institución.
    cuadros = cuadros_de_transferencias(hoy)
    por_capitulo: dict = {}
    for x in todas:
        if x["clasificador"]:
            por_capitulo.setdefault(x["clasificador"], []).append(x)
    fuentes_transferencia = {}
    for cuadro in cuadros:
        clave = f"{cuadro['tipo']}-{cuadro['anio']}"
        campo = "transferencia" if cuadro["tipo"] == "ley" else "transferenciaProyecto"
        montos = cuadro["montos"]
        locales_en_cuadro = [k for k in locales if k in montos]
        if len(locales_en_cuadro) != LOCALES_ESPERADOS:
            raise SystemExit(f"{cuadro['url']}: cubre {len(locales_en_cuadro)} de {LOCALES_ESPERADOS} gobiernos locales")
        puestas = compartidas = 0
        for k, monto in montos.items():
            if k not in caps or monto <= 0:
                continue
            duenos = por_capitulo.get(k, [])
            if len(duenos) == 1:
                duenos[0][campo] = {"anio": cuadro["anio"], "monto": monto, "fuente": clave}
                puestas += 1
            elif duenos:
                compartidas += 1
        total_locales = sum(v for k, v in montos.items() if k.startswith("7"))
        fuentes_transferencia[clave] = {
            "tipo": cuadro["tipo"],
            "anio": cuadro["anio"],
            "titulo": cuadro["titulo"],
            "pagina": cuadro["pagina"],
            "url": cuadro["url"],
            "total": sum(montos.values()),
            "totalLocales": total_locales,
            "sinRepartir": sum(v for k, v in montos.items() if k.startswith("7") and k not in caps),
        }
        print(f"Transferencias {clave}: {len(montos)} filas · {puestas} en su institución · "
              f"{compartidas} capítulos de varias unidades sin repartir · locales RD${total_locales:,}")

    for x in salida:
        del x["_crudo"]
    todas.sort(key=lambda x: x["id"])
    ids = [x["id"] for x in todas]
    if len(ids) != len(set(ids)):
        raise SystemExit("ids repetidos en el cruce")

    doc = {
        "generado": hoy.isoformat(),
        "fuentes": {
            "dgcp": {"url": DGCP, "consultado": hoy.isoformat(), "unidades": len(salida)},
            "clasificador": {
                "url": medio["source_url"],
                "titulo": "Clasificador Institucional",
                "actualizado": clasif["actualizado"],
                "consultado": hoy.isoformat(),
                "capitulos": len(caps),
                "locales": len(locales),
            },
            "transferencias": fuentes_transferencia,
        },
        "instituciones": todas,
    }
    SALIDA.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")))

    con_cap = sum(1 for x in todas if x["capitulo"])
    con_dec = sum(1 for x in todas if x["consultoria"])
    print(f"{len(salida)} unidades de compra + {len(nuevas)} capítulos sin unidad = {len(todas)} instituciones · "
          f"{con_cap} con presupuesto en el SIGEF · {sum(1 for x in todas if x['nomina'])} con nómina · "
          f"{con_dec} con decretos")
    sectores: dict = {}
    for x in todas:
        par = sectores.setdefault(x["sector"], [0, 0])
        par[0 if x["dgcp"] else 1] += 1
    print("Por sector (DGCP + nuevas): " + " · ".join(f"{k} {a}+{b}" for k, (a, b) in sorted(sectores.items())))
    print(f"→ {SALIDA} ({SALIDA.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
