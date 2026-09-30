#!/usr/bin/env python3
"""Genera public/data/banca.json: el registro de las entidades financieras
reguladas del país, una ficha por entidad —bancos, asociaciones, financieras,
agentes de cambio, fiduciarias, burós de crédito, oficinas de representación,
AFP, aseguradoras y cooperativas de ahorro, crédito o servicios múltiples—,
con lo que publica de cada una quien la supervisa.

Regenerar cuando la Superintendencia de Bancos actualice sus fichas (lo hace
entidad por entidad, varias veces al mes):

    python3 scripts/build-banca.py            # en vivo, ~20 minutos
    python3 scripts/build-banca.py --cache D  # guarda/reusa las respuestas en D

Si la SB responde con su desafío, el script para sin escribir y **no se
insiste**: la instantánea anterior sigue en pie y la vía es pedirle a la SB que
admita este User-Agent (Ley 200-04). Con `--cache` una corrida de otro día solo
pide lo que faltó; nunca un bucle que reintente hasta que el desafío ceda.

Mecánica verificada el 2026-09-29 con este User-Agent (docs/AUDITORIA.md §5.6,
§5.7, §G.5 y §G.13; el reconocimiento de esta pasada va en el informe):

Superintendencia de Bancos (`sb.gob.do`, Umbraco tras Sucuri; robots solo veta
`/umbraco/`, que **nunca** se pide). A un segundo entre peticiones, Sucuri
respondió tras unas 70 con su desafío de JavaScript (HTTP 307 sin `Location`,
«You are being redirected…», `sucuri_cloudproxy_js`); cinco minutos después
dejó pasar dos y volvió a desafiar: no se resuelve ni se rodea. El script
espera diez segundos entre peticiones a la SB y, si aun así lo ve, para.
- `/supervisados/<categoría>/?page=1&size=100` es HTML servido entero: una
  tarjeta `entity_card` por entidad (nombre corto, tipo, total de activos
  «RD$ 1,473,424.85 Millones», participación, empleados, estatus, enlace a su
  ficha) y «Mostrando N entradas» abajo, que se coteja con las tarjetas. Las
  canceladas o en liquidación llevan un aviso en lugar de las cifras. Una
  respuesta tardó 16 s y el reconocimiento vio un corte a los 25: espera de 60 s
  y un reintento.
- Se leen las cinco categorías que usan la misma plantilla de listado y ficha:
  entidades de intermediación financiera (47), cambiarias (42), fiduciarias (5),
  sociedades de información crediticia (4) y oficinas de representación (5).
  «Otras entidades» (13) y las firmas de auditores (38) usan otra plantilla
  (`perfil/?id=`) y no son intermediarios: no entran. Los subagentes son 7,454
  comercios; solo se cuentan, de las etiquetas de su página.
- La ficha `/supervisados/<categoría>/<slug>/` trae «Datos actualizados al …»,
  activos, calificación de riesgo con su calificadora y fecha, participación,
  empleados, oficinas, cajeros, subagentes, **el número** de accionistas (sus
  nombres no se publican), y en «Información general» el registro de la SB, la
  razón social, el «RNC o cédula» con guiones (se guarda solo si son nueve
  cifras: un RNC; una cédula no se guarda), los servicios autorizados y la
  página web. Las pestañas traen el consejo, los principales funcionarios
  (nombre y cargo, tal como los publica la SB), y los estados financieros y
  memorias anuales en PDF con rutas `/media/{hash}/` imprevisibles: se enlazan,
  no se leen. Teléfonos, correos y direcciones **no se guardan**.
- `/media/4g4nrdxa/listado-de-entidades-autorizadas-a-operar-2018-2026.csv`
  (enlazado desde datos.gob.do): `ENTIDAD,TIPO DE ENTIDAD,MES,AÑO`, 11,183 filas
  de enero de 2018 a junio de 2026, sin RNC, con los nombres escritos de tres
  maneras según la época y cortados a 60 caracteres. Solo se usa para decir
  desde qué mes figura una entidad, cuando su razón social casa exacta
  (normalizada) con una sola clave. No sirve para saber quién salió: los
  cambios de nombre parecen salidas, y las fiduciarias dejan de figurar después
  de abril de 2026 aunque sigan operando.

SIPEN (`sipen.gob.do`, robots `Disallow:` vacío): la página de AFP es HTML con
una tarjeta por administradora (razón social, web, fecha de registro y número
de resolución de la SIPEN). No trae RNC.

Superintendencia de Seguros (`sis.gob.do`, WordPress; robots abierto salvo
`/wp-admin/`; `superseguros.gob.do` redirige aquí): una tabla de texto libre con
nombre, dirección, teléfonos, correo y a veces la web de 35 compañías. Se lee
**solo** el nombre en negrita, las siglas o el nombre anterior entre paréntesis
y la web. No trae RNC ni separa aseguradoras de reaseguradoras.

IDECOOP (`idecoop.gob.do`, WordPress; robots abierto salvo `/wp-admin/`): la
página de cooperativas incorporadas enlaza un XLSX de 2,304 filas (julio 1953 a
junio 2024, congelado desde entonces), hoja `Coop_Incorporadas_1953_2024`.
Se leen nombre, siglas, tipología (43 grafías), número y fecha del decreto que
la incorporó, año, centro regional y provincia; la dirección no se lee. Solo
entran las que su tipología dice de **ahorro** o de **crédito**, o solo de
**servicios múltiples** (así está COOPNAMA, la de los maestros); las
agropecuarias, de producción, de transporte y demás, no. El XLSX se lee con
`zipfile` de la biblioteca estándar, como `scripts/build-justicia.py`, para
no depender de `openpyxl`.

Bloqueados y no tocados: la Superintendencia del Mercado de Valores (desafío de
Cloudflare hasta en su robots), el registro de intermediarios de seguros
(`ofv.superseguros.gob.do`, 403 de Cloudflare) y SIMBAD (`simbad.sb.gob.do`,
hallazgo de seguridad pendiente: solo lo lee `lib/banca.ts`).

Contrato: GET solamente, User-Agent identificable, robots leído primero en
cada host, al menos un segundo entre peticiones al mismo host (diez con la
SB), un reintento, `content-type` validado. Un 403/429/470 o un desafío no se
reintenta ni se rodea: el script para y lo dice. **No escribe nada** si el
resultado es inverosímil: menos de 40 entidades de intermediación, una en operación sin RNC
o sin activos, participaciones que no suman cerca de 100 %, menos de 5 AFP,
menos de 25 aseguradoras, menos de 2,000 cooperativas incorporadas o menos de
900 de ellas financieras, o un teléfono o un correo en la salida.
Peticiones por corrida: SB unas 110 (robots, 6 listados, ~102 fichas, el CSV);
SIPEN 2; Seguros 2; IDECOOP 3.
"""
import csv
import datetime
import hashlib
import html as htmlmod
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
import zipfile

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "data" / "banca.json"
UA = "Socratico-Inteligencia/1.0 (registro de entidades financieras; herramienta independiente)"
PAUSA = 1.0
# La SB va tras Sucuri: a un segundo entre peticiones respondió con su desafío
# de JavaScript después de unas 70 (2026-09-29), y al volver a los cinco minutos
# dejó pasar dos antes de desafiar otra vez. Diez segundos con ella: la corrida
# entera, ~20 minutos.
PAUSA_HOST = {"sb.gob.do": 10.0}
ESPERA = 60

