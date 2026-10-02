/**
 * El Banco Central por dentro: su tasa de política monetaria, lo que cobran y
 * pagan los bancos, su balance y lo que hace cada día con la liquidez.
 *
 * Sin credenciales: la API del BCRD exige clave
 * (docs/INFRAESTRUCTURA.md §5.11). Esto lee **archivos públicos del CDN** del BCRD,
 * el mismo camino de `lib/tasa.ts` y `lib/macro.ts`. Nombres tomados del
 * paquete R abierto `databcrd`, y cada archivo verificado el 2026-10-02 con
 * una respuesta real (200, `application/octet-stream`, `PK`) en
 * docs/INFRAESTRUCTURA.md §5.3:
 *
 *   sector-monetario-y-financiero/documents/Serie_TPM.xlsx (37 KB)
 *     Hoja «Tasas»: Año (solo en enero) | Mes («Ene») | TPM | Facilidad de
 *     depósito | de préstamo | Lombarda, **en fracción** (0.055 = 5.50 %),
 *     desde 2004. Desde febrero de 2013 la TPM es indicativa y las
 *     facilidades son la TPM ± un margen (nota 1 del archivo): antes era otro
 *     instrumento, así que la serie que se pinta empieza ahí.
 *   …/tbm_activad.xlsx y …/tbm_pasivad.xlsx (40 y 150 KB)
 *     Tasas de los bancos múltiples en pesos, % nominal anual, desde 2017: una
 *     fila resumen por año («2025», «*2026 1/»), los meses (el año solo en
 *     enero, «Enero 2026»), el mes en curso marcado «*Septiembre 2/» seguido
 *     de filas diarias («1», «2»…), que no son meses. Las columnas se leen por
 *     posición y se comprueban contra su rótulo; si el BCRD las mueve, el
 *     indicador cae a `null` en vez de leer otra columna. La pasiva trae
 *     además la tasa **interbancaria** (columna O).
 *   …/serie_indicadores_bcrd.xlsx (217 KB)
 *     Balance armonizado del BCRD, formato ancho: fila «INDICADORES BANCO
 *     CENTRAL» con un mes por columna desde enero de 1996 (serie de Excel
 *     hasta 2012, luego texto «abr-13», «sept.-25», «ago.-26*») y una última
 *     columna **parcial** («25-sept.-26*»: el saldo de ese día). Millones de
 *     RD$, salvo reservas (millones de US$). «n.d.» = sin dato.
 *   …/operaciones_monetarias.xlsx (401 KB)
 *     Operaciones diarias de contracción (depósitos remunerados de corto
 *     plazo y letras a un día) y de expansión (repos), en millones de RD$.
 *     Mensual hasta 2013, diario después, con la fecha escrita a mano
 *     («15-septiembre-26», «1-mayo-15», «06-noviembre-18.», «30-sept…-26*»)
 *     y algún día como serie de Excel. Se leen los últimos 90 días hábiles.
 *
 * Cada archivo se pide con la fecha del día como consulta (`delDiaBcrd` en
 * `lib/pedir.ts`): el CDN guarda copias por codificación que no renueva a la
 * vez, y la de `gzip` —la que pide Node— llegó a ir un mes atrás.
 *
 * Cada pieza se degrada sola a `null`: un archivo caído no tumba a las demás.
 * El resultado de cada lectura —no solo la descarga— se guarda con
 * `unstable_cache` (6 h para lo diario, 24 h para el balance), como
 * `lib/tasa.ts`. Solo servidor: lee con `lib/xlsx.ts`.
 */

import { unstable_cache } from "next/cache";
import { delDiaBcrd, pedirBytes } from "@/lib/pedir";
import { leerHoja, type Hoja } from "@/lib/xlsx";
import { MESES, numeroMes } from "@/lib/format";

