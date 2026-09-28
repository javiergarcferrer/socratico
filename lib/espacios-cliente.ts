"use client";

/**
 * El espacio del lector desde el navegador: la sesión, lo guardado, los
 * proyectos con sus enlaces y notas, quién colabora y lo que sigue
 * (docs/PLAN-ESPACIOS.md). Todo pasa por RLS en el esquema `espacios`: aquí no
 * se decide quién puede qué, solo se pide y se traduce la respuesta.
 *
 * Cada llamada devuelve `Hecho<T>` y nunca lanza: una pantalla tiene que
 * distinguir «no hay nada» de «no se pudo mirar» (docs/IDENTIDAD.md §6), y un
 * tercer caso que solo existe hasta que el dueño abra el esquema en el API
 * —`cerrado`—, que se dice como tal y no como un fallo.
 */

import type { Session } from "@supabase/supabase-js";
import { espacios, supabase } from "@/lib/supabase";
import { slugDe, type Referencia, type TipoEntrada } from "@/lib/espacios";
import { getSeguidos, onSeguimientoCambio, reemplazarSeguidos, type Seguido } from "@/lib/seguimiento";

export type Hecho<T> = { ok: true; datos: T } | { ok: false; error: string; cerrado?: boolean };

interface FalloSupabase {
  code?: string;
  message?: string;
}

/** El fallo de Supabase, dicho para quien lo lee. */
function traducir(e: FalloSupabase): { ok: false; error: string; cerrado?: boolean } {
  const codigo = e.code ?? "";
  const texto = (e.message ?? "").toLowerCase();
  // PGRST106: el esquema no está entre los que expone el API (paso 2 de
  // PLAN-ESPACIOS §5); 42P01/3F000: la migración aún no se aplicó.
  if (codigo === "PGRST106" || codigo === "42P01" || codigo === "3F000" || texto.includes("schema must be one of")) {
    return { ok: false, cerrado: true, error: "Los proyectos todavía no están abiertos en esta plataforma." };
  }
  if (codigo === "54000") return { ok: false, error: `Llegaste a un tope: ${e.message}.` };
  if (codigo === "23505") return { ok: false, error: "Eso ya está guardado ahí." };
  if (codigo === "42501" || texto.includes("row-level security")) {
    return { ok: false, error: "No tienes permiso para hacer eso en este proyecto." };
  }
  if (codigo === "PGRST301" || texto.includes("jwt")) {
    return { ok: false, error: "Tu sesión venció. Vuelve a entrar." };
  }
  return { ok: false, error: "No se pudo completar. Vuelve a intentarlo en un momento." };
}

async function hecho<T>(p: PromiseLike<{ data: T | null; error: FalloSupabase | null }>): Promise<Hecho<T>> {
  try {
    const { data, error } = await p;
    if (error) return traducir(error);
    return { ok: true, datos: data as T };
  } catch {
    return { ok: false, error: "No hubo conexión con el servidor. Revisa tu internet." };
  }
}

/* ------------------------------------------------------------- sesión */

export interface Usuario {
  id: string;
  email: string;
}

function usuarioDe(s: Session | null): Usuario | null {
  return s?.user ? { id: s.user.id, email: s.user.email ?? "" } : null;
}

export async function sesionActual(): Promise<Usuario | null> {
  const { data } = await supabase().auth.getSession();
  return usuarioDe(data.session);
}

/** Escucha entrar y salir. Devuelve cómo dejar de escuchar. */
export function alCambiarSesion(cb: (u: Usuario | null) => void): () => void {
  const { data } = supabase().auth.onAuthStateChange((_evento, sesion) => cb(usuarioDe(sesion)));
  return () => data.subscription.unsubscribe();
}

export async function salir(): Promise<void> {
  await supabase().auth.signOut();
}

/**
 * Lo que se hace una vez al entrar: aceptar las invitaciones a este correo y
 * juntar lo que el navegador seguía con lo que sigue la cuenta. Devuelve
 * cuántos proyectos se sumaron por invitación.
 */
export async function alEntrar(u: Usuario): Promise<Hecho<number>> {
  const aceptadas = await hecho<number>(espacios().rpc("aceptar_invitaciones"));
  if (!aceptadas.ok) return aceptadas;
  const sync = await sincronizarSeguidos(u, true);
  return sync.ok ? aceptadas : sync;
}

/* ------------------------------------------------------------- perfil */

export async function miNombre(u: Usuario): Promise<Hecho<string | null>> {
  const r = await hecho<{ nombre: string } | null>(
    espacios().from("perfiles").select("nombre").eq("id", u.id).maybeSingle(),
  );
  return r.ok ? { ok: true, datos: r.datos?.nombre ?? null } : r;
}

