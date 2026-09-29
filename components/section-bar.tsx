"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { seccionDe, vistaActivaDe } from "@/lib/secciones";
import { getSeguimiento, onSeguimientoCambio } from "@/lib/seguimiento";
import { cn } from "@/lib/cn";

/**
 * Barra de sección: el segundo nivel de la jerarquía de navegación.
 *
 * Aparece solo dentro de una vertical y responde dos preguntas sin que el
 * usuario piense: «¿en qué vertical estoy?» (nombre + punto de matiz, siempre
 * en el mismo sitio) y «¿qué vistas tiene esta vertical?» (tabs con indicador
 * de activo). En la portada y en las páginas de la plataforma (/buscar,
 * /fuentes, la cuenta) no pinta nada: ahí no hay sección de la que
 * orientarse. Toda página de datos del Estado es de una sección (el árbol
 * de `lib/secciones.ts`).
 *
 * En el teléfono las vistas no caben —licitaciones mide 554 px de pestañas
 * contra 390 px de pantalla— y la fila se desplaza. Dos decisiones sostienen
 * eso sin recurrir a un degradado, que sería pintar una sombra donde no hay
 * ningún objeto que la proyecte:
 *
 *  · **La activa se centra al montar** (`scrollIntoView` sin animación). Una
 *    barra que carga con la pestaña activa fuera de pantalla deja de contestar
 *    «¿dónde estoy?», que es la mitad de su oficio.
 *  · **Hay aire al final de la fila**, de modo que la última pestaña queda
 *    cortada a medias cuando sobra contenido: el corte es la señal honesta de
 *    que hay más: lo dice el propio contenido, no un adorno encima.
 */
export default function SectionBar() {
  const pathname = usePathname();
  const seccion = seccionDe(pathname);

  const [seguidos, setSeguidos] = useState(0);
  useEffect(() => {
    const sync = () => setSeguidos(getSeguimiento().length);
    sync();
    return onSeguimientoCambio(sync);
  }, []);

  /*
    El desplazamiento se hace sobre el contenedor y no con `scrollIntoView` a
    secas: el documento entero también desplazaría —la barra es pegajosa bajo
    el header— y la página aparecería ya bajada. `behavior: "instant"` porque
    esto es la posición inicial, no una transición que el ojo deba seguir.
  */
  const fila = useRef<HTMLDivElement>(null);
  const activaRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const centrar = () => {
      const caja = fila.current;
      const tab = activaRef.current;
      if (!caja || !tab) return;
      const destino = tab.offsetLeft - (caja.clientWidth - tab.offsetWidth) / 2;
      caja.scrollTo({ left: Math.max(0, destino), behavior: "instant" });
    };
    /*
      Dos pasadas. La primera coloca la barra en cuanto hay medidas; la segunda,
      en el siguiente fotograma, recoge lo que se movió después —la burbuja de
      seguidos que aparece al leer el almacenamiento, la tipografía que termina
      de cargar y ensancha las pestañas—. Sin ella, `/seguimiento` cargaba con
      su propia pestaña a 523 px, fuera de una pantalla de 390.
    */
    centrar();
    const id = requestAnimationFrame(centrar);
    return () => cancelAnimationFrame(id);
  }, [pathname, seguidos]);

  if (!seccion) return null;

  const activa = vistaActivaDe(seccion, pathname);
  const unaSolaVista = seccion.vistas.length <= 1;

  return (
    // Toda la barra es un landmark: el nombre de la vertical quedaba fuera de
    // cualquier región (axe: region) y un lector de pantalla no lo encontraba.
    <nav aria-label={`Sección ${seccion.nombre}`} className="border-b border-hairline bg-surface">
      <div
        ref={fila}
        className="no-scrollbar mx-auto flex max-w-6xl items-center gap-3 overflow-x-auto px-4 sm:gap-4"
      >
        <span className="flex shrink-0 items-center gap-2 py-3 pr-1 text-[13px] font-semibold text-ink sm:py-2.5 sm:pr-2">
          <span aria-hidden className={cn("h-2 w-2 rounded-full", seccion.hue.punto)} />
          {seccion.nombre}
          <span className="hidden font-normal text-ink-soft sm:inline">
            {seccion.descriptor}
          </span>
        </span>

        {!unaSolaVista && (
          <div
            // El aire de la derecha deja que la última pestaña se corte a
            // medias en vez de morir pegada al borde: así se ve que hay más.
            className="flex items-center pr-6 sm:pr-0"
          >
            {seccion.vistas.map((vista) => {
              const esActiva = activa?.href === vista.href;
              return (
                <Link
                  key={vista.href}
                  href={vista.href}
                  ref={esActiva ? activaRef : undefined}
                  aria-current={esActiva ? "page" : undefined}
                  className={cn(
                    // 44 px de alto en el teléfono (el objetivo táctil de las
                    // guías); 40 desde `sm`, donde manda el puntero.
                    "relative flex shrink-0 items-center gap-1.5 px-3 py-3 text-[13px] transition-colors sm:py-2.5",
                    esActiva
                      ? cn("font-semibold", seccion.hue.activo)
                      : "font-medium text-ink-soft hover:text-ink",
                  )}
                >
                  {vista.label}
                  {vista.seguimiento && seguidos > 0 && (
                    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-brand-500 px-1 font-mono text-[10px] font-semibold tabular-nums text-canvas">
                      {seguidos}
                    </span>
                  )}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-2 bottom-0 h-0.5 transition-opacity",
                      seccion.hue.barra,
                      esActiva ? "opacity-100" : "opacity-0",
                    )}
                  />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}
