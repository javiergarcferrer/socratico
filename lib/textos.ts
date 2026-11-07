import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CambioDeLey, NormaDelDispositivo } from "@/lib/texto-extraccion";
import type { Sentido } from "@/lib/vocabulario-textos";

/**
 * Lo que `scripts/build-textos.mjs` leyó en el texto íntegro de las
 * sentencias, las leyes y los documentos (`datos/textos/`, fuera de
 * `public/`: ninguna página la sirve; docs/INFRAESTRUCTURA.md §5.12). Las
 * filas las lee el compilador del grafo (`lib/grafo-constructores.ts`) y
 * nada más: las fichas y el servidor MCP leen el grafo compilado. `/fuentes`
 * lee solo el resumen (`resumen.json`). Si una instantánea falta, el grafo se
 * compila sin ella, como antes de que existiera.
 *
 * Módulo de servidor (`node:fs`), memoizado por instancia.
 */

/** El estado de una fila: `ok` es un texto leído; los demás dicen por qué no. */
export type EstadoTexto = "ok" | "sin-texto" | "sin-archivo" | "no-existe" | "grande" | "formato" | "ajeno" | "robots" | "bloqueado" | "error";

export interface FilaTexto {
  e: EstadoTexto;
  /** Páginas del archivo (en una hoja de cálculo, hojas), aunque se lean menos. */
  p?: number;
  /** Caracteres del texto leído. */
  c?: number;
  /** Los primeros 16 hexadecimales del sha256 del archivo. */
  h?: string;
  /** Por qué no se leyó, si no se leyó. */
  nota?: string;
}

export interface FilaSentencia extends FilaTexto {
  /** El sentido del fallo, si el texto trae su dispositivo. */
  s?: Sentido;
  /** El dispositivo, sin cédulas, recortado. */
  d?: string;
  /** La página del PDF donde empieza el dispositivo. */
  dp?: number;
  n?: NormaDelDispositivo[];
  /** Las sentencias del TC que nombra el texto y cuántas veces. */
  t?: [string, number][];
  /** La dirección del archivo, que da la ficha del tribunal. */
  u?: string;
}

export interface FilaLey extends FilaTexto {
  n?: CambioDeLey[];
}

export interface FilaDocumento extends FilaTexto {
  /** [tipo, número] de cada norma que nombra. */
  n?: [string, string][];
  /** Códigos de proceso de la DGCP. */
  x?: string[];
  /** Números SNIP. */
  o?: string[];
  /** RNC de nueve cifras. */
  r?: string[];
}

export interface Textos<F extends FilaTexto> {
  generado: string;
  version: number;
  /** Cuántas cosas tiene el corpus en su fuente, se lean o no (en el de sentencias, las de los dos tribunales). */
  total: number;
  /** Lo mismo por corpus: `tc`, `tse`, `leyes`, `documentos`. */
  totales: Record<string, number>;
  /** Lo que respondió cada host en la última corrida que tocó la instantánea. */
  hosts: Record<string, { pedidos: number; estados: Record<string, number>; robots: string | null; bloqueado: string | null }>;
  cuenta: Partial<Record<EstadoTexto, number>>;
  filas: Record<string, F>;
}

const DIR = join(process.cwd(), "datos", "textos");
const memo = new Map<string, Promise<Textos<FilaTexto> | null>>();

function leer<F extends FilaTexto>(archivo: string): Promise<Textos<F> | null> {
  if (!memo.has(archivo)) {
    memo.set(
      archivo,
      readFile(join(DIR, archivo), "utf8")
        .then((t) => JSON.parse(t) as Textos<FilaTexto>)
        .catch((e: NodeJS.ErrnoException) => {
          memo.delete(archivo);
          if (e.code === "ENOENT") return null;
          throw e;
        }),
    );
  }
  return memo.get(archivo)! as Promise<Textos<F> | null>;
}

export const textosDeSentencias = () => leer<FilaSentencia>("sentencias.json");
export const textosDeLeyes = () => leer<FilaLey>("leyes.json");
export const textosDeDocumentos = () => leer<FilaDocumento>("documentos.json");

/** Lo que dice la cabecera de una instantánea de textos: la lectura, cuántas filas hay en cada estado y qué respondió cada host. */
export type ResumenTextos = Pick<Textos<FilaTexto>, "generado" | "hosts" | "cuenta" | "total" | "totales">;

/**
 * Las cabeceras de las tres instantáneas, de `resumen.json` (lo escribe
 * `build-textos.mjs` junto a ellas): la lectura, cuántas hay en cada estado,
 * el total de cada corpus y qué respondió cada host. La lee `/fuentes`, que
 * declara la cobertura y los hosts que no respondieron; el archivo viaja en su
 * función (`outputFileTracingIncludes`), las filas no.
 */
export async function resumenesDeTextos(): Promise<Record<"sentencias" | "leyes" | "documentos", ResumenTextos | null>> {
  try {
    const r = JSON.parse(await readFile(join(DIR, "resumen.json"), "utf8")) as Partial<Record<"sentencias" | "leyes" | "documentos", ResumenTextos>>;
    return { sentencias: r.sentencias ?? null, leyes: r.leyes ?? null, documentos: r.documentos ?? null };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { sentencias: null, leyes: null, documentos: null };
    throw e;
  }
}
