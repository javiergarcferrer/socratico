-- La conversación: hilos, comentarios, votos, denuncias y moderación sobre los
-- registros de la plataforma y las investigaciones publicadas
-- (docs/PLAN-ESPACIOS.md §6; decisión del dueño 2026-09-28).
--
-- Contrato:
--  · Vive en el esquema `espacios`: es de lo que el lector pone, no del Estado.
--    Un hilo es una REFERENCIA al registro (tipo, ref, título, enlace); la cifra
--    se sigue leyendo en su ficha, del origen.
--  · Escribe texto público —un comentario, o el título con que se abre una
--    conversación— solo quien registró su cédula (`democracia.votantes`),
--    firma con nombre y aceptó las normas. Vota cualquier cuenta con correo
--    verificado, sobre conversaciones ya abiertas.
--  · Suspensiones y topes de ritmo van por la **huella de la cédula**, no por
--    la cuenta: quien es suspendido no vuelve con otro correo.
--  · Nadie escribe en una tabla: todo pasa por funciones definidoras. Las
--    tablas tienen RLS y ningún permiso para `anon` ni `authenticated`.
--  · Se lee en público (`hilo`, `comunidad`): lo visible, con el nombre de
--    firma; nunca ids de usuario, correos ni cédulas.
--  · Moderación posterior: tres denuncias de cuentas distintas con cédula
--    registrada ocultan un comentario o un hilo hasta que un moderador lo
--    revise. Cada acción de moderación queda registrada.
--  · Los contadores (votos, puntos, comentarios) los llevan disparadores por
--    incremento: son exactos con votos simultáneos y cuando se borra una cuenta.
--
-- Idempotente: se puede volver a correr sin romper nada. Requiere
-- 20260928120000_espacios.sql.

-- ─────────────────────────────────────────────── perfil: las normas
alter table espacios.perfiles add column if not exists normas timestamptz;

-- ─────────────────────────────────────────────── de qué se puede hablar
-- Los registros con ficha propia en la plataforma, más una investigación
-- publicada (`ref` es su slug). No se abre conversación sobre una búsqueda,
-- un dato suelto o lo que vive fuera (una sentencia, un documento): la
-- conversación vive en una ficha.
create or replace function espacios.tipo_hilo_valido(t text)
returns boolean language sql immutable set search_path = '' as $$
  select t in (
    'institucion', 'proveedor', 'proceso', 'norma', 'proyecto', 'expediente-senado',
    'legislador', 'obra', 'investigacion'
  );
$$;

-- La ruta **canónica** de cada tipo: la que produce `enlace` en lib/grafo.ts
-- con el identificador del registro (sin el nombre que acompaña a veces).
-- La clave de un hilo es esa ruta: nadie abre la conversación de «un proceso»
-- que lleva a otra página, y un registro no se parte en dos conversaciones.
create or replace function espacios.ruta_de_tipo(t text, h text)
returns boolean language sql immutable set search_path = '' as $$
  select espacios.href_valido(h, false) and case t
    when 'institucion'       then h ~ '^/instituciones/[1-9][0-9]{0,6}$'
    when 'proveedor'         then h ~ '^/proveedores/[1-9][0-9]{0,9}$'
    -- `enlace.proceso` pasa el código por encodeURIComponent: un código con
    -- espacios o tildes (el 12 % de los de la DGCP) llega como %20, %C3%B3…
    -- Un octeto codificado que encodeURIComponent nunca produciría (una letra,
    -- un dígito, «-»…) es otra forma de escribir el mismo código: se rechaza,
    -- para que un proceso no tenga dos conversaciones.
    when 'proceso'           then h ~ '^/procesos/(?:[A-Za-z0-9._~!*''()-]|%[0-9A-F]{2})+$'
                                  and h !~ '%(2[1789ADE]|3[0-9]|[46][1-9A-F]|[57][0-9A]|5F|7E)'
    when 'norma'             then h ~ '^/normativa/[a-z]+(-[a-z]+)*/[0-9]{1,4}-[0-9]{2,4}$'
    when 'proyecto'          then h ~ '^/congreso/[1-9][0-9]{0,9}$'
    when 'expediente-senado' then h ~ '^/congreso/senado/[0-9]{4}-[0-9]{4}/[1-9][0-9]{0,9}$'
    when 'legislador'        then h ~ '^/congreso/legisladores/[1-9][0-9]{0,9}$'
    when 'obra'              then h ~ '^/obras/[1-9][0-9]{0,6}$'
    when 'investigacion'     then h ~ '^/p/[a-z0-9]+(-[a-z0-9]+)*$'
    else false
  end;
$$;

-- ─────────────────────────────────────────────── tablas
create table if not exists espacios.moderadores (
  usuario  uuid primary key references auth.users (id) on delete cascade,
  creado   timestamptz not null default now()
);

-- Una suspensión es de la persona: su cuenta y la huella de su cédula. La
-- huella se guarda solo mientras dura (se purga al vencer).
create table if not exists espacios.suspensiones (
  id       uuid primary key default gen_random_uuid(),
  usuario  uuid unique references auth.users (id) on delete set null,
  cedula   text,
  hasta    timestamptz not null,
  motivo   text not null check (char_length(btrim(motivo)) between 1 and 500),
  por      uuid references auth.users (id) on delete set null,
  creado   timestamptz not null default now()
);
create index if not exists suspensiones_cedula on espacios.suspensiones (cedula) where cedula is not null;

