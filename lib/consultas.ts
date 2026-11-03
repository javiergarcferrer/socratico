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
  /** El banco de trabajo del grafo (la portada, `/`): una búsqueda, un nodo, una pregunta. */
  explorar: (q: string, faceta: string | null, pagina: number) => ["explorar", q, faceta, pagina] as const,
  nodo: (ruta: string) => ["nodo", ruta] as const,
  vivo: (ruta: string) => ["vivo", ruta] as const,
  abiertos: ["abiertos"] as const,
  preguntar: (q: string) => ["preguntar", q] as const,
  /** Una consulta de solo lectura sobre las tablas del grafo (`/api/sql`), por su texto: el explorador de objetos. */
  sql: (q: string) => ["sql", q] as const,
  /** La ontología compacta del recorrido de clases (`/api/explorar/ontologia`). */
  ontologia: ["ontologia"] as const,
  /** Una consulta SPARQL de solo lectura (`/sparql`), por su texto: el editor del banco. */
  sparql: (q: string) => ["sparql", q] as const,
  /** Lo que el editor de SPARQL autocompleta (`/sparql/terminos`). */
  terminosSparql: ["sparql-terminos"] as const,
  /** El camino entre dos nodos y sus alternos (`/api/grafo/camino`), para el lienzo del banco. */
  camino: (de: string, a: string) => ["camino", de, a] as const,
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

export function caminoEntre<T>(de: string, a: string, signal?: AbortSignal) {
  return leerJson<T>(`/api/grafo/camino?de=${encodeURIComponent(de)}&a=${encodeURIComponent(a)}`, signal);
}

export function vivoDelNodo<T>(ruta: string, signal?: AbortSignal) {
  return leerJson<T>(`/api/explorar/vivo?ruta=${encodeURIComponent(ruta)}`, signal);
}

export function abiertosAhora<T>(signal?: AbortSignal) {
  return leerJson<T>("/api/explorar/abiertos", signal);
}

export function preguntarAlGrafo<T>(q: string, signal?: AbortSignal) {
  return leerJson<T>(`/api/explorar/preguntar?q=${encodeURIComponent(q)}`, signal);
}

export function leerOntologia<T>(signal?: AbortSignal) {
  return leerJson<T>("/api/explorar/ontologia", signal);
}

/** Lo que responde `/api/sql` (`lib/grafo-sql.ts`). */
export interface RespuestaSql {
  columnas: string[];
  filas: unknown[][];
  truncada: boolean;
  ms: number;
  generadas: string | null;
}

/** SQL de solo lectura sobre las tablas del grafo: el GET, que la CDN cachea mientras dure el despliegue. */
export function consultarTablas(q: string, signal?: AbortSignal) {
  return leerJson<RespuestaSql>(`/api/sql?q=${encodeURIComponent(q)}`, signal);
}

/* ---------------------------------------------------------------- SPARQL */

/** Una celda de SPARQL 1.1 Query Results JSON. */
export interface CeldaSparql {
  type: "uri" | "literal" | "bnode";
  value: string;
  "xml:lang"?: string;
  datatype?: string;
}

/** Lo que el editor pinta: filas (SELECT), un sí o un no (ASK) o triples en N-Triples (CONSTRUCT, DESCRIBE). */
export type RespuestaSparql =
  | { tipo: "filas"; variables: string[]; filas: Record<string, CeldaSparql>[]; truncada: boolean; ms: number }
  | { tipo: "booleano"; valor: boolean; ms: number }
  | { tipo: "triples"; ntriples: string; truncada: boolean; ms: number };

/** Un no-2xx de `/sparql`: 400 es la consulta (dice qué cambiar), 503 el motor ocupado, 502 el motor caído. */
export class ErrorSparql extends Error {
  constructor(
    message: string,
    readonly estado: number,
  ) {
    super(message);
  }
}

/** La dirección GET de una consulta en `/sparql` (la CDN la guarda), con su formato si se pide uno. */
export const urlSparql = (q: string, formato?: string) => `/sparql?query=${encodeURIComponent(q)}${formato ? `&format=${formato}` : ""}`;

/**
 * Corre una consulta en `/sparql`: por GET si cabe (la CDN guarda la
 * respuesta), si no por POST. Un 400 es un error con lo que hay que cambiar.
 */
export async function consultarSparql(q: string, signal?: AbortSignal): Promise<RespuestaSparql> {
  const accept = "application/sparql-results+json, application/n-triples;q=0.9";
  const url = urlSparql(q);
  const r =
    url.length <= 6_000
      ? await fetch(url, { headers: { Accept: accept }, signal })
      : await fetch("/sparql", { method: "POST", headers: { Accept: accept, "Content-Type": "application/sparql-query" }, body: q, signal });
  const texto = await r.text();
  if (!r.ok) throw new ErrorSparql(texto.trim() || `Error ${r.status}`, r.status);
  const ms = Number(r.headers.get("socratico-ms") ?? 0);
  const truncada = r.headers.get("socratico-truncada") === "1";
  if ((r.headers.get("content-type") ?? "").startsWith("application/n-triples")) return { tipo: "triples", ntriples: texto, truncada, ms };
  const json = JSON.parse(texto) as { head?: { vars?: string[] }; boolean?: boolean; results?: { bindings?: Record<string, CeldaSparql>[] } };
  if (typeof json.boolean === "boolean") return { tipo: "booleano", valor: json.boolean, ms };
  return { tipo: "filas", variables: json.head?.vars ?? [], filas: json.results?.bindings ?? [], truncada, ms };
}

export interface TerminosSparql {
  prefijos: Record<string, string>;
  terminos: { curie: string; etiqueta: string; tipo: "clase" | "propiedad" | "concepto" }[];
}

export function leerTerminosSparql(signal?: AbortSignal) {
  return leerJson<TerminosSparql>("/sparql/terminos", signal);
}
