import { plano } from "@/lib/raiz";

/**
 * Los vocabularios cerrados de la compra y la inversión públicas: la
 * modalidad, la etapa y el objeto de un proceso de la DGCP, y el sector de un
 * proyecto del SNIP. Una sola definición para `procurement` del servidor MCP,
 * la tabla de procesos (`lib/tablas-compras.ts`), los esquemas SKOS de la
 * ontología (`do:modalidades`, `do:etapas`, `soc:objetosDeCompra`,
 * `do:sectoresDeInversion`) y los constructores del grafo, que traducen el
 * literal de la fuente a su concepto y fallan si llega uno que la lista no
 * tiene: un valor nuevo de la fuente se añade aquí, no se cuela
 * (docs/INFRAESTRUCTURA.md §7).
 *
 * Módulo puro: ni `fs` ni red.
 */

/** Las etapas de un proceso, dichas cortas: las mismas palabras en `search`, `procurement` y el grafo. */
export const ETAPAS = {
  abierto: "Abierto a ofertas",
  cerrado: "Recepción cerrada",
  evaluacion: "En evaluación",
  adjudicado: "Adjudicado",
  desierto: "Desierto",
  cancelado: "Cancelado",
  suspendido: "Suspendido",
} as const;

export type ClaveEtapa = keyof typeof ETAPAS;

/** La etapa de cada literal de la DGCP (`estados` de `public/data/procesos.json`). Dos literales son la misma etapa. */
export const ETAPA_DE_LA_DGCP: Readonly<Record<string, ClaveEtapa>> = {
  "Proceso publicado": "abierto",
  "Proceso con etapa cerrada": "cerrado",
  "Sobres estan abriendose": "evaluacion",
  "Sobres abiertos o aperturados": "evaluacion",
  "Proceso adjudicado y celebrado": "adjudicado",
  "Proceso desierto": "desierto",
  Cancelado: "cancelado",
  Suspendido: "suspendido",
};

/** Las modalidades de la Ley 340-06, dichas como el índice: el literal de la DGCP, dos más cortas. */
export const MODALIDADES = {
  lpn: "Licitación Pública Nacional",
  lpi: "Licitación Pública Internacional",
  lpa: "Licitación Pública Abreviada",
  restringida: "Licitación Restringida",
  comparacion: "Comparación de Precios",
  subasta: "Subasta Inversa",
  sorteo: "Sorteo de Obras",
  menor: "Contratación Menor",
  umbral: "Compra menor al umbral",
  excepcion: "Excepción",
} as const;

export type ClaveModalidad = keyof typeof MODALIDADES;

/** La modalidad de cada literal de la DGCP (`modalidades` de `public/data/procesos.json`). */
export const MODALIDAD_DE_LA_DGCP: Readonly<Record<string, ClaveModalidad>> = {
  "Licitación Pública Nacional": "lpn",
  "Licitación Pública Internacional": "lpi",
  "Licitación Pública Abreviada": "lpa",
  "Licitación Restringida": "restringida",
  "Comparación de Precios": "comparacion",
  "Subasta Inversa": "subasta",
  "Sorteo de Obras": "sorteo",
  "Contratación Menor": "menor",
  "Compras por Debajo del Umbral": "umbral",
  "Procesos de Excepción": "excepcion",
};

/** Lo que se compra: la naturaleza del contrato (en ePO, «contract nature»). */
export const OBJETOS = { bienes: "Bienes", obras: "Obras", servicios: "Servicios" } as const;

export type ClaveObjeto = keyof typeof OBJETOS;

/** El objeto de cada literal de la DGCP (`objetos` de `public/data/procesos.json`). */
export const OBJETO_DE_LA_DGCP: Readonly<Record<string, ClaveObjeto>> = { Bienes: "bienes", Obras: "obras", Servicios: "servicios" };

/**
 * Los sectores de un proyecto de inversión en el SNIP, como los publica
 * MapaInversiones (la clasificación funcional del gasto), con su tilde.
 */
export const SECTORES_INVERSION: readonly { clave: string; nombre: string }[] = [
  { clave: "educacion", nombre: "Educación" },
  { clave: "vivienda", nombre: "Vivienda y servicios comunitarios" },
  { clave: "transporte", nombre: "Transporte" },
  { clave: "deporte-y-cultura", nombre: "Actividades deportivas, recreativas, culturales y religiosas" },
  { clave: "salud", nombre: "Salud" },
  { clave: "cambio-climatico", nombre: "Cambio Climático" },
  { clave: "aire-agua-y-suelo", nombre: "Protección del aire, agua y suelo" },
  { clave: "justicia-y-seguridad", nombre: "Justicia, orden público y seguridad" },
  { clave: "defensa", nombre: "Defensa nacional" },
  { clave: "otros-servicios-economicos", nombre: "Otros servicios económicos" },
  { clave: "administracion-general", nombre: "Administración general" },
  { clave: "riego", nombre: "Riego" },
  { clave: "biodiversidad-y-desechos", nombre: "Protección de la biodiversidad y ordenación de desechos" },
  { clave: "agropecuaria", nombre: "Agropecuaria, caza, pesca y silvicultura" },
  { clave: "proteccion-social", nombre: "Protección social" },
  { clave: "energia", nombre: "Energía y combustible" },
  { clave: "asuntos-economicos", nombre: "Asuntos económicos, comerciales y laborales" },
  { clave: "mineria-y-manufactura", nombre: "Minería, manufactura y construcción" },
  { clave: "comunicaciones", nombre: "Comunicaciones" },
];

let sectorPorTexto: Map<string, string> | null = null;

/** La clave del sector de un proyecto, del texto de la fuente (con o sin tildes), o `null` si la lista no lo tiene. */
export function claveSectorInversion(texto: string): string | null {
  sectorPorTexto ??= new Map(SECTORES_INVERSION.map((s) => [plano(s.nombre), s.clave]));
  return sectorPorTexto.get(plano(texto)) ?? null;
}
