import { SITIO } from "@/lib/sitio";

/**
 * RDF sin dependencias: términos, triples y tres serializaciones —Turtle,
 * N-Triples y JSON-LD— para el grafo semántico de la plataforma
 * (`lib/ontologia.ts`, `lib/grafo-rdf.ts`, docs/ARQUITECTURA.md).
 *
 * No es una base de datos ni un almacén de triples (la invariante: sin base
 * de datos en las superficies de inteligencia): los triples se **derivan** en
 * cada lectura de las mismas instantáneas que pintan las fichas, y se
 * serializan aquí. Escribirlo a mano, en vez de traer una biblioteca, cuesta
 * poco porque solo hace falta escribir, no leer; las reglas de escape son las
 * de las gramáticas de W3C (Turtle 1.1 §6.4, N-Triples 1.1 §2.4) y la salida
 * se valida contra un analizador independiente al construirla.
 *
 * Módulo puro: no toca `fs` ni la red, así que lo pueden usar el middleware,
 * las rutas y los componentes de servidor.
 */

export type Termino =
  | { tipo: "iri"; valor: string }
  | { tipo: "literal"; valor: string; idioma?: string; datatype?: string }
  | { tipo: "blanco"; valor: string };

export interface Triple {
  s: Termino;
  /** El IRI completo del predicado. */
  p: string;
  o: Termino;
}

/** La base de los IRI de la plataforma: la ficha más `#id` es la cosa; sin él, la página. */
export const BASE = SITIO;
export const ONTOLOGIA = `${SITIO}/ontologia`;

/** Los vocabularios que usa el grafo, con su prefijo de siempre. */
export const PREFIJOS = {
  soc: `${ONTOLOGIA}#`,
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  owl: "http://www.w3.org/2002/07/owl#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  skos: "http://www.w3.org/2004/02/skos/core#",
  dct: "http://purl.org/dc/terms/",
  foaf: "http://xmlns.com/foaf/0.1/",
  schema: "http://schema.org/",
  org: "http://www.w3.org/ns/org#",
  rov: "http://www.w3.org/ns/regorg#",
  eli: "http://data.europa.eu/eli/ontology#",
  void: "http://rdfs.org/ns/void#",
  vann: "http://purl.org/vocab/vann/",
  wd: "http://www.wikidata.org/entity/",
} as const;

export type Prefijo = keyof typeof PREFIJOS;

/** `soc:Persona` → el IRI completo. Un nombre sin prefijo conocido se devuelve tal cual. */
export function expandir(nombre: string): string {
  const i = nombre.indexOf(":");
  if (i < 1) return nombre;
  const pre = nombre.slice(0, i) as Prefijo;
  return pre in PREFIJOS && !nombre.startsWith("http") ? PREFIJOS[pre] + nombre.slice(i + 1) : nombre;
}

/**
 * Un IRI válido: lo que su gramática no admite (espacios, `<>"{}|^\``, `\\` y
 * los de control) va en %XX. Las URL de algunos portales traen espacios.
 */
function normalizarIri(v: string): string {
  return v.replace(/[\u0000-\u0020<>"{}|^`\\]/g, (c) => encodeURIComponent(c));
}

export const iri = (valor: string): Termino => ({ tipo: "iri", valor: normalizarIri(expandir(valor)) });
export const lit = (valor: string, idioma?: string): Termino =>
  idioma ? { tipo: "literal", valor, idioma } : { tipo: "literal", valor };
export const tipado = (valor: string | number | boolean, datatype: string): Termino => ({
  tipo: "literal",
  valor: String(valor),
  datatype: expandir(datatype),
});
export const entero = (n: number) => tipado(Math.trunc(n), "xsd:integer");
export const decimal = (n: number) => tipado(n, "xsd:decimal");
export const booleano = (b: boolean) => tipado(b, "xsd:boolean");
/** Una fecha ISO: `xsd:date` si es un día, `xsd:gYear` si es un año. */
export const fecha = (iso: string) =>
  /^\d{4}$/.test(iso) ? tipado(iso, "xsd:gYear") : tipado(iso.slice(0, 10), "xsd:date");

/** Un triple, con el predicado en forma corta («schema:name»). */
export function t(s: Termino | string, p: string, o: Termino): Triple {
  return { s: typeof s === "string" ? iri(s) : s, p: expandir(p), o };
}

/* ------------------------------------------------------------- compactar */

// La parte local que se escribe sin corchetes: letras, cifras, guion y
// subrayado, sin empezar por guion ni acabar en punto. Lo demás va entero.
const LOCAL_SEGURO = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** `http://schema.org/name` → `schema:name`, si el prefijo existe y la parte local es segura. */
export function compactar(completo: string): string | null {
  let mejor: string | null = null;
  let largo = 0;
  for (const [pre, ns] of Object.entries(PREFIJOS)) {
    if (completo.startsWith(ns) && ns.length > largo) {
      const local = completo.slice(ns.length);
      if (LOCAL_SEGURO.test(local)) {
        mejor = `${pre}:${local}`;
        largo = ns.length;
      }
    }
  }
  return mejor;
}

/* ---------------------------------------------------------------- escapes */

/** Un IRI entre corchetes angulares, con los caracteres que la gramática veta escapados (UCHAR). */
function iriRef(v: string): string {
  return `<${v.replace(/[\u0000- <>"{}|^`\\]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase()}`)}>`;
}