create table if not exists espacios.hilos (
  tipo            text not null check (espacios.tipo_hilo_valido(tipo)),
  ref             text not null check (char_length(ref) between 1 and 300),
  titulo          text not null check (char_length(btrim(titulo)) between 1 and 300),
  href            text not null check (espacios.href_valido(href, false)),
  estado          text not null default 'visible' check (estado in ('visible', 'oculto', 'retirado')),
  votos           integer not null default 0,
  comentarios     integer not null default 0,
  -- Quién abrió la conversación (y puso su título), para el tope diario.
  abierto_por     uuid references auth.users (id) on delete set null,
  abierto_cedula  text,
  creado          timestamptz not null default now(),
  actividad       timestamptz not null default now(),
  primary key (tipo, ref)
);
create index if not exists hilos_actividad on espacios.hilos (actividad desc) where estado = 'visible';
create index if not exists hilos_creado on espacios.hilos (creado desc) where estado = 'visible';
create index if not exists hilos_votos on espacios.hilos (votos desc) where estado = 'visible';
create index if not exists hilos_abierto on espacios.hilos (abierto_cedula, creado desc);
create index if not exists hilos_con_huella on espacios.hilos (creado) where abierto_cedula is not null;

create table if not exists espacios.comentarios (
  id         uuid primary key default gen_random_uuid(),
  hilo_tipo  text not null,
  hilo_ref   text not null,
  -- Si el comentario de arriba desaparece (se borra su cuenta), las
  -- respuestas de otros se quedan, como comentarios sueltos.
  padre      uuid references espacios.comentarios (id) on delete set null,
  usuario    uuid not null references auth.users (id) on delete cascade,
  -- La huella de la cédula de quien escribió: para el tope de ritmo y para
  -- que una suspensión alcance a la cédula aunque se borre el registro de
  -- votante. Se vacía a los 90 días (`olvidar_huellas`).
  cedula     text,
  cuerpo     text not null check (char_length(cuerpo) <= 4000),
  estado     text not null default 'visible' check (estado in ('visible', 'oculto', 'retirado', 'borrado')),
  puntos     integer not null default 0,
  creado     timestamptz not null default now(),
  foreign key (hilo_tipo, hilo_ref) references espacios.hilos (tipo, ref) on delete cascade on update cascade
);
create index if not exists comentarios_hilo on espacios.comentarios (hilo_tipo, hilo_ref, creado);
create index if not exists comentarios_cedula on espacios.comentarios (cedula, creado desc);
create index if not exists comentarios_con_huella on espacios.comentarios (creado) where cedula is not null;

create table if not exists espacios.votos_comentario (
  comentario  uuid not null references espacios.comentarios (id) on delete cascade,
  usuario     uuid not null references auth.users (id) on delete cascade,
  valor       smallint not null check (valor in (-1, 1)),
  creado      timestamptz not null default now(),
  primary key (comentario, usuario)
);

create table if not exists espacios.votos_hilo (
  tipo     text not null,
  ref      text not null,
  usuario  uuid not null references auth.users (id) on delete cascade,
  creado   timestamptz not null default now(),
  primary key (tipo, ref, usuario),
  foreign key (tipo, ref) references espacios.hilos (tipo, ref) on delete cascade on update cascade
);
create index if not exists votos_hilo_usuario on espacios.votos_hilo (usuario, creado desc);

create table if not exists espacios.denuncias (
  id              uuid primary key default gen_random_uuid(),
  objetivo_tipo   text not null check (objetivo_tipo in ('comentario', 'hilo')),
  -- Un comentario por su id; un hilo como «tipo:ref».
  objetivo        text not null check (char_length(objetivo) between 1 and 320),
  usuario         uuid not null references auth.users (id) on delete cascade,
  -- Solo las de quien registró su cédula cuentan para ocultar.
  con_cedula      boolean not null default false,
  motivo          text not null check (motivo in ('difamacion', 'datos-personales', 'acoso', 'spam', 'falso', 'otro')),
  detalle         text not null default '' check (char_length(detalle) <= 500),
  resuelta        boolean not null default false,
  creado          timestamptz not null default now(),
  unique (objetivo_tipo, objetivo, usuario)
);
create index if not exists denuncias_pendientes on espacios.denuncias (objetivo_tipo, objetivo) where not resuelta;

create table if not exists espacios.acciones_moderacion (
  id              uuid primary key default gen_random_uuid(),
  moderador       uuid references auth.users (id) on delete set null,
  objetivo_tipo   text not null check (objetivo_tipo in ('comentario', 'hilo', 'usuario')),
  objetivo        text not null,
  accion          text not null check (accion in ('restaurar', 'retirar', 'retitular', 'suspender', 'levantar')),
  nota            text not null default '' check (char_length(nota) <= 500),
  creado          timestamptz not null default now()
);

-- Todo con RLS y sin políticas: solo las funciones definidoras de abajo
-- (dueñas de las tablas) leen y escriben.
alter table espacios.moderadores          enable row level security;
alter table espacios.suspensiones         enable row level security;
alter table espacios.hilos                enable row level security;
alter table espacios.comentarios          enable row level security;
alter table espacios.votos_comentario     enable row level security;
alter table espacios.votos_hilo           enable row level security;
alter table espacios.denuncias            enable row level security;
alter table espacios.acciones_moderacion  enable row level security;
revoke all on espacios.moderadores, espacios.suspensiones, espacios.hilos, espacios.comentarios,
  espacios.votos_comentario, espacios.votos_hilo, espacios.denuncias, espacios.acciones_moderacion
  from anon, authenticated, public;

