#!/usr/bin/env python3
"""Genera public/data/sanciones.json: las medidas de la DGCP sobre proveedores
del Estado, empresas y personas físicas, y las entidades de la lista SDN de la
OFAC ligadas a la República Dominicana.

Cinco descargas (reconocimiento del 2026-09-29; docs/INFRAESTRUCTURA.md §5.1):

1. **Proveedores inhabilitados**, la tabla que la DGCP sirve en su sección
   «Tablas» de datos abiertos:
   `https://datosabiertos.dgcp.gob.do/api-dgcp/v1/tablas/proveedores?Type=csv&inhabilitados=true`
   (~0.9 MB, `ProveedoresInhabilitados.csv`). Una fila por **medida**, no por
   proveedor: `RPE, MOTIVO_INHABILITACION, FECHA, FECHA_INHABILITACION,
   FECHA_HABILITACION, FECHA_FIRMA_RESOLUCION, OFICIO_INHABILITACION,
   URL_CERTIFICACION_RPE`. No trae el tipo de medida: **se lee del texto del
   motivo** con las reglas de `clasificar()` (abajo), en una lista cerrada.
2. **El Registro de Proveedores entero** (la misma tabla con
   `inhabilitados=false`, ~80 MB, que **no** excluye a los inhabilitados): da
   la razón social, el documento, el tipo de persona y el estado actual de
   cada RPE. Se leen solo esas columnas; teléfonos, correos y contactos se
   descartan al leer (publicar no es exponer).
5. **La lista de firmas e individuos inhabilitados del Banco Mundial**: la
   API que usa su página, con la clave que la página publica (se lee de la
   página en cada corrida y no se escribe en ningún sitio
   del 2026-09-30, docs/INFRAESTRUCTURA.md §5.1). Se guardan las firmas ligadas al
   país y las que tienen exactamente el mismo nombre que un proveedor inscrito
   en la DGCP; los individuos solo se cuentan.
3. y 4. **La lista SDN de la OFAC** (Tesoro de Estados Unidos),
   `https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV`
   y `…/ADD.CSV` (direcciones): responden 302 a una URL firmada de S3, que se
   sigue. Sin fila de cabecera; `-0-` es vacío.

Posturas:

- **Las personas físicas, con su nombre y nunca con su cédula**. Hasta entonces se contaban y no se
  publicaban. Una medida sobre una persona física inscrita con cédula se
  guarda con el nombre del registro y `fisica: true`; su documento no se
  escribe ni en la instantánea, y tampoco el enlace a la constancia del RPE,
  que lo muestra. Dentro de los motivos, los nombres y documentos de personas
  que firman una solicitud se sustituyen por «[nombre omitido]» y
  «[documento omitido]» (`anonimizar()`), y toda cédula escrita en el texto
  por «[documento omitido]».
- **Filas de prueba** del propio sistema («prueba», «Tipo Sanción») no se
  publican; filas repetidas que solo difieren en la hora de registro se
  publican una vez. Las dos cuentas quedan en los metadatos.
- **De la OFAC, solo entidades** (nunca `individual`) ligadas al país por un
  número fiscal dominicano, una dirección en el país o una mención en sus
  observaciones. Es una lista extranjera: se dice así en la interfaz.

User-Agent identificable, una petición a la vez con más de un segundo entre
ellas, un reintento, `content-type` validado. **No escribe nada** si lo leído
es inverosímil: menos de 1,500 medidas, un cruce con el registro por debajo del
99 %, una lista SDN de menos de 10,000 entradas o ninguna entidad dominicana.

Uso:
    python3 scripts/build-sanciones.py                # descarga las cuatro fuentes
    python3 scripts/build-sanciones.py --guardar DIR  # y deja lo descargado en DIR
    python3 scripts/build-sanciones.py --local DIR    # usa inhabilitados.csv, proveedores.csv,
                                                      # sdn.csv, add.csv y bm.json de DIR
"""
import csv
import datetime
import email.utils
import io
import json
import pathlib
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "data" / "sanciones.json"
UA = "Socratico-Inteligencia/1.0 (medidas sobre proveedores; herramienta independiente)"
BASE_DGCP = "https://datosabiertos.dgcp.gob.do/api-dgcp/v1/tablas/proveedores"
URL_INHAB = f"{BASE_DGCP}?Type=csv&inhabilitados=true"
URL_RPE = f"{BASE_DGCP}?Type=csv&inhabilitados=false"
BASE_OFAC = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports"
URL_SDN = f"{BASE_OFAC}/SDN.CSV"
URL_ADD = f"{BASE_OFAC}/ADD.CSV"

URL_BM = "https://www.worldbank.org/en/projects-operations/procurement/debarred-firms"

MIN_EVENTOS = 1500
MIN_CRUCE = 0.99
MIN_SDN = 10_000
MIN_BM = 1_000

