"use client";

/**
 * El espacio del lector desde el navegador: la sesión, lo guardado, los
 * proyectos con sus enlaces y notas, quién colabora y lo que sigue
 * (docs/INFRAESTRUCTURA.md §10). Todo pasa por RLS en el esquema `espacios`: aquí no
 * se decide quién puede qué, solo se pide y se traduce la respuesta.
 *
 * Cada llamada devuelve `Hecho<T>` y nunca lanza: una pantalla tiene que
 * distinguir «no hay nada» de «no se pudo mirar» (docs/INFRAESTRUCTURA.md §11), y un
 * tercer caso que solo existe hasta que el dueño abra el esquema en el API
 * —`cerrado`—, que se dice como tal y no como un fallo.
 */

import type { Session } from "@supabase/supabase-js";
import { espacios, supabase } from "@/lib/supabase";
import {
  rutaPropia,
  slugDe,
  type FilaComunidad,
  type Hilo,
  type OrdenComunidad,
  type Referencia,
  type ReferenciaHilo,
  type NodoNarrativa,
  type TipoEnlace,
  type TipoEntrada,
  type TipoHilo,
} from "@/lib/espacios";
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
  // docs/INFRAESTRUCTURA.md §10); 42P01/3F000: la migración aún no se aplicó;
  // PGRST202/42883: la función todavía no existe (la conversación, paso 4).
  // 42703/PGRST204: la columna no existe todavía (una migración posterior,
  // como la del caso, sin aplicar): lo que no está abierto no es una caída.
  if (["PGRST106", "42P01", "3F000", "PGRST202", "42883", "42703", "PGRST204"].includes(codigo) || texto.includes("schema must be one of")) {
    return { ok: false, cerrado: true, error: "Los proyectos todavía no están abiertos en esta plataforma." };
  }
  // Las funciones de la conversación dicen el porqué en español (`raise
  // exception 'vas muy rápido…'`): se muestra tal cual, con mayúscula y punto.
  // Un fallo de Postgres (un check, un permiso) no pasa por aquí: está en inglés.
  const propio = e.message ?? "";
  if (["22023", "23514", "54000", "42501"].includes(codigo) && /^[a-záéíóúñ¿]/.test(propio) && !/violates|permission denied|row-level|does not exist/.test(propio)) {
    return { ok: false, error: `${propio.charAt(0).toUpperCase()}${propio.slice(1)}.` };
  }
  if (codigo === "54000") return { ok: false, error: `Llegaste a un tope: ${e.message}.` };
  if (codigo === "23505") return { ok: false, error: "Eso ya está guardado ahí." };
  if (codigo === "23514") return { ok: false, error: "Eso no cabe: algún texto es demasiado largo." };
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

/**
 * Salir cierra la sesión y deja este navegador como lo encontró: la lista de
 * lo seguido era de la cuenta y no se queda a la vista del siguiente lector
 * del mismo equipo.
 */
export async function salir(): Promise<Hecho<null>> {
  const u = await sesionActual();
  const { error } = await supabase().auth.signOut();
  if (error) return { ok: false, error: "No se pudo cerrar la sesión. Vuelve a intentarlo." };
  // Primero se deja de reflejar: vaciar la lista no es «dejar de seguir todo».
  dejarDeReflejar?.();
  reemplazarSeguidos([]);
  if (u) {
    try {
      window.localStorage.removeItem(ULTIMA(u));
    } catch {
      /* sin almacenamiento: no quedó nada que borrar */
    }
  }
  return { ok: true, datos: null };
}

/**
 * Lo que se hace una vez al entrar: juntar lo que el navegador seguía con lo
 * que sigue la cuenta. Las invitaciones no se aceptan solas: se muestran en
 * «Tu espacio» y el lector decide (`misInvitaciones`, `aceptarInvitacion`).
 */
export async function alEntrar(u: Usuario): Promise<Hecho<null>> {
  return sincronizarSeguidos(u);
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
  // Una dirección nueva puede chocar con otra (el sufijo es corto): se sortea
  // otra, hasta tres veces. La que ya tenía no se cambia nunca.
  for (let intento = 0; ; intento++) {
    const slug = p.slug ?? slugDe(p.titulo);
    try {
      const { data, error } = await espacios()
        .from("proyectos")
        .update({ publico, slug })
        .eq("id", p.id)
        .select(COLUMNAS_PROYECTO)
        .single();
      if (!error) return { ok: true, datos: data as Proyecto };
      if (error.code === "23505" && !p.slug && intento < 2) continue;
      return traducir(error);
    } catch {
      return { ok: false, error: "No hubo conexión con el servidor. Revisa tu internet." };
    }
  }
}

