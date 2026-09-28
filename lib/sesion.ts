"use client";

import { supabase } from "@/lib/supabase";

/**
 * Abrir sesión con el correo: lo comparten `/democracia/registro` (votar) y
 * `/cuenta` (el espacio del lector, `docs/PLAN-ESPACIOS.md`). Es una sola
 * cuenta de Supabase Auth para las dos cosas.
 *
 * Vivía dentro del registro del voto. Se sacó cuando la cuenta del espacio
 * necesitó exactamente lo mismo: la lectura tolerante de todo lo que el
 * visitante puede pegar (código, enlace sin pulsar, barra de direcciones tras
 * pulsarlo, canje PKCE, fallo) y la traducción de cada error de envío. Dos
 * copias serían la «segunda tabla» de docs/IDENTIDAD.md §7.
 */

/**
 * Lo que el visitante puede pegar en el campo de verificación. Son cinco cosas
 * distintas y **ninguna es opcional**, porque el proyecto de Supabase todavía
 * tiene el Site URL en `http://localhost:3000` (decisión abierta del dueño):
 *
 * - `codigo`  — los seis dígitos, si la plantilla lleva `{{ .Token }}`.
 * - `enlace`  — la dirección del correo *sin pulsar*: lleva `token`/`token_hash`.
 * - `sesion`  — la barra de direcciones **después** de pulsar el enlace. GoTrue
 *   ya gastó el token y devolvió la sesión hecha en el fragmento
 *   (`#access_token=…&refresh_token=…`). El token del correo ya no sirve, pero
 *   esto sí: es la sesión misma. Éste es el caso real de quien pulsa desde el
 *   móvil y acaba en una página que no carga.
 * - `canje`   — `?code=…` del flujo PKCE, por si el proyecto se cambia a él.
 * - `fallo`   — `#error_code=otp_expired&…`: el enlace ya se usó o venció.
 *   Decirlo con precisión evita mandar a nadie a mirar una bandeja vacía.
 *
 * Verificado contra el proyecto el 2026-09-04:
 * `GET /auth/v1/verify?token=…&redirect_to=https://socratico.vercel.app/…`
 * responde `303` a `http://localhost:3000#error=access_denied&
 * error_code=otp_expired&…` — o sea: GoTrue **no rechaza** una redirección
 * fuera de la lista, la sustituye por el Site URL, y el resultado siempre
 * viaja en el **fragmento**.
 */
export type Entrada =
  | { via: "codigo"; token: string }
  | { via: "enlace"; hash: string; clase: string | null }
  | { via: "sesion"; access: string; refresh: string }
  | { via: "canje"; code: string }
  | { via: "fallo"; codigo: string; descripcion: string };

/** Tipos de token que acepta `verifyOtp` con `token_hash`. */
const CLASES_ENLACE = [
  "email",
  "magiclink",
  "signup",
  "recovery",
  "invite",
  "email_change",
] as const;

/**
 * Todos los parámetros de un pegado, vengan en la query o en el fragmento y
 * traiga o no el correo entero alrededor. Gana la primera aparición: la query
 * real manda sobre lo que venga detrás de un `redirect_to` sin codificar.
 */
