/**
 * Comercio exterior y recaudación de la Dirección General de Aduanas (DGA).
 *
 * Mecánica verificada el 2026-09-24 (docs/INFRAESTRUCTURA.md §5.4):
 *
 *   GET https://www.aduanas.gob.do/umbraco/api/searcher/getpageofdocuments?id=3442
 *
 * → 200 `application/json`, ~10 KB. Es la misma llamada que hace el buscador
 * de `/estadisticas/series-de-tiempo/`: un arreglo de categorías
 * (`Importaciones` 8 archivos, `Exportaciones` 5, `Recaudaciones` 7), cada
 * archivo con `documentName`, `documentFile` y `documentDateTime`. Las rutas
 * `/media/{hash}/…` **no se pueden predecir** —cambian en cada corte—, así
 * que el índice se lee en cada lectura y de ahí sale la URL del archivo.
 *
 * De cada categoría se toma un solo archivo, el agregado:
 *   - «Importaciones Por Régimen …» → hoja «Imp FOB por Régimen», 49 KB.
 *   - «Exportaciones por régimen …» → hoja «Exp por regimen», 48 KB.
 *   - «Recaudaciones mensuales DGA según impuestos … » → hoja «Mensual», 135 KB.
 * Si hay varios que casan (la recaudación guarda cortes viejos congelados a
 * diciembre), gana el de `documentDateTime` más reciente. Los tres son XLSX
 * de una hoja y comparten forma: una fila de años (un año por bloque de
 * columnas, en la primera celda del bloque), debajo la fila de meses
 * («Enero»…«Diciembre», a veces con espacio al final), y una fila `Total` /
 * `TOTAL` en la columna A con el total del mes. Cada bloque cierra con una
 * columna de total del año (en el año en curso, el acumulado).
 *
 * Rarezas de la fuente (y lo que hace este módulo con ellas):
 *   - **La unidad del título miente por seis ceros.** Importaciones y
 *     exportaciones dicen «VALORES FOB EXPRESADOS EN MILLONES DE DÓLARES US$» y
 *     la recaudación «millones de pesos dominicanos», pero las celdas están en
 *     dólares y en pesos (agosto 2026: 2778371797.42 = US$ 2,778.4 millones).
 *     Aquí se leen como unidades, y un valor fuera del rango plausible de un
 *     mes (p. ej. si algún día publican en millones de verdad) deja la cifra
 *     en `null`: no se reescala a ojo.
 *   - Todo es **preliminar** («Data preliminar sujeta a rectificaciones…»);
 *     la nota se devuelve tal cual para que la interfaz la diga.
 *   - La recaudación es la del «Fondo 100» (lo que la DGA cobra para el
 *     fondo general), en pesos; en su fila de año la columna 2025 no siempre
 *     cuadra entre subpartidas, por eso aquí solo se usa la fila `TOTAL`, mes
 *     a mes.
 *   - Debajo de la tabla de recaudación hay celdas sueltas con números de
 *     trabajo (filas 38–40): se ignoran porque solo se lee la fila `TOTAL`.
 *   - El acumulado del año se suma con los meses del propio archivo y se
 *     cruza con la columna de total que la DGA pone al cierre del bloque; si
 *     no cuadran (más de 0.1 %), el acumulado queda en `null`.
 *
 * Contrato de la casa (copiado de `lib/tasa.ts`): User-Agent identificable,
 * 25 s, un reintento, `content-type` validado (JSON para el índice; hoja de
 * cálculo y firma «PK» para los archivos), cada cifra se degrada sola a
 * `null` y nada lanza hacia la página. Serie mensual: caché de 24 h.
 * Solo servidor: lee con `lib/xlsx.ts`.
 */

import { z } from "zod";
import { numeroMes } from "@/lib/format";
import { pedirBytes, pedirJson } from "@/lib/pedir";
import { filasDe, indiceColumna, leerHoja } from "@/lib/xlsx";

export const ORIGEN_ADUANAS = "https://www.aduanas.gob.do";
export const URL_INDICE_ADUANAS = `${ORIGEN_ADUANAS}/umbraco/api/searcher/getpageofdocuments?id=3442`;
export const URL_SERIES_ADUANAS = `${ORIGEN_ADUANAS}/estadisticas/series-de-tiempo/`;
const USER_AGENT = "Socratico-Inteligencia/1.0 (comercio exterior de Aduanas; herramienta independiente)";
const REVALIDAR = 86_400;

export type UnidadAduanas = "USD" | "DOP";

export interface SerieAduanas {
  /** Último mes con dato en el archivo. */
  anio: number;
  /** 1–12. */
  mes: number;
  /** Valor del mes, en unidades (dólares FOB o pesos). */
  valor: number;
  /** El mismo mes un año antes, si el archivo lo trae. */
  mismoMesAnterior: number | null;
  /** Enero → `mes` del año en curso, si cuadra con el total del archivo. */
  acumulado: number | null;
  /** Enero → `mes` del año anterior, sumado del mismo archivo. */
  acumuladoAnterior: number | null;
  unidad: UnidadAduanas;
  /** «Data preliminar sujeta a rectificaciones…», tal como la escribe la DGA. */
  nota: string | null;
  /** URL absoluta del XLSX leído. */
  archivo: string;
  /** Nombre del documento en el índice. */
  documento: string;
  /** `documentDateTime` del índice (ISO), o null. */
  publicado: string | null;
}

