/**
 * El motor del buscador de toda la plataforma: `/buscar`, `/api/buscar` y
 * las sugerencias de la paleta ⌘K.
 *
 * Dos lecturas de la misma consulta, fundidas en una lista:
 *
 *  1. **Por palabra** — un índice invertido propio (`lib/busqueda-esquema.ts`):
 *     BM25 sobre título, texto auxiliar y quién publica, con raíces del
 *     español («escuelas» encuentra «escuela»), sin palabras vacías, sin
 *     tildes, y tolerancia de una errata en palabras largas («presupusto»).
 *     Todas las palabras que cuentan tienen que estar; las de una pregunta
 *     («¿cuánto **gana** un médico?») o de un sueldo solo ordenan.
 *  2. **Por tema** — un embedding estático (Model2Vec
 *     `potion-multilingual-128M`, MIT, podado al español por
 *     `scripts/build-modelo-semantico.py`): la consulta se tokeniza con
 *     `@huggingface/tokenizers` y se promedia su tabla; los vectores de las
 *     entradas que lo llevan (todas menos legisladores y proveedores, cuyo
 *     nombre no dice de qué tratan) vienen hechos de
 *     `scripts/build-busqueda.py`. «Agua potable» encuentra los conjuntos de
 *     CORAMON aunque se llamen «Producción de agua».
 *
 * Se funden por **rango recíproco** (RRF), que no pide que BM25 y coseno
 * hablen en la misma escala. Cada resultado dice por qué salió: sus
 * palabras están, o solo su tema se parece. Lo segundo se declara en la
 * interfaz; no se hace pasar por una coincidencia.
 *
 * Nada de esto es una base de datos (CLAUDE.md, la invariante): el corpus,
 * los vectores, el modelo y el índice por palabra ya construido
 * (`indice.bin`, de `scripts/build-indice-busqueda.mjs`) son archivos
 * versionados en `public/data/busqueda`, leídos una vez por instancia y
 * guardados en memoria.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { Tokenizer } from "@huggingface/tokenizers";
import {
  construirIndice,
  entradasDe,
  esVacia,
  etiquetaCorpus,
  leerIndice,
  palabrasDe,
  puntuar,
  raizDe,
  resolverFrases,
  terminosQueCasan,
  type IndicePalabras,
} from "@/lib/busqueda-esquema";
import { agujas, plano as planoConsulta, pruebas, sinTildes } from "@/lib/raiz";
import { INDICE } from "@/lib/indice";
import { PANTALLAS } from "@/lib/pantallas";
import { enlace } from "@/lib/grafo";

export type TipoResultado =
  | "institucion"
  | "legislador"
  | "funcionario"
  | "financiera"
  | "proveedor"
  | "proceso"
  | "norma"
  | "iniciativa"
  | "sentencia"
  | "obra"
  | "documento"
  | "dato"
  | "cargo";

/** El orden en que se nombran los tipos: el de las verticales en `/buscar`. */
export const TIPOS_RESULTADO: { clave: TipoResultado; etiqueta: string; plural: string }[] = [
  { clave: "institucion", etiqueta: "Institución", plural: "Instituciones" },
  { clave: "legislador", etiqueta: "Legislador", plural: "Legisladores" },
  { clave: "funcionario", etiqueta: "Funcionario", plural: "Funcionarios" },
  { clave: "financiera", etiqueta: "Entidad financiera", plural: "Bancos y financieras" },
  { clave: "proveedor", etiqueta: "Proveedor", plural: "Proveedores" },
  { clave: "proceso", etiqueta: "Proceso de compra", plural: "Procesos de compra" },
  { clave: "norma", etiqueta: "Norma", plural: "Normativa" },
  { clave: "iniciativa", etiqueta: "Iniciativa", plural: "Iniciativas del Congreso" },
  { clave: "sentencia", etiqueta: "Sentencia", plural: "Sentencias" },
  { clave: "obra", etiqueta: "Obra", plural: "Obras públicas" },
  { clave: "documento", etiqueta: "Documento", plural: "Documentos" },
  { clave: "dato", etiqueta: "Datos abiertos", plural: "Datos abiertos" },
  { clave: "cargo", etiqueta: "Cargo", plural: "Cargos en la nómina" },
];

/**
 * Los tipos cuyo título llega de su fuente en MAYÚSCULAS (normas, obras,
 * cargos, carátulas de procesos): se enseñan en
 * minúsculas con `desdeMayusculas`.
 */
export const EN_MAYUSCULAS: ReadonlySet<TipoResultado> = new Set(["norma", "obra", "cargo", "proceso"]);

export function esTipoResultado(v: string | undefined | null): v is TipoResultado {
  return TIPOS_RESULTADO.some((t) => t.clave === v);
}

/** Una entrada del corpus tal como la escribe `scripts/build-busqueda.py`. */
interface Entrada {
  t: TipoResultado;
  ti: string;
  x?: string;
  d?: string;
  o?: number;
  h?: string;
  f?: string;
  v?: number;
  n?: number;
  m?: number;
  p?: number;
  e?: 1;
  /**
   * El identificador del que se deriva la ficha: el RPE de un proveedor, el
   * código de un proceso. Se busca como texto auxiliar.
   */
  r?: string;
  /** Proveedores: RNC (si el cruce con la DGII lo trae), contratos y años. */
  c?: string;
  k?: number;
  a?: [number, number];
  /** Cargos: sueldo de sus plazas en el percentil 10, la mediana y el 90. */
  s?: [number, number, number];
}

