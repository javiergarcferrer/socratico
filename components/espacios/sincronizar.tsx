"use client";

import { useEffect } from "react";
import { useHaySesion } from "./presencia";

/**
 * Con sesión, lo que el lector sigue viaja con su cuenta: al abrir cualquier
 * página se trae la lista de la cuenta y cada cambio se refleja en ella
 * (`sincronizarSeguidos`, `reflejarSeguidos`). Sin sesión no hace nada y no
 * carga nada: el cliente de Supabase se importa solo si hay una sesión
 * guardada. Vive en el layout y no pinta nada.
 */
export default function SincronizarCuenta() {
  const hay = useHaySesion();
  useEffect(() => {
    if (!hay) return;
    let dejar: (() => void) | null = null;
    let vivo = true;
    (async () => {
      const c = await import("@/lib/espacios-cliente");
      const u = await c.sesionActual();
      if (!u || !vivo) return;
      // Si el esquema aún no está abierto, el navegador sigue siendo la lista:
      // no se escucha nada que después no se pueda subir.
      const r = await c.sincronizarSeguidos(u);
      if (!r.ok || !vivo) return;
      dejar = c.reflejarSeguidos(u);
    })();
    return () => {
      vivo = false;
      dejar?.();
    };
  }, [hay]);
  return null;
}
