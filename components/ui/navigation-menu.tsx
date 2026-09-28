"use client";

/**
 * Menú de navegación con paneles — el `NavigationMenu` de shadcn sobre Radix,
 * vestido con la identidad.
 *
 * Radix aporta lo difícil: teclado (flechas entre disparadores, Tab dentro del
 * panel, Escape para cerrar), `aria-expanded`, la espera antes de abrir al
 * pasar el puntero y el cierre al salir. La casa aporta el vestido: el
 * disparador vive sobre la banda de tinta del header (variante `tinta`), y el
 * panel es una hoja de papel con filete que se apoya bajo el header —flota de
 * verdad, así que lleva `shadow-card`— y abre con el movimiento corto de las
 * demás capas (`.capa`).
 *
 * El `Viewport` se ancla al header entero (`absolute inset-x-0 top-full`), no
 * al disparador: un megamenú es tan ancho como la columna de la página.
 */

import * as React from "react";
import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu";

import { cn } from "@/lib/cn";
import { IconChevronDown } from "@/components/icons";

function NavigationMenu({
  className,
  children,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Root>) {
  return (
    <NavigationMenuPrimitive.Root
      data-slot="navigation-menu"
      className={cn("flex items-center", className)}
      {...props}
    >
      {children}
      <NavigationMenuViewport />
    </NavigationMenuPrimitive.Root>
  );
}

function NavigationMenuList({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.List>) {
  return (
    <NavigationMenuPrimitive.List
      data-slot="navigation-menu-list"
      className={cn("flex items-center gap-0.5", className)}
      {...props}
    />
  );
}

function NavigationMenuItem({
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Item>) {
  return <NavigationMenuPrimitive.Item data-slot="navigation-menu-item" {...props} />;
}

/** El disparador sobre la tinta: sustantivo, galón y el estado activo en papel. */
const disparador = cn(
  "cabecera-puerta group inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium tracking-[0.005em] text-canvas/78 transition-colors",
  "hover:text-canvas data-[state=open]:text-canvas",
  // La raya de papel debajo se dibuja al apuntar y queda entera en la puerta
  // que contiene la página actual: dice «estás aquí» sin competir con el
  // panel abierto. El dibujo vive en `.cabecera-puerta` (app/globals.css).
  "relative after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:rounded-sm after:bg-canvas",
  "data-[activo=true]:text-canvas",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canvas/50",
);

function NavigationMenuTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Trigger>) {
  return (
    <NavigationMenuPrimitive.Trigger
      data-slot="navigation-menu-trigger"
      className={cn(disparador, className)}
      {...props}
    >
      {children}
      <IconChevronDown
        aria-hidden
        className="h-3.5 w-3.5 opacity-60 group-data-[state=open]:rotate-180"
      />
    </NavigationMenuPrimitive.Trigger>
  );
}

function NavigationMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Content>) {
  return (
    <NavigationMenuPrimitive.Content
      data-slot="navigation-menu-content"
      className={cn("w-full", className)}
      {...props}
    />
  );
}

function NavigationMenuViewport({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Viewport>) {
  return (
    <div className="absolute inset-x-0 top-full flex justify-center px-4">
      <NavigationMenuPrimitive.Viewport
        data-slot="navigation-menu-viewport"
        className={cn(
          "capa relative mt-2 w-full max-w-6xl origin-top overflow-hidden rounded-lg border border-hairline bg-surface text-ink shadow-card",
          "h-[var(--radix-navigation-menu-viewport-height)]",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function NavigationMenuLink({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Link>) {
  return (
    <NavigationMenuPrimitive.Link
      data-slot="navigation-menu-link"
      className={cn(className)}
      {...props}
    />
  );
}

export {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuViewport,
  NavigationMenuLink,
  disparador as navigationMenuDisparador,
};
