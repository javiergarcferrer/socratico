/**
 * Las paletas de los gráficos, como **clases literales** sobre los tokens de
 * `app/globals.css` (el escáner de Tailwind lee el fuente: una clase armada
 * con plantilla no se genera).
 *
 * Cada paleta tiene un oficio y solo uno (docs/IDENTIDAD.md §Gráficos):
 *
 *  - `CATEGORICA` — qué serie es. Orden fijo; la serie N lleva siempre el
 *    paso N, así que el color sigue a la entidad y no a su puesto: un filtro
 *    que quita una serie no repinta a las demás. Una sola serie es la 1.
 *  - `SECUENCIAL` — cuánto. Un solo tono, de claro a oscuro.
 *  - `DIVERGENTE` — de qué lado. Firma contra sello, gris del papel en medio.
 *  - Estado — **no está aquí**: se usa `TONOS[tono].dot` de `lib/estados.ts`.
 *    `ORDEN_TONOS` solo dice en qué orden se apilan, que es lo que el
 *    validador midió.
 */
import type { Tono } from "@/lib/estados";

export interface ClasesSerie {
  bg: string;
  fill: string;
  stroke: string;
}

export const CATEGORICA: readonly ClasesSerie[] = [
  { bg: "bg-grafico-1", fill: "fill-grafico-1", stroke: "stroke-grafico-1" },
  { bg: "bg-grafico-2", fill: "fill-grafico-2", stroke: "stroke-grafico-2" },
  { bg: "bg-grafico-3", fill: "fill-grafico-3", stroke: "stroke-grafico-3" },
  { bg: "bg-grafico-4", fill: "fill-grafico-4", stroke: "stroke-grafico-4" },
  { bg: "bg-grafico-5", fill: "fill-grafico-5", stroke: "stroke-grafico-5" },
];

/** La cola que no cabe en cinco series: grafito, sin identidad propia. */
export const OTROS: ClasesSerie = {
  bg: "bg-grafico-otros",
  fill: "fill-grafico-otros",
  stroke: "stroke-grafico-otros",
};

/** La serie única: la firma. */
export const SERIE = CATEGORICA[0];

/**
 * El contexto: una serie que acompaña y no es la noticia (el énfasis de la
 * habilidad `dataviz`: una en la firma plena, el resto en la firma tenue).
 */
export const CONTEXTO: ClasesSerie = {
  bg: "bg-grafico-sec-2",
  fill: "fill-grafico-sec-2",
  stroke: "stroke-grafico-sec-2",
};

/** Seis pasos de claro a oscuro. El 1 es «casi cero» y casi se funde. */
export const SECUENCIAL: readonly string[] = [
  "bg-grafico-sec-1",
  "bg-grafico-sec-2",
  "bg-grafico-sec-3",
  "bg-grafico-sec-4",
  "bg-grafico-sec-5",
  "bg-grafico-sec-6",
];

/** Los mismos seis pasos como relleno de SVG (el mapa). */
export const SECUENCIAL_RELLENO: readonly string[] = [
  "fill-grafico-sec-1",
  "fill-grafico-sec-2",
  "fill-grafico-sec-3",
  "fill-grafico-sec-4",
  "fill-grafico-sec-5",
  "fill-grafico-sec-6",
];

export const DIVERGENTE = {
  firma: "bg-grafico-div-firma",
  firmaTenue: "bg-grafico-div-firma-tenue",
  neutro: "bg-grafico-div-neutro",
  selloTenue: "bg-grafico-div-sello-tenue",
  sello: "bg-grafico-div-sello",
} as const;

/**
 * El orden en que se apilan los estados en una barra al 100 %. No es el del
 * trámite: es el que el validador dejó pasar con los cinco puntos de
 * `lib/estados.ts` vecinos (ΔE CVD 12.3, normal 17.2). En el orden del trámite
 * —accionable junto a contexto— la firma y el grafito quedaban a ΔE 10.1, por
 * debajo del suelo de 15 aun con vista normal.
 */
export const ORDEN_TONOS: readonly Tono[] = ["contexto", "aviso", "anulado", "accionable", "cumplido"];
