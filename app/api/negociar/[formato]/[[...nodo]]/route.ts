// Cada respuesta depende de la petición (la ruta y su `Accept`): nada que prerenderizar.
export const dynamic = "force-dynamic";

const FORMATOS_NODO = new Set(["ttl", "jsonld", "nt", "trig", "nq"]);
const FORMATOS_ONTOLOGIA = new Set(["ttl", "jsonld", "nt"]);

/** El 303 de la negociación, con lo que lo hace seguro en una caché: varía por `Accept`. */
function verOtra(destino: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: destino,
      Vary: "Accept",
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * La negociación de contenido del grafo (docs/INFRAESTRUCTURA.md §7.3): aquí
 * llegan, por `rewrites()` de `next.config.ts`, quien pide una ficha de nodo
 * (`/api/negociar/<formato>/<ruta de la ficha>`) o `/ontologia`
 * (`/api/negociar/<formato>`) con un `Accept` RDF, y todo `/def/core` y
 * `/def/do` (`pagina` sin formato RDF). Responde el 303 a la descripción
 * (`/api/grafo`), al archivo de la ontología o a su página. Van en la ruta y
 * no en la consulta: un manejador no ve la consulta que añade una
 * reescritura. El destino se arma con un prefijo fijo: no es una redirección
 * abierta.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ formato: string; nodo?: string[] }> }) {
  const { formato, nodo } = await params;
  if (nodo?.length) {
    const ruta = "/" + nodo.join("/");
    if (!/^\/[^\u0000-\u001f?#]{1,600}$/.test(ruta) || !FORMATOS_NODO.has(formato)) return new Response("Petición no válida", { status: 400 });
    return verOtra(`/api/grafo?nodo=${encodeURIComponent(ruta).replace(/%2F/g, "/")}&formato=${formato}`);
  }
  if (formato === "pagina") return verOtra("/ontologia");
  if (FORMATOS_ONTOLOGIA.has(formato)) return verOtra(`/ontologia.${formato}`);
  return new Response("Petición no válida", { status: 400 });
}
