# DESIGN.md — how everything we ship must behave

One page, every principle. It governs every surface of Socrático: the public
intelligence verticals, the account and its spaces, `/democracia`. Brought from
RosetSoft's charter (`javiergarcferrer/rosetsoft`, `DESIGN.md`, b82e39e,
2026-09-28) by the owner's decision, and adapted: the store's cart, WhatsApp
and per-company brands become this platform's reader, sources and single skin.
Where a rule is not yet true here it says ⚠️ and what is missing (§11).

**Who we design for.** Every citizen, on every side of the State. Socrático is
a public utility for understanding the State, not a tool against it.
- The citizen who heard a number on the radio and wants to see where it comes
  from.
- The legislator, the official or the officer who needs their own
  institution's figures, and their source, in 30 seconds.
- The supplier checking an award, the student, the analyst, the reporter.

Nobody here is studying the screen. They are *checking* it. Every rule below
exists to make that check cost less time, less attention and fewer mistakes.

**How to read it.** Each rule is a sentence you can obey. Where the house
already measured or pinned a rule, the pointer says where:
- `docs/IDENTIDAD.md` (§): how things look and sound, and why.
- `./.claude/hooks/verificar.sh` (the gate): what a machine holds.

**Precedence.** This page says how things **behave**; `docs/IDENTIDAD.md` says
how they **look**. Where they touch, both hold; where one is silent, the other
rules. Both beat taste, and both beat the third-party guidelines they absorbed
(Vercel's Web Interface Guidelines, applied 2026-09-28).

---

## 1. Accessibility & inclusive design

### 1.1 Universal usability
The interface works for someone who cannot see it well, cannot hear it, cannot
hold a mouse steady, or is tired and distracted. We design for the worst
afternoon, not the best demo.
- Meaning never rides on colour alone: a state has a word or a shape too
  (IDENTIDAD §Color, the `Badge` states).
- Motion is optional: every animation has a `prefers-reduced-motion` answer, and
  nothing essential happens only in motion (IDENTIDAD §Movimiento; the block at
  the end of `app/globals.css`).
- Zoom is never disabled. Text reflows; it is never clipped by an ellipsis that
  hides the word that tells two records apart.
- Every page declares its language (`lang="es-DO"` on `<html>`), so screen
  readers speak Dominican Spanish.

### 1.2 WCAG 2.2 AA is the floor, not the goal
| Rule | Value | Pinned in |
|---|---|---|
| Text contrast | ≥ 4.5:1; icons and hairlines ≥ 3:1 | IDENTIDAD §Color (tokens) |
| Smallest type | 11px (`.rotulo` is the one all-caps exemption) | IDENTIDAD §Tipografía |
| Hit targets | 24×24 with a pointer, 44×44 on a finger | IDENTIDAD §8 (ergonomics), `Button` sizes in `components/ui/button.tsx` |
| Keyboard | every action reachable and operable by keyboard, in visual order | this page |
| Focus | always visible (`:focus-visible` ring); never `outline: none` without a replacement | this page; `estira` in `app/globals.css` |
| Names | an icon-only button has an `aria-label`; a field's caption is a `<label>` bound to it | this page |
| Errors | said next to the field with `ErrorCampo` (`components/ui/error-campo.tsx`), linked (`aria-invalid` + `aria-describedby`), and the first one receives focus on submit | this page |
| Status | a change that happens without a page load (saved, followed, removed) is announced (`aria-live="polite"`) | this page |

A skip link («Saltar al contenido», `app/layout.tsx`) and a
`scroll-padding-top` equal to the sticky chrome keep keyboard focus from
landing under the header.

⚠️ No automated contrast or target-size check yet: the gate holds the identity
prohibitions, not these numbers. They are verified by hand on each change.

### 1.3 Flexibility of use
Give the novice one obvious button and the expert a shortcut. Never make one pay
for the other.
- **Several roads to the same place:** the palette (`/` or ⌘K opens it), the
  megamenu by vertical, `/buscar` across everything, and the entity graph
  (`lib/grafo.ts`) linking an institution to its contracts, payroll, budget and
  norms.
- **Type or tap:** a filter can be typed into the URL or picked from the bar.
- **Accept messy input** (Postel's law): an RNC or cédula with or without
  dashes, an email with a trailing space, a name without accents. We normalise;
  we do not scold.
- **The road out is always open:** a dead end (no results, a source down, a
  blocked portal) says why and offers the next step: another search, the source
  itself, `/fuentes` with what is blocked and why.

---

## 2. Cognitive ergonomics

Working memory holds about four things. Every rule here spends fewer of them.
IDENTIDAD §Ergonomía cognitiva holds the detail; this is the charter.

- **Recognition over recall.** Show the options; don't make people remember
  codes. A code travels with its name (IDENTIDAD §3).
- **One recipe per job.** An amount always looks like an amount, a status like a
  status. Scanning is free only when shapes repeat (IDENTIDAD §9).
- **A closed type ladder.** Three families with three jobs — the question
  (Geist), the explanation (Public Sans), the record (Plex Mono) — and sizes
  that each do one thing (IDENTIDAD §Tipografía).
- **Grouping is spatial first.** Proximity says "these belong together" before
  any border or colour does; the hairline separates, it does not decorate.
- **Numbers are read as a set.** Figures in a column are tabular and aligned
  (`TableCell numerica`, `Cifra`). A number alone means nothing: show the
  comparison, and never invent one (IDENTIDAD §1).
- **Plain words.** No jargon, no internal names, no acronyms the reader didn't
  bring. The State's own names for its things are kept as the State writes
  them, and explained beside them.
- **One word, one meaning,** everywhere (IDENTIDAD §La voz).
- **One voice.** The platform speaks to the reader as «tú», on every screen.
- **Sensible defaults.** When there is only one option, it is already chosen.
- **The system absorbs complexity** (Tesler's law): what the reader gave once —
  their name, their saved records — is never re-asked.

---

## 3. Physical ergonomics

- **Fitts's law.** The primary action is large and sits where the thumb already
  is. On a phone, navigation lives in the bottom tab bar and «Buscar» on the
  right edge of the header. A label is part of its field's target.
- **Mobile first, but not mobile only.**
  - A phone gets rows, not squeezed tables (IDENTIDAD §8).
  - A wide screen shows *more*, not *bigger*.
- **The right keyboard.** Numeric fields open the number pad (`inputMode`).
  Emails and names carry `autocomplete`, so the browser fills them. Inputs are
  16px or larger on a phone, so iOS doesn't zoom the page (`Input`,
  `Textarea`).
- **No tap delay.** Controls carry `touch-action: manipulation`
  (`app/globals.css`).
- **Nothing jumps.** Skeletons mirror the final content; images reserve their
  box. The page opens at the top on a new page and returns to where you were on
  "back".

---

## 4. Behavioural design

### 4.1 Friction, placed on purpose
- **Remove friction where the action is safe and wanted:**
  - one tap to save a record to your space;
  - no account needed to read anything;
  - a draft survives an interruption (the case narration saves as you write).
- **Add friction where a mistake is expensive:**
  - a destructive confirm names the object («Sí, quitar el enlace», never
    «¿Seguro?»);
  - a button that writes cannot fire twice — neither by double tap nor by
    ⌘/Ctrl+Enter (`components/teclas.ts`);
  - publishing a case is its own deliberate step, and a family tie never
    publishes.
- **Prefer undo to confirm.** When an action is reversible, do it and offer
  «Deshacer» for a few seconds (`AvisoDeshacer`, `components/espacios/deshacer.tsx`:
  10 s, paused while focus is inside, announced). Today: removing a saved
  record, a link in a case, a pending invitation (28-09-2026). A confirm is for
  what cannot be fully restored — an entry that takes its links and mentions,
  a comment, a project, a member — and it names its object.
- **Nothing irreversible happens by itself.** Nothing is published, sent or
  deleted without the reader's explicit act.

### 4.2 Progressive disclosure
- Show what this step needs. Detail sits behind a fold, in a sheet, or on the
  entity's own page (IDENTIDAD §5).
- A filter bar shows the common facets first.
- Disclosure never hides a limit: a sample, a truncation or a coverage gap is
  said before the reader draws a conclusion (IDENTIDAD §2).

### 4.3 Habit loops, never manipulation
We build loops that make the reader's work easier, and nothing that works
against their interest.

| Stage | What we build |
|---|---|
| **Trigger** | a useful event: a followed institution awards a contract, a bill moves, a norm is published. Never manufactured urgency. |
| **Action** | the smallest step: open the record, save it to a case. |
| **Reward** | the job done: the fact, its source, its link to the rest. |
| **Investment** | what makes the next time faster: a case with its evidence, followed entities, saved searches. |

**Banned outright:**
- fake scarcity, countdowns or alarm copy;
- pre-ticked consent;
- confirm-shaming;
- making leaving or deleting harder than joining;
- guilt-trip copy;
- variable rewards used to keep someone scrolling.

---

## 5. Interaction & spatial mechanics

- **Jakob's law.** People spend most of their time on other sites. Ours works
  like the ones they know: search at the top, the logo goes home, the account
  top-right, breadcrumbs on an entity. Novelty goes into the brand, never into
  where things are.
- **Fitts's law.** See §3.
- **Hick's law.** Fewer, clearer choices decide faster. One primary action per
  screen; secondary actions look secondary (the `Button` variants).
- **Doherty threshold.** Answer every action within about 400 ms: a pressed
  state (IDENTIDAD §Relieve), a label that changes («Guardando…»), or an
  optimistic update; past that, say what is happening («Cargando la nómina…»).
- **Aesthetic-usability effect.** Polish earns trust, so we keep it high. But
  polish never hides a problem: an attractive screen that says the wrong number
  is worse than an ugly one, because it is believed.
- **State lives in the address.** Filters, sort, page and tab are in the URL
  (`nuqs`): shareable, bookmarkable, and "back" restores them.
- **Links go places, buttons do things.** A navigation is an `<a>`/`<Link>`, an
  action is a `<button type="button">`. Never a clickable `<div>`, never a
  `router.push` on a button that only navigates, never a button inside a link.

---

## 6. Feedback, truth & trust

- **Every action answers,** where the eye is.
- **Say the truth, including "I don't know".** Missing data reads «sin dato»,
  never a plausible number. A list cut at a limit says so. A source that is
  blocked says it is blocked (`/fuentes`).
- **Money is exact.** Amounts come from the source as published and travel in
  words for magnitude (`formatPesos`, `formatMagnitud`; the gate refuses
  MM/M/K).
- **A dependency down degrades, never blanks.** A source that fails shows the
  last snapshot with its date, or says it could not read it — never an empty
  page that looks like «zero».
- **Errors say what to do next.** Not «Error 500»: what failed, and the next
  step.

---

## 7. Semantic indexation — for search engines, assistants and screen readers

A page is read by machines before most people ever see it.

- **Semantic HTML first.**
  - One `<h1>` per page, headings in order (`CardTitle` is an `h2`).
  - Landmarks (`header`, `nav`, `main`, `footer`).
  - Lists are lists, tables are tables, buttons are buttons.
  - ARIA only where HTML has no element for the job.
- **Every page has its own title and description** (`metadata` or
  `generateMetadata`; the template adds «· Socrático»).
- **Crawlable entity pages.** The server renders institutions, suppliers,
  processes, norms and legislators; `app/sitemap.ts` lists them.
  ⚠️ Not yet: no schema.org structured data (`GovernmentOrganization`,
  `Legislation`, `Dataset`).
- **Clean, stable, Spanish URLs** from `lib/grafo.ts`. A URL that has been
  shared keeps working: moved pages redirect, they don't 404.
- **Alternative text is meaning.** A decorative icon is `aria-hidden`; the
  wordmark's name is «Socrático» and carries `translate="no"`.
- **Names are data, not decoration.** An institution's or supplier's name is
  real text in the page, in the State's own words.

---

## 8. Language & typography

- **Formats follow the reader, through the platform's formatters** (`lib/`):
  numbers, dates and money in es-DO (`RD$ 1,250`). Never a hand-built string.
- **Real typography.**
  - The ellipsis is one character: `…` (placeholders end with it).
  - Quotes are `«»`.
  - A non-breaking space keeps `RD$` with its number.
- **No em dash as a crutch** in reader-facing copy: a comma, a full stop or a
  middle dot `·`. Code comments and the State's own
  texts are exempt.
- **Units are always stated.** A quantity says what it counts: plazas,
  procesos, millones de pesos.

---

## 9. Performance is usability

A screen that loads late is a screen that fails on a phone on mobile data.

- Surfaces are read live and cached with `revalidate`; heavy series come from
  snapshots in `public/data/` (docs/ARQUITECTURA.md §rendimiento percibido).
- Fonts load through `next/font` (self-hosted, `display: swap`), never from a
  third-party server at runtime.
- Lists over ~50 rows are virtualised or paged, and a truncation says so.
- We don't hotlink other servers' assets into our pages.

---

## 10. Brand

- One skin, «El Contrasello» (IDENTIDAD): paper, ink, the seal, the signature.
  Independent and unofficial — nothing imitates the State.
- Light only, `color-scheme: light`. ⚠️ No dark mode today.
- **Motion animates only `transform` and `opacity`**, through the tokens
  (`ease-*`, `--dur-*`); properties are listed explicitly, never
  `transition: all`; nothing bounces (the gate holds this).

---

## 11. How this page stays true

- A principle belongs here only if the house follows it today, or if the owner
  has decided we will. What is not yet true says ⚠️ and what is missing.
- A rule with a number points to where that number is held.
- A new rule gets its check the day it is written; a rule nobody checks goes
  stale, and then it lies.
- The owner decides what a reader sees. This page never overrides an owner's
  decision; when he changes his mind, this page changes with it, dated.