interface Corpus {
  generado: string;
  /** Huella de las entradas: ata el índice guardado a este corpus. */
  huella?: string;
  instantaneas: Partial<Record<TipoResultado | "ley", string>>;
  dimensiones: number;
  piezas: number;
  /** Las primeras `vectorizados` entradas llevan vector; las demás, no. */
  vectorizados?: number;
  origenes: string[];
  /** Detalles y textos auxiliares repetidos; ver `resolverFrases`. */
  frases?: string[];
  docs: Entrada[];
}

/** Cómo se encontró un resultado. */
export type Via = "palabra" | "tema" | "ambas";

export interface Resultado {
  tipo: TipoResultado;
  /** El título tal como lo publica la fuente (puede venir en MAYÚSCULAS). */
  titulo: string;
  /** Lo que la fuente dice al lado: siglas, número, estado, formatos. */
  detalle: string | null;
  /** Quién publica o ejecuta, si se sabe. */
  origen: string | null;
  href: string | null;
  /** Un archivo o una ficha en el sitio de otra institución. */
  externo: boolean;
  fecha: string | null;
  /** Obras y procesos: su valor (estimado, en los procesos) en pesos. */
  valor: number | null;
  /** Cargos: plazas y en cuántas instituciones. */
  plazas: number | null;
  instituciones: number | null;
  /**
   * Cargos: sueldo mensual bruto de sus plazas —mediana y el tramo en que
   * cae el 80 % del medio—. No el mínimo ni el máximo: una plaza de medio mes
   * o un encargo con compensación los vuelven anécdota.
   */
  sueldo: { bajo: number; mediana: number; alto: number } | null;
  /** Proveedores: contratos desde 2015 en la instantánea. */
  contratos: number | null;
  /** Documentos: cuántos archivos del mismo sitio, título y fecha se juntaron aquí. */
  archivos: number | null;
  via: Via;
}


/* --------------------------------------------------------------- carga */

const DIR = path.join(process.cwd(), "public", "data", "busqueda");

interface Motor {
  corpus: Corpus;
  indice: IndicePalabras;
  tokenizer: Tokenizer;
  especiales: Set<number>;
  dim: number;
  /** Cuántas entradas, desde la primera, tienen vector. */
  vectorizados: number;
  /** Tabla del modelo: filas int8 × su escala. */
  tabla: Int8Array;
  escalaTabla: Float32Array;
  /** Vectores de las entradas, unitarios: filas int8 × su escala. */
  vectores: Int8Array;
  escalaVectores: Float32Array;
}

/** Filas int8 (n × dim) seguidas de una escala float32 por fila. */
function partir(buf: Buffer, n: number, dim: number): [Int8Array, Float32Array] {
  const filas = new Int8Array(buf.buffer, buf.byteOffset, n * dim);
  // Copia alineada: un Float32Array exige desplazamiento múltiplo de 4.
  const escalas = new Float32Array(n);
  new Uint8Array(escalas.buffer).set(buf.subarray(n * dim, n * dim + n * 4));
  return [filas, escalas];
}

/**
 * El índice por palabra: el guardado si es de este corpus, o construido aquí.
 * Leer el guardado es un `readFile` y unas vistas sobre el búfer (decenas de
 * milisegundos); construirlo, segundos. Si falta, está roto o su etiqueta no
 * es la del corpus —alguien regeneró el corpus y no el índice—, se
 * construye: más lento, nunca distinto.
 */
async function indicePorPalabra(corpus: Corpus): Promise<IndicePalabras> {
  const etiqueta = etiquetaCorpus(corpus);
  const guardado = await readFile(path.join(DIR, "indice.bin")).catch(() => null);
  if (guardado) {
    try {
      const ix = leerIndice(guardado);
      if (ix.etiqueta === etiqueta) return ix;
      console.warn("[busqueda] indice.bin es de otro corpus: se construye en memoria (corre scripts/build-indice-busqueda.mjs)");
    } catch (err) {
      console.warn(`[busqueda] indice.bin no se pudo leer: se construye en memoria (${String(err)})`);
    }
  }
  return construirIndice(corpus.docs, corpus.origenes, etiqueta);
}

async function cargar(): Promise<Motor> {
  const [crudoCorpus, crudoTok, crudoMeta, bufModelo, bufVectores] = await Promise.all([
    readFile(path.join(DIR, "corpus.json"), "utf8"),
    readFile(path.join(DIR, "tokenizer.json"), "utf8"),
    readFile(path.join(DIR, "modelo.json"), "utf8"),
    readFile(path.join(DIR, "modelo.bin")),
    readFile(path.join(DIR, "vectores.bin")),
  ]);
  const corpus = JSON.parse(crudoCorpus) as Corpus;
  resolverFrases(corpus);
  const meta = JSON.parse(crudoMeta) as { piezas: number; dimensiones: number; especiales: number[] };
  if (meta.piezas !== corpus.piezas || meta.dimensiones !== corpus.dimensiones) {
    // Vectores de otro modelo: compararlos daría ruido con apariencia de tema.
    throw new Error("corpus y modelo no coinciden: vuelve a correr scripts/build-busqueda.py");
  }
  const dim = meta.dimensiones;
  const vectorizados = corpus.vectorizados ?? corpus.docs.length;
  if (bufVectores.length !== vectorizados * (dim + 4)) {
    throw new Error("corpus y vectores no coinciden: vuelve a correr scripts/build-busqueda.py");
  }
  const [tabla, escalaTabla] = partir(bufModelo, meta.piezas, dim);
  const [vectores, escalaVectores] = partir(bufVectores, vectorizados, dim);

  return {
    corpus,
    indice: await indicePorPalabra(corpus),
    tokenizer: new Tokenizer(JSON.parse(crudoTok), {}),
    especiales: new Set(meta.especiales),
    dim,
    vectorizados,
    tabla,
    escalaTabla,
    vectores,
    escalaVectores,
  };
}

