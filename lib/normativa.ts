/**
 * Normativa del Poder Ejecutivo — Consultoría Jurídica.
 *
 * Mismo contrato que las demás capas: sin base de datos, lectura en vivo con
 * caché. En septiembre de 2026 la Consultoría rehízo su portal: la vieja app
 * ASP.NET MVC (`/consulta/`, token antiforgery + POST de formulario) devuelve
 * 404 y el buscador nuevo habla JSON. Reglas verificadas (docs/AUDITORIA.md §4.1):
 *
 *  1. **Búsqueda.** `POST /api/consultas/search` con cuerpo JSON; sin token ni
 *     sesión. Responde la lista completa, sin paginar.
 *  2. **Consultas acotadas.** Siempre se filtra: por año (`PublicationYear`)
 *     para los listados, por número (`DocumentNumber`) para una cita.
 *  3. **Gaceta Oficial** no está en el buscador: vive en el repositorio de
 *     documentos, `GET /api/documents?category=gacetas`, un JSON con todas.
 *  4. El texto de una norma es `GET /api/document/{DocId}`, PDF `inline`.
 *  5. Solo lectura; User-Agent identificable.
 *  6. **Cloudflare desafía el egreso de Vercel** (403 `cf-mitigated: challenge`,
 *     verificado 2026-09-23). No se rodea: si la lectura en vivo falla, se cae
 *     a la instantánea `public/data/normativa.json` (`scripts/build-normativa.py`),
 *     que la interfaz declara con su fecha.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { unstable_cache } from "next/cache";
import { z } from "zod";
import { filas, pedirJsonOLanzar } from "@/lib/pedir";
import { agujas, contieneTodas, plano as planoConsulta } from "@/lib/raiz";
import { numeroCanonico } from "@/lib/grafo";
import { MATERIAS, OTROS_ASUNTOS, materiaDeDecreto, type Materia } from "@/lib/materias-decreto";
import { decretoPorNumero, indiceDecretos } from "@/lib/decretos";

const BASE = "https://www.consultoria.gov.do";

const USER_AGENT =
  "Socratico-Inteligencia/1.0 (monitoreo normativo; herramienta independiente)";

const TIMEOUT_MS = 30_000;

/**
 * Tipos que ofrece la vertical. Los códigos 1–7 son los del buscador; `1014`
 * era el de Gaceta en la app vieja y se conserva como clave de URL, aunque
 * ahora se sirve desde el repositorio de documentos.
 */
export const TIPOS_NORMATIVA = {
  "1": "Leyes",
  "3": "Decretos",
  "4": "Reglamentos",
  "7": "Resoluciones",
  "1014": "Gaceta Oficial",
} as const;

export type TipoNormativa = keyof typeof TIPOS_NORMATIVA;

/** Nombre singular por código: el que usan las fichas y las citas. */
const TIPO_SINGULAR: Record<number, string> = {
  1: "Ley",
  3: "Decreto",
  4: "Reglamento",
  5: "Varios",
  7: "Resolución",
};

export interface Documento {
  tipo: string;
  numero: string;
  titulo: string;
  gaceta: string | null;
  fecha: string | null;
  /** ISO `yyyy-mm-dd` para ordenar, si el origen da una fecha completa. */
  fechaIso: string | null;
  documentId: string | null;
  /** URL de apertura del documento en el origen. */
  url: string | null;
  /**
   * Etiqueta `Institucion` que la Consultoría pone a la norma, tal cual. En
   * los decretos, «Cámara de Cuentas» marca un nombramiento o su cese (ver
   * `esDesignacion`). Las gacetas no la tienen.
   */
  institucion?: string | null;
  /**
   * Fecha de la instantánea de la que salió, si el origen no respondió y se
   * sirvió de `normativa.json` o `leyes.json`; `null` si se leyó en vivo.
   */
  instantanea?: string | null;
}

/** Fila del buscador `/api/consultas/search` (solo los campos que se leen). */
interface FilaBuscador {
  DocId?: number | null;
  /** Etiqueta de institución de la Consultoría (ver `decretosDeInstitucion`). */
  Institucion?: string | null;
  TipoDocumento?: number | null;
  Tipo?: string | null;
  Numero?: string | null;
  Titulo?: string | null;
  Gaceta?: string | null;
  FechaPromulgacion?: string | null;
}

