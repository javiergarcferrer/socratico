#!/usr/bin/env python3
"""Prueba las políticas del esquema `espacios` sin tocar el Supabase vivo.

Levanta un Postgres desechable (`pgserver`), simula lo que Supabase pone
debajo —los roles `anon` y `authenticated`, `auth.users` con
`email_confirmed_at`, `auth.uid()` y `auth.jwt()` leídos de la sesión— y
aplica las migraciones de `espacios` y del endurecimiento de
`democracia.secretos` **dos veces** (tienen que ser re-ejecutables).

Después recorre el proyecto de una persona desde cinco lugares: quien lo
creó, una colaboradora invitada, una extraña con cuenta, alguien que reclama
en su sesión un correo ajeno sin haberlo verificado, y alguien sin cuenta
(`anon`). Incluye cada ataque que encontró la revisión del 2026-09-28: pasar
un proyecto publicado a otra cuenta, meter a alguien como miembro sin
invitación, abrir una invitación con un correo no verificado, guardar un
enlace que el navegador lee como otro sitio, y que un editor se lleve un
registro a otro proyecto. Cada caso dice qué debe pasar; al final imprime
cuántos fallaron. Cero es la única cifra aceptable.

Requiere: pip install pgserver "psycopg[binary]"

Uso:
    python3 supabase/pruebas/espacios_rls.py
"""
import json
import pathlib
import tempfile

import pgserver
import psycopg

RAIZ = pathlib.Path(__file__).resolve().parents[2]
MIGRACIONES = [
    RAIZ / "supabase" / "migrations" / "20260928120000_espacios.sql",
    RAIZ / "supabase" / "migrations" / "20260928120100_democracia_secretos_rls.sql",
    RAIZ / "supabase" / "migrations" / "20260928160000_caso.sql",
]

BASE = """
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
drop schema if exists espacios cascade; drop schema if exists auth cascade; drop schema if exists democracia cascade;
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated;
create schema democracia; create table democracia.secretos (clave text primary key, valor text);
insert into democracia.secretos values ('cedula_pepper', 'p');
create or replace function democracia.hash_cedula(p text) returns text language sql security definer
  set search_path = democracia as $$ select md5(p || (select valor from democracia.secretos where clave = 'cedula_pepper')) $$;
grant usage on schema democracia to authenticated; grant execute on function democracia.hash_cedula(text) to authenticated;
"""

A = "00000000-0000-0000-0000-00000000000a"  # dueña
B = "00000000-0000-0000-0000-00000000000b"  # colaboradora invitada
C = "00000000-0000-0000-0000-00000000000c"  # extraña con cuenta
D = "00000000-0000-0000-0000-00000000000d"  # reclama el correo de B sin verificarlo
E = "00000000-0000-0000-0000-00000000000e"  # correo sin confirmar

srv = pgserver.get_server(tempfile.mkdtemp(prefix="espacios-rls-"), cleanup_mode="stop")
uri = srv.get_uri()
with psycopg.connect(uri, autocommit=True) as cx:
    cx.execute(BASE)
    for _ in range(2):
        for m in MIGRACIONES:
            cx.execute(m.read_text())
    cx.execute(
        f"insert into auth.users values ('{A}','ana@x.do',now()),('{B}','beto@x.do',now()),"
        f"('{C}','carla@x.do',now()),('{D}','dario@x.do',now()),('{E}','eva@x.do',null)"
    )

fallos = 0


def como(uid, email, sql, rol="authenticated", params=None):
    with psycopg.connect(uri, autocommit=True) as cx:
        cx.execute(f"set role {rol}")
        cx.execute(
            "select set_config('request.jwt.claim.sub', %s, false), set_config('request.jwt.claims', %s, false)",
            (uid or "", json.dumps({"email": email}) if email else ""),
        )
        try:
            cur = cx.execute(sql, params)
            return ("ok", cur.fetchall() if cur.description else None)
        except Exception as e:  # noqa: BLE001 — el fallo es el resultado esperado de muchos casos
            return ("ERR", str(e).splitlines()[0])


def esperar(t, r, debe):
    global fallos
    bien = (r[0] == "ok") == (debe != "error") and (debe in ("ok", "error") or r[1] == debe)
    if not bien:
        fallos += 1
    print(("PASS " if bien else "FAIL ") + f"{t}: {r}")
    return r


