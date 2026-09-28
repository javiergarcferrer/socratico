#!/usr/bin/env python3
"""Prueba las políticas del esquema `espacios` sin tocar el Supabase vivo.

Levanta un Postgres desechable (`pgserver`), simula lo que Supabase pone
debajo —los roles `anon` y `authenticated`, `auth.users`, `auth.uid()` y
`auth.jwt()` leídos de la sesión— y aplica la migración **dos veces** (tiene
que ser re-ejecutable). Después recorre el proyecto de una persona desde
cuatro lugares: quien lo creó, una colaboradora invitada, una extraña con
cuenta y alguien sin cuenta (`anon`). Cada caso dice qué debe pasar; al final
imprime cuántos fallaron. Cero es la única cifra aceptable.

Requiere: pip install pgserver "psycopg[binary]"

Uso:
    python3 supabase/pruebas/espacios_rls.py
"""
import pathlib
import tempfile

RAIZ = pathlib.Path(__file__).resolve().parents[2]
MIGRACION = RAIZ / "supabase" / "migrations" / "20260928120000_espacios.sql"
DATOS = tempfile.mkdtemp(prefix="espacios-rls-")
import pgserver, psycopg, json
srv = pgserver.get_server(DATOS, cleanup_mode="stop")
uri = srv.get_uri()
MIG = open(MIGRACION).read()
BASE = """
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
drop schema if exists espacios cascade; drop schema if exists auth cascade; drop schema if exists democracia cascade;
create schema auth; create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated;
create schema democracia; create table democracia.secretos (clave text primary key, valor text);
"""
A='00000000-0000-0000-0000-00000000000a'; B='00000000-0000-0000-0000-00000000000b'; C='00000000-0000-0000-0000-00000000000c'
with psycopg.connect(uri, autocommit=True) as cx:
    cx.execute(BASE); cx.execute(MIG); cx.execute(MIG)
    cx.execute(f"insert into auth.users values ('{A}','ana@x.do'),('{B}','beto@x.do'),('{C}','carla@x.do')")
fallos = 0
def como(uid, email, sql, rol='authenticated'):
    with psycopg.connect(uri, autocommit=True) as cx:
        cx.execute(f"set role {rol}")
        cx.execute("select set_config('request.jwt.claim.sub', %s, false), set_config('request.jwt.claims', %s, false)",
                   (uid or '', json.dumps({"email": email}) if email else ''))
        try:
            cur = cx.execute(sql)
            return ("ok", cur.fetchall() if cur.description else None)
        except Exception as e:
            return ("ERR", str(e).splitlines()[0])
def esperar(t, r, debe):
    global fallos
    bien = (r[0] == "ok") == (debe != "error") and (debe in ("ok","error") or r[1] == debe)
    if not bien: fallos += 1
    print(("PASS " if bien else "FAIL ") + f"{t}: {r}")
