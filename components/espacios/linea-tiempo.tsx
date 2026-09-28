import type { ReactNode } from "react";
import type { TipoEntrada } from "@/lib/espacios";
import { formatFecha } from "@/lib/format";
import { EnlaceRegistro, MarcaTipo } from "./registro";

/**
 * La línea de tiempo de un caso: los registros a los que el investigador les
 * dio una fecha, en orden, por año. La fecha es suya —cuándo pasó lo que le
 * importa de ese registro—, no un dato copiado de la fuente
 * (docs/PLAN-ESPACIOS.md §7): por eso se dice «fecha anotada».
 *
 * Sin «use client»: `/p` la pinta en el servidor; la mesa le pasa `accion`
 * para cambiar la fecha en cada fila.
 */

export interface HitoTiempo {
  id: string;
  tipo: TipoEntrada;
  titulo: string;
  href: string;
  nota: string;
  fecha: string | null;
}

export default function LineaDeTiempo({
  hitos,
  ajeno = false,
  accion,
}: {
  hitos: HitoTiempo[];
  ajeno?: boolean;
  /** Lo que va al pie de cada fila: en la mesa, el campo de la fecha. */
  accion?: (h: HitoTiempo) => ReactNode;
}) {
  const fechados = hitos.filter((h) => h.fecha).sort((a, b) => (a.fecha! < b.fecha! ? -1 : a.fecha! > b.fecha! ? 1 : 0));
  const porAnio = new Map<string, HitoTiempo[]>();
  for (const h of fechados) {
    const anio = h.fecha!.slice(0, 4);
    porAnio.set(anio, [...(porAnio.get(anio) ?? []), h]);
  }
  if (!fechados.length) return null;
  return (
    <ol className="space-y-6">
      {[...porAnio].map(([anio, lista]) => (
        <li key={anio}>
          <h3 className="rotulo text-ink-soft">{anio}</h3>
          <ol className="mt-2 border-l border-hairline">
            {lista.map((h) => (
              <li key={h.id} className="relative py-2.5 pl-5">
                <span aria-hidden className="absolute -left-[5px] top-4 h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand-600" />
                <p className="font-mono text-xs text-ink-soft">
                  <time dateTime={h.fecha!}>{formatFecha(h.fecha!)}</time>
                </p>
                <p className="mt-0.5 text-[15px] leading-snug">
                  <EnlaceRegistro titulo={h.titulo} href={h.href} ajeno={ajeno} />
                </p>
                <p className="mt-1">
                  <MarcaTipo tipo={h.tipo} />
                </p>
                {h.nota && <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{h.nota}</p>}
                {accion?.(h)}
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}