let memo: Promise<Motor> | null = null;
function motor(): Promise<Motor> {
  memo ??= cargar().catch((err) => {
    memo = null;
    throw err;
  });
  return memo;
}

/* ------------------------------------------------------------- lecturas */

/** El vector unitario de un texto: promedio de las filas de sus piezas. */
function embeber(m: Motor, texto: string): Float32Array | null {
  const ids = m.tokenizer
    .encode(texto.toLowerCase(), { add_special_tokens: false })
    .ids.filter((id) => !m.especiales.has(id));
  if (ids.length === 0) return null;
  const v = new Float32Array(m.dim);
  for (const id of ids) {
    const s = m.escalaTabla[id];
    const base = id * m.dim;
    for (let k = 0; k < m.dim; k++) v[k] += m.tabla[base + k] * s;
  }
  let norma = 0;
  for (let k = 0; k < m.dim; k++) norma += v[k] * v[k];
  norma = Math.sqrt(norma);
  if (!norma) return null;
  for (let k = 0; k < m.dim; k++) v[k] /= norma;
  return v;
}

/**
 * Por debajo de este coseno el parecido es ruido: medido sobre el corpus,
 * «corrupción» contra «CORONEL» da 0,46 y «agua potable» contra «Producción
 * de agua potable» 0,80. Un resultado solo por tema tiene que pasarlo.
 */
const UMBRAL_TEMA = 0.55;
/** Cuántos vecinos por tema entran a la fusión. */
const VECINOS = 150;

function porTema(m: Motor, v: Float32Array | null, tipo?: TipoResultado): { i: number; s: number }[] {
  if (!v) return [];
  const docs = m.corpus.docs;
  const mejores: { i: number; s: number }[] = [];
  let piso = UMBRAL_TEMA;
  // Legisladores y proveedores van al final y sin vector: el tema no los alcanza.
  for (let i = 0; i < m.vectorizados; i++) {
    if (tipo && docs[i].t !== tipo) continue;
    const base = i * m.dim;
    let s = 0;
    for (let k = 0; k < m.dim; k++) s += v[k] * m.vectores[base + k];
    s *= m.escalaVectores[i];
    if (s < piso) continue;
    mejores.push({ i, s });
    if (mejores.length > VECINOS * 2) {
      mejores.sort((a, b) => b.s - a.s).length = VECINOS;
      piso = mejores[VECINOS - 1].s;
    }
  }
  return mejores.sort((a, b) => b.s - a.s).slice(0, VECINOS);
}

/* -------------------------------------------------- qué palabras cuentan */

/**
 * Las palabras con que se pregunta y no se nombra: el verbo de «¿cuánto
 * **gana** un médico?» y el sujeto de «¿cuánto debe **el país**?». Exigirlas
 * trae lo que las lleva por casualidad —«país» traía los decretos de
 * consulados—; en una pregunta solo ayudan a ordenar. Las demás palabras
 * vacías (qué, cuánto, debe, hay) ya las quita el índice.
 */
const DE_PREGUNTA = new Set([
  "gana", "ganan", "cobra", "cobran", "paga", "pagan", "cuesta", "cuestan", "gasta", "gastan",
  "recibe", "reciben", "invierte", "invierten", "compra", "compran", "existe", "existen",
  "pais", "republica", "dominicana", "rd", "gobierno", "estado", "nacion", "dinero", "plata",
]);
const INTERROGATIVAS = new Set([
  "que", "quien", "quienes", "cual", "cuales", "cuanto", "cuanta", "cuantos", "cuantas",
  "como", "donde", "cuando", "porque",
]);

/**
 * Las de un sueldo: «salario ministro» busca la plaza de ministro y su
 * sueldo, no un documento que diga las dos cosas. Ordenan y prefieren los
 * cargos, pero no se exigen si queda otra palabra.
 */
const DE_SUELDO = new Set([
  "salario", "salarios", "sueldo", "sueldos", "gana", "ganan", "cobra", "cobran", "remuneracion",
]);

/**
 * Las de una compra: «compras de computadoras» busca los procesos de
 * computadoras, que se titulan «Adquisición de computadoras» y no dicen
 * «compra». Ordenan y prefieren los procesos.
 */
const DE_COMPRA = new Set([
  "compra", "compras", "adquisicion", "adquisiciones", "licitacion", "licitaciones", "contratacion",
  "contrataciones",
]);

/**
 * Las de un cargo electo: «senador», «diputada por Santiago» buscan a las
 * personas antes que las leyes de pensión «a favor del ex-senador…» o las
 * resoluciones «de la Cámara de Diputados». Se exigen —dicen de quién se
 * habla— y prefieren legisladores.
 */
const DE_LEGISLADOR = new Set([
  "senador", "senadora", "senadores", "senadoras", "diputado", "diputada", "diputados", "diputadas",
  "legislador", "legisladora", "legisladores", "legisladoras",
]);

