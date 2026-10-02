import { z } from "zod";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase-config";

/**
 * Lecturas server-side de la vertical `/democracia`.
 *
 * Los agregados de voto son **públicos** (la vista `agregados_publicos` solo
 * expone conteos, nunca quién votó), así que se leen con la clave publicable
 * vía REST, con caché de Next. El voto nominal jamás se lee desde el servidor:
 * es privado y solo el propio usuario lo ve, autenticado, desde el navegador.
 */

const REST = `${SUPABASE_URL}/rest/v1`;

/**
 * Las filas se validan con `zod` antes de sumarlas: una columna renombrada en
 * la vista deja la cifra en «no disponible» con su motivo en el registro, en
 * vez de sumar `undefined` y publicar `NaN` votos.
 */
const AGREGADOS = z.array(
  z.looseObject({
    camara: z.enum(["diputados", "senado"]),
    ref: z.string(),
    a_favor: z.number(),
    en_contra: z.number(),
    total: z.number(),
    // La columna llegó con la migración de Cuenta Única (docs/INFRAESTRUCTURA.md §10,
    // aplicada el 2026-09-26). Si una vista anterior no la trae, cero: nadie
    // ha verificado su identidad mientras no exista el cliente de la OGTIC.
    verificados: z.number().default(0),
  }),
);
const INICIATIVAS = z.array(
  z.looseObject({
    camara: z.enum(["diputados", "senado"]),
    ref: z.string(),
    numero: z.string().nullable(),
    titulo: z.string().nullable(),
    grupo: z.string().nullable(),
  }),
);

async function rest<T>(path: string, revalidate: number, esquema: z.ZodType<T>): Promise<T | null> {
  try {
    const res = await fetch(`${REST}/${path}`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Accept-Profile": "democracia",
      },
      next: { revalidate },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`Supabase respondió ${res.status}`);
    const r = esquema.safeParse(await res.json());
    if (!r.success) throw new Error(`la vista cambió de forma: ${r.error.issues[0]?.path.join(".")}`);
    return r.data;
  } catch (err) {
    console.error(`[democracia] ${path}: ${String(err)}`);
    return null;
  }
}

export type Camara = "diputados" | "senado";

export interface Agregado {
  camara: Camara;
  ref: string;
  a_favor: number;
  en_contra: number;
  total: number;
  /** Votos de votantes con identidad verificada por Cuenta Única (docs/INFRAESTRUCTURA.md §10.7). */
  verificados: number;
}

/** Referencia estable de una iniciativa para votar. */
export function refIniciativa(camara: Camara, id: string | number, cuatrienio?: string): string {
  return camara === "senado" && cuatrienio ? `${cuatrienio}:${id}` : String(id);
}

/** Agregado de una sola iniciativa (para el widget de voto en la ficha). */
export async function getAgregado(camara: Camara, ref: string): Promise<Agregado | null> {
  const filtro = `camara=eq.${camara}&ref=eq.${encodeURIComponent(ref)}`;
  const rows = await rest(`agregados_publicos?${filtro}&select=*`, 30, AGREGADOS);
  // Sin filas es «nadie votó todavía»: ceros de verdad. Sin respuesta es «no
  // pudimos mirar»: `null`, y el widget lo dice en vez de publicar cero votos.
  if (!rows) return null;
  return rows[0] ?? { camara, ref, a_favor: 0, en_contra: 0, total: 0, verificados: 0 };
}

export interface RankingItem extends Agregado {
  numero: string | null;
  titulo: string | null;
  grupo: string | null;
  /** a_favor − en_contra. */
  balance: number;
  /** a_favor / total, 0..1. */
  apoyo: number;
}

/**
 * Ranking de iniciativas votadas. Cruza los agregados con el espejo
 * denormalizado de iniciativas (título/número), ambos leídos por REST.
 */
export async function getRanking(limite = 60): Promise<RankingItem[]> {
  const [agg, inis] = await Promise.all([
    rest(`agregados_publicos?select=*&order=total.desc&limit=${limite}`, 60, AGREGADOS),
    rest(`iniciativas?select=camara,ref,numero,titulo,grupo`, 60, INICIATIVAS),
  ]);
  if (!agg) return [];

  const meta = new Map(inis?.map((i) => [`${i.camara}:${i.ref}`, i]) ?? []);
  return agg.map((a) => {
    const m = meta.get(`${a.camara}:${a.ref}`);
    return {
      ...a,
      numero: m?.numero ?? null,
      titulo: m?.titulo ?? null,
      grupo: m?.grupo ?? null,
      balance: a.a_favor - a.en_contra,
      apoyo: a.total > 0 ? a.a_favor / a.total : 0,
    };
  });
}

export interface ResumenDemocracia {
  votos: number;
  iniciativas: number;
}

/** Cifras de cabecera para el panorama y la landing. */
export async function getResumenDemocracia(): Promise<ResumenDemocracia | null> {
  const agg = await rest(`agregados_publicos?select=total`, 60, z.array(z.looseObject({ total: z.number() })));
  if (!agg) return null;
  return {
    votos: agg.reduce((s, a) => s + a.total, 0),
    iniciativas: agg.length,
  };
}
