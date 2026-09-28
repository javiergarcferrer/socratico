-- Espacios del lector: cuenta, lo guardado, proyectos de investigación con sus
-- enlaces y notas, colaboración, publicación y lo que sigue (docs/PLAN-ESPACIOS.md).
--
-- Contrato (CLAUDE.md, la invariante; decisión del dueño 2026-09-28):
--  · ningún dato del Estado entra aquí: una entrada es una REFERENCIA (tipo,
--    identificador, título, enlace, huella); la cifra se sigue leyendo del origen;
--  · RLS en cada tabla; la app solo lleva la clave publicable;
--  · `anon` no toca ninguna tabla: un proyecto publicado se lee por una sola
--    función (`espacios.publicado`) que devuelve exactamente lo publicable.
--
-- Idempotente: se puede volver a correr sin romper nada.

create schema if not exists espacios;
grant usage on schema espacios to anon, authenticated;

-- ─────────────────────────────────────────────── tipos de registro que se guardan
-- Los mismos nombres que `TIPOS_ENTRADA` en lib/espacios.ts (y, para lo que
-- se sigue, que `TIPOS_SEGUIDO` en lib/seguimiento.ts).
create or replace function espacios.tipo_valido(t text)
returns boolean language sql immutable set search_path = '' as $$
  select t in (
    'institucion', 'proveedor', 'proceso', 'norma', 'proyecto', 'expediente-senado',
    'legislador', 'sentencia', 'obra', 'capitulo', 'documento', 'dato', 'cargo', 'busqueda'
  );
$$;

-- Un enlace guardado: una ruta de esta plataforma o, si `externo`, un
-- documento `https://` en el sitio de una institución. Lo mismo que
-- `hrefValido` y `rutaPropia` en lib/espacios.ts.
create or replace function espacios.href_valido(h text, externo boolean)
returns boolean language sql immutable set search_path = '' as $$
  select char_length(h) <= 1000
     and h !~ '[[:space:][:cntrl:]\\]'
     and (h ~ '^/([^/]|$)' or (externo and h ~* '^https://[a-z0-9.-]+(:[0-9]+)?(/|$)'));
$$;

-- ─────────────────────────────────────────────── tablas
create table if not exists espacios.perfiles (
  id      uuid primary key references auth.users (id) on delete cascade,
  nombre  text not null check (char_length(btrim(nombre)) between 1 and 80),
  creado  timestamptz not null default now()
);

create table if not exists espacios.proyectos (
  id           uuid primary key default gen_random_uuid(),
  dueno        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titulo       text not null check (char_length(btrim(titulo)) between 1 and 140),
  descripcion  text not null default '' check (char_length(descripcion) <= 5000),
  publico      boolean not null default false,
  -- La dirección pública (/p/<slug>). Solo existe mientras está publicado.
  slug         text unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 90),
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now(),
  check (not publico or slug is not null)
);
create index if not exists proyectos_dueno on espacios.proyectos (dueno);

create table if not exists espacios.miembros (
  proyecto  uuid not null references espacios.proyectos (id) on delete cascade,
  usuario   uuid not null references auth.users (id) on delete cascade,
  rol       text not null check (rol in ('editor', 'lector')),
  creado    timestamptz not null default now(),
  primary key (proyecto, usuario)
);
create index if not exists miembros_usuario on espacios.miembros (usuario);

-- Una invitación es a un correo: quien entra con ese correo la acepta
-- (`espacios.aceptar_invitacion`, una a una y por decisión suya). No se envía ningún correo desde aquí.
create table if not exists espacios.invitaciones (
  id            uuid primary key default gen_random_uuid(),
  proyecto      uuid not null references espacios.proyectos (id) on delete cascade,
  email         text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  rol           text not null check (rol in ('editor', 'lector')),
  invitado_por  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  creado        timestamptz not null default now()
);
create unique index if not exists invitaciones_unica on espacios.invitaciones (proyecto, lower(email));

