/**
 * El territorio: las 31 provincias y el Distrito Nacional, y lo que la
 * plataforma puede decir de cada una sin inventar.
 *
 * No es una fuente nueva: compone dos que ya se leen.
 *
 *  - **Proveedores del Estado por provincia**, del Registro de Proveedores de
 *    la DGCP (`provincia`, `municipio` de cada ficha). El registro **no se
 *    puede filtrar ni recorrer por provincia**: `provincia=` devuelve 500 con
 *    cualquier valor (verificado otra vez el 2026-09-23 con `SANTIAGO` y
 *    `Santiago`; docs/INFRAESTRUCTURA.md §5.9) y hay páginas rotas de forma
 *    permanente. La vía acotada y declarada: se toman los `TOPE_PROVEEDORES`
 *    que más adjudicaron en la ventana de contratos recientes (la misma de
 *    `/contratos` y `/proveedores`, con su caché), se consulta la ficha de
 *    cada uno por RPE —el filtro que el registro sí honra— y se agrupan por su
 *    provincia. Es una muestra de los grandes adjudicatarios recientes, nunca
 *    el padrón de la provincia, y la interfaz lo dice.
 *  - **Gobiernos locales**, del cruce `lib/instituciones.ts`. El catálogo de
 *    unidades de compra no dice en qué provincia está un ayuntamiento, así que
 *    solo se asignan los que se saben con certeza: el ayuntamiento cabecera de
 *    cada provincia y los municipios de la provincia Santo Domingo. El resto
 *    de municipios y juntas de distrito queda sin asignar, y se declara.
 *
 * Los legisladores de cada provincia los lista `/congreso/legisladores`; aquí
 * solo se enlaza con `?provincia=` y el nombre tal como lo escribe el SIL.
 */

import { unstable_cache } from "next/cache";
import { muestrearProveedores, normalize, registrosDeProveedores } from "@/lib/dgcp";

export interface Provincia {
  slug: string;
  /** Nombre como lo escribe el SIL de Diputados (`representacion.provincia`). */
  nombre: string;
  /** Municipio cabecera. */
  cabecera: string;
  /**
   * Unidades de compra (DGCP) de sus gobiernos locales que se saben de la
   * provincia: el ayuntamiento cabecera y, en Santo Domingo, sus municipios.
   */
  ayuntamientos: number[];
  /**
   * Otras grafías con que el registro de proveedores escribe la provincia.
   * Verificado el 2026-09-23 sobre 200 fichas: La Vega llega como
   * «CONCEPCIÓN DE LA VEGA» y Monte Cristi como «MONTECRISTI»; las demás son
   * nombres de la cabecera o históricos, por si aparecen.
   */
  alias?: string[];
}

