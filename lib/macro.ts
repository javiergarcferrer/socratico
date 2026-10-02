/**
 * Indicadores macro del Banco Central: remesas, reservas internacionales y
 * tasa de interés activa de los bancos múltiples.
 *
 * Sin credenciales: la API del BCRD exige clave
 * (docs/INFRAESTRUCTURA.md §5.11). Esto lee los **archivos públicos del CDN** del
 * BCRD, verificados el 2026-09-24 (docs/INFRAESTRUCTURA.md §5.4), el mismo camino que `lib/tasa.ts`:
 *
 *   https://cdn.bancentral.gov.do/documents/estadisticas/sector-externo/documents/Remesas_6.xlsx
 *   → 200 `application/octet-stream`, ~18 KB, `PK`. Hoja «Total», formato
 *     ancho: la fila de «PERIODOS» lleva los años en columnas (`2010` … `2026`,
 *     con `2024*` marcado), una fila por mes y la fila TOTAL.
 *     **Ojo**: el título dice «MILLONES DE US$», pero las celdas están en
 *     dólares (agosto 2026 = 1,116,267,570.98). Se convierte a millones si el
 *     valor pasa de 100,000; si el BCRD corrige la hoja, sigue sirviendo. La
 *     nota «2024-2026 : Cifras Preliminares» se lee del archivo, no se supone.
 *
 *   https://cdn.bancentral.gov.do/documents/estadisticas/sector-externo/documents/reservas_internacionales.xlsx
 *   → 200 `…spreadsheetml.sheet`, ~52 KB. Hoja «Reservas Mensuales», en
 *     millones de US$ (aquí sí es cierto). Fila «Año» con un año por bloque
 *     desde 1985; **el número de columnas por año cambia** (BRUTAS/NETAS en los
 *     años viejos; ACTIVOS BRUTOS / RESERVAS BRUTAS 1/ / NETAS 2/ desde 2003).
 *     Cada año se resuelve por su etiqueta y la columna por la subetiqueta
 *     «BRUTAS» (femenino: «BRUTOS» son los activos, que no son reservas).
 *
 *   https://cdn.bancentral.gov.do/documents/estadisticas/sector-monetario-y-financiero/documents/tbm_activad.xlsx
 *   → 200 `…spreadsheetml.sheet`, ~40 KB. Hoja «Activas»; columna I = promedio
 *     ponderado (% nominal anual). Trampas: el año solo va en la fila de enero
 *     («Enero 2026») y se propaga; hay una fila resumen por año («2025»,
 *     «*2026 1/»); **«Enero 2022» aparece dos veces** (la primera vacía, se
 *     queda la que tiene valor); el mes en curso va marcado «*Septiembre 2/»
 *     (promedio de los días transcurridos) seguido de **filas diarias**
 *     (`1`, `2`, … `21`) que no son meses y se saltan. El mes en curso no se
 *     presenta como mes cerrado: va aparte, en `parcial`. «*» = preliminar.
 *
 * Cada indicador se degrada solo a `null`: un archivo caído no tumba a los
 * otros dos. Nunca se fabrica una comparación que el archivo no trae.
 *
 * Serie mensual, caché diaria (tasas: 6 h, porque traen filas diarias). Solo
 * servidor: lee con `lib/xlsx.ts`.
 */

import { delDiaBcrd, pedirBytes } from "@/lib/pedir";
import { indiceColumna, leerHoja as leerXlsx, type Hoja } from "@/lib/xlsx";
import { MESES, numeroMes } from "@/lib/format";

const BASE = "https://cdn.bancentral.gov.do/documents/estadisticas";
export const URL_REMESAS = `${BASE}/sector-externo/documents/Remesas_6.xlsx`;
export const URL_RESERVAS = `${BASE}/sector-externo/documents/reservas_internacionales.xlsx`;
export const URL_TASA_ACTIVA = `${BASE}/sector-monetario-y-financiero/documents/tbm_activad.xlsx`;
const USER_AGENT = "Socratico-Inteligencia/1.0 (indicadores macro del BCRD; herramienta independiente)";

export interface Indicador {
  /** Mes al que corresponde la cifra, en palabras: «agosto 2026». */
  periodo: string;
  valor: number;
  /** «millones de US$», «% nominal anual». */
  unidad: string;
  /** Remesas y reservas: el mismo mes del año anterior. Tasa: el mes anterior. */
  comparacion: { periodo: string; valor: number } | null;
  /** El archivo marca la cifra como preliminar. */
  preliminar: boolean;
  /** Solo la tasa: el mes en curso, promedio de los días transcurridos. */
  parcial: { periodo: string; valor: number; hastaElDia: number | null } | null;
  fuente: string;
}

export interface Macro {
  remesas: Indicador | null;
  reservas: Indicador | null;
  tasaActiva: Indicador | null;
}

const periodo = (anio: number, mes: number) => `${MESES[mes - 1]} ${anio}`;

function bajar(url: string, revalidate: number): Promise<ArrayBuffer | null> {
  return pedirBytes(delDiaBcrd(url), {
    fuente: "macro",
    ua: USER_AGENT,
    tipo: /octet-stream|spreadsheetml|excel/i,
    revalidate,
    firma: "zip",
  });
}


