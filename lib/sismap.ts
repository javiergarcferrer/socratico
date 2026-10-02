import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { INSTITUCIONES } from "@/lib/instituciones";

/**
 * SISMAP — el ranking de gestión pública del Ministerio de Administración
 * Pública, para instituciones del Gobierno central, ayuntamientos y juntas de
 * distrito municipal.
 *
 * Mecánica verificada en docs/INFRAESTRUCTURA.md §5.10: tablas HTML servidas, tres
 * páginas. `scripts/build-sismap.py` las lee y las cruza por nombre con las
 * fichas de institución; este módulo sirve `public/data/sismap.json`. El SISMAP
 * no publica fecha de corte en esas páginas: lo que se declara es el día en que
 * se consultó (`consultado`).
 *
 * Módulo de servidor (`node:fs`), memoizado por instancia.
 */

export interface FilaSismap {
  posicion: number;
  nombre: string;
  /** Sector de gobierno; solo en la tabla de instituciones. */
  sector: string | null;
  /** Valoración 0–100. */
  valor: number;
  /** Ficha de evidencias del organismo en el SISMAP. */
  ficha: string | null;
  /** Unidad de compra de la DGCP (ficha de institución), si el nombre casa. */
  uc: number | null;
}

export type TablaSismap = "instituciones" | "ayuntamientos" | "juntas";

export const TABLAS_SISMAP: { clave: TablaSismap; nombre: string; singular: string }[] = [
  { clave: "instituciones", nombre: "Instituciones", singular: "institución del Gobierno central" },
  { clave: "ayuntamientos", nombre: "Ayuntamientos", singular: "ayuntamiento" },
  { clave: "juntas", nombre: "Juntas de distrito", singular: "junta de distrito municipal" },
];

export interface Sismap extends Record<TablaSismap, FilaSismap[]> {
  consultado: string;
  fuente: string;
}

let memo: Promise<Sismap | null> | null = null;

export function getSismap(): Promise<Sismap | null> {
  memo ??= readFile(join(process.cwd(), "public", "data", "sismap.json"), "utf8")
    .then((t) => JSON.parse(t) as Sismap)
    .catch((err) => {
      console.error("[sismap]", err);
      memo = null;
      return null;
    });
  return memo;
}

export interface SismapDeInstitucion {
  fila: FilaSismap;
  tabla: TablaSismap;
  total: number;
  consultado: string;
}

/** La fila del SISMAP de una institución, con el tamaño de su tabla. */
export async function sismapDeInstitucion(uc: number): Promise<SismapDeInstitucion | null> {
  const d = await getSismap();
  if (!d) return null;
  for (const { clave } of TABLAS_SISMAP) {
    const fila = d[clave].find((f) => f.uc === uc);
    if (fila) return { fila, tabla: clave, total: d[clave].length, consultado: d.consultado };
  }
  return null;
}

/* ------------------------------------------- gobiernos locales sin DGCP */

/** «Junta de Distrito Municipal de …», «Ayuntamiento Municipal de …»: lo que no es el lugar. */
const PREFIJO_LOCAL = /^(?:ayuntamiento|alcaldia|junta)(?: (?:del|de|municipal|distrital|distrito|municipio))*\s+/;

/** El lugar de un gobierno local, con el municipio que lo distingue: «el limon jimani». */
function lugarLocal(nombre: string): string {
  const plano = nombre
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return plano.replace(PREFIJO_LOCAL, "").trim();
}

function tablaLocal(nombre: string): TablaSismap {
  return /junta|distrital|distrito municipal/i.test(nombre.normalize("NFD").replace(/\p{M}/gu, ""))
    ? "juntas"
    : "ayuntamientos";
}

/**
 * La fila del SISMAP municipal de un gobierno local, también del que no tiene
 * unidad de compra en la DGCP. `scripts/build-sismap.py` ata cada fila a una
 * ficha por nombre, pero la instantánea es anterior a las fichas que entraron
 * por el Clasificador Institucional: si no hay fila atada a este id, se casa
 * aquí **solo lo cierto**. El lugar tiene que ser el mismo, salvo tildes, caja
 * y el prefijo genérico («Junta de Distrito Municipal de»), incluido el
 * municipio que el clasificador pone entre paréntesis y el SISMAP tras un
 * guion («El Limón (Jimaní)» es «El Limón - Jimaní»); y único a los dos lados:
 * una sola fila de la tabla con ese lugar, sin ficha ya atada, y un solo
 * gobierno local del cruce con él. Si no, nada: un puesto ajeno es peor que
 * ninguno.
 */
export async function sismapDeGobiernoLocal(id: number, nombre: string): Promise<SismapDeInstitucion | null> {
  const atada = await sismapDeInstitucion(id);
  if (atada) return atada;
  const d = await getSismap();
  if (!d) return null;
  const tabla = tablaLocal(nombre);
  const lugar = lugarLocal(nombre);
  if (!lugar) return null;
  const filas = d[tabla].filter((f) => lugarLocal(f.nombre) === lugar);
  if (filas.length !== 1 || filas[0].uc !== null) return null;
  const mismas = INSTITUCIONES.filter(
    (i) => i.sector === "local" && tablaLocal(i.nombre) === tabla && lugarLocal(i.nombre) === lugar,
  );
  if (mismas.length !== 1 || mismas[0].id !== id) return null;
  return { fila: filas[0], tabla, total: d[tabla].length, consultado: d.consultado };
}
