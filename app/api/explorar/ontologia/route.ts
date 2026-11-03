import { NextResponse } from "next/server";
import { ontologiaDelGrafo, pulsoDelGrafo } from "@/lib/explorar-nodo";
import { metaGrafo } from "@/lib/grafo-compilado";

export const dynamic = "force-dynamic";

/**
 * La ontología, compacta, para el recorrido de clases del banco
 * (`ontologiaDelGrafo`, `lib/explorar-nodo.ts`): cada clase con su padre y
 * sus nodos en el compilado y la completitud de su forma, cada propiedad con
 * su dominio, su rango y su uso en el grafo (`calidad` de `meta.json`). Se
 * pide al abrir la sección, no viaja con la portada. Solo cambia con un
 * despliegue: la CDN la guarda un día.
 */
export async function GET() {
  try {
    const [pulso, meta] = await Promise.all([pulsoDelGrafo().catch(() => null), metaGrafo().catch(() => null)]);
    return NextResponse.json(ontologiaDelGrafo(pulso, meta), {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" },
    });
  } catch (err) {
    console.error("[api/explorar/ontologia]", err);
    return NextResponse.json({ error: "No se pudo leer la ontología." }, { status: 502 });
  }
}
