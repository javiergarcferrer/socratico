"use client";

/**
 * Comando — la lista filtrable de shadcn/ui (sobre `cmdk`) vestida de
 * «El Contrasello».
 *
 * Entra por el teclado: flechas para recorrer, Intro para elegir, y un
 * `aria-activedescendant` que le dice al lector de pantalla qué opción está
 * señalada mientras el foco se queda en el campo. Es lo que hace que una lista
 * de treinta destinos se recorra sin tabular treinta veces.
 *
 * Las medidas son las de la casa (docs/INFRAESTRUCTURA.md §11): el campo se escribe a
 * 16 px en el teléfono —por debajo, Safari hace zoom al enfocarlo— y cada
 * opción mide 44 px, 40 desde `sm`. La opción señalada se pinta con el tenue de
 * la firma, el mismo que el `hover` de un botón fantasma: una sola señal para
 * «esto es lo que vas a pulsar».
 */

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";

import { cn } from "@/lib/cn";
import { IconSearch } from "@/components/icons";

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn("flex min-h-0 w-full flex-col bg-surface text-ink", className)}
      {...props}
    />
  );
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex shrink-0 items-center gap-2.5 border-b border-hairline px-4"
    >
      <IconSearch className="h-4 w-4 shrink-0 text-ink-soft" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "h-12 w-full min-w-0 bg-transparent text-base text-ink outline-none placeholder:text-ink-soft sm:h-11 sm:text-[15px]",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5",
        className,
      )}
      {...props}
    />
  );
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("px-3 py-6 text-center text-sm text-ink-soft", className)}
      {...props}
    />
  );
}

/**
 * Grupo con su rótulo. El encabezado es un `.rotulo` —versalitas de registro—
 * como el epígrafe de cualquier otra sección de la plataforma.
 */
function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        // Las utilidades de `.rotulo` una a una: una clase plana no se puede
        // aplicar a un descendiente desde fuera, y el encabezado lo pinta cmdk.
        "py-1 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.16em] [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-ink-soft",
        className,
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("-mx-1.5 my-1 h-px bg-hairline", className)}
      {...props}
    />
  );
}

function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        [
          "relative flex min-h-11 cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink outline-none sm:min-h-10",
          "data-[selected=true]:bg-brand-50 data-[selected=true]:text-brand-700",
          "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-55",
          "[&_svg]:pointer-events-none [&_svg]:shrink-0",
        ].join(" "),
        className,
      )}
      {...props}
    />
  );
}

/** El atajo de teclado, en la letra del registro. */
function CommandShortcut({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="command-shortcut"
      className={cn(
        "ml-auto hidden rounded-sm border border-hairline bg-canvas px-1.5 font-mono text-[11px] text-ink-soft sm:inline-block",
        className,
      )}
      {...props}
    />
  );
}

export {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandSeparator,
  CommandItem,
  CommandShortcut,
};
