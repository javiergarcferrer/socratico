import { enlace } from "@/lib/grafo";
import { SITIO } from "@/lib/sitio";

/**
 * Los tipos de objeto del explorador de objetos de `/` (el banco de trabajo,
 * docs/INFRAESTRUCTURA.md §7.7): cada clase del grafo que tiene tabla
 * (`public/tablas/`, §7.9) con las columnas que se ven, las que filtran por
 * categoría, la que suma y el orden de partida. El explorador arma con esto
 * el SQL que pide a `/api/sql` —el motor de solo lectura que ya sirve al
 * servidor MCP—: identificadores solo de esta lista, valores escapados.
 *
 * Viaja al navegador: no importa nada del servidor. Las personas naturales no
 * tienen tabla (§7.11): se buscan por nombre, no se listan.
 */

export type FormatoColumna = "texto" | "pesos" | "entero" | "fecha" | "porcentaje" | "categoria" | "codigo";

export interface ColumnaObjeto {
  col: string;
  etiqueta: string;
  formato: FormatoColumna;
  /** Se puede ordenar por ella. */
  ordena?: boolean;
  /** Secundaria: sale solo cuando la tabla tiene ancho (desde 48 rem de contenedor). */
  ancha?: boolean;
}

export interface TipoObjeto {
  id: string;
  /** La clase de la ontología (`soc:Institucion`). */
  clase: string;
  etiqueta: string;
  singular: string;
  tabla: string;
  /** La expresión del nombre que se lee en la fila. */
  titulo: string;
  /** Si la fuente lo copia en mayúsculas: un nombre propio se lee en tipo título; una carátula, en oración (`lib/format.ts`). */
  caja?: "nombre" | "oracion";
  /** Las columnas donde busca el filtro de texto. */
  busca: string[];
  /** La primera es el nombre: se pinta con `titulo` y abre el nodo. */
  columnas: ColumnaObjeto[];
  /** Columnas de categoría: cada una da un filtro con la cuenta de cada valor. */
  facetas: { col: string; etiqueta: string }[];
  /** La columna en pesos que se suma, y qué es. */
  suma?: { col: string; es: string };
  orden: { col: string; dir: "asc" | "desc" };
  /** Las columnas que hacen falta para la ruta de la ficha (además de las visibles). */
  extra?: string[];
  /** La ruta del nodo en el grafo, de una fila. */
  ruta: (f: Record<string, unknown>) => string | null;
  /** La fuente de la tabla, en llano. */
  fuente: string;
}

/** La ruta propia de una dirección absoluta de la plataforma (la columna `url` de las tablas). */
const deUrl = (v: unknown) => (typeof v === "string" && v.startsWith(SITIO) ? v.slice(SITIO.length) : null);

