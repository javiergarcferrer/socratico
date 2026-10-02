"use client";

import "@xyflow/react/dist/base.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import { VERBO_ENLACE, type TipoEnlace, type TipoEntrada } from "@/lib/espacios";
import { formatFecha } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconEncuadrar, IconMinus, IconPlus } from "@/components/icons";
import { EnlaceRegistro, MarcaTipo } from "./registro";

/**
 * El tablero de un caso: cada registro es una tarjeta que el investigador pone
 * donde le sirve, y cada enlace una flecha con su verbo (docs/INFRAESTRUCTURA.md §10).
 * Lo pinta React Flow (xyflow, MIT); el vestido es el de la casa.
 *
 * No importa el cliente de Supabase: guardar es del que lo monta (`onMover`,
 * `onConectar`), así `/p` lo usa de solo lectura sin sesión. Todo lo que el
 * tablero dice está también en la lista y en la tabla de evidencia: quien no
 * puede arrastrar —un lector de pantalla, un dedo en un teléfono— no pierde nada.
 */

// Un `type` y no una `interface`: React Flow pide que los datos de un nodo
// quepan en `Record<string, unknown>`, y una interfaz no lo promete.
export type TarjetaTablero = {
  id: string;
  tipo: TipoEntrada;
  titulo: string;
  href: string;
  fecha: string | null;
  x: number | null;
  y: number | null;
};

export interface LazoTablero {
  /** El id del enlace; en `/p` no hay ids y vale cualquier clave única. */
  id: string;
  desde: string;
  hasta: string;
  tipo: TipoEnlace;
  nota: string;
}

export type Seleccion = { que: "tarjeta" | "lazo"; id: string } | null;

type DatosTarjeta = TarjetaTablero & { edita: boolean; ajeno: boolean };
type NodoTarjeta = Node<DatosTarjeta, "tarjeta">;

const ANCHO = 240;
const COLUMNAS = 3;
const PASO_X = 300;
const PASO_Y = 170;
// Encuadrar nunca aleja tanto que el título no se lea: en un teléfono se ve
// una parte y el resto se recorre arrastrando.
const ENCUADRE = { padding: 0.15, maxZoom: 1, minZoom: 0.55 };

/**
 * Dónde va cada tarjeta: la que el investigador movió, donde la dejó; las
 * demás, en rejilla debajo de las ya puestas, en el orden en que entraron.
 */
function posiciones(tarjetas: TarjetaTablero[], locales: Map<string, { x: number; y: number }>) {
  const puestas = tarjetas.filter((t) => locales.has(t.id) || (t.x !== null && t.y !== null));
  const fondo = puestas.length
    ? Math.max(...puestas.map((t) => locales.get(t.id)?.y ?? t.y ?? 0)) + PASO_Y + 30
    : 0;
  let i = 0;
  return new Map(
    tarjetas.map((t) => {
      const local = locales.get(t.id);
      if (local) return [t.id, local];
      if (t.x !== null && t.y !== null) return [t.id, { x: t.x, y: t.y }];
      const p = { x: (i % COLUMNAS) * PASO_X, y: fondo + Math.floor(i / COLUMNAS) * PASO_Y };
      i++;
      return [t.id, p];
    }),
  );
}

/**
 * El asa de donde sale o llega una flecha. En línea y no con clases: la hoja
 * base de React Flow no vive en una capa de Tailwind y le gana a cualquier
 * utilidad. El tamaño es el mínimo que un dedo encuentra sin tapar el título.
 */
function asa(edita: boolean): React.CSSProperties {
  return {
    width: 14,
    height: 14,
    borderRadius: "9999px",
    border: "2px solid var(--color-surface)",
    background: "var(--color-brand-600)",
    opacity: edita ? 1 : 0,
  };
}

function Tarjeta({ data, selected }: NodeProps<NodoTarjeta>) {
  return (
    <Card
      className={cn(
        "p-3 text-left",
        data.edita && "cursor-grab active:cursor-grabbing",
        selected && "border-brand-600 ring-2 ring-brand-600/30",
      )}
      style={{ width: ANCHO }}
    >
      {/* Sin asas visibles para quien solo lee; existen igual, porque una
          flecha necesita dónde apoyarse. */}
      <Handle type="target" position={Position.Left} isConnectable={data.edita} style={asa(data.edita)} />
      <MarcaTipo tipo={data.tipo} />
      <p className="mt-1.5 line-clamp-3 text-sm leading-snug">
        <EnlaceRegistro
          titulo={data.titulo}
          href={data.href}
          ajeno={data.ajeno}
          className="nodrag font-semibold text-ink hover:text-brand-700 hover:underline"
        />
      </p>
      {data.fecha && <p className="mt-1 font-mono text-xs text-ink-soft">{formatFecha(data.fecha)}</p>}
      <Handle type="source" position={Position.Right} isConnectable={data.edita} style={asa(data.edita)} />
    </Card>
  );
}

