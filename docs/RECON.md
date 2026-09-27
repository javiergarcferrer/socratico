# RECON — Fuentes del Congreso Nacional (RD)

Entregable de la fase 0 del brief de Inteligencia Legislativa. Documenta lo que se
**verificó contra las fuentes reales**, no lo que se asume.

- **Fecha de reconocimiento:** 2026-08-31
- **Método:** peticiones HTTP directas con User-Agent identificable
  (`LegisRD-Recon/0.1`), sin autenticación, sin volumen.
- **Convención:** ✅ = comprobado contra una respuesta real. ⚠️ = parcial.
  ❌ = no verificado. Todo lo demás es hipótesis y está marcado como tal.

> **Segunda pasada.** Corrige dos conclusiones de la primera
> versión que resultaron equivocadas al probarlas — están marcadas como
> **CORRECCIÓN** en §6 y §8. Ambas iban en la dirección de subestimar la fuente.

> **Tercera pasada (esta revisión, 2026-08-31).** El Senado **sí tiene una vía
> pública de consulta** fuera de su web WordPress: el «consultante» de su SIL,
> enlazado desde su propia página oficial. La conclusión de §3 («no scrapear,
> esperar la Ley 200-04») queda **superada** — ver §12. El caso de prueba de §7
> **se resolvió en positivo** por esa vía.

---

## 0. Resumen ejecutivo

**Diputados es una fuente viable hoy.** Su SIL tiene una API JSON interna, abierta
y sin autenticación, con metadatos ricos: estado, condición, legislatura,
promulgación, proponentes con partido y provincia, traza de trámites y **documentos
PDF versionados por lectura**. Se puede construir sobre ella.

**Tres obstáculos reales, en orden de gravedad:**

1. **El servidor de documentos no es alcanzable desde este entorno.** Los metadatos
   viven en Azure y responden bien; los PDF viven en un servidor on-premise en RD
   (`200.88.113.222`) que **resetea la conexión en el handshake TLS**. La feature #1
   —la de mayor valor del brief— depende enteramente de esos PDF. Hay que verificar
   la alcanzabilidad desde el egress real de producción antes de comprometerla.
2. **El Senado bloquea explícitamente a los rastreadores de IA por nombre** en su
   `robots.txt`, e impone `Crawl-delay: 120` al resto. No se scrapeó. Esto asciende
   la Ley 200-04 (§7 del brief) de complemento a **camino principal** para el corpus
   senatorial, y deja bloqueadas la feature #6 y el caso de prueba.
3. **El caso de prueba obligatorio no existe en el SIL de Diputados.** Confirmado
   con búsquedas de control: la búsqueda funciona, la pieza no está.

| | Cámara de Diputados | Senado |
|---|---|---|
| Tecnología | SPA Angular sobre ASP.NET / IIS 10 (Azure) | WordPress (Apache + caché nginx) |
| API JSON | ✅ Existe, abierta, sin auth | ❌ No verificado |
| `robots.txt` | ✅ 404 — no existe | ✅ Existe y **restringe** |
| Restricción a agentes IA | Ninguna declarada | ✅ `Disallow: /` para `ClaudeBot`, `Claude-SearchBot`, `GPTBot`, `OAI-*`, `bingbot` y otros |
| Ritmo permitido | No declarado | ✅ `Crawl-delay: 120` |
| Documentos | ✅ PDF versionados… ⚠️ …pero el host no responde desde aquí | ❌ No verificado |

---

## 1. Estado de las preguntas del brief

| Pregunta | Estado |
|---|---|
| 1. ¿Endpoint JSON en cada SIL? | ✅ Diputados: sí. ❌ Senado: bloqueado |
| 2. ¿Cómo se pagina? | ✅ Diputados. ❌ Senado |
| 3. ¿Qué identificador usa cada cámara? | ✅ Diputados (y **`numero` NO sirve como clave estable** — §8). ❌ Senado |
| 4. ¿El texto es PDF? ¿Versionado por lectura? | ✅ **Respondida: PDF, versionado append-only** — §2.8 |
| 5. ¿`robots.txt` / términos de uso? | ✅ Las tres fuentes |
| Completitud histórica | ✅ **Resuelta** — §6 |
| Caso de prueba | ✅ **Resuelto (negativo)**: no está en Diputados — §7 |
| datos.gob.do | ⚠️ Parcial — §4 |

---

## 2. SIL Cámara de Diputados

`https://www.diputadosrd.gob.do/sil` sirve un shell HTML de 1.8 KB: SPA Angular
("SIL Ciudadano"). No hay nada que parsear en el HTML; todo entra por XHR. Los
endpoints se extrajeron leyendo los servicios Angular del bundle
(`/sil/Script/Bundles?v=…`, 5.3 MB) y se probaron contra el servidor.

**No es una API pública documentada**: es la API interna del portal ciudadano. Está
abierta (sin token ni cookie de sesión), pero es un contrato no publicado que puede
cambiar sin aviso. Tratarla como frágil y aislarla tras una capa de adaptación.

### 2.1 Trampa de ingesta: un 200 no significa que la ruta exista

⚠️ **Crítico para el crawler.** IIS enruta lo desconocido bajo `/sil/` al catch-all
de la SPA, que responde **`HTTP 200` con el HTML del shell**. Una ruta de API
inexistente devuelve 200, no 404.

La primera pasada de esta recon cayó en eso: `api/periodolegislativo` "respondió
200" y era HTML.

**Regla:** validar `content-type: application/json` en cada respuesta, nunca el
código de estado. Un `text/html` es un fallo de ruta disfrazado de éxito.

### 2.2 Servicios y rutas (leídos del código fuente)

Base: `https://www.diputadosrd.gob.do/sil/api/`

