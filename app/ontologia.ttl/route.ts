import { triplesOntologia, VERSION } from "@/lib/ontologia";
import { aTurtle, TIPO_MIME } from "@/lib/rdf";

export const dynamic = "force-static";
export const revalidate = 86400;

/** La ontología en Turtle (`lib/ontologia.ts`); la página en llano está en `/ontologia`. */
export function GET() {
  const cabecera = `Ontología de Socrático.do, versión ${VERSION}.\nHerramienta independiente y no oficial sobre datos del Estado dominicano.`;
  return new Response(aTurtle(triplesOntologia(), cabecera), {
    headers: { "Content-Type": TIPO_MIME.ttl, "Access-Control-Allow-Origin": "*" },
  });
}
