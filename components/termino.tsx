"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { entradaGlosario, type ClaveGlosario } from "@/lib/glosario";
import { cn } from "@/lib/cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Un término del Estado explicado donde se tropieza con él.
 *
 * La palabra queda en su frase, subrayada con puntos —la convención de
 * imprenta para «esto tiene nota»—, y al tocarla abre un globo con la
 * definición llana de `lib/glosario.ts` y, si la hay, la guía que lo cuenta
 * entero. `docs/INFRAESTRUCTURA.md` §11: la jerga se traduce en el punto de uso, no
 * en un glosario que nadie abre.
 *
 * Decisiones:
 *  · **Globo que se abre al tocar, no al pasar el puntero.** Un dedo no tiene
 *    `hover` (§8), y una definición que solo aparece al pasar el ratón no
 *    existe en el teléfono, que es la pantalla. `Popover` de Radix da el resto:
 *    se abre con Enter o Espacio, se cierra con Escape o tocando fuera, y el
 *    foco vuelve a la palabra.
 *  · **El disparador es un `<button>` en línea, no la primitiva `Button`.**
 *    Es la excepción que §8 reconoce —un enlace dentro de una frase se queda a
 *    la altura de su línea—, porque darle altura de mando partiría el párrafo.
 *    Los 44 px de toque se consiguen igual: un pseudoelemento invisible
 *    estira el objetivo en vertical sin mover una sola línea del texto.
 *  · **Hereda el color de su frase**, porque vive igual en la banda de tinta de
 *    una portada que en una ficha sobre papel. Solo el subrayado cambia al
 *    apuntar o al abrir.
 *  · Una clave que no existe pinta el texto sin más: la frase nunca se rompe
 *    por un término que falte.
 */
export function Termino({
  clave,
  children,
  className,
}: {
  clave: ClaveGlosario;
  /** Cómo aparece la palabra en la frase; por defecto, el término del glosario. */
  children?: ReactNode;
  className?: string;
}) {
  const entrada = entradaGlosario(clave);
  const texto = children ?? entrada?.termino ?? clave;
  if (!entrada) return <>{texto}</>;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="dialog"
          className={cn(
            "relative inline cursor-help rounded-sm p-0 text-left align-baseline [font:inherit] text-inherit",
            "underline decoration-current/45 decoration-dotted decoration-[1.5px] underline-offset-[3px]",
            "hover:decoration-current data-[state=open]:decoration-current data-[state=open]:decoration-solid",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            // El objetivo de toque: 44 px de alto en el teléfono, centrado en
            // la línea, sin ocupar sitio en el flujo del párrafo.
            "before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2 before:content-[''] sm:before:h-full",
            className,
          )}
        >
          {texto}
          <span className="sr-only"> (qué significa)</span>
        </button>
      </PopoverTrigger>
      <PopoverContent collisionPadding={16} className="w-80 max-w-[calc(100vw-2rem)] space-y-2">
        <p className="rotulo text-ink-soft">Qué significa</p>
        <p className="font-semibold text-ink">{entrada.termino}</p>
        <p className="leading-relaxed text-ink-soft">{entrada.llano}</p>
        {entrada.guia && (
          <p className="border-t border-hairline pt-2">
            <Link
              href={entrada.guia.href}
              className="inline-flex min-h-11 items-center font-medium text-brand-700 hover:underline sm:min-h-0"
            >
              Guía: {entrada.guia.label} →
            </Link>
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
