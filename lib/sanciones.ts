import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Tono } from "@/lib/estados";
import { agujas, contieneTodas, plano } from "@/lib/raiz";

/**
 * Medidas sobre proveedores del Estado — suspensiones, cancelaciones e
 * inhabilitaciones que registra la DGCP — y las entidades de la lista SDN de
 * la OFAC ligadas a la República Dominicana.
 *
 * Mecánica verificada en el reconocimiento del 2026-09-29 (docs/AUDITORIA.md
 * §A.3, §A.12 y §G.1 para la sección «Tablas» de la DGCP):
 *
 *  - ✅ `…/api-dgcp/v1/tablas/proveedores?Type=csv&inhabilitados=true` →
 *    200 `text/csv`, `ProveedoresInhabilitados.csv`, ~0.9 MB: **una fila por
 *    medida** (2,317 sobre 1,734 RPE, de 2010 a 2026). No trae el tipo de
 *    medida: `scripts/build-sanciones.py` lo lee del texto del motivo con
 *    reglas escritas a mano, en la lista cerrada de `TIPOS_MEDIDA`.
 *  - ✅ La misma tabla con `inhabilitados=false` (80 MB, el registro entero,
 *    que **no** excluye a los inhabilitados) da la razón social, el documento,
 *    el tipo de persona y el estado actual de cada RPE: el cruce es del 100 %.
 *  - ✅ La lista SDN de la OFAC (`SDN.CSV` y `ADD.CSV`, 302 a S3), sin clave.
 *
 * Tres posturas que la interfaz declara donde tocan:
 *
 *  1. **Solo personas jurídicas.** Las medidas sobre personas físicas no están
 *     en la instantánea (ni nombre ni cédula), solo su número en los
 *     metadatos: publicarlas es decisión pendiente del dueño. En los motivos
 *     publicados, el nombre y el documento de quien firma una solicitud van
 *     sustituidos por «[nombre omitido]» y «[documento omitido]».
 *  2. **La lista mezcla cosas muy distintas**: sanciones, suspensiones
 *     preventivas, prohibiciones por cargo público, bajas que pidió el propio
 *     proveedor y correcciones del registro. El tipo es una lectura del texto
 *     del Estado, y el texto va siempre entero al lado.
 *  3. **De la OFAC, solo entidades**, nunca personas. Es una lista extranjera.
 *
 * Una instantánea tiene fecha de corte: que un proveedor no tenga medidas aquí
 * no certifica nada. Módulo de servidor (`node:fs`), memoizado por instancia.
 */

/* ----------------------------------------------------- el tipo de medida */

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

/**
 * El estado actual del RPE, traducido a los oficios de `lib/estados.ts`. La
 * tabla usa seis: Activo, Desactualizado, Inactivo, Suspendido, Cancelado e
 * Inhabilitado.
 */
export function tonoEstadoRpe(estado: string | null | undefined): Tono {
  const e = (estado ?? "").toLowerCase();
  if (e.startsWith("suspend")) return "aviso";
  if (e.startsWith("cancel") || e.startsWith("inhabil")) return "anulado";
  return "contexto";
}

/** El día de hoy en Santo Domingo (ISO), la regla de `formatFecha`. */
const DIA_RD = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santo_Domingo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * ¿Es la fecha posterior a hoy? Una `FECHA_HABILITACION` futura es un plazo
 * que la DGCP dejó escrito, no una habilitación que ya ocurrió; algunas son
 * fechas lejanísimas (2044, 2055) que el origen no explica.
 */
export function esFutura(iso: string | null | undefined): boolean {
  return Boolean(iso) && iso!.slice(0, 10) > DIA_RD.format(Date.now());
}

/* ------------------------------------------------------------ la OFAC */

/**
 * Los programas de sanciones de la OFAC que aparecen en el extracto, en
 * llano. Uno que no esté aquí se muestra con su código.
 */
export const PROGRAMAS_OFAC: Record<string, string> = {
  SDNTK: "narcotraficantes extranjeros (Ley Kingpin)",
  GLOMAG: "corrupción o violaciones graves de derechos humanos (Ley Global Magnitsky)",
  "ILLICIT-DRUGS-EO14059": "tráfico ilícito de drogas (Orden Ejecutiva 14059)",
  "VENEZUELA-EO13850": "sanciones relativas a Venezuela (Orden Ejecutiva 13850)",
  SDGT: "terrorismo global",
};

