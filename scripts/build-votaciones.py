#!/usr/bin/env python3
"""Genera public/data/votaciones.json: todas las votaciones del pleno de la
Cámara de Diputados que el SIL registra en sus dos períodos, con lo que se
sometió, su resultado, las iniciativas sobre las que se votó y, si se pide, el voto de
cada diputado, para que el grafo haga de cada votación un nodo
(docs/INFRAESTRUCTURA.md §5.5, §7.4).

Fuente: la API interna del portal SIL Ciudadano,
`https://www.diputadosrd.gob.do/sil/api`. Solo GET, User-Agent identificable,
en serie y con pausa de cortesía. `robots.txt` responde 404 (sin reglas).

Mecánica verificada el 2026-10-20, leída del bundle del propio portal
(`/sil/Script/Bundles`, servicio de sesiones):

- **Sesiones**: `sesion/sesiones?page=N&keyword=&periodoId=P`, envoltorio
  `{page,pageSize,total,results}` con `pageSize` fijo en 10, de la más
  reciente a la más antigua. Sin `periodoId` responde el período vigente
  (2024-2028, id 2761: 206 sesiones); con `periodoId=2760`, 2020-2024 (377).
  `keyword` filtra por número de sesión y no alcanza otro período. El
  `periodoId` lo añade el portal a **toda** petición, y hace falta en cada una:
  sin él, las votaciones de una sesión de 2020-2024 responden 0.
- **Votaciones de una sesión**: `sesion/votaciones?page=N&id={sesionId}`: cada
  una con `id`, `titulo` («Sesión 014, Votación 001»), `mocion`, `fecha`,
  `votos{cantidadVotosSi, cantidadVotosNo, cantidadVotosAbastencion}` y
  `asistencias{cantidadDelegados, cantidadPresentes}`.
- **Iniciativas de una votación**: `votacion/iniciativas/?page=N&id={id}`
  (a veces un grupo de diez resoluciones).
- **Voto nominal** (`--nominal`): `votacion/legisladores/?page=N&id={id}`,
  diez filas por página (ni `pageSize` ni `limit` lo cambian): 19 páginas
  por votación. Cada fila, el diputado (`legisladorId`, nombre, partido de
  su bancada en esa votación) y su voto (`votoId` `SI`, `NO`, `AU`, `SV`).

Un `200` con HTML es un fallo de ruta: se valida el `content-type` y la
envoltura en cada respuesta. Se niega a escribir si un período queda por
debajo del 98 % de sus sesiones declaradas, si un período tiene sesiones y
ninguna votación, o una sesión sin todas sus votaciones, o una votación sin
todas sus iniciativas.

Uso:
    python3 scripts/build-votaciones.py --contar     # solo sesiones y votaciones, sin escribir
    python3 scripts/build-votaciones.py              # votaciones e iniciativas
    python3 scripts/build-votaciones.py --nominal    # además, el voto de cada diputado
    python3 scripts/build-votaciones.py --cache RUTA # guarda lo leído y, si se corta, sigue de ahí
    python3 scripts/build-votaciones.py --pausa S    # otra pausa entre peticiones (0.4 s por omisión)

`--cache` guarda en RUTA (fuera del repositorio) el listado de sesiones y
votaciones y, cada 200 votaciones y al fallar, sus iniciativas: un corte a mitad de la
lectura —son unas 9 mil peticiones, más de una hora— no obliga a empezar de
nuevo. Lo guardado se reusa tal cual: para un corte nuevo, se borra el archivo.
"""
import datetime
import http.client
import json
import pathlib
import re
import sys
import time
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "data" / "votaciones.json"

BASE = "https://www.diputadosrd.gob.do/sil/api"
UA = "Socratico-Inteligencia/1.0 (votaciones del pleno; herramienta independiente)"
PAUSA = 0.4
TIMEOUT = 40
POR_PAGINA = 10

peticiones = 0


def pedir(ruta: str):
    """GET JSON al SIL con un reintento; lanza si no es JSON con su envoltura."""
    global peticiones
    url = f"{BASE}/{ruta}"
    for intento in (1, 2):
        peticiones += 1
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                tipo = r.headers.get("content-type", "")
                cuerpo = r.read()
            if "application/json" not in tipo:
                raise ValueError(f"content-type {tipo!r}")
            datos = json.loads(cuerpo)
            if "page=" in ruta and not (isinstance(datos, dict) and isinstance(datos.get("results"), list)):
                raise ValueError("sin envoltura {results}")
            time.sleep(PAUSA)
            return datos
        # OSError cubre URLError, el timeout y el socket que el servidor corta a mitad de lectura.
        except (OSError, http.client.HTTPException, ValueError) as e:
            if intento == 2:
                raise RuntimeError(f"{ruta}: {e}") from e
            time.sleep(8)