export interface ComercioExterior {
  importaciones: SerieAduanas | null;
  exportaciones: SerieAduanas | null;
  recaudacion: SerieAduanas | null;
  /** ¿Contestó el índice? Si no, las tres cifras son null por la misma causa. */
  indiceLeido: boolean;
  fuente: string;
}

interface DocIndice {
  documentName?: unknown;
  documentFile?: unknown;
  documentDateTime?: unknown;
}
interface CategoriaIndice {
  categoryName?: unknown;
  documents?: unknown;
}

/** Rango plausible de UN mes. Fuera de él, la unidad cambió y no se adivina. */
const RANGO_MENSUAL: Record<UnidadAduanas, [number, number]> = {
  USD: [1e8, 1e11], // hoy: ~US$ 1,000–3,000 millones al mes
  DOP: [1e9, 1e12], // hoy: ~RD$ 20,000 millones al mes
};

/** Un mes escrito entero («Agosto», «Setiembre»): la fila de meses de la DGA. */
const mesEntero = (v: string) => (/^\s*[a-záéíóú]{4,}\s*$/i.test(v) ? numeroMes(v) : 0);

/* ------------------------------------------------------------------ red */

const PEDIDO = { fuente: "aduanas", ua: USER_AGENT, revalidate: REVALIDAR } as const;

/** El índice es una lista de categorías; lo de dentro lo valida `elegirDocumento`. */
const INDICE = z.array(z.looseObject({ categoryName: z.unknown(), documents: z.unknown() }));

function leerIndice(): Promise<CategoriaIndice[] | null> {
  return pedirJson(URL_INDICE_ADUANAS, { ...PEDIDO, tipo: /application\/json/i, esquema: INDICE });
}

function bajarHoja(url: string): Promise<ArrayBuffer | null> {
  return pedirBytes(url, { ...PEDIDO, tipo: /spreadsheetml|octet-stream|excel/i, firma: "zip" });
}