/**
 * Las de un cargo público que no es de legislador: «ministro de educación»,
 * «alcalde de Santiago», «jueza». Se exigen y prefieren a las personas
 * (`/funcionarios`), como las de legislador prefieren a los legisladores.
 */
const DE_FUNCIONARIO = new Set([
  "ministro", "ministra", "viceministro", "viceministra", "alcalde", "alcaldesa", "vicealcalde",
  "vicealcaldesa", "regidor", "regidora", "juez", "jueza", "magistrado", "magistrada", "embajador",
  "embajadora", "consul", "gobernador", "gobernadora", "funcionario", "funcionaria",
]);

interface Consulta {
  /** Lo tecleado, recortado: es lo que se embebe. */
  texto: string;
  /** Las palabras que tienen que estar, ya planas y sin vacías. */
  requeridas: string[];
  /** Las que solo suman al orden. */
  opcionales: string[];
  /** ¿La última requerida es la última tecleada? Entonces se admite como prefijo. */
  ultimaAbierta: boolean;
  /** Un tipo que la consulta pide sin nombrarlo («sueldo» → cargos). */
  preferido?: TipoResultado;
  /** Las requeridas unidas: lo que se compara con un título exacto. */
  nucleo: string;
  /** ¿Se tecleó como pregunta («¿cuánto…?», «qué…»)? */
  pregunta: boolean;
}

export function analizarConsulta(texto: string): Consulta {
  const todas = palabrasDe(texto);
  const pregunta = /[¿?]/.test(texto) || INTERROGATIVAS.has(todas[0] ?? "");
  const contenido = todas.filter((w) => !esVacia(w));
  const sueldo = contenido.some((w) => DE_SUELDO.has(w));
  const compra = contenido.some((w) => DE_COMPRA.has(w));
  const opcional = (w: string) => DE_SUELDO.has(w) || DE_COMPRA.has(w) || (pregunta && DE_PREGUNTA.has(w));
  let requeridas = contenido.filter((w) => !opcional(w));
  let opcionales = contenido.filter(opcional);
  // «sueldo», «¿salario?» o «república dominicana» solos: si no es una
  // pregunta, lo tecleado es lo que se busca.
  if (requeridas.length === 0 && !pregunta) [requeridas, opcionales] = [opcionales, []];
  return {
    texto,
    requeridas,
    opcionales,
    ultimaAbierta: requeridas.length > 0 && requeridas[requeridas.length - 1] === todas[todas.length - 1],
    preferido:
      requeridas.length > 0 && opcionales.length > 0
        ? sueldo
          ? "cargo"
          : compra
            ? "proceso"
            : undefined
        : requeridas.some((w) => DE_LEGISLADOR.has(w))
          ? "legislador"
          : requeridas.some((w) => DE_FUNCIONARIO.has(w))
            ? "funcionario"
            : undefined,
    nucleo: requeridas.join(" "),
    pregunta,
  };
}

/* ------------------------------------------------------------ por palabra */

/** Tope de coincidencias por palabra que entran a la fusión. */
const TOPE_PALABRA = 20_000;

interface PorPalabra {
  ids: number[];
  total: number;
  tolerancia: number;
  /** Todos los que llevan todas las palabras, más allá del tope de `ids`. */
  todos: Set<number>;
}

/** Con menos coincidencias exactas que estas, se prueba con una errata. */
const MINIMO_SIN_ERRATA = 3;

/** ¿Se puede perdonar una errata? Una o dos palabras, todas largas. */
function admiteErrata(c: Consulta): boolean {
  return c.requeridas.length > 0 && c.requeridas.length <= 2 && c.requeridas.every((w) => /^[a-z]{6,}$/.test(w));
}

/**
 * Los términos del índice que cuentan como **esa palabra**. La raíz tiene
 * que ser la del documento: «agua» es `agu`, y como prefijo traía `aguj`,
 * `agustin` y `aguilar`. El prefijo solo se admite en la **última** palabra,
 * si el lematizador no la tocó y no es un número: es la que se está
 * escribiendo («minis» → ministerio). Con tolerancia, una edición sobre la
 * raíz.
 */
function terminosDe(m: Motor, palabra: string, tolerancia: number, ultima: boolean): number[] {
  const raiz = raizDe(palabra);
  if (tolerancia > 0) return terminosQueCasan(m.indice, raiz, "errata");
  const prefijo = ultima && raiz === palabra && !/\d/.test(raiz) && raiz.length >= 3;
  return terminosQueCasan(m.indice, raiz, prefijo ? "prefijo" : "exacta");
}

/**
 * Todas las requeridas tienen que estar, cada una en cualquier campo:
 * «agua CORAMON» lleva una en el título y otra en quién publica. El orden es
 * el BM25 de todas las palabras —requeridas y opcionales— entre las que
 * pasan.
 */