const BASE = "https://cdn.bancentral.gov.do/documents/estadisticas/sector-monetario-y-financiero/documents";
export const URL_TPM = `${BASE}/Serie_TPM.xlsx`;
export const URL_ACTIVAS = `${BASE}/tbm_activad.xlsx`;
export const URL_PASIVAS = `${BASE}/tbm_pasivad.xlsx`;
export const URL_INDICADORES_BCRD = `${BASE}/serie_indicadores_bcrd.xlsx`;
export const URL_OPERACIONES = `${BASE}/operaciones_monetarias.xlsx`;
const USER_AGENT = "Socratico-Inteligencia/1.0 (banco central y tasas; herramienta independiente)";

/** «2026-08». */
export type Periodo = string;

export interface PuntoMes {
  periodo: Periodo;
  valor: number;
}

const clave = (anio: number, mes: number): Periodo => `${anio}-${String(mes).padStart(2, "0")}`;
const numero = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const redondear = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
const EXCEL_0 = Date.UTC(1899, 11, 30);
const deSerie = (n: number) => new Date(EXCEL_0 + Math.round(n) * 86_400_000);

/** «2026-08» → «agosto 2026». */
export function mesLargo(p: Periodo): string {
  const [a, m] = p.split("-").map(Number);
  return `${MESES[m - 1]} ${a}`;
}

function bajar(url: string): Promise<ArrayBuffer | null> {
  return pedirBytes(delDiaBcrd(url), {
    fuente: "banco-central",
    ua: USER_AGENT,
    tipo: /octet-stream|spreadsheetml|excel/i,
    // La ventana la cuenta `unstable_cache` sobre el resultado.
    cache: "no-store",
    firma: "zip",
  });
}

/** Error que no se guarda en la caché: un fallo no se sirve horas enteras. */
class SinDato extends Error {}

async function hojaDe(url: string): Promise<Hoja> {
  const buf = await bajar(url);
  if (!buf) throw new SinDato(`${url}: el CDN no entregó el archivo`);
  const hoja = leerHoja(buf);
  if (!hoja) throw new SinDato(`${url}: la hoja no se pudo leer`);
  return hoja;
}

function envolver<T>(nombre: string, leer: () => Promise<T>, revalidate: number): () => Promise<T | null> {
  const enCache = unstable_cache(leer, [`banco-central-${nombre}-v2`], { revalidate });
  return async () => {
    try {
      return await enCache();
    } catch (err) {
      console.error(`[banco-central] ${nombre}: ${String(err)}`);
      return null;
    }
  };
}

// ── Tasa de política monetaria ──────────────────────────────────────────────

export interface PoliticaMonetaria {
  /** Desde febrero de 2013, cuando la TPM pasó a ser la tasa indicativa. */
  serie: PuntoMes[];
  vigente: { periodo: Periodo; tpm: number; deposito: number | null; prestamo: number | null };
  /** Cada mes en que la TPM cambió, del más reciente al más viejo. */
  cambios: { periodo: Periodo; antes: number; despues: number }[];
  fuente: string;
}

/** Primer mes con la TPM como tasa indicativa (nota 1 del archivo). */
export const INICIO_TPM: Periodo = "2013-02";

export function parsearTpm(h: Hoja): PoliticaMonetaria | null {
  // Comprobación de columnas por su rótulo, en las filas de cabecera.
  const cabecera = [...h.values()].slice(0, 8);
  const tiene = (col: string, re: RegExp) => cabecera.some((f) => re.test((f.get(col) ?? "").trim()));
  if (!tiene("C", /pol[ií]tica monetaria/i) || !tiene("D", /^dep[oó]sito/i) || !tiene("E", /^pr[eé]stamo/i)) {
    return null;
  }
  const filas: { periodo: Periodo; tpm: number; deposito: number | null; prestamo: number | null }[] = [];
  let anio = 0;
  for (const [, f] of h) {
    const a = numero(f.get("A"));
    if (a && a > 1990 && a < 2100) anio = a;
    // «Feb1»: un superíndice de nota pegado al mes.
    const mes = numeroMes((f.get("B") ?? "").replace(/\d+$/, ""), { abreviado: true });
    const tpm = numero(f.get("C"));
    if (!anio || !mes || tpm === null) continue;
    const pct = (v: number | null) => (v === null ? null : redondear(v * 100, 2));
    filas.push({ periodo: clave(anio, mes), tpm: pct(tpm)!, deposito: pct(numero(f.get("D"))), prestamo: pct(numero(f.get("E"))) });
  }
  const desde = filas.filter((f) => f.periodo >= INICIO_TPM);
  const ultimo = desde.at(-1);
  if (!ultimo || ultimo.tpm <= 0 || ultimo.tpm > 30) return null;
  const cambios: PoliticaMonetaria["cambios"] = [];
  for (let i = 1; i < desde.length; i++) {
    if (Math.abs(desde[i].tpm - desde[i - 1].tpm) > 0.001) {
      cambios.push({ periodo: desde[i].periodo, antes: desde[i - 1].tpm, despues: desde[i].tpm });
    }
  }
  return {
    serie: desde.map((f) => ({ periodo: f.periodo, valor: f.tpm })),
    vigente: ultimo,
    cambios: cambios.reverse(),
    fuente: URL_TPM,
  };
}

