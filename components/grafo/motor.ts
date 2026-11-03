/**
 * El motor del lienzo: `graphology` (el grafo en memoria) dibujado por
 * `sigma` en WebGL, con la disposición de ForceAtlas2 en un Web Worker
 * (`disposicion.worker.ts`). Sin React: `lienzo.tsx` lo crea en un `useEffect`
 * y le pasa la red (`modelo.ts`) y la vista (foco, ocultos, «solo esta clase»,
 * camino); `scripts/medir-lienzo.mjs` lo mide a través del mismo componente.
 *
 * Reglas de la identidad que trae puestas (docs/INFRAESTRUCTURA.md §11.11):
 *  - los colores salen de los tokens del tema (`--color-grafico-1…5`,
 *    `-otros`, `-rejilla`, `--color-ink`, `--color-surface`…), leídos del
 *    elemento en que se monta, así que dentro de `.tema-blueprint` toman su
 *    paleta oscura; ningún hex aquí;
 *  - el rótulo escribe el nombre **y el tipo**, a 13 y 12 px con halo del
 *    papel, y la caja del nodo enfocado o bajo el puntero es plana, con filete:
 *    nada de blanco ni de sombra difusa (la de sigma por omisión las trae);
 *  - nada se anima al cargar: el primer dibujo se muestra ya dispuesto; lo que
 *    se mueve después de un gesto del lector (expandir, fijar) lo hace en
 *    `--dur-media` con la curva de la firma, y con movimiento reducido salta.
 */
import Graph from "graphology";
import Sigma from "sigma";
import { EdgeLineProgram, EdgeRectangleProgram, NodeCircleProgram, NodePointProgram } from "sigma/rendering";
import { animateNodes } from "sigma/utils";
import type { Settings } from "sigma/settings";
import type { CameraState, NodeDisplayData, PartialButFor } from "sigma/types";
import { FAMILIAS, TIPO, familiaDe } from "./familias";
import type { AristaLienzo, NodoLienzo, Red } from "./modelo";
import type { PedidoDisposicion, RespuestaDisposicion } from "./disposicion.worker";

/** Lo que cada nodo lleva en el grafo de sigma, además de `x`, `y`, `size`, `color` y `label`. */
interface AtributosNodo {
  x: number;
  y: number;
  size: number;
  color: string;
  label: string;
  tipoEtiqueta: string;
  familia: number;
  expandido: boolean;
  restantes: number;
  tipo: string | null;
  foco?: boolean;
}

interface AtributosArista {
  size: number;
  color: string;
  label: string;
  estilo: AristaLienzo["estilo"];
}

/** Lo que el lienzo ve en un momento: qué se enfoca, qué se esconde, qué camino se resalta. */
export interface Vista {
  foco: string | null;
  ocultos: ReadonlySet<string>;
  /** «Solo esta clase»: el tipo que queda, o `null`. */
  solo: string | null;
  /** Un camino resaltado: los nodos en orden; las aristas entre pasos seguidos. */
  camino: readonly string[] | null;
}

export interface Paleta {
  familias: string[];
  otros: string;
  rejilla: string;
  tinta: string;
  tintaSuave: string;
  papel: string;
  filete: string;
  firma: string;
  fuente: string;
}

