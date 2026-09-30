---
name: entregar
description: Deliver finished work - sync documentation, run the gate, commit in the repository's Spanish style, rebase on origin/main, and push to main (which deploys to production). Use at the end of every task that changed files.
allowed-tools: Bash, Read, Edit, Grep, Glob
---
# /entregar — from working tree to production

Pushing to `main` deploys to https://socratico.vercel.app. Nothing reaches
main unverified, and nothing stays in a container: the session is ephemeral.

## 1. Documentation is memory
Before committing, update whatever the next session would otherwise have to
rediscover:
Cada cosa tiene una página dueña — `docs/HARNESS.md` §4 dice cuál:
- A new or changed source → `app/fuentes/page.tsx` (coverage, limits, blocks)
  and the data-layer note in `docs/ARQUITECTURA.md`; verified mechanics and
  quirks → `docs/RECON.md` (Congress) or `docs/AUDITORIA.md` (everything else),
  with the ✅/⚠️/❌ convention.
- A new route or vertical → `lib/secciones.ts`, `README.md` feature list, the
  domain table in `CLAUDE.md`.
- A new invariant or a rule you had to learn the hard way → the matching
  `.claude/rules/*.md`, one line, with the file that proves it.
- Anything that changes how a session is shaped → `docs/HARNESS.md`.

## 2. Gate
```bash
./.claude/hooks/verificar.sh --completo
```
Red means not delivered. Fix, re-run.

## 3. Commit
- Spanish, present-tense imperative subject (≤ 72 chars, no trailing
  period), as the log shows: `Congreso: enlaza el texto de la ley…`.
- Body explains **why** and what was verified, in prose; the diff already
  shows the what. Mention the doc sections updated.
- No model identifiers anywhere in the message or the code (a hook blocks
  them). Keep the attribution trailers the session harness requires.
- One commit per coherent change; do not bundle unrelated fixes.

## 4. Push — el gate va sobre el árbol que se empuja
```bash
git fetch origin main
git rebase origin/main                      # other sessions push to main too
./.claude/hooks/verificar.sh --completo     # sobre el árbol YA rebasado
git push origin HEAD:main
```
`HEAD:main`, no `-u origin main`: una sesión trabaja en la rama `claude/*` que
el harness le asigna, así que no hay una rama `main` local que empujar y la
otra forma falla con «src refspec main does not match any».
El paso 2 verificó el árbol de antes del rebase; el que se despliega es este.
Por eso el gate completo se repite aquí y no basta con `--rapido`: `main`
despliega a producción en cada push y nada detrás puede des-publicar un rojo.

No es una recomendación. En verde y con el árbol limpio, `verificar.sh
--completo` estampa el sha de HEAD en `.git/harness-gate`, y `guard-bash.sh`
rechaza el push si falta la estampa, es de otro commit o el árbol se movió. Un
rebase o un commit nuevo la anulan a propósito.

On a network failure retry with backoff (2 s, 4 s, 8 s, 16 s). Never force,
never a different branch. If the rebase conflicts, resolve keeping both
behaviors and re-run the full gate before pushing.

## 5. Report
Final message: what changed, what was verified (paste `RESULT: clean`),
what the owner must decide or do by hand (panel actions, credentials), and
the production URL of the touched route. No offers, no questions that the
docs could have answered.

$ARGUMENTS
