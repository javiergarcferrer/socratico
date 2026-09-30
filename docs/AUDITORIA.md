# AUDITORÍA — Fuentes de datos del Estado dominicano

Auditoría de campo de las fuentes públicas del Estado dominicano, como fase 0
del **tablero de gobierno**: la evolución del panorama hacia un cuadro de mando
transversal (fiscal, económico, normativo, integridad, electoral, judicial,
social) sobre la misma arquitectura de la plataforma — sin base de datos, sin
claves, lectura en vivo con caché.

- **Fecha:** 2026-08-31
- **Método:** peticiones HTTP directas con User-Agent identificable
  (`Socratico-Inteligencia/1.0`), 2–6 por host, empezando siempre por
  `robots.txt`. Sin volumen, sin evasión de bloqueos, sin tocar nada con
  autenticación.
- **Convención:** ✅ = comprobado contra una respuesta real. ⚠️ = parcial o con
  fricción. ❌ = bloqueado o inviable hoy. Todo lo no marcado es hipótesis.

> Hermano de `RECON.md` (reconocimiento profundo del Congreso). Este documento
> es ancho: mapea el resto del Estado con menos profundidad por fuente, y
> señala dónde hará falta una recon dedicada antes de integrar.

> **Segunda pasada: 2026-09-01.** 43 hosts sondeados; corrige tres veredictos de
> esta primera versión (SIGEF, DGII, DGCP) y cierra los «por mapear». Está al
> final del documento, en **SEGUNDA PASADA**. Las filas de la tabla de abajo
> marcadas **↓** quedan superadas por ella.
>
> **Tercera pasada: 2026-09-24.** Barrido de todo el Estado en seis frentes
> (datos.gob.do, macro y finanzas, social, justicia e integridad, energía y
> territorio, bibliotecas WordPress) sobre más de 120 hosts. Siete fuentes nuevas
> integradas y una veintena mapeadas. Va después de la segunda, en **TERCERA
> PASADA** (§G); corrige §4.3 y §B.1 (Cámara de Cuentas ya responde), §5.2
> (Poder Judicial: cadena TLS incompleta, resoluble) y §5.3 (el TC sí se lee).
>
> **Cuarta pasada: 2026-09-29.** Pedido del dueño: todas las entidades públicas,
> los bancos, el registro mercantil y las personas expuestas políticamente, «todo
> lo que un abogado necesita para investigar». Seis frentes de reconocimiento y
> cinco capas nuevas. Va al final, en **CUARTA PASADA** (§H); corrige §5.6 (la
> lista de la SB es HTML abierto con RNC), §5.7 (SIPEN: robots abierto, TLS sano),
> §G.6 (Cámara de Cuentas y PGR vuelven a 470) y §A.7 (el «Directorio Virtual»
> del SISMAP no existe).

---

## 0. Resumen ejecutivo

**El Estado dominicano no tiene una API; tiene tres familias de acceso**, y la
plataforma ya sabe hablar con las tres:

1. **APIs reales, casi siempre con clave.** BCRD (swagger verificado, 6
   endpoints de macrovariables — credenciales requeridas), Superintendencia de
   Bancos (gateway vivo). La clave rompe la regla «sin secretos» de la
   plataforma: integrarlas exige una decisión explícita del dueño (§8.3).
2. **CMS abiertos (WordPress/Umbraco) que publican archivos.** Transparencia
   Fiscal, DIGEPRES, Contraloría, TSS, Hacienda: robots abiertos, sitemaps,
   y datos en XLSX/PDF. La estrella es **Crédito Público**: series de deuda en
   XLSX con URL predecible por mes (§3.3).
3. **Apps de consulta legacy sin API (WebForms/MVC).** El consultante del
   Senado se consulta con el patrón token+POST. La Consultoría Jurídica salió
   de esta familia en septiembre de 2026: su portal nuevo expone un buscador
   JSON (§4.1).

**El bloqueador real es el WAF, no la política.** El patrón de `robots.txt`
dominante es el bloque gestionado de Cloudflare: veta por nombre a los
rastreadores de *entrenamiento* de IA y deja `User-agent: *` permitido, a veces
con señales de contenido (`ai-train=no, use=reference`). Nuestra lectura en
vivo con atribución es exactamente el uso que esas señales permiten. Pero tres
fuentes valiosas responden 403/challenge al agente honesto (ONE, DGII, Cámara
de Cuentas) — ahí la vía es institucional, no técnica.

| Eje | Fuente | Qué tiene | Vía | Estado |
|---|---|---|---|---|
| Macro | Banco Central | Inflación, IPC, tasas, sector real/externo | API con clave **+ archivos del CDN sin clave** | ⚠️→✅ ↓ §A.6 |
| Macro | ONE / ANDA | Censos, encuestas, microdatos | — | ❌ WAF Cloudflare |
| Fiscal | Crédito Público | Deuda SPNF mensual (saldo, evolución, desembolsos) | **XLSX URL predecible** | ✅ |
| Fiscal | **SIGEF (Hacienda)** | **Ejecución de gastos e ingresos, mensual, por institución** | **API JSON/CSV/XLSX sin clave** | ✅ ↓ §A.1 |
| Fiscal | Transparencia Fiscal | La vitrina que construye las llamadas al SIGEF | WP abierto | ✅ ↓ §A.1 |
| Fiscal | DIGEPRES | Presupuesto, ejecución | WP abierto, PDFs | ⚠️ PDF |
| Fiscal | MapaInversiones | Inversión pública: proyecto ↔ contrato ↔ territorio | **15 CSV abiertos + búsqueda JSON** | ✅ ↓ §A.4 |
| Fiscal | DGII | **Padrón de RNC (788,700 contribuyentes)** | **ZIP estático semanal** | ❌→✅ ↓ §A.2 |
| Normativa | **Consultoría Jurídica** | **Leyes, decretos, reglamentos, resoluciones, Gaceta** | Buscador JSON (`/api/consultas/search`), PDF por `DocId` | ✅ |
| Integridad | Contraloría | Nóminas aprobadas, informes | WP abierto | ✅ mapear |
| Integridad | Cámara de Cuentas | Declaraciones juradas, auditorías | — | ❌ WAF (HTTP 470) |
| Integridad | datos.gob.do | 1,206 datasets declarados; **159 responden a «nómina»** | Índice HTML paginado (su `/api/` sigue vetado) | ✅ ↓ §A.8 |
| Electoral | JCE | Resultados por elección, estadísticas | Descargas tras CAPTCHA (Zenedge) | ✅→❌ ↓ §B.3 |
| Judicial | Poder Judicial | Sentencias, estadísticas | `transparencia.` sí responde | ⚠️ TLS roto en `www.` |
| Judicial | Tribunal Constitucional | Sentencias TC | Sin robots | ⚠️ sin mapear |
| Social | TSS | Cotizantes, empleadores (mensual) | WP abierto | ✅ mapear |
| Social | SIPEN | Fondos de pensiones | Cloudflare signals, `*` permitido | ⚠️ sin mapear |
| Social | **PUT (DIGEIG)** | **Nómina estatal individual** + consulta de decretos | Power BI sin API utilizable | ⚠️ vía CSV por institución (§5.9) |
| Admin. | SISMAP + SISMAP Municipal | Gestión pública e institucional, y por ayuntamiento | **Tablas server-rendered** (no hay SPA) | ⚠️→✅ ↓ §A.7 |
| Finanzas | Superintendencia de Bancos | Series del sistema financiero | `apis.sb.gob.do` vivo | ⚠️ clave |
| Comercio | DGA (Aduanas) | Comercio exterior | Sin robots; sin ruta estable hallada | ⚠️ ↓ §A.10 |
| Compras | **DGCP (ya integrada)** | **+ ofertas, proveedores, catálogo y PACC** | Misma API abierta, endpoints sin usar | ✅ ↓ §A.3 |
| Precios | **MICM** | **Precios de combustibles, semanales** | Portada + sitemap de avisos | ✅ ↓ §A.5 |

---

## 1. Línea base: lo ya integrado

| Fuente | Capa | Mecánica |
|---|---|---|
| DGCP (compras) | `lib/dgcp.ts` | API JSON abierta, paginada |
| SIL Cámara de Diputados | `lib/congreso.ts` | API JSON interna sin auth |
| SIL Senado (consultante) | `lib/senado.ts` | HTML + sesión por colección + postback |
| Nómina (instantánea) | `lib/nomina*.ts` | JSON estático propio |

La plataforma ya demostró tres capacidades que esta auditoría vuelve a
necesitar: leer APIs JSON hostiles a bots (UA identificable + validación de
content-type), automatizar apps WebForms con sesión y ViewState, y cachear
resultados parseados con `unstable_cache` cuando el caché de fetch no aplica.

---

## 2. Eje macroeconómico

### 2.1 Banco Central (BCRD) — ⚠️ API oficial con credenciales

- ✅ `www.bancentral.gov.do` **no tiene robots.txt** (redirige a E404).
- ✅ `api.bancentral.gov.do/swagger/v1/swagger.json` responde: **API BCRD v1**
  con 6 endpoints POST estilo RPC (framework ABP):
  `MacroVariables/Inflacion`, `v2/HistoricoIPC`, `MacroVariables/Monetarias`,
  `SectorReal`, `SectorExterno`, `HistoricoTasas`.
- ✅ Probado `Inflacion` con cuerpo vacío → `{"success":false, "error":
  {"message":"Credenciales de acceso inválidas"}}`. El `MacroInputDto` lleva
  las credenciales; el portal para desarrolladores es
  `apibcrd.bancentral.gov.do` (enlazado en el pie oficial como «API»).
- ⚠️ Los archivos estadísticos históricos (`gdc.bancentral.gov.do/...`)
  reorganizaron sus rutas: el clásico `DOLAR_REFERENCIA_MC.xls` da 404. Las
  series siguen publicadas vía la sección de estadísticas; URLs por re-mapear.

**Lectura:** la fuente macro más valiosa del país (tipo de cambio, inflación,
tasas) está a un registro de distancia. El costo no es técnico: es la regla
«sin variables de entorno» de la plataforma (§8.3).

### 2.2 ONE / ANDA — ❌ WAF

- ✅ `one.gob.do/robots.txt`: bloque Cloudflare con señales de contenido —
  `User-agent: *` → `Allow: /` con `ai-train=no, use=reference`. **La política
  permite nuestro uso** (lectura en vivo, referencia con atribución).
- ❌ Pero la home responde **403** al UA identificable, y el catálogo de
  microdatos `anda.one.gob.do` sirve el challenge «Just a moment…» de
  Cloudflare incluso en su API (`/index.php/api/catalog/search`).
- **Vía de desbloqueo:** solicitud a la ONE (Ley 200-04 o su mesa de datos
  abiertos) para lista blanca del UA/IP. No evadir el challenge.

---

## 3. Eje fiscal

### 3.1 Portal de Transparencia Fiscal — ✅

- ✅ `www.transparenciafiscal.gob.do` — WordPress; robots solo veta
  `/wp-admin/`; **su API REST de WP está expuesta** (`/wp-json/`), a
  diferencia del WP del Senado.
- ✅ Secciones de ejecución: `/presupuesto/`, `/ingresos/ejecucion-de-los-ingresos/`,
  `/gastos/ejecucion-de-los-gastos/`, `/financiamiento/`, `/gobiernos-locales/`
  y **`/datos-abiertos/`** con «Diccionario de Datos» en XLSX.
- ⚠️ Los formatos concretos por sección (CSV vs XLSX vs Power BI embebido)
  quedan por mapear en la recon dedicada.

### 3.2 DIGEPRES — ⚠️ abierto pero en PDF

- ✅ `digepres.gob.do` (sin `www`) — WP, robots `Disallow:` vacío (todo
  permitido), sitemap.
- ⚠️ Lo visible en portada es informe de ejecución **en PDF**
  (`Informe-Ejecucion-presupuestaria-Junio-2026.pdf`). Los datos estructurados
  del presupuesto viven en Transparencia Fiscal (§3.1) y en su «presupuesto
  ciudadano».

### 3.3 Crédito Público (deuda) — ✅ la estrella del eje

- ✅ `www.creditopublico.gob.do` — ASP.NET MVC; sin robots real (catch-all).
- ✅ `/inicio/estadisticas` publica las series de **deuda del Sector Público
  No Financiero** como XLSX con URL predecible:

  ```
  /Content/estadisticas/anual/2026/11Julio/09Saldo Deuda Histórico Sector Público No Financiero por Acreedor.xlsx
  /Content/estadisticas/anual/2026/11Julio/08Saldo Evolución Deuda del Sector Público No Financiero.xlsx
  /Content/estadisticas/anual/2026/11Julio/06Evolución Mensual de la Deuda Interna….xlsx
  /Content/estadisticas/anual/2026/13Junio/…   ← mes anterior, mismo esquema
  ```

  Patrón: `/Content/estadisticas/anual/{año}/{NN}{Mes}/{NN}{serie}.xlsx`, un
  juego por mes. Saldo, evolución interna/externa, desembolsos por fuente.
- Es el candidato #1 del tablero: indicador de deuda actualizado mensualmente,
  sin clave, sin WAF, con historia.
- ⚠️ **La URL no es predecible hacia atrás** (verificado el 2026-09-23 desde un
  sandbox con egreso, UA identificable). El número de la carpeta cambia entre
  años (`14Al 30 de Junio` en 2021, `16Al 30 de Junio` en 2016) y el origen
  **retira los meses intermedios**: de cada año cerrado quedan diciembre y los
  tres trimestres; del año en curso, los dos últimos meses y los trimestres.
  Una ruta inventada responde **200 con HTML** (32 KB), así que se valida el
  content-type. El listado de cada año sí se lee por GET:
  `/inicio/estadisticas?dlAnio=AAAA` (el formulario es POST, pero el GET con el
  mismo parámetro responde igual). «Saldo Evolución» aparece desde 2015.
- ⚠️ **La hoja trae dos columnas «Saldo»**: apertura (31-dic del año anterior,
  col. C) y cierre del período (col. M; col. N antes de 2020, cuando la
  etiqueta iba en la C), con su fecha como serie de Excel en la fila de
  debajo. La plataforma leía la C y mostraba como «Jul-26» el saldo del
  31-dic-2025 (US$ 61,549.9 M); el de julio de 2026 es US$ 67,827.8 M. Varias
  celdas son fórmulas compartidas (`<f t="shared" …/>`) con su valor en `<v>`.
- ✅ `scripts/build-deuda.py` recorre los listados 2015→hoy (44 cierres) y el
  histórico anual `/historico/saldo/01Saldo Deuda Histórico (1970-2025).xlsx`
  (metodología nueva, 2000–2025, con % del PIB) hacia `public/data/deuda.json`.

### 3.4 MapaInversiones — ✅ vivo, por mapear

- ✅ `mapainversiones.gob.do/Home` responde 200 (211 KB, **server-rendered**,
  ASP.NET MVC — no una SPA): inversión pública proyecto a proyecto
  (plataforma BID; `mapainversiones.economia.gob.do` redirige aquí).
- ⚠️ Sus endpoints JSON internos (los que alimentan los gráficos) quedan por
  extraer del HTML/JS en la recon dedicada.

### 3.5 Hacienda — ✅ abierta (paraguas)

- ✅ robots Yoast: solo veta rutas de comunidad; sitemap disponible. Es el
  paraguas institucional; los datos operativos están en §3.1 y §3.3.

### 3.6 DGII — ❌ hoy

- ❌ El histórico web service público de RNC (`/wsMovilDGII/WSMovilDGII.asmx`)
  **fue retirado**: redirige al home en ambos hosts.
- ❌ La consulta RNC web (`/app/WebApps/ConsultasWeb/consultas/rnc.aspx`)
  responde **403** al agente identificado.
- **Impacto:** el cruce RNC↔proveedores DGCP (enriquecer `/proveedores/[rpe]`)
  queda bloqueado salvo acuerdo con DGII. No evadir el 403.

---

## 4. Eje normativo e integridad

### 4.1 Consultoría Jurídica del Poder Ejecutivo — ✅ el hallazgo del eje

- ✅ `www.consultoria.gov.do/robots.txt`: **solo** el preámbulo de señales de
  contenido de Cloudflare, sin una sola regla `User-agent`/`Disallow` — sin
  restricciones declaradas.
- ✅ `/consulta/` («Consulta Externa») — app MVC de **Leyes y Decretos** con
  taxonomía verificada en su formulario:

  | Código | Tipo |
  |---|---|
  | 1 | Leyes |
  | 3 | Decretos |
  | 4 | Reglamentos |
  | 5 | Varios |
  | 7 | Resoluciones |
  | 1014 | **GACETA OFICIAL** |

- ❌ **La app MVC murió (verificado 2026-09-23).** El portal se rehízo en
  Next.js; `/consulta/` redirige a `/consulta` y esta da **404**. El adaptador
  viejo (token antiforgery + `POST /Consulta/Home/Search`) degradaba a lista
  vacía y `/normativa` mostraba «no respondió» sin estar caído el origen.
- ✅ **Mecánica actual (verificada 2026-09-23, UA identificable):**
  - Robots nuevo: `Allow: /`; solo veda `/oficina-virtual/dashboard/`,
    `/api/auth/` y `/api/admin/`.
  - Búsqueda: `POST /api/consultas/search`, cuerpo JSON, **sin token ni
    sesión**. Campos: `DocumentTypeCode` (1, 3, 4, 5, 7), `DocumentNumber`,
    `PublicationYear` (`"2026"` o `"2020-2026"`), más filtros de persona e
    institución a `""`/`0`. Responde 201 con la lista entera, sin paginar:
    decretos 2026 = 570 filas, 640 KB, ~3,5 s; una cita por número ~0,9 s.
  - Fila: `DocId`, `TipoDocumento`, `Tipo` (plural: «Decretos»), `Numero`,
    `Titulo`, `Gaceta`, `FechaPromulgacion`/`FechaPublicacion` ISO,
    `Institucion`, `Presidente`, `Consultor`, y para designaciones `Nombre`,
    `Apellido`, `Cargo`.
  - Texto: `GET /api/document/{DocId}` → PDF `inline`, con capa de texto.
  - ⚠️ **Gaceta Oficial ya no está en el buscador** (el tipo 1014 desapareció
    de `/api/consultas/document-types`). Vive en el repositorio:
    `GET /api/documents?category=gacetas` → JSON con las 292 gacetas
    2020–2026 (número, mes, año, `fileUrl` = `PDF|portada`). No trae día.
  - ⚠️ Reglamentos casi vacíos en el origen (2020: 11; 2024–2026: 0): la
    mayoría se dicta por decreto. «Sin resultados» es cierto, no un fallo.
- ❌ **Cloudflare desafía el egreso de Vercel (verificado 2026-09-23).** Desde
  las funciones de producción, buscador, repositorio y PDF responden `403` con
  `cf-mitigated: challenge`; desde otra red, 201. Es un bloqueo del WAF y no se
  rodea (ni cabeceras de navegador, ni proxies). Mitigación vigente:
  `lib/normativa.ts` intenta en vivo y cae a `public/data/normativa.json`
  (`scripts/build-normativa.py`: 4 años × leyes, decretos, reglamentos,
  resoluciones, más todas las gacetas; ~1,1 MB), que `/normativa` y `/fuentes`
  declaran con su fecha. Las citas del Congreso resuelven contra ella solo en
  esos 4 años. Regenerar al menos semanal. El visor no puede traer el PDF: el
  enlace «Abrir en el origen» es la vía.
  - **Desbloqueo institucional (lo gestiona el dueño):** pedir a la
    Consultoría (TIC) una regla de Cloudflare que permita el User-Agent
    `Socratico-Inteligencia/1.0` —o `Verified Bot`— sobre `/api/consultas/*`,
    `/api/documents` y `/api/document/*`, solo lectura, con el volumen actual
    (unas decenas de consultas por hora, cacheadas).
- Es la fuente del vertical **Normativa**: «qué decreta el Ejecutivo» — la
  tercera pata que falta al triángulo legislativo (Diputados ✅, Senado ✅,
  Ejecutivo ⬜).

### 4.2 Contraloría — ✅ abierta, por mapear

- ✅ WP con robots abierto y sitemap. Publica informes y nóminas aprobadas;
  formatos por mapear.

### 4.3 Cámara de Cuentas — ❌ WAF (corregido: ✅ responde desde 2026-09-24, §G.6)

- ❌ `www.camaradecuentas.gob.do` responde **HTTP 470** (código no estándar de
  bloqueo) con página de 33 KB a cualquier ruta, robots incluido. Las
  declaraciones juradas de patrimonio — pieza central de integridad — quedan
  inalcanzables por ahora. Vía: Ley 200-04.

### 4.4 datos.gob.do — ⚠️ CORRECCIÓN: útil como índice, no como API

- ✅ robots **sin cambios** desde la recon: `Disallow: /api/` (y `/revision/`,
  `/dataset/*/history`), `Crawl-Delay: 10`.
- ⚠️ `/dataset/` sirve un cascarón con render en cliente: ni el conteo de
  datasets es visible server-side.
