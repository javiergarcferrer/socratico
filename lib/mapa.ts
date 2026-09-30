import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * El mapa del país: las 31 provincias y el Distrito Nacional como trazados SVG.
 *
 * Fuente: los límites administrativos oficiales de la Oficina Nacional de
 * Estadística (ONE), publicados en el HDX de la ONU como COD-AB `cod-ab-dom`,
 * CC BY-IGO (docs/AUDITORIA.md §G.16). `scripts/build-mapa.py` los proyecta y
 * simplifica a `public/data/mapa.json` (~40 KB); esto solo lee esa instantánea.
 * Sin servidor de teselas, sin clave y sin librería: el mapa es un SVG que se
 * pinta en el servidor, y cada provincia es un enlace.
 *
 * Las provincias vienen con el slug de `lib/provincias.ts` —la ONE escribe
 * «Baoruco», la plataforma `bahoruco`—, así que el mapa y las fichas hablan
 * del mismo nodo del grafo (`enlace.provincia`).
 *
 * Módulo de servidor (`node:fs`): un componente de cliente recibe el `GeoMapa`
 * ya leído, nunca lo importa.
 */

export interface ZonaGeo {
  slug: string;
  /** Código de la ONE (`DO0801`). */
  pcode: string;
  nombre: string;
  /** Trazado en coordenadas del `viewBox`; puede traer islas y huecos (evenodd). */
  d: string;
  /** Centro que declara la ONE, en coordenadas del `viewBox`. */
  centro: [number, number];
  km2: number;
}

export interface GeoMapa {
  generado: string;
  fuente: string;
  autor: string;
  licencia: string;
  vigente: string;
  viewBox: [number, number, number, number];
  provincias: ZonaGeo[];
}

export const FUENTE_MAPA = "https://data.humdata.org/dataset/cod-ab-dom";

let geo: Promise<GeoMapa | null> | null = null;

/* La ruta va entera, sin variable: el trazado de archivos de Next la lee (ver `lib/obras.ts`). */
export function getMapa(): Promise<GeoMapa | null> {
  geo ??= readFile(join(process.cwd(), "public", "data", "mapa.json"), "utf8")
    .then((t) => JSON.parse(t) as GeoMapa)
    .catch((err) => {
      console.error("[mapa] mapa.json:", err);
      geo = null; // un fallo no se queda pegado en la instancia
      return null;
    });
  return geo;
}
