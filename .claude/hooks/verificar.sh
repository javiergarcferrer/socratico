#!/bin/bash
# The gate. `--rapido` (default): typecheck + identity + statelessness scan,
# ~3 s. `--completo`: also `next build`, the only real gate this repo has
# (no tests, no ESLint). Used by the Stop hook (rapido) and /verificar.
# Prints a report; exit 1 on any failure.
source "$(dirname "$0")/lib.sh"
cd "$ROOT" || exit 1
modo="${1:---rapido}"
fallos=0
ok()   { echo "  ok   $1"; }
mal()  { echo "  FAIL $1"; fallos=$((fallos+1)); }

echo "verificar ($modo) — $(git branch --show-current 2>/dev/null) @ $(git rev-parse --short HEAD 2>/dev/null)"

# 0. Dependencies.
if [ -d node_modules/next ]; then ok "node_modules present"; else mal "node_modules missing — npm ci"; fi

# 1. Typecheck.
if [ -d node_modules/typescript ]; then
  if salida="$(timeout 120 npx tsc --noEmit --pretty false 2>&1)" && [ -z "$salida" ]; then
    ok "tsc --noEmit"
  else
    mal "tsc --noEmit"; printf '%s\n' "$salida" | head -20 | sed 's/^/       /'
  fi
fi

# 2. Identity (.claude/rules/identidad.md prohibitions) across the UI tree.
hallazgos="$( { grep -rnE "$IDENTIDAD_PATRONES" app components --include=*.tsx --include=*.css 2>/dev/null; \
                grep -rnP "$EMOJI_PATRON" app components --include=*.tsx 2>/dev/null; } \
              | grep -vE ':[0-9]+:[[:space:]]*(//|/?\*)' | head -10)"
if [ -z "$hallazgos" ]; then ok "identity: no gradients/blur/glass shadows/rounded-2xl+/emoji"; else mal "identity violations"; printf '%s\n' "$hallazgos" | sed 's/^/       /'; fi

# 2b. Controls that promise a response and give none (see sin-efecto.py).
if command -v python3 >/dev/null 2>&1; then
  if muertos="$(python3 "$(dirname "$0")/sin-efecto.py" "$ROOT" 2>/dev/null)" && [ -z "$muertos" ]; then
    ok "hover: every hover changes something"
  else
    mal "hover without effect"; printf '%s\n' "$muertos" | sed 's/^/       /'
  fi
fi

# 2c. Magnitude travels in words (.claude/rules/identidad.md): «MM» reads *millones* in
# Dominican usage, so an amount abbreviated MM/M/K is off by up to 1,000×.
abrev="$(grep -rnE '\)\}?(MM|M|K)`' app components lib --include=*.ts --include=*.tsx 2>/dev/null \
         | grep -vE ':[0-9]+:[[:space:]]*(//|/?\*)' | head -5)"
if [ -z "$abrev" ]; then ok "magnitudes: no MM/M/K abbreviations on amounts"; else mal "amount abbreviated as MM/M/K — use formatPesos/formatMagnitud"; printf '%s\n' "$abrev" | sed 's/^/       /'; fi

# 2d. The index tells the truth (see indice.py): every static page is a
# destination with its task in lib/menu.ts, or declared out of the index.
if command -v python3 >/dev/null 2>&1; then
  if huerf="$(python3 "$(dirname "$0")/indice.py" "$ROOT" 2>&1)" && [ -z "$huerf" ]; then
    ok "index: every page is a destination with its task, or declared out"
  else
    mal "index drift"; printf '%s\n' "$huerf" | sed 's/^/       /'
  fi
fi

# 2e. Motion goes through its tokens (docs/INFRAESTRUCTURA.md §11.4): no curve
# written by hand in a component, no bounce, nothing slower than a sheet.
mov="$(grep -rnE 'cubic-bezier\(|animate-bounce|duration-\[|duration-(3[5-9][0-9]|[4-9][0-9]{2}|[0-9]{4})([^0-9]|$)' app components --include=*.tsx 2>/dev/null \
       | grep -vE ':[0-9]+:[[:space:]]*(//|/?\*)' | head -5)"
