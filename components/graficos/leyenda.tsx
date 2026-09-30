import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { SECUENCIAL } from "./paleta";

/**
 * La leyenda: la vía de identidad que no depende del color. Con dos series o
 * más siempre está; con una, no —el título ya dice qué se pinta—.
 *
 * La muestra imita la marca (barra para barras y áreas, trazo para líneas,
 * punto para estados) y el texto va en tinta, **nunca en el color de la
 * serie**: un ocre o un verde azulado como texto no se leen sobre papel. Si la
 * entrada lleva `href`, la entrada entera es el objetivo (44 px en el
 * teléfono): en una barra apilada de 12 px de alto, la leyenda es por donde se
 * llega a cada parte.
 */
export interface EntradaLeyenda {
  clave: string;
  /** `null` cuando la cifra lo dice todo (los tramos de un mapa). */
  etiqueta: ReactNode;
  /** Clase de fondo de la muestra (`bg-grafico-1`, `TONOS.cumplido.dot`). */
  clase: string;
  forma?: "barra" | "linea" | "punto";
  cifra?: ReactNode;
  href?: string;
}

export function Leyenda({
  entradas,
  sobre = "papel",
  className,
}: {
  entradas: EntradaLeyenda[];
  /** Sobre la banda de tinta de una portada, el texto va en papel. */
  sobre?: "papel" | "tinta";
  className?: string;
}) {
  const tinta = sobre === "tinta";
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1", className)}>
      {entradas.map((e) => {
        const contenido = (
          <>
            <span
              aria-hidden
              className={cn(
                "shrink-0",
                e.forma === "linea" ? "h-0.5 w-4 rounded-sm" : e.forma === "punto" ? "h-2 w-2 rounded-full" : "h-2.5 w-2.5 rounded-sm",
                e.clase,
              )}
            />
            {e.etiqueta != null && <span>{e.etiqueta}</span>}
            {e.cifra != null && (
              <span className={cn("font-mono font-semibold tabular-nums", tinta ? "text-canvas" : "text-ink")}>
                {e.cifra}
              </span>
            )}
          </>
        );
        const clases = cn(
          "inline-flex items-center gap-1.5 text-xs",
          tinta ? "text-canvas/70" : "text-ink-soft",
        );
        return (
          <li key={e.clave}>
            {e.href ? (
              <Link
                href={e.href}
                className={cn(clases, "min-h-11 sm:min-h-0 hover:underline", tinta ? "hover:text-canvas" : "hover:text-brand-700")}
              >
                {contenido}
              </Link>
            ) : (
              <span className={cn(clases, "min-h-6")}>{contenido}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * La escala de una magnitud (la matriz por mes): los seis pasos de la firma,
 * del «casi cero» al máximo, con sus dos extremos escritos.
 */
export function EscalaSecuencial({
  desde,
  hasta,
  className,
}: {
  desde: string;
  hasta: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 text-xs text-ink-soft", className)}>
      <span className="font-mono tabular-nums">{desde}</span>
      <span className="flex gap-[2px]" aria-hidden>
        {SECUENCIAL.map((c) => (
          <span key={c} className={cn("h-2.5 w-5 first:rounded-l-sm last:rounded-r-sm", c)} />
        ))}
      </span>
      <span className="font-mono tabular-nums">{hasta}</span>
    </div>
  );
}
