/**
 * Botón — la primitiva de shadcn/ui vestida de «El Contrasello».
 *
 * Es la misma API de shadcn (`variant`, `size`, `asChild`) y la misma mecánica
 * (`cva` + `Slot`), pero ninguna de sus decisiones de color sobrevive: la
 * variante principal es la **firma** —azul de bolígrafo— y el texto sobre
 * relleno saturado es papel (`canvas`), nunca blanco de pantalla.
 *
 * Toda variante con caja lleva **relieve** (`app/globals.css`): fibra de papel
 * y canto. Es la señal de «esto se pulsa», y por eso ninguna superficie que
 * solo se lee la lleva (docs/IDENTIDAD.md §Relieve).
 *
 * `asChild` es lo que hace esta pieza usable en una plataforma que es, sobre
 * todo, enlaces: `<Button asChild><Link href=…>` conserva la semántica de
 * navegación y hereda el vestido. Antes había que copiar la línea de clases a
 * mano en cada página, que es exactamente como se diluyó la identidad dos
 * veces (docs/IDENTIDAD.md §8).
 */

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

const buttonVariants = cva(
  [
    "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold",
    // Un dedo no tiene `hover`: la respuesta al toque es el `active`. Sin él
    // un botón en el teléfono parece no haber oído, y se pulsa dos veces. Las
    // variantes con caja la dan con el relieve (se asienta sobre su canto);
    // las que no tienen caja, con tinta. Duración y curva: los tokens.
    "transition-[color,background-color,border-color,box-shadow,transform,opacity]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
    "disabled:pointer-events-none disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        /**
         * La acción principal: tinta de bolígrafo con relieve. El canto es la
         * firma más honda y la luz del borde, papel al 18 %.
         */
        default:
          "relieve bg-brand-500 text-canvas [--canto:var(--color-brand-800)] [--luz:rgb(247_243_234/0.18)] hover:bg-brand-600",
        /** La hoja sobre el papel: filete y superficie, como una tarjeta. */
        secondary:
          "relieve border border-hairline bg-surface text-ink hover:bg-canvas",
        /** Solo el filete: para lo que acompaña sin competir. */
        outline:
          "relieve border border-hairline bg-transparent text-ink hover:bg-brand-50 hover:text-brand-700",
        /** Sin caja hasta que se apunta. */
        ghost:
          "text-ink hover:bg-brand-50 hover:text-brand-700 active:bg-brand-100 active:shadow-[inset_0_1px_2px_rgb(23_29_46/0.14)]",
        /** Un enlace que se comporta como botón. */
        link: "text-brand-700 underline-offset-4 hover:underline",
        /**
         * Sobre la banda de tinta del header: papel al 65 % que se enciende al
         * apuntarlo. Es la única variante que vive sobre fondo oscuro, y por
         * eso su texto es `canvas` y nunca blanco de pantalla.
         */
        tinta:
          "text-canvas/65 hover:bg-canvas/10 hover:text-canvas data-[activo=true]:bg-canvas/12 data-[activo=true]:text-canvas",
        /** El sello: lo que deroga, anula o borra. Escaso por definición. */
        destructive:
          "relieve bg-sello-600 text-canvas [--canto:var(--color-sello-800)] [--luz:rgb(247_243_234/0.18)] hover:bg-sello-700",
      },
      /*
        En el teléfono la altura por defecto es 44 px —el objetivo táctil que
        recomiendan las guías de iOS y Android— y baja a 40 px desde `sm`,
        donde hay puntero. `Input` y `SelectTrigger` llevan exactamente los
        mismos saltos, así que un botón junto a un campo se alinea solo. `sm`
        se queda en 36 px: es para acciones secundarias dentro de una fila, y
        lleva su propio margen de toque alrededor.
      */
      size: {
        sm: "h-9 px-3 text-xs",
        default: "h-11 px-4 sm:h-10",
        lg: "h-12 rounded-lg px-5 text-[15px] sm:h-11 sm:text-sm",
        icon: "h-11 w-11 sm:h-10 sm:w-10",
        "icon-sm": "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      // Un botón hace algo, no envía por accidente: `submit` se pide
      // explícito (docs/DESIGN.md §5). Con `asChild` el tipo es del hijo.
      type={asChild ? undefined : "button"}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
