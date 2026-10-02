"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SECCIONES, seccionDe } from "@/lib/secciones";
import { MENU, puntoDe } from "@/lib/menu";
import { CampoBusqueda } from "@/components/campo-busqueda";
import {
  IconBuilding,
  IconChartBar,
  IconCheck,
  IconChevronRight,
  IconCoins,
  IconDoc,
  IconGrid,
  IconLayers,
  IconMenu,
  IconTrendingUp,
} from "./icons";
import { cn } from "@/lib/cn";
import type { SeccionId } from "@/lib/secciones";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

/**
 * Navegación inferior móvil (oculta en lg+, donde navega el nav del header).
 *
 * Mismo modelo mental que el megamenú de escritorio: panorama + verticales, derivadas de
 * `lib/secciones`. Las vistas internas de cada vertical viven en la barra de
 * sección, no aquí: la tab bar cambia de vertical, no de vista.
 *
 * **Por qué cinco casillas y no siete.** Con el panorama y las seis verticales
 * la fila medía 504 px contra los 390 px de un iPhone, así que se dejó
 * deslizable — y el precio era el peor posible: en `/democracia` la pestaña
 * activa quedaba a 432 px, fuera de pantalla, o sea que la barra dejaba de
 * responder «¿dónde estoy?», que es lo único que tiene que hacer. Medido a
 * 390 px, siete casillas dan 55 px cada una y «Licitaciones» necesita 68 px:
 * no caben con dignidad. Cinco dan 78 px, que sí sostienen la etiqueta entera
 * a 11 px sin recortes ni desplazamiento lateral.
 *
 * Las cuatro verticales que quedan fijas son las que la plataforma nombra en
 * su propia descripción —qué compra, qué legisla y a quién paga— más el
 * panorama; las demás viven en la hoja de «Más», que se compone también desde
 * `lib/menu` —los mismos tres grupos del megamenú de escritorio— para que no
 * haya dos listas que mantener.
 *
 * **«Más» no cambia de nombre.** Antes se rebautizaba «Finanzas» o «Normativa»
 * al estar en esas páginas —el mismo sitio de la barra, con otra palabra según
 * la página— y en `/obras`, `/instituciones` o `/provincias` ninguna casilla
 * se encendía: la barra dejaba de responder «¿dónde estoy?». Ahora la regla es
 * una: toda ruta es de una casilla fija o vive en la hoja, y entonces se
 * enciende «Más». Qué página es exactamente lo dice su nombre accesible y,
 * dentro de la hoja, la fila marcada.
 *
 * **Por qué ni Buscar ni Instituciones desplazan a una fija.** Buscar ya está
 * en todas las páginas, en la cabecera y a la derecha, donde llega el pulgar,
 * y encabeza la hoja; una casilla más sería el mismo mando dos veces en la
 * misma pantalla. Instituciones es la puerta transversal, pero lo que la
 * plataforma dice de sí misma —qué compra, qué legisla y a quién paga— son
 * las tres fijas, y a una institución se llega igual desde el buscador o
 * desde cualquier ficha de esas tres verticales.
 *
 * **Tocar la casilla de la página en la que ya se está sube al principio**, en
 * vez de recargarla. Es el gesto de las apps del sistema, sustituye en esas
 * cuatro raíces al botón flotante de «volver arriba» —que en el teléfono
 * tapaba el contenido— y no tira los filtros de `/licitaciones`, que viven en
 * el querystring. Fuera de ellas ninguna casilla es la página actual y el
 * botón vuelve (`subeConLaPestana`).
 */

const ICONOS: Record<SeccionId, (p: { className?: string }) => React.ReactElement> = {
  licitaciones: IconCoins,
  finanzas: IconTrendingUp,
  congreso: IconLayers,
  normativa: IconDoc,
  nomina: IconChartBar,
  dinero: IconBuilding,
  democracia: IconCheck,
};

/** Las que ocupan casilla fija, en orden. El resto va a la hoja. */
const FIJAS: SeccionId[] = ["licitaciones", "congreso", "nomina"];

