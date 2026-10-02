#!/usr/bin/env python3
"""Genera public/data/tenedores.json: quién tiene los bonos internos del Estado
y a quién le debe el sector público, según la Dirección General de Crédito
Público (Ministerio de Hacienda y Economía).

Mecánica verificada el 2026-10-02 (docs/INFRAESTRUCTURA.md §5.3), desde un sandbox
con egreso y UA identificable. El servidor de Crédito Público no responde al
egreso de Vercel (§3.3), así que esto es una instantánea que regenera este
script; robots.txt responde 404 (sin reglas).

- **Tenedores** — `GET /emisiones/interna` (HTML) enlaza
  `/Content/emisiones_de_titulos/internas/emisiones/01Relación de Tenedores de
  Bonos Internos Emitidos por el Sector Públic.xlsx` (sic, el nombre va
  cortado). Una hoja, «Tenedores Domésticos», en **millones de pesos**: la fila
  de cabecera lleva un mes por columna («Ene 2011» … «Ago 2026»), y debajo
  TOTAL, «Residencia Doméstica» y «Residencia Extranjera», cada una con
  «Personas Físicas» y «Personas Jurídicas», y bajo las jurídicas el tipo de
  tenedor (bancos múltiples, fondos de pensiones, compañías de seguro…). Las
  etiquetas se repiten entre residencias («Personas Físicas», «Bancos
  Múltiples»), así que se leen **en orden**, por bloque. Las notas al pie dicen
  que CEVALDOM reorganizó la clasificación en oct-2011, feb-2023, abr-2024 y
  nov-2025: un tipo puede pasar a cero y su saldo aparecer en otro (las AFP
  pasan a «Fondos de Pensiones» y «Fondos de la Seguridad Social» en abril de
  2024). Se publican tal cual, con esas fechas; la **agrupación** en ocho
  familias es de Socrático y va declarada como tal.
- **Acreedores** — `/inicio/estadisticas?dlAnio=AAAA` enlaza, por cada corte,
  `…/09Saldo Deuda Histórico Sector Público No Financiero por Acreedor.xlsx`.
  Una hoja en **millones de dólares**: cuatro cierres de año y el corte del
  año en curso («Ago. 26*»), cada uno con US$ y %. Externa: multilateral (BID,
  Banco Mundial, CAF, FMI, otros), bilateral (países), privados (banca,
  bonos, suplidores); interna: bonos de recapitalización del BCRD, bonos de
  Hacienda, título canjeado, bonos de la CDEEE, banca comercial. Se elige el
  archivo cuyo corte es más reciente leyendo su cabecera, no su carpeta.

Se niega a escribir si las partes no suman sus totales (tenedores: residencias
contra TOTAL y tipos contra jurídicas en cada mes; acreedores: cada subtotal),
si aparece una etiqueta que la agrupación no conoce, o si falta un bloque.

    python3 scripts/build-tenedores.py

Solo biblioteca estándar.
"""
import datetime
import html as htmlmod
import io
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
import zipfile

BASE = "https://www.creditopublico.gob.do"
UA = "Socratico-Inteligencia/1.0 (tenedores de bonos y acreedores; herramienta independiente)"
SALIDA = os.path.join(os.path.dirname(__file__), "..", "public", "data", "tenedores.json")
MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


def bajar(url: str, tipos: str) -> bytes:
    """GET con UA identificable, 25 s, un reintento y validación de tipo."""
    for intento in (1, 2):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=25) as r:
                tipo = r.headers.get("Content-Type", "")
                cuerpo = r.read()
            if not re.search(tipos, tipo, re.I):
                raise RuntimeError(f"content-type inesperado {tipo!r}")
            return cuerpo
        except Exception as err:  # noqa: BLE001 — un reintento, luego se aborta
            if intento == 2:
                sys.exit(f"{url}: {err}")
    raise AssertionError


