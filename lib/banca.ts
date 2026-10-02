/**
 * Indicadores del sistema financiero de la Superintendencia de Bancos:
 * morosidad, cartera de créditos, índice de solvencia y la tasa de los
 * préstamos nuevos.
 *
 * Mecánica verificada en docs/INFRAESTRUCTURA.md §5.4 (SIMBAD, 2026-09-24): el tablero público de la portada de SIMBAD
 * (`simbad.sb.gob.do`) es un Apache Superset abierto sin sesión, y cada una de
 * sus tarjetas se lee con
 *
 *   GET https://simbad.sb.gob.do/api/v1/chart/{id}/data/?format=json&type=results
 *   → 200 `application/json`, ~1–3 KB: `{ result: [{ colnames, coltypes, data }] }`,
 *     `data` = `[{ __timestamp: <ms UTC del día 1 del mes>, <métrica>: n }]`.
 *
 * **Nota de seguridad.** Hay un hallazgo de seguridad en ese tablero, que se
 * notifica aparte a la SB (docs/INFRAESTRUCTURA.md §5.4). Esta capa lee **solo** los
 * endpoints de datos de las tarjetas que el propio tablero pinta, con
 * `type=results`, y no registra ni guarda ningún otro campo.
 *
 * Tarjetas (ids del tablero «inicio», estables desde su publicación):
 *   1467 Morosidad (%) · 1466 Saldo de la cartera de créditos (DOP millones) ·
 *   1464 Índice de solvencia (%) · 1423 Tasa activa promedio de nuevos créditos
 *   del sistema (%). Ventana: **24 meses** que calcula SIMBAD; los meses sin
 *   publicar no vienen (morosidad y cartera llegan a julio de 2026, solvencia a
 *   mayo). ⚠️ La 1423 tiene la ventana **fija** hasta el 5 de agosto de 2026
 *   (las demás usan «now»): si la SB no la mueve, se queda en julio 2026, y
 *   la tarjeta lo dice con su mes.
 *
 * No hay datos de depósitos en el tablero público. Cada indicador se degrada
 * solo a `null`; nunca se fabrica una comparación que la ventana no trae.
 * Serie mensual, caché diaria.
 */

import { z } from "zod";
import { pedirJson } from "@/lib/pedir";

const BASE = "https://simbad.sb.gob.do/api/v1/chart";
export const URL_SIMBAD = "https://simbad.sb.gob.do/";
const USER_AGENT = "Socratico-Inteligencia/1.0 (banca y subastas; herramienta independiente)";

export interface IndicadorBanca {
  /** AAAA-MM del último mes publicado. */
  periodo: string;
  valor: number;
  unidad: string;
  /** El mismo mes un año antes, solo si la ventana de 24 meses lo trae. */
  anterior: { periodo: string; valor: number } | null;
  /** Primer mes de la ventana que devolvió SIMBAD. */
  desde: string;
  meses: number;
}

export interface Banca {
  morosidad: IndicadorBanca | null;
  cartera: IndicadorBanca | null;
  solvencia: IndicadorBanca | null;
  tasaNuevos: IndicadorBanca | null;
}

type Punto = [periodo: string, valor: number];

/**
 * La respuesta de una tarjeta de Superset: `result[0]` con sus columnas y sus
 * filas. Validada con `zod`; cada fila se lee después con sus propios tipos.
 */
const TARJETA = z.looseObject({
  result: z
    .array(z.looseObject({ colnames: z.array(z.string()), data: z.array(z.record(z.string(), z.unknown())) }))
    .min(1),
});

/** Lee una tarjeta del tablero: solo `data`, validada. */
async function serie(id: number): Promise<Punto[] | null> {
  const cuerpo = await pedirJson(`${BASE}/${id}/data/?format=json&type=results`, {
    fuente: "banca",
    ua: USER_AGENT,
    // Un 200 puede ser la página de un WAF o la de error de Superset.
    tipo: /application\/json/i,
    cabeceras: { Accept: "application/json" },
    revalidate: 86400,
    esquema: TARJETA,
  });
  const r = cuerpo?.result[0];
  const metrica = r?.colnames.find((c) => c !== "__timestamp");
  if (!r || !metrica) return null;
  const puntos: Punto[] = [];
  for (const fila of r.data) {
    const ts = fila.__timestamp;
    const v = fila[metrica];
    if (typeof ts !== "number" || typeof v !== "number" || !Number.isFinite(v)) continue;
    puntos.push([new Date(ts).toISOString().slice(0, 7), v]);
  }
  puntos.sort((a, b) => a[0].localeCompare(b[0]));
  return puntos.length ? puntos : null;
}

const mismoMesAnterior = (p: string) => `${Number(p.slice(0, 4)) - 1}${p.slice(4)}`;

async function indicador(
  id: number,
  unidad: string,
  plausible: (v: number) => boolean,
): Promise<IndicadorBanca | null> {
  const puntos = await serie(id);
  if (!puntos) return null;
  const [periodo, valor] = puntos.at(-1)!;
  if (!plausible(valor)) {
    console.error(`[banca] tarjeta ${id}: valor implausible ${valor}`);
    return null;
  }
  const previo = puntos.find(([p]) => p === mismoMesAnterior(periodo));
  return {
    periodo,
    valor,
    unidad,
    anterior: previo && plausible(previo[1]) ? { periodo: previo[0], valor: previo[1] } : null,
    desde: puntos[0][0],
    meses: puntos.length,
  };
}

export async function getBanca(): Promise<Banca> {
  const [morosidad, cartera, solvencia, tasaNuevos] = await Promise.all([
    indicador(1467, "% de la cartera", (v) => v > 0 && v < 20),
    indicador(1466, "millones de RD$", (v) => v > 100_000 && v < 100_000_000),
    indicador(1464, "%", (v) => v > 5 && v < 60),
    indicador(1423, "% nominal anual", (v) => v > 3 && v < 40),
  ]);
  return { morosidad, cartera, solvencia, tasaNuevos };
}