-- ─────────────────────────────────────────────── contadores (disparadores)
-- Por incremento, bajo el candado de la fila: dos votos a la vez no se pisan,
-- y borrar una cuenta (que arrastra sus votos y comentarios) no deja cifras
-- viejas.
create or replace function espacios.contar_voto_comentario()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update espacios.comentarios set puntos = puntos + new.valor where id = new.comentario;
  elsif tg_op = 'DELETE' then
    update espacios.comentarios set puntos = puntos - old.valor where id = old.comentario;
  elsif new.valor <> old.valor then
    update espacios.comentarios set puntos = puntos + new.valor - old.valor where id = new.comentario;
  end if;
  return null;
end;
$$;
drop trigger if exists votos_comentario_cuenta on espacios.votos_comentario;
create trigger votos_comentario_cuenta after insert or update or delete on espacios.votos_comentario
  for each row execute function espacios.contar_voto_comentario();

create or replace function espacios.contar_voto_hilo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    -- Un voto no reaviva la conversación: votar y retirar en bucle no la
    -- sube en «Destacado». La actividad es de lo que se escribe.
    update espacios.hilos set votos = votos + 1 where tipo = new.tipo and ref = new.ref;
  else
    update espacios.hilos set votos = greatest(votos - 1, 0) where tipo = old.tipo and ref = old.ref;
  end if;
  return null;
end;
$$;
drop trigger if exists votos_hilo_cuenta on espacios.votos_hilo;
create trigger votos_hilo_cuenta after insert or delete on espacios.votos_hilo
  for each row execute function espacios.contar_voto_hilo();

-- `comentarios` cuenta solo lo visible. Toda entrada y salida de «visible»
-- —publicar, borrar, ocultar por denuncias, moderar, borrar la cuenta— pasa
-- por aquí.
create or replace function espacios.contar_comentario()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  antes boolean := tg_op in ('UPDATE', 'DELETE') and old.estado = 'visible';
  ahora boolean := tg_op in ('INSERT', 'UPDATE') and new.estado = 'visible';
begin
  if ahora and not antes then
    update espacios.hilos set comentarios = comentarios + 1, actividad = now()
     where tipo = new.hilo_tipo and ref = new.hilo_ref;
  elsif antes and not ahora then
    update espacios.hilos set comentarios = greatest(comentarios - 1, 0)
     where tipo = old.hilo_tipo and ref = old.hilo_ref;
  end if;
  return null;
end;
$$;
drop trigger if exists comentarios_cuenta on espacios.comentarios;
create trigger comentarios_cuenta after insert or update of estado or delete on espacios.comentarios
  for each row execute function espacios.contar_comentario();

-- Una investigación que cambia de dirección se lleva su conversación; una
-- que se borra, la cierra del todo (su slug queda libre y otro proyecto no
-- debe heredar comentarios ajenos).
create or replace function espacios.hilo_de_investigacion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.slug is not null then
      delete from espacios.hilos where tipo = 'investigacion' and ref = old.slug;
      -- Sus denuncias se van con ella: otro proyecto que publique en esa
      -- dirección no hereda denuncias ajenas.
      delete from espacios.denuncias where objetivo_tipo = 'hilo' and objetivo = 'investigacion:' || old.slug;
    end if;
    return null;
  end if;
  if old.slug is not null and new.slug is distinct from old.slug then
    if new.slug is null then
      delete from espacios.hilos where tipo = 'investigacion' and ref = old.slug;
      delete from espacios.denuncias where objetivo_tipo = 'hilo' and objetivo = 'investigacion:' || old.slug;
    else
      update espacios.hilos set ref = new.slug, href = '/p/' || new.slug
       where tipo = 'investigacion' and ref = old.slug;
      -- Las denuncias pendientes siguen a la conversación.
      update espacios.denuncias set objetivo = 'investigacion:' || new.slug
       where objetivo_tipo = 'hilo' and objetivo = 'investigacion:' || old.slug;
    end if;
  end if;
  return null;
end;
$$;
drop trigger if exists proyectos_hilo on espacios.proyectos;
create trigger proyectos_hilo after update of slug or delete on espacios.proyectos
  for each row execute function espacios.hilo_de_investigacion();

-- ─────────────────────────────────────────────── quién puede qué
create or replace function espacios.es_moderador()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from espacios.moderadores where usuario = auth.uid());
$$;

-- La huella de la cédula de quien pregunta (interna: nunca sale de la base).
create or replace function espacios.mi_cedula()
returns text language sql stable security definer set search_path = '' as $$
  select cedula_hash from democracia.votantes where id = auth.uid();
$$;

-- Registró su cédula en el piloto de voto: una fila en `democracia.votantes`
-- con su id de cuenta. Es la misma puerta que el voto (dígito verificador y
-- unicidad); la verificación contra la JCE llega con Cuenta Única.
create or replace function espacios.cedula_registrada()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and espacios.mi_cedula() is not null;
$$;

-- Hasta cuándo está suspendida la persona: por su cuenta o por su cédula.
create or replace function espacios.suspendido_hasta()
returns timestamptz language sql stable security definer set search_path = '' as $$
  select max(hasta) from espacios.suspensiones
   where hasta > now()
     and (usuario = auth.uid() or (cedula is not null and cedula = espacios.mi_cedula()));
