import { SITIO } from "@/lib/sitio";
import { enlace } from "@/lib/grafo";
import { volcadoDelGrafo } from "@/lib/grafo-rdf";
import { TABLAS_GENERADAS, TABLAS_GRAFO } from "@/lib/grafo-tablas";
import { PUBLICADA, VERSION } from "@/lib/ontologia";
import { ONTOLOGIA, ONTOLOGIA_DO, PAGINA_ONTOLOGIA, TIPO_MIME, aTurtle, entero, iri, lit, t, tipado, type Triple } from "@/lib/rdf";
import volcadoMeta from "@/public/data/grafo/meta.json";

// Sale de las instantáneas y del código: cambia solo con un despliegue.
export const dynamic = "force-static";

/**
 * El catálogo de lo que la plataforma publica para descargar, en DCAT 3
 * (W3C, «Data Catalog Vocabulary»): el volcado del grafo, las tablas
 * Parquet, la ontología y sus formas SHACL, cada distribución con su
 * dirección de descarga, su formato, su licencia y sus fechas. Lo que es de
 * personas naturales no está en ninguna (docs/INFRAESTRUCTURA.md §7.11).
 */

/** La licencia de lo que la plataforma compila y publica: la misma que la ontología declara desde la v1. */
const LICENCIA = "https://creativecommons.org/licenses/by/4.0/";
const AVISO =
  "Socrático.do es una herramienta independiente y no oficial: compila lo que publican las fuentes del Estado dominicano, no habla en su nombre ni sustituye a la fuente.";
const IANA = "http://www.iana.org/assignments/media-types/";
const fechaXsd = (d: string) => tipado(d, "xsd:date");

