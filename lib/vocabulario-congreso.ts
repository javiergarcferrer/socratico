/**
 * Los vocabularios cerrados de una iniciativa del Congreso, como los publica
 * el SIL de la Cámara de Diputados (`public/data/congreso.json`): su tipo, su
 * condición y su tema. Una sola definición para los esquemas SKOS de la
 * ontología (`do:tiposDeIniciativa`, `do:condicionesLegislativas`,
 * `do:temasLegislativos`) y los constructores del grafo, que traducen el
 * literal del SIL a su concepto y fallan si llega uno que la lista no tiene:
 * un valor nuevo de la fuente se añade aquí, no se cuela
 * (docs/INFRAESTRUCTURA.md §7).
 *
 * Módulo puro: ni `fs` ni red.
 */

/** Un concepto: su clave (la parte local de su IRI), el literal del SIL y cómo se dice. */
export interface ConceptoSil {
  clave: string;
  sil: string;
  nombre: string;
}

/** Lo que es la pieza. */
export const TIPOS_INICIATIVA: readonly ConceptoSil[] = [
  { clave: "proyecto-de-ley", sil: "Proyecto de Ley", nombre: "Proyecto de ley" },
  { clave: "resolucion-interna", sil: "Resolución Interna", nombre: "Resolución de una cámara" },
  { clave: "resolucion-bicameral", sil: "Resolución Bicameral", nombre: "Resolución de las dos cámaras" },
];

/** Dónde estaba la pieza el día del corte: la condición gruesa del SIL, no el último trámite. */
export const CONDICIONES_LEGISLATIVAS: readonly ConceptoSil[] = [
  { clave: "depositada", sil: "DEPOSITADO", nombre: "Depositada" },
  { clave: "en-tramite", sil: "VIGENTE", nombre: "En trámite" },
  { clave: "aprobada", sil: "APROBADO", nombre: "Aprobada" },
  { clave: "retirada", sil: "RETIRADO", nombre: "Retirada" },
  { clave: "perimida", sil: "PERIMIDO", nombre: "Perimida" },
  { clave: "fusionada", sil: "FUSIONADO", nombre: "Fusionada con otra" },
  { clave: "observada", sil: "OBSERVADO POR EL PODER EJECUTIVO", nombre: "Observada por el Poder Ejecutivo" },
];

/** El grupo temático que el SIL le da, con su nombre tal cual. */
export const TEMAS_LEGISLATIVOS: readonly ConceptoSil[] = [
  { clave: "agricultura", sil: "Agricultura", nombre: "Agricultura" },
  { clave: "seguridad-social", sil: "Seguridad Social", nombre: "Seguridad social" },
  { clave: "educacion-cultura-deporte", sil: "Educación / Cultura / Deporte", nombre: "Educación, cultura y deporte" },
  { clave: "administracion-municipalidad", sil: "Administración / Municipalidad", nombre: "Administración y municipios" },
  { clave: "seguridad-nacional", sil: "Seguridad Nacional", nombre: "Seguridad nacional" },
  { clave: "economia", sil: "Economía", nombre: "Economía" },
  { clave: "internacionales", sil: "Internacionales", nombre: "Asuntos internacionales" },
  { clave: "genero-familia", sil: "Género / Familia", nombre: "Género y familia" },
  { clave: "desarrollo-humano", sil: "Desarrollo Humano", nombre: "Desarrollo humano" },
  { clave: "justicia", sil: "Justicia", nombre: "Justicia" },
  { clave: "modernizacion-tecnologia", sil: "Modernización / Tecnología / Medios Comunicación", nombre: "Modernización, tecnología y medios" },
  { clave: "medio-ambiente", sil: "Medio Ambiente", nombre: "Medio ambiente" },
  { clave: "industria-comercio", sil: "Industria y Comercio", nombre: "Industria y comercio" },
  { clave: "fiscalizacion-control", sil: "Fiscalización / Control", nombre: "Fiscalización y control" },
  { clave: "electoral", sil: "Electoral", nombre: "Electoral" },
];

const porSil = (lista: readonly ConceptoSil[]) => new Map(lista.map((c) => [c.sil, c.clave]));
const TIPO = porSil(TIPOS_INICIATIVA);
const CONDICION = porSil(CONDICIONES_LEGISLATIVAS);
const TEMA = porSil(TEMAS_LEGISLATIVOS);

/** La clave del concepto de cada literal del SIL, o `null` si la lista no lo tiene. */
export const claveTipoIniciativa = (sil: string) => TIPO.get(sil.trim()) ?? null;
export const claveCondicion = (sil: string) => CONDICION.get(sil.trim()) ?? null;
export const claveTema = (sil: string) => TEMA.get(sil.trim()) ?? null;
