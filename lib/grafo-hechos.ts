import { AVISO_DECRETO, type AvisoDecreto } from "@/lib/decretos-base";
import { desdeMayusculas } from "@/lib/congreso";
import { CLASES, FORMAS, PROPIEDADES, concepto, curie, esquemas } from "@/lib/ontologia";
import { esquemaClase, linaje } from "@/lib/ontologia-esquemas";
import { PREFIJOS, compactar, expandir, type Triple } from "@/lib/rdf";

/**
 * Lo que un nodo del grafo dice de sí mismo —sus literales y los conceptos de
 * la ontología que lo clasifican—, en llano y sin repetir: «Siglas: MINERD»,
 * «Valor estimado: RD$ 12 000 000». Lo leen el servidor MCP (`lib/mcp.ts`,
 * `fetch` y `retrieve`) y el inspector del banco de trabajo (la portada, `/`),
 * para que un asistente y una persona lean el mismo dato con la misma etiqueta
 * (docs/INFRAESTRUCTURA.md §7.6).
 */

const ENTERO = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 0 });
const mayuscula = (s: string) => s.charAt(0).toLocaleUpperCase("es") + s.slice(1);

const ETIQUETA_PROPIEDAD = new Map(PROPIEDADES.map((p) => [curie(p), mayuscula(p.etiqueta)]));

/** Las propiedades de fuera que se leen en llano. */
const ETIQUETA_EXTERNA: Record<string, string> = {
  "schema:legalName": "Razón social",
  "schema:alternateName": "Siglas u otro nombre",
  "schema:jobTitle": "Cargo principal",
  "schema:description": "Descripción",
  // De qué trata una sentencia: lo dice también `schema:description`, con la misma etiqueta y el mismo valor.
  "dct:description": "Descripción",
  "dct:title": "Título",
  "dct:alternative": "Título modificado",
  "foaf:homepage": "Sitio web",
};

/** Lo que repite otro dato (el nombre en tres vocabularios, la fecha de un decreto en tres). */
const REPETIDAS = new Set([
  "rdfs:label",
  "schema:name",
  "skos:altLabel",
  "schema:taxID",
  "schema:inLanguage",
  "schema:legislationIdentifier",
  "schema:legislationType",
  "schema:legislationDate",
  "eli:id_local",
  "eli:date_document",
  "schema:identifier",
  "schema:dateCreated",
  "schema:startDate",
]);

let conceptos: Map<string, string> | null = null;

/** La etiqueta de cada concepto de la ontología (materias, sectores, movimientos, familias PEP, medidas), por su IRI. */
export function conceptoDe(valor: string): string | undefined {
  conceptos ??= new Map(esquemas().flatMap((e) => e.conceptos.map((c) => [expandir(concepto(c.id)), c.etiqueta] as const)));
  return conceptos.get(valor);
}

const BOOLEANO = PREFIJOS.xsd + "boolean";
const ENTERO_XSD = PREFIJOS.xsd + "integer";

