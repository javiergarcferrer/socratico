import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { IconArrowRight } from "@/components/icons";
import { formatInt } from "@/lib/nomina";

/**
 * Una arista del grafo vista desde una ficha: adónde lleva, cuántos nodos hay
 * al otro lado y de qué fuente sale el cruce (docs/INFRAESTRUCTURA.md §7).
 */
export interface Arista {
  /** Qué hay al otro lado, en llano: «Capítulo del presupuesto», «Obras que ejecuta». */
  etiqueta: string;
  /** El nodo o la lista; siempre una dirección de `lib/grafo.ts` o una vista filtrada. */
  href: string;
  /** Cuántos hay, si es una lista. Una arista con cero no se pinta. */
  cuenta?: number | null;
  /** El nombre del nodo cuando es uno solo: «Ministerio de Educación». */
  nombre?: string | null;
  /** De dónde sale el cruce: «SIGEF», «DGCP», «SIL de la Cámara». */
  fuente: string;
}

/**
 * «Conectado con»: el vecindario de una ficha, cada arista una fila entera
 * que se pulsa (docs/INFRAESTRUCTURA.md §11) con su cuenta y su fuente. Solo
 * aristas verificadas —un cruce adivinado es peor que ninguno—; las que no
 * tienen nada al otro lado se callan, y si no queda ninguna, el bloque
 * entero.
 */
export function ConectadoCon({
  aristas,
  className,
}: {
  /** Las que no aplican llegan como `false`, `null` o `""` y se descartan. */
  aristas: (Arista | null | false | undefined | "")[];
  className?: string;
}) {
  const vivas = aristas.filter((a): a is Arista => !!a && (a.cuenta == null || a.cuenta > 0));
  if (vivas.length === 0) return null;
  return (
    <Card as="section" aria-labelledby="conectado-con" className={className}>
      <div className="px-5 pb-2 pt-4 sm:px-6">
        <CardTitle id="conectado-con">Conectado con</CardTitle>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          Lo que las fuentes del Estado ligan a esta ficha. Cada fila abre el otro extremo.
        </p>
      </div>
      {/*
        `grid-cols-1` explícito y `min-w-0` en cada fila: sin eso la columna
        implícita crece hasta el nombre más largo y la fila se salía de la
        hoja a 390 px. El nombre del nodo se envuelve en vez de cortarse: es
        justo lo que distingue una arista de otra.
      */}
      <ul className="grid grid-cols-1 border-t border-hairline sm:grid-cols-2">
        {vivas.map((a) => (
          <li key={`${a.etiqueta}|${a.href}`} className="min-w-0 border-b border-hairline sm:odd:border-r">
            <Link
              href={a.href}
              className="group flex min-h-11 items-center gap-3 px-5 py-3 transition-colors hover:bg-canvas/60 active:bg-canvas sm:px-6"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">{a.etiqueta}</span>
                <span className="block break-words text-xs leading-snug text-ink-soft">
                  {a.nombre ? `${a.nombre} · ${a.fuente}` : a.fuente}
                </span>
              </span>
              {typeof a.cuenta === "number" && (
                <span className="shrink-0 font-mono text-sm tabular-nums text-ink">{formatInt(a.cuenta)}</span>
              )}
              <IconArrowRight className="h-4 w-4 shrink-0 text-ink-soft transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