def enlaces(ruta: str, patron: str) -> list[str]:
    pagina = bajar(BASE + ruta, r"text/html").decode("utf-8", "replace")
    vistos: list[str] = []
    for m in re.finditer(r'href="([^"]+\.xlsx)"', pagina):
        r = htmlmod.unescape(m.group(1))
        if re.search(patron, norm(r)) and r not in vistos:
            vistos.append(r)
    return vistos


def xlsx(ruta: str) -> dict[int, dict[str, object]]:
    cuerpo = bajar(BASE + urllib.parse.quote(ruta), r"spreadsheetml|octet-stream")
    if not cuerpo.startswith(b"PK"):
        sys.exit(f"{ruta}: no empieza por PK, no es un XLSX")
    print(f"  {ruta}: {len(cuerpo):,} bytes")
    z = zipfile.ZipFile(io.BytesIO(cuerpo))
    try:
        shared = z.read("xl/sharedStrings.xml").decode("utf-8", "replace")
        strs = [htmlmod.unescape(re.sub(r"<[^>]+>", "", t))
                for t in re.findall(r"<si>(.*?)</si>", shared, re.S)]
    except KeyError:
        strs = []
    sxml = z.read("xl/worksheets/sheet1.xml").decode("utf-8", "replace")
    filas: dict[int, dict[str, object]] = {}
    for rxml in re.finditer(r'<row[^>]*\br="(\d+)"[^>]*>(.*?)</row>', sxml, re.S):
        celdas: dict[str, object] = {}
        for c in re.finditer(r'<c\b([^>]*?)(?:/>|>(.*?)</c>)', rxml.group(2), re.S):
            ref = re.search(r'\br="([A-Z]+)\d+"', c.group(1))
            if not ref:
                continue
            cuerpo_c = c.group(2) or ""
            v = re.search(r"<v>([^<]*)</v>", cuerpo_c)
            if v:
                val: object = v.group(1)
                if 't="s"' in c.group(1):
                    val = strs[int(val)] if int(val) < len(strs) else val
                elif 't="str"' not in c.group(1) and 't="e"' not in c.group(1):
                    try:
                        val = float(val)
                    except ValueError:
                        pass
            else:
                t = re.search(r"<t[^>]*>([^<]*)</t>", cuerpo_c)
                if not t:
                    continue
                val = htmlmod.unescape(t.group(1))
            if isinstance(val, str) and not val.strip():
                continue
            celdas[ref.group(1)] = val
        if celdas:
            filas[int(rxml.group(1))] = celdas
    return filas


def norm(t: object) -> str:
    s = unicodedata.normalize("NFD", str(t)).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().lower()


def col(n: int) -> str:
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def ncol(letras: str) -> int:
    n = 0
    for ch in letras:
        n = n * 26 + ord(ch) - 64
    return n


# ── Tenedores ──────────────────────────────────────────────────────────────────

# La agrupación de Socrático: ocho familias que un lector reconoce. Cada tipo
# que publica CEVALDOM cae en una; uno nuevo detiene el script.
GRUPOS = {
    "pensiones": ["administradoras de fondos de pensiones", "fondos de pensiones",
                  "fondos de la seguridad social"],
    "bancos": ["bancos multiples", "asociaciones de ahorros y prestamos",
               "bancos de ahorro y creditos y de fomento",
               "corporaciones de credito, financieras y de menor cuantia",
               "cooperativas de ahorro y credito",
               "entidades publicas de intermediacion financiera"],
    "seguros": ["companias de seguro"],
    "mercado": ["puestos de bolsas de valores", "administradoras de fondos mutuos y de inversion",
                "fondos de inversion abierto", "fondos de inversion cerrado", "fideicomiso",
                "fideicomiso de oferta publica",
                "fideicomisos de oferta publica con participacion del estado", "fiduciaria",
                "resto sociedades financieras", "sector financiero"],
    "estado": ["administracion central", "empresas publicas no financieras",
               "instituciones publicas descentralizadas o autonomas",
               "instituciones publicas financieras", "sector publico no financiero",
               "municipios y gobiernos locales"],
    "empresas": ["empresas privadas", "sector privado no financiero",
                 "instituciones sin fines de lucro que sirven a los hogares", "restos de hogares"],
}
GRUPO_DE = {etq: g for g, etqs in GRUPOS.items() for etq in etqs}


