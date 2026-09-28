---
paths:
  - "app/**"
  - "components/**"
---
# «El Contrasello» — what the UI may and may not do

docs/IDENTIDAD.md is the source of truth: if the interface contradicts it, the
interface is wrong. Read it in full before any visual work. The rules below
are enforced by `.claude/hooks/guard-edit.sh` and `verificar.sh`.

## Prohibitions (the 215 violations that were once cleaned up)
1. No gradients, no blur washes (`bg-gradient-*`, `blur-3xl`). Dark panels are flat ink.
2. No glass shadows. Surfaces you **read** separate with the hairline
   (`border-hairline`); `shadow-card`/`shadow-soft` only for what truly floats.
   Depth is semantic (docs/IDENTIDAD.md §Relieve): flat = read, `relieve`
   (grain + 2 px canto) = press, sunk = on (`aria-current`/`aria-pressed`/
   `data-state=on`), `shadow-pop` = overlays. A stretched link is `estira`
   inside a `relative` container, which then gets relief or row response.
3. `rounded-lg` (8 px) is the maximum on surfaces; `rounded-full` only for
   dots, seals, avatars. Never `rounded-2xl`/`rounded-3xl`. `rounded-full`
   with real horizontal padding (`px-2`+) is a pill — a badge or button
   dressed as an app: badges `rounded-md`, buttons `rounded-lg`, meters
   `rounded-sm`. A `px-1` counter bubble stays round.
4. No emoji, no decorative icons. Stroke icons (16/20/24) from `components/icons.tsx`.
5. No coat of arms, no flag. Independent, not official.
6. No screen white. On ink and on a saturated fill the text is `canvas`, never
   `white` — the `Button` primitive already decided this.
7. No mute controls: a `hover:` whose value repeats what the element already
   has changes nothing, and a ring colour with no ring width never paints.
8. Motion only through its tokens (docs/IDENTIDAD.md §Movimiento): `ease-firma`
   /`sello`/`salida`/`estampa`, `--dur-toque…--dur-trazo`; nothing animates on
   load, numbers never count up, exits faster than entries, reduced motion
   keeps the meaning. The gate rejects hand-written curves and >300 ms.
9. Every static page is in `lib/menu.ts` with its `tarea`, or in
   `FUERA_DEL_INDICE` (`lib/indice.ts`) with a reason — gate-checked.

## Use the primitives, not hand-rolled markup
Two layers (docs/IDENTIDAD.md §8). **Never hand-roll a surface, a button, a
badge, a field or a layer that opens** — there is a primitive for each.

`components/ui/*` is **shadcn/ui, restyled with our tokens**: Card (no shadow,
`rounded-lg`), Button (`asChild` for links), Badge (`forma="sello"` versalitas /
`forma="etiqueta"` for a state said in words), Input, Textarea, Label, Select
(its `ayuda` prop carries the plain-Spanish line a native `<option>` cannot),
Checkbox, Tabs, ToggleGroup, Drawer (vaul), Dialog, Command (cmdk), Breadcrumb,
Popover, Collapsible, Table, Progress (server-side, no Radix), Skeleton, Alert. Only the ones in use live there —
copy the next one from ui.shadcn.com and dress it in our tokens. Icons come
from `components/icons.tsx`, never `lucide-react`; colours come from the token
bridge in `app/globals.css`, never from shadcn's.

