#!/usr/bin/env python3
"""Genera public/data/documentos/: un índice de los documentos (PDF, hojas de
cálculo, Word) que publican las instituciones del Estado en sus sitios
WordPress.

Mecánica verificada en docs/AUDITORIA.md §G.2 (2026-09-24): el endpoint
público de lectura de WordPress

    GET https://<host>/wp-json/wp/v2/media?media_type=application
        &per_page=100&page=N&_fields=id,date,title,source_url,mime_type

responde JSON sin clave, con `X-WP-Total` y `X-WP-TotalPages`. Dos trampas
verificadas:

- `X-WP-Total` **sobrestima**: WordPress cuenta en SQL y después descarta los
  adjuntos cuyo padre no es público. Una página puede venir vacía (`[]`) y la
  siguiente no. Se recorre hasta `X-WP-TotalPages` (tope 250 por host) y se
  cuenta lo que de verdad vino; el total anunciado se guarda aparte y nunca se
  muestra como cobertura.
- El título es el que puso la institución —a menudo el nombre del archivo— y
  `date` es la fecha de **subida**, no la del documento.

Higiene: `robots.txt` primero, en cada corrida (si veta `/wp-json` o las URL
con `?`, el host se salta y se anota); UA identificable; GET; un segundo entre
peticiones al mismo host; hosts en paralelo; un reintento; `content-type`
validado. Un 401/403 no se reintenta ni se rodea: se anota como bloqueado.

No se copia ningún archivo: el índice guarda título, fecha, tipo y la URL
original, y la plataforma enlaza a ella. Las declaraciones juradas de
patrimonio que algunas instituciones publican por mandato de la Ley 311-14
**se excluyen por título** (`DECLARACION`) hasta que el dueño decida si un
índice buscable por nombre de funcionario cabe en la Ley 172-13: el documento sigue en el sitio de la institución.

Uso:
    python3 scripts/build-documentos.py
"""
import concurrent.futures
import datetime
import html
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "data" / "documentos"
UA = "Socratico-Inteligencia/1.0 (indice de documentos publicos; herramienta independiente)"
TOPE_PAGINAS = 250
PAUSA = 1.0

# host → (institución, unidad de compra de su ficha o None). Verificados en
# AUDITORIA §G.2; `minpre` queda fuera por su robots (`Disallow: /*?`) y los
# de REST cerrada (sns, map, miderec) o WAF (agricultura, infotep, one) no se
# intentan: su vía es institucional.
HOSTS: dict[str, tuple[str, int | None]] = {
    "www.hacienda.gob.do": ("Ministerio de Hacienda y Economía", 4),
    "digepres.gob.do": ("Dirección General de Presupuesto", 217),
    "ogtic.gob.do": ("Oficina Gubernamental de Tecnologías de la Información y Comunicación", 703),
    "intrant.gob.do": ("Instituto Nacional de Tránsito y Transporte Terrestre", 249),
    "mirex.gob.do": ("Ministerio de Relaciones Exteriores", 1),
    "ambiente.gob.do": ("Ministerio de Medio Ambiente y Recursos Naturales", 260),
    "mivhed.gob.do": ("Ministerio de la Vivienda, Hábitat y Edificaciones", 1154),
    "dgcp.gob.do": ("Dirección General de Contrataciones Públicas", 7),
    "mescyt.gob.do": ("Ministerio de Educación Superior, Ciencia y Tecnología", 264),
    "proconsumidor.gob.do": ("Pro Consumidor", 636),
    "mepyd.gob.do": ("Ministerio de Economía, Planificación y Desarrollo", 131),
    "mt.gob.do": ("Ministerio de Trabajo", 245),
    "juventud.gob.do": ("Ministerio de la Juventud", 3),
    "www.sisalril.gob.do": ("Superintendencia de Salud y Riesgos Laborales", 591),
    "www.transparenciafiscal.gob.do": ("Portal de Transparencia Fiscal", None),
    "tss.gob.do": ("Tesorería de la Seguridad Social", 545),
    "mem.gob.do": ("Ministerio de Energía y Minas", 916),
    "digeig.gob.do": ("Dirección General de Ética e Integridad Gubernamental", 720),
    "contraloria.gob.do": ("Contraloría General de la República", 139),
    "cultura.gob.do": ("Ministerio de Cultura", 259),
    "indotel.gob.do": ("Instituto Dominicano de las Telecomunicaciones", 548),
    "mip.gob.do": ("Ministerio de Interior y Policía", 141),
    "inapa.gob.do": ("Instituto Nacional de Aguas Potables y Alcantarillados", 635),
}

TIPOS = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
}
PRUEBA = re.compile(r"^(documento de )?prueba\b|^test\b", re.I)
DECLARACION = re.compile(r"declaraci[oó]n(es)?[\s_-]*jurada|\bDJP\b", re.I)


def pedir(url: str, tipo: str) -> tuple[int, dict, bytes]:
    for intento in (1, 2):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=25) as r:
                ct = r.headers.get("content-type", "")
                if tipo not in ct:
                    raise RuntimeError(f"content-type inesperado «{ct}»")
                return r.status, dict(r.headers), r.read()
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 404, 429, 470):
                return e.code, dict(e.headers or {}), b""  # postura del origen: no se insiste
            if intento == 2:
                raise
        except Exception:  # noqa: BLE001 — un reintento y fuera
            if intento == 2:
                raise
        time.sleep(5)
    raise AssertionError