$$;

-- Lo que la pantalla necesita para decir qué falta antes del primer toque.
create or replace function espacios.mi_estado_conversacion()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'cuenta', auth.uid() is not null,
    'correo', espacios.mi_correo() is not null,
    'cedula', espacios.cedula_registrada(),
    'nombre', (select nombre from espacios.perfiles where id = auth.uid()),
    'normas', coalesce((select normas is not null from espacios.perfiles where id = auth.uid()), false),
    'suspendido_hasta', espacios.suspendido_hasta(),
    'moderador', espacios.es_moderador()
  );
$$;

create or replace function espacios.aceptar_normas()
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'hace falta entrar' using errcode = '42501';
  end if;
  update espacios.perfiles set normas = now() where id = auth.uid();
  if not found then
    raise exception 'primero elige el nombre con que firmas' using errcode = '22023';
  end if;
  return true;
end;
$$;

-- Puede escribir texto público: cédula, nombre, normas, sin suspensión.
create or replace function espacios.exigir_autoria()
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  c text := espacios.mi_cedula();
  s timestamptz := espacios.suspendido_hasta();
begin
  if auth.uid() is null then
    raise exception 'hace falta entrar' using errcode = '42501';
  end if;
  if s is not null then
    raise exception 'tu cuenta no puede escribir hasta el %',
      to_char(s at time zone 'America/Santo_Domingo', 'DD-MM-YYYY') using errcode = '42501';
  end if;
  if c is null then
    raise exception 'para escribir hace falta registrar tu cédula' using errcode = '42501';
  end if;
  if not exists (select 1 from espacios.perfiles where id = auth.uid() and normas is not null) then
    raise exception 'primero acepta las normas de la conversación' using errcode = '42501';
  end if;
  return c;
end;
$$;

