import { compactar, PREFIJOS } from "@/lib/rdf";
import { nodoDeIri } from "@/lib/grafo-rdf";
import { rutaDeNodo, type NodoRdf, type TipoNodoRdf } from "@/lib/grafo";
import { iriDe, type Descripcion } from "@/lib/grafo-nodo";

/**
 * Lo que cada fuente aporta al grafo (docs/INFRAESTRUCTURA.md §7.5): por
 * grafo con nombre, cuántos triples afirma, sobre qué clases, con qué
 * predicados, qué clases liga con cuáles, y un nodo real donde se cruza con
 * otra fuente. Lo calcula el compilador (`scripts/build-grafo.mjs`) sobre los
 * constructores, lo guarda en `datos/grafo/meta.json` (`porFuente`) y, al
 * comprobar, lo recalcula sobre el compilado leído por `describir()`: si
 * difiere, el gate se pone rojo.
 *
 * Cada cuádruple (sujeto, predicado, objeto, grafo) se cuenta una sola vez
 * aunque salga en varias descripciones: la de una institución trae también
 * el cargo de quien la dirige, y hay triples que solo salen en la del objeto
 * («dirige» está en la institución, no en la persona). Se reconoce por una
 * huella de 53 bits (dos FNV-1a de 32) que incluye el idioma y el tipo del
 * literal: con unos nueve millones de cuádruples, la probabilidad de que dos
 * cualesquiera choquen es de n²/2⁵⁴, cerca de una en doscientas, y un choque
 * dejaría un triple sin contar (igual al compilar y al comprobar). Las huellas
 * se reparten en dieciséis conjuntos: uno solo tiene un techo de 2²⁴ entradas
 * en V8. La clase
 * de un sujeto o un objeto es la de su `rdf:type` en la misma descripción; la
 * de un `#id` sin él, la de su tipo de nodo.
 *
 * Módulo puro: no lee archivos.
 */

/** La clase de la ontología de cada tipo de nodo del compilado. */
export const CURIE_DE_TIPO: Record<TipoNodoRdf, string> = {
  funcionario: "soc:Persona",
  institucion: "soc:Institucion",
  "entidad-financiera": "soc:EntidadFinanciera",
  empresa: "soc:Empresa",
  decreto: "soc:Decreto",
  provincia: "soc:Provincia",
  proveedor: "soc:Proveedor",
  proceso: "soc:ProcesoDeContratacion",
  obra: "soc:ProyectoDeInversion",
  ley: "soc:Ley",
  resolucion: "soc:Resolucion",
  iniciativa: "soc:Iniciativa",
  documento: "soc:Documento",
  conjunto: "soc:ConjuntoDeDatos",
  sentencia: "soc:Sentencia",
  votacion: "soc:Votacion",
};

/** Lo que no es una clase: un valor (texto, fecha, número) o un IRI de fuera (Wikidata, un concepto, una página). */
export const RANGO_DATO = "dato";
export const RANGO_FUERA = "fuera";

/** Un nodo donde la fuente se cruza con otra: un triple de cada una. */
export interface CruceFuente {
  ruta: string;
  titulo: string;
  /** La otra fuente (clave de su grafo). */
  otra: string;
  /** [predicado, valor] de esta fuente y de la otra. */
  este: [string, string];
  aquel: [string, string];
}

export interface AporteFuente {
  triples: number;
  /** Nodos distintos (por su sujeto) que la fuente describe. */
  nodos: number;
  /** Triples por clase del sujeto. */
  clases: Record<string, number>;
  /** Triples por predicado. */
  predicados: Record<string, number>;
  /** [clase del sujeto, predicado, clase del objeto o `dato`/`fuera`, triples], de más a menos. */
  aristas: [string, string, string, number][];
  cruce: CruceFuente | null;
}

