#!/usr/bin/env python3
"""Genera public/data/sociedad.json: cuatro series sociales del Estado en una
sola instantánea — denuncias de robo y armas (Ministerio de Interior y
Policía), matrícula escolar (MINERD) y licencias de construcción (MIVHED).

Mecánica verificada en docs/INFRAESTRUCTURA.md §5.9 (MIP, MINERD y MIVHED). Ninguna de las tres tiene un nombre de archivo
predecible, así que cada bloque empieza por el listado que lo publica:

- MIP: `wp-json/wp/v2/media?mime_type=…spreadsheetml.sheet` (robots solo veta
  `/wp-admin/`) → el XLSX de robos 2018–2025 y los de armas. Una hoja con
  bloques apilados por tipo de robo × año × provincia, meses en columnas con
  el subtotal del trimestre intercalado, celdas `#N/D`, títulos con erratas.
  Las cifras son **denuncias** recibidas por la Policía Nacional, no delitos
  ocurridos.
- MINERD: `transparencia/conjunto-de-datos-abiertos/2-estadisticas-de-
  estudiantes-matriculados/<año>/listados` → el CSV por nivel, regional y
  distrito. Dice UTF-8 y es cp1252; separador `;`; el período `202120222`
  mal tecleado; filas de regional (subtotal) mezcladas con las de distrito.
- MIVHED: `transparencia/datos-abiertos-<año>/` → el CSV de licencias
  emitidas 2022–2026. Cabecera en la tercera línea, fechas MM/DD/AAAA.

Higiene: robots.txt primero en cada host, ≤6 GET por host, User-Agent
identificable, un reintento, content-type y firma validados. Cada bloque se
valida por separado: si uno no cuadra (sumas que no casan, pocos datos) no se
escribe ese bloque y los demás sí. Si ninguno pasa, no se toca el archivo.

Uso:
    python3 scripts/build-sociedad.py [--crudos DIR]

`--crudos DIR` guarda cada descarga en DIR y, si ya está ahí, la reutiliza:
para volver a interpretar sin volver a pedir.
"""
import collections
import csv
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
import urllib.parse
import urllib.request
import urllib.robotparser
import zipfile
from xml.etree import ElementTree as ET

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "data" / "sociedad.json"
UA = "Socratico-Inteligencia/1.0 (indicadores sociales; herramienta independiente)"
TOPE_POR_HOST = 6

MIP = "https://mip.gob.do"
MINERD = "https://minerd.gob.do"
MIVHED = "https://mivhed.gob.do"

CRUDOS: pathlib.Path | None = None
peticiones: collections.Counter = collections.Counter()


# ------------------------------------------------------------------ red