function parametrosDe(bruto: string): URLSearchParams {
  const texto = bruto.trim().replace(/&amp;/gi, "&");
  const url = /https?:\/\/\S+/.exec(texto)?.[0] ?? texto;
  const params = new URLSearchParams();
  for (const trozo of url.split(/[?#]/).slice(1)) {
    for (const [clave, valor] of new URLSearchParams(trozo)) {
      if (!params.has(clave)) params.set(clave, valor);
    }
  }
  return params;
}

export function leerEntrada(bruto: string): Entrada | null {
  const limpio = bruto.trim();
  if (!limpio) return null;

  const digitos = limpio.replace(/\D/g, "");
  if (digitos.length === 6 && !/[a-z]/i.test(limpio)) {
    return { via: "codigo", token: digitos };
  }

  const p = parametrosDe(limpio);

  const codigoError = p.get("error_code") ?? p.get("error");
  if (codigoError) {
    return { via: "fallo", codigo: codigoError, descripcion: p.get("error_description") ?? "" };
  }

  const access = p.get("access_token");
  const refresh = p.get("refresh_token");
  if (access && refresh) return { via: "sesion", access, refresh };

  const code = p.get("code");
  if (code) return { via: "canje", code };

  const hash = p.get("token_hash") ?? p.get("token");
  if (hash) return { via: "enlace", hash, clase: p.get("type") };

  // Un token pegado a secas, sin la dirección alrededor.
  if (/^[A-Za-z0-9_-]{20,}$/.test(limpio)) return { via: "enlace", hash: limpio, clase: null };

  return null;
}

function mensajeDeFallo(codigo: string, descripcion: string): string {
  if (codigo === "otp_expired") {
    return "Ese enlace ya se usó o venció: valen una sola vez y por unos minutos. Pide un correo nuevo y, en vez de pulsarlo, copia su dirección y pégala aquí.";
  }
  if (codigo === "access_denied") {
    return "El servidor rechazó ese enlace. Pide un correo nuevo y pega su dirección aquí sin pulsarlo.";
  }
  return `El enlace no sirvió${descripcion ? `: ${descripcion}` : ""}. Pide un correo nuevo.`;
}

/**
 * Abre sesión con lo que sea que haya llegado. Devuelve el mensaje del fallo,
 * o `null` si quedó sesión. Es el mismo camino para lo pegado a mano y para
 * lo que traiga la URL al cargar la página. `email` solo lo usa el código de
 * seis dígitos, que se verifica contra el correo al que se envió.
 */
export async function abrirSesion(email: string, entrada: Entrada): Promise<string | null> {
  const auth = supabase().auth;

  if (entrada.via === "fallo") return mensajeDeFallo(entrada.codigo, entrada.descripcion);

  if (entrada.via === "codigo") {
    const { error: err } = await auth.verifyOtp({ email, token: entrada.token, type: "email" });
    return err ? "El código no es válido o ya venció. Pide uno nuevo." : null;
  }

  if (entrada.via === "sesion") {
    const { error: err } = await auth.setSession({
      access_token: entrada.access,
      refresh_token: entrada.refresh,
    });
    return err
      ? "Esa dirección ya no sirve: la sesión que traía venció o se usó en otro navegador. Pide un correo nuevo."
      : null;
  }

  if (entrada.via === "canje") {
    const { error: err } = await auth.exchangeCodeForSession(entrada.code);
    return err
      ? "Ese enlace hay que abrirlo en el mismo navegador donde pediste el código. Pide uno nuevo desde aquí."
      : null;
  }

  // Enlace: el `type` de la dirección manda, pero si falta o miente se prueban
  // los demás. Un tipo equivocado no gasta el token, solo no encaja.
  const declarada = CLASES_ENLACE.find((c) => c === entrada.clase);
  const orden = declarada
    ? [declarada, ...CLASES_ENLACE.filter((c) => c !== declarada)]
    : [...CLASES_ENLACE];
  for (const type of orden) {
    const { error: err } = await auth.verifyOtp({ token_hash: entrada.hash, type });
    if (!err) return null;
  }
  return "Ese enlace ya se usó o venció. Pide un correo nuevo y pega su dirección sin pulsarla.";
}

/**
 * Traduce el fallo real de Supabase. Cada uno pide una acción distinta y
 * decirle «revisa el correo» a los tres es mandar al usuario a mirar una
 * bandeja vacía y a reintentar lo que ya falló.
 */
export function mensajeDeEnvio(err: { message?: string; code?: string; status?: number }): string {
  const codigo = err.code ?? "";
  const texto = (err.message ?? "").toLowerCase();

  if (codigo === "over_email_send_rate_limit" || texto.includes("rate limit") || err.status === 429) {
    return "Se agotó el límite de correos por ahora. Espera unos minutos antes de pedir otro código; no hace falta que cambies nada.";
  }
  if (codigo === "email_address_invalid" || texto.includes("invalid")) {
    return "Ese correo no lo acepta el servicio de verificación. Prueba con otra dirección.";
  }
  if (texto.includes("redirect")) {
    return "El servidor rechazó la dirección de retorno. Es un ajuste del proyecto, no de tu correo.";
  }
  if (texto.includes("signup") && texto.includes("disabled")) {
    return "El registro está desactivado en el proyecto ahora mismo.";
  }
  return `No se pudo enviar el código${err.message ? `: ${err.message}` : ""}.`;
}

/**
 * Pide el código al correo. `volverA` es la ruta de esta plataforma a la que
 * debería volver el enlace del correo (hoy GoTrue la sustituye por el Site
 * URL, ver `Entrada`); el código de seis dígitos funciona igual. Devuelve el
 * mensaje del fallo, o `null` si se envió.
 */
export async function pedirCodigo(email: string, volverA: string): Promise<string | null> {
  const { error } = await supabase().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}${volverA}` },
  });
  return error ? mensajeDeEnvio(error) : null;
}

/** Un correo con forma de correo: la validación de verdad la hace el envío. */
export const correoValido = (email: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