_ultima = 0.0


def bajar(url: str, tipos: tuple[str, ...], cabeceras: dict | None = None) -> tuple[bytes, str]:
    """GET con UA propio, un reintento y el tipo validado. Devuelve el cuerpo
    y su `Last-Modified`. Entre dos peticiones pasa más de un segundo."""
    global _ultima
    for intento in (1, 2):
        espera = 1.2 - (time.monotonic() - _ultima)
        if espera > 0:
            time.sleep(espera)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, **(cabeceras or {})})
            with urllib.request.urlopen(req, timeout=300) as r:
                tipo = r.headers.get("content-type", "")
                if not any(t in tipo for t in tipos):
                    raise RuntimeError(f"{url}: content-type inesperado «{tipo}»")
                cuerpo = r.read()
                _ultima = time.monotonic()
                return cuerpo, r.headers.get("last-modified", "")
        except Exception as e:  # noqa: BLE001 — un reintento y fuera
            _ultima = time.monotonic()
            if intento == 2:
                raise
            print(f"  reintento: {e}", file=sys.stderr)
            time.sleep(10)
    raise AssertionError


def texto(crudo: bytes) -> str:
    try:
        return crudo.decode("utf-8-sig")
    except UnicodeDecodeError:
        return crudo.decode("cp1252", errors="replace")


def dia(v: str | None) -> str | None:
    """«2026-09-03 00:00:00.000» → «2026-09-03»; vacío o raro → None."""
    m = re.match(r"^\s*(\d{4}-\d{2}-\d{2})", v or "")
    return m.group(1) if m else None


def limpio(v: str | None) -> str:
    """Espacios y tabuladores colapsados, sin bordes: el texto del Estado tal
    cual, sin la basura de captura («RIC-0196-2026 », «…proceso.\\t»)."""
    return re.sub(r"\s+", " ", v or "").strip()


# --------------------------------------------------------- el tipo de medida

def plano(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s.lower()).strip()


def _r(p: str) -> re.Pattern:
    return re.compile(p)


# El orden importa: la primera regla que casa decide. Cada una se escribió
# leyendo los 915 textos distintos de la tabla del 2026-09-29.
PRUEBA = _r(r"^prueba\b|^tipo\s*sancion$")
LEVANTA = _r(r"levantar la inhabilitacion|anula la resolucion|^no (se encuentra|aplica) (dentro del |el )?regimen")
CORRIGE = _r(
    r"duplicid|duplicad|creado por error|se creo como definitivo|numero de documento incorrecto"
    r"|creacion inicial de este proveedor fue incorrecta|rnc erroneo|fue corrompida"
    r"|cancelacion del rpe por incidencia|fusion por absorcion"
)
VOLUNTARIA = _r(
    r"a (solicitud|requerimiento) del proveedor|solicitud del proveedor|a solicitud de la empresa"
    r"|solicitada por el proveedor|(cancelacion|suspension) solicitada|solicitada mediante"
    r"|proveedor solicita|en la que el (proveedor|representante del consorcio) solicita"
    r"|\bsolicito (la|mi|que|expresamente)|\bsolicita (la|su)\b|(tengo|tenemos|tenga|tiene) a bien solicitar"
    r"|(tengo|tenemos) la honra de dirigirme.*solicitar|le solicito|deseo inhabilitar|requiero la inhabilitacion"
    r"|exclusion voluntaria|con aprobacion del proveedor|inhabilitado por solicitud|solicitarle la (exclusion|cancelacion)"
    r"|total y definitiva del registro|retiro del proveedor|a solicitud de(l| la)? (sr|sra|senor|senora)\b"
    r"|cancelacion en virtud de la comunicacion ex-|cancelacion del registro de proveedor del estado mediante la comunicacion"
    r"|^comunicacion de fecha"
)
VINCULO = _r(r"posible vinculo")
PENAL = _r(r"delitos? (cometidos )?contra la administracion|investigacion penal")
CONDENA = _r(r"condenados por delitos.*cancelacion de oficio|sobre proveedores condenados")
INHABILITA = _r(r"inhabil+it")
PERMANENTE = _r(r"permanente")
TEMPORAL = _r(
    r"temporal|\bpor (un|1|dos|2|tres|3|uno) (\(\d\) )?anos?\b|\bpor \(\d\) anos?\b|\bpor \d+ \(\w+\) anos?\b"
    r"|\binhabilitados? (por )?(un|1|dos|2|\d+) anos?\b|\bhasta el \d|periodo de (un|dos|\d)"
)
INCUMPLE = _r(
    r"^incumplimiento|rescici|recisi|rescisi|renuncia tacita|advertencia escrita|ha incurrido en incumplimiento"
    r"|documento falso en su oferta|suspencion del contrato|incumplimiento por parte del oferente"
)
PROHIBE = _r(
    r"regimen de (las )?(prohibicion|inhabilidades|incompatibilidades)|imposibilidad para contratar"
    r"|ley \d{3}-\d{2},? art(iculo|\.)? ?14\b"
)
CASACION = _r(r"memorial de casacion")
SUSPENDE = _r(r"suspen")
CANCELA = _r(r"cancel")

