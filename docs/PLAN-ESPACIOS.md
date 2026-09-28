# Plan — Cuentas y espacios del lector

Decisión del dueño del 2026-09-28 (`docs/DECISIONES.md`, cerradas): la
plataforma tiene **cuentas reales** para que quien investiga guarde registros,
arme proyectos que enlazan registros distintos, los anote, los publique, los
trabaje con otras personas y reciba alertas de lo que sigue. Es la segunda
excepción a la invariante de `CLAUDE.md`, con el mismo contrato que
`/democracia` (`docs/PLAN-DEMOCRACIA.md`).

## 1. El contrato

- **Ningún dato del Estado entra a la base.** Una entrada es una referencia:
  tipo, identificador, título, enlace y, en lo que se sigue, la huella (el
  estado en palabras, `lib/seguimiento.ts`). La cifra, el texto y el estado
  actual se siguen leyendo del origen o de su instantánea versionada, igual
  que para quien no tiene cuenta. La base guarda **lo que es del lector**: qué
  eligió, cómo lo ordenó, qué anotó y con quién lo comparte.
- **Esquema propio, `espacios`**, en el proyecto `Transac` (el mismo pool de
  Auth que `/democracia`: una sola cuenta para votar y para investigar). RLS en
  cada tabla; `anon` no tiene permiso sobre ninguna: un proyecto publicado se
  lee por una sola función definidora que devuelve exactamente lo publicable.
- **Solo claves publicables en la app** (`lib/supabase-config.ts`). Ninguna
  clave de servicio en Vercel.
- **La frontera en el código.** `lib/espacios.ts` son los tipos, las etiquetas y
  la lectura de un proyecto publicado por HTTP (sirve al servidor y no importa
  el cliente de Supabase). Solo tocan Supabase `lib/supabase.ts`,
  `lib/sesion.ts`, `lib/espacios.ts`, `lib/espacios-cliente.ts`, `app/cuenta/*`, `app/espacio/*`,
  `app/p/*` y `components/espacios/*` (además de lo de `/democracia`). Una
  ficha no lee la base: pinta `components/espacios/guardar.tsx`, que carga el
  cliente de Supabase solo cuando el lector lo pulsa. Lo vigilan
  `.claude/hooks/guard-edit.sh` y `verificar.sh` (`es_archivo_con_estado`).

## 2. Modelo (`supabase/migrations/20260928120000_espacios.sql`)

