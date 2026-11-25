import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Los legisladores del SIL casados con las personas del grafo, con la
 * asistencia y la disidencia de cada diputado derivadas de su voto nominal
 * (docs/INFRAESTRUCTURA.md §5.5, §7.4). Dos archivos de `datos/votos/`, que no
 * se sirven enteros (§7.11): se leen en funciones y se dan de a una persona.
 *
 *  · `legisladores.json` (`scripts/build-legisladores.py`): el casamiento —con
 *    su evidencia, los dudosos y lo que se añade a `funcionarios.json`—, los
 *    agregados por persona, período, legislatura y año, y los de la cámara y
 *    de cada bancada.
 *  · `nominal.json` (`scripts/build-votos-nominales.py`): el voto de cada
 *    diputado en cada votación, alineado a un padrón por período. Solo lo lee
 *    quien pide los votos de una persona.
 *
 * Módulo de servidor (`node:fs`), memoizado por instancia; sin los archivos,
 * todo devuelve `null` o vacío y nada se rompe.
 */

export const NOTA_ASISTENCIA =
  "Votaciones del pleno en que el SIL lo lista en el voto nominal (el denominador) y, de ellas, en cuántas figura presente: votó sí, no, se abstuvo o estuvo presente sin votar. Las votaciones a mano alzada no cuentan: no registran quién estuvo. Mide la presencia en las votaciones, no en la sesión entera; el SIL no distingue en el voto nominal la ausencia excusada de la que no lo es, ni da las licencias.";

export const NOTA_DISIDENCIA =
  "Votó con otro sentido que más de la mitad de su bancada (la que el SIL le da en esa votación), contando las votaciones en que votaron al menos tres de ella y su mayoría fue clara.";

export interface Cuentas {
  /** El denominador: votaciones en que el SIL lo lista. */
  listadas: number;
  /** Sí, no, abstención o presente sin votar. */
  presente: number;
  si: number;
  no: number;
  abstencion: number;
  sinVoto: number;
  ausente: number;
  otro: number;
}

/** Los cortes: `periodo` «2024-2028», `legislatura` «2025-PLO», `anio` «2024-2028:2025» (el año con su período). */
export type Eje = "periodo" | "legislatura" | "anio";

/** «2024-2028:2025» → { periodo: "2024-2028", anio: "2025" }. */
export const partirAnio = (k: string) => {
  const [periodo, anio] = k.split(":");
  return { periodo, anio };
};

export interface Disidencia {
  votacion: number;
  voto: "si" | "no" | "abstencion";
  bancada: string;
  posicion: "si" | "no" | "abstencion";
  fecha: string | null;
  /** Lo que se sometió, recortado a 160 caracteres. */
  mocion: string;
}

export interface Legislador {
  /** El `legisladorId` del SIL. */
  id: number;
  nombre: string;
  camara: "diputados" | "senado";
  /** La persona del grafo (`/funcionarios/<persona>`). */
  persona: string | null;
  estado: "casado" | "nuevo" | "dudoso" | "separado";
  evidencia: string | null;
  periodos: Record<string, { funcion?: string; provincia?: string; circunscripcion?: string; partido?: string; inicio?: string; fin?: string }>;
  asistencia?: Record<Eje, Record<string, Cuentas>>;
  disidencia?: { cuenta: Record<string, number>; base: Record<string, number>; ultimas: Disidencia[] };
}

export interface Adicion {
  persona: string;
  /** El nombre, si la persona es nueva en el grafo. */
  nuevo?: string;
  /** La persona de la que se separó el escaño, si el casamiento heredado chocaba. */
  separadoDe?: string;
  legislador: number;
  evidencia: string;
  /** `vot`: la votación del pleno de la que sale el cargo (la elección del bufete directivo). */
  cargos: { t: string; pr?: string; d?: string; m: "electo" | "cesa" | "anterior"; o: "congreso"; per: string; par?: string; pep?: number; vot?: number; n?: number }[];
}

export interface Legisladores {
  generado: string;
  fuente: string;
  corte: {
    nominalGenerado?: string;
    nominal?: { periodos: { periodo: string; votaciones: number; leidas: number }[] };
    /** La última votación de `votaciones.json` y su fecha de corte: las posteriores aún no están. */
    votacionesHasta?: string;
    votacionesGenerado?: string;
    /** `"<período>:<año>"` → cuántas votaciones tiene y cuántas están leídas. */
    anios?: Record<string, { votaciones: number; leidas: number }>;
  };
  resumen: Record<string, number>;
  porId: Map<number, Legislador>;
  porPersona: Map<string, Legislador>;
  adiciones: Adicion[];
  dudosos: { legislador: number; nombre: string; motivo: string; candidatos: string[] }[];
  camara: Record<Eje, Record<string, Cuentas>>;
  /** `"<eje>:<clave>"` → siglas → cuentas. */
  bancadas: Record<string, Record<string, Cuentas>>;
}

