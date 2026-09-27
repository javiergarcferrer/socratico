/**
 * La forma del índice por palabra del buscador, en un solo sitio: la usan
 * `lib/busqueda.ts` (en el servidor, para leerlo) y
 * `scripts/build-indice-busqueda.mjs` (en build, para escribirlo). Si
 * discreparan —otro lematizador, otra lista de palabras vacías, otro corte
 * de palabras—, el índice tendría raíces que la consulta no produce y
 * buscaría en silencio peor. Por eso ninguno de los dos la escribe por su
 * cuenta.
 *
 * Es un índice invertido propio, binario, y no el de Orama que lo precedió:
 * el de Orama se guardaba como JSON (27 MB sin comprimir) y cada arranque en
 * frío pagaba descomprimirlo, `JSON.parse` y reconstruir su árbol —~1,3 s con
 * 68 mil entradas, y crecía con el corpus—. Este se lee con un `readFile` y
 * vistas sobre el mismo búfer: la lista de términos ordenada (búsqueda
 * binaria, prefijos y erratas) y, por término, sus apariciones (entrada,
 * campo, frecuencia), que alimentan el mismo BM25.
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
 * y el servidor construye el índice en memoria.
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

/*
  El archivo: «SIB1», un u32 con el largo de la cabecera JSON, la cabecera
  (etiqueta y cuentas), los términos unidos por «\n», y alineadas a cuatro
  bytes las tablas `inicio`, `entrada`, `campoFrecuencia` y `largo`.
*/
const MAGIA = "SIB1";

const alinear = (n: number) => (n + 3) & ~3;

export function serializarIndice(ix: IndicePalabras): Uint8Array {
  const enc = new TextEncoder();
  const terminos = enc.encode(ix.terminos.join("\n"));
  const cabecera = enc.encode(
    JSON.stringify({
      etiqueta: ix.etiqueta,
      terminos: ix.terminos.length,
      bytesTerminos: terminos.length,
      apariciones: ix.entrada.length,
      entradas: ix.largo.length / 3,
    }),
  );
  const partes: Uint8Array[] = [
    new Uint8Array(ix.inicio.buffer, ix.inicio.byteOffset, ix.inicio.byteLength),
    new Uint8Array(ix.entrada.buffer, ix.entrada.byteOffset, ix.entrada.byteLength),
    ix.campoFrecuencia,
    new Uint8Array(ix.largo.buffer, ix.largo.byteOffset, ix.largo.byteLength),
  ];
  let pos = alinear(8 + cabecera.length + terminos.length);
  const posiciones = partes.map((p) => {
    const aqui = pos;
    pos = alinear(pos + p.length);
    return aqui;
  });
  const salida = new Uint8Array(pos);
  salida.set(enc.encode(MAGIA), 0);
  new DataView(salida.buffer).setUint32(4, cabecera.length, true);
  salida.set(cabecera, 8);
  salida.set(terminos, 8 + cabecera.length);
  partes.forEach((p, n) => salida.set(p, posiciones[n]));
  return salida;
}

/**
 * Lee el archivo sin copiar las tablas: son vistas sobre el mismo búfer.
 * Lanza si no es un índice de esta forma.
 */
export function leerIndice(buf: Uint8Array): IndicePalabras {
  const dec = new TextDecoder();
  if (dec.decode(buf.subarray(0, 4)) !== MAGIA) throw new Error("no es un índice SIB1");
  // Una copia alineada: `Uint32Array` exige desplazamiento múltiplo de 4, y
  // un `Buffer` de Node puede venir de un fondo compartido desalineado.
  const b = buf.byteOffset % 4 === 0 ? buf : new Uint8Array(buf);
  const largoCabecera = new DataView(b.buffer, b.byteOffset).getUint32(4, true);
  const cab = JSON.parse(dec.decode(b.subarray(8, 8 + largoCabecera))) as {
    etiqueta: string;
    terminos: number;
    bytesTerminos: number;
    apariciones: number;
    entradas: number;
  };
  const desde = 8 + largoCabecera;
  const terminos = cab.terminos ? dec.decode(b.subarray(desde, desde + cab.bytesTerminos)).split("\n") : [];
  let pos = alinear(desde + cab.bytesTerminos);
  const tomar = <T>(hacer: (off: number, n: number) => T, n: number, bytes: number): T => {
    const v = hacer(b.byteOffset + pos, n);
    pos = alinear(pos + n * bytes);
    return v;
  };
  const inicio = tomar((o, n) => new Uint32Array(b.buffer, o, n), cab.terminos + 1, 4);
  const entrada = tomar((o, n) => new Uint32Array(b.buffer, o, n), cab.apariciones, 4);
  const campoFrecuencia = tomar((o, n) => new Uint8Array(b.buffer, o, n), cab.apariciones, 1);
  const largo = tomar((o, n) => new Uint16Array(b.buffer, o, n), cab.entradas * 3, 2);
  return { etiqueta: cab.etiqueta, terminos, inicio, entrada, campoFrecuencia, largo, medio: medios(largo) };
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
