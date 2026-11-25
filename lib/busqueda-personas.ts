import { plano } from "@/lib/raiz";

/**
 * Buscar personas de verdad (docs/INFRAESTRUCTURA.md §8.5): por su nombre en
 * cualquier orden, con una errata por palabra, o por lo que es hoy —su cargo,
 * su partido, su provincia: «senador de Santiago», «ministro de Hacienda»,
 * «presidente de la cámara»—. Módulo puro: lo usan `buscarNodos`
 * (`lib/grafo-rdf.ts`, sobre el índice de nombres compilado) y la evaluación.
 *
 * Cada palabra de la consulta tiene que caer en algún sitio: en el nombre
 * (entera, como comienzo de una palabra o con una errata) o en el contexto de
 * hoy (sus cargos vigentes, su partido y su provincia). Pesa más lo que cae en
 * el nombre que lo que cae en el cargo, y la consulta entera dicha como un tramo
 * de su cargo de hoy («senador [por] Santiago») pesa más que una palabra suelta
 * en el nombre; a igual parecido, quien ocupa más y más alto (su `puntaje`).
 */

/** Las palabras que no distinguen a nadie: «de», «la», «por». */
const VACIAS = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "por", "en", "a", "al", "que", "con", "para"]);

/** La JCE nombra el puesto («Alcaldía de Nagua»); quien busca, a la persona («alcalde de Nagua»). */
const PUESTO: Record<string, string> = {
  alcalde: "alcaldia",
  alcaldesa: "alcaldia",
  vicealcalde: "vicealcaldia",
  vicealcaldesa: "vicealcaldia",
  regidor: "regiduria",
  regidora: "regiduria",
};

export function palabras(s: string): string[] {
  return plano(s)
    .trim()
    .split(" ")
    .filter((w) => w.length >= 2 && !VACIAS.has(w));
}

/** Distancia de edición con transposición (Damerau, restringida), cortada en `tope`. */
export function distancia(a: string, b: string, tope = 2): number {
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let min = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      min = Math.min(min, d[i][j]);
    }
    if (min > tope) return tope + 1;
  }
  return d[a.length][b.length];
}

/** Cuántas erratas se le perdonan a una palabra de este largo. */
const erratas = (n: number) => (n >= 8 ? 2 : n >= 4 ? 1 : 0);

/** La palabra sin su género ni su número, desde seis letras: «senadora», «senadores» → «senador». */
const raiz = (w: string) => (w.length >= 6 ? w.replace(/(as|os|es|a|o|s)$/, "") : w);

/** ¿Es la misma palabra, o la misma con otro género o número? */
const misma = (t: string, w: string) => w === t || (t.length >= 6 && w.length >= 6 && raiz(t) === raiz(w));

/**
 * ¿Cómo casa una palabra de la consulta con una lista de palabras? 3 entera, 2 comienzo, 1 errata, 0 no
 * casa. `genero`: en el cargo, «senadora» es «senador»; en un nombre, Antonia no es Antonio.
 */
function casa(t: string, lista: string[], genero = false): number {
  let mejor = 0;
  for (const w of lista) {
    if (w === t || (genero && misma(t, w))) return 3;
    if (t.length >= 3 && w.startsWith(t)) mejor = Math.max(mejor, 2);
    else if (mejor < 1) {
      const e = erratas(Math.min(t.length, w.length));
      // El género y el número del cargo no cuentan como errata: «ministra», «senadores».
      if (e > 0 && distancia(t, w, e) <= e) mejor = 1;
    }
  }
  return mejor;
}

export interface EntradaPersona {
  /** El nombre y sus grafías, en palabras planas. */
  nombre: string[];
  /** La última palabra de su nombre (sin las grafías): el segundo apellido, si tiene dos. */
  ultima: string;
  /** Lo que es hoy (cargos vigentes, partido, provincia), en palabras planas. */
  contexto: string[];
  /** Los mismos, por tramo (un cargo, una provincia, un partido): dónde termina cada uno. */
  tramos: string[][];
  puntaje: number;
}