# ---- la dueña arma su proyecto
r = esperar("A crea proyecto", como(A, "ana@x.do", "insert into espacios.proyectos (titulo) values ('Caso INAPA') returning id"), "ok")
pid = r[1][0][0]
r = esperar("A guarda 2", como(A, "ana@x.do", f"insert into espacios.entradas (proyecto,tipo,ref,titulo,href) values ('{pid}','institucion','/instituciones/635','INAPA','/instituciones/635-inapa'),('{pid}','proceso','/procesos/X-1','Tuberías','/procesos/X-1') returning id"), "ok")
e1, e2 = r[1][0][0], r[1][1][0]
esperar("A enlaza", como(A, "ana@x.do", f"insert into espacios.enlaces (proyecto,desde,hasta,nota) values ('{pid}','{e1}','{e2}','compra') returning nota"), [("compra",)])

# ---- el caso: relaciones tipadas, tablero, fechas (20260928160000_caso.sql)
esperar("un enlace sin tipo es «relaciona»", como(A, "ana@x.do", f"select tipo from espacios.enlaces where desde='{e1}'"), [("relaciona",)])
esperar("el mismo par con otro verbo pasa", como(A, "ana@x.do", f"insert into espacios.enlaces (proyecto,desde,hasta,tipo) values ('{pid}','{e1}','{e2}','adjudico') returning tipo"), [("adjudico",)])
esperar("el mismo par con el mismo verbo se rechaza", como(A, "ana@x.do", f"insert into espacios.enlaces (proyecto,desde,hasta,tipo) values ('{pid}','{e1}','{e2}','adjudico')"), "error")
esperar("un verbo inventado se rechaza", como(A, "ana@x.do", f"insert into espacios.enlaces (proyecto,desde,hasta,tipo) values ('{pid}','{e2}','{e1}','soborna')"), "error")
esperar("A cambia el verbo de un enlace", como(A, "ana@x.do", f"update espacios.enlaces set tipo='contrato' where desde='{e1}' and tipo='relaciona' returning tipo"), [("contrato",)])
esperar("A pone una tarjeta en el tablero", como(A, "ana@x.do", f"update espacios.entradas set x=120, y=-40 where id='{e1}' returning x, y"), [(120.0, -40.0)])
esperar("x sin y se rechaza", como(A, "ana@x.do", f"update espacios.entradas set x=10, y=null where id='{e1}'"), "error")
esperar("una posición absurda se rechaza", como(A, "ana@x.do", f"update espacios.entradas set x=1e9, y=0 where id='{e1}'"), "error")
esperar("A fecha un registro", como(A, "ana@x.do", f"update espacios.entradas set fecha='2024-03-12' where id='{e2}' returning fecha::text"), [("2024-03-12",)])
esperar("una fecha antes de la República se rechaza", como(A, "ana@x.do", f"update espacios.entradas set fecha='1700-01-01' where id='{e2}'"), "error")
esperar("lo suelto no lleva fecha", como(A, "ana@x.do", "insert into espacios.entradas (tipo,ref,titulo,href,fecha) values ('norma','/normativa/ley/7-20','L','/normativa/ley/7-20','2024-01-01')"), "error")
esperar("lo suelto no va al tablero", como(A, "ana@x.do", "insert into espacios.entradas (tipo,ref,titulo,href,x,y) values ('norma','/normativa/ley/7-21','L','/normativa/ley/7-21',1,1)"), "error")
antes_mover = como(A, "ana@x.do", f"select actualizado::text from espacios.entradas where id='{e1}'")[1][0][0]
como(A, "ana@x.do", f"update espacios.entradas set x=300, y=200 where id='{e1}'")
esperar("mover una tarjeta no la da por actualizada", como(A, "ana@x.do", f"select actualizado::text from espacios.entradas where id='{e1}'"), [(antes_mover,)])
esperar("C no mueve tarjetas ajenas (0 filas)", como(C, "carla@x.do", f"update espacios.entradas set x=0, y=0 where id='{e1}' returning id"), [])
esperar("C no retipa enlaces ajenos (0 filas)", como(C, "carla@x.do", f"update espacios.enlaces set tipo='pago' where proyecto='{pid}' returning id"), [])

