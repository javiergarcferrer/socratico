#!/usr/bin/env python3
"""Genera public/data/busqueda/{corpus.json,vectores.bin}: el índice del
buscador de toda la plataforma (`/buscar`, la paleta ⌘K, `/api/buscar`).

No lee ninguna fuente: junta en un solo corpus lo que ya traen las
instantáneas —instituciones, normativa reciente y todas las leyes, obras,
documentos, datos abiertos, cargos de nómina (con su sueldo), procesos de
compra del último año, sentencias del TC y del TSE, iniciativas y
legisladores del Congreso, personas con cargo público (`busqueda_funcionarios`)
y proveedores con contratos desde 2015— y calcula
para cada entrada su vector semántico con el modelo podado de
`scripts/build-modelo-semantico.py`. Las fuentes nuevas traen su propio
lector de entradas (`scripts/busqueda_*.py`, `entradas(datos)`). Legisladores,
funcionarios y proveedores no llevan vector: un nombre de persona o de empresa no dice de
qué trata. Van al final del corpus, y `vectorizados` dice hasta dónde hay
vector. El servidor lee sobre esto un índice por palabra ya construido (BM25,
raíces del español, erratas; `scripts/build-indice-busqueda.mjs`) y compara
vectores por coseno; `lib/busqueda.ts` funde las dos listas. Nada de esto es
una base de datos: es un archivo versionado más.

Se corre **después** de regenerar cualquiera de esas instantáneas (el orden
semanal: normativa → instituciones → leyes, procesos, sentencias, congreso →
este), y **detrás** de él `node scripts/build-indice-busqueda.mjs`, que
guarda el índice por palabra ya construido. Si no se corre, el buscador
sigue funcionando con el corpus anterior y dice su fecha.

Los vectores se calculan con el tokenizador de Rust (`tokenizers`); el del
servidor es `@huggingface/tokenizers` (JS). Dan exactamente los mismos ids
(verificado sobre 6 000 títulos), así que consulta y documento viven en el
mismo espacio.

Requiere: pip install numpy tokenizers

Uso:
    python3 scripts/build-busqueda.py
"""
import datetime
import hashlib
import json
import math
import pathlib
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from urllib.parse import quote, unquote

import numpy as np
from tokenizers import Tokenizer

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
# Las fuentes que traen su propio lector de entradas (`entradas(datos)`).
import busqueda_congreso  # noqa: E402
import busqueda_funcionarios  # noqa: E402
import busqueda_financieras  # noqa: E402
import busqueda_leyes  # noqa: E402
import busqueda_procesos  # noqa: E402
import busqueda_sentencias  # noqa: E402

RAIZ = pathlib.Path(__file__).resolve().parent.parent
DATOS = RAIZ / "public" / "data"
SALIDA = DATOS / "busqueda"

TIPO_NORMA = {1: "Ley", 3: "Decreto", 4: "Reglamento", 7: "Resolución"}
RUTA_NORMA = {"Ley": "ley", "Decreto": "decreto", "Reglamento": "reglamento", "Resolución": "resolucion"}


def plano(s: str) -> str:
    """Sin tildes ni mayúsculas: la misma `normalize` de lib/dgcp.ts."""
    return "".join(c for c in unicodedata.normalize("NFD", s or "") if unicodedata.category(c) != "Mn").lower()


# Quién publica o ejecuta: se repite miles de veces, así que viaja una vez
# en `origenes` y cada entrada lleva su índice.
ORIGENES: list[str] = []
_POS: dict[str, int] = {}


def origen(nombre: str) -> int:
    if nombre not in _POS:
        _POS[nombre] = len(ORIGENES)
        ORIGENES.append(nombre)
    return _POS[nombre]


def slug_institucion(i: dict) -> str:
    """El mismo tramo que `slugInstitucion` en lib/instituciones.ts."""
    base = re.sub(r"[^a-z0-9]+", "-", plano(i["acronimo"] or i["nombre"])).strip("-")[:40]
    return f"{i['id']}-{base}" if base else str(i["id"])