-- Lo guardado. Sin proyecto, es la bandeja personal («Guardado»).
create table if not exists espacios.entradas (
  id           uuid primary key default gen_random_uuid(),
  usuario      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  proyecto     uuid references espacios.proyectos (id) on delete cascade,
  tipo         text not null check (espacios.tipo_valido(tipo)),
  ref          text not null check (char_length(ref) between 1 and 300),
  titulo       text not null check (char_length(titulo) between 1 and 500),
  -- Una ruta de la plataforma o un documento en el sitio de una institución.
  -- Sin «//» ni «/\» al principio (el navegador los lee como otro sitio) y sin
  -- espacios ni caracteres de control, que el navegador quita y dejan «//».
  href         text not null check (espacios.href_valido(href, true)),
  nota         text not null default '' check (char_length(nota) <= 5000),
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now()
);
create unique index if not exists entradas_en_proyecto on espacios.entradas (proyecto, tipo, ref) where proyecto is not null;
create unique index if not exists entradas_sueltas on espacios.entradas (usuario, tipo, ref) where proyecto is null;
create index if not exists entradas_proyecto on espacios.entradas (proyecto);

-- Un enlace entre dos registros del mismo proyecto, con lo que los une.
create table if not exists espacios.enlaces (
  id          uuid primary key default gen_random_uuid(),
  proyecto    uuid not null references espacios.proyectos (id) on delete cascade,
  desde       uuid not null references espacios.entradas (id) on delete cascade,
  hasta       uuid not null references espacios.entradas (id) on delete cascade,
  nota        text not null default '' check (char_length(nota) <= 1000),
  creado_por  uuid default auth.uid() references auth.users (id) on delete set null,
  creado      timestamptz not null default now(),
  check (desde <> hasta),
  unique (desde, hasta)
);
create index if not exists enlaces_proyecto on espacios.enlaces (proyecto);

-- Lo que el lector sigue, para verlo en cualquier dispositivo: la misma forma
-- que `Seguido` en lib/seguimiento.ts. La huella es el estado en palabras.
create table if not exists espacios.seguimientos (
  usuario  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo     text not null check (tipo in ('proceso', 'proyecto', 'expediente-senado', 'proveedor', 'institucion', 'norma')),
  ref      text not null check (char_length(ref) between 1 and 300),
  titulo   text not null check (char_length(titulo) between 1 and 500),
  href     text not null check (espacios.href_valido(href, false)),
  huella   text check (char_length(huella) <= 500),
  desde    timestamptz not null default now(),
  visto    timestamptz,
  primary key (usuario, tipo, ref)
);