# ---- la narración: solo por la función, con versión
DOC = json.dumps({"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Hipótesis"}]}]})
esperar("la narración no se escribe por tabla", como(A, "ana@x.do", f"update espacios.proyectos set narrativa='{{}}'::jsonb where id='{pid}'"), "error")
esperar("ni su versión", como(A, "ana@x.do", f"update espacios.proyectos set narrativa_version=99 where id='{pid}'"), "error")
esperar("A guarda la narración (v0 → 1)", como(A, "ana@x.do", "select espacios.guardar_narrativa(%s, %s::jsonb, 0)", params=(pid, DOC)), [(1,)])
esperar("guardar sobre una versión vieja no pisa (null)", como(A, "ana@x.do", "select espacios.guardar_narrativa(%s, %s::jsonb, 0)", params=(pid, DOC)), [(None,)])
esperar("sobre la vigente, sí (1 → 2)", como(A, "ana@x.do", "select espacios.guardar_narrativa(%s, %s::jsonb, 1)", params=(pid, DOC)), [(2,)])
esperar("un documento que no es del editor se rechaza", como(A, "ana@x.do", "select espacios.guardar_narrativa(%s, '[1]'::jsonb, 2)", params=(pid,)), "error")
esperar("una narración enorme se rechaza", como(A, "ana@x.do", "select espacios.guardar_narrativa(%s, jsonb_build_object('type','doc','t',repeat('x',210000)), 2)", params=(pid,)), "error")
esperar("C no guarda narración ajena", como(C, "carla@x.do", "select espacios.guardar_narrativa(%s, %s::jsonb, 2)", params=(pid, DOC)), "error")
esperar("anon no guarda narración", como(None, None, "select espacios.guardar_narrativa(%s, %s::jsonb, 2)", rol="anon", params=(pid, DOC)), "error")
esperar("ni al crear un proyecto", como(A, "ana@x.do", "insert into espacios.proyectos (titulo, narrativa_version) values ('x', 7)"), "error")
esperar("crear con título y descripción sigue pasando", como(A, "ana@x.do", "insert into espacios.proyectos (titulo, descripcion) values ('Nuevo', 'd') returning narrativa_version"), [(0,)])
esperar("la versión quedó en 2", como(A, "ana@x.do", f"select narrativa_version from espacios.proyectos where id='{pid}'"), [(2,)])

# ---- una extraña no ve ni toca nada
esperar("C no ve proyecto", como(C, "carla@x.do", "select count(*) from espacios.proyectos"), [(0,)])
esperar("C no ve entradas", como(C, "carla@x.do", "select count(*) from espacios.entradas"), [(0,)])
esperar("C no escribe en proyecto ajeno", como(C, "carla@x.do", f"insert into espacios.entradas (proyecto,tipo,ref,titulo,href) values ('{pid}','norma','/normativa/ley/1-20','x','/normativa/ley/1-20')"), "error")
esperar("C no se auto-invita", como(C, "carla@x.do", f"insert into espacios.invitaciones (proyecto,email,rol) values ('{pid}','carla@x.do','editor')"), "error")
esperar("C no se hace miembro", como(C, "carla@x.do", f"insert into espacios.miembros (proyecto,usuario,rol) values ('{pid}','{C}','editor')"), "error")
esperar("C no edita proyecto ajeno (0 filas)", como(C, "carla@x.do", f"update espacios.proyectos set titulo='x' where id='{pid}' returning id"), [])

