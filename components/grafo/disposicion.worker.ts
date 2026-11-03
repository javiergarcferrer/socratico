/// <reference lib="webworker" />
/**
 * La disposición del lienzo, fuera del hilo de la interfaz: ForceAtlas2
 * (`graphology-layout-forceatlas2`) con un número **fijo** de iteraciones a
 * partir de las posiciones de partida puras de `modelo.ts`. Sin azar: el
 * mismo pedido da las mismas posiciones, que es lo que deja a un enlace
 * reproducir el dibujo. Los nodos fijados no se mueven (`fixed`).
 *
 * Lo carga `motor.ts` con `new Worker(new URL(...), import.meta.url)`, que
 * webpack empaqueta aparte; nada de esto llega al bundle de la página.
 */
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";

export interface PedidoDisposicion {
  id: number;
  /** Las posiciones de partida, `x, y` por nodo, en el orden de `fijos`. */
  posiciones: Float64Array;
  /** 1 si el nodo está fijado (no se mueve). */
  fijos: Uint8Array;
  /** Pares de índices de nodo, una arista por par. */
  aristas: Uint32Array;
}

export interface RespuestaDisposicion {
  id: number;
  posiciones: Float64Array;
  iteraciones: number;
  ms: number;
}

/** Cuántas iteraciones según el tamaño: las bastantes para asentarse, sin pasar de un segundo en 2 000 nodos. */
export function iteracionesPara(n: number): number {
  if (n <= 150) return 300;
  if (n <= 600) return 180;
  return 100;
}

const ambito = self as unknown as DedicatedWorkerGlobalScope;

ambito.onmessage = (e: MessageEvent<PedidoDisposicion>) => {
  const t0 = performance.now();
  const { id, posiciones, fijos, aristas } = e.data;
  const n = fijos.length;
  const g = new Graph({ type: "undirected", multi: false, allowSelfLoops: false });
  for (let i = 0; i < n; i++) g.addNode(i, { x: posiciones[2 * i], y: posiciones[2 * i + 1], fixed: fijos[i] === 1 });
  for (let k = 0; k + 1 < aristas.length; k += 2) {
    const a = aristas[k];
    const b = aristas[k + 1];
    if (a !== b && !g.hasEdge(a, b)) g.addEdge(a, b);
  }
  const iteraciones = iteracionesPara(n);
  const ajustes = forceAtlas2.inferSettings(g);
  forceAtlas2.assign(g, {
    iterations: iteraciones,
    // `outboundAttractionDistribution`: los cubos (un ministerio con sus cargos y sus compras) se apartan y sus radios se
    // abren; con la red del Ministerio de Hacienda abierta a cinco saltos, la distancia mediana al vecino más cercano pasa
    // de 33 a 56 px (2026-11-03).
    settings: {
      ...ajustes,
      outboundAttractionDistribution: true,
      barnesHutOptimize: n > 400,
      adjustSizes: false,
      slowDown: 1 + Math.log10(Math.max(1, n)),
    },
  });
  const salida = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    const a = g.getNodeAttributes(i);
    salida[2 * i] = a.x;
    salida[2 * i + 1] = a.y;
  }
  const respuesta: RespuestaDisposicion = { id, posiciones: salida, iteraciones, ms: performance.now() - t0 };
  ambito.postMessage(respuesta, [salida.buffer]);
};