const numero = (v: string | undefined) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? n : null;
};

/** La fila cuyo texto en A empieza por `etiqueta`, y la columna de cada año en ella. */
function filaDeAnios(h: Hoja, etiqueta: RegExp): { fila: number; anios: Map<number, string> } | null {
  for (const [n, celdas] of h) {
    if (!etiqueta.test((celdas.get("A") ?? "").trim())) continue;
    const anios = new Map<number, string>();
    for (const [col, v] of celdas) {
      const m = /^\s*(\d{4})\b/.exec(v);
      if (col !== "A" && m) anios.set(Number(m[1]), col);
    }
    if (anios.size > 0) return { fila: n, anios };
  }
  return null;
}

/** Las filas de meses (A = nombre del mes) por debajo de `desde`. */
function filasDeMes(h: Hoja, desde: number): Map<number, number> {
  const meses = new Map<number, number>();
  for (const [n, celdas] of h) {
    if (n <= desde) continue;
    const mes = numeroMes(celdas.get("A") ?? "");
    if (mes && !meses.has(mes)) meses.set(mes, n);
  }
  return meses;
}

/** Último mes con dato de la columna del último año, y el mismo mes un año antes. */
function ultimoYAnioAnterior(
  h: Hoja,
  anios: Map<number, string>,
  columnaDe: (anio: number) => string | null,
  meses: Map<number, number>,
  escala: (v: number) => number,
): { anio: number; mes: number; valor: number; anterior: number | null } | null {
  const ordenados = [...anios.keys()].sort((a, b) => b - a);
  for (const anio of ordenados) {
    const col = columnaDe(anio);
    if (!col) continue;
    for (let mes = 12; mes >= 1; mes--) {
      const fila = meses.get(mes);
      const v = fila ? numero(h.get(fila)?.get(col)) : null;
      if (v === null) continue;
      const colAnt = columnaDe(anio - 1);
      const ant = colAnt && fila ? numero(h.get(fila)?.get(colAnt)) : null;
      return { anio, mes, valor: escala(v), anterior: ant === null ? null : escala(ant) };
    }
  }
  return null;
}

const redondear = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

// ── Remesas ─────────────────────────────────────────────────────────────────

export function parsearRemesas(h: Hoja): Indicador | null {
  const cab = filaDeAnios(h, /^PERIODOS?$/i);
  if (!cab) return null;
  const meses = filasDeMes(h, cab.fila);
  // El título dice millones, las celdas traen dólares: se detecta por magnitud.
  const aMillones = (v: number) => (Math.abs(v) > 100_000 ? v / 1_000_000 : v);
  const r = ultimoYAnioAnterior(h, cab.anios, (a) => cab.anios.get(a) ?? null, meses, aMillones);
  if (!r) return null;
  // Preliminar: la columna lleva «*» o la nota «AAAA-AAAA : Cifras Preliminares» cubre el año.
  let preliminar = /\*/.test(h.get(cab.fila)?.get(cab.anios.get(r.anio)!) ?? "");
  for (const celdas of h.values()) {
    const m = /(\d{4})\s*-\s*(\d{4})\s*:?\s*Cifras\s+Preliminares/i.exec(celdas.get("A") ?? "");
    if (m && r.anio >= Number(m[1]) && r.anio <= Number(m[2])) preliminar = true;
  }
  return {
    periodo: periodo(r.anio, r.mes),
    valor: redondear(r.valor, 1),
    unidad: "millones de US$",
    comparacion: r.anterior === null ? null : { periodo: periodo(r.anio - 1, r.mes), valor: redondear(r.anterior, 1) },
    preliminar,
    parcial: null,
    fuente: URL_REMESAS,
  };
}

// ── Reservas internacionales ────────────────────────────────────────────────

export function parsearReservas(h: Hoja): Indicador | null {
  const cab = filaDeAnios(h, /^A[ñn]o$/i);
  if (!cab) return null;
  // Las subetiquetas (BRUTAS / NETAS / BRUTOS) van en alguna de las dos filas siguientes.
  const sub = new Map<string, string>();
  for (const f of [cab.fila + 1, cab.fila + 2]) {
    for (const [col, v] of h.get(f) ?? []) if (/^BRUTAS\b/i.test(v.trim())) sub.set(col, v);
  }
  const inicios = [...cab.anios.entries()].sort((a, b) => indiceColumna(a[1]) - indiceColumna(b[1]));
  const columnaDe = (anio: number): string | null => {
    const i = inicios.findIndex(([a]) => a === anio);
    if (i < 0) return null;
    const desde = indiceColumna(inicios[i][1]);
    const hasta = i + 1 < inicios.length ? indiceColumna(inicios[i + 1][1]) : Infinity;
    for (const col of sub.keys()) {
      const c = indiceColumna(col);
      if (c >= desde && c < hasta) return col;
    }
    return null;
  };
  const meses = filasDeMes(h, cab.fila);
  const r = ultimoYAnioAnterior(h, cab.anios, columnaDe, meses, (v) => v);
  if (!r) return null;
  return {
    periodo: periodo(r.anio, r.mes),
    valor: redondear(r.valor, 1),
    unidad: "millones de US$",
    comparacion: r.anterior === null ? null : { periodo: periodo(r.anio - 1, r.mes), valor: redondear(r.anterior, 1) },
    // La hoja no marca preliminares: no se dice que lo son.
    preliminar: false,
    parcial: null,
    fuente: URL_RESERVAS,
  };
}