const RDF_TYPE = `${PREFIJOS.rdf}type`;
/**
 * En qué tipos se busca el cruce que se enseña, en este orden. Nunca un
 * proveedor (puede ser una persona física) ni lo que se titula con el nombre
 * de un particular: decretos, leyes, resoluciones, iniciativas, votaciones,
 * documentos y sentencias designan, pensionan o nombran a las partes (la
 * misma regla del volcado, docs/INFRAESTRUCTURA.md §7.8). Una persona con
 * cargo público sí: su nombre es público por su cargo.
 */
const ORDEN_CRUCE: TipoNodoRdf[] = ["institucion", "entidad-financiera", "obra", "provincia", "empresa", "conjunto", "proceso", "funcionario"];
const RANGO_CRUCE = new Map(ORDEN_CRUCE.map((t, i) => [t, i]));
/** Los grafos que no son una fuente: lo que la plataforma dice de sí (la página de cada nodo). */
const NO_ES_FUENTE = new Set(["plataforma"]);

const corto = (iri: string) => compactar(iri) ?? iri;

/**
 * Dos FNV-1a de 32 bits en un entero de 53: la huella con que se reconoce un
 * cuádruple ya contado. Recorre las partes una tras otra con su separador en
 * medio, sin armar la cadena entera: el mismo número que daría sobre
 * `partes.join(separador)`, sin una cadena nueva por triple.
 */
function huella(partes: readonly string[], separador: number): number {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let k = 0; k < partes.length; k++) {
    if (k > 0) {
      a = Math.imul(a ^ separador, 0x01000193);
      b = Math.imul(b ^ separador, 0x01000193) ^ (b >>> 15);
    }
    const texto = partes[k];
    for (let i = 0; i < texto.length; i++) {
      const c = texto.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193);
      b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 15);
    }
  }
  return (a >>> 0) * 0x200000 + ((b >>> 0) & 0x1fffff);
}

/** El nombre corto de cada IRI de predicado o de clase: son unos cientos, y `compactar` recorre los prefijos. */
const cortos = new Map<string, string>();
const cortoMemo = (iri: string) => {
  let c = cortos.get(iri);
  if (c === undefined) cortos.set(iri, (c = corto(iri)));
  return c;
};

interface Acumulado {
  triples: number;
  nodos: Set<string>;
  clases: Map<string, number>;
  predicados: Map<string, number>;
  aristas: Map<string, number>;
  cruce: (CruceFuente & { rango: number }) | null;
}

export class AportesPorFuente {
  private porGrafo = new Map<string, Acumulado>();
  /** Las huellas ya contadas, en dieciséis conjuntos por sus cuatro bits bajos. */
  private contados = Array.from({ length: 16 }, () => new Set<number>());

