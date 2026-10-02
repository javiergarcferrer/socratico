// Edge Function `metricas-uso` — el uso de la plataforma para quien la lleva
// (docs/INFRAESTRUCTURA.md §10.12). Lee Vercel Web Analytics con un token que
// vive solo aquí, como secreto de función: no pasa por Vercel ni por el
// navegador, y las superficies de inteligencia siguen sin secretos.
//
// Entrada (POST, sin cuerpo) con la sesión en `Authorization: Bearer <jwt>`.
// Solo contesta cifras a un correo **verificado** que esté en METRICAS_CORREOS
// (secreto de función, separado por comas). El correo se lee de Auth con
// `auth.getUser`, no del claim del JWT.
// Salida: { ok: true, autorizado: true, … } o { ok: false, error, autorizado? }.
// `autorizado` va solo cuando quien pregunta está en la lista: a nadie más la
// pantalla le pinta nada, ni siquiera un fallo.
//
// Despliegue y secretos (VERCEL_TOKEN, METRICAS_CORREOS): acciones del dueño,
// en docs/INFRAESTRUCTURA.md §10.12. Como `vincular-cuenta-unica`, va con
// `verify_jwt = false` (supabase/config.toml): la sesión se comprueba aquí.

import { createClient } from "npm:@supabase/supabase-js@2";
import { inicioDeDia, leerAgregado, leerConteo, leerDias, urlAgregado, urlConteo } from "./normalizar.ts";

const TOKEN = Deno.env.get("VERCEL_TOKEN") ?? "";
const CORREOS = new Set(
  (Deno.env.get("METRICAS_CORREOS") ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean),
);
/** El plan Hobby guarda un mes: treinta días, contando hoy. */
const DIAS = 30;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

const fallo = (error: string, status: number) => json({ ok: false, error }, status);

/** Lo que Vercel contestó, dicho como uno de los fallos que la pantalla conoce. */
class FalloVercel extends Error {
  constructor(readonly codigo: "sin_datos" | "token_rechazado" | "vercel_rechazo" | "vercel_caida" | "forma") {
    super(codigo);
  }
}

async function pedir(url: string): Promise<unknown> {
  let r: Response;
  try {
    r = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new FalloVercel("vercel_caida");
  }
  // 404 «Web Analytics not found», medido contra la API el 2026-10-02 antes
  // de la primera visita. También lo daría un proyecto que no es este o
  // Web Analytics apagado: la pantalla nombra las causas.
  if (r.status === 404) throw new FalloVercel("sin_datos");
  if (r.status === 401 || r.status === 403) throw new FalloVercel("token_rechazado");
  if (!r.ok) {
    console.error(`[metricas-uso] vercel ${r.status}`);
    // Un 4xx es una respuesta (el plan, un límite, la consulta): no una caída.
    throw new FalloVercel(r.status < 500 ? "vercel_rechazo" : "vercel_caida");
  }
  try {
    return await r.json();
  } catch {
    throw new FalloVercel("forma");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fallo("metodo", 405);

  // 1. Quién llama: la sesión de Supabase (clave publicable + su JWT).
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return fallo("sesion_requerida", 401);
  const comoUsuario = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: sesion, error: errUsuario } = await comoUsuario.auth.getUser(auth.slice(7));
  if (errUsuario || !sesion.user) return fallo("sesion_requerida", 401);

  // 2. Si puede verlo: correo confirmado y en la lista. Nada más se le dice a quien no.
  const { email, email_confirmed_at } = sesion.user;
  const correo = email && email_confirmed_at ? email.toLowerCase() : "";
  if (!correo || !CORREOS.has(correo)) return fallo("sin_permiso", 403);

  // 3. Desde aquí quien pregunta lleva la plataforma: cada fallo se le dice.
  const paraElDueno = (error: string, status: number) => json({ ok: false, autorizado: true, error }, status);
  if (!TOKEN) return paraElDueno("token_no_configurado", 503);

  const ahora = new Date();
  const mes = inicioDeDia(ahora, DIAS - 1);
  const semana = inicioDeDia(ahora, 6);
  try {
    const [m, s, d, rutas, referentes, paises] = await Promise.all([
      pedir(urlConteo(mes, ahora)),
      pedir(urlConteo(semana, ahora)),
      pedir(urlAgregado("day", mes, ahora, DIAS + 1)),
      pedir(urlAgregado("requestPath", mes, ahora, 10)),
      pedir(urlAgregado("referrerHostname", mes, ahora, 8)),
      pedir(urlAgregado("country", mes, ahora, 8)),
    ]);
    const leido = {
      mes: leerConteo(m),
      semana: leerConteo(s),
      dias: leerDias(d, mes, DIAS),
      rutas: leerAgregado(rutas, "requestPath"),
      referentes: leerAgregado(referentes, "referrerHostname"),
      paises: leerAgregado(paises, "country"),
    };
    const roto = Object.entries(leido).find(([, v]) => v === null);
    if (roto) {
      console.error(`[metricas-uso] forma inesperada en ${roto[0]}`);
      return paraElDueno("forma", 502);
    }
    return json({
      ok: true,
      autorizado: true,
      desde: mes.toISOString().slice(0, 10),
      hasta: ahora.toISOString().slice(0, 10),
      consultado: ahora.toISOString(),
      ...leido,
    });
  } catch (e) {
    const codigo = e instanceof FalloVercel ? e.codigo : "vercel_caida";
    return paraElDueno(codigo, codigo === "sin_datos" ? 404 : 502);
  }
});
