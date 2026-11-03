/**
 * Las cinco familias en que el lienzo agrupa los dieciséis tipos de nodo del
 * grafo (`TipoNodoRdf`), cada una con su paso de la paleta `CATEGORICA`
 * (`--color-grafico-1…5`): la regla de la identidad pide a lo sumo cinco
 * colores categóricos más «otros», y el tipo exacto se **escribe** en el
 * rótulo y en la leyenda, así que el color nunca es la única lectura.
 *
 * El mapa va tipado sobre `TipoNodoRdf`: un tipo nuevo en `lib/grafo.ts` no
 * compila hasta que se le da familia y nombre aquí.
 */
import { nodoDeRuta, type TipoNodoRdf } from "@/lib/grafo";

export interface Familia {
  clave: "personas" | "organizaciones" | "normas" | "compras" | "documentos";
  etiqueta: string;
  /** El paso de `CATEGORICA` y de `--color-grafico-N` (0 → `grafico-1`). */
  paso: 0 | 1 | 2 | 3 | 4;
}

export const FAMILIAS: readonly Familia[] = [
  { clave: "personas", etiqueta: "Personas y cargos", paso: 0 },
  { clave: "organizaciones", etiqueta: "Organizaciones", paso: 1 },
  { clave: "normas", etiqueta: "Normas y justicia", paso: 2 },
  { clave: "compras", etiqueta: "Compras y obra", paso: 3 },
  { clave: "documentos", etiqueta: "Documentos y datos", paso: 4 },
];

/** El nombre corto de cada tipo, el que se escribe bajo el nombre del nodo y en la leyenda, y su plural para los anuncios. */
export const TIPO: Record<TipoNodoRdf, { etiqueta: string; plural: string; familia: Familia["clave"] }> = {
  funcionario: { etiqueta: "Persona con cargo", plural: "personas con cargo", familia: "personas" },
  institucion: { etiqueta: "Institución", plural: "instituciones", familia: "organizaciones" },
  "entidad-financiera": { etiqueta: "Entidad financiera", plural: "entidades financieras", familia: "organizaciones" },
  empresa: { etiqueta: "Persona jurídica", plural: "personas jurídicas", familia: "organizaciones" },
  proveedor: { etiqueta: "Proveedor", plural: "proveedores", familia: "organizaciones" },
  provincia: { etiqueta: "Provincia", plural: "provincias", familia: "organizaciones" },
  decreto: { etiqueta: "Decreto", plural: "decretos", familia: "normas" },
  ley: { etiqueta: "Ley", plural: "leyes", familia: "normas" },
  resolucion: { etiqueta: "Resolución", plural: "resoluciones", familia: "normas" },
  iniciativa: { etiqueta: "Iniciativa", plural: "iniciativas", familia: "normas" },
  sentencia: { etiqueta: "Sentencia", plural: "sentencias", familia: "normas" },
  votacion: { etiqueta: "Votación del pleno", plural: "votaciones del pleno", familia: "normas" },
  proceso: { etiqueta: "Proceso de compra", plural: "procesos de compra", familia: "compras" },
  obra: { etiqueta: "Obra", plural: "obras", familia: "compras" },
  documento: { etiqueta: "Documento", plural: "documentos", familia: "documentos" },
  conjunto: { etiqueta: "Conjunto de datos", plural: "conjuntos de datos", familia: "documentos" },
};

export const TIPOS = Object.keys(TIPO) as TipoNodoRdf[];

export function esTipo(t: string | null | undefined): t is TipoNodoRdf {
  return !!t && Object.hasOwn(TIPO, t);
}

/** El tipo de una ruta de ficha, o `null` si la ruta no es la de un nodo. */
export function tipoDeRuta(ruta: string): TipoNodoRdf | null {
  return nodoDeRuta(ruta)?.tipo ?? null;
}

/** La familia de un tipo; `null` (pintado como «otros») si no se sabe. */
export function familiaDe(tipo: TipoNodoRdf | null): Familia | null {
  if (!tipo) return null;
  const clave = TIPO[tipo].familia;
  return FAMILIAS.find((f) => f.clave === clave) ?? null;
}
