import { NextResponse } from "next/server";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { conOrigen, servidorMcp } from "@/lib/mcp";
import { SITIO } from "@/lib/sitio";

/**
 * El servidor MCP de Socrático.do (`lib/mcp.ts`): la dirección que se pega en
 * Claude, ChatGPT o cualquier cliente del Model Context Protocol. HTTP
 * «streamable» sin sesión: sirve la revisión 2026-07-28 del protocolo y, para
 * los clientes de 2025 (`initialize`), un servidor nuevo por pedido; un GET de
 * esos clientes recibe 405, que el protocolo prevé. Sin clave ni cuenta: los
 * datos son los mismos que la plataforma publica.
 *
 * Quien abre la dirección en un navegador (pide HTML) va a `/conectar`, que
 * explica cómo conectarlo. CORS abierto, como `/api/grafo`: no hay cookies ni
 * credenciales que proteger, y así lo puede leer un cliente que corre en una
 * página web.
 */

export const dynamic = "force-dynamic";
// `path` puede abrir hasta 300 fichas en frío; `query` espera a `/api/sql` hasta 25 s.
export const maxDuration = 60;

const manejador = createMcpHandler(() => servidorMcp(), {
  // Solo el mensaje: nunca la consulta de quien pregunta.
  onerror: (err) => console.error(`[mcp] ${err.message}`),
});

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

/**
 * El despliegue que atiende: `query` llama a `/api/sql` en él, para que una
 * vista previa consulte sus propias tablas. Solo los de este proyecto o el
 * propio equipo; cualquier otro, la dirección de producción.
 */
function origenDe(req: Request): string {
  const u = new URL(req.url);
  const propio =
    u.origin === SITIO ||
    ((u.hostname === "localhost" || u.hostname === "127.0.0.1") && u.protocol === "http:") ||
    (u.protocol === "https:" && u.hostname.startsWith("socratico") && u.hostname.endsWith(".vercel.app"));
  return propio ? u.origin : SITIO;
}

async function atender(req: Request): Promise<Response> {
  const res = await conOrigen(origenDe(req), () => manejador.fetch(req));
  const salida = new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
  for (const [k, v] of Object.entries(CORS)) salida.headers.set(k, v);
  salida.headers.set("Cache-Control", "no-store");
  return salida;
}

export async function POST(req: Request) {
  return atender(req);
}

export async function GET(req: Request) {
  if ((req.headers.get("accept") ?? "").includes("text/html")) {
    return NextResponse.redirect(new URL("/conectar", req.url), 303);
  }
  return atender(req);
}

export async function DELETE(req: Request) {
  return atender(req);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
