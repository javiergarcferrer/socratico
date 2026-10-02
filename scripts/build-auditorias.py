#!/usr/bin/env python3
"""Genera public/data/auditorias.json: los informes de auditoría que publican la
Contraloría General y la Cámara de Cuentas, el Índice de Control Interno (ICI)
trimestral de la Contraloría y el índice de las listas de la Cámara sobre quién
presentó su declaración jurada de patrimonio a tiempo, tarde o no la presentó.

Regenerar cuando cualquiera de las dos publique algo nuevo (la Cámara sube
informes varias veces al mes y las listas de omisos cada dos meses):

    python3 scripts/build-auditorias.py            # en vivo
    python3 scripts/build-auditorias.py --cache D  # guarda/reusa las respuestas en D

Mecánica verificada el 2026-09-24 (docs/INFRAESTRUCTURA.md §5.10):

Contraloría General (`contraloria.gob.do`, WordPress, robots abierto salvo
`/wp-admin/`):
- `/informes-de-auditorias/` lista 38 fichas `archivo-card` con título corto
  (siglas y período, «CEA 2020-2022», o «Informe General MIREX»), la fecha de
  **subida** («5 marzo 2025») y el PDF en `wp-content/uploads`. Casi todas se
  subieron el 5-6 de marzo de 2025 y cubren 2020-2022; dos son réplicas de la
  institución auditada, no informes.
- `/nobaci/sobre-ici/` enlaza una página por año (`resulados-ici-2026` —sic—,
  `resulados-ici-2025`, `resultados-ici-2024`) con las mismas fichas: un PDF
  por trimestre con los resultados del ICI.

Cámara de Cuentas (`camaradecuentas.gob.do`, Joomla + K2 + Phoca Download;
`www.` redirige al ápex; robots estándar de Joomla, no veta `/index.php/` ni
`/phocadownload/`; `consultadjp.` devuelve 500 y no se usa):
- `/index.php/ultimas-auditorias` pagina de 3 en 3 («Página 1 de 72»); su RSS
  (`?format=feed&type=rss`) trae los 10 más recientes con título completo y
  fecha. Se leen el RSS y la primera página (para el total de páginas): el
  listado entero serían 72 peticiones, fuera del presupuesto por host.
  El RSS trae el nombre del funcionario que lo publicó: no se guarda.
- Listas de declaración jurada (Phoca Download, `?limit=0` = «Todo», la opción
  del propio selector de la página):
  · a tiempo — `category/23-…-en-tiempo-habil`, archivos sueltos;
  · tarde — `category/24-…-extemporanea`, archivos sueltos;
  · omisos — `category/25-…-omisos`, subcategorías por año y, dentro, por mes;
    cada mes trae ~12 listas, una por grupo (Diputados, Senadores, UASD,
    Banreservas, ayuntamientos…). Se lee el último año y su último mes.
- **Todas las listas son PDF.** Este entorno no tiene `pdftotext` ni `pypdf`,
  así que no se cuentan: se guarda título, fecha de corte, fecha de
  publicación y URL, con `total`, `porEstado` y `porInstitucion` en `null`.

**Privacidad (obligatoria):** las listas nombran funcionarios. El script no
descarga ni guarda ningún PDF, ni escribe un nombre de persona: solo títulos
de listas, grupos institucionales y fechas. Si algún día se cuentan, se agrega
por institución, estado y período, y los nombres no salen del proceso.

Contrato: GET solamente, User-Agent identificable, robots leído primero en cada
host, un segundo entre peticiones, un reintento, `content-type` validado. Un
403/470/challenge no se reintenta ni se rodea: el script para y lo dice.
**No escribe nada** si el resultado es inverosímil (menos de 20 informes de la
Contraloría, ninguno de la Cámara, ninguna lista de declaraciones).
Peticiones por corrida: Contraloría 6 (robots, informes, sobre-ICI, 3 años);
Cámara 8 (robots, listado, RSS, a tiempo, tarde, omisos, último año, último mes).
"""
import datetime
import email.utils
import hashlib
import html as htmlmod
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
SALIDA = RAIZ / "public" / "data" / "auditorias.json"
INSTITUCIONES = RAIZ / "public" / "data" / "instituciones.json"
UA = "Socratico-Inteligencia/1.0 (auditorias y declaraciones; herramienta independiente)"
PAUSA = 1.0