const RUTA = join(process.cwd(), "datos", "votos", "legisladores.json");
const RUTA_NOMINAL = join(process.cwd(), "datos", "votos", "nominal.json");
const RUTA_INDICE = join(process.cwd(), "datos", "votos", "votaciones.json");

let indiceMemo: Promise<{ fechas: Record<string, string>; porExpediente: Record<string, number[]> } | null> | null = null;

/**
 * La fecha de cada votación y las votaciones de cada expediente («06360-2024-2028-CD»), de
 * `datos/votos/votaciones.json`: lo que las funciones necesitan de `votaciones.json` y
 * `congreso.json`, que no viajan en ninguna (next.config.ts, `outputFileTracingExcludes`).
 */
function indiceVotaciones() {
  indiceMemo ??= readFile(RUTA_INDICE, "utf8")
    .then((t) => JSON.parse(t) as { fechas: Record<string, string>; porExpediente: Record<string, number[]> })
    .catch((e: NodeJS.ErrnoException) => {
      indiceMemo = null;
      if (e.code !== "ENOENT") console.error("[legisladores] votaciones", e);
      return null;
    });
  return indiceMemo;
}

export async function fechaDeVotacion(id: number): Promise<string | null> {
  return (await indiceVotaciones())?.fechas[String(id)] ?? null;
}

/** Las votaciones del pleno sobre una iniciativa, por su expediente; `null` si el expediente no está. */
export async function votacionesDeExpediente(numero: string): Promise<number[] | null> {
  return (await indiceVotaciones())?.porExpediente[numero.toUpperCase()] ?? null;
}

let memo: Promise<Legisladores | null> | null = null;

export function getLegisladores(): Promise<Legisladores | null> {
  memo ??= readFile(RUTA, "utf8")
    .then((t) => {
      const d = JSON.parse(t) as Omit<Legisladores, "porId" | "porPersona"> & { legisladores: Legislador[] };
      const porId = new Map(d.legisladores.map((l) => [l.id, l]));
      const porPersona = new Map<string, Legislador>();
      for (const l of d.legisladores) if (l.persona && !porPersona.has(l.persona)) porPersona.set(l.persona, l);
      return {
        generado: d.generado,
        fuente: d.fuente,
        corte: d.corte,
        resumen: d.resumen,
        porId,
        porPersona,
        adiciones: d.adiciones,
        dudosos: d.dudosos,
        camara: d.camara,
        bancadas: d.bancadas,
      };
    })
    .catch((e: NodeJS.ErrnoException) => {
      memo = null;
      if (e.code !== "ENOENT") console.error("[legisladores]", e);
      return null;
    });
  return memo;
}

export async function legisladorDePersona(persona: string): Promise<Legislador | null> {
  return (await getLegisladores())?.porPersona.get(persona) ?? null;
}

/** La proporción presente/listadas, o `null` sin denominador. */
export function proporcion(c: Pick<Cuentas, "presente" | "listadas"> | undefined): number | null {
  return c && c.listadas > 0 ? c.presente / c.listadas : null;
}

/** «73 de 101 (72 %)»: nunca un porcentaje sin su denominador. */
export function textoAsistencia(c: Cuentas): string {
  const p = proporcion(c);
  const pct = p == null ? "" : ` (${(Math.round(p * 1000) / 10).toLocaleString("es-DO", { maximumFractionDigits: 1 })} %)`;
  return `${c.presente.toLocaleString("es-DO")} de ${c.listadas.toLocaleString("es-DO")}${pct}`;
}

/** La bancada más frecuente de un legislador en un período, por su partido declarado. */
export function partidoEn(l: Legislador, periodo: string): string | null {
  return l.periodos[periodo]?.partido ?? null;
}

/**
 * Los diputados ordenados por ausencias en un corte (`eje` y su clave: un
 * período «2024-2028», una legislatura «2025-PLO» o un año «2025»). Con `desde`
 * y `hasta` (años), suma los años del intervalo.
 */