def instituciones() -> list[dict]:
    datos = json.loads((DATOS / "instituciones.json").read_text())["instituciones"]
    return [
        {
            "t": "institucion",
            "ti": i["nombre"],
            "x": i["acronimo"],
            "d": " · ".join(v for v in (i["acronimo"], i["tipo"]) if v),
            "h": f"/instituciones/{slug_institucion(i)}",
            # Un ministerio pesa más que un hospital o un ayuntamiento que se
            # llaman parecido (el mismo criterio que `buscarInstituciones`).
            "p": 0 if i["tipo"] == "Institución" else 1 if i["tipo"] != "Gobierno local" else 2,
        }
        for i in datos
    ]


def normas() -> tuple[list[dict], str]:
    crudo = json.loads((DATOS / "normativa.json").read_text())
    # Un número que el origen da a normas distintas (el Decreto 108-23 son dos
    # decretos) no identifica una: su ficha resolvería una sola. Esas abren
    # el PDF de cada una en la Consultoría.
    titulos: dict[tuple, set] = defaultdict(set)
    for filas in crudo["busquedas"].values():
        for f in filas:
            tipo = TIPO_NORMA.get(f.get("TipoDocumento") or 0, "Norma")
            titulos[(tipo, (f.get("Numero") or "").strip())].add(re.sub(r"\W+", "", (f.get("Titulo") or "").lower()))
    vistas: set[str] = set()
    out = []
    for filas in crudo["busquedas"].values():
        for f in filas:
            if not f.get("Titulo"):
                continue
            tipo = TIPO_NORMA.get(f.get("TipoDocumento") or 0, "Norma")
            numero = (f.get("Numero") or "").strip()
            fecha = (f.get("FechaPromulgacion") or "")[:10] or None
            # El origen repite algunas normas: una norma es tipo, número y fecha.
            clave = f"{tipo}|{numero}|{fecha or ''}"
            if clave in vistas:
                continue
            vistas.add(clave)
            ruta = RUTA_NORMA.get(tipo)
            unica = len(titulos[(tipo, numero)]) == 1
            ficha = f"/normativa/{ruta}/{numero}" if ruta and unica and re.fullmatch(r"\d{1,4}-\d{2,4}", numero) else None
            pdf = f"{busqueda_leyes.DOCUMENTO}/{f['DocId']}" if not ficha and f.get("DocId") else None
            # La misma norma cargada con dos fechas (Resolución 85-24): una.
            if ficha and ficha in vistas:
                continue
            if ficha:
                vistas.add(ficha)
            out.append(
                {
                    "t": "norma",
                    "ti": f["Titulo"],
                    "x": f"{tipo} {numero}",
                    "d": f"{tipo} {numero}".strip(),
                    "h": ficha or pdf,
                    "e": 1 if pdf else None,
                    "f": fecha,
                }
            )
    return out, crudo["generadoEn"]


def obras() -> tuple[list[dict], str]:
    crudo = json.loads((DATOS / "obras.json").read_text())
    return [
        {
            "t": "obra",
            "ti": p["nombre"],
            "x": f"{p['snip']} {' '.join(p['provincias'])}",
            "d": f"SNIP {p['snip']} · {p['estado']}",
            "o": origen(p["entidad"]),
            "h": f"/obras/{p['snip']}",
            "v": p["valor"],
            "f": p.get("inicio"),
        }
        for p in crudo["proyectos"]
    ], crudo["generado"]


def documentos() -> tuple[list[dict], str]:
    filas = json.loads((DATOS / "documentos" / "filas.json").read_text())
    indice = json.loads((DATOS / "documentos" / "indice.json").read_text())
    nombre = {f["host"]: f["nombre"] for f in indice["fuentes"]}
    out = []
    for titulo, fecha, tipo, url, h in filas["filas"]:
        host = filas["hosts"][h]
        # Un título que es el nombre del archivo («Decreto-403-2026-Establece…»)
        # se lee con espacios.
        if " " not in titulo and re.search(r"[-_]", titulo):
            titulo = re.sub(r"[-_]+", " ", titulo).strip()
        # Del nombre del archivo solo lo que el título no dice ya.
        ya = set(plano(titulo).split())
        archivo = re.sub(r"[-_.]+", " ", unquote(url.rsplit("/", 1)[-1]).rsplit(".", 1)[0])
        # Sin restos de sufijo: «2», «adm» o «v1» no ayudan a encontrar nada.
        resto = " ".join(w for w in archivo.split() if plano(w) not in ya and len(w) > 3 and not w.isdigit())
        out.append(
            {
                "t": "documento",
                "ti": titulo,
                "x": resto,
                "d": tipo.upper(),
                "o": origen(nombre.get(host, host)),
                "h": url,
                "f": fecha,
                "e": 1,
            }
        )
    return out, indice["generado"]