  /** Suma los cuádruples de la descripción de `n` que no se habían contado. */
  sumar(n: NodoRdf, d: Descripcion): void {
    if (!d.grafos) return;
    // La clase de cada sujeto y objeto que la descripción tipa.
    const tipoDe = new Map<string, string>();
    for (const t of d.triples) if (t.p === RDF_TYPE && t.o.tipo === "iri" && !tipoDe.has(t.s.valor)) tipoDe.set(t.s.valor, cortoMemo(t.o.valor));
    // La ruta del nodo de cada sujeto: un sujeto se repite en todos sus triples.
    const rutaDe = new Map<string, string | null>();
    const rutaDelSujeto = (valor: string) => {
      let r = rutaDe.get(valor);
      if (r === undefined) {
        const nodo = nodoDeIri(valor);
        rutaDe.set(valor, (r = nodo ? rutaDeNodo(nodo) : null));
      }
      return r;
    };
    const claseVista = new Map<string, string | null>();
    const claseDe = (valor: string): string | null => {
      const ya = tipoDe.get(valor);
      if (ya) return ya;
      let c = claseVista.get(valor);
      if (c === undefined) {
        const nodo = valor.endsWith("#id") ? nodoDeIri(valor) : null;
        claseVista.set(valor, (c = nodo ? CURIE_DE_TIPO[nodo.tipo] : null));
      }
      return c;
    };
    const ruta = rutaDeNodo(n);
    const propioIri = iriDe(n);
    const vistos = new Set<string>();
    const primero = new Map<string, [string, string]>();
    d.triples.forEach((t, i) => {
      const g = d.grafos![i];
      // El cruce se enseña con lo que el nodo dice de sí mismo (su `#id`), no de un cargo suyo: «el mismo registro, dicho por dos».
      if (t.s.tipo === "iri" && t.s.valor === propioIri && t.p !== RDF_TYPE) {
        vistos.add(g);
        if (!primero.has(g)) primero.set(g, [cortoMemo(t.p), t.o.valor.slice(0, 120)]);
      }
      // La misma secuencia que «s \u0001 p \u0001 tipo+valor[\u0002 idioma \u0002 tipo del literal] \u0001 grafo».
      const h =
        t.o.tipo === "literal"
          ? huella([t.s.valor, t.p, `${t.o.tipo}${t.o.valor}\u0002${t.o.idioma ?? ""}\u0002${t.o.datatype ?? ""}`, g], 1)
          : huella([t.s.valor, t.p, t.o.tipo + t.o.valor, g], 1);
      const conjunto = this.contados[h % 16];
      if (conjunto.has(h)) return;
      conjunto.add(h);
      const a = this.acumulado(g);
      a.triples++;
      const dueno = t.s.tipo === "iri" ? rutaDelSujeto(t.s.valor) : null;
      if (dueno) a.nodos.add(dueno);
      const sujeto = claseDe(t.s.valor) ?? RANGO_FUERA;
      const p = cortoMemo(t.p);
      const rango = t.o.tipo === "iri" ? (claseDe(t.o.valor) ?? RANGO_FUERA) : RANGO_DATO;
      sumar(a.clases, sujeto);
      sumar(a.predicados, p);
      sumar(a.aristas, `${sujeto}\u0000${p}\u0000${rango}`);
    });
    // El cruce que se enseña: el primer nodo, del tipo más legible, con triples propios de dos fuentes.
    const rango = RANGO_CRUCE.get(n.tipo);
    if (rango == null) return;
    const fuentes = [...vistos].filter((g) => !NO_ES_FUENTE.has(g));
    if (fuentes.length < 2) return;
    for (const g of fuentes) {
      const a = this.acumulado(g);
      if (a.cruce && a.cruce.rango <= rango) continue;
      const otra = fuentes.find((x) => x !== g)!;
      a.cruce = { ruta, titulo: d.titulo, otra, este: primero.get(g)!, aquel: primero.get(otra)!, rango };
    }
  }

  /** Lo acumulado, en orden estable: lo que guarda `meta.json`. */
  resultado(): Record<string, AporteFuente> {
    const salida: Record<string, AporteFuente> = {};
    for (const g of [...this.porGrafo.keys()].sort()) {
      const a = this.porGrafo.get(g)!;
      const cruce = a.cruce && (({ rango: _rango, ...c }) => c)(a.cruce);
      salida[g] = {
        triples: a.triples,
        nodos: a.nodos.size,
        clases: ordenado(a.clases),
        predicados: ordenado(a.predicados),
        aristas: [...a.aristas.entries()]
          .map(([k, v]) => [...(k.split("\u0000") as [string, string, string]), v] as [string, string, string, number])
          .sort((x, y) => y[3] - x[3] || (x.join() < y.join() ? -1 : 1)),
        cruce,
      };
    }
    return salida;
  }

  private acumulado(g: string): Acumulado {
    let a = this.porGrafo.get(g);
    if (!a) {
      a = { triples: 0, nodos: new Set(), clases: new Map(), predicados: new Map(), aristas: new Map(), cruce: null };
      this.porGrafo.set(g, a);
    }
    return a;
  }
}

function sumar(m: Map<string, number>, k: string) {
  m.set(k, (m.get(k) ?? 0) + 1);
}

function ordenado(m: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)));
}
