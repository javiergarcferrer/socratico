/**
 * Deuda pública — Crédito Público (Ministerio de Hacienda).
 *
 * Mismo contrato que las demás capas: sin base de datos, lectura en vivo con
 * caché. La Dirección General de Crédito Público publica la evolución de la
 * deuda del Sector Público No Financiero (SPNF) como XLSX mensuales; esta
 * capa localiza el más reciente en el listado y lee el saldo con el lector de
 * hojas de la casa (`lib/xlsx.ts`): solo necesitamos tres celdas.
 * La serie en el tiempo (`getSerieDeuda`) sale de la instantánea que arma
 * `scripts/build-deuda.py` recorriendo el listado de cada año.
 *
 * Reconocimiento en docs/INFRAESTRUCTURA.md §5.3 y docs/INFRAESTRUCTURA.md §10.
 */

// Módulo SOLO de servidor (usa node:fs): no importarlo desde componentes
// cliente — webpack en Next 15 lo rechaza (lección de lib/nomina).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { decodeHTML } from "entities";
import { pedirBytes, pedirTexto } from "@/lib/pedir";
import { filasDe, leerHoja, type Hoja } from "@/lib/xlsx";
import { MESES_CORTOS, mayuscula, numeroMes } from "@/lib/format";

const BASE = "https://www.creditopublico.gob.do";
const PAGINA = `${BASE}/inicio/estadisticas`;

const USER_AGENT =
  "Socratico-Inteligencia/1.0 (monitoreo de deuda pública; herramienta independiente)";

export interface Deuda {
  /** Saldo de la deuda pública total del SPNF, en millones de US$. */
  saldoTotal: number;
  saldoExterna: number;
  saldoInterna: number;
  /** Etiqueta del período, p. ej. "Jul-26" (de la fecha de cierre). */
  periodo: string;
  /** Fecha de cierre del saldo (ISO), p. ej. "2026-07-31". */
  fecha?: string;
  /** URL del XLSX de origen. */
  fuente: string;
  /**
   * true cuando el dato viene de la instantánea commiteada
   * (`public/data/deuda.json`) porque el origen no respondió: el servidor de
   * Crédito Público es on-premise en RD y rechaza el egreso de la nube.
   * Regenerar con `python3 scripts/build-deuda.py`.
   */
  desdeInstantanea: boolean;
  /** Fecha de generación de la instantánea (solo cuando desdeInstantanea). */
  generadoEn?: string;
}

/** El contrato de la casa (`lib/pedir.ts`). El origen devuelve **200 con una
 * página HTML** para cualquier ruta que no existe, así que un XLSX que no es
 * XLSX se descarta ahí por su tipo y su firma y no llega al lector. */
const PEDIDO = { fuente: "deuda", ua: USER_AGENT, revalidate: 21_600 } as const;

function texto(xml: string, re: RegExp): string[] {
  return [...xml.matchAll(re)].map((m) => m[1]);
}

/** Serie de Excel (días desde 1899-12-30) → ISO, o `null` si no es una fecha. */
function fechaExcel(v: string | undefined): string | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 30000 || n > 60000) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.trunc(n) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}


/** «2026-07-31» → «Jul-26», la misma etiqueta que usa la hoja del origen. */
export function periodoDeFecha(iso: string): string {
  const [a, m] = iso.split("-");
  return `${mayuscula(MESES_CORTOS[Number(m) - 1] ?? "")}-${a.slice(2)}`;
}

/**
 * Lee el saldo **de cierre** de la hoja de saldo-evolución.
 *
 * La hoja trae dos columnas «Saldo»: la de apertura (31 de diciembre del año
 * anterior) y la de cierre del período, cada una con su fecha como número de
 * serie de Excel en la fila de debajo. El saldo del período es la de fecha
 * mayor. Hasta el 2026-09-23 esta capa leía la primera —la columna C— y
 * publicaba como «Jul-26» el saldo del 31 de diciembre de 2025
 * (docs/INFRAESTRUCTURA.md §5.3). La etiqueta va en la columna B desde 2020 y en
 * la C antes; y las celdas de fórmula compartida (`<f t="shared" …/>`) traen
 * su valor calculado igual que las demás.
 */
export function parsearSaldo(
  hoja: Hoja,
): Omit<Deuda, "fuente" | "desdeInstantanea" | "generadoEn"> | null {
  const filas = filasDe(hoja).map(
    ({ celdas }) => new Map([...celdas].map(([col, v]) => [col, v.trim()] as const)),
  );

  // La cabecera con dos «Saldo» y, debajo, sus fechas.
  let col: string | null = null;
  let fecha: string | null = null;
  for (let k = 0; k < filas.length - 1; k++) {
    const cols = [...filas[k]].filter(([, v]) => /^Saldo\b/i.test(v)).map(([c]) => c);
    if (cols.length < 2) continue;
    for (const c of cols) {
      const f = fechaExcel(filas[k + 1].get(c));
      if (f && (!fecha || f > fecha)) {
        fecha = f;
        col = c;
      }
    }
    break;
  }
  if (!col || !fecha) return null;
  const columna = col;

  const valor = (etiqueta: RegExp): number | null => {
    const fila = filas.find((f) => etiqueta.test(f.get("B") || f.get("C") || ""));
    const n = Number(fila?.get(columna));
    return fila && Number.isFinite(n) ? n : null;
  };
  const saldoTotal = valor(/^Deuda\s+P[uú]blica\s+Total/i);
  if (!saldoTotal) return null;

  return {
    saldoTotal,
    saldoExterna: valor(/Deuda\s+Externa\s+Total/i) ?? 0,
    saldoInterna: valor(/Deuda\s+Interna\s+Total/i) ?? 0,
    periodo: periodoDeFecha(fecha),
    fecha,
  };
}