CGR = "https://contraloria.gob.do"
CGR_INFORMES = f"{CGR}/informes-de-auditorias/"
CGR_ICI = f"{CGR}/nobaci/sobre-ici/"

CCRD = "https://camaradecuentas.gob.do"
CCRD_LISTADO = f"{CCRD}/index.php/ultimas-auditorias"
CCRD_RSS = f"{CCRD_LISTADO}?format=feed&type=rss"
CCRD_A_TIEMPO = f"{CCRD}/index.php/reportes-djp/category/23-listado-de-funcionarios-que-entregaron-su-declaracion-en-tiempo-habil"
CCRD_TARDE = f"{CCRD}/index.php/reportes-djp/category/24-listado-de-funcionarios-que-entregaron-su-declaracion-extemporanea"
CCRD_OMISOS = f"{CCRD}/index.php/reportes-djp/category/25-listado-de-funcionarios-omisos"

MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}

CACHE: pathlib.Path | None = None
PETICIONES: dict[str, int] = {}
_ultima: dict[str, float] = {}


class Bloqueado(RuntimeError):
    """El origen respondió con un bloqueo (403/470/challenge): no se rodea."""


def get(url: str, tipos: tuple[str, ...]) -> str:
    host = urllib.parse.urlsplit(url).hostname or ""
    if CACHE is not None:
        clave = hashlib.sha1(url.encode()).hexdigest()[:16]
        b, t = CACHE / f"{clave}.b", CACHE / f"{clave}.t"
        if b.exists() and t.exists():
            tipo = t.read_text()
            if not any(x in tipo for x in tipos):
                raise RuntimeError(f"{url}: content-type inesperado {tipo!r} (caché)")
            return b.read_bytes().decode("utf-8", "replace")
    ultimo: Exception | None = None
    for intento in (1, 2):
        espera = PAUSA - (time.monotonic() - _ultima.get(host, 0.0))
        if espera > 0:
            time.sleep(espera)
        _ultima[host] = time.monotonic()
        PETICIONES[host] = PETICIONES.get(host, 0) + 1
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                tipo = r.headers.get("Content-Type", "")
                cuerpo = r.read()
            if not any(x in tipo for x in tipos):
                raise RuntimeError(f"content-type inesperado {tipo!r}")
            texto = cuerpo.decode("utf-8", "replace")
            if re.search(r"cf-challenge|Attention Required|captcha", texto[:4000], re.I):
                raise Bloqueado(f"{url}: la respuesta es un challenge")
            if CACHE is not None:
                CACHE.mkdir(parents=True, exist_ok=True)
                (CACHE / f"{clave}.b").write_bytes(cuerpo)
                (CACHE / f"{clave}.t").write_text(tipo)
            return texto
        except urllib.error.HTTPError as err:
            if err.code in (401, 403, 429, 470):
                raise Bloqueado(f"{url}: HTTP {err.code}") from err
            ultimo = err
        except Bloqueado:
            raise
        except Exception as err:  # noqa: BLE001 — un reintento y se informa
            ultimo = err
    raise RuntimeError(f"{url}: {ultimo}")


def robots_permite(origen: str, rutas: list[str]) -> None:
    """Lee robots.txt (grupo `*`) y aborta si veta alguna de las rutas que se usan."""
    texto = get(f"{origen}/robots.txt", ("text/plain",))
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
            if ruta.startswith(veto) and veto not in ("/wp-admin/",):
                raise Bloqueado(f"{origen}/robots.txt veta {veto} (se pedía {ruta})")


