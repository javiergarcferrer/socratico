#!/usr/bin/env python3
"""Genera datos/votos/legisladores.json: **una persona, un nodo** para cada
diputado y senador que el SIL lista, y la asistencia y la disidencia de cada
diputado derivadas de su voto nominal (docs/INFRAESTRUCTURA.md §5.5, §7.4).
Sin red: lee lo que ya escribieron otros scripts.

Entradas:
- `public/data/funcionarios.json` (las personas del grafo, `build-funcionarios.py`);
- `public/data/congreso.json` (el directorio del período vigente, `build-congreso.py`);
- `datos/votos/nominal.json` y `datos/votos/fichas.json` (`build-votos-nominales.py`);
- `public/data/votaciones.json` (fecha y legislatura de cada votación).

## La regla de casamiento (explícita; cada casamiento guarda su evidencia)

Un legislador del SIL (su `legisladorId`, estable entre períodos: 76 diputados
de 2020-2024 conservan el suyo en 2024-2028) se casa con una persona del grafo así:

1. **por identificador del SIL**: la persona ya lleva ese `legisladorId` porque
   `build-funcionarios.py` la creó del directorio del período vigente (nombre
   normalizado + cargo de elección de 2024-2028). Un período anterior del mismo
   identificador es la misma persona.
2. **por nombre completo**: el nombre normalizado (sin tildes, signos ni
   mayúsculas; los dos apellidos, que el SIL da aparte) es el de **una sola**
   persona del grafo, ningún otro legislador del SIL lo comparte y esa persona
   no tiene un cargo incompatible con el escaño (abajo). Con un solo apellido
   (un nombre común) hace falta además un cargo suyo en la provincia del
   escaño; el apellido de casada («… de López») se quita si además hay esa
   provincia. Un casamiento cuyo único cargo es de más de ocho años antes del
   escaño, sin lazo de provincia, se casa y va al informe de **avisos**.

No se casa —y el legislador va al informe de **dudosos**, con sus candidatos y
el motivo— cuando: dos legisladores del SIL tienen el mismo nombre (padre e
hijo); dos personas del grafo lo tienen; la persona tiene un cargo incompatible;
o solo coincide sin el segundo apellido (o con un apellido de más). Un dudoso
queda como nodo propio: un falso casamiento es peor que dos nodos.

**Cargo incompatible** (Constitución, art. 77.4: el escaño es incompatible con
otra función pública, salvo la docencia): un cargo que el MAP da como vigente, si
el legislador sigue en el directorio de hoy, o
una designación por decreto o nombramiento fechada dentro del ejercicio del
legislador (de su inicio más 30 días a su fin). Un cese no es conflicto: el
decreto que cesa a quien juró su escaño es la prueba de que es la misma persona.
Tampoco un cargo «a título honorífico»: no es empleo, y la ley sienta a los
legisladores en órganos como los consejos de desarrollo provincial (Ley 498-06);
queda anotado en la evidencia del casamiento.
Un casamiento heredado del directorio que choca con esta regla se **separa**: el
escaño pasa a un nodo propio y se lista.

## La asistencia (definida en la ontología, `soc:AsistenciaLegislativa`)

- **Denominador**: las votaciones del pleno en que el SIL lista al diputado en
  el voto nominal, hasta el fin de su ejercicio. El SIL lista en cada votación a
  los miembros de la cámara en ese momento (190), así que mide «mientras era
  miembro en ejercicio» según el SIL; a quien dejó el escaño a veces lo sigue
  listando ausente, y por eso cuenta hasta su fin (el de su ficha, o su última
  votación presente si ya no figura en las últimas). La fuente no da licencias
  ni suplencias aparte.
- **Presente**: figura con «Sí», «No», abstención o «sin voto» (SV, presente
  que no votó). La suma por votación es `presentes` del acta: el paso de prueba
  de este script lo comprueba para cada votación.
- **Ausente**: «Ausente para esta votación» (AU). La fuente no distingue
  ausencia excusada de no excusada en el voto nominal.
- **Fuera del denominador**: las votaciones a mano alzada (`votoId` «ML»,
  «Manos levantadas»: unas 42 por diputado en 2024-2028), que no registran
  quién estuvo; el voto nominal las guarda como «otro».
- Nunca un porcentaje sin su denominador: cada agregado guarda las cuentas.

## El bufete directivo

El SIL no publica quién preside la cámara, pero la votación que lo elige sí: «Sometida a
votación la plancha … a ocupar el Bufete Directivo para el año legislativo 2026-2027,
integrada por el diputado Alfredo Pacheco Osoria, como presidente; la diputada …, como
vicepresidenta, y como secretarios, …». De cada plancha aprobada (más sí que no) se
lee el presidente y la vicepresidencia, y cada nombre se casa con el padrón del
período por su nombre normalizado completo; si no casa con uno solo, no se atribuye.
El cargo lleva la votación de la que sale. El año legislativo en curso es de hoy;
los anteriores, gestión anterior.

## La disidencia

En una votación, la posición de una bancada es el sentido (sí, no o abstención)
de más de la mitad de sus miembros que votaron, si votaron al menos tres. Un
diputado disiente cuando votó con otro sentido. La bancada es la que el SIL le
da en esa votación.

Uso:
    python3 scripts/build-legisladores.py           # escribe
    python3 scripts/build-legisladores.py --informe # además, imprime el informe de dudosos y discrepancias
"""
import collections
import datetime
import json
import pathlib
import re
import sys
import unicodedata

