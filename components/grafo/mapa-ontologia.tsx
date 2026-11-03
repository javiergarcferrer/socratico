"use client";

/**
 * El mapa de la ontología: la TBox de `lib/ontologia.ts` como grafo, en el
 * mismo motor que el lienzo (`sigma` sobre `graphology`, ForceAtlas2 en el
 * mismo trabajador, `disposicion.worker.ts`). Lo que dibuja sale entero de
 * `modelo-ontologia.ts` (función pura): las clases como nodos del tamaño de
 * sus instancias, «es un caso de» como trazo de tinta, cada propiedad de
 * objeto entre los pares dominio → rango observados en el grafo con el grosor
 * de sus triples, punteada si el grafo todavía no la usa, y, con el
 * interruptor, las alineaciones con los vocabularios de fuera.
 *
 * Se monta con `next/dynamic({ ssr: false })` desde
 * `components/explorador/ontologia.tsx`, solo desde `lg`; la tabla
 * equivalente, el panel de la selección y el interruptor viven allí y no
 * dependen de este dibujo. Teclado: Tab entra, las flechas van a la clase
 * más cercana en esa dirección, Enter la abre; A recorre sus aristas.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import { EdgeRectangleProgram, NodeCircleProgram } from "sigma/rendering";
import type { Settings } from "sigma/settings";
import type { NodeDisplayData, PartialButFor } from "sigma/types";
import { Button } from "@/components/ui/button";
import { IconEncuadrar, IconMinus, IconPlus } from "@/components/icons";
import { formatInt } from "@/lib/nomina";
import { cn } from "@/lib/cn";
import { EdgePunteadaProgram } from "./arista-punteada";
import { curva, duracion, leerPaleta, type Paleta } from "./motor";
import type { PedidoDisposicion, RespuestaDisposicion } from "./disposicion.worker";
import type { AristaMapa, ClaseNodo, Mapa, NodoMapa } from "./modelo-ontologia";

interface AtrNodo {
  x: number;
  y: number;
  size: number;
  color: string;
  label: string;
  tipoEtiqueta: string;
  clase: ClaseNodo;
}

interface AtrArista {
  size: number;
  color: string;
  label: string;
  clave: string;
  tipo: AristaMapa["tipo"];
  definida: boolean;
}

/** El paso de la paleta de cada clase de nodo (`--color-grafico-N`); la definida va en «otros». */
export const PASO_NODO: Record<ClaseNodo, number | null> = { clase: 0, concepto: 2, externa: 4, definida: null };

const TAM_NOMBRE = 13;
const TAM_TIPO = 12;

/** Lo que se escribe bajo el nombre de un nodo: qué es y cuántas instancias tiene. */
export function tipoDeNodo(n: NodoMapa): string {
  if (n.clase === "concepto") return "Vocabulario controlado";
  if (n.clase === "externa") return "De fuera";
  if (n.clase === "definida") return "Definida, sin instancias";
  return `${formatInt(n.instancias ?? 0)} instancias`;
}

/** El grosor de una relación: logarítmico en sus triples, para que 80 mil no tapen a 40. */
export function grosor(a: AristaMapa): number {
  if (a.tipo === "caso") return 2;
  if (a.tipo === "alineacion" || a.definida) return 1;
  return 1 + 1.1 * Math.log10(1 + a.triples);
}

export function rotuloArista(a: AristaMapa): string {
  if (a.tipo === "relacion") return a.definida ? `${a.rotulo} · definida, sin uso` : `${a.rotulo} · ${formatInt(a.triples)} triples`;
  return a.rotulo;
}

