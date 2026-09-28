/**
 * El espacio del lector — lo que sirve a los dos lados: los tipos de registro
 * que se guardan, cómo se llaman, y la lectura de un proyecto **publicado**,
 * que la página `/p/[slug]` hace en el servidor (docs/PLAN-ESPACIOS.md).
 *
 * No importa el cliente de Supabase: el servidor no lleva sesión y un
 * proyecto publicado es público. Lo lee por HTTP, con la clave publicable,
 * la función `espacios.publicado`, que devuelve exactamente lo publicable
 * —ni ids de usuario ni correos—. Lo que exige sesión (guardar, anotar,
 * invitar) vive en `lib/espacios-cliente.ts`.
 *
 * Ningún dato del Estado pasa por aquí: una entrada es una referencia (tipo,
 * identificador, título, enlace). La cifra se lee en su ficha, del origen.
 */

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase-config";

/** Los tipos de registro que se guardan: los mismos de `espacios.tipo_valido`. */
export const TIPOS_ENTRADA = [
  "institucion",
  "proveedor",
  "proceso",
  "norma",
  "proyecto",
  "expediente-senado",
  "legislador",
  "sentencia",
  "obra",
  "capitulo",
  "documento",
  "dato",
  "cargo",
  "busqueda",
] as const;

export type TipoEntrada = (typeof TIPOS_ENTRADA)[number];

export function esTipoEntrada(v: unknown): v is TipoEntrada {
  return typeof v === "string" && (TIPOS_ENTRADA as readonly string[]).includes(v);
}

/** Cómo se nombra cada tipo en una lista: singular para la marca de fila. */
export const NOMBRE_TIPO: Record<TipoEntrada, string> = {
  institucion: "Institución",
  proveedor: "Proveedor",
  proceso: "Compra pública",
  norma: "Norma",
  proyecto: "Iniciativa de Diputados",
  "expediente-senado": "Expediente del Senado",
  legislador: "Legislador",
  sentencia: "Sentencia",
  obra: "Obra",
  capitulo: "Presupuesto",
  documento: "Documento",
  dato: "Datos abiertos",
  cargo: "Cargo",
  busqueda: "Búsqueda",
};

/** Una referencia a un registro de la plataforma: lo único que se guarda de él. */
export interface Referencia {
  tipo: TipoEntrada;
  /** El identificador dentro de su tipo (el mismo que usa `lib/seguimiento.ts`). */
  ref: string;
  titulo: string;
  /**
   * Una ruta propia (`/…`) o un enlace `https://`. La tabla no restringe el
   * sitio: quien lo muestra a terceros (`/p`) dice a qué dominio lleva.
   */
  href: string;
}

/**
 * Una ruta de esta misma plataforma: empieza con una sola «/», sin espacios,
 * controles ni barra invertida. `//x`, `/\x` o `/<tab>/x` (un `%09` ya
 * decodificado por `searchParams`) los navegadores los leen como otro sitio;
 * aquí no pasan. Es la única puerta de un `?volver=` y de un enlace interno
 * pintado con `Link`.
 */
export function rutaPropia(v: unknown): v is string {
  return typeof v === "string" && v.length <= 1000 && /^\/(?![/\\])/.test(v) && !/[\s\p{Cc}\\]/u.test(v);
}

/** Lo que `espacios.entradas` acepta en `href`: el mismo `espacios.href_valido(h, true)`. */
export function hrefValido(href: string): boolean {
  const externo =
    href.length <= 1000 &&
    !/[\s\p{Cc}\\]/u.test(href) &&
    /^https:\/\/[a-z0-9.-]+(:[0-9]{1,4})?(\/|$)/i.test(href) &&
    // Lo que el navegador no sabe leer como dirección no se pinta como enlace.
    seLee(href);
  return externo || rutaPropia(href);
}

