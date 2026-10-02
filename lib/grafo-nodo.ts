import { SITIO } from "@/lib/sitio";
import { enlace, rutaDeNodo, type NodoRdf, type TipoNodoRdf } from "@/lib/grafo";
import { fecha, iri, lit, t, type Termino, type Triple } from "@/lib/rdf";
import { soloCifras } from "@/lib/padron";
import type { Empresa } from "@/lib/empresas";
import type { OrigenCargo } from "@/lib/funcionarios";

/**
 * Lo que es un nodo del grafo compilado (docs/INFRAESTRUCTURA.md §7), sin leer
 * nada: su IRI, su clave en el compilado, el fragmento donde vive y cómo se
 * codifican sus triples. Lo comparten el compilador
 * (`scripts/build-grafo.mjs`), que escribe `datos/grafo/`, y los dos lectores
 * del servidor: `lib/grafo-compilado.ts` (la descripción entera) y
 * `lib/grafo-ld.ts` (el schema.org de cada ficha).
 *
 * Módulo puro: ni `fs` ni red.
 */

/** El IRI de la cosa que describe una ficha. */
export function iriDe(n: NodoRdf): string {
  return `${SITIO}${rutaDeNodo(n)}#id`;
}

/** El resultado de describir un nodo: sus triples y cómo se llama. */
export interface Descripcion {
  triples: Triple[];
  /** De dónde sale cada triple: la clave de su grafo con nombre, en el mismo orden (`ClaveGrafo`). */
  grafos?: ClaveGrafo[];
  titulo: string;
  /** Lo que la descripción deja fuera y lo dice: «Se describen 200 de sus 312 cargos vigentes». */
  nota?: string;
}

/**
 * Los grafos con nombre (docs/INFRAESTRUCTURA.md §7): cada triple sale de
 * una instantánea de una fuente, o de una regla de Socrático que la deriva de
 * otras, y lo dice. Los de fuente se nombran por su corte
 * (`…/fuente/padron/2026-09-19`); los derivados, por la regla. Qué es cada
 * uno, su fuente y su corte: `GRAFOS` en `lib/grafo-constructores.ts`, que
 * el compilador guarda en `datos/grafo/meta.json`.
 */
export type ClaveGrafo =
  | "plataforma"
  | "instituciones"
  | `cargos-${OrigenCargo}`
  | "decretos"
  | "declaraciones"
  | "banca"
  | "padron"
  | "proveedores"
  | "contratos"
  | "medidas"
  | "ofac"
  | "wikidata"
  | "provincias"
  | "personas"
  | "pep"
  | "vigente"
  | "identidad"
  | "firma"
  | "materia";

/** Lo que afirma una descripción mientras se arma: cada triple con el grafo de donde sale. */
export class Afirmaciones {
  readonly triples: Triple[] = [];
  readonly grafos: ClaveGrafo[] = [];
  de(grafo: ClaveGrafo, ...ts: Triple[]): void {
    for (const x of ts) {
      this.triples.push(x);
      this.grafos.push(grafo);
    }
  }
}

/** El nombre de un decreto para `rdfs:label`. */
export function nombreDecreto(numero: string | null): string {
  return numero ? `Decreto ${numero}` : "Decreto sin número";
}

/** La versión del formato de `datos/grafo/`. Si cambia, cambia este número y el compilador lo reescribe. */
export const FORMATO_GRAFO = 2;

/**
 * La clave de un nodo en el compilado: el identificador como lo leen los
 * constructores. Una institución es su número (`"05"` es la 5), una empresa
 * su RNC sin guiones, un decreto su número sin espacios. `null` si no puede
 * ser un nodo.
 */
export function claveCompilada(n: NodoRdf): string | null {
  switch (n.tipo) {
    case "institucion": {
      const k = Number(n.id);
      return Number.isInteger(k) && k >= 0 ? String(k) : null;
    }
    case "empresa":
      return soloCifras(n.id);
    case "decreto":
      return n.id.trim();
    default:
      return n.id;
  }
}

/**
 * El fragmento de un tipo donde vive una clave. Los nodos se reparten en
 * orden de clave, como las filas del padrón: `limites` es la primera clave de
 * cada fragmento, y el de una clave es el último que no empieza después de
 * ella. `-1` si va antes del primero (no está). En orden de clave, quien
 * recorre el grafo abre cada fragmento una vez.
 */
