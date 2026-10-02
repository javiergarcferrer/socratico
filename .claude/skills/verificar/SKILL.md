---
name: verificar
description: Run the repository gate (typecheck, identity, mute controls, statelessness, secrets, harness, next build, MCP eval) and report. Use before claiming any change is done, before /entregar, and whenever a build failure needs diagnosing.
allowed-tools: Bash, Read, Grep, Glob, Edit
---
# /verificar — the gate

There is no unit-test suite and no ESLint; `next build` and the MCP eval run
against it are the real gate, and the hooks add cheap invariants around them.
Run the full mode:

```bash
./.claude/hooks/verificar.sh --completo
```

Then:
1. **If clean:** report `RESULT: clean` verbatim plus the build's route
   table summary (static vs dynamic routes changed?). On a clean tree the run
   also stamps HEAD in `.git/harness-gate`, which is what earns the push to
   `main` — `guard-bash.sh` refuses one without it, and a rebase or a new
   commit voids it.
2. **If red:** fix every failure in the code, not in the gate. Re-run until
   clean. Never delete a check, widen an allowlist, or add an exception to
   the hooks to make it pass; if a check is wrong, say so in the final
   message with the evidence and leave it red.
3. **Statelessness or secret failures** are architectural: stop, re-read
   CLAUDE.md §"La invariante" and docs/INFRAESTRUCTURA.md §10.2, and undo the leak.
4. **Identity failures**: use the primitive instead of the class — the
   catalogue is in `docs/INFRAESTRUCTURA.md` §11.8–11.9; read
   `.claude/rules/identidad.md`.
   **Mute controls** (`hover:` that repeats what the element already has, a
   ring colour with no ring width): the control looks interactive and is not.
   **Harness drift**: `CLAUDE.md` over its ceiling (move the growth to
   `docs/INFRAESTRUCTURA.md`), a path it names that no longer exists, a
   `rules/*.md` that stopped naming the section it describes, or an agent
   without `effort`. See `docs/INFRAESTRUCTURA.md` §12.
5. **MCP eval failures** (`scripts/eval-mcp.mjs`, run against `next start`
   over the fresh build): each `FAIL` line names the question and what the
   tool answered versus the oracle read from `public/data`. A tool whose shape
   changed on purpose updates its case in the same commit; a snapshot rebuilt
   with a new shape updates the reader (`procesosDelIndice` in
   `lib/busqueda.ts`), never the oracle to match the tool.
6. **Build failures on Next 15**: a `node:` import reached a client bundle
   (move it to a server-only module), a `"use client"` component imported a
   server module, or a dynamic route lost `force-dynamic`. Read the last 40
   lines of the log the script names.

Optional manual checks when the change is user-facing:
- `npm run start` after the build and load the touched route on a 390 px
  viewport (Playwright with `executablePath: '/opt/pw-browsers/chromium'` in
  web sessions). Verify the copy is es-DO and the numbers carry their anchor.
- For a source adapter, exercise it once against the real origin with the
  identifiable User-Agent and show the response shape; a green typecheck is
  not proof that a source answers.

$ARGUMENTS
