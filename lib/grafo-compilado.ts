import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import type { NodoRdf, TipoNodoRdf } from "@/lib/grafo";
import { SITIO } from "@/lib/sitio";
import type { ComprasPublicadas } from "@/lib/tablas-compras";
import { fecha, iri, lit, t, type Termino, type Triple } from "@/lib/rdf";
import {
  FORMATO_GRAFO,
  archivoFragmento,
  claveCompilada,
  decodificarTermino,
  fragmentoDe,
  grafosDe,
  triplesDe,
  type ClaveGrafo,
  type Descripcion,
  type FragmentoNodos,
  type FragmentoVecinos,
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

/** Un grafo con nombre del compilado: de qué fuente y de qué corte, o de qué regla, y su IRI. */
export interface GrafoConNombre {
  clave: ClaveGrafo;
  iri: string;
  etiqueta: string;
  descripcion: string;
  fuentes: string[];
  corte: string | null;
  derivado?: { de: ClaveGrafo[] };
}

/** Lo que dice `datos/grafo/meta.json` del compilado. */
export interface MetaGrafo {
  formato: number;
  /** El día en que se compiló (ISO). */
  generado: string;
  /** La fecha a la que se calcula el estado PEP: el corte de las personas, no el reloj. */
  aFecha: string | null;
  /** Los grafos con nombre, en el orden en que los cita cada cuádruplo. */
  grafos: GrafoConNombre[];
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

const clavesMemo = new WeakMap<MetaGrafo, ClaveGrafo[]>();
const claves = (m: MetaGrafo) => {
  let c = clavesMemo.get(m);
  if (!c) clavesMemo.set(m, (c = m.grafos.map((g) => g.clave)));
  return c;
};

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
  const d: Descripcion = { triples: triplesDe(indices, f.terminos), grafos: grafosDe(indices, claves(meta)), titulo };
  if (nota != null) d.nota = nota;
  return d;
}

/**
 * Lo que se dice de unos grafos con nombre, en PROV-O: qué son, de qué
 * fuente o de qué grafos se derivan y de qué corte. Va en el grafo por
 * omisión de un TriG o unos N-Quads.
 */
export function triplesDeGrafos(grafos: GrafoConNombre[], todos: GrafoConNombre[]): Triple[] {
  const porClave = new Map(todos.map((g) => [g.clave, g]));
  const x: Triple[] = [];
  for (const g of grafos) {
    x.push(t(g.iri, "rdf:type", iri("prov:Entity")), t(g.iri, "rdfs:label", lit(g.etiqueta, "es")), t(g.iri, "dct:description", lit(g.descripcion, "es")));
    if (g.corte) x.push(t(g.iri, "dct:date", fecha(g.corte)));
    for (const u of g.fuentes) x.push(t(g.iri, "prov:wasDerivedFrom", iri(u)));
    if (g.derivado) {
      // Lo afirma una regla de Socrático, no la fuente: lo dice.
      x.push(t(g.iri, "prov:wasAttributedTo", iri(`${SITIO}/`)));
      for (const k of g.derivado.de) {
        const de = porClave.get(k);
        if (de) x.push(t(g.iri, "prov:wasDerivedFrom", iri(de.iri)));
      }
    }
  }
  return x;
}

/* ------------------------------------------------------------ los vecinos */

/** Una arista del índice de vecinos: adónde lleva, por qué y cómo se llama el otro extremo. */
export interface Vecino {
  nodo: NodoRdf;
  via: string;
  nombre: string;
}

const fragmentosVecinos = new Map<string, Promise<{ f: FragmentoVecinos; donde: Map<string, number> } | null>>();

function leerVecinosDe(tipo: TipoNodoRdf, i: number) {
  const k = `${tipo}/${i}`;
  const hecho = fragmentosVecinos.get(k);
  if (hecho) {
    fragmentosVecinos.delete(k);
    fragmentosVecinos.set(k, hecho);
    return hecho;
  }
  const p = readFile(join(process.cwd(), "datos", "grafo", "vecinos", tipo, archivoFragmento(i)))
    .then((b) => {
      const f = JSON.parse(brotliDecompressSync(b).toString("utf8")) as FragmentoVecinos;
      return { f, donde: new Map(f.claves.map((c, j) => [c, j])) };
    })
    .catch((err) => {
      console.error(`[grafo-compilado] vecinos ${k}:`, err);
      fragmentosVecinos.delete(k);
      return null;
    });
  fragmentosVecinos.set(k, p);
  if (fragmentosVecinos.size > MAX_FRAGMENTOS) fragmentosVecinos.delete(fragmentosVecinos.keys().next().value as string);
  return p;
}

/**
 * El nombre de un nodo y sus aristas hacia otros nodos, del índice de
 * vecinos: lo mismo que `relacionesDesdeTriples` saca de su descripción,
 * sin decodificarla. `undefined` si el índice no lo trae (una empresa que
 * describe su fila del padrón: no se liga a nada).
 */
export async function leerVecinos(n: NodoRdf): Promise<{ titulo: string; vecinos: Vecino[] } | undefined> {
  const meta = await metaGrafo();
  if (!meta) throw new Error("el grafo compilado no está (datos/grafo/): node scripts/build-grafo.mjs");
  const clave = claveCompilada(n);
  const i = clave == null ? -1 : fragmentoDe(clave, meta.tipos[n.tipo]?.limites ?? []);
  if (clave == null || i < 0) return undefined;
  const r = await leerVecinosDe(n.tipo, i);
  if (!r) throw new Error(`no se pudo leer el índice de vecinos de ${n.tipo}:${clave}`);
  const j = r.donde.get(clave);
  if (j === undefined) return undefined;
  const { cadenas, aristas, inicio } = r.f;
  const vecinos: Vecino[] = [];
  for (let a = inicio[j] * 3; a < inicio[j + 1] * 3; a += 3) {
    const destino = cadenas[aristas[a]];
    const dos = destino.indexOf(":");
    vecinos.push({ nodo: { tipo: destino.slice(0, dos) as TipoNodoRdf, id: destino.slice(dos + 1) }, via: cadenas[aristas[a + 1]], nombre: cadenas[aristas[a + 2]] });
  }
  return { titulo: cadenas[r.f.titulos[j]], vecinos };
}

/* ----------------------------------------------------- lo publicado */

let comprasMemo: Promise<ComprasPublicadas | null> | null = null;

/**
 * Lo que cada institución publicó en la tabla de procesos de la DGCP en su
 * ventana de doce meses (`publicadoPorInstitucion`), compilado con el grafo:
 * así `fetch` no lee la tabla entera (11 MB) para decir dos cifras.
 */
export function comprasPublicadas(): Promise<ComprasPublicadas | null> {
  comprasMemo ??= readFile(join(process.cwd(), "datos", "grafo", "compras.json"), "utf8")
    .then((t) => JSON.parse(t) as ComprasPublicadas)
    .catch((err) => {
      console.error("[grafo-compilado] compras.json:", err);
      comprasMemo = null;
      return null;
    });
  return comprasMemo;
}
