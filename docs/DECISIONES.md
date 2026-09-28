# Decisiones — abiertas y cerradas

Lo que el dueño ya decidió y lo que sigue siendo suyo. Una sesión **no
re-pregunta** lo de aquí ni decide por su cuenta lo que está abierto: prepara
todo, lista los pasos exactos y para (`CLAUDE.md` §Cómo opera una sesión, 1).

Vivía en `CLAUDE.md`, que se inyecta entero en cada turno. Esta lista solo
crece —cada decisión cerrada deja su rastro— y no cabe en el presupuesto de
arranque; aquí puede crecer y leerse cuando se toca el área.

## Abiertas — solo el dueño

- **Denuncias y retiro de investigaciones publicadas** (`/p/<slug>`,
  docs/PLAN-ESPACIOS.md §3): cualquiera con cuenta puede publicar con el
  nombre de firma que quiera. Hoy la página dice que ese nombre no está
  verificado, no se indexa y no hay canal para denunciar una suplantación o
  una difamación, ni forma de retirarla que no sea borrarla en la base.
  Decidir: un correo de contacto, un botón «Denunciar» (tabla nueva) y quién
  lo atiende.
- **Credentials for BCRD / Superintendencia de Bancos** (AUDITORIA §8.3):
  would be the first env var on a stateless surface. Until decided, macro
  comes only from the BCRD CDN files (§A.6) or not at all.
- **Dedicated Supabase project for /democracia in production**
  (PLAN-DEMOCRACIA §1): the pilot shares the `Transac` Auth pool.
