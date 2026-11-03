"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/cn";

/**
 * Slider de shadcn/ui (Radix), vestido con los tokens: el riel es un medidor
 * (`rounded-sm`, filete), el tramo elegido va en la tinta de la firma y cada
 * tirador es un sello redondo de 20 px con un blanco táctil de 44 px en el
 * teléfono (40 desde `sm`). Un tirador por valor: con dos, un rango. Cada
 * tirador lleva su `aria-label` (`etiquetas`) y su valor en palabras
 * (`texto`), que el lector de pantalla dice en lugar del número crudo.
 */
function Slider({
  className,
  etiquetas,
  texto,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  /** El nombre de cada tirador, en orden. */
  etiquetas: string[];
  /** El valor de un tirador en palabras (`aria-valuetext`). */
  texto?: (valor: number) => string;
}) {
  const valores = props.value ?? props.defaultValue ?? [props.min ?? 0];
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        "relative flex w-full touch-none select-none items-center data-[disabled]:opacity-50",
        "min-h-11 sm:min-h-10",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track data-slot="slider-track" className="relative h-1.5 w-full grow overflow-hidden rounded-sm bg-hairline">
        <SliderPrimitive.Range data-slot="slider-range" className="absolute h-full bg-brand-500" />
      </SliderPrimitive.Track>
      {valores.map((v, i) => (
        <SliderPrimitive.Thumb
          key={i}
          data-slot="slider-thumb"
          aria-label={etiquetas[i]}
          aria-valuetext={texto ? texto(v) : undefined}
          className={cn(
            "relative block h-5 w-5 rounded-full border-2 border-brand-500 bg-surface outline-none",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
            // El blanco táctil, mayor que el sello que se ve.
            "after:absolute after:-inset-3 after:content-['']",
          )}
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