-- ─────────────────────────────────────────────── abrir un hilo (interna)
-- Abrir es escribir el título que verá el feed: lo hace solo quien puede
-- escribir, hasta veinte conversaciones nuevas al día por cédula. Un título
-- falso u ofensivo lo corrige un moderador (`retitular`).
create or replace function espacios.abrir_hilo(p_tipo text, p_ref text, p_titulo text, p_href text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c text;
begin
  if exists (select 1 from espacios.hilos where tipo = p_tipo and ref = p_ref) then
    return;
  end if;
  c := espacios.exigir_autoria();
  if p_tipo = 'investigacion' then
    if not exists (select 1 from espacios.proyectos where slug = p_ref and publico) then
      raise exception 'esa investigación no está publicada' using errcode = '22023';
    end if;
    p_href := '/p/' || p_ref;
  elsif p_href is distinct from p_ref then
    raise exception 'la conversación de un registro es la de su ficha' using errcode = '22023';
  end if;
  if not espacios.tipo_hilo_valido(p_tipo) or not espacios.ruta_de_tipo(p_tipo, p_href) then
    raise exception 'ahí no se abre una conversación' using errcode = '22023';
  end if;
  if (select count(*) from espacios.hilos where abierto_cedula = c and creado > now() - interval '1 day') >= 20 then
    raise exception 'abriste muchas conversaciones hoy: vuelve mañana' using errcode = '54000';
  end if;
  insert into espacios.hilos (tipo, ref, titulo, href, abierto_por, abierto_cedula)
  values (p_tipo, p_ref, left(btrim(p_titulo), 300), p_href, auth.uid(), c)
  on conflict (tipo, ref) do nothing;
end;
$$;

-- El estado de una conversación para escribir en ella: la de una
-- investigación que se retiró de la publicación está cerrada.
create or replace function espacios.estado_para_escribir(p_tipo text, p_ref text)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when p_tipo = 'investigacion' and not exists (select 1 from espacios.proyectos where slug = p_ref and publico) then 'cerrado'
    else (select estado from espacios.hilos where tipo = p_tipo and ref = p_ref)
  end;
$$;

-- Las huellas de cédula se guardan 90 días: bastan para el tope de ritmo
-- (un día) y para suspender a quien escribió algo reciente aunque haya
-- borrado su registro de votante. Después se vacían. Corre de paso en cada
-- comentario y en cada suspensión; no hace falta un trabajo programado.
create or replace function espacios.olvidar_huellas()
returns void language sql security definer set search_path = '' as $$
  update espacios.comentarios set cedula = null
   where cedula is not null and creado < now() - interval '90 days';
  update espacios.hilos set abierto_cedula = null
   where abierto_cedula is not null and creado < now() - interval '90 days';
  delete from espacios.suspensiones where hasta <= now();
$$;

-- ─────────────────────────────────────────────── comentar
create or replace function espacios.comentar(
  p_tipo text, p_ref text, p_titulo text, p_href text, p_padre uuid, p_cuerpo text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  c text := espacios.exigir_autoria();
  cuerpo text := btrim(coalesce(p_cuerpo, ''));
  nuevo uuid;
  estado_hilo text;
begin
  if char_length(cuerpo) < 2 or char_length(cuerpo) > 4000 then
    raise exception 'un comentario va de 2 a 4000 caracteres' using errcode = '23514';
  end if;
  -- El olvido de huellas va antes de tomar ningún candado propio: dos
  -- comentarios a la vez no se esperan el uno al otro.
  perform espacios.olvidar_huellas();
  -- Más de tres enlaces en un comentario es propaganda, no conversación.
  if (select count(*) from regexp_matches(cuerpo, 'https?://', 'g')) > 3 then
    raise exception 'un comentario lleva como mucho tres enlaces' using errcode = '23514';
  end if;
  -- Ritmo, por cédula: cinco en diez minutos, cuarenta al día.
  if (select count(*) from espacios.comentarios where cedula = c and creado > now() - interval '10 minutes') >= 5
     or (select count(*) from espacios.comentarios where cedula = c and creado > now() - interval '1 day') >= 40 then
    raise exception 'vas muy rápido: espera unos minutos antes de volver a comentar' using errcode = '54000';
  end if;

  perform espacios.abrir_hilo(p_tipo, p_ref, p_titulo, p_href);
  estado_hilo := espacios.estado_para_escribir(p_tipo, p_ref);
  if estado_hilo is distinct from 'visible' then
    raise exception 'esta conversación está cerrada' using errcode = '42501';
  end if;
  if p_padre is not null and not exists (
    select 1 from espacios.comentarios
    where id = p_padre and hilo_tipo = p_tipo and hilo_ref = p_ref and estado = 'visible'
  ) then
    raise exception 'no se puede responder a ese comentario' using errcode = '22023';
  end if;

  insert into espacios.comentarios (hilo_tipo, hilo_ref, padre, usuario, cedula, cuerpo)
  values (p_tipo, p_ref, p_padre, auth.uid(), c, cuerpo)
  returning id into nuevo;
  return nuevo;
end;
$$;

-- Quien escribió puede borrar lo suyo: el texto se vacía de verdad (es suyo)
-- y queda la marca «borrado por su autor» para que las respuestas no floten.
create or replace function espacios.borrar_comentario(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update espacios.comentarios set estado = 'borrado', cuerpo = ''
   where id = p_id and usuario = auth.uid() and estado <> 'borrado';
  return exists (select 1 from espacios.comentarios where id = p_id and usuario = auth.uid());
end;
$$;

-- ─────────────────────────────────────────────── votar
create or replace function espacios.exigir_votante()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or espacios.mi_correo() is null then
    raise exception 'para votar hace falta una cuenta con el correo verificado' using errcode = '42501';
  end if;
  if espacios.suspendido_hasta() is not null then
    raise exception 'tu cuenta no puede votar por ahora' using errcode = '42501';
  end if;
end;
$$;

-- `p_valor` 1, -1, o 0 para quitarlo. Devuelve los puntos nuevos.
create or replace function espacios.votar_comentario(p_id uuid, p_valor smallint)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  autor uuid;
begin
  perform espacios.exigir_votante();
  if p_valor not in (-1, 0, 1) then
    raise exception 'un voto es 1, -1 o 0' using errcode = '22023';
  end if;
  select usuario into autor from espacios.comentarios where id = p_id and estado = 'visible';
  if not found then
    raise exception 'ese comentario no admite votos' using errcode = '22023';
  end if;
  if autor = uid then
    raise exception 'no se vota lo propio' using errcode = '22023';
  end if;
  if p_valor = 0 then
    delete from espacios.votos_comentario where comentario = p_id and usuario = uid;
  else
    insert into espacios.votos_comentario (comentario, usuario, valor) values (p_id, uid, p_valor)
    on conflict (comentario, usuario) do update set valor = excluded.valor;
  end if;
  return (select puntos from espacios.comentarios where id = p_id);
end;
$$;

-- «Importa»: el voto sobre un registro o una investigación, solo hacia
-- arriba. Vota cualquier cuenta sobre una conversación ya abierta; si nadie
-- la abrió, la abre este voto, y eso —escribir su título— pide cédula.
create or replace function espacios.votar_hilo(p_tipo text, p_ref text, p_titulo text, p_href text, p_si boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  estado_hilo text;
begin
  perform espacios.exigir_votante();
  if p_si then
    if (select count(*) from espacios.votos_hilo where usuario = uid and creado > now() - interval '1 hour') >= 120 then
      raise exception 'vas muy rápido: espera un momento' using errcode = '54000';
    end if;
    perform espacios.abrir_hilo(p_tipo, p_ref, p_titulo, p_href);
    estado_hilo := espacios.estado_para_escribir(p_tipo, p_ref);
    if estado_hilo is distinct from 'visible' then
      raise exception 'esta conversación está cerrada' using errcode = '42501';
    end if;
    insert into espacios.votos_hilo (tipo, ref, usuario) values (p_tipo, p_ref, uid)
    on conflict do nothing;
  else
    delete from espacios.votos_hilo where tipo = p_tipo and ref = p_ref and usuario = uid;
  end if;
  return coalesce((select votos from espacios.hilos where tipo = p_tipo and ref = p_ref), 0);
end;
$$;

-- ─────────────────────────────────────────────── denunciar
-- Cualquier cuenta con correo verificado y sin suspensión, una vez por cosa.
-- Para ocultar cuentan solo las denuncias de quien registró su cédula: tres
-- correos desechables no silencian a nadie.
create or replace function espacios.denunciar(p_objetivo_tipo text, p_objetivo text, p_motivo text, p_detalle text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  n integer;
  t text;
  r text;
begin
  perform espacios.exigir_votante();
  if p_objetivo_tipo = 'comentario' then
    if not exists (select 1 from espacios.comentarios where id::text = p_objetivo and estado in ('visible', 'oculto')) then
      raise exception 'ese comentario no existe' using errcode = '22023';
    end if;
  elsif p_objetivo_tipo = 'hilo' then
    t := split_part(p_objetivo, ':', 1);
    r := substr(p_objetivo, char_length(t) + 2);
    if not exists (select 1 from espacios.hilos where tipo = t and ref = r) then
      raise exception 'esa conversación no existe' using errcode = '22023';
    end if;
  else
    raise exception 'no se puede denunciar eso' using errcode = '22023';
  end if;
  if (select count(*) from espacios.denuncias where usuario = uid and creado > now() - interval '1 day') >= 30 then
    raise exception 'llegaste al tope de denuncias de hoy' using errcode = '54000';
  end if;
  insert into espacios.denuncias (objetivo_tipo, objetivo, usuario, con_cedula, motivo, detalle)
  values (p_objetivo_tipo, p_objetivo, uid, espacios.cedula_registrada(), p_motivo, left(btrim(coalesce(p_detalle, '')), 500))
  on conflict (objetivo_tipo, objetivo, usuario) do nothing;
  select count(distinct usuario) into n from espacios.denuncias
   where objetivo_tipo = p_objetivo_tipo and objetivo = p_objetivo and not resuelta and con_cedula;
  if n >= 3 then
    if p_objetivo_tipo = 'comentario' then
      update espacios.comentarios set estado = 'oculto' where id::text = p_objetivo and estado = 'visible';
    else
      update espacios.hilos set estado = 'oculto' where tipo = t and ref = r and estado = 'visible';
    end if;
  end if;
  return true;
end;
$$;

-- ─────────────────────────────────────────────── leer (público)
-- Una conversación entera: el hilo y sus comentarios (los mil más recientes).
-- Lo que no está visible sale sin texto ni autor, con su estado, para que sus
-- respuestas conserven el sitio. `mio` y `mi_voto` solo con sesión. La de una
-- investigación retirada no se lee.
create or replace function espacios.hilo(p_tipo text, p_ref text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'existe', h.tipo is not null,
    'estado', coalesce(h.estado, 'visible'),
    'votos', coalesce(h.votos, 0),
    'comentarios', coalesce(h.comentarios, 0),
    'mi_voto', auth.uid() is not null and exists (
      select 1 from espacios.votos_hilo v where v.tipo = p_tipo and v.ref = p_ref and v.usuario = auth.uid()),
    'lista', case when h.estado is distinct from 'visible' then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'padre', c.padre,
        'estado', c.estado,
        'autor', case when c.estado = 'visible' then coalesce(pf.nombre, 'Sin nombre') end,
        'cuerpo', case when c.estado = 'visible' then c.cuerpo end,
        'puntos', case when c.estado = 'visible' then c.puntos else 0 end,
        'creado', c.creado,
        'mio', auth.uid() is not null and c.usuario = auth.uid(),
        'mi_voto', coalesce((select vc.valor from espacios.votos_comentario vc
                              where vc.comentario = c.id and vc.usuario = auth.uid()), 0)
      ) order by c.creado)
      from (
        select * from espacios.comentarios
         where hilo_tipo = p_tipo and hilo_ref = p_ref
         order by creado desc
         limit 1000
      ) c
      left join espacios.perfiles pf on pf.id = c.usuario
    ), '[]'::jsonb) end
  )
  from (select 1) uno
  left join espacios.hilos h on h.tipo = p_tipo and h.ref = p_ref
   and (p_tipo <> 'investigacion' or exists (select 1 from espacios.proyectos p where p.slug = p_ref and p.publico));
$$;

-- El feed: las conversaciones visibles. `destacado` pesa votos y comentarios
-- contra el tiempo desde la última actividad (como Hacker News: puntos /
-- (horas + 2)^1.5; una conversación sin votos ni comentarios no puntúa);
-- `nuevo`, lo último abierto; `votado`, lo que más importa. Desempate por la
-- clave, para que las páginas no se solapen. Una investigación retirada no
-- aparece.
create or replace function espacios.comunidad(p_orden text default 'destacado', p_limite integer default 30, p_pagina integer default 0)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(fila order by orden_n), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'tipo', h.tipo, 'ref', h.ref, 'titulo', h.titulo, 'href', h.href,
             'votos', h.votos, 'comentarios', h.comentarios,
             'creado', h.creado, 'actividad', h.actividad,
             'mi_voto', auth.uid() is not null and exists (
               select 1 from espacios.votos_hilo v where v.tipo = h.tipo and v.ref = h.ref and v.usuario = auth.uid())
           ) as fila,
           row_number() over (order by
             case when p_orden = 'nuevo' then h.creado end desc nulls last,
             case when p_orden = 'votado' then h.votos end desc nulls last,
             case when p_orden not in ('nuevo', 'votado') then
               (h.votos + 2 * h.comentarios) / power(extract(epoch from (now() - h.actividad)) / 3600 + 2, 1.5)
             end desc nulls last,
             h.actividad desc, h.tipo, h.ref
           ) as orden_n
    from espacios.hilos h
    where h.estado = 'visible'
      and (h.tipo <> 'investigacion' or exists (select 1 from espacios.proyectos p where p.slug = h.ref and p.publico))
    order by orden_n
    limit least(greatest(p_limite, 1), 100) offset greatest(p_pagina, 0) * least(greatest(p_limite, 1), 100)
  ) t;
