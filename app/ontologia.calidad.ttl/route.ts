import { INFORME, triplesInforme } from "@/lib/grafo-informe";
import { aTurtle, TIPO_MIME } from "@/lib/rdf";

// Sale de `datos/grafo/informe-shacl.json`, que el gate exige al día: cambia solo con un despliegue.
export const dynamic = "force-static";

/**
 * El informe de la validación SHACL del grafo como `sh:ValidationReport`
 * (`lib/grafo-informe.ts`): conforme o no, cada forma con los nodos que
 * validó y sus violaciones, y la huella de lo validado. Su vista en llano:
 * `/ontologia/calidad`.
 */
export function GET() {
  const cabecera = `Informe de validación SHACL del grafo de Socrático.do (grafo compilado el ${INFORME.grafo}, huella sha256:${INFORME.huella}).\nLo produce el gate del repositorio (scripts/validar-grafo.mjs) y no se publica si difiere de lo validado.\nHerramienta independiente y no oficial sobre datos del Estado dominicano.`;
  return new Response(aTurtle(triplesInforme(), cabecera), {
    headers: { "Content-Type": TIPO_MIME.ttl, "Access-Control-Allow-Origin": "*" },
  });
}
