#!/usr/bin/env python3
"""Genera public/data/congreso.json: los legisladores con ficha en la
plataforma y todas las iniciativas que expone el SIL de la Cámara de
Diputados en sus dos períodos, para que el buscador (`/buscar`) encuentre
legisladores e iniciativas sin tocar el SIL en cada consulta.

Fuente: la API interna del portal SIL Ciudadano,
`https://www.diputadosrd.gob.do/sil/api` (docs/RECON.md §2, §6 y §14). Solo
GET, User-Agent identificable, en serie y con pausa de cortesía.

Mecánica verificada el 2026-09-27:

- **Iniciativas**: `iniciativa/getIniciativas?page=N&keyword=&periodoId=P`,
  envoltorio `{page,pageSize,total,results}` con `pageSize` fijo en 10, de la
  pieza más reciente a la más antigua. El `periodoId` es el parámetro que el
  interceptor HTTP del propio portal añade a **toda** petición (lo pone el
  selector de período de su cabecera; leído del bundle
  `/sil/Script/Bundles`). Sin él, el SIL responde el período vigente.
  `periodolegislativo/all` expone solo dos: `2020-2024` (id 2760) y
  `2024-2028` (id 2761, vigente). Censos del 2026-09-27: 2024-2028 → 6 357;
  2020-2024 → 11 500. Una pieza del período anterior abre en su ficha
  (`iniciativa/iniciativa/{id}` responde igual, sin `periodoId`), así que
  `/congreso/{id}` sirve para las dos.
- El listado **no** trae proponentes: el principal cuesta una petición por
  pieza (`iniciativa/proponentes`), y no se pide.
- **Legisladores**: `legislador/Provincias/1` (32 provincias) más las
  demarcaciones nacional (2892) y exterior (3403), y por cada una
  `legislador/legisladores?page=N&nivel={demarcación}` — el mismo barrido que
  `getDirectorioLegisladores` en `lib/congreso.ts` (~41 peticiones). Solo se
  guardan quienes tienen función de diputado o senador: son los que la
  plataforma enlaza a `/congreso/legisladores/{id}` (RECON §14.3).
- Un `200` con HTML es un fallo de ruta (RECON §2.1): se valida el
  `content-type` y la envoltura en cada respuesta.

Límites que declara la instantánea (`corte`):
- Cobertura = lo que el SIL de Diputados registra en 2020-2024 y 2024-2028.
  Las piezas vivas de períodos anteriores se arrastran al registro vigente con
  número nuevo (RECON §6); las que murieron antes de 2020 no están.
- Los títulos pesan ~6 MB por sí solos (media de 320 caracteres) y no se
  recortan; por eso el resto va en columnas con catálogos. El reformulado
  («TÍTULO MODIFICADO», ~1 850 piezas) va aparte, para que también se busque.
- El Senado **no** entra: su consultante lista 50 expedientes por colección y
  pagina por postback con ViewState que muta la sesión (RECON §12.2). No hay
  listado barato; su búsqueda sigue en vivo en `/congreso/senado`.

Coste: ~1 800 peticiones para las iniciativas (a ~1 s cada una con la pausa,
unos 30 minutos) más ~41 para el directorio. Se niega a escribir si un período
queda por debajo del 98 % de su `total` declarado o si el directorio no llega
a 200 personas.

Uso:
    python3 scripts/build-congreso.py
"""
import datetime
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "data" / "congreso.json"

BASE = "https://www.diputadosrd.gob.do/sil/api"
UA = "Socratico-Inteligencia/1.0 (indice del buscador legislativo; herramienta independiente)"
PAUSA = 0.4
TIMEOUT = 40

DEMARCACION_NACIONAL = 2892
DEMARCACION_EXTERIOR = 3403

peticiones = 0


