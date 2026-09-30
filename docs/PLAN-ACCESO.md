# Plan de acceso — que el Estado se recorra solo

**Principio rector:** acceso fácil. Toda pregunta ciudadana se contesta en dos
toques como máximo, y todo dato enlaza con sus parientes: una institución lleva
a su presupuesto, sus compras, su nómina y sus decretos, y de cada uno se vuelve.

Levantado el 2026-09-23 sobre el árbol en `c3b8834`, con tres recorridos del
código (navegación, profundidad por vertical, fuentes pendientes). Cada punto
cita dónde se comprobó. Se marca ✅ cuando se entrega y se mueve a la página
que lo posea; lo que exija una decisión del dueño va a `docs/DECISIONES.md`.

## 1. Diagnóstico — dónde se atasca hoy un ciudadano

1. **Cada vertical es una isla.** El único puente es Congreso → Normativa
   (`components/congreso/dossier.tsx`). `/finanzas/[capitulo]`, `/nomina`,
   `/planes` y `/normativa/[tipo]/[numero]` no enlazan a ninguna otra vertical.
2. **No existe la institución.** El mismo ministerio es una unidad de compra
   (DGCP), un capítulo (`lib/capitulos.ts`) y un código de nómina
   (`lib/nomina.ts`), y nada los une. Es el mayor atasco de la plataforma.
3. **Solo se busca en compras.** El buscador de la cabecera existía únicamente
   en Licitaciones (hoy la cabecera abre siempre la búsqueda global y cada
   vertical lleva su campo en la página). Normativa y Finanzas no tenían
   búsqueda de texto. Quien escribía «MINERD» o «Ley 47-25» no tenía dónde.
4. **Seguir, compartir y alertas son solo de compras.** `lib/seguimiento.ts`
   guarda procesos; `components/compartir.tsx` dice «Mira esta licitación»;
   el RSS (`app/api/feed/route.ts`) es de procesos. No se puede seguir un
   proyecto de ley, que es el caso más natural de «avísame cuando se mueva».
5. **La explicación está escrita y no se ve.** `lib/glosario.ts` (11 términos)
   no lo importa nadie; no hay primitiva de término. Solo compras tiene guía
   (`app/guia`).
6. **Lo que ya está en los datos no se muestra.** Proponentes con
   `legisladorId`, provincia y partido (`lib/congreso.ts:71-78`) sin ficha de
   legislador; `vigente − inicial` y `devengado − pagado` en `fiscal.json` sin
   pintar; oferente único, excepciones y compras fuera del PACC ya traídas en
   `Proceso` sin agregar; provincia del proveedor sin vista territorial.
7. **Estado fuera de la URL y datos viejos sin avisar.** La institución de
   `/nomina` vive en `useState` (no se comparte). La nómina de Defensa Civil es
   de diciembre de 2021 y la de la JAC de marzo de 2026, sin marca visible.

## 2. Horizonte 1 — tejer lo que ya existe (sin fuentes nuevas)

El esqueleto. Nada de esto toca una fuente nueva ni la invariante.

| # | Entrega | Qué resuelve | Hecho cuando |
|---|---|---|---|
| 1.1 ✅ | **Ficha de institución** `/instituciones/[id]` sobre un cruce estático `lib/instituciones.ts` (capítulo SIGEF ↔ unidad de compra DGCP ↔ código de nómina ↔ nombre en la Consultoría), curado a mano y versionado —no es una DB— | Diagnóstico 1 y 2. Una página por institución: presupuesto y ejecución, compras recientes y principales proveedores, nómina, PACC y decretos que la citan (`Institucion` en la instantánea de normativa) | Las 11 instituciones de nómina y los 20 capítulos de mayor gasto tienen ficha; cada vertical enlaza a ella |
| 1.2 ✅ | **Buscador global** `/buscar` y caja en la cabecera de **todas** las secciones | Diagnóstico 3. Enruta por forma: RNC/RPE → proveedor; «Ley 47-20» → ficha de norma; código de proceso → proceso; nombre de institución → su ficha. Si no hay forma, consulta en paralelo DGCP, SIL, títulos de la instantánea de normativa, cargos de nómina e instituciones, y agrupa los resultados por vertical | Las cinco formas enrutan directo; el resto devuelve resultados agrupados con alcance declarado |
| 1.3 ✅ | **Término explicado**: primitiva `<Termino>` (HoverCard de shadcn) sobre `lib/glosario.ts`, ampliado; y guías por vertical: «Cómo nace una ley», «Cómo leer el presupuesto», «Qué es la deuda del SPNF» | Diagnóstico 5. Explicar en el sitio donde se tropieza | Todo término de `glosario.ts` aparece al menos una vez envuelto; tres guías publicadas y enlazadas desde su vertical |
| 1.4 ✅ | **Enlaces de ida y vuelta**: norma → proyecto que la originó; Diputados ↔ Senado para la misma pieza; proceso y capítulo → institución | Diagnóstico 1 | Ninguna ficha es un callejón sin salida. ✅ Lado compras: proceso, `/contratos`, `/estadisticas`, `/planes`, clientes de `/proveedores/[rpe]` y `/licitaciones?uc=` enlazan a la ficha de institución |
| | ✅ **Lado Congreso (2026-09-23):** ley → proyecto de Diputados que la originó y proyectos que la citan (`proyectosDeNorma`, confirmado por número de promulgación); Diputados ↔ Senado por la cita de expediente o, si el Senado la dejó vacía, por la misma ley (`gemeloEnSenado`). ✅ Texto de una pieza → institución: solo por nombre completo de 18 letras o más, sin hospitales ni ayuntamientos (`institucionesNombradasEn`) | `docs/RECON.md` §14.5 | |
| 1.5 ✅ | **Seguir cualquier cosa**: `lib/seguimiento.ts` pasa a tipos (proceso, proyecto, proveedor, institución); `/seguimiento` sale de Licitaciones; «qué cambió desde tu última visita», calculado en el navegador; compartir y RSS en toda ficha | Diagnóstico 4, sin servidor ni cuenta (sigue en `localStorage`) | Se sigue un proyecto de ley y la página marca su cambio de estado |
| 1.6 ✅ | **Estado en la URL y frescura visible**: filtros de `/nomina` en `searchParams`; marca de antigüedad por institución cuando el mes publicado tenga más de 3 meses | Diagnóstico 7 | Un enlace a `/nomina?inst=MSP&cargo=chofer` reproduce la vista; Defensa Civil muestra su fecha |
| 1.7 ✅ | **Portada y navegación**: tarjetas de Normativa y Democracia; buscador en la portada; en el teléfono, «Buscar» y «Seguimiento» como pestañas fijas; `app/sitemap.ts` con las fichas | Diagnóstico 3 y 8 del recorrido: Finanzas y Normativa quedan a dos toques y los buscadores externos no encuentran las fichas | Toda vertical a un toque o una búsqueda desde la portada |