| Servicio | Rutas |
|---|---|
| `iniciativa/` | `CountIniciativas` ✅, `getIniciativas?page=&keyword=` ✅, `iniciativas?page=&grupo=&tipo=&perimidas=&keyword=` ✅ (abajo), `iniciativa/{id}` ✅, `historicos?page=&id=` ✅, `proponentes?page=&id=` ✅, `documentos?page=&id=` ✅, `comisiones?page=&id=`, `votaciones?page=&id=` ✅ (§14), `Actividades?page=&id=`, `Grupos` ✅, `Grupo?id=`, `Materias?grupo=` |
| `comision/` | `comisiones?tipoId=`, `comisiones?page=&keyword=` ✅, `comision/{id}`, `miembros`, `temas` (404) |
| `legislador/` | `legisladores?page=&nivel=` ✅ (§14), `legisladores?page=&keyword=` ✅, `legislador/{id}` ✅, `Iniciativas?page=&legisladorId=&keyword=` ✅, `votaciones?page=&legisladorId=&keyword=` ✅, `Provincias/{padre}` ✅, `Representaciones` ✅ |
| `sesion/` | `sesiones?page=&keyword=`, `sesion/{id}`, `documentos?page=&id=`, `ordendia?page=&id=`, `historicos` |
| `votacion/` | `votacion/{id}` ✅, `legisladores/?page=&id=` ✅, `iniciativas/?page=&id=` ✅ (§14) |
| `asistencia/` | `sesion/?sesionId=`, `legisladores/?page=&id=`, `actividad/?page=&id=` |
| `actividad/` | `actividad/{id}`, `actividadMiembros/?page=&id=`, `documentos/?page=&id=` |
| `GruposParlamentarios/` | `Index` ✅, `Detalle/{id}`, `Actividades?grupo=` |
| `periodolegislativo` | `periodolegislativo/all` ✅ — **ojo: lleva `/all`**, la ruta desnuda cae en el catch-all |
| `comun/` | `GetRutaDocumento/` ✅, `GetRutaHost/` ✅, `GetRutaRendicion/` ✅ |
| `suscriptor/` | `suscribirse` (**POST — no tocar**) |

✅ **Resuelto el 2026-09-24:** `iniciativa/iniciativas?page=&grupo=&tipo=&perimidas=&keyword=`
funciona. Las pasadas anteriores recibían **400 "The request is invalid."** porque
mandaban el `tipoId` numérico (`tipo=9`); el bundle del portal (`populate()` del
listado por tema) muestra que `tipo` es un **booleano** (`1===parseInt(n)`) y
`perimidas` otro. Verificado contra el origen con el User-Agent de la plataforma:

- `tipo=true` → proyectos de ley; `tipo=false` → resoluciones (internas y bicamerales).
- `perimidas=true` → solo las perimidas; `false` → todas las demás (vigentes,
  depositadas, aprobadas, retiradas, fusionadas). No hay valor para «ambas».
- `grupo` es **obligatorio**: sin él la ruta no existe (404), vacío da 400, `0` o
  `-1` devuelven 0 filas. No se puede pedir un tipo en todos los temas a la vez.
- `keyword` filtra igual que en `getIniciativas` (Justicia/ley/sin perimir: 176
  sin texto, 175 con `keyword=ley`).
- **Es una partición exacta:** 15 grupos × 2 tipos × 2 valores de `perimidas`
  suman **6,357**, el mismo `total` que `getIniciativas?keyword=` ese día.
  Todas las iniciativas tienen tema.

Consecuencia para la vista (`/congreso`): tema, tipo y perimidas se filtran en el
origen; tipo y estado solo existen **dentro de un tema** y la interfaz lo dice.
El filtro por tema que antes se aplicaba sobre la página de diez ya leída se
retiró: daba páginas cortas y un recuento que no correspondía a nada.

### 2.3 Paginación

Envoltorio uniforme: `{ "page": 1, "pageSize": 10, "total": 6222, "results": [...] }`

- `pageSize` **fijo en 10**, sin parámetro para alterarlo en ninguna firma.
- Un barrido completo cuesta ~**622 peticiones**; a 1 req/s son ~10 minutos.
  Viable a diario.
- Conteos observados: `CountIniciativas` → **6225**; `getIniciativas?keyword=`
  → `total` **6222**; `keyword=ley` → **1482**. La diferencia de 3 entre los dos
  primeros no se explicó. **No usar ninguno como cifra de control** sin entenderla.
- ✅ (2026-09-27) **El período anterior también se lista**: `getIniciativas`
  acepta `periodoId` (2760 = 2020-2024, 2761 = 2024-2028), el parámetro que el
  interceptor HTTP del portal añade a toda petición según el selector de su
  cabecera (leído de `/sil/Script/Bundles`); sin él responde el vigente.
  Censos: 11,500 y 6,357. `scripts/build-congreso.py` barre los dos para el
  buscador (AUDITORIA §G.15).

### 2.4 Perención: la feature #2 no depende del endpoint roto

✅ El listado normal ya trae `condicion` con valores **`VIGENTE`, `PERIMIDO`,
`APROBADO`** (una sola página de muestra: 3 vigentes, 3 perimidas, 4 aprobadas).

La feature #2 se puede construir cruzando `condicion` + `legislatura` +
`fechaDeposito` sin necesidad del filtro `perimidas` del endpoint que hoy da 400.

### 2.5 Forma de una iniciativa (respuesta real, id `159679`)

```json
{
  "id": 159679, "tipoId": 9, "tipo": "Proyecto de Ley",
  "camaraInicioId": 686, "camaraInicio": "Cámara de Diputados",
  "numero": "06225-2024-2028-CD",
  "descripcion": "Proyecto de ley que cambia el nombre de la sección El Batey …",
  "periodoCreacionId": 2761, "periodoId": 2761, "periodoRegistro": "2024-2028",
  "iniciado": "NO", "fechaIniciado": null,
  "temaId": null, "materiaId": 807, "materia": "DIVISIÓN POLÍTICA",
  "legislaturaId": 3945,
  "numPromulgacion": null, "fechaPromulgacion": null,
  "condicionId": 34, "condicion": "DEPOSITADO",
  "estadoId": 3, "estado": "Depositado",
  "fechaDeposito": "2026-08-28T00:00:00",
  "fechaUltimoCambioPrincipal": "2026-08-28T13:35:52.843997",
  "creadorPor": "897e0cb4-196b-4592-bb32-dae31a2144c9",
  "anoLegislativoId": 3832,
  "grupoId": 11, "grupo": "Justicia", "icono": "justicia",
  "origenId": 686, "origen": "Cámara de Diputados",
  "legislatura": "2026-SLO"
}
```

Lo que importa para el modelo:

- **`numPromulgacion` / `fechaPromulgacion` son campos de primera clase.** Responden
  directo la pregunta de negocio central ("¿se promulgó?").
