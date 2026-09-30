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

# 2. Identity (docs/IDENTIDAD.md prohibitions) across the UI tree.
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

# 2c. Magnitude travels in words (IDENTIDAD §3): «MM» reads *millones* in
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

# 2e. Motion goes through its tokens (IDENTIDAD §Movimiento): no curve
# written by hand in a component, no bounce, nothing slower than a sheet.
mov="$(grep -rnE 'cubic-bezier\(|animate-bounce|duration-\[|duration-(3[5-9][0-9]|[4-9][0-9]{2}|[0-9]{4})([^0-9]|$)' app components --include=*.tsx 2>/dev/null \
       | grep -vE ':[0-9]+:[[:space:]]*(//|/?\*)' | head -5)"
if [ -z "$mov" ]; then ok "motion: curves and durations come from the tokens"; else mal "hand-written motion — use ease-firma/sello/salida/estampa and the --dur-* tokens"; printf '%s\n' "$mov" | sed 's/^/       /'; fi

# 2f. The graph (docs/PLAN-ACCESO.md §6 ter, G1): every entity address comes
# from lib/grafo.ts (`enlace.*`), so a link cannot be built by hand and drift.
grafo="$(grep -rnE '[`"]/(instituciones|proveedores|procesos|normativa|congreso|obras|provincias|finanzas|funcionarios|banca|empresas)/(\$\{|[a-z0-9-]+/\$\{|"[[:space:]]*\+)' app components lib --include=*.ts --include=*.tsx 2>/dev/null \
         | grep -vE '^lib/grafo' | grep -vE ':[0-9]+:[[:space:]]*(//|/?\*)' | head -5)"
if [ -z "$grafo" ]; then ok "graph: every entity href comes from lib/grafo.ts"; else mal "entity href built by hand — use enlace.* from lib/grafo.ts"; printf '%s\n' "$grafo" | sed 's/^/       /'; fi

# 3. Statelessness: env vars and Supabase confined to /democracia.
fuera="$( { grep -rlE 'process\.env\.' app lib components --include=*.ts --include=*.tsx 2>/dev/null; \
            grep -rlE '@supabase/supabase-js|@/lib/supabase["'"'"']' app lib components --include=*.ts --include=*.tsx 2>/dev/null; } \
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

# 5a. The search index belongs to its corpus: a stale indice.bin is not an
#     error at runtime, it is a silent ~6 s rebuild on every cold start.
if [ -f public/data/busqueda/corpus.json ]; then
  if etq="$(node -e '
    const fs = require("fs");
    const c = JSON.parse(fs.readFileSync("public/data/busqueda/corpus.json", "utf8"));
    const b = fs.readFileSync("public/data/busqueda/indice.bin");
    if (b.subarray(0, 4).toString() !== "SIB1") { console.log("indice.bin is not SIB1"); process.exit(); }
    const cab = JSON.parse(b.subarray(8, 8 + b.readUInt32LE(4)).toString());
    const esperada = `${c.generado}|${c.huella ?? "sin-huella"}|${c.docs.length}`;
    if (cab.etiqueta !== esperada) console.log(`indice.bin ${cab.etiqueta} != corpus ${esperada}`);
  ' 2>&1)" && [ -z "$etq" ]; then
    ok "search: indice.bin matches corpus.json"
  else
    mal "search index out of date — node scripts/build-indice-busqueda.mjs"; printf '%s\n' "$etq" | sed 's/^/       /'
  fi
fi

# 5b. The harness's own claims (ceiling, paths, rule ownership, frontmatter).
if arn="$("$(dirname "$0")/harness.sh" "$ROOT" 2>&1)" && [ -z "$arn" ]; then
  ok "harness: CLAUDE.md within budget, paths resolve, rules own a page, frontmatter valid"
else
  mal "harness drift"; printf '%s\n' "$arn" | sed 's/^/       /'
fi

# 5c. Nunca la cédula: ninguna instantánea de public/data,
#     que se sirve tal cual, la guarda, ni la que traiga un título oficial. Lee
#     ~200 MB (unos 13 s): solo en el completo.
if [ "$modo" = "--completo" ] && command -v python3 >/dev/null 2>&1; then
  if ced="$(python3 "$(dirname "$0")/cedulas.py" "$ROOT" 2>&1)" && [ -z "$ced" ]; then
    ok "privacy: no cédula in public/data"
  else
    mal "a cédula reached a snapshot — scripts/privacidad.py"; printf '%s\n' "$ced" | head -5 | sed 's/^/       /'
  fi
fi

# 6. Build (completo only).
LOG="${TMPDIR:-/tmp}/socratico-build.log"
construido=0
if [ "$modo" = "--completo" ]; then
  if timeout 600 npm run build >"$LOG" 2>&1; then ok "npm run build"; rm -f "$LOG"; construido=1
  else mal "npm run build (see $LOG)"; tail -30 "$LOG" | sed 's/^/       /'; fi
fi

# 6b. The MCP server answers what it promises (docs/PLAN-ACCESO.md §6 sexies,
#     M5): `scripts/eval-mcp.mjs` calls every tool against `next start` over
#     the build just made, each case checked against an oracle read from the
#     snapshots, plus the rules every answer keeps (no cédula, source, cut).
#     A change that breaks a tool's shape does not reach `main`.
if [ "$construido" = 1 ]; then
  SLOG="${TMPDIR:-/tmp}/socratico-start.log"
  puerto="$(node -e 'const s=require("net").createServer().listen(0,()=>{console.log(s.address().port);s.close()})')"
  node node_modules/next/dist/bin/next start -p "$puerto" >"$SLOG" 2>&1 &
  srv=$!
  # Interrupted (a timeout, ^C), the server must not outlive the gate.
  trap 'kill "$srv" 2>/dev/null' EXIT
  listo=0
  for _ in $(seq 1 60); do
    curl -s -o /dev/null "http://localhost:$puerto/robots.txt" && { listo=1; break; }
    sleep 1
  done
  if [ "$listo" = 1 ] && eval_mcp="$(timeout 300 node scripts/eval-mcp.mjs --url "http://localhost:$puerto/mcp" 2>&1)"; then
    ok "mcp: $(printf '%s\n' "$eval_mcp" | tail -1)"
  else
    mal "mcp: scripts/eval-mcp.mjs against next start"
    if [ "$listo" = 1 ]; then printf '%s\n' "$eval_mcp" | grep -E 'FAIL|casos' | head -15 | sed 's/^/       /'
    else echo "       next start did not answer in 60 s:"; tail -5 "$SLOG" | sed 's/^/       /'; fi
  fi
  kill "$srv" 2>/dev/null; wait "$srv" 2>/dev/null; trap - EXIT
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