**Entregado (2026-09-23):**

- ✅ **1.3** — `components/termino.tsx` sobre `ui/popover` (no HoverCard: un
  dedo no tiene `hover`; se abre al tocar y con teclado, 44 px de toque sin
  mover la línea). `lib/glosario.ts` pasa de 13 a 42 términos, todos envueltos
  al menos una vez (portadas de vertical, fichas, guías). Guías: `/guia`
  (compras, se queda donde estaba), `/congreso/guia`, `/finanzas/guia` y
  `/finanzas/guia/deuda`, enlazadas desde su vertical (pestaña «Guía» en
  Congreso y Finanzas, tarjeta de deuda) y entre sí (`components/otras-guias.tsx`).
  Solo afirman lo comprobable de la Constitución de 2015 y la Ley 423-06; los
  reglamentos de cámara no se resumen.
- ✅ **1.5** — `lib/seguimiento.ts` con entradas tipadas (proceso, proyecto,
  expediente del Senado, proveedor, institución, norma) y migración de la lista
  vieja de códigos. `/seguimiento` es página de plataforma (pie y paleta), agrupa
  por tipo y marca «qué cambió desde tu última visita» para compras y piezas del
  Congreso; `/api/seguimiento` da la huella de una pieza del Congreso y
  `/api/feed/congreso/[id]` su historial en RSS. Seguir y compartir con texto por
  tipo en las fichas de proceso, Diputados, Senado, proveedor, norma, institución
  (con el RSS de sus procesos nuevos) y capítulo (este solo compartir: es una
  instantánea).
  ⚠️ Proveedores, instituciones y normas se siguen como marcadores, sin
  comparación de estado: no tienen un estado de una línea que cambie.

**Orden recomendado:** 1.1 → 1.2 → 1.3. La ficha de institución es el nodo al
que todo enlaza; el buscador la hace alcanzable; el término explicado la hace
legible. El resto se apoya en esas tres.

**Entregado el 2026-09-23 (horizonte 1).** 1.1: `/instituciones` y
`/instituciones/[id]` sobre `lib/instituciones.ts`; las señales de 2.3 viven en
su bloque «Cómo compra». 1.2: `/buscar` (`lib/buscar.ts`) y la paleta ⌘K como
puerta, con sugerencias de institución por `/api/instituciones` (desde el
2026-09-26, sugerencias de cualquier tipo por `/api/buscar`; ver §6 bis). 1.4: todas las
fichas enlazan a la institución; ley ↔ proyecto ↔ Senado; una pieza enlaza a
las instituciones que nombra por su nombre completo. 1.7: caja de búsqueda y
fila de Instituciones, Normativa y Democracia en la portada; `app/sitemap.ts`.
En el teléfono no se añadió una pestaña «Buscar»: el botón de la paleta en la
cabecera ya es un toque, y quitarle una casilla a una vertical costaba más; la
hoja «Más» lleva las páginas transversales (instituciones, buscar, provincias,
seguimiento).

## 3. Horizonte 2 — mostrar lo que ya está en los datos

| # | Entrega | Datos ya en mano |
|---|---|---|
| 2.1 | ✅ **Fichas de legislador** `/congreso/legisladores/[id]`: qué propuso, cuánto prosperó, por provincia y partido — entregado 2026-09-23 con directorio `/congreso/legisladores`, voto nominal por diputado y `/congreso/votaciones/[id]` con el voto de los 190 | `legislador/*` y `votacion/*` verificados en `docs/RECON.md` §14 |
| 2.2 ✅ | **Finanzas legible**: buscar, ordenar y filtrar capítulos; «quién ganó o perdió presupuesto en el año» (`vigente − inicial`); «a quién se le debe» (`devengado − pagado`); ranking de ejecución | `public/data/fiscal.json` |
| 2.3 ✅ | **Señales por institución en compras**: tasa de oferente único, compras por excepción o emergencia, procesos fuera del PACC | `oferenteUnico`, `tipo_excepcion`, `adquisicion_planeada` en `lib/dgcp.ts` |
| 2.4 | ✅ **Territorio** `/provincias/[slug]`: proveedores del Estado y legisladores de la provincia; más tarde, obras (3.1) | Provincia en `ProveedorRegistro` y en los proponentes. Entregado: `lib/provincias.ts`; el registro no filtra por provincia (500), así que es la muestra declarada de los 200 mayores adjudicatarios de la ventana; ayuntamientos solo los ciertos (cabecera + municipios de Santo Domingo); legisladores por enlace a `/congreso/legisladores?provincia=` |
| 2.5 ✅ | **Nómina comparada**: el mismo cargo entre instituciones y los puestos mejor pagados del Estado | Filas de `public/data/nomina.json` |
| 2.6 | ✅ **Normativa buscable**: texto sobre los títulos; designaciones del mes por cargo | Instantánea de normativa. Entregado: `/normativa?q=` (número y título del tipo y año, en vivo o instantánea) y «Designaciones del mes» (etiqueta «Cámara de Cuentas», cargo leído del título, declarado) |
| 2.7 ✅ | **Descargar**: CSV en finanzas, contratos, normativa y congreso; en licitaciones, el barrido entero y no solo la página | Lo que cada página ya calcula. Hecho: licitaciones (`/api/procesos/csv`, el barrido de hasta 6000), contratos (`/contratos/csv`, la muestra) y normativa (`/normativa/csv`), finanzas (la tabla filtrada, en el navegador) y congreso (`/congreso/legisladores/csv`, el directorio; `/congreso/votaciones/[id]/csv`, el voto nominal) |
| 2.8 ✅ | **Deuda en el tiempo**: serie, no tres cifras sueltas | Entregado en `/deuda` con lo que el origen conserva: cierre anual desde 2000 con % del PIB y trimestral desde 2015 (los meses intermedios de años pasados ya no están publicados; ver `docs/AUDITORIA.md` §3.3) |

**Entregado (2026-09-23).** 1.6: `/nomina?inst=MSP&cargo=chofer&vista=comparar`
reproduce la vista (`q`, `inst`, `cargo`, `vista` en la URL); CESAC, JAC y
Defensa Civil llevan la marca ocre «foto de hace…». 2.2: búsqueda, sección y
cuatro órdenes en `/finanzas`, tres rankings y CSV de la tabla filtrada (la
parte de finanzas de 2.7); cada capítulo lista sus unidades de compra. 2.5:
pestaña «Comparar» con la mediana por institución de un cargo normalizado y
los 15 puestos mejor pagados, declarando las 11 instituciones. 2.8: `/deuda`.