| Tabla | Qué es |
|---|---|
| `perfiles` | El nombre con que firma (opcional; sin él se muestra el correo enmascarado a quien colabora, y «Anónimo» en lo publicado). |
| `proyectos` | Una investigación: título, descripción, dueño, `publico` + `slug` (`/p/<slug>`). |
| `miembros` | Quién más trabaja en él: `editor` (agrega, anota, enlaza) o `lector`. |
| `invitaciones` | Una invitación **a un correo**. La ve solo quien entra con ese correo **verificado** (`mi_correo()`, que lee `auth.users.email_confirmed_at`, nunca el correo del JWT) y la acepta o rechaza una por una en `/espacio` (`mis_invitaciones()`, `aceptar_invitacion(id)`); nada se acepta solo. No se envía ningún correo: quien invita avisa. |
| `entradas` | Un registro guardado. Sin proyecto, es la bandeja «Guardado». Con proyecto, pertenece al proyecto y cualquiera con permiso de edición lo anota; solo título y nota se editan (permisos por columna), así que nadie lo mueve de proyecto. `href_valido`: una ruta propia (`/x`, nunca `//` ni `/\`) o `https://host/…`, sin espacios, controles ni barra invertida. `lib/espacios.ts` (`rutaPropia`, `hrefValido`) repite la regla en el cliente. |
| `enlaces` | Dos registros del mismo proyecto unidos por una nota («la adjudicó», «la firma»). Un disparador impide cruzar proyectos. |
| `seguimientos` | Lo que sigue, con su huella: la misma forma que `Seguido`. Es lo que viaja entre dispositivos. |

Permisos: `rol_en(p)` responde `dueno`, `editor`, `lector` o nada para
`auth.uid()`; `puede_leer` y `puede_editar` salen de ahí. El dueño de un
proyecto **no cambia nunca** (disparador); publicar y el slug son solo del
dueño. `authenticated` actualiza solo columnas concretas (`grant update
(col)`): el título y la nota de una entrada, la nota de un enlace, el rol de
un miembro —nunca `usuario`, `proyecto` ni `dueno`—. Topes por cuenta (200
proyectos, 5000 guardados, 1000 seguidos; un upsert de algo ya seguido no
cuenta) y por proyecto (2000 registros, 5000 enlaces, 50 invitaciones
pendientes). `publicado(slug)` fecha la investigación con lo último que
cambió en ella, entradas y enlaces incluidos.

`democracia.secretos` se endurece en una migración aparte
(`20260928120100_democracia_secretos_rls.sql`: RLS encendida, sin políticas).
Es seguro porque `hash_cedula` y `hash_sujeto` son `SECURITY DEFINER` del
mismo dueño que la tabla (`postgres`, verificado en vivo) y no hay `FORCE`.

✅ Probado el 2026-09-28 con `supabase/pruebas/espacios_rls.py` sobre un
Postgres desechable que simula `auth`: 72 casos desde el dueño, una editora
invitada, una extraña, una cuenta que falsea en su JWT el correo invitado,
otra con el correo sin confirmar y `anon`, con las dos migraciones aplicadas
dos veces. Cubre traspasar el proyecto, colarse cambiando `usuario` de un
miembro, aceptar sin consentimiento, mover entradas siendo editor, enlaces
que cruzan proyectos, `href` hostiles y que `hash_cedula` siga respondiendo.
La prueba encontró y corrigió, antes de que existieran en vivo, dos fallos
de la primera versión (el tope leía `new.proyecto` en proyectos; `insert …
returning` lo negaba la política de lectura) y la revisión, seis más
(traspaso, miembro intercambiado, invitación por correo del JWT y aceptada
sola, editor que mueve entradas, `href` con `/\`).

## 3. Pantallas

- **`/cuenta`** — entrar o crear la cuenta con Google o con el código de seis
  dígitos que llega al correo (`lib/sesion.ts`, la misma lectura tolerante de
  enlaces y códigos que `/democracia/registro`). El botón de Google solo
  aparece si `/auth/v1/settings` dice `external.google: true` (⚠️ hoy
  `false`: activarlo es del dueño, docs/DECISIONES.md); GoTrue une la
  identidad de Google a la cuenta que ya tenga ese correo verificado, y
  `mi_correo()` lo ve confirmado, así que las invitaciones siguen casando.
  Contraseña opcional: se entra con `signInWithPassword`, pero **solo se crea
  desde dentro** de una sesión abierta con el código (`updateUser`), nunca con
  `signUp` — con `mailer_autoconfirm: true` (✅ apagado el 2026-09-28) un alta
  con contraseña daba por verificado un correo ajeno y le entregaba sus
  invitaciones; la regla se queda aunque el panel ya lo impida. Olvidarla es
  entrar con el código y poner otra; no hay correo de recuperación. El nombre con que firma, salir, y qué se
  guarda y qué no. Al entrar une lo que el navegador ya seguía con la cuenta
  y, si hay invitaciones, lo dice y lleva a `/espacio`. `?volver=` solo
  acepta `rutaPropia`. Salir borra de este navegador la lista de la cuenta.
- **`/espacio`** — el espacio: las invitaciones pendientes (aceptar o
  rechazar, diciendo que lo que anote ahí lo publica el dueño bajo su
  nombre), qué cambió en lo que sigues, los proyectos (propios y
  compartidos) y lo guardado suelto.
- **`/espacio/proyecto?id=`** — la mesa de trabajo de una investigación: sus
  registros con notas, los enlaces entre ellos, quién colabora, invitar,
  publicar. Por parámetro y no por ruta dinámica: es una página de cliente y
  un id de proyecto no debe quedar en el HTML cacheado.
- **`/p/[slug]`** — un proyecto publicado, para cualquiera, servido en el
  servidor por `espacios.publicado`: sus registros enlazan a las fichas vivas.
  `noindex`; el nombre de firma se declara no verificado. Denunciar o retirar
  una página ajena es decisión abierta (`docs/DECISIONES.md`).
- **«Guardar»** en cada ficha (`AccionesFicha`, `AccionesProceso`): en la
  bandeja o directo a un proyecto.
- **La portada** explica para qué sirve la cuenta (`app/page.tsx`).

La sincronización de lo seguido (`sincronizarSeguidos`, `reflejarSeguidos`,
`salir`) tiene su prueba sin red: `node supabase/pruebas/sincronizar_seguidos.cjs`
(12 casos, `FALLOS: 0`), que toca la lista **mientras** la sincronización
espera a la red. ✅ Reproduce el fallo de la versión anterior (un «Seguir»
pulsado durante la primera sincronización se perdía) y pasa con la actual.

## 4. Alertas

Lo que el lector sigue vive en su cuenta y «qué cambió desde tu última
visita» se calcula igual que antes (`/api/seguimiento` compara la huella con
el origen), en cualquier dispositivo en que entre. **Enviar** el aviso —correo
o push— es decisión abierta del dueño (`docs/DECISIONES.md`): exige un
trabajo programado que lea las fuentes, una credencial de servicio fuera de la
app y un remitente de correo o claves de web-push.

## 5. Aplicar — solo con aprobación del dueño

La migración **no se aplica** sin que el dueño lo diga. Los pasos, en orden:

1. Aplicar, en orden, `supabase/migrations/20260928120000_espacios.sql` y
   `20260928120100_democracia_secretos_rls.sql` al proyecto `Transac`
   (`amuyclnyjyhigeyhuufs`). Las dos son re-ejecutables.
2. Supabase → Project Settings → Data API → **Exposed schemas**: añadir
   `espacios` junto a `public` y `democracia`. Sin eso, el API responde
   `PGRST106` y las pantallas de cuenta dicen que el espacio aún no está
   abierto.
3. Comprobar: `select espacios.publicado('no-existe')` devuelve `null` como
   `anon`; como `authenticated`, `select democracia.hash_cedula('00100000001')
   is not null` sigue siendo `true` (el voto no se rompió); los avisos de
   seguridad de Supabase no marcan tablas de `espacios` ni `democracia`.

4. La conversación (§6), con aprobación aparte:
   - aplicar `20260928140000_conversacion.sql`;
   - nombrar a quien modera con `insert into espacios.moderadores (usuario)
     select id from auth.users where lower(email) = '<correo del dueño>'`.
     Se corre a mano y no va en la migración, para que ningún correo quede en
     el repositorio;
   - recargar el caché de PostgREST (`notify pgrst, 'reload schema'`) para
     que las funciones nuevas respondan enseguida;
   - comprobar que `select espacios.comunidad('destacado', 5, 0)` devuelve
     `[]` como `anon`.

Mientras 1 y 2 no estén hechos, todo lo demás funciona: la portada, las
fichas y «Seguir» en el navegador. `/cuenta` permite entrar (Auth ya
existe) y `/espacio` dice que los proyectos se abren pronto, sin romper.

**Estado (2026-09-28):**
- ✅ Paso 1, con aprobación del dueño: las dos migraciones aplicadas a
  `Transac` (`espacios`, `democracia_secretos_rls`). Comprobado en vivo: las
  siete tablas de `espacios` con RLS y sin ningún permiso para `anon`;
  `democracia.secretos` con RLS encendida y no forzada; `hash_cedula` responde;
  `democracia.registrar_votante` como `authenticated`, dentro de una
  transacción revertida con un usuario de prueba, devuelve `registrado` (el voto
  sigue funcionando); `mi_correo()` y `mis_invitaciones()` responden. Los
  avisos de seguridad no marcan nada de `espacios`; el único cambio es un aviso
  informativo esperado («RLS sin políticas» en `democracia.secretos`: es la
  cerradura).
- ✅ Paso 2 (2026-09-28): `espacios` expuesto en el Data API. El dueño lo
  marcó en el panel dos veces y **el guardado no llegó al servidor**:
  `authenticator` seguía con la lista vieja 7 minutos después. Con su
  autorización se aplicó por SQL, que es lo mismo que escribe el panel:
  `alter role authenticator set pgrst.db_schemas = 'public, storage,
  graphql_public, democracia, espacios'` y `notify pgrst, 'reload config'`.
  Comprobado en vivo:
  - `comunidad`, `publicado` y `hilo` responden 200 a `anon`;
  - `anon` recibe 42501 al leer cualquier tabla de `espacios` y al llamar a
    `comentar` o `mi_cedula`;
  - `democracia.agregados_publicos` y Storage (1.77.5) siguen igual;
  - en producción, `/comunidad` pasó de «abre pronto» a «Todavía no hay
    conversaciones».

  ⚠️ El panel muestra otra lista (sin `storage`, que el panel ya no ofrece).
  Si alguien guarda esa página con una lista sin `espacios`, cuentas y
  conversación vuelven a «abre pronto». La comprobación es `select rolconfig
  from pg_roles where rolname = 'authenticator'`.
- ✅ Paso 4, con aprobación del dueño (2026-09-28): `conversacion` aplicada a
  `Transac`. Comprobado en vivo:
  - las ocho tablas nuevas con RLS y cero permisos;
  - `anon` no ejecuta `comentar` y sí `comunidad`;
  - `authenticated` no lee `mi_cedula`;
  - la regla de proceso acepta `%20` y rechaza `%41`;
  - la de institución acepta `/instituciones/635` y rechaza
    `/instituciones/635-inapa`.

  Un recorrido entero en una transacción revertida, con dos usuarios de
  prueba, pasó: comentar con cédula, «Importa» y voto de comentario sin
  cédula, lectura anónima del hilo y del feed, retiro por moderación con su
  contador y su registro. Después, cero filas de prueba.
  - Moderador nombrado a mano: la cuenta del dueño (1 fila en
    `espacios.moderadores`).
  - `notify pgrst, 'reload schema'` enviado.
  - Los avisos de seguridad de `espacios` son los esperados: «RLS sin
    políticas» (las tablas se tocan solo por funciones) y funciones
    definidoras ejecutables, que son exactamente la superficie de la app.

- ⚠️ Paso 5, **pendiente de aprobación**: el caso (§7). Aplicar
  `20260928160000_caso.sql` a `Transac`, `notify pgrst, 'reload schema'`, y
  comprobar como `anon` que `select espacios.publicado('no-existe')` sigue
  en `null` y que `guardar_narrativa` da 42501. **Va antes del despliegue**:
  la mesa y la bandeja ya piden `fecha, x, y` y `enlaces.tipo`. Sin la
  migración, `traducir` lee el 42703 como «aún no abierto» y no como caída,
  pero guardar no funcionaría: el código no pasa a `main` antes.

  ⚠️ **Orden al re-ejecutar:** `20260928120000_espacios.sql` vuelve a dar los
  permisos de columna viejos y la `publicado` sin el caso. Quien la re-ejecute
  corre después `20260928160000_caso.sql`, siempre.

## 6. La conversación

Decisión del dueño (2026-09-28, docs/DECISIONES.md): cada registro con ficha
propia y cada investigación publicada tiene una conversación, y `/comunidad`
es su feed. Migración `supabase/migrations/20260928140000_conversacion.sql`,
en el mismo esquema `espacios`: es de lo que pone el lector, no del Estado.

**Quién puede qué.**
- **Leer**: cualquiera, sin cuenta, por dos funciones públicas: `hilo(tipo,
  ref)` y `comunidad(orden, límite, página)`. Devuelven lo visible con el
  nombre de firma; nunca ids de usuario, correos ni cédulas. La conversación
  de una investigación retirada no se lee.
- **Escribir texto público** —un comentario, o el título con que se abre una
  conversación— solo quien registró su cédula (una fila en
  `democracia.votantes`, la misma puerta del voto), firma con nombre y aceptó
  las normas (`perfiles.normas`, `components/espacios/normas.ts`, publicadas
  en `/comunidad/normas`). Todo pasa por `exigir_autoria`.
- **Votar**: cualquier cuenta con correo verificado, sobre una conversación
  ya abierta. «Importa» es un voto solo a favor sobre el registro
  (`votar_hilo`); los comentarios se votan arriba o abajo
  (`votar_comentario`); lo propio no se vota. Si nadie abrió la conversación,
  el primer voto la abre, y eso pide cédula. La ficha lo dice junto al botón
  antes del toque.
- ⚠️ **Límite de la cédula.** Hoy el registro de la cédula comprueba el
  dígito verificador y que nadie más la usó, no la coteja con la JCE; eso
  llega con Cuenta Única (PLAN-DEMOCRACIA §9). `/comunidad/normas` lo dice.

**Cómo se hace cumplir.** Nadie escribe en una tabla. Las ocho tablas
(`hilos`, `comentarios`, `votos_hilo`, `votos_comentario`, `denuncias`,
`moderadores`, `suspensiones`, `acciones_moderacion`) tienen RLS sin políticas
y ningún permiso. Todo pasa por funciones definidoras, que aplican las reglas:
- cédula, nombre y normas para escribir;
- correo verificado y sin suspensión para votar y denunciar;
- **por la huella de la cédula** (`mi_cedula`, que no sale de la base):
  - suspensión: quien borra su registro de votante y vuelve con otra cuenta y
    la misma cédula sigue suspendido;
  - ritmo: 5 comentarios en 10 minutos y 40 al día;
  - 20 conversaciones nuevas al día;
- por cuenta: 120 votos «Importa» por hora y 30 denuncias al día;
- como mucho 3 enlaces por comentario;
- no responder a lo que no está visible.

La huella (el HMAC con clave de `democracia.hash_cedula`, nunca la cédula) se
guarda en `comentarios.cedula` y `hilos.abierto_cedula` **90 días**. Sirve
para el ritmo y para que `suspender` alcance la cédula de quien borró su
registro de votante antes de ser suspendido: toma la huella de lo último que
escribió. `suspensiones.cedula` dura lo que la suspensión. `olvidar_huellas`
vacía lo vencido cada vez que alguien comenta o se suspende a alguien; no
hace falta un trabajo programado, y una fila puede pasar de los 90 días
hasta la próxima de esas llamadas. ⚠️ Un registro de votante borrado (Ley
172-13) deja sus huellas en la conversación hasta ese plazo; `/cuenta` lo
dice.

**Los contadores los llevan disparadores** (`contar_voto_comentario`,
`contar_voto_hilo`, `contar_comentario`), por incremento y bajo el candado de
la fila. Son exactos con votos simultáneos y cuando se borra una cuenta, que
arrastra sus votos y comentarios. Las respuestas de otros a un comentario
borrado quedan sueltas (`padre on delete set null`), no se pierden. Un voto
no reaviva una conversación: la actividad es de lo que se escribe, así que
votar y retirar en bucle no la sube en «Destacado».

**La clave de un hilo es la ruta canónica de su ficha.** Se cumple `ref =
href`, y `ruta_de_tipo` exige la forma exacta que produce `enlace` en
`lib/grafo.ts` con el identificador del registro: `/instituciones/635`, no
`/instituciones/635-inapa`; `/proveedores/7`, no `/proveedores/007`. Así
nadie abre la conversación de «un proceso» que lleva a otra página, y un
registro no se parte en dos conversaciones si cambia de nombre. Sentencias,
documentos, datos y búsquedas no tienen ficha propia, así que no tienen
conversación. Una investigación que cambia de dirección se lleva su
conversación y sus denuncias pendientes; una que se borra, la borra (otro
proyecto no hereda comentarios ajenos con el slug). ⚠️ Eso quiere decir que
quien publicó una investigación puede, al borrarla, hacer desaparecer los
comentarios de otros sobre ella sin pasar por moderación: es su obra, y la
conversación va con ella.

**Moderación posterior.**
- Cualquier cuenta verificada puede denunciar. Tres denuncias de personas
  distintas **con cédula registrada** ocultan un comentario o un hilo hasta
  que un moderador decida en `/espacio/moderar` (`cola_moderacion`,
  `moderar`, `retitular`, `suspender`). Tres correos desechables no ocultan
  nada.
- Un título falso u ofensivo se corrige (`retitular`) sin cerrar la
  conversación del registro, y quien la abrió se puede suspender desde la
  cola.
- Cada decisión cierra sus denuncias y queda en `acciones_moderacion` con
  quién, qué y la nota.
- Lo retirado se muestra como retirado, sin texto, para que sus respuestas
  conserven el sitio.
- Quien escribe puede borrar lo suyo: el texto se vacía de verdad.
- Los moderadores se añaden a mano (paso 4 de §5): la app no tiene forma de
  nombrarlos.

**Dónde vive.**
- `components/espacios/conversacion.tsx`, al final de las fichas de proceso,
  norma, iniciativa, expediente del Senado, legislador, proveedor,
  institución y obra, y en `/p/[slug]`.
  - No carga nada hasta que el lector se acerca (IntersectionObserver).
  - Sin sesión lee por HTTP (`leerHilo` en `lib/espacios.ts`), sin
    supabase-js.
  - Distingue sus tres estados: vacío, «no se pudo mirar» (también si falla
    la lectura del estado del lector) y «abre pronto» (`PGRST106`,
    `PGRST202`, `42883`).
- `components/espacios/voto-hilo.tsx` es el voto «Importa».
- `/comunidad` es el feed, leído en el servidor con 30 s de caché. Tiene tres
  órdenes:
  - Destacado: `(votos + 2·comentarios) / (horas desde la última actividad +
    2)^1,5`, como Hacker News. Una conversación vacía no puntúa.
  - Nuevo.
  - Más votado.

  Desempata por la clave, para que las páginas no se solapen.
- La portada muestra las cinco destacadas desde el navegador
  (`conversaciones-vivas.tsx`), y solo cuando el lector se acerca. La portada
  no lee la base. Mientras la conversación no esté abierta, esa sección no se
  pinta, ni siquiera como silueta.

✅ Probado el 2026-09-28 con `supabase/pruebas/conversacion_rls.py`: 130
casos.
- Recorre la conversación desde siete lugares: quien registró su cédula,
  quien solo tiene cuenta, correos desechables, un correo sin confirmar, una
  cuenta suspendida y su cuenta nueva con la misma cédula, la moderadora y
  `anon`.
- Las tres migraciones se aplicaron dos veces.
- Cubre los hallazgos de la revisión del mismo día: hilos abiertos por
  desechables, suspensión esquivada, denuncias de desechables, contadores al
  borrar una cuenta, slug reutilizado, rutas no canónicas; y los de la
  segunda revisión: códigos de proceso con espacios y tildes (el 12 % de los
  77 790 de la instantánea, comprobados todos contra la regla), suspensión
  después de borrar el registro de votante, votar y retirar en bucle, olvido
  de huellas a los 90 días, denuncias que siguen a una investigación que
  cambia de dirección.
- `FALLOS: 0`.

## 7. El caso

Una investigación se trabaja como caso, con cuatro vistas de los mismos
registros (`components/espacios/caso.tsx`, migración
`20260928160000_caso.sql`):

| Vista | Qué es | Pieza |
|---|---|---|
| Tablero | Tarjetas que el investigador pone donde le sirven; flechas con su verbo | `tablero.tsx` (React Flow), cargado aparte (`tablero-diferido.tsx`) |
| Línea de tiempo | Los registros con fecha, por año | `linea-tiempo.tsx` (sin «use client»: `/p` la pinta en el servidor) |
| Evidencia | El cuadro que se ordena y filtra; en el teléfono, fichas | `evidencia.tsx` (TanStack Table v8) |
| Narración | Texto con citas `@registro` que se guarda solo | `narracion.tsx` (Tiptap); para leer, `narrativa-lectura.tsx` |

Lo que hay que saber antes de tocarlo:

- **Nada del Estado entra.** La fecha la anota el investigador —cuándo pasó
  lo que le importa— y la pantalla lo dice; no se copia de la ficha. La
  posición en el tablero y el verbo de un enlace son suyos.
- **El verbo es un vocabulario cerrado** (`TIPOS_ENLACE` en `lib/espacios.ts`,
  el mismo `check` de `enlaces.tipo`). Dos registros pueden unirse con varios
  verbos, no dos veces con el mismo. Un verbo nuevo va en los dos sitios.
- **La narración solo se escribe por `espacios.guardar_narrativa`**, con la
  versión que se leyó: si otra persona guardó antes devuelve `null` y la
  pantalla ofrece traer la suya o guardar encima. Sin permiso de columna, un
  `update` directo no pasa. Tope: 200 000 bytes (el cliente corta en 180 000).
  ✅ Probado: `puede_editar` devuelve `null`, no `false`, para quien no es
  miembro; la función usa `coalesce` (una extraña guardó en la primera
  versión de la prueba).
- **La narración se pinta sin confiar en ella**: lista blanca de nodos y
  marcas, elementos de React, profundidad 24. Una mención guarda solo el id
  de la entrada; título y enlace salen del registro vivo del caso. Sin
  enlaces libres (`link: false` en el editor).
- **Mover una tarjeta no «actualiza»** la investigación: el disparador de
  `entradas.actualizado` mira título, nota y fecha, no `x`/`y`.
- **El tablero no importa Supabase**: guardar es de quien lo monta. En `/p`
  va de solo lectura; todo lo que dice está también en las listas, que se
  leen sin JavaScript.
- **Exportar** es FollowTheMoney (`lib/ftm.ts`): cada registro como la
  entidad de su tipo y cada enlace como `UnknownLink` con el verbo en `role`.
  Los esquemas se comprobaron contra el repositorio de FtM el 2026-09-28.
- ✅ Visto en Chromium a 1280 y 390 px con datos de prueba: arrastrar,
  elegir, panel, fechas, cuadro apilado, `@` con su menú y el guardado con
  versión.

