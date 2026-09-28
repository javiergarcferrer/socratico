import type { MetadataRoute } from "next";

import { SECCIONES } from "@/lib/secciones";

/**
 * El manifiesto de instalación. Tres decisiones aquí no son de formato:
 *
 *  · `background_color` es el papel (#f7f3ea) y `theme_color` el azul de la
 *    marca (#0b2d6b), los mismos tokens de `app/globals.css` y el mismo `themeColor`
 *    que declara el `viewport` del layout. La pantalla de arranque de Android
 *    se pinta con ellos: si desafinan, la app abre con un fogonazo de otro
 *    color antes de ser ella misma.
 *  · `orientation` pasa de `portrait` a `any`. La nómina y las finanzas se
 *    leen en tablas anchas y girar el teléfono es la forma natural de
 *    abrirlas; bloquear el giro le quitaba al lector una herramienta que la
 *    plataforma misma necesita.
 *  · `id` fija la identidad de la aplicación instalada con independencia de
 *    `start_url`: sin él, cambiar la pantalla de inicio el día de mañana
 *    crearía una app distinta en el teléfono de quien ya la instaló.
 *
 * Los accesos directos salen de `lib/secciones` —la fuente única de
 * navegación— y no de una lista aparte: una segunda lista es una lista que se
 * queda vieja. Van sin icono a propósito: en `/public` no hay más arte que el
 * sello, y un icono inventado sería peor que ninguno.
 */
const ACCESOS_DIRECTOS = ["licitaciones", "congreso", "democracia"] as const;

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Socrático · Preguntarle al Estado con sus propios datos",
    short_name: "Socrático",
    description:
      "Qué compra, qué legisla y a quién paga el Estado dominicano: compras públicas, Congreso Nacional y nómina estatal, leídos en vivo desde sus fuentes oficiales. Herramienta independiente y no oficial.",
    lang: "es-DO",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f7f3ea",
    theme_color: "#0b2d6b",
    categories: ["government", "business", "productivity"],
    shortcuts: ACCESOS_DIRECTOS.map((id) => {
      const seccion = SECCIONES.find((s) => s.id === id)!;
      return {
        name: seccion.nombre,
        short_name: seccion.nombre,
        description: seccion.descriptor,
        url: seccion.href,
      };
    }),
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
