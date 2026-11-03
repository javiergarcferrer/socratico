import { W3ID, type Termino } from "@/lib/rdf";
import { CLASES, PROPIEDADES, curie } from "@/lib/ontologia";
import { linaje } from "@/lib/ontologia-esquemas";
import type { Descripcion } from "@/lib/grafo-nodo";

/**
 * La calidad del grafo compilado medida sobre el grafo entero
 * (docs/INFRAESTRUCTURA.md §7.4): el uso de cada propiedad `soc:`/`do:`
 * (cuántos triples y entre qué clases), la completitud de cada clase (qué
 * parte de sus instancias tiene cada propiedad de su forma SHACL) y las
 * violaciones de cardinalidad de esas formas (`sh:minCount`, `sh:maxCount`).
 *
 * El grafo entero es la unión de las descripciones: un triple que dicen dos
 * descripciones (una contratación, desde la institución y desde el
 * proveedor; el nombre de un vecino) es uno. Lo mide el compilador
 * (`scripts/build-grafo.mjs`) al compilar, lo guarda en `meta.json`
 * (`calidad`) y lo vuelve a medir en la comprobación sobre lo que leen los
 * módulos del servidor. Módulo puro.
 */

/** Cuántos triples usan una propiedad, y entre qué clases (la del sujeto y la del objeto, o el tipo de dato). */
export interface UsoPropiedad {
  /** `soc:fecha`. */
  propiedad: string;
  triples: number;
  /** Los pares dominio → rango observados, del más usado al menos. */
  pares: { dominio: string; rango: string; triples: number }[];
}

/** Una propiedad de la forma de una clase y cuántas instancias la tienen. */
export interface CompletitudPropiedad {
  propiedad: string;
  /** Instancias con al menos un valor. */
  con: number;
  /** `sh:minCount 1` en esta clase o en una de la que es un caso. */
  obligatoria: boolean;
  /** `sh:maxCount 1`. */
  funcional: boolean;
}

export interface CompletitudClase {
  /** `soc:Institucion`. */
  clase: string;
  /** Sujetos con esta clase o una que es un caso de ella (como cuenta SHACL con `rdfs:subClassOf`). */
  instancias: number;
  /** Las propiedades de su forma (las de su dominio; las de sus clases madre van en la fila de cada madre), en el orden de la ontología. */
  propiedades: CompletitudPropiedad[];
}

export interface ViolacionCardinalidad {
  clase: string;
  propiedad: string;
  restriccion: "sh:minCount" | "sh:maxCount";
  nodos: number;
  /** Hasta tres IRIs, los primeros en el orden de compilación. */
  ejemplos: string[];
}

export interface CalidadGrafo {
  /** Triples distintos con una propiedad `soc:`/`do:` en el grafo unido. */
  triples: number;
  /** Sujetos IRI con una clase `soc:`/`do:`. */
  instancias: number;
  uso: UsoPropiedad[];
  completitud: CompletitudClase[];
  violaciones: ViolacionCardinalidad[];
}

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const SOC = `${W3ID}/def/core#`;
const DO = `${W3ID}/def/do#`;
const XSD = "http://www.w3.org/2001/XMLSchema#";
const deAqui = (v: string) => (v.startsWith(SOC) ? `soc:${v.slice(SOC.length)}` : v.startsWith(DO) ? `do:${v.slice(DO.length)}` : null);
/** El rango de un objeto que el grafo no tipa: un concepto de la ontología, o algo de fuera. */
export const SIN_TIPO = "(sin tipo)";
const CONCEPTO = "skos:Concept";

/** El tipo de dato de un literal, como lo escribe la ontología. */
function tipoDeDato(o: Extract<Termino, { tipo: "literal" }>): string {
  if (o.idioma) return "rdf:langString";
  if (!o.datatype) return "xsd:string";
  return o.datatype.startsWith(XSD) ? `xsd:${o.datatype.slice(XSD.length)}` : o.datatype;
}

/** FNV-1a de 24 bits: distingue los valores literales de un mismo sujeto y una misma propiedad. */
function huella24(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) & 0xffffff;
}

