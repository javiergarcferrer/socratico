"""Entradas del buscador: los procesos de compra de la DGCP publicados en los
últimos 12 meses (`scripts/build-procesos.py` → public/data/procesos.json).

El título es la carátula tal como la publica la unidad de compra —casi
siempre en MAYÚSCULAS, y así se deja—; el detalle es modalidad y etapa en
corto; el enlace, la ficha en vivo, lo deriva el servidor del código (`r`) con
`enlace.proceso` de lib/grafo.ts: hay códigos con espacios y tildes
(«Hosp. Reid Cabral-DAF-CD-…») y ahí se codifican como `encodeURIComponent`.
"""
import json
import pathlib

# El literal de la DGCP, dicho corto (las etapas de lib/estados.ts).
ESTADO = {
    "Proceso publicado": "Abierto a ofertas",
    "Proceso con etapa cerrada": "Recepción cerrada",
    "Sobres estan abriendose": "En evaluación",
    "Sobres abiertos o aperturados": "En evaluación",
    "Proceso adjudicado y celebrado": "Adjudicado",
    "Proceso desierto": "Desierto",
    "Cancelado": "Cancelado",
    "Suspendido": "Suspendido",
}
MODALIDAD = {
    "Compras por Debajo del Umbral": "Compra menor al umbral",
    "Procesos de Excepción": "Excepción",
}


def entradas(datos: pathlib.Path) -> tuple[list[dict], str]:
    d = json.loads((datos / "procesos.json").read_text())
    unidades, modalidades, estados, objetos = d["unidades"], d["modalidades"], d["estados"], d["objetos"]
    out = []
    for codigo, iu, im, ie, io, caratula, fecha, monto in d["filas"]:
        modalidad = modalidades[im]
        estado = estados[ie]
        e = {
            "t": "proceso",
            "ti": caratula,
            # El código va en `r`: el servidor lo busca como texto auxiliar y
            # deriva de él la ficha (`enlace.proceso`), que así no se escribe
            # 78 mil veces en el corpus.
            "r": codigo,
            "x": " ".join(s for s in (modalidad, objetos[io]) if s),
            "d": f"{MODALIDAD.get(modalidad, modalidad)} · {ESTADO.get(estado, estado)}",
            "on": unidades[iu],
            "f": fecha,
            # Son decenas de miles y cada uno es una compra puntual: van
            # detrás de las instituciones, normas y obras que nombran.
            "p": 1,
        }
        if monto:
            e["v"] = monto
        out.append(e)
    # El archivo ya viene ordenado (fecha y código, descendente): orden estable.
    return out, d["hasta"]
