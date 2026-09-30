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

export type NombreHerramienta = "search" | "fetch" | "neighbors" | "path" | "signed_decrees" | "ontology";

export const HERRAMIENTAS_MCP: readonly { nombre: NombreHerramienta; titulo: string; llano: string }[] = [
  {
    nombre: "search",
    titulo: "Buscar en Socrático",
    llano:
      "Personas con cargo público, instituciones, empresas por nombre o RNC, bancos, provincias, decretos, compras, normas, iniciativas del Congreso, sentencias, obras, cargos de la nómina, documentos y datos abiertos.",
  },
  {
    nombre: "fetch",
    titulo: "Leer un registro",
    llano: "Una ficha entera: sus datos, sus relaciones y su fuente con la fecha de corte.",
  },
  {
    nombre: "neighbors",
    titulo: "Con quién se liga",
    llano: "Todas las relaciones de un nodo del grafo, por grupo y por páginas.",
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
    llano: "Qué es cada clase de nodo y qué quiere decir cada relación.",
  },
];

/** El título de una herramienta. */
export function tituloHerramienta(nombre: NombreHerramienta): string {
  return HERRAMIENTAS_MCP.find((h) => h.nombre === nombre)!.titulo;
}
