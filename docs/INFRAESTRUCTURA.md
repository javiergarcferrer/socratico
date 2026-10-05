# Socrático.do — infraestructura

Registro de lo que hay en el repositorio `javiergarcferrer/socratico` y en
producción (`https://socratico.vercel.app`) a 2026-10-02. Describe el sistema
tal como está; no evalúa ni planea. Una medida lleva la fecha en que se tomó.
Herramienta independiente y no oficial.

| § | Sección |
|---|---|
| 1 | Producto y despliegue |
| 2 | Repositorio |
| 3 | Rutas |
| 4 | Lectura de fuentes |
| 5 | Fuentes del Estado (5.1 Compras · 5.2 Finanzas · 5.3 Deuda y dinero · 5.4 Indicadores · 5.5 Congreso · 5.6 Normativa y justicia · 5.7 Entidades y personas · 5.8 Nómina · 5.9 Obra pública y país · 5.10 Gestión, control y datos · 5.11 Fuentes que no se leen) |
| 6 | Instantáneas |
| 7 | Grafo |
| 8 | Búsqueda |
| 9 | Servidor MCP |
| 10 | Base de datos: democracia y espacios |
| 11 | Interfaz |
| 12 | Harness |

## 1. Producto y despliegue

### 1.1 Qué es

Socrático.do es una aplicación web (Next.js, App Router) que lee los datos que
publican las instituciones del Estado dominicano y los presenta en español
dominicano (`<html lang="es-DO">` en `app/layout.tsx`, `lang: "es-DO"` en
`app/manifest.ts`). El paquete se llama `socratico-do`, versión `1.0.0`,
`private: true`.

La aplicación se declara **independiente y no oficial** en cuatro sitios:

| Dónde | Texto |
|---|---|
| `metadata.description` (`app/layout.tsx`) | «El Estado dominicano con sus propios datos: compras públicas, presupuesto, deuda, Congreso, decretos, nómina, obras e instituciones, leídos desde sus fuentes oficiales. Herramienta independiente y no oficial.» |
| `metadata.openGraph.description` | «Compras, presupuesto, leyes, nómina, obras e instituciones del Estado dominicano en un solo lugar. Independiente y no oficial.» |
| `description` del manifiesto (`app/manifest.ts`) | «… leídos en vivo desde sus fuentes oficiales. Herramienta independiente y no oficial.» |
| Pie de página (`<footer>` de `app/layout.tsx`) | «Qué compra, qué legisla y a quién paga el Estado dominicano, leído en vivo desde sus fuentes oficiales. Herramienta independiente y no oficial.» |

`lib/secciones.ts` declara siete secciones con vistas propias (Licitaciones,
Finanzas, Congreso, Normativa, Nómina, Dinero, Democracia); el resto de las
superficies (entidades y personas, búsqueda, grafo, MCP, indicadores, obras,
gestión, cuenta) se enumera en §3.

Persistencia: las superficies que muestran datos del Estado leen en vivo o de
instantáneas del repositorio (§4, §6) y no tienen base de datos. La única base
de datos es un proyecto de Supabase con dos esquemas, `democracia` y
`espacios`, que guardan lo que pertenece al lector (§10). En `app/`, `lib/`,
`components/` y `middleware.ts` el código lee tres variables de entorno, las
tres públicas y las tres de esa excepción: `NEXT_PUBLIC_SUPABASE_URL` y
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (`lib/supabase-config.ts`, con valor literal
por defecto) y `NEXT_PUBLIC_CUENTA_UNICA_CLIENT_ID`
(`app/democracia/cuenta-unica/cliente.ts`). Ningún adaptador de fuente lee
`process.env`.

### 1.2 Dominio y despliegue

| Pieza | Valor |
|---|---|
| Dominio de producción | `https://socratico.vercel.app`, escrito como constante `SITIO` en `lib/sitio.ts` (no se lee del entorno). Lo usan `metadataBase` del layout, `app/sitemap.ts`, `app/robots.ts`, `app/.well-known/void/route.ts`, `app/mcp/route.ts`, `app/api/grafo/route.ts` y los módulos del grafo |
| IRIs persistentes | `W3ID = "https://w3id.org/socratico"` (`lib/rdf.ts`). w3id.org no tiene registro para `/socratico`: `https://w3id.org/socratico/` y `https://w3id.org/socratico/def/core` responden 404 (2026-10-02). En el sitio, las redirecciones de `next.config.ts` (§1.4) resuelven `/def/*`, `/fuente/*` y `/derivado/*` |
| Alojamiento | Vercel. No hay `vercel.json`: toda la configuración está en `next.config.ts` |
| Producción | Cada push a `main` (remoto `github.com/javiergarcferrer/socratico`) despliega a producción |
| Vistas previas | Una rama `claude/*` empujada se despliega como vista previa de Vercel. `app/mcp/route.ts` (`origenDe`) trata como despliegue propio `SITIO`, `http://localhost`, `http://127.0.0.1` y todo host `https` que empieza por `socratico` y termina en `.vercel.app` |
| Middleware | `middleware.ts`, `matcher: ["/buscar", "/empresas"]`: responde 307 a la ficha cuando `?q=` es un atajo reconocido (§3) |
| Medición de uso | Vercel Web Analytics: `<Analytics />` de `@vercel/analytics/next` al final del `<body>` de `app/layout.tsx`. Páginas vistas y visitantes con país, sistema, navegador, referente y ruta; sin cookies (el visitante es un hash de la petición que se reinicia cada día) y sin contar bots. Sin clave ni variable de entorno; solo cuenta producción. El panel está en Vercel (proyecto `socratico`, pestaña Analytics) y, para los correos autorizados, al final de `/espacio` (§10.12). Lo que no ve: `/mcp` y `/api/*` los usan asistentes y scripts, no navegadores; su carga es la de Observability (invocaciones por ruta). Activado en el panel de Vercel el 2026-10-02: desde el despliegue de `8f920a1`, `https://socratico.vercel.app/_vercel/insights/script.js` responde 200 y el script descarta los navegadores automatizados (`navigator.webdriver`). Límites (docs de Vercel, 2026-10-02; la API no expone el plan del equipo): Hobby, 50 000 eventos al mes, ventana de un mes, sin eventos personalizados, y al pasarse la recolección se pausa; Pro, 0,03 USD por mil eventos, ventana de doce meses, eventos personalizados |

### 1.3 Stack y versiones

Versiones instaladas según `package-lock.json` (`lockfileVersion` 3). `next`
está fijado sin rango (`"next": "15.5.27"`).

| Paquete | Rango en `package.json` | Instalado | Dónde se usa |
|---|---|---|---|
| `next` | `15.5.27` | 15.5.27 | Framework (App Router) |
| `react`, `react-dom` | `^19.1.0` | 19.2.7 | — |
| `typescript` | `^5.8.3` | 5.9.3 | `tsconfig.json` (§2.3) |
| `tailwindcss`, `@tailwindcss/postcss` | `4.3.3` | 4.3.3 | `postcss.config.mjs` carga solo `@tailwindcss/postcss`; `app/globals.css` empieza por `@import "tailwindcss"`; no hay `tailwind.config.*` |
| `zod` | `^4.6.5` | 4.6.5 | Esquemas de lectura (§4.1); `zod/mini` en `lib/seguimiento.ts` |
| `@tanstack/react-query` (+ `-devtools`) | `^5.104.0` | 5.104.0 | `components/consultas.tsx`, `lib/consultas.ts` (§4.7) |
| `@tanstack/react-table` | `^8.21.3` | 8.21.3 | `components/espacios/evidencia.tsx` |
| `@tanstack/react-virtual` | `^3.14.13` | 3.14.13 | `components/nomina/data-table.tsx` |
| `cheerio`, `domhandler` | `^1.2.0`, `^5.0.3` | 1.2.0, 5.0.3 | `lib/html.ts` |
| `entities` | `^8.1.0` | 8.1.0 | `lib/html.ts`, `lib/xlsx.ts`, `lib/deuda.ts` |
| `fflate`, `fast-xml-parser` | `^0.8.3`, `^5.11.1` | 0.8.3, 5.11.1 | `lib/xlsx.ts` |
| `pdfjs-dist` | `^6.3.289` | 6.3.289 | `components/lector-pdf.tsx` (build `legacy`) |
| `nuqs` | `^2.10.1` | 2.10.1 | Estado de filtros en la URL (`NuqsAdapter` en el layout) |
| `@vercel/analytics` | `^2.0.1` | 2.0.1 | Medición de uso (§1.2): `<Analytics />` en `app/layout.tsx` |
| `@supabase/supabase-js` | `^2.112.4` | 2.112.4 | `lib/supabase.ts`, `lib/espacios-cliente.ts` (§10) |
| `@modelcontextprotocol/server` | `^2.2.0` | 2.2.0 | `app/mcp/route.ts`, `lib/mcp.ts` (§9) |
| `@duckdb/node-api` | `1.5.5-r.5` | 1.5.5-r.5 | `lib/grafo-sql.ts` (por `fork` de `lib/sql-hijo.cjs`), `scripts/build-grafo-tablas.mjs` (§7) |
| `@huggingface/tokenizers` | `^0.2.0` | 0.2.0 | `lib/busqueda.ts` (§8) |
| `@orama/stemmers`, `@orama/stopwords` | `^3.1.18` | 3.1.18 | `lib/raiz.ts` |
| `@radix-ui/react-*` (10 paquetes), `cmdk`, `vaul` | — | `cmdk` 1.1.1, `vaul` 1.1.2 | `components/ui/` (§11) |
| `@xyflow/react` | `^12.12.0` | 12.12.0 | `components/espacios/tablero.tsx` |
| `@tiptap/*` (6 paquetes) | `^3.31.3` | 3.31.3 | `components/espacios/narracion.tsx` |
| `class-variance-authority`, `clsx`, `tailwind-merge` | — | 0.7.1, 2.1.1, 3.7.0 | `lib/cn.ts`, `components/ui/` |
| `n3`, `rdf-validate-shacl`, `@zazuko/env-node` (dev) | `2.7.12`, `0.6.5`, `3.1.0` | idem | `scripts/build-grafo-volcado.mjs`, `scripts/build-grafo-tablas.mjs`, `scripts/validar-grafo.mjs` |
| `@types/node` (dev) | `^22.15.0` | 22.19.21 | — |

`overrides` fija `postcss` 8.5.28 y `sharp` 0.35.5. `package.json` define tres
scripts: `dev` (`next dev`), `build` (`next build`) y `start` (`next start`).

### 1.4 `next.config.ts`

| Opción | Valor |
|---|---|
| `poweredByHeader` | `false` (sin cabecera `x-powered-by`) |
| `serverExternalPackages` | `["@duckdb/node-api", "@duckdb/node-bindings"]`: se cargan de `node_modules` sin pasar por el empaquetado |
| `experimental.staleTimes` | `{ dynamic: 30, static: 300 }`: el router del cliente reutiliza 30 s la carga útil de una ruta dinámica visitada y 300 s la de una estática |
| `headers()` | Una regla: `source: "/:dir(data\|tablas)/:path*"` → `Cache-Control: public, max-age=3600, stale-while-revalidate=86400` |
| `redirects()` | 40 reglas, todas 303 (abajo) |
| `outputFileTracingIncludes` / `outputFileTracingExcludes` | Abajo |

**Redirecciones (todas `statusCode: 303`).** Las que dependen de `Accept`
llevan `has: [{ type: "header", key: "accept", value: <regex> }]`, y cada regex
empieza por `(?!.*text/html)`: un `Accept` que incluye `text/html` no casa.

| `source` | Condición `Accept` | `destination` |
|---|---|---|
| `/funcionarios/:slug`, `/instituciones/:id`, `/banca/:slug`, `/empresas/:rnc`, `/normativa/decreto/:numero`, `/provincias/:slug` | `text/turtle` o `application/x-turtle` → `ttl`; `application/ld+json` → `jsonld`; `application/n-triples` → `nt`; `application/trig` → `trig`; `application/n-quads` → `nq` (30 reglas) | `/api/grafo?nodo=<ficha>&formato=<formato>` |
| `/ontologia` | `ttl`, `jsonld`, `nt` (3 reglas) | `/ontologia.<formato>` |
| `/def/:modulo(core\|do)/:version?` | `ttl`, `jsonld`, `nt` (3 reglas) | `/ontologia.<formato>` |
| `/def/:modulo(core\|do)/:version?` | ninguna | `/ontologia` |
| `/def/formas` | ninguna | `/ontologia.shacl.ttl` |
| `/def/fabric` | ninguna | `/ontologia.fabric.ttl` |
| `/:clase(fuente\|derivado)/:ruta*` | ninguna | `/fuentes` |

**Trazado de archivos.** Next aplica las dos tablas en
`node_modules/next/dist/build/collect-build-traces.js`: cada clave se compara
con la ruta por `picomatch` con `contains: true` (casa como subcadena:
`/grafo` casa también `/grafo/camino` y `/api/grafo`; `/proveedores` casa
`/api/proveedores`); primero suma las inclusiones y después borra las
exclusiones, de modo que una exclusión prevalece sobre una inclusión.

| Clave (inclusión) | Archivos añadidos |
|---|---|
| `/buscar`, `/api/buscar`, `/proveedores` | `public/data/busqueda/**` |
| `/empresas` | `public/data/empresas/**`, `datos/grafo/ld/**` |
| `/funcionarios`, `/normativa` | `public/data/decretos/**`, `public/data/wikidata.json`, `datos/grafo/ld/**` |
| `/instituciones`, `/banca`, `/provincias` | `public/data/wikidata.json`, `datos/grafo/ld/**` |
| `/grafo` | `datos/grafo/meta.json`, `datos/grafo/nodos/**`, `datos/grafo/vecinos/**`, `datos/grafo/nombres.json.br`, `public/data/empresas/**`, `public/data/wikidata.json` |
| `/.well-known` | `datos/grafo/meta.json` |
| `/mcp` | `public/data/procesos.json`, `public/data/rnc/**`, `public/data/busqueda/**`, `public/data/historico/**`, `public/data/empresas/**`, `public/data/wikidata.json`, `datos/grafo/meta.json`, `datos/grafo/nodos/**`, `datos/grafo/vecinos/**`, `datos/grafo/compras.json`, `datos/grafo/nombres.json.br`, `datos/grafo/firmados/**` |
| `/api/sql` | `lib/sql-hijo.cjs`, `public/tablas/*.parquet`, `node_modules/@duckdb/node-bindings-linux-x64/**` |

| Clave (exclusión) | Archivos quitados |
|---|---|
| `*` | `public/data/{congreso,sentencias}.json`, `public/data/busqueda/corpus.json`, `public/data/grafo/grafo.{nt,trig}.gz` |
| `/api/sql` | `node_modules/@duckdb/node-bindings-linux-x64-musl/**` |
| `/grafo`, `/.well-known`, `/empresas`, `/banca`, `/normativa`, `/funcionarios`, `/instituciones`, `/provincias` | `public/data/procesos.json` |
| `/proveedores/*`, `/api/proveedores` | `public/data/busqueda/**` |

### 1.5 Metadatos de la aplicación

| Campo (`app/layout.tsx`, `app/manifest.ts`) | Valor |
|---|---|
| `metadataBase` | `new URL(SITIO)` |
| `title.default` / `title.template` | «Socrático · Preguntarle al Estado con sus propios datos» / `%s · Socrático` |
| `openGraph` | `title: "Socrático"`, `locale: "es_DO"`, `type: "website"`, `siteName: "Socrático"` |
| `appleWebApp` | `capable: true`, `statusBarStyle: "black-translucent"`, `title: "Socrático"` |
| `viewport` | `themeColor: "#0b2d6b"`, `width: "device-width"`, `initialScale: 1`, `viewportFit: "cover"` |
| Manifiesto | `id: "/"`, `short_name: "Socrático"`, `display: "standalone"`, `orientation: "any"`, `background_color: "#f7f3ea"`, `theme_color: "#0b2d6b"`, `categories: ["government", "business", "productivity"]`, accesos directos a las secciones `licitaciones`, `congreso` y `democracia` de `lib/secciones.ts` |

El layout envuelve el cuerpo en `NuqsAdapter` y `ProveedorConsultas`
(`components/consultas.tsx`, §4.7).

### 1.6 Funciones: duración, tamaño y tiempos

**`maxDuration` declarado** (en segundos; el resto de las rutas no lo declara):

| Archivo | `maxDuration` |
|---|---|
| `app/mcp/route.ts` | 60 |
| `app/api/procesos/csv/route.ts` | 60 |
| `app/contratos/csv/route.ts` | 60 |
| `app/normativa/csv/route.ts` | 60 |
| `app/congreso/legisladores/csv/route.ts` | 60 |
| `app/grafo/camino/page.tsx` | 60 |
| `app/api/sql/route.ts` | 30 |

**Tamaño del trazado por función** (suma de los archivos que lista cada
`.next/server/app/**/*.nft.json`, en MB de 10⁶ bytes; medido 2026-10-02 sobre
el `next build` del árbol actual). Vercel admite hasta 250 MB por función.

| Función | MB |
|---|---|
| `/mcp` | 163.0 |
| `/buscar` | 99.7 |
| `/proveedores` | 99.2 |
| `/api/buscar` | 98.5 |
| `/api/sql` | 76.7 |
| `/.well-known/void` | 49.2 |
| `/instituciones/[id]` | 45.9 |
| `/grafo`, `/grafo/camino` | 44.5 |
| `/api/grafo` | 43.8 |
| `/fuentes` | 39.4 |
| `/normativa/[tipo]/[numero]` | 28.2 |
| `/funcionarios/[slug]` | 23.8 |
| `/funcionarios/[slug]/decretos` | 23.1 |
| `/empresas/[rnc]` | 22.1 |
| `/empresas` | 20.9 |
| `/provincias/[slug]` | 15.6 |
| `/proveedores/[rpe]` | 15.1 |
| `/banca/[slug]` | 11.4 |

**Primera llamada en Vercel** (vistas previas recién desplegadas, primera
llamada a cada función, ida y vuelta incluida):

| Fecha | Llamada | Tiempo |
|---|---|---|
| 2026-10-01 | Herramienta MCP `search` | 1.71 s |
| 2026-10-01 | `retrieve` del MCP tras esa búsqueda | 1.33 s |
| 2026-10-01 | `retrieve` del MCP con un nombre de empresa | 1.39 s |
| 2026-10-02 | `/api/grafo` de una institución | 0.74 s |
| 2026-10-02 | Herramienta MCP `fetch` de una institución | 0.93 s |
| 2026-10-02 | Herramienta MCP `path` | 0.30 s |
| 2026-10-02 | `/api/grafo` de una persona, un decreto o una empresa | 0.08–0.14 s |

## 2. Repositorio

### 2.1 Directorios

Conteos de archivos versionados (`git ls-files`), 2026-10-02.

| Directorio | Archivos | Contenido |
|---|---|---|
| `app/` | 162 | Rutas del App Router: 77 `page.tsx`, 29 `route.ts` (17 bajo `app/api/`), 29 `loading.tsx`, `layout.tsx`, `globals.css`, `error.tsx`, `not-found.tsx`, `sitemap.ts`, `robots.ts`, `manifest.ts`, `icon.svg` y componentes propios de cada ruta (§3) |
| `components/` | 138 | 43 en la raíz; `ui/` 22 (shadcn/ui), `espacios/` 27, `fuentes-nuevas/` 23, `graficos/` 13, `congreso/` 4, `dinero/` 3, `nomina/` 2, `democracia/` 1 (§11) |
| `lib/` | 101 | 100 módulos `.ts` y `sql-hijo.cjs` (§2.4) |
| `scripts/` | 56 | Generadores de instantáneas y comprobaciones (§2.5, §6) |
| `public/` | 764 | `public/data/` (instantáneas servidas en `/data/*`) y `public/tablas/` (10 archivos, servidos en `/tablas/*`) (§6, §7) |
| `datos/` | 1,688 | `datos/grafo/`: el grafo compilado (`meta.json`, `compras.json`, `nombres.json.br`, `nodos/` 668, `vecinos/` 668, `ld/` 300, `firmados/` 49) (§7) |
| `supabase/` | 18 | `config.toml`, 8 migraciones, dos Edge Functions (`functions/vincular-cuenta-unica/` y `functions/metricas-uso/`, esta con dos archivos), 4 pruebas, 2 plantillas de correo (§10) |
| `types/` | 1 | `pdfjs.d.ts` |
| `docs/` | 1 | `INFRAESTRUCTURA.md`, este documento |
| `.claude/` | 22 | `settings.json`, 12 hooks, 4 reglas, 3 habilidades, 2 agentes (§12) |

Archivos de la raíz: `package.json`, `package-lock.json`, `next.config.ts`
(§1.4), `middleware.ts` (§1.2), `tsconfig.json`, `postcss.config.mjs`,
`components.json` (configuración de shadcn/ui: estilo `new-york`, `rsc: true`,
CSS en `app/globals.css`, `baseColor: "neutral"`), `next-env.d.ts`,
`.gitignore`, `CLAUDE.md`, `README.md` (remite a este documento). `.gitignore` excluye `node_modules/`,
`.next/`, `out/`, `.env*` (salvo `.env.example`), `*.tsbuildinfo`,
`next-env.d.ts`, `.claude/settings.local.json`, `.claude/worktrees/`,
`__pycache__/` y `.cache/` (descargas de los scripts).

### 2.2 El alias `@/`

`tsconfig.json` declara `"paths": { "@/*": ["./*"] }`: `@/` resuelve a la
**raíz del repositorio**, no a un `src/` (no existe). `@/lib/pedir`,
`@/components/ui/card` y `@/public/data/instituciones.json` son rutas válidas.
`components.json` usa los mismos alias (`@/components`, `@/components/ui`,
`@/lib`, utilidades en `@/lib/cn`). `scripts/cargador-ts.mjs` resuelve `@/` a
la raíz cuando un script de Node importa módulos de `lib/` (§6).

### 2.3 TypeScript

`tsconfig.json`: `strict: true`, `noEmit: true`, `target: "ES2020"`,
`module: "esnext"`, `moduleResolution: "bundler"`, `allowJs`,
`allowImportingTsExtensions`, `resolveJsonModule`, `isolatedModules`,
`jsx: "preserve"`, `incremental`, plugin `next`. Incluye `**/*.ts`, `**/*.tsx`
y los tipos de `.next/`; excluye `node_modules`, `supabase/functions` (Deno) y
`.claude/worktrees`.

### 2.4 Módulos de `lib/` por capa

101 archivos. 33 leen archivos del disco (`fs` o `node:fs`, con rutas desde
`process.cwd()`) y solo corren en el servidor; 5 llevan `"use client"`
(`busquedas.ts`, `espacios-cliente.ts`, `recientes.ts`, `sesion.ts`,
`supabase.ts`); 18 leen la red con `lib/pedir.ts` (§4.2). Ningún módulo usa
el paquete `server-only`.

| Capa | Archivos | Módulos |
|---|---|---|
| Lectura (§4) | 5 | `pedir.ts`, `html.ts`, `xlsx.ts`, `documentos.ts`, `consultas.ts` |
| Adaptadores de fuente (§5) | 52 | Por vertical, en la tabla siguiente |
| Grafo (§7) | 14 | `grafo.ts`, `grafo-servidor.ts`, `grafo-rdf.ts`, `grafo-compilado.ts`, `grafo-constructores.ts`, `grafo-ld.ts`, `grafo-nodo.ts`, `grafo-sql.ts`, `sql-hijo.cjs`, `grafo-tablas.ts`, `rdf.ts`, `ontologia.ts`, `ontologia-esquemas.ts`, `wikidata.ts` |
| Búsqueda (§8) | 5 | `busqueda.ts`, `busqueda-esquema.ts`, `buscar.ts` (atajos de `/buscar` y del middleware), `pantallas.ts`, `raiz.ts` (raíz de una palabra, con `@orama/stemmers` y `@orama/stopwords`) |
| MCP (§9) | 3 | `mcp.ts`, `mcp-herramientas.ts`, `tablas-compras.ts` |
| Democracia y espacios (§10) | 8 | `democracia.ts`, `supabase.ts`, `supabase-config.ts`, `sesion.ts`, `cedula.ts`, `espacios.ts`, `espacios-cliente.ts`, `ftm.ts` (exportación de un caso a FollowTheMoney) |
| Estado del lector en el navegador | 3 | `seguimiento.ts` (lo seguido, en el navegador), `busquedas.ts` (búsquedas guardadas en `localStorage`), `recientes.ts` |
| Formato | 6 | `format.ts` (`SIN_DATO`, `formatMonto`, `formatFecha`, `MESES`, `MESES_CORTOS`, `numeroMes`, `hace`…), `cifras.ts`, `estados.ts` (el color de cada estado, en toda la plataforma), `glosario.ts`, `csv.ts` (`aCsv`, `respuestaCsv`), `cn.ts` |
| Navegación (§11) | 5 | `secciones.ts` (secciones y vistas), `menu.ts` (megamenú y hoja «Más»), `indice.ts` (destinos, derivado de `menu.ts`), `tareas.ts`, `sitio.ts` |

**Adaptadores de fuente, por vertical.** «Red»: lee el origen en tiempo de
ejecución; «Disco»: lee instantáneas de `public/data/`; «—»: no lee nada
(vocabulario, etiquetas o cálculo sobre otro módulo).

| Vertical | Módulos (lectura) |
|---|---|
| Compras públicas (5) | `dgcp.ts` (red), `historico.ts` (disco), `rnc.ts` (disco), `sanciones.ts` (disco), `medidas.ts` (—) |
| Finanzas públicas (3) | `fiscal.ts` (disco), `capitulos.ts` (—), `subsidio.ts` (disco) |
| Deuda (2) | `deuda.ts` (red y disco), `subastas.ts` (disco) |
| Dinero (2) | `banco-central.ts` (red), `tenedores.ts` (disco) |
| Indicadores (10) | `combustibles.ts`, `tasa.ts`, `macro.ts`, `banca.ts`, `aduanas.ts`, `energia.ts`, `alertas.ts`, `siniestralidad.ts`, `cortes.ts` (red); `bcrd.ts` (disco) |
| Congreso (3) | `congreso.ts` (red), `senado.ts` (red, protocolo propio), `legislacion.ts` (—, sobre `congreso.ts`) |
| Normativa y justicia (9) | `normativa.ts` (red y disco), `decretos.ts` (disco), `decretos-base.ts` (—), `materias-decreto.ts` (—), `tc.ts`, `tse.ts`, `audiencias.ts`, `inmobiliario.ts` (red), `justicia.ts` (disco) |
| Nómina (3) | `nomina.ts` (navegador: `fetch("/data/nomina.json")`), `nomina-server.ts` (disco), `nomina-general.ts` (disco) |
| Entidades y personas (7) | `instituciones.ts` (`import` estático de `public/data/instituciones.json`; red por `dgcpFetch`), `funcionarios.ts` (disco), `cargos.ts` (—), `declaraciones.ts` (disco), `empresas.ts` (disco), `padron.ts` (—), `financieras.ts` (disco) |
| Obra pública y país (4) | `obras.ts`, `sociedad.ts`, `mapa.ts` (disco); `provincias.ts` (red por `lib/dgcp.ts`) |
| Gestión, control y datos (4) | `sismap.ts`, `auditorias.ts`, `biblioteca.ts`, `catalogo.ts` (disco) |

### 2.5 `scripts/`

56 archivos versionados:

| Archivos | Qué hacen |
|---|---|
| 38 `build-*` (34 `.py`, 4 `.mjs`: `build-grafo.mjs`, `build-grafo-volcado.mjs`, `build-grafo-tablas.mjs`, `build-indice-busqueda.mjs`) | Escriben las instantáneas de `public/data/`, `public/tablas/` y `datos/grafo/` (§6, §7) |
| `busqueda_*.py` (6), `consultoria_decretos.py`, `privacidad.py` | Módulos que importan los `build-*.py`: entradas del corpus de búsqueda; la lectura del registro de decretos (compartida por `build-decretos.py` y `build-funcionarios.py`); el reemplazo de cédulas por «[omitida]» |
| `cargador-ts.mjs` | Carga módulos `.ts` de `lib/` desde Node (quita tipos con `module.stripTypeScriptTypes`, resuelve `@/`, sustituye `next/cache`) |
| `eval-mcp.mjs`, `validar-grafo.mjs`, `probar-pantallas.mjs` (+ `bateria-pantallas.json`), `menciones-sin-enlace.mjs` | Comprobaciones: evaluación del MCP (§9), SHACL del grafo (§7), batería de pantallas del buscador (§8), menciones sin enlace en fichas |
| `aplicar-auth-supabase.sh` | Aplica al proyecto de Supabase la URL del sitio, las redirecciones y las plantillas de `supabase/templates/` (§10) |
| `certificados/sectigo-ov-r36.pem` | Certificado intermedio que `build-funcionarios.py` carga en su contexto TLS (`contexto_pj`) para el servidor del Poder Judicial |
| `fuentes-nomina/CESAC.csv` (+ `.gitignore`) | La única fuente de nómina versionada; el resto de los CSV descargados se ignora |

### 2.6 Convenciones verificables

- **Commits en español**, sujeto que empieza por un verbo en infinitivo
  («Aligerar la función del servidor MCP…», «Subir Next a 15.5.27…»); cuerpo
  en prosa.
- **Sin suite de pruebas ni ESLint**: `package.json` no tiene script `test` ni
  `lint`, no hay dependencia de ESLint, Jest, Vitest ni Playwright, y no hay
  archivo de configuración de ninguno de ellos.
- **`next build` es la compilación con typecheck**: `next.config.ts` no define
  `typescript.ignoreBuildErrors`. `npx tsc --noEmit` hace solo el typecheck. El
  gate `./.claude/hooks/verificar.sh --completo` corre `npm run build` con un
  tope de 600 s, entre otros pasos (§12).
- **Next 15 fijado**: `"next": "15.5.27"` sin rango en `package.json` y la
  misma versión en `package-lock.json`; la instalación de referencia es
  `npm ci` (`verificar.sh` pide `npm ci` cuando no existe `node_modules`).
- **Versiones exactas** además de `next`: `tailwindcss`, `@tailwindcss/postcss`,
  `@duckdb/node-api`, `n3`, `@types/n3`, `rdf-validate-shacl`,
  `@zazuko/env-node`; `overrides` para `postcss` y `sharp`.
- **Idioma del código**: identificadores y comentarios mezclan español
  (`pedirJson`, `leerHoja`, `delDiaBcrd`) e inglés (`dgcpFetch`,
  `getIniciativa`, `listIniciativas`; el comentario de cabecera de
  `lib/busquedas.ts`).
- **Interfaz** compuesta con `components/ui/` (shadcn/ui sobre Radix) y
  utilidades de Tailwind 4 definidas en `app/globals.css` (§11).

## 3. Rutas

### 3.1 El árbol de `app/`

`app/` contiene 77 `page.tsx`, 29 `route.ts` (17 bajo `app/api/`), 29 `loading.tsx`, 3 `not-found.tsx`, 1 `error.tsx`, 2 `layout.tsx`, `sitemap.ts`, `robots.ts`, `manifest.ts`, `icon.svg` y `globals.css`. `middleware.ts` vive en la raíz del repositorio (§3.7). El tipo de render de cada ruta (○ estática, ● prerenderizada con `generateStaticParams`, ƒ en cada petición) se toma de `.next/prerender-manifest.json` del `next build` sobre `0ca6472` (2026-10-02).

| Archivo | Alcance | Qué hace |
|---|---|---|
| `app/layout.tsx` | todas las páginas | `<html lang="es-DO">`, las cuatro familias de `next/font/google`, `metadataBase` = `SITIO` (`lib/sitio.ts`), título `%s · Socrático`, `viewport.themeColor` `#0b2d6b`; envuelve el contenido en `NuqsAdapter` y `components/consultas.tsx` (TanStack Query) y monta `Megamenu`, `Paleta`, `PuertaCuenta`, `SincronizarCuenta`, `SectionBar`, `MobileTabBar`, `ScrollTop`, `Rastro` e `InstallPrompt` (§11) |
| `app/seguimiento/layout.tsx` | `/seguimiento` | solo `metadata` (título y `robots` sin índice): la página es un componente de cliente y no puede exportarla |
| `app/loading.tsx` | toda ruta sin `loading.tsx` propio | `EsqueletoPagina` y un `<h1 class="sr-only">Cargando la página…</h1>` |
| `app/error.tsx` | toda ruta | componente de cliente: «La fuente no respondió», botón «Reintentar» (`reset`) y enlace a `/fuentes` |
| `app/not-found.tsx` | toda ruta | 404 en español con `robots` sin índice: formulario GET a `/buscar` y los destacados de `MENU` (`lib/menu.ts`) |
| `app/empresas/[rnc]/not-found.tsx` | `/empresas/[rnc]` | «¿Y esta empresa?»: el número no es de ninguna persona jurídica del padrón; vuelve a `/empresas` |
| `app/procesos/[codigo]/not-found.tsx` | `/procesos/[codigo]` | «¿Y este proceso?»: la API de la DGCP no devolvió el código; vuelve a `/licitaciones` |

Un `loading.tsx` cubre su segmento y los hijos que no tienen uno propio (`/congreso/guia` hereda el de `/congreso`; `/funcionarios/[slug]/decretos`, el de `/funcionarios/[slug]`). Los esqueletos son de `components/esqueleto.tsx`:

| Esqueleto | Rutas con `loading.tsx` propio |
|---|---|
| `EsqueletoListado` | `/congreso`, `/congreso/senado`, `/congreso/legisladores`, `/normativa`, `/funcionarios`, `/empresas` |
| `EsqueletoFicha` | `/congreso/[id]`, `/congreso/senado/[cuatrienio]/[id]`, `/congreso/legisladores/[id]`, `/congreso/votaciones/[id]`, `/normativa/[tipo]/[numero]`, `/funcionarios/[slug]`, `/empresas/[rnc]`, `/banca/[slug]`, `/proveedores/[rpe]`, `/grafo` |
| `Esqueleto` + `EsqueletoFilas` | `/auditorias`, `/banca`, `/congreso/perencion`, `/constitucional`, `/tse`, `/luz`, `/pais`, `/proveedores/inhabilitados` |
| `EsqueletoFilas` + `EsqueletoLineas` | `/grafo/camino` |
| `Esqueleto` (composición propia) | `/audiencias`, `/procesos/[codigo]`, `/proveedores` |

Archivos de `app/` que no son rutas:

| Archivo | Lo usa | Qué es |
|---|---|---|
| `app/buscador.tsx` | `/licitaciones` | buscador de procesos (cliente) |
| `app/congreso/buscador-congreso.tsx`, `selector-tema.tsx`, `filtros.ts`, `lista-plegada.tsx` | `/congreso` y sus fichas | campo de búsqueda y selector de tema (cliente), `hrefCongreso`/`TIPO_INICIAL`, lista plegable |
| `app/congreso/legisladores/filtros-legisladores.tsx`, `href.ts` | `/congreso/legisladores` | buscador y selectores (cliente), `hrefDirectorio` |
| `app/finanzas/descargar-csv.tsx` | `/finanzas` | CSV de la tabla filtrada, armado en el navegador |
| `app/funcionarios/buscador.tsx`, `href.ts` | `/funcionarios` | buscador (cliente), `hrefFuncionarios` |
| `app/proveedores/buscador.tsx` | `/proveedores` | buscador (cliente) |
| `app/procesos/[codigo]/precios.tsx` | `/procesos/[codigo]` | precios históricos de la subclase (cliente, lee `/api/precios`) |
| `app/api/procesos/filtros.ts` | `/api/procesos`, `/api/procesos/csv` | `filtrosDeQuery` (§3.4) |
| `app/democracia/registro/registro.tsx` | `/democracia/registro` | formulario de registro (cliente) |
| `app/democracia/cuenta-unica/callback/callback.tsx`, `cliente.ts` | vuelta y canje de Cuenta Única | cliente del flujo OAuth; `CUENTA_UNICA`, `RUTA_CALLBACK` (§10) |
| `app/globals.css`, `app/icon.svg` | todas | tokens y utilidades (§11); el sello, servido en `/icon.svg` |

### 3.2 Páginas por vertical

`lib/secciones.ts` declara siete verticales; `seccionDe(pathname)` devuelve la primera cuyo prefijo casa con la ruta, y la barra de sección enciende la vista más específica (`vistaActivaDe`). Una ruta bajo `sinVista` pertenece a la vertical sin encender ninguna vista.

| `id` | Nombre | Prefijos (`rutas`) | Vistas de la barra |
|---|---|---|---|
| `licitaciones` | Licitaciones | `/licitaciones`, `/procesos`, `/proveedores`, `/estadisticas`, `/contratos`, `/planes`, `/historico`, `/guia` | Buscar · Mercado · Contratado · Proveedores · Planes · Desde 2015 · Guía |
| `finanzas` | Finanzas | `/finanzas`, `/deuda` | Ejecución · Deuda · Guías |
| `congreso` | Congreso | `/congreso` | Diputados · Senado · Legisladores · Perención (`exact`) · Guía |
| `normativa` | Normativa | `/normativa`, `/constitucional`, `/tse`, `/audiencias`, `/inmobiliario` | Decretos y leyes · Tribunal Constitucional · Tribunal Electoral · Audiencias · Registro Inmobiliario |
| `nomina` | Nómina | `/nomina` | Por institución (`exact`) · Todo el Estado |
| `dinero` | Dinero | `/dinero`, `/banca` | Panorama (`exact`) · Tasas · Bonos · Banco Central · Bancos · Guía |
| `democracia` | Democracia | `/democracia` | Consenso (`exact`) · Seguridad; `sinVista`: `/democracia/registro`, `/democracia/cuenta-unica` |

Columnas de las tablas de §3.2 y §3.3:

- **Parámetros**: segmento dinámico con su validación y claves de `searchParams` que la página lee. Las páginas de cliente leen la URL con `nuqs`.
- **Lee de**: módulos de `lib/` que dan los datos, con la función cuando aclara. «vía» nombra el componente de servidor que hace la lectura; «navegador» marca lo que corre en el cliente. Se omiten los módulos de formato y enlace que usan casi todas: `format`, `nomina` (solo `formatInt`, `formatDOP`, `formatCompactDOP`), `raiz`, `cn`, `cifras`, `estados`, `grafo` (`enlace`), `provincias` (solo `provinciaDeTexto`) e `instituciones` cuando solo aporta `hrefInstitucion`/`institucionPorId`.
- **Render**: tipo de render · `export const revalidate` en segundos. «→ N» es el valor que registra el build cuando un `fetch` del render pide una ventana menor (`lib/deuda.ts` pide con 21600, `lib/alertas.ts` con 900, los listados de `lib/congreso.ts` con 300). En una ruta ƒ el `revalidate` no prerenderiza la página. `force-dynamic` se indica cuando la página lo declara.

#### Licitaciones

| Ruta | Qué muestra | Parámetros | Lee de | Render |
|---|---|---|---|---|
| `/licitaciones` | Buscador de procesos de la DGCP; `app/buscador.tsx` (cliente) dentro de `Suspense`, con la silueta del buscador en el HTML | `q`, `etapa`, `estado` (literal de la DGCP, se traduce a su etapa), `modalidad`, `desde`, `hasta`, `mipyme`, `orden`, `uc`, `page` (`components/licitaciones-url.ts`) | navegador: `/api/procesos`, `/api/procesos/csv`, `/api/unidades`, `/api/feed` | ○ |
| `/procesos/[codigo]` | Ficha de un proceso: datos, documentos en el visor, competencia, precios de la subclase, obra ligada, seguimiento, conversación | código del proceso | `dgcp` (`getProceso`, `getCompetencia`), `obras` (`obrasDeProceso`) | ƒ |
| `/proveedores` | Quién le vende al Estado: búsqueda exacta por RPE, RNC o cédula en el registro, o por nombre; los que más se adjudican, los que más contratos ganan, la ficha del registro de los 10 mayores | `q` | `dgcp` (`buscarProveedores`, `muestrearProveedores`, `contarProveedoresRegistrados`, `registrosDeProveedores`), `busqueda` (`buscarEnTodo`, tipo `proveedor`) | ƒ · 1800 |
| `/proveedores/[rpe]` | Ficha de proveedor: contratos, ficha del RPE, registro tributario, medidas de la DGCP, OFAC y Banco Mundial, compras desde 2015 | RPE `^\d{1,10}$`; 404 si no hay historial, registro ni medidas | `dgcp` (`getHistorialProveedor`, `getProveedorRegistro`), `rnc` (`getRegistroTributario`), `sanciones`, `historico` (vía `historia-compras.tsx`) | ƒ |
| `/proveedores/inhabilitados` | Medidas de la DGCP sobre proveedores (tipo, fecha, resolución, motivo), entidades ligadas al país en la lista de la OFAC y en la del Banco Mundial | `q`, `grupo`, `tipo`, `anio`, `p` | `sanciones` (`getSanciones`) | ƒ · 86400 |
| `/estadisticas` | Procesos de los últimos 30 días agregados | — | `dgcp` (`dgcpFetch`) | ○ · 1800 |
| `/contratos` | Los contratos más recientes del registro de la DGCP: montos, adjudicatarios, instituciones; descarga en `/contratos/csv` | — | `dgcp` (`muestrearContratos`) | ○ · 1800 |
| `/planes` | Plan Anual de Compras y Contrataciones (PACC) del año, por institución | — | `dgcp` (`listPacc`) | ○ · 3600 |
| `/historico` | Lo contratado desde 2015, año por año, con sus mayores proveedores e instituciones | — | `historico` (`getResumenHistorico`) | ○ · 86400 |
| `/guia` | Guía para registrarse como proveedor y ofertar | — | — | ○ |

#### Finanzas

| Ruta | Qué muestra | Parámetros | Lee de | Render |
|---|---|---|---|---|
| `/finanzas` | Ejecución del presupuesto por institución (vigente, comprometido, devengado, pagado), clasificaciones, subsidio eléctrico; CSV de la tabla filtrada | `q`, `seccion`, `orden` (`devengado`, `ejecucion`, `cambio`, `pendiente`) | `fiscal` (`getFiscal`), `capitulos` (`SECCIONES_INSTITUCIONALES`), `deuda` (`getDeuda`), `instituciones` (`institucionesDelCapitulo`), `subsidio` (vía `subsidio-electrico.tsx`) | ƒ |
| `/finanzas/[capitulo]` | Ejecución de un capítulo presupuestario, sus unidades de compra con enlace a su ficha, sus obras | código de capítulo; `generateStaticParams` desde `getFiscal()` | `fiscal` (`getInstitucionFiscal`), `instituciones` (`institucionesDelCapitulo`, `fichaDelCapitulo`), `obras` (`getObras`) | ● (102 rutas, sin `revalidate`) |
| `/finanzas/guia` | Presupuesto inicial, vigente, comprometido, devengado y pagado, capítulo y deuda administrativa, en llano | — | — | ○ |
| `/finanzas/guia/deuda` | Qué mide la deuda del Sector Público No Financiero | — | — | ○ |
| `/deuda` | Deuda del SPNF: cierre anual desde 2000 con su peso en el PIB, cierres trimestrales desde 2015, subastas de bonos | — | `deuda` (`getSerieDeuda`), `subastas` (vía `subastas-deuda.tsx`) | ○ · 86400 → 21600 |

#### Congreso

| Ruta | Qué muestra | Parámetros | Lee de | Render |
|---|---|---|---|---|
| `/congreso` | Iniciativas de la Cámara de Diputados en el SIL, por texto, tema y tipo | `q`, `tema`, `tipo`, `estado=perimidas`, `page`, `grupo` (tema por su nombre) | `congreso` (`listIniciativasFiltradas`, `buscarIniciativasTolerante`, `getGrupos`) | ƒ · 300 |
| `/congreso/[id]` | Ficha de una iniciativa: estado, trámites, proponentes, documentos, votaciones del pleno, cruces con el Senado y con la norma, instituciones nombradas, voto ciudadano agregado, conversación; RSS en `/api/feed/congreso/[id]` | id numérico | `congreso` (`getIniciativa`, `getHistoricos`, `getProponentes`, `getDocumentos`, `getVotacionesDeIniciativa`), `democracia` (`getAgregado`), `senado`, `legislacion` y `normativa` (vía `components/congreso/cruces.tsx` y `dossier.tsx`) | ƒ · 300 |
| `/congreso/senado` | Expedientes del Senado de un cuatrienio | `q`, `c` (cuatrienio) | `senado` (`listarRecientesSenado`, `buscarExpedientesSenado`) | ƒ · 300 |
| `/congreso/senado/[cuatrienio]/[id]` | Ficha de un expediente del Senado: trámites, documento principal en el visor, demás documentos por `/api/senado/documento`, cruces, voto ciudadano, conversación | cuatrienio (`2024-2028` … `2002-2006`), id; 404 sin ficha | `senado` (`getFichaSenado`, `getDocumentosSenado`, `getArchivoSenado`), `democracia` (`getAgregado`), `instituciones` (`institucionesNombradasEn`) | ƒ · 3600 |
| `/congreso/legisladores` | Directorio de diputados y senadores del período 2024-2028; CSV en `/congreso/legisladores/csv` | `q`, `provincia`, `partido`, `camara`, `page` | `congreso` (`getDirectorioLegisladores`) | ƒ · 3600 |
| `/congreso/legisladores/[id]` | Ficha de un legislador: lo que propuso, cuánto prosperó, cómo votó, obras de su provincia, sus otros cargos públicos | id entero > 0; `ver` | `congreso` (`getLegislador`, `getPropuestasDeLegislador`, `getVotosDeLegislador`), `obras` (`getObras`), `funcionarios` (`personaDeLegislador`) | ƒ · 3600 |
| `/congreso/votaciones/[id]` | Una votación del pleno con el voto nominal, por partido y por nombre; CSV en `/congreso/votaciones/[id]/csv` | id entero > 0 | `congreso` (`getVotacion`) | ƒ (`force-dynamic`) |
| `/congreso/perencion` | Iniciativas por perimir antes del cierre de la legislatura | — | `congreso` (`muestrearIniciativas`, `evaluarPerencion`) | ○ · 900 → 300 |
| `/congreso/guia` | Cómo nace una ley según la Constitución de 2015 | — | — | ○ |

#### Normativa

| Ruta | Qué muestra | Parámetros | Lee de | Render |
|---|---|---|---|---|
| `/normativa` | Leyes, decretos, reglamentos, resoluciones y Gaceta Oficial de la Consultoría Jurídica, por año; designaciones del mes y materia de cada decreto; CSV en `/normativa/csv` | `tipo`, `anio`, `q`, `mes`, `materia`, `pagina` | `normativa` (`listaNormativa`, `designacionesPorMes`, `materiasDe`) | ƒ · 3600 |
| `/normativa/[tipo]/[numero]` | Ficha de una norma con su PDF; en un decreto, su firmante y las personas que nombra; proyectos del Congreso que la citan. Sin texto legible, una página «fuera de alcance» sin índice | `tipo` ∈ `ley`, `decreto`, `reglamento`, `resolucion`; `numero` `^\d{1,4}-\d{2,4}$` | `normativa` (`resolverNorma`), `decretos` (`decretoPorNumero`), `funcionarios` (`personaPorFirma`, `personasDelDecreto`), `instituciones` (`INSTITUCIONES`), `congreso`, `legislacion` y `senado` (vía `cruces.tsx`), `grafo-ld` (vía `en-el-grafo.tsx`) | ƒ · 86400 |
| `/constitucional` | Sentencias del Tribunal Constitucional por año, desde 2012 | `anio`, `q`, `pagina` | `tc` (`listarSentencias`) | ƒ · 21600 |
| `/tse` | Sentencias del Tribunal Superior Electoral por año, desde 2021 | `anio`, `q`, `pagina` | `tse` (`listarSentenciasTSE`) | ƒ · 21600 |
| `/audiencias` | Audiencias de un caso por su número único (NUC), sin nombres de las partes; sin `q`, qué es el número y dónde se encuentra | `q` (NUC, `validarNuc`) | `audiencias` (`rolDeCaso`) | ƒ |
| `/inmobiliario` | Estado de un expediente del Registro Inmobiliario por su número exacto | `q` (`validarExpediente`) | `inmobiliario` (`consultarExpediente`) | ƒ |

#### Nómina

| Ruta | Qué muestra | Parámetros | Lee de | Render |
|---|---|---|---|---|
| `/nomina` | Explorador de plazas y sueldos (`components/nomina/explorer.tsx`, cliente) y la lista de instituciones cubiertas con la fecha de su foto | `q`, `inst`, `cargo`, `vista` (`resumen`, `tabla`, `comparar`) | `nomina-server` (`getInstitucionesNomina`); navegador: `nomina` (`loadNomina` → `/data/nomina.json`) | ○ · 86400 |
| `/nomina/general` | Nómina general del MAP por institución; con `inst`, los cargos de una institución | `q`, `inst`, `p` | `nomina-general` (`getNominaGeneral`) | ƒ · 86400 |

#### Dinero

| Ruta | Qué muestra | Parámetros | Lee de | Render |
|---|---|---|---|---|
| `/dinero` | Tasa de política monetaria, tasas activas y pasivas del mes, tenedores de bonos, operaciones del Banco Central, indicadores de la banca | — | `banco-central`, `bcrd` (`getBcrd`), `tenedores` (`getTenedores`), `banca` (vía `indicadores-banca.tsx`) | ○ · 3600 |
| `/dinero/tasas` | TPM desde 2013; tasas de la banca múltiple desde 2017 por destino y plazo | — | `banco-central` (`getPoliticaMonetaria`, `getTasasActivas`, `getTasasPasivas`), `bcrd` | ○ · 3600 |
| `/dinero/bonos` | Tenedores de los bonos internos mes a mes desde 2011, acreedores del SPNF, subastas | — | `tenedores`, `banco-central` (`getBalanceBcrd`), `subastas` (vía `subastas-deuda.tsx`) | ○ · 86400 |
| `/dinero/banco-central` | Reservas, billetes en circulación, títulos del Banco Central, operaciones diarias, quién lo dirige | — | `banco-central` (`getBalanceBcrd`, `getOperacionesMonetarias`, `getPoliticaMonetaria`), `funcionarios` (`personasDeInstitucion`) | ○ · 3600 |
| `/dinero/guia` | El Banco Central, las tasas y los bonos, en llano | — | — | ○ |
| `/banca` | Bancos, asociaciones y corporaciones de crédito, AFP, aseguradoras y cooperativas registradas por SB, SIPEN, SIS e IDECOOP | `q`, `sector`, `provincia`, `pagina` | `financieras` (`getFinancieras`), `banca` (vía `indicadores-banca.tsx`) | ƒ · 86400 |
| `/banca/[slug]` | Ficha de una entidad financiera: datos de su supervisor, quién la dirige, su schema.org | slug; 404 si no existe | `financieras` (`entidadPorSlug`), `funcionarios` (`personaPorNombre`), `grafo-ld` (vía `en-el-grafo.tsx`) | ƒ · 86400 |

#### Democracia

| Ruta | Qué muestra | Parámetros | Lee de | Render |
|---|---|---|---|---|
| `/democracia` | Iniciativas ordenadas por voto ciudadano | — | `democracia` (`getRanking`; Supabase, §10) | ○ · 60 |
| `/democracia/seguridad` | Cómo se protegen la cédula y el voto | — | — | ○ · 3600 |
| `/democracia/registro` | Registro de votante por cédula (`registro.tsx`, cliente) | — | navegador: `supabase`, `sesion`, `cedula`, `espacios` | ○ |
| `/democracia/cuenta-unica/callback` | Vuelta del inicio de sesión de Cuenta Única (`callback.tsx`, cliente) | `code`, `state`, `error` (OAuth) | navegador: `supabase`, `app/democracia/cuenta-unica/cliente.ts` | ○ |

Componentes compartidos que leen por su cuenta en varias fichas: `components/espacios/conversacion.tsx` (cliente; `espacios-cliente`) en `/procesos/[codigo]`, `/proveedores/[rpe]`, `/congreso/[id]`, `/congreso/senado/[cuatrienio]/[id]`, `/congreso/legisladores/[id]`, `/normativa/[tipo]/[numero]`, `/instituciones/[id]`, `/obras/[snip]` y `/p/[slug]`; `components/en-el-grafo.tsx` (servidor; `lib/grafo-ld.ts`, el schema.org compilado de `datos/grafo/ld/`, §7) en las seis fichas que son nodo del grafo: `/funcionarios/[slug]`, `/instituciones/[id]`, `/banca/[slug]`, `/empresas/[rnc]`, `/normativa/[tipo]/[numero]` y `/provincias/[slug]`.

### 3.3 Páginas sin vertical

`seccionDe` devuelve `null` para estas rutas: no tienen barra de sección. Se agrupan por la columna de `lib/menu.ts` que las lista, con sus fichas junto al listado. `/` y `/buscar` (el destacado del grupo «El Estado») van aparte; `/cuenta`, `/espacio/proyecto`, `/espacio/moderar` y `/p/[slug]`, que no están en el menú, van con «La plataforma». `/obras` está en la columna «Sueldos y obras» (punto de color de `nomina`) pero fuera de los prefijos de `nomina`.

#### Portada y búsqueda

| Ruta | Qué muestra | Parámetros | Lee de | Render |
|---|---|---|---|---|
| `/` | Portada: misión y caja de búsqueda (GET a `/buscar`); cifras de compras, presupuesto, Congreso y nómina; deuda, dólar, gasolina y remesas; los procesos que cierran esta semana, las iniciativas que se archivan al cerrar la legislatura y lo último que decretó el Ejecutivo; conversaciones de la comunidad; el índice por tema de `MENU` | — | `dgcp` (`dgcpFetch`), `congreso`, `senado` (`getCensoSenado`), `deuda`, `fiscal` (`getResumenFiscal`), `nomina-server` (`getResumenNomina`), `tasa`, `combustibles`, `macro`, `normativa` (`consultarNormativa`); navegador: `espacios` | ƒ · 1800 ¹ |
| `/buscar` | Resultados del índice de toda la plataforma por palabra y por tema, por tipo (§8); atajo a la ficha con `rutaDirecta` | `q`, `tipo`, `pagina` | `busqueda` (`buscarEnTodo`, `buscarPantallas`), `buscar` (`rutaDirecta`), `padron` (`llevaCedula`) | ƒ |

¹ `/` y `/fuentes` declaran `revalidate` y se sirven ƒ: `consultarNormativa` pide a la Consultoría con `cache: "no-store"` (`PEDIDO` en `lib/normativa.ts`), y el build del 2026-10-02 lo registra como `Dynamic server usage`.

#### Quién es quién

| Ruta | Qué muestra | Parámetros | Lee de | Render |
|---|---|---|---|---|
| `/instituciones` | Las 894 entidades del cruce DIGEPRES–DGCP, por sector | `q`, `sector`, `pagina` | `instituciones` (`INSTITUCIONES`, `buscarInstituciones`, `contarPorSector`), `fiscal` (`getFiscal`) | ƒ · 86400 |
| `/instituciones/[id]` | Ficha de institución: presupuesto, compras y PACC en vivo, nómina y nómina general, normativa, obras, SISMAP, compras desde 2015, documentos, auditorías, declaraciones juradas, quién la dirige, entidad financiera; RSS de sus procesos (`/api/feed?uc=`). Sin unidad de compra, `FichaDelClasificador` | `^\d{1,6}` con sufijo opcional (`/instituciones/5`, `/instituciones/5-mopc`) | `instituciones` (`getComprasDeInstitucion`), `fiscal`, `nomina-server`, `nomina-general`, `normativa` (`normasDeInstitucion`), `dgcp` (`listPacc`), `obras`, `sismap`, `historico`, `biblioteca`, `auditorias`, `funcionarios`, `financieras` (`entidadDeInstitucion`), `declaraciones` (vía `declaracion-jurada.tsx`), `grafo-ld` | ƒ (`force-dynamic`) |
| `/funcionarios` | Personas con cargo público: Presidente, gabinete, altas cortes, legisladores, alcaldes, regidores | `q`, `poder`, `pep`, `tipo`, `inst`, `page` | `funcionarios` (`getFuncionarios`, `filtrarPersonas`, `gabinete`, `cabezasDelEstado`) | ƒ · 86400 |
| `/funcionarios/[slug]` | Cargos de una persona con el decreto o la fuente de cada uno, declaraciones juradas, schema.org | slug del nombre normalizado; 404 si no existe | `funcionarios` (`personaPorId`, `parecidos`), `decretos` (`decretoPorNumero`), `declaraciones` (vía `declaracion-jurada.tsx`), `grafo-ld` | ƒ · 86400 |
| `/funcionarios/[slug]/decretos` | Decretos registrados con la firma de una persona, por año, década y materia | 404 si la persona no tiene `firma`; `q`, `materia`, `anio`, `decada`, `p` | `funcionarios` (`personaPorId`), `decretos` (`decretosDeFirmante`, `indiceDecretos`), `materias-decreto` (`MATERIAS`) | ƒ · 86400 |
| `/empresas` | Personas jurídicas del padrón de la DGII, por RNC o por nombre | `q` | `empresas` (`buscarEmpresas`, `padronEmpresas`, `empresaPorRnc`) | ƒ |
| `/empresas/[rnc]` | Ficha de una empresa del padrón, sus medidas de la DGCP y la OFAC, schema.org | RNC `^\d{9}$` | `empresas` (`empresaPorRnc`), `sanciones` (`medidasDeRnc`, `ofacDeRnc`), `grafo-ld` | ƒ · 86400 |
| `/provincias` | Mapa de las 32 demarcaciones y dónde están inscritos los mayores adjudicatarios | — | `provincias` (`proveedoresPorProvincia`), `mapa` (`getMapa`) | ƒ (`force-dynamic`) |
| `/provincias/[slug]` | Una provincia: gobiernos locales, proveedores inscritos, obras, cortes de luz programados, enlace a sus legisladores, schema.org | slug; 404 si no existe | `provincias`, `obras`, `cortes` (`getCortes`), `mapa`, `funcionarios` (vía `gobierno-provincial.tsx`), `grafo-ld` | ƒ (`force-dynamic`) |
| `/grafo` | Explorador del grafo (§7): sin `nodo`, inventario, volcado y enlaces a Wikidata; con `nodo`, los vecinos de una ficha; con `q`, nodos por nombre | `nodo` (ruta de ficha, ≤ 200), `q` | `grafo-rdf` (`inventario`, `vecindario`, `buscarNodos`, `enlacesWikidata`, `volcadoDelGrafo`) | ƒ · 86400 |
| `/grafo/camino` | Camino más corto entre dos fichas del grafo | `de`, `a` (rutas de ficha, ≤ 200) | `grafo-rdf` (`camino`, `vecindario`) | ƒ · 86400; `maxDuration` 60 |
| `/gestion` | Ranking del SISMAP | `tabla` (`instituciones`, `ayuntamientos`, `juntas`), `q` | `sismap` (`getSismap`) | ƒ · 86400 |
| `/auditorias` | Informes de la Contraloría y de la Cámara de Cuentas, Índice de Control Interno, listas de declaraciones juradas | `q`, `fuente`, `pagina` | `auditorias` (`getAuditorias`) | ƒ · 86400 |

#### Obras

| Ruta | Qué muestra | Parámetros | Lee de | Render |
|---|---|---|---|---|
| `/obras` | Proyectos de inversión de MapaInversiones | `q`, `estado`, `provincia`, `uc`, `pagina` | `obras` (`getObras`), `mapa` (`getMapa`) | ƒ · 86400 |
| `/obras/[snip]` | Una obra: estado, valor, avance declarado, contratos y procesos | SNIP `^\d{1,7}$` | `obras` (`getObra`) | ƒ · 86400 |

#### El país y sus datos

| Ruta | Qué muestra | Parámetros | Lee de | Render |
|---|---|---|---|---|
| `/indicadores` | Deuda, combustibles, dólar, macroeconomía, comercio exterior, inflación y turismo, banca, estadísticas judiciales, día eléctrico, alertas del tiempo, muertes en las vías | — | `deuda` (`getDeuda`); vía `components/fuentes-nuevas/*`: `combustibles`, `tasa`, `macro`, `aduanas`, `bcrd`, `banca`, `justicia`, `energia`, `alertas`, `siniestralidad` | ○ · 1800 → 900 |
| `/pais` | Denuncias de robo, armas, matrícula escolar, licencias de construcción, por provincia | — | `sociedad` (`getSociedad`) | ○ · 86400 |
| `/luz` | Mantenimientos programados de Edenorte y Edesur de la semana | `empresa`, `q` | `cortes` (`getCortes`) | ƒ · 21600 |
| `/documentos` | Documentos de las bibliotecas WordPress de las instituciones | `q`, `inst`, `tipo`, `p` | `biblioteca` (`getIndiceBiblioteca`, `buscarDocumentos`) | ƒ · 86400 |
| `/datos` | Catálogo de datos.gob.do | `q`, `grupo`, `org`, `formato`, `p` | `catalogo` (`getCatalogo`) | ƒ · 86400 |

#### La plataforma

| Ruta | Qué muestra | Parámetros | Lee de | Render |
|---|---|---|---|---|
| `/fuentes` | Qué fuentes alimentan la plataforma, cuáles están bloqueadas, con qué límites | — | `congreso`, `dgcp`, `senado`, `deuda`, `normativa`, `fiscal`, `nomina-server`, `instituciones` (`FUENTES_DEL_CRUCE`), `mapa` (`FUENTE_MAPA`); vía `resumen-fuentes.tsx`: `obras`, `combustibles`, `tasa`, `historico`, `biblioteca`, `catalogo`, `financieras`, `sanciones`, `wikidata` | ƒ · 3600 ¹ |
| `/ontologia` | Clases y propiedades de la ontología, su versión y sus serializaciones | — | `ontologia` (`CLASES`, `PROPIEDADES`, `VERSION`), `rdf`, `wikidata` (`hrefWikidata`) | ○ |
| `/conectar` | Cómo conectar un cliente MCP: dirección y herramientas (§9) | — | `mcp-herramientas` (`DIRECCION_MCP`, `HERRAMIENTAS_MCP`) | ○ |
| `/seguridad` | Seguridad, privacidad y cumplimiento | — | — | ○ · 3600 |
| `/seguimiento` | Lo que el visitante sigue (en `localStorage`) y qué cambió desde su última visita (cliente) | — | navegador: `seguimiento`, `consultas`; pide `/api/procesos?proceso=` y `/api/seguimiento` | ○ |
| `/comunidad` | Conversaciones abiertas sobre registros y proyectos publicados | `orden` (`destacado`, `nuevo`, `votado`) | `espacios` (`leerComunidad`; Supabase, §10) | ƒ |
| `/comunidad/normas` | Quién comenta, qué no se permite, cómo se modera | — | — | ○ |
| `/cuenta` | Entrar o crear la cuenta (`components/espacios/entrar.tsx`, cliente) | `volver` | navegador: `espacios`, `espacios-cliente`, `sesion` | ƒ |
| `/espacio` | Espacio del lector (`components/espacios/mi-espacio.tsx`, cliente) | — | navegador: `espacios-cliente`, `seguimiento` | ○ |
| `/espacio/proyecto` | Mesa de un proyecto (`components/espacios/mesa-proyecto.tsx`, cliente) | `id` (`^[0-9a-f-]{36}$`) | navegador: `espacios-cliente`, `espacios`, `sesion`; pide `/api/buscar` | ƒ |
| `/espacio/moderar` | Cola de moderación (`components/espacios/moderar.tsx`, cliente) | — | navegador: `espacios-cliente`, `espacios` | ○ |
| `/p/[slug]` | Proyecto publicado por un lector, servido en el servidor | slug | `espacios` (`leerPublicado`) | ƒ |

`lib/indice.ts` declara fuera del índice, con su motivo, `/democracia/registro`, `/democracia/cuenta-unica/callback`, `/cuenta`, `/espacio/proyecto`, `/espacio/moderar` y `/grafo/camino` (`FUERA_DEL_INDICE`); el resto de las páginas sin segmento dinámico está en `MENU` (§11).

### 3.4 Rutas API (`app/api/`)

Las 17 declaran `export const dynamic = "force-dynamic"` y responden ƒ. Un fallo del origen devuelve 502 con `{ error }` (texto plano en los dos RSS).

| Ruta | Método | Parámetros y validación | Envuelve | Respuesta · `Cache-Control` | La llama |
|---|---|---|---|---|---|
| `/api/buscar` | GET | `q` recortado a 120 (menos de 2 caracteres o `llevaCedula(q)` → lista vacía); `n` 1–20, por defecto 6; `tipo` en `TIPOS_RESULTADO` (si no, 400) | `busqueda` (`buscarEnTodo`, `buscarPantallas`) | `{resultados, pantallas, total, generado}`; sin `tipo`, a lo sumo la mitad de las filas de un mismo tipo · `public, max-age=3600, s-maxage=86400` | `components/paleta.tsx`, `components/espacios/mesa-proyecto.tsx` (`buscarEnPlataforma`, `lib/consultas.ts`) |
| `/api/congreso` | GET | `q` (sin límite), `page` ≥ 1 | `congreso` (`listIniciativas`, `normalizarIniciativa`) | `{page, pageSize, total, results}` · `public, s-maxage=300, stale-while-revalidate=900` | ningún archivo del repositorio |
| `/api/documento` | GET | `url` en la lista de `ORIGENES_DOCUMENTO` (`esUrlDeDocumento`; si no, 400); reenvía `Range` | `documentos` y `fetch` directo (§4) | los bytes del origen, `inline`; 415 si no es PDF, imagen o texto; 413 si pasa de 40 MB sin `Range` · `public, max-age=3600, s-maxage=86400` | `components/visor-documento.tsx`, `components/lector-pdf.tsx` (`urlDeLectura`) |
| `/api/feed` | GET | `q`, `modalidad`, `uc` sin validar formato; `etapa` por `etapaPorClave` (ausente → `abiertos`; vacía o desconocida → todas); `estado` (literal de la DGCP) traducido por `etapaDe`; `mipyme=1` | `dgcp` (`listProcesos`, `startdate` = hoy − 30 días, `limit` 50) | RSS 2.0, `application/rss+xml`, `ttl` 60 · `public, max-age=600, s-maxage=600, stale-while-revalidate=1800` | enlace en `app/buscador.tsx`; `AccionesFicha` de `/instituciones/[id]` (`?uc=`) |
| `/api/feed/congreso/[id]` | GET | `id` `^\d{1,9}$` (si no, 400) | `congreso` (`getIniciativa`, `leerHistoricos`) | RSS 2.0, un elemento por estado del SIL · mismo `Cache-Control` que `/api/feed` | `AccionesFicha` de `/congreso/[id]` |
| `/api/grafo` | GET | `nodo`: ruta de ficha o IRI con el prefijo `SITIO` (≤ 300), debe resolver con `nodoDeRuta` (si no, 400; nodo inexistente, 404); `formato` ∈ `ttl` (por defecto), `jsonld`, `nt`, `trig`, `nq` (si no, 400) | `grafo-rdf` (`describir`, `cuadruplesDe` en `trig` y `nq`), `rdf` (`serializar`) | RDF con el `Content-Type` de `TIPO_MIME`, `Access-Control-Allow-Origin: *`, `Link` `rel="canonical"` y `rel="describedby"` · `public, s-maxage=3600, stale-while-revalidate=86400` | `enlace.rdf` (`lib/grafo.ts`), `components/en-el-grafo.tsx`; destino de la negociación de contenido (§3.7) y `void:uriLookupEndpoint` |
| `/api/ofertas` | GET | `proceso` obligatorio, ≤ 80 | `dgcp` (`getCompetencia`) | oferentes del proceso · `public, s-maxage=300, stale-while-revalidate=600` | ningún archivo del repositorio |
| `/api/planes` | GET | `periodo` `^\d{4}$`, `unidad_compra` `^\d{1,10}$` | `dgcp` (`listPacc`) | `{planes}` · `public, s-maxage=3600, stale-while-revalidate=86400` | ningún archivo del repositorio |
| `/api/precios` | GET | `subclase` `^\d{6,10}$`, obligatoria | `dgcp` (`getPreciosSubclase`) | estadística de precios · `public, s-maxage=3600, stale-while-revalidate=86400` | `app/procesos/[codigo]/precios.tsx` |
| `/api/procesos` | GET | `filtrosDeQuery`: `q` ≤ 200, `proceso` ≤ 80, `etapa` en `ETAPAS` (`abiertos`, `cerrados`, `evaluacion`, `adjudicados`, `sin_efecto`) o `estado` (literal de la DGCP) traducido por `etapaDe`, `orden` en `ORDENES` (`recientes`, `cierre`, `monto_desc`, `monto_asc`), `modalidad` ≤ 80, `unidad_compra` `^\d{1,6}$`, `startdate`/`enddate` `AAAA-MM-DD`, `mipyme` y `mipyme_mujer` solo `true`/`false`; `page`; `limit` ≤ 100 | `dgcp` (`listProcesos`) | página de procesos · `public, s-maxage=300, stale-while-revalidate=600` | `app/buscador.tsx`, `app/seguimiento/page.tsx` (`?proceso=`) |
| `/api/procesos/csv` | GET | `filtrosDeQuery` | `dgcp` (`descargarProcesos`, tope `MAX_FILAS_DESCARGA` = 6000), `csv` | CSV (§3.5) · `maxDuration` 60 | `app/buscador.tsx` |
| `/api/proveedores` | GET | `q` ≤ 120 (si no, 400) | `dgcp` (`buscarProveedores` con `q`; `muestrearProveedores`, primeros 200, sin `q`) | JSON · `public, s-maxage=1800, stale-while-revalidate=3600` | ningún archivo del repositorio |
| `/api/seguimiento` | GET | `tipo=proyecto` con `id` `^\d{1,9}$`; `tipo=expediente-senado` con `id` `^(\d{4}-\d{4})\/(\d{1,9})$` y cuatrienio conocido; otro `tipo` → 400 | `congreso` (`getIniciativa`), `senado` (`getFichaSenado`), `seguimiento` (`huellaDe`) | `{huella, titulo}` · `public, s-maxage=300, stale-while-revalidate=900` (proyecto), `public, s-maxage=900, stale-while-revalidate=3600` (Senado) | `app/seguimiento/page.tsx`, `components/acciones-ficha.tsx` |
| `/api/senado` | GET | `q` recortado a 120; `c` por `cuatrienioPorEtiqueta`, por defecto `CUATRIENIO_VIGENTE` | `senado` (`buscarExpedientesSenado` con `q`, `listarRecientesSenado` sin él) | listado · `public, s-maxage=900, stale-while-revalidate=3600` | ningún archivo del repositorio |
| `/api/senado/documento` | GET | `c` cuatrienio conocido; `e`, `item`, `bd` enteros > 0 (si no, 400) | `senado` (`getArchivoSenado`) | 302 a la dirección del archivo en el origen | enlaces de `/congreso/senado/[cuatrienio]/[id]` |
| `/api/sql` | GET, POST, OPTIONS | `?q=` o cuerpo `{"q": …}`; vacía → 400; `ErrorDeConsulta` → su estado (400, 503) | `grafo-sql` (`consultarSql`), `grafo-tablas` (`TABLAS_GENERADAS`) (§7) | `{columnas, filas, truncada, ms, generadas}`, `Access-Control-Allow-Origin: *` · `public, s-maxage=86400, stale-while-revalidate=86400`; `maxDuration` 30 | herramienta `query` de `lib/mcp.ts` |
| `/api/unidades` | GET | — | `dgcp` (`getUnidadesCompra`), `instituciones` (añade `ficha` a cada unidad del cruce) | catálogo de unidades de compra · `public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400` | `app/buscador.tsx` |

### 3.5 Otros manejadores de ruta

| Ruta | Método | Qué devuelve | Envuelve | Render |
|---|---|---|---|---|
| `/contratos/csv` | GET | los contratos recientes que agrega `/contratos`, con todos los estados | `dgcp` (`contratosRecientes`) | ƒ; `maxDuration` 60 |
| `/normativa/csv` | GET | la lista de `/normativa` sin el recorte de 200 filas; `tipo` en `TIPOS_NORMATIVA` (`1`, `3` por defecto, `4`, `7`, `1014`), `anio` del año en curso o los tres anteriores (si no, 400), `q` ≤ 80, `mes` `AAAA-MM` del año y `materia`, solo para decretos | `normativa` (`listaNormativa`) | ƒ; `maxDuration` 60 |
| `/congreso/legisladores/csv` | GET | el directorio de legisladores del período | `congreso` (`getDirectorioLegisladores`) | ƒ; `maxDuration` 60 |
| `/congreso/votaciones/[id]/csv` | GET | el voto nominal de una votación; `id` `^\d{1,9}$`; 404 si la votación no existe | `congreso` (`getVotacion`) | ƒ |
| `/democracia/cuenta-unica/token` | POST | canje del código de autorización por el `id_token` en `https://auth.cuentaunica.gob.do/oauth2/token`; cuerpo `code`, `code_verifier`, `redirect_uri` (mismo origen y `RUTA_CALLBACK`); 503 `cliente_no_configurado` sin `NEXT_PUBLIC_CUENTA_UNICA_CLIENT_ID` (§10) | `app/democracia/cuenta-unica/cliente.ts` | ƒ |
| `/mcp` | GET, POST, DELETE, OPTIONS | servidor MCP por HTTP sin sesión; un GET que acepta `text/html` recibe 303 a `/conectar`; CORS abierto, `Cache-Control: no-store` (§9) | `mcp` (`servidorMcp`, `conOrigen`) | ƒ; `maxDuration` 60 |
| `/.well-known/void` | GET | VoID del grafo en Turtle: clases y conteos (`inventario`), enlaces a Wikidata (`enlacesWikidata`), volcado (`volcadoDelGrafo`), `void:uriLookupEndpoint` = `/api/grafo?formato=ttl&nodo=` (§7) | `grafo-rdf`, `funcionarios`, `ontologia`, `rdf` | ○ (`force-static`) |
| `/ontologia.ttl` | GET | la ontología en Turtle | `ontologia` (`triplesOntologia`), `rdf` (`aTurtle`) | ○ (`force-static`) |
| `/ontologia.jsonld` | GET | la ontología en JSON-LD | `triplesOntologia`, `aJsonLd` | ○ (`force-static`) |
| `/ontologia.nt` | GET | la ontología en N-Triples | `triplesOntologia`, `aNTriples` | ○ (`force-static`) |
| `/ontologia.shacl.ttl` | GET | las formas SHACL | `triplesFormas`, `aTurtle` | ○ (`force-static`) |
| `/ontologia.fabric.ttl` | GET | el perfil para Microsoft Fabric IQ | `triplesFabric`, `aTurtle` | ○ (`force-static`) |

Las cuatro descargas CSV responden con `respuestaCsv` (`lib/csv.ts`): `text/csv; charset=utf-8`, `Content-Disposition: attachment` con el alcance en el nombre del archivo, cabecera `X-Alcance` (sin tildes) y `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`. Las enlazan `/contratos`, `/normativa`, `/congreso/legisladores` y `/congreso/votaciones/[id]`; la de `/licitaciones` es `/api/procesos/csv`. Los cinco archivos de ontología y el VoID llevan `Access-Control-Allow-Origin: *` y el `Content-Type` de `TIPO_MIME` (`lib/rdf.ts`).

### 3.6 Metadatos de la aplicación e indexación

| Archivo | Se sirve en | Contenido | Render |
|---|---|---|---|
| `app/sitemap.ts` | `/sitemap.xml` | ver abajo | ○ · 86400 |
| `app/robots.ts` | `/robots.txt` | `allow: /`; `disallow: /api/`, `/*/csv`, `/grafo?`, `/grafo/camino`; `sitemap: ${SITIO}/sitemap.xml` | ○ |
| `app/manifest.ts` | `/manifest.webmanifest` | `id` y `start_url` `/`, `lang` `es-DO`, `display: standalone`, `orientation: any`, `background_color` `#f7f3ea`, `theme_color` `#0b2d6b`; accesos directos a Licitaciones, Congreso y Democracia (de `SECCIONES`); icono `/icon.svg` | ○ |
| `app/icon.svg` | `/icon.svg` | el sello | ○ |

Entradas de `/sitemap.xml`, con los conteos de las instantáneas del repositorio a 2026-10-02:

| Entradas | Origen | `changeFrequency` | Número |
|---|---|---|---|
| Destinos del índice y vistas de las verticales, menos `/buscar` y `/seguimiento` | `INDICE` (`lib/indice.ts`), `SECCIONES` | `daily` | 53 |
| Instituciones | `INSTITUCIONES` | `weekly` | 894 |
| Provincias | `PROVINCIAS` | `weekly` | 32 |
| Obras | `getObras()` (`public/data/obras.json`) | `monthly` | 3,609 |
| Normas con ficha | `public/data/normativa.json`, tipos 1, 3, 4 y 7 con número válido | `yearly` | 3,054 |
| Legisladores | `getDirectorioLegisladores()` (SIL, en vivo) | `weekly` | variable |
| Capítulos del presupuesto | `getFiscal()` | `monthly` | 102 |
| Personas con `pepVigente` | `getFuncionarios()` | `monthly` | 2,941 |
| Decretos firmados por persona (`/funcionarios/[slug]/decretos`) | personas con `firma` | `weekly` | 41 |
| Entidades financieras | `getFinancieras()` | `monthly` | 1,300 |

No entran procesos, iniciativas, proveedores ni las fichas de `/empresas/[rnc]`.

Rutas que declaran `robots` sin índice:

| Ruta | Cuándo | `follow` |
|---|---|---|
| `/buscar`, `/seguimiento` (por su layout), `/cuenta` | siempre | `true` |
| `/espacio`, `/espacio/proyecto`, `/espacio/moderar`, `/democracia/registro`, `/democracia/cuenta-unica/callback`, `/p/[slug]`, `/grafo/camino` | siempre | `false` |
| `/grafo` | con `nodo` | `true` |
| `/audiencias`, `/inmobiliario` | con `q` | `false` |
| `/funcionarios/[slug]` | si la persona no tiene `pepVigente` | `true` |
| `/proveedores/[rpe]` | si el proveedor es persona física (`esPersonaFisica`, o la marca `fisica` de sus medidas) | `true` |
| `/empresas/[rnc]` | si el RNC no está en el padrón | `true` |
| `/normativa/[tipo]/[numero]` | si la norma no se pudo leer | `true` |
| 404 (`app/not-found.tsx`) | siempre | `true` |

Las seis fichas que son nodo del grafo declaran en `alternates.types` sus cinco descripciones RDF en `/api/grafo` (`alternasRdf`, `components/en-el-grafo.tsx`); en `/normativa/[tipo]/[numero]`, solo un decreto que está en el registro (`decretoPorNumero`). `/grafo` declara `/.well-known/void` como `text/turtle`; `/grafo?nodo=`, el Turtle y el JSON-LD del nodo.

`public/` se sirve desde la raíz: `/data/*` (instantáneas, §6; el volcado del grafo en `/data/grafo/grafo.nt.gz` y `grafo.trig.gz`, §7) y `/tablas/*` (Parquet y `meta.json`, §7), con la cabecera que fija `headers()` en `next.config.ts` (§1).

### 3.7 Redirecciones

`middleware.ts` corre solo en `/buscar` y `/empresas` (`matcher`). Recorta `q` a 120 caracteres y responde 307:

| Ruta | Condición sobre `q` | Destino |
|---|---|---|
| `/empresas` | nueve cifras tras quitar espacios, puntos, guiones y barras | `/empresas/<rnc>` |
| `/buscar` | nueve cifras (sin espacios ni guiones) | `/empresas/<rnc>` |
| `/buscar` | once cifras | `/proveedores?q=<cifras>` |
| `/buscar` | cita de ley, decreto, reglamento o resolución («Ley 47-20», «decreto núm. 606-26», «ley 47 20») | `/normativa/<tipo>/<número>` |
| `/buscar` | código de proceso de la DGCP (`^[A-Z0-9]{2,15}(-[A-Z0-9]{1,10}){2,4}-\d{4}-\d{3,5}$`) | `/procesos/<CÓDIGO>` |
| `/buscar` | siglas exactas de una sola institución que no son una palabra de su nombre | su ficha en `/instituciones` |

Las reglas de `/buscar` son `rutaDirecta` (`lib/buscar.ts`); la página repite el atajo con `redirect()`. `/empresas` repite el suyo con `redirect()` cuando `pareceRnc(q)` y el RNC está en el padrón.

`redirects()` de `next.config.ts` responde 303 en todas sus reglas:

| Origen | Condición | Destino |
|---|---|---|
| `/funcionarios/:slug`, `/instituciones/:id`, `/banca/:slug`, `/empresas/:rnc`, `/normativa/decreto/:numero`, `/provincias/:slug` | `Accept` sin `text/html` y con `text/turtle` o `application/x-turtle` · `application/ld+json` · `application/n-triples` · `application/trig` · `application/n-quads` | `/api/grafo?nodo=<la ruta>&formato=ttl` · `jsonld` · `nt` · `trig` · `nq` |
| `/ontologia` | `Accept` sin `text/html` y con Turtle · JSON-LD · N-Triples | `/ontologia.ttl` · `.jsonld` · `.nt` |
| `/def/core`, `/def/do`, con `/:version` opcional | la misma condición | `/ontologia.ttl` · `.jsonld` · `.nt` |
| `/def/core`, `/def/do`, con `/:version` opcional | sin ella | `/ontologia` |
| `/def/formas` | — | `/ontologia.shacl.ttl` |
| `/def/fabric` | — | `/ontologia.fabric.ttl` |
| `/fuente/*`, `/derivado/*` (IRIs de los grafos con nombre, §7) | — | `/fuentes` |

`/def/*` en el sitio corresponde a la ruta de los IRIs del vocabulario: `ONTOLOGIA` = `https://w3id.org/socratico/def/core`, `ONTOLOGIA_DO` = `…/def/do`, `ONTOLOGIA_FABRIC` = `…/def/fabric` (`lib/rdf.ts`); w3id.org no redirige esos IRIs al sitio (§1.2).

Otras redirecciones de una ruta:

| Ruta | Código | Hacia |
|---|---|---|
| `/normativa/[tipo]/[numero]` | 308 (`permanentRedirect`) | la forma canónica del número: en `ley` y `decreto`, el año de cuatro cifras pasa a dos (`numeroCanonico`, `lib/grafo.ts`) |
| `/mcp` | 303 | `/conectar`, en un GET que acepta `text/html` |
| `/api/senado/documento` | 302 | el archivo del documento en el consultante del Senado |

## 4. Lectura de fuentes

### 4.1 El contrato: `lib/pedir.ts`

`lib/pedir.ts` implementa una sola política de lectura para las capas de
`lib/` que leen fuentes del Estado.

**El pedido** (`interface Pedido`):

| Campo | Uso | Por defecto |
|---|---|---|
| `fuente` | Etiqueta del registro: `[deuda] <url>: <motivo>` | — |
| `ua` | User-Agent completo de la capa | — |
| `tipo` | `RegExp` que el `content-type` de la respuesta tiene que cumplir | — |
| `revalidate` | Pasa a `fetch` como `next: { revalidate }` | sin él, decide `cache` |
| `cache` | `RequestCache` de `fetch` (`"no-store"` en las capas con `unstable_cache`) | — |
| `espera` | Plazo por intento, con `AbortSignal.timeout` | 25,000 ms |
| `intentos` | Intentos totales | 2 (uno y un reintento) |
| `metodo`, `cuerpo`, `cabeceras` | `GET`/`POST`, cuerpo y cabeceras extra | `GET` |
| `firma` | `"zip"`: los dos primeros bytes tienen que ser «PK» (`80,75`) | — |

**User-Agent.** Cada capa fija el suyo como constante, con la forma
`Socratico-Inteligencia/1.0 (<propósito>; herramienta independiente)`; p. ej.
`Socratico-Inteligencia/1.0 (compras publicas; herramienta independiente)` en
`lib/dgcp.ts` y `Socratico-Inteligencia/1.0 (monitoreo legislativo; herramienta independiente)`
en `lib/congreso.ts` y `lib/senado.ts`. La cabecera `User-Agent` va en toda
petición y las `cabeceras` de la capa se suman a ella. Los scripts de
`scripts/` que leen la red usan la misma forma, cada uno con su propósito
(`consultoria_decretos.py` recibe el `pedir` del script que lo llama).

**Un intento** (`conContrato`):

1. `fetch(url, { method, headers: { "User-Agent": ua, ...cabeceras }, body, next: { revalidate } | cache, signal: AbortSignal.timeout(espera) })`.
2. Si `!res.ok`, cancela el cuerpo y lanza `FalloLectura` con el motivo
   `respondió <estado> [cf-mitigated=<valor>] [server=<valor>]` (función
   `motivo`, que lee las cabeceras `cf-mitigated` y `server`).
3. Si el `content-type` no cumple `tipo`, cancela el cuerpo y lanza
   `content-type inesperado «<valor o "ninguno">»`.
4. Lee el cuerpo (`json()`, `text()` o `arrayBuffer()`), comprueba la firma
   `zip` si se pidió, valida el esquema `zod` si se pasó y aplica la
   comprobación de la capa (`comprobar`) si la hay.

**Qué se reintenta.** `FalloLectura` lleva `definitivo` y `estado`. Un fallo
definitivo corta el bucle; el resto consume el siguiente intento:

| Se reintenta | No se reintenta (`definitivo: true`) |
|---|---|
| Error de red o plazo vencido | 4xx distinto de 408 y 429 (un 403 o un 470 incluidos) |
| 5xx, 408, 429 | `content-type` que no cumple `tipo` |
| Cuerpo ilegible (`json()` que lanza) | Firma «PK» ausente |
| Comprobación de la capa que devuelve un motivo | Esquema `zod` que falla: `el JSON cambió de forma: <ruta> <mensaje>` |

Agotados los intentos, lanza el último `FalloLectura` (o envuelve el último
error en uno).

**Funciones exportadas:**

| Función | Devuelve |
|---|---|
| `pedirJson(url, p & { esquema? })` | JSON validado, o `null` |
| `pedirTexto(url, p)` | Texto (HTML, XML), o `null` |
| `pedirBytes(url, p)` | `ArrayBuffer`, o `null` |
| `pedirJsonOLanzar(url, p & { esquema?, comprobar? })` | JSON validado; lanza `FalloLectura` |
| `pedirTextoOLanzar(url, p & { comprobar? })` | Texto; lanza `FalloLectura` |
| `filas(fila)` | Esquema `zod` de lista que valida cada fila por separado y descarta las que no casan; si la envoltura no es una lista, falla |
| `delDiaBcrd(url)` | La URL con `?d=AAAA-MM-DD` (o `&d=`), la fecha del día en `America/Santo_Domingo` |
| `FalloLectura`, `Comprobacion<T>`, `Pedido` | Tipos |

**Degradar a `null`.** `pedirJson`, `pedirTexto` y `pedirBytes` capturan el
fallo, escriben `console.error("[<fuente>] <url>: <mensaje>")` y devuelven
`null`. Las variantes `…OLanzar` las usan las capas que guardan el resultado
en `unstable_cache` (que no guarda una excepción) o que distinguen tipos de
fallo; esas capas capturan a su vez y devuelven `null` o un estado:
`dgcpFetch` lanza `Error("DGCP <ruta>: …")` y sus llamadores hacen
`.catch(() => null)`; `congreso.ts` tiene `silFetchSafe` (`null`) y
`silFetchEstado` (`"caida"`, distinto de `"inexistente"`).

**Respaldo en instantánea.** Dos capas en vivo caen a una instantánea cuando la
lectura falla y lo marcan en el dato: `lib/deuda.ts` (`desdeInstantanea: true`
y `generadoEn`, de `public/data/deuda.json`) y `lib/normativa.ts` (campo
`instantanea` con la fecha de `public/data/normativa.json` o
`public/data/leyes.json`) (§6).

### 4.2 Las capas que leen con `pedir.ts`

18 módulos importan `lib/pedir.ts`. Ventanas en segundos.

| Módulo | Función | `tipo` | Opciones | Caché |
|---|---|---|---|---|
| `aduanas.ts` | `pedirJson` (índice) y `pedirBytes` (XLSX) | `/application\/json/i`; `/spreadsheetml\|octet-stream\|excel/i` | esquema `INDICE`; `firma: "zip"` | `revalidate` 86,400 |
| `alertas.ts` | `pedirTexto` | `/xml/i` | — | RSS 900; cada aviso CAP 86,400 |
| `audiencias.ts` | `pedirJsonOLanzar`, `POST` JSON | `/json/i` | esquema `PAGINA` (con `filas`) | `no-store` + `unstable_cache` 3,600 |
| `banca.ts` | `pedirJson` | `/application\/json/i` | esquema `TARJETA` | 86,400 |
| `banco-central.ts` | `pedirBytes` sobre `delDiaBcrd(url)` | `/octet-stream\|spreadsheetml\|excel/i` | `firma: "zip"` | `no-store` + `unstable_cache` 21,600 (TPM, tasas activas, pasivas, operaciones) y 86,400 (balance) |
| `combustibles.ts` | `pedirTexto` | `/text\/html/i` | — | 3,600 |
| `congreso.ts` | `pedirJsonOLanzar` (`silFetch`) | `/application\/json/i` | `Accept: application/json`, `espera` 25,000, esquema `PAGINA_SIL` en rutas con `page=` | 600 por defecto; 300, 3,600, 86,400 por llamada |
| `cortes.ts` | `pedirTexto` | `/xml/i` (Edenorte), `/text\/html/i` (Edesur) | — | 21,600 |
| `deuda.ts` | `pedirTexto` (página) y `pedirBytes` (XLSX) | `/text\/html/i`; `/spreadsheetml\|application\/octet-stream/i` | `firma: "zip"` | 21,600 |
| `dgcp.ts` | `pedirJsonOLanzar` (`dgcpFetch`) | `/json/i` | `Accept`, esquema `ENVOLTURA`, `comprobar`: `hasError === true` | 300 por defecto; 1,800, 3,600, 86,400 por llamada |
| `energia.ts` | `pedirJson` | `/application\/json/i` | esquema por ruta (con `filas`) | 3,600 |
| `inmobiliario.ts` | `pedirJsonOLanzar`, `POST` `application/x-www-form-urlencoded` | `/json/i` | esquema `SOBRE`, `comprobar`: `statusCode >= 400` | `no-store` + `unstable_cache` 3,600 |
| `macro.ts` | `pedirBytes` sobre `delDiaBcrd(url)` | `/octet-stream\|spreadsheetml\|excel/i` | `firma: "zip"` | 86,400 (remesas, reservas), 21,600 (tasa activa) |
| `normativa.ts` | `pedirJsonOLanzar`, `POST` JSON a `/api/consultas/search` | `/json/i` | `espera` 30,000, `intentos: 1`, esquema `FILAS_BUSCADOR` (con `filas`) | `no-store`; `unstable_cache` 86,400 para las citas (`normativa-cita`) |
| `siniestralidad.ts` | `pedirJson` | `/application\/json/i` | esquema por ruta (con `filas`) | 86,400 |
| `tasa.ts` | `pedirBytes` sobre `delDiaBcrd(url)` | `/octet-stream\|spreadsheetml\|excel/i` | `firma: "zip"` | `no-store` + `unstable_cache` 3,600 |
| `tc.ts` | `pedirTextoOLanzar` | `/text\/html/i` | `Accept: text/html`, `espera` 60,000, `comprobar`: la página trae la tabla | `no-store` + `unstable_cache` 21,600 (año en curso) y 604,800 (año cerrado) |
| `tse.ts` | `pedirTextoOLanzar` | `/text\/html/i` | `Accept: text/html`, `espera` 25,000, `comprobar`: la página trae la tabla | `no-store` + `unstable_cache` 21,600 y 604,800 |

Por formato de la respuesta: JSON en `aduanas.ts` (índice), `audiencias.ts`,
`banca.ts`, `congreso.ts`, `dgcp.ts`, `energia.ts`, `inmobiliario.ts`,
`normativa.ts` y `siniestralidad.ts`; HTML en `combustibles.ts`, `cortes.ts`
(Edesur), `deuda.ts` (página de estadísticas), `tc.ts` y `tse.ts`; XML en
`alertas.ts` (RSS y avisos CAP) y `cortes.ts` (Edenorte); XLSX en `aduanas.ts`,
`banco-central.ts`, `deuda.ts`, `macro.ts` y `tasa.ts`. El consultante del
Senado (HTML con cookie de sesión y `__VIEWSTATE`) se lee fuera de `pedir.ts`
(§4.3).

`zod` lo importan, además de `pedir.ts`, `aduanas.ts`, `audiencias.ts`,
`banca.ts`, `congreso.ts`, `democracia.ts`, `dgcp.ts`, `energia.ts`,
`inmobiliario.ts`, `mcp.ts`, `normativa.ts`, `ontologia-esquemas.ts` y
`siniestralidad.ts`; los esquemas de lectura usan `z.looseObject` (admite
campos de más). `lib/seguimiento.ts`, que viaja al navegador, usa `zod/mini`.

En `lib/`, las peticiones `POST` a fuentes del Estado son cuatro: el buscador
de la Consultoría (`normativa.ts`), el rol de audiencias (`audiencias.ts`), el
Registro Inmobiliario (`inmobiliario.ts`) y el postback del consultante del
Senado (`senado.ts`). Fuera de `lib/`, `app/democracia/cuenta-unica/token/route.ts`
hace el `POST` del intercambio de código de Cuenta Única (§10).

**Patrón `no-store` + `unstable_cache`.** `banco-central.ts`, `tasa.ts`,
`tc.ts`, `tse.ts`, `audiencias.ts`, `inmobiliario.ts`, `senado.ts` y la cita de
`normativa.ts` piden con `cache: "no-store"` y guardan en `unstable_cache` el
resultado ya leído. La función guardada lanza ante cualquier fallo (con
`…OLanzar` o con una clase propia: `SinDato` en `banco-central.ts`, `SinTasa`
en `tasa.ts`); `unstable_cache` no guarda la excepción y un envoltorio la
captura y devuelve `null`. `instituciones.ts`, `provincias.ts` y
`grafo-rdf.ts` (`grafo-camino`) usan `unstable_cache` sobre un resultado
calculado; `instituciones.ts` llama a `dgcpFetch` con ventana `0` dentro de su
`unstable_cache` de 3,600 s.

**`delDiaBcrd`.** `banco-central.ts`, `macro.ts` y `tasa.ts` piden los archivos
de `cdn.bancentral.gov.do` con `?d=<fecha de hoy en Santo Domingo>`: la URL
cambia una vez al día.

### 4.3 Lecturas fuera de `pedir.ts`

| Módulo | Qué lee | Mecanismo |
|---|---|---|
| `lib/senado.ts` | Consultante del SIL del Senado (`https://sil.senadord.gob.do/wfilemaster`) | `fetch` propio, plazo 20,000 ms, `cache: "no-store"`, `redirect: "manual"`: `abrirSesion` exige un 302 con `location` y cookie; `senadoGet` exige 200 y `text/html`; `senadoBuscarPost` reenvía `__VIEWSTATE`, `__VIEWSTATEGENERATOR` y `__EVENTVALIDATION` del formulario. Caché con `unstable_cache`: `senado-lista` 900, `senado-busqueda`, `senado-ficha` y `senado-documentos` 3,600, `senado-archivo` 86,400 (§5.5) |
| `lib/senado.ts` | Documento de un expediente | Sigue el salto del `.htm` intermedio y hace un `HEAD` (peso y tipo) |
| `lib/documentos.ts` (`pesoDocumento`) | Peso y tipo de un documento | `HEAD`, plazo 15,000 ms, `revalidate` 86,400; solo orígenes permitidos (§4.6); `null` ante cualquier fallo |
| `lib/democracia.ts`, `lib/espacios.ts`, `lib/sesion.ts` | Supabase (§10) | `fetch` a PostgREST/Auth con plazos de 12,000, 15,000 y 8,000 ms |
| `lib/mcp.ts` | `/api/sql` del mismo despliegue (§9) | `GET` o `POST`, plazo 25,000 ms |
| `lib/nomina.ts` (`loadNomina`) | `/data/nomina.json`, desde el navegador | `fetch` sin opciones de caché; la respuesta lleva la cabecera de `/data/*` (§1.4) |

**Instantáneas en tiempo de ejecución.** 33 módulos de `lib/` leen archivos con
`fs` (`node:fs` o `fs/promises`), con rutas armadas desde `process.cwd()`; tres
importan un JSON de forma estática, que entra en el paquete
(`lib/instituciones.ts` y `lib/buscar.ts`: `@/public/data/instituciones.json`;
`lib/grafo-tablas.ts`: `@/public/tablas/meta.json`). Los archivos que una
función lee del disco viajan con ella por el trazado (§1.4). Inventario y
fechas de corte en §6.

### 4.4 HTML y XML: `lib/html.ts`

Solo servidor. Bibliotecas: `entities` (decodificación de entidades) y
`cheerio` sobre `parse5` (árbol HTML con el algoritmo de WHATWG).

| Exportación | Qué hace |
|---|---|
| `desentidades(s)` | `decodeHTML` (entidades con nombre, decimales y hexadecimales); el espacio duro `U+00A0` sale como espacio |
| `desentidadesXml(s)` | `decodeXML` (las cinco predefinidas y las numéricas); mismo trato del espacio duro |
| `textoPlano(html)` | Quita etiquetas, resuelve entidades y colapsa espacios |
| `arbol(html)` | `cheerio.load(html)` |
| `textoDe(nodo)` | Texto visible de uno o varios nodos: los trozos de texto unidos con un espacio y colapsados |
| `CheerioAPI`, `Element` | Tipos reexportados |

Consumidores: `arbol` y `textoDe` en `senado.ts`, `tc.ts` y `tse.ts`;
`desentidades` en `combustibles.ts`, `cortes.ts` y `senado.ts`;
`desentidadesXml` en `alertas.ts`. `lib/deuda.ts` importa `decodeHTML` de
`entities` directamente.

### 4.5 Hojas de cálculo: `lib/xlsx.ts`

Solo servidor. `fflate` (`unzipSync`, con filtro) lee el ZIP por su directorio
central y extrae solo `xl/worksheets/sheet{n}.xml` y `xl/sharedStrings.xml`;
`fast-xml-parser` lee el XML (`processEntities: false`, `trimValues: false`,
`row`, `c`, `si` y `r` siempre como listas) y `entities` (`decodeXML`)
decodifica.

| Exportación | Qué hace |
|---|---|
| `leerHoja(buf, n = 1)` | Devuelve `Hoja` = `Map<fila, Map<columna, texto>>` ordenado por fila, o `null` si el archivo no es un XLSX legible o no trae la hoja. Resuelve cadenas compartidas (`t="s"`), cadenas en línea (`inlineStr`) y texto enriquecido (`<si><r><t>`; ignora `rPh`); omite celdas vacías |
| `filasDe(hoja)` | Lista de `{ n, celdas }` en orden |
| `indiceColumna(letras)` | «CW» → 101 |

Consumidores: `aduanas.ts`, `banco-central.ts`, `deuda.ts`, `macro.ts`,
`tasa.ts`. El Excel binario (`.xls`, BIFF) no lo abre este lector: los dos
archivos del BCRD en ese formato los lee `scripts/build-bcrd.py` y
`lib/bcrd.ts` sirve `public/data/bcrd.json`.

### 4.6 Documentos: `lib/documentos.ts`, `/api/documento` y el lector

`ORIGENES_DOCUMENTO` en `lib/documentos.ts`:

- `comunidad.comprasdominicana.gob.do`
- `www.consultoria.gov.do`
- `consultoria.gov.do`
- `sil.senadord.gob.do`

`esUrlDeDocumento(url)` exige `https:` y un `hostname` de esa lista;
`urlDeLectura(url)` devuelve `/api/documento?url=<url codificada>`. La usan
`app/procesos/[codigo]/page.tsx`, `app/congreso/senado/[cuatrienio]/[id]/page.tsx`
y `app/normativa/[tipo]/[numero]/page.tsx`.

`app/api/documento/route.ts` (`dynamic = "force-dynamic"`):

| Paso | Comportamiento |
|---|---|
| Origen | Fuera de la lista: 400 `{ error: "origen no permitido", origenes }` |
| Petición al origen | `fetch` con `User-Agent: Socratico-Inteligencia/1.0 (lectura de documento público; herramienta independiente)`, plazo 30,000 ms, `cache: "no-store"`. Del visitante solo se reenvía `Range` |
| Fallo de red | 502 `{ error: "el origen no respondió" }` |
| No-2xx o sin cuerpo | 502 `{ error: "el origen respondió <estado>" }` |
| Tipo | `content-type` que no empieza por `application/pdf`, `image/` o `text/plain`: 415 |
| Tope | `LIMITE_BYTES = 40 * 1024 * 1024`; si la respuesta no es 206 y `content-length` lo supera: 413 `{ error, bytes }` |
| Respuesta | El cuerpo del origen en flujo, con su estado (200 o 206) y `Content-Type`, `Content-Disposition: inline`, `Cache-Control: public, max-age=3600, s-maxage=86400`, `X-Content-Type-Options: nosniff`, `Accept-Ranges` (el del origen o `none`), `Content-Range` y `Content-Length` cuando el origen los da |

El lector: `components/visor-documento.tsx` carga `components/lector-pdf.tsx`
con `dynamic(…, { ssr: false })`, y este importa el build `legacy` de pdf.js
(`pdfjs-dist/legacy/build/pdf.mjs`, trabajador
`pdfjs-dist/legacy/build/pdf.worker.min.mjs`) y abre el documento con
`getDocument({ url, disableAutoFetch: true, disableStream: false })` sobre la
URL de `/api/documento`, que admite `Range`. Los enlaces «abrir» y «descargar»
apuntan al archivo original. `app/api/senado/documento/route.ts` resuelve el
archivo de un expediente del Senado (`getArchivoSenado`) y responde 302 al
origen, sin servir bytes.

### 4.7 Lecturas del navegador: `lib/consultas.ts`

Las lecturas que el navegador hace a rutas propias (`/api/*`, `/data/*`) pasan
por TanStack Query. El navegador no lee fuentes del Estado; `lib/consultas.ts`
no importa `lib/pedir.ts` ni ningún adaptador.

**El cliente** (`components/consultas.tsx`, `ProveedorConsultas`, en el
layout): un `QueryClient` creado una vez por montaje del proveedor
(`useState`), con
`staleTime: 60_000`, `retry: 0` y `refetchOnWindowFocus: false`.
`ReactQueryDevtools` se monta siempre; el paquete exporta un componente vacío
cuando `NODE_ENV !== "development"`.

**`lib/consultas.ts`:**

| Exportación | Contenido |
|---|---|
| `claves.unidades` | `["unidades"]` — `/api/unidades` |
| `claves.procesos(params)` | `["procesos", params]` — `/api/procesos?…` |
| `claves.buscar(q, n)` | `["buscar", q, n]` — `/api/buscar` |
| `claves.seguimiento(tipo, id)` | `["seguimiento", tipo, id]` |
| `claves.nomina` | `["nomina"]` — `/data/nomina.json` |
| `leerJson(url, signal)` | `fetch` con la señal de TanStack Query; un no-2xx lanza `Error` con el `error` del cuerpo o `Error <estado>`; un cuerpo que no es JSON lanza «La respuesta no se pudo leer.» |
| `buscarEnPlataforma(q, n, signal)` | `leerJson` sobre `/api/buscar?q=…&n=…` |
| `RespuestaBuscar` | `{ resultados?, pantallas? }` |

| Consumidor | Clave | Opciones propias |
|---|---|---|
| `app/buscador.tsx` | `unidades`, `procesos` | `placeholderData: keepPreviousData`; consulta rebotada 450 ms (`useRebotado` de `components/rebotado.ts`) |
| `components/paleta.tsx` | `buscar(q, 6)` | rebote 180 ms |
| `components/espacios/mesa-proyecto.tsx` | `buscar(q, 8)` | `placeholderData: keepPreviousData` |
| `app/seguimiento/page.tsx` | `seguimiento` | `retry: false` |
| `components/nomina/explorer.tsx` | `nomina` | `retry: 1` |

### 4.8 Ventanas de caché

**Caché de datos de Next en `lib/`** (`fetch` con `next.revalidate`, o
`unstable_cache` —«u_c»—), por valor, contado con `grep`:

| Segundos | Módulos y lecturas |
|---|---|
| 0 | `instituciones.ts`: las dos lecturas de `dgcpFetch` de `calcularCompras` (dentro de su u_c de 3,600) |
| 30 | `democracia.ts` (agregados de una iniciativa), `espacios.ts` (`comunidad`) — Supabase |
| 60 | `democracia.ts` (agregados, iniciativas, total), `espacios.ts` (`publicado`) — Supabase |
| 300 | `dgcp.ts` (`dgcpFetch` por defecto), `congreso.ts` (`listIniciativas`, `listIniciativasFiltradas`, `buscarIniciativasTolerante`, `fraseParaSil`, `getIniciativa`) |
| 600 | `congreso.ts` (`silFetch` por defecto) |
| 900 | `alertas.ts` (RSS de INDOMET), `senado.ts` (u_c `senado-lista`) |
| 1,800 | `dgcp.ts` (`getCompetencia`, `/ofertas`) |
| 3,600 | `dgcp.ts` (`getPreciosSubclase`, `getHistorialProveedor`, `listPacc`), `congreso.ts` (`getCountIniciativas`, `buscarIniciativas`), `combustibles.ts`, `energia.ts`, `tasa.ts` (u_c), `instituciones.ts` (u_c `compras-de-institucion`), `senado.ts` (u_c búsqueda, ficha, documentos), `audiencias.ts` (u_c), `inmobiliario.ts` (u_c) |
| 21,600 | `deuda.ts`, `cortes.ts`, `banco-central.ts` (u_c TPM, tasas activas, pasivas, operaciones), `macro.ts` (tasa activa), `tc.ts` y `tse.ts` (u_c año en curso) |
| 86,400 | `dgcp.ts` (`getUnidadesCompra`, `fichaPorRpe`, `fichaPorDocumento`, `contarProveedoresRegistrados`, `getSubclase`), `congreso.ts` (`getGrupos`, `getPeriodos`, `getRutaDocumento`, `getDirectorioLegisladores`, `getLegislador`, `getVotacion`), `legislacion.ts` (`proyectosDeNorma`), `aduanas.ts`, `alertas.ts` (avisos CAP), `banca.ts`, `siniestralidad.ts`, `macro.ts` (remesas, reservas), `banco-central.ts` (u_c balance), `documentos.ts` (`HEAD`), `senado.ts` (u_c `senado-archivo`), `normativa.ts` (u_c `normativa-cita`), `grafo-rdf.ts` (u_c `grafo-camino`), `provincias.ts` (u_c `provincias-proveedores-v2`) |
| 604,800 | `tc.ts` y `tse.ts` (u_c año cerrado) |

Sin caché de datos: los listados de `normativa.ts` (`no-store`, sin u_c); los
guarda solo el segmento de la página que los pinta.

**Segmentos de ruta** (`export const revalidate` en `app/`, 48 archivos;
detalle por ruta en §3):

| Segundos | Archivos |
|---|---|
| 60 | 1 |
| 300 | 3 |
| 900 | 1 |
| 1,800 | 5 |
| 3,600 | 11 |
| 21,600 | 3 |
| 86,400 | 24 |

27 archivos de `app/` declaran `dynamic = "force-dynamic"` (entre ellos todas
las rutas de `app/api/*`) y 6, `"force-static"`.

**CDN.** 16 de las 17 rutas de `app/api/*` fijan `Cache-Control` en su
respuesta de éxito, con `s-maxage` entre 300 y 86,400 según la ruta (§3);
`/api/senado/documento` responde un 302 sin esa cabecera. `lib/csv.ts`
(`respuestaCsv`) usa `public, s-maxage=300, stale-while-revalidate=600`;
`app/mcp/route.ts`, `no-store`.
`/data/*` y `/tablas/*` llevan `max-age=3600, stale-while-revalidate=86400`
desde `next.config.ts`.

**Navegador.** `staleTimes` del router: 30 s (dinámico) y 300 s (estático);
TanStack Query: `staleTime` 60 s.

## 5. Fuentes del Estado

Cada fuente es una ficha con su estado (✅ se lee, ⚠️ con un límite, ❌ no se lee): origen, dirección, método y formato, acotación, código, lectura (en vivo con su ventana o instantánea con su corte), observado (hechos fechados) y cobertura.

### 5.1 Compras públicas

#### DGCP — API de datos abiertos ✅

- **Origen**: Dirección General de Contrataciones Públicas (DGCP), API de datos abiertos.
- **Dirección**: base `https://datosabiertos.dgcp.gob.do/api-dgcp/v1` (`BASE` en `lib/dgcp.ts`). Endpoints que pide el código:

  | Endpoint | Parámetros que envía el código | Función | Ventana |
  |---|---|---|---|
  | `/procesos` | `proceso`, `estado`, `modalidad`, `unidad_compra`, `startdate`, `enddate`, `mipyme`, `mipyme_mujer`, `page`, `limit` | `listProcesos`, `descargarProcesos` | 300 s |
  | `/procesos` | `proceso`, `limit=5` | `getProceso` | 300 s |
  | `/procesos` | `startdate` (hace 30 días), `limit=1000` | `app/page.tsx`, `app/estadisticas/page.tsx` | 1800 s |
  | `/procesos` | `unidad_compra`, `startdate`/`enddate` (último año), `limit=1000` | `getComprasDeInstitucion` (`lib/instituciones.ts`) | 0, dentro de `unstable_cache` de 3600 s |
  | `/procesos/articulos` | `proceso`, `limit=200` | `getProceso` | 300 s |
  | `/procesos/documentos` | `proceso` | `getProceso` | 300 s |
  | `/contratos` | `proceso`, `limit=50` | `getProceso` | 300 s |
  | `/contratos` | `page` 1–6, `limit=1000` | `paginasDeContratos` → `contratosRecientes`, `muestrearContratos`, `muestrearProveedores` | 1800 s |
  | `/contratos` | `rpe`, `limit=1000` | `getHistorialProveedor` | 3600 s |
  | `/contratos` | `unidad_compra`, `page=1`, `limit=1000` | `getComprasDeInstitucion` | 0, dentro de `unstable_cache` de 3600 s |
  | `/contratos/articulos` | `subclase`, `limit=1000` | `getPreciosSubclase` | 3600 s |
  | `/ofertas` | `proceso`, `limit=1000` | `getCompetencia` | 1800 s |
  | `/proveedores` | `rpe` o `numero_documento` con `limit=5`; `limit=1` | ficha RPE, abajo | 86,400 s |
  | `/catalogo` | `subclase`, `limit=5` | `getSubclase` | 86,400 s |
  | `/unidades_compra` | `limit=1000` | `getUnidadesCompra` (solo `estado` «ACTIVA») | 86,400 s |
  | `/pacc` | `unidad_compra`, `limit` (1000 por defecto) | `listPacc` | 3600 s |

  `scripts/build-instituciones.py` pide además `/unidades_compra?limit=1000` en build (§5.7).
- **Método y formato**: GET, JSON, cabecera `Accept: application/json`. Envoltura `code`, `hasError`, `payload.content`, `page`, `limit`, `totalResults`, `pages`. `dgcpFetch` la valida con `zod` (`ENVOLTURA`), exige `content-type` JSON, reintenta una vez cuando `hasError` es `true` y convierte `payload.content: null` (sin resultados) en una lista vacía.
- **Acotación**: `limit` hasta 1000. `listProcesos` hace una sola petición cuando no hay texto, la etapa la filtra la API (`estadoUnico` en `lib/estados.ts`) y el orden es «recientes»; entonces `totalResults` es el censo del origen. En otro caso `barrerProcesos` lee hasta `MAX_PAGINAS_BARRIDO` (6) páginas de 1000, filtra por texto y etapa, ordena y pagina en el servidor, y devuelve `scanned`, `truncated` y `muestra`. `MAX_FILAS_DESCARGA` = 6,000 filas para `/api/procesos/csv`. Un texto con forma de código de proceso (`FORMA_CODIGO`) se envía como filtro exacto `proceso`, sin etapa ni fechas (`filtrosEfectivos`). La ventana de contratos es `MAX_CONTRATOS_PAGES` (6) páginas de 1000. `registrosDeProveedores` pide fichas en tandas de 4.
- **Código**: `lib/dgcp.ts` (tipos `Proceso`, `Articulo`, `Documento`, `Contrato`, `ContratoArticulo`, `Oferta`, `ProveedorRegistro`, `Subclase`, `Pacc`); `lib/instituciones.ts`; `lib/provincias.ts` (fichas de los `TOPE_PROVEEDORES` = 200 mayores adjudicatarios de la ventana).
- **Lectura**: en vivo, con las ventanas de la tabla.
- **Observado**:
  - 2026-09-01: `/ofertas`, `/proveedores`, `/catalogo` y `/pacc` responden 200 con la misma envoltura; `/adjudicaciones`, `/articulos`, `/documentos`, `/sanciones` y un swagger no existen.
  - `/contratos` ignora los filtros de fecha y sirve de lo más reciente a lo más antiguo (`lib/dgcp.ts`). `/pacc` ignora `periodo` y devuelve el año en curso; `unidad_compra` sí filtra, y `listPacc` filtra el período en el servidor. En `/ofertas`, `estado_evaluacion` llega casi siempre «Pendiente» o vacío, también en procesos adjudicados; quién ganó lo dicen los contratos.
  - El registro trae fechas corruptas (mes `00`, días fuera de rango, años como `2202`); `fechaValida` descarta las que no caen entre 1990 y el año siguiente.
  - `monto_estimado` va en la divisa del proceso (`divisa`); el orden por monto pone primero los pesos y deja las otras divisas al final, sin convertir.
  - Las respuestas crudas de una institución grande pasan de 2 MB (MINERD: 1,000 procesos del año ≈ 2.2 MB), el tope de la caché de datos de Next; `getComprasDeInstitucion` pide con `revalidate: 0` y guarda el resumen ya calculado con `unstable_cache` (3600 s).
  - 2026-09-27: un 12 % de los códigos de proceso llevan espacios y tildes («Hosp. Reid Cabral-DAF-CD-2026-0634»); la API los resuelve codificados en la URL.
  - `url_documento` de `/procesos/documentos` apunta a `comunidad.comprasdominicana.gob.do`; esos archivos se sirven por `lib/documentos.ts` (§4).
- **Cobertura**: procesos, artículos y documentos de proceso, contratos y sus artículos, ofertas, proveedores inscritos, catálogo UNSPSC, unidades de compra y planes anuales (PACC). `startdate` y `enddate` se aplican a la fecha de publicación (lo declara `/fuentes`). Los agregados de contratos y la búsqueda de proveedores por nombre describen la ventana de las 6 páginas más recientes de `/contratos`, no el registro.

#### DGCP — tablas completas de contratos y procesos ✅

- **Origen**: DGCP, sección «Tablas» del portal de datos abiertos (la llama el JavaScript `TablasPage-*.js` del portal).
- **Dirección**: `https://datosabiertos.dgcp.gob.do/api-dgcp/v1/tablas/contratos?Type=csv` y `…/tablas/procesos?Type=csv`. La misma ruta sirve `…/tablas/proveedores` (fichas RPE y medidas, abajo).
- **Método y formato**: GET, `text/csv` UTF-8, la tabla entera en una petición. Columnas de procesos: `CODIGO_PROCESO`, `CODIGO_UNIDAD_COMPRA`, `UNIDAD_COMPRA`, `MODALIDAD`, `TIPO_EXCEPCION`, `CARATULA` (texto libre, hasta 200 caracteres), `ESTADO_PROCESO`, `MONEDA`, `MONTO_ESTIMADO`, `FECHA_PUBLICACION`, `DIRIGIDO_MIPYMES(_MUJERES)`, `OBJETO_PROCESO`, `DECRETO_PRESIDENCIAL`, `COMPRA_VERDE`, `COMPRA_CONJUNTA`, `URL`. Contratos: código, estado, estado de adjudicación, fecha, valor, moneda, objeto, RPE, razón social y documento.
- **Acotación**: ninguna en el origen. Los scripts validan `text/csv`, reintentan una vez tras 10 s, esperan hasta 600 s y aceptan `--local DIR` con los CSV ya bajados. `build-historico.py` guarda los 100 mayores proveedores e instituciones del período (`TOP_GLOBAL`), 12 proveedores por institución (`TOP_INSTITUCION`) y 8 clientes por proveedor (`TOP_CLIENTES`). `build-procesos.py` guarda los doce meses anteriores a la publicación más reciente de la tabla, con techo `TECHO` = 90,000 filas.
- **Código**: `scripts/build-historico.py` (las dos tablas) → `lib/historico.ts` (`getResumenHistorico`, `historiaDeInstitucion`, `historiaDeProveedor`, `prefijoSinAsignar`, `rncDeProveedor`, `contarContrataciones`); `scripts/build-procesos.py` (procesos) → `lib/tablas-compras.ts` (`todosLosProcesos`, `todosLosProveedores`, `publicadoPorInstitucion`), que lee también `historico/proveedores/` y `rnc/` y pasa carátulas y nombres por `sinCedula` (`lib/padron.ts`); la usan las herramientas MCP `procurement`, `contracting_history` y `retrieve` (§9). `scripts/build-historico-rnc.py` no pide nada a la red: cruza `historico/proveedores/` con el padrón de empresas (§5.7) → `historico/rnc.json`.
- **Lectura**: instantáneas, memoizadas por instancia.
  - `public/data/historico/resumen.json`: `generado` 2026-09-24, `corte` 2026-09-22 (última fecha de adjudicación); 722,825 contratos y 631,103 procesos leídos; años 2015–2026.
  - `historico/instituciones.json`: 759 unidades de compra. `historico/proveedores/{0..9}.json`: 32,152 RPE, por el último dígito. `historico/rnc.json`: `generado` 2026-09-30, 22,822 de los 32,152 RPE con RNC de nueve cifras, `cortePadron` 2026-09-19.
  - `public/data/procesos.json`: `generado` 2026-09-27, procesos publicados del 2025-09-25 al 2026-09-25, 77,790 filas, `recortado: false`; unidades (667), modalidades, estados y objetos en tablas aparte referidas por índice.
- **Observado**:
  - 2026-09-24: contratos, 115 MB en 3.5 s; procesos, 245 MB en 5.4 s. 2026-09-27: procesos, 631,900 filas en ~5.5 s, `x-ratelimit-limit: 60`. Los parámetros `anio` y `semestre` que pinta el portal se ignoran (2026-09-24).
  - La tabla de contratos no trae la unidad de compra ni el código del proceso (columnas releídas el 2026-09-30). `build-historico.py` asigna cada contrato a una unidad por el prefijo de su código (`INFOTEP-2026-01420`) cuando un solo código de unidad reúne más del 95 % de los procesos con ese prefijo. Quedan en `sinAsignar` los prefijos ambiguos (`MOPC`, compartido por el MOPC y la OPRET; `MEPYD`) y los códigos `DO1.PCCNTR.*`: 5,025 contratos por RD$128,466 millones, de ellos 4,450 del prefijo `MOPC` por RD$128,388 millones.
  - En `resumen.json`: 46,230 contratos cancelados, fuera de toda suma; 269 en otras monedas (USD 246, EUR 22, GBP 1), fuera de las sumas en pesos; 13 contratos de RD$10 mil millones o más (`umbralAtipico`), listados aparte en `atipicos` y fuera de las sumas.
  - `procesos.json` deja sin monto los procesos en otras monedas (~140 el 2026-09-27).
- **Cobertura**: contratos y procesos registrados desde 2015. La cifra es valor contratado en pesos, no pagado. `procesos.json` cubre doce meses; el resto de un proceso se lee en vivo en su ficha (`/procesos/{codigo}`).

#### DGCP — Registro de Proveedores del Estado (RPE) ⚠️

- **Límite**: por la API se consulta solo por número exacto (RPE, RNC o cédula); no admite búsqueda por razón social ni se puede recorrer entero. La tabla completa sí se descarga, en build.
- **Origen**: DGCP, Registro de Proveedores del Estado.
- **Dirección**: `/proveedores` de la API (ficha anterior) y `https://datosabiertos.dgcp.gob.do/api-dgcp/v1/tablas/proveedores?Type=csv&inhabilitados=false`.
- **Método y formato**: API, GET JSON con 35 campos por proveedor; tabla, GET `text/csv` con 42 columnas (`content-disposition: attachment; filename=Proveedores.csv`).
- **Acotación**: `fichaPorRpe` (`rpe`, `limit=5`); `fichaPorDocumento` (`numero_documento` en dígitos; entre 8 y 10 dígitos sin resultado, repite rellenando con ceros a 11); `contarProveedoresRegistrados` (`limit=1`, lee `totalResults`). `buscarProveedores` prueba primero documento si la consulta tiene 9 u 11 dígitos y RPE en otro caso, distingue «no inscrito» de «el registro no contestó» (`registroCaido`) y, para un nombre, busca dentro de la ventana de contratos (`muestrearProveedores`), hasta `MAX_COINCIDENCIAS` = 60 y con al menos `MIN_LETRAS_NOMBRE` = 3 letras.
- **Código**: `lib/dgcp.ts` (`getProveedorRegistro`, `getProveedorPorDocumento`, `contarProveedoresRegistrados`, `registrosDeProveedores`, `buscarProveedores`). La tabla la leen `scripts/build-rnc.py`, `scripts/build-sanciones.py` y `scripts/build-empresas.py` (§5.7); cada uno toma solo las columnas que usa (RPE, documento, tipo de documento, razón social, tipo de persona, estado) y no guarda teléfonos, correos ni personas de contacto.
- **Lectura**: la API en vivo, `revalidate` 86,400 s; la tabla, solo en build.
- **Observado**:
  - 2026-09-03: `totalResults` = 127,896; orden por `rpe` ascendente, no contiguo; `rpe` y `numero_documento` filtran de forma exacta (un prefijo devuelve 0) y responden en 1–4 s; las cédulas se guardan rellenadas con ceros a la izquierda hasta 11 cifras.
  - `estado`, `provincia` y `region` devuelven 500 con cualquier valor probado (2026-09-03; `provincia` y `municipio`, de nuevo el 2026-09-23). `razon_social`, `proveedor`, `nombre`, `q`, `rnc`, `documento`, `mipyme`, `provee`, `clasificacion` y `forma_juridica` se ignoran y devuelven el registro entero con `totalResults` intacto.
  - Páginas con 500 permanente (2026-09-03, cada una reproducida dos veces): con `limit=200`, las 11, 12, 639 y 640; con `limit=1000`, la 3; con `limit=50`, de la 2553 a la 2558. Con `limit=1000` cada página tarda 10–50 s.
  - 2026-09-23: la tabla mide 80 MB, baja en 3 s, `x-ratelimit-limit: 60`, 137,817 filas, y trae teléfonos, correos y personas de contacto. 2026-09-30: 137,909 filas (`fuentes.dgcp.registro` en `sanciones.json`).
  - Estado de los registros en la tabla (2026-09-29): Activo 89,108; Desactualizado 35,356; Cancelado 9,294; Inactivo 3,112; Suspendido 865; Inhabilitado 174.
  - 2026-09-23, sobre 200 fichas: La Vega llega como «CONCEPCIÓN DE LA VEGA», Monte Cristi como «MONTECRISTI», y 42 traen la provincia vacía.
- **Cobertura**: todos los inscritos, por número. `ProveedorRegistro` no incluye teléfonos, correos ni contacto comercial. `/provincias` agrupa las fichas de los 200 mayores adjudicatarios de la ventana, no el registro. La búsqueda por nombre en `/proveedores` usa además el índice de búsqueda (§8).

#### DGCP — medidas sobre proveedores ✅

- **Origen**: DGCP, tabla de proveedores inhabilitados (la visualización del portal es un Power BI, que no se lee).
- **Dirección**: `https://datosabiertos.dgcp.gob.do/api-dgcp/v1/tablas/proveedores?Type=csv&inhabilitados=true` (`URL_INHAB`), cruzada con `…&inhabilitados=false` (`URL_RPE`, el registro entero, que incluye a los inhabilitados).
- **Método y formato**: GET, `text/csv`, `ProveedoresInhabilitados.csv`, leído como UTF-8 con BOM o, si falla, cp1252. Una fila por medida: `RPE, MOTIVO_INHABILITACION, FECHA, FECHA_INHABILITACION, FECHA_HABILITACION, FECHA_FIRMA_RESOLUCION, OFICIO_INHABILITACION, URL_CERTIFICACION_RPE`. No hay campo de tipo: `clasificar()` lo deduce del texto del motivo con reglas escritas (la primera que casa gana).
- **Acotación**: `scripts/build-sanciones.py` hace una petición a la vez, con más de 1.2 s entre peticiones, un reintento tras 10 s, espera hasta 300 s y valida el `content-type`. No escribe si hay menos de 1,500 medidas (`MIN_EVENTOS`), si el cruce con el registro baja del 99 % (`MIN_CRUCE`), si la lista SDN trae menos de 10,000 entradas (`MIN_SDN`) o ninguna entidad dominicana, o si la del Banco Mundial trae menos de 1,000 (`MIN_BM`). `--guardar DIR` deja lo descargado; `--local DIR` lo reutiliza.
- **Código**: `scripts/build-sanciones.py` → `public/data/sanciones.json` → `lib/sanciones.ts` (`getSanciones`, `medidasDeRpe`, `medidasDeRnc`, `metaSanciones`, `buscadorMedidas`, `cumpleTipo`, `tonoEstadoRpe`); `lib/medidas.ts` (la lista cerrada `TIPOS_MEDIDA`, `GRUPOS_MEDIDA`, sin lectura de archivos). Páginas `/proveedores/inhabilitados` y la ficha de proveedor.
- **Lectura**: instantánea, memoizada por instancia; `sanciones.json`: `generado` 2026-09-30, `fuentes.dgcp.corte` 2026-09-22.
- **Observado**:
  - 2026-09-29: 933,864 B; 2,317 filas sobre 1,734 RPE, del 2010-12-19 al 2026-09-22; 915 textos de motivo distintos. `FECHA_HABILITACION` trae fechas futuras (2027, 2040, 2055). Al cancelar un registro la DGCP pega «@C» y un número al documento (457 casos; las nueve primeras cifras siguen siendo el RNC). 307 RNC tienen más de un RPE.
  - `URL_CERTIFICACION_RPE` apunta a `comunidad.comprasdominicana.gob.do`, cuyo `robots.txt` responde 401 (2026-09-29); el enlace no se pide.
  - En `sanciones.json`: 48 filas repetidas (solo difieren en `FECHA`) y 6 de prueba (RPE 77888 y 77889) quedan fuera; 0 RPE sin cruce; 1,732 proveedores publicados: 1,332 empresas y entidades con 1,756 medidas y 400 personas físicas con 507, con el nombre del registro, `fisica: true` y sin documento ni enlace a la constancia; 37 motivos con el nombre o el documento de un firmante sustituidos por `anonimizar()`. Estado actual de esos RPE: Suspendido 865, Cancelado 399, Activo 243, Inhabilitado 171, Desactualizado 54.
- **Cobertura**: las 2,263 medidas publicadas, por tipo:

  | Tipo (`TIPOS_MEDIDA`) | Etiqueta | Grupo | Medidas |
  |---|---|---|---|
  | `prohibicion` | Prohibición por cargo público | `oficio` | 1,051 |
  | `cancelacion-solicitud` | Cancelación a solicitud del proveedor | `otras` | 299 |
  | `suspension-solicitud` | Suspensión a solicitud del proveedor | `otras` | 212 |
  | `inhabilitacion-permanente` | Inhabilitación permanente | `sancion` | 167 |
  | `cancelacion` | Cancelación de oficio | `oficio` | 160 |
  | `penal` | Suspensión por proceso penal | `oficio` | 121 |
  | `inhabilitacion-temporal` | Inhabilitación temporal | `sancion` | 106 |
  | `incumplimiento` | Incumplimiento de contrato | `sancion` | 45 |
  | `condena` | Cancelación por condena penal | `oficio` | 33 |
  | `correccion` | Corrección del registro | `otras` | 23 |
  | `levantamiento` | Levantamiento o aclaración | `otras` | 17 |
  | `inhabilitacion` | Inhabilitación sin plazo escrito | `sancion` | 10 |
  | `otro` | Otro motivo | `otras` | 8 |
  | `suspension` | Suspensión de oficio | `oficio` | 7 |
  | `vinculo` | Suspensión por posible vínculo | `oficio` | 4 |

  Una medida posterior al corte no está en la instantánea.

#### OFAC — lista SDN del Tesoro de Estados Unidos ✅

- **Origen**: Office of Foreign Assets Control, Departamento del Tesoro de Estados Unidos; servicio de listas de sanciones. Fuente extranjera.
- **Dirección**: `https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV` (`URL_SDN`) y `…/ADD.CSV` (`URL_ADD`, direcciones). Enlace por entidad: `https://sanctionssearch.ofac.treas.gov/Details.aspx?id=<ent_num>` (`hrefFichaOfac`).
- **Método y formato**: GET; responde 302 a una URL firmada de S3, que se sigue; `text/csv` sin fila de cabecera, con `-0-` como vacío.
- **Acotación**: la lista entera; se guardan solo las entidades (nunca las de tipo `individual`) ligadas a la República Dominicana por un número fiscal dominicano, una dirección en el país o una mención en sus observaciones.
- **Código**: `scripts/build-sanciones.py` (mismo script, umbrales y cadencia que las medidas) → `sanciones.json` (`ofac`) → `lib/sanciones.ts` (`ofacDeRnc`, `PROGRAMAS_OFAC`, `programaEnLlano`, `hrefFichaOfac`).
- **Lectura**: instantánea; `fuentes.ofac.fecha` 2026-09-29.
- **Observado**: 2026-09-29: `SDN.CSV` 5,716,625 B y 19,444 filas; `ADD.CSV` 1,695,007 B; el `robots.txt` del servicio de listas responde 404; `Details.aspx` responde 200 `text/html` y su `robots.txt` solo veda `/error.aspx`.
- **Cobertura**: en `sanciones.json`, 27 entradas ligadas al país, 14 personas omitidas y 13 entidades publicadas (11 por RNC y dirección, 2 solo por dirección); ninguna casa con un RPE.

#### Banco Mundial — firmas inhabilitadas ⚠️

- **Límite**: la API exige la clave que la propia página del Banco publica; no hay descarga oficial sin clave.
- **Origen**: Banco Mundial, lista de firmas e individuos con inhabilitación vigente, incluidas las cruzadas de otros bancos multilaterales. Fuente extranjera.
- **Dirección**: página `https://www.worldbank.org/en/projects-operations/procurement/debarred-firms` (`URL_BM`); la dirección de la API sale de la variable `prodtabApi` de un `<script>` de esa página.
- **Método y formato**: GET de la página HTML; `leer_banco_mundial` toma con expresiones regulares `prodtabApi` y `propApiKey`, comprueba que la página la envía como `"apikey"`, y hace GET a la API con la cabecera `apikey`. Responde `application/json`, `response.ZPROCSUPP[]`. La clave se usa en memoria y no se escribe en el repositorio ni en la instantánea.
- **Acotación**: la lista entera; se guardan las firmas ligadas al país y las de nombre idéntico a un proveedor inscrito en la DGCP; los individuos solo se cuentan.
- **Código**: `scripts/build-sanciones.py` → `sanciones.json` (`bancoMundial`) → `lib/sanciones.ts` (`bancoMundialDeRpe`, `motivoBancoMundialEnLlano`).
- **Lectura**: instantánea; `fuentes.bancoMundial.fecha` 2026-09-29.
- **Observado**: 2026-09-30: 200 JSON, 1.75 MB en 7.7 s, sin `Origin` ni `Referer`; campos `SUPP_NAME`, `LAND1`/`COUNTRY_NAME`, `DEBAR_FROM_DATE`, `DEBAR_TO_DATE` (2999-12-31 = indefinida), `DEBAR_REASON`, `INELIGIBLY_STATUS`, `ELIG_STAT` (`DEBARRED` o `X-DEBARRED`); `ADD_SUPP_INFO` no se usa. El `robots.txt` del gateway de la API responde 403 del WAF.
- **Cobertura**: en `sanciones.json`, 1,520 entradas (1,260 firmas, 260 individuos omitidos) y 2 firmas guardadas, las dos con nombre idéntico a un proveedor inscrito y una de ellas ligada al país.

#### DGII — padrón de contribuyentes, cruzado con los proveedores ✅

- **Origen**: Dirección General de Impuestos Internos, padrón RNC descargable.
- **Dirección**: `https://dgii.gov.do/app/WebApps/Consultas/RNC/RNC_CONTRIBUYENTES.zip` (`URL_DGII`), cruzado con `…/tablas/proveedores?Type=csv&inhabilitados=false` (`URL_RPE`) de la DGCP.
- **Método y formato**: GET; ZIP (`application/x-zip-compressed`) con un CSV `RNC_Contribuyentes_Actualizado_DD_Mes_AAAA.csv` en Windows-1252, coma, campos entre comillas, fechas `DD/MM/AAAA`; columnas `RNC, RAZÓN SOCIAL, ACTIVIDAD ECONÓMICA, FECHA DE INICIO OPERACIONES, ESTADO, RÉGIMEN DE PAGO`. El corte se lee del nombre del archivo (`corte_iso`).
- **Acotación**: solo proveedores con documento de 9 dígitos. Por RPE se guarda RNC, actividad, inicio de operaciones, estado y régimen, en diez archivos por el último dígito del RPE. Un reintento tras 10 s, espera de 300 s, `--local DIR`.
- **Código**: `scripts/build-rnc.py` → `public/data/rnc/{0..9}.json` y `rnc/meta.json` → `lib/rnc.ts` (`getRegistroTributario`, que lee solo el fragmento del último dígito; `tieneFichaDeEmpresa`, que lee `public/data/empresas/meta.json`; `diasEntre`). El mismo ZIP alimenta el padrón de empresas (§5.7).
- **Lectura**: instantánea; `meta.json`: `generado` 2026-09-23, `corteDgii` 2026-09-19 (`RNC_Contribuyentes_Actualizado_19_Sep_2026.csv`).
- **Observado**: 2026-09-23: 200 `application/x-zip-compressed`, 26,878,229 B, `last-modified` 19-sep-2026; CSV de 115.6 MB. Leído como cp850 decodifica sin error con letras cambiadas («RAZËN»). 67 mil filas sin fecha de inicio. `DGII_RNC.zip` responde 403 (2026-09-01). El `robots.txt` de `dgii.gov.do` veta solo rutas de SharePoint (`/_layouts/`, `/_vti_bin/`, `/_catalogs/`). La consulta web de RNC no se lee (§5.11).
- **Cobertura**: según `meta.json`, padrón de 791,384 contribuyentes; 137,817 proveedores en la tabla, 81,092 con documento de 9 dígitos y 80,877 presentes en el padrón (las filas de los fragmentos; cada fragmento lleva su propia tabla de actividades y de estado|régimen). Los proveedores inscritos con cédula no se cruzan.

### 5.2 Finanzas públicas

#### SIGEF — ejecución presupuestaria ⚠️

- **Límite**: el año en curso tarda de 20 a 97 s por consulta y se sirve como instantánea. El 2026-09-29 la API respondió 403 de Cloudflare desde el entorno de construcción, también en `robots.txt` (Ray `a42e3ec13ca2b58e`).
- **Origen**: Ministerio de Hacienda, API de datos abiertos del SIGEF; es la API que arma el generador «Datos abiertos» del Portal de Transparencia Fiscal.
- **Dirección**: `https://api-sigef.hacienda.gob.do/servicios/datosabiertos/portaltransparencia/{tipo}/{archivo}/{año}/{mes}/{formato}?seccion={sección}&capitulo={capítulo}`. `scripts/build-fiscal.py` pide `gastos/institucion/{año}/{mes}/json?seccion={11111|11112|11113}&capitulo=` (vacío: la sección entera); `scripts/build-subsidio.py` pide `gastos/transferencias` (ficha de abajo). Otros archivos que la API sirve sin uso en el código (2026-09-01): `ingresos/percibidosinstitucion`, `ingresos/ftefinanc`, y en `gastos` `concepto`, `finalidad`, `inversion`, `fuentefinanciamiento`, `organismofinanciador`, `aplicacionesfinancieras`, `institucionalconcepto`, `institucionalfinalidad`; formatos `json`, `csv` y `xlsx`.
- **Método y formato**: GET sin clave ni sesión; arreglo JSON de filas servido con `content-type: application/csv`. Campos leídos: `CODIGO CAPITULO`, `NOMBRE CAPITULO`, `PRESUPUESTO INICIAL`, `PRESUPUESTO VIGENTE`, `COMPROMISO`, `DEVENGADO`, `PAGADO`, `MES DEVENGADO`, `NOMBRE UNIDAD EJECUTORA`.
- **Semántica**: `PRESUPUESTO INICIAL` aparece solo en el mes 1; `PRESUPUESTO VIGENTE` es un delta mensual (el mes 1 trae la apertura y los demás las modificaciones con signo), y el vigente es la suma del año; `DEVENGADO` y `PAGADO` son flujos mensuales. La ejecución es devengado ÷ vigente.
- **Acotación**: tres peticiones, una por sección institucional, con espera de 420 s y sin reintento; una sección que no responde se salta, y si no responde ninguna el script no escribe. El mes de la URL es el mes en curso para el año vigente y 12 para un año cerrado. Por capítulo se guardan los meses y las 6 unidades ejecutoras con más devengado.
- **Código**: `scripts/build-fiscal.py` → `public/data/fiscal.json` → `lib/fiscal.ts` (`getFiscal`, `getInstitucionFiscal`, `getResumenFiscal`, `etiquetaCorte`), memoizado en el proceso.
- **Lectura**: instantánea. `fiscal.json`: `generadoEn` 2026-09-01T22:52:23+00:00, `anio` 2026, `mesCorte` 9; `getFiscal` toma como corte el último mes con devengado mayor que cero, agosto de 2026 (septiembre trae filas en cero).
- **Observado**: 2026-09-01: 22 s, 23 s y 86 s por institución según el corte; una sección sin `capitulo` no respondió en 40 s en el reconocimiento y tardó ~97 s al generar la instantánea; un año cerrado responde en 0.4 s; una ruta inexistente da 404 en JSON. 2026-09-29: el 403 del límite.
- **Cobertura**: 102 capítulos del Presupuesto General del Estado (34 de administración central, 60 descentralizadas y autónomas no financieras, 8 de seguridad social); gasto, no ingresos. Sin gobiernos locales ni empresas públicas financieras.

#### Portal de Transparencia Fiscal — catálogo de capítulos ✅

- **Origen**: Ministerio de Hacienda, formulario «Datos abiertos» del Portal de Transparencia Fiscal (`www.transparenciafiscal.gob.do`, WordPress; su `robots.txt` veta solo `/wp-admin/`, 2026-08-31).
- **Código**: `lib/capitulos.ts`: `CAPITULOS` (104 códigos: 34 de la sección `11111`, 61 de `11112`, 9 de `11113`, del `0101` Senado al `5211` TSS, con `0998` y `0999` de deuda pública y obligaciones del Tesoro; nombres como los escribe Hacienda), `SECCIONES_INSTITUCIONALES`, `capitulo(codigo)` y `titulizar` (caja de lectura que conserva las siglas entre paréntesis). Lo usan `lib/fiscal.ts`, `app/finanzas/page.tsx`, `app/proveedores/page.tsx` y `app/proveedores/[rpe]/page.tsx`.
- **Lectura**: datos escritos en el código; no se leen en ejecución.
- **Observado**: el bloque de capítulos del formulario mide 86 KB (2026-09-01). Frente al Clasificador Institucional de DIGEPRES (§5.7), `CAPITULOS` tiene 13 códigos que el clasificador no trae y le faltan 9 (2026-09-29). Frente a `fiscal.json`: 11 códigos de `CAPITULOS` no aparecen (`0220`, `5103`, `5108`, `5114`, `5126`, `5127`, `5145`, `5164`, `5167`, `5170`, `5201`) y 9 de `fiscal.json` no están en `CAPITULOS` (`0224`, `5186`–`5191`, `5193`, `5194`).
- **Cobertura**: capítulos de las tres secciones institucionales del presupuesto.

#### SIGEF — subsidio eléctrico ⚠️

- **Límite**: el de la API del SIGEF (ficha de arriba); se sirve como instantánea.
- **Origen**: la misma API; transferencias del capítulo `0999` (Administración de Obligaciones del Tesoro Nacional) por institución receptora.
- **Dirección**: `https://api-sigef.hacienda.gob.do/servicios/datosabiertos/portaltransparencia/gastos/transferencias/{anio}/{mes}/json?seccion=11111&capitulo=0999` (`BASE` en `scripts/build-subsidio.py`).
- **Método y formato**: GET; arreglo JSON con `content-type: application/csv` (se valida que el cuerpo empiece por `[`). Campos: `NOMBRE INSTITUCION RECEPTORA`, `MES DEVENGADO`, `PRESUPUESTO VIGENTE` (delta mensual), `DEVENGADO`, `PAGADO`.
- **Acotación**: una petición por año desde `PRIMER_ANIO` = 2019 (mes 12 en años cerrados, el mes en curso en el vigente), 3 s entre años, espera de 240 s, un reintento tras 10 s. Se quedan las receptoras que casan con `ELECTRICAS` (EDENORTE, EDESUR, EDEESTE, ETED, EGEHID, CDEEE). No escribe si un año cerrado no trae transferencias eléctricas.
- **Código**: `scripts/build-subsidio.py` → `public/data/subsidio-electrico.json` → `lib/subsidio.ts` (`getSubsidioElectrico`); tarjeta de `/finanzas`.
- **Lectura**: instantánea, `generado` 2026-09-24; años 2019–2026, 2026 con `hastaMes` 9; `mensualActual` y `otrasReceptoras` (las 12 receptoras no eléctricas más frecuentes).
- **Observado**: 2026-09-24: ~60 filas por año; ~20 s por año cerrado; el año en curso puede pasar de un minuto. Receptoras eléctricas en el archivo: solo la CDEEE de 2019 a 2022; la CDEEE y las tres distribuidoras en 2023 y 2024; las distribuidoras y la ETED en 2025; las distribuidoras y EGEHID en 2026.
- **Cobertura**: valor devengado que el Tesoro transfiere por ese capítulo a las empresas eléctricas del Estado; no incluye el subsidio al GLP ni otras vías.

### 5.3 Deuda y dinero

#### Crédito Público — saldo de la deuda del SPNF ⚠️

- **Límite**: `lib/deuda.ts`, `lib/tenedores.ts`, `scripts/build-deuda.py` y `/fuentes` declaran que el servidor no responde al egreso de Vercel; la lectura en vivo cae entonces a la instantánea. Desde un entorno con egreso respondió el 2026-09-23 y el 2026-10-02.
- **Origen**: Dirección General de Crédito Público, Ministerio de Hacienda; estadísticas de deuda del Sector Público No Financiero (sitio ASP.NET MVC).
- **Dirección**: base `https://www.creditopublico.gob.do`; listado `/inicio/estadisticas` (`PAGINA`) y por año `/inicio/estadisticas?dlAnio=AAAA`; XLSX `/Content/estadisticas/anual/{año}/{NN}{Mes}/08Saldo Evolución Deuda del Sector Público No Financiero.xlsx`; histórico anual, el enlace del listado que contiene `/historico/saldo/01Saldo` («01Saldo Deuda Histórico (1970-2025).xlsx», 2026-09-23).
- **Método y formato**: GET. Listado `text/html` con enlaces `href="/Content/estadisticas/….xlsx"` (entidades HTML decodificadas); XLSX (`spreadsheetml` u `octet-stream`, firma `PK`), leído con `lib/xlsx.ts`. La hoja trae dos columnas «Saldo» (apertura al 31 de diciembre anterior y cierre del período), cada una con su fecha como serie de Excel en la fila de debajo; `parsearSaldo` toma la de fecha mayor y lee «Deuda Pública Total», «Deuda Externa Total» y «Deuda Interna Total» (etiqueta en la columna B desde 2020, en la C en años anteriores). Millones de US$.
- **Acotación**: `getDeudaEnVivo` toma los enlaces «Saldo Evolución» del listado, los ordena por el año y el mes de la ruta y prueba los 3 más recientes. `scripts/build-deuda.py` recorre los listados desde `PRIMER_ANIO` = 2015, con espera de 40 s.
- **Código**: `lib/deuda.ts` (`getDeuda`, `getSerieDeuda`, `parsearSaldo`, `periodoDeFecha`); `scripts/build-deuda.py` → `public/data/deuda.json`.
- **Lectura**: en vivo con `revalidate` 21,600 s y, si no responde, la instantánea (`desdeInstantanea: true`). La serie sale siempre de la instantánea; un saldo en vivo posterior al último cierre se añade al final. `deuda.json`: `generadoEn` 2026-09-23, saldo `Jul-26` (2026-07-31) de US$67,827.83 millones; `serie`, 44 cierres del 2015-12-31 al 2026-07-31; `anual`, 26 cierres (2000–2025) con % del PIB.
- **Observado**: 2026-09-23: una ruta inexistente responde 200 con una página HTML de 32 KB; el listado por año se lee por GET con `dlAnio` (el formulario de la página es POST); de cada año cerrado quedan publicados diciembre y los tres trimestres, y del año en curso los dos últimos meses y los trimestres; el número de la carpeta del mes cambia entre años (`14Al 30 de Junio` en 2021, `16Al 30 de Junio` en 2016); «Saldo Evolución» aparece desde 2015; varias celdas son fórmulas compartidas (`<f t="shared" …/>`) con su valor en `<v>`. El `robots.txt` responde 404 (2026-09-24).
- **Cobertura**: deuda del SPNF (total, externa, interna): cierres trimestrales desde 2015 y anuales desde 2000. Los meses intermedios de años pasados no están publicados.

#### Crédito Público — subastas de bonos en pesos ⚠️

- **Límite**: el mismo servidor que la ficha anterior; solo instantánea.
- **Origen**: Dirección General de Crédito Público, resultados de las subastas de bonos del Ministerio de Hacienda y Economía.
- **Dirección**: listado `/emisiones/subastas?dlAnio=AAAA&tipocontenido=Resultados`; consolidado del año, del bloque «Consolidado» de ese listado: `/Content/subastas/consolidados/2026/02Consolidado.xlsx` y `/Content/subastas/consolidados/2025/02Consolidado.xls`.
- **Método y formato**: GET. HTML; XLSX (firma `PK`) o `.xls` BIFF (firma `D0CF11E0`, leído con `xlrd` 2.x, dependencia de build que la app no importa). Una hoja con cabecera en la fila de «Fecha Subasta»: Subasta | Fecha Subasta | Fecha Vencimiento | Subastado | Demandado | Bid to Cover Ratio | Adjudicado | Tasa de Corte; montos en pesos y tasa en fracción.
- **Acotación**: `ANIOS` = (2025, 2026); espera de 25 s y un reintento. No escribe si una tasa sale de 2–25 %, hay montos no positivos, un adjudicado mayor que lo demandado, fechas fuera del año del archivo, un año sin filas o filas que no suman la fila de totales del archivo.
- **Código**: `scripts/build-subastas.py` → `public/data/subastas.json` → `lib/subastas.ts` (`getSubastas`, `vecesCubierta`); `/deuda` y `/dinero/bonos`.
- **Lectura**: instantánea, `generado` 2026-09-24: 9 filas del 2025-07-01 al 2026-09-09, 2 con `alerta`. Archivo 2025 publicado el 2025-07-01 (RD$20,000 millones adjudicados); archivo 2026 publicado el 2026-09-10 (RD$200,000 millones adjudicados sobre RD$450,160.6 millones demandados); los dos con `restanteCuadra: true`.
- **Observado**: 2026-09-24: el selector de años llega a 2009; hay un solo consolidado por año, que se reescribe tras cada subasta, y la extensión cambia de un año a otro; la columna «Subasta» va solo en la primera fila de cada bono («MH1-2041», monto de emisión y cupón) y se propaga hacia abajo; cada subasta competitiva va seguida de una segunda ronda no competitiva (demandado = subastado, misma tasa); las fechas mezclan serie de Excel y texto. Las filas del 8 y el 9 de septiembre de 2026 traen 11/09/2026 (la fecha de liquidación del resultado en PDF) en la columna de vencimiento, que el PDF da como 29-may-2041: se marcan con `alerta` y su plazo queda `null`.
- **Cobertura**: subastas de bonos internos en pesos de 2025 y 2026.

#### Crédito Público — tenedores de bonos internos y acreedores ⚠️

- **Límite**: el mismo servidor; solo instantánea.
- **Origen**: Dirección General de Crédito Público; relación de tenedores (con el registro del depósito de valores CEVALDOM) y saldo de la deuda por acreedor.
- **Dirección**: `/emisiones/interna` (HTML) → `/Content/emisiones_de_titulos/internas/emisiones/01Relación de Tenedores de Bonos Internos Emitidos por el Sector Públic.xlsx` (el nombre va cortado en el origen); `/inicio/estadisticas?dlAnio=AAAA` → `/Content/estadisticas/anual/{año}/{NN}{Mes}/09Saldo Deuda Histórico Sector Público No Financiero por Acreedor.xlsx`.
- **Método y formato**: GET; XLSX (`spreadsheetml` u `octet-stream`, firma `PK`), leído con la biblioteca estándar de Python. Tenedores: hoja «Tenedores Domésticos», millones de RD$, un mes por columna; filas TOTAL, «Residencia Doméstica» y «Residencia Extranjera», cada una con «Personas Físicas» y «Personas Jurídicas» y, bajo las jurídicas, el tipo de tenedor; las etiquetas se repiten entre residencias y se leen por bloque. Acreedores: millones de US$ y %, cuatro cierres de año y el corte del año en curso; externa por organismo, país y tipo de acreedor privado; interna por instrumento.
- **Acotación**: espera de 25 s y un reintento. El archivo de acreedores se elige por el corte más reciente que dice su cabecera, no por su carpeta. No escribe si las partes no suman sus totales (residencias contra TOTAL y tipos contra jurídicas en cada mes; cada subtotal de acreedores), si aparece una etiqueta que la agrupación no conoce o si falta un bloque.
- **Código**: `scripts/build-tenedores.py` → `public/data/tenedores.json` → `lib/tenedores.ts` (`getTenedores`, `GRUPOS`: ocho familias de tenedores definidas por la plataforma, `repartoDelMes`, `serieDeGrupo`, `nombreCorte`); `/dinero/bonos`.
- **Lectura**: instantánea, `generado` 2026-10-02. Tenedores: 188 meses (2011-01 a 2026-08), «Cifras actualizadas en septiembre 2026.», TOTAL de agosto de 2026 RD$1,143,391.9 millones; `reclasificaciones` 2011-10, 2023-02, 2024-04 y 2025-11; `descuadres` de 2016-07 y 2018-08, publicados tal cual. Acreedores: archivo de `…/anual/2026/09Agosto/`, cortes 2022, 2023, 2024, 2025 y «Ago. 26*» (preliminar), con un total de US$67,649.69 millones en el último.
- **Observado**: 2026-10-02: tenedores, 120 KB; acreedores, 43 KB; el % de la deuda interna va sobre la interna, no sobre el total; el corte de marzo de 2026 rotula la cabecera de otra forma y el script lo salta. En `/emisiones/interna` responde también `02Situación de Bonos Internos…xlsx` (79 KB), sin uso.
- **Cobertura**: bonos internos de Hacienda (subastas y leyes de emisión) por tipo de tenedor, no por nombre. Los tenedores de los bonos globales y de los títulos del BCRD no figuran en lo publicado (2026-10-02).

#### Banco Central — CDN de estadísticas ✅

- **Origen**: Banco Central de la República Dominicana (BCRD), archivos estadísticos de su CDN.
- **Dirección**: `https://cdn.bancentral.gov.do/documents/estadisticas/{sección}/documents/{ARCHIVO}`, con secciones `mercado-cambiario`, `precios`, `sector-real`, `sector-externo`, `sector-fiscal`, `sector-monetario-y-financiero`, `sector-turismo` y `mercado-de-trabajo`. Archivos que lee el código:

  | Archivo | Lector | Ventana |
  |---|---|---|
  | `mercado-cambiario/documents/TASA_DOLAR_REFERENCIA_MC.xlsx` | `lib/tasa.ts` (§5.4) | `unstable_cache` 3600 s |
  | `sector-externo/documents/Remesas_6.xlsx` | `lib/macro.ts` (§5.4) | `revalidate` 86,400 s |
  | `sector-externo/documents/reservas_internacionales.xlsx` | `lib/macro.ts` | `revalidate` 86,400 s |
  | `sector-monetario-y-financiero/documents/tbm_activad.xlsx` | `lib/macro.ts`; `lib/banco-central.ts` | `revalidate` 21,600 s; `unstable_cache` 21,600 s |
  | `sector-monetario-y-financiero/documents/tbm_pasivad.xlsx` | `lib/banco-central.ts` | `unstable_cache` 21,600 s |
  | `sector-monetario-y-financiero/documents/Serie_TPM.xlsx` | `lib/banco-central.ts` | `unstable_cache` 21,600 s |
  | `sector-monetario-y-financiero/documents/serie_indicadores_bcrd.xlsx` | `lib/banco-central.ts` | `unstable_cache` 86,400 s |
  | `sector-monetario-y-financiero/documents/operaciones_monetarias.xlsx` | `lib/banco-central.ts` | `unstable_cache` 21,600 s |
  | `precios/documents/ipc_base_2019-2020.xls` | `scripts/build-bcrd.py` (§5.4) | instantánea |
  | `sector-turismo/documents/lleg_total.xls` | `scripts/build-bcrd.py` | instantánea |

- **Método y formato**: GET. XLSX (`octet-stream`, `spreadsheetml` o `excel`, firma `PK`) leído con `lib/xlsx.ts`; `.xls` BIFF leído con `xlrd` en build. Toda dirección lleva la fecha del día como consulta: `delDiaBcrd` (`lib/pedir.ts`) añade `?d=AAAA-MM-DD` con la fecha de Santo Domingo, y `scripts/build-bcrd.py` añade la fecha del día de la máquina.
- **Acotación**: `lib/banco-central.ts` y `lib/tasa.ts` descargan con `cache: "no-store"` y guardan el resultado ya leído con `unstable_cache` (claves `banco-central-{nombre}-v2` y `tasa-bcrd-v3`); un fallo lanza `SinDato` o `SinTasa` y no se guarda. Cada pieza se degrada sola a `null`. Las columnas de las tasas se leen por posición y se comprueban contra su rótulo.
- **Código** (`lib/banco-central.ts`; páginas `/dinero`, `/dinero/tasas`, `/dinero/banco-central`):
  - `getPoliticaMonetaria`: `Serie_TPM.xlsx`, hoja «Tasas»: Año (solo en enero) | Mes | TPM | facilidad de depósito | de préstamo | Lombarda, en fracción, desde 2004; la serie se pinta desde `INICIO_TPM` = 2013-02 (nota 1 del archivo: desde febrero de 2013 la TPM es indicativa y las facilidades son TPM ± un margen).
  - `getTasasActivas` y `getTasasPasivas`: `tbm_activad.xlsx` y `tbm_pasivad.xlsx`, tasas en pesos de los bancos múltiples, % nominal anual, desde 2017; la pasiva trae la tasa interbancaria en la columna O.
  - `getBalanceBcrd`: `serie_indicadores_bcrd.xlsx`, balance armonizado en formato ancho, un mes por columna desde enero de 1996 (serie de Excel hasta 2012, texto después: «abr-13», «sept.-25», «ago.-26*») y una última columna parcial de un día («25-sept.-26*»); millones de RD$ y reservas en millones de US$; «n.d.» es sin dato.
  - `getOperacionesMonetarias`: `operaciones_monetarias.xlsx`, contracción (depósitos remunerados de corto plazo y letras a un día) y expansión (repos) en millones de RD$, mensual hasta 2013 y diario después; se leen los últimos `DIAS_OPERACIONES` = 90 días hábiles.
- **Lectura**: en vivo.
- **Observado**:
  - Los nombres de archivo se toman del paquete R abierto `databcrd`. Las páginas de sección del sitio (`/a/d/2534-precios`, `/a/d/2538-mercado-cambiario`) montan la lista de archivos por JavaScript y el HTML servido no la contiene; cuatro nombres adivinados dieron 404 (2026-09-01).
  - 2026-10-02: el CDN guarda una copia por codificación y no las renueva a la vez. `Serie_TPM.xlsx` llegaba con `last-modified` del 1 de octubre sin compresión o con `br`, y del 1 de septiembre con `gzip`, que es lo que pide `fetch` en Node; `reservas_internacionales.xlsx`, igual; con la tasa del dólar la copia `gzip` era la más nueva. `Cache-Control: no-cache` no cambia la copia servida; una consulta nueva (`?d=2026-10-02`) da `TCP_MISS` y trae la vigente, y la siguiente con la misma consulta ya es `TCP_HIT`.
  - 2026-10-02: `Serie_TPM.xlsx` 37 KB, `tbm_pasivad.xlsx` 150 KB, `serie_indicadores_bcrd.xlsx` 217 KB, `operaciones_monetarias.xlsx` 401 KB, todos 200 `application/octet-stream` con firma `PK`. Las hojas de tasas traen una fila resumen por año («2025», «*2026 1/»), el año solo en la fila de enero («Enero 2026») y el mes en curso marcado («*Septiembre 2/») seguido de filas diarias. `operaciones_monetarias.xlsx` escribe la fecha a mano en varias formas («1-mayo-15», «06-noviembre-18.», «30-septiembre-26*», «02-sep-13») y algún día como serie de Excel. Responden y no se usan: `encaje_bancario.xlsx`, `Tasas_Interbancarias_Promedio_por_Plazos.xlsm` y `ti_reales.xls`.
  - `imae.xlsx` está congelado en octubre de 2024 (2026-09-24) y no se lee. La API `api.bancentral.gov.do` exige credenciales y no se usa (§5.11).
- **Cobertura**: series publicadas como archivo con nombre conocido. Las tasas son solo las de los bancos múltiples.

### 5.4 Indicadores

#### MICM — precios de los combustibles ⚠️

- **Límite**: solo los precios de la portada; el aviso semanal completo no es legible por máquina.
- **Origen**: Ministerio de Industria, Comercio y Mipymes; portada de `micm.gob.do` (WordPress; `robots.txt` de Yoast con `Disallow:` vacío).
- **Dirección**: `https://micm.gob.do/` (`URL_MICM`).
- **Método y formato**: GET `text/html`. Cada precio va como `$350.10<br><p>Nombre</p>`; la vigencia, en la frase «semana del … AAAA».
- **Acotación**: expresión regular sobre la portada; se deduplica por nombre (el bloque se repite en la versión para teléfono); con menos de cuatro precios devuelve `null`. Unidad «galón» solo para gasolinas y gasoil; el GLP y el gas natural van sin unidad.
- **Código**: `lib/combustibles.ts` (`getCombustibles`).
- **Lectura**: en vivo, `revalidate` 3600 s.
- **Observado**: 2026-09-23: portada 200 `text/html`, 934 KB en 1.5 s, con seis precios (Gasolina Premium, Gasolina Regular, Gasoil Óptimo, Gasoil Regular, GLP y Gas Natural GNL-GNC) y la vigencia «semana del 19 a 25 de septiembre del 2026»; el `<p>` del GLP no se cierra; la portada no escribe unidades. `combustibles.micm.gob.do` está parado en la semana del 27-sep-2025 (2026-09-23). El aviso semanal (`post_combustibles`) tiene el cuerpo vacío en HTML y en su RSS, y el `wp-json` está deshabilitado (2026-09-01).
- **Cobertura**: seis productos; sin kerosene ni fuel oil.

#### Banco Central — tasa de cambio de referencia ✅

- **Origen**: BCRD, tasa del dólar del mercado spot (CDN, §5.3).
- **Dirección**: `https://cdn.bancentral.gov.do/documents/estadisticas/mercado-cambiario/documents/TASA_DOLAR_REFERENCIA_MC.xlsx` (`URL_TASA`), con `delDiaBcrd`.
- **Método y formato**: GET XLSX, firma `PK`; hoja «Diaria»: Año | Mes («Ene»…) | Día | Compra | Venta, desde 1991.
- **Acotación**: la hoja entera; devuelve el último día y el día hábil más cercano a 30 días antes.
- **Código**: `lib/tasa.ts` (`getTasa`).
- **Lectura**: en vivo; descarga `no-store` y resultado en `unstable_cache` de 3600 s (`tasa-bcrd-v3`).
- **Observado**: 2026-09-23: 200 `application/octet-stream`, 357 KB, `last-modified` del día hábil anterior, 8,967 filas desde el 2-ene-1991. El `.xls` del mismo nombre responde 200 (915 KB, OLE2/BIFF) con `last-modified` 19-jul-2022.
- **Cobertura**: compra y venta de cada día hábil.

#### Banco Central — remesas, reservas y tasa activa ✅

- **Origen**: BCRD, archivos del CDN (§5.3).
- **Dirección**: `sector-externo/documents/Remesas_6.xlsx` (`URL_REMESAS`), `sector-externo/documents/reservas_internacionales.xlsx` (`URL_RESERVAS`) y `sector-monetario-y-financiero/documents/tbm_activad.xlsx` (`URL_TASA_ACTIVA`), con `delDiaBcrd`.
- **Método y formato**: GET XLSX, firma `PK`. Remesas: hoja «Total», un año por columna desde 2010, una fila por mes y la fila TOTAL. Reservas: hoja «Reservas Mensuales», millones de US$, un bloque de columnas por año desde 1985 con un número de columnas que cambia entre años; se toma la subetiqueta «BRUTAS». Tasa activa: hoja «Activas», columna I (promedio ponderado).
- **Acotación**: el último mes; remesas y reservas contra el mismo mes del año anterior, la tasa contra el mes anterior; el mes en curso de la tasa va aparte (`parcial`). Cada indicador se degrada solo a `null`.
- **Código**: `lib/macro.ts` (`getMacro`, `parsearRemesas`, `parsearReservas`, `parsearTasaActiva`).
- **Lectura**: en vivo, caché de `fetch`: `revalidate` 86,400 s para remesas y reservas y 21,600 s para la tasa activa.
- **Observado**: 2026-09-24: remesas ~18 KB, reservas ~52 KB, tasa activa ~40 KB. El título de remesas dice «MILLONES DE US$» y las celdas vienen en dólares (agosto de 2026: 1,116,267,570.98); `parsearRemesas` divide entre un millón los valores de más de 100,000. En la tasa activa, «Enero 2022» aparece dos veces (la primera vacía). La marca de cifras preliminares («2024-2026 : Cifras Preliminares») se lee del archivo.
- **Cobertura**: remesas recibidas, reservas internacionales brutas y tasa activa ponderada de los bancos múltiples, mensuales.

#### Banco Central — inflación y llegadas por vía aérea ✅

- **Origen**: BCRD, archivos BIFF del CDN (§5.3).
- **Dirección**: `https://cdn.bancentral.gov.do/documents/estadisticas/precios/documents/ipc_base_2019-2020.xls` (`URL_IPC`) y `…/sector-turismo/documents/lleg_total.xls` (`URL_LLEGADAS`), con `?d=` y la fecha del día.
- **Método y formato**: GET; `.xls` BIFF (`octet-stream` o `ms-excel`, firma `D0CF11E0`), leído con `xlrd` 2.x. IPC: hoja «IPC base 2019-2020», serie empalmada desde 1984 con base oct-2019–sep-2020 = 100; columnas año, mes, índice, variación mensual, acumulada, interanual y promedio de 12 meses. Llegadas: hojas de no residentes (1978–), residentes (1993–), «Llegada total 93-26» y resumen anual.
- **Acotación**: los últimos `N` = 36 meses; espera de 40 s y un reintento. No escribe si la inflación sale de −10..50 %, hay llegadas ≤ 0, menos de 36 meses, o el total no cuadra con residentes más no residentes.
- **Código**: `scripts/build-bcrd.py` → `public/data/bcrd.json` → `lib/bcrd.ts` (`getBcrd`, `mesEnPalabras`, `mesCorto`, `mismoMesAnterior`).
- **Lectura**: instantánea, `generado` 2026-10-02; IPC y llegadas con corte 2026-08 (serie de 2023-09 a 2026-08); IPC de agosto de 2026: 140.7598, +5.13 % interanual.
- **Observado**: 2026-09-24: IPC ~115 KB, llegadas ~800 KB. El total de llegadas viene como entero con ruido de coma flotante (945865.9999999956); el reparto entre residentes y no residentes trae decimales desde 1987 y es una estimación del BCRD; `estimado` marca solo el mes cuyo total trae decimales reales. «*» = cifras sujetas a rectificación.
- **Cobertura**: IPC nacional; pasajeros que llegan por vía aérea, residentes incluidos, sin cruceristas.

#### Superintendencia de Bancos — SIMBAD ✅

- **Origen**: Superintendencia de Bancos (SB), tablero público SIMBAD (Apache Superset) en `simbad.sb.gob.do`.
- **Dirección**: `https://simbad.sb.gob.do/api/v1/chart/{id}/data/?format=json&type=results`, con los ids 1467 (morosidad, %), 1466 (saldo de la cartera de créditos, millones de RD$), 1464 (índice de solvencia, %) y 1423 (tasa activa promedio de los créditos nuevos, %).
- **Método y formato**: GET `application/json` con `Accept: application/json`: `{ result: [{ colnames, coltypes, data }] }`, con `data` = `[{ __timestamp: <ms UTC del día 1 del mes>, <métrica>: n }]`; validado con `zod` (`TARJETA`).
- **Acotación**: solo esos cuatro endpoints de datos, con `type=results`; la ventana de 24 meses la calcula SIMBAD. Cada indicador tiene un rango de plausibilidad y se compara con el mismo mes del año anterior si la ventana lo trae.
- **Código**: `lib/banca.ts` (`getBanca`).
- **Lectura**: en vivo, `revalidate` 86,400 s.
- **Observado**: 2026-09-24: `robots.txt` 404; respuestas de ~1–3 KB con 20–23 filas por serie; cada serie termina en su propio mes (morosidad y cartera en julio de 2026, solvencia en mayo); la 1423 tiene la ventana fija hasta el 2026-08-05.
- **Cobertura**: agregados del sistema financiero; el tablero público no trae depósitos. Las entidades supervisadas están en §5.7.

#### Aduanas — comercio exterior y recaudación ✅

- **Origen**: Dirección General de Aduanas (DGA), «Series de tiempo» de su sitio (Umbraco).
- **Dirección**: índice `https://www.aduanas.gob.do/umbraco/api/searcher/getpageofdocuments?id=3442` (`URL_INDICE_ADUANAS`; es la llamada del buscador de `/estadisticas/series-de-tiempo/`); archivos `https://www.aduanas.gob.do/media/{hash}/….xlsx` tomados del índice.
- **Método y formato**: GET. Índice JSON: arreglo de categorías con `categoryName` y `documents` (`documentName`, `documentFile`, `documentDateTime`), validado con `zod`. Archivos XLSX (firma `PK`) en formato ancho: una fila de años (uno por bloque de columnas), la fila de meses, una fila `Total`/`TOTAL` en la columna A y una columna de total del año al cierre de cada bloque.
- **Acotación**: de cada categoría, un archivo: «Importaciones Por Régimen» (hoja «Imp FOB por Régimen»), «Exportaciones por régimen» («Exp por regimen») y «Recaudaciones mensuales» («Mensual»); si casan varios, el de `documentDateTime` más reciente; solo rutas `/media/….xlsx`. El acumulado del año se suma del archivo y se cruza con su columna de total (tolerancia 0.1 %); si no cuadra, `null`. Un valor fuera del rango plausible de un mes queda en `null`.
- **Código**: `lib/aduanas.ts` (`getComercioExterior`, `elegirDocumento`, `parsearHojaAduanas`).
- **Lectura**: en vivo, `revalidate` 86,400 s para el índice y los archivos.
- **Observado**: 2026-09-24: índice ~10 KB con 8 archivos de importaciones, 5 de exportaciones y 7 de recaudación; los tres archivos usados miden 49, 48 y 135 KB; las rutas `/media/{hash}` cambian en cada publicación; los títulos dicen «millones» de dólares o de pesos y las celdas vienen en unidades (agosto de 2026: 2778371797.42 = US$2,778.4 millones); todo se publica como preliminar; la recaudación conserva cortes viejos congelados a diciembre, y hay cortes con la extensión truncada (`…-v2.x`). Sin `robots.txt` (404, 2026-08-31).
- **Cobertura**: importaciones y exportaciones FOB en dólares y recaudación del «Fondo 100» en pesos, mes a mes; cifras preliminares de la DGA, no la balanza comercial del BCRD.

#### Organismo Coordinador — generación eléctrica ✅

- **Origen**: Organismo Coordinador del Sistema Eléctrico Nacional Interconectado (OC), servicio JSON de los gráficos de su portada.
- **Dirección**: `https://apps.oc.org.do/wsOCWebsiteChart/Service.asmx/GetGeneracionReprogramadaJSon?Fecha=MM/DD/YYYY` y `…/GetCentralMarginalPonderadaJSon?Fecha=MM/DD/YYYY`.
- **Método y formato**: GET `application/json`, validado con `zod` y fila por fila con `filas` (`lib/pedir.ts`). `GetGeneracionReprogramada`: `PERIODO`, `PROGRAMADO`, `GENERACION` (y `DESVIACION`) en MW medios por hora. `GetCentralMarginalPonderada`: `PERIODO`, `CENTRAL`.
- **Acotación**: el día de ayer en Santo Domingo; sin las 24 horas de generación devuelve `null`; las horas con «DESABASTECIMIENTO» como central marginal se cuentan sobre los períodos que el servicio declara.
- **Código**: `lib/energia.ts` (`getDiaElectrico`).
- **Lectura**: en vivo, `revalidate` 3600 s.
- **Observado**: 2026-09-24: el servicio responde también días pasados; la marginal a veces trae menos de 24 períodos y a veces «P-7» en lugar de una planta. El `robots.txt` de `www.oc.org.do` veta `/Portals/`; el host `apps.oc.org.do` no tiene esa regla.
- **Cobertura**: generación real y programada del sistema interconectado y horas de desabastecimiento registradas, de un día cerrado.

#### Edenorte y Edesur — mantenimientos programados ✅

- **Origen**: distribuidoras de electricidad Edenorte (WordPress) y Edesur (Umbraco).
- **Dirección**: `https://edenorte.com.do/category/programa-de-mantenimiento-de-redes/feed/` (`URL_EDENORTE_FEED`) y `https://edesur.com.do/enlaces-empresa/mantenimientos-programados/` (`URL_EDESUR`). De Edeeste solo se enlaza su página de PDF semanal (`URL_EDEESTE`).
- **Método y formato**: GET. Edenorte: RSS (se valida `xml`); cada entrada trae en `content:encoded` una tabla Municipio | Circuito | Fecha (`D/M/AAAA`) | Periodo (12 horas, «9:00 a. m. a 12:00 p. m.», pasado a `HH:MM`) | Zonas Afectadas | Causa. Edesur: `text/html` con siete pestañas por día (`#pills-<uuid>-tab` con la fecha), provincia en `<h4>`, ventana en `h5.title-zona` y sectores en `<p>`; el bloque `.no-activity` («No hay trabajos de mantenimiento programados para…») es un día sin trabajos.
- **Acotación**: Edenorte, las `TOPE_ENTRADAS` = 2 entradas más recientes del feed; Edesur, la página tal como se sirve (la semana sábado–viernes en curso). Solo filas con fecha de hoy o posterior (día de Santo Domingo). Cada empresa se degrada sola a `null`.
- **Código**: `lib/cortes.ts` (`getCortes`); página `/luz`.
- **Lectura**: en vivo, `revalidate` 21,600 s.
- **Observado**: 2026-09-24: el feed de Edenorte mide ~530 KB, trae 10 entradas y 140–240 filas por semana, y su entrada más reciente era la semana del 12 al 18 de septiembre; la REST de WordPress responde 401 (`/wp-json/wp/v2/posts`). La página de Edesur mide ~145 KB y tenía 59 ventanas en 12 provincias la semana del 19 al 25 de septiembre. Los `robots.txt` de los dos hosts permiten `/`.
- **Cobertura**: Edenorte da municipio, circuito y causa, sin provincia; Edesur da provincia, horario y sectores, sin circuito, municipio ni causa. Las averías y los apagones por falta de generación no se anuncian.

#### INDOMET — alertas meteorológicas ✅

- **Origen**: Instituto Dominicano de Meteorología, alertas en CAP 1.2 publicadas en dominio público en el repositorio de fuentes CAP (S3).
- **Dirección**: `https://cap-sources.s3.amazonaws.com/do-indomet-es/rss.xml` (`URL_RSS`); cada `<item><link>` bajo `https://cap-sources.s3.amazonaws.com/do-indomet-es/` (`PREFIJO`) es el XML de una alerta.
- **Método y formato**: GET XML; de cada alerta se leen `cap:identifier`, `headline`, `event`, `severity`, `description`, `instruction`, `areaDesc`, `sent`, `onset`, `expires`, `msgType` y `status`.
- **Acotación**: a lo sumo `TOPE` = 20 alertas del índice. Vigente = `status` «Actual», `msgType` distinto de «Cancel» y `expires` futuro; de una misma cabecera y zona queda la emisión más reciente.
- **Código**: `lib/alertas.ts` (`getAlertas`).
- **Lectura**: en vivo; índice con `revalidate` 900 s y cada alerta con 86,400 s.
- **Observado**: 2026-09-24: el índice responde 200 `text/xml` con 20 ítems y `copyright: public domain`; cada alerta, `application/xml`.
- **Cobertura**: alertas emitidas, no el pronóstico.

#### INTRANT — OPSEVI, muertes en las vías ✅

- **Origen**: Instituto Nacional de Tránsito y Transporte Terrestre, Observatorio Permanente de Seguridad Vial (`opsevi.intrant.gob.do`, Next.js, sin `robots.txt`); API JSON interna, sin clave ni documentación, que llama su propio tablero.
- **Dirección**: `https://opsevi.intrant.gob.do/api` con `/national?years=AAAA`, `/fatalities/provinces?year=AAAA` y `/summary?years=AAAA`.
- **Método y formato**: GET `application/json`, validado con `zod`. `/national`: `monthly` [{`month`, `fatalities`}], con los meses sin orden y con mayúsculas al azar, y `vehicle-types` [{`vehicleType`, `fatalities`}]; `/fatalities/provinces`: [{`provinceName`, `deaths`}]; `/summary`: `fatalities`, `injuries`, `population`.
- **Acotación**: cuatro peticiones por lectura (`national` del año y del anterior, provincias y resumen). El mes en curso se descarta y el año se compara con los mismos meses cerrados del anterior.
- **Código**: `lib/siniestralidad.ts` (`getSiniestralidad`, `tramoDeMeses`).
- **Lectura**: en vivo, `revalidate` 86,400 s.
- **Observado**: mecánica verificada el 2026-09-24; las cifras del año son preliminares y se revisan.
- **Cobertura**: fallecidos por mes, por tipo de vehículo y por provincia; heridos y población del resumen.

### 5.5 Congreso Nacional

#### SIL de la Cámara de Diputados ✅

**Institución y servicio.** Cámara de Diputados, Sistema de Información
Legislativa. El portal «SIL Ciudadano» (`https://www.diputadosrd.gob.do/sil`) es
una SPA de Angular sobre ASP.NET e IIS 10 en Azure App Service (cookies
`ARRAffinity`); su HTML es un cascarón de 1.8 KB (2026-08-31) y todo entra por
XHR a una API JSON interna, sin token, cookie ni autenticación. No es una API documentada: las
rutas salen de los servicios de Angular del bundle `/sil/Script/Bundles`.
`www.diputadosrd.gob.do/robots.txt` → 404 (2026-08-31).

**URL base.** `https://www.diputadosrd.gob.do/sil/api` (`BASE` en
`lib/congreso.ts`). User-Agent
`Socratico-Inteligencia/1.0 (monitoreo legislativo; herramienta independiente)`.

**Rutas que usa el código** (todas GET; la ventana es el `revalidate` que pasa
cada función a `silFetch`):

| Ruta | Función | Ventana |
|---|---|---|
| `iniciativa/CountIniciativas` | `getCountIniciativas` | 3600 s |
| `iniciativa/getIniciativas?page=&keyword=` | `listIniciativas` | 300 s |
| ídem | `buscarIniciativas` | 3600 s por omisión; 300 s desde `buscarIniciativasTolerante`; 86400 s desde `proyectosDeNorma` |
| `iniciativa/iniciativas?page=&grupo=&tipo=&perimidas=&keyword=` | `listIniciativasFiltradas` | 300 s |
| `iniciativa/iniciativa/{id}` | `getIniciativa` | 300 s |
| `iniciativa/historicos?page=1&id=` | `getHistoricos`, `leerHistoricos` | 300 s |
| `iniciativa/proponentes?page=1&id=` | `getProponentes` | 300 s |
| `iniciativa/documentos?page=1&id=` | `getDocumentos` | 300 s |
| `iniciativa/Grupos` | `getGrupos` | 86400 s |
| `periodolegislativo/all` | `getPeriodos` | 86400 s |
| `comun/GetRutaDocumento/` | `getRutaDocumento` | 86400 s |
| `legislador/Provincias/1` | `getDirectorioLegisladores` | 86400 s |
| `legislador/legisladores?page=&nivel={demarcación}` | `getDirectorioLegisladores` | 86400 s |
| `legislador/legislador/{id}` | `getLegislador` | 86400 s |
| `legislador/Iniciativas?page=&legisladorId=&keyword=` | `getPropuestasDeLegislador` | 3600 s |
| `legislador/votaciones?page=&legisladorId=&keyword={legislatura}` | `getVotosDeLegislador` | 3600 s |
| `iniciativa/votaciones?page=&id=` | `getVotacionesDeIniciativa` | 3600 s |
| `votacion/votacion/{id}` | `getVotacion` | 86400 s |
| `votacion/iniciativas/?page=1&id=` | `getVotacion` | 86400 s |
| `votacion/legisladores/?page=&id=` | `getVotacion` | 86400 s |

`scripts/build-congreso.py` usa además `iniciativa/getIniciativas?page=N&keyword=&periodoId=P`.
Otras rutas del bundle respondieron JSON y el código no las usa:
`comision/comisiones?page=&keyword=`, `GruposParlamentarios/Index`,
`comun/GetRutaHost/`, `comun/GetRutaRendicion/` (2026-08-31). El único
endpoint de escritura, `suscriptor/suscribirse` (POST), no se llama.

**Método y formato.** `silFetch` lee por `pedirJsonOLanzar` (`lib/pedir.ts`,
§4): 25 s de espera, un reintento, `Accept: application/json` y `content-type`
exigido `application/json`. IIS enruta toda ruta desconocida bajo `/sil/` al
catch-all de la SPA, que responde **200 con el HTML del cascarón**
(2026-08-31; `periodolegislativo` sin `/all` cae ahí): el estado HTTP no
distingue una ruta inexistente, el `content-type` sí. Las rutas con `?page=` se
validan además con el esquema `PAGINA_SIL` (zod). `silFetchSafe` degrada a
`null`; `silFetchEstado` devuelve `"caida"` y las fichas distinguen
`"inexistente"` (tipo `Lectura<T>`). Concurrencia: lotes de `CONCURRENCIA = 4`.

**Paginación.** Envoltorio uniforme `{page, pageSize, total, results}`, con
`pageSize` fijo en 10 (`SIL_PAGE_SIZE`) y sin parámetro para cambiarlo. El
listado va de la pieza más reciente a la más antigua.

- `getIniciativas` sin `periodoId` responde el período vigente; con
  `periodoId=2760` (2020-2024) o `2761` (2024-2028) responde ese período. Es el
  parámetro que el interceptor HTTP del portal añade a toda petición
  (2026-09-27).
- `iniciativa/iniciativas` (2026-09-24): `tipo` es booleano (`true` = proyectos
  de ley, `false` = resoluciones internas y bicamerales; el `tipoId` numérico
  → 400); `perimidas=true` trae solo las perimidas y `false` todas las demás,
  sin valor para «ambas»; `grupo` es obligatorio (sin él → 404, vacío → 400,
  `0` o `-1` → 0 filas). Los 15 grupos × 2 tipos × 2 valores de `perimidas`
  sumaron 6,357, el `total` de `getIniciativas` ese día: el reparto es una
  partición.
- `keyword` hace match de subcadena sobre la descripción y sobre `numero`
  (`keyword=06099-2024-2028-CD` → esa pieza, 2026-09-23); no busca sobre
  `numPromulgacion` (`43-26` → 0). Distingue tildes y orden, no mayúsculas:
  «educación» → 254, «educacion» → 0; «medio ambiente» → 69, «ambiente
  medio» → 0 (2026-09-26).
- `buscarIniciativasTolerante` busca todas las palabras en cualquier orden,
  con o sin tilde, con tope por consulta: `MAX_PALABRAS_SIL = 3`,
  `MAX_SONDEOS_SIL = 12` primeras páginas entre las formas con tilde de cada
  palabra, `LIMITE_LECTURA = 300` filas leídas de la palabra menos frecuente
  para filtrar y paginar en casa; si esa palabra pasa del límite, sirve la
  frase exacta del SIL (`frase`), y si la lectura se corta lo declara
  (`truncado`). Medido: 5 peticiones para «educacion», 15 para «ambiente
  medio», 1 para una palabra de 200 letras (2026-09-26). `fraseParaSil` hace
  lo mismo para los listados por tema, que solo aceptan una frase.
- `listIniciativas` devuelve una página vacía, sin petición, si el texto lleva
  una cédula (`llevaCedula`).
- `muestrearIniciativas(n)` lee las `n` primeras páginas del listado vigente:
  la portada usa 10 (100 piezas) y `/congreso/perencion` 25 (250).

Censos observados: `CountIniciativas` → 6,225 y `getIniciativas?keyword=` →
`total` 6,222 el mismo día, diferencia sin explicar (2026-08-31); 6,357 en
2024-2028 y 11,500 en 2020-2024 (2026-09-27).

**Forma de una iniciativa** (`iniciativa/iniciativa/{id}` y filas del listado;
los campos que lee `SilIniciativa`):

| Campo | Contenido |
|---|---|
| `id` | Identificador interno; lo aceptan todas las rutas. Es la identidad |
| `numero` | `06225-2024-2028-CD`: secuencia, período de **registro**, cámara. Cita, no identidad (`parseNumero`) |
| `tipo`, `camaraInicio`, `origen` | «Proyecto de Ley», «Resolución Interna», «Resolución Bicameral»; cámara de origen |
| `descripcion` | Título; el reformulado va detrás del marcador `TÍTULO MODIFICADO:` (`separarTitulo`) |
| `condicion` / `estado` | Dos taxonomías con id propio que coexisten (`DEPOSITADO` / `Depositado`) |
| `legislatura` | `2026-SLO` (Segunda Legislatura Ordinaria) o `PLO` (Primera) |
| `fechaDeposito`, `periodoRegistro` | Fecha de origen y período del registro vigente: distintos |
| `numPromulgacion`, `fechaPromulgacion` | `Ley núm. 43-26` y su fecha, o `null` |
| `fechaUltimoCambioPrincipal` | Marca de tiempo del último cambio |
| `grupoId`, `grupo`, `materia` | Uno de los 15 temas de `iniciativa/Grupos`; materia en versales |

Los textos traen espacios dobles y sobrantes: `limpiarTexto` los colapsa y
quita cualquier cédula (`sinCedula`). La respuesta incluye un `creadorPor`
(GUID de un usuario interno) que el tipo no declara y no se usa.
`normalizarIniciativa` marca `promulgada` si hay número o fecha de promulgación
y deriva el tono de `tonoDeCondicion` (`lib/estados.ts`, §11): perimida →
`anulado`, aprobada o promulgada → `cumplido`, rechazada o retirada →
`contexto`, vigente o depositada → `accionable` (`viva`). `marcaDeIniciativa`
pinta una sola marca con el punto más avanzado; el literal del SIL va en el
`title`. Condiciones presentes en la instantánea: `APROBADO`, `VIGENTE`,
`PERIMIDO`, `RETIRADO`, `DEPOSITADO`, `FUSIONADO`,
`OBSERVADO POR EL PODER EJECUTIVO`.

**Trámites — `iniciativa/historicos`.** Filas `{id, estadoId, estado, inicio,
fin}`: intervalos de estado, sin cámara ni comisión. Se lee la primera página
(10 filas).

**Proponentes — `iniciativa/proponentes`.** `{principal, legisladorId, nombres,
apellidos, nombreCompleto, representacion{funcion, nivelRepresentacion,
provincia, partido{id, nombre, siglas}, ejercicio, inicio, fin, periodo}}`.
Las instituciones con iniciativa firman con un id de legislador (el Poder
Ejecutivo es `legisladorId` 1503, función «Institución del Estado»;
2026-09-23); la ficha solo enlaza a quien tiene función de diputado o senador.
Se lee la primera página.

**Documentos — `iniciativa/documentos`.** `{id, descripcion, extension,
cargado}`; `ruta` llega `null`. Todos `pdf`, append-only: cada versión es una
fila con su `id` y su fecha de carga. La etapa va en `descripcion` como texto
libre en versales, con espacios iniciales y el nombre de la comisión pegado;
`clasificarDocumento` la reduce a `deposito`, `modificacion` o `aprobado`
(con articulado, `texto: true`) y `informe`, `acuse`, `aviso` u `otro`. Traza
de la iniciativa 155693 (`03231-2024-2028-CD`): ocho documentos del
2024-09-12 al 2026-07-13, de «PROYECTO DEPOSITADO» a «MODIFICACIÓN 2» y
«PROYECTO APROBADO»; doce piezas muestreadas tenían entre 1 y 8 (2026-08-31).
Se lee la primera página. La URL de descarga es `getRutaDocumento()` + id
(`documentoUrl`); `comun/GetRutaDocumento/` devolvió
`https://s-sil.camaradediputados.gob.do:8095/ReportesGenerales/VerDocumento?documentoId=`,
distinta de la que trae fija el bundle
(`ssilappl.camaradediputados.gob.do/…/VerDocumento2`) (2026-08-31). Ese host
no se alcanza: ver la fuente siguiente.

**Legisladores.**

- `legislador/legisladores?nivel=` espera el **id de la demarcación**: el de
  una provincia (`legislador/Provincias/1` devuelve las 32, `{id,
  descripcion}`), `2892` para la lista nacional (`DEMARCACION_NACIONAL`) y
  `3403` para el exterior (`DEMARCACION_EXTERIOR`). `nivel` vacío o `null` →
  400; `nivel=1` → 0 filas. Barrido: 34 demarcaciones, 41 peticiones, 221
  personas sin duplicados, 189 diputados y 32 senadores: este SIL lista
  también a los senadores (2026-09-23). `keyword=a` declara 224, más que el
  censo por demarcaciones, sin explicar; no se usa como censo.
- `getDirectorioLegisladores` hace ese barrido en lotes de 4 y declara las
  demarcaciones que no contestaron (`fallidas`). `claveProvincia` reduce
  nombres de provincia a la grafía del SIL.
- `legislador/legislador/{id}`: `representacion`, `partido`, `profesion`;
  trae teléfono y correo institucional, que el tipo `SilLegislador` no
  declara y no se muestran. Un id inexistente → 200 con cuerpo `null`.
- `legislador/Iniciativas?legisladorId=`: 10 por página, de la más reciente a
  la más antigua, sin `tipo` (`tipoDesdeTitulo` lo deduce del título) ni
  `numPromulgacion`; su `principal` viene siempre `false` (2026-09-23).
  `getPropuestasDeLegislador` lee hasta `MAX_PAGINAS_PROPUESTAS = 20` páginas
  y declara `leidas < total`.

**Voto nominal.**

- `iniciativa/votaciones?id=`: votaciones del pleno en que se sometió una
  pieza, con `titulo` («Sesión 049, Votación 015»), `mocion`, `fecha`,
  `votos{cantidadVotosSi, cantidadVotosNo, cantidadVotosAbastencion}` y
  `asistencias{cantidadDelegados, cantidadPresentes}`; `cantidadAusentes`
  viene siempre 0 y no se lee (2026-09-23). `getVotacionesDeIniciativa` lee
  hasta 3 páginas.
- `votacion/votacion/{id}` añade `habilitados` (190), `tipo` («Electrónica»)
  y `estado` («Completa»); `votacion/iniciativas/?id=` da las piezas
  decididas en esa votación (a veces un grupo de diez resoluciones);
  `votacion/legisladores/?id=` da el voto de cada diputado, 190 filas en 19
  páginas. `getVotacion` hace 1 + 1 + 19 peticiones.
- Códigos de `votoId`: `SI`, `NO`, `AU` («Ausente para esta votación»), `SV`
  («No Voto»). En la votación 22636: 124 SI + 20 NO + 8 SV = 152
  `cantidadPresentes`, + 38 AU = 190; `SV` es presente que no votó. El código
  de la abstención no apareció en las muestras (2026-09-23); `sentidoDeVoto`
  la reconoce por `AB…` o por el texto. En estas filas `nombres` trae los
  apellidos y `apellidos` los nombres, en versales, y el partido es la
  etiqueta de bancada en esa votación.
- `legislador/votaciones?legisladorId=&keyword=`: sin `keyword` no sigue orden
  cronológico; `keyword` filtra sobre el número de sesión (`00008-2026-SLO`),
  así que el código de una legislatura da sus votaciones de la sesión más
  reciente hacia atrás; no busca en la moción; para un senador → 0
  (2026-09-23). `getVotosDeLegislador` pide la legislatura ordinaria más
  reciente ya abierta, cae a la anterior si no hay votaciones y lee hasta
  `MAX_PAGINAS_VOTOS = 3` páginas (30 votaciones).

**Instantánea.** `scripts/build-congreso.py` → `public/data/congreso.json`
(7,543,666 bytes; `generado` 2026-09-27T23:32:21Z). Barre
`periodolegislativo/all`, las iniciativas de cada período por `periodoId` y
el directorio por demarcación, en serie, con User-Agent
`Socratico-Inteligencia/1.0 (indice del buscador legislativo; herramienta independiente)`,
pausa de 0.4 s, 40 s de espera y un reintento a los 8 s; unas 1,800
peticiones. No escribe si un período queda por debajo del 98 % de su `total`
o si el directorio no llega a 200 personas. Contenido: 221 legisladores (189
de `diputados`, 32 de `senado`; solo funciones de diputado o senador) y
17,857 iniciativas (11,500 de 2020-2024 + 6,357 de 2024-2028; ningún `id` en
los dos), en columnas `id, numero, titulo, tipo, condicion, fechaDeposito,
grupo, promulgacion, tituloModificado` con catálogos de 3 tipos, 7
condiciones y 15 grupos; depósitos del 2003-10-24 al 2026-09-17; 1,853 con
título modificado y 537 con número de promulgación. La leen
`scripts/busqueda_congreso.py` (§8) y `scripts/build-funcionarios.py` (§5.7);
`next.config.ts` la excluye del trazado de toda función
(`outputFileTracingExcludes`) y ninguna ruta la lee en una visita.

**Dónde se lee en vivo.** `/congreso`, `/congreso/[id]` (300 s),
`/congreso/perencion` (900 s), `/congreso/legisladores` y su ficha (3600 s),
`/congreso/votaciones/[id]` (dinámica, con la caché de un día de sus
lecturas), la portada, `/fuentes`, `/api/congreso` y
`/api/feed/congreso/[id]` (§3).

**Cobertura.** El listado expone el registro del período vigente (2024-2028)
y, por `periodoId`, el de 2020-2024. Las piezas que siguen vivas se arrastran
al registro vigente con `numero` nuevo y conservan `fechaDeposito` y
`legislatura` de origen: `00001-2024-2028-CD` se depositó el 2003-10-24
(2026-08-31). Las que murieron antes de 2020 no aparecen.
`periodolegislativo/all` expone solo dos períodos, y sus fechas traen mes
`00` (`"16/00/2020"`; 2026-08-31); se usa `description`.

#### Servidor de documentos de la Cámara de Diputados ❌

`s-sil.camaradediputados.gob.do` (resolvió a `200.88.113.222`), puerto 8095,
devuelto por `comun/GetRutaDocumento/`. Desde el entorno del reconocimiento
(2026-08-31): el túnel del proxy se establece (`CONNECT` → 200) y el handshake
TLS recibe `Connection reset by peer`, en `:8095` y `:443`, por HTTPS y HTTP,
con TLS 1.0 y 1.2; el reset llega antes de enviar User-Agent o ruta. En la
misma sesión la API (`www.diputadosrd.gob.do`) respondió 200. La plataforma no
descarga esos PDF: la ficha lista cada documento con su etapa y un enlace
«Abrir» al origen (`documentoUrl`), y el host no está en `ORIGENES_DOCUMENTO`
(§4). `/fuentes` lo declara «bloqueada» («Inalcanzable»). El articulado de una
pieza promulgada se alcanza por su ley en la Consultoría Jurídica (§5.6), que
enlaza el dossier.

#### Consultante del SIL del Senado ⚠️

Límite: el listado son los 50 expedientes más recientes de cada colección y
no pagina por GET; la búsqueda es subcadena literal sensible a tildes; los
textos son escaneos sin capa de texto.

**Institución y servicio.** Senado de la República. Su web
(`www.senadord.gob.do`, WordPress) enlaza desde
`/secretaria-general-legislativa/iniciativas-legislativas/` al modo
«consultante» de su gestor documental «FileMaster» (ASP.NET WebForms):
`http://www.senado.gov.do/wfilemaster/consultante.aspx?bd=C2024-2028&url=lista_expedientes.aspx?coleccion=53`.
La misma aplicación responde por HTTPS en `sil.senadord.gob.do`; la raíz de
ese host redirige a un `login.aspx` interno que no se toca. Observado el
2026-08-31: `sil.senadord.gob.do/robots.txt` → 404;
`www.senadord.gob.do/robots.txt` → `Disallow: /` por nombre para `ClaudeBot`,
`Claude-SearchBot`, `GPTBot`, `OAI-SearchBot`, `bingbot` y otros, y
`Crawl-delay: 120` para `*`; su REST de WordPress (`/wp-json/wp/v2/*`) → 401.
La plataforma no lee `www.senadord.gob.do`.

**URL base.** `https://sil.senadord.gob.do/wfilemaster` (`BASE` en
`lib/senado.ts`), con el User-Agent de Diputados, 20 s de espera,
`redirect: "manual"` y `cache: "no-store"`. Toda redirección, todo estado
distinto de 200 y todo `content-type` que no sea `text/html` es un fallo;
`conReintento` repite una vez con sesión nueva.

**Colecciones** (`CUATRIENIOS`): una base por cuatrienio, cada una con su
colección de iniciativas.

| `bd` | Etiqueta (segmento de URL) | `coleccion` |
|---|---|---|
| `C2024-2028` | `2024-2028` (vigente) | 53 |
| `C2020-2024` | `2020-2024` | 53 |
| `C2016-2020` | `2016-2020` | 53 |
| `C2010-2016` | `2010-2016` | 53 |
| `C2006-2010` | `2006-2010` | 53 |
| `C2002-2006` | `2002-2006` | 42 |

**Mecánica** (implementada en `lib/senado.ts`):

| Paso | Petición | Respuesta |
|---|---|---|
| Sesión (`abrirSesion`) | GET `consultante.aspx?bd={bd}&url=lista_expedientes.aspx?coleccion={n}` | 302 con cookie `ASP.NET_SessionId` y `Location` al listado con un nonce `_nc` |
| Listado (`senadoGet`) | GET a esa `Location` con la cookie | Tabla `#DtgExpedientes`: número, tipo, descripción truncada con `...`, fecha de creación `D/M/AAAA`, estado; cada fila enlaza `Ficha.aspx?IdExpediente={id}`; censo en `#txttotalexp`. 50 filas, la más reciente primero |
| Búsqueda (`senadoBuscarPost`) | POST `application/x-www-form-urlencoded` a la URL del listado: `__VIEWSTATE`, `__VIEWSTATEGENERATOR`, `__EVENTVALIDATION` (del listado), `txtBuscar`, `imgBtnIr.x=8`, `imgBtnIr.y=8`, `cmbEstado=-1`, `cmbOrden=fc`, `Orden=RBOrdenDes`, `CBExpCerrados=on` | La misma tabla con hasta 50 filas y el total real. Un postback rechazado redirige a `ErrorGeneral.htm` |
| Ficha | GET `Ficha.aspx?IdExpediente={id}&Coleccion={n}` | El formulario del FileMaster en solo lectura, unos 56 campos etiquetados (2026-08-31) |
| Documentación | GET `documentacionasociada.aspx?CodigoColeccion={n}&CodigoExpediente={id}` | Tabla `#ctl00_tblDocumentos` (base de datos, sección, nombre); cada fila repite en sus tres celdas un enlace `documentoredirect.aspx?bd=&item=` (`bd=28` = Documentos Legislativos); `parsearDocumentos` deduplica por `item` |
| Archivo | GET `documentoasociado.aspx?bd=&item=&codigocoleccion=&codigoexpediente=` (con el `bd` y el `item` del enlace), luego el `.htm` y un HEAD al PDF | La ruta final en un comentario `URL_FINAL=…` y en el `src` de `#pdfFrame`; si es un `.htm`, su contenido es un `location.href = 'X.pdf'` hacia el PDF hermano |

Observado el 2026-08-31:

- Sin la cookie, `lista_expedientes.aspx` y `Ficha.aspx` responden 302.
- `numeropagina=2` por GET devuelve la página 1: la paginación es un postback
  con ViewState que muta la sesión, y no se usa.
- `cmbOrden` con un valor fuera de su lista dispara EventValidation y un 302
  a `ErrorGeneral.htm`. El postback de búsqueda es la única petición no GET
  de la capa.
- La búsqueda es subcadena literal y sensible a tildes: `codigo penal` → 0,
  `código penal` → 14. `popular` en `C2010-2016` → cuatro expedientes «PROYECTO
  DE LEY QUE REGULA LA INICIATIVA LEGISLATIVA POPULAR» (ids 21343, 21656,
  22197, 22542), mientras la frase completa da 0.
- Censos: 2024-2028 → 2,660; 2020-2024 → 2,755.

`buscarExpedientesSenado` quita `<`, `>`, `&`, `%` y `\` (la validación de
ASP.NET del consultante rechaza los tres primeros) y recorta a 120
caracteres. Si lo tecleado es ASCII y no trajo nada, `conOtrasFormas` prueba a
lo sumo `MAX_FORMAS_SENADO = 3` formas con tilde de la palabra más larga, en
serie, para en la primera con resultados y filtra en casa por todas las
palabras; con más de una palabra el resultado es `parcial` si la forma tenía
más de 50 filas.

**Ficha.** `parsearFicha` lee filas `etiqueta → control` por la etiqueta, no
por el id del campo: «Número de Iniciativa», «Descripción del Proyecto»,
«Tipo de Iniciativa», «Subtipo de Iniciativa», «Condición Actual»,
«Historial», «Materia», «Comisiones», «Proponentes», «Reintroducida»,
«Perimida», «Anotaciones Especiales», «Cámara Inicial», «Poder de Origen»,
«Fecha de Recibido por El Senado», «Legislatura de Inicio», «Número de
Expediente Cámara Diputados», «Despachada», «Despachada Hacia», «Promulgada»,
«Número de Promulgación»; el estado de cabecera sale de `#lbEstadoActual`. Una
ficha sin número es un id inexistente. El historial llega como prosa fechada
(«Depositada el 11/8/2014. Enviada a Comisión el 28/8/2014. …») y
`parsearHistorial` lo parte en eventos. Los campos «Sí/No con fecha» llevan la
respuesta en la opción elegida de su lista y la fecha en un campo de texto.
Las listas traen su vocabulario completo (unos 100 estados y 50 tipos;
2026-08-31). El
número `01886-2026-SLO-SE` es secuencia-año-legislatura-`SE`, con
legislaturas extraordinarias `SLE` además de `PLO` y `SLO`
(`parseNumeroSenado`); es cita, y la identidad es `IdExpediente` dentro de su
colección. El título usa el mismo marcador `TÍTULO MODIFICADO:` que Diputados.
`tonoDeEstadoSenado` traduce el estado a los tonos de `lib/estados.ts`.

**Documentos.** El PDF final lo sirve nginx sin cookie de sesión y sin
`X-Frame-Options`; `sil.senadord.gob.do` está en `ORIGENES_DOCUMENTO` (§4).
La ficha muestra el documento de `documentoPrincipal` (el de sección
«proyecto», «ley» o «resolución», si no el primero) en `VisorDocumento` con la
marca `escaneo`, y `getArchivoSenado` declara tipo y peso por un HEAD. Los PDF
son escaneos de imágenes sin capa de texto. Sin documentación,
`getDocumentosSenado` devuelve una lista vacía y la ficha no muestra visor;
solo se resuelve el archivo del documento principal.

**En vivo.** `unstable_cache` sobre el resultado ya parseado (la cookie y el
nonce rompen la clave de la caché de `fetch`): `senado-lista` 900 s,
`senado-busqueda` 3600 s, `senado-ficha` 3600 s, `senado-documentos` 3600 s,
`senado-archivo` 86400 s. Un fallo lanza dentro de la función cacheada y no se
guarda; hacia la página, `null` o `[]`. Coste por lectura fría: listado 2
peticiones, búsqueda 3, ficha 2, documentación 2, archivo 2 más el `.htm` y el
HEAD. Páginas: `/congreso/senado` (`?c=` cuatrienio, `?q=`; 300 s) y
`/congreso/senado/[cuatrienio]/[id]` (3600 s); `getCensoSenado` alimenta la
portada y `/fuentes`. No hay instantánea del Senado.

**Cobertura.** Seis colecciones, de 2002-2006 a 2024-2028. Por colección, los
50 expedientes más recientes y lo que alcance la búsqueda. Metadatos y PDF
escaneados; ningún origen publica resumen.

#### Lectura de una iniciativa — `lib/legislacion.ts`

Ninguna de las dos cámaras publica sinopsis: el texto descriptivo es el
título. El módulo trabaja sobre él y sobre las taxonomías de estado.

- `referenciasNormativas` extrae las normas citadas (`Ley`, `Leyes`,
  `Decreto`, `Reglamento`, `Resolución`, `Código` con número `N-AA`, y la
  Constitución sin número) con su relación: el verbo **más cercano** en los
  90 caracteres anteriores (`deroga`, `modifica`, `sustituye`, `adiciona`,
  `reforma`), o `cita` si no hay.
- `numeroDeNorma` extrae `N-AA` de un texto libre: el Senado guarda `136-15`,
  Diputados `Ley núm. 43-26`.
- `queEs` y `queSigue` traducen instrumento y condición; `enQuePunto` toma el
  punto más avanzado en este orden: promulgación, cierre (perimida, retirada,
  rechazada en cualquiera de las dos taxonomías), estado del último trámite,
  condición.
- `fraseDeBusqueda` devuelve el tramo de texto corrido más largo sin cifras ni
  puntuación, de hasta 7 palabras y sin palabras vacías en los bordes, o
  `null` si quedan menos de 3.
- `proyectosDeNorma(tipo, numero, titulo)`, solo para leyes: tres consultas a
  `buscarIniciativas` (86400 s) —el número (con `núm. ` delante si termina en
  `-20`, porque `47-20` es subcadena de toda cita `06347-2024-…`), la frase
  larga y la frase de 4 palabras— y devuelve como `origen` la pieza cuyo
  `numPromulgacion` dice «ley» con ese número, y como `citan` las filas de la
  consulta por número cuyo título cita esa ley.

Los usan `components/congreso/dossier.tsx` (resuelve hasta
`MAX_CITAS_RESUELTAS = 4` citas y el número de promulgación con
`resolverNorma`, §5.6) y `components/congreso/cruces.tsx` (`EnElSenado` en la ficha de Diputados,
`EnDiputados` en la del Senado, `ProyectosDeLaNorma` en la de una ley).

#### Identidad y reconciliación entre cámaras

| | Diputados | Senado |
|---|---|---|
| Identidad | `id` | `IdExpediente` dentro de su colección |
| Cita | `numero` `06225-2024-2028-CD` (cambia al arrastrarse) | `01886-2026-SLO-SE` |
| Legislatura | `legislatura` `2026-SLO` | «Legislatura de Inicio», mismo código |
| Promulgación | `numPromulgacion` `Ley núm. 43-26` + `fechaPromulgacion` | «Número de Promulgación» `43-26` + «Promulgada» |
| Campo de cruce | ninguno | «Número de Expediente Cámara Diputados» (`numeroDiputados`) |

- **Senado → Diputados** (`EnDiputados`). Si la ficha del Senado trae la cita
  de Diputados, `iniciativaPorNumero` la busca en `getIniciativas` (que hace
  match sobre `numero`) y exige igualdad exacta. Si no la trae y la pieza ya es
  ley, toma el `origen` de `proyectosDeNorma`.
- **Diputados → Senado** (`EnElSenado` → `gemeloEnSenado`). Toma el cuatrienio del período de
  la cita de Diputados, busca `fraseDeBusqueda(titulo)` en el consultante y
  abre como mucho `MAX_CANDIDATOS_GEMELO = 3` fichas; acepta la que declara esa
  misma cita (`confirmadoPor: "cita"`) o la promulgada con el mismo número de
  ley (`"promulgacion"`). Un título parecido no basta. Coste: una búsqueda (3
  peticiones) y hasta tres fichas (2 cada una), con la caché de una hora.
- **Ley → proyecto** (`proyectosDeNorma`). Verificado el 2026-09-23: 43-26 →
  `06099-2024-2028-CD`; 44-26 → `06038-2024-2028-CD`; 86-25 →
  `04603-2024-2028-CD`. 99-25 no se encuentra: el título de la ley añade
  «Dominicano» y la frase corta «presupuesto general del estado» da 134
  resultados.
- El Senado no siempre llena el campo de cruce: `01712-2026-PLO-SE` (id
  39749), la misma Ley 43-26, lo trae vacío (2026-09-23). Sin cita ni número
  de promulgación común no se enlaza.

#### Perención

`lib/congreso.ts`. `parseLegislatura` acepta `AAAA-PLO` o `AAAA-SLO`; la PLO
abre el 27 de febrero y la SLO el 16 de agosto (`INICIOS`);
`DURACION_LEGISLATURA_DIAS = 150` contando el día de apertura, así que el
cierre es la apertura más 149 días. `evaluarPerencion(codigo)` compara con la
fecha del día y devuelve `sin-datos`, `cerrada` (cierre pasado), `en-riesgo`
(quedan `VENTANA_ALERTA_DIAS = 30` días o menos) o `vigente`.
`legislaturaVigente` cuenta en enero la SLO del año anterior. Se evalúa sobre
el código `legislatura` de cada pieza de Diputados con `viva` (tono
`accionable`): en la ficha (`/congreso/[id]`), en
`components/iniciativa-card.tsx` y en `/congreso/perencion`, que trabaja sobre
la muestra de 250 piezas y la declara. Las piezas del Senado no se evalúan:
`legislaturaDeNumero` (`lib/senado.ts`) convierte su número a ese código
(`null` para `SLE`, sin fechas fijas) y ninguna página lo llama.

### 5.6 Normativa y justicia

#### Consultoría Jurídica del Poder Ejecutivo ⚠️

Límite: desde las funciones de Vercel el origen responde **403 con
`cf-mitigated: challenge`** de Cloudflare (buscador, repositorio y PDF;
desde otra red, 201; verificado 2026-09-23). La plataforma intenta en vivo y
sirve instantáneas generadas desde otra red.

**Institución y servicio.** Consultoría Jurídica del Poder Ejecutivo,
consulta pública de leyes, decretos, reglamentos, resoluciones y Gaceta
Oficial del portal `www.consultoria.gov.do` (Next.js). `robots.txt`:
`Allow: /`; veda `/oficina-virtual/dashboard/`, `/api/auth/` y `/api/admin/`
(2026-09-23).

**URL base y endpoints** (`BASE` = `https://www.consultoria.gov.do`):

| Endpoint | Uso | Respuesta |
|---|---|---|
| `POST /api/consultas/search` | Listados y citas (`consultar`) | 201 JSON: la lista entera, sin paginar |
| `GET /api/documents?category=gacetas` | Gaceta Oficial (`gacetas`) | JSON con todas las gacetas: `id`, `title` (número), `fileUrl` (`PDF|portada`), `year`, `month`, `status`; sin día |
| `GET /api/document/{DocId}` | Texto de una norma (`url` de cada documento; `CONSULTORIA_PDF`) | `application/pdf` `inline` |

**Método y formato.** El buscador recibe JSON sin token ni sesión:
`DocumentTypeCode` (1 leyes, 3 decretos, 4 reglamentos, 5 varios, 7
resoluciones), `DocumentNumber`, `PublicationYear` (`"2026"`, `"2020-2026"` o
`""` para todo), y `FullText`, `Name`, `LastName`, `Identification`,
`Charge` a `""` e `Institution`, `President`, `Consultor`, `Career`, `Guild`,
`PensionType` a 0. Fila: `DocId`, `TipoDocumento`, `Tipo` (plural,
«Decretos»), `Numero`, `Titulo`, `Gaceta`, `FechaPromulgacion`,
`FechaPublicacion`, `Institucion`, `Presidente`, `Consultor` y, según el
decreto, campos de persona (`Nombre`, `Apellido`, `Cargo`, `Carrera`,
`Gremio`, `TipoPension`, `Monto`, `Cedula`). `lib/normativa.ts` valida con
zod los campos que lee (`FILAS_BUSCADOR`, `REPOSITORIO`) y quita la cédula de
los títulos (`sinCedula`). El tipo 1014 (Gaceta) no figura en
`/api/consultas/document-types` (2026-09-23); `TIPOS_NORMATIVA` conserva
`1014` como clave de la Gaceta, que se sirve del repositorio. Medido el
2026-09-23: decretos de 2026 → 570 filas, 640 KB, ~3.5 s; una cita por número
~0.9 s.

**Acotación.** Toda consulta se filtra: por año (`PublicationYear`) en los
listados, por número (`DocumentNumber`) en una cita. Las instantáneas piden el
histórico con el año vacío (abajo).

**En vivo.** Lectura con `PEDIDO`: User-Agent
`Socratico-Inteligencia/1.0 (monitoreo normativo; herramienta independiente)`,
30 s, **un solo intento**, `cache: "no-store"`.

- `consultarNormativa(tipo, anio)`: en vivo; si falla, la instantánea
  `public/data/normativa.json` (`busquedas["tipo/año"]` o `gacetas`).
  Devuelve `origen`: `"vivo"`, la fecha de la instantánea, o `null` si nadie
  tiene ese tipo y año. La sirve `/normativa` (`revalidate = 3600`; años del
  actual a tres atrás), y la portada pide los decretos del año.
- `resolverNorma(tipo, numero)`: `unstable_cache` `normativa-cita` de 86400 s
  sobre `normaUpstream` (una consulta por `DocumentNumber`, coincidencia exacta
  o `null`); si el origen falla, busca en `normativa.json`, después en
  `leyes.json` (`leyHistorica`) para una ley o en el registro de decretos
  (`decretoDelRegistro`) para un decreto. El documento lleva `instantanea` con
  la fecha de corte cuando no vino en vivo. La usan `/normativa/[tipo]/[numero]`
  (`revalidate = 86400`) y el dossier del Congreso (§5.5).
- Sobre las filas, en casa: `filtrarPorTexto` (número y título, todas las
  palabras, por raíz; no el texto íntegro), `esDesignacion` (decreto con la
  etiqueta `Institucion` «Cámara de Cuentas», que el origen pone a
  nombramientos y sus ceses), `cargoDelTitulo`, `movimientoDelTitulo`,
  `designacionesPorMes`, `materiaDe` (reglas de `lib/materias-decreto.ts`),
  `normasDeInstitucion` (por etiqueta, solo sobre la instantánea).
- PDF: `www.consultoria.gov.do` y `consultoria.gov.do` están en
  `ORIGENES_DOCUMENTO` (§4); con el desafío, `/api/documento` no trae el PDF y
  el visor ofrece «Abrir en el origen». Los PDF de decretos tienen capa de
  texto desde 2012; hasta 2011 y en parte de 2012 son escaneos con OCR
  (2026-09-29).

**Instantánea `public/data/normativa.json`** — `scripts/build-normativa.py`
(User-Agent `Socratico-Inteligencia/1.0 (instantanea normativa; herramienta independiente)`,
90 s, sin reintento; requiere una red que el origen acepte). `generadoEn`
2026-09-23, 1,360,839 bytes. Guarda por fila `DocId`, `TipoDocumento`,
`Tipo`, `Numero`, `Titulo` (sin cédula), `Gaceta`, `FechaPromulgacion`,
`Institucion`.

| Tipo | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|
| 1 Leyes | 47 | 47 | 70 | 21 |
| 3 Decretos | 688 | 708 | 763 | 570 |
| 4 Reglamentos | 3 | 0 | 0 | 0 |
| 7 Resoluciones | 35 | 48 | 42 | 28 |

Más 292 gacetas (2020–2026). La leen también `app/sitemap.ts`,
`scripts/build-instituciones.py`, `scripts/build-busqueda.py` y
`scripts/build-modelo-semantico.py`.

**Instantánea `public/data/leyes.json`** — `scripts/build-leyes.py`: una
consulta con `DocumentTypeCode: 1` y `PublicationYear: ""` (300 s de espera,
un reintento). Medido el 2026-09-27: 201 `application/json`, 12,516 filas,
~9 s; con un año, un subconjunto de la misma lista. El script descarta filas
sin título o de otro tipo y deduplica por número y fecha. `generadoEn`
2026-09-27, 1,878,176 bytes, 12,130 leyes de 1844 a 2026 (9 sin fecha), en
filas `DocId, Numero, Titulo, Gaceta, FechaPromulgacion, Institucion`, de la
más reciente a la más antigua. Del origen (2026-09-27): unas 380 filas
repetidas; 12 números con dos fechas (74-25: 2025-08-03 y 2026-08-14);
«0-00» en cuatro leyes de 1921; los números con año (`47-20`, `16-2000`) son
la forma habitual desde los noventa; en las anteriores, un número solo
(`1494`, a veces con «BIS»). Solo las leyes con número y año tienen ficha propia; las demás
enlazan su PDF.

**Cobertura.** En vivo, cualquier año y número que el origen responda; en
producción, lo que cubren las instantáneas: leyes, decretos, reglamentos y
resoluciones de 2023–2026 por tipo y año, gacetas 2020–2026, todas las leyes
y todos los decretos. Reglamentos casi vacíos en el origen (2023: 3; 2024–2026:
0).

#### Consultoría Jurídica — registro completo de decretos ⚠️

Mismo origen y mismo límite que la anterior; se lee solo por instantánea.

**Lectura.** `scripts/consultoria_decretos.py` (`leer_decretos`):
`POST /api/consultas/search` con `DocumentTypeCode: 3` y `PublicationYear: ""`,
300 s de espera. Medido el 2026-09-29: 201 `application/json`,
75,169,817 bytes en ~62 s, 78,834 decretos desde 1844 (989 sin fecha). Guarda
seis campos (`CAMPOS`: `DocId`, `Numero`, `Titulo`, `FechaPromulgacion`,
`Presidente`, `Institucion`) en la caché `$TMPDIR/socratico-funcionarios/decretos.json`
(`--cache`, `--sin-red`), que se reusa si tiene menos de un día y comparte con
`scripts/build-funcionarios.py` (§5.7); la cédula y los demás campos de
persona no llegan a la caché. `scripts/build-decretos.py` (User-Agent
`Socratico-Inteligencia/1.0 (registro de decretos; herramienta independiente)`)
trata 401, 403, 429, 470 o un `content-type` que no sea JSON como rechazo, sin
reintento; un fallo de red se reintenta una vez.

**Salida** `public/data/decretos/`: `indice.json` (fecha, total, filas por
año, firmantes, etiquetas de institución), un `<año>.json` por año con filas
`[numero, fecha, titulo, docId, institucion, firmante, aviso]` (los dos
índices apuntan a las tablas de `indice.json`) y `sin-fecha.json`. Reglas:

- Un número `NNN-AA` vive en el archivo de su año (20AA si ese año ya llegó,
  si no 19AA; `anio_del_numero` y `anioDelNumero`); un número sin año va al
  año de su fecha; `0-00` no es número.
- `aviso: "fecha"` si la fecha no casa con el año del número (un `497-25`
  fechado el 1900-01-01); `aviso: "fuera"` si cae fuera de los tramos de firma
  de su firmante. Se marcan, no se corrigen.
- `firmas_presidenciales`: el firmante es el campo `Presidente` tal como lo
  escribe la Consultoría, en versales; sus tramos son series de fechas sin
  huecos de más de 365 días, y se descartan los tramos de menos de
  `max(5, n/100)` fechas.
- No escribe si llegan menos de 75,000 decretos, si el año en curso trae menos
  de 50 o si el firmante más reciente no firmó desde el 1 de enero del año
  anterior.

Corte: `generado` 2026-09-29; 78,834 decretos, 77,099 con firmante;
180 archivos de año (1844–2026) más `sin-fecha.json` (989) e `indice.json`;
13,121,398 bytes; 49 firmantes; 499 etiquetas de institución; avisos `fuera`
99 y `fecha` 89; 2026 → 643 filas.

**Módulos.** `lib/decretos.ts` (servidor, `node:fs`, memoizado):
`indiceDecretos`, `decretosDelAnio`, `decretoPorNumero`, `firmante`,
`decretosDeFirmante`. La fila que resuelve la ficha de un número (`ficha`) es
la primera que no es fe de errata (título que empieza «FE DE ERRATA») ni lleva
aviso; si no hay, la primera que no es errata; si no, la primera.
`lib/decretos-base.ts` lleva lo que no lee el registro (`CONSULTORIA_PDF`,
`AVISO_DECRETO`, `hrefDecreto`) y lo importan `lib/mcp.ts` y
`lib/grafo-compilado.ts` sin arrastrar los 13 MB. `next.config.ts` incluye `public/data/decretos/**` en el
trazado de `/funcionarios` y `/normativa`. Lo leen
`/funcionarios/[slug]` y `/funcionarios/[slug]/decretos`, la ficha
`/normativa/decreto/[numero]` (`decretoPorNumero` y la caída de
`resolverNorma`) y `lib/grafo-constructores.ts` (§7).

**Cobertura.** Todo decreto que el buscador publica desde 1844. Los campos de
persona del origen concatenan nombres cuando un decreto nombra a varias
personas; el registro no los guarda y manda el título.

#### Tribunal Constitucional ✅

**Institución y servicio.** Tribunal Constitucional, listado anual de
sentencias de su Secretaría en `tc.gob.do` (Umbraco en Azure App Service, HTML
hecho en el servidor, sin token ni cookie para listar). `robots.txt` → 404
(2026-09-24).

**Endpoint.** `GET https://tc.gob.do/consultas/secretar%C3%ADa/sentencias?searchCriteria=&searchString=&size=999999&filtery=AAAA&criteriay=years&order=Date`
(`urlListadoTC`). La ruta lleva «secretaría» con tilde (`secretar&#237;a` en el
HTML, `%C3%AD` en la petición).

**Formato y acotación.** Con `size=999999` el año entero cabe en una
respuesta («Página 1 de 1»); no hay paginación. Tabla de cuatro columnas:
número `TC/0966/26` enlazado a su ficha, fecha `DD-MM-AAAA`, «Referencia»
(expediente en texto libre: `TC-05-2026-0147`, varios separados por coma,
«Expediente No. 2011- 5744» o «N/D» en 2012) y «Relativo a». Texto con
entidades numéricas. `parsearListadoTC` (cheerio, `lib/html.ts`) toma la
tabla cuya cabecera dice «Relativo a», devuelve fechas ISO, `null` para
«N/D», quita cédulas del «Relativo a» y ordena por fecha y número. Medido el
2026-09-24: 2026 → 966 filas, 885 KB, 7.7 s (7.2 s hasta el primer byte);
2023 → 1,159 filas, 1.09 MB, 3.5 s; 2012 → 104 filas, 149 KB. El PDF está en
`tribunalsitestorage.blob.core.windows.net/media/<id>/…` con un id opaco que
solo da la ficha; no se lee la ficha de cada fila y la fila enlaza a la ficha.

**En vivo.** `lib/tc.ts`: `pedirTextoOLanzar` con User-Agent
`Socratico-Inteligencia/1.0 (sentencias del Tribunal Constitucional; herramienta independiente)`,
60 s, un reintento, `text/html` exigido y la tabla presente (`comprobar`);
`cache: "no-store"` dentro de `unstable_cache` sobre las filas ya leídas: 6 h
(`tc-sentencias-en-curso`) para el año en curso, 7 días
(`tc-sentencias-cerrado`) para un año cerrado. `listarSentencias(anio)` acepta
de `PRIMER_ANIO_TC = 2012` al año en curso de Santo Domingo y degrada a
`null`. Página `/constitucional` (`revalidate = 21600`). La composición del
pleno se lee aparte (§5.7).

**Cobertura.** Todas las sentencias del listado desde 2012.

#### Tribunal Superior Electoral ✅

**Institución y servicio.** Tribunal Superior Electoral. `tse.gob.do` redirige
a `tse.do` (WordPress), cuya página «Sentencias contenciosas» incrusta el visor
`visorpdf.tse.do`: PHP detrás de Cloudflare, HTML hecho en el servidor, sin
cookie ni token para listar (la `PHPSESSID` que pone no hace falta).
`visorpdf.tse.do/robots.txt` → 200 vacío (2026-09-24).

**Endpoints.** `GET https://visorpdf.tse.do/?y=AAAA&s=` (página 1) y
`?pos=N&y=AAAA&s=` (las siguientes) (`urlListadoTSE`).

**Formato y paginación.** 60 filas por página. El paginador es una ventana
(en la página 7 de 2024 muestra 3…7): `leerAnio` sigue el enlace «Siguiente»
hasta que no aparece, con tope `MAX_PAGINAS = 15` (900 filas), y declara
`truncado`. Tabla de cuatro columnas: número en un `<th>` enlazado a su ficha
(`/documento/contenciosas/<id opaco>`), fecha «10 Ago 2026», expediente y
«Relativo a». La ficha trae la síntesis y el documento en un `<iframe>`
(`/file-upload/<n>.pdf`, a veces un `.docx`); no se lee por fila. Medido el
2026-09-24: 2026 → 26 filas en una página (28 KB, 0.5 s); 2024 → 7 páginas,
402 filas (58 KB y 0.9 s cada una); 2021 → 8 filas. Particularidades del
origen:

- El selector se rotula «Año de expediente» y filtra por el año de la
  sentencia (TSE/0001/2026, expediente TSE-05-0019-2025, sale en 2026).
- Selector de 2021 al año en curso: el visor no publica sentencias
  anteriores a 2021.
- Numeración irregular («TSE/0028/2026», «TSE/007/2021», «TSE-006-2021»,
  «TSE/0387/2024.»); se guarda sin la puntuación final.
- Un mismo número aparece con fichas distintas (TSE/0293/2024,
  TSE/0303/2024, TSE/0377/2024): la clave de una fila es su ficha.
- El orden del listado tiene empates: 2024 dio 402 filas para 396 fichas y
  2023, 223 para 221 (2026-09-27).

**En vivo.** `lib/tse.ts`: User-Agent
`Socratico-Inteligencia/1.0 (justicia; herramienta independiente)`, 25 s por
página, un reintento, `text/html` y tabla exigidos; `unstable_cache` sobre las
filas de todas las páginas: 6 h el año en curso (`tse-sentencias-en-curso`),
7 días un año cerrado (`tse-sentencias-cerrado`). `listarSentenciasTSE(anio)`
acepta de `PRIMER_ANIO_TSE = 2021` al año en curso. Página `/tse`
(`revalidate = 21600`).

**Cobertura.** Sentencias contenciosas publicadas en el visor desde 2021.

#### Instantánea de sentencias para el buscador

`scripts/build-sentencias.py` → `public/data/sentencias.json`: los mismos
listados del TC (2012–hoy, un año por petición) y del TSE (2021–hoy,
siguiendo «Siguiente» con tope de 20 páginas), User-Agent
`Socratico-Inteligencia/1.0 (sentencias para el buscador; herramienta independiente)`,
pausa de 2 s, un reintento; no escribe si el TC trae menos de 1,000 o el TSE
menos de 100. `generado` 2026-09-27, 4,428,883 bytes: 11,393 sentencias del TC
(2012-02-06 a 2026-09-25) y 713 del TSE (2021-02-24 a 2026-08-10). Fila `n`
(número), `f` (fecha), `x` (expediente), `r` («Relativo a» sin la palabra
inicial, cortado al primer salto de párrafo en el TSE y a 300 caracteres) y
`u` (ficha: siempre en el TSE; en el TC solo si se aparta de la plantilla
`ficha_tc`, `TC/0002/12` → `…/sentencias/tc000212`). La lee
`scripts/busqueda_sentencias.py` (§8); `next.config.ts` la excluye del trazado
de las funciones.

#### Poder Judicial — boletines estadísticos ✅

**Institución y servicio.** Poder Judicial, portal de transparencia
`transparencia.poderjudicial.gob.do` (ASP.NET en Azure). `robots.txt` solo
veta `/reportePDF/` (2026-09-24). Este host valida TLS con la cadena que
envía; el sitio principal `poderjudicial.gob.do` omite un intermedio de
Sectigo (§5.7).

**Endpoints.** El índice
`GET https://transparencia.poderjudicial.gob.do/transparencia/estadisticas_judiciales/BoletinesEstadisticos`
(HTML, ~690 KB, 943 enlaces a PDF y XLSX con nombres irregulares: `_1`,
`_(1)`, `_data`, `_1_2`, meses abreviados, «Original» por «Ordinaria»;
2026-09-24) y los XLSX de la serie
`EST_02_tribunales_de_jurisdiccion_ordinaria_<mes>_<año>.xlsx` bajo
`/documentos/PDF/estaditicas/`.

**Formato.** Hoja «Ent y Sal»: entradas y salidas **mensuales** (no
acumuladas) de «solicitudes de servicio judicial» por departamento judicial
(11 filas y TOTAL) y por categoría de tribunal (corte de apelación, primera
instancia, juzgado de paz, «y equivalentes»). La hoja dice «Salidas sin
considerar la fecha de entrada» y «Cifras de carácter preliminar, sujetas a
verificación». No incluye la Suprema Corte. Cada mes trae un gemelo «Data»
con la data cruda.

**Instantánea.** `scripts/build-justicia.py` (User-Agent
`Socratico-Inteligencia/1.0 (justicia; herramienta independiente)`, GET, 40 s,
un reintento, `content-type` exigido) lee el índice, elige por patrón el XLSX
del último mes y el del mismo mes un año antes (descarta los «Data»), los
abre con `zipfile` y no escribe si la hoja no es la de entrada y salida, si el
mes de la hoja no es el del archivo, si no hay 11 departamentos, si no suman
el TOTAL o si los totales son inverosímiles. Tres peticiones por corrida.
`public/data/justicia.json`: `generadoEn` 2026-09-24, 9,397 bytes, 54 meses
de la serie listados en el índice; julio de 2026: 129,375 entradas y 108,472 salidas
(tasa 0.8384); julio de 2025: 117,820 y 94,927 (0.8057); ambos preliminares.
`lib/justicia.ts` (`getEstadisticasJudiciales`, `node:fs`, memoizado) la sirve
a `components/fuentes-nuevas/estadisticas-judiciales.tsx`, en `/indicadores`.

**Cobertura.** Jurisdicción ordinaria, un mes y su homólogo del año anterior.
Del Poder Judicial no se leen otras consultas (§5.11).

#### Poder Judicial — Rol Nacional de Audiencias ✅

**Institución y servicio.** Poder Judicial, página pública
`https://rolnacionalaudiencias.poderjudicial.gob.do/` (`ROL_PUBLICO`; SPA de
React, sin CAPTCHA ni clave) y su API
`https://apigestionaudienciasroles.poderjudicial.gob.do/api/` (robots de 0
bytes; 2026-09-30). La API sirve catálogos por GET (`Materias/`,
`TipoConsultas/`, `Distritos/`, `Categorias?IdDistritoJudicial=30`), que el
código no usa.

**Endpoint.** `POST /api/Audiencias/ObtenerRolAudiencias/`, JSON, el cuerpo
que arma la SPA: `idDistritoJudicial`, `idCategoriaTribunal`, `idMateria`,
`idTribunal`, `idSala`, `idModalidad`, `idEstatus` a 0; `idTipoConsulta: 4`
(número único de caso); `tipoConsulta: "<NUC>"`; `fechaDesde` y `fechaHasta`
a `null`; `paginaActual`; `registrosPorPagina: 20`. Responde
`{paginaActual, totalPaginas, totalRegistros, datos[]}`, una fila por
audiencia en todos los tribunales del caso: `idAudiencia`, `fechaDate`
(local, sin zona), `horaAudiencia`, `nuc`, `distritoJudicial`,
`categoriaTribunal`, `tribunal`, `sala`, `modalidad`, `direccionSala`,
`estadoRolAudiencia`, `partes` (cadena «NOMBRE (PAPEL); …»), `tipoResultado`,
`materia`, `asunto`, `fechaNuevaAudiencia`, `urlAudiencia`. La API admite
también los tipos 6 (nombre de parte), 7 (cédula) y 26 (representante) y el
rol sin filtro; el código solo envía el 4.

**Acotación.** `validarNuc`: letras, cifras, `-`, `/`, `.`, de 5 a 40
caracteres y al menos una cifra; se envía tal como se escribió (el NUC tiene
nueve patrones en veinte filas, 2026-09-30). Hasta `MAX_PAGINAS = 3` páginas
de `POR_PAGINA = 20` (60 audiencias, de la más reciente a la más antigua);
la lectura termina con una página corta y declara `truncado` si el tope corta.

**En vivo.** `lib/audiencias.ts`: `pedirJsonOLanzar` con User-Agent
`Socratico-Inteligencia/1.0 (justicia; herramienta independiente)`, 25 s, un
reintento, `content-type` JSON y forma validada con zod; `unstable_cache`
`audiencias-rol-por-nuc` por NUC, 3600 s (`CACHE_S`); un fallo lanza dentro y
no se guarda, y `rolDeCaso` degrada a `null`. Dentro de la función cacheada,
de `partes` queda solo el papel final de cada entrada si está en la lista
cerrada `PAPELES` (el resto se cuenta como `otrasPartes`); `urlAudiencia` no
se lee. `proximaAudiencia` compara las horas locales del rol con
`ahoraEnSantoDomingo`. Página `/audiencias`, `noindex, nofollow` cuando lleva
`?q=` (§3). Medido el 2026-09-30: un NUC inexistente → 200 con `datos: []`
(4.6 s); el NUC del reconocimiento → 200, 5 audiencias en 2 tribunales.

**Cobertura.** Un caso por su NUC exacto; las 60 audiencias más recientes.

#### Registro Inmobiliario — consulta de expedientes ⚠️

Límite: no se ha visto una respuesta con datos; la forma de una fila sale del
JS de la página.

**Institución y servicio.** Registro Inmobiliario, consulta pública de
expedientes `https://servicios.ri.gob.do/ConsultaDeExpedientes`
(`CONSULTA_PUBLICA`; robots de 0 bytes; 2026-09-30).

**Endpoint.** `POST https://servicios.ri.gob.do/ConsultaDeExpedientes/GetExpedient`,
`application/x-www-form-urlencoded; charset=UTF-8`, `NoExpe=<número>`, sin
cookies, token ni CAPTCHA. Un número inexistente → 200 JSON
`{"data":[],"statusCode":200,"errorMessage":null,"isSuccess":false}` (3.5 s,
2026-09-30). Las columnas, del JS de la página (`SearchGrid()`):
`fechaSolicitud`, `organo`, `numeroExpediente`, `numeroOriginal`,
`resultadoExpediente`, `estatusDigital`, `tramites`.

**Acotación.** `validarExpediente`: la misma forma que el NUC (5 a 40
caracteres, al menos una cifra; la página del Registro no consulta con menos
de 5).

**En vivo.** `lib/inmobiliario.ts`: `pedirJsonOLanzar` con el User-Agent de
justicia, 25 s, un reintento, sobre validado con zod; un `statusCode` ≥ 400
dentro del 200 cuenta como fallo; cada columna es un `unknown` opcional que
`aTexto` convierte (texto, número, booleano o lista) y ninguna fila se
descarta por su forma. `unstable_cache` `inmobiliario-expediente` por número,
3600 s; `consultarExpediente` degrada a `null`. Página `/inmobiliario`,
`noindex, nofollow` con `?q=`. El parcelario (reCAPTCHA) y las
certificaciones de estado jurídico (cuenta y pago) no se leen (§5.11).

**Cobertura.** Un expediente por su número exacto.

### 5.7 Entidades y personas

Todo lo de esta subsección se lee por instantánea: un script de `scripts/` lee las fuentes en build con un User-Agent `Socratico-Inteligencia/1.0 (…; herramienta independiente)` y escribe un archivo en `public/data/`; el módulo de `lib/` lo lee con `node:fs` y lo memoiza por instancia (`lib/instituciones.ts` importa su JSON de forma estática). Ninguna visita consulta estas fuentes, salvo el resumen de compras de `lib/instituciones.ts` (DGCP en vivo, abajo).

| Instantánea | Script | Módulo | Lee además | `generado` | Tamaño |
|---|---|---|---|---|---|
| `public/data/instituciones.json` | `scripts/build-instituciones.py` | `lib/instituciones.ts` | `fiscal.json`, `normativa.json` | 2026-09-29 | 262,854 B |
| `public/data/funcionarios.json` | `scripts/build-funcionarios.py` (con `scripts/consultoria_decretos.py`) | `lib/funcionarios.ts`, `lib/cargos.ts` | `instituciones.json`, `congreso.json` | 2026-09-29 | 5,378,023 B |
| `public/data/declaraciones.json` | `scripts/build-declaraciones.py` (con `scripts/build-documentos.py`) | `lib/declaraciones.ts` | `funcionarios.json` | 2026-09-30 | 33,747 B |
| `public/data/empresas/` (510 archivos) | `scripts/build-empresas.py` | `lib/empresas.ts`, `lib/padron.ts` | — | 2026-09-29 | 16,348,452 B |
| `public/data/banca.json` | `scripts/build-banca.py` | `lib/financieras.ts` | — | 2026-09-29T23:36:22Z | 807,531 B |
| `public/data/wikidata.json` | `scripts/build-wikidata.py` | `lib/wikidata.ts` | `instituciones.json`, `banca.json`, `funcionarios.json`, `lib/provincias.ts` | 2026-09-30 | 4,285 B |

#### DIGEPRES · Clasificador Institucional y cuadros de transferencias ✅

- **Institución y servicio.** Dirección General de Presupuesto (DIGEPRES), sitio WordPress `digepres.gob.do` (sin `www`). robots: `Disallow:` vacío (2026-09-29).
- **Endpoints** (constantes de `scripts/build-instituciones.py`):
  - `MEDIOS_DIGEPRES` = `https://digepres.gob.do/wp-json/wp/v2/media?search=clasificador&_fields=id,date,title,source_url,mime_type&per_page=100` → JSON de la biblioteca de medios; se toma el PDF más reciente cuyo título dice «Clasificador Institucional». El de la instantánea: `https://digepres.gob.do/wp-content/uploads/2026/05/Clasificador-Institucional.pdff_.pdf`.
  - `PAGINA_LEY` = `https://digepres.gob.do/ley-de-presupuesto-general-del-estado-{anio}/` y `PAGINA_PROYECTO` = `https://digepres.gob.do/proyecto-de-ley-de-presupuesto-{anio}/` → HTML; `xlsx_de_pagina` busca en ellas el enlace `…/wp-content/uploads/…Receptora….xlsx` («Clasificación Institucional según Entidad Receptora»).
  - `DGCP` = `https://datosabiertos.dgcp.gob.do/api-dgcp/v1/unidades_compra?limit=1000` (catálogo de unidades de compra, §5.1), filtrado a `estado == "ACTIVA"`.
- **Método y formato.** GET con un reintento y `content-type` validado (`bajar`). El PDF se lee con `pypdf` o, sin él, con `pdfminer.six`, que recompone las filas por altura (dependencia de build; no está en `package.json`). El XLSX se lee con `zipfile` y `xml.etree` (`filas_xlsx`): `CCCC - NOMBRE` en la columna A, el monto en la D, y una fila `TOTAL GENERAL`.
- **Acotación y controles.** El script no escribe si el clasificador trae menos de 500 capítulos, un número de gobiernos locales distinto de `LOCALES_ESPERADOS` (393), ninguna fecha «Actualizado al», un cuadro cuyas filas no suman su total (±1 peso) o un cuadro que no cubre los 393 gobiernos locales. Lee la Ley de Presupuesto del año en curso o del anterior y, si existe, el proyecto del año siguiente.
- **Observado** (2026-09-29): la búsqueda de medios devuelve 40 (`X-WP-Total`); el nombre del PDF cambia con cada versión; el PDF pesa 2,435,402 B, 46 páginas, «Actualizado al: 09/01/2026», con texto extraíble, cabecera repetida por página, nombres partidos en dos renglones, unidades ejecutoras sin subcapítulo (5161, 5162, 5163, 7068) o de tres cifras (7352 01 001), un subcapítulo sin unidad (7063 01), un anexo de 38 entidades receptoras desconcentradas y una bitácora de cambios; la columna ENTIDAD no es única. 537 subcapítulos y 666 unidades ejecutoras en esa lectura. `pypdf` lo lee en ~4 s y `pdfminer.six` en ~50 s, con los mismos 528 capítulos. El cuadro de la ley 2026 conserva en su título «Proyecto de Ley de Presupuesto 2026». En los cuadros, las filas 2xxx son desconcentradas, 4xxx subsidios y 9xxx ONG (no se usan); 7199 «AYUNTAMIENTOS» es una bolsa sin repartir. `/wp-json/wp/v2/elementor_library/{id}` → 401 y los medios traen `post: null`.
- **Instantánea.** `public/data/instituciones.json`, `generado` 2026-09-29; `fuentes.clasificador.actualizado` 2026-01-09; `fuentes.transferencias` con `ley-2026` (total RD$443,963,711,250; locales RD$28,030,312,720; bolsa sin repartir RD$2,000,000,000) y `proyecto-2027` (RD$551,782,380,204; RD$32,840,782,044; RD$5,000,000,000).

**El cruce `instituciones.json`.** El universo son las unidades de compra activas de la DGCP (id = código de la DGCP, `dgcp: true`) más un registro por cada capítulo del clasificador sin unidad de compra (id = `900000 + capítulo`, `dgcp: false`: 900101 el Senado, 900301 el Poder Judicial, 905002 el Banco Central). Cada registro (`Institucion`) lleva:

| Campo | Origen |
|---|---|
| `capitulo` | `codigo_capitulo[4:8]` de la DGCP, solo si `fiscal.json` (§5.2) tiene su ejecución; con alias, el capítulo vigente o `null` |
| `clasificador`, `sector` | capítulo vigente del clasificador; si la DGCP guarda uno retirado, lo resuelven `ALIAS_CODIGO` (5126→5009, 5145→5008, 0220→0205), `ALIAS_UNIDAD` (580→6123, 612→6124, 718→6130, 815→6129, 224→5159), el anexo de receptoras o el nombre del gobierno local; sin capítulo vigente, el sector sale de la familia del código (62xx fideicomisos) |
| `nomina` | tabla `NOMINA` (82 códigos de nómina → unidad de compra) y `NOMINA_CLASIFICADOR` (`PJ` → 0301) |
| `consultoria` | etiquetas `Institucion` de `normativa.json` (§5.6) emparejadas por nombre normalizado; la etiqueta «Cámara de Cuentas» se excluye (`ETIQUETA_NOMBRAMIENTOS`) |
| `transferencia`, `transferenciaProyecto` | monto del cuadro de receptoras, solo si el capítulo es de una sola institución |

- **Cobertura** (contada en el archivo): 894 instituciones = 739 unidades de compra + 155 capítulos sin unidad; 528 capítulos en el clasificador; 886 con `clasificador`; 458 con `capitulo` en el SIGEF; 83 con `nomina`; 103 con etiquetas de la Consultoría; 480 con `transferencia` y 477 con `transferenciaProyecto`.

| `sector` | Con unidad de compra | Sin unidad de compra |
|---|---|---|
| `ejecutivo` | 195 | 0 |
| `poderes` | 4 | 5 |
| `descentralizada` | 245 | 2 |
| `seguridad-social` | 8 | 0 |
| `local` | 248 | 145 |
| `empresa` | 26 | 0 |
| `financiera` | 7 | 3 |
| `fideicomiso` | 6 | 0 |

- **`lib/instituciones.ts`** importa el JSON de forma estática. Exporta `INSTITUCIONES`, `FUENTES_DEL_CRUCE`, `SECTORES` (ocho, en el orden del clasificador), `institucionPorId`, `institucionDeSlug`, `institucionesDelCapitulo` (solo unidades de la DGCP), `fichaDelCapitulo`, `cabezaDelCapitulo` (la unidad cuyas palabras con contenido comunes con el nombre del capítulo, sobre la unión de las de ambos, llegan a 0.5), `institucionDeNomina`, `buscarInstituciones`, `seReconocePorNombre` (excluye hospitales y gobiernos locales), `institucionesNombradasEn` (nombres de 18 letras o más) y `getComprasDeInstitucion`. Esta última lee **en vivo** la DGCP (`/contratos` con `unidad_compra`, `page: 1`, `limit: 1000`; `/procesos` de los últimos doce meses, `limit: 1000`), exige las dos respuestas y cachea el resumen ya calculado con `unstable_cache` (clave `compras-de-institucion`, `revalidate: 3600`); un fallo no se cachea.

#### Capa de personas: `funcionarios.json`

`scripts/build-funcionarios.py` lee seis fuentes en este orden y las une por persona: la Junta Monetaria (paso 0, que detiene el script antes de las lecturas largas si falla), el Directorio de Funcionarios del MAP, todos los decretos de la Consultoría Jurídica, las altas cortes y órganos, los electos municipales de 2024 y los legisladores de `congreso.json` (sin red); los cargos de la Junta se registran al final. Cada subsección de abajo describe una fuente.

- **Identidad.** Una persona es su nombre normalizado (sin tildes, en minúscula, `clave()`); nunca la cédula. Dos fuentes que escriben el mismo nombre dan una ficha; dos grafías dan dos. El `id` es el `slug()` del nombre más usado, con sufijo `-2`, `-3` si se repite; los firmantes de decretos se registran primero y conservan el slug sin sufijo. Un firmante cuyos cargos homónimos caen todos a más de `VIDA_PUBLICA` (70) años de sus firmas va en un registro aparte (`otra_epoca`).
- **Lo que no se lee ni se guarda**: cédula, género, sexo, teléfonos, correo, extensión, foto, biografías y parentescos.
- **PEP.** `LEY_311` enumera 28 numerales del art. 2 de la Ley 311-14 (la Ley 155-17, art. 2, num. 19, define PEP como todo funcionario obligado a declarar patrimonio). `numeral_311(cargo, institucion, grado)` recorre `REGLAS_311` (expresiones sobre el texto plano del cargo); para los numerales 3, 4, 5, 9, 10, 11, 13, 21, 30 y 31 también sobre «cargo + institución»; un grado de oficial general da el 23; sin coincidencia, `None`. Los legisladores reciben el 2; los directores y subdirectores de distrito municipal, el 15; los miembros de la Junta Monetaria, el 31. `lib/funcionarios.ts` deriva por persona `pep` (numerales de todos sus cargos) y `pepVigente`: un cargo con numeral que su fuente da como actual (`movimiento` `vigente`, o `electo` con `periodo` `2024-2028`) o cuya fecha más reciente (fin del período, o la fecha del cargo) cae dentro de los tres años anteriores a `generado` (`haceTresAnios`). `lib/cargos.ts` agrupa los numerales en nueve familias (`FAMILIAS_PEP`) y nombra los movimientos (`ETIQUETA_MOVIMIENTO`); vive aparte y no lee el archivo. La ficha `/funcionarios/[slug]` lleva `robots: { index: false, follow: true }` si `pepVigente` es falso, y `app/sitemap.ts` solo lista personas con `pepVigente`.
- **Institución de un cargo.** Clase `Instituciones` del script, sobre `instituciones.json`: `por_nombre` (nombre plano exacto; si no, palabras con índice ≥ 0.6 y ventaja ≥ 0.15 sobre el segundo; si no, inclusión con la misma primera palabra) y `de_cargo` (nombre completo dentro del cargo, palabras, siglas; embajadores y cónsules al MIREX). Ante la duda, sin enlace.
- **Instantánea.** `generado` 2026-09-29 (con `--sin-red`, la fecha de la caché de `map.json` y `decretos.json`). Claves cortas: persona `{id, n, a, c, f, leg, pep}`, cargo `{t, u, i, in, pr, d, m, o, dec, g, per, par, v, pep, n, url, por}`; `fuentes` por origen y `ley311`.
- **Caché del script.** `--cache` (por omisión `$TMPDIR/socratico-funcionarios`): `junta.json`, `map.json` y `decretos.json` (frescos 24 h), `organos.json`, `electos-2024.xlsx`, `texto/{DocId}.txt`. `--sin-red` rehace solo desde ella. Dependencias de build: `pdfminer.six`, `pypdf`, `openpyxl` y, si un origen fuerza brotli, `brotli`.
- **Red.** `pedir()`: pausa por host (1 s por omisión), un reintento ante fallo de red; 401, 403, 429 y 470 lanzan `Rechazo` y no se reintentan; 404 y 410, `NoExiste`; `content-type` validado.
- **Controles** (no escribe si): la Junta Monetaria no se lee o trae menos de cinco miembros; el MAP trae menos de 5,000 filas o distinto de su `elementostotales`; la Consultoría menos de 75,000 decretos; fallan por red más de `max(20, n/20)` PDF; no aparece el Presidente de la República con su firma.
- **Cobertura** (contada en el archivo): 15,612 personas, 18,432 cargos (14,359 atados a una institución del cruce), 533 personas con otras grafías, 41 firmantes de decretos (40 de ellos sin cargo), 221 legisladores, 4,913 personas con algún numeral y 2,941 con `pepVigente`.

| Origen (`o`) | Cargos | Personas |
|---|---|---|
| `decreto` | 8,269 | 6,631 |
| `map` | 6,129 | 6,128 |
| `jce2024` | 3,736 | 3,735 |
| `congreso` | 221 | 221 |
| `tse` | 21 | 17 |
| `scj` | 17 | 17 |
| `tc` | 13 | 13 |
| `bcrd` | 10 | 10 |
| `jce`, `jce-suplentes` | 5 + 5 | 5 + 5 |
| `cpj` | 5 | 5 |
| `defensor` | 1 | 1 |

Movimientos: `designa` 7,473 · `vigente` 6,190 · `electo` 3,957 · `sustituido` 422 · `cesa` 259 · `confirma` 101 · `anterior` 16 · `asciende` 14.

- **`lib/funcionarios.ts`** (servidor). `getFuncionarios` construye `porId`, `porInstitucion` y `porDecreto`. Lecturas: `personaPorId`, `personaPorFirma` (la clave de firma que usa `lib/decretos.ts`), `personaDeLegislador`, `personaPorNombre` (nombre exacto de tres palabras o más y una sola persona), `filtrarPersonas`/`contarPersonas`, `cabezasDelEstado`, `gabinete` (orden 3 del MAP), `quienDirige` (el cargo de cabeza que su fuente da como actual —MAP, órgano o elección de 2024—, por `orden`; si no hay, la designación de cabeza más reciente por decreto, de fecha igual o posterior a la primera firma del Presidente en funciones y sin cese, renuncia o sustitución posterior en esa institución), `gobiernoDeProvincia`, `personasDeInstitucion`, `personasDelDecreto`, `parecidos`, `puntaje`.

#### MAP · Directorio de Funcionarios ✅

- **Institución y servicio.** Ministerio de Administración Pública, Observatorio de Servicios Públicos (`observicios.gob.do`); la página pública `https://observicios.gob.do/officials` (`MAP_PUBLICO`) es una SPA que enlaza el Portal Único de Transparencia.
- **Endpoint.** `MAP_URL` = `POST https://observicios.gob.do/back/api/portal/funcionarios` con cuerpo JSON `{"page": N, "rows": 500}`, sin sesión ni clave → `{"valid":true,"content":{"elementostotales","page","rows","paginastotales","repuestas":[…]}}` (sic).
- **Paginación.** 500 filas por página hasta `paginastotales` (13 lecturas), dos segundos entre peticiones, espera de 90 s.
- **Campos que se guardan** (`leer_map`, también en la caché): `funcionarioId`, `institucion`, `funcionario`, `cargoPrincipal`, `unidadNombreCompleto`, `decreto`, `fechaDecreto`, `estado`, `orden`. Filas con `estado` falso se saltan. Un «Ministro» a secas se completa con la institución; un gobernador, con la provincia que da su unidad («Oficina de Gobernación Provincial de…»).
- **Observado** (2026-09-29): 6,153 filas; `decreto` en 612; `orden` jerárquico (1 Presidente, 2 Vicepresidencia, 3 ministros, 4 viceministros, 13 directores generales, 15 ejecutivos, 25 alcaldes, 29 regidores, 31–49 directores de área y encargados); `declara` viene en falso para todas las filas; `fechaSalida` repite la fecha del decreto; la ruta de robots devuelve el cascarón de la SPA; el cliente añade `Authorization` solo con sesión; `GET /back/api/portal/detalles_funcionario/{id}` responde JSON sin clave (no se usa); la página pública pide de 10 en 10 (616 lecturas).
- **Cobertura.** 6,153 filas (`fuentes.map.filas`), 6,129 cargos `map`; 11 nombres de institución del MAP sin ficha en el cruce (`institucionesSinFicha`).

#### Consultoría Jurídica · designaciones, ceses y firmantes ⚠️

Límite: las designaciones de decretos de varias personas anteriores al 16-08-2012, y los PDF escaneados posteriores, no se leen.

- **Lectura del registro.** La misma que `scripts/build-decretos.py`, por `scripts/consultoria_decretos.py` (`leer_decretos`, `POST https://www.consultoria.gov.do/api/consultas/search` con `DocumentTypeCode: 3` y el año vacío); mecánica en §5.6. Se guardan seis campos (`CAMPOS`: `DocId`, `Numero`, `Titulo`, `FechaPromulgacion`, `Presidente`, `Institucion`); la cédula y los campos de persona del buscador no se escriben, tampoco en la caché.
- **Títulos.** Desde `DESDE_TITULOS` (1996-08-16), un título que nombra a **una** persona da un cargo (`es_designacion`, `personas_del_titulo`): «DESIGNA/NOMBRA/ENCARGA» → `designa`; «CONFIRMA/RATIFICA» → `confirma`; «ASCIENDE … Y LO DESIGNA» → `designa`; «QUE DESIGNÓ/NOMBRÓ A X» → `cesa`; «ACEPTA LA RENUNCIA» → `renuncia`. `EXCLUIR_TITULO` deja fuera exequátur, pensiones, jubilaciones, condecoraciones, naturalizaciones, indultos, conmutaciones, personalidades jurídicas e incorporaciones.
- **PDF.** Desde `DESDE_PDF` (2012-08-16), un título que nombra a varias personas (`VARIOS`, «RESPECTIVAMENTE») o que dice «DESIGNA/NOMBRA» sin una persona legible pasa al PDF: `GET https://www.consultoria.gov.do/api/document/{DocId}` (pausa 1.5 s, espera 90 s), texto con `pdfminer.six` con un plazo de 40 s (`SIGALRM`) y, si se pasa, `pypdf` (`_extraer`); fórmula «Artículo N.- X queda designado Y», con grado militar y «en sustitución de Z» (que da un cargo `sustituido` con `por`). `es_escaneo` descarta un texto con tres o más huellas de OCR.
- **Firmante.** `firmas_presidenciales` cuenta decretos y rango de fechas por `Presidente`; se ignoran firmas con menos de cinco decretos o que casan `TRIUNVIRATO|JUNTA|CONGRESO|CONSEJO|GOBIERNO`. La firma vigente se ata a quien el MAP da como Presidente de la República si todas las palabras de la firma están en su nombre.
- **Cobertura** (`fuentes.decretos`): 78,834 decretos; 4,856 designaciones y ceses de títulos; 963 PDF leídos con 2,998 designaciones; 5 PDF sin texto y 17 escaneos sin leer; 41 firmantes.

#### Altas cortes y órganos constitucionales ✅

Solo nombre, cargo y período (`leer_organos`); cada órgano por su lado: si uno falla, `fuentes.organos.<origen>.error` lo dice y los demás siguen. Si la SCJ trae menos de 12 o el TC menos de 9, el script avisa y escribe.

| Origen | URL (constante) | Formato y lectura | Filas | `modificado` |
|---|---|---|---|---|
| `scj` | `https://poderjudicial.gob.do/wp-json/wp/v2/pages?slug=jueces-actuales-spj&_fields=id,link,modified,content` (`SCJ`) | WP REST, JSON con BOM; «Magdo./Magda. Nombre» y el cargo en la línea siguiente | 17 | 2026-01-07 |
| `cpj` | `…/wp-json/wp/v2/pages?slug=composicion-cpj&_fields=id,link,modified,content` (`CPJ`) | WP REST; nombre y, debajo, «Juez…» o «Consejer…» | 5 | 2026-05-07 |
| `tc` | `https://tribunalconstitucional.gob.do/sobre-el-tc/pleno/magistrados/` (`TC`) | HTML; `<a href="/sobre-el-tc/pleno/magistrados/…"><strong>Nombre</strong></a><span>Cargo</span>` | 13 | — |
| `tse` | `https://tse.do/wp-json/wp/v2/pages?slug=pleno-tse&_fields=id,link,modified,content` (`TSE`) | WP REST; bloques «GESTIÓN AAAA – AAAA», nombres y cargos emparejados por posición; el primer bloque es el vigente, los demás `anterior` | 21 (5 vigentes) | 2026-05-27 |
| `jce` / `jce-suplentes` | `https://jce.gob.do/Miembros-Titulares` / `https://jce.gob.do/Miembros-Suplentes` | HTML; «Nombre , Presidente JCE» / «Miembro Titular» / «Miembro suplente», gestión 2024-2028 | 5 / 5 | — |
| `defensor` | `https://defensordelpueblo.gob.do/wp-json/wp/v2/pages?slug=despacho-defensor-del-pueblo&_fields=id,link,modified,content` (`DEFENSOR`) | WP REST; el nombre antes de «Defensor del Pueblo» | 1 | 2026-04-15 |

- **Observado** (2026-09-29): el servidor del Poder Judicial no envía el intermedio «Sectigo Public Server Authentication CA OV R36»; va en `scripts/certificados/sectigo-ov-r36.pem` y `contexto_pj()` lo carga con la verificación TLS encendida. robots: Poder Judicial 0 bytes, TC 404, TSE `Allow: /` (`tse.gob.do` → 301 a `tse.do`), JCE 404 (DotNetNuke tras Zenedge). La JCE respondió una vez en brotli sin pedirlo; el script envía `Accept-Encoding: identity` y descomprime brotli si llega. Cámara de Cuentas y Procuraduría responden 470 (2026-09-29; §5.11).

#### JCE · electos municipales de 2024 ✅

- **Endpoint.** `JCE_ELECTOS` = `GET https://elecciones2024.jce.gob.do/DesktopModules/EasyDNNNews/DocumentDownload.ashx?portalid=0&moduleid=469&articleid=10&documentid=14`, enlazado desde `JCE_ELECTOS_PAGINA` (`…/sala-de-prensa/relacion-general-definitiva-del-computo-del-proceso-municipal-2024`). Se exige un cuerpo que empiece por `PK`; si no, `Rechazo`.
- **Formato.** XLSX de una hoja leído con `openpyxl` (`leer_electos`): `PROVINCIA, MUNICIPIO, CIRC., DISTRITO MUNICIPAL, CARGO, POSICION_ELEC, ORGANIZACION POLITICA, NOMBRE/APELLIDO, SEXO, VOTOS`; el sexo no se lee.
- **Armado.** El cargo nombra el puesto («Alcaldía de…», «Regiduría de…», «Dirección del distrito municipal…»), con fecha 2024-04-24, `periodo` `2024-2028`, partido y votos. El ayuntamiento o la junta se enlaza solo si el nombre del lugar, sin «Ayuntamiento (Municipal) (del Municipio) de», es único entre los gobiernos locales del cruce.
- **Observado:** 200 `application/octet-stream`, 252,057 B, sin CAPTCHA en una lectura (2026-09-29); en descargas del mismo sitio, CAPTCHA de Zenedge tras unas seis peticiones (2026-09-01).
- **Cobertura.** 3,858 filas (`fuentes.electos2024.filas`); 3,736 cargos `jce2024`.

#### Banco Central · Junta Monetaria ✅

- **Endpoint.** La página `JUNTA_PAGINA` (`https://www.bcrd.gov.do/a/d/2557-miembros-jm`) pide su contenido con `JUNTA_CONTENIDO` = `POST https://www.bcrd.gov.do/Home/GetContentForRender`, cuerpo `id=2557&languageName=es` (`application/x-www-form-urlencoded`).
- **Formato.** JSON dentro de `text/html`; los nombres y cargos van en el HTML de `result.article.content`. `junta_del_html` quita los comentarios HTML (un miembro retirado queda comentado), recorre los bloques `col-…` y sus encabezados («Miembros ex-oficio», «Miembros»). Numeral 31 para presidente y miembros; la secretaria, sin numeral. Institución 905002 (`BCRD`), origen `bcrd`.
- **Observado:** con `id=2557` → 200, 3,501 B, diez personas (2026-09-30); con `id=2557-miembros-jm`, `"article": null` (2026-09-29).
- **Cobertura.** `fuentes.organos.bcrd`: 10 filas, `modificado` 2025-09-18 (`publicationDateFrom`), `leido` 2026-09-30.

Los 221 legisladores entran desde `public/data/congreso.json` sin red (§5.5).

#### Declaraciones juradas de patrimonio ⚠️

Límite: solo las que las instituciones publican en sus portales; el registro central de la Cámara de Cuentas no se lee.

- **Instituciones y servicios.** Las bibliotecas WordPress de los 23 hosts de `scripts/build-documentos.py` (§5.10), las segundas instalaciones de WordPress de MAPRE (`mapre.gob.do/transparencia`, id 134) y de la Vicepresidencia (`vicepresidencia.gob.do/transparencia`, id 1043), y la página `PRESIDENCIA` = `https://presidencia.gob.do/transparencia/declaraciones-juradas` (id 1155, la Dirección de Estrategia y Comunicación Gubernamental en el cruce).
- **Endpoints.** `GET https://{base}/wp-json/wp/v2/media?search=declaracion&media_type=application&per_page=100&page=N&_fields=id,date,title,source_url,mime_type`; la página de la Presidencia, HTML con acordeón por año (`<h5>` con nombre y cargo, enlaces `.pdf`).
- **Acotación.** `robots.txt` primero en cada host (`documentos.robots_permite`), GET, un segundo entre peticiones (`documentos.PAUSA`), un reintento, `content-type` validado, a lo sumo cinco páginas de 100 por host (`TOPE_PAGINAS`, `x-wp-totalpages`). Filtro por título o URL (`documentos.DECLARACION`: «declaración jurada», «DJP») y exclusión de lo que no es de una persona (`NO_PERSONAL`).
- **Qué se guarda.** Título (240 caracteres), fecha de subida, URL original, índice de la fuente, nombre leído del título (`nombre_del_titulo`, sin `RUIDO` ni cargos) y la persona atada. Ningún PDF se copia ni se lee.
- **Atadura** (`atar`): todas las palabras del nombre leído están en el de una persona de `funcionarios.json` y esa persona tiene un cargo en la institución que publica (`via: "institucion"`), o el nombre tiene tres palabras o más y es único en toda la instantánea (`via: "nombre"`). Si no, sin persona. El script no escribe con menos de 40 declaraciones.
- **Instantánea.** `public/data/declaraciones.json`, `generado` 2026-09-30, con `camara` = `https://consultadjp.camaradecuentas.gob.do/` y 26 fuentes (25 con `estado: "ok"`; `ambiente.gob.do` con `robots`, «robots 403»).
- **Cobertura** (contada en el archivo): 105 declaraciones de 7 instituciones: MIP 55, MAPRE 15, MIVHED 12, Presidencia 9, DIGEIG 8, OGTIC 4, INTRANT 2; 67 atadas (58 por institución, 9 por nombre).
- **`lib/declaraciones.ts`** (servidor): `getDeclaraciones`, `declaracionesDe`, `declaracionesParecidas` (sin atar, nombre de tres palabras o más contenido en el de la persona), `declaracionesDeInstitucion`, `institucionesQuePublican`. Las pinta `components/fuentes-nuevas/declaracion-jurada.tsx`.
- **Observado** (2026-09-30): ❌ la Consulta Pública de DJP (`consultadjp.camaradecuentas.gob.do`) responde 200 `text/html` (ASP.NET MVC); el listado sale por `POST Home/dtSourceDetalle` y el documento exige un CAPTCHA (`POST /Reportes/ValidarCaptcha`): no se lee y la ficha lo enlaza. `camaradecuentas.gob.do/index.php/reportes-djp` → 470. `djurada.camaradecuentas.gob.do/DJP_OJO_CIUDADANO/pgReportesDJPExternos.aspx` → 404. La página de la Presidencia lista PDF de 2012 a 2021. Las listas de omisos y tardíos de la Cámara de Cuentas están en §5.10.

#### DGII · padrón de contribuyentes (personas jurídicas) ✅

- **Institución y servicio.** Dirección General de Impuestos Internos; ZIP estático sin clave. robots de `dgii.gov.do`: solo veta rutas de SharePoint (`/_layouts/`, `/_vti_bin/`, `/_catalogs/`) (2026-09-23).
- **Endpoints** (`scripts/build-empresas.py`):
  - `URL_DGII` = `https://dgii.gov.do/app/WebApps/Consultas/RNC/RNC_CONTRIBUYENTES.zip` → dentro, `RNC_Contribuyentes_Actualizado_<dd>_<Mes>_<aaaa>.csv`; el nombre da el corte (`corte_iso`).
  - `URL_RPE` = `https://datosabiertos.dgcp.gob.do/api-dgcp/v1/tablas/proveedores?Type=csv&inhabilitados=false` (tabla entera del Registro de Proveedores, §5.1): solo `RPE`, `NUMERO_DOCUMENTO`, `TIPO_DOCUMENTO`, `ESTADO_RPE` y la fecha de última actualización; ni teléfonos, ni correos, ni contactos.
- **Método y formato.** GET con un reintento y `content-type` validado; descargas en `.cache/empresas/` (`--cache` las reutiliza). CSV en Windows-1252, todo entre comillas, fechas `DD/MM/AAAA`, columnas `RNC, RAZÓN SOCIAL, ACTIVIDAD ECONÓMICA, FECHA DE INICIO OPERACIONES, ESTADO, RÉGIMEN DE PAGO` (`COLUMNAS`). Entre dos letras, «¤» y «¥» se leen como ñ/Ñ (`limpiar`); el espacio duro pasa a espacio.
- **Quién entra.** Solo personas jurídicas; el padrón no trae tipo de persona y `Personas.motivo` lo deduce. Fuera: los documentos de 11 cifras (cédulas), los RNC de 9 cifras que empiezan por 5, y entre los que empiezan por 1 o 4 sin forma jurídica (`FORMA`: SRL, S.A., EIRL…): las sucesiones (actividad «IMPUESTO SUCESORAL» o primera palabra en `SUCESION`), el lote de RNC `1306…` con inicio 2009-01-01 sin palabra de negocio, y las razones sociales hechas de nombres y apellidos (frecuencias de cada palabra entre las cédulas del mismo padrón frente a las razones sociales con forma jurídica; «Y» o «&» entre nombres se queda). Es una heurística. Ninguna cédula se escribe en la salida; `lib/padron.ts` (`esRncDeEmpresa`: nueve cifras que empiezan por 1 o 4) no busca una cédula, y `sinCedula`/`llevaCedula` aplican las formas de `scripts/privacidad.py` (el gate las comprueba en las instantáneas, §12).
- **Controles.** No escribe con menos de 300,000 personas jurídicas (`MIN_EMPRESAS`), menos de 600,000 contribuyentes (`MIN_CONTRIBUYENTES`), columnas distintas o más de 2²¹ empresas; escribe en `empresas-nuevo` y reemplaza `public/data/empresas/` al final.
- **Instantánea** `public/data/empresas/`:

| Archivo | Contenido | Tamaño |
|---|---|---|
| `filas/000.tsv.gz` … `479.tsv.gz` | 1,024 empresas por archivo en orden de RNC: `rnc, razonSocial, actividad, inicio (AAAAMMDD), estado, rpe` separados por tabulador; la línea global es el id | 9,353,042 B |
| `indice/a.bin` … `z.bin`, `num.bin` | índice invertido por palabra de la razón social (formato `EMP1`: cabecera, palabras en latin1, desplazamientos u32, listas de ids en deltas LEB128 con el bit bajo «empieza por ella»); de 13,078 B (`x`) a 755,684 B (`s`) | 6,368,179 B |
| `rango.bin` | un byte por empresa: palabras de la razón social (hasta 15), activa, proveedora | 490,814 B |
| `actividades.json` | 2,016 textos de actividad | 127,944 B |
| `meta.json` | corte, conteos, exclusiones, primer RNC de cada bloque, `proveedoresSinFicha` | 8,473 B |

- **Corte** (`meta.json`): `generado` 2026-09-29; `archivoDgii` `RNC_Contribuyentes_Actualizado_19_Sep_2026.csv`; `corteDgii` 2026-09-19; `modificadoDgii` `Sat, 19 Sep 2026 05:00:59 GMT`.
- **Cobertura** (`meta.json`): 791,384 contribuyentes, 501,243 de nueve cifras; 490,814 personas jurídicas. Fuera: `cedula` 290,140 · `lote2009` 4,316 · `sucesion` 3,995 · `rncDePersona` 1,794 · `nombre` 324 · `rncInvalido` 1. Estados: ACTIVO 244,631 · SUSPENDIDO 170,466 · DADO DE BAJA 68,540 · CESE TEMPORAL 6,266 · ANULADO 636 · RECHAZADO 275. 79,255 empresas con RPE (137,909 proveedores en el RPE); 130 razones sociales reparadas; 244,098 palabras indexadas.
- **`lib/empresas.ts`** (servidor). `empresaPorRnc`: búsqueda binaria en `meta.bloques`, un bloque leído y otra búsqueda binaria; `undefined` para un número que no es de persona jurídica. `buscarEmpresas`: raíces y cifras de la consulta (`agujas` de `lib/raiz.ts`), un fragmento del índice por inicial, cruce de listas, orden por `rango.bin` (palabras tecleadas tal cual, razón social que empieza por una de ellas, activa, proveedora, número de palabras, RNC) y lectura solo de los bloques de la página; `ALCANCE` 500 resultados recorribles, 25 por página, hasta 96 bloques en memoria (`MAX_BLOQUES`). `padronEmpresas` devuelve el corte. Medido 2026-09-29 con el corte del 19-09-2026: por RNC, 5 ms en frío y 0.1 ms en caliente; «srl» (300,704 coincidencias), 122 ms en frío y 90 ms en caliente; una ficha con `next start`, 28–38 ms en caliente y 0.64 s en frío.
- **Observado.** El ZIP: 200 `application/x-zip-compressed`, 26,878,229 B, `last-modified` 19-sep-2026; el CSV interior, 115,606,459 B (2026-09-29). El archivo cambia hacia el día 19 de cada mes. El nombre `DGII_RNC.zip` → 403, y la consulta web `rnc.aspx` y `wsMovilDGII` devuelven la portada (2026-09-01). En el CSV: 67 razones sociales con «¿» donde falta un carácter, actividad cortada a 128 caracteres, fechas de inicio vacías, `00/00/0000`, del año 1000 o de los 2040 (2026-09-29). El mismo ZIP lo lee `scripts/build-rnc.py` (§5.1). Las fuentes de empresas que no se leen (registro mercantil, ONAPI, ASFL) están en §5.11.

#### Superintendencia de Bancos · entidades supervisadas ⚠️

Límite: el cortafuegos Sucuri de la SB responde con un desafío; la instantánea trae solo las entidades de intermediación financiera.

- **Institución y servicio.** `sb.gob.do` (Umbraco tras Sucuri). robots: `User-agent: *` / `Disallow: /umbraco/` (2026-09-29); el script lo lee primero (`robots_permite`) y nunca pide `/umbraco/`.
- **Endpoints** (`scripts/build-banca.py`): `GET https://sb.gob.do/supervisados/<categoría>/?page=1&size=100` (listado HTML: una tarjeta `entity_card` por entidad y «Mostrando N entradas», que se coteja); `GET https://sb.gob.do/supervisados/<categoría>/<slug>/` (ficha); `SB_CSV` = `https://sb.gob.do/media/4g4nrdxa/listado-de-entidades-autorizadas-a-operar-2018-2026.csv` (`ENTIDAD,TIPO DE ENTIDAD,MES,AÑO`, sin RNC); `SB_SUBAGENTES` = `https://sb.gob.do/supervisados/subagentes/` (solo los conteos). Categorías en `CATEGORIAS_SB`: intermediación financiera, intermediación cambiaria, fiduciarias, sociedades de información crediticia, oficinas de representación.
- **Método.** GET, diez segundos entre peticiones a la SB (`PAUSA_HOST`), espera de 60 s, un reintento; ante un 403/429/470 o un desafío, `Bloqueado`: no se le pide nada más a la SB y se escribe lo leído entero, con lo que falta en `resumen.sbNoLeidas`. `--cache D` guarda las respuestas; `--cache D --sin-red` rehace desde ellas sin peticiones. Unas 110 peticiones a la SB por corrida.
- **Qué se guarda.** Nombre, razón social, RNC (solo si tiene nueve cifras), registro SB, tipo, estatus o aviso, activos, participación, empleados, oficinas, cajeros, subagentes, número de accionistas, calificación y calificadora, servicios, consejo y principales funcionarios (nombre y cargo), web, enlaces a estados financieros y memorias en PDF (no se leen), «datos actualizados al» (`corte`). Ni teléfonos, ni correos, ni direcciones; el script no escribe si la salida contiene uno.
- **Observado** (2026-09-29): a un segundo entre peticiones, tras unas 70, HTTP 307 sin `Location`, «You are being redirected…», `sucuri_cloudproxy_js`; cinco minutos después dejó pasar dos y volvió a desafiar. Una respuesta tardó 16 s y otra se cortó a los 25 s. El listado de intermediación financiera pesó 220,959 B con 47 entidades. Los listados declaran 42 cambiarias, 5 fiduciarias, 4 burós y 5 oficinas de representación; «Otras entidades» (13) y auditores (38) usan otra plantilla (`perfil/?id=`). El CSV: 11,183 filas de enero de 2018 a junio de 2026, nombres cortados a 60 caracteres. SIMV y el registro de intermediarios de seguros no se leen (§5.11). SIMBAD está en §5.4.
- **Cobertura** (`banca.json`): 47 entidades SB (18 bancos múltiples, 14 de ahorro y crédito, 10 asociaciones, 3 corporaciones de crédito, 2 entidades públicas; 45 «Operando», 1 «Cancelado», 1 «En liquidación administrativa»), 45 con RNC; `cortes.sb` de 2025-02-06 a 2026-09-29; `registroCasadas` 44 (`registroDesde` por razón social exacta); subagentes 7,454 (7,161 bancarios, 293 cambiarios). `resumen.sbNoLeidas` lista cambiarias (42), fiduciarias (5), información crediticia (4) y oficinas de representación (5) con `motivo: "sin-cache"`.

#### SIPEN · administradoras de fondos de pensiones ✅

- `SIPEN_AFP` = `GET https://sipen.gob.do/institucional-normativas/administradora-de-fondos-de-pensiones` → HTML con una tarjeta por AFP: razón social, web, fecha de registro y resolución de la SIPEN; sin RNC. robots `Disallow:` vacío y TLS válido por el proxy (2026-09-29). El script no escribe con menos de 5 AFP. Cobertura: 7 AFP.

#### Superintendencia de Seguros · compañías ✅

- `SIS_CIAS` = `GET https://sis.gob.do/companias-aseguradoras-y-reaseguradoras/` → WordPress, tabla de texto libre; se lee solo el nombre en negrita, las siglas o el nombre anterior entre paréntesis y la web; sin RNC; no separa aseguradoras de reaseguradoras. `superseguros.gob.do` → 301 a `sis.gob.do`; robots abierto salvo `/wp-admin/` (2026-09-29). El script no escribe con menos de 25 compañías. Cobertura: 35.

#### IDECOOP · cooperativas incorporadas ⚠️

Límite: el archivo cubre las incorporaciones de julio de 1953 a junio de 2024 y no dice cuáles siguen activas.

- `IDECOOP_PAGINA` = `https://idecoop.gob.do/servicios/cooperativas-incorporadas/` enlaza `IDECOOP_XLSX` = `https://idecoop.gob.do/wp-content/uploads/2024/07/Cooperativas-Incorporadas-por-Centros-Regionales-Julio-1953-Junio-2024.-IDECOOP-Excel.xlsx`: hoja `Coop_Incorporadas_1953_2024`, 2,304 filas, leída con `zipfile`. Se leen nombre, siglas, tipología, número y fecha del decreto de incorporación, año, centro regional y provincia; la dirección no. Entran las de tipología de ahorro, de crédito o solo de servicios múltiples. robots abierto salvo `/wp-admin/` (2026-09-29). El script no escribe con menos de 2,000 incorporadas o menos de 900 financieras. Cobertura (`resumen`): 1,211 incluidas de 2,304; `cortes.idecoop` 2024-06.

**`banca.json` y `lib/financieras.ts`.** 1,300 entidades (`cooperativa` 1,211, `aseguradora` 35, `banco-multiple` 18, `ahorro-credito` 14, `asociacion` 10, `afp` 7, `corporacion-credito` 3, `entidad-publica` 2), supervisor `sb` 47, `sipen` 7, `sis` 35, `idecoop` 1,211. El módulo (servidor) exporta `getFinancieras`, `entidadPorSlug`, `entidadPorRnc`, `filtrarEntidades`, `ordenarEntidades`, `resumenSistema`, `faltanDeLaSb`, `institucionDe` (nombre o razón social exactos contra el cruce, o `INSTITUCION_POR_SLUG`: `banreservas` → 905004, `bandex` → 905003), `entidadDeInstitucion`, `decretoConFicha`, `formatRnc`, `SECTORES` (doce) y `SUPERVISORES`. `app/banca/[slug]/page.tsx` enlaza un nombre del consejo o de los funcionarios a `/funcionarios` solo si `personaPorNombre` da una persona con un cargo en la misma entidad.

#### Wikidata vía QLever ✅

- **Servicio.** Réplica de Wikidata de QLever (Universidad de Friburgo), `QLEVER` = `https://qlever.dev/api/wikidata`; robots → 404, sin reglas (2026-09-30).
- **Método.** `GET ?query=<SPARQL>` con `Accept: application/sparql-results+json`, seis segundos entre consultas (`PAUSA`), espera de 120 s, un reintento; un 429 se respeta con `Retry-After` (a lo sumo 120 s). Cinco consultas por corrida.
- **Correspondencias** (`scripts/build-wikidata.py`; solo pares únicos en los dos sentidos, `unico`):

| Tipo | Consulta | Contra |
|---|---|---|
| `provincias` | divisiones `P150` de `Q786`, etiquetas y alias en español | `slug`/`nombre` de `lib/provincias.ts`, sin «provincia (de)» |
| `instituciones` | país `Q786` y clase (con subclases) `Q327333`, `Q192350`, `Q2659904`, `Q270791`, `Q17149090`, `Q43229`, `Q3918`; etiquetas y alias en español | nombre plano exacto de `instituciones.json` |
| `financieras` | país `Q786` y clase `Q22687`, `Q650241`, `Q4539`, `Q2143354`, `Q745877`, `Q2091703`, `Q848507`, `Q182103`, `Q270791`; español o inglés | `nombre` o `razonSocial` de `banca.json` |
| `personas` | titulares de `Q607982` (P39); humanos (`Q5`) con ciudadanía `Q786` y algún cargo (P39) | firmantes de decretos por palabras del nombre; personas con numeral o escaño por nombre completo exacto de tres palabras o más |

- **Qué se guarda.** Solo el QID por id de nodo; ni descripciones, ni fotos, ni datos de una persona. El script no escribe con menos de 30 provincias.
- **Instantánea.** `public/data/wikidata.json`, `generado` 2026-09-30: 32 provincias, 30 instituciones, 2 financieras, 64 personas.
- **`lib/wikidata.ts`** (servidor): `getWikidata`, `wikidataDe(nodo)`, `hrefWikidata`. `lib/grafo-constructores.ts` emite el QID de una persona solo si `pepVigente` o `firma` (45 de las 64 en la instantánea); el uso en el grafo está en §7.
- **Observado** (2026-09-30): ❌ `query.wikidata.org` veta `/sparql` y `/bigdata` en su robots; `www.wikidata.org` veta `/w/` y `/wiki/Special:` salvo `/wiki/Special:EntityData/<QID>.<formato>` (lectura de un elemento conocido). QLever respondió en menos de un segundo; la consulta de provincias por etiqueta recibió un 429 y se escribe por `P150`.

### 5.8 Nómina estatal

Dos instantáneas sin nombres ni género: la foto transversal de las nóminas que publica cada institución (plaza por plaza, con área) y la Nómina Pública General del MAP (agregada por institución y cargo, sin área).

| Instantánea | Script | Módulos | `generado` | Corte | Tamaño |
|---|---|---|---|---|---|
| `public/data/nomina.json` | `scripts/build-nomina.py` | `lib/nomina.ts` (navegador), `lib/nomina-server.ts` (servidor) | 2026-09-24 | último mes de cada institución (2021-12 a 2026-08) | 2,364,333 B |
| `public/data/nomina-general.json` | `scripts/build-nomina-general.py` | `lib/nomina-general.ts` (servidor) | 2026-09-24 | julio de 2026 | 960,944 B |

#### Nóminas institucionales (Ley 200-04) · foto transversal ⚠️

Límite: un mes por institución, el último que publica cada una, y solo las 86 cuyo archivo se lee sin adivinar.

- **Instituciones y servicios.** Cada institución publica su nómina en su portal de transparencia (Ley 200-04); la mayoría de las URL salen de las fichas HTML de datos.gob.do (§5.10). `MANIFEST` en `scripts/build-nomina.py`: 87 códigos → nombre y URL del CSV (una tupla si publica varios archivos: INAPA cuatro, OPRET dos, Registro Inmobiliario dos). `CESAC` no tiene URL: su archivo es `scripts/fuentes-nomina/CESAC.csv`, el único versionado (`scripts/fuentes-nomina/.gitignore` ignora los demás `*.csv`). `EXCLUIDAS` deja fuera `ICM` («sueldos sin separador decimal, ilegibles sin adivinar»): 86 instituciones.
- **Método** (`descargar`, con `--descargar`). GET con el UA, un reintento, `content-type` HTML rechazado, cuerpo que empieza por `<` rechazado; un ZIP con un único `.csv` se abre (Agricultura). Diez segundos entre peticiones a datos.gob.do (su `Crawl-Delay: 10`), dos a los demás hosts. Los archivos van a `scripts/fuentes-nomina/<CÓDIGO>.csv`, `<CÓDIGO>-2.csv`…; sin `--descargar`, el script usa los que estén.
- **Formato y lectura** (`read_rows`). Codificación elegida entre `utf-8-sig`, `cp1252`, `cp850` y `latin-1` por el español más sano (`decode_best`); delimitador `;` o `,` por la primera línea con alguno; columnas por sinónimos tolerantes a mojibake (`col_map`: sueldo, cargo, área, mes, año; nada con «FECHA», «APORT» o «NETO» es sueldo); montos con `,` o `.` decimal (`parse_money`); meses por nombre o número; años 2015–2030. Una fila queda como `(año, mes, área, cargo, sueldo bruto)`; nombres y género no se leen.
- **Mes de la foto** (`ultimo_mes`). El período más reciente que no está en el futuro; con varios archivos, el último que publican todos.
- **`sanear`.** Quita filas de total (`MONTO TOTAL`); en `SOLO_PESOS` (MIREX) quita las plazas en RD$0 (el personal en el exterior cobra en US$); intercambia cargo y área si más de la mitad de los cargos parecen dependencias; vacía un área que trae el sexo. Controles que detienen la escritura: más de 5 % de plazas en RD$0, una fila con más del 40 % de la masa, un sueldo de más de 40 veces la mediana, mayoría de cargos que parecen dependencias, mayoría sin cargo, más de 5 % de cargos numéricos.
- **Formato de la instantánea.** `{generatedAt, esquema: "transversal-ultimo-mes", currency: "DOP", monthNames, instituciones: [{codigo, nombre, anio, mes, plazas, masa}], areas: [], cargos: [], rows: [[inst, area, cargo, sueldo]]}`; `inst`, `area` y `cargo` son índices de diccionario.
- **Cobertura** (contada en el archivo): 86 instituciones, 94,659 plazas, masa mensual RD$4,065,057,396, 4,368 áreas, 9,083 cargos. La mayor es DAEH (8,949 plazas). MIREX publica 1,239 plazas en pesos.

| Mes de la foto | Instituciones |
|---|---|
| 2026-08 | 49 |
| 2026-07 | 15 |
| 2026-06 | 11 |
| 2026-05 | 2 |
| 2026-04 | 2 |
| 2026-03 | 3 |
| 2025-12 | 1 |
| 2025-10 | 1 |
| 2025-03 | 1 |
| 2021-12 | 1 (DEFCIVIL) |

- **Cruce con instituciones.** 83 de los 86 códigos tienen ficha por la tabla `NOMINA` de `scripts/build-instituciones.py` (§5.7); `CCDF`, `RI` y `EGAEE` no.
- **Lectura.** `lib/nomina.ts` (sin `node:fs`): `loadNomina` hace `fetch("/data/nomina.json")` en el navegador; `components/nomina/explorer.tsx` la pide con TanStack Query (`claves.nomina`, `staleTime: Infinity`, `retry: 1`) y `app/nomina/page.tsx` la precarga. `next.config.ts` sirve `/data/*` con `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`. El módulo trae también `aggregateBy`, `median`, `SALARY_BUCKETS`, `cargoBase`/`patronCargo`, `CARGOS_COMPARABLES` y la antigüedad de cada foto (`ATRASO_MAX_MESES` = 3, `estaAtrasada`, `textoAtraso`, hora de Santo Domingo): al 2026-10-02, 22 de las 86 fotos tienen más de tres meses. `lib/nomina-server.ts` (servidor, lee el archivo del disco): `getResumenNomina` (memoizado; plazas, masa, instituciones, período más reciente), `getNominaDeInstitucion(codigo)` (plazas, masa, mediana y los ocho cargos con más plazas) y `getInstitucionesNomina`.
- **Observado** (2026-09-23 y 2026-09-24): una URL de nómina del MSP que no es la de su ficha en datos.gob.do responde un CSV de una línea («La url de descarga no es correcta»); las URL con sufijo de versión (`-6.csv`, `-2.csv`) se mueven entre publicaciones. Contraste con la nómina general del MAP de julio de 2026: MAP y ANAMAR coinciden al peso; DAEH, Agricultura, OPRET, INTRANT y Bellas Artes, en ±2 %. Fuentes que no están en la foto, por causa observada:

| Causa | Instituciones |
|---|---|
| Columnas corridas sin cambiar la cabecera | INDOTEL, Hospital Vinicio Calventi, SGN, Cambio Climático, CNC, APORDOM |
| Sin puesto | Catastro, ProDominicana, Ministerio de Trabajo, Ayuntamiento de La Romana |
| Solo sueldo neto | INDRHI, FARD, PROPEEP |
| Sueldo partido o ambiguo | Ejército, SENPA |
| Agregados, no una fila por plaza | Policía Nacional, COREPOL, CESFRONT, Ayuntamiento de Mella |
| Sin mes o año legible | Juventud, COAAROM, Efemérides Patrias, ONESVIE, INABIE, IDECOOP, CDC |
| Sin cabecera | TSE |
| Último mes publicado anterior a 2025 | CONAPOFA, Comisión Hípica, DICOM, INVI, Ayuntamiento de Santo Domingo Este |
| No es CSV | Acuario, Padre Billini, Tecnificación de Riego, FONDOMARENA, INAVI, FODEARTE, Dragas |
| 403 | INAZUCAR, Migración, Ayuntamiento de Santiago |
| Certificado TLS que no valida | INAFOCAM |
| Host que no resuelve o no conecta | IDSS, DIAPE, DIGECOOM, Comunidad Digna, PROINDUSTRIA |
| 500 / 503 | CORAABO / ayuntamientos de San Pedro de Macorís, Baní y San Cristóbal |
| 404 | Instituto Duartiano, Pasaportes, CODOPESCA, CPP |
| El enlace lleva a una página | COE, CONIAF, MIDEREC, DIGEV, INDOCAFE, CEA, Tribunal Constitucional, INCABIDE |
| 202 con una página HTML | UNADE |

#### Portal Único de Transparencia · tablero de nóminas ❌

El tablero «Nóminas» de `transparencia.gob.do` es un Power BI «publish to web» con la nómina individual; su API respondió 403 a `modelsAndExploration` en todos los clústeres probados (2026-08-31), y el `wp-json` del portal no expone un directorio de instituciones (282 rutas de plugins, 2026-09-01). Detalle en §5.11.

#### MAP · Nómina Pública General del Estado ✅

- **Institución y servicio.** Ministerio de Administración Pública, datos abiertos de `map.gob.do`; robots solo veta `/wp-admin/` (2026-09-24).
- **Endpoint.** `URL` = `GET https://map.gob.do/datosabiertos/data/nomina_publica_general_estado/csv?year={a}&month={m}` → `text/csv`, UTF-8 con BOM; columnas `Nombre_del_empleado, Institución, Cargo, Estatus, Suelto_Bruto` (sic), `Género, Mes, Año`. Un mes sin publicar → 404.
- **Acotación.** Desde el mes en curso hacia atrás, hasta doce meses, hasta el primer mes publicado; después, el mes anterior. Dos descargas por corrida, espera de 600 s, un reintento, `content-type` `text/csv` exigido. `--local ACTUAL.csv ANTERIOR.csv` lee archivos ya bajados.
- **Qué se guarda.** De cada fila, institución, cargo, estatus y sueldo bruto; `Nombre_del_empleado` y `Género` no se leen. Agregados: total (plazas, masa, mediana, estatus); por institución (`uc`, plazas, masa, mediana, `p90`, máximo, plazas por estatus, `anterior` = [plazas, masa] del mes previo) y por institución y cargo (`[cargo, plazas, masa, mediana, mínimo, máximo]`); `mejorPagados`, los 40 sueldos más altos por institución × cargo. `uc` es el id del cruce cuando el nombre normalizado casa exacto con el de `instituciones.json`.
- **Controles.** No escribe con menos de 300,000 filas ni con más de 2 % de plazas en RD$0.
- **Observado** (2026-09-24): julio de 2026 → 200 `text/csv`, 61.9 MB, `content-disposition` «Nomina Publica General del Estado, MAP, Julio, 2026.csv»; agosto y septiembre → 404. No aparecen Fuerzas Armadas, Policía Nacional, Congreso, Poder Judicial, ayuntamientos, Banco Central ni JCE (comprobado por nombre).
- **Cobertura** (contada en el archivo): julio de 2026, 492,488 plazas, masa RD$20,130,338,622, mediana RD$42,000; junio de 2026, 491,472 plazas y RD$20,106,958,075. 125 instituciones (79 con `uc`, todos presentes en el cruce vigente), 16,365 filas de cargo; las mayores, Ministerio de Educación (265,490) y Servicio Nacional de Salud (87,295). Estatus: Empleados Fijos 424,579 · Personal Transitorio 46,664 · Personal de Vigilancia 13,717 · Personal Cuerpos de Bomberos 2,410 · Pasante 2,263 · Trámite de Pensión 1,563 · Personal de Carácter Eventual 718 · Contratado en Servicios 574.
- **`lib/nomina-general.ts`** (servidor, memoizado): `getNominaGeneral`, `nominaGeneralDeInstitucion(uc)`, `claveInstitucion`, `mesGeneral`. Lo leen `app/nomina/general/page.tsx` y la ficha `app/instituciones/[id]/page.tsx` de las instituciones sin nómina propia; el navegador no recibe el archivo.

### 5.9 Obra pública y país

Todo lo de esta subsección, salvo `lib/provincias.ts`, se lee por instantánea: un script de `scripts/` escribe un archivo en `public/data/` y el módulo de `lib/` lo lee con `readFile` de `node:fs`, memoiza la promesa por instancia y, si la lectura o el `JSON.parse` fallan, devuelve `null` y suelta la memoria, y la petición siguiente vuelve a leer (§6).

| Instantánea | Script | Módulo | Lee además | Fecha en el archivo | Tamaño |
|---|---|---|---|---|---|
| `public/data/obras.json` | `scripts/build-obras.py` | `lib/obras.ts` | `instituciones.json` | `generado` 2026-09-23, `corte` 2026-09-22 | 1,760,464 B |
| `public/data/obras-detalle.json` | `scripts/build-obras.py` | `lib/obras.ts` | — | `corte` 2026-09-22 | 2,097,318 B |
| `public/data/sociedad.json` | `scripts/build-sociedad.py` | `lib/sociedad.ts` | — | `generado` 2026-09-24 | 21,633 B |
| `public/data/mapa.json` | `scripts/build-mapa.py` | `lib/mapa.ts` | — | `generado` 2026-09-30, `vigente` 2021-06-29 | 40,888 B |

#### MapaInversiones · obra pública ✅

- **Institución y servicio.** Ministerio de Hacienda y Economía; datos abiertos de MapaInversiones (Banco de Proyectos del SNIP unido a la DGCP). Página de descargas `https://mapainversiones.gob.do/DatosAbiertos` (`FUENTE_OBRAS`); publica quince CSV con un diccionario `_Diccionario.xlsx` cada uno.
- **Endpoints.** `GET https://mapainversiones.gob.do/opendata/<archivo>` (`BASE` y `ARCHIVOS` del script), cuatro de los quince:

  | Archivo | Filas (2026-09-23) | Qué aporta |
  |---|---|---|
  | `DatosAbiertosProyectosDeInversion.csv` | 3,611 | `CodigoSNIP`, `IdProyecto`, `NombreProyecto`, `EstadoProyecto`, `ValorDelProyecto`, `AvanceFisico`, `NombreSector`, `EntidadEjecutora`, fechas de inicio y fin, `FechaCorteFuente` |
  | `DatosAbiertosProyectosDeInversionXTerritorio.csv` | 26,606 | una fila por proyecto y municipio; de `NombreDepartamento` salen las provincias; `IdRegion` `00` o municipio «NACIONALES» = alcance nacional |
  | `DatosAbiertosProcesosXProyectosInv.csv` | 3,399 | procesos de compra por SNIP: código, descripción o carátula, estado, modalidad, monto estimado |
  | `DatosAbiertosContratosXProyectosInv.csv` | 14,957 | contratos por SNIP: código, proceso, descripción, estado, valor, `CodigoProveedor`, `Proveedor` |

  La ficha pública de un proyecto es `https://mapainversiones.gob.do/projectprofile/{IdProyecto}` (`urlFichaMapaInversiones`); la plataforma la enlaza y no la lee.
- **Método y formato.** GET sin clave ni sesión, con el User-Agent `Socratico-Inteligencia/1.0 (instantanea de obras publicas; herramienta independiente)`; el script exige `csv` en el `content-type`, espera hasta 180 s y reintenta una vez a los 5 s. CSV UTF-8 con BOM, coma y comillas. `--local DIR` interpreta CSV ya bajados.
- **Código.** `scripts/build-obras.py` → `lib/obras.ts` (`getObras`, `getObra`, `obrasDeProceso`, `obrasDeInstitucion`, `filtrarObras`, `slugProvincia`, `provinciasDe`, `finVencido`, `tonoDeObra`, `ESTADOS_OBRA`). Páginas: `/obras` (parámetros `q`, `estado`, `provincia`, `uc`, `pagina`) y `/obras/[snip]` (`snip` de 1 a 7 cifras; si no, 404), ambas con `revalidate = 86400`. Componentes `ObraDelProceso` (en `/procesos/[codigo]`) y `ObrasDeInstitucion` (en `/instituciones/[id]`). También leen `getObras` `/provincias/[slug]`, `/congreso/legisladores/[id]`, `/finanzas/[capitulo]` y `app/sitemap.ts`.
- **Instantánea.** `obras.json` guarda `generado`, `corte` (el máximo de `FechaCorteFuente`), `fuente`, `archivos` (nombre, `last-modified` y filas de cada CSV), `proyectos` y `procesos`: un índice código de proceso → SNIP (2,490 códigos), armado con todos los procesos y contratos y no solo con los recortados. `obras-detalle.json` guarda, por SNIP, los 12 contratos y los 12 procesos de mayor monto (`TOPE_LISTA`) de 992 obras. `nContratos`, `montoContratado` (contratos en estado Activo, Cerrado o Modificado) y `proveedores` cuentan todos los contratos.
- **Comportamientos observados.**
  - `robots.txt` → 404 (2026-09-23).
  - Los cuatro CSV traían `last-modified` del 23-09-2026 entre las 03:39:52 y las 03:40:50 GMT, el día de la descarga.
  - `AvanceFisico` y `AvanceFinanciero` traen el mismo número en los 3,611 proyectos (2026-09-23). La capa expone un solo `avance` y la interfaz lo llama «avance declarado».
  - Dos `CodigoSNIP` se repiten: 3,611 filas dan 3,609 proyectos; se conserva la primera fila.
  - `CodigoProveedor` de los contratos es el RPE de la DGCP (comprobado con el RPE `17` el 2026-09-23).
  - La DGCP y MapaInversiones pueden asociar un mismo proceso a SNIP distintos: `MOPC-CCC-LPN-2026-0013` es el 4795 en la DGCP y el 12080 en MapaInversiones (2026-09-23). `obrasDeProceso` devuelve cada obra con `segun` (`"DGCP"`, `"MapaInversiones"` o los dos).
  - La fuente escribe «Baoruco»; `slugProvincia` lo resuelve por `provinciaDeTexto` (`lib/provincias.ts`) a `bahoruco`, que tiene 81 obras.
- **Cobertura.** 3,609 proyectos en cuatro estados: En ejecución 2,350, En reevaluación 655, Paralizado 560 y Por reprogramar 44; el archivo no trae obras terminadas. Valor declarado total: RD$1,809,060 millones. 3,526 con provincia (32 nombres de provincia), 82 de alcance nacional, 992 con procesos y 707 con contratos. 134 entidades ejecutoras distintas; 3,299 obras atadas a una unidad de compra de `instituciones.json` por nombre normalizado o por la tabla curada `EJECUTORAS` (8 equivalencias); 310 sin unidad, 189 de ellas de la «Dirección de Desarrollo Provincial». El cruce se hizo con el `instituciones.json` vigente el 2026-09-23, anterior al de 894 fichas (2026-09-29).

Las tres fuentes siguientes comparten `scripts/build-sociedad.py`, `public/data/sociedad.json` (`generado` 2026-09-24), `lib/sociedad.ts` (`getSociedad`) y la página `/pais` (`revalidate = 86400`). Ninguna publica un nombre de archivo predecible, así que el script parte del listado que lo enlaza. Higiene del script: `robots.txt` primero en cada host (`urllib.robotparser`), a lo sumo 6 GET por host (`TOPE_POR_HOST`), User-Agent `Socratico-Inteligencia/1.0 (indicadores sociales; herramienta independiente)`, un reintento a los 5 s, `content-type` y firma validados. Cada bloque se valida por separado: el que no cuadra no se escribe y, si existe una instantánea anterior, se conserva el suyo con `heredadoDe` (la fecha de aquella); si no pasa ninguno, el archivo no se toca. `/pais` avisa en su cabecera cuando una sección viene heredada. `--crudos DIR` guarda o reutiliza cada descarga. En la instantánea vigente ningún bloque lleva `heredadoDe`.

#### Ministerio de Interior y Policía · robos y armas ✅

- **Institución y servicio.** Ministerio de Interior y Policía (MIP); las cifras de robo son denuncias recibidas por la Policía Nacional. WordPress en `https://mip.gob.do`; robots solo veta `/wp-admin/` (2026-09-24).
- **Endpoints.** Listado: `GET https://mip.gob.do/wp-json/wp/v2/media?mime_type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet&per_page=100&_fields=id,date,title,source_url`. Se toma, del más reciente al más viejo, el primer XLSX cuyo `source_url` contiene `robos`, `armas-incautadas` o `armas-registradas`. En la instantánea: `https://mip.gob.do/wp-content/uploads/2026/06/datos-abiertos-robos-2018-2025-v2.xlsx`, `…/2026/06/Armas-incautadas-organismo-de-seguridad-MIP-2018-2026.xlsx` y `…/2026/06/Armas-Registradas-por-genero-MIP-2018-2026.xlsx`, los tres publicados el 2026-06-25.
- **Método y formato.** GET; XLSX (`spreadsheetml` u `octet-stream`, firma `PK`) leído con `zipfile` y `xml.etree` (`leer_xlsx`), sin dependencias. La hoja de robos apila bloques por tipo de robo × año × provincia, con los meses en columnas, el subtotal de cada trimestre intercalado, celdas `#N/D` y títulos de bloque con erratas («Robo Vehículos 4 Motocicletas») (2026-09-24).
- **Cobertura.** Robos 2018–2025: vehículos de cuatro ruedas o más, motocicletas y armas de fuego desde 2018 (`tiposSerieLarga`); todos los tipos solo en 2024 y 2025 (`aniosCompletos`). 2025: 83,716 denuncias (robo simple 47,911; asalto 15,166; motocicletas 5,812; arrebato 4,903), 1,650 sin provincia. Armas incautadas 2018–2026: 4,124 en 2025 y 384 en el primer trimestre de 2026. Armas registradas, acumulado por género del titular: 246,071 al primer trimestre de 2026 (236,555 y 9,516). Los homicidios solo se publican como imagen JPEG y no están (2026-09-24).

#### MINERD · matrícula escolar ✅

- **Institución y servicio.** Ministerio de Educación; transparencia, «conjunto de datos abiertos», estadísticas de estudiantes matriculados.
- **Endpoints.** `GET https://minerd.gob.do/transparencia/conjunto-de-datos-abiertos/2-estadisticas-de-estudiantes-matriculados/{año}/listados` para el año en curso y los dos anteriores; se toma el primer enlace `/transparencia/file/descarga?…` cuyo nombre contiene `matriculados-por-nivel…csv`. En la instantánea: `https://minerd.gob.do/transparencia/file/descarga?fileNombre=Estudiantes-matriculados-por-nivel-segun-regional-y-distrito-2015-2024xlsx.csv&…`.
- **Método y formato.** GET; una descarga que empieza por `<` se rechaza como HTML. CSV separado por `;` que declara UTF-8 y está en cp1252 (`codificacion: "cp1252"` en la instantánea); el período `202120222` viene mal tecleado; las filas de regional (subtotales) van mezcladas con las de distrito (2026-09-24).
- **Cobertura.** Años escolares 2015-16 a 2023-24, por nivel (Inicial, Primario, Secundario, Adultos) y por las 18 regionales; el total nacional suma las regionales, no los distritos. 2,773,255 estudiantes en 2015-16 y 2,617,801 en 2023-24. La suma de las regionales es igual a la de los distritos en cada año (2026-09-24).

#### MIVHED · licencias de construcción ✅

- **Institución y servicio.** Ministerio de la Vivienda, Hábitat y Edificaciones; página de datos abiertos de su portal de transparencia. `robots.txt` → 404 (2026-09-24).
- **Endpoints.** `GET https://mivhed.gob.do/transparencia/datos-abiertos-{año}/` para el año en curso y el anterior; se toma el enlace `/wp-content/uploads/AAAA/MM/Licencias-emitidas….csv`. En la instantánea: `https://mivhed.gob.do/wp-content/uploads/2026/07/Licencias-emitidas-2022-2026-.csv`.
- **Método y formato.** GET; CSV con la cabecera en la tercera línea y fechas `MM/DD/AAAA`; se decodifica como UTF-8 con BOM y, si falla, como cp1252.
- **Cobertura.** Licencias emitidas de 2022 al 2026-06-30 (`corte`); 2026 incompleto (6 meses, 922 licencias). 2025, el año de referencia de los desgloses por provincia, municipio y tipología: 952 licencias, 4,491,108 m² y RD$272,362 millones de inversión declarada, unos RD$60,600 por m². Son permisos emitidos, no obras empezadas ni terminadas.

#### ONE · límites provinciales (vía el HDX de la ONU) ✅

- **Institución y servicio.** Oficina Nacional de Estadística (ONE); sus límites administrativos oficiales, publicados por OCHA en el Humanitarian Data Exchange como COD-AB `cod-ab-dom`, licencia CC BY-IGO (la interfaz la atribuye junto a cada mapa). Página: `https://data.humdata.org/dataset/cod-ab-dom` (`FUENTE_MAPA`). El sitio propio de la ONE no se lee (§5.11).
- **Endpoints.** `GET https://data.humdata.org/api/3/action/package_show?id=cod-ab-dom` → JSON del paquete; de sus recursos, el llamado `dom_admin_boundaries.geojson.zip`, y de ese ZIP, `dom_admin2.geojson`.
- **Método y formato.** GET con el User-Agent de la casa; el paquete con plazo de 60 s y `json` en el `content-type`, el ZIP con 600 s y `zip` u `octet-stream`; un reintento a los 5 s. `--local ARCHIVO` usa un `dom_admin2.geojson` ya bajado.
- **Código.** `scripts/build-mapa.py` → `public/data/mapa.json` → `lib/mapa.ts` (`getMapa`, `FUENTE_MAPA`) → `MapaProvincias` (`components/graficos/mapa-provincias.tsx`), un SVG pintado en el servidor en `/obras`, `/provincias` y `/provincias/[slug]`; cada provincia es un enlace.
- **Instantánea.** `generado` 2026-09-30, `autor`, `licencia`, `vigente` 2021-06-29, `viewBox` `[0, 0, 1000, 705]` y 32 zonas con `slug`, `pcode` (`DO0801` el Distrito Nacional), `nombre`, `d` (trazado con islas y huecos, `evenodd`), `centro` y `km2`; 3,265 vértices. Proyección equirectangular con el coseno de la latitud media (18.8°). Un vértice donde cambia el conjunto de provincias que lo comparten es un nudo y no se toca; cada tramo entre dos nudos se simplifica con Douglas-Peucker (tolerancia 1.2 unidades del `viewBox`, unos 0.5 km) siempre en el mismo sentido, así que las dos provincias que lo comparten reciben la misma línea; los islotes de menos de 6 unidades² (unos 0.9 km²) no se dibujan. El script falla si los slugs no son exactamente los de `lib/provincias.ts` (`SLUGS_PLATAFORMA`); traduce «Baoruco» a `bahoruco`.
- **Comportamientos observados** (2026-09-30). `package_show` → 200 JSON, `dataset_source` «Oficina Nacional de Estadística», modificado 2026-01-26; recursos GDB, SHP, GeoJSON (ZIP de 54 MB) y XLSX de códigos. El ZIP trae `admin0` a `admin4`: `admin1` son las 10 regiones de desarrollo, `admin2` las 32 provincias (con el Distrito Nacional), `admin3` los municipios y `admin4` los distritos municipales. Las fronteras comparten vértices exactos: 221,647 vértices en `admin2`, 74,695 en dos anillos y 41 en tres.
- **Cobertura.** Solo provincias; municipios y distritos municipales vienen en el paquete y no se usan.

#### Territorio · `lib/provincias.ts` ⚠️

Compone dos fuentes que ya se leen; no añade ninguna. Límite: los proveedores por provincia son una muestra de los mayores adjudicatarios recientes, no el padrón de la provincia.

- **Catálogo.** `PROVINCIAS`: el Distrito Nacional y las 31 provincias con `slug`, `nombre` como lo escribe el SIL de Diputados, `cabecera`, `ayuntamientos` (unidades de compra del ayuntamiento cabecera y, en Santo Domingo, de sus municipios; Pedernales sin ninguna) y `alias` con las grafías del registro de proveedores («CONCEPCION DE LA VEGA», «MONTECRISTI», «BAORUCO»…). Funciones: `provinciaDeSlug`, `provinciaDeTexto`, `hrefLegisladores` (enlace a `/congreso/legisladores?provincia=`).
- **Proveedores por provincia.** `proveedoresPorProvincia()` toma los `TOPE_PROVEEDORES` (200) proveedores que más adjudicaron en la ventana de contratos recientes (`muestrearProveedores`, `lib/dgcp.ts`), pide la ficha de cada uno al registro de la DGCP por RPE en tandas de 8 (`registrosDeProveedores`; cada ficha con `revalidate` de 86400 s) y los agrupa por el campo `provincia`. El resultado se guarda con `unstable_cache` (clave `provincias-proveedores-v2`, 86400 s); si el registro contesta menos del 90 % de las fichas, devuelve `null` y no se guarda. La API de proveedores devuelve 500 con cualquier valor de `provincia=` (`SANTIAGO`, `Santiago`; 2026-09-23, §5.1).
- **Páginas.** `/provincias` y `/provincias/[slug]` (`dynamic = "force-dynamic"`), las dos con el mapa de `lib/mapa.ts`; la ficha añade las obras de `lib/obras.ts`. `/provincias` declara cuántos proveedores se consultaron, cuántos devolvieron ficha y cuántos no traen una provincia reconocible.

### 5.10 Gestión, control y datos

| Instantánea | Script | Módulo | Lee además | Fecha en el archivo | Tamaño |
|---|---|---|---|---|---|
| `public/data/sismap.json` | `scripts/build-sismap.py` | `lib/sismap.ts` | `instituciones.json` | `consultado` 2026-09-23 | 119,115 B |
| `public/data/auditorias.json` | `scripts/build-auditorias.py` | `lib/auditorias.ts` | `instituciones.json` | `generado` 2026-09-24T22:15:35+00:00 | 61,303 B |
| `public/data/documentos/indice.json`, `filas.json` | `scripts/build-documentos.py` | `lib/biblioteca.ts` | — | `generado` 2026-09-24 | 4,042 B + 3,242,056 B |
| `public/data/catalogo.json` | `scripts/build-catalogo.py` | `lib/catalogo.ts` | — | `generado` 2026-09-24 | 243,886 B |

Las cuatro páginas que las muestran (`/gestion`, `/auditorias`, `/documentos`, `/datos`) tienen `revalidate = 86400`, ponen la fecha de la instantánea en su rótulo y, si la lectura devuelve `null`, pintan `EstadoVacio` con `variante="caida"`.

#### SISMAP · ranking de gestión pública ✅

- **Institución y servicio.** Ministerio de Administración Pública (MAP); Sistema de Monitoreo de la Administración Pública, `https://sismap.gob.do`. `robots.txt` → 404 (2026-09-23).
- **Endpoints** (`TABLAS` del script):
  - `GET /GestionPublica/Ranking/RankingView` — organismos del Gobierno central: posición, nombre, sector, valoración (%); cada fila enlaza a `/GestionPublica/CargaEvidencia/Index/{id}`.
  - `GET /Municipal/Ranking/RankingView?tipoOrganismoID=17` — ayuntamientos: posición, nombre, valor (%); enlace a `/Municipal/OrganismoEvidenciasMunicipales/id/{id}`.
  - `GET /Municipal/Ranking/RankingView?tipoOrganismoID=16` — juntas de distrito municipal, misma forma.
- **Método y formato.** GET; tablas HTML servidas; exige `text/html`, plazo de 60 s, un reintento a los 5 s, 3 s entre tablas: tres peticiones por corrida. No escribe si una tabla trae menos de 20 filas.
- **Código.** `scripts/build-sismap.py` → `lib/sismap.ts` (`getSismap`, `sismapDeInstitucion`, `sismapDeGobiernoLocal`, `TABLAS_SISMAP`) → `/gestion` y el componente `SismapDeInstitucion` en `/instituciones/[id]`.
- **Instantánea.** `consultado` es el día de la consulta: las tres páginas no declaran fecha de corte ni período, y la interfaz dice «consultado el …». Cada fila: `posicion`, `nombre`, `sector` (solo instituciones), `valor`, `ficha`, `uc`.
- **Cruce con las fichas.** Por conjunto de palabras normalizado contra `instituciones.json`; si no hay uno exacto, Jaccard ≥ 0.85 con un único mejor candidato. La clase (institución, ayuntamiento, junta) se decide aparte, así que un ayuntamiento nunca casa con la junta del mismo lugar; si dos filas apuntan a la misma ficha, se sueltan las dos. Atadas: 137 de 181 instituciones, 135 de 160 ayuntamientos, 63 de 233 juntas. La instantánea es anterior a las fichas que entraron por el Clasificador Institucional (§5.7): `sismapDeGobiernoLocal` casa en la petición un gobierno local sin fila atada solo si el lugar (sin tildes, caja ni el prefijo genérico) es idéntico y único a los dos lados.
- **Comportamientos observados.** `/GestionPublica/Ranking/RankingView` → 200 `text/html`, 228 KB en 5.7 s (2026-09-23). `/Municipal/Ranking` no trae la tabla en el HTML (la monta por JavaScript) y la portada `/Municipal` solo trae los diez primeros de cada tabla; el menú del propio sitio apunta a las dos `RankingView` servidas (2026-09-23). `/Municipal/Directorio/Dir/Details/158` → 404; `/Municipal/ayuntamientos` lista los 160 ayuntamientos sin el nombre del alcalde (2026-09-29; no se usa).
- **Cobertura.** 181 organismos (1º Ministerio de Energía y Minas, 99.09 %; último, Instituto Nacional de Ciencias Forenses, 0.00 %), 160 ayuntamientos (1º Santiago de los Caballeros, 87.30 %) y 233 juntas de distrito (1ª Canca la Reina, 84.39 %). Es cumplimiento de indicadores con las evidencias que remite cada organismo.

#### Contraloría General · informes de auditoría e ICI ✅

- **Institución y servicio.** Contraloría General de la República (control interno del Ejecutivo), WordPress en `https://contraloria.gob.do`; robots solo veta `/wp-admin/` (2026-09-24).
- **Endpoints.** `GET /informes-de-auditorias/` (`CGR_INFORMES`): fichas `archivo-card` con título corto (siglas y período, «CEA 2020-2022», o «Informe General MIREX»), fecha de subida («5 marzo 2025») y PDF en `wp-content/uploads`. `GET /nobaci/sobre-ici/` (`CGR_ICI`) enlaza una página por año (`/nobaci/sobre-ici/resulados-ici-2026/` y `resulados-ici-2025`, así escritas, y `resultados-ici-2024`), cada una con un PDF por trimestre del Índice de Control Interno.
- **Método y formato.** GET de HTML; seis peticiones por corrida (robots, informes, sobre-ICI, tres años). El contrato del script está en la ficha de la Cámara de Cuentas, abajo. Los PDF no se descargan: se enlazan.
- **Código.** `scripts/build-auditorias.py` → `public/data/auditorias.json` → `lib/auditorias.ts` (`getAuditorias`, `informesDe`, `filtrarInformes`) → `/auditorias` y el conteo de informes en `/instituciones/[id]`. `getAuditorias` devuelve `null` si la instantánea no trae informes de la Contraloría o no trae la lista de declaraciones de la Cámara.
- **Comportamientos observados.** La fecha de cada informe es la de subida al sitio, no la del informe: 33 de los 38 el 2025-03-05, 2 el 2025-03-06 y 3 entre el 2026-02-09 y el 2026-02-10. Dos fichas son réplicas de la institución auditada (`tipo: "replica"`). 19 títulos no traen un período legible.
- **Cobertura.** 38 fichas (36 informes y 2 réplicas; 29 atadas a una ficha de institución por coincidencia exacta) y 10 trimestres del ICI, del primero de 2024 al segundo de 2026.

#### Cámara de Cuentas · informes y listas de declaración jurada ❌

Responde HTTP 470 desde el 2026-09-29 (§5.11); `/auditorias` sirve la instantánea del 2026-09-24.

- **Institución y servicio.** Cámara de Cuentas (control externo; rinde al Congreso), `https://camaradecuentas.gob.do`: Joomla con K2 y Phoca Download; `www.` responde 301 al ápex; robots estándar de Joomla, que no veta `/index.php/` ni `/phocadownload/` (2026-09-24).
- **Endpoints.**
  - `GET /index.php/ultimas-auditorias` (`CCRD_LISTADO`), que pagina de 3 en 3 («Página 1 de 72»), y su RSS `?format=feed&type=rss` (`CCRD_RSS`) con los 10 informes más recientes, título completo y fecha. Se leen el RSS y la primera página (para el total de páginas).
  - Listas de declaración jurada, Phoca Download con `?limit=0` (la opción «Todo» del selector de la página): `/index.php/reportes-djp/category/23-listado-de-funcionarios-que-entregaron-su-declaracion-en-tiempo-habil` (`CCRD_A_TIEMPO`), `…/24-listado-de-funcionarios-que-entregaron-su-declaracion-extemporanea` (`CCRD_TARDE`) y `…/25-listado-de-funcionarios-omisos` (`CCRD_OMISOS`), con subcategorías por año y, dentro, por mes; de los omisos se lee el último año y su último mes.
- **Método y contrato del script.** Solo GET, User-Agent `Socratico-Inteligencia/1.0 (auditorias y declaraciones; herramienta independiente)`, `robots.txt` leído primero en cada host (aborta si veta una ruta que se usa), 1 s entre peticiones (`PAUSA`), un reintento, `content-type` validado; ocho peticiones a la Cámara por corrida. Un 401, 403, 429 o 470, o una respuesta con «cf-challenge», «Attention Required» o «captcha», detiene el script (`Bloqueado`) sin reintentar. No escribe si la Contraloría trae menos de 20 informes, la Cámara ninguno o no hay ninguna lista. `--cache D` guarda o reutiliza las respuestas.
- **Privacidad.** Las listas nombran funcionarios y son PDF: el script no descarga ningún PDF ni escribe un nombre de persona; guarda título de la lista, grupo institucional, fecha de corte, fecha de publicación y URL. Del RSS no guarda el nombre de quien publicó. `contado: false`: `total`, `porEstado` y `porInstitucion` van en `null` y la página lo dice.
- **Comportamientos observados.** HTTP 470 con una página de 33 KB a cualquier ruta, robots incluido (2026-08-31; en `www.` y en el ápex el 2026-09-01); 200 (2026-09-24); 470 «Request Blocked» (2026-09-29, y el 2026-09-30 en `/index.php/reportes-djp`). La Consulta Pública de DJP (`consultadjp.camaradecuentas.gob.do`) es otra aplicación: §5.7 y §5.11.
- **Cobertura.** 10 informes del RSS, del 2026-07-28 al 2026-09-14 (8 atados a una ficha), de unos 216 publicados (72 páginas de 3). 75 listas: 10 «en tiempo hábil» (la de corte más reciente, 2024-04-26), 53 extemporáneas (cortes del 2015-07-30 al 2026-08-31) y 12 de omisos del mes leído, «08 - Agosto 2026», con corte 2026-08-31, una por grupo: Senado, Cámara de Diputados, Diputados al Parlamento Centroamericano, Diputados de ultramar, ayuntamientos y juntas de distrito, Suprema Corte de Justicia, Procuraduría General de la República, UASD, Banreservas, Bandex, Registro Inmobiliario y designados por decreto u otros.

#### Bibliotecas WordPress de las instituciones ⚠️

Límite: el total que anuncia cada sitio (`X-WP-Total`) no es cobertura, y el recorrido se corta a 250 páginas por host.

- **Endpoint.** `GET https://<host>/wp-json/wp/v2/media?media_type=application&per_page=100&page=N&_fields=id,date,title,source_url,mime_type` → JSON sin clave, con `X-WP-Total` y `X-WP-TotalPages` en la cabecera. El reconocimiento del 2026-09-24 lo probó en 44 hosts: respondió en 23 y ningún robots vetaba `/wp-json`; los que no responden están en §5.11.
- **Método.** GET; `robots.txt` primero en cada corrida (si veta `/wp-json` o las URL con `?`, el host se salta y se anota); hosts en paralelo y 1 s entre peticiones al mismo host; plazo de 25 s; un reintento; un 401 o 403 no se reintenta y se anota como bloqueado; recorrido hasta `X-WP-TotalPages`, tope 250 páginas (`TOPE_PAGINAS`). Se guardan los tipos de `TIPOS` (`pdf`, `xlsx`, `xls`, `docx`, `doc`); se excluyen por título los de prueba (`PRUEBA`) y las declaraciones juradas de patrimonio (`DECLARACION`), que viven en `declaraciones.json` (§5.7).
- **Código.** `scripts/build-documentos.py` (lista `HOSTS`: host → institución y unidad de compra) → `public/data/documentos/indice.json` (por host: `estado`, `nota`, `anunciados`, `paginas`, `documentos`) y `filas.json` (`[título, fecha de subida, tipo, url original, índice de host]`) → `lib/biblioteca.ts` (`getIndiceBiblioteca`, `buscarDocumentos` de 40 en 40 por `POR_PAGINA`, `documentosDeInstitucion`) → `/documentos` y `DocumentosDeInstitucion` en `/instituciones/[id]`. La búsqueda exige todas las palabras, en cualquier orden, sin tildes y por raíz (`lib/raiz.ts`), sobre el título y el nombre del archivo. `scripts/build-declaraciones.py` importa el lector de este script. Ningún archivo se copia: se enlaza la URL original.
- **Comportamientos observados** (2026-09-24). `X-WP-Total` sobrestima: WordPress cuenta en SQL y después descarta los adjuntos cuyo padre no es público, y hay páginas vacías (`[]`) en medio. El título suele ser el nombre del archivo y `date` es la fecha de subida, no la del documento. Se excluyeron 115 títulos de declaraciones juradas.
- **Cobertura.** 18,726 documentos de 22 instituciones (`generado` 2026-09-24; 23 hosts leídos, todos con `estado` `ok`): pdf 12,735, xlsx 5,231, docx 419, xls 272, doc 69.

  | Host | Institución | Anunciados | Leídos |
  |---|---|---|---|
  | `ogtic.gob.do` | OGTIC | 9,759 | 7,264 |
  | `digepres.gob.do` | DIGEPRES | 3,014 | 3,011 |
  | `ambiente.gob.do` | Medio Ambiente | 1,410 | 1,379 |
  | `mirex.gob.do` | Relaciones Exteriores | 1,325 | 1,306 |
  | `mem.gob.do` | Energía y Minas | 1,255 | 1,216 |
  | `indotel.gob.do` | INDOTEL | 18,122 | 1,027 |
  | `www.hacienda.gob.do` | Hacienda y Economía | 1,024 | 1,010 |
  | `dgcp.gob.do` | DGCP | 542 | 524 |
  | `contraloria.gob.do` | Contraloría | 6,537 | 475 |
  | `digeig.gob.do` | DIGEIG | 4,015 | 321 |
  | `mip.gob.do` | Interior y Policía | 3,850 | 318 |
  | `mescyt.gob.do` | MESCyT | 201 | 196 |
  | `www.transparenciafiscal.gob.do` | Portal de Transparencia Fiscal | 146 | 146 |
  | `proconsumidor.gob.do` | Pro Consumidor | 157 | 129 |
  | `mepyd.gob.do` | MEPyD | 149 | 121 |
  | `mt.gob.do` | Trabajo | 91 | 91 |
  | `cultura.gob.do` | Cultura | 9,659 | 67 |
  | `juventud.gob.do` | Juventud | 61 | 53 |
  | `intrant.gob.do` | INTRANT | 7,757 | 51 |
  | `www.sisalril.gob.do` | SISALRIL | 27 | 10 |
  | `inapa.gob.do` | INAPA | 28,488 | 6 (recortado a 250 de 285 páginas) |
  | `tss.gob.do` | TSS | 5 | 5 |
  | `mivhed.gob.do` | MIVHED | 785 | 0 |

#### datos.gob.do · catálogo de datos abiertos ⚠️

Límite: su API está vetada por su propio robots; se lee la búsqueda HTML, y las fichas de cada conjunto no se recorren.

- **Servicio.** Portal de datos abiertos del Estado, `https://datos.gob.do`. `robots.txt` (2026-09-24): `Disallow:` `/api/`, `/revision/`, `/dataset/rate/` y `/dataset/*/history`; `Crawl-Delay: 10`.
- **Endpoints.** `GET /robots.txt` en cada corrida (el script aborta si veta `/dataset/`) y `GET /dataset/?q=*:*&sort=name+asc&page=N`, 20 tarjetas por página (slug, título, organización, formatos, grupos), hasta la primera página vacía, con tope de 80.
- **Método y formato.** GET de HTML servido; 10 s antes de cada petición (`ESPERA`); exige `text/html`; un reintento. No escribe con menos de 800 conjuntos.
- **Código.** `scripts/build-catalogo.py` → `public/data/catalogo.json` → `lib/catalogo.ts` (`getCatalogo`; `hrefConjunto` arma `https://datos.gob.do/dataset/{slug}`) → `/datos`. El catálogo entra también al corpus del buscador y a los textos del modelo semántico (§8).
- **Comportamientos observados.** 54 páginas; la 60 viene vacía; el rótulo «1199 resultados» no cambia con la consulta; `/organization/` lista 271 organizaciones y `/group/` 11 grupos; `/sitemap.xml` → 404 (2026-09-24). `/dataset?page=61` sin `q` devuelve cero enlaces (2026-09-01). Las fichas `/dataset/{slug}` son HTML servido con autor, fechas, licencia, periodicidad y la tabla de archivos, cuyo enlace apunta al portal de la institución; a veces no es el archivo (Maternidad enlaza una categoría de Joomla, SIUBEN repite el mismo `id` para CSV y ODS, PGR trae `href=""`) (2026-09-24). De esas fichas salieron las URL de las nóminas de `scripts/build-nomina.py` (§5.8).
- **Cobertura.** 1,065 conjuntos públicos de 260 organizaciones (las que aparecen en las tarjetas), 11 grupos temáticos y 151 conjuntos sin grupo. Formatos declarados más frecuentes: CSV 1,056, ODS 1,052, XLSX 1,003, XLS 52, JSON 29.

### 5.11 Fuentes que no se leen

Lo que se intentó leer y no respondió con datos al User-Agent de la plataforma, con la respuesta observada y su fecha. Las que se leen con un límite están en su ficha de §5.1–§5.10.

| Fuente | Qué se intentó leer | Respuesta observada | Fecha |
|---|---|---|---|
| ONE / ANDA (`one.gob.do`, `anda.one.gob.do`) | portada; catálogo de microdatos y su API `/index.php/api/catalog/search`; `/wp-json` | 403 en la portada; desafío de Cloudflare «Just a moment…» en ANDA, también en la API; desafío hasta en `robots.txt`. Su robots (bloque de Cloudflare) permite `User-agent: *` con `ai-train=no, use=reference` | 2026-08-31; 2026-09-24 |
| SIMV (valores) | sitio y `robots.txt` | desafío de Cloudflare, hasta en `robots.txt` | 2026-09-01; 2026-09-24; 2026-09-29 |
| Migración | sitio; CSV de nómina | desafío de Cloudflare; 403 al CSV | 2026-09-01; 2026-09-23 |
| Superintendencia de Electricidad (SIE) | sitio | 403 de Cloudflare | 2026-09-24 |
| Agricultura | `/wp-json` (biblioteca) | 403 de Cloudflare | 2026-09-24 |
| INFOTEP | `/wp-json` (biblioteca) | 403 de Cloudflare | 2026-09-24 |
| Medio Ambiente (`ambiente.gob.do`) | `robots.txt`, antes de buscar declaraciones juradas | 403 de Cloudflare en `robots.txt` (el 2026-09-24 su biblioteca respondió: §5.10) | 2026-09-30 |
| BID | sitio y `robots.txt` | 403 de Cloudflare hasta en `robots.txt` | 2026-09-29 |
| Registro de asociaciones sin fines de lucro (`sigasfl.gob.do`; `minpre.gob.do/casfl/`) | registro | 403 de Cloudflare hasta en `robots.txt`; en minpre, desafío intermitente «One moment, please…» | 2026-09-29 |
| Superintendencia de Seguros, registro de intermediarios (`ofv.superseguros.gob.do`) | registro de corredores y agentes | 403 de Cloudflare | 2026-09-29 |
| Superintendencia de Bancos (`sb.gob.do`, tras Sucuri) | fichas de entidades cambiarias (42), fiduciarias (5), sociedades de información crediticia (4) y oficinas de representación (5) | a un segundo entre peticiones, tras unas 70, desafío de JavaScript de Sucuri: HTTP 307 sin `Location`, «You are being redirected…», `sucuri_cloudproxy_js`; las 47 entidades de intermediación financiera se leyeron antes (§5.7; `resumen.sbNoLeidas` en `banca.json`) | 2026-09-29 |
| API del SIGEF (`api-sigef.hacienda.gob.do`) | API y `robots.txt`, desde el entorno donde se construyen las instantáneas | 403 de Cloudflare hasta en `robots.txt` (Ray `a42e3ec13ca2b58e`); `fiscal.json` y `subsidio-electrico.json` son de lecturas anteriores (§5.2) | 2026-09-29 |
| SIGEF, la aplicación (`sigef.hacienda.gob.do`) | portada | 403 de Cloudflare | 2026-09-01 |
| Consultoría Jurídica (`www.consultoria.gov.do`), desde las funciones de Vercel | buscador `POST /api/consultas/search`, repositorio `/api/documents`, PDF `/api/document/{DocId}` | 403 con `cf-mitigated: challenge`; desde otra red, 201. La plataforma sirve instantáneas (§5.6) | 2026-09-23; 2026-09-27 |
| Cámara de Cuentas (`camaradecuentas.gob.do`) | cualquier ruta, `robots.txt` incluido; `/index.php/reportes-djp` | HTTP 470 (página de 33 KB); el 2026-09-24 respondió 200; 470 «Request Blocked» | 2026-08-31; 2026-09-01; 2026-09-29; 2026-09-30 |
| Cámara de Cuentas, Consulta Pública de DJP (`consultadjp.camaradecuentas.gob.do`) | consulta de declaraciones juradas | 500; después, 200 (ASP.NET MVC, 23,151 B): el listado sale por `POST Home/dtSourceDetalle` y el documento pide un CAPTCHA (`POST /Reportes/ValidarCaptcha`); no se ejecutó | 2026-09-24; 2026-09-30 |
| Cámara de Cuentas, `djurada.camaradecuentas.gob.do/DJP_OJO_CIUDADANO/pgReportesDJPExternos.aspx` | enlace que publica la Presidencia | 404 | 2026-09-30 |
| 9-1-1 (`911.gob.do`) | portada | HTTP 470 (su CSV de nómina bajo `/wp-content/` respondió 200 el 2026-09-23: §5.8) | 2026-09-01 |
| Procuraduría General (`pgr.gob.do`) | sitio | HTTP 470 del WAF de CSIRT-RD («¡Hey, más despacio!») | 2026-09-29 |
| DIGECOG (Contabilidad Gubernamental) | sitio | HTTP 470 | 2026-09-29 |
| DGII, consulta web de RNC (`/app/WebApps/ConsultasWeb/consultas/rnc.aspx`) y web service `/wsMovilDGII/WSMovilDGII.asmx` | consulta por RNC | 403 a la consulta y el web service redirige a la portada (2026-08-31); los dos devuelven la portada con 200 (2026-09-01). El padrón sí se lee (§5.1, §5.7) | 2026-08-31; 2026-09-01 |
| DGII, `DGII_RNC.zip` y ZIP de `informeRecaudacionMensual` | padrón con el nombre antiguo; recaudación mensual | 403 (las páginas de estadísticas respondieron 200 el 2026-09-24) | 2026-09-01; 2026-09-24 |
| Banco Central, API (`api.bancentral.gov.do`) | `MacroVariables/Inflacion` con cuerpo vacío (swagger público de 6 endpoints POST) | `{"success":false,"error":{"message":"Credenciales de acceso inválidas"}}`: exige credenciales | 2026-08-31 |
| Banco Central, índice de archivos del CDN por sección | lista de archivos de `/a/d/2534-precios`, `/a/d/2538-mercado-cambiario` | el HTML servido no trae la lista (se monta con JavaScript); cuatro nombres probados → 404. Los archivos que se leen salen de nombres conocidos (§5.3, §5.4) | 2026-09-01 |
| Superintendencia de Bancos, APIs (`apis.sb.gob.do`) | raíz y `/swagger` | 404 JSON en la raíz (gateway vivo); `/swagger` → 403; suscripción con clave | 2026-09-01 |
| ONAPI (nombres comerciales) | buscador `https://www.onapi.gob.do/busquedas2021/`, API `…/bsapi26/signos` | exige un `X-API-Key` que el cliente rota cada hora; 401 sin él. `GET /bsapi26/lookups` responde sin llave (solo la taxonomía) | 2026-09-29 |
| SNIP | sistema | solo con usuario | 2026-09-24 |
| MOPC | interfaz de datos | exige un token incrustado en su página; no se usa | 2026-09-24 |
| REST de WordPress cerrada (401) | `/wp-json/wp/v2/media`: SNS, MAP, Deportes (MIDEREC), MINPRE; `/wp-json/` del Senado; REST de Edenorte; `/wp-json/wp/v2/elementor_library/{id}` de DIGEPRES | 401 | 2026-08-31 (Senado); 2026-09-24; 2026-09-29 (DIGEPRES) |
| CNZFE (zonas francas) | REST de WordPress | 403 (su PDF anual de empresas aprobadas responde) | 2026-09-29 |
| `comunidad.comprasdominicana.gob.do` | `robots.txt` (constancias `URL_CERTIFICACION_RPE`) | 401; las constancias se enlazan sin pedirse (§5.1) | 2026-09-29 |
| MINPRE (`minpre.gob.do`) | `/wp-json/wp/v2/media?…` | además del 401, su robots veta `Disallow: /*?` | 2026-09-24 |
| Policía Nacional | sitio | robots con `Disallow: /*?*`; después, `robots.txt` → 500 | 2026-09-24; 2026-09-29 |
| ProDominicana (`connectprodominicana.gob.do`) | directorio de exportadores | robots veta `*`; el sitio principal no publica directorio | 2026-09-29 |
| DGCP, `www.dgcp.gob.do` | `/new_dgcp/…` | robots con `Disallow: /new_dgcp/` para `*` (leído entero el 2026-09-29). La nómina de la DGCP en `nomina.json` sale de una URL bajo esa ruta (`scripts/build-nomina.py`, §5.8) | 2026-09-29 |
| Senado, WordPress (`www.senadord.gob.do`) | `robots.txt` | `Disallow: /` por nombre a 16 agentes (ClaudeBot, Claude-SearchBot, GPTBot, ChatGPT-User, bingbot…); `User-agent: *` sin `Disallow` y con `Crawl-delay: 120`; no se pidió contenido. El consultante del SIL (otro host) se lee: §5.5 | 2026-08-31 |
| datos.gob.do, API | `/api/` | vetada por su robots (`Disallow: /api/`); se lee la búsqueda HTML (§5.10) | 2026-08-31; 2026-09-24 |
| Wikidata (`query.wikidata.org`, `www.wikidata.org`) | servicio SPARQL; API de búsqueda | robots veta `/sparql` y `/bigdata`; en `www.`, veta `/w/` y `/wiki/Special:` salvo `/wiki/Special:EntityData/<QID>.<formato>`. Las búsquedas van a QLever (§5.7) | 2026-09-30 |
| JCE, sitio de resultados 2024 | descargas de documentos | CAPTCHA de Zenedge («¿Eres humano?») tras media docena de peticiones; el 2026-09-24, seis peticiones sin CAPTCHA; el 2026-09-29 el XLSX de electos municipales bajó sin CAPTCHA (§5.7) | 2026-09-01 |
| Registro Inmobiliario | parcelario; certificaciones de estado jurídico | reCAPTCHA; cuenta y pago. La consulta de expedientes sí se lee (§5.6) | 2026-09-29; 2026-09-30 |
| Suprema Corte, buscador de sentencias (`consultasentenciascj…/Home/GetExpedientes`) | búsqueda | solo acepta POST de formulario | 2026-09-24; 2026-09-29 |
| Registro mercantil (`app.registromercantil.do/consultas`, API `https://ccapi.registromercantil.do/consultapublica/api/`) | búsqueda de empresas | solo valida un certificado que ya se tiene (número de RM y código de validación); no busca por nombre ni por RNC; no publica socios, gerentes ni capital | 2026-09-29 |
| Formalízate | consulta de empresas | no hay consulta pública | 2026-09-29 |
| Servidor de documentos de Diputados (`s-sil.camaradediputados.gob.do:8095`) | PDF de iniciativas (`/ReportesGenerales/VerDocumento?documentoId=`) | el túnel del proxy se abre (`CONNECT` → 200) y el origen resetea la conexión en el handshake TLS (`Connection reset by peer`), antes de recibir UA o ruta; igual en `:8095` y `:443`, HTTP y HTTPS, TLS 1.0 y 1.2; resuelve a `200.88.113.222` (§5.5) | 2026-08-31 |
| Portal Único de Transparencia, tablero de nóminas | Power BI «publish to web» | 403 a `modelsAndExploration` en todos los clústeres probados (§5.8) | 2026-08-31 |
| IDAC; Liga Municipal | datos abiertos | tableros Power BI sin datos legibles; la Liga no publica directorio | 2026-09-24; 2026-09-29 |
| SISALRIL | estadísticas | Plotly Dash que carga por POST | 2026-09-24 |
| TSS | cotizantes y empleadores | su biblioteca trae 5 archivos y ninguno es la serie de cotizantes | 2026-09-24 |
| MIP, homicidios | estadística | solo como imagen JPEG | 2026-09-24 |
| Edeeste | mantenimientos programados | solo un PDF semanal (WP Download Manager con `refresh` por visita); se enlaza su página (§5.4) | 2026-09-24 |
| IGN; COE | cartografía; alertas | IGN: solo WMS raster; COE: RSS vacío | 2026-09-24 |
| NORTIC (`nortic.ogtic.gob.do/instituciones/`) | máxima autoridad por institución | Blazor Server; no trae la máxima autoridad | 2026-09-29 |
| SISMAP, «Directorio Virtual» (`/Municipal/Directorio/Dir/Details/158`) | directorio municipal | 404 | 2026-09-29 |
| Nóminas CSV de instituciones (enlaces de datos.gob.do) | archivos de nómina | Migración y Ayuntamiento de Santiago: 403; UNADE: 202 con una página HTML (2026-09-23). INAZUCAR: 403; INAFOCAM: TLS; IDSS, DIAPE, DIGECOOM y Comunidad Digna: sin host; CORAABO: 500; ayuntamientos de San Pedro de Macorís, Baní y San Cristóbal: 503; cuatro 404 y ocho enlaces a páginas en vez de archivos (2026-09-24) (§5.8) | 2026-09-23; 2026-09-24 |

Respuestas que dependen del entorno desde el que se hizo el reconocimiento, no de la fuente:

| Destino | Respuesta observada | Fecha |
|---|---|---|
| Cualquier sitio, desde el navegador sin interfaz (Chromium + Playwright) | `ERR_CONNECTION_RESET` a través del proxy, incluso contra `example.com` | 2026-09-01 |
| Power BI (`global-redirect`, `app.powerbi.com`) | `global-redirect` vetado por la política de egreso; `app.powerbi.com` resetea la conexión del navegador | 2026-08-31 |
| Ministerio de Trabajo, `www.` | rechazado por la política de egreso; `mt.gob.do` sin `www` responde | 2026-09-01 |
| DIGEPI; Mercados Dominicanos | 502 del egreso | 2026-09-24 |
| `ministeriopublico.gob.do` | 502 `connect_rejected` del proxy | 2026-09-29 |
| `servicios.camarasantodomingo.do/consultaRm.aspx` | 502 del proxy | 2026-09-29 |
| `www.bcrd.gov.do` | 502 al abrir el túnel (03:36 y 03:48 UTC, tres intentos); la Junta Monetaria se armó con la respuesta del reconocimiento de las 02:16 UTC del mismo día (§5.7) | 2026-09-30 |

## 6. Instantáneas

Una instantánea es un archivo que escribe un script de `scripts/` y que se versiona en git con el resto del árbol: entra a producción con el despliegue que la contiene. `package.json` solo define `dev`, `build` y `start`; `next build` no ejecuta ningún script de `scripts/`. El repositorio no tiene `.github/` ni `vercel.json`: no hay ejecución programada en el repositorio. Cada script se corre a mano, uno por uno:

```bash
python3 scripts/build-<nombre>.py
node scripts/build-grafo.mjs            # también build-grafo-volcado.mjs y build-grafo-tablas.mjs
node --no-warnings scripts/build-indice-busqueda.mjs
```

`.claude/settings.json` preautoriza `python3 scripts/build-nomina.py` y `python3 scripts/build-deuda.py`. Las cabeceras de `build-deuda.py` y `build-normativa.py` piden red con acceso al origen (una máquina local o un sandbox con egreso); `build-tenedores.py` y `build-leyes.py` declaran que su mecánica se verificó desde un sandbox con egreso y desde una máquina local.

**Dónde viven.**

| Directorio | Qué hay | Cómo se alcanza |
|---|---|---|
| `public/data/` | 754 archivos, 241,118,798 B | archivo estático en `/data/<ruta>` con `Cache-Control: public, max-age=3600, stale-while-revalidate=86400` (`headers()` de `next.config.ts`, fuente `/:dir(data\|tablas)/:path*`); los módulos de `lib/` lo leen además con `node:fs` desde las funciones |
| `public/tablas/` | 9 tablas Parquet y `meta.json`, 3,985,819 B | `/tablas/<archivo>`, misma cabecera; `/api/sql` las abre con DuckDB (§7) |
| `datos/grafo/` | 1,688 archivos, 27,984,955 B | fuera de `public/`: no tiene URL; viaja en las funciones que lo declaran en `outputFileTracingIncludes` (§1, §7) |

El navegador pide directamente `/data/nomina.json` (`lib/nomina.ts`, con `preload` en `/nomina`); `/proveedores/inhabilitados` enlaza `/data/sanciones.json` para descargar, y el grafo publica `/data/grafo/grafo.nt.gz`. `outputFileTracingExcludes` deja fuera de toda función `congreso.json`, `sentencias.json`, `busqueda/corpus.json` y los dos volcados del grafo: se sirven solo como archivo.

**Contrato común de los scripts con red.** User-Agent `Socratico-Inteligencia/1.0 (<propósito>; herramienta independiente)`, `content-type` validado y un reintento. Piden `robots.txt` en cada corrida `build-auditorias.py`, `build-banca.py`, `build-catalogo.py`, `build-documentos.py` (y con su lector, `build-declaraciones.py`) y `build-sociedad.py`; `build-sanciones.py` lo pide solo al host de la API del Banco Mundial (`robots_permite_api`: un 4xx cuenta como «no disponible» y se lee, un 5xx no, según RFC 9309 §2.3.1). Se niegan a escribir ante un resultado inverosímil, entre otros: `build-catalogo.py` (menos de 800 conjuntos), `build-sismap.py` (menos de 20 filas en una tabla), `build-auditorias.py`, `build-congreso.py` (un período por debajo del 98 % de su total), `build-decretos.py` y `build-funcionarios.py` (menos de 75,000 decretos), `build-bcrd.py` y `build-mapa.py` (slugs distintos de `lib/provincias.ts`). Modos sin volver a pedir: `build-obras.py --local DIR`, `build-mapa.py --local ARCHIVO`, `build-sociedad.py --crudos DIR`, `build-auditorias.py --cache D`, `build-banca.py --cache D --sin-red`, `build-empresas.py --cache` (en `.cache/empresas/`, ignorado por git), `build-decretos.py` y `build-funcionarios.py` con `--cache` (por omisión `socratico-funcionarios` en el directorio temporal; la lectura de decretos se reutiliza si tiene menos de un día) y `--sin-red`.

**Dependencias de Python fuera de la biblioteca estándar** (no están en `package.json` ni en el despliegue): `xlrd` (`build-bcrd.py`, `build-subastas.py`, para `.xls` BIFF), `numpy` y `tokenizers` (`build-busqueda.py`), `numpy`, `safetensors`, `tokenizers` y `wordfreq` (`build-modelo-semantico.py`), `pypdf` y `pdfminer.six` (`build-instituciones.py`, `build-funcionarios.py`), `openpyxl` y, si el origen fuerza brotli, `brotli` (`build-funcionarios.py`). Los `.mjs` cargan módulos de `lib/` sin compilar con `scripts/cargador-ts.mjs` (`registrarTs`: `module.stripTypeScriptTypes`, alias `@/`, y un `unstable_cache` que no guarda nada).

**Inventario.** Tamaños medidos con `du -sb` el 2026-10-02; la fecha es la que figura dentro del archivo. «Lee» es lo que el script abre de otras instantáneas.

| Script | Fuente | Salida | Tamaño | Fecha en el archivo | Lee |
|---|---|---|---|---|---|
| `build-fiscal.py` | API del SIGEF, `gastos/institucion`, tres secciones (§5.2) | `public/data/fiscal.json` | 81,030 B | `generadoEn` 2026-09-01T22:52:23Z; `anio` 2026, `mesCorte` 9 (último mes con filas; el último con devengado es 8, el que toma `lib/fiscal.ts`) | — |
| `build-subsidio.py` | API del SIGEF, `gastos/transferencias`, capítulo 0999 (§5.2) | `public/data/subsidio-electrico.json` | 3,146 B | `generado` 2026-09-24 | — |
| `build-deuda.py` | Crédito Público, `/inicio/estadisticas?dlAnio=AAAA` y XLSX (§5.3) | `public/data/deuda.json` | 16,144 B | `generadoEn` 2026-09-23; `periodo` Jul-26 (`fecha` 2026-07-31) | — |
| `build-subastas.py` | Crédito Público, consolidado anual de subastas (§5.3) | `public/data/subastas.json` | 3,610 B | `generado` 2026-09-24 | — |
| `build-tenedores.py` | Crédito Público, tenedores de bonos internos y deuda por acreedor (§5.3) | `public/data/tenedores.json` | 58,108 B | `generado` 2026-10-02; series hasta 2026-08 | — |
| `build-bcrd.py` | BCRD CDN: `ipc_base_2019-2020.xls`, `lleg_total.xls` (§5.3) | `public/data/bcrd.json` | 5,987 B | `generado` 2026-10-02; `ipc.corte` y `turismo.corte` 2026-08 | — |
| `build-normativa.py` | Consultoría Jurídica, buscador (cuatro tipos por año) y gacetas (§5.6) | `public/data/normativa.json` | 1,360,839 B | `generadoEn` 2026-09-23 | — |
| `build-leyes.py` | Consultoría Jurídica, todas las leyes en una consulta (§5.6) | `public/data/leyes.json` | 1,878,176 B | `generadoEn` 2026-09-27 | — |
| `build-decretos.py` | Consultoría Jurídica, todos los decretos (`scripts/consultoria_decretos.py`) (§5.6) | `public/data/decretos/` (182 archivos: `indice.json`, `sin-fecha.json`, uno por año) | 13,121,398 B | `indice.json`: `generado` 2026-09-29 | caché de decretos compartida con `build-funcionarios.py` |
| `build-justicia.py` | Poder Judicial, boletines estadísticos (§5.6) | `public/data/justicia.json` | 9,397 B | `generadoEn` 2026-09-24; mes 2026-07, preliminar | — |
| `build-sentencias.py` | TC y TSE, listados anuales (§5.6) | `public/data/sentencias.json` | 4,428,883 B | `generado` 2026-09-27 | — |
| `build-congreso.py` | SIL de Diputados, dos períodos y directorio (§5.5) | `public/data/congreso.json` | 7,543,666 B | `generado` 2026-09-27T23:32:21Z | — |
| `build-procesos.py` | DGCP, tabla de procesos (§5.1) | `public/data/procesos.json` | 10,876,104 B | `generado` 2026-09-27; `desde` 2025-09-25, `hasta` 2026-09-25 | — |
| `build-historico.py` | DGCP, tablas de contratos y procesos (§5.1) | `public/data/historico/`: `resumen.json`, `instituciones.json`, `proveedores/0..9.json` | 6,837,078 B (12 archivos) | `resumen.json`: `generado` 2026-09-24, `corte` 2026-09-22 | — |
| `build-rnc.py` | DGCP, tabla de proveedores; DGII, `RNC_CONTRIBUYENTES.zip` (§5.1) | `public/data/rnc/` (`0..9.json`, `meta.json`) | 3,838,504 B | `meta.json`: `generado` 2026-09-23, `corteDgii` 2026-09-19 | — |
| `build-empresas.py` | DGII, `RNC_CONTRIBUYENTES.zip`; DGCP, tabla de proveedores (§5.7) | `public/data/empresas/` (510 archivos) | 16,348,452 B | `meta.json`: `generado` 2026-09-29, `corteDgii` 2026-09-19 | — |
| `build-historico-rnc.py` | sin red | `public/data/historico/rnc.json` | 459,892 B | `generado` 2026-09-30; `corteHistorico` 2026-09-22; `cortePadron` 2026-09-19 | `historico/proveedores/`, `empresas/` |
| `build-sanciones.py` | DGCP, inhabilitados y registro; OFAC, `SDN.CSV` y `ADD.CSV`; Banco Mundial (§5.1) | `public/data/sanciones.json` | 1,182,106 B | `generado` 2026-09-30; DGCP `corte` 2026-09-22; OFAC `fecha` 2026-09-29 | — |
| `build-banca.py` | SB, SIPEN, Superintendencia de Seguros, IDECOOP (§5.7) | `public/data/banca.json` | 807,531 B | `generado` 2026-09-29T23:36:22Z; `cortes.sb` 2025-02-06 a 2026-09-29; IDECOOP 2024-06 | — |
| `build-instituciones.py` | DGCP, `unidades_compra`; DIGEPRES, Clasificador Institucional y cuadros de receptoras (§5.7) | `public/data/instituciones.json` | 262,854 B | `generado` 2026-09-29; clasificador actualizado 2026-01-09 | `fiscal.json`, `normativa.json` |
| `build-funcionarios.py` | MAP, Directorio de Funcionarios; Consultoría, decretos; cortes y órganos; JCE; BCRD, Junta Monetaria (§5.7) | `public/data/funcionarios.json` | 5,378,023 B | `generado` 2026-09-29; MAP `corte` 2026-09-29 | `instituciones.json`, `congreso.json` |
| `build-declaraciones.py` | bibliotecas WordPress (búsqueda «declaracion») y Presidencia (§5.7) | `public/data/declaraciones.json` | 33,747 B | `generado` 2026-09-30 | `funcionarios.json` |
| `build-wikidata.py` | QLever, réplica de Wikidata (§5.7) | `public/data/wikidata.json` | 4,285 B | `generado` 2026-09-30 | `instituciones.json`, `banca.json`, `funcionarios.json`, `lib/provincias.ts` |
| `build-nomina.py` | CSV de nómina de cada institución, manifiesto en el script (§5.8) | `public/data/nomina.json` | 2,364,333 B | `generatedAt` 2026-09-24 | `scripts/fuentes-nomina/` sin `--descargar` |
| `build-nomina-general.py` | MAP, Nómina Pública General (§5.8) | `public/data/nomina-general.json` | 960,944 B | `generado` 2026-09-24; `anio` 2026, `mes` 7 | `instituciones.json` |
| `build-obras.py` | MapaInversiones, cuatro CSV (§5.9) | `public/data/obras.json`, `obras-detalle.json` | 1,760,464 B + 2,097,318 B | `generado` 2026-09-23; `corte` 2026-09-22 | `instituciones.json` |
| `build-sociedad.py` | MIP, MINERD, MIVHED (§5.9) | `public/data/sociedad.json` | 21,633 B | `generado` 2026-09-24 | la instantánea anterior, si un bloque falla |
| `build-mapa.py` | HDX, COD-AB de la ONE (§5.9) | `public/data/mapa.json` | 40,888 B | `generado` 2026-09-30; `vigente` 2021-06-29 | — |
| `build-sismap.py` | SISMAP (§5.10) | `public/data/sismap.json` | 119,115 B | `consultado` 2026-09-23 | `instituciones.json` |
| `build-auditorias.py` | Contraloría y Cámara de Cuentas (§5.10) | `public/data/auditorias.json` | 61,303 B | `generado` 2026-09-24T22:15:35+00:00 | `instituciones.json` |
| `build-documentos.py` | bibliotecas WordPress de 23 hosts (§5.10) | `public/data/documentos/` (`indice.json`, `filas.json`) | 3,246,098 B | `generado` 2026-09-24 | — |
| `build-catalogo.py` | datos.gob.do, búsqueda HTML (§5.10) | `public/data/catalogo.json` | 243,886 B | `generado` 2026-09-24 | — |
| `build-modelo-semantico.py` | Hugging Face, `minishlab/potion-multilingual-128M`; `wordfreq`; títulos de las instantáneas (§8) | `public/data/busqueda/tokenizer.json`, `modelo.bin`, `modelo.json` | 2,741,288 B + 9,614,484 B + 162 B | `modelo.json` no lleva fecha (72,837 piezas, 128 dimensiones) | `nomina.json`, `catalogo.json`, `obras.json`, `normativa.json`, `documentos/filas.json`, `instituciones.json` |
| `build-busqueda.py` | sin red (§8) | `public/data/busqueda/corpus.json`, `vectores.bin` | 47,422,621 B + 20,539,728 B | `corpus.json`: `generado` 2026-09-30, `huella` `ad382ba3b866b275`, 204,685 entradas | `instituciones.json`, `normativa.json`, `leyes.json`, `obras.json`, `documentos/`, `catalogo.json`, `nomina.json`, `procesos.json`, `sentencias.json`, `congreso.json`, `funcionarios.json`, `banca.json`, `rnc/`, `historico/proveedores/`, el modelo de `busqueda/` |
| `build-indice-busqueda.mjs` | sin red (§8) | `public/data/busqueda/indice.bin` | 64,152,504 B | cabecera `SIB2`, etiqueta `2026-09-30\|ad382ba3b866b275\|204685` | `busqueda/corpus.json`, `busqueda/vectores.bin` |
| `build-grafo.mjs` | sin red: `lib/grafo-constructores.ts` sobre las instantáneas (§7) | `datos/grafo/` (1,688 archivos) | 27,984,955 B | `meta.json`: `generado` 2026-10-02, `aFecha` 2026-09-29 | todas las instantáneas que leen los constructores |
| `build-grafo-volcado.mjs` | sin red: el grafo compilado (§7) | `public/data/grafo/`: `grafo.nt.gz`, `grafo.trig.gz`, `meta.json` | 11,193,069 B | `generado` 2026-10-02; `cortes` de cada fuente | `datos/grafo/`, `instituciones.json`, `banca.json`, `historico/resumen.json`, `historico/rnc.json`, `empresas/meta.json`, `sanciones.json`, `wikidata.json` |
| `build-grafo-tablas.mjs` | sin red: el volcado y las instantáneas (§7) | `public/tablas/` (9 Parquet y `meta.json`) | 3,985,819 B | `meta.json`: `generado` 2026-10-02 | `grafo/grafo.nt.gz`, `historico/`, `instituciones.json`, `procesos.json`, `empresas/meta.json`, `sanciones.json`, `banca.json`, `wikidata.json` |

Los demás archivos de `scripts/` no escriben instantáneas: `busqueda_*.py` son lectores de entradas del corpus que importa `build-busqueda.py`; `privacidad.py` (`sin_cedula`) y `consultoria_decretos.py` son módulos compartidos; `eval-mcp.mjs`, `validar-grafo.mjs`, `probar-pantallas.mjs` y `menciones-sin-enlace.mjs` comprueban sin escribir; `aplicar-auth-supabase.sh` es de §10; `certificados/sectigo-ov-r36.pem` es el intermedio que usa `build-funcionarios.py`.

**Orden.** Se deduce de lo que cada script lee:

1. Sin otras instantáneas: `fiscal`, `subsidio`, `deuda`, `subastas`, `tenedores`, `bcrd`, `normativa`, `leyes`, `decretos`, `justicia`, `sentencias`, `congreso`, `procesos`, `historico`, `rnc`, `empresas`, `sanciones`, `banca`, `nomina`, `mapa`, `sociedad`, `documentos`, `catalogo`.
2. `instituciones`, tras `fiscal` y `normativa`.
3. Tras `instituciones`: `obras`, `sismap`, `auditorias`, `nomina-general` y `funcionarios` (este, además, tras `congreso`).
4. Tras `funcionarios`: `declaraciones`; y `wikidata` (además, tras `banca`).
5. `historico-rnc`, tras `historico` y `empresas`.
6. `modelo-semantico` (solo cuando se rehace el modelo), `busqueda` tras todo lo que entra al corpus, y `build-indice-busqueda.mjs` tras `busqueda`.
7. `build-grafo.mjs` tras todas; `build-grafo-volcado.mjs` tras él; `build-grafo-tablas.mjs` tras el volcado.

El gate (§12) comprueba que la etiqueta de `indice.bin` sea la de `corpus.json` y que guarde el sha256 de `vectores.bin`; que `node scripts/build-grafo.mjs --comprobar` encuentre en `datos/grafo/` lo mismo que dicen los constructores sobre las instantáneas actuales; y que ninguna cédula aparezca en `public/data`, `public/tablas` ni `datos`. También rechaza un archivo versionado de más de 90 MB; el mayor, el 2026-10-02, es `public/data/busqueda/indice.bin` (64,152,504 B).

**Comportamiento de la interfaz.**

- **Solo instantánea.** El módulo lee el archivo con `readFile(join(process.cwd(), "public", "data", …))` una vez por instancia y memoiza la promesa; un fallo devuelve `null` y suelta la memoria. La página pone la fecha del archivo en su rótulo («corte al …» en `/obras`, del campo `corte`; «consultado el …» en `/gestion`; «instantánea del …» en `/pais` y `/auditorias`; «índice del …» en `/documentos`; «catálogo del …» en `/datos») y, con `null`, pinta `EstadoVacio` `variante="caida"` con un título «No pudimos leer…» y un enlace a `/fuentes` en `/obras`; los listados vacíos por un filtro usan otro título («Ningún … coincide con …»). `/pais` avisa en la cabecera cuando un bloque trae `heredadoDe`. El archivo solo cambia con un despliegue.
- **Instantánea como respaldo de una lectura en vivo.** `lib/deuda.ts` intenta Crédito Público en vivo y, si no contesta, devuelve la instantánea con `desdeInstantanea: true` y `generadoEn`; `/deuda` muestra el aviso «Instantánea verificada el …: el servidor del origen no acepta lecturas desde la nube»; `/indicadores` dice lo mismo en su nota, `/` añade «instantánea del …» a la tarjeta, `/finanzas` «Instantánea guardada: el portal de origen no responde desde nuestros servidores» y `/fuentes` cambia la métrica a «Instantánea del». La serie de `/deuda` sale siempre de la instantánea (`getSerieDeuda`) y suma al final el último saldo en vivo si es posterior. `lib/normativa.ts` devuelve `origen: "vivo"` o la fecha `generadoEn` de `normativa.json`, y en la ficha de una norma `instantanea` con la fecha de `normativa.json`, `leyes.json` o `decretos/indice.json`; `/normativa` muestra «Instantánea del …» cuando el origen no es `"vivo"`, la ficha `/normativa/[tipo]/[numero]` «Datos de la instantánea del …», y la ruta CSV de `/normativa` escribe la procedencia (§5.6).

## 7. Grafo

### 7.1 Direcciones de entidad y reconocimiento (`lib/grafo.ts`, `lib/grafo-servidor.ts`)

`lib/grafo.ts` no importa nada ni lee datos; lo usan componentes de servidor y de cliente (`components/proceso-card.tsx`, `components/seguir-button.tsx`). Define `TipoNodo` (15 tipos: `institucion`, `proveedor`, `proceso`, `norma`, `iniciativa`, `expediente-senado`, `legislador`, `votacion`, `obra`, `provincia`, `capitulo`, `cargo`, `funcionario`, `entidad-financiera`, `empresa`) y el objeto `enlace`, que es el único lugar donde se escribe la ruta de cada entidad:

| Función | Ruta |
|---|---|
| `enlace.institucion(id, siglasONombre?)` | `/instituciones/<id>-<siglas o nombre en slug, ≤40>`; sin nombre, `/instituciones/<id>` |
| `enlace.proveedor(rpe)` · `enlace.documentoProveedor(n)` | `/proveedores/<rpe>` · `/proveedores?q=<cifras>` |
| `enlace.proceso(codigo)` | `/procesos/<codigo>` |
| `enlace.norma(tipo, numero)` | `/normativa/<ley\|decreto\|reglamento\|resolucion>/<número>`; `null` si el tipo no está en `RUTA_NORMA` o el número no casa con `^\d{1,4}-\d{2,4}$` |
| `enlace.iniciativa` · `enlace.expedienteSenado` · `enlace.legislador` · `enlace.votacion` | `/congreso/<id>` · `/congreso/senado/<cuatrienio>/<id>` · `/congreso/legisladores/<id>` · `/congreso/votaciones/<id>` |
| `enlace.obra` · `enlace.provincia` · `enlace.capitulo` · `enlace.cargo` | `/obras/<snip>` · `/provincias/<slug>` · `/finanzas/<codigo>` · `/nomina?cargo=<nombre>` |
| `enlace.funcionario` · `enlace.decretosFirmados` | `/funcionarios/<slug>` · `/funcionarios/<slug>/decretos` |
| `enlace.entidadFinanciera` · `enlace.empresa` | `/banca/<slug>` · `/empresas/<rnc de 9 cifras>` |
| `enlace.grafo(ruta?)` · `enlace.caminoGrafo(de, a)` | `/grafo?nodo=<ruta>` · `/grafo/camino?de=&a=` |
| `enlace.rdf(ruta, formato)` | `/api/grafo?nodo=<ruta>&formato=<ttl\|jsonld\|nt\|trig\|nq>` |

`numeroCanonico` reduce el año de leyes y decretos a dos cifras («47-2025» → «47-25»); las resoluciones conservan el año tal como viene. El paso 2f de `verificar.sh` (§12) busca en `app`, `components` y `lib` una ruta de entidad armada con plantilla o concatenación fuera de `lib/grafo*` y falla si la encuentra.

Reconocimiento de menciones en un texto (`Mencion`: inicio, fin, tipo, `href`):
- `reconocerPorForma` (cliente y servidor): citas de normas (`CITA_NORMA`, incluidas listas «Leyes núms. 506-19 y 68-20», cada número su mención), códigos de proceso de la DGCP (`CODIGO_PROCESO`) y números SNIP. `sinSolapes` ordena y descarta la mención que pisa a otra (gana la más larga).
- `reconocerInstituciones` y `reconocerTodo` (`lib/grafo-servidor.ts`, solo servidor: importa `INSTITUCIONES`): el nombre completo de una institución, de 18 caracteres o más una vez quitados los paréntesis, de las que pasan `seReconocePorNombre`; los patrones van del más largo al más corto.
- `components/texto-enlazado.tsx` pinta un texto con sus menciones como enlaces (`soloForma` elige el reconocedor de cliente).
- `components/conectado-con.tsx` (`ConectadoCon`, tipo `Arista`: etiqueta, `href`, cuenta, nombre, fuente) es el bloque «Conectado con» de 13 fichas (`app/{empresas,procesos,banca,normativa,funcionarios,instituciones,obras,proveedores,provincias,finanzas}/…` y las tres del Congreso); una arista con cuenta cero no se pinta.
- `app/normativa/[tipo]/[numero]/page.tsx` responde a una norma que no está en la Consultoría con `NormaFueraDeAlcance`.

Los nodos del grafo semántico son seis (`TipoNodoRdf`): `funcionario`, `institucion`, `entidad-financiera`, `empresa`, `decreto`, `provincia`. `rutaDeNodo` da su ruta estable (la institución sin sufijo de nombre: `/instituciones/5`) y `nodoDeRuta` hace lo inverso, con o sin `#id` y canonizando el número de decreto.

### 7.2 Ontología (`lib/ontologia.ts`)

Una sola definición (`CLASES`, `PROPIEDADES`, `esquemas()`) de la que salen todas las formas. `VERSION = "2.0.0"`, `PUBLICADA = "2026-10-01"`. Al cargar el módulo se comprueba que ningún nombre local se repite entre clases, propiedades, esquemas y conceptos de los dos módulos (lanza si se repite).

Espacios de nombres (`lib/rdf.ts`, escritos así en el código):

| Constante | IRI | Prefijo |
|---|---|---|
| `W3ID` | `https://w3id.org/socratico` | — |
| `ONTOLOGIA` | `https://w3id.org/socratico/def/core` | `soc:` (`…/def/core#`), núcleo |
| `ONTOLOGIA_DO` | `https://w3id.org/socratico/def/do` | `do:` (`…/def/do#`), módulo dominicano |
| `FORMAS` (`lib/ontologia.ts`) | `https://w3id.org/socratico/def/formas#` | formas SHACL |
| `ONTOLOGIA_FABRIC` | `https://w3id.org/socratico/def/fabric` | `fabric:` |
| `ESPACIO_V1` | `https://socratico.vercel.app/ontologia#` | términos de la versión 1 |
| `PAGINA_ONTOLOGIA` | `${SITIO}/ontologia` | — |

`do:` declara `dct:requires` del núcleo (no `owl:imports`). Los dos módulos se sirven en un mismo documento. `PREFIJOS` declara 23 prefijos (`soc`, `do`, `rdf`, `rdfs`, `owl`, `xsd`, `skos`, `dct`, `foaf`, `schema`, `org`, `rov`, `eli`, `void`, `vann`, `vs`, `prov`, `oa`, `adms`, `epo`, `sh`, `fabric`, `wd`).

Conteo (calculado del módulo el 2026-10-02; `resumenOntologia()` da los mismos):

| | Total | Núcleo `soc:` | `do:` | En uso | Definido | Con término de la v1 |
|---|---|---|---|---|---|---|
| Clases | 35 | 34 | 1 (`MedidaDGCP`) | 17 | 18 | 14 |
| Propiedades | 65 (43 de objeto, 22 de dato) | 58 | 7 (`rnc`, `rpe`, `numeralLey311`, `snip`, `tipoDeMedida`, `etiquetaConsultoria`, `aviso`) | 33 | 32 | 33 |
| Esquemas SKOS | 7, con 74 conceptos | 1 (`tiposDeEvento`, 9) | 6: `materias` (17), `movimientos` (9), `sectores` (8), `familiasPep` (9), `tiposDeMedida` (15), `esquemasDeIdentificador` (7) | — | — | 5 esquemas |

- **Estado** (`vs:term_status`): «en uso» → `stable`; «definido» → `testing`. Clases en uso: `soc:Persona`, `PersonaExpuestaPoliticamente`, `Organizacion`, `Institucion`, `EntidadFinanciera`, `Empresa`, `Proveedor`, `Cargo`, `Norma`, `Decreto`, `Documento`, `DeclaracionJurada`, `Contratacion`, `Sancion`, `Lugar`, `Provincia` y `do:MedidaDGCP`. Definidas sin instancias: `Partido`, `Puesto`, `Ocupacion`, `Membresia`, `Evento`, `Ley`, `Iniciativa`, `Votacion`, `Sentencia`, `Mencion`, `ProcesoDeContratacion`, `Adjudicacion`, `Contrato`, `ProyectoDeInversion`, `PartidaPresupuestaria`, `Municipio`, `Identificador`, `Instantanea`.
- **Herencia interna** (`padre`, una por clase, 13 clases): Institución, Entidad financiera, Empresa y Partido → `soc:Organizacion`; Decreto y Ley → `soc:Norma`; PEP → `soc:Persona`; Votación → `soc:Evento`; Declaración jurada y Sentencia → `soc:Documento`; `do:MedidaDGCP` → `soc:Sancion`; Provincia y Municipio → `soc:Lugar`.
- **Alineaciones externas**: `rdfs:subClassOf` hacia 26 clases de schema.org, FOAF, W3C ORG, ROV, PROV-O, ELI, Web Annotation (`oa:`), ePO y ADMS (`subClaseDe`); `rdfs:subPropertyOf` hacia 22 propiedades de ORG, schema.org, Dublin Core, ELI, Web Annotation, ADMS y SKOS (`subPropiedadDe`); `skos:closeMatch`/`skos:broadMatch` a Wikidata en 10 clases (Q5, Q106155, Q327333, Q650241, Q43229, Q294414, Q2571972, Q820655, Q454263, Q913337); esquema de FollowTheMoney (`ftm`) en 28 clases; `owl:hasKey` en `soc:Empresa` (`do:rnc`) y `soc:Proveedor` (`do:rpe`); inversas `ocupa`↔`titular` y `firmadoPor`↔`firmo`; 27 propiedades funcionales; 16 propiedades obligatorias en alguna clase (`obligatoriaEn`).
- **Versión 1**: cada término con `v1: true` se declara en `ESPACIO_V1` con su tipo, como `rdfs:subClassOf`/`rdfs:subPropertyOf` del de ahora y `owl:deprecated true`; cada concepto de los 5 esquemas con `v1`, `skos:exactMatch` a su IRI de la v1. La cabecera del núcleo lleva `owl:priorVersion` a la v1.
- **Varios dominios o rangos**: `owl:unionOf` en un nodo en blanco (`owl:Class` o `rdfs:Datatype`).

Salidas de la misma definición:

| Salida | Función | Ruta | Contenido |
|---|---|---|---|
| OWL 2 y RDFS | `triplesOntologia()` | `/ontologia.ttl`, `/ontologia.jsonld`, `/ontologia.nt` | 1,562 triples |
| SHACL | `triplesFormas()` | `/ontologia.shacl.ttl` | 537 triples: una `sh:NodeShape` por clase (35), 84 formas de propiedad (tipo de dato, o `sh:class` con `sh:nodeKind sh:BlankNodeOrIRI`; `sh:or` en 11; `sh:maxCount 1` en 36; `sh:minCount 1` en 18) |
| Perfil Microsoft Fabric IQ | `triplesFabric()` | `/ontologia.fabric.ttl` | 970 triples: 35 tipos y 92 propiedades (51 de objeto, 41 de dato) en `fabric:`; nombres `^[A-Za-z0-9_-]{1,26}$` (`NOMBRE_FABRIC`), únicos (lanza si no); una propiedad por par dominio-rango (`fecha_Norma`); rango a concepto, texto con idioma o unión de datos → `xsd:string`; cada término con `rdfs:seeAlso` al suyo de `soc:`/`do:`. El comentario de `triplesFabric` declara que el perfil no se verificó con una importación real. |
| Página | `CLASES`, `PROPIEDADES`, `esquemas()`, `resumenOntologia()` | `/ontologia` (`app/ontologia/page.tsx`) | un ancla por término |
| MCP | — | herramienta `ontology` (§9.2) | |

Las cinco rutas de archivo (`app/ontologia.*/route.ts`) son `force-static` y responden con `Access-Control-Allow-Origin: *`.

`lib/ontologia-esquemas.ts` deriva de la misma definición: `TABLAS` (las nueve tablas Parquet de §7.9: cada tabla con su clase y cada columna con la propiedad que guarda; el módulo lanza al cargar si una columna nombra una propiedad inexistente, de otro dominio o con un tipo que no cabe en su rango), `tipoDeColumna`, `esquemaFila(tabla)` (zod por fila) y `esquemaClase(clase)` (zod de un nodo: sus propiedades `soc:`/`do:` con tipo y cardinalidad).

### 7.3 RDF (`lib/rdf.ts`)

Módulo puro, sin dependencias. `Termino` (IRI, literal con idioma o tipo, nodo en blanco), `Triple`, `Cuadruple` (con grafo `g`). Constructores `iri`, `lit`, `tipado`, `entero`, `decimal`, `booleano`, `fecha` (`xsd:date` o `xsd:gYear`), `t`. `normalizarIri` codifica en `%XX` lo que la gramática de IRI no admite.

| Formato | Función | Tipo MIME (`TIPO_MIME`) |
|---|---|---|
| `ttl` | `aTurtle` (prefijos usados, un bloque por sujeto, `a` primero) | `text/turtle` |
| `nt` | `aNTriples` (sin repetidos) | `application/n-triples` |
| `jsonld` | `aJsonLd` (JSON-LD 1.1 aplanado: `@context` y `@graph`) | `application/ld+json` |
| `trig` | `aTrig` (grafo por omisión primero, un bloque por grafo con nombre) | `application/trig` |
| `nq` | `aNQuads` | `application/n-quads` |

`serializar(triples, formato, cabecera?)` elige (la cabecera, como comentario, solo en Turtle y TriG). `formatoDeAccept` devuelve `null` si `Accept` está vacío o incluye `text/html`; ninguna ruta la llama: la negociación la hace `redirects()` (abajo).

IRIs de las cosas (`iriDe` en `lib/grafo-nodo.ts`): `${SITIO}${rutaDeNodo(n)}#id`, con `SITIO = "https://socratico.vercel.app"` (`lib/sitio.ts`). Nodos intermedios: un cargo, `/funcionarios/<slug>#cargo-<huella>` (FNV-1a en base 36, `lib/grafo-constructores.ts`); una medida de la DGCP, `/proveedores/<rpe>#medida-<huella>`; una contratación, `/proveedores/<rpe>#contratacion-<id de institución>`, el mismo IRI desde la institución y desde el proveedor. Un decreto sin ficha usa la URL de su PDF (`CONSULTORIA_PDF = "https://www.consultoria.gov.do/api/document/"`).

Negociación de contenido (`redirects()` de `next.config.ts`; el resto del archivo en §1):

| Ruta pedida | Condición (`has` sobre `accept`, sin `text/html`) | Destino (303) |
|---|---|---|
| `/funcionarios/:slug`, `/instituciones/:id`, `/banca/:slug`, `/empresas/:rnc`, `/normativa/decreto/:numero`, `/provincias/:slug` | `text/turtle` o `application/x-turtle`, `application/ld+json`, `application/n-triples`, `application/trig`, `application/n-quads` | `/api/grafo?nodo=<ficha>&formato=<ttl\|jsonld\|nt\|trig\|nq>` |
| `/ontologia` | Turtle, JSON-LD o N-Triples | `/ontologia.<ttl\|jsonld\|nt>` |
| `/def/:modulo(core\|do)/:version?` | Turtle, JSON-LD o N-Triples | `/ontologia.<formato>`; sin esa cabecera, `/ontologia` |
| `/def/formas` · `/def/fabric` | siempre | `/ontologia.shacl.ttl` · `/ontologia.fabric.ttl` |
| `/:clase(fuente\|derivado)/:ruta*` | siempre | `/fuentes` |

Ni `next.config.ts` ni las rutas declaran `Vary: Accept`.

### 7.4 El grafo compilado (`datos/grafo/`)

**Constructores** (`lib/grafo-constructores.ts`). `describirEnVivo(n, ligero)` arma los triples de un nodo desde las instantáneas (`describirPersona`, `describirInstitucion`, `describirFinanciera`, `describirEmpresa`, `describirDecreto`, `describirProvincia`); cada vecino lleva su `rdfs:label`. `ligero` deja el nodo con sus datos propios (de ahí sale el schema.org de la ficha). Topes que la descripción declara en `nota`: `TOPE_CARGOS = 200` cargos vigentes de una institución; `TOPE_FIRMADOS = 20` decretos más recientes de un firmante; los 12 mayores proveedores de una institución (de `lib/historico.ts`). También exporta `grafosEnVivo()`, `inventarioEnVivo()` y `enlacesWikidataEnVivo()`. Ninguna ruta lo importa: el paso 2g de `verificar.sh` falla si algún archivo de `app`, `components` o `lib` importa `@/lib/grafo-constructores`.

**Compilador** (`scripts/build-grafo.mjs`, tras las demás instantáneas; §6). Corre en Node sin Next: `scripts/cargador-ts.mjs` (`registrarTs`) quita los tipos con `module.stripTypeScriptTypes`, resuelve `@/`, carga un JSON como módulo y sustituye `next/cache` por un `unstable_cache` que no guarda. Recorre cada nodo de cada tipo en orden `TIPOS_COMPILADOS` (`provincia`, `institucion`, `entidad-financiera`, `funcionario`, `decreto`, `empresa`); un decreto es nodo si su fila del registro tiene ficha; las empresas salen de `public/data/empresas/filas/`. Por nodo:
- pasa cada sujeto con un tipo `soc:`/`do:` por `esquemaClase` de su clase (`contraLaOntologia`); si uno no cabe, no escribe nada;
- una empresa cuya descripción es idéntica a `describirEmpresaSola(fila del padrón)` (la empresa que el grafo no liga a nada) no se escribe;
- reparte en fragmentos en orden de clave (`BYTES_POR_FRAGMENTO = 160_000` estimados; `BYTES_POR_FRAGMENTO_LD = 96_000`), brotli calidad 11, en paralelo en el pool de libuv.

Luego escribe `meta.json`, `ld/meta.json`, `nombres.json.br`, `firmados/` y `compras.json`, y ejecuta la comprobación. `node scripts/build-grafo.mjs --comprobar` solo comprueba: relee cada nodo por `describir()` y `schemaOrgDe()` (los lectores del servidor) y lo compara triple a triple, grafo a grafo, con `describirEnVivo`; compara el índice de vecinos, el inventario, los grafos con nombre, `compras.json`, `nombres.json.br`, cada archivo de `firmados/`, cada decreto por número y una batería de búsquedas por nombre contra `filtrarPersonas`/`filtrarEntidades`; sale con 1 si algo difiere. Lo corre el paso 5d del gate completo (§12). Medido el 2026-10-02 sobre este árbol: «idéntico a los constructores: 536,196 nodos y el schema.org de 536,196 fichas, 3,390,509 triples compilados», 438 búsquedas, 49 firmas y 27,544 decretos por número, 104 s.

**Formato** (`lib/grafo-nodo.ts`, módulo puro). `FORMATO_GRAFO = 2`; `metaGrafo()` y `metaLd()` rechazan otro número. `claveCompilada`: institución → su número sin ceros a la izquierda; empresa → RNC en cifras; decreto → número sin espacios; los demás, su `id`. `fragmentoDe(clave, limites)` es una búsqueda binaria sobre la primera clave de cada fragmento. Archivo de fragmento: `archivoFragmento(i)` → `NNN.json.br`.
- `FragmentoNodos`: `terminos` (tabla de términos codificados: IRI como cadena; literal `["v"]`, `["v","es"]`, `["v",0,"<tipo>"]`; nodo en blanco `{b}`) y `nodos[clave] = [título, nota, índices]`, cuatro enteros por triple (sujeto, predicado, objeto en la tabla; grafo en `meta.grafos`).
- `FragmentoVecinos` (filas comprimidas, CSR): `cadenas`, `claves`, `titulos`, `inicio`, `aristas` en tríos `[destino tipo:id, vía sin dirección, nombre]`.

Contenido de `datos/grafo/` (versionado en git: 1,688 archivos, 27,984,955 bytes):

| Ruta | Archivos | Bytes | Qué es |
|---|---|---|---|
| `meta.json` | 1 | 25,408 | formato, fechas, grafos con nombre, firmantes, tipos, inventario, Wikidata, huella |
| `nodos/<tipo>/NNN.json.br` | 668 (provincia 2, institución 44, entidad financiera 3, funcionario 89, decreto 181, empresa 349) | 19,040,418 | la descripción entera de cada nodo |
| `vecinos/<tipo>/NNN.json.br` | 668 (mismos fragmentos) | 3,963,148 | aristas de cada nodo hacia otros nodos |
| `ld/<tipo>/NNN.json.br` + `ld/meta.json` | 299 + 1 | 2,509,983 | el JSON-LD de schema.org de cada ficha |
| `nombres.json.br` | 1 | 435,055 | 15,612 personas `[id, nombre, texto plano, puntaje, cargo principal, firma]` y 1,300 entidades financieras `[slug, nombre, tipo, rnc, texto plano]` |
| `firmados/NNN.json.br` | 49 (uno por firma, en el orden de `meta.firmantes`) | 1,997,017 | 77,099 filas `[número, fecha, título, materia, institución, aviso, año, ficha, docId]` |
| `compras.json` | 1 | 13,926 | `publicadoPorInstitucion`: corte 2026-09-25, cobertura 2025-09-25 → 2026-09-25, `[procesos, suma estimada]` de 667 instituciones |

`meta.json` (`generado` 2026-10-02; `aFecha` 2026-09-29, el corte de personas con que se calcula el estado PEP vía `haceTresAnios` de `lib/funcionarios.ts`):

| Tipo | Nodos con registro | Triples | Fragmentos |
|---|---|---|---|
| `provincia` | 32 | 8,153 | 2 |
| `institucion` | 894 | 220,277 | 44 |
| `entidad-financiera` | 1,300 | 13,270 | 3 |
| `funcionario` | 15,612 | 405,888 | 89 |
| `decreto` | 27,544 | 841,543 | 181 |
| `empresa` | 79,291 | 1,901,378 | 349 |
| **Total** | **124,673** | **3,390,509** | **668** |

`empresasSolas`: 411,523 empresas del padrón sin registro (las describe `describirEmpresaSola`). `huella`: sha256 de las rutas y bytes de los fragmentos. `firmantes`: 49 firmas. `wikidata`: 109 enlaces (45 personas, 30 instituciones, 2 entidades financieras, 32 provincias), consultados el 2026-09-30. `inventario` (lo que leen `/grafo`, VoID y `fetch`):

| Clase | Instancias | Fuente | Corte |
|---|---|---|---|
| `soc:Persona` | 15,612 | MAP, decretos, cortes, JCE, Junta Monetaria y SIL | 2026-09-29 |
| `soc:Cargo` | 18,432 | ídem | 2026-09-29 |
| `soc:Institucion` | 894 | Clasificador de DIGEPRES | 2026-01-09 (actualización del clasificador) |
| `soc:Decreto` | 78,834 (el registro entero; 27,544 con ficha) | Consultoría Jurídica | 2026-09-29 |
| `soc:EntidadFinanciera` | 1,300 | SB, SIPEN, SIS e IDECOOP | 2026-09-29 |
| `soc:Empresa` | 490,814 | Padrón de la DGII | 2026-09-19 |
| `soc:Provincia` | 32 | ONE | — |
| `soc:DeclaracionJurada` | 105 | Portales de transparencia | 2026-09-30 |
| `do:MedidaDGCP` | 2,263 | DGCP | 2026-09-30 |
| `soc:Proveedor` | 22,872 | DGCP (contratos) | 2026-09-22 |
| `soc:Contratacion` | 71,965 | DGCP (contratos) | 2026-09-22 |

**Lectores del servidor.**
- `lib/grafo-compilado.ts`: `metaGrafo()` (memoizado por instancia), `leerDescripcion(n)` (abre un fragmento; caché de 128 fragmentos por instancia, `MAX_FRAGMENTOS`, se descarta el más viejo), `leerVecinos(n)` (misma caché para `vecinos/`), `triplesDeGrafos` (PROV-O de los grafos), `comprasPublicadas()`, `buscarPersonas(q)`, `personaCompilada(id)`, `buscarFinancieras(q)` (sobre `nombres.json.br`), `decretosFirmados(clave)` (un archivo de `firmados/`) y `decretoCompilado(numero)`. Lanza si el compilado no está.
- `lib/grafo-ld.ts`: `aSchemaOrg(triples, sujeto)` convierte los triples de schema.org del sujeto (más `owl:sameAs` → `sameAs`, `foaf:page` → `url`) en un objeto JSON-LD; `schemaOrgDe(n, empresa?)` lo lee de `ld/` (caché de 64 fragmentos) o, para una empresa sin registro, lo calcula de su fila del padrón.
- `components/en-el-grafo.tsx` (`EnElGrafo`, componente de servidor) incrusta ese JSON-LD en un `<script type="application/ld+json">` (con `<` escapado) y enlaza a `enlace.grafo` y a Turtle, JSON-LD y TriG. `alternasRdf(nodo)` da los cinco `<link rel="alternate">` para `metadata.alternates.types`. Lo usan las seis fichas de nodo: `app/{funcionarios/[slug],instituciones/[id],banca/[slug],empresas/[rnc],normativa/[tipo]/[numero],provincias/[slug]}/page.tsx`.

`datos/grafo/` está fuera de `public/` y no se sirve por la CDN; llega a las funciones por `outputFileTracingIncludes` de `next.config.ts`:

| Clave | Lo que lleva de `datos/grafo/` |
|---|---|
| `/grafo` (casa también `/grafo/camino` y `/api/grafo`) | `meta.json`, `nodos/**`, `vecinos/**`, `nombres.json.br` (más `public/data/empresas/**` y `wikidata.json`) |
| `/mcp` | `meta.json`, `nodos/**`, `vecinos/**`, `compras.json`, `nombres.json.br`, `firmados/**` |
| `/.well-known` | `meta.json` |
| `/funcionarios`, `/normativa`, `/instituciones`, `/banca`, `/provincias`, `/empresas` | `ld/**` |

### 7.5 Grafos con nombre

Cada constructor registra cada triple con la clave de su grafo (`Afirmaciones.de(grafo, …)`, `ClaveGrafo` en `lib/grafo-nodo.ts`); el compilado guarda la clave como cuarto índice. `grafosEnVivo()` define cada grafo con su etiqueta, su descripción, sus URLs de origen (`prov:wasDerivedFrom`) y su corte, leídos de las instantáneas. El IRI lo pone el compilador (`conIri`): `${W3ID}/fuente/<clave>/<corte>` para una fuente; `${W3ID}/derivado/<clave>/<día de compilación>` para una regla. `meta.json` trae 30 grafos:

| Clase | Claves | Corte |
|---|---|---|
| Fuente (23) | `instituciones`; `cargos-map`, `cargos-decreto`, `cargos-scj`, `cargos-cpj`, `cargos-tc`, `cargos-tse`, `cargos-jce`, `cargos-jce-suplentes`, `cargos-defensor`, `cargos-jce2024`, `cargos-congreso`, `cargos-bcrd`; `decretos`; `declaraciones`; `banca`; `padron`; `proveedores`; `contratos`; `medidas`; `ofac`; `wikidata`; `provincias` | 2026-09-29, salvo `declaraciones` y `wikidata` (2026-09-30), `padron` (2026-09-19), `contratos` y `medidas` (2026-09-22) y `provincias` (sin corte) |
| Regla de Socrático (7) | `personas` (identidad por nombre normalizado), `pep` (Ley 155-17 art. 2 num. 19 y Ley 311-14), `vigente` (cargos de hoy y quién encabeza), `identidad` (un mismo ente en dos registros), `firma` (firma y designación de decretos), `materia` (materia de cada decreto), `plataforma` (ficha de cada nodo y nombre provisional) | derivado de los grafos que lista `derivado.de`; IRI con 2026-10-02 |

`cuadruplesDe(d)` (`lib/grafo-rdf.ts`) pone cada triple en el IRI de su grafo y antepone, en el grafo por omisión, lo que `triplesDeGrafos` dice de los grafos usados: `prov:Entity`, `rdfs:label`, `dct:description`, `dct:date`, `prov:wasDerivedFrom` y, en una regla, `prov:wasAttributedTo` el sitio. Lo sirve `/api/grafo` con `formato=trig` o `nq`. Un IRI de grafo pedido al sitio (`/fuente/…`, `/derivado/…`) redirige a `/fuentes` (§7.3).

### 7.6 Lectura del grafo (`lib/grafo-rdf.ts`)

- `describir(n)`: `leerDescripcion`; si es una empresa que no está, `describirEmpresaSola` sobre `empresaPorRnc`. `describirRuta(ruta)` la combina con `nodoDeRuta`.
- `inventario()`, `enlacesWikidata()`: de `meta.json`. `volcadoDelGrafo()`: de `public/data/grafo/meta.json` (§7.8).
- `relacionesDesdeTriples(triples, sujeto)`: las aristas del nodo leídas de sus triples, atravesando el nodo de cargo. Cada `Relacion` lleva grupo, verbo, forma sin dirección (`neutro`), nodo de destino si es uno, `href`, nombre, detalle, movimiento, fecha y monto. `GRUPOS` (6, en orden): `cargos`, `compras` («Mayores contrataciones desde 2015»: «Contrató a» desde la institución, «Le contrató» desde la empresa), `decretos`, `entidades`, `lugares`, `registros`. `CLASE_DE_TIPO` da la clase en llano de cada tipo.
- `vecindario(n)`: título, clase, nota y relaciones. `vecinosDe(n)`: del índice de vecinos; si no está (empresa sin registro), de `vecindario`.
- `camino(de, a)`: búsqueda en anchura desde los dos extremos (avanza el lado con menos frontera; un lado agotado no cierra el otro), aristas sin dirección, `TOPE_CAMINO = { saltos: 6, fichas: 300 }`; devuelve `pasos`, `exploradas` y `motivo` (`agotado`, `saltos`, `fichas` o `null`). Se cachea con `unstable_cache` por par sin orden, clave `["grafo-camino", VERSION_CAMINO ("3"), huella del compilado, nodo, nodo]`, `revalidate: 86400`.
- `buscarNodos(q)`: número de decreto (de `decretoCompilado`) o RNC de nueve cifras primero; si no, personas y entidades financieras del índice de nombres, instituciones (`buscarInstituciones`) y provincias por todas las palabras; topes `TOPE_CANDIDATOS` (8 personas, 5 instituciones, 4 financieras, 16 en total) y `truncado`; el nombre exacto va primero.

### 7.7 Rutas del grafo

| Ruta | Archivo | Qué hace |
|---|---|---|
| `/grafo` | `app/grafo/page.tsx` (`revalidate` 86400) | Sin `nodo`: portada con `inventario()`, enlaces a Wikidata, el volcado, las tablas, VoID y la ontología, y `?q=` (`buscarNodos`). Con `?nodo=<ruta>`: `vecindario` pintado con `RedVecinos` (`components/graficos/red-vecinos.tsx`) y la lista por grupo; metadatos `robots: { index: false, follow: true }`. |
| `/grafo/camino?de=&a=` | `app/grafo/camino/page.tsx` (`revalidate` 86400, `maxDuration` 60) | `camino()`; `robots: { index: false, follow: false }`. |
| `/api/grafo?nodo=&formato=` | `app/api/grafo/route.ts` (`force-dynamic`) | `nodo` es la ruta de la ficha o el IRI entero (se quita `SITIO`); `formato` `ttl` (por omisión), `jsonld`, `nt`, `trig`, `nq`. 400 si el formato no es uno de esos o la ruta no es un nodo; 404 si no existe; 502 si falla. En Turtle y TriG, un comentario de cabecera con el título, el aviso de herramienta no oficial, la ficha, la ontología y la nota. `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`, CORS `*`, `Link` con `rel="canonical"` (la ficha) y `rel="describedby"` (`/ontologia`). |
| `/.well-known/void` | `app/.well-known/void/route.ts` (`force-static`) | VoID en Turtle: `void:Dataset`, `void:uriSpace`, `void:uriLookupEndpoint` (`/api/grafo?formato=ttl&nodo=`), vocabularios, `void:exampleResource`, una `void:classPartition` por clase del inventario con `void:entities`, el `void:Linkset` a Wikidata (`owl:sameAs`, `void:triples` 109) y el subconjunto del volcado (`void:dataDump` N-Triples y TriG, `void:triples`, `dct:modified`). |
| `/ontologia`, `/ontologia.{ttl,jsonld,nt,shacl.ttl,fabric.ttl}` | `app/ontologia/page.tsx`, `app/ontologia.*/route.ts` | §7.2. |

`app/robots.ts` veta `/api/`, `/grafo?` y `/grafo/camino`. Medidas fechadas: `/api/grafo` de una institución, una persona o un decreto, 0.02 s en `next start` recién arrancado (2026-10-02); en Vercel, primera llamada con ida y vuelta, 0.74 s una institución y 0.08–0.14 s una persona, un decreto o una empresa (2026-10-02). Tamaños de función: §1.

### 7.8 Volcado sin personas naturales (`public/data/grafo/`)

`scripts/build-grafo-volcado.mjs` (tras el compilador) lee cada nodo con `describir()` del compilado. Nodos de entrada: las 894 instituciones, las 1,300 entidades financieras, las 32 provincias y las empresas con RNC de nueve cifras que aparecen en `historico/rnc.json`, en `banca.json` o en `sanciones.json` (medidas de personas jurídicas y OFAC). Filtro (`esPersonal`): se descarta todo triple cuyo sujeto u objeto sea un IRI bajo `/funcionarios/`, `/normativa/decreto/`, `/congreso/` o `CONSULTORIA_PDF`, una declaración jurada, o un proveedor (`/proveedores/<rpe>#…`) que no esté atado a una empresa por `soc:inscritaComo`. Antes de escribir, relee el N-Triples y el TriG con N3.js, exige el mismo número de triples y cuádruplos, y lanza si algún triple toca `/funcionarios/`.

| Archivo | Bytes | Contenido (generado 2026-10-02) |
|---|---|---|
| `grafo.nt.gz` | 7,454,609 | 816,229 triples, N-Triples, gzip nivel 9 |
| `grafo.trig.gz` | 3,736,978 | 863,795 cuádruplos en 11 grafos: `contratos` 496,560, `padron` 236,679, `proveedores` 73,380, `plataforma` 27,532, `medidas` 11,889, `banca` 10,572, `instituciones` 6,850, `provincias` 162, `identidad` 96, `wikidata` 64, `ofac` 11; PROV-O de cada grafo en el grafo por omisión |
| `meta.json` | 1,482 | nodos (894 instituciones, 1,300 financieras, 32 provincias, 23,672 empresas, 4 sin ficha), clases (Contratacion 71,466; Proveedor 24,460; Empresa 23,668; MedidaDGCP 1,732; EntidadFinanciera 1,300; Institucion 894; Provincia 32), cortes y `excluye` |

Se sirve como archivo estático en `/data/grafo/` (cabecera `Cache-Control` de `/data/*`, §1) y `outputFileTracingExcludes` lo saca de toda función. Lo anuncian VoID, la portada de `/grafo` y `ontology` del MCP (`volcadoDelGrafo`).

### 7.9 Tablas Parquet y SQL

`scripts/build-grafo-tablas.mjs` (tras el volcado) escribe `public/tablas/`, servido en `/tablas/`: nueve Parquet con zstd (3,985,819 bytes en total con `meta.json`) que salen del volcado (`grafo.nt.gz`), de `public/data/historico/` (totales desde 2015) y de `procesos.json`. Tablas, columnas y tipos salen de `TABLAS` (§7.2); cada fila pasa por `esquemaFila`; cada texto por `sinCedula`, y no escribe nada si queda una cédula. `meta.json` (generado 2026-10-02) guarda por tabla descripción, fuente, corte, filas y columnas con su tipo, descripción y propiedad.

| Tabla | Filas | Columnas | Corte |
|---|---|---|---|
| `instituciones` | 894 | `id`, `nombre`, `siglas`, `sector`, `capitulo`, `contratos`, `monto_contratado`, `sin_asignar`, `url` | 2026-09-22 |
| `empresas` | 23,668 | `rnc`, `nombre`, `estado`, `inicio_operaciones`, `actividad`, `url` | 2026-09-19 |
| `proveedores` | 24,460 | `rpe`, `nombre`, `rnc`, `contratos`, `monto_contratado`, `primer_contrato`, `ultimo_contrato`, `url` | 2026-09-22 |
| `contrataciones` | 71,466 (solo pares mayores: 12 proveedores por institución, 8 clientes por empresa) | `institucion_id`, `proveedor_rpe`, `contratos`, `monto` | 2026-09-22 |
| `medidas` | 1,732 | `proveedor_rpe`, `tipo`, `fecha`, `titulo`, `descripcion` | 2026-09-30 |
| `financieras` | 1,300 | `slug`, `nombre`, `razon_social`, `supervisor_id`, `url` | 2026-09-29 |
| `provincias` | 32 | `slug`, `nombre` | — |
| `equivalencias` | 160 | `nodo`, `equivale_a` | 2026-09-30 |
| `procesos` | 77,790 (publicados del 2025-09-25 al 2026-09-25) | `codigo`, `titulo`, `unidad_compra`, `modalidad`, `estado`, `objeto`, `fecha`, `valor_estimado`, `url` | 2026-09-25 |

`lib/grafo-tablas.ts` importa `public/tablas/meta.json` (`TABLAS_GRAFO`, `TABLAS_GENERADAS`, `NOMBRES_TABLAS`, `esquemaCompacto()`), sin DuckDB.

SQL (`lib/grafo-sql.ts`, `lib/sql-hijo.cjs`, `app/api/sql/route.ts`):
- `@duckdb/node-api` 1.5.5-r.5 (versión exacta en `package.json`), en `serverExternalPackages`. `consultarSql` hace `fork` de `lib/sql-hijo.cjs` con `env: { NODE_ENV: "production" }`. El hijo abre DuckDB en memoria (`threads` 1, `memory_limit` 512MB, extensiones sin autoinstalar ni autocargar, sin extensiones de comunidad), crea cada tabla con `read_parquet` y fija `enable_external_access = false` y `lock_configuration = true`.
- El hijo lee la consulta con `json_serialize_sql`: una sola sentencia SELECT; funciones de tabla solo `range`, `generate_series`, `unnest`, `duckdb_tables`, `duckdb_columns`; vetadas `repeat`, `lpad`, `rpad`, `format`, `printf`, `bar`, `bitstring`, `list_resize`, `array_resize` y `range`/`generate_series` como listas; ninguna cadena literal de más de 500 caracteres.
- El padre: consulta de hasta 8,000 caracteres (`TOPE_SQL`); a lo sumo 2 consultas a la vez (`EN_CURSO`), espera hasta 10 s y si no, 503; mata al hijo si una consulta pasa de 10 s (`TOPE_MS`) o si su memoria residente (`/proc/<pid>/status`, mirada cada 100 ms) pasa de 900 MB, y lo cambia tras una consulta si queda por encima de 600 MB (`RECICLAR_KB`); hasta 200 filas (`TOPE_FILAS`), ninguna celda de más de 2,000 caracteres, ninguna respuesta de más de 60,000; cada celda de texto pasa por `sinCedula`.
- `/api/sql`: `GET ?q=` o `POST {"q"}`; responde `{columnas, filas, truncada, ms, generadas}`; 400 error de consulta, 503 ocupado, 502 fallo del motor (registra solo el mensaje, no la consulta); GET con `Cache-Control: public, s-maxage=86400, stale-while-revalidate=86400`; CORS `*`; `maxDuration` 30. Su función lleva `lib/sql-hijo.cjs`, `public/tablas/*.parquet` y `@duckdb/node-bindings-linux-x64` (excluye la variante musl).

### 7.10 Wikidata

`lib/wikidata.ts` lee `public/data/wikidata.json` (de `scripts/build-wikidata.py`, consultas a la réplica de QLever; la fuente en §5.7): generado 2026-09-30, QID de 32 provincias, 30 instituciones, 2 entidades financieras y 64 personas. `wikidataDe(n)` da el QID; `hrefWikidata(qid)` la página. Los constructores emiten `owl:sameAs wd:<QID>` (grafo `wikidata`) para provincias, instituciones y entidades financieras con QID, y para una persona solo si `pepVigente` o tiene `firma` en el registro de decretos: 45 de las 64. En el schema.org de la ficha sale como `sameAs`.

### 7.11 Privacidad: qué expone cada salida

| Salida | Personas naturales | Acceso |
|---|---|---|
| `datos/grafo/` (compilado) | sí: personas, cargos, decretos, declaraciones | no se sirve como archivo; se lee nodo a nodo en funciones |
| `/api/grafo`, fichas, `fetch` y `path` del MCP | sí, de a un nodo | por consulta |
| `nombres.json.br` | sí (nombre, cargo principal, firma) | solo en funciones (`/grafo`, `/mcp`); lo consultan `buscarNodos` (hasta 8 personas) y `signed_decrees` (una firma, o hasta 8 candidatos para elegir) |
| `grafo.nt.gz`, `grafo.trig.gz` | no | descarga entera |
| `public/tablas/*.parquet`, `/api/sql`, `query` | no (proveedores solo atados a una empresa por RNC) | descarga entera y SQL |

Comprobaciones:
- La clave de una persona es el slug de su nombre (`enlace.funcionario`, `nodoDeRuta`), no la cédula.
- `build-grafo-volcado.mjs` lanza si un triple del volcado toca `/funcionarios/`; `build-grafo-tablas.mjs` no escribe si queda una cédula.
- Gate completo, paso 5c: `.claude/hooks/cedulas.py` (JSON, TSV y `.gz` de `public/data`) y `.claude/hooks/cedulas-tablas.mjs` (cada texto de los Parquet de `public/tablas/`, leído con DuckDB, y cada archivo `.br`/`.json` de `datos/grafo/` descomprimido) buscan formas de cédula.
- Gate completo, paso 6b (`scripts/eval-mcp.mjs` contra `next start`): el caso «El grafo entero se descarga, sin personas naturales, y ontology lo anuncia» descarga `/data/grafo/grafo.nt.gz`, exige el número de triples de `meta.json` y que el texto no contenga `${SITIO}/funcionarios/`, `soc:DeclaracionJurada` ni `${SITIO}/normativa/decreto/`; el caso «SQL: las tablas no guardan personas naturales» exige las nueve tablas y cero proveedores sin RNC de nueve cifras.
- Gate completo, paso 6c: `scripts/validar-grafo.mjs --url <next start> --personas 300` valida con `rdf-validate-shacl` (dependencia de desarrollo, con `@zazuko/env-node` y `n3`) el volcado entero más una muestra de personas (primero las que tienen numeral PEP) y de los decretos que las nombran, pedidos uno a uno a `/api/grafo`, unidos con `/ontologia.ttl`, contra `/ontologia.shacl.ttl`. Falla si hay una violación, un término `soc:`/`do:` usado y no declarado, o un IRI de `ESPACIO_V1`; un `sh:class` cuyo destino es una persona o un decreto sin tipo se cuenta aparte, como fuera de la muestra.

## 8. Búsqueda

### 8.1 Archivos (`public/data/busqueda/`)

Todos versionados en git (corte del corpus: 2026-09-30).

| Archivo | Bytes | Lo escribe | Lo lee el servidor |
|---|---|---|---|
| `corpus.json` | 47,422,621 | `scripts/build-busqueda.py` | no (excluido de toda función por `outputFileTracingExcludes`); lo leen `build-indice-busqueda.mjs`, el paso 5a del gate y `scripts/eval-mcp.mjs` |
| `indice.bin` | 64,152,504 | `scripts/build-indice-busqueda.mjs` | sí |
| `vectores.bin` | 20,539,728 | `scripts/build-busqueda.py` | sí |
| `modelo.bin` | 9,614,484 | `scripts/build-modelo-semantico.py` | sí |
| `modelo.json` | 162 | ídem | sí |
| `tokenizer.json` | 2,741,288 | ídem | sí |

Orden de construcción: las instantáneas de origen (§6) → `python3 scripts/build-busqueda.py` (requiere `numpy` y `tokenizers`) → `node --no-warnings scripts/build-indice-busqueda.mjs`. El paso 5a de `verificar.sh` (en `--rapido` y en `--completo`) exige que `indice.bin` empiece por `SIB2`, que su etiqueta sea `generado|huella|nº de entradas` de `corpus.json` y que su campo `vectores` sea el sha256 de `vectores.bin`.

### 8.2 Corpus

`scripts/build-busqueda.py` no lee fuentes: junta entradas de las instantáneas, con lectores propios en `scripts/busqueda_{congreso,funcionarios,financieras,leyes,procesos,sentencias}.py` (`entradas(datos)`), repara texto UTF-8 leído como Windows-1252 (`reparar`) y quita cédulas de `ti`, `x` y `d` (`sin_cedula` de `scripts/privacidad.py`). Cabecera de `corpus.json`: `generado` 2026-09-30; `huella` `ad382ba3b866b275` (sha256 de las entradas, 16 hex); `instantaneas` (fecha por tipo, más `ley`); `dimensiones` 128; `piezas` 72,837; `vectorizados` 155,604; `origenes` (1,024 nombres de quien publica); `frases` (346 textos de `d` o `x` que se repiten 20 veces o más; la entrada lleva su índice y `resolverFrases` los devuelve a texto); `docs` (204,685 entradas).

Campos de una entrada (`COLUMNAS_TEXTO`, `COLUMNAS_NUMERO` en `lib/busqueda-esquema.ts`): `t` tipo, `ti` título, `x` texto auxiliar, `d` detalle, `o` índice de origen, `h` enlace, `f` fecha, `r` identificador del que se deriva la ficha (RPE o código de proceso), `c` RNC, `v` valor, `n` plazas, `m` instituciones, `p` nivel de rebaja (0, 1, 2), `e` externo (1), `k` contratos, `a` años (2), `s` sueldo P10, mediana, P90 (3).

Composición, contada en `corpus.json` (`t` y destino del campo `h`):

| `t` | Entradas | `h` ruta propia (`/…`) | `h` URL externa | Sin `h` | Vector | Instantánea |
|---|---|---|---|---|---|---|
| `proceso` | 77,790 | — | — | 77,790 (ruta derivada de `r`: `enlace.proceso`) | sí | 2026-09-25 |
| `proveedor` | 32,152 | — | — | 32,152 (ruta derivada de `r`: `enlace.proveedor`) | no | 2026-09-22 |
| `documento` | 18,726 | — | 18,726 (23 sitios institucionales) | — | sí | 2026-09-24 |
| `iniciativa` | 17,857 | 17,857 | — | — | sí | 2026-09-27 |
| `funcionario` | 15,408 | 15,408 | — | — | no | 2026-09-29 |
| `norma` | 15,001 | 5,079 (`/normativa/decreto/…` 2,715, `ley` 2,213, `resolucion` 148, `reglamento` 3) | 9,922 (`www.consultoria.gov.do`) | — | sí | 2026-09-23 (normativa), 2026-09-27 (leyes) |
| `sentencia` | 12,106 | — | 12,106 (`tc.gob.do` 11,393; `visorpdf.tse.do` 713) | — | sí | 2026-09-27 |
| `cargo` | 8,556 | 8,556 | — | — | sí | 2026-09-24 |
| `obra` | 3,609 | 3,609 | — | — | sí | 2026-09-23 |
| `financiera` | 1,300 | 1,300 | — | — | no | 2026-09-29 |
| `dato` | 1,065 | — | 1,065 (`datos.gob.do`) | — | sí | 2026-09-24 |
| `institucion` | 894 | 894 | — | — | sí | — (las fija el cruce) |
| `legislador` | 221 | 221 | — | — | no | 2026-09-27 |
| **Total** | **204,685** | **52,924** | **41,819** | **109,942** | **155,604** | |

Las entradas sin vector (legisladores, funcionarios, financieras y proveedores: 49,081) van al final del corpus; `vectorizados` marca dónde empiezan. Las 41,819 con URL externa llevan `e = 1`. Un documento que agrupa copias abre `/documentos?q=<título>&inst=<sitio>` (`hrefCopias`).

### 8.3 `indice.bin` (formato SIB2, `lib/busqueda-esquema.ts`)

Bytes 0–3 `SIB2`; bytes 4–7 un `u32` little-endian con el largo de la cabecera JSON; la cabecera (etiqueta, `vectores` sha256, `generado`, `instantaneas`, `dimensiones`, `piezas`, `vectorizados`, `entradas`, y `secciones` como `[nombre, tipo, largo]`); luego cada sección alineada a 8 bytes. Tipos `u8`, `u16`, `u32`, `f64`; «no hay» es el máximo del entero o NaN.

Cabecera actual: etiqueta `2026-09-30|ad382ba3b866b275|204685`, 204,685 entradas, 155,604 con vector.

| Parte | Secciones | Bytes |
|---|---|---|
| Índice por palabra | `terminos` (185,267 raíces ordenadas, unidas por `\n`), `inicio` (`u32`), `entrada` (`u32`, 3,619,553 apariciones), `campoFrecuencia` (`u8`: campo en dos bits altos, frecuencia en seis, tope 63), `largo` (`u16`, raíces por entrada y campo) | 21,684,864 |
| Corpus por columnas | por campo de texto `<campo>.texto` (UTF-8), `<campo>.bordes` (`u32`), `<campo>.cual` (el entero más chico que cabe); por campo numérico una tabla con su aridad | 42,465,990 |

`serializarIndice` escribe; `leerIndice` lee con vistas sobre el búfer (copia alineada si el búfer no lo está) y lanza si falta una sección o los largos no casan. La clase `Columnas` descodifica un texto la primera vez que se pide y lo guarda; `donde(campo, valor)` compara bytes. `build-indice-busqueda.mjs` exige `r` recortado, construye (`construirIndice`), escribe y relee campo por campo y entrada por entrada contra el corpus.

Indexación (`raicesParaIndice`): palabras en minúsculas sin tildes (la ñ pasa a n), cortadas en todo lo que no es letra o cifra, con un número con guiones como una palabra; sin vacías; raíz con `lematizar` (`@orama/stemmers/spanish` sobre el texto sin tildes; `lib/raiz.ts`); vacías: `@orama/stopwords/spanish` menos la lista `CONTENIDO` de `lib/raiz.ts`. Un número con guiones entra entero, por partes y, si el año tiene cuatro cifras de 19xx/20xx, en forma corta («47-2020» → «47-20»). Campos indexados (`CAMPOS`): `ti`, `x` (con `c` y `r`) y el nombre del origen, con `REFUERZO` 3, 1 y 0.5.

### 8.4 Modelo y vectores

`modelo.json`: `minishlab/potion-multilingual-128M` (Model2Vec, MIT), 72,837 piezas, 128 dimensiones, varianza 0.7919, especiales `[0, 1]`. `modelo.bin` y `vectores.bin` tienen la misma forma: `n × 128` `int8` seguidos de una escala `float32` por fila (`modelo.bin`: 72,837 × 132 bytes; `vectores.bin`: 155,604 × 132 bytes). Un vector de entrada es el promedio de las filas de las piezas de su título en minúsculas, normalizado y cuantizado por fila (`build-busqueda.py`, con `tokenizers` de Rust). La consulta se tokeniza con `@huggingface/tokenizers` 0.2.0 (`embeber` en `lib/busqueda.ts`), sin especiales, se promedia y se normaliza. Al cargar, `lib/busqueda.ts` exige que `piezas` y `dimensiones` de `modelo.json` sean las del corpus, que `vectores.bin` mida `vectorizados × (dim + 4)` y que su sha256 sea el de la cabecera; si no, lanza.

### 8.5 Consulta (`lib/busqueda.ts`)

`motor()` carga una vez por instancia `indice.bin`, `tokenizer.json`, `modelo.json`, `modelo.bin` y `vectores.bin` (un fallo no queda memoizado).

1. **`analizarConsulta`**: `requeridas` (todas tienen que estar, en cualquier campo) y `opcionales` (solo ordenan): las de un sueldo (`DE_SUELDO`), las de una compra (`DE_COMPRA`) y, si la consulta es pregunta (`¿?` o empieza por una de `INTERROGATIVAS`), las de `DE_PREGUNTA`. Si no queda ninguna requerida y no es pregunta, las opcionales pasan a requeridas. `preferido`: `cargo` o `proceso` cuando hay palabras de sueldo o de compra junto a otras requeridas; si no, `legislador` o `funcionario` cuando una requerida está en `DE_LEGISLADOR` o `DE_FUNCIONARIO`. La última palabra admite prefijo si el lematizador no la tocó, no es número y tiene 3 letras o más.
2. **`porPalabra`**: cruza las entradas de cada requerida desde el conjunto más chico; BM25+ (`K1` 1.2, `B` 0.75, `D` 0.5) con idf por campo y, por término, el campo de mayor puntaje (`puntuar`); las opcionales suman. Si lo exacto trae menos de 3 (`MINIMO_SIN_ERRATA`) y la consulta tiene una o dos requeridas de seis letras o más, prueba raíces a una edición (peso 0.5 para la errata) y se queda con eso si trae más. Tope `TOPE_PALABRA = 20_000` ids a la fusión; `todos` guarda el conjunto completo.
3. **`porTema`**: coseno contra las 155,604 filas, umbral `UMBRAL_TEMA = 0.55`, `VECINOS = 150`. No se embebe si no hay palabra con contenido, si la consulta es una cita (`ES_CITA`) o si son solo números.
4. **`fundir`**: RRF con `K_RRF = 60`: palabra `1/(60+rango)`, tema `0.6/(60+rango)` (`PESO_TEMA`). +1 si lo tecleado es el título, las siglas de una institución, la cita de una norma o el número de una sentencia, o si es legislador con `preferido` legislador; ×1.6 (`PESO_PREFERIDO`) si es del tipo preferido; ×0.8 si es un documento titulado como un archivo (`TITULO_ARCHIVO`); ÷(1 + 0.15·`p`). Vía de cada resultado: `palabra`, `tema` o `ambas`. Copias de un documento (`clavesDeCopia`): mismo sitio y nombre de archivo sin extensión ni sufijo `-N`, o mismo título del mismo sitio con la misma fecha; se juntan en una fila con sus formatos y su cuenta.
5. **`buscarEnTodo(q, {tipo, pagina, porPagina})`**: devuelve `Hallazgos` (resultados de la página, `grupos` con hasta 4 por tipo, `total`, `porTipo`, `truncado`, `soloTema`, `conErrata`, `soloOrdenan`, `pregunta`, `generado`, `instantaneas`). Con `tipo`, palabra y tema se calculan dentro del tipo. Si hay más coincidencias que el tope, `porTipo` se cuenta en una pasada sobre todas, con copias juntadas. `POR_PAGINA = 20`. Una consulta con forma de cédula (`llevaCedula`) devuelve vacío. Si el índice no carga, devuelve `null`.
6. **`resultadoPorHref(href)`**: el resultado cuyo enlace es exactamente ese (por `h`, o por `r` para proveedores y procesos, o la biblioteca de copias); lo usa `fetch` del MCP. Lanza si el índice no carga.

`aResultado` pasa título y detalle por `sinCedula`. `TIPOS_RESULTADO` (13) fija el orden de los tipos; `EN_MAYUSCULAS` (`norma`, `obra`, `cargo`, `proceso`) marca los títulos que se muestran con `desdeMayusculas`.

### 8.6 Atajo por forma (`lib/buscar.ts`, `middleware.ts`)

`rutaDirecta(q)`: nueve cifras → `enlace.empresa`; once cifras → `/proveedores?q=<cifras>`; cita de ley, decreto, reglamento o resolución (también «ley 47 20») → `enlace.norma`; código de proceso → `enlace.proceso`; siglas exactas de una sola institución que no son una palabra de su propio nombre → `enlace.institucion`. Lee el cruce de `public/data/instituciones.json` directamente. `middleware.ts` (matcher `/buscar` y `/empresas`) responde 307 con ese destino; en `/empresas` solo un RNC de nueve cifras.

### 8.7 Pantallas (`buscarPantallas`)

Indexa una vez por instancia los 55 destinos de `INDICE` (`lib/indice.ts`) con su nombre y nota y, para los 41 que tienen entrada en `PANTALLAS` (`lib/pantallas.ts`), lo que ofrecen y sus preguntas: 220 frases embebidas con el mismo modelo. Puntaje: el mayor coseno con una frase + 0.5 × la parte de las palabras de la consulta presentes en el texto de la pantalla; umbral `UMBRAL_PANTALLA = 0.5`; devuelve hasta `n` (3) con la pregunta que más se parece. No responde a una cita ni a una consulta sin tres letras seguidas. La usan `/buscar` (sin tipo, página 1), `/api/buscar` (sin tipo) y `retrieve` del MCP.

Prueba: `node --no-warnings scripts/probar-pantallas.mjs` lleva cada una de las 65 preguntas de `scripts/bateria-pantallas.json` y exige su pantalla entre las tres primeras; no está en el gate. Medido el 2026-10-02 en este árbol: 64/65; falla «reservas del banco central» (esperaba `/indicadores`; dio `/dinero/banco-central`, `/dinero`, `/banca`).

### 8.8 Quién la usa

| Consumidor | Llamada |
|---|---|
| `app/buscar/page.tsx` | `buscarEnTodo(q, {tipo, pagina})`; `buscarPantallas(q, 3)` sin tipo y en la página 1 |
| `app/api/buscar/route.ts` (paleta ⌘K; `?q=` 2–120 caracteres, `?n=` 1–20, `?tipo=`) | `buscarEnTodo` con `porPagina` n×4 sin tipo, y a lo sumo la mitad de las filas de un mismo tipo; `buscarPantallas`; 502 si el índice no carga; vacío si `q` lleva cédula |
| `app/proveedores/page.tsx` | `buscarEnTodo(q, { tipo: "proveedor", porPagina: 1000 })` |
| `lib/mcp.ts` | `search`, `fetch`, `retrieve` (§9) |

`outputFileTracingIncludes` lleva `public/data/busqueda/**` a `/buscar`, `/api/buscar`, `/proveedores` y `/mcp` (97,048,166 bytes sin `corpus.json`, que se excluye en toda función); `outputFileTracingExcludes` lo quita de `/proveedores/*` y `/api/proveedores`.

### 8.9 Tiempos (medidas fechadas)

- 2026-10-01, Node, disco en caché: carga del motor y primera consulta ~0.32 s con ≈205 mil entradas, de los que armar el tokenizador ~0.14 s; leer `indice.bin` ~70 ms y su sha256 de vectores ~13 ms; ~325 MB de memoria residente (~71 MB de montón); 30–190 ms por consulta en caliente.
- 2026-10-01, Vercel (preview recién desplegado, ida y vuelta de ~0.22 s incluida): primera llamada a `search` del MCP 1.71 s.

## 9. Servidor MCP

### 9.1 Ruta y transporte (`app/mcp/route.ts`)

- `createMcpHandler(() => servidorMcp(), { onerror })` del SDK oficial `@modelcontextprotocol/server` 2.2.0 (con `@modelcontextprotocol/core` 2.2.0; `package.json` pide `^2.2.0`). HTTP «streamable» sin sesión: cada POST crea un servidor (`servidorMcp()`) y lo suelta. El SDK define `FIRST_MODERN_PROTOCOL_VERSION = "2026-07-28"`; los pedidos sin la marca de esa revisión (`initialize` y clientes de 2025) van a un servidor sin estado por pedido, y un GET o DELETE de esos clientes recibe 405 («Method not allowed.»). `SUPPORTED_PROTOCOL_VERSIONS` del núcleo: `2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05`, `2024-10-07`.
- `GET` con `Accept` que incluye `text/html` → 303 a `/conectar`. `POST`, `GET` y `DELETE` pasan al manejador; `OPTIONS` → 204.
- Cabeceras de toda respuesta: CORS `*` (métodos GET, POST, DELETE, OPTIONS; expone `Mcp-Session-Id` y `Mcp-Protocol-Version`; `Max-Age` 86400) y `Cache-Control: no-store`. `dynamic = "force-dynamic"`, `maxDuration = 60`. `onerror` registra solo el mensaje.
- `origenDe(req)`: el origen del pedido si es `SITIO`, `http://localhost`/`127.0.0.1` o un `https://socratico*.vercel.app`; si no, `SITIO`. `conOrigen` lo guarda en un `AsyncLocalStorage` para `query` (§9.4).
- Servidor (`servidorMcp`, `lib/mcp.ts`): `name` `socratico`, `title` «Socrático.do», `version` `VERSION_MCP = "2.0.0"`, `websiteUrl`, icono `/icon.svg`, `instructions` (`INSTRUCCIONES`: qué hay, cómo usar cada herramienta y reglas de cita, PEP, homónimos y relaciones), `capabilities.tools.listChanged: false`, `cacheHints` de una hora, públicos, para `tools/list` y `server/discover`.
- La dirección (`DIRECCION_MCP = ${SITIO}/mcp`) y la tabla de herramientas con título y línea en llano (`HERRAMIENTAS_MCP`) viven en `lib/mcp-herramientas.ts`, sin dependencias; `lib/mcp.ts` toma de ahí el título de cada herramienta (`tituloHerramienta`) y `/conectar` la lista.

### 9.2 Herramientas

Nueve, registradas en este orden. Todas con `annotations` `{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }`, `outputSchema` en zod y la respuesta como `structuredContent` y como texto JSON. Todas menos `ontology` usan `z.strictObject` (un argumento desconocido es un error); `ontology` acepta `z.object({})`.

| Herramienta | Argumentos | Lee de |
|---|---|---|
| `search` | `query` (1–1000), `type` (uno de los 13 de `TIPOS_RESULTADO`), `page` (1–100) | `buscarEnTodo` (20 por página; 30 con `type`); en la primera página sin tipo, además: decreto por número (`decretoCompilado`), empresa por RNC (`empresaPorRnc`), provincias por nombre (hasta 4) y empresas del padrón por nombre (`buscarEmpresas`, hasta 5); tope 30. Devuelve `results` (`id`, `title`, `url`, `text`), `tipo`, `total`, `pagina`, `paginas`. |
| `fetch` | `id` (1–500), `group` (uno de los 6 `GRUPOS`), `page` (1–1000) | Un nodo: `describir`, `relacionesDesdeTriples` (hasta 15 por grupo, `POR_GRUPO_FETCH`), datos en llano, medidas de la DGCP, compras (institución: `historiaDeInstitucion`, `getResumenHistorico`, `comprasPublicadas`; empresa inscrita: `todosLosProveedores` e `historiaDeProveedor`) y procedencia del `inventario`. Otro registro: `resultadoPorHref`, con el detalle de un proceso (`todosLosProcesos`) o lo contratado a un proveedor. Con `group`/`page`, el grupo entero de 50 en 50 (`POR_PAGINA_RELACIONES`). Devuelve `id`, `title`, `text`, `url`, `metadata`. |
| `retrieve` | `query` (1–300), `limit` (1–20; 10 por omisión) | `buscarEnTodo` y `buscarPantallas` con la pregunta; por cada nombre propio (`nombresPropios`), `buscarNodos` y `buscarEnTodo`; siglas en mayúsculas de una institución; hasta 3 entidades con 12 hechos, 5 relaciones por grupo y sus compras (`contextoDeNodo`); según `INTENCION` (expresiones sobre la forma plana: compras, mayor, reciente, abierta, contratado, dirige, decretos, vínculo) corre `compras()`, `historial()` o `cadena()`; `todosLosProveedores` solo si nombra a alguien que el grafo no ata, `todosLosProcesos` solo si dice un año. Topes `TOPE_RECUPERAR`. |
| `procurement` | `text` (alternativas con « \| »), `institution`, `year`, `from`, `to`, `status[]` (`abierto`, `cerrado`, `evaluacion`, `adjudicado`, `desierto`, `cancelado`, `suspendido`), `method[]` (`lpn`, `lpi`, `lpa`, `restringida`, `comparacion`, `subasta`, `sorteo`, `menor`, `umbral`, `excepcion`), `category` (`bienes`, `obras`, `servicios`), `minAmount`, `maxAmount`, `sort` (`monto`, `monto_asc`, `fecha`, `fecha_asc`), `page` | `todosLosProcesos` (`public/data/procesos.json`, `lib/tablas-compras.ts`): total, suma, desglose por estado, 10 instituciones que más suman, 25 por página. |
| `contracting_history` | `supplier`, `institution`, `page` (1–4) | `lib/historico.ts` (`public/data/historico/`) y `todosLosProveedores` (`historico/proveedores/` y `public/data/rnc/`): un proveedor (id, RPE, RNC o nombre), una institución, el par, o el país con los 100 mayores proveedores de 25 en 25. Un nombre o RNC con varios registros devuelve la lista; once cifras se rechazan. |
| `query` | `sql` (1–8000) | `/api/sql` del despliegue que atiende (§9.4); la descripción incluye `esquemaCompacto()` y notas sobre las tablas. Devuelve `columnas`, `filas`, `truncada`, `ms`, `tablas` nombradas con fuente y corte, `descarga`, `aviso`. |
| `path` | `from`, `to` (ids) | `camino()` (§7.6) y `procedencia`; devuelve `encontrado`, `saltos`, `pasos`, `exploradas`, `tope`, `explicacion`, `explorador`, `cortes`. |
| `signed_decrees` | `person`, `year` (1844–2100), `subject` (slug de `MATERIAS`), `text`, `page` | `personaCompilada`/`buscarPersonas` y `decretosFirmados` del compilado (`datos/grafo/firmados/`), 25 por página. |
| `ontology` | ninguno | `CLASES`, `PROPIEDADES`, `esquemas()` (`lib/ontologia.ts`), `volcadoDelGrafo()` y `TABLAS_GRAFO`: clases, propiedades, esquemas y `descargas` (Turtle, JSON-LD, N-Triples, SHACL, Fabric, página, volcado y tablas). |

`resolver(id)` acepta la ruta de una ficha, la URL entera del sitio, el IRI con `#id`, un RNC de nueve cifras o «Decreto NNN-AA». `destinoDe` da `id` solo a lo que `fetch` abre (un nodo o una ficha del índice); lo externo va solo con `url`, y los decretos firmados con la pista de `signed_decrees`.

### 9.3 Reglas de las respuestas

- `resultado()` pasa todo el objeto de respuesta por `limpiar` (`sinCedula` en cada cadena). `sinBuscarPorCedula` (con `llevaCedula`) rechaza con un aviso la consulta de `search`, `retrieve`, `procurement`, `contracting_history` y `signed_decrees` que lleve una cédula; `query` rechaza un SQL con cédula.
- Cada respuesta lleva el aviso `AVISO` («herramienta independiente y no oficial…») y su fuente con fecha de corte: `search` en cada resultado; `fetch` la del nodo y las de todas las instantáneas del grafo; `query` la de cada tabla que nombra; `path` las del grafo; `procurement` la tabla de procesos y su cobertura; `contracting_history` el corte del registro.
- Errores (`correr`): un `Aviso` sale con su mensaje (sin cédula) y el SDK lo devuelve con `isError`; cualquier otro error se registra en el servidor y sale con un mensaje genérico, sin rutas ni pilas. El registro no escribe la consulta.
- `lib/mcp.ts` no importa el rol de audiencias, el Registro Inmobiliario, las cuentas y espacios ni `/democracia`; su única petición de red es la de `query` a `/api/sql`. Las herramientas leen instantáneas y el grafo compilado.

### 9.4 `query` y `/api/sql`

`consultarTablas` llama a `${origen}/api/sql`: por GET si la consulta codificada mide hasta 6,000 caracteres (la CDN guarda la respuesta), si no por POST; plazo 25 s. 503 → aviso de motor ocupado; 400 → aviso con el error de SQL. El motor, sus límites y las tablas: §7.9. La función `/mcp` no lleva DuckDB.

### 9.5 Evaluación (`scripts/eval-mcp.mjs`)

53 casos (`CASOS`), cada uno una pregunta hecha con la herramienta que le toca y un oráculo calculado aparte de `public/data` (`procesos.json`, `historico/`, `busqueda/corpus.json`, `grafo/meta.json`), no con el código del servidor. Habla JSON-RPC sobre HTTP a mano, con `mcp-protocol-version: 2025-06-18`, sin dependencias. Además, `reglasGenerales()` revisa cada respuesta: ninguna cadena con forma de cédula; el aviso en toda respuesta que no es de `search`; en `search`, una fecha de instantánea en cada resultado; que ninguna respuesta nombre `neighbors`, `sparql` ni un argumento en castellano (`con institucion «…»`). Casos que tocan la seguridad de `query`: escrituras, archivos, red, dos sentencias, `SET`, `enable_logging`, `duckdb_logs`, `query(...)`, `pragma_version`, `repeat` de 2,000 millones y `range` de mil millones, rechazados, y el motor responde después. Sale con 1 si un caso falla. Corre en el paso 6b de `verificar.sh --completo` contra `next start` sobre el build recién hecho (timeout 300 s); contra otro despliegue, `node scripts/eval-mcp.mjs --url https://…/mcp`.

### 9.6 `/conectar` (`app/conectar/page.tsx`)

Página estática con la dirección `DIRECCION_MCP` y botón de copiar (`CopiarTexto`), los pasos en Claude, en ChatGPT y en Claude Code y otros clientes (`claude mcp add --transport http socratico <dirección>`), y la lista de `HERRAMIENTAS_MCP` con título y línea en llano. Es el destino del 303 de `/mcp` para un navegador.

### 9.7 Tamaño de la función y tiempos (medidas fechadas)

- Trazado de archivos, medido sobre `route.js.nft.json` el 2026-10-02: `/mcp` ~163 MB (índice de búsqueda ~97 MB, grafo compilado con sus índices ~25 MB, padrón 16 MB, `procesos.json` 11 MB, `historico/` y `rnc/`); `/api/sql` ~77 MB. Límite de Vercel: 250 MB por función.
- Primera llamada en `next start` recién arrancado, disco en caché:

| Herramienta | Tiempo | Fecha |
|---|---|---|
| `ontology` | 0.07 s | 2026-09-30 |
| `query` | 0.23 s | 2026-09-30 |
| `procurement` | 0.28 s | 2026-09-30 |
| `contracting_history` | 0.39 s | 2026-09-30 |
| `fetch` con `group` | 0.50 s | 2026-09-30 |
| `search` | 0.34–0.42 s | 2026-10-01 |
| `retrieve` | 0.35–0.82 s («la compra más grande de 2026» 0.63–0.75; «¿quién dirige el MINERD?» 0.76–0.82); con un nombre de proveedor que el grafo no ata exacto, 1.03–1.09 s; «Ministerio de Educación Superior», 1.20–1.29 s | 2026-10-01 |
| `fetch` de una institución | 0.06–0.07 s | 2026-10-02 |
| `path` | 0.09–0.11 s | 2026-10-02 |
| `signed_decrees` (la firma con más decretos) | 0.13–0.14 s | 2026-10-02 |

- En Vercel, primera llamada con ida y vuelta: `fetch` de una institución 0.93 s y `path` 0.30 s (2026-10-02, preview); `search` 1.71 s, `retrieve` del MINERD tras esa búsqueda 1.33 s y `retrieve` con un nombre de proveedor 1.39 s (2026-10-01, preview).

## 10. Base de datos: democracia y espacios

### 10.1 Proyecto, Auth y exposición en el API

| Pieza | Estado en el repositorio |
|---|---|
| Proyecto | Supabase `Transac`, ref `amuyclnyjyhigeyhuufs` (`project_id` en `supabase/config.toml`) |
| Esquemas propios | `democracia` (piloto de voto) y `espacios` (cuenta, proyectos, lo que se sigue, conversación) |
| Pool de Auth | compartido con otra aplicación del mismo proyecto; una sola cuenta de Socrático sirve para votar y para los espacios |
| `supabase/config.toml` | solo `project_id`, `[functions.vincular-cuenta-unica] verify_jwt = false` y `[functions.metricas-uso] verify_jwt = false`. No tiene sección `[auth]`: Site URL, redirecciones, plantillas, proveedores y SMTP se fijan en el panel o con `scripts/aplicar-auth-supabase.sh` |
| Data API | los esquemas se exponen con el parámetro `pgrst.db_schemas` del rol `authenticator`, que no está en ninguna migración. Valor fijado el 2026-09-28: `public, storage, graphql_public, democracia, espacios`. Con un esquema fuera de la lista PostgREST responde `PGRST106` y la app lo pinta como `cerrado` (§10.8) |
| Cliente | `@supabase/supabase-js` `^2.112.4` en `package.json` |

**Sesión.** Un solo cliente en el navegador (`lib/supabase.ts`) guarda la sesión en `localStorage` bajo la clave `gobiername-democracia-auth` (`storageKey`, con `persistSession` y `autoRefreshToken`). `components/espacios/presencia.ts` lee esa misma clave (`CLAVE_SESION`) para saber si hay sesión sin cargar supabase-js.

**Entrada por correo.** `signInWithOtp` con `shouldCreateUser: true` (`pedirCodigo` en `lib/sesion.ts` para `/cuenta`; llamada propia en `app/democracia/registro/registro.tsx`, con `emailRedirectTo` a `/democracia/registro` y su `?volver=` si lo trae). El código de seis dígitos se verifica con `verifyOtp({ email, token, type: "email" })`. `leerEntrada` (`lib/sesion.ts`) reconoce cinco formas de lo que el visitante pega o trae la URL:

| Forma | Qué trae | Qué hace `abrirSesion` |
|---|---|---|
| `codigo` | seis dígitos | `verifyOtp` con el correo |
| `enlace` | `token` o `token_hash`, con su `type` | `verifyOtp({ token_hash, type })`, probando los seis tipos (`email`, `magiclink`, `signup`, `recovery`, `invite`, `email_change`) empezando por el declarado |
| `sesion` | `#access_token=…&refresh_token=…` | `setSession` |
| `canje` | `?code=…` (PKCE) | `exchangeCodeForSession` |
| `fallo` | `#error_code=…` | mensaje según el código (`otp_expired`, `access_denied`) |

Medido el 2026-09-04 contra el proyecto: con una `redirect_to` fuera de la lista de redirecciones, `GET /auth/v1/verify` responde `303` al Site URL (`http://localhost:3000`) y el resultado viaja en el fragmento; `POST /auth/v1/otp` con esa `redirect_to` pasa la validación de redirección. El remitente es el SMTP por defecto de Supabase (`noreply@mail.app.supabase.io`, logs de Auth de esa misma medida). `mailer_autoconfirm` es `false` desde el 2026-09-28.

**Plantillas de correo** (`supabase/templates/`, HTML con estilos en línea, solo el código `{{ .Token }}`, sin enlace):

| Archivo | Plantilla de GoTrue | Asunto |
|---|---|---|
| `magic-link.html` | Magic Link (quien ya tiene cuenta) | «Tu código para entrar a Socrático» |
| `confirm-signup.html` | Confirm signup (correo nuevo) | «Tu código para crear tu cuenta en Socrático» |

`scripts/aplicar-auth-supabase.sh` las sube junto con el Site URL y la lista de redirecciones: `PATCH https://api.supabase.com/v1/projects/{ref}/config/auth` con `site_url` (variable `SITIO`, por omisión `https://socratico.vercel.app`), `uri_allow_list` (`{SITIO}/**` y `http://localhost:3000/**`), los dos asuntos y los dos cuerpos; lee `SUPABASE_ACCESS_TOKEN` (token personal de la Management API) y `SUPABASE_PROJECT_REF` (por omisión `amuyclnyjyhigeyhuufs`) del entorno del proceso e imprime lo que la API devuelve, incluido si cada plantilla lleva `{{ .Token }}`.

**Otras vías de entrada** (`lib/sesion.ts`, usadas por `components/espacios/entrar.tsx`):

- Google: `googleDisponible` lee `GET /auth/v1/settings` con la clave publicable; el botón aparece solo si `external.google` es `true`. `entrarConGoogle` usa `signInWithOAuth`; la marca `socratico-entrada-google` en `sessionStorage` identifica la vuelta.
- Contraseña: no hay alta con contraseña. `ponerContrasena` (`updateUser`, `LARGO_MINIMO = 8`) solo funciona con una sesión abierta; `entrarConContrasena` usa `signInWithPassword`.

### 10.2 Variables de entorno y secretos

Variables que lee la app (todas publicables):

| Nombre | Dónde se lee | Sin la variable |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase-config.ts` → `SUPABASE_URL` | fallback literal: la URL del proyecto `amuyclnyjyhigeyhuufs` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/supabase-config.ts` → `SUPABASE_ANON_KEY` | fallback literal: una clave publicable `sb_publishable_…` |
| `NEXT_PUBLIC_CUENTA_UNICA_CLIENT_ID` | `app/democracia/cuenta-unica/cliente.ts` → `CUENTA_UNICA_CLIENT_ID` | `""`: la vía de Cuenta Única queda apagada (§10.7) |

`SUPABASE_URL` y `SUPABASE_ANON_KEY` los importan `lib/supabase.ts`, `lib/democracia.ts`, `lib/espacios.ts` y `lib/sesion.ts`. No hay otra lectura de `process.env` en `app/`, `lib/` ni `components/` (la única otra del repositorio es `UV_THREADPOOL_SIZE` en `scripts/build-grafo.mjs`). El repositorio no tiene archivos `.env*` ni fija el valor de `NEXT_PUBLIC_CUENTA_UNICA_CLIENT_ID`.

Variables fuera de la app:

| Nombre | Dónde | Qué es |
|---|---|---|
| `CUENTA_UNICA_CLIENT_ID` | Edge Function `vincular-cuenta-unica` (`Deno.env`) | secreto de función, fijado en Supabase |
| `VERCEL_TOKEN` | Edge Function `metricas-uso` (`Deno.env`) | secreto de función: token de la API de Vercel que lee Web Analytics del proyecto `socratico` (§10.12) |
| `METRICAS_CORREOS` | Edge Function `metricas-uso` (`Deno.env`) | secreto de función: los correos, separados por comas, que ven el uso de la plataforma (§10.12) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions | las inyecta Supabase en cada función |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SITIO` | `scripts/aplicar-auth-supabase.sh` | entorno del proceso |

**Secreto guardado en Postgres.** `democracia.secretos` (`clave` PK, `valor`) tiene una fila, `cedula_pepper`, sembrada por `20260901043106` con `encode(extensions.gen_random_bytes(32), 'hex')` y `on conflict do nothing`. La tabla no tiene GRANT para `anon` ni `authenticated` y tiene RLS encendida sin políticas (`20260928120100`). La leen solo `democracia.hash_cedula` y `democracia.hash_sujeto`, `SECURITY DEFINER` cuyo dueño es el mismo rol dueño de la tabla (`postgres`, comprobado el 2026-09-28); RLS no se aplica al dueño de la tabla mientras no haya `force row level security`.

### 10.3 Migraciones

`supabase/migrations/`, en orden de aplicación:

| Archivo | Esquema | Qué crea o cambia | En `Transac` |
|---|---|---|---|
| `20260901043106_democracia_schema_base.sql` | `democracia` | esquema; `pgcrypto` en `extensions`; `secretos` y el pepper; `votantes`, `iniciativas`, `votos`; índice `votos_iniciativa_idx` | en vivo el 2026-09-26 |
| `20260901043155_democracia_rls_y_funciones.sql` | `democracia` | RLS y políticas; vista `agregados_publicos`; GRANT; `hash_cedula`, `cedula_valida`, `registrar_votante`, `emitir_voto`, `quitar_voto`, `eliminar_votante` | en vivo el 2026-09-26 |
| `20260902120000_democracia_cuenta_unica.sql` | `democracia` | USAGE del esquema para `service_role`; revoca `hash_cedula` a PUBLIC; `votantes.origen` y `votantes.verificado`; `hash_sujeto`; `vincular_identidad` (solo `service_role`); columna `verificados` en `agregados_publicos` | aplicada el 2026-09-26 |
| `20260928120000_espacios.sql` | `espacios` | esquema; siete tablas; `tipo_valido`, `href_valido`; funciones de permiso, disparadores y topes; RLS; GRANT; `mis_invitaciones`, `aceptar_invitacion`, `miembros_de`, `publicado` | aplicada el 2026-09-28 |
| `20260928120100_democracia_secretos_rls.sql` | `democracia` | RLS encendida en `secretos` | aplicada el 2026-09-28 |
| `20260928140000_conversacion.sql` | `espacios` | `perfiles.normas`; ocho tablas de la conversación; contadores; funciones de lectura, escritura y moderación | aplicada el 2026-09-28 |
| `20260928160000_caso.sql` | `espacios` | `href_valido` con puerto de hasta cuatro cifras; `enlaces.tipo`; `entradas.x`, `y`, `fecha`; `proyectos.narrativa` y `narrativa_version`; `guardar_narrativa`; permisos por columna; `publicado` con el caso | aplicada el 2026-09-28 |
| `20260930120000_espacios_personas.sql` | `espacios` | `tipo_valido` y el `check` de `seguimientos.tipo` suman `funcionario`, `entidad-financiera` y `empresa` | aplicada el 2026-09-30 (commit `2e68422`) |

Todas son re-ejecutables (`if not exists`, `create or replace`, `drop … if exists`, bloques `do` que comprueban `pg_constraint`). Cada `create or replace` deja la función en la versión del archivo que se corre: re-ejecutar `20260928120000_espacios.sql` repone su `publicado`, su `href_valido`, su `tipo_valido`, el disparador `entradas_actualizado` sin condición y sus permisos de tabla (su `revoke all on all tables in schema espacios` revoca también los permisos por columna), y `20260928160000_caso.sql` y `20260930120000_espacios_personas.sql`, corridas después y en ese orden, los vuelven a fijar. `20260928140000_conversacion.sql` lee `democracia.votantes` (`mi_cedula`, `suspender`), así que exige el esquema `democracia`.

### 10.4 Esquema `democracia`

**Tablas.**

| Tabla | Columnas | Claves y restricciones |
|---|---|---|
| `secretos` | `clave`, `valor` | PK `clave` |
| `votantes` | `id` → `auth.users` (`on delete cascade`), `cedula_hash`, `creado`, `origen` (`declarada` o `cuenta_unica`, por omisión `declarada`), `verificado` | PK `id`; `cedula_hash` único |
| `iniciativas` | `camara` (`diputados` o `senado`), `ref`, `numero`, `titulo`, `grupo`, `creado` | PK (`camara`, `ref`) |
| `votos` | `votante_id` → `votantes` (cascade), `camara`, `ref`, `valor` (−1 o 1), `creado`, `actualizado` | PK (`votante_id`, `camara`, `ref`); FK (`camara`, `ref`) → `iniciativas` (cascade) |

El `ref` de una iniciativa es el id del SIL en Diputados y `cuatrienio:id` en el Senado (`refIniciativa` en `lib/democracia.ts`; las fichas en §5.5). `iniciativas` es un espejo que siembra `emitir_voto` con el número, el título y el grupo que le pasa la ficha; un valor nulo no pisa uno guardado.

**Vista** `agregados_publicos` (`security_invoker = false`: corre con los permisos de su dueño): por (`camara`, `ref`) devuelve `a_favor`, `en_contra`, `total` y `verificados` (votos cuyo votante tiene `origen = 'cuenta_unica'`). Solo conteos.

**Huella.** `hash_cedula(p)` es el HMAC-SHA256 en hexadecimal de los dígitos de `p` con el pepper. `hash_sujeto(sub)` es el HMAC-SHA256 de `'cuenta_unica:' || sub` con el mismo pepper; el prefijo separa su espacio de valores del de las cédulas. `votantes.cedula_hash` guarda una de las dos.

**Funciones.**

| Función | Clase | La ejecuta | Qué hace |
|---|---|---|---|
| `hash_cedula(text)` | definer, `search_path = democracia, extensions` | nadie: revocada a PUBLIC, `anon` y `authenticated` | HMAC de la cédula |
| `hash_sujeto(text)` | definer | nadie: revocada igual | HMAC del `sub` |
| `cedula_valida(text)` | invoker, `immutable`, sin `search_path` | `anon`, `authenticated` | once dígitos y dígito verificador Luhn (pesos 1 y 2 alternos sobre los diez primeros, restando 9 a los productos mayores de 9) |
| `registrar_votante(text)` | definer, `search_path = democracia` | `authenticated` | exige sesión y `cedula_valida`; inserta (`auth.uid()`, huella). Devuelve `registrado` o `ya_registrado`; errores `sesion_requerida`, `cedula_invalida`, `cedula_en_uso` |
| `emitir_voto(camara, ref, valor, numero, titulo, grupo)` | definer | `authenticated` | exige fila en `votantes`; upsert de la iniciativa y del voto (`actualizado = now()`); errores `registro_requerido`, `parametros` |
| `quitar_voto(camara, ref)` | definer | `authenticated` | borra el voto propio |
| `eliminar_votante()` | definer | `authenticated` | borra la fila propia de `votantes`; los votos caen en cascada |
| `vincular_identidad(uid, sub, cedula)` | definer | solo `service_role` | §10.7 |

`registrar_votante`, `emitir_voto`, `quitar_voto` y `eliminar_votante` no se revocan a PUBLIC (que Postgres concede por omisión); con `auth.uid()` nulo devuelven `sesion_requerida` o `registro_requerido`. Ningún archivo de `app/`, `components/` ni `lib/` llama a `eliminar_votante` ni borra de `votantes`; el texto de `/democracia/seguridad` describe «un botón» que elimina el registro.

**RLS y permisos.** USAGE del esquema: `anon`, `authenticated`, `service_role`.

| Objeto | RLS | Políticas | GRANT |
|---|---|---|---|
| `secretos` | encendida | ninguna | ninguno a `anon` ni `authenticated` |
| `votantes` | encendida | `votante_propio_select`, `votante_propio_delete`: `auth.uid() = id` | `authenticated`: select, delete |
| `votos` | encendida | `voto_propio_all`: `auth.uid() = votante_id` (lectura y escritura) | `authenticated`: select, insert, update, delete |
| `iniciativas` | encendida | `iniciativa_lectura` (select, `true`); `iniciativa_upsert` (insert, `authenticated`, `true`) | `anon` y `authenticated`: select; `authenticated`: insert |
| `agregados_publicos` | — | — | `anon` y `authenticated`: select |

El alta en `votantes` solo ocurre por `registrar_votante` o `vincular_identidad`: no hay INSERT para `authenticated`. Avisos del asesor de seguridad de Supabase observados el 2026-09-28 en este esquema: la vista definidora `agregados_publicos`, el `search_path` sin fijar de `cedula_valida` y «RLS sin políticas» en `secretos`.

### 10.5 Esquema `espacios`: cuenta, proyectos y lo que se sigue

Una entrada es una referencia a un registro de la plataforma (tipo, `ref`, título, enlace) con lo que el lector añade (nota, fecha, posición, enlaces, narración); ninguna cifra ni texto de una fuente del Estado. `anon` no tiene permiso sobre ninguna tabla del esquema.

**Tablas.**

| Tabla | Columnas principales | Restricciones |
|---|---|---|
| `perfiles` | `id` → `auth.users`, `nombre` (1–80 tras `btrim`), `creado`, `normas` | — |
| `proyectos` | `id`, `dueno` (por omisión `auth.uid()`), `titulo` (1–140), `descripcion` (≤ 5000), `publico`, `slug`, `creado`, `actualizado`, `narrativa` (jsonb), `narrativa_version` | `slug` único, 3–90 caracteres, minúsculas y dígitos separados por guiones; `publico` exige `slug`; `narrativa` es un objeto con `type = 'doc'` de hasta 200,000 octetos |
| `miembros` | `proyecto`, `usuario`, `rol` (`editor` o `lector`), `creado` | PK (`proyecto`, `usuario`) |
| `invitaciones` | `id`, `proyecto`, `email` (≤ 254), `rol`, `invitado_por`, `creado` | único (`proyecto`, `lower(email)`) |
| `entradas` | `id`, `usuario`, `proyecto` (nulo = bandeja «Guardado»), `tipo`, `ref` (1–300), `titulo` (1–500), `href`, `nota` (≤ 5000), `creado`, `actualizado`, `x`, `y`, `fecha` | `tipo_valido(tipo)`; `href_valido(href, true)`; únicos (`proyecto`, `tipo`, `ref`) dentro de un proyecto y (`usuario`, `tipo`, `ref`) en la bandeja; `x` e `y` juntos y en ±100,000; `fecha` entre 1844-01-01 y 2100-12-31; posición y fecha solo con proyecto |
| `enlaces` | `id`, `proyecto`, `desde`, `hasta` → `entradas`, `tipo` (por omisión `relaciona`), `nota` (≤ 1000), `creado_por`, `creado` | `desde <> hasta`; único (`desde`, `hasta`, `tipo`) |
| `seguimientos` | `usuario`, `tipo`, `ref`, `titulo`, `href`, `huella` (≤ 500), `desde`, `visto` | PK (`usuario`, `tipo`, `ref`); `href_valido(href, false)` |

**Vocabularios** (el mismo valor en SQL y en TypeScript):

- `entradas.tipo` — `espacios.tipo_valido`, igual a `TIPOS_ENTRADA` en `lib/espacios.ts` (17): `institucion`, `proveedor`, `proceso`, `norma`, `proyecto`, `expediente-senado`, `legislador`, `sentencia`, `obra`, `capitulo`, `documento`, `dato`, `cargo`, `busqueda`, `funcionario`, `entidad-financiera`, `empresa`.
- `seguimientos.tipo` — igual a `TIPOS_SEGUIDO` en `lib/seguimiento.ts` (9): `proceso`, `proyecto`, `expediente-senado`, `proveedor`, `institucion`, `norma`, `funcionario`, `entidad-financiera`, `empresa`.
- `enlaces.tipo` — igual a `TIPOS_ENLACE` en `lib/espacios.ts` (11): `adjudico`, `contrato`, `pago`, `dueno`, `dirige`, `trabaja`, `familia`, `firmo`, `regula`, `financia`, `relaciona`. `VERBO_ENLACE` da su lectura («adjudicó a», «es familiar de»…).
- `href_valido(h, externo)`: hasta 1000 caracteres, sin espacios, caracteres de control ni barra invertida; una ruta propia (`^/([^/]|$)`, nunca `//`) o, si `externo`, `^https://[a-z0-9.-]+(:[0-9]{1,4})?(/|$)`. `rutaPropia` y `hrefValido` en `lib/espacios.ts` aplican la misma regla en TypeScript.

**Funciones de permiso** (`SECURITY DEFINER`, `search_path = ''`, ejecutables por `authenticated`): `rol_en(p)` devuelve `dueno`, `editor`, `lector` o nulo para `auth.uid()`; `puede_leer(p)` es rol no nulo; `puede_editar(p)` es `dueno` o `editor` (nulo para quien no es miembro); `mi_correo()` devuelve `lower(email)` de `auth.users` solo si `email_confirmed_at` no es nulo.

**Disparadores.**

| Disparador | Tabla | Efecto |
|---|---|---|
| `proyectos_actualizado`, `entradas_actualizado` | `proyectos`, `entradas` | `tocar_actualizado`; en `entradas` solo cuando cambian `titulo`, `nota` o `fecha` |
| `proyectos_publicacion` | `proyectos` | `guardar_publicacion`: `dueno` no cambia; `publico` y `slug` solo los cambia el dueño (`42501`) |
| `enlaces_mismo_proyecto` | `enlaces` | `desde` y `hasta` pertenecen al proyecto del enlace (`23514`) |
| `proyectos_topes`, `entradas_topes`, `enlaces_topes`, `seguimientos_topes`, `invitaciones_topes` | las cinco | `topes` (`54000`): 200 proyectos por cuenta; 2000 entradas por proyecto; 5000 entradas en la bandeja por cuenta; 5000 enlaces por proyecto; 1000 seguimientos por cuenta (un upsert sobre una fila que ya existe no cuenta); 50 invitaciones por proyecto |
| `proyectos_hilo` | `proyectos` | `hilo_de_investigacion` (§10.6) |

**RLS** (todas las políticas son `to authenticated`):

| Tabla | Política | Condición |
|---|---|---|
| `perfiles` | `perfil_propio` (todas) | `id = auth.uid()` |
| `proyectos` | `proyecto_leer` | `dueno = auth.uid() or puede_leer(id)` |
| | `proyecto_crear`, `proyecto_borrar` | `dueno = auth.uid()` |
| | `proyecto_editar` | `puede_editar(id)` |
| `miembros` | `miembro_leer` | `puede_leer(proyecto)` |
| | `miembro_cambiar` | `rol_en(proyecto) = 'dueno'` |
| | `miembro_quitar` | el dueño, o el propio miembro |
| `invitaciones` | `invitacion_leer`, `invitacion_borrar` | el dueño, o `lower(email) = mi_correo()` |
| | `invitacion_crear` | el dueño, con `invitado_por = auth.uid()` |
| `entradas` | `entrada_leer` | en la bandeja, `usuario = auth.uid()`; en un proyecto, `puede_leer` |
| | `entrada_crear` | `usuario = auth.uid()` y, con proyecto, `puede_editar` |
| | `entrada_editar`, `entrada_borrar` | en la bandeja, `usuario = auth.uid()`; en un proyecto, `puede_editar` |
| `enlaces` | `enlace_leer` / `enlace_escribir` | `puede_leer` / `puede_editar` del proyecto |
| `seguimientos` | `seguimiento_propio` (todas) | `usuario = auth.uid()` |

**GRANT a `authenticated`**, por tabla y, donde la fila no cambia de manos, por columna:

| Tabla | Permisos |
|---|---|
| `perfiles`, `seguimientos` | select, insert, update, delete |
| `proyectos` | select, delete; insert (`titulo`, `descripcion`); update (`titulo`, `descripcion`, `publico`, `slug`) |
| `entradas` | select, insert, delete; update (`titulo`, `nota`, `x`, `y`, `fecha`) |
| `enlaces` | select, insert, delete; update (`nota`, `tipo`) |
| `miembros` | select, delete; update (`rol`) |
| `invitaciones` | select, insert, delete |

No hay INSERT en `miembros`: un miembro entra solo por `aceptar_invitacion`. `narrativa` y `narrativa_version` no tienen permiso de columna: se escriben solo por `guardar_narrativa`. Una invitación no envía ningún correo.

**Funciones de la app.**

| Función | La ejecuta | Qué devuelve |
|---|---|---|
| `mis_invitaciones()` | `authenticated` | las invitaciones al correo verificado de quien llama: `id`, `proyecto`, `rol`, `titulo`, `invita` (nombre de firma del dueño o su correo enmascarado, primera letra + `…@dominio`), `creado` |
| `aceptar_invitacion(id)` | `authenticated` | inserta en `miembros` y borra la invitación; devuelve el id del proyecto, o nulo si la invitación no es del correo verificado de quien llama o si es su propio proyecto |
| `miembros_de(p)` | `authenticated` | `usuario`, `rol` y `nombre` (o correo enmascarado) de quien trabaja en el proyecto, solo para quien lo lee |
| `guardar_narrativa(p, doc, version)` | `authenticated` | escribe si quien llama puede editar y `narrativa_version = version`; devuelve la versión nueva, o nulo si otra escritura llegó antes; `42501` sin permiso |
| `publicado(slug)` | `anon`, `authenticated` | jsonb con `titulo`, `descripcion`, `autor` (`perfiles.nombre` o «Anónimo»), `actualizado` (el máximo entre el proyecto, sus entradas y sus enlaces), `narrativa`, `entradas` (con `fecha`, `x`, `y`) y `enlaces` sin los de tipo `familia`; sin ids de usuario ni correos; nulo si no está publicado |

### 10.6 Esquema `espacios`: la conversación

Las ocho tablas tienen RLS encendida, ninguna política y ningún permiso para PUBLIC, `anon` ni `authenticated`; las leen y escriben solo funciones `SECURITY DEFINER` dueñas de ellas.

| Tabla | Columnas principales |
|---|---|
| `hilos` | PK (`tipo`, `ref`); `titulo` (1–300), `href`, `estado` (`visible`, `oculto`, `retirado`), `votos`, `comentarios`, `abierto_por`, `abierto_cedula`, `creado`, `actividad` |
| `comentarios` | `id`; (`hilo_tipo`, `hilo_ref`) → `hilos` (`on delete cascade on update cascade`); `padre` (`on delete set null`); `usuario`; `cedula`; `cuerpo` (≤ 4000); `estado` (los tres de `hilos` más `borrado`); `puntos`; `creado` |
| `votos_hilo` | PK (`tipo`, `ref`, `usuario`), `creado` |
| `votos_comentario` | PK (`comentario`, `usuario`), `valor` (−1 o 1) |
| `denuncias` | `objetivo_tipo` (`comentario` o `hilo`), `objetivo` (el id, o `tipo:ref`), `usuario`, `con_cedula`, `motivo` (`difamacion`, `datos-personales`, `acoso`, `spam`, `falso`, `otro`), `detalle` (≤ 500), `resuelta`; única por objetivo y usuario |
| `moderadores` | `usuario` (PK) |
| `suspensiones` | `usuario` (único), `cedula`, `hasta`, `motivo`, `por` |
| `acciones_moderacion` | `moderador`, `objetivo_tipo` (`comentario`, `hilo`, `usuario`), `objetivo`, `accion` (`restaurar`, `retirar`, `retitular`, `suspender`, `levantar`), `nota` |

**Sobre qué hay conversación.** `tipo_hilo_valido`, igual a `TIPOS_HILO` en `lib/espacios.ts` (9): `institucion`, `proveedor`, `proceso`, `norma`, `proyecto`, `expediente-senado`, `legislador`, `obra`, `investigacion`. La clave de un hilo cumple `ref = href` (en una investigación, `ref` es el slug y `href` es `/p/<slug>`), y `ruta_de_tipo` exige la ruta canónica de la ficha, la que produce `enlace` en `lib/grafo.ts` (§7):

| Tipo | Ruta aceptada |
|---|---|
| `institucion` | `/instituciones/<id>` (1–7 dígitos, sin cero inicial) |
| `proveedor` | `/proveedores/<id>` (1–10 dígitos, sin cero inicial) |
| `proceso` | `/procesos/<código>` con los caracteres que deja `encodeURIComponent` o `%XX` en mayúsculas; se rechaza un `%XX` de un carácter que `encodeURIComponent` no codifica (`%41` = `A`) |
| `norma` | `/normativa/<tipo>/<número>-<año>` |
| `proyecto` | `/congreso/<id>` |
| `expediente-senado` | `/congreso/senado/<AAAA-AAAA>/<id>` |
| `legislador` | `/congreso/legisladores/<id>` |
| `obra` | `/obras/<id>` (1–7 dígitos) |
| `investigacion` | `/p/<slug>` de un proyecto con `publico = true` |

**Requisitos.**

- Escribir texto público —comentar, o abrir un hilo, que escribe su título— pasa por `exigir_autoria`: sesión, sin suspensión, una fila en `democracia.votantes` (`mi_cedula` devuelve su `cedula_hash`), `perfiles.nombre` y `perfiles.normas` (`aceptar_normas`). Devuelve la huella, que la función que llama guarda junto a lo escrito.
- Votar y denunciar pasan por `exigir_votante`: sesión con correo verificado (`mi_correo`) y sin suspensión. Si el hilo no existe, el primer voto lo abre y eso pide `exigir_autoria`.
- Moderar exige una fila en `moderadores` (`es_moderador`). Ninguna función inserta en `moderadores`; tiene una fila, insertada a mano el 2026-09-28.

**Topes.**

| Qué | Tope | Se cuenta por |
|---|---|---|
| Hilos abiertos | 20 al día | huella de la cédula |
| Comentarios | 5 en 10 minutos y 40 al día | huella de la cédula |
| Largo de un comentario | 2–4000 caracteres tras `btrim` | — |
| Enlaces `http(s)://` en un comentario | 3 | — |
| Votos «Importa» (`votar_hilo`) | 120 por hora | cuenta |
| Denuncias | 30 al día | cuenta |
| Duración de una suspensión | 3650 días | cuenta y huella |

**Huellas.** `comentarios.cedula` y `hilos.abierto_cedula` guardan `cedula_hash` 90 días. `olvidar_huellas()` las vacía pasado ese plazo y borra las suspensiones vencidas; corre dentro de cada `comentar` y de cada `suspender`. `suspender` toma la huella de `democracia.votantes` o, si esa fila no existe, la de lo último que la persona escribió. `suspendido_hasta()` busca por cuenta o por huella, de modo que una cuenta nueva con la misma cédula registrada hereda la suspensión.

**Moderación.** Tres denuncias pendientes de cuentas distintas con `con_cedula = true` pasan un comentario o un hilo a `oculto`. `moderar(objetivo_tipo, objetivo, 'restaurar' | 'retirar', nota)` cambia el estado, marca sus denuncias como resueltas y escribe en `acciones_moderacion`; `retitular(clave, titulo, nota)` cambia el título de un hilo; `suspender(usuario, dias, motivo)` suspende con `dias > 0` y levanta con `dias <= 0`. `borrar_comentario(id)` vacía el `cuerpo` del comentario propio y lo deja en `borrado`.

**Contadores** (disparadores `SECURITY DEFINER`, por incremento): `contar_voto_comentario` mantiene `comentarios.puntos`; `contar_voto_hilo` mantiene `hilos.votos` sin tocar `actividad`; `contar_comentario` cuenta en `hilos.comentarios` solo lo visible y pone `actividad = now()` cuando un comentario pasa a visible (al publicarse o al restaurarse). `hilo_de_investigacion` (sobre `proyectos`): un slug nuevo mueve el hilo `investigacion` y sus denuncias a la nueva dirección; quitar el slug o borrar el proyecto borra el hilo y sus denuncias.

**Lecturas.**

- `hilo(tipo, ref)`: `existe`, `estado`, `votos`, `comentarios`, `mi_voto` y `lista` con los 1000 comentarios más recientes en orden de creación; lo no visible sale sin `autor` ni `cuerpo` y con `puntos = 0`; `mio` y `mi_voto` solo con sesión. La lista va vacía si el hilo no está visible; el hilo de una investigación no publicada no se lee.
- `comunidad(orden, limite, pagina)`: hilos visibles (sin investigaciones no publicadas). `destacado` ordena por `(votos + 2·comentarios) / (horas desde actividad + 2)^1,5`, `nuevo` por `creado`, `votado` por `votos`; desempata por `actividad`, `tipo`, `ref`; `limite` entre 1 y 100.
- `mi_estado_conversacion()`: `cuenta`, `correo`, `cedula`, `nombre`, `normas`, `suspendido_hasta`, `moderador`.
- `cola_moderacion()` (solo moderadores): comentarios e hilos ocultos o con denuncias pendientes, con el id de su autor y los motivos, y las suspensiones vigentes.

**Permisos de ejecución.** Internas, revocadas a PUBLIC, `anon` y `authenticated`: `tipo_hilo_valido`, `ruta_de_tipo`, `abrir_hilo`, `mi_cedula`, `exigir_autoria`, `exigir_votante`, `estado_para_escribir`, `olvidar_huellas` y las cuatro de disparador. Para `authenticated`: `es_moderador`, `suspendido_hasta`, `cedula_registrada`, `mi_estado_conversacion`, `aceptar_normas`, `comentar`, `borrar_comentario`, `votar_comentario`, `votar_hilo`, `denunciar`, `cola_moderacion`, `moderar`, `retitular`, `suspender`. Para `anon` y `authenticated`: `hilo` y `comunidad`. Las funciones fallan con `raise exception` en español y códigos `42501`, `22023`, `23514` o `54000`, que `lib/espacios-cliente.ts` muestra tal cual (§10.8).

### 10.7 Cuenta Única y la Edge Function `vincular-cuenta-unica`

**Emisor.** ✅ `https://auth.cuentaunica.gob.do/.well-known/openid-configuration` responde (verificado el 2026-09-02, solo GET): Ory Hydra; `/oauth2/auth`, `/oauth2/token`, `/.well-known/jwks.json` (dos claves RSA, RS256); PKCE `S256`; `token_endpoint_auth_methods_supported` incluye `none`; `claims_supported: [sub]`; sin `registration_endpoint`, de modo que el `client_id` lo emite la OGTIC. `CUENTA_UNICA` en `app/democracia/cuenta-unica/cliente.ts` fija esos endpoints y `scope=openid`.

**Flujo en el código.**

1. En `/democracia/registro`, con sesión de Supabase, `iniciarFlujo(uid)` guarda en `localStorage` (clave `socratico-cuenta-unica-flujo`, vigencia 10 minutos) un verificador PKCE de 48 bytes aleatorios, un `state` de 16 bytes y la `redirect_uri` (`origen + /democracia/cuenta-unica/callback`), y lleva a `/oauth2/auth` con `code_challenge` S256 y `nonce = base64url(SHA-256("socratico:" + uid))` (`nonceDeSesion`).
2. `/democracia/cuenta-unica/callback` (`callback.tsx`) exige que el `state` sea el del flujo guardado y vigente, lo borra, exige sesión de Supabase y hace `POST /democracia/cuenta-unica/token` con `code`, `code_verifier` y `redirect_uri`.
3. `app/democracia/cuenta-unica/token/route.ts` (`dynamic = "force-dynamic"`) valida el formato de `code` y `code_verifier` y que `redirect_uri` sea exactamente la del propio origen (HTTPS, o HTTP en `localhost`/`127.0.0.1`); canjea en `/oauth2/token` (`grant_type=authorization_code`, sin secreto, User-Agent `Socratico-Inteligencia/1.0 (identidad ciudadana; herramienta independiente)`, límite de 15 s) y devuelve solo `id_token`, o el código de error de OAuth con 502. No verifica ni lee el token.
4. El callback llama `supabase().functions.invoke("vincular-cuenta-unica", { body: { id_token } })`, que lleva el JWT de la sesión.
5. La Edge Function `supabase/functions/vincular-cuenta-unica/index.ts` (Deno; `npm:@supabase/supabase-js@2`, `npm:jose@5`; excluida del typecheck en `tsconfig.json`):

| Paso | Comprobación | Fallo |
|---|---|---|
| Método | `OPTIONS` → CORS (`Access-Control-Allow-Origin: *`); solo `POST` | 405 `metodo` |
| Cliente | `CUENTA_UNICA_CLIENT_ID` no vacío | 503 `cliente_no_configurado` |
| Sesión | `Authorization: Bearer <jwt>`; `auth.getUser(jwt)` con `SUPABASE_ANON_KEY` | 401 `sesion_requerida` |
| Cuerpo | JSON con `id_token` de tres segmentos base64url | 400 `parametros` / `token_invalido` |
| Token | `jwtVerify` contra el JWKS del emisor: `issuer`, `audience = CUENTA_UNICA_CLIENT_ID`, `RS256`, `maxTokenAge` 15 min, tolerancia 60 s; `nonce = nonceDeSesion(uid)` | 400 `token_invalido` |
| Sujeto | `sub` no vacío | 400 `sujeto_invalido` |
| Vínculo | `democracia.vincular_identidad(p_uid, p_sub, p_cedula)` con `SUPABASE_SERVICE_ROLE_KEY`; `p_cedula` sale solo de un claim llamado `cedula` con 11 dígitos tras quitar lo que no es dígito | 502 `base_de_datos` |

   `verify_jwt = false` (`supabase/config.toml`): la puerta de enlace de Supabase no comprueba el JWT; lo comprueba la función con `auth.getUser`.
6. `vincular_identidad(uid, sub, cedula)` exige que `uid` exista en `auth.users`. Si `cedula` pasa `cedula_valida`, la clave es `hash_cedula(cedula)`; si no, `hash_sujeto(sub)`. Con la fila propia ya vinculada a esa clave devuelve `ya_vinculado`. Si otra cuenta ocupa la clave con `origen = 'declarada'`, `cedula_declarada_en_uso`; con `cuenta_unica`, `identidad_en_uso`; en ambos casos no cambia ninguna fila. Si no, actualiza o inserta la fila propia con `origen = 'cuenta_unica'` y `verificado = now()` y devuelve `vinculado`. `callback.tsx` traduce cada código a un mensaje.

**Sin `client_id`.** Con `NEXT_PUBLIC_CUENTA_UNICA_CLIENT_ID` vacío, `cuentaUnicaHabilitada()` es `false`: `/democracia/registro` no muestra la vía (ni deshabilitada), `/democracia/seguridad` omite la medida de Cuenta Única, `iniciarFlujo` lanza `cliente_no_configurado` y `POST /democracia/cuenta-unica/token` responde 503 `cliente_no_configurado`. Con `CUENTA_UNICA_CLIENT_ID` vacío en Supabase, la Edge Function responde 503. El widget de voto añade «N con identidad verificada (Cuenta Única)» solo si `verificados > 0`, y `lib/democracia.ts` lee `verificados` con valor por omisión 0.

### 10.8 Capa de la app

| Módulo | Corre en | Qué hace |
|---|---|---|
| `lib/supabase-config.ts` | servidor y navegador | `SUPABASE_URL` y `SUPABASE_ANON_KEY` (§10.2) |
| `lib/supabase.ts` | navegador (`"use client"`) | `supabase()`: un `createClient` único con la sesión en `localStorage`; `db()` = esquema `democracia`; `espacios()` = esquema `espacios` |
| `lib/democracia.ts` | servidor | REST a `${SUPABASE_URL}/rest/v1` con la clave publicable, `Accept-Profile: democracia` y 12 s de límite; valida con `zod` (`looseObject`). `getAgregado(camara, ref)` (revalidate 30 s): sin respuesta, `null`; sin filas, ceros. `getRanking(limite)` (60 s) cruza `agregados_publicos` con `iniciativas` y calcula `balance` y `apoyo`. `getResumenDemocracia()` (60 s) suma votos e iniciativas. El voto nominal no se lee en el servidor |
| `lib/espacios.ts` | servidor y navegador; no importa supabase-js | vocabularios (`TIPOS_ENTRADA`, `NOMBRE_TIPO`, `TIPOS_ENLACE`, `VERBO_ENLACE`, `ENLACES_PRIVADOS = ["familia"]`, `TIPOS_HILO`, `NOMBRE_HILO`); `rutaPropia`, `hrefValido`, `SLUG`, `FECHA_CASO`; `slugDe` (título sin tildes, hasta 60 caracteres, más `-` y 4 caracteres base36 al azar). `leerPublicado(slug)`: `POST /rest/v1/rpc/publicado` con `Content-Profile: espacios`, revalidate 60 s, 15 s; devuelve `ok`, `no-existe` o `caida`, y vuelve a filtrar tipos, `href`, fechas, pares `x`/`y` y enlaces privados o hacia entradas ausentes. `leerHilo` (`no-store`) y `leerComunidad` (revalidate 30 s; solo filas con `rutaPropia`) usan `rpcPublica`, sin supabase-js; `PGRST106` y `PGRST202` dan `cerrado` |
| `lib/espacios-cliente.ts` | navegador | todas las operaciones con sesión, por `espacios()`; cada una devuelve `Hecho<T>` y nunca lanza. `traducir` lee `PGRST106`, `42P01`, `3F000`, `PGRST202`, `42883`, `42703` y `PGRST204` como `cerrado`; muestra tal cual el mensaje en español de las funciones (`22023`, `23514`, `54000`, `42501`); traduce `23505`, `42501`/RLS y `PGRST301`/JWT. `publicar` conserva el slug existente y, si uno nuevo choca (`23505`), sortea otro hasta tres intentos. `usoDePlataforma` no pasa por el esquema ni devuelve `Hecho<T>`: llama la Edge Function `metricas-uso`, valida la respuesta con `zod/mini` y devuelve `ajeno`, `ok` o `fallo` (§10.12) |
| `lib/sesion.ts` | navegador | entrada compartida por `/cuenta` y `/democracia/registro` (§10.1) |
| `lib/ftm.ts` | navegador | `casoAFtm` exporta un caso a FollowTheMoney, una línea JSON por entidad: cada entrada con el esquema de su tipo (`PublicBody`, `LegalEntity`, `Person`, `Contract`, `Project`, `Position`, `Document`, `Company`) y `sourceUrl`; cada enlace como `UnknownLink` con el verbo y la nota en `role`. `archivoFtm` nombra el archivo `<título>.json` |
| `lib/cedula.ts` | navegador | `cedulaValida`, `limpiarCedula`, `formatearCedula`: la regla de `democracia.cedula_valida` para la interfaz |

**Sincronización de lo seguido** (`sincronizarSeguidos`, `reflejarSeguidos`, `salir` en `lib/espacios-cliente.ts`). La lista del navegador (`lib/seguimiento.ts`, §11) se une con `espacios.seguimientos` contra la última lista que ambos tuvieron en común, guardada en `localStorage` bajo `lrd:seguimiento-cuenta:<uid>`. Sin lista común se unen las dos; con ella, lo nuevo en un lado pasa al otro y lo que estaba en común y falta en un lado se quita del otro; en lo que está en ambos gana el `visto` más reciente. La lista común avanza solo si todas las escrituras salieron, y si la lista local cambia durante la sincronización se repite, hasta tres vueltas. `reflejarSeguidos` sube cada cambio posterior, con cola. `salir` cierra la sesión, deja de reflejar, vacía la lista del navegador y borra la lista común; no toca la cuenta. Suben solo las filas que pasan `subible`: tipo en `TIPOS_SEGUIMIENTO` (`proceso`, `proyecto`, `expediente-senado`, `proveedor`, `institucion`, `norma`) y `href` que pase `rutaPropia`. `funcionario`, `entidad-financiera` y `empresa`, que el `check` de la tabla admite desde `20260930120000`, se quedan en el navegador.

### 10.9 Páginas

| Ruta | Archivo | Render | Qué lee o escribe | Indexación |
|---|---|---|---|---|
| `/democracia` | `app/democracia/page.tsx` | servidor, `revalidate = 60` | `getRanking(40)` | indexable, canónica |
| `/democracia/registro` | `app/democracia/registro/page.tsx` → `registro.tsx` | navegador | OTP; `votantes` (`select *`); `registrar_votante`; inicio de Cuenta Única | `noindex, nofollow` |
| `/democracia/seguridad` | `app/democracia/seguridad/page.tsx` | servidor, `revalidate = 3600` | ninguna | indexable, canónica |
| `/democracia/cuenta-unica/callback` | `…/callback/page.tsx` → `callback.tsx` | navegador | canje y `functions.invoke` | `noindex, nofollow` |
| `POST /democracia/cuenta-unica/token` | `…/token/route.ts` | `force-dynamic` | emisor de Cuenta Única | — |
| `/cuenta` | `app/cuenta/page.tsx` → `components/espacios/entrar.tsx` | servidor + navegador | Auth, `perfiles`, `mis_invitaciones`, sincronización; `?volver=` solo con `rutaPropia` | `noindex, follow` |
| `/espacio` | `app/espacio/page.tsx` → `mi-espacio.tsx` | navegador | invitaciones, lo seguido, proyectos, bandeja; al final, el uso de la plataforma (`uso.tsx`, `metricas-uso`, §10.12) | `noindex, nofollow` |
| `/espacio/proyecto?id=` | `app/espacio/proyecto/page.tsx` → `mesa-proyecto.tsx` | navegador; `id` debe cumplir `^[0-9a-f-]{36}$` | proyecto, entradas, enlaces, miembros, invitaciones, narración, publicación | `noindex, nofollow` |
| `/espacio/moderar` | `app/espacio/moderar/page.tsx` → `moderar.tsx` | navegador | `cola_moderacion`, `moderar`, `retitular`, `suspender` | `noindex, nofollow` |
| `/p/[slug]` | `app/p/[slug]/page.tsx` | servidor; `leerPublicado` con `cache` de React | `publicado`; estados `caida`, `no-existe` y `ok` (tablero, línea de tiempo, registros, narración, descarga FtM, conversación) | `noindex, nofollow`, canónica `/p/<slug>` |
| `/comunidad` | `app/comunidad/page.tsx` | servidor | `leerComunidad(orden, 50)`; `?orden=` `nuevo` o `votado` (por omisión `destacado`) | indexable, canónica |
| `/comunidad/normas` | `app/comunidad/normas/page.tsx` | servidor | ninguna (`NORMAS` de `components/espacios/normas.ts`) | indexable, canónica |

En las fichas de iniciativa (`/congreso/[id]` y `/congreso/senado/[cuatrienio]/[id]`), el servidor lee el agregado con `getAgregado` y `components/democracia/voto-widget.tsx`, en el navegador, lee la sesión, la fila propia de `votantes` y el voto propio de `votos`, llama `emitir_voto` o `quitar_voto` y vuelve a leer `agregados_publicos`.

### 10.10 `components/espacios/` y la frontera de las fichas

**El mecanismo.** Una ficha de datos del Estado no importa `@/lib/supabase` ni `@supabase/supabase-js`: pinta un componente de `components/espacios/` (o `components/democracia/voto-widget.tsx`) y le pasa una referencia (`tipo`, `ref`, `titulo`, `href`). El componente decide cuándo cargar el cliente de Supabase; lo que llega a la base es la referencia, y la ficha sigue leyendo la cifra de su fuente.

| Pieza en la ficha | Dónde se pinta |
|---|---|
| `Guardar` (`guardar.tsx`) | por `components/acciones-ficha.tsx` en `/empresas/[rnc]`, `/banca/[slug]`, `/congreso/[id]`, `/congreso/senado/[cuatrienio]/[id]`, `/normativa/[tipo]/[numero]`, `/funcionarios/[slug]`, `/instituciones/[id]`, `/proveedores/[rpe]` y `/finanzas/[capitulo]`; por `components/acciones-proceso.tsx` (en `/procesos/[codigo]`); directo en `/procesos/[codigo]`, `/buscar`, `/constitucional` y `/tse` |
| `Conversacion` (`conversacion.tsx`) | `/procesos/[codigo]`, `/normativa/[tipo]/[numero]`, `/congreso/[id]`, `/congreso/senado/[cuatrienio]/[id]`, `/congreso/legisladores/[id]`, `/proveedores/[rpe]`, `/instituciones/[id]`, `/obras/[snip]` y `/p/[slug]` |
| `VotoWidget` | `/congreso/[id]`, `/congreso/senado/[cuatrienio]/[id]` |
| `PuertaCuenta`, `SincronizarCuenta` | `app/layout.tsx` |
| `LlamadaCuenta`, `ConversacionesVivas` | `app/page.tsx` |

**Los componentes.**

| Archivo | Qué es | Cliente de Supabase |
|---|---|---|
| `guardar.tsx` | guardar en la bandeja o en proyectos | `import()` de `@/lib/espacios-cliente` al abrir el menú, o con sesión para saber si ya está guardado |
| `conversacion.tsx` | la conversación de un registro | nada hasta 600 px antes de llegar (`IntersectionObserver`) o con `#conversacion`; sin sesión, `leerHilo` por HTTP; con sesión, `import()` |
| `voto-hilo.tsx` | «Importa» | `import()` al pulsar |
| `feed-comunidad.tsx` | filas de `/comunidad` | `import()` con sesión, para los votos propios |
| `conversaciones-vivas.tsx` | cinco conversaciones destacadas en la portada | no: `leerComunidad` desde el navegador al acercarse; nada en `cerrado` |
| `sincronizar.tsx` | sincroniza lo seguido; no pinta nada | `import()` solo si hay sesión guardada |
| `presencia.ts` | `useHaySesion`, `avisarCambioDeSesion` | no: lee `gobiername-democracia-auth` en `localStorage` |
| `puerta-cuenta.tsx`, `llamada-cuenta.tsx` | «Entrar» / «Tu espacio» | no |
| `entrar.tsx` | formulario de `/cuenta` | estático |
| `mi-espacio.tsx`, `mesa-proyecto.tsx`, `moderar.tsx` | `/espacio`, `/espacio/proyecto`, `/espacio/moderar` | estático |
| `uso.tsx` | el uso de la plataforma, al final de `/espacio` (§10.12) | estático; la Edge Function `metricas-uso` por `functions.invoke` |
| `caso.tsx` | tablero, línea de tiempo, evidencia y narración de un caso | estático |
| `narracion.tsx` | editor Tiptap con menciones `@`; guarda con versión; no guarda por encima de `TOPE = 195_000` bytes | estático |
| `comun.tsx` | `useUsuario`, `SinSesion`, `Cerrado` | estático |
| `tablero.tsx`, `tablero-diferido.tsx` | tablero con React Flow, cargado con `dynamic` | no |
| `linea-tiempo.tsx` | línea de tiempo; sin `"use client"` | no |
| `evidencia.tsx` | cuadro con TanStack Table | no |
| `narrativa-lectura.tsx` | pinta la narración con lista blanca de nodos y marcas, elementos de React, profundidad máxima 24 | no |
| `registro.tsx` | `EnlaceRegistro`, `MarcaTipo` | no |
| `exportar-ftm.tsx` | descarga `casoAFtm` en el navegador | no |
| `deshacer.tsx` | aviso «Deshacer» | no |
| `normas.ts` | `NORMAS` | no |
| `razones.ts` | por qué no se puede votar | solo tipos |

**Cómo se hace cumplir** (el harness completo en §12):

- `es_archivo_con_estado` (`.claude/hooks/lib.sh`) es la lista de archivos que pueden leer variables de entorno o importar Supabase: `lib/supabase.ts`, `lib/supabase-config.ts`, `lib/democracia.ts`, `lib/cedula.ts`, `lib/espacios.ts`, `lib/espacios-cliente.ts`, `lib/sesion.ts`, `app/democracia/*`, `components/democracia/*`, `supabase/*`, `app/cuenta/*`, `app/espacio/*`, `app/p/*` y `components/espacios/*`.
- `.claude/hooks/guard-edit.sh` (PreToolUse de `Edit|Write|MultiEdit`) examina el texto nuevo. En un `.ts` o `.tsx` fuera de la lista, quitadas las líneas de comentario, bloquea `process.env.` y las importaciones de `@supabase/supabase-js` o de `@/lib/supabase` seguido de comilla. En cualquier archivo, `.md` incluidos, bloquea valores con forma de clave secreta de Supabase, de clave privada PEM o de JWT (`SECRETO_VALORES` en `.claude/hooks/lib.sh`); fuera de `supabase/` y de los `.md`, los nombres del rol de servicio (`SECRETO_NOMBRES`). Bloquea escribir en `.env` o `.env.*` salvo `.env.example`.
- `.claude/hooks/verificar.sh`: el paso 3 busca `process.env.` e importaciones de Supabase en `app`, `lib` y `components` y falla si alguna está fuera de la lista; el paso 4 hace `git grep` de `SECRETO_VALORES` en todo lo versionado (menos `package-lock.json` y `.claude/hooks/`) y de `SECRETO_NOMBRES` (menos además `supabase/` y `*.md`).
- `.claude/hooks/guard-bash.sh` bloquea escribir `.env` por redirección o `tee` (salvo `.env.example`), `vercel env add`, `vercel env rm`, `vercel env pull` y `supabase secrets`.
- El patrón de importación no incluye `@/lib/espacios-cliente` ni `@/lib/sesion`, que cargan el cliente; el 2026-10-02 solo los importan archivos de la lista.
- `.claude/rules/democracia.md` se carga al tocar `app/democracia/**`, `components/democracia/**`, `lib/democracia.ts`, `lib/supabase.ts`, `lib/supabase-config.ts`, `lib/cedula.ts` o `supabase/**`; `.claude/rules/espacios.md`, al tocar `app/cuenta/**`, `app/espacio/**`, `app/p/**`, `app/comunidad/**`, `components/espacios/**`, `lib/espacios.ts`, `lib/espacios-cliente.ts`, `lib/sesion.ts`, `lib/ftm.ts`, las migraciones `*espacios*`, `*conversacion*` y `*caso*`, `supabase/pruebas/**` o `supabase/functions/metricas-uso/**`. Condensan lo de esta sección: solo claves publicables; la huella y nunca la cédula; RLS en cada tabla, sin voto nominal ajeno ni tablas de `espacios` para `anon`; ningún dato del Estado en `espacios`; invitaciones sobre el correo verificado; `rutaPropia` para todo enlace construido con datos guardados o de la consulta; la narración solo por `guardar_narrativa` y solo pintada por `narrativa-lectura.tsx`; los tres estados de pantalla (vacío, `caida`, `cerrado`); y las pruebas de §10.11 con `FALLOS: 0`.

### 10.11 Pruebas

| Archivo | Cómo se corre | Andamio | Casos |
|---|---|---|---|
| `supabase/pruebas/espacios_rls.py` | `pip install pgserver "psycopg[binary]"`, luego `python3 supabase/pruebas/espacios_rls.py` | Postgres desechable (`pgserver`) que simula los roles `anon` y `authenticated`, `auth.users` con `email_confirmed_at`, `auth.uid()` y `auth.jwt()` leídos de `request.jwt.claim.sub` y `request.jwt.claims`, y un `democracia.hash_cedula` de prueba. Aplica dos veces `20260928120000_espacios.sql`, `20260928120100_democracia_secretos_rls.sql` y `20260928160000_caso.sql` | 110 con `PASS`/`FAIL`, más la comprobación silenciosa de RLS encendida en las siete tablas y en `democracia.secretos` |
| `supabase/pruebas/conversacion_rls.py` | igual | el mismo, con un `democracia.votantes` reducido; aplica dos veces `…120000_espacios`, `…120100_democracia_secretos_rls` y `…140000_conversacion` | 130 |
| `supabase/pruebas/sincronizar_seguidos.cjs` | `node supabase/pruebas/sincronizar_seguidos.cjs` | transpila `lib/espacios-cliente.ts`, `lib/seguimiento.ts` y `lib/espacios.ts` con el `typescript` de `node_modules` a un directorio temporal; cambia `@/lib/supabase` por una tabla `seguimientos` en memoria con ganchos entre llamadas, y `@/lib/grafo` y `@/lib/supabase-config` por sustitutos | 12; `FALLOS: 0` el 2026-10-02 |
| `supabase/pruebas/metricas_uso.cjs` | `node supabase/pruebas/metricas_uso.cjs` | transpila `supabase/functions/metricas-uso/normalizar.ts` y `lib/espacios-cliente.ts` (con `lib/seguimiento.ts` y `lib/espacios.ts`) con el `typescript` de `node_modules` a un directorio temporal; cambia `@/lib/supabase` por un `functions.invoke` de mentira que imita a supabase-js (2xx → `data`; otro estado → `error.context` con la `Response`); sin red ni Deno | 50; `FALLOS: 0` el 2026-10-02 |

Cada una imprime una línea por caso y `FALLOS: N`, y sale con código 1 si hay fallos. Se corren a mano: no forman parte de `.claude/hooks/verificar.sh`. Ninguna aplica las migraciones de `democracia` (`20260901043106`, `20260901043155`, `20260902120000`) ni `20260930120000_espacios_personas.sql`, ni ejecuta una Edge Function.

Lo que recorren:

- `espacios_rls.py`, desde la dueña, una colaboradora invitada, una extraña, una cuenta que pone en su JWT el correo de otra sin haberlo verificado, una cuenta con el correo sin confirmar y `anon`: verbos de enlace (repetido, inventado, cambio de verbo); tablero y fechas (`x` sin `y`, fuera de rango, fecha anterior a 1844, posición o fecha en la bandeja, mover no cambia `actualizado`); narración solo por función, con versión, tope de tamaño y sin permiso para extraños ni `anon`; invitación con correo en mayúsculas, correo del JWT sin verificar, correo sin confirmar y aceptación con un id ajeno; lo que un editor no puede (publicar, borrar, invitar, llevarse una entrada a su bandeja, cambiar el autor, mover un enlace, cambiarse el rol); lo que la dueña no puede (traspasar el proyecto, meter un miembro sin invitación); lectura de `publicado` por `anon` sin ids ni correos y sin `familia`; `href` hostiles (`javascript:`, `//`, `/\`, tabulador, salto de línea, espacio, `http:`, puerto de cinco cifras); duplicados en la bandeja; seguimientos con `href` externo, tope de 1000 y upsert en el tope; salir de un proyecto; perfil ajeno; `hash_cedula` sigue respondiendo con RLS en `secretos`.
- `conversacion_rls.py`, desde dos cuentas con cédula registrada, una solo con cuenta, un correo sin confirmar, una cuenta suspendida y su cuenta nueva con la misma huella, una cuenta que borra su registro de votante antes de ser suspendida, tres correos desechables, la moderadora y `anon`: requisitos para escribir; rutas canónicas (ruta distinta del `ref`, otra sección, `//`, consulta, nombre en la ruta, ceros a la izquierda, tipo sin ficha, investigación no publicada, `%20` y tilde codificada aceptados, `%41` y `%ZZ` rechazados); respuestas y respuestas cruzadas; largo y enlaces; lectura anónima sin ids ni huellas; ritmo; escritura y lectura directas en tablas; votos (propio, valores, sin confirmar, `anon`, repetidos y retirados en bucle); orden y paginación del feed; denuncias de desechables frente a denuncias con cédula; cola, restaurar, retirar y retitular; suspensión por cuenta y por huella; olvido a los 90 días; borrar lo propio; contadores al borrar una cuenta; hilo denunciado y retirado; investigación publicada, retirada, con slug nuevo y borrada; RLS encendida en las ocho tablas.
- `sincronizar_seguidos.cjs`: primera unión, altas y bajas en cada lado, seguir y dejar de seguir mientras la sincronización espera a la red, escritura fallida que no avanza la lista común, cola de cambios en `reflejarSeguidos`, `salir` con error y sin él.
- `metricas_uso.cjs`: el día se parte en UTC (también cuando en Santo Domingo aún es la víspera); las URL de `count` y `aggregate` con proyecto, equipo, período, una sola dimensión y `limit`; `count` con y sin dimensiones al lado, en cero, sin visitantes, con texto, negativo, sin `data` y nulo; `aggregate` ordenado de mayor a menor con empate por nombre, referente ausente o nulo como clave vacía, lista vacía, `data` que no es lista, fila sin cifras y clave no textual; `by=day` con días faltantes en cero, treinta días que terminan hoy, fila fuera del período, `timestamp` ilegible o ausente y fila sin cifras; «Others» al final aunque sume más; una cifra `null` como cero y una ausente como forma rota. Y `usoDePlataforma`, la decisión que importa para la seguridad: `ok` con la forma buena; `ajeno` con 403, 401, el 404 de la puerta de enlace, un cuerpo que no es JSON, un error de red, una llamada que lanza, `autorizado: false` o sin la marca; `fallo` con cada código que la función dice (`sin_datos`, `token_no_configurado`, `vercel_rechazo`), con un código desconocido como `vercel_caida` y con una forma rota o una lista ausente como `forma`.

### 10.12 El uso de la plataforma y la Edge Function `metricas-uso`

**Qué es.** Al final de `/espacio`, `components/espacios/uso.tsx` pinta Vercel Web Analytics (§1.2) del proyecto `socratico`: visitantes y páginas vistas de los últimos 7 y 30 días, las páginas vistas por día (30 columnas, días en UTC) y las rutas (10), los referentes (8) y los países (8) con más páginas vistas en 30 días. Lo ve solo un correo verificado que esté en el secreto `METRICAS_CORREOS`. El token de Vercel vive como secreto de la función: no está en Vercel, en el repositorio ni en el navegador.

**Flujo.**

1. `usoDePlataforma()` (`lib/espacios-cliente.ts`) llama `supabase().functions.invoke("metricas-uso", { method: "POST" })`, que lleva el JWT de la sesión. Con un estado que no es 2xx, lee el cuerpo de `error.context`.
2. La Edge Function `supabase/functions/metricas-uso/index.ts` (Deno; `npm:@supabase/supabase-js@2`; excluida del typecheck en `tsconfig.json`, comprobada con `deno check` el 2026-10-02) importa de `normalizar.ts` las URL y la lectura de las respuestas:

| Paso | Comprobación | Fallo |
|---|---|---|
| Método | `OPTIONS` → CORS (`Access-Control-Allow-Origin: *`); solo `POST` | 405 `metodo` |
| Sesión | `Authorization: Bearer <jwt>`; `auth.getUser(jwt)` con `SUPABASE_ANON_KEY` | 401 `sesion_requerida` |
| Permiso | `email` con `email_confirmed_at`, en minúsculas, dentro de `METRICAS_CORREOS` (leído de Auth, no del claim del JWT) | 403 `sin_permiso` |
| Token | `VERCEL_TOKEN` no vacío | 503 `token_no_configurado` |
| Vercel | seis `GET` en paralelo a `https://api.vercel.com/v1/query/web-analytics/visits`, con `projectId` y `teamId` fijos en `normalizar.ts` (`PROYECTO`, `EQUIPO`) y 15 s de límite cada uno: `count` de 30 y de 7 días; `aggregate` con `by=day` (`limit` 31), `requestPath` (10), `referrerHostname` (8) y `country` (8) | 404 de Vercel → 404 `sin_datos`; 401 o 403 → 502 `token_rechazado`; otro 4xx → 502 `vercel_rechazo`; red, tiempo o 5xx → 502 `vercel_caida`; JSON ilegible, una fila sin `pageviews` y `visitors` numéricos (`null` cuenta como cero, porque la OpenAPI lo admite) o sin `timestamp` legible → 502 `forma` |
| Respuesta | `{ ok, autorizado, desde, hasta, consultado, semana, mes, dias, rutas, referentes, paises }`, cifras en `paginas` y `visitantes`; `Cache-Control: no-store` | — |

   Desde el paso «Token», todo cuerpo lleva `autorizado: true`. El período va de la medianoche UTC de hace 29 días al momento de la consulta; `leerDias` pone cero en los días que Vercel no trae. `verify_jwt = false` en `supabase/config.toml`: la puerta de enlace no comprueba el JWT, lo comprueba la función.
3. `uso.tsx`: sin `autorizado: true` en el cuerpo (otra cuenta, función sin desplegar, sin red) es `ajeno` y no pinta nada, ni un esqueleto. Un fallo pinta `EstadoVacio`: `sin_datos` como vacío con «Abrir el panel de Vercel» (el 404 también lo daría Web Analytics apagado, y el texto nombra las dos causas); `token_no_configurado`, `token_rechazado`, `vercel_rechazo` y `forma` como `caida` con «Abrir el panel de Vercel»; `vercel_caida` como `caida` con «Volver a mirar». Con datos: la fuente y la hora de la consulta bajo el título, `TiraDeCifras` con cuatro `Cifra` (las dos de visitantes llevan que la misma persona en dos días cuenta dos veces), `SerieTemporal` en columnas y tres `BarrasHorizontales`; el grupo «Others» va siempre al final. `<Uso key={u.id} />` en `mi-espacio.tsx` lo monta de nuevo si la sesión cambia de cuenta. `Intl.DisplayNames` se crea al usarlo y, sin él (Safari anterior a 14.1), el país se queda en su código: creado al cargar el módulo tumbaba `/espacio` a toda cuenta. Una ruta enlaza si pasa `rutaPropia`; el grupo `Others` se escribe «Las demás páginas», «Los demás sitios» o «Los demás países»; el referente vacío, «Directo o sin referente»; el país sale de `Intl.DisplayNames` en español.

**La API de Vercel** (`https://vercel.com/openapi.json`, leído el 2026-10-02). Autenticación bearer. `by` es un parámetro repetible: hasta dos dimensiones, una sola de tiempo. Sin `filter`, cuenta solo producción. Lo que pasa de `limit` (1–100, 10 por omisión) se agrupa en «Others». `count` devuelve `data.pageviews` y `data.visitors`; las filas de `aggregate` traen la dimensión y sus cifras, o `timestamp` en una serie. `POST /v3/user/tokens` acepta `projectId` (un token limitado a un proyecto) y `expiresAt`. Con el conector de Vercel, el 2026-10-02 y antes de la primera visita, `count` y `aggregate` respondían 404 «Web Analytics not found».

**Despliegue y secretos.** `supabase functions deploy metricas-uso --project-ref amuyclnyjyhigeyhuufs` desde la raíz del repositorio (lee `supabase/config.toml`). Los secretos `VERCEL_TOKEN` y `METRICAS_CORREOS` se fijan en el panel de Supabase (Edge Functions → Secrets) o con `supabase secrets set`, que `guard-bash.sh` bloquea dentro de una sesión. **Alcance del token.** Un token de Vercel no es de solo lectura: con el de toda la cuenta, quien llegue al panel de Supabase podría desplegar a producción. `POST /v3/user/tokens` acepta `projectId` y `expiresAt`: se crea con `projectId = prj_6S1jj4Ubba7lKVJDFdnKWcK7JoU6` (el proyecto `socratico`) y con vencimiento, y cuando venza el panel dice `token_rechazado`. Estado el 2026-10-05: desplegada en `Transac` (versión 1, `ACTIVE`, `verify_jwt: false`, con el conector de Supabase); el dueño fijó los secretos en el panel, que una sesión no puede leer. Medido ese día desde fuera: `OPTIONS` 200; `GET` 405 `metodo`; `POST` sin `Authorization` o con un JWT falso, 401 `sesion_requerida`. Ese mismo día `count` seguía respondiendo 404 «Web Analytics not found» con `script.js` en 200 y `_vercel/insights` en el chunk `4402-…` de la portada: Vercel no había registrado ninguna página vista, y el panel lo dice como `sin_datos`.

## 11. Interfaz

### 11.1 Pila de estilos

- Tailwind CSS 4 (`tailwindcss` 4.3.3) por el plugin `@tailwindcss/postcss` 4.3.3, declarado en `postcss.config.mjs`. No hay `tailwind.config`: la configuración es la hoja `app/globals.css` (964 líneas), que abre con `@import "tailwindcss"` y declara los tokens en un bloque `@theme`; Tailwind genera de cada token su utilidad (`--color-canvas` → `bg-canvas`, `text-canvas`…; `--shadow-card` → `shadow-card`; `--ease-firma` → `ease-firma`; `--font-display` → `font-display`).
- `components.json` (shadcn/ui): estilo `new-york`, `rsc: true`, `cssVariables: true`, `css: app/globals.css`, alias `utils` → `@/lib/cn`, `ui` → `@/components/ui`.
- `cn()` (`lib/cn.ts`) es `twMerge(clsx(parts))`: une clases y, en conflicto, conserva la última de cada familia de Tailwind.
- Sin modo oscuro: `:root` declara `color-scheme: light`; no hay `prefers-color-scheme` ni variantes `dark:` en `app/` ni en `components/`.

### 11.2 Tokens de color (`@theme` de `app/globals.css`)

Contraste WCAG 2.x de cada valor contra `canvas` (`#f7f3ea`), calculado sobre los hexadecimales el 2026-10-02.

| Grupo | Token | Valor | Contraste sobre `canvas` |
|---|---|---|---|
| Marca | `--color-marca` | `#0b2d6b` | 11.84 (`canvas` sobre `marca`) |
| | `--color-marca-acento` | `#ff5a5f` | 4.29 sobre `marca` |
| | `--color-marca-canto` | `#061a42` | — |
| Papel y tinta | `--color-canvas` | `#f7f3ea` | — |
| | `--color-surface` | `#fdfbf5` | — |
| | `--color-ink` | `#171d2e` | 15.15 |
| | `--color-ink-soft` | `#555b6b` | 6.13 |
| | `--color-hairline` | `#ded6c6` | 1.30 |
| | `--color-canto` | `#cbbfa7` | 1.64 |
| Firma (`brand`) | `-50` … `-900` | `#eef1f9`, `#dbe1f1`, `#b9c4e3`, `#8f9fd0`, `#5c77bd`, `#35519c`, `#2a4180`, `#223669`, `#1b2b53`, `#16223f` | 500: 6.75 · 600: 8.75 · 700: 10.54 |
| Sello (`sello`) | `-50` … `-800` (sin 900) | `#fbeeeb`, `#f5d9d3`, `#ecb9ae`, `#d7705b` (300), `#c0472f` (400), `#b03f2b` (500), `#a63a2a` (600), `#8f3124` (700), `#74271d` (800) | 300: 2.98 (5.08 sobre `ink`) · 600: 5.82 · 700: 7.20 |
| Alerta (ocre) | `-50`, `-100`, `-500`, `-600`, `-700` | `#f9f0dc`, `#f0e0bc`, `#a8801f`, `#8c6a1f`, `#6f5318` | 500: 3.29 · 700: 6.48 |
| Válido (verde) | `-50`, `-500`, `-600`, `-700` | `#e9f0ea`, `#3d7a58`, `#2f6b4a`, `#275a3e` | 500: 4.60 · 700: 7.24 |
| Matiz de vertical | `--color-v-compras` / `-tenue` | `#a63a2a` / `#fbeeeb` | 5.82 |
| | `--color-v-congreso` / `-tenue` | `#35519c` / `#eef1f9` | 6.75 |
| | `--color-v-normativa` / `-tenue` | `#4b3f72` / `#f0edf6` | 8.42 |
| | `--color-v-nomina` / `-tenue` | `#2f6b5e` / `#e8f0ee` | 5.60 |
| | `--color-v-democracia` / `-tenue` | `#8c6a1f` / `#f9f0dc` | 4.52 |
| | `--color-v-finanzas` / `-tenue` | `#7a2f52` / `#f7eaef` | 8.05 |
| | `--color-v-dinero` / `-tenue` | `#245b74` / `#e8eff4` | 6.72 |
| Gráficos, categórica | `--color-grafico-1` … `-5` | `brand-500`, `#a0446e`, `#b97f2b`, `#018e7d`, `#6f59a6` | 6.75 · 5.35 · 3.09 · 3.67 · 5.19 |
| | `--color-grafico-otros` | `ink-soft` | 6.13 |
| Gráficos, secuencial | `--color-grafico-sec-1` … `-6` | `brand-100`, `-200`, `-300`, `-400`, `-500`, `-700` | — |
| Gráficos, divergente | `--color-grafico-div-firma`, `-firma-tenue`, `-neutro`, `-sello-tenue`, `-sello` | `brand-500`, `brand-300`, `canto`, `sello-300`, `sello-700` | — |
| Gráficos, mobiliario | `--color-grafico-rejilla`, `--color-grafico-base` | `hairline`, `canto` | — |

Cada matiz de vertical lo usa una sección de `lib/secciones.ts` (`hue.activo`, `hue.barra`, `hue.punto`, `hue.chip`): licitaciones → `v-compras`, finanzas → `v-finanzas`, congreso → `v-congreso`, normativa → `v-normativa`, nómina → `v-nomina`, dinero → `v-dinero`, democracia → `v-democracia`.

**Puente con shadcn/ui.** El final de `@theme` ata el vocabulario semántico de shadcn a los tokens anteriores, sin valores propios:

| Token shadcn | Apunta a |
|---|---|
| `--color-background` / `--color-foreground` | `canvas` / `ink` |
| `--color-card`, `--color-popover` (y sus `-foreground`) | `surface` (`ink`) |
| `--color-primary` / `-foreground` | `brand-500` / `canvas` |
| `--color-secondary`, `--color-muted` | `canvas` (texto `ink`, `ink-soft`) |
| `--color-accent` / `-foreground` | `brand-50` / `brand-700` |
| `--color-destructive` / `-foreground` | `sello-600` / `canvas` |
| `--color-border`, `--color-input` | `hairline` |
| `--color-ring` | `brand-500` |

**Estado.** El color de estado no es un token de CSS: lo fija `TONOS` en `lib/estados.ts`, cinco tonos con clase de marca (`badge`) y de punto (`dot`): `accionable` (`bg-brand-500`), `contexto` (`bg-ink-soft`), `cumplido` (`bg-valido-500`), `aviso` (`bg-alerta-500`), `anulado` (`bg-sello-600`). El mismo archivo define `ETAPAS`, `etapaDe`, `estadoMeta` y `cierreMeta` para los procesos de compras.

### 11.3 Radio, sombras y fibra

- `--radius: 0.5rem` (8 px).
- Sombras: `--shadow-soft` (`0 1px 2px 0 rgb(23 29 46 / .05), 0 1px 3px 0 rgb(23 29 46 / .05)`), `--shadow-card` (`0 1px 2px rgb(23 29 46 / .05), 0 8px 24px -14px rgb(23 29 46 / .22)`), `--shadow-pop` (`0 18px 44px -14px rgb(23 29 46 / .32), 0 6px 16px -8px rgb(23 29 46 / .16)`). En `.tsx`: `shadow-card` aparece 7 veces y `shadow-pop` 5 (contado 2026-10-02); `shadow-pop` lo llevan `components/ui/dialog.tsx` y `components/ui/drawer.tsx`, `shadow-card` `navigation-menu`, `popover` y `select`.
- `--grano` y `--grano-claro` (en `:root`): SVG en `data:` con `feTurbulence` fractal (`baseFrequency .85`, 3 octavas) en tesela de 180 px, teñido de tinta (`--grano`) o de papel (`--grano-claro`).

### 11.4 Movimiento

| Token | Valor | Dónde vive |
|---|---|---|
| `--ease-firma` | `cubic-bezier(0.4, 0, 0.2, 1)` | `@theme` (genera `ease-firma`) |
| `--ease-sello` | `cubic-bezier(0.2, 0, 0, 1)` | `@theme` |
| `--ease-salida` | `cubic-bezier(0.4, 0, 1, 1)` | `@theme` |
| `--ease-estampa` | `cubic-bezier(0.34, 1.45, 0.64, 1)` | `@theme` |
| `--default-transition-duration` / `-timing-function` | `150ms` / la curva de firma | `@theme`: lo heredan las utilidades `transition-*` sin curva ni duración propias |
| `--dur-toque` | `90ms` | `:root` |
| `--dur-breve` | `150ms` | `:root` |
| `--dur-media` | `220ms` | `:root` |
| `--dur-hoja` | `280ms` | `:root` |
| `--dur-trazo` | `700ms` | `:root` (ningún `.tsx` ni otra regla de la hoja lo usa) |

Animaciones definidas en la hoja (todas con prefijo `lr-`):

| Clase o selector | Animación | Curva y duración |
|---|---|---|
| `.capa[data-state="open"]` / `"closed"` | `lr-capa-entra` (opacidad, −4 px, escala 0.985) / `lr-capa-sale` | `--dur-breve` + `sello` / `--dur-toque` + `salida` |
| `.velo[data-state=…]` | `lr-velo-entra` / `lr-velo-sale` (opacidad) | `--dur-media` + `firma` / `--dur-breve` + `salida` |
| `[data-vaul-drawer]…[data-state]` | fotogramas de `vaul` | abre `--dur-hoja` + `sello`, cierra `--dur-media` + `salida`; transiciones `--dur-media` + `sello` con `!important` |
| `[data-slot="collapsible-content"]` | `lr-pliegue-abre` / `lr-pliegue-cierra` sobre `--radix-collapsible-content-height` | `--dur-media` + `sello` / `--dur-breve` + `salida` |
| `.estampa` | `lr-estampa` (escala 1.45, −12°) | `--dur-hoja` + `estampa`; la aplica `components/seguir-button.tsx` al icono cuando el lector acaba de seguir |
| `.bar-grow` / `.columna-grow` | `lr-bar` (`scaleX`) / `lr-columna` (`scaleY`) | solo bajo `@supports (animation-timeline: view())`, `animation-range: entry 0% entry 80%`; sin soporte, quietas |
| `.cabecera`, `.cabecera-marca` | `lr-cabecera-asienta` (canto a 3 px) / `lr-marca-asienta` (escala 0.88) | `animation-timeline: scroll(root)`, rango 0–96 px, bajo `@supports` |
| `.shimmer::after` | `lr-shimmer` | 1.5 s, infinita |
| `.live-dot::before` | `lr-ping` | 1.8 s + `sello`, infinita |

En `.tsx` se usan `duration-(--dur-toque)` (4 veces), `duration-(--dur-breve)` y `duration-(--dur-media)` (1 cada una), `ease-firma` (5), `ease-sello` (2) y `ease-salida` (1); ninguna `duration-N` numérica (contado 2026-10-02). `:root` declara `interpolate-size: allow-keywords`.

### 11.5 Capa base y utilidades propias

Capa `base`:

- `html`: `scroll-behavior: smooth`, `scroll-padding-top: 7rem`, `text-rendering: optimizeLegibility`.
- `body`: fondo `canvas`, texto `ink`, `font-sans`, suavizado de fuente, `overflow-x: hidden`.
- `h1:not(.font-sans)`, `h2:not(.font-sans)`: `font-display`, peso 600, interletra −0.025em (también `.font-display`); `h1, h2`: `text-wrap: balance`; `h3` y `[data-slot="card-title"]`: interletra −0.01em; `p, li, dd`: `text-wrap: pretty`.
- `a, button, input, select, textarea, label, summary, [role="button"]`: `touch-action: manipulation`; bajo `@media (hover: none)`, `a` y `button` con `-webkit-touch-callout: none`.
- `::selection` (sello al 18 % sobre blanco, texto `#3d140d`); `:focus-visible` (contorno 2 px `brand-500`, separación 2 px, radio 6 px); barra de desplazamiento fina `#cabfa9`.

Utilidades y componentes de la hoja:

| Selector | Qué pinta |
|---|---|
| `.rotulo` | Plex Mono, 0.6875rem (11 px), 600, interletra 0.16em, mayúsculas |
| `.punto-sello` | color `sello-600` (ningún `.tsx` la usa; el punto de `Rotulo` lleva `bg-sello-600`) |
| `.relieve`, `a[data-slot="card"]`, `[data-slot="card"].relative:has(.estira)` | fibra `--grano`, luz de 1 px arriba (`--luz`), canto de 2 px abajo (`--canto`); con puntero fino al apuntar sube 1 px y el canto crece a 3 px; `:active` baja 2 px con sombra interior en `--dur-toque`; `:disabled` sin relieve |
| `.relieve[aria-current="page"]`, `[aria-pressed="true"]`, `[data-state="on"]`, `[data-slot="toggle-group-item"][data-state="on"]` | hundido: sin canto, sombra interior, desplazado 2 px |
| `[data-slot="toggle-group"]` | bandeja con sombra interior |
| `.relative:has(.estira)` que no es `Card` | fila: tinte `brand-50` al 60 % al apuntar, `brand-50` con sombra interior al pulsar o con `.estira[aria-pressed="true"]` |
| `.cabecera` | fondo `marca` + `--grano-claro`, luz de 1 px y canto de 2 px en `marca-canto` |
| `.cabecera-puerta::after` | raya que se dibuja en `scaleX` al apuntar (opacidad 0.45) y entera con `data-activo="true"` o `data-state="open"`; el `svg` hijo gira con la misma curva |
| `@utility estira` | `::after` absoluto con `inset: 0` sobre el contenedor `relative`; el anillo de foco se dibuja en el `::after` (2 px `brand-500`, `outline-offset: -2px`) |
| `.app-grid-dark` | rejilla de 42 px con `linear-gradient` al 7 % y máscara radial (la usa `components/portada.tsx`) |
| `.shimmer` | fondo `surface` con barrido `linear-gradient` (la usan `components/ui/skeleton.tsx` y `components/esqueleto.tsx`) |
| `.cv-auto` | `content-visibility: auto`, `contain-intrinsic-size: auto var(--cv-alto, 7rem)` |
| `.no-scrollbar` | oculta la barra de desplazamiento |
| `[data-oferta-instalar] .boton-subir` | `display: none` |

El bloque `@media (prefers-reduced-motion: reduce)` del final de la hoja: `scroll-behavior: auto`; `animation: none` en `.shimmer::after`, `.live-dot::before`, `.cabecera`, `.cabecera-marca`, `.bar-grow`, `.columna-grow`, `.capa[data-state]`, `.velo[data-state]`, `.estampa` y el contenido de `Collapsible`; `animation` y `transition` a `none !important` en `[data-vaul-drawer]` y `[data-vaul-overlay]`; `transform: none !important` y `transition-duration: 0ms !important` en `.relieve`, `a[data-slot="card"]` y `[data-slot="card"]`; sin transición en `.cabecera-puerta`.

### 11.6 Tipografía

`app/layout.tsx` carga cuatro familias con `next/font/google` (subconjunto `latin`, `display: "swap"`), las expone como variables CSS en `<html>` y `@theme` las asigna:

| Familia | Variable de `next/font` | Pesos cargados | Token / utilidad | Uso en el código |
|---|---|---|---|---|
| Public Sans | `--font-public-sans` | variable | `--font-sans` / `font-sans` | `body` |
| Geist | `--font-geist` | variable | `--font-display` / `font-display` | `h1`, `h2` sin `font-sans`, `.font-display` |
| IBM Plex Mono | `--font-plex-mono` | 400, 500, 600 | `--font-mono` / `font-mono` | `.rotulo`, cifras de `Cifra`, aro de `Sello` |
| Instrument Serif | `--font-instrument-serif` | 400 | `--font-marca` / `font-marca` | `Logotipo`, la «s» de `SelloCompacto` |

Cada token lleva su pila de respaldo de sistema (`ui-sans-serif, system-ui…`, `Georgia…`, `ui-monospace…`).

### 11.7 La marca

`components/marca.tsx` exporta tres piezas SVG o de texto:

- `Sello` — circular de 200×200 con tres aros, el texto en `textPath` «SOCRÁTICO · PREGÚNTALE AL ESTADO · REPÚBLICA DOMINICANA ·» (omisible con `conAro={false}`) y la «¿» con su punto en `#a63a2a` o, sobre trazo de papel, `#ff5a5f`; `role="img"`, `aria-label="Socrático"`. La usa el pie de `app/layout.tsx`.
- `SelloCompacto` — placa de 96×96 (`rx="21"`, fondo `#0b2d6b`) con la «s» en Instrument Serif y el acento como rectángulo girado 38°; `role="img"`, `aria-label="Socrático"`. La usa `components/install-prompt.tsx`.
- `Logotipo` — la palabra «socrático» en `font-marca` con `translate="no"`, el texto accesible «Socrático» en `sr-only` y el acento de la «á» como `span` girado 38° en `bg-marca-acento`. La usan la cabecera (26/30 px, clase `cabecera-marca`) y la placa azul del pie.

`app/icon.svg` es la misma placa de `SelloCompacto` en SVG estático (con `Georgia` como fuente). `app/manifest.ts` declara `background_color` `#f7f3ea`, `theme_color` `#0b2d6b`, `lang` `es-DO`, `display: standalone`, `orientation: any`, `id: "/"`, el icono `/icon.svg` y tres accesos directos tomados de `SECCIONES` (licitaciones, congreso, democracia). El `viewport` de `app/layout.tsx` declara `themeColor: "#0b2d6b"`, `viewportFit: "cover"` y no fija `maximumScale` ni `userScalable`.

### 11.8 `components/ui/` — shadcn/ui

22 archivos, código del repositorio sobre Radix, `class-variance-authority` y `cn`:

| Archivo | Exporta | Base |
|---|---|---|
| `alert.tsx` | `Alert`, `AlertTitle`, `AlertDescription`, `alertVariants` | — |
| `badge.tsx` | `Badge`, `badgeVariants` — `forma`: `sello` (`.rotulo`, radio 3 px) · `etiqueta` (`rounded-md`, `text-xs`); `variant`: `neutro`, `firma`, `sello`, `alerta`, `valido`, `contorno` | `@radix-ui/react-slot` |
| `breadcrumb.tsx` | `Breadcrumb`, `BreadcrumbList`, `BreadcrumbItem`, `BreadcrumbLink`, `BreadcrumbPage`, `BreadcrumbSeparator` | `@radix-ui/react-slot` |
| `button.tsx` | `Button`, `buttonVariants` — `variant`: `default` (relieve, `brand-500`), `secondary` (relieve, `surface`), `outline` (relieve, filete), `ghost`, `link`, `tinta` (sobre la cabecera), `destructive` (relieve, `sello-600`); `size`: `sm` (`h-9`), `default` (`h-11`, `sm:h-10`), `lg` (`h-12`, `sm:h-11`), `icon` (`h-11 w-11`, `sm:h-10 sm:w-10`), `icon-sm` (`h-9 w-9`); `asChild` | `@radix-ui/react-slot` |
| `card.tsx` | `Card` (`data-slot="card"`, `asChild`), `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` | `@radix-ui/react-slot` |
| `checkbox.tsx` | `Checkbox` | `@radix-ui/react-checkbox` |
| `collapsible.tsx` | `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` | `@radix-ui/react-collapsible` |
| `command.tsx` | `Command`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandSeparator`, `CommandShortcut` | `cmdk` |
| `dialog.tsx` | `Dialog`, `DialogTrigger`, `DialogContent`, `DialogOverlay`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogClose` (`.capa`, `.velo`, `shadow-pop`) | `@radix-ui/react-dialog` |
| `drawer.tsx` | `Drawer`, `DrawerTrigger`, `DrawerContent`, `DrawerOverlay`, `DrawerHeader`, `DrawerBody`, `DrawerFooter`, `DrawerTitle`, `DrawerDescription`, `DrawerClose` (`.capa`, `.velo`, `shadow-pop`) | `vaul` |
| `error-campo.tsx` | `ErrorCampo` — `<p aria-live="polite">` en `alerta-700`, `sr-only` cuando está vacío (pieza de la casa) | — |
| `input.tsx` | `Input` — `h-11`/`sm:h-10`, `text-base`/`sm:text-sm` | — |
| `label.tsx` | `Label` | `@radix-ui/react-label` |
| `navigation-menu.tsx` | `NavigationMenu`, `NavigationMenuList`, `NavigationMenuItem`, `NavigationMenuTrigger`, `NavigationMenuContent`, `NavigationMenuLink`, `NavigationMenuViewport`, `navigationMenuDisparador` (`.capa`, `.cabecera-puerta`, viewport `absolute inset-x-0 top-full`) | `@radix-ui/react-navigation-menu` |
| `popover.tsx` | `Popover`, `PopoverTrigger`, `PopoverAnchor`, `PopoverContent` (`.capa`) | `@radix-ui/react-popover` |
| `progress.tsx` | `Progress` — componente de servidor, sin Radix; barra con `.bar-grow` | — |
| `select.tsx` | `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectGroup`, `SelectLabel`, `SelectItem` (prop `ayuda`: línea explicativa bajo la opción), `SelectSeparator` (`.capa`, `.velo`) | `@radix-ui/react-select` |
| `skeleton.tsx` | `Skeleton` — `div` `aria-hidden` con `.shimmer rounded-md` | — |
| `table.tsx` | `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableHead`, `TableCell`, `TableCaption` | — |
| `tabs.tsx` | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | `@radix-ui/react-tabs` |
| `textarea.tsx` | `Textarea` | — |
| `toggle-group.tsx` | `ToggleGroup`, `ToggleGroupItem` | `@radix-ui/react-toggle-group` |

### 11.9 Primitivas de la casa

`components/` tiene 40 `.tsx` y 3 `.ts` en su raíz, y ocho subdirectorios: `ui/` (22), `graficos/` (13), `espacios/` (26, §10), `fuentes-nuevas/` (23 paneles de datos), `congreso/` (4: `cruces`, `dossier`, `instituciones-nombradas`, `votaciones`), `dinero/` (3: `escalera-tasas`, `reparto-tenedores`, `formato.ts`), `nomina/` (2: `explorer`, `data-table`) y `democracia/` (1: `voto-widget`).

Raíz de `components/`:

| Archivo | Exporta | Qué hace |
|---|---|---|
| `papel.tsx` | `Rotulo`, `Cifra`, `TiraDeCifras` | Epígrafe `.rotulo` con punto `bg-sello-600`; una cifra en mono con su etiqueta y la línea de ancla de `textoAncla()` (`lib/cifras.ts`); la tira de cifras. Lo importan 46 archivos |
| `portada.tsx` | `Portada`, `PortadaCifras`, `PortadaCifra` | Banda de tinta con `.app-grid-dark`, epígrafe con punto de sello y titular en Geist |
| `estado-vacio.tsx` | `EstadoVacio` | `variante="vacio"` o `"caida"` (esta en `alerta-700`), `titulo`, `accion`, `rotulo`, `como` (`p`/`h1`/`h2`). La importan 60 archivos, entre ellos `app/error.tsx` |
| `marca-estado.tsx` | `MarcaEstado` | La marca de estado de un expediente sobre `TONOS` de `lib/estados.ts` |
| `campo-busqueda.tsx` | `CampoBusqueda` | Campo de búsqueda con la línea de alcance debajo y `error` por `ErrorCampo` |
| `buscador-url.tsx` | `BuscadorUrl` | Campo cuyo estado es `?q=` (nuqs, `history: "push"`, `shallow: false`); lo usan 20 páginas que filtran en el servidor |
| `campo-licitaciones.tsx` | `CampoLicitaciones` | Campo de `/licitaciones` con filtros rápidos, búsquedas recientes (`lib/recientes.ts`) y guardadas (`lib/busquedas.ts`) |
| `licitaciones-url.ts` | `FILTROS` | Parsers de nuqs de los filtros de `/licitaciones` |
| `nav-filtros.tsx` | `NavFiltros`, `FiltroEnlace` | Fila de filtros que son enlaces, vestidos con `Button asChild` |
| `barra-filtros.tsx` | `BarraFiltros`, `ChipFiltro` | Panel de filtros-enlace en pantalla ancha; en el teléfono, botón «Filtros (n)» que abre `BottomSheet` y chips de lo puesto |
| `filtros-plegados.tsx` | `FiltrosPlegados` | Fila de filtros plegada cuyo último mando dice cuántos quedan |
| `bottom-sheet.tsx` | `BottomSheet` | Hoja inferior sobre `ui/drawer` |
| `plegable.tsx` | `Plegable` | Revelación progresiva sobre `ui/collapsible` con el recuento en el botón |
| `paginador.tsx` | `Paginador` | Anterior · página · siguiente, con `href` (enlaces) u `onPage` (estado) |
| `ruta.tsx` | `Ruta` | Miga de pan de una ficha sobre `ui/breadcrumb`; si `rutaAnterior()` es el `href` de la vuelta, vuelve con `router.back()` |
| `rastro.tsx` | `Rastro`, `rutaAnterior` | Guarda en memoria del módulo el `pathname` anterior de la visita; no pinta nada |
| `antiguedad.tsx` | `Antiguedad` | `<time>` con `hace()` y la fecha exacta en `title` |
| `resaltado.tsx` | `Resaltado` | Marca en negrita las palabras buscadas por raíz (`lib/raiz.ts`) |
| `termino.tsx` | `Termino` | Término subrayado con puntos que abre un `ui/popover` con la entrada de `lib/glosario.ts` (`GLOSARIO`, 90 entradas) |
| `texto-enlazado.tsx` | `TextoEnlazado` | Texto oficial con sus menciones (norma, institución, proceso, obra) convertidas en enlaces |
| `esqueleto.tsx` | `Esqueleto`, `EsqueletoLineas`, `EsqueletoFilas`, `EsqueletoTarjetas`, `Cargando`, `EsqueletoPagina`, `EsqueletoListado`, `EsqueletoFicha` | Siluetas de carga compuestas con `Skeleton` |
| `paleta.tsx` | `Paleta` | «Buscar» de la cabecera: `ui/dialog` + `ui/command`; se abre con el botón, ⌘K / Ctrl K y «/» fuera de un campo; lista `porTarea()` de `lib/indice.ts`, sugiere hasta 6 resultados de `/api/buscar` por TanStack Query y ofrece lo tecleado a cada destino de `BUSQUEDAS` con su alcance |
| `megamenu.tsx` | `Megamenu` | Menú de escritorio (`hidden lg:flex`) sobre `ui/navigation-menu` |
| `section-bar.tsx` | `SectionBar` | Barra de sección de la vertical actual (§11.15) |
| `mobile-tab-bar.tsx` | `MobileTabBar`, `subirArriba`, `subeConLaPestana` | Barra inferior del teléfono (§11.15) |
| `scroll-top.tsx` | `ScrollTop` | Botón «volver arriba» tras tres pantallas (clase `boton-subir`) |
| `install-prompt.tsx` | `InstallPrompt` | Aviso de instalación sobre `beforeinstallprompt`; marca la raíz con `data-oferta-instalar` |
| `consultas.tsx` | `ProveedorConsultas` (default) | Cliente de TanStack Query (§11.13) |
| `acciones-ficha.tsx` | `AccionesFicha` | Seguir, compartir, copiar enlace y RSS de una ficha |
| `acciones-proceso.tsx` | `AccionesProceso` | Barra fija de un proceso en el teléfono; marca la raíz con `data-barra-acciones` |
| `compartir.tsx` | `Compartir`, `CopiarEnlace`, `CopiarTexto`, `compartirEnlace`, `textoCompartir` | Compartir y copiar con un texto según el tipo de ficha |
| `seguir-button.tsx` | `SeguirButton` | Seguir o dejar de seguir sobre `lib/seguimiento.ts`, con `.estampa` |
| `proceso-card.tsx` | `ProcesoCard` | Tarjeta de un proceso de compras (`.cv-auto`) |
| `iniciativa-card.tsx` | `IniciativaCard`, `MarcaIniciativa`, `CondicionBadge` | Fila de una iniciativa legislativa (`.cv-auto`) |
| `conectado-con.tsx` | `ConectadoCon`, `Arista` | Aristas del grafo vistas desde una ficha |
| `en-el-grafo.tsx` | `EnElGrafo`, `alternasRdf` | Pie de ficha de nodo: JSON-LD schema.org en `<script type="application/ld+json">` y enlaces a su red y su RDF (§7); lo usan seis fichas |
| `visor-documento.tsx` | `VisorDocumento` (default) | Vista previa de un documento oficial con su peso; carga `LectorPdf` bajo demanda |
| `lector-pdf.tsx` | `LectorPdf` (default) | Rasteriza el PDF en `canvas` con pdf.js (§11.13) |
| `otras-guias.tsx` | `GUIAS`, `OtrasGuias` | Las guías de la plataforma, al pie de cada guía |
| `rebotado.ts` | `useRebotado` | El valor tras `ms` sin cambiar (0 = inmediato) |
| `teclas.ts` | `enviarConEnter`, `enviarConModificador` | Envío de formularios por teclado (⌘/Ctrl+Enter en `textarea`) |

Módulos de `lib/` que sirven a la interfaz: `lib/estados.ts` (§11.2), `lib/cifras.ts` (`Alcance` = `registro` | `muestra` | `instantanea`, `Ancla`, `textoAncla`, `comparable`, `variacion`, `puntos`), `lib/glosario.ts` (`GLOSARIO`, `glosa`, `entradaGlosario`) y `lib/format.ts` (§11.12).

### 11.10 Iconos

`components/icons.tsx` exporta 44 iconos `Icon*` en SVG en línea (`IconSearch` … `IconVoto`). 43 pasan por la función interna `Svg`: `viewBox` 24×24, 20×20 por defecto, `stroke="currentColor"`, `strokeWidth` 1.8, extremos redondeados, `fill="none"`, `aria-hidden="true"`; tamaño y color los ponen las clases del sitio de uso. `IconGoogle` es la excepción: relleno en los cuatro colores de Google. El paquete no depende de `lucide-react` ni de otra biblioteca de iconos.

### 11.11 Gráficos — `components/graficos/`

Trece archivos; `index.ts` reexporta todo. Solo `lectura-serie.tsx` lleva `"use client"`; los demás se pintan en el servidor y `components/nomina/explorer.tsx` (cliente) los importa igual.

| Primitiva | Archivo | Qué pinta | Dónde se usa (2026-10-02) |
|---|---|---|---|
| `BarrasHorizontales`, `FilaBarra`, `MarcaBarra` | `barras-horizontales.tsx` | Ranking: nombre arriba, cifra en mono a la derecha, barra de 8 px con `.bar-grow`; props `maximo`, `actual`, `parte`, `alElegir`, `href` por fila | `/contratos`, `/dinero/bonos`, `/dinero/tasas`, `/estadisticas`, `/finanzas`, `/finanzas/[capitulo]`, `/instituciones/[id]`, `/nomina/general`, `/normativa`, `/proveedores/[rpe]`, `/provincias`, `components/dinero/*`, explorador de nómina; `FilaBarra` en `/pais` y `/proveedores`; `MarcaBarra` en `/finanzas` |
| `SerieTemporal` | `serie-temporal.tsx` | Serie en el tiempo, `forma` `columnas` o `linea`, un solo eje, máximo rotulado, `.columna-grow` | `/deuda`, `/dinero/banco-central`, `/dinero/bonos`, `/dinero/tasas`, `/funcionarios/[slug]/decretos`, `/historico`, `/pais`, `historia-compras`, `inflacion-turismo`, `subsidio-electrico`, explorador de nómina |
| `LecturaSerie` | `lectura-serie.tsx` | Capa de cliente de `SerieTemporal`: guía vertical, valor, flechas, enlace de 44 px al tocar | dentro de `SerieTemporal` |
| `BarraApilada` | `barra-apilada.tsx` | Reparto al 100 % con 2 px de separación y mínimo de 3 px por segmento | `/estadisticas`, `components/congreso/votaciones.tsx`, `components/dinero/reparto-tenedores.tsx` |
| `MatrizMensual` | `matriz-mensual.tsx` | Mes × año en la escala secuencial; mes sin dato = hueco con filete | `components/fuentes-nuevas/inflacion-turismo.tsx` |
| `Multiples`, `maximoComun` | `multiples.tsx` | Paneles con escala común | `/dinero/bonos`, `/dinero/tasas`, explorador de nómina |
| `Leyenda`, `EscalaSecuencial` | `leyenda.tsx` | Leyenda con muestra y texto en tinta; escala de seis pasos | `Leyenda` en `/finanzas/[capitulo]`; `EscalaSecuencial` solo dentro de `components/graficos/` |
| `VerComoTabla` | `ver-como-tabla.tsx` | Tabla equivalente plegada con el número de filas en el botón | `inflacion-turismo.tsx` |
| `MapaProvincias` | `mapa-provincias.tsx` | Coropleta SVG sobre los límites de la ONE (`lib/mapa.ts`), tramos por cuantiles en los pasos 3–6 de la secuencial, cada provincia enlazada | `/obras`, `/provincias`, `/provincias/[slug]` |
| `RedVecinos` | `red-vecinos.tsx` | Nodo y vecinos en dos columnas, SVG `aria-hidden`, `hidden lg:block` | `/grafo` |

`paleta.ts` exporta las paletas como clases literales: `CATEGORICA` (cinco `{bg, fill, stroke}` de `grafico-1`…`-5`), `OTROS` (`grafico-otros`), `SERIE` (= `CATEGORICA[0]`), `CONTEXTO` (`grafico-sec-2`), `SECUENCIAL` y `SECUENCIAL_RELLENO` (seis pasos `bg-`/`fill-grafico-sec-*`), `DIVERGENTE` (`firma`, `firmaTenue`, `neutro`, `selloTenue`, `sello`) y `ORDEN_TONOS` (`contexto`, `aviso`, `anulado`, `accionable`, `cumplido`: orden de apilado de los estados). `formato.ts` exporta `FormatoValor` (`entero` | `pesos` | `usd-millones` | `porciento` | `decimal`) y `formatearValor`, que delega en `formatPesos`, `formatMagnitud` e `Intl.NumberFormat("es-DO")`.

### 11.12 Formato — `lib/format.ts`

| Exporta | Qué devuelve |
|---|---|
| `SIN_DATO` | `"sin dato"` |
| `formatMonto(monto, divisa)` | Moneda con `Intl.NumberFormat("es-DO")`, sin decimales |
| `formatFecha(iso, conHora?)` | Fecha `dateStyle: "medium"`; un valor sin offset se formatea en UTC tal cual, uno con `Z`/offset en `America/Santo_Domingo` |
| `MESES`, `MESES_CORTOS`, `numeroMes`, `mayuscula`, `formatMes` | Nombres de mes desde `Intl` (`MESES_CORTOS` = tres letras); `numeroMes` lee el mes de la primera palabra de un texto; `formatMes("2026-08")` → «ago 2026» |
| `diasHasta(iso)` | Días enteros hasta una fecha (negativo si pasó) |
| `hace(valor)` | «hoy», «ayer», «hace N días/meses/años», contado en días de calendario de `America/Santo_Domingo` |
| `formatPesos(pesos)` | `RD$ x billones` (≥1e12), `mil millones` (≥1e9), `millones` (≥1e6) o `formatMonto` |
| `formatMagnitud(millonesUSD)` | `US$ x mil millones` o `US$ x millones` |
| `nombrePropio`, `tituloLegible` | Texto en mayúsculas (más del 60 % de letras) a tipo título o a letra de frase, conservando las siglas de `SIGLAS`, los romanos y los códigos con cifras |

`components/dinero/formato.ts` añade `decimal`, `porciento`, `enPuntos`, `pesosDeMillones` y `parte` para la vertical Dinero, sobre `lib/format.ts`.

### 11.13 Bibliotecas de cliente

| Biblioteca | Versión en `package.json` | Dónde |
|---|---|---|
| `nuqs` | `^2.10.1` | `NuqsAdapter` envuelve el `<body>` en `app/layout.tsx`; `useQueryStates` en `app/buscador.tsx` y `components/campo-licitaciones.tsx` (mapa común `components/licitaciones-url.ts`), `components/nomina/explorer.tsx` y `components/buscador-url.tsx` |
| `@tanstack/react-query` | `^5.104.0` | `ProveedorConsultas` (`components/consultas.tsx`) envuelve el cuerpo: `staleTime` 60 s, `retry: 0`, `refetchOnWindowFocus: false`; claves y lectores en `lib/consultas.ts` (`claves.unidades`, `procesos`, `buscar`, `seguimiento`, `nomina`; `leerJson`, `buscarEnPlataforma`). Lo usan `app/buscador.tsx`, `app/seguimiento/page.tsx`, `components/paleta.tsx`, `components/nomina/explorer.tsx` y `components/espacios/mesa-proyecto.tsx`; `placeholderData: keepPreviousData` en `app/buscador.tsx` y `mesa-proyecto.tsx` |
| `@tanstack/react-query-devtools` | `^5.104.0` (devDependency) | `ReactQueryDevtools` en `components/consultas.tsx` |
| `@tanstack/react-virtual` | `^3.14.13` | `components/nomina/data-table.tsx` (`useVirtualizer` con `measureElement`); el orden lo hace `components/nomina/explorer.tsx` con `Array.prototype.sort` |
| `@tanstack/react-table` | `^8.21.3` | `components/espacios/evidencia.tsx` (`useReactTable`, `getSortedRowModel`, `getFilteredRowModel`), pintada con `ui/table` |
| `cmdk` | `^1.1.1` | `components/ui/command.tsx`, bajo `components/paleta.tsx` |
| `vaul` | `^1.1.2` | `components/ui/drawer.tsx`, bajo `components/bottom-sheet.tsx` (que usan `app/buscador.tsx` y `components/barra-filtros.tsx`) y la hoja «Más» de `components/mobile-tab-bar.tsx`; su movimiento lo reemplaza `app/globals.css` (§11.4) |
| `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-mention`, `@tiptap/suggestion`, `@tiptap/core`, `@tiptap/pm` | `^3.31.3` | `components/espacios/narracion.tsx`, cargado con `next/dynamic` por `components/espacios/caso.tsx`; la lectura sin editor es `narrativa-lectura.tsx` |
| `@xyflow/react` | `^12.12.0` | `components/espacios/tablero.tsx`, cargado con `next/dynamic` por `tablero-diferido.tsx`, que importan `components/espacios/caso.tsx` y `app/p/[slug]/page.tsx` |
| `pdfjs-dist` | `^6.3.289` | `components/lector-pdf.tsx` importa en el navegador `pdfjs-dist/legacy/build/pdf.mjs` con el worker `pdf.worker.min.mjs` (`disableAutoFetch: true`); `components/visor-documento.tsx` lo carga con `dynamic(..., { ssr: false })`; lo usan `app/procesos/[codigo]/page.tsx`, `app/congreso/senado/[cuatrienio]/[id]/page.tsx` y `app/normativa/[tipo]/[numero]/page.tsx`. Los bytes llegan por `/api/documento` (§4) |

### 11.14 Estado de cliente

Todo el estado del lector fuera de Supabase vive en su navegador:

| Clave | Almacén | Módulo | Contenido |
|---|---|---|---|
| `lrd:seguimiento` | `localStorage` | `lib/seguimiento.ts` | Lista de `Seguido` `{tipo, id, titulo, href, huella?, desde?, visto?}`; `tipo` ∈ `TIPOS_SEGUIDO`: `proceso`, `proyecto`, `expediente-senado`, `proveedor`, `institucion`, `norma`, `funcionario`, `entidad-financiera`, `empresa`. Una lista de cadenas sueltas se lee como procesos (`normalizar`) |
| `lrd:busquedas` | `localStorage` | `lib/busquedas.ts` | Búsquedas guardadas de licitaciones (querystring crudo), máximo 16 |
| `lrd:recientes` | `localStorage` | `lib/recientes.ts` | Términos recientes, máximo 6 |
| `lrd:install-dismissed` | `localStorage` | `components/install-prompt.tsx` | Aviso de instalación descartado |
| `lrd:seguimiento-cuenta:<id>` | `localStorage` | `lib/espacios-cliente.ts` | Última lista común entre la cuenta y el navegador (§10) |
| `gobiername-democracia-auth` | `localStorage` | `lib/supabase.ts` (`storageKey`), leído por `components/espacios/presencia.ts` | Sesión de Supabase (§10) |
| `socratico-cuenta-unica-flujo` | `localStorage` | `app/democracia/cuenta-unica/cliente.ts` | Flujo de Cuenta Única en curso (§10) |
| `socratico-entrada-google` | `sessionStorage` | `lib/sesion.ts` | Marca de entrada con Google (§10) |

Mecánica de `lib/seguimiento.ts`: el módulo no lleva `"use client"`; `huellaDe()` escribe el estado como frase y la usan `components/acciones-ficha.tsx`, `app/procesos/[codigo]/page.tsx`, `app/api/seguimiento/route.ts`, `app/seguimiento/page.tsx` y `lib/congreso.ts`. `/seguimiento` pide el estado de hoy de los tipos de `TIPOS_CON_ESTADO` (`proceso`, `proyecto`, `expediente-senado`), enseña antes/después y luego llama a `marcarVistos`. Cada escritura emite el evento `lrd:seguimiento-cambio`; `onSeguimientoCambio` escucha ese evento y `storage`. `getSeguimiento`/`toggleSeguimiento` dan la lista de códigos de proceso a `proceso-card.tsx` y `section-bar.tsx`; `reemplazarSeguidos` pone la lista que trae la cuenta. `components/rastro.tsx` guarda la ruta anterior solo en memoria del módulo.

### 11.15 Navegación e indexación

**Fuentes de la navegación.**

- `lib/secciones.ts` — `SECCIONES`: siete verticales (`licitaciones`, `finanzas`, `congreso`, `normativa`, `nomina`, `dinero`, `democracia`), cada una con `nombre`, `pregunta`, `href`, `descriptor`, `rutas` (prefijos), `vistas`, `sinVista?` y `hue`; `seccionDe(pathname)`, `vistaActiva`, `vistaActivaDe`. `BUSQUEDAS`: 16 destinos que reciben `?q=`, cada uno con su `alcance` en llano.
- `lib/menu.ts` — `MENU`: tres grupos (`dinero` «Dinero público», `leyes` «Leyes», `estado` «El Estado»), diez columnas y 54 enlaces de columna, cada uno con `href`, `label`, `nota` y `tarea`; un `destacado` por grupo (`/instituciones`, `/congreso`, `/buscar`). `puntoDe` y `grupoActivo`.
- `lib/tareas.ts` — seis tareas (`vigilar`, `buscar`, `comparar`, `leer`, `participar`, `entender`) con `etiqueta`, `nota` y `claves`; `ORDEN_TAREAS`.
- `lib/indice.ts` — `INDICE`: cada destino una vez, derivado de `MENU` (55 destinos: los 54 de columna más `/buscar`), con `grupo`, `tema`, `seccion` y `punto`; `porTarea()`; `FUERA_DEL_INDICE`: seis páginas con su motivo (`/democracia/registro`, `/democracia/cuenta-unica/callback`, `/cuenta`, `/espacio/proyecto`, `/espacio/moderar`, `/grafo/camino`). Las 61 páginas estáticas de `app/` son los 55 destinos más esas seis (contado 2026-10-02).

**Cromo** (`app/layout.tsx`):

- Enlace «Saltar al contenido» → `#contenido`.
- `<header class="cabecera sticky top-0 z-50">`: `Logotipo` enlazado a `/`, la leyenda «Pregúntale al Estado» desde `xl`, `Megamenu`, `Paleta` y `PuertaCuenta` (§10).
- `Megamenu`: desde `lg`; un disparador por grupo de `MENU` (panel con columnas, notas y la tarjeta del destacado; `data-activo` por `grupoActivo`) y un cuarto enlace «Comunidad» sin panel.
- `SectionBar`: dentro de una vertical (`seccionDe`), nombre con punto de matiz y pestañas de sus vistas; la vista con `seguimiento` lleva el recuento de procesos seguidos; la activa se centra al montar.
- `<main id="contenido" tabIndex={-1} class="mx-auto max-w-6xl px-4 py-6">`.
- `MobileTabBar` (`fixed bottom-0`, `lg:hidden`, `aria-label="Navegación principal"`): «Inicio», las vistas raíz de licitaciones, congreso y nómina (`FIJAS`) y «Más», un `Drawer` con todo `MENU`. Tocar la pestaña de la ruta actual sube al principio (`subirArriba`).
- `ScrollTop`, `Rastro`, `InstallPrompt`, `SincronizarCuenta`.
- Pie: placa `bg-marca` con `Sello` y `Logotipo`; un `<nav>` por sección de `SECCIONES` con sus vistas (columnas 2/3/5); tarjeta «Seguridad y cumplimiento» (Ley 172-13, Ley 200-04, NORTIC · OGTIC); `<nav aria-label="Pie de página">` con Inicio, Mi seguimiento, Seguridad y Estado de las fuentes.
- `body` reserva `pb-[calc(4.5rem+env(safe-area-inset-bottom))]` bajo `lg` para la barra inferior.

**Metadatos.** `app/layout.tsx`: `metadataBase` = `SITIO` (`lib/sitio.ts`: `https://socratico.vercel.app`, constante), `title.default` «Socrático · Preguntarle al Estado con sus propios datos», `title.template` `%s · Socrático`, `description`, `openGraph` (`locale: es_DO`, `siteName: Socrático`), `appleWebApp`. 70 de los 77 `page.tsx` declaran `alternates.canonical`; los siete sin canónica son `/grafo/camino`, `/democracia/registro`, `/democracia/cuenta-unica/callback`, `/espacio`, `/espacio/proyecto`, `/espacio/moderar` y `/seguimiento`.

**Fuera del índice de buscadores** (`robots: { index: false … }`): siempre `/buscar` (follow), `/cuenta`, `/democracia/registro`, `/democracia/cuenta-unica/callback`, `/espacio`, `/espacio/proyecto`, `/espacio/moderar`, `/grafo/camino`, `/p/[slug]` (nofollow), `/seguimiento` (en `app/seguimiento/layout.tsx`) y `app/not-found.tsx`; según el contenido: `/audiencias` e `/inmobiliario` con `?q=` (nofollow), `/grafo` con un nodo, `/empresas/[rnc]` inexistente, `/funcionarios/[slug]` sin PEP vigente, `/normativa/[tipo]/[numero]` sin texto y `/proveedores/[rpe]` de persona física. `app/robots.ts` y `app/sitemap.ts` se describen en §3; el sitemap toma `INDICE` y las vistas de `SECCIONES` menos `/buscar` y `/seguimiento`.

**Páginas de error.** `app/error.tsx` pinta `EstadoVacio variante="caida"` («La fuente no respondió») con «Reintentar» (`reset`) y enlace a `/fuentes`; `app/not-found.tsx` (con `robots` sin indexar) ofrece la búsqueda de toda la plataforma y las entradas destacadas del menú; `app/procesos/[codigo]/not-found.tsx` enlaza a `/licitaciones` y `app/empresas/[rnc]/not-found.tsx` ofrece «Buscar otra empresa».

### 11.16 Rendimiento percibido

- **`loading.tsx`**: 29 archivos. `app/loading.tsx` (un `h1` `sr-only` «Cargando la página…» y `EsqueletoPagina`) cubre todo segmento sin uno propio; los otros 28 están en `audiencias`, `auditorias`, `banca`, `banca/[slug]`, `congreso` (raíz, `[id]`, `legisladores`, `legisladores/[id]`, `perencion`, `senado`, `senado/[cuatrienio]/[id]`, `votaciones/[id]`), `constitucional`, `empresas`, `empresas/[rnc]`, `funcionarios`, `funcionarios/[slug]`, `grafo`, `grafo/camino`, `luz`, `normativa`, `normativa/[tipo]/[numero]`, `pais`, `procesos/[codigo]`, `proveedores`, `proveedores/[rpe]`, `proveedores/inhabilitados` y `tse`.
- **`Suspense`**: 75 límites en 39 archivos (38 de `app/` y `components/fuentes-nuevas/indicadores-bolsillo.tsx`), con fallbacks de `components/esqueleto.tsx`. `app/licitaciones/page.tsx` envuelve el buscador (que lee `useSearchParams`) en `<Suspense fallback={<BuscadorEsqueleto />}>`.
- **`cache()` de React** en 15 páginas (entre ellas `app/page.tsx`, `app/procesos/[codigo]/page.tsx`, `app/congreso/[id]/page.tsx`, `app/normativa/[tipo]/[numero]/page.tsx`, `app/funcionarios/[slug]/page.tsx`, `app/empresas/[rnc]/page.tsx`, `app/grafo/page.tsx`), compartido entre `generateMetadata` y la página.
- **Listas de cliente**: `keepPreviousData` mantiene la lista anterior mientras llega la siguiente (§11.13); `aria-busy` aparece en 17 archivos.
- **Listas largas**: `.cv-auto` en `app/congreso/senado/page.tsx`, `app/finanzas/page.tsx`, `app/normativa/page.tsx`, `app/planes/page.tsx`, `app/proveedores/page.tsx`, `components/iniciativa-card.tsx` y `components/proceso-card.tsx`. La rejilla de la nómina es virtual (§11.13).
- **Navegación**: `next.config.ts` fija `experimental.staleTimes: { dynamic: 30, static: 300 }`; `app/nomina/page.tsx` hace `preload("/data/nomina.json", { as: "fetch" })`. Las cabeceras de caché de `app/api/*` y `public/data` están en §1 y §4.
- **Carga diferida**: `next/dynamic` para `LectorPdf` (`ssr: false`), el tablero de React Flow y el editor Tiptap (§11.13).

### 11.17 Accesibilidad implementada

- `<html lang="es-DO">`; `Logotipo` con `translate="no"` y texto `sr-only`.
- Enlace de salto `sr-only focus:not-sr-only` → `<main id="contenido" tabIndex={-1}>`; `scroll-padding-top: 7rem` bajo la cabecera pegajosa.
- Foco: `:focus-visible` global (2 px `brand-500`); `Button` con `focus-visible:ring-2 ring-ring ring-offset-2`; `estira` dibuja el anillo sobre el objetivo entero.
- Puntos de referencia: `header`, `main`, `footer`; `nav` con `aria-label` en el megamenú («Secciones»), la barra inferior («Navegación principal»), cada columna del pie y el pie legal («Pie de página»).
- Objetivos táctiles: `Button` e `Input` a 44 px bajo `sm` y 40 px desde `sm`; los enlaces del pie con `min-h-11` en el teléfono; `Input` a `text-base` (16 px) bajo `sm`.
- Iconos `aria-hidden` por defecto; `Sello` y `SelloCompacto` con `role="img"` y `aria-label`; `RedVecinos` `aria-hidden` con su lista de aristas en la página.
- Regiones vivas y estados (recuento en `app/` y `components/`, 2026-10-02): `aria-live` 41 líneas en 34 archivos, `role="status"` 22 en 18, `aria-busy` en 17 archivos, `aria-current` 16 líneas en 8, `aria-pressed` 12 en 10, `aria-invalid` 30 en 14, `aria-describedby` 31 en 15, `sr-only` 123 en 69, `aria-label` 150 en 70.
- Errores de campo: `ErrorCampo` (`aria-live="polite"`, vacía en `sr-only`).
- Movimiento reducido: el bloque `prefers-reduced-motion` de `app/globals.css` (§11.5); `subirArriba()` consulta `matchMedia("(prefers-reduced-motion: reduce)")` y desplaza sin animación; `app/buscador.tsx` usa `motion-reduce:transition-none`.
- `app/loading.tsx` lleva un `h1` `sr-only`.
- Ninguna comprobación del gate mide contraste ni tamaño de objetivo táctil.

### 11.18 Comprobaciones de interfaz que ejecutan los hooks y el gate

**Patrones prohibidos** — `IDENTIDAD_PATRONES` y `EMOJI_PATRON` en `.claude/hooks/lib.sh`:

| Patrón (`grep -E`) | Qué rechaza |
|---|---|
| `bg-gradient-` | Utilidades de degradado |
| `from-[a-z]+-[0-9]+ (via\|to)-` | Paradas de degradado |
| `blur-(xl\|2xl\|3xl)` | Desenfoques grandes |
| `rounded-(2xl\|3xl)` | Radios por encima de `rounded-xl` |
| `(^\|[^-a-z])shadow-(sm\|md\|lg\|xl\|2xl)([^-a-z]\|$)` | Sombras por defecto de Tailwind (no afecta a `shadow-card`, `shadow-soft`, `shadow-pop`) |
| `(text\|bg\|ring\|border\|divide)-white` | Blanco de pantalla |
| `rounded-full[^"]*px-[2-9]` y `px-[2-9][^"]*rounded-full` | `rounded-full` con relleno horizontal de `px-2` o más en la misma cadena |
| `EMOJI_PATRON` (`grep -P`): `[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{FE0F}]` | Emoji y símbolos de esos bloques Unicode |

Las líneas de comentario (`//`, `*`, `/*`) se excluyen antes de comparar.

- **Antes de escribir**, `guard-edit.sh` rechaza (salida 2) una edición de un archivo de interfaz —`es_archivo_ui`: `app/**/*.tsx`, `components/**/*.tsx`, `app/**/*.css`— cuyo texto nuevo contenga uno de esos patrones, y muestra hasta ocho líneas.
- **El gate** (`verificar.sh`, en `--rapido` y en `--completo`) rechaza:
  - **paso 2** — cualquier `.tsx` o `.css` de `app/` o `components/` con un patrón de identidad, o un `.tsx` con emoji;
  - **paso 2b** — un control mudo (`sin-efecto.py` sobre los `.tsx` de `app/` y `components/`): un `hover:X` cuando `X` ya está en la misma línea, o un `hover:ring-<color>-<n>` sin un ancho `ring-<n>` en la línea;
  - **paso 2c** — una cantidad abreviada: un `.ts`/`.tsx` de `app/`, `components/` o `lib/` con una plantilla que cierra `)}MM`, `)}M` o `)}K` (o `)MM`…) justo antes de la comilla invertida;
  - **paso 2d** — un índice que no coincide con las páginas (`indice.py`): una página estática de `app/` (sin segmento `[…]`, sin contar grupos `(x)`) que no está en `lib/menu.ts` (`href: "…"`) ni en `FUERA_DEL_INDICE`, o una entrada de cualquiera de los dos sin página;
  - **paso 2e** — movimiento escrito a mano en un `.tsx` de `app/` o `components/`: `cubic-bezier(`, `animate-bounce`, `duration-[` o `duration-N` con N entre 350 y 999 o de cuatro cifras;
  - **paso 2f** — una dirección de entidad armada a mano en `app/`, `components/` o `lib/` (fuera de `lib/grafo*`): una cadena que empieza por `/instituciones/`, `/proveedores/`, `/procesos/`, `/normativa/`, `/congreso/`, `/obras/`, `/provincias/`, `/finanzas/`, `/funcionarios/`, `/banca/` o `/empresas/` seguida de `${`, de un segmento y `${`, o de `" +`.

El resto de los pasos del gate, en §12.6.

## 12. Harness

### 12.1 Inventario y niveles de carga

| Nivel | Qué llega a la sesión | Archivos |
|---|---|---|
| Fuera del repositorio | Prompt de sistema de Claude Code, preferencias del dueño, instrucciones de la sesión (rama, atribución) | — |
| Cada turno | `CLAUDE.md` entero; las descripciones del frontmatter de cada habilidad y agente (entran en la lista de herramientas) | `CLAUDE.md`, `.claude/skills/*/SKILL.md`, `.claude/agents/*.md` |
| Al arrancar la sesión | La salida estándar de `session-start.sh` | `.claude/settings.json` → `.claude/hooks/session-start.sh` |
| Al tocar una ruta | El cuerpo de la regla cuyo `paths` coincide | `.claude/rules/*.md` |
| Al invocar | El cuerpo de una habilidad (`/verificar`, `/entregar`, `/nueva-fuente`) o de un agente al lanzarlo; este documento cuando la sesión lo lee | `.claude/skills/*/SKILL.md`, `.claude/agents/*.md`, `docs/INFRAESTRUCTURA.md` |
| Máquina (en cada evento) | Hooks registrados y el gate | `.claude/hooks/*` |

`.gitignore` excluye `.claude/settings.local.json` y `.claude/worktrees/`. No hay `CLAUDE.md` fuera de la raíz.

### 12.2 `CLAUDE.md`

120 líneas y 11,203 bytes (2026-10-02). Secciones `##`: «Qué es» (tabla de 13 verticales con ruta, fuente y capa de datos, y un párrafo con las fuentes únicas: `lib/secciones.ts`, `lib/indice.ts`, `/fuentes`, `lib/pedir.ts`, `lib/consultas.ts`, `lib/html.ts`, `lib/xlsx.ts`, `lib/grafo.ts`), «La invariante» (sin base de datos ni variables de entorno en las superficies de inteligencia; las dos excepciones con Supabase), «Qué documento responde a qué» (`docs/INFRAESTRUCTURA.md` como documento único, que registra lo que hay sin planes, pendientes, evaluaciones ni historia, y siete filas pregunta → sección), «Cómo opera una sesión» (seis reglas numeradas), «Comandos» y «Convenciones».

Su techo lo comprueba `harness.sh` (paso 5b del gate): `LIN_MAX=120` líneas (`wc -l`) y `BYTES_MAX=12288` bytes (`wc -c`).

### 12.3 `.claude/settings.json`

**Permisos.**

| `allow` | `deny` |
|---|---|
| `Bash(npm ci:*)`, `Bash(npm run build:*)`, `Bash(npx tsc:*)`, `Bash(git status:*)`, `Bash(git diff:*)`, `Bash(git log:*)`, `Bash(git show:*)`, `Bash(git branch:*)`, `Bash(git fetch origin main:*)`, `Bash(git add:*)`, `Bash(git commit:*)`, `Bash(./.claude/hooks/verificar.sh:*)`, `Bash(.claude/hooks/verificar.sh:*)`, `Bash(python3 scripts/build-nomina.py:*)`, `Bash(python3 scripts/build-deuda.py:*)` | `Read(./.env)`, `Read(./.env.*)`, `Bash(git push --force:*)`, `Bash(git push -f:*)`, `Bash(npm publish:*)` |

**Hooks** (todos con `"$CLAUDE_PROJECT_DIR"/.claude/hooks/…`):

| Evento | Matcher | Script | Timeout |
|---|---|---|---|
| `SessionStart` | — | `session-start.sh` | 300 s |
| `PreToolUse` | `Bash` | `guard-bash.sh` | — |
| `PreToolUse` | `Edit\|Write\|MultiEdit` | `guard-edit.sh` | — |
| `PostToolUse` | `Edit\|Write\|MultiEdit` | `typecheck.sh` | 90 s |
| `Stop` | — | `stop-gate.sh` | 180 s |

### 12.4 Hooks registrados

Todos cargan `lib.sh`; leen el JSON del evento por la entrada estándar con `jq`; salen con 0 si no tienen nada que objetar y con 2 (mensaje en la salida de error, que ve el modelo) cuando bloquean.

**`session-start.sh`.**
1. Si falta `node_modules/.package-lock.json` o `package-lock.json` es más nuevo, y la sesión es remota (`CLAUDE_CODE_REMOTE=true`) o no existe `node_modules`, corre `npm ci --no-audit --no-fund` e imprime `deps: npm ci ok` o `deps: npm ci FAILED…`.
2. `git fetch -q origin main` y una cabecera `[harness Socrático.do] branch=… (behind N, ahead M); uncommitted files=N`, los cinco últimos commits (`git log --oneline -5`) y una línea fija que remite a `CLAUDE.md`, a este documento (§12), `/verificar`, `/entregar` y `/nueva-fuente`. Esa salida se inyecta en la conversación.

**`guard-bash.sh`** (PreToolUse de `Bash`). Quita del comando el cuerpo de cada heredoc (la línea que lo abre se sigue leyendo) y rechaza:

| Caso | Patrón |
|---|---|
| Push forzado | `git push` con `--force`, `-f` o `--force-with-lease` |
| Push a otra rama | Cada ref de un `git push` (tras quitar `-u`, `--set-upstream`, `origin` y las comillas) debe ser una opción, `main`, `HEAD:main`, `main:main`, `claude/*`, una redirección o un número |
| Push sin sello | Cualquier `git push` con el árbol sucio (`git status --porcelain`), sin `.git/harness-gate` o con un sello distinto del sha de `HEAD` (§12.7) |
| Saltar hooks | `git commit` o `git push` con `--no-verify` |
| Reset destructivo | `git reset --hard`, `git checkout -- .`, `git restore .`, `git clean -…f` |
| Borrado recursivo | `rm -…r… ` salvo sobre `node_modules`, `.next`, `out`, `/tmp`, una ruta que empiece por `$CLAUDE…`/`${CLAUDE…`, `/root/.claude` o `$SCRATCH` |
| Escribir `.env` | `>` o `tee` hacia `.env`, `.env.*` (se permite `.env.example`) |
| Secretos del despliegue | `vercel env add\|rm\|pull`, `supabase secrets` |
| Identificador de modelo en un commit | `git commit` con `claude-(opus\|sonnet\|haiku\|fable\|mythos)-<dígito>` (sin distinguir mayúsculas) |

**`guard-edit.sh`** (PreToolUse de `Edit|Write|MultiEdit`). Solo actúa sobre rutas bajo la raíz del repositorio. Lee el texto nuevo (`content`, `new_string`, `file_text` o los `new_string` de `edits`) y rechaza:

1. Por ruta: `.env` y `.env.*` (salvo `.env.example`), `node_modules/*`, `.next/*` y `package-lock.json`.
2. Valores de secreto (`SECRETO_VALORES`: el prefijo de clave secreta de Supabase, la cabecera PEM de una clave privada y el comienzo en base64 de una cabecera JWT) en cualquier archivo.
3. Nombres de secreto (`SECRETO_NOMBRES`: `service_role`, `SUPABASE_SERVICE`) fuera de `supabase/` y de los `.md`.
4. En `.ts`/`.tsx` que no son `es_archivo_con_estado`: `process.env.` o un import de `@supabase/supabase-js` o `@/lib/supabase`, fuera de las líneas de comentario. `es_archivo_con_estado` admite `lib/supabase.ts`, `lib/supabase-config.ts`, `lib/democracia.ts`, `lib/cedula.ts`, `lib/espacios.ts`, `lib/espacios-cliente.ts`, `lib/sesion.ts`, `app/democracia/*`, `components/democracia/*`, `supabase/*`, `app/cuenta/*`, `app/espacio/*`, `app/p/*` y `components/espacios/*`.
5. Los patrones de identidad en archivos de interfaz (§11.18).

**`typecheck.sh`** (PostToolUse de `Edit|Write|MultiEdit`). Tras editar un `.ts`/`.tsx`, si existe `node_modules/typescript`, corre `timeout 60 npx tsc --noEmit --pretty false`; si hay salida, muestra las 25 primeras líneas y sale con 2 (la edición ya está hecha).

**`stop-gate.sh`** (Stop). Si `stop_hook_active` es verdadero, no hace nada. Si hay algún `.ts`, `.tsx`, `.css` o `.json` cambiado respecto de `origin/main` (en commits o sin confirmar), corre `verificar.sh --rapido`; si falla, sale con 2 y devuelve el informe: la sesión no termina.

### 12.5 `lib.sh` y comprobadores auxiliares

| Archivo | Qué es |
|---|---|
| `lib.sh` | Se carga, no se ejecuta. `set -u`, `LC_ALL=C.UTF-8`, `ROOT` (`$CLAUDE_PROJECT_DIR` o la raíz de git). Define `es_archivo_ui`, `es_archivo_con_estado`, `es_archivo_supabase`, `sin_comentarios`, `infracciones_identidad`, `IDENTIDAD_PATRONES`, `EMOJI_PATRON`, `SECRETO_VALORES`, `SECRETO_NOMBRES`, `SECRETO_PATRONES` |
| `sin-efecto.py` | Paso 2b: controles mudos (§11.18); imprime hasta 8 hallazgos |
| `indice.py` | Paso 2d: páginas de `app/` contra `lib/menu.ts` y `FUERA_DEL_INDICE` de `lib/indice.ts` |
| `harness.sh` | Paso 5b, cinco comprobaciones: (1) techo de `CLAUDE.md`; (2) existe cada ruta entre comillas invertidas de `CLAUDE.md` que empieza por `app/`, `lib/`, `components/`, `docs/`, `scripts/`, `public/`, `supabase/` o `.claude/` (salvo las que llevan `*`); (2b) cada cita de una sección de `CLAUDE.md` por su título entre comillas tras `§`, en `.claude/`, `scripts/` y `docs/` (salvo `harness.sh`), coincide con un `## ` de `CLAUDE.md`; (3) cada `.claude/rules/*.md` nombra una página `docs/[A-Z-]+.md` (o `supabase/CLAUDE.md`) que existe; (4) cada `SKILL.md` abre con frontmatter con `name` y `description`, y cada agente con `name`, `description`, `model` y `effort` |
| `cedulas.py` | Paso 5c: recorre los `.json`, `.tsv` y `.gz` de `public/data` (723 archivos, 140.0 MB en disco, contado 2026-10-02) con `cedulas_en` de `scripts/privacidad.py` |
| `cedulas-tablas.mjs` | Paso 5c: descomprime los `.br` y lee los `.json` de `datos/grafo/` (1,688 archivos) y lee con `@duckdb/node-api` los `.parquet` de `public/tablas/` (9), con tres formas de cédula (con guiones, con rayas, tras la palabra «cédula») |

### 12.6 `verificar.sh` paso a paso

`./.claude/hooks/verificar.sh [--rapido|--completo]`; sin argumento, `--rapido`. Imprime `ok` o `FAIL` por paso y termina con `RESULT: clean` (salida 0) o `RESULT: N failure(s)` (salida 1).

| Paso | Modo | Comprueba |
|---|---|---|
| 0 | ambos | Existe `node_modules/next` |
| 1 | ambos | `timeout 120 npx tsc --noEmit` sin salida (si existe `node_modules/typescript`) |
| 2 | ambos | Identidad en `app/` y `components/` (§11.18) |
| 2b | ambos | Controles mudos (`sin-efecto.py`) |
| 2c | ambos | Cantidades abreviadas `MM`/`M`/`K` |
| 2d | ambos | Índice (`indice.py`) |
| 2e | ambos | Movimiento escrito a mano |
| 2f | ambos | Direcciones de entidad fuera de `lib/grafo*` |
| 2g | ambos | Ningún archivo de `app/`, `components/` o `lib/` importa `from "@/lib/grafo-constructores"` |
| 3 | ambos | `process.env.` o import de Supabase solo en `es_archivo_con_estado` (en `.ts`/`.tsx` de `app/`, `lib/`, `components/`) |
| 4 | ambos | `git grep` de `SECRETO_VALORES` en todo lo versionado salvo `package-lock.json` y `.claude/hooks/*`, y de `SECRETO_NOMBRES` salvo además `supabase/*` y `*.md` |
| 5 | ambos | Un `lib/[a-z-]+.ts` nuevo (añadido respecto de `origin/main`, o sin seguimiento) exige un cambio en `app/fuentes/page.tsx` o `CLAUDE.md` |
| 5a | ambos | Si existe `public/data/busqueda/corpus.json`: `indice.bin` empieza por `SIB2`, la `etiqueta` de su cabecera es `${generado}\|${huella}\|${docs.length}` del corpus y su campo `vectores` es el SHA-256 de `vectores.bin` |
| 5a' | ambos | Ningún archivo versionado pasa de 90,000,000 bytes |
| 5b | ambos | `harness.sh` sin hallazgos |
| 5c | `--completo` | `cedulas.py` y `cedulas-tablas.mjs` sin hallazgos |
| 5d | `--completo` | `node scripts/build-grafo.mjs --comprobar`: el grafo compilado de `datos/grafo/` igual a lo que producen sus constructores (§7) |
| 6 | `--completo` | `timeout 600 npm run build`; el registro va a `${TMPDIR:-/tmp}/socratico-build.log` y se borra si pasa |
| 6b | `--completo`, si el build pasó | `next start` en un puerto libre; espera hasta 60 s a que conteste `/robots.txt`; `timeout 300 node scripts/eval-mcp.mjs --url http://localhost:<puerto>/mcp` (§9) |
| 6c | íd., mismo servidor | `timeout 300 node scripts/validar-grafo.mjs --url http://localhost:<puerto> --personas 300`: SHACL de `lib/ontologia.ts` (§7). Un `trap` mata el servidor al salir |
| 7 | `--completo`, sin fallos | Sello (§12.7) |

### 12.7 El sello y el push

- Si `--completo` termina sin fallos y `git status --porcelain` está vacío, el paso 7 escribe el sha de `HEAD` en `$(git rev-parse --git-dir)/harness-gate` e imprime `stamped <sha> — push to main allowed`; con el árbol sucio imprime `not stamped: working tree dirty…` y no sella.
- `guard-bash.sh` rechaza cualquier `git push` si el árbol está sucio, si no existe `harness-gate` o si su contenido no es el sha de `HEAD`. Un commit nuevo o un rebase cambian `HEAD` y anulan el sello.
- `/entregar` empuja con `git fetch origin main`, `git rebase origin/main`, `./.claude/hooks/verificar.sh --completo` sobre el árbol rebasado y `git push origin HEAD:main`, reintentando ante un fallo de red a los 2, 4, 8 y 16 s.

### 12.8 Reglas por ruta — `.claude/rules/`

| Archivo | `paths` del frontmatter | Página que nombra | Contenido |
|---|---|---|---|
| `identidad.md` | `app/**`, `components/**` | `docs/INFRAESTRUCTURA.md` §11 | Prohibiciones (1–9), catálogo de primitivas (`components/ui/*` y las de la casa), color y tipografía, voz y ergonomía |
| `fuentes.md` | `lib/**`, `app/api/**`, `scripts/**` | `docs/INFRAESTRUCTURA.md` §4–§6 | Contrato de lectura de una fuente (`lib/pedir.ts`, User-Agent, 25 s, un reintento, `content-type`, `null`), las dos clases de adaptador, lecciones de la lectura de las fuentes, declaración en `/fuentes`, rutas `app/api/*` |
| `democracia.md` | `app/democracia/**`, `components/democracia/**`, `lib/democracia.ts`, `lib/supabase.ts`, `lib/supabase-config.ts`, `lib/cedula.ts`, `supabase/**` | `docs/INFRAESTRUCTURA.md` §10 | Frontera, invariantes de seguridad, cambios de base de datos, orden de la interfaz |
| `espacios.md` | `app/cuenta/**`, `app/espacio/**`, `app/p/**`, `app/comunidad/**`, `components/espacios/**`, `lib/espacios.ts`, `lib/espacios-cliente.ts`, `lib/sesion.ts`, `lib/ftm.ts`, `supabase/migrations/*espacios*`, `supabase/migrations/*conversacion*`, `supabase/migrations/*caso*`, `supabase/pruebas/**`, `supabase/functions/metricas-uso/**` | `docs/INFRAESTRUCTURA.md` §10 | Frontera, la conversación, el caso, cambios de base de datos |

### 12.9 Habilidades — `.claude/skills/`

| Habilidad | `allowed-tools` | Qué hace el cuerpo |
|---|---|---|
| `verificar` | `Bash`, `Read`, `Grep`, `Glob`, `Edit` | Corre `./.claude/hooks/verificar.sh --completo`; en verde pide citar `RESULT: clean` y la tabla de rutas del build; en rojo, corregir el código y repetir; indica qué hacer por tipo de fallo (statelessness y secretos, identidad y controles mudos, harness, evaluación MCP, build de Next 15) y las comprobaciones manuales opcionales (390 px con Playwright, una lectura real de la fuente) |
| `entregar` | `Bash`, `Read`, `Edit`, `Grep`, `Glob` | Cinco pasos: la sección de este documento que describe el cambio → gate completo → commit en español (sujeto imperativo ≤ 72 caracteres, cuerpo con el porqué, sin identificadores de modelo) → `fetch`, `rebase`, gate completo y `git push origin HEAD:main` → informe final |
| `nueva-fuente` | `Bash`, `Read`, `Edit`, `Write`, `Grep`, `Glob`, `WebFetch`, `Agent` | Método QRSPI (Questions → Recon → Spike → Plan → Implementation) para una fuente del Estado, con su lista de implementación: `lib/<fuente>.ts`, `app/api/<fuente>/route.ts`, interfaz, `app/fuentes/page.tsx`, `CLAUDE.md`, gate y entrega |

Las tres terminan con `$ARGUMENTS`.

### 12.10 Agentes — `.claude/agents/`

| Agente | `model` | `effort` | `tools` | Qué hace |
|---|---|---|---|---|
| `recon` | `inherit` | `medium` | `Bash`, `Read`, `Grep`, `Glob`, `WebFetch` | Reconocimiento de una fuente: `robots.txt` primero; a lo sumo 6 peticiones GET por host con `User-Agent: Socratico-Inteligencia/1.0 (reconocimiento; herramienta independiente)` y 25 s de tiempo límite por `curl`; valida `content-type` y primeros bytes; informa en español con ✅/⚠️/❌, URL, estado, tipo, tamaño y extracto, familia de acceso, adaptador más próximo, ventana de caché y lo que debe declarar `/fuentes` |
| `revisor` | `inherit` | `high` | `Read`, `Grep`, `Glob`, `Bash` | Revisión de solo lectura de `git diff origin/main...HEAD` y lo no confirmado, con `verificar.sh --rapido`; revisa en orden statelessness y secretos, contrato de fuente, frontera de democracia, identidad, ergonomía, textos y documentación; entrega una lista ordenada con `archivo:línea` y cierra con «entregable» o «no entregable: N bloqueantes» |