SB = "https://sb.gob.do"
SB_SUPERVISADOS = f"{SB}/supervisados"
SB_CSV = f"{SB}/media/4g4nrdxa/listado-de-entidades-autorizadas-a-operar-2018-2026.csv"
SB_SUBAGENTES = f"{SB_SUPERVISADOS}/subagentes/"

SIPEN = "https://sipen.gob.do"
SIPEN_AFP = f"{SIPEN}/institucional-normativas/administradora-de-fondos-de-pensiones"

SIS = "https://sis.gob.do"
SIS_CIAS = f"{SIS}/companias-aseguradoras-y-reaseguradoras/"

IDECOOP = "https://idecoop.gob.do"
IDECOOP_PAGINA = f"{IDECOOP}/servicios/cooperativas-incorporadas/"
IDECOOP_XLSX = (f"{IDECOOP}/wp-content/uploads/2024/07/"
                "Cooperativas-Incorporadas-por-Centros-Regionales-Julio-1953-Junio-2024.-IDECOOP-Excel.xlsx")

HTML = ("text/html",)
XLSX = ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",)

# Las categorías de la SB que comparten plantilla de listado y ficha, con la
# traducción de su «tipo» al sector cerrado de la plataforma (lib/financieras.ts).
# La clave del tipo va sin tildes y en minúsculas.
CATEGORIAS_SB = [
    ("entidades-de-intermediacion-financiera", {
        "banco multiple": "banco-multiple",
        "banco de ahorro y credito": "ahorro-credito",
        "corporacion de credito": "corporacion-credito",
        "asociacion de ahorros y prestamos": "asociacion",
        "entidad publica": "entidad-publica",
    }),
    ("entidades-de-intermediacion-cambiaria", {
        "agente de cambio": "cambiaria",
        "agente de remesas y cambio": "cambiaria",
    }),
    ("fiduciarias", {
        "sociedades fiduciarias": "fiduciaria",
        "eif con servicios fiduciarios": "fiduciaria",
    }),
    ("sociedades-de-informacion-crediticia", {
        "sociedad de informacion crediticia": "informacion-crediticia",
    }),
    ("oficinas-de-representacion", {
        "oficina de representacion": "oficina-representacion",
    }),
]

SECTORES_EIF = {"banco-multiple", "ahorro-credito", "corporacion-credito", "asociacion", "entidad-publica"}

MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}

CACHE: pathlib.Path | None = None
PETICIONES: dict[str, int] = {}
_ultima: dict[str, float] = {}


class Bloqueado(RuntimeError):
    """El origen respondió con un bloqueo (403/429/470/desafío): no se rodea."""


# ── Red ──────────────────────────────────────────────────────────────────────

def get(url: str, tipos: tuple[str, ...]) -> tuple[bytes, dict[str, str]]:
    """GET con pausa por host, un reintento y `content-type` validado."""
    host = urllib.parse.urlsplit(url).hostname or ""
    clave = hashlib.sha1(url.encode()).hexdigest()[:16]
    if CACHE is not None:
        b, h = CACHE / f"{clave}.b", CACHE / f"{clave}.h"
        if b.exists() and h.exists():
            cab = json.loads(h.read_text())
            if not any(t in cab.get("content-type", "") for t in tipos):
                raise RuntimeError(f"{url}: content-type inesperado {cab.get('content-type')!r} (caché)")
            return b.read_bytes(), cab
    ultimo: Exception | None = None
    for _ in (1, 2):
        espera = PAUSA_HOST.get(host, PAUSA) - (time.monotonic() - _ultima.get(host, 0.0))
        if espera > 0:
            time.sleep(espera)
        _ultima[host] = time.monotonic()
        PETICIONES[host] = PETICIONES.get(host, 0) + 1
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=ESPERA) as r:
                cab = {k.lower(): v for k, v in r.headers.items()}
                cuerpo = r.read()
            _ultima[host] = time.monotonic()
            tipo = cab.get("content-type", "")
            if re.search(rb"cf-challenge|Just a moment\.\.\.|Attention Required|captcha|sucuri_cloudproxy_js|"
                         rb"You are being redirected", cuerpo[:6000], re.I):
                raise Bloqueado(f"{url}: la respuesta es un desafío")
            if not any(t in tipo for t in tipos):
                raise RuntimeError(f"content-type inesperado {tipo!r}")
            if CACHE is not None:
                CACHE.mkdir(parents=True, exist_ok=True)
                (CACHE / f"{clave}.b").write_bytes(cuerpo)
                (CACHE / f"{clave}.h").write_text(json.dumps(cab))
            return cuerpo, cab
        except urllib.error.HTTPError as err:
            if err.code in (401, 403, 429, 470):
                raise Bloqueado(f"{url}: HTTP {err.code}") from err
            # El desafío de Sucuri es un 307 sin `Location` con un script que fija
            # una cookie y recarga («You are being redirected…»): no se resuelve.
            if err.code in (307, 308) and not err.headers.get("Location"):
                raise Bloqueado(f"{url}: HTTP {err.code} sin Location (desafío de Sucuri)") from err
            ultimo = err
        except Bloqueado:
            raise
        except Exception as err:  # noqa: BLE001 — un reintento y se informa
            ultimo = err
    raise RuntimeError(f"{url}: {ultimo}")


