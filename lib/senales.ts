import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { TIPOS_MEDIDA, type TipoMedida } from "@/lib/medidas";
import { formatFecha, formatPesos } from "@/lib/format";
import { formatInt } from "@/lib/nomina";

/**
 * Señales de las compras públicas: patrones que el registro de la DGCP deja
 * ver y que merecen revisión, por proveedor y por institución.
 *
 * Mecánica en docs/INFRAESTRUCTURA.md §5.1 («DGCP — señales de las compras»):
 * `scripts/build-senales.py` cruza en build las tablas completas de contratos
 * y procesos con las medidas de la DGCP (`sanciones.json`) y el padrón de la
 * DGII (`rnc/`), y deja `public/data/senales.json`. Cinco reglas cerradas,
 * cada una con su umbral escrito en el script y repetido en `reglas`.
 *
 * Lo que una señal es y no es (lo declara toda superficie que la pinte): un
 * hecho del registro que cumple una regla, con las cifras para comprobarlo;
 * no una acusación, no un hallazgo de irregularidad, y nunca una puntuación.
 * La ausencia de señales no certifica nada.
 *
 * Módulo de servidor (`node:fs`), memoizado por instancia.
 */

export type TipoSenal = "medida" | "nueva" | "padron" | "concentracion" | "excepcion";

export interface SenalMedida {
  tipo: "medida";
  medida: TipoMedida;
  desde: string;
  /** `null`: la medida sigue en pie. */
  hasta: string | null;
  contratos: number;
  monto: number;
  primero: string;
  ultimo: string;
}

export interface SenalNueva {
  tipo: "nueva";
  /** Inicio de operaciones ante la DGII. */
  inicio: string;
  /** Primera adjudicación del registro. */
  primero: string;
  dias: number;
  /** En los doce meses desde la primera adjudicación. */
  contratos: number;
  monto: number;
}

export interface SenalPadron {
  tipo: "padron";
  /** «Suspendido», «Dado de baja», «Cese temporal». */
  estado: string;
  contratos: number;
  monto: number;
  ultimo: string;
}

export interface SenalConcentracion {
  tipo: "concentracion";
  rpe: string;
  proveedor: string;
  /** Persona natural: su nombre no se ofrece a los buscadores (Ley 172-13). */
  fisica: boolean;
  pct: number;
  monto: number;
  total: number;
  proveedores: number;
  desde: string;
}

export interface SenalExcepcion {
  tipo: "excepcion";
  pct: number;
  monto: number;
  total: number;
  procesos: number;
  deProcesos: number;
  desde: string;
  hasta: string;
}

export type SenalProveedor = SenalMedida | SenalNueva | SenalPadron;
export type SenalInstitucion = SenalConcentracion | SenalExcepcion;
export type Senal = SenalProveedor | SenalInstitucion;

export interface ReglasSenales {
  diasNueva: number;
  montoNueva: number;
  desdeConcentracion: string;
  pctConcentracion: number;
  montoConcentracion: number;
  pctExcepcion: number;
  montoExcepcion: number;
  /** Mediana del país: % del monto estimado por excepción. */
  medianaExcepcion: number;
  /** Instituciones que pasan el umbral de monto de la regla. */
  institucionesExcepcion: number;
  atipico: number;
}

export interface Senales {
  generado: string;
  /** Última adjudicación de la tabla de contratos. */
  corte: string;
  corteProcesos: string;
  cortePadron: string;
  corteMedidas: string;
  fuentes: string[];
  reglas: ReglasSenales;
  proveedores: Record<string, { nombre: string; fisica: boolean; senales: SenalProveedor[] }>;
  instituciones: Record<string, { nombre: string; senales: SenalInstitucion[] }>;
}

export interface DefinicionSenal {
  etiqueta: string;
  /** La pregunta que la señal plantea, no la respuesta. */
  pregunta: string;
  /** Qué mide y qué no significa. */
  llano: string;
  sujeto: "proveedor" | "institucion";
}

/** La lista cerrada, en el orden en que se leen: de lo más grave a lo más estructural. */
export const TIPOS_SENAL: Record<TipoSenal, DefinicionSenal> = {
  medida: {
    etiqueta: "Contratos con una medida vigente",
    pregunta: "¿Se le adjudicó mientras la DGCP le impedía venderle al Estado?",
    llano:
      "Contratos adjudicados entre la fecha de una medida de la DGCP que impide contratar (inhabilitación, suspensión o cancelación de oficio, prohibición por cargo público, proceso penal) y su fin. Puede haber explicación —un proceso adjudicado antes y registrado tarde, una medida levantada sin constar—; el expediente la tiene.",
    sujeto: "proveedor",
  },
  nueva: {
    etiqueta: "Empresa recién iniciada con contratos grandes",
    pregunta: "¿Cómo ganó tanto una empresa con menos de un año?",
    llano:
      "Una empresa (no un consorcio) que recibió su primer contrato antes de cumplir un año de operaciones ante la DGII y sumó una cifra alta en sus primeros doce meses. Las empresas nuevas pueden competir y ganar; la señal dice que el registro no muestra experiencia previa con el Estado.",
    sujeto: "proveedor",
  },
  padron: {
    etiqueta: "Contrata con el RNC inactivo",
    pregunta: "¿Contrata una empresa que la DGII da como inactiva?",
    llano:
      "El padrón de la DGII da a la empresa en suspensión, de baja o en cese temporal, y tiene contratos adjudicados en los doce meses anteriores al corte del padrón. El padrón dice el estado de hoy, no desde cuándo: el cambio pudo ser posterior al contrato.",
    sujeto: "proveedor",
  },
  concentracion: {
    etiqueta: "Un proveedor concentra lo contratado",
    pregunta: "¿Por qué la mitad o más de lo que contrata va a un solo proveedor?",
    llano:
      "Un solo proveedor se lleva la mitad o más del valor que la institución contrató desde enero de 2023. Hay mercados con un solo oferente real (un medicamento, una patente, un servicio regulado); la señal dice que la competencia no se ve en el registro.",
    sujeto: "institucion",
  },
  excepcion: {
    etiqueta: "Compra sobre todo por excepción",
    pregunta: "¿Por qué la mayor parte de sus compras no pasa por un proceso ordinario?",
    llano:
      "La mitad o más del monto estimado de lo que publicó en doce meses va por una vía de excepción (proveedor único, exclusividad, urgencia, emergencia, publicidad…), que la ley permite pero que no compite abiertamente. Se compara con la mediana del país.",
    sujeto: "institucion",
  },
};

