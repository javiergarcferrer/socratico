"use client";

import { useSyncExternalStore } from "react";

/**
 * ¿Hay una sesión guardada en este navegador? Se responde **sin cargar el
 * cliente de Supabase**: la cabecera y cada ficha lo preguntan, y bajar
 * supabase-js en cada página para pintar «Entrar» o «Tu espacio» sería pagar
 * por una cuenta que la mayoría de visitantes no tiene.
 *
 * Mira la clave donde `lib/supabase.ts` guarda la sesión. Una sesión vencida
 * todavía cuenta como «hay»: el espacio la renueva o pide entrar otra vez, y
 * mientras tanto el lector ve el camino a su espacio, que es lo que buscaba.
 */
export const CLAVE_SESION = "gobiername-democracia-auth";
const EVENTO = "lrd:sesion-cambio";

function leer(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_SESION) !== null;
  } catch {
    return false;
  }
}

function suscribir(cb: () => void): () => void {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENTO, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENTO, cb);
  };
}

/** Avisa a la cabecera y a las fichas de que se entró o se salió en esta pestaña. */
export function avisarCambioDeSesion(): void {
  window.dispatchEvent(new Event(EVENTO));
}

/** `null` mientras se hidrata: el servidor no sabe si hay sesión. */
export function useHaySesion(): boolean | null {
  return useSyncExternalStore(suscribir, leer, () => null);
}
