"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MENU, grupoActivo, puntoDe, type EnlaceMenu } from "@/lib/menu";
import { cn } from "@/lib/cn";
import { IconArrowRight } from "@/components/icons";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuDisparador,
} from "@/components/ui/navigation-menu";

/**
 * La navegación de escritorio: tres puertas —Dinero público, Leyes, El
 * Estado— que abren un panel con toda la plataforma debajo.
 *
 * Sustituye a la fila de siete verticales, que en pantallas anchas se decía en
 * preguntas («¿Qué compra?») y ya no cabía: con las páginas transversales
 * (instituciones, provincias, obras, gestión) serían doce botones. Aquí cada
 * destino tiene su sustantivo y, debajo, una línea que dice qué hay: reconocer
 * en vez de recordar, sin convertir la cabecera en un cuestionario.
 *
 * Por debajo de `lg` no se pinta: en el teléfono navegan la tab bar y su hoja
 * «Más», que leen el mismo `lib/menu`.
 */
export default function Megamenu() {
  const pathname = usePathname();
  // La comunidad tiene su propia puerta: estando en ella, el grupo que también
  // la lista no se enciende, o la cabecera marcaría dos sitios a la vez.
  const enComunidad = pathname === "/comunidad" || pathname.startsWith("/comunidad/");

  return (
    // El panel se abre en el tema Blueprint, como la barra de donde cuelga (app/globals.css).
    <NavigationMenu aria-label="Secciones" className="hidden lg:flex" claseCapa="tema-blueprint">
      <NavigationMenuList>
        {/*
          La primera puerta es el explorador: la plataforma es un grafo, y el
          banco de trabajo es donde se busca, se filtra y se analiza todo a la
          vez. No abre panel: es un sitio.
        */}
        <NavigationMenuItem>
          <NavigationMenuLink asChild>
            <Link
              href="/explorar"
              className={navigationMenuDisparador}
              data-activo={pathname === "/explorar"}
              aria-current={pathname === "/explorar" ? "page" : undefined}
            >
              Explorador
            </Link>
          </NavigationMenuLink>
        </NavigationMenuItem>
        {MENU.map((grupo) => (
          <NavigationMenuItem key={grupo.id} value={grupo.id}>
            <NavigationMenuTrigger data-activo={!enComunidad && grupoActivo(grupo, pathname)}>
              {grupo.label}
            </NavigationMenuTrigger>
            <NavigationMenuContent>
              <div className="grid gap-0 lg:grid-cols-[1fr_17rem]">
                <div className="p-6">
                  <p className="rotulo text-ink-soft">{grupo.label}</p>
                  <p className="mt-1 text-sm text-ink-soft">{grupo.resumen}</p>
                  <div
                    className={cn(
                      "mt-5 grid gap-x-8 gap-y-6",
                      grupo.columnas.length >= 3 ? "grid-cols-3" : "grid-cols-2",
                    )}
                  >
                    {grupo.columnas.map((col) => (
                      <section key={col.titulo} aria-label={col.titulo}>
                        <h3 className="flex items-center gap-2 border-b border-hairline pb-2 text-xs font-semibold uppercase tracking-wide text-ink">
                          <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", puntoDe(col))} />
                          {col.titulo}
                        </h3>
                        <ul className="mt-1.5">
                          {col.enlaces.map((e) => (
                            <li key={e.href}>
                              <Enlace enlace={e} actual={pathname === e.href} />
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                </div>

                <NavigationMenuLink asChild>
                  <Link
                    href={grupo.destacado.href}
                    className="group/destacado flex flex-col justify-between gap-6 bg-brand-50 p-6 text-ink transition-colors hover:bg-brand-100"
                  >
                    <span>
                      <span className="rotulo text-ink-soft">Empieza aquí</span>
                      <span className="mt-2 block font-display text-2xl leading-tight">
                        {grupo.destacado.label}
                      </span>
                      <span className="mt-2 block text-sm leading-relaxed text-ink-soft">
                        {grupo.destacado.nota}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                      Entrar
                      <IconArrowRight className="h-4 w-4 transition-transform group-hover/destacado:translate-x-0.5" />
                    </span>
                  </Link>
                </NavigationMenuLink>
              </div>
            </NavigationMenuContent>
          </NavigationMenuItem>
        ))}
        {/*
          La cuarta puerta no abre panel: la comunidad es un sitio, no un
          grupo de destinos. Lleva la misma raya dibujada que las otras.
        */}
        <NavigationMenuItem>
          <NavigationMenuLink asChild>
            <Link
              href="/comunidad"
              className={navigationMenuDisparador}
              data-activo={enComunidad}
              aria-current={pathname === "/comunidad" ? "page" : undefined}
            >
              Comunidad
            </Link>
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}

function Enlace({ enlace, actual }: { enlace: EnlaceMenu; actual: boolean }) {
  return (
    <NavigationMenuLink asChild>
      <Link
        href={enlace.href}
        aria-current={actual ? "page" : undefined}
        className="-mx-2 block rounded-md px-2 py-2 transition-colors hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-none"
      >
        <span
          className={cn(
            "block text-sm font-semibold",
            actual ? "text-brand-700" : "text-ink",
          )}
        >
          {enlace.label}
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-ink-soft">{enlace.nota}</span>
      </Link>
    </NavigationMenuLink>
  );
}
