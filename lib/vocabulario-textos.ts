/**
 * Los sentidos de un fallo, como los lee `lib/texto-extraccion.ts` en el
 * dispositivo de una sentencia: una sola definición para el esquema SKOS de
 * la ontología (`soc:sentidos`), los constructores del grafo, la ficha de la
 * sentencia y el servidor MCP (docs/INFRAESTRUCTURA.md §5.12, §7.2).
 *
 * Módulo puro: ni `fs` ni red.
 */

/**
 *  · `no-conforme`: un ordinal **declara** una norma no conforme con la
 *    Constitución o inconstitucional (la acción directa prosperó);
 *  · `conforme`: un ordinal la declara conforme (un tratado, una norma
 *    atacada que se sostiene);
 *  · `acoge`, `rechaza`: lo que manda el ordinal de fondo;
 *  · `inadmisible`: el recurso o la acción no se conoció en el fondo;
 *  · `otro`: ninguno de esos (un desistimiento, un archivo, una liquidación).
 */
export type Sentido = "no-conforme" | "conforme" | "acoge" | "rechaza" | "inadmisible" | "otro";

export const SENTIDOS: readonly Sentido[] = ["no-conforme", "conforme", "acoge", "rechaza", "inadmisible", "otro"];

/** Cómo se lee cada sentido en una ficha: una frase con su verbo. */
export const ETIQUETA_SENTIDO: Record<Sentido, string> = {
  "no-conforme": "Declara una norma no conforme con la Constitución",
  conforme: "Declara una norma conforme con la Constitución",
  acoge: "Acoge",
  rechaza: "Rechaza",
  inadmisible: "Inadmisible",
  otro: "Otra decisión",
};

/** Qué quiere decir, en llano. */
export const DEFINICION_SENTIDO: Record<Sentido, string> = {
  "no-conforme": "Un ordinal del dispositivo declara una ley o un decreto, en todo o en parte, contrario a la Constitución.",
  conforme: "Un ordinal del dispositivo declara una norma o un tratado de acuerdo con la Constitución.",
  acoge: "El tribunal le da la razón a quien recurre o acciona, en el fondo.",
  rechaza: "El tribunal conoce el fondo y no le da la razón a quien recurre o acciona.",
  inadmisible: "El tribunal no conoce el fondo: el recurso o la acción no reúne lo que la ley exige para examinarlo.",
  otro: "Ni acoge ni rechaza ni declara: un desistimiento, un archivo, una corrección, una liquidación.",
};
