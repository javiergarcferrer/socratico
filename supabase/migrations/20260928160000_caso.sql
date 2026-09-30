-- El caso: la investigación como expediente de trabajo (docs/PLAN-ESPACIOS.md §7).
--
-- Cuatro cosas nuevas, todas del investigador y ninguna del Estado:
--  · qué une a dos registros, con un verbo de un vocabulario cerrado
--    (`enlaces.tipo`), inspirado en FollowTheMoney para poder exportarlo;
--  · dónde puso cada registro en el tablero (`entradas.x`, `entradas.y`);
--  · la fecha que el investigador le da a un registro para su línea de tiempo
--    (`entradas.fecha`) —la anota él, no se copia de la fuente—;
--  · la narración del caso (`proyectos.narrativa`), un documento del editor con
--    versión: dos personas que escriben a la vez no se pisan en silencio.
--
-- Re-ejecutable, como las anteriores.

-- ─────────────────────────────────────────────── enlaces que el navegador entiende
-- `https://sitio:99999/` pasaba el `check` y rompía `new URL` al pintarlo en
-- `/p`. Un puerto de hasta cuatro cifras siempre es válido; ningún sitio del
-- Estado usa otro. Las filas viejas no se revalidan: `/p` las filtra igual
-- (`hrefValido` en lib/espacios.ts).
create or replace function espacios.href_valido(h text, externo boolean)
returns boolean language sql immutable set search_path = '' as $$
  select char_length(h) <= 1000
     and h !~ '[[:space:][:cntrl:]\\]'
     and (h ~ '^/([^/]|$)' or (externo and h ~* '^https://[a-z0-9.-]+(:[0-9]{1,4})?(/|$)'));
$$;

-- ─────────────────────────────────────────────── relaciones tipadas
alter table espacios.enlaces add column if not exists tipo text not null default 'relaciona';
alter table espacios.enlaces drop constraint if exists enlaces_tipo_valido;
alter table espacios.enlaces add constraint enlaces_tipo_valido check (tipo in (
  'adjudico', 'contrato', 'pago', 'dueno', 'dirige', 'trabaja', 'familia',
  'firmo', 'regula', 'financia', 'relaciona'));
-- Dos registros pueden unirse de más de una manera («contrató con» y «pagó
-- a»), pero no dos veces de la misma.
alter table espacios.enlaces drop constraint if exists enlaces_desde_hasta_key;
create unique index if not exists enlaces_unico on espacios.enlaces (desde, hasta, tipo);

-- ─────────────────────────────────────────────── tablero y línea de tiempo
alter table espacios.entradas add column if not exists x real;
alter table espacios.entradas add column if not exists y real;
alter table espacios.entradas add column if not exists fecha date;
alter table espacios.entradas drop constraint if exists entradas_posicion;
alter table espacios.entradas add constraint entradas_posicion check (
  (x is null and y is null)
  or (x is not null and y is not null and x between -100000 and 100000 and y between -100000 and 100000));
-- Solo para registros de un proyecto: la bandeja no tiene tablero.
alter table espacios.entradas drop constraint if exists entradas_caso_en_proyecto;
alter table espacios.entradas add constraint entradas_caso_en_proyecto check (
  proyecto is not null or (x is null and fecha is null));
alter table espacios.entradas drop constraint if exists entradas_fecha_valida;
alter table espacios.entradas add constraint entradas_fecha_valida check (
  fecha is null or fecha between date '1844-01-01' and date '2100-12-31');

-- Mover una tarjeta no es cambiar lo que se lee: «actualizada» en `/p` cuenta
-- el título, la nota y la fecha, no el sitio en el tablero.
drop trigger if exists entradas_actualizado on espacios.entradas;
create trigger entradas_actualizado before update on espacios.entradas
  for each row
  when (old.titulo is distinct from new.titulo or old.nota is distinct from new.nota or old.fecha is distinct from new.fecha)
  execute function espacios.tocar_actualizado();