function porPalabra(m: Motor, c: Consulta, tipo?: TipoResultado, tolerancia?: number): PorPalabra {
  const conTolerancia = (t: number): PorPalabra => {
    const vacio = { ids: [], total: 0, tolerancia: t, todos: new Set<number>() };
    if (c.requeridas.length === 0) return vacio;
    const docs = m.corpus.docs;
    const terminos = c.requeridas.map((w, n) =>
      terminosDe(m, w, t, c.ultimaAbierta && n === c.requeridas.length - 1),
    );
    // Se cruza desde la más rara: el conjunto más chico manda.
    const conjuntos = terminos.map((ks) => entradasDe(m.indice, ks)).sort((a, b) => a.size - b.size);
    let todas = [...conjuntos[0]].filter((i) => (!tipo || docs[i].t === tipo) && conjuntos.every((s) => s.has(i)));
    if (todas.length === 0) return vacio;
    const admitidas = new Set(todas);
    const puntos = new Map<number, number>();
    const vale = (i: number) => admitidas.has(i);
    // Con tolerancia, la palabra bien escrita vale el doble que sus erratas.
    const raices = c.requeridas.map(raizDe);
    terminos.forEach((ks, n) => {
      for (const k of ks) puntuar(m.indice, k, vale, puntos, t > 0 && m.indice.terminos[k] !== raices[n] ? 0.5 : 1);
    });
    for (const w of c.opcionales) for (const k of terminosDe(m, w, 0, false)) puntuar(m.indice, k, vale, puntos);
    todas = todas.sort((a, b) => puntos.get(b)! - puntos.get(a)! || a - b);
    return { ids: todas.slice(0, TOPE_PALABRA), total: todas.length, tolerancia: t, todos: admitidas };
  };

  if (tolerancia !== undefined) return conTolerancia(tolerancia);
  const exacta = conTolerancia(0);
  // Una errata solo se perdona cuando lo exacto trajo casi nada —«presupusto»
  // está mal escrito en el título de una ley de 1931, y esa sola no es la
  // respuesta—, y solo en consultas de una o dos palabras largas. En una
  // frase larga, mejor que conteste el tema. Lo exacto sigue primero: vale
  // el doble que la errata.
  if (exacta.total < MINIMO_SIN_ERRATA && admiteErrata(c)) {
    const tolerante = conTolerancia(1);
    if (tolerante.total > exacta.total) return tolerante;
  }
  return exacta;
}

/* --------------------------------------------------------------- fusión */

/** La constante de RRF de la literatura (Cormack et al., 2009). */
const K_RRF = 60;
/** El tema pesa menos que la palabra: acompaña, no manda. */
const PESO_TEMA = 0.6;
/** Cuánto sube el tipo que la consulta pide sin nombrarlo. */
const PESO_PREFERIDO = 1.6;

export const POR_PAGINA = 20;
/** Cuántos de cada tipo enseña la vista «Todo». */
const POR_GRUPO = 4;

function plano(s: string): string {
  return sinTildes(s).toLowerCase().replace(/\s+/g, " ").trim();
}

/** «Decreto 38 25», «decreto núm. 38-25» y «Decreto 38-25» son la misma cita. */
function sinGuiones(s: string): string {
  return plano(s)
    .replace(/\b(n[uú]m(ero)?|no)\b\.?/g, " ")
    .replace(/[-.\s]+/g, " ")
    .trim();
}

/**
 * Una cita busca su ficha, no un tema: «Ley 80-25», «decreto 38 25», «ley
 * 1494» (las leyes viejas no llevan año), «TC/0064/19», «TSE-001-2021». El
 * vector de «ley» y un número se parece a cualquier otra ley.
 */
const ES_CITA =
  /\b\d{1,4}[-\s]\d{2,4}\b|\b(?:ley|decreto|reglamento|resoluci[oó]n)\s+(?:n[uú]m(?:ero)?\.?\s*|no\.?\s*)?\d+|\bt(?:c|se)[/\-\s]?\d{1,4}[/\-]\d{2,4}\b/i;

/** Un título que es el nombre de un archivo («7. ag salud.pdf»): dice poco. */
const TITULO_ARCHIVO = /\.(pdf|docx?|xlsx?|pptx?|csv|odt|ods|zip|rar)$/i;

export interface Grupo {
  tipo: TipoResultado;
  total: number;
  resultados: Resultado[];
}

export interface Hallazgos {
  /** La página pedida del tipo filtrado, o de todo mezclado. */
  resultados: Resultado[];
  /** Vista «Todo»: los mejores de cada tipo, en el orden de su mejor resultado. */
  grupos: Grupo[];
  /** Resultados del filtro actual que la lista puede recorrer. */
  total: number;
  /** Por tipo, sin el filtro de tipo: lo que dicen los filtros. */
  porTipo: Record<TipoResultado, number>;
  /**
   * Hubo más coincidencias por palabra que las que se ordenan (el tope de la
   * fusión): las cuentas son las del índice y la lista recorre las más
   * pertinentes.
   */
  truncado: boolean;
  /** Cuántos salieron solo por tema, en el filtro actual. */
  soloTema: number;
  /** Se admitieron palabras a una errata de lo tecleado (había pocas o ninguna exacta). */
  conErrata: boolean;
  /** Palabras de la consulta que solo ordenaron (las de una pregunta, un sueldo o una compra). */
  soloOrdenan: string[];
  /** ¿Se tecleó como pregunta? */
  pregunta: boolean;
  pagina: number;
  paginas: number;
  generado: string;
  instantaneas: Partial<Record<TipoResultado | "ley", string>>;
}

interface Fusion {
  /** Índices del corpus, del más pertinente al menos, sin copias. */
  orden: number[];
  via: Map<number, Via>;
  /** Documentos: los formatos en que se publicó el mismo archivo. */
  formatos: Map<number, string[]>;
  /** Documentos: cuántas copias se juntaron en cada resultado. */
  copias: Map<number, number>;
}