export async function GET() {
  const volcado = await volcadoDelGrafo();
  const cat = `${SITIO}/dcat.ttl#catalogo`;
  const editor = `${SITIO}/#socratico`;
  const x: Triple[] = [
    t(cat, "rdf:type", iri("dcat:Catalog")),
    t(cat, "dct:title", lit("Lo que Socrático.do publica para descargar", "es")),
    t(cat, "dct:title", lit("Socrático.do downloadable data", "en")),
    t(cat, "dct:description", lit(`El grafo sin personas naturales, sus tablas y su vocabulario. ${AVISO}`, "es")),
    t(cat, "dct:description", lit("The graph without natural persons, its tables and its vocabulary. Socrático.do is an independent, unofficial tool built on data published by the Dominican State.", "en")),
    t(cat, "dct:publisher", iri(editor)),
    t(cat, "dct:license", iri(LICENCIA)),
    t(cat, "dct:rights", lit(AVISO, "es")),
    t(cat, "dct:language", iri("http://id.loc.gov/vocabulary/iso639-1/es")),
    t(cat, "dct:spatial", iri("http://www.wikidata.org/entity/Q786")),
    t(cat, "rdfs:seeAlso", iri(`${SITIO}/.well-known/void`)),
    t(cat, "dct:modified", fechaXsd([volcado?.generado ?? "", TABLAS_GENERADAS, PUBLICADA].sort().at(-1)!)),
    t(editor, "rdf:type", iri("foaf:Organization")),
    t(editor, "foaf:name", lit("Socrático.do")),
    t(editor, "foaf:homepage", iri(`${SITIO}/`)),
  ];

  /** Un conjunto del catálogo, con lo que todo conjunto lleva. */
  const conjunto = (id: string, titulo: string, descripcion: string, fecha: string, pagina: string) => {
    const s = `${SITIO}/dcat.ttl#${id}`;
    x.push(
      t(cat, "dcat:dataset", iri(s)),
      t(s, "rdf:type", iri("dcat:Dataset")),
      t(s, "dct:title", lit(titulo, "es")),
      t(s, "dct:description", lit(`${descripcion} ${AVISO}`, "es")),
      t(s, "dct:publisher", iri(editor)),
      t(s, "dct:license", iri(LICENCIA)),
      t(s, "dct:modified", fechaXsd(fecha)),
      t(s, "dcat:landingPage", iri(pagina)),
    );
    return s;
  };
  /** Una distribución: dirección de descarga, formato (el tipo IANA), licencia y fecha. */
  const distribucion = (
    ds: string,
    id: string,
    o: { url: string; titulo: string; tipo: string; fecha: string; bytes?: number; gzip?: boolean; conformeA?: string },
  ) => {
    const d = `${SITIO}/dcat.ttl#${id}`;
    x.push(
      t(ds, "dcat:distribution", iri(d)),
      t(d, "rdf:type", iri("dcat:Distribution")),
      t(d, "dct:title", lit(o.titulo, "es")),
      t(d, "dcat:downloadURL", iri(o.url)),
      t(d, "dcat:accessURL", iri(o.url)),
      // El tipo sin sus parámetros (`; charset=utf-8`): el registro de IANA nombra el tipo.
      t(d, "dcat:mediaType", iri(IANA + o.tipo.split(";")[0])),
      t(d, "dct:format", iri(IANA + o.tipo.split(";")[0])),
      t(d, "dct:license", iri(LICENCIA)),
      t(d, "dct:rights", lit(AVISO, "es")),
      t(d, "dct:modified", fechaXsd(o.fecha)),
    );
    if (o.bytes) x.push(t(d, "dcat:byteSize", tipado(o.bytes, "xsd:nonNegativeInteger")));
    if (o.gzip) x.push(t(d, "dcat:compressFormat", iri(IANA + "application/gzip")));
    if (o.conformeA) x.push(t(d, "dct:conformsTo", iri(o.conformeA)));
  };

  // El volcado: los mismos triples en N-Triples y, con su grafo de procedencia, en TriG.
  if (volcado) {
    const g = conjunto(
      "volcado",
      "El grafo sin personas naturales",
      `Instituciones, entidades financieras, provincias, empresas, proveedores, procesos de compra, obras y conjuntos de datos, con sus relaciones. ${volcado.excluye}`,
      volcado.generado,
      `${SITIO}${enlace.grafo()}`,
    );
    x.push(t(g, "dct:conformsTo", iri(ONTOLOGIA)), t(g, "dct:conformsTo", iri(ONTOLOGIA_DO)), t(g, "void:triples", entero(volcado.triples)));
    distribucion(g, "volcado-nt", {
      url: volcado.url,
      titulo: "N-Triples comprimido con gzip",
      tipo: "application/n-triples",
      fecha: volcado.generado,
      bytes: volcado.bytes,
      gzip: true,
    });
    distribucion(g, "volcado-trig", {
      url: volcado.urlTrig,
      titulo: "TriG comprimido con gzip, un grafo con nombre por fuente y corte",
      tipo: "application/trig",
      fecha: volcado.generado,
      bytes: volcadoMeta.trig.bytes,
      gzip: true,
    });
  }

  // Las tablas: un conjunto por tabla, con su fuente, su corte y sus filas; el esquema, en `meta.json`.
  for (const [nombre, tabla] of Object.entries(TABLAS_GRAFO)) {
    const s = conjunto(
      `tabla-${nombre}`,
      `Tabla «${nombre}»`,
      `${tabla.descripcion} Fuente: ${tabla.fuente}.${tabla.corte ? ` Corte: ${tabla.corte}.` : ""} ${tabla.filas} filas.`,
      TABLAS_GENERADAS,
      `${SITIO}${enlace.grafo()}`,
    );
    x.push(t(s, "rdfs:seeAlso", iri(`${SITIO}/tablas/meta.json`)));
    distribucion(s, `tabla-${nombre}-parquet`, {
      url: `${SITIO}/tablas/${nombre}.parquet`,
      titulo: "Apache Parquet con zstd",
      tipo: "application/vnd.apache.parquet",
      fecha: TABLAS_GENERADAS,
    });
  }

  // El vocabulario: el núcleo y el módulo dominicano en un documento, en tres sintaxis; y sus formas SHACL.
  const voc = conjunto(
    "ontologia",
    `La ontología de Socrático.do, versión ${VERSION}`,
    "El vocabulario del grafo en OWL y RDFS: el núcleo, neutral de país, y el módulo de la República Dominicana.",
    PUBLICADA,
    PAGINA_ONTOLOGIA,
  );
  x.push(t(voc, "dcat:version", lit(VERSION)), t(voc, "dct:conformsTo", iri("http://www.w3.org/2002/07/owl")));
  for (const [ext, tipo, titulo] of [
    ["ttl", TIPO_MIME.ttl, "Turtle"],
    ["jsonld", TIPO_MIME.jsonld, "JSON-LD"],
    ["nt", TIPO_MIME.nt, "N-Triples"],
  ] as const) {
    distribucion(voc, `ontologia-${ext}`, { url: `${PAGINA_ONTOLOGIA}.${ext}`, titulo, tipo, fecha: PUBLICADA });
  }
  const formas = conjunto(
    "formas",
    `Las formas SHACL de la ontología, versión ${VERSION}`,
    "Lo que cada instancia del grafo tiene que cumplir; validan el grafo de datos unido con la ontología.",
    PUBLICADA,
    PAGINA_ONTOLOGIA,
  );
  x.push(t(formas, "dcat:version", lit(VERSION)));
  distribucion(formas, "formas-ttl", {
    url: `${PAGINA_ONTOLOGIA}.shacl.ttl`,
    titulo: "Turtle",
    tipo: TIPO_MIME.ttl,
    fecha: PUBLICADA,
    conformeA: "http://www.w3.org/ns/shacl#",
  });

  const cabecera = `Catálogo DCAT de Socrático.do.\nHerramienta independiente y no oficial sobre datos del Estado dominicano.`;
  return new Response(aTurtle(x, cabecera), {
    headers: { "Content-Type": TIPO_MIME.ttl, "Access-Control-Allow-Origin": "*" },
  });
}