$$;

-- ─────────────────────────────────────────────── moderar
create or replace function espacios.cola_moderacion()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not espacios.es_moderador() then
    raise exception 'solo quien modera' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'comentarios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'estado', c.estado, 'cuerpo', c.cuerpo, 'creado', c.creado,
        'autor', coalesce(pf.nombre, 'Sin nombre'), 'usuario', c.usuario,
        'hilo', jsonb_build_object('tipo', h.tipo, 'ref', h.ref, 'titulo', h.titulo, 'href', h.href),
        'denuncias', (select jsonb_agg(jsonb_build_object('motivo', d.motivo, 'detalle', d.detalle, 'creado', d.creado, 'con_cedula', d.con_cedula) order by d.creado)
                        from espacios.denuncias d where d.objetivo_tipo = 'comentario' and d.objetivo = c.id::text and not d.resuelta)
      ) order by c.creado)
      from espacios.comentarios c
      join espacios.hilos h on h.tipo = c.hilo_tipo and h.ref = c.hilo_ref
      left join espacios.perfiles pf on pf.id = c.usuario
      where c.estado = 'oculto'
         or exists (select 1 from espacios.denuncias d where d.objetivo_tipo = 'comentario' and d.objetivo = c.id::text and not d.resuelta)
    ), '[]'::jsonb),
    'hilos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tipo', h.tipo, 'ref', h.ref, 'titulo', h.titulo, 'href', h.href, 'estado', h.estado,
        'abierto_por', h.abierto_por,
        'abierto_por_nombre', (select coalesce(pf.nombre, 'Sin nombre') from espacios.perfiles pf where pf.id = h.abierto_por),
        'denuncias', (select jsonb_agg(jsonb_build_object('motivo', d.motivo, 'detalle', d.detalle, 'creado', d.creado, 'con_cedula', d.con_cedula) order by d.creado)
                        from espacios.denuncias d where d.objetivo_tipo = 'hilo' and d.objetivo = h.tipo || ':' || h.ref and not d.resuelta)
      ) order by h.creado)
      from espacios.hilos h
      where h.estado = 'oculto'
         or exists (select 1 from espacios.denuncias d where d.objetivo_tipo = 'hilo' and d.objetivo = h.tipo || ':' || h.ref and not d.resuelta)
    ), '[]'::jsonb),
    'suspensiones', coalesce((
      select jsonb_agg(jsonb_build_object('usuario', s.usuario, 'nombre', coalesce(pf.nombre, 'Sin nombre'),
                                          'hasta', s.hasta, 'motivo', s.motivo) order by s.hasta desc)
      from espacios.suspensiones s left join espacios.perfiles pf on pf.id = s.usuario
      where s.hasta > now()
    ), '[]'::jsonb)
  );
