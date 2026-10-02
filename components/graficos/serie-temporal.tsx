import { cn } from "@/lib/cn";
import { formatearValor, type FormatoValor } from "./formato";
import { LecturaSerie } from "./lectura-serie";
import { SERIE, CONTEXTO } from "./paleta";

/**
 * Una serie en el tiempo (o sobre cualquier eje ordenado: los tramos de un
 * histograma), pintada en el servidor.
 *
 * Dos formas y una regla para elegir (docs/INFRAESTRUCTURA.md §11):
 *  - `columnas` — un **flujo** que se suma por período: lo contratado en el
 *    año, las licencias emitidas, las denuncias. Cada columna es un total.
 *  - `linea` — un **saldo o una tasa** que se lee en su nivel: la deuda al
 *    cierre, la inflación en 12 meses, la matrícula. Sumar dos puntos no
 *    significa nada, y la línea lo dice.
 *
 * **Un solo eje**, siempre: dos medidas de escala distinta son dos gráficos
 * (o un índice común), nunca una segunda escala a la derecha —el error que la
 * nómina tenía en su serie de plazas contra gasto—.
 *
 * La escala va de cero al máximo, y el máximo va escrito sobre su filete: con
 * la línea base eso es el eje entero, sin una columna de marcas que en un
 * teléfono se comía un tercio del ancho. Las marcas de tiempo van en HTML
 * debajo y no dentro del SVG: dentro de un `viewBox` el texto se encoge con el
 * gráfico y a 390 px bajaba de 8 px.
 *
 * La capa de lectura (`LecturaSerie`) es la única parte de cliente: guía
 * vertical y ficha al apuntar, tocar o recorrer con flechas. Cada punto acepta
 * `href` y entonces lleva a su entidad. Nada se anima al cargar; las columnas
 * se dibujan al entrar en pantalla solo donde el navegador lo ata al
 * desplazamiento.
 */

export interface Punto {
  clave: string;
  valor: number;
  /** La lectura completa: «2024: RD$ 3.1 mil millones en 812 contratos». */
  lectura: string;
  /** La marca del eje bajo este punto, si lleva. */
  marca?: string;
  /** La ficha de la entidad del punto. */
  href?: string;
}

