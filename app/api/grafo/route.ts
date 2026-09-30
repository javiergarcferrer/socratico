import { NextResponse } from "next/server";
import { describir } from "@/lib/grafo-rdf";
import { nodoDeRuta } from "@/lib/grafo";
import { SITIO } from "@/lib/sitio";
import { TIPO_MIME, serializar, type FormatoRdf } from "@/lib/rdf";

export const dynamic = "force-dynamic";

const FORMATOS: readonly FormatoRdf[] = ["ttl", "jsonld", "nt"];

/**
 * La descripción RDF de un nodo del grafo (`lib/grafo-rdf.ts`): lo que dice
 * su ficha, en Turtle, JSON-LD o N-Triples, con los vocabularios de la
 * ontología (`/ontologia`). Es también lo que devuelve la ficha misma cuando
 * se la pide con `Accept: text/turtle` (el middleware reescribe aquí).
 *
 * `?nodo=` es la ruta de la ficha (`/funcionarios/luis-rodolfo-abinader-corona`,
 * `/instituciones/5`, `/banca/banreservas`, `/empresas/401010062`,
 * `/normativa/decreto/641-26`, `/provincias/santo-domingo`) y `?formato=`
 * uno de `ttl` (por defecto), `jsonld` o `nt`.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const ruta = (params.get("nodo") ?? "").slice(0, 200);
  const formato = (params.get("formato") ?? "ttl") as FormatoRdf;
  if (!FORMATOS.includes(formato)) {
    return NextResponse.json({ error: "formato: ttl, jsonld o nt" }, { status: 400 });
  }
  const nodo = nodoDeRuta(ruta);
  if (!nodo) return NextResponse.json({ error: "esa ruta no es un nodo del grafo" }, { status: 400 });
  try {
    const d = await describir(nodo);
    if (!d) return NextResponse.json({ error: "no existe ese nodo" }, { status: 404 });
    const cabecera = `${d.titulo}\nDescrito por Socrático.do (herramienta independiente y no oficial) a partir de lo que publica el Estado.\nFicha: ${SITIO}${ruta}\nOntología: ${SITIO}/ontologia`;
    return new NextResponse(serializar(d.triples, formato, cabecera), {
      headers: {
        "Content-Type": TIPO_MIME[formato],
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
        Link: `<${SITIO}${ruta}>; rel="canonical", <${SITIO}/ontologia>; rel="describedby"`,
      },
    });
  } catch (err) {
    console.error("[api/grafo]", err);
    return NextResponse.json({ error: "no se pudo describir el nodo" }, { status: 502 });
  }
}
