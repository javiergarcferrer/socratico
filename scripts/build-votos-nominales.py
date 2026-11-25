#!/usr/bin/env python3
"""Genera datos/votos/nominal.json: el voto de cada diputado en cada votación del
pleno de `public/data/votaciones.json`, una fila por (votación, legislador,
sentido), para que el grafo derive la asistencia y la disidencia de cada persona
(docs/INFRAESTRUCTURA.md §5.5, §7.4, §7.11).

Fuente: `votacion/legisladores/?page=N&id={votación}&periodoId=P` de la API del
SIL Ciudadano (`https://www.diputadosrd.gob.do/sil/api`), diez filas por página
—ni `pageSize`, `size`, `take`, `limit` ni `rows` lo cambian (verificado el
2026-11-25)—: unas 19 páginas por votación. Cada fila trae el diputado
(`legisladorId`, nombre, siglas de su bancada en esa votación) y su voto
(`votoId` `SI`, `NO`, `AU` «Ausente para esta votación», `SV` «sin voto»).

Una votación cerrada no cambia: la lectura es **incremental**. Lo ya guardado en
la salida se conserva y solo se piden las votaciones que faltan, de la más
reciente a la más antigua (2024-2028 primero). Se guarda cada 50 votaciones y al
cortarse, así que una corrida interrumpida no pierde nada y la siguiente sigue.

Higiene: solo GET, User-Agent identificable, a lo sumo `--hilos` peticiones a la
vez (3 por omisión) con `--pausa` segundos (0.3) entre una y otra en cada hilo, y un
solo reintento a los 8 s.
Si el SIL responde 403, 429, un challenge o HTML en lugar de JSON, el lector se
detiene y lo dice: no se rodea (CLAUDE.md, regla 6). Cada votación se valida: el
número de filas leídas es el `total` que el SIL declara.

Formato (compacto, alineado a un padrón por período que solo crece):

    {"generado", "fuente", "corte": {...},
     "periodos": {"2024-2028": {"legisladores": [[id, "NOMBRES", "APELLIDOS"], ...],
                                 "partidos": ["PRM", "FP", ...]}},
     "votos": {"<votación>": {"p": "2024-2028", "n": 190,
                              "v": "ssa…",   # un carácter por legislador del padrón
                              "b": "0010…"}}} # índice de su bancada en `partidos`

En `v`: `s` sí, `n` no, `b` abstención, `a` ausente, `x` sin voto (SV), `o`
otro, `-` no figura en esa votación (no era miembro en ejercicio o no lo lista).
En `b`: un carácter de `0-9a-zA-Z` por índice de `partidos`, `-` sin bancada.

Uso:
    python3 scripts/build-votos-nominales.py                 # lee lo que falta
    python3 scripts/build-votos-nominales.py --max 500       # a lo sumo 500 votaciones en esta corrida
    python3 scripts/build-votos-nominales.py --periodo 2024-2028
    python3 scripts/build-votos-nominales.py --contar        # cuántas faltan, sin pedir nada
    python3 scripts/build-votos-nominales.py --salida RUTA   # leer sobre una copia, fuera de datos/votos/
    python3 scripts/build-votos-nominales.py --fichas        # la representación de cada legislador

`--fichas` escribe datos/votos/fichas.json con `legislador/legislador/{id}` de
cada diputado del padrón de nominal.json y de public/data/congreso.json: su
función («Diputada»), demarcación, circunscripción, partido y el inicio y el fin
de su ejercicio en el período que el SIL tiene por suyo (el más reciente). Ni
teléfonos ni correos: se publican, pero no se copian (.claude/rules/fuentes.md,
lección 5). También incremental.
"""
import datetime
import http.client
import json
import pathlib
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

RAIZ = pathlib.Path(__file__).resolve().parent.parent
VOTACIONES = RAIZ / "public" / "data" / "votaciones.json"
SALIDA = RAIZ / "datos" / "votos" / "nominal.json"
FICHAS = RAIZ / "datos" / "votos" / "fichas.json"
CONGRESO = RAIZ / "public" / "data" / "congreso.json"