def pedir(ruta: str):
    """GET JSON al SIL con un reintento; lanza si no es JSON (RECON §2.1)."""
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
        except (urllib.error.URLError, ValueError, TimeoutError, json.JSONDecodeError) as e:
            if intento == 2:
                raise RuntimeError(f"{ruta}: {e}") from e
            time.sleep(8)


def limpiar(valor) -> str:
    """`limpiarTexto` de lib/congreso.ts: colapsa espacios y recorta."""
    return re.sub(r"\s+", " ", valor or "").strip()


MARCA_MODIFICADO = re.compile(r"\bT[ÍI]TULO\s+MODIFICADO\s*:\s*", re.I)


def separar_titulo(descripcion: str) -> tuple[str, str]:
    """`separarTitulo` de lib/congreso.ts: el título reformulado va detrás
    de un marcador dentro de la misma descripción."""
    m = MARCA_MODIFICADO.search(descripcion)
    if not m:
        return descripcion, ""
    titulo = re.sub(r"[.\s]+$", "", descripcion[: m.start()].strip())
    return titulo or descripcion, descripcion[m.end():].strip()


def fecha(valor) -> str:
    v = limpiar(valor)
    return v[:10] if re.match(r"^\d{4}-\d{2}-\d{2}", v) else ""


def sin_vacios(d: dict) -> dict:
    return {k: v for k, v in d.items() if v not in (None, "")}


# ------------------------------------------------------------ legisladores


def legisladores() -> list[dict]:
    provincias = pedir("legislador/Provincias/1")
    if not isinstance(provincias, list) or len(provincias) < 30:
        raise RuntimeError("legislador/Provincias/1 no trajo las provincias")
    demarcaciones = [p["id"] for p in provincias] + [DEMARCACION_NACIONAL, DEMARCACION_EXTERIOR]
    vistos: dict[int, dict] = {}
    for dem in demarcaciones:
        pagina, total = 1, None
        while True:
            p = pedir(f"legislador/legisladores?page={pagina}&nivel={dem}")
            total = p["total"]
            for raw in p["results"]:
                funcion = limpiar(raw.get("funcion"))
                if not re.search(r"diputad|senad", funcion, re.I):
                    continue
                lid = raw["legisladorId"]
                if lid in vistos:
                    continue
                provincia = limpiar(raw.get("provincia"))
                if re.search(r"exterior", provincia, re.I):
                    provincia = "En el exterior"
                circ = limpiar(raw.get("circunscripcion"))
                if re.fullmatch(r"n/a|no aplica", circ, re.I):
                    circ = ""
                partido = raw.get("partido") or {}
                vistos[lid] = sin_vacios({
                    "id": lid,
                    "n": limpiar(raw.get("nombreCompleto"))
                    or limpiar(f"{raw.get('nombres') or ''} {raw.get('apellidos') or ''}"),
                    "c": "senado" if re.search(r"senad", funcion, re.I) else "diputados",
                    "fn": funcion,
                    "pr": provincia,
                    "ci": circ,
                    "ps": limpiar(partido.get("siglas")),
                    "pn": limpiar(partido.get("nombre")),
                })
            if pagina * 10 >= total:
                break
            pagina += 1
    return sorted(vistos.values(), key=lambda l: (l["n"].lower(), l["id"]))


# ------------------------------------------------------------ iniciativas


def periodos() -> list[dict]:
    todos = pedir("periodolegislativo/all")
    if not isinstance(todos, list) or not todos:
        raise RuntimeError("periodolegislativo/all vacío")
    return sorted(todos, key=lambda p: p["description"])


