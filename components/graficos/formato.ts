import { formatMagnitud, formatPesos } from "@/lib/format";

/**
 * Cómo se escribe un valor en el mobiliario de un gráfico (la marca de la
 * escala, la etiqueta directa del último punto). Es un nombre y no una
 * función para que un gráfico de servidor pueda recibirlo desde una página
 * y pasarlo a su capa de cliente sin serializar código.
 *
 * Todo sale de `lib/format.ts`: la magnitud viaja en palabras, nunca «MM» ni
 * «K» (docs/INFRAESTRUCTURA.md §11).
 */
export type FormatoValor = "entero" | "pesos" | "usd-millones" | "porciento" | "decimal";

const entero = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 0 });
const dosDecimales = new Intl.NumberFormat("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatearValor(valor: number, formato: FormatoValor = "entero"): string {
  switch (formato) {
    case "pesos":
      return formatPesos(valor);
    case "usd-millones":
      return formatMagnitud(valor);
    case "porciento":
      return `${dosDecimales.format(valor)} %`;
    case "decimal":
      return dosDecimales.format(valor);
    default:
      return entero.format(Math.round(valor));
  }
}
