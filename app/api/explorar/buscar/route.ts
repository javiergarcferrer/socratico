import { NextResponse } from "next/server";
import { MAX_PAGINAS, esFaceta, explorar } from "@/lib/explorar";
import { recortar } from "@/lib/raiz";

export const dynamic = "force-dynamic";

/**
 * La búsqueda del banco de trabajo (`/explorar`): lo tecleado en todas las
 * clases del grafo y en el índice a la vez, con las facetas contadas
 * (`lib/explorar.ts`). El índice, el padrón y el grafo compilado no viajan al
 * navegador; aquí se busca y salen las filas.
 *
 * `?q=` (2 a 120 caracteres), `?faceta=` (allowlist de `esFaceta`) y
 * `?pagina=` (1 a `MAX_PAGINAS`).
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = recortar(params.get("q"), 120);
  const faceta = params.get("faceta");
  if (faceta !== null && !esFaceta(faceta)) return NextResponse.json({ error: "Esa clase del grafo no existe." }, { status: 400 });
  const pagina = Math.min(MAX_PAGINAS, Math.max(1, Number.parseInt(params.get("pagina") ?? "1", 10) || 1));
  if (q.length < 2) return NextResponse.json({ error: "Escribe al menos dos letras." }, { status: 400 });
  try {
    const r = await explorar(q, faceta, pagina);
    if (!r) return NextResponse.json({ error: "El índice de búsqueda no cargó. Intenta de nuevo en un momento." }, { status: 502 });
    return NextResponse.json(r, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (err) {
    console.error("[api/explorar/buscar]", err);
    return NextResponse.json({ error: "No se pudo buscar en el grafo." }, { status: 502 });
  }
}
