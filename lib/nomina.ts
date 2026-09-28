/**
 * Nómina pública — modelo de datos, formateadores y agregaciones.
 *
 * El conjunto es una **foto transversal del Estado**: el último mes publicado
 * por cada institución en su nómina de transparencia, consolidado por
 * `scripts/build-nomina.py` (que documenta fuentes, formatos y límites).
 * Cada fila es una plaza (institución, área, cargo, sueldo bruto) — sin
 * nombres ni datos personales. La cobertura es la que cada institución
 * publica en formato procesable: se declara, no se disimula.
 */

import { formatPesos, MESES_CORTOS, mayuscula } from "@/lib/format";

/** Una fila es una tupla compacta de índices de diccionario + sueldo. */
export type Row = readonly [inst: number, area: number, cargo: number, sueldo: number];

export const COL = { INST: 0, AREA: 1, CARGO: 2, SUELDO: 3 } as const;

export interface InstitucionNomina {
  codigo: string;
  nombre: string;
  /** Período de la foto de esta institución. */
  anio: number;
  mes: number;
  plazas: number;
  /** Σ sueldos del mes, en DOP. */
  masa: number;
}

export type NominaData = {
  generatedAt: string;
  esquema: string;
  currency: string;
  monthNames: string[];
  instituciones: InstitucionNomina[];
  areas: string[];
  cargos: string[];
  rows: Row[];
};

export const MONTH_ABBR = MESES_CORTOS.map(mayuscula);

/**
 * Fetch the encoded dataset from /public.
 *
 * Sin `force-cache`: la respuesta lleva `Cache-Control` (next.config.ts) con
 * una hora de frescura y renovación en segundo plano, así que el navegador
 * la reutiliza sin quedarse con una instantánea vieja tras un despliegue.
 */
export async function loadNomina(): Promise<NominaData> {
  const res = await fetch("/data/nomina.json");
  if (!res.ok) throw new Error(`No se pudo cargar la nómina (${res.status})`);
  return res.json();
}

const dop = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
  maximumFractionDigits: 0,
});
const int = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 0 });

/** RD$1,234,567 */
export const formatDOP = (n: number) => dop.format(Math.round(n));
/** 1,234,567 */
export const formatInt = (n: number) => int.format(Math.round(n));

/**
 * Pesos compactos para barras y tarjetas. La magnitud se escribe en palabras
 * por la misma razón que en `formatPesos`: «MM» se lee *millones* en el uso
 * dominicano, y abreviar así mil millones se equivoca por tres órdenes.
 */
export function formatCompactDOP(n: number): string {
  const a = Math.abs(n);
  // Desde 999,500 el redondeo a miles diría «1000 mil»: pasa a millones.
  if (a >= 999_500) return formatPesos(n);
  if (a >= 1e3) return `RD$\u00A0${Math.round(n / 1e3)} mil`;
  return `RD$\u00A0${Math.round(n)}`;
}

/** "May '26" para el período de una institución. */
export const periodLabel = (anio: number, mes: number) =>
  `${MONTH_ABBR[mes - 1]} '${String(anio).slice(2)}`;

export type Bucket = { label: string; min: number; max: number };

/** Salary brackets used by the distribution chart (RD$). */
export const SALARY_BUCKETS: Bucket[] = [
  { label: "RD$0", min: 0, max: 0 },
  { label: "1–15 mil", min: 1, max: 15000 },
  { label: "15–25 mil", min: 15001, max: 25000 },
  { label: "25–50 mil", min: 25001, max: 50000 },
  { label: "50–80 mil", min: 50001, max: 80000 },
  { label: "80 mil+", min: 80001, max: Infinity },
];

export function bucketOf(sueldo: number): number {
  for (let i = 0; i < SALARY_BUCKETS.length; i++) {
    const b = SALARY_BUCKETS[i];
    if (sueldo >= b.min && sueldo <= b.max) return i;
  }
  return SALARY_BUCKETS.length - 1;
}

export type GroupStat = {
  key: number; // dictionary index
  count: number;
  total: number;
  avg: number;
  min: number;
  max: number;
};

/**
 * Aggregate filtered rows by a dimension column (INST, AREA or CARGO).
 * Returns one stat row per distinct key, unsorted.
 */
export function aggregateBy(rows: Row[], col: number): GroupStat[] {
  const acc = new Map<number, GroupStat>();
  for (const r of rows) {
    const k = r[col];
    const s = r[COL.SUELDO];
    let g = acc.get(k);
    if (!g) {
      g = { key: k, count: 0, total: 0, avg: 0, min: s, max: s };
      acc.set(k, g);
    }
    g.count++;
    g.total += s;
    if (s < g.min) g.min = s;
    if (s > g.max) g.max = s;
  }
  for (const g of acc.values()) g.avg = g.count ? g.total / g.count : 0;
  return [...acc.values()];
}

/** Median of a numeric array (mutates a copy). */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* ------------------------------------------------------------ frescura */