TIPOS = (
    "inhabilitacion-permanente", "inhabilitacion-temporal", "inhabilitacion",
    "incumplimiento", "prohibicion", "penal", "vinculo", "condena", "suspension",
    "cancelacion", "suspension-solicitud", "cancelacion-solicitud", "correccion",
    "levantamiento", "otro",
)


def _primero(t: str, *patrones: re.Pattern) -> int | None:
    """Cuál de los patrones aparece antes en el texto."""
    pos = [(m.start(), i) for i, p in enumerate(patrones) if (m := p.search(t))]
    return min(pos)[1] if pos else None


def clasificar(motivo: str) -> str:
    """El tipo de medida, leído del texto de la DGCP. Lista cerrada (`TIPOS`);
    lo que no encaja es `otro` y se lee entero."""
    t = plano(motivo)
    if LEVANTA.search(t):
        return "levantamiento"
    if CORRIGE.search(t):
        return "correccion"
    if VOLUNTARIA.search(t):
        # Suspensión o cancelación: manda la palabra que aparece antes. Pedir
        # dejar de ser proveedor sin decir cuál (inhabilitar, excluir,
        # eliminar) es una baja.
        s = re.search(r"suspen|inactivacion temporal|inhabilitacion temporal|hasta nuevo aviso", t)
        c = re.search(r"cancel|definitiva|eliminar|eliminacion|exclusion|retiro", t)
        if s and (not c or s.start() < c.start()):
            return "suspension-solicitud"
        return "cancelacion-solicitud"
    if VINCULO.search(t):
        return "vinculo"
    if PENAL.search(t):
        return "condena" if CONDENA.search(t) else "penal"
    if INHABILITA.search(t):
        # «Inhabilitación temporal por tres años … graduación de la sanción de
        # inhabilitación permanente»: manda lo que el texto dice primero.
        cual = _primero(t, PERMANENTE, TEMPORAL)
        if cual == 0:
            return "inhabilitacion-permanente"
        if cual == 1:
            return "inhabilitacion-temporal"
    if INCUMPLE.search(t):
        return "incumplimiento"
    if PROHIBE.search(t):
        return "prohibicion"
    if CASACION.search(t):
        return "otro"
    if INHABILITA.search(t):
        return "inhabilitacion"
    if SUSPENDE.search(t):
        return "suspension"
    if CANCELA.search(t):
        return "cancelacion"
    return "otro"


# ------------------------------------------ personas dentro de los motivos

TITULO = r"(?:Sr|Sra|Srta|Dr|Dra|Ing|Lic|Licda|Arq)\.?"
NOMBRE = r"[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñü.'´]*(?:\s+(?:de|del|la|las|los|y|De|Del|La|Los)?\s*[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñü.'´]*){0,6}"
ANONIMIZAR = [
    # «Quien suscribe, Juana Martich, …» / «Quien suscribe, la Sra. …, …» / «Lic. …, titular…»
    (re.compile(rf"(Quien suscribe,\s*(?:la\s+|el\s+)?(?:{TITULO}\s+)?){NOMBRE}", re.I), r"\1[nombre omitido]"),
    # «El Sr. Kelvin Jiménez (001-…) solicita…», «La Dra. Xenia García (…)»
    (re.compile(rf"\b((?:El|La)\s+{TITULO}\s+){NOMBRE}(\s*\()"), r"\1[nombre omitido]\2"),
    # «a solicitud del Sr. Darío … Número de Documento: …»
    (re.compile(rf"(a solicitud del?\s+{TITULO}\s+){NOMBRE}", re.I), r"\1[nombre omitido]"),
    # «SUSCRITA POR LA SRA TERESA CERÓN;»
    (re.compile(r"(SUSCRITA POR (?:LA|EL) (?:SRA|SR|SEÑORA|SEÑOR)\.?\s+)[^;,.]+", re.I), r"\1[nombre omitido]"),
    # «por ser la señora Rashel … Heredia, quien es servidora pública…»
    (re.compile(rf"(por ser (?:la señora|el señor)\s+){NOMBRE}", re.I), r"\1[nombre omitido]"),
    # «uno de los socios específicamente el Dr. Fidias F. Aristy, …»
    (re.compile(rf"(específicamente (?:el|la)\s+{TITULO}\s+){NOMBRE}", re.I), r"\1[nombre omitido]"),
    # «- Lic. Wilcady Dumé - Enc. del RPE» (quien lo registró en la DGCP)
    (re.compile(rf"(-\s*{TITULO}\s+)[^-]+?(\s*-\s*Enc\.)"), r"\1[nombre omitido]\2"),
    # «Yo, Julio Armando Aybar Aguasvivas, portador de…»
    (re.compile(rf"(\bYo,\s*){NOMBRE}"), r"\1[nombre omitido]"),
]
# Cédula (con o sin guiones), pasaporte y domicilio particular. Un domicilio
# puede tener muchos tramos entre comas («c/Santa Teresa, No.6, Edif. …, Apto,
# 3D, Naco»): llega hasta la fórmula que sigue en la carta. Un punto no lo
# termina, porque las direcciones los llevan («Edif. Avellano»).
DOCUMENTO = re.compile(r"\b\d{3}-?\s?\d{7}-?\s?\d\b|\b\d{11}\b|Pasaporte-?\s?[A-Z]{0,3}\d{5,9}", re.I)
DOMICILIO = re.compile(
    r"(domiciliad[oa]s? y residentes? en )(?!esta ciudad)[^,]+(?:,[^,]+){0,12}?"
    r"(?=,\s*(?:cortesmente|me dirijo|requiero|tenga a bien|solicit|por medio|mediante|quien)|$)", re.I)
