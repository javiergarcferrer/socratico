"""Entradas del buscador para las entidades financieras supervisadas.

Lee `public/data/banca.json` (lo arma `scripts/build-banca.py`) y devuelve una
entrada por entidad (`t="financiera"`): su nombre corto como título, el tipo y
el supervisor como detalle, y como texto auxiliar las siglas, el nombre
anterior, la razón social y el RNC, para que «Banreservas», «banco de
reservas», «COOPNAMA» o su RNC la encuentren. Enlaza a
`/banca/{slug}` (`enlace.entidadFinanciera` de lib/grafo.ts).

Sin vector: el nombre de un banco o de una cooperativa no dice de qué trata
(el criterio de proveedores y legisladores). Peso 0 las que captan dinero del
público bajo la Ley 183-02 (`SECTORES_EIF` de lib/financieras.ts), 1 las demás.
"""
import json

# El nombre de cada sector, como lo dice `SECTORES` en lib/financieras.ts.
SECTOR = {
    "banco-multiple": "Banco múltiple",
    "asociacion": "Asociación de ahorros y préstamos",
    "ahorro-credito": "Banco de ahorro y crédito",
    "corporacion-credito": "Corporación de crédito",
    "entidad-publica": "Entidad pública de intermediación financiera",
    "cooperativa": "Cooperativa",
    "afp": "Administradora de fondos de pensiones",
    "aseguradora": "Aseguradora",
    "cambiaria": "Agente de cambio o de remesas",
    "fiduciaria": "Fiduciaria",
    "informacion-crediticia": "Buró de crédito",
    "oficina-representacion": "Oficina de representación",
}
SUPERVISOR = {
    "sb": "Superintendencia de Bancos",
    "sipen": "Superintendencia de Pensiones",
    "sis": "Superintendencia de Seguros",
    "idecoop": "IDECOOP",
}
EIF = {"banco-multiple", "asociacion", "ahorro-credito", "corporacion-credito", "entidad-publica"}


def entradas(datos) -> tuple[list[dict], str]:
    d = json.loads((datos / "banca.json").read_text(encoding="utf-8"))
    out = []
    for e in d["entidades"]:
        detalle = " · ".join(x for x in (SECTOR.get(e["sector"], e.get("tipo") or ""),
                                         SUPERVISOR.get(e["supervisor"], "")) if x)
        # Las siglas y el nombre anterior también: a una cooperativa se la busca
        # por sus siglas («COOPNAMA»).
        aux = " · ".join(x for x in (e.get("siglas"), e.get("antes"), e.get("razonSocial"),
                                     e.get("rnc") and f"RNC {e['rnc']}", e.get("tipo")) if x)[:240]
        out.append({
            "t": "financiera",
            "ti": e["nombre"],
            "x": aux,
            "d": detalle,
            "h": f"/banca/{e['slug']}",
            "p": 0 if e["sector"] in EIF else 1,
        })
    return out, d["generado"]
