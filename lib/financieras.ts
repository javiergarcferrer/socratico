import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { agujas, contieneTodas, plano } from "@/lib/raiz";
import { INSTITUCIONES, type Institucion } from "@/lib/instituciones";
import { provinciaDeTexto, type Provincia } from "@/lib/provincias";
import { MESES } from "@/lib/format";
import type { Tono } from "@/lib/estados";
import type { ClaveGlosario } from "@/lib/glosario";

/**
 * El registro de las entidades financieras reguladas: bancos, asociaciones,
 * financieras, agentes de cambio, fiduciarias, burós de crédito, oficinas de
 * representación, AFP, aseguradoras y cooperativas de ahorro, crédito o
 * servicios múltiples, una ficha por entidad con lo que publica de ella
 * **quien la supervisa**.
 *
 * Mecánica verificada el 2026-09-29 (docs/AUDITORIA.md §5.6, §5.7, §G.5 y
 * §G.13, y el reconocimiento de esa pasada, que va en la cabecera de
 * `scripts/build-banca.py`). El script lee, con robots primero y un segundo
 * entre peticiones, y escribe `public/data/banca.json`:
 *  · Superintendencia de Bancos (`sb.gob.do/supervisados/`): el listado y la
 *    ficha de cada entidad de intermediación financiera y cambiaria, fiduciaria,
 *    sociedad de información crediticia y oficina de representación. Activos,
 *    participación, empleados, oficinas, cajeros, calificación, consejo y
 *    principales funcionarios, y los PDF de sus estados financieros y memorias
 *    (se enlazan, no se leen). La SB publica **cuántos** accionistas hay, no
 *    quiénes. Cada ficha dice su «datos actualizados al», que no es el mismo
 *    para todas: se muestra el de cada una.
 *  · El registro mensual de entidades autorizadas de la SB (CSV, 2018-2026),
 *    solo para decir desde qué mes figura una entidad cuando su razón social
 *    casa exacta.
 *  · SIPEN: las AFP autorizadas. Superintendencia de Seguros: el nombre y la
 *    web de las compañías. IDECOOP: las cooperativas de ahorro, de crédito o
 *    solo de servicios múltiples (así está COOPNAMA), incorporadas por decreto
 *    de 1953 a junio de 2024 (el archivo no se ha vuelto a publicar); el
 *    IDECOOP no dice cuáles siguen activas.
 *
 * **Privacidad.** Ni la instantánea ni esta capa guardan teléfonos, correos ni
 * direcciones; los nombres del consejo y de los funcionarios van tal como los
 * publica la SB, en texto, sin enlazar a nada.
 *
 * Bloqueados (se declaran en `/fuentes`): la Superintendencia del Mercado de
 * Valores y el registro de intermediarios de seguros, tras desafíos de
 * Cloudflare. SIMBAD lo lee solo `lib/banca.ts`.
 *
 * Módulo de servidor (`node:fs`), memoizado por instancia.
 */

export type Sector =
  | "banco-multiple"
  | "asociacion"
  | "ahorro-credito"
  | "corporacion-credito"
  | "entidad-publica"
  | "cambiaria"
  | "fiduciaria"
  | "informacion-crediticia"
  | "oficina-representacion"
  | "afp"
  | "aseguradora"
  | "cooperativa";

export type Supervisor = "sb" | "sipen" | "sis" | "idecoop";

export interface Persona {
  nombre: string;
  cargo?: string;
}

export interface DocumentoFinanciero {
  /** Como lo titula la SB: «31 de diciembre 2025», «FDI - 30 DE JUNIO 2026». */
  titulo: string;
  anio?: number;
  /** La fecha de corte que dice el título, si la dice. */
  fecha?: string;
  url: string;
}