/** Un color de CSS (hex, `rgb()`, `oklch()`…) en el `rgb()` que entiende sigma, por el canvas. */
function normalizar(color: string, ctx: CanvasRenderingContext2D): string {
  ctx.clearRect(0, 0, 1, 1);
  // Un color que el canvas no entienda deja el anterior: se parte de transparente.
  ctx.fillStyle = "transparent";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

/** Los tokens del tema en que vive el lienzo, ya resueltos. */
export function leerPaleta(el: HTMLElement): Paleta {
  const estilo = getComputedStyle(el);
  const lienzo = document.createElement("canvas");
  lienzo.width = lienzo.height = 1;
  const ctx = lienzo.getContext("2d", { willReadFrequently: true })!;
  const token = (nombre: string) => normalizar(estilo.getPropertyValue(nombre).trim() || "currentColor", ctx);
  return {
    familias: FAMILIAS.map((f) => token(`--color-grafico-${f.paso + 1}`)),
    otros: token("--color-grafico-otros"),
    rejilla: token("--color-grafico-rejilla"),
    tinta: token("--color-ink"),
    tintaSuave: token("--color-ink-soft"),
    papel: token("--color-surface"),
    filete: token("--color-hairline"),
    firma: token("--color-brand-500"),
    fuente: estilo.fontFamily || "sans-serif",
  };
}

/**
 * Una curva de los tokens (`--ease-firma`) como función de JS: sigma anima en
 * JS y no lee CSS. Lee el `cubic-bezier(...)` del elemento; si no lo halla, lineal.
 */
export function curva(el: HTMLElement, nombre = "--ease-firma"): (t: number) => number {
  const m = /cubic-bezier\(([^)]+)\)/.exec(getComputedStyle(el).getPropertyValue(nombre));
  const p = m?.[1].split(",").map(Number);
  if (!p || p.length !== 4 || !p.every(Number.isFinite)) return (t) => t;
  const [x1, y1, x2, y2] = p;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  return (t) => {
    // Newton sobre la x de la Bézier, luego su y.
    let u = t;
    for (let i = 0; i < 6; i++) {
      const x = ((ax * u + bx) * u + cx) * u - t;
      const dx = (3 * ax * u + 2 * bx) * u + cx;
      if (Math.abs(dx) < 1e-6) break;
      u -= x / dx;
    }
    return ((ay * u + by) * u + cy) * u;
  };
}

/** Una duración de los tokens (`--dur-media`), en milisegundos. */
export function duracion(el: HTMLElement, nombre = "--dur-media"): number {
  const v = getComputedStyle(el).getPropertyValue(nombre).trim();
  const n = parseFloat(v);
  return Number.isFinite(n) ? (v.endsWith("ms") ? n : n * 1000) : 0;
}

const TAM_NOMBRE = 13;
const TAM_TIPO = 12;
const TAM_NODO = 4.5;

/**
 * Desde cuántos nodos o aristas se dibuja con los programas ligeros de sigma
 * (puntos y líneas de 1 px) en lugar de discos y rectángulos: sin GPU, en el
 * WebGL por software de Chromium (SwiftShader), sigma solo con 2 000 nodos y
 * 5 000 aristas pasa de 4.7 a 26.7 cuadros por segundo, y el lienzo con las
 * mismas cifras da 27.8 (medido el 2026-11-03, docs/INFRAESTRUCTURA.md §11.11). Por debajo, la arista realzada puede ser
 * más gruesa; por encima, se realza solo con su tono y su rótulo escrito.
 */
const LIGERO_NODOS = 600;

/**
 * Si el WebGL de este navegador es por software (SwiftShader, llvmpipe): sin
 * GPU, ni con líneas de 1 px se sostienen 5 000 aristas en cada cuadro
 * (27.8 fps, 2026-11-03), así que en una red grande las aristas se apartan
 * mientras la cámara se mueve y vuelven al detenerse (`hideEdgesOnMove`).
 * Con GPU se dibujan siempre. Un navegador que no dice su renderizador cuenta
 * como GPU.
 */
function porSoftware(): boolean {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    const nombre = info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return /swiftshader|llvmpipe|software/i.test(nombre);
  } catch {
    return false;
  }
}
const LIGERO_ARISTAS = 1500;
/** Hasta cuántas aristas del foco se escriben sobre el dibujo. */
const ARISTAS_ROTULADAS = 8;
const TAM_EXPANDIDO = 7;