# ── Utilidades de texto ──────────────────────────────────────────────────────

def limpio(s: str) -> str:
    return re.sub(r"\s+", " ", htmlmod.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def norm(s: str) -> str:
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^A-Za-z0-9 ]+", " ", s)).upper().strip()


def fecha_es(s: str) -> str | None:
    """«5 marzo 2025», «14 de septiembre del 2026», «17 Septiembre 2026» → ISO."""
    m = re.search(r"(\d{1,2})\s+(?:de\s+)?([A-Za-zé]+)\s+(?:de[l]?\s+)?(\d{4})", s, re.I)
    if not m:
        return None
    mes = MESES.get(m.group(2).lower())
    if not mes:
        return None
    try:
        return datetime.date(int(m.group(3)), mes, int(m.group(1))).isoformat()
    except ValueError:
        return None


def fecha_corte(titulo: str) -> str | None:
    """La fecha de corte que llevan los títulos de las listas: «AL 26-4-2024»,
    «HASTA 31 - 08 - 2026». Se prefiere la que sigue a AL/HASTA/CORTE (un
    título trae «AL 29-2-2024 20-12-2023»); si no hay, la última del título."""
    fecha = r"(\d{1,2})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{4})"
    m = re.search(r"\b(?:AL|HASTA|CORTE)\s+(?:EL\s+)?" + fecha, titulo, re.I)
    if not m:
        for m in re.finditer(fecha, titulo):
            pass
    if not m:
        return None
    try:
        return datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1))).isoformat()
    except ValueError:
        return None


# ── Cruce con las fichas de institución ─────────────────────────────────────

class Cruce:
    """Coincidencia **exacta** (sin tildes ni signos) con `instituciones.json`:
    por siglas o por nombre completo. Sin coincidencia exacta, `null`."""

    def __init__(self) -> None:
        datos = json.loads(INSTITUCIONES.read_text(encoding="utf-8"))["instituciones"]
        self.siglas: dict[str, int] = {}
        self.nombres: dict[str, int] = {}
        dup_s: set[str] = set()
        dup_n: set[str] = set()
        for i in datos:
            for tabla, dup, valor in ((self.siglas, dup_s, i.get("acronimo") or ""),
                                      (self.nombres, dup_n, i.get("nombre") or "")):
                k = norm(valor)
                if not k:
                    continue
                if k in tabla and tabla[k] != i["id"]:
                    dup.add(k)
                tabla[k] = i["id"]
        for k in dup_s:
            self.siglas.pop(k, None)
        for k in dup_n:
            self.nombres.pop(k, None)

    def de(self, *candidatos: str | None) -> int | None:
        for c in candidatos:
            if not c:
                continue
            k = norm(c)
            if k in self.siglas:
                return self.siglas[k]
            if k in self.nombres:
                return self.nombres[k]
        return None


# ── Contraloría ─────────────────────────────────────────────────────────────

def fichas_wp(pagina: str) -> list[tuple[str, str, str]]:
    """Las fichas `archivo-card` del tema de la Contraloría: (título, fecha, url)."""
    out = []
    for m in re.finditer(
            r'archivo-title">\s*<strong>(.*?)</strong>.*?archivo-fecha">(.*?)</div>.*?href="([^"]+)"',
            pagina, re.S):
        out.append((limpio(m.group(1)), limpio(m.group(2)), htmlmod.unescape(m.group(3)).strip()))
    return out


def siglas_finales(texto: str | None) -> str | None:
    """«Ministerio de la Presidencia MINPRE», «Gabinete … - GCPS» → las siglas del final."""
    if not texto:
        return None
    m = re.search(r"(?:^|[\s-])([A-ZÑ]{3,})$", texto.strip())
    return m.group(1) if m and " " in texto.strip() else None


