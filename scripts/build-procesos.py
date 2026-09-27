#!/usr/bin/env python3
"""Genera public/data/procesos.json: los procesos de compra publicados en los
últimos 12 meses, con su carátula, para que el buscador encuentre «compra de
computadoras», «alquiler de vehículos» o «construcción de aulas».

Una sola descarga, sin clave, de la sección «Tablas» del portal de datos
abiertos de la DGCP (la misma de `scripts/build-historico.py`, verificada el
2026-09-27):

- `…/api-dgcp/v1/tablas/procesos?Type=csv` — ~245 MB, ~632 mil procesos
  desde 2015, en ~5 s, `content-type: text/csv`, límite declarado de 60
  peticiones por minuto. Columnas: CODIGO_PROCESO, CODIGO_UNIDAD_COMPRA,
  UNIDAD_COMPRA, MODALIDAD, TIPO_EXCEPCION, **CARATULA** (el objeto del
  proceso en texto libre, casi siempre en MAYÚSCULAS), ESTADO_PROCESO,
  MONEDA, MONTO_ESTIMADO, FECHA_PUBLICACION, DIRIGIDO_MIPYMES(_MUJERES),
  OBJETO_PROCESO (Bienes/Servicios/Obras…), DECRETO_PRESIDENCIAL,
  COMPRA_VERDE, COMPRA_CONJUNTA y URL. Viene ordenada de la publicación más
  reciente a la más vieja, pero no se confía en eso: se lee entera.

La API paginada (`/procesos`, `lib/dgcp.ts`) trae los mismos campos (título y
descripción) pero a ~100 filas por página: 77 mil procesos serían cientos de
peticiones. La tabla es una.

**El corte.** Doce meses hacia atrás desde la publicación más reciente de la
tabla (no desde hoy: si la DGCP se atrasa, la ventana no se encoge). El
2026-09-27 fueron 77,334 procesos (del 2025-09-27 al 2026-09-25), por debajo
del techo de ~90 mil: entran todos, incluidos los cancelados y desiertos —se
buscan igual y la ficha dice su estado—. El monto estimado solo se guarda en
pesos (DOP); los ~140 en otras monedas quedan sin monto.

**Formato.** Filas como listas y los textos que se repiten (unidad de compra,
modalidad, estado, objeto) en tablas aparte referidas por índice. La ficha
enlazada (`/procesos/{codigo}`, `enlace.proceso` de lib/grafo.ts) lee el
resto en vivo de la API.

Sin teléfonos ni correos: la tabla no los trae.

Uso:
    python3 scripts/build-procesos.py              # descarga la tabla
    python3 scripts/build-procesos.py --local DIR  # usa DIR/procesos.csv
"""
import csv
import datetime
import io
import json
import pathlib
import re
import sys
import time
import urllib.request
from collections import Counter, defaultdict

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "public" / "data" / "procesos.json"
UA = "Socratico-Inteligencia/1.0 (indice de procesos de compra; herramienta independiente)"
URL_PROCESOS = "https://datosabiertos.dgcp.gob.do/api-dgcp/v1/tablas/procesos?Type=csv"
DIAS = 365
TECHO = 90_000

csv.field_size_limit(10_000_000)


def bajar(url: str) -> bytes:
    for intento in (1, 2):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=600) as r:
                tipo = r.headers.get("content-type", "")
                if "text/csv" not in tipo:
                    raise RuntimeError(f"{url}: content-type inesperado «{tipo}»")
                return r.read()
        except Exception as e:  # noqa: BLE001 — un reintento y fuera
            if intento == 2:
                raise
            print(f"  reintento {url}: {e}", file=sys.stderr)
            time.sleep(10)
    raise AssertionError