function recortar(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

type DatosRotulo = PartialButFor<NodeDisplayData, "x" | "y" | "size" | "label" | "color"> & Partial<AtributosNodo>;

export interface OpcionesMotor {
  onClic: (ruta: string) => void;
  /** Un nodo arrastrado y soltado: queda fijado en esa posición (coordenadas del grafo). */
  onSoltar: (ruta: string, x: number, y: number) => void;
  onCamara: (estado: CameraState) => void;
  /** La primera disposición quedó aplicada: el lienzo ya se puede mostrar. */
  onDispuesto: (ms: number) => void;
  /** El trabajador de la disposición falló: los nodos quedan en su posición de partida. */
  onSinDisposicion: () => void;
  reducido: () => boolean;
}

export class Motor {
  readonly grafo = new Graph<AtributosNodo, AtributosArista>({ type: "undirected", multi: false, allowSelfLoops: false });
  readonly sigma: Sigma<AtributosNodo, AtributosArista>;
  private paleta: Paleta;
  private vista: Vista = { foco: null, ocultos: new Set(), solo: null, camino: null };
  private trabajador: Worker | null = null;
  private pedido = 0;
  private dispuesto = false;
  private arrastrado: string | null = null;
  private movido = false;
  private sobre: string | null = null;
  private enfasis = new Set<string>();
  private aristasCamino = new Set<string>();
  /** Las aristas del foco se escriben si son pocas; si no, se encimarían, y su lista completa está en el inspector. */
  private rotularAristas = false;
  private parar: (() => void) | null = null;
  /** Lo último que se pintó: semillas puras, para el siguiente pedido de disposición. */
  private red: Red | null = null;
  private fijados: Record<string, [number, number]> = {};
  private readonly software = porSoftware();
  private readonly firma: (t: number) => number;

  constructor(
    private readonly contenedor: HTMLElement,
    private readonly opciones: OpcionesMotor,
  ) {
    this.paleta = leerPaleta(contenedor);
    this.firma = curva(contenedor);
    const p = this.paleta;
    // Los movimientos propios de sigma (rueda, inercia, doble clic) duran lo que los tokens; con movimiento reducido, nada.
    const quieto = opciones.reducido();
    const breve = quieto ? 0 : duracion(contenedor, "--dur-breve");
    const media = quieto ? 0 : duracion(contenedor, "--dur-media");
    const ajustes: Partial<Settings<AtributosNodo, AtributosArista>> = {
      renderLabels: true,
      renderEdgeLabels: true,
      labelFont: p.fuente,
      labelSize: TAM_NOMBRE,
      labelWeight: "500",
      labelColor: { color: p.tinta },
      edgeLabelFont: p.fuente,
      edgeLabelSize: TAM_TIPO,
      edgeLabelColor: { color: p.tintaSuave },
      defaultNodeColor: p.otros,
      defaultEdgeColor: p.rejilla,
      labelDensity: 0.5,
      labelGridCellSize: 180,
      labelRenderedSizeThreshold: 4,
      zIndex: true,
      minCameraRatio: 0.05,
      maxCameraRatio: 4,
      stagePadding: 60,
      hideEdgesOnMove: false,
      zoomDuration: media,
      inertiaDuration: breve,
      doubleClickZoomingDuration: media,
      nodeProgramClasses: { circle: NodeCircleProgram, point: NodePointProgram },
      edgeProgramClasses: { rect: EdgeRectangleProgram, line: EdgeLineProgram },
      defaultNodeType: "circle",
      defaultEdgeType: "rect",
      defaultDrawNodeLabel: (ctx, d, s) => this.rotulo(ctx, d as DatosRotulo, s),
      defaultDrawNodeHover: (ctx, d, s) => this.caja(ctx, d as DatosRotulo, s),
      nodeReducer: (n, a) => this.reducirNodo(n, a),
      edgeReducer: (e, a) => this.reducirArista(e, a),
    };
    this.sigma = new Sigma(this.grafo, contenedor, ajustes);
    this.eventos();
  }

  /* ------------------------------------------------------------ dibujo */

  private rotulo(ctx: CanvasRenderingContext2D, d: DatosRotulo, s: Settings<AtributosNodo, AtributosArista>) {
    if (!d.label) return;
    const x = d.x + d.size + 4;
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = this.paleta.papel;
    ctx.font = `500 ${TAM_NOMBRE}px ${s.labelFont}`;
    const nombre = recortar(d.label, 36);
    ctx.strokeText(nombre, x, d.y + 1);
    ctx.fillStyle = this.paleta.tinta;
    ctx.fillText(nombre, x, d.y + 1);
    if (d.tipoEtiqueta) {
      ctx.font = `400 ${TAM_TIPO}px ${s.labelFont}`;
      ctx.strokeText(d.tipoEtiqueta, x, d.y + 1 + TAM_TIPO + 2);
      ctx.fillStyle = this.paleta.tintaSuave;
      ctx.fillText(d.tipoEtiqueta, x, d.y + 1 + TAM_TIPO + 2);
    }
  }

  /** La caja del nodo enfocado o bajo el puntero: papel plano, filete, sin sombra. El foco, con filete de la firma. */
  private caja(ctx: CanvasRenderingContext2D, d: DatosRotulo, s: Settings<AtributosNodo, AtributosArista>) {
    const nombre = recortar(d.label ?? "", 48);
    const tipo = [d.tipoEtiqueta, d.restantes ? `${d.restantes} más en el inspector` : null].filter(Boolean).join(" · ");
    ctx.font = `600 ${TAM_NOMBRE}px ${s.labelFont}`;
    const w1 = ctx.measureText(nombre).width;
    ctx.font = `400 ${TAM_TIPO}px ${s.labelFont}`;
    const w2 = ctx.measureText(tipo).width;
    const x = d.x + d.size + 6;
    const y = d.y - TAM_NOMBRE;
    const ancho = Math.max(w1, w2) + 16;
    const alto = TAM_NOMBRE + TAM_TIPO + 16;
    ctx.shadowBlur = 0;
    ctx.fillStyle = this.paleta.papel;
    ctx.strokeStyle = d.foco ? this.paleta.firma : this.paleta.filete;
    ctx.lineWidth = d.foco ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(x - 6, y - 4, ancho, alto, 4);
    ctx.fill();
    ctx.stroke();
    // El anillo del nodo: el foco se ve aunque el color de su familia se parezca al del fondo.
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.size + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = this.paleta.tinta;
    ctx.font = `600 ${TAM_NOMBRE}px ${s.labelFont}`;
    ctx.fillText(nombre, x + 2, y + TAM_NOMBRE);
    ctx.fillStyle = this.paleta.tintaSuave;
    ctx.font = `400 ${TAM_TIPO}px ${s.labelFont}`;
    ctx.fillText(tipo, x + 2, y + TAM_NOMBRE + TAM_TIPO + 4);
  }

  private reducirNodo(n: string, a: AtributosNodo): Partial<NodeDisplayData> & AtributosNodo {
    const v = this.vista;
    const salida: Partial<NodeDisplayData> & AtributosNodo = { ...a, type: this.ligero ? "point" : "circle" };
    if (v.ocultos.has(n) || (v.solo && this.tipoDe(n) !== v.solo && n !== v.foco)) salida.hidden = true;
    const camino = v.camino && v.camino.length > 0;
    const apagado = camino ? !v.camino!.includes(n) : this.enfasis.size > 0 && !this.enfasis.has(n);
    if (apagado) {
      // Lo apagado va en el filete de la rejilla, no en el gris de «otros», que es una clase de la leyenda.
      salida.color = this.paleta.rejilla;
      salida.label = "";
      salida.zIndex = 0;
    } else {
      salida.zIndex = 1;
      // Solo el camino se rotula a la fuerza; los vecinos del foco compiten por la rejilla de rótulos de sigma, que no los encima.
      if (camino) salida.forceLabel = true;
    }
    if (n === v.foco) {
      salida.highlighted = true;
      salida.foco = true;
      salida.zIndex = 2;
    }
    return salida;
  }

  private reducirArista(
    e: string,
    a: AtributosArista,
  ): Partial<AtributosArista> & { hidden?: boolean; zIndex?: number; forceLabel?: boolean; type?: string } {
    const [s, t] = this.grafo.extremities(e);
    const enCamino = this.aristasCamino.has(e);
    const delFoco = this.vista.foco !== null && (s === this.vista.foco || t === this.vista.foco);
    const realzada = enCamino || delFoco;
    const rotulada = enCamino || (delFoco && this.rotularAristas);
    const salida: Partial<AtributosArista> & { hidden?: boolean; zIndex?: number; forceLabel?: boolean; type?: string } = {
      ...a,
      // El rótulo de la arista solo junto al foco o en un camino: escrito, no adivinado por el color.
      label: rotulada ? a.label : "",
      size: realzada ? 2 : a.estilo === "punteado" ? 0.6 : 1,
      color: realzada ? this.paleta.tintaSuave : this.paleta.rejilla,
      zIndex: realzada ? 1 : 0,
      forceLabel: rotulada,
      type: this.ligero ? "line" : "rect",
    };
    if (this.vista.camino && this.vista.camino.length && !enCamino) salida.label = "";
    return salida;
  }

  private tipoDe(n: string): string | null {
    return this.grafo.hasNode(n) ? this.grafo.getNodeAttribute(n, "tipo") : null;
  }

  /* ----------------------------------------------------------- eventos */

  private eventos() {
    const s = this.sigma;
    s.on("enterNode", ({ node }) => {
      this.sobre = node;
      this.contenedor.style.cursor = "pointer";
    });
    s.on("leaveNode", () => {
      this.sobre = null;
      this.contenedor.style.cursor = "";
    });
    s.on("downNode", ({ node }) => {
      this.arrastrado = node;
      this.movido = false;
      if (!s.getCustomBBox()) s.setCustomBBox(s.getBBox());
    });
    s.on("moveBody", ({ event }) => {
      if (!this.arrastrado) return;
      const pos = s.viewportToGraph(event);
      this.grafo.mergeNodeAttributes(this.arrastrado, { x: pos.x, y: pos.y });
      this.movido = true;
      event.preventSigmaDefault();
      event.original.preventDefault();
      event.original.stopPropagation();
    });
    const soltar = () => {
      const n = this.arrastrado;
      this.arrastrado = null;
      s.setCustomBBox(null);
      if (n && this.movido) {
        const { x, y } = this.grafo.getNodeAttributes(n);
        this.opciones.onSoltar(n, x, y);
      }
    };
    s.on("upNode", soltar);
    s.on("upStage", soltar);
    s.on("clickNode", ({ node }) => {
      if (this.movido) return;
      this.opciones.onClic(node);
    });
    s.getCamera().on("updated", (estado) => this.opciones.onCamara(estado));
  }

  /* ------------------------------------------------------------ red */

  /**
   * Pone la red en el grafo de sigma: quita lo que ya no está, añade lo nuevo
   * junto al nodo que lo trajo (donde ese nodo está ahora) y pide la
   * disposición pura. Devuelve cuántos nodos entraron.
   */
  pintar(red: Red, fijados: Record<string, [number, number]>): number {
    this.red = red;
    this.fijados = fijados;
    const g = this.grafo;
    for (const n of g.nodes()) if (!red.nodos.has(n)) g.dropNode(n);
    // La escala entre las semillas y lo dispuesto, para poner lo nuevo cerca de su padre mientras llega la disposición.
    const escala = this.escala(red);
    let nuevos = 0;
    for (const nodo of red.nodos.values()) {
      const atributos = this.atributos(nodo);
      if (g.hasNode(nodo.ruta)) {
        g.mergeNodeAttributes(nodo.ruta, atributos);
        continue;
      }
      const padre = nodo.padre && g.hasNode(nodo.padre) ? g.getNodeAttributes(nodo.padre) : null;
      const del = nodo.padre ? red.nodos.get(nodo.padre) : null;
      const fijo = fijados[nodo.ruta];
      const x = fijo ? fijo[0] : padre && del ? padre.x + (nodo.sx - del.sx) * escala : nodo.sx * escala;
      const y = fijo ? fijo[1] : padre && del ? padre.y + (nodo.sy - del.sy) * escala : nodo.sy * escala;
      g.addNode(nodo.ruta, { ...atributos, x, y });
      nuevos++;
    }
    const vistas = new Set<string>();
    for (const a of red.aristas) {
      const clave = g.hasEdge(a.de, a.a) ? g.edge(a.de, a.a)! : null;
      const atributos: AtributosArista = {
        size: 1,
        color: this.paleta.rejilla,
        label: [a.verbo, a.detalle, a.estilo === "punteado" ? "derivada por una regla" : null].filter(Boolean).join(" · "),
        estilo: a.estilo,
      };
      if (clave) {
        g.mergeEdgeAttributes(clave, atributos);
        vistas.add(clave);
      } else vistas.add(g.addEdge(a.de, a.a, atributos));
    }
    for (const e of g.edges()) if (!vistas.has(e)) g.dropEdge(e);
    const apartar = this.software && this.ligero;
    if (this.sigma.getSetting("hideEdgesOnMove") !== apartar) this.sigma.setSetting("hideEdgesOnMove", apartar);
    this.recalcularEnfasis();
    this.disponer();
    return nuevos;
  }

  private atributos(n: NodoLienzo): Omit<AtributosNodo, "x" | "y"> {
    const familia = familiaDe(n.tipo);
    return {
      size: n.expandido || !n.padre ? TAM_EXPANDIDO : TAM_NODO,
      color: familia ? this.paleta.familias[familia.paso] : this.paleta.otros,
      label: n.titulo,
      tipoEtiqueta: n.tipo ? TIPO[n.tipo].etiqueta : "Otro",
      familia: familia ? familia.paso : -1,
      expandido: n.expandido,
      restantes: n.restantes,
      tipo: n.tipo,
    };
  }

  private escala(red: Red): number {
    const g = this.grafo;
    let semilla = 0;
    let real = 0;
    for (const n of g.nodes()) {
      const nodo = red.nodos.get(n);
      if (!nodo) continue;
      const a = g.getNodeAttributes(n);
      semilla += Math.hypot(nodo.sx, nodo.sy);
      real += Math.hypot(a.x, a.y);
    }
    return semilla > 0 && real > 0 ? real / semilla : 1;
  }

  /** Pide la disposición pura de la red entera al trabajador; la última respuesta manda. */
  private disponer() {
    const red = this.red;
    if (!red) return;
    // En el orden de la red y no en el de inserción en el grafo: la disposición depende del estado, no de la historia.
    const nodos = [...red.nodos.keys()];
    const indice = new Map(nodos.map((n, i) => [n, i]));
    const posiciones = new Float64Array(nodos.length * 2);
    const fijos = new Uint8Array(nodos.length);
    nodos.forEach((n, i) => {
      const f = this.fijados[n];
      const nodo = red.nodos.get(n)!;
      posiciones[2 * i] = f ? f[0] : nodo.sx;
      posiciones[2 * i + 1] = f ? f[1] : nodo.sy;
      fijos[i] = f ? 1 : 0;
    });
    const aristas = new Uint32Array(red.aristas.length * 2);
    red.aristas.forEach((a, k) => {
      aristas[2 * k] = indice.get(a.de)!;
      aristas[2 * k + 1] = indice.get(a.a)!;
    });
    if (this.sinTrabajador) return this.quedarseEnSemillas();
    if (!this.trabajador) {
      try {
        this.trabajador = new Worker(new URL("./disposicion.worker.ts", import.meta.url));
      } catch {
        return this.quedarseEnSemillas();
      }
      this.trabajador.onmessage = (e: MessageEvent<RespuestaDisposicion>) => this.aplicar(e.data);
      this.trabajador.onerror = () => this.quedarseEnSemillas();
    }
    const pedido: PedidoDisposicion = { id: ++this.pedido, posiciones, fijos, aristas };
    this.ultimos = nodos;
    this.trabajador.postMessage(pedido, [posiciones.buffer, fijos.buffer, aristas.buffer]);
  }

  private ultimos: string[] = [];
  private sinTrabajador = false;

  /** Sin trabajador (falló al crearse o al correr): cada nodo en su posición de partida, y el lienzo se muestra igual. */
  private quedarseEnSemillas() {
    if (!this.sinTrabajador) {
      this.sinTrabajador = true;
      this.trabajador?.terminate();
      this.trabajador = null;
      this.opciones.onSinDisposicion();
    }
    const red = this.red;
    if (!red) return;
    for (const n of red.nodos.values()) {
      const f = this.fijados[n.ruta];
      if (this.grafo.hasNode(n.ruta)) this.grafo.mergeNodeAttributes(n.ruta, { x: f ? f[0] : n.sx, y: f ? f[1] : n.sy });
    }
    if (!this.dispuesto) {
      this.dispuesto = true;
      this.opciones.onDispuesto(0);
    }
  }

  /** Si la red es grande: puntos y líneas de 1 px (ver `LIGERO_NODOS`). */
  private get ligero(): boolean {
    return this.grafo.order > LIGERO_NODOS || this.grafo.size > LIGERO_ARISTAS;
  }

  private aplicar(r: RespuestaDisposicion) {
    if (r.id !== this.pedido) return;
    const destino: Record<string, { x: number; y: number }> = {};
    this.ultimos.forEach((n, i) => {
      if (this.grafo.hasNode(n)) destino[n] = { x: r.posiciones[2 * i], y: r.posiciones[2 * i + 1] };
    });
    this.parar?.();
    this.parar = null;
    const reducido = this.opciones.reducido();
    if (!this.dispuesto || reducido) {
      // El primer dibujo no se anima: se muestra ya dispuesto. Con movimiento reducido, nada se anima.
      for (const [n, p] of Object.entries(destino)) this.grafo.mergeNodeAttributes(n, p);
      if (!this.dispuesto) {
        this.dispuesto = true;
        this.opciones.onDispuesto(r.ms);
      }
      return;
    }
    this.parar = animateNodes(this.grafo, destino, { duration: duracion(this.contenedor), easing: this.firma });
  }

  /* ------------------------------------------------------------ vista */

  ver(vista: Vista) {
    this.vista = vista;
    this.recalcularEnfasis();
    this.sigma.refresh();
  }

  private recalcularEnfasis() {
    const v = this.vista;
    this.enfasis = new Set();
    this.aristasCamino = new Set();
    if (v.camino && v.camino.length) {
      for (let i = 0; i + 1 < v.camino.length; i++) {
        const e = this.grafo.hasNode(v.camino[i]) && this.grafo.hasNode(v.camino[i + 1]) ? this.grafo.edge(v.camino[i], v.camino[i + 1]) : undefined;
        if (e) this.aristasCamino.add(e);
      }
      return;
    }
    if (v.foco && this.grafo.hasNode(v.foco)) {
      this.enfasis.add(v.foco);
      this.grafo.forEachNeighbor(v.foco, (n) => this.enfasis.add(n));
    }
    this.rotularAristas = this.enfasis.size - 1 <= ARISTAS_ROTULADAS;
  }

  /** El vecino más cercano en la dirección de una flecha, en pantalla, entre los nodos visibles. */
  enDireccion(desde: string | null, dx: number, dy: number): string | null {
    const visibles = this.grafo.filterNodes((n) => !this.sigma.getNodeDisplayData(n)?.hidden);
    if (!visibles.length) return null;
    if (!desde || !this.grafo.hasNode(desde)) return this.masCentral(visibles);
    const o = this.sigma.graphToViewport(this.grafo.getNodeAttributes(desde));
    let mejor: string | null = null;
    let puntaje = Infinity;
    for (const n of visibles) {
      if (n === desde) continue;
      const p = this.sigma.graphToViewport(this.grafo.getNodeAttributes(n));
      const vx = p.x - o.x;
      const vy = p.y - o.y;
      const d = Math.hypot(vx, vy);
      if (d === 0) continue;
      const alineado = (vx * dx + vy * dy) / d;
      if (alineado < 0.5) continue; // un cono de 60° a cada lado
      const s = d * (2 - alineado);
      if (s < puntaje) {
        puntaje = s;
        mejor = n;
      }
    }
    return mejor;
  }

  /** El nodo más cercano al centro de la vista: por donde entra el teclado. */
  masCentral(entre = this.grafo.nodes()): string | null {
    const { width, height } = this.sigma.getDimensions();
    let mejor: string | null = null;
    let d = Infinity;
    for (const n of entre) {
      const p = this.sigma.graphToViewport(this.grafo.getNodeAttributes(n));
      const x = Math.hypot(p.x - width / 2, p.y - height / 2);
      if (x < d) {
        d = x;
        mejor = n;
      }
    }
    return mejor;
  }

  /** Si el nodo quedó fuera de la vista, la cámara va a él (sin animar con movimiento reducido). */
  mostrar(n: string) {
    if (!this.grafo.hasNode(n)) return;
    const p = this.sigma.graphToViewport(this.grafo.getNodeAttributes(n));
    const { width, height } = this.sigma.getDimensions();
    // Con margen para la caja del rótulo, que sale a la derecha del nodo.
    if (p.x > 60 && p.y > 60 && p.x < width - 260 && p.y < height - 60) return;
    const d = this.sigma.getNodeDisplayData(n);
    if (!d) return;
    const camara = this.sigma.getCamera();
    const destino = { ...camara.getState(), x: d.x, y: d.y };
    if (this.opciones.reducido()) camara.setState(destino);
    else void camara.animate(destino, { duration: duracion(this.contenedor), easing: this.firma });
  }

  camara(estado: Partial<CameraState> | null) {
    const c = this.sigma.getCamera();
    if (!estado) {
      if (this.opciones.reducido()) c.setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 });
      else void c.animatedReset({ duration: duracion(this.contenedor), easing: this.firma });
      return;
    }
    c.setState(estado);
  }

  zoom(factor: number) {
    const c = this.sigma.getCamera();
    const d = this.opciones.reducido() ? 0 : duracion(this.contenedor, "--dur-breve");
    void (factor > 1 ? c.animatedUnzoom({ duration: d, factor }) : c.animatedZoom({ duration: d, factor: 1 / factor }));
  }

  get nodos(): number {
    return this.grafo.order;
  }

  get aristas(): number {
    return this.grafo.size;
  }

  matar() {
    this.parar?.();
    // Una animación de cámara en curso seguiría avisando después de desmontar.
    this.sigma.getCamera().removeAllListeners();
    this.trabajador?.terminate();
    this.trabajador = null;
    this.sigma.kill();
  }
}