export async function rankingAusencias(
  filtro: { eje: Eje; clave: string } | { desde: number; hasta: number },
  limite = 10,
): Promise<{ legislador: Legislador; cuentas: Cuentas }[]> {
  const d = await getLegisladores();
  if (!d) return [];
  const filas: { legislador: Legislador; cuentas: Cuentas }[] = [];
  for (const l of d.porId.values()) {
    if (!l.asistencia) continue;
    let c: Cuentas | undefined;
    if ("eje" in filtro) c = l.asistencia[filtro.eje][filtro.clave];
    else {
      for (const [k, x] of Object.entries(l.asistencia.anio)) {
        const a = Number(partirAnio(k).anio);
        if (a < filtro.desde || a > filtro.hasta) continue;
        c ??= { listadas: 0, presente: 0, si: 0, no: 0, abstencion: 0, sinVoto: 0, ausente: 0, otro: 0 };
        for (const q of Object.keys(x) as (keyof Cuentas)[]) c[q] += x[q];
      }
    }
    if (c && c.listadas > 0) filas.push({ legislador: l, cuentas: c });
  }
  return filas.sort((a, b) => b.cuentas.ausente - a.cuentas.ausente || a.legislador.nombre.localeCompare(b.legislador.nombre, "es")).slice(0, limite);
}

/* ------------------------------------------------------------ voto nominal */

interface Nominal {
  generado: string;
  periodos: Record<string, { legisladores: [number, string, string][]; partidos: string[] }>;
  votos: Record<string, { p: string; n: number; v: string; b: string }>;
}

const DIGITOS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SENTIDO = { s: "si", n: "no", b: "abstencion", x: "sinVoto", a: "ausente", o: "otro" } as const;
export type Sentido = (typeof SENTIDO)[keyof typeof SENTIDO];

export const ETIQUETA_SENTIDO: Record<Sentido, string> = {
  si: "Sí",
  no: "No",
  abstencion: "Abstención",
  sinVoto: "Presente sin votar",
  ausente: "Ausente",
  otro: "Otro",
};

let memoNominal: Promise<Nominal | null> | null = null;

function getNominal(): Promise<Nominal | null> {
  memoNominal ??= readFile(RUTA_NOMINAL, "utf8")
    .then((t) => JSON.parse(t) as Nominal)
    .catch((e: NodeJS.ErrnoException) => {
      memoNominal = null;
      if (e.code !== "ENOENT") console.error("[legisladores] nominal", e);
      return null;
    });
  return memoNominal;
}

/** Cómo votó un diputado en cada votación leída, de la más reciente a la más antigua. */
export async function votosDeLegislador(id: number): Promise<{ votacion: number; sentido: Sentido; bancada: string | null }[]> {
  const n = await getNominal();
  if (!n) return [];
  const indice = new Map<string, number>();
  for (const [per, p] of Object.entries(n.periodos)) {
    const i = p.legisladores.findIndex((f) => f[0] === id);
    if (i >= 0) indice.set(per, i);
  }
  const salida: { votacion: number; sentido: Sentido; bancada: string | null }[] = [];
  for (const [vid, v] of Object.entries(n.votos)) {
    const i = indice.get(v.p);
    if (i == null) continue;
    const ch = v.v[i] as keyof typeof SENTIDO | undefined;
    if (!ch || ch === ("-" as string)) continue;
    const b = v.b[i];
    salida.push({
      votacion: Number(vid),
      sentido: SENTIDO[ch],
      bancada: b && b !== "-" ? n.periodos[v.p].partidos[DIGITOS.indexOf(b)] ?? null : null,
    });
  }
  return salida.sort((a, b) => b.votacion - a.votacion);
}

/** El voto de cada diputado en una votación: id del SIL → sentido y bancada. */
export async function votosDeVotacion(
  votacion: number,
): Promise<{ legislador: number; nombre: string; sentido: Sentido; bancada: string | null }[] | null> {
  const n = await getNominal();
  const v = n?.votos[String(votacion)];
  if (!n || !v) return null;
  const per = n.periodos[v.p];
  const salida = [];
  for (let i = 0; i < v.v.length; i++) {
    const ch = v.v[i] as keyof typeof SENTIDO;
    if (ch === ("-" as string)) continue;
    const [lid, nombres, apellidos] = per.legisladores[i];
    const b = v.b[i];
    salida.push({
      legislador: lid,
      nombre: `${nombres} ${apellidos}`,
      sentido: SENTIDO[ch],
      bancada: b && b !== "-" ? per.partidos[DIGITOS.indexOf(b)] ?? null : null,
    });
  }
  return salida;
}