// ── Tasas de los bancos múltiples ───────────────────────────────────────────

export type ClaveActiva = "ponderado" | "comercio" | "consumo" | "hipotecario" | "preferencial";
export type ClavePasiva = "ponderado" | "ahorros" | "a30" | "a90" | "a360" | "a2anios" | "a5anios" | "interbancaria";

/** Columna y el rótulo que tiene que llevar en la cabecera. */
const COLUMNAS_ACTIVAS: Record<ClaveActiva, [string, RegExp]> = {
  ponderado: ["I", /^ponderado$/i],
  comercio: ["J", /^comercio$/i],
  consumo: ["K", /^consumo/i],
  hipotecario: ["L", /^hipotecario/i],
  preferencial: ["M", /^preferencial promedio ponderad/i],
};

const COLUMNAS_PASIVAS: Record<ClavePasiva, [string, RegExp]> = {
  a30: ["B", /^0 a 30 d/i],
  a90: ["D", /^61 a 90 d/i],
  a360: ["F", /^181 a 360 d/i],
  a2anios: ["G", /^361 d[ií]as a 2 a/i],
  a5anios: ["H", /^2 a 5 a/i],
  ponderado: ["K", /^ponderado$/i],
  ahorros: ["L", /^dep[oó]sitos de ahorro/i],
  interbancaria: ["O", /^interbancari/i],
};

export interface MesTasas<K extends string> {
  periodo: Periodo;
  valores: Partial<Record<K, number>>;
  preliminar: boolean;
}

export interface SerieTasas<K extends string> {
  /** Meses cerrados, en orden. */
  meses: MesTasas<K>[];
  /** El mes en curso: promedio de los días transcurridos. */
  parcial: (MesTasas<K> & { hastaElDia: number | null }) | null;
  fuente: string;
}