- **`legislatura` codificada** (`2026-SLO` = Segunda Legislatura Ordinaria; `PLO`
  para la primera). Alimenta el cálculo de perención sin inferir fechas.
- **`condicion` y `estado` son taxonomías distintas y coexistentes**
  (`condicionId: 34 / DEPOSITADO` vs `estadoId: 3 / Depositado`). El borrador del
  brief tiene un solo `estado_actual`: colapsarlas pierde información.
- **`fechaUltimoCambioPrincipal` existe.** La regla del brief se mantiene —el diff
  entre snapshots es la verdad—, pero este campo sirve para **priorizar** qué
  re-pedir en cada barrido. Ordenar con él, nunca concluir con él.
- `creadorPor` es un GUID de usuario interno del Congreso. No ingerirlo.

### 2.6 Trámites — `historicos`

```json
{"page":1,"pageSize":10,"total":1,
 "results":[{"id":616976,"estadoId":3,"inicio":"2026-08-28T00:00:00",
             "estado":"Depositado","fin":"2026-08-28T00:00:00"}]}
```

⚠️ Más pobre que la tabla `tramites` del brief: solo `{estado, inicio, fin}`, sin
cámara ni comisión. La atribución a comisión debe venir de `comisiones?id=` (no
probado) y habrá que **unir ambas fuentes**. Además entrega **intervalos, no
eventos**: convertirlos a eventos append-only es trabajo de la capa de ingesta.

### 2.7 Proponentes

```json
{"principal": true, "legisladorId": 3502,
 "nombres": "Mélido ", "apellidos": "Mercedes Castillo",
 "nombreCompleto": "Mélido  Mercedes Castillo",
 "representacion": {"funcion":"Diputado","nivelRepresentacion":"Provincial",
   "provincia":"San Juan",
   "partido":{"id":2875,"nombre":"Fuerza del Pueblo","siglas":"FP"},
   "ejercicio":"En Curso","inicio":"2024-08-16T00:00:00",
   "fin":"2028-08-15T00:00:00","periodo":"2024-2028"}}
```

Cubre casi toda la tabla `legisladores` del brief sin llamada adicional. ⚠️ Ojo con
los **espacios dobles y sobrantes** (`"Mélido "`, `"Mélido  Mercedes Castillo"`):
normalizar en ingesta y no usar `nombreCompleto` como clave sin limpiar.

### 2.8 ✅ Documentos: PDF, versionados y etiquetados por etapa

**Esta es la respuesta a la pregunta 4 del brief, y habilita la feature #1.**

Traza documental real de la iniciativa `155693` (`03231-2024-2028-CD`, APROBADO):

| Fecha | id | Etiqueta |
|---|---|---|
| 2024-09-12 | 216936 | PROYECTO DEPOSITADO |
| 2025-06-06 | 231577 | ACUSE COMISIÓN INDUSTRIA Y COMERCIO |
| 2025-10-09 | 238652 | INFORME COMISIÓN INDUSTRIA Y COMERCIO |
| 2025-10-28 | 240029 | MODIFICACIÓN |
| 2025-10-28 | 240030 | MODIFICACIÓN 2 |
| 2026-07-10 | 257281 | PROYECTO APROBADO |
| 2026-07-10 | 257282 | AVISO PRESIDENTE COMISIÓN |
| 2026-07-13 | 257354 | AVISO PROPONENTE |

Conclusiones firmes:

- Todos son **`extension: "pdf"`**.
- **No se sobrescriben.** Cada versión es una fila propia con su `id` y su
  `cargado`. La cadena `DEPOSITADO → MODIFICACIÓN → MODIFICACIÓN 2 → APROBADO` es
  exactamente el insumo que la feature #1 necesita para diffear entre lecturas.
- La etapa viene en `descripcion` como **texto libre en mayúsculas**, no como un
  enum. Habrá que normalizarla con un mapeo tolerante (`MODIFICACIÓN N`,
  `INFORME COMISIÓN …` con el nombre de la comisión pegado). Los datos traen
  espacios iniciales (`" INFORME COMISIÓN…"`).
- El campo `ruta` viene **`null`**: la URL de descarga se compone aparte.
- Cobertura: de 12 piezas muestreadas, **todas tenían documentos** (entre 1 y 8).

### 2.9 ⚠️ El servidor de documentos no responde desde este entorno

Las rutas base se resuelven en runtime vía `api/comun/` (✅ no hardcodear):

```
GetRutaDocumento -> https://s-sil.camaradediputados.gob.do:8095/ReportesGenerales/VerDocumento?documentoId=
GetRutaHost      -> https://s-sil.camaradediputados.gob.do:8095
GetRutaRendicion -> https://diputadosrd.gob.do/unsuscribe/rendicion/?id=
```

Nótese que **difiere de la URL hardcodeada en el bundle**
(`ssilappl.camaradediputados.gob.do/…/VerDocumento2`), lo que confirma que hay que
pedirla al endpoint y no fijarla.

**Ninguna descarga funcionó.** Diagnóstico:

- El túnel del proxy se establece (`CONNECT` → 200) pero el **handshake TLS con el
  origen recibe un reset** (`Recv failure: Connection reset by peer`).
- Falla igual en `:8095` y en `:443`, en HTTPS y HTTP, y forzando TLS 1.0 y 1.2 con
  `SECLEVEL=0`. **El reset ocurre antes de enviar UA o ruta**, así que no es un
  bloqueo por User-Agent ni por path: es de red/TLS.
- `s-sil.camaradediputados.gob.do` resuelve a **`200.88.113.222`** (rango
  dominicano). El host de la API (`diputadosrd.gob.do`, en Azure) responde 200
  normal en la misma sesión, como control.

**Lectura:** metadatos en la nube y globalmente alcanzables; documentos en un
servidor on-premise en RD que rechaza a este entorno. Lo más probable es filtrado
por IP/geografía o un firewall que no acepta rangos de nube.

**No es concluyente sobre producción.** Antes de comprometer la feature #1 hay que
probar la descarga desde el egress real (Vercel/Supabase) y desde una IP
dominicana. Si el filtrado es geográfico, la ingesta de PDF necesitará salida por
RD, o pasar por la vía OAI. **Es el riesgo técnico #1 del proyecto.**

### 2.10 Higiene operativa

- Sin `robots.txt` en `www.diputadosrd.gob.do` (404 confirmado).
- `Microsoft-IIS/10.0`, `X-Powered-By: ASP.NET`, cookies `ARRAffinity` (Azure App
  Service multi-instancia).
