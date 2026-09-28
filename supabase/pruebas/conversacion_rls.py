#!/usr/bin/env python3
"""Prueba la conversación (hilos, comentarios, votos, denuncias, moderación)
sin tocar el Supabase vivo.

Mismo andamio que `espacios_rls.py`: un Postgres desechable (`pgserver`) que
simula `auth` y `democracia.votantes`, con las migraciones de `espacios`, del
endurecimiento de `democracia.secretos` y de la conversación aplicadas **dos
veces**. Recorre la conversación desde quien registró su cédula, quien solo
tiene cuenta, quien no confirmó su correo, una cuenta suspendida, la
moderadora y `anon`, e incluye cada abuso que el diseño promete impedir:
comentar sin cédula, sin normas o suspendido; votar lo propio; abrir el hilo
de «un proceso» que lleva a otra página; leer el texto de lo oculto; escribir
directo en las tablas; que una sola cuenta oculte algo a fuerza de denuncias;
y moderar sin serlo. Cero fallos es la única cifra aceptable.

Requiere: pip install pgserver "psycopg[binary]"

Uso:
    python3 supabase/pruebas/conversacion_rls.py
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
    RAIZ / "supabase" / "migrations" / "20260928140000_conversacion.sql",
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
create table democracia.votantes (id uuid primary key references auth.users (id) on delete cascade, cedula_hash text unique not null);
"""

V = "00000000-0000-0000-0000-0000000000a1"  # registró su cédula: comenta
W = "00000000-0000-0000-0000-0000000000a2"  # también registró su cédula
S = "00000000-0000-0000-0000-0000000000a3"  # solo cuenta: vota, no comenta
N = "00000000-0000-0000-0000-0000000000a4"  # correo sin confirmar
X = "00000000-0000-0000-0000-0000000000a5"  # registró cédula y será suspendida
M = "00000000-0000-0000-0000-0000000000a6"  # moderadora

srv = pgserver.get_server(tempfile.mkdtemp(prefix="conversacion-rls-"), cleanup_mode="stop")
uri = srv.get_uri()
with psycopg.connect(uri, autocommit=True) as cx:
    cx.execute(BASE)
    for _ in range(2):
        for m in MIGRACIONES:
            cx.execute(m.read_text())
    cx.execute(
        f"insert into auth.users values ('{V}','vera@x.do',now()),('{W}','walter@x.do',now()),"
        f"('{S}','sara@x.do',now()),('{N}','nico@x.do',null),('{X}','ximena@x.do',now()),('{M}','mode@x.do',now())"
    )
    cx.execute(f"insert into democracia.votantes values ('{V}','h1'),('{W}','h2'),('{X}','h3')")
    cx.execute(f"insert into espacios.moderadores values ('{M}')")

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


P = ("proceso", "/procesos/INAPA-2026-1", "Tuberías para INAPA", "/procesos/INAPA-2026-1")
COMENTAR = "select espacios.comentar(%s,%s,%s,%s,%s,%s)"


def comentar(uid, email, cuerpo, padre=None, hilo=P):
    return como(uid, email, COMENTAR, params=(*hilo, padre, cuerpo))


# ---- antes de cumplir los requisitos
esperar("anon no comenta", como(None, None, COMENTAR, rol="anon", params=(*P, None, "hola")), "error")
esperar("S (sin cédula) no comenta", comentar(S, "sara@x.do", "hola a todos"), "error")
esperar("V sin nombre no acepta normas", como(V, "vera@x.do", "select espacios.aceptar_normas()"), "error")
esperar("V pone nombre", como(V, "vera@x.do", f"insert into espacios.perfiles (id,nombre) values ('{V}','Vera') returning nombre"), [("Vera",)])
esperar("V sin normas no comenta", comentar(V, "vera@x.do", "hola a todos"), "error")
esperar("V acepta normas", como(V, "vera@x.do", "select espacios.aceptar_normas()"), [(True,)])
esperar("estado de V", como(V, "vera@x.do", "select (x->>'cedula')::bool, (x->>'normas')::bool, x->>'nombre' from espacios.mi_estado_conversacion() x"), [(True, True, "Vera")])
esperar("estado de S: sin cédula", como(S, "sara@x.do", "select (x->>'cedula')::bool from espacios.mi_estado_conversacion() x"), [(False,)])

