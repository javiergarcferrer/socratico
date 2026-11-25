"use client";

import Link from "next/link";
import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { VecinoRed } from "@/components/graficos/red-vecinos";

/**
 * La lista de la red de una ficha, filtrable por grupo (cargos, decretos,
 * votaciones…): es la tabla equivalente del dibujo de `RedVecinos`, y en el
 * teléfono, la red misma. El filtro es estado de la vista, no de la URL: la
 * ficha es estática y la vista entera de la red, con su URL, es `/grafo?nodo=`.
 */
export function RedFiltrable({ vecinos, tope = 40 }: { vecinos: VecinoRed[]; tope?: number }) {
  const grupos = [...new Set(vecinos.map((v) => v.grupo))];
  const [grupo, setGrupo] = useState<string>("todos");
  const lista = vecinos.filter((v) => grupo === "todos" || v.grupo === grupo);
  return (
    <div>
      {grupos.length > 1 && (
        <ToggleGroup
          type="single"
          value={grupo}
          onValueChange={(g) => setGrupo(g || "todos")}
          aria-label="Qué parte de su red ver"
          className="flex-wrap p-0.5"
        >
          <ToggleGroupItem value="todos" className="min-h-11 px-3 text-xs sm:min-h-9 sm:px-2.5">
            {`Todo (${vecinos.length})`}
          </ToggleGroupItem>
          {grupos.map((g) => (
            <ToggleGroupItem key={g} value={g} className="min-h-11 px-3 text-xs sm:min-h-9 sm:px-2.5">
              {`${g} (${vecinos.filter((v) => v.grupo === g).length})`}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      <ul className="mt-3" aria-live="polite">
        {lista.slice(0, tope).map((v) => (
          <li key={v.clave} className="relative border-t border-hairline py-2.5">
            <Link href={v.href} className="estira text-[15px] text-ink hover:text-brand-700">
              {v.nombre}
            </Link>
            <p className="mt-0.5 text-xs text-ink-soft">
              {v.grupo} · {v.arista}
            </p>
          </li>
        ))}
      </ul>
      {lista.length > tope && (
        <p className="border-t border-hairline pt-2 text-xs text-ink-soft">
          {`Se ven ${tope} de ${lista.length}; la red entera está en su vista del grafo.`}
        </p>
      )}
    </div>
  );
}
