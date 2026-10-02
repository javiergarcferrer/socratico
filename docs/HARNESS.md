# El harness — todo lo que moldea una sesión

El dueño lleva esta empresa solo y no está en el circuito mientras una sesión
trabaja. Las personas que normalmente cargan el contexto de un repositorio —el
senior que sabe por qué, el revisor que ve la deriva, el que reconcilia la rama
antes de construir— no están. El harness es lo que ocupa su lugar: **todos los
archivos que cambian lo que hace una sesión antes de que haya leído una línea de
código de producto.** Esta página es su índice, su orden de carga y su auditoría.

La regla para leerla: **un archivo solo moldea una sesión si la sesión lo carga
de verdad.** Por eso el inventario está ordenado por *cómo* llega al modelo, que
es lo que decide si una regla escrita ahí es una regla o un deseo.

---

## 0. El listón

Una sesión tiene que poder arrancar en frío, en un contenedor nuevo, sobre un
`main` compartido, y terminar un cambio correcto sin nadie en el circuito salvo
el dueño leyendo un informe corto en el teléfono. En concreto, el harness debe
garantizar, cada sesión, sin que se lo pidan:

1. **La cadena de herramientas existe** antes de la primera señal.
2. **El terreno está al día** — `origin/main` traído, la deriva conocida— antes
   de la primera edición.
3. **Las reglas están a un salto** y no se contradicen entre sí.
4. **Una acción peligrosa se rechaza ANTES de ejecutarse**: un `.env`, un
   `process.env` fuera de `/democracia`, un degradado, un push a otra rama.
5. **Nada llega a `main` en rojo.** `main` despliega a producción en cada push,
   así que el gate va **delante** del push, no detrás.
6. **Lo que es actual se distingue de lo que es historia** — una decisión de
   junio no puede leerse como una instrucción en septiembre.

Los puntos 1, 2 y 4 estaban resueltos desde el principio. El 3 había derivado en
los sitios que lista §3. El 5 era prosa: `/entregar` corría el gate completo
**antes** del rebase y solo el rápido después, de modo que el árbol que llegaba
a producción era uno que el build nunca había visto. El 6 no tenía sitio: las
decisiones del dueño vivían dentro del archivo de arranque.

---

## 1. Niveles de carga — cómo llega un archivo al modelo

| Nivel | Mecanismo | Qué significa para una regla escrita ahí |
|---|---|---|
| **T0 · siempre, fuera del repo** | El prompt de sistema de Claude Code, las preferencias del dueño, las instrucciones de la sesión (rama, atribución). | No se editan aquí. Lo que en el repo contradiga a T0 pierde en silencio — p. ej. una habilidad que le diga a una sesión web que use `gh`, que no tiene. |
| **T1 · automático, cada turno** | `CLAUDE.md` (inyectado entero); `.claude/settings.json` (los hooks corren antes del primer turno); la salida de `session-start.sh`; las **descripciones** del frontmatter de cada habilidad y agente (entran en la lista de herramientas). | Estas son las reglas. Su coste se paga en cada turno, así que la longitud aquí es el presupuesto más escaso del repositorio. Una descripción **es** comportamiento: decide cuándo se dispara una habilidad. |
| **T1.5 · automático, al tocar una ruta** | `.claude/rules/*.md`, inyectados cuando la sesión edita rutas que coinciden. | Lo mejor de los dos: coste cero hasta que es relevante, y entonces llega sin que nadie se acuerde de pedirlo. Condensan la página que nombran en su cabecera y **nunca la sustituyen**. |
| **T2 · al invocar un disparador** | Las páginas de `docs/` (enlazadas por nombre desde la tabla de `CLAUDE.md`); los cuerpos de las habilidades (`/skill`); los cuerpos de los agentes (al lanzarlos). | Una regla aquí se cumple solo si el disparador en T1 no es ambiguo. El puente T1 → T2 es el texto más importante del repositorio. |
| **T3 · solo por accidente** | Nada, hoy. `docs/` no tiene planes ni auditorías fechadas: todas sus páginas son normativas y actuales. | El día que entre un plan con fecha, va con una línea de estado arriba (implementado / superado / abierto) o se lee como una instrucción viva. |
| **T4 · máquina, no prosa** | `./.claude/hooks/verificar.sh` (el gate) y los cuatro hooks registrados. | El único nivel que no se puede ignorar. Una regla que importa aterriza aquí; la prosa de T1/T2 es la explicación de un pin de T4, no su sustituto. |

---

## 2. Inventario

### T1 — automático, cada turno

