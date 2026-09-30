---
name: nueva-fuente
description: Integrate a new Dominican state data source end to end (recon, lib adapter, API route, UI, /fuentes declaration, docs) following the stateless contract. Use when asked to add an indicator, vertical, or source such as BCRD, TSS, Transparencia Fiscal, JCE, MapaInversiones.
allowed-tools: Bash, Read, Edit, Write, Grep, Glob, WebFetch, Agent
---
# /nueva-fuente — QRSPI for a state source

The platform has integrated eight sources with one method: **Questions →
Recon → Spike → Plan → Implementation**. Follow it in order; each step has
a written output.

## Q — what question does the citizen get answered?
One sentence, as a question («¿Cuánto debe el Estado?»). If the source
answers no citizen question, stop and say so.

## R — recon (verify, never assume)
Check `docs/AUDITORIA.md` first: most sources already have a status and a
verified path, and its **SEGUNDA PASADA** (§A–§F) supersedes rows marked ↓ in
the first table. §D ranks the next integrations by value ÷ effort (DGCP's
unused endpoints first, then SIGEF, MICM, MapaInversiones, RNC, nómina
ampliada, BCRD). Before a new host, exhaust the ones already integrated. If the mechanics are not yet ✅, run the `recon` agent
(`.claude/agents/recon.md`) or do it by hand with the same hygiene:
`robots.txt` first, identifiable User-Agent, 2–6 requests, GET only, no
challenge evasion. Write the findings into `docs/AUDITORIA.md` (or `docs/RECON.md`
for Congress) with ✅/⚠️/❌ and the exact URLs, response shapes, and
content-types you saw.

Blocked (403/470/challenge) or credentialed (API key) → the outcome is a
documented "sin vía hoy" row plus the institutional unblock path. Do not build.

## S — spike
One throwaway script (scratchpad, not the repo) that fetches one real record
and parses it. Confirms encoding, delimiter, date formats, pagination,
session needs. The three access families and their reference adapters:
JSON API → `lib/dgcp.ts`; predictable file URL → `lib/deuda.ts`,
`scripts/build-nomina.py`; legacy app with token/session → `lib/senado.ts`,
`lib/normativa.ts`. Copy the closest one's structure.

## P — plan
Decide and write down in the module header: cache window by volatility,
bound (pages/rows) and how truncation is reported, what is shown when the
source is down (null → the page says "la fuente no contestó", never a
fabricated number), whether a committed snapshot fallback is warranted
(only when the origin rejects cloud egress, like Crédito Público).

## I — implementation checklist
1. `lib/<fuente>.ts` obeying `.claude/rules/fuentes.md` (the hooks will
   reject env vars and secrets).
2. `app/api/<fuente>/route.ts` if a client component needs it
   (`force-dynamic`, try/catch → 502, validated params).
3. UI through the primitives: indicator card on `/` (`lib/cifras.ts` anchor
   and scope declared), and a vertical only if it deserves navigation
   (`lib/secciones.ts` + `--color-v-*` token in `app/globals.css`).
4. `app/fuentes/page.tsx`: the public contract of what is read, with limits.
5. `CLAUDE.md`: one paragraph in the data-layer notes; `README.md` table if
   a route was added.
6. `/verificar --completo`, then `/entregar`.

$ARGUMENTS
