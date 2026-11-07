import { open, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CambioDeLey, NormaDelDispositivo } from "@/lib/texto-extraccion";
import type { Sentido } from "@/lib/vocabulario-textos";

/**
 * Lo que `scripts/build-textos.mjs` leyó en el texto íntegro de las
 * sentencias, las leyes y los documentos (`public/data/textos/`,
 * docs/INFRAESTRUCTURA.md §5.12). La leen el compilador del grafo
 * (`lib/grafo-constructores.ts`) y nada más: las fichas y el servidor MCP
 * leen el grafo compilado. Si una instantánea falta, el grafo se compila sin
 * ella, como antes de que existiera.
 *
 * Módulo de servidor (`node:fs`), memoizado por instancia.
 */

/** El estado de una fila: `ok` es un texto leído; los demás dicen por qué no. */
export type EstadoTexto = "ok" | "sin-texto" | "sin-archivo" | "no-existe" | "grande" | "formato" | "robots" | "bloqueado" | "error";

export interface FilaTexto {
  e: EstadoTexto;
  /** Páginas (en una hoja de cálculo, hojas). */
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

const DIR = join(process.cwd(), "public", "data", "textos");
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
 * La cabecera de las tres instantáneas, sin leer sus filas: `build-textos.mjs`
 * la escribe sola en el primer renglón. La lee `/fuentes`, que declara la
 * cobertura de cada corpus y los hosts que no respondieron.
 */
export async function resumenesDeTextos(): Promise<Record<"sentencias" | "leyes" | "documentos", ResumenTextos | null>> {
  const uno = async (archivo: string): Promise<ResumenTextos | null> => {
    let f: Awaited<ReturnType<typeof open>> | null = null;
    try {
      f = await open(join(DIR, archivo), "r");
      const { buffer, bytesRead } = await f.read(Buffer.alloc(256 * 1024), 0, 256 * 1024, 0);
      const linea = buffer.subarray(0, bytesRead).toString("utf8").split("\n")[0];
      return JSON.parse(`${linea}}}`) as ResumenTextos;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    } finally {
      await f?.close();
    }
  };
  const [sentencias, leyes, documentos] = await Promise.all([uno("sentencias.json"), uno("leyes.json"), uno("documentos.json")]);
  return { sentencias, leyes, documentos };
}