end;
$$;

-- Restaurar o retirar un comentario o un hilo. Cierra sus denuncias y deja
-- constancia de quién, qué y por qué. Los contadores los ajusta el disparador.
create or replace function espacios.moderar(p_objetivo_tipo text, p_objetivo text, p_accion text, p_nota text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  t text;
  r text;
begin
  if not espacios.es_moderador() then
    raise exception 'solo quien modera' using errcode = '42501';
  end if;
  if p_accion not in ('restaurar', 'retirar') then
    raise exception 'acción desconocida' using errcode = '22023';
  end if;
  if p_objetivo_tipo = 'comentario' then
    update espacios.comentarios
       set estado = case when p_accion = 'restaurar' then 'visible' else 'retirado' end
     where id::text = p_objetivo and estado <> 'borrado';
    if not found then
      return false;
    end if;
  elsif p_objetivo_tipo = 'hilo' then
    t := split_part(p_objetivo, ':', 1);
    r := substr(p_objetivo, char_length(t) + 2);
    update espacios.hilos
       set estado = case when p_accion = 'restaurar' then 'visible' else 'retirado' end
     where tipo = t and ref = r;
    if not found then
      return false;
    end if;
  else
    raise exception 'no se modera eso' using errcode = '22023';
  end if;
  update espacios.denuncias set resuelta = true
   where objetivo_tipo = p_objetivo_tipo and objetivo = p_objetivo and not resuelta;
  insert into espacios.acciones_moderacion (moderador, objetivo_tipo, objetivo, accion, nota)
  values (auth.uid(), p_objetivo_tipo, p_objetivo, p_accion, left(coalesce(p_nota, ''), 500));
  return true;
end;
$$;

-- Corregir el título de una conversación sin cerrarla: el registro sigue
-- teniendo su conversación, con un título que dice lo que es.
create or replace function espacios.retitular(p_clave text, p_titulo text, p_nota text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  t text := split_part(p_clave, ':', 1);
  r text := substr(p_clave, char_length(split_part(p_clave, ':', 1)) + 2);
begin
  if not espacios.es_moderador() then
    raise exception 'solo quien modera' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_titulo, ''))) = 0 then
    raise exception 'un título no puede ir vacío' using errcode = '22023';
  end if;
  update espacios.hilos set titulo = left(btrim(p_titulo), 300) where tipo = t and ref = r;
  if not found then
    return false;
  end if;
  insert into espacios.acciones_moderacion (moderador, objetivo_tipo, objetivo, accion, nota)
  values (auth.uid(), 'hilo', p_clave, 'retitular', left(coalesce(p_nota, ''), 500));
  return true;
end;
$$;