def texto_de(url: str, tipos: tuple[str, ...] = HTML) -> str:
    cuerpo, _ = get(url, tipos)
    return cuerpo.decode("utf-8", "replace")


def robots_permite(origen: str, rutas: list[str]) -> None:
    """Lee robots.txt (grupo `*`) y aborta si veta alguna de las rutas que se usan."""
    texto = texto_de(f"{origen}/robots.txt", ("text/plain",))
    vetos: list[str] = []
    aplica = False
    for linea in texto.splitlines():
        linea = linea.split("#", 1)[0].strip()
        if not linea:
            continue
        k, _, v = linea.partition(":")
        k, v = k.strip().lower(), v.strip()
        if k == "user-agent":
            aplica = v == "*" or "socratico" in v.lower()
        elif k == "disallow" and aplica and v:
            vetos.append(v)
    for ruta in rutas:
        for veto in vetos:
            if ruta.startswith(veto):
                raise Bloqueado(f"{origen}/robots.txt veta {veto} (se pedía {ruta})")


# ── Texto ────────────────────────────────────────────────────────────────────

def limpio(s: str | None) -> str:
    return re.sub(r"\s+", " ", htmlmod.unescape(re.sub(r"<[^>]+>", " ", s or "")).replace("\xa0", " ")).strip()


def sin_tildes(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def slug(s: str, largo: int = 70) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", sin_tildes(htmlmod.unescape(s)).lower()).strip("-")
    if len(base) > largo:
        base = base[:largo].rsplit("-", 1)[0]
    return base


def fecha_es(s: str | None) -> str | None:
    """«01 septiembre 2026», «3 de enero del 2003», «17 / 10 / 2013» → ISO."""
    if not s:
        return None
    t = limpio(s).lower()
    m = re.search(r"(\d{1,2})\s+(?:de\s+)?([a-zé]+)\s+(?:de[l]?\s+)?(\d{4})", t)
    try:
        if m and m.group(2) in MESES:
            return datetime.date(int(m.group(3)), MESES[m.group(2)], int(m.group(1))).isoformat()
        m = re.search(r"(\d{1,2})\s*/\s*(\d{1,2})\s*/\s*(\d{4})", t)
        if m:
            return datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1))).isoformat()
    except ValueError:
        return None
    return None


def millones(s: str | None) -> float | None:
    """«RD$ 1,473,424.85 Millones» → 1473424.85. Otra forma (un aviso) → None."""
    m = re.fullmatch(r"RD\$\s*([\d,]+(?:\.\d+)?)\s*Millones", limpio(s), re.I)
    return float(m.group(1).replace(",", "")) if m else None


def porcentaje(s: str | None) -> float | None:
    m = re.fullmatch(r"([\d.]+)\s*%", limpio(s))
    return float(m.group(1)) if m else None


def entero(s: str | None) -> int | None:
    t = limpio(s).replace(",", "")
    return int(t) if re.fullmatch(r"\d{1,9}", t) else None


def rnc9(s: str | None) -> str | None:
    """El RNC de nueve cifras; una cédula (11) no se guarda."""
    d = re.sub(r"\D", "", s or "")
    return d if len(d) == 9 else None


def web(url: str | None) -> str | None:
    if not url:
        return None
    u = htmlmod.unescape(url).strip()
    return u if re.match(r"https?://[^\s/]+\.[a-z]{2,}", u, re.I) else None


def absoluta(url: str) -> str:
    """Una ruta de la SB absoluta y en ASCII: `/media/{hash}/créditos…` y el slug
    `d-encarnación-santana-s-a` traen la tilde tal cual, y `urllib` no pide eso."""
    u = urllib.parse.urljoin(SB, htmlmod.unescape(url).strip())
    partes = urllib.parse.urlsplit(u)
    return urllib.parse.urlunsplit(partes._replace(path=urllib.parse.quote(partes.path, safe="/-_.~%")))


def comillas(s: str) -> str:
    """Las comillas del nombre, en las de la casa: “X”, "X" o 'X" → «X»."""
    return re.sub(r"[“\"'‘]\s*([^“”\"'‘’]+?)\s*[”\"'’]", r"«\1»", s)


# ── Superintendencia de Bancos: listados ─────────────────────────────────────

def sin_svg(s: str) -> str:
    return re.sub(r"<svg.*?</svg>", "", s, flags=re.S)


def valor_tras(etiqueta: str, trozo: str) -> str | None:
    """El primer `<span>` con texto que sigue a `<label>etiqueta</label>`."""
    m = re.search(r"<label[^>]*>\s*" + etiqueta + r"\s*</label>(.{0,900}?)<span[^>]*>([^<]+)</span>", trozo, re.S | re.I)
    return limpio(m.group(2)) if m else None


def tarjetas(pagina: str, categoria: str) -> tuple[list[dict], int | None]:
    total = re.search(r"Mostrando\s+(\d+)\s+entradas", pagina)
    salida = []
    for c in sin_svg(pagina).split('<div class="entity_card')[1:]:
        c = c.split('<div class="pagination_container')[0]
        nombre = re.search(r'class="name_container"[^>]*>\s*<span>(.*?)</span>', c, re.S)
        if not nombre:
            nombre = re.search(r"<a[^>]*>\s*<span>(.*?)</span>", c, re.S)
        href = re.search(r'class="name_container" href="([^"]+)"', c)
        if not href:
            href = re.search(r'class="six" href="([^"]+)"', c)
        ficha = None
        if href and href.group(1).startswith(f"/supervisados/{categoria}/"):
            ficha = absoluta(href.group(1))
        tipo = re.search(r'entity_type_container">(.*?)</label>', c, re.S)
        aviso = re.search(r'description_info[^"]*">.*?<label>\s*(.*?)</label>', c, re.S)
        salida.append({
            "nombre": limpio(nombre.group(1)) if nombre else None,
            "tipo": limpio(tipo.group(1)) if tipo else None,
            "ficha": ficha,
            "activos": millones(valor_tras("Total de activos", c)),
            "activosAdministrados": millones(valor_tras("Total de activos administrados", c)),
            "participacion": porcentaje(valor_tras("Participaci[oó]n de mercado", c)),
            "empleados": entero(valor_tras("(?:Cantidad de empleados|Empleados)", c)),
            "fideicomisos": entero(valor_tras("Fideicomisos", c)),
            "estatus": valor_tras("Estatus", c),
            "aviso": limpio(re.split(r'<div class="closing_statement', aviso.group(1))[0]) if aviso else None,
        })
    return salida, int(total.group(1)) if total else None


