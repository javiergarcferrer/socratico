// Lo puro de la Edge Function `metricas-uso` (docs/INFRAESTRUCTURA.md §10.12):
// las URL de la API de Web Analytics de Vercel y la lectura de sus respuestas.
// No importa nada, para que `supabase/pruebas/metricas_uso.cjs` lo pruebe con
// Node sin red ni Deno.

/** El proyecto `socratico` y su equipo en Vercel (§1.2). Identificadores, no credenciales. */
export const PROYECTO = "prj_6S1jj4Ubba7lKVJDFdnKWcK7JoU6";
export const EQUIPO = "team_thdixMvEitDDGxlueUyuTtsb";
const API = "https://api.vercel.com/v1/query/web-analytics/visits";

const DIA = 86_400_000;

export interface Total {
  paginas: number;
  visitantes: number;
}

export interface Fila extends Total {
  /** El valor de la dimensión (una ruta, un referente, un país) o el día `AAAA-MM-DD`. */
  clave: string;
}

/** Medianoche UTC de hace `n` días: Vercel parte los días en UTC. */
export function inicioDeDia(ahora: Date, n: number): Date {
  const hoy = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());
  return new Date(hoy - n * DIA);
}

function parametros(desde: Date, hasta: Date): URLSearchParams {
  return new URLSearchParams({
    projectId: PROYECTO,
    teamId: EQUIPO,
    since: desde.toISOString(),
    until: hasta.toISOString(),
  });
}

/** `GET …/visits/count`: páginas vistas y visitantes del período, solo producción. */
export function urlConteo(desde: Date, hasta: Date): string {
  return `${API}/count?${parametros(desde, hasta)}`;
}

/**
 * `GET …/visits/aggregate` partido por una dimensión (`day`, `requestPath`,
 * `referrerHostname`, `country`). Lo que pasa de `limite` Vercel lo junta en
 * un grupo «Others»: por días el límite tiene que cubrir el período entero.
 */
export function urlAgregado(por: string, desde: Date, hasta: Date, limite: number): string {
  const p = parametros(desde, hasta);
  p.append("by", por);
  p.set("limit", String(limite));
  return `${API}/aggregate?${p}`;
}

/**
 * Una cifra de Vercel. La API la declara `number` que admite `null`
 * (`additionalProperties: { type: number, nullable: true }` en su OpenAPI):
 * `null` es cero; lo que no es número, o falta, es una forma que no conocemos.
 */
function cifra(v: unknown): number | null {
  if (v === null) return 0;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

/** El grupo en que Vercel junta lo que pasa del límite. */
export const RESTO = "Others";

function total(o: unknown): Total | null {
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  const paginas = cifra(r.pageviews);
  const visitantes = cifra(r.visitors);
  return paginas === null || visitantes === null ? null : { paginas, visitantes };
}

const datos = (json: unknown): unknown => (json && typeof json === "object" ? (json as { data?: unknown }).data : undefined);

/** `{ data: { pageviews, visitors } }`. `null` si la forma no es esa. */
export function leerConteo(json: unknown): Total | null {
  return total(datos(json));
}

/**
 * `{ data: [{ <campo>, pageviews, visitors }] }`, de mayor a menor, con el
 * grupo «Others» al final aunque sume más: es el resto, no un puesto. `null`
 * si una fila no trae sus dos cifras: mejor decir que la forma cambió que
 * pintar ceros. Un `campo` ausente o nulo es la clave vacía (el tráfico
 * directo no tiene referente).
 */
export function leerAgregado(json: unknown, campo: string): Fila[] | null {
  const lista = datos(json);
  if (!Array.isArray(lista)) return null;
  const filas: Fila[] = [];
  for (const item of lista) {
    const t = total(item);
    const valor = (item as Record<string, unknown> | null)?.[campo];
    if (!t || (valor != null && typeof valor !== "string")) return null;
    filas.push({ clave: valor ?? "", ...t });
  }
  const esResto = (f: Fila) => (f.clave === RESTO ? 1 : 0);
  return filas.sort((a, b) => esResto(a) - esResto(b) || b.paginas - a.paginas || a.clave.localeCompare(b.clave));
}

/**
 * La serie por días (`by=day`): cada fila trae `timestamp`. Devuelve los `dias`
 * días desde `desde`, en orden, con cero donde Vercel no trae fila.
 */
export function leerDias(json: unknown, desde: Date, dias: number): Fila[] | null {
  const lista = datos(json);
  if (!Array.isArray(lista)) return null;
  const porDia = new Map<string, Total>();
  for (const item of lista) {
    const t = total(item);
    const momento = (item as Record<string, unknown> | null)?.timestamp;
    if (!t || typeof momento !== "string" || Number.isNaN(Date.parse(momento))) return null;
    porDia.set(new Date(momento).toISOString().slice(0, 10), t);
  }
  return Array.from({ length: dias }, (_, i) => {
    const clave = new Date(desde.getTime() + i * DIA).toISOString().slice(0, 10);
    return { clave, ...(porDia.get(clave) ?? { paginas: 0, visitantes: 0 }) };
  });
}