export function SerieTemporal({
  puntos,
  etiqueta,
  forma = "columnas",
  formato = "entero",
  maximo,
  alto = "normal",
  rotular = "escala",
  destacar,
  className,
}: {
  puntos: Punto[];
  /** Qué dice el gráfico, para quien no lo ve: el primer y el último valor. */
  etiqueta: string;
  forma?: "columnas" | "linea";
  /** Cómo se escribe el máximo rotulado (y los valores con `rotular="todos"`). */
  formato?: FormatoValor;
  /** Escala común entre paneles (`Multiples`). */
  maximo?: number;
  alto?: "normal" | "bajo";
  /**
   * `escala`: solo el máximo sobre su filete. `todos`: además, el valor bajo
   * cada columna (series cortas, ≤ 12 puntos, como los tramos de sueldo).
   */
  rotular?: "escala" | "todos";
  /** Énfasis: esta clave en la firma plena y el resto en la tenue. */
  destacar?: string;
  className?: string;
}) {
  const n = puntos.length;
  if (n === 0) return null;
  const valores = puntos.map((p) => p.valor);
  const max = maximo ?? Math.max(...valores);
  const min = forma === "linea" ? Math.min(0, ...valores) : 0;
  const rango = max - min || 1;
  const y = (v: number) => ((max - v) / rango) * 100; // 0 arriba, 100 abajo
  const todos = rotular === "todos" && n <= 12;
  const altura = alto === "bajo" ? "h-36" : "h-44 sm:h-52";

  const ultimo = puntos[n - 1];
  const marcas = marcasSinChoque(puntos);
  const linea = puntos.map((p, i) => `${i === 0 ? "M" : "L"}${i + 0.5},${y(p.valor).toFixed(2)}`).join(" ");
  const area = `${linea} L${n - 0.5},${y(Math.max(min, 0)).toFixed(2)} L0.5,${y(Math.max(min, 0)).toFixed(2)} Z`;

  return (
    <figure className={cn("mt-4", className)}>
      <LecturaSerie
        etiqueta={etiqueta}
        lecturas={puntos.map((p) => p.lectura)}
        hrefs={puntos.some((p) => p.href) ? puntos.map((p) => p.href) : undefined}
      >
        <div className={cn("relative", altura)} role="img" aria-label={etiqueta}>
          {/* El máximo, sobre su filete: con la base, es el eje entero. Si cada columna ya lleva su cifra, sobra. */}
          {!todos && (
            <span className="absolute left-0 top-0 font-mono text-xs tabular-nums text-ink-soft">
              {formatearValor(max, formato)}
            </span>
          )}
          <div className="absolute inset-x-0 bottom-0 top-5 border-b border-grafico-base">
            <div className="absolute inset-x-0 top-0 border-t border-grafico-rejilla" aria-hidden />
            {min < 0 && (
              <div
                className="absolute inset-x-0 border-t border-grafico-base"
                style={{ top: `${y(0)}%` }}
                aria-hidden
              />
            )}

            {forma === "columnas" ? (
              <div className="absolute inset-0 flex items-end gap-[2px]" aria-hidden>
                {puntos.map((p) => (
                  <div key={p.clave} className="flex h-full min-w-0 flex-1 items-end justify-center">
                    <div
                      className={cn(
                        "columna-grow w-full max-w-6 rounded-t-sm",
                        destacar && p.clave !== destacar ? CONTEXTO.bg : SERIE.bg,
                      )}
                      style={{ height: `${Math.max(0.5, 100 - y(Math.max(0, p.valor)))}%` }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <svg
                  viewBox={`0 0 ${n} 100`}
                  preserveAspectRatio="none"
                  className="absolute inset-0 h-full w-full overflow-visible"
                  aria-hidden
                >
                  <path d={area} className={SERIE.fill} fillOpacity={0.1} />
                  <path
                    d={linea}
                    fill="none"
                    className={SERIE.stroke}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                {/* El punto final: 8 px con anillo de papel, en HTML para que no se deforme. */}
                <span
                  aria-hidden
                  className={cn("absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface", SERIE.bg)}
                  style={{ left: `${((n - 0.5) / n) * 100}%`, top: `${y(ultimo.valor)}%` }}
                />
              </>
            )}
          </div>
        </div>
      </LecturaSerie>

      {todos ? (
        <div
          className="mt-1.5 grid gap-[2px] text-center"
          style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
        >
          {puntos.map((p) => (
            <div key={p.clave} className="flex min-w-0 flex-col items-center">
              <span className="font-mono text-xs font-semibold tabular-nums leading-tight text-ink">
                {formatearValor(p.valor, formato)}
              </span>
              {p.marca && <span className="text-xs leading-tight text-ink-soft">{p.marca}</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="relative mt-1 h-4 font-mono text-xs tabular-nums text-ink-soft" aria-hidden>
          {puntos.map((p, i) =>
            marcas.has(i) ? (
              <span
                key={p.clave}
                className={cn(
                  "absolute top-0 whitespace-nowrap",
                  i === 0 ? "" : i === n - 1 ? "-translate-x-full" : "-translate-x-1/2",
                )}
                style={{ left: i === 0 ? 0 : i === n - 1 ? "100%" : `${((i + 0.5) / n) * 100}%` }}
              >
                {p.marca}
              </span>
            ) : null,
          )}
        </div>
      )}
    </figure>
  );
}

/**
 * Las marcas del eje que caben sin pisarse. Quien llama propone (el primero,
 * el último, cada enero); aquí se descartan las que quedarían a menos de dos
 * novenos del ancho de la anterior —lo que miden dos «ene-26» a 390 px—. La última
 * siempre queda: es la fecha del dato más reciente, la que más se busca; si
 * choca, cede la penúltima. Nada se pierde: cada punto sigue en la lectura y
 * en la tabla.
 */
function marcasSinChoque(puntos: Punto[]): Set<number> {
  const n = puntos.length;
  const propuestas = puntos.flatMap((p, i) => (p.marca ? [i] : []));
  const hueco = n / 4.5;
  const quedan: number[] = [];
  for (const i of propuestas) {
    if (quedan.length === 0 || i - quedan[quedan.length - 1] >= hueco) quedan.push(i);
  }
  const ultima = propuestas[propuestas.length - 1];
  if (ultima != null && quedan[quedan.length - 1] !== ultima) {
    while (quedan.length > 1 && ultima - quedan[quedan.length - 1] < hueco) quedan.pop();
    quedan.push(ultima);
  }
  return new Set(quedan);
}