/* ------------------------------------------------------------- localizador */


/**
 * Saldo de deuda con doble vía: primero la lectura **en vivo** del XLSX más
 * reciente; si el origen no responde (rechaza el egreso de la nube), cae a la
 * **instantánea commiteada**, que declara su período y su fecha de generación.
 */
export async function getDeuda(): Promise<Deuda | null> {
  const vivo = await getDeudaEnVivo();
  if (vivo) return vivo;
  return leerInstantanea();
}

/** Un cierre de la serie: saldo al final de un mes, en millones de US$. */
export interface CierreDeuda {
  /** ISO, último día del período. */
  fecha: string;
  total: number;
  externa: number;
  interna: number;
  fuente?: string;
}

/** Cierre de un año del histórico, con su peso en la economía. */
export interface AnioDeuda {
  anio: number;
  total: number;
  externa: number;
  interna: number;
  /** Deuda ÷ PIB en por ciento, según el mismo archivo. */
  pctPib: number | null;
}

interface DeudaCruda {
  generadoEn: string;
  periodo: string;
  fecha?: string;
  saldoTotal: number;
  saldoExterna: number;
  saldoInterna: number;
  fuente: string;
  serie?: CierreDeuda[];
  anual?: AnioDeuda[];
}

async function leerCrudo(): Promise<DeudaCruda | null> {
  try {
    const ruta = path.join(process.cwd(), "public", "data", "deuda.json");
    const crudo = JSON.parse(await readFile(ruta, "utf8")) as DeudaCruda;
    return crudo?.saldoTotal && crudo.periodo ? crudo : null;
  } catch (err) {
    console.error(`[deuda] instantánea: ${String(err)}`);
    return null;
  }
}

async function leerInstantanea(): Promise<Deuda | null> {
  const crudo = await leerCrudo();
  if (!crudo) return null;
  return {
    saldoTotal: crudo.saldoTotal,
    saldoExterna: crudo.saldoExterna,
    saldoInterna: crudo.saldoInterna,
    periodo: crudo.periodo,
    fecha: crudo.fecha,
    fuente: crudo.fuente,
    generadoEn: crudo.generadoEn,
    desdeInstantanea: true,
  };
}

export interface SerieDeuda {
  /** El último saldo: en vivo si el origen respondió, si no la instantánea. */
  ultimo: Deuda;
  /**
   * Cierres trimestrales desde 2015 y los meses recientes del año en curso:
   * es lo que el origen **conserva** publicado (docs/INFRAESTRUCTURA.md §5.3). Si la
   * lectura en vivo trae un cierre posterior a la instantánea, va al final.
   */
  serie: CierreDeuda[];
  /** Cierre de cada año desde 2000, con % del PIB (histórico del origen). */
  anual: AnioDeuda[];
  /** Fecha de la instantánea de la que sale la serie. */
  generadoEn: string;
}

/**
 * La deuda en el tiempo. La serie sale siempre de la instantánea —rehacerla
 * en vivo son ~45 descargas, fuera de lo que un request puede esperar— y se
 * completa con el último saldo en vivo cuando el origen contesta.
 */
export async function getSerieDeuda(): Promise<SerieDeuda | null> {
  const [crudo, ultimo] = await Promise.all([leerCrudo(), getDeuda()]);
  if (!crudo || !ultimo) return null;
  const serie = [...(crudo.serie ?? [])];
  const cola = serie[serie.length - 1];
  if (!ultimo.desdeInstantanea && ultimo.fecha && (!cola || ultimo.fecha > cola.fecha)) {
    serie.push({
      fecha: ultimo.fecha,
      total: ultimo.saldoTotal,
      externa: ultimo.saldoExterna,
      interna: ultimo.saldoInterna,
      fuente: ultimo.fuente,
    });
  }
  return { ultimo, serie, anual: crudo.anual ?? [], generadoEn: crudo.generadoEn };
}

/**
 * Localiza y lee el XLSX de saldo más reciente. La página de estadísticas
 * enlaza los archivos del año en curso; tomamos el de «Saldo Evolución» del
 * mes más reciente. Si la página no responde, degradamos a `null`.
 */
async function getDeudaEnVivo(): Promise<Deuda | null> {
  const html = await pedirTexto(PAGINA, { ...PEDIDO, tipo: /text\/html/i });
  if (!html) return null;

  // Enlaces de "Saldo Evolución …", con entidades HTML decodificadas.
  const enlaces = texto(html, /href="(\/Content\/estadisticas\/[^"]+\.xlsx)"/g)
    .map((h) => decodeHTML(h))
    .filter((h) => /Saldo\s+Evoluci/i.test(h));
  if (enlaces.length === 0) return null;

  // Ordenar por recencia usando el patrón .../{año}/{NN}{Mes}/...
  const rango = (ruta: string): number => {
    const m = /\/anual\/(\d{4})\/(\d{1,2})([A-Za-zÁÉÍÓÚáéíóú]+)\//.exec(ruta);
    if (!m) return 0;
    const anio = Number(m[1]);
    const mes = numeroMes(m[3]);
    return anio * 100 + (mes > 0 ? mes : 0);
  };
  enlaces.sort((a, b) => rango(b) - rango(a));

  for (const ruta of enlaces.slice(0, 3)) {
    const url = BASE + encodeURI(ruta);
    const buf = await pedirBytes(url, {
      ...PEDIDO,
      tipo: /spreadsheetml|application\/octet-stream/i,
      firma: "zip",
    });
    if (!buf) continue;
    const hoja = leerHoja(buf);
    const saldo = hoja ? parsearSaldo(hoja) : null;
    if (saldo) return { ...saldo, fuente: url, desdeInstantanea: false };
  }
  return null;
}