## 4. Horizonte 3 — fuentes nuevas ya verificadas

Del plan de fases de `docs/AUDITORIA.md` §D, ordenadas por valor ciudadano
entre esfuerzo. Todas respetan la invariante (sin llave, instantánea en build).

1. **MapaInversiones** (§A.4, fase 8): obra ↔ SNIP ↔ proceso ↔ proveedor ↔
   territorio, con avance físico y financiero. `Proceso` ya trae `codigo_snip`.
   Responde «¿existe la obra y avanza?» y alimenta 2.4.
   ✅ 2026-09-23: `/obras` (filtros por estado, provincia, institución y texto)
   y `/obras/[snip]`, `lib/obras.ts` sobre `scripts/build-obras.py`; enlazada
   desde la ficha de proceso (`ObraDelProceso`) y la de institución
   (`ObrasDeInstitucion`). El avance físico y el financiero son el mismo número
   en la fuente: se muestra uno, declarado. Cada `/provincias/[slug]` lista sus
   obras (con el alias «Baoruco» → Bahoruco), y `/buscar` las encuentra.
2. **Padrón RNC de la DGII** (§A.2, fase 9): actividad, estado y fecha de
   inicio del proveedor; hace comprobable «empresa creada semanas antes de
   ganar». Instantánea acotada a los RNC que aparecen en compras.
   ✅ 2026-09-23: `lib/rnc.ts` + `scripts/build-rnc.py`; la lista de RNC sale
   de la tabla completa del RPE, que la DGCP sí sirve como archivo (AUDITORIA
   §A.12, añadido). `FichaRnc` en `/proveedores/[rpe]` dice actividad, estado,
   régimen e «inició operaciones N días antes de su primer contrato».
3. **Nómina por datos.gob.do** (§A.8, fase 10): de 11 a decenas de
   instituciones; trabajo de manifiesto en `scripts/build-nomina.py`.
   ✅ 2026-09-23: 22 instituciones y 28,720 plazas (antes 11 y 13,668; corregido tras la segunda revisión: ver AUDITORIA §A.8); los
   códigos nuevos están atados a su ficha en `scripts/build-instituciones.py`
   salvo el Poder Judicial, que no tiene unidad de compra. Descartes y
   bloqueos en AUDITORIA §A.8.
4. **SISMAP y SISMAP Municipal** (§A.7, fase 10): calidad de gestión por
   institución y por ayuntamiento; tablas HTML, lo más barato.
   ✅ 2026-09-23: `/gestion` (instituciones, ayuntamientos y juntas de distrito,
   con búsqueda) y `SismapDeInstitucion` en la ficha; `lib/sismap.ts` sobre
   `scripts/build-sismap.py`. El SISMAP no publica fecha de corte: se declara
   el día de la consulta.
5. **Combustibles del MICM** (§A.5, fase 7) y **tasa del BCRD por CDN**
   (§A.6, fase 11): indicadores del bolsillo en la portada.
   ✅ 2026-09-23, en la portada debajo de la deuda: `lib/combustibles.ts` y
   `lib/tasa.ts`, en vivo con caché de 1 h;
   `<SeccionBolsillo />` de `components/fuentes-nuevas/indicadores-bolsillo.tsx`
   trae los dos con su `Suspense`. La tasa sale del `.xlsx` del CDN: el `.xls`
   que citaba la auditoría está congelado desde 2022.

## 4 bis. Horizonte 3b — la tercera pasada (2026-09-24)

Barrido del Estado entero en seis frentes (`docs/AUDITORIA.md` §G). Entregado:

- ✅ **Historia de las compras desde 2015** (`/historico`, §G.1): 722,825
  contratos y 631,103 procesos agregados por año, institución y proveedor; cada
  ficha de institución y de proveedor lleva su bloque «desde 2015».
- ✅ **Biblioteca del Estado** (`/documentos`, §G.2): 18,726 documentos de 22
  instituciones, buscables por título; «Lo que publica» en la ficha.
- ✅ **Catálogo de datos abiertos** (`/datos`, §G.3): todo datos.gob.do.
- ✅ **Sentencias del Tribunal Constitucional** (`/constitucional`, §G.6).
- ✅ **Panorama ampliado**: remesas, reservas y tasa activa (BCRD), comercio
  exterior (Aduanas), la luz de ayer (OC), alertas del tiempo (INDOMET) y
  muertes en las vías (OPSEVI).
- ✅ **Nómina ampliada** de 22 a 86 instituciones (94,659 plazas) por la vía de
  §A.8; y la nómina general del MAP (492,488 plazas, 125 instituciones) en
  `/nomina/general`, agregada en el servidor (§G.10).

Siguiente, por valor ÷ esfuerzo: §G.9.

## 5. Horizonte 4 — lo que solo desbloquea el dueño

Gestiones institucionales, ya listadas en `docs/DECISIONES.md` y
`docs/AUDITORIA.md` §F: el permiso de Cloudflare de la Consultoría (§4.1), ONE,
Cámara de Cuentas (declaraciones juradas: el eslabón persona ↔ patrimonio),
JCE, 911 y el cliente de Cuenta Única. Ninguna sesión las gestiona; cada una
deja preparados los pasos.

## 6. Decisiones que este plan abre (van a `docs/DECISIONES.md` al tocarlas)

- **Notificaciones push** del seguimiento: exigen guardar suscripciones en un
  servidor, lo que rompe la invariante fuera de `/democracia`. Hasta que el
  dueño decida, el aviso es RSS y «qué cambió» al volver.
- **Instantáneas al día sin sesión humana**: una rutina programada que
  regenere normativa (semanal), deuda y fiscal (mensual) y entregue por el
  gate. Consume sesiones en la nube; lo aprueba el dueño.

## 6 bis. Bibliotecas abiertas en vez de código propio (auditoría 2026-09-26)

Criterio: si una biblioteca madura, sin clave ni servicio, hace lo que un
archivo de `lib/` hace a mano, se usa la biblioteca (shadcn es el
precedente). Ninguna de estas rompe la invariante.

- ✅ **Buscador de toda la plataforma** — `/buscar` y la paleta pasan de
  «todas las palabras como subcadena, por vertical» a un índice con ranking:
  BM25 (raíces del español, erratas; Orama hasta el 2026-09-27, hoy un
  índice propio) + Model2Vec (tema) fundidos por
  RRF; filtros por tipo con su cuenta, vista «Todo» por grupos, palabras en
  negrita, «Por tema» declarado (`docs/ARQUITECTURA.md` §Búsqueda).

