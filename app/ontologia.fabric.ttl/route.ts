import { triplesFabric, VERSION } from "@/lib/ontologia";
import { aTurtle, TIPO_MIME } from "@/lib/rdf";

// Sale del código (`lib/ontologia.ts`): cambia solo con un despliegue.
export const dynamic = "force-static";

/**
 * El perfil de la ontología para Microsoft Fabric IQ (`triplesFabric` en
 * `lib/ontologia.ts`): tipos de entidad con un solo padre, propiedades y
 * relaciones de un dominio y un rango, sin lo que su importador no
 * representa. Se importa en un ítem de ontología vacío.
 */
export function GET() {
  const cabecera = `Ontología de Socrático.do, versión ${VERSION}, perfil para Microsoft Fabric IQ.\nImportar en un ítem de ontología vacío («import from RDF/OWL»).\nHerramienta independiente y no oficial sobre datos del Estado dominicano.`;
  return new Response(aTurtle(triplesFabric(), cabecera), {
    headers: { "Content-Type": TIPO_MIME.ttl, "Access-Control-Allow-Origin": "*" },
  });
}
