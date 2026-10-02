import type { TipoIniciativa } from "@/lib/congreso";

/**
 * Los filtros del listado de iniciativas. Todo vive en la URL y se comparte.
 *
 * `tipo` y `perimidas` solo existen dentro de un tema: es lo que el SIL sabe
 * responder (docs/INFRAESTRUCTURA.md §5.5). Sin tema se leen como ausentes, y con tema
 * toman los valores de entrada del propio portal del SIL —proyectos de ley, sin
 * las perimidas—, que la vista enseña como chips de fábrica.
 */
export interface FiltrosCongreso {
  q: string;
  /** Id del tema en `iniciativa/Grupos`, o `null` para el registro entero. */
  tema: number | null;
  tipo: TipoIniciativa;
  perimidas: boolean;
}

export const TIPO_INICIAL: TipoIniciativa = "ley";

/** La URL del listado con estos filtros; los de fábrica no se escriben. */
export function hrefCongreso(f: Partial<FiltrosCongreso>, pagina = 1): string {
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  if (f.tema) {
    sp.set("tema", String(f.tema));
    if (f.tipo && f.tipo !== TIPO_INICIAL) sp.set("tipo", f.tipo);
    if (f.perimidas) sp.set("estado", "perimidas");
  }
  if (pagina > 1) sp.set("page", String(pagina));
  const qs = sp.toString();
  return `/congreso${qs ? `?${qs}` : ""}`;
}
