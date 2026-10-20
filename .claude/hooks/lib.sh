#!/bin/bash
# Shared helpers for the Socrático.do harness hooks. Sourced, not executed.
# Every hook must be cheap (< 5 s) and must never wedge a session: on any
# unexpected condition, exit 0 and let the model proceed.

set -u
export LC_ALL=C.UTF-8

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

# Files whose UI classes are checked against .claude/rules/identidad.md.
es_archivo_ui() {
  case "$1" in
    */app/*.tsx|*/components/*.tsx|*/app/*.css|app/*.tsx|components/*.tsx|app/*.css) return 0 ;;
    *) return 1 ;;
  esac
}

# Files that legitimately touch Supabase / env vars: the two documented
# exceptions — /democracia and the reader's account and spaces
# (docs/INFRAESTRUCTURA.md §10). A data surface
# (a ficha, a listing) never imports Supabase: it renders a component from
# components/espacios/, and that component is the only thing that talks to the
# database. Everything else is stateless by contract.
es_archivo_con_estado() {
  case "$1" in
    *lib/supabase.ts|*lib/supabase-config.ts|*lib/democracia.ts|*lib/cedula.ts) return 0 ;;
    *lib/espacios.ts|*lib/espacios-cliente.ts|*lib/sesion.ts) return 0 ;;
    *app/democracia/*|*components/democracia/*|*supabase/*) return 0 ;;
    *app/cuenta/*|*app/espacio/*|*app/p/*|*components/espacios/*) return 0 ;;
    *) return 1 ;;
  esac
}

# What brings supabase-js into a bundle: the client, `lib/supabase.ts`, and the
# two modules built on it (`lib/espacios-cliente.ts`, `lib/sesion.ts`). A
# stateless file importing either of those would carry the client without
# naming it. `lib/espacios.ts` and `lib/democracia.ts` read over HTTP with the
# publishable key and stay importable (the congress fichas embed the vote).
IMPORTA_CLIENTE='@supabase/supabase-js|@/lib/(supabase|espacios-cliente|sesion)["'"'"']'

# Prohibitions from .claude/rules/identidad.md, as grep -E patterns. Comment lines are
# stripped before matching so a code comment can name the sin it avoids.
#
# Three of these were added after a UI integrity pass found them by hand:
#
#  · `-white`  — «papel de oficio, nunca blanco de pantalla» is the first line
#    of the colour system, and the tree had drifted to 71 uses of screen white
#    against 19 of `canvas`. The paper token is warm; white is not. On a fill
#    (a brand button, a valido check) the answer is `text-canvas`, which is
#    what the `Accion` primitive in components/papel.tsx already chose.
#
#  · `rounded-full` **with real horizontal padding** — §3 allows the full
#    radius only on dots, seals and avatars. Something with `px-2` or more is
#    a pill: a badge or a button wearing app clothes, and «una tarjeta con
#    esquinas de app rompe la metáfora». `px-1` is left alone on purpose: that
#    is a round counter bubble, not a pill.
IDENTIDAD_PATRONES='bg-gradient-|from-[a-z]+-[0-9]+ (via|to)-|blur-(xl|2xl|3xl)|rounded-(2xl|3xl)|(^|[^-a-z])shadow-(sm|md|lg|xl|2xl)([^-a-z]|$)|(text|bg|ring|border|divide)-white|rounded-full[^"]*px-[2-9]|px-[2-9][^"]*rounded-full'
EMOJI_PATRON='[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{FE0F}]'

# Material that must never land in the app: server keys, private keys.
# Values are forbidden everywhere. Names (`service_role`, `SUPABASE_SERVICE…`)
# are forbidden on every app surface; they are legitimate only on the database
# side (`supabase/`: the GRANT to the role, the Edge Function that is the trust
# boundary of docs/INFRAESTRUCTURA.md §10.7) and in the documents that explain it.
SECRETO_VALORES='sb_secret_|-----BEGIN [A-Z ]*PRIVATE KEY|eyJhbGciOi'
SECRETO_NOMBRES='service_role|SUPABASE_SERVICE'
SECRETO_PATRONES="$SECRETO_VALORES|$SECRETO_NOMBRES"

# Files on the database side, where the service role is named by design.
es_archivo_supabase() {
  case "$1" in
    supabase/*|*/supabase/*) return 0 ;;
    *) return 1 ;;
  esac
}

sin_comentarios() {
  # Drop whole-line comments (// and JSDoc/*), keep everything else.
  grep -vE '^[[:space:]]*(//|/?\*)' 2>/dev/null || true
}

infracciones_identidad() {
  # $1 = text on stdin. Prints matching lines, empty when clean.
  local texto
  texto="$(sin_comentarios)"
  {
    printf '%s\n' "$texto" | grep -nE "$IDENTIDAD_PATRONES" 2>/dev/null
    printf '%s\n' "$texto" | grep -nP "$EMOJI_PATRON" 2>/dev/null
  } | head -8
}

# ── Memoria del gate por contenido (docs/INFRAESTRUCTURA.md §12.6) ──
# Un paso caro y determinista (el grafo contra sus constructores, la cédula en
# 230 MB, el build con el MCP y el SHACL) da el mismo veredicto sobre los
# mismos archivos. `huella_de` resume el contenido exacto de las rutas que lee
# un paso —lo versionado por el sha de su blob en el índice, lo modificado y lo
# nuevo por su sha256, lo borrado por su nombre—, más las versiones de Node y
# Python, lo que npm instaló de verdad (`node_modules/.package-lock.json`), el
# propio gate (`verificar.sh`, `lib.sh`: cambiar cómo se comprueba es cambiar
# la entrada) y `HUELLA_EXTRA` si se da. Si un paso ya pasó con esa huella, no
# se repite. Cambia un byte de lo que lee y corre entero. Solo se guarda un
# verde. Si git falla, no hay huella (salida 1) y el paso corre.
huella_de() {
  local listado
  listado="$(git ls-files -s -- "$@" 2>/dev/null)" || return 1
  {
    node --version 2>&1; python3 --version 2>&1
    sha256sum node_modules/.package-lock.json .claude/hooks/verificar.sh .claude/hooks/lib.sh 2>&1
    printf '%s\n' "${HUELLA_EXTRA:-}"
    printf '%s\n' "$listado"
    git diff --name-only -- "$@"
    git diff --name-only -z -- "$@" | xargs -0 -r sha256sum 2>&1
    git ls-files -o --exclude-standard -z -- "$@" | xargs -0 -r sha256sum 2>&1
  } | sha256sum | cut -c1-40
}

# memo_dir: donde se guardan los verdes, dentro de .git (no viaja con el repo).
memo_dir() { local g; g="$(git rev-parse --absolute-git-dir 2>/dev/null)" || return 1; echo "$g/harness-memo"; }

# memo_leer <paso> <huella> [días]: imprime el informe del verde guardado si es
# de hace menos de esos días (30 por omisión) y no está vacío; si no, falla.
memo_leer() {
  local d f; d="$(memo_dir)" || return 1; f="$d/$1-$2"
  [ -n "$2" ] && [ -s "$f" ] && [ -n "$(find "$f" -mtime -"${3:-30}" 2>/dev/null)" ] && cat "$f"
}

# memo_guardar <paso> <huella> <informe>: guarda un verde; poda los de más de 30 días.
memo_guardar() {
  local d; d="$(memo_dir)" || return 0; [ -n "$2" ] || return 0
  mkdir -p "$d" 2>/dev/null || return 0
  printf '%s\n' "$3" > "$d/$1-$2.tmp" && mv "$d/$1-$2.tmp" "$d/$1-$2"
  find "$d" -type f -mtime +30 -delete 2>/dev/null || true
}
