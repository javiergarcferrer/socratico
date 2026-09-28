"use client";

/**
 * Selector.
 *
 * Sustituye al `<select>` nativo por una razón concreta de esta plataforma: los
 * filtros llevan **ayuda en el punto de uso** —qué significa «perimida», qué
 * entra en «ya cerró»— y un `<option>` nativo no admite una segunda línea. Con
 * esta primitiva la explicación viaja pegada a la opción, que es la regla 3 de
 * la ergonomía: reconocer, no recordar.
 *
 * Lo que no se pierde: teclado completo, lectura por lector de pantalla y
 * cierre con Escape, que es lo que Radix trae resuelto.
 */

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";

import { cn } from "@/lib/cn";
import { IconCheck, IconChevronUpDown } from "@/components/icons";

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex h-11 w-full items-center justify-between gap-2 rounded-md border border-hairline bg-surface px-3 py-2 text-base text-ink transition-colors sm:h-10 sm:text-sm",
        "hover:border-brand-300",
        "focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25",
        "disabled:cursor-not-allowed disabled:opacity-55",
        // Un campo que no pasó al enviar lleva el filete de alerta (ErrorCampo dice qué falta).
        "aria-invalid:border-alerta-500",
        "[&>span]:truncate",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <IconChevronUpDown className="h-4 w-4 shrink-0 text-ink-soft" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  /*
    La lista va en `z-[90]`, por encima de la hoja (`z-[80]`, components/ui/
    sheet.tsx). Con el `z-50` de shadcn, un selector dentro de la hoja de
    filtros del teléfono abría su lista **debajo del velo**: se veía, pero
    ningún toque llegaba a las opciones.
  */
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        className={cn(
          "capa z-[90] max-h-[min(24rem,60dvh)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-hairline bg-surface text-sm text-ink shadow-card",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="max-h-[inherit] overflow-y-auto overscroll-contain p-1">
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("rotulo px-2.5 py-2 text-ink-soft", className)}
      {...props}
    />
  );
}

/**
 * Una opción. `ayuda` es la línea en llano que explica qué recoge: el motivo
 * por el que esta primitiva existe.
 */
function SelectItem({
  className,
  children,
  ayuda,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item> & { ayuda?: React.ReactNode }) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex min-h-11 cursor-pointer select-none flex-col items-start justify-center gap-0.5 rounded-md py-2 pl-3 pr-9 outline-none transition-colors sm:min-h-0 sm:pl-2.5 sm:pr-8",
        "focus:bg-brand-50 focus:text-brand-700",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-55",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      {ayuda && (
        <span className="text-xs leading-snug text-ink-soft">{ayuda}</span>
      )}
      <span className="absolute right-2.5 top-2.5 flex h-4 w-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <IconCheck className="h-4 w-4 text-brand-600" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("-mx-1 my-1 h-px bg-hairline", className)}
      {...props}
    />
  );
}

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
};