export function fragmentoDe(clave: string, limites: readonly string[]): number {
  let lo = 0;
  let hi = limites.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (limites[mid] <= clave) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/** El orden de las claves: el de sus unidades de código, el mismo de `<=`. */
export const compararClaves = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** El nombre del archivo de un fragmento: `007.json.br` (brotli: un 30 % menos que gzip y se lee igual de rápido). */
export const archivoFragmento = (i: number) => `${String(i).padStart(3, "0")}.json.br`;

/** Los tipos de nodo, en el orden en que se compilan. */
export const TIPOS_COMPILADOS: readonly TipoNodoRdf[] = ["provincia", "institucion", "entidad-financiera", "funcionario", "decreto", "empresa"];

/*
  La codificación. Cada fragmento lleva su propia tabla de términos y cada
  nodo, sus cuádruplos como índices (sujeto, predicado y objeto en la tabla
  del fragmento; el grafo, en la lista de `meta.json`), uno tras otro: un IRI
  se escribe una vez por fragmento y no una por triple.

    término  IRI          → "https://…"
             literal      → ["valor"] · ["valor", "es"] · ["valor", 0, "http://…#date"]
             nodo blanco  → { "b": "id" }
*/
export type TerminoCodificado = string | [string] | [string, string] | [string, 0, string] | { b: string };

/** Un fragmento de nodos: su tabla de términos y, por clave, `[título, nota, cuádruplos]`. */
export interface FragmentoNodos {
  terminos: TerminoCodificado[];
  nodos: Record<string, [string, string | null, number[]]>;
}

/**
 * Un fragmento del índice de vecinos (`datos/grafo/vecinos/`), en filas
 * comprimidas (CSR): las aristas de la clave `claves[i]` son las de
 * `aristas[3·inicio[i] … 3·inicio[i+1]]`, cada una `[destino, vía, nombre]`
 * como índices en `cadenas`. El destino es `tipo:id` (`claveNodo`); la vía,
 * la arista sin dirección («Cargo: Ministro de Hacienda»); el nombre, el del
 * destino como lo dice este nodo. Es lo que recorre `camino()` sin decodificar
 * descripciones enteras.
 */
export interface FragmentoVecinos {
  cadenas: string[];
  claves: string[];
  titulos: number[];
  inicio: number[];
  aristas: number[];
}

export function codificarTermino(x: Termino): TerminoCodificado {
  if (x.tipo === "iri") return x.valor;
  if (x.tipo === "blanco") return { b: x.valor };
  if (x.idioma) return [x.valor, x.idioma];
  if (x.datatype) return [x.valor, 0, x.datatype];
  return [x.valor];
}

/** El término, con la misma forma que le dan `iri`, `lit` y `tipado` (`lib/rdf.ts`). */
export function decodificarTermino(c: TerminoCodificado): Termino {
  if (typeof c === "string") return { tipo: "iri", valor: c };
  if (!Array.isArray(c)) return { tipo: "blanco", valor: c.b };
  if (c.length === 1) return { tipo: "literal", valor: c[0] };
  if (c.length === 2) return { tipo: "literal", valor: c[0], idioma: c[1] };
  return { tipo: "literal", valor: c[0], datatype: c[2] };
}

/**
 * Los triples de un nodo a partir de su fragmento ya decodificado. Cada
 * llamada arma sus propios triples (quien los recibe puede añadir); los
 * términos se comparten.
 */
export function triplesDe(indices: number[], terminos: Termino[]): Triple[] {
  const salida: Triple[] = new Array(indices.length / 4);
  for (let i = 0, j = 0; i < indices.length; i += 4, j++) {
    salida[j] = { s: terminos[indices[i]], p: terminos[indices[i + 1]].valor, o: terminos[indices[i + 2]] };
  }
  return salida;
}

/** El grafo de cada triple, en el mismo orden: `claves` es la lista de `meta.json`. */
export function grafosDe(indices: number[], claves: readonly ClaveGrafo[]): ClaveGrafo[] {
  const salida: ClaveGrafo[] = new Array(indices.length / 4);
  for (let i = 3, j = 0; i < indices.length; i += 4, j++) salida[j] = claves[indices[i]];
  return salida;
}

/**
 * Una empresa del padrón que el grafo no liga a nada —ni proveedora, ni con
 * medidas, ni en la lista de la OFAC, ni supervisada—: su descripción sale
 * entera de su fila. Así son unas 410 mil de las 490 mil, y el compilado no
 * las copia: las describe esta plantilla, la misma con que el constructor
 * empieza la de cualquier empresa.
 */
export function describirEmpresaSola(e: Empresa, x = new Afirmaciones()): Descripcion {
  const s = iriDe({ tipo: "empresa", id: e.rnc });
  x.de(
    "padron",
    t(s, "rdf:type", iri("soc:Empresa")),
    t(s, "rdf:type", iri("schema:Organization")),
    t(s, "rdf:type", iri("rov:RegisteredOrganization")),
    t(s, "rdfs:label", lit(e.razonSocial)),
    t(s, "schema:legalName", lit(e.razonSocial)),
    t(s, "do:rnc", lit(e.rnc)),
    t(s, "schema:taxID", lit(e.rnc)),
    t(s, "soc:estado", lit(e.estado, "es")),
  );
  x.de("plataforma", t(s, "foaf:page", iri(`${SITIO}${enlace.empresa(e.rnc)}`)));
  // El inicio de operaciones que declaró a la DGII, no su constitución: no es `schema:foundingDate`.
  if (e.inicio) x.de("padron", t(s, "soc:inicioOperaciones", fecha(e.inicio)));
  if (e.actividad) x.de("padron", t(s, "schema:description", lit(e.actividad, "es")));
  return { triples: x.triples, grafos: x.grafos, titulo: e.razonSocial };
}