def robots_permite(host: str, muestra: str = "/wp-json/wp/v2/media?media_type=application") -> tuple[bool, str]:
    """Reglas del grupo `User-agent: *` (varias líneas User-agent seguidas
    forman un solo grupo; `Allow` más largo gana a `Disallow`) contra la ruta
    que de verdad se va a leer (`muestra`). Un 404 es «sin reglas»; un robots
    que no se pudo leer por otra causa salta el host."""
    try:
        estado, _, cuerpo = pedir(f"https://{host}/robots.txt", "text/")
    except Exception as e:  # noqa: BLE001
        return False, f"robots ilegible ({e})"
    if estado == 404:
        return True, "sin robots"
    if estado != 200:
        return False, f"robots {estado}"
    reglas: list[tuple[str, str]] = []
    agentes: list[str] = []
    en_reglas = False
    for linea in cuerpo.decode("utf-8", "replace").splitlines():
        linea = linea.split("#")[0].strip()
        if ":" not in linea:
            continue
        k, v = (x.strip() for x in linea.split(":", 1))
        k = k.lower()
        if k == "user-agent":
            if en_reglas:
                agentes, en_reglas = [], False
            agentes.append(v)
        elif k in ("allow", "disallow"):
            en_reglas = True
            if "*" in agentes and v:
                reglas.append((k, v))
    def casa(r: str) -> int:
        patron = "^" + re.escape(r).replace(r"\*", ".*").replace(r"\$", "$")
        return len(r) if re.match(patron, muestra) else -1

    mejor_allow = max((casa(v) for k, v in reglas if k == "allow"), default=-1)
    peor = max(((casa(v), v) for k, v in reglas if k == "disallow"), default=(-1, ""))
    if peor[0] >= 0 and peor[0] > mejor_allow:
        return False, f"robots veta «{peor[1]}»"
    return True, "robots permite"


def barrer(host: str) -> dict:
    nombre, uc = HOSTS[host]
    salida = {"host": host, "nombre": nombre, "uc": uc, "estado": "ok", "nota": "",
              "anunciados": 0, "paginas": 0, "docs": []}
    ok, nota = robots_permite(host)
    salida["nota"] = nota
    if not ok:
        salida["estado"] = "robots"
        return salida
    vistos = set()
    pagina, total_paginas = 1, 1
    while pagina <= min(total_paginas, TOPE_PAGINAS):
        time.sleep(PAUSA)
        url = (f"https://{host}/wp-json/wp/v2/media?media_type=application&per_page=100"
               f"&page={pagina}&orderby=date&order=desc&_fields=id,date,title,source_url,mime_type")
        try:
            estado, cab, cuerpo = pedir(url, "application/json")
        except Exception as e:  # noqa: BLE001
            salida["estado"] = "error"
            salida["nota"] = f"página {pagina}: {e}"
            break
        if estado != 200:
            if pagina == 1:
                salida["estado"] = "bloqueado"
                salida["nota"] = f"HTTP {estado}"
            break
        cab = {k.lower(): v for k, v in cab.items()}
        if pagina == 1:
            salida["anunciados"] = int(cab.get("x-wp-total", "0") or 0)
            total_paginas = int(cab.get("x-wp-totalpages", "1") or 1)
        salida["paginas"] = pagina
        for m in json.loads(cuerpo or b"[]"):
            tipo = TIPOS.get(m.get("mime_type", ""))
            url_doc = m.get("source_url") or ""
            if not tipo or not url_doc.startswith("http") or url_doc in vistos:
                continue
            titulo = html.unescape(re.sub(r"<[^>]+>", "", (m.get("title") or {}).get("rendered", ""))).strip()
            titulo = re.sub(r"\s+", " ", titulo) or url_doc.rsplit("/", 1)[-1]
            if PRUEBA.search(titulo) or DECLARACION.search(titulo) or DECLARACION.search(url_doc):
                continue
            vistos.add(url_doc)
            salida["docs"].append([titulo[:240], (m.get("date") or "")[:10], tipo, url_doc])
        pagina += 1
    if total_paginas > TOPE_PAGINAS:
        salida["nota"] += f"; recortado a {TOPE_PAGINAS} de {total_paginas} páginas"
    print(f"  {host}: {len(salida['docs'])} de {salida['anunciados']} anunciados "
          f"({salida['paginas']} págs., {salida['estado']})", file=sys.stderr)
    return salida


def main() -> None:
    SALIDA.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        resultados = list(ex.map(barrer, HOSTS))
    total = sum(len(r["docs"]) for r in resultados)
    if total < 2000:
        sys.exit(f"Solo {total} documentos: algo falló, no se escribe.")
    generado = datetime.date.today().isoformat()
    for r in resultados:
        r["docs"].sort(key=lambda d: d[1], reverse=True)
    indice = {
        "generado": generado,
        "total": total,
        "fuentes": [
            {k: r[k] for k in ("host", "nombre", "uc", "estado", "nota", "anunciados", "paginas")}
            | {"documentos": len(r["docs"])}
            for r in sorted(resultados, key=lambda r: -len(r["docs"]))
        ],
    }
    (SALIDA / "indice.json").write_text(json.dumps(indice, ensure_ascii=False, separators=(",", ":")))
    # Un solo archivo de filas: [título, fecha, tipo, url, índice de fuente].
    orden = [f["host"] for f in indice["fuentes"]]
    filas = []
    for r in resultados:
        i = orden.index(r["host"])
        filas.extend(d + [i] for d in r["docs"])
    filas.sort(key=lambda d: d[1], reverse=True)
    (SALIDA / "filas.json").write_text(
        json.dumps({"generado": generado, "hosts": orden, "filas": filas},
                   ensure_ascii=False, separators=(",", ":")))
    print(f"{total} documentos de {sum(1 for r in resultados if r['docs'])} instituciones", file=sys.stderr)


if __name__ == "__main__":
    main()
