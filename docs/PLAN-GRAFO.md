# Plan del grafo — Socrático como módulo de conocimiento

> **Estado (2026-10-02): aprobado; F0 hecho salvo la importación real en
> Fabric IQ, F2 hecho.** F0: ontología 2.0.0 con núcleo y módulo dominicano
> en w3id, SHACL, perfil para Fabric IQ, el validador, y las tablas y los
> esquemas zod sacados de la misma definición. F2: el grafo se compila
> (`scripts/build-grafo.mjs` → `datos/grafo/`) con la fuente de cada triple
> y un índice de vecinos, y `describir()` y `path` lo leen, comprobado nodo a
> nodo en cada entrega. §4.1 decidido: w3id.
> Dirección del dueño:
> Socrático deja de ser una plataforma con verticales que además tiene un grafo
> y pasa a ser **un grafo de conocimiento con ontología** del que las páginas,
> el buscador, el SQL, el MCP y las exportaciones son vistas. Este plan dice
> qué paradigmas del repositorio se rompen, cuál es el modelo que los
> reemplaza y en qué orden se construye, cada fase con su criterio de hecho.
> Lo que ya existe y se cita está en `docs/ARQUITECTURA.md` §Grafo y en
> `docs/PLAN-ACCESO.md` §6 ter.

---

## 0. La imagen

Socrático es **un nodo**. Si se acerca la vista, ese nodo es un grafo: sus
fuentes, los objetos que cada fuente produce y los vínculos entre ellos. Si se
acerca más, cada objeto con estructura —un ministerio, un proceso de compra, un
proyecto de ley, un proyecto del lector— es a su vez un **subgrafo**: el
ministerio contiene viceministerios y direcciones, puestos y quienes los
ocupan, compras y presupuesto. Todo nodo tiene un **esquema** (qué es, qué
campos tiene, con qué se puede unir), toda arista tiene **tiempo** (desde,
hasta) y **procedencia** (qué fuente lo dice, con qué corte), y todo cambia por
**eventos** (un nombramiento, una destitución, una muerte, un cambio de
partido) que son nodos también.

Encima del grafo va la **ontología** (el vocabulario que lo hace legible por
máquinas y portable: Turtle, JSON-LD, Fabric IQ, FollowTheMoney); encima de la
ontología, la **recuperación** (GraphRAG); y por ella el grafo se expone a los
asistentes por **MCP**. Un país nuevo es un módulo más sobre el mismo núcleo.

---

## 1. El diagnóstico: lo que hay y dónde se rompe

Inventario verificado el 2026-10-01 (código y `meta.json`):

| Hoy | Consecuencia |
|---|---|
| El RDF se **arma en cada petición** desde los JSON de `public/data/` (`describir()` en `lib/grafo-rdf.ts`, un constructor a mano por tipo). ✅ F2: se compila; `describir()` lee `datos/grafo/`. | Cada ficha relee instantáneas enteras; la función de una ficha arrastra ~167 MB; `path` abre hasta 300 fichas en vivo. El grafo no existe como objeto: existe como 6 funciones. |
| **6 tipos de nodo** RDF (persona, institución, entidad financiera, empresa, decreto, provincia) de 15 que navega la plataforma. | Procesos de compra, leyes, iniciativas, votaciones, sentencias, obras, capítulos presupuestarios, nómina, documentos: **fuera del grafo**. El 80 % de lo que la plataforma sabe no se puede recorrer. |
| El **IRI es la ruta de la página** en `socratico.vercel.app` (`iriDe = SITIO + ruta + "#id"`). | La identidad depende del dominio del despliegue y del diseño de la interfaz. Un IRI publicado no puede cambiar; estos cambian si cambia la URL. |
| La persona se identifica por **su nombre normalizado**; un choque se resuelve con `-2`, `-3` **por orden de proceso** (`build-funcionarios.py`). | Un id puede pasar de una persona a otra entre builds. Inaceptable para un nodo que otros sistemas enlazan. |
| Un cargo tiene **una fecha** (la del movimiento) y un tipo de movimiento; el período electo es un literal («Período 2024-2028»). | No hay intervalos: «¿quién dirigía el INAPA en marzo de 2023?» no se puede preguntar. |
| `pepVigente` se calcula con **`new Date()`** menos 3 años. ✅ Desde F2, desde el corte de la instantánea. | El mismo corte da respuestas distintas según el día en que se lee. Un hecho no puede depender del reloj del lector. |
| La procedencia es **texto en la interfaz** (y `dct:source` literal en cargos y contrataciones); no hay PROV ni grafos con nombre. ✅ F2: cada triple lleva su grafo con nombre, por fuente y corte o por regla, con PROV-O. | No se puede preguntar «qué dice solo la DGCP» ni auditar de dónde salió una arista. |
| **Sin jerarquía**: ni `org:subOrganizationOf`, ni niveles del clasificador de DIGEPRES (se leen y se tiran), ni municipios. | No hay subgrafos: un ministerio no contiene nada. |
| Las menciones en texto se **enlazan al pintar** (`reconocerPorForma`, `reconocerInstituciones`) y no producen triples. | Lo que un decreto o una sentencia dice de alguien no entra al grafo. |
| La organización del repositorio son **verticales** (`lib/secciones.ts`), un `lib/<fuente>.ts` que pinta su página. | La fuente y la vista están soldadas: una fuente nueva es una página nueva, no nodos y aristas nuevos. |