# ── Superintendencia de Bancos: ficha ────────────────────────────────────────

TABS = {
    "consejo": "consejo",
    "funcionarios": "funcionarios",
    "estados financieros": "estadosFinancieros",
    "memorias": "memorias",
    "accionistas": "accionistasLista",
}


def documentos(trozo: str) -> list[dict]:
    salida = []
    for href, titulo in re.findall(r'<a href="([^"]+)"[^>]*>(.*?)</a>', trozo, re.S):
        if "/media/" not in href:
            continue
        t = re.sub(r"\.pdf$", "", limpio(titulo), flags=re.I).strip()
        anios = re.findall(r"(?:19|20)\d{2}", t) or re.findall(r"(?:19|20)\d{2}", href)
        salida.append({"titulo": t, "anio": int(anios[-1]) if anios else None, "fecha": fecha_es(t),
                       "url": absoluta(href)})
    # Del más reciente al más antiguo: por la fecha de corte que dice el título
    # («30 de junio 2026») y, si no la dice, por el año.
    salida.sort(key=lambda d: (d["fecha"] or f"{d['anio'] or 0:04d}", d["titulo"]), reverse=True)
    return salida


def personas(trozo: str) -> list[dict]:
    salida = []
    for caja in re.findall(r'title_sub_title_box">(.*?)</div>', trozo, re.S):
        n = re.search(r"<label>(.*?)</label>", caja, re.S)
        c = re.search(r"<span[^>]*>(.*?)</span>", caja, re.S)
        nombre = limpio(n.group(1)) if n else ""
        if nombre:
            salida.append({"nombre": nombre, "cargo": limpio(c.group(1)) if c else ""})
    return salida


def ficha_sb(url: str) -> dict:
    pagina = texto_de(url)
    i, j = pagina.find("<!-- Content -->"), pagina.find("<!-- Footer -->")
    c = sin_svg(pagina[i:j] if i >= 0 and j > i else pagina)
    d: dict = {}
    cab = re.search(r'entity_info_container">(.*?)</div>\s*</div>', c, re.S)
    if cab:
        nombre = re.search(r"<label>(.*?)</label>", cab.group(1), re.S)
        d["nombre"] = limpio(nombre.group(1)) if nombre else None
        tipo = re.search(r'class="entity_type">(.*?)</label>', cab.group(1), re.S)
        d["tipo"] = limpio(tipo.group(1)) if tipo else None
        est = re.search(r'class="value_entity">(.*?)</label>', cab.group(1), re.S)
        d["estatus"] = limpio(est.group(1)) if est else None
        corte = re.search(r'class="update_date">(.*?)</label>', cab.group(1), re.S)
        d["corte"] = fecha_es(corte.group(1)) if corte else None
    d["activos"] = millones(valor_tras("Total de activos", c))
    d["activosAdministrados"] = millones(valor_tras("Total de activos administrados", c))
    d["participacion"] = porcentaje(valor_tras("Participaci[oó]n de mercado", c))
    d["empleados"] = entero(valor_tras("(?:Cantidad de empleados|Empleados)", c))
    d["fideicomisos"] = entero(valor_tras("Fideicomisos", c))
    cal = re.search(r"Calificaci[oó]n</label>.{0,300}?<span>([^<]+)</span>", c, re.S)
    d["calificacion"] = limpio(cal.group(1)) if cal else None
    d["calificadora"] = valor_tras("Calificadora", c)
    d["fechaCalificacion"] = fecha_es(valor_tras("Fecha de calificaci[oó]n", c))
    for cifra, etiqueta in re.findall(r'title_value_container">\s*<span>([^<]*)</span>\s*<label>([^<]*)</label>', c):
        k = sin_tildes(limpio(etiqueta)).lower()
        clave = {"oficinas": "oficinas", "cajeros automaticos": "cajeros", "subagentes": "subagentes",
                 "accionistas": "accionistas"}.get(k)
        if clave:
            d[clave] = entero(cifra)
        else:
            print(f"   cifra desconocida en {url}: {etiqueta!r}", file=sys.stderr)
    info = re.search(r'general_info_box">(.*?)<div class="employee_finantial|general_info_box">(.*)', c, re.S)
    servicios: list[str] = []
    if info:
        cuerpo = info.group(1) or info.group(2) or ""
        for bloque in re.split(r'<div class="info_title_value_container">', cuerpo)[1:]:
            lab = re.search(r"<label[^>]*>(.*?)</label>", bloque, re.S)
            if not lab:
                continue
            k = sin_tildes(limpio(lab.group(1))).lower()
            resto = bloque[lab.end():]
            valor = limpio(re.split(r"<label", resto)[0])
            if k == "registro":
                d["registroSb"] = valor if re.search(r"\d", valor) else None
            elif k == "razon social":
                d["razonSocial"] = valor
            elif k.startswith("rnc"):
                d["rnc"] = rnc9(valor)
            elif "servicios autorizados" in k and valor:
                servicios.append(valor)
            elif k == "fecha de registro":
                d["fechaRegistro"] = fecha_es(valor)
            elif k == "pagina web":
                a = re.search(r'href="([^"]+)"', resto)
                d["web"] = web(a.group(1)) if a else None
            # Oficina principal, teléfonos, correo, redes: no se guardan.
    d["servicios"] = servicios
    for clase, etiqueta in re.findall(r'<a class="([a-z_]+) badge_card_option".*?<span class="label">(.*?)</span>', c, re.S):
        k = sin_tildes(limpio(etiqueta)).lower()
        campo = next((v for t, v in TABS.items() if t in k), None)
        m = re.search(rf'<div class="{clase} cards_container[^"]*">(.*?)'
                      r'(?=<div class="[a-z_]+_tile_cards_container cards_container|<div class="modal_container|$)', c, re.S)
        if not campo or not m:
            print(f"   pestaña desconocida en {url}: {etiqueta!r}", file=sys.stderr)
            continue
        d[campo] = documentos(m.group(1)) if campo in ("estadosFinancieros", "memorias") else personas(m.group(1))
    aviso = re.search(r'description_info[^"]*">.*?<label>\s*(.*?)</label>', c, re.S)
    if aviso:
        d["aviso"] = limpio(re.split(r'<div class="closing_statement', aviso.group(1))[0])
    return d


