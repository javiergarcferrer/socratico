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
  const externo = href.length <= 1000 && !/[\s\p{Cc}\\]/u.test(href) && /^https:\/\/[a-z0-9.-]+(:[0-9]+)?(\/|$)/i.test(href);
  return externo || rutaPropia(href);
}

/* --------------------------------------------------------- lo publicado */

export interface EntradaPublicada extends Referencia {
  id: string;
  nota: string;
  creado: string;
}

export interface ProyectoPublicado {
  titulo: string;
  descripcion: string;
  /** El nombre con que firma quien lo publicó, o «Anónimo». */
  autor: string;
  actualizado: string;
  entradas: EntradaPublicada[];
  enlaces: { desde: string; hasta: string; nota: string }[];
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
    return {
      estado: "ok",
      proyecto: {
        ...datos,
        entradas: (datos.entradas ?? []).filter((e) => esTipoEntrada(e.tipo) && hrefValido(e.href)),
        enlaces: datos.enlaces ?? [],
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
