"use client";

import SeguirButton from "./seguir-button";
import Guardar from "./espacios/guardar";
import Compartir, { CopiarEnlace, compartirEnlace, type TipoCompartido } from "./compartir";
import { IconChevronDown, IconRss, IconShare } from "./icons";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";
import { TIPOS_SEGUIDO, huellaDe, type Situacion, type TipoSeguido } from "@/lib/seguimiento";

/**
 * Las acciones de una ficha: seguirla, compartirla, copiar su enlace y, si
 * tiene, su RSS.
 *
 * Existe para que cada ficha lleve **una línea** y no tres controles con sus
 * props: las fichas las editan varias sesiones a la vez, y una pieza compuesta
 * aquí mantiene los cambios ahí en una importación y un uso. `situacion` son
 * los datos crudos del estado; la huella se calcula con `huellaDe`, la misma
 * función que usa `/api/seguimiento`, así que lo que se guarda al seguir y lo
 * que se compara al volver no pueden divergir.
 *
 * **En el teléfono, una sola fila.** Los botones no caben a 390 px y
 * saltaban a dos renglones; como varias fichas los ponen encima del titular,
 * en `/congreso/158561` el h1 quedaba a 298 px del borde. Seguir y Guardar
 * —lo que se hace con una ficha: que te avise, llevarla a tu investigación—
 * se quedan a la vista; compartir, copiar el enlace y el RSS van a «Más
 * opciones». Desde `sm` caben todos en fila y vuelven a estar sueltos.
 *
 * «Guardar» (`components/espacios/guardar.tsx`) es la única pieza que habla
 * con la cuenta del lector, y carga su cliente solo al abrirla: la ficha
 * sigue sin tocar la base (CLAUDE.md, la invariante). Lo que se guarda es la
 * referencia —tipo, ruta, título—, nunca un dato de la ficha.
 *
 * Un tipo que no se puede seguir (el capítulo presupuestario, que es una
 * instantánea) no lleva Seguir.
 */
export default function AccionesFicha({
  tipo,
  id,
  titulo,
  href,
  situacion,
  feed,
  className,
}: {
  tipo: TipoCompartido;
  id: string;
  titulo: string;
  href: string;
  situacion?: Situacion;
  /** Ruta del RSS de esta ficha, si lo tiene. */
  feed?: string;
  className?: string;
}) {
  const seguible = (TIPOS_SEGUIDO as readonly string[]).includes(tipo);
  const rss = feed ? (
    <a href={feed} title="Recibe cada cambio en tu lector de noticias (RSS)">
      <IconRss className="h-3.5 w-3.5" />
      RSS
    </a>
  ) : null;

  return (
    <div className={cn("flex items-center gap-2 sm:flex-wrap", className)}>
      {seguible && (
        <SeguirButton
          tipo={tipo as TipoSeguido}
          id={id}
          titulo={titulo}
          href={href}
          huella={situacion ? huellaDe(situacion) : undefined}
        />
      )}
      <Guardar referencia={{ tipo, ref: href, titulo, href }} />

      {/* Desde `sm`, sueltos en la misma fila. */}
      <span className="hidden sm:inline-flex">
        <Compartir titulo={titulo} tipo={tipo} conCopiar={false} />
      </span>
      <CopiarEnlace className="hidden sm:inline-flex" />
      {rss && (
        <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
          {rss}
        </Button>
      )}

      {/* En el teléfono, dentro de «Más opciones»: 44 px por fila, se pulsan con el pulgar. */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-11 sm:hidden">
            Más opciones
            <IconChevronDown className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-56 flex-col gap-1 p-1.5">
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full justify-start px-3 text-sm"
            onClick={() => compartirEnlace(tipo, titulo)}
          >
            <IconShare className="h-3.5 w-3.5" />
            Compartir
          </Button>
          <CopiarEnlace variant="ghost" className="h-11 w-full justify-start px-3 text-sm" />
          {rss && (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-11 w-full justify-start px-3 text-sm"
            >
              {rss}
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
