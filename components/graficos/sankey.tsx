import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatearValor, type FormatoValor } from "./formato";
import { VerComoTabla } from "./ver-como-tabla";

/**
 * Los flujos de un nodo — **a quién le va el dinero, o de quién le viene**:
 * el nodo de la ficha a un lado como una barra de tinta, sus contrapartes al
 * otro como filas, y entre ambos una banda por flujo cuyo grueso es el monto.
 * Pintado en el servidor como SVG, sin librería (docs/INFRAESTRUCTURA.md §11.11).
 *
 * Reglas que trae puestas:
 *  - **el grueso es la única lectura de cantidad, y se escribe**: cada fila
 *    dice su monto y su parte del total; el color solo separa lo nombrado
 *    (la firma, `grafico-1`) de «otros» (`grafico-otros`), que también se
 *    escribe. El grueso se conserva de punta a punta, como en todo Sankey:
 *    lo que sale del nodo es lo que llega a la fila;
 *  - las filas son HTML (rótulos de 14 y 12 px a cualquier ancho; el SVG se
 *    estira en horizontal, nunca el texto) y cada una es el enlace a su
 *    ficha, de 44 px; la banda lleva al mismo sitio con el puntero, fuera del
 *    tabulador, porque el dibujo va fuera del árbol de accesibilidad: la fila
 *    y la tabla equivalente ya lo dicen;
 *  - un flujo diminuto se dibuja de 1 px como mínimo, para que exista; la
 *    cifra de la fila es la que manda;
 *  - nada se anima al cargar; la tabla equivalente (`VerComoTabla`) va debajo.
 */
export interface FlujoSankey {
  clave: string;
  nombre: string;
  valor: number;
  /** Una línea más bajo la cifra: «12 contratos». */
  detalle?: string;
  href?: string;
}

const FILA = 44;
const GRUESO_MAX = 34;
const BARRA = 2.5; // ancho de la barra del nodo, en unidades del viewBox (0–100)