# ---- invitación con consentimiento y correo verificado
r = esperar("A invita a BETO@ (mayúsculas)", como(A, "ana@x.do", f"insert into espacios.invitaciones (proyecto,email,rol) values ('{pid}','BETO@x.do','editor') returning id"), "ok")
inv_b = r[1][0][0]
esperar("B ve su invitación con título", como(B, "beto@x.do", "select titulo, rol from espacios.mis_invitaciones()"), [("Caso INAPA", "editor")])
esperar("B no es miembro antes de aceptar", como(B, "beto@x.do", "select count(*) from espacios.entradas"), [(0,)])
esperar("C no ve invitación ajena", como(C, "carla@x.do", "select count(*) from espacios.invitaciones"), [(0,)])
esperar("D (JWT con correo de B, sin verificar) no la ve", como(D, "beto@x.do", "select count(*) from espacios.mis_invitaciones()"), [(0,)])
esperar("D (JWT con correo de B) no la acepta", como(D, "beto@x.do", f"select espacios.aceptar_invitacion('{inv_b}')"), [(None,)])
esperar("D no la ve por tabla", como(D, "beto@x.do", "select count(*) from espacios.invitaciones"), [(0,)])
r = esperar("A invita a eva@ (correo sin confirmar)", como(A, "ana@x.do", f"insert into espacios.invitaciones (proyecto,email,rol) values ('{pid}','eva@x.do','lector') returning id"), "ok")
inv_e = r[1][0][0]
esperar("E sin confirmar no la acepta", como(E, "eva@x.do", f"select espacios.aceptar_invitacion('{inv_e}')"), [(None,)])
esperar("C no acepta la de B por id", como(C, "carla@x.do", f"select espacios.aceptar_invitacion('{inv_b}')"), [(None,)])
esperar("B acepta la suya", como(B, "beto@x.do", f"select espacios.aceptar_invitacion('{inv_b}') = '{pid}'"), [(True,)])
esperar("B ve entradas", como(B, "beto@x.do", "select count(*) from espacios.entradas"), [(2,)])
esperar("B edita nota", como(B, "beto@x.do", f"update espacios.entradas set nota='revisar' where id='{e2}' returning nota"), [("revisar",)])
esperar("B editor mueve una tarjeta", como(B, "beto@x.do", f"update espacios.entradas set x=5, y=5 where id='{e2}' returning x"), [(5.0,)])
esperar("B editor retipa un enlace", como(B, "beto@x.do", f"update espacios.enlaces set tipo='pago' where tipo='contrato' and proyecto='{pid}' returning tipo"), [("pago",)])
esperar("B editor guarda la narración (2 → 3)", como(B, "beto@x.do", "select espacios.guardar_narrativa(%s, %s::jsonb, 2)", params=(pid, DOC)), [(3,)])

# ---- lo que un editor no puede
esperar("B no publica", como(B, "beto@x.do", f"update espacios.proyectos set publico=true, slug='caso-inapa' where id='{pid}'"), "error")
esperar("B no borra proyecto (0 filas)", como(B, "beto@x.do", f"delete from espacios.proyectos where id='{pid}' returning id"), [])
esperar("B no invita (no es dueño)", como(B, "beto@x.do", f"insert into espacios.invitaciones (proyecto,email,rol) values ('{pid}','z@x.do','lector')"), "error")
esperar("B no se lleva una entrada a su bandeja", como(B, "beto@x.do", f"update espacios.entradas set proyecto=null where id='{e1}'"), "error")
esperar("B no cambia el autor de una entrada", como(B, "beto@x.do", f"update espacios.entradas set usuario='{B}' where id='{e1}'"), "error")
esperar("B no mueve un enlace de proyecto", como(B, "beto@x.do", f"update espacios.enlaces set proyecto='{pid}'"), "error")
esperar("B no se cambia a sí mismo de rol (0 filas)", como(B, "beto@x.do", f"update espacios.miembros set rol='editor' where usuario='{B}' returning rol"), [])

# ---- lo que ni la dueña puede
esperar("A no pasa el proyecto a otra cuenta", como(A, "ana@x.do", f"update espacios.proyectos set dueno='{C}' where id='{pid}'"), "error")
esperar("A no mete a C cambiando un miembro", como(A, "ana@x.do", f"update espacios.miembros set usuario='{C}' where usuario='{B}'"), "error")
esperar("A no mete a C por inserción", como(A, "ana@x.do", f"insert into espacios.miembros (proyecto,usuario,rol) values ('{pid}','{C}','editor')"), "error")
esperar("A sí cambia el rol de B", como(A, "ana@x.do", f"update espacios.miembros set rol='lector' where usuario='{B}' returning rol"), [("lector",)])
esperar("B lectora ya no edita nota (0 filas)", como(B, "beto@x.do", f"update espacios.entradas set nota='x' where id='{e2}' returning id"), [])
esperar("B lectora no mueve tarjetas (0 filas)", como(B, "beto@x.do", f"update espacios.entradas set x=1, y=1 where id='{e2}' returning id"), [])
esperar("B lectora no guarda la narración", como(B, "beto@x.do", "select espacios.guardar_narrativa(%s, %s::jsonb, 3)", params=(pid, DOC)), "error")
esperar("B lectora sí la lee", como(B, "beto@x.do", f"select narrativa->>'type' from espacios.proyectos where id='{pid}'"), [("doc",)])

