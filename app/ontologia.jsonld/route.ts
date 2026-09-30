import { triplesOntologia } from "@/lib/ontologia";
import { aJsonLd, TIPO_MIME } from "@/lib/rdf";

export const dynamic = "force-static";
export const revalidate = 86400;

/** La ontología en JSON-LD (`lib/ontologia.ts`); la página en llano está en `/ontologia`. */
export function GET() {
  return new Response(JSON.stringify(aJsonLd(triplesOntologia()), null, 2), {
    headers: { "Content-Type": TIPO_MIME.jsonld, "Access-Control-Allow-Origin": "*" },
  });
}
