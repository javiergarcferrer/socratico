import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * La red de un nodo — **con quién se liga**: el nodo en el centro y sus
 * vecinos en dos columnas, cada uno con su nombre y la arista que los une
 * («Cargo en · Ministro de Hacienda»). Es la vista de un paso del grafo
 * (`/grafo`), pintada en el servidor como SVG, sin librería.
 *
 * Reglas que trae puestas (docs/IDENTIDAD.md §Gráficos):
 *  - **una sola marca y un solo color**: el vecino es un punto de 8 px en la
 *    firma con anillo de papel; el centro, en tinta. La categoría de la arista
 *    no se pinta: se escribe (el rótulo de cada tramo de columna y la línea de
 *    cada vecino), así que el color nunca es la única lectura y no hace falta
 *    leyenda;
 *  - las aristas en filete macizo de la rejilla, curvas que salen en
 *    horizontal del centro; nada se anima al cargar;
 *  - cada vecino es su enlace (regla 6: cada marca lleva a su nodo), con
 *    `title` para el puntero; los nombres llevan halo de papel para leerse
 *    sobre las aristas;
 *  - el dibujo **no sustituye a la lista**: la página pone debajo la lista
 *    completa, que es la tabla equivalente, el camino del lector de pantalla y
 *    el del teléfono. Por eso el dibujo va fuera del tabulador y del árbol de
 *    accesibilidad (repetiría cada vecino antes de la lista) y no se pinta
 *    por debajo de `lg`: el SVG se escala al ancho, y con menos de unos 770 px
 *    de dibujo sus rótulos bajarían de 12 px.
 */
export interface VecinoRed {
  clave: string;
  nombre: string;
  /** Cómo se liga con el centro, en una línea: «Cargo en · Ministro de Hacienda». */
  arista: string;
  /** El tramo al que pertenece: vecinos seguidos con el mismo grupo van juntos bajo su rótulo. */
  grupo: string;
  href: string;
}

const ANCHO = 800;
const CX = ANCHO / 2;
const COLUMNA = 104; // del centro a cada columna de puntos
const FILA = 42;
const ROTULO = 26;
const MARGEN = 18;