-- Suspender (días > 0) o levantar (días = 0) a una persona: su cuenta y la
-- huella de su cédula. Las suspensiones vencidas se purgan de paso, y con
-- ellas la huella.
create or replace function espacios.suspender(p_usuario uuid, p_dias integer, p_motivo text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not espacios.es_moderador() then
    raise exception 'solo quien modera' using errcode = '42501';
  end if;
  if p_usuario = auth.uid() then
    raise exception 'no te suspendes a ti' using errcode = '22023';
  end if;
  perform espacios.olvidar_huellas();
  if p_dias <= 0 then
    delete from espacios.suspensiones where usuario = p_usuario;
    insert into espacios.acciones_moderacion (moderador, objetivo_tipo, objetivo, accion, nota)
    values (auth.uid(), 'usuario', p_usuario::text, 'levantar', left(coalesce(p_motivo, ''), 500));
    return true;
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'una suspensión dice por qué' using errcode = '22023';
  end if;
  insert into espacios.suspensiones (usuario, cedula, hasta, motivo, por)
  -- La huella del registro de votante o, si lo borró antes de que se la
  -- suspendiera, la que dejó en lo último que escribió (90 días).
  values (p_usuario, coalesce(
            (select cedula_hash from democracia.votantes where id = p_usuario),
            (select cedula from espacios.comentarios where usuario = p_usuario and cedula is not null order by creado desc limit 1),
            (select abierto_cedula from espacios.hilos where abierto_por = p_usuario and abierto_cedula is not null order by creado desc limit 1)),
          now() + make_interval(days => least(p_dias, 3650)), btrim(p_motivo), auth.uid())
  on conflict (usuario) do update
    set cedula = coalesce(excluded.cedula, espacios.suspensiones.cedula), hasta = excluded.hasta,
        motivo = excluded.motivo, por = excluded.por, creado = now();
  insert into espacios.acciones_moderacion (moderador, objetivo_tipo, objetivo, accion, nota)
  values (auth.uid(), 'usuario', p_usuario::text, 'suspender', left(p_motivo, 500));
  return true;
end;
$$;

-- ─────────────────────────────────────────────── permisos de las funciones
-- Internas: ni `anon` ni `authenticated` las llaman directamente.
revoke all on function espacios.tipo_hilo_valido(text) from public, anon, authenticated;
revoke all on function espacios.ruta_de_tipo(text, text) from public, anon, authenticated;
revoke all on function espacios.abrir_hilo(text, text, text, text) from public, anon, authenticated;
revoke all on function espacios.mi_cedula() from public, anon, authenticated;
revoke all on function espacios.exigir_autoria() from public, anon, authenticated;
revoke all on function espacios.exigir_votante() from public, anon, authenticated;
revoke all on function espacios.estado_para_escribir(text, text) from public, anon, authenticated;
revoke all on function espacios.olvidar_huellas() from public, anon, authenticated;
revoke all on function espacios.contar_voto_comentario() from public, anon, authenticated;
revoke all on function espacios.contar_voto_hilo() from public, anon, authenticated;
revoke all on function espacios.contar_comentario() from public, anon, authenticated;
revoke all on function espacios.hilo_de_investigacion() from public, anon, authenticated;
-- De la sesión.
revoke all on function espacios.es_moderador() from public, anon;
revoke all on function espacios.suspendido_hasta() from public, anon;
revoke all on function espacios.cedula_registrada() from public, anon;
revoke all on function espacios.mi_estado_conversacion() from public, anon;
revoke all on function espacios.aceptar_normas() from public, anon;
revoke all on function espacios.comentar(text, text, text, text, uuid, text) from public, anon;
revoke all on function espacios.borrar_comentario(uuid) from public, anon;
revoke all on function espacios.votar_comentario(uuid, smallint) from public, anon;
revoke all on function espacios.votar_hilo(text, text, text, text, boolean) from public, anon;
revoke all on function espacios.denunciar(text, text, text, text) from public, anon;
revoke all on function espacios.cola_moderacion() from public, anon;
revoke all on function espacios.moderar(text, text, text, text) from public, anon;
revoke all on function espacios.retitular(text, text, text) from public, anon;
revoke all on function espacios.suspender(uuid, integer, text) from public, anon;
revoke all on function espacios.hilo(text, text) from public;
revoke all on function espacios.comunidad(text, integer, integer) from public;

grant execute on function espacios.es_moderador() to authenticated;
grant execute on function espacios.suspendido_hasta() to authenticated;
grant execute on function espacios.cedula_registrada() to authenticated;
grant execute on function espacios.mi_estado_conversacion() to authenticated;
grant execute on function espacios.aceptar_normas() to authenticated;
grant execute on function espacios.comentar(text, text, text, text, uuid, text) to authenticated;
grant execute on function espacios.borrar_comentario(uuid) to authenticated;
grant execute on function espacios.votar_comentario(uuid, smallint) to authenticated;
grant execute on function espacios.votar_hilo(text, text, text, text, boolean) to authenticated;
grant execute on function espacios.denunciar(text, text, text, text) to authenticated;
grant execute on function espacios.cola_moderacion() to authenticated;
grant execute on function espacios.moderar(text, text, text, text) to authenticated;
grant execute on function espacios.retitular(text, text, text) to authenticated;
grant execute on function espacios.suspender(uuid, integer, text) to authenticated;
grant execute on function espacios.hilo(text, text) to anon, authenticated;
grant execute on function espacios.comunidad(text, integer, integer) to anon, authenticated;
