import { SITIO } from "@/lib/sitio";
import { enlace } from "@/lib/grafo";
import { enlacesWikidata, inventario } from "@/lib/grafo-rdf";
import { getFuncionarios } from "@/lib/funcionarios";
import { VERSION } from "@/lib/ontologia";
import { ONTOLOGIA, PREFIJOS, TIPO_MIME, aTurtle, entero, fecha, iri, lit, t, type Termino, type Triple } from "@/lib/rdf";

// Los censos salen de las instantáneas, que cambian solo con un despliegue.
export const dynamic = "force-static";

/**
 * La descripción del conjunto en VoID (W3C, «Describing Linked Datasets»):
 * qué es, qué vocabularios usa, cuántos nodos de cada clase tiene, cómo se
 * pide la descripción de uno y el conjunto de enlaces a Wikidata. Es el
 * sitio donde una máquina empieza (`/.well-known/void`, RFC 8615).
 */
export async function GET() {
  const [clases, wd, f] = await Promise.all([inventario(), enlacesWikidata(), getFuncionarios()]);
  const ds = `${SITIO}/.well-known/void#grafo`;
  const editor: Termino = { tipo: "blanco", valor: "editor" };
  const ls = `${SITIO}/.well-known/void#wikidata`;
  const x: Triple[] = [
    t(ds, "rdf:type", iri("void:Dataset")),
    t(ds, "dct:title", lit("El grafo de Socrático.do", "es")),
    t(
      ds,
      "dct:description",
      lit(
        "Personas con cargo público, instituciones, decretos, entidades financieras, personas jurídicas y provincias de la República Dominicana, con sus relaciones, tal como las publican las fuentes del Estado. Herramienta independiente y no oficial: cada descripción se deriva al pedirla de las instantáneas de la plataforma.",
        "es",
      ),
    ),
    t(ds, "foaf:homepage", iri(`${SITIO}${enlace.grafo()}`)),
    // Quien lo publica. La licencia de reutilización no se declara: la decide el dueño.
    { s: iri(ds), p: PREFIJOS.dct + "publisher", o: editor },
    { s: editor, p: PREFIJOS.rdf + "type", o: iri("foaf:Organization") },
    { s: editor, p: PREFIJOS.foaf + "name", o: lit("Socrático.do") },
    { s: editor, p: PREFIJOS.foaf + "homepage", o: iri(`${SITIO}/`) },
    t(ds, "void:uriSpace", lit(`${SITIO}/`)),
    t(ds, "void:uriLookupEndpoint", iri(`${SITIO}/api/grafo?formato=ttl&nodo=`)),
    t(ds, "void:feature", iri("http://www.w3.org/ns/formats/Turtle")),
    t(ds, "void:feature", iri("http://www.w3.org/ns/formats/JSON-LD")),
    t(ds, "void:feature", iri("http://www.w3.org/ns/formats/N-Triples")),
    t(ds, "void:vocabulary", iri(ONTOLOGIA)),
    t(ds, "dct:conformsTo", iri(ONTOLOGIA)),
    t(ds, "rdfs:seeAlso", iri(`${ONTOLOGIA}.ttl`)),
    t(ds, "void:subset", iri(ls)),
    t(ds, "void:exampleResource", iri(`${SITIO}${enlace.funcionario("luis-rodolfo-abinader-corona")}#id`)),
    t(ds, "void:exampleResource", iri(`${SITIO}${enlace.institucion(4)}#id`)),
    t(ds, "void:exampleResource", iri(`${SITIO}${enlace.norma("decreto", "339-20")}#id`)),
    t(ds, "void:exampleResource", iri(`${SITIO}${enlace.provincia("santiago")}#id`)),
    t(ls, "rdf:type", iri("void:Linkset")),
    t(ls, "void:linkPredicate", iri("owl:sameAs")),
    t(ls, "void:subjectsTarget", iri(ds)),
    t(ls, "void:objectsTarget", iri("http://www.wikidata.org/")),
    t(ls, "void:triples", entero(wd.total)),
    t(
      ls,
      "dct:description",
      lit(
        "Solo las correspondencias únicas en los dos sentidos, buscadas en la réplica de Wikidata de QLever; de personas, solo quien es PEP hoy o firmó decretos como jefe de Estado.",
        "es",
      ),
    ),
  ];
  for (const v of ["schema", "org", "foaf", "eli", "rov", "skos", "dct", "owl"] as const) {
    x.push(t(ds, "void:vocabulary", iri(PREFIJOS[v])));
  }
  if (f?.generado) x.push(t(ds, "dct:modified", fecha(f.generado)));
  if (wd.generado) x.push(t(ls, "dct:modified", fecha(wd.generado)));
  clases.forEach((c, i) => {
    const b: Termino = { tipo: "blanco", valor: `clase${i}` };
    x.push(
      { s: iri(ds), p: PREFIJOS.void + "classPartition", o: b },
      { s: b, p: PREFIJOS.void + "class", o: iri(c.clase) },
      { s: b, p: PREFIJOS.void + "entities", o: entero(c.n) },
      { s: b, p: PREFIJOS.dct + "source", o: lit(c.fuente, "es") },
    );
  });
  const cabecera = `VoID del grafo de Socrático.do (ontología ${VERSION}).\nHerramienta independiente y no oficial sobre datos del Estado dominicano.`;
  return new Response(aTurtle(x, cabecera), {
    headers: { "Content-Type": TIPO_MIME.ttl, "Access-Control-Allow-Origin": "*" },
  });
}
