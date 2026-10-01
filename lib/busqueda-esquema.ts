/**
 * La forma del índice del buscador, en un solo sitio: la usan
 * `lib/busqueda.ts` (en el servidor, para leerlo) y
 * `scripts/build-indice-busqueda.mjs` (en build, para escribirlo). Si
 * discreparan —otro lematizador, otra lista de palabras vacías, otro corte
 * de palabras—, el índice tendría raíces que la consulta no produce y
 * buscaría en silencio peor. Por eso ninguno de los dos la escribe por su
 * cuenta.
 *
 * El archivo (`indice.bin`) guarda dos cosas, y el servidor no lee nada más
 * del corpus:
 *
 *  1. **El índice por palabra**: invertido, propio, y no el de Orama que lo
 *     precedió (27 MB de JSON, ~1,3 s por arranque en frío con 68 mil
 *     entradas). La lista de términos ordenada (búsqueda binaria, prefijos y
 *     erratas) y, por término, sus apariciones (entrada, campo, frecuencia),
 *     que alimentan el BM25.
 *  2. **El corpus por columnas**: cada campo de las entradas en su propia
 *     tabla —el texto como diccionario de valores distintos, el número en el
 *     entero más chico que lo guarda—. El `corpus.json` del que sale pesa
 *     47 MB, y su `JSON.parse` con 205 mil entradas era más de la mitad del
 *     arranque en frío (~0,65 s, medido el 2026-10-01). Las columnas se leen
 *     con vistas sobre el mismo búfer, y un texto se descodifica la primera
 *     vez que se pide: una búsqueda mira miles de títulos, no 205 mil.
 *
 * Sin alias `@/` y con la extensión en el import: `node` lo carga tal cual
 * (quita los tipos), sin compilar.
 */

import { lematizar, PALABRAS_VACIAS, sinTildes } from "./raiz.ts";

/** Los campos buscables, en el orden en que el índice los numera. */
export const CAMPOS = ["ti", "x", "o"] as const;
/** Cuánto pesa cada campo en el BM25: el título manda. */
export const REFUERZO = [3, 1, 0.5] as const;

const VACIAS = new Set(PALABRAS_VACIAS.map((w) => sinTildes(w.toLowerCase())));

/**
 * Las palabras de un texto: minúsculas, sin tildes (la ñ pasa a n, como en
 * `sinTildes`), cortadas en todo lo que no sea letra o cifra. Un número con
 * guiones («47-20», «2024-0001») es una sola palabra.
 */
export function palabrasDe(texto: string): string[] {
  return sinTildes((texto || "").toLowerCase()).match(/\d+(?:-\d+)+|[a-z0-9]+/g) ?? [];
}

/** ¿Es una palabra vacía («de», «la», «núm»)? */
export function esVacia(palabra: string): boolean {
  return VACIAS.has(palabra);
}

/** La raíz con que una palabra ya plana entra al índice o a la consulta. */
export function raizDe(palabra: string): string {
  return /\d/.test(palabra) ? palabra : lematizar(palabra);
}

/**
 * Las raíces de un texto para **indexarlo**: sin vacías, lematizadas. Un
 * número con guiones entra entero y por partes: «Ley 47-20» se encuentra
 * con «47-20» y con «47 20».
 */
export function raicesParaIndice(texto: string): string[] {
  const salida: string[] = [];
  for (const p of palabrasDe(texto)) {
    if (esVacia(p)) continue;
    salida.push(raizDe(p));
    if (!p.includes("-")) continue;
    salida.push(...p.split("-"));
    // «Ley 47-2020» también es la 47-20: la cita corta que se teclea.
    const corta = /^(\d{1,4})-(?:19|20)(\d{2})$/.exec(p);
    if (corta) salida.push(`${corta[1]}-${corta[2]}`);
  }
  return salida;
}

/**
 * Los textos de una entrada del corpus, por campo. El identificador del que
 * se deriva la ficha no se escribe dos veces: el RPE (`r`) y el RNC (`c`) de
 * un proveedor y el código (`r`) de un proceso se buscan como texto auxiliar.
 */
