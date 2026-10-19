import { NextResponse } from "next/server";
import { vivoDelNodo } from "@/lib/explorar-vivo";

export const dynamic = "force-dynamic";

/**
 * Lo que la fuente dice ahora de un nodo del banco de trabajo (`/explorar`):
 * los procesos abiertos de una institución, la etapa y los contratos de un
 * proceso, la condición de una iniciativa (`lib/explorar-vivo.ts`). Aparte de
 * `/api/explorar/nodo` porque su ventana es otra: el grafo cambia con un
 * despliegue; esto, cada cinco minutos.
 *
 * `?ruta=` es la ruta de la ficha. Responde `{ vivo, sinFuente }`: `sinFuente`
 * si ese tipo de nodo no tiene fuente en vivo; `vivo: null` sin `sinFuente`,
 * con 502, si la fuente no contestó.
 */
export async function GET(req: Request) {
  // Hasta 600: la ruta de un documento lleva la dirección entera de su archivo.
  const ruta = (new URL(req.url).searchParams.get("ruta") ?? "").slice(0, 600);
  if (!ruta.startsWith("/")) return NextResponse.json({ error: "Falta la ruta del nodo." }, { status: 400 });
  const r = await vivoDelNodo(ruta);
  if (!r.vivo && !r.sinFuente) {
    return NextResponse.json({ error: "La fuente no contestó. Lo que dice el grafo sigue en pie." }, { status: 502 });
  }
  return NextResponse.json(r, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
