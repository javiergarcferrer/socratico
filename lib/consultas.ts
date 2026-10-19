/**
 * Las lecturas del navegador a las rutas propias, para TanStack Query
 * (`components/consultas.tsx` pone el cliente).
 *
 * Aquí viven las **claves** —una por recurso, para que dos componentes que
 * piden lo mismo compartan la respuesta— y las funciones que leen. Viaja al
 * navegador: nada de `lib/pedir.ts` ni de un adaptador de fuente, que son del
 * servidor. Las fuentes del Estado nunca se leen desde aquí; solo las rutas
 * de la plataforma que ya las leyeron. Sin hooks de React: un componente de
 * servidor puede importar las claves (el rebote vive en
 * `components/rebotado.ts`).
 */
export const claves = {
  /** Las unidades de compra del filtro de licitaciones (`/api/unidades`). */
  unidades: ["unidades"] as const,
  /** Una página del listado de licitaciones, por su cadena de parámetros. */
  procesos: (params: string) => ["procesos", params] as const,
  /** El índice de toda la plataforma (`/api/buscar`). */
  buscar: (q: string, n: number) => ["buscar", q, n] as const,
  /** El estado de hoy de una pieza seguida. */
  seguimiento: (tipo: string, id: string) => ["seguimiento", tipo, id] as const,
  /** La instantánea de la nómina (`/data/nomina.json`). */
  nomina: ["nomina"] as const,
  /** El banco de trabajo del grafo (`/explorar`): una búsqueda, un nodo, una pregunta. */
  explorar: (q: string, faceta: string | null, pagina: number) => ["explorar", q, faceta, pagina] as const,
  nodo: (ruta: string) => ["nodo", ruta] as const,
  preguntar: (q: string) => ["preguntar", q] as const,
};

/**
 * Lee JSON de una ruta propia. Un no-2xx es un error con el mensaje que la
 * ruta dio (`{ error }`) o el código; un cuerpo que no es JSON, también. La
 * señal es la de TanStack Query: cancela al cambiar de clave o desmontar.
 */
export async function leerJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  const cuerpo: unknown = await r.json().catch(() => null);
  if (!r.ok) {
    const mensaje = (cuerpo as { error?: unknown } | null)?.error;
    throw new Error(typeof mensaje === "string" && mensaje ? mensaje : `Error ${r.status}`);
  }
  if (cuerpo === null) throw new Error("La respuesta no se pudo leer.");
  return cuerpo as T;
}

/** Lo que `/api/buscar` devuelve y leen la paleta y la mesa de un proyecto. */
export interface RespuestaBuscar<R, P = unknown> {
  resultados?: R[];
  pantallas?: P[];
}

export function buscarEnPlataforma<R, P = unknown>(q: string, n: number, signal?: AbortSignal) {
  return leerJson<RespuestaBuscar<R, P>>(`/api/buscar?q=${encodeURIComponent(q)}&n=${n}`, signal);
}

/** Las tres lecturas del banco de trabajo del grafo (`app/api/explorar/*`, `lib/explorar.ts`). */
export function explorarGrafo<T>(q: string, faceta: string | null, pagina: number, signal?: AbortSignal) {
  const p = new URLSearchParams({ q });
  if (faceta) p.set("faceta", faceta);
  if (pagina > 1) p.set("pagina", String(pagina));
  return leerJson<T>(`/api/explorar/buscar?${p}`, signal);
}

export function inspeccionarNodo<T>(ruta: string, signal?: AbortSignal) {
  return leerJson<T>(`/api/explorar/nodo?ruta=${encodeURIComponent(ruta)}`, signal);
}

export function preguntarAlGrafo<T>(q: string, signal?: AbortSignal) {
  return leerJson<T>(`/api/explorar/preguntar?q=${encodeURIComponent(q)}`, signal);
}