def mes_de(t: object) -> str | None:
    m = re.fullmatch(r"([a-z]{3})\w* (\d{4})", norm(t))
    if not m or m.group(1) not in MESES:
        return None
    return f"{m.group(2)}-{MESES.index(m.group(1)) + 1:02d}"


def tenedores() -> dict:
    rutas = enlaces("/emisiones/interna", r"tenedores de bonos internos")
    if len(rutas) != 1:
        sys.exit(f"/emisiones/interna: esperaba un enlace a la relación de tenedores, hay {len(rutas)}")
    ruta = rutas[0]
    hoja = xlsx(ruta)

    cab = next((f for f in hoja.values() if mes_de(f.get("B", ""))), None)
    if not cab:
        sys.exit("tenedores: no encuentro la fila de los meses")
    columnas = sorted((ncol(c), mes_de(v)) for c, v in cab.items() if mes_de(v))
    meses = [m for _, m in columnas]
    if meses != sorted(meses) or len(set(meses)) != len(meses):
        sys.exit("tenedores: los meses no van en orden o se repiten")

    def serie(fila: dict) -> list[float]:
        out = []
        for n, _ in columnas:
            v = fila.get(col(n), 0)
            out.append(round(float(v), 4) if isinstance(v, float) else 0.0)
        return out

    total = dom = ext = None
    bloque = residencia = persona = None
    filas_out: list[dict] = []
    subtotales: dict[tuple[str, str], list[float]] = {}
    actualizado = None
    notas: list[str] = []
    for n in sorted(hoja):
        f = hoja[n]
        etq = f.get("A")
        if not isinstance(etq, str):
            continue
        k = norm(etq)
        if k.startswith("cifras actualizadas"):
            actualizado = etq.strip()
            continue
        if re.match(r"^\d/", k):
            notas.append(etq.strip())
            continue
        if f is cab or not any(isinstance(f.get(col(c)), float) for c, _ in columnas):
            continue
        if k == "total":
            total = serie(f)
        elif k == "residencia domestica":
            residencia, dom = "domestica", serie(f)
        elif k == "residencia extranjera":
            residencia, ext = "extranjera", serie(f)
        elif k in ("personas fisicas", "personas juridicas"):
            if not residencia:
                sys.exit(f"tenedores fila {n}: «{etq}» antes de una residencia")
            persona = "fisica" if k == "personas fisicas" else "juridica"
            subtotales[(residencia, persona)] = serie(f)
            if persona == "fisica":
                filas_out.append({"residencia": residencia, "nombre": "Personas físicas",
                                  "grupo": "personas" if residencia == "domestica" else "extranjeros",
                                  "serie": serie(f)})
        else:
            if persona != "juridica":
                sys.exit(f"tenedores fila {n}: «{etq}» fuera del bloque de personas jurídicas")
            grupo = "extranjeros" if residencia == "extranjera" else GRUPO_DE.get(k)
            if not grupo:
                sys.exit(f"tenedores fila {n}: tipo de tenedor nuevo «{etq}» — asígnalo a un grupo en GRUPOS")
            filas_out.append({"residencia": residencia, "nombre": etq.strip(), "grupo": grupo,
                              "serie": serie(f)})
        bloque = k
    del bloque

    if not (total and dom and ext):
        sys.exit("tenedores: falta TOTAL o una residencia")

    errores = []
    for i, m in enumerate(meses):
        if abs(dom[i] + ext[i] - total[i]) > 1:
            errores.append(f"{m}: doméstica + extranjera ≠ TOTAL")
        for res in ("domestica", "extranjera"):
            fis = subtotales.get((res, "fisica"), [0] * len(meses))[i]
            jur = subtotales.get((res, "juridica"), [0] * len(meses))[i]
            tot = (dom if res == "domestica" else ext)[i]
            if abs(fis + jur - tot) > 1:
                errores.append(f"{m} {res}: físicas + jurídicas ≠ residencia")
            partes = sum(r["serie"][i] for r in filas_out
                         if r["residencia"] == res and r["nombre"] != "Personas físicas")
            if abs(partes - jur) > 1:
                errores.append(f"{m} {res}: los tipos suman {partes:,.1f} y jurídicas {jur:,.1f}")
    # El archivo trae descuadres viejos (jul-2016: la residencia extranjera no
    # suma sus personas; ago-2018: los tipos extranjeros pasan a las jurídicas
    # por 25 millones). No se corrigen: se publican y se declaran. Solo el mes
    # más reciente, que es el que se lee en portada, tiene que cuadrar.
    recientes = [e for e in errores if e.startswith(meses[-1])]
    if recientes:
        sys.exit("No escribo tenedores.json, el último mes no cuadra:\n  " + "\n  ".join(recientes))
    if not (500_000 < total[-1] < 10_000_000):
        sys.exit(f"tenedores: total implausible {total[-1]:,.1f} millones")

    reclasificaciones = []
    for nota in notas:
        m = re.search(r"a partir de (\w+) de (\d{4}), cevaldom reorganizo", norm(nota))
        if m and m.group(1)[:3] in MESES:
            reclasificaciones.append(f"{m.group(2)}-{MESES.index(m.group(1)[:3]) + 1:02d}")

    # Solo las filas que alguna vez tuvieron saldo.
    filas_out = [r for r in filas_out if any(abs(v) > 0.05 for v in r["serie"])]
    for r in filas_out:
        r["serie"] = [round(v, 1) for v in r["serie"]]
    return {
        "url": BASE + urllib.parse.quote(ruta),
        "pagina": f"{BASE}/emisiones/interna",
        "actualizado": actualizado,
        "unidad": "millones de RD$",
        "meses": meses,
        "total": [round(v, 1) for v in total],
        "domestica": [round(v, 1) for v in dom],
        "extranjera": [round(v, 1) for v in ext],
        "filas": filas_out,
        "reclasificaciones": reclasificaciones,
        "descuadres": errores,
        "notas": notas,
    }


