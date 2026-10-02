#!/usr/bin/env python3
"""Genera public/data/fiscal.json: ejecución presupuestaria por institución.

La API de datos abiertos del SIGEF (docs/INFRAESTRUCTURA.md §5.2) sirve la ejecución del
Presupuesto General del Estado sin clave, pero calcula el año en curso en vivo:
una sección entera tarda ~97 s y una institución suelta entre 20 y 90 s. Eso no
cabe en un request de la web, así que —como la nómina y la deuda— se consolida
en una instantánea que la plataforma lee al instante.

Son tres llamadas, una por sección institucional. Regenerar cuando Hacienda
publique un mes nuevo (suele ser mensual):

    python3 scripts/build-fiscal.py

Semántica del origen, verificada fila a fila y fácil de leer mal:
  · PRESUPUESTO INICIAL aparece solo en el mes 1 (la apertura del año).
  · PRESUPUESTO VIGENTE es un DELTA MENSUAL: el mes 1 trae la apertura y los
    demás las modificaciones, con signo. El vigente real es la SUMA del año.
  · DEVENGADO y PAGADO son flujos mensuales; el acumulado es su suma.
"""
import datetime
import json
import os
import sys
import urllib.request

BASE = ("https://api-sigef.hacienda.gob.do/servicios/datosabiertos"
        "/portaltransparencia")
UA = ("Socratico-Inteligencia/1.0 (instantanea de ejecucion presupuestaria; "
      "herramienta independiente)")
SECCIONES = {
    "11111": "Administración Central",
    "11112": "Instituciones Públicas Descentralizadas y Autónomas No Financieras",
    "11113": "Instituciones Públicas de la Seguridad Social",
}
# El origen tarda ~97 s por sección; damos margen y no reintentamos en vano.
TIMEOUT = 420


def get(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def num(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def main() -> None:
    hoy = datetime.date.today()
    anio = int(sys.argv[1]) if len(sys.argv) > 1 else hoy.year
    # El corte que pide la URL: el mes en curso para el año vigente, diciembre
    # para un año cerrado (es lo que hace el propio portal de Hacienda).
    corte = f"{hoy.month:02d}" if anio == hoy.year else "12"

    capitulos: dict[str, dict] = {}
    for seccion, nombre_seccion in SECCIONES.items():
        url = (f"{BASE}/gastos/institucion/{anio}/{corte}/json"
               f"?seccion={seccion}&capitulo=")
        print(f"· {nombre_seccion} … ", end="", flush=True)
        try:
            filas = get(url)
        except Exception as e:  # noqa: BLE001 — una sección caída no aborta el resto
            print(f"sin respuesta ({e})")
            continue
        print(f"{len(filas)} filas")

        for f in filas:
            codigo = str(f.get("CODIGO CAPITULO") or "").strip()
            if not codigo:
                continue
            c = capitulos.setdefault(codigo, {
                "codigo": codigo,
                "nombre": (f.get("NOMBRE CAPITULO") or "").strip(),
                "seccion": seccion,
                "inicial": 0.0,
                "vigente": 0.0,
                "comprometido": 0.0,
                "devengado": 0.0,
                "pagado": 0.0,
                "meses": {},
                "unidades": {},
            })
            c["inicial"] += num(f.get("PRESUPUESTO INICIAL"))
            c["vigente"] += num(f.get("PRESUPUESTO VIGENTE"))
            c["comprometido"] += num(f.get("COMPROMISO"))
            c["devengado"] += num(f.get("DEVENGADO"))
            c["pagado"] += num(f.get("PAGADO"))

            mes = int(num(f.get("MES DEVENGADO")))
            if 1 <= mes <= 12:
                m = c["meses"].setdefault(mes, {"devengado": 0.0, "pagado": 0.0})
                m["devengado"] += num(f.get("DEVENGADO"))
                m["pagado"] += num(f.get("PAGADO"))

            ue = (f.get("NOMBRE UNIDAD EJECUTORA") or "").strip()
            if ue:
                u = c["unidades"].setdefault(ue, 0.0)
                c["unidades"][ue] = u + num(f.get("DEVENGADO"))

    if not capitulos:
        raise SystemExit("El SIGEF no respondió ninguna sección; no se escribe nada.")

    salida = []
    for c in capitulos.values():
        meses = [{"mes": k, "devengado": round(v["devengado"], 2),
                  "pagado": round(v["pagado"], 2)}
                 for k, v in sorted(c["meses"].items())]
        unidades = sorted(c["unidades"].items(), key=lambda kv: -kv[1])[:6]
        salida.append({
            "codigo": c["codigo"],
            "nombre": c["nombre"],
            "seccion": c["seccion"],
            "inicial": round(c["inicial"], 2),
            "vigente": round(c["vigente"], 2),
            "comprometido": round(c["comprometido"], 2),
            "devengado": round(c["devengado"], 2),
            "pagado": round(c["pagado"], 2),
            "meses": meses,
            "unidades": [{"nombre": n, "devengado": round(v, 2)}
                         for n, v in unidades if v > 0],
        })
    salida.sort(key=lambda c: -c["devengado"])

    mes_corte = max((m["mes"] for c in salida for m in c["meses"]), default=0)
    doc = {
        "generadoEn": datetime.datetime.now(datetime.timezone.utc)
                        .isoformat(timespec="seconds"),
        "anio": anio,
        "mesCorte": mes_corte,
        "fuente": f"{BASE}/gastos/institucion/{anio}/{corte}/json",
        "instituciones": salida,
    }

    ruta = os.path.join(os.path.dirname(__file__), "..", "public", "data",
                        "fiscal.json")
    with open(os.path.abspath(ruta), "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, separators=(",", ":"))

    total = sum(c["devengado"] for c in salida)
    print(f"\n{len(salida)} instituciones · corte mes {mes_corte}/{anio} · "
          f"devengado RD$ {total:,.0f}")
    print(f"→ {os.path.abspath(ruta)}")


if __name__ == "__main__":
    main()
