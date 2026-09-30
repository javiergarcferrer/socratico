import { triplesOntologia } from "@/lib/ontologia";
import { aNTriples, TIPO_MIME } from "@/lib/rdf";

// Sale del código (`lib/ontologia.ts`): cambia solo con un despliegue.
export const dynamic = "force-static";

/** La ontología en N-Triples (`lib/ontologia.ts`), una línea por triple; la página en llano está en `/ontologia`. */
export function GET() {
  return new Response(aNTriples(triplesOntologia()), {
    headers: { "Content-Type": TIPO_MIME.nt, "Access-Control-Allow-Origin": "*" },
  });
}