def datos_abiertos() -> tuple[list[dict], str]:
    crudo = json.loads((DATOS / "catalogo.json").read_text())
    return [
        {
            "t": "dato",
            "ti": c["titulo"],
            "x": " ".join(c["grupos"]),
            "d": ", ".join(c["formatos"][:3]),
            "o": origen(c["org"]),
            "h": f"https://datos.gob.do/dataset/{quote(c['slug'], safe='')}",
            "e": 1,
        }
        for c in crudo["conjuntos"]
    ], crudo["generado"]


def cargos() -> tuple[list[dict], str]:
    """Un cargo es su nombre sin tildes, mayúsculas ni espacios de más:
    «CHOFER», «Chofer» y «chofer» son la misma plaza escrita por tres
    instituciones. Se muestra la grafía más frecuente."""
    crudo = json.loads((DATOS / "nomina.json").read_text())
    clave = [re.sub(r"\s+", " ", plano(c)).strip() for c in crudo["cargos"]]
    plazas: Counter = Counter()
    grafias: dict[str, Counter] = defaultdict(Counter)
    inst: dict[str, set] = defaultdict(set)
    sueldos: dict[str, list] = defaultdict(list)
    for fila in crudo["rows"]:
        i, c, sueldo = fila[0], fila[2], fila[3]
        k = clave[c]
        plazas[k] += 1
        grafias[k][crudo["cargos"][c]] += 1
        inst[k].add(i)
        # Sueldo mensual bruto de la plaza; una plaza sin sueldo (0) no dice
        # cuánto paga el cargo.
        if sueldo and sueldo > 0:
            sueldos[k].append(sueldo)
    out = []
    for k, n in plazas.items():
        nombre = grafias[k].most_common(1)[0][0].strip()
        s = sorted(sueldos[k])
        out.append(
            {
                "t": "cargo",
                "ti": nombre,
                "d": "",
                "h": f"/nomina?q={quote(nombre, safe='')}",
                "n": n,
                "m": len(inst[k]),
                # Percentil 10, mediana y percentil 90: «¿cuánto gana un
                # médico?» se contesta en la fila, sin abrir la nómina. No el
                # mínimo ni el máximo: una plaza de medio mes (RD$2,754 de un
                # «médico general») los vuelve anécdota. Con menos de diez
                # plazas no hay «8 de cada 10» que decir: van el mínimo y el
                # máximo, y la interfaz dice de cuántas plazas.
                "s": (
                    [round(percentil(s, 0.1)), round(mediana(s)), round(percentil(s, 0.9))]
                    if len(s) >= 10
                    else [round(s[0]), round(mediana(s)), round(s[-1])]
                ) if s else None,
                # Una plaza pesa menos que una institución, una norma o una
                # obra que se llaman igual: «escuelas» busca escuelas antes
                # que al vigilante de una.
                "p": 1,
            }
        )
    return out, crudo["generatedAt"][:10]


def mediana(xs: list) -> float:
    n = len(xs)
    return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2


# Un carácter UTF-8 de dos o más bytes leído como Windows-1252: el byte de
# arranque (Â…ô) seguido de sus bytes de continuación, que en 1252 son
# \x80–\xbf o las comillas, rayas y € de ese rango.
MOJIBAKE = re.compile(
    "[\u00c2-\u00f4](?:[\u00a0-\u00bf\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192"
    "\u02c6\u02dc\u2013\u2014\u2018\u2019\u201a\u201c\u201d\u201e\u2020\u2021\u2022"
    "\u2026\u2030\u2039\u203a\u20ac\u2122]){1,3}"
)


