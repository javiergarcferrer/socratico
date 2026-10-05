# Socrático.do — arranque de sesión

Plataforma de inteligencia en español dominicano (es-DO) sobre datos del Estado.
Herramienta **independiente y no oficial**: el pie y los metadatos lo dicen y
eso no se toca. Todo el texto de cara al usuario va en es-DO.

Este archivo se inyecta entero en cada turno, así que es el presupuesto más caro
del repositorio: **una línea por regla, y el enlace a la sección que describe lo que rige.**
Techo 120 líneas / 12 KB, comprobado por el gate. Lo que crezca va a `docs/INFRAESTRUCTURA.md`.

## Qué es

| Vertical | Ruta | Fuente | Capa de datos |
|---|---|---|---|
| Compras públicas | `/licitaciones`, `/historico`, `/proveedores/inhabilitados` | API abierta de la DGCP + tablas completas desde 2015, medidas sobre proveedores, lista SDN de la OFAC y padrón RNC (instantáneas) | `lib/dgcp.ts`, `lib/historico.ts`, `lib/rnc.ts`, `lib/sanciones.ts` (con `medidas`), `lib/vocabulario-compras.ts` |
| Finanzas públicas | `/finanzas` | SIGEF: ejecución y subsidio eléctrico (instantáneas) | `lib/fiscal.ts`, `lib/capitulos.ts`, `lib/subsidio.ts` |
| Congreso Nacional | `/congreso` | SIL Diputados + consultante del Senado | `lib/congreso.ts`, `lib/senado.ts`, `lib/vocabulario-congreso.ts` |
| Normativa y justicia | `/normativa`, `/constitucional`, `/tse`, `/audiencias`, `/inmobiliario`; decretos en `/`, boletín del PJ en `/indicadores` | Consultoría Jurídica (API JSON + instantánea; registro completo de decretos con su firmante, por año); TC y TSE (HTML); boletín del Poder Judicial (instantánea); rol de audiencias del PJ y expedientes del Registro Inmobiliario (POST en vivo, solo por número exacto) | `lib/normativa.ts`, `lib/decretos.ts` (con `decretos-base`), `lib/tc.ts`, `lib/tse.ts`, `lib/justicia.ts`, `lib/audiencias.ts`, `lib/inmobiliario.ts` |
| Nómina estatal | `/nomina`, `/nomina/general` | Instantánea de 86 instituciones + nómina general del MAP (492 mil plazas, agregada) | `lib/nomina.ts`, `lib/nomina-server.ts`, `lib/nomina-general.ts` |
| Deuda pública | `/deuda` y tarjeta en `/` | Crédito Público (XLSX + instantánea con serie; subastas de bonos) | `lib/deuda.ts`, `lib/subastas.ts` |
| Entidades y personas (transversal) | `/instituciones`, `/funcionarios`, `/empresas`, `/buscar`, `/grafo`, `/ontologia`, `/mcp` (con `/conectar`) | Clasificador de DIGEPRES (894 entidades) cruzado DGCP ↔ SIGEF ↔ nómina ↔ Consultoría; funcionarios del MAP, decretos, cortes, JCE y Junta Monetaria (PEP por la Ley 311-14) y las declaraciones juradas que publican las instituciones; personas jurídicas del padrón DGII; supervisados de SB, SIPEN, SIS e IDECOOP; índice de búsqueda por palabra y por tema sobre las instantáneas; el grafo en RDF (OWL, schema.org), compilado y comprobado nodo a nodo, con QID de Wikidata vía QLever; el índice y el grafo (con las contrataciones), servidos a asistentes de IA por MCP, con recuperación para RAG y SQL sobre sus tablas | `lib/instituciones.ts`, `lib/funcionarios.ts` (con `cargos`), `lib/declaraciones.ts`, `lib/empresas.ts`, `lib/padron.ts`, `lib/financieras.ts`, `lib/buscar.ts`, `lib/busqueda.ts`, `lib/grafo-rdf.ts` (lee `datos/grafo/` por `grafo-compilado` y `grafo-ld`; con `rdf`, `ontologia` y sus esquemas, `wikidata`), `lib/mcp.ts`, `lib/grafo-sql.ts`, `lib/tablas-compras.ts` |
| Dinero | `/dinero` (tasas, bonos, Banco Central, guía), `/banca` | BCRD (CDN con la fecha del día: TPM, tasas de los bancos, balance, operaciones diarias) y Crédito Público (tenedores de bonos y acreedores, instantánea) | `lib/banco-central.ts`, `lib/tenedores.ts` |
| Obra pública y país | `/obras`, `/pais`, mapa en `/provincias` | MapaInversiones; robos y armas (MIP), matrícula (MINERD), licencias (MIVHED); límites provinciales de la ONE (instantáneas) | `lib/obras.ts`, `lib/sociedad.ts`, `lib/mapa.ts` |
| Gestión, control y datos | `/gestion`, `/auditorias`, `/documentos`, `/datos` | SISMAP; Contraloría y Cámara de Cuentas; bibliotecas WordPress de 22 instituciones; datos.gob.do (instantáneas) | `lib/sismap.ts`, `lib/auditorias.ts`, `lib/biblioteca.ts`, `lib/catalogo.ts` |
| Indicadores del panorama | `/indicadores` (cuatro cifras en `/`), `/luz` | MICM, BCRD (CDN), SB (SIMBAD), Aduanas, OC (luz), mantenimientos de Edenorte y Edesur, INDOMET (alertas), OPSEVI (vías), en vivo | `lib/combustibles.ts`, `lib/tasa.ts`, `lib/macro.ts`, `lib/bcrd.ts`, `lib/banca.ts`, `lib/aduanas.ts`, `lib/energia.ts`, `lib/alertas.ts`, `lib/siniestralidad.ts`, `lib/cortes.ts` |
| Democracia | `/democracia` | Supabase, esquema `democracia` — **excepción** | `lib/democracia.ts`, `lib/supabase.ts` |
| Tu espacio | `/cuenta`, `/espacio`, `/p/[slug]`, `/comunidad` | Supabase, esquema `espacios` — **excepción**: lo guardado, proyectos, notas, alertas, conversación; el uso de la plataforma para el dueño (Edge Function `metricas-uso`) | `lib/espacios.ts`, `lib/espacios-cliente.ts`, `lib/sesion.ts`, `lib/ftm.ts` |