r = esperar("miembros_de por B", como(B, "beto@x.do", f"select string_agg(rol||':'||nombre, ', ' order by rol) from espacios.miembros_de('{pid}')"), "ok")
print("     ", r[1])
esperar("miembros_de por C vacío", como(C, "carla@x.do", f"select count(*) from espacios.miembros_de('{pid}')"), [(0,)])

# ---- anon y lo publicado
esperar("anon sin tablas", como(None, None, "select count(*) from espacios.proyectos", rol="anon"), "error")
esperar("anon no ejecuta miembros_de", como(None, None, f"select * from espacios.miembros_de('{pid}')", rol="anon"), "error")
esperar("anon no ejecuta mis_invitaciones", como(None, None, "select * from espacios.mis_invitaciones()", rol="anon"), "error")
esperar("anon: no publicado aún", como(None, None, "select espacios.publicado('caso-inapa') is null", rol="anon"), [(True,)])
esperar("A publica", como(A, "ana@x.do", f"update espacios.proyectos set publico=true, slug='caso-inapa' where id='{pid}' returning publico"), [(True,)])
esperar("publicar sin slug falla", como(A, "ana@x.do", f"update espacios.proyectos set slug=null where id='{pid}'"), "error")
r = esperar("anon lee publicado", como(None, None, "select espacios.publicado('caso-inapa')::text", rol="anon"), "ok")
t = r[1][0][0]
pub = json.loads(t)
esperar("publicado trae la narración", ("ok", [pub["narrativa"]["type"]]), ["doc"])
esperar("publicado trae el verbo de cada enlace", ("ok", sorted(l["tipo"] for l in pub["enlaces"])), ["adjudico", "pago"])
esperar("publicado trae fecha y tablero", ("ok", sorted(((e["fecha"] or ""), e["x"]) for e in pub["entradas"])), [("", 300.0), ("2024-03-12", 5.0)])
esperar("publicado sin uuid de usuario ni correo", ("ok", ["0000000a" not in t and "0000000b" not in t and "@x.do" not in t]), ["True" == "True"] and [True])
antes = como(None, None, "select espacios.publicado('caso-inapa')->>'actualizado'", rol="anon")[1][0][0]
como(A, "ana@x.do", f"update espacios.entradas set nota='nueva' where id='{e1}'")
despues = como(None, None, "select espacios.publicado('caso-inapa')->>'actualizado'", rol="anon")[1][0][0]
esperar("«actualizada» cuenta la nota nueva", ("ok", [despues > antes]), [True])
esperar("C (con cuenta) no ve publicado por tabla", como(C, "carla@x.do", "select count(*) from espacios.proyectos"), [(0,)])

# ---- enlaces y referencias
r = como(A, "ana@x.do", "insert into espacios.proyectos (titulo) values ('Otro') returning id")
pid2 = r[1][0][0]
r = como(A, "ana@x.do", f"insert into espacios.entradas (proyecto,tipo,ref,titulo,href) values ('{pid2}','norma','/normativa/ley/2-20','L','/normativa/ley/2-20') returning id")
e3 = r[1][0][0]
esperar("el disparador rechaza un enlace entre dos proyectos de la misma dueña", como(A, "ana@x.do", f"insert into espacios.enlaces (proyecto,desde,hasta) values ('{pid}','{e1}','{e3}')"), "error")
for nombre, h in [
    ("javascript:", "javascript:alert(1)"),
    ("//otro", "//evil.com"),
    ("/\\otro", "/\\evil.com"),
    ("/<tab>/otro", "/\t/evil.com"),
    ("/<salto>/otro", "/\n/evil.com"),
    ("https con espacio", "https://x.gob.do/a b"),
    ("http sin s", "http://x.gob.do/a"),
    ("puerto imposible", "https://x.gob.do:99999/a"),
]:
    esperar(f"href {nombre} rechazado", como(A, "ana@x.do", "insert into espacios.entradas (tipo,ref,titulo,href) values ('documento','z','z',%s)", params=(h,)), "error")