BASE = "https://www.diputadosrd.gob.do/sil/api"
UA = "Socratico-Inteligencia/1.0 (votos nominales del pleno; herramienta independiente)"
TIMEOUT = 40
POR_PAGINA = 10
PERIODO_ID = {"2020-2024": 2760, "2024-2028": 2761}
CODIGOS = {"SI": "s", "NO": "n", "AU": "a", "SV": "x"}
DIGITOS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

pausa = 0.3
peticiones = 0
cerrojo = threading.Lock()


class Bloqueo(Exception):
    """El SIL negó la lectura: se para y se escribe, no se rodea."""


class Repetidas(Exception):
    """La paginación devolvió filas repetidas: la votación no se guarda y se pide en la próxima corrida."""


def limpiar(valor) -> str:
    return re.sub(r"\s+", " ", valor or "").strip()


def pedir(ruta: str) -> dict:
    global peticiones
    url = f"{BASE}/{ruta}"
    for intento in (1, 2):
        with cerrojo:
            peticiones += 1
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                tipo = r.headers.get("content-type", "")
                cuerpo = r.read()
            if "application/json" not in tipo:
                raise Bloqueo(f"{ruta}: content-type {tipo!r} (¿challenge o página de error?)")
            datos = json.loads(cuerpo)
            if not (isinstance(datos, dict) and isinstance(datos.get("results"), list)):
                raise ValueError("sin envoltura {results}")
            time.sleep(pausa)
            return datos
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 429, 470):
                raise Bloqueo(f"{ruta}: HTTP {e.code}") from e
            if intento == 2:
                raise RuntimeError(f"{ruta}: HTTP {e.code}") from e
        except (OSError, http.client.HTTPException, ValueError) as e:
            if intento == 2:
                raise RuntimeError(f"{ruta}: {e}") from e
        time.sleep(8)
    raise AssertionError("inalcanzable")


def nominal_de(votacion_id: int, periodo_id: int) -> tuple[list[tuple[int, str, str, str]], int]:
    """Las filas (legislador, nombre, código, bancada) de una votación y el total declarado."""
    filas, pagina, total = [], 1, None
    while True:
        p = pedir(f"votacion/legisladores/?page={pagina}&id={votacion_id}&periodoId={periodo_id}")
        total = p["total"]
        filas.extend(p["results"])
        if not p["results"] or pagina * POR_PAGINA >= total:
            break
        pagina += 1
    if len(filas) < total:
        raise RuntimeError(f"votación {votacion_id}: {len(filas)} de {total} filas")
    salida, vistos = [], set()
    for f in filas:
        leg = f.get("legislador") or {}
        lid = leg.get("legisladorId")
        if not lid or lid in vistos:
            continue
        vistos.add(lid)
        codigo = limpiar(f.get("votoId")).upper()
        texto = limpiar(f.get("voto")).lower()
        c = CODIGOS.get(codigo) or ("b" if codigo.startswith("AB") or texto.startswith("absten") else "o")
        siglas = limpiar(((leg.get("partido") or {}).get("siglas")) or "")
        # El SIL invierte los campos: `apellidos` trae los nombres de pila y `nombres`, los apellidos.
        nombre = [limpiar(leg.get("apellidos")), limpiar(leg.get("nombres"))]
        salida.append((int(lid), nombre, c, siglas))
    # En 220 de 2,701 votaciones (2026-11-25) el SIL declara 190 filas y trae 189 diputados distintos;
    # más de una de diferencia es una paginación que repitió páginas (la 20257: 74 de 190).
    if len(salida) < total - 1:
        raise Repetidas(f"votación {votacion_id}: {len(salida)} diputados distintos en {total} filas")
    return salida, total


def leer() -> dict:
    if SALIDA.exists():
        return json.loads(SALIDA.read_text())
    return {"periodos": {}, "votos": {}}


