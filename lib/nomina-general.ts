import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { MESES } from "@/lib/format";

/**
 * Nómina Pública General del Estado — la que publica el Ministerio de
 * Administración Pública (MAP) con todas las instituciones que reportan a su
 * sistema de gestión de recursos humanos, Educación y Salud incluidas.
 *
 * Mecánica verificada en docs/INFRAESTRUCTURA.md §5.8: un CSV mensual de ~62 MB en
 * `map.gob.do/datosabiertos/…/csv?year=&month=`. `scripts/build-nomina-general.py`
 * lo agrega en build **sin guardar nombres ni género** y deja
 * `public/data/nomina-general.json` (~1 MB): por institución, sus cifras y sus
 * cargos; y los cargos mejor pagados del Estado.
 *
 * Complementa la foto de `/nomina` (lib/nomina.ts), que sí trae el área pero
 * solo de las instituciones que publican su propio CSV. Esta no trae área y
 * es un solo mes. Se sirve desde el servidor: el navegador recibe solo lo que
 * la página pinta, nunca el archivo.
 *
 * Módulo de servidor (`node:fs`), memoizado por instancia.
 */

/** [cargo, plazas, masa, mediana, mínimo, máximo] */
export type CargoGeneral = [string, number, number, number, number, number];

export interface InstitucionGeneral {
  nombre: string;
  /** Unidad de compra de su ficha, si el nombre casa exacto. */
  uc: number | null;
  plazas: number;
  masa: number;
  mediana: number;
  p90: number;
  maximo: number;
  estatus: Record<string, number>;
  /** [plazas, masa] del mes anterior, si la institución estaba. */
  anterior: [number, number] | null;
  cargos: CargoGeneral[];
}

export interface NominaGeneral {
  generado: string;
  anio: number;
  mes: number;
  fuente: string;
  anterior: { anio: number; mes: number; plazas: number; masa: number } | null;
  plazas: number;
  masa: number;
  mediana: number;
  estatus: Record<string, number>;
  mejorPagados: { sueldo: number; institucion: string; cargo: string; plazas: number; uc: number | null }[];
  instituciones: InstitucionGeneral[];
}

let memo: Promise<NominaGeneral | null> | null = null;

export function getNominaGeneral(): Promise<NominaGeneral | null> {
  memo ??= readFile(join(process.cwd(), "public", "data", "nomina-general.json"), "utf8")
    .then((t) => JSON.parse(t) as NominaGeneral)
    .catch((err) => {
      console.error("[nomina-general]", err);
      memo = null;
      return null;
    });
  return memo;
}


export function mesGeneral(anio: number, mes: number): string {
  return `${MESES[mes - 1]} de ${anio}`;
}

/** Clave de URL de una institución: su nombre sin tildes ni signos. */
export function claveInstitucion(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** La institución de la nómina general atada a una ficha, con el mes. */
export async function nominaGeneralDeInstitucion(
  uc: number,
): Promise<{ inst: InstitucionGeneral; anio: number; mes: number } | null> {
  const d = await getNominaGeneral();
  const inst = d?.instituciones.find((i) => i.uc === uc);
  return d && inst ? { inst, anio: d.anio, mes: d.mes } : null;
}