/** Entrada del repositorio `/api/documents` (solo los campos que se leen). */
interface EntradaRepositorio {
  id?: string | null;
  title?: string | null;
  fileUrl?: string | null;
  year?: number | null;
  month?: string | null;
  status?: string | null;
}

function texto(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function aDocumento(f: FilaBuscador): Documento {
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(f.FechaPromulgacion ?? "")?.[0] ?? null;
  const documentId = f.DocId != null ? String(f.DocId) : null;
  return {
    tipo: TIPO_SINGULAR[f.TipoDocumento ?? -1] ?? texto(f.Tipo),
    numero: texto(f.Numero),
    titulo: texto(f.Titulo),
    gaceta: texto(f.Gaceta) || null,
    fecha: iso ? iso.split("-").reverse().join("/") : null,
    fechaIso: iso,
    documentId,
    url: documentId ? `${BASE}/api/document/${documentId}` : null,
    institucion: texto(f.Institucion) || null,
  };
}

/*
  La forma de las dos respuestas, validada con `zod`: una lista de filas con
  los campos que se leen (todos pueden faltar o venir nulos; `aDocumento` y
  `gacetasDelAnio` ya lo toleran). Una fila con otra forma se descarta sola
  (`filas`); si lo que llega no es una lista, la lectura falla con su motivo
  y se cae a la instantánea.
*/
const FILAS_BUSCADOR = filas(
  z.looseObject({
    DocId: z.number().nullish(),
    Institucion: z.string().nullish(),
    TipoDocumento: z.number().nullish(),
    Tipo: z.string().nullish(),
    Numero: z.string().nullish(),
    Titulo: z.string().nullish(),
    Gaceta: z.string().nullish(),
    FechaPromulgacion: z.string().nullish(),
  }),
);
const REPOSITORIO = filas(
  z.looseObject({
    id: z.string().nullish(),
    title: z.string().nullish(),
    fileUrl: z.string().nullish(),
    year: z.number().nullish(),
    month: z.string().nullish(),
    status: z.string().nullish(),
  }),
);

/*
  El contrato de la casa (`lib/pedir.ts`) con **un solo intento**, como antes:
  el rechazo típico aquí es el desafío de Cloudflare, y repetir la petición
  no lo levanta (se gestiona: docs/AUDITORIA.md §4.1). El motivo del registro
  lleva el veredicto `cf-mitigated`.
*/
const PEDIDO = {
  fuente: "normativa",
  ua: USER_AGENT,
  tipo: /json/i,
  cabeceras: { Accept: "application/json" },
  cache: "no-store",
  espera: TIMEOUT_MS,
  intentos: 1,
} as const;

/** Consulta el buscador. Lanza si el origen no contesta con una lista. */
async function consultar(filtro: {
  DocumentTypeCode: number;
  DocumentNumber?: string;
  PublicationYear?: string;
}): Promise<Documento[]> {
  const filas = await pedirJsonOLanzar(`${BASE}/api/consultas/search`, {
    ...PEDIDO,
    metodo: "POST",
    cabeceras: { ...PEDIDO.cabeceras, "Content-Type": "application/json" },
    esquema: FILAS_BUSCADOR,
    cuerpo: JSON.stringify({
      DocumentTypeCode: filtro.DocumentTypeCode,
      DocumentNumber: filtro.DocumentNumber ?? "",
      FullText: "",
      Name: "",
      LastName: "",
      Identification: "",
      Charge: "",
      Institution: 0,
      President: 0,
      Consultor: 0,
      Career: 0,
      Guild: 0,
      PensionType: 0,
      PublicationYear: filtro.PublicationYear ?? "",
    }),
  });
  return filas.map(aDocumento);
}

/**
 * Gacetas Oficiales de un año, desde el repositorio de documentos. El
 * repositorio da número, mes y año —no día—, así que no hay `fechaIso` y el
 * orden es por número de gaceta.
 */
async function gacetas(anio: number): Promise<Documento[]> {
  const entradas = await pedirJsonOLanzar(`${BASE}/api/documents?category=gacetas`, {
    ...PEDIDO,
    esquema: REPOSITORIO,
  });
  return gacetasDelAnio(entradas, anio);
}

function gacetasDelAnio(entradas: EntradaRepositorio[], anio: number): Documento[] {
  return entradas
    .filter((e) => e.year === anio && (e.status ?? "published") === "published")
    .map((e) => {
      const numero = texto(e.title);
      const mes = texto(e.month).toLowerCase();
      // `fileUrl` junta el PDF y su portada con «|»; el primero es el PDF.
      const archivo = (e.fileUrl ?? "").split("|")[0]?.trim() ?? "";
      return {
        tipo: "Gaceta Oficial",
        numero,
        titulo: mes ? `Edición de ${mes} de ${anio}` : `Edición de ${anio}`,
        gaceta: null,
        fecha: mes ? `${mes} de ${anio}` : String(anio),
        fechaIso: null,
        documentId: e.id ?? null,
        url: archivo.startsWith("/uploads/") ? `${BASE}${archivo}` : null,
      };
    })
    .sort((a, b) => Number(b.numero) - Number(a.numero));
}

/* ------------------------------------------------------------ instantánea */

interface Instantanea {
  generadoEn: string;
  /** Filas crudas del buscador por `tipo/año`. */
  busquedas: Record<string, FilaBuscador[]>;
  gacetas: EntradaRepositorio[];
}

let instantanea: Promise<Instantanea | null> | null = null;

/** La instantánea commiteada, leída una vez por instancia. */
function leerInstantanea(): Promise<Instantanea | null> {
  instantanea ??= readFile(path.join(process.cwd(), "public", "data", "normativa.json"), "utf8")
    .then((t) => {
      const crudo = JSON.parse(t) as Instantanea;
      return crudo?.generadoEn && crudo.busquedas ? crudo : null;
    })
    .catch((err) => {
      console.error(`[normativa] instantánea: ${String(err)}`);
      return null;
    });
  return instantanea;
}

/**
 * Todas las leyes desde 1844 (`public/data/leyes.json`, `scripts/build-leyes.py`),
 * en filas compactas: `campos` nombra las columnas de cada fila. Solo la lee la
 * ficha, cuando una ley es más vieja que `normativa.json` y el origen no contesta.
 */
interface InstantaneaLeyes {
  generadoEn: string;
  campos: string[];
  leyes: unknown[][];
}

let instantaneaLeyes: Promise<InstantaneaLeyes | null> | null = null;

function leerLeyes(): Promise<InstantaneaLeyes | null> {
  instantaneaLeyes ??= readFile(path.join(process.cwd(), "public", "data", "leyes.json"), "utf8")
    .then((t) => {
      const crudo = JSON.parse(t) as InstantaneaLeyes;
      return crudo?.generadoEn && Array.isArray(crudo.leyes) ? crudo : null;
    })
    .catch((err) => {
      console.error(`[normativa] instantánea de leyes: ${String(err)}`);
      return null;
    });
  return instantaneaLeyes;
}

/**
 * La ley de `leyes.json` con ese número canónico (47-2020 es la 47-20). Si el
 * origen repite el número con dos fechas, gana la más reciente: el archivo ya
 * viene ordenado de la más reciente a la más antigua.
 */
async function leyHistorica(numero: string): Promise<Documento | null> {
  const inst = await leerLeyes();
  if (!inst) return null;
  const buscado = numeroCanonico("ley", numero);
  for (const fila of inst.leyes) {
    const f = Object.fromEntries(inst.campos.map((c, k) => [c, fila[k]])) as FilaBuscador;
    if (numeroCanonico("ley", texto(f.Numero)) === buscado) {
      return { ...aDocumento({ ...f, TipoDocumento: 1 }), instantanea: inst.generadoEn };
    }
  }
  return null;
}

function ordenar(docs: Documento[]): Documento[] {
  return docs.sort((a, b) => (b.fechaIso ?? "").localeCompare(a.fechaIso ?? ""));
}

export interface ResultadoNormativa {
  docs: Documento[];
  /**
   * De dónde salió la lista: `"vivo"`, la fecha `yyyy-mm-dd` de la
   * instantánea, o `null` si no contestó nadie —ni el origen ni la
   * instantánea tienen ese tipo y año—.
   */
  origen: "vivo" | string | null;
}

/**
 * Documentos de un tipo en un año, de más reciente a más antiguo: en vivo, y
 * si el origen rechaza la consulta, desde la instantánea. Una lista vacía con
 * `origen` presente es una respuesta («no hay»); con `origen: null`, un fallo.
 */
export async function consultarNormativa(
  tipo: TipoNormativa,
  anio: number,
): Promise<ResultadoNormativa> {
  try {
    const docs =
      tipo === "1014"
        ? await gacetas(anio)
        : ordenar(await consultar({ DocumentTypeCode: Number(tipo), PublicationYear: String(anio) }));
    return { docs, origen: "vivo" };
  } catch (err) {
    console.error(`[normativa] búsqueda ${tipo}/${anio}: ${String(err)}`);
  }

  const inst = await leerInstantanea();
  if (!inst) return { docs: [], origen: null };
  if (tipo === "1014") {
    const docs = gacetasDelAnio(inst.gacetas ?? [], anio);
    return { docs, origen: docs.length > 0 ? inst.generadoEn : null };
  }
  const filas = inst.busquedas[`${tipo}/${anio}`];
  if (!filas) return { docs: [], origen: null };
  return { docs: ordenar(filas.map(aDocumento)), origen: inst.generadoEn };
}

/** Solo la lista de `consultarNormativa`. Degrada a `[]`. */
export async function buscarNormativa(
  tipo: TipoNormativa,
  anio: number,
): Promise<Documento[]> {
  return (await consultarNormativa(tipo, anio)).docs;
}

export interface ResumenNormativa {
  anio: number;
  decretosRecientes: Documento[];
  leyesRecientes: Documento[];
  totalDecretos: number;
  totalLeyes: number;
}

/** Panorámica del año vigente: decretos y leyes recientes con sus totales. */
export async function getResumenNormativa(anio = new Date().getFullYear()): Promise<ResumenNormativa | null> {
  const [decretos, leyes] = await Promise.all([
    buscarNormativa("3", anio),
    buscarNormativa("1", anio),
  ]);
  if (decretos.length === 0 && leyes.length === 0) return null;
  return {
    anio,
    decretosRecientes: decretos.slice(0, 8),
    leyesRecientes: leyes.slice(0, 8),
    totalDecretos: decretos.length,
    totalLeyes: leyes.length,
  };
}

/**
 * Normas de la instantánea cuya etiqueta `Institucion` es una de `etiquetas`,
 * de la más reciente a la más antigua. La etiqueta la pone la Consultoría y el
 * cruce con cada institución lo declara `scripts/build-instituciones.py`.
 * Cubre los años de la instantánea; el origen en vivo no filtra por etiqueta.
 */
export async function normasDeInstitucion(
  etiquetas: string[],
): Promise<{ docs: Documento[]; generadoEn: string | null }> {
  if (etiquetas.length === 0) return { docs: [], generadoEn: null };
  const inst = await leerInstantanea();
  if (!inst) return { docs: [], generadoEn: null };
  const buscadas = new Set(etiquetas.map((e) => e.trim()));
  const docs: Documento[] = [];
  // El origen repite algunas normas (fe de erratas, la misma ley cargada dos
  // veces): una norma es su tipo, su número y su fecha.
  const vistas = new Set<string>();
  for (const filas of Object.values(inst.busquedas)) {
    for (const f of filas) {
      if (!f.Institucion || !buscadas.has(f.Institucion.trim())) continue;
      const d = aDocumento(f);
      const clave = `${d.tipo}|${d.numero}|${d.fechaIso ?? ""}`;
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      docs.push(d);
    }
  }
  return { docs: ordenar(docs), generadoEn: inst.generadoEn };
}

/* ------------------------------------------------ búsqueda sobre los títulos */

/**
 * Filtra una lista por texto sobre el tipo, el número y el título, con la
 * regla de `lib/raiz.ts`: todas las palabras, en cualquier orden, sin tildes
 * y por raíz —«designa embajador» encuentra «QUE DESIGNA AL SEÑOR…,
 * EMBAJADOR…», «leyes» encuentra «Ley»—. «núm.» y «No.» son relleno, y un
 * número se exige entero: «1-26» no encuentra «11-26». El año del número vale
 * en dos cifras o en cuatro («47-20» y «47-2020»). No es búsqueda en el texto
 * íntegro de la norma: el origen no lo sirve indexado.
 */
export function filtrarPorTexto(docs: Documento[], q: string): Documento[] {
  const a = agujas(q);
  if (a.raices.length === 0 && a.numeros.length === 0) return docs;
  return docs.filter((d) => {
    const largo = d.numero.replace(/^(\d{1,4})-(\d{2})$/, (_, n: string, y: string) => `${n}-${Number(y) > 60 ? 19 : 20}${y}`);
    return contieneTodas(planoConsulta(`${d.tipo} ${d.numero} ${largo} ${d.titulo}`), a);
  });
}

/* ------------------------------------------------- designaciones del Ejecutivo */

/**
 * ¿Es un decreto de nombramiento o de cese? La Consultoría etiqueta con la
 * Cámara de Cuentas todo decreto que designa a un funcionario —el designado
 * declara patrimonio ante la Cámara— y también los que derogan esa
 * designación. La etiqueta la pone el origen; aquí solo se lee
 * (`scripts/build-instituciones.py` la excluye del cruce por lo mismo).
 */
export function esDesignacion(d: Documento): boolean {
  return d.tipo === "Decreto" && /camara de cuentas/i.test(
    (d.institucion ?? "").normalize("NFD").replace(/\p{M}/gu, ""),
  );
}

/**
 * Cargos que se reconocen en el título. Gana el que aparece primero; a igual
 * posición, el de más arriba en la lista. Se lee del título, no de un campo
 * del origen: un decreto que nombra a varias personas en cargos distintos
 * cuenta por el primero que menciona.
 */
const CARGOS: [string, RegExp][] = [
  ["Viceministros", /\bviceministr[oa]s?\b/],
  ["Ministros", /\bministr[oa]s?\b/],
  ["Vicecónsules y cónsules", /\b(vice)?c[oó]nsul(es)?\b/],
  ["Embajadores y servicio exterior", /\bembajador(a|es)?\b|\bministro consejero\b|\bconsejer[oa]s?\b|\bprimer secretario\b/],
  ["Subdirectores", /\bsub-?director(a|es)?\b/],
  ["Directores", /\bdirector(a|es)?\b/],
  ["Superintendentes", /\bsuperintendente\b/],
  ["Gobernadores", /\bgobernador(a|es)?\b/],
  ["Miembros de consejos y juntas", /\bmiembros?\b|\bconsejo\b|\bjunta\b/],
  ["Asesores", /\basesor(a|es)?\b/],
  ["Encargados y coordinadores", /\bencargad[oa]s?\b|\bsubencargad[oa]s?\b|\bcoordinador(a|es)?\b/],
];

export function cargoDelTitulo(titulo: string): string {
  const t = titulo.toLowerCase();
  let mejor: { nombre: string; pos: number } | null = null;
  for (const [nombre, re] of CARGOS) {
    const pos = t.search(re);
    if (pos >= 0 && (!mejor || pos < mejor.pos)) mejor = { nombre, pos };
  }
  return mejor?.nombre ?? "Otros cargos";
}

/** «Designa» si nombra; «cesa» si deroga o deja sin efecto una designación. */
export function movimientoDelTitulo(titulo: string): "designa" | "cesa" {
  const t = titulo
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/^que\s+/, "");
  return /^(deroga|deja sin efecto|acepta la renuncia|destituye|cancela)/.test(t) ? "cesa" : "designa";
}

