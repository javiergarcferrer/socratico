import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Subastas de bonos en pesos del Ministerio de Hacienda y Economía: a qué tasa
 * se endeuda el Estado en el mercado local y cuánta demanda encuentra.
 *
 * Mecánica verificada en docs/INFRAESTRUCTURA.md §5.3 (Crédito Público, 2026-09-24):
 * la Dirección General de Crédito Público publica **un consolidado por año**
 * (`/Content/subastas/consolidados/AAAA/…`), XLSX en 2026 y `.xls` viejo en
 * 2025, que se reescribe con cada subasta. `scripts/build-subastas.py` los lee
 * en build (el `.xls` pide `xlrd`) y este módulo sirve
 * `public/data/subastas.json`; la interfaz dice que es una instantánea.
 *
 * Cada subasta competitiva va seguida de su **segunda ronda no competitiva**
 * (misma tasa, demanda = oferta). Una fila con `alerta` trae algo que el
 * archivo publica mal (2026-09-08: la fecha de liquidación en la columna del
 * vencimiento); se muestra marcada, no se corrige ni se descarta.
 *
 * Módulo de servidor (`node:fs`), memoizado por instancia; `null` si falta la
 * instantánea o no se puede leer.
 */

export interface FilaSubasta {
  /** AAAA-MM-DD. */
  fecha: string;
  /** «MH1-2041». */
  instrumento: string;
  /** Monto total de la emisión, en millones de pesos. */
  emisionMillones: number | null;
  /** Cupón anual del bono, %. */
  cupon: number | null;
  vencimiento: string | null;
  /** Años hasta el vencimiento; `null` si el vencimiento del archivo es sospechoso. */
  plazoAnios: number | null;
  ronda: "competitiva" | "segunda";
  /** Pesos que Hacienda sacó a subasta. */
  subastado: number;
  /** Pesos que pidieron los inversionistas. */
  demandado: number;
  /** Pesos que Hacienda aceptó. */
  adjudicado: number;
  /** Tasa de corte (rendimiento), % anual. */
  tasaCorte: number;
  alerta: string | null;
}

export interface ArchivoSubastas {
  anio: number;
  url: string;
  publicado: string | null;
  filas: number;
  totales: { subastado: number; demandado: number; adjudicado: number } | null;
  colocado: number | null;
  restantePorColocar: number | null;
  restanteCuadra: boolean;
}

export interface Subastas {
  generado: string;
  fuente: string;
  pagina: string;
  archivos: ArchivoSubastas[];
  /** Orden cronológico. */
  subastas: FilaSubasta[];
}

let memo: Promise<Subastas | null> | null = null;

export function getSubastas(): Promise<Subastas | null> {
  memo ??= readFile(join(process.cwd(), "public", "data", "subastas.json"), "utf8")
    .then((t) => {
      const d = JSON.parse(t) as Subastas;
      return d.subastas?.length && d.archivos?.length ? d : null;
    })
    .catch((err) => {
      console.error("[subastas]", err);
      memo = null;
      return null;
    });
  return memo;
}

/** Veces que la demanda cubrió lo adjudicado; `null` si no hay adjudicado. */
export function vecesCubierta(f: Pick<FilaSubasta, "demandado" | "adjudicado">): number | null {
  return f.adjudicado > 0 ? f.demandado / f.adjudicado : null;
}
