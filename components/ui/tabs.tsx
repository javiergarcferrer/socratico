"use client";

/**
 * Pestañas — las vistas de una misma sección.
 *
 * La lista no es una cápsula flotante sino una **banda con filete inferior**, y
 * la pestaña activa se marca con un subrayado grueso: es el lomo de una carpeta
 * de archivador, no una barra de app. Se desplaza en horizontal sin barra
 * visible, porque en un teléfono caben tres y a veces hay seis.
 */

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/cn";

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        [
        "no-scrollbar flex w-full items-stretch gap-1 overflow-x-auto overscroll-x-contain border-b border-hairline",
        // Las pestañas se anclan al desplazarse: en un teléfono media pestaña
        // cortada no dice si hay una más o si aquello se acabó.
        "snap-x snap-proximity [&>*]:snap-start",
      ].join(" "),
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-[15px] font-medium text-ink-soft transition-colors sm:min-h-0 sm:text-sm",
        "hover:text-ink",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        "disabled:pointer-events-none disabled:opacity-55",
        "data-[state=active]:border-brand-600 data-[state=active]:font-semibold data-[state=active]:text-brand-700",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      // Radix le pone `tabIndex=0` al panel: entra en el orden del Tab, y con
      // teclado tiene que verse dónde está el foco.
      className={cn(
        "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
