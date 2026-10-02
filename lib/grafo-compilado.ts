import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import type { NodoRdf, TipoNodoRdf } from "@/lib/grafo";
import type { Termino } from "@/lib/rdf";
import {
  FORMATO_GRAFO,
  archivoFragmento,
  claveCompilada,
  decodificarTermino,
  fragmentoDe,
  triplesDe,
  type Descripcion,
  type FragmentoNodos,
} from "@/lib/grafo-nodo";

/**
 * El grafo compilado (docs/PLAN-GRAFO.md, F2): la descripción de cada nodo,
 * leída de `datos/grafo/` en vez de armada en cada petición.
 * `scripts/build-grafo.mjs` corre los constructores
 * (`lib/grafo-constructores.ts`) sobre todas las instantáneas, escribe cada
 * nodo en el fragmento que le toca por su clave y, antes de dar el compilado
 * por bueno, lo relee por este módulo y lo compara nodo a nodo con lo que
 * dicen los constructores. El gate lo vuelve a comparar en cada entrega.
 *
 * Leer un nodo es abrir un fragmento (~30 KB en brotli) y decodificar sus
 * términos: una institución en frío en milisegundos, sin abrir las
 * instantáneas de personas, decretos, empresas ni contrataciones.
 *
 * Fuera de `public/`, a propósito: el compilado trae a cada persona con sus
 * cargos y no se sirve como archivo; se lee por consulta, nodo a nodo, como
 * siempre (§6 del plan). Módulo de servidor.
 */

/** Una clase del grafo con cuántos nodos tiene hoy y de qué fuente salen. */
export interface ClaseContada {
  clase: string;
  etiqueta: string;
  n: number;
  fuente: string;
  /** La fecha de la instantánea (ISO), si la tiene. */
  corte: string | null;
}

/** Lo que dice `datos/grafo/meta.json` del compilado. */
export interface MetaGrafo {
  formato: number;
  /** El día en que se compiló (ISO). */
  generado: string;
  /** La fecha a la que se calcula el estado PEP: el corte de las personas, no el reloj. */
  aFecha: string | null;
  /** Por tipo: nodos con registro propio, triples y la primera clave de cada fragmento. */
  tipos: Record<TipoNodoRdf, { nodos: number; triples: number; limites: string[] }>;
  /** Empresas del padrón que no tienen registro: las describe su fila (`describirEmpresaSola`). */
  empresasSolas: number;
  triples: number;
  /** sha256 de los fragmentos: cambia con cualquier cambio del grafo (la clave de caché de los caminos). */
  huella: string;
  inventario: ClaseContada[];
  wikidata: { total: number; generado: string | null; porTipo: Record<string, number> };
}

let metaMemo: Promise<MetaGrafo | null> | null = null;

/** El índice del compilado, o `null` si no está (o es de otro formato). */
export function metaGrafo(): Promise<MetaGrafo | null> {
  metaMemo ??= readFile(join(process.cwd(), "datos", "grafo", "meta.json"), "utf8")
    .then((t) => {
      const m = JSON.parse(t) as MetaGrafo;
      if (m.formato !== FORMATO_GRAFO) throw new Error(`formato ${m.formato}, se esperaba ${FORMATO_GRAFO}`);
      return m;
    })
    .catch((err) => {
      console.error("[grafo-compilado] meta.json:", err);
      metaMemo = null; // un fallo no se queda pegado en la instancia
      return null;
    });
  return metaMemo;
}

interface Fragmento {
  terminos: Termino[];
  nodos: FragmentoNodos["nodos"];
}

/** Fragmentos ya leídos, por instancia; se descarta el más viejo pasado el tope. */
const fragmentos = new Map<string, Promise<Fragmento | null>>();
const MAX_FRAGMENTOS = 128;

function leerFragmento(tipo: TipoNodoRdf, i: number): Promise<Fragmento | null> {
  const k = `${tipo}/${i}`;
  const hecho = fragmentos.get(k);
  if (hecho) {
    fragmentos.delete(k); // el más reciente, al final
    fragmentos.set(k, hecho);
    return hecho;
  }
  const p = readFile(join(process.cwd(), "datos", "grafo", "nodos", tipo, archivoFragmento(i)))
    .then((b) => {
      const f = JSON.parse(brotliDecompressSync(b).toString("utf8")) as FragmentoNodos;
      return { terminos: f.terminos.map(decodificarTermino), nodos: f.nodos };
    })
    .catch((err) => {
      console.error(`[grafo-compilado] ${k}:`, err);
      fragmentos.delete(k);
      return null;
    });
  fragmentos.set(k, p);
  if (fragmentos.size > MAX_FRAGMENTOS) fragmentos.delete(fragmentos.keys().next().value as string);
  return p;
}

/**
 * La descripción compilada de un nodo. `undefined` si el compilado no tiene
 * registro de ese nodo: para todos los tipos quiere decir que no existe,
 * salvo para una empresa, que puede ser de las que describe su fila del
 * padrón. Lanza si el compilado no está: sin él no hay grafo que leer.
 */
export async function leerDescripcion(n: NodoRdf): Promise<Descripcion | undefined> {
  const meta = await metaGrafo();
  if (!meta) throw new Error("el grafo compilado no está (datos/grafo/): node scripts/build-grafo.mjs");
  const clave = claveCompilada(n);
  const i = clave == null ? -1 : fragmentoDe(clave, meta.tipos[n.tipo]?.limites ?? []);
  if (clave == null || i < 0) return undefined;
  const f = await leerFragmento(n.tipo, i);
  if (!f) throw new Error(`no se pudo leer el fragmento de ${n.tipo}:${clave}`);
  const r = f.nodos[clave];
  if (!r) return undefined;
  const [titulo, nota, indices] = r;
  const d: Descripcion = { triples: triplesDe(indices, f.terminos), titulo };
  if (nota != null) d.nota = nota;
  return d;
}
