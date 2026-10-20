import { NextResponse } from "next/server";
import { ontologiaDelGrafo, pulsoDelGrafo } from "@/lib/explorar-nodo";

export const dynamic = "force-dynamic";

/**
 * La ontología, compacta, para el recorrido de clases del banco
 * (`ontologiaDelGrafo`, `lib/explorar-nodo.ts`): cada clase con su padre y
 * sus nodos en el compilado, cada propiedad con su dominio y su rango. Se
 * pide al abrir la sección, no viaja con la portada. Solo cambia con un
 * despliegue: la CDN la guarda un día.
 */
export async function GET() {
  try {
    const pulso = await pulsoDelGrafo().catch(() => null);
    return NextResponse.json(ontologiaDelGrafo(pulso), {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" },
    });
  } catch (err) {
    console.error("[api/explorar/ontologia]", err);
    return NextResponse.json({ error: "No se pudo leer la ontología." }, { status: 502 });
  }
}