export const TIPOS_OBJETO: TipoObjeto[] = [
  {
    id: "instituciones",
    clase: "soc:Institucion",
    etiqueta: "Instituciones",
    singular: "Institución",
    tabla: "instituciones",
    titulo: "nombre",
    caja: "nombre",
    busca: ["nombre", "siglas"],
    columnas: [
      { col: "nombre", etiqueta: "Nombre", formato: "texto", ordena: true },
      { col: "siglas", etiqueta: "Siglas", formato: "codigo", ancha: true },
      { col: "sector", etiqueta: "Sector", formato: "categoria", ancha: true },
      { col: "contratos", etiqueta: "Contratos", formato: "entero", ordena: true, ancha: true },
      { col: "monto_contratado", etiqueta: "Contratado desde 2015", formato: "pesos", ordena: true },
    ],
    facetas: [{ col: "sector", etiqueta: "Sector" }],
    suma: { col: "monto_contratado", es: "contratado desde 2015, no pagado" },
    orden: { col: "monto_contratado", dir: "desc" },
    extra: ["url"],
    ruta: (f) => deUrl(f.url),
    fuente: "DIGEPRES y DGCP",
  },
  {
    id: "proveedores",
    clase: "soc:Proveedor",
    etiqueta: "Proveedores",
    singular: "Proveedor",
    tabla: "proveedores",
    titulo: "nombre",
    caja: "nombre",
    busca: ["nombre", "rnc", "rpe"],
    columnas: [
      { col: "nombre", etiqueta: "Nombre", formato: "texto", ordena: true },
      { col: "rpe", etiqueta: "RPE", formato: "codigo", ancha: true },
      { col: "contratos", etiqueta: "Contratos", formato: "entero", ordena: true, ancha: true },
      { col: "ultimo_contrato", etiqueta: "Último contrato", formato: "fecha", ordena: true, ancha: true },
      { col: "monto_contratado", etiqueta: "Contratado desde 2015", formato: "pesos", ordena: true },
    ],
    facetas: [],
    suma: { col: "monto_contratado", es: "contratado desde 2015, no pagado" },
    orden: { col: "monto_contratado", dir: "desc" },
    extra: ["url"],
    ruta: (f) => deUrl(f.url),
    fuente: "Tablas de contratos de la DGCP",
  },
  {
    id: "procesos",
    clase: "soc:ProcesoDeContratacion",
    etiqueta: "Procesos de compra",
    singular: "Proceso de compra",
    tabla: "procesos",
    titulo: "titulo",
    caja: "oracion",
    busca: ["titulo", "unidad_compra", "codigo"],
    columnas: [
      { col: "titulo", etiqueta: "Carátula", formato: "texto", ordena: true },
      { col: "unidad_compra", etiqueta: "Quién compra", formato: "texto", ordena: true, ancha: true },
      { col: "estado", etiqueta: "Etapa al corte", formato: "categoria", ancha: true },
      { col: "fecha", etiqueta: "Publicado", formato: "fecha", ordena: true, ancha: true },
      { col: "valor_estimado", etiqueta: "Valor estimado", formato: "pesos", ordena: true },
    ],
    facetas: [
      { col: "estado", etiqueta: "Etapa al corte" },
      { col: "modalidad", etiqueta: "Modalidad" },
      { col: "objeto", etiqueta: "Objeto" },
    ],
    suma: { col: "valor_estimado", es: "estimado al publicar, no adjudicado ni pagado" },
    orden: { col: "fecha", dir: "desc" },
    extra: ["url"],
    ruta: (f) => deUrl(f.url),
    fuente: "Procesos de la DGCP, últimos doce meses",
  },
  {
    id: "obras",
    clase: "soc:ProyectoDeInversion",
    etiqueta: "Obras públicas",
    singular: "Obra",
    tabla: "obras",
    titulo: "nombre",
    caja: "oracion",
    busca: ["nombre", "snip"],
    columnas: [
      { col: "nombre", etiqueta: "Nombre", formato: "texto", ordena: true },
      { col: "sector", etiqueta: "Sector", formato: "categoria", ancha: true },
      { col: "estado", etiqueta: "Estado", formato: "categoria", ancha: true },
      { col: "avance", etiqueta: "Avance declarado", formato: "porcentaje", ordena: true, ancha: true },
      { col: "valor_estimado", etiqueta: "Valor declarado", formato: "pesos", ordena: true },
    ],
    facetas: [
      { col: "estado", etiqueta: "Estado" },
      { col: "sector", etiqueta: "Sector" },
    ],
    suma: { col: "valor_estimado", es: "declarado en MapaInversiones" },
    orden: { col: "valor_estimado", dir: "desc" },
    extra: ["url"],
    ruta: (f) => deUrl(f.url),
    fuente: "MapaInversiones",
  },
  {
    id: "empresas",
    clase: "soc:Empresa",
    etiqueta: "Empresas",
    singular: "Persona jurídica",
    tabla: "empresas",
    titulo: "nombre",
    caja: "nombre",
    busca: ["nombre", "rnc"],
    columnas: [
      { col: "nombre", etiqueta: "Razón social", formato: "texto", ordena: true },
      { col: "rnc", etiqueta: "RNC", formato: "codigo", ancha: true },
      { col: "estado", etiqueta: "Estado", formato: "categoria", ancha: true },
      { col: "actividad", etiqueta: "Actividad", formato: "texto", ancha: true },
      { col: "inicio_operaciones", etiqueta: "Inicio", formato: "fecha", ordena: true },
    ],
    facetas: [{ col: "estado", etiqueta: "Estado" }],
    orden: { col: "nombre", dir: "asc" },
    extra: ["url"],
    ruta: (f) => deUrl(f.url),
    fuente: "Padrón de la DGII: las que el grafo liga a algo",
  },
  {
    id: "normas",
    clase: "soc:Norma",
    etiqueta: "Normas",
    singular: "Norma",
    tabla: "normas",
    titulo: "upper(substr(tipo, 1, 1)) || substr(tipo, 2) || ' ' || numero",
    busca: ["numero", "etiqueta"],
    columnas: [
      { col: "numero", etiqueta: "Norma", formato: "codigo", ordena: true },
      { col: "materia", etiqueta: "Materia", formato: "categoria", ancha: true },
      { col: "etiqueta", etiqueta: "Etiqueta de la Consultoría", formato: "texto", ancha: true },
      { col: "fecha", etiqueta: "Fecha", formato: "fecha", ordena: true },
    ],
    facetas: [
      { col: "tipo", etiqueta: "Tipo" },
      { col: "materia", etiqueta: "Materia" },
    ],
    orden: { col: "fecha", dir: "desc" },
    extra: ["id"],
    ruta: (f) => (typeof f.id === "string" ? f.id : null),
    fuente: "Consultoría Jurídica del Poder Ejecutivo",
  },
  {
    id: "iniciativas",
    clase: "soc:Iniciativa",
    etiqueta: "Iniciativas del Congreso",
    singular: "Iniciativa",
    tabla: "iniciativas",
    titulo: "expediente",
    busca: ["expediente"],
    columnas: [
      { col: "expediente", etiqueta: "Expediente", formato: "codigo", ordena: true },
      { col: "tipo", etiqueta: "Tipo", formato: "categoria", ancha: true },
      { col: "condicion", etiqueta: "Condición al corte", formato: "categoria" },
      { col: "tema", etiqueta: "Tema", formato: "categoria", ancha: true },
      { col: "fecha", etiqueta: "Depositada", formato: "fecha", ordena: true },
    ],
    facetas: [
      { col: "condicion", etiqueta: "Condición al corte" },
      { col: "tipo", etiqueta: "Tipo" },
      { col: "tema", etiqueta: "Tema" },
    ],
    orden: { col: "fecha", dir: "desc" },
    extra: ["id"],
    ruta: (f) => (typeof f.id === "string" ? f.id : null),
    fuente: "SIL de la Cámara de Diputados",
  },
  {
    id: "financieras",
    clase: "soc:EntidadFinanciera",
    etiqueta: "Entidades financieras",
    singular: "Entidad financiera",
    tabla: "financieras",
    titulo: "nombre",
    caja: "nombre",
    busca: ["nombre", "razon_social"],
    columnas: [
      { col: "nombre", etiqueta: "Nombre", formato: "texto", ordena: true },
      { col: "razon_social", etiqueta: "Razón social", formato: "texto", ancha: true },
    ],
    facetas: [],
    orden: { col: "nombre", dir: "asc" },
    extra: ["url"],
    ruta: (f) => deUrl(f.url),
    fuente: "SB, SIPEN, SIS e IDECOOP",
  },
  {
    id: "conjuntos",
    clase: "soc:ConjuntoDeDatos",
    etiqueta: "Datos abiertos",
    singular: "Conjunto de datos",
    tabla: "conjuntos",
    titulo: "titulo",
    busca: ["titulo", "organizacion"],
    columnas: [
      { col: "titulo", etiqueta: "Título", formato: "texto", ordena: true },
      { col: "organizacion", etiqueta: "Quién lo publica", formato: "texto", ordena: true, ancha: true },
      { col: "formatos", etiqueta: "Formatos", formato: "codigo", ancha: true },
    ],
    // No los grupos temáticos: la columna los junta separados por comas, y contarla daría combinaciones, no grupos.
    facetas: [{ col: "organizacion", etiqueta: "Quién lo publica" }],
    orden: { col: "titulo", dir: "asc" },
    extra: ["url"],
    ruta: (f) => deUrl(f.url),
    fuente: "datos.gob.do",
  },
  {
    id: "provincias",
    clase: "soc:Provincia",
    etiqueta: "Provincias",
    singular: "Provincia",
    tabla: "provincias",
    titulo: "nombre",
    busca: ["nombre"],
    columnas: [{ col: "nombre", etiqueta: "Nombre", formato: "texto", ordena: true }],
    facetas: [],
    orden: { col: "nombre", dir: "asc" },
    extra: ["slug"],
    ruta: (f) => (typeof f.slug === "string" ? enlace.provincia(f.slug) : null),
    fuente: "ONE",
  },
];