def paginas(ruta: str) -> tuple[list[dict], int]:
    """Todas las filas de un listado paginado del SIL, y el total que declara."""
    filas, pagina, total = [], 1, None
    while True:
        p = pedir(f"{ruta}&page={pagina}" if "?" in ruta else f"{ruta}?page={pagina}")
        total = p["total"]
        filas.extend(p["results"])
        if not p["results"] or pagina * POR_PAGINA >= total:
            return filas, total
        pagina += 1


def limpiar(valor) -> str:
    """`limpiarTexto` de lib/congreso.ts: colapsa espacios y recorta."""
    return re.sub(r"\s+", " ", valor or "").strip()


def fecha(valor) -> str | None:
    return valor[:10] if valor else None


def mocion(valor) -> str:
    """`normalizarVotacion` de lib/congreso.ts: sin el paréntesis de continuidad del acta."""
    return limpiar(re.sub(r"^\s*\(Se contin[úu]a[^)]*\)\s*", "", valor or "", flags=re.I))


PERIODOS = [("2020-2024", 2760), ("2024-2028", 2761)]


def sesiones_de(periodo_id: int) -> tuple[list[dict], int]:
    """Las sesiones de un período, una vez cada una: si el SIL agrega una mientras se pagina, la
    página siguiente repite la última de la anterior."""
    filas, total = paginas(f"sesion/sesiones?keyword=&periodoId={periodo_id}")
    unicas = {}
    for f in filas:
        unicas.setdefault(f["sesionId"], f)
    return list(unicas.values()), total


def votaciones_de(sesion: dict, periodo_id: int) -> list[dict]:
    filas, total = paginas(f"sesion/votaciones?id={sesion['sesionId']}&periodoId={periodo_id}")
    if len(filas) < total:
        raise RuntimeError(f"sesión {sesion['numeroSesion']}: {len(filas)} de {total} votaciones")
    salida = []
    for v in filas:
        votos = v.get("votos") or {}
        asist = v.get("asistencias") or {}
        salida.append(
            {
                "id": v["id"],
                "titulo": limpiar(v.get("titulo")),
                "mocion": mocion(v.get("mocion")),
                "fecha": fecha(v.get("fecha")),
                "si": votos.get("cantidadVotosSi", 0),
                "no": votos.get("cantidadVotosNo", 0),
                "abstencion": votos.get("cantidadVotosAbastencion", 0),
                "presentes": asist.get("cantidadPresentes"),
                "miembros": asist.get("cantidadDelegados"),
            }
        )
    return salida


def iniciativas_de(votacion_id: int, periodo_id: int) -> list[int]:
    filas, total = paginas(f"votacion/iniciativas/?id={votacion_id}&periodoId={periodo_id}")
    if len(filas) < total:
        raise RuntimeError(f"votación {votacion_id}: {len(filas)} de {total} iniciativas")
    return sorted({f["iniciativaId"] for f in filas if f.get("iniciativaId")})


CODIGOS = {"SI": "s", "NO": "n", "AU": "a", "SV": "v"}


def nominal_de(votacion_id: int, periodo_id: int) -> dict[str, str]:
    """El voto de cada diputado: `legisladorId → s|n|a|v|b|o` (sí, no, ausente, sin voto, abstención, otro)."""
    filas, total = paginas(f"votacion/legisladores/?id={votacion_id}&periodoId={periodo_id}")
    if len(filas) < total:
        raise RuntimeError(f"votación {votacion_id}: {len(filas)} de {total} votos")
    salida = {}
    for f in filas:
        leg = (f.get("legislador") or {}).get("legisladorId")
        if not leg:
            continue
        codigo = limpiar(f.get("votoId")).upper()
        texto = limpiar(f.get("voto")).lower()
        salida[str(leg)] = CODIGOS.get(codigo) or ("b" if codigo.startswith("AB") or texto.startswith("absten") else "o")
    return salida


def leer_cache(ruta: pathlib.Path | None) -> dict:
    if ruta and ruta.exists():
        return json.loads(ruta.read_text())
    return {}