export function programaEnLlano(codigo: string): string {
  return PROGRAMAS_OFAC[codigo] ?? codigo;
}

/** La ficha oficial de una entrada de la lista, en el buscador de la OFAC. */
export function hrefFichaOfac(ent: number): string {
  return `https://sanctionssearch.ofac.treas.gov/Details.aspx?id=${ent}`;
}

/* ------------------------------------------------------------ los datos */

export interface MedidaDgcp {
  /** Cuándo entró en vigor (`FECHA_INHABILITACION`), ISO. */
  fecha: string;
  tipo: TipoMedida;
  /** El texto de la DGCP, entero (solo sin los datos de quien firma). */
  motivo: string;
  /** `OFICIO_INHABILITACION` tal cual: una resolución, un oficio o una nota. */
  resolucion: string | null;
  /** `FECHA_FIRMA_RESOLUCION`, ISO. */
  fechaResolucion: string | null;
  /** `FECHA_HABILITACION`, ISO: cuándo vuelve (o volvió) a estar habilitado. */
  hasta: string | null;
  /** `hasta` era futura el día que se generó la instantánea. */
  programada: boolean;
}

export interface ProveedorConMedidas {
  rpe: string;
  razonSocial: string;
  /** Nueve cifras, o `null` (proveedor extranjero). */
  rnc: string | null;
  /** El estado del RPE en la tabla: Suspendido, Cancelado, Activo… */
  estadoRpe: string | null;
  /** La constancia del registro que enlaza la propia tabla de la DGCP. */
  certificacion: string | null;
  /** De la más reciente a la más antigua. */
  eventos: MedidaDgcp[];
}

export type ViaOfac = "rnc" | "direccion" | "mencion";

export interface EntidadOfac {
  /** El número de entrada en la lista SDN. */
  ent: number;
  nombre: string;
  programas: string[];
  /** El «Tax ID No. … (Dominican Republic)» que publica la OFAC. */
  rnc: string | null;
  pais: string;
  /** Qué la liga al país: un RNC, una dirección o una mención. */
  via: ViaOfac[];
  alias: string[];
  /** Los RPE inscritos con ese RNC en el registro de la DGCP. */
  rpes: string[];
}

export interface MetaSanciones {
  generado: string;
  fuentes: {
    dgcp: {
      url: string;
      urlRegistro: string;
      /** Filas de la tabla, sin tocar. */
      filas: number;
      rpe: number;
      /** El registro más reciente de la tabla (ISO). */
      corte: string | null;
      registro: number;
      duplicadas: number;
      pruebas: number;
      sinCruce: number;
      personasFisicas: number;
      eventosPersonasFisicas: number;
      juridicas: number;
      eventos: number;
      motivosAnonimizados: number;
    };
    ofac: {
      url: string;
      /** El `Last-Modified` de la lista (ISO), o `null`. */
      fecha: string | null;
      entradas: number;
      ligadasRd: number;
      individuosOmitidos: number;
    };
  };
}

export interface Sanciones extends MetaSanciones {
  proveedores: ProveedorConMedidas[];
  ofac: EntidadOfac[];
}

interface Indice {
  datos: Sanciones;
  porRpe: Map<string, ProveedorConMedidas>;
  porRnc: Map<string, ProveedorConMedidas[]>;
  ofacPorRnc: Map<string, EntidadOfac>;
  /** El texto donde busca el directorio, ya plano y sin ceros de relleno. */
  pajar: Map<string, string>;
}

let memo: Promise<Indice | null> | null = null;

function cargar(): Promise<Indice | null> {
  memo ??= readFile(join(process.cwd(), "public", "data", "sanciones.json"), "utf8")
    .then((t) => {
      const datos = JSON.parse(t) as Sanciones;
      if (!Array.isArray(datos.proveedores) || !Array.isArray(datos.ofac)) {
        throw new Error("sanciones.json sin proveedores u ofac");
      }
      const porRpe = new Map<string, ProveedorConMedidas>();
      const porRnc = new Map<string, ProveedorConMedidas[]>();
      const pajar = new Map<string, string>();
      for (const p of datos.proveedores) {
        porRpe.set(p.rpe, p);
        if (p.rnc) porRnc.set(p.rnc, [...(porRnc.get(p.rnc) ?? []), p]);
        const texto = [
          p.razonSocial,
          p.rnc ?? "",
          p.rpe,
          ...p.eventos.flatMap((e) => [e.resolucion ?? "", e.motivo]),
        ].join(" ");
        pajar.set(p.rpe, sinCeros(plano(texto)));
      }
      const ofacPorRnc = new Map<string, EntidadOfac>();
      for (const o of datos.ofac) if (o.rnc) ofacPorRnc.set(o.rnc, o);
      return { datos, porRpe, porRnc, ofacPorRnc, pajar };
    })
    .catch((err) => {
      console.error("[sanciones]", err);
      memo = null; // un fallo no se queda pegado en la instancia
      return null;
    });
  return memo;
}

