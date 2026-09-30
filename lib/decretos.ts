import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { enlace } from "@/lib/grafo";
import { materiaDeDecreto, type Materia } from "@/lib/materias-decreto";

/**
 * El registro de decretos del Poder Ejecutivo: los ~78,800 que publica la
 * Consultoría Jurídica, desde 1844, con su firmante. Es la instantánea
 * `public/data/decretos/` que escribe `scripts/build-decretos.py` (una sola
 * lectura del buscador público, docs/AUDITORIA.md §4.1), partida por año.
 *
 * Es el nodo «decreto» del grafo:
 *  · la lista de los decretos que firmó cada Presidente
 *    (`/funcionarios/[slug]/decretos`);
 *  · la ficha de cualquier decreto numerado «NNN-AA» aunque la Consultoría
 *    desafíe al egreso de Vercel (`resolverNorma` cae aquí);
 *  · la arista «lo firma» de la ficha de un decreto y del grafo semántico.
 *
 * Dos cosas del origen que la interfaz dice donde tocan:
 *  · **Errores de captura.** Hay filas fechadas fuera de los períodos de firma
 *    de su firmante (seis decretos de 2017 atribuidos a quien firmó desde
 *    2020) y fechas que no casan con el año del número («497-25» fechado el
 *    1-1-1900). Se marcan (`aviso`), no se corrigen.
 *  · **Fe de errata.** La Consultoría registra la republicación de un decreto
 *    corregido como otra fila con el mismo número: se lista, y la ficha del
 *    número es la del decreto, no la de su errata.
 *
 * Solo número, fecha, título, documento, etiqueta de institución y firmante:
 * la cédula y los demás campos de persona del buscador no llegan ni a la
 * caché del build. Módulo de servidor (`node:fs`), memoizado por instancia.
 */

export const CONSULTORIA_PDF = "https://www.consultoria.gov.do/api/document/";

const DIR = join(process.cwd(), "public", "data", "decretos");

/** `[numero, fecha, titulo, docId, institucion, firmante, aviso]`, como lo escribe el build. */
type FilaCruda = [
  string | null,
  string | null,
  string,
  number | null,
  number | null,
  number | null,
  AvisoDecreto | null,
];

/**
 * `fuera`: la fecha cae fuera de los períodos de firma de su firmante (error
 * de captura probable). `fecha`: la fecha no casa con el año del número.
 */
export type AvisoDecreto = "fuera" | "fecha";

/** Cada aviso en llano: lo dicen igual la lista de decretos firmados y el servidor MCP (`lib/mcp.ts`). */
export const AVISO_DECRETO: Record<AvisoDecreto, { etiqueta: string; llano: string }> = {
  fuera: {
    etiqueta: "Fecha fuera de su período",
    llano:
      "El registro lo atribuye a esta firma, pero su fecha cae fuera de sus períodos de firma: es un error de captura probable del origen.",
  },
  fecha: {
    etiqueta: "Fecha dudosa",
    llano: "La fecha que da el origen no casa con el año de su número.",
  },
};

export interface Firmante {
  /** La firma tal como la escribe la Consultoría: «LUIS ABINADER». */
  clave: string;
  n: number;
  desde: string;
  hasta: string;
  /** Los períodos de firma que cuentan (tramos sin huecos de más de un año). */
  tramos: [string, string][];
  /** Los años del registro donde tiene filas. */
  anios: number[];
}

export interface IndiceDecretos {
  generado: string;
  fuente: { url: string; total: number };
  anios: Record<string, number>;
  sinFecha: number;
  avisos: Record<AvisoDecreto, number>;
  firmantes: Firmante[];
  instituciones: string[];
}

export interface Decreto {
  numero: string | null;
  /** ISO, o `null` si el origen no la da. */
  fecha: string | null;
  /** El título tal cual (casi siempre en mayúsculas: `desdeMayusculas` al pintar). */
  titulo: string;
  docId: number | null;
  /** La etiqueta `Institucion` de la Consultoría, tal cual. */
  institucion: string | null;
  /** La clave del firmante. */
  firmante: string | null;
  aviso: AvisoDecreto | null;
  /** El archivo del registro donde vive: el año del número, o el de su fecha. */
  anio: number | null;
  /** Es la fila que resuelve la ficha de su número (no una errata ni un repetido). */
  ficha: boolean;
  materia: Materia;
}

let indice: Promise<IndiceDecretos | null> | null = null;
const porAnio = new Map<string, Promise<Decreto[]>>();

/** El índice del registro, o `null` si la instantánea no está. */
export function indiceDecretos(): Promise<IndiceDecretos | null> {
  indice ??= readFile(join(DIR, "indice.json"), "utf8")
    .then((t) => {
      const d = JSON.parse(t) as IndiceDecretos;
      if (!d.generado || !Array.isArray(d.firmantes)) throw new Error("indice.json sin firmantes");
      return d;
    })
    .catch((err) => {
      console.error("[decretos] índice:", err);
      indice = null; // un fallo no se queda pegado en la instancia
      return null;
    });
  return indice;
}