def _nombre_crudo(url: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", url.split("://", 1)[1])[:180]


def bajar(url: str, tipos: tuple[str, ...], firma: bytes | None = None) -> bytes:
    """GET con un reintento. Valida content-type (alguno de `tipos`) y, si se
    da, los primeros bytes. Respeta el tope de peticiones por host."""
    if CRUDOS:
        f = CRUDOS / _nombre_crudo(url)
        if f.exists():
            return f.read_bytes()
    host = urllib.parse.urlsplit(url).hostname or ""
    for intento in (1, 2):
        if peticiones[host] >= TOPE_POR_HOST:
            raise RuntimeError(f"{host}: tope de {TOPE_POR_HOST} peticiones alcanzado")
        peticiones[host] += 1
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                tipo = (r.headers.get("content-type") or "").lower()
                cuerpo = r.read()
            if not any(t in tipo for t in tipos):
                raise RuntimeError(f"content-type inesperado «{tipo}»")
            if firma is not None and not cuerpo.startswith(firma):
                raise RuntimeError(f"el cuerpo no empieza por {firma!r}: {cuerpo[:40]!r}")
            if CRUDOS:
                (CRUDOS / _nombre_crudo(url)).write_bytes(cuerpo)
            return cuerpo
        except urllib.error.HTTPError as e:
            # Un 4xx no se reintenta: es una respuesta, no un tropiezo.
            if 400 <= e.code < 500:
                raise RuntimeError(f"{url}: HTTP {e.code}") from e
            if intento == 2:
                raise
        except Exception:  # noqa: BLE001 — un reintento y fuera
            if intento == 2:
                raise
        print(f"  reintento {url}", file=sys.stderr)
        time.sleep(5)
    raise AssertionError


def permitido(base: str, rutas: list[str]) -> None:
    """robots.txt antes que nada. Un 404 es «sin reglas»; cualquier otro
    fallo detiene el bloque."""
    url = base + "/robots.txt"
    rp = urllib.robotparser.RobotFileParser()
    try:
        cuerpo = bajar(url, ("text/plain", "text/html", "application/xml", "text/xml"))
        texto = cuerpo.decode("utf-8", "replace")
        # tss/mip sirven el robots envuelto en marcado; se limpian las etiquetas.
        texto = re.sub(r"<[^>]+>", "\n", texto)
        rp.parse(texto.splitlines())
    except RuntimeError as e:
        if "HTTP 404" not in str(e):
            raise
        rp.parse([])
        if CRUDOS:  # un 404 es «sin reglas»: se recuerda para no volver a pedirlo
            (CRUDOS / _nombre_crudo(url)).write_bytes(b"")
    for ruta in rutas:
        if not rp.can_fetch(UA, base + ruta):
            raise RuntimeError(f"robots.txt de {base} veta {ruta}")


# ------------------------------------------------------------------ xlsx

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def _col(ref: str) -> int:
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group():
        n = n * 26 + ord(ch) - 64
    return n - 1


def leer_xlsx(datos: bytes) -> dict[str, list[list]]:
    """Todas las hojas como filas de valores (str, int, float o None).
    Biblioteca estándar: zipfile + ElementTree."""
    z = zipfile.ZipFile(io.BytesIO(datos))
    compartidas: list[str] = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(f"{NS}si"):
            compartidas.append("".join(t.text or "" for t in si.iter(f"{NS}t")))
    libro = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    destino = {r.get("Id"): r.get("Target") for r in rels}
    hojas: dict[str, list[list]] = {}
    for s in libro.find(f"{NS}sheets"):
        rid = s.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        ruta = destino.get(rid, "")
        ruta = ruta.lstrip("/") if ruta.startswith("/") else "xl/" + ruta
        if ruta not in z.namelist():
            continue
        filas = []
        for r in ET.fromstring(z.read(ruta)).iter(f"{NS}row"):
            fila: dict[int, object] = {}
            for c in r.findall(f"{NS}c"):
                t, v = c.get("t"), c.find(f"{NS}v")
                if t == "inlineStr":
                    val: object = "".join(x.text or "" for x in c.iter(f"{NS}t"))
                elif v is None or v.text is None:
                    continue
                elif t == "s":
                    val = compartidas[int(v.text)]
                elif t in ("str", "e", "b"):
                    val = v.text
                else:
                    f = float(v.text)
                    val = int(f) if f.is_integer() else f
                fila[_col(c.get("r"))] = val
            filas.append([fila.get(j) for j in range(max(fila) + 1)] if fila else [])
        hojas[s.get("name")] = filas
    return hojas


# ------------------------------------------------------------------ util

def clave(s: str) -> str:
    """Sin tildes, solo letras, minúsculas: «Sanchez Ramírez» = «SÁNCHEZ RAMIREZ»."""
    s = unicodedata.normalize("NFD", str(s)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z]", "", s)


def num(v) -> int:
    """Una celda de conteo: vacío, `#N/D` o texto cuentan 0."""
    if isinstance(v, (int, float)):
        return int(round(v))
    if isinstance(v, str) and re.fullmatch(r"\s*\d+(\.0+)?\s*", v):
        return int(float(v))
    return 0


class Nombres:
    """Elige, para cada clave, la grafía más frecuente (y con más tildes)."""

    def __init__(self) -> None:
        self.vistas: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)

    def ver(self, nombre: str) -> str:
        k = clave(nombre)
        self.vistas[k][nombre.strip()] += 1
        return k

    def de(self, k: str) -> str:
        c = self.vistas[k]
        # Con tildes antes que sin ellas («San Cristóbal» sobre «San Cristobal»),
        # después la más frecuente.
        return max(c, key=lambda n: (sum(1 for ch in n if not ch.isascii()), c[n]))


def titulo_propio(s: str) -> str:
    menores = {"de", "del", "la", "las", "los", "y", "el"}
    palabras = s.lower().split()
    return " ".join(
        p if (i and p in menores) else p[:1].upper() + p[1:] for i, p in enumerate(palabras)
    )


# ------------------------------------------------------------------ MIP

