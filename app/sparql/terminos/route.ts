import { CLASES, PROPIEDADES, curie, esquemas } from "@/lib/ontologia";
import { PREFIJOS } from "@/lib/rdf";

// Sale del código (`lib/ontologia.ts`): cambia solo con un despliegue.
export const dynamic = "force-static";

/**
 * Lo que el editor de SPARQL del banco de trabajo (`components/sparql/`)
 * autocompleta: los prefijos declarados y cada clase, propiedad y concepto de
 * la ontología con su etiqueta. Aparte de la página porque `lib/ontologia.ts`
 * no viaja al navegador (arrastra las instituciones).
 */
export function GET() {
  const terminos = [
    ...CLASES.map((c) => ({ curie: curie(c), etiqueta: c.etiqueta, tipo: "clase" as const })),
    ...PROPIEDADES.map((p) => ({ curie: curie(p), etiqueta: p.etiqueta, tipo: "propiedad" as const })),
    ...esquemas().flatMap((e) => e.conceptos.map((c) => ({ curie: `${e.modulo ?? "soc"}:${c.id}`, etiqueta: c.etiqueta, tipo: "concepto" as const }))),
  ];
  return Response.json({ prefijos: PREFIJOS, terminos }, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
}
