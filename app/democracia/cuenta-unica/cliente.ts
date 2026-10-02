/**
 * Cuenta Única (OGTIC) — cliente **público** OpenID Connect con PKCE S256.
 *
 * Identidad v2 de `/democracia` (docs/INFRAESTRUCTURA.md §10). El emisor y sus
 * endpoints se verificaron el 2026-09-02 en su documento de descubrimiento:
 * Ory Hydra, JWKS RS256, `code_challenge_methods_supported: [S256]` y
 * `token_endpoint_auth_methods_supported` con `none`, así que este cliente
 * no lleva secreto — solo un `client_id`, público por diseño como la clave
 * publicable de Supabase. Cuenta Única no tiene alta dinámica de clientes: el
 * `client_id` lo emite la OGTIC a mano; mientras no exista, la vía queda
 * apagada (`cuentaUnicaHabilitada()` = false) y la interfaz no la ofrece.
 *
 * Lo que este módulo NO hace: verificar el ID token. Eso ocurre dentro de
 * Supabase, en la Edge Function `vincular-cuenta-unica`, que es la frontera
 * de confianza; el navegador solo transporta.
 */

export const CUENTA_UNICA = {
  emisor: "https://auth.cuentaunica.gob.do",
  autorizacion: "https://auth.cuentaunica.gob.do/oauth2/auth",
  token: "https://auth.cuentaunica.gob.do/oauth2/token",
  jwks: "https://auth.cuentaunica.gob.do/.well-known/jwks.json",
  alcance: "openid",
} as const;

/** Público por diseño; lo fija el dueño en Vercel cuando la OGTIC lo emita. */
export const CUENTA_UNICA_CLIENT_ID = process.env.NEXT_PUBLIC_CUENTA_UNICA_CLIENT_ID ?? "";

export function cuentaUnicaHabilitada(): boolean {
  return CUENTA_UNICA_CLIENT_ID.length > 0;
}

/** Ruta de vuelta; la `redirect_uri` registrada es `origen + RUTA_CALLBACK`. */
export const RUTA_CALLBACK = "/democracia/cuenta-unica/callback";

/** Nombre de la Edge Function que verifica el ID token y vincula al votante. */
export const FUNCION_VINCULAR = "vincular-cuenta-unica";

const CLAVE_FLUJO = "socratico-cuenta-unica-flujo";
const VIDA_FLUJO_MS = 10 * 60 * 1000;

export interface FlujoCuentaUnica {
  verificador: string;
  estado: string;
  redirectUri: string;
  creado: number;
}

/* ------------------------------------------------------------------ PKCE */

function base64url(bytes: Uint8Array): string {
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function aleatorio(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

async function sha256url(texto: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return base64url(new Uint8Array(digest));
}

/**
 * El `nonce` **ata el ID token a la sesión de votante** que lo pidió: es el
 * hash del id de usuario de Supabase, y la Edge Function lo recalcula desde
 * el JWT del votante que la llama. Un ID token robado no sirve con otra
 * sesión. Misma fórmula en `supabase/functions/vincular-cuenta-unica`.
 */
export function nonceDeSesion(uid: string): Promise<string> {
  return sha256url(`socratico:${uid}`);
}

/**
 * Prepara un flujo de autorización: guarda verificador y `state` en
 * `localStorage` (sobrevive a que la vuelta caiga en otra pestaña, como pasa
 * en iOS al volver de una app) y devuelve la URL a la que hay que llevar al
 * ciudadano. Solo en el navegador; exige la sesión abierta.
 */
export async function iniciarFlujo(uid: string): Promise<string> {
  if (!cuentaUnicaHabilitada()) throw new Error("cliente_no_configurado");
  if (!uid) throw new Error("sesion_requerida");
  const flujo: FlujoCuentaUnica = {
    verificador: aleatorio(48),
    estado: aleatorio(16),
    redirectUri: `${window.location.origin}${RUTA_CALLBACK}`,
    creado: Date.now(),
  };
  localStorage.setItem(CLAVE_FLUJO, JSON.stringify(flujo));

  const url = new URL(CUENTA_UNICA.autorizacion);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CUENTA_UNICA_CLIENT_ID);
  url.searchParams.set("redirect_uri", flujo.redirectUri);
  url.searchParams.set("scope", CUENTA_UNICA.alcance);
  url.searchParams.set("state", flujo.estado);
  url.searchParams.set("nonce", await nonceDeSesion(uid));
  url.searchParams.set("code_challenge", await sha256url(flujo.verificador));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/** El flujo pendiente, si existe y no venció. No lo consume. */
export function leerFlujo(): FlujoCuentaUnica | null {
  let bruto: string | null = null;
  try {
    bruto = localStorage.getItem(CLAVE_FLUJO);
  } catch {
    return null;
  }
  if (!bruto) return null;
  try {
    const flujo = JSON.parse(bruto) as FlujoCuentaUnica;
    if (!flujo.verificador || !flujo.estado || !flujo.redirectUri) return null;
    if (Date.now() - flujo.creado > VIDA_FLUJO_MS) return null;
    return flujo;
  } catch {
    return null;
  }
}

/** Cada respuesta se acepta una vez: se borra en cuanto el `state` cuadra. */
export function borrarFlujo(): void {
  try {
    localStorage.removeItem(CLAVE_FLUJO);
  } catch {
    /* sin almacenamiento no hay nada que borrar */
  }
}
