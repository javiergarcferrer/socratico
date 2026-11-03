import { NextResponse } from "next/server";
import { enlace, nodoDeRuta, rutaDeNodo } from "@/lib/grafo";
import { CLASE_DE_TIPO, TOPE_CAMINO, camino, vecindario, type Paso } from "@/lib/grafo-rdf";
import type { CaminoVisto, PasoVisto } from "@/lib/explorar-tipos";

export const dynamic = "force-dynamic";
// Abrir hasta 300 fichas puede tomar varios segundos la primera vez; luego el par queda en caché.
export const maxDuration = 60;

const visto = (p: Paso): PasoVisto => ({
  ruta: rutaDeNodo(p.nodo),
  nombre: p.nombre,
  tipo: p.nodo.tipo,
  clase: CLASE_DE_TIPO[p.nodo.tipo],
  via: p.via,
  arista: p.arista,
});

/**
 * El camino entre dos nodos del grafo para el lienzo del banco de trabajo
 * (`lib/grafo-rdf.ts`, `camino`, docs/INFRAESTRUCTURA.md §7.6): el más corto y
 * hasta tres alternos con aristas disjuntas, cada salto con su verbo, su
 * fuente y su corte. `?de=` y `?a=` son las rutas de las dos fichas, como en
 * `/grafo/camino`, que es la misma búsqueda en una página.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  // Hasta 600: la ruta de un documento lleva la dirección entera de su archivo.
  const nDe = nodoDeRuta((params.get("de") ?? "").slice(0, 600));
  const nA = nodoDeRuta((params.get("a") ?? "").slice(0, 600));
  if (!nDe || !nA) return NextResponse.json({ error: "de y a: las rutas de dos nodos del grafo." }, { status: 400 });
  try {
    const [vDe, vA] = await Promise.all([vecindario(nDe), vecindario(nA)]);
    if (!vDe || !vA) return NextResponse.json({ error: "Alguna de las dos rutas no es un nodo del grafo." }, { status: 404 });
    const r = await camino(vDe.nodo, vA.nodo);
    const cuerpo: CaminoVisto = {
      de: { ruta: rutaDeNodo(vDe.nodo), titulo: vDe.titulo },
      a: { ruta: rutaDeNodo(vA.nodo), titulo: vA.titulo },
      caminos: r.pasos ? [r.pasos, ...r.alternos].map((c) => c.map(visto)) : [],
      motivo: r.motivo,
      exploradas: r.exploradas,
      exploradasConAlternos: r.exploradasConAlternos,
      tope: { ...TOPE_CAMINO },
      pagina: enlace.caminoGrafo(rutaDeNodo(vDe.nodo), rutaDeNodo(vA.nodo)),
    };
    return NextResponse.json(cuerpo, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" } });
  } catch (err) {
    console.error("[api/grafo/camino]", err);
    return NextResponse.json({ error: "No se pudo buscar el camino." }, { status: 502 });
  }
}