/** Sube al principio de la página, sin animar si se pidió menos movimiento. */
export function subirArriba() {
  const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: quieto ? "auto" : "smooth" });
}

/**
 * Si en esta ruta tocar una pestaña sube al principio: solo cuando la ruta es
 * exactamente el `href` de una casilla. En una ficha o en una página de «Más»
 * tocar la pestaña navega, y entonces el teléfono necesita el botón flotante
 * de `components/scroll-top.tsx`.
 */
export function subeConLaPestana(pathname: string): boolean {
  return (
    pathname === "/" ||
    FIJAS.some((id) => SECCIONES.find((s) => s.id === id)?.href === pathname)
  );
}

/** La búsqueda de toda la plataforma, tal como la presenta el megamenú. */
const BUSCAR_TODO = MENU.flatMap((g) => g.destacado).find((d) => d.href === "/buscar");

/** La fila de la hoja que corresponde a la página actual, si la hay. */
function destinoDe(pathname: string): { href: string; label: string } | null {
  let mejor: { href: string; label: string } | null = null;
  for (const e of MENU.flatMap((g) => g.columnas.flatMap((c) => c.enlaces))) {
    if (e.href === "/") continue;
    const dentro = pathname === e.href || pathname.startsWith(`${e.href}/`);
    if (dentro && (!mejor || e.href.length > mejor.href.length)) mejor = e;
  }
  return mejor;
}

