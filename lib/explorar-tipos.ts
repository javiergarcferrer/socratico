/**
 * Lo que el banco de trabajo del grafo (`/explorar`) recibe de sus tres rutas
 * (`/api/explorar/buscar`, `/api/explorar/nodo`, `/api/explorar/preguntar`).
 * Solo tipos y constantes: viaja al navegador, así que no importa nada del
 * servidor (`lib/explorar.ts` es quien los llena).
 */

/** Una fila del resultado: un nodo del grafo o un registro del índice que no lo es (una sentencia, un cargo de la nómina). */
export interface FilaExplorada {
  /** Única en la lista: la ruta del nodo, o la dirección del registro. */
  clave: string;
  /** La faceta en que cuenta (`FACETAS`). */
  faceta: string;
  /** La clase en llano: «Persona con cargo público», «Proceso de compra». */
  clase: string;
  titulo: string;
  detalle: string | null;
  /** Quién lo publica o lo ejecuta, si se sabe. */
  origen: string | null;
  fecha: string | null;
  /** Obras y procesos: su valor declarado o estimado, en pesos; nunca lo pagado. */
  valor: number | null;
  href: string | null;
  externo: boolean;
  /** La ruta del nodo, si es un nodo del grafo: lo que abre el inspector. */
  ruta: string | null;
  /** Por qué salió: su nombre en el grafo, sus palabras, su tema o ambas. */
  via: "nombre" | "palabra" | "tema" | "ambas";
}

export interface Faceta {
  clave: string;
  etiqueta: string;
  total: number;
}

export interface Exploracion {
  consulta: string;
  /** Lo tecleado lleva una cédula: a una persona no se la busca por su número (`lib/padron.ts`). */
  cedula: boolean;
  filas: FilaExplorada[];
  /** Cuántos hay de cada faceta para lo tecleado, sin el filtro de faceta. */
  facetas: Faceta[];
  /** Cuántas filas tiene la faceta elegida (o todo), en el índice. */
  total: number;
  pagina: number;
  paginas: number;
  /** Hubo más coincidencias de las que se ordenan: las cuentas son del índice y la lista recorre las más pertinentes. */
  truncado: boolean;
  /** La fecha de corte de cada instantánea que alimenta el índice (ISO). */
  cortes: Record<string, string>;
}

/** Una arista vista desde el nodo que se inspecciona. */
export interface AristaVista {
  verbo: string;
  nombre: string;
  detalle: string | null;
  movimiento: string | null;
  fecha: string | null;
  monto: number | null;
  /** La ruta del otro extremo, si es un nodo: se pivota a él sin salir del banco. */
  ruta: string | null;
  href: string | null;
  externo: boolean;
}

export interface GrupoVisto {
  id: string;
  etiqueta: string;
  total: number;
  aristas: AristaVista[];
}

/** De qué grafo con nombre salen los triples del nodo: su fuente y su corte, o la regla que los deriva. */
export interface ProcedenciaVista {
  etiqueta: string;
  corte: string | null;
  derivado: boolean;
  triples: number;
}

export interface Inspeccion {
  ruta: string;
  tipo: string;
  clase: string;
  titulo: string;
  nota: string | null;
  hechos: { dato: string; valor: string }[];
  grupos: GrupoVisto[];
  /** Todas las aristas y los nodos distintos al otro lado. */
  aristas: number;
  vecinos: number;
  triples: number;
  procedencia: ProcedenciaVista[];
  /** Lo que se guarda en una investigación (`components/espacios/guardar.tsx`), si el tipo se guarda. */
  guardable: string | null;
}

/** Lo que el grafo entero dice de sí: lo que pinta la barra del banco. */
export interface Pulso {
  triples: number;
  nodos: number;
  clases: number;
  grafos: number;
  compilado: string | null;
}

/** Las facetas que se pueden pedir: los tipos del índice y dos clases del grafo que se buscan por nombre. */
export const CLAVES_FACETA = [
  "institucion",
  "legislador",
  "funcionario",
  "financiera",
  "proveedor",
  "proceso",
  "norma",
  "iniciativa",
  "sentencia",
  "obra",
  "documento",
  "dato",
  "cargo",
  "empresa",
  "provincia",
] as const;

export type ClaveFacetaPedida = (typeof CLAVES_FACETA)[number];

/** Cuántas aristas de un grupo viajan al inspector; el resto lo dice la cuenta y lo abre la red del nodo. */
export const ARISTAS_POR_GRUPO = 40;