MESES_COLS = [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15]  # ene..dic; 4/8/12/16 = trimestres
COL_TOTAL = 17
NO_PROVINCIA = {"nd", "sinprovincia", "sininformacion", "noindicada", ""}


def tipo_de_titulo(fila: list) -> str | None:
    celdas = [str(c) for c in fila if isinstance(c, str)]
    if not celdas:
        return None
    t = celdas[0].strip()
    if t.upper() == "TIPO DE ROBO" and len(celdas) > 1:
        x = re.sub(r"\s+", " ", celdas[1].strip()).lower().replace("vehiculo", "vehículo")
        return {"simple": "Robo simple", "agravado": "Robo agravado"}.get(x, x[:1].upper() + x[1:])
    k = clave(t)
    if k.startswith("robo") and "motocic" in k:
        return "Motocicletas"  # el título dice «Robo Vehículos 4 Motocicletas»
    if k.startswith("robo") and "vehiculo" in k:
        return "Vehículos de cuatro ruedas o más"
    if k.startswith("roboarmas"):
        return "Armas de fuego"
    return None


def interpretar_robos(hojas: dict[str, list[list]]) -> dict:
    filas = max(hojas.values(), key=len)
    # bloques[tipo][año] = {"total": n, "meses": [12], "prov": {clave: n}}
    bloques: dict[str, dict[int, dict]] = collections.defaultdict(dict)
    nombres = Nombres()
    tipo: str | None = None
    anio: int | None = None
    for fila in filas:
        if not fila:
            continue
        nuevo = tipo_de_titulo(fila)
        if nuevo:
            tipo, anio = nuevo, None
            continue
        c0 = fila[0]
        if not isinstance(c0, str) or tipo is None:
            continue
        m = re.fullmatch(r"\s*A[ñn]o\s+(\d{4})\s*", c0)
        if m:
            anio = int(m.group(1))
            f = fila + [None] * (COL_TOTAL + 1 - len(fila))
            bloques[tipo][anio] = {
                "total": num(f[COL_TOTAL]),
                "meses": [num(f[j]) for j in MESES_COLS],
                "prov": {},
                "sin": 0,
            }
            continue
        if anio is None or c0.strip().lower().startswith("año /") or clave(c0).startswith(
            ("cantidad", "nota", "losdatos", "labasede", "lafuente")
        ):
            continue
        f = fila + [None] * (COL_TOTAL + 1 - len(fila))
        total = num(f[COL_TOTAL]) or sum(num(f[j]) for j in MESES_COLS)
        if clave(c0) in NO_PROVINCIA or c0.strip().startswith(("#", "N/D", "Sin")):
            bloques[tipo][anio]["sin"] += total
            continue
        k = nombres.ver(c0)
        bloques[tipo][anio]["prov"][k] = bloques[tipo][anio]["prov"].get(k, 0) + total

    # --- validación: cada año cuadra por meses y por provincias
    if len(bloques) < 5:
        raise ValueError(f"solo {len(bloques)} tipos de robo reconocidos")
    for t, anios in bloques.items():
        for a, b in anios.items():
            if sum(b["meses"]) != b["total"]:
                raise ValueError(f"{t} {a}: meses suman {sum(b['meses'])}, total {b['total']}")
            por_prov = sum(b["prov"].values()) + b["sin"]
            if abs(por_prov - b["total"]) > max(2, b["total"] * 0.005):
                raise ValueError(f"{t} {a}: provincias suman {por_prov}, total {b['total']}")
            if len(b["prov"]) > 32:
                raise ValueError(f"{t} {a}: {len(b['prov'])} provincias (¿fila ajena?)")

    todos_anios = sorted({a for anios in bloques.values() for a in anios})
    # Serie larga: los tipos presentes en todos los años.
    largos = [t for t, anios in bloques.items() if all(a in anios for a in todos_anios)]
    ultimo = todos_anios[-1]
    completos = [a for a in todos_anios if all(a in anios for anios in bloques.values())]

    por_anio = []
    for a in todos_anios:
        por_anio.append({
            "anio": a,
            "serieLarga": sum(bloques[t][a]["total"] for t in largos),
            "todos": sum(b[a]["total"] for b in bloques.values()) if a in completos else None,
            "porTipo": {t: bloques[t][a]["total"] for t in bloques if a in bloques[t]},
        })

    prov_ultimo: collections.Counter = collections.Counter()
    sin_ultimo = 0
    for anios in bloques.values():
        if ultimo in anios:
            prov_ultimo.update(anios[ultimo]["prov"])
            sin_ultimo += anios[ultimo]["sin"]
    meses_ultimo = [sum(b[ultimo]["meses"][i] for b in bloques.values() if ultimo in b) for i in range(12)]
    total_ultimo = sum(b[ultimo]["total"] for b in bloques.values() if ultimo in b)
    if total_ultimo < 1000 or len(prov_ultimo) < 25:
        raise ValueError(f"{ultimo}: {total_ultimo} denuncias en {len(prov_ultimo)} provincias; implausible")

    return {
        "anios": [todos_anios[0], ultimo],
        "ultimoAnio": ultimo,
        "tiposSerieLarga": largos,
        "aniosCompletos": completos,
        "porAnio": por_anio,
        "mesesUltimoAnio": meses_ultimo,
        "porTipoUltimoAnio": sorted(
            ({"tipo": t, "denuncias": b[ultimo]["total"]} for t, b in bloques.items() if ultimo in b),
            key=lambda x: -x["denuncias"],
        ),
        "porProvinciaUltimoAnio": [
            {"provincia": nombres.de(k), "denuncias": n} for k, n in prov_ultimo.most_common()
        ],
        "sinProvinciaUltimoAnio": sin_ultimo,
        "totalUltimoAnio": total_ultimo,
    }


