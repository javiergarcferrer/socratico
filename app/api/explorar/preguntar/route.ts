import { NextResponse } from "next/server";
import { Aviso, recuperar } from "@/lib/mcp";
import { recortar } from "@/lib/raiz";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * El modo «Preguntar» del banco de trabajo (la portada, `/`): la misma
 * recuperación sobre el grafo que la herramienta `retrieve` del servidor MCP
 * (`recuperar` en `lib/mcp.ts`, GraphRAG sin modelo): las entidades que la
 * pregunta nombra, con sus datos y sus aristas; la evidencia del índice; la
 * consulta de compras que pide, corrida de verdad. No genera la respuesta: la
 * evidencia, con su fuente y su fecha, es la respuesta, y el lector concluye.
 *
 * `?q=` (3 a 300 caracteres).
 */
export async function GET(req: Request) {
  const q = recortar(new URL(req.url).searchParams.get("q"), 300);
  if (q.length < 3) return NextResponse.json({ error: "Escribe la pregunta entera." }, { status: 400 });
  try {
    const r = await recuperar(q);
    return NextResponse.json(r, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (err) {
    if (err instanceof Aviso) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[api/explorar/preguntar]", err);
    return NextResponse.json({ error: "No se pudo recuperar la evidencia." }, { status: 502 });
  }
}