def calificacion(v: str | None) -> str | None:
    """«N/A» o vacío no dicen nada; «No tiene» sí (la SB lo afirma) y se conserva."""
    return None if not v or sin_tildes(v).lower() in ("n/a", "na", "-", "no aplica") else v


def tiene_calificacion(v: str | None) -> bool:
    return bool(calificacion(v)) and sin_tildes(v or "").lower() != "no tiene"


def superintendencia_bancos() -> tuple[list[dict], dict]:
    robots_permite(SB, ["/supervisados/", "/media/"])
    entidades: list[dict] = []
    for categoria, tipos in CATEGORIAS_SB:
        listado = f"{SB_SUPERVISADOS}/{categoria}/?page=1&size=100"
        cards, total = tarjetas(texto_de(listado), categoria)
        if total is not None and total != len(cards):
            raise RuntimeError(f"{categoria}: la página dice {total} y trae {len(cards)} tarjetas")
        print(f"SB {categoria}: {len(cards)} entidades", file=sys.stderr)
        for card in cards:
            tipo = sin_tildes(card["tipo"] or "").lower().strip()
            sector = tipos.get(tipo) or (next(iter(tipos.values())) if len(set(tipos.values())) == 1 else None)
            if not sector:
                raise RuntimeError(f"{categoria}: tipo desconocido {card['tipo']!r} ({card['nombre']})")
            f = ficha_sb(card["ficha"]) if card["ficha"] else {}
            nombre = f.get("nombre") or card["nombre"]
            base = card["ficha"].rstrip("/").rsplit("/", 1)[-1] if card["ficha"] else nombre
            entidades.append({
                "slug": slug(urllib.parse.unquote(base)),
                "nombre": nombre,
                "razonSocial": f.get("razonSocial"),
                "rnc": f.get("rnc"),
                "registroSb": f.get("registroSb"),
                "sector": sector,
                "tipo": f.get("tipo") or card["tipo"],
                "supervisor": "sb",
                "estatus": f.get("estatus") or card["estatus"],
                "aviso": f.get("aviso") or card["aviso"],
                "activosMillones": f.get("activos") if f.get("activos") is not None else card["activos"],
                "activosAdministradosMillones": f.get("activosAdministrados") or card["activosAdministrados"],
                "fideicomisos": f.get("fideicomisos") or card["fideicomisos"],
                "participacion": f.get("participacion") if f.get("participacion") is not None else card["participacion"],
                "empleados": f.get("empleados") if f.get("empleados") is not None else card["empleados"],
                "oficinas": f.get("oficinas"),
                "cajeros": f.get("cajeros"),
                "subagentes": f.get("subagentes"),
                "accionistas": f.get("accionistas"),
                "calificacion": calificacion(f.get("calificacion")),
                "calificadora": calificacion(f.get("calificadora")) if tiene_calificacion(f.get("calificacion")) else None,
                "fechaCalificacion": f.get("fechaCalificacion") if tiene_calificacion(f.get("calificacion")) else None,
                "servicios": f.get("servicios"),
                "consejo": f.get("consejo"),
                "funcionarios": f.get("funcionarios"),
                "accionistasLista": f.get("accionistasLista"),
                "web": f.get("web"),
                "estadosFinancieros": f.get("estadosFinancieros"),
                "memorias": f.get("memorias"),
                "fechaRegistro": f.get("fechaRegistro"),
                "fuente": card["ficha"] or listado,
                "corte": f.get("corte"),
            })
    subagentes = subagentes_sb()
    return entidades, {"subagentes": subagentes}


def subagentes_sb() -> dict | None:
    """Cuántos subagentes lista la SB, de las etiquetas de su página. No se listan."""
    try:
        pagina = texto_de(SB_SUBAGENTES)
    except Bloqueado:
        raise
    except Exception as err:  # noqa: BLE001 — es un recuento de contexto
        print(f"subagentes no leídos: {err}", file=sys.stderr)
        return None
    cuentas = {}
    for etiqueta, n in re.findall(r'<span class="label">(.*?)</span>\s*<span class="divider"></span>\s*'
                                  r'<span class="elements">([\d,]+)</span>', pagina, re.S):
        cuentas[sin_tildes(limpio(etiqueta)).lower()] = int(n.replace(",", ""))
    if "todos" not in cuentas:
        return None
    return {"total": cuentas["todos"], "bancarios": cuentas.get("subagente bancario"),
            "cambiarios": cuentas.get("subagente cambiario"), "fuente": SB_SUBAGENTES}


# ── Registro mensual de la SB (CSV) ──────────────────────────────────────────