if [ -z "$mov" ]; then ok "motion: curves and durations come from the tokens"; else mal "hand-written motion — use ease-firma/sello/salida/estampa and the --dur-* tokens"; printf '%s\n' "$mov" | sed 's/^/       /'; fi

# 2f. The graph (docs/INFRAESTRUCTURA.md §7.1): every entity address comes
# from lib/grafo.ts (`enlace.*`), so a link cannot be built by hand and drift.
grafo="$(grep -rnE '[`"]/(instituciones|proveedores|procesos|normativa|congreso|obras|provincias|finanzas|funcionarios|banca|empresas)/(\$\{|[a-z0-9-]+/\$\{|"[[:space:]]*\+)' app components lib --include=*.ts --include=*.tsx 2>/dev/null \
         | grep -vE '^lib/grafo' | grep -vE ':[0-9]+:[[:space:]]*(//|/?\*)' | head -5)"
if [ -z "$grafo" ]; then ok "graph: every entity href comes from lib/grafo.ts"; else mal "entity href built by hand — use enlace.* from lib/grafo.ts"; printf '%s\n' "$grafo" | sed 's/^/       /'; fi

# 2g. The graph's builders run only in the compiler (docs/INFRAESTRUCTURA.md §7.4):
# a route that imports them reads every snapshot again on each request and
# drags them all into its function. The server reads datos/grafo/.
constructores="$(grep -rnE 'from "@/lib/grafo-constructores"' app components lib --include=*.ts --include=*.tsx 2>/dev/null | head -5)"
if [ -z "$constructores" ]; then ok "graph: no route imports the builders (lib/grafo-constructores.ts)"; else mal "a route imports lib/grafo-constructores.ts — read the compiled graph (lib/grafo-compilado.ts)"; printf '%s\n' "$constructores" | sed 's/^/       /'; fi

# 3. Statelessness: env vars and Supabase confined to /democracia.
fuera="$( { grep -rlE 'process\.env\.' app lib components --include=*.ts --include=*.tsx 2>/dev/null; \
            grep -rlE "$IMPORTA_CLIENTE" app lib components --include=*.ts --include=*.tsx 2>/dev/null; } \
          | sort -u | while read -r f; do es_archivo_con_estado "$f" || echo "$f"; done)"
if [ -z "$fuera" ]; then ok "stateless surfaces: no env/DB outside /democracia and the account spaces"; else mal "env/DB reached a stateless surface"; printf '%s\n' "$fuera" | sed 's/^/       /'; fi

# 4. Secrets anywhere tracked.
sec="$( { git grep -nE "$SECRETO_VALORES" -- ':!package-lock.json' ':!.claude/hooks/*'; \
          git grep -nE "$SECRETO_NOMBRES" -- ':!package-lock.json' ':!.claude/hooks/*' ':!supabase/*' ':!*.md'; } 2>/dev/null | head -5)"
if [ -z "$sec" ]; then ok "no server keys in tracked files"; else mal "possible secret in tracked files"; printf '%s\n' "$sec" | sed 's/^/       /'; fi

# 5. Documentation duties: a new lib adapter or route should be declared.
nuevos="$(git diff --name-only --diff-filter=A origin/main...HEAD 2>/dev/null; git status --porcelain 2>/dev/null | grep -E '^\?\?|^A' | awk '{print $2}')"
if printf '%s\n' "$nuevos" | grep -qE '^lib/[a-z-]+\.ts$'; then
  if git diff --quiet origin/main...HEAD -- app/fuentes/page.tsx CLAUDE.md 2>/dev/null && git diff --quiet -- app/fuentes/page.tsx CLAUDE.md 2>/dev/null; then
    mal "new lib/*.ts adapter without touching app/fuentes/page.tsx or CLAUDE.md — declare the source and its limits"
  else ok "new adapter is declared in /fuentes or CLAUDE.md"; fi
fi

# 5a. The search index belongs to its corpus and its vectors: the server
#     reads only indice.bin (word index + corpus by columns), so a stale one
#     is not an error at runtime — it silently serves the previous corpus.
if [ -f public/data/busqueda/corpus.json ]; then
  if etq="$(node -e '
    const fs = require("fs");
    const c = JSON.parse(fs.readFileSync("public/data/busqueda/corpus.json", "utf8"));
    const b = fs.readFileSync("public/data/busqueda/indice.bin");
    if (b.subarray(0, 4).toString() !== "SIB2") { console.log("indice.bin is not SIB2"); process.exit(); }
    const cab = JSON.parse(b.subarray(8, 8 + b.readUInt32LE(4)).toString());
    const esperada = `${c.generado}|${c.huella ?? "sin-huella"}|${c.docs.length}`;
    if (cab.etiqueta !== esperada) console.log(`indice.bin ${cab.etiqueta} != corpus ${esperada}`);
    const v = require("crypto").createHash("sha256").update(fs.readFileSync("public/data/busqueda/vectores.bin")).digest("hex");
    if (cab.vectores !== v) console.log("indice.bin was built with another vectores.bin");
  ' 2>&1)" && [ -z "$etq" ]; then
    ok "search: indice.bin matches corpus.json and vectores.bin"
  else
    mal "search index out of date — node scripts/build-indice-busqueda.mjs"; printf '%s\n' "$etq" | sed 's/^/       /'
  fi
fi

# 5a'. GitHub refuses a file over 100 MiB, and main is what deploys: a
#      snapshot that grows past it stops every deploy. Fail with headroom.
grandes="$(git ls-files -z 2>/dev/null | xargs -0 stat -c '%s %n' 2>/dev/null \
           | awk '{s=$1; $1=""; if (s > 90000000) printf "%s (%.1f MB)\n", substr($0, 2), s/1e6}')"
if [ -z "$grandes" ]; then ok "size: every tracked file under 90 MB (GitHub refuses 100 MiB)"
else mal "tracked file over 90 MB — split it before GitHub refuses the push (docs/INFRAESTRUCTURA.md §8.1)"; printf '%s\n' "$grandes" | sed 's/^/       /'; fi

# 5b. The harness's own claims (ceiling, paths, rule ownership, frontmatter).
if arn="$("$(dirname "$0")/harness.sh" "$ROOT" 2>&1)" && [ -z "$arn" ]; then
  ok "harness: CLAUDE.md within budget, paths resolve, rules own a page, frontmatter valid"
else
  mal "harness drift"; printf '%s\n' "$arn" | sed 's/^/       /'
fi

# 5c–6c. The heavy half, completo only (docs/INFRAESTRUCTURA.md §12.6). Four
#     independent units run at once —the cédula scan, the compiled graph
#     against its builders, the search against the graph, and the build with
#     the MCP evaluation and SHACL over `next start`— and report in this fixed
#     order. Each is deterministic over the files it reads: a green is
#     remembered under `huella_de` those files (lib.sh), and the same content
#     is not checked twice (a rebase that does not touch them, a rerun). One
#     byte of input changed and the unit runs whole; a red is never remembered.
if [ "$modo" = "--completo" ]; then
  TMPD="$(mktemp -d)"
  # Interrupted (a timeout, ^C), nothing the gate started may outlive it.
  trap 'kill $(jobs -p) 2>/dev/null; rm -f "$TMPD"/* 2>/dev/null; rmdir "$TMPD" 2>/dev/null' EXIT

  # unidad <nombre> <huella> <función>: corre la función (o lee su verde) y deja
  # <nombre>.rc, <nombre>.out (el informe: una línea por `ok`) y <nombre>.via.
  unidad() {
    local nombre="$1" h="$2" fn="$3" s
    if memo_leer "$nombre" "$h" > "$TMPD/$nombre.out" 2>/dev/null; then
      echo 0 > "$TMPD/$nombre.rc"; echo "memo" > "$TMPD/$nombre.via"; return
    fi
    s=$(date +%s)
    "$fn" > "$TMPD/$nombre.out" 2>&1; echo $? > "$TMPD/$nombre.rc"
    echo "$(( $(date +%s) - s )) s" > "$TMPD/$nombre.via"
    [ "$(cat "$TMPD/$nombre.rc")" = 0 ] && memo_guardar "$nombre" "$h" "$(cat "$TMPD/$nombre.out")"
  }

  # 5c. Nunca la cédula: ninguna instantánea de public/data ni tabla de
  #     public/tablas, que se sirven tal cual, ni el grafo compilado de datos/,
  #     que viaja en las funciones, la guarda, ni la que traiga un título
  #     oficial. Lee ~230 MB; las tablas Parquet las lee DuckDB.
  u_cedulas() {
    local ced
    ced="$(python3 "$(dirname "$0")/cedulas.py" "$ROOT" 2>&1; node "$(dirname "$0")/cedulas-tablas.mjs" "$ROOT" 2>&1)" && [ -z "$ced" ] \
      && { echo "privacy: no cédula in public/data, public/tablas or datos"; return 0; }
    printf '%s\n' "$ced" | head -5; return 1
  }
  # 5d. The graph the server reads is what the builders say (§7.4):
  #     `describir()` reads datos/grafo/, so a stale one silently serves the
  #     previous graph. Re-describes every node and compares it, triple by
  #     triple, with what the server's own reader gets.
  u_grafo() {
    local g
    g="$(node scripts/build-grafo.mjs --comprobar 2>&1)" && { echo "compiled graph: $(printf '%s\n' "$g" | tail -1)"; return 0; }
    printf '%s\n' "$g" | tail -10; return 1
  }
  # 5e. The search says what the graph says (§8.2): every corpus entry that
  #     leads to a node leads to one compiled node, and every searchable node
  #     has its entry, save those `FUERA` leaves out by a stated rule.
  u_busqueda() {
    [ -f public/data/busqueda/corpus.json ] || { echo "search ↔ graph: no corpus"; return 0; }
    local c
    c="$(node --no-warnings scripts/busqueda-grafo.mjs --comprobar 2>&1)" && { echo "search ↔ graph: $(printf '%s\n' "$c" | tail -1)"; return 0; }
    printf '%s\n' "$c" | tail -10; return 1
  }
  # 6. Build (the only real gate this repo has), then 6b the MCP server
  #    answers what it promises (§9.5, every tool against `next start`, each
  #    case against an oracle read from the snapshots) and 6c the graph
  #    conforms to its ontology (§7.2: the dump plus 300 people against the
  #    SHACL shapes of lib/ontologia.ts), both at once on the same server.
  u_build() {
    local log="${TMPDIR:-/tmp}/socratico-build.log" slog="${TMPDIR:-/tmp}/socratico-start.log" puerto srv listo=0 e s rc=0
    if ! timeout 600 npm run build > "$log" 2>&1; then echo "FAIL npm run build (see $log)"; tail -30 "$log"; return 1; fi
    rm -f "$log"; echo "npm run build"
    puerto="$(node -e 'const s=require("net").createServer().listen(0,()=>{console.log(s.address().port);s.close()})')"
    node node_modules/next/dist/bin/next start -p "$puerto" > "$slog" 2>&1 &
    srv=$!
    for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$puerto/robots.txt" && { listo=1; break; }; sleep 1; done
    if [ "$listo" != 1 ]; then kill "$srv" 2>/dev/null; echo "FAIL next start did not answer in 60 s"; tail -5 "$slog"; return 1; fi
    timeout 300 node scripts/eval-mcp.mjs --url "http://localhost:$puerto/mcp" > "$TMPD/mcp.log" 2>&1 & e=$!
    timeout 300 node scripts/validar-grafo.mjs --url "http://localhost:$puerto" --personas 300 > "$TMPD/shacl.log" 2>&1 & s=$!
    if wait "$e"; then echo "mcp: $(tail -1 "$TMPD/mcp.log")"
    else rc=1; echo "FAIL mcp: scripts/eval-mcp.mjs against next start"; grep -E 'FAIL|casos' "$TMPD/mcp.log" | head -15; fi
    if wait "$s"; then echo "graph: $(tail -1 "$TMPD/shacl.log")"
    else
      rc=1; echo "FAIL graph: scripts/validar-grafo.mjs (SHACL against lib/ontologia.ts)"
      # A crash (a 500, a timeout, out of memory) matches none of the report lines: its last lines instead.
      { grep -E 'VIOLA|SIN DECLARAR|DE LA V1|conforme|volcado' "$TMPD/shacl.log" || tail -3 "$TMPD/shacl.log"; } | head -12
    fi
    kill "$srv" 2>/dev/null; wait "$srv" 2>/dev/null
    return "$rc"
  }

  # Lo que lee cada unidad: lo que cambia su veredicto, y nada menos.
  unidad cedulas "$(huella_de public/data public/tablas datos .claude/hooks/cedulas.py .claude/hooks/cedulas-tablas.mjs package-lock.json)" u_cedulas &
  unidad grafo "$(huella_de lib scripts public/data datos package-lock.json)" u_grafo &
  unidad busqueda "$(huella_de lib scripts public/data datos package-lock.json)" u_busqueda &
  # El build lee el árbol entero, salvo los .md: ni Next ni el MCP ni el SHACL
  # leen un documento (lo nombran en comentarios), y un cambio solo de docs
  # no vuelve a construir.
  unidad build "$(huella_de . ':(exclude)*.md')" u_build &
  wait

  for n in cedulas grafo busqueda build; do
    via="$(cat "$TMPD/$n.via" 2>/dev/null)"
    if [ "$(cat "$TMPD/$n.rc" 2>/dev/null)" = 0 ]; then
      while IFS= read -r linea; do [ -n "$linea" ] && ok "$linea ($via)"; done < "$TMPD/$n.out"
    else
      case "$n" in
        cedulas) mal "a cédula reached a snapshot — scripts/privacidad.py ($via)" ;;
        grafo) mal "compiled graph out of date — node scripts/build-grafo.mjs ($via)" ;;
        busqueda) mal "search and graph disagree — python3 scripts/build-busqueda.py (after build-grafo.mjs), then build-indice-busqueda.mjs ($via)" ;;
        build) mal "build, MCP or SHACL ($via)" ;;
      esac
      sed 's/^/       /' "$TMPD/$n.out" | head -40
    fi
  done
  rm -f "$TMPD"/* 2>/dev/null; rmdir "$TMPD" 2>/dev/null; trap - EXIT
fi

# 7. The stamp. `main` deploys to production on every push, so the gate has to
# sit IN FRONT of the push — CI behind it cannot un-ship a red. A full green on
# a clean tree stamps HEAD's sha in .git/harness-gate; guard-bash.sh refuses a
# push to main without a stamp that matches. A rebase or a new commit voids it
# on purpose: the pre-rebase green never counts for the tree being pushed.
if [ "$fallos" -eq 0 ] && [ "$modo" = "--completo" ]; then
  if [ -z "$(git status --porcelain 2>/dev/null)" ]; then
    git rev-parse HEAD > "$(git rev-parse --git-dir)/harness-gate" 2>/dev/null \
      && ok "stamped $(git rev-parse --short HEAD) — push to main allowed"
  else
    ok "not stamped: working tree dirty (commit, then re-run to earn the push)"
  fi
fi

if [ "$fallos" -eq 0 ]; then echo "RESULT: clean"; exit 0; else echo "RESULT: $fallos failure(s)"; exit 1; fi