/** Una entidad. Lo que su supervisor no publica, falta: nunca se rellena. */
export interface EntidadFinanciera {
  slug: string;
  /** El nombre corto con que la publica su supervisor: «Banreservas». */
  nombre: string;
  razonSocial?: string;
  /** RNC de nueve cifras, sin guiones. Una cédula no se guarda. */
  rnc?: string;
  /** Número de registro en la SB: «H-001-1-00-0101». */
  registroSb?: string;
  sector: Sector;
  /** El tipo tal como lo escribe el supervisor: «Agente de remesas y cambio». */
  tipo?: string;
  supervisor: Supervisor;
  /** «Operando», «Cancelado», «En liquidación administrativa»; solo la SB lo publica. */
  estatus?: string;
  /** El aviso de la SB sobre una entidad cancelada o en liquidación. */
  aviso?: string;
  activosMillones?: number;
  /** Fiduciarias: lo que administran en fideicomisos, que no es suyo. */
  activosAdministradosMillones?: number;
  fideicomisos?: number;
  /** Porcentaje de los activos del sistema, redondeado a un decimal por la SB. */
  participacion?: number;
  empleados?: number;
  oficinas?: number;
  cajeros?: number;
  subagentes?: number;
  /** Cuántos accionistas tiene. La SB no publica sus nombres. */
  accionistas?: number;
  calificacion?: string;
  calificadora?: string;
  fechaCalificacion?: string;
  /** «Operaciones permitidas de conformidad con la Ley 183-02». */
  servicios?: string[];
  consejo?: Persona[];
  funcionarios?: Persona[];
  /** Si algún día la SB publica los accionistas con nombre. */
  accionistasLista?: Persona[];
  web?: string;
  estadosFinancieros?: DocumentoFinanciero[];
  memorias?: DocumentoFinanciero[];
  /** Primer mes (`AAAA-MM`) en el registro mensual de la SB, que empieza en enero de 2018. */
  registroDesde?: string;
  /** Registro en la SIPEN (AFP) o en la SB (fiduciarias). */
  fechaRegistro?: string;
  /** Resolución de la SIPEN que autorizó la AFP: «25-03». */
  resolucion?: string;
  siglas?: string;
  /** Nombre anterior que publica el supervisor: «Banesco Seguros». */
  antes?: string;
  /** Cooperativas: la tipología como la escribe el IDECOOP. */
  tipologia?: string;
  /** Número del decreto que la incorporó, tal como lo publica el IDECOOP. */
  decreto?: string;
  fechaDecreto?: string;
  anioDecreto?: number;
  centroRegional?: string;
  provincia?: string;
  /** La página del supervisor de donde sale la ficha. */
  fuente: string;
  /** «Datos actualizados al» de la ficha de la SB (ISO). */
  corte?: string;
}

export interface Financieras {
  generado: string;
  fuentes: {
    sb: string;
    registroSb: string;
    sipen: string;
    sis: string;
    idecoop: string;
    idecoopXlsx: string;
  };
  cortes: {
    sb: { desde: string; hasta: string } | null;
    registroSb: { desde: string; hasta: string };
    /** Último mes que cubre el archivo del IDECOOP (`AAAA-MM`). */
    idecoop: string | null;
  };
  resumen: {
    porSector: Partial<Record<Sector, number>>;
    cooperativasIncorporadas: number;
    cooperativasIncluidas: number;
    subagentes: { total: number; bancarios?: number; cambiarios?: number; fuente: string } | null;
    registroCasadas: number;
  };
  entidades: EntidadFinanciera[];
}

/* ------------------------------------------------------------ vocabulario */

export interface InfoSector {
  clave: Sector;
  /** «Es un banco múltiple», «es una fiduciaria». */
  articulo: "un" | "una";
  /** Una entidad: «Banco múltiple». */
  nombre: string;
  /** Varias: «Bancos múltiples». */
  plural: string;
  /** La etiqueta del filtro: corta, se reconoce de un vistazo. */
  corto: string;
  supervisor: Supervisor;
  /** Su definición llana en `lib/glosario.ts`. */
  glosa: ClaveGlosario;
}