def reparar(texto: str) -> str:
    """UTF-8 leído como Windows-1252 en el origen («DesempeÃ±o», «â€œDía»):
    cada tramo se deshace si al volver a codificarlo sale UTF-8 válido; si
    no, se deja como vino."""

    def uno(m: re.Match) -> str:
        try:
            return m.group(0).encode("cp1252").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            return m.group(0)

    if not texto:
        return texto
    # «”» es E2 80 9D, y 9D no existe en 1252: el origen lo perdió y deja «â€».
    return MOJIBAKE.sub(uno, texto).replace("â€", "”")


def percentil(xs: list, p: float) -> float:
    """Por rango más cercano, sobre una lista ya ordenada."""
    return xs[min(len(xs) - 1, max(0, math.ceil(p * len(xs)) - 1))]


def de_modulo(entradas: list[dict]) -> list[dict]:
    """Las entradas de un `scripts/busqueda_*.py`: quien publica viaja como
    nombre (`on`) y aquí pasa a su índice en `origenes`."""
    out = []
    for e in entradas:
        e = dict(e)
        on = e.pop("on", None)
        if on:
            e["o"] = origen(on)
        out.append(e)
    return out


def sin_repetidas(normas: list[dict], leyes: list[dict]) -> list[dict]:
    """Las leyes del histórico que la normativa reciente no trae ya: una
    norma es tipo, número y fecha (el mismo criterio de `normas()`), y dos
    entradas que llevan a la misma ficha son la misma ley (74-25 figura con
    dos fechas)."""
    vistas = {(n["x"], n.get("f") or "") for n in normas}
    fichas = {n["h"] for n in normas if n.get("h")}
    return [
        l for l in leyes
        if (l["x"], l.get("f") or "") not in vistas and not (l.get("h") and l["h"] in fichas)
    ]


def proveedores() -> tuple[list[dict], str]:
    """Los proveedores con al menos un contrato desde 2015 (la historia de
    `scripts/build-historico.py`): los que tienen ficha con algo que ver. El
    padrón del RPE entero (~138 mil inscritos) no entra: la mayoría nunca
    vendió al Estado, y su ficha estaría vacía. Del padrón de la DGII, solo
    el RNC cuando el cruce lo trae (`scripts/build-rnc.py`); ni teléfono ni
    correo, que ninguna de las dos instantáneas guarda."""
    rnc: dict[str, str] = {}
    for n in range(10):
        f = json.loads((DATOS / "rnc" / f"{n}.json").read_text())
        rnc.update({rpe: fila[0] for rpe, fila in f["filas"].items()})
    out = []
    corte = ""
    for n in range(10):
        f = json.loads((DATOS / "historico" / "proveedores" / f"{n}.json").read_text())
        corte = f["corte"]
        for rpe, p in f["filas"].items():
            nombre = re.sub(r"\s+", " ", p["n"] or "").strip()
            if not nombre:
                continue
            doc = rnc.get(rpe)
            # Son 32 mil filas: sin enlace ni detalle escritos, que el
            # servidor deriva del RPE (`r`) y el RNC (`c`); el índice los
            # busca a los dos como texto auxiliar.
            out.append(
                {
                    "t": "proveedor",
                    "ti": nombre,
                    "r": rpe,
                    "c": doc,
                    "k": sum(a[1] for a in p["s"]),
                    "a": [int(p["d"][:4]), int(p["h"][:4])] if p.get("d") and p.get("h") else None,
                    # Un proveedor que se llama como una institución o una
                    # obra va detrás de ellas.
                    "p": 1,
                }
            )
    # Orden estable: el mismo corpus da el mismo archivo.
    out.sort(key=lambda d: int(d["r"]))
    return out, corte


