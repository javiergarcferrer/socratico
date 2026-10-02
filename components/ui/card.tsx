/**
 * Tarjeta — la hoja sobre el papel.
 *
 * shadcn la dibuja con `rounded-xl` y `shadow-sm`; aquí no. «El papel no
 * flota» (docs/INFRAESTRUCTURA.md §11): las superficies se separan con **filete**, y
 * la esquina se queda en 8 px. La sombra queda reservada a lo que de verdad se
 * superpone —menú, hoja modal, botón flotante—, y esas primitivas sí la traen.
 *
 * Una tarjeta que se pulsa —un `<a>` con `asChild`, o una `relative` con un
 * enlace `estira` dentro— toma el **relieve** sola, desde `app/globals.css`:
 * fibra y canto. Nadie tiene que acordarse de pedirlo (docs/INFRAESTRUCTURA.md §11
 * §Relieve).
 */

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/cn";

function Card({
  className,
  as = "div",
  asChild = false,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  /**
   * La etiqueta que se pinta. Una tarjeta de un listado es un `<article>` y una
   * fila es un `<li>`: el vestido no puede costarle la semántica al documento,
   * que es justo de lo que vive un lector de pantalla.
   */
  as?: "div" | "section" | "article" | "li";
  /**
   * La hoja entera es el enlace. Útil donde toda la tarjeta lleva al mismo
   * sitio: un objetivo de toque grande vale más en un teléfono que un enlace
   * de tres palabras dentro de una caja que no responde.
   */
  asChild?: boolean;
}) {
  const Etiqueta = asChild ? Slot : as;
  return (
    <Etiqueta
      data-slot="card"
      className={cn(
        // `overflow-hidden` porque una lista con filetes dentro de una hoja de
        // esquinas contenidas tiene que recortarse contra la esquina, no
        // desbordarla.
        "overflow-hidden rounded-lg border border-hairline bg-surface text-ink",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-hairline px-5 py-3.5",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Título de panel: Public Sans en negrita a 14 px. A ese tamaño dos grotescas
 * juntas no se distinguen, así que el titular (Geist) se queda para la
 * pregunta de la página; `font-sans` lo saca también de su interletra.
 */
/**
 * El título de una tarjeta es un `h2` por defecto: la tarjeta es una sección
 * de la página, que ya tiene su `h1`. Como `h3` saltaba un nivel en 33 de 44
 * páginas auditadas (axe: heading-order), y un lector de pantalla que navega
 * por encabezados no encontraba el segundo nivel. Una tarjeta anidada en otra
 * sección pasa `as="h3"`.
 */
function CardTitle({
  className,
  as: Etiqueta = "h2",
  ...props
}: React.ComponentProps<"h2"> & { as?: "h2" | "h3" | "h4" }) {
  return (
    <Etiqueta
      data-slot="card-title"
      className={cn("font-sans text-sm font-semibold text-ink", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-xs leading-relaxed text-ink-soft", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("shrink-0 text-xs text-ink-soft", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("px-5 py-4", className)} {...props} />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center gap-3 border-t border-hairline px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
};