export const tipoObjeto = (id: string | null | undefined) => TIPOS_OBJETO.find((t) => t.id === id) ?? null;
export const tipoDeClase = (clase: string) => TIPOS_OBJETO.find((t) => t.clase === clase) ?? null;

/** Cuántas filas trae una página del explorador. */
export const FILAS_POR_PAGINA = 50;

/** Un literal de SQL: comillas dobladas. Los identificadores nunca vienen de fuera: salen de `TIPOS_OBJETO`. */
const literal = (v: string) => `'${v.replace(/'/g, "''")}'`;

export interface PedidoObjetos {
  tipo: TipoObjeto;
  texto: string;
  /** Filtros de categoría puestos: columna → valor; `""` es «sin dato» (NULL). */
  filtros: Record<string, string>;
  orden: string;
  dir: "asc" | "desc";
  pagina: number;
}

/** Las condiciones del pedido, sin la de una faceta (para contar los valores de esa faceta con los demás filtros puestos). */
function donde(p: PedidoObjetos, sin?: string): string {
  const partes: string[] = [];
  const t = p.texto.trim().slice(0, 120);
  if (t) {
    partes.push(`(${p.tipo.busca.map((c) => `contains(lower(strip_accents(coalesce(CAST(${c} AS VARCHAR), ''))), lower(strip_accents(${literal(t)})))`).join(" OR ")})`);
  }
  for (const f of p.tipo.facetas) {
    if (f.col === sin) continue;
    const v = p.filtros[f.col];
    if (v === "") partes.push(`${f.col} IS NULL`);
    else if (v != null) partes.push(`${f.col} = ${literal(v)}`);
  }
  return partes.length ? `WHERE ${partes.join(" AND ")}` : "";
}