export interface MesDesignaciones {
  /** `yyyy-mm`. */
  mes: string;
  designa: number;
  cesa: number;
  porCargo: { cargo: string; n: number }[];
  docs: Documento[];
}

/**
 * Los decretos de nombramiento y cese de una lista, por mes de promulgación
 * y por cargo leído del título. Del mes más reciente al más antiguo.
 */
export function designacionesPorMes(docs: Documento[]): MesDesignaciones[] {
  const meses = new Map<string, MesDesignaciones>();
  for (const d of docs) {
    if (!esDesignacion(d) || !d.fechaIso) continue;
    const mes = d.fechaIso.slice(0, 7);
    const m = meses.get(mes) ?? { mes, designa: 0, cesa: 0, porCargo: [], docs: [] };
    m[movimientoDelTitulo(d.titulo)] += 1;
    m.docs.push(d);
    meses.set(mes, m);
  }
  for (const m of meses.values()) {
    const cuenta = new Map<string, number>();
    for (const d of m.docs) {
      if (movimientoDelTitulo(d.titulo) !== "designa") continue;
      const c = cargoDelTitulo(d.titulo);
      cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
    }
    m.porCargo = [...cuenta.entries()]
      .map(([cargo, n]) => ({ cargo, n }))
      .sort((a, b) => b.n - a.n);
  }
  return [...meses.values()].sort((a, b) => b.mes.localeCompare(a.mes));
}