const sitioDe = (url: string) => /^https?:\/\/([^/]+)/i.exec(url)?.[1] ?? "";

/**
 * Las claves con que un documento se reconoce copia de otro:
 *
 *  - el **mismo archivo** sin su extensión ni su copia: `…/Informe-2026.pdf`,
 *    `…/Informe-2026.xlsx` y el `…/2026/03/Informe-2026-1.pdf` que WordPress
 *    crea al subir otra vez lo mismo;
 *  - el **mismo título, del mismo sitio, subido el mismo día**: los cinco
 *    anexos de una nota («Contrataciones Públicas remite informe a
 *    solicitud del senador…») que la institución tituló igual.
 *
 * «Tomo-1» y «Tomo-2» se titulan distinto y no se juntan; dos «Informe» de
 * fechas distintas, tampoco.
 */
function clavesDeCopia(d: Entrada): string[] {
  if (d.t !== "documento" || !d.h) return [];
  const sitio = sitioDe(d.h);
  const nombre = (d.h.split("/").pop() ?? "")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/-\d{1,2}$/, "")
    .toLowerCase();
  const claves = [`a|${sitio}|${nombre}|${plano(d.ti)}`];
  if (d.f) claves.push(`t|${sitio}|${plano(d.ti)}|${d.f}`);
  return claves;
}