Lo que **sí está bien y se conserva**: el vocabulario publicado
(`lib/ontologia.ts`, 14 clases alineadas con ORG, schema.org, ELI, ROV,
Wikidata), la regla de no unir homónimos, la cédula fuera de todo, el volcado
sin personas naturales, el SQL con DuckDB sobre Parquet y el ❌ a servir
SPARQL (las razones de `ARQUITECTURA.md` siguen valiendo: servirlo es otro
sistema; publicar el grafo para que cualquiera lo cargue en el suyo, no).

---

## 2. Los paradigmas que se rompen

1. **«El grafo se deriva en cada lectura, nada se guarda» → el grafo se
   compila.** Un paso de build (`scripts/build-grafo.mjs`) produce el grafo
   entero como archivos versionados —quads, tablas por clase y por relación,
   índice de adyacencia— y el servidor solo los lee. Sigue sin haber base de
   datos ni servidor: es lo que ya se hizo con el buscador (`indice.bin`),
   extendido a todo. La invariante no se toca; se cumple mejor.
2. **«La vertical es la unidad» → la clase y el subgrafo son la unidad.** Una
   vertical pasa a ser una vista guardada sobre el grafo (qué clases, qué
   aristas, qué orden). Una fuente nueva aporta nodos y aristas a clases que ya
   existen; la página viene después, si hace falta.
3. **«El IRI es la página» → la identidad es independiente de la interfaz y
   del dominio.** Ver §4.
4. **«Un hecho es un campo» → un hecho tiene tiempo, procedencia y estado.**
   Lo que cambia (cargos, afiliaciones, estados de un proceso, vigencia de una
   norma) es un nodo con intervalo; el estado de algo en una fecha es una
   consulta «a tal fecha», nunca una bandera calculada con el reloj.
5. **«La procedencia es texto» → la procedencia es dato.** Cada afirmación sale
   de un grafo con nombre por fuente y corte, descrito con PROV-O.
6. **«El adaptador pinta» → el adaptador afirma.** Cada fuente produce
   `Afirmacion[]` validadas contra el esquema de su clase; ni la página ni el
   MCP leen la instantánea cruda.
7. **«Socrático es un sitio» → Socrático es un producto de datos.** El sitio
   es un consumidor del grafo, como lo son el MCP, Fabric IQ o quien descargue
   el volcado.

---

## 3. El modelo

### 3.1 Tres capas

```
 ┌──────────────────────────────────────────────────────────────┐
 │ CONSUMO   páginas · /buscar · MCP (retrieve, path, query)    │
 │           exportaciones: Turtle/TriG · JSON-LD · Fabric IQ ·  │
 │           FollowTheMoney · Popolo · OCDS · Parquet + DCAT     │
 ├──────────────────────────────────────────────────────────────┤
 │ RECUPERACIÓN  GraphRAG: entidades, vecindario, subgrafos,     │
 │           «a tal fecha», resúmenes por subgrafo, vectores     │
 ├──────────────────────────────────────────────────────────────┤
 │ GRAFO COMPILADO  quads por fuente · tablas por clase y por    │
 │           relación (con desde/hasta y fuente) · adyacencia    │
 ├──────────────────────────────────────────────────────────────┤
 │ ONTOLOGÍA Y ESQUEMAS  una sola definición en TypeScript →     │
 │           OWL · SHACL · zod · esquema Parquet · Fabric · FtM  │
 ├──────────────────────────────────────────────────────────────┤
 │ FUENTES   adaptadores que afirman (DGCP, SIGEF, MAP, decretos, │
 │           SIL, TC/TSE, padrón DGII, SB, MapaInversiones…)     │
 └──────────────────────────────────────────────────────────────┘
```

