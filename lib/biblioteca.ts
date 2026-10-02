import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { agujas, contieneTodas, plano, recortar } from "@/lib/raiz";

/**
 * Biblioteca del Estado — un índice de los documentos (PDF, hojas de cálculo,
 * Word) que publican las instituciones en sus sitios WordPress.
 *
 * Mecánica verificada en docs/INFRAESTRUCTURA.md §5.10: el endpoint público de
 * lectura `/wp-json/wp/v2/media`, sin clave y paginado, en 23 instituciones.
 * `scripts/build-documentos.py` lo recorre entero en build —robots primero,
 * un segundo entre peticiones— y deja en `public/data/documentos/`:
 *
 *  - `indice.json` — por institución: cuántos documentos se pudieron leer,
 *    cuántos anunciaba el origen (`X-WP-Total`, que **sobrestima**: nunca se
 *    muestra como cobertura) y si estaba bloqueada;
 *  - `filas.json` — `[título, fecha de subida, tipo, url original, fuente]`.
 *
 * La plataforma **no copia** ningún archivo: enlaza al original. El título es
 * el que puso la institución y la fecha es la de subida al sitio, no la del
 * documento; la página lo dice.
 *
 * Módulo de servidor (`node:fs`), memoizado por instancia.
 */

export type TipoDocumento = "pdf" | "xlsx" | "xls" | "docx" | "doc";

export interface FuenteBiblioteca {
  host: string;
  nombre: string;
  uc: number | null;
  /** ok · bloqueado · robots · error */
  estado: string;
  nota: string;
  anunciados: number;
  paginas: number;
  documentos: number;
}

export interface IndiceBiblioteca {
  generado: string;
  total: number;
  fuentes: FuenteBiblioteca[];
}

export interface Documento {
  titulo: string;
  fecha: string;
  tipo: TipoDocumento;
  url: string;
  host: string;
}

interface Filas {
  generado: string;
  hosts: string[];
  filas: [string, string, TipoDocumento, string, number][];
}

const DIR = join(process.cwd(), "public", "data", "documentos");

let memoIndice: Promise<IndiceBiblioteca | null> | null = null;
let memoFilas: Promise<{ filas: Filas; claves: string[] } | null> | null = null;

export function getIndiceBiblioteca(): Promise<IndiceBiblioteca | null> {
  memoIndice ??= readFile(join(DIR, "indice.json"), "utf8")
    .then((t) => JSON.parse(t) as IndiceBiblioteca)
    .catch((err) => {
      console.error("[biblioteca] indice:", err);
      memoIndice = null;
      return null;
    });
  return memoIndice;
}

function filas() {
  memoFilas ??= readFile(join(DIR, "filas.json"), "utf8")
    .then((t) => {
      const f = JSON.parse(t) as Filas;
      // La clave de búsqueda se calcula una vez por instancia: título y nombre
      // del archivo, sin tildes, con guiones y rayas como espacios.
      const claves = f.filas.map(([titulo, , , url]) =>
        plano(`${titulo} ${decodeURIComponent(url.split("/").pop() ?? "")}`.replace(/[_.]+/g, " ")),
      );
      return { filas: f, claves };
    })
    .catch((err) => {
      console.error("[biblioteca] filas:", err);
      memoFilas = null;
      return null;
    });
  return memoFilas;
}

export const POR_PAGINA = 40;

/**
 * Busca en los títulos. Todas las palabras de `q` deben aparecer, en
 * cualquier orden, sin distinguir tildes y por raíz («memorias» encuentra
 * «Memoria»; `lib/raiz.ts`). Sin `q`, lo más reciente.
 */
export async function buscarDocumentos(opts: {
  q?: string;
  host?: string;
  tipo?: TipoDocumento | "hojas";
  pagina?: number;
}): Promise<{ docs: Documento[]; total: number; pagina: number; paginas: number } | null> {
  const d = await filas();
  if (!d) return null;
  const aguja = opts.q?.trim() ? agujas(recortar(opts.q, 120)) : null;
  const iHost = opts.host ? d.filas.hosts.indexOf(opts.host) : -1;
  const aciertos: number[] = [];
  d.filas.filas.forEach((f, i) => {
    if (iHost >= 0 && f[4] !== iHost) return;
    if (opts.tipo === "hojas" ? !(f[2] === "xlsx" || f[2] === "xls") : opts.tipo && f[2] !== opts.tipo) return;
    if (aguja && !contieneTodas(d.claves[i], aguja)) return;
    aciertos.push(i);
  });
  const paginas = Math.max(1, Math.ceil(aciertos.length / POR_PAGINA));
  const pagina = Math.min(Math.max(1, opts.pagina ?? 1), paginas);
  const docs = aciertos.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA).map((i) => {
    const [titulo, fecha, tipo, url, h] = d.filas.filas[i];
    return { titulo, fecha, tipo, url, host: d.filas.hosts[h] };
  });
  return { docs, total: aciertos.length, pagina, paginas };
}

/** Los documentos más recientes de una institución, para su ficha. */
export async function documentosDeInstitucion(
  uc: number,
  n = 8,
): Promise<{ fuente: FuenteBiblioteca; docs: Documento[]; generado: string } | null> {
  const indice = await getIndiceBiblioteca();
  const fuente = indice?.fuentes.find((f) => f.uc === uc && f.documentos > 0);
  if (!indice || !fuente) return null;
  const r = await buscarDocumentos({ host: fuente.host });
  return r ? { fuente, docs: r.docs.slice(0, n), generado: indice.generado } : null;
}