def iniciativas_de(periodo: dict) -> tuple[list[dict], int]:
    pid = periodo["id"]
    filas: dict[int, dict] = {}
    pagina, total = 1, None
    while True:
        p = pedir(f"iniciativa/getIniciativas?page={pagina}&keyword=&periodoId={pid}")
        total = p["total"]
        for raw in p["results"]:
            titulo, modificado = separar_titulo(limpiar(raw.get("descripcion")) or "(sin descripción)")
            filas[raw["id"]] = {
                "id": raw["id"],
                "nu": limpiar(raw.get("numero")),
                "ti": titulo,
                "tp": limpiar(raw.get("tipo")),
                "co": limpiar(raw.get("condicion")),
                "fd": fecha(raw.get("fechaDeposito")),
                "gr": limpiar(raw.get("grupo")),
                "np": limpiar(raw.get("numPromulgacion")),
                "tm": modificado,
            }
        if pagina % 50 == 0:
            print(f"  {periodo['description']}: página {pagina}/{-(-total // 10)}", file=sys.stderr)
        if pagina * 10 >= total or not p["results"]:
            break
        pagina += 1
    return list(filas.values()), total


CAMPOS = ["id", "numero", "titulo", "tipo", "condicion", "fechaDeposito", "grupo", "promulgacion",
          "tituloModificado"]


def compactar(inis: list[dict]) -> dict:
    """Las ~18 mil piezas en columnas: tipo, condición y tema viajan una vez
    en su catálogo y cada fila lleva el índice. Los títulos pesan ~6 MB por
    sí solos (media de 320 caracteres); todo lo demás se recorta. Las dos
    últimas columnas son opcionales: la fila acaba en la última con valor
    (7 columnas; 8 con promulgación; 9 con título modificado, y entonces la
    promulgación puede ir vacía)."""
    cat = {"tipos": [], "condiciones": [], "grupos": []}

    def idx(nombre: str, valor: str) -> int:
        lista = cat[nombre]
        if valor not in lista:
            lista.append(valor)
        return lista.index(valor)

    orden = sorted(inis, key=lambda f: (f["fd"], f["id"]), reverse=True)
    filas = []
    for f in orden:
        fila = [f["id"], f["nu"], f["ti"], idx("tipos", f["tp"]), idx("condiciones", f["co"]),
                f["fd"], idx("grupos", f["gr"])]
        if f["np"] or f["tm"]:
            fila.append(f["np"])
        if f["tm"]:
            fila.append(f["tm"])
        filas.append(fila)
    return {"campos": CAMPOS, **cat, "filas": filas}


def main() -> None:
    inicio = time.time()
    print("Directorio de legisladores…", file=sys.stderr)
    legs = legisladores()
    if len(legs) < 200:
        sys.exit(f"Directorio con {len(legs)} personas: menos de lo plausible, no se escribe.")

    todas: dict[int, dict] = {}
    censo = []
    for per in periodos():
        print(f"Iniciativas {per['description']}…", file=sys.stderr)
        filas, total = iniciativas_de(per)
        if len(filas) < 0.98 * total:
            sys.exit(f"{per['description']}: {len(filas)} de {total}, no se escribe.")
        censo.append({"periodo": per["description"], "total": total, "leidas": len(filas)})
        for f in filas:
            todas[f["id"]] = f

    salida = {
        "generado": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fuente": "SIL de la Cámara de Diputados (diputadosrd.gob.do/sil/api)",
        "corte": {
            "periodos": censo,
            "nota": (
                "Todas las iniciativas registradas en el SIL de Diputados en 2020-2024 y 2024-2028, "
                "incluidas las arrastradas desde períodos anteriores. Las que murieron antes de 2020 "
                "no están. El Senado no entra: su consultante no tiene listado completo por GET."
            ),
            "legisladores": "Diputados y senadores del período vigente, por demarcación.",
        },
        "legisladores": legs,
        "iniciativas": compactar(list(todas.values())),
    }
    SALIDA.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")))
    tam = SALIDA.stat().st_size
    print(
        f"{len(legs)} legisladores, {len(todas)} iniciativas, {tam / 1e6:.2f} MB, "
        f"{peticiones} peticiones, {time.time() - inicio:.0f} s → {SALIDA.relative_to(RAIZ)}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