### 3.2 Núcleo y módulo de país

- **`soc:` (núcleo, neutral de país)**: Persona, Organización, Puesto,
  Ocupación, Membresía, Evento, Norma, Proceso de contratación, Adjudicación,
  Contrato, Proyecto de inversión, Partida presupuestaria, Documento, Mención,
  Lugar, Identificador. Ningún concepto del núcleo nombra una ley o un
  registro dominicano.
- **`do:` (República Dominicana)**: los esquemas de identificador (RNC, RPE,
  código de unidad de compra, número de decreto, SNIP, capítulo presupuestario),
  las clasificaciones (DIGEPRES, modalidades de la DGCP, movimientos de cargo),
  la regla PEP de la Ley 311-14 como **esquema SKOS de numerales** y sus
  reglas, y los adaptadores.
- Otro país es `xx:` con sus identificadores, su regla PEP y sus adaptadores,
  sobre el mismo `soc:`. El consumidor (MCP, Fabric) pregunta lo mismo en
  todos.

### 3.3 Las clases y sus esquemas

Cada clase lleva, en una sola definición: propiedades con tipo, cardinalidad e
identificadores; relaciones con su clase de llegada; alineaciones externas; la
forma SHACL que valida cada instancia; y su tabla Parquet. Alineación (estándar
que adopta cada clase, para que el grafo hable lo que ya hablan los demás):

| Clase `soc:` | Se alinea con | Notas |
|---|---|---|
| Persona | `foaf:Person`, `schema:Person`, FtM `Person`, Popolo `Person` | Sin cédula, nunca. Solo personas con un papel público en una fuente oficial. |
| Organizacion (Institucion, Empresa, EntidadFinanciera, Partido) | `org:FormalOrganization`, `rov:RegisteredOrganization`, FtM `PublicBody`/`Company` | Jerarquía con `org:subOrganizationOf`: el subgrafo. |
| **Puesto** (nuevo) | `org:Post`, FtM `Position`, Popolo `Post` | El puesto existe aunque esté vacante: «Ministro de Educación». Lleva su numeral de la Ley 311-14. |
| **Ocupacion** (hoy `Cargo`) | `org:Membership` + `org:memberDuring`, FtM `Occupancy` | Persona → Puesto, **con desde/hasta**, el decreto que la abre y el que la cierra. Es la arista con tiempo. |
| Membresia | `org:Membership`, Popolo `Membership` | Afiliación a partido, a bloque, a junta. |
| **Evento** (nuevo) | `prov:Activity`, `schema:Event` | Nombramiento, destitución, renuncia, muerte, cambio de partido, adjudicación, promulgación. Lo que mueve el estado; cita su prueba. |
| Norma (Ley, Decreto, Reglamento, Resolución) | `eli:LegalResource`, `schema:Legislation` | Vigencia como intervalo; deroga/modifica como aristas. |
| Iniciativa, Votacion | Popolo `Motion`, `VoteEvent` | Congreso entra al grafo. |
| ProcesoDeContratacion → Adjudicacion → Contrato | OCDS `tender`/`award`/`contract` | Hoy solo hay `Contratacion` agregada por par; se abre al proceso. |
| ProyectoDeInversion | — (SNIP) | Obras de MapaInversiones. |
| PartidaPresupuestaria | — | Capítulo/programa de SIGEF, colgado de su institución. |
| Documento, DeclaracionJurada, Sentencia | `foaf:Document`, `eli` / `schema:DigitalDocument` | El texto que se lee. |
| **Mencion** (nuevo) | `oa:Annotation` (Web Annotation) | Un nombre en un documento: dónde, cómo se escribió, a quién podría referirse y con qué prueba. §3.6. |
| Lugar (Provincia, Municipio) | `schema:AdministrativeArea` | Municipios entran (límites de la ONE ya están). |
| Identificador | `adms:Identifier` | Valor + esquema + emisor: un RNC es un identificador, no un campo suelto. |