Pendiente, por valor ÷ esfuerzo (archivo:línea verificados el 2026-09-26):

1. ✅ **ZIP/XLSX** → `lib/xlsx.ts`: `fflate` lee el ZIP por su directorio
   central (el tamaño cero de un Excel escrito en streaming y ZIP64 ya no
   callan la fuente) y `fast-xml-parser` el XML, con texto enriquecido,
   cadenas en línea y entidades. Deuda, tasa, macro y Aduanas comparten el
   lector. Verificado: 0 celdas distintas del lector anterior en 8 archivos
   reales (BCRD ×4, Crédito Público, Aduanas ×3; 131,000 celdas). La tasa
   (9,000 filas, ~0,5 s de lectura) guarda su resultado una hora con
   `unstable_cache`. No se usó `read-excel-file`: descarta filas vacías y
   las capas razonan por número de fila.
2. ✅ **Entidades HTML** → `entities` vía `lib/html.ts`
   (`desentidades`, `desentidadesXml`): las nueve copias fuera.
3. ✅ **HTML por árbol** → `cheerio` (parse5, el analizador WHATWG) vía
   `lib/html.ts`, en TC, TSE y los tres lectores del Senado (listado, ficha,
   documentos) y el formulario de su búsqueda. Se probó `node-html-parser`
   y perdía la ficha del Senado entera: el FileMaster anida tablas dentro de
   `<span>` y `<p>`. Verificado sobre páginas crudas: TC 2026 y 2019 (1,622
   sentencias), TSE ×3 (146), Senado 2 listados, 6 fichas y 6 páginas de
   documentos: salida idéntica, salvo un arreglo —«Reintroducida» y
   «Perimida» son campos «Sí/No con fecha» y se leía la fecha: salían
   siempre nulos; ahora se lee el Sí/No—.
4. ✅ **Contrato de lectura** → `lib/pedir.ts` propio y no `ky`: el contrato
   lleva la validación de `content-type`, la firma «PK» de un XLSX, el motivo
   del WAF (`cf-mitigated`) en el registro y la caché de datos de Next, que
   `ky` no conoce. Una política: se reintenta una vez la red, el plazo, un
   no-2xx o un cuerpo ilegible; no se reintenta un tipo equivocado, una
   firma que no casa ni un JSON con otra forma. Lo usan DGCP, SIL, OPSEVI,
   OC, SIMBAD, Aduanas, MICM, INDOMET, Edenorte/Edesur, TC, TSE, Crédito
   Público, BCRD (tasa y macro) y la Consultoría (un solo intento, como
   antes: el rechazo típico es el desafío de Cloudflare). Fuera, a
   propósito: la sesión del Senado (redirección manual, cookie, ViewState) y
   las HEAD de peso de documento.
5. ✅ **JSON validado** → `zod` en la envoltura de la DGCP, las páginas del
   SIL (`?page=`), OPSEVI, OC, SIMBAD, el índice de Aduanas, la Consultoría y
   las vistas públicas de `/democracia`; `zod/mini` en `lib/seguimiento.ts`
   (viaja al navegador). Los esquemas validan lo que la capa lee y toleran
   nulos donde la capa ya los saltaba. Al validar `/democracia` contra la
   vista viva salió que `verificados` no existía: la migración de Cuenta
   Única se aplicó el 2026-09-26 (PLAN-DEMOCRACIA §9.5) y el esquema lo sigue
   dando por cero si falta.
6. ✅ **URL ↔ estado, tres mecánicas** (`app/buscador.tsx`,
   `components/nomina/explorer.tsx`, `components/campo-licitaciones.tsx`,
   `components/buscador-url.tsx`). → `nuqs`. Hecho 2026-09-26: un mapa de
   parámetros compartido (`components/licitaciones-url.ts`), mismos nombres y
   valores en la URL; `desde=` vacío pasa a escribirse («todo el histórico»
   no sobrevivía a recargar) y un enlace con `page=` ya no se reinicia al
   abrir.
7. ✅ **Virtualización con alto fijo** (`components/nomina/data-table.tsx`).
   → `@tanstack/react-virtual` con filas medidas; reordenar vuelve arriba.
8. ✅ **Arrastre de la hoja** (antes `components/ui/sheet.tsx`). → `vaul`:
   `components/ui/drawer.tsx`, que usan la hoja de filtros y la de «Más»;
   `ui/sheet` ya no se usa y salió del repositorio.
9. ✅ **Meses** → `MESES`, `MESES_CORTOS` y `numeroMes` en `lib/format.ts`,
   de `Intl.DateTimeFormat` (sin dependencia). `numeroMes` exige que la
   palabra sea el mes o una abreviatura suya: «Mayor» o «Total» ya no son
   mayo ni nada.
10. ✅ **Lecturas del navegador** (cinco `fetch` en efectos, cada uno con su
   `AbortController`, su bandera de cancelación o su comprobación de «¿es la
   respuesta de lo tecleado?»). → `@tanstack/react-query`, hecho 2026-09-28:
   `components/consultas.tsx` y `lib/consultas.ts`; detalle en
   `docs/ARQUITECTURA.md` §Bibliotecas de cliente. Supabase y el canje de
   Cuenta Única quedan fuera, con su porqué allí.
11. ❌ **Tablas** → `@tanstack/react-table`, descartado tras medirlo: ~1.1 s
   para montar las filas de la nómina contra ~20 ms del orden propio (misma
   sección).

Verificación del lote 1–5 y 9: una ruta de sonda llamó a los 24 lectores en
vivo antes y después (caché vaciada): 22 salidas idénticas byte a byte; TC y
TSE, idénticas salvo la hora de consulta. El XLSX vivo de Crédito Público
(403 de Cloudflare al servidor en las dos corridas) se leyó fuera de línea y
dio el saldo de la instantánea al centavo.

Del buscador, lo siguiente (resuelto el 2026-09-26):
- ✅ **Índice de Orama guardado** (`public/data/busqueda/indice.json.br`,
  `scripts/build-indice-busqueda.mjs`): 2.8 MB en el repositorio por
  regeneración, no 25. El peso se fue quitando lo que no se usa —el índice
  de orden (9.8 MB) y la copia de los documentos (8.9 MB)— y comprimiendo con
  brotli (26.9 → 2.8 MB); el script comprueba que 14 consultas den los mismos
  ids y puntuaciones que el índice recién construido. Primera consulta de
  una instancia con `next start`: ~1.2–1.5 s, contra ~4.5 s construyéndolo
  (ya con los proveedores: 68 mil entradas). Si el archivo falta o es de
  otro corpus (etiqueta fecha | huella | entradas), el servidor lo construye.
  El plugin `@orama/plugin-data-persistence` 3.1.18 se midió y **no** se usa:
  `restore` crea la base con esquema de relleno y tokenizador por defecto
  (perdería el lematizador español), `dpack` y `seqproto` fallan a este
  tamaño, y `binary` es msgpack en hexadecimal (50.7 MB) que tarda ~2 s en
  decodificar contra ~0.65 s de `JSON.parse`. Se usa lo que el plugin
  envuelve: `save`/`load` de Orama. Detalle en `docs/ARQUITECTURA.md`
  §Búsqueda.
