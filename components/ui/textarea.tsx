/**
 * Área de texto — la misma casilla del formulario, con varias líneas.
 */

import * as React from "react";

import { cn } from "@/lib/cn";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full rounded-md border border-hairline bg-surface px-3 py-2 text-base text-ink transition-colors sm:text-sm",
        "placeholder:text-ink-soft/80",
        "focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25",
        "disabled:cursor-not-allowed disabled:opacity-55",
        // Un campo que no pasó al enviar lleva el filete de alerta (ErrorCampo dice qué falta).
        "aria-invalid:border-alerta-500",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
