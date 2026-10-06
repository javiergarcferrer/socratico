import { NextResponse } from "next/server";
import { cuadruplesDe, describir } from "@/lib/grafo-rdf";
import { nodoDeRuta, rutaDeNodo } from "@/lib/grafo";
import { SITIO } from "@/lib/sitio";
import { TIPO_MIME, serializar, type FormatoRdf } from "@/lib/rdf";

export const dynamic = "force-dynamic";

const FORMATOS: readonly FormatoRdf[] = ["ttl", "jsonld", "nt", "trig", "nq"];

/**
 * La descripción RDF de un nodo del grafo (`lib/grafo-rdf.ts`): lo que dice
 * su ficha, en Turtle, JSON-LD o N-Triples, con los vocabularios de la
 * ontología (`/ontologia`). Es también adonde remite la ficha misma cuando se
 * la pide con `Accept: text/turtle` (un 303 de `redirects()` en `next.config.ts`).
 *
 * `?nodo=` es la ruta de la ficha (`/funcionarios/luis-rodolfo-abinader-corona`,
 * `/instituciones/5`, `/banca/banreservas`, `/empresas/401010062`,
 * `/normativa/decreto/641-26`, `/provincias/santo-domingo`) y `?formato=`
 * uno de `ttl` (por defecto), `jsonld` o `nt`; `trig` y `nq` llevan además el
 * grafo con nombre de cada triple —de qué fuente y corte, o de qué regla— y lo
 * que se dice de cada grafo en PROV-O (docs/INFRAESTRUCTURA.md §7).
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  // La ruta de la ficha o su IRI entero (`void:uriLookupEndpoint` le pega el IRI).
  // Hasta 600: la ruta de un documento lleva la dirección entera de su archivo.
  const pedido = (params.get("nodo") ?? "").slice(0, 700);
  const ruta = (pedido.startsWith(SITIO + "/") ? pedido.slice(SITIO.length) : pedido).slice(0, 600);
  const formato = (params.get("formato") ?? "ttl") as FormatoRdf;
  if (!FORMATOS.includes(formato)) {
    return NextResponse.json({ error: "formato: ttl, jsonld, nt, trig o nq" }, { status: 400 });
  }
  const nodo = nodoDeRuta(ruta);
  if (!nodo) return NextResponse.json({ error: "esa ruta no es un nodo del grafo" }, { status: 400 });
  try {
    const d = await describir(nodo);
    if (!d) return NextResponse.json({ error: "no existe ese nodo" }, { status: 404 });
    const cabecera = [
      d.titulo,
      "Descrito por Socrático.do (herramienta independiente y no oficial) a partir de lo que publica el Estado.",
      `Ficha: ${SITIO}${rutaDeNodo(nodo)}`,
      `Ontología: ${SITIO}/ontologia`,
      ...(d.nota ? [d.nota] : []),
    ].join("\n");
    const triples = formato === "trig" || formato === "nq" ? await cuadruplesDe(d) : d.triples;
    return new NextResponse(serializar(triples, formato, cabecera), {
      headers: {
        "Content-Type": TIPO_MIME[formato],
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
        Link: `<${SITIO}${rutaDeNodo(nodo)}>; rel="canonical", <${SITIO}/ontologia>; rel="describedby"`,
      },
    });
  } catch (err) {
    console.error("[api/grafo]", err);
    return NextResponse.json({ error: "no se pudo describir el nodo" }, { status: 502 });
  }
}