# El estado civil, el correo y el teléfono de quien firma tampoco se publican.
ESTADO_CIVIL = re.compile(r"\b(?:casad|solter|divorciad|viud)[oa]s?\b", re.I)
CORREO = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
TELEFONO = re.compile(r"\b(?:\+?1[\s-]?)?\(?(?:809|829|849)\)?[\s.-]?\d{3}[\s.-]?\d{4}\b")
# Lo que no puede quedar después de anonimizar: si queda, no se escribe.
DOMICILIO_SUELTO = re.compile(r"domiciliad[oa]s? y residentes? en (?!esta ciudad|\[domicilio omitido\])", re.I)


def anonimizar(motivo: str) -> tuple[str, bool]:
    """Quita del motivo el nombre, el documento y el domicilio de las personas
    que firman una solicitud. La razón social de la empresa no se toca: es
    el proveedor."""
    salida = motivo
    for patron, cambio in ANONIMIZAR:
        salida = patron.sub(cambio, salida)
    salida = DOCUMENTO.sub("[documento omitido]", salida)
    salida = DOMICILIO.sub(r"\1[domicilio omitido]", salida)
    salida = ESTADO_CIVIL.sub("[estado civil omitido]", salida)
    salida = CORREO.sub("[correo omitido]", salida)
    salida = TELEFONO.sub("[teléfono omitido]", salida)
    return salida, salida != motivo


# ---------------------------------------------------------------- la OFAC

def programas(campo: str) -> list[str]:
    """«SDNTK] [ILLICIT-DRUGS-EO14059» → ["SDNTK", "ILLICIT-DRUGS-EO14059"]."""
    return [p.strip(" []") for p in re.split(r"\]\s*\[", campo or "") if p.strip(" []-0")]


def vacio(v: str) -> str:
    v = (v or "").strip()
    return "" if v == "-0-" else v


def ofac(sdn_txt: str, add_txt: str, rnc_a_rpes: dict[str, list[str]]):
    direcciones: dict[str, list[list[str]]] = {}
    for fila in csv.reader(io.StringIO(add_txt)):
        if len(fila) >= 5 and "dominican republic" in fila[4].lower():
            direcciones.setdefault(fila[0].strip(), []).append(fila)
    entradas = 0
    ligadas = 0
    individuos = 0
    salida = []
    for f in csv.reader(io.StringIO(sdn_txt)):
        if len(f) < 12 or not f[0].strip().isdigit():
            continue
        entradas += 1
        ent = f[0].strip()
        obs = vacio(f[11])
        via = []
        m = re.search(r"Tax ID No\.\s*([\d-]+)\s*\(Dominican Republic\)", obs)
        if m:
            via.append("rnc")
        if ent in direcciones:
            via.append("direccion")
        if "dominican republic" in obs.lower() and not m:
            via.append("mencion")
        if not via:
            continue
        ligadas += 1
        if vacio(f[2]).lower() == "individual":
            individuos += 1  # personas: no se guardan
            continue
        rnc = re.sub(r"\D", "", m.group(1)) if m else None
        if rnc and len(rnc) != 9:
            rnc = None
        salida.append({
            "ent": int(ent),
            "nombre": limpio(f[1]),
            "programas": programas(vacio(f[3])),
            "rnc": rnc,
            "pais": "República Dominicana",
            "via": via,
            "alias": re.findall(r"a\.k\.a\. '([^']+)'", obs),
            "rpes": rnc_a_rpes.get(rnc, []) if rnc else [],
        })
    salida.sort(key=lambda e: e["nombre"])
    return salida, entradas, ligadas, individuos


