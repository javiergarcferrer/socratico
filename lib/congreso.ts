/**
 * Congreso Nacional — capa de datos del SIL de la Cámara de Diputados.
 *
 * Mismo contrato que `lib/dgcp.ts`: sin base de datos, sin variables de entorno,
 * todo se lee en vivo y se cachea con `revalidate` de Next.
 *
 * El origen es la **API interna** del portal SIL Ciudadano
 * (`https://www.diputadosrd.gob.do/sil/api`), no una API pública documentada.
 * El reconocimiento está en `docs/RECON.md`; las tres reglas que impone:
 *
 *  1. **Un `200` no significa que la ruta exista.** IIS enruta lo desconocido
 *     bajo `/sil/` al catch-all de la SPA y devuelve HTML con estado 200. Hay
 *     que validar `content-type`, nunca el código de estado.
 *  2. **Solo GET.** El único endpoint de escritura del SIL
 *     (`suscriptor/suscribirse`) no se toca jamás.
 *  3. **User-Agent identificable**, y ritmo conservador.
 */

import type { Tono } from "@/lib/estados";
import { z } from "zod";
import { pedirJsonOLanzar } from "@/lib/pedir";
import { enlace } from "@/lib/grafo";
import { agujas, contieneTodas, palabrasTecleadas, plano, variantesAcento } from "@/lib/raiz";
import { llevaCedula, sinCedula } from "@/lib/padron";

const BASE = "https://www.diputadosrd.gob.do/sil/api";

const USER_AGENT =
  "Socratico-Inteligencia/1.0 (monitoreo legislativo; herramienta independiente)";

/** El origen pagina de 10 en 10 y no acepta otro tamaño. */
export const SIL_PAGE_SIZE = 10;

const TIMEOUT_MS = 25_000;

/* --------------------------------------------------------------- tipos */

/** Envoltorio de paginación uniforme en todos los listados del SIL. */
export interface SilPage<T> {
  page: number;
  pageSize: number;
  total: number;
  results: T[];
}

/** Iniciativa cruda, tal como responde el SIL. */
export interface SilIniciativa {
  id: number;
  tipo: string | null;
  camaraInicio: string | null;
  numero: string | null;
  descripcion: string | null;
  periodoRegistro: string | null;
  materia: string | null;
  numPromulgacion: string | null;
  fechaPromulgacion: string | null;
  condicion: string | null;
  estado: string | null;
  fechaDeposito: string | null;
  fechaUltimoCambioPrincipal: string | null;
  grupoId: number | null;
  grupo: string | null;
  origen: string | null;
  legislatura: string | null;
}

export interface SilHistorico {
  id: number;
  estado: string | null;
  inicio: string | null;
  fin: string | null;
}

export interface SilProponente {
  principal: boolean;
  legisladorId: number | null;
  nombres: string | null;
  apellidos: string | null;
  nombreCompleto: string | null;
  representacion: {
    funcion: string | null;
    provincia: string | null;
    partido: { nombre: string | null; siglas: string | null } | null;
    periodo: string | null;
  } | null;
}

export interface SilDocumento {
  id: number;
  descripcion: string | null;
  extension: string | null;
  cargado: string | null;
}

export interface SilGrupo {
  id: number;
  descripcion: string;
  icono: string | null;
}

export interface SilPeriodo {
  id: number;
  description: string;
  isCurrent: boolean;
}

/* --------------------------------------------------------------- fetch */

function emptyPage<T>(): SilPage<T> {
  return { page: 1, pageSize: SIL_PAGE_SIZE, total: 0, results: [] };
}

/**
 * La envoltura de toda respuesta paginada del SIL. Si el SIL renombra
 * `total` o `results`, la lectura falla con su motivo en vez de contar cero
 * o reventar más abajo en un `.map` de `undefined`.
 */
const PAGINA_SIL = z.looseObject({
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  results: z.array(z.unknown()),
});

/**
 * Wrapper único de todas las llamadas al SIL, sobre el contrato de la casa
 * (`lib/pedir.ts`): timeout, **un reintento** y la validación de
 * `content-type` que exige la regla 1 —HTML con 200 es un fallo de ruta
 * disfrazado de éxito—. Las rutas paginadas (`?page=`) validan además su
 * envoltura.
 */
