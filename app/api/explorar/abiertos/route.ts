import { NextResponse } from "next/server";
import { abiertosAhora } from "@/lib/explorar-vivo";

export const dynamic = "force-dynamic";

/**
 * Lo abierto a ofertas en todo el Estado ahora (`abiertosAhora`,
 * `lib/explorar-vivo.ts`): la cuenta de la DGCP y los publicados más
 * recientes, para el tablero de la portada (`/`). Ventana de cinco minutos, la del
 * adaptador; 502 si la DGCP no contesta.
 */
export async function GET() {
  try {
    return NextResponse.json(await abiertosAhora(), {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (err) {
    console.error("[api/explorar/abiertos]", err);
    return NextResponse.json({ error: "La DGCP no contestó. El grafo sigue en pie." }, { status: 502 });
  }
}