# ------------------------------------------------------- el Banco Mundial

# Formas societarias al final de un nombre: «…, S.R.L.», «… SAS», «… Ltd.».
FORMAS = {"srl", "sa", "sas", "eirl", "ltd", "ltda", "llc", "inc", "corp", "co", "limited", "gmbh", "sl",
          "sac", "spa", "sarl", "bv", "ag", "plc", "pvt", "pte"}


def clave_empresa(nombre: str) -> str:
    """El nombre de una empresa para compararlo con otro: sin tildes, sin
    puntuación y sin la forma societaria del final. «APPLUS NORCONTROL
    REPUBLICA DOMINICANA, SRL» y «…, S.R.L.» dan la misma clave."""
    t = re.sub(r"[^a-z0-9 ]+", " ", plano(nombre).replace(".", ""))
    palabras = t.split()
    while palabras and palabras[-1] in FORMAS:
        palabras.pop()
    return " ".join(palabras)


def robots_permite_api(url: str) -> tuple[bool, str]:
    """El robots.txt del host de una API, con la regla del estándar (RFC 9309,
    §2.3.1): si responde 200, manda su grupo `User-agent: *` sobre la ruta; si
    responde 4xx, el archivo «no está disponible» y se puede leer; si responde
    5xx o no contesta, no se lee. El gateway del Banco Mundial responde 403 a
    `/robots.txt` y 200 a su API (docs/INFRAESTRUCTURA.md §5.1)."""
    partes = urllib.parse.urlsplit(url)
    try:
        req = urllib.request.Request(f"{partes.scheme}://{partes.netloc}/robots.txt", headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=25) as r:
            texto_robots = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if 400 <= e.code < 500:
            return True, f"robots {e.code}: no disponible (RFC 9309 §2.3.1.3)"
        return False, f"robots {e.code}: no se lee"
    except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
        return False, f"robots ilegible ({e})"
    ruta = partes.path or "/"
    agentes, reglas, en_reglas = [], [], False
    for linea in texto_robots.splitlines():
        linea = linea.split("#")[0].strip()
        if ":" not in linea:
            continue
        k, v = (x.strip() for x in linea.split(":", 1))
        if k.lower() == "user-agent":
            if en_reglas:
                agentes, en_reglas = [], False
            agentes.append(v)
        elif k.lower() in ("allow", "disallow"):
            en_reglas = True
            if "*" in agentes and v:
                reglas.append((k.lower(), v))
    casan = [(len(v), k) for k, v in reglas if ruta.startswith(v.rstrip("*").rstrip("$"))]
    if casan and max(casan)[1] == "disallow":
        return False, "robots veta la ruta de la API"
    return True, "robots permite"


def leer_banco_mundial(local: pathlib.Path | None) -> tuple[list[dict], bytes, str | None]:
    """La lista de firmas e individuos inhabilitados del Banco Mundial
    (docs/INFRAESTRUCTURA.md §5.1). Su API exige una clave que la propia página
    publica en un `<script>`; se usa con una condición: **no se escribe en ningún sitio**. Se lee
    de la página en cada corrida y vive solo en memoria. Devuelve las filas,
    la respuesta cruda (para `--guardar`; no lleva la clave) y la fecha de
    actualización que declara el Banco."""
    if local is not None:
        crudo = (local / "bm.json").read_bytes()
    else:
        pagina, _ = bajar(URL_BM, ("text/html",))
        h = texto(pagina)
        m_api = re.search(r'var\s+prodtabApi\s*=\s*"(https://[^"]+)"', h)
        m_clave = re.search(r'var\s+propApiKey\s*=\s*"([^"]{16,64})"', h)
        if not (m_api and m_clave and re.search(r'"apikey"\s*:\s*propApiKey\b', h)):
            sys.exit("Banco Mundial: la página ya no publica el endpoint y la clave como antes. No se escribe.")
        permite, nota = robots_permite_api(m_api.group(1))
        print(f"  gateway del Banco Mundial: {nota}")
        if not permite:
            sys.exit(f"Banco Mundial: {nota}. No se escribe; si el veto sigue, se quita la lista del script.")
        crudo, _ = bajar(m_api.group(1), ("application/json",), cabeceras={"apikey": m_clave.group(1)})
    filas = json.loads(texto(crudo)).get("response", {}).get("ZPROCSUPP") or []
    if len(filas) < MIN_BM:
        sys.exit(f"Banco Mundial: {len(filas)} entradas (se esperaban más de {MIN_BM}). No se escribe.")
    fecha = max((dia(f.get("LAST_REFRESH_DATE")) or "" for f in filas), default="") or None
    return filas, crudo if local is None else b"", fecha


