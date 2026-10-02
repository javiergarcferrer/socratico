import { formatPesos, SIN_DATO } from "@/lib/format";

/**
 * Cómo se escriben las cifras de la vertical Dinero. Todo pasa por
 * `lib/format.ts`; esto solo fija los decimales de una tasa y la conversión
 * de los millones en que publican el BCRD y Crédito Público.
 */

export const decimal = (n: number, d = 2) =>
  n.toLocaleString("es-DO", { minimumFractionDigits: d, maximumFractionDigits: d });

/** 5.5 → «5.50 %». */
export const porciento = (n: number | null | undefined) => (n == null ? SIN_DATO : `${decimal(n)} %`);

/** Diferencia entre dos tasas, en puntos: «8.6 puntos». */
export const enPuntos = (n: number) => `${decimal(Math.abs(n), 1)} ${Math.abs(n) >= 0.95 && Math.abs(n) < 1.05 ? "punto" : "puntos"}`;

/** Millones de RD$ (como los publica la fuente) → «RD$ 882.5 mil millones». */
export const pesosDeMillones = (millones: number) => formatPesos(millones * 1e6);

/** Una parte de un todo, 0–1 → «40.3 %». */
export const parte = (fraccion: number) => `${decimal(fraccion * 100, 1)} %`;
