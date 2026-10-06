/**
 * Los grupos temáticos de datos.gob.do, como los da su catálogo
 * (`public/data/catalogo.json`): una sola definición para el esquema SKOS de
 * la ontología (`do:temasDeDatos`) y los constructores del grafo, que traducen
 * el literal del portal a su concepto y fallan si llega uno que la lista no
 * tiene: un grupo nuevo del portal se añade aquí, no se cuela
 * (docs/INFRAESTRUCTURA.md §7).
 *
 * Módulo puro: ni `fs` ni red.
 */

/** Un concepto: su clave (la parte local de su IRI sin `datos-`), el literal del portal y cómo se dice. */
export interface GrupoDeDatos {
  clave: string;
  portal: string;
  nombre: string;
}

/** Los grupos del portal, del más usado al menos. */
export const GRUPOS_DE_DATOS: readonly GrupoDeDatos[] = [
  { clave: "gestion-publica", portal: "Gestión Pública", nombre: "Gestión pública" },
  { clave: "sociedad-y-bienestar", portal: "Sociedad y bienestar", nombre: "Sociedad y bienestar" },
  { clave: "economia", portal: "Economía", nombre: "Economía" },
  { clave: "salud", portal: "Salud", nombre: "Salud" },
  { clave: "educacion", portal: "Educación", nombre: "Educación" },
  { clave: "urbanismo", portal: "Urbanismo", nombre: "Urbanismo" },
  { clave: "medio-ambiente", portal: "Medio Ambiente", nombre: "Medio ambiente" },
  { clave: "ciencia-y-tecnologia", portal: "Ciencia y tecnología", nombre: "Ciencia y tecnología" },
  { clave: "pida", portal: "PIDA", nombre: "PIDA" },
  { clave: "legislacion", portal: "Legislación", nombre: "Legislación" },
  { clave: "electoral", portal: "Electoral", nombre: "Electoral" },
];

const PORTAL = new Map(GRUPOS_DE_DATOS.map((g) => [g.portal, g.clave]));

/** La clave del concepto de un grupo del portal, o `null` si la lista no lo tiene. */
export const claveGrupoDeDatos = (portal: string) => PORTAL.get(portal.trim()) ?? null;
