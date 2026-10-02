import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Tono } from "@/lib/estados";
import { agujas, contieneTodas, plano } from "@/lib/raiz";
import { TIPOS_MEDIDA, type GrupoMedida, type TipoMedida } from "@/lib/medidas";

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
 *  1. **Las personas físicas, con su nombre y nunca con su cédula** (decisión
 *     del dueño, 2026-09-30): `fisica: true`, sin documento ni constancia del
 *     RPE (la constancia muestra la cédula). Su fila no se ofrece a los
 *     buscadores (`data-nosnippet`) y su ficha de proveedor no se indexa. En
 *     los motivos, el nombre y el documento de quien firma una solicitud van
 *     sustituidos por «[nombre omitido]» y «[documento omitido]».
 *  2. **La lista mezcla cosas muy distintas**: sanciones, suspensiones
 *     preventivas, prohibiciones por cargo público, bajas que pidió el propio
 *     proveedor y correcciones del registro. El tipo es una lectura del texto
 *     del Estado, y el texto va siempre entero al lado.
 *  3. **De la OFAC, solo entidades**, nunca personas. Es una lista extranjera.
 *  4. **Del Banco Mundial, solo firmas** ligadas al país o con exactamente el
 *     mismo nombre que un proveedor inscrito en la DGCP. Es una lista de a
 *     quién no contrata el Banco en lo que financia, no una medida del Estado,
 *     y un mismo nombre no prueba que sea la misma empresa: se dice así. Su API
 *     exige la clave que publica su página; el build la lee de ahí y no la
 *     escribe.
 *
 * Una instantánea tiene fecha de corte: que un proveedor no tenga medidas aquí
 * no certifica nada. Módulo de servidor (`node:fs`), memoizado por instancia.
 */

/* ----------------------------------------------------- el tipo de medida */

// Los tipos de medida viven en `lib/medidas.ts` (sin leer nada); se siguen exportando desde aquí.
export {
  GRUPOS_MEDIDA,
  ORDEN_GRUPOS,
  ORDEN_TIPOS,
  TIPOS_MEDIDA,
  esGrupoMedida,
  esTipoMedida,
  type DefinicionTipo,
  type GrupoMedida,
  type TipoMedida,
} from "@/lib/medidas";
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
  /** La razón social; en una persona física, su nombre tal como lo inscribió. */
  razonSocial: string;
  /** Nueve cifras, o `null` (proveedor extranjero o persona física). */
  rnc: string | null;
  /** Persona física inscrita con cédula: la cédula no está en la instantánea. */
  fisica?: boolean;
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

/** Una firma de la lista de inhabilitados del Banco Mundial. */
export interface EntidadBancoMundial {
  id: number;
  nombre: string;
  pais: string | null;
  /** ISO. */
  desde: string | null;
  /** ISO, o `null` si la inhabilitación no tiene fecha de fin. */
  hasta: string | null;
  /** «Cross Debarment: EBRD», «2010 Procurement Guidelines, 1.14(a)(iii)»… tal cual. */
  motivo: string | null;
  /** La impuso otro banco multilateral y el Banco Mundial la aplica. */
  cruzada: boolean;
  estado: string | null;
  /** Ligada al país por su país o su dirección. */
  dominicana: boolean;
  /** Los RPE de la DGCP con **exactamente el mismo nombre** (no prueba identidad). */
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
    /** Falta en las instantáneas anteriores al 30-09-2026. */
    bancoMundial?: {
      url: string;
      /** La fecha de actualización que declara el Banco (ISO), o `null`. */
      fecha: string | null;
      entradas: number;
      firmas: number;
      individuosOmitidos: number;
      dominicanas: number;
      coincidencias: number;
    };
  };
}

export interface Sanciones extends MetaSanciones {
  proveedores: ProveedorConMedidas[];
  ofac: EntidadOfac[];
  bancoMundial?: EntidadBancoMundial[];
}

/** Los bancos multilaterales que aparecen en las inhabilitaciones cruzadas, en llano. */
const BANCOS_CRUZADOS: Record<string, string> = {
  EBRD: "el Banco Europeo de Reconstrucción y Desarrollo",
  ADB: "el Banco Asiático de Desarrollo",
  AFDB: "el Banco Africano de Desarrollo",
  IDB: "el Banco Interamericano de Desarrollo",
};

/**
 * El motivo del Banco Mundial en llano: una inhabilitación cruzada dice qué
 * banco la impuso; una cláusula de sus normas se cita tal cual.
 */
export function motivoBancoMundialEnLlano(e: EntidadBancoMundial): string {
  const m = /^cross debarment:\s*(.+)$/i.exec(e.motivo ?? "");
  if (m) {
    const bancos = m[1].split(/[\/,]\s*/).map((b) => BANCOS_CRUZADOS[b.trim().toUpperCase()] ?? b.trim());
    return `Inhabilitación cruzada: la impuso ${bancos.join(" y ")}, y el Banco Mundial la aplica.`;
  }
  return e.motivo ? `Según sus normas de adquisiciones: «${e.motivo}».` : "El Banco Mundial no escribe el motivo.";
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

/** Las firmas del Banco Mundial con el mismo nombre que este RPE. */
export async function bancoMundialDeRpe(rpe: string): Promise<EntidadBancoMundial[]> {
  const d = (await cargar())?.datos;
  const n = String(Number(rpe));
  return d?.bancoMundial?.filter((e) => e.rpes.includes(n)) ?? [];
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