/**
 * Cuántos meses tiene una foto que se deja de llamar «reciente». Cada
 * institución publica su nómina a su ritmo: el conjunto mezcla julio de 2026
 * con diciembre de 2021, y quien compara sueldos entre las dos tiene que
 * saberlo en la fila, no en una nota al pie (docs/PLAN-ACCESO.md, 1.6).
 */
export const ATRASO_MAX_MESES = 3;

/** Año y mes de hoy en Santo Domingo, la misma regla que `formatFecha`. */
function mesDeHoy(hoy: Date): { anio: number; mes: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "numeric",
  }).formatToParts(hoy);
  const valor = (t: string) => Number(partes.find((p) => p.type === t)?.value);
  return { anio: valor("year"), mes: valor("month") };
}

/** Meses completos entre el mes publicado y el mes en curso. */
export function mesesDeAtraso(anio: number, mes: number, hoy = new Date()): number {
  const h = mesDeHoy(hoy);
  return (h.anio - anio) * 12 + (h.mes - mes);
}

/** La foto de esta institución tiene más de tres meses. */
export function estaAtrasada(i: { anio: number; mes: number }, hoy = new Date()): boolean {
  return mesesDeAtraso(i.anio, i.mes, hoy) > ATRASO_MAX_MESES;
}

/** «hace 4 meses», «hace 4 años y 9 meses»: la antigüedad de una foto. */
export function textoAtraso(anio: number, mes: number, hoy = new Date()): string {
  const m = mesesDeAtraso(anio, mes, hoy);
  if (m <= 0) return "del mes en curso";
  const a = Math.floor(m / 12);
  const r = m % 12;
  const meses = (n: number) => `${n} ${n === 1 ? "mes" : "meses"}`;
  if (a === 0) return `de hace ${meses(r)}`;
  const anios = `${a} ${a === 1 ? "año" : "años"}`;
  return r ? `de hace ${anios} y ${meses(r)}` : `de hace ${anios}`;
}

/* ------------------------------------------------------ cargos comparables */

/*
  Cada institución escribe el mismo puesto a su manera: «CHOFER», «Chofer I»,
  «CHOFER NIVEL 2 (VEHICULOS LIVIANOS)», «SECRETARIO (A)». Para comparar el
  mismo cargo entre instituciones se lleva cada nombre a una base —sin tildes,
  sin paréntesis, sin «nivel N» ni grado romano al final, con las
  abreviaturas desplegadas— y se busca la palabra al **principio** de esa
  base: «director» recoge «Director de Recursos Humanos» y «Directora», pero
  no «Subdirector», que es otro puesto.
*/
const ABREVIATURAS: [RegExp, string][] = [
  [/^enc\b\.?/, "encargado"],
  [/^aux\b\.?/, "auxiliar"],
  [/^coord\b\.?/, "coordinador"],
  [/^asist\b\.?/, "asistente"],
  [/^tec\b\.?/, "tecnico"],
];

const sinTildes = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** La base comparable de un nombre de cargo. */
export function cargoBase(cargo: string): string {
  let s = sinTildes(cargo)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\bnivel\s*\d+/g, " ")
    .replace(/[^a-z0-9. ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // «ENC.SECC. DE COMPRAS»: la abreviatura se expande con su espacio, o
  // quedaba «encargadosecc» y el cargo no aparecía buscando «encargado».
  for (const [re, pleno] of ABREVIATURAS) s = s.replace(re, `${pleno} `);
  return s
    .replace(/\./g, " ")
    // «Sub-Director», «Sub Director» y «Subdirector» son el mismo cargo.
    .replace(/\b(sub|vice)\s+/g, "$1")
    .replace(/\s+(i|ii|iii|iv|v)$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** «choferes» → «chofer», «médicos» → «medico», «jefes» → «jefe». */
function singular(w: string): string {
  if (/[lrndzj]es$/.test(w) && w.length > 4) return w.slice(0, -2);
  if (/[aeiou]s$/.test(w) && w.length > 3) return w.slice(0, -1);
  return w;
}

/**
 * El patrón de un cargo escrito por el lector. Cada palabra admite su femenino
 * y su plural, **también tecleada en plural**: «secretaria» encuentra
 * «Secretario (A)», «director» encuentra «Directora», «choferes» encuentra
 * «Chofer». `null` si no hay nada que buscar.
 */
export function patronCargo(texto: string): RegExp | null {
  const palabras = cargoBase(texto).split(" ").filter(Boolean);
  if (palabras.length === 0) return null;
  const partes = palabras.map((p) => {
    const w = singular(p.replace(/[^a-z0-9]/g, ""));
    if (/[oa]$/.test(w)) return `${w.slice(0, -1)}[oa]s?`;
    if (/[^aeiou]$/.test(w)) return `${w}(?:a|es|as)?`;
    return `${w}s?`;
  });
  return new RegExp(`^${partes.join(" ")}\\b`);
}

/** Cargos que aparecen en casi todas las instituciones de la foto. */
export const CARGOS_COMPARABLES = [
  "Chofer",
  "Conserje",
  "Mensajero",
  "Secretaria",
  "Recepcionista",
  "Vigilante",
  "Técnico",
  "Analista",
  "Abogado",
  "Director",
  "Médico",
];