export function textosDe(
  d: { ti: string; x?: string; o?: number; c?: string; r?: string },
  origenes: string[],
): [string, string, string] {
  const x = [d.x, d.c, d.r].filter(Boolean).join(" ");
  return [d.ti, x, d.o === undefined ? "" : origenes[d.o]];
}

/**
 * El detalle (`d`) y el texto auxiliar (`x`) que se repiten viajan una vez en
 * `frases` y la entrada lleva su índice (`scripts/build-busqueda.py`). Esto
 * los devuelve a su texto, en el sitio: se llama una vez, al leer el corpus.
 */
export function resolverFrases(c: { frases?: string[]; docs: { d?: string | number; x?: string | number }[] }): void {
  const frases = c.frases;
  if (!frases?.length) return;
  for (const d of c.docs) {
    if (typeof d.d === "number") d.d = frases[d.d];
    if (typeof d.x === "number") d.x = frases[d.x];
  }
}

/**
 * La etiqueta que ata un índice a su corpus: la huella que
 * `scripts/build-busqueda.py` calcula sobre las entradas, su fecha y
 * cuántas son. Si el corpus cambia y el índice no se regenera, no coinciden
 * y el gate (`verificar.sh`) no deja pasar el cambio: el servidor lee solo
 * el índice, y serviría el corpus de antes.
 */
export function etiquetaCorpus(c: { generado: string; huella?: string; docs: unknown[] }): string {
  return `${c.generado}|${c.huella ?? "sin-huella"}|${c.docs.length}`;
}

/* ------------------------------------------------------------- el índice */

/** El índice invertido, listo para consultar. */
export interface IndicePalabras {
  etiqueta: string;
  /** Términos (raíces) en orden lexicográfico. */
  terminos: string[];
  /** Por término `k`, sus apariciones son `[inicio[k], inicio[k + 1])`. */
  inicio: Uint32Array;
  /** Por aparición: la entrada del corpus. */
  entrada: Uint32Array;
  /** Por aparición: campo (dos bits altos) y frecuencia (seis bajos, tope 63). */
  campoFrecuencia: Uint8Array;
  /** Por entrada y campo (`i * 3 + campo`): cuántas raíces lleva. */
  largo: Uint16Array;
  /** Largo medio de cada campo. */
  medio: [number, number, number];
}

/** Construye el índice en memoria a partir del corpus. */
export function construirIndice(
  docs: { ti: string; x?: string; o?: number; c?: string; r?: string }[],
  origenes: string[],
  etiqueta: string,
): IndicePalabras {
  const porTermino = new Map<string, number[]>();
  const largo = new Uint16Array(docs.length * 3);
  docs.forEach((d, i) => {
    textosDe(d, origenes).forEach((texto, campo) => {
      const raices = raicesParaIndice(texto);
      largo[i * 3 + campo] = Math.min(raices.length, 65535);
      const cuenta = new Map<string, number>();
      for (const r of raices) cuenta.set(r, (cuenta.get(r) ?? 0) + 1);
      for (const [r, n] of cuenta) {
        let lista = porTermino.get(r);
        if (!lista) porTermino.set(r, (lista = []));
        lista.push(i, (campo << 6) | Math.min(n, 63));
      }
    });
  });
  const terminos = [...porTermino.keys()].sort();
  let total = 0;
  for (const t of terminos) total += porTermino.get(t)!.length / 2;
  const inicio = new Uint32Array(terminos.length + 1);
  const entrada = new Uint32Array(total);
  const campoFrecuencia = new Uint8Array(total);
  let k = 0;
  terminos.forEach((t, n) => {
    inicio[n] = k;
    const lista = porTermino.get(t)!;
    for (let j = 0; j < lista.length; j += 2) {
      entrada[k] = lista[j];
      campoFrecuencia[k] = lista[j + 1];
      k++;
    }
  });
  inicio[terminos.length] = k;
  return { etiqueta, terminos, inicio, entrada, campoFrecuencia, largo, medio: medios(largo) };
}

function medios(largo: Uint16Array): [number, number, number] {
  const suma = [0, 0, 0];
  for (let i = 0; i < largo.length; i++) suma[i % 3] += largo[i];
  const n = Math.max(1, largo.length / 3);
  return [suma[0] / n || 1, suma[1] / n || 1, suma[2] / n || 1];
}

