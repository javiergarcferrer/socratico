# Socrático.do

Plataforma de inteligencia sobre el Estado dominicano: **qué compra, qué
legisla y a quién paga**. Reúne fuentes oficiales en un solo lugar, leídas en
vivo y cacheadas, sin base de datos intermedia. Solo persiste lo que es del
lector, no del Estado: el piloto de voto ciudadano y la cuenta con sus
espacios de investigación (lo guardado, proyectos, notas, lo que sigue).

Herramienta independiente y no oficial. Producción:
https://socratico.vercel.app

## Verticales

| Vertical | Rutas | Fuente | Capa de datos |
|---|---|---|---|
| Portada | `/` | Misión, cifras de hoy y el mapa de todo lo que hay | `app/page.tsx` |
| Panorama | `/indicadores` | Todas las de abajo | `app/indicadores/page.tsx` |
| Tu espacio | `/cuenta`, `/espacio`, `/espacio/proyecto`, `/p/[slug]` | Supabase, esquema `espacios` (referencias, nunca datos del Estado) | `lib/espacios.ts`, `lib/espacios-cliente.ts`, `lib/sesion.ts` |
| Licitaciones | `/licitaciones`, `/procesos/[codigo]`, `/proveedores`, `/proveedores/[rpe]`, `/estadisticas`, `/contratos`, `/planes`, `/seguimiento`, `/guia` | [API de datos abiertos de la DGCP](https://datosabiertos.dgcp.gob.do/api-dgcp/docs/index.html) | `lib/dgcp.ts` |
| Entidades y personas | `/instituciones`, `/funcionarios`, `/funcionarios/[slug]`, `/empresas`, `/empresas/[rnc]`, `/banca`, `/banca/[slug]`, `/proveedores/inhabilitados` | Clasificador Institucional de DIGEPRES, Directorio de Funcionarios del MAP, decretos, altas cortes y JCE, padrón de la DGII, supervisados de la SB, la SIPEN, la SIS y el IDECOOP, medidas de la DGCP y lista SDN de la OFAC (instantáneas) | `lib/instituciones.ts`, `lib/funcionarios.ts`, `lib/empresas.ts`, `lib/financieras.ts`, `lib/sanciones.ts` |
| Finanzas | `/finanzas`, `/finanzas/[capitulo]` | API de datos abiertos del SIGEF (Hacienda), en instantánea | `lib/fiscal.ts`, `lib/capitulos.ts`, `public/data/fiscal.json` |
| Congreso | `/congreso`, `/congreso/[id]`, `/congreso/perencion`, `/congreso/senado`, `/congreso/senado/[cuatrienio]/[id]` | SIL de Diputados (API JSON interna) y consultante del Senado (HTML) | `lib/congreso.ts`, `lib/senado.ts`, `lib/legislacion.ts` |
| Normativa | `/normativa`, `/normativa/[tipo]/[numero]` | Consultoría Jurídica del Poder Ejecutivo | `lib/normativa.ts` |
| Nómina | `/nomina` | Nóminas de transparencia (Ley 200-04), consolidadas en una foto transversal | `lib/nomina.ts`, `lib/nomina-server.ts`, `public/data/nomina.json` |
| Democracia | `/democracia`, `/democracia/registro`, `/democracia/seguridad`, `/democracia/cuenta-unica/*` | Supabase (esquema `democracia`); identidad verificada por Cuenta Única (OGTIC), construida y a la espera del cliente OAuth2 | `lib/democracia.ts`, `lib/supabase.ts`, `app/democracia/cuenta-unica/` |

Transversales: `/fuentes` declara qué alimenta la plataforma, qué está
bloqueado y con qué límites de cobertura; `/seguridad` documenta la postura de
seguridad y cumplimiento. El indicador de deuda pública del panorama sale de
Crédito Público (`lib/deuda.ts`), con instantánea local de respaldo en
`public/data/deuda.json`.

## Qué hace cada vertical

**Licitaciones.** Buscador en vivo con texto insensible a acentos y filtros
(estado, modalidad, institución, fechas, MIPYMES) que viven en la URL. Detalle
por proceso con cronograma, artículos, pliego legible en la página, precios
históricos de adjudicación por subclase UNSPSC, quién ofertó y quién ganó.
Índice de proveedores del Estado: quién más se adjudica y quién más contratos
gana en la ventana reciente, con la ficha de registro de los mayores, y
búsqueda por RNC, cédula o número de RPE contra el registro completo —la
búsqueda por nombre solo alcanza esa ventana, y la página lo dice—. Ficha del
proveedor con su historial y su registro RPE. Planes anuales de compras (PACC)
del año en curso. Seguimiento en el navegador, exportación CSV y RSS por
búsqueda (`/api/feed`).

**Finanzas.** Ejecución del presupuesto por institución y mes (vigente,
comprometido, devengado, pagado). El SIGEF tarda demasiado para leerse en
vivo, así que se sirve una instantánea generada con `scripts/build-fiscal.py`
y la interfaz declara la fecha de corte.

**Congreso.** Iniciativas de Diputados y expedientes del Senado, con ficha,
trámites, proponentes y documentos. Dossier que explica cada pieza en llano y
resuelve las normas que cita contra la Consultoría. Alerta de perención: cada
legislatura ordinaria dura 150 días y las piezas pendientes al cierre se
archivan.

**Normativa.** Decretos, leyes, reglamentos y resoluciones del Ejecutivo, con
el texto oficial legible en la página.

**Nómina.** Plazas, áreas, cargos y sueldos brutos del último mes publicado por
cada institución cubierta, sin nombres ni datos personales. Se regenera con
`scripts/build-nomina.py`.

**Democracia.** Voto ciudadano a favor o en contra sobre iniciativas reales,
con registro por cédula. Solo se publican totales. La verificación de
identidad con Cuenta Única está construida pero inactiva hasta que OGTIC
emita el `client_id`.

## Stack

- Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4.
- Sin base de datos ni secretos en las superficies de inteligencia: cada capa
  de datos lee en vivo con `fetch` y caché por `revalidate`, timeout y un
  reintento. Las rutas `app/api/*` son proxies delgados sobre `lib/*`.
- Democracia y Tu espacio usan Supabase con claves **publicables** únicamente
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y el
  `NEXT_PUBLIC_CUENTA_UNICA_CLIENT_ID` público); el material sensible vive
  dentro de Postgres y de una Edge Function. Migraciones y funciones en
  `supabase/`.
