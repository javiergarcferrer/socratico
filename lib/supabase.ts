"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase-config";

/**
 * Cliente de Supabase para el navegador — SOLO lo usan las dos excepciones de
 * CLAUDE.md: `/democracia` (esquema `democracia`) y la cuenta con sus espacios
 * (esquema `espacios`, `lib/espacios.ts`). Una sola sesión OTP en
 * localStorage para las dos: quien vota y quien investiga es la misma cuenta.
 * La seguridad vive en la base (RLS + funciones SECURITY DEFINER), nunca aquí.
 */

let cliente: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!cliente) {
    cliente = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // El pool de Auth se comparte con otra app del mismo proyecto:
        // una clave de storage propia evita pisar su sesión en localStorage.
        // NO renombrar con la marca: cambiarla cierra la sesión de cada
        // votante ya registrado, que la tiene guardada bajo esta clave.
        storageKey: "gobiername-democracia-auth",
      },
    });
  }
  return cliente;
}

/** Acceso al schema de la iniciativa (tablas y RPC viven en `democracia`). */
export function db() {
  return supabase().schema("democracia");
}

/** Acceso al esquema del espacio del lector (`docs/INFRAESTRUCTURA.md` §10). */
export function espacios() {
  return supabase().schema("espacios");
}