# ---- la clave de un hilo es la ruta de su ficha
esperar("hilo cuyo href no es su ref", comentar(V, "vera@x.do", "hola", hilo=("proceso", "/procesos/A", "t", "/procesos/B")), "error")
esperar("hilo de proceso que lleva a otra sección", comentar(V, "vera@x.do", "hola", hilo=("proceso", "/democracia/x", "t", "/democracia/x")), "error")
esperar("hilo con ruta de dos barras", comentar(V, "vera@x.do", "hola", hilo=("proceso", "//evil.com/procesos/x", "t", "//evil.com/procesos/x")), "error")
esperar("hilo de tipo sin ficha (sentencia)", comentar(V, "vera@x.do", "hola", hilo=("sentencia", "/constitucional/1", "t", "/constitucional/1")), "error")
esperar("hilo de investigación no publicada", comentar(V, "vera@x.do", "hola", hilo=("investigacion", "no-existe", "t", "/p/no-existe")), "error")

# ---- comentar y responder
r = esperar("V comenta", comentar(V, "vera@x.do", "¿Por qué el monto subió 40 %?"), "ok")
c1 = str(r[1][0][0])
esperar("W sin normas no responde", comentar(W, "walter@x.do", "buena pregunta", padre=c1), "error")
como(W, "walter@x.do", f"insert into espacios.perfiles (id,nombre) values ('{W}','Walter')")
como(W, "walter@x.do", "select espacios.aceptar_normas()")
r = esperar("W responde", comentar(W, "walter@x.do", "Buena pregunta: la enmienda lo explica.", padre=c1), "ok")
c2 = str(r[1][0][0])
esperar("respuesta a comentario de otro hilo", comentar(W, "walter@x.do", "x", padre=c1, hilo=("proceso", "/procesos/OTRO", "Otro", "/procesos/OTRO")), "error")
esperar("comentario de 1 carácter", comentar(V, "vera@x.do", "a"), "error")
esperar("comentario con 4 enlaces", comentar(V, "vera@x.do", "https://a https://b https://c https://d"), "error")
esperar("hilo cuenta 2", como(None, None, "select (x->>'comentarios')::int from espacios.hilo(%s,%s) x", rol="anon", params=(P[0], P[1])), [(2,)])
esperar("anon lee autores y textos", como(None, None, "select e->>'autor', e->>'cuerpo' from jsonb_array_elements((espacios.hilo(%s,%s))->'lista') e order by e->>'creado'", rol="anon", params=(P[0], P[1])),
        [("Vera", "¿Por qué el monto subió 40 %?"), ("Walter", "Buena pregunta: la enmienda lo explica.")])
esperar("anon no ve ids de usuario", como(None, None, "select position('usuario' in espacios.hilo(%s,%s)::text) = 0 and position(%s in espacios.hilo(%s,%s)::text) = 0", rol="anon", params=(P[0], P[1], V, P[0], P[1])), [(True,)])

# ---- ritmo: cinco en diez minutos
for i in range(4):
    comentar(V, "vera@x.do", f"sigo pensando {i}")
esperar("V llega al tope de ritmo", comentar(V, "vera@x.do", "uno más"), "error")
# Pasa el tiempo: lo de V queda de hace una hora y el tope de diez minutos se libera.
with psycopg.connect(uri, autocommit=True) as cx:
    cx.execute(f"update espacios.comentarios set creado = creado - interval '1 hour' where usuario = '{V}'")

