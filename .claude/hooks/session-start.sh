#!/bin/bash
# SessionStart: make the gate runnable and put the session's bearings in
# context. Stdout is injected into the conversation.
source "$(dirname "$0")/lib.sh"
cd "$ROOT" || exit 0

# 1. Dependencies (web sessions start from a fresh clone). `npm ci` honors the
#    Next 15 lockfile; skipped when node_modules is already current so cached
#    containers do not reinstall.
if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || [ ! -d node_modules ]; then
    npm ci --no-audit --no-fund --loglevel=error >/dev/null 2>&1 \
      && echo "deps: npm ci ok" \
      || echo "deps: npm ci FAILED — run it by hand before npm run build"
  fi
fi

# 2. Bearings.
rama="$(git branch --show-current 2>/dev/null)"
git fetch -q origin main 2>/dev/null || true
delta="$(git rev-list --left-right --count origin/main...HEAD 2>/dev/null | awk '{print "behind " $1 ", ahead " $2}')"
sucio="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"

cat <<CTX
[harness Socrático.do] branch=${rama:-?} (${delta:-no upstream}); uncommitted files=${sucio}
Last commits:
$(git log --oneline -5 2>/dev/null | sed 's/^/  /')
CLAUDE.md §"Qué documento responde a qué" routes every question to its section of docs/INFRAESTRUCTURA.md, the only document (what is, never plans); §12 says what shapes a session. Gate before finishing: /verificar (verificar.sh --completo) — on green it stamps the commit, and the push to main is refused without that stamp. Delivery: /entregar. New state source: /nueva-fuente.
CTX
exit 0