On top, the pieces that carry a rule of this house: `components/papel.tsx`
(`Rotulo` — its dot is the seal; `Cifra` — a number **with its anchor**;
`TiraDeCifras`), `components/portada.tsx` (the ink band with the question),
`components/estado-vacio.tsx` («nothing found» vs `variante="caida"`, which
forces you to say what happened, what still stands and the one useful action),
`components/marca-estado.tsx` (the state mark, over `lib/estados.ts`),
`components/campo-busqueda.tsx` (search with its **scope stated below it**),
`components/nav-filtros.tsx` (filters that are links), `components/marca.tsx`
(Sello, SelloCompacto, Logotipo), `components/plegable.tsx` (progressive
disclosure; the button says how many, never "ver más"),
`components/antiguedad.tsx` (a date in a **listing row** is «hace 2 meses» in a
real `<time>`, with the exact date in `title`; the absolute date belongs on the
ficha), `components/paleta.tsx` (⌘K «¿a dónde vas?»: the whole `lib/indice.ts` grouped by task,
and typed text offered to each `BUSQUEDAS` destination **with its scope** —
never a fake global search), `components/ruta.tsx` (a ficha's way back; a new
ficha uses it, never a hand-rolled «Volver» link), `components/paginador.tsx`
(the one pager, links or state), `lib/estados.ts` (the ONE colour table for state, keyed by meaning —
`accionable`/`contexto`/`cumplido`/`aviso`/`anulado`; a source translates into
it and never keeps its own table: that is exactly how congreso ended up
painting «depositada» in the green that means «already fulfilled»),
`lib/cifras.ts`
(a number with its anchor and scope; never invent a comparison, no `+∞ %`,
percentage deltas in points), `lib/glosario.ts` + `components/termino.tsx`
(jargon translated at the point of use: `<Termino clave="…">` opens the plain
definition on tap), `components/esqueleto.tsx` (the silhouette a page shows while
a source answers: every `loading.tsx` and `Suspense` fallback composes it,
same heights and grids as the content so nothing jumps), `components/graficos/*`
(every chart — docs/IDENTIDAD.md §Gráficos: `BarrasHorizontales`/`FilaBarra`/
`MarcaBarra` for a ranking, `SerieTemporal` columns for a flow and line for a
stock or rate, one axis only, `BarraApilada`, `MatrizMensual`, `Multiples`,
`Leyenda`, `VerComoTabla`; colours only from the validated `--color-grafico-*`
palettes, state from `lib/estados.ts`; every datum takes `href`; `Progress` is a
meter against 100 %, never a ranking). If a primitive is
missing, add it to the layer it belongs to; do not reimplement
the idea in one page. Legal moves are three: use the primitive, add the
token, or extract the sibling. Adding an exception or relaxing a matcher
registers the finding instead of fixing it.

## Color and type
- `canvas` paper background, never white. `ink`/`ink-soft` text. `brand-*`
  (ballpoint blue) is the working color: links, buttons, active states.
  `sello-*` (stamp red) is scarce: the dot of «¿», the «.do», the compras
  vertical, «Deroga». `alerta-*` ochre for deadlines, `valido-*` green for
  what is fulfilled, `--color-v-*` only for orientation, never content.
- Geist (`font-display`, 600, tracking set in base CSS) asks: h1/h2. Public
  Sans explains: body/UI. IBM Plex Mono registers: amounts, codes, dates,
  `.rotulo`. A 14 px panel title is Public Sans bold, not `font-display`.
  Instrument Serif (`font-marca`) is the wordmark only.
- The dot is always seal red (`.punto-sello`). No exception.

## Voice and cognitive ergonomics (docs/IDENTIDAD.md §Ergonomía)
- Headlines are questions; data answers; the reader concludes.
- Cite the source and date next to every figure, or do not show the figure.
  What the source denies is declared denied. Snapshots and samples say so
  next to the number, not in a footnote.
- Plain es-DO first, the technical term after («se archiva si no avanza» → *perime*).
- Whole document alongside every explanation. The order of blocks is the
  order of understanding: what it is → where it stands → what it changes →
  the text → vote. Aggregates are never shown before the reader answers.
- Defaults are visible as chips; disabled controls explain why before the tap;
  "no results" and "the source did not answer" are two different screens.
- Mobile first (docs/IDENTIDAD.md §8, all of it inherited from the primitives):
  44 px is the touch target on a phone (40 from `sm`); fields are 16 px or iOS
  zooms on focus; a card or listing row that leads to one place stretches its
  link over the whole sheet with `::after` (anything else inside goes `z-10`);
  nothing depends on hover; essential text never below 12 px, reading text 15;
  a wide table stacks into cards below `sm`; a loading silhouette is measured
  against the real content at 390 px. Floating pieces share the bottom edge
  through `data-barra-acciones`, they do not invent their own offsets.
- All copy in Spanish (es-DO). Dates through `formatFecha` (fixed
  `America/Santo_Domingo`), amounts through `formatMonto`, age through
  `<Antiguedad>` in listing rows and `hace()` elsewhere — both count Dominican
  calendar days.
- Every page is reachable by keyboard without tabbing the chrome: the skip link
  in `app/layout.tsx` targets `#contenido`. A count that changes without a
  navigation lives in an `aria-live="polite"` region.