- ✅ **Proveedores en el índice**: los 32,152 con al menos un contrato desde
  2015 (`public/data/historico/proveedores/`), por nombre, RNC o RPE, con
  contratos y años en el detalle y enlace a `/proveedores/[rpe]`. No el RPE
  entero (~138 mil inscritos, casi todos sin contrato). Sin vector: un
  nombre de empresa no aporta tema, y ahorra ~4 MB. El corpus pasa de 7.5 a
  10.9 MB.

Del buscador, la revisión del 2026-09-27 (`docs/ARQUITECTURA.md` §Búsqueda):
- ✅ **Índice propio en vez de Orama**: un índice invertido binario
  (`indice.bin`) que se lee con vistas sobre el búfer. Con el mismo corpus
  de 68 mil entradas, la primera consulta pasó de ~1.3 s a ~0.34 s; con el
  corpus ampliado (≈188 mil), ~0.85 s. Mismo BM25+ (k1 1.2, b 0.75, d 0.5),
  pero cada término cuenta por su **mejor campo**, no la suma: repetir la
  palabra en título, archivo y origen no hace más pertinente. El índice de
  Orama guardado (`indice.json.br`) y la dependencia `@orama/orama` se van;
  quedan `@orama/stemmers` y `@orama/stopwords`.
- ✅ **Cobertura**: todas las leyes desde 1844 (12,130; `leyes.json`),
  los procesos de compra de los últimos 12 meses (77,790; `procesos.json`),
  sentencias del TC y del TSE (12,106; `sentencias.json`) y el Congreso
  (`congreso.json`: 221 legisladores y 17,857 iniciativas de 2020–2028).
- ✅ **Preguntas y sueldos**: las palabras con que se pregunta («¿cuánto
  **gana**…?», «el **país**») y las de un sueldo o una compra ordenan pero no
  se exigen, y prefieren cargos o procesos; los cargos traen mediana y
  tramo del 80 % central de su sueldo; los anexos de un mismo aviso (mismo
  sitio, título y fecha) son una fila con «N archivos».
- ❌ **Tema con contexto** — evaluado el 2026-09-26 y **no** adoptado.
  `Xenova/multilingual-e5-small` cuantizado (q8, ONNX) por
  `@huggingface/transformers` 4.3.0 + `onnxruntime-node` 1.30.0, contra el
  Model2Vec podado, sobre las 35,754 entradas con vector y 17 consultas de
  uso («quién audita las cuentas del Estado», «corrupción», «escuelas en
  construcción», «agua para el campo», «seguridad ciudadana», «hospitales
  del gobierno», «cuánto se debe del préstamo», «ayuda a los pobres»,
  «precio de la gasolina», «carreteras dañadas», «violencia contra la
  mujer», «apagones y electricidad», «vivienda barata», «medicamentos
  gratis», «empleo para jóvenes», «basura en las calles», «turismo»),
  leyendo los 8 primeros de cada uno. **Calidad**: mejor en 7 (trae la
  Cámara de Cuentas para «quién audita…», el decreto del Sistema Nacional de
  Seguridad Ciudadana, las carreteras «afectadas por» lluvias y huracanes,
  hospitales para «hospitales del gobierno»), peor en 5 (sus piezas de
  palabra meten ruido: «ayuda a los pobres» → «AYUDANTE DE ALMACEN»,
  «vivienda barata» → «BARREDORA RESIDENCIAL», «basura en las calles» →
  «BARREDOR CALLE COLON»; el conjunto «Precios de combustibles» se cae del
  primer puesto) e igual en 5. Sus cosenos se apiñan entre 0.84 y 0.89, así
  que no hay umbral que separe tema de ruido como el 0.55 del estático.
  **Coste**: cargar el modelo 1.5–2.2 s más en frío; 4–68 ms por consulta
  (mediana ~13) contra microsegundos; 197 s para embeber el corpus en build.
  **Tamaño**: modelo 118 MB + tokenizador 17 MB + `libonnxruntime` linux-x64
  45 MB + `sharp`/libvips 19 MB (transformers lo importa en node) + 7 MB de
  JS + vectores de 384 dimensiones (~14 MB) ≈ 220 MB más, sobre los ~31 MB
  del índice: en el borde de los 250 MB de una función de Vercel, y el
  trazado de `onnxruntime-node` arrastra los binarios de todas las
  plataformas (290 MB) si no se excluyen a mano. No es claramente mejor y no
  cabe con holgura. Se reevalúa si aparece un modelo de frases estático o
  destilado a Model2Vec que entienda frases, o si el uso muestra que el
  estático se queda corto.

## 6 ter. Horizonte 5 — el grafo (pedido del dueño, 2026-09-26)

La plataforma pasa de un conjunto de verticales a **un grafo**: todo lo que se
ve es un nodo que se puede pulsar e investigar, cada ficha dice con qué está
conectada, los números se dibujan con un solo sistema de visualización, y
cada pantalla es encontrable por lo que significa. Cuatro frentes, en orden:

**G1. Modelo de entidades y enlace universal.** ✅ (2026-09-26) `lib/grafo.ts`: los tipos de
nodo (institución, proveedor, proceso, contrato, norma, iniciativa,
legislador, votación, expediente del Senado, obra, provincia, capítulo,
cargo, documento, sentencia TC/TSE), su clave, su `href` canónico y cómo se
reconoce en un texto (RNC, «Ley 47-20», código de proceso, SNIP, nombre
completo de institución). Una primitiva `<Entidad>` pinta cualquier mención
como enlace; `enlazarTexto()` convierte las menciones de un párrafo (títulos
de normas y proyectos, descripciones de procesos). Hecho cuando: ninguna
ficha pinta un nombre, número o código de otra entidad sin enlace (un
chequeo del gate lo vigila), y todo `href` de entidad sale de `lib/grafo.ts`.
Hoy (medido): las normas y los proyectos no enlazan instituciones ni
legisladores por su texto; las fichas de proceso, proveedor, institución y
obra sí se enlazan entre ellas.

  Hecho: `enlace.*` es la única dirección de cada tipo (unos setenta `href`
  a mano migrados) y el gate («graph») rechaza el que se arme fuera; la
  primitiva es `components/texto-enlazado.tsx` (`TextoEnlazado`, en vez de
  `<Entidad>` + `enlazarTexto()`: un solo componente que reconoce y pinta),
  aplicada a los títulos de normas, iniciativas, expedientes del Senado,
  sentencias del TC y del TSE y a la descripción de un proceso. Reconoce
  citas de normas (también varias en una frase), códigos de proceso, SNIP y
  nombres completos de institución. La segunda mitad del criterio la vigila
  `scripts/menciones-sin-enlace.mjs`, contra un servidor en marcha: recorre
  una ficha de cada tipo y falla si una cita de norma, un código de proceso
  o un SNIP aparece fuera de un enlace y su destino no está enlazado en la
  página (no es parte de `verificar.sh` porque necesita el servidor). El
  pie y la cabecera quedan fuera: son de la plataforma, y las dos leyes que
  cita el pie (172-13 y 200-04) no están en lo que la Consultoría nos
  entrega, así que enlazarlas llevaría a «no tenemos el texto».
  Los contratos y los documentos no tienen ficha propia: enlazan a su
  proceso y a su archivo.