- ✅ **Pero la búsqueda HTML (`/dataset?q=`) sí expone los slugs**, y las
  fichas de dataset exponen **las URL directas de los archivos** en los
  portales institucionales (`{institución}.gob.do/...nomina.csv`). Por esa vía
  —sin tocar `/api/`— se localizaron las nóminas CSV de 10 instituciones que
  hoy alimentan la foto transversal de `/nomina` (§5.9). El veredicto sube de
  «marginal» a **índice útil de enlaces directos**; su API sigue vetada por su
  propio robots.

---

## 5. Eje electoral, judicial y social

### 5.1 JCE — ✅ accesible, mapear por elección

- ✅ Sin robots (404). Home enlaza **`elecciones2024.jce.gob.do`**
  (presidenciales/congresuales y municipales), `jce.gob.do/Estadisticas`,
  histórico de «Elecciones Anteriores» y un repositorio de resultados.
- ⚠️ El sitio de resultados es DotNetNuke server-rendered; cada comicio tiene
  su propio sitio y formato (los boletines JSON de la noche electoral suelen
  existir pero cambian por elección). Recon dedicada por comicio.

### 5.2 Poder Judicial — ⚠️ matiz importante (cadena TLS incompleta, resoluble: §G.6)

- ❌ `www.poderjudicial.gob.do` **no valida TLS desde este entorno**: «unable
  to get local issuer certificate» — cadena incompleta en el servidor (falta
  el intermedio), no un geobloqueo. Puede funcionar desde otros egress que
  completen la cadena vía AIA.
- ✅ **`transparencia.poderjudicial.gob.do` sí responde** (Azure): robots
  abierto salvo `/reportePDF/`. Vía viable para estadísticas/portal de
  transparencia judicial.

### 5.3 Tribunal Constitucional — ⚠️ sin mapear (corregido: ✅ integrado, §G.6)

- ✅ Sin robots (404). El buscador de sentencias TC queda por recon dedicada.

### 5.4 TSS — ✅ abierta, por mapear

- ✅ WP, robots solo veta `/wp-admin/`. Publica estadísticas mensuales de
  cotizantes/empleadores (histórico en XLSX); URLs por mapear.

### 5.5 SISMAP — ⚠️ SPA con API interna

- ✅ Sin robots; landing en `/` y app real en `/GestionPublica` (cascarón de
  3 KB → Angular). Sus indicadores de gestión pública municipal/institucional
  se sirven por una API interna que hay que extraer del bundle (patrón
  Diputados).

### 5.6 Superintendencia de Bancos — ⚠️ API con clave

- ✅ `sb.gob.do` — Umbraco, robots solo veta `/umbraco`.
- ✅ **`apis.sb.gob.do` existe y responde JSON** (`{"statusCode":404,
  "message":"Resource not found"}` en raíz — gateway estilo APIM vivo).
  El programa de APIs de la SB requiere suscripción; mismo dilema que BCRD.

### 5.7 SIPEN — ⚠️ permitida, por mapear

- ✅ robots Cloudflare-managed: veta rastreadores de IA por nombre;
  `User-agent: *` permitido. Series de pensiones por mapear.

### 5.8 DGA (Aduanas) — ⚠️ por mapear

- ✅ Sin robots (404). Estadísticas de comercio exterior por recon dedicada.

### 5.9 Nómina estatal — Portal Único de Transparencia (añadido en esta pasada)

Investigación disparada por la pregunta «¿dónde vive la nómina estatal
completa?»:

- ✅ **`transparencia.gob.do`** (Portal Único de Transparencia, DIGEIG) existe:
  WordPress con `wp-json` abierto. Su sección **Consultas** publica dos
  tableros ciudadanos: **Nóminas** y «Consulta Oficial de Decretos del Poder
  Ejecutivo».
- ✅ El tablero de Nóminas es un **Power BI «publish to web»** con la nómina
  estatal a nivel **individual** (nombre, función, institución, sueldo bruto),
  filtros de año/mes y actualización declarada a 2025 — la vista completa del
  Estado que ninguna otra fuente ofrece.
- ❌ Su API subyacente no es utilizable desde un servidor: el flujo público de
  Power BI respondió **403** a `modelsAndExploration` en todos los clústeres
  probados (exige el intercambio anti-CSRF del propio JS del embed), el
  `global-redirect` está vetado por la política de egreso de este entorno, y
  `app.powerbi.com` resetea la conexión del navegador headless a través del
  proxy. Extraerlo en vivo queda descartado; el detalle individual completo
  además excedería el patrón sin-BD de la plataforma.
- ✅ **La vía que sí funciona**: las nóminas CSV que cada institución publica
  bajo Ley 200-04, localizadas vía datos.gob.do (§4.4) y consolidadas por
  `scripts/build-nomina.py` en la foto transversal de `/nomina` (último mes
  publicado por institución, sin nombres). Cobertura inicial: 11 instituciones,
  13,668 plazas, RD$569.6M de masa mensual; ampliar = añadir una línea al
  manifiesto. La cobertura parcial se declara en la UI y el tablero oficial
  queda enlazado como fuente del detalle completo.
