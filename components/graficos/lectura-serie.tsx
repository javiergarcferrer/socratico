"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

/**
 * La capa de lectura de una serie: la **única** parte de cliente de
 * `SerieTemporal`. El gráfico se pinta en el servidor y llega entero; esto
 * solo añade, encima, la guía vertical que busca el punto más cercano y la
 * ficha con su valor.
 *
 * - **Se apunta a una fecha, no a una línea de 2 px**: toda la anchura del
 *   gráfico es el objetivo; el puntero, el dedo o las flechas eligen la
 *   columna más cercana.
 * - **Un dedo no tiene `hover`**: tocar enseña la lectura y la deja puesta; si
 *   el punto lleva a una ficha, la lectura trae un enlace de 44 px. Con ratón,
 *   el clic va directo a la ficha.
 * - **La lectura no es la única vía**: el máximo va rotulado, los extremos del
 *   eje también y la tabla equivalente está debajo (docs/INFRAESTRUCTURA.md §11
 *   §Gráficos). Esto acelera; no esconde nada.
 * - Aparece y se va sin animar: responde al lector en el mismo cuadro.
 */
export function LecturaSerie({
  lecturas,
  hrefs,
  etiqueta,
  children,
}: {
  /** «2024: RD$ 3.1 mil millones en 812 contratos», una por punto. */
  lecturas: string[];
  hrefs?: (string | undefined)[];
  etiqueta: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [i, setI] = useState<number | null>(null);
  const [tactil, setTactil] = useState(false);
  const [teclado, setTeclado] = useState(false);
  const n = lecturas.length;

  const indice = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    return Math.min(n - 1, Math.max(0, Math.floor(((clientX - r.left) / r.width) * n)));
  };

  const mover = (e: PointerEvent<HTMLDivElement>) => {
    setTactil(e.pointerType !== "mouse");
    setTeclado(false);
    setI(indice(e.clientX));
  };

  const teclas = (e: KeyboardEvent<HTMLDivElement>) => {
    const actual = i ?? n - 1;
    let siguiente: number | null = actual;
    if (e.key === "ArrowLeft") siguiente = Math.max(0, actual - 1);
    else if (e.key === "ArrowRight") siguiente = Math.min(n - 1, actual + 1);
    else if (e.key === "Home") siguiente = 0;
    else if (e.key === "End") siguiente = n - 1;
    else if (e.key === "Escape") siguiente = null;
    else if (e.key === "Enter" && i != null && hrefs?.[i]) {
      router.push(hrefs[i]!);
      return;
    } else return;
    e.preventDefault();
    setTeclado(true);
    setTactil(false);
    setI(siguiente);
  };

  const centro = i != null ? ((i + 0.5) / n) * 100 : 0;
  const [cabeza, ...resto] = i != null ? lecturas[i].split(": ") : [""];
  const cuerpo = resto.join(": ");

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="group"
      aria-roledescription="gráfico"
      aria-label={`${etiqueta}. Con las flechas se recorre punto por punto.`}
      className="relative touch-pan-y rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-surface"
      onPointerMove={mover}
      onPointerDown={mover}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") setI(null);
      }}
      onClick={() => {
        if (!tactil && i != null && hrefs?.[i]) router.push(hrefs[i]!);
      }}
      onKeyDown={teclas}
      onBlur={() => setI(null)}
      style={{ cursor: hrefs?.some(Boolean) ? "pointer" : undefined }}
    >
      {children}
      {i != null && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 bg-ink/5"
            style={{ left: `${(i / n) * 100}%`, width: `${100 / n}%` }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-px bg-ink-soft"
            style={{ left: `${centro}%` }}
          />
          <div
            className="absolute top-0 z-10 w-max max-w-[min(18rem,80%)] rounded-md border border-hairline bg-surface px-3 py-2 text-left shadow-pop"
            style={
              i < n / 2
                ? { left: `calc(${centro}% + 8px)` }
                : { right: `calc(${100 - centro}% + 8px)` }
            }
          >
            {cuerpo ? (
              <>
                <p className="font-mono text-sm font-semibold tabular-nums text-ink">{cuerpo}</p>
                <p className="mt-0.5 text-xs text-ink-soft">{cabeza}</p>
              </>
            ) : (
              <p className="font-mono text-sm font-semibold tabular-nums text-ink">{cabeza}</p>
            )}
            {tactil && hrefs?.[i] && (
              <Link
                href={hrefs[i]!}
                className="-mx-1 mt-1 flex min-h-11 items-center px-1 text-xs font-semibold text-brand-700 hover:underline"
              >
                Abrir la ficha
              </Link>
            )}
          </div>
        </>
      )}
      <p className="sr-only" aria-live="polite">
        {teclado && i != null ? lecturas[i] : ""}
      </p>
    </div>
  );
}