export function parsearTasas<K extends string>(
  h: Hoja,
  columnas: Record<K, [string, RegExp]>,
  fuente: string,
): SerieTasas<K> | null {
  const cabecera = [...h.values()].slice(0, 8);
  for (const [col, re] of Object.values(columnas) as [string, RegExp][]) {
    if (!cabecera.some((f) => re.test((f.get(col) ?? "").trim()))) {
      console.error(`[banco-central] ${fuente}: la columna ${col} ya no dice ${re}`);
      return null;
    }
  }
  const meses = new Map<Periodo, MesTasas<K> & { enCurso: boolean }>();
  let anio = 0;
  let anioPreliminar = false;
  let ultimo: (MesTasas<K> & { enCurso: boolean }) | null = null;
  let hastaElDia: number | null = null;
  for (const [, f] of h) {
    const a = (f.get("A") ?? "").trim();
    const resumen = /^\*?\s*(\d{4})(\s+\d\/)?$/.exec(a);
    if (resumen) {
      anio = Number(resumen[1]);
      anioPreliminar = a.startsWith("*");
      ultimo = null;
      continue;
    }
    if (/^\d{1,2}$/.test(a)) {
      if (ultimo?.enCurso) hastaElDia = Number(a);
      continue;
    }
    const mes = numeroMes(a);
    if (!mes) continue;
    const conAnio = /(\d{4})/.exec(a);
    if (conAnio) anio = Number(conAnio[1]);
    if (!anio) continue;
    const valores: Partial<Record<K, number>> = {};
    for (const [k, [col]] of Object.entries(columnas) as [K, [string, RegExp]][]) {
      const v = numero(f.get(col));
      if (v !== null && v > 0 && v < 60) valores[k] = redondear(v, 2);
    }
    if (Object.keys(valores).length === 0) continue; // «Enero 2022» vacío: gana el que trae valor
    const registro = {
      periodo: clave(anio, mes),
      valores,
      preliminar: a.startsWith("*") || anioPreliminar,
      enCurso: /2\/\s*$/.test(a),
    };
    meses.set(registro.periodo, registro);
    ultimo = registro;
  }
  const orden = [...meses.values()].sort((x, y) => x.periodo.localeCompare(y.periodo));
  const cerrados = orden.filter((m) => !m.enCurso).map(({ enCurso: _, ...m }) => m);
  if (cerrados.length === 0) return null;
  const enCurso = orden.filter((m) => m.enCurso).at(-1);
  const parcial =
    enCurso && enCurso.periodo > cerrados.at(-1)!.periodo
      ? { periodo: enCurso.periodo, valores: enCurso.valores, preliminar: enCurso.preliminar, hastaElDia }
      : null;
  return { meses: cerrados, parcial, fuente };
}

// ── Balance del Banco Central ───────────────────────────────────────────────

export type ClaveBalance =
  | "reservasBrutas"
  | "activosGobierno"
  | "valoresEnCirculacion"
  | "depositosRemunerados"
  | "baseRestringida"
  | "billetesEmitidos"
  | "encajeMN"
  | "billetesPublico"
  | "m1"
  | "m2";

/** El rótulo de cada fila en la columna A. Si cambia, esa serie no se lee. */
const FILAS_BALANCE: Record<ClaveBalance, RegExp> = {
  reservasBrutas: /^RESERVAS INTERNACIONALES BRUTAS/i,
  activosGobierno: /^Activos frente al Gobierno Central/i,
  valoresEnCirculacion: /^VALORES EN CIRCULACI[OÓ]N/i,
  depositosRemunerados: /^DEP[OÓ]SITOS REMUNERADOS DE CORTO PLAZO$/i,
  baseRestringida: /^BASE MONETARIA RESTRINGIDA/i,
  billetesEmitidos: /^Billetes y Monedas Emitidos/i,
  encajeMN: /^Dep[oó]sitos Encaje Legal y Saldos de Compensaci[oó]n de OSD en BC \(MN\)/i,
  billetesPublico: /^Billetes y monedas en poder del p[uú]blico/i,
  m1: /^MEDIO CIRCULANTE \(M1\)/i,
  m2: /^OFERTA MONETARIA AMPLIADA \(M2\)/i,
};

export interface SerieBalance {
  /** Meses cerrados (o preliminares), en orden. */
  meses: PuntoMes[];
  /** El saldo del último día publicado del mes en curso, si la hoja lo trae. */
  dia: { fecha: string; valor: number } | null;
}

export interface BalanceBcrd {
  series: Partial<Record<ClaveBalance, SerieBalance>>;
  /** Meses marcados «*» por el BCRD: preliminares. */
  preliminares: Periodo[];
  fuente: string;
}

const MES_ABREV: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, set: 9, oct: 10, nov: 11, dic: 12,
};

