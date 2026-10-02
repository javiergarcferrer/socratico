/**
 * Marca de estado — el sello de goma sobre el expediente.
 *
 * Es el `Badge` de shadcn con la forma que manda la identidad: rectangular
 * (`rounded-[3px]`), en versalitas monoespaciadas y **nunca una píldora** — un
 * sello no tiene esquinas redondas (docs/INFRAESTRUCTURA.md §11).
 *
 * Las variantes se nombran por el **oficio del color**, no por el estado
 * concreto de una fuente: es la misma disciplina de `lib/estados.ts`, donde un
 * origen traduce su vocabulario a cinco significados y la interfaz solo conoce
 * esos cinco. Un `variant="valido"` dice *ya se cumplió* en toda la plataforma,
 * venga de la DGCP o del Senado.
 */

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-[3px]",
  {
    variants: {
      /**
       * Dos tallas del mismo sello. `sello` es el epígrafe en versalitas
       * monoespaciadas —«MIPYME», «ACTIVO EN EL RPE»—; `etiqueta` es para el
       * estado que se dice con palabras («Ya cerró la recepción»), donde las
       * versalitas espaciadas alargarían la marca hasta romper la fila en un
       * teléfono.
       */
      forma: {
        sello: "rotulo px-1.5 py-0.5",
        etiqueta: "rounded-md px-2 py-0.5 text-xs font-semibold",
      },
      variant: {
        /** Grafito: informa y no pide nada. */
        neutro: "bg-canvas text-ink-soft",
        /** La firma: se puede actuar. */
        firma: "bg-brand-50 text-brand-700",
        /** El sello: se cayó, se anuló, se derogó. */
        sello: "bg-sello-50 text-sello-700",
        /** Ocre de anotación al margen: corre un plazo. */
        alerta: "bg-alerta-50 text-alerta-700",
        /** Verde de archivo: ya se cumplió. */
        valido: "bg-valido-50 text-valido-700",
        /** Solo filete, sin relleno: para lo que acompaña a un titular. */
        contorno: "border border-hairline text-ink-soft",
      },
    },
    defaultVariants: {
      forma: "sello",
      variant: "neutro",
    },
  },
);

function Badge({
  className,
  variant,
  forma,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, forma }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