def limpio(s: str | None) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def main() -> None:
    if "--local" in sys.argv:
        d = pathlib.Path(sys.argv[sys.argv.index("--local") + 1])
        crudo = (d / "procesos.csv").read_bytes()
    else:
        print("Descargando procesos…", file=sys.stderr)
        crudo = bajar(URL_PROCESOS)
    texto = crudo.decode("utf-8", "replace")
    del crudo

    # Primera pasada: la publicación más reciente fija la ventana.
    filas = []
    hasta = ""
    for r in csv.DictReader(io.StringIO(texto)):
        f = (r.get("FECHA_PUBLICACION") or "")[:10]
        if len(f) != 10 or not (r.get("CODIGO_PROCESO") or "").strip():
            continue
        hasta = max(hasta, f)
        filas.append(r)
    del texto
    desde = (datetime.date.fromisoformat(hasta) - datetime.timedelta(days=DIAS)).isoformat()

    uc_nombres: dict[str, Counter] = defaultdict(Counter)
    por_codigo: dict[str, dict] = {}
    sin_caratula = 0
    otras_monedas = 0
    for r in filas:
        f = r["FECHA_PUBLICACION"][:10]
        if f < desde:
            continue
        codigo = limpio(r["CODIGO_PROCESO"])
        caratula = limpio(r.get("CARATULA"))
        if not caratula:
            sin_caratula += 1
            continue
        uc = limpio(r.get("CODIGO_UNIDAD_COMPRA")) or "?"
        uc_nombres[uc][limpio(r.get("UNIDAD_COMPRA"))] += 1
        monto = 0
        if limpio(r.get("MONEDA")) == "DOP":
            try:
                monto = round(float(r.get("MONTO_ESTIMADO") or 0))
            except ValueError:
                monto = 0
        else:
            otras_monedas += 1
        fila = {
            "codigo": codigo,
            "uc": uc,
            "modalidad": limpio(r.get("MODALIDAD")) or "Sin modalidad",
            "estado": limpio(r.get("ESTADO_PROCESO")) or "Sin estado",
            "objeto": limpio(r.get("OBJETO_PROCESO")),
            "caratula": caratula,
            "fecha": f,
            "monto": max(monto, 0),
        }
        # Un código repetido: gana la publicación más reciente.
        previo = por_codigo.get(codigo)
        if previo is None or f >= previo["fecha"]:
            por_codigo[codigo] = fila
    del filas

    elegidos = sorted(por_codigo.values(), key=lambda p: (p["fecha"], p["codigo"]), reverse=True)
    recortado = len(elegidos) > TECHO
    if recortado:
        elegidos = elegidos[:TECHO]
        desde = elegidos[-1]["fecha"]

    def tabla(clave: str) -> tuple[list[str], dict[str, int]]:
        valores = sorted({p[clave] for p in elegidos})
        return valores, {v: i for i, v in enumerate(valores)}

    ucs, i_uc = tabla("uc")
    modalidades, i_mod = tabla("modalidad")
    estados, i_est = tabla("estado")
    objetos, i_obj = tabla("objeto")
    unidades = [uc_nombres[u].most_common(1)[0][0] or f"Unidad de compra {u}" for u in ucs]

    salida = {
        "generado": datetime.date.today().isoformat(),
        "fuente": URL_PROCESOS,
        "desde": desde,
        "hasta": hasta,
        "total": len(elegidos),
        "recortado": recortado,
        "unidades": unidades,
        "modalidades": modalidades,
        "estados": estados,
        "objetos": objetos,
        "columnas": ["codigo", "unidad", "modalidad", "estado", "objeto", "caratula", "fecha", "monto"],
        "filas": [
            [p["codigo"], i_uc[p["uc"]], i_mod[p["modalidad"]], i_est[p["estado"]],
             i_obj[p["objeto"]], p["caratula"], p["fecha"], p["monto"]]
            for p in elegidos
        ],
    }
    SALIDA.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")))
    print(
        f"{len(elegidos)} procesos ({desde} → {hasta}), {len(unidades)} unidades, "
        f"{sin_caratula} sin carátula, {otras_monedas} en otra moneda, "
        f"{SALIDA.stat().st_size / 1e6:.1f} MB",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
