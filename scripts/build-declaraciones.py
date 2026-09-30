#!/usr/bin/env python3
"""Genera public/data/declaraciones.json: las declaraciones juradas de
patrimonio (Ley 311-14) que las propias instituciones publican en sus portales,
atadas, cuando se puede sin dudas, a la ficha de quien declara.

Decisión del dueño (2026-09-30, docs/DECISIONES.md): se enlazan. Hasta
entonces `scripts/build-documentos.py` las excluía del índice de documentos
por título; siguen fuera de él para no contarlas dos veces: viven aquí, junto
a la persona.

Mecánica verificada el 2026-09-30 (docs/AUDITORIA.md §H.12):

- El registro central es la **Consulta Pública de DJP de la Cámara de
  Cuentas** (`consultadjp.camaradecuentas.gob.do`): busca por nombre, pero el
  listado sale por POST y el documento está detrás de un CAPTCHA. No se lee;
  la ficha enlaza la consulta para que el lector la haga.
- Las instituciones publican las de sus directivos en su biblioteca
  WordPress: `GET /wp-json/wp/v2/media?search=declaracion&media_type=application`
  (la misma lectura de `build-documentos.py`, filtrada). MAPRE y la
  Vicepresidencia tienen el portal de transparencia como **otra instalación**
  de WordPress bajo `/transparencia/`.
- La Presidencia (su Dirección de Comunicación) las lista en una página HTML,
  `presidencia.gob.do/transparencia/declaraciones-juradas`, de 2012 a 2021.

No se copia ningún PDF ni se lee su contenido: se guardan el título que puso
la institución, la fecha de subida, la URL original y el nombre que se lee del
título. **La persona se ata solo si no hay duda**: todas las palabras del
nombre del título están en el suyo y, o tiene un cargo en la institución que
publica, o es la única de toda la instantánea con esas palabras (tres o más).
Lo demás se lista sin persona.

Higiene: `robots.txt` primero en cada host (el lector de
`build-documentos.py`), UA identificable, GET, un segundo entre peticiones,
un reintento, content-type validado, a lo sumo cinco páginas de 100 por host.

Uso:
    python3 scripts/build-declaraciones.py
"""
import datetime
import html
import importlib.util
import json
import pathlib
import re
import sys
import time
import unicodedata
import urllib.parse

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "data" / "declaraciones.json"
FUNCIONARIOS = RAIZ / "public" / "data" / "funcionarios.json"
UA = "Socratico-Inteligencia/1.0 (declaraciones juradas publicadas; herramienta independiente)"
TOPE_PAGINAS = 5
PRESIDENCIA = "https://presidencia.gob.do/transparencia/declaraciones-juradas"

# El lector de robots, los hosts y `pedir` del índice de documentos: una sola higiene.
_spec = importlib.util.spec_from_file_location("documentos", RAIZ / "scripts" / "build-documentos.py")
documentos = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(documentos)
documentos.UA = UA

# Base (host y, si lo hay, el prefijo de la segunda instalación) → (institución, id de su ficha).
BASES: dict[str, tuple[str, int | None]] = {
    **{h: v for h, v in documentos.HOSTS.items()},
    "mapre.gob.do/transparencia": ("Ministerio Administrativo de la Presidencia", 134),
    "vicepresidencia.gob.do/transparencia": ("Vicepresidencia de la República", 1043),
}

DECLARACION = documentos.DECLARACION
# Lo que casa con «declaración jurada» y no es la de una persona.
NO_PERSONAL = re.compile(
    r"formulario|\bley\b|decreto|circular|premio|conjunta|idoneidad|radioaficionad|t[eé]cnica|beneficiari|"
    r"instructivo|gu[ií]a|manual|modelo|plantilla|resoluci[oó]n|reglamento|listado|relaci[oó]n de|n[oó]mina|"
    r"proveedor|licitaci|compra|matriz|sujetos obligados|jurada de (?:bienes )?(?:la|el) (?:empresa|compa)", re.I)
# Palabras del título que no son el nombre de quien declara.
RUIDO = set("""
declaracion declaraciones jurada juradas patrimonio patrimonial bienes de del la las los el y e a al en
djp sr sra srta sres lic licda licdo dr dra ing arq don dona senor senora
ministro ministra viceministro viceministra director directora subdirector subdirectora directores
gobernador gobernadora provincial provincia encargado encargada administrativo administrativa financiero
financiera general ejecutivo ejecutiva ejecutivos tecnico tecnica departamento division unidad
presidente presidenta vicepresidente vicepresidenta secretario secretaria consultor consultora juridico
juridica contralor contralora tesorero tesorera gerente asesor asesora coordinador coordinadora
inicial final cese actualizacion rectificativa extracto pdf copia firmada version rev ex nueva
vice funciones funcionario funcionaria
digeig mip mivhed ogtic intrant mapre minpre dicom diecom
""".split())
# Un cargo después del nombre lo termina: «ANA CORTES GOBERNADORA PROVINCIA DUARTE».
FIN_NOMBRE = set("""
gobernador gobernadora viceministro viceministra ministro ministra director directora subdirector
subdirectora encargado encargada provincia presidente presidenta vicepresidente vicepresidenta gerente
asesor asesora coordinador coordinadora al cese
""".split())