const CURIES_CLASE = new Set(CLASES.map((c) => curie(c)));
const LINAJE = new Map(CLASES.map((c) => [curie(c), linaje(curie(c))]));
const linajeDe = (c: string) => LINAJE.get(c) ?? [c];
const PROPS = PROPIEDADES.map((p) => curie(p));
const INDICE_PROP = new Map(PROPS.map((p, i) => [p, i]));
const FUNCIONAL = PROPIEDADES.map((p) => !!p.funcional);

/**
 * Lo que se va midiendo, descripción a descripción. Un triple distinto es una
 * clave numérica (sujeto · propiedad · objeto, 53 bits): el sujeto y el
 * objeto IRI, por su número de orden; un literal, por su huella de 24 bits
 * dentro de su sujeto y su propiedad.
 */
export class Medidor {
  private ids = new Map<string, number>();
  private iris: string[] = [];
  private tipos = new Map<number, Set<string>>();
  private vistos = new Set<number>();
  // Un triple distinto: su sujeto, su propiedad (índice en PROPIEDADES) y su objeto (≥0 un IRI; <0, −1 − el tipo de dato).
  private s: number[] = [];
  private p: number[] = [];
  private o: number[] = [];
  private datos: string[] = [];
  private indiceDato = new Map<string, number>();
  /** Propiedades `soc:`/`do:` que la ontología no declara: el compilador ya las rechaza por esquema, aquí se cuentan. */
  readonly sinDeclarar = new Map<string, number>();

  private id(iri: string): number {
    let i = this.ids.get(iri);
    if (i === undefined) {
      i = this.iris.length;
      if (i >= 2 ** 21) throw new Error("más de 2^21 IRIs: la clave de un triple no cabe en 53 bits");
      this.iris.push(iri);
      this.ids.set(iri, i);
    }
    return i;
  }

  sumar(d: Descripcion): void {
    for (const x of d.triples) {
      if (x.s.tipo !== "iri") continue;
      if (x.p === RDF_TYPE) {
        const c = x.o.tipo === "iri" ? deAqui(x.o.valor) : null;
        if (!c || !CURIES_CLASE.has(c)) continue;
        const sid = this.id(x.s.valor);
        let t = this.tipos.get(sid);
        if (!t) this.tipos.set(sid, (t = new Set()));
        t.add(c);
        continue;
      }
      const pc = deAqui(x.p);
      if (!pc) continue;
      const pi = INDICE_PROP.get(pc);
      if (pi === undefined) {
        this.sinDeclarar.set(pc, (this.sinDeclarar.get(pc) ?? 0) + 1);
        continue;
      }
      const sid = this.id(x.s.valor);
      let v: number;
      let o: number;
      if (x.o.tipo === "iri") {
        o = this.id(x.o.valor);
        v = o;
      } else if (x.o.tipo === "literal") {
        const dt = tipoDeDato(x.o);
        let k = this.indiceDato.get(dt);
        if (k === undefined) {
          k = this.datos.length;
          this.datos.push(dt);
          this.indiceDato.set(dt, k);
        }
        o = -1 - k;
        v = 0x1000000 + huella24(`${x.o.valor}\u0001${x.o.idioma ?? ""}\u0001${x.o.datatype ?? ""}`);
      } else continue;
      // sujeto (21 bits) · propiedad (7) · objeto (25): 53 bits, exacto en un número.
      const clave = sid * 2 ** 32 + pi * 2 ** 25 + v;
      if (this.vistos.has(clave)) continue;
      this.vistos.add(clave);
      this.s.push(sid);
      this.p.push(pi);
      this.o.push(o);
    }
  }

  /** La clase más precisa de un sujeto: de sus clases, las que no son ancestro de otra suya. */
  private clasesDe(sid: number): string[] {
    const t = this.tipos.get(sid);
    if (!t) return [];
    const todas = [...t];
    return todas.filter((c) => !todas.some((u) => u !== c && linajeDe(u).includes(c))).sort();
  }