esperar("href propio aceptado", como(A, "ana@x.do", "insert into espacios.entradas (tipo,ref,titulo,href) values ('norma','/normativa/ley/9-20','L','/normativa/ley/9-20') returning ref"), [("/normativa/ley/9-20",)])
esperar("href https de institución aceptado", como(A, "ana@x.do", "insert into espacios.entradas (tipo,ref,titulo,href) values ('documento','doc','D','https://www.dgcp.gob.do/wp-content/uploads/a.pdf') returning ref"), [("doc",)])
esperar("tipo inventado rechazado", como(A, "ana@x.do", "insert into espacios.entradas (tipo,ref,titulo,href) values ('foo','z','z','/x')"), "error")
esperar("A guarda suelto", como(A, "ana@x.do", "insert into espacios.entradas (tipo,ref,titulo,href) values ('proveedor','/proveedores/34021','ADOCCO','/proveedores/34021') returning tipo"), [("proveedor",)])
esperar("mismo suelto duplicado rechazado", como(A, "ana@x.do", "insert into espacios.entradas (tipo,ref,titulo,href) values ('proveedor','/proveedores/34021','ADOCCO','/proveedores/34021')"), "error")

# ---- lo que se sigue
esperar("A sigue", como(A, "ana@x.do", "insert into espacios.seguimientos (tipo,ref,titulo,href,huella) values ('proceso','X-1','T','/procesos/X-1','Abierto') returning huella"), [("Abierto",)])
esperar("seguimiento con href externo rechazado", como(A, "ana@x.do", "insert into espacios.seguimientos (tipo,ref,titulo,href) values ('norma','n','n','https://x.com')"), "error")
esperar("B no ve suelto de A", como(B, "beto@x.do", "select count(*) from espacios.entradas where proyecto is null"), [(0,)])
esperar("B no ve seguimientos de A", como(B, "beto@x.do", "select count(*) from espacios.seguimientos"), [(0,)])
como(A, "ana@x.do", "insert into espacios.seguimientos (tipo,ref,titulo,href) select 'proceso', 'P-'||g, 'T', '/procesos/P-'||g from generate_series(1, 999) g")
esperar("en el tope, una pieza más se rechaza", como(A, "ana@x.do", "insert into espacios.seguimientos (tipo,ref,titulo,href) values ('proceso','P-extra','T','/procesos/P-extra')"), "error")
esperar("en el tope, marcar visto (upsert) pasa", como(A, "ana@x.do", "insert into espacios.seguimientos (tipo,ref,titulo,href,visto) values ('proceso','X-1','T','/procesos/X-1',now()) on conflict (usuario,tipo,ref) do update set visto = excluded.visto returning ref"), [("X-1",)])

# ---- irse, perfil
esperar("B se va", como(B, "beto@x.do", f"delete from espacios.miembros where usuario='{B}' returning rol"), [("lector",)])
esperar("B ya no ve", como(B, "beto@x.do", "select count(*) from espacios.entradas"), [(0,)])
esperar("perfil propio", como(A, "ana@x.do", f"insert into espacios.perfiles (id,nombre) values ('{A}','Ana P.') returning nombre"), [("Ana P.",)])
esperar("perfil ajeno rechazado", como(A, "ana@x.do", f"insert into espacios.perfiles (id,nombre) values ('{C}','X')"), "error")
esperar("autor en publicado", como(None, None, "select espacios.publicado('caso-inapa')->>'autor'", rol="anon"), [("Ana P.",)])

# ---- la otra excepción sigue funcionando con RLS en secretos
esperar("hash_cedula sigue respondiendo con RLS en secretos", como(A, "ana@x.do", "select democracia.hash_cedula('00100000001') is not null"), [(True,)])
esperar("secretos no se lee directo", como(A, "ana@x.do", "select * from democracia.secretos"), "error")
with psycopg.connect(uri, autocommit=True) as cx:
    for t in ["perfiles", "proyectos", "miembros", "invitaciones", "entradas", "enlaces", "seguimientos"]:
        if not cx.execute(f"select relrowsecurity from pg_class where oid='espacios.{t}'::regclass").fetchone()[0]:
            fallos += 1
            print(f"FAIL RLS apagada en espacios.{t}")
    if not cx.execute("select relrowsecurity from pg_class where oid='democracia.secretos'::regclass").fetchone()[0]:
        fallos += 1
        print("FAIL RLS apagada en democracia.secretos")

print("FALLOS:", fallos)
raise SystemExit(1 if fallos else 0)
