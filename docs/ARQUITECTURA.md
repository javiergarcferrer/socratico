# Arquitectura — dónde vive cada cosa

Índice de la implementación: la capa de datos por fuente, las rutas de API, las
páginas y el contrato de rendimiento percibido. Se abre para responder **«¿dónde
vive X?»** y **«¿por qué está escrito así?»**; `CLAUDE.md` enlaza aquí y no
repite nada de esto.

Vivía dentro de `CLAUDE.md`, que se inyecta entero en cada turno: 211 líneas de
inventario de módulos que toda sesión pagaba para leer aunque fuera a tocar una
sola. Y por ser un listado a mano, se quedaba atrás en silencio — describía tres
de las seis funciones de `lib/format.ts` y no nombraba ninguna de las primitivas
compartidas. Aquí puede ser largo y exacto, porque solo lo abre quien lo
necesita.

## El stack y el alias de importación

Next.js 15 **App Router** + React 19 + TypeScript + Tailwind CSS 4. Imports use
the `@/*` alias resolving to the **repo root** (`app/`, `lib/`, `components/`) —
this project does **not** use a `src/` directory.

## Lectura de fuentes — `lib/pedir.ts`, `lib/html.ts`, `lib/xlsx.ts`
Tres módulos compartidos que sostienen a las capas de `lib/`; ninguna los
reimplementa (`docs/PLAN-ACCESO.md` §6 bis).

- `lib/pedir.ts` — el contrato de `.claude/rules/fuentes.md` escrito una
  vez: `pedirJson` / `pedirTexto` / `pedirBytes` devuelven `null` y dejan su
  línea en el registro; `…OLanzar` lanzan `FalloLectura` para las capas que
  guardan en `unstable_cache` (que no guarda excepciones). Reintenta una vez
  red, plazo, no-2xx y cuerpo ilegible; no reintenta tipo equivocado, firma
  «PK» que no casa ni esquema `zod` que falla (`definitivo`). El motivo de un
  rechazo lleva `cf-mitigated` y `server`. Fuera: la sesión del Senado y las
  HEAD de peso.
- `lib/html.ts` — `desentidades` / `desentidadesXml` (`entities`) y
  `arbol` / `textoDe` (`cheerio` sobre parse5). `textoDe` junta los trozos de
  texto con un espacio, como hacían las regex al quitar etiquetas.
- `lib/xlsx.ts` — `leerHoja(buf, n)` → fila → columna → texto, con `fflate`
  (directorio central del ZIP) y `fast-xml-parser`; `filasDe`,
  `indiceColumna`.
- Los meses (`MESES`, `MESES_CORTOS`, `numeroMes`) viven en `lib/format.ts`,
  de `Intl`.
- `zod` valida la forma del JSON donde la capa la lee (DGCP, SIL paginado,
  OPSEVI, OC, SIMBAD, Aduanas, Consultoría, `/democracia`); `zod/mini` en lo
  que viaja al navegador (`lib/seguimiento.ts`).

## Data layer — `lib/dgcp.ts` (the heart of the app)
Owns all DGCP types (`Proceso`, `Articulo`, `Documento`, `Contrato`,
`ContratoArticulo`) and access functions:
- `dgcpFetch<T>(path, params, revalidate)` — single wrapper for every upstream
  call: 25s timeout, **one retry**, and normalizes the API's quirks (`hasError`
  flag, `payload.content` arriving as `null`).
  (The five plain-language **stages** of a process — `ETAPAS` / `etapaDe` /
  `etapaPorClave` — live in `lib/estados.ts`, not here: they are UI vocabulary
  and the client imports them, so keeping them out of this module keeps the
  adapter out of the browser bundle.)
- `listProcesos(opts)` — two paths, and the difference is declared in the
  response. **Passthrough** (one request, `totalResults` is the source's own
  census) when there is no `q`, no stage the API can't filter by itself, and
  `orden === "recientes"`. **Sweep** otherwise: up to `MAX_PAGINAS_BARRIDO`
  (6) × 1000 records within the given filters, then filtered **server-side** by
  stage and by text — accent/case-insensitively via `normalize`, across
  título/descripción/unidad_compra/código/área — then sorted and **really
  paginated**. It returns `scanned`/`truncated`/`muestra` so the UI must say the
  count came from a sample. A non-default sort forces the sweep on purpose:
  sorting is ranking, and ranking one page of 24 while the control says «Mayor
  monto» asserts something false about thousands of processes.
- `getProceso(codigo)` — fetches process + artículos + documentos + contratos in
  parallel (each failure tolerated independently).
- `getUnidadesCompra()` — ~705 active buying units (cached 24h).
- `getPreciosSubclase(subclase)` — historical contracted unit-price stats
  (min/median/max + examples) by UNSPSC subclass (cached 1h).

Cache windows by data type: listings 5 min, precios 1 h, unidades 24 h.

Four more endpoints of the same API, added after the second source audit
(`docs/AUDITORIA.md` §A.3) — same wrapper, same cache discipline:
- `getCompetencia(codigo)` — **`/ofertas`**: who bid on a process, not just who
  won. `proceso` filters upstream, so a process's bidders are the record, not a
  sample. Caveat the UI must keep stating: `estado_evaluacion` arrives empty
  even on awarded processes, so **the contracts say who won, never the offers**.
- `getProveedorRegistro(rpe)` — **`/proveedores`**: the supplier's registry
  card, including the RNC (the join key to DGII). The type deliberately drops
  the registry's phone/e-mail/contact fields: public by registry, but this is a
  watchdog, not a business directory.
- `getSubclase(subclase)` — **`/catalogo`**: plain-language UNSPSC names.
The supplier register is a **lookup, not a listing** (`docs/AUDITORIA.md` §A.12):
127,896 inscribed, ordered by `rpe` ascending, and only `rpe` and
`numero_documento` (9-digit RNC / 11-digit cédula, exact) actually filter —
`estado`/`provincia`/`region` are recognised names that 500 on every value, and
`razon_social`/`nombre`/`q` are silently ignored. Worse, **it cannot be swept**:
some pages return a permanent 500. So the layer offers:
- `getProveedorPorDocumento(doc)` — by RNC or cédula, digits normalised and
  retried zero-padded to 11 (the register stores cédulas that way).
- `contarProveedoresRegistrados()` — the census, the one figure here that may
  be a denominator.
- `registrosDeProveedores(rpes)` — registry cards in waves of 4.
- `muestrearProveedores()` — who is actually winning, aggregated **by RPE**
  over the same recent-contracts window `muestrearContratos` scans (both go
  through `paginasDeContratos`, so they share the fetch cache — keep the page
  count equal or the sharing breaks). It is a **sample**, never the census.
- `buscarProveedores(q)` — resolves a query by RPE, by document or by name; the
  name path can only search the window, and `ResultadoProveedores` carries the
  base (`contratosEscaneados`, `desde`/`hasta`) so the UI must declare it.
  `/proveedores` adds, for a name, `buscarEnTodo(q, { tipo: "proveedor" })`
  (`lib/busqueda.ts`): the 32 mil suppliers with a contract since 2015, word
  matches only, exact name first and then by contract count. Until 2026-09-26
  the page had only the window, and a supplier with no award in the last month
  (Plaza Lama, 865 contracts) never came up by name.
- `listPacc({periodo})` — **`/pacc`**: each unit's annual purchasing plan, the
  earliest signal the State publishes. Its `periodo` filter is ignored
  upstream, so the year is filtered server-side.

## Fiscal data layer — `lib/fiscal.ts` + `lib/capitulos.ts`
Budget execution per institution (vigente → comprometido → devengado → pagado),
month by month, from the **SIGEF open-data API** (`docs/AUDITORIA.md` §A.1). Three
things make it unlike the other layers:
1. **It reads a snapshot, not the network.** The API computes the running year
   live: ~97 s for a whole institutional section, 20–90 s for one institution —
   beyond any request budget. `scripts/build-fiscal.py` resolves the three
   sections in three calls into `public/data/fiscal.json`; the module serves it
   instantly and the UI always shows the cut date. Same contract as nómina.