### 3.4 Tiempo: los nodos que cambian

- Toda relación que cambia es un **nodo n-ario con intervalo** (Ocupacion,
  Membresia, Vigencia), no una arista simple ni RDF-star: el n-ario se lleva
  igual a Turtle, a Parquet (una fila con `desde`, `hasta`), a FtM
  (`Occupancy`) y a Fabric IQ (una relación con su tabla); que Fabric o un
  almacén cualquiera lean RDF-star no está verificado.
- El intervalo **se deriva de los eventos**: el decreto que nombra abre; el
  que destituye, acepta la renuncia o nombra a otro en el mismo puesto,
  cierra. Un intervalo sin cierre conocido queda abierto **y lo dice**
  (`hasta` desconocido ≠ vigente).
- **Estado a una fecha**: «PEP», «vigente», «en funciones» se preguntan con
  una fecha (por omisión, la del corte de la fuente), nunca con el reloj.
  `pepVigente` y `esActual` se reescriben así.
- Lo que el dueño pide —una persona que cambia de cargo, que muere, que cambia
  de partido— son Eventos que cierran o abren Ocupaciones y Membresías. De qué
  fuente sale cada uno: cargos, de decretos y del MAP (ya); muertes, de
  Wikidata P570 para las personas ya atadas a un QID (hipótesis, verificar con
  QLever); partidos, de la JCE (❌ hoy: no hay padrón de afiliados público;
  candidaturas por partido sí, en las boletas de 2024 —verificar—).

### 3.5 Subgrafos

Tres clases de subgrafo, cada una con su mecanismo:

1. **Estructural**: una organización y lo que cuelga de ella por
   `org:subOrganizationOf` (viceministerios, direcciones, unidades de compra),
   más sus puestos, ocupaciones, compras y partidas. Las piezas ya están en
   `instituciones.json` (capítulo, clasificador de DIGEPRES con sector,
   subsector, área, subárea y sección) y hoy se tiran; entran como jerarquía.
   El subgrafo de un ministerio es la clausura de esa jerarquía.
2. **De procedencia**: un **grafo con nombre por fuente y corte**
   (`…/fuente/dgcp/2026-09-25`), en TriG. «Qué dice la DGCP» es un subgrafo; la
   unión de todos es el grafo. Cada grafo con nombre se describe con PROV-O
   (qué actividad lo produjo, de qué URL, con qué User-Agent, cuándo).
3. **Del lector** («nodos accionables»): un proyecto de `/espacio` es un
   subgrafo de **referencias** a nodos públicos más las notas y enlaces del
   lector. Vive en Supabase (la excepción ya existente) y nunca copia un dato
   del Estado: guarda IRIs. Se exporta como grafo con nombre propio (ya se
   exporta en FtM, `lib/ftm.ts`). Una alerta es un observador sobre un nodo
   («avísame si cambia la ocupación de este puesto»).

### 3.6 Menciones y personas expuestas

El flujo para cuando se lea todo texto (decretos, sentencias, documentos,
gacetas):

1. **Mención**: documento, posición, forma escrita, fecha del documento.
2. **Candidatos**: personas cuyo nombre casa (índice de nombres, con
   variantes), filtradas por contexto: la institución que publica, el cargo
   que el texto nombra, la fecha.
3. **Resolución con prueba**: se ata (`soc:refiereA`) solo si queda **un**
   candidato y el contexto lo corrobora; si no, queda
   `soc:posibleReferencia` con la lista. **Nunca se unen homónimos** (la regla
   vigente de `contracting_history`, generalizada).
4. **PEP**: la persona es PEP a la fecha de la mención si tiene una Ocupación
   de un Puesto con numeral de la Ley 311-14 que la cubre, o que terminó
   dentro de los 3 años previos (Ley 155-17, art. 2.19). La respuesta cita la
   ocupación y su decreto.
5. Desde la persona, sus vínculos: institución, puestos, decretos que firmó o
   que la nombran, declaraciones, contrataciones de las empresas que el grafo
   ata. **Nunca parentesco** (excluido a propósito, `grafo-rdf.ts`).

### 3.7 Identidad