/* ------------------------------------------------------ materia de un decreto */

// Las reglas viven en `lib/materias-decreto.ts`, compartidas con el registro
// completo de decretos; aquí se re-exportan para los importadores de siempre.
export { MATERIAS, materiaDeDecreto, materiaPorSlug, type Materia } from "@/lib/materias-decreto";

/** La materia de un decreto; `null` para lo que no es decreto. */
export function materiaDe(d: Documento): Materia | null {
  if (d.tipo !== "Decreto") return null;
  return materiaDeDecreto(d.titulo, d.institucion);
}


/**
 * Cuántos decretos hay de cada materia, de la más numerosa a la menos, con
 * «Otros asuntos» siempre al final. Las materias sin decretos no aparecen.
 */
export function materiasDe(docs: Documento[]): (Materia & { n: number })[] {
  const cuenta = new Map<string, number>();
  for (const d of docs) {
    const m = materiaDe(d);
    if (m) cuenta.set(m.slug, (cuenta.get(m.slug) ?? 0) + 1);
  }
  return MATERIAS.filter((m) => cuenta.has(m.slug))
    .map((m) => ({ ...m, n: cuenta.get(m.slug)! }))
    .sort((a, b) =>
      a.slug === OTROS_ASUNTOS.slug ? 1 : b.slug === OTROS_ASUNTOS.slug ? -1 : b.n - a.n,
    );
}