def contraloria(cruce: Cruce) -> dict:
    robots_permite(CGR, ["/informes-de-auditorias/", "/nobaci/sobre-ici/"])
    informes = []
    for titulo, fecha, url in fichas_wp(get(CGR_INFORMES, ("text/html",))):
        if not url.lower().endswith(".pdf"):
            continue
        replica = bool(re.match(r"r[ée]plica", titulo, re.I))
        # «Informe General MIREX», «CEA 2020-2022», «Réplica Auditoría de INAPA»
        resto = re.sub(r"^(informe\s+(general|con\s+enmienda|auditor[ií]a\s+especial)|r[ée]plica\s+auditor[ií]a\s+(de[l]?|a)?)\s*",
                       "", titulo, flags=re.I)
        m = re.search(r"\s*((?:19|20)\d{2}(?:\s*-\s*(?:19|20)\d{2})?)\s*$", resto)
        periodo = re.sub(r"\s+", "", m.group(1)) if m else None
        institucion = (resto[: m.start()] if m else resto).strip(" -") or None
        informes.append({
            "titulo": titulo,
            "tipo": "replica" if replica else "informe",
            "institucion": institucion,
            "periodo": periodo,
            "fecha": fecha_es(fecha),
            "uc": cruce.de(institucion, siglas_finales(institucion)),
            "url": url,
        })
    informes.sort(key=lambda x: (x["fecha"] or "", x["titulo"]), reverse=True)

    ici: list[dict] | None = []
    try:
        indice = get(CGR_ICI, ("text/html",))
        anios = sorted({(int(a), u) for u, a in re.findall(
            r'href="(https://contraloria\.gob\.do/nobaci/sobre-ici/resul[a-z]*-ici-(\d{4})/)"', indice)},
            reverse=True)
        for anio, url_anio in anios:
            for titulo, fecha, url in fichas_wp(get(url_anio, ("text/html",))):
                if not url.lower().endswith(".pdf"):
                    continue
                t = norm(titulo)
                trimestre = next((n for n, p in ((1, "PRIMER"), (2, "SEGUNDO"), (3, "TERCER"), (4, "CUARTO"))
                                  if p in t), None)
                ici.append({"titulo": titulo, "anio": anio, "trimestre": trimestre,
                            "fecha": fecha_es(fecha), "url": url})
    except Bloqueado:
        raise
    except Exception as err:  # noqa: BLE001 — el ICI es secundario: se anota y se sigue
        print(f"ICI de la Contraloría no leído: {err}", file=sys.stderr)
        ici = None
    if ici is not None:
        ici.sort(key=lambda x: (x["anio"], x["trimestre"] or 0), reverse=True)
    return {"informes": informes, "ici": ici or None, "pagina": CGR_INFORMES, "paginaIci": CGR_ICI}


# ── Cámara de Cuentas ───────────────────────────────────────────────────────

def institucion_de_informe(titulo: str) -> tuple[str | None, str | None, str | None]:
    """(institución, siglas, período) de un título de la Cámara:
    «Informe Final de la auditoría practicada a … de la Oficina Nacional de
    Defensa Pública (ONDP), por el período 2012-2018.»"""
    t = titulo.rstrip(". ")
    periodo = None
    m = re.search(r",?\s*(?:por|al)\s+(?:el\s+)?per[ií]odo\s+(.*)$", t, re.I)
    if m:
        periodo = re.sub(r"^comprendido\s+entre\s+(el\s+)?", "", m.group(1).strip(), flags=re.I)
        t = t[: m.start()]
    siglas = None
    m = re.search(r"\(([^()]+)\)\s*$", t)
    if m:
        siglas = m.group(1).strip()
        t = t[: m.start()].strip()
    # Lo que sigue al último «estados financieros/de ejecución presupuestaria»,
    # «procesos» o al propio «Informe»: «de la X», «del X», «de X».
    m = re.search(r"(?:presupuestaria|financieros|procesos|^informe)\s+(?:de\s+la|del|de\s+los|de\s+las|de)\s+(.+)$",
                  t, re.I)
    nombre = m.group(1).strip() if m else None
    if nombre:
        nombre = nombre[0].upper() + nombre[1:]
    return nombre, siglas, periodo


