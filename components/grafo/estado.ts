/**
 * El estado del lienzo en la URL (`nuqs`), en un módulo sin `sigma` ni
 * `graphology`: el banco (`components/explorador/banco.tsx`) lo importa para
 * quitar las claves al salir de la red sin cargar el motor en el JS de `/`.
 * Las claves llevan `l` delante para no chocar con las del banco.
 */
import { createParser, parseAsArrayOf, parseAsJson, parseAsString, parseAsStringLiteral } from "nuqs";
import { TIPOS } from "./familias";

/** El separador de las listas de rutas: una ruta de la plataforma no lo lleva. */
export const SEP = "|";

function fijadosValidos(v: unknown): Record<string, [number, number]> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const salida: Record<string, [number, number]> = {};
  for (const [k, x] of Object.entries(v)) {
    if (k.startsWith("/") && Array.isArray(x) && x.length === 2 && x.every((n) => typeof n === "number" && Number.isFinite(n)))
      salida[k] = [x[0], x[1]];
  }
  return salida;
}

/** Una ventana de años `2015-2020`: dos años de cuatro cifras, el primero no mayor. */
const parseAsPeriodo = createParser<readonly [number, number]>({
  parse: (v) => {
    const m = /^(\d{4})-(\d{4})$/.exec(v);
    if (!m) return null;
    const desde = Number(m[1]);
    const hasta = Number(m[2]);
    return desde <= hasta ? ([desde, hasta] as const) : null;
  },
  serialize: ([desde, hasta]) => `${desde}-${hasta}`,
  eq: (a, b) => a[0] === b[0] && a[1] === b[1],
});

export const ESTADO_LIENZO = {
  /** Las semillas. */
  ls: parseAsArrayOf(parseAsString, SEP),
  /** Los expandidos, en el orden en que se expandieron. */
  lx: parseAsArrayOf(parseAsString, SEP),
  /** Los ocultos. */
  lo: parseAsArrayOf(parseAsString, SEP),
  /** «Solo esta clase»: el tipo que queda. */
  lc: parseAsStringLiteral(TIPOS),
  /** Los fijados: `{ruta: [x, y]}`. */
  lf: parseAsJson(fijadosValidos),
  /** La cámara: `x,y,ratio`. */
  lv: parseAsString,
  /** La procedencia: `fuente` deja solo lo que publica una fuente; sin clave, también lo que deriva una regla. */
  lp: parseAsStringLiteral(["fuente"] as const),
  /** La ventana de años de las aristas fechadas: `2015-2020`; sin clave, todas. */
  lt: parseAsPeriodo,
};

/** Las claves en blanco: salir de la red las quita de la dirección. */
export const SIN_LIENZO = { ls: null, lx: null, lo: null, lc: null, lf: null, lv: null, lp: null, lt: null } as const;