-- ─────────────────────────────────────────────── quién puede qué (definidor)
-- SECURITY DEFINER para que las políticas no se llamen a sí mismas en bucle
-- (proyectos ↔ miembros). Solo responden sobre `auth.uid()`.
create or replace function espacios.rol_en(p uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null then null
    when exists (select 1 from espacios.proyectos where id = p and dueno = auth.uid()) then 'dueno'
    else (select rol from espacios.miembros where proyecto = p and usuario = auth.uid())
  end;
$$;

create or replace function espacios.puede_leer(p uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select espacios.rol_en(p) is not null;
$$;

create or replace function espacios.puede_editar(p uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select espacios.rol_en(p) in ('dueno', 'editor');
$$;

-- ─────────────────────────────────────────────── disparadores
create or replace function espacios.tocar_actualizado()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.actualizado := now();
  return new;
end;
$$;

drop trigger if exists proyectos_actualizado on espacios.proyectos;
create trigger proyectos_actualizado before update on espacios.proyectos
  for each row execute function espacios.tocar_actualizado();
drop trigger if exists entradas_actualizado on espacios.entradas;
create trigger entradas_actualizado before update on espacios.entradas
  for each row execute function espacios.tocar_actualizado();

-- El dueño no cambia nunca: pasarle un proyecto publicado a otra cuenta lo
-- firmaría con un nombre que no lo escribió. Publicar o retirar es solo del
-- dueño; un editor edita el contenido, no quién lo ve.
create or replace function espacios.guardar_publicacion()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.dueno is distinct from old.dueno then
    raise exception 'un proyecto no cambia de dueño' using errcode = '42501';
  end if;
  if (new.publico is distinct from old.publico or new.slug is distinct from old.slug)
     and old.dueno is distinct from auth.uid() then
    raise exception 'solo quien creó el proyecto puede publicarlo' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists proyectos_publicacion on espacios.proyectos;
create trigger proyectos_publicacion before update on espacios.proyectos
  for each row execute function espacios.guardar_publicacion();

-- Un enlace une dos registros de SU proyecto; nunca cruza proyectos.
create or replace function espacios.enlace_mismo_proyecto()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from espacios.entradas where id = new.desde and proyecto = new.proyecto)
     or not exists (select 1 from espacios.entradas where id = new.hasta and proyecto = new.proyecto) then
    raise exception 'un enlace une dos registros del mismo proyecto' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists enlaces_mismo_proyecto on espacios.enlaces;
create trigger enlaces_mismo_proyecto before insert or update on espacios.enlaces
  for each row execute function espacios.enlace_mismo_proyecto();

-- Topes: una cuenta no es un almacén. Se dicen en la interfaz antes de llegar.
-- Una rama por tabla: PL/pgSQL resuelve `new.<campo>` al evaluar, y un campo
-- que la tabla no tiene rompe la inserción aunque la condición no lo necesite.
create or replace function espacios.topes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'proyectos' then
    if (select count(*) from espacios.proyectos where dueno = new.dueno) >= 200 then
      raise exception 'tope de 200 proyectos por cuenta' using errcode = '54000';
    end if;
  elsif tg_table_name = 'entradas' then
    if new.proyecto is not null then
      if (select count(*) from espacios.entradas where proyecto = new.proyecto) >= 2000 then
        raise exception 'tope de 2000 registros por proyecto' using errcode = '54000';
      end if;
    elsif (select count(*) from espacios.entradas where usuario = new.usuario and proyecto is null) >= 5000 then
      raise exception 'tope de 5000 registros guardados' using errcode = '54000';
    end if;
  elsif tg_table_name = 'enlaces' then
    if (select count(*) from espacios.enlaces where proyecto = new.proyecto) >= 5000 then
      raise exception 'tope de 5000 enlaces por proyecto' using errcode = '54000';
    end if;
  elsif tg_table_name = 'seguimientos' then
    -- Un upsert sobre una fila que ya existe también pasa por aquí (BEFORE
    -- INSERT): marcar «visto» con mil piezas seguidas no es una pieza más.
    if not exists (select 1 from espacios.seguimientos where usuario = new.usuario and tipo = new.tipo and ref = new.ref)
       and (select count(*) from espacios.seguimientos where usuario = new.usuario) >= 1000 then
      raise exception 'tope de 1000 piezas seguidas' using errcode = '54000';
    end if;
  elsif tg_table_name = 'invitaciones' then
    if (select count(*) from espacios.invitaciones where proyecto = new.proyecto) >= 50 then
      raise exception 'tope de 50 invitaciones pendientes por proyecto' using errcode = '54000';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists proyectos_topes on espacios.proyectos;
create trigger proyectos_topes before insert on espacios.proyectos for each row execute function espacios.topes();
drop trigger if exists entradas_topes on espacios.entradas;
create trigger entradas_topes before insert on espacios.entradas for each row execute function espacios.topes();
drop trigger if exists enlaces_topes on espacios.enlaces;
create trigger enlaces_topes before insert on espacios.enlaces for each row execute function espacios.topes();
drop trigger if exists seguimientos_topes on espacios.seguimientos;
create trigger seguimientos_topes before insert on espacios.seguimientos for each row execute function espacios.topes();
drop trigger if exists invitaciones_topes on espacios.invitaciones;
create trigger invitaciones_topes before insert on espacios.invitaciones for each row execute function espacios.topes();

-- El correo **verificado** de quien pregunta, de `auth.users` y no del JWT:
-- el pool de Auth se comparte con otra app, y un reclamo de correo sin
-- confirmar no puede abrir la invitación dirigida a esa dirección.
create or replace function espacios.mi_correo()
returns text language sql stable security definer set search_path = '' as $$
  select lower(email) from auth.users where id = auth.uid() and email_confirmed_at is not null;
$$;

-- ─────────────────────────────────────────────── RLS
alter table espacios.perfiles     enable row level security;
alter table espacios.proyectos    enable row level security;
alter table espacios.miembros     enable row level security;
alter table espacios.invitaciones enable row level security;
alter table espacios.entradas     enable row level security;
alter table espacios.enlaces      enable row level security;
alter table espacios.seguimientos enable row level security;

-- perfiles: el propio. Los nombres de quien colabora salen por `espacios.miembros_de`.
drop policy if exists perfil_propio on espacios.perfiles;
create policy perfil_propio on espacios.perfiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- proyectos
drop policy if exists proyecto_leer on espacios.proyectos;
-- `dueno = auth.uid()` va escrito aquí y no solo dentro de `puede_leer`: al
-- crear un proyecto y leerlo en la misma sentencia (`insert … returning`,
-- lo que hace supabase-js con `.select()`), la función definidora todavía no
-- ve la fila nueva y la lectura se negaba.
create policy proyecto_leer on espacios.proyectos
  for select to authenticated using (dueno = auth.uid() or espacios.puede_leer(id));
drop policy if exists proyecto_crear on espacios.proyectos;
create policy proyecto_crear on espacios.proyectos
  for insert to authenticated with check (dueno = auth.uid());
drop policy if exists proyecto_editar on espacios.proyectos;
create policy proyecto_editar on espacios.proyectos
  for update to authenticated using (espacios.puede_editar(id)) with check (espacios.puede_editar(id));
drop policy if exists proyecto_borrar on espacios.proyectos;
create policy proyecto_borrar on espacios.proyectos
  for delete to authenticated using (dueno = auth.uid());

-- miembros: los ve quien ve el proyecto; los gestiona el dueño; cada quien puede irse.
drop policy if exists miembro_leer on espacios.miembros;
create policy miembro_leer on espacios.miembros
  for select to authenticated using (espacios.puede_leer(proyecto));
drop policy if exists miembro_cambiar on espacios.miembros;
create policy miembro_cambiar on espacios.miembros
  for update to authenticated using (espacios.rol_en(proyecto) = 'dueno') with check (espacios.rol_en(proyecto) = 'dueno');
drop policy if exists miembro_quitar on espacios.miembros;
create policy miembro_quitar on espacios.miembros
  for delete to authenticated using (espacios.rol_en(proyecto) = 'dueno' or usuario = auth.uid());
-- El alta de un miembro solo ocurre al aceptar una invitación (función definidora).

-- invitaciones: las ve y gestiona el dueño; la persona invitada ve y rechaza las suyas.
drop policy if exists invitacion_leer on espacios.invitaciones;
create policy invitacion_leer on espacios.invitaciones
  for select to authenticated
  using (espacios.rol_en(proyecto) = 'dueno' or lower(email) = espacios.mi_correo());
drop policy if exists invitacion_crear on espacios.invitaciones;
create policy invitacion_crear on espacios.invitaciones
  for insert to authenticated with check (espacios.rol_en(proyecto) = 'dueno' and invitado_por = auth.uid());
drop policy if exists invitacion_borrar on espacios.invitaciones;
create policy invitacion_borrar on espacios.invitaciones
  for delete to authenticated
  using (espacios.rol_en(proyecto) = 'dueno' or lower(email) = espacios.mi_correo());

-- entradas: las sueltas son de quien las guardó; las de un proyecto, del proyecto.
drop policy if exists entrada_leer on espacios.entradas;
create policy entrada_leer on espacios.entradas
  for select to authenticated
  using ((proyecto is null and usuario = auth.uid()) or (proyecto is not null and espacios.puede_leer(proyecto)));
drop policy if exists entrada_crear on espacios.entradas;
create policy entrada_crear on espacios.entradas
  for insert to authenticated
  with check (usuario = auth.uid() and (proyecto is null or espacios.puede_editar(proyecto)));
drop policy if exists entrada_editar on espacios.entradas;
create policy entrada_editar on espacios.entradas
  for update to authenticated
  using ((proyecto is null and usuario = auth.uid()) or (proyecto is not null and espacios.puede_editar(proyecto)))
  with check ((proyecto is null and usuario = auth.uid()) or (proyecto is not null and espacios.puede_editar(proyecto)));
drop policy if exists entrada_borrar on espacios.entradas;
create policy entrada_borrar on espacios.entradas
  for delete to authenticated
  using ((proyecto is null and usuario = auth.uid()) or (proyecto is not null and espacios.puede_editar(proyecto)));

-- enlaces
drop policy if exists enlace_leer on espacios.enlaces;
create policy enlace_leer on espacios.enlaces
  for select to authenticated using (espacios.puede_leer(proyecto));
drop policy if exists enlace_escribir on espacios.enlaces;
create policy enlace_escribir on espacios.enlaces
  for all to authenticated using (espacios.puede_editar(proyecto)) with check (espacios.puede_editar(proyecto));

-- seguimientos: solo los propios.
drop policy if exists seguimiento_propio on espacios.seguimientos;
create policy seguimiento_propio on espacios.seguimientos
  for all to authenticated using (usuario = auth.uid()) with check (usuario = auth.uid());

-- ─────────────────────────────────────────────── permisos: authenticated sí, anon no
-- Por columna donde la fila no debe cambiar de manos: el dueño de un
-- proyecto, el proyecto y el autor de una entrada o un enlace, y quién es
-- miembro no se tocan con un UPDATE (un editor no se lleva un registro a su
-- bandeja; el dueño no mete a nadie sin invitación).
revoke all on all tables in schema espacios from anon, authenticated, public;
grant select, insert, update, delete on espacios.perfiles, espacios.seguimientos to authenticated;
grant select, insert, delete on espacios.proyectos, espacios.entradas, espacios.enlaces to authenticated;
grant update (titulo, descripcion, publico, slug) on espacios.proyectos to authenticated;
grant update (titulo, nota) on espacios.entradas to authenticated;
grant update (nota) on espacios.enlaces to authenticated;
grant select, delete on espacios.miembros to authenticated;
grant update (rol) on espacios.miembros to authenticated;
grant select, insert, delete on espacios.invitaciones to authenticated;

-- ─────────────────────────────────────────────── funciones de la app
-- Las invitaciones a mi correo verificado, con lo necesario para decidir:
-- el título del proyecto, quién invita y con qué rol. Antes de aceptar no se
-- ve nada más del proyecto.
create or replace function espacios.mis_invitaciones()
returns table (id uuid, proyecto uuid, rol text, titulo text, invita text, creado timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, i.proyecto, i.rol, p.titulo,
         coalesce(pf.nombre, regexp_replace(u.email, '^(.).*(@.*)$', '\1…\2')),
         i.creado
  from espacios.invitaciones i
  join espacios.proyectos p on p.id = i.proyecto
  join auth.users u on u.id = p.dueno
  left join espacios.perfiles pf on pf.id = p.dueno
  where lower(i.email) = espacios.mi_correo()
  order by i.creado;
$$;

-- Acepta **una** invitación, la que la persona eligió: nadie entra a un
-- proyecto —ni queda con su id a la vista del dueño— sin haberlo decidido.
-- Devuelve el id del proyecto, o null si la invitación no es suya.
create or replace function espacios.aceptar_invitacion(p_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  correo text := espacios.mi_correo();
  inv record;
begin
  if auth.uid() is null or correo is null then
    return null;
  end if;
  select i.proyecto, i.rol into inv
  from espacios.invitaciones i
  join espacios.proyectos p on p.id = i.proyecto
  where i.id = p_id and lower(i.email) = correo and p.dueno <> auth.uid();
  if not found then
    return null;
  end if;
  insert into espacios.miembros (proyecto, usuario, rol)
    values (inv.proyecto, auth.uid(), inv.rol)
  on conflict (proyecto, usuario) do update set rol = excluded.rol;
  delete from espacios.invitaciones where id = p_id;
  return inv.proyecto;
end;
$$;

-- Quién trabaja en un proyecto, con su nombre (o, si no lo dio, su correo
-- enmascarado). Solo para quien ya lo ve.
create or replace function espacios.miembros_de(p uuid)
returns table (usuario uuid, rol text, nombre text)
language sql stable security definer set search_path = '' as $$
  select u.id,
         case when u.id = pr.dueno then 'dueno' else m.rol end,
         coalesce(pf.nombre, regexp_replace(u.email, '^(.).*(@.*)$', '\1…\2'))
  from espacios.proyectos pr
  join auth.users u on u.id = pr.dueno or u.id in (select usuario from espacios.miembros where proyecto = p)
  left join espacios.miembros m on m.proyecto = p and m.usuario = u.id
  left join espacios.perfiles pf on pf.id = u.id
  where pr.id = p and espacios.puede_leer(p);
$$;

-- Un proyecto publicado, para cualquiera (también `anon`): título,
-- descripción, autoría por nombre, registros con sus notas y enlaces. Nada
-- más: ni ids de usuario ni correos.
create or replace function espacios.publicado(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'titulo', pr.titulo,
    'descripcion', pr.descripcion,
    'autor', coalesce(pf.nombre, 'Anónimo'),
    -- La última vez que cambió algo de lo que se lee: el proyecto, un
    -- registro o su nota, o un enlace.
    'actualizado', greatest(
      pr.actualizado,
      (select max(e.actualizado) from espacios.entradas e where e.proyecto = pr.id),
      (select max(l.creado) from espacios.enlaces l where l.proyecto = pr.id)),
    'entradas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'tipo', e.tipo, 'ref', e.ref, 'titulo', e.titulo, 'href', e.href,
        'nota', e.nota, 'creado', e.creado) order by e.creado)
      from espacios.entradas e where e.proyecto = pr.id), '[]'::jsonb),
    'enlaces', coalesce((
      select jsonb_agg(jsonb_build_object('desde', l.desde, 'hasta', l.hasta, 'nota', l.nota) order by l.creado)
      from espacios.enlaces l where l.proyecto = pr.id), '[]'::jsonb)
  )
  from espacios.proyectos pr
  left join espacios.perfiles pf on pf.id = pr.dueno
  where pr.slug = p_slug and pr.publico;
$$;

revoke all on function espacios.mis_invitaciones() from public, anon;
revoke all on function espacios.aceptar_invitacion(uuid) from public, anon;
revoke all on function espacios.mi_correo() from public, anon;
revoke all on function espacios.miembros_de(uuid) from public, anon;
revoke all on function espacios.rol_en(uuid) from public, anon;
revoke all on function espacios.puede_leer(uuid) from public, anon;
revoke all on function espacios.puede_editar(uuid) from public, anon;
grant execute on function espacios.mis_invitaciones() to authenticated;
grant execute on function espacios.aceptar_invitacion(uuid) to authenticated;
grant execute on function espacios.mi_correo() to authenticated;
grant execute on function espacios.miembros_de(uuid) to authenticated;
grant execute on function espacios.rol_en(uuid) to authenticated;
grant execute on function espacios.puede_leer(uuid) to authenticated;
grant execute on function espacios.puede_editar(uuid) to authenticated;
grant execute on function espacios.publicado(text) to anon, authenticated;
