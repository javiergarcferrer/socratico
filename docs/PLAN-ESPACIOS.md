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
  `mi_correo()` lo ve confirmado, así que las invitaciones siguen casando. El nombre con que firma, salir, y qué se
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
- ❌ Paso 2, pendiente del dueño: el API responde `PGRST106` («Only the
  following schemas are exposed: public, storage, graphql_public,
  democracia»). Hasta que se añada `espacios`, las pantallas de cuenta dicen
  que los proyectos aún no están abiertos.

## 6. La conversación

Decisión del dueño (2026-09-28, docs/DECISIONES.md): cada registro con ficha
propia y cada investigación publicada tiene una conversación, y `/comunidad`
es su feed. Migración `supabase/migrations/20260928140000_conversacion.sql`,
en el mismo esquema `espacios`: es de lo que pone el lector, no del Estado.

**Quién puede qué.**
- **Leer**: cualquiera, sin cuenta, por dos funciones públicas: `hilo(tipo,
  ref)` y `comunidad(orden, límite, página)`. Devuelven lo visible con el
  nombre de firma; nunca ids de usuario, correos ni cédulas.
- **Votar**: cualquier cuenta con correo verificado. «Importa» es un voto solo
  a favor sobre el registro (`votar_hilo`); los comentarios se votan arriba o
  abajo (`votar_comentario`); lo propio no se vota.
- **Comentar**: solo quien registró su cédula (una fila en
  `democracia.votantes`, la misma puerta del voto). Además tiene que firmar
  con nombre y haber aceptado las normas (`perfiles.normas`,
  `components/espacios/normas.ts`, publicadas en `/comunidad/normas`).
- ⚠️ **Límite de la cédula.** Hoy el registro de la cédula comprueba el
  dígito verificador y que nadie más la usó, no la coteja con la JCE; eso
  llega con Cuenta Única (PLAN-DEMOCRACIA §9). `/comunidad/normas` lo dice.

**Cómo se hace cumplir.** Nadie escribe en una tabla. Las ocho tablas
(`hilos`, `comentarios`, `votos_hilo`, `votos_comentario`, `denuncias`,
`moderadores`, `suspensiones`, `acciones_moderacion`) tienen RLS sin políticas
y ningún permiso. Todo pasa por funciones definidoras, que aplican las reglas:
- cédula, nombre y normas;
- suspensión;
- ritmo: 5 comentarios en 10 minutos y 40 al día; 120 votos «Importa» por
  hora; 30 denuncias al día;
- como mucho 3 enlaces por comentario;
- no responder a lo que no está visible.

**La clave de un hilo es la ruta de su ficha.** Se cumple `ref = href`, y
`ruta_de_tipo` exige el prefijo que le toca a cada tipo en `lib/grafo.ts`: un
«proceso» es `/procesos/…`. Sentencias, documentos, datos y búsquedas no
tienen ficha propia, así que no tienen conversación. El título lo pone quien
abre la conversación, desde la ficha; si es falso, se denuncia y se retira.

**Moderación posterior.**
- Tres denuncias de cuentas distintas ocultan un comentario o un hilo hasta
  que un moderador decida en `/espacio/moderar` (`cola_moderacion`,
  `moderar`, `suspender`).
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
  - Sin sesión lee por HTTP (`leerHilo` en `lib/espacios.ts`), sin supabase-js.
- `components/espacios/voto-hilo.tsx` es el voto «Importa».
- `/comunidad` es el feed, leído en el servidor con 30 s de caché. Tiene tres
  órdenes:
  - Destacado: `(votos + 2·comentarios + 1) / (horas desde la última
    actividad + 2)^1,5`, como Hacker News.
  - Nuevo.
  - Más votado.
- La portada muestra las cinco destacadas desde el navegador
  (`conversaciones-vivas.tsx`). La portada no lee la base, y mientras la
  conversación no esté abierta esa sección no se pinta.

✅ Probado el 2026-09-28 con `supabase/pruebas/conversacion_rls.py`: 82
casos, desde quien registró su cédula, quien solo tiene cuenta, un correo sin
confirmar, una cuenta suspendida, la moderadora y `anon`. Las tres
migraciones se aplicaron dos veces. `FALLOS: 0`.