r = como(A,'ana@x.do',"insert into espacios.proyectos (titulo) values ('Caso INAPA') returning id"); esperar("A crea proyecto", r, "ok"); pid = r[1][0][0]
r = como(A,'ana@x.do',f"insert into espacios.entradas (proyecto,tipo,ref,titulo,href) values ('{pid}','institucion','635','INAPA','/instituciones/635-inapa'),('{pid}','proceso','X-1','Tuberías','/procesos/X-1') returning id"); esperar("A guarda 2", r, "ok"); e1, e2 = r[1][0][0], r[1][1][0]
esperar("A enlaza", como(A,'ana@x.do',f"insert into espacios.enlaces (proyecto,desde,hasta,nota) values ('{pid}','{e1}','{e2}','compra') returning nota"), [("compra",)])
esperar("C no ve proyecto", como(C,'carla@x.do',"select count(*) from espacios.proyectos"), [(0,)])
esperar("C no ve entradas", como(C,'carla@x.do',"select count(*) from espacios.entradas"), [(0,)])
esperar("C no escribe en proyecto ajeno", como(C,'carla@x.do',f"insert into espacios.entradas (proyecto,tipo,ref,titulo,href) values ('{pid}','norma','ley/1-20','x','/normativa/ley/1-20')"), "error")
esperar("C no se auto-invita", como(C,'carla@x.do',f"insert into espacios.invitaciones (proyecto,email,rol) values ('{pid}','carla@x.do','editor')"), "error")
esperar("C no se hace miembro", como(C,'carla@x.do',f"insert into espacios.miembros (proyecto,usuario,rol) values ('{pid}','{C}','editor')"), "error")
esperar("C no edita proyecto ajeno (0 filas)", como(C,'carla@x.do',f"update espacios.proyectos set titulo='x' where id='{pid}' returning id"), [])
esperar("A invita a BETO@ (mayúsculas)", como(A,'ana@x.do',f"insert into espacios.invitaciones (proyecto,email,rol) values ('{pid}','BETO@x.do','editor') returning rol"), [("editor",)])
esperar("B ve su invitación", como(B,'beto@x.do',"select count(*) from espacios.invitaciones"), [(1,)])
esperar("C no ve invitación ajena", como(C,'carla@x.do',"select count(*) from espacios.invitaciones"), [(0,)])
esperar("C no acepta la de B", como(C,'carla@x.do',"select espacios.aceptar_invitaciones()"), [(0,)])
esperar("B acepta", como(B,'beto@x.do',"select espacios.aceptar_invitaciones()"), [(1,)])
esperar("B ve entradas", como(B,'beto@x.do',"select count(*) from espacios.entradas"), [(2,)])
esperar("B edita nota", como(B,'beto@x.do',f"update espacios.entradas set nota='revisar' where id='{e2}' returning nota"), [("revisar",)])
esperar("B no publica", como(B,'beto@x.do',f"update espacios.proyectos set publico=true, slug='caso-inapa' where id='{pid}'"), "error")
esperar("B no borra proyecto (0 filas)", como(B,'beto@x.do',f"delete from espacios.proyectos where id='{pid}' returning id"), [])
esperar("B no invita (no es dueño)", como(B,'beto@x.do',f"insert into espacios.invitaciones (proyecto,email,rol) values ('{pid}','z@x.do','lector')"), "error")
r = como(B,'beto@x.do',f"select string_agg(rol||':'||nombre, ', ' order by rol) from espacios.miembros_de('{pid}')"); esperar("miembros_de por B", r, "ok"); print("     ", r[1])
esperar("miembros_de por C vacío", como(C,'carla@x.do',f"select count(*) from espacios.miembros_de('{pid}')"), [(0,)])
esperar("anon sin tablas", como(None,None,"select count(*) from espacios.proyectos",rol='anon'), "error")
esperar("anon no ejecuta miembros_de", como(None,None,f"select * from espacios.miembros_de('{pid}')",rol='anon'), "error")
esperar("anon: no publicado aún", como(None,None,"select espacios.publicado('caso-inapa') is null",rol='anon'), [(True,)])
esperar("A publica", como(A,'ana@x.do',f"update espacios.proyectos set publico=true, slug='caso-inapa' where id='{pid}' returning publico"), [(True,)])
esperar("publicar sin slug falla", como(A,'ana@x.do',f"update espacios.proyectos set slug=null where id='{pid}'"), "error")
r = como(None,None,"select espacios.publicado('caso-inapa')::text",rol='anon'); esperar("anon lee publicado", r, "ok")
t = r[1][0][0]; print("      sin uuid de usuario:", "0000000a" not in t and "0000000b" not in t, "| sin correo:", "@x.do" not in t)
esperar("C (logueada) no ve publicado por tabla", como(C,'carla@x.do',"select count(*) from espacios.proyectos"), [(0,)])
esperar("enlace cruzado rechazado", como(A,'ana@x.do',f"with p as (insert into espacios.proyectos (titulo) values ('Otro') returning id), e as (insert into espacios.entradas (proyecto,tipo,ref,titulo,href) select id,'norma','ley/2-20','L','/normativa/ley/2-20' from p returning id, proyecto) insert into espacios.enlaces (proyecto,desde,hasta) select e.proyecto, e.id, '{e1}' from e"), "error")
esperar("href javascript: rechazado", como(A,'ana@x.do',"insert into espacios.entradas (tipo,ref,titulo,href) values ('norma','z','z','javascript:alert(1)')"), "error")
esperar("href //evil rechazado", como(A,'ana@x.do',"insert into espacios.entradas (tipo,ref,titulo,href) values ('norma','z','z','//evil.com')"), "error")
esperar("tipo inventado rechazado", como(A,'ana@x.do',"insert into espacios.entradas (tipo,ref,titulo,href) values ('foo','z','z','/x')"), "error")
esperar("A guarda suelto", como(A,'ana@x.do',"insert into espacios.entradas (tipo,ref,titulo,href) values ('proveedor','34021','ADOCCO','/proveedores/34021') returning ref"), [("34021",)])
esperar("mismo suelto duplicado rechazado", como(A,'ana@x.do',"insert into espacios.entradas (tipo,ref,titulo,href) values ('proveedor','34021','ADOCCO','/proveedores/34021')"), "error")
esperar("A sigue", como(A,'ana@x.do',"insert into espacios.seguimientos (tipo,ref,titulo,href,huella) values ('proceso','X-1','T','/procesos/X-1','Abierto') returning huella"), [("Abierto",)])
esperar("seguimiento con href externo rechazado", como(A,'ana@x.do',"insert into espacios.seguimientos (tipo,ref,titulo,href) values ('norma','n','n','https://x.com')"), "error")
esperar("B no ve suelto de A", como(B,'beto@x.do',"select count(*) from espacios.entradas where proyecto is null"), [(0,)])
esperar("B no ve seguimientos de A", como(B,'beto@x.do',"select count(*) from espacios.seguimientos"), [(0,)])
esperar("B no se cambia a sí mismo de rol (0 filas)", como(B,'beto@x.do',f"update espacios.miembros set rol='editor' where usuario='{B}' returning rol"), [])
esperar("B se va", como(B,'beto@x.do',f"delete from espacios.miembros where usuario='{B}' returning rol"), [("editor",)])
esperar("B ya no ve", como(B,'beto@x.do',"select count(*) from espacios.entradas"), [(0,)])
esperar("perfil propio", como(A,'ana@x.do',f"insert into espacios.perfiles (id,nombre) values ('{A}','Ana P.') returning nombre"), [("Ana P.",)])
esperar("perfil ajeno rechazado", como(A,'ana@x.do',f"insert into espacios.perfiles (id,nombre) values ('{C}','X')"), "error")
esperar("autor en publicado", como(None,None,"select espacios.publicado('caso-inapa')->>'autor'",rol='anon'), [("Ana P.",)])
with psycopg.connect(uri, autocommit=True) as cx:
    print("secretos RLS:", cx.execute("select relrowsecurity from pg_class where oid='democracia.secretos'::regclass").fetchone())
    for t in ['perfiles','proyectos','miembros','invitaciones','entradas','enlaces','seguimientos']:
        assert cx.execute(f"select relrowsecurity from pg_class where oid='espacios.{t}'::regclass").fetchone()[0], t
print("FALLOS:", fallos)
raise SystemExit(1 if fallos else 0)
