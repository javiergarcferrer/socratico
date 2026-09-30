import Link from "next/link";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { EstadoVacio } from "@/components/estado-vacio";
import { Ruta } from "@/components/ruta";
import { formatInt } from "@/lib/nomina";
import { enlace, nodoDeRuta, rutaDeNodo } from "@/lib/grafo";
import { CLASE_DE_TIPO, TOPE_CAMINO, camino, vecindario } from "@/lib/grafo-rdf";

/**
 * El camino más corto entre dos fichas del grafo (`lib/grafo-rdf.ts`,
 * `camino`): búsqueda en anchura desde los dos extremos, acotada en saltos y
 * en fichas abiertas, y el resultado dice cuánto se buscó. Cada paso es un
 * nodo con su enlace; entre dos pasos, la arista que los une, sin dirección.
 *
 * No se indexa ni se rastrea (`robots.ts`): cada par es una búsqueda.
 */

export const revalidate = 86400;
// Abrir hasta 400 fichas puede tomar varios segundos la primera vez; luego el par queda en caché.
export const maxDuration = 60;

type Props = { searchParams: Promise<{ de?: string; a?: string }> };

export const metadata: Metadata = {
  title: "Camino en el grafo",
  robots: { index: false, follow: false },
};

export default async function CaminoPage({ searchParams }: Props) {
  const { de, a } = await searchParams;
  const nDe = de ? nodoDeRuta(de.slice(0, 200)) : null;
  const nA = a ? nodoDeRuta(a.slice(0, 200)) : null;
  const [vDe, vA] = await Promise.all([nDe ? vecindario(nDe) : null, nA ? vecindario(nA) : null]);

  if (!vDe || !vA) {
    return (
      <div className="mx-auto max-w-3xl">
        <Ruta raiz={{ href: enlace.grafo(), label: "El grafo" }} actual="Camino" />
        <EstadoVacio como="h1" titulo="Para buscar un camino hacen falta dos fichas del grafo." className="mt-6">
          Abre una ficha en{" "}
          <Link href={enlace.grafo()} className="text-brand-700 underline">
            el grafo
          </Link>{" "}
          y elige la otra en «¿Cómo se liga con otra ficha?».
        </EstadoVacio>
      </div>
    );
  }

  const r = await camino(vDe.nodo, vA.nodo);
  const saltos = r.pasos ? r.pasos.length - 1 : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Ruta
        raiz={{ href: enlace.grafo(), label: "El grafo" }}
        padre={{ href: enlace.grafo(rutaDeNodo(vDe.nodo)), label: vDe.titulo }}
        actual="Camino"
      />
      <header>
        <p className="rotulo text-ink-soft">Camino en el grafo</p>
        <h1 className="mt-1.5 font-display text-2xl leading-tight text-ink sm:text-3xl">
          ¿Cómo se liga {vDe.titulo} con {vA.titulo}?
        </h1>
        <p className="mt-2 text-sm text-ink-soft" aria-live="polite">
          {r.pasos ? `${saltos === 1 ? "Un salto" : `${saltos} saltos`}: el camino más corto que encontramos.` : "Sin camino."}{" "}
          {r.exploradas === 1 ? "Se abrió una ficha" : `Se abrieron ${formatInt(r.exploradas)} fichas`}, con un tope de{" "}
          {formatInt(TOPE_CAMINO.fichas)} fichas y {r.maxSaltos} saltos.
        </p>
      </header>

      {r.pasos ? (
        <Card as="section" aria-label="El camino, paso a paso">
          <ol className="px-5 py-4 sm:px-6">
            {r.pasos.map((p, i) => (
              <li key={`${p.nodo.tipo}:${p.nodo.id}`} className="relative">
                {p.via && (
                  <p className="border-l-2 border-hairline py-2 pl-4 text-xs leading-relaxed text-ink-soft">{p.via}</p>
                )}
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-xs tabular-nums text-ink-soft" aria-hidden>
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <Link
                      href={enlace.grafo(rutaDeNodo(p.nodo))}
                      className="inline-flex min-h-11 items-center text-[15px] font-medium leading-snug text-ink hover:text-brand-700 sm:min-h-0"
                    >
                      {p.nombre}
                    </Link>
                    <p className="text-xs text-ink-soft">{CLASE_DE_TIPO[p.nodo.tipo]}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      ) : (
        <EstadoVacio
          titulo={r.motivo === "agotado" ? "No encontramos un camino entre estas dos fichas." : "No encontramos un camino antes del tope."}
        >
          {r.motivo === "agotado"
            ? "Se abrieron todas las fichas a las que se llega desde ellas y ninguna cadena las une. Hay aristas que una ficha no dice de sí misma (una institución solo describe sus cargos de hoy): un camino que pase por ellas no se ve desde aquí."
            : r.motivo === "fichas"
              ? `Se abrieron ${formatInt(r.exploradas)} fichas sin que los dos lados se tocaran. Puede haber un camino más largo: prueba desde una ficha intermedia.`
              : `Ninguna cadena de hasta ${r.maxSaltos} saltos las une. Puede haber una más larga: prueba desde una ficha intermedia.`}
        </EstadoVacio>
      )}

      <p className="border-t border-hairline pt-4 text-xs leading-relaxed text-ink-soft">
        Un camino dice que una cadena de registros del Estado (cargos, decretos, supervisiones) toca las dos fichas,
        no que haya una relación personal entre ellas. Se toman las aristas sin dirección y de las mismas instantáneas
        que pintan cada ficha.
      </p>
    </div>
  );
}