/* ------------------------------------------------- el corpus por columnas */

/**
 * Las columnas del corpus: un campo de las entradas que escribe
 * `scripts/build-busqueda.py`, cada uno en su tabla. Las de texto se guardan
 * como diccionario —cada valor distinto una vez y, por entrada, su número—:
 * «Compra menor al umbral · Adjudicado» se repite en 40 mil procesos, y
 * quien publica, en miles. `o`, que en el corpus es el número de su origen,
 * aquí es ya su nombre. Las de número llevan su aridad: los años de un
 * proveedor son dos; el sueldo de un cargo, tres.
 */
export const COLUMNAS_TEXTO = ["t", "ti", "x", "d", "o", "h", "f", "r", "c"] as const;
export const COLUMNAS_NUMERO = { v: 1, n: 1, m: 1, p: 1, e: 1, k: 1, a: 2, s: 3 } as const;
export type CampoTexto = (typeof COLUMNAS_TEXTO)[number];
export type CampoNumero = keyof typeof COLUMNAS_NUMERO;

/** El corpus como lo escribe `scripts/build-busqueda.py`, con sus frases ya resueltas. */
export interface CorpusJson {
  generado: string;
  huella?: string;
  instantaneas: Record<string, string>;
  dimensiones: number;
  piezas: number;
  vectorizados?: number;
  origenes: string[];
  docs: Record<string, unknown>[];
}

type Tipo = "u8" | "u16" | "u32" | "f64";
type Tabla = Uint8Array | Uint16Array | Uint32Array | Float64Array;
/** «No hay» en una columna: el máximo de su entero, o NaN. */
const AUSENTE: Record<Tipo, number> = { u8: 0xff, u16: 0xffff, u32: 0xffffffff, f64: NaN };
const BYTES: Record<Tipo, number> = { u8: 1, u16: 2, u32: 4, f64: 8 };

/** El entero sin signo más chico que guarda de 0 a `tope` y deja libre su máximo para «no hay». */
function enteroPara(tope: number): Tipo {
  if (tope >= 0xffffffff) throw new Error(`${tope} no cabe en una columna de enteros`);
  return tope < 0xff ? "u8" : tope < 0xffff ? "u16" : "u32";
}

function crearTabla(tipo: Tipo, n: number): Tabla {
  return tipo === "u8" ? new Uint8Array(n) : tipo === "u16" ? new Uint16Array(n) : tipo === "u32" ? new Uint32Array(n) : new Float64Array(n);
}

function vistaTabla(tipo: Tipo, buffer: ArrayBufferLike, desde: number, n: number): Tabla {
  return tipo === "u8"
    ? new Uint8Array(buffer, desde, n)
    : tipo === "u16"
      ? new Uint16Array(buffer, desde, n)
      : tipo === "u32"
        ? new Uint32Array(buffer, desde, n)
        : new Float64Array(buffer, desde, n);
}

/** Una sección del archivo: su nombre, su tipo y sus valores. */
type Seccion = [nombre: string, tipo: Tipo, valores: Tabla];

/**
 * Las columnas de un corpus. Lanza si una entrada trae un campo que no tiene
 * columna o un valor que no es de la suya: perderlo en silencio sería
 * servir un corpus distinto del que se construyó.
 */
