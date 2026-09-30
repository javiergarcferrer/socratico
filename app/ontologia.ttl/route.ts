import { triplesOntologia, VERSION } from "@/lib/ontologia";
import { aTurtle, TIPO_MIME } from "@/lib/rdf";

// Sale del código (`lib/ontologia.ts`): cambia solo con un despliegue.
export const dynamic = "force-static";

/** La ontología en Turtle (`lib/ontologia.ts`); la página en llano está en `/ontologia`. */
export function GET() {
  const cabecera = `Ontología de Socrático.do, versión ${VERSION}.\nHerramienta independiente y no oficial sobre datos del Estado dominicano.`;
  return new Response(aTurtle(triplesOntologia(), cabecera), {
    headers: { "Content-Type": TIPO_MIME.ttl, "Access-Control-Allow-Origin": "*" },
  });
}