# ── Acreedores ─────────────────────────────────────────────────────────────────

def corte_de(etq: object) -> tuple[int, int] | None:
    """«2025» → (2025, 12); «Ago. 26*» → (2026, 8)."""
    s = norm(etq).rstrip("*").strip()
    if re.fullmatch(r"\d{4}", s):
        return int(s), 12
    m = re.fullmatch(r"([a-z]{3})\w*\.? ?(\d{2}|\d{4})", s)
    if m and m.group(1) in MESES:
        a = int(m.group(2))
        return (a + 2000 if a < 100 else a), MESES.index(m.group(1)) + 1
    return None


ESTRUCTURA = [
    # (sección, grupo, etiqueta normalizada, tipo)
    ("externa", "multilateral", "bid", "detalle"),
    ("externa", "multilateral", "banco mundial", "detalle"),
    ("externa", "multilateral", "caf", "detalle"),
    ("externa", "multilateral", "fmi", "detalle"),
    ("externa", "multilateral", "otros", "detalle"),
    ("externa", "multilateral", "total deuda multilateral", "subtotal"),
    ("externa", "bilateral", "brasil", "detalle"),
    ("externa", "bilateral", "estados unidos", "detalle"),
    ("externa", "bilateral", "espana", "detalle"),
    ("externa", "bilateral", "francia", "detalle"),
    ("externa", "bilateral", "de los cuales afd", "dentro"),
    ("externa", "bilateral", "japon", "detalle"),
    ("externa", "bilateral", "venezuela", "detalle"),
    ("externa", "bilateral", "de los cuales acuerdo petrocaribe-pdvsa 1/", "dentro"),
    ("externa", "bilateral", "otros paises", "detalle"),
    ("externa", "bilateral", "total deuda bilateral", "subtotal"),
    ("externa", "oficial", "total deuda oficial", "subtotal"),
    ("externa", "privada", "banca", "detalle"),
    ("externa", "privada", "bonos", "detalle"),
    ("externa", "privada", "suplidores", "detalle"),
    ("externa", "privada", "total deuda privada", "subtotal"),
    ("externa", "total", "total deuda externa", "total"),
    ("interna", "interna", "bonos de recap bcrd (ley 167-07)", "detalle"),
    ("interna", "interna", "bonos emitidos mh", "detalle"),
    ("interna", "interna", "titulo canjeado 2/", "detalle"),
    ("interna", "interna", "bonos de cdeee", "detalle"),
    ("interna", "interna", "banca comercial u otras instituciones financieras 3/", "detalle"),
    ("interna", "total", "total deuda interna", "total"),
]


