import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { RedVecinos } from "@/components/graficos";
import { vecinosParaRed } from "@/components/graficos/vecinos-red";
import { RedFiltrable } from "@/components/grafo/red-filtrable";
import { enlace, rutaDeNodo, type NodoRdf } from "@/lib/grafo";
import { vecindario } from "@/lib/grafo-rdf";

/**
 * «¿Con quién se liga?»: la red de un paso de una ficha que es nodo del grafo
 * compilado —el dibujo (`RedVecinos`), su lista filtrable por grupo— y los dos
 * caminos para seguir: la vista del nodo y el camino hacia otra ficha
 * (`/grafo/camino`). No es otro lienzo: es el vecindario de `/grafo?nodo=`.
 */
export async function RedDeFicha({ nodo, className }: { nodo: NodoRdf; className?: string }) {
  const v = await vecindario(nodo);
  if (!v) return null;
  const vecinos = vecinosParaRed(v);
  if (vecinos.length === 0) return null;
  const ruta = rutaDeNodo(nodo);
  return (
    <Card as="section" className={className}>
      <CardHeader>
        <CardTitle>¿Con quién se liga?</CardTitle>
        <CardAction className="font-mono tabular-nums">{vecinos.length}</CardAction>
      </CardHeader>
      <div className="px-5 pb-5">
        <RedVecinos
          centro={v.titulo}
          vecinos={vecinos.slice(0, 18)}
          total={vecinos.length}
          etiqueta={`Las fichas que los registros del Estado ligan con ${v.titulo}`}
        />
        <RedFiltrable vecinos={vecinos} />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link href={enlace.grafo(ruta)} rel="nofollow">Ver toda su red, con cada arista</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/grafo/camino?de=${encodeURIComponent(ruta)}`} rel="nofollow">Buscar el camino a otra ficha</Link>
          </Button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-soft">
          Un paso: lo que los registros cruzados ligan directamente con esta ficha, cada arista con su fuente en la
          vista del grafo. El segundo paso se abre desde cualquiera de ellas.
        </p>
      </div>
    </Card>
  );
}
