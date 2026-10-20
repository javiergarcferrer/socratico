import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatearValor, type FormatoValor } from "./formato";
import { EscalaSecuencial } from "./leyenda";
import { SECUENCIAL } from "./paleta";

/**
 * La matriz de dos categorías: **qué fila toca qué columna, y cuánto** —qué
 * fuente llena qué clase del grafo—. Hermana de `MatrizMensual`: la misma
 * marca (una celda en la escala secuencial de la firma) sobre dos ejes con
 * nombre en vez de mes × año.
 *
 * Las magnitudes van de decenas a millones, así que los seis pasos son
 * **logarítmicos** (lo dice la leyenda): con una escala lineal, todo lo que
 * no es la fila mayor sería «casi cero». Una celda vacía es un hueco con
 * filete: esa fila no toca esa columna.
 *
 * Cada celda lleva su lectura en el `title` y en la etiqueta accesible, y
 * quien la usa pone la tabla equivalente debajo (`VerComoTabla`). Las filas y
 * las celdas llevan a su entidad. Con más columnas de las que caben, la
 * matriz se desplaza dentro de su caja, con la columna de las filas fija.
 */
export interface FilaCruzada {
  clave: string;
  etiqueta: string;
  href?: string;
  /** Un valor por columna; `null` o 0 = no la toca. */
  valores: (number | null)[];
  hrefs?: (string | undefined)[];
}

export interface ColumnaCruzada {
  clave: string;
  etiqueta: string;
}

export function MatrizCruzada({
  filas,
  columnas,
  etiqueta,
  lectura,
  formato = "entero",
  activa,
  className,
}: {
  filas: FilaCruzada[];
  columnas: ColumnaCruzada[];
  etiqueta: string;
  /** La lectura de una celda en llano: «DGCP en Institución: 12,345 triples». */
  lectura: (fila: FilaCruzada, columna: ColumnaCruzada, valor: number | null) => string;
  formato?: FormatoValor;
  /** La fila resaltada (la abierta). */
  activa?: string | null;
  className?: string;
}) {
  const todos = filas.flatMap((f) => f.valores.filter((v): v is number => v != null && v > 0));
  if (todos.length === 0) return null;
  const max = Math.max(...todos);
  const techo = Math.log10(max + 1);
  const paso = (v: number) => SECUENCIAL[Math.min(SECUENCIAL.length - 1, Math.floor((Math.log10(v + 1) / (techo || 1)) * SECUENCIAL.length))];

  return (
    <figure className={cn("mt-4", className)}>
      <div className="overflow-x-auto pb-1">
        <div
          role="table"
          aria-label={etiqueta}
          className="grid gap-[2px]"
          style={{ gridTemplateColumns: `minmax(7.5rem, 13rem) repeat(${columnas.length}, minmax(1.75rem, 1fr))` }}
        >
          <div role="row" className="contents">
            <span role="columnheader" className="sticky left-0 bg-surface">
              <span className="sr-only">Fila</span>
            </span>
            {columnas.map((c) => (
              <span
                key={c.clave}
                role="columnheader"
                title={c.etiqueta}
                className="flex h-44 items-end justify-center pb-1 text-xs leading-none text-ink-soft"
              >
                <span className="max-h-full overflow-hidden [writing-mode:vertical-rl] rotate-180 whitespace-nowrap">{c.etiqueta}</span>
              </span>
            ))}
          </div>
          {filas.map((f) => (
            <div key={f.clave} role="row" className="contents">
              <span
                role="rowheader"
                className={cn(
                  "sticky left-0 z-10 flex min-h-7 items-center bg-surface pr-2 text-xs leading-tight",
                  activa === f.clave ? "font-semibold text-ink" : "text-ink-soft",
                )}
              >
                {f.href ? (
                  <Link href={f.href} className="line-clamp-2 hover:text-brand-700 hover:underline" aria-current={activa === f.clave ? "true" : undefined}>
                    {f.etiqueta}
                  </Link>
                ) : (
                  <span className="line-clamp-2">{f.etiqueta}</span>
                )}
              </span>
              {columnas.map((c, i) => {
                const v = f.valores[i] ?? null;
                const vacia = v == null || v <= 0;
                const texto = lectura(f, c, vacia ? null : v);
                const href = f.hrefs?.[i];
                const clase = cn("block h-7 rounded-sm", vacia ? "ring-1 ring-inset ring-grafico-rejilla" : paso(v));
                return (
                  <span key={c.clave} role="cell" aria-label={texto} title={texto} className="block">
                    {href && !vacia ? <Link href={href} className={cn(clase, "hover:opacity-80")} aria-label={texto} /> : <span className={clase} />}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <EscalaSecuencial desde={formatearValor(1, formato)} hasta={formatearValor(max, formato)} />
        <span className="text-xs text-ink-soft">escala logarítmica · un hueco con filete: no la toca</span>
      </div>
    </figure>
  );
}
