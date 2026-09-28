/**
 * Campo de texto — la casilla del formulario.
 *
 * Fondo de hoja, filete de folio y anillo de foco con la firma. El
 * `placeholder` va en grafito: es una pista, no un valor.
 */

import * as React from "react";

import { cn } from "@/lib/cn";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // 16 px en teléfono a propósito: por debajo de eso Safari en iOS hace zoom
        // al enfocar el campo y la página se queda desplazada al soltarlo.
        "flex h-11 w-full rounded-md border border-hairline bg-surface px-3 py-2 text-base text-ink transition-colors sm:h-10 sm:text-sm",
        "placeholder:text-ink-soft/80",
        "focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25",
        "disabled:cursor-not-allowed disabled:opacity-55",
        // Un campo que no pasó al enviar lleva el filete de alerta (ErrorCampo dice qué falta).
        "aria-invalid:border-alerta-500",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