// ── Tasa de interés activa, bancos múltiples ────────────────────────────────

export function parsearTasaActiva(h: Hoja): Indicador | null {
  // La columna del promedio ponderado se busca por su etiqueta; I es la conocida.
  let col = "I";
  for (const celdas of [...h.values()].slice(0, 12)) {
    for (const [c, v] of celdas) if (/^ponderado$/i.test(v.trim())) col = c;
  }
  type Mes = { anio: number; mes: number; valor: number; preliminar: boolean; enCurso: boolean };
  const meses = new Map<string, Mes>();
  let parcialDia: number | null = null;
  let anio = 0;
  let anioPreliminar = false;
  let ultimoMesVisto: Mes | null = null;
  for (const n of [...h.keys()].sort((a, b) => a - b)) {
    const a = (h.get(n)?.get("A") ?? "").trim();
    const v = numero(h.get(n)?.get(col));
    // Fila resumen del año: «2025», «*2026 1/» (un número de año, no un día).
    const resumen = /^\*?\s*(\d{4})(\s+\d\/)?$/.exec(a);
    if (resumen) {
      anio = Number(resumen[1]);
      anioPreliminar = a.startsWith("*");
      ultimoMesVisto = null;
      continue;
    }
    // Fila diaria del mes en curso: «1» … «31».
    if (/^\d{1,2}$/.test(a)) {
      if (ultimoMesVisto?.enCurso && v !== null) parcialDia = Number(a);
      continue;
    }
    const mes = numeroMes(a);
    if (!mes) continue;
    const conAnio = /(\d{4})/.exec(a);
    if (conAnio) anio = Number(conAnio[1]);
    if (!anio || v === null) continue; // «Enero 2022» vacío: gana el que trae valor
    const registro: Mes = {
      anio,
      mes,
      valor: v,
      preliminar: a.startsWith("*") || anioPreliminar,
      // «2/»: promedio de los días transcurridos del mes, no un mes cerrado.
      enCurso: /2\/\s*$/.test(a),
    };
    meses.set(`${anio}-${String(mes).padStart(2, "0")}`, registro);
    ultimoMesVisto = registro;
  }
  const orden = [...meses.keys()].sort();
  const cerrados = orden.map((k) => meses.get(k)!).filter((m) => !m.enCurso);
  const ultimo = cerrados.at(-1);
  if (!ultimo) return null;
  const clave = (anio: number, mes: number) => `${anio}-${String(mes).padStart(2, "0")}`;
  const [aAnt, mAnt] = ultimo.mes === 1 ? [ultimo.anio - 1, 12] : [ultimo.anio, ultimo.mes - 1];
  const anterior = meses.get(clave(aAnt, mAnt));
  const enCurso = orden.map((k) => meses.get(k)!).filter((m) => m.enCurso).at(-1);
  const parcialValido = enCurso && clave(enCurso.anio, enCurso.mes) > clave(ultimo.anio, ultimo.mes);
  return {
    periodo: periodo(ultimo.anio, ultimo.mes),
    valor: redondear(ultimo.valor, 2),
    unidad: "% nominal anual",
    comparacion:
      anterior && !anterior.enCurso ? { periodo: periodo(aAnt, mAnt), valor: redondear(anterior.valor, 2) } : null,
    preliminar: ultimo.preliminar,
    parcial: parcialValido
      ? { periodo: periodo(enCurso.anio, enCurso.mes), valor: redondear(enCurso.valor, 2), hastaElDia: parcialDia }
      : null,
    fuente: URL_TASA_ACTIVA,
  };
}

// ── Composición ─────────────────────────────────────────────────────────────

async function leer(
  url: string,
  revalidate: number,
  parsear: (h: Hoja) => Indicador | null,
): Promise<Indicador | null> {
  const buf = await bajar(url, revalidate);
  if (!buf) return null;
  try {
    const hoja = leerXlsx(buf);
    return hoja ? parsear(hoja) : null;
  } catch (err) {
    console.error(`[macro] parseo ${url}: ${String(err)}`);
    return null;
  }
}

/** Los tres indicadores; cada uno es `null` por su cuenta si su archivo no contesta. */
export async function getMacro(): Promise<Macro> {
  const [remesas, reservas, tasaActiva] = await Promise.all([
    leer(URL_REMESAS, 86_400, parsearRemesas),
    leer(URL_RESERVAS, 86_400, parsearReservas),
    leer(URL_TASA_ACTIVA, 21_600, parsearTasaActiva),
  ]);
  return { remesas, reservas, tasaActiva };
}