function reducido(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const FLECHAS: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

function recortar(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

type DatosRotulo = PartialButFor<NodeDisplayData, "x" | "y" | "size" | "label" | "color"> & Partial<AtrNodo> & { foco?: boolean };

export function MapaOntologia({
  mapa,
  clase,
  seleccion,
  onNodo,
  onArista,
}: {
  mapa: Mapa;
  /** La clase abierta en la ficha: se realza con sus vecinas. */
  clase: string | null;
  /** La arista elegida (su clave), si hay. */
  seleccion: string | null;
  /** Un nodo tocado o abierto con Enter. */
  onNodo: (curie: string) => void;
  /** Una arista tocada (o recorrida con A). */
  onArista: (clave: string) => void;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const sigma = useRef<Sigma<AtrNodo, AtrArista> | null>(null);
  const grafo = useRef(new Graph<AtrNodo, AtrArista>({ type: "undirected", multi: true, allowSelfLoops: false }));
  const paleta = useRef<Paleta | null>(null);
  const trabajador = useRef<Worker | null>(null);
  const pedido = useRef(0);
  const [dispuesto, setDispuesto] = useState(false);
  const [foco, setFoco] = useState<string | null>(null);
  const [sobre, setSobre] = useState<{ nodo: string | null; arista: string | null }>({ nodo: null, arista: null });
  const [anuncio, setAnuncio] = useState("");
  const [falla, setFalla] = useState(false);
  const vista = useRef({ clase, seleccion, foco, sobre });
  vista.current = { clase, seleccion, foco, sobre };
  const callbacks = useRef({ onNodo, onArista });
  callbacks.current = { onNodo, onArista };

  /* --------------------------------------------------------- el motor */

  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    let s: Sigma<AtrNodo, AtrArista>;
    try {
      const p = leerPaleta(el);
      paleta.current = p;
      const quieto = reducido();
      const ajustes: Partial<Settings<AtrNodo, AtrArista>> = {
        renderLabels: true,
        renderEdgeLabels: true,
        labelFont: p.fuente,
        labelSize: TAM_NOMBRE,
        labelWeight: "500",
        labelColor: { color: p.tinta },
        edgeLabelFont: p.fuente,
        edgeLabelSize: TAM_TIPO,
        edgeLabelColor: { color: p.tintaSuave },
        labelDensity: 1,
        labelGridCellSize: 120,
        labelRenderedSizeThreshold: 0,
        zIndex: true,
        stagePadding: 70,
        enableEdgeEvents: true,
        zoomDuration: quieto ? 0 : duracion(el),
        inertiaDuration: quieto ? 0 : duracion(el, "--dur-breve"),
        doubleClickZoomingDuration: quieto ? 0 : duracion(el),
        nodeProgramClasses: { circle: NodeCircleProgram },
        edgeProgramClasses: { rect: EdgeRectangleProgram, punteada: EdgePunteadaProgram },
        defaultNodeType: "circle",
        defaultEdgeType: "rect",
        defaultDrawNodeLabel: (ctx, d, st) => rotulo(ctx, d as DatosRotulo, st.labelFont),
        defaultDrawNodeHover: (ctx, d, st) => caja(ctx, d as DatosRotulo, st.labelFont),
        nodeReducer: (n, a) => reducirNodo(n, a),
        edgeReducer: (e, a) => reducirArista(e, a),
      };
      s = new Sigma(grafo.current, el, ajustes);
    } catch {
      setFalla(true);
      return;
    }
    sigma.current = s;
    s.on("clickNode", ({ node }) => {
      setFoco(node);
      callbacks.current.onNodo(node);
    });
    s.on("enterNode", ({ node }) => {
      el.style.cursor = "pointer";
      setSobre((x) => ({ ...x, nodo: node }));
    });
    s.on("leaveNode", () => {
      el.style.cursor = "";
      setSobre((x) => ({ ...x, nodo: null }));
    });
    s.on("enterEdge", ({ edge }) => {
      el.style.cursor = "pointer";
      setSobre((x) => ({ ...x, arista: grafo.current.getEdgeAttribute(edge, "clave") }));
    });
    s.on("leaveEdge", () => {
      el.style.cursor = "";
      setSobre((x) => ({ ...x, arista: null }));
    });
    s.on("clickEdge", ({ edge }) => callbacks.current.onArista(grafo.current.getEdgeAttribute(edge, "clave")));
    return () => {
      trabajador.current?.terminate();
      trabajador.current = null;
      s.getCamera().removeAllListeners();
      s.kill();
      sigma.current = null;
    };
    // El motor vive lo que vive el componente; los reductores leen `vista` por referencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function rotulo(ctx: CanvasRenderingContext2D, d: DatosRotulo, fuente: string) {
    const p = paleta.current;
    if (!d.label || !p) return;
    const x = d.x + d.size + 4;
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = p.papel;
    ctx.font = `500 ${TAM_NOMBRE}px ${fuente}`;
    const nombre = recortar(d.label, 40);
    ctx.strokeText(nombre, x, d.y + 1);
    ctx.fillStyle = p.tinta;
    ctx.fillText(nombre, x, d.y + 1);
    if (d.tipoEtiqueta) {
      ctx.font = `400 ${TAM_TIPO}px ${fuente}`;
      ctx.strokeText(d.tipoEtiqueta, x, d.y + 1 + TAM_TIPO + 2);
      ctx.fillStyle = p.tintaSuave;
      ctx.fillText(d.tipoEtiqueta, x, d.y + 1 + TAM_TIPO + 2);
    }
  }

  /** La caja del nodo enfocado o bajo el puntero: papel plano, filete, sin sombra; el foco con el filete de la firma. */
  function caja(ctx: CanvasRenderingContext2D, d: DatosRotulo, fuente: string) {
    const p = paleta.current;
    if (!p) return;
    const nombre = recortar(d.label ?? "", 48);
    const tipo = d.tipoEtiqueta ?? "";
    ctx.font = `600 ${TAM_NOMBRE}px ${fuente}`;
    const w1 = ctx.measureText(nombre).width;
    ctx.font = `400 ${TAM_TIPO}px ${fuente}`;
    const w2 = ctx.measureText(tipo).width;
    const x = d.x + d.size + 6;
    const y = d.y - TAM_NOMBRE;
    ctx.shadowBlur = 0;
    ctx.fillStyle = p.papel;
    ctx.strokeStyle = d.foco ? p.firma : p.filete;
    ctx.lineWidth = d.foco ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(x - 6, y - 4, Math.max(w1, w2) + 16, TAM_NOMBRE + TAM_TIPO + 16, 4);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.size + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = p.tinta;
    ctx.font = `600 ${TAM_NOMBRE}px ${fuente}`;
    ctx.fillText(nombre, x + 2, y + TAM_NOMBRE);
    ctx.fillStyle = p.tintaSuave;
    ctx.font = `400 ${TAM_TIPO}px ${fuente}`;
    ctx.fillText(tipo, x + 2, y + TAM_NOMBRE + TAM_TIPO + 4);
  }

  /** Lo realzado: la clase abierta (o la enfocada) con sus vecinas; la arista elegida con sus dos extremos. */
  function enfasis(): Set<string> | null {
    const g = grafo.current;
    const v = vista.current;
    const centro = v.foco ?? v.clase;
    const salida = new Set<string>();
    if (v.seleccion) {
      g.forEachEdge((_e, a, s, t) => {
        if (a.clave === v.seleccion) salida.add(s).add(t);
      });
    }
    if (centro && g.hasNode(centro)) {
      salida.add(centro);
      g.forEachNeighbor(centro, (n) => salida.add(n));
    }
    return salida.size ? salida : null;
  }
  const cacheEnfasis = useRef<Set<string> | null>(null);

  function reducirNodo(n: string, a: AtrNodo): Partial<NodeDisplayData> & AtrNodo & { foco?: boolean } {
    const v = vista.current;
    const p = paleta.current!;
    const e = cacheEnfasis.current;
    const salida: Partial<NodeDisplayData> & AtrNodo & { foco?: boolean } = { ...a, zIndex: 1 };
    if (e && !e.has(n)) {
      salida.color = p.rejilla;
      salida.label = "";
      salida.zIndex = 0;
    } else if (e) salida.forceLabel = true;
    if (n === (v.foco ?? v.clase)) {
      salida.highlighted = true;
      salida.foco = true;
      salida.zIndex = 2;
    }
    return salida;
  }

  function reducirArista(e: string, a: AtrArista): Partial<AtrArista> & { hidden?: boolean; zIndex?: number; forceLabel?: boolean; type?: string } {
    const v = vista.current;
    const p = paleta.current!;
    const [s, t] = grafo.current.extremities(e);
    const centro = v.foco ?? v.clase;
    const senalada = a.clave === v.seleccion || a.clave === v.sobre.arista;
    const delCentro = centro != null && (s === centro || t === centro);
    const enf = cacheEnfasis.current;
    const apagada = enf && !(enf.has(s) && enf.has(t));
    return {
      ...a,
      label: senalada || delCentro ? a.label : "",
      forceLabel: senalada,
      color: senalada ? p.tinta : apagada ? p.rejilla : a.tipo === "caso" ? p.tinta : delCentro ? p.tintaSuave : p.rejilla,
      size: senalada ? a.size + 1.5 : apagada ? 1 : a.size,
      zIndex: senalada ? 2 : delCentro ? 1 : 0,
      type: a.definida ? "punteada" : "rect",
    };
  }

  /* ---------------------------------------------------- la red y su disposición */

  useEffect(() => {
    const s = sigma.current;
    const p = paleta.current;
    if (!s || !p) return;
    const g = grafo.current;
    g.clear();
    const nodos = [...mapa.nodos.values()];
    for (const n of nodos) {
      const paso = PASO_NODO[n.clase];
      g.addNode(n.curie, {
        x: n.sx,
        y: n.sy,
        size: n.instancias ? 3 + 1.4 * Math.log10(1 + n.instancias) : 3,
        color: paso == null ? p.otros : p.familias[paso],
        label: n.etiqueta,
        tipoEtiqueta: tipoDeNodo(n),
        clase: n.clase,
      });
    }
    for (const a of mapa.aristas) {
      g.addEdge(a.de, a.a, { size: grosor(a), color: p.rejilla, label: rotuloArista(a), clave: a.clave, tipo: a.tipo, definida: a.definida });
    }
    cacheEnfasis.current = enfasis();
    // La disposición pura: posiciones de partida del modelo, iteraciones fijas en el trabajador.
    const indice = new Map(nodos.map((n, i) => [n.curie, i]));
    const posiciones = new Float64Array(nodos.length * 2);
    nodos.forEach((n, i) => {
      posiciones[2 * i] = n.sx;
      posiciones[2 * i + 1] = n.sy;
    });
    const pares = new Uint32Array(mapa.aristas.length * 2);
    mapa.aristas.forEach((a, k) => {
      pares[2 * k] = indice.get(a.de)!;
      pares[2 * k + 1] = indice.get(a.a)!;
    });
    const mostrar = () => {
      setDispuesto(true);
      s.refresh();
    };
    try {
      if (!trabajador.current) trabajador.current = new Worker(new URL("./disposicion.worker.ts", import.meta.url));
    } catch {
      return mostrar();
    }
    const id = ++pedido.current;
    trabajador.current.onmessage = (e: MessageEvent<RespuestaDisposicion>) => {
      if (e.data.id !== pedido.current) return;
      nodos.forEach((n, i) => g.mergeNodeAttributes(n.curie, { x: e.data.posiciones[2 * i], y: e.data.posiciones[2 * i + 1] }));
      // Una clase sin aristas (definida y suelta) no la sujeta nada: ForceAtlas2 la aleja y encoge el resto. Va en fila al pie.
      const sueltas = g.filterNodes((n) => g.degree(n) === 0);
      const ligadas = g.filterNodes((n) => g.degree(n) > 0);
      if (sueltas.length && ligadas.length) {
        const xs = ligadas.map((n) => g.getNodeAttribute(n, "x"));
        const ys = ligadas.map((n) => g.getNodeAttribute(n, "y"));
        const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        const paso = (x1 - x0) / Math.max(1, sueltas.length);
        sueltas.sort().forEach((n, i) => g.mergeNodeAttributes(n, { x: x0 + paso * (i + 0.5), y: y0 - (y1 - y0) * 0.08 }));
      }
      mostrar();
    };
    trabajador.current.onerror = mostrar;
    const pedidoD: PedidoDisposicion = { id, posiciones, fijos: new Uint8Array(nodos.length), aristas: pares };
    trabajador.current.postMessage(pedidoD, [posiciones.buffer, pedidoD.fijos.buffer, pares.buffer]);
  }, [mapa]);

  useEffect(() => {
    cacheEnfasis.current = enfasis();
    sigma.current?.refresh({ skipIndexation: true });
    // `enfasis` lee la vista del momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clase, seleccion, foco, sobre]);

  /* ------------------------------------------------------------ teclado */

  const enDireccion = (desde: string | null, dx: number, dy: number): string | null => {
    const s = sigma.current;
    const g = grafo.current;
    if (!s || !g.order) return null;
    const pos = (n: string) => s.graphToViewport(g.getNodeAttributes(n));
    if (!desde || !g.hasNode(desde)) {
      const { width, height } = s.getDimensions();
      return g.nodes().reduce((m, n) => {
        const a = pos(n);
        const b = pos(m);
        return Math.hypot(a.x - width / 2, a.y - height / 2) < Math.hypot(b.x - width / 2, b.y - height / 2) ? n : m;
      });
    }
    const o = pos(desde);
    let mejor: string | null = null;
    let puntaje = Infinity;
    g.forEachNode((n) => {
      if (n === desde) return;
      const q = pos(n);
      const vx = q.x - o.x;
      const vy = q.y - o.y;
      const d = Math.hypot(vx, vy);
      if (!d) return;
      const alineado = (vx * dx + vy * dy) / d;
      if (alineado < 0.5) return;
      const x = d * (2 - alineado);
      if (x < puntaje) {
        puntaje = x;
        mejor = n;
      }
    });
    return mejor;
  };

  const nombreDe = (curie: string) => mapa.nodos.get(curie)?.etiqueta ?? curie;
  const describir = (curie: string) => {
    const n = mapa.nodos.get(curie);
    if (!n) return "";
    const grado = sigma.current ? grafo.current.degree(curie) : 0;
    return `${n.etiqueta}, ${tipoDeNodo(n).toLowerCase()}, ${grado} ${grado === 1 ? "arista" : "aristas"}. Enter la abre; A recorre sus aristas.`;
  };

  const onTecla = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const s = sigma.current;
    if (!s) return;
    const flecha = FLECHAS[e.key];
    if (flecha) {
      e.preventDefault();
      const n = enDireccion(foco ?? clase, flecha[0], flecha[1]);
      if (n) {
        setFoco(n);
        setAnuncio(describir(n));
      } else setAnuncio("No hay más clases en esa dirección.");
    } else if ((e.key === "Enter" || e.key === " ") && (foco ?? clase)) {
      e.preventDefault();
      onNodo((foco ?? clase)!);
    } else if ((e.key === "a" || e.key === "A") && (foco ?? clase)) {
      e.preventDefault();
      const centro = (foco ?? clase)!;
      const suyas = [...new Set(grafo.current.mapEdges(centro, (_e, a) => a.clave))];
      if (!suyas.length) return setAnuncio("Esta clase no tiene aristas en el mapa.");
      const i = seleccion ? suyas.indexOf(seleccion) : -1;
      const siguiente = suyas[(i + (e.shiftKey ? -1 : 1) + suyas.length) % suyas.length];
      onArista(siguiente);
      const a = mapa.aristas.find((x) => x.clave === siguiente)!;
      setAnuncio(`${nombreDe(a.de)}, ${rotuloArista(a)}, ${nombreDe(a.a)}. ${suyas.indexOf(siguiente) + 1} de ${suyas.length}.`);
    } else if (e.key === "+" || e.key === "=") {
      void s.getCamera().animatedZoom({ duration: reducido() ? 0 : duracion(contenedor.current!, "--dur-breve"), factor: 1.5 });
    } else if (e.key === "-") {
      void s.getCamera().animatedUnzoom({ duration: reducido() ? 0 : duracion(contenedor.current!, "--dur-breve"), factor: 1.5 });
    } else if (e.key === "0") {
      void s.getCamera().animatedReset({ duration: reducido() ? 0 : duracion(contenedor.current!), easing: curva(contenedor.current!) });
    }
  };

  const zoom = (f: number) => {
    const s = sigma.current;
    if (!s) return;
    const d = reducido() ? 0 : duracion(contenedor.current!, "--dur-breve");
    void (f > 1 ? s.getCamera().animatedUnzoom({ duration: d, factor: f }) : s.getCamera().animatedZoom({ duration: d, factor: 1 / f }));
  };

  const sobreArista = useMemo(() => (sobre.arista ? (mapa.aristas.find((a) => a.clave === sobre.arista) ?? null) : null), [sobre.arista, mapa]);

  if (falla) {
    return (
      <p className="text-sm text-ink-soft">
        Este navegador no pudo dibujar el mapa (necesita WebGL). La tabla de abajo trae cada clase y cada relación.
      </p>
    );
  }

  return (
    <div data-mapa-ontologia="" data-dispuesto={dispuesto ? "" : undefined} data-nodos={mapa.nodos.size} data-aristas={mapa.aristas.length} className="space-y-2">
      <div className="relative">
        <div
          ref={contenedor}
          tabIndex={0}
          role="application"
          aria-roledescription="mapa de la ontología"
          aria-label="Las clases de la ontología y sus relaciones. Flechas para ir de una clase a otra, Enter para abrirla, A para recorrer sus aristas."
          onKeyDown={onTecla}
          onFocus={() => {
            if (!foco && !clase) {
              const n = enDireccion(null, 0, 0);
              if (n) {
                setFoco(n);
                setAnuncio(describir(n));
              }
            }
          }}
          onBlur={() => setFoco(null)}
          className={cn(
            "h-[min(70vh,38rem)] w-full rounded-lg border border-hairline bg-surface outline-none focus-visible:ring-2 focus-visible:ring-ring",
            !dispuesto && "invisible",
          )}
        />
        {!dispuesto && (
          <p className="absolute inset-0 grid place-items-center text-sm text-ink-soft">Colocando {formatInt(mapa.nodos.size)} clases…</p>
        )}
        <div className="absolute right-2 top-2 flex gap-1">
          <Button variant="secondary" size="icon-sm" aria-label="Acercar" onClick={() => zoom(1 / 1.5)}>
            <IconPlus className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="icon-sm" aria-label="Alejar" onClick={() => zoom(1.5)}>
            <IconMinus className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon-sm"
            aria-label="Recentrar"
            onClick={() => void sigma.current?.getCamera().animatedReset({ duration: reducido() ? 0 : duracion(contenedor.current!) })}
          >
            <IconEncuadrar className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <p className="min-h-5 text-xs text-ink-soft">
        {sobreArista
          ? `${nombreDe(sobreArista.de)} · ${rotuloArista(sobreArista)} · ${nombreDe(sobreArista.a)}. Tócala para ver sus propiedades y aristas de ejemplo.`
          : "Toca una clase para abrir su ficha, o una arista para ver qué propiedades la forman y aristas de ejemplo del grafo."}
      </p>
      <p aria-live="polite" className="sr-only">
        {anuncio}
      </p>
    </div>
  );
}
