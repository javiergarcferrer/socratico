import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { enlace, rutaDeNodo, type NodoRdf } from "@/lib/grafo";
import { schemaOrgDe } from "@/lib/grafo-ld";
import type { Empresa } from "@/lib/empresas";

/**
 * El pie de una ficha que es un nodo del grafo (docs/INFRAESTRUCTURA.md
 * §7): su descripción en schema.org incrustada como JSON-LD
 * —lo que leen los buscadores; sale de los mismos triples que `/api/grafo`,
 * en su forma ligera, ya compilada (`lib/grafo-ld.ts`)— y el camino a su red
 * en el explorador y a su RDF. La ficha de una empresa pasa la fila del
 * padrón que ya leyó: la mayoría no está en el compilado y sale de ella.
 *
 * Una ficha que lee su fuente en vivo (un proceso de compra, un proveedor)
 * puede no ser un nodo: si el compilado no la trae, no se pinta nada, ni un
 * enlace a un nodo que el explorador no encontraría.
 *
 * Componente de servidor: lee el compilado, no las instantáneas.
 */
export async function EnElGrafo({ nodo, empresa, className }: { nodo: NodoRdf; empresa?: Empresa; className?: string }) {
  const ld = await schemaOrgDe(nodo, empresa);
  if (!ld) return null;
  const ruta = rutaDeNodo(nodo);
  return (
    <>
      <script
        type="application/ld+json"
        // `<` escapado: un nombre del Estado no puede cerrar el script.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }}
      />
      <section aria-labelledby="en-el-grafo" className={cn("border-t border-hairline pt-4", className)}>
        <h2 id="en-el-grafo" className="text-sm font-bold text-ink">
          En el grafo
        </h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-soft">
          Esta ficha es un nodo: los registros del Estado la ligan con otras —personas, instituciones, empresas,
          compras, obras, decretos, leyes, iniciativas, documentos, datos, lugares—. Su red dibuja esas aristas y busca el camino
          hacia otra ficha.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* `nofollow`: la vista de un nodo repite la ficha y robots.txt no la deja rastrear. */}
          <Button asChild variant="secondary">
            <Link href={enlace.grafo(ruta)} rel="nofollow">
              Ver con quién se liga
            </Link>
          </Button>
          <p className="text-xs text-ink-soft">
            Para máquinas:{" "}
            <a href={enlace.rdf(ruta, "ttl")} rel="nofollow" className="inline-flex min-h-11 items-center text-brand-700 underline sm:min-h-0">
              Turtle
            </a>
            {" · "}
            <a href={enlace.rdf(ruta, "jsonld")} rel="nofollow" className="inline-flex min-h-11 items-center text-brand-700 underline sm:min-h-0">
              JSON-LD
            </a>
            {" · "}
            <a href={enlace.rdf(ruta, "trig")} rel="nofollow" className="inline-flex min-h-11 items-center text-brand-700 underline sm:min-h-0">
              TriG, con la fuente de cada dato
            </a>
            {" · "}
            <Link href="/ontologia" className="inline-flex min-h-11 items-center text-brand-700 underline sm:min-h-0">
              la ontología
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}

/** Los `<link rel="alternate">` de la ficha hacia su RDF, para `metadata.alternates.types`. */
export function alternasRdf(nodo: NodoRdf): Record<string, string> {
  const ruta = rutaDeNodo(nodo);
  return {
    "text/turtle": enlace.rdf(ruta, "ttl"),
    "application/ld+json": enlace.rdf(ruta, "jsonld"),
    "application/n-triples": enlace.rdf(ruta, "nt"),
    "application/trig": enlace.rdf(ruta, "trig"),
    "application/n-quads": enlace.rdf(ruta, "nq"),
  };
}