# ---- nadie escribe en las tablas
esperar("V no inserta comentario directo", como(V, "vera@x.do", f"insert into espacios.comentarios (hilo_tipo,hilo_ref,usuario,cuerpo) values ('proceso','/procesos/INAPA-2026-1','{V}','x')"), "error")
esperar("V no edita comentario ajeno", como(V, "vera@x.do", f"update espacios.comentarios set cuerpo='x' where id='{c2}'"), "error")
esperar("V no lee la tabla de comentarios", como(V, "vera@x.do", "select count(*) from espacios.comentarios"), "error")
esperar("anon no lee denuncias", como(None, None, "select count(*) from espacios.denuncias", rol="anon"), "error")
esperar("V no se hace moderadora", como(V, "vera@x.do", f"insert into espacios.moderadores values ('{V}')"), "error")
esperar("anon no ejecuta comentar", como(None, None, "select has_function_privilege('anon','espacios.comentar(text,text,text,text,uuid,text)','execute')", rol="anon"), [(False,)])
esperar("authenticated no ejecuta abrir_hilo", como(V, "vera@x.do", "select espacios.abrir_hilo('proceso','/procesos/Z','t','/procesos/Z')"), "error")

# ---- votos
esperar("V no vota su comentario", como(V, "vera@x.do", "select espacios.votar_comentario(%s, 1::smallint)", params=(c1,)), "error")
esperar("S (solo cuenta) vota comentario", como(S, "sara@x.do", "select espacios.votar_comentario(%s, 1::smallint)", params=(c1,)), [(1,)])
esperar("W vota abajo", como(W, "walter@x.do", "select espacios.votar_comentario(%s, -1::smallint)", params=(c1,)), [(0,)])
esperar("W cambia a arriba", como(W, "walter@x.do", "select espacios.votar_comentario(%s, 1::smallint)", params=(c1,)), [(2,)])
esperar("W quita su voto", como(W, "walter@x.do", "select espacios.votar_comentario(%s, 0::smallint)", params=(c1,)), [(1,)])
esperar("voto de valor 5", como(W, "walter@x.do", "select espacios.votar_comentario(%s, 5::smallint)", params=(c1,)), "error")
esperar("N (correo sin confirmar) no vota", como(N, "nico@x.do", "select espacios.votar_comentario(%s, 1::smallint)", params=(c1,)), "error")
esperar("anon no vota", como(None, None, "select espacios.votar_comentario(%s, 1::smallint)", rol="anon", params=(c1,)), "error")
esperar("S dice que importa", como(S, "sara@x.do", "select espacios.votar_hilo(%s,%s,%s,%s,true)", params=P), [(1,)])
esperar("S lo dice dos veces: sigue 1", como(S, "sara@x.do", "select espacios.votar_hilo(%s,%s,%s,%s,true)", params=P), [(1,)])
esperar("V también", como(V, "vera@x.do", "select espacios.votar_hilo(%s,%s,%s,%s,true)", params=P), [(2,)])
esperar("S lo retira", como(S, "sara@x.do", "select espacios.votar_hilo(%s,%s,%s,%s,false)", params=P), [(1,)])
esperar("W dice que importa", como(W, "walter@x.do", "select espacios.votar_hilo(%s,%s,%s,%s,true)", params=P), [(2,)])
esperar("mi_voto de V en el hilo", como(V, "vera@x.do", "select (x->>'mi_voto')::bool from espacios.hilo(%s,%s) x", params=(P[0], P[1])), [(True,)])
esperar("votar abre hilo nuevo (obra)", como(S, "sara@x.do", "select espacios.votar_hilo('obra','/obras/123','Acueducto','/obras/123',true)"), [(1,)])

