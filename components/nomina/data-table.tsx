"use client";

import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { IconChevronDown, IconChevronUpDown } from "@/components/icons";
import {
  COL,
  formatDOP,
  formatInt,
  type InstitucionNomina,
  type Row,
} from "@/lib/nomina";

export type SortKey = "institucion" | "area" | "cargo" | "sueldo";
export type SortDir = "asc" | "desc";

/**
 * Alto **estimado** de una fila: el de escritorio, una línea con su aire.
 *
 * Antes era el alto exacto y fijo de todas las filas, y la virtualización
 * calculaba en píxeles a partir de él. En el teléfono la fila lleva dos
 * líneas (cargo + área·institución) porque las cinco columnas no caben en
 * 326 px de pista, y cualquier fila que creciera —un tamaño de letra mayor
 * en el sistema, un cargo que no se deja truncar— descuadraba la cuenta: las
 * filas se montaban unas sobre otras o dejaban huecos. Ahora
 * `@tanstack/react-virtual` mide cada fila pintada (`measureElement`) y este
 * número solo sirve para las que aún no se han visto.
 */
const ROW_H_ESTIMADO = 52;
const OVERSCAN = 12;

/*
  Alto de la pista que se desplaza.

  En escritorio son 600 px, la mitad larga de la ventana. En un teléfono de
  844 px, con 64 de cabecera y 72 de barra inferior, 600 px de pista dejaban
  108 px de página alrededor: el dedo casi nunca encontraba el margen y la
  página parecía atascada dentro de la tabla. A 400 px queda pista de sobra
  —ocho filas— y sigue habiendo página por arriba y por abajo para salir de
  ella. Lo decide el CSS (`h-[400px] sm:h-[600px]`); el virtualizador observa
  el elemento y lee su alto real, así que girar el teléfono no lo descuadra.
*/

const GRID =
  "grid grid-cols-[minmax(0,1fr)_7.5rem] gap-x-3 sm:grid-cols-[3.5rem_6rem_minmax(0,2.2fr)_minmax(0,2.6fr)_7.5rem]";

