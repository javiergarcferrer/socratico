import { NextResponse } from "next/server";
import { fuentesDelGrafo } from "@/lib/explorar-nodo";

export const dynamic = "force-dynamic";

/**
 * Las fuentes del grafo con lo que aporta cada una (`fuentesDelGrafo`,
 * `lib/explorar-nodo.ts`): para la sección «Fuentes» del banco y las fuentes
 * de cada clase en el recorrido de la ontología. Se pide al abrir esas
 * secciones, no viaja con la portada. Solo cambia con un despliegue: la CDN la
 * guarda un día.
 */
export async function GET() {
  try {
    const fuentes = await fuentesDelGrafo();
    if (!fuentes) return NextResponse.json({ error: "El grafo compilado no trae lo que aporta cada fuente." }, { status: 502 });
    return NextResponse.json(fuentes, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" },
    });
  } catch (err) {
    console.error("[api/explorar/fuentes]", err);
    return NextResponse.json({ error: "No se pudieron leer las fuentes del grafo." }, { status: 502 });
  }
}