`lib/secciones.ts` es la fuente única de verticales; `lib/indice.ts` (de `lib/menu.ts`) la de destinos y su tarea. `/` es la portada (misión, hoy, el mapa); `/indicadores` el panorama; `/fuentes` declara
qué alimenta la plataforma, qué está bloqueado y con qué límites de cobertura — mantenerlo cierto es parte de tocar una fuente. Toda lectura pasa por `lib/pedir.ts` (el contrato, con `zod`); la del navegador a una ruta propia, por TanStack Query (`lib/consultas.ts`); HTML por `lib/html.ts`, XLSX por `lib/xlsx.ts`; todo enlace a una entidad sale de `lib/grafo.ts` (y `lib/grafo-servidor.ts`).

## La invariante

**Las superficies de inteligencia no tienen base de datos ni variables de
entorno.** Todo se lee en vivo y se cachea con `revalidate`. Nunca se introduce
una DB, una API key ni un secreto en licitaciones, congreso, nómina, finanzas,
normativa, deuda, el panorama, `/fuentes` ni el servidor MCP.

**Dos excepciones, ambas de lo que es del lector y no del Estado:** `/democracia` (voto,
esquema `democracia`) y la cuenta con sus espacios (`/cuenta`, `/espacio`, `/p`, `/comunidad`; esquema
`espacios`). Supabase, solo claves **publicables**; lo sensible vive en Postgres y en Edge
Functions (`metricas-uso` guarda el token de Vercel). Ningún dato del Estado entra a la DB: una ficha no la lee, pinta un componente de
`components/espacios/`. Los hooks lo impiden antes de que se escriba.

## Qué documento responde a qué

Un solo documento, `docs/INFRAESTRUCTURA.md`: la infraestructura tal como está, con fecha en cada medida. Ningún plan, pendiente, evaluación ni historia entra en él (el porqué va al commit); lo que cambia en el código cambia ahí en el mismo commit. No se crea otro `.md` en `docs/`.

| La pregunta | La sección |
|---|---|
| ¿Qué stack, qué despliegue, cuánto pesa cada función? | §1 |
| ¿Dónde vive **X**? ¿Qué ruta, qué módulo? | §2 Repositorio, §3 Rutas |
| ¿Cómo se lee una **fuente** del Estado y en qué estado está? | §4, §5 (✅/⚠️/❌), §6 Instantáneas |
| ¿Cómo funcionan el **grafo**, la **búsqueda** y el **MCP**? | §7, §8, §9 |
| ¿Cómo funcionan las **excepciones** de la DB? | §10 |
| ¿Qué tokens y primitivas tiene la **interfaz**? | §11; sus reglas, `.claude/rules/identidad.md` |
| ¿Qué archivos **moldean una sesión**? | §12 |

