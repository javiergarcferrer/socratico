import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Quién tiene los bonos internos del Estado y a quién le debe el sector
 * público: dos archivos de la Dirección General de Crédito Público.
 *
 * Mecánica verificada en docs/AUDITORIA.md §G.17 (2026-10-02). El servidor de
 * Crédito Público no responde al egreso de Vercel (§3.3), así que
 * `scripts/build-tenedores.py` los lee en build y este módulo sirve
 * `public/data/tenedores.json`; la interfaz dice que es una instantánea, con
 * su fecha.
 *
 *  · **Tenedores** — «Relación de Tenedores de Bonos Internos Emitidos por el
 *    Sector Público», en millones de pesos, mes a mes desde enero de 2011:
 *    cuánto tiene cada tipo de tenedor (bancos múltiples, fondos de
 *    pensiones…), según el depósito de valores (CEVALDOM), separado por
 *    residencia. Cubre los bonos **internos** de Hacienda (subastas y leyes de
 *    emisión), no los certificados del Banco Central ni los bonos globales.
 *    CEVALDOM reorganizó la clasificación cuatro veces (`reclasificaciones`):
 *    un tipo puede pasar a cero y reaparecer con otro nombre, así que la serie
 *    por tipo no se compara a través de esas fechas sin decirlo. El archivo
 *    trae descuadres viejos (`descuadres`) que se publican tal cual.
 *  · **Acreedores** — «Saldo Deuda … por Acreedor», en millones de dólares:
 *    cuatro cierres de año y el corte del año en curso, por organismo, país y
 *    tipo de instrumento.
 *
 * La agrupación de tenedores en familias (`GRUPOS`) es de Socrático, no del
 * origen; cada fila conserva el nombre que publica Crédito Público.
 *
 * Módulo de servidor (`node:fs`), memoizado por instancia; `null` si falta la
 * instantánea o no se puede leer.
 */

export type GrupoTenedor =
  | "pensiones"
  | "bancos"
  | "estado"
  | "mercado"
  | "seguros"
  | "personas"
  | "empresas"
  | "extranjeros";

export const GRUPOS: Record<GrupoTenedor, { nombre: string; explicacion: string }> = {
  pensiones: {
    nombre: "Fondos de pensiones",
    explicacion:
      "El ahorro para el retiro de los trabajadores afiliados, que administran las AFP, y los fondos de la seguridad social.",
  },
  bancos: {
    nombre: "Bancos y otras entidades de depósito",
    explicacion:
      "Bancos múltiples, asociaciones de ahorros y préstamos, bancos de ahorro y crédito, corporaciones de crédito, cooperativas y entidades públicas de intermediación.",
  },
  estado: {
    nombre: "El propio sector público",
    explicacion:
      "Instituciones y empresas del Estado que compran bonos del Estado: instituciones públicas financieras, empresas públicas no financieras, descentralizadas.",
  },
  mercado: {
    nombre: "Puestos de bolsa y fondos de inversión",
    explicacion:
      "Intermediarios del mercado de valores y los fondos y fideicomisos que reúnen el dinero de muchos inversionistas.",
  },
  seguros: {
    nombre: "Aseguradoras",
    explicacion: "Compañías de seguros que invierten sus reservas.",
  },
  personas: {
    nombre: "Personas",
    explicacion: "Personas físicas residentes en el país que compraron bonos a su nombre.",
  },
  empresas: {
    nombre: "Empresas y otras entidades privadas",
    explicacion:
      "Empresas privadas no financieras, instituciones sin fines de lucro y el resto de los hogares.",
  },
  extranjeros: {
    nombre: "Inversionistas del extranjero",
    explicacion:
      "Personas y entidades con residencia fuera del país que tienen bonos en pesos.",
  },
};

export interface FilaTenedor {
  residencia: "domestica" | "extranjera";
  /** El nombre tal como lo publica Crédito Público. */
  nombre: string;
  grupo: GrupoTenedor;
  /** Millones de RD$, alineada con `meses`. */
  serie: number[];
}

export interface Tenedores {
  url: string;
  pagina: string;
  actualizado: string | null;
  unidad: string;
  /** AAAA-MM, en orden. */
  meses: string[];
  total: number[];
  domestica: number[];
  extranjera: number[];
  filas: FilaTenedor[];
  /** AAAA-MM de cada reorganización de CEVALDOM. */
  reclasificaciones: string[];
  descuadres: string[];
  notas: string[];
}

export interface FilaAcreedor {
  seccion: "externa" | "interna";
  grupo: "multilateral" | "bilateral" | "oficial" | "privada" | "interna" | "total";
  nombre: string;
  /** `dentro`: «de los cuales», ya contado en la fila de arriba. */
  tipo: "detalle" | "subtotal" | "total" | "dentro";
  /** Millones de US$, alineada con `cortes`. */
  usd: (number | null)[];
}

export interface Acreedores {
  url: string;
  pagina: string;
  unidad: string;
  cortes: { etiqueta: string; anio: number; mes: number; preliminar: boolean }[];
  filas: FilaAcreedor[];
  total: number[];
  pctPib: (number | null)[];
}

export interface DatosTenedores {
  generado: string;
  fuente: string;
  tenedores: Tenedores;
  acreedores: Acreedores;
}

let memo: Promise<DatosTenedores | null> | null = null;

export function getTenedores(): Promise<DatosTenedores | null> {
  memo ??= readFile(join(process.cwd(), "public", "data", "tenedores.json"), "utf8")
    .then((t) => {
      const d = JSON.parse(t) as DatosTenedores;
      return d.tenedores?.meses?.length && d.acreedores?.cortes?.length ? d : null;
    })
    .catch((err) => {
      console.error("[tenedores]", err);
      memo = null;
      return null;
    });
  return memo;
}

export interface PorGrupo {
  grupo: GrupoTenedor;
  valor: number;
  /** Fracción del total del mes, 0–1. */
  parte: number;
  filas: { nombre: string; valor: number }[];
}

/** El reparto de un mes (índice en `meses`) por familia, de mayor a menor. */
export function repartoDelMes(t: Tenedores, i: number): PorGrupo[] {
  const total = t.total[i] || 1;
  const grupos = new Map<GrupoTenedor, PorGrupo>();
  for (const f of t.filas) {
    const v = f.serie[i] ?? 0;
    if (Math.abs(v) < 0.05) continue;
    const g = grupos.get(f.grupo) ?? { grupo: f.grupo, valor: 0, parte: 0, filas: [] };
    g.valor += v;
    g.filas.push({ nombre: f.residencia === "extranjera" ? `${f.nombre} (del extranjero)` : f.nombre, valor: v });
    grupos.set(f.grupo, g);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, parte: g.valor / total, filas: g.filas.sort((a, b) => b.valor - a.valor) }))
    .sort((a, b) => b.valor - a.valor);
}

/** La serie de una familia, sumando sus tipos, alineada con `meses`. */
export function serieDeGrupo(t: Tenedores, grupo: GrupoTenedor): number[] {
  return t.meses.map((_, i) =>
    t.filas.filter((f) => f.grupo === grupo).reduce((s, f) => s + (f.serie[i] ?? 0), 0),
  );
}