def leer_acreedor(ruta: str) -> dict:
    hoja = xlsx(ruta)
    cab_n = next((n for n, f in sorted(hoja.items()) if norm(f.get("A", "")) == "fuente de deuda/acreedor"), None)
    if not cab_n:
        raise ValueError(f"{ruta}: no encuentro la cabecera «FUENTE DE DEUDA/ACREEDOR»")
    cortes = sorted((ncol(c), corte_de(v), str(v).strip()) for c, v in hoja[cab_n].items()
                    if c != "A" and corte_de(v))
    if len(cortes) < 2:
        raise ValueError(f"{ruta}: la cabecera no trae cortes")
    filas = []
    idx = 0
    seccion = None
    resumen_pib: list[float | None] = []
    for n in sorted(hoja):
        if n <= cab_n:
            continue
        f = hoja[n]
        k = norm(f.get("A", ""))
        if k == "deuda externa":
            seccion = "externa"
            continue
        if k == "deuda interna":
            seccion = "interna"
            continue
        if k == "resumen":
            break
        if idx < len(ESTRUCTURA) and seccion == ESTRUCTURA[idx][0] and k == ESTRUCTURA[idx][2]:
            sec, grupo, _, tipo = ESTRUCTURA[idx]
            valores = []
            for c, _, _ in cortes:
                v = f.get(col(c))
                valores.append(round(v, 2) if isinstance(v, float) else None)
            filas.append({"seccion": sec, "grupo": grupo, "nombre": str(f["A"]).strip(), "tipo": tipo,
                          "usd": valores})
            idx += 1
    if idx != len(ESTRUCTURA):
        raise ValueError(f"{ruta}: la estructura cambió; esperaba «{ESTRUCTURA[idx][2]}» y no apareció")
    for n in sorted(hoja):
        k = norm(hoja[n].get("A", ""))
        if k == "total deuda publica":
            total = [hoja[n].get(col(c)) for c, _, _ in cortes]
        if k.startswith("deuda/pib") and "4/" in k:
            resumen_pib = [round(v, 2) if isinstance(v := hoja[n].get(col(c)), float) else None
                           for c, _, _ in cortes]

    # Comprobación: cada subtotal suma sus detalles, y externa + interna = total.
    def de(nombre: str) -> list:
        return next(r["usd"] for r in filas if norm(r["nombre"]) == nombre)

    errores = []
    for i in range(len(cortes)):
        def s(grupo: str, seccion: str = "externa") -> float:
            return sum(r["usd"][i] or 0 for r in filas
                       if r["seccion"] == seccion and r["grupo"] == grupo and r["tipo"] == "detalle")
        pares = [
            (s("multilateral"), de("total deuda multilateral")[i], "multilateral"),
            (s("bilateral"), de("total deuda bilateral")[i], "bilateral"),
            (de("total deuda multilateral")[i] + de("total deuda bilateral")[i], de("total deuda oficial")[i], "oficial"),
            (s("privada"), de("total deuda privada")[i], "privada"),
            (de("total deuda oficial")[i] + de("total deuda privada")[i], de("total deuda externa")[i], "externa"),
            (s("interna", "interna"), de("total deuda interna")[i], "interna"),
            (de("total deuda externa")[i] + de("total deuda interna")[i], total[i], "total"),
        ]
        for a, b, nombre in pares:
            if b is None or abs(a - b) > 1:
                errores.append(f"{cortes[i][2]} {nombre}: partes {a:,.1f} ≠ total {b}")
    if errores:
        raise ValueError(f"{ruta}: no cuadra:\n  " + "\n  ".join(errores))
    return {
        "cortes": [{"etiqueta": e, "anio": a, "mes": m, "preliminar": e.endswith("*")}
                   for _, (a, m), e in cortes],
        "filas": filas,
        "total": [round(v, 2) for v in total],
        "pctPib": resumen_pib,
    }


