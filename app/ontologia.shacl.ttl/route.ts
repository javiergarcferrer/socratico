import { triplesFormas, VERSION } from "@/lib/ontologia";
import { aTurtle, TIPO_MIME } from "@/lib/rdf";

// Sale del código (`lib/ontologia.ts`): cambia solo con un despliegue.
export const dynamic = "force-static";

/**
 * Las formas SHACL de la ontología (`lib/ontologia.ts`): lo que tiene que
 * cumplir cada instancia del grafo. Para validar, el grafo de datos lleva
 * también la ontología (`/ontologia.ttl`): SHACL lee de él las subclases.
 */
export function GET() {
  const cabecera = `Formas SHACL de la ontología de Socrático.do, versión ${VERSION}.\nValidan el grafo de datos unido con /ontologia.ttl.\nHerramienta independiente y no oficial sobre datos del Estado dominicano.`;
  return new Response(aTurtle(triplesFormas(), cabecera), {
    headers: { "Content-Type": TIPO_MIME.ttl, "Access-Control-Allow-Origin": "*" },
  });
}