def camara_informes(cruce: Cruce) -> dict:
    primera = get(CCRD_LISTADO, ("text/html",))
    m = re.search(r"P[áa]gina\s+\d+\s+de\s+(\d+)", primera)
    paginas = int(m.group(1)) if m else None
    por_pagina = len(re.findall(r'class="catItemView', primera)) or None

    rss = get(CCRD_RSS, ("xml",))
    informes = []
    for item in re.findall(r"<item>(.*?)</item>", rss, re.S):
        titulo = limpio(re.search(r"<title>(.*?)</title>", item, re.S).group(1))
        enlace = htmlmod.unescape(re.search(r"<link>(.*?)</link>", item, re.S).group(1).strip())
        fecha = None
        pd = re.search(r"<pubDate>(.*?)</pubDate>", item)
        if pd:
            fecha = email.utils.parsedate_to_datetime(pd.group(1).strip()).date().isoformat()
        nombre, siglas, periodo = institucion_de_informe(titulo)
        primera_sigla = siglas.split()[0] if siglas and siglas.split()[0].isupper() else None
        informes.append({
            "titulo": titulo.rstrip(" ."),
            "fecha": fecha,
            "institucion": nombre,
            "siglas": siglas,
            "periodo": periodo,
            "uc": cruce.de(siglas, primera_sigla, nombre),
            "url": enlace,
        })
    return {"informes": informes, "listado": CCRD_LISTADO,
            "paginasListado": paginas, "porPagina": por_pagina}


def archivos_phoca(pagina: str, base: str) -> list[dict]:
    """Los archivos de una categoría de Phoca Download: título, fecha de
    publicación y URL (la vista previa en PDF si existe; si no, la descarga)."""
    out = []
    bloques = re.split(r'<div class="pd-filenamebox', pagina)[1:]
    for b in bloques:
        a = re.search(r'pd-float"><a[^>]*href="([^"]+)"\s*>([^<]+)</a>', b)
        if not a:
            continue
        descarga = urllib.parse.urljoin(base, htmlmod.unescape(a.group(1)))
        titulo = limpio(a.group(2))
        f = re.search(r"pd-date-txt.*?pd-fl-m\\?'&gt;([^&]+)&lt;", b, re.S)
        vista = re.search(r'btn-warning" href="([^"]+\.pdf)"', b, re.I)
        url = descarga
        if vista:
            ruta = htmlmod.unescape(vista.group(1))
            url = urllib.parse.urljoin(CCRD, urllib.parse.quote(ruta, safe="/-_.~"))
        out.append({"titulo": titulo, "publicado": fecha_es(f.group(1)) if f else None,
                    "url": url, "formato": "pdf" if (vista or url.lower().endswith(".pdf")) else None})
    return out


def subcategorias(pagina: str, base: str) -> list[tuple[str, str, int]]:
    return [(urllib.parse.urljoin(base, htmlmod.unescape(u)), limpio(t).replace("(+)", "").strip(), int(n))
            for u, t, n in re.findall(
                r'<a[^>]*href="([^"]*/category/[^"]*)"[^>]*>([^<]*)</a>\s*<small>\((\d+)\)</small>', pagina)]


