---
paths:
  - "app/cuenta/**"
  - "app/espacio/**"
  - "app/p/**"
  - "app/comunidad/**"
  - "components/espacios/**"
  - "lib/espacios.ts"
  - "lib/espacios-cliente.ts"
  - "lib/sesion.ts"
  - "supabase/migrations/*espacios*"
  - "supabase/migrations/*conversacion*"
  - "supabase/migrations/*caso*"
  - "lib/ftm.ts"
  - "supabase/pruebas/**"
---
# The reader's account and spaces — the second exception

docs/PLAN-ESPACIOS.md governs.
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
  Only readers **with a session** load supabase-js on every page
  (`SincronizarCuenta` in the layout; `Guardar` then asks where a record is
  saved); a visitor without one never downloads it.
- Invitations need consent: `mis_invitaciones()` + `aceptar_invitacion(id)`,
  matched on the **verified** email (`mi_correo()`), never the JWT claim.
- Every redirect or internal link built from stored or query data passes
  `rutaPropia` (`lib/espacios.ts`); `hrefValido` mirrors `espacios.href_valido`.
- `anon` has no table grants: a published project is read server-side through
  `espacios.publicado(slug)` over HTTP (`lib/espacios.ts`), which returns no
  user ids and no emails.

## The conversation (PLAN §6)
- Threads, comments, votes and reports live in `espacios`; nobody writes a
  table. Every write is a definer function. Public text (a comment, or the
  title that opening a thread writes) needs a registered cédula
  (`exigir_autoria`); voting and reporting need a verified email. Suspensions
  and rate limits key on the cédula hash (`mi_cedula`, never returned), so a
  new account does not escape them; only cédula holders' reports count toward
  hiding. Counters are trigger-maintained increments. Reads are the public
  `hilo`/`comunidad` functions: visible text and signing names, never ids,
  emails or hashes.
- A thread's key is its ficha's path (`ref = href`, `ruta_de_tipo`). A new
  ficha that wants a conversation adds its type there and in `TIPOS_HILO`.
- `Conversacion` goes at the **end** of a ficha (understand first, opine
  after) and loads nothing until the reader scrolls near it.

## The case (PLAN §7)
- A case adds only the investigator's own work: a date they set, a board
  position, a closed-vocabulary verb per link (`TIPOS_ENLACE` = the `check`),
  and the narrative. Never a date or a figure copied from the source.
- The narrative is written only through `guardar_narrativa` (versioned), and
  rendered only through `narrativa-lectura.tsx` (whitelist, no raw HTML,
  mentions resolved by entry id). The board and timeline never import Supabase.

## Changing the database
- Migrations under `supabase/migrations/`, re-runnable. Run
  `python3 supabase/pruebas/espacios_rls.py` (throwaway Postgres simulating
  `auth`) and keep `FALLOS: 0`; add a case for every new policy or function.
  Conversation changes: `python3 supabase/pruebas/conversacion_rls.py`, same bar.
  Touching the follow sync in `lib/espacios-cliente.ts`: run
  `node supabase/pruebas/sincronizar_seguidos.cjs` (no network) and keep `FALLOS: 0`.
- Applying the migration or exposing the schema in the Data API is an
  **owner action**: prepare, list the steps (PLAN §5), stop.
- Every screen distinguishes three states: nothing there, could not look
  (`variante="caida"`), and `cerrado` (schema not open yet — `<Cerrado />`).
- Sending alerts (e-mail, push) is an open owner decision: alerts are shown on
  arrival, on any device, never sent.
