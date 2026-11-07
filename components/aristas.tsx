import Link from "next/link";
import type { Relacion } from "@/lib/grafo-rdf";
import Antiguedad from "@/components/antiguedad";
import Plegable from "@/components/plegable";

/**
 * Una lista de aristas del grafo en una ficha: cada una a su nodo, con su
 * fecha y lo que la precisa, como las lee `relacionesDesdeTriples`. Va dentro
 * de una `Card` (se extiende a sus bordes). Con más de `visibles`, el resto
 * queda a un toque, con su cuenta en el botón (`Plegable`): «Ver 12 más».
 */
export function Aristas({ lista, visibles = 8 }: { lista: Relacion[]; visibles?: number }) {
  const primeras = lista.slice(0, visibles);
  const resto = lista.slice(visibles);
  return (
    <div className="-mx-5 mt-3 border-t border-hairline sm:-mx-6">
      <Filas lista={primeras} />
      {resto.length > 0 && (
        <Plegable etiqueta={`Ver ${resto.length.toLocaleString("es-DO")} más`}>
          <Filas lista={resto} />
        </Plegable>
      )}
    </div>
  );
}

function Filas({ lista }: { lista: Relacion[] }) {
  return (
    <ul className="divide-y divide-hairline text-sm">
      {lista.map((r) => (
        <li key={`${r.verbo}|${r.href}|${r.nombre}`} className="relative px-5 py-3 transition-colors hover:bg-brand-50/40 sm:px-6">
          <span className="rotulo text-ink-soft">{r.verbo}</span>
          {r.href ? (
            r.externo ? (
              <a href={r.href} target="_blank" rel="noopener noreferrer" className="estira mt-0.5 block font-medium text-ink hover:text-brand-700">
                {r.nombre}
                <span className="sr-only"> (se abre en otra pestaña)</span>
              </a>
            ) : (
              <Link href={r.href} className="estira mt-0.5 block font-medium text-ink hover:text-brand-700">
                {r.nombre}
              </Link>
            )
          ) : (
            <span className="mt-0.5 block font-medium text-ink">{r.nombre}</span>
          )}
          {(r.detalle || r.fecha) && (
            <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft [overflow-wrap:anywhere]">
              {r.fecha && <Antiguedad iso={r.fecha} prefijo={(r.movimiento ?? "fechada").toLowerCase()} />}
              {r.fecha && r.detalle ? " · " : null}
              {r.detalle}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