function columnasDe(corpus: CorpusJson): Seccion[] {
  const { docs, origenes } = corpus;
  const n = docs.length;
  const conocidos = new Set<string>([...COLUMNAS_TEXTO, ...Object.keys(COLUMNAS_NUMERO)]);
  docs.forEach((d, i) => {
    for (const k of Object.keys(d)) if (!conocidos.has(k)) throw new Error(`el campo «${k}» del corpus no tiene columna`);
    // Toda entrada dice qué es y cómo se llama: sin ellos, el servidor la pintaría vacía.
    if (typeof d.t !== "string" || typeof d.ti !== "string" || !d.ti) throw new Error(`a la entrada ${i} le falta su tipo o su título`);
  });
  const enc = new TextEncoder();
  const secciones: Seccion[] = [];
  for (const campo of COLUMNAS_TEXTO) {
    const valores: string[] = [];
    const numero = new Map<string, number>();
    const cual = new Array<number>(n).fill(-1);
    docs.forEach((d, i) => {
      let v = d[campo];
      if (v === undefined) return;
      if (campo === "o") {
        if (typeof v !== "number" || origenes[v] === undefined) throw new Error(`la entrada ${i} nombra un origen que no existe (${String(v)})`);
        v = origenes[v];
      }
      if (typeof v !== "string") throw new Error(`«${campo}» de la entrada ${i} no es texto`);
      let k = numero.get(v);
      if (k === undefined) numero.set(v, (k = valores.push(v) - 1));
      cual[i] = k;
    });
    const bytes = valores.map((v) => enc.encode(v));
    const bordes = new Uint32Array(valores.length + 1);
    bytes.forEach((b, k) => (bordes[k + 1] = bordes[k] + b.length));
    const texto = new Uint8Array(bordes[valores.length]);
    bytes.forEach((b, k) => texto.set(b, bordes[k]));
    const tipo = enteroPara(valores.length - 1);
    const indices = crearTabla(tipo, n);
    cual.forEach((k, i) => (indices[i] = k < 0 ? AUSENTE[tipo] : k));
    secciones.push([`${campo}.texto`, "u8", texto], [`${campo}.bordes`, "u32", bordes], [`${campo}.cual`, tipo, indices]);
  }
  for (const [campo, aridad] of Object.entries(COLUMNAS_NUMERO)) {
    const plano = new Array<number | undefined>(n * aridad).fill(undefined);
    let entero = true;
    let tope = 0;
    docs.forEach((d, i) => {
      const v = d[campo];
      if (v === undefined) return;
      const cifras = aridad === 1 ? [v] : v;
      if (!Array.isArray(cifras) || cifras.length !== aridad || !cifras.every((x) => typeof x === "number" && Number.isFinite(x))) {
        throw new Error(`«${campo}» de la entrada ${i} no son ${aridad} números`);
      }
      cifras.forEach((x: number, j) => {
        plano[i * aridad + j] = x;
        if (Number.isInteger(x) && x >= 0) tope = Math.max(tope, x);
        else entero = false;
      });
    });
    const tipo = entero && tope < 0xffffffff ? enteroPara(tope) : "f64";
    const tabla = crearTabla(tipo, n * aridad).fill(AUSENTE[tipo]);
    plano.forEach((x, j) => {
      if (x !== undefined) tabla[j] = x;
    });
    secciones.push([campo, tipo, tabla]);
  }
  return secciones;
}

interface Cabecera {
  etiqueta: string;
  /** El sha256 de `vectores.bin` con que se construyó: ata el índice a sus vectores. */
  vectores: string;
  generado: string;
  instantaneas: Record<string, string>;
  dimensiones: number;
  piezas: number;
  vectorizados: number;
  entradas: number;
  secciones: [nombre: string, tipo: Tipo, largo: number][];
}

interface ColumnaTexto {
  bytes: Uint8Array;
  bordes: Uint32Array;
  cual: Tabla;
  ausente: number;
  /** Los valores ya descodificados, por su número; se crea al primer uso. */
  hechos: (string | undefined)[] | null;
}

interface ColumnaNumero {
  valores: Tabla;
  aridad: number;
  ausente: number;
}

/**
 * El corpus por columnas: lo que el servidor sabe de cada entrada. Un texto
 * se descodifica la primera vez que se pide y se guarda; los números son
 * vistas sobre el búfer del archivo.
 */
export class Columnas {
  readonly entradas: number;
  /** El sha256 de los vectores con que se construyó el índice. */
  readonly huellaVectores: string;
  readonly generado: string;
  readonly instantaneas: Record<string, string>;
  readonly dimensiones: number;
  readonly piezas: number;
  /** Las primeras `vectorizados` entradas llevan vector; las demás, no. */
  readonly vectorizados: number;
  private readonly textos: Record<string, ColumnaTexto> = {};
  private readonly numeros: Record<string, ColumnaNumero> = {};
  private readonly dec = new TextDecoder();