  resultado(): CalidadGrafo {
    if (PROPS.length > 128) throw new Error("más de 128 propiedades: la clave de un triple no cabe en 53 bits");
    const precisa = new Map<number, string>();
    const clase = (sid: number) => {
      let c = precisa.get(sid);
      if (c === undefined) {
        const cs = this.clasesDe(sid);
        c = cs.length ? cs.join(" + ") : "";
        precisa.set(sid, c);
      }
      return c;
    };
    const rangoDe = (o: number) => {
      if (o < 0) return this.datos[-1 - o];
      const c = clase(o);
      if (c) return c;
      return deAqui(this.iris[o]) ? CONCEPTO : SIN_TIPO;
    };

    // El uso: por propiedad, sus pares dominio → rango.
    const pares = PROPS.map(() => new Map<string, number>());
    const total = PROPS.map(() => 0);
    // Lo que tiene cada sujeto: propiedad → cuántos valores distintos.
    const tiene = new Map<number, Map<number, number>>();
    for (let i = 0; i < this.s.length; i++) {
      const pi = this.p[i];
      total[pi]++;
      const k = `${clase(this.s[i]) || SIN_TIPO}\u0000${rangoDe(this.o[i])}`;
      pares[pi].set(k, (pares[pi].get(k) ?? 0) + 1);
      let m = tiene.get(this.s[i]);
      if (!m) tiene.set(this.s[i], (m = new Map()));
      m.set(pi, (m.get(pi) ?? 0) + 1);
    }
    const uso: UsoPropiedad[] = PROPS.flatMap((propiedad, pi) =>
      total[pi]
        ? [
            {
              propiedad,
              triples: total[pi],
              pares: [...pares[pi]]
                .map(([k, triples]) => {
                  const [dominio, rango] = k.split("\u0000");
                  return { dominio, rango, triples };
                })
                .sort((a, b) => b.triples - a.triples || (a.dominio + a.rango < b.dominio + b.rango ? -1 : 1)),
            },
          ]
        : [],
    );

    // La completitud y la cardinalidad, por clase, como las formas SHACL:
    // instancia de C es quien tiene C o una clase que es un caso de C.
    const instancias = new Map<string, number[]>();
    for (const [sid, t] of this.tipos) {
      const de = new Set([...t].flatMap((c) => linajeDe(c)));
      for (const c of de) {
        let xs = instancias.get(c);
        if (!xs) instancias.set(c, (xs = []));
        xs.push(sid);
      }
    }
    const completitud: CompletitudClase[] = [];
    const violaciones: ViolacionCardinalidad[] = [];
    for (const c of CLASES) {
      const cc = curie(c);
      const xs = instancias.get(cc);
      if (!xs?.length) continue;
      const lin = linajeDe(cc);
      const props: CompletitudPropiedad[] = [];
      PROPIEDADES.forEach((p, pi) => {
        // La forma de la clase: las propiedades de su dominio (las de sus ancestros las mide la fila de cada ancestro).
        if (!p.dominio.includes(cc)) return;
        const obligatoria = !!p.obligatoriaEn?.some((o) => lin.includes(o));
        let con = 0;
        const faltan: string[] = [];
        const sobran: string[] = [];
        let nFaltan = 0;
        let nSobran = 0;
        for (const sid of xs) {
          const n = tiene.get(sid)?.get(pi) ?? 0;
          if (n > 0) con++;
          if (obligatoria && n === 0 && ++nFaltan <= 3) faltan.push(this.iris[sid]);
          if (FUNCIONAL[pi] && n > 1 && ++nSobran <= 3) sobran.push(this.iris[sid]);
        }
        if (nFaltan > 0) violaciones.push({ clase: cc, propiedad: PROPS[pi], restriccion: "sh:minCount", nodos: nFaltan, ejemplos: faltan });
        if (nSobran > 0) violaciones.push({ clase: cc, propiedad: PROPS[pi], restriccion: "sh:maxCount", nodos: nSobran, ejemplos: sobran });
        props.push({ propiedad: PROPS[pi], con, obligatoria, funcional: FUNCIONAL[pi] });
      });
      completitud.push({ clase: cc, instancias: xs.length, propiedades: props });
    }
    return { triples: this.s.length, instancias: this.tipos.size, uso, completitud, violaciones };
  }
}