- El shell HTML **expone en texto plano una clave de instrumentación de Azure
  Application Insights**. Es una clave de escritura de telemetría del Congreso,
  visible para cualquiera que abra el portal. No copiarla ni enviarle eventos.
- `api/suscriptor/suscribirse` acepta **POST**: único endpoint de escritura hallado.
  **No tocarlo.** Toda la ingesta debe ser estrictamente GET.
- Bug de datos en origen: `periodolegislativo/all` devuelve fechas con **mes `00`**
  (`"16/00/2020"`, `"15/00/2024"`). No parsear esas fechas: usar `description`.

---

## 3. SIL Senado — restringido por declaración explícita

> **CORRECCIÓN (tercera pasada).** Lo de abajo describe la **web WordPress** del
> Senado y sigue siendo cierto para ella. Pero el corpus senatorial no vive ahí:
> vive en `sil.senadord.gob.do`, un host aparte con interfaz pública de consulta
> y sin `robots.txt` propio. Ver §12.

`https://www.senadord.gob.do/robots.txt` → 200 (Apache + caché WordPress):

```
User-agent: Amazonbot / Amzn-SearchBot / Applebot / Baiduspider / ChatGPT-User
User-agent: Claude-SearchBot / ClaudeBot / GPTBot / MJ12bot / OAI-AdsBot
User-agent: OAI-SearchBot / SemrushBot / YandexBot / bingbot
User-agent: meta-externalagent / trendictionbot0.5.0
   -> Disallow: /   (cada uno)

User-agent: *
Crawl-delay: 120.00
```

Lectura honesta:

1. **El Senado bloqueó por nombre a los rastreadores de IA**, incluidos los de
   Anthropic. La recon del Senado se detuvo aquí por esa razón, no por dificultad
   técnica. No se emitió ninguna petición a su contenido.
2. El grupo `*` **no lleva `Disallow`**, pero impone `Crawl-delay: 120`: ~720
   peticiones/día como techo. Un barrido del corpus senatorial tomaría **días** por
   pasada — inviable como base de un producto de alertas, cuyo valor es la
   oportunidad.
3. El bloqueo por nombre **señala la postura de la institución**. Esquivarla no
   identificándose contradice el "no arrancar peleado con TI del Congreso" del
   brief y destruye la cobertura que da la Ley 200-04.

**Recomendación:** no scrapear el Senado. Activar ya la solicitud formal a su OAI
bajo **Ley 200-04** pidiendo el volcado estructurado de iniciativas. Es de plazo
largo: por eso hay que arrancarla en paralelo con el desarrollo, no después.
Mientras tanto el MVP se sostiene sobre Diputados.

**Hipótesis para cuando haya acceso legítimo** (sin verificar, no se probó): el
sitio corre WordPress (`x-nginx-cache: WordPress`, `x-endurance-cache-level`); si
las iniciativas viven como contenido de WP, podría existir `/wp-json/`.

---

## 4. Portal de datos abiertos (datos.gob.do)

⚠️ **El robots.txt del portal prohíbe su propia API:**

```
User-agent: *
Disallow: /dataset/rate/ , /revision/ , /dataset/*/history , /api/
Crawl-Delay: 10
```

`Disallow: /api/` cubre justamente `/api/3/action/package_search` que el brief da
por utilizable. Se hizo **una** consulta a esa API (emitida en el mismo lote que la
descarga del robots.txt, antes de conocer la restricción) y no se hicieron más.

Resultado de esa consulta: `package_search` con `q=congreso OR diputados OR senado`
devolvió **`count: 0`**. La búsqueda por la vía web (`/dataset?q=congreso`, no
restringida) muestra 1206 datasets en el portal, pero no se pudo aislar el conteo
filtrado desde el HTML.

**Conclusión provisional:** no hay evidencia de que datos.gob.do publique datasets
del Congreso. El supuesto del brief de que sirve "para validar totales" **no está
confirmado y podría ser falso**. Verificación pendiente, por UI y a mano, dada la
restricción de `/api/`.

---

## 5. Respuestas directas a las 5 preguntas

1. **¿Endpoint JSON interno?** Diputados: **sí**, abierto y sin auth (§2). Senado:
   **no determinado**, acceso restringido por `robots.txt`.
2. **¿Paginación?** Diputados: `?page={n}`, envoltorio
   `{page,pageSize,total,results}`, `pageSize` **fijo en 10**, ~622 peticiones por
   barrido. Senado: no determinado.
3. **¿Identificadores? ¿Algo en común?** Diputados usa un `id` numérico interno
   (`159679`), que es el que aceptan todos los endpoints, y un `numero` legible
   `{secuencia}-{período}-{cámara}` (`06225-2024-2028-CD`). ⚠️ **El `numero` NO es
   estable en el tiempo** (§8): incorpora el período de *registro*, no el de
   depósito. No hay identificador común entre cámaras confirmado.
4. **¿PDF? ¿Versionado?** ✅ **PDF, y versionado append-only** con etiqueta de etapa
   en texto libre (§2.8). ⚠️ Pero el host de descarga no responde desde este
   entorno (§2.9).
5. **¿`robots.txt` / términos de uso?** Diputados: **no existe** (404). Senado:
   **sí y restringe** (§3). datos.gob.do: **sí, prohíbe `/api/`** (§4). No se
   revisaron los términos de uso publicados en los portales: pendiente.

---

## 6. CORRECCIÓN — Completitud histórica: mejor de lo que parecía

**La primera versión de este documento planteó** que, como `CountIniciativas`
(6225) coincidía con el número de la pieza más reciente (`06225-…`), el corpus
estaría limitado al período 2024-2028. **Al probarlo, resultó falso.**

Lo verificado:

- `periodolegislativo/all` expone **solo dos períodos**: `2020-2024` (id 2760) y
  `2024-2028` (id 2761, `isCurrent: true`).
- En las páginas muestreadas (1, 300 y 623 de 623) **todos** los registros llevan
  `periodoRegistro: "2024-2028"`. El listado sí está acotado al período vigente.
- **Pero las piezas más antiguas del listado se depositaron en 2003 y 2004**:

  | numero | fechaDeposito | legislatura | condicion |
  |---|---|---|---|
  | `00001-2024-2028-CD` | 2003-10-24 | 2003-SLO | VIGENTE |
  | `00002-2024-2028-CD` | 2004-03-12 | 2004-PLO | VIGENTE |