async function silFetch<T>(path: string, revalidate = 600): Promise<T> {
  try {
    return (await pedirJsonOLanzar(`${BASE}/${path}`, {
      fuente: "congreso",
      ua: USER_AGENT,
      tipo: /application\/json/i,
      cabeceras: { Accept: "application/json" },
      espera: TIMEOUT_MS,
      revalidate,
      esquema: /[?&]page=/.test(path) ? PAGINA_SIL : undefined,
    })) as T;
  } catch (err) {
    throw new Error(`SIL ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Como `silFetch`, pero degrada a `null` en vez de tumbar la vista. */
async function silFetchSafe<T>(path: string, revalidate?: number): Promise<T | null> {
  try {
    return await silFetch<T>(path, revalidate);
  } catch (err) {
    console.error(`[congreso] ${String(err)}`);
    return null;
  }
}

/**
 * Una lectura que distingue «no existe» de «no contestó». `silFetchSafe` las
 * funde en `null`, y para una ficha eso es la diferencia entre un 404 y una
 * pantalla de caída: decir «no encontrada» de una votación que existe es
 * afirmar una falsedad sobre el registro.
 */
export type Lectura<T> = T | "inexistente" | "caida";

async function silFetchEstado<T>(path: string, revalidate?: number): Promise<T | "caida"> {
  try {
    return await silFetch<T>(path, revalidate);
  } catch (err) {
    console.error(`[congreso] ${String(err)}`);
    return "caida";
  }
}

/* ----------------------------------------------------------- consultas */

/** Censo de iniciativas del registro vigente. */
export async function getCountIniciativas(): Promise<number | null> {
  return silFetchSafe<number>("iniciativa/CountIniciativas", 3600);
}

/**
 * Listado de iniciativas. `keyword` hace match de subcadena sobre la
 * descripción y funciona con frases de varias palabras. Es el registro entero,
 * sin más filtro que el texto: para cortar por tema, tipo o perimidas está
 * `listIniciativasFiltradas`.
 */
export async function listIniciativas(
  page = 1,
  keyword = "",
  revalidate = 300,
): Promise<SilPage<SilIniciativa>> {
  // El SIL busca por subcadena: a una persona no se la busca por su número.
  if (llevaCedula(keyword)) return emptyPage();
  const q = `iniciativa/getIniciativas?page=${page}&keyword=${encodeURIComponent(keyword)}`;
  return (await silFetchSafe<SilPage<SilIniciativa>>(q, revalidate)) ?? emptyPage();
}

/** Los dos tipos que el endpoint filtrado distingue: un booleano, no un id. */
export type TipoIniciativa = "ley" | "resolucion";

export interface FiltroIniciativas {
  /** Id de uno de los 15 temas de `iniciativa/Grupos`. Obligatorio en el origen. */
  grupo: number;
  tipo: TipoIniciativa;
  /** `true`: solo las perimidas; `false`: todas las demás. No hay «ambas». */
  perimidas: boolean;
}

/**
 * El listado filtrado del SIL (`iniciativa/iniciativas`), el mismo que usa su
 * portal al entrar a un tema. Mecánica verificada el 2026-09-24 leyendo el
 * bundle del portal y contra el origen (docs/RECON.md §2.2):
 *
 *  · `tipo` es un **booleano**, no el `tipoId`: `true` son los proyectos de
 *    ley y `false` las resoluciones (internas y bicamerales). Con el id
 *    numérico —lo que se había probado— responde 400.
 *  · `perimidas=true` trae solo las perimidas y `false` todas las demás.
 *  · `grupo` es **obligatorio**: sin él la ruta no existe (404), vacío da 400 y
 *    `0` devuelve cero filas. No hay forma de pedir un tipo en todos los temas.
 *  · Los 15 temas × 2 tipos × 2 valores de `perimidas` suman exactamente el
 *    censo de `getIniciativas` (6,357 el día de la prueba): el reparto es una
 *    partición, así que cada filtro dice la verdad sobre el registro entero.
 *
 * `null` si el SIL no contestó, para que la vista no confunda «no hay» con
 * «no pudimos mirar».
 */
export async function listIniciativasFiltradas(
  page: number,
  filtro: FiltroIniciativas,
  keyword = "",
  revalidate = 300,
): Promise<SilPage<SilIniciativa> | null> {
  const q =
    `iniciativa/iniciativas?page=${page}&grupo=${filtro.grupo}` +
    `&tipo=${filtro.tipo === "ley"}&perimidas=${filtro.perimidas}` +
    `&keyword=${encodeURIComponent(keyword)}`;
  return silFetchSafe<SilPage<SilIniciativa>>(q, revalidate);
}

/**
 * Como `listIniciativas`, pero distingue «cero resultados» de «el SIL no
 * contestó»: devuelve `null` en el segundo caso. Para los cruces entre
 * verticales, que deben callar si no pudieron mirar en vez de afirmar que no
 * hay nada.
 */
export async function buscarIniciativas(
  keyword: string,
  page = 1,
  revalidate = 3600,
): Promise<SilPage<SilIniciativa> | null> {
  const q = `iniciativa/getIniciativas?page=${page}&keyword=${encodeURIComponent(keyword)}`;
  return silFetchSafe<SilPage<SilIniciativa>>(q, revalidate);
}

/** Lo que el buscador de la Cámara hizo con la consulta, para decirlo en pantalla. */
export interface BusquedaIniciativas {
  pagina: SilPage<SilIniciativa>;
  /** La página que se sirve, ya acotada al total. */
  page: number;
  /** Lo que se pidió al SIL, si difiere de lo tecleado («educación» por «educacion»). */
  enviado: string | null;
  /** `true`: se leyeron solo las primeras `leidas` iniciativas de la palabra más rara. */
  truncado: boolean;
  leidas: number;
  /** `true`: se sirvió la frase exacta del SIL, no todas las palabras en cualquier orden. */
  frase: boolean;
}

/**
 * El presupuesto de una búsqueda en el SIL, para que ninguna consulta —ni una
 * URL escrita a mano— se convierta en un barrido (`.claude/rules/fuentes.md`):
 * a lo sumo tres palabras, doce primeras páginas entre todas sus formas, y
 * trescientas iniciativas leídas para filtrar en casa, entre todas las formas.
 * Todo en lotes de `CONCURRENCIA`.
 */
const MAX_PALABRAS_SIL = 3;
const MAX_SONDEOS_SIL = 12;
const LIMITE_LECTURA = 300;

type FormaViva = { forma: string; primera: SilPage<SilIniciativa> };

/** En lotes de `CONCURRENCIA`, nunca todo a la vez. */
async function enLotes<T, R>(xs: T[], f: (x: T) => Promise<R>): Promise<R[]> {
  const salida: R[] = [];
  for (let i = 0; i < xs.length; i += CONCURRENCIA) salida.push(...(await Promise.all(xs.slice(i, i + CONCURRENCIA).map(f))));
  return salida;
}

/**
 * Las formas de una palabra que el SIL conoce, con cuántas iniciativas trae
 * cada una. `fallo`: alguna forma no contestó, así que un cero no es «no hay».
 */
async function formasEnSil(palabra: string, maxFormas: number, revalidate: number) {
  const formas = await enLotes(variantesAcento(palabra).slice(0, maxFormas), async (forma) => ({
    forma,
    primera: await buscarIniciativas(forma, 1, revalidate),
  }));
  const fallo = formas.some((f) => f.primera === null);
  const vivas = formas.filter((f): f is FormaViva => (f.primera?.total ?? 0) > 0);
  const total = vivas.reduce((n, f) => n + f.primera.total, 0);
  const mejor = [...vivas].sort((a, b) => b.primera.total - a.primera.total)[0]?.forma ?? palabra;
  return { palabra, vivas, total, mejor, fallo };
}

/** Las páginas de una forma, hasta `limite` filas, reusando la primera. `completa`: no faltó ninguna. */
async function leerForma(forma: string, primera: SilPage<SilIniciativa>, limite: number, revalidate: number) {
  const paginas = Math.min(Math.ceil(primera.total / SIL_PAGE_SIZE), Math.ceil(limite / SIL_PAGE_SIZE));
  const resto = Array.from({ length: Math.max(0, paginas - 1) }, (_, i) => i + 2);
  const lotes = await enLotes(resto, (p) => buscarIniciativas(forma, p, revalidate));
  const filas = [...primera.results, ...lotes.flatMap((r) => r?.results ?? [])];
  return { filas, completa: lotes.every((r) => r !== null) };
}

const recientes = (a: SilIniciativa, b: SilIniciativa) =>
  (b.fechaDeposito ?? "").localeCompare(a.fechaDeposito ?? "") || b.id - a.id;

/**
 * El buscador de la Cámara, tolerante. El SIL compara la descripción letra por
 * letra: ignora mayúsculas pero no tildes ni orden —verificado el 2026-09-26:
 * «educación» trae 254, «educacion» 0; «medio ambiente» 69, «ambiente
 * medio» 0—. Aquí se busca como en `/buscar`, **todas las palabras, en
 * cualquier orden, con o sin tilde**, dentro del presupuesto de arriba:
 *
 *  1. Cada palabra tecleada sin tilde se prueba con sus formas con tilde
 *     (`variantesAcento`); la que ya trae tilde va tal cual.
 *  2. Una sola palabra en una sola forma: la paginación es la del SIL.
 *  3. Si no, se leen las iniciativas de la palabra más rara (hasta
 *     `LIMITE_LECTURA` entre todas sus formas), se filtran aquí por todas las
 *     palabras y se paginan aquí, las más recientes primero. Si la palabra
 *     más rara pasa del límite, se sirve la frase exacta del SIL y se dice
 *     (`frase`); si tampoco trae nada, la lectura se declara truncada.
 *
 * `null` si el SIL no contestó, también cuando una forma no contestó y no se
 * encontró nada: «no hay» y «no pudimos mirar» son pantallas distintas.
 */
export async function buscarIniciativasTolerante(
  consulta: string,
  page: number,
  revalidate = 300,
): Promise<BusquedaIniciativas | null> {
  const palabras = palabrasTecleadas(consulta).slice(0, MAX_PALABRAS_SIL);
  const base = { enviado: null, truncado: false, leidas: 0, frase: false };
  if (palabras.length === 0) {
    const r = await buscarIniciativas("", page, revalidate);
    return r && { ...base, pagina: r, page };
  }
  const porPalabra = Math.max(1, Math.floor(MAX_SONDEOS_SIL / palabras.length));
  const conocidas = [];
  for (const w of palabras) conocidas.push(await formasEnSil(w, porPalabra, revalidate));
  const vacia = (): BusquedaIniciativas => ({
    ...base,
    pagina: { page: 1, pageSize: SIL_PAGE_SIZE, total: 0, results: [] },
    page: 1,
  });
  // Una palabra que el SIL no conoce en ninguna forma: no hay ninguna con
  // todas. Salvo que alguna forma no contestara: entonces no lo sabemos.
  const sinNada = conocidas.filter((f) => f.total === 0);
  if (sinNada.some((f) => f.fallo)) return null;
  if (sinNada.length > 0) return vacia();

  const tecleado = palabras.join(" ");
  const sirvePorSil = async (clave: string, total: number, frase: boolean): Promise<BusquedaIniciativas | null> => {
    const ultima = Math.max(1, Math.ceil(total / SIL_PAGE_SIZE));
    const p = Math.min(page, ultima);
    const r = await buscarIniciativas(clave, p, revalidate);
    return r && { ...base, pagina: r, page: p, enviado: clave === tecleado ? null : clave, frase };
  };

  if (conocidas.length === 1 && conocidas[0].vivas.length === 1) {
    const [f] = conocidas;
    return sirvePorSil(f.vivas[0].forma, f.total, false);
  }

  const rara = [...conocidas].sort((a, b) => a.total - b.total)[0];
  if (rara.total > LIMITE_LECTURA && conocidas.length > 1) {
    const frase = conocidas.map((f) => f.mejor).join(" ");
    const r = await buscarIniciativas(frase, 1, revalidate);
    if (r === null) return null;
    if (r.total > 0) return sirvePorSil(frase, r.total, true);
  }

  const a = agujas(consulta);
  const vistas = new Map<number, SilIniciativa>();
  let leidas = 0;
  let truncado = false;
  for (const v of rara.vivas) {
    const queda = LIMITE_LECTURA - leidas;
    if (queda <= 0) {
      truncado = true;
      break;
    }
    const { filas, completa } = await leerForma(v.forma, v.primera, queda, revalidate);
    leidas += filas.length;
    if (!completa || v.primera.total > filas.length) truncado = true;
    for (const f of filas) if (contieneTodas(plano(f.descripcion ?? ""), a)) vistas.set(f.id, f);
  }
  const todas = [...vistas.values()].sort(recientes);
  const ultima = Math.max(1, Math.ceil(todas.length / SIL_PAGE_SIZE));
  const p = Math.min(page, ultima);
  const variante = conocidas.map((f) => f.mejor).join(" ");
  return {
    ...base,
    pagina: {
      page: p,
      pageSize: SIL_PAGE_SIZE,
      total: todas.length,
      results: todas.slice((p - 1) * SIL_PAGE_SIZE, p * SIL_PAGE_SIZE),
    },
    page: p,
    enviado: variante === tecleado ? null : variante,
    truncado,
    leidas,
  };
}

/**
 * La consulta con cada palabra en la forma que el SIL conoce, para los
 * listados filtrados por tema, que solo aceptan una frase. Mismo presupuesto.
 */
export async function fraseParaSil(consulta: string, revalidate = 300): Promise<string> {
  const palabras = palabrasTecleadas(consulta).slice(0, MAX_PALABRAS_SIL);
  if (palabras.length === 0) return consulta;
  const porPalabra = Math.max(1, Math.floor(MAX_SONDEOS_SIL / palabras.length));
  const mejores: string[] = [];
  for (const w of palabras) mejores.push((await formasEnSil(w, porPalabra, revalidate)).mejor);
  return mejores.join(" ");
}

export async function getIniciativa(id: number): Promise<SilIniciativa | null> {
  return silFetchSafe<SilIniciativa>(`iniciativa/iniciativa/${id}`, 300);
}

/** Traza de estados. Devuelve intervalos (`inicio`/`fin`), no eventos. */
export async function getHistoricos(id: number): Promise<SilPage<SilHistorico>> {
  return (await leerHistoricos(id)) ?? emptyPage();
}

/** Como `getHistoricos`, pero `null` si el SIL no contestó (para el RSS). */
export async function leerHistoricos(id: number): Promise<SilPage<SilHistorico> | null> {
  return silFetchSafe<SilPage<SilHistorico>>(`iniciativa/historicos?page=1&id=${id}`, 300);
}

export async function getProponentes(id: number): Promise<SilPage<SilProponente>> {
  return (
    (await silFetchSafe<SilPage<SilProponente>>(`iniciativa/proponentes?page=1&id=${id}`, 300)) ??
    emptyPage()
  );
}

/** Documentos PDF de la pieza. Versionados append-only: no se sobrescriben. */
export async function getDocumentos(id: number): Promise<SilPage<SilDocumento>> {
  return (
    (await silFetchSafe<SilPage<SilDocumento>>(`iniciativa/documentos?page=1&id=${id}`, 300)) ??
    emptyPage()
  );
}

/** Taxonomía temática oficial: 15 grupos con id estable. */
export async function getGrupos(): Promise<SilGrupo[]> {
  return (await silFetchSafe<SilGrupo[]>("iniciativa/Grupos", 86400)) ?? [];
}

/** Períodos legislativos. Las fechas vienen con mes `00`: no parsearlas. */
export async function getPeriodos(): Promise<SilPeriodo[]> {
  return (await silFetchSafe<SilPeriodo[]>("periodolegislativo/all", 86400)) ?? [];
}

/**
 * Base para descargar un documento, resuelta en runtime.
 *
 * El bundle del SIL trae una URL hardcodeada distinta de la que devuelve este
 * endpoint, así que hay que preguntarla y no fijarla. El host que responde es
 * on-premise en RD y rechaza conexiones desde fuera del país (docs/RECON.md §2.9).
 */
export async function getRutaDocumento(): Promise<string | null> {
  return silFetchSafe<string>("comun/GetRutaDocumento/", 86400);
}

export function documentoUrl(base: string | null, documentoId: number): string | null {
  return base ? `${base}${documentoId}` : null;
}

/* ------------------------------------------------------ normalización */

/**
 * Colapsa espacios repetidos y recorta. El SIL trae `"Mélido  Mercedes"`. Y
 * quita la cédula que traiga un texto oficial (`sinCedula`): por aquí pasan
 * las descripciones del Congreso y los títulos que `desdeMayusculas` pinta.
 */
export function limpiarTexto(valor: string | null | undefined): string {
  return sinCedula((valor ?? "").replace(/\s+/g, " ").trim());
}

/** Palabras que no se capitalizan en medio de un título en español. */
const ATONAS = new Set([
  "y", "e", "o", "u", "de", "del", "la", "las", "el", "los", "en", "a", "al",
  "por", "para", "con", "sin", "que", "su", "sus", "un", "una",
  // Fórmulas de la técnica legislativa: aparecen en casi todos los títulos
  // («…, mediante la cual se deroga…») y en versalita quedan de adorno.
  "se", "cual", "cuales", "mediante", "sobre", "como", "lo", "le", "les",
  "ni", "o", "sino", "según", "ante", "tras", "es",
]);

/** Capitaliza un texto que viene TODO EN MAYÚSCULAS; deja intacto el resto. */
export function desdeMayusculas(valor: string): string {
  const limpio = limpiarTexto(valor);
  if (limpio !== limpio.toUpperCase()) return limpio;

  return limpio
    .toLowerCase()
    .replace(
      /(^|[\s(/-])([a-záéíóúñ][a-záéíóúñ]*)/g,
      (_, sep: string, palabra: string) =>
        sep +
        (sep !== "" && ATONAS.has(palabra)
          ? palabra
          : palabra.charAt(0).toUpperCase() + palabra.slice(1)),
    );
}

export interface NumeroExpediente {
  completo: string;
  secuencia: string | null;
  periodoRegistro: string | null;
  camara: string | null;
}

/**
 * Descompone `06225-2024-2028-CD`.
 *
 * Es un identificador de **cita**, no de identidad: incorpora el período de
 * registro y cambia cuando la pieza se arrastra al siguiente. La identidad
 * estable es el `id` interno.
 */
export function parseNumero(numero: string | null | undefined): NumeroExpediente | null {
  const completo = limpiarTexto(numero);
  if (!completo) return null;

  const m = /^(\d+)-(\d{4}-\d{4})-([A-Z]+)$/i.exec(completo);
  if (!m) return { completo, secuencia: null, periodoRegistro: null, camara: null };

  return {
    completo,
    secuencia: m[1],
    periodoRegistro: m[2],
    camara: m[3].toUpperCase(),
  };
}

/**
 * El SIL guarda el título reformulado dentro de la misma `descripcion`, detrás
 * de un marcador en mayúsculas. Separarlo importa: que a una pieza le cambien
 * el título durante el trámite es justo lo que un abogado quiere ver.
 */
export function separarTitulo(descripcion: string): {
  titulo: string;
  tituloModificado: string | null;
} {
  const m = /\bT[ÍI]TULO\s+MODIFICADO\s*:\s*/i.exec(descripcion);
  if (!m) return { titulo: descripcion, tituloModificado: null };

  const titulo = descripcion.slice(0, m.index).trim().replace(/[.\s]+$/, "");
  const modificado = descripcion.slice(m.index + m[0].length).trim();

  return { titulo: titulo || descripcion, tituloModificado: modificado || null };
}

/**
 * El tono de una condición procesal es el mismo lenguaje de color que el de un
 * proceso de compras: `lib/estados.ts` lo define una sola vez para toda la
 * plataforma y aquí solo se **traduce** el vocabulario de la cámara.
 *
 * El reparto importa, y antes estaba invertido. Una pieza *promulgada* llegó
 * al final de su trámite: es `cumplido`, el verde de archivo que la identidad
 * reserva justo para eso —y que este módulo le daba a una pieza recién
 * depositada—. Una pieza *depositada o en comisión* sigue abierta a que
 * alguien haga algo —leerla, opinarla, empujarla—: es `accionable`, igual que
 * una licitación que aún admite ofertas. Una pieza *perimida* se cayó sin
 * llegar a nada: el sello.
 *
 * Rechazada y retirada se quedan en `contexto` a propósito: también murieron,
 * pero el sello se gasta si marca a todos los muertos, y la perención es la
 * única de las tres que la plataforma vigila (`/congreso/perencion`).
 */
export type CondicionTono = Tono;

/** Agrupa la condición del SIL en el tono semántico que usa la UI. */
export function tonoDeCondicion(condicion: string | null | undefined): CondicionTono {
  const c = (condicion ?? "").toUpperCase();
  if (c.includes("PERIMID")) return "anulado";
  if (c.includes("APROBAD") || c.includes("PROMULGAD")) return "cumplido";
  if (c.includes("RECHAZAD") || c.includes("RETIRAD")) return "contexto";
  if (c.includes("VIGENTE") || c.includes("DEPOSITAD")) return "accionable";
  return "contexto";
}

/**
 * Cómo se **dice** la condición del SIL en una marca de estado.
 *
 * El SIL publica la condición en versales —«APROBADO», «VIGENTE»— y la ficha la
 * pintaba tal cual al lado de una marca escrita en caja mixta («Promulgada»):
 * dos voces en la misma fila, y la primera en masculino hablando de una
 * iniciativa. Además «vigente» se lee como «ley vigente», cuando en el SIL
 * significa lo contrario: que sigue en trámite y todavía puede perimir.
 */
const ETIQUETA_CONDICION: [RegExp, string][] = [
  [/PERIMID/, "Perimida"],
  [/PROMULGAD/, "Promulgada"],
  [/APROBAD/, "Aprobada"],
  [/RECHAZAD/, "Rechazada"],
  [/RETIRAD/, "Retirada"],
  [/ARCHIVAD/, "Archivada"],
  [/FUSIONAD/, "Fusionada"],
  [/DEPOSITAD/, "Depositada"],
  [/VIGENTE/, "En trámite"],
];

export interface MarcaIniciativa {
  /** Lo que se lee, en caja mixta y en llano. */
  label: string;
  tono: CondicionTono;
  /** El literal del origen, para el `title` de la marca. */
  original: string;
}

/**
 * La **única** marca de estado de una iniciativa, derivada del punto más
 * avanzado que se conoce.
 *
 * La ficha pintaba dos: la condición cruda («APROBADO») y, al lado,
 * «Promulgada». Una pieza promulgada ya fue aprobada; decirlo dos veces obliga
 * al lector a decidir cuál de las dos manda. Manda la promulgación, y la
 * condición del SIL queda en el `title` para quien quiera el literal.
 */
export function marcaDeIniciativa(
  ini: Pick<Iniciativa, "condicion" | "estado" | "tono" | "promulgada" | "numPromulgacion">,
): MarcaIniciativa {
  const literal = [ini.condicion, ini.estado].filter(Boolean).join(" · ");
  const original = literal ? `El SIL la registra como «${literal}»` : "El SIL no le registra condición ni estado";
  if (ini.promulgada || /promulgad/i.test(ini.estado ?? "")) {
    return {
      label: "Promulgada",
      tono: "cumplido",
      original: ini.numPromulgacion ? `${original} · ${ini.numPromulgacion}` : original,
    };
  }
  const c = (ini.condicion ?? "").toUpperCase();
  const label =
    ETIQUETA_CONDICION.find(([re]) => re.test(c))?.[1] ??
    (ini.condicion ? desdeMayusculas(ini.condicion.toUpperCase()) : "Sin condición");
  return { label, tono: ini.tono, original };
}

export interface Iniciativa {
  id: number;
  numero: NumeroExpediente | null;
  titulo: string;
  tituloModificado: string | null;
  tipo: string | null;
  camaraOrigen: string | null;
  grupo: string | null;
  grupoId: number | null;
  materia: string | null;
  condicion: string | null;
  estado: string | null;
  tono: CondicionTono;
  /** Sigue viva y por tanto puede perimir. */
  viva: boolean;
  legislatura: string | null;
  periodoRegistro: string | null;
  fechaDeposito: string | null;
  fechaUltimoCambio: string | null;
  promulgada: boolean;
  numPromulgacion: string | null;
  fechaPromulgacion: string | null;
}

export function normalizarIniciativa(raw: SilIniciativa): Iniciativa {
  const condicion = limpiarTexto(raw.condicion) || null;
  // `promulgada` sigue siendo lo que dicen los campos de promulgación, y nada
  // más: entra en la huella del seguimiento (`huellaDe`) y cambiar su
  // significado avisaría de un cambio que no ocurrió. El estado «Promulgado»
  // —el listado de propuestas de un legislador no trae aquellos campos— lo
  // leen la marca y el dossier, que miran el punto más avanzado.
  const promulgada = Boolean(raw.fechaPromulgacion || raw.numPromulgacion);
  // Una pieza promulgada llegó al final aunque la condición no lo diga: ni
  // sigue viva ni puede perimir.
  const tono: CondicionTono =
    promulgada || /promulgad/i.test(raw.estado ?? "") ? "cumplido" : tonoDeCondicion(condicion);
  const { titulo, tituloModificado } = separarTitulo(
    limpiarTexto(raw.descripcion) || "(sin descripción)",
  );

  return {
    id: raw.id,
    numero: parseNumero(raw.numero),
    titulo,
    tituloModificado,
    tipo: limpiarTexto(raw.tipo) || null,
    camaraOrigen: limpiarTexto(raw.camaraInicio) || null,
    grupo: limpiarTexto(raw.grupo) || null,
    grupoId: raw.grupoId,
    materia: raw.materia ? desdeMayusculas(raw.materia) : null,
    condicion,
    estado: limpiarTexto(raw.estado) || null,
    tono,
    viva: tono === "accionable",
    legislatura: limpiarTexto(raw.legislatura) || null,
    periodoRegistro: limpiarTexto(raw.periodoRegistro) || null,
    fechaDeposito: raw.fechaDeposito,
    fechaUltimoCambio: raw.fechaUltimoCambioPrincipal,
    promulgada,
    numPromulgacion: limpiarTexto(raw.numPromulgacion) || null,
    fechaPromulgacion: raw.fechaPromulgacion,
  };
}

export interface Proponente {
  legisladorId: number | null;
  nombre: string;
  principal: boolean;
  funcion: string | null;
  provincia: string | null;
  partidoSiglas: string | null;
}

export function normalizarProponente(raw: SilProponente): Proponente {
  return {
    legisladorId: raw.legisladorId,
    nombre:
      limpiarTexto(raw.nombreCompleto) ||
      limpiarTexto(`${raw.nombres ?? ""} ${raw.apellidos ?? ""}`) ||
      "(sin nombre)",
    principal: Boolean(raw.principal),
    funcion: limpiarTexto(raw.representacion?.funcion) || null,
    provincia: raw.representacion?.provincia
      ? desdeMayusculas(raw.representacion.provincia)
      : null,
    partidoSiglas: limpiarTexto(raw.representacion?.partido?.siglas) || null,
  };
}

/**
 * Etapa de un documento. `texto` marca los que contienen articulado —los que
 * una comparación entre lecturas compara—; el resto es tramitación.
 */
export interface EtapaDocumento {
  clave: "deposito" | "modificacion" | "aprobado" | "informe" | "acuse" | "aviso" | "otro";
  texto: boolean;
}

/**
 * Clasifica la etiqueta libre del SIL. Deliberadamente tolerante: el origen
 * escribe en mayúsculas, con acentos inconsistentes, espacios iniciales y el
 * nombre de la comisión pegado.
 */
export function clasificarDocumento(descripcion: string | null | undefined): EtapaDocumento {
  const d = limpiarTexto(descripcion)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (d.includes("MODIFICACION")) return { clave: "modificacion", texto: true };
  if (d.includes("APROBADO")) return { clave: "aprobado", texto: true };
  if (d.includes("DEPOSITADO")) return { clave: "deposito", texto: true };
  if (d.includes("INFORME")) return { clave: "informe", texto: false };
  if (d.includes("ACUSE")) return { clave: "acuse", texto: false };
  if (d.includes("AVISO")) return { clave: "aviso", texto: false };
  return { clave: "otro", texto: false };
}

export interface Documento {
  id: number;
  etiqueta: string;
  etapa: EtapaDocumento;
  extension: string | null;
  cargado: string | null;
}

export function normalizarDocumento(raw: SilDocumento): Documento {
  return {
    id: raw.id,
    etiqueta: desdeMayusculas(raw.descripcion ?? "") || "Documento",
    etapa: clasificarDocumento(raw.descripcion),
    extension: limpiarTexto(raw.extension).toLowerCase() || null,
    cargado: raw.cargado,
  };
}

/* ------------------------------------------------ legislaturas y perención */

/** Días que dura una legislatura ordinaria, contando el día de apertura. */
export const DURACION_LEGISLATURA_DIAS = 150;

/** Ventana de aviso previo al cierre, en días. */
export const VENTANA_ALERTA_DIAS = 30;

export type TipoLegislatura = "PLO" | "SLO";

export interface Legislatura {
  codigo: string;
  anio: number;
  tipo: TipoLegislatura;
  nombre: string;
  inicio: Date;
  /** Último día de la legislatura (inicio + 149 días). */
  cierre: Date;
}

// Mes en base 0, como espera Date.UTC.
const INICIOS: Record<TipoLegislatura, { mes: number; dia: number }> = {
  PLO: { mes: 1, dia: 27 }, // 27 de febrero
  SLO: { mes: 7, dia: 16 }, // 16 de agosto
};

const NOMBRES: Record<TipoLegislatura, string> = {
  PLO: "Primera Legislatura Ordinaria",
  SLO: "Segunda Legislatura Ordinaria",
};

const MS_POR_DIA = 86_400_000;

/** Diferencia en días completos entre dos fechas (b − a). */
export function diffDias(a: Date, b: Date): number {
  const ua = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const ub = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((ub - ua) / MS_POR_DIA);
}

/** Interpreta un código `"2026-SLO"`. Devuelve `null` si no tiene esa forma. */
export function parseLegislatura(codigo: string | null | undefined): Legislatura | null {
  if (!codigo) return null;

  const m = /^(\d{4})\s*-\s*(PLO|SLO)$/i.exec(codigo.trim());
  if (!m) return null;

  const anio = Number(m[1]);
  const tipo = m[2].toUpperCase() as TipoLegislatura;
  const { mes, dia } = INICIOS[tipo];

  const inicio = new Date(Date.UTC(anio, mes, dia));
  const cierre = new Date(inicio.getTime() + (DURACION_LEGISLATURA_DIAS - 1) * MS_POR_DIA);

  return { codigo: codigo.trim(), anio, tipo, nombre: NOMBRES[tipo], inicio, cierre };
}

/** La legislatura ordinaria vigente en una fecha dada, si hay alguna. */
export function legislaturaVigente(hoy: Date = new Date()): Legislatura | null {
  const anio = hoy.getUTCFullYear();
  return (
    [
      parseLegislatura(`${anio}-PLO`),
      parseLegislatura(`${anio}-SLO`),
      // La SLO cruza el año: en enero seguimos dentro de la del año anterior.
      parseLegislatura(`${anio - 1}-SLO`),
    ]
      .filter((l): l is Legislatura => l !== null)
      .find((l) => hoy >= l.inicio && hoy <= l.cierre) ?? null
  );
}

export type EstadoPerencion =
  | { estado: "sin-datos" }
  | { estado: "cerrada"; legislatura: Legislatura }
  | { estado: "en-riesgo"; legislatura: Legislatura; diasRestantes: number }
  | { estado: "vigente"; legislatura: Legislatura; diasRestantes: number };

/** Situación de una pieza viva frente al cierre de su legislatura. */
export function evaluarPerencion(
  codigoLegislatura: string | null | undefined,
  hoy: Date = new Date(),
): EstadoPerencion {
  const legislatura = parseLegislatura(codigoLegislatura);
  if (!legislatura) return { estado: "sin-datos" };

  const diasRestantes = diffDias(hoy, legislatura.cierre);
  if (diasRestantes < 0) return { estado: "cerrada", legislatura };
  if (diasRestantes <= VENTANA_ALERTA_DIAS) {
    return { estado: "en-riesgo", legislatura, diasRestantes };
  }
  return { estado: "vigente", legislatura, diasRestantes };
}

/* -------------------------------------------------------------- agregados */

/** Peticiones simultáneas al SIL. Conservador a propósito. */
const CONCURRENCIA = 4;

export interface Muestra {
  iniciativas: Iniciativa[];
  /** Censo declarado por el origen, no el tamaño de la muestra. */
  total: number | null;
  /** Cuántas iniciativas se recorrieron realmente. */
  muestra: number;
}

/**
 * Trae `paginas` páginas del listado, en lotes.
 *
 * El SIL pagina de 10 en 10 y no expone agregados, así que recorrer las ~622
 * páginas del corpus en cada render es inviable. Hasta que exista una capa de
 * ingesta persistente, las vistas trabajan sobre una muestra acotada y lo
 * declaran, en vez de presentar el número como si fuera el censo completo.
 */
export async function muestrearIniciativas(paginas: number, keyword = ""): Promise<Muestra> {
  const numeros = Array.from({ length: paginas }, (_, i) => i + 1);
  const acumulado: Iniciativa[] = [];
  let total: number | null = null;

  for (let i = 0; i < numeros.length; i += CONCURRENCIA) {
    const respuestas = await Promise.all(
      numeros.slice(i, i + CONCURRENCIA).map((page) => listIniciativas(page, keyword)),
    );
    for (const r of respuestas) {
      if (total === null && r.total > 0) total = r.total;
      acumulado.push(...r.results.map(normalizarIniciativa));
    }
  }

  return { iniciativas: acumulado, total, muestra: paginas * SIL_PAGE_SIZE };
}

export interface ResumenLegislativo {
  vivas: number;
  aprobadas: number;
  perimidas: number;
  otras: number;
  enRiesgo: Iniciativa[];
  porGrupo: { grupo: string; total: number }[];
}

/** Conteos y cortes sobre una muestra ya normalizada. */
export function resumirIniciativas(iniciativas: Iniciativa[]): ResumenLegislativo {
  let vivas = 0;
  let aprobadas = 0;
  let perimidas = 0;
  let otras = 0;

  const enRiesgo: Iniciativa[] = [];
  const grupos = new Map<string, number>();

  for (const ini of iniciativas) {
    if (ini.tono === "accionable") vivas++;
    else if (ini.tono === "cumplido") aprobadas++;
    else if (ini.tono === "anulado") perimidas++;
    else otras++;

    if (ini.viva && evaluarPerencion(ini.legislatura).estado === "en-riesgo") {
      enRiesgo.push(ini);
    }

    if (ini.grupo) grupos.set(ini.grupo, (grupos.get(ini.grupo) ?? 0) + 1);
  }

  const porGrupo = [...grupos.entries()]
    .map(([grupo, total]) => ({ grupo, total }))
    .sort((a, b) => b.total - a.total);

  return { vivas, aprobadas, perimidas, otras, enRiesgo, porGrupo };
}

/* ------------------------------------------------------------ legisladores */

/*
  Directorio, ficha, propuestas y voto nominal. Mecánica verificada en
  docs/RECON.md §14 (2026-09-23):

  · `legislador/legisladores?page=&nivel=` espera en `nivel` el **id de la
    demarcación**, no el del nivel: el id de una provincia (`Provincias/1`),
    `2892` para la lista nacional y `3403` para el exterior. `nivel=1` responde
    0 filas y un `nivel` vacío o `null`, 400. Treinta y cuatro demarcaciones,
    41 peticiones, 221 personas (189 diputados y 32 senadores).
  · `legislador/Iniciativas?legisladorId=` son las piezas donde figura como
    proponente, de la más reciente a la más antigua. Su campo `principal` viene
    siempre `false` y no se usa.
  · `legislador/votaciones?legisladorId=&keyword=` filtra `keyword` sobre el
    número de sesión (`00008-2026-SLO`): con el código de la legislatura se
    obtienen sus votaciones, de la sesión más reciente hacia atrás.
  · `votacion/legisladores/?id=` es el voto nominal de una votación: 190 filas,
    19 páginas. Una votación cerrada no cambia: caché de un día.
*/

/** Id de las dos demarcaciones que no son provincias (`legislador/Representaciones`). */
const DEMARCACION_NACIONAL = 2892;
const DEMARCACION_EXTERIOR = 3403;

/** Tope de páginas por legislador: 200 piezas cubren a casi todos (RECON §14). */
export const MAX_PAGINAS_PROPUESTAS = 20;

/** Votaciones de la legislatura que se leen por ficha: las 30 más recientes. */
export const MAX_PAGINAS_VOTOS = 3;

interface SilLegislador {
  legisladorId: number;
  nombres: string | null;
  apellidos: string | null;
  nombreCompleto: string | null;
  funcion: string | null;
  provincia: string | null;
  circunscripcion: string | null;
  profesion?: string | null;
  partido: { id: number; nombre: string | null; siglas: string | null } | null;
  representacion?: {
    funcion: string | null;
    nivelRepresentacion: string | null;
    provincia: string | null;
    circunscripcion: string | null;
    ejercicio: string | null;
    periodo: string | null;
  } | null;
}

export type CamaraLegislador = "diputados" | "senado";

export interface Legislador {
  id: number;
  nombre: string;
  /** «Diputado», «Diputada», «Senador», «Senadora», tal como lo escribe el SIL. */
  funcion: string | null;
  camara: CamaraLegislador;
  /** Provincia, o «Nacional» / «En el exterior» para esas dos listas. */
  provincia: string | null;
  circunscripcion: string | null;
  partidoSiglas: string | null;
  partidoNombre: string | null;
}

export interface LegisladorFicha extends Legislador {
  profesion: string | null;
  periodo: string | null;
  ejercicio: string | null;
}

function sinAplica(valor: string | null | undefined): string | null {
  const v = limpiarTexto(valor);
  return !v || /^(n\/a|no aplica)$/i.test(v) ? null : v;
}

function normalizarLegislador(raw: SilLegislador): Legislador {
  const funcion = limpiarTexto(raw.funcion ?? raw.representacion?.funcion) || null;
  const provincia = limpiarTexto(raw.provincia ?? raw.representacion?.provincia) || null;
  return {
    id: raw.legisladorId,
    nombre:
      limpiarTexto(raw.nombreCompleto) ||
      limpiarTexto(`${raw.nombres ?? ""} ${raw.apellidos ?? ""}`) ||
      "(sin nombre)",
    funcion,
    camara: /senad/i.test(funcion ?? "") ? "senado" : "diputados",
    provincia: provincia && /exterior/i.test(provincia) ? "En el exterior" : provincia,
    circunscripcion: sinAplica(raw.circunscripcion ?? raw.representacion?.circunscripcion),
    partidoSiglas: limpiarTexto(raw.partido?.siglas) || null,
    partidoNombre: limpiarTexto(raw.partido?.nombre) || null,
  };
}

/** Nombres alternativos de una demarcación → la clave del nombre que usa el SIL. */
const ALIAS_PROVINCIA: Record<string, string> = {
  baoruco: "bahoruco",
  salcedo: "hermanasmirabal",
  laestrelleta: "eliaspina",
  santodomingodeguzman: "distritonacional",
  dn: "distritonacional",
  santiagodeloscaballeros: "santiago",
  sanjuandelamaguana: "sanjuan",
  mao: "valverde",
  exterior: "enelexterior",
};

/**
 * Clave de comparación de una provincia: sin tildes, sin mayúsculas, sin
 * espacios ni guiones, y con los nombres largos u oficiales reducidos al que
 * usa el SIL. Así «Monte Cristi», «Montecristi», «Concepción de La Vega» y
 * «la vega» caen en la misma demarcación — otras vistas enlazan al directorio
 * con el nombre corriente, no con la grafía del SIL.
 */
export function claveProvincia(nombre: string | null | undefined): string {
  const k = limpiarTexto(nombre)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^(provincia( de)?|concepcion de)\s+/, "")
    .replace(/[^a-z]/g, "");
  return ALIAS_PROVINCIA[k] ?? k;
}

/** Enlace a la ficha de un legislador. */
export function hrefLegislador(id: number): string {
  return enlace.legislador(id);
}

export interface Directorio {
  legisladores: Legislador[];
  /** Demarcaciones que existen (32 provincias + nacional + exterior). */
  demarcaciones: number;
  /** Las que no respondieron: el directorio queda incompleto y lo dice. */
  fallidas: string[];
}

interface Demarcacion {
  id: number;
  descripcion: string;
}

/** Todas las páginas de una demarcación. Lanza si el SIL no contesta. */
async function legisladoresDe(demarcacion: number): Promise<SilLegislador[]> {
  const primera = await silFetch<SilPage<SilLegislador>>(
    `legislador/legisladores?page=1&nivel=${demarcacion}`,
    86400,
  );
  const paginas = Math.ceil(primera.total / SIL_PAGE_SIZE);
  const resto = await Promise.all(
    Array.from({ length: Math.max(0, paginas - 1) }, (_, i) =>
      silFetch<SilPage<SilLegislador>>(
        `legislador/legisladores?page=${i + 2}&nivel=${demarcacion}`,
        86400,
      ),
    ),
  );
  return [primera, ...resto].flatMap((p) => p.results);
}

/**
 * Directorio completo del período vigente, demarcación por demarcación. Cuesta
 * unas 41 peticiones y se cachea un día: la composición de la cámara cambia
 * por sustitución, no por semana. `null` solo si ni la lista de provincias
 * responde; si cae alguna demarcación, el directorio sale con las demás y
 * declara cuáles faltan.
 */
export async function getDirectorioLegisladores(): Promise<Directorio | null> {
  const provincias = await silFetchSafe<Demarcacion[]>("legislador/Provincias/1", 86400);
  if (!provincias || provincias.length === 0) return null;

  const demarcaciones: Demarcacion[] = [
    ...provincias,
    { id: DEMARCACION_NACIONAL, descripcion: "Nacional" },
    { id: DEMARCACION_EXTERIOR, descripcion: "En el exterior" },
  ];

  const vistos = new Map<number, Legislador>();
  const fallidas: string[] = [];

  for (let i = 0; i < demarcaciones.length; i += CONCURRENCIA) {
    const lote = demarcaciones.slice(i, i + CONCURRENCIA);
    const respuestas = await Promise.all(
      lote.map((d) =>
        legisladoresDe(d.id).catch((err) => {
          console.error(`[congreso] demarcación ${d.id}: ${String(err)}`);
          return null;
        }),
      ),
    );
    respuestas.forEach((filas, j) => {
      if (!filas) {
        fallidas.push(limpiarTexto(lote[j].descripcion));
        return;
      }
      for (const raw of filas) {
        if (!vistos.has(raw.legisladorId)) vistos.set(raw.legisladorId, normalizarLegislador(raw));
      }
    });
  }

  if (vistos.size === 0) return null;

  return {
    legisladores: [...vistos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    demarcaciones: demarcaciones.length,
    fallidas,
  };
}

/** Ficha de un legislador. `null` si no existe (el SIL responde `null`) o no contesta. */
export async function getLegislador(id: number): Promise<Lectura<LegisladorFicha>> {
  const raw = await silFetchEstado<SilLegislador | null>(`legislador/legislador/${id}`, 86400);
  if (raw === "caida") return "caida";
  if (!raw || !raw.legisladorId) return "inexistente";
  const base = normalizarLegislador(raw);
  const rep = raw.representacion;
  const nivel = limpiarTexto(rep?.nivelRepresentacion);
  return {
    ...base,
    provincia: /nacional/i.test(nivel)
      ? "Nacional"
      : /exterior/i.test(nivel)
        ? "En el exterior"
        : base.provincia,
    profesion: limpiarTexto(raw.profesion) || null,
    periodo: limpiarTexto(rep?.periodo) || null,
    // El SIL escribe «En Curso»; se dice como se diría de una persona.
    ejercicio: /en curso/i.test(limpiarTexto(rep?.ejercicio))
      ? "En funciones"
      : limpiarTexto(rep?.ejercicio) || null,
  };
}

/* ---------------------------------------------------- lo que propuso cada uno */

interface SilIniciativaLegislador {
  id: number;
  numero: string | null;
  descripcion: string | null;
  condicion: string | null;
  estado: string | null;
  fechaDeposito: string | null;
  fechaUltimoCambio: string | null;
}

/** «Proyecto de ley…» o «Proyecto de resolución…»: el listado no trae `tipo`. */
export function tipoDesdeTitulo(titulo: string): string | null {
  const t = titulo.toLowerCase();
  if (/^proyecto de ley\b/.test(t)) return "Proyecto de Ley";
  if (/^proyecto de resoluci/.test(t)) return "Proyecto de Resolución";
  return null;
}

export interface Propuestas {
  iniciativas: Iniciativa[];
  /** Censo que declara el SIL para este proponente. */
  total: number;
  /** Cuántas se leyeron: menos que `total` si se alcanzó el tope o cayó una página. */
  leidas: number;
}

/**
 * Las piezas donde el legislador figura como proponente, del registro vigente
 * (período 2024-2028 más lo arrastrado). Acotado a `MAX_PAGINAS_PROPUESTAS`
 * páginas: si el censo es mayor, `leidas < total` y la vista lo declara.
 */
export async function getPropuestasDeLegislador(id: number): Promise<Propuestas | null> {
  const ruta = (p: number) => `legislador/Iniciativas?page=${p}&legisladorId=${id}&keyword=`;
  const primera = await silFetchSafe<SilPage<SilIniciativaLegislador>>(ruta(1), 3600);
  if (!primera) return null;

  const paginas = Math.min(MAX_PAGINAS_PROPUESTAS, Math.ceil(primera.total / SIL_PAGE_SIZE));
  const filas = [...primera.results];
  const numeros = Array.from({ length: Math.max(0, paginas - 1) }, (_, i) => i + 2);
  for (let i = 0; i < numeros.length; i += CONCURRENCIA) {
    const respuestas = await Promise.all(
      numeros
        .slice(i, i + CONCURRENCIA)
        .map((p) => silFetchSafe<SilPage<SilIniciativaLegislador>>(ruta(p), 3600)),
    );
    for (const r of respuestas) if (r) filas.push(...r.results);
  }

  const iniciativas = filas.map((f) => {
    const descripcion = limpiarTexto(f.descripcion);
    return normalizarIniciativa({
      id: f.id,
      tipo: tipoDesdeTitulo(descripcion),
      camaraInicio: null,
      numero: f.numero,
      descripcion,
      periodoRegistro: null,
      materia: null,
      numPromulgacion: null,
      fechaPromulgacion: null,
      condicion: f.condicion,
      estado: f.estado,
      fechaDeposito: f.fechaDeposito,
      fechaUltimoCambioPrincipal: f.fechaUltimoCambio,
      grupoId: null,
      grupo: null,
      origen: null,
      legislatura: null,
    });
  });

  return { iniciativas, total: primera.total, leidas: iniciativas.length };
}

/* ------------------------------------------------------------------ votos */

export type SentidoVoto = "si" | "no" | "abstencion" | "ausente" | "sin-voto" | "otro";

/** Cómo se lee cada sentido. */
export const ETIQUETA_SENTIDO: Record<SentidoVoto, string> = {
  si: "A favor",
  no: "En contra",
  abstencion: "Abstención",
  "sin-voto": "Presente, no votó",
  ausente: "Ausente",
  otro: "Otro",
};

/** El orden de la tabla de una votación. */
export const ORDEN_SENTIDOS: SentidoVoto[] = ["si", "no", "abstencion", "sin-voto", "ausente", "otro"];

/**
 * Códigos observados en `votoId`: `SI`, `NO`, `AU` («Ausente para esta
 * votación») y `SV` («No Voto»). La abstención se reconoce también por el
 * texto, porque el recuento la trae (`cantidadVotosAbastencion`) y su código
 * no apareció en las votaciones revisadas.
 */
export function sentidoDeVoto(codigo: string | null, texto: string | null): SentidoVoto {
  const c = limpiarTexto(codigo).toUpperCase();
  const t = limpiarTexto(texto).toLowerCase();
  if (c === "SI" || t === "si" || t === "sí") return "si";
  if (c === "NO" || t === "no") return "no";
  if (c === "AU" || t.startsWith("ausente")) return "ausente";
  if (c === "SV" || t.includes("no voto") || t.includes("no votó")) return "sin-voto";
  if (c.startsWith("AB") || t.startsWith("absten")) return "abstencion";
  return "otro";
}

interface SilVotacion {
  id: number;
  titulo: string | null;
  mocion: string | null;
  fecha: string | null;
  votos: {
    cantidadTotalVotos: number;
    cantidadVotosSi: number;
    cantidadVotosNo: number;
    cantidadVotosAbastencion: number;
  } | null;
  asistencias: { cantidadDelegados: number; cantidadPresentes: number } | null;
  sesion: { id: number; numero: string | null } | null;
  numeroSesion: string | null;
  numeroVotacion: string | null;
  habilitados?: number | null;
  votoId: string | null;
  voto: string | null;
}

export interface Votacion {
  id: number;
  /** «Sesión 049, Votación 014». */
  titulo: string;
  /** Qué se sometió, en las palabras del acta. */
  mocion: string | null;
  fecha: string | null;
  sesion: string | null;
  si: number;
  no: number;
  abstencion: number;
  presentes: number | null;
  miembros: number | null;
  /** Cómo votó el legislador, cuando la votación viene de su ficha. */
  sentido: SentidoVoto | null;
}

function normalizarVotacion(raw: SilVotacion): Votacion {
  return {
    id: raw.id,
    titulo: limpiarTexto(raw.titulo) || `Votación ${raw.id}`,
    // El acta arrastra un paréntesis de continuidad —«(Se continúa la
    // numeración del archivo…)»— que no dice nada sobre lo votado.
    mocion:
      limpiarTexto((raw.mocion ?? "").replace(/^\s*\(Se contin[úu]a[^)]*\)\s*/i, "")) || null,
    fecha: raw.fecha,
    sesion: limpiarTexto(raw.sesion?.numero ?? raw.numeroSesion) || null,
    si: raw.votos?.cantidadVotosSi ?? 0,
    no: raw.votos?.cantidadVotosNo ?? 0,
    abstencion: raw.votos?.cantidadVotosAbastencion ?? 0,
    presentes: raw.asistencias?.cantidadPresentes ?? null,
    miembros: raw.habilitados ?? raw.asistencias?.cantidadDelegados ?? null,
    sentido: raw.votoId || raw.voto ? sentidoDeVoto(raw.votoId, raw.voto) : null,
  };
}

export interface VotosDeLegislador {
  /** Código de la legislatura leída: `2026-SLO`. */
  legislatura: string;
  votaciones: Votacion[];
  /** Votaciones de esa legislatura según el SIL. */
  total: number;
}

/** La legislatura ordinaria más reciente que ya abrió en esa fecha. */
function legislaturaReciente(hoy: Date): string {
  const anio = hoy.getUTCFullYear();
  const candidatas = [`${anio}-SLO`, `${anio}-PLO`, `${anio - 1}-SLO`]
    .map((c) => parseLegislatura(c))
    .filter((l): l is Legislatura => l !== null && l.inicio <= hoy);
  return candidatas[0]?.codigo ?? `${anio - 1}-SLO`;
}

/** La legislatura anterior a un código: `2026-SLO` → `2026-PLO` → `2025-SLO`. */
function legislaturaAnterior(codigo: string): string | null {
  const l = parseLegislatura(codigo);
  if (!l) return null;
  return l.tipo === "SLO" ? `${l.anio}-PLO` : `${l.anio - 1}-SLO`;
}

/**
 * Cómo votó un legislador en las votaciones más recientes de la legislatura
 * en curso —o de la anterior, si la actual aún no ha votado—. Solo existe
 * para diputados: el Senado vota en su propio sistema.
 */
export async function getVotosDeLegislador(
  id: number,
  hoy: Date = new Date(),
): Promise<VotosDeLegislador | null> {
  let codigo: string | null = legislaturaReciente(hoy);

  for (let intento = 0; intento < 2 && codigo; intento++) {
    const clave: string = codigo;
    const ruta = (p: number) =>
      `legislador/votaciones?page=${p}&legisladorId=${id}&keyword=${encodeURIComponent(clave)}`;
    const primera = await silFetchSafe<SilPage<SilVotacion>>(ruta(1), 3600);
    if (!primera) return null;
    if (primera.total > 0) {
      const paginas = Math.min(MAX_PAGINAS_VOTOS, Math.ceil(primera.total / SIL_PAGE_SIZE));
      const resto = await Promise.all(
        Array.from({ length: Math.max(0, paginas - 1) }, (_, i) =>
          silFetchSafe<SilPage<SilVotacion>>(ruta(i + 2), 3600),
        ),
      );
      return {
        legislatura: clave,
        votaciones: [primera, ...resto].flatMap((r) => r?.results ?? []).map(normalizarVotacion),
        total: primera.total,
      };
    }
    codigo = legislaturaAnterior(clave);
  }
  return { legislatura: legislaturaReciente(hoy), votaciones: [], total: 0 };
}

/** Las votaciones del pleno en las que se sometió una iniciativa. */
export async function getVotacionesDeIniciativa(id: number): Promise<Votacion[] | null> {
  const ruta = (p: number) => `iniciativa/votaciones?page=${p}&id=${id}`;
  const primera = await silFetchSafe<SilPage<SilVotacion>>(ruta(1), 3600);
  if (!primera) return null;
  const paginas = Math.min(3, Math.ceil(primera.total / SIL_PAGE_SIZE));
  const resto = await Promise.all(
    Array.from({ length: Math.max(0, paginas - 1) }, (_, i) =>
      silFetchSafe<SilPage<SilVotacion>>(ruta(i + 2), 3600),
    ),
  );
  return [primera, ...resto]
    .flatMap((r) => r?.results ?? [])
    .map((v) => ({ ...normalizarVotacion(v), sentido: null }));
}

export interface VotoNominal {
  legisladorId: number;
  nombre: string;
  partidoSiglas: string | null;
  sentido: SentidoVoto;
}

export interface VotacionDetalle {
  votacion: Votacion;
  /** Las piezas que se decidieron en esa votación (a veces un grupo de diez). */
  iniciativas: { id: number; numero: string | null; titulo: string }[];
  votos: VotoNominal[];
  /** Filas que declara el SIL; si `votos.length` es menor, faltó alguna página. */
  totalVotos: number;
  /** La primera página del voto nominal no contestó: no se sabe cuántas filas hay. */
  rollCallFallido: boolean;
}

interface SilVotoNominal {
  legislador: SilLegislador | null;
  votoId: string | null;
  voto: string | null;
}

interface SilIniciativaVotada {
  iniciativaId: number | null;
  iniciativaNumero: string | null;
  iniciativaDescripcion: string | null;
}

/**
 * Una votación con su voto nominal completo: 1 + 1 + 19 peticiones, con un
 * día de caché porque una votación cerrada no cambia.
 */
export async function getVotacion(id: number): Promise<Lectura<VotacionDetalle>> {
  const [raw, iniciativas, primera] = await Promise.all([
    silFetchEstado<SilVotacion | null>(`votacion/votacion/${id}`, 86400),
    silFetchSafe<SilPage<SilIniciativaVotada>>(`votacion/iniciativas/?page=1&id=${id}`, 86400),
    silFetchSafe<SilPage<SilVotoNominal>>(`votacion/legisladores/?page=1&id=${id}`, 86400),
  ]);
  if (raw === "caida") return "caida";
  if (!raw || !raw.id) return "inexistente";

  const filas = [...(primera?.results ?? [])];
  const paginas = primera ? Math.ceil(primera.total / SIL_PAGE_SIZE) : 0;
  const numeros = Array.from({ length: Math.max(0, paginas - 1) }, (_, i) => i + 2);
  for (let i = 0; i < numeros.length; i += CONCURRENCIA) {
    const respuestas = await Promise.all(
      numeros
        .slice(i, i + CONCURRENCIA)
        .map((p) =>
          silFetchSafe<SilPage<SilVotoNominal>>(`votacion/legisladores/?page=${p}&id=${id}`, 86400),
        ),
    );
    for (const r of respuestas) if (r) filas.push(...r.results);
  }

  const votos: VotoNominal[] = filas
    .filter((f) => f.legislador?.legisladorId)
    .map((f) => {
      const l = f.legislador!;
      // Aquí el SIL invierte los campos: `nombres` trae los apellidos y
      // `apellidos` los nombres, todo en versales.
      const nombre = desdeMayusculas(
        limpiarTexto(`${l.apellidos ?? ""} ${l.nombres ?? ""}`) || limpiarTexto(l.nombreCompleto),
      );
      return {
        legisladorId: l.legisladorId,
        nombre: nombre || "(sin nombre)",
        partidoSiglas: limpiarTexto(l.partido?.siglas) || null,
        sentido: sentidoDeVoto(f.votoId, f.voto),
      };
    });

  return {
    votacion: { ...normalizarVotacion(raw), sentido: null },
    iniciativas: (iniciativas?.results ?? [])
      .filter((i) => i.iniciativaId)
      .map((i) => ({
        id: i.iniciativaId!,
        numero: limpiarTexto(i.iniciativaNumero) || null,
        titulo: separarTitulo(limpiarTexto(i.iniciativaDescripcion)).titulo,
      })),
    votos,
    totalVotos: primera?.total ?? 0,
    rollCallFallido: primera === null,
  };
}

/**
 * La pieza de Diputados que corresponde a una cita `06099-2024-2028-CD`. El
 * buscador del SIL hace match también sobre `numero`, así que basta una
 * consulta; se exige igualdad exacta para no aceptar una subcadena.
 */
export async function iniciativaPorNumero(numero: string): Promise<Lectura<Iniciativa>> {
  const cita = limpiarTexto(numero).toUpperCase();
  if (!/^\d+-\d{4}-\d{4}-CD$/.test(cita)) return "inexistente";
  // `buscarIniciativas` y no `listIniciativas`: esta devuelve una página vacía
  // cuando el SIL cae, y aquí eso se leería como «la cita no aparece».
  const r = await buscarIniciativas(cita);
  if (!r) return "caida";
  const hit = r.results.find((i) => limpiarTexto(i.numero).toUpperCase() === cita);
  return hit ? normalizarIniciativa(hit) : "inexistente";
}