def plano(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9ñ]+", " ", s).strip()


def nombre_del_titulo(titulo: str, url: str) -> str | None:
    """«Declaración Jurada de Patrimonio Milagros Ortiz Bosch, directora
    general DIGEIG» → «milagros ortiz bosch». Si el título es un nombre de
    archivo, se lee igual. Lo que va tras una coma o un paréntesis, o tras el
    primer cargo que sigue al nombre, no es el nombre. `None` si no quedan al
    menos dos palabras."""
    base = titulo if re.search(r"[a-záéíóúñ]{3}", titulo, re.I) else urllib.parse.unquote(url.rsplit("/", 1)[-1])
    base = re.sub(r"\.(pdf|docx?)(\?.*)?$", "", base, flags=re.I)
    base = re.split(r"[,(]", base)[0]
    nombre: list[str] = []
    for p in plano(base.replace("_", " ").replace("-", " ")).split():
        if p in FIN_NOMBRE and nombre:
            break
        if p in RUIDO or p in FIN_NOMBRE or re.fullmatch(r"\d+|[a-z]", p):
            continue
        nombre.append(p)
    return " ".join(nombre) if len(nombre) >= 2 else None


def buscar_wp(base: str) -> tuple[list[dict], str, str]:
    """Las declaraciones de una biblioteca WordPress (con su prefijo, si es una
    segunda instalación). Devuelve (filas, estado, nota)."""
    host, _, prefijo = base.partition("/")
    ok, nota = documentos.robots_permite(host, f"/{prefijo + '/' if prefijo else ''}wp-json/wp/v2/media?search=declaracion")
    if not ok:
        return [], "robots", nota
    filas, vistos = [], set()
    pagina, total_paginas = 1, 1
    while pagina <= min(total_paginas, TOPE_PAGINAS):
        time.sleep(documentos.PAUSA)
        url = (f"https://{base}/wp-json/wp/v2/media?search=declaracion&media_type=application&per_page=100"
               f"&page={pagina}&_fields=id,date,title,source_url,mime_type")
        try:
            estado, cab, cuerpo = documentos.pedir(url, "application/json")
        except Exception as e:  # noqa: BLE001 — un host caído no tumba la instantánea
            return filas, "error", f"página {pagina}: {e}"
        if estado != 200:
            return filas, ("bloqueado" if pagina == 1 else "ok"), f"HTTP {estado}"
        cab = {k.lower(): v for k, v in cab.items()}
        if pagina == 1:
            total_paginas = int(cab.get("x-wp-totalpages", "1") or 1)
        for m in json.loads(cuerpo or b"[]"):
            fuente = m.get("source_url") or ""
            if fuente.startswith("/"):
                fuente = f"https://{host}{fuente}"
            if not fuente.startswith("http") or fuente in vistos:
                continue
            titulo = html.unescape(re.sub(r"<[^>]+>", "", (m.get("title") or {}).get("rendered", ""))).strip()
            titulo = re.sub(r"\s+", " ", titulo) or fuente.rsplit("/", 1)[-1]
            if not (DECLARACION.search(titulo) or DECLARACION.search(fuente)) or NO_PERSONAL.search(titulo):
                continue
            vistos.add(fuente)
            filas.append({"t": titulo[:240], "f": (m.get("date") or "")[:10] or None, "u": fuente})
        pagina += 1
    return filas, "ok", nota