/* ------------------------------------------------------ la lista de la página */

export interface ListaNormativa extends ResultadoNormativa {
  /** Documentos del tipo y año antes de filtrar por texto o por mes. */
  total: number;
  /** Todos los del tipo y año, para resumir las designaciones. */
  todos: Documento[];
}

/**
 * La lista que pinta `/normativa` y que baja su CSV: el tipo y el año (en
 * vivo o desde la instantánea, como `consultarNormativa`), filtrados por
 * texto sobre los títulos, por `materia` (slug de `MATERIAS`, solo decretos)
 * y, si se pide `mes` (`yyyy-mm`), reducidos a los decretos de nombramiento y
 * cese de ese mes.
 */
export async function listaNormativa(opts: {
  tipo: TipoNormativa;
  anio: number;
  q?: string;
  mes?: string;
  materia?: string;
}): Promise<ListaNormativa> {
  const r = await consultarNormativa(opts.tipo, opts.anio);
  let docs = r.docs;
  if (opts.materia) docs = docs.filter((d) => materiaDe(d)?.slug === opts.materia);
  if (opts.mes) {
    docs = docs.filter((d) => esDesignacion(d) && d.fechaIso?.startsWith(opts.mes!));
  }
  if (opts.q) docs = filtrarPorTexto(docs, opts.q);
  return { docs, origen: r.origen, total: r.docs.length, todos: r.docs };
}