function fundir(m: Motor, c: Consulta, palabra: PorPalabra, tema: { i: number }[]): Fusion {
  const docs = m.corpus.docs;
  const puntos = new Map<number, number>();
  const via = new Map<number, Via>();
  palabra.ids.forEach((i, rango) => {
    puntos.set(i, 1 / (K_RRF + rango));
    via.set(i, "palabra");
  });
  tema.forEach(({ i }, rango) => {
    puntos.set(i, (puntos.get(i) ?? 0) + PESO_TEMA / (K_RRF + rango));
    // Lleva todas las palabras aunque quedara fuera del tope: no es «por tema».
    via.set(i, via.has(i) || palabra.todos.has(i) ? "ambas" : "tema");
  });
  const exactas = new Set([plano(c.texto), c.nucleo].filter(Boolean));
  const cita = sinGuiones(c.texto);
  for (const [i, p] of puntos) {
    const d = docs[i];
    // Lo tecleado es el nombre, las siglas o la cita exactas («Ley 80-25»,
    // «Ministro» en «salario ministro»): eso va primero.
    const nombrado =
      exactas.has(plano(d.ti)) ||
      (d.t === "institucion" && exactas.has(plano(d.x ?? ""))) ||
      (d.t === "norma" && sinGuiones(d.x ?? "") === cita) ||
      (d.t === "sentencia" && sinGuiones((d.d ?? "").replace(/\//g, " ")) === sinGuiones(c.texto.replace(/\//g, " ")));
    // Un legislador que lleva todas las palabras de «diputado santiago» es
    // lo nombrado: su cargo y su provincia están en el texto auxiliar, no en
    // el título (su nombre), y el BM25 lo pondría detrás de cada resolución
    // «de la Cámara de Diputados» que mencione Santiago.
    const legislador = c.preferido === "legislador" && d.t === "legislador";
    let q = nombrado || legislador ? p + 1 : p;
    if (c.preferido && d.t === c.preferido && !legislador) q *= PESO_PREFERIDO;
    if (d.t === "documento" && TITULO_ARCHIVO.test(d.ti)) q *= 0.8;
    // Un ministerio antes que un hospital que se llama parecido.
    puntos.set(i, q / (1 + 0.15 * (d.p ?? 0)));
  }

  // Solo se juntan copias de verdad (ver `clavesDeCopia`). Dos decretos «Que
  // otorga exequátur» o dos obras con el mismo nombre y distinto SNIP son
  // resultados distintos aunque se titulen igual.
  const orden: number[] = [];
  const formatos = new Map<number, string[]>();
  const copias = new Map<number, number>();
  const primero = new Map<string, number>();
  for (const i of [...puntos.keys()].sort((a, b) => puntos.get(b)! - puntos.get(a)! || a - b)) {
    const d = docs[i];
    const claves = clavesDeCopia(d);
    const ya = claves.map((k) => primero.get(k)).find((x) => x !== undefined);
    if (ya === undefined) {
      for (const k of claves) primero.set(k, i);
      orden.push(i);
      if (d.t === "documento" && d.d) formatos.set(i, [d.d]);
      continue;
    }
    for (const k of claves) if (!primero.has(k)) primero.set(k, ya);
    copias.set(ya, (copias.get(ya) ?? 1) + 1);
    const f = formatos.get(ya);
    if (f && d.d && !f.includes(d.d)) f.push(d.d);
    if (via.get(i) !== via.get(ya)) via.set(ya, "ambas");
  }
  return { orden, via, formatos, copias };
}

/**
 * Busca `q` en todo el corpus. `tipo` filtra —y entonces la búsqueda por
 * palabra y por tema se hace dentro de ese tipo, para que su lista llegue
 * tan lejos como su cuenta—; las cuentas por tipo se dan siempre sin ese
 * filtro, para que los filtros digan cuánto hay en cada uno. Devuelve `null`
 * si el índice no se pudo cargar o la búsqueda falló: «no pudimos mirar» no
 * es «no hay nada».
 */
export async function buscarEnTodo(
  q: string,
  opts: { tipo?: TipoResultado; pagina?: number; porPagina?: number } = {},
): Promise<Hallazgos | null> {
  try {
    const m = await motor();
    const docs = m.corpus.docs;
    const c = analizarConsulta(q.trim().slice(0, 120));
    // Sin una palabra con contenido («de la», «¿?», «--») no hay tema: el
    // vector de las palabras vacías se parece a todo y traía 146 filas.
    // Tampoco en una pregunta sin nada que nombrar («¿cuánto debe el
    // país?»): su vector se parece a los decretos que nombran cónsules «en
    // varios países». La contesta la pantalla que la responde, no el índice.
    const conContenido = c.requeridas.length > 0 || (!c.pregunta && c.opcionales.length > 0);
    // Una cita («Ley 80-25», «decreto 38 25») busca una norma, no un tema: el
    // vector de «ley» y un número se parece a cualquier otra ley.
    const esCita = ES_CITA.test(c.texto);
    // Ni un número suelto (un RNC, un expediente): su vector no es un tema.
    const soloNumeros = c.requeridas.length > 0 && c.requeridas.every((w) => /^[\d-]+$/.test(w));
    const vector = conContenido && !esCita && !soloNumeros ? embeber(m, c.texto) : null;

    // Todo, sin filtro: las cuentas de los filtros y la vista «Todo».
    const palabra = porPalabra(m, c);
    const tema = porTema(m, vector);
    const todo = fundir(m, c, palabra, tema);
    const porTipo = Object.fromEntries(TIPOS_RESULTADO.map((t) => [t.clave, 0])) as Record<TipoResultado, number>;
    for (const i of todo.orden) porTipo[docs[i].t] += 1;
    let truncado = palabra.total > palabra.ids.length;
    if (truncado) {
      // Más allá del tope de la fusión se cuenta, no se ordena: todos los que
      // llevan las palabras más los que solo trajo el tema, en una pasada y
      // con las copias juntadas como en la lista, para que el filtro diga lo
      // que abre.
      const vistas = new Set<string>();
      for (const t of TIPOS_RESULTADO) porTipo[t.clave] = 0;
      const contar = (i: number) => {
        const claves = clavesDeCopia(docs[i]);
        if (claves.some((k) => vistas.has(k))) return;
        for (const k of claves) vistas.add(k);
        porTipo[docs[i].t] += 1;
      };
      for (const i of palabra.todos) contar(i);
      for (const i of todo.orden) if (todo.via.get(i) === "tema") contar(i);
    }

    // Un tipo elegido se busca dentro de ese tipo, con la misma tolerancia.
    // Los vecinos por tema son los mismos que contaron los filtros, para que
    // «Normativa 93» abra una lista de 93 y no de 150.
    let lista = todo;
    if (opts.tipo) {
      const soloTipo = porPalabra(m, c, opts.tipo, palabra.tolerancia);
      truncado = soloTipo.total > soloTipo.ids.length;
      lista = fundir(m, c, soloTipo, tema.filter(({ i }) => docs[i].t === opts.tipo));
    }

    const aplicar = (f: Fusion) => (i: number) =>
      aResultado(m.corpus, docs[i], f.via.get(i)!, f.formatos.get(i), f.copias.get(i));
    const porPagina = opts.porPagina ?? POR_PAGINA;
    const paginas = Math.max(1, Math.ceil(lista.orden.length / porPagina));
    const pagina = Math.min(Math.max(1, opts.pagina ?? 1), paginas);

    const grupos: Grupo[] = [];
    for (const i of todo.orden) {
      const t = docs[i].t;
      let g = grupos.find((x) => x.tipo === t);
      if (!g) grupos.push((g = { tipo: t, total: porTipo[t], resultados: [] }));
      if (g.resultados.length < POR_GRUPO) g.resultados.push(aplicar(todo)(i));
    }

    return {
      resultados: lista.orden.slice((pagina - 1) * porPagina, pagina * porPagina).map(aplicar(lista)),
      grupos,
      total: lista.orden.length,
      porTipo,
      truncado,
      soloTema: lista.orden.filter((i) => lista.via.get(i) === "tema").length,
      conErrata: palabra.tolerancia > 0 && palabra.total > 0,
      soloOrdenan: c.opcionales,
      pregunta: c.pregunta,
      pagina,
      paginas,
      generado: m.corpus.generado,
      instantaneas: m.corpus.instantaneas,
    };
  } catch (err) {
    console.error(`[busqueda] ${String(err)}`);
    return null;
  }
}

/* ------------------------------------------------------------ pantallas */

/** Una pantalla de la plataforma que responde a la consulta (G4). */
export interface PantallaHallada {
  href: string;
  titulo: string;
  nota: string;
  /** El tema del menú: «Compras públicas», «Congreso Nacional». */
  tema: string;
  /** La pregunta de la pantalla que más se parece a lo tecleado, si alguna. */
  pregunta: string | null;
}

interface PantallaIndexada {
  href: string;
  titulo: string;
  nota: string;
  tema: string;
  textoPlano: string;
  frases: string[];
  vectores: (Float32Array | null)[];
}

let memoPantallas: PantallaIndexada[] | null = null;

/**
 * Cada destino de `lib/indice.ts` con su nombre, su nota y las preguntas de
 * `lib/pantallas.ts`, cada frase con su vector del mismo modelo que el
 * corpus. Se calcula una vez por instancia: son ~40 pantallas y ~150 frases,
 * unos milisegundos, y así no hay un archivo más que regenerar.
 */
function pantallasIndexadas(m: Motor): PantallaIndexada[] {
  if (memoPantallas) return memoPantallas;
  memoPantallas = INDICE.map((d) => {
    const extra = PANTALLAS[d.href];
    const frases = [`${d.label}. ${d.nota}`, ...(extra ? [extra.que, ...extra.preguntas] : [])];
    return {
      href: d.href,
      titulo: d.label,
      nota: d.nota,
      tema: d.tema,
      textoPlano: planoConsulta(`${d.label} ${d.tema} ${frases.join(" ")}`),
      frases,
      vectores: frases.map((f) => embeber(m, f)),
    };
  });
  return memoPantallas;
}

/**
 * Por debajo de este puntaje una pantalla no se ofrece. Medido con la
 * batería: una consulta sin sentido («xyzqwe») llega a 0,36 con la pantalla
 * más parecida, y las preguntas legítimas más flojas pasan de 0,5.
 */
const UMBRAL_PANTALLA = 0.5;

/**
 * Las pantallas que responden a la consulta, por lo que significan: «¿cuánto
 * debe el país?» → Deuda pública, aunque no diga «deuda». El puntaje es el
 * mayor parecido con alguna de sus frases (el nombre, lo que ofrece, sus
 * preguntas) más la parte de las palabras de la consulta que aparecen en su
 * texto. `null` si el modelo no cargó.
 */
export async function buscarPantallas(q: string, n = 3): Promise<PantallaHallada[] | null> {
  try {
    const consulta = q.trim().slice(0, 120);
    // Una cita o un código busca su ficha, no una pantalla.
    if (/\b\d{1,4}[-\s]\d{2,4}\b/.test(consulta) || !/\p{L}{3}/u.test(consulta)) return [];
    const m = await motor();
    const v = embeber(m, consulta);
    const ps = pruebas(agujas(consulta));
    return pantallasIndexadas(m)
      .map((p) => {
        let mejor = 0;
        let cual = -1;
        p.vectores.forEach((u, k) => {
          if (!u || !v) return;
          let s = 0;
          for (let j = 0; j < m.dim; j++) s += v[j] * u[j];
          if (s > mejor) [mejor, cual] = [s, k];
        });
        const palabras = ps.length ? ps.filter((f) => f(p.textoPlano)).length / ps.length : 0;
        return { p, mejor, cual, palabras, puntos: mejor + 0.5 * palabras };
      })
      .filter((x) => x.puntos >= UMBRAL_PANTALLA)
      .sort((a, b) => b.puntos - a.puntos)
      .slice(0, n)
      .map(({ p, cual }) => ({
        href: p.href,
        titulo: p.titulo,
        nota: p.nota,
        tema: p.tema,
        // La primera frase es el nombre y la segunda lo que ofrece: solo una
        // pregunta se enseña como pregunta.
        pregunta: cual >= 2 ? p.frases[cual] : null,
      }));
  } catch (err) {
    console.error(`[busqueda] pantallas: ${String(err)}`);
    return null;
  }
}

const ENTERO = new Intl.NumberFormat("es-DO");

/** «RNC 101786159 · 37 contratos, 2015–2022»: lo que el corpus no escribe. */
function detalleProveedor(d: Entrada): string {
  const contratos = d.k ? `${ENTERO.format(d.k)} ${d.k === 1 ? "contrato" : "contratos"}` : null;
  const anios = d.a ? (d.a[0] === d.a[1] ? `${d.a[0]}` : `${d.a[0]}–${d.a[1]}`) : null;
  return [d.c && `RNC ${d.c}`, [contratos, anios].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
}

/**
 * Varios archivos juntados en un resultado no caben en un enlace a uno solo:
 * se abre la biblioteca de documentos con ese título, en ese sitio.
 */
function hrefCopias(d: Entrada): string {
  // El sitio tal cual: `/documentos` compara `inst` con los hosts de su
  // índice, que conservan el «www.» de los que lo llevan (Hacienda, SISALRIL).
  const u = new URLSearchParams({ q: d.ti, inst: sitioDe(d.h ?? "") });
  return `/documentos?${u.toString()}`;
}

function aResultado(c: Corpus, d: Entrada, via: Via, formatos?: string[], copias?: number): Resultado {
  const proveedor = d.t === "proveedor";
  const archivos = copias && copias > 1 ? copias : null;
  const detalle = formatos
    ? [formatos.join(" · "), archivos && `${ENTERO.format(archivos)} archivos`].filter(Boolean).join(" · ")
    : proveedor
      ? detalleProveedor(d)
      : d.d;
  let href = d.h ?? null;
  if (proveedor && d.r) href = enlace.proveedor(d.r);
  else if (d.t === "proceso" && d.r) href = enlace.proceso(d.r);
  else if (archivos) href = hrefCopias(d);
  return {
    tipo: d.t,
    titulo: d.ti,
    detalle: detalle || null,
    origen: d.o === undefined ? null : c.origenes[d.o],
    href,
    externo: d.e === 1 && !archivos,
    fecha: d.f ?? null,
    valor: d.v ?? null,
    plazas: d.n ?? null,
    instituciones: d.m ?? null,
    sueldo: d.s ? { bajo: d.s[0], mediana: d.s[1], alto: d.s[2] } : null,
    contratos: proveedor ? (d.k ?? null) : null,
    archivos,
    via,
  };
}
