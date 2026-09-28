import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { SERIE, type ClasesSerie } from "./paleta";

/**
 * Barras horizontales — **comparar cuánto** entre cosas con nombre: los veinte
 * adjudicatarios, las unidades ejecutoras de un capítulo, los meses de un año.
 *
 * Es la forma de la casa para un ranking porque se lee en el teléfono: el
 * nombre entero arriba (una o dos líneas, nunca cortado a tres letras), la
 * cifra a la derecha en mono —la cifra es la lectura; la barra, la
 * comparación— y la base debajo. Cada fila escribe su valor, así que la
 * barra nunca es la única forma de leerlo y no hace falta capa al apuntar:
 * la fila **es** la tabla equivalente.
 *
 * Reglas que trae puestas (docs/IDENTIDAD.md §Gráficos):
 *  - una sola serie, en la firma (`SERIE`); el color no codifica el puesto;
 *  - barra de 8 px, extremo del dato con esquina de 4 px y cuadrada en la
 *    base; sin carril detrás: el carril es de un medidor (`Progress`), y
 *    aquí la escala es «el mayor de la lista», no «el 100 %»;
 *  - un mínimo visible (2 % por omisión) para que un valor pequeño no
 *    desaparezca, dicho aquí porque falsea la longitud a propósito;
 *  - `href` por fila: la fila entera lleva a la ficha de la entidad
 *    (`estira`), y con eso la fila toma sola la respuesta de la casa;
 *  - se dibuja al entrar en pantalla solo donde el navegador lo ata al
 *    desplazamiento (`bar-grow`); las cifras nunca cuentan hacia arriba.
 *
 * Es componente de servidor, pero no importa nada de servidor: la nómina lo
 * usa dentro de su explorador de cliente con `alElegir`, que convierte cada
 * fila en un filtro en vez de un enlace.
 */

export interface Barra {
  clave: string;
  /** El nombre o el período. */
  etiqueta: ReactNode;
  /** La fila en texto llano, para el `title` y el lector de pantalla. */
  titulo?: string;
  valor: number;
  /** El valor ya escrito (`formatPesos`, `formatMonto`, un conteo). */
  cifra: ReactNode;
  /** La base, debajo: «12 contratos · 3 instituciones». */
  detalle?: ReactNode;
  /** La ficha de la entidad. La fila entera lleva ahí. */
  href?: string;
  /** La fila es el filtro puesto (`aria-current="page"`): la materia elegida. */
  actual?: boolean;
  /**
   * Una parte del mismo valor, pintada dentro de la barra (lo pagado de lo
   * devengado). Con parte, el total va en la firma tenue y la parte en la
   * firma plena; quien la usa pone la leyenda (`Leyenda`).
   */
  parte?: number;
}

interface Comunes {
  /** La escala común, cuando varios paneles se comparan entre sí (`Multiples`). */
  maximo?: number;
  /** Suelo visible en % del ancho. */
  minimo?: number;
  /** `periodo`: la etiqueta es una fecha o un mes y va en mono. */
  forma?: "nombre" | "periodo";
  /** Filas con filete y relleno, a sangre dentro de una `Card` (la lista pone el filete). */
  filas?: boolean;
  /** Numerar el puesto (1, 2, 3…) a la izquierda. */
  numerar?: boolean;
  /** Líneas del nombre antes de cortar. */
  lineas?: 1 | 2;
  tono?: ClasesSerie;
  /** Solo en cliente: la fila elige en vez de navegar. */
  alElegir?: (clave: string) => void;
  elegida?: string | null;
}

export function BarrasHorizontales({
  barras,
  etiqueta,
  className,
  ...comunes
}: Comunes & {
  barras: Barra[];
  /** Qué compara la lista, para el lector de pantalla. */
  etiqueta: string;
  className?: string;
}) {
  if (barras.length === 0) return null;
  const maximo = comunes.maximo ?? Math.max(1, ...barras.map((b) => b.valor));
  const Lista = comunes.numerar ? "ol" : "ul";
  return (
    <Lista aria-label={etiqueta} className={cn(comunes.filas ? "divide-y divide-hairline" : "space-y-2", className)}>
      {barras.map((b, i) => (
        <FilaBarra key={b.clave} barra={b} puesto={i + 1} {...comunes} maximo={maximo} />
      ))}
    </Lista>
  );
}