- Los formatos reales exigieron tolerancia verificada: delimitadores `,`/`;`,
  codificaciones UTF-8/cp1252/**cp850** (heredada de DOS), columnas sinónimas
  (CARGO/FUNCIÓN/RANGO…), y filas con fechas futuras erróneas que el
  consolidador descarta.

---

## 6. Patrones transversales (lo que enseña la auditoría)

1. **Tres familias de acceso** (§0). Cada nueva integración cae en una de
   ellas, y la plataforma ya tiene el adaptador de referencia para cada una:
   `dgcp.ts` (API JSON), archivos con URL predecible (nómina; deuda §3.3),
   `senado.ts` (app legacy con sesión/token).
2. **El robots dominicano de 2026 es el bloque Cloudflare anti-IA.** Veta
   `ClaudeBot`/`GPTBot` (rastreo de entrenamiento) y permite `*`; donde hay
   señales, dicen `ai-train=no` + `use=reference`. Nuestro patrón — lectura en
   vivo, bajo volumen, atribución, sin entrenar nada — es el caso de uso que
   esas políticas contemplan como permitido. Mantener el UA identificable es
   lo que nos deja del lado correcto de esa línea.
3. **WAF ≠ política.** ONE permite por robots y bloquea por Cloudflare; la
   Cámara de Cuentas responde un 470 no estándar; DGII 403. La respuesta
   correcta es institucional (lista blanca, Ley 200-04), nunca rotar UA/IP.
4. **TLS mal configurado se disfraza de bloqueo** (PJ §5.2). Diagnosticar
   antes de declarar una fuente muerta; a veces hay un host hermano bien
   configurado (`transparencia.`).
5. **Los portales «de datos abiertos» formales rinden menos que las apps de
   consulta operativas.** datos.gob.do (2 verificaciones) y los PDF de
   DIGEPRES rinden menos que el consultante del Senado, la consulta de la
   Consultoría o los XLSX de Crédito Público. Buscar la herramienta que la
   institución usa de verdad, no la vitrina.

---

## 7. El tablero de gobierno: modelo

El panorama de `/` ya es un tablero embrionario (indicadores + señales). El
tablero de gobierno es su generalización en tres capas, todas sobre la
arquitectura actual:

1. **Indicadores** — cifras de cabecera por eje con fecha de corte declarada:
   deuda SPNF (mensual), inflación/tasa de cambio (diaria, si BCRD),
   ejecución presupuestaria (mensual), cotizantes TSS (mensual). Cada
   indicador es una función en su `lib/*` + una tarjeta en `/`.
2. **Señales** — lo que exige atención ahora (el panorama ya tiene dos:
   cierres de licitaciones y perención). Nuevas: decretos de la semana,
   emisiones de deuda recientes, nuevo mes de ejecución publicado.
3. **Verticales** — profundidad navegable por dominio (hoy: licitaciones,
   congreso, nómina). Siguientes: **normativa** (Consultoría) y **finanzas
   públicas** (deuda + ejecución).

Regla de honestidad que hereda todo el tablero: cada indicador declara su
fuente y su fecha de corte, y `/fuentes` documenta cada conexión con sus
límites (como ya hace con las cuatro actuales).

---

## 8. Plan de integración por fases

> **Estado (2026-09-01): Fases 1 y 2 implementadas y en producción.** El
> indicador de deuda (`lib/deuda.ts`, tarjeta en el panorama) y la vertical de
> normativa (`lib/normativa.ts`, `/normativa`) ya están desplegados. Ambos
> siguen el patrón sin-BD. Además se implementó **Democracia Legislativa**
> (`/democracia`), la única excepción con base de datos, documentada en
> `PLAN-DEMOCRACIA.md`.

### Fase 1 — Deuda pública (Crédito Público) · esfuerzo bajo, valor alto
- `lib/deuda.ts`: resolver el XLSX del mes vigente sondeando el patrón de URL
  (§3.3) con fallback al mes anterior; parsear la serie de saldo/evolución;
  `unstable_cache` con ventana diaria. **Decisión previa:** parsear XLSX exige
  una dependencia (p. ej. `exceljs`) o un parser mínimo propio de la hoja
  concreta; alternativa sin dependencia: indicador de «último mes publicado» +
  enlace, sin cifras. Recomendación: dependencia liviana, los datos lo valen.
- Panorama: tarjeta «Finanzas públicas» con saldo total, variación mensual y
  fecha de corte. `/fuentes`: entrada nueva.

### Fase 2 — Normativa del Ejecutivo (Consultoría Jurídica) · esfuerzo medio, valor alto
- `lib/normativa.ts` con el patrón Senado: GET `/consulta/` → extraer
  `__RequestVerificationToken` → `POST /Consulta/Home/Search` (tipo 3 =
  decretos; 1 = leyes; 1014 = Gaceta), parsear resultados, documentos vía
  `GetDocument?reference={guid}`.
- Vertical `/normativa` (sección nueva en `lib/secciones.ts`): listado por
  tipo + búsqueda + señal «decretos de los últimos 7 días» en el panorama.
- Recon previa: 1 sesión para fijar la forma exacta de la respuesta del Search
  (HTML parcial AJAX) y su paginación.

### Fase 3 — Macro (BCRD) · esfuerzo bajo, requiere decisión de secretos
- La API BCRD necesita credenciales → **rompe la regla «sin variables de
  entorno»**. Opciones, en orden de preferencia:
  1. Registrarse y aceptar **una** excepción acotada (una env var en Vercel,
     documentada en CLAUDE.md como la única).
  2. Re-mapear los archivos públicos de `gdc.bancentral.gov.do` (sin clave,
     más frágil).
  3. Posponer el eje macro.
- Con (1): `lib/macro.ts` (inflación interanual, tasas de referencia, tipo de
  cambio) + indicadores en panorama.

### Fase 4 — Ampliaciones mapeadas
- **Transparencia Fiscal**: recon de `/datos-abiertos/` y series de ejecución;
  `lib/fiscal.ts`; completa el vertical de finanzas públicas junto a la deuda.
- **MapaInversiones**: extraer los endpoints de sus gráficos; capa de
  inversión pública por provincia (conecta con la vertical de licitaciones).
- **TSS**: serie mensual de cotizantes (indicador social).
- **PJ (host transparencia)** y **TC**: recon de sentencias/estadísticas.
- **JCE**: por comicio, empezando por 2024 (archivo histórico, no alerta).

### Sin vía hoy (y su desbloqueo)
| Fuente | Bloqueo | Vía de desbloqueo |
|---|---|---|
| ONE / ANDA | Challenge Cloudflare | Lista blanca / mesa de datos abiertos |
| DGII (RNC) | 403 + WS retirado | Acuerdo institucional |
| Cámara de Cuentas | HTTP 470 | Ley 200-04 |
| datos.gob.do | robots prohíbe su API | Señalar el absurdo a la OGTIC |

---

## 9. Reglas de arquitectura para el tablero

- **Un `lib/*.ts` por fuente, un contrato**: timeout, un reintento, UA
  identificable, validación de content-type, degradar a `null`, jamás tumbar
  la página. Caché por volatilidad del dato (diaria para series mensuales,
  minutos para lo vivo), con `unstable_cache` cuando la fuente exige sesión o
  URLs volátiles (precedente: `lib/senado.ts`).
- **El panorama no espera a nadie**: cada indicador llega por `Promise.all`
  tolerante a fallos individuales, como hoy.
- **`/fuentes` crece con cada conexión** — es el contrato público del tablero:
  qué se lee, con qué límites, qué está bloqueado y por qué.
- **Nunca**: evadir un WAF o challenge, rotar UA, tocar endpoints con
  autenticación ajena, scrapear donde el robots del host lo prohíba para `*`.

---

## 10. Pendientes, en orden

1. Decisión del dueño sobre §8.1 (dependencia XLSX) y §8.3 (excepción de
   credenciales BCRD).
2. Fase 1 (deuda) — ejecutable ya con esta auditoría.
3. Recon dedicada de la Consultoría Jurídica (forma de respuesta del Search) →
   Fase 2.
4. Recon de Transparencia Fiscal `/datos-abiertos/` (formatos por sección).
5. Solicitudes institucionales: ONE (lista blanca), Cámara de Cuentas
   (Ley 200-04) — plazo largo, arrancar en paralelo.
6. Verificar desde el egress de producción el TLS de `www.poderjudicial.gob.do`
   (el fallo puede ser específico del proxy de este entorno).

---

# SEGUNDA PASADA — 2026-09-01

Auditoría de campo completa sobre las fuentes que la primera pasada dejó como
«por mapear», más un barrido de ejes que no había tocado (energía, telecom,
salud, seguridad, municipal, laboral, comercio exterior): **más de 60 hosts
sondeados** con el mismo método — UA identificable, robots primero, sin volumen,
sin evadir ningún bloqueo.

> **Tres conclusiones de la primera pasada quedan corregidas**, y las tres iban
> en la dirección de **subestimar** lo que el Estado publica: la ejecución
> presupuestaria tiene API abierta (§A.1), el padrón de RNC de la DGII se
> descarga sin clave (§A.2), y la API de compras que ya integramos tiene cuatro
> endpoints que no estábamos usando (§A.3).
>
> **Estado (2026-09-01): §A.1 y §A.3 ya están implementados y desplegados.**
> La vertical de finanzas públicas (`/finanzas`, `lib/fiscal.ts`,
> `scripts/build-fiscal.py`) y los cuatro endpoints de la DGCP —ofertas en la
> ficha de proceso, registro en la de proveedor, planes en `/planes`— son las
> fases 5 y 6 de §D. Queda pendiente §A.2 (padrón RNC), que exige decidir la
> instantánea derivada en build.

## 0. Lo que cambia el veredicto

| Fuente | Antes | Ahora | Por qué |
|---|---|---|---|
| **SIGEF / Hacienda** | no aparecía | ✅ **API JSON/CSV/XLSX sin clave** | §A.1 — ejecución de gastos e ingresos, mes a mes, institución por institución |
| **DGII** | ❌ 403, WS retirado | ✅ **padrón RNC descargable** (⚠️ consulta web sigue vetada) | §A.2 — 26.6 MB, 788,700 contribuyentes, actualizado 29-ago-2026 |
| **DGCP** | ✅ integrada (3 endpoints) | ✅ **+4 endpoints sin explotar** | §A.3 — ofertas, proveedores, catálogo, PACC |
| **MapaInversiones** | ⚠️ «endpoints por extraer» | ✅ **15 CSV abiertos + búsqueda JSON** | §A.4 |
| **BCRD** | ⚠️ credenciales; archivos «404» | ⚠️→✅ **el CDN sí sirve las series** | §A.6 — la ruta del histórico de tasa de cambio responde 200 |
| **MICM** | no aparecía | ✅ precios de combustibles semanales | §A.5 |
| **SISMAP** | ⚠️ «SPA con API interna» | ✅ **tablas server-rendered** (no hay SPA que romper) | §A.7 |
| **datos.gob.do** | ⚠️ índice útil | ✅ 1,206 datasets; **74 de nómina** frente a 11 integradas | §A.8 |
| **JCE** | ✅ «mapear por elección» | ❌ descargas tras CAPTCHA (Zenedge) | §B.3 |
| **911, Migración, SIMV** | no aparecían | ❌ WAF | §B |
| ONE · Cámara de Cuentas | ❌ | ❌ **sin cambios** | §B.1 |

---

## A. Hallazgos verificados

### A.1 ⭐ API de datos abiertos del SIGEF — la columna vertebral fiscal

El generador de «Datos abiertos» del Portal de Transparencia Fiscal (§3.1) no
sirve archivos: **construye llamadas a una API pública del Ministerio de
Hacienda**, hasta ahora no documentada en esta auditoría.

```
https://api-sigef.hacienda.gob.do/servicios/datosabiertos/portaltransparencia/
  {tipo}/{archivo}/{año}/{mes}/{formato}?seccion={sección}&capitulo={institución}
```

- ✅ **Sin clave, sin sesión, sin token.** Spring Boot; 404 en JSON limpio para
  rutas inexistentes (no hay la trampa del 200-que-no-existe del SIL).
- ✅ Tres formatos por la misma ruta: `json`, `csv`, `xlsx`.
- ✅ **Taxonomía verificada** (leída del formulario y probada contra el
  servidor):

  | tipo | archivos (`{archivo}`) |
  |---|---|
  | `ingresos` | `percibidosinstitucion`, `ftefinanc` |
  | `gastos` | `institucion` (quién gasta), `concepto` (en qué), `finalidad` (para qué), `inversion` (dónde), `fuentefinanciamiento`, `organismofinanciador`, `transferencias`, `aplicacionesfinancieras` |
  | `gastos` (institucional) | `institucionalconcepto`, `institucionalfinalidad` |

- ✅ **Secciones**: `11111` administración central, `11112` descentralizadas y
  autónomas no financieras, `11113` seguridad social.
- ✅ **Capítulos**: los **104 códigos institucionales** del presupuesto, del
  `0101` (Senado) al `5211` (TSS), incluyendo `0998`/`0999` (deuda pública y
  obligaciones del Tesoro) — 34 de administración central, 61 descentralizadas,
  9 de seguridad social. Quedaron capturados en `lib/capitulos.ts`.
  *(Corrección: esta auditoría dijo primero «99». Eran los que cabían en los
  40 KB que leyó el primer barrido; el bloque completo mide 86 KB.)*
- ✅ **Respuestas reales comprobadas**:
  - `gastos/institucion/2026/08/json?seccion=11111&capitulo=0206` → 41 KB,
    ejecución del Ministerio de Educación por unidad ejecutora y mes, con
    `PRESUPUESTO INICIAL`, `PRESUPUESTO VIGENTE`, `PREVENTIVO`, `COMPROMISO`,
    `DEVENGADO`, `PAGADO`.
  - `gastos/concepto/2026/08/json?...&capitulo=0207` → 862 KB, Salud Pública
    por cuenta (`2.1.1.1.01 REMUNERACIONES`…).
  - `ingresos/percibidosinstitucion/2026/08/json?...&capitulo=0205` → 51 KB.
  - `gastos/institucion/2025/12/csv?...&capitulo=0206` → 28 KB.
- ⚠️ **Latencia asimétrica y decisiva para el diseño**: el año corriente se
  calcula en vivo (medidos **22 s**, **23 s** y **86 s** según el corte; una
  consulta sin `capitulo` —sección entera— no respondió en 40 s), mientras un
  año cerrado responde **en 0.4 s** (cacheado arriba). La
  regla de los 25 s de `dgcpFetch` **no sirve aquí**: hay que ir a `unstable_cache`
  con ventana diaria, consulta por institución (nunca sección completa), y
  precalentar el mes vigente.
- ⚠️ El `content-type` es `application/csv` incluso cuando el cuerpo es JSON:
  validar por forma del cuerpo, no por cabecera.
- ❌ `sigef.hacienda.gob.do` (la app SIGEF) responde 403 Cloudflare — pero es
  irrelevante: la API vive en otro host y está abierta.

**Qué habilita**: la pregunta que la plataforma todavía no puede responder —
«¿en qué se gasta el dinero, institución por institución, mes a mes?» — con
la trazabilidad completa del ciclo (vigente → comprometido → devengado →
pagado). Es la pieza que convierte el panorama en tablero fiscal.

### A.2 ⭐ DGII — el padrón de RNC sí se descarga

La primera pasada declaró la DGII cerrada. Es cierto para la **consulta web**
(`rnc.aspx` y el viejo `wsMovilDGII` devuelven la portada: 200 que no es la
ruta), y su sección de estadísticas responde 403. Pero:

- ✅ `https://dgii.gov.do/app/WebApps/Consultas/RNC/RNC_CONTRIBUYENTES.zip`
  responde **200**, `application/x-zip-compressed`, **26,608,208 bytes**,
  `last-modified: 29-ago-2026`, con `accept-ranges: bytes`.
- ✅ Contiene `RNC_Contribuyentes_Actualizado_29_Ago_2026.csv` (115 MB), en
  **cp850** —la misma herencia DOS que ya toleran las nóminas—, con columnas
  `RNC, RAZÓN SOCIAL, ACTIVIDAD ECONÓMICA, FECHA DE INICIO OPERACIONES, ESTADO,
  RÉGIMEN DE PAGO`.
- ✅ **788,700 contribuyentes**: 395,737 activos, 309,059 suspendidos, 74,883
  dados de baja, 7,490 en cese temporal, 1,256 anulados, 275 rechazados.
- ❌ `DGII_RNC.zip` (el nombre antiguo) da 403. El robots de la DGII solo veta
  rutas de SharePoint (`/_layouts/`, `/_vti_bin/`, `/_catalogs/`).

**Integrado el 2026-09-23** (`scripts/build-rnc.py` → `public/data/rnc/{0..9}.json`,
`lib/rnc.ts`, ficha de proveedor). Verificación de campo de ese día:

- ✅ El ZIP sigue en la misma URL: 200 `application/x-zip-compressed`,
  26,878,229 bytes, `last-modified: 19-sep-2026`; dentro,
  `RNC_Contribuyentes_Actualizado_19_Sep_2026.csv` (115.6 MB, **791,384**
  contribuyentes). El nombre del archivo cambia con cada corte: el script lo
  lee del ZIP y de ahí saca la fecha.
- ⚠️ **Corrección: la codificación es Windows-1252, no cp850.** Leído como
  cp850, «RAZÓN» sale «RAZËN» y «EMPEÑO», «EMPEÐO» (cp850 decodifica cualquier
  byte, así que no falla: miente). Coma como separador, todo entre comillas,
  fechas `DD/MM/AAAA`, 67 mil filas sin fecha de inicio.
- ✅ `robots.txt` de `dgii.gov.do` solo veta rutas de SharePoint.
- La lista de RNC a cruzar sale de la **tabla completa del RPE** (ver §A.12,
  añadido del 2026-09-23): 137,817 proveedores, 81,092 con RNC de 9 dígitos,
  **80,877 presentes en el padrón**. Se acota a personas jurídicas (el padrón
  lista también personas físicas por cédula; no se cruzan) y se guarda solo
  RNC, actividad, inicio de operaciones, estado y régimen: 3.7 MB en diez
  archivos por el último dígito del RPE.

**Qué habilita**: cruzar cada proveedor del Estado con su registro tributario —
actividad económica declarada, estado, antigüedad. La señal clásica de riesgo
(«RNC creado semanas antes de ganar el contrato») deja de ser inverificable.
**Restricción de arquitectura**: 26 MB no se descargan por request. La vía
compatible con la plataforma sin BD es una **instantánea derivada en build**
(el patrón de `scripts/build-nomina.py`), reducida a los RNC que aparecen como
proveedores en compras.

### A.3 ⭐ DGCP — cuatro endpoints abiertos que no estamos usando

Misma API que ya integra `lib/dgcp.ts`, mismo adaptador, **cero hosts nuevos**:

| Endpoint | Contenido | Por qué importa |
|---|---|---|
| `/ofertas` | `id_oferta, codigo_proceso, rpe, razon_social, valor_oferta, estado_oferta, estado_evaluacion, tipo_oferta, fecha_entrega_oferta, fecha_evaluacion` | **Quién compitió, no solo quién ganó**: procesos de oferente único, parejas que siempre concursan juntas, ofertas descartadas |
| `/proveedores` | `rpe, razon_social, tipo_documento, numero_documento (RNC), estado, tipo_persona, forma_juridica, fecha_creacion_empresa, fecha_registro_rpe, numero_registro_mercantil, es_mipyme, certificacion_micm, clasificacion_empresarial, provincia, municipio…` (35 campos) | Perfil real en `/proveedores/[rpe]`, hoy construido solo a partir de contratos. **Trae el RNC**: es la llave de unión con §A.2 sin depender de la DGII. Mecánica de campo verificada en **§A.12** |
| `/catalogo` | UNSPSC completo: segmento → familia → clase → subclase, con definición y sinónimos | Da nombre legible a las subclases que ya usa `getPreciosSubclase` |
| `/pacc` | Planes anuales de compras por unidad, con período, versión, responsable y URL | **Lo que el Estado planea comprar** antes de publicarlo: señal anticipada |

- ✅ Los cuatro responden 200 con el mismo sobre (`code/hasError/payload.content`)
  que ya normaliza `dgcpFetch`.
- ⚠️ `/proveedores` incluye teléfonos y correos de contacto comercial. Son
  públicos por registro, pero mostrarlos en ficha convierte la plataforma en un
  directorio de contactos: la postura correcta es **usar los campos
  institucionales y no exponer los de contacto**.
- ❌ No existen `/adjudicaciones`, `/articulos`, `/documentos`, `/sanciones` ni
  swagger: el catálogo de endpoints se descubre probando.

### A.4 MapaInversiones — 15 CSV abiertos, no solo gráficos

- ✅ `/DatosAbiertos` publica **descarga directa, sin clave**, con diccionario
  XLSX por dataset:
  `DatosAbiertosProyectosDeInversion.csv` (4.0 MB),
  `DatosAbiertosContratosXProyectosInv.csv` (6.8 MB),
  `DatosAbiertosProcesosXProyectosInv.csv`,
  `DatosAbiertosPresupuestoXProyInv.csv`,
  `…XFuenteFinanciacion.csv`, `…XTerritorio.csv`,
  `DatosabiertosPresupuestoHacienda.csv`,
  y siete de compras de emergencia (procesos, contratos, ofertas, proveedores,
  artículos, apropiación presupuestaria).
- ✅ Campos comprobados en la cabecera real: los proyectos traen
  `CodigoSNIP, EstadoProyecto, ValorDelProyecto, AvanceFinanciero, AvanceFisico,
  EntidadEjecutora, Sector, FechaCorteFuente`; los contratos traen
  `CodigoSnip, CodigoProceso, CodigoContrato, ValorContrato, CodigoProveedor,
  Proveedor, UrlContrato` **con la URL al proceso en comprasdominicana**.
- ✅ Búsqueda JSON abierta: `/BusquedaAsync/?SearchString=` devuelve proyectos
  con su `url` de ficha; las fichas (`/projectprofile/{id}`) son
  server-rendered (costo estimado, avance financiero, provincia, sector).

**Qué habilita**: el eslabón que le falta a la vertical de compras —
`SNIP → proyecto → proceso → contrato → proveedor → territorio`. `Proceso` ya
tiene `es_snip`/`codigo_snip`: la unión es directa.

**Integrado el 2026-09-23** (`scripts/build-obras.py` → `public/data/obras.json`
+ `obras-detalle.json`, `lib/obras.ts`, `/obras`, `/obras/[snip]`). Verificación
de campo de ese día, UA identificable, 4 descargas + 1 ficha:

- ✅ `/robots.txt` → 404 (sin política). `/DatosAbiertos` → 200 HTML con los
  enlaces `/opendata/*.csv` y sus diccionarios `_Diccionario.xlsx`.
- ✅ Los cuatro CSV usados responden 200 `text/csv`, UTF-8 con BOM, coma y
  comillas, `last-modified` del mismo día (se regeneran a diario):
  `ProyectosDeInversion` 4.2 MB / **3,611 filas**, `…XTerritorio` 7.2 MB /
  26,606 (proyecto × municipio), `ProcesosXProyectosInv` 2.0 MB / 3,399,
  `ContratosXProyectosInv` 7.8 MB / 14,957. `FechaCorteFuente` 2026-09-22.
- ✅ `CodigoProveedor` de los contratos **es el RPE** de la DGCP (comprobado:
  `17` → Delta Comercial, SA en `/proveedores?rpe=17`).
- ✅ La ficha pública es `/projectprofile/{IdProyecto}` (200, server-rendered).
- ⚠️ **`AvanceFisico` y `AvanceFinanciero` son idénticos en 3,611 de 3,611
  proyectos.** La fuente no distingue las dos medidas: la interfaz muestra un
  solo «avance declarado» y lo dice.
- ⚠️ Dos `CodigoSNIP` repetidos (3,609 distintos); se conserva el primero.
- ⚠️ Estados: 2,350 en ejecución, 655 en reevaluación, 562 paralizados, 44 por
  reprogramar. Solo 716 SNIP tienen contratos; 1,003 tienen procesos.
- ⚠️ La DGCP y MapaInversiones **pueden asociar un mismo proceso a SNIP
  distintos** (visto: `MOPC-CCC-LPN-2026-0013` → 4795 en la DGCP, 12080 en
  MapaInversiones). La ficha de proceso muestra ambas obras con su origen.
- La entidad ejecutora (134 distintas) casa con la unidad de compra de
  `instituciones.json` por nombre normalizado más 8 equivalencias curadas:
  3,299 de 3,609 obras atadas. Queda fuera «Dirección de Desarrollo
  Provincial» (189 obras), sin unidad de compra con ese nombre en la DGCP.

### A.5 MICM — precios de combustibles, semanales

- ✅ `micm.gob.do` con robots Yoast abierto (`Disallow:` vacío).
- ✅ El tipo de contenido `post_combustibles` tiene sitemap propio con **613
  avisos** —dos series semanales, combustibles líquidos y gas natural— al día
  (`aviso-precios-combustibles-del-29-al-04-septiembre-2026`).
- ✅ Los precios vigentes se leen de la portada: **Gasolina Premium 341.10,
  Gasolina Regular 310.50, Gasoil Óptimo 293.10, Gasoil Regular 262.80**
  (RD$/galón, semana verificada).
- ⚠️ **Límite honesto**: el cuerpo del aviso semanal está **vacío en HTML**
  (comprobado en dos semanas distintas y en el RSS del tipo de contenido) y su
  `wp-json` está deshabilitado. Solo hay cuatro precios en portada; el aviso
  completo (GLP, gas natural, kerosene, fuel oil) no es legible por máquina.
  La fecha de vigencia se deriva del título del último aviso del sitemap.

**Integrado el 2026-09-23** (`lib/combustibles.ts`, fuente viva con caché de
1 h; indicador `IndicadorCombustibles` para el panorama). Re-verificación:

- ✅ La portada responde 200 `text/html` (934 KB, 1.5 s) y ahora trae **seis**
  precios, no cuatro: Gasolina Premium 350.10, Gasoil Óptimo 302.10, GLP
  135.20, Gasolina Regular 315.50, Gasoil Regular 267.80 y Gas Natural
  (GNL-GNC) 43.97, más la vigencia en texto: «semana del 19 a 25 de septiembre
  del 2026». Ya no hace falta el sitemap para la fecha.
- ⚠️ Cada precio va como `$350.10<br><p>Nombre</p>`, con el bloque repetido
  para el teléfono (se deduplica por nombre) y el `<p>` del GLP sin cerrar.
- ⚠️ La portada **no escribe unidades**. Se dice «por galón» solo para
  gasolinas y gasoil; GLP y gas natural se muestran sin unidad.
- ❌ `combustibles.micm.gob.do` («Portal de Combustibles») está parado en la
  semana del 27-sep-2025: no sirve.

### A.6 BCRD — CORRECCIÓN: el CDN sí sirve las series

La primera pasada dio por muertos los archivos estadísticos. No lo están:

- ✅ `https://cdn.bancentral.gov.do/documents/estadisticas/mercado-cambiario/documents/TASA_DOLAR_REFERENCIA_MC.xls`
  → **200, 915 KB**. El histórico de tasa de cambio de referencia está
  disponible **sin credenciales**.
- ✅ El patrón es `cdn.bancentral.gov.do/documents/estadisticas/{sección}/documents/{ARCHIVO}`,
  con secciones `mercado-cambiario`, `precios`, `sector-real`, `sector-externo`,
  `sector-fiscal`, `sector-monetario-y-financiero`, `sector-turismo`,
  `mercado-de-trabajo`.
- ⚠️ Los **nombres de archivo por sección** no se pueden enumerar: las páginas
  (`/a/d/2534-precios`, `/a/d/2538-mercado-cambiario`) montan la lista por JS y
  el HTML servido no la contiene; adivinar nombres falló (4 intentos, 404).
  Enumerarlos exige un navegador — imposible en este entorno (§B.5) — o pedir
  el índice al BCRD.
- ⚠️ La API con credenciales (`api.bancentral.gov.do`) sigue igual: el dilema
  de §8.3 se **reduce**, no desaparece — el tipo de cambio ya no la necesita.

**Integrado el 2026-09-23** (`lib/tasa.ts`, fuente viva con caché de 1 h;
indicador `IndicadorTasa` para el panorama). Re-verificación:

- ⚠️ **El `.xls` citado arriba está congelado**: 200, 915 KB, pero
  `last-modified: 19-jul-2022` (formato OLE2/BIFF). Leerlo habría mostrado una
  tasa de hace cuatro años como si fuera de hoy.
- ✅ **`TASA_DOLAR_REFERENCIA_MC.xlsx`** (misma ruta, extensión nueva) → 200
  `application/octet-stream`, 357 KB, `last-modified: 21-sep-2026`. Siete
  hojas; la primera, «Diaria», trae Año | Mes | Día | Compra | Venta desde el
  2-ene-1991 (8,967 filas); último dato 21-sep-2026: compra 59.1740, venta
  59.4618. Se lee entera con `lib/xlsx.ts` (`fflate` + `fast-xml-parser`,
  desde el 2026-09-26; antes, un mini-lector propio que solo leía la cola) y
  el resultado se guarda una hora.

### A.7 SISMAP — no hay SPA: las tablas vienen servidas

- ✅ `/GestionPublica/Ranking/RankingView` devuelve **181 organismos** en tabla
  HTML servida — `Posición | Organismo | Sector Gobierno | Valoración` (1º
  Autoridad Nacional de Asuntos Marítimos 97.40 %, 2º Ministerio de Energía y
  Minas 93.97 %, 3º Ministerio de Turismo 93.47 %…).
- ✅ **SISMAP Municipal** (`/Municipal`) da el mismo ranking para gobiernos
  locales, con ficha por ayuntamiento (`/Municipal/ayuntamientos/{id}`) y
  desglose gestión interna / servicios.
- La primera pasada supuso una API interna que hay que extraer del bundle: no
  hace falta. Es parseo de tabla, el patrón más barato de la casa.

**Integrado el 2026-09-23** (`scripts/build-sismap.py` → `public/data/sismap.json`,
`lib/sismap.ts`, `/gestion`, ficha de institución). Verificación de ese día:

- ✅ `sismap.gob.do/robots.txt` → 404 (sin política).
- ✅ `/GestionPublica/Ranking/RankingView` → 200 `text/html`, 228 KB en 5.7 s:
  **181 organismos** (1º Ministerio de Energía y Minas 99.09 %; los dos últimos,
  Dirección General de Persecución del Ministerio Público e Instituto Nacional
  de Ciencias Forenses, 0.00 %). Cada fila enlaza a
  `/GestionPublica/CargaEvidencia/Index/{id}`.
- ⚠️ `/Municipal/Ranking` ya **no trae la tabla** en el HTML (la monta por JS);
  su propio menú apunta a `/Municipal/Ranking/RankingView?tipoOrganismoID=17`
  (**160 ayuntamientos**, 1º Santiago de los Caballeros 87.30 %) y `=16`
  (**233 juntas de distrito**), ambas servidas. La portada `/Municipal` solo
  trae los diez primeros de cada una.
- ⚠️ **Ninguna de las tres páginas declara fecha de corte ni período.** La
  instantánea guarda el día de la consulta y la interfaz lo dice así.
- El cruce por nombre con `instituciones.json` ata 136 de 181 organismos,
  135 de 160 ayuntamientos y 62 de 233 juntas (el catálogo de la DGCP nombra
  las juntas de muchas formas). Un ayuntamiento nunca casa con la junta del
  mismo lugar, y dos filas que apunten a la misma ficha se sueltan las dos.

### A.8 datos.gob.do — dimensionado

- ✅ El portal declara **1,206 conjuntos de datos**. Ojo: esa cifra **no varía
  con la consulta** (idéntica en `/dataset` y en `/dataset?q=nomina`), así que
  es el total del portal, no el del filtro — un contador que engaña si se lee
  rápido.
- ✅ La búsqueda HTML (`/dataset?q=`) sí es server-rendered y sí pagina (19–20
  por página). Agotada la consulta `nomina` en 9 páginas: **159 conjuntos de
  datos distintos**, frente a las **11 instituciones** que hoy alimentan
  `/nomina`.
- ✅ Cada ficha declara formato (CSV/XLS/ODS), periodicidad, última
  actualización y la **URL de origen en el portal de la institución** — que es
  lo que hace del portal un índice de enlaces directos y no un repositorio.
- ⚠️ La paginación solo responde con `q`: `/dataset?page=61` devuelve cero
  enlaces, coherente con el render en cliente que ya señalaba §4.4.
- ✅ Organizaciones paginadas de 20 en 20, con ayuntamientos, ministerios y
  descentralizadas. Su `/api/` sigue vetado por su propio robots (`Crawl-Delay: 10`,
  respetado en esta pasada).

**Ampliar `/nomina` más allá de las 11 instituciones actuales es hoy trabajo de
manifiesto, no de ingeniería: el índice ya ofrece 159 candidatos.**

**Ampliado el 2026-09-23: de 11 a 22 instituciones** (28,720 plazas, RD$1,527
millones de masa mensual). Recorrido de ese día, con el robots respetado
(`/api/` vetado, `Crawl-Delay: 10` entre peticiones).

❌→✅ **Corregido tras la segunda revisión, el mismo día.** La primera versión
publicaba 29,673 plazas y RD$1,066 millones porque el parser se equivocaba de
columna, y los defectos eran de la fuente o del parser, no del Estado:
- Poder Judicial: «FECHA DE INGRESO» casaba como sueldo (contiene «INGRESO») y
  6,897 plazas salían en RD$0. Ahora una columna exacta `SUELDO` gana y nada
  con «FECHA» es sueldo.
- Cultura: «LUGAR DE FUNCIONES» casaba como cargo (contiene «FUNCI») antes que
  `CARGO`; sus «cargos» eran dependencias **desde antes de esta ampliación**.
- IAD y Contraloría cambiaron cargo y área de columna en los meses recientes
  sin cambiar la cabecera; MESCYT e INABIMA traen el sexo donde la cabecera dice
  área. `sanear()` los detecta y corrige o descarta.
- SVSP cuela una fila «MONTO TOTAL» como plaza: se filtra.
- MIREX paga en US$ al personal en el exterior: se publican solo las plazas en
  pesos (1,239 de 2,157) y el nombre lo dice.
- ❌ Instituto Cartográfico Militar: escribe unos sueldos con decimales y otros
  sin el punto («1335219» por 13,352.19). **Fuera** hasta que la fuente se
  corrija: no se adivina.
`scripts/build-nomina.py` ahora **no escribe** la instantánea si una institución
tiene más de 5 % de plazas en RD$0, una fila de más del 40 % de su masa, un
sueldo de más de 40 veces su mediana o una mayoría de «cargos» que parecen
dependencias; y la descarga valida `content-type`, reintenta una vez y espera
diez segundos antes de cada petición a datos.gob.do.

**Ampliado el 2026-09-24: de 22 a 86 instituciones** (94,659 plazas, RD$4,065
millones de masa mensual). Candidatos sacados del catálogo completo (§G.3: 169
títulos de nómina/empleados/personal/sueldos, 126 candidatos nuevos); sus 126
fichas se leyeron una a una con `Crawl-Delay: 10`. Cada archivo se revisó fila a
fila y su conteo se contrastó con la **Nómina Pública General del MAP** (julio
2026): MAP y ANAMAR coinciden al peso; DAEH, Agricultura, OPRET, INTRANT y
Bellas Artes, en ±2 %; Mujer publica 487 plazas frente a 1,037 del MAP.
- ⚠️ Trampas nuevas del parser, corregidas: «F-INGRESO» (fecha) se leía como
  sueldo; «SUELDO CARGO» (Ejército) como puesto; nada «NETO» es sueldo. Controles
  nuevos que rechazan: mayoría de plazas sin cargo, «cargos» numéricos.
- ❌ Descartes, por causa: columnas corridas sin cambiar la cabecera (INDOTEL,
  Hospital Vinicio Calventi, SGN, Cambio Climático, CNC, APORDOM); sin puesto
  (Catastro, ProDominicana, Trabajo, Ayuntamiento de La Romana); solo neto
  (INDRHI, FARD, PROPEEP); sueldo partido (Ejército, SENPA); agregados (Policía
  Nacional, COREPOL, CESFRONT, Ayuntamiento de Mella); sin mes/año legible
  (Juventud, COAAROM, Efemérides, ONESVIE, INABIE); anteriores a 2025 (CONAPOFA,
  Comisión Hípica, DICOM, INVI, ASDE); no CSV (Acuario, Padre Billini, Riego,
  FONDOMARENA, INAVI, FODEARTE, Dragas); no descargables (INAZUCAR 403, INAFOCAM
  TLS, IDSS/DIAPE/DIGECOOM/Comunidad Digna sin host, PROINDUSTRIA, CORAABO 500,
  ayuntamientos de SPM, Baní y San Cristóbal 503, cuatro 404 y ocho enlaces a
  páginas en vez de archivos).
- ⭐ **Siguiente:** la Nómina Pública General del MAP
  (`map.gob.do/datosabiertos/data/nomina_publica_general_estado/csv?year=2026&month=N`)
  trae ~492,488 plazas y RD$20,130 millones al mes de 129 instituciones,
  Educación (265 mil) y SNS (87 mil) incluidas, sin columna de área. Filas
  sueltas sumarían ~13 MB a un archivo que `/nomina` carga entero en el
  navegador: exige agrupar (cargo × sueldo × cuenta) o paginar en servidor
  antes de integrarla.

- ✅ `/dataset?q=nomina&page=1..9` sigue dando **159** conjuntos (19–20 por
  página, 6 en la novena). Las fichas `/dataset/{slug}` son HTML servido y
  traen los enlaces directos al CSV/ODS/XLSX en el portal de cada institución.
- ✅ Integradas (CSV real, cabecera mapeable, último mes 2026-06 a 2026-08):
  DGCP, IDEICE, IAD, Contraloría, TSS, MIREX, Poder Judicial (solo el archivo
  de servidores fijos; el de contratados va aparte), Sistema 9-1-1, INABIMA,
  Superintendencia de Vigilancia y Seguridad Privada, DIGEPRES y Lotería
  Nacional. Las dos últimas exigieron sinónimos nuevos en el parser
  (`PUESTO`/`NOMBRE DEL PUESTO`, `SALARIO BRUTO`). El archivo del 9-1-1 bajó con
  200 desde `911.gob.do/wp-content/`, aunque la portada del 9-1-1 dio 470 en la
  segunda pasada (§B.2).
- ⚠️ La URL de nómina del **MSP** cambió (la vieja responde un CSV de una línea:
  «La url de descarga no es correcta»); la nueva salió de su ficha en
  datos.gob.do. Las URLs versionadas (`-6.csv`, `-2.csv`) se mueven: al
  regenerar, un error de columnas suele ser eso.
- ❌ **Migración** y **Ayuntamiento de Santiago**: 403 al UA identificable (no
  se insistió). **UNADE**: 202 con una página HTML en vez del CSV.
- ⚠️ Descartados por formato: **TSE** (CSV sin fila de cabecera), **IDECOOP**
  (sin mes ni año), **CDC** (mes y año en una sola columna «Mes / año»).

### A.9 311 — lectura pública, y un hallazgo de seguridad que reportar

- ✅ El catálogo de documentos estadísticos del 311 (por año y carpeta)
  **responde sin autenticación**. Valor moderado: son PDF, no series. Su
  dirección no se escribe aquí mientras siga abierto el hallazgo de abajo.
- ⚠️ **Hallazgo de seguridad** en el portal del 311. No se usa. Se notifica a la
  OGTIC por el canal de divulgación responsable que el propio Estado publica, con
  un aviso que se entrega al dueño aparte (§H.10): el qué y el dónde se escriben
  aquí cuando esté corregido.

### A.10 Verificados de menor calado (estado de campo)

| Fuente | Estado | Nota |
|---|---|---|
| Transparencia Fiscal | ✅ | Su valor real es la API del SIGEF (§A.1); la página solo la construye |
| Crédito Público · Consultoría · DGCP · SIL Diputados | ✅ | **Re-verificadas: las cuatro integraciones vivas responden 200 hoy** |
| TSS | ⚠️ | WP abierto y `wp-json` activo, pero los boletines (Panorama Laboral, recaudo) no cuelgan archivos del HTML; requiere recon dedicada |
| Contraloría | ⚠️ | WP vivo; las rutas de nómina probadas dan 404 y su `wp-json` no responde a búsqueda |
| INDOTEL | ⚠️ | Estadísticas en PDF sueltos |
| Poder Judicial (`transparencia.`) | ⚠️ | 200, robots abierto salvo `/reportePDF/`; sin datos estructurados en portada |
| Tribunal Constitucional | ⚠️ | Sin robots; `/sentencias/` da 404 — la ruta real está por hallar |
| Superintendencia de Bancos | ⚠️ | `apis.sb.gob.do` vivo (404 JSON en raíz), `/swagger` **403**: clave requerida |
| Aduanas (DGA) | ⚠️ | `servicios.aduanas.gob.do/public` responde; estadísticas de comercio exterior sin ruta estable hallada |
| Organismo Coordinador (energía) | ⚠️ | `apps.oc.org.do` sirve reportes ASPX de generación programada vs. real; el de hoy respondió «sin datos para la fecha» |
| ProDominicana, MT, PGR, SNS, MINERD, SISALRIL | ⚠️ | Portales vivos; publicaciones en PDF, sin series legibles por máquina |
| Observatorio de Servicios Públicos | ✅ | Corregido en §H.1 (2026-09-29): el directorio de funcionarios responde sin sesión a la consulta de su página pública; el 401/405 era de otras rutas |

---

### A.11 Cuenta Única (OGTIC) — ⚠️ identidad ciudadana por OIDC, cliente por solicitud (añadido 2026-09-02)

No es una fuente de datos: es la **identidad digital ciudadana** del Estado, y
resuelve lo que §B.3 y PLAN-DEMOCRACIA §6 daban por cerrado (probar que
detrás de un voto hay una persona real y única) sin tocar el padrón.

- ✅ `https://auth.cuentaunica.gob.do/.well-known/openid-configuration` es un
  Ory Hydra público: `authorization`/`token`/`userinfo`/`jwks` (2 claves RSA
  RS256), PKCE `S256`, `token_endpoint_auth_methods` con `none` (cliente
  público sin secreto), scopes `openid`/`offline`, `claims_supported: [sub]`,
  `subject_types: public`. `robots.txt` → 404.
- ❌ Sin `registration_endpoint`: el `client_id` lo emite la OGTIC a mano.
  **Bloqueo institucional, no técnico.** Solicitud redactada en
  PLAN-DEMOCRACIA §9.4.
- ⚠️ Los claims que recibe un tercero (¿viaja la cédula en `userinfo`?) no se
  pueden verificar sin cliente; el registro público
  (`github.com/ogticrd/cuenta-unica-registry`) sugiere `preferred_username`.
- ⚠️ El flujo VID devuelve solo `state`, sin aserción firmada: la identidad
  la da el token OIDC, VID solo añade prueba de vida.
- ❌ Supabase Auth no acepta emisores OIDC genéricos → Cuenta Única se acopla
  encima de la sesión, verificado en una Edge Function (PLAN §9.2).

Diseño, invariantes y pasos del dueño: PLAN-DEMOCRACIA §9.

### A.12 DGCP `/proveedores` — el registro se consulta, no se recorre (añadido 2026-09-03)

Reconocimiento hecho al construir el índice `/proveedores`. Comprobado contra
el servidor con el UA identificable, GET y pocas peticiones:

- ✅ **Censo**: **127,896 proveedores inscritos** (`totalResults` con
  `limit=1`). Es un censo que declara el origen: sí puede ser denominador.
- ✅ **Orden**: por `rpe` **ascendente**. La página 1 son las inscripciones más
  antiguas (`rpe` 1…1070), no las recientes. El `rpe` no es contiguo.
- ✅ **Filtros que la API honra**: `rpe` y `numero_documento` —RNC de 9 dígitos
  o cédula de 11—. Ambos **exactos**: un prefijo (`10187`) devuelve 0. Ambos
  responden en 1–4 s. El registro guarda las cédulas rellenadas con ceros a la
  izquierda (`00200083343`), así que la consulta prueba también esa forma.
- ⚠️ `estado`, `provincia` y `region` son nombres que el servidor **reconoce**
  pero devuelven **500 con cualquier valor probado** (`Activo`, `ACTIVO`,
  `activo`, `Inactivo`, `1`, `SANTIAGO`, `01`, `OZAMA`). Inservibles: no hay
  forma de listar «los proveedores activos de Santiago». Re-verificado el
  2026-09-23 (`provincia=SANTIAGO`, `provincia=Santiago`, `municipio=SANTIAGO`:
  500). Por eso `/provincias` agrupa las fichas de los 200 mayores
  adjudicatarios de la ventana (`lib/provincias.ts`), declarado como muestra.
  El registro escribe La Vega como «CONCEPCIÓN DE LA VEGA» y Monte Cristi
  como «MONTECRISTI»; de 200 fichas, 42 traen la provincia vacía.
- ❌ **No hay búsqueda por razón social**: `razon_social`, `proveedor`,
  `nombre`, `q`, `rnc`, `documento`, `mipyme`, `provee`, `clasificacion` y
  `forma_juridica` se **ignoran en silencio** (devuelven el registro entero con
  `totalResults` intacto). El silencio es lo peligroso: parece que filtró.
- ❌ **El registro no se puede recorrer entero.** Hay páginas que devuelven
  **500 de forma permanente**, reproducido dos veces cada una: con `limit=200`
  las páginas 11 y 12 (registros 2001–2400) y **toda la cola** (639–640); con
  `limit=1000` la página 3; con `limit=50` la cola entera (2553–2558). No es un
  límite de profundidad —la página 300 de 640 responde bien—: son registros que
  rompen la serialización del origen. Y `limit=1000` tarda 10–50 s por página:
  128 páginas no son lectura en vivo ni con caché diario.

**Consecuencia de diseño, ya aplicada en `/proveedores`** (`lib/dgcp.ts`:
`buscarProveedores`, `muestrearProveedores`, `getProveedorPorDocumento`):

1. La búsqueda **exacta** (RPE, RNC, cédula) va contra el **registro completo**
   y es la vía que hay que ofrecer primero.
2. La búsqueda **por nombre** no puede ir contra el registro, así que va contra
   la **ventana de contratos recientes agregada por RPE** — la misma muestra que
   alimenta `/contratos`, con la que comparte caché— y la interfaz declara esa
   base junto al resultado.
3. **No se construye instantánea del padrón de proveedores.** Un barrido con
   huecos permanentes no da un censo fiable, y un censo a medias mentiría peor
   que la ausencia. Si algún día hiciera falta el padrón completo, la vía es el
   RNC de la DGII (§A.2), no este endpoint.

**Añadido el 2026-09-23 — la tabla entera sí se descarga.** La sección
«Tablas» del portal de datos abiertos de la DGCP no pagina la API: su JS
(`TablasPage-*.js`) llama a
`GET https://datosabiertos.dgcp.gob.do/api-dgcp/v1/tablas/proveedores?Type=csv&inhabilitados=false`,
que responde **200 `text/csv`, 80 MB en 3 s**, `content-disposition:
attachment; filename=Proveedores.csv`, con cabeceras `x-ratelimit-limit: 60`
(por minuto). Son **137,817 filas y 42 columnas** —más que los 127,896 que
declara `totalResults` de la API; la diferencia no está explicada y se
anota ⚠️—, incluidos teléfonos, correos y personas de contacto que la
plataforma **no lee** (el script solo toma `RPE`, `NUMERO_DOCUMENTO` y
`TIPO_DOCUMENTO`). Existen tablas hermanas para procesos y contratos
(`/tablas/procesos`, `/tablas/contratos` con año y semestre), no exploradas.
Esto no cambia la búsqueda en vivo de `/proveedores`; habilita cruces en build
como el del padrón RNC (§A.2).

## B. Bloqueos confirmados

### B.1 Sin cambios desde la primera pasada
- ❌ **ONE / ANDA** — challenge Cloudflare al UA honesto (403). Su robots
  **permite** `*`: el bloqueo es del WAF, no de la política.
- ❌ **Cámara de Cuentas** — HTTP **470** en `www.` y en el ápex. Las
  declaraciones juradas siguen fuera de alcance.

### B.2 Nuevos bloqueos mapeados
- ❌ **911** (`911.gob.do`) — HTTP 470, el mismo patrón de la Cámara de Cuentas.
- ❌ **Migración** — challenge Cloudflare.
- ❌ **SIMV** (valores) — challenge Cloudflare.
- ❌ **SIPEN** — falla TLS: certificado con **clave demasiado débil** para el
  cliente actual. Es configuración del servidor, no bloqueo.
- ⚠️ **Ministerio de Trabajo** — `www.` es rechazado por la política de egreso
  de este entorno; **`mt.gob.do` (sin `www`) sí responde**.

### B.3 JCE — el retroceso
- ✅ El sitio de resultados 2024 responde y lista los documentos por
  `EntryId`.
- ❌ **La descarga responde con un CAPTCHA de Zenedge** («¿Eres humano?») tras
  media docena de peticiones. No se evadió y no se insistió. El archivo
  electoral requiere vía institucional (Ley 200-04) o el repositorio impreso
  (sus estadísticas se publican en Issuu, no en datos).

### B.4 Nómina individual (Portal Único de Transparencia)
Sin cambios: el tablero Power BI sigue sin vía servidor. Se confirmó además que
el `wp-json` del Portal Único **no expone directorio de instituciones** (282
rutas, todas de plugins): no hay atajo por ahí. La vía sigue siendo §A.8.

### B.5 Límite del entorno, no de las fuentes
El navegador headless (Chromium + Playwright, preinstalados) **no puede
navegar**: toda petición muere en `ERR_CONNECTION_RESET` a través del proxy,
incluso contra `example.com`. Todo lo que exija ejecutar JS —índice de archivos
del BCRD, tableros Power BI, SPAs con API firmada— queda fuera de alcance
**desde este entorno**, no necesariamente desde producción.

---

## C. Qué habilita esta pasada (capacidades, no fuentes)

1. **«¿En qué gasta el Estado?»** — vertical de finanzas públicas con ejecución
   mensual por institución, concepto y finalidad (§A.1), junto al indicador de
   deuda que ya existe.
2. **«¿Hubo competencia?»** — ofertas por proceso (§A.3): oferente único,
   concurrencia repetida, ofertas descartadas.
3. **«¿Quién es este proveedor?»** — perfil con RNC, forma jurídica, registro
   mercantil, MIPYME, provincia (§A.3) y, cruzado con la DGII, antigüedad y
   actividad declarada (§A.2).
4. **«¿Qué va a comprar el Estado?»** — PACC (§A.3): señal anticipada, meses
   antes de la licitación.
5. **«¿La obra existe y avanza?»** — proyecto ↔ contrato ↔ territorio (§A.4).
6. **«¿Cuánto cuesta la gasolina esta semana?»** — indicador semanal (§A.5).
7. **«¿Qué tan bien gestiona esta institución / mi ayuntamiento?»** — SISMAP y
   SISMAP Municipal (§A.7).
8. **Nómina de 11 a ~74 instituciones** (§A.8).

---

## D. Plan de integración revisado

Las fases 1 y 2 (deuda, normativa) siguen implementadas. Estas se ordenan por
**valor ÷ esfuerzo**, y todas caben en la arquitectura sin BD:

| Fase | Qué | Esfuerzo | Notas de arquitectura |
|---|---|---|---|
| **5** ✅ | **DGCP: `/ofertas`, `/proveedores`, `/catalogo`, `/pacc`** | **bajo** | Mismo host, mismo `dgcpFetch`, mismas ventanas de caché. Es la mejor relación valor/esfuerzo de toda la auditoría |
| **6** ✅ | **SIGEF: `lib/fiscal.ts` + vertical de finanzas públicas** | medio | `unstable_cache` diario, consulta **por institución**, timeout ≥120 s, precalentar el mes vigente, degradar al mes cerrado anterior |
| **7** ✅ | **MICM: indicador de combustibles** | bajo | Portada + título del último aviso; declarar que son 4 precios, no el aviso completo |
| **8** ✅ | **MapaInversiones: obra pública** | medio | CSV grandes → instantánea en build (patrón nómina), unión por `codigo_snip` con procesos |
| **9** ✅ | **RNC (DGII) en fichas de proveedor** | medio | Instantánea en build restringida a los RNC presentes en compras; nunca descarga en request |
| **10** ✅ | **Nómina ampliada (159 candidatos) + SISMAP** | bajo | Añadir líneas al manifiesto de `scripts/build-nomina.py`; SISMAP es parseo de tabla |
| **11** ✅ | BCRD (tipo de cambio) | bajo | Solo si el XLS del CDN se parsea sin dependencia pesada; el resto de series, tras pedir el índice |

**Regla que impone la fase 6**: la plataforma necesita una segunda clase de
adaptador — *fuente lenta, consolidada en instantánea* — junto a la actual
*fuente viva, cacheada por minutos*. Al implementarla se midió que ni el caché
por día alcanza: una sección entera del SIGEF tarda **97 s** y una institución
suelta entre 20 y 90 s, por encima de lo que aguanta cualquier función de
servidor. `scripts/build-fiscal.py` resuelve las tres secciones en tres
llamadas y `lib/fiscal.ts` sirve el resultado; el precedente era la nómina.

**Semántica del SIGEF que es fácil leer mal** (verificada fila a fila al
implementar, y documentada en el script): `PRESUPUESTO INICIAL` solo aparece en
el mes 1; `PRESUPUESTO VIGENTE` **no es un saldo sino un delta mensual** —el
mes 1 trae la apertura y los demás las modificaciones, con signo—, así que el
vigente real es la suma del año. Sumar mal ahí no da un error visible: da una
cifra creíble y falsa. Y el mes en curso llega con filas a cero, de modo que el
corte honesto es el último mes con devengado real, no el último mes con filas.

---

## E. Reglas nuevas que deja esta pasada

1. **La vitrina no es la fuente.** Transparencia Fiscal no publica datos:
   publica un formulario que llama a una API que nadie documenta. El hallazgo
   más grande de esta auditoría estaba en el JavaScript de una página que la
   primera pasada dio por «mapeada».
2. **Un 403 en la puerta no cierra la casa.** La DGII bloquea su consulta web y
   a la vez publica su padrón completo en un ZIP estático.
3. **Antes de buscar una fuente nueva, agotar la que ya se integró.** Cuatro
   endpoints útiles llevaban meses a un `GET` de distancia.
4. **La latencia es parte del contrato.** Una API que tarda 90 s en el mes
   corriente y 0.4 s en un año cerrado obliga a diseñar la caché antes que la
   feature.
5. **Nunca usar una credencial filtrada** (§A.9), aunque esté a la vista y
   aunque el dato sea público: se reporta, no se aprovecha.
6. **Publicar no es exponer.** Que un registro público traiga teléfonos y
   correos no obliga a mostrarlos (§A.3).
7. **Declarar la cobertura, siempre.** 4 precios de combustible no son «los
   precios»; 11 nóminas no son «la nómina»; una muestra del SIL no es el SIL.
8. **Desconfiar del contador ajeno.** datos.gob.do rotula «1,206 resultados
   encontrados» busques lo que busques: la cifra real se obtiene paginando.

---

## F. Pendientes, en orden

1. **Fase 5** (endpoints DGCP) — ejecutable ya, sin decisiones previas.
2. **Fase 6** (SIGEF) — decidir la ventana de caché y el conjunto de
   instituciones a precalentar en el panorama.
3. Reportar a la OGTIC el hallazgo de seguridad del 311 (§A.9).
4. Pedir al BCRD el índice de archivos por sección (§A.6), o resolverlo desde
   un entorno con navegador.
5. Recon dedicada: TSS (boletines), Aduanas (comercio exterior), Tribunal
   Constitucional (sentencias), Organismo Coordinador (generación diaria).
6. Solicitudes institucionales, en paralelo y de plazo largo: ONE (lista
   blanca), Cámara de Cuentas y 911 (Ley 200-04), JCE (archivo electoral).
7. Verificar desde el egress de producción lo que este entorno no puede:
   TLS de `www.poderjudicial.gob.do` y de SIPEN, y el navegador headless (§B.5).
8. **Solicitar a la OGTIC el cliente OAuth2 de Cuenta Única** (§A.11,
   PLAN-DEMOCRACIA §9.4). Va en un oficio aparte del aviso de seguridad del
   311 (§A.9): un aviso no debe parecer atado a un pedido.


---

# TERCERA PASADA — 2026-09-24

Barrido de todo el Estado para responder «¿qué más se puede leer?», en seis
frentes a la vez, con el mismo método: robots primero, UA identificable, solo
GET, ≤6 peticiones por host en el reconocimiento (datos.gob.do, con su
`Crawl-Delay: 10`, fue la excepción declarada), ningún bloqueo rodeado. Más de
120 hosts. Los informes crudos de cada frente vivieron en el scratchpad de la
sesión; lo que sigue es lo que queda verificado.

**Integrado en esta pasada:** historia completa de compras (§G.1), biblioteca de
documentos (§G.2), catálogo de datos abiertos (§G.3), alertas de INDOMET
(§G.4), BCRD y Aduanas (§G.5), sentencias del TC (§G.6), muertes en las vías
(§G.7), generación eléctrica (§G.8). La nómina se amplió por la vía de §A.8.

### G.1 ⭐ DGCP — las tablas de contratos y procesos bajan enteras

§A.12 encontró la tabla de proveedores; sus hermanas hacen lo mismo:

- ✅ `GET https://datosabiertos.dgcp.gob.do/api-dgcp/v1/tablas/contratos?Type=csv`
  → 200 `text/csv`, **115 MB en 3.5 s**, `Contratos.csv`: **722,825 contratos
  desde 2015** (código, estado, estado de adjudicación, fecha, valor, moneda,
  objeto, RPE, razón social, documento). **No trae la unidad de compra.**
- ✅ `…/tablas/procesos?Type=csv` → 200 `text/csv`, **245 MB en 5.4 s**:
  **631,103 procesos** con unidad de compra, modalidad, tipo de excepción,
  estado, monto estimado y URL.
- ⚠️ Los parámetros `anio` y `semestre` que pinta el portal **se ignoran**: cada
  tabla baja entera.
- ✅ **Contrato → institución por prefijo.** El código de contrato empieza por el
  prefijo de la unidad (`INFOTEP-2026-01420`), el mismo que abre sus procesos.
  Resolviendo el prefijo contra la tabla de procesos solo cuando un código de
  unidad reúne >95 % de sus procesos: 803 prefijos, 2 ambiguos (MOPC, MEPYD),
  **99.2 % de los contratos asignados, pero solo el 91.5 % del valor**: el
  prefijo MOPC lo comparten el MOPC (82 %) y la OPRET (18 %), y sus 4,450
  contratos (RD$128.4 mil millones) quedan sin institución. Sin él, el MOPC
  sería el mayor comprador del período; `/historico` lo dice junto al ranking
  y la ficha del MOPC explica por qué no tiene serie.
- ⚠️ **Valores atípicos.** Entre los contratos cancelados hay cifras que son
  errores de captura evidentes (RD$103,680 millones por ascensores; RD$47,444
  millones de INABIE a una persona física), y el filtro de cancelados ya los
  deja fuera. Entre los vigentes o cerrados quedan 13 de RD$10 mil millones o
  más (~16 % del valor): algunos parecen errores (RD$10,000,000,001 exactos a
  un servicio de Cultura), otros pueden ser obras reales (Autopista del Ámbar,
  línea 2 del teleférico). Sin el expediente no se distinguen: se apartan de
  toda suma y se listan uno a uno (`/historico`); cada ficha dice cuántos de
  los suyos quedaron fuera.
- Implementado: `scripts/build-historico.py` → `public/data/historico/`
  (resumen, por institución, por proveedor en 10 fragmentos; 6.3 MB),
  `lib/historico.ts`, `/historico` y los bloques «desde 2015» de las fichas.

### G.2 ⭐ Bibliotecas WordPress — un índice de documentos del Estado

- ✅ `GET https://<host>/wp-json/wp/v2/media?media_type=application&per_page=100&_fields=id,date,title,source_url,mime_type`
  → 200 JSON sin clave en **23 de 44** hosts de instituciones; `X-WP-Total` y
  `X-WP-TotalPages` en la cabecera. Ningún robots veta `/wp-json`.
- ⚠️ **`X-WP-Total` sobrestima**: WordPress cuenta en SQL y después descarta los
  adjuntos cuyo padre no es público. INAPA anuncia 28,488 y deja leer 6;
  Cultura 9,659 → 74; INDOTEL 18,122 → 1,035. Hay páginas vacías (`[]`) en
  medio: se recorre hasta `X-WP-TotalPages`, tope 250 por host.
- ⚠️ El título suele ser el nombre del archivo; `date` es la fecha de subida;
  `description` no aporta. Declaraciones juradas nominales (Ley 311-14)
  aparecen entre los PDF (115 títulos el 2026-09-24): **se excluyen por título**
  hasta que el dueño decida (docs/DECISIONES.md); el índice queda en 18,726.
- ✅ Barrido completo del 2026-09-24: **18,841 documentos de 22 instituciones**
  (18,726 publicados tras excluir las declaraciones juradas)
  (OGTIC 7,276; DIGEPRES 3,013; Ambiente 1,379; MIREX 1,306; MEM 1,217; INDOTEL
  1,035; Hacienda 1,015…). MIVHED anuncia 785 y no deja leer ninguno.
- ❌ REST cerrada por plugin (401): SNS, MAP, MIDEREC y MINPRE (este además con
  `Disallow: /*?` en su robots: fuera). WAF: Agricultura (403 solo en
  `/wp-json`), INFOTEP, ONE. No WordPress: MOPC, MITUR, MINERD, MSP, MICM,
  Presidencia (Drupal), DGII (SharePoint), Aduanas y SB (Umbraco), INABIE.
- No hay lista maestra pública de instituciones con su dominio
  (`gob.do/instituciones` 404; la REST de map.gob.do es solo para
  administradores). La lista de hosts vive en el script.
- Implementado: `scripts/build-documentos.py` → `public/data/documentos/`
  (3.2 MB), `lib/biblioteca.ts`, `/documentos` y «Lo que publica» en la ficha.

### G.3 datos.gob.do — el catálogo entero se enumera por HTML

- ✅ `/dataset/?q=*:*&sort=name+asc&page=N` recorre el catálogo: 20 tarjetas
  por página (slug, título, organización, formatos, grupos), 54 páginas,
  **1,065 conjuntos públicos**; la 60 viene vacía. El rótulo «1199 resultados»
  no cambia con la consulta (§E.8 sigue en pie).
- ✅ `/organization/` lista 271 organizaciones con su conteo; `/group/`, 11
  grupos (929 conjuntos; ~136 sin grupo). ❌ `/sitemap.xml` 404.
- ⚠️ Las fichas traen autor, fechas, licencia, periodicidad y la tabla de
  archivos, pero el enlace a veces no es el archivo (Maternidad enlaza a una
  categoría de Joomla; SIUBEN repite el mismo `id` para CSV y ODS; PGR trae
  `href=""`). Recorrerlas son 1,065 peticiones, ~3 h 30 min con la espera: no
  se hace en build.
- ✅ Archivos verificados en el host de la institución: MICM combustibles
  2010–2026 (CSV cp1252 `;`, 873 semanas), MEM despacho de generadoras
  2022–2026 (6,590 filas; `octet-stream`), DGM derechos mineros (1.6 MB; ⚠️ mes
  y año invertidos en 2,076 filas). ⚠️ OMSA «pasajeros» trae `RECAUDACIONES`.
- Implementado: `scripts/build-catalogo.py` → `public/data/catalogo.json`,
  `lib/catalogo.ts`, `/datos`.

### G.4 INDOMET — alertas CAP en dominio público

- ✅ `https://cap-sources.s3.amazonaws.com/do-indomet-es/rss.xml` → 200
  `text/xml`, 20 ítems, `copyright: public domain`. Cada `<link>` es un XML
  CAP 1.2 (`application/xml`): `event`, `severity`, `urgency`, `onset`,
  `expires`, `areaDesc`, polígono. ONAMET es ahora INDOMET.
- Implementado: `lib/alertas.ts` (índice 15 min, cada alerta 1 día, vigente =
  no expirada ni cancelada, la reemisión más reciente manda) y la tarjeta del
  panorama.

### G.5 BCRD y Aduanas — series sin clave

- ✅ BCRD CDN (nombres de archivo del paquete R abierto `databcrd`; el sitio los
  monta por POST): `sector-externo/documents/Remesas_6.xlsx` (ago-2026 US$1,116.3
  M; ⚠️ el título dice millones y las celdas vienen en dólares),
  `reservas_internacionales.xlsx` (brutas US$15,434.2 M; columnas por año
  variables), `sector-monetario-y-financiero/documents/tbm_activad.xlsx`
  (14.08 %; filas diarias del mes en curso y «Enero 2022» repetido). ✅ IPC
  `precios/documents/ipc_base_2019-2020.xls` (BIFF: pide script en build).
  ⚠️ `imae.xlsx` congelado en oct-2024. ✅ llegadas de turistas
  `sector-turismo/documents/lleg_total.xls` (BIFF, 1978–jul-2026).
- Implementado (2026-09-24): `scripts/build-bcrd.py` (necesita `xlrd` en
  build, nunca en la app) → `public/data/bcrd.json`, `lib/bcrd.ts` y la tarjeta
  `InflacionTurismo`. IPC ago-2026: 140.76, +5.13 % interanual. Llegadas
  jul-2026: 1,024,626 (921,682 no residentes). **Corrección:** los totales de
  llegadas son enteros con ruido de coma flotante, no estimaciones; lo estimado
  es el reparto residentes/no residentes (hojas separadas desde 1987). El
  archivo cuenta pasajeros aéreos, residentes incluidos, sin cruceristas.
- ✅ Aduanas: `GET https://www.aduanas.gob.do/umbraco/api/searcher/getpageofdocuments?id=3442`
  → índice JSON (8 importaciones, 5 exportaciones, 7 recaudación); las rutas
  `/media/{hash}` cambian en cada publicación. Ago-2026: importaciones FOB
  US$2,778.4 M, exportaciones US$1,298.3 M, recaudación RD$22,484.7 M;
  ⚠️ títulos en «millones» con celdas en unidades.
- ⚠️ DGII: las páginas de estadísticas responden 200 (corrige §A.2) pero los ZIP
  de `informeRecaudacionMensual` dan 403; la misma cifra la publica Hacienda
  (`INGRESOS-FISCALES-POR-PRINCIPALES-PARTIDAS-…xlsx`, hojas DGII/DGA/TN).
- ✅ DIGEPRES: 1,508 XLSX por su WP; balance mensual de la Administración
  Central 2004–2026 (dice millones, vienen pesos).
- ✅/⚠️ Superintendencia de Bancos: SIMBAD (`simbad.sb.gob.do`) es un Apache
  Superset público: `/api/v1/chart/1467/data/?format=json` da la morosidad
  (1.79 % a julio), 24 meses por gráfico. ⚠️ **Hallazgo de seguridad**, que se
  notifica aparte a la SB (§H.10); no se usa.
- ✅ Crédito Público: `/Content/subastas/consolidados/2026/02Consolidado.xlsx`.
- ❌ SIMV y ONE: desafío de Cloudflare hasta en robots. ⚠️ SIPEN: el TLS ya no
  falla por el proxy; los datos se cargan por JS. Seguros se mudó a `sis.gob.do`.
- Implementado: `lib/macro.ts`, `lib/aduanas.ts` y sus tarjetas del panorama.

### G.6 Justicia e integridad

- ✅ **Tribunal Constitucional** (robots 404):
  `GET /consultas/secretar%C3%ADa/sentencias/` sirve el año entero sin paginar
  (966 filas de 2026, 885 KB): número, fecha, expediente, «Relativo a». Otro año:
  `?filtery=2012&criteriay=years&size=999999`. La ficha `/sentencias/tc096626`
  lleva al PDF en `tribunalsitestorage.blob.core.windows.net` (id opaco).
  Implementado: `lib/tc.ts` y `/constitucional`. Corrige §5.3.
- ✅ **Cámara de Cuentas vuelve a responder** (corrige §4.3 y §B.1): `www.` → 301
  al ápex, 200, Joomla. Publica informes de auditoría y **listas de quién
  presentó la declaración jurada a tiempo, tarde o no la presentó** (no el
  patrimonio). ❌ `consultadjp.camaradecuentas.gob.do` → 500.
- ⚠️ **Poder Judicial**: el servidor no envía el intermedio de Sectigo (cadena
  incompleta, no bloqueo; corrige §5.2). Con él, `poderjudicial.gob.do` es un
  WordPress con 520 PDF de memorias. ✅ `transparencia.poderjudicial.gob.do/…/BoletinesEstadisticos`
  enlaza 943 PDF/XLSX de estadísticas judiciales mensuales (último: jul-2026,
  preliminares). ❌ El buscador de la SCJ (`consultasentenciascj…/Home/GetExpedientes`)
  solo acepta POST de formulario.
- ✅ **TSE**: `visorpdf.tse.do/?y=2026` lista sus sentencias por GET (26 en 2026).
  Implementado (`lib/tse.ts`, `/tse`): 60 por página (`?pos=N&y=AAAA&s=`), los
  enlaces de página son una ventana, así que se sigue «Siguiente» (tope 15);
  el filtro dice «Año de expediente» pero filtra por año de la sentencia;
  numeración irregular (`TSE/007/2021`, `TSE-006-2021`, punto final) y números
  repetidos con fichas distintas; desde 2021. 2024: 402 sentencias.
- ✅ **Estadísticas del Poder Judicial** implementadas (`scripts/build-justicia.py`
  → `public/data/justicia.json`, `lib/justicia.ts`, tarjeta en `/`): hoja
  `EST_02_tribunales_de_jurisdiccion_ordinaria_<mes>_<año>`, **mensual** (no
  acumulada), cuenta **solicitudes de servicio judicial**, salidas sin
  considerar la fecha de entrada, sin la SCJ. Jul-2026: 129,375 entradas,
  108,472 salidas (84 por cada 100; jul-2025: 81). Nombres de archivo con sufijos
  y rótulos erróneos: el script elige por patrón, comprueba el mes dentro de la
  hoja y que los 11 departamentos sumen el total.
- ⚠️ JCE: seis peticiones sin CAPTCHA; «Organizaciones políticas reconocidas» en
  PDF. El padrón solo está en Issuu.
- ✅ Contraloría: `/informes-de-auditorias/` enlaza ~38 PDF; Índice de Control
  Interno trimestral. PGR: WordPress con 220 PDF.
- Declaraciones juradas: no hay registro central legible; DIGEIG publica las de
  sus directivos en PDF (encontrables por la biblioteca, §G.2).

### G.7 Social y seguridad

- ✅ **OPSEVI (INTRANT)**: `opsevi.intrant.gob.do` (sin robots) llama a una API
  JSON interna sin clave: `/api/national?years=2026` (mensual con nombres de mes
  en mayúsculas al azar, por tipo de vehículo), `/api/fatalities/provinces?year=`
  (con nombre de provincia), `/api/summary?years=` (fallecidos, heridos,
  población). No documentada. Implementado: `lib/siniestralidad.ts` y su
  tarjeta (año en curso contra los mismos meses del anterior).
- ✅ MIP: XLSX de robos 2018–2025 (bloques apilados, `#N/D`), armas,
  naturalizaciones (nombres no predecibles: por su WP). Homicidios solo en JPEG.
- ✅ MINERD: CSV de matrícula 2015-16…2023-24 (dice UTF-8, es cp1252).
- ⚠️ TSS: su biblioteca tiene 5 archivos; cotizantes no están. SISALRIL: Plotly
  Dash por POST. SNS: REST 401. Pro Consumidor: PDF semanal «Precio Justo».
  INESPRE: datos hasta 2015. ❌ Agricultura (403 CF); Policía Nacional
  (`Disallow: /*?*`); DIGEPI y Mercados Dominicanos (502 del egreso de este
  entorno, no de la fuente).

### G.8 Energía, agua y territorio

- ✅ **Organismo Coordinador**: `apps.oc.org.do/wsOCWebsiteChart/Service.asmx/GetGeneracionReprogramadaJSon?Fecha=MM/DD/YYYY`
  → 24 filas horarias PROGRAMADO/GENERACION/DESVIACION, también días pasados;
  `GetCentralMarginalPonderadaJSon` da la marginal por hora —«DESABASTECIMIENTO»
  cuando la oferta no cubre la demanda— y a veces menos de 24 períodos (con
  «P-7» en vez de planta). Resuelve el «sin datos» de §A.10. Implementado:
  `lib/energia.ts` y su tarjeta (el día de ayer).
- ✅ Subsidio a las EDE por la API del SIGEF de `lib/fiscal.ts`:
  `gastos/transferencias/2025/12/json?seccion=11111&capitulo=0999` (2025:
  Edeeste RD$45,063 M, Edesur 29,175 M, Edenorte 28,994 M).
- Implementado (2026-09-24): `scripts/build-subsidio.py` →
  `public/data/subsidio-electrico.json`, `lib/subsidio.ts` y la tarjeta de
  `/finanzas`. Devengado por año: 2019 RD$30.5 mil millones (todo a la CDEEE)
  → 2024 106.4 → 2025 104.7 (EDEESTE 45.1, EDESUR 29.2, EDENORTE 29.0, ETED
  1.5). La transferencia pasa de la CDEEE a las distribuidoras en 2023–2024.
- ✅ Edenorte: RSS semanal de mantenimientos con circuito; Edesur: HTML de la
  semana. ✅ MIVHED: CSV de licencias de construcción 2022–2026. ✅ CAASD: CSV
  del último mes de producción de agua.
- ❌ SIE (403 CF), SNIP (login), IDAC y Liga Municipal (Power BI), MOPC (su
  lectura exige lo que su portal lleva en el navegador: no se usa; se
  evalúa si es un hallazgo que notificar). IGN: solo WMS raster. COE: RSS vacío.
  ⚠️ Hallazgo de seguridad menor en un servidor de la CAASD; se notifica aparte.

### G.10 MAP — la nómina pública general del Estado

- ✅ robots de `map.gob.do`: solo `/wp-admin/`.
  `GET https://map.gob.do/datosabiertos/data/nomina_publica_general_estado/csv?year=2026&month=7`
  → 200 `text/csv`, 61.9 MB, `content-disposition` «Nomina Publica General del
  Estado, MAP, Julio, 2026.csv»: **492,488 filas**, columnas
  `Nombre_del_empleado, Institución, Cargo, Estatus, Suelto_Bruto` [sic]`,
  Género, Mes, Año`; UTF-8 con BOM. Agosto y septiembre dan 404: el último
  publicado es julio de 2026. Junio: 491,472 plazas.
- ✅ 125 instituciones, RD$20,130 millones al mes; Educación 265,490 plazas,
  SNS 87,295, INAIPI 16,539. Ningún sueldo en RD$0. Estatus: fijos 424,579,
  transitorios 46,664, vigilancia 13,717…
- ⚠️ No trae área. No aparecen Fuerzas Armadas, Policía Nacional, Congreso,
  Poder Judicial, ayuntamientos, Banco Central ni JCE (comprobado por nombre).
- Implementado: `scripts/build-nomina-general.py` (sin nombres ni género) →
  `public/data/nomina-general.json` (~1 MB, servido desde el servidor),
  `lib/nomina-general.ts`, `/nomina/general` y el bloque de nómina de las
  fichas sin nómina propia (79 de 125 casan por nombre exacto).

### G.11 Mantenimientos programados de las distribuidoras

- ✅ Edenorte: `https://edenorte.com.do/category/programa-de-mantenimiento-de-redes/feed/`
  → `application/rss+xml`, ~530 KB, 10 ítems; cada uno, una tabla Municipio |
  Circuito | Fecha (D/M/AAAA) | Periodo («9:00 a. m. a 12:00 p. m.») | Zonas |
  Causa. Sin provincia. ⚠️ Publica tarde o salta semanas: el 2026-09-24 lo
  último era la semana del 12 al 18. REST de WP cerrada (401).
- ✅ Edesur: `https://edesur.com.do/enlaces-empresa/mantenimientos-programados/`
  → HTML (Umbraco), siete pestañas por día; provincia (`h4`) → ventana
  (`h5.title-zona`) → sectores. Sin circuito ni causa; solo la semana sábado–viernes
  en curso. 59 ventanas en 12 provincias la semana del 19 al 25.
- ⚠️ Edeeste: solo PDF semanal (WP Download Manager con `refresh` por visita): se
  enlaza su página.
- Implementado: `lib/cortes.ts` (en vivo, 6 h, solo de hoy en adelante) y `/luz`.

### G.12 Contraloría y Cámara de Cuentas — auditorías y declaraciones

- ✅ Contraloría: `/informes-de-auditorias/` → 38 PDF (29 atados a ficha; dos
  son respuestas de la institución auditada, no informes); ICI trimestral, 10
  PDF (T1-2024…T2-2026; la URL escribe `resulados-ici-2026`). Fechas = subida
  (35 de 38 el 5–6 de marzo de 2025).
- ✅ Cámara de Cuentas (sin 470 el 2026-09-24): informes por el RSS de K2 (los
  10 más recientes; K2 ignora un tamaño de página mayor; ~216 en 72 páginas de
  3). Declaraciones juradas por Phoca Download (`?limit=0` sirve la categoría
  entera): 12 listas de omisos al corte 31-08-2026 (una por grupo: Diputados,
  Senado, PARLACEN, ayuntamientos, SCJ, PGR, UASD, Banreservas…), 53 de
  tardíos (2015→2026), 10 de «en tiempo hábil» (la última de abril de 2024).
  ⚠️ Todas son PDF con nombres: se guardan título, corte y URL; **sin nombres
  y todavía sin conteos** (no hay lector de PDF en build). Siguiente: contar por
  institución con un lector de PDF en build, sin guardar nombres.
- Implementado: `scripts/build-auditorias.py` → `public/data/auditorias.json`,
  `lib/auditorias.ts`, `/auditorias`.

### G.14 El país en cifras: robos, armas, matrícula, licencias

- ✅ MIP robos (`datos-abiertos-robos-2018-2025-v2.xlsx`): 2025 83,716 denuncias
  (robo simple 47,911, asalto 15,166, motocicletas 5,812); solo vehículos,
  motos y armas vienen desde 2018; los demás tipos desde 2024. Títulos de
  bloque erróneos («Robo Vehículos 4 Motocicletas»); provinciales cuadran con
  el total (1,650 sin provincia). Armas: incautadas 4,124 en 2025; registradas
  246,071 a T1-2026 (acumulado; 2021 cae por debajo de sus vecinos, tal cual).
- ✅ MINERD matrícula: suma de las 18 regionales = suma de distritos en cada
  año; 2,773,255 (2015-16) → 2,617,801 (2023-24). Salto primaria→secundaria en
  2016-17: probable cambio de estructura de niveles (hipótesis, declarada).
- ✅ MIVHED licencias 2022–jun-2026 (robots 404): 2025 952 licencias, 4.49 M m²;
  la inversión declarada ≈ RD$60 mil/m² casi siempre (calculada, no medida).
- Implementado: `scripts/build-sociedad.py` (stdlib; valida cada bloque) →
  `public/data/sociedad.json`, `lib/sociedad.ts`, `/pais`.

### G.13 Banca (SIMBAD) y subastas de Crédito Público

- ✅ SIMBAD (`simbad.sb.gob.do`, Apache Superset; robots 404): se leen solo
  `/api/v1/chart/{id}/data/?format=json&type=results`, que devuelve `colnames`,
  `coltypes` y `data`. Gráficos: 1467
  morosidad (jul-2026 1.79 %), 1466 cartera (RD$2.48 billones), 1464 solvencia
  (may-2026 18.87 %), 1423 tasa de préstamos nuevos (14.00 %; ventana fija que
  termina el 2026-08-05). 20–23 filas por serie; cada una termina en su mes.
  No hay serie de depósitos. ⚠️ Hallazgo de seguridad pendiente de notificar a
  la SB (§G.5): no se toca nada fuera de los datos de los gráficos que se leen.
- ✅ Subastas: la lista `/emisiones/subastas?dlAnio=AAAA&tipocontenido=Resultados`
  (GET; 2009–2026) enlaza un consolidado por año que se reescribe tras cada
  subasta: `…/2026/02Consolidado.xlsx`, `…/2025/02Consolidado.xls` (BIFF: `xlrd`
  en build). 2026: RD$200,000 M adjudicados sobre 450,160.6 M demandados (casa
  con el total del archivo). Cada subasta competitiva va seguida de una ronda no
  competitiva a la misma tasa. ⚠️ Las filas del 8 y 9-sep-2026 traen la fecha
  de liquidación (11/09/2026) en la columna de vencimiento (el PDF del resultado
  dice vencimiento 29-may-2041): se marcan como dudosas y el plazo queda nulo.
- Implementado: `lib/banca.ts` + `IndicadoresBanca` en `/`;
  `scripts/build-subastas.py` → `public/data/subastas.json`, `lib/subastas.ts`
  + `SubastasDeuda` en `/deuda`.

### G.15 El buscador de toda la plataforma — cuatro instantáneas nuevas (2026-09-27)

Para que `/buscar` encuentre leyes viejas, compras, sentencias y el Congreso
(`docs/ARQUITECTURA.md` §Búsqueda). Todas las lecturas son en build, con el
User-Agent identificable; ninguna en una visita.

- ✅ **Consultoría — todas las leyes en una consulta.** `POST
  /api/consultas/search` con `DocumentTypeCode: 1` y `PublicationYear: ""`
  devuelve el histórico entero (201, `application/json`, 12,516 filas, ~9 s);
  con un año, un subconjunto de la misma lista. La serie empieza en 1844; el
  número con año (`47-20`, a veces `16-2000`) es lo habitual desde los
  noventa, antes solo un número (`1494`), a veces con «BIS».
  `scripts/build-leyes.py` → `public/data/leyes.json` (12,130 leyes, 1.8 MB).
  ⚠️ El origen repite ~380 filas (una ley es número + fecha), 12 números
  tienen dos fechas (74-25: 2025-08-03 y 2026-08-14) y «0-00» marca cuatro
  leyes de 1921; 33 filas sin fecha, 28 sin título (se descartan). ⚠️
  Cobertura reciente escasa en el origen: 2020 trae 12 leyes y 2022, 22.
  ✅ `GET /api/document/{DocId}` sirve el PDF (`application/pdf`): es el
  enlace de las leyes sin ficha. ❌ Sin cambios: 403 de Cloudflare al egreso
  de Vercel; la ficha cae a la instantánea (`leyHistorica`).
- ✅ **DGCP — tabla de procesos, con carátula.** La tabla de §G.1
  (`/tablas/procesos?Type=csv`, un GET, 245 MB en ~5.5 s, `text/csv`,
  `x-ratelimit-limit: 60`) trae `CARATULA` —el objeto del proceso en texto
  libre, hasta 200 caracteres— además de unidad, modalidad, estado, monto,
  moneda, fecha, objeto (Bienes/Obras/Servicios) y URL; 631,900 filas.
  `scripts/build-procesos.py` → `public/data/procesos.json` (77,790
  procesos de los 12 meses anteriores a la última publicación, 10.9 MB).
  La API paginada `/procesos` trae `titulo` y `descripcion` pero a ~100
  filas por página: cientos de peticiones que la tabla resuelve en una. ⚠️
  Un 12 % de los códigos lleva espacios y tildes («Hosp. Reid
  Cabral-DAF-CD-2026-0634»): la API los resuelve codificados, y
  `reconocerPorForma` (lib/grafo.ts) no los reconoce dentro de un texto. ⚠️
  140 procesos en US$, € o £ van sin monto.
- ✅ **TC — el listado anual entero.** `GET
  /consultas/secretar%C3%ADa/sentencias?searchCriteria=&searchString=&size=999999&filtery=AAAA&criteriay=years&order=Date`
  sirve el año completo (15 peticiones para 2012–2026, sin rechazo; robots
  404): número, fecha, referencia (expediente) y «Relativo a». La ficha se
  deriva del número (`TC/0002/12` → `…/sentencias/tc000212`) en las 11,393.
  ⚠️ El PDF solo aparece en la ficha (un blob de Azure): una petición por
  sentencia, que no se hace; el buscador enlaza la ficha.
- ✅ **TSE — el visor, todas sus páginas.** `GET /?y=AAAA&s=`, 60 por página,
  siguiendo «Siguiente» (`?pos=N`); 20 peticiones para 2021–2026 (robots 200
  vacío), 713 sentencias. ⚠️ El visor pagina un orden con empates: 2024 da
  402 filas para 396 fichas y 2023, 223 para 221; la clave es la ficha, no
  el número. A veces el documento es `.docx` dentro de un `<iframe>`.
  `scripts/build-sentencias.py` → `public/data/sentencias.json` (4.4 MB, el
  «Relativo a» recortado a 300 caracteres; el del TSE, cortado en el primer
  salto de párrafo, que arrastra la fórmula de cierre).
- ✅ **SIL de Diputados — los dos períodos enteros.**
  `iniciativa/getIniciativas?page=N&keyword=&periodoId=P` (10 por página,
  de la más reciente a la más antigua). `periodoId` es el parámetro que el
  interceptor HTTP del propio portal añade a toda petición (leído del bundle
  `/sil/Script/Bundles`); sin él, el SIL responde el período vigente.
  `periodolegislativo/all` expone solo `2020-2024` (id 2760) y `2024-2028`
  (id 2761). Censos: 11,500 y 6,357; ~1,800 peticiones en serie con pausa
  (~30 min). Una pieza del período anterior abre igual en su ficha
  (`iniciativa/iniciativa/{id}`, sin `periodoId`). El listado no trae
  proponentes (una petición por pieza: no se pide). Legisladores: el barrido
  del directorio (~41 peticiones), 189 diputados y 32 senadores.
  `scripts/build-congreso.py` → `public/data/congreso.json` (17,857
  iniciativas, 7.5 MB en columnas); se niega a escribir si un período queda por debajo
  del 98 % de su total. ⚠️ Las piezas de antes de 2020 que murieron no están;
  las vivas se arrastran al registro vigente con número nuevo (RECON §6).
  ❌ El Senado no entra: su consultante pagina por postback con ViewState que
  muta la sesión (RECON §12.2); sigue en vivo en `/congreso/senado`.
- El boletín del Poder Judicial (`lib/justicia.ts`) son estadísticas, no
  sentencias: no hay nada que indexar ahí.

### G.16 Límites provinciales de la ONE — el mapa (2026-09-30)

Para pintar un mapa sin teselas ni clave (`lib/mapa.ts`, `scripts/build-mapa.py`).

- ✅ La ONE publica sus límites administrativos oficiales como COD-AB en el
  HDX de la ONU: `GET https://data.humdata.org/api/3/action/package_show?id=cod-ab-dom`
  → 200 JSON, `dataset_source` «Oficina Nacional de Estadística», licencia
  **CC BY-IGO** (se atribuye junto a cada mapa), modificado 2026-01-26.
  Recursos: GDB, SHP, **GeoJSON (ZIP de 54 MB)** y un XLSX de códigos.
- ✅ El ZIP trae `admin0` a `admin4`. Ojo con la numeración: **`admin1` son
  las 10 regiones de desarrollo** y **`admin2` las 32 provincias** (31 y el
  Distrito Nacional, `DO0801`), `valid_on` 2021-06-29, con `area_sqkm` y
  `center_lat`/`center_lon`. `admin3` son los municipios y `admin4` los
  distritos municipales: sin usar todavía.
- ✅ Las fronteras comparten vértices exactos (221,647 vértices; 74,695 en
  dos provincias, 41 en tres): se simplifica por tramos entre nudos sin
  dejar rendijas. Resultado: 3,265 vértices, ~40 KB.
- ⚠️ La ONE escribe «Baoruco»; la plataforma, `bahoruco` (el SIL). El script
  lo traduce. MapaInversiones también escribe «Baoruco»: hasta el 2026-09-30
  la ficha de Bahoruco contaba **0 obras** y su enlace a `/obras` no filtraba
  (81 obras en realidad). Corregido en `slugProvincia`.
- ⚠️ Sin verificar todavía: que los `IdMunicipio` de MapaInversiones
  (`100101`, `081201`) casen con los `adm3_pcode` de la ONE. Es lo que haría
  falta para bajar el mapa de obras a municipio.
- Alternativa descartada: geoBoundaries `DOM-ADM1` (dominio público, Natural
  Earth, 60 vértices por provincia de media). Más tosca y no es fuente del
  Estado.

### G.9 Pendientes que deja esta pasada

1. Estadísticas judiciales (índice + XLSX mensual) y sentencias del TSE.
2. Cumplimiento de la declaración jurada (Cámara de Cuentas) — solo quién
   presentó, nunca el patrimonio.
3. Subsidio eléctrico por el SIGEF en `/finanzas`; mantenimientos de las EDE.
4. IPC y turismo del BCRD (BIFF: script en build), subastas de Crédito
   Público, SIMBAD.
5. Robos y armas (MIP), matrícula (MINERD), licencias (MIVHED).
6. Fichas de datos.gob.do (3 h 30 min): solo si una rutina programada lo asume.
7. Institucional (Ley 200-04 y divulgación responsable): SB (hallazgo de
   seguridad en SIMBAD), CAASD (hallazgo menor), Cámara de Cuentas (500), SCJ (GET en
   su buscador), PJ (cadena TLS), SNS/MAP/MIDEREC (REST cerrada),
   Agricultura/INFOTEP/SIE/SIMV/ONE (WAF).

# CUARTA PASADA — 2026-09-29

Pedido del dueño: «todas las entidades públicas», los bancos, el registro
mercantil, las personas expuestas políticamente «como el Presidente», y todo lo
que un abogado necesita para empezar una investigación. Seis frentes a la vez
(entidades financieras, registro mercantil y empresas, PEP del Ejecutivo, PEP de
los otros poderes, universo del sector público, sanciones e investigación legal)
con el método de siempre: robots primero, User-Agent identificable, ≤6 peticiones
por host en el reconocimiento, solo GET salvo la consulta exacta que hace una
página pública (el precedente del buscador de la Consultoría), ningún bloqueo
rodeado, ninguna credencial filtrada usada. Los informes crudos vivieron en el
scratchpad de la sesión; aquí queda lo verificado.

**Un tropiezo de higiene, declarado.** El frente legal descargó una vez
`www.dgcp.gob.do/new_dgcp/…/Lista de Proveedores del Estado Inhabilitados…csv`
antes de leer entero el robots de ese host, que tiene `Disallow: /new_dgcp/`
para `*`. El cuerpo se borró, no se usa y la vía que se integró es otra (§H.9).
La regla sigue siendo leer el robots **completo** antes de la primera petición.

### H.1 ⭐ MAP — el Directorio de Funcionarios (observicios.gob.do)

- ✅ El Portal Único de Transparencia (DIGEIG) enlaza en «Consultas» un
  «Directorio de Funcionarios» (post 1153, WP REST): es un `iframe` a
  `https://observicios.gob.do/officials`, el Observatorio de Servicios Públicos
  del MAP. Sin robots (la ruta devuelve el cascarón de la SPA). La SPA
  (React/Vite, `assets/index-DacqX86J.js`) llama a `https://observicios.gob.do/back/api/`.
  Su cliente añade `Authorization` **solo** si hay sesión: el portal público no la
  usa.
- ✅ `POST /back/api/portal/funcionarios` con `{"page":1}` → 200
  `application/json`: `{"valid":true,"content":{"elementostotales":6153,"page":1,
  "rows":10,"paginastotales":616,"repuestas":[…]}}` (sic, «repuestas»). Es la
  consulta que hace la página. `{"page":1,"rows":500}` → 13 páginas: el
  directorio entero en 13 lecturas. ⚠️ La página pide de 10 en 10 (616
  lecturas); pedir 500 cambia solo el tamaño de página de la misma consulta y
  carga menos al servidor, pero no es literalmente la que hace el formulario:
  queda anotado en docs/DECISIONES.md.
- ✅ Cada fila: `funcionarioId`, `institucion`, `funcionario` (nombre completo),
  `cargoPrincipal`, `unidadNombreCompleto`, `decreto` (612 de 6,153), `fechaDecreto`
  (todas), `orden` (nivel jerárquico: 1 Presidente, 2 Vicepresidenta, 3 los 21
  ministros, 4 viceministros, 13 directores generales, 15 ejecutivos, 25 alcaldes,
  29 regidores, 31–49 directores de área y encargados), `estado`. La primera fila
  es «Luis Rodolfo Abinader Corona · Presidente de la República».
- ⚠️ `declara` viene `false` para **todos**, el Presidente incluido: no es fiable
  y no se usa. `fechaSalida` no significa lo que dice (en el Presidente es igual a
  la fecha del decreto). La exportación declara además `genero`, `telefono`,
  `email`, `extension`, `institucionTelefono` y una foto: **no se leen ni se
  guardan**, tampoco en la caché del script.
- ✅ `GET /back/api/portal/detalles_funcionario/{id}` responde JSON sin clave
  (historial de cargos por persona); no hace falta para la instantánea.
- ⚠️ 252 instituciones con nombres propios del MAP («Ministerio de Hacienda y
  Economía», «Oficina Nacional de Estadística»): casan con el cruce de
  instituciones por sus palabras (plural fuera, «de/la» fuera, un ganador claro)
  228 de 252, ninguna mal en la revisión a mano; las 24 restantes (Policía
  Nacional, ONESVIE, Consultoría Jurídica…) quedan como texto.
- ✅ Presidencia (`presidencia.gob.do`, Drupal): `/ministros` sirve 21 tarjetas en
  el servidor (nombre, cargo, foto, perfil), sin paginar; la fecha visible es la
  del nodo, no la del nombramiento. `/presidencia/luis-abinader` y
  `/presidencia/raquel-pena` traen biografía **con familia**: no se leen.
  `/decretos` lista ~1,870 decretos con resumen de prensa (24 por página). ❌
  `/jsonapi/node/ministers` → 404. Sirve de contraste, no de fuente: el MAP ya lo
  trae estructurado.
- ⚠️ El Portal Único publica 341 fichas de institución con una línea libre
  «Titular actual:»; están desactualizadas (Jean Luis Rodríguez figura en APORDOM
  y hoy es ministro). ❌ NORTIC (`nortic.ogtic.gob.do/instituciones/`) es Blazor
  Server y no trae la máxima autoridad.
- Implementado: `scripts/build-funcionarios.py` → `public/data/funcionarios.json`,
  `lib/funcionarios.ts`, `/funcionarios` y `/funcionarios/[slug]`.

### H.2 ⭐ Consultoría Jurídica — todos los decretos, su firmante y a quién nombran

- ✅ `POST /api/consultas/search` con `DocumentTypeCode: 3` y `PublicationYear: ""`
  → 201 `application/json`, **75,169,817 bytes en ~62 s**: **78,834 decretos
  desde 1844** (989 sin fecha). Cada fila trae, además de lo que ya leía
  `lib/normativa.ts`: `Presidente` (el firmante, 77,099 filas: «LUIS ABINADER»
  4,808, «JOAQUÍN BALAGUER» 20,679, «LEONEL FERNANDEZ» 8,810, «DANILO MEDINA»
  3,578…), `Consultor`, y campos de persona: `Nombre`/`Apellido` (9,220),
  `Cargo` (4,408), `Carrera`/`Gremio` (los exequátur de abogados, notarios y
  médicos), `TipoPension`/`Monto` (341) y `Cedula` (539).
- ⚠️ **La cédula nunca se guarda**: el script la descarta antes de escribir su
  caché. Tampoco las pensiones ni los exequátur: son personas sin cargo público.
- ⚠️ Los campos de persona del buscador no sirven cuando el decreto nombra a
  varias: concatenan todos los nombres en `Nombre` y todos los apellidos en
  `Apellido`, con un solo `Cargo`. Manda el **título**, que es el texto oficial
  («QUE DESIGNA AL SEÑOR VÍCTOR LIVIO ENMANUEL CEDEÑO BREA, SUPERINTENDENTE DE
  BANCOS…», decreto 606-26).
- ✅ Los decretos de varias personas («QUE INTEGRA EL GABINETE… Y NOMBRA
  FUNCIONARIOS», 324-20; «QUE NOMBRA CINCUENTA Y SIETE (57) VICEMINISTROS»,
  330-20) traen el detalle en el PDF: `GET /api/document/{DocId}` → 200
  `application/pdf` con capa de texto desde 2012, en la fórmula «Artículo N.-
  <Nombre> queda designado <cargo>.», con variantes militares («El General de
  Brigada X (ERD), es ascendido a mayor general y queda designado…») y el
  sustituido («… en sustitución de Y, designado mediante el artículo N del
  Decreto núm. M»). Leído con `pdfminer.six`: 57 de 57 viceministros en 330-20,
  27 de 28 gobernadoras en 340-20 (el que falta es el «Envíese»), el gabinete
  de 2012 en 3368298.
- ⚠️ Antes de 2012, y en algunos de 2012, el PDF es un **escaneo con OCR**
  («Lie.» por «Lic.», «E1», «W illiams M uioz»): el script los detecta por esas
  huellas y no los lee (se cuentan en la instantánea). `pypdf` parte palabras
  («Alm ánzar»); pdfminer no, pero puede colgarse minutos en un escaneo: va con
  un plazo de 40 s y cae a pypdf.
- ⚠️ Un decreto de «LUIS ABINADER» viene fechado en 1900: el rango de firma
  descarta la fecha suelta a más de un año de cualquier otro decreto del mismo
  firmante.
- Designaciones y ceses por título desde el 16-08-1996 (una persona por título;
  «QUE DEROGA… QUE DESIGNÓ A X» es un cese; «ACEPTA LA RENUNCIA DE X»), por PDF
  desde el 16-08-2012. Cifras de la corrida en la cabecera de la instantánea
  (`fuentes.decretos`).

### H.3 Altas cortes y órganos — quién los integra

- ✅ **Suprema Corte**: `GET https://poderjudicial.gob.do/wp-json/wp/v2/pages?slug=jueces-actuales-spj&_fields=…`
  → 200 JSON (WordPress con Elementor, BOM UTF-8): 17 jueces, «Magdo./Magda.
  Nombre» y el cargo en la línea siguiente; `modified` 2026-01-07. Sin período.
  ⚠️ El servidor omite el intermedio «Sectigo Public Server Authentication CA OV
  R36» (§G.6): va en `scripts/certificados/sectigo-ov-r36.pem`, bajado de su AIA
  (`http://crt.sectigo.com/SectigoPublicServerAuthenticationCAOVR36.crt`,
  SHA-256 65:42:D1:76…:85:30, vence 2036), y la verificación TLS queda
  **encendida**. robots de 0 bytes.
- ✅ **Consejo del Poder Judicial**: `…/pages?slug=composicion-cpj` → 5
  consejeros, `modified` 2026-05-07.
- ✅ **Tribunal Constitucional**: `GET /sobre-el-tc/pleno/magistrados/` → 200
  HTML, 13 jueces (`<a target="_self" href="/sobre-el-tc/pleno/magistrados/…"><strong>Nombre</strong></a><span>Cargo</span>`).
  robots 404.
- ✅ **Tribunal Superior Electoral**: `tse.gob.do` → 301 a `tse.do`; robots
  `Allow: /`. `GET https://tse.do/wp-json/wp/v2/pages?slug=pleno-tse` → 5 jueces de
  la «GESTIÓN 2025 – 2029 (ACTUAL)» y las gestiones 2021–2025, 2017–2021 y
  2012–2017; nombres y cargos en dos columnas que se emparejan por posición.
- ✅ **Junta Central Electoral**: `/Miembros-Titulares` y `/Miembros-Suplentes`
  (DotNetNuke tras Zenedge, robots 404) → 200 HTML, «Nombre , Presidente JCE» /
  «Nombre , Miembro Titular»: 5 + 5, gestión 2024-2028. ⚠️ A una petición
  anterior respondió en brotli sin pedirlo; con `Accept-Encoding: identity`
  llega plano.
- ✅ **Defensor del Pueblo**: `…/wp-json/wp/v2/pages?slug=despacho-defensor-del-pueblo`
  → «Pablo ULLOA · Defensor del Pueblo». ⚠️ Adjuntos y suplentes: páginas sin
  nombres.
- ✅ **Defensa** (`mide.gob.do`, WP REST): ministro y viceministros, con biografía
  familiar (no se lee); ya los trae el MAP.
- ❌ **Cámara de Cuentas** → 470 «Request Blocked» otra vez (corrige §G.6, que la
  vio responder el 2026-09-24). ❌ **Procuraduría** (`pgr.gob.do`) → 470 del WAF de
  CSIRT-RD («¡Hey, más despacio!»). ❌ `ministeriopublico.gob.do` → el proxy de
  este entorno no llega (502 `connect_rejected`): límite del egreso, no de la
  fuente. ⚠️ **Banco Central**: `/a/d/2557-miembros-jm` es un cascarón que pide el
  contenido por `POST /Home/GetContentForRender` (`id=2557-miembros-jm`); la
  consulta de prueba devolvió `"article": null` (corregido en §H.13: con el número
  solo, `id=2557`, responde; ✅ integrado). ⚠️ Policía Nacional: robots
  responde 500; con el antecedente `Disallow: /*?*` (§G.7) no se sigue.
- ❌ SISMAP «Directorio Virtual» (`/Municipal/Directorio/Dir/Details/158`) → 404:
  la ruta no existe (corrige la pista de §A.7). `/Municipal/ayuntamientos` sí lista
  160 ayuntamientos y `/Municipal/ayuntamientos/16` las 233 juntas, sin el nombre
  del alcalde. ❌ Liga Municipal: sin directorio; sus «datos abiertos» son un
  Power BI.

### H.4 JCE — los electos municipales de 2024

- ✅ `GET https://elecciones2024.jce.gob.do/DesktopModules/EasyDNNNews/DocumentDownload.ashx?portalid=0&moduleid=469&articleid=10&documentid=14`
  → 200 `application/octet-stream`, 252,057 B, `content-disposition` «RELACIÓN DE
  CANDIDATOS ELECTOS EN LAS ELECCIONES ORDINARIAS GENERALES MUNICIPALES DEL 18 DE
  FEBRERO 2024.xlsx». Sin CAPTCHA (el Zenedge de §B.3 no saltó en una lectura).
  Enlazado desde `/sala-de-prensa/relacion-general-definitiva-del-computo-del-proceso-municipal-2024`.
- ✅ Una hoja, 3,858 electos: `PROVINCIA, MUNICIPIO, CIRC., DISTRITO MUNICIPAL,
  CARGO (ALCALDE, VICEALCALDE, REGIDOR, DIRECTOR, SUBDIRECTOR, VOCAL),
  POSICION_ELEC, ORGANIZACION POLITICA, NOMBRE/APELLIDO, SEXO, VOTOS, PARTIDO DEL
  CANDIDATO`. El sexo no se lee.
- ⚠️ Los nombres de municipio no siempre casan con los del catálogo de la DGCP
  («Ayuntamiento Municipal de Azua», «Ayuntamiento Santiago de los Caballeros»):
  se enlaza el ayuntamiento solo cuando el nombre del lugar, sin «Ayuntamiento
  (Municipal) (del Municipio) de», es único.

### H.5 La definición legal de PEP

- ✅ `https://uaf.gob.do/phocadownload/transparencia/BaseLegalInstitucional/Leyes/Ley%20155-17%20Contra%20Lavado%20de%20Activos%20y%20Financiamiento%20del%20Terrorismo.pdf`
  → 200 `application/pdf`, 9,178,454 B, con texto. **Art. 2, num. 19**: «Persona
  Expuesta Políticamente o PEP: Cualquier individuo que desempeña o ha
  desempeñado, durante los últimos tres (3) años altas funciones públicas, por
  elección o nombramientos ejecutivos … **Los cargos considerados PEP serán todos
  aquellos funcionarios obligados a presentar declaración jurada de bienes.**»
- ✅ Ley 311-14 (`…/Ley%20No.-311-14%20Sobre%20Declaracion%20Jurada%20de%20Patrimonio.pdf`,
  2,034,220 B, escaneo con OCR ruidoso): el **art. 2** enumera en 33 numerales
  quién declara (Presidente y Vicepresidente; legisladores; jueces; Ministerio
  Público; ministros y viceministros; Defensor del Pueblo; Banco Central; Cámara
  de Cuentas; JCE; Contralor; bancos del Estado; alcaldes, vicealcaldes, regidores
  y tesoreros; directores de distrito; embajadores y cónsules generales;
  administradores; directores nacionales y generales y subdirectores; empresas
  del Estado; consejos de órganos autónomos; gobernadores provinciales; oficiales
  generales; Policía; DNCD; Tesorero; UASD; Junta Monetaria; encargados de
  compras…). `numeral_311()` los asigna por el texto del cargo.
- ❌ **No existe una lista oficial pública de PEP** (UAF, CONCLAFIT, Portal
  Único): la ley no la necesita, remite a la 311-14. ⚠️ El enlace viejo al
  Decreto 408-17 (`?download=3581…`) devuelve la portada (200 que no prueba
  nada).
- El art. 46 extiende la debida diligencia a cónyuge, parientes y «asociados
  cercanos»: es obligación de los bancos, y la plataforma no publica parentescos
  (docs/DECISIONES.md).

### H.6 ⭐ Banca — la Superintendencia de Bancos y las otras supervisoras

- ✅ `sb.gob.do` (Umbraco tras Sucuri): robots `User-agent: * / Disallow: /umbraco/`
  (corrige §5.6: el patrón de Aduanas `/umbraco/api/…` está **vetado** aquí y no
  hace falta).
- ✅ `/supervisados/entidades-de-intermediacion-financiera/?page=1&size=100` →
  200 HTML de servidor, 220,959 B: **47 entidades** (18 bancos múltiples, 14 de
  ahorro y crédito, 3 corporaciones de crédito, 10 asociaciones de ahorros y
  préstamos, 2 públicas; 45 operando, 1 cancelada, 1 en liquidación), cada una con
  activos, participación, empleados, estatus y ficha. Una lectura se quedó en 0
  bytes a los 25 s: un reintento.
- ✅ Ficha `/supervisados/entidades-de-intermediacion-financiera/banreservas/` →
  registro SB (H-001-1-00-0101), razón social, **RNC con guiones** (4-01-01006-2),
  calificación y calificadora, oficinas, cajeros, subagentes, accionistas, consejo
  y principales funcionarios; «Datos actualizados al 01 septiembre 2026». Estados
  financieros solo en PDF con URL por hash. Teléfonos y correos: no se muestran.
- ✅ Otras categorías de `/supervisados/`: cambiarias, fiduciarias, sociedades de
  información crediticia, oficinas de representación, otras entidades, auditores
  externos, subagentes, sanciones. Sus listados se leen con la misma plantilla;
  las fichas de las cuatro primeras quedaron tras el desafío de Sucuri (abajo).
- ✅ datos.gob.do → `https://sb.gob.do/media/4g4nrdxa/listado-de-entidades-autorizadas-a-operar-2018-2026.csv`
  (200 `text/csv`, BOM, 11,183 filas, `ENTIDAD,TIPO DE ENTIDAD,MES,AÑO`, sin RNC):
  el registro mes a mes desde 2018. `…/estad%C3%ADsticas-de-sanciones-impuestas-2017-2026.csv`
  → agregado por tipo de entidad, **no nominal**.
- ✅ SIPEN: robots `Disallow:` vacío y TLS sano por el proxy (corrige §5.7 y §B.2).
  `/institucional-normativas/administradora-de-fondos-de-pensiones` → 7 AFP con
  razón social, fecha de registro y resolución; sin RNC.
- ✅ Superintendencia de Seguros: `superseguros.gob.do` → 301 a `sis.gob.do`
  (WordPress, robots `Allow: /`). `/companias-aseguradoras-y-reaseguradoras/` → 35
  compañías en texto libre, sin RNC. ❌ Registro de intermediarios
  (`ofv.superseguros.gob.do`) → 403 de Cloudflare.
- ✅ IDECOOP: `…/wp-content/uploads/2024/07/Cooperativas-Incorporadas-por-Centros-Regionales-Julio-1953-Junio-2024.-IDECOOP-Excel.xlsx`
  → 2,304 cooperativas con número y fecha del decreto que las incorpora, región y
  provincia; congelado en junio de 2024; sin RNC.
- ❌ SIMV: desafío de Cloudflare hasta en robots (sin cambios). ⚠️ BCRD: el único
  listado de entidades en su CDN es `entidades_fondo.pdf` (43 aportantes al fondo
  de contingencia, jun-2025); el XLSX hermano da 404.
- ⚠️ **Sucuri en la SB.** A un segundo entre peticiones, el cortafuegos respondió
  tras unas 70 con su desafío de JavaScript (HTTP 307 sin `Location`, «You are
  being redirected…», `sucuri_cloudproxy_js`). `scripts/build-banca.py` espera
  diez segundos entre peticiones y, al primer desafío, no le pide nada más a la
  SB. Las 47 entidades de intermediación financiera se leyeron enteras antes del
  desafío; la corrida que sumaba cambiarias (42), fiduciarias (5), burós (4) y
  oficinas de representación (5) topó con él en las fichas cambiarias, y las otras
  tres no se alcanzaron. **Tropiezo de higiene, declarado:** el constructor reintentó
  dos veces más, con veinte minutos de pausa y una petición por minuto, y el
  desafío siguió. Reintentar a la espera de que ceda es insistir sobre un bloqueo:
  la regla es parar al primer desafío y pedir a la SB que admita el User-Agent
  (Ley 200-04). El script lo dice ahora en su cabecera.
- **Integrado (H6.2, `scripts/build-banca.py` → `public/data/banca.json`, 806 KB;
  `lib/financieras.ts`; `/banca`, `/banca/[slug]`):** 1,300 fichas: las 47 de la SB
  (45 con RNC, activos, participación, empleados, oficinas, cajeros, subagentes,
  número de accionistas, calificación, consejo, principales funcionarios y PDF de
  estados financieros y memorias enlazados sin leerse), 7 AFP (SIPEN), 35
  compañías de seguros (SIS, solo nombre y web) y 1,211 cooperativas de ahorro,
  crédito o solo servicios múltiples (IDECOOP, de las 2,304 incorporadas). Ni
  teléfonos, ni correos, ni direcciones. Los nombres del consejo y de los
  funcionarios se muestran como los publica la SB; uno lleva a `/funcionarios` solo
  si coincide (sin tildes ni mayúsculas, tres palabras o más) con una sola persona
  **y** esa persona tiene allí un cargo en la misma entidad: en Banreservas, 12 de
  sus 35 nombres; en el Banco Agrícola, 5 de 27; en BANDEX, 1 de 19. Un nombre
  igual sin ese lazo puede ser otra persona y no se enlaza (la revisión halló tres
  así). Banreservas, el Banco Agrícola y BANDEX se atan a su ficha de institución en
  los dos sentidos. El CSV mensual de autorizadas dice desde qué mes figura la razón
  social de 44 entidades; la SB cuenta 7,454 subagentes (7,161 bancarios, 293
  cambiarios). La instantánea se rehízo con `--sin-red` desde las respuestas
  guardadas antes del desafío, sin una sola petición (la de Asociación La Nacional
  la guarda la caché de una relectura de las 23:13, durante los reintentos, con los
  mismos datos que la lectura anterior al desafío): el script ya no aborta ante
  el desafío, deja de pedirle a la SB, escribe lo que leyó entero y apunta en
  `resumen.sbNoLeidas` lo que quedó fuera.

### H.7 El registro mercantil y las empresas

- ⚠️ **Registro mercantil: no hay búsqueda pública.** La consulta de todas las
  cámaras (`app.registromercantil.do/consultas`, Laravel + Vue; API
  `https://ccapi.registromercantil.do/consultapublica/api/`) solo **valida un
  certificado que ya se tiene**: pide número de RM **y** su código de validación y
  devuelve denominación, fechas y estado. No busca por nombre ni por RNC, y no hay
  socios, gerentes ni capital en ningún canal público. La consulta vieja
  (`servicios.camarasantodomingo.do/consultaRm.aspx`) no pasa del proxy (502).
- ❌ **ONAPI** (nombres comerciales y marcas): el buscador es un iframe a
  `https://www.onapi.gob.do/busquedas2021/`, cuya API `…/bsapi26/signos?…` exige un
  `X-API-Key` que el propio cliente rota por hora (401 sin él). Es un control
  anti-automatización: no se replica. `GET /bsapi26/lookups` responde sin llave
  (solo la taxonomía).
- ✅ **DGII**: el padrón `RNC_CONTRIBUYENTES.zip` sigue en §A.2, 26,878,229 B,
  `last-modified` 19-sep-2026 (sin corte nuevo en diez días: mensual, hacia el
  19). Es la única fuente de empresas legible entera: RNC, razón social,
  actividad, inicio de operaciones, estado y régimen; sin número de RM, socios ni
  domicilio.
  **Integrado (H6.4, `scripts/build-empresas.py` → `public/data/empresas/`, 510
  archivos, 16.3 MB; `lib/empresas.ts`, `lib/padron.ts`):** el CSV interior pesa
  115,606,459 B, seis columnas, **791,384 contribuyentes** (501,243 de nueve
  cifras, 290,140 de once, uno de ocho inválido). ⚠️ **Nueve cifras no es persona
  jurídica**: el padrón no trae el tipo de persona. Los RNC que empiezan por 5
  (1,794) son todos nombres de personas; entre los que empiezan por 1 y 4 hay
  sucesiones (3,995, por la actividad «IMPUESTO SUCESORAL» o «SUCESION DE…»), un
  lote de 5,041 inscripciones del 1 de enero de 2009 (RNC 1306…) con 4,316
  personas con su colmado o su boutique, y 324 nombres hechos solo de nombres y
  apellidos. Se excluyen con un clasificador por frecuencias de palabras del propio
  padrón (nombres de cédula contra nombres con forma societaria), revisado a mano
  por muestras y declarado en `/fuentes` como heurística: **490,814 personas
  jurídicas**, 79,255 con RPE (1,555 RNC tienen dos o tres). ⚠️ Codificación
  Windows-1252 con restos de cp850: 130 nombres traen «¤/¥» por ñ/Ñ (se reparan
  entre letras), 67 traen «¿» donde la DGII perdió un carácter; la actividad viene
  cortada a 128 caracteres; hay fechas vacías, «00/00/0000», del año 1000 o de los
  2040, que se muestran como vienen. Estados: 244,631 activos, 170,466
  suspendidos, 68,540 dados de baja, 6,266 en cese temporal, 636 anulados, 275
  rechazados. La búsqueda por nombre usa un índice invertido por palabra que da
  los mismos totales que el barrido completo (400 de 400 consultas al azar);
  una ficha tarda 28–38 ms en caliente y 0.64 s en frío con `next start`. Las
  marcas no son razones sociales: «banreservas» no encuentra nada, «banco de
  reservas» sí.
- ✅ **Zonas francas** (CNZFE): `/publicaciones/empresas-aprobadas/` enlaza un PDF
  por año 1999–2026 con texto (`Empresas-Aprobadas-2026.pdf`, 295,280 B: empresa,
  actividad, ubicación, empleos, inversión); sin RNC. ❌ Su REST de WordPress: 403.
- ❌ Formalízate: sin consulta pública de empresas. ❌ ProDominicana: sin
  directorio de exportadores; `connectprodominicana.gob.do` veta `*` en su robots.
- ❌ **Asociaciones sin fines de lucro** (el Centro Nacional de Fomento, hoy en
  `minpre.gob.do/casfl/`): el registro vive en `sigasfl.gob.do`, 403 de Cloudflare
  hasta en robots; minpre sirve un desafío intermitente («One moment, please…»).

### H.8 ⭐ El universo del sector público — el Clasificador Institucional

- ✅ `https://digepres.gob.do/wp-content/uploads/2026/05/Clasificador-Institucional.pdff_.pdf`
  (el sufijo no es predecible: se descubre por `/wp-json/wp/v2/media?search=clasificador`,
  `X-WP-Total` 40) → 200 `application/pdf`, 2,435,402 B, 46 págs., «Actualizado al:
  09/01/2026», con texto. Columnas `SECTOR … PODERES ENTIDAD CAPÍTULO SUBCAPÍTULO
  UNID. EJEC. DENOMINACIÓN`: **528 capítulos, 537 subcapítulos, 666 unidades
  ejecutoras**: Gobierno central 32 (con los poderes y órganos constitucionales),
  descentralizadas 60, seguridad social 8, **gobiernos locales 393** (ADN, 158
  ayuntamientos, 234 juntas de distrito), empresas públicas no financieras 25,
  financieras 10. La columna ENTIDAD no es única: no sirve de id. Trae una
  bitácora de cambios.
- ✅ Sus capítulos **son** los del SIGEF y los de la DGCP (`codigo_capitulo[4:8]`
  de `unidades_compra`, 759 unidades: 739 activas y 20 suprimidas): casan 364 de
  378. La DGCP arrastra códigos viejos (la CDEEE 6105 para EGEHID, ETED y las EDE;
  SB 5126 por 5009; SIMV 5145 por 5008; MEPyD 0220, capítulo inhabilitado; DGII
  0999, una partida de deuda); los fideicomisos 6201–6207 no están en el
  clasificador. `lib/capitulos.ts` tiene 13 códigos que el clasificador ya no trae
  y le faltan 9.
- ✅ Transferencias por entidad receptora (XLSX de DIGEPRES): proyecto 2027
  (`…/2026/09/12.-Clasificacion-Institucional-segun-Entidad-Receptora.xlsx`, 553
  filas) y presupuesto 2026 (`…/2026/02/1.10-…-2.xlsx`, 545): el monto por
  capítulo, gobiernos locales incluidos; las filas 9xxx son ONG y 4xxx subsidios.
- ❌ API del SIGEF (`api-sigef.hacienda.gob.do`) → 403 de Cloudflare desde este
  entorno, hasta en robots (Ray a42e3ec13ca2b58e): afecta la regeneración de
  `scripts/build-fiscal.py` desde aquí. ❌ DIGECOG → 470. ❌ MAP: su única
  «estructura del Estado» es un PDF narrativo de 2018. ❌ Liga Municipal: sin
  lista de municipios con códigos (el código útil es el de DIGEPRES, 7001–7394).
- **Integrado (H6.3, `scripts/build-instituciones.py`):** el Clasificador define el
  universo de `/instituciones`: **894 fichas**, las 739 unidades de compra de la
  DGCP y 155 capítulos sin unidad (id estable `900000 + capítulo`: 900101 el
  Senado, 900301 el Poder Judicial, 905002 el Banco Central, 907024–907393 los 145
  gobiernos locales que faltaban). pypdf lee el PDF en ~4 s; pdfminer, en ~50 s y
  hay que rehacer las filas por altura (mismos 528 capítulos). El PDF trae
  anomalías: cuatro unidades sin subcapítulo (5161, 5162, 5163, 7068), 7352 01 001
  con código de tres cifras, 7180 y 7295 apuntan a un subcapítulo 02 que no se
  declara, 7063 01 sin unidad; su anexo da el capítulo de 13 receptoras (2262,
  2263 → 0202; 2266 → 0219; 2267 → 0222…). Dieciocho unidades se atan por alias
  (tabla por código, tabla por unidad, anexo o nombre del gobierno local) y el
  build los imprime; cuando la DGCP guarda un código que no es el de la entidad,
  la ficha enseña el presupuesto del capítulo vigente o ninguno (la DGII enseñaba
  el 0999, obligaciones del Tesoro). Las transferencias del cuadro de receptoras
  se atan a 480 instituciones (ley 2026, suma exacta RD$443,963,711,250) y 477
  (proyecto 2027, RD$551,782,380,204); el 7199 «AYUNTAMIENTOS» (RD$2,000 millones
  en 2026, RD$5,000 millones en 2027) no se reparte. ⚠️
  `/wp-json/wp/v2/elementor_library/{id}` → 401 y los medios traen `post: null`:
  de dónde sale un archivo se lee en la página pública que lo enlaza.

### H.9 Sanciones e investigación legal

- ✅ **Proveedores inhabilitados de la DGCP**: la visualización del portal es un
  Power BI incrustado (no se lee). La tabla sí baja por la misma API de §G.1:
  `GET https://datosabiertos.dgcp.gob.do/api-dgcp/v1/tablas/proveedores?Type=csv&inhabilitados=true`
  → 200 `text/csv`, `ProveedoresInhabilitados.csv`, 933,864 B: **2,317 medidas
  sobre 1,734 RPE**, 2010-12-19 → 2026-09-22 (`RPE, MOTIVO_INHABILITACION, FECHA,
  FECHA_INHABILITACION, FECHA_HABILITACION, FECHA_FIRMA_RESOLUCION,
  OFICIO_INHABILITACION, URL_CERTIFICACION_RPE`). No hay campo de tipo: se lee
  del motivo (suspensión o cancelación de oficio, inhabilitación, régimen de
  prohibiciones, bajas a solicitud del propio proveedor, «vínculo con
  investigados»). `FECHA_HABILITACION` trae centinelas futuros (2027, 2040, 2055).
  Con `inhabilitados=false` la tabla entera (80 MB) da razón social y RNC: casa
  el 100 %. ⚠️ 400 son personas físicas (399 cédulas): decisión del dueño
  (docs/DECISIONES.md).
  **Integrado (H6.5, `scripts/build-sanciones.py` → `public/data/sanciones.json`,
  965 KB; `lib/sanciones.ts`):** 1,756 medidas sobre 1,332 empresas y entidades.
  Fuera, solo contadas: 507 medidas sobre las 400 personas físicas, 6 filas de
  prueba del propio sistema (RPE 77888 y 77889, «PROVEEDOR PRUEBA») y 48
  repetidas que solo difieren en `FECHA`. En 9 motivos se omiten el nombre, el
  documento o el domicilio de quien firma una solicitud. El tipo se lee del
  motivo con reglas escritas sobre los 915 textos distintos (la primera que casa
  gana), en quince tipos y tres familias: sanciones (inhabilitación permanente
  160, temporal 98, sin plazo escrito 9, incumplimiento de contrato 43), de
  oficio (prohibición por cargo público 822, proceso penal 120, condena 30,
  posible vínculo con investigados 4, suspensión 7, cancelación 160, casi todas
  de instituciones públicas inscritas como proveedoras) y a pedido u otras
  (suspensión 108 y cancelación 149 a solicitud, corrección del registro 22,
  levantamiento 17, otro 7). 315 traen fecha de rehabilitación, 51 de ellas
  futura. Dos rasgos del dato: al cancelar un registro la DGCP pega «@C» al
  documento («132406079@C2», 457 casos; las nueve primeras cifras siguen siendo el
  RNC), y 307 RNC tienen más de un RPE, así que una medida sobre un registro viejo
  se ve en la ficha del nuevo. La tabla entera trae el estado de cada registro
  (Activo 89,108; Desactualizado 35,356; Cancelado 9,294; Inactivo 3,112;
  Suspendido 865; Inhabilitado 174). ⚠️ `URL_CERTIFICACION_RPE` se enlaza, no se
  pide: el robots de `comunidad.comprasdominicana.gob.do` responde 401, así que no
  se verificó que la constancia se sirva. La ficha de proveedor ya no da 404 si el
  RPE no tiene contratos: la abren el registro en vivo, el histórico o una medida
  (827 de los 1,332 no tienen contratos).
- ✅ **OFAC** (lista SDN del Tesoro de EE. UU., fuente extranjera y oficial):
  `https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV`
  → 302 a un S3 firmado → 200 `text/csv`, 5,716,625 B, 19,444 filas; `ADD.CSV`
  1,695,007 B. 27 entradas tocan la República Dominicana (14 personas, 13
  entidades; 11 con RNC como «Tax ID»). Se publican las 13 entidades con enlace a
  su entrada en `https://sanctionssearch.ofac.treas.gov/Details.aspx?id=<ent_num>`
  (✅ 200 `text/html`; su robots solo veda `/error.aspx`); ninguno de los 11 RNC
  está en el registro de proveedores de la DGCP, ni cancelado. `robots.txt` del
  servicio de listas: 404. ✅ Lista consolidada de la ONU: 0
  menciones (control negativo). ⚠️ Banco Mundial: la tabla de inhabilitados sale
  de una API con `apikey` publicada en su JS; el dueño aprobó usarla el 30-09-2026
  sin escribirla en el repositorio (§H.13). ❌
  BID: 403 de Cloudflare hasta en robots.
- ✅ **ProCompetencia**: robots con `Crawl-Delay: 20`; sus resoluciones no están en
  la REST, pero `https://procompetencia.gob.do/resoluciones-procompetencia/feed/`
  → 200 RSS con las 10 más recientes y las partes en el extracto. ⚠️ Pro
  Consumidor no publica sancionados nominales.
- ✅ **Poder Judicial**: `ultimassentencias.poderjudicial.gob.do/` sirve la última
  sentencia de cada sala de la SCJ (5 filas, PDF en blob de Azure). ⚠️ El rol de
  audiencias (`apigestionaudienciasroles.poderjudicial.gob.do/api/Materias/` responde
  sin clave) se consulta por `POST /api/Audiencias/ObtenerRolAudiencias/` (corregido:
  probado e integrado, §H.13). ❌ El buscador de la SCJ sigue siendo POST de formulario.
- ⚠️ **Registro Inmobiliario**: `servicios.ri.gob.do/ConsultaDeExpedientes` da el
  estado de un trámite por número exacto (POST; integrado, §H.13); ❌ el parcelario lleva reCAPTCHA;
  ❌ las certificaciones de estado jurídico exigen cuenta y pago. No hay consulta
  pública del estado jurídico de un inmueble.

### H.10 Hallazgos de seguridad (se notifican; no se usan)

- **CCPSD**: hallazgo de seguridad; no se usó; se notifica aparte, como el
  precedente del 311 (§A.9).
- **CNZFE**: hallazgo de seguridad; se notifica aparte.

Los avisos de estos hallazgos (y los de la SB, la CAASD y el 311) se entregan al
dueño aparte y **no se guardan en el árbol de este repositorio, que es público**:
el qué y el dónde de cada uno se escriben aquí cuando la institución lo haya
corregido. Las versiones anteriores de estas líneas, con el detalle, **siguen en
el historial de git**; qué hacer con eso lo decide el dueño (docs/DECISIONES.md,
pendientes).

### H.11 Pendientes que deja esta pasada

1. Designaciones anteriores a 2012 de decretos de varias personas: escaneos. Solo
   con un OCR propio en build, y se declara.
2. Las listas de omisos y tardíos de la Cámara de Cuentas contra la capa de
   personas (el conteo por institución de §G.12): la Cámara volvió a 470.
3. Los adjuntos del Defensor: sin vía hoy. La Junta Monetaria (BCRD) ya se lee
   (§H.13).
4. ✅ Rol de audiencias del Poder Judicial y expedientes del Registro Inmobiliario:
   aprobados por el dueño el 30-09-2026 e integrados (§H.13).
5. ProCompetencia (RSS) y las últimas sentencias de la SCJ: tarjetas en vivo,
   baratas, sin hacer.
6. Rehacer contra el universo nuevo de 894 fichas los scripts que casan por
   nombre con `instituciones.json` (`build-sismap.py`, `build-auditorias.py`,
   `build-obras.py`, `build-nomina-general.py`): así las 155 entidades del
   Clasificador ganan sus aristas. `build-auditorias.py` no se puede hoy: la
   Cámara de Cuentas responde 470 y una regeneración parcial borraría lo que ya
   se tiene; los otros tres quedaron fuera de esta pasada.
7. `lib/capitulos.ts` (el catálogo del formulario de Hacienda) tiene once códigos
   que el Clasificador retiró y le faltan nueve: el sitemap ya lista los de
   `fiscal.json`; regenerar el catálogo depende de la API del SIGEF (403 aquí).
8. Institucional (Ley 200-04 y divulgación responsable): CCPSD/FEDOCÁMARAS/MICM
   (extracto del registro mercantil), ONAPI (acceso a `bsapi26`), SB (que su
   cortafuegos admita el User-Agent: cambiarias, fiduciarias, burós y oficinas de
   representación, §H.6), SIMV, SIS (intermediarios), CASFL (registro de ASFL),
   Cámara de Cuentas y PGR (470),
   DIGECOG (470), Hacienda (API del SIGEF, 403), BID; y los dos avisos de §H.10.

### H.12 Declaraciones juradas de patrimonio — dónde están (2026-09-30)

El dueño preguntó por las de Luis Abinader. Reconocimiento con el UA de la casa,
robots primero, solo GET, sin transcribir ningún PDF:

- ❌ **Cámara de Cuentas** (`camaradecuentas.gob.do/index.php/reportes-djp`) → **HTTP
  470** «Request Blocked» otra vez (corrige §G.6/§G.12, que la vieron responder el
  24-09-2026). `scripts/build-auditorias.py` no puede regenerarse hoy.
- ⚠️ **Consulta Pública de DJP** (`https://consultadjp.camaradecuentas.gob.do/`) → 200
  `text/html`, 23,151 B, ASP.NET MVC con AdminLTE, «Consulta DJP | Reporte Externo»:
  es el registro central y busca por nombre, cédula, institución o cargo. El listado
  sale por `POST Home/dtSourceDetalle` (DataTables) y el documento pide un **CAPTCHA**
  (`POST /Reportes/ValidarCaptcha`). No se ejecutó: la plataforma no la lee; la ficha
  de cada obligado la **enlaza** para que el lector busque. Vía para leerla:
  institucional (un volcado de metadatos: declarante, institución, cargo, fecha).
- ❌ `djurada.camaradecuentas.gob.do/DJP_OJO_CIUDADANO/pgReportesDJPExternos.aspx`,
  que enlaza la Presidencia → 404 (enlace muerto; se puede reportar a su OAI).
- ⚠️ **Presidencia** (`presidencia.gob.do/transparencia/declaraciones-juradas`, Drupal;
  robots permite) → 200: 10 PDF de la Dirección de Comunicación, de 2012 a 2021.
  **Ninguna del Presidente ni de la Vicepresidenta**; la sección no se actualiza
  desde 2021.
- ✅ **Las instituciones publican las de sus directivos** en su biblioteca WordPress:
  `GET /wp-json/wp/v2/media?search=declaracion&media_type=application` (la lectura de
  §G.2, filtrada). MAPRE y la Vicepresidencia tienen el portal de transparencia como
  **segunda instalación** de WordPress bajo `/transparencia/` (su `wp-json` es otro).
  Primera lectura de `scripts/build-declaraciones.py` (30-09-2026): **105
  declaraciones de 7 instituciones** (MIP 55, MAPRE 15, MIVHED 12, DIGEIG 8, OGTIC 4,
  INTRANT 2 y la Presidencia 9); **62 atadas a una ficha** sin dudas. Vicepresidencia:
  0 por esa vía. Ambiente: robots 403 (Cloudflare), no se lee.
- Veredicto para el dueño: **la declaración de Luis Abinader no está publicada en
  abierto** en ningún portal legible; la tiene la Cámara de Cuentas y se consulta a
  mano en su consulta pública. Decisión de enlazar: docs/DECISIONES.md (30-09-2026).

### H.13 Consultas POST aprobadas y el Banco Mundial (2026-09-30)

Aprobado por el dueño el 30-09-2026 (docs/DECISIONES.md). Reconocimiento con el UA de
la casa, como mucho tres POST por consulta, sin sesión ni cookies:

- ✅ **Poder Judicial — Rol Nacional de Audiencias.** Página pública
  `rolnacionalaudiencias.poderjudicial.gob.do` (SPA de React, sin CAPTCHA ni clave),
  API `https://apigestionaudienciasroles.poderjudicial.gob.do/api/`: catálogos por GET
  (`Materias/`, `TipoConsultas/`, `Distritos/`, `Categorias?IdDistritoJudicial=30`) y el
  rol por `POST /api/Audiencias/ObtenerRolAudiencias/` con JSON
  `{"idDistritoJudicial":0,"idCategoriaTribunal":0,"idMateria":0,"idTribunal":0,"idSala":0,
  "idModalidad":0,"idEstatus":0,"idTipoConsulta":4,"tipoConsulta":"<NUC>","fechaDesde":null,
  "fechaHasta":null,"paginaActual":1,"registrosPorPagina":20}` → 200 JSON con
  `totalRegistros` y `datos[]`: la **historia completa del caso en todos los
  tribunales** (fecha y hora locales, tribunal, sala, modalidad, estado, resultado,
  próxima audiencia, materia, asunto). `partes` es una cadena con nombres y su papel:
  **no se muestra el nombre**, solo el papel. Tipos de consulta que la API admite y la
  plataforma **no usa**: nombre de parte (6), cédula (7), representante (26) y el rol
  entero sin filtro. El NUC no tiene un formato único (nueve patrones en 20 filas):
  se envía tal cual. 4.6 s para un caso.
  **Integrado el 30-09-2026**: `lib/audiencias.ts` → `/audiencias`. Solo `idTipoConsulta: 4`
  con el NUC que escribe el lector (cifras, letras, `-`, `/`, `.`, de 5 a 40, con al menos
  una cifra), a lo sumo 3 páginas de 20 (lo demás se declara), caché por NUC de una hora.
  De `partes` queda solo el papel final de cada entrada, si está en una lista cerrada
  (`PAPELES`); el nombre se descarta dentro de la función cacheada y `urlAudiencia` no se
  guarda. Verificado con el UA de la casa: NUC inexistente → 200 con `datos: []` (4.6 s);
  el NUC real del reconocimiento → 200, 5 audiencias en 2 tribunales; ni el HTML pintado
  ni la caché de Next llevan un nombre de parte. ⚠️ En `next dev` sí: React 19.2 serializa
  en la página, como información de depuración, el valor de cada lectura que espera un
  componente de servidor, respuesta cruda incluida. El servidor de producción de React no
  tiene ese código (`serializeIONode`, `visitAsyncNode` y `emitIOInfoChunk` solo están en
  la build de desarrollo de `react-server-dom-webpack`); comprobarlo en `next start` antes
  de dar por cerrada una capa con datos personales.
- ⚠️ **Registro Inmobiliario — consulta de expedientes.**
  `POST https://servicios.ri.gob.do/ConsultaDeExpedientes/GetExpedient`,
  `application/x-www-form-urlencoded`, `NoExpe=<número>` (mínimo 5 caracteres), sin
  cookies, token ni CAPTCHA → 200 JSON `{"data":[],"statusCode":200,"errorMessage":null,
  "isSuccess":false}` para un número que no existe. **No se vio una respuesta con
  datos** (no hay número real publicado): las columnas `fechaSolicitud, organo,
  numeroExpediente, numeroOriginal, resultadoExpediente, estatusDigital, tramites`
  salen del JS de la página. El parcelario sigue con reCAPTCHA (❌) y las
  certificaciones de estado jurídico, con cuenta y pago (❌).
  **Integrado el 30-09-2026**: `lib/inmobiliario.ts` → `/inmobiliario`, mismo contrato que
  el rol (número exacto de 5 a 40 caracteres con una cifra, caché de una hora, `null` si no
  contesta, un `statusCode` ≥ 400 dentro del 200 cuenta como caída). Número inexistente →
  200 `data: []` (3.5 s), verificado con el UA de la casa. ⚠️ La forma con datos sigue sin
  verse: cada columna se lee como `unknown` opcional (texto, número o lista) y ninguna fila
  se descarta por su forma; la página y `/fuentes` lo dicen.
- ✅ **BCRD — Junta Monetaria.** `/a/d/2557-miembros-jm` pide su contenido con
  `POST /Home/GetContentForRender`, `id=2557&languageName=es` (el número solo; la
  prueba de §H.3 mandaba el identificador entero y por eso volvía `null`) → 200 con
  JSON dentro de `text/html`, 3,501 B: diez nombres y cargos en `article.content`
  (HTML). Trampa: un miembro retirado queda **comentado** en el HTML y hay que
  quitar los comentarios antes de leer. `id=2562` («Principales funcionarios»,
  151,815 B) trae nombre y cargo del gobernador, la vicegobernadora, el gerente, el
  contralor, subgerentes, asesores y directores, con biografías y fotos que no se
  leen.
  **Integrado el 30-09-2026** en `scripts/build-funcionarios.py` (`leer_junta_monetaria`,
  caché `junta.json`, origen `bcrd`, institución 905002): diez personas, nueve miembros
  (tres por su cargo: el gobernador, que la preside, el ministro de Hacienda y Economía y
  el superintendente de Bancos) con el numeral 31, y la secretaria, sin numeral (la ley
  nombra a los miembros). Se niega a escribir con menos de cinco miembros o si la lectura
  falla. ⚠️ Desde este entorno el proxy de salida respondió 502 al abrir el túnel hacia
  `www.bcrd.gov.do` (03:36 y 03:48 UTC del 30-09-2026, tres intentos, ninguno llegó al
  Banco): la instantánea se armó con la respuesta del reconocimiento de ese mismo día
  (02:16 UTC, mismo POST y mismo UA), puesta en la caché y leída con `--sin-red`.
- ✅ **Banco Mundial — firmas e individuos inhabilitados.** La página
  `https://www.worldbank.org/en/projects-operations/procurement/debarred-firms` (robots
  permite) trae en un `<script>` en línea `var prodtabApi = "…"` y `var propApiKey = "…"`
  (32 caracteres; hay también una de QA: se ancla por el nombre de la variable). `GET`
  al endpoint con la cabecera `apikey`, sin Origin ni Referer → 200 JSON, 1.75 MB,
  7.7 s: `response.ZPROCSUPP[]`, **1,520 sanciones vigentes** (firmas 1,251,
  individuos 260), con `SUPP_NAME`, `LAND1`/`COUNTRY_NAME`, dirección, `DEBAR_FROM_DATE`,
  `DEBAR_TO_DATE` (2999-12-31 = indefinida), `DEBAR_REASON`, `INELIGIBLY_STATUS`,
  `ELIG_STAT` (DEBARRED o X-DEBARRED, inhabilitación cruzada). `ADD_SUPP_INFO` no es
  fiable y no se usa. **Una entrada dominicana**: una firma, inhabilitación cruzada del
  EBRD de 2026-06-26 a 2027-07-10. El robots del gateway (`apigwext`) responde 403 del
  WAF: no hay reglas legibles. No hay descarga oficial sin clave (los botones Excel y
  PDF se generan en el navegador).

### H.14 Wikidata, para el grafo semántico (2026-09-30)

- ❌ **`query.wikidata.org`**: su `robots.txt` (200) veta `/sparql` y `/bigdata` para
  `*`. **Resbalón de higiene de esta sesión**: una consulta de prueba a `/sparql`
  salió en el mismo comando que leyó el robots, antes de mirarlo. Fue una sola, no se
  repite y ningún dato de ella se usa.
- ⚠️ **`www.wikidata.org`**: `robots.txt` veta `/w/` (la API de búsqueda) y
  `/wiki/Special:`, pero **permite `/wiki/Special:EntityData/<QID>.<formato>`**: se puede
  leer un elemento que ya se conoce, no buscar uno.
- ✅ **QLever** (`https://qlever.dev/api/wikidata`, Universidad de Friburgo): réplica de
  Wikidata con SPARQL público; `robots.txt` → 404 (sin reglas). `GET ?query=` con
  `Accept: application/sparql-results+json` → 200 en menos de un segundo. Es la vía
  para buscar identificadores. Verificado con ella: Luis Abinader es `Q16594097`;
  «presidente de la República Dominicana», `Q607982`; y las clases que la ontología
  enlaza (`Q5` ser humano, `Q327333` organismo público, `Q192350` ministerio, `Q22687`
  banco, `Q650241` institución financiera, `Q43229` organización, `Q820655` ley,
  `Q2571972` decreto, `Q913337` provincia de la República Dominicana, `Q106155`
  persona expuesta políticamente, `Q294414` cargo público, `Q454263` declaración
  jurada, `Q786` República Dominicana). De Wikidata solo se toman identificadores
  (`owl:sameAs`), nunca biografías, fotos ni datos personales.
- ✅ **Primera lectura** (`scripts/build-wikidata.py`, 30-09-2026; cinco consultas con
  6 s de pausa; un 429 de QLever en la consulta de provincias por etiqueta se respetó y
  se reescribió por `P150` de `Q786`): **128 fichas con QID**, 32 provincias (todas),
  30 instituciones, 2 bancos (Popular y Adopem) y 64 personas: 31 firmantes de decretos
  (las palabras de su firma contra los titulares de la Presidencia) y 33 con un cargo
  obligado a declarar o un escaño, por nombre completo exacto de tres palabras o más.
  Solo pares únicos en los dos sentidos. Las 96 etiquetas se
  revisaron a mano; la única sin etiqueta en español, Clara Martínez Thedy
  (`Q124393485`), se confirmó con **una** lectura de
  `Special:EntityData/Q124393485.json` (200): humana, ciudadana dominicana, diplomática.
- ✅ **Error de armado que destapó la revisión**: el Gaspar Polanco que firmó 19 decretos
  en 1864 compartía ficha con el director de Normas de 2001. `otra_epoca()` en
  `scripts/build-funcionarios.py` ya no une a un firmante con un tocayo cuyos cargos
  caen todos a más de 70 años de sus firmas; la dirección sin sufijo queda para el
  firmante (la que enlaza su lista de decretos). Fue el único caso en las 15,608 fichas.
- Implementado: `public/data/wikidata.json`, `lib/wikidata.ts`, el `owl:sameAs` de
  `lib/grafo-rdf.ts` y el `sameAs` del JSON-LD de cada ficha (docs/ARQUITECTURA.md, el
  grafo semántico). `/fuentes` lo declara. De una persona, el enlace sale solo si es PEP
  hoy o firmó decretos como jefe de Estado (la regla de proporcionalidad de su ficha): de
  las 64, eso deja fuera a quien dejó el cargo hace más de tres años.
