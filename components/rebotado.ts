"use client";

import { useEffect, useState } from "react";

/**
 * El valor, cuando lleva `ms` sin cambiar. Con `ms = 0` es el valor mismo, sin
 * un render de retraso: así borrar el texto de un buscador pide en el acto.
 */
export function useRebotado<T>(valor: T, ms: number): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    if (ms === 0) return setV(valor);
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return ms === 0 ? valor : v;
}