2. **`PRESUPUESTO VIGENTE` is a monthly delta, not a balance** (month 1 = the
   year's opening, the rest = modifications with sign), so the real vigente is
   the year's **sum**. Getting this wrong yields a believable, false figure.
3. **The cut month is the last month with real accrual**, not the last month
   with rows: the source already returns zero-filled rows for the month in
   progress.
`lib/capitulos.ts` holds the 104 budget chapter codes (extracted from the
Transparency Portal's own form — Hacienda publishes the taxonomy nowhere else)
plus `titulizar`, which puts official ALL-CAPS names into reading case while
preserving the acronyms in parentheses.

## Horizonte 3 snapshots — `lib/obras.ts` (y sus hermanas)
Sources too large to read per request (`docs/PLAN-ACCESO.md` §4), built by a
`scripts/build-*.py` into `public/data/*.json` and read from disk with
`node:fs` (server-only, like `lib/nomina-server.ts`), memoised per instance.
Every UI that shows them states the source's cut date.
- **`lib/obras.ts`** — MapaInversiones (`docs/AUDITORIA.md` §A.4).
  `scripts/build-obras.py` joins four open CSVs (~21 MB) by SNIP into
  `obras.json` (3,609 projects: estado, valor, avance, sector, entidad
  ejecutora, provincias, totals) and `obras-detalle.json` (top-12 contracts and
  processes per project), plus an index **proceso → SNIP** so
  `/procesos/[codigo]` finds the project even when the DGCP omits `codigo_snip`.
  `obrasDeProceso` returns each project with **who says so** (DGCP, MapaInversiones
  or both) because the two disagree. The executing entity is joined to the DGCP
  purchasing unit by normalised name plus the curated `EJECUTORAS` table.
  `AvanceFisico == AvanceFinanciero` in every row of the source, so the layer
  exposes one `avance` and the UI calls it «avance declarado».
  Self-contained server components for other pages live in
  `components/fuentes-nuevas/` (`ObraDelProceso`, `ObrasDeInstitucion`, `FilaObra`).
- **`lib/rnc.ts`** — DGII taxpayer register joined to the DGCP supplier register
  (`docs/AUDITORIA.md` §A.2, §A.12). `scripts/build-rnc.py` downloads the full
  supplier table (`/api-dgcp/v1/tablas/proveedores?Type=csv`, reading only RPE
  and document — contacts never leave the script) and the DGII ZIP (cp1252),
  keeps the 9-digit RNCs (legal persons) and writes ten shards
  `public/data/rnc/{0..9}.json` keyed by the RPE's last digit, each with its own
  dictionary of activities and states. `getRegistroTributario(rpe)` reads one
  shard; `FichaRnc` (in `/proveedores/[rpe]`) shows activity, state, regime and
  the days between «inicio de operaciones» and the oldest contract the API returns.
- **`lib/sismap.ts`** — MAP's SISMAP ranking (`docs/AUDITORIA.md` §A.7), three
  server-rendered tables (181 institutions, 160 ayuntamientos, 233 juntas) read
  by `scripts/build-sismap.py`, which also joins each row to a purchasing unit
  by normalised words (exact set, else Jaccard ≥ 0.85 with a unique best; an
  ayuntamiento never matches the junta of the same place; duplicate targets are
  dropped). No cut date is published upstream, so the snapshot carries
  `consultado`. `/gestion` shows the full ranking; `SismapDeInstitucion` the
  institution's row.
- **`lib/combustibles.ts`** and **`lib/tasa.ts`** are *live* sources, not
  snapshots (through `lib/pedir.ts`: 25 s, one retry, content-type checked):
  the MICM front page (six prices + the week, parsed from its markup, fetch
  `revalidate: 3600`) and the BCRD reference-rate `.xlsx` on its CDN (the
  whole daily sheet read with `lib/xlsx.ts`, ~0.5 s for 9,000 rows, so the
  parsed rate is kept one hour with `unstable_cache` and the download itself is
  `no-store`). The panorama indicators live in
  `components/fuentes-nuevas/indicadores-bolsillo.tsx` (`SeccionBolsillo`).

## Tercera pasada — el Estado entero (`docs/AUDITORIA.md` §G)
Same two adapter classes, eight more sources.

⚠️ **Dev-only:** the first `next dev` render of `/` logs `RangeError: Maximum
call stack size exceeded` and truncates the stream; later renders pass. It
reproduces at `8eba621` (before this pass), and `next build` + `next start`
serve `/` at 200 (~230 KB). React 19's dev debug info serialises awaited
values and the panorama awaits large ones. Not yet fixed; verify pages with
a production build, not the first dev hit.

Snapshots (build-time `scripts/build-*.py` → `public/data/`, read with
`node:fs`, memoised; UI states the generation date):
- **`lib/historico.ts`** — every DGCP contract and process since 2015
  (§G.1). `scripts/build-historico.py` downloads the two bulk tables
  (~360 MB), assigns a contract to its purchasing unit by the unambiguous
  prefix of its code (99.2 %), sums DOP, non-cancelled contracts and **sets
  aside** every contract ≥ RD$10 000 millones (listed, never summed). Writes
  `historico/resumen.json`, `historico/instituciones.json` and ten
  `historico/proveedores/{d}.json` shards by the RPE's last digit. Pages:
  `/historico`; blocks `HistoriaDeInstitucion` / `HistoriaDeProveedor`
  (`components/fuentes-nuevas/historia-compras.tsx`) on both fichas. The year
  chart is `SerieTemporal` (`components/graficos/`).
- **`lib/biblioteca.ts`** — documents published by 22 institutions through
  WordPress' public `/wp-json/wp/v2/media` (§G.2). `scripts/build-documentos.py`
  checks robots per host, walks every page up to `X-WP-TotalPages` (empty pages
  in the middle are normal), 1 s per host, hosts in parallel; keeps title,
  upload date, type and the original URL (nothing is rehosted). `/documentos`
  searches titles and file names (all words, no accents);
  `DocumentosDeInstitucion` shows the latest on the institution ficha.
- **`lib/nomina-general.ts`** — MAP's statewide payroll (§G.10), 492k rows
  aggregated by `scripts/build-nomina-general.py` into institution → cargo
  stats without names or gender; served server-side by `/nomina/general`
  (never shipped whole to the browser, unlike `nomina.json`) and used as the
  nómina block of fichas that have no payroll of their own.
- **`lib/bcrd.ts`** — BCRD IPC and air arrivals from BIFF `.xls` files
  (§G.5), converted by `scripts/build-bcrd.py` (build-time `xlrd`), card
  `InflacionTurismo` on `/`.
- **`lib/subsidio.ts`** — Treasury transfers to the state electricity
  companies since 2019 from SIGEF `gastos/transferencias` (§G.8),
  `scripts/build-subsidio.py`; card on `/finanzas`.
- **`lib/catalogo.ts`** — the whole datos.gob.do catalogue (§G.3) from its HTML
  search, 10 s between requests (`scripts/build-catalogo.py`). `/datos`.

Live sources (fetch `revalidate`, 25 s, one retry, content-type checked, each
card degrades alone to «no contestó»; cards in `components/fuentes-nuevas/`,
composed in `app/page.tsx`):
- **`lib/macro.ts`** — BCRD CDN remittances, gross reserves, weighted lending
  rate (§G.5), `IndicadoresMacro`. Daily.
- **`lib/aduanas.ts`** — Aduanas' JSON document index → import/export/revenue
  XLSX (§G.5), `ComercioExterior`. Daily.
- **`lib/energia.ts`** — Organismo Coordinador hourly generation and marginal
  plant for yesterday (§G.8), `DiaElectrico`. Hourly.
- **`lib/sociedad.ts`** — MIP robberies and firearms, MINERD enrolment,
  MIVHED permits (§G.14), snapshot from `scripts/build-sociedad.py` (each block
  validated alone, a failed block keeps the previous one marked `heredadoDe`);
  `/pais`.
- **`lib/auditorias.ts`** — Contraloría and Cámara de Cuentas audit reports
  plus the sworn-declaration lists as titled links, no names (§G.12);
  snapshot from `scripts/build-auditorias.py`; `/auditorias`.
- **`lib/banca.ts`** — SIMBAD chart data (`type=results`, never the query)
  for four banking series (§G.13), `IndicadoresBanca` on `/`. Daily.
- **`lib/subastas.ts`** — Crédito Público auction results (§G.13), snapshot
  from `scripts/build-subastas.py` (build-time `xlrd` for 2025), `SubastasDeuda`
  on `/deuda`.
- **`lib/cortes.ts`** — scheduled maintenance outages from Edenorte's RSS and
  Edesur's weekly page (§G.11), today onward; `/luz`.
- **`lib/alertas.ts`** — INDOMET CAP feed (§G.4), `AlertasTiempo`. 15 min.
- **`lib/siniestralidad.ts`** — OPSEVI's undocumented JSON (§G.7),
  `SiniestralidadVial`; current year vs the same months of the previous one.
- **`lib/tse.ts`** — Tribunal Superior Electoral rulings (§G.6), same shape
  as `lib/tc.ts` (unstable_cache over parsed rows; follows «Siguiente», 15
  pages max, `truncado` declared); `/tse`.
- **`lib/justicia.ts`** — Poder Judicial monthly entradas/salidas by
  departamento (§G.6), snapshot from `scripts/build-justicia.py`, card
  `EstadisticasJudiciales` on `/`.
- **`lib/tc.ts`** — Tribunal Constitucional rulings, one year per read (§G.6);
  `/constitucional`. The exception in this list: a year is up to ~1.1 MB of
  HTML, near the 2 MB fetch-cache limit, so it fetches `no-store` inside
  `unstable_cache` over the parsed rows (6 h current year, 7 d closed years)
  with a 60 s timeout (a year measured 7.7 s).

## API routes — `app/api/*` (all `export const dynamic = "force-dynamic"`)
Thin proxies that call a `lib/dgcp.ts` function inside try/catch and return
`502` on upstream failure: `procesos` (search/list; `procesos/csv` the whole
sweep, both parse filters with `procesos/filtros.ts`), `precios?subclase=`
(validates `subclase` against a digit regex), `unidades`, `proveedores?q=`
(the supplier lookup/market, same 30-min window as the page) and `feed` (renders
an **RSS 2.0** feed of the last 30 days for a saved search — the alerting
mechanism).
**The pattern for any new data capability: add a function in `lib/dgcp.ts`, then
a force-dynamic route here that wraps it.**
Two routes serve the follow feature without storing anything: `seguimiento`
(`?tipo=proyecto&id=` or `?tipo=expediente-senado&id=<cuatrienio>/<id>`) wraps
`getIniciativa`/`getFichaSenado` and returns only `{huella, titulo}` — the
existing `congreso`/`senado` routes are listings and cannot return one piece —
and `feed/congreso/[id]` renders a bill's SIL history as RSS. Processes are
read through `procesos?proceso=`; an institution's new processes are already
`feed?uc=`.

`buscar?q=&n=&tipo=` wraps `buscarEnTodo` (`lib/busqueda.ts`) for the palette:
the first `n` rows of any type, at most half from one type when no `tipo` is
given.

## Búsqueda — `lib/busqueda.ts` + `public/data/busqueda/`
El índice de toda la plataforma, sin base de datos ni clave: archivos
versionados y dos bibliotecas abiertas (el tokenizador de Hugging Face y el
lematizador de `@orama/stemmers`).

- **Corpus** (`corpus.json`, ~44 MB; ~7.8 MB comprimido): ≈188 mil entradas de las instantáneas
  —instituciones, legisladores, proveedores, procesos de compra, normativa
  reciente y **todas las leyes**, iniciativas del Congreso, sentencias del TC
  y del TSE, obras, documentos, datos abiertos y cargos de nómina (las
  grafías de un mismo cargo se juntan)—, con título, texto auxiliar, quién
  publica (tabla `origenes`), enlace y fecha. El detalle y el texto auxiliar
  que se repiten (40 mil «Compra menor al umbral · Adjudicado») viajan una
  vez en `frases` y se resuelven al leer (`resolverFrases`). Lo escribe
  `scripts/build-busqueda.py`, que se corre **después** de regenerar
  cualquiera de ellas, y lleva una `huella` (sha256 de las entradas) que
  ata a él el índice guardado. Las fuentes nuevas traen su lector de
  entradas (`scripts/busqueda_{leyes,procesos,sentencias,congreso}.py`,
  `entradas(datos)`), que da quién publica por nombre (`on`).
- **Qué hay de cada fuente**:
  - *Leyes* (`leyes.json`, `scripts/build-leyes.py`): el histórico completo
    de la Consultoría, 12,130 desde 1844 (AUDITORIA §G.15). Se deduplican
    contra `normativa.json` por tipo, número y fecha. Las que tienen número
    con año enlazan a su ficha, que ahora las resuelve también desde el
    histórico (`leyHistorica` en `lib/normativa.ts`); las demás —número sin
    año, «BIS», números que el origen repite— abren el PDF en la
    Consultoría (`/api/document/{DocId}`), que el navegador de quien busca
    sí alcanza.
  - *Procesos* (`procesos.json`, `scripts/build-procesos.py`): los 77,790
    publicados en los 12 meses anteriores a la última publicación de la
    tabla abierta de la DGCP, con carátula, unidad de compra, modalidad,
    estado y monto estimado. El código va en `r`: el enlace
    (`enlace.proceso`) y su búsqueda como texto auxiliar se derivan de él.
  - *Sentencias* (`sentencias.json`, `scripts/build-sentencias.py`): 11,393
    del TC (2012–) y 713 del TSE (2021–), por su «Relativo a», número (en
    sus variantes de escritura) y expediente; abren la ficha del Tribunal.
  - *Congreso* (`congreso.json`, `scripts/build-congreso.py`): los 221
    legisladores con ficha (189 diputados, 32 senadores) y las 17,857
    iniciativas del SIL de los dos períodos que expone (2020–2024 y
    2024–2028; AUDITORIA §G.15). Con ellas dentro, `/buscar` dejó de
    consultar el SIL en vivo; el Senado sigue en su vertical. «Senador»,
    «diputada por Santiago» prefieren legisladores: su cargo y su provincia
    están en el texto auxiliar, y el que lleva todas las palabras cuenta como
    nombrado.
  - *Proveedores* (32,152): los que tienen al menos un contrato desde 2015 en
    `public/data/historico/proveedores/` —no los ~138 mil inscritos del RPE—,
    con el RNC del cruce con la DGII cuando existe; ni teléfono ni correo.
    Llevan RPE (`r`), RNC (`c`), contratos (`k`) y años (`a`); enlace y
    detalle los deriva `aResultado`.
  - *Cargos*: plazas, instituciones y el sueldo mensual bruto de sus plazas
    en percentil 10, mediana y percentil 90 (`s`); no el mínimo ni el máximo,
    que una plaza de medio mes (RD$2,754 de un «médico general») vuelve
    anécdota. Con menos de diez plazas van mínimo, mediana y máximo, y la
    fila dice «en sus N plazas» en vez de «8 de cada 10».
  - *Un número que nombra dos normas* (el Decreto 108-23 son dos decretos; la
    Ley 17-06, el presupuesto de 2006 y la presa de Jigüey) no lleva ficha: su
    ficha resolvería una sola. Esas filas abren el PDF de cada una; la misma
    norma cargada con dos fechas es una sola fila.
  - *Texto dañado en el origen* («DesempeÃ±o», UTF-8 leído como 1252) se
    repara por tramos al armar el corpus (`reparar`); lo que perdió un byte
    en el origen se queda como vino.
  - **Sin vector** van legisladores y proveedores, al final del corpus: un
    nombre de persona o de empresa no dice de qué trata. `vectorizados` dice
    hasta dónde hay vector.
- **Por palabra**: un índice invertido propio (`lib/busqueda-esquema.ts`),
  sin alias `@/`, que usan igual el servidor y
  `scripts/build-indice-busqueda.mjs` (que `node` carga quitando tipos): el
  corte de palabras, las vacías y el lematizador son uno solo, o las raíces
  guardadas no serían las de la consulta. Los términos van ordenados
  (búsqueda binaria, prefijo, errata a una edición) y, por término, sus
  apariciones con campo y frecuencia. BM25+ (k1 1.2, b 0.75, d 0.5) sobre
  título (×3), texto auxiliar y origen (×0.5), con la rareza por campo y
  **el mejor campo** por término, no la suma: «Presupuesto-Formulado-1990»
  de la Dirección General de Presupuesto repite la palabra en título,
  archivo y origen y no por eso va antes que un documento titulado
  «Presupuesto». Un número con guiones es una palabra y se indexa también
  por partes y en su forma corta («47-2020» es también «47-20»).
  `lib/raiz.ts` da el lematizador español **después de quitar tildes** y la
  lista de palabras vacías de `@orama/stopwords` **menos las de contenido**
  (trabajo, estado, empleo, general, poder, cuenta, trata, valor, país…).
- **Qué palabras cuentan** (`analizarConsulta`): todas las de contenido
  tienen que estar, **en cualquier campo** («agua CORAMON»). Excepciones que
  ordenan sin exigirse: en una pregunta (con «¿?» o que empieza por qué,
  cuánto, quién…), el verbo y el sujeto genérico («¿cuánto **gana** un
  médico?», «¿cuánto debe **el país**?» —exigir «país» traía los decretos de
  consulados—); las de un sueldo («salario ministro» → la plaza de ministro,
  y prefiere cargos ×1.6); las de una compra («compras de computadoras» →
  los procesos que se titulan «Adquisición de computadoras», y prefiere
  procesos). Si una pregunta no deja nada que nombrar, no hay búsqueda por
  palabra ni por tema: la contesta la pantalla que la responde, y la página
  lo dice. El prefijo solo vale en la última palabra mientras se escribe
  («minis» → ministerio), si el lematizador no la tocó y no es un número.
  Una errata a una edición de la raíz se suma cuando lo exacto trae menos de
  tres y la consulta es de una o dos palabras de seis letras o más; lo
  exacto vale el doble y va primero. Una cita («Ley 80-25», «ley 1494»,
  «TC/0064/19») o un número suelto no buscan tema, y la cita exacta de una
  norma o una sentencia va primera. Con un tipo elegido, la búsqueda se
  hace dentro del tipo, para que la lista llegue tan lejos como su cuenta.
  Cuando hay más coincidencias que el tope de la fusión (20 mil), los
  filtros se cuentan en una sola pasada sobre todas, con las copias
  juntadas como en la lista (antes, once búsquedas más: hasta ~1 s).
- **Instantáneas, con su fecha al lado**: cada grupo dice la fecha de su
  instantánea, y el estado de un proceso o de una iniciativa se lee «Adjudicado
  al 25 sep 2026» en la fila y en la paleta: «Abierto a ofertas» ese día puede
  estar cerrado hoy, y el vigente está en su ficha. Las fechas de fila son
  relativas (`<Antiguedad>`: publicado, depositada, dictada).
- **Índice guardado** (`indice.bin`, ~21 MB): «SIB1», una cabecera JSON
  con la etiqueta del corpus (fecha | huella | entradas), los términos
  unidos por «\n» y, alineadas, las tablas `inicio`, `entrada`,
  `campoFrecuencia` y `largo`. El servidor lo lee con vistas sobre el búfer,
  sin `JSON.parse` (~20 ms); si falta, está roto o es de otro corpus, lo
  construye en memoria (~5 s), más lento y nunca distinto. Reemplazó el
  guardado de Orama (`indice.json.br`: 27 MB de JSON que costaban ~1.3 s por
  arranque con 68 mil entradas, más `load` de su árbol).
- **Por tema**: Model2Vec `potion-multilingual-128M` (MIT), un embedding
  **estático** —una tabla por pieza, sin red que ejecutar—, podado al español
  por `scripts/build-modelo-semantico.py` (72,837 piezas, PCA 256→128, int8:
  `modelo.bin` 9.6 MB + `tokenizer.json` 2.7 MB). La consulta se tokeniza con
  `@huggingface/tokenizers` (JS, Apache-2.0; mismos ids que el de Rust,
  verificado en 6,000 títulos) y se promedia; se compara por coseno contra
  `vectores.bin` (4.7 MB). Umbral 0.55: por debajo, el parecido es ruido.
- **Fusión**: rango recíproco (RRF, k = 60; el tema pesa 0.6), un bono al
  nombre, las siglas o la cita exactas (también a las palabras exigidas:
  «Ministro» en «salario ministro»), un peso menor para hospitales,
  ayuntamientos, cargos, procesos, iniciativas y sentencias, y 0.8 para un
  documento titulado como su archivo («7. ag salud.pdf»). Solo se juntan
  copias de verdad: el **mismo archivo** (sitio, nombre sin extensión ni el
  «-1» que WordPress pone a una segunda subida, y título) en PDF y XLSX, o
  el **mismo título del mismo sitio subido el mismo día** (los cinco anexos
  de un aviso de la DGCP), es una fila con sus formatos y «N archivos», que
  abre `/documentos` con ese título y ese sitio; dos decretos «Que otorga
  exequátur», dos obras homónimas con distinto SNIP o dos «Informe» de
  fechas distintas son filas distintas. Cada resultado dice su vía: `palabra`, `tema` o `ambas`; la
  interfaz marca «Por tema» lo que no lleva todas las palabras.
- **Coste**: carga del motor por instancia ~0.8–0.9 s con ≈188 mil entradas
  (medido el 2026-09-27 en node: casi todo es `JSON.parse` del corpus y el
  tokenizador; el índice, ~20 ms), contra ~1.3 s del índice de Orama con 68
  mil; ~430 MB de memoria residente; 25–120 ms por consulta en caliente (el
  barrido por tema recorre ~155 mil vectores). `/buscar` pone los resultados en un
  `Suspense` para que la caja no espere; la paleta no muestra nada mientras
  tanto (y «Toda la plataforma» sigue ahí), y si `/api/buscar` falla lo dice
  en una línea: «no respondió» no es «no hay nada». `next.config.ts` declara los
  archivos en `outputFileTracingIncludes` de las tres rutas que los leen
  (`/buscar`, `/api/buscar`, `/proveedores`) y excluye de toda función las
  instantáneas que solo lee el armado del corpus (procesos, Congreso,
  sentencias). ⚠️ Una ruta de `fs` con el nombre en una variable hace que el
  trazado meta `public/data` entero en cada función que la importa: así
  cargaban ~146 MB ocho páginas por `lib/obras.ts`, que ahora escribe cada
  ruta entera. El gate comprueba que `indice.bin` sea de su `corpus.json`:
  si no, cada arranque en frío lo reconstruye (~6 s, ~535 MB).
- **Pantallas** (G4, `lib/pantallas.ts`): cada destino de `lib/indice.ts`
  con lo que ofrece y las preguntas que contesta. `buscarPantallas` las pasa
  por el mismo modelo al cargar (~40 pantallas, ~150 frases; no hay archivo
  que regenerar) y puntúa el mayor coseno con alguna frase más la mitad de
  la parte de las palabras que aparecen; umbral 0.5 (medido: «xyzqwe» llega
  a 0.36). `/buscar` y la paleta abren con «Pantallas que lo responden». La
  prueba es `node --no-warnings scripts/probar-pantallas.mjs`: sesenta
  preguntas de `scripts/bateria-pantallas.json`, redactadas aparte de las
  declaradas, 60/60 entre las tres primeras.
- **El atajo** (`lib/buscar.ts` → `middleware.ts`): un RNC, «Ley 47-20» (o
  «ley 47 20»), un código de proceso o unas siglas exactas son un **307**
  desde el middleware; dentro de la página, `redirect()` llegaba después de
  que `app/loading.tsx` empezara a enviar y la respuesta era un 200. Por eso
  `lib/buscar.ts` lee el cruce de instituciones del JSON y no de
  `lib/instituciones.ts`.
- **El mismo criterio en cada vertical** (`lib/raiz.ts`: `agujas`,
  `contieneTodas`, `coincideConsulta`, `pruebas`): todas las palabras, en
  cualquier orden, sin tildes, por raíz y al **comienzo de palabra**, con los
  números enteros («1-26» no encuentra «11-26»). Lo usan instituciones,
  obras (con las siglas de quien ejecuta), finanzas, gestión, luz,
  auditorías (con el nombre detrás de las siglas), nómina (cada palabra en
  cualquiera de los campos), nómina general, documentos, datos, normativa,
  TC, TSE, legisladores y licitaciones. Diputados y Senado comparan letra
  por letra en el origen: `variantesAcento` prueba las formas con tilde y se
  filtra en casa (`buscarIniciativasTolerante`, `conOtrasFormas`), con lo
  leído declarado. `recortar` corta lo tecleado sin partir un emoji.
- ⚠️ **Límite del tema**: un embedding estático entiende vecindad de
  palabras («agua potable» ↔ «acueducto», «escuelas» ↔ «educación»), no
  frases: «corrupción» no llega a «Cámara de Cuentas». Por eso acompaña a la
  palabra y nunca la sustituye. Un modelo de frases (`multilingual-e5-small`)
  se evaluó y no se adoptó: mejor en 7 de 17 consultas, peor en 5, ~220 MB
  más en la función y ~2 s más en frío (`docs/PLAN-ACCESO.md` §6 bis).

## Congreso data layer — `lib/congreso.ts`
Same contract as `lib/dgcp.ts`. The SIL is the portal's **internal** API, not a
documented public one, so three rules are enforced in `silFetch`:
1. **A `200` does not mean the route exists** — IIS serves the SPA shell (HTML,
   status 200) for unknown paths under `/sil/`, so `content-type` is validated
   on every response, never the status code.
2. **GET only.** The SIL's single write endpoint is never touched.
3. Identifiable User-Agent, 25s timeout, one retry, conservative concurrency.

It also owns legislature arithmetic (`evaluarPerencion`: 150-day terms opening
27 Feb and 16 Aug, 30-day warning window) and `muestrearIniciativas`, a bounded
sample — the SIL pages 10 at a time with no aggregates, so sweeping its ~622
pages per render is not viable. Views that use a sample must say so.

Field quirks worth keeping: `condicion` and `estado` are two coexisting
taxonomies; `numero` (`06225-2024-2028-CD`) is a **citation**, not a stable id,
because it carries the registration period; the reformulated title is buried
inside `descripcion` behind a `TÍTULO MODIFICADO:` marker. See `docs/RECON.md` for
the full reconnaissance.

## Senado data layer — `lib/senado.ts`
The Senate has no JSON API: its WordPress REST API is locked (401) and the
corpus lives in the **public "consultante" mode** of its FileMaster at
`sil.senadord.gob.do` (ASP.NET WebForms, HTML scraping). Rules enforced there,
documented in `docs/RECON.md` §12:
1. **Session per collection** — each cuatrienio (`C2002-2006`…`C2024-2028`) is
   a separate DB selected by `consultante.aspx`, which sets the ASP.NET session
   cookie; every cold read is a 2-request chain. Any redirect = failure
   (`redirect: "manual"` + one retry with a fresh session).
2. **Consultante only** — never `login.aspx` or admin paths. The single non-GET
   request is the search postback the public form itself uses (ViewState
   replay; `cmbOrden` must carry a value from its list or EventValidation
   500s).
3. Results are cached with `unstable_cache` (fetch-cache keys break on the
   session cookie and `_nc` nonce), windows 15 min/1 h — request volume stays
   far below the Senate WP's `Crawl-delay: 120` even though this host declares
   no robots.txt.

Source limits the UI must keep declaring: list = 50 most recent per collection
(no GET pagination) and search is a **literal accent-sensitive substring**.
Fichas *do* reach the project texts (RECON §13): `documentacionasociada.aspx`
answers by GET inside the session, and the chain
`documentoasociado.aspx` → 70-byte `.htm` → sibling PDF resolves to a file
nginx serves publicly and frameable — so the ficha embeds it. Those PDFs are
**scans with no text layer**, so no automatic synopsis is possible; say so
rather than implying the text is searchable. Senate
routes: `/congreso/senado` (list/search + `?c=` cuatrienio) and
`/congreso/senado/[cuatrienio]/[id]` (ficha). `parseNumeroSenado` treats
`01886-2026-SLO-SE` as a citation; identity is `IdExpediente` **per
collection**. The `TÍTULO MODIFICADO:` marker and PLO/SLO legislatura codes are
shared with Diputados (plus `SLE` extraordinarias, which have no fixed dates).

## Reading a bill — `lib/legislacion.ts`
Neither chamber publishes a synopsis, so this module explains instead of
summarizing, from the official wording only: `referenciasNormativas` pulls the
norms a title cites with their relation (deroga/modifica/adiciona…, taking the
**nearest** preceding verb so «deroga la Ley 189-11 y modifica el Decreto 95-12»
splits correctly), and `queEs`/`queSigue` translate instrument and procedural
condition into plain es-DO. `resolverNorma` in `lib/normativa.ts` turns each
citation into the official text at the Consultoría (its search accepts
`DocumentNumber` as the only filter). When a piece was
enacted, the dossier resolves its own promulgation number and links the law's
text — the only route to articulado on Diputados fichas, whose document server
is unreachable. Each chamber writes that number differently (Senate `136-15`,
Diputados `Ley núm. 43-26`), so `numeroDeNorma` normalizes before searching.
Rendered by `components/congreso/dossier.tsx`
on both chambers' fichas, above the vote widget — understand, read, then vote.

## Reading documents — `lib/documentos.ts` + `components/visor-documento.tsx`
One principle across every vertical: a page that names a document must let you
read it. `VisorDocumento` is the shared reader — never autoloads (some
expedientes are 30 MB scans), declares weight, and its *open* and *download*
links always point at the origin even when the iframe does not. Three cases the
sources impose:
- **Senate SIL** — serves PDFs public, `inline`, no `X-Frame-Options`: embedded
  straight from the origin, no proxy. They are scans (`escaneo` prop warns that
  the text is not searchable).
- **Consultoría** — `inline`, no CSP, and the PDFs are *digital text*: embedded
  directly, and each norm has its own page at `/normativa/[tipo]/[numero]`
  (`ley|decreto|reglamento|resolucion`), which the Congress dossier links to.
  Since 2026-09 Cloudflare challenges Vercel's egress to the Consultoría, so
  listings and citations fall back to `public/data/normativa.json` and the
  proxy cannot fetch the PDF; «Abrir en el origen» is the path (AUDITORIA §4.1).
- **Every source goes through `/api/documento?url=`** — none of them sends
  CORS, and `components/lector-pdf.tsx` rasterizes with **pdf.js on a canvas**
  rather than an `<iframe>`, because an iframed PDF renders nothing on mobile
  (a grey box with an "Open" button that throws the reader out of the page).
  Canvas needs the bytes same-origin. That route is **not an open proxy**:
  only hosts in `ORIGENES_DOCUMENTO`, 40 MB cap, no visitor headers forwarded;
  it forwards `Range`, so the Senate's 30 MB scans stream page by page.
  Adding a host there is a deliberate decision. Use the **legacy** pdf.js
  build: the modern one calls V8 APIs (`Map.getOrInsertComputed`) that break
  chunked loading on browsers a couple of versions behind.

## Pages — `app/`
- `/` → la portada (server, 2026-09-28), en el orden en que se entiende:
  qué es (misión, la caja que busca en todo, «Crear tu cuenta»), qué pasa hoy
  (los cuatro dominios con sus cifras —en el teléfono solo la destacada— y
  una tira con deuda, dólar, gasolina y remesas, cada cifra con fuente y
  fecha), qué vence esta semana (cierres, perención, decretos), para qué
  sirve la cuenta (`docs/PLAN-ESPACIOS.md`; el ejemplo es la forma de una
  investigación, sin nombres reales) y todo lo que hay por tema, leído de
  `lib/menu.ts` para que no se desalinee del megamenú. Los diez tableros de
  indicadores que la empujaban hacia abajo viven enteros en `/indicadores`.
  ⚠️ `line-clamp-*` junto a `block` no recorta: el `display` de `block` pisa
  el `-webkit-box` del recorte (lo arrastraban los paneles de la portada y
  las filas de `/buscar`).
- `/cuenta`, `/espacio`, `/espacio/proyecto?id=`, `/p/[slug]` → la cuenta y
  los espacios del lector (`docs/PLAN-ESPACIOS.md` §3). `/licitaciones` → `app/buscador.tsx` (client) inside
  `<Suspense>`. Filters live entirely in
  the **URL** so any search is shareable/bookmarkable: `nuqs` reads and writes
  it through one parser map shared with the search field
  (`components/licitaciones-url.ts`) — `q`, `etapa`, `modalidad`, `desde`,
  `hasta`, `mipyme=1`, `orden`, `uc`, `page`; defaults are never written, a
  filter change replaces the history entry and resets `page` in the same
  update, a saved search is a real `router.push`, and a legacy `?estado=` is
  rewritten to its `?etapa=` on read. `etapa=` is «todas» and `desde=` is
  «todo el histórico». It fetches `/api/procesos`. `MODALIDADES` is defined here and must match the
  DGCP vocabulary. **State is filtered by *etapa*, not by `estado_proceso`**:
  `ETAPAS` in `lib/estados.ts` groups the source's seven states into five
  plain-language stages (`abiertos`, `cerrados`, `evaluacion`, `adjudicados`,
  `sin_efecto`) so «what already closed» is one option instead of six literals
  the reader has to know. Each stage is a **predicate over the normalised
  state**, never a list of literals — an unrecognised state falls into
  `cerrados` (defined by negation of `abiertos`) instead of vanishing.
  The URL carries `?etapa=`; `?etapa=` present-and-empty means *every* stage
  and is not the same as absent, which is the default `abiertos`. Legacy
  `?estado=<literal>` links and saved searches are translated through
  `etapaDe()`. Only `abiertos` maps to a single upstream value
  (`estado=Proceso publicado`), so it stays a one-request passthrough; the
  other stages, free-text search, and any sort other than «recientes» go
  through the bounded sweep and therefore return `scanned`/`truncated`/
  `muestra` for the UI to declare.
- `/procesos/[codigo]` → server detail page, with `precios.tsx` (client),
  `loading.tsx`, `not-found.tsx`.
- `/proveedores` → «¿Quién le vende al Estado?»: the supplier index. Search
  lives in the **URL** (`?q=`) and the page states which of the two very
  different paths answered it — exact (RPE/RNC/cédula, over the whole register)
  or by name (only over the recent-contracts window). Below it, who wins most
  money and who wins most contracts, plus the registry cards of the ten biggest,
  streamed in their own `Suspense` because that panel costs one lookup per
  supplier.
- `/proveedores/[rpe]` → supplier profile: contract history plus the RPE
  registry card (RNC, legal form, incorporation date, MIPYME status).
- `/planes` → annual purchasing plans (PACC) for the current year.
- `/finanzas` → budget execution across the State. Filtered on the server
  from the URL (`?q=`, `?seccion=`, `?orden=devengado|ejecucion|cambio|pendiente`),
  so it is dynamic; three rankings computed from the same snapshot columns
  (`vigente − inicial`, `devengado − pagado`, lowest execution among chapters
  over RD$ 1,000 millones, zero-accrual ones named apart), and a CSV of the
  filtered table built in the browser (`app/finanzas/descargar-csv.tsx`).
  `/finanzas/[capitulo]` per institution (SSG from the snapshot, one page per
  chapter) lists its DGCP purchasing units from `institucionesDelCapitulo`,
  each linking to its `/instituciones/[id]` ficha.
- `/deuda` → SPNF debt over time (finanzas section): year-end since 2000 with
  % of GDP and quarter-ends since 2015 from `getSerieDeuda()` (`lib/deuda.ts`),
  which reads the series from `public/data/deuda.json` and appends the live
  latest close when Crédito Público answers. Both series are `SerieTemporal forma="linea"`
  (a stock is read in its level) with a table behind a `Plegable`.
- `/nomina` → the payroll explorer (client, `components/nomina/explorer.tsx`)
  keeps its state in the URL: `?q=` and `?inst=CODIGO` are a contract with the
  ⌘K palette and the institution ficha; `?cargo=` (normalized prefix match,
  `patronCargo` in `lib/nomina.ts`) and `?vista=resumen|tabla|comparar` are its
  own. Read and written with `nuqs` (replace, not push; `q` and `cargo`
  debounced 250 ms in the URL while the field updates at once), so a link
  that changes the URL on the same page is simply the new state. The page resolves the code → ficha links on the server (the
  institutions cross is 114 KB and never ships to the client) and lists the
  covered institutions with an ochre mark when a photo is older than three
  months (`estaAtrasada`); `revalidate` is a day so that mark stays true.
- `/congreso/legisladores` → directory of the 2024-2028 period (189 deputies
  and the 32 senators the SIL also lists), read **whole** from the SIL — one
  listing per demarcation (`nivel=` is the province id, not the level; RECON
  §14), ~41 requests cached a day — and filtered in the page by `?q=` (name,
  accent-insensitive), `?camara=`, `?partido=` and `?provincia=`. The province
  is compared through `claveProvincia` (accents, spacing, «Monte Cristi»,
  «Concepción de La Vega»…), because `/provincias` links with common names.
  `/congreso/legisladores/[id]` → what they signed (`getPropuestasDeLegislador`,
  bounded to 20 pages and declared as a sample past that), how much was
  approved (condition → tone, `?ver=` cuts), and for deputies how they voted in
  the 30 latest votes of the legislature (`getVotosDeLegislador`, filtered by
  session code). `/congreso/votaciones/[id]` → one plenary vote with the
  roll call of all 190 (19 pages, cached a day), by party and by name.
  `/congreso/[id]` links each deputy/senator sponsor to their ficha and lists
  the plenary votes of the bill.
- **Cross-links** (`components/congreso/cruces.tsx`, each in its own
  `Suspense`, silent when unconfirmed): Diputados ↔ Senado via the Senate's
  «Número de Expediente Cámara Diputados» or, when empty, the shared
  promulgation number (`gemeloEnSenado` in `lib/senado.ts`, at most one
  search + three fichas, only for bills that can be in the Senate); and
  `/normativa/ley/[numero]` → the Diputados bill that became that law plus
  bills citing it (`proyectosDeNorma` in `lib/legislacion.ts`: title phrase +
  confirmation by `numPromulgacion`, since the SIL does not search that field).
- `/estadisticas` → 30-day market dashboard.
- Guides, one per vertical, all static and listed once in
  `components/otras-guias.tsx`: `/guia` (bidding, under Licitaciones),
  `/congreso/guia` (how a law is made), `/finanzas/guia` (reading the budget),
  `/finanzas/guia/deuda` (public debt). They live under their vertical so the
  section bar lights the right one; `/guia` keeps its old URL.
- `/seguimiento` → platform page (not a vertical; «El Estado › La plataforma» in `lib/menu.ts`):
  everything followed, grouped by type, and «qué cambió desde tu última
  visita».
- **Every purchasing unit links to its institution** (`/instituciones/[id]`,
  `lib/instituciones.ts`): the process ficha, `/contratos` and `/estadisticas`
  rankings (aggregated by `codigo_unidad_compra`, not by name), each PACC row,
  a supplier's main clients (by the code the contract carries) and
  `/licitaciones?uc=`. The cross is 114 KB, so client components never import
  it: `/api/unidades` adds `ficha` to each unit server-side for the buscador.
- **CSV downloads** (`lib/csv.ts`: BOM, CRLF, formula-injection guard, scope in
  the filename and `X-Alcance`): `/api/procesos/csv` is the **whole sweep** of
  a `/licitaciones` search (`descargarProcesos`, same filters via
  `app/api/procesos/filtros.ts`, capped at `MAX_FILAS_DESCARGA` = 6000 rows
  read); `/contratos/csv` the 6000-contract sample (`contratosRecientes`,
  same fetch cache); `/normativa/csv` the current list without the 200-row cut.
- `/normativa?q=&mes=&materia=` → text search over number + title (all words, accent-
  insensitive; not the norm's body) of the chosen type and year, live or
  snapshot like the listing (`listaNormativa`). With decretos it shows
  «Designaciones del mes» (`designacionesPorMes`): decrees tagged «Cámara de
  Cuentas» by the Consultoría (appointments and their revocations), per month,
  cargo read from the first mention in the title — derived, and declared so.
  Decretos also get a subject (`materiaDe`: ordered rules over the plain
  title and the source's `Institucion` tag, first match wins; the «Cámara de
  Cuentas» tag only decides an appointment last, because the source also puts
  it on emergency and errata decrees; «Otros asuntos» ~5 % of 2023–2026). The «¿De qué tratan…?» card counts the whole year and
  each subject links to `?materia=`; rows and the CSV (`materia_derivada`)
  carry it. Rules, not a model: they run on the live read with no key
  (docs/DECISIONES.md, Jev).
- `/provincias`, `/provincias/[slug]` (`lib/provincias.ts`) → 32 demarcations.
  The supplier register cannot be filtered by `provincia` (500 with any value,
  re-verified 2026-09-23), so suppliers per province = registry cards of the
  200 biggest winners of the contracts window, grouped by their declared
  province (`unstable_cache`, daily, one computation for all pages). Local
  governments: only the capital's ayuntamiento (and Santo Domingo's seven
  municipalities), hand-mapped by DGCP code. Legislators: link to
  `/congreso/legisladores?provincia=<SIL name>`.
- `/obras` → «¿Existe la obra y avanza?»: the investment snapshot, filtered
  server-side by `?q=`, `?estado=`, `?provincia=` (slug) and `?uc=` (purchasing
  unit); `/obras/[snip]` → one project with its contracts and processes, linked
  to `/procesos/*` and `/proveedores/*`.
- `/gestion` → SISMAP ranking, `?tabla=instituciones|ayuntamientos|juntas` and `?q=`.

## Chrome and indexing — `lib/menu.ts`, `app/sitemap.ts`, `lib/sitio.ts`
- **Megamenú** (`components/megamenu.tsx` over `components/ui/navigation-menu.tsx`,
  Radix NavigationMenu): three doors — Dinero público, Leyes, El Estado — whose
  panels list every destination with a one-line `nota` from `lib/menu.ts`, plus
  a featured entry per door. The viewport is anchored to the sticky header
  (`absolute inset-x-0 top-full`), so the panel is as wide as the page column.
  The trigger holding the current route gets a paper underline (`grupoActivo`).
  The phone's «Más» sheet renders the same `MENU`. No questions in the header
  (owner decision, DECISIONES): `pregunta` survives only as a palette keyword.
- **The index** (`lib/indice.ts`, taxonomy in `lib/tareas.ts`): every
  destination once, derived from `MENU`, where each link declares its `tarea`
  (vigilar · buscar · comparar · leer · participar · entender). The palette
  groups by task, `app/sitemap.ts` lists it, and `.claude/hooks/indice.py`
  fails the gate on a static page that is neither in the menu nor in
  `FUERA_DEL_INDICE` with its reason. It replaced `PAGINAS_PLATAFORMA`: three
  lists of destinations had drifted apart (the palette did not know `/pais`
  or `/luz`).
- **Indexing:** `metadataBase` = `SITIO` (`lib/sitio.ts`, a constant — no env).
  Every page declares `alternates.canonical`: static pages their route, fichas
  their own path (`/instituciones/237` → `/instituciones/237-minerd`). Not
  indexed: `/buscar` (results) and `/seguimiento` (lives in `localStorage`),
  plus the /democracia registration flows. `app/sitemap.ts` (daily) lists the
  views, platform pages, 739 institutions, 32 provinces, ~3,600 obras, the
  budget chapters, the norms of the normativa snapshot (~3,000) and the 221
  legislators; processes, bills and suppliers are reached through links.

## Client state — `lib/seguimiento.ts`
Followed items in `localStorage` (key `lrd:seguimiento`) as typed entries
`{tipo, id, titulo, href, huella?, desde?, visto?}`, `tipo` ∈ proceso, proyecto,
expediente-senado, proveedor, institucion, norma. The old shape (a bare array of
process codes) is migrated on read. `huella` is the state in words, computed by
`huellaDe()` — the same function on the ficha (when following, through
`components/acciones-ficha.tsx`) and in `/api/seguimiento`, so they cannot
drift. `/seguimiento` fetches today's state for the types in `TIPOS_CON_ESTADO`,
shows before/after for those whose huella changed, and only then writes the new
huella (`marcarVistos`). Cross-tab and in-page updates propagate via a custom
`lrd:seguimiento-cambio` event plus the native `storage` event — subscribe with
`onSeguimientoCambio`. `getSeguimiento`/`toggleSeguimiento` keep the old
process-code API for `proceso-card` and `section-bar`. Push notifications are
an open owner decision (`docs/PLAN-ACCESO.md` §6): not built.

## Formato — `lib/format.ts`
Seis funciones, y el listado importa porque tres de ellas son obligatorias por
identidad, no opcionales:
- `formatMonto` — moneda es-DO por `Intl`.
- `formatFecha` — fecha absoluta. Un valor **sin offset** es una fecha de
  calendario dominicana y se muestra tal cual; solo un instante real con `Z` se
  convierte a `America/Santo_Domingo`. Convertir los primeros corría el día
  hacia atrás según la zona del servidor.
- `diasHasta` — días que faltan para una fecha; negativo si ya pasó.
- `hace` — antigüedad en llano («hace 4 meses», «ayer», «hoy»), contada en días
  de **calendario dominicano**, misma regla que `formatFecha`. En una fila de
  listado no se usa directamente sino a través de `components/antiguedad.tsx`.
- `formatPesos` y `formatMagnitud` — magnitud escrita, nunca abreviada: en uso
  dominicano «MM» se lee *millones*, así que abreviar mil millones así se
  equivoca por tres órdenes de magnitud en las cifras que más pesan.

## El grafo — `lib/grafo.ts`, `lib/grafo-servidor.ts` (docs/PLAN-ACCESO.md §6 ter)
Todo lo que se ve es un nodo que se pulsa. Nada se guarda: el grafo se
deriva en cada lectura de las mismas fuentes e instantáneas.

- **Una dirección por tipo de nodo** (`enlace.institucion`, `.proveedor`,
  `.proceso`, `.norma`, `.iniciativa`, `.expedienteSenado`, `.legislador`,
  `.votacion`, `.obra`, `.provincia`, `.capitulo`, `.cargo`), escrita solo
  ahí; el gate (`verificar.sh`, «graph») rechaza un `href` de entidad armado
  a mano. `enlace.norma` canoniza el año («47-2025» → «47-25») y devuelve
  `null` si el tipo o el número no tienen ficha.
- **Reconocer menciones**: `reconocerPorForma` (citas de normas, también
  «Leyes núms. 506-19 y 68-20»; códigos de proceso; SNIP) es de cliente;
  `reconocerTodo` suma los nombres completos de institución (18 letras o
  más, sin hospitales ni gobiernos locales) y es de servidor.
  `components/texto-enlazado.tsx` pinta un párrafo con sus menciones como
  enlaces: títulos de normas, proyectos, expedientes, sentencias y la
  descripción de un proceso.
- **Vecindario** (`components/conectado-con.tsx`): «Conectado con» en cada
  ficha, una fila entera por arista con su cuenta y su fuente; las aristas
  sin nada al otro lado se callan, y la cuenta es siempre la de la lista que
  abre. La votación no lo lleva: su primer bloque ya son las piezas votadas.
- Una norma citada que no podemos leer (fuera del alcance de la Consultoría)
  no es un 404: `NormaFueraDeAlcance` dice qué pasa y enseña los proyectos
  que la citan.

## Primitivas compartidas — el sistema, en un sitio
La identidad se diluyó dos veces por la misma causa (`docs/IDENTIDAD.md` §8):
donde existe una primitiva la adopción es alta; donde no existe, la idea se
reimplementa en cada archivo. Estas son las que hay, y usarlas es la jugada
legal por defecto:

### La capa de abajo: `components/ui/*` (shadcn/ui)
Las piezas genéricas —superficie, botón, marca, campo, pestañas, hoja modal,
desplegable, tabla, medidor— son **shadcn/ui**: código en el repositorio, no una
dependencia de componentes, con Radix por debajo, `cva` para las variantes y
`tailwind-merge` dentro de `cn` para que el sitio de uso pueda ajustar una clase
sin pelearse con la base.

No entraron por aspecto —ese ya lo teníamos— sino por lo que cuesta hacer bien a
mano y casi nadie hace: **foco atrapado dentro de una hoja modal, recorrido con
flechas, cierre con Escape y devolución del foco al disparador**. La hoja de
filtros del buscador tenía las cuatro cosas mal.

Ninguna decisión de color de la librería sobrevive. El puente de tokens al final
de `@theme` en `app/globals.css` ata el vocabulario semántico de shadcn
(`bg-background`, `text-muted-foreground`, `border-border`, `bg-primary`) a los
tokens de «El Contrasello»: `background` **es** `canvas`, `primary` **es** la
firma, `destructive` **es** el sello. Cambiar el papel se sigue haciendo en
`--color-canvas` y las cuarenta primitivas lo siguen.

Tres desviaciones deliberadas respecto a shadcn, todas escritas en la cabecera
del archivo que las lleva:
- **`Card` no flota**: sin `shadow-sm` y con `rounded-lg`, porque el papel se
  separa con filete (§2 y §3 de la identidad). La sombra queda para lo que de
  verdad se superpone: `dialog`, `drawer`, `popover`, `dropdown-menu`, `tooltip`.
- **`Progress` no usa Radix**: es un componente de servidor. Esta plataforma
  dibuja barras sobre todo en el servidor —veinte adjudicatarios, veintitantos
  capítulos— y lo único que Radix aportaba eran cuatro atributos ARIA.
- **Los iconos salen de `components/icons.tsx`**, no de `lucide-react`.

### Bibliotecas de cliente — el mecanismo, no el aspecto
Tres mecanismos que estaban escritos a mano los resuelve hoy una biblioteca
madura, sin clave ni servicio (`docs/PLAN-ACCESO.md` §6 bis, puntos 6-8):

| Mecanismo | Biblioteca | Dónde |
|---|---|---|
| Estado ↔ URL | `nuqs` (`NuqsAdapter` en `app/layout.tsx`) | `app/buscador.tsx` y `components/campo-licitaciones.tsx` (un solo mapa: `components/licitaciones-url.ts`), `components/nomina/explorer.tsx`, `components/buscador-url.tsx` (push + `shallow: false`: filtra el servidor). |
| Lista virtual | `@tanstack/react-virtual` | `components/nomina/data-table.tsx`. |
| Hoja que se arrastra | `vaul` | `components/ui/drawer.tsx` (el `Drawer` de shadcn), bajo `components/bottom-sheet.tsx` y la hoja «Más» de `components/mobile-tab-bar.tsx`. Su movimiento propio (500 ms y su curva, en CSS inyectado y en línea) se reemplaza en `app/globals.css` por los tokens de la casa, y se apaga con movimiento reducido. |

Un estado nuevo que deba sobrevivir a recargar o compartirse va por `nuqs`,
no por `history.replaceState` ni por un efecto que reconcilie dos copias.

### La capa de arriba: lo que ninguna librería puede traer
| Primitiva | Qué resuelve |
|---|---|
| `components/papel.tsx` | Lo que es doctrina y no aspecto: `Rotulo` (su punto es el sello), `Cifra` (un número **con su ancla**) y `TiraDeCifras`. `Hoja`, `CabeceraHoja`, `Marca` y `Accion` ya no existen: son `Card`, `CardHeader`, `Badge` y `Button`. |
| `components/portada.tsx` | La banda de tinta con la pregunta, y su tira de cifras. Estaba copiada en siete páginas. |
| `components/estado-vacio.tsx` | «No hay nada» y «no pudimos mirar», que no se pueden confundir: `variante="caida"` obliga a decir qué pasó, qué sigue en pie y cuál es la única acción útil. |
| `components/marca-estado.tsx` | La marca de estado de un expediente, sea de la fuente que sea, sobre `lib/estados.ts`. Estaba escrita tres veces. |
| `components/campo-busqueda.tsx` | El campo de búsqueda con su **alcance dicho debajo**, antes del toque y no después de «sin resultados». |
| `components/nav-filtros.tsx` | La fila de filtros que **son enlaces** (tipo, año, cuatrienio): cada uno es una página que se comparte. |
| `components/marca.tsx` | El contrasello: `Sello`, `SelloCompacto`, `Logotipo`. |
| `components/plegable.tsx` | Revelación progresiva sobre `ui/collapsible`; el botón dice **cuántos hay**, nunca «ver más». |
| `components/bottom-sheet.tsx` | La hoja de filtros del teléfono, sobre `ui/drawer` (`vaul`, con el `Dialog` de Radix debajo): se cierra arrastrando la cabecera, con el aspa de 44 px o con Escape. |
| `components/paleta.tsx` | «Buscar» en la cabecera de todas las páginas: «¿a dónde vas?», sobre `ui/dialog` + `ui/command` (⌘K, Ctrl K, «/»): todo el índice de `lib/indice.ts` agrupado por tarea y filtrable sin tildes (también por verbo: «votar», «comparar»), lo que el índice de `lib/busqueda.ts` encuentra («En la plataforma», vía `/api/buscar`, a lo sumo la mitad de un mismo tipo), y lo tecleado ofrecido a **cada** búsqueda de `BUSQUEDAS` con su alcance debajo. Lo que el índice no cubre —licitaciones, proveedores, las cámaras— no se finge. |
| `components/ruta.tsx` | La ruta de una ficha sobre `ui/breadcrumb`: la miga entera desde `sm`, solo la vuelta a 44 px en el teléfono. Si se vino de esa vista (`components/rastro.tsx`), volver es el «atrás» del navegador y conserva filtros y posición. |
| `components/paginador.tsx` | Anterior · página · siguiente, con enlaces (`href`) o con estado (`onPage`). Mandos a 44 px en los bordes; el que no aplica se apaga, no desaparece. |
| `components/resaltado.tsx` | Las palabras buscadas en negrita dentro de un título, por raíz (el lematizador español del índice): «escuelas» marca «ESCUELA». Solo servidor. |
| `components/antiguedad.tsx` | La fecha de una fila de listado: `<time>` real, relativa a la vista, exacta en el `title`. |
| `components/esqueleto.tsx` | Las siluetas de **esta** plataforma —ficha, listado, tira de indicadores— compuestas con `ui/skeleton`, con las alturas del contenido. |
| `lib/estados.ts` | **La única** tabla de color de estado, nombrada por significado (`accionable`, `contexto`, `cumplido`, `aviso`, `anulado`). Cada fuente traduce a esos cinco y no guarda tabla propia. También las **etapas** de un proceso de compras (`ETAPAS`, `etapaDe`): la otra traducción de `estado_proceso`, por predicado y no por literal, de la que salen tanto el color como `abierto`. |
| `lib/cifras.ts` | Una cifra con su ancla y su alcance; prohíbe el `+∞ %`, la variación de un porcentaje en por ciento y el denominador sacado de una muestra. |
| `lib/glosario.ts` + `components/termino.tsx` | La jerga traducida en el punto de uso, no en un glosario que nadie abre: `<Termino clave="devengado">` subraya con puntos y abre un `ui/popover` con la frase llana y, si la hay, su guía. Se abre al tocar (un dedo no tiene `hover`), con teclado, y su objetivo de toque mide 44 px sin mover la línea. Una clave nueva va en `glosario.ts` solo si el término aparece en la plataforma. |
| `components/acciones-ficha.tsx` | Seguir, compartir y RSS de una ficha en una línea: la ficha pasa `tipo`, `id`, `titulo`, `href` y los datos crudos del estado (`situacion`). `components/compartir.tsx` escribe el texto según el tipo —nunca «Mira esta licitación» bajo un decreto—. |

### Gráficos: `components/graficos/`
El sistema de visualización (G3; la doctrina y las paletas validadas en
`docs/IDENTIDAD.md` §Gráficos). Todo es de servidor salvo `LecturaSerie`; nada
importa código de servidor, así que el explorador de la nómina (cliente) usa
las mismas piezas. Cada dato acepta `href` y lleva a su entidad.

| Primitiva | Para qué | Dónde se usa hoy |
|---|---|---|
| `BarrasHorizontales` / `FilaBarra` | Ranking con nombre, cifra escrita y base; fila entera enlazada (`estira`), `actual` para el filtro puesto, `alElegir` para filtrar en cliente, `parte` para un tramo interior. | `/proveedores`, `/contratos`, `/estadisticas`, `/provincias`, `/normativa`, `/finanzas`, `/finanzas/[capitulo]`, `/instituciones/[id]`, `/proveedores/[rpe]`, `/nomina`, `/nomina/general`, `/pais` |
| `MarcaBarra` | La barra sola, para una fila compuesta que ya tiene su forma. | Tarjetas de capítulo en `/finanzas` |
| `SerieTemporal` | Serie en el tiempo o sobre un eje ordenado: `columnas` (flujo) o `linea` (saldo, tasa); un solo eje, máximo rotulado, marcas en HTML. | `/deuda`, `/pais`, `/historico`, `/` (inflación), `/finanzas` (subsidio), fichas de proveedor e institución (historia de compras), `/nomina` (tramos de sueldo) |
| `LecturaSerie` | La capa de cliente: guía vertical, ficha con el valor, flechas, enlace de 44 px al tocar. | Dentro de `SerieTemporal` |
| `BarraApilada` | Reparto de un todo al 100 %, con 2 px de papel entre segmentos y leyenda con cifras. | `/estadisticas` (estados), votaciones del Congreso (divergente) |
| `MatrizMensual` | Mes × año en la secuencial, con su escala. | `/` (llegadas por avión) |
| `Multiples` + `maximoComun` | Paneles con escala común. | `/nomina` (áreas y cargos) |
| `Leyenda`, `EscalaSecuencial` | Identidad sin color solo; texto en tinta, muestra al lado. | Capítulo de finanzas, barras apiladas, matriz |
| `VerComoTabla` | La tabla equivalente, plegada, con el número de filas en el botón. | `/` (llegadas) |
| `paleta.ts`, `formato.ts` | Clases literales de las paletas (`CATEGORICA`, `SECUENCIAL`, `DIVERGENTE`, `ORDEN_TONOS`) y `formatearValor` sobre `lib/format.ts`. | — |

`components/barras.tsx` y `components/nomina/charts.tsx` ya no existen: eran las
dos primeras versiones de esto. `Progress` sigue siendo el **medidor** —una
proporción contra el 100 % o un límite: ejecución, avance de obra, SISMAP,
reparto de un voto ciudadano—, no un ranking.

## Rendimiento percibido — streaming y respuesta
The sources are slow and outside our control, so the contract is that the
**page never waits for the slowest one**:
- **Every route has a `loading.tsx`** (`app/loading.tsx` is the generic
  silhouette; listings and fichas have their own) composed from
  `components/esqueleto.tsx`, with the content's heights and grids so nothing
  jumps when data lands. Navigation paints at once; content streams.
- **One `Suspense` per slow source.** The panorama renders the hero and
  structure immediately and each domain card / panel awaits only its own
  source. Listings (`/congreso`, `/congreso/senado`, `/normativa`) render
  header + search first and stream the rows. Fichas stream the dossier
  (Consultoría lookups), the Senate document chain and the `HEAD` for a PDF's
  weight after the ficha itself. Historical prices on `/procesos/[codigo]` are
  server components streamed per subclass, not client fetches after hydration.
- **`cache()` from React** wraps any read shared by `generateMetadata` and the
  page (`cargarProceso`, `cargarIniciativa`, `fichaPorClave`, `cargarNorma`)
  and by sibling sections (`procesosRecientes` on `/`), so a render issues one
  upstream request per datum. Anything the page can compute without the
  network (legislature dates, counts of a sample) stays outside the boundary.
- **La rejilla de la nómina no es `ui/table`**, y su cabecera lo dice: son cien
  mil plazas virtualizadas con `@tanstack/react-virtual`, que **mide** cada
  fila pintada (`measureElement`) en vez de fiarse de un alto fijo —en
  teléfono la fila se pliega a dos líneas—; reordenar vuelve al principio de
  la pista. `ui/table` manda donde hay
  un cuadro de datos normal (los artículos de un proceso); aquí manda el
  desplazamiento fluido.
- **Client lists keep the previous results on screen** while the next page
  loads (`aria-busy` + dimmed), never a skeleton swap; the skeleton is only
  for the first paint. `/licitaciones` renders a real silhouette as the
  `useSearchParams` fallback, never `null`.
- **Long lists paint lazily** with `.cv-auto` (`content-visibility: auto`;
  set `--cv-alto` to the row's height) on rows of procesos, iniciativas,
  expedientes, normas, capítulos and planes.
- **The edge caches the JSON routes**: every `app/api/*` success response
  carries `Cache-Control: public, s-maxage=<its lib window>,
  stale-while-revalidate`, matching the `revalidate` of the `lib/*` call it
  wraps. `public/data/*.json` snapshots carry one hour + SWR from
  `next.config.ts`, and `/nomina` `preload()`s its snapshot from the HTML.
- `next.config.ts` sets `experimental.staleTimes` (30 s dynamic / 5 min
  static) so returning to a visited listing does not wait for the SIL again.