def banco_mundial(filas: list[dict], nombre_a_rpes: dict[str, list[str]]) -> tuple[list[dict], dict]:
    """Las firmas de la lista ligadas al país (por su país o su dirección) o
    con **exactamente el mismo nombre** que un proveedor inscrito en la DGCP.
    Los individuos no se guardan, como en la OFAC: solo se cuentan."""
    salida, individuos, firmas = [], 0, 0
    for f in filas:
        if (f.get("SUPP_TYPE_CODE") or "").upper() == "I":
            individuos += 1
            continue
        firmas += 1
        nombre = limpio(f.get("SUPP_NAME"))
        lugar = " ".join(limpio(f.get(k)) for k in ("COUNTRY_NAME", "SUPP_ADDR", "SUPP_CITY", "SUPP_STATE_CODE"))
        dominicana = (f.get("LAND1") or "").upper() == "DO" or "dominican" in lugar.lower()
        clave = clave_empresa(nombre)
        rpes = nombre_a_rpes.get(clave, []) if len(clave.split()) >= 2 and len(clave) >= 8 else []
        if not (dominicana or rpes):
            continue
        motivo = limpio(f.get("DEBAR_REASON")).rstrip(".")
        hasta = dia(f.get("DEBAR_TO_DATE"))
        salida.append({
            "id": f.get("SUPP_ID"),
            "nombre": nombre,
            "pais": limpio(f.get("COUNTRY_NAME")) or None,
            "desde": dia(f.get("DEBAR_FROM_DATE")),
            # 2999-12-31 es su manera de escribir «sin fecha de fin».
            "hasta": None if (hasta or "").startswith("2999") else hasta,
            "motivo": motivo or None,
            "cruzada": motivo.lower().startswith("cross debarment") or (f.get("ELIG_STAT") or "").upper().startswith("X"),
            "estado": limpio(f.get("INELIGIBLY_STATUS")) or None,
            "dominicana": dominicana,
            "rpes": rpes,
        })
    salida.sort(key=lambda e: (not e["dominicana"], e["nombre"]))
    return salida, {"firmas": firmas, "individuosOmitidos": individuos}


# ------------------------------------------------------------------ main

