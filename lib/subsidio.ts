import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Subsidio eléctrico — lo que el Tesoro transfiere cada año a las empresas
 * eléctricas del Estado (EDENORTE, EDESUR, EDEESTE, ETED, EGEHID y, hasta 2023,
 * la CDEEE que lo repartía), según las transferencias del capítulo 0999 en la
 * API de datos abiertos del SIGEF.
 *
 * Mecánica verificada en docs/INFRAESTRUCTURA.md §5.2; `scripts/build-subsidio.py`
 * la lee en build (≈20 s por año, más el año en curso) y deja
 * `public/data/subsidio-electrico.json`. Es lo que transfiere el Tesoro, no
 * todo el costo del sector: la interfaz lo dice.
 *
 * Módulo de servidor (`node:fs`), memoizado por instancia.
 */

export interface AnioSubsidio {
  anio: number;
  /** Último mes con devengado registrado (12 en años cerrados). */
  hastaMes: number;
  devengado: number;
  pagado: number;
  vigente: number;
  empresas: Record<string, { devengado: number; pagado: number; vigente: number }>;
}

export interface SubsidioElectrico {
  generado: string;
  fuente: string;
  anios: AnioSubsidio[];
  mensualActual: [number, number][];
}

let memo: Promise<SubsidioElectrico | null> | null = null;

export function getSubsidioElectrico(): Promise<SubsidioElectrico | null> {
  memo ??= readFile(join(process.cwd(), "public", "data", "subsidio-electrico.json"), "utf8")
    .then((t) => JSON.parse(t) as SubsidioElectrico)
    .catch((err) => {
      console.error("[subsidio]", err);
      memo = null;
      return null;
    });
  return memo;
}
