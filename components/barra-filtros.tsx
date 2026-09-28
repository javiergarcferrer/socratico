"use client";

import Link from "next/link";
import {
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";
import { BottomSheet } from "@/components/bottom-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconSliders, IconX } from "@/components/icons";

/**
 * Un filtro puesto, dicho como chip.
 *
 * `href` es la página **sin** ese filtro. Un filtro que el origen exige —el SIL
 * no lista «todos los tipos» dentro de un tema— no se puede quitar, y entonces
 * no lleva `href`: se ve, que es lo que pide la regla, pero no finge un aspa
 * que no haría nada. Por qué no se quita lo dice `notaFijos` de la barra, en
 * texto a la vista: un `title` no existe en una pantalla táctil.
 */
export interface ChipFiltro {
  clave: string;
  label: string;
  href?: string;
  /** Viene de fábrica: se pinta en gris, no en la firma. */
  porDefecto?: boolean;
}

/**
 * La barra de filtros de una vista cuyos filtros **son enlaces** (la URL es el
 * estado): el mismo patrón que `/licitaciones` —panel a la vista en pantalla
 * ancha; en el teléfono, un botón «Filtros (n)» que abre la hoja inferior y
 * debajo los chips de lo que está puesto—, pero para páginas de servidor.
 *
 * Existe porque el buscador de compras lo tiene escrito para su estado de
 * cliente y los listados del Congreso lo necesitaban con enlaces: se extrae el
 * hermano en vez de copiar la hoja, el botón y el chip a cada página. En el
 * teléfono los filtros se apilaban antes del primer resultado —dieciséis chips,
 * unos 790 px, en el directorio de legisladores—; aquí quedan a un toque y lo
 * que está puesto sigue a la vista.
 *
 * Los controles se pasan como `children` y se pintan en los dos sitios: el
 * panel de escritorio y la hoja. Al pulsar un enlace dentro de la hoja, la hoja
 * se cierra: la navegación ya es la respuesta. Lo mismo al elegir una opción
 * de un `Select`, que no es un enlace —navega desde `onValueChange`—, y como
 * red, cuando lo puesto cambia: los chips llegan distintos del servidor. Así
 * ningún selector tiene que saber que vive dentro de una hoja.
 */
export function BarraFiltros({
  chips,
  conteo,
  children,
  titulo = "Filtros",
  notaFijos,
  className,
}: {
  chips: ChipFiltro[];
  /**
   * Por qué los chips sin `href` no se pueden quitar. Se escribe una vez,
   * debajo de los chips, solo si hay alguno así.
   */
  notaFijos?: string;
  /** El recuento que se ve junto al botón en el teléfono, con su base. */
  conteo?: string;
  children: ReactNode;
  titulo?: string;
  className?: string;
}) {
  const [abierta, setAbierta] = useState(false);
  /*
    Se cierra al elegir: un enlace, o una opción de un `Select`. Las opciones
    viven en un portal, pero los eventos de React suben por el árbol de
    componentes y no por el DOM, así que llegan aquí igual. Radix elige con el
    `pointerup` del ratón, con el `click` del dedo y con Intro o Espacio.
  */
  const cerrarSiElige = (e: MouseEvent | PointerEvent | KeyboardEvent) => {
    // Radix anula el `pointerup` que abrió la lista para que no elija nada.
    if (e.defaultPrevented) return;
    const t = e.target as Element;
    if (e.type === "keydown") {
      const k = (e as KeyboardEvent).key;
      if ((k === "Enter" || k === " ") && t.closest("[role=option]")) setAbierta(false);
      return;
    }
    if (e.type === "pointerup" && (e as PointerEvent).pointerType !== "mouse") return;
    if (t.closest(e.type === "click" ? "a[href], [role=option]" : "[role=option]")) {
      setAbierta(false);
    }
  };

  // Y, por si un control navega sin pasar por ahí, cuando lo puesto cambia.
  const firma = chips.map((c) => `${c.clave}=${c.label}`).join("|");
  const [firmaVista, setFirmaVista] = useState(firma);
  if (firma !== firmaVista) {
    setFirmaVista(firma);
    setAbierta(false);
  }

  const nota =
    notaFijos && chips.some((c) => !c.href) ? (
      <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{notaFijos}</p>
    ) : null;

  return (
    <div className={className}>
      {/* Escritorio: los controles a la vista, y debajo lo que está puesto. */}
      <div className="hidden lg:block">
        {children}
        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {chips.map((c) => (
              <Chip key={c.clave} chip={c} />
            ))}
          </div>
        )}
        {nota}
      </div>

      {/* Teléfono: un botón con cuántos hay, y los chips en una fila que se desliza. */}
      <div className="lg:hidden">
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setAbierta(true)}>
            <IconSliders className="h-4 w-4 text-brand-600" />
            {titulo}
            {chips.length > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 font-mono text-xs font-semibold tabular-nums text-canvas">
                {chips.length}
              </span>
            )}
          </Button>
          {conteo && (
            <span className="ml-auto text-right font-mono text-xs tabular-nums text-ink-soft">
              {conteo}
            </span>
          )}
        </div>
        {chips.length > 0 && (
          <div className="no-scrollbar -mb-0.5 mt-2 flex gap-2 overflow-x-auto">
            {chips.map((c) => (
              <Chip key={c.clave} chip={c} className="h-10 shrink-0 px-3" />
            ))}
          </div>
        )}
        {nota}
      </div>

      <BottomSheet
        open={abierta}
        onClose={() => setAbierta(false)}
        title={titulo}
        footer={
          <Button onClick={() => setAbierta(false)} className="h-12 w-full">
            Ver resultados
          </Button>
        }
      >
        <div
          className="pb-2"
          onClickCapture={cerrarSiElige}
          onPointerUpCapture={cerrarSiElige}
          onKeyDownCapture={cerrarSiElige}
        >
          {children}
        </div>
      </BottomSheet>
    </div>
  );
}

/**
 * El chip de un filtro puesto. Mismo vestido que el de `/licitaciones`: los de
 * fábrica en gris y los que puso el lector en la firma, con el aspa de
 * quitarlo. Aquí es un enlace, porque quitar un filtro es ir a otra página.
 */
function Chip({ chip, className }: { chip: ChipFiltro; className?: string }) {
  const clases = cn(
    "h-7 gap-1 px-2.5 font-medium",
    chip.porDefecto
      ? "bg-canvas text-ink-soft hover:text-ink"
      : "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 hover:text-brand-800",
    className,
  );

  if (!chip.href) {
    return (
      <Badge
        forma="etiqueta"
        variant="contorno"
        className={cn(
          "h-7 whitespace-nowrap bg-canvas px-2.5 text-xs font-medium text-ink-soft",
          className,
        )}
      >
        {chip.label}
      </Badge>
    );
  }

  return (
    <Button
      asChild
      variant={chip.porDefecto ? "secondary" : "outline"}
      size="sm"
      className={clases}
    >
      <Link
        href={chip.href}
        title={
          chip.porDefecto
            ? "Filtro por defecto: quítalo para ampliar la lista"
            : "Quitar este filtro"
        }
        aria-label={`Quitar el filtro: ${chip.label}`}
      >
        <span className="max-w-[14rem] truncate">{chip.label}</span>
        <IconX className="h-3 w-3 shrink-0" />
      </Link>
    </Button>
  );
}