**La conclusión correcta:** `periodoRegistro` es el período del *registro vigente*,
no el del depósito. Las piezas que siguen vivas se arrastran al período actual y
**reciben un `numero` nuevo**, mientras `fechaDeposito` y `legislatura` conservan el
origen real. El SIL cubre depósitos **desde 2003**, con más de 20 años de
trayectoria acumulada.

**El límite real no es la antigüedad, es la supervivencia:** el listado expone las
piezas vivas arrastradas más todo lo del período vigente (incluidas sus perimidas).
Las piezas que murieron en períodos anteriores **no aparecen**. Para historia
legislativa completa —incluyendo lo que se perimió en 2015, por ejemplo— esta
fuente no basta.

---

## 7. Caso de prueba obligatorio — resuelto en negativo

Búsqueda de la **"Ley que Regula la Iniciativa Legislativa Popular"** en Diputados:

| keyword | total |
|---|---|
| `iniciativa legislativa popular` | **0** |
| `legislativa popular` | **0** |
| `iniciativa popular` | **0** |
| `Iniciativa Legislativa` | **0** |

**Controles que descartan un fallo de búsqueda** (la búsqueda multi-palabra sí
funciona):

| keyword de control | total |
|---|---|
| `medio ambiente` | 66 |
| `cambia el nombre` | 6 |
| `popular` | 21 |
| `iniciativa` | 2 |

La búsqueda hace match de subcadena y opera correctamente sobre frases. **La pieza
sencillamente no está en el SIL de Diputados.**

Explicación, dado lo aprendido en §6: la pieza nació en el **Senado** (aprobada allí
en 2011 y de nuevo en 2023) y o nunca llegó viva a Diputados, o murió y no fue
arrastrada al registro 2024-2028.

**Implicación de producto:** el caso de prueba del brief **no es alcanzable sin
acceso al Senado**. Sigue siendo el criterio de éxito correcto — y hoy el sistema no
lo pasaría. Esto refuerza que la vía OAI del §3 es urgente, no opcional.

> **CORRECCIÓN (tercera pasada).** Con el consultante del Senado (§12) el caso
> de prueba **se pasa**: la búsqueda `popular` en la colección 2010-2016
> devuelve cuatro expedientes «PROYECTO DE LEY QUE REGULA LA INICIATIVA
> LEGISLATIVA POPULAR» (ids 21343, 21656, 22197, 22542; reintroducciones de
> 2013 a 2014), y la ficha del 01971-2014-SLO-SE registra promulgación como
> **Ley 136-15** el 28/07/2015.

---

## 8. CORRECCIÓN — `numero` no sirve como clave de reconciliación

**La primera versión propuso** `numero` como "candidato natural para reconciliar
entre cámaras". **Retirado.**

`00001-2024-2028-CD` corresponde a una pieza depositada en **2003**. El `numero`
incorpora el período de *registro* vigente, no el de origen: la misma pieza cambia
de `numero` al arrastrarse de un período al siguiente. Como clave de identidad
estable en el tiempo, no sirve.

Sirve, eso sí, para **citar** una pieza dentro del período actual, que es como un
abogado la referencia. Guardarlo descompuesto (`secuencia`, `periodo_registro`,
`sufijo_camara`) y como campo mostrable, no como identidad.

La identidad estable candidata es el `id` numérico interno. ⚠️ Sin confirmar que
sobreviva al arrastre entre períodos: verificable solo cuando haya datos de dos
períodos, o comparando contra el período 2020-2024 si se encuentra cómo listarlo
(ningún endpoint hallado acepta parámetro de período).

---

## 9. Implicaciones para el modelo de datos

Ajustes sobre el borrador del §2 del brief:

- **Desdoblar `estado_actual`** en `condicion` + `estado` (dos taxonomías con id
  propio en origen).
- **`numero` como campo mostrable descompuesto**, nunca como clave (§8).
- **Añadir `num_promulgacion` / `fecha_promulgacion`**: existen en origen y
  responden la pregunta de negocio central.
- **Guardar `legislatura` cruda** (`2026-SLO`) y derivar de ahí la perención, en vez
  de inferir fechas. Ignorar las fechas de `periodolegislativo` (bug de mes `00`).
- **Distinguir `fecha_deposito` de `periodo_registro`.** Son cosas distintas y
  confundirlas fue el error de la primera pasada (§6).
- **`versiones_texto` encaja bien con la realidad**: la fuente ya entrega versiones
  append-only con etiqueta de etapa. Añadir `etiqueta_origen` (texto crudo, p. ej.
  `"MODIFICACIÓN 2"`) junto a la `lectura` normalizada, porque el mapeo va a ser
  imperfecto.
- **`tramites` necesita dos fuentes**: `historicos` (intervalos de estado) cruzado
  con `comisiones?id=` para cámara y comisión.
- **Append-only en `snapshots_crudos` se sostiene**, usando
  `fechaUltimoCambioPrincipal` solo para priorizar el re-fetch.
- **Normalizar nombres de legisladores** en ingesta (espacios dobles).
- **La taxonomía temática ya viene dada**: `iniciativa/Grupos` devuelve 15 grupos
  con id estable (Administración/Municipalidad, Agricultura, Desarrollo Humano,
  Economía, Educación/Cultura/Deporte, Electoral, Fiscalización/Control,
  Género/Familia, Industria y Comercio, Internacionales, Justicia, Medio Ambiente,
  Modernización/Tecnología/Medios, Seguridad Nacional, Seguridad Social). Para la
  feature #4, **arrancar con esta clasificación oficial** y dejar `pgvector` para
  refinar dentro de cada grupo, en vez de clasificar desde cero.

---

## 10. Pendientes, en orden

1. **Probar la descarga de PDF desde el egress real** (Vercel/Supabase) y desde una
   IP dominicana. Es el riesgo #1: la feature de mayor valor depende de esto (§2.9).
2. **Redactar y enviar la solicitud OAI bajo Ley 200-04**, empezando por el Senado.
   Plazo largo: arrancar ya (§3, §7).
3. Confirmar si el `id` interno sobrevive al arrastre entre períodos (§8), y buscar
   cómo listar el período 2020-2024.