/** Los sectores, en el orden en que se ofrecen: de lo que más dinero guarda a lo que menos. */
export const SECTORES: InfoSector[] = [
  { clave: "banco-multiple", articulo: "un", nombre: "Banco múltiple", plural: "Bancos múltiples", corto: "Bancos múltiples", supervisor: "sb", glosa: "bancoMultiple" },
  { clave: "asociacion", articulo: "una", nombre: "Asociación de ahorros y préstamos", plural: "Asociaciones de ahorros y préstamos", corto: "Asociaciones", supervisor: "sb", glosa: "asociacionAhorros" },
  { clave: "ahorro-credito", articulo: "un", nombre: "Banco de ahorro y crédito", plural: "Bancos de ahorro y crédito", corto: "Ahorro y crédito", supervisor: "sb", glosa: "bancoAhorroCredito" },
  { clave: "corporacion-credito", articulo: "una", nombre: "Corporación de crédito", plural: "Corporaciones de crédito", corto: "Corporaciones de crédito", supervisor: "sb", glosa: "corporacionCredito" },
  { clave: "entidad-publica", articulo: "una", nombre: "Entidad pública de intermediación financiera", plural: "Entidades públicas de intermediación", corto: "Entidades públicas", supervisor: "sb", glosa: "entidadPublica" },
  { clave: "cooperativa", articulo: "una", nombre: "Cooperativa de ahorro y crédito o de servicios múltiples", plural: "Cooperativas de ahorro, crédito o servicios múltiples", corto: "Cooperativas", supervisor: "idecoop", glosa: "cooperativa" },
  { clave: "afp", articulo: "una", nombre: "Administradora de fondos de pensiones", plural: "Administradoras de fondos de pensiones", corto: "AFP", supervisor: "sipen", glosa: "afp" },
  { clave: "aseguradora", articulo: "una", nombre: "Aseguradora", plural: "Aseguradoras y reaseguradoras", corto: "Aseguradoras", supervisor: "sis", glosa: "aseguradora" },
  { clave: "cambiaria", articulo: "un", nombre: "Agente de cambio o de remesas", plural: "Agentes de cambio y de remesas", corto: "Cambio y remesas", supervisor: "sb", glosa: "agenteCambio" },
  { clave: "fiduciaria", articulo: "una", nombre: "Fiduciaria", plural: "Fiduciarias", corto: "Fiduciarias", supervisor: "sb", glosa: "fiduciaria" },
  { clave: "informacion-crediticia", articulo: "un", nombre: "Buró de crédito", plural: "Burós de crédito", corto: "Burós de crédito", supervisor: "sb", glosa: "buroCredito" },
  { clave: "oficina-representacion", articulo: "una", nombre: "Oficina de representación", plural: "Oficinas de representación de bancos extranjeros", corto: "Oficinas de representación", supervisor: "sb", glosa: "oficinaRepresentacion" },
];

const POR_SECTOR = new Map(SECTORES.map((s) => [s.clave, s]));

export function infoSector(s: Sector): InfoSector {
  return POR_SECTOR.get(s)!;
}

export function esSector(v: unknown): v is Sector {
  return typeof v === "string" && POR_SECTOR.has(v as Sector);
}

/** Las que captan dinero del público bajo la Ley 183-02: las «entidades de intermediación financiera». */
export const SECTORES_EIF: readonly Sector[] = [
  "banco-multiple",
  "asociacion",
  "ahorro-credito",
  "corporacion-credito",
  "entidad-publica",
];

export const SUPERVISORES: Record<Supervisor, { nombre: string; siglas: string; conArticulo: string; de: string }> = {
  sb: {
    nombre: "Superintendencia de Bancos",
    siglas: "SB",
    conArticulo: "la Superintendencia de Bancos",
    de: "de la Superintendencia de Bancos",
  },
  sipen: {
    nombre: "Superintendencia de Pensiones",
    siglas: "SIPEN",
    conArticulo: "la Superintendencia de Pensiones (SIPEN)",
    de: "de la Superintendencia de Pensiones (SIPEN)",
  },
  sis: {
    nombre: "Superintendencia de Seguros",
    siglas: "SIS",
    conArticulo: "la Superintendencia de Seguros",
    de: "de la Superintendencia de Seguros",
  },
  idecoop: {
    nombre: "Instituto de Desarrollo y Crédito Cooperativo",
    siglas: "IDECOOP",
    conArticulo: "el Instituto de Desarrollo y Crédito Cooperativo (IDECOOP)",
    de: "del Instituto de Desarrollo y Crédito Cooperativo (IDECOOP)",
  },
};

/**
 * La participación como la redondea la SB, a un decimal. Un «0.0 %» es una
 * entidad por debajo de 0.05 %: se dice así, porque cero no es.
 */