/**
 * Una fila suelta, para las listas que se pliegan (`RankingPlegado` recibe
 * filas ya hechas). Con `maximo` obligatorio: la escala es de la lista, no de
 * la fila.
 */
export function FilaBarra({
  barra: b,
  puesto,
  maximo,
  minimo = 2,
  forma = "nombre",
  filas = false,
  numerar = false,
  // Un nombre en un renglón cortaba justo la palabra que distingue dos
  // instituciones; un periodo cabe siempre en uno.
  lineas = forma === "periodo" ? 1 : 2,
  tono = SERIE,
  alElegir,
  elegida,
}: Comunes & { barra: Barra; puesto: number; maximo: number }) {
  const sangria = numerar ? "ml-[1.875rem]" : undefined;
  const claseEtiqueta = cn(
    "min-w-0 flex-1 text-sm",
    lineas === 1 ? "line-clamp-1" : "line-clamp-2 leading-snug",
    forma === "periodo" ? "font-mono font-medium tabular-nums" : "font-medium",
  );
  const activa = alElegir != null && elegida === b.clave;

  let rotulo: ReactNode;
  if (alElegir) {
    rotulo = (
      <button
        type="button"
        onClick={() => alElegir(b.clave)}
        aria-pressed={activa}
        title={b.titulo}
        className={cn(claseEtiqueta, "estira text-left text-ink hover:text-brand-700")}
      >
        {b.etiqueta}
      </button>
    );
  } else if (b.href) {
    rotulo = (
      <Link
        href={b.href}
        title={b.titulo}
        aria-current={b.actual ? "page" : undefined}
        className={cn(claseEtiqueta, "estira text-brand-700 hover:underline", b.actual && "font-semibold")}
      >
        {b.etiqueta}
      </Link>
    );
  } else {
    rotulo = (
      <span className={cn(claseEtiqueta, "text-ink")} title={b.titulo}>
        {b.etiqueta}
      </span>
    );
  }

  return (
    <li
      className={cn(
        "relative",
        filas ? "px-5 py-3 sm:px-6" : "py-1",
        (b.href || alElegir) && !filas && "-mx-2 rounded-md px-2",
      )}
    >
      <div className="flex items-baseline gap-2.5">
        {numerar && (
          <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-ink-soft">{puesto}</span>
        )}
        {rotulo}
        <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-ink">{b.cifra}</span>
      </div>
      <MarcaBarra
        className={cn("mt-1.5", sangria)}
        valor={b.valor}
        maximo={maximo}
        minimo={minimo}
        parte={b.parte}
        tono={tono}
      />
      {b.detalle && <div className={cn("mt-1 text-xs text-ink-soft", sangria)}>{b.detalle}</div>}
    </li>
  );
}

/**
 * La marca sola: la barra de un dato, para una fila compuesta que ya tiene su
 * propia forma (la tarjeta de cada capítulo en `/finanzas`). Es la misma que
 * pinta `FilaBarra` —8 px, esquina de 4 px en el extremo del dato, sin
 * carril—, extraída para que nadie la vuelva a dibujar con un `Progress`, que
 * es un medidor contra el 100 % y no una comparación contra el mayor.
 */
export function MarcaBarra({
  valor,
  maximo,
  minimo = 2,
  parte,
  tono = SERIE,
  className,
}: {
  valor: number;
  maximo: number;
  minimo?: number;
  parte?: number;
  tono?: ClasesSerie;
  className?: string;
}) {
  const pct = maximo > 0 ? Math.min(100, Math.max(minimo, (valor / maximo) * 100)) : minimo;
  const pctParte = parte != null && valor > 0 ? Math.min(100, Math.max(0, (parte / valor) * 100)) : null;
  return (
    <div className={cn("h-2", className)} aria-hidden>
      <div
        className={cn("bar-grow relative h-full rounded-r-sm", pctParte != null ? "bg-grafico-sec-3" : tono.bg)}
        style={{ width: `${pct}%` }}
      >
        {pctParte != null && (
          <span
            className={cn("absolute inset-y-0 left-0 rounded-r-sm", tono.bg)}
            style={{ width: `${pctParte}%` }}
          />
        )}
      </div>
    </div>
  );
}