export default function MobileTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const actual = seccionDe(pathname);
  const [hojaAbierta, setHojaAbierta] = useState(false);
  const [texto, setTexto] = useState("");

  const fijas = FIJAS.map(
    (id) => SECCIONES.find((s) => s.id === id)!,
  ).filter(Boolean);

  const tabs = [
    {
      href: "/",
      label: "Inicio",
      Icon: IconGrid,
      activa: pathname === "/",
      barra: "bg-ink",
      texto: "text-ink",
    },
    ...fijas.map((s) => ({
      href: s.href,
      label: s.nombre,
      Icon: ICONOS[s.id],
      activa: actual?.id === s.id,
      barra: s.hue.barra,
      texto: s.hue.activo,
    })),
  ];

  // Toda ruta que no enciende una fija vive en la hoja: entonces es «Más».
  const enHoja = !tabs.some((t) => t.activa);
  const destino = destinoDe(pathname);
  const aqui = enHoja ? (destino?.label ?? actual?.nombre ?? null) : null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-hairline bg-surface lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navegación principal"
    >
      <div className="flex">
        {tabs.map(({ href, label, Icon, activa, barra, texto }) => (
          <Link
            key={href}
            href={href}
            aria-current={activa ? "page" : undefined}
            onClick={(e) => {
              if (pathname !== href) return;
              e.preventDefault();
              subirArriba();
            }}
            className={cn(
              "group relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 pb-1.5 pt-2 text-[11px] font-medium leading-tight transition-colors active:scale-95",
              activa ? texto : "text-ink-soft",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "absolute top-0 h-0.5 w-8 transition-opacity",
                barra,
                activa ? "opacity-100" : "opacity-0",
              )}
            />
            <Icon className="h-6 w-6" />
            <span className="max-w-full truncate">{label}</span>
          </Link>
        ))}

        <Drawer open={hojaAbierta} onOpenChange={setHojaAbierta}>
          <DrawerTrigger
            // `aria-current` va también aquí: cuando el visitante está en una
            // página de la hoja, esta casilla **es** la que representa la
            // página actual en la navegación, y quien no ve el subrayado tiene
            // derecho a saberlo igual. El nombre accesible empieza por «Más»,
            // que es lo que se ve (WCAG 2.5.3), y dice después dónde se está.
            aria-current={enHoja ? "page" : undefined}
            aria-label={aqui ? `Más secciones, estás en ${aqui}` : "Más secciones"}
            className={cn(
              "group relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 pb-1.5 pt-2 text-[11px] font-medium leading-tight transition-colors active:scale-95",
              enHoja ? (actual?.hue.activo ?? "text-ink") : "text-ink-soft",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "absolute top-0 h-0.5 w-8 transition-opacity",
                actual?.hue.barra ?? "bg-ink",
                enHoja ? "opacity-100" : "opacity-0",
              )}
            />
            <IconMenu className="h-6 w-6" />
            <span className="max-w-full truncate">Más</span>
          </DrawerTrigger>

          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Toda la plataforma</DrawerTitle>
              <DrawerDescription>
                Lo mismo que el menú de escritorio: el dinero, las leyes y el
                Estado, cada destino con una línea que dice qué hay.
              </DrawerDescription>
            </DrawerHeader>
            {/*
              Sin relleno arriba: una cabecera `sticky` se pega al borde del
              contenido, no al del cuerpo, y con `py-2` dejaba una franja de 8 px
              por donde se veía pasar el texto de las filas. El aire de arriba lo
              pone el campo de búsqueda.
            */}
            <DrawerBody className="px-2 pb-2 pt-0">
              {/*
                Buscar encabeza la hoja: quien abre «Más» sin saber en qué
                grupo vive lo que busca no tiene que recorrer veinte filas para
                descubrirlo. Es la misma búsqueda que «Buscar» en la cabecera y
                que la tarjeta destacada del megamenú, con su alcance debajo.
              */}
              <CampoBusqueda
                className="px-2 pb-2 pt-3"
                valor={texto}
                onValor={setTexto}
                onLimpiar={() => setTexto("")}
                onEnviar={(v) => {
                  setHojaAbierta(false);
                  setTexto("");
                  router.push(v ? `/buscar?q=${encodeURIComponent(v)}` : "/buscar");
                }}
                etiqueta="Buscar en toda la plataforma"
                placeholder="Buscar en todo…"
                ayuda={BUSCAR_TODO?.nota}
              />
              {/*
                El mismo `lib/menu` que el megamenú de escritorio: en el teléfono
                no hay panel ancho, así que los tres grupos se apilan, cada uno
                con sus columnas, y cada destino es una fila de 48 px con su
                línea de explicación.

                Cada columna lleva su cabecera —«Compras públicas», «Banco
                Central y banca»…— como en el escritorio. Antes se aplanaban en
                una sola lista bajo el rótulo del grupo y de la columna solo
                quedaba el color de un punto: ocho filas más abajo ya no se
                sabía en qué sección se estaba. La cabecera queda fija arriba
                (`sticky`) mientras se recorren las filas de su columna y la
                empuja la siguiente; lleva fondo opaco para que las filas no se
                lean por debajo, y el punto de la vertical pasa de cada fila a
                ella, donde se dice una sola vez.
              */}
              {MENU.map((grupo) => (
                <section key={grupo.id} aria-label={grupo.label} className="mb-3">
                  <h2 className="rotulo px-3 pb-1 pt-2 text-ink-soft">{grupo.label}</h2>
                  {grupo.columnas.map((col) => (
                    <section key={col.titulo} aria-label={col.titulo} className="mt-1">
                      <h3 className="sticky top-0 z-10 flex items-center gap-2 border-b border-hairline bg-surface px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink">
                        <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", puntoDe(col))} />
                        {col.titulo}
                      </h3>
                      <ul>
                        {col.enlaces.map((e) => (
                          <li key={e.href}>
                            <Link
                              href={e.href}
                              onClick={() => setHojaAbierta(false)}
                              aria-current={destino?.href === e.href ? "page" : undefined}
                              className="flex min-h-12 items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-canvas/70 active:bg-canvas/70 aria-[current=page]:bg-canvas"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold text-ink">{e.label}</span>
                                <span className="block truncate text-xs text-ink-soft">{e.nota}</span>
                              </span>
                              <IconChevronRight className="h-4 w-4 shrink-0 text-ink-soft" />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </section>
              ))}
            </DrawerBody>
          </DrawerContent>
        </Drawer>
      </div>
    </nav>
  );
}