function recortar(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

interface Colocado extends VecinoRed {
  x: number;
  y: number;
  lado: "izquierda" | "derecha";
}

/** Reparte los vecinos en dos columnas, con un rótulo donde empieza cada grupo. */
function colocar(vecinos: VecinoRed[]): { puntos: Colocado[]; rotulos: { texto: string; x: number; y: number; lado: Colocado["lado"] }[]; alto: number } {
  const mitad = Math.ceil(vecinos.length / 2);
  const columnas = [vecinos.slice(0, mitad), vecinos.slice(mitad)];
  const puntos: Colocado[] = [];
  const rotulos: { texto: string; x: number; y: number; lado: Colocado["lado"] }[] = [];
  const altos = columnas.map((col) => {
    let y = MARGEN;
    let grupo: string | null = null;
    for (const v of col) {
      if (v.grupo !== grupo) {
        y += ROTULO;
        grupo = v.grupo;
      }
      y += FILA;
    }
    return y + MARGEN;
  });
  const alto = Math.max(160, ...altos);
  columnas.forEach((col, i) => {
    const lado = i === 0 ? "izquierda" : "derecha";
    const x = i === 0 ? CX - COLUMNA : CX + COLUMNA;
    // Cada columna se centra en la altura del dibujo.
    let y = (alto - altos[i]) / 2 + MARGEN;
    let grupo: string | null = null;
    for (const v of col) {
      if (v.grupo !== grupo) {
        rotulos.push({ texto: v.grupo, x, y: y + ROTULO - 8, lado });
        y += ROTULO;
        grupo = v.grupo;
      }
      puntos.push({ ...v, x, y: y + FILA / 2 - 4, lado });
      y += FILA;
    }
  });
  return { puntos, rotulos, alto };
}

export function RedVecinos({
  centro,
  vecinos,
  total,
  etiqueta,
  className,
}: {
  /** El nombre del nodo del centro. */
  centro: string;
  /** Los vecinos que se dibujan, ya ordenados (la página decide cuántos). */
  vecinos: VecinoRed[];
  /** Cuántos vecinos tiene en total: si son más que los dibujados, el pie lo dice. */
  total: number;
  /** Qué muestra, para el pie: «Las fichas que se ligan con el Ministerio de Hacienda». */
  etiqueta: string;
  className?: string;
}) {
  if (vecinos.length === 0) return null;
  const { puntos, rotulos, alto } = colocar(vecinos);
  const cy = alto / 2;
  return (
    <figure className={cn("hidden lg:block", className)}>
      <svg viewBox={`0 0 ${ANCHO} ${alto}`} aria-hidden className="h-auto w-full">
        {puntos.map((p) => {
          const hacia = p.lado === "izquierda" ? -1 : 1;
          return (
            <path
              key={`arista-${p.clave}`}
              d={`M ${CX} ${cy} C ${CX + hacia * 52} ${cy}, ${p.x - hacia * 52} ${p.y}, ${p.x} ${p.y}`}
              vectorEffect="non-scaling-stroke"
              className="fill-none stroke-grafico-rejilla [stroke-width:1]"
            />
          );
        })}
        {rotulos.map((r) => (
          <text
            key={`rotulo-${r.lado}-${r.y}`}
            x={r.lado === "izquierda" ? r.x - 12 : r.x + 12}
            y={r.y}
            textAnchor={r.lado === "izquierda" ? "end" : "start"}
            className="fill-ink-soft font-mono text-[12.5px] uppercase tracking-wide"
          >
            {recortar(r.texto, 34)}
          </text>
        ))}
        {puntos.map((p) => {
          const izquierda = p.lado === "izquierda";
          const tx = izquierda ? p.x - 12 : p.x + 12;
          return (
            <Link key={p.clave} href={p.href} tabIndex={-1} className="group outline-none">
              <title>{`${p.nombre}: ${p.arista}`}</title>
              {/* Un blanco más grande que el punto para el puntero. */}
              <rect
                x={izquierda ? p.x - COLUMNA - 190 : p.x - 10}
                y={p.y - 16}
                width={COLUMNA + 200}
                height={FILA - 6}
                className="fill-transparent"
              />
              <circle
                cx={p.x}
                cy={p.y}
                r={4}
                vectorEffect="non-scaling-stroke"
                className="fill-grafico-1 stroke-canvas [stroke-width:2] transition-[stroke,stroke-width] duration-(--dur-toque) ease-firma group-hover:stroke-ink group-hover:[stroke-width:3]"
              />
              <text
                x={tx}
                y={p.y + 1}
                textAnchor={izquierda ? "end" : "start"}
                paintOrder="stroke"
                className="fill-ink stroke-canvas text-[14px] font-medium [stroke-width:4] transition-[fill] duration-(--dur-toque) ease-firma group-hover:fill-brand-700"
              >
                {recortar(p.nombre, 34)}
              </text>
              <text
                x={tx}
                y={p.y + 16}
                textAnchor={izquierda ? "end" : "start"}
                paintOrder="stroke"
                className="fill-ink-soft stroke-canvas text-[12.5px] [stroke-width:4]"
              >
                {recortar(p.arista, 42)}
              </text>
            </Link>
          );
        })}
        <circle cx={CX} cy={cy} r={7} className="fill-ink stroke-canvas [stroke-width:3]" />
        <text
          x={CX}
          y={cy - 16}
          textAnchor="middle"
          paintOrder="stroke"
          className="fill-ink stroke-canvas text-[14px] font-semibold [stroke-width:5]"
        >
          {recortar(centro, 30)}
        </text>
      </svg>
      <figcaption className="mt-2 text-xs leading-relaxed text-ink-soft">
        {etiqueta}
        {total > vecinos.length
          ? `. El dibujo muestra ${vecinos.length} de ${total}; la lista de abajo las trae todas.`
          : ". La lista de abajo dice lo mismo, arista por arista."}
      </figcaption>
    </figure>
  );
}