TRIMESTRES = ["ENERO-MARZO", "ABRIL-JUNIO", "JULIO-SEPTIEMBRE", "OCTUBRE-DICIEMBRE"]

ORGANISMOS = [
    ("ministeriopublico", "Ministerio Público"),
    ("policianacional", "Policía Nacional"),
    ("defensa", "Ministerio de Defensa"),
    ("interior", "Ministerio de Interior y Policía"),  # «MINSTERIO», «MININSTERIO»
    ("inteligencia", "Dirección Nacional de Inteligencia"),
    ("drogas", "Dirección Nacional de Control de Drogas"),
    ("migracion", "Dirección General de Migración"),
    ("poderjudicial", "Poder Judicial"),
]


def _tabla_larga(hojas: dict[str, list[list]], columnas: tuple[str, ...]) -> tuple[dict[str, int], list[list]]:
    """Una tabla en formato largo con cabecera en la primera fila no vacía.
    Devuelve el índice de cada columna pedida (por prefijo de su clave)."""
    filas = max(hojas.values(), key=len)
    i = next(k for k, f in enumerate(filas) if f)
    cab = [clave(c) if isinstance(c, str) else "" for c in filas[i]]
    idx = {}
    for c in columnas:
        j = next((k for k, h in enumerate(cab) if h.startswith(c)), None)
        if j is None:
            raise ValueError(f"sin columna «{c}» en {cab}")
        idx[c] = j
    return idx, filas[i + 1:]


def _trimestre(v) -> int:
    t = re.sub(r"\s+", "", str(v or "")).upper()
    if t not in TRIMESTRES:
        raise ValueError(f"trimestre ilegible «{v}»")
    return TRIMESTRES.index(t) + 1


def interpretar_incautadas(hojas: dict[str, list[list]]) -> dict:
    # La columna del año llega como «A¤o» en una de las hojas: se busca por
    # prefijo «a» tras quitar lo que no es letra.
    idx, filas = _tabla_larga(hojas, ("organismo", "cantidad", "trimestre", "a"))
    por = collections.defaultdict(lambda: collections.Counter())  # año → organismo → n
    trimestres = collections.defaultdict(set)
    for f in filas:
        if not f or not isinstance(f[idx["organismo"]], str):
            continue
        f = f + [None] * 6
        anio, q = int(num(f[idx["a"]])), _trimestre(f[idx["trimestre"]])
        k = clave(f[idx["organismo"]])
        nombre = next((n for pat, n in ORGANISMOS if pat in k), titulo_propio(f[idx["organismo"]]))
        por[anio][nombre] += num(f[idx["cantidad"]])
        trimestres[anio].add(q)
    anios = sorted(por)
    if len(anios) < 4 or not all(2015 <= a <= 2030 for a in anios):
        raise ValueError(f"años implausibles: {anios}")
    completos = [a for a in anios if trimestres[a] == {1, 2, 3, 4}]
    ref = completos[-1]
    return {
        "porAnio": [
            {"anio": a, "total": sum(por[a].values()), "trimestres": len(trimestres[a])} for a in anios
        ],
        "anioReferencia": ref,
        "porOrganismo": [{"organismo": o, "armas": n} for o, n in por[ref].most_common()],
    }