/** Una cabecera de columna: serie de Excel, «sept.-25», «ago.-26*» o «25-sept.-26*». */
function columnaBalance(v: string): { periodo: Periodo; dia: number | null; preliminar: boolean } | null {
  const n = numero(v);
  if (n !== null && n > 30_000 && n < 80_000) {
    const d = deSerie(n);
    return { periodo: clave(d.getUTCFullYear(), d.getUTCMonth() + 1), dia: null, preliminar: false };
  }
  const m = /^\s*(?:(\d{1,2})-)?([a-z]+)\.?-(\d{2})(\*)?\s*$/i.exec(v);
  const mes = m ? MES_ABREV[m[2].toLowerCase()] : undefined;
  if (!m || !mes) return null;
  return { periodo: clave(2000 + Number(m[3]), mes), dia: m[1] ? Number(m[1]) : null, preliminar: Boolean(m[4]) };
}

export function parsearBalance(h: Hoja): BalanceBcrd | null {
  const cab = [...h].find(([, f]) => /^INDICADORES BANCO CENTRAL$/i.test((f.get("A") ?? "").trim()));
  if (!cab) return null;
  const columnas = new Map<string, NonNullable<ReturnType<typeof columnaBalance>>>();
  for (const [col, v] of cab[1]) {
    if (col === "A") continue;
    const c = columnaBalance(v);
    if (c) columnas.set(col, c);
  }
  if (columnas.size < 100) return null;
  const series: BalanceBcrd["series"] = {};
  const vistas = new Set<ClaveBalance>();
  for (const [n, f] of h) {
    if (n <= cab[0]) continue;
    const etiqueta = (f.get("A") ?? "").trim();
    const k = (Object.keys(FILAS_BALANCE) as ClaveBalance[]).find((c) => !vistas.has(c) && FILAS_BALANCE[c].test(etiqueta));
    if (!k) continue;
    vistas.add(k); // la primera aparición: «Base Monetaria Restringida» se repite dentro de la ampliada
    const meses: PuntoMes[] = [];
    let dia: SerieBalance["dia"] = null;
    for (const [col, c] of columnas) {
      const v = numero(f.get(col));
      if (v === null) continue;
      if (c.dia !== null) dia = { fecha: `${c.periodo}-${String(c.dia).padStart(2, "0")}`, valor: redondear(v, 1) };
      else meses.push({ periodo: c.periodo, valor: redondear(v, 1) });
    }
    meses.sort((a, b) => a.periodo.localeCompare(b.periodo));
    if (meses.length) series[k] = { meses, dia };
  }
  if (!series.valoresEnCirculacion || !series.reservasBrutas) return null;
  const preliminares = [...columnas.values()].filter((c) => c.preliminar && c.dia === null).map((c) => c.periodo);
  return { series, preliminares, fuente: URL_INDICADORES_BCRD };
}

// ── Operaciones monetarias diarias ──────────────────────────────────────────

export interface DiaOperaciones {
  /** AAAA-MM-DD. */
  fecha: string;
  /** Millones de RD$: depósitos remunerados de corto plazo (ventanilla). */
  depositos: number;
  /** Millones de RD$: letras a un día (subasta). */
  letras: number;
  contraccion: number;
  /** Millones de RD$: repos (ventanilla y subasta). */
  expansion: number;
  preliminar: boolean;
}

export interface OperacionesMonetarias {
  /** Los últimos días hábiles publicados, en orden. */
  dias: DiaOperaciones[];
  fuente: string;
}

const DIAS_OPERACIONES = 90;

function fechaOperacion(v: string): { fecha: string; preliminar: boolean } | null {
  const n = numero(v);
  if (n !== null) {
    if (n < 30_000 || n > 80_000) return null;
    const d = deSerie(n);
    return { fecha: d.toISOString().slice(0, 10), preliminar: false };
  }
  const m = /^\s*(\d{1,2})-\s*([a-záéíóú]+)\.?-(\d{2})\s*([*.]?)\s*$/i.exec(v);
  if (!m) return null;
  const mes = numeroMes(m[2], { abreviado: true });
  if (!mes) return null;
  return { fecha: `20${m[3]}-${String(mes).padStart(2, "0")}-${m[1].padStart(2, "0")}`, preliminar: m[4] === "*" };
}