- **IRIs propios, fuera de la interfaz y del despliegue**:
  `{base}/id/{país}/{clase}/{clave}`. La página es otra dirección que el IRI
  enlaza con `foaf:page`.
- **Claves naturales** donde el Estado da una: RNC, RPE, código DGCP, número
  de decreto, SNIP, capítulo. **Claves acuñadas** donde no: la persona recibe
  un id estable la primera vez que aparece, en un **registro de ids versionado
  y solo de adición** (`public/data/ids/personas.tsv`); una colisión nunca
  renumera a nadie. Dos ids que resultan ser la misma persona se unen con
  `soc:mismaPersona` y su prueba; el id viejo sigue resolviendo.
- `owl:sameAs` se reserva para identidad probada (hoy se usa también para
  «persona ↔ ficha de legislador», que es más débil): lo demás va con
  `skos:exactMatch` / `closeMatch`.
- Los IRIs actuales (`/funcionarios/x#id`, …) siguen resolviendo y declaran
  `owl:sameAs` hacia el nuevo: nada de lo publicado se rompe.

### 3.8 Procedencia

PROV-O sobre cada grafo con nombre: `prov:wasGeneratedBy` (la corrida del
script), `prov:used` (la URL de la fuente), `prov:generatedAtTime`, y el corte
de los datos (`dct:temporal`). Las afirmaciones derivadas (un intervalo
inferido de dos decretos, un PEP calculado, un enlace de mención) van en su
propio grafo `…/derivado/…` con la regla que las produjo: lo que es dato de la
fuente y lo que es inferencia de Socrático no se mezclan nunca.

### 3.9 Cómo se guarda sin base de datos

`scripts/build-grafo.mjs` compila, de las afirmaciones de todos los
adaptadores:

- `grafo.trig.gz`: los quads, un grafo por fuente y corte (el volcado público
  sigue sin personas naturales; ver §6).
- `public/tablas/{clase}.parquet` y `{relacion}.parquet`: una tabla por clase
  y una por relación, con `desde`, `hasta`, `fuente`, `corte`. Es lo que lee
  DuckDB (ya existe) y lo que Fabric IQ ata (§3.10).
- `adyacencia.bin`: el grafo en CSR (filas comprimidas, como `indice.bin`) para
  que una ficha, `path` y `retrieve` lean vecinos sin abrir instantáneas.
  `describir()` pasa a ser una lectura; la deuda de ~167 MB por ficha
  desaparece.

**Lo hecho en F2 (2026-10-02)** y lo que cambió del diseño, con razones:

- ✅ `datos/grafo/`, no `grafo.trig.gz`: la descripción de cada nodo, tal
  cual la dan hoy los constructores, en fragmentos por tipo
  (`nodos/<tipo>/NNN.json.br`, en orden de clave, cada uno con su tabla de
  términos), más el schema.org de cada ficha aparte
  (`ld/`) para que la función de una ficha no lleve el resto. Fuera de
  `public/` porque trae personas (§6). `describir()` y `path` leen de ahí.
- ✅ Comprobado nodo a nodo: el compilador relee por los módulos del
  servidor y compara triple a triple con los constructores; el gate lo
  repite en cada entrega (`ARQUITECTURA.md` §Grafo semántico).
- ✅ Los grafos con nombre: cada constructor dice de qué grafo sale cada
  triple —uno por fuente y corte, uno por regla de Socrático—, el compilado
  lo guarda y se comprueba como el triple mismo. `/api/grafo` los sirve en
  TriG y N-Quads con PROV-O, y el volcado sale también en TriG
  (`grafo.trig.gz`). Los IRIs son `…/fuente/<clave>/<corte>` y
  `…/derivado/<regla>/<día>`.
- ✅ El índice de vecinos (`datos/grafo/vecinos/`): las aristas de cada
  nodo en filas comprimidas por fragmento, con los mismos fragmentos que las
  descripciones; `path` lo recorre. Para que `retrieve` recorra el grafo
  entero (F7) bastará un índice global de nodos sobre él.
- ✅ Lo publicado por cada institución en la tabla de procesos, compilado
  (`compras.json`): `fetch` ya no abre la tabla entera.
- Las tablas por clase y relación salen del volcado, que lee el compilado
  sin servidor (34 s, antes 226), con sus columnas y tipos de la ontología.

### 3.10 Exportaciones