def main() -> None:
    local = None
    if "--local" in sys.argv:
        local = pathlib.Path(sys.argv[sys.argv.index("--local") + 1])

    if local:
        crudo_inhab = (local / "inhabilitados.csv").read_bytes()
        crudo_rpe = (local / "proveedores.csv").read_bytes()
        crudo_sdn, lm_sdn = (local / "sdn.csv").read_bytes(), ""
        crudo_add = (local / "add.csv").read_bytes()
        filas_bm, _, fecha_bm = leer_banco_mundial(local)
    else:
        print("DGCP: proveedores inhabilitados…")
        crudo_inhab, _ = bajar(URL_INHAB, ("text/csv",))
        print("DGCP: registro de proveedores (~80 MB)…")
        crudo_rpe, _ = bajar(URL_RPE, ("text/csv",))
        print("OFAC: SDN.CSV y ADD.CSV…")
        crudo_sdn, lm_sdn = bajar(URL_SDN, ("text/csv", "application/octet-stream"))
        crudo_add, _ = bajar(URL_ADD, ("text/csv", "application/octet-stream"))
        print("Banco Mundial: firmas e individuos inhabilitados…")
        filas_bm, crudo_bm, fecha_bm = leer_banco_mundial(None)
        if "--guardar" in sys.argv:
            # Para rehacer sin volver a bajar 80 MB (`--local`). Fuera del
            # repositorio: el registro entero trae teléfonos y correos.
            destino = pathlib.Path(sys.argv[sys.argv.index("--guardar") + 1])
            destino.mkdir(parents=True, exist_ok=True)
            # La respuesta del Banco Mundial no lleva la clave: se pidió con ella en la cabecera.
            for nombre, crudo in (("inhabilitados.csv", crudo_inhab), ("proveedores.csv", crudo_rpe),
                                  ("sdn.csv", crudo_sdn), ("add.csv", crudo_add), ("bm.json", crudo_bm)):
                (destino / nombre).write_bytes(crudo)

    hoy = datetime.date.today().isoformat()

    # 1. Las medidas, fila a fila.
    filas = list(csv.DictReader(io.StringIO(texto(crudo_inhab))))
    necesarias = {"RPE", "MOTIVO_INHABILITACION", "FECHA", "FECHA_INHABILITACION", "FECHA_HABILITACION",
                  "FECHA_FIRMA_RESOLUCION", "OFICIO_INHABILITACION", "URL_CERTIFICACION_RPE"}
    if not filas or not necesarias <= set(filas[0].keys()):
        sys.exit(f"La tabla de inhabilitados cambió de forma: {list(filas[0].keys()) if filas else 'vacía'}. No se escribe.")
    rpes_tabla = {f["RPE"].strip() for f in filas}

    # 2. El registro: solo las columnas que se publican, solo de esos RPE, y el
    #    RNC → RPE de todas las personas jurídicas para cruzar la OFAC.
    registro: dict[str, dict] = {}
    rnc_a_rpes: dict[str, list[str]] = {}
    nombre_a_rpes: dict[str, list[str]] = {}
    lector = csv.DictReader(io.StringIO(texto(crudo_rpe)))
    columnas = {"RPE", "RAZON_SOCIAL", "NUMERO_DOCUMENTO", "TIPO_DOCUMENTO", "TIPO_PERSONA", "ESTADO_RPE"}
    if not columnas <= set(lector.fieldnames or []):
        sys.exit(f"El registro de proveedores cambió de forma: faltan {columnas - set(lector.fieldnames or [])}. No se escribe.")
    total_registro = 0
    for f in lector:
        total_registro += 1
        rpe = (f.get("RPE") or "").strip()
        # Un RNC son nueve cifras. Al cancelar un registro, la DGCP le pega
        # «@C» al documento (una vez por cancelación: «132406079@C2»), así el
        # número queda libre para inscribirse de nuevo: los 457 documentos con
        # «@» del registro del 2026-09-29 son todos de RPE cancelados. Las
        # nueve cifras de delante siguen siendo el RNC de la empresa.
        doc = re.sub(r"[\s-]", "", f.get("NUMERO_DOCUMENTO") or "")
        m_rnc = re.fullmatch(r"(\d{9})(?:@C\d*)*", doc)
        juridica = "jur" in (f.get("TIPO_PERSONA") or "").lower()
        es_rnc = (f.get("TIPO_DOCUMENTO") or "").strip().upper() == "RNC" and m_rnc is not None
        doc = m_rnc.group(1) if es_rnc else doc
        if juridica and es_rnc:
            rnc_a_rpes.setdefault(doc, []).append(rpe)
        if juridica:
            nombre_a_rpes.setdefault(clave_empresa(f.get("RAZON_SOCIAL") or ""), []).append(rpe)
        if rpe in rpes_tabla:
            registro[rpe] = {
                "razonSocial": limpio(f.get("RAZON_SOCIAL")),
                "rnc": doc if es_rnc else None,
                "juridica": juridica,
                "estadoRpe": limpio(f.get("ESTADO_RPE")) or None,
            }
    del crudo_rpe

    cruzados = len(rpes_tabla & registro.keys())
    if len(filas) < MIN_EVENTOS:
        sys.exit(f"Solo {len(filas)} medidas en la tabla (se esperaban más de {MIN_EVENTOS}): no se escribe.")
    if cruzados / max(1, len(rpes_tabla)) < MIN_CRUCE:
        sys.exit(f"Solo {cruzados} de {len(rpes_tabla)} RPE cruzan con el registro: no se escribe.")

    # 3. Cada medida, clasificada. Las personas físicas se publican con su
    #    nombre, sin documento ni constancia (la constancia muestra la cédula).
    vistos: set[tuple] = set()
    duplicadas = pruebas = eventos_fisicas = anonimizados = 0
    fisicas: set[str] = set()
    sin_cruce: set[str] = set()
    proveedores: dict[str, dict] = {}
    corte = ""
    for f in filas:
        rpe = f["RPE"].strip()
        motivo = limpio(f["MOTIVO_INHABILITACION"])
        corte = max(corte, dia(f["FECHA"]) or "")
        # Mismo proveedor, misma medida, registrada dos veces con minutos de
        # diferencia: se publica una.
        clave = tuple(limpio(f[c]) for c in sorted(necesarias - {"FECHA"}))
        if clave in vistos:
            duplicadas += 1
            continue
        vistos.add(clave)
        if PRUEBA.search(plano(motivo)):
            pruebas += 1
            continue
        reg = registro.get(rpe)
        if not reg:
            sin_cruce.add(rpe)
            continue
        fisica = not reg["juridica"]
        if fisica:
            fisicas.add(rpe)
            eventos_fisicas += 1
        publicado, cambio = anonimizar(motivo)
        anonimizados += cambio
        hasta = dia(f["FECHA_HABILITACION"])
        evento = {
            "fecha": dia(f["FECHA_INHABILITACION"]) or dia(f["FECHA"]),
            "tipo": clasificar(motivo),
            "motivo": publicado,
            "resolucion": limpio(f["OFICIO_INHABILITACION"]) or None,
            "fechaResolucion": dia(f["FECHA_FIRMA_RESOLUCION"]),
            "hasta": hasta,
            "programada": bool(hasta and hasta > hoy),
        }
        p = proveedores.setdefault(rpe, {
            "rpe": rpe,
            "razonSocial": reg["razonSocial"],
            "rnc": None if fisica else reg["rnc"],
            "estadoRpe": reg["estadoRpe"],
            "certificacion": None,
            **({"fisica": True} if fisica else {}),
            "eventos": [],
        })
        # La constancia del RPE es la misma en todas sus medidas (su
        # `companyCode`): va una vez, en el proveedor. La de una persona física
        # no se enlaza: muestra su cédula.
        url = limpio(f["URL_CERTIFICACION_RPE"])
        if not fisica and re.search(r"companyCode=\d+$", url):
            p["certificacion"] = url
        p["eventos"].append(evento)

    sueltos = [p["rpe"] for p in proveedores.values() for e in p["eventos"] if DOMICILIO_SUELTO.search(e["motivo"])]
    if sueltos:
        sys.exit(f"Queda un domicilio particular sin omitir en los motivos de los RPE {sorted(set(sueltos))}: no se escribe.")
    lista = []
    for p in proveedores.values():
        p["eventos"].sort(key=lambda e: e["fecha"] or "", reverse=True)
        lista.append(p)
    lista.sort(key=lambda p: (p["eventos"][0]["fecha"] or "", p["rpe"]), reverse=True)
    publicados = sum(len(p["eventos"]) for p in lista)
    juridicas = sum(1 for p in lista if not p.get("fisica"))

    # 4. La OFAC.
    entidades, entradas, ligadas, individuos = ofac(texto(crudo_sdn), texto(crudo_add), rnc_a_rpes)
    if entradas < MIN_SDN:
        sys.exit(f"La lista SDN trae {entradas} entradas (se esperaban más de {MIN_SDN}): no se escribe.")
    if not entidades:
        sys.exit("Ninguna entidad de la lista SDN ligada a la República Dominicana: ¿cambió el formato? No se escribe.")
    fecha_sdn = None
    if lm_sdn:
        try:
            fecha_sdn = email.utils.parsedate_to_datetime(lm_sdn).date().isoformat()
        except (TypeError, ValueError):
            fecha_sdn = None

    # 5. El Banco Mundial.
    bm, cuenta_bm = banco_mundial(filas_bm, nombre_a_rpes)

    salida = {
        "generado": hoy,
        "fuentes": {
            "dgcp": {
                "url": URL_INHAB,
                "urlRegistro": URL_RPE,
                "filas": len(filas),
                "rpe": len(rpes_tabla),
                "corte": corte or None,
                "registro": total_registro,
                "duplicadas": duplicadas,
                "pruebas": pruebas,
                "sinCruce": len(sin_cruce),
                "personasFisicas": len(fisicas),
                "eventosPersonasFisicas": eventos_fisicas,
                "juridicas": juridicas,
                "eventos": publicados,
                "motivosAnonimizados": anonimizados,
            },
            "ofac": {
                "url": URL_SDN,
                "fecha": fecha_sdn,
                "entradas": entradas,
                "ligadasRd": ligadas,
                "individuosOmitidos": individuos,
            },
            "bancoMundial": {
                "url": URL_BM,
                "fecha": fecha_bm,
                "entradas": len(filas_bm),
                "firmas": cuenta_bm["firmas"],
                "individuosOmitidos": cuenta_bm["individuosOmitidos"],
                "dominicanas": sum(1 for e in bm if e["dominicana"]),
                "coincidencias": sum(1 for e in bm if e["rpes"]),
            },
        },
        "proveedores": lista,
        "ofac": entidades,
        "bancoMundial": bm,
    }
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")))

    por_tipo: dict[str, int] = {}
    for p in lista:
        for e in p["eventos"]:
            por_tipo[e["tipo"]] = por_tipo.get(e["tipo"], 0) + 1
    print(f"{len(filas)} filas de la DGCP sobre {len(rpes_tabla)} RPE (hasta {corte}); "
          f"{duplicadas} repetidas y {pruebas} de prueba fuera; {len(sin_cruce)} sin cruce.")
    print(f"Publicadas: {publicados} medidas sobre {juridicas} personas jurídicas y {len(fisicas)} "
          f"personas físicas ({eventos_fisicas} medidas, sin cédula); {anonimizados} motivos anonimizados.")
    for t in TIPOS:
        print(f"  {por_tipo.get(t, 0):5d}  {t}")
    print(f"OFAC ({fecha_sdn}): {entradas} entradas; {ligadas} ligadas al país; "
          f"{len(entidades)} entidades guardadas ({sum(1 for e in entidades if e['rnc'])} con RNC, "
          f"{sum(1 for e in entidades if e['rpes'])} inscritas como proveedoras); {individuos} personas omitidas.")
    print(f"Banco Mundial ({fecha_bm}): {len(filas_bm)} entradas; {sum(1 for e in bm if e['dominicana'])} firmas "
          f"ligadas al país y {sum(1 for e in bm if e['rpes'])} con el mismo nombre que un proveedor de la DGCP.")
    print(f"→ {SALIDA} ({SALIDA.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