RAIZ = pathlib.Path(__file__).resolve().parent.parent
FUNCIONARIOS = RAIZ / "public" / "data" / "funcionarios.json"
CONGRESO = RAIZ / "public" / "data" / "congreso.json"
VOTACIONES = RAIZ / "public" / "data" / "votaciones.json"
NOMINAL = RAIZ / "datos" / "votos" / "nominal.json"
FICHAS = RAIZ / "datos" / "votos" / "fichas.json"
SALIDA = RAIZ / "datos" / "votos" / "legisladores.json"
# Lo que las funciones necesitan de votaciones.json y congreso.json (excluidas de toda función por su
# tamaño, next.config.ts): la fecha de cada votación y qué votaciones tratan cada expediente.
INDICE = RAIZ / "datos" / "votos" / "votaciones.json"

DIGITOS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
PERIODOS = {"2020-2024": ("2020-08-16", "2024-08-15"), "2024-2028": ("2024-08-16", "2028-08-15")}
PARTICULAS = {"de", "del", "la", "las", "los", "y", "e"}
# Las disidencias más recientes que se guardan por persona (el resto, contado).
TOPE_DISIDENCIAS = 40


def sin_tildes(s: str) -> str:
    return unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode()


def clave(nombre: str) -> str:
    """La de `build-funcionarios.py`: sin tildes, signos ni mayúsculas."""
    s = sin_tildes(nombre).lower()
    s = re.sub(r"[^a-z0-9ñ ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def slug(nombre: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", clave(nombre)).strip("-")[:90]


def apellidos_en_grupos(apellidos: str) -> list[str]:
    """«DE LOS SANTOS GARCÍA» → ["de los santos", "garcia"]: las partículas van con el apellido que sigue."""
    grupos, pendiente = [], []
    for w in clave(apellidos).split():
        pendiente.append(w)
        if w not in PARTICULAS:
            grupos.append(" ".join(pendiente))
            pendiente = []
    if pendiente:
        if grupos:
            grupos[-1] += " " + " ".join(pendiente)
        else:
            grupos.append(" ".join(pendiente))
    return grupos


def titulo(s: str) -> str:
    """Un nombre en MAYÚSCULAS a tipo título: partículas en minúscula."""
    salida = []
    for i, w in enumerate((s or "").split()):
        bajo = w.lower()
        salida.append(bajo if i and bajo in PARTICULAS else "-".join(p[:1].upper() + p[1:] for p in bajo.split("-")))
    return " ".join(salida)


