"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { IconUser } from "@/components/icons";
import { useHaySesion } from "./presencia";

/**
 * La puerta de la cuenta en la cabecera: «Entrar» sin sesión, «Tu espacio»
 * con ella. Mientras se hidrata no pinta palabra —no se sabe cuál es— pero
 * guarda el sitio, para que «Buscar» no salte.
 *
 * En el teléfono queda el ícono con su nombre para el lector de pantalla: la
 * franja es de la marca y de «Buscar», que es lo que se pulsa con el pulgar.
 */
export default function PuertaCuenta() {
  const hay = useHaySesion();
  const pathname = usePathname();
  const volver = pathname && pathname !== "/" && !pathname.startsWith("/cuenta") ? pathname : null;
  const href = hay ? "/espacio" : `/cuenta${volver ? `?volver=${encodeURIComponent(volver)}` : ""}`;
  const texto = hay ? "Tu espacio" : "Entrar";
  const activo = pathname === "/espacio" || pathname.startsWith("/espacio/") || pathname === "/cuenta";
  return (
    <Button asChild variant="tinta" size="icon" className="w-auto gap-1.5 px-2.5 sm:w-auto sm:px-3" data-activo={activo}>
      <Link href={href} aria-label={hay === null ? "Tu cuenta" : texto}>
        <IconUser className="h-5 w-5" />
        <span className="hidden text-sm font-medium md:inline" aria-hidden={hay === null}>
          {hay === null ? " " : texto}
        </span>
      </Link>
    </Button>
  );
}