export const ORDEN_SENALES: TipoSenal[] = ["medida", "nueva", "padron", "concentracion", "excepcion"];

export function esTipoSenal(v: unknown): v is TipoSenal {
  return typeof v === "string" && v in TIPOS_SENAL;
}

const ARCHIVO = join(process.cwd(), "public", "data", "senales.json");
let memo: Promise<Senales | null> | null = null;

export function getSenales(): Promise<Senales | null> {
  memo ??= readFile(ARCHIVO, "utf8")
    .then((t) => JSON.parse(t) as Senales)
    .catch((err) => {
      console.error("[senales]", err);
      memo = null; // un fallo no se queda pegado en la instancia
      return null;
    });
  return memo;
}

/** Las señales de un RPE (sin ceros a la izquierda), o `null`. */
export async function senalesDeProveedor(rpe: string): Promise<{ senales: SenalProveedor[]; datos: Senales } | null> {
  if (!/^\d{1,10}$/.test(rpe)) return null;
  const d = await getSenales();
  const f = d?.proveedores[String(Number(rpe))];
  return f && d ? { senales: f.senales, datos: d } : null;
}

/** Las señales de una unidad de compra, o `null`. */
export async function senalesDeInstitucion(uc: number): Promise<{ senales: SenalInstitucion[]; datos: Senales } | null> {
  const d = await getSenales();
  const f = d?.instituciones[String(uc)];
  return f && d ? { senales: f.senales, datos: d } : null;
}

function nContratos(n: number): string {
  return `${formatInt(n)} ${n === 1 ? "contrato" : "contratos"}`;
}

/**
 * La señal en una frase, con sus cifras: la misma para la ficha y para el
 * servidor MCP, que la entrega como texto.
 */
export function describirSenal(s: Senal, reglas: ReglasSenales): string {
  switch (s.tipo) {
    case "medida": {
      const m = TIPOS_MEDIDA[s.medida].etiqueta.toLowerCase();
      const plazo = s.hasta ? `del ${formatFecha(s.desde)} al ${formatFecha(s.hasta)}` : `desde el ${formatFecha(s.desde)}, sin fin registrado`;
      return `${nContratos(s.contratos)} por ${formatPesos(s.monto)} adjudicados del ${formatFecha(s.primero)} al ${formatFecha(s.ultimo)}, mientras regía una medida de la DGCP (${m}, ${plazo}).`;
    }
    case "nueva":
      return `Inició operaciones ante la DGII el ${formatFecha(s.inicio)} y recibió su primer contrato ${formatInt(s.dias)} ${s.dias === 1 ? "día" : "días"} después, el ${formatFecha(s.primero)}; en sus primeros doce meses sumó ${formatPesos(s.monto)} en ${nContratos(s.contratos)}.`;
    case "padron":
      return `El padrón de la DGII la da en estado «${s.estado.toLowerCase()}» y tiene ${nContratos(s.contratos)} por ${formatPesos(s.monto)} adjudicados en los doce meses anteriores a su corte; el último, del ${formatFecha(s.ultimo)}.`;
    case "concentracion":
      return `Desde el ${formatFecha(s.desde)}, ${s.proveedor || `el RPE ${s.rpe}`} se lleva el ${s.pct.toLocaleString("es-DO")} % de lo que contrató (${formatPesos(s.monto)} de ${formatPesos(s.total)}, entre ${formatInt(s.proveedores)} proveedores).`;
    case "excepcion":
      return `Del ${formatFecha(s.desde)} al ${formatFecha(s.hasta)}, el ${s.pct.toLocaleString("es-DO")} % del monto estimado de lo que publicó (${formatPesos(s.monto)} de ${formatPesos(s.total)}, en ${formatInt(s.procesos)} de ${formatInt(s.deProcesos)} procesos) va por excepción; la mediana del país es ${reglas.medianaExcepcion.toLocaleString("es-DO")} %.`;
  }
}

/** Las fechas de corte que pesan sobre una señal, en una frase. */
export function corteDeSenal(s: Senal, d: Senales): string {
  switch (s.tipo) {
    case "medida":
      return `contratos al ${formatFecha(d.corte)}; medidas al ${formatFecha(d.corteMedidas)}`;
    case "nueva":
    case "padron":
      return `contratos al ${formatFecha(d.corte)}; padrón de la DGII al ${formatFecha(d.cortePadron)}`;
    case "concentracion":
      return `contratos al ${formatFecha(d.corte)}`;
    case "excepcion":
      return `procesos al ${formatFecha(d.corteProcesos)}`;
  }
}