**G2. Vecindario en cada ficha.** Un bloque «Conectado con» por ficha, con
las aristas que las fuentes ya dan: institución ↔ proveedores ↔ procesos ↔
obras ↔ normas que la nombran ↔ nómina ↔ capítulo; norma ↔ proyecto ↔
legisladores proponentes ↔ votaciones; provincia ↔ obras ↔ instituciones.
Solo aristas verificadas (un cruce adivinado es peor que ninguno, como en
`institucionesNombradasEn`), cada una con su fuente y su cuenta.

  ✅ (2026-09-26) `components/conectado-con.tsx` en las fichas de
  institución, proveedor, proceso, norma, iniciativa, expediente del Senado,
  legislador, obra, provincia y capítulo; la cuenta de cada arista es la de
  la lista que abre. La votación no lo lleva: su primer bloque son las
  piezas votadas. No se añadió ninguna lectura nueva a una fuente viva: las
  aristas salen de lo que la ficha ya leía y de las instantáneas.

**G3. Sistema de visualización.** ✅ (2026-09-26) `components/graficos/`: barras
horizontales, serie en el tiempo, tira de cifras, barra apilada al 100 %,
matriz por mes; paletas como tokens en `app/globals.css` —secuencial en la
firma, divergente firma ↔ sello con neutro en el papel, estados de
`lib/estados.ts`, categórica fija—, **validadas** con el validador de la
habilidad `dataviz` contra el papel (`canvas`); sin modo oscuro (la
identidad es papel). Reglas de la habilidad: un solo eje, color por entidad y
no por rango, capa de lectura al pasar o tocar, tabla equivalente, leyenda o
etiqueta directa, nunca color solo. Cada marca es pulsable y lleva a su nodo
(G1). Hecho cuando: los ~20 gráficos a mano (`components/barras.tsx`,
`components/nomina/charts.tsx`, `components/fuentes-nuevas/*`) usan las
primitivas y `docs/IDENTIDAD.md` tiene su sección.

  Hecho: `BarrasHorizontales`/`FilaBarra`/`MarcaBarra`, `SerieTemporal`
  (columnas para un flujo, línea para un saldo o una tasa; su única parte de
  cliente es `LecturaSerie`), `BarraApilada`, `MatrizMensual`, `Multiples`,
  `Leyenda`, `VerComoTabla`; la tira de cifras sigue siendo `TiraDeCifras`
  (`components/papel.tsx`). Paletas `--color-grafico-*` con la salida del
  validador en `docs/IDENTIDAD.md` §Gráficos (categórica de cinco, las tres
  primeras válidas todos-contra-todos; tres pasos nuevos porque los tintes de
  vertical no llegaban a la banda ni al croma). Migrados: las diez series de
  `components/barras.tsx` (borrado), la nómina entera (`charts.tsx` borrado; su
  serie de doble eje no la usaba nadie), dieciocho `Progress` que hacían de
  ranking en once páginas, las seis listas con barra de `/pais`, la barra de estados de `/estadisticas` y el recuento de
  cada votación (divergente). Nuevo: la matriz de llegadas por avión en `/`.
  Cada primitiva acepta `href` por dato; hoy lo llevan los rankings que ya
  enlazaban. Pendiente para G1: dar `href` a las columnas de las series (años
  → `/historico?anio=`, meses → la lista filtrada) cuando existan esas vistas.
  Se quedan como `Progress`, porque son medidores contra el 100 % o un límite
  y no rankings: ejecución presupuestaria, avance de obra, SISMAP, tasa de
  resolución judicial, perención, aprobadas de un legislador, el resultado de
  `/democracia`.

**G4. Índice semántico de pantallas y categorización ergonómica.** Cada
destino de `lib/indice.ts` y cada tipo de ficha entra al corpus de
`lib/busqueda.ts` con una descripción en llano y preguntas que responde
(«¿cuánto debe el país?» → `/deuda`), para que `/buscar` y la paleta lleven
a la pantalla por su significado. Se revisa la taxonomía tema × tarea con
las consultas reales como prueba (qué se busca y dónde termina) y se
reordena el menú donde no casan. Hecho cuando: una batería de 60 preguntas
en llano llega a la pantalla correcta entre los tres primeros resultados.

  ✅ (2026-09-26) `lib/pantallas.ts` + `buscarPantallas` (vectores calculados
  al cargar con el mismo modelo, sin archivo nuevo); la batería
  (`scripts/bateria-pantallas.json`, `scripts/probar-pantallas.mjs`) da
  60/60. Las fichas no entran como pantalla: se llega a ellas por su nombre,
  y el índice ya las tiene una por una. La taxonomía: la columna «Quién es
  quién» (ocho enlaces) se partió en «Quién es quién» y «El país y sus
  datos». Una pregunta de la batería (el sueldo de un policía) no tiene
  respuesta: la Policía Nacional no está en ninguna de las dos nóminas.

Orden: G1 → G4 (índice de pantallas, barato y visible) → G2 → G3. Nada de
esto guarda datos: el grafo se deriva en cada lectura de las mismas fuentes e
instantáneas (`docs/DECISIONES.md`, «El buscador no va a una base de datos»).

## 6 quater. Horizonte 6 — el Estado entero y sus personas (pedido del dueño, 2026-09-29)

El dueño: «todas las entidades públicas», los bancos como entidades, el registro
mercantil, las personas expuestas políticamente «como el Presidente», y todo lo
que un abogado necesita para empezar a investigar. Reconocimiento en
`docs/AUDITORIA.md` §H; decisiones en `docs/DECISIONES.md` (29-09-2026).