# Grupo de cada lista de omisos, por palabras del título. Orden: de lo más
# específico a lo más general. Lo que no encaja queda `null` y se muestra el título.
GRUPOS_OMISOS: list[tuple[str, str, str | None]] = [
    ("PARLACEN", "Diputados al Parlamento Centroamericano", None),
    ("ULTRAMAR", "Diputados de ultramar", None),
    ("DIPUTADOS", "Cámara de Diputados", None),
    ("SENADORES", "Senado", None),
    ("AYUNTAMIENTOS", "Ayuntamientos y juntas de distrito", None),
    ("SUPREMA CORTE", "Suprema Corte de Justicia", None),
    ("PROCURADURIA", "Procuraduría General de la República", None),
    ("REGISTRO INMOBILIARIO", "Registro Inmobiliario", None),
    ("UASD", "Universidad Autónoma de Santo Domingo", "UASD"),
    ("BANRESERVAS", "Banreservas", None),
    ("BANDEX", "Bandex", None),
    ("DECRETO", "Designados por decreto u otros", None),
]


def grupo_de(titulo: str) -> tuple[str | None, str | None]:
    t = norm(titulo)
    for clave, nombre, siglas in GRUPOS_OMISOS:
        if clave in t:
            return nombre, siglas
    return None, None


def camara_declaraciones(cruce: Cruce) -> tuple[list[dict], dict]:
    listas: list[dict] = []
    categorias = {}
    for estado, url in (("a_tiempo", CCRD_A_TIEMPO), ("tarde", CCRD_TARDE)):
        pagina = get(f"{url}?limit=0", ("text/html",))
        archivos = archivos_phoca(pagina, url)
        categorias[estado] = {"url": url, "listas": len(archivos)}
        for a in archivos:
            listas.append({"lista": a["titulo"], "estado": estado, "periodo": fecha_corte(a["titulo"]),
                           "publicado": a["publicado"], "grupo": None, "uc": None, "url": a["url"],
                           "formato": a["formato"], "total": None, "porEstado": None, "porInstitucion": None})

    raiz = get(f"{CCRD_OMISOS}?limit=0", ("text/html",))
    anios = [(u, t, n) for u, t, n in subcategorias(raiz, CCRD_OMISOS) if re.search(r"\d{4}", t)]
    anios.sort(key=lambda x: int(re.search(r"(\d{4})", x[1]).group(1)), reverse=True)
    categorias["omiso"] = {"url": CCRD_OMISOS, "anios": [re.search(r"(\d{4})", t).group(1) for _, t, _ in anios],
                           "leido": None, "listas": 0}
    if anios:
        u_anio, t_anio, _ = anios[0]
        pag_anio = get(f"{u_anio}?limit=0", ("text/html",))
        meses = [(u, t, n) for u, t, n in subcategorias(pag_anio, u_anio) if re.match(r"\d{1,2}", t)]
        meses.sort(key=lambda x: int(re.match(r"(\d{1,2})", x[1]).group(1)), reverse=True)
        categorias["omiso"]["meses"] = [{"mes": t.title(), "listas": n} for _, t, n in meses]
        if meses:
            u_mes, t_mes, _ = meses[0]
            archivos = archivos_phoca(get(f"{u_mes}?limit=0", ("text/html",)), u_mes)
            anio_leido = re.search(r"(\d{4})", t_anio).group(1)
            categorias["omiso"]["leido"] = f"{t_mes.title()} {anio_leido}"
            categorias["omiso"]["listas"] = len(archivos)
            for a in archivos:
                grupo, siglas = grupo_de(a["titulo"])
                # La lista de la UASD no trae la fecha en el título, sí en el nombre del archivo.
                corte = fecha_corte(a["titulo"]) or fecha_corte(urllib.parse.unquote(a["url"].rsplit("/", 1)[-1]))
                listas.append({"lista": a["titulo"], "estado": "omiso", "periodo": corte,
                               "publicado": a["publicado"], "grupo": grupo,
                               "uc": cruce.de(siglas, grupo) if grupo else None, "url": a["url"],
                               "formato": a["formato"], "total": None, "porEstado": None,
                               "porInstitucion": None})
    return listas, categorias