export function textoParticipacion(p: number): string {
  return p < 0.05 ? "menos de 0.05 %" : `${p.toLocaleString("es-DO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

/** «2024-06» → «junio de 2024»: el mes de un corte, dicho en una frase. */
export function formatMesLargo(aaaamm: string): string {
  const [a, m] = aaaamm.split("-").map(Number);
  return a && m >= 1 && m <= 12 ? `${MESES[m - 1]} de ${a}` : aaaamm;
}

/** ¿Afirma la SB que no tiene calificación? («No tiene» no es lo mismo que no publicarla.) */
export function sinCalificacion(e: EntidadFinanciera): boolean {
  return /^no tiene$/i.test(e.calificacion?.trim() ?? "");
}

/** El estatus de la SB, traducido a los oficios de color de `lib/estados.ts`. */
export function tonoDeEstatus(estatus: string | null | undefined): Tono {
  const e = (estatus ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (e.startsWith("operando") || e.startsWith("activ")) return "cumplido";
  if (e.includes("liquidacion")) return "aviso";
  if (e.includes("cancelad") || e.includes("revocad")) return "anulado";
  return "contexto";
}

export function opera(e: EntidadFinanciera): boolean {
  return tonoDeEstatus(e.estatus) === "cumplido";
}

/* ---------------------------------------------------------------- lectura */

let memo: Promise<Financieras | null> | null = null;

export function getFinancieras(): Promise<Financieras | null> {
  memo ??= readFile(join(process.cwd(), "public", "data", "banca.json"), "utf8")
    .then((t) => {
      const d = JSON.parse(t) as Financieras;
      return Array.isArray(d?.entidades) && d.entidades.length > 0 ? d : null;
    })
    .catch((err) => {
      console.error("[financieras]", err);
      memo = null;
      return null;
    });
  return memo;
}

let indice: { porSlug: Map<string, EntidadFinanciera>; porRnc: Map<string, EntidadFinanciera>; planos: Map<string, string> } | null = null;
let indiceDe: Financieras | null = null;

function indices(d: Financieras) {
  if (indice && indiceDe === d) return indice;
  const porSlug = new Map<string, EntidadFinanciera>();
  const porRnc = new Map<string, EntidadFinanciera>();
  const planos = new Map<string, string>();
  for (const e of d.entidades) {
    porSlug.set(e.slug, e);
    if (e.rnc && !porRnc.has(e.rnc)) porRnc.set(e.rnc, e);
    planos.set(e.slug, plano([e.nombre, e.razonSocial, e.siglas, e.antes, e.tipo].filter(Boolean).join(" ")));
  }
  indice = { porSlug, porRnc, planos };
  indiceDe = d;
  return indice;
}

export async function entidadPorSlug(slug: string): Promise<EntidadFinanciera | null> {
  const d = await getFinancieras();
  return d ? (indices(d).porSlug.get(slug) ?? null) : null;
}

/** La entidad con ese RNC (con o sin guiones), si es una de las supervisadas. */
export async function entidadPorRnc(rnc: string): Promise<EntidadFinanciera | null> {
  const d = await getFinancieras();
  const n = rnc.replace(/\D/g, "");
  return d && n.length === 9 ? (indices(d).porRnc.get(n) ?? null) : null;
}

export function porSector(d: Financieras, sector: Sector): EntidadFinanciera[] {
  return d.entidades.filter((e) => e.sector === sector);
}

/** La provincia de una cooperativa, en el vocabulario de `/provincias`. */
export function provinciaDe(e: EntidadFinanciera): Provincia | null {
  return provinciaDeTexto(e.provincia);
}

/**
 * Filtra por sector, provincia y todas las palabras —en cualquier orden, sin
 * tildes, por raíz— en el nombre, la razón social, las siglas y el nombre
 * anterior. Un RNC (con o sin guiones) se busca exacto.
 */
export function filtrarEntidades(
  d: Financieras,
  { q, sector, provincia }: { q?: string; sector?: Sector; provincia?: string },
): EntidadFinanciera[] {
  const { planos } = indices(d);
  const texto = q?.trim() ?? "";
  const cifras = texto.replace(/\D/g, "");
  const esRnc = texto !== "" && !/\p{L}/u.test(texto) && (cifras.length === 9 || cifras.length === 11);
  const aguja = texto && !esRnc ? agujas(texto) : null;
  return d.entidades.filter((e) => {
    if (sector && e.sector !== sector) return false;
    if (provincia && provinciaDe(e)?.slug !== provincia) return false;
    if (esRnc) return e.rnc === cifras;
    if (aguja) return contieneTodas(planos.get(e.slug) ?? "", aguja);
    return true;
  });
}

/** ¿Se llama exactamente así, por su nombre, sus siglas o su nombre anterior (sin tildes ni signos)? */
export function seLlamaAsi(e: EntidadFinanciera, q: string): boolean {
  const buscada = plano(q);
  return buscada.trim() !== "" && [e.siglas, e.nombre, e.antes].some((n) => n && plano(n) === buscada);
}

/**
 * De la que más activos tiene a la que menos, según la SB. Las fiduciarias,
 * cuando se miran solas, por lo que administran; las demás sin cifra, por
 * nombre. Dos medidas distintas nunca se mezclan en un mismo orden.
 */
export function ordenarEntidades(lista: EntidadFinanciera[], sector?: Sector, q?: string): EntidadFinanciera[] {
  const medida = (e: EntidadFinanciera) =>
    sector === "fiduciaria" ? (e.activosAdministradosMillones ?? -1) : (e.activosMillones ?? -1);
  // Con una búsqueda, lo que se llama exactamente así va primero: «coopnama»
  // encuentra por raíz también a COOPNAMICRO, pero quien lo teclea busca a COOPNAMA.
  const exacta = (e: EntidadFinanciera) => (q && seLlamaAsi(e, q) ? 0 : 1);
  return [...lista].sort(
    (a, b) =>
      exacta(a) - exacta(b) ||
      medida(b) - medida(a) ||
      a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }),
  );
}

/* ---------------------------------------------------------------- cruces */

const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const INSTITUCION_POR_NOMBRE = (() => {
  const m = new Map<string, Institucion | null>();
  for (const i of INSTITUCIONES) {
    const k = normal(i.nombre);
    // Dos instituciones con el mismo nombre normalizado: ninguna gana.
    m.set(k, m.has(k) ? null : i);
  }
  return m;
})();

/**
 * La institución del Estado que **es** esta entidad —el Banco Agrícola—, solo
 * si su razón social o su nombre coinciden exactos (sin tildes ni signos) con
 * el nombre de una unidad de compra del cruce. Un puente adivinado es peor que
 * ninguno.
 */
export function institucionDe(e: EntidadFinanciera): Institucion | null {
  for (const n of [e.razonSocial, e.nombre]) {
    if (!n) continue;
    const i = INSTITUCION_POR_NOMBRE.get(normal(n));
    if (i) return i;
  }
  return null;
}

/** El número del decreto de incorporación si tiene ficha propia en `/normativa` («188-24»). */
export function decretoConFicha(e: EntidadFinanciera): string | null {
  const n = e.decreto?.trim() ?? "";
  return /^\d{1,4}-\d{2}$/.test(n) ? n : null;
}

/** «401010062» → «4-01-01006-2», como lo escribe la DGII. */
export function formatRnc(rnc: string): string {
  return /^\d{9}$/.test(rnc) ? `${rnc[0]}-${rnc.slice(1, 3)}-${rnc.slice(3, 8)}-${rnc[8]}` : rnc;
}

/* --------------------------------------------------------------- resumen */

export interface ResumenSistema {
  /** Entidades de intermediación financiera que operan. */
  operan: number;
  /** Suma de sus activos, en millones de pesos. */
  activosMillones: number;
  /** Las tres de más activos y lo que suman sus participaciones, según la SB. */
  mayores: EntidadFinanciera[];
  participacionMayores: number;
  /** Primera y última fecha de «datos actualizados al» entre las que operan. */
  corteDesde: string | null;
  corteHasta: string | null;
}

export function resumenSistema(d: Financieras): ResumenSistema {
  const operan = d.entidades.filter((e) => SECTORES_EIF.includes(e.sector) && opera(e));
  const mayores = ordenarEntidades(operan).slice(0, 3);
  const cortes = operan.map((e) => e.corte).filter((c): c is string => Boolean(c)).sort();
  return {
    operan: operan.length,
    activosMillones: operan.reduce((s, e) => s + (e.activosMillones ?? 0), 0),
    mayores,
    participacionMayores: mayores.reduce((s, e) => s + (e.participacion ?? 0), 0),
    corteDesde: cortes[0] ?? null,
    corteHasta: cortes.at(-1) ?? null,
  };
}
