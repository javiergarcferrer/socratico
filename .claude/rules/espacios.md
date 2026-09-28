---
paths:
  - "app/cuenta/**"
  - "app/espacio/**"
  - "app/p/**"
  - "components/espacios/**"
  - "lib/espacios.ts"
  - "lib/espacios-cliente.ts"
  - "lib/sesion.ts"
  - "supabase/migrations/*espacios*"
  - "supabase/pruebas/**"
---
# The reader's account and spaces — the second exception

docs/PLAN-ESPACIOS.md governs (owner decision 2026-09-28, docs/DECISIONES.md).
Read §1 (contract) and §5 (applying) before changing anything here.

## Boundary
- Schema `espacios` in the `Transac` project, same Auth pool as `/democracia`:
  one account to vote and to investigate. Publishable keys only.
- **No State data in the database.** An entry is a reference —type, `ref` (the
  record's own path), title, link; a follow adds its `huella`. Never a figure,
  a text or a state copied from a source: the ficha keeps reading it live.
- A data surface (a ficha, a listing, `/buscar`) never imports Supabase. It
  renders `components/espacios/guardar.tsx`, which loads the client only when
  opened. The header only reads `components/espacios/presencia.ts` (a
  localStorage check), never supabase-js. Hooks enforce the file boundary.
- `anon` has no table grants: a published project is read server-side through
  `espacios.publicado(slug)` over HTTP (`lib/espacios.ts`), which returns no
  user ids and no emails.

## Changing the database
- Migrations under `supabase/migrations/`, re-runnable. Run
  `python3 supabase/pruebas/espacios_rls.py` (throwaway Postgres simulating
  `auth`) and keep `FALLOS: 0`; add a case for every new policy or function.
- Applying the migration or exposing the schema in the Data API is an
  **owner action**: prepare, list the steps (PLAN §5), stop.
- Every screen distinguishes three states: nothing there, could not look
  (`variante="caida"`), and `cerrado` (schema not open yet — `<Cerrado />`).
- Sending alerts (e-mail, push) is an open owner decision: alerts are shown on
  arrival, on any device, never sent.
