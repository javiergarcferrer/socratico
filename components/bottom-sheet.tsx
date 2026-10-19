"use client";

import { cn } from "@/lib/cn";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

/**
 * La hoja que sube desde el borde inferior en el teléfono: los filtros del
 * buscador viven aquí.
 *
 * Antes era una implementación a mano —transformaciones, bloqueo del
 * desplazamiento del cuerpo, un `keydown` para Escape y un botón de fondo
 * haciendo de velo—. Funcionaba, pero le faltaba lo que nadie ve hasta que lo
 * necesita: el foco no quedaba atrapado dentro de la hoja, así que tabular
 * seguía recorriendo la página de debajo, y al cerrar el foco no volvía al
 * control que la abrió. Radix lo trae resuelto, y es la razón de que estas
 * primitivas entren al repositorio. Hoy va sobre `ui/drawer` (vaul, que por
 * debajo es ese mismo `Dialog` de Radix), que añade el arrastre hacia abajo
 * para cerrarla desde la cabecera.
 *
 * Se mantiene el `lg:hidden`: en pantalla ancha los filtros están a la vista y
 * esta hoja no tiene por qué existir.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Clases de la hoja: se abre en un portal, fuera del ámbito de quien la llama (el banco le pone el tema Blueprint). */
  className?: string;
}) {
  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className={cn("max-h-[90dvh] lg:hidden", className)}>
        <DrawerHeader>
          <DrawerTitle className="text-base tracking-tight">{title}</DrawerTitle>
        </DrawerHeader>
        <DrawerBody className="px-5">{children}</DrawerBody>
        {footer && (
          <DrawerFooter
            className="p-4"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            {footer}
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}