export async function guardarNombre(u: Usuario, nombre: string): Promise<Hecho<null>> {
  return hecho(espacios().from("perfiles").upsert({ id: u.id, nombre: nombre.trim() }).then((r) => ({ ...r, data: null })));
}

/* ---------------------------------------------------------- proyectos */

export type Rol = "dueno" | "editor" | "lector";

export interface Proyecto {
  id: string;
  dueno: string;
  titulo: string;
  descripcion: string;
  publico: boolean;
  slug: string | null;
  creado: string;
  actualizado: string;
}

export interface ProyectoConCuenta extends Proyecto {
  rol: Rol;
  registros: number;
}

const COLUMNAS_PROYECTO = "id, dueno, titulo, descripcion, publico, slug, creado, actualizado";

/** Los proyectos que el lector ve —suyos y compartidos—, lo más reciente primero. */
export async function misProyectos(u: Usuario): Promise<Hecho<ProyectoConCuenta[]>> {
  const r = await hecho<(Proyecto & { entradas: { count: number }[] })[]>(
    espacios()
      .from("proyectos")
      .select(`${COLUMNAS_PROYECTO}, entradas(count)`)
      .order("actualizado", { ascending: false }),
  );
  if (!r.ok) return r;
  const miembros = await hecho<{ proyecto: string; rol: Rol }[]>(
    espacios().from("miembros").select("proyecto, rol").eq("usuario", u.id),
  );
  const rolDe = new Map((miembros.ok ? miembros.datos : []).map((m) => [m.proyecto, m.rol]));
  return {
    ok: true,
    datos: r.datos.map(({ entradas, ...p }) => ({
      ...p,
      rol: p.dueno === u.id ? "dueno" : (rolDe.get(p.id) ?? "lector"),
      registros: entradas?.[0]?.count ?? 0,
    })),
  };
}

export async function unProyecto(u: Usuario, id: string): Promise<Hecho<ProyectoConCuenta | null>> {
  const r = await hecho<Proyecto | null>(espacios().from("proyectos").select(COLUMNAS_PROYECTO).eq("id", id).maybeSingle());
  if (!r.ok || !r.datos) return r as Hecho<null>;
  const p = r.datos;
  let rol: Rol = "lector";
  if (p.dueno === u.id) rol = "dueno";
  else {
    const m = await hecho<{ rol: Rol } | null>(
      espacios().from("miembros").select("rol").eq("proyecto", id).eq("usuario", u.id).maybeSingle(),
    );
    if (m.ok && m.datos) rol = m.datos.rol;
  }
  return { ok: true, datos: { ...p, rol, registros: 0 } };
}

export async function crearProyecto(titulo: string, descripcion = ""): Promise<Hecho<Proyecto>> {
  return hecho<Proyecto>(
    espacios()
      .from("proyectos")
      .insert({ titulo: titulo.trim(), descripcion: descripcion.trim() })
      .select(COLUMNAS_PROYECTO)
      .single(),
  );
}

export async function editarProyecto(id: string, campos: { titulo?: string; descripcion?: string }): Promise<Hecho<null>> {
  return hecho(espacios().from("proyectos").update(campos).eq("id", id).then((r) => ({ ...r, data: null })));
}

export async function borrarProyecto(id: string): Promise<Hecho<null>> {
  return hecho(espacios().from("proyectos").delete().eq("id", id).then((r) => ({ ...r, data: null })));
}

/**
 * Publica o retira. Publicar le da una dirección (`/p/<slug>`) que se
 * conserva si se retira y se vuelve a publicar, para no romper los enlaces que
 * ya circulan.
 */
export async function publicar(p: Proyecto, publico: boolean): Promise<Hecho<Proyecto>> {
  const slug = p.slug ?? slugDe(p.titulo);
  return hecho<Proyecto>(
    espacios().from("proyectos").update({ publico, slug }).eq("id", p.id).select(COLUMNAS_PROYECTO).single(),
  );
}

/* ------------------------------------------------------- lo guardado */

export interface Entrada extends Referencia {
  id: string;
  usuario: string;
  proyecto: string | null;
  nota: string;
  creado: string;
  actualizado: string;
}

const COLUMNAS_ENTRADA = "id, usuario, proyecto, tipo, ref, titulo, href, nota, creado, actualizado";

/** Lo guardado en un proyecto, o en la bandeja si `proyecto` es `null`. */
export async function entradasDe(u: Usuario, proyecto: string | null): Promise<Hecho<Entrada[]>> {
  const q = espacios().from("entradas").select(COLUMNAS_ENTRADA).order("creado", { ascending: false });
  return hecho<Entrada[]>(proyecto ? q.eq("proyecto", proyecto) : q.is("proyecto", null).eq("usuario", u.id));
}