export interface Parecido {
  puntos: number;
  /** Cada palabra cae en su nombre (entera, como comienzo o con una errata). */
  todasEnNombre: boolean;
  /** Alguna cae en el nombre con una errata. */
  conErrata: boolean;
  /** La consulta entera es una frase de su cargo de hoy («presidente de la camara»). */
  frase: boolean;
}

/** El parecido de una persona con la consulta, o `null` si alguna palabra no cae en ningún sitio. */
export function parecido(consulta: string, e: EntradaPersona): Parecido | null {
  const ts = palabras(consulta).map((t) => PUESTO[t] ?? t);
  if (ts.length === 0) return null;
  let s = 0;
  let enNombre = 0;
  let conErrata = false;
  for (const t of ts) {
    const n = casa(t, e.nombre);
    if (n > 0) {
      s += 2 * n;
      enNombre++;
      conErrata ||= n === 1;
      continue;
    }
    const c = casa(t, e.contexto, true);
    if (c === 0) return null;
    s += c;
  }
  const todasEnNombre = enNombre === ts.length;
  if (todasEnNombre) s += 4;
  // «Juan Medina» es quien lleva Medina de primer apellido: la última palabra tecleada, en su nombre y no al final.
  const ultimaTecleada = ts[ts.length - 1];
  if (todasEnNombre && e.nombre.includes(ultimaTecleada) && e.ultima !== ultimaTecleada) s += 0.5;
  // La frase: las palabras de la consulta, seguidas, en su contexto de hoy («senador [por] santiago»);
  // +1 si el tramo termina ahí («Senador por Santiago», no «… Santiago Rodríguez»).
  const tramo = ts.length > 1 ? mejorTramo(ts, e.tramos) : 0;
  const frase = tramo >= 5;
  s += tramo;
  return { puntos: s + e.puntaje / 100, todasEnNombre, conErrata, frase };
}

/**
 * Lo que vale el tramo más largo de la consulta (palabras seguidas de ella) que está seguido y en orden
 * en un tramo del contexto: la consulta entera, 6 si cierra el tramo y 5 si no; un trozo de dos o más
 * palabras («diputada santiago» de «diputada de Santiago PRM»), 1.5 por palabra; nada, 0.
 */
function mejorTramo(ts: string[], tramos: string[][]): number {
  const igual = (t: string, w: string) => misma(t, w) || (t.length >= 3 && w.startsWith(t));
  let mejor = 0;
  for (const lista of tramos) {
    for (let a = 0; a < ts.length; a++) {
      for (let i = 0; i < lista.length; i++) {
        let k = 0;
        while (a + k < ts.length && i + k < lista.length && igual(ts[a + k], lista[i + k])) k++;
        if (k === ts.length) mejor = Math.max(mejor, i + k === lista.length ? 6 : 5);
        else if (k >= 2) mejor = Math.max(mejor, 1.5 * k);
      }
    }
  }
  return mejor;
}

/** Una entrada desde el índice de nombres: el nombre, sus grafías en plano y el contexto por tramos («a|b|c»). */
export function entradaPersona(nombre: string, grafias: string, contexto: string, puntaje: number): EntradaPersona {
  const tramos = contexto.split("|").map(palabras).filter((t) => t.length > 0);
  const suyo = palabras(nombre);
  return { nombre: palabras(grafias), ultima: suyo[suyo.length - 1] ?? "", contexto: tramos.flat(), tramos, puntaje };
}

/** Los puntos del parecido, o `null`. */
export function puntuar(consulta: string, e: EntradaPersona): number | null {
  return parecido(consulta, e)?.puntos ?? null;
}

/** Las entradas que casan, de la más parecida a la menos. */
export function ordenar<T extends EntradaPersona>(consulta: string, entradas: T[]): ({ entrada: T } & Parecido)[] {
  const salida: ({ entrada: T } & Parecido)[] = [];
  for (const e of entradas) {
    const p = parecido(consulta, e);
    if (p) salida.push({ entrada: e, ...p });
  }
  return salida.sort((a, b) => b.puntos - a.puntos);
}
