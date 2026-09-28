import Link from "next/link";
import { hrefValido, NOMBRE_TIPO, rutaPropia, type TipoEntrada } from "@/lib/espacios";
import { Badge } from "@/components/ui/badge";
import { IconExternal } from "@/components/icons";

/**
 * Cómo se pinta un registro guardado, en la mesa y en `/p`. No importa el
 * cliente de Supabase: `/p` y el tablero público lo usan sin sesión.
 */

/** La marca de tipo de un registro: grafito, porque informa y no pide nada. */
export function MarcaTipo({ tipo }: { tipo: TipoEntrada }) {
  return <Badge variant="neutro">{NOMBRE_TIPO[tipo]}</Badge>;
}

/**
 * El título de un registro, como enlace a su ficha viva. Un documento vive en
 * el sitio de la institución: pestaña nueva y su icono.
 *
 * `ajeno`: lo eligió un lector y lo lee un tercero (`/p`). El enlace lleva
 * `ugc nofollow` y, si sale de la plataforma, se dice a qué sitio antes del toque.
 */
export function EnlaceRegistro({
  titulo,
  href,
  className,
  ajeno = false,
}: {
  titulo: string;
  href: string;
  className?: string;
  ajeno?: boolean;
}) {
  const clase = className ?? "font-medium text-ink hover:text-brand-700 hover:underline";
  // Lo que no pasa el mismo `check` de la tabla se lee, no se pulsa.
  if (!hrefValido(href)) return <span className="font-medium text-ink">{titulo}</span>;
  if (rutaPropia(href)) {
    return (
      <Link href={href} className={clase}>
        {titulo}
      </Link>
    );
  }
  return (
    <>
      <a href={href} target="_blank" rel={ajeno ? "ugc nofollow noopener noreferrer" : "noopener noreferrer"} className={clase}>
        {titulo}
        <IconExternal className="ml-1 inline h-3.5 w-3.5 align-[-2px] text-ink-soft" />
      </a>
      {ajeno && <span className="ml-1.5 font-mono text-xs text-ink-soft">{sitio(href)}</span>}
    </>
  );
}

/** El sitio al que lleva un enlace; si no se puede leer, no se inventa uno. */
function sitio(href: string): string {
  try {
    return new URL(href).hostname;
  } catch {
    return "";
  }
}
