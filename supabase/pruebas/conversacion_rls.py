#!/usr/bin/env python3
"""Prueba la conversación (hilos, comentarios, votos, denuncias, moderación)
sin tocar el Supabase vivo.

Mismo andamio que `espacios_rls.py`: un Postgres desechable (`pgserver`) que
simula `auth` y `democracia.votantes`, con las migraciones de `espacios`, del
endurecimiento de `democracia.secretos` y de la conversación aplicadas **dos
veces**. Recorre la conversación desde quien registró su cédula, quien solo
tiene cuenta, quien no confirmó su correo, una cuenta suspendida, la
moderadora y `anon`, e incluye cada abuso que el diseño promete impedir y
cada hallazgo de la revisión del 2026-09-28:

- comentar sin cédula, sin normas o suspendido;
- abrir conversaciones (y su título) desde una cuenta desechable;
- volver de una suspensión con otra cuenta y la misma cédula;
- ocultar un comentario con tres correos desechables;
- votar lo propio; abrir el hilo de «un proceso» con otra ruta, o con una
  ruta no canónica;
- leer el texto de lo oculto; escribir directo en las tablas; moderar sin
  serlo;
- heredar la conversación de una investigación borrada; comentar una
  investigación retirada;
- contadores que se desvían al borrar una cuenta.

Cero fallos es la única cifra aceptable.

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
S = "00000000-0000-0000-0000-0000000000a3"  # solo cuenta: vota, no escribe
N = "00000000-0000-0000-0000-0000000000a4"  # correo sin confirmar
X = "00000000-0000-0000-0000-0000000000a5"  # registró cédula y será suspendida
M = "00000000-0000-0000-0000-0000000000a6"  # moderadora, con cédula
Y = "00000000-0000-0000-0000-0000000000a7"  # cuenta nueva de X, con la misma cédula
Z = "00000000-0000-0000-0000-0000000000a8"  # registra cédula, la borra y luego es suspendida
Z2 = "00000000-0000-0000-0000-0000000000a9"  # cuenta nueva de Z, con la misma cédula
B1 = "00000000-0000-0000-0000-0000000000b1"  # correos desechables, sin cédula
B2 = "00000000-0000-0000-0000-0000000000b2"
B3 = "00000000-0000-0000-0000-0000000000b3"

srv = pgserver.get_server(tempfile.mkdtemp(prefix="conversacion-rls-"), cleanup_mode="stop")
uri = srv.get_uri()


def admin(sql):
    with psycopg.connect(uri, autocommit=True) as cx:
        cur = cx.execute(sql)
        return cur.fetchall() if cur.description else None


with psycopg.connect(uri, autocommit=True) as cx:
    cx.execute(BASE)
    for _ in range(2):
        for m in MIGRACIONES:
            cx.execute(m.read_text())
    cx.execute(
        f"insert into auth.users values ('{V}','vera@x.do',now()),('{W}','walter@x.do',now()),"
        f"('{S}','sara@x.do',now()),('{N}','nico@x.do',null),('{X}','ximena@x.do',now()),('{M}','mode@x.do',now()),"
        f"('{Y}','xime2@x.do',now()),('{B1}','b1@x.do',now()),('{B2}','b2@x.do',now()),('{B3}','b3@x.do',now()),"
        f"('{Z}','zoe@x.do',now()),('{Z2}','zoe2@x.do',now())"
    )
    cx.execute(f"insert into democracia.votantes values ('{V}','h1'),('{W}','h2'),('{X}','h3'),('{M}','h4'),('{Z}','h5')")
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


def afirmar(t, cond, detalle=""):
    global fallos
    if not cond:
        fallos += 1
    print(("PASS " if cond else "FAIL ") + f"{t} {detalle}")


P = ("proceso", "/procesos/INAPA-2026-1", "Tuberías para INAPA", "/procesos/INAPA-2026-1")
COMENTAR = "select espacios.comentar(%s,%s,%s,%s,%s,%s)"
VOTAR_HILO = "select espacios.votar_hilo(%s,%s,%s,%s,true)"


def comentar(uid, email, cuerpo, padre=None, hilo=P):
    return como(uid, email, COMENTAR, params=(*hilo, padre, cuerpo))


def firmar(uid, email, nombre):
    como(uid, email, f"insert into espacios.perfiles (id,nombre) values ('{uid}','{nombre}')")
    como(uid, email, "select espacios.aceptar_normas()")


def estado_de(cid, hilo=P):
    return como(None, None, "select e->>'estado' from jsonb_array_elements((espacios.hilo(%s,%s))->'lista') e where e->>'id' = %s",
                rol="anon", params=(hilo[0], hilo[1], cid))


def contador(hilo=P):
    return admin(f"select votos, comentarios from espacios.hilos where tipo='{hilo[0]}' and ref='{hilo[1]}'")[0]


# ---- antes de cumplir los requisitos
esperar("anon no comenta", como(None, None, COMENTAR, rol="anon", params=(*P, None, "hola")), "error")
esperar("S (sin cédula) no comenta", comentar(S, "sara@x.do", "hola a todos"), "error")
esperar("S (sin cédula) no abre conversación votando", como(S, "sara@x.do", VOTAR_HILO, params=P), "error")
esperar("B1 desechable no abre conversación con título inventado",
        como(B1, "b1@x.do", VOTAR_HILO, params=("proveedor", "/proveedores/123", "Proveedor X roba", "/proveedores/123")), "error")
esperar("V sin nombre no acepta normas", como(V, "vera@x.do", "select espacios.aceptar_normas()"), "error")
esperar("V pone nombre", como(V, "vera@x.do", f"insert into espacios.perfiles (id,nombre) values ('{V}','Vera') returning nombre"), [("Vera",)])
esperar("V sin normas no comenta", comentar(V, "vera@x.do", "hola a todos"), "error")
esperar("V acepta normas", como(V, "vera@x.do", "select espacios.aceptar_normas()"), [(True,)])
esperar("estado de V", como(V, "vera@x.do", "select (x->>'cedula')::bool, (x->>'normas')::bool, x->>'nombre' from espacios.mi_estado_conversacion() x"), [(True, True, "Vera")])
esperar("estado de S: sin cédula", como(S, "sara@x.do", "select (x->>'cedula')::bool from espacios.mi_estado_conversacion() x"), [(False,)])

# ---- la clave de un hilo es la ruta canónica de su ficha
esperar("hilo cuyo href no es su ref", comentar(V, "vera@x.do", "hola", hilo=("proceso", "/procesos/ABC", "t", "/procesos/XYZ")), "error")
esperar("hilo de proceso que lleva a otra sección", comentar(V, "vera@x.do", "hola", hilo=("proceso", "/democracia/x", "t", "/democracia/x")), "error")
esperar("hilo con ruta de dos barras", comentar(V, "vera@x.do", "hola", hilo=("proceso", "//evil.com/procesos/x", "t", "//evil.com/procesos/x")), "error")
esperar("hilo de proceso con consulta (?)", comentar(V, "vera@x.do", "hola", hilo=("proceso", "/procesos/ABC?x=1", "t", "/procesos/ABC?x=1")), "error")
esperar("institución con nombre en la ruta (no canónica)", comentar(V, "vera@x.do", "hola", hilo=("institucion", "/instituciones/635-inapa", "t", "/instituciones/635-inapa")), "error")
esperar("proveedor con ceros a la izquierda", comentar(V, "vera@x.do", "hola", hilo=("proveedor", "/proveedores/007", "t", "/proveedores/007")), "error")
esperar("hilo de tipo sin ficha (sentencia)", comentar(V, "vera@x.do", "hola", hilo=("sentencia", "/constitucional/1", "t", "/constitucional/1")), "error")
esperar("hilo de investigación no publicada", comentar(V, "vera@x.do", "hola", hilo=("investigacion", "no-existe", "t", "/p/no-existe")), "error")

# ---- un código de proceso con espacios y tildes llega codificado (12 % de la DGCP)
PE = ("proceso", "/procesos/MINISTERIO%20HACIENDA-DAF-CM-2026-0093", "Compra de Hacienda", "/procesos/MINISTERIO%20HACIENDA-DAF-CM-2026-0093")
PT = ("proceso", "/procesos/DIRECCI%C3%93N-CCC-2026-1", "Compra con tilde", "/procesos/DIRECCI%C3%93N-CCC-2026-1")
esperar("proceso con %20 abre conversación", comentar(V, "vera@x.do", "pregunta sobre Hacienda", hilo=PE), "ok")
esperar("proceso con tilde codificada abre conversación", comentar(V, "vera@x.do", "pregunta con tilde", hilo=PT), "ok")
esperar("proceso con % mal formado", comentar(V, "vera@x.do", "hola", hilo=("proceso", "/procesos/X%ZZ", "t", "/procesos/X%ZZ")), "error")
admin(f"update espacios.comentarios set creado = creado - interval '1 hour' where usuario = '{V}'")

# ---- comentar y responder
r = esperar("V comenta", comentar(V, "vera@x.do", "¿Por qué el monto subió 40 %?"), "ok")
c1 = str(r[1][0][0])
esperar("W sin normas no responde", comentar(W, "walter@x.do", "buena pregunta", padre=c1), "error")
firmar(W, "walter@x.do", "Walter")
r = esperar("W responde", comentar(W, "walter@x.do", "Buena pregunta: la enmienda lo explica.", padre=c1), "ok")
c2 = str(r[1][0][0])
esperar("respuesta a comentario de otro hilo", comentar(W, "walter@x.do", "respuesta cruzada", padre=c1, hilo=("proceso", "/procesos/OTRO", "Otro", "/procesos/OTRO")), "error")
afirmar("una respuesta cruzada fallida no deja un hilo abierto", admin("select count(*) from espacios.hilos where ref='/procesos/OTRO'")[0][0] == 0)
esperar("comentario de 1 carácter", comentar(V, "vera@x.do", "a"), "error")
esperar("comentario con 4 enlaces", comentar(V, "vera@x.do", "https://a https://b https://c https://d"), "error")
esperar("hilo cuenta 2", como(None, None, "select (x->>'comentarios')::int from espacios.hilo(%s,%s) x", rol="anon", params=(P[0], P[1])), [(2,)])
esperar("anon lee autores y textos", como(None, None, "select e->>'autor', e->>'cuerpo' from jsonb_array_elements((espacios.hilo(%s,%s))->'lista') e order by e->>'creado'", rol="anon", params=(P[0], P[1])),
        [("Vera", "¿Por qué el monto subió 40 %?"), ("Walter", "Buena pregunta: la enmienda lo explica.")])
esperar("anon no ve ids ni huellas", como(None, None, "select position('usuario' in espacios.hilo(%s,%s)::text) = 0 and position(%s in espacios.hilo(%s,%s)::text) = 0 and position('cedula' in espacios.hilo(%s,%s)::text) = 0",
                                           rol="anon", params=(P[0], P[1], V, P[0], P[1], P[0], P[1])), [(True,)])

# ---- ritmo: cinco en diez minutos, por cédula
for i in range(4):
    comentar(V, "vera@x.do", f"sigo pensando {i}")
esperar("V llega al tope de ritmo", comentar(V, "vera@x.do", "uno más"), "error")
admin(f"update espacios.comentarios set creado = creado - interval '1 hour' where usuario = '{V}'")
esperar("pasado el tiempo, V vuelve a comentar", comentar(V, "vera@x.do", "ya puedo"), "ok")
admin(f"update espacios.comentarios set creado = creado - interval '1 hour' where usuario = '{V}'")

# ---- nadie escribe en las tablas
esperar("V no inserta comentario directo", como(V, "vera@x.do", f"insert into espacios.comentarios (hilo_tipo,hilo_ref,usuario,cedula,cuerpo) values ('proceso','/procesos/INAPA-2026-1','{V}','h1','x')"), "error")
esperar("V no edita comentario ajeno", como(V, "vera@x.do", f"update espacios.comentarios set cuerpo='x' where id='{c2}'"), "error")
esperar("V no lee la tabla de comentarios", como(V, "vera@x.do", "select count(*) from espacios.comentarios"), "error")
esperar("anon no lee denuncias", como(None, None, "select count(*) from espacios.denuncias", rol="anon"), "error")
esperar("V no se hace moderadora", como(V, "vera@x.do", f"insert into espacios.moderadores values ('{V}')"), "error")
esperar("anon no ejecuta comentar", como(None, None, "select has_function_privilege('anon','espacios.comentar(text,text,text,text,uuid,text)','execute')", rol="anon"), [(False,)])
esperar("authenticated no ejecuta abrir_hilo", como(V, "vera@x.do", "select espacios.abrir_hilo('proceso','/procesos/ZZZ','t','/procesos/ZZZ')"), "error")
esperar("authenticated no lee su huella", como(V, "vera@x.do", "select espacios.mi_cedula()"), "error")

# ---- votos
esperar("V no vota su comentario", como(V, "vera@x.do", "select espacios.votar_comentario(%s, 1::smallint)", params=(c1,)), "error")
esperar("S (solo cuenta) vota comentario", como(S, "sara@x.do", "select espacios.votar_comentario(%s, 1::smallint)", params=(c1,)), [(1,)])
esperar("W vota abajo", como(W, "walter@x.do", "select espacios.votar_comentario(%s, -1::smallint)", params=(c1,)), [(0,)])
esperar("W cambia a arriba", como(W, "walter@x.do", "select espacios.votar_comentario(%s, 1::smallint)", params=(c1,)), [(2,)])
esperar("W quita su voto", como(W, "walter@x.do", "select espacios.votar_comentario(%s, 0::smallint)", params=(c1,)), [(1,)])
esperar("voto de valor 5", como(W, "walter@x.do", "select espacios.votar_comentario(%s, 5::smallint)", params=(c1,)), "error")
esperar("N (correo sin confirmar) no vota", como(N, "nico@x.do", "select espacios.votar_comentario(%s, 1::smallint)", params=(c1,)), "error")
esperar("anon no vota", como(None, None, "select espacios.votar_comentario(%s, 1::smallint)", rol="anon", params=(c1,)), "error")
esperar("S (sin cédula) dice que importa en un hilo abierto", como(S, "sara@x.do", VOTAR_HILO, params=P), [(1,)])
esperar("S lo dice dos veces: sigue 1", como(S, "sara@x.do", VOTAR_HILO, params=P), [(1,)])
esperar("V también", como(V, "vera@x.do", VOTAR_HILO, params=P), [(2,)])
esperar("S lo retira", como(S, "sara@x.do", "select espacios.votar_hilo(%s,%s,%s,%s,false)", params=P), [(1,)])
esperar("W dice que importa", como(W, "walter@x.do", VOTAR_HILO, params=P), [(2,)])
esperar("mi_voto de V en el hilo", como(V, "vera@x.do", "select (x->>'mi_voto')::bool from espacios.hilo(%s,%s) x", params=(P[0], P[1])), [(True,)])
esperar("V (con cédula) abre la obra votando", como(V, "vera@x.do", VOTAR_HILO, params=("obra", "/obras/123", "Acueducto", "/obras/123")), [(1,)])
antes = admin("select actividad from espacios.hilos where ref='/obras/123'")[0][0]
como(V, "vera@x.do", VOTAR_HILO, params=("obra", "/obras/123", "Acueducto", "/obras/123"))
despues = admin("select actividad from espacios.hilos where ref='/obras/123'")[0][0]
afirmar("repetir un voto no reaviva el hilo", antes == despues)
for _ in range(5):
    como(V, "vera@x.do", "select espacios.votar_hilo('obra','/obras/123','Acueducto','/obras/123',false)")
    como(V, "vera@x.do", VOTAR_HILO, params=("obra", "/obras/123", "Acueducto", "/obras/123"))
afirmar("votar y retirar en bucle no reaviva el hilo", admin("select actividad from espacios.hilos where ref='/obras/123'")[0][0] == antes)

# ---- el feed
esperar("feed destacado trae 4 hilos", como(None, None, "select jsonb_array_length(espacios.comunidad('destacado', 30, 0))", rol="anon"), [(4,)])
esperar("feed votado: el proceso primero", como(None, None, "select espacios.comunidad('votado', 30, 0)->0->>'ref'", rol="anon"), [("/procesos/INAPA-2026-1",)])
esperar("feed nuevo: la obra primero", como(None, None, "select espacios.comunidad('nuevo', 30, 0)->0->>'ref'", rol="anon"), [("/obras/123",)])
esperar("feed con límite 1, página 3 trae el más antiguo", como(None, None, "select espacios.comunidad('nuevo', 1, 3)->0->>'ref'", rol="anon"), [(PE[1],)])

# ---- denuncias: correos desechables no ocultan nada
for u, e in [(B1, "b1@x.do"), (B2, "b2@x.do"), (B3, "b3@x.do")]:
    como(u, e, "select espacios.denunciar('comentario', %s, 'difamacion', 'x')", params=(c2,))
esperar("tres desechables no ocultan c2", estado_de(c2), [("visible",)])
esperar("V denuncia c2", como(V, "vera@x.do", "select espacios.denunciar('comentario', %s, 'acoso', '')", params=(c2,)), [(True,)])
esperar("V denuncia c2 otra vez (no suma)", como(V, "vera@x.do", "select espacios.denunciar('comentario', %s, 'acoso', '')", params=(c2,)), [(True,)])
firmar(X, "ximena@x.do", "Ximena")
esperar("X denuncia c2", como(X, "ximena@x.do", "select espacios.denunciar('comentario', %s, 'falso', '')", params=(c2,)), [(True,)])
esperar("c2 sigue visible con 2 denuncias con cédula", estado_de(c2), [("visible",)])
esperar("motivo inventado", como(M, "mode@x.do", "select espacios.denunciar('comentario', %s, 'me-cae-mal', '')", params=(c2,)), "error")
esperar("M denuncia c2 (tercera con cédula)", como(M, "mode@x.do", "select espacios.denunciar('comentario', %s, 'falso', '')", params=(c2,)), [(True,)])
esperar("c2 oculto: sin texto ni autor", como(None, None, "select e->>'estado', e->>'cuerpo', e->>'autor' from jsonb_array_elements((espacios.hilo(%s,%s))->'lista') e where e->>'id' = %s", rol="anon", params=(P[0], P[1], c2)), [("oculto", None, None)])
esperar("ocultar baja el contador", como(None, None, "select (x->>'comentarios')::int from espacios.hilo(%s,%s) x", rol="anon", params=(P[0], P[1])), [(6,)])
esperar("no se responde a lo oculto", comentar(V, "vera@x.do", "respondo a lo oculto", padre=c2), "error")

# ---- moderación
esperar("V no ve la cola", como(V, "vera@x.do", "select espacios.cola_moderacion()"), "error")
esperar("V no modera", como(V, "vera@x.do", "select espacios.moderar('comentario', %s, 'restaurar', '')", params=(c2,)), "error")
esperar("M ve c2 en la cola con 6 denuncias", como(M, "mode@x.do", "select jsonb_array_length(c->'denuncias') from jsonb_array_elements(espacios.cola_moderacion()->'comentarios') c where c->>'id' = %s", params=(c2,)), [(6,)])
esperar("M restaura c2", como(M, "mode@x.do", "select espacios.moderar('comentario', %s, 'restaurar', 'crítica, no difamación')", params=(c2,)), [(True,)])
esperar("c2 visible otra vez", estado_de(c2), [("visible",)])
esperar("restaurar sube el contador", como(None, None, "select (x->>'comentarios')::int from espacios.hilo(%s,%s) x", rol="anon", params=(P[0], P[1])), [(7,)])
esperar("cola vacía tras resolver", como(M, "mode@x.do", "select jsonb_array_length(espacios.cola_moderacion()->'comentarios')"), [(0,)])
esperar("M retira c2", como(M, "mode@x.do", "select espacios.moderar('comentario', %s, 'retirar', 'datos personales')", params=(c2,)), [(True,)])
esperar("M no lee el registro de acciones por tabla", como(M, "mode@x.do", "select count(*) from espacios.acciones_moderacion"), "error")
afirmar("dos acciones en el registro", admin("select count(*) from espacios.acciones_moderacion")[0][0] == 2)
esperar("V no retitula", como(V, "vera@x.do", "select espacios.retitular('obra:/obras/123', 'x', '')"), "error")
esperar("M retitula la obra", como(M, "mode@x.do", "select espacios.retitular('obra:/obras/123', 'Acueducto de Hato Mayor', 'título impreciso')"), [(True,)])
esperar("el feed trae el título corregido", como(None, None, "select espacios.comunidad('nuevo', 30, 0)->0->>'titulo'", rol="anon"), [("Acueducto de Hato Mayor",)])

# ---- suspensión, por cuenta y por cédula
esperar("X comenta antes", comentar(X, "ximena@x.do", "primer comentario"), "ok")
esperar("V no suspende", como(V, "vera@x.do", "select espacios.suspender(%s, 7, 'x')", params=(X,)), "error")
esperar("M suspende sin motivo", como(M, "mode@x.do", "select espacios.suspender(%s, 7, '')", params=(X,)), "error")
esperar("M suspende a X", como(M, "mode@x.do", "select espacios.suspender(%s, 7, 'acoso reiterado')", params=(X,)), [(True,)])
esperar("X suspendida no comenta", comentar(X, "ximena@x.do", "otro"), "error")
esperar("X suspendida no vota", como(X, "ximena@x.do", VOTAR_HILO, params=P), "error")
esperar("X suspendida no denuncia", como(X, "ximena@x.do", "select espacios.denunciar('comentario', %s, 'spam', '')", params=(c1,)), "error")
# X borra su registro de votante y abre otra cuenta con la misma cédula.
admin(f"delete from democracia.votantes where id = '{X}'; insert into democracia.votantes values ('{Y}','h3')")
firmar(Y, "xime2@x.do", "Xime")
esperar("Y (misma cédula que X) sigue suspendida", comentar(Y, "xime2@x.do", "volví"), "error")
# Z escribe, borra su registro de votante ANTES de que la suspendan, y vuelve.
firmar(Z, "zoe@x.do", "Zoe")
esperar("Z comenta", comentar(Z, "zoe@x.do", "algo que rompe las normas"), "ok")
admin(f"delete from democracia.votantes where id = '{Z}'")
esperar("M suspende a Z (ya sin registro de votante)", como(M, "mode@x.do", "select espacios.suspender(%s, 7, 'datos personales')", params=(Z,)), [(True,)])
afirmar("la suspensión de Z guarda la huella de lo que escribió", admin(f"select cedula from espacios.suspensiones where usuario='{Z}'") == [("h5",)])
admin(f"insert into democracia.votantes values ('{Z2}','h5')")
firmar(Z2, "zoe2@x.do", "Zoe dos")
esperar("Z2 (misma cédula, cuenta nueva) sigue suspendida", comentar(Z2, "zoe2@x.do", "volví"), "error")
esperar("M levanta la suspensión", como(M, "mode@x.do", "select espacios.suspender(%s, 0, 'cumplió')", params=(X,)), [(True,)])
esperar("Y ya comenta", comentar(Y, "xime2@x.do", "gracias"), "ok")
admin("update espacios.suspensiones set hasta = now() - interval '1 day'")
como(M, "mode@x.do", "select espacios.suspender(%s, 0, 'purga')", params=(Y,))
afirmar("las suspensiones vencidas se purgan con su huella", admin("select count(*) from espacios.suspensiones")[0][0] == 0)

# ---- las huellas se olvidan a los 90 días
admin(f"update espacios.comentarios set creado = now() - interval '100 days' where usuario = '{Y}'")
admin(f"update espacios.hilos set creado = now() - interval '100 days' where abierto_por = '{V}' and ref = '/obras/123'")
comentar(V, "vera@x.do", "comentario que dispara el olvido")
afirmar("huella de un comentario de hace 100 días vaciada", admin(f"select count(*) from espacios.comentarios where usuario='{Y}' and cedula is not null")[0][0] == 0)
afirmar("huella de un hilo de hace 100 días vaciada", admin("select abierto_cedula from espacios.hilos where ref='/obras/123'") == [(None,)])
afirmar("huella reciente conservada", admin(f"select count(*) from espacios.comentarios where usuario='{V}' and cedula is not null")[0][0] > 0)

# ---- borrar lo propio
esperar("W no borra lo de V", como(W, "walter@x.do", "select espacios.borrar_comentario(%s)", params=(c1,)), [(False,)])
esperar("V borra lo suyo", como(V, "vera@x.do", "select espacios.borrar_comentario(%s)", params=(c1,)), [(True,)])
afirmar("el texto borrado se vacía de verdad", admin(f"select cuerpo from espacios.comentarios where id='{c1}'")[0][0] == "")

# ---- contadores al borrar una cuenta
r = comentar(W, "walter@x.do", "comentario de Walter para votar")
cw = str(r[1][0][0])
como(S, "sara@x.do", "select espacios.votar_comentario(%s, 1::smallint)", params=(cw,))
como(V, "vera@x.do", "select espacios.votar_comentario(%s, 1::smallint)", params=(cw,))
admin(f"delete from auth.users where id = '{S}'")
afirmar("borrar la cuenta de S resta su voto al comentario", admin(f"select puntos from espacios.comentarios where id='{cw}'")[0][0] == 1)
r = comentar(V, "vera@x.do", "respondo a Walter", padre=cw)
cv = str(r[1][0][0])
_, n_antes = contador()
admin(f"delete from auth.users where id = '{W}'")
afirmar("borrar la cuenta de W no borra la respuesta de V", admin(f"select padre from espacios.comentarios where id='{cv}'") == [(None,)])
_, n_despues = contador()
afirmar("el contador del hilo cuenta lo visible que queda",
        n_despues == admin(f"select count(*) from espacios.comentarios where hilo_ref='{P[1]}' and estado='visible'")[0][0], f"({n_antes} → {n_despues})")

# ---- denuncias de un hilo y su retiro
for u, e in [(V, "vera@x.do"), (M, "mode@x.do"), (Y, "xime2@x.do")]:
    como(u, e, "select espacios.denunciar('hilo', 'obra:/obras/123', 'falso', 'título engañoso')")
esperar("hilo denunciado 3 veces sale del feed", como(None, None, "select count(*) from jsonb_array_elements(espacios.comunidad('nuevo', 30, 0)) e where e->>'ref' = '/obras/123'", rol="anon"), [(0,)])
esperar("la cola dice quién abrió el hilo denunciado", como(M, "mode@x.do", "select h->>'abierto_por_nombre' from jsonb_array_elements(espacios.cola_moderacion()->'hilos') h where h->>'ref' = '/obras/123'"), [("Vera",)])
esperar("M retira el hilo", como(M, "mode@x.do", "select espacios.moderar('hilo', 'obra:/obras/123', 'retirar', 'título falso')"), [(True,)])
esperar("hilo retirado no admite comentarios", comentar(V, "vera@x.do", "hola", hilo=("obra", "/obras/123", "Acueducto", "/obras/123")), "error")

# ---- una investigación publicada abre su conversación en /p
como(V, "vera@x.do", "insert into espacios.proyectos (titulo, publico, slug) values ('Caso INAPA', true, 'caso-inapa-ab12')")
INV = ("investigacion", "caso-inapa-ab12", "Caso INAPA", "/p/caso-inapa-ab12")
esperar("V comenta una investigación publicada", comentar(V, "vera@x.do", "Buen trabajo", hilo=INV), "ok")
como(V, "vera@x.do", "update espacios.proyectos set publico=false where slug='caso-inapa-ab12'")
esperar("retirada, sale del feed", como(None, None, "select count(*) from jsonb_array_elements(espacios.comunidad('nuevo', 30, 0)) e where e->>'tipo'='investigacion'", rol="anon"), [(0,)])
esperar("retirada, no se lee", como(None, None, "select jsonb_array_length((espacios.hilo('investigacion','caso-inapa-ab12'))->'lista')", rol="anon"), [(0,)])
esperar("retirada, no se comenta", comentar(Y, "xime2@x.do", "sigo aquí", hilo=INV), "error")
como(Y, "xime2@x.do", "select espacios.denunciar('hilo', 'investigacion:caso-inapa-ab12', 'spam', '')")
como(V, "vera@x.do", "update espacios.proyectos set publico=true, slug='caso-inapa-nuevo' where slug='caso-inapa-ab12'")
afirmar("la denuncia pendiente sigue a la nueva dirección", admin("select count(*) from espacios.denuncias where objetivo='investigacion:caso-inapa-nuevo'")[0][0] == 1)
afirmar("cambiar la dirección se lleva la conversación", admin("select count(*) from espacios.comentarios where hilo_ref='caso-inapa-nuevo'")[0][0] == 1)
como(V, "vera@x.do", "delete from espacios.proyectos where slug='caso-inapa-nuevo'")
afirmar("borrar la investigación borra su conversación", admin("select count(*) from espacios.hilos where tipo='investigacion'")[0][0] == 0)

for t in ["moderadores", "suspensiones", "hilos", "comentarios", "votos_comentario", "votos_hilo", "denuncias", "acciones_moderacion"]:
    afirmar(f"RLS encendida en espacios.{t}", admin(f"select relrowsecurity from pg_class where oid='espacios.{t}'::regclass")[0][0])

print("FALLOS:", fallos)
raise SystemExit(1 if fallos else 0)