/** Elige el documento XLSX de la categoría cuyo nombre casa, el más reciente. */
export function elegirDocumento(
  indice: CategoriaIndice[],
  categoria: RegExp,
  nombre: RegExp,
): { nombre: string; url: string; publicado: string | null } | null {
  const cat = indice.find((c) => typeof c.categoryName === "string" && categoria.test(c.categoryName));
  if (!cat || !Array.isArray(cat.documents)) return null;
  const candidatos = (cat.documents as DocIndice[])
    .filter(
      (d) =>
        typeof d.documentName === "string" &&
        typeof d.documentFile === "string" &&
        nombre.test(d.documentName) &&
        // Solo rutas del propio sitio y solo XLSX: hay cortes viejos con la
        // extensión truncada (`…-v2.x`) que no se leen.
        /^\/media\/[^?#]+\.xlsx$/i.test(d.documentFile),
    )
    .map((d, i) => ({
      i,
      nombre: (d.documentName as string).trim(),
      url: `${ORIGEN_ADUANAS}${encodeURI(decodeURI(d.documentFile as string))}`,
      publicado: typeof d.documentDateTime === "string" ? d.documentDateTime : null,
    }));
  if (candidatos.length === 0) return null;
  candidatos.sort((a, b) => (b.publicado ?? "").localeCompare(a.publicado ?? "") || a.i - b.i);
  const { nombre: n, url, publicado } = candidatos[0];
  return { nombre: n, url, publicado };
}

/* --------------------------------------------------------------- parseo */

type Fila = { n: number; celdas: Map<number, string> };

const esAnio = (s: string | undefined) => !!s && /^\s*(20\d{2})(\.0+)?\s*$/.test(s);

/**
 * Lee una hoja de la DGA (formato ancho: años × meses, fila `Total`) y
 * devuelve el último mes con su comparación. Exportado para verificarlo
 * contra los archivos crudos fuera de línea; `null` si la forma no se reconoce.
 */
export async function parsearHojaAduanas(
  buf: ArrayBuffer,
  unidad: UnidadAduanas,
): Promise<Omit<SerieAduanas, "archivo" | "documento" | "publicado"> | null> {
  const hoja = leerHoja(buf);
  if (!hoja) return null;
  const filas: Fila[] = filasDe(hoja).map(({ n, celdas }) => ({
    n,
    celdas: new Map([...celdas].filter(([, v]) => v.trim()).map(([col, v]) => [indiceColumna(col), v] as const)),
  }));

  // Fila de meses: la primera con al menos 12 nombres de mes.
  const iMeses = filas.findIndex(
    (f) => [...f.celdas.values()].filter((v) => mesEntero(v)).length >= 12,
  );
  if (iMeses < 0) return null;
  // Fila de años: la más cercana por encima con varios años.
  let iAnios = -1;
  for (let i = iMeses - 1; i >= 0; i--) {
    if ([...filas[i].celdas.values()].filter(esAnio).length >= 3) {
      iAnios = i;
      break;
    }
  }
  if (iAnios < 0) return null;
  const iTotal = filas.findIndex((f, i) => i > iMeses && (f.celdas.get(1) ?? "").trim().toUpperCase() === "TOTAL");
  if (iTotal < 0) return null;

  const inicioAnio = [...filas[iAnios].celdas.entries()]
    .filter(([, v]) => esAnio(v))
    .map(([col, v]) => ({ col, anio: Number.parseInt(v, 10) }))
    .sort((a, b) => a.col - b.col);

  const total = filas[iTotal].celdas;
  const valores = new Map<string, number>(); // «2026-8» → valor
  const ultimaColumna = new Map<number, number>(); // año → columna de su último mes con dato
  for (const [col, texto] of filas[iMeses].celdas) {
    const mes = mesEntero(texto);
    if (!mes) continue;
    const anio = inicioAnio.filter((a) => a.col <= col).at(-1)?.anio;
    const v = Number(total.get(col));
    if (!anio || !Number.isFinite(v) || !(v > 0)) continue;
    valores.set(`${anio}-${mes}`, v);
    if (col > (ultimaColumna.get(anio) ?? 0)) ultimaColumna.set(anio, col);
  }

  const claves = [...valores.keys()]
    .map((k) => k.split("-").map(Number) as [number, number])
    .sort((a, b) => a[0] * 12 + a[1] - (b[0] * 12 + b[1]));
  const ultimo = claves.at(-1);
  if (!ultimo) return null;
  const [anio, mes] = ultimo;
  const valor = valores.get(`${anio}-${mes}`)!;
  const [min, max] = RANGO_MENSUAL[unidad];
  if (valor < min || valor > max) return null;

  const suma = (a: number): number | null => {
    let s = 0;
    for (let m = 1; m <= mes; m++) {
      const v = valores.get(`${a}-${m}`);
      if (v === undefined) return null;
      s += v;
    }
    return s;
  };
  let acumulado = suma(anio);
  // Cruce con la columna de total que la DGA pone al cierre del bloque del año.
  const colTotal = (ultimaColumna.get(anio) ?? 0) + 1;
  const totalArchivo = Number(total.get(colTotal));
  if (acumulado !== null && Number.isFinite(totalArchivo) && totalArchivo > 0) {
    if (Math.abs(totalArchivo - acumulado) / totalArchivo > 0.001) acumulado = null;
  }

  const nota =
    filas
      .flatMap((f) => [...f.celdas.values()])
      .map((v) => v.replace(/^\*+/, "").trim())
      .find((v) => /preliminar/i.test(v)) ?? null;

  return {
    anio,
    mes,
    valor,
    mismoMesAnterior: valores.get(`${anio - 1}-${mes}`) ?? null,
    acumulado,
    acumuladoAnterior: suma(anio - 1),
    unidad,
    nota,
  };
}

/* -------------------------------------------------------------- lectura */

async function leerSerie(
  indice: CategoriaIndice[],
  categoria: RegExp,
  nombre: RegExp,
  unidad: UnidadAduanas,
): Promise<SerieAduanas | null> {
  try {
    const doc = elegirDocumento(indice, categoria, nombre);
    if (!doc) return null;
    const buf = await bajarHoja(doc.url);
    if (!buf) return null;
    const serie = await parsearHojaAduanas(buf, unidad);
    if (!serie) {
      console.error(`[aduanas] forma no reconocida: ${doc.url}`);
      return null;
    }
    return { ...serie, archivo: doc.url, documento: doc.nombre, publicado: doc.publicado };
  } catch (err) {
    console.error(`[aduanas] parseo: ${String(err)}`);
    return null;
  }
}

/**
 * Importaciones y exportaciones FOB del último mes (US$) y recaudación de la
 * DGA (RD$), cada una con su mismo mes del año anterior y su acumulado.
 * Nunca lanza: cada cifra que no se pudo leer llega como `null`.
 */
export async function getComercioExterior(): Promise<ComercioExterior> {
  const vacio: ComercioExterior = {
    importaciones: null,
    exportaciones: null,
    recaudacion: null,
    indiceLeido: false,
    fuente: URL_SERIES_ADUANAS,
  };
  try {
    const indice = await leerIndice();
    if (!indice) return vacio;
    const [importaciones, exportaciones, recaudacion] = await Promise.all([
      leerSerie(indice, /^importaciones$/i, /importaciones\s+por\s+r[eé]gimen/i, "USD"),
      leerSerie(indice, /^exportaciones$/i, /exportaciones\s+por\s+r[eé]gimen/i, "USD"),
      leerSerie(indice, /^recaudaciones$/i, /recaudaciones\s+mensuales/i, "DOP"),
    ]);
    return { importaciones, exportaciones, recaudacion, indiceLeido: true, fuente: URL_SERIES_ADUANAS };
  } catch (err) {
    console.error(`[aduanas] ${String(err)}`);
    return vacio;
  }
}