/** El Distrito Nacional primero; después, las 31 provincias en orden alfabético. */
export const PROVINCIAS: Provincia[] = [
  { slug: "distrito-nacional", nombre: "Distrito Nacional", cabecera: "Santo Domingo de Guzmán", ayuntamientos: [617] },
  { slug: "azua", nombre: "Azua", cabecera: "Azua de Compostela", ayuntamientos: [662] },
  { slug: "bahoruco", nombre: "Bahoruco", cabecera: "Neiba", ayuntamientos: [1027], alias: ["BAORUCO"] },
  { slug: "barahona", nombre: "Barahona", cabecera: "Santa Cruz de Barahona", ayuntamientos: [873] },
  { slug: "dajabon", nombre: "Dajabón", cabecera: "Dajabón", ayuntamientos: [1125] },
  { slug: "duarte", nombre: "Duarte", cabecera: "San Francisco de Macorís", ayuntamientos: [867] },
  { slug: "el-seibo", nombre: "El Seibo", cabecera: "Santa Cruz de El Seibo", ayuntamientos: [1003], alias: ["SEIBO", "EL SEYBO"] },
  { slug: "elias-pina", nombre: "Elías Piña", cabecera: "Comendador", ayuntamientos: [1029] },
  { slug: "espaillat", nombre: "Espaillat", cabecera: "Moca", ayuntamientos: [732] },
  { slug: "hato-mayor", nombre: "Hato Mayor", cabecera: "Hato Mayor del Rey", ayuntamientos: [1190], alias: ["HATO MAYOR DEL REY"] },
  { slug: "hermanas-mirabal", nombre: "Hermanas Mirabal", cabecera: "Salcedo", ayuntamientos: [1023], alias: ["SALCEDO"] },
  { slug: "independencia", nombre: "Independencia", cabecera: "Jimaní", ayuntamientos: [1478] },
  { slug: "la-altagracia", nombre: "La Altagracia", cabecera: "Salvaleón de Higüey", ayuntamientos: [913] },
  { slug: "la-romana", nombre: "La Romana", cabecera: "La Romana", ayuntamientos: [996] },
  { slug: "la-vega", nombre: "La Vega", cabecera: "Concepción de La Vega", ayuntamientos: [683], alias: ["CONCEPCION DE LA VEGA"] },
  { slug: "maria-trinidad-sanchez", nombre: "María Trinidad Sánchez", cabecera: "Nagua", ayuntamientos: [1053] },
  { slug: "monsenor-nouel", nombre: "Monseñor Nouel", cabecera: "Bonao", ayuntamientos: [1010] },
  { slug: "monte-cristi", nombre: "Monte Cristi", cabecera: "San Fernando de Monte Cristi", ayuntamientos: [1479], alias: ["MONTECRISTI"] },
  { slug: "monte-plata", nombre: "Monte Plata", cabecera: "Monte Plata", ayuntamientos: [995] },
  { slug: "pedernales", nombre: "Pedernales", cabecera: "Pedernales", ayuntamientos: [] },
  { slug: "peravia", nombre: "Peravia", cabecera: "Baní", ayuntamientos: [864] },
  { slug: "puerto-plata", nombre: "Puerto Plata", cabecera: "San Felipe de Puerto Plata", ayuntamientos: [1004] },
  { slug: "samana", nombre: "Samaná", cabecera: "Santa Bárbara de Samaná", ayuntamientos: [879] },
  { slug: "san-cristobal", nombre: "San Cristóbal", cabecera: "San Cristóbal", ayuntamientos: [992] },
  { slug: "san-jose-de-ocoa", nombre: "San José de Ocoa", cabecera: "San José de Ocoa", ayuntamientos: [1137] },
  { slug: "san-juan", nombre: "San Juan", cabecera: "San Juan de la Maguana", ayuntamientos: [1016], alias: ["SAN JUAN DE LA MAGUANA"] },
  { slug: "san-pedro-de-macoris", nombre: "San Pedro de Macorís", cabecera: "San Pedro de Macorís", ayuntamientos: [682] },
  { slug: "sanchez-ramirez", nombre: "Sánchez Ramírez", cabecera: "Cotuí", ayuntamientos: [929] },
  { slug: "santiago", nombre: "Santiago", cabecera: "Santiago de los Caballeros", ayuntamientos: [731] },
  { slug: "santiago-rodriguez", nombre: "Santiago Rodríguez", cabecera: "San Ignacio de Sabaneta", ayuntamientos: [1122] },
  // Santo Domingo Este (cabecera), Norte, Oeste, Los Alcarrizos, Boca Chica,
  // San Antonio de Guerra y Pedro Brand: los siete municipios de la provincia.
  { slug: "santo-domingo", nombre: "Santo Domingo", cabecera: "Santo Domingo Este", ayuntamientos: [615, 614, 616, 721, 834, 972, 1209] },
  { slug: "valverde", nombre: "Valverde", cabecera: "Mao", ayuntamientos: [1024] },
];

const POR_SLUG = new Map(PROVINCIAS.map((p) => [p.slug, p]));

/** Clave de comparación: sin tildes, sin espacios ni signos, en mayúsculas. */
function clave(s: string): string {
  return normalize(s).replace(/[^a-z]/g, "");
}

const POR_CLAVE = new Map<string, Provincia>();
for (const p of PROVINCIAS) {
  POR_CLAVE.set(clave(p.nombre), p);
  for (const a of p.alias ?? []) POR_CLAVE.set(clave(a), p);
}

export function provinciaDeSlug(slug: string): Provincia | null {
  return POR_SLUG.get(slug) ?? null;
}

