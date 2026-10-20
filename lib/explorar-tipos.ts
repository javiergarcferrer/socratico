/**
 * Lo que el banco de trabajo del grafo (la portada, `/`) recibe de sus tres rutas
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
  /** La clave del grafo con nombre: dos pueden compartir etiqueta (los titulares y los suplentes de la JCE). */
  clave: string;
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
  /** Cuántos nodos tiene cada clase, de la más poblada a la menos. */
  porClase: { tipo: string; clase: string; nodos: number; /** La clase de la ontología: `soc:Institucion`. */ curie: string }[];
  /** Los grafos con nombre: de qué fuente y de qué corte, o de qué regla, sale cada triple. */
  fuentes: { clave: string; etiqueta: string; corte: string | null; derivado: boolean }[];
}

/** Lo abierto a ofertas en todo el Estado ahora, leído de la DGCP (`/api/explorar/abiertos`). */
export interface AbiertosAhora {
  total: number;
  leido: string;
  filas: FilaViva[];
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

/** Una fila de lo que la fuente dice ahora de un nodo: un proceso abierto, un contrato adjudicado, un estado. */
export interface FilaViva {
  titulo: string;
  detalle: string | null;
  href: string | null;
  externo: boolean;
  /** Un monto en pesos y qué es («estimado», «contratado»): nunca lo pagado. */
  monto: number | null;
  montoEs: string | null;
  /** La marca de estado, en la tabla única de `lib/estados.ts`. */
  marca: { texto: string; tono: "accionable" | "contexto" | "cumplido" | "aviso" | "anulado"; original: string | null } | null;
  fecha: string | null;
  prefijoFecha: string | null;
}

/** Lo que la fuente en vivo dice de un nodo, leído en el momento del pedido (con la caché de su adaptador). */
export interface Vivo {
  /** La fuente, con su nombre en llano: «API de datos abiertos de la DGCP». */
  fuente: string;
  /** Cuándo se leyó (ISO). */
  leido: string;
  /** Cada cuánto se relee: la ventana de caché del adaptador. */
  ventana: string;
  titulo: string;
  /** Una línea que resume o compara con la instantánea del grafo. */
  resumen: string | null;
  filas: FilaViva[];
  total: number | null;
  enlace: { href: string; texto: string } | null;
}

export type ClaveFacetaPedida = (typeof CLAVES_FACETA)[number];

/** Cuántas aristas de un grupo viajan al inspector; el resto lo dice la cuenta y lo abre la red del nodo. */
export const ARISTAS_POR_GRUPO = 40;

/** Una clase de la ontología como la recorre el banco: su lugar en la jerarquía y cuántos nodos tiene el grafo. */
export interface ClaseVista {
  /** `soc:Institucion`. */
  curie: string;
  etiqueta: string;
  comentario: string;
  /** La clase de aquí de la que es un caso, si tiene. */
  padre: string | null;
  enUso: boolean;
  /** Los nodos del grafo compilado de esta clase, si es una clase con nodos propios. */
  nodos: number | null;
}

/** Una propiedad de la ontología: una relación entre clases o un dato de una clase. */
export interface PropiedadVista {
  curie: string;
  tipo: "objeto" | "dato";
  etiqueta: string;
  comentario: string;
  dominio: string[];
  rango: string[];
  enUso: boolean;
}

/** La ontología entera, compacta, para el recorrido de clases del banco (`lib/ontologia.ts`). */
export interface OntologiaVista {
  version: string;
  clases: ClaseVista[];
  propiedades: PropiedadVista[];
}