4. Probar `comisiones?id=`, `votaciones?id=`, `Materias?grupo=` y `comision/{id}`
   para cerrar el schema de comisiones (feature #5).
5. Extraer texto de dos PDF de la misma pieza y validar que el diff produce algo
   legible — prueba de fuego de la feature #1, ejecutable en cuanto se resuelva (1).
6. Revisar los **términos de uso publicados** de ambos portales (no solo
   `robots.txt`).
7. Verificar a mano, por UI, si datos.gob.do tiene algún dataset del Congreso (§4).

---

## 11. Estado de los supuestos no verificados del brief (§6)

- *"Que exista endpoint JSON en cualquiera de los dos SIL"* → ✅ **Confirmado en
  Diputados.** ❌ Sin confirmar en el Senado.
- *"Que exista mercado que pague por esto en RD"* → ❌ **Sigue sin evidencia.** Nada
  de esta recon toca esa pregunta. Que la API de Diputados abarate la construcción
  no dice nada sobre si alguien compra el producto; no confundir hallazgo técnico
  con validación comercial.
- *"El estatus actual de la Ley de Iniciativa Legislativa Popular"* → ❌ **No
  determinable desde Diputados**: la pieza no está en su SIL (§7).
- *"La completitud histórica de cada SIL"* → ✅ **Resuelta para Diputados**:
  depósitos desde 2003, pero solo piezas vivas arrastradas + período vigente
  completo (§6). ✅ **Resuelta para el Senado** (tercera pasada): seis
  colecciones cerradas por cuatrienio desde 2002 — §12.

---

## 12. TERCERA PASADA — el consultante público del SIL del Senado

**Hallazgo central:** la página oficial del Senado
(`/secretaria-general-legislativa/iniciativas-legislativas/`) enlaza a una
interfaz pública de consulta de expedientes que no pasa por su WordPress:

```
http://www.senado.gov.do/wfilemaster/consultante.aspx?bd=C2024-2028&url=lista_expedientes.aspx?coleccion=53
```

La misma aplicación responde por HTTPS en **`sil.senadord.gob.do`** (que es el
host que esta plataforma usa). Es un gestor documental ASP.NET WebForms
(«FileMaster», `MicrosoftOfficeWebServer: 5.0_Pub`) cuyo modo *consultante* no
exige autenticación. La raíz del host redirige a un `login.aspx` interno que no
se toca.

### 12.1 Higiene y postura

- `sil.senadord.gob.do/robots.txt` → **404**: este host no declara
  restricciones. El `robots.txt` restrictivo de §3 pertenece a
  `www.senadord.gob.do` (WordPress) y no gobierna este subdominio.
- La API REST del WordPress (`/wp-json/wp/v2/*`) existe pero responde **401**
  para todo lo útil (plugin de seguridad). No es vía.
- Postura adoptada: leer **solo** el consultante, con UA identificable, caché
  larga y sin barridos — el ritmo efectivo queda muy por debajo del
  `Crawl-delay: 120` que el WP exige para agentes genéricos, aunque aquí no
  aplique. La solicitud OAI (Ley 200-04) deja de ser prerequisito del MVP y
  queda como vía para el volcado completo.
- ✅ (2026-09-26) La búsqueda tolerante a tildes (`conOtrasFormas`,
  `lib/senado.ts`) respeta esta postura: solo si lo tecleado no trajo nada,
  a lo sumo **tres** formas con tilde de la palabra más larga, **en serie**,
  parando en la primera con resultados, y todas con la caché de una hora de
  `buscarCached`. En el SIL de la Cámara (`buscarIniciativasTolerante`,
  `lib/congreso.ts`) el tope es de tres palabras, doce sondeos de primera
  página y 300 filas leídas por consulta, de cuatro en cuatro; medido: 5
  peticiones para «educacion», 15 para «ambiente medio», 1 para una palabra
  de 200 letras.

### 12.2 Mecánica verificada

- **Sesión por colección.** `consultante.aspx?bd={base}&url=lista_expedientes.aspx?coleccion={id}`
  responde `302` con cookie `ASP.NET_SessionId` y redirige al listado (con un
  nonce `_nc`). Sin esa cookie, `lista_expedientes.aspx` y `Ficha.aspx`
  responden `302`. Seis bases: `C2002-2006` (coleccion=42), `C2006-2010`,
  `C2010-2016`, `C2016-2020`, `C2020-2024`, `C2024-2028` (coleccion=53).
- **Listado**: 50 filas por página, más reciente primero. Columnas: número,
  tipo, descripción (truncada con `...`), fecha de creación, estado. Cada fila
  enlaza por GET a `Ficha.aspx?IdExpediente={id}`. El total real viene en el
  span `txttotalexp`. Censos observados: 2024-2028 → **2 660**; 2020-2024 →
  **2 755**.
- **La paginación NO funciona por GET** (`numeropagina=2` devuelve la página
  1): es un postback con ViewState que muta estado de sesión. No se usa.
- **Búsqueda**: postback del propio formulario (`txtBuscar` + `imgBtnIr.x/y` +
  `__VIEWSTATE`/`__EVENTVALIDATION` + `cmbEstado=-1`, `cmbOrden=fc`,
  `Orden=RBOrdenDes`, `CBExpCerrados=on`). ⚠️ `cmbOrden` **debe** llevar un
  valor de su lista (`fc`…): un valor inventado dispara EventValidation y un
  302 a `ErrorGeneral.htm`. Es la única petición no-GET emitida.
- **La búsqueda es subcadena literal y sensible a tildes**: `codigo penal` →
  0; `código penal` → 14. Devuelve hasta 50 filas y el total real.
- **Ficha** (`Ficha.aspx?IdExpediente={id}&Coleccion={id}`): el formulario del
  FileMaster en solo-lectura, ~56 campos etiquetados. Los ricos: número, tipo,
  subtipo, descripción completa, **historial de trámites como prosa fechada**
  («Depositada el 11/8/2014. Enviada a Comisión el 28/8/2014. …»), materia,
  comisiones, proponentes, **perimida**, **reintroducida**, anotaciones (traza
  de reintroducciones), cámara inicial, poder de origen, legislatura de inicio
  (mismo código `2014-SLO` que Diputados), cuatrienio, **número del expediente
  gemelo en Diputados** (`07162-2010-2016-CD` — ¡campo de cruce entre
  cámaras!), despacho, **promulgación con número y fecha**. Los selects vienen
  con su vocabulario completo: ~100 estados y ~50 tipos, gratis.
- **Sin documentos**: la ficha no enlaza PDF alguno. Metadatos sí, textos no.
- El marcador `TÍTULO MODIFICADO:` también existe en el Senado — el parser de
  Diputados se reutiliza.
- Números con forma propia: `01886-2026-SLO-SE` (secuencia-año-legislatura-SE),
  con legislaturas **extraordinarias** (`SLE`) además de PLO/SLO. Igual que en
  Diputados, es cita, no identidad: la identidad es `IdExpediente` **por
  colección**.

### 12.3 Caso de prueba del brief — RESUELTO EN POSITIVO

`popular` en C2010-2016 → 4 expedientes «PROYECTO DE LEY QUE REGULA LA
INICIATIVA LEGISLATIVA POPULAR» (2013-2014, reintroducciones encadenadas según
sus anotaciones). La ficha de `01971-2014-SLO-SE` (id 22542) registra:
aprobada en primera con modificaciones el 29/10/2014, despachada al Poder
Ejecutivo el 21/07/2015 y **promulgada como Ley 136-15 el 28/07/2015**. La
frase exacta `iniciativa legislativa popular` da 0 por el punto ortográfico del
origen; `popular` la encuentra. En C2020-2024 no hay reintroducción con ese
título.

### 12.4 Implicación para la plataforma

`lib/senado.ts` implementa esta vía con el contrato de las demás capas
(timeout, un reintento, validación de respuesta, caché con ventanas largas) y
la vertical Congreso pasa a cubrir **ambas cámaras**. Límites que la UI
declara: listado = 50 más recientes por colección y búsqueda literal con
tildes.

## 13. CUARTA PASADA — la documentación asociada sí está publicada

> **CORRECCIÓN.** §12 concluyó «sin textos de proyectos». Es **falso**: el
> consultante los publica, solo que fuera de la ficha y detrás de un botón que
> hace postback. Verificado sobre `IdExpediente=39981` (Proyecto de Ley General
> de Alianzas Público-Privadas, C2024-2028).

### 13.1 Mecánica

1. La ficha trae un `btnDocumentacion` que hace postback a
   `documentacionasociada.aspx?CodigoColeccion=<col>&CodigoExpediente=<id>`.
   Esa URL **responde igual por GET** dentro de la sesión: no hace falta
   replicar el ViewState.
2. La tabla `ctl00_tblDocumentos` lista `base de datos / sección / nombre`.
   Cada fila repite el mismo enlace en sus tres celdas — deduplicar por `item`.
3. `documentoredirect.aspx?bd=&item=&codigocoleccion=&codigoexpediente=` es un
   302 hacia `documentoasociado.aspx` con los mismos parámetros: se va directo
   al destino y se ahorra un salto.
4. `documentoasociado.aspx` declara la ruta final dos veces —en un comentario
   `<!-- HOST=… URL_FINAL=… -->` y en el `src` de su iframe— hacia
   `sil.senadord.gob.do/mlx/docs/…`.
5. Esa ruta es un `.htm` de **70 bytes** cuyo único contenido es
   `window.location.href = 'X.pdf'`: el PDF hermano, en el mismo directorio.

### 13.2 Qué se obtiene y qué no

- El PDF se sirve por **nginx sin cookie de sesión** y **sin
  `X-Frame-Options`** (solo `upgrade-insecure-requests`), así que se puede
  enlazar y **previsualizar embebido** sin proxy: los bytes le llegan al lector
  desde el Estado, no desde esta plataforma.
- Pero son **escaneos**: el expediente de prueba son 29,9 MB, 58 páginas, 114
  objetos imagen, 57 `DCTDecode`, **cero fuentes** y cero operadores de texto.
  No hay capa de texto que extraer, así que **no hay sinopsis automática
  posible** sin OCR. La UI declara el peso y no carga el visor sola.
- No todos los expedientes tienen documentación (`39980` → 0 filas).

### 13.3 Lo que sí sustituye a la sinopsis

Ningún origen —ni el SIL de Diputados ni el consultante— publica resumen: el
único texto descriptivo es el **título**, que en la técnica legislativa
dominicana es autodescriptivo y **cita las normas que la pieza toca**.
`lib/legislacion.ts` extrae esas citas con su relación (deroga / modifica /
adiciona…, tomando el verbo *más cercano* hacia atrás, no el primero) y
`lib/normativa.ts` las resuelve contra la Consultoría Jurídica, cuyo buscador
acepta `DocumentNumber` como filtro único y responde en ~1 s (buscador JSON
desde septiembre de 2026; AUDITORIA §4.1). Resultado:
«Deroga la Ley 47-20 — *De Alianzas Público-Privadas*, Gaceta 10972,
20/02/2020» con enlace a su texto oficial. Eso es lo que responde «¿de qué
trata?» sin inventar nada.

## 14. QUINTA PASADA — legisladores y voto nominal (2026-09-23)

Verificado contra el SIL de Diputados con el User-Agent
`Socratico-Inteligencia/1.0 (monitoreo legislativo; herramienta independiente)`,
solo GET: dos barridos del directorio (41 peticiones cada uno), una votación
completa (21) y unas pocas decenas de muestras, contando las de la interfaz.
Las rutas se leyeron del bundle (`/sil/Script/Bundles`), servicio
`legisladorBaseUrl` y `votacionBaseUrl`.

### 14.1 Directorio — `legislador/legisladores`

- ⚠️ **`nivel` no es el nivel de representación, es la demarcación.**
  `nivel=` vacío o `nivel=null` → **400**; `nivel=1` (el id de «Provincial» en
  `legislador/Representaciones`) → 200 con **0 filas**. Lo que sí funciona es
  el id de una provincia (`nivel=1324` → los 5 de San Juan), `2892` (lista
  nacional, 5) y `3403` (exterior, 7).
- ✅ `legislador/Provincias/1` devuelve las **32 provincias** con su id
  (`{id, descripcion}`; «Monte Plata » trae un espacio de más). `Provincias/2892`
  y `Provincias/3403` devuelven un solo hijo cada una: no hacen falta.
- ✅ Barrido completo: 34 demarcaciones, **41 peticiones**, **221 personas**
  sin duplicados: **189 diputados** (118 «Diputado», 71 «Diputada») y
  **32 senadores** (28 + 4) — el SIL de Diputados lista también a los
  senadores, uno por provincia, porque firman piezas. Partidos: PRM 167, FP 31,
  PLD 12, PRSC 3, DXC 2 y uno cada uno ALPAIS, PCR, PLR, PPG, PQDC, PRD.
- ⚠️ `legisladores?keyword=` busca por nombre y funciona (`Mercedes` → 6), pero
  `keyword=a` declara **224**: más que el censo por demarcaciones y sin
  explicar. No se usa como censo.
- Campos por fila: `legisladorId`, `nombres`, `apellidos`, `nombreCompleto`
  (con dobles espacios, §2.7), `funcion`, `provincia`, `circunscripcion`
  (`"Circunscripción 1"`…, o `"n/a"` / `"No aplica"`), `partido{id,nombre,siglas}`.

### 14.2 Ficha — `legislador/legislador/{id}`

- ✅ `representacion{funcion, nivelRepresentacion, provincia, ejercicio
  ("En Curso"), inicio, fin, periodo}`, `partido`, `profesion`.
- Trae también teléfono de oficina y correo institucional: **no se muestran**
  (publicar no es exponer, AUDITORIA §E.5).
- ✅ Un id inexistente responde `200` con cuerpo **`null`** (JSON válido).
- ⚠️ Instituciones con iniciativa firman con un id de legislador (el Poder
  Ejecutivo es `legisladorId` 1503, función «Institución del Estado»;
  hipótesis: son el nivel `9999` «Entes con Iniciativas de Ley» de
  `Representaciones`). La
  plataforma solo enlaza a ficha a quien tiene función de diputado o senador.

### 14.3 Qué propuso — `legislador/Iniciativas?legisladorId=`

- ✅ Paginado de 10, de la pieza más reciente a la más antigua, con
  `numero`, `descripcion`, `condicion`, `estado`, `fechaDeposito`. No trae
  `tipo` (se deduce del inicio del título) ni `numPromulgacion`.
- ⚠️ El campo `principal` viene **siempre `false`**, incluso en piezas donde
  `iniciativa/proponentes` marca al mismo legislador como principal. No se usa.
- Censos de muestra: 3502 → 122; otros seis al azar entre 13 y 57. La ficha lee
  hasta **20 páginas (200 piezas)** y declara la muestra si el censo es mayor.
- ✅ Los senadores también tienen listado (Lía Díaz, 3710 → 9 piezas).
- Cobertura: la del listado general (§6), es decir, registro 2024-2028 más lo
  arrastrado a él.

### 14.4 Voto nominal ✅

- `iniciativa/votaciones?page=&id=` — las votaciones del pleno en que se
  sometió una pieza (155693 → 5; 158561 → 8), con `titulo` («Sesión 049,
  Votación 015»), `mocion` (texto del acta), `fecha`, `votos{cantidadVotosSi,
  cantidadVotosNo, cantidadVotosAbastencion}`, `asistencias{cantidadDelegados:
  190, cantidadPresentes}`. `cantidadAusentes` viene **siempre 0**: no usarlo.
- `votacion/votacion/{id}` — lo mismo más `habilitados` (190), `tipo`
  («Electrónica») y `estado` («Completa»).
- `votacion/iniciativas/?page=&id=` — las piezas decididas en esa votación;
  a menudo un **grupo** («cuadragésimo noveno grupo de resoluciones internas»:
  10 piezas en una votación).
- `votacion/legisladores/?page=&id=` — **el voto de cada diputado**: 190 filas,
  19 páginas. Códigos de `votoId`: `SI`, `NO`, `AU` («Ausente para esta
  votación»), `SV` («No Voto»). Comprobado en la votación 22636: 124 SI + 20 NO
  + 8 SV = 152 = `cantidadPresentes`; + 38 AU = 190. O sea, **SV es presente
  que no votó** y AU es no presente. El código de la abstención no apareció en
  las muestras. ⚠️ En estas filas `nombres` trae los **apellidos** y
  `apellidos` los nombres, en versales; el partido es la etiqueta de bancada
  en esa votación («DXC-ALPAÍS», «PLR-PCR», «INDEP»), no siempre la del
  directorio.
- `legislador/votaciones?page=&legisladorId=&keyword=` — cómo votó un diputado
  en cada votación (3502 → 2 561 en total). ⚠️ **Sin `keyword` no está en
  orden cronológico** (va por título de sesión descendente, mezclando años).
  ✅ `keyword` filtra sobre el **número de sesión** (`00008-2026-SLO`): con
  `keyword=2026-SLO` → 106 votaciones, de la sesión más reciente hacia atrás.
  `keyword=presupuesto` → 0 (no busca en la moción). Los senadores → 0.
- Las votaciones de una legislatura no traen la pieza (`iniciativaId` null en
  este listado): se llega a ella abriendo la votación.

### 14.5 Cruces verificados

- ✅ **El buscador de iniciativas hace match también sobre `numero`**:
  `keyword=06099-2024-2028-CD` → exactamente esa pieza. Con eso la cita de
  Diputados que trae la ficha del Senado se resuelve a su ficha.
- ⚠️ **No busca sobre `numPromulgacion`** (`43-26` → 0) y un número del año
  2020 (`47-20`) es subcadena de toda cita de expediente (`06347-2024-…`) → 64
  falsos positivos. La ley → proyecto se resuelve buscando una frase del
  título oficial de la ley y **confirmando por el número de promulgación**
  (43-26 → 06099-2024-2028-CD; 44-26 → 06038-2024-2028-CD; 86-25 →
  04603-2024-2028-CD). La búsqueda es **insensible a mayúsculas y sensible a
  tildes** (`codigo penal de la republica` → 0). ❌ 99-25 (presupuesto 2026)
  no se encuentra: el título de la ley añade «Dominicano» y la frase corta
  «presupuesto general del estado» da 134 resultados.
- ⚠️ **El Senado no siempre llena «Número de Expediente Cámara Diputados»**:
  el expediente 01712-2026-PLO-SE (id 39749), la misma Ley 43-26, lo trae
  vacío. El gemelo se confirma entonces por el número de promulgación, que
  ambas cámaras registran (`Ley núm. 43-26` en Diputados, `43-26` en el
  Senado). Sin cita ni promulgación común, no se enlaza.

