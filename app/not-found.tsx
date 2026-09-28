import Link from "next/link";
import type { Metadata } from "next";
import { MENU } from "@/lib/menu";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconSearch } from "@/components/icons";

export const metadata: Metadata = {
  title: "Página no encontrada",
  robots: { index: false, follow: true },
};

/**
 * Lo que ve quien llega a una dirección que no existe. Antes era el 404 de
 * Next en inglés —«This page could not be found.»— y sin salida: ni
 * buscador ni camino de vuelta (Nielsen, heurística 9: ayudar a salir del
 * error). Aquí dice qué pasó en llano, ofrece la búsqueda de toda la
 * plataforma y las entradas destacadas del menú.
 */
export default function NoEncontrada() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <header>
        <p className="rotulo text-ink-soft">Error 404</p>
        <h1 className="mt-1 font-display text-3xl text-ink sm:text-4xl">
          Esta página no existe
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Puede que el enlace esté mal escrito, que la ficha haya cambiado de
          dirección o que el registro del Estado ya no la publique. Búscala por
          su nombre, número o siglas:
        </p>
      </header>

      <form action="/buscar" method="get" role="search" className="flex gap-2">
        <label htmlFor="buscar-404" className="sr-only">
          Buscar en toda la plataforma
        </label>
        <Input
          id="buscar-404"
          name="q"
          type="search"
          enterKeyHint="search"
          placeholder="Una institución, una ley, un RNC, un tema…"
        />
        <Button type="submit" className="shrink-0">
          <IconSearch className="h-4 w-4" />
          Buscar
        </Button>
      </form>

      <Card as="section" className="p-5">
        <h2 className="font-sans text-sm font-semibold text-ink">O empieza por aquí</h2>
        <ul className="mt-2 divide-y divide-hairline">
          {MENU.map((g) => (
            <li key={g.id}>
              <Link href={g.destacado.href} className="group block py-3">
                <span className="block text-sm font-semibold text-ink group-hover:text-brand-700">
                  {g.destacado.label}
                </span>
                <span className="mt-0.5 block text-xs text-ink-soft">{g.destacado.nota}</span>
              </Link>
            </li>
          ))}
          <li>
            <Link href="/" className="group block py-3">
              <span className="block text-sm font-semibold text-ink group-hover:text-brand-700">
                Volver al inicio
              </span>
              <span className="mt-0.5 block text-xs text-ink-soft">Qué es Socrático, lo de hoy y todo lo que hay</span>
            </Link>
          </li>
        </ul>
      </Card>
    </div>
  );
}
