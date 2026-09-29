#!/usr/bin/env python3
"""El índice dice la verdad: toda página es un destino o declara por qué no.

`lib/indice.ts` deriva el índice de la plataforma de `lib/menu.ts`, donde cada
enlace declara su tarea. Esta comprobación cruza ese índice con las páginas
que de verdad existen en `app/`:

  1. Una página estática (sin segmento dinámico) que no está en el menú ni en
     `FUERA_DEL_INDICE` es una página huérfana: nadie llega a ella por el
     menú, la paleta ni el mapa del sitio.
  2. Un enlace del menú o una entrada de `FUERA_DEL_INDICE` sin página es un
     destino a ninguna parte.
  3. Un solo árbol (2026-09-29): cada enlace de una columna `columna("x", …)`
     cae dentro de las `rutas` de la sección `x` de `lib/secciones.ts`. Si no,
     el lector abre una puerta con un nombre y llega a una página cuya barra de
     sección no se enciende, o se enciende con otro: la sopa que esto cerró.

Imprime una línea por hallazgo y sale con 1 si hay alguno.
"""

import pathlib
import re
import sys

raiz = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
app = raiz / "app"

paginas = set()
for f in app.rglob("page.tsx"):
    partes = f.relative_to(app).parts[:-1]
    # Los grupos de rutas `(x)` no cuentan en la URL.
    partes = [p for p in partes if not (p.startswith("(") and p.endswith(")"))]
    if any(p.startswith("[") for p in partes):
        continue
    paginas.add("/" + "/".join(partes) if partes else "/")

menu = (raiz / "lib" / "menu.ts").read_text(encoding="utf-8")
en_menu = set(re.findall(r'href: "(/[^"?#]*)"', menu))

indice = (raiz / "lib" / "indice.ts").read_text(encoding="utf-8")
bloque = re.search(r"FUERA_DEL_INDICE[^=]*=\s*\{(.*?)\n\};", indice, re.S)
fuera = set(re.findall(r'"(/[^"]*)":', bloque.group(1))) if bloque else set()

hallazgos = []
for p in sorted(paginas - en_menu - fuera):
    hallazgos.append(f"page without index entry: {p} — add it to lib/menu.ts with its tarea, or to FUERA_DEL_INDICE with a reason")
for p in sorted((en_menu | fuera) - paginas):
    hallazgos.append(f"index entry without page: {p}")

secciones = (raiz / "lib" / "secciones.ts").read_text(encoding="utf-8")
rutas_de = {}
for m in re.finditer(r'\n    id: "([a-z-]+)",(.*?)\n    rutas: \[(.*?)\]', secciones, re.S):
    rutas_de[m.group(1)] = re.findall(r'"(/[^"]*)"', m.group(3))
if not rutas_de:
    hallazgos.append("could not read the sections of lib/secciones.ts")

# Cada columna se abre con `columna(` y termina donde empieza la siguiente
# apertura (o el cierre del grupo): partir por aperturas no depende de cómo se
# cierre la lista, así que una columna cerrada en su misma línea no se come a
# la siguiente.
llamadas = [m.start() for m in re.finditer(r"(?<!function )\bcolumna\(", menu)]
columnas = 0
for i, ini in enumerate(llamadas):
    fin = llamadas[i + 1] if i + 1 < len(llamadas) else len(menu)
    trozo = menu[ini:fin]
    m = re.match(r"""columna\(\s*["'`]([a-z-]+)["'`]\s*,""", trozo)
    if not m:
        hallazgos.append(f"unreadable columna(...) call in lib/menu.ts: {trozo[:60]!r}")
        continue
    columnas += 1
    sid = m.group(1)
    # Solo hasta el cierre de esta columna; lo que siga (otra columna escrita a
    # mano, el destacado) no es suyo.
    cierre = re.search(r"\]\s*\)", trozo)
    cuerpo = trozo[: cierre.start()] if cierre else trozo
    if sid not in rutas_de:
        hallazgos.append(f"menu column for unknown section: {sid}")
        continue
    for href in re.findall(r"""href:\s*["'`](/[^"'`?#]*)""", cuerpo):
        if not any(href == r or href.startswith(r + "/") for r in rutas_de[sid]):
            hallazgos.append(f"menu link {href} sits in column «{sid}» but is outside that section's rutas in lib/secciones.ts")
if not columnas:
    hallazgos.append("no columna(\"<sección>\", …) call found in lib/menu.ts: the tree check read nothing")
# Una columna escrita a mano con `seccion:` se saltaría todo lo anterior.
if re.search(r"""\bseccion:\s*["'`]""", menu):
    hallazgos.append("a menu column declares `seccion:` by hand; build it with columna(\"<sección>\", …) so the tree check sees it")

print("\n".join(hallazgos))
sys.exit(1 if hallazgos else 0)
