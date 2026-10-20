import { AVISO_DECRETO, type AvisoDecreto } from "@/lib/decretos-base";
import { desdeMayusculas } from "@/lib/congreso";
import { PROPIEDADES, concepto, curie, esquemas } from "@/lib/ontologia";
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