/* --------------------------------------------------- resolución de una cita */

/** Código de tipo del formulario para el nombre que usa el título de una ley. */
const CODIGO_POR_TIPO: Record<string, TipoNormativa> = {
  ley: "1",
  decreto: "3",
  reglamento: "4",
  "resolución": "7",
  resolucion: "7",
};

/** Segmento de URL de cada tipo, para las fichas de norma. */
export const RUTA_POR_TIPO: Record<string, string> = {
  Ley: "ley",
  Decreto: "decreto",
  Reglamento: "reglamento",
  "Resolución": "resolucion",
};

/** ¿Es un tipo con ficha propia? Devuelve su nombre canónico. */
export function tipoDeRuta(slug: string): string | null {
  const encontrado = Object.entries(RUTA_POR_TIPO).find(([, r]) => r === slug);
  return encontrado?.[0] ?? null;
}

/** Qué es cada instrumento del Ejecutivo, en una frase. */
export function queEsNorma(tipo: string): string | null {
  switch (tipo) {
    case "Ley":
      return "Una ley de la República: la aprobó el Congreso en sus dos cámaras y la promulgó el Presidente. Obliga a todo el mundo hasta que otra ley la derogue.";
    case "Decreto":
      return "Un decreto del Poder Ejecutivo: lo dicta el Presidente por sí solo, sin pasar por el Congreso. No puede contradecir una ley, y otro decreto puede dejarlo sin efecto.";
    case "Reglamento":
      return "Un reglamento: desarrolla cómo se aplica una ley en la práctica. Vive subordinado a la ley que reglamenta.";
    case "Resolución":
      return "Una resolución: una decisión administrativa de alcance acotado, normalmente de un ministerio u organismo.";
    default:
      return null;
  }
}