  constructor(cab: Cabecera, tablas: Map<string, [Tipo, Tabla]>) {
    this.entradas = cab.entradas;
    this.huellaVectores = cab.vectores;
    this.generado = cab.generado;
    this.instantaneas = cab.instantaneas;
    this.dimensiones = cab.dimensiones;
    this.piezas = cab.piezas;
    this.vectorizados = cab.vectorizados;
    const tomar = (nombre: string, largo: number): [Tipo, Tabla] => {
      const t = tablas.get(nombre);
      if (!t) throw new Error(`al índice le falta la columna «${nombre}»`);
      if (largo >= 0 && t[1].length !== largo) throw new Error(`la columna «${nombre}» no tiene una fila por entrada`);
      return t;
    };
    for (const campo of COLUMNAS_TEXTO) {
      const [tipo, cual] = tomar(`${campo}.cual`, cab.entradas);
      this.textos[campo] = {
        bytes: tomar(`${campo}.texto`, -1)[1] as Uint8Array,
        bordes: tomar(`${campo}.bordes`, -1)[1] as Uint32Array,
        cual,
        ausente: AUSENTE[tipo],
        hechos: null,
      };
    }
    for (const [campo, aridad] of Object.entries(COLUMNAS_NUMERO)) {
      const [tipo, valores] = tomar(campo, cab.entradas * aridad);
      this.numeros[campo] = { valores, aridad, ausente: AUSENTE[tipo] };
    }
  }

  /** El texto de un campo de la entrada `i`, o `undefined` si no lo lleva. */
  texto(campo: CampoTexto, i: number): string | undefined {
    const c = this.textos[campo];
    const k = c.cual[i];
    if (k === c.ausente) return undefined;
    const hechos = (c.hechos ??= new Array<string | undefined>(c.bordes.length - 1).fill(undefined));
    return (hechos[k] ??= this.dec.decode(c.bytes.subarray(c.bordes[k], c.bordes[k + 1])));
  }

  /** La primera cifra de un campo de número de la entrada `i`, o `undefined`. */
  numero(campo: CampoNumero, i: number): number | undefined {
    const c = this.numeros[campo];
    const x = c.valores[i * c.aridad];
    return x === c.ausente || Number.isNaN(x) ? undefined : x;
  }

  /** Todas las cifras de un campo (los años de un proveedor), o `undefined`. */
  cifras(campo: CampoNumero, i: number): number[] | undefined {
    const c = this.numeros[campo];
    const desde = i * c.aridad;
    const x = c.valores[desde];
    return x === c.ausente || Number.isNaN(x) ? undefined : Array.from(c.valores.subarray(desde, desde + c.aridad));
  }

  /** El campo de todas las entradas, de una vez: el tipo, que cada barrido mira. */
  columna(campo: CampoTexto): (string | undefined)[] {
    const salida = new Array<string | undefined>(this.entradas);
    for (let i = 0; i < this.entradas; i++) salida[i] = this.texto(campo, i);
    return salida;
  }

  /**
   * Las entradas cuyo campo es exactamente `valor`, en su orden. Compara
   * bytes sin descodificar nada: es una lectura por dirección, no una
   * búsqueda.
   */
  donde(campo: CampoTexto, valor: string): number[] {
    const c = this.textos[campo];
    const buscado = new TextEncoder().encode(valor);
    let k = -1;
    for (let j = 0; j + 1 < c.bordes.length && k < 0; j++) {
      const desde = c.bordes[j];
      if (c.bordes[j + 1] - desde !== buscado.length) continue;
      let igual = true;
      for (let b = 0; b < buscado.length && igual; b++) igual = c.bytes[desde + b] === buscado[b];
      if (igual) k = j;
    }
    const salida: number[] = [];
    if (k >= 0) for (let i = 0; i < c.cual.length; i++) if (c.cual[i] === k) salida.push(i);
    return salida;
  }
}

/* -------------------------------------------------------------- el archivo */

/*
  `indice.bin`: «SIB2», un u32 con el largo de la cabecera JSON, la cabecera
  (etiqueta, la huella de los vectores, lo que el corpus dice de sí y cada
  sección con su tipo y su largo, en orden) y, alineadas a ocho bytes, las
  secciones: los términos
  unidos por «\n», las tablas del índice (`inicio`, `entrada`,
  `campoFrecuencia`, `largo`) y las columnas del corpus. Los enteros, en el
  orden de bytes de la máquina (little-endian en x86 y ARM).
*/
const MAGIA = "SIB2";