export function parsearOperaciones(h: Hoja): OperacionesMonetarias | null {
  const cab = [...h].find(([, f]) => /^Ventanilla Directa de Dep[oó]sitos/i.test((f.get("B") ?? "").trim()));
  if (!cab || !/Letras/i.test(cab[1].get("C") ?? "") || !/Expansi[oó]n/i.test(cab[1].get("G") ?? "")) return null;
  const dias = new Map<string, DiaOperaciones>();
  for (const [n, f] of h) {
    if (n <= cab[0]) continue;
    const a = (f.get("A") ?? "").trim();
    // Solo días escritos: los meses de la serie vieja son el día 1 y los
    // cierres de año el 31, como serie de Excel, y no son operaciones de un día.
    if (!/[a-z]/i.test(a) && !(numero(a) !== null && deSerie(numero(a)!).getUTCDate() > 1)) continue;
    const fecha = fechaOperacion(a);
    const contraccion = numero(f.get("D"));
    if (!fecha || contraccion === null) continue;
    dias.set(fecha.fecha, {
      fecha: fecha.fecha,
      depositos: redondear(numero(f.get("B")) ?? 0, 1),
      letras: redondear(numero(f.get("C")) ?? 0, 1),
      contraccion: redondear(contraccion, 1),
      expansion: redondear(numero(f.get("G")) ?? 0, 1),
      preliminar: fecha.preliminar,
    });
  }
  const orden = [...dias.values()].sort((x, y) => x.fecha.localeCompare(y.fecha)).slice(-DIAS_OPERACIONES);
  return orden.length ? { dias: orden, fuente: URL_OPERACIONES } : null;
}

// ── Composición ─────────────────────────────────────────────────────────────

const SEIS_HORAS = 21_600;
const UN_DIA = 86_400;

export const getPoliticaMonetaria = envolver(
  "tpm",
  async () => parsearTpm(await hojaDe(URL_TPM)) ?? Promise.reject(new SinDato("TPM ilegible")),
  SEIS_HORAS,
);

export const getTasasActivas = envolver(
  "activas",
  async () =>
    parsearTasas(await hojaDe(URL_ACTIVAS), COLUMNAS_ACTIVAS, URL_ACTIVAS) ??
    Promise.reject(new SinDato("tasas activas ilegibles")),
  SEIS_HORAS,
);

export const getTasasPasivas = envolver(
  "pasivas",
  async () =>
    parsearTasas(await hojaDe(URL_PASIVAS), COLUMNAS_PASIVAS, URL_PASIVAS) ??
    Promise.reject(new SinDato("tasas pasivas ilegibles")),
  SEIS_HORAS,
);

export const getBalanceBcrd = envolver(
  "balance",
  async () => parsearBalance(await hojaDe(URL_INDICADORES_BCRD)) ?? Promise.reject(new SinDato("balance ilegible")),
  UN_DIA,
);

export const getOperacionesMonetarias = envolver(
  "operaciones",
  async () =>
    parsearOperaciones(await hojaDe(URL_OPERACIONES)) ?? Promise.reject(new SinDato("operaciones ilegibles")),
  SEIS_HORAS,
);

/** El último valor de una clave en una serie de tasas, con su mes. */
export function ultimaTasa<K extends string>(s: SerieTasas<K> | null, k: K): PuntoMes | null {
  if (!s) return null;
  for (let i = s.meses.length - 1; i >= 0; i--) {
    const v = s.meses[i].valores[k];
    if (v !== undefined) return { periodo: s.meses[i].periodo, valor: v };
  }
  return null;
}

/** La serie de una clave, en orden. */
export function serieTasa<K extends string>(s: SerieTasas<K>, k: K): PuntoMes[] {
  return s.meses.flatMap((m) => (m.valores[k] !== undefined ? [{ periodo: m.periodo, valor: m.valores[k]! }] : []));
}

/** El valor de una serie mensual en un período, o el más cercano anterior. */
export function valorEn(serie: PuntoMes[], periodo: Periodo): PuntoMes | null {
  let mejor: PuntoMes | null = null;
  for (const p of serie) if (p.periodo <= periodo) mejor = p;
  return mejor;
}