def interpretar_registradas(hojas: dict[str, list[list]]) -> dict:
    idx, filas = _tabla_larga(hojas, ("tipodearma", "masculino", "femenino", "trimestre", "a"))
    corte = {}  # (año, trimestre) → tipo → [m, f]
    for f in filas:
        if not f or not isinstance(f[idx["tipodearma"]], str):
            continue
        f = f + [None] * 6
        per = (int(num(f[idx["a"]])), _trimestre(f[idx["trimestre"]]))
        tipo = f[idx["tipodearma"]].strip().upper().replace("AMETRELLADORA", "AMETRALLADORA")
        corte.setdefault(per, {})[titulo_propio(tipo)] = [num(f[idx["masculino"]]), num(f[idx["femenino"]])]
    if len(corte) < 8:
        raise ValueError(f"solo {len(corte)} trimestres")
    # Es un acumulado (crece trimestre a trimestre): cada año se lee en su
    # último trimestre publicado.
    anios = sorted({a for a, _ in corte})
    por_anio = []
    for a in anios:
        q = max(t for x, t in corte if x == a)
        tipos = corte[(a, q)]
        por_anio.append({
            "anio": a,
            "trimestre": q,
            "masculino": sum(v[0] for v in tipos.values()),
            "femenino": sum(v[1] for v in tipos.values()),
        })
    ult = max(corte)
    tot = [p["masculino"] + p["femenino"] for p in por_anio]
    if not 50_000 < tot[-1] < 2_000_000:
        raise ValueError(f"total implausible {tot[-1]}")
    return {
        "porAnio": por_anio,
        "ultimo": {"anio": ult[0], "trimestre": ult[1]},
        "porTipo": sorted(
            ({"tipo": t, "masculino": v[0], "femenino": v[1]} for t, v in corte[ult].items()),
            key=lambda x: -(x["masculino"] + x["femenino"]),
        ),
    }


def bloque_mip() -> dict:
    permitido(MIP, ["/wp-json/wp/v2/media", "/wp-content/uploads/"])
    listado = json.loads(bajar(
        MIP + "/wp-json/wp/v2/media?mime_type=application/vnd.openxmlformats-officedocument"
        ".spreadsheetml.sheet&per_page=100&_fields=id,date,title,source_url",
        ("application/json",),
    ))
    archivos = sorted(listado, key=lambda m: m.get("date", ""), reverse=True)

    def buscar(patron: str) -> dict | None:
        return next((m for m in archivos if re.search(patron, m["source_url"], re.I)), None)

    salida: dict = {}
    robos = buscar(r"robos")
    if not robos:
        raise RuntimeError("MIP: el listado no trae el XLSX de robos")
    try:
        datos = bajar(robos["source_url"], ("spreadsheetml", "octet-stream"), b"PK")
        r = interpretar_robos(leer_xlsx(datos))
        r["archivo"] = robos["source_url"]
        r["publicado"] = robos["date"][:10]
        salida["robos"] = r
        print(f"robos: {r['anios'][0]}–{r['anios'][1]} · {r['totalUltimoAnio']} denuncias en {r['ultimoAnio']}")
    except Exception as e:  # noqa: BLE001 — el bloque cae solo
        print(f"  robos NO se escribe: {e}", file=sys.stderr)

    armas = {}
    for clave_, patron, fn in (
        ("incautadas", r"armas-incautadas", interpretar_incautadas),
        ("registradas", r"armas-registradas", interpretar_registradas),
    ):
        m = buscar(patron)
        if not m:
            print(f"  armas {clave_}: no está en el listado", file=sys.stderr)
            continue
        try:
            datos = bajar(m["source_url"], ("spreadsheetml", "octet-stream"), b"PK")
            a = fn(leer_xlsx(datos))
            a["archivo"] = m["source_url"]
            a["publicado"] = m["date"][:10]
            a["titulo"] = html.unescape(m.get("title", {}).get("rendered", ""))
            armas[clave_] = a
            print(f"armas {clave_}: {a['porAnio'][0]['anio']}–{a['porAnio'][-1]['anio']}")
        except Exception as e:  # noqa: BLE001
            print(f"  armas {clave_} NO se escribe: {e}", file=sys.stderr)
    if armas:
        salida["armas"] = armas
    return salida


