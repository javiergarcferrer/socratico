import Link from "next/link";
import { enlace } from "@/lib/grafo";

/**
 * El título de un documento de una biblioteca institucional como enlace a su
 * ficha (`enlace.documentoDeArchivo`). Un archivo sin ficha —una dirección
 * que no es https o que trae consulta o un `%`: el grafo no la admite como
 * clave— se abre en el sitio de la institución, en otra pestaña, y lo dice.
 */
export function EnlaceDocumento({ url, className, children }: { url: string; className?: string; children: React.ReactNode }) {
  const ficha = enlace.documentoDeArchivo(url);
  if (ficha) {
    return (
      <Link href={ficha} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <span className="sr-only"> (se abre en otra pestaña)</span>
    </a>
  );
}