# ---- el feed
esperar("feed destacado trae 2 hilos", como(None, None, "select jsonb_array_length(espacios.comunidad('destacado', 30, 0))", rol="anon"), [(2,)])
esperar("feed votado: el proceso primero", como(None, None, "select espacios.comunidad('votado', 30, 0)->0->>'ref'", rol="anon"), [("/procesos/INAPA-2026-1",)])
esperar("feed nuevo: la obra primero", como(None, None, "select espacios.comunidad('nuevo', 30, 0)->0->>'ref'", rol="anon"), [("/obras/123",)])
esperar("feed con límite 1", como(None, None, "select jsonb_array_length(espacios.comunidad('nuevo', 1, 0))", rol="anon"), [(1,)])

# ---- denuncias: una cuenta sola no oculta nada
esperar("S denuncia c2", como(S, "sara@x.do", "select espacios.denunciar('comentario', %s, 'difamacion', 'acusa sin pruebas')", params=(c2,)), [(True,)])
esperar("S denuncia c2 otra vez (no suma)", como(S, "sara@x.do", "select espacios.denunciar('comentario', %s, 'difamacion', '')", params=(c2,)), [(True,)])
esperar("V denuncia c2", como(V, "vera@x.do", "select espacios.denunciar('comentario', %s, 'acoso', '')", params=(c2,)), [(True,)])
esperar("c2 sigue visible con 2 denuncias", como(None, None, "select e->>'estado' from jsonb_array_elements((espacios.hilo(%s,%s))->'lista') e where e->>'id' = %s", rol="anon", params=(P[0], P[1], c2)), [("visible",)])
esperar("motivo inventado", como(M, "mode@x.do", "select espacios.denunciar('comentario', %s, 'me-cae-mal', '')", params=(c2,)), "error")
esperar("M denuncia c2 (tercera)", como(M, "mode@x.do", "select espacios.denunciar('comentario', %s, 'falso', '')", params=(c2,)), [(True,)])
esperar("c2 oculto: sin texto ni autor", como(None, None, "select e->>'estado', e->>'cuerpo', e->>'autor' from jsonb_array_elements((espacios.hilo(%s,%s))->'lista') e where e->>'id' = %s", rol="anon", params=(P[0], P[1], c2)), [("oculto", None, None)])
esperar("no se responde a lo oculto", comentar(V, "vera@x.do", "x", padre=c2), "error")

# ---- moderación
esperar("V no ve la cola", como(V, "vera@x.do", "select espacios.cola_moderacion()"), "error")
esperar("V no modera", como(V, "vera@x.do", "select espacios.moderar('comentario', %s, 'restaurar', '')", params=(c2,)), "error")
esperar("M ve c2 en la cola con 3 denuncias", como(M, "mode@x.do", "select jsonb_array_length(c->'denuncias') from jsonb_array_elements(espacios.cola_moderacion()->'comentarios') c where c->>'id' = %s", params=(c2,)), [(3,)])
esperar("M restaura c2", como(M, "mode@x.do", "select espacios.moderar('comentario', %s, 'restaurar', 'crítica, no difamación')", params=(c2,)), [(True,)])
esperar("c2 visible otra vez", como(None, None, "select e->>'estado' from jsonb_array_elements((espacios.hilo(%s,%s))->'lista') e where e->>'id' = %s", rol="anon", params=(P[0], P[1], c2)), [("visible",)])
esperar("cola vacía tras resolver", como(M, "mode@x.do", "select jsonb_array_length(espacios.cola_moderacion()->'comentarios')"), [(0,)])
esperar("M retira c2", como(M, "mode@x.do", "select espacios.moderar('comentario', %s, 'retirar', 'datos personales')", params=(c2,)), [(True,)])
esperar("acciones registradas", como(M, "mode@x.do", "select count(*) from espacios.acciones_moderacion"), "error")
with psycopg.connect(uri, autocommit=True) as cx:
    n = cx.execute("select count(*) from espacios.acciones_moderacion").fetchone()[0]
    print(("PASS " if n == 2 else "FAIL ") + f"dos acciones en el registro: {n}")
    fallos += 0 if n == 2 else 1

