import type { VecinoRed } from "@/components/graficos/red-vecinos";
import { formatPesos } from "@/lib/format";
import { enlace, rutaDeNodo } from "@/lib/grafo";
import { GRUPOS, claveNodo, type Vecindario } from "@/lib/grafo-rdf";

/**
 * Los vecinos de un nodo para `RedVecinos`: uno por nodo, en el orden de las
 * aristas —la primera arista es la que se escribe—. Lo comparten la vista de
 * un nodo (`/grafo?nodo=`) y la red de una ficha.
 */
export function vecinosParaRed(v: Vecindario): VecinoRed[] {
  const vistos = new Set<string>();
  const vecinos: VecinoRed[] = [];
  for (const r of v.relaciones) {
    if (!r.nodo) continue;
    const k = claveNodo(r.nodo);
    if (vistos.has(k) || k === claveNodo(v.nodo)) continue;
    vistos.add(k);
    vecinos.push({
      clave: k,
      nombre: r.nombre,
      // El rótulo del tramo ya dice «Cargos»: el cargo va solo; los demás verbos sí dicen algo.
      arista: r.verbo === "Cargo" && r.detalle ? r.detalle : [r.verbo, r.monto != null ? formatPesos(r.monto) : null, r.detalle].filter(Boolean).join(" · "),
      grupo: GRUPOS.find((g) => g.id === r.grupo)!.etiqueta,
      href: enlace.grafo(rutaDeNodo(r.nodo)),
    });
  }
  return vecinos;
}