- **Supabase Auth panel**: ✅ Site URL and redirect allowlist set by the owner
  (2026-09-28). Measured without sending mail, by passing a bogus token to
  `/auth/v1/verify`:
  - `redirect_to=https://socratico.vercel.app/espacio` comes back 303 to that
    same path;
  - a foreign domain and `http://localhost:3000` fall back to
    `https://socratico.vercel.app/`.

  ⚠️ Still open: confirm that the two code-only templates (`supabase/templates/`)
  are what arrives. No public endpoint shows the templates, so the proof is a
  real email carrying six digits. Earlier measurement, 2026-09-04
  (PLAN-DEMOCRACIA §5.1): 2026-09-04 (PLAN-DEMOCRACIA §5.1): GoTrue does **not** reject a
  non-allowlisted `redirect_to`, it substitutes the Site URL, and the answer
  always comes back in the URL **fragment** — so the OTP request now asks to
  return to `/democracia/registro` and self-heals the day the domain is
  allowlisted, and the registration form accepts all five return shapes,
  including the address bar the visitor is stranded on after tapping the link
  (which carries the session even though the link's token is already spent).
- **Google sign-in for `/cuenta`** (PLAN-ESPACIOS §3): built and inert — the
  button appears by itself once `/auth/v1/settings` reports `google: true`
  (⚠️ `false`, measured 2026-09-28). Owner steps: (1) Google Cloud Console →
  OAuth consent screen (external, app name Socrático.do, domain
  `socratico.vercel.app`) → Credentials → OAuth client ID, type Web, authorized
  redirect URI `https://amuyclnyjyhigeyhuufs.supabase.co/auth/v1/callback`;
  (2) Supabase → Authentication → Sign In / Providers → Google: enable, paste
  client ID and secret (the secret lives only in the panel, never in the repo);
  (3) **required first**: Authentication → URL Configuration → Site URL
  `https://socratico.vercel.app` and add `https://socratico.vercel.app/**` to
  the redirect allowlist — otherwise GoTrue returns every Google login to
  `http://localhost:3000`. The pool is shared with `Transac`: enabling the
  provider does not change that app's login unless it offers the button.
  Google's consent screen names `amuyclnyjyhigeyhuufs.supabase.co` until the
  project has a custom Auth domain (paid add-on). Email code stays as the
  fallback; `/democracia/registro` is untouched.
- **Cuenta Única OAuth2 client** (PLAN-DEMOCRACIA §9, AUDITORIA §A.11):
  identity v2 for `/democracia` is **built and inert** (public PKCE client,
  verification inside the Edge Function `vincular-cuenta-unica`, subject
  hashed with the pepper). Cuenta Única has no dynamic client registration:
  the owner requests the `client_id` from OGTIC, deploys the function, and
  sets the id in Vercel and as a function secret (PLAN §9.5). Until then the
  UI does not offer the path. Migration `20260902120000` was **applied on
  2026-09-26 at the owner's request** (PLAN §9.5, step 2): it also closed the
  `hash_cedula` oracle, which was executable by `anon` over REST until then.
- **Secret-scan scope** (`.claude/hooks/lib.sh`): the session that built
  Cuenta Única scoped the scan so key *values* are forbidden everywhere and
  the service-role *name* only on app surfaces, because the migration's GRANT
  and the Edge Function must name it. The reviewer flagged that a session
  changed the gate it had to pass. Ratify, or revert those three hook hunks
  and accept a red gate on `supabase/`.
- **Verified identity vs. declared cédula** (PLAN-DEMOCRACIA §9.5): when a
  Cuenta Única login confirms a cédula someone else typed unverified, the RPC
  refuses with `cedula_declarada_en_uso` and displaces nobody. Decide whether
  verification should win (deleting the unverified row and its votes).
- **Alerts by e-mail or push** (docs/PLAN-ACCESO.md §6, PLAN-ESPACIOS §Alertas):
  since 2026-09-28 what a signed-in reader follows lives in their account
  (`espacios.seguimientos`) and «qué cambió» is shown on any device when they
  sign in. Sending it — an e-mail digest or a push — needs a scheduled job
  that reads the sources and a sender: an e-mail provider (money, a key) or
  web-push keys, and the job would hold a service credential outside the
  app. Until decided: alerts are seen on arrival, not sent.
- **Scheduled snapshot refresh** (PLAN-ACCESO §6): eight snapshots now feed
  the platform (`scripts/build-{fiscal,nomina,deuda,normativa,instituciones,
  obras,rnc,sismap}.py`). Normativa matters most: the Consultoría challenges
  Vercel, so its snapshot is what production shows and it ages weekly. A
  scheduled cloud session could regenerate and deliver them through the gate;
  it costs sessions, so it is the owner's call.
- **Sworn asset declarations in the document index** (AUDITORIA §G.2): 115
  PDFs titled «Declaración jurada de patrimonio <name>» are published by the
  institutions themselves under Ley 311-14, but a platform-wide index makes
  them searchable by an official's name, which is a Ley 172-13 proportionality
  call. Until decided, `scripts/build-documentos.py` excludes them by title
  (`DECLARACION`); including them is deleting that one condition and
  regenerating.
- **Institutional requests**: Consultoría Jurídica's Cloudflare allowance for
  `Socratico-Inteligencia/1.0` on its read-only APIs (AUDITORIA §4.1), ONE whitelist, Cámara de Cuentas and 911 under
  Ley 200-04, JCE electoral archive, BCRD file index, report of the exposed
  311 token and the Cuenta Única client request to OGTIC (AUDITORIA §A.9,
  §A.11, §F). Added by the third pass (AUDITORIA §G.9): responsible-disclosure
  notes to the Superintendencia de Bancos (SIMBAD's public API exposes chart
  SQL and staff users) and CAASD (default Tomcat), and Ley 200-04 requests to
  SNS/MAP/MIDEREC (closed WordPress REST), SIE/SIMV/Agricultura/INFOTEP (WAF),
  the SCJ (GET on its rulings search) and the Poder Judicial (full TLS chain).

- **Clave del AI Gateway para las instantáneas** (ver «Clasificadores de IA»
  abajo): solo si se quiere Jev en un script de `scripts/`, nunca en Vercel.
  Candidato: familias de cargo sobre los ~3.250 títulos de la nómina
  (`scripts/build-nomina.py`). La conexión de Vercel de las sesiones no puede
  crear claves del Gateway ni tokens OIDC (403, verificado 24-09-2026): la
  crea el dueño en su panel, con tope de gasto.

## Cerradas, para que nadie las reabra

- **Titulares en Geist, no en Instrument Serif (28-09-2026).** El dueño juzgó
  la serif de titular «horrible»: condensada y a 400, se leía floja y
  anticuada. Se compararon en pantalla Geist, Inter Tight, Schibsted Grotesk,
  Bricolage Grotesque, Instrument Sans, Newsreader y Fraunces sobre papel y
  junto a Public Sans; ganó **Geist a 600, −0,025 em**: la más nítida a
  tamaño de titular y la que mejor separa el titular del cuerpo sin pelearse
  con él. Instrument Serif queda solo en la palabra «socrático» y la «s» del
  ícono (`font-marca`): la marca es decisión aparte (24-09-2026) y no se tocó.

- **«Confirm email» encendido (28-09-2026).** Con `mailer_autoconfirm: true`
  cualquiera podía `POST /auth/v1/signup` con contraseña y quedar con
  `email_confirmed_at` sobre un correo ajeno: `espacios.mi_correo()` le habría
  entregado sus invitaciones, y el dueño real del correo habría entrado luego
  con el código a una cuenta cuya contraseña tenía otro. El dueño lo encendió
  en el panel; `/auth/v1/settings` dice ✅ `mailer_autoconfirm: false`. Los
  altas nuevas reciben `confirm-signup.html`, que lleva `{{ .Token }}`: el
  código sigue sirviendo. La interfaz igual nunca da de alta con contraseña
  (`lib/sesion.ts`): no se relaja si alguien vuelve a apagarlo.

- **«Es familiar de» no se publica (28-09-2026).** Un parentesco entre
  personas con nombre es un dato personal (Ley 172-13). El verbo existe para
  trabajar el caso en privado, pero `espacios.publicado` no lo devuelve y
  `/p` lo filtra otra vez (`ENLACES_PRIVADOS` en `lib/espacios.ts`). El
  selector lo avisa y el panel de publicar lo dice. El dueño aprobó la
  recomendación.

- **En `/p` los datos van antes que la tesis (28-09-2026).** Primero el
  tablero, la línea de tiempo, los registros y lo que los une; después «Lo
  que sostiene su autor». Es la regla de la casa: los datos responden y el
  lector concluye (docs/IDENTIDAD.md §4). El dueño aprobó la recomendación.

- **El caso, armado con piezas abiertas (28-09-2026).** El dueño pidió
  «una solución completa» para armar casos. No se adoptó una plataforma
  entera: Aleph se volvió producto de pago, OpenAleph es pequeño y pesado,
  Datashare es AGPL y tldraw pide licencia. Se armó con piezas que pasan el
  criterio de código abierto:
  - React Flow (`@xyflow/react`, MIT) para el tablero;
  - Tiptap (`@tiptap/*`, MIT) para la narración;
  - TanStack Table v8 para la evidencia. La v9 salió en agosto de 2026 y
    todavía no tiene el recorrido que el criterio exige;
  - FollowTheMoney como vocabulario de relaciones y formato de salida. No es
    una dependencia: `lib/ftm.ts` escribe su JSON.

  La atribución de React Flow se queda visible. La licencia permitiría
  quitarla, pero sus autores piden hacerlo solo con la suscripción Pro
  (docs/PLAN-ESPACIOS.md §7).

- **La conversación (28-09-2026).** El dueño pidió un componente social tipo
  Reddit sobre todo registro. Decidió tres cosas:
  - solo comenta quien registró su cédula; vota cualquier cuenta;
  - se modera después: tres denuncias ocultan lo denunciado hasta que se
    revise;
  - se construye en el Postgres de Supabase que ya existe, no en Discourse.

  Se implementó en `/comunidad` y al final de las fichas con página propia:
  proceso, norma, iniciativa, expediente, legislador, proveedor, institución,
  obra e investigación publicada (docs/PLAN-ESPACIOS.md §6). Aplicar su
  migración es un paso aparte que requiere aprobación.

- **Código abierto probado, nunca proyectos pequeños sin probar (28-09-2026).**
  Antes de escribir algo propio se busca una pieza de código abierto que lo
  resuelva; antes de adoptarla, pasa este criterio: uso amplio en producción
  (organizaciones conocidas, descargas o instalaciones en el orden de
  cientos de miles), más de un mantenedor o respaldo de una fundación o
  empresa, versiones publicadas en los últimos seis meses, historial de
  seguridad atendido y licencia permisiva (MIT, Apache 2.0, BSD, MPL; GPL
  solo para un servicio aparte, nunca dentro del código de la app). Lo que
  no lo pasa no entra aunque ahorre trabajo. La pila actual ya lo cumple:
  Next.js, React, Tailwind, Radix/shadcn, zod, cheerio, pdf.js, vaul, cmdk,
  PostgreSQL vía Supabase. Una dependencia nueva se justifica en el cuerpo
  del commit contra estos puntos.

- **La cabecera es la palabra, sin placa (28-09-2026).** El dueño pidió quitar
  la «s» en placa de la cabecera: la marca ahí es «socrático» sola, más
  grande, con fibra, canto y un asentarse atado al desplazamiento
  (docs/IDENTIDAD.md §La marca y §Relieve). La placa sigue en el favicon y el
  ícono de la app.

- **Cuentas y espacios del lector** (28-09-2026). El dueño pidió una portada que
  explique por qué crear una cuenta y espacios donde guardar registros, armar
  proyectos de investigación que enlacen registros distintos, anotarlos,
  publicarlos, trabajarlos con otras personas y recibir alertas; eligió
  **cuentas reales en Supabase** frente a espacios solo en el navegador. Es la
  segunda excepción a la invariante, con el mismo contrato que la primera: un
  esquema propio (`espacios`), RLS en cada tabla, solo claves publicables en la
  app, y **ningún dato del Estado** en la base —se guarda la referencia (tipo,
  identificador, título, enlace, huella), nunca la cifra: el registro se sigue
  leyendo de su origen—. Una ficha no toca la DB; pinta un componente de
  `components/espacios/` (los hooks lo vigilan). La migración y la exposición
  del esquema en el API se aplican **solo con la aprobación del dueño**
  (`docs/PLAN-ESPACIOS.md` §Aplicar). Las alertas por correo o push siguen
  abiertas (arriba): las alertas de la cuenta se ven al entrar, en cualquier
  dispositivo.

- **El buscador no va a una base de datos** (26-09-2026). Se propuso una
  búsqueda híbrida en Postgres (texto por idioma + trigramas + `pgvector`,
  fundidos por RRF, en Supabase). El dueño la descartó: la plataforma es un
  arnés sobre datos que publica el Estado, y **guardarlos** en una base
  propia rompe el principio de datos abiertos —cada cifra se lee de su
  origen o de una instantánea versionada que cualquiera puede auditar—.
  `/buscar` hace lo mismo en memoria, sobre archivos del repositorio
  (`docs/ARQUITECTURA.md` §Búsqueda). No se re-propone por tamaño ni por
  rendimiento: si el corpus crece, se poda o se particiona el índice.

- **Nombre: socratico** (24-09-2026). El repositorio pasó a
  `javiergarcferrer/socratico` y el proyecto de Vercel a `socratico`, con
  `socratico.vercel.app` como dirección de producción; el dueño pidió borrar
  `brillo-soft.vercel.app`.

- **Relieve en lo pulsable, sistema de movimiento e índice por tarea**
  (25-09-2026). El dueño pidió textura y profundidad en los componentes
  pulsables, un sistema de movimiento y una semántica ergonómica que ordene la
  plataforma entera. Se resolvió sin romper «el papel no flota»: la
  profundidad pasa a ser **semántica** —lo que se lee es plano, lo que se pulsa
  tiene canto y fibra, lo que está puesto está hundido, lo que se superpone
  flota— y sigue sin haber sombra de vidrio ni degradado
  (`docs/IDENTIDAD.md` §Relieve, §Movimiento, §Ergonomía 11–12). El índice
  por tarea sustituye a `PAGINAS_PLATAFORMA` y lo vigila el gate.

- **La palabra «socrático» solo sobre azul** (25-09-2026). El dueño aprobó la
  versión sobre el azul `marca` y rechazó la palabra entera sobre blanco. El
  sistema de diseño (artefacto «Socrático») y `docs/IDENTIDAD.md` lo fijan:
  sobre papel, la marca es la placa del ícono.

- **Clasificadores de IA (Jev, `typesafe-ai/jev` por el AI Gateway de
  Vercel) solo donde cambian la experiencia** (24-09-2026). El dueño pidió
  usarlo donde marque una diferencia grande y en ningún otro sitio. Evaluado:
  no puede correr en una petición (exige `AI_GATEWAY_API_KEY` o el token OIDC,
  y las superficies no llevan secretos), así que solo cabe al generar una
  instantánea. Donde más rendía —la materia de los decretos en `/normativa`—
  las reglas le ganan: los títulos son de fórmula y el origen ya etiqueta la
  institución, así que `materiaDe` (`lib/normativa.ts`) deja 6 % sin materia,
  corre sobre la lectura en vivo, cuesta cero y es auditable. Obras ya trae
  sector oficial, el Congreso sus 15 grupos (RECON §9) y compras se lee en
  vivo. Lo que queda abierto (la clave) está arriba, en Abiertas.

- **Cabecera sin preguntas; megamenú** (23-09-2026). El dueño pidió quitar
  las preguntas («¿Qué compra?») de la cabecera y un megamenú. La cabecera
  lleva tres puertas —Dinero público, Leyes, El Estado— que abren un panel con
  toda la plataforma, cada destino con su línea en llano (`lib/menu.ts`,
  `components/megamenu.tsx`); el teléfono muestra lo mismo en la hoja «Más».
  La pregunta sigue en los titulares de página y como palabra clave de la
  paleta.

- **XLSX sin dependencia**: `lib/deuda.ts` lee el ZIP directamente.
- **El Senado se lee por su consultante público**, no por su WordPress (401).
- **Los PDF se rasterizan** con pdf.js *legacy* sobre un canvas a través de
  `/api/documento`; un PDF en `<iframe>` no pinta nada en móvil.
- **Las ramas `claude/*` se pueden empujar** (14-09-2026). El guard solo
  admitía `main`, así que una sesión no podía enseñar su trabajo antes de
  desplegarlo: Vercel levanta el preview de una rama cuando llega al remoto.
  Se abrió una excepción por prefijo en `.claude/hooks/guard-bash.sh`, y nada
  más: `main` sigue siendo lo único que despliega, y la **estampa del gate se
  sigue exigiendo para cualquier push**, rama incluida. La decisión se tomó
  para ver la pasada de shadcn/ui desde el teléfono.

