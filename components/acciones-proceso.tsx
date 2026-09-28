"use client";

import { useEffect } from "react";

import SeguirButton from "./seguir-button";
import Guardar from "./espacios/guardar";
import { enlace } from "@/lib/grafo";
import { compartirEnlace } from "./compartir";
import { IconExternal, IconShare } from "./icons";
import { Button } from "@/components/ui/button";

/**
 * La barra de acciones de un proceso en el teléfono: fija sobre la tab bar,
 * con lo único que se puede hacer desde aquí —seguirlo, guardarlo en una
 * investigación, compartirlo y ofertar en el portal—. En escritorio no existe: allí las acciones están en la
 * cabecera de la ficha, a la vista.
 *
 * «Ofertar» solo aparece mientras el proceso recibe ofertas. En uno cerrado
 * invitaba a una acción imposible, y con los cuatro controles la fila medía
 * unos 420 px: a 390 el botón quedaba cortado contra el borde. El portal sigue
 * a un toque desde la cabecera de la ficha.
 */
export default function AccionesProceso({
  codigo,
  titulo,
  url,
  abierto = true,
  huella,
}: {
  codigo: string;
  titulo: string;
  url?: string;
  /** Si el proceso todavía recibe ofertas: sin eso, no hay «Ofertar». */
  abierto?: boolean;
  /** El estado del proceso, para que `/seguimiento` sepa qué cambió. */
  huella?: string;
}) {
  /*
    Tres afordancias flotantes se disputan el borde inferior del teléfono: la
    tab bar (72 px desde abajo), esta barra (de 72 a 144) y el botón de «volver
    arriba», que se pone a 84 px y mide 44 — o sea, **dentro** de esta barra,
    encima del botón de ofertar. Se marca la raíz igual que hace el aviso de
    instalación con `data-oferta-instalar`, y el propio botón
    (`components/scroll-top.tsx`) lee la marca para subir por encima de la
    barra mientras esta está en pantalla (solo por debajo de `lg`, que es donde
    la barra se pinta).
  */
  useEffect(() => {
    const raiz = document.documentElement;
    raiz.dataset.barraAcciones = "1";
    return () => {
      delete raiz.dataset.barraAcciones;
    };
  }, []);

  return (
    <div
      className="fixed inset-x-0 z-40 border-t border-hairline bg-surface px-3 py-3 shadow-pop lg:hidden"
      style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-md items-center gap-1.5">
        <SeguirButton codigo={codigo} titulo={titulo} huella={huella} variant="bar" />
        <Guardar referencia={{ tipo: "proceso", ref: enlace.proceso(codigo), titulo, href: enlace.proceso(codigo) }} className="h-12" />
        <Button
          variant="secondary"
          size="icon"
          onClick={() => compartirEnlace("proceso", titulo)}
          className="h-12 w-12 shrink-0"
        >
          <IconShare className="h-5 w-5" />
          <span className="sr-only">Compartir</span>
        </Button>
        {url && abierto && (
          <Button asChild className="h-12 min-w-0 flex-1 gap-1.5 px-2.5">
            <a href={url} target="_blank" rel="noopener noreferrer">
              Ofertar
              <IconExternal className="h-4 w-4" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
