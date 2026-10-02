-- Identidad v2 — Cuenta Única (docs/INFRAESTRUCTURA.md §10). Re-ejecutable.
--
-- Un votante puede quedar «declarado» (cédula tecleada, v1) o «verificado»
-- por Cuenta Única (OGTIC). La vinculación la hace SOLO la Edge Function
-- `vincular-cuenta-unica`, con la clave de servicio, después de verificar la
-- firma del ID token contra el JWKS del emisor. La aplicación no puede llamar
-- a `vincular_identidad`: no está concedida a `anon` ni a `authenticated`.

-- ─────────────────────────────────────────────── el rol de servicio entra al esquema
-- La base solo concedía USAGE a anon/authenticated; sin esto la Edge Function
-- recibe «permission denied for schema democracia» al llamar al RPC.
grant usage on schema democracia to service_role;

-- ─────────────────────────────────────────────── cierra el oráculo del pepper (v1)
-- Postgres concede EXECUTE a PUBLIC por defecto y v1 solo revocó a anon y
-- authenticated, que lo heredan de PUBLIC: cualquiera podía pedir el HMAC de
-- una cédula por REST y contrastarlo con un volcado de `votantes`.
revoke execute on function democracia.hash_cedula(text) from public, anon, authenticated;

-- ─────────────────────────────────────────────── votantes: origen de la identidad
alter table democracia.votantes
  add column if not exists origen     text        not null default 'declarada',
  add column if not exists verificado timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'votantes_origen_check') then
    alter table democracia.votantes
      add constraint votantes_origen_check check (origen in ('declarada', 'cuenta_unica'));
  end if;
end $$;

-- ─────────────────────────────────────────────── hash de un sujeto (el `sub` de Cuenta Única)
-- Mismo pepper que la cédula, con prefijo de espacio de nombres para que un
-- `sub` jamás colisione con el hash de una cédula. No se concede a nadie.
create or replace function democracia.hash_sujeto(p_sujeto text)
returns text language sql security definer set search_path = democracia, extensions as $$
  select encode(
    extensions.hmac(
      'cuenta_unica:' || p_sujeto,
      (select valor from democracia.secretos where clave = 'cedula_pepper'),
      'sha256'),
    'hex');
$$;
revoke execute on function democracia.hash_sujeto(text) from public, anon, authenticated;

-- ─────────────────────────────────────────────── vincular identidad verificada
-- p_cedula: solo si el ID token la trae y pasa el verificador; entonces la
-- clave es el hash de la cédula (misma que v1: quien la declaró bien conserva
-- su fila). Si no viene, la clave es el hash del `sub`.
create or replace function democracia.vincular_identidad(p_uid uuid, p_sub text, p_cedula text default null)
returns json language plpgsql security definer set search_path = democracia as $$
declare
  v_hash    text;
  v_actual  democracia.votantes%rowtype;
  v_existe  boolean;
begin
  if p_uid is null or not exists (select 1 from auth.users where id = p_uid) then
    return json_build_object('ok', false, 'error', 'sesion_requerida');
  end if;

  if p_cedula is not null and democracia.cedula_valida(p_cedula) then
    v_hash := democracia.hash_cedula(p_cedula);
  elsif coalesce(p_sub, '') <> '' then
    v_hash := democracia.hash_sujeto(p_sub);
  else
    return json_build_object('ok', false, 'error', 'sujeto_invalido');
  end if;

  select * into v_actual from democracia.votantes where id = p_uid;
  v_existe := found;

  if v_existe and v_actual.cedula_hash = v_hash and v_actual.origen = 'cuenta_unica' then
    return json_build_object('ok', true, 'estado', 'ya_vinculado');
  end if;

  -- Colisión: distinguir si quien ocupa el hash es otra Cuenta Única o una
  -- cédula tecleada sin verificar (v1), porque son dos situaciones distintas y
  -- la persona verificada tiene derecho a saber cuál es. Qué hacer con la
  -- declaración sin verificar lo decide el dueño (docs/INFRAESTRUCTURA.md §10.7); aquí no se
  -- desplaza a nadie.
  if exists (select 1 from democracia.votantes
              where cedula_hash = v_hash and id <> p_uid and origen = 'declarada') then
    return json_build_object('ok', false, 'error', 'cedula_declarada_en_uso');
  end if;
  if exists (select 1 from democracia.votantes where cedula_hash = v_hash and id <> p_uid) then
    return json_build_object('ok', false, 'error', 'identidad_en_uso');
  end if;

  if v_existe then
    update democracia.votantes
       set cedula_hash = v_hash, origen = 'cuenta_unica', verificado = now()
     where id = p_uid;
  else
    insert into democracia.votantes (id, cedula_hash, origen, verificado)
    values (p_uid, v_hash, 'cuenta_unica', now());
  end if;

  return json_build_object('ok', true, 'estado', 'vinculado');
end;
$$;
revoke execute on function democracia.vincular_identidad(uuid, text, text) from public, anon, authenticated;
grant  execute on function democracia.vincular_identidad(uuid, text, text) to service_role;

-- ─────────────────────────────────────────────── agregados: cuántos votos vienen de identidad verificada
-- Sigue exponiendo solo conteos. Los permisos existentes sobre la vista se conservan.
create or replace view democracia.agregados_publicos
with (security_invoker = false) as
  select v.camara, v.ref,
         count(*) filter (where v.valor = 1)                 as a_favor,
         count(*) filter (where v.valor = -1)                as en_contra,
         count(*)                                            as total,
         count(*) filter (where vt.origen = 'cuenta_unica')  as verificados
  from democracia.votos v
  join democracia.votantes vt on vt.id = v.votante_id
  group by v.camara, v.ref;
