import { NextResponse } from "next/server";
import { ErrorDeConsulta, consultarSql } from "@/lib/grafo-sql";
import { TABLAS_GENERADAS } from "@/lib/grafo-tablas";

export const dynamic = "force-dynamic";
// La primera consulta de una instancia carga las tablas (~0,2 s); cada una se corta a los 10 s.
export const maxDuration = 30;

/**
 * SQL de solo lectura sobre las tablas del grafo sin personas naturales
 * (`lib/grafo-sql.ts`; las tablas y sus columnas en `/tablas/meta.json`).
 * `GET ?q=SELECT …` o `POST {"q": "SELECT …"}`. Responde
 * `{columnas, filas, truncada, ms, generadas}`; un error de la consulta es un 400
 * con lo que hay que cambiar. Lo llama la herramienta `query` del servidor
 * MCP; cualquiera puede llamarlo: los datos son los mismos que se descargan.
 * El GET se cachea en la CDN mientras dure el despliegue: las tablas solo
 * cambian con uno.
 */

const CORS = { "Access-Control-Allow-Origin": "*" };

async function responder(q: unknown): Promise<Response> {
  if (typeof q !== "string" || !q.trim()) {
    return NextResponse.json({ error: "Falta la consulta: ?q=SELECT …" }, { status: 400, headers: CORS });
  }
  try {
    const r = await consultarSql(q);
    return NextResponse.json(
      { ...r, generadas: TABLAS_GENERADAS },
      { headers: { ...CORS, "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" } },
    );
  } catch (err) {
    if (err instanceof ErrorDeConsulta) return NextResponse.json({ error: err.message }, { status: 400, headers: CORS });
    // Solo el mensaje: nunca la consulta de quien pregunta.
    console.error(`[api/sql] ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json({ error: "El motor no pudo correr la consulta." }, { status: 502, headers: CORS });
  }
}

export async function GET(req: Request) {
  return responder(new URL(req.url).searchParams.get("q"));
}

export async function POST(req: Request) {
  const cuerpo = (await req.json().catch(() => null)) as { q?: unknown } | null;
  return responder(cuerpo?.q);
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { ...CORS, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "*" },
  });
}