def clave_razon(s: str) -> str:
    t = sin_tildes(s).upper().replace("&", " Y ")
    t = re.sub(r"\bDBA\b.*$", " ", t)
    t = re.sub(r"[^A-Z0-9]+", " ", t)
    t = re.sub(r"\b(S A|C POR A|N A|S R L|SRL|SAS|INC|SA)\b", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def registro_mensual() -> tuple[dict[str, str], dict]:
    cuerpo, _ = get(SB_CSV, ("text/csv", "application/csv", "text/plain", "application/octet-stream"))
    filas = list(csv.reader(io.StringIO(cuerpo.decode("utf-8-sig", "replace"))))
    cab = [sin_tildes(c).upper().strip() for c in filas[0]] if filas else []
    if cab[:4] != ["ENTIDAD", "TIPO DE ENTIDAD", "MES", "ANO"]:
        raise RuntimeError(f"el CSV del registro cambió de forma: {filas[0] if filas else None}")
    primero: dict[str, tuple[int, int]] = {}
    meses = set()
    for f in filas[1:]:
        if len(f) < 4 or not f[3].strip().isdigit():
            continue
        mes = MESES.get(sin_tildes(f[2]).strip().lower())
        if not mes:
            continue
        cuando = (int(f[3]), mes)
        meses.add(cuando)
        k = clave_razon(f[0])
        if k and (k not in primero or cuando < primero[k]):
            primero[k] = cuando
    if len(meses) < 60 or len(primero) < 80:
        raise RuntimeError(f"el CSV del registro trae {len(meses)} meses y {len(primero)} nombres: no es el de siempre")
    desde, hasta = min(meses), max(meses)
    return ({k: f"{a:04d}-{m:02d}" for k, (a, m) in primero.items()},
            {"desde": f"{desde[0]:04d}-{desde[1]:02d}", "hasta": f"{hasta[0]:04d}-{hasta[1]:02d}", "fuente": SB_CSV})


# ── SIPEN: AFP ───────────────────────────────────────────────────────────────

def sipen() -> list[dict]:
    robots_permite(SIPEN, ["/institucional-normativas/"])
    pagina = texto_de(SIPEN_AFP)
    salida = []
    for art in re.findall(r"<article[^>]*>(.*?)</article>", pagina, re.S):
        titulo = re.search(r"<h2[^>]*>(.*?)</h2>", art, re.S)
        if not titulo:
            continue
        razon = limpio(titulo.group(1))
        if "pensiones" not in razon.lower():
            continue
        enlace = re.search(r'<a href="(https?://[^"]+)"', art)
        fecha = re.search(r"Fecha de registro:\s*</strong>\s*<br>\s*<span[^>]*>(.*?)</span>", art, re.S)
        resol = re.search(r"Resoluci[oó]n:\s*</strong>\s*<br>\s*<span[^>]*>(.*?)</span>", art, re.S)
        corto = re.sub(r"^Administradora de Fondos de Pensiones\s+", "", razon, flags=re.I)
        corto = re.sub(r",?\s*S\.?\s*A\.?$", "", corto).strip()
        salida.append({
            "slug": f"afp-{slug(corto)}",
            "nombre": f"AFP {corto}",
            "razonSocial": razon,
            "sector": "afp",
            "tipo": "Administradora de fondos de pensiones",
            "supervisor": "sipen",
            "fechaRegistro": fecha_es(fecha.group(1)) if fecha else None,
            "resolucion": limpio(resol.group(1)) if resol else None,
            "web": web(enlace.group(1)) if enlace else None,
            "fuente": SIPEN_AFP,
        })
    return salida


# ── Superintendencia de Seguros ──────────────────────────────────────────────

def nombre_aseguradora(razon: str) -> str:
    n = re.sub(r"\s*\([A-ZÁÉÍÓÚÑ]{3,}\)\s*$", "", razon)
    n = re.sub(r",?\s*\b(S\.?\s?A\.?|INC\.?)(?=[\s,]|$)", "", n, flags=re.I)
    n = re.sub(r"(\w)-\s+(\w)", r"\1 \2", n)
    n = re.sub(r"\s*,\s*,", ",", n)
    return re.sub(r"\s+", " ", n).strip(" ,")


def seguros() -> list[dict]:
    robots_permite(SIS, ["/companias-aseguradoras-y-reaseguradoras/"])
    pagina = texto_de(SIS_CIAS)
    i = pagina.find('class="custom-content"')
    cuerpo = pagina[i:] if i >= 0 else pagina
    cuerpo = cuerpo[: cuerpo.find("</table>")] if "</table>" in cuerpo else cuerpo
    salida = []
    for celda in re.findall(r"<td[^>]*>(.*?)</td>", cuerpo, re.S):
        fuertes = [limpio(s) for s in re.findall(r"<strong>(.*?)</strong>", celda, re.S)]
        fuertes = [s for s in fuertes if s]
        if not fuertes:
            continue
        razon = fuertes[0]
        siglas = None
        m = re.search(r"\(([A-ZÁÉÍÓÚÑ]{3,})\)", " ".join(fuertes))
        if m:
            siglas = m.group(1)
        lineas = [limpio(s) for s in re.split(r"<br\s*/?>", celda)]
        antes = next((re.sub(r"^\(?\s*antigu[oa]\s+|\)$", "", l, flags=re.I).strip() for l in lineas
                      if re.match(r"\(?\s*antigu[oa]\s", l, re.I)), None)
        webs = [h for h in re.findall(r'href="(https?://[^"]+)"', celda)
                if "cdn-cgi" not in h and "email-protection" not in h]
        nombre = nombre_aseguradora(razon)
        salida.append({
            "slug": slug(nombre),
            "nombre": nombre,
            "razonSocial": razon,
            "siglas": siglas,
            "antes": antes,
            "sector": "aseguradora",
            "tipo": "Compañía de seguros o reaseguros",
            "supervisor": "sis",
            "web": web(webs[0]) if webs else None,
            "fuente": SIS_CIAS,
        })
    return salida


# ── IDECOOP: cooperativas ────────────────────────────────────────────────────

def hoja_xlsx(datos: bytes) -> dict[int, dict[str, str]]:
    """Filas de la hoja de cooperativas (o la primera): {fila: {columna: valor}}."""
    z = zipfile.ZipFile(io.BytesIO(datos))
    try:
        shared = z.read("xl/sharedStrings.xml").decode("utf-8", "replace")
        strs = [htmlmod.unescape("".join(re.findall(r"<t[^>]*>(.*?)</t>", si, re.S)))
                for si in re.findall(r"<si>(.*?)</si>", shared, re.S)]
    except KeyError:
        strs = []
    wb = z.read("xl/workbook.xml").decode("utf-8", "replace")
    rels = z.read("xl/_rels/workbook.xml.rels").decode("utf-8", "replace")
    hojas = re.findall(r'<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"', wb)
    _, rid = next(((n, r) for n, r in hojas if re.search(r"coop", n, re.I)), hojas[0])
    destino = re.search(rf'Id="{re.escape(rid)}"[^>]*Target="([^"]+)"', rels) \
        or re.search(rf'Target="([^"]+)"[^>]*Id="{re.escape(rid)}"', rels)
    ruta = "xl/" + destino.group(1).lstrip("/").removeprefix("xl/")
    sxml = z.read(ruta).decode("utf-8", "replace")
    filas: dict[int, dict[str, str]] = {}
    for c in re.finditer(r'<c r="([A-Z]+)(\d+)"([^>]*?)(?:/>|>(.*?)</c>)', sxml, re.S):
        col, fila, attrs, inner = c.group(1), int(c.group(2)), c.group(3), c.group(4) or ""
        v = re.search(r"<v>(.*?)</v>", inner, re.S)
        if v:
            val = v.group(1)
            if 't="s"' in attrs:
                val = strs[int(val)] if int(val) < len(strs) else ""
            else:
                val = htmlmod.unescape(val)
        else:
            t = re.search(r"<t[^>]*>(.*?)</t>", inner, re.S)
            if not t:
                continue
            val = htmlmod.unescape(t.group(1))
        filas.setdefault(fila, {})[col] = val.strip()
    return filas


def fecha_decreto(v: str, anio: int | None) -> str | None:
    """Serial de Excel («45390»), «23/3/2023» o nada; solo si casa con el año del decreto."""
    v = (v or "").strip()
    fecha = None
    try:
        if re.fullmatch(r"\d{4,5}(\.0+)?", v):
            fecha = datetime.date(1899, 12, 30) + datetime.timedelta(days=int(float(v)))
        else:
            m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", v)
            if m:
                fecha = datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    except (ValueError, OverflowError):
        return None
    if not fecha or (anio and fecha.year != anio):
        return None
    return fecha.isoformat()


def es_financiera(tipologia: str) -> bool:
    """De ahorro o de crédito, o solo «de servicios múltiples»: COOPNAMA, la de los
    maestros, está clasificada así y presta y capta como las de ahorro y crédito.
    «Agropecuaria y servicios múltiples» o «de producción y trabajo» no entran."""
    t = re.sub(r"\s+", " ", sin_tildes(tipologia).lower()).strip(" .")
    return bool(re.search(r"ahorr|credit", t)) or t == "servicios multiples"


def numero_decreto(v: str) -> str | None:
    t = re.sub(r"\.0+$", "", (v or "").strip())
    partes = [p.strip() for p in re.split(r"[\n,]+", t) if p.strip()]
    return " y ".join(partes) if partes else None


def idecoop() -> tuple[list[dict], dict]:
    robots_permite(IDECOOP, ["/servicios/cooperativas-incorporadas/", "/wp-content/uploads/"])
    pagina = texto_de(IDECOOP_PAGINA)
    enlaces = sorted(set(re.findall(r'https://idecoop\.gob\.do/wp-content/uploads/[^"\s]+?\.xlsx', pagina)))
    completo = [u for u in enlaces if "1953" in u]
    url = completo[-1] if completo else IDECOOP_XLSX
    cuerpo, cab = get(url, XLSX)
    filas = hoja_xlsx(cuerpo)
    cabecera = filas.get(min(filas)) if filas else {}
    columnas = {sin_tildes(v).lower().strip(): k for k, v in (cabecera or {}).items()}

    def col(*nombres: str) -> str:
        for n in nombres:
            for k, letra in columnas.items():
                if k.startswith(n):
                    return letra
        raise RuntimeError(f"el XLSX del IDECOOP no trae la columna {nombres[0]!r}: {list(columnas)}")

    c_nombre, c_sigla, c_tipo = col("cooperativa"), col("sigla"), col("tipologia")
    c_num, c_fecha, c_anio = col("numero del decreto"), col("fecha decreto"), col("ano decreto")
    c_centro, c_prov = col("centro regional"), col("provincia")
    # La dirección (col «direccion») no se lee.

    total = 0
    salida = []
    for n in sorted(filas):
        if n == min(filas):
            continue
        f = filas[n]
        nombre = re.sub(r"\s+", " ", f.get(c_nombre, "")).strip()
        if not nombre:
            continue
        total += 1
        tipologia = re.sub(r"\s+", " ", f.get(c_tipo, "")).strip()
        if not es_financiera(tipologia):
            continue
        anio = int(float(f[c_anio])) if re.fullmatch(r"\d{4}(\.0+)?", f.get(c_anio, "")) else None
        sigla = re.sub(r"\s+", " ", f.get(c_sigla, "")).strip()
        if sin_tildes(sigla).lower() in ("", "n/d", "nd", "n/a", "na", "-"):
            sigla = ""
        salida.append({
            "nombre": comillas(nombre),
            "siglas": sigla or None,
            "sector": "cooperativa",
            "tipo": "Cooperativa",
            "tipologia": tipologia,
            "supervisor": "idecoop",
            "decreto": numero_decreto(f.get(c_num, "")),
            "fechaDecreto": fecha_decreto(f.get(c_fecha, ""), anio),
            "anioDecreto": anio,
            "centroRegional": re.sub(r"\s+", " ", f.get(c_centro, "")).strip() or None,
            "provincia": re.sub(r"\s+", " ", f.get(c_prov, "")).strip() or None,
            "fuente": IDECOOP_PAGINA,
        })
    # El corte sale del nombre del archivo: «…-Julio-1953-Junio-2024…» → 2024-06.
    m = re.findall(r"-([A-Za-z]+)-(\d{4})", url)
    corte = None
    if m:
        mes, anio = m[-1]
        if mes.lower() in MESES:
            corte = f"{anio}-{MESES[mes.lower()]:02d}"
    # Slug: las siglas si son únicas entre las cooperativas; si no, el nombre.
    usos: dict[str, int] = {}
    for c in salida:
        if c["siglas"]:
            k = slug(c["siglas"])
            usos[k] = usos.get(k, 0) + 1
    for c in salida:
        k = slug(c["siglas"]) if c["siglas"] else ""
        c["slug"] = k if k and usos.get(k) == 1 else slug(re.sub(r"^Cooperativa\s+(de\s+)?", "", c["nombre"], flags=re.I))
    return salida, {"total": total, "incluidas": len(salida), "corte": corte, "xlsx": url,
                    "modificado": cab.get("last-modified")}


# ── Ensamblaje ───────────────────────────────────────────────────────────────

def compactar(e: dict) -> dict:
    """Sin los campos vacíos, también dentro de las listas: la instantánea pesa menos."""
    salida = {}
    for k, v in e.items():
        if isinstance(v, list):
            v = [compactar(x) if isinstance(x, dict) else x for x in v]
        if v not in (None, [], "", {}):
            salida[k] = v
    return salida


PRIVACIDAD = [
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "un correo"),
    (re.compile(r"\(\d{3}\)\s*\d{3}-\d{4}"), "un teléfono"),
    (re.compile(r"\b(?:809|829|849)[-.\s]\d{3}[-.\s]\d{4}\b"), "un teléfono"),
]


