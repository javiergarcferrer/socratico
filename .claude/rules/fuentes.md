---
paths:
  - "lib/**"
  - "app/api/**"
  - "scripts/**"
---
# Contract for every state-source adapter (`lib/*.ts`)

The mechanics of each source as they are: docs/INFRAESTRUCTURA.md §4–§6.
This is what every adapter obeys.

## Reading a source
- **One `lib/<fuente>.ts` per source, one contract:** identifiable
  `User-Agent` (`Socratico-Inteligencia/1.0 (…; herramienta independiente)`),
  25 s timeout, exactly **one retry**, **validate `content-type`** on every
  response (a 200 can be an SPA shell or a WAF page), degrade to `null`, never
  throw into a page. **Implemented once in `lib/pedir.ts`** (`pedirJson`/
  `pedirTexto`/`pedirBytes`, `zod` schema optional): use it, never a new
  fetch loop. HTML through `lib/html.ts` (`cheerio`, `entities`), XLSX
  through `lib/xlsx.ts`. The panorama composes indicators with a fault-tolerant
  `Promise.all`; one source down never blanks the page.
- **GET only**, except the exact postbacks a public form itself performs
  (Senate `consultante`, Consultoría `Search`, the MAP directory, BCRD
  `GetContentForRender`, the Poder Judicial hearing roll by exact case number,
  the Registro Inmobiliario file by exact number). Never a login, admin, or subscription endpoint.
  Never copy telemetry keys the portals leak.
- **Never evade a WAF, challenge, 403, 470, or robots rule.** Do not rotate
  User-Agent or IP, do not spoof a browser. A blocked source is unblocked
  institutionally (whitelist, Ley 200-04); record the observed response in
  docs/INFRAESTRUCTURA.md §5.11 and `/fuentes`, then stop.
- **Stateless.** No database, no `process.env`, no API keys in any adapter.
  A source that needs credentials (BCRD, Superintendencia de Bancos) is an
  **owner decision**: implement nothing, report the option.
  Hooks enforce this; do not work around them.
- **Cache by volatility:** live listings 5 min, prices 1 h, catalogues 24 h,
  monthly series daily. Use fetch `revalidate` when the URL is stable;
  `unstable_cache` when a session cookie, nonce or POST body keeps it out of
  the fetch cache (precedent: `lib/senado.ts`, `lib/normativa.ts`).
- **Server-only modules** (`node:` imports: `lib/deuda.ts`, `lib/nomina-server.ts`)
  must never be imported from a client component; webpack on Next 15 rejects
  it at build time, Turbopack would not warn you.
- **Snapshots** (`public/data/*.json` via `scripts/build-*.py`) are the fallback
  when the origin rejects cloud egress. A value served from a snapshot says so
  in the UI (`desdeInstantanea`) with its generation date.

## Two adapter classes (docs/INFRAESTRUCTURA.md §4)
- **Live source, cached by minutes** (`lib/dgcp.ts`, `lib/congreso.ts`):
  fetch `revalidate`, the request path is fast, the page waits for it.
- **Slow source, cached by day** (`lib/senado.ts`, `lib/normativa.ts`):
  `unstable_cache` with a daily window, timeout up to 120 s, queries scoped (by
  institution, by year), the current month degraded to the last closed one.
  Latency is part of the contract: design the cache before the feature.
- **Too slow even for that → snapshot** (`lib/fiscal.ts` over SIGEF): measured
  at 97 s for a whole institutional section and 20–90 s for a single
  institution, past any function budget, so it is built by
  `scripts/build-fiscal.py` and served from `public/data/fiscal.json`. The rule
  when a source lands here: the UI states the cut date and the snapshot's age,
  and the cut is the last period with **real** data (SIGEF returns zero-filled
  rows for the month in progress).
- Large downloads (RNC padrón, MapaInversiones CSV, 74 payroll CSVs) are
  **build-time snapshots** via `scripts/build-*.py` restricted to what the
  platform shows, never fetched in a request.

## Lessons from reading the State's sources
1. The showcase is not the source: read the JavaScript that builds the calls.
2. A 403 at the door does not close the house: look for the static download.
3. Before a new source, exhaust the one already integrated (DGCP had four
   unused endpoints: ofertas, proveedores, catálogo, PACC).
4. Never use a leaked credential, even to read public data: report it.
   One exception: the key the
   World Bank's debarment page publishes for its own table, read from that page
   by `scripts/build-sanciones.py` at build time and never written anywhere.
5. Publishing is not exposing: a public register's phones and emails are
   not shown.
6. Declare coverage, always: 4 fuel prices are not «los precios», 11
   payrolls are not «la nómina».
7. Distrust the other party's counter; paginate to count.

## Declaring what you read
- Every read is **bounded or paginated, never neither**, and a bounded read
  (6 DGCP pages, 10 SIL pages, 50 Senate rows) returns `scanned`/`truncated`
  so the UI can say it. Sample counts are never a denominator.
- A new adapter is not done until `app/fuentes/page.tsx` declares it (what,
  limits, what is blocked) and CLAUDE.md's data-layer notes name the file.
  The gate (`verificar.sh`) checks for this.
- Cite the docs/INFRAESTRUCTURA.md §5 subsection that records the mechanics in the module
  header, as the existing adapters do. Unverified claims are hypotheses and
  are labelled as such.

## API routes (`app/api/*`)
- `export const dynamic = "force-dynamic"`; thin wrapper around one `lib`
  function inside try/catch; `502` on upstream failure; validate every query
  parameter (regex for codes, allowlist for enumerations).
- `/api/documento` is **not an open proxy**: hosts only from
  `ORIGENES_DOCUMENTO`, 40 MB cap, `Range` forwarded, no visitor headers.
  Adding a host is a deliberate, documented decision.