def escribir(datos: dict, votaciones: list[dict]) -> None:
    hechas = {p: 0 for p in PERIODO_ID}
    for v in votaciones:
        if str(v["id"]) in datos["votos"]:
            hechas[v["periodo"]] += 1
    totales = {p: sum(1 for v in votaciones if v["periodo"] == p) for p in PERIODO_ID}
    datos["generado"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    datos["fuente"] = f"{BASE}/votacion/legisladores/"
    datos["corte"] = {
        "periodos": [{"periodo": p, "votaciones": totales[p], "leidas": hechas[p]} for p in PERIODO_ID],
        "nota": (
            "El voto de cada diputado en las votaciones del pleno de votaciones.json que ya se leyeron "
            "del SIL. Una votación cerrada no cambia; la lectura es incremental."
        ),
    }
    orden = {k: datos[k] for k in ("generado", "fuente", "corte", "periodos", "votos")}
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    tmp = SALIDA.with_suffix(".tmp")
    tmp.write_text(json.dumps(orden, ensure_ascii=False, separators=(",", ":")))
    tmp.replace(SALIDA)


def incorporar(datos: dict, v: dict, filas: list, total: int) -> None:
    per = datos["periodos"].setdefault(v["periodo"], {"legisladores": [], "partidos": []})
    indice = {fila[0]: i for i, fila in enumerate(per["legisladores"])}
    partidos = {s: i for i, s in enumerate(per["partidos"])}
    for lid, nombre, _, siglas in filas:
        if lid not in indice:
            indice[lid] = len(per["legisladores"])
            per["legisladores"].append([lid, *nombre])
        if siglas and siglas not in partidos:
            if len(per["partidos"]) >= len(DIGITOS):
                raise RuntimeError("más bancadas que dígitos")
            partidos[siglas] = len(per["partidos"])
            per["partidos"].append(siglas)
    votos, bancadas = ["-"] * len(per["legisladores"]), ["-"] * len(per["legisladores"])
    for lid, _, c, siglas in filas:
        votos[indice[lid]] = c
        if siglas:
            bancadas[indice[lid]] = DIGITOS[partidos[siglas]]
    datos["votos"][str(v["id"])] = {"p": v["periodo"], "n": total, "v": "".join(votos).rstrip("-"),
                                    "b": "".join(bancadas).rstrip("-")}


def pedir_objeto(ruta: str) -> dict | None:
    """GET de un objeto JSON (sin envoltura de página); `null` si el SIL no lo tiene."""
    global peticiones
    req = urllib.request.Request(f"{BASE}/{ruta}", headers={"User-Agent": UA, "Accept": "application/json"})
    for intento in (1, 2):
        with cerrojo:
            peticiones += 1
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                tipo = r.headers.get("content-type", "")
                cuerpo = r.read()
            if "application/json" not in tipo:
                raise Bloqueo(f"{ruta}: content-type {tipo!r}")
            time.sleep(pausa)
            return json.loads(cuerpo)
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 429, 470):
                raise Bloqueo(f"{ruta}: HTTP {e.code}") from e
            if intento == 2:
                raise RuntimeError(f"{ruta}: HTTP {e.code}") from e
        except (OSError, http.client.HTTPException, ValueError) as e:
            if intento == 2:
                raise RuntimeError(f"{ruta}: {e}") from e
        time.sleep(8)
    return None