-- ─────────────────────────────────────────────── la narración
alter table espacios.proyectos add column if not exists narrativa jsonb;
alter table espacios.proyectos add column if not exists narrativa_version integer not null default 0;
alter table espacios.proyectos drop constraint if exists proyectos_narrativa_valida;
alter table espacios.proyectos add constraint proyectos_narrativa_valida check (
  narrativa is null
  or (jsonb_typeof(narrativa) = 'object' and narrativa->>'type' = 'doc' and octet_length(narrativa::text) <= 200000));

-- Guarda la narración si nadie la cambió desde la versión que se leyó.
-- Devuelve la versión nueva, o null si otra persona guardó antes: la
-- pantalla lo dice y no pisa. Solo quien edita el proyecto.
create or replace function espacios.guardar_narrativa(p_proyecto uuid, p_doc jsonb, p_version integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  nueva integer;
begin
  -- `puede_editar` es null (no false) para quien no es miembro: `not null`
  -- no entraría aquí. Por eso el coalesce.
  if auth.uid() is null or not coalesce(espacios.puede_editar(p_proyecto), false) then
    raise exception 'no puedes editar esta investigación' using errcode = '42501';
  end if;
  update espacios.proyectos
     set narrativa = p_doc, narrativa_version = narrativa_version + 1
   where id = p_proyecto and narrativa_version = p_version
  returning narrativa_version into nueva;
  return nueva;
end;
$$;

-- ─────────────────────────────────────────────── permisos
-- La narración solo se escribe por la función (con su versión); la posición,
-- la fecha y el tipo de un enlace, por columna.
grant update (titulo, nota, x, y, fecha) on espacios.entradas to authenticated;
-- Tampoco al crear el proyecto: se inserta título y descripción, nada más.
revoke insert on espacios.proyectos from authenticated;
grant insert (titulo, descripcion) on espacios.proyectos to authenticated;
grant update (nota, tipo) on espacios.enlaces to authenticated;
revoke all on function espacios.guardar_narrativa(uuid, jsonb, integer) from public, anon;
grant execute on function espacios.guardar_narrativa(uuid, jsonb, integer) to authenticated;

-- ─────────────────────────────────────────────── lo publicado
-- Lo mismo que antes, más el tablero, las fechas, el verbo de cada enlace y
-- la narración. Sigue sin ids de usuario ni correos. «Es familiar de» no se
-- publica nunca: un parentesco entre personas con nombre es un dato personal
-- (Ley 172-13) y queda en el caso privado.
create or replace function espacios.publicado(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'titulo', pr.titulo,
    'descripcion', pr.descripcion,
    'autor', coalesce(pf.nombre, 'Anónimo'),
    -- La última vez que cambió algo de lo que se lee: el proyecto (también su
    -- narración), un registro, su nota o su fecha, o un enlace.
    'actualizado', greatest(
      pr.actualizado,
      (select max(e.actualizado) from espacios.entradas e where e.proyecto = pr.id),
      (select max(l.creado) from espacios.enlaces l where l.proyecto = pr.id)),
    'narrativa', pr.narrativa,
    'entradas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'tipo', e.tipo, 'ref', e.ref, 'titulo', e.titulo, 'href', e.href,
        'nota', e.nota, 'creado', e.creado, 'fecha', e.fecha, 'x', e.x, 'y', e.y) order by e.creado)
      from espacios.entradas e where e.proyecto = pr.id), '[]'::jsonb),
    'enlaces', coalesce((
      select jsonb_agg(jsonb_build_object('desde', l.desde, 'hasta', l.hasta, 'tipo', l.tipo, 'nota', l.nota) order by l.creado)
      from espacios.enlaces l where l.proyecto = pr.id and l.tipo <> 'familia'), '[]'::jsonb)
  )
  from espacios.proyectos pr
  left join espacios.perfiles pf on pf.id = pr.dueno
  where pr.slug = p_slug and pr.publico;
$$;
grant execute on function espacios.publicado(text) to anon, authenticated;