/* ------------------------------------------------------- lo guardado */

export interface Entrada extends Referencia {
  id: string;
  usuario: string;
  proyecto: string | null;
  nota: string;
  creado: string;
  actualizado: string;
  /** La fecha que el investigador le da en la línea de tiempo (`AAAA-MM-DD`). */
  fecha: string | null;
  /** Dónde está en el tablero; `null` mientras nadie la haya movido. */
  x: number | null;
  y: number | null;
}

const COLUMNAS_ENTRADA = "id, usuario, proyecto, tipo, ref, titulo, href, nota, creado, actualizado, fecha, x, y";

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

export async function guardar(r: Referencia, proyecto: string | null, nota = ""): Promise<Hecho<Entrada>> {
  return hecho<Entrada>(
    espacios()
      .from("entradas")
      .insert({ tipo: r.tipo, ref: r.ref, titulo: r.titulo.slice(0, 500), href: r.href, proyecto, nota })
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

/** Pone un registro en un sitio del tablero. */
export async function mover(id: string, x: number, y: number): Promise<Hecho<null>> {
  return hecho(
    espacios().from("entradas").update({ x: Math.round(x), y: Math.round(y) }).eq("id", id).then((r) => ({ ...r, data: null })),
  );
}

/** Le da (o le quita, con `null`) una fecha en la línea de tiempo. */
export async function fechar(id: string, fecha: string | null): Promise<Hecho<null>> {
  return hecho(espacios().from("entradas").update({ fecha }).eq("id", id).then((r) => ({ ...r, data: null })));
}

/* ------------------------------------------------------------ enlaces */

export interface Enlace {
  id: string;
  desde: string;
  hasta: string;
  tipo: TipoEnlace;
  nota: string;
  creado: string;
}

const COLUMNAS_ENLACE = "id, desde, hasta, tipo, nota, creado";

export async function enlacesDe(proyecto: string): Promise<Hecho<Enlace[]>> {
  return hecho<Enlace[]>(espacios().from("enlaces").select(COLUMNAS_ENLACE).eq("proyecto", proyecto).order("creado"));
}

export async function enlazar(
  proyecto: string,
  desde: string,
  hasta: string,
  nota: string,
  tipo: TipoEnlace = "relaciona",
): Promise<Hecho<Enlace>> {
  return hecho<Enlace>(
    espacios()
      .from("enlaces")
      .insert({ proyecto, desde, hasta, tipo, nota: nota.trim() })
      .select(COLUMNAS_ENLACE)
      .single(),
  );
}

/** Cambia el verbo o la nota de un enlace. */
export async function editarEnlace(id: string, campos: { tipo?: TipoEnlace; nota?: string }): Promise<Hecho<null>> {
  return hecho(espacios().from("enlaces").update(campos).eq("id", id).then((r) => ({ ...r, data: null })));
}

/* ---------------------------------------------------------- narración */

export interface Narrativa {
  doc: NodoNarrativa | null;
  version: number;
}

/** La narración del caso, aparte del proyecto: puede pesar y la lista de proyectos no la necesita. */
export async function narrativaDe(proyecto: string): Promise<Hecho<Narrativa>> {
  const r = await hecho<{ narrativa: NodoNarrativa | null; narrativa_version: number }>(
    espacios().from("proyectos").select("narrativa, narrativa_version").eq("id", proyecto).single(),
  );
  return r.ok ? { ok: true, datos: { doc: r.datos.narrativa, version: r.datos.narrativa_version } } : r;
}

/**
 * Guarda la narración sobre la versión que se leyó. `datos: null` quiere
 * decir que otra persona guardó antes: no se pisó nada, y la pantalla decide.
 */
export async function guardarNarrativa(proyecto: string, doc: NodoNarrativa, version: number): Promise<Hecho<number | null>> {
  return hecho<number | null>(
    espacios().rpc("guardar_narrativa", { p_proyecto: proyecto, p_doc: doc, p_version: version }),
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

/** Una invitación que me hicieron, con lo que hace falta para decidir. */
export interface InvitacionRecibida {
  id: string;
  proyecto: string;
  rol: Exclude<Rol, "dueno">;
  titulo: string;
  /** El nombre con que firma quien invita, o su correo enmascarado (`null` solo si no tiene correo). */
  invita: string | null;
  creado: string;
}

/** Las invitaciones pendientes a mi correo **verificado**. */
export async function misInvitaciones(): Promise<Hecho<InvitacionRecibida[]>> {
  const r = await hecho<InvitacionRecibida[] | null>(espacios().rpc("mis_invitaciones"));
  return r.ok ? { ok: true, datos: r.datos ?? [] } : r;
}

/** Acepta una invitación: me hace miembro y la borra. Devuelve el proyecto. */
export async function aceptarInvitacion(id: string): Promise<Hecho<string>> {
  return hecho<string>(espacios().rpc("aceptar_invitacion", { p_id: id }));
}

/** Rechazar es borrarla: quien invitó ve que ya no está pendiente. */
export async function rechazarInvitacion(id: string): Promise<Hecho<null>> {
  return retirarInvitacion(id);
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

/** Una fecha que Postgres acepta, o `null`. */
const instante = (v: string | undefined) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

/** La fila, ajustada a los `check` de `espacios.seguimientos`: una sola fila rota no tumba la subida entera. */
const aFila = (u: Usuario, s: Seguido) => ({
  usuario: u.id,
  tipo: s.tipo,
  ref: s.id,
  titulo: (s.titulo || s.id).slice(0, 500),
  href: s.href,
  huella: s.huella && s.huella.length <= 500 ? s.huella : null,
  desde: instante(s.desde) ?? new Date().toISOString(),
  visto: instante(s.visto),
});

const deFila = (f: FilaSeguimiento): Seguido => ({
  tipo: f.tipo,
  id: f.ref,
  titulo: f.titulo,
  href: f.href,
  ...(f.huella !== null ? { huella: f.huella } : {}),
  desde: f.desde,
  ...(f.visto ? { visto: f.visto } : {}),
});

/** Última lista que la cuenta y este navegador tuvieron en común. */
const ULTIMA = (u: Usuario) => `lrd:seguimiento-cuenta:${u.id}`;

const clave = (s: { tipo: string; id?: string; ref?: string }) => `${s.tipo}:${s.id ?? s.ref}`;

function claves(lista: { tipo: string; id?: string; ref?: string }[]): Set<string> {
  return new Set(lista.map(clave));
}

/** Los tipos que admite `espacios.seguimientos`. */
const TIPOS_SEGUIMIENTO = new Set<string>(["proceso", "proyecto", "expediente-senado", "proveedor", "institucion", "norma"]);

/** Lo que la tabla acepta: una ruta propia (el `check` de `espacios.seguimientos`). */
const subible = (s: Seguido) =>
  TIPOS_SEGUIMIENTO.has(s.tipo) && rutaPropia(s.href) && s.id.length >= 1 && s.id.length <= 300;


function leerComun(u: Usuario): Set<string> | null {
  try {
    const guardada = window.localStorage.getItem(ULTIMA(u));
    const lista: unknown = guardada ? JSON.parse(guardada) : null;
    return Array.isArray(lista) ? new Set(lista.filter((x): x is string => typeof x === "string")) : null;
  } catch {
    return null;
  }
}

/**
 * Solo entra en la lista común lo que la cuenta puede guardar: lo que no sube
 * (un enlace que no es ruta propia) se queda en el navegador y nunca parece
 * «quitado en otro dispositivo».
 */
function fijarComun(u: Usuario, lista: Seguido[]): void {
  try {
    window.localStorage.setItem(ULTIMA(u), JSON.stringify([...claves(lista.filter(subible))]));
  } catch {
    /* sin almacenamiento: la próxima vez vuelve a unir, sin perder nada */
  }
}

async function subir(u: Usuario, lista: Seguido[]): Promise<Hecho<null>> {
  const filas = lista.filter(subible).map((s) => aFila(u, s));
  if (!filas.length) return { ok: true, datos: null };
  return hecho(espacios().from("seguimientos").upsert(filas).then((x) => ({ ...x, data: null })));
}

async function borrar(lista: Seguido[]): Promise<Hecho<null>> {
  for (const s of lista) {
    const r = await hecho(espacios().from("seguimientos").delete().eq("tipo", s.tipo).eq("ref", s.id).then((x) => ({ ...x, data: null })));
    if (!r.ok) return r;
  }
  return { ok: true, datos: null };
}

/**
 * Junta lo que sigue el navegador con lo que sigue la cuenta, contra la última
 * lista que ambos tuvieron en común (`ULTIMA`):
 *
 * - Sin lista común —la primera vez en este navegador—, une las dos: nada que
 *   el lector marcó antes de tener cuenta se pierde.
 * - Con ella, cada lado aporta lo que cambió desde entonces: lo nuevo en uno
 *   pasa al otro; lo que estaba en común y falta en uno se dejó de seguir ahí,
 *   y se quita del otro.
 * - En lo que está en ambos gana la versión vista más tarde.
 *
 * La lista común solo avanza si todas las escrituras salieron: si una falla,
 * la próxima vez se vuelve a comparar desde el mismo punto y nada se pierde.
 */
export async function sincronizarSeguidos(u: Usuario): Promise<Hecho<null>> {
  // Si el lector sigue o deja de seguir algo mientras esto espera a la red,
  // la foto de `local` ya no vale: se vuelve a empezar desde la lista de
  // ahora, hasta tres veces. Nunca se escribe encima de un toque suyo.
  for (let intento = 0; intento < 3; intento++) {
    const r = await sincronizarUnaVez(u);
    if (r !== "de-nuevo") return r;
  }
  return { ok: false, error: "La lista cambió mientras se sincronizaba. Se intentará en la próxima página." };
}

const firma = (lista: Seguido[]) => JSON.stringify(lista.map((s) => [clave(s), s.visto ?? "", s.huella ?? ""]));

async function sincronizarUnaVez(u: Usuario): Promise<Hecho<null> | "de-nuevo"> {
  const remoto = await hecho<FilaSeguimiento[]>(
    espacios().from("seguimientos").select("tipo, ref, titulo, href, huella, desde, visto"),
  );
  if (!remoto.ok) return remoto;
  const local = getSeguidos();
  const comun = leerComun(u);
  const deCuenta = new Map(remoto.datos.map((f) => [clave(f), deFila(f)]));
  const deAqui = new Map(local.map((s) => [clave(s), s]));

  const nuevosAqui = local.filter((s) => !deCuenta.has(clave(s)) && !comun?.has(clave(s)));
  const quitadosAqui = [...deCuenta.values()].filter((s) => !deAqui.has(clave(s)) && comun?.has(clave(s)));
  const quitadosAlla = new Set(local.filter((s) => !deCuenta.has(clave(s)) && comun?.has(clave(s))).map(clave));
  const masVistosAqui = local.filter((s) => {
    const r = deCuenta.get(clave(s));
    return r && (s.visto ?? "") > (r.visto ?? "");
  });

  const subida = await subir(u, [...nuevosAqui, ...masVistosAqui]);
  if (!subida.ok) return subida;
  const borrado = await borrar(quitadosAqui);
  if (!borrado.ok) return borrado;

  const quitados = claves(quitadosAqui);
  const lista: Seguido[] = [
    // El orden del navegador manda; lo que llega de la cuenta va detrás.
    ...local
      .filter((s) => !quitadosAlla.has(clave(s)))
      .map((s) => {
        const r = deCuenta.get(clave(s));
        return r && (r.visto ?? "") > (s.visto ?? "") ? r : s;
      }),
    ...[...deCuenta.values()].filter((s) => !deAqui.has(clave(s)) && !quitados.has(clave(s))),
  ];
  // Lo escrito ya es lo común entre la cuenta y la foto de `local`. Si el
  // lector tocó algo mientras tanto, se compara su lista de ahora contra esto
  // en otra vuelta, en vez de pisarla.
  if (firma(getSeguidos()) !== firma(local)) {
    // Común es lo que ya tienen los dos lados: lo de la foto que quedó en la
    // cuenta. Lo que solo trajo la cuenta no lo es todavía: la próxima vuelta
    // lo suma, no lo toma por quitado aquí.
    fijarComun(u, lista.filter((s) => deAqui.has(clave(s))));
    return "de-nuevo";
  }
  reemplazarSeguidos(lista);
  fijarComun(u, lista);
  return { ok: true, datos: null };
}

/**
 * Mientras hay sesión, cada cambio en lo que se sigue —seguir, dejar de
 * seguir, marcar visto— se refleja en la cuenta. Un cambio que llega mientras
 * otro se sube no se pierde: queda en cola y se sube después. Si una escritura
 * falla, `previa` no avanza y el próximo cambio (o la próxima página) lo
 * reintenta. Devuelve cómo dejar de escuchar.
 */
export function reflejarSeguidos(u: Usuario): () => void {
  let previa = getSeguidos();
  let enCurso = false;
  let pendiente = false;
  let vivo = true;
  const alCambiar = async () => {
    if (enCurso) {
      pendiente = true;
      return;
    }
    enCurso = true;
    try {
      do {
        pendiente = false;
        const ahora = getSeguidos();
        const antes = new Map(previa.map((s) => [clave(s), s]));
        const despues = claves(ahora);
        const quitados = previa.filter((s) => !despues.has(clave(s)));
        const cambiados = ahora.filter((s) => {
          const p = antes.get(clave(s));
          return !p || p.huella !== s.huella || p.visto !== s.visto || p.titulo !== s.titulo;
        });
        const a = await subir(u, cambiados);
        if (!a.ok) return;
        const b = await borrar(quitados);
        if (!b.ok) return;
        previa = ahora;
        fijarComun(u, ahora);
      } while (pendiente && vivo);
    } finally {
      enCurso = false;
    }
  };
  const escucha = onSeguimientoCambio(() => void alCambiar());
  const dejar = () => {
    vivo = false;
    escucha();
    if (dejarDeReflejar === dejar) dejarDeReflejar = null;
  };
  dejarDeReflejar?.();
  dejarDeReflejar = dejar;
  return dejar;
}

/** El reflejo activo, para que `salir` lo apague antes de vaciar la lista. */
let dejarDeReflejar: (() => void) | null = null;

/* ---------------------------------------------------- la conversación */

/** Lo que falta para participar, dicho antes del primer toque. */
export interface EstadoConversacion {
  cuenta: boolean;
  correo: boolean;
  cedula: boolean;
  nombre: string | null;
  normas: boolean;
  suspendido_hasta: string | null;
  moderador: boolean;
}

export async function estadoConversacion(): Promise<Hecho<EstadoConversacion>> {
  return hecho<EstadoConversacion>(espacios().rpc("mi_estado_conversacion"));
}

export async function aceptarNormas(): Promise<Hecho<boolean>> {
  return hecho<boolean>(espacios().rpc("aceptar_normas"));
}

/** La conversación con la sesión: trae además lo propio y los votos propios. */
export async function hiloConSesion(tipo: TipoHilo, ref: string): Promise<Hecho<Hilo>> {
  return hecho<Hilo>(espacios().rpc("hilo", { p_tipo: tipo, p_ref: ref }));
}

/** El feed con la sesión: trae qué filas ya votó el lector. */
export async function comunidadConSesion(orden: OrdenComunidad): Promise<Hecho<FilaComunidad[]>> {
  const r = await hecho<FilaComunidad[] | null>(espacios().rpc("comunidad", { p_orden: orden, p_limite: 100, p_pagina: 0 }));
  return r.ok ? { ok: true, datos: r.datos ?? [] } : r;
}

export async function comentar(r: ReferenciaHilo, cuerpo: string, padre: string | null): Promise<Hecho<string>> {
  return hecho<string>(
    espacios().rpc("comentar", {
      p_tipo: r.tipo,
      p_ref: r.ref,
      p_titulo: r.titulo.slice(0, 300),
      p_href: r.href,
      p_padre: padre,
      p_cuerpo: cuerpo,
    }),
  );
}

export async function borrarComentario(id: string): Promise<Hecho<boolean>> {
  return hecho<boolean>(espacios().rpc("borrar_comentario", { p_id: id }));
}

/** 1, -1, o 0 para quitar el voto. Devuelve los puntos nuevos. */
export async function votarComentario(id: string, valor: -1 | 0 | 1): Promise<Hecho<number>> {
  return hecho<number>(espacios().rpc("votar_comentario", { p_id: id, p_valor: valor }));
}

/** «Importa»: sí o no. Devuelve cuántas cuentas lo dicen. */
export async function votarHilo(r: ReferenciaHilo, si: boolean): Promise<Hecho<number>> {
  return hecho<number>(
    espacios().rpc("votar_hilo", { p_tipo: r.tipo, p_ref: r.ref, p_titulo: r.titulo.slice(0, 300), p_href: r.href, p_si: si }),
  );
}

export const MOTIVOS_DENUNCIA = {
  difamacion: { nombre: "Difamación", ayuda: "Acusa a alguien de algo sin sustento" },
  "datos-personales": { nombre: "Datos personales", ayuda: "Publica teléfonos, direcciones, cédulas o datos de salud" },
  acoso: { nombre: "Acoso o amenaza", ayuda: "Ataca a una persona en vez de discutir el registro" },
  spam: { nombre: "Propaganda o spam", ayuda: "Vende algo o repite lo mismo" },
  falso: { nombre: "Engañoso", ayuda: "Afirma como hecho algo que el registro contradice" },
  otro: { nombre: "Otro motivo", ayuda: "Explícalo en el detalle" },
} as const;

export type MotivoDenuncia = keyof typeof MOTIVOS_DENUNCIA;

export async function denunciar(
  objetivo: { tipo: "comentario"; id: string } | { tipo: "hilo"; hilo: ReferenciaHilo },
  motivo: MotivoDenuncia,
  detalle: string,
): Promise<Hecho<boolean>> {
  const clave = objetivo.tipo === "comentario" ? objetivo.id : `${objetivo.hilo.tipo}:${objetivo.hilo.ref}`;
  return hecho<boolean>(
    espacios().rpc("denunciar", { p_objetivo_tipo: objetivo.tipo, p_objetivo: clave, p_motivo: motivo, p_detalle: detalle }),
  );
}

/* ---------------------------------------------------------- moderación */

export interface DenunciaEnCola {
  motivo: MotivoDenuncia;
  detalle: string;
  creado: string;
  /** Solo las de quien registró su cédula cuentan para ocultar. */
  con_cedula: boolean;
}

export interface ColaModeracion {
  comentarios: {
    id: string;
    estado: string;
    cuerpo: string;
    creado: string;
    autor: string;
    usuario: string;
    hilo: ReferenciaHilo;
    denuncias: DenunciaEnCola[] | null;
  }[];
  hilos: (ReferenciaHilo & {
    estado: string;
    denuncias: DenunciaEnCola[] | null;
    /** Quién abrió la conversación (y puso su título): se le puede suspender. */
    abierto_por: string | null;
    abierto_por_nombre: string | null;
  })[];
  suspensiones: { usuario: string; nombre: string; hasta: string; motivo: string }[];
}

export async function colaModeracion(): Promise<Hecho<ColaModeracion>> {
  return hecho<ColaModeracion>(espacios().rpc("cola_moderacion"));
}

export async function moderar(
  objetivo: { tipo: "comentario"; id: string } | { tipo: "hilo"; clave: string },
  accion: "restaurar" | "retirar",
  nota: string,
): Promise<Hecho<boolean>> {
  return hecho<boolean>(
    espacios().rpc("moderar", {
      p_objetivo_tipo: objetivo.tipo,
      p_objetivo: objetivo.tipo === "comentario" ? objetivo.id : objetivo.clave,
      p_accion: accion,
      p_nota: nota,
    }),
  );
}

/** Corrige el título de una conversación (`clave` es «tipo:ref»). */
export async function retitular(clave: string, titulo: string, nota: string): Promise<Hecho<boolean>> {
  return hecho<boolean>(espacios().rpc("retitular", { p_clave: clave, p_titulo: titulo, p_nota: nota }));
}

/** Días > 0 suspende; 0 levanta la suspensión (de la cuenta y de su cédula). */
export async function suspender(usuario: string, dias: number, motivo: string): Promise<Hecho<boolean>> {
  return hecho<boolean>(espacios().rpc("suspender", { p_usuario: usuario, p_dias: dias, p_motivo: motivo }));
}