/**
 * Resuelve una cita normativa (`Ley 47-20`) al documento oficial.
 *
 * El buscador acepta `DocumentNumber` como único filtro y responde en ~1 s
 * —la regla de «siempre filtrar» se cumple con el número—, así que una cita
 * cuesta una consulta. Devuelve `null` si no hay coincidencia exacta: se
 * prefiere no enlazar antes que enlazar a otra norma.
 */
async function normaUpstream(tipo: string, numero: string): Promise<Documento | null> {
  const codigo = CODIGO_POR_TIPO[tipo.toLowerCase()];
  if (!codigo) return null;

  const docs = await consultar({ DocumentTypeCode: Number(codigo), DocumentNumber: numero });
  const normalizado = numero.replace(/\s+/g, "");
  return docs.find((d) => d.numero.replace(/\s+/g, "") === normalizado) ?? null;
}

// Una norma publicada no cambia: ventana larga y un fallo nunca se cachea.
const normaCached = unstable_cache(normaUpstream, ["normativa-cita"], { revalidate: 86400 });

/** Documento oficial de una cita normativa, o `null` si no se pudo resolver. */
export async function resolverNorma(
  tipo: string,
  numero: string | null,
): Promise<Documento | null> {
  if (!numero) return null;
  try {
    return await normaCached(tipo, numero);
  } catch (err) {
    console.error(`[normativa] cita ${tipo} ${numero}: ${String(err)}`);
  }
  // El origen no contestó: la instantánea cubre los años recientes.
  const codigo = CODIGO_POR_TIPO[tipo.toLowerCase()];
  const inst = codigo ? await leerInstantanea() : null;
  const normalizado = numero.replace(/\s+/g, "");
  for (const [clave, filas] of Object.entries(inst?.busquedas ?? {})) {
    if (!clave.startsWith(`${codigo}/`)) continue;
    const fila = filas.find((f) => texto(f.Numero).replace(/\s+/g, "") === normalizado);
    if (fila) return { ...aDocumento(fila), instantanea: inst!.generadoEn };
  }
  // Más vieja que la instantánea reciente: el histórico completo de las leyes
  // o el registro completo de decretos (`lib/decretos.ts`).
  if (codigo === "1") return leyHistorica(normalizado);
  if (codigo === "3") return decretoDelRegistro(normalizado);
  return null;
}

/** Un decreto «NNN-AA» del registro completo, como documento de la vertical. */
async function decretoDelRegistro(numero: string): Promise<Documento | null> {
  const [d, indice] = await Promise.all([decretoPorNumero(numero), indiceDecretos()]);
  if (!d || !indice) return null;
  return {
    tipo: "Decreto",
    numero: d.numero ?? numero,
    titulo: d.titulo,
    gaceta: null,
    fecha: d.fecha ? d.fecha.split("-").reverse().join("/") : null,
    fechaIso: d.fecha,
    documentId: d.docId != null ? String(d.docId) : null,
    url: d.docId != null ? `${BASE}/api/document/${d.docId}` : null,
    institucion: d.institucion,
    instantanea: indice.generado,
  };
}