def main() -> None:
    global CACHE
    if "--cache" in sys.argv:
        CACHE = pathlib.Path(sys.argv[sys.argv.index("--cache") + 1])
    try:
        sb, extra_sb = superintendencia_bancos()
        registro, meta_registro = registro_mensual()
        afp = sipen()
        aseguradoras = seguros()
        cooperativas, meta_coop = idecoop()
    except Bloqueado as err:
        print(f"BLOQUEADO: no se rodea ni se escribe nada: {err}", file=sys.stderr)
        sys.exit(2)

    # Desde qué mes figura cada entidad en el registro mensual, con casamiento
    # exacto y único de la razón social normalizada.
    claves: dict[str, list[dict]] = {}
    for e in sb:
        if e.get("razonSocial"):
            claves.setdefault(clave_razon(e["razonSocial"]), []).append(e)
    casadas = 0
    for k, lista in claves.items():
        if len(lista) == 1 and k in registro:
            lista[0]["registroDesde"] = registro[k]
            casadas += 1

    # ── Verosimilitud: por debajo de esto el sitio cambió de forma, no de contenido.
    eif = [e for e in sb if e["sector"] in SECTORES_EIF]
    operan = [e for e in eif if sin_tildes(e.get("estatus") or "").lower() == "operando"]
    if len(eif) < 40:
        sys.exit(f"SB: solo {len(eif)} entidades de intermediación (se esperaban ~47); no se escribe")
    sin_rnc = [e["nombre"] for e in operan if not e.get("rnc")]
    if sin_rnc:
        sys.exit(f"SB: entidades en operación sin RNC: {sin_rnc}; no se escribe")
    sin_activos = [e["nombre"] for e in operan if not e.get("activosMillones")]
    if sin_activos:
        sys.exit(f"SB: entidades en operación sin activos: {sin_activos}; no se escribe")
    suma = sum(e.get("participacion") or 0 for e in operan)
    if not 97 <= suma <= 103:
        sys.exit(f"SB: las participaciones suman {suma:.1f} %; no se escribe")
    if len(afp) < 5:
        sys.exit(f"SIPEN: solo {len(afp)} AFP; no se escribe")
    if len(aseguradoras) < 25:
        sys.exit(f"Seguros: solo {len(aseguradoras)} compañías; no se escribe")
    if meta_coop["total"] < 2000 or meta_coop["incluidas"] < 900:
        sys.exit(f"IDECOOP: {meta_coop['total']} cooperativas y {meta_coop['incluidas']} financieras; "
                 "no se escribe")

    entidades = sb + afp + aseguradoras + cooperativas
    # Un slug por entidad en toda la plataforma: si dos chocan, la segunda lleva su sector.
    vistos: set[str] = set()
    for e in entidades:
        base = e["slug"] or slug(e["nombre"])
        s = base
        if s in vistos:
            s = f"{base}-{e['sector']}"
        n = 2
        while s in vistos:
            s = f"{base}-{n}"
            n += 1
        e["slug"] = s
        vistos.add(s)

    cortes_sb = sorted(e["corte"] for e in sb if e.get("corte"))
    por_sector: dict[str, int] = {}
    for e in entidades:
        por_sector[e["sector"]] = por_sector.get(e["sector"], 0) + 1

    datos = {
        "generado": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "fuentes": {
            "sb": f"{SB_SUPERVISADOS}/",
            "registroSb": SB_CSV,
            "sipen": SIPEN_AFP,
            "sis": SIS_CIAS,
            "idecoop": IDECOOP_PAGINA,
            "idecoopXlsx": meta_coop["xlsx"],
        },
        "cortes": {
            "sb": {"desde": cortes_sb[0], "hasta": cortes_sb[-1]} if cortes_sb else None,
            "registroSb": {"desde": meta_registro["desde"], "hasta": meta_registro["hasta"]},
            "idecoop": meta_coop["corte"],
        },
        "resumen": {
            "porSector": por_sector,
            "cooperativasIncorporadas": meta_coop["total"],
            "cooperativasIncluidas": meta_coop["incluidas"],
            "subagentes": extra_sb["subagentes"],
            "registroCasadas": casadas,
        },
        "entidades": [compactar(e) for e in entidades],
    }
    texto = json.dumps(datos, ensure_ascii=False, separators=(",", ":"))
    for patron, que in PRIVACIDAD:
        m = patron.search(texto)
        if m:
            sys.exit(f"la salida contiene {que} ({m.group(0)!r}); no se escribe")
    SALIDA.write_text(texto + "\n", encoding="utf-8")
    print(f"{len(entidades)} entidades {por_sector}; SB fichas del {cortes_sb[0] if cortes_sb else '?'} al "
          f"{cortes_sb[-1] if cortes_sb else '?'}; participación de las que operan {suma:.1f} %; "
          f"registro mensual casado en {casadas}; peticiones {PETICIONES}; "
          f"{len(texto) // 1024} KB -> {SALIDA.relative_to(RAIZ)}", file=sys.stderr)


if __name__ == "__main__":
    main()