| # | Entrega | Hecho cuando |
|---|---|---|
| H6.1 ✅ | **Funcionarios** `/funcionarios`, `/funcionarios/[slug]` (`lib/funcionarios.ts`): quién encabeza cada poder, el gabinete, y cada persona con sus cargos, la fuente de cada uno y la marca PEP con su numeral de la Ley 311-14 | El Presidente tiene ficha con su cargo y los decretos que firmó; un legislador enlaza a sus otros cargos; un decreto dice a quién nombra |
| H6.2 ✅ | **Bancos y financieras** `/banca`, `/banca/[slug]`: las 47 entidades de intermediación de la SB, las AFP, las aseguradoras y las cooperativas de ahorro, con RNC, activos, número de accionistas y consejo. Pendiente: cambiarias, fiduciarias, burós y oficinas de representación, tras el desafío de Sucuri de la SB (AUDITORIA §H.6) | Cada banco tiene ficha con su fuente y su corte; el RNC lleva al padrón y a sus compras |
| H6.3 ✅ | **El universo del sector público**: el Clasificador Institucional de DIGEPRES completa `/instituciones` (los 393 gobiernos locales y las empresas públicas sin unidad de compra) y da a cada institución su sector | Toda entidad con presupuesto propio tiene ficha; las que no compran por sí mismas lo dicen |
| H6.4 ✅ | **Empresas** `/empresas`, `/empresas/[rnc]`: el padrón de personas jurídicas de la DGII, buscable por nombre y RNC, como sustituto declarado del registro mercantil | El RNC de cualquier persona jurídica del padrón abre su ficha (las personas físicas con RNC de nueve cifras, no: §H.7); la ficha dice por qué no hay socios ni gerentes |
| H6.5 ✅ | **Medidas sobre proveedores** `/proveedores/inhabilitados` y la marca en la ficha: las 2,317 medidas de la DGCP (personas jurídicas) y las entidades dominicanas de la lista SDN de la OFAC | La ficha de un proveedor suspendido lo dice con la resolución y el motivo textual |
| H6.6 ✅ | **Quién la dirige**: cada ficha de institución dice su titular (el MAP hoy o el último decreto) y lleva a sus funcionarios | Las 21 carteras del gabinete muestran a su ministro |
| H6.7 ✅ | **Quién gobierna la provincia**: la ficha de provincia dice su gobernación (el MAP hoy o un decreto del Presidente en funciones), sus alcaldías y direcciones de distrito municipal de 2024 y cuántas regidurías suma | Cada provincia con gobernación en el MAP la muestra; las 158 alcaldías caen en su provincia |
| H6.8 ✅ | **PEP por tipo**: `/funcionarios?pep=1&tipo=…` filtra por nueve familias de los numerales del art. 2 de la Ley 311-14 | Cada numeral está en una sola familia; con una elegida, la fila muestra el cargo de ese tipo |

Siguiente, por valor ÷ esfuerzo: personas y entidades en `/buscar` (hecho con
H6.1–H6.2), guardar y seguir personas, bancos y empresas (migración del `check`
de `espacios.guardados`, decisión del dueño), las últimas sentencias de la SCJ y
las resoluciones de ProCompetencia en vivo, y el OCR propio de los decretos
anteriores a 2012.

## 6 quinquies. Horizonte 7 — el territorio (pedido del dueño, 2026-09-30)

El dueño: «un mapa de verdad», y más allá, una interfaz donde **todo nodo del
grafo tenga un lugar** —el decreto en el Palacio Nacional, la compra en la
dirección del proveedor, la obra en su municipio— o, en su defecto, una
provincia. El mapa es otra cara del mismo grafo (§6 ter), no una vertical.

**La regla de precisión.** Cada nodo declara su lugar **y con qué precisión lo
sabe**: `punto` (coordenada publicada por la fuente) > `municipio` >
`provincia` > `nacional` > `sin lugar`. Nunca se pinta más fino de lo que la
fuente dice: un proveedor con solo provincia en el registro no se convierte en
un punto en la capital de esa provincia. Un nodo sin lugar lo dice.

| # | Entrega | Hecho cuando |
|---|---|---|
| T1 ✅ | **El mapa de provincias** (`lib/mapa.ts`, `MapaProvincias`, AUDITORIA §G.16): coropleta de obras en `/obras`, índice en `/provincias`, ubicación en cada ficha de provincia | Cada provincia del mapa lleva a su filtro o a su ficha; la elegida se ve sobre cualquier tramo |
| T2 | **Municipios**: `admin3` de la ONE en la misma instantánea (≈158 polígonos); obras por municipio si `IdMunicipio` de MapaInversiones casa con `adm3_pcode` (verificar primero) | `/obras` baja de provincia a municipio sin inventar |
| T3 | **`lugar` en el grafo**: `lib/grafo.ts` gana `lugarDe(nodo)` con su precisión y su fuente. Ya hay lugar, sin fuente nueva: obra (municipio), legislador (provincia), gobernación y alcaldía (provincia/municipio), corte de luz de Edesur (provincia), proveedor del registro (provincia y municipio de su ficha), institución central (sede). Decretos → Presidencia → su sede | La ficha de cada tipo con lugar lo dice en «Conectado con» y en un mapa de ubicación |
| T4 | **Puntos**: sedes de instituciones y domicilios de **personas jurídicas** (nunca de personas físicas: AUDITORIA §E, «publicar no es exponer»). La dirección sale del registro; la coordenada exige geocodificar | Decisión del dueño, abajo |
| T5 | **`/mapa`**: el explorador — capas (obras, proveedores, cortes, legisladores), filtro por fecha y por monto, clic → ficha | Cualquier capa llega a su ficha en un clic, y el mapa dice qué no puede ubicar |

**Qué decide el dueño antes de T4** (no se hace sin él, va a `docs/DECISIONES.md`):
1. *Geocodificar.* Nominatim (OpenStreetMap) en build, a 1 petición por
   segundo y con atribución ODbL, no pide clave; Google o Mapbox, sí (y
   cuestan). Una dirección dominicana geocodifica mal («Av. 27 de Febrero
   esq. …»): hay que declarar la tasa de acierto.
2. *Mapa base.* Para puntos hace falta calles. Sin romper la invariante: un
   archivo PMTiles de la República Dominicana (Protomaps, datos de OSM,
   decenas de MB) servido desde el propio dominio y pintado con MapLibre —sin
   clave ni tercero en el navegador—. Con clave (Mapbox, MapTiler) no.

