"use client";

import dynamic from "next/dynamic";
import type { Ref } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { EsqueletoLineas } from "@/components/esqueleto";
import type { LienzoApi } from "@/components/grafo/lienzo";
import { SEMILLAS_EN_ENLACE } from "@/components/grafo/estado";

/**
 * WebGL y su disposición solo en el navegador, y en su propio trozo: la
 * portada no carga `sigma` ni `graphology` hasta que el lector abre la red.
 */
const Lienzo = dynamic(() => import("@/components/grafo/lienzo").then((m) => m.Lienzo), {
  ssr: false,
  loading: () => (
    <div role="status" aria-busy="true" className="mt-3 h-[min(70vh,40rem)]">
      <span className="sr-only">Cargando el lienzo…</span>
      <EsqueletoLineas n={6} />
    </div>
  ),
});

/**
 * La red del nodo abierto en el banco de trabajo: el lienzo de varios saltos
 * (`components/grafo/lienzo.tsx`), que parte del nodo y se expande al clic.
 * Lee el mismo índice que el inspector (`claves.nodo`), así que lo que el
 * inspector ya leyó no se pide dos veces. El dibujo no sustituye a la lista:
 * el inspector de al lado la trae entera y es el camino del lector de
 * pantalla; por debajo de `lg` el banco no monta el lienzo y la lista lo
 * reemplaza. `RedVecinos`, la red de un salto en SVG, sigue en `/grafo`
 * como la versión sin JavaScript.
 */
export function RedDelNodo({
  ruta,
  onInspeccionar,
  onCerrar,
  api,
}: {
  ruta: string;
  /** Abre un nodo en el inspector sin sacar al lector del lienzo. */
  onInspeccionar: (ruta: string, titulo: string) => void;
  onCerrar: () => void;
  api?: Ref<LienzoApi>;
}) {
  return (
    <Card as="section" aria-labelledby="red-del-nodo" className="px-4 py-4 sm:px-5">
      <CardTitle id="red-del-nodo">La red, de salto en salto</CardTitle>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Cada nodo abre a sus vecinos en el grafo compilado. El enlace de esta página reproduce lo expandido, los filtros y el camino resaltado; las
        aristas que trae un resultado de SPARQL no viajan en él (se rehacen corriendo la consulta otra vez), ni una vista de más de {SEMILLAS_EN_ENLACE} nodos traídos de fuera. La lista
        completa de cada nodo sigue en el inspector.
      </p>
      <div className="mt-3">
        <Lienzo raiz={ruta} onInspeccionar={onInspeccionar} onCerrar={onCerrar} ref={api} />
      </div>
    </Card>
  );
}