/** La provincia de un texto del registro («SAN PEDRO DE MACORIS»), o `null`. */
export function provinciaDeTexto(texto: string | null | undefined): Provincia | null {
  if (!texto) return null;
  return POR_CLAVE.get(clave(texto)) ?? null;
}

/** Enlace a los legisladores de la provincia, con el nombre como lo escribe el SIL. */
export function hrefLegisladores(p: Provincia): string {
  return `/congreso/legisladores?provincia=${encodeURIComponent(p.nombre)}`;
}

/* ----------------------------------------- proveedores de la provincia */

/** Cuántos de los mayores adjudicatarios recientes se consultan en el registro. */
export const TOPE_PROVEEDORES = 200;

export interface ProveedorLocal {
  rpe: string;
  razonSocial: string;
  municipio: string | null;
  contratos: number;
  monto: number;
  mipyme: boolean;
}

export interface ProveedoresPorProvincia {
  /** slug → proveedores de esa provincia, de mayor a menor monto. */
  porProvincia: Record<string, ProveedorLocal[]>;
  /** Proveedores consultados (los mayores de la ventana, hasta el tope). */
  consultados: number;
  /** Cuántos devolvieron ficha en el registro. */
  conFicha: number;
  /** Con ficha pero sin provincia legible (vacía, extranjera u otra grafía). */
  sinProvincia: number;
  /** Proveedores distintos con RPE en la ventana, antes del tope. */
  enVentana: number;
  contratosEscaneados: number;
  desde: string | null;
  hasta: string | null;
  /** Cuándo se armó la agrupación (`yyyy-mm-dd`). */
  calculadoEn: string;
}

async function agrupar(): Promise<ProveedoresPorProvincia | null> {
  const mercado = await muestrearProveedores().catch(() => null);
  if (!mercado || mercado.proveedores.length === 0) return null;
  const top = mercado.proveedores.slice(0, TOPE_PROVEEDORES);
  const fichas = await registrosDeProveedores(
    top.map((p) => p.rpe),
    8,
  );
  // Si el registro contestó a menos del 90 % de las consultas, no hay
  // agrupación que mostrar: una provincia vacía sería afirmar que no tiene
  // proveedores cuando lo que pasó es que el registro se cayó a medias. No se
  // cachea; la próxima visita reintenta.
  if (fichas.size < Math.ceil(top.length * 0.9)) return null;

  const porProvincia: Record<string, ProveedorLocal[]> = {};
  let sinProvincia = 0;
  for (const p of top) {
    const f = fichas.get(p.rpe);
    if (!f) continue;
    const prov = provinciaDeTexto(f.provincia);
    if (!prov) {
      sinProvincia += 1;
      continue;
    }
    (porProvincia[prov.slug] ??= []).push({
      rpe: p.rpe,
      razonSocial: f.razonSocial || p.razonSocial,
      municipio: f.municipio,
      contratos: p.contratos,
      monto: p.monto,
      mipyme: f.esMipyme,
    });
  }

  return {
    porProvincia,
    consultados: top.length,
    conFicha: fichas.size,
    sinProvincia,
    enVentana: mercado.proveedores.length,
    contratosEscaneados: mercado.escaneados,
    desde: mercado.desde,
    hasta: mercado.hasta,
    calculadoEn: new Date().toISOString().slice(0, 10),
  };
}

/*
  Doscientas fichas del registro son doscientas consultas (en tandas de ocho,
  cada una cacheada 24 h por `fetch`). Se hace una vez al día para todas las
  provincias a la vez y no una por página: es la regla de «diseña el caché
  antes que la función» de la capa lenta.
*/
const agruparCacheado = unstable_cache(
  async () => {
    const r = await agrupar();
    // Un fallo no se cachea: se lanza y la próxima visita lo reintenta.
    if (!r) throw new Error("registro o ventana de contratos sin respuesta");
    return r;
  },
  ["provincias-proveedores-v2"],
  { revalidate: 86400 },
);

export async function proveedoresPorProvincia(): Promise<ProveedoresPorProvincia | null> {
  try {
    return await agruparCacheado();
  } catch (err) {
    console.error(`[provincias] ${String(err)}`);
    return null;
  }
}
