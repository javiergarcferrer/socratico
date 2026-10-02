// Edge Function `vincular-cuenta-unica` — la frontera de confianza de la
// identidad v2 (docs/INFRAESTRUCTURA.md §10). Corre dentro de Supabase, como el
// pepper: aquí viven la verificación criptográfica del ID token de Cuenta
// Única y la clave de servicio, que jamás pasan por Vercel ni por el navegador.
//
// Entrada (POST, JSON): { id_token } con la sesión del votante en
// `Authorization: Bearer <jwt de Supabase>`. El `nonce` del ID token debe ser
// el hash del id de ese votante (misma fórmula que `nonceDeSesion` en
// app/democracia/cuenta-unica/cliente.ts): un ID token robado no sirve con
// otra sesión.
// Salida: el JSON de `democracia.vincular_identidad`, o { ok:false, error }.
//
// Despliegue y configuración: acciones del dueño, en docs/INFRAESTRUCTURA.md §10
// (la función se despliega sin verificación de JWT en la puerta de enlace,
// porque la sesión se comprueba aquí con `auth.getUser`, que acepta las claves
// publicables nuevas; y necesita el secreto de función CUENTA_UNICA_CLIENT_ID.
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase).

import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "npm:jose@5";

const EMISOR = "https://auth.cuentaunica.gob.do";
const JWKS = createRemoteJWKSet(new URL(`${EMISOR}/.well-known/jwks.json`));
const CLIENT_ID = Deno.env.get("CUENTA_UNICA_CLIENT_ID") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const fallo = (error: string, status: number) => json({ ok: false, error }, status);

/**
 * La cédula, solo si el emisor la entrega en un claim llamado `cedula`. Qué
 * claims llegan a un tercero no está verificado (docs/INFRAESTRUCTURA.md §10.7): un
 * `preferred_username` de once dígitos podría ser otra cosa, y el RPC lo
 * tomaría por identidad. Cuando el dueño documente los claims reales
 * se amplía aquí.
 */
function cedulaDe(claims: JWTPayload): string | null {
  const valor = claims.cedula;
  if (typeof valor !== "string") return null;
  const digitos = valor.replace(/\D/g, "");
  return digitos.length === 11 ? digitos : null;
}

function base64url(bytes: Uint8Array): string {
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Misma fórmula que `nonceDeSesion` en el cliente. */
async function nonceDeSesion(uid: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`socratico:${uid}`));
  return base64url(new Uint8Array(digest));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fallo("metodo", 405);
  if (!CLIENT_ID) return fallo("cliente_no_configurado", 503);

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return fallo("sesion_requerida", 401);

  let cuerpo: { id_token?: unknown };
  try {
    cuerpo = await req.json();
  } catch {
    return fallo("parametros", 400);
  }
  const idToken = typeof cuerpo.id_token === "string" ? cuerpo.id_token : "";
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(idToken)) return fallo("token_invalido", 400);

  // 1. Quién llama: la sesión de Supabase del votante (clave publicable + su JWT).
  const url = Deno.env.get("SUPABASE_URL")!;
  const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: sesion, error: errUsuario } = await comoUsuario.auth.getUser(auth.slice(7));
  if (errUsuario || !sesion.user) return fallo("sesion_requerida", 401);

  // 2. Qué trae: un ID token firmado por Cuenta Única para ESTE cliente y ESTE flujo.
  let claims: JWTPayload;
  try {
    ({ payload: claims } = await jwtVerify(idToken, JWKS, {
      issuer: EMISOR,
      audience: CLIENT_ID,
      algorithms: ["RS256"],
      maxTokenAge: "15 minutes",
      clockTolerance: 60,
    }));
  } catch {
    return fallo("token_invalido", 400);
  }
  if (claims.nonce !== (await nonceDeSesion(sesion.user.id))) return fallo("token_invalido", 400);
  const sub = typeof claims.sub === "string" ? claims.sub : "";
  if (!sub) return fallo("sujeto_invalido", 400);

  // 3. Vincular con la clave de servicio, que nunca sale de Supabase.
  const servicio = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data, error } = await servicio
    .schema("democracia")
    .rpc("vincular_identidad", { p_uid: sesion.user.id, p_sub: sub, p_cedula: cedulaDe(claims) });
  if (error) {
    console.error(`[vincular-cuenta-unica] rpc: ${error.message}`);
    return fallo("base_de_datos", 502);
  }
  return json(data);
});