const alinear = (n: number) => Math.ceil(n / 8) * 8;

/**
 * El archivo del índice: el índice por palabra de `ix`, las columnas de
 * `corpus` y la huella (sha256) de los vectores que van con ellas.
 */
export function serializarIndice(ix: IndicePalabras, corpus: CorpusJson, huellaVectores: string): Uint8Array {
  if (ix.largo.length !== corpus.docs.length * 3) throw new Error("el índice no es de este corpus");
  const enc = new TextEncoder();
  const secciones: Seccion[] = [
    ["terminos", "u8", enc.encode(ix.terminos.join("\n"))],
    ["inicio", "u32", ix.inicio],
    ["entrada", "u32", ix.entrada],
    ["campoFrecuencia", "u8", ix.campoFrecuencia],
    ["largo", "u16", ix.largo],
    ...columnasDe(corpus),
  ];
  const cabecera = enc.encode(
    JSON.stringify({
      etiqueta: ix.etiqueta,
      vectores: huellaVectores,
      generado: corpus.generado,
      instantaneas: corpus.instantaneas,
      dimensiones: corpus.dimensiones,
      piezas: corpus.piezas,
      vectorizados: corpus.vectorizados ?? corpus.docs.length,
      entradas: corpus.docs.length,
      secciones: secciones.map(([nombre, tipo, v]): [string, Tipo, number] => [nombre, tipo, v.length]),
    } satisfies Cabecera),
  );
  let pos = alinear(8 + cabecera.length);
  const posiciones = secciones.map(([, , v]) => {
    const aqui = pos;
    pos = alinear(pos + v.byteLength);
    return aqui;
  });
  const salida = new Uint8Array(pos);
  salida.set(enc.encode(MAGIA), 0);
  new DataView(salida.buffer).setUint32(4, cabecera.length, true);
  salida.set(cabecera, 8);
  secciones.forEach(([, , v], k) => salida.set(new Uint8Array(v.buffer, v.byteOffset, v.byteLength), posiciones[k]));
  return salida;
}

/** Lo que guarda `indice.bin`. */
export interface IndiceGuardado {
  indice: IndicePalabras;
  corpus: Columnas;
}

/**
 * Lee el archivo sin copiar las tablas: son vistas sobre el mismo búfer.
 * Lanza si no es un índice de esta forma.
 */
export function leerIndice(buf: Uint8Array): IndiceGuardado {
  const dec = new TextDecoder();
  if (dec.decode(buf.subarray(0, 4)) !== MAGIA) throw new Error(`no es un índice ${MAGIA}: corre scripts/build-indice-busqueda.mjs`);
  // Una copia alineada: `Float64Array` exige desplazamiento múltiplo de 8, y
  // un `Buffer` de Node puede venir de un fondo compartido desalineado.
  const b = buf.byteOffset % 8 === 0 ? buf : new Uint8Array(buf);
  const largoCabecera = new DataView(b.buffer, b.byteOffset).getUint32(4, true);
  const cab = JSON.parse(dec.decode(b.subarray(8, 8 + largoCabecera))) as Cabecera;
  const tablas = new Map<string, [Tipo, Tabla]>();
  let pos = alinear(8 + largoCabecera);
  for (const [nombre, tipo, largo] of cab.secciones) {
    tablas.set(nombre, [tipo, vistaTabla(tipo, b.buffer, b.byteOffset + pos, largo)]);
    pos = alinear(pos + largo * BYTES[tipo]);
  }
  const tabla = <T extends Tabla>(nombre: string): T => {
    const t = tablas.get(nombre);
    if (!t) throw new Error(`al índice le falta la sección «${nombre}»`);
    return t[1] as T;
  };
  const inicio = tabla<Uint32Array>("inicio");
  const bytesTerminos = tabla<Uint8Array>("terminos");
  const terminos = inicio.length > 1 ? dec.decode(bytesTerminos).split("\n") : [];
  const largo = tabla<Uint16Array>("largo");
  if (largo.length !== cab.entradas * 3) throw new Error("el índice y sus columnas no tienen las mismas entradas");
  return {
    indice: {
      etiqueta: cab.etiqueta,
      terminos,
      inicio,
      entrada: tabla<Uint32Array>("entrada"),
      campoFrecuencia: tabla<Uint8Array>("campoFrecuencia"),
      largo,
      medio: medios(largo),
    },
    corpus: new Columnas(cab, tablas),
  };
}