const TIPOS_NODO = { tarjeta: Tarjeta };

function Controles() {
  const flujo = useReactFlow();
  return (
    <Panel position="bottom-left" className="m-2 flex gap-1.5">
      <Button type="button" variant="secondary" size="icon" onClick={() => flujo.zoomIn()} aria-label="Acercar">
        <IconPlus className="h-4 w-4" />
      </Button>
      <Button type="button" variant="secondary" size="icon" onClick={() => flujo.zoomOut()} aria-label="Alejar">
        <IconMinus className="h-4 w-4" />
      </Button>
      <Button type="button" variant="secondary" size="icon" onClick={() => flujo.fitView(ENCUADRE)} aria-label="Ver todo el tablero">
        <IconEncuadrar className="h-4 w-4" />
      </Button>
    </Panel>
  );
}

function Lienzo({
  tarjetas,
  lazos,
  edita = false,
  ajeno = false,
  seleccion,
  onSeleccion,
  onMover,
  onConectar,
}: PropsTablero) {
  // Lo que se arrastró en esta visita, hasta que la base lo confirme o lo niegue.
  const locales = useRef(new Map<string, { x: number; y: number }>());
  const construir = useCallback((): NodoTarjeta[] => {
    const pos = posiciones(tarjetas, locales.current);
    return tarjetas.map((t) => ({
      id: t.id,
      type: "tarjeta",
      position: pos.get(t.id)!,
      data: { ...t, edita, ajeno },
      selected: seleccion?.que === "tarjeta" && seleccion.id === t.id,
      draggable: edita,
      connectable: edita,
    }));
  }, [tarjetas, edita, ajeno, seleccion]);
  const [nodos, setNodos] = useState<NodoTarjeta[]>(construir);
  // Al cambiar los datos (una tarjeta nueva, una selección) se rehace la
  // lista, pero lo que se está arrastrando se queda bajo el dedo, y cada nodo
  // conserva su medida para no parpadear.
  const rehacer = useCallback(
    () =>
      setNodos((antes) => {
        const previo = new Map(antes.map((n) => [n.id, n]));
        return construir().map((n) => {
          const a = previo.get(n.id);
          if (!a) return n;
          return a.dragging ? { ...n, position: a.position, dragging: true, measured: a.measured } : { ...n, measured: a.measured };
        });
      }),
    [construir],
  );
  useEffect(rehacer, [rehacer]);
  const rehacerRef = useRef(rehacer);
  rehacerRef.current = rehacer;
  const onMoverRef = useRef(onMover);
  onMoverRef.current = onMover;

  // Dónde quedó cada tarjeta, se haya movido con el ratón, el dedo o las
  // flechas del teclado: se guarda un momento después del último paso, para
  // que diez toques de flecha sean una escritura y no diez.
  const porGuardar = useRef(new Map<string, { x: number; y: number }>());
  const espera = useRef<number | null>(null);
  const guardarPosiciones = useCallback(async () => {
    espera.current = null;
    const lote = [...porGuardar.current];
    porGuardar.current.clear();
    for (const [id, p] of lote) {
      const bien = (await onMoverRef.current?.(id, p.x, p.y)) ?? true;
      // Si la base no lo guardó, la tarjeta vuelve a donde estaba.
      if (!bien) {
        locales.current.delete(id);
        rehacerRef.current();
      }
    }
  }, []);
  useEffect(
    () => () => {
      if (espera.current) {
        window.clearTimeout(espera.current);
        void guardarPosiciones();
      }
    },
    [guardarPosiciones],
  );

  const aristas = useMemo<Edge[]>(
    () =>
      lazos.map((l) => {
        const elegida = seleccion?.que === "lazo" && seleccion.id === l.id;
        const color = elegida ? "var(--color-brand-600)" : "var(--color-ink-soft)";
        const nota = l.nota.length > 40 ? `${l.nota.slice(0, 39)}…` : l.nota;
        return {
          id: l.id,
          source: l.desde,
          target: l.hasta,
          label: nota ? `${VERBO_ENLACE[l.tipo]} · ${nota}` : VERBO_ENLACE[l.tipo],
          selected: elegida,
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
          style: { stroke: color, strokeWidth: elegida ? 2.25 : 1.5 },
          labelStyle: { fill: "var(--color-ink)", fontSize: 12, fontFamily: "var(--font-sans)" },
          labelBgStyle: { fill: "var(--color-surface)", stroke: "var(--color-hairline)" },
          labelBgPadding: [6, 3] as [number, number],
          labelBgBorderRadius: 4,
        };
      }),
    [lazos, seleccion],
  );

  const alCambiar = useCallback(
    (cambios: NodeChange<NodoTarjeta>[]) => {
      setNodos((n) => applyNodeChanges(cambios, n));
      if (!onMoverRef.current) return;
      let hay = false;
      for (const c of cambios) {
        // Una posición sin arrastre en curso es un paso terminado: el fin de
        // un arrastre o una flecha del teclado.
        if (c.type !== "position" || !c.position || c.dragging) continue;
        const p = { x: Math.round(c.position.x), y: Math.round(c.position.y) };
        locales.current.set(c.id, p);
        porGuardar.current.set(c.id, p);
        hay = true;
      }
      if (!hay) return;
      if (espera.current) window.clearTimeout(espera.current);
      espera.current = window.setTimeout(() => void guardarPosiciones(), 400);
    },
    [guardarPosiciones],
  );

  const alConectar = useCallback(
    (c: Connection) => {
      if (c.source && c.target && c.source !== c.target) onConectar?.(c.source, c.target);
    },
    [onConectar],
  );

  const alElegir = useCallback(
    ({ nodes, edges }: OnSelectionChangeParams) => {
      if (!onSeleccion) return;
      if (nodes[0]) onSeleccion({ que: "tarjeta", id: nodes[0].id });
      else if (edges[0]) onSeleccion({ que: "lazo", id: edges[0].id });
      else onSeleccion(null);
    },
    [onSeleccion],
  );

  return (
    <ReactFlow<NodoTarjeta, Edge>
      nodes={nodos}
      edges={aristas}
      nodeTypes={TIPOS_NODO}
      onNodesChange={alCambiar}
      onConnect={alConectar}
      onSelectionChange={alElegir}
      nodesDraggable={edita}
      nodesConnectable={edita}
      elementsSelectable={!!onSeleccion}
      // Borrar con una tecla quitaría un registro del caso sin preguntar: se
      // quita desde el panel del registro, que lo dice.
      deleteKeyCode={null}
      // La rueda desplaza la página, no el tablero: se acerca con los botones
      // o pellizcando. Un tablero a media página no secuestra el scroll.
      zoomOnScroll={false}
      preventScrolling={false}
      // Quien solo mira no arrastra el lienzo con el dedo: el dedo baja la
      // página. Se acerca pellizcando o con los botones.
      panOnDrag={edita}
      fitView
      fitViewOptions={ENCUADRE}
      minZoom={0.2}
      maxZoom={1.5}
      // La atribución de React Flow se queda: su licencia (MIT) permitiría
      // quitarla, pero sus autores piden hacerlo solo con la suscripción Pro.
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="var(--color-hairline)" />
      <Controles />
    </ReactFlow>
  );
}