# ---- suspensión
como(X, "ximena@x.do", f"insert into espacios.perfiles (id,nombre) values ('{X}','Ximena')")
como(X, "ximena@x.do", "select espacios.aceptar_normas()")
esperar("X comenta antes", comentar(X, "ximena@x.do", "primer comentario"), "ok")
esperar("V no suspende", como(V, "vera@x.do", "select espacios.suspender(%s, 7, 'x')", params=(X,)), "error")
esperar("M suspende sin motivo", como(M, "mode@x.do", "select espacios.suspender(%s, 7, '')", params=(X,)), "error")
esperar("M suspende a X", como(M, "mode@x.do", "select espacios.suspender(%s, 7, 'acoso reiterado')", params=(X,)), [(True,)])
esperar("X suspendida no comenta", comentar(X, "ximena@x.do", "otro"), "error")
esperar("X suspendida no vota", como(X, "ximena@x.do", "select espacios.votar_hilo(%s,%s,%s,%s,true)", params=P), "error")
esperar("M levanta la suspensión", como(M, "mode@x.do", "select espacios.suspender(%s, 0, 'cumplió')", params=(X,)), [(True,)])
esperar("X vuelve a comentar", comentar(X, "ximena@x.do", "gracias"), "ok")

# ---- borrar lo propio
esperar("W no borra lo de V", como(W, "walter@x.do", "select espacios.borrar_comentario(%s)", params=(c1,)), [(False,)])
esperar("V borra lo suyo", como(V, "vera@x.do", "select espacios.borrar_comentario(%s)", params=(c1,)), [(True,)])
with psycopg.connect(uri, autocommit=True) as cx:
    cuerpo = cx.execute(f"select cuerpo from espacios.comentarios where id='{c1}'").fetchone()[0]
    print(("PASS " if cuerpo == "" else "FAIL ") + f"el texto borrado se vacía de verdad: {cuerpo!r}")
    fallos += 0 if cuerpo == "" else 1

# ---- denuncias de un hilo y su retiro
for u, e in [(S, "sara@x.do"), (V, "vera@x.do"), (W, "walter@x.do")]:
    como(u, e, "select espacios.denunciar('hilo', 'obra:/obras/123', 'falso', 'título engañoso')")
esperar("hilo denunciado 3 veces sale del feed", como(None, None, "select jsonb_array_length(espacios.comunidad('nuevo', 30, 0))", rol="anon"), [(1,)])
esperar("M retira el hilo", como(M, "mode@x.do", "select espacios.moderar('hilo', 'obra:/obras/123', 'retirar', 'título falso')"), [(True,)])
esperar("hilo retirado no admite comentarios", comentar(V, "vera@x.do", "hola", hilo=("obra", "/obras/123", "Acueducto", "/obras/123")), "error")

# ---- una investigación publicada abre su conversación en /p
como(V, "vera@x.do", "insert into espacios.proyectos (titulo, publico, slug) values ('Caso INAPA', true, 'caso-inapa-ab12')")
esperar("V comenta una investigación publicada", comentar(V, "vera@x.do", "Buen trabajo", hilo=("investigacion", "caso-inapa-ab12", "Caso INAPA", "/p/caso-inapa-ab12")), "ok")
como(V, "vera@x.do", "update espacios.proyectos set publico=false where slug='caso-inapa-ab12'")
esperar("retirada la investigación, sale del feed", como(None, None, "select count(*) from jsonb_array_elements(espacios.comunidad('nuevo', 30, 0)) e where e->>'tipo'='investigacion'", rol="anon"), [(0,)])

with psycopg.connect(uri, autocommit=True) as cx:
    for t in ["moderadores", "suspensiones", "hilos", "comentarios", "votos_comentario", "votos_hilo", "denuncias", "acciones_moderacion"]:
        if not cx.execute(f"select relrowsecurity from pg_class where oid='espacios.{t}'::regclass").fetchone()[0]:
            fallos += 1
            print(f"FAIL RLS apagada en espacios.{t}")

print("FALLOS:", fallos)
raise SystemExit(1 if fallos else 0)