def main() -> None:
    tok = Tokenizer.from_file(str(SALIDA / "tokenizer.json"))
    tok.no_padding()
    tok.no_truncation()
    meta = json.loads((SALIDA / "modelo.json").read_text())
    dim, especiales = meta["dimensiones"], set(meta["especiales"])
    crudo = np.frombuffer((SALIDA / "modelo.bin").read_bytes(), dtype=np.int8)
    n = meta["piezas"]
    tabla = crudo[: n * dim].reshape(n, dim).astype(np.float32)
    tabla *= np.frombuffer(crudo[n * dim :].tobytes(), dtype="<f4")[:, None]

    docs: list[dict] = []
    fechas: dict[str, str] = {}
    docs += instituciones()
    recientes, fechas["norma"] = normas()
    historicas, fechas["ley"] = busqueda_leyes.entradas(DATOS)
    docs += recientes + de_modulo(sin_repetidas(recientes, historicas))
    congreso, fechas["congreso"] = busqueda_congreso.entradas(DATOS)
    for tipo, (lista, fecha) in {
        "obra": obras(),
        "documento": documentos(),
        "dato": datos_abiertos(),
        "cargo": cargos(),
        "proceso": busqueda_procesos.entradas(DATOS),
        "sentencia": busqueda_sentencias.entradas(DATOS),
    }.items():
        docs += de_modulo(lista)
        fechas[tipo] = fecha
    docs += de_modulo([e for e in congreso if e["t"] == "iniciativa"])
    fechas["iniciativa"] = fechas["legislador"] = fechas.pop("congreso")
    # Con vector, todo lo anterior. Legisladores y proveedores, sin él y al
    # final: un nombre de persona o de empresa no dice de qué trata.
    vectorizados = len(docs)
    docs += de_modulo([e for e in congreso if e["t"] == "legislador"])
    personas, fechas["funcionario"] = busqueda_funcionarios.entradas(DATOS)
    docs += de_modulo(personas)
    financieras, fechas["financiera"] = busqueda_financieras.entradas(DATOS)
    docs += de_modulo(financieras)
    lista, fechas["proveedor"] = proveedores()
    docs += lista

    # El vector es el del título en minúsculas —la consulta también se
    # embebe en minúsculas: un título en MAYÚSCULAS se trocea en piezas
    # raras y cae lejos de su tema—.
    textos = [d["ti"].lower() for d in docs[:vectorizados]]
    vec = np.zeros((vectorizados, dim), dtype=np.float32)
    for inicio in range(0, len(textos), 5000):
        for j, e in enumerate(tok.encode_batch(textos[inicio : inicio + 5000], add_special_tokens=False)):
            ids = [i for i in e.ids if i not in especiales]
            if ids:
                v = tabla[ids].mean(0)
                norma = np.linalg.norm(v)
                if norma:
                    vec[inicio + j] = v / norma
    escala = np.abs(vec).max(1, keepdims=True) / 127
    escala[escala == 0] = 1
    cuant = np.round(vec / escala).astype(np.int8)
    (SALIDA / "vectores.bin").write_bytes(cuant.tobytes() + escala.astype("<f4").tobytes())

    for d in docs:
        for k in ("ti", "x", "d"):
            if isinstance(d.get(k), str):
                d[k] = reparar(d[k])
    # Sin claves vacías: el archivo viaja entero en cada arranque en frío.
    limpios = [{k: v for k, v in d.items() if v not in (None, "")} for d in docs]
    # El detalle y el texto auxiliar que se repiten («Compra menor al umbral ·
    # Adjudicado» en 40 mil procesos) viajan una vez en `frases` y cada entrada
    # lleva su índice, como `origenes`. `resolverFrases` (lib/busqueda-esquema.ts)
    # los devuelve a su texto al leer.
    veces = Counter(d[k] for d in limpios for k in ("d", "x") if isinstance(d.get(k), str))
    frases = sorted(v for v, n in veces.items() if n >= 20 and len(v) > 3)
    pos = {v: i for i, v in enumerate(frases)}
    for d in limpios:
        for k in ("d", "x"):
            if k in d and d[k] in pos:
                d[k] = pos[d[k]]
    # La huella ata el índice guardado (`build-indice-busqueda.mjs`) a este
    # corpus: si no coinciden, el servidor construye el índice en memoria.
    huella = hashlib.sha256(json.dumps(limpios, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]
    corpus = {
        "generado": datetime.date.today().isoformat(),
        "huella": huella,
        "instantaneas": fechas,
        "dimensiones": dim,
        "piezas": n,
        "vectorizados": vectorizados,
        "origenes": ORIGENES,
        "frases": frases,
        "docs": limpios,
    }
    (SALIDA / "corpus.json").write_text(json.dumps(corpus, ensure_ascii=False, separators=(",", ":")))
    cuenta = Counter(d["t"] for d in docs)
    print(f"{len(docs)} entradas: {dict(cuenta)}", file=sys.stderr)


if __name__ == "__main__":
    main()