export interface PropsTablero {
  tarjetas: TarjetaTablero[];
  lazos: LazoTablero[];
  /** Arrastrar y conectar; sin esto, solo se mira. */
  edita?: boolean;
  /** Lo lee un tercero (`/p`): los enlaces salen `ugc nofollow`. */
  ajeno?: boolean;
  seleccion?: Seleccion;
  onSeleccion?: (s: Seleccion) => void;
  /** Guarda dónde quedó una tarjeta. `false` si la base no lo aceptó. */
  onMover?: (id: string, x: number, y: number) => Promise<boolean>;
  /** Se soltó una flecha de una tarjeta a otra: quien monta pregunta el verbo. */
  onConectar?: (desde: string, hasta: string) => void;
}

export default function Tablero(props: PropsTablero) {
  const { tarjetas, lazos, edita = false } = props;
  return (
    <div
      role="group"
      aria-label={`Tablero del proyecto: ${tarjetas.length} ${tarjetas.length === 1 ? "registro" : "registros"} y ${lazos.length} ${lazos.length === 1 ? "enlace" : "enlaces"}. Lo mismo está en la lista de registros.`}
      className="h-[26rem] w-full overflow-hidden rounded-lg border border-hairline bg-canvas sm:h-[34rem]"
      // El crédito de React Flow sobre papel, no sobre blanco de pantalla.
      style={{ ["--xy-attribution-background-color" as string]: "var(--color-surface)" }}
    >
      <ReactFlowProvider>
        <Lienzo {...props} edita={edita} ajeno={props.ajeno ?? false} />
      </ReactFlowProvider>
    </div>
  );
}