| Destino | Qué se entrega | Cómo |
|---|---|---|
| RDF (cualquier almacén, SPARQL de quien lo cargue) | TriG/Turtle/N-Triples + la ontología | Del compilado. |
| **Fabric IQ** | La ontología en OWL/Turtle (clase → *entity type*, propiedad de datos → *property*, propiedad de objeto → *relationship*, `soc:`/`do:` → *namespaces*, `subClassOf` → herencia) y las tablas Parquet de cada clase y relación como fuente de los *data bindings*. | Fabric importa RDF, Turtle y OWL en un ítem de ontología vacío e informa qué preservó, ajustó o no admite; ata cada tipo a tablas de un lakehouse de OneLake. La tabla por clase y la tabla por relación son exactamente esa forma. Verificar con una importación real (§7, F6). |
| FollowTheMoney (Aleph, OpenSanctions) | JSONL: Person, PublicBody, Company, Position, **Occupancy**, Contract | `Occupancy` es como OpenSanctions modela un PEP: la arista con tiempo de §3.4 sale tal cual. |
| Popolo | Congreso: personas, organizaciones, membresías, mociones, votaciones | Estándar de parlamentos abiertos. |
| OCDS | Procesos, adjudicaciones, contratos | Estándar de contratación abierta. |
| Catálogo | DCAT + VoID | Lo que hay, de dónde, con qué licencia y corte. |

### 3.11 La recuperación (GraphRAG) y el MCP

- `retrieve` deja de abrir fichas en vivo: lee entidades, vecindario y
  subgrafos del compilado.
- **«A tal fecha»** (`as_of`) en `retrieve`, `fetch` y `path`: el estado del
  grafo en una fecha, con los intervalos de §3.4.
- **Resúmenes por subgrafo** (un ministerio, una persona, un proceso) escritos
  **por reglas sobre los hechos**, no por un modelo de lenguaje: generarlos
  con un modelo pediría una clave y la invariante la prohíbe. Con sus
  vectores Model2Vec, son la unidad que recupera una pregunta amplia.
- Las respuestas citan la afirmación: grafo con nombre, fuente, corte.

---

## 4. Decisiones del dueño (lo que esta sesión no decide)

1. ✅ **El espacio de nombres de los IRIs: w3id** (decidido el 2026-10-01).
   `https://w3id.org/socratico/def/…` para el vocabulario (ya en uso desde la
   ontología 2.0.0) y `…/id/…` para los nodos (F1). Un solo redireccionamiento
   en w3id hacia el sitio; las reglas viven en `next.config.ts`. El pull
   request a w3id lo abre el dueño: `docs/gestiones/w3id.md`.
2. **Personas en el volcado masivo.** Hoy el volcado excluye a toda persona
   natural, por decisión registrada. La visión de PEP enlazados exige al
   menos **ocupaciones de puestos públicos** (persona, puesto, desde, hasta,
   decreto) en lo que se exporta a Fabric o FtM. Es lo que publican
   OpenSanctions y Wikidata, pero es una decisión legal (Ley 172-13 de
   protección de datos): solo el dueño la toma. Sin ella, la exportación
   lleva el grafo institucional y las personas siguen por consulta, una a una.
3. **El cambio de paradigma** (§2) es un rumbo de meses. Se construye por
   fases que cada una deja la plataforma funcionando y comprobada contra la
   anterior (como el índice por columnas: mismas respuestas, byte a byte).

---

## 5. Lo que no se hace

- **No** una base de datos de grafos ni un servidor SPARQL (❌ vigente y con
  razones; el grafo compilado se puede cargar en el de cualquiera).
- **No** cédula, parentesco, biografías ni juntas de bancos.
- **No** unir homónimos sin prueba; **no** inferir conducta de una relación.
- **No** un modelo de lenguaje en el build ni en el servidor (sin claves).

---

## 6. Privacidad, en una regla

Lo que se publica en masa es lo **institucional** (organizaciones, puestos,
normas, contratos, partidas) y, si el dueño lo decide (§4.2), las
**ocupaciones de puestos públicos**. Lo demás de una persona se sirve por
consulta, de una en una, como hoy. El compilado guarda la marca de cada
afirmación (`publicable: masa | consulta`) y cada exportación la respeta; el
gate lo comprueba como ya comprueba que el volcado no toque `/funcionarios/`.

