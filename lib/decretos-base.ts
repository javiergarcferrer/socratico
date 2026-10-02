import { enlace } from "@/lib/grafo";
import type { Decreto } from "@/lib/decretos";

/**
 * Lo de un decreto que no lee el registro: dónde está su PDF, adónde lleva y
 * qué quiere decir su aviso. Aparte de `lib/decretos.ts` para que quien solo
 * necesita esto —el servidor MCP, el grafo— no lleve en su función el
 * registro entero (~13 MB), que el trazado de archivos mete con cualquier
 * importación de aquel módulo.
 */

export const CONSULTORIA_PDF = "https://www.consultoria.gov.do/api/document/";

/**
 * `fuera`: la fecha cae fuera de los períodos de firma de su firmante (error
 * de captura probable). `fecha`: la fecha no casa con el año del número.
 */
export type AvisoDecreto = "fuera" | "fecha";

/** Cada aviso en llano: lo dicen igual la lista de decretos firmados y el servidor MCP (`lib/mcp.ts`). */
export const AVISO_DECRETO: Record<AvisoDecreto, { etiqueta: string; llano: string }> = {
  fuera: {
    etiqueta: "Fecha fuera de su período",
    llano:
      "El registro lo atribuye a esta firma, pero su fecha cae fuera de sus períodos de firma: es un error de captura probable del origen.",
  },
  fecha: {
    etiqueta: "Fecha dudosa",
    llano: "La fecha que da el origen no casa con el año de su número.",
  },
};

/** Adónde lleva un decreto: su ficha si la tiene, si no su PDF en la Consultoría. */
export function hrefDecreto(d: Pick<Decreto, "numero" | "ficha" | "docId">): string | null {
  if (d.ficha && d.numero) {
    const ficha = enlace.norma("decreto", d.numero);
    if (ficha) return ficha;
  }
  return d.docId != null ? `${CONSULTORIA_PDF}${d.docId}` : null;
}