# ------------------------------------------------------------------ MINERD

NIVELES = ["Inicial", "Primario", "Secundario", "Adultos"]


def periodo(p: str) -> str:
    """«20232024» → «2023-24»; tolera el «202120222» del origen."""
    d = re.sub(r"\D", "", p)
    y1 = int(d[:4])
    if not d[4:].startswith(str(y1 + 1)):
        raise ValueError(f"período ilegible «{p}»")
    return f"{y1}-{str(y1 + 1)[2:]}"


def interpretar_matricula(texto: str) -> dict:
    lineas = [l for l in texto.splitlines() if l.strip()]
    cab = [c.strip().upper() for c in lineas[0].split(";")]
    if len(cab) < 6 or "INICIAL" not in cab[1] or "PER" not in cab[5]:
        raise ValueError(f"cabecera inesperada: {cab}")
    reg = collections.defaultdict(dict)  # período → {código: {nombre, niveles}}
    dist = collections.defaultdict(lambda: [0, 0, 0, 0])
    for l in lineas[1:]:
        c = l.split(";")
        if len(c) < 6:
            continue
        nombre, p = c[0].strip(), periodo(c[5])
        niveles = [num(x) for x in c[1:5]]
        m = re.match(r"^(\d{2})(?!\d)\s*-?\s*(.+)$", nombre)
        if m:
            reg[p][m.group(1)] = {"nombre": re.sub(r"\s+", " ", m.group(2)).strip(), "niveles": niveles}
        elif re.match(r"^\d{4}", nombre):
            d = dist[p]
            for i in range(4):
                d[i] += niveles[i]
        else:
            raise ValueError(f"fila sin código: «{nombre}»")
    periodos = sorted(reg)
    if len(periodos) < 5:
        raise ValueError(f"solo {len(periodos)} períodos")
    por_periodo = []
    for p in periodos:
        # El total nacional sale de las regionales; los distritos lo comprueban.
        tot = [sum(r["niveles"][i] for r in reg[p].values()) for i in range(4)]
        if tot != dist[p]:
            raise ValueError(f"{p}: regionales {tot} ≠ distritos {dist[p]}")
        if len(reg[p]) != 18:
            raise ValueError(f"{p}: {len(reg[p])} regionales, se esperaban 18")
        if not 1_500_000 < sum(tot) < 4_500_000:
            raise ValueError(f"{p}: {sum(tot)} estudiantes; implausible")
        por_periodo.append({"periodo": p, "total": sum(tot), "niveles": dict(zip(NIVELES, tot))})
    ultimo = periodos[-1]
    nombres = Nombres()
    for p in periodos:
        for r in reg[p].values():
            nombres.ver(r["nombre"])
    return {
        "periodos": [periodos[0], ultimo],
        "ultimoPeriodo": ultimo,
        "porPeriodo": por_periodo,
        "porNivelUltimo": [{"nivel": n, "estudiantes": v} for n, v in zip(NIVELES, por_periodo[-1]["niveles"].values())],
        "porRegionalUltimo": sorted(
            (
                {
                    "codigo": cod,
                    "regional": titulo_propio(nombres.de(clave(r["nombre"]))),
                    "total": sum(r["niveles"]),
                    "niveles": dict(zip(NIVELES, r["niveles"])),
                }
                for cod, r in reg[ultimo].items()
            ),
            key=lambda x: x["codigo"],
        ),
    }


def bloque_minerd() -> dict:
    sub = "/transparencia/conjunto-de-datos-abiertos/2-estadisticas-de-estudiantes-matriculados"
    permitido(MINERD, [sub + "/2024/listados", "/transparencia/file/descarga"])
    enlace = None
    hoy = datetime.date.today().year
    for anio in (hoy, hoy - 1, hoy - 2):
        try:
            pagina = bajar(f"{MINERD}{sub}/{anio}/listados", ("text/html",)).decode("utf-8", "replace")
        except RuntimeError as e:
            print(f"  MINERD {anio}: {e}", file=sys.stderr)
            continue
        candidatos = [
            html.unescape(h) for h in re.findall(r'href="([^"]*/file/descarga\?[^"]*)"', pagina)
            if re.search(r"matriculados-por-nivel[^&]*\.csv&", html.unescape(h), re.I)
        ]
        if candidatos:
            enlace = urllib.parse.urljoin(MINERD, candidatos[0])
            break
    if not enlace:
        raise RuntimeError("MINERD: ningún listado reciente trae el CSV de matrícula")
    crudo = bajar(enlace, ("text/plain", "text/csv", "octet-stream", "application/csv"))
    if crudo.lstrip()[:1] == b"<":
        raise RuntimeError("MINERD: la descarga es HTML, no CSV")
    # Declara UTF-8 y es cp1252: se prueba UTF-8 estricto y, si falla, cp1252.
    try:
        texto = crudo.decode("utf-8")
        codificacion = "utf-8"
    except UnicodeDecodeError:
        texto = crudo.decode("cp1252")
        codificacion = "cp1252"
    m = interpretar_matricula(texto)
    m["archivo"] = enlace
    m["codificacion"] = codificacion
    print(f"matrícula: {m['periodos'][0]}…{m['ultimoPeriodo']} · {m['porPeriodo'][-1]['total']} estudiantes")
    return m


