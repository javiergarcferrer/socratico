import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatFecha } from "@/lib/format";
import { CATEGORICA } from "./paleta";
import { VerComoTabla } from "./ver-como-tabla";

/**
 * La vida de un nodo en el tiempo, **en carriles**: un carril por grupo
 * (cargos, decretos, contratos, votaciones), un eje de años común y un punto
 * por hecho. Pintada en el servidor como HTML, sin librería
 * (docs/INFRAESTRUCTURA.md §11.11).
 *
 * Reglas que trae puestas:
 *  - **una sola marca**: una raya vertical de 3 px en su carril; un hecho con
 *    fecha exacta va en su día, uno anual (los contratos de un año) a mitad
 *    de su año, y la tabla lo dice como año, nunca como un día inventado.
 *    Hechos del mismo día se enciman en una raya: la tabla los cuenta todos;
 *  - **el color no es la única lectura**: cada carril lleva su nombre y su
 *    cuenta escritos a la izquierda, y el paso de `CATEGORICA` solo repite lo
 *    que el rótulo ya dice (orden fijo: el carril N lleva el paso N);
 *  - cada carril es un SVG que se estira en horizontal (la raya no se
 *    deforma: su trazo no escala); los rótulos son HTML y no bajan de 12 px;
 *  - cada raya lleva a su ficha con el puntero, fuera del tabulador: el
 *    dibujo va fuera del árbol de accesibilidad y la tabla equivalente
 *    (`VerComoTabla`, debajo) escribe lo pintado, de lo más reciente a lo
 *    más viejo, con su enlace (la lista entera de cada carril es la de la
 *    ficha que la monta);
 *  - un carril con más de `tope` hechos pinta los más recientes y lo dice en
 *    su rótulo; nada se anima al cargar.
 */
export interface HechoTiempo {
  clave: string;
  /** `yyyy-mm-dd` (un día) o `yyyy` (un año entero). */
  fecha: string;
  titulo: string;
  /** Lo que se dice al lado en la tabla: «RD$ 4.2 millones en 12 contratos». */
  detalle?: string;
  href?: string | null;
}

export interface CarrilTiempo {
  clave: string;
  nombre: string;
  hechos: HechoTiempo[];
}

const DIA = /^\d{4}-\d{2}-\d{2}/;

function instante(fecha: string): number | null {
  if (/^\d{4}$/.test(fecha)) return Date.UTC(Number(fecha), 6, 2);
  if (!DIA.test(fecha)) return null;
  const t = Date.parse(`${fecha.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(t) ? null : t;
}

function recortar(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

function cuando(fecha: string): string {
  return /^\d{4}$/.test(fecha) ? fecha : formatFecha(fecha.slice(0, 10));
}

export function LineaTiempo({
  carriles,
  etiqueta,
  tope = 30,
  className,
}: {
  carriles: CarrilTiempo[];
  /** La frase que resume el dibujo, para quien no lo ve. */
  etiqueta: string;
  /** Cuántos hechos pinta un carril como mucho (los más recientes). */
  tope?: number;
  className?: string;
}) {
  const vivos = carriles
    .map((c) => {
      const validos = c.hechos
        .map((h) => ({ ...h, t: instante(h.fecha) }))
        .filter((h): h is HechoTiempo & { t: number } => h.t != null)
        .sort((a, b) => b.t - a.t);
      return { ...c, total: validos.length, hechos: validos.slice(0, tope) };
    })
    .filter((c) => c.total > 0)
    .slice(0, CATEGORICA.length);
  const todos = vivos.flatMap((c) => c.hechos);
  if (todos.length < 2) return null;

  const primerAnio = new Date(Math.min(...todos.map((h) => h.t))).getUTCFullYear();
  const ultimoAnio = new Date(Math.max(...todos.map((h) => h.t))).getUTCFullYear();
  const t0 = Date.UTC(primerAnio, 0, 1);
  const t1 = Date.UTC(ultimoAnio + 1, 0, 1);
  const posicion = (t: number) => ((t - t0) / (t1 - t0)) * 100;
  const anios = ultimoAnio - primerAnio + 1;
  const paso = Math.max(1, Math.ceil(anios / 6));
  const marcas: number[] = [];
  // Cada marca es el 1 de enero de su año; ninguna pasa del último año con hechos.
  for (let a = primerAnio; a <= ultimoAnio; a += paso) marcas.push(a);

  return (
    <figure className={cn("mt-3", className)}>
      <figcaption className="sr-only">{etiqueta}</figcaption>
      <div aria-hidden="true" className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
        {vivos.map((c, i) => (
          <div key={c.clave} className="contents">
            <p className="flex h-11 min-w-0 flex-col justify-center border-b border-hairline pr-3">
              <span className="truncate text-sm leading-tight text-ink">{c.nombre}</span>
              <span className="truncate font-mono text-xs tabular-nums text-ink-soft">
                {c.total > c.hechos.length ? `${c.hechos.length} de ${c.total}` : c.total}
              </span>
            </p>
            <svg
              viewBox="0 0 1000 44"
              preserveAspectRatio="none"
              width="100%"
              height="44"
              className="block border-b border-hairline"
            >
              <g className={cn("[stroke-width:3] [&_line]:[vector-effect:non-scaling-stroke]", CATEGORICA[i].stroke)}>
                {c.hechos.map((h) => {
                  const x = (posicion(h.t) * 10).toFixed(1);
                  const raya = (
                    <line x1={x} x2={x} y1="11" y2="33">
                      <title>{`${cuando(h.fecha)} · ${recortar(h.titulo, 90)}`}</title>
                    </line>
                  );
                  return h.href ? (
                    <Link key={h.clave} href={h.href} tabIndex={-1}>
                      {raya}
                    </Link>
                  ) : (
                    <g key={h.clave}>{raya}</g>
                  );
                })}
              </g>
            </svg>
          </div>
        ))}
        <span />
        <div className="relative h-6">
          {marcas.map((a, k) => (
            <span
              key={a}
              className={cn(
                "absolute top-1 -translate-x-1/2 font-mono text-xs tabular-nums text-ink-soft first:translate-x-0",
                // En el teléfono, una marca sí y otra no (la primera y la última siempre): no se enciman.
                k % 2 === 1 && k !== marcas.length - 1 && "max-sm:hidden",
              )}
              style={{ left: `${posicion(Date.UTC(a, 0, 1)).toFixed(1)}%` }}
            >
              {a}
            </span>
          ))}
        </div>
      </div>
      <VerComoTabla
        nombre="hechos"
        columnas={[{ titulo: "Fecha" }, { titulo: "Carril" }, { titulo: "Qué" }, { titulo: "Detalle" }]}
        filas={vivos
          .flatMap((c) => c.hechos.map((h) => ({ c, h })))
          .sort((a, b) => b.h.t - a.h.t)
          .map(({ c, h }) => ({
            clave: `${c.clave}|${h.clave}`,
            celdas: [
              cuando(h.fecha),
              <span key="c" className="font-sans">{c.nombre}</span>,
              h.href ? (
                <Link key="q" href={h.href} className="font-sans text-brand-700 hover:underline">
                  {h.titulo}
                </Link>
              ) : (
                <span key="q" className="font-sans">{h.titulo}</span>
              ),
              h.detalle ?? "",
            ],
          }))}
      />
    </figure>
  );
}
