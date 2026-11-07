#!/bin/bash
# Todo lo que sale de las instantáneas sin red, en el orden de
# docs/INFRAESTRUCTURA.md §6: el grafo compilado, su volcado, sus tablas, el
# volcado de SPARQL, el corpus y el índice del buscador, y el informe SHACL
# (que valida contra `next start` sobre un build de este árbol). Tras correrlo,
# `./.claude/hooks/verificar.sh --completo` comprueba lo mismo de vuelta.
#
# Lo corre el flujo `.github/workflows/refrescar.yml` después de refrescar
# fuentes o textos; a mano, tras correr un script de instantánea. Se detiene
# en el primer paso que falla.
set -euo pipefail
cd "$(dirname "$0")/.."
paso() { echo "== $1"; }

paso "grafo";            node --max-old-space-size=6144 scripts/build-grafo.mjs
paso "volcado";          node --max-old-space-size=6144 scripts/build-grafo-volcado.mjs
paso "tablas";           node --max-old-space-size=6144 scripts/build-grafo-tablas.mjs
paso "sparql";           node --max-old-space-size=6144 scripts/build-sparql.mjs
paso "corpus";           python3 scripts/build-busqueda.py
paso "índice";           node --no-warnings scripts/build-indice-busqueda.mjs
paso "build";            npm run build

paso "informe SHACL"
puerto="$(node -e 'const s=require("net").createServer().listen(0,()=>{console.log(s.address().port);s.close()})')"
node node_modules/next/dist/bin/next start -p "$puerto" > "${TMPDIR:-/tmp}/compilar-start.log" 2>&1 &
srv=$!
trap 'kill "$srv" 2>/dev/null' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$puerto/robots.txt" && break; sleep 1; done
# Las mismas opciones que el paso 6c del gate: el informe es el de esa validación.
node --max-old-space-size=6144 scripts/validar-grafo.mjs --url "http://localhost:$puerto" --personas 300 --escribir | tail -3