| Archivo | Qué cambia | Tamaño | Veredicto |
|---|---|---|---|
| `CLAUDE.md` | El arranque: qué es la plataforma, la invariante sin-DB y su única excepción, la tabla pregunta → página, las seis reglas de operación, los comandos. | 113 líneas · 6.6 KB | **corregido** · techo fijado (≤120 líneas / ≤12 KB): tenía 441 líneas / 27.9 KB, de las cuales 211 eran un inventario de módulos a mano |
| `.claude/settings.json` | Permisos y el registro de los cuatro hooks. | 85 líneas | mantener |
| `.claude/hooks/session-start.sh` | Instala dependencias si faltan (una sesión web arranca de un clon nuevo), trae `origin/main`, imprime rama, deriva, archivos sucios y los últimos commits. Convierte «reconcilia primero» de prosa en mecanismo. | 30 líneas | mantener |
| `.claude/skills/*/SKILL.md` (descripciones) | Tres disparadores: `/verificar`, `/entregar`, `/nueva-fuente`. La descripción decide cuándo se dispara cada uno. | 3 | mantener |
| `.claude/agents/*.md` (descripciones + `model` + `effort`) | `recon` (reconocimiento de campo) y `revisor` (revisión de solo lectura). | 2 | **corregido** (declaraban `model` pero ningún `effort`, así que cada barrido heredaba el de la sesión) |

### T1.5 — al tocar una ruta

| Archivo | Se carga al tocar | Página que condensa | Veredicto |
|---|---|---|---|
| `.claude/rules/identidad.md` | `app/`, `components/` | `docs/IDENTIDAD.md` | mantener |
| `.claude/rules/fuentes.md` | `lib/*.ts`, `app/api/` | `docs/AUDITORIA.md` + `docs/RECON.md` | mantener |
| `.claude/rules/democracia.md` | `app/democracia/`, `supabase/`, `lib/supabase*` | `docs/PLAN-DEMOCRACIA.md` | mantener |
| `.claude/rules/espacios.md` | `app/cuenta/`, `app/espacio/`, `app/p/`, `app/comunidad/`, `components/espacios/`, `lib/espacios*`, `lib/sesion.ts` | `docs/PLAN-ESPACIOS.md` | mantener |

### T2 — al invocar un disparador

| Archivo | Disparador en `CLAUDE.md` | Qué cambia | Veredicto |
|---|---|---|---|
| `docs/IDENTIDAD.md` | «¿Cómo debe verse y sonar?» | El sistema visual, la voz y la ergonomía cognitiva. Si la interfaz lo contradice, la interfaz está mal. | mantener |
| `docs/DESIGN.md` | «¿Cómo debe comportarse?» | La carta de comportamiento traída de RosetSoft (28-09-2026): accesibilidad, ergonomía, fricción, verdad, indexación. Lo que aún no se cumple lleva ⚠️. | **nuevo** |
| `docs/ARQUITECTURA.md` | «¿Dónde vive X?» | Capas de datos por fuente, rutas de API, páginas, primitivas compartidas, rendimiento percibido. | **nuevo** (era el 48 % de `CLAUDE.md`) |
| `docs/RECON.md` | «¿Cómo se lee el Congreso?» | Mecánica verificada del SIL y del consultante del Senado. | mantener |
| `docs/AUDITORIA.md` | «¿Y cualquier otra fuente?» | Estado ✅/⚠️/❌ por fuente, familias de acceso, bloqueos y su desbloqueo institucional. | mantener |
| `docs/PLAN-DEMOCRACIA.md` | «¿Cómo funciona la excepción?» | Esquema, RLS, RPCs, medidas de seguridad, Cuenta Única. | mantener |
| `docs/PLAN-ACCESO.md` | «¿Qué se construye después?» | Diagnóstico de acceso y plan en cuatro horizontes, con criterio de hecho. | **nuevo** |
| `docs/PLAN-GRAFO.md` | «¿Qué se construye después?» (segunda página de la fila) | El grafo como modelo de todo: paradigmas que se rompen, ontología, identidad, tiempo, subgrafos, exportaciones, fases. Lleva línea de estado (propuesto). | **nuevo** |
| `docs/HARNESS.md` | «¿Qué moldea una sesión?» | Esta página. | **nuevo** |
| `README.md` | — | Descripción pública y lista de funciones. | mantener |
| `.claude/skills/verificar/SKILL.md` | `/verificar` | Corre el gate completo y qué hacer con cada tipo de rojo. | mantener |
| `.claude/skills/entregar/SKILL.md` | `/entregar` | Documentación → gate → commit → rebase → gate sobre el árbol rebasado → push. | **corregido** (el gate completo corría antes del rebase; el árbol que se empujaba nunca lo veía) |
| `.claude/skills/nueva-fuente/SKILL.md` | `/nueva-fuente` | QRSPI de una fuente del Estado, con el contrato stateless. | mantener |
| `.claude/agents/recon.md` · `revisor.md` | al lanzarlos | Reconocimiento con la higiene de la plataforma; revisión contra todas las reglas. | mantener |

