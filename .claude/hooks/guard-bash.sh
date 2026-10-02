#!/bin/bash
# PreToolUse(Bash): refuse the handful of commands that would cost more than
# any session can save. Everything else passes.
source "$(dirname "$0")/lib.sh"
input="$(cat)"
crudo="$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null)"
[ -z "$crudo" ] && exit 0

negar() { echo "BLOCKED by .claude/hooks/guard-bash.sh: $1" >&2; exit 2; }

# A heredoc body is DATA, not a command. Without this, the guard reads the text
# it is handed as if it were being run: writing a document that explains how the
# repository ships, or editing this very file through a `python3 - <<PY` block,
# was refused because the prose contained the words it looks for. It cost
# nothing in safety — a `shutil.rmtree` inside a Python heredoc was never caught
# by a grep for `rm -rf` anyway — and it made the guard impossible to work
# around honestly, which is the failure mode that gets a guard deleted.
#
# The line that OPENS the heredoc is still scanned, so `bash <<EOF` is read.
cmd="$(printf '%s\n' "$crudo" | awk '
  dentro { linea = $0; sub(/^\t+/, "", linea); if (linea == fin) dentro = 0; next }
  {
    print
    if (match($0, /<<-?[ \t]*["'"'"']?[A-Za-z_][A-Za-z0-9_]*["'"'"']?/)) {
      fin = substr($0, RSTART, RLENGTH)
      sub(/^<<-?[ \t]*/, "", fin); gsub(/["'"'"']/, "", fin)
      dentro = 1
    }
  }
')"

# History and remote safety. Production deploys from main on every push.
printf '%s' "$cmd" | grep -qE 'git push[^|;&]*(--force|-f\b|--force-with-lease)' \
  && negar "no force-push: main is production (Vercel deploys on push)."
if printf '%s' "$cmd" | grep -qE '\bgit push\b'; then
  # Quotes are shell syntax, not part of the ref: `git push origin "main"` is a
  # push to main and was being refused as a push to `"main"`.
  refs="$(printf '%s' "$cmd" | grep -oE 'git push[^|;&]*' | sed -E 's/git push//; s/-u|--set-upstream|origin//g; s/["'"'"']//g')"
  # `claude/*` son ramas de sesión: no despliegan nada. Existen para que el
  # dueño pueda MIRAR el trabajo antes de que exista —Vercel les levanta un
  # preview al llegar al remoto— y para revisarlo en un PR. Decisión suya, del
  # 14-09-2026. La estampa del gate, que es lo que protege
  # producción, sigue exigiéndose más abajo para cualquier push.
  for r in $refs; do
    case "$r" in
      -*|main|HEAD:main|main:main|claude/*|*[\<\>]*|[0-9]*) ;;   # flags, main, ramas de sesión, redirecciones
      *) negar "push only to main or a claude/* session branch (CLAUDE.md). Refusing ref '$r'." ;;
    esac
  done

  # The gate goes IN FRONT of the push, because `main` deploys to production on
  # every push and nothing behind it can un-ship a red. A full green on a clean
  # tree stamps HEAD in .git/harness-gate (verificar.sh step 7); this refuses
  # the push when that stamp is missing, stale, or the tree has moved since.
  # A rebase or a new commit voids it ON PURPOSE: the green earned before the
  # rebase belonged to a different tree than the one about to ship.
  marca="$(git rev-parse --git-dir 2>/dev/null)/harness-gate"
  cabeza="$(git rev-parse HEAD 2>/dev/null)"
  if [ -n "$cabeza" ]; then
    if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
      negar "dirty working tree: commit first, then run .claude/hooks/verificar.sh --completo. The push is gated on the exact tree that ships."
    elif [ ! -f "$marca" ]; then
      negar "no gate stamp. main deploys to production — run .claude/hooks/verificar.sh --completo on THIS commit first."
    elif [ "$(cat "$marca" 2>/dev/null)" != "$cabeza" ]; then
      negar "the gate stamp is for another commit ($(cut -c1-7 <"$marca" 2>/dev/null) vs $(printf '%s' "$cabeza" | cut -c1-7)). A rebase or a new commit voids it — re-run .claude/hooks/verificar.sh --completo."
    fi
  fi
fi
printf '%s' "$cmd" | grep -qE 'git (commit|push)[^|;&]*--no-verify' \
  && negar "--no-verify skips the gate."
printf '%s' "$cmd" | grep -qE 'git reset --hard|git checkout -- \.|git restore \.|git clean -[a-z]*f' \
  && negar "destructive working-tree reset. Inspect with git diff/stash instead."
printf '%s' "$cmd" | grep -qE '\brm -[a-zA-Z]*r[a-zA-Z]* ' \
  && ! printf '%s' "$cmd" | grep -qE 'rm -[a-zA-Z]*r[a-zA-Z]* +(\./)?(node_modules|\.next|out|/tmp|"?\$?\{?CLAUDE|/root/\.claude|\$SCRATCH)' \
  && negar "recursive rm outside node_modules/.next/tmp. Delete specific files."

# Secrets and statelessness (CLAUDE.md: no env vars, no secrets in the app).
printf '%s' "$cmd" | grep -qE '(>|tee)[[:space:]]*\.env(\.|[[:space:]]|$)' \
  && ! printf '%s' "$cmd" | grep -qE '(>|tee)[[:space:]]*\.env\.example' \
  && negar "never write .env files; the app carries no secrets (CLAUDE.md §"La invariante")."
printf '%s' "$cmd" | grep -qE 'vercel env (add|rm|pull)|supabase secrets' \
  && negar "environment/secret changes are the owner's decision; report them instead."

# Model identifiers never go into commits or files.
printf '%s' "$cmd" | grep -qE 'git commit' && printf '%s' "$cmd" | grep -qiE 'claude-(opus|sonnet|haiku|fable|mythos)-[0-9]' \
  && negar "no model IDs in commit messages."

exit 0