Los `.claude/rules/*.md` se cargan solos al tocar rutas que coinciden: son las reglas de esa zona y nombran en su cabecera la sección que la describe.

## Cómo opera una sesión

El dueño lleva esta empresa solo y no está en el circuito mientras trabajas.
Las sesiones terminan trabajo; no devuelven preguntas.

1. **Decide, deja registro, sigue.** Los juicios de rutina son tuyos; el porqué
   va en el cuerpo del commit. Solo se pregunta lo irreversible o lo que cuesta
   dinero: migraciones sobre el Supabase vivo, cambios en su panel de Auth,
   credenciales o dependencias con claves, borrar datos, gestiones
   institucionales. Para eso: prepara todo, lista los pasos exactos, y para.
2. **Verifica antes de afirmar.** Una fuente «funciona» solo tras una respuesta
   real con el User-Agent identificable; un cambio está «hecho» solo cuando
   `./.claude/hooks/verificar.sh --completo` imprime `RESULT: clean`.
3. **El documento es la memoria.** Lo que la próxima sesión tendría que redescubrir va a la
   sección de `docs/INFRAESTRUCTURA.md` que lo describe —lo que es, no lo que será—, ✅/⚠️/❌
   para el estado de una fuente, y a `/fuentes` cuando toca una fuente. El chat no es memoria.
4. **Se entrega a `main`.** Cada push a `main` despliega a producción. Rebase
   sobre `origin/main` (otras sesiones también empujan), gate completo **sobre
   el árbol ya rebasado** —estampa el commit y el guard exige esa estampa en
   todo push—, y push. Una rama `claude/*` se empuja para verla en Vercel antes
   de entregar; solo `main` despliega. Nunca `--force`, nunca `--no-verify`.
5. **Nunca se debilita un check para pasarlo.** Si un hook o el gate se
   equivoca, se deja rojo y se dice con evidencia. Las jugadas legales son
   tres: usar la primitiva, añadir el token, extraer el hermano.
6. **Nunca se evade un bloqueo.** WAF, challenge, 403/470, robots, CAPTCHA: la
   respuesta es institucional y se escribe, no se rodea. Jamás una credencial
   filtrada.

## Comandos

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # build de producción — incluye el typecheck
npx tsc --noEmit # solo typecheck

# Instantáneas en public/data/: fiscal (SIGEF, ~5 min), nomina, deuda, normativa y decretos
# (semanal), instituciones (tras normativa), leyes, procesos, sentencias, congreso, historico-rnc (tras historico y empresas), busqueda, grafo (.mjs, tras todas; a `datos/grafo/`), grafo-volcado y grafo-tablas (.mjs, al final, tras grafo). Una por script:
python3 scripts/build-<nombre>.py  # tras busqueda: node scripts/build-indice-busqueda.mjs
```

No hay suite de pruebas ni ESLint: `next build` es el gate real, envuelto por `./.claude/hooks/verificar.sh --completo` (typecheck, identidad, controles sin
efecto, statelessness, secretos, harness, build, la evaluación del MCP, el grafo compilado contra sus constructores y contra su ontología en SHACL). El lockfile fija **Next 15**;
se compila contra él (`npm ci`) — Turbopack en 16 tolera cosas que webpack en 15
rechaza, como un import `node:` llegando a un bundle de cliente.

Habilidades: `/verificar` (el gate), `/entregar` (docs → gate → commit → push), `/nueva-fuente` (QRSPI de una fuente del Estado). Agentes: `recon` (reconocimiento
de campo con la higiene de la plataforma), `revisor` (revisión de solo lectura contra todas las reglas de arriba).

## Convenciones

Next.js 15 **App Router** + React 19 + TypeScript + Tailwind CSS 4 (plugin
`@tailwindcss/postcss`; los tokens y utilidades viven en `app/globals.css`). La
interfaz se compone con **shadcn/ui** en `components/ui/` —código del
repositorio, Radix por debajo— vestido con los tokens de la identidad; encima
van las primitivas de la casa (`docs/INFRAESTRUCTURA.md` §11.9). Nada de markup a mano
para una superficie, un botón, una marca o una capa que abre. El alias `@/*`
resuelve a la **raíz del repositorio** — este proyecto no usa `src/`.
Los mensajes de commit van en español, sujeto imperativo, cuerpo en prosa que
explica el porqué.