/** El texto de un literal entre comillas dobles (ECHAR y UCHAR para los de control). */
function cadena(v: string): string {
  return `"${v.replace(/[\\"\n\r\t\u0000-\u001F\u007F]/g, (c) => {
    switch (c) {
      case "\\":
        return "\\\\";
      case '"':
        return '\\"';
      case "\n":
        return "\\n";
      case "\r":
        return "\\r";
      case "\t":
        return "\\t";
      default:
        return `\\u${c.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase()}`;
    }
  })}"`;
}

/* ----------------------------------------------------------------- Turtle */

function turtleTermino(x: Termino): string {
  if (x.tipo === "blanco") return `_:${x.valor}`;
  if (x.tipo === "iri") return compactar(x.valor) ?? iriRef(x.valor);
  if (x.idioma) return `${cadena(x.valor)}@${x.idioma}`;
  if (x.datatype && x.datatype !== PREFIJOS.xsd + "string") {
    return `${cadena(x.valor)}^^${compactar(x.datatype) ?? iriRef(x.datatype)}`;
  }
  return cadena(x.valor);
}

/** Los prefijos que de verdad aparecen en los triples, en el orden de `PREFIJOS`. */
function prefijosUsados(triples: Triple[]): Prefijo[] {
  const usados = new Set<string>();
  const mirar = (v: string) => {
    const c = compactar(v);
    if (c) usados.add(c.slice(0, c.indexOf(":")));
  };
  for (const x of triples) {
    if (x.s.tipo === "iri") mirar(x.s.valor);
    mirar(x.p);
    if (x.o.tipo === "iri") mirar(x.o.valor);
    if (x.o.tipo === "literal" && x.o.datatype) mirar(x.o.datatype);
  }
  return (Object.keys(PREFIJOS) as Prefijo[]).filter((p) => usados.has(p));
}

/** Los triples agrupados por sujeto y predicado, en el orden en que llegaron, sin repetidos. */
function agrupar(triples: Triple[]): Map<string, { s: Termino; porP: Map<string, Termino[]> }> {
  const clave = (x: Termino) => `${x.tipo}|${x.valor}|${"idioma" in x ? (x.idioma ?? "") : ""}|${"datatype" in x ? (x.datatype ?? "") : ""}`;
  const grupos = new Map<string, { s: Termino; porP: Map<string, Termino[]> }>();
  const vistos = new Set<string>();
  for (const x of triples) {
    const k = `${clave(x.s)}\u0001${x.p}\u0001${clave(x.o)}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    const ks = clave(x.s);
    let g = grupos.get(ks);
    if (!g) {
      g = { s: x.s, porP: new Map() };
      grupos.set(ks, g);
    }
    const lista = g.porP.get(x.p) ?? [];
    lista.push(x.o);
    g.porP.set(x.p, lista);
  }
  return grupos;
}

/** Turtle legible: prefijos, un bloque por sujeto, `a` para `rdf:type`. */
export function aTurtle(triples: Triple[], cabecera?: string): string {
  const lineas: string[] = [];
  if (cabecera) lineas.push(...cabecera.split("\n").map((l) => `# ${l}`), "");
  for (const p of prefijosUsados(triples)) lineas.push(`@prefix ${p}: <${PREFIJOS[p]}> .`);
  lineas.push("");
  for (const { s, porP } of agrupar(triples).values()) {
    const partes: string[] = [];
    // El tipo primero: se lee qué es antes de lo que dice.
    const orden = [...porP.keys()].sort((a, b) => Number(b === PREFIJOS.rdf + "type") - Number(a === PREFIJOS.rdf + "type"));
    for (const p of orden) {
      const verbo = p === PREFIJOS.rdf + "type" ? "a" : (compactar(p) ?? iriRef(p));
      partes.push(`${verbo} ${porP.get(p)!.map(turtleTermino).join(", ")}`);
    }
    lineas.push(`${turtleTermino(s)}\n    ${partes.join(" ;\n    ")} .`, "");
  }
  return lineas.join("\n");
}

/* -------------------------------------------------------------- N-Triples */

function ntTermino(x: Termino): string {
  if (x.tipo === "blanco") return `_:${x.valor}`;
  if (x.tipo === "iri") return iriRef(x.valor);
  if (x.idioma) return `${cadena(x.valor)}@${x.idioma}`;
  if (x.datatype && x.datatype !== PREFIJOS.xsd + "string") return `${cadena(x.valor)}^^${iriRef(x.datatype)}`;
  return cadena(x.valor);
}

/** Una línea por triple: lo que se carga en cualquier almacén. */
export function aNTriples(triples: Triple[]): string {
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const x of triples) {
    const l = `${ntTermino(x.s)} ${iriRef(x.p)} ${ntTermino(x.o)} .`;
    if (vistas.has(l)) continue;
    vistas.add(l);
    salida.push(l);
  }
  return salida.join("\n") + "\n";
}