def guardar_cache(ruta: pathlib.Path | None, datos: dict) -> None:
    if not ruta:
        return
    tmp = ruta.with_suffix(".tmp")
    tmp.write_text(json.dumps(datos, ensure_ascii=False))
    tmp.replace(ruta)


def listar() -> tuple[list[dict], list[dict]]:
    """Las sesiones de los dos períodos y sus votaciones, con el censo de cada período."""
    votaciones, censo = [], []
    for nombre, pid in PERIODOS:
        sesiones, total = sesiones_de(pid)
        if len(sesiones) < 0.98 * total:
            sys.exit(f"{nombre}: {len(sesiones)} de {total} sesiones, no se escribe.")
        n_votos = 0
        for s in sesiones:
            for v in votaciones_de(s, pid):
                v["sesion"] = limpiar(s.get("numeroSesion"))
                v["legislatura"] = limpiar(s.get("legislatura"))
                v["periodo"] = nombre
                v["_pid"] = pid
                votaciones.append(v)
                n_votos += 1
        if sesiones and n_votos == 0:
            sys.exit(f"{nombre}: {len(sesiones)} sesiones y ninguna votación, no se escribe.")
        censo.append({"periodo": nombre, "periodoId": pid, "sesiones": len(sesiones), "votaciones": n_votos})
        print(f"{nombre}: {len(sesiones)} sesiones, {n_votos} votaciones · {peticiones} peticiones", file=sys.stderr)
    return votaciones, censo


def main() -> None:
    contar = "--contar" in sys.argv
    nominal = "--nominal" in sys.argv
    ruta_cache = pathlib.Path(sys.argv[sys.argv.index("--cache") + 1]) if "--cache" in sys.argv else None
    global PAUSA
    if "--pausa" in sys.argv:
        PAUSA = float(sys.argv[sys.argv.index("--pausa") + 1])
    inicio = time.time()
    cache = leer_cache(ruta_cache)
    if "votaciones" in cache:
        votaciones, censo = cache["votaciones"], cache["censo"]
        print(f"del cache: {len(votaciones)} votaciones listadas", file=sys.stderr)
    else:
        votaciones, censo = listar()
        cache = {"votaciones": votaciones, "censo": censo, "iniciativas": {}, "nominal": {}}
        guardar_cache(ruta_cache, cache)
    if contar:
        print(json.dumps(censo, ensure_ascii=False), f"{peticiones} peticiones, {time.time() - inicio:.0f} s")
        return
    vistas = set()
    hechas_ini, hechas_nom = cache.setdefault("iniciativas", {}), cache.setdefault("nominal", {})
    try:
        for i, v in enumerate(votaciones):
            if v["id"] in vistas:
                sys.exit(f"la votación {v['id']} sale en dos sesiones")
            vistas.add(v["id"])
            k, pid = str(v["id"]), v["_pid"]
            if k not in hechas_ini:
                hechas_ini[k] = iniciativas_de(v["id"], pid)
            if nominal and k not in hechas_nom:
                hechas_nom[k] = nominal_de(v["id"], pid)
            if i % 200 == 0:
                guardar_cache(ruta_cache, cache)
                print(f"{i}/{len(votaciones)} · {peticiones} peticiones · {time.time() - inicio:.0f} s", file=sys.stderr)
    finally:
        # Lo leído no se pierde si una petición falla dos veces: la próxima corrida sigue desde aquí.
        guardar_cache(ruta_cache, cache)
    filas = []
    for v in votaciones:
        f = {c: x for c, x in v.items() if c != "_pid"}
        f["iniciativas"] = hechas_ini[str(v["id"])]
        if nominal:
            f["nominal"] = hechas_nom[str(v["id"])]
        filas.append(f)
    votaciones = filas
    salida = {
        "generado": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fuente": f"{BASE}/sesion/votaciones",
        "corte": {
            "periodos": censo,
            "nominal": nominal,
            "nota": (
                "Las votaciones del pleno de la Cámara de Diputados que el SIL registra en las sesiones de "
                "2020-2024 y 2024-2028. El Senado vota en su propio sistema y no entra."
            ),
        },
        "votaciones": sorted(votaciones, key=lambda v: v["id"]),
    }
    SALIDA.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")))
    print(
        f"{len(votaciones)} votaciones, {SALIDA.stat().st_size / 1e6:.2f} MB, {peticiones} peticiones, "
        f"{time.time() - inicio:.0f} s → {SALIDA.relative_to(RAIZ)}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
