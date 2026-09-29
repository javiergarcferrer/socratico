#!/usr/bin/env python3
"""Genera public/data/empresas/: las personas jurídicas del padrón de
contribuyentes de la DGII, con su búsqueda por RNC y por razón social, sin
base de datos.

Fuentes, sin clave (docs/AUDITORIA.md §A.2 y §A.12):

1. **El padrón de contribuyentes de la DGII**:
   `https://dgii.gov.do/app/WebApps/Consultas/RNC/RNC_CONTRIBUYENTES.zip`
   (~27 MB comprimido; dentro, `RNC_Contribuyentes_Actualizado_<dd>_<Mes>_<aaaa>.csv`,
   ~115 MB, ~791 mil filas). El nombre del CSV es el corte y cambia cada mes,
   hacia el día 19. Windows-1252, todo entre comillas, fechas DD/MM/AAAA;
   columnas RNC, RAZÓN SOCIAL, ACTIVIDAD ECONÓMICA, FECHA DE INICIO
   OPERACIONES, ESTADO, RÉGIMEN DE PAGO. El nombre viejo, `DGII_RNC.zip`, da
   403: no se usa.
2. **La tabla entera del Registro de Proveedores del Estado** (DGCP):
   `https://datosabiertos.dgcp.gob.do/api-dgcp/v1/tablas/proveedores?Type=csv&inhabilitados=false`
   (~80 MB). Solo se leen `RPE`, `NUMERO_DOCUMENTO`, `TIPO_DOCUMENTO` y, para
   elegir entre dos inscripciones del mismo RNC, `ESTADO_RPE` y la fecha de
   su última actualización. Trae teléfonos, correos y personas de contacto:
   nada de eso se guarda ni se imprime (§E.6: publicar no es exponer).

**Quién entra: las personas jurídicas, y ninguna persona física.** El padrón
no trae una columna de tipo de persona, así que se deduce, y por eso se
cuenta cada exclusión en `meta.json` (corte del 19 sep 2026):

- Las cédulas (11 cifras, 290,140) son personas físicas: fuera.
- Los RNC de 9 cifras que empiezan por 5 (1,794) son nombres de personas, ni
  uno con una palabra de empresa: fuera.
- Los que empiezan por 1 (sociedades) y por 4 (asociaciones, fundaciones,
  condominios, iglesias, instituciones públicas) son personas jurídicas,
  **salvo** tres grupos que el número no delata y el nombre sí:
  · las **sucesiones** (actividad «IMPUESTO SUCESORAL» o razón social que
    empieza por «SUCESION», «SUCESORES»…): el patrimonio de un difunto, con
    su nombre; ~4 mil;
  · el **lote del 1 de enero de 2009** (RNC 1306…): 5,041 inscripciones de un
    mismo día, casi todas de personas con nombre y apellido que venden en su
    colmado o su boutique; sale toda la que no lleve forma jurídica (SRL,
    EIRL…) ni una palabra que ningún nombre de persona usa («TIENDA»,
    «JOYERIA»); ~4.3 mil;
  · fuera de ese lote, la razón social sin forma jurídica ni palabra de
    negocio hecha de nombres y apellidos (al menos dos muy frecuentes entre
    las cédulas del mismo padrón); ~300. Una razón social que une personas
    con «Y» o «&» («GUZMAN Y SANTOS») es una sociedad en nombre colectivo y
    se queda.
  Las frecuencias salen del propio padrón: cuántas cédulas llevan cada
  palabra en su nombre contra cuántas razones sociales con forma jurídica.
  Es una heurística: alguna persona con nombre extranjero puede quedar, y
  alguna empresa con nombre de persona puede salir. Se revisó a mano en
  muestras de cada grupo.
- Una fila de 8 cifras («NAVARRETE MOTORS») no es un RNC válido y se cuenta
  aparte.

**Qué se guarda por empresa.** RNC, razón social (como la publica la DGII,
sin espacios de más), actividad económica (en un diccionario: ~2,000 textos
para ~490 mil filas), fecha de inicio de operaciones (o nada), estado,
régimen de pago y, si es proveedora del Estado, su RPE (varios si tiene más
de una inscripción, la vigente primero).

**Reparación mínima.** El CSV es Windows-1252, pero unas 130 razones
sociales de la herencia DOS traen la ñ en cp850 («PE¤A», «ESPA¥OLA»): entre
dos letras, «¤» y «¥» se leen como la ñ que son (mayúscula si lo son sus
vecinas). El espacio duro pasa a espacio. Nada más se toca, y la cuenta de
reparadas queda en `meta.json`.

**Diseño para un servidor sin estado** (lo lee `lib/empresas.ts`, que
documenta las cifras medidas):

- `filas/NNN.tsv.gz`: las empresas ordenadas por RNC, 1,024 por archivo, una
  por línea: `rnc  razón social  actividad  inicio(AAAAMMDD)  estado  rpe`,
  separadas por tabulador, en gzip (27.2 MB de texto quedan en 9.4). El
  número de línea global es el **id** de la empresa. `meta.json` lleva el
  primer RNC de cada archivo: buscar un RNC es una búsqueda binaria en esa
  lista y otra dentro de un solo archivo.
- `indice/<letra>.bin` y `indice/num.bin`: un índice invertido por palabra de
  la razón social, partido por la primera letra de la palabra. Las palabras
  son las de `plano()` en `lib/raiz.ts` (minúsculas, sin tildes, todo signo
  como espacio): de dos letras o más, o una cifra suelta. Cada palabra lleva
  los ids de las empresas que la contienen, en deltas LEB128, con el bit bajo
  en 1 si la razón social **empieza** por ella. Las palabras con guion
  (solo existen entre cifras: «20-30») se copian también en `num.bin`, para
  que una cifra buscada se resuelva leyendo un solo archivo.
- `rango.bin`: un byte por empresa (palabras de la razón social, hasta 15;
  si está activa; si es proveedora) para ordenar los resultados sin leer
  sus filas.

Se niega a escribir si el padrón no es plausible (menos de 300 mil personas
jurídicas, menos de 600 mil contribuyentes, o columnas distintas), y escribe
en un directorio aparte que solo reemplaza al publicado al final: un corte a
medias nunca llega a `public/`.

Uso:
    python3 scripts/build-empresas.py            # descarga las dos fuentes a .cache/empresas/
    python3 scripts/build-empresas.py --cache    # reusa lo ya bajado en .cache/empresas/
"""
import collections
import csv
import datetime
import gzip
import io
import json
import pathlib
import re
import shutil
import struct
import sys
import time
import unicodedata
import urllib.request
import zipfile

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "data" / "empresas"
CACHE = RAIZ / ".cache" / "empresas"
# ASCII a propósito: una cabecera HTTP con «ó» viaja en Latin-1 desde Python
# y en UTF-8 desde curl; el nombre identifica igual sin la tilde.
UA = "Socratico-Inteligencia/1.0 (padron de empresas; herramienta independiente)"
URL_DGII = "https://dgii.gov.do/app/WebApps/Consultas/RNC/RNC_CONTRIBUYENTES.zip"
URL_RPE = ("https://datosabiertos.dgcp.gob.do/api-dgcp/v1/tablas/proveedores"
           "?Type=csv&inhabilitados=false")