/* ------------------------------------------------------------- consultas */

/** El primer término que no es menor que `t`. */
function cotaInferior(terminos: string[], t: string): number {
  let lo = 0;
  let hi = terminos.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (terminos[m] < t) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/** ¿Están `a` y `b` a una edición (cambio, alta o baja) o menos? */
function aUnaEdicion(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length > b.length) [a, b] = [b, a];
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  // Mismo largo: sustitución; `b` una más larga: inserción.
  return a.length === b.length ? a.slice(i + 1) === b.slice(i + 1) : a.slice(i) === b.slice(i + 1);
}

/**
 * Los términos que casan con una raíz: exacta, como **prefijo** (la palabra
 * que se está escribiendo) o a una errata de distancia.
 */
export function terminosQueCasan(ix: IndicePalabras, raiz: string, modo: "exacta" | "prefijo" | "errata"): number[] {
  const { terminos } = ix;
  if (modo === "errata") {
    const salida: number[] = [];
    for (let k = 0; k < terminos.length; k++) if (aUnaEdicion(raiz, terminos[k])) salida.push(k);
    return salida;
  }
  const k0 = cotaInferior(terminos, raiz);
  if (modo === "exacta") return terminos[k0] === raiz ? [k0] : [];
  const salida: number[] = [];
  for (let k = k0; k < terminos.length && terminos[k].startsWith(raiz); k++) salida.push(k);
  return salida;
}

/** BM25+ con los parámetros de siempre (los de Orama, que lo precedió). */
const K1 = 1.2;
const B = 0.75;
const D = 0.5;

/**
 * Suma a `puntos` el BM25 de un término en las entradas que `vale` admite.
 * La rareza (idf) se mide por campo, como hacía Orama; de los campos de una
 * entrada cuenta **el mejor**, no la suma: repetir la palabra en el título,
 * en el nombre del archivo y en quién publica («Presupuesto-Formulado-1990»
 * de la Dirección General de Presupuesto) no la hace más pertinente que un
 * documento titulado «Presupuesto».
 */
export function puntuar(
  ix: IndicePalabras,
  k: number,
  vale: (i: number) => boolean,
  puntos: Map<number, number>,
  /** Cuánto vale este término: menos que 1 para una errata. */
  factor = 1,
): void {
  const desde = ix.inicio[k];
  const hasta = ix.inicio[k + 1];
  const n = ix.largo.length / 3;
  const df = [0, 0, 0];
  for (let j = desde; j < hasta; j++) df[ix.campoFrecuencia[j] >> 6]++;
  const idf = df.map((m) => Math.log(1 + (n - m + 0.5) / (m + 0.5)));
  const mejor = new Map<number, number>();
  for (let j = desde; j < hasta; j++) {
    const i = ix.entrada[j];
    if (!vale(i)) continue;
    const campo = ix.campoFrecuencia[j] >> 6;
    const tf = ix.campoFrecuencia[j] & 63;
    const norma = 1 - B + (B * ix.largo[i * 3 + campo]) / ix.medio[campo];
    const s = REFUERZO[campo] * idf[campo] * (D + (tf * (K1 + 1)) / (tf + K1 * norma));
    if (s > (mejor.get(i) ?? 0)) mejor.set(i, s);
  }
  for (const [i, s] of mejor) puntos.set(i, (puntos.get(i) ?? 0) + s * factor);
}

/** Las entradas en que aparece alguno de los términos. */
export function entradasDe(ix: IndicePalabras, ks: number[], salida: Set<number> = new Set()): Set<number> {
  for (const k of ks) for (let j = ix.inicio[k]; j < ix.inicio[k + 1]; j++) salida.add(ix.entrada[j]);
  return salida;
}