# Los títulos son de listas, no de personas; aun así, se comprueba que ninguno
# lleve la forma de un nombre propio en una lista de personas (defensa en profundidad).
PALABRAS_DE_LISTA = re.compile(
    r"LISTAD|DECLARACI|DJP|EXTEMPOR|OMISO|TIEMPO|HABIL|FUNCIONARIO|PROCURADUR|CORTE|PATRIMONIO", re.I)


def verificar_privacidad(listas: list[dict]) -> None:
    for l in listas:
        if not PALABRAS_DE_LISTA.search(l["lista"]):
            raise ValueError(f"título de lista inesperado, no se escribe: {l['lista'][:60]!r}")
        for k in ("total", "porEstado", "porInstitucion"):
            if l[k] is not None:
                raise ValueError("este script no cuenta listas en PDF: un conteo no debería existir")


def main() -> None:
    global CACHE
    if "--cache" in sys.argv:
        CACHE = pathlib.Path(sys.argv[sys.argv.index("--cache") + 1])
    cruce = Cruce()
    try:
        cgr = contraloria(cruce)
        robots_permite(CCRD, ["/index.php/ultimas-auditorias", "/index.php/reportes-djp/", "/phocadownload/"])
        ccrd = camara_informes(cruce)
        listas, categorias = camara_declaraciones(cruce)
    except Bloqueado as err:
        print(f"BLOQUEADO — no se rodea ni se escribe nada: {err}", file=sys.stderr)
        sys.exit(2)

    # Verosimilitud: por debajo de esto el sitio cambió de forma, no de contenido.
    if len(cgr["informes"]) < 20:
        sys.exit(f"Contraloría: solo {len(cgr['informes'])} informes (se esperaban ~38); no se escribe")
    if not ccrd["informes"]:
        sys.exit("Cámara de Cuentas: el RSS de auditorías vino vacío; no se escribe")
    if not any(l["estado"] == "tarde" for l in listas) or not any(l["estado"] == "omiso" for l in listas):
        sys.exit("Cámara de Cuentas: faltan listas de declaraciones tardías u omisas; no se escribe")
    if sum(1 for i in cgr["informes"] if i["fecha"]) < len(cgr["informes"]) * 0.8:
        sys.exit("Contraloría: la mayoría de las fechas no se pudo leer; no se escribe")
    verificar_privacidad(listas)

    orden = {"omiso": 0, "tarde": 1, "a_tiempo": 2}
    # Por estado (omisos primero) y, dentro, de la más reciente a la más antigua.
    listas.sort(key=lambda l: l["periodo"] or l["publicado"] or "", reverse=True)
    listas.sort(key=lambda l: orden[l["estado"]])

    data = {
        "generado": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "contraloria": cgr,
        "camara": {
            **ccrd,
            "declaraciones": listas,
            "categorias": categorias,
            "contado": False,
            "notaConteo": ("Las listas son PDF y este corte no las cuenta: se enlazan. "
                           "Los nombres de funcionarios nunca se guardan ni se muestran."),
        },
        "fuentes": {
            "contraloria": {"informes": CGR_INFORMES, "ici": CGR_ICI},
            "camara": {"auditorias": CCRD_LISTADO, "rss": CCRD_RSS, "aTiempo": CCRD_A_TIEMPO,
                       "tarde": CCRD_TARDE, "omisos": CCRD_OMISOS},
        },
    }
    SALIDA.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    por_estado = {e: sum(1 for l in listas if l["estado"] == e) for e in orden}
    print(f"Contraloría: {len(cgr['informes'])} informes "
          f"({sum(1 for i in cgr['informes'] if i['uc'])} con ficha), "
          f"ICI {len(cgr['ici'] or [])} trimestres; Cámara: {len(ccrd['informes'])} informes recientes "
          f"de ~{(ccrd['paginasListado'] or 0) * (ccrd['porPagina'] or 0)} "
          f"({sum(1 for i in ccrd['informes'] if i['uc'])} con ficha); listas {por_estado}; "
          f"peticiones {PETICIONES} -> {SALIDA.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