- Los PDF oficiales se leen con pdf.js sobre un canvas a través de
  `/api/documento`, que solo repite bytes de los hosts del Estado listados en
  `lib/documentos.ts`.

## Estructura

```
app/          rutas (App Router) y rutas API
components/   piezas de interfaz compartidas
lib/          capas de datos, formato y arquitectura de información
public/data/  instantáneas generadas (nómina, deuda, fiscal)
scripts/      generadores de instantáneas (Python)
supabase/     migraciones y Edge Function del esquema democracia
docs/         arquitectura, identidad, fuentes, Democracia, decisiones y harness
.claude/      arnés de sesiones: reglas, hooks (la compuerta), skills y agentes
```

Guía para trabajar en el código: `CLAUDE.md`, que enruta cada pregunta a su
página. Arquitectura y primitivas: `docs/ARQUITECTURA.md`. Identidad visual:
`docs/IDENTIDAD.md`. Reconocimiento de fuentes: `docs/RECON.md` (Congreso) y
`docs/AUDITORIA.md` (resto del Estado). Plan de la vertical con base de datos:
`docs/PLAN-DEMOCRACIA.md`.
Qué archivos moldean una sesión de Claude: `docs/HARNESS.md`.

## Desarrollo

```bash
npm ci
npm run dev        # http://localhost:3000
npm run build      # compila y ejecuta el typecheck
./.claude/hooks/verificar.sh --completo   # la compuerta: typecheck, identidad, secretos, build
```

No hay suite de pruebas ni ESLint. Despliega en Vercel con cada push a `main`.
