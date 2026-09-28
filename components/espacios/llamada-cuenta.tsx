"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconArrowRight, IconUser } from "@/components/icons";
import { cn } from "@/lib/cn";
import { useHaySesion } from "./presencia";

/**
 * La llamada a la cuenta: «Crear tu cuenta» a quien no tiene, «Ir a tu
 * espacio» a quien sí. Solo lee la presencia de la sesión en el navegador
 * (`presencia.ts`), sin cargar Supabase. Mientras se hidrata dice lo primero:
 * es lo que ve la mayoría y no mueve nada al cambiar.
 *
 * `sobreTinta` es la versión para la banda de tinta de la portada: papel
 * sobre tinta, como la llamada principal que ya había ahí.
 */
export default function LlamadaCuenta({ sobreTinta = false, className }: { sobreTinta?: boolean; className?: string }) {
  const hay = useHaySesion();
  return (
    <Button
      asChild
      size="lg"
      className={cn(sobreTinta && "bg-canvas text-ink hover:bg-surface", className)}
    >
      <Link href={hay ? "/espacio" : "/cuenta"}>
        <IconUser className="h-4 w-4" />
        {hay ? "Ir a tu espacio" : "Crear tu cuenta"}
        <IconArrowRight className="h-4 w-4" />
      </Link>
    </Button>
  );
}