def acreedores() -> dict:
    hoy = datetime.date.today()
    candidatos: list[tuple[tuple[int, int], str, dict]] = []
    for anio in (hoy.year, hoy.year - 1):
        rutas = enlaces(f"/inicio/estadisticas?dlAnio={anio}", r"/anual/\d{4}/.*por acreedor\.xlsx$")
        for ruta in rutas:
            # Los cortes viejos del año pueden traer otra estructura (el de
            # marzo de 2026 no rotula la cabecera igual): se avisa y se sigue,
            # y se publica el corte más reciente que sí se pudo comprobar.
            try:
                leido = leer_acreedor(ruta)
            except ValueError as err:
                print(f"  aviso: {err}")
                continue
            ultimo = leido["cortes"][-1]
            candidatos.append(((ultimo["anio"], ultimo["mes"]), ruta, leido))
        if candidatos:
            break
    if not candidatos:
        sys.exit("acreedores: el listado no enlaza ningún archivo «por Acreedor»")
    candidatos.sort(key=lambda c: c[0])
    _, ruta, leido = candidatos[-1]
    return {"url": BASE + urllib.parse.quote(ruta), "pagina": f"{BASE}/inicio/estadisticas",
            "unidad": "millones de US$", **leido}


def main() -> None:
    t = tenedores()
    a = acreedores()
    salida = {
        "generado": datetime.date.today().isoformat(),
        "fuente": "Dirección General de Crédito Público, Ministerio de Hacienda y Economía",
        "tenedores": t,
        "acreedores": a,
    }
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", encoding="utf-8") as fh:
        json.dump(salida, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"tenedores.json: {len(t['meses'])} meses ({t['meses'][0]}–{t['meses'][-1]}), "
          f"{len(t['filas'])} tipos con saldo; total {t['total'][-1]:,.1f} millones de RD$")
    grupos: dict[str, float] = {}
    for r in t["filas"]:
        grupos[r["grupo"]] = grupos.get(r["grupo"], 0) + r["serie"][-1]
    for g, v in sorted(grupos.items(), key=lambda x: -x[1]):
        print(f"  {g:12} {v:>14,.1f}  {100 * v / t['total'][-1]:5.1f} %")
    for e in t["descuadres"]:
        print(f"  descuadre del archivo (se publica tal cual): {e}")
    print(f"  reclasificaciones de CEVALDOM: {', '.join(t['reclasificaciones'])}")
    print(f"acreedores: cortes {', '.join(c['etiqueta'] for c in a['cortes'])}; "
          f"total {a['total'][-1]:,.1f} millones de US$")


if __name__ == "__main__":
    main()
