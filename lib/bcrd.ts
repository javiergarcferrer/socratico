import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { MESES, MESES_CORTOS } from "@/lib/format";

/**
 * Inflación (IPC) y llegadas de pasajeros por vía aérea, del Banco Central.
 *
 * Mecánica verificada en docs/INFRAESTRUCTURA.md §5.4 (2026-09-24): los dos archivos
 * del CDN del BCRD están en el Excel viejo (BIFF, `.xls`), que el lector de
 * XLSX de `lib/deuda.ts` no abre. `scripts/build-bcrd.py` los lee en build y
 * este módulo sirve `public/data/bcrd.json`; la interfaz dice que es una
 * instantánea y su corte.
 *
 *   precios/documents/ipc_base_2019-2020.xls — IPC nacional, serie empalmada
 *   desde 1984, base oct-2019–sep-2020 = 100.
 *   sector-turismo/documents/lleg_total.xls — llegadas por vía aérea desde
 *   1978; el total es un conteo, el reparto residentes / no residentes es una
 *   estimación del BCRD (trae decimales). «*» = cifras sujetas a rectificación.
 *
 * Módulo de servidor (`node:fs`), memoizado por instancia; `null` si falta la
 * instantánea o no se puede leer.
 */

/** [periodo AAAA-MM, índice, variación interanual %, variación mensual %]. */
export type MesIpc = [string, number, number, number];

export interface MesLlegadas {
  periodo: string;
  total: number;
  noResidentes: number | null;
  residentes: number | null;
  /** El total del mes trae decimales: el BCRD lo estimó. */
  estimado: boolean;
  /** Año marcado «*»: cifras sujetas a rectificación. */
  preliminar: boolean;
}

export interface Bcrd {
  generado: string;
  ipc: {
    serie: MesIpc[];
    ultimo: MesIpc;
    base: string;
    nota: string | null;
    fuente: string;
    corte: string;
  };
  turismo: {
    serie: MesLlegadas[];
    acumulado: {
      anio: number;
      hastaMes: number;
      valor: number | null;
      anterior: number | null;
      variacion: number | null;
    };
    repartoEstimado: boolean;
    alcance: string;
    fuente: string;
    corte: string;
  };
}

let memo: Promise<Bcrd | null> | null = null;

export function getBcrd(): Promise<Bcrd | null> {
  memo ??= readFile(join(process.cwd(), "public", "data", "bcrd.json"), "utf8")
    .then((t) => {
      const d = JSON.parse(t) as Bcrd;
      return d.ipc?.serie?.length && d.turismo?.serie?.length ? d : null;
    })
    .catch((err) => {
      console.error("[bcrd]", err);
      memo = null;
      return null;
    });
  return memo;
}


/** «2026-08» → «agosto 2026». */
export function mesEnPalabras(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number);
  return `${MESES[m - 1]} ${a}`;
}

/** «2026-08» → «ago-26». */
export function mesCorto(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number);
  return `${MESES_CORTOS[m - 1]}-${String(a).slice(2)}`;
}

/** El mismo mes un año antes: «2026-08» → «2025-08». */
export function mismoMesAnterior(periodo: string): string {
  return `${Number(periodo.slice(0, 4)) - 1}${periodo.slice(4)}`;
}
