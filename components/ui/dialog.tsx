"use client";

/**
 * Diálogo — la primitiva de shadcn/ui vestida de «El Contrasello».
 *
 * La usan la paleta de `components/paleta.tsx` y la pregunta «¿qué los une?»
 * del tablero de un caso (`components/espacios/caso.tsx`), y entra por lo
 * mismo que entraron las demás: foco atrapado mientras está abierto, Escape,
 * y el foco de vuelta al disparador al cerrar.
 *
 * Mismas plantas que la hoja (`components/ui/drawer.tsx`): velo en `z-[70]` y
 * capa en `z-[80]`, por encima del header pegajoso (`z-50`), que si no se
 * quedaría nítido y pulsable encima de una página bloqueada. Flota de verdad,
 * así que lleva sombra; la esquina es la de una superficie, `rounded-lg`.
 *
 * En el teléfono se ancla **arriba** y no al centro: el teclado virtual ocupa
 * la mitad inferior, y un diálogo centrado con un campo quedaba debajo de él.
 */

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { cn } from "@/lib/cn";
import { IconX } from "@/components/icons";

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn("velo fixed inset-0 z-[70] bg-ink/45", className)}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  conCierre = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  /**
   * El aspa de cerrar. `"telefono"` la deja solo por debajo de `sm`: con
   * teclado la paleta se cierra con Escape, pero un teléfono no tiene Escape y
   * un diálogo que llena la pantalla sin aspa no tiene salida.
   */
  conCierre?: boolean | "telefono";
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          [
            "capa fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[80] mx-auto flex max-h-[calc(100dvh-1.5rem)] w-auto max-w-lg flex-col overflow-hidden",
            "rounded-lg border border-hairline bg-surface text-ink shadow-pop outline-none",
            "sm:top-[12dvh] sm:max-h-[76dvh]",
          ].join(" "),
          className,
        )}
        {...props}
      >
        {children}
        {conCierre && (
          <DialogPrimitive.Close
            className={cn(
              "absolute right-1 top-0.5 inline-flex h-11 w-11 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:right-1.5 sm:top-1.5 sm:h-9 sm:w-9",
              conCierre === "telefono" && "sm:hidden",
            )}
          >
            <IconX className="h-4 w-4" />
            <span className="sr-only">Cerrar</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("shrink-0 border-b border-hairline px-4 py-3", className)}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-sans text-sm font-semibold text-ink", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-xs leading-relaxed text-ink-soft", className)}
      {...props}
    />
  );
}

/** El pie de un diálogo con formulario: las acciones, la principal a la derecha. */
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex shrink-0 flex-wrap justify-end gap-2 border-t border-hairline px-4 py-3", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
};