/** Lo que el nodo dice de sí mismo (sus literales y sus conceptos), en llano y sin repetir. */
export function datosDe(triples: Triple[], sujeto: string): { dato: string; valor: string }[] {
  const salida: { dato: string; valor: string }[] = [];
  const vistos = new Set<string>();
  for (const x of triples) {
    if (x.s.tipo !== "iri" || x.s.valor !== sujeto) continue;
    const p = compactar(x.p) ?? x.p;
    if (REPETIDAS.has(p)) continue;
    let valor: string | null = null;
    if (x.o.tipo === "literal") {
      if (x.o.datatype === BOOLEANO) valor = x.o.valor === "true" ? "sí" : "no";
      else if (x.o.datatype === ENTERO_XSD) valor = ENTERO.format(Number(x.o.valor));
      else if (p === "dct:title" || p === "schema:description" || p === "dct:description" || p === "do:etiquetaConsultoria") valor = desdeMayusculas(x.o.valor);
      else if (p === "do:aviso") valor = AVISO_DECRETO[x.o.valor as AvisoDecreto]?.llano ?? x.o.valor;
      else if (p === "soc:valorEstimado" || p === "soc:monto") valor = `RD$ ${ENTERO.format(Number(x.o.valor))}`;
      else if (p === "soc:avance") valor = `${x.o.valor} % (declarado)`;
      else valor = x.o.valor;
      if (p === "soc:pepVigente" && valor === "sí") {
        valor = "sí (ocupa, u ocupó en los últimos tres años, un cargo obligado a declarar patrimonio: Ley 155-17, art. 2, num. 19; es una categoría legal, no una acusación)";
      }
    } else if (x.o.tipo === "iri") {
      valor = conceptoDe(x.o.valor) ?? (p === "foaf:homepage" ? x.o.valor : null);
    }
    if (valor == null) continue;
    const dato = ETIQUETA_PROPIEDAD.get(p) ?? ETIQUETA_EXTERNA[p] ?? p;
    const k = `${dato}|${valor}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    salida.push({ dato, valor });
  }
  return salida;
}

/** Lo que dice la forma SHACL de la clase de un nodo sobre él (docs/INFRAESTRUCTURA.md §7.6). */
export interface FormaDelNodo {
  /** La clase más precisa del nodo: `soc:Institucion`. */
  clase: string;
  /** El nombre de la clase de la forma: «Institución del Estado». */
  etiqueta: string;
  /** El IRI de la forma (`…/def/formas#Institucion`). */
  iri: string;
  /** Cumple las formas de todas sus clases (tipo, cardinalidad y obligatorias, las mismas de `/ontologia.shacl.ttl`). */
  cumple: boolean;
  /** Lo que no cumple, en llano: «Fecha: hace falta». Vacío si cumple. */
  fallos: string[];
  /** Las propiedades opcionales de su forma (y de las de sus clases madre) que el nodo no tiene, en el orden de la ontología. */
  faltan: { propiedad: string; etiqueta: string }[];
}

const RDF_TYPE = expandir("rdf:type");
const CLASE_POR_CURIE = new Map(CLASES.map((c) => [curie(c), c]));

/** Lo que falla de una propiedad, en llano (los mensajes de zod vienen en inglés): se lee del valor, no del mensaje. */
function enLlano(valor: unknown, funcional: boolean): string {
  if (valor === undefined) return "hace falta";
  if (funcional && Array.isArray(valor)) return "lleva más de un valor y admite uno solo";
  return "su valor no es del tipo que admite";
}

/** Un valor de RDF como lo lee el esquema zod de una clase: un número, un sí o un no, o un texto. */
function valorDeEsquema(o: Triple["o"]): unknown {
  if (o.tipo !== "literal") return o.valor;
  const dt = o.datatype ? compactar(o.datatype) : null;
  if (dt === "xsd:integer" || dt === "xsd:decimal") return Number(o.valor);
  if (dt === "xsd:boolean") return o.valor === "true";
  return o.valor;
}

/**
 * El nodo contra la forma de su clase: el mismo esquema zod que el
 * compilador pasa a cada nodo (`esquemaClase`, de la misma definición que el
 * SHACL), y lo opcional que no dice. `null` si el nodo no tiene una clase de
 * la ontología.
 */
export function formaDe(triples: Triple[], sujeto: string): FormaDelNodo | null {
  const tipos = new Set<string>();
  const props: Record<string, unknown[]> = {};
  for (const x of triples) {
    if (x.s.tipo !== "iri" || x.s.valor !== sujeto) continue;
    if (x.p === RDF_TYPE) {
      const c = x.o.tipo === "iri" ? compactar(x.o.valor) : null;
      if (c && CLASE_POR_CURIE.has(c)) tipos.add(c);
      continue;
    }
    const c = compactar(x.p);
    if (!c || !/^(soc|do):/.test(c)) continue;
    const v = valorDeEsquema(x.o);
    if (!(props[c] ??= []).includes(v)) props[c].push(v);
  }
  const todas = [...tipos];
  const precisa = todas.filter((c) => !todas.some((u) => u !== c && linaje(u).includes(c))).sort()[0];
  if (!precisa) return null;
  const funcional = new Set(PROPIEDADES.filter((p) => p.funcional).map((p) => curie(p)));
  const obj = Object.fromEntries(Object.entries(props).map(([k, vs]) => [k, funcional.has(k) && vs.length === 1 ? vs[0] : vs]));
  const fallos: string[] = [];
  for (const c of todas) {
    const r = esquemaClase(c).safeParse(obj);
    if (!r.success) for (const i of r.error.issues) fallos.push(`${ETIQUETA_PROPIEDAD.get(String(i.path[0])) ?? i.path.join(".")}: ${enLlano(obj[String(i.path[0])], funcional.has(String(i.path[0])))}`);
  }
  const linajes = new Set(todas.flatMap((c) => linaje(c)));
  const faltan = PROPIEDADES.filter(
    (p) => p.dominio.some((d) => linajes.has(d)) && !p.obligatoriaEn?.some((o) => linajes.has(o)) && !(curie(p) in props),
  ).map((p) => ({ propiedad: curie(p), etiqueta: ETIQUETA_PROPIEDAD.get(curie(p))! }));
  const clase = CLASE_POR_CURIE.get(precisa)!;
  return {
    clase: precisa,
    etiqueta: clase.etiqueta,
    iri: FORMAS + clase.id,
    cumple: fallos.length === 0,
    fallos: [...new Set(fallos)],
    faltan,
  };
}