# ------------------------------------------------------------------ MIVHED

# Singular y plural de la misma tipología conviven en el registro.
TIPOLOGIAS = {
    "ESTACIONES DE COMBUSTIBLE": "ESTACIÓN DE COMBUSTIBLE",
    "CENTRO DE SALUD": "CENTROS DE SALUD",
}


def interpretar_licencias(texto: str) -> dict:
    filas = list(csv.reader(io.StringIO(texto)))
    i = next((k for k, f in enumerate(filas[:10]) if f and clave(f[0]).startswith("fechadeemision")), None)
    if i is None:
        raise ValueError("sin cabecera «Fecha de Emisión»")
    cab = [clave(c) for c in filas[i]]
    col = {n: cab.index(n) for n in ("fechadeemision", "provincia", "municipio", "tipologia",
                                       "metroscuadrados", "inversiontotal")}
    registros = []
    malas = 0
    for f in filas[i + 1:]:
        if not any(x.strip() for x in f):
            continue
        try:
            mm, dd, aa = f[col["fechadeemision"]].strip().split("/")
            fecha = datetime.date(int(aa), int(mm), int(dd))  # MM/DD/AAAA
            m2 = float(f[col["metroscuadrados"]].replace(",", "") or 0)
            inv = float(f[col["inversiontotal"]].replace(",", "") or 0)
        except (ValueError, IndexError):
            malas += 1
            continue
        registros.append((fecha, f[col["provincia"]].strip(), f[col["municipio"]].strip(),
                          f[col["tipologia"]].strip(), m2, inv))
    if len(registros) < 1000 or malas > len(registros) * 0.02:
        raise ValueError(f"{len(registros)} licencias legibles, {malas} ilegibles")
    corte = max(r[0] for r in registros)
    anios = sorted({r[0].year for r in registros})
    por_anio = []
    for a in anios:
        rs = [r for r in registros if r[0].year == a]
        por_anio.append({
            "anio": a,
            "licencias": len(rs),
            "metros2": round(sum(r[4] for r in rs)),
            "inversion": round(sum(r[5] for r in rs)),
            "completo": a < corte.year or (corte.month == 12 and corte.day == 31),
            "meses": max(r[0].month for r in rs),
        })
    completos = [p["anio"] for p in por_anio if p["completo"]]
    if not completos:
        raise ValueError("ningún año completo")
    ref = completos[-1]
    rs = [r for r in registros if r[0].year == ref]
    prov_n = Nombres()
    mun_n = Nombres()
    prov: dict[str, list] = collections.defaultdict(lambda: [0, 0.0, 0.0])
    mun: dict[tuple, list] = collections.defaultdict(lambda: [0, 0.0, 0.0])
    tip: dict[str, list] = collections.defaultdict(lambda: [0, 0.0, 0.0])
    for r in rs:
        kp = prov_n.ver(r[1])
        km = (kp, mun_n.ver(r[2]))
        t = TIPOLOGIAS.get(r[3].upper(), r[3].upper())
        for acc, k in ((prov, kp), (mun, km), (tip, t)):
            acc[k][0] += 1
            acc[k][1] += r[4]
            acc[k][2] += r[5]

    def fila(nombre: str, v: list) -> dict:
        return {"nombre": nombre, "licencias": v[0], "metros2": round(v[1]), "inversion": round(v[2])}

    mayor = max(rs, key=lambda r: r[5])
    return {
        "corte": corte.isoformat(),
        "anios": [anios[0], anios[-1]],
        "porAnio": por_anio,
        "anioReferencia": ref,
        "porProvincia": sorted((fila(titulo_propio(prov_n.de(k)), v) for k, v in prov.items()),
                               key=lambda x: -x["licencias"]),
        "porMunicipio": sorted(
            ({**fila(titulo_propio(mun_n.de(k[1])), v), "provincia": titulo_propio(prov_n.de(k[0]))}
             for k, v in mun.items()),
            key=lambda x: -x["licencias"],
        ),
        "porTipologia": sorted((fila(titulo_propio(k), v) for k, v in tip.items()),
                               key=lambda x: -x["licencias"]),
        "mayorLicencia": {
            "fecha": mayor[0].isoformat(), "provincia": titulo_propio(mayor[1]),
            "municipio": titulo_propio(mayor[2]), "tipologia": titulo_propio(mayor[3]),
            "metros2": round(mayor[4]), "inversion": round(mayor[5]),
        },
        "ilegibles": malas,
    }