/** La página de filas, con las columnas visibles, el título y las que hacen falta para la ruta. */
export function sqlFilas(p: PedidoObjetos): string {
  const columnas = p.tipo.columnas.find((c) => c.col === p.orden && c.ordena) ? p.orden : p.tipo.orden.col;
  const cols = [...new Set([...p.tipo.columnas.map((c) => c.col), ...(p.tipo.extra ?? [])])];
  return `SELECT ${p.tipo.titulo} AS _titulo, ${cols.join(", ")} FROM ${p.tipo.tabla} ${donde(p)} ORDER BY ${columnas} ${p.dir === "asc" ? "ASC" : "DESC"} NULLS LAST LIMIT ${FILAS_POR_PAGINA} OFFSET ${(Math.max(1, p.pagina) - 1) * FILAS_POR_PAGINA}`;
}

/** Cuántos objetos cumplen el pedido y, si el tipo suma, cuánto suman. */
export function sqlResumen(p: PedidoObjetos): string {
  return `SELECT count(*) AS n${p.tipo.suma ? `, sum(${p.tipo.suma.col}) AS suma` : ""} FROM ${p.tipo.tabla} ${donde(p)}`;
}

/** Los valores de cada faceta con su cuenta, con los demás filtros puestos: una sola consulta. */
export function sqlFacetas(p: PedidoObjetos): string | null {
  if (p.tipo.facetas.length === 0) return null;
  return p.tipo.facetas
    .map(
      (f) =>
        `(SELECT ${literal(f.col)} AS faceta, CAST(${f.col} AS VARCHAR) AS valor, count(*) AS n FROM ${p.tipo.tabla} ${donde(p, f.col)} GROUP BY 2 ORDER BY 3 DESC LIMIT 14)`,
    )
    .join(" UNION ALL ");
}

/** Un valor de categoría como se lee: «en-tramite» → «En trámite» no se adivina; se le quitan guiones y se pone mayúscula. */
export function categoriaLegible(v: unknown): string {
  if (v == null || v === "") return "Sin dato";
  const s = String(v).replace(/[-_]+/g, " ").trim();
  return s.charAt(0).toLocaleUpperCase("es") + s.slice(1).toLocaleLowerCase("es");
}
