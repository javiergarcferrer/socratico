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
| `invitaciones` | Una invitación **a un correo**; quien entra con ese correo la acepta (`aceptar_invitaciones()`). No se envía ningún correo: quien invita comparte la dirección de la plataforma. |
| `entradas` | Un registro guardado. Sin proyecto, es la bandeja «Guardado». Con proyecto, pertenece al proyecto y cualquiera con permiso de edición lo anota. `href` solo admite una ruta propia (`/…`) o `https://`. |
| `enlaces` | Dos registros del mismo proyecto unidos por una nota («la adjudicó», «la firma»). Un disparador impide cruzar proyectos. |
| `seguimientos` | Lo que sigue, con su huella: la misma forma que `Seguido`. Es lo que viaja entre dispositivos. |

Permisos: `rol_en(p)` responde `dueno`, `editor`, `lector` o nada para
`auth.uid()`; `puede_leer` y `puede_editar` salen de ahí. Publicar,
despublicar o cambiar el dueño es solo del dueño (disparador). Topes por
cuenta (200 proyectos, 5000 guardados, 1000 seguidos) y por proyecto (2000
registros, 5000 enlaces, 50 invitaciones pendientes). Endurece de paso
`democracia.secretos` (RLS encendida, sin políticas).

✅ Probado el 2026-09-28 con `supabase/pruebas/espacios_rls.py` sobre un
Postgres desechable que simula `auth`: 44 casos desde el dueño, una editora
invitada, una extraña con cuenta y `anon`, con la migración aplicada dos
veces. La prueba encontró y corrigió dos fallos antes de que existieran en
vivo: el tope leía `new.proyecto` en la tabla de proyectos, y `insert …
returning` de un proyecto nuevo lo negaba la política de lectura.

## 3. Pantallas

- **`/cuenta`** — entrar o crear la cuenta con el código de seis dígitos que
  llega al correo (`lib/sesion.ts`, la misma lectura tolerante de enlaces y
  códigos que `/democracia/registro`), el nombre con que firma, salir, y qué se
  guarda y qué no. Al entrar acepta las invitaciones al correo y sube lo que el
  navegador ya seguía.
- **`/espacio`** — el espacio: qué cambió en lo que sigues, los proyectos
  (propios y compartidos), lo guardado suelto e invitaciones.
- **`/espacio/proyecto?id=`** — la mesa de trabajo de una investigación: sus
  registros con notas, los enlaces entre ellos, quién colabora, invitar,
  publicar. Por parámetro y no por ruta dinámica: es una página de cliente y
  un id de proyecto no debe quedar en el HTML cacheado.
- **`/p/[slug]`** — un proyecto publicado, para cualquiera, servido en el
  servidor por `espacios.publicado`: sus registros enlazan a las fichas vivas.
- **«Guardar»** en cada ficha (`AccionesFicha`, `AccionesProceso`): en la
  bandeja o directo a un proyecto.
- **La portada** explica para qué sirve la cuenta (`app/page.tsx`).

## 4. Alertas

Lo que el lector sigue vive en su cuenta y «qué cambió desde tu última
visita» se calcula igual que antes (`/api/seguimiento` compara la huella con
el origen), en cualquier dispositivo en que entre. **Enviar** el aviso —correo
o push— es decisión abierta del dueño (`docs/DECISIONES.md`): exige un
trabajo programado que lea las fuentes, una credencial de servicio fuera de la
app y un remitente de correo o claves de web-push.

## 5. Aplicar — solo con aprobación del dueño

La migración **no se aplica** sin que el dueño lo diga. Los pasos, en orden:

1. Aplicar `supabase/migrations/20260928120000_espacios.sql` al proyecto
   `Transac` (`amuyclnyjyhigeyhuufs`). Es re-ejecutable.
2. Supabase → Project Settings → Data API → **Exposed schemas**: añadir
   `espacios` junto a `public` y `democracia`. Sin eso, el API responde
   `PGRST106` y las pantallas de cuenta dicen que el espacio aún no está
   abierto.
3. Comprobar: `select espacios.publicado('no-existe')` devuelve `null` como
   `anon`; los avisos de seguridad de Supabase no marcan tablas de `espacios`.

Mientras 1 y 2 no estén hechos, todo lo demás funciona: la portada, las
fichas y «Seguir» en el navegador. `/cuenta` permite entrar (Auth ya
existe) y `/espacio` dice que los proyectos se abren pronto, sin romper.