export function DataTable({
  rows,
  instituciones,
  areas,
  cargos,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: Row[];
  instituciones: InstitucionNomina[];
  areas: string[];
  cargos: string[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H_ESTIMADO,
    overscan: OVERSCAN,
  });

  /*
    Reordenar vuelve al principio de la pista. Las filas son otras: quedarse
    en la posición 40.000 de un orden nuevo es aterrizar en medio de nada, y
    quien pulsa «Sueldo» quiere ver el primero. Solo al cambiar el orden —no
    al filtrar, que ya encoge la lista por su cuenta—.
  */
  const ordenPrevio = useRef(`${sortKey}|${sortDir}`);
  useEffect(() => {
    const orden = `${sortKey}|${sortDir}`;
    if (ordenPrevio.current === orden) return;
    ordenPrevio.current = orden;
    virtual.scrollToOffset(0);
  }, [sortKey, sortDir, virtual]);

  const total = rows.length;
  const items = virtual.getVirtualItems();

  /*
    Esta rejilla **no** es la `Table` de `components/ui`: son cien mil plazas
    virtualizadas, la fila se mide en píxeles para poder saltarse las que no se
    ven, y en teléfono se pliega a dos líneas. Una `<table>` con esa mecánica
    pintaría igual y costaría el desplazamiento fluido, que es justo lo que
    esta vista vende. La primitiva se usa donde manda un cuadro de datos
    normal; aquí manda el rendimiento, y queda dicho para que nadie lo
    «unifique» sin saberlo.
  */
  return (
    <Card>
      {/*
        La cabecera es la única forma de reordenar cien mil filas y sus botones
        medían 17 px de alto. En teléfono el relleno de la barra pasa al propio
        botón (`min-h-11`), que es lo que hace el objetivo táctil sin mover el
        texto de sitio; desde `sm` vuelve el relleno de la barra.
      */}
      <div
        className={cn(
          GRID,
          "border-b border-hairline bg-canvas px-4 rotulo text-ink-soft sm:py-2.5",
        )}
      >
        <span className="hidden font-mono text-right tabular-nums sm:inline">#</span>
        <span className="hidden sm:contents">
          <HeaderCell label="Inst." col="institucion" {...{ sortKey, sortDir, onSort }} />
          <HeaderCell label="Área" col="area" {...{ sortKey, sortDir, onSort }} />
        </span>
        <HeaderCell label="Cargo" col="cargo" {...{ sortKey, sortDir, onSort }} />
        <HeaderCell label="Sueldo" col="sueldo" align="right" {...{ sortKey, sortDir, onSort }} />
      </div>

      {total === 0 ? (
        <div className="px-4 py-9 text-center sm:py-14">
          <p className="text-sm font-medium text-ink">Ninguna plaza coincide con los filtros</p>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-ink-soft">
            Quita una palabra de la búsqueda, amplía el rango de sueldo o pulsa
            «Limpiar» en la barra de filtros.
          </p>
        </div>
      ) : (
        <div ref={scrollRef} className="h-[400px] overflow-auto sm:h-[600px]">
          <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
            {/*
              Las filas visibles van en flujo normal dentro de una caja que se
              desplaza hasta la primera: así cada una mide lo que pinta, y el
              virtualizador lee ese alto al montarla (`data-index` +
              `measureElement`).
            */}
            <div style={{ transform: `translateY(${items[0]?.start ?? 0}px)` }}>
              {items.map((v) => {
                const idx = v.index;
                const r = rows[idx];
                const inst = instituciones[r[COL.INST]];
                return (
                  <div
                    key={v.key}
                    data-index={idx}
                    ref={virtual.measureElement}
                    className={cn(
                      GRID,
                      "min-h-13 items-center px-4 py-1.5 text-sm",
                      idx % 2 ? "bg-surface" : "bg-canvas/50",
                      "hover:bg-brand-50",
                    )}
                  >
                    <span className="hidden font-mono text-right tabular-nums text-xs text-ink-soft sm:inline">
                      {formatInt(idx + 1)}
                    </span>
                    <span
                      className="hidden truncate font-mono font-medium text-ink sm:inline"
                      title={inst.nombre}
                    >
                      {inst.codigo}
                    </span>
                    <span
                      className="hidden truncate text-ink sm:inline"
                      title={areas[r[COL.AREA]]}
                    >
                      {areas[r[COL.AREA]]}
                    </span>
                    {/* Teléfono: cargo arriba, área e institución debajo. */}
                    <span className="min-w-0">
                      <span className="block truncate text-ink" title={cargos[r[COL.CARGO]]}>
                        {cargos[r[COL.CARGO]]}
                      </span>
                      {/* Área e institución son el contexto de la plaza, no un pie: 12 px. */}
                      <span className="block truncate text-xs text-ink-soft sm:hidden">
                        {areas[r[COL.AREA]]} · {inst.codigo}
                      </span>
                    </span>
                    <span className="text-right font-mono tabular-nums text-ink">
                      {formatDOP(r[COL.SUELDO])}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function HeaderCell({
  label,
  col,
  align = "left",
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  col: SortKey;
  align?: "left" | "right";
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const activeSort = sortKey === col;
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className={cn(
        "flex min-h-11 items-center gap-1 rounded-sm transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas sm:min-h-0",
        align === "right" && "justify-end",
        activeSort && "text-brand-700",
      )}
    >
      {label}
      {/* La cabecera es una rejilla y no un `<th>`: sin `aria-sort`, el orden se dice en palabras. */}
      {activeSort && (
        <span className="sr-only">{sortDir === "asc" ? ", orden ascendente" : ", orden descendente"}</span>
      )}
      <SortGlyph active={activeSort} dir={sortDir} />
    </button>
  );
}

/** El glifo del orden, del juego de iconos de la casa y no de un svg suelto. */
function SortGlyph({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <IconChevronUpDown className="h-3.5 w-3.5 opacity-40" />;
  return (
    <IconChevronDown
      className={cn("h-3.5 w-3.5", dir === "asc" && "rotate-180")}
    />
  );
}