/** `URL.canParse` sin exigirlo: Safari 16 no lo tiene. */
function seLee(href: string): boolean {
  try {
    new URL(href);
    return true;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------- el caso */

/**
 * Qué une a dos registros: un verbo de un vocabulario cerrado, el mismo
 * `check` de `espacios.enlaces.tipo` (docs/PLAN-ESPACIOS.md §7). Se lee de
 * `desde` hacia `hasta`: «INAPA — adjudicó a → Constructora X». Inspirado en
 * las relaciones de FollowTheMoney, al que se exporta (`lib/ftm.ts`).
 */
export const TIPOS_ENLACE = [
  "adjudico",
  "contrato",
  "pago",
  "dueno",
  "dirige",
  "trabaja",
  "familia",
  "firmo",
  "regula",
  "financia",
  "relaciona",
] as const;

export type TipoEnlace = (typeof TIPOS_ENLACE)[number];

export function esTipoEnlace(v: unknown): v is TipoEnlace {
  return typeof v === "string" && (TIPOS_ENLACE as readonly string[]).includes(v);
}

/** El verbo, como se lee entre los dos registros. */
export const VERBO_ENLACE: Record<TipoEnlace, string> = {
  adjudico: "adjudicó a",
  contrato: "contrató con",
  pago: "pagó a",
  dueno: "es dueño o socio de",
  dirige: "dirige o representa a",
  trabaja: "trabaja en",
  familia: "es familiar de",
  firmo: "firmó",
  regula: "regula o autoriza",
  financia: "financia",
  relaciona: "se relaciona con",
};

/**
 * Los verbos que se quedan en el caso privado: `espacios.publicado` no los
 * devuelve y `/p` los filtra otra vez. Un parentesco es un dato personal.
 */
export const ENLACES_PRIVADOS: readonly TipoEnlace[] = ["familia"];

/** Una fecha de la línea de tiempo: la anota el investigador, `AAAA-MM-DD`. */
export const FECHA_CASO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * La narración del caso: el documento del editor (Tiptap/ProseMirror) tal
 * como se guarda. Quien la pinta a terceros (`/p`) no confía en su forma: solo
 * pinta los nodos que conoce (`components/espacios/narrativa-lectura.tsx`).
 */
export interface NodoNarrativa {
  type: string;
  attrs?: Record<string, unknown>;
  content?: NodoNarrativa[];
  text?: string;
  marks?: { type: string }[];
}

/* --------------------------------------------------------- lo publicado */

export interface EntradaPublicada extends Referencia {
  id: string;
  nota: string;
  creado: string;
  /** La fecha que le dio el autor en su línea de tiempo. */
  fecha: string | null;
  /** Dónde la puso en su tablero; `null` si nunca la movió. */
  x: number | null;
  y: number | null;
}

export interface EnlacePublicado {
  desde: string;
  hasta: string;
  tipo: TipoEnlace;
  nota: string;
}

export interface ProyectoPublicado {
  titulo: string;
  descripcion: string;
  /** El nombre con que firma quien lo publicó, o «Anónimo». */
  autor: string;
  actualizado: string;
  narrativa: NodoNarrativa | null;
  entradas: EntradaPublicada[];
  enlaces: EnlacePublicado[];
}

/** Lo que devuelve la lectura de un proyecto publicado. */
export type LecturaPublicada =
  | { estado: "ok"; proyecto: ProyectoPublicado }
  | { estado: "no-existe" }
  /** El esquema aún no está abierto en el API, o Supabase no contestó. */
  | { estado: "caida" };

/** Un slug publicable: el mismo `check` de `espacios.proyectos`. */
export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Un proyecto publicado, por su dirección. Se cachea un minuto: quien publica
 * y recarga ve su cambio enseguida, y una investigación compartida muchas
 * veces no golpea la base en cada visita.
 */
export async function leerPublicado(slug: string): Promise<LecturaPublicada> {
  if (!SLUG.test(slug) || slug.length > 90) return { estado: "no-existe" };
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/publicado`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        // El esquema de la función: PostgREST lo toma de esta cabecera.
        "Content-Profile": "espacios",
        Accept: "application/json",
      },
      body: JSON.stringify({ p_slug: slug }),
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok || !(r.headers.get("content-type") ?? "").includes("json")) return { estado: "caida" };
    const datos = (await r.json()) as ProyectoPublicado | null;
    if (!datos) return { estado: "no-existe" };
    const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const entradas = (datos.entradas ?? [])
      .filter((e) => esTipoEntrada(e.tipo) && hrefValido(e.href))
      .map((e) => {
        const x = numero(e.x);
        const y = numero(e.y);
        return {
          ...e,
          fecha: typeof e.fecha === "string" && FECHA_CASO.test(e.fecha) ? e.fecha : null,
          x: x !== null && y !== null ? x : null,
          y: x !== null && y !== null ? y : null,
        };
      });
    const ids = new Set(entradas.map((e) => e.id));
    return {
      estado: "ok",
      proyecto: {
        ...datos,
        narrativa: datos.narrativa && typeof datos.narrativa === "object" && datos.narrativa.type === "doc" ? datos.narrativa : null,
        entradas,
        // Un enlace a un registro que no se muestra (su enlace no pasó el
        // filtro) tampoco se muestra; un verbo que no se conoce se lee «se
        // relaciona con».
        enlaces: (datos.enlaces ?? [])
          .filter((l) => ids.has(l.desde) && ids.has(l.hasta) && !ENLACES_PRIVADOS.includes(l.tipo))
          .map((l) => ({ ...l, tipo: esTipoEnlace(l.tipo) ? l.tipo : "relaciona" })),
      },
    };
  } catch {
    return { estado: "caida" };
  }
}

/**
 * La dirección pública de un proyecto: su título en minúsculas y sin tildes,
 * más un sufijo al azar para que dos «Caso INAPA» no choquen y para que no se
 * adivine una investigación que todavía no se publicó.
 */
export function slugDe(titulo: string): string {
  const base = titulo
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  const azar = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => (b % 36).toString(36)).join("");
  return `${base || "proyecto"}-${azar}`;
}

/* ------------------------------------------------------- la conversación */

/**
 * Sobre qué se conversa: los registros con ficha propia y las
 * investigaciones publicadas (`espacios.tipo_hilo_valido`). La clave es la
 * ruta de la ficha (`ref` = `href`); en una investigación, su slug.
 */
export const TIPOS_HILO = [
  "institucion",
  "proveedor",
  "proceso",
  "norma",
  "proyecto",
  "expediente-senado",
  "legislador",
  "obra",
  "investigacion",
] as const;

export type TipoHilo = (typeof TIPOS_HILO)[number];

export function esTipoHilo(v: unknown): v is TipoHilo {
  return typeof v === "string" && (TIPOS_HILO as readonly string[]).includes(v);
}

export const NOMBRE_HILO: Record<TipoHilo, string> = {
  institucion: "Institución",
  proveedor: "Proveedor",
  proceso: "Compra pública",
  norma: "Norma",
  proyecto: "Iniciativa de Diputados",
  "expediente-senado": "Expediente del Senado",
  legislador: "Legislador",
  obra: "Obra",
  investigacion: "Investigación",
};

/** El registro del que se habla: lo que el hilo guarda de él. */
export interface ReferenciaHilo {
  tipo: TipoHilo;
  ref: string;
  titulo: string;
  href: string;
}

export type EstadoComentario = "visible" | "oculto" | "retirado" | "borrado";

export interface Comentario {
  id: string;
  padre: string | null;
  estado: EstadoComentario;
  /** Solo si está visible. */
  autor: string | null;
  cuerpo: string | null;
  puntos: number;
  creado: string;
  mio: boolean;
  mi_voto: -1 | 0 | 1;
}

export interface Hilo {
  existe: boolean;
  estado: "visible" | "oculto" | "retirado";
  votos: number;
  comentarios: number;
  mi_voto: boolean;
  lista: Comentario[];
}

export interface FilaComunidad extends ReferenciaHilo {
  votos: number;
  comentarios: number;
  creado: string;
  actividad: string;
  mi_voto: boolean;
}

export type OrdenComunidad = "destacado" | "nuevo" | "votado";

/** Lo que devuelve una lectura pública de la conversación. */
export type Lectura<T> = { estado: "ok"; datos: T } | { estado: "cerrado" } | { estado: "caida" };

/**
 * Una función pública de `espacios` por HTTP, con la clave publicable: sin
 * supabase-js, para que quien solo lee no lo descargue. `PGRST106` es el
 * esquema aún no abierto en el API (PLAN-ESPACIOS §5, paso 2).
 */
async function rpcPublica<T>(fn: string, cuerpo: object, cache: RequestInit & { next?: { revalidate: number } }): Promise<Lectura<T>> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        "Content-Profile": "espacios",
        Accept: "application/json",
      },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(15_000),
      ...cache,
    });
    const tipo = r.headers.get("content-type") ?? "";
    if (!tipo.includes("json")) return { estado: "caida" };
    const datos = (await r.json()) as T & { code?: string };
    if (!r.ok) return datos?.code === "PGRST106" || datos?.code === "PGRST202" ? { estado: "cerrado" } : { estado: "caida" };
    return { estado: "ok", datos };
  } catch {
    return { estado: "caida" };
  }
}

/** Una conversación, leída por cualquiera (sin sesión: sin `mio` ni votos propios). */
export function leerHilo(tipo: TipoHilo, ref: string): Promise<Lectura<Hilo>> {
  return rpcPublica<Hilo>("hilo", { p_tipo: tipo, p_ref: ref }, { cache: "no-store" });
}

/**
 * El feed de la comunidad. En el servidor (`/comunidad`) se cachea medio
 * minuto; en el navegador (la portada) no hay caché y cada lectura es una
 * consulta, por eso allí solo se pide al acercarse. Solo filas cuyo enlace es
 * una ruta propia.
 */
export async function leerComunidad(orden: OrdenComunidad, limite = 50): Promise<Lectura<FilaComunidad[]>> {
  const r = await rpcPublica<FilaComunidad[]>(
    "comunidad",
    { p_orden: orden, p_limite: limite, p_pagina: 0 },
    { next: { revalidate: 30 } },
  );
  if (r.estado !== "ok") return r;
  return { estado: "ok", datos: (r.datos ?? []).filter((f) => esTipoHilo(f.tipo) && rutaPropia(f.href)) };
}