### T4 — la máquina

| Archivo | Qué fija |
|---|---|
| `.claude/hooks/verificar.sh` | El gate: typecheck → identidad → controles sin efecto → índice → movimiento → ninguna ruta importa los constructores del grafo (`lib/grafo-constructores.ts`) → statelessness → secretos → índice del buscador al día (`indice.bin` de su `corpus.json` y su `vectores.bin`) → ningún archivo versionado de más de 90 MB (GitHub rechaza 100 MiB) → **harness** → **el grafo compilado igual a sus constructores** (`scripts/build-grafo.mjs --comprobar`: cada nodo de `datos/grafo/`, releído por los módulos del servidor, triple a triple con su grafo de origen, sus vecinos y su schema.org, y contra el esquema zod de su clase; el índice de nombres y los decretos de cada firma contra las instantáneas; ~2 min) → build → **la evaluación del servidor MCP** (`scripts/eval-mcp.mjs` contra `next start` sobre ese build, en un puerto libre) → **el grafo conforme a su ontología** (`scripts/validar-grafo.mjs`: SHACL de `lib/ontologia.ts` sobre el volcado y una muestra de personas y decretos, y todo término `soc:`/`do:` declarado; ~1 min, el mismo servidor). En verde estampa `.git/harness-gate` con el sha de HEAD. |
| `.claude/hooks/lib.sh` | Los patrones que comparten los hooks: prohibiciones de identidad, valores y nombres de secreto, qué archivo es de UI, de `/democracia` o de `supabase/`. |
| `.claude/hooks/guard-bash.sh` | PreToolUse(Bash): rechaza `--force`, cualquier push que no sea a `main`, un push a `main` **sin la estampa del gate**, `--no-verify`, resets destructivos, `rm -rf` fuera de lo generado, escribir `.env`, cambiar secretos de Vercel/Supabase, y un identificador de modelo en un mensaje de commit. |
| `.claude/hooks/guard-edit.sh` | PreToolUse(Edit/Write): rechaza secretos, `process.env` o Supabase fuera de `/democracia`, y las prohibiciones de identidad — antes de que el archivo se escriba. |
| `.claude/hooks/typecheck.sh` | PostToolUse: `tsc --noEmit` tras cada edición de `.ts`/`.tsx`; ~2 s, así que el error sale en el momento y no en el build. |
| `.claude/hooks/stop-gate.sh` | Stop: una sesión no puede terminar con el gate rápido en rojo. |
| `.claude/hooks/sin-efecto.py` | Controles mudos: un `hover:` que repite lo que el elemento ya tiene, o un color de anillo sin ancho de anillo. |
| `.claude/hooks/indice.py` | Que el índice diga la verdad: toda página estática de `app/` está en `lib/menu.ts` con su tarea o en `FUERA_DEL_INDICE` con su motivo, y ningún destino apunta a una página que no existe. `verificar.sh` además rechaza movimiento escrito a mano en un componente (`cubic-bezier`, `animate-bounce`, duraciones por encima de 300 ms). |
| `.claude/hooks/cedulas.py` | Nunca la cédula: ninguna instantánea de `public/data` (JSON, TSV y `.gz`) la guarda, ni la que traiga un título oficial; las formas son las de `scripts/privacidad.py`. Solo en `verificar.sh --completo` (lee ~200 MB). |
| `.claude/hooks/cedulas-tablas.mjs` | Lo mismo para lo binario: las tablas Parquet de `public/tablas/`, que lee con DuckDB, y los fragmentos en brotli del grafo compilado (`datos/grafo/`); prueba cada texto con las mismas formas. Solo en `verificar.sh --completo` (~3 s). |
| `.claude/hooks/harness.sh` | Que esta página siga siendo cierta: el techo de `CLAUDE.md`, que exista cada ruta que nombra, que cada `CLAUDE.md §"…"` citado desde el harness sea una sección real, que cada `rules/*.md` nombre su página dueña, y que cada habilidad y agente tenga frontmatter válido con `effort`. |

---

## 3. Contradicciones encontradas (y qué se hizo)

Contadas sobre el conjunto T1/T2 el 2026-09-04. Cada una es un sitio donde dos
archivos que una sesión leería le decían cosas distintas.

