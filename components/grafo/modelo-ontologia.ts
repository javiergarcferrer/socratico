/**
 * El mapa de la ontología como **función pura** de `OntologiaVista` (la TBox de
 * `lib/ontologia.ts` con su uso medido en el grafo compilado): qué clases son
 * nodos, qué relaciones son aristas y qué se queda fuera del dibujo y por qué.
 * Sin React ni WebGL; lo dibuja `mapa-ontologia.tsx` y lo escribe su tabla.
 *
 *  - **Nodos**: cada clase de `soc:` y `do:`, del tamaño de sus instancias
 *    (`ClaseVista.completitud.instancias`, o sus nodos si no hay medida);
 *    el término de un vocabulario controlado (`skos:Concept`) cuando alguna
 *    relación llega a él; y, con el interruptor, las clases de fuera con las
 *    que se alinea (schema.org, ORG, ePO, ELI, DCAT, Wikidata…).
 *  - **Aristas**: «es un caso de» (`rdfs:subClassOf` entre clases de aquí);
 *    cada propiedad de objeto entre los pares dominio → rango **observados**
 *    en el grafo, con su cuenta de triples; la que el grafo todavía no usa,
 *    entre sus pares **declarados**, punteada; y las alineaciones. Varias
 *    propiedades entre las mismas dos clases van en una sola arista que las
 *    nombra a todas, con el grosor de la suma.
 *  - **Fuera del dibujo**, con su razón: las propiedades de dato (van a un
 *    literal, se leen en la clase), las que ligan una clase consigo misma
 *    (sigma no dibuja bucles; se escriben en la clase) y los pares cuyo otro
 *    extremo no es una clase (un literal, un objeto sin tipo).
 *
 * Nada se dibuja sin su definición: cada nodo y cada relación llevan el
 * `rdfs:comment` de la ontología, o la definición escrita aquí para lo que
 * no es de ella (`skos:Concept`, las clases de fuera).
 */
import type { ClaseVista, OntologiaVista } from "@/lib/explorar-tipos";

/** Los vocabularios de fuera con que se alinea la ontología, en el orden del interruptor. */
export const VOCABULARIOS = [
  { clave: "schema", etiqueta: "schema.org", prefijos: ["schema"] },
  { clave: "org", etiqueta: "ORG", prefijos: ["org"] },
  { clave: "epo", etiqueta: "ePO", prefijos: ["epo"] },
  { clave: "eli", etiqueta: "ELI", prefijos: ["eli"] },
  { clave: "dcat", etiqueta: "DCAT", prefijos: ["dcat"] },
  { clave: "wikidata", etiqueta: "Wikidata", prefijos: ["wd"] },
  { clave: "otros", etiqueta: "FOAF, PROV y otros", prefijos: [] as string[] },
] as const;

export type Vocabulario = (typeof VOCABULARIOS)[number]["clave"];
export const CLAVES_VOCABULARIO = VOCABULARIOS.map((v) => v.clave) as Vocabulario[];

/** El vocabulario de un término de fuera, por su prefijo. */
export function vocabularioDe(curie: string): Vocabulario {
  const prefijo = curie.split(":")[0];
  return VOCABULARIOS.find((v) => (v.prefijos as readonly string[]).includes(prefijo))?.clave ?? "otros";
}

/** El término de los vocabularios controlados: el rango de `soc:sector`, `soc:modalidad`, `soc:materia`… */
export const CONCEPTO = "skos:Concept";

export type ClaseNodo = "clase" | "definida" | "concepto" | "externa";

export interface NodoMapa {
  curie: string;
  etiqueta: string;
  /** Qué es, en llano: la definición de la ontología o la de aquí. */
  definicion: string;
  clase: ClaseNodo;
  /** Instancias en el grafo compilado; `null` si no tiene (definida, de fuera). */
  instancias: number | null;
  /** De una clase de fuera, su vocabulario. */
  vocabulario: Vocabulario | null;
  /** Las relaciones que ligan esta clase consigo misma: no se dibujan como trazo, se escriben aquí. */
  bucles: RelacionMapa[];
  sx: number;
  sy: number;
}

/** Una propiedad entre un par de clases: observada (con sus triples) o solo declarada. */
export interface RelacionMapa {
  propiedad: string;
  etiqueta: string;
  definicion: string;
  dominio: string;
  rango: string;
  /** Los triples que el grafo tiene entre ese dominio y ese rango; `null` si el par es solo declarado. */
  triples: number | null;
}

export type TipoAristaMapa = "caso" | "relacion" | "alineacion";

export interface AristaMapa {
  clave: string;
  de: string;
  a: string;
  tipo: TipoAristaMapa;
  /** Las propiedades que la forman (de una arista de relación). */
  relaciones: RelacionMapa[];
  /** La suma de triples observados; 0 si todas son solo declaradas. */
  triples: number;
  /** Ninguna de sus relaciones se observa en el grafo: punteada. */
  definida: boolean;
  /** Lo que se escribe sobre el trazo. */
  rotulo: string;
}

