import { consultarSparql, descripcionDelServicio, elegirFormato, ErrorDeConsulta, revisar, serializarResultado } from "@/lib/sparql";

export const dynamic = "force-dynamic";
// La primera consulta de una instancia carga el volcado (~7,5 s); cada consulta se corta a los 10 s.
export const maxDuration = 60;

/**
 * Punto SPARQL 1.1 de solo lectura (protocolo W3C) sobre el grafo sin
 * personas naturales, con la ontología y sus formas SHACL en grafos con nombre
 * (`lib/sparql.ts`, docs/INFRAESTRUCTURA.md §7.12).
 *
 * - `GET ?query=…`, `POST` con `application/sparql-query` o con
 *   `application/x-www-form-urlencoded` (`query=…`).
 * - Formato por `Accept` o por `format=`: SPARQL Results JSON (por omisión),
 *   XML, CSV o TSV para SELECT y ASK; Turtle (por omisión), N-Triples o
 *   JSON-LD para CONSTRUCT y DESCRIBE.
 * - Sin consulta: la descripción del servicio (`sd:`) en Turtle; un navegador
 *   va al editor del banco de trabajo.
 * - 400 si la consulta no se admite (con lo que hay que cambiar), 406 si el
 *   formato no existe, 503 si el motor está ocupado, 502 si falla.
 * - El GET se guarda en la CDN mientras dure el despliegue: el volcado solo
 *   cambia con uno.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "Socratico-Truncada, Socratico-Ms",
};
const TOPE_BYTES = 4_400_000;
const CACHE_GET = "public, s-maxage=86400, stale-while-revalidate=86400";

function error(mensaje: string, estado: number): Response {
  return new Response(`${mensaje}\n`, {
    status: estado,
    headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...(estado === 503 ? { "Retry-After": "5" } : {}) },
  });
}

async function responder(consulta: string | null, req: Request, params: URLSearchParams, metodo: "GET" | "POST"): Promise<Response> {
  if (params.has("update")) return error("Solo lectura: este punto no admite actualizaciones.", 400);
  if (params.has("default-graph-uri") || params.has("named-graph-uri")) {
    return error("default-graph-uri y named-graph-uri no se admiten: usa FROM y FROM NAMED en la consulta, o GRAPH.", 400);
  }
  if (!consulta) {
    const accept = req.headers.get("accept") ?? "";
    if (metodo === "GET" && accept.includes("text/html")) {
      return new Response(null, { status: 303, headers: { Location: "/?seccion=sparql" } });
    }
    return new Response(descripcionDelServicio(), {
      headers: { ...CORS, "Content-Type": "text/turtle; charset=utf-8", "Cache-Control": CACHE_GET },
    });
  }
  try {
    const { tipo } = revisar(consulta);
    const formato = elegirFormato(tipo, params.get("format"), req.headers.get("accept"));
    const r = await consultarSparql(consulta);
    const { cuerpo, tipo: mime } = serializarResultado(r, formato);
    // Vercel no entrega una respuesta de más de 4,5 MB: el tope se mide sobre el cuerpo ya escrito, en cualquier formato.
    if (Buffer.byteLength(cuerpo) > TOPE_BYTES) {
      return error("El resultado pasa de 4 MB en este formato: pide menos columnas, agrega o pon un LIMIT.", 400);
    }
    return new Response(cuerpo, {
      headers: {
        ...CORS,
        "Content-Type": mime,
        "Cache-Control": metodo === "GET" ? CACHE_GET : "no-store",
        "Socratico-Truncada": "truncada" in r && r.truncada ? "1" : "0",
        "Socratico-Ms": String(r.ms),
        Vary: "Accept",
      },
    });
  } catch (err) {
    if (err instanceof ErrorDeConsulta) return error(err.message, err.estado);
    // Solo el mensaje: nunca la consulta de quien pregunta.
    console.error(`[sparql] ${err instanceof Error ? err.message : String(err)}`);
    return error("El motor no pudo correr la consulta.", 502);
  }
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  return responder(params.get("query"), req, params, "GET");
}

export async function POST(req: Request) {
  const params = new URL(req.url).searchParams;
  const tipo = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const texto = await req.text().catch(() => "");
  if (tipo === "application/sparql-query") return responder(texto, req, params, "POST");
  if (tipo === "application/x-www-form-urlencoded") {
    const cuerpo = new URLSearchParams(texto);
    for (const [k, v] of cuerpo) if (!params.has(k)) params.set(k, v);
    if (cuerpo.has("update")) return error("Solo lectura: este punto no admite actualizaciones.", 400);
    return responder(cuerpo.get("query"), req, params, "POST");
  }
  if (tipo === "application/sparql-update") return error("Solo lectura: este punto no admite actualizaciones.", 400);
  return error("POST con application/sparql-query o application/x-www-form-urlencoded (query=…).", 415);
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { ...CORS, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "*", "Access-Control-Max-Age": "86400" },
  });
}