/**
 * «RIC-0196-2026» y «RIC-196-2026» son la misma resolución: la DGCP rellena
 * con ceros a veces sí y a veces no. Se comparan sin los de la izquierda.
 */
function sinCeros(s: string): string {
  return s.replace(/(^|[^0-9])0+(?=\d)/g, "$1");
}

/** La instantánea entera, o `null` si no está disponible. */
export async function getSanciones(): Promise<Sanciones | null> {
  return (await cargar())?.datos ?? null;
}

/**
 * Las medidas de un RPE. `null` si la instantánea no está disponible;
 * `undefined` si ese RPE no tiene medidas **en la instantánea** (que no es lo
 * mismo que no tenerlas: la tabla tiene fecha de corte).
 */
export async function medidasDeRpe(
  rpe: string,
): Promise<ProveedorConMedidas | null | undefined> {
  if (!/^\d{1,10}$/.test(rpe)) return undefined;
  const i = await cargar();
  if (!i) return null;
  return i.porRpe.get(String(Number(rpe)));
}

/** Todos los RPE con medidas inscritos con ese RNC (una empresa puede tener varios). */
export async function medidasDeRnc(rnc: string | null | undefined): Promise<ProveedorConMedidas[]> {
  const n = (rnc ?? "").replace(/\D/g, "");
  if (n.length !== 9) return [];
  return (await cargar())?.porRnc.get(n) ?? [];
}

/** La entidad de la lista SDN con ese RNC, o `null`. */
export async function ofacDeRnc(rnc: string | null | undefined): Promise<EntidadOfac | null> {
  const n = (rnc ?? "").replace(/\D/g, "");
  if (n.length !== 9) return null;
  return (await cargar())?.ofacPorRnc.get(n) ?? null;
}

/** Los metadatos: fuentes, cortes y cuántas filas quedaron fuera y por qué. */
export async function metaSanciones(): Promise<MetaSanciones | null> {
  const d = (await cargar())?.datos;
  return d ? { generado: d.generado, fuentes: d.fuentes } : null;
}

/* ------------------------------------------------------ el directorio */

export interface FiltrosMedidas {
  q?: string;
  grupo?: GrupoMedida | null;
  tipo?: TipoMedida | null;
  /** Un año («2024»), o `antes-AAAA` para todo lo anterior a ese año. */
  anio?: string | null;
}

/** ¿Cae la fecha en el año (o el tramo «antes de») del filtro? */
export function enAnio(fecha: string, anio: string | null | undefined): boolean {
  if (!anio) return true;
  const antes = /^antes-(\d{4})$/.exec(anio);
  if (antes) return fecha.slice(0, 4) < antes[1];
  return fecha.startsWith(anio);
}

/** ¿Cumple la medida el tipo o grupo del filtro? */
export function cumpleTipo(m: MedidaDgcp, f: FiltrosMedidas): boolean {
  if (f.tipo) return m.tipo === f.tipo;
  if (f.grupo) return TIPOS_MEDIDA[m.tipo].grupo === f.grupo;
  return true;
}

/**
 * Un proveedor casa con la búsqueda si su número es exactamente el RNC o el
 * RPE tecleado, o si todas las palabras están en su razón social, su RNC, su
 * RPE, sus resoluciones o el texto de sus medidas.
 */
export async function buscadorMedidas(): Promise<((p: ProveedorConMedidas, q: string) => boolean) | null> {
  const i = await cargar();
  if (!i) return null;
  return (p, q) => {
    const consulta = q.trim();
    if (!consulta) return true;
    const digitos = consulta.replace(/[\s.-]/g, "");
    if (/^\d+$/.test(digitos)) {
      if (digitos === p.rnc || String(Number(digitos)) === p.rpe) return true;
    }
    const a = agujas(sinCeros(consulta));
    if (a.raices.length === 0 && a.numeros.length === 0) return true;
    return contieneTodas(i.pajar.get(p.rpe) ?? "", a);
  };
}
