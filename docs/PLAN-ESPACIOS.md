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

- **`/cuenta`** — entrar o crear la cuenta con el código de seis dígitos que
  llega al correo (`lib/sesion.ts`, la misma lectura tolerante de enlaces y
  códigos que `/democracia/registro`), el nombre con que firma, salir, y qué se
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

Mientras 1 y 2 no estén hechos, todo lo demás funciona: la portada, las
fichas y «Seguir» en el navegador. `/cuenta` permite entrar (Auth ya
existe) y `/espacio` dice que los proyectos se abren pronto, sin romper.
