import type { MetadataRoute } from "next";
import { SITIO } from "@/lib/sitio";

export default function robots(): MetadataRoute.Robots {
  return {
    // Las descargas CSV leen la DGCP o el SIL enteros en cada petición: un
    // rastreador que siga sus enlaces no debe dispararlas. La vista de un
    // nodo del grafo repite su ficha y cada camino es una búsqueda: se
    // rastrea la portada del grafo, no sus consultas.
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/*/csv", "/grafo?", "/grafo/camino"] },
    sitemap: `${SITIO}/sitemap.xml`,
  };
}
