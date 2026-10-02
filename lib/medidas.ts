import type { Tono } from "@/lib/estados";

/**
 * Los tipos de medida de la DGCP sobre un proveedor: la lista cerrada, en
 * llano, con su tono y su familia. Aparte de `lib/sanciones.ts` para que la
 * ontología —y con ella el servidor MCP— no lleve `sanciones.json` en su
 * función, que el trazado de archivos mete con cualquier importación de aquel
 * módulo.
 */

export type TipoMedida =
  | "inhabilitacion-permanente"
  | "inhabilitacion-temporal"
  | "inhabilitacion"
  | "incumplimiento"
  | "prohibicion"
  | "penal"
  | "vinculo"
  | "condena"
  | "suspension"
  | "cancelacion"
  | "suspension-solicitud"
  | "cancelacion-solicitud"
  | "correccion"
  | "levantamiento"
  | "otro";

/** Tres familias, por la pregunta que se hace el lector: ¿es una sanción? */
export type GrupoMedida = "sancion" | "oficio" | "otras";

export interface DefinicionTipo {
  /** Lo que se lee en la marca. */
  etiqueta: string;
  /** Qué significa, en llano, y qué no significa. */
  llano: string;
  /** Su oficio de color (`lib/estados.ts`): la fuente traduce, no pinta. */
  tono: Tono;
  grupo: GrupoMedida;
}

/**
 * La lista cerrada. El orden es el de los filtros: de lo más grave a lo que
 * no dice nada del proveedor. Los tonos siguen la regla de la casa: lo que
 * pidió el propio proveedor es `contexto`, una suspensión es `aviso`, una
 * cancelación o una inhabilitación es `anulado`.
 */
export const TIPOS_MEDIDA: Record<TipoMedida, DefinicionTipo> = {
  "inhabilitacion-permanente": {
    etiqueta: "Inhabilitación permanente",
    llano:
      "Sanción de la DGCP por resolución: el proveedor no puede volver a venderle al Estado.",
    tono: "anulado",
    grupo: "sancion",
  },
  "inhabilitacion-temporal": {
    etiqueta: "Inhabilitación temporal",
    llano:
      "Sanción de la DGCP por resolución, por un plazo (casi siempre un año): mientras dura, el proveedor no puede venderle al Estado.",
    tono: "anulado",
    grupo: "sancion",
  },
  inhabilitacion: {
    etiqueta: "Inhabilitación sin plazo escrito",
    llano:
      "La DGCP lo inhabilitó y el texto no dice si es para siempre o por un plazo. La fecha de habilitación, si la hay, es la que registró la DGCP.",
    tono: "anulado",
    grupo: "sancion",
  },
  incumplimiento: {
    etiqueta: "Incumplimiento de contrato",
    llano:
      "Una institución reportó un incumplimiento, una rescisión de contrato o una advertencia escrita. El texto no dice que la DGCP lo haya inhabilitado.",
    tono: "aviso",
    grupo: "sancion",
  },
  prohibicion: {
    etiqueta: "Prohibición por cargo público",
    llano:
      "La ley no deja venderle al Estado a ciertos funcionarios ni a las empresas en que participan. La DGCP suspende el registro mientras dure la situación. No es una sanción.",
    tono: "aviso",
    grupo: "oficio",
  },
  penal: {
    etiqueta: "Suspensión por proceso penal",
    llano:
      "Suspensión preventiva que aplica una resolución de la DGCP sobre proveedores investigados, procesados o condenados por delitos contra la Administración Pública. La suspensión no es, por sí sola, una condena: el texto dice a quién alcanza.",
    tono: "aviso",
    grupo: "oficio",
  },
  vinculo: {
    etiqueta: "Suspensión por posible vínculo",
    llano:
      "Suspensión preventiva por un posible vínculo con proveedores suspendidos por estar investigados. El texto no dice que esta empresa esté investigada.",
    tono: "aviso",
    grupo: "oficio",
  },
  condena: {
    etiqueta: "Cancelación por condena penal",
    llano:
      "La DGCP canceló el registro al aplicar una resolución sobre proveedores condenados por delitos contra la Administración Pública.",
    tono: "anulado",
    grupo: "oficio",
  },
  suspension: {
    etiqueta: "Suspensión de oficio",
    llano:
      "La DGCP suspendió el registro por su cuenta por otro motivo, por ejemplo porque no localizó al proveedor.",
    tono: "aviso",
    grupo: "oficio",
  },
  cancelacion: {
    etiqueta: "Cancelación de oficio",
    llano:
      "La DGCP canceló el registro por su cuenta y el texto no habla de una sanción. Muchas son bajas de instituciones públicas que estaban inscritas como proveedoras.",
    tono: "anulado",
    grupo: "oficio",
  },
  "suspension-solicitud": {
    etiqueta: "Suspensión a solicitud del proveedor",
    llano: "El propio proveedor pidió suspender su registro. No es una sanción.",
    tono: "contexto",
    grupo: "otras",
  },
  "cancelacion-solicitud": {
    etiqueta: "Cancelación a solicitud del proveedor",
    llano: "El propio proveedor pidió darse de baja del registro. No es una sanción.",
    tono: "contexto",
    grupo: "otras",
  },
  correccion: {
    etiqueta: "Corrección del registro",
    llano:
      "Baja por un error de inscripción: un registro duplicado, un documento equivocado, una fusión. No dice nada del proveedor.",
    tono: "contexto",
    grupo: "otras",
  },
  levantamiento: {
    etiqueta: "Levantamiento o aclaración",
    llano:
      "El texto levanta una medida anterior o aclara que al proveedor no le aplica la prohibición.",
    tono: "contexto",
    grupo: "otras",
  },
  otro: {
    etiqueta: "Otro motivo",
    llano: "El texto no encaja en ninguno de los tipos: léelo entero.",
    tono: "contexto",
    grupo: "otras",
  },
};

export const ORDEN_TIPOS = Object.keys(TIPOS_MEDIDA) as TipoMedida[];

export const GRUPOS_MEDIDA: Record<GrupoMedida, { etiqueta: string; llano: string }> = {
  sancion: {
    etiqueta: "Sanciones",
    llano: "Inhabilitaciones por resolución e incumplimientos que reportó una institución.",
  },
  oficio: {
    etiqueta: "De oficio",
    llano:
      "Lo que la DGCP decidió por su cuenta sin que sea una sanción: prohibiciones por cargo público, suspensiones preventivas, bajas.",
  },
  otras: {
    etiqueta: "A pedido y otras",
    llano: "Lo que pidió el propio proveedor, correcciones del registro y levantamientos.",
  },
};

export const ORDEN_GRUPOS = Object.keys(GRUPOS_MEDIDA) as GrupoMedida[];

export function esTipoMedida(v: string | null | undefined): v is TipoMedida {
  return Boolean(v) && Object.hasOwn(TIPOS_MEDIDA, v!);
}

export function esGrupoMedida(v: string | null | undefined): v is GrupoMedida {
  return Boolean(v) && Object.hasOwn(GRUPOS_MEDIDA, v!);
}