def buscar_presidencia() -> tuple[list[dict], str, str]:
    """La página de declaraciones de la Presidencia: un acordeón por año
    (`<dt>`), y dentro, el nombre y el cargo de cada quien (`<h5>`) seguidos de
    sus enlaces (el decreto que lo nombró y su declaración). El título de cada
    fila junta el texto del enlace con ese nombre y ese cargo."""
    ok, nota = documentos.robots_permite("presidencia.gob.do", "/transparencia/declaraciones-juradas")
    if not ok:
        return [], "robots", nota
    try:
        estado, _, cuerpo = documentos.pedir(PRESIDENCIA, "text/html")
    except Exception as e:  # noqa: BLE001
        return [], "error", str(e)
    if estado != 200:
        return [], "bloqueado", f"HTTP {estado}"
    def plano_html(t: str) -> str:
        return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t))).strip()

    filas, vistos, quien = [], set(), ""
    pieza = re.compile(r'<h5[^>]*>(.*?)</h5>|<a[^>]+href="([^"]+\.pdf[^"]*)"[^>]*>(.*?)</a>', re.S | re.I)
    for m in pieza.finditer(cuerpo.decode("utf-8", "replace")):
        if m.group(1) is not None:
            quien = plano_html(m.group(1))
            continue
        url = urllib.parse.urljoin(PRESIDENCIA, html.unescape(m.group(2)))
        if "declaraciones-juradas" not in url or url in vistos:
            continue
        vistos.add(url)
        texto = plano_html(m.group(3))
        if NO_PERSONAL.search(texto):
            continue  # el decreto de nombramiento que la página pone al lado
        archivo = urllib.parse.unquote(url.rsplit("/", 1)[-1].split("?")[0])
        titulo = f"{texto or archivo} · {quien}" if quien else (texto or archivo)
        # El nombre, del encabezado sin el cargo entre paréntesis; si no, del archivo.
        filas.append({"t": titulo[:240], "f": None, "u": url, "archivo": quien.split("(")[0] or archivo})
    return filas, "ok", nota


def main() -> None:
    func = json.loads(FUNCIONARIOS.read_text(encoding="utf-8"))
    personas = func["personas"]
    tokens = {p["id"]: set(plano(" ".join([p["n"], *(p.get("a") or [])])).split()) for p in personas}
    por_inst: dict[int, set[str]] = {}
    for p in personas:
        for c in p["c"]:
            if c.get("i") is not None:
                por_inst.setdefault(c["i"], set()).add(p["id"])

    def atar(nombre: str | None, inst: int | None) -> tuple[str | None, str | None]:
        """(persona, vía): «institucion» si tiene un cargo en la que publica,
        «nombre» si su nombre de tres o más palabras es único en toda la
        instantánea (puede haber cambiado de institución)."""
        if not nombre:
            return None, None
        buscadas = set(nombre.split())
        en_inst = [pid for pid in por_inst.get(inst, ()) if buscadas <= tokens[pid]] if inst else []
        if len(en_inst) == 1:
            return en_inst[0], "institucion"
        if len(en_inst) > 1 or len(buscadas) < 3:
            return None, None
        globales = [pid for pid, t in tokens.items() if buscadas <= t]
        return (globales[0], "nombre") if len(globales) == 1 else (None, None)

    fuentes, declaraciones = [], []
    for base, (institucion, inst_id) in BASES.items():
        filas, estado, nota = buscar_wp(base)
        fuentes.append({"base": base, "institucion": institucion, "id": inst_id, "estado": estado, "nota": nota,
                        "encontradas": len(filas)})
        for f in filas:
            nombre = nombre_del_titulo(f["t"], f["u"])
            persona, via = atar(nombre, inst_id)
            declaraciones.append({**f, "b": len(fuentes) - 1, "n": nombre, "p": persona, "v": via})
        print(f"  {base}: {len(filas)} ({estado}{'; ' + nota if nota else ''})", file=sys.stderr)

    filas, estado, nota = buscar_presidencia()
    fuentes.append({"base": "presidencia.gob.do/transparencia/declaraciones-juradas",
                    "institucion": "Presidencia de la República (Dirección de Comunicación)", "id": 1155,
                    "estado": estado, "nota": nota, "encontradas": len(filas)})
    for f in filas:
        nombre = nombre_del_titulo(f.pop("archivo"), f["u"]) or nombre_del_titulo(f["t"], f["u"])
        persona, via = atar(nombre, 1155)
        declaraciones.append({**f, "b": len(fuentes) - 1, "n": nombre, "p": persona, "v": via})
    print(f"  presidencia.gob.do: {len(filas)} ({estado})", file=sys.stderr)

    if len(declaraciones) < 40:
        sys.exit(f"Solo {len(declaraciones)} declaraciones: algo falló, no se escribe.")
    declaraciones.sort(key=lambda d: (d["f"] or "", d["t"]), reverse=True)
    salida = {
        "generado": datetime.date.today().isoformat(),
        "camara": "https://consultadjp.camaradecuentas.gob.do/",
        "fuentes": fuentes,
        "declaraciones": declaraciones,
    }
    SALIDA.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    atadas = sum(1 for d in declaraciones if d["p"])
    print(f"→ {SALIDA.relative_to(RAIZ)}: {len(declaraciones)} declaraciones de "
          f"{sum(1 for f in fuentes if f['encontradas'])} instituciones; {atadas} atadas a una ficha")


if __name__ == "__main__":
    main()