export interface FueraDelDibujo {
  propiedad: string;
  etiqueta: string;
  razon: string;
}

export interface Mapa {
  nodos: Map<string, NodoMapa>;
  aristas: AristaMapa[];
  fuera: FueraDelDibujo[];
}

const DEFINICION_CONCEPTO =
  "Un término de un vocabulario controlado de la ontología (`skos:Concept`): el sector de una institución, la modalidad o la etapa de un proceso de compra, la materia de un decreto. Cada vocabulario es un esquema de conceptos que se descarga con la ontología.";

/** Un número en [0, 1) que sale de un texto (FNV-1a): la misma clase, siempre el mismo sitio de partida. */
function azar(texto: string, sal = 0): number {
  let h = (0x811c9dc5 ^ sal) >>> 0;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0x100000000;
}

const limpiar = (s: string) => s.replace(/`/g, "");

export function instanciasDe(c: ClaseVista): number | null {
  return c.completitud?.instancias ?? c.nodos ?? null;
}

/** La relación tal como se escribe sobre la arista: la de más triples y cuántas más hay. */
function rotular(relaciones: RelacionMapa[], tipo: TipoAristaMapa): string {
  if (tipo === "caso") return "es un caso de";
  const nombres = [...new Set(relaciones.slice().sort((a, b) => (b.triples ?? -1) - (a.triples ?? -1)).map((r) => r.etiqueta))];
  return nombres.length > 1 ? `${nombres[0]} y ${nombres.length - 1} más` : (nombres[0] ?? "");
}

export function armarMapa(o: OntologiaVista, alineaciones: ReadonlySet<Vocabulario> = new Set()): Mapa {
  const nodos = new Map<string, NodoMapa>();
  const deAqui = new Map(o.clases.map((c) => [c.curie, c]));

  // Las raíces de la jerarquía en un círculo; cada caso junto a su padre. La disposición parte de ahí.
  const raices = o.clases.filter((c) => !c.padre || !deAqui.has(c.padre));
  const radio = 10 * Math.sqrt(raices.length);
  const posicion = new Map<string, [number, number]>();
  raices.forEach((c, i) => {
    const angulo = (2 * Math.PI * i) / raices.length;
    posicion.set(c.curie, [Math.cos(angulo) * radio, Math.sin(angulo) * radio]);
  });
  const ubicar = (c: ClaseVista, vistos = new Set<string>()): [number, number] => {
    const ya = posicion.get(c.curie);
    if (ya) return ya;
    const padre = c.padre ? deAqui.get(c.padre) : undefined;
    const base = padre && !vistos.has(padre.curie) ? ubicar(padre, new Set([...vistos, c.curie])) : [0, 0];
    const angulo = azar(c.curie, 1) * 2 * Math.PI;
    const p: [number, number] = [base[0] + Math.cos(angulo) * 3, base[1] + Math.sin(angulo) * 3];
    posicion.set(c.curie, p);
    return p;
  };

  for (const c of o.clases) {
    const [sx, sy] = ubicar(c);
    const instancias = instanciasDe(c);
    nodos.set(c.curie, {
      curie: c.curie,
      etiqueta: c.etiqueta,
      definicion: limpiar(c.comentario),
      clase: instancias ? "clase" : "definida",
      instancias,
      vocabulario: null,
      bucles: [],
      sx,
      sy,
    });
  }

  const aristas = new Map<string, AristaMapa>();
  const fuera: FueraDelDibujo[] = [];
  const nodoDe = (curie: string): string | null => (deAqui.has(curie) ? curie : curie === CONCEPTO ? CONCEPTO : null);
  const conConcepto = () => {
    if (nodos.has(CONCEPTO)) return;
    nodos.set(CONCEPTO, {
      curie: CONCEPTO,
      etiqueta: "Término de un vocabulario",
      definicion: limpiar(DEFINICION_CONCEPTO),
      clase: "concepto",
      instancias: null,
      vocabulario: null,
      bucles: [],
      sx: 0,
      sy: 0,
    });
  };
  const sumar = (tipo: TipoAristaMapa, de: string, a: string, r: RelacionMapa | null) => {
    const [x, y] = de < a ? [de, a] : [a, de];
    const clave = `${tipo}\u0000${x}\u0000${y}`;
    let arista = aristas.get(clave);
    if (!arista) {
      arista = { clave, de, a, tipo, relaciones: [], triples: 0, definida: tipo === "relacion", rotulo: "" };
      aristas.set(clave, arista);
    }
    if (r) {
      arista.relaciones.push(r);
      if (r.triples != null) {
        arista.triples += r.triples;
        arista.definida = false;
      }
    }
  };

  // «Es un caso de»: la jerarquía de aquí.
  for (const c of o.clases) if (c.padre && deAqui.has(c.padre)) sumar("caso", c.curie, c.padre, null);

  // Las relaciones: los pares observados; sin uso, los declarados.
  const objeto = o.propiedades.filter((p) => p.tipo === "objeto");
  for (const p of objeto) {
    const pares: { dominio: string; rango: string; triples: number | null }[] = p.uso?.pares.length
      ? p.uso.pares
      : p.dominio.flatMap((d) => p.rango.map((r) => ({ dominio: d, rango: r, triples: null })));
    const sinDibujo: string[] = [];
    let dibujada = false;
    for (const par of pares) {
      const de = nodoDe(par.dominio);
      const a = nodoDe(par.rango);
      const r: RelacionMapa = { propiedad: p.curie, etiqueta: p.etiqueta, definicion: limpiar(p.comentario), dominio: par.dominio, rango: par.rango, triples: par.triples };
      if (!de || !a) {
        sinDibujo.push(`${par.dominio} → ${par.rango}`);
        continue;
      }
      if (de === CONCEPTO || a === CONCEPTO) conConcepto();
      if (de === a) {
        nodos.get(de)!.bucles.push(r);
        dibujada = true;
        continue;
      }
      sumar("relacion", de, a, r);
      dibujada = true;
    }
    if (sinDibujo.length) {
      fuera.push({
        propiedad: p.curie,
        etiqueta: p.etiqueta,
        razon: `${dibujada ? "Parte de sus pares" : "Sus pares"} no ${sinDibujo.length === 1 ? "liga" : "ligan"} dos clases: ${sinDibujo.join(", ")}.`,
      });
    }
  }
  for (const p of o.propiedades.filter((x) => x.tipo === "dato")) {
    fuera.push({ propiedad: p.curie, etiqueta: p.etiqueta, razon: `Un dato: de ${p.dominio.join(", ")} a un valor (${p.rango.join(", ")}). Se lee en la ficha de su clase.` });
  }

  // Las alineaciones de fuera, con el interruptor.
  if (alineaciones.size) {
    for (const c of o.clases) {
      for (const al of c.alineaciones) {
        const v = vocabularioDe(al.curie);
        if (!alineaciones.has(v)) continue;
        if (!nodos.has(al.curie)) {
          const base = nodos.get(c.curie)!;
          const angulo = azar(al.curie, 2) * 2 * Math.PI;
          const etiquetaV = VOCABULARIOS.find((x) => x.clave === v)!.etiqueta;
          nodos.set(al.curie, {
            curie: al.curie,
            etiqueta: al.nombre ? `${al.nombre} (${al.curie})` : al.curie,
            definicion:
              v === "wikidata"
                ? `Un elemento de Wikidata (${al.curie.slice(3)}). La ontología lo da como ${al.relacion === "closeMatch" ? "correspondencia cercana" : "correspondencia más amplia"} (\`skos:${al.relacion}\`), no como clase: Wikidata no es OWL.`
                : `Una clase de ${etiquetaV}, de fuera de esta ontología: las clases de aquí que la apuntan son casos de ella (\`rdfs:subClassOf\`).`,
            clase: "externa",
            instancias: null,
            vocabulario: v,
            bucles: [],
            sx: base.sx + Math.cos(angulo) * 4,
            sy: base.sy + Math.sin(angulo) * 4,
          });
        }
        sumar("alineacion", c.curie, al.curie, {
          propiedad: al.relacion === "subClassOf" ? "rdfs:subClassOf" : `skos:${al.relacion}`,
          etiqueta: al.relacion === "subClassOf" ? "es un caso de" : "se corresponde con",
          definicion: "",
          dominio: c.curie,
          rango: al.curie,
          triples: null,
        });
      }
    }
  }

  // El concepto, junto al centro de quienes lo usan.
  const concepto = nodos.get(CONCEPTO);
  if (concepto) concepto.sx = concepto.sy = 0;

  const lista = [...aristas.values()];
  for (const a of lista) {
    a.rotulo = rotular(a.relaciones, a.tipo);
    // Una alineación no es una relación sin uso: no se puntea.
    if (a.tipo !== "relacion") a.definida = false;
  }
  return { nodos, aristas: lista, fuera };
}

/** Cada propiedad de la ontología, con dónde está en el mapa: para la tabla y para comprobar que ninguna falta. */
export function dondeEsta(o: OntologiaVista, mapa: Mapa): Map<string, string> {
  const salida = new Map<string, string>();
  for (const a of mapa.aristas) for (const r of a.relaciones) if (a.tipo === "relacion" && !salida.has(r.propiedad)) salida.set(r.propiedad, a.definida ? "arista punteada" : "arista");
  for (const n of mapa.nodos.values()) for (const r of n.bucles) if (!salida.has(r.propiedad)) salida.set(r.propiedad, `escrita en ${n.etiqueta}`);
  for (const f of mapa.fuera) if (!salida.has(f.propiedad)) salida.set(f.propiedad, "tabla");
  for (const p of o.propiedades) if (!salida.has(p.curie)) salida.set(p.curie, "falta");
  return salida;
}