/** ¿Dónde está guardado ya este registro? Ids de proyecto, y `null` si está en la bandeja. */
export async function dondeEsta(r: { tipo: TipoEntrada; ref: string }): Promise<Hecho<(string | null)[]>> {
  const h = await hecho<{ proyecto: string | null }[]>(
    espacios().from("entradas").select("proyecto").eq("tipo", r.tipo).eq("ref", r.ref),
  );
  return h.ok ? { ok: true, datos: h.datos.map((x) => x.proyecto) } : h;
}

export async function guardar(r: Referencia, proyecto: string | null): Promise<Hecho<Entrada>> {
  return hecho<Entrada>(
    espacios()
      .from("entradas")
      .insert({ tipo: r.tipo, ref: r.ref, titulo: r.titulo.slice(0, 500), href: r.href, proyecto })
      .select(COLUMNAS_ENTRADA)
      .single(),
  );
}

/** Quita un registro de un sitio concreto (la bandeja o un proyecto). */
export async function quitarDe(r: { tipo: TipoEntrada; ref: string }, u: Usuario, proyecto: string | null): Promise<Hecho<null>> {
  const q = espacios().from("entradas").delete().eq("tipo", r.tipo).eq("ref", r.ref);
  return hecho((proyecto ? q.eq("proyecto", proyecto) : q.is("proyecto", null).eq("usuario", u.id)).then((x) => ({ ...x, data: null })));
}

export async function quitarEntrada(id: string): Promise<Hecho<null>> {
  return hecho(espacios().from("entradas").delete().eq("id", id).then((r) => ({ ...r, data: null })));
}

export async function anotar(id: string, nota: string): Promise<Hecho<null>> {
  return hecho(espacios().from("entradas").update({ nota }).eq("id", id).then((r) => ({ ...r, data: null })));
}

/* ------------------------------------------------------------ enlaces */

export interface Enlace {
  id: string;
  desde: string;
  hasta: string;
  nota: string;
  creado: string;
}

export async function enlacesDe(proyecto: string): Promise<Hecho<Enlace[]>> {
  return hecho<Enlace[]>(
    espacios().from("enlaces").select("id, desde, hasta, nota, creado").eq("proyecto", proyecto).order("creado"),
  );
}

export async function enlazar(proyecto: string, desde: string, hasta: string, nota: string): Promise<Hecho<Enlace>> {
  return hecho<Enlace>(
    espacios()
      .from("enlaces")
      .insert({ proyecto, desde, hasta, nota: nota.trim() })
      .select("id, desde, hasta, nota, creado")
      .single(),
  );
}

export async function quitarEnlace(id: string): Promise<Hecho<null>> {
  return hecho(espacios().from("enlaces").delete().eq("id", id).then((r) => ({ ...r, data: null })));
}

/* ------------------------------------------------------- colaboración */

export interface Miembro {
  usuario: string;
  rol: Rol;
  nombre: string;
}

export interface Invitacion {
  id: string;
  email: string;
  rol: Exclude<Rol, "dueno">;
  creado: string;
}

export async function miembrosDe(proyecto: string): Promise<Hecho<Miembro[]>> {
  return hecho<Miembro[]>(espacios().rpc("miembros_de", { p: proyecto }));
}

export async function invitacionesDe(proyecto: string): Promise<Hecho<Invitacion[]>> {
  return hecho<Invitacion[]>(
    espacios().from("invitaciones").select("id, email, rol, creado").eq("proyecto", proyecto).order("creado"),
  );
}

export async function invitar(proyecto: string, email: string, rol: Exclude<Rol, "dueno">): Promise<Hecho<Invitacion>> {
  return hecho<Invitacion>(
    espacios()
      .from("invitaciones")
      .insert({ proyecto, email: email.trim().toLowerCase(), rol })
      .select("id, email, rol, creado")
      .single(),
  );
}

export async function retirarInvitacion(id: string): Promise<Hecho<null>> {
  return hecho(espacios().from("invitaciones").delete().eq("id", id).then((r) => ({ ...r, data: null })));
}

export async function quitarMiembro(proyecto: string, usuario: string): Promise<Hecho<null>> {
  return hecho(
    espacios().from("miembros").delete().eq("proyecto", proyecto).eq("usuario", usuario).then((r) => ({ ...r, data: null })),
  );
}

export async function cambiarRol(proyecto: string, usuario: string, rol: Exclude<Rol, "dueno">): Promise<Hecho<null>> {
  return hecho(
    espacios().from("miembros").update({ rol }).eq("proyecto", proyecto).eq("usuario", usuario).then((r) => ({ ...r, data: null })),
  );
}

/** Las invitaciones pendientes a mi correo (las que se aceptan al entrar). */
export async function misInvitaciones(): Promise<Hecho<{ id: string; proyecto: string }[]>> {
  return hecho(espacios().from("invitaciones").select("id, proyecto"));
}

