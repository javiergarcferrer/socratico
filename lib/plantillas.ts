import { SITIO } from "@/lib/sitio";
import DATOS from "./plantillas.json";

/**
 * Las plantillas de investigación (docs/INFRAESTRUCTURA.md §7.12): consultas
 * SPARQL con parámetros —una institución, un proveedor, un año, una
 * provincia— sobre el volcado sin personas naturales, cada una con su
 * pregunta en llano, lo que alcanza a decir y su resultado verificado con los
 * valores por omisión. El banco las llena con un formulario
 * (`components/sparql/plantillas.tsx`) y el MCP las da como ejemplos en la
 * descripción de `sparql`; `scripts/eval-mcp.mjs` corre cada una y la compara
 * con la misma cuenta en SQL sobre los Parquet.
 *
 * Las consultas viven en `plantillas.json` para que la evaluación las lea sin
 * TypeScript. Sin dependencias de servidor: viaja al navegador.
 */

export type TipoParametro = "institucion" | "proveedor" | "anio" | "provincia";

export interface ParametroPlantilla {
  /** El hueco en la consulta: `{{clave}}`. */
  clave: string;
  tipo: TipoParametro;
  etiqueta: string;
  /** El valor con que se verificó el resultado: un id de institución, un RPE, un año o el slug de una provincia. */
  porOmision: string;
}

export interface Plantilla {
  id: string;
  /** Las clases de la ontología de que trata (CURIE), para ofrecerla desde una de ellas. */
  clases: string[];
  pregunta: string;
  /** Lo que la respuesta alcanza a decir y lo que no. */
  alcance: string;
  parametros: ParametroPlantilla[];
  /** La consulta con `{{clave}}` donde va cada parámetro. */
  consulta: string;
  /** Lo que dio con los valores por omisión el día que se verificó. */
  verificado: { fecha: string; filas: number; primera: Record<string, string> };
}

// El JSON no lleva tipos: la evaluación revisa que cada plantilla corra y dé lo verificado.
export const PLANTILLAS = DATOS as unknown as Plantilla[];

/** Cómo se ve cada tipo de parámetro escrito: lo que acepta el formulario. */
export const AYUDA_PARAMETRO: Record<TipoParametro, string> = {
  institucion: "El número de su ficha (/instituciones/237 → 237).",
  proveedor: "Su RPE, el número de su ficha (/proveedores/767 → 767).",
  anio: "Un año entre 1990 y 2100.",
  provincia: "La provincia, de la lista.",
};

/**
 * El valor de un parámetro tal como va en la consulta, desde lo que se
 * escribió: un número, la ruta de su ficha o su dirección entera. `null` si
 * no tiene la forma del tipo: nada de lo escrito entra a la consulta sin
 * pasar por estas formas, así que el formulario no puede inyectar SPARQL.
 */
export function normalizar(tipo: TipoParametro, texto: string): string | null {
  const t = texto.trim().replace(SITIO, "").split(/[?#]/)[0];
  switch (tipo) {
    case "institucion":
      return /^(?:\/instituciones\/)?(\d{1,6})(?:-[a-z0-9-]*)?$/.exec(t)?.[1] ?? null;
    case "proveedor":
      return /^(?:\/proveedores\/)?(?:rpe\s*)?(\d{1,8})$/i.exec(t)?.[1] ?? null;
    case "anio": {
      const n = /^\d{4}$/.test(t) ? Number(t) : NaN;
      return n >= 1990 && n <= 2100 ? String(n) : null;
    }
    case "provincia":
      return /^(?:\/provincias\/)?([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(t)?.[1] ?? null;
  }
}

/** El término SPARQL de un valor ya normalizado. */
function termino(tipo: TipoParametro, valor: string): string {
  switch (tipo) {
    case "institucion":
      return `<${SITIO}/instituciones/${valor}#id>`;
    case "proveedor":
      return `<${SITIO}/proveedores/${valor}#id>`;
    case "anio":
      return `"${valor}-01-01"^^<http://www.w3.org/2001/XMLSchema#date>`;
    case "provincia":
      return `<${SITIO}/provincias/${valor}#id>`;
  }
}

/**
 * La consulta con sus huecos llenos; `null` si algún valor no tiene la forma
 * de su tipo. Sin valor, el de por omisión.
 */
export function llenarPlantilla(p: Plantilla, valores: Record<string, string> = {}): string | null {
  let q = p.consulta;
  for (const par of p.parametros) {
    const v = normalizar(par.tipo, valores[par.clave] ?? par.porOmision);
    if (v == null) return null;
    q = q.replaceAll(`{{${par.clave}}}`, termino(par.tipo, v));
  }
  return q;
}

/** Las plantillas que tratan de una clase de la ontología (`soc:Institucion`), en su orden. */
export function plantillasDeClase(curie: string): Plantilla[] {
  return PLANTILLAS.filter((p) => p.clases.includes(curie));
}

/** El tipo de parámetro que llena una ficha abierta, si lo llena: `/instituciones/237-minerd` → institución 237. */
export function parametroDeRuta(ruta: string): { tipo: TipoParametro; valor: string } | null {
  const m = /^\/(instituciones|proveedores|provincias)\/([^/?#]+)$/.exec(ruta);
  if (!m) return null;
  const tipo: TipoParametro = m[1] === "instituciones" ? "institucion" : m[1] === "proveedores" ? "proveedor" : "provincia";
  const valor = normalizar(tipo, m[2]);
  return valor ? { tipo, valor } : null;
}
