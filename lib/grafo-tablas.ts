import meta from "@/public/tablas/meta.json";

/**
 * Las tablas del grafo en SQL (`scripts/build-grafo-tablas.mjs`): qué hay en
 * cada una, con sus columnas descritas, su fuente y su corte. Lo leen la
 * herramienta `query` del servidor MCP (para explicarle al asistente qué puede
 * preguntar) y `/api/sql` (para saber qué cargar). Sin DuckDB: este módulo
 * viaja en la función del servidor MCP, que no lleva el motor.
 */

export interface ColumnaTabla {
  nombre: string;
  tipo: string;
  descripcion: string;
}

export interface TablaGrafo {
  descripcion: string;
  fuente: string;
  corte: string | null;
  filas: number;
  columnas: ColumnaTabla[];
}

export const TABLAS_GRAFO = meta.tablas as Record<string, TablaGrafo>;
export const TABLAS_GENERADAS = meta.generado;
export const NOMBRES_TABLAS = Object.keys(TABLAS_GRAFO);

/** El esquema en una línea por tabla: `nombre(col TIPO, …)`: lo que el asistente lee antes de escribir SQL. */
export function esquemaCompacto(): string {
  return NOMBRES_TABLAS.map((n) => `${n}(${TABLAS_GRAFO[n].columnas.map((c) => `${c.nombre} ${c.tipo}`).join(", ")})`).join("\n");
}