**Por qué no una base de datos de grafos (Neo4j y similares).** El grafo de
la plataforma se **deriva** en cada lectura de las fuentes y las instantáneas
(`docs/DECISIONES.md`, «El buscador no va a una base de datos»); una base de
grafos lo convertiría en una copia que hay que sincronizar, con un servidor,
una credencial y una factura —justo lo que la invariante prohíbe en las
superficies de inteligencia—. Y el tamaño no lo pide: decenas de miles de
nodos y unos cientos de miles de aristas caben en índices JSON hechos en build
(como `public/data/busqueda/`) y se recorren en milisegundos. Lo que un motor
de grafos añadiría —caminos de varios saltos («¿qué proveedor de esta obra
comparte RNC con un funcionario?»)— se resuelve con un índice de adyacencia
precalculado por `scripts/`. Se reabre solo si una consulta real necesita
recorridos arbitrarios en vivo sobre millones de aristas.

## 6 sexies. Horizonte 8 — la capa ontológica, para asistentes de IA (pedido del dueño, 2026-09-30)

El dueño: Socrático como **la capa ontológica de la República Dominicana**,
conectada por MCP a Claude, ChatGPT y a quien investigue. La primera entrega
está hecha: `/mcp` y `/conectar` (ARQUITECTURA, el servidor MCP;
DECISIONES, sus reglas). Lo que sigue, en orden de lo que más le falta a una
investigación:

| # | Entrega | Hecho cuando |
|---|---|---|
| M1 ⚠️ | **El servidor**: `search`, `fetch`, `neighbors`, `path`, `signed_decrees`, `ontology`, sobre el índice y el grafo; forma de ChatGPT en `search`/`fetch`; revisiones 2025 y 2026-07-28. Hecho y probado con los clientes oficiales del SDK (1.x y 2.x) contra el despliegue; conectado desde Claude el 30-09-2026 (la sesión que hizo M2 y M5 lo usó como conector); falta anotar la primera conexión desde ChatGPT | Claude y ChatGPT lo conectan con la dirección y cada respuesta trae fuente y corte |
| M2 ⚠️ | **Compras de un proveedor o de una institución**: `procurement` (todos los procesos de los últimos doce meses, filtrados y ordenados por monto o fecha, con total y suma) y `contracting_history` (lo contratado desde 2015 por proveedor, institución, el par y el país, de `lib/historico.ts`), hechas el 30-09-2026 sobre instantáneas, sin `lib/dgcp.ts` en vivo (DECISIONES, el servidor MCP). Falta lo que ninguna instantánea trae: **quién ganó cada proceso** y el par institución–proveedor fuera de las listas de mayores; la tabla de contratos no trae el código del proceso (AUDITORIA §G.1), así que pide un script que guarde las adjudicaciones por proceso desde la API. La pregunta del criterio, además, es la que la instantánea histórica no puede contestar por construcción: los contratos del MOPC comparten prefijo con la OPRET y no se le asignan; hoy la herramienta lo dice en vez de dar cero | «¿Qué le ha comprado el MOPC a esta empresa?» se contesta con contratos, montos y fechas, y dice cuántos leyó |
| M3 | **El texto**: el de una norma y el de un decreto (la Consultoría ya se lee; el PDF, por `lib/documentos.ts`), por páginas | El asistente cita el artículo, no solo el título |
| M4 | **Cifras del panorama**: las de `/indicadores` y la deuda, cada una con su ancla (`lib/cifras.ts`) | Ninguna cifra sale sin su fecha y su fuente |
| M5 ✅ | **Pruebas en el gate**: `scripts/eval-mcp.mjs`, 46 preguntas con su oráculo calculado de `public/data`, contra `next start` en `verificar.sh --completo` (ARQUITECTURA, el servidor MCP). La producción de antes de M2 pasaba 5 de las 24 primeras; las seis que siguen fijan lo que halló la revisión (homónimos, un RNC de dos RPE, la OPRET, las páginas, el año parcial), y dieciséis más el grafo con dinero, SPARQL y `retrieve` (M6 a M8) con lo que halló su revisión (el hilo que corta una consulta mal acotada, el enlace de siglas, nombres y homónimos) | Un cambio que rompa la forma de una herramienta no llega a `main` |
| M6 ✅ | **El dinero en el grafo** (pedido del dueño, 30-09-2026: «un grafo de conocimiento y ontológico real»): `soc:Contratacion` en la ontología 1.1.0, las contrataciones de `lib/historico.ts` en la descripción de cada institución y empresa, atadas a la empresa por su RNC (`scripts/build-historico-rnc.py`), y el grupo «compras» en el explorador, `neighbors` y `path` (ARQUITECTURA, el grafo semántico) | Una empresa llega en dos saltos a quien dirige la institución que le contrató, y el monto de cada arista cuadra con `/historico` (la evaluación lo comprueba) |
| M7 ✅ | **La recuperación para un asistente** (RAG sobre el grafo): `retrieve`, que junta buscador híbrido, entidades del grafo con sus relaciones y compras, y la consulta de compras, de contratación o el camino que la pregunta pide, con fuente y fecha en cada pieza | «¿Cuál es la compra más grande de 2026?», «¿cuánto le ha contratado el Estado a Viamar?» y «¿quién dirige el MINERD?» se contestan con una llamada |
| M8 ⚠️ | **SPARQL**: a pedido, sobre la descripción de los nodos que se nombran y sus vecinos (`sparql`, N3.js y Comunica). El grafo entero no: medido, un millón de triples no carga en el arranque en frío de una función, y un almacén servido aparte es una base de datos (DECISIONES, «Un SPARQL del grafo entero») | Una consulta de conteo o de suma sobre una institución y sus vecinos cuadra con sus fichas |
| M9 | **El texto de las normas en la recuperación**: M3 hecho índice. Trocear por artículo el texto de leyes y decretos (Consultoría Jurídica), vectorizarlo con el mismo Model2Vec en `scripts/` y que `retrieve` cite el artículo | «¿Qué dice la Ley 47-25 sobre las compras de emergencia?» trae el artículo con su número y su enlace |

El límite no se mueve: solo lectura, sin estado ni clave, y lo que la
plataforma no publica tampoco lo da el servidor.

## 7. Guardarraíles para quien ejecute

- Nada de esto introduce DB ni variables de entorno: los cruces son archivos
  versionados, el seguimiento vive en el navegador.
- Cada ficha nueva usa las primitivas de `docs/IDENTIDAD.md` §8 y declara su
  fuente y su fecha; toda vista con datos parciales lo dice (el patrón de
  «muestra» de `/licitaciones`).
- El buscador global declara su alcance por vertical; no promete lo que no
  consulta.
- Cada entrega pasa por el gate y actualiza esta página (✅) y `/fuentes`
  cuando toca una fuente.