| # | Dónde | La contradicción | Hecho |
|---|---|---|---|
| 1 | `CLAUDE.md` §Formatting vs `lib/format.ts` | Nombraba tres de las seis funciones. Faltaba `hace()` —la que `docs/IDENTIDAD.md` §3 hace obligatoria— y las dos de magnitud. Un listado de API a mano en el archivo más caro del repo, ya desactualizado. | Movido a `docs/ARQUITECTURA.md` y completado. |
| 2 | `CLAUDE.md` vs `docs/IDENTIDAD.md` §8 | El archivo que toda sesión lee **no nombraba ninguna** de las seis primitivas compartidas (`papel`, `marca`, `plegable`, `antiguedad`, `cifras`, `glosario`). Existen precisamente para que la identidad no se reimplemente en cuarenta archivos, y solo se anunciaban en T2. | Tabla de primitivas en `docs/ARQUITECTURA.md`, enlazada desde la tabla de `CLAUDE.md`. |
| 3 | `CLAUDE.md` §Identity vs `docs/IDENTIDAD.md` | Tres copias del sistema visual (T1, T1.5 y T2). Las prohibiciones nuevas —blanco de pantalla, píldoras— entraron en dos de las tres. | `CLAUDE.md` deja de copiar y enlaza; quedan dos copias con dueño declarado (T1.5 condensa, T2 explica). |
| 4 | `.claude/skills/entregar/SKILL.md` §4 vs `CLAUDE.md` §Cómo opera | El gate completo corría en el paso 2, **antes** del rebase; tras el rebase solo el rápido, que no construye. El árbol que llegaba a producción no lo había visto el build. | El gate completo va sobre el árbol rebasado, y ahora hay un mecanismo: la estampa. |
| 5 | «Nada llega a `main` en rojo» (prosa) vs `guard-bash.sh` | El guard sabía a qué rama se empuja pero no si el gate había pasado. Nada impedía un push a producción sin gate. | `verificar.sh --completo` estampa `.git/harness-gate`; el guard rechaza un push a `main` sin estampa válida para HEAD con el árbol limpio. |
| 6 | `.claude/agents/*.md` vs sí mismos | Declaraban `model: inherit` y ningún `effort`, así que un barrido de solo lectura heredaba el esfuerzo de la sesión. | `effort` declarado en los dos y comprobado por el gate. |
| 7 | `guard-bash.sh` vs sí mismo | Leía como mandato el texto que se le pasaba: un heredoc que explicara cómo se entrega el repositorio se rechazaba por contener las palabras que busca, y editar el propio guard por esa vía era imposible. No costaba nada en seguridad —un `shutil.rmtree` dentro de un heredoc de Python nunca lo cazó un grep de `rm -rf`— y empujaba a rodearlo. | El cuerpo de un heredoc es dato; la línea que lo abre se sigue leyendo. |
| 8 | `guard-bash.sh` vs el shell | Extraía el ref sin quitar las comillas, así que `git push origin "main"` se rechazaba como un push a la rama `"main"`. | Las comillas se quitan antes de comparar. |
| 9 | Cuatro citas `CLAUDE.md §"…"` vs `CLAUDE.md` | Al reescribir el arranque, `session-start.sh`, `/verificar`, `/nueva-fuente` y `scripts/aplicar-auth-supabase.sh` quedaron apuntando a secciones que ya no existen. Nada falla hasta que alguien va a buscarlas. | Reapuntadas, y el gate comprueba que cada cita resuelva. |

---

## 4. Dónde va una regla nueva

El harness solo funciona si se mantiene pequeño en T1 y cierto en T2.

| Es… | Va en… | Porque… |
|---|---|---|
| Algo que un diff puede romper | un check en `.claude/hooks/` + su fila en `docs/HARNESS.md` | T4 es el único nivel que no se puede ignorar |
| Una regla que toda sesión necesita en su primer minuto | `CLAUDE.md` — **una línea**, enlazando la página que la explica | T1 se paga en cada turno y el techo está fijado |
| Una regla que solo importa al tocar cierta ruta | `.claude/rules/<área>.md`, nombrando arriba la página dueña | T1.5 cuesta cero hasta que es relevante |
| La explicación, la trampa, el hueco medido | la página de `docs/` que la posee | T2 se carga por disparador, así que puede ser larga |
| Un procedimiento repetible con frase disparadora | `.claude/skills/<nombre>/SKILL.md` | La descripción **es** el disparador |
| Un especialista al que delegar | `.claude/agents/<nombre>.md`, con `model` y `effort` | Sin `effort` hereda el de la sesión |
| Un mecanismo que una sesión debe correr sin que se lo pidan | `.claude/hooks/` + `.claude/settings.json` | «Siempre haz X primero» en prosa es un deseo; un hook es una garantía |
| Una acción que una sesión nunca debe tomar | un caso en `guard-bash.sh` o `guard-edit.sh` | «Nunca» en prosa no lo rechaza nadie |

Nunca en la raíz del repositorio, nunca solo en el chat, y nunca en dos sitios
sin declarar cuál es el dueño y cuál la condensación.
