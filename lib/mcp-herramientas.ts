import { SITIO } from "@/lib/sitio";

/**
 * El servidor MCP en una tabla sin dependencias: su dirección y sus
 * herramientas, con el título que ve quien usa el asistente y la línea que las
 * explica en `/conectar`. `lib/mcp.ts` registra cada una con este título; la
 * página las lista de aquí, así que no pueden desalinearse. Módulo aparte
 * para que la página no arrastre el SDK ni el índice de búsqueda.
 */

/** La dirección que se pega en el asistente. */
export const DIRECCION_MCP = `${SITIO}/mcp`;

export type NombreHerramienta =
  | "retrieve"
  | "search"
  | "fetch"
  | "procurement"
  | "contracting_history"
  | "query"
  | "path"
  | "signed_decrees"
  | "ontology";

export const HERRAMIENTAS_MCP: readonly { nombre: NombreHerramienta; titulo: string; llano: string }[] = [
  {
    nombre: "retrieve",
    titulo: "Recuperar la evidencia de una pregunta",
    llano:
      "Una pregunta en llano entra; sale la evidencia para contestarla: registros, las entidades del grafo con sus relaciones y compras, la consulta de compras que pide y las llamadas para seguir, todo con su fuente y su fecha.",
  },
  {
    nombre: "search",
    titulo: "Buscar en Socrático",
    llano:
      "Personas con cargo público, instituciones, empresas por nombre o RNC, bancos, provincias, decretos, compras, normas, iniciativas del Congreso, sentencias, obras, cargos de la nómina, documentos y datos abiertos.",
  },
  {
    nombre: "fetch",
    titulo: "Leer un registro",
    llano: "Una ficha entera: sus datos, sus relaciones y su fuente con la fecha de corte; o todas las relaciones de un grupo, por páginas.",
  },
  {
    nombre: "procurement",
    titulo: "Compras por monto, fecha o estado",
    llano:
      "Todos los procesos de compra de los últimos doce meses, filtrados por año, institución, estado, modalidad y palabras, y ordenados por monto o fecha, con su total y su suma.",
  },
  {
    nombre: "contracting_history",
    titulo: "Lo contratado desde 2015",
    llano: "Lo que el Estado le ha contratado a un proveedor, lo que ha contratado una institución, o el país entero, año por año y con sus mayores contrapartes.",
  },
  {
    nombre: "query",
    titulo: "Consulta SQL",
    llano: "Una consulta SQL de lectura sobre las tablas del grafo sin personas naturales y los procesos de compra, para contar, cruzar y ordenar lo que las demás no ordenan, en DuckDB (abierto).",
  },
  {
    nombre: "path",
    titulo: "Camino entre dos registros",
    llano: "La cadena más corta de relaciones registradas entre dos nodos, o por qué no se encontró.",
  },
  {
    nombre: "signed_decrees",
    titulo: "Decretos que firmó una persona",
    llano: "El registro de la Consultoría Jurídica por firmante, filtrado por año, materia y palabras.",
  },
  {
    nombre: "ontology",
    titulo: "La ontología",
    llano: "Qué es cada clase de nodo y qué quiere decir cada relación, y dónde descargar el grafo y sus tablas.",
  },
];

/** El título de una herramienta. */
export function tituloHerramienta(nombre: NombreHerramienta): string {
  return HERRAMIENTAS_MCP.find((h) => h.nombre === nombre)!.titulo;
}