/* ------------------------------------------------ lo que sigue, en la cuenta */

interface FilaSeguimiento {
  tipo: Seguido["tipo"];
  ref: string;
  titulo: string;
  href: string;
  huella: string | null;
  desde: string;
  visto: string | null;
}

const aFila = (u: Usuario, s: Seguido) => ({
  usuario: u.id,
  tipo: s.tipo,
  ref: s.id,
  titulo: s.titulo.slice(0, 500),
  href: s.href,
  huella: s.huella ?? null,
  desde: s.desde ?? new Date().toISOString(),
  visto: s.visto ?? null,
});

/** Última lista que la cuenta y este navegador tuvieron en común. */
const ULTIMA = (u: Usuario) => `lrd:seguimiento-cuenta:${u.id}`;

function claves(lista: { tipo: string; id?: string; ref?: string }[]): Set<string> {
  return new Set(lista.map((s) => `${s.tipo}:${s.id ?? s.ref}`));
}

/**
 * Junta lo que sigue el navegador con lo que sigue la cuenta.
 *
 * - La **primera vez** en este navegador (`primera`), une las dos: nada que el
 *   lector marcó antes de tener cuenta se pierde.
 * - Después, la cuenta manda: lo que se dejó de seguir en otro dispositivo
 *   desaparece aquí, y lo que se marcó aquí sin conexión se sube.
 */
export async function sincronizarSeguidos(u: Usuario, primera = false): Promise<Hecho<null>> {
  const remoto = await hecho<FilaSeguimiento[]>(
    espacios().from("seguimientos").select("tipo, ref, titulo, href, huella, desde, visto"),
  );
  if (!remoto.ok) return remoto;
  const local = getSeguidos();
  let comun: Set<string> | null = null;
  try {
    const guardada = window.localStorage.getItem(ULTIMA(u));
    comun = guardada ? new Set(JSON.parse(guardada) as string[]) : null;
  } catch {
    comun = null;
  }
  const deCuenta = claves(remoto.datos);
  // Lo local que la cuenta no tiene: si ya estaba en la última lista común,
  // se borró en otro dispositivo; si no, es nuevo aquí y se sube.
  const subir = local.filter((s) => !deCuenta.has(`${s.tipo}:${s.id}`) && (primera || !comun?.has(`${s.tipo}:${s.id}`)));
  if (subir.length) {
    const r = await hecho(espacios().from("seguimientos").upsert(subir.map((s) => aFila(u, s))).then((x) => ({ ...x, data: null })));
    if (!r.ok) return r;
  }
  const lista: Seguido[] = [
    ...remoto.datos.map((f) => ({
      tipo: f.tipo,
      id: f.ref,
      titulo: f.titulo,
      href: f.href,
      ...(f.huella !== null ? { huella: f.huella } : {}),
      desde: f.desde,
      ...(f.visto ? { visto: f.visto } : {}),
    })),
    ...subir,
  ];
  reemplazarSeguidos(lista);
  try {
    window.localStorage.setItem(ULTIMA(u), JSON.stringify([...claves(lista)]));
  } catch {
    /* sin almacenamiento: la próxima vez vuelve a unir, sin perder nada */
  }
  return { ok: true, datos: null };
}

/**
 * Mientras hay sesión, cada cambio en lo que se sigue —seguir, dejar de
 * seguir, marcar visto— se refleja en la cuenta. Devuelve cómo dejar de
 * escuchar.
 */
export function reflejarSeguidos(u: Usuario): () => void {
  let previa = getSeguidos();
  let enCurso = false;
  const alCambiar = async () => {
    if (enCurso) return;
    enCurso = true;
    try {
      const ahora = getSeguidos();
      const antes = claves(previa);
      const despues = claves(ahora);
      const quitados = previa.filter((s) => !despues.has(`${s.tipo}:${s.id}`));
      const cambiados = ahora.filter((s) => {
        const p = previa.find((x) => x.tipo === s.tipo && x.id === s.id);
        return !antes.has(`${s.tipo}:${s.id}`) || p?.huella !== s.huella || p?.visto !== s.visto || p?.titulo !== s.titulo;
      });
      if (cambiados.length) await espacios().from("seguimientos").upsert(cambiados.map((s) => aFila(u, s)));
      for (const s of quitados) await espacios().from("seguimientos").delete().eq("tipo", s.tipo).eq("ref", s.id);
      previa = ahora;
      window.localStorage.setItem(ULTIMA(u), JSON.stringify([...despues]));
    } catch {
      /* sin conexión: la próxima sincronización lo sube */
    } finally {
      enCurso = false;
    }
  };
  return onSeguimientoCambio(() => void alCambiar());
}
