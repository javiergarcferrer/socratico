import { NextResponse } from "next/server";
import { inspeccionar } from "@/lib/explorar-nodo";

export const dynamic = "force-dynamic";

/**
 * Un nodo del grafo para el inspector del banco de trabajo (la portada, `/`): sus
 * datos, sus aristas por grupo y de qué fuente y corte sale cada triple
 * (`lib/explorar.ts`). `?ruta=` es la ruta de su ficha, como en `/api/grafo`.
 */
export async function GET(req: Request) {
  // Hasta 600: la ruta de un documento lleva la dirección entera de su archivo.
  const ruta = (new URL(req.url).searchParams.get("ruta") ?? "").slice(0, 600);
  if (!ruta.startsWith("/")) return NextResponse.json({ error: "Falta la ruta del nodo." }, { status: 400 });
  try {
    const r = await inspeccionar(ruta);
    if (!r) return NextResponse.json({ error: "Esa ruta no es un nodo del grafo." }, { status: 404 });
    return NextResponse.json(r, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (err) {
    console.error("[api/explorar/nodo]", err);
    return NextResponse.json({ error: "No se pudo leer el nodo." }, { status: 502 });
  }
}