COLUMNAS = ["RNC", "RAZÓN SOCIAL", "ACTIVIDAD ECONÓMICA", "FECHA DE INICIO OPERACIONES",
            "ESTADO", "RÉGIMEN DE PAGO"]
MIN_EMPRESAS = 300_000
MIN_CONTRIBUYENTES = 600_000
POR_BLOQUE = 1024

MESES = {m: i + 1 for i, m in enumerate(
    ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"])}

# Cuál de dos inscripciones del mismo RNC en el RPE se enlaza primero.
PREFERENCIA_RPE = {"Activo": 0, "Desactualizado": 1, "Inactivo": 2, "Suspendido": 3,
                   "Inhabilitado": 4, "Cancelado": 5}


def bajar(url: str, tipos: tuple[str, ...], destino: pathlib.Path) -> str:
    """GET con el UA identificable, un reintento y el tipo validado. Devuelve last-modified."""
    for intento in (1, 2):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=300) as r:
                tipo = r.headers.get("content-type", "")
                if not any(t in tipo for t in tipos):
                    raise RuntimeError(f"{url}: content-type inesperado «{tipo}»")
                datos = r.read()
                destino.parent.mkdir(parents=True, exist_ok=True)
                destino.write_bytes(datos)
                (destino.parent / f"{destino.name}.last-modified").write_text(
                    r.headers.get("last-modified", ""))
                return r.headers.get("last-modified", "")
        except Exception as e:  # noqa: BLE001 — un reintento y fuera
            if intento == 2:
                raise
            print(f"  reintento: {e}", file=sys.stderr)
            time.sleep(10)
    raise AssertionError


def sin_tildes(s: str) -> str:
    t = unicodedata.normalize("NFD", s)
    return "".join(ch for ch in t if not unicodedata.category(ch).startswith("M"))


def plano(s: str) -> str:
    """El mismo `plano()` de lib/raiz.ts: sin tildes, minúsculas, signos como espacio;
    el guion solo sobrevive entre dos cifras. Si divergen, el índice guarda
    palabras que la consulta nunca produce."""
    t = sin_tildes(s).lower()
    t = re.sub(r"[^a-z0-9-]+", " ", t)
    t = re.sub(r"-(?![0-9])|(?<![0-9])-", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def indexable(p: str) -> bool:
    """Una consulta nunca pide una palabra de una letra (lib/raiz.ts: `agujas`),
    pero sí una cifra suelta: «CENTRO 1» se encuentra por «1»."""
    return len(p) >= 2 or p.isdigit()


def fragmento_de(p: str) -> str:
    return p[0] if "a" <= p[0] <= "z" else "num"


REPARA = re.compile(r"(?<=[A-Za-zÑñ])[¤¥](?=[A-Za-zÑñ])")


def limpiar(texto: str) -> tuple[str, bool]:
    """Espacios de más fuera; la ñ de cp850 entre dos letras, devuelta."""
    t = re.sub(r"\s+", " ", texto.replace(" ", " ")).strip()
    if "¤" not in t and "¥" not in t:
        return t, False

    def ene(m: re.Match) -> str:
        i = m.start()
        vecinas = t[i - 1] + t[i + 1]
        return "Ñ" if vecinas.isupper() else "ñ"

    nuevo = REPARA.sub(ene, t)
    return nuevo, nuevo != t


def fecha(v: str) -> str:
    """DD/MM/AAAA → AAAAMMDD; vacía o imposible («00/00/0000») → ''."""
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", (v or "").strip())
    if not m:
        return ""
    try:
        d = datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    except ValueError:
        return ""
    return d.strftime("%Y%m%d")


def corte_iso(nombre: str):
    """«…_Actualizado_19_Sep_2026.csv» → 2026-09-19."""
    m = re.search(r"(\d{1,2})_([A-Za-z]{3})[A-Za-z]*_(\d{4})", nombre)
    if not m or m.group(2).lower() not in MESES:
        return None
    return f"{m.group(3)}-{MESES[m.group(2).lower()]:02d}-{int(m.group(1)):02d}"


# ------------------------------------------------------ personas físicas

def palabras_de(nombre: str) -> list[str]:
    """Las palabras de un nombre, en mayúsculas y sin tildes: «PEÑA» → «PENA»."""
    return re.findall(r"[A-Z0-9]+", sin_tildes(nombre.upper()))


FORMA = re.compile(
    r"(?<![A-Z0-9])(S R L|SRL|S A S|SAS|S A|SA|C POR A|CPORA|C X A|CXA|E I R L|EIRL|S N C|SNC|"
    r"S EN C|INC|LTD|LTDA|LLC|CORP|S L|SL|B V|BV|S P A|SPA|SARL|GMBH|AG|PLC|LIMITED|"
    r"CORPORATION|COMPANY|CO)(?![A-Z0-9])")
PARTICULAS = {"DE", "DEL", "LA", "LAS", "LOS", "VDA", "VIUDA", "JS", "MA", "JR", "SR", "II", "III", "Y"}
NO_EMPIEZA_PERSONA = {"LA", "EL", "LOS", "LAS", "DE", "DEL", "Y", "E", "THE", "SAN", "SANTA",
                      "SANTO", "NUESTRA", "MI", "MIS", "TU", "SU"}
SUCESION = {"SUCESION", "SUCESIONES", "SUCESORES", "SUCS", "SUC", "SUCN", "SUCECION", "SUCESSION"}
ENTIDAD = {"FIDEICOMISO", "FIDEICOMISOS", "CONSORCIO", "HIJOS", "HIJAS", "HERMANOS", "HNOS",
           "ASOCIADOS", "ASOCS", "SUCURSAL", "FONDO"}


def tiene_forma(nombre: str) -> bool:
    """SRL, S.A., EIRL, C. por A., S.N.C., INC…, con o sin puntos."""
    return bool(FORMA.search(" ".join(palabras_de(nombre))))


class Personas:
    """Reconoce a una persona física que el padrón lista con RNC de 9 cifras.

    `en_cedulas[p]`: cuántas cédulas llevan la palabra `p` en su nombre.
    `en_empresas[p]`: cuántas razones sociales **con forma jurídica** la llevan.
    """

    def __init__(self, en_cedulas: collections.Counter, en_empresas: collections.Counter):
        self.p, self.c = en_cedulas, en_empresas

    def de_negocio(self, t: str) -> bool:
        p, c = self.p.get(t, 0), self.c.get(t, 0)
        return (any(ch.isdigit() for ch in t)
                or (c >= 20 and c >= 3 * p)          # «HOTEL», «AUTO», «PLAZA»
                or (p == 0 and c >= 1)               # ningún nombre de persona la usa
                or (t.endswith("ERIA") and p < 50))  # «JOYERIA», no «VALERIA»

    def de_persona(self, t: str) -> bool:
        p, c = self.p.get(t, 0), self.c.get(t, 0)
        return p >= 50 and p >= 2 * c

    def motivo(self, rnc: str, razon: str, actividad: str, inicio: str) -> str | None:
        """Por qué no se publica, o `None` si es persona jurídica."""
        if tiene_forma(razon):
            return None
        t = palabras_de(razon)
        if actividad == "IMPUESTO SUCESORAL" or (t and t[0] in SUCESION):
            return "sucesion"
        if rnc[0] != "1" or not t or any(x in ENTIDAD for x in t):
            return None
        resto = [x for x in t if x not in PARTICULAS and len(x) > 1]
        if not resto or any(self.de_negocio(x) for x in resto):
            return None
        if rnc.startswith("1306") and inicio == "20090101":
            return "lote2009"
        if not (2 <= len(t) <= 8) or t[0] in NO_EMPIEZA_PERSONA:
            return None
        if "&" in razon or "Y" in t[1:]:
            return None  # «GUZMAN Y SANTOS»: sociedad en nombre colectivo
        fuertes = sum(self.de_persona(x) for x in resto)
        raras = sum(1 for x in resto if not self.de_persona(x)
                    and self.p.get(x, 0) < 50 and self.c.get(x, 0) < 20)
        if fuertes >= 2 or (fuertes >= 1 and fuertes + raras == len(resto)):
            return "nombre"
        return None


# ------------------------------------------------------------- escritura

def varint(n: int, salida: bytearray) -> None:
    while n >= 0x80:
        salida.append((n & 0x7F) | 0x80)
        n >>= 7
    salida.append(n)


def escribir_fragmento(ruta: pathlib.Path, palabras: list[str], listas: dict[str, list[int]]) -> int:
    """EMP1 · n · largo del texto · palabras unidas por «\\n» · relleno a 4 ·
    n+1 desplazamientos u32 · listas en deltas LEB128. Todo little-endian."""
    texto = "\n".join(palabras).encode("ascii")
    postings = bytearray()
    desplazamientos = []
    for p in palabras:
        desplazamientos.append(len(postings))
        anterior = 0
        for v in listas[p]:
            varint(v - anterior, postings)
            anterior = v
    desplazamientos.append(len(postings))
    cabeza = b"EMP1" + struct.pack("<II", len(palabras), len(texto)) + texto
    cabeza += b"\0" * (-len(cabeza) % 4)
    cuerpo = struct.pack(f"<{len(desplazamientos)}I", *desplazamientos)
    ruta.write_bytes(cabeza + cuerpo + bytes(postings))
    return len(cabeza) + len(cuerpo) + len(postings)


def leer_rpe(crudo: bytes) -> tuple[dict[str, list[str]], int]:
    """RNC de 9 cifras → sus RPE: primero el de estado más vigente y, entre
    iguales, el actualizado más tarde (1,555 RNC tienen dos o tres
    inscripciones, casi siempre una cancelada de 2005 y la de hoy)."""
    por_rnc: dict[str, list[tuple[int, str, int]]] = {}
    total = 0
    for f in csv.DictReader(io.StringIO(crudo.decode("utf-8-sig"))):
        total += 1
        doc = re.sub(r"\D", "", f.get("NUMERO_DOCUMENTO") or "")
        rpe = (f.get("RPE") or "").strip()
        if f.get("TIPO_DOCUMENTO") != "RNC" or len(doc) != 9 or not rpe.isdigit():
            continue
        por_rnc.setdefault(doc, []).append((
            PREFERENCIA_RPE.get(f.get("ESTADO_RPE") or "", 9),
            f.get("FECHA_ULTIMA_ACTUALIZACION_RPE") or "",
            int(rpe),
        ))
    salida = {}
    for rnc, v in por_rnc.items():
        v.sort(key=lambda x: (x[1], x[2]), reverse=True)  # lo más reciente primero…
        v.sort(key=lambda x: x[0])  # …dentro de cada estado (orden estable)
        salida[rnc] = [str(r) for _, _, r in v]
    return salida, total


def main() -> None:
    usar_cache = "--cache" in sys.argv
    zip_dgii, csv_rpe = CACHE / "RNC_CONTRIBUYENTES.zip", CACHE / "proveedores.csv"

    if usar_cache and zip_dgii.exists() and csv_rpe.exists():
        lm = CACHE / f"{zip_dgii.name}.last-modified"
        modificado = lm.read_text() if lm.exists() else ""
        print(f"usando lo ya bajado en {CACHE}")
    else:
        modificado = bajar(URL_DGII, ("zip",), zip_dgii)
        bajar(URL_RPE, ("text/csv",), csv_rpe)

    rpes, total_rpe = leer_rpe(csv_rpe.read_bytes())

    # 1. El padrón entero: las cédulas solo se miran para aprender qué palabras
    #    son nombres de persona; no se guarda ninguna.
    z = zipfile.ZipFile(zip_dgii)
    nombre_csv = z.infolist()[0].filename
    texto = z.read(nombre_csv).decode("cp1252", errors="replace")
    lector = csv.reader(io.StringIO(texto))
    cabecera = next(lector)
    if [c.strip() for c in cabecera] != COLUMNAS:
        sys.exit(f"columnas inesperadas: {cabecera}")

    fuera = collections.Counter()
    en_cedulas: collections.Counter = collections.Counter()
    candidatas: list[tuple] = []
    contribuyentes = rnc_nueve = reparados = ilegibles = 0
    for fila in lector:
        if len(fila) < 6:
            continue
        contribuyentes += 1
        rnc = fila[0].strip()
        if not rnc.isdigit() or len(rnc) not in (9, 11):
            fuera["rncInvalido"] += 1
            continue
        if len(rnc) == 11:
            fuera["cedula"] += 1
            en_cedulas.update(set(palabras_de(limpiar(fila[1])[0])))
            continue
        rnc_nueve += 1
        if rnc[0] == "5":
            fuera["rncDePersona"] += 1
            continue
        if rnc[0] not in "14":
            fuera["rncPrefijoDesconocido"] += 1  # ninguno en el corte del 19 sep 2026
            continue
        razon, r1 = limpiar(fila[1])
        actividad, r2 = limpiar(fila[2])
        reparados += r1 or r2
        ilegibles += ("�" in razon) or ("�" in actividad)
        candidatas.append((rnc, razon.replace("\t", " "), actividad, fecha(fila[3]),
                           fila[4].strip(), fila[5].strip()))
    del texto

    en_empresas: collections.Counter = collections.Counter()
    for c in candidatas:
        if tiene_forma(c[1]):
            en_empresas.update(set(palabras_de(c[1])))
    personas = Personas(en_cedulas, en_empresas)

    empresas: dict[str, tuple] = {}
    # Proveedores del Estado que se quedan sin ficha por ser personas: la
    # ficha de proveedor (lib/rnc.ts) no enlaza a una empresa que no existe.
    proveedores_sin_ficha: list[str] = []
    for rnc, razon, actividad, inicio, estado, regimen in candidatas:
        motivo = personas.motivo(rnc, razon, actividad, inicio)
        if motivo:
            fuera[motivo] += 1
            if rnc in rpes:
                proveedores_sin_ficha.append(rnc)
        else:
            empresas[rnc] = (razon, actividad, inicio, estado, regimen)
    del candidatas

    n = len(empresas)
    if n < MIN_EMPRESAS or contribuyentes < MIN_CONTRIBUYENTES:
        sys.exit(f"padrón implausible: {n} personas jurídicas de {contribuyentes} "
                 f"contribuyentes (mínimos {MIN_EMPRESAS} y {MIN_CONTRIBUYENTES}); no se escribe nada")
    if n >= 2 ** 21:
        sys.exit(f"{n} empresas: lib/empresas.ts ordena con el id en 21 bits; ampliar antes de escribir")

    # 2. Diccionarios pequeños: actividades y estado|régimen.
    orden = sorted(empresas)
    actividades = [""] + sorted({e[1] for e in empresas.values()} - {""})
    ia = {a: i for i, a in enumerate(actividades)}
    estados = sorted({f"{e[3]}|{e[4]}" for e in empresas.values()})
    ie = {s: i for i, s in enumerate(estados)}

    # 3. Filas por bloques, rango e índice por palabra, en el mismo recorrido.
    #    Se arma fuera de public/ (en la caché, que git ignora) y se mueve al final.
    tmp = CACHE.parent / "empresas-nuevo"
    if tmp.exists():
        shutil.rmtree(tmp)
    (tmp / "filas").mkdir(parents=True)
    (tmp / "indice").mkdir()

    bloques: list[str] = []
    rango = bytearray(n)
    listas: dict[str, list[int]] = {}
    con_rpe = texto_filas = 0
    por_estado: collections.Counter = collections.Counter()
    lineas: list[str] = []
    for i, rnc in enumerate(orden):
        razon, actividad, inicio, estado, regimen = empresas[rnc]
        suyos = rpes.get(rnc, [])
        con_rpe += bool(suyos)
        por_estado[estado] += 1
        if i % POR_BLOQUE == 0:
            bloques.append(rnc)
        lineas.append(f"{rnc}\t{razon}\t{ia[actividad]}\t{inicio}\t{ie[f'{estado}|{regimen}']}\t{','.join(suyos)}\n")
        if len(lineas) == POR_BLOQUE or i == n - 1:
            crudo = "".join(lineas).encode("utf-8")
            texto_filas += len(crudo)
            # mtime=0: el mismo corte da los mismos bytes, y git no ve cambios falsos.
            (tmp / "filas" / f"{len(bloques) - 1:03d}.tsv.gz").write_bytes(
                gzip.compress(crudo, compresslevel=9, mtime=0))
            lineas = []

        palabras = plano(razon).split(" ") if razon else []
        vistas = set()
        for pos, p in enumerate(palabras):
            if not p or p in vistas or not indexable(p):
                continue
            vistas.add(p)
            listas.setdefault(p, []).append(i * 2 + (pos == 0))
        cuantas = sum(1 for p in palabras if p and indexable(p))
        rango[i] = min(cuantas, 15) | (16 if estado == "ACTIVO" else 0) | (32 if suyos else 0)

    # Los 27 fragmentos siempre existen, aunque alguno quede vacío: que falte
    # uno lo lee lib/empresas.ts como instantánea rota, no como «no hay».
    fragmentos: dict[str, list[str]] = {c: [] for c in [*"abcdefghijklmnopqrstuvwxyz", "num"]}
    for p in listas:
        fragmentos.setdefault(fragmento_de(p), []).append(p)
        if "-" in p and fragmento_de(p) != "num":
            fragmentos.setdefault("num", []).append(p)  # «z3-7»: la cifra tras el guion
    peso_indice = 0
    for clave, palabras in fragmentos.items():
        peso_indice += escribir_fragmento(tmp / "indice" / f"{clave}.bin", sorted(set(palabras)), listas)
    (tmp / "rango.bin").write_bytes(bytes(rango))
    (tmp / "actividades.json").write_text(
        json.dumps(actividades, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    meta = {
        "version": 1,
        "generado": datetime.date.today().isoformat(),
        "archivoDgii": nombre_csv,
        "corteDgii": corte_iso(nombre_csv),
        "modificadoDgii": modificado,
        "contribuyentes": contribuyentes,
        "rncNueve": rnc_nueve,
        "empresas": n,
        "fuera": dict(fuera.most_common()),
        "porEstado": dict(por_estado.most_common()),
        "conRpe": con_rpe,
        "proveedoresRpe": total_rpe,
        "proveedoresSinFicha": sorted(proveedores_sin_ficha),
        "reparados": reparados,
        "ilegibles": ilegibles,
        "palabras": len(listas),
        "porBloque": POR_BLOQUE,
        "columnas": ["rnc", "razonSocial", "actividad", "inicio", "estado", "rpe"],
        "estados": estados,
        "bloques": bloques,
    }
    (tmp / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")

    if SALIDA.exists():
        shutil.rmtree(SALIDA)
    tmp.rename(SALIDA)

    peso_filas = sum(f.stat().st_size for f in (SALIDA / "filas").iterdir())
    total = sum(f.stat().st_size for f in SALIDA.rglob("*") if f.is_file())
    print(f"{contribuyentes:,} contribuyentes ({nombre_csv}): {rnc_nueve:,} con RNC de 9 cifras, "
          f"{fuera['cedula']:,} con cédula, {fuera['rncInvalido']:,} con otro largo")
    print(f"→ {n:,} personas jurídicas; fuera: {dict(fuera.most_common())}")
    print(f"→ {con_rpe:,} con RPE (de {total_rpe:,} inscripciones), {reparados} razones reparadas, "
          f"{ilegibles} ilegibles")
    print(f"→ {SALIDA}: filas {peso_filas / 1e6:.1f} MB en {len(bloques)} archivos gzip "
          f"({texto_filas / 1e6:.1f} MB de texto), índice {peso_indice / 1e6:.1f} MB "
          f"({len(listas):,} palabras), rango {n / 1e6:.1f} MB; total {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