// «0-00» no es un número: el origen lo pone cuando no tiene uno (la regla del build).
const NUMERO_ANIO = /^(?!0+-)\d{1,4}-(\d{2})$/;
const ERRATA = /^FE DE ERRATA/i;

/**
 * El año del archivo donde vive un número «NNN-AA»: 20AA si ya llegó, si no
 * 19AA —la regla de `anio_del_numero` en el build—. `null` si el número no
 * lleva año.
 */
export function anioDelNumero(numero: string, esteAnio: number): number | null {
  const m = NUMERO_ANIO.exec(numero);
  if (!m) return null;
  const aa = Number(m[1]);
  return 2000 + aa <= esteAnio ? 2000 + aa : 1900 + aa;
}

/** Las filas de un año del registro (o de `sin-fecha`), memoizadas. */
export function decretosDelAnio(anio: number | "sin-fecha"): Promise<Decreto[]> {
  const clave = String(anio);
  if (clave !== "sin-fecha" && !/^\d{4}$/.test(clave)) return Promise.resolve([]);
  let p = porAnio.get(clave);
  if (!p) {
    p = Promise.all([indiceDecretos(), readFile(join(DIR, `${clave}.json`), "utf8")])
      .then(([ind, t]) => {
        if (!ind) return [];
        const { filas } = JSON.parse(t) as { filas: FilaCruda[] };
        const vistos = new Set<string>();
        const decretos = filas.map(([numero, fecha, titulo, docId, inst, firmante, aviso]) => ({
          numero,
          fecha,
          titulo,
          docId,
          institucion: inst != null ? (ind.instituciones[inst] ?? null) : null,
          firmante: firmante != null ? (ind.firmantes[firmante]?.clave ?? null) : null,
          aviso,
          anio: typeof anio === "number" ? anio : null,
          ficha: false,
          materia: materiaDeDecreto(titulo, inst != null ? ind.instituciones[inst] : null),
        }));
        // La ficha de un número es, por orden, su primera fila limpia (ni errata
        // ni con aviso: «199-17» tiene una fila de Medina y otra mal atribuida),
        // si no la primera que no es errata, y si todas lo son, la primera. Las
        // filas vienen de la más reciente a la más vieja.
        const pasadas: ((d: Decreto) => boolean)[] = [
          (d) => !ERRATA.test(d.titulo) && !d.aviso,
          (d) => !ERRATA.test(d.titulo),
          () => true,
        ];
        for (const vale of pasadas) {
          for (const d of decretos) {
            if (!d.numero || !NUMERO_ANIO.test(d.numero) || vistos.has(d.numero) || !vale(d)) continue;
            vistos.add(d.numero);
            d.ficha = true;
          }
        }
        return decretos;
      })
      .catch((err) => {
        // Un año sin archivo es un año sin decretos, no un error.
        if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") console.error(`[decretos] ${clave}:`, err);
        porAnio.delete(clave);
        return [];
      });
    porAnio.set(clave, p);
  }
  return p;
}

/** El firmante por su clave. */
export async function firmante(clave: string): Promise<Firmante | null> {
  const ind = await indiceDecretos();
  return ind?.firmantes.find((f) => f.clave === clave) ?? null;
}

/**
 * Todos los decretos que el registro atribuye a una firma, del más reciente al
 * más viejo, con los sin fecha al final.
 */
export async function decretosDeFirmante(clave: string): Promise<Decreto[]> {
  const f = await firmante(clave);
  if (!f) return [];
  const anios = [...f.anios].sort((a, b) => b - a);
  const listas = await Promise.all([...anios.map((a) => decretosDelAnio(a)), decretosDelAnio("sin-fecha")]);
  return listas.flatMap((l) => l.filter((d) => d.firmante === clave));
}

/**
 * El decreto que resuelve un número «NNN-AA» (su ficha), o `null` si el número
 * no lleva año o el registro no lo tiene.
 */
export async function decretoPorNumero(numero: string): Promise<Decreto | null> {
  const ind = await indiceDecretos();
  if (!ind) return null;
  const anio = anioDelNumero(numero.trim(), Number(ind.generado.slice(0, 4)));
  if (anio == null) return null;
  const filas = await decretosDelAnio(anio);
  return filas.find((d) => d.ficha && d.numero === numero.trim()) ?? null;
}

/** Adónde lleva un decreto: su ficha si la tiene, si no su PDF en la Consultoría. */
export function hrefDecreto(d: Pick<Decreto, "numero" | "ficha" | "docId">): string | null {
  if (d.ficha && d.numero) {
    const ficha = enlace.norma("decreto", d.numero);
    if (ficha) return ficha;
  }
  return d.docId != null ? `${CONSULTORIA_PDF}${d.docId}` : null;
}

/** ¿Está la fecha dentro de alguno de los tramos de firma? */
export function enTramos(fecha: string, tramos: [string, string][]): boolean {
  return tramos.some(([desde, hasta]) => desde <= fecha && fecha <= hasta);
}