---

## 7. Fases

Cada fase deja todo funcionando y se comprueba contra la anterior.

| Fase | Qué | Criterio de hecho |
|---|---|---|
| **F0 · Ontología 2.0** ✅ salvo Fabric | ✅ Una sola definición (`lib/ontologia.ts`) de la que salen OWL, SHACL, el perfil de Fabric IQ y la correspondencia con FtM; núcleo `soc:` y módulo `do:` en w3id; Puesto, Ocupacion con intervalo, Evento, Membresia, Mencion, Identificador, Instantanea (PROV-O), jerarquía ORG, cadena de contratación (ePO). ✅ `scripts/validar-grafo.mjs`. ✅ Las tablas Parquet y los esquemas zod salen de la misma definición (`lib/ontologia-esquemas.ts`): cada columna dice su propiedad, cada fila y cada nodo compilado se validan. | ✅ El grafo de hoy es conforme a sus formas SHACL (856 mil triples, 0 violaciones; ARQUITECTURA §Grafo semántico) y el gate completo lo comprueba en cada entrega. ❌ Falta el informe de una importación real en Fabric IQ: exige un espacio de Fabric con capacidad, que esta sesión no tiene. |
| **F1 · Identidad** | IRIs de §3.7 (tras la decisión §4.1); registro de ids de personas solo de adición; `sameAs` de los IRIs viejos. | Dos builds seguidos con datos nuevos no cambian ningún id existente (el gate lo comprueba). |
| **F2 · El compilador** ✅ 2026-10-02 | ✅ Los constructores de los 6 tipos (`lib/grafo-constructores.ts`) solo los corre `build-grafo.mjs` y afirman cada triple con su grafo; `describir()` lee el compilado (`datos/grafo/`), `path` su índice de vecinos; TriG por fuente con PROV-O (§3.9). | ✅ Mismos triples, con el mismo grafo cada uno, que los constructores para cada uno de los 536 196 nodos (3,39 millones de triples), el mismo schema.org de cada ficha y los mismos vecinos; el gate lo repite en cada entrega. ✅ Una institución en frío: 0,02 s por `/api/grafo` (antes 0,16–0,21) y 0,06–0,07 s por `fetch` del MCP (antes 0,54–0,58). ✅ La función de una ficha, de ~162 MB a 11–46 MB (ARQUITECTURA §Grafo semántico). |
| **F3 · Todo adentro** | Procesos (OCDS), normas (ELI, con vigencia y derogaciones), Congreso (Popolo), obras (SNIP), partidas de SIGEF, jerarquía de DIGEPRES y capítulos, municipios. | Cada vertical de `lib/secciones.ts` tiene sus clases en el grafo; `inventario()` las cuenta. |
| **F4 · Tiempo** | Ocupaciones con desde/hasta derivadas de los eventos; `pepVigente`/`esActual` «a tal fecha»; muertes de Wikidata si se verifican. | «¿Quién dirigía el INAPA en marzo de 2023?» se contesta con su decreto; el mismo corte da la misma respuesta cualquier día. |
| **F5 · Menciones** | El flujo de §3.6 sobre decretos, sentencias y documentos; grafo `…/derivado/menciones`. | En una muestra revisada a mano, ningún enlace a un homónimo; cada mención atada cita su prueba. |
| **F6 · Exportaciones** | Fabric IQ (ontología + tablas), FtM, Popolo, OCDS, DCAT. | Importación real en Fabric IQ sin elementos «no admitidos» del núcleo; `ftm validate` limpio. |
| **F7 · GraphRAG** | `retrieve` sobre el compilado; `as_of`; resúmenes por subgrafo; MCP con citas a la afirmación. | La evaluación (`scripts/eval-mcp.mjs`) crece con preguntas temporales y de subgrafo y pasa; `retrieve` en frío < 1 s en Vercel. |
| **F8 · Núcleo y país** | Separar `soc:` de `do:`; los adaptadores dominicanos como módulo. | Un país de prueba con un solo adaptador se compila sobre el mismo núcleo sin tocarlo. |

**Orden**: F0 y F2 primero —sin esquema y sin compilador, lo demás es más
código a mano—; F1 en cuanto el dueño decida §4.1; F3 y F4 juntos, fuente por
fuente; F5–F8 después.