def fichas() -> None:
    ids = set()
    if SALIDA.exists():
        for per in json.loads(SALIDA.read_text())["periodos"].values():
            ids.update(f[0] for f in per["legisladores"])
    ids.update(l["id"] for l in json.loads(CONGRESO.read_text())["legisladores"])
    salida = json.loads(FICHAS.read_text()) if FICHAS.exists() else {"legisladores": {}}
    hechas = salida["legisladores"]
    faltan = sorted(i for i in ids if str(i) not in hechas)
    print(f"{len(hechas)} fichas leídas, {len(faltan)} pendientes", file=sys.stderr)
    try:
        for n, lid in enumerate(faltan, 1):
            f = pedir_objeto(f"legislador/legislador/{lid}") or {}
            r = f.get("representacion") or {}
            partido = f.get("partido") or {}
            hechas[str(lid)] = {
                "nombres": limpiar(f.get("nombres")) or None,
                "apellidos": limpiar(f.get("apellidos")) or None,
                "funcion": limpiar(r.get("funcion")) or None,
                "nivel": limpiar(r.get("nivelRepresentacion")) or None,
                "provincia": limpiar(r.get("provincia")) or None,
                "circunscripcion": (limpiar(r.get("circunscripcion")) or None)
                if limpiar(r.get("circunscripcion")).lower() != "no aplica" else None,
                "periodo": limpiar(r.get("periodo")) or None,
                "inicio": (r.get("inicio") or "")[:10] or None,
                "fin": (r.get("fin") or "")[:10] or None,
                "ejercicio": limpiar(r.get("ejercicio")) or None,
                "partido": limpiar(partido.get("siglas")) or None,
                "partidoNombre": limpiar(partido.get("nombre")) or None,
            }
            if n % 50 == 0:
                print(f"{n}/{len(faltan)}", file=sys.stderr, flush=True)
    except Bloqueo as e:
        print(f"BLOQUEO: {e}. Se para; se declara en /fuentes, no se rodea.", file=sys.stderr)
    salida["generado"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    salida["fuente"] = f"{BASE}/legislador/legislador/"
    salida = {"generado": salida["generado"], "fuente": salida["fuente"], "legisladores": dict(sorted(hechas.items(), key=lambda kv: int(kv[0])))}
    FICHAS.parent.mkdir(parents=True, exist_ok=True)
    FICHAS.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(hechas)} fichas → {FICHAS.relative_to(RAIZ)}", file=sys.stderr)


def main() -> None:
    global pausa
    args = sys.argv[1:]
    def opcion(nombre, defecto):
        return args[args.index(nombre) + 1] if nombre in args else defecto
    pausa = float(opcion("--pausa", pausa))
    # `--salida RUTA`: escribir en otro archivo (que sigue desde él si existe), para leer sin tocar el de
    # datos/votos/ mientras otra cosa lo usa; se copia encima al terminar.
    global SALIDA
    if "--salida" in args:
        SALIDA = pathlib.Path(opcion("--salida", None)).resolve()
    hilos = int(opcion("--hilos", 3))
    maximo = int(opcion("--max", 10**9))
    solo = opcion("--periodo", None)
    if "--fichas" in args:
        fichas()
        return

    votaciones = json.loads(VOTACIONES.read_text())["votaciones"]
    datos = leer()
    pendientes = [v for v in votaciones if str(v["id"]) not in datos["votos"] and (not solo or v["periodo"] == solo)]
    # De la más reciente a la más antigua: el período vigente primero.
    pendientes.sort(key=lambda v: (v["periodo"] != "2024-2028", -v["id"]))
    print(f"{len(datos['votos'])} votaciones ya leídas, {len(pendientes)} pendientes", file=sys.stderr)
    if "--contar" in args:
        return
    pendientes = pendientes[:maximo]
    inicio, hechas = time.time(), 0
    try:
        with ThreadPoolExecutor(max_workers=hilos) as ex:
            futuros = {ex.submit(nominal_de, v["id"], PERIODO_ID[v["periodo"]]): v for v in pendientes}
            for fut in as_completed(futuros):
                v = futuros[fut]
                try:
                    filas, total = fut.result()
                except Repetidas as e:
                    print(f"se pide de nuevo en la próxima corrida: {e}", file=sys.stderr, flush=True)
                    continue
                incorporar(datos, v, filas, total)
                hechas += 1
                if hechas % 50 == 0:
                    escribir(datos, votaciones)
                    t = time.time() - inicio
                    print(f"{hechas}/{len(pendientes)} · {peticiones} peticiones · {t:.0f} s · "
                          f"{peticiones / max(t, 1):.1f} pet/s", file=sys.stderr, flush=True)
    except Bloqueo as e:
        print(f"BLOQUEO: {e}. Se para; se declara en /fuentes, no se rodea.", file=sys.stderr)
        escribir(datos, votaciones)
        sys.exit(2)
    except BaseException:
        escribir(datos, votaciones)
        raise
    escribir(datos, votaciones)
    print(f"{hechas} votaciones leídas, {peticiones} peticiones, {time.time() - inicio:.0f} s → "
          f"{SALIDA} ({SALIDA.stat().st_size / 1e6:.2f} MB)", file=sys.stderr)


if __name__ == "__main__":
    main()