def main() -> None:
    informe = "--informe" in sys.argv
    hoy = datetime.date.today().isoformat()
    funcionarios = json.loads(FUNCIONARIOS.read_text())
    personas = funcionarios["personas"]
    directorio = json.loads(CONGRESO.read_text())["legisladores"]
    nominal = json.loads(NOMINAL.read_text())
    fichas = json.loads(FICHAS.read_text())["legisladores"] if FICHAS.exists() else {}
    votaciones = {str(v["id"]): v for v in json.loads(VOTACIONES.read_text())["votaciones"]}
    siglas_a_nombre = {l["ps"]: l["pn"] for l in directorio if l.get("ps") and l.get("pn")}
    for f in fichas.values():
        if f.get("partido") and f.get("partidoNombre"):
            siglas_a_nombre.setdefault(f["partido"], f["partidoNombre"])

    # ---------------------------------------------------------- legisladores del SIL
    # id → {nombre, apellidos, camara, periodos: {periodo: {...}}}
    sil: dict[int, dict] = {}
    for l in directorio:
        camara = "senado" if l.get("c") == "senado" else "diputados"
        d = sil.setdefault(l["id"], {"id": l["id"], "nombre": l["n"], "apellidos": None, "camara": camara, "periodos": {}})
        d["periodos"]["2024-2028"] = {"funcion": l.get("fn"), "provincia": l.get("pr"), "circunscripcion": l.get("ci"),
                                      "partido": l.get("ps"), "fuente": "directorio"}
    for periodo, per in nominal["periodos"].items():
        for lid, nombres, apellidos in per["legisladores"]:
            d = sil.setdefault(lid, {"id": lid, "nombre": None, "apellidos": None, "camara": "diputados", "periodos": {}})
            d["apellidos"] = apellidos
            if not d["nombre"]:
                f = fichas.get(str(lid)) or {}
                d["nombre"] = f"{f['nombres']} {f['apellidos']}" if f.get("nombres") and f.get("apellidos") \
                    else titulo(f"{nombres} {apellidos}")
            d["periodos"].setdefault(periodo, {"fuente": "nominal"})
    for lid, d in sil.items():
        f = fichas.get(str(lid))
        if not f:
            continue
        if f.get("apellidos"):
            d["apellidos"] = d["apellidos"] or f["apellidos"]
        per = f.get("periodo")
        if per in d["periodos"]:
            p = d["periodos"][per]
            for k in ("funcion", "provincia", "circunscripcion", "inicio", "fin"):
                if f.get(k) and not p.get(k):
                    p[k] = f[k]
            if f.get("partido") and not p.get("partido"):
                p["partido"] = f["partido"]

    # Sin ficha del SIL (no la da de quien ya salió), el ejercicio lo dice el voto nominal: si el
    # legislador dejó de figurar antes de las últimas votaciones leídas de su período, su ejercicio
    # acabó en su última votación presente (después, el SIL solo lo listó ausente: una licencia que
    # termina en salida).
    ultima_del_periodo: dict[str, str] = {}
    listada: dict[tuple[int, str], list[str]] = {}
    for vid, v in nominal["votos"].items():
        fecha_v = (votaciones.get(vid) or {}).get("fecha") or ""
        if not fecha_v:
            continue
        ultima_del_periodo[v["p"]] = max(ultima_del_periodo.get(v["p"], ""), fecha_v)
        ids_p = [f[0] for f in nominal["periodos"][v["p"]]["legisladores"]]
        for k, ch in enumerate(v["v"]):
            if ch != "-":
                par = listada.setdefault((ids_p[k], v["p"]), [fecha_v, fecha_v, ""])
                par[0], par[1] = min(par[0], fecha_v), max(par[1], fecha_v)
                if ch in "snbx":
                    par[2] = max(par[2], fecha_v)
    # Solo con el período leído entero y una votación presente: de una lectura parcial, o de quien
    # nunca figuró presente, no se deduce un fin (no se inventa una fecha).
    leido_entero = {per: sum(1 for v in votaciones.values() if v["periodo"] == per)
                    == sum(1 for v in nominal["votos"].values() if v["p"] == per) for per in PERIODOS}
    for (lid, per), (primera, ultima, presente) in listada.items():
        p = sil[lid]["periodos"].get(per)
        if p is None or p.get("fin") or not leido_entero.get(per) or not presente:
            continue
        if ultima < ultima_del_periodo[per]:
            p["fin"] = presente
            p["finSegun"] = "su última votación presente en el voto nominal"

    # ---------------------------------------------------------- índice de personas
    por_clave: dict[str, list[dict]] = collections.defaultdict(list)
    for p in personas:
        for n in {p["n"], *(p.get("a") or [])}:
            if p not in por_clave[clave(n)]:
                por_clave[clave(n)].append(p)
    por_leg = {p["leg"]: p for p in personas if p.get("leg")}
    claves_sil = collections.Counter(clave(d["nombre"]) for d in sil.values())

    def ejercicio(d: dict, periodo: str) -> tuple[str, str]:
        p = d["periodos"][periodo]
        ini, fin = PERIODOS[periodo]
        return p.get("inicio") or ini, p.get("fin") or fin

    def incompatibles(p: dict, d: dict) -> list[str]:
        """Los cargos de la persona que no caben con el escaño de este legislador."""
        malos = []
        for c in p["c"]:
            if c.get("o") == "congreso":
                continue
            if c.get("m") == "vigente" and c.get("o") == "map":
                # Un cargo de hoy choca solo con un escaño de hoy: quien dejó el escaño puede ocuparlo.
                if any(ejercicio(d, per)[1] >= hoy for per in d["periodos"]) and d["id"] in en_directorio:
                    malos.append(f"{c['t']} (vigente en el MAP)")
                continue
            if c.get("m") not in ("designa", "vigente") or not c.get("d"):
                continue
            if re.search(r"honor[ií]fic", c["t"], re.I):
                continue
            for periodo in d["periodos"]:
                ini, fin = ejercicio(d, periodo)
                margen = (datetime.date.fromisoformat(ini) + datetime.timedelta(days=30)).isoformat()
                if margen <= c["d"] <= fin:
                    malos.append(f"{c['t']} ({c.get('o')}, {c['d']}, durante {periodo})")
                    break
        return malos

    en_directorio = {l["id"] for l in directorio}
    casados, dudosos, nuevos, separados, avisos = {}, [], [], [], []

    def provincia_coincide(p: dict, d: dict) -> bool:
        """¿Algún cargo de la persona está en (o nombra) la provincia de un escaño del legislador?"""
        provs = {clave(x["provincia"]) for x in d["periodos"].values() if x.get("provincia")}
        provs.discard("")
        for c in p["c"]:
            texto = f" {clave(c.get('pr') or '')} {clave(c.get('t') or '')} "
            if any(f" {pv} " in texto for pv in provs):
                return True
        return False

    def lejania(p: dict, d: dict) -> int | None:
        """Cuántos años separan el cargo con fecha más reciente del inicio de su primer escaño, si pasan de 8."""
        fechas = [c["d"] for c in p["c"] if c.get("d") and c.get("o") != "congreso"]
        if not fechas:
            return None
        inicio = min(ejercicio(d, per)[0] for per in d["periodos"])
        anios = int(inicio[:4]) - int(max(fechas)[:4])
        return anios if anios > 8 else None
    for lid, d in sorted(sil.items()):
        k = clave(d["nombre"])
        p = por_leg.get(lid)
        if p:
            malos = incompatibles(p, d)
            if malos:
                separados.append({"legislador": lid, "nombre": d["nombre"], "persona": p["id"], "motivo": "; ".join(malos)})
                d["separado"] = p["id"]
            else:
                ev = "por identificador del SIL (directorio del período vigente: nombre y cargo de elección)"
                if set(d["periodos"]) - {"2024-2028"}:
                    ev += "; los períodos anteriores, por el mismo identificador"
                honorificos = [c["t"] for c in p["c"] if c.get("o") != "congreso" and re.search(r"honor[ií]fic", c["t"], re.I)
                               and any(ejercicio(d, per)[0] <= (c.get("d") or "") <= ejercicio(d, per)[1] for per in d["periodos"])]
                if honorificos:
                    ev += "; durante el escaño, un cargo a título honorífico: " + "; ".join(honorificos)
                casados[lid] = (p["id"], ev)
            continue
        candidatos = [c for c in por_clave.get(k, []) if c.get("leg") in (None, lid)]
        otros_leg = [c for c in por_clave.get(k, []) if c.get("leg") not in (None, lid)]
        if claves_sil[k] > 1:
            dudosos.append({"legislador": lid, "nombre": d["nombre"], "motivo": "otro legislador del SIL tiene el mismo nombre",
                            "candidatos": [c["id"] for c in por_clave.get(k, [])]})
            continue
        if otros_leg:
            dudosos.append({"legislador": lid, "nombre": d["nombre"],
                            "motivo": "una persona con el mismo nombre ya es otro legislador del SIL",
                            "candidatos": [c["id"] for c in otros_leg]})
            continue
        if len(candidatos) > 1:
            dudosos.append({"legislador": lid, "nombre": d["nombre"], "motivo": "dos o más personas del grafo con el mismo nombre",
                            "candidatos": [c["id"] for c in candidatos]})
            continue
        if len(candidatos) == 1:
            malos = incompatibles(candidatos[0], d)
            if malos:
                dudosos.append({"legislador": lid, "nombre": d["nombre"], "motivo": "cargo incompatible: " + "; ".join(malos),
                                "candidatos": [candidatos[0]["id"]]})
                continue
            c0 = candidatos[0]
            dos_apellidos = len(apellidos_en_grupos(d["apellidos"] or "")) >= 2
            misma_provincia = provincia_coincide(c0, d)
            if not dos_apellidos and not misma_provincia:
                # Un solo apellido es un nombre común: hace falta además la provincia del escaño en un cargo suyo.
                dudosos.append({"legislador": lid, "nombre": d["nombre"],
                                "motivo": "un solo apellido y ningún cargo suyo en la provincia del escaño", "candidatos": [c0["id"]]})
                continue
            if dos_apellidos:
                ev = "por nombre completo (los dos apellidos), único en el grafo y en el SIL, sin cargo incompatible"
            else:
                ev = "por nombre completo (un solo apellido) y un cargo suyo en la provincia del escaño, único en el grafo y en el SIL, sin cargo incompatible"
            if misma_provincia and dos_apellidos:
                ev += "; un cargo suyo en la provincia del escaño"
            lejano = lejania(c0, d)
            if lejano and not misma_provincia:
                avisos.append({"legislador": lid, "nombre": d["nombre"], "persona": c0["id"],
                               "aviso": f"su único cargo con fecha es de {lejano} años antes del escaño, sin lazo de provincia: casado por la regla, a revisar"})
            casados[lid] = (c0["id"], ev)
            continue
        # Sin coincidencia exacta: ¿una variante sin el segundo apellido, o con uno de más?
        variantes = []
        grupos = apellidos_en_grupos(d["apellidos"] or "")
        pila = k[: len(k) - len(" ".join(grupos))].strip() if grupos and k.endswith(" ".join(grupos)) else None
        if pila and len(grupos) >= 2:
            variantes.append(f"{pila} {grupos[0]}")
        # El apellido de casada: «Marta de Jesús Collado Ozoria de López» es «… Collado Ozoria» en un decreto.
        sin_casada = re.sub(r" de [a-z]+$", "", k)
        if sin_casada != k:
            casada = [c for c in por_clave.get(sin_casada, []) if c.get("leg") in (None, lid)]
            if len(casada) == 1 and provincia_coincide(casada[0], d) and not incompatibles(casada[0], d):
                casados[lid] = (casada[0]["id"], "por nombre completo sin el apellido de casada, único en el grafo, con un cargo suyo en la provincia del escaño y sin cargo incompatible")
                continue
            variantes.append(sin_casada)
        prefijo = [c for kk, cs in por_clave.items() if kk.startswith(k + " ") for c in cs]
        cand_var = {c["id"]: c for v in variantes for c in por_clave.get(v, [])} | {c["id"]: c for c in prefijo}
        cand_var = {i: c for i, c in cand_var.items() if c.get("leg") in (None, lid)}
        if cand_var:
            dudosos.append({"legislador": lid, "nombre": d["nombre"],
                            "motivo": "coincide solo sin el segundo apellido o con un apellido de más",
                            "candidatos": sorted(cand_var)})
            continue
        nuevos.append(lid)

    # ---------------------------------------------------------- personas que añade o separa
    usados = {p["id"] for p in personas}
    def nuevo_slug(nombre: str) -> str:
        s = slug(nombre) or "persona"
        if s not in usados:
            usados.add(s)
            return s
        n = 2
        while f"{s}-{n}" in usados:
            n += 1
        usados.add(f"{s}-{n}")
        return f"{s}-{n}"

    def cargo_de(d: dict, periodo: str, funcion_conocida: str | None) -> dict:
        p = d["periodos"][periodo]
        funcion = p.get("funcion") or funcion_conocida
        if d["camara"] == "senado":
            base = funcion or "Senaduría"
        else:
            base = funcion or "Diputación"
        donde = p.get("provincia")
        t = f"{base} por {donde}" if donde else f"{base}, período {periodo}"
        if donde and p.get("circunscripcion") and d["camara"] != "senado":
            t += f", {p['circunscripcion'].lower()}"
        partido = siglas_a_nombre.get(p.get("partido") or "", p.get("partido"))
        c = {"t": t, "pr": donde, "m": "electo", "o": "congreso", "per": periodo, "par": partido, "pep": 2}
        # Quien dejó el escaño antes de que acabe el período (el SIL da su fin): ya no es de hoy.
        if p.get("fin") and p["fin"] < PERIODOS[periodo][1] and p["fin"] < hoy:
            c["m"], c["d"] = "cesa", p["fin"]
        return {k: v for k, v in c.items() if v is not None}

    # El partido de cada diputado por período: la bancada en que más votaciones figura.
    bancada_mas_comun: dict[tuple[int, str], str] = {}
    for periodo, per in nominal["periodos"].items():
        cuenta: dict[int, collections.Counter] = collections.defaultdict(collections.Counter)
        ids = [f[0] for f in per["legisladores"]]
        for v in nominal["votos"].values():
            if v["p"] != periodo:
                continue
            for i, ch in enumerate(v["b"]):
                if ch != "-":
                    cuenta[ids[i]][per["partidos"][DIGITOS.index(ch)]] += 1
        for lid, c in cuenta.items():
            bancada_mas_comun[(lid, periodo)] = c.most_common(1)[0][0]
    for (lid, periodo), siglas in bancada_mas_comun.items():
        p = sil[lid]["periodos"][periodo]
        p.setdefault("partido", siglas)

    # ---------------------------------------------------------- el bufete directivo
    # Sin apóstrofos: el acta escribe «D´Aza», «D’ Aza» y «D'Aza» para la misma persona.
    sin_apostrofo = lambda n: clave(re.sub(r"[’'´`]\s*", "", n))
    por_clave_sil: dict[str, list[int]] = collections.defaultdict(list)
    for lid, d in sil.items():
        por_clave_sil[sin_apostrofo(d["nombre"])].append(lid)
    bufete: dict[int, list[dict]] = collections.defaultdict(list)
    bufetes_leidos = []
    PLANCHA = re.compile(r"Bufete Directivo (?:para|del) (?:el )?año legislativo (\d{4})-(\d{4})", re.I)
    ROL = re.compile(r"(?:el|la) diputad[oa] ([^,;]+?),\s*como (presidente|presidenta|vicepresidente|vicepresidenta)\b", re.I)
    for v in sorted(votaciones.values(), key=lambda x: x["id"]):
        m = PLANCHA.search(v.get("mocion") or "")
        if not m or v["si"] <= v["no"] or not re.match(r"\s*Sometida a votación la plancha", v["mocion"], re.I):
            continue
        anio = f"{m.group(1)}-{m.group(2)}"
        for nombre, rol in ROL.findall(v["mocion"]):
            ids = por_clave_sil.get(sin_apostrofo(nombre), [])
            if len(ids) != 1:
                bufetes_leidos.append({"anio": anio, "rol": rol, "nombre": nombre, "casado": None})
                continue
            bufetes_leidos.append({"anio": anio, "rol": rol, "nombre": nombre, "casado": ids[0]})
            ini = int(m.group(1))
            actual = f"{ini}-08-16" <= hoy <= f"{ini + 1}-08-15"
            periodo = next((per for per, (a, b) in PERIODOS.items() if a <= f"{ini}-08-16" <= b), None)
            puesto = {"presidente": "Presidente", "presidenta": "Presidenta", "vicepresidente": "Vicepresidente",
                      "vicepresidenta": "Vicepresidenta"}[rol.lower()]
            # `n`, su lugar en la jerarquía del Estado como lo ordena el MAP (1 el Presidente de la
            # República): la presidencia de una cámara encabeza un poder, la vicepresidencia la sigue.
            c = {"t": f"{puesto} de la Cámara de Diputados, año legislativo {anio}", "m": "electo" if actual else "anterior",
                 "o": "congreso", "per": periodo if actual else anio, "pep": 2, "vot": v["id"],
                 "n": 2 if rol.lower().startswith("presiden") else 4}
            if not actual:
                c["d"] = v["fecha"]
            bufete[ids[0]].append(c)

    adiciones = []  # lo que lib/funcionarios.ts aplica sobre funcionarios.json
    for lid, (pid, ev) in casados.items():
        d = sil[lid]
        actual = (d["periodos"].get("2024-2028") or {}).get("funcion")
        cargos = [cargo_de(d, per, actual) for per in sorted(d["periodos"]) if per != "2024-2028" or por_leg.get(lid) is None]
        adiciones.append({"persona": pid, "legislador": lid, "evidencia": ev, "cargos": cargos})
    for s in separados:
        d = sil[s["legislador"]]
        nid = nuevo_slug(d["nombre"])
        actual = (d["periodos"].get("2024-2028") or {}).get("funcion")
        adiciones.append({"persona": nid, "nuevo": d["nombre"], "separadoDe": s["persona"], "legislador": s["legislador"],
                          "evidencia": "nodo propio: el casamiento por nombre del directorio chocaba con un cargo incompatible",
                          "cargos": [cargo_de(d, per, actual) for per in sorted(d["periodos"])]})
        s["nuevo"] = nid
    for lid in nuevos + [x["legislador"] for x in dudosos]:
        d = sil[lid]
        nid = nuevo_slug(d["nombre"])
        adiciones.append({"persona": nid, "nuevo": d["nombre"], "legislador": lid,
                          "evidencia": "nodo propio: ninguna persona del grafo casa con este legislador"
                          if lid in nuevos else "nodo propio: casamiento dudoso, en el informe",
                          "cargos": [cargo_de(d, per, None) for per in sorted(d["periodos"])]})
    for lid, cargos in bufete.items():
        a = next((x for x in adiciones if x["legislador"] == lid), None)
        if a is None:
            pid = casados.get(lid, (por_leg[lid]["id"] if lid in por_leg else None,))[0]
            if not pid:
                continue
            a = {"persona": pid, "legislador": lid, "evidencia": casados.get(lid, (None, "por identificador del SIL"))[1], "cargos": []}
            adiciones.append(a)
        a["cargos"].extend(cargos)
    persona_de = {a["legislador"]: a["persona"] for a in adiciones}
    for lid, p in por_leg.items():
        persona_de.setdefault(lid, p["id"])
    for s in separados:
        persona_de[s["legislador"]] = s["nuevo"]

    # ---------------------------------------------------------- asistencia y disidencia
    agregado = lambda: {"listadas": 0, "presente": 0, "si": 0, "no": 0, "abstencion": 0, "sinVoto": 0, "ausente": 0, "otro": 0}
    CAMPO = {"s": "si", "n": "no", "b": "abstencion", "x": "sinVoto", "a": "ausente", "o": "otro"}
    por_leg_agr: dict[int, dict] = collections.defaultdict(lambda: {"periodo": {}, "legislatura": {}, "anio": {}})
    camara = {"periodo": collections.defaultdict(agregado), "legislatura": collections.defaultdict(agregado),
              "anio": collections.defaultdict(agregado)}
    bancadas: dict[str, dict] = collections.defaultdict(lambda: collections.defaultdict(agregado))
    disid: dict[int, dict] = collections.defaultdict(lambda: {"cuenta": collections.Counter(), "base": collections.Counter(), "ultimas": []})
    discrepancias = []
    for vid, v in sorted(nominal["votos"].items(), key=lambda kv: -int(kv[0])):
        acta = votaciones.get(vid)
        if not acta:
            continue
        per = nominal["periodos"][v["p"]]
        ids = [f[0] for f in per["legisladores"]]
        presentes = sum(1 for ch in v["v"] if ch in "snbx")
        if acta.get("presentes") is not None and presentes != acta["presentes"]:
            discrepancias.append({"votacion": int(vid), "nominal": presentes, "acta": acta["presentes"]})
        # El año va con su período: 2024 tiene votaciones de los dos, y no se mezclan.
        claves_t = {"periodo": v["p"], "legislatura": acta["legislatura"],
                    "anio": f"{v['p']}:{(acta.get('fecha') or '')[:4]}" if acta.get("fecha") else ""}
        # Posición de cada bancada.
        sentidos: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
        for i, ch in enumerate(v["v"]):
            b = v["b"][i] if i < len(v["b"]) else "-"
            if ch in "snb" and b != "-":
                sentidos[b][ch] += 1
        posicion = {}
        for b, c in sentidos.items():
            total = sum(c.values())
            sentido, n = c.most_common(1)[0]
            if total >= 3 and n * 2 > total:
                posicion[b] = sentido
        for i, ch in enumerate(v["v"]):
            # «-»: no lo lista; «o»: otro código, en la práctica «ML», manos levantadas: una votación a mano
            # alzada no registra quién estuvo, así que no entra al denominador.
            if ch in "-o":
                continue
            lid = ids[i]
            # Fuera de su ejercicio (dejó el escaño; el SIL a veces lo sigue listando ausente) no cuenta.
            fin_ej = sil[lid]["periodos"].get(v["p"], {}).get("fin")
            if fin_ej and (acta.get("fecha") or "") > fin_ej:
                continue
            b = v["b"][i] if i < len(v["b"]) else "-"
            siglas = per["partidos"][DIGITOS.index(b)] if b != "-" else None
            for eje, k in claves_t.items():
                if not k:
                    continue
                a = por_leg_agr[lid][eje].setdefault(k, agregado())
                for destino in (a, camara[eje][k]) + ((bancadas[f"{eje}:{k}"][siglas],) if siglas else ()):
                    destino["listadas"] += 1
                    destino[CAMPO[ch]] += 1
                    if ch in "snbx":
                        destino["presente"] += 1
            if ch in "snb" and b in posicion:
                disid[lid]["base"][v["p"]] += 1
                if ch != posicion[b]:
                    disid[lid]["cuenta"][v["p"]] += 1
                    if len(disid[lid]["ultimas"]) < TOPE_DISIDENCIAS:
                        mocion = re.sub(r"\s+", " ", acta.get("mocion") or "").strip()
                        disid[lid]["ultimas"].append({"votacion": int(vid), "voto": CAMPO[ch], "bancada": siglas,
                                                       "posicion": CAMPO[posicion[b]], "fecha": acta.get("fecha"),
                                                       "mocion": mocion[:157] + "…" if len(mocion) > 160 else mocion})

    # Cuánto de cada año de cada período está leído: una cifra de un año a medio leer lo dice.
    cobertura_anios: dict[str, dict] = {}
    for vid, v in votaciones.items():
        if not v.get("fecha"):
            continue
        c = cobertura_anios.setdefault(f"{v['periodo']}:{v['fecha'][:4]}", {"votaciones": 0, "leidas": 0})
        c["votaciones"] += 1
        c["leidas"] += vid in nominal["votos"]
    cobertura_anios = dict(sorted(cobertura_anios.items()))

    # ---------------------------------------------------------- salida
    legisladores = []
    for lid, d in sorted(sil.items()):
        estado = "casado" if lid in casados else "separado" if d.get("separado") else \
            "dudoso" if any(x["legislador"] == lid for x in dudosos) else "nuevo" if lid in nuevos else "casado"
        fila = {"id": lid, "nombre": d["nombre"], "camara": d["camara"], "persona": persona_de.get(lid), "estado": estado,
                "evidencia": casados[lid][1] if lid in casados else next((a["evidencia"] for a in adiciones if a["legislador"] == lid), None),
                "periodos": {per: {k: v for k, v in p.items() if k != "fuente" and v} for per, p in sorted(d["periodos"].items())}}
        if lid in por_leg_agr:
            fila["asistencia"] = por_leg_agr[lid]
        if lid in disid:
            fila["disidencia"] = {"cuenta": dict(disid[lid]["cuenta"]), "base": dict(disid[lid]["base"]),
                                  "ultimas": disid[lid]["ultimas"]}
        legisladores.append(fila)
    diputados = [x for x in legisladores if x["camara"] == "diputados"]
    resumen = {
        "legisladores": len(legisladores),
        "directorio": len(directorio),
        "directorioCasados": sum(1 for l in directorio if l["id"] in casados),
        "casados": len(casados),
        "casadosPorIdentificador": sum(1 for _, ev in casados.values() if ev.startswith("por identificador")),
        "casadosPorNombre": sum(1 for _, ev in casados.values() if ev.startswith("por nombre")),
        "dudosos": len(dudosos),
        "avisos": len(avisos),
        "separados": len(separados),
        "nuevos": len(nuevos),
        "conConflicto": sum(1 for lid, (pid, _) in casados.items()
                             if incompatibles(next(p for p in personas if p["id"] == pid), sil[lid])),
        "votacionesConNominal": len(nominal["votos"]),
        "votosNominales": sum(sum(1 for ch in v["v"] if ch != "-") for v in nominal["votos"].values()),
        "discrepancias": len(discrepancias),
        "bufete": sum(1 for b in bufetes_leidos if b["casado"]),
        "bufeteSinCasar": sum(1 for b in bufetes_leidos if not b["casado"]),
        "diputadosConAsistencia": sum(1 for x in diputados if "asistencia" in x),
    }
    salida = {
        "generado": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fuente": nominal.get("fuente"),
        "corte": {"nominal": nominal.get("corte"), "nominalGenerado": nominal.get("generado"),
                  "anios": cobertura_anios,
                  # Hasta dónde llega la lista de votaciones (votaciones.json): las posteriores no están.
                  "votacionesHasta": max((v.get("fecha") or "") for v in votaciones.values()),
                  "votacionesGenerado": json.loads(VOTACIONES.read_text())["generado"][:10],
                  "funcionarios": funcionarios.get("generado"), "directorio": "public/data/congreso.json"},
        "resumen": resumen,
        "legisladores": legisladores,
        "adiciones": adiciones,
        "dudosos": dudosos,
        "separados": separados,
        "avisos": avisos,
        "discrepancias": discrepancias,
        "bufete": bufetes_leidos,
        "camara": {eje: dict(sorted(v.items())) for eje, v in camara.items()},
        "bancadas": {k: dict(v) for k, v in sorted(bancadas.items())},
    }
    SALIDA.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")))
    expedientes = {f[0]: f[1] for f in json.loads(CONGRESO.read_text())["iniciativas"]["filas"]}
    por_expediente: dict[str, list[int]] = collections.defaultdict(list)
    for vid, v in sorted(votaciones.items(), key=lambda kv: int(kv[0])):
        for ini in v.get("iniciativas") or []:
            if ini in expedientes:
                por_expediente[expedientes[ini]].append(int(vid))
    INDICE.write_text(json.dumps({
        "generado": salida["generado"],
        "fechas": {vid: v["fecha"] for vid, v in sorted(votaciones.items(), key=lambda kv: int(kv[0])) if v.get("fecha")},
        "porExpediente": dict(sorted(por_expediente.items())),
    }, ensure_ascii=False, separators=(",", ":")))
    print(json.dumps(resumen, ensure_ascii=False, indent=1), file=sys.stderr)
    if informe:
        print("\nDudosos:", file=sys.stderr)
        for x in dudosos:
            print(f"  {x['legislador']} {x['nombre']}: {x['motivo']} → {', '.join(x['candidatos'])}", file=sys.stderr)
        print("Avisos (casados, a revisar):", file=sys.stderr)
        for x in avisos:
            print(f"  {x['legislador']} {x['nombre']} → {x['persona']}: {x['aviso']}", file=sys.stderr)
        print("Separados:", file=sys.stderr)
        for x in separados:
            print(f"  {x['legislador']} {x['nombre']} (de {x['persona']}): {x['motivo']}", file=sys.stderr)
        print(f"Discrepancias con el acta: {len(discrepancias)}", file=sys.stderr)
        for x in discrepancias[:20]:
            print(f"  votación {x['votacion']}: nominal {x['nominal']}, acta {x['acta']}", file=sys.stderr)
    print(f"→ {SALIDA.relative_to(RAIZ)} ({SALIDA.stat().st_size / 1e6:.2f} MB)", file=sys.stderr)


if __name__ == "__main__":
    main()