export function Sankey({
  nodo,
  contraparte,
  flujos,
  otros,
  sentido,
  formato = "pesos",
  etiqueta,
  nombreTabla = "flujos",
  className,
}: {
  /** Rótulo de la columna del nodo de la ficha: «Esta institución». */
  nodo: string;
  /** Rótulo de la columna de las filas: «Proveedor», «Institución». */
  contraparte: string;
  flujos: FlujoSankey[];
  /** Lo que no se nombra, agregado en una fila sin enlace. */
  otros?: { nombre: string; valor: number; detalle?: string } | null;
  /** `sale`: del nodo a las filas (a quién le compra). `entra`: de las filas al nodo (quién le compra). */
  sentido: "sale" | "entra";
  formato?: FormatoValor;
  /** La frase que resume el dibujo, para quien no lo ve. */
  etiqueta: string;
  nombreTabla?: string;
  className?: string;
}) {
  const filas = [
    ...flujos.filter((f) => f.valor > 0).map((f) => ({ ...f, otros: false })),
    ...(otros && otros.valor > 0 ? [{ clave: "__otros", href: undefined, ...otros, otros: true }] : []),
  ];
  if (filas.length === 0) return null;
  const total = filas.reduce((s, f) => s + f.valor, 0);
  const maximo = Math.max(...filas.map((f) => f.valor));
  const escala = GRUESO_MAX / maximo;
  const gruesos = filas.map((f) => Math.max(1, f.valor * escala));
  const alto = filas.length * FILA;
  const pila = gruesos.reduce((s, g) => s + g, 0);
  const arriba = (alto - pila) / 2;

  // x del nodo (barra) y de la punta de las filas, en el viewBox 0–100.
  const espejo = (x: number) => (sentido === "sale" ? x : 100 - x);
  let acumulado = arriba;
  const bandas = filas.map((f, i) => {
    const g = gruesos[i];
    const l0 = acumulado;
    const l1 = acumulado + g;
    acumulado = l1;
    const centro = i * FILA + FILA / 2;
    const r0 = centro - g / 2;
    const r1 = centro + g / 2;
    const x0 = espejo(BARRA);
    const x1 = espejo(100);
    const xm = 50;
    const n = (v: number) => Math.round(v * 10) / 10;
    const d = `M${n(x0)},${n(l0)} C${xm},${n(l0)} ${xm},${n(r0)} ${n(x1)},${n(r0)} L${n(x1)},${n(r1)} C${xm},${n(r1)} ${xm},${n(l1)} ${n(x0)},${n(l1)} Z`;
    return { f, d };
  });
  const parte = (v: number) => (total > 0 ? `${((v / total) * 100).toLocaleString("es-DO", { maximumFractionDigits: 1 })} %` : "");

  const dibujo = (
    <svg
      aria-hidden="true"
      viewBox={`0 0 100 ${alto}`}
      preserveAspectRatio="none"
      width="100%"
      height={alto}
      className="block overflow-visible"
    >
      <rect x={sentido === "sale" ? 0 : 100 - BARRA} y={arriba} width={BARRA} height={pila} className="fill-ink" />
      {bandas.map(({ f, d }) => {
        const trazo = (
          <path
            d={d}
            className={cn(
              "transition-opacity duration-(--dur-toque) ease-firma",
              f.otros ? "fill-grafico-otros opacity-50" : "fill-grafico-1 opacity-35 hover:opacity-70",
            )}
          >
            <title>{`${f.nombre}: ${formatearValor(f.valor, formato)} (${parte(f.valor)})`}</title>
          </path>
        );
        return f.href ? (
          <Link key={f.clave} href={f.href} tabIndex={-1}>
            {trazo}
          </Link>
        ) : (
          <g key={f.clave}>{trazo}</g>
        );
      })}
    </svg>
  );

  const lista = (
    <ol className="min-w-0">
      {filas.map((f) => (
        <li
          key={f.clave}
          className={cn("relative flex h-11 min-w-0 flex-col justify-center", sentido === "sale" ? "pl-3" : "pr-3 text-right")}
        >
          {f.href ? (
            <Link href={f.href} title={f.nombre} className="estira truncate text-sm leading-tight text-ink hover:text-brand-700">
              {f.nombre}
            </Link>
          ) : (
            <span title={f.nombre} className="truncate text-sm leading-tight text-ink-soft">
              {f.nombre}
            </span>
          )}
          <span className="truncate font-mono text-xs tabular-nums text-ink-soft">
            {formatearValor(f.valor, formato)} · {parte(f.valor)}
            {f.detalle && <span className="max-sm:hidden"> · {f.detalle}</span>}
          </span>
        </li>
      ))}
    </ol>
  );

  return (
    <figure className={cn("mt-3", className)}>
      <figcaption className="sr-only">{etiqueta}</figcaption>
      <div
        className={cn(
          "grid gap-x-0",
          // En el teléfono, el dibujo cede ancho a las filas: la cifra y su parte caben enteras.
          sentido === "sale"
            ? "grid-cols-[minmax(0,1fr)_minmax(0,3fr)] sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
            : "grid-cols-[minmax(0,3fr)_minmax(0,1fr)] sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]",
        )}
      >
        <p className={cn("rotulo pb-1 text-ink-soft", sentido === "entra" && "pr-3 text-right")}>
          {sentido === "sale" ? nodo : contraparte}
        </p>
        <p className={cn("rotulo pb-1 text-ink-soft", sentido === "sale" ? "pl-3" : "text-right")}>
          {sentido === "sale" ? contraparte : nodo}
        </p>
        {sentido === "sale" ? (
          <>
            {dibujo}
            {lista}
          </>
        ) : (
          <>
            {lista}
            {dibujo}
          </>
        )}
      </div>
      <VerComoTabla
        nombre={nombreTabla}
        columnas={[{ titulo: contraparte }, { titulo: "Monto", numerica: true }, { titulo: "Parte", numerica: true }, { titulo: "Detalle" }]}
        filas={filas.map((f) => ({
          clave: f.clave,
          celdas: [
            f.href ? (
              <Link key="n" href={f.href} className="font-sans text-brand-700 hover:underline">
                {f.nombre}
              </Link>
            ) : (
              <span key="n" className="font-sans">{f.nombre}</span>
            ),
            formatearValor(f.valor, formato),
            parte(f.valor),
            f.detalle ?? "",
          ],
        }))}
      />
    </figure>
  );
}