def bloque_mivhed() -> dict:
    hoy = datetime.date.today().year
    permitido(MIVHED, [f"/transparencia/datos-abiertos-{hoy}/", "/wp-content/uploads/"])
    enlace = None
    for anio in (hoy, hoy - 1):
        try:
            pagina = bajar(f"{MIVHED}/transparencia/datos-abiertos-{anio}/", ("text/html",)).decode("utf-8", "replace")
        except RuntimeError as e:
            print(f"  MIVHED {anio}: {e}", file=sys.stderr)
            continue
        m = re.search(r"""(?:https://mivhed\.gob\.do)?(/wp-content/uploads/\d{4}/\d{2}/Licencias-emitidas[^"'\s<>]*\.csv)""", pagina, re.I)
        if m:
            enlace = MIVHED + m.group(1)
            break
    if not enlace:
        raise RuntimeError("MIVHED: la página de datos abiertos no enlaza el CSV de licencias")
    crudo = bajar(enlace, ("text/csv", "octet-stream", "text/plain", "application/csv"))
    if crudo.lstrip()[:1] == b"<":
        raise RuntimeError("MIVHED: la descarga es HTML, no CSV")
    try:
        texto = crudo.decode("utf-8-sig")
    except UnicodeDecodeError:
        texto = crudo.decode("cp1252")
    lic = interpretar_licencias(texto)
    lic["archivo"] = enlace
    print(f"licencias: {lic['anios'][0]}–{lic['anios'][1]}, corte {lic['corte']}, referencia {lic['anioReferencia']}")
    return lic


# ------------------------------------------------------------------ main

def main() -> None:
    global CRUDOS
    if "--crudos" in sys.argv:
        CRUDOS = pathlib.Path(sys.argv[sys.argv.index("--crudos") + 1])
        CRUDOS.mkdir(parents=True, exist_ok=True)

    doc: dict = {"generado": datetime.date.today().isoformat()}
    fuentes = {}
    fallos = []
    for nombre, fn in (("mip", bloque_mip), ("minerd", bloque_minerd), ("mivhed", bloque_mivhed)):
        try:
            b = fn()
            if nombre == "mip":
                doc.update(b)
                fuentes["mip"] = MIP
            elif nombre == "minerd":
                doc["matricula"] = b
                fuentes["minerd"] = MINERD
            else:
                doc["licencias"] = b
                fuentes["mivhed"] = MIVHED
        except Exception as e:  # noqa: BLE001 — un bloque que cae no tumba a los otros
            fallos.append(f"{nombre}: {e}")
            print(f"  {nombre} NO se escribe: {e}", file=sys.stderr)
    doc["fuentes"] = fuentes

    if not any(k in doc for k in ("robos", "matricula", "licencias")):
        raise SystemExit("ningún bloque pasó la validación; no se toca " + str(SALIDA))
    # Un bloque que falla hoy conserva el de la instantánea anterior, marcado.
    if fallos and SALIDA.exists():
        previo = json.loads(SALIDA.read_text())
        for k in ("robos", "armas", "matricula", "licencias"):
            if k not in doc and k in previo:
                doc[k] = {**previo[k], "heredadoDe": previo.get("generado")}
                print(f"  {k}: se conserva el de {previo.get('generado')}", file=sys.stderr)
    SALIDA.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")))
    print(f"→ {SALIDA} ({SALIDA.stat().st_size // 1024} KB) · peticiones {dict(peticiones)}")


if __name__ == "__main__":
    main()
