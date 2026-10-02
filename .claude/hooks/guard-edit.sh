#!/bin/bash
# PreToolUse(Edit|Write|MultiEdit): the three invariants nobody should have to
# remember — no secrets/env in the app, the DB stays inside /democracia, and
# the UI obeys .claude/rules/identidad.md. Blocks with the rule and where it lives.
source "$(dirname "$0")/lib.sh"
input="$(cat)"
archivo="$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""' 2>/dev/null)"
[ -z "$archivo" ] && exit 0
# Only the repository is guarded; scratch files elsewhere are free.
case "$archivo" in "$ROOT"/*) ;; *) exit 0 ;; esac
nuevo="$(printf '%s' "$input" | jq -r '.tool_input.content // .tool_input.new_string // .tool_input.file_text // ((.tool_input.edits // []) | map(.new_string) | join("\n")) // ""' 2>/dev/null)"

negar() { echo "BLOCKED by .claude/hooks/guard-edit.sh: $1" >&2; exit 2; }
rel="${archivo#"$ROOT"/}"

case "$rel" in
  .env.example) ;;
  .env|.env.*) negar "no .env files: the platform has no secrets; /democracia uses publishable keys with literal fallbacks (lib/supabase-config.ts)." ;;
  node_modules/*|.next/*) negar "generated/vendored path." ;;
  package-lock.json) negar "regenerate the lockfile with npm (npm install <pkg>), never by hand." ;;
esac

[ -z "$nuevo" ] && exit 0

# 1. Secrets. Values never; names only on the database side and in docs.
if printf '%s' "$nuevo" | grep -qE "$SECRETO_VALORES"; then
  negar "looks like a server key or private key. Sensitive material lives inside Postgres, never in the app (docs/INFRAESTRUCTURA.md §10.2)."
fi
if ! es_archivo_supabase "$rel" && [ "${rel##*.}" != "md" ] && printf '%s' "$nuevo" | grep -qE "$SECRETO_NOMBRES"; then
  negar "the service role is named only inside supabase/ (grants, the Edge Function trust boundary — docs/INFRAESTRUCTURA.md §10.7), never on an app surface."
fi

# 2. Statelessness outside /democracia.
case "$rel" in
  *.ts|*.tsx)
    if ! es_archivo_con_estado "$rel"; then
      printf '%s' "$nuevo" | sin_comentarios | grep -qE 'process\.env\.' \
        && negar "'$rel' is a stateless surface: no environment variables outside /democracia (CLAUDE.md). If a source needs a key, that is an owner decision (CLAUDE.md §"Cómo opera una sesión") — stop and report."
      printf '%s' "$nuevo" | sin_comentarios | grep -qE '@supabase/supabase-js|@/lib/supabase["'"'"']' \
        && negar "'$rel' must not touch the database: only /democracia and the account spaces read or write Supabase (CLAUDE.md, docs/INFRAESTRUCTURA.md §10.10). A data surface renders a component from components/espacios/ instead."
    fi
    ;;
esac

# 3. Identity.
if es_archivo_ui "$rel"; then
  hallazgos="$(printf '%s' "$nuevo" | infracciones_identidad)"
  if [ -n "$hallazgos" ]; then
    negar ".claude/rules/identidad.md prohibits gradients, blur, glass shadows (use border-hairline; shadow-card/shadow-soft only for what truly floats), rounded-2xl/3xl (rounded-lg max) and emoji (icons are stroke icons from components/icons.tsx). Use the primitives in components/papel.tsx. Offending lines:
$hallazgos"
  fi
fi

exit 0