/* ---------------------------------------------------------------- JSON-LD */

type ValorJsonLd = string | { "@id": string } | { "@value": string; "@language"?: string; "@type"?: string };

function jsonLdIri(v: string): string {
  return compactar(v) ?? v;
}

function jsonLdValor(x: Termino): ValorJsonLd {
  if (x.tipo === "blanco") return { "@id": `_:${x.valor}` };
  if (x.tipo === "iri") return { "@id": jsonLdIri(x.valor) };
  if (x.idioma) return { "@value": x.valor, "@language": x.idioma };
  if (x.datatype && x.datatype !== PREFIJOS.xsd + "string") return { "@value": x.valor, "@type": jsonLdIri(x.datatype) };
  return x.valor;
}

/**
 * JSON-LD 1.1 aplanado: un `@context` con los prefijos usados y un `@graph`
 * con un objeto por sujeto. Los IRI van en forma compacta cuando hay prefijo.
 */
export function aJsonLd(triples: Triple[]): Record<string, unknown> {
  const contexto: Record<string, string> = {};
  for (const p of prefijosUsados(triples)) contexto[p] = PREFIJOS[p];
  const grafo: Record<string, unknown>[] = [];
  for (const { s, porP } of agrupar(triples).values()) {
    const nodo: Record<string, unknown> = { "@id": s.tipo === "blanco" ? `_:${s.valor}` : jsonLdIri(s.valor) };
    for (const [p, objetos] of porP) {
      if (p === PREFIJOS.rdf + "type") {
        nodo["@type"] = objetos.map((o) => (o.tipo === "iri" ? jsonLdIri(o.valor) : `_:${o.valor}`));
      } else {
        nodo[jsonLdIri(p)] = objetos.map(jsonLdValor);
      }
    }
    grafo.push(nodo);
  }
  return { "@context": contexto, "@graph": grafo };
}

/* ------------------------------------------------------------- formatos */

export type FormatoRdf = "ttl" | "jsonld" | "nt";

export const TIPO_MIME: Record<FormatoRdf, string> = {
  ttl: "text/turtle; charset=utf-8",
  jsonld: "application/ld+json; charset=utf-8",
  nt: "application/n-triples; charset=utf-8",
};

/** El formato que pide una cabecera `Accept`, o `null` si prefiere HTML (o no pide RDF). */
export function formatoDeAccept(accept: string | null | undefined): FormatoRdf | null {
  const a = (accept ?? "").toLowerCase();
  if (!a || a.includes("text/html")) return null;
  if (a.includes("text/turtle") || a.includes("application/x-turtle")) return "ttl";
  if (a.includes("application/ld+json")) return "jsonld";
  if (a.includes("application/n-triples")) return "nt";
  return null;
}

/** Serializa en el formato pedido. */
export function serializar(triples: Triple[], formato: FormatoRdf, cabecera?: string): string {
  if (formato === "ttl") return aTurtle(triples, cabecera);
  if (formato === "nt") return aNTriples(triples);
  return JSON.stringify(aJsonLd(triples), null, 2);
}
