import Link from "next/link";
import { cn } from "@/lib/cn";
import { MESES, MESES_CORTOS, SIN_DATO } from "@/lib/format";
import { formatearValor, type FormatoValor } from "./formato";
import { EscalaSecuencial } from "./leyenda";
import { SECUENCIAL } from "./paleta";

/**
 * La matriz mes × año: **cuándo pasa algo en el año** —la temporada de las
 * llegadas por avión, el mes en que se contrata—, que una serie de 36
 * columnas seguidas esconde.
 *
 * Una fila por año, una columna por mes, y la magnitud en la escala
 * secuencial de la firma (seis pasos, lineales desde cero hasta el máximo de
 * la matriz: el paso más claro es «casi cero»). Un mes sin dato es un hueco
 * con filete, no un cero: la fuente no lo publicó y así se ve.
 *
 * El color solo no basta para leer un valor continuo, así que cada celda lleva
 * su lectura en el `title` y en la etiqueta accesible, y quien la usa pone la
 * tabla equivalente debajo (`VerComoTabla`). Con `href`, la celda lleva a su
 * entidad.
 */
export interface FilaMatriz {
  anio: number;
  /** Doce valores, de enero a diciembre; `null` = la fuente no lo trae. */
  valores: (number | null)[];
  hrefs?: (string | undefined)[];
}

export function MatrizMensual({
  filas,
  etiqueta,
  formato = "entero",
  className,
}: {
  filas: FilaMatriz[];
  etiqueta: string;
  formato?: FormatoValor;
  className?: string;
}) {
  const todos = filas.flatMap((f) => f.valores.filter((v): v is number => v != null));
  if (todos.length === 0) return null;
  const max = Math.max(...todos);
  const paso = (v: number) => SECUENCIAL[Math.min(SECUENCIAL.length - 1, Math.floor((v / (max || 1)) * SECUENCIAL.length))];

  return (
    <figure className={cn("mt-4", className)}>
      <div role="table" aria-label={etiqueta} className="grid grid-cols-[2.5rem_repeat(12,minmax(0,1fr))] gap-[2px]">
        <div role="row" className="contents">
          {/* La esquina ocupa su celda: con `sr-only` salía de la rejilla y corría todas las filas. */}
          <span role="columnheader">
            <span className="sr-only">Año</span>
          </span>
          {MESES_CORTOS.map((m, i) => (
            <span
              key={m}
              role="columnheader"
              className="text-center font-mono text-xs text-ink-soft"
            >
              <abbr title={MESES[i]} className="no-underline">
                <span className="sm:hidden">{m[0].toUpperCase()}</span>
                <span className="hidden sm:inline">{m}</span>
              </abbr>
            </span>
          ))}
        </div>
        {filas.map((f) => (
          <div key={f.anio} role="row" className="contents">
            <span role="rowheader" className="self-center font-mono text-xs tabular-nums text-ink-soft">
              {f.anio}
            </span>
            {Array.from({ length: 12 }, (_, m) => {
              const v = f.valores[m] ?? null;
              const lectura = `${MESES[m]} de ${f.anio}: ${v == null ? SIN_DATO : formatearValor(v, formato)}`;
              const href = f.hrefs?.[m];
              const clase = cn(
                "block h-7",
                m === 0 && "rounded-l-sm",
                m === 11 && "rounded-r-sm",
                v == null ? "ring-1 ring-inset ring-grafico-rejilla" : paso(v),
              );
              return (
                <span key={m} role="cell" aria-label={lectura} title={lectura} className="block">
                  {href && v != null ? (
                    <Link href={href} className={cn(clase, "hover:opacity-80")} aria-label={lectura} />
                  ) : (
                    <span className={clase} />
                  )}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <EscalaSecuencial className="mt-3" desde={formatearValor(0, formato)} hasta={formatearValor(max, formato)} />
    </figure>
  );
}
