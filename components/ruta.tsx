"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { SECCIONES, type SeccionId } from "@/lib/secciones";
import { rutaAnterior } from "@/components/rastro";
import { cn } from "@/lib/cn";
import { IconArrowLeft } from "@/components/icons";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/**
 * La ruta de una ficha: de dónde cuelga y cómo se vuelve.
 *
 * Estaba escrita cinco veces con tres vestidos —enlace azul de 14 px, enlace
 * gris de 12, y «Volver al buscador» en otro azul—, que es la dilución que
 * `docs/INFRAESTRUCTURA.md` §11 describe. Ahora es una pieza, y hace dos cosas que
 * ninguna de las cinco hacía:
 *
 *  · **Volver no pierde la búsqueda.** El enlace de vuelta apuntaba a la raíz
 *    de la vista —`/licitaciones` a secas—, así que quien llegaba a una ficha
 *    desde un listado filtrado volvía a un listado sin filtros, en la primera
 *    página y arriba del todo, y tenía que rehacer de memoria lo que había
 *    tecleado. Si la ruta anterior es la misma vista (`components/rastro.tsx`), volver
 *    es el «atrás» del navegador, que restituye la consulta y el desplazamiento.
 *    Si no —se entró por un enlace compartido—, es un enlace normal.
 *  · **Dice dónde está la ficha**, desde `sm`: «Congreso › Senado › Expediente
 *    1234». En el teléfono solo queda la vuelta, a 44 px, porque la barra de
 *    sección ya dice la vertical y la migaja entera se partía en dos renglones.
 *
 * La vertical sale de `lib/secciones`: la ruta no tiene su propia lista.
 */
export function Ruta({
  seccion: seccionId,
  raiz,
  padre,
  actual,
  className,
}: {
  /** La vertical de la ficha. Las páginas transversales pasan `raiz`. */
  seccion?: SeccionId;
  /** Raíz de una página que no es de ninguna vertical: «Instituciones». */
  raiz?: { href: string; label: string };
  /** La vista de la que cuelga la ficha, si no es la raíz de la vertical. */
  padre?: { href: string; label: string };
  /** Cómo se llama esta ficha: «Expediente 1234», «Capítulo 0201». */
  actual: string;
  className?: string;
}) {
  const router = useRouter();
  const seccion = seccionId ? SECCIONES.find((s) => s.id === seccionId) : undefined;
  const inicio = seccion ? { href: seccion.href, label: seccion.nombre } : raiz!;

  const migas = [
    inicio,
    ...(padre && padre.href !== inicio.href ? [padre] : []),
  ];
  const vuelta = migas[migas.length - 1];

  /** Si se vino de la vista, volver es «atrás»: conserva filtros y posición. */
  const alVolver = (href: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (rutaAnterior() !== href) return;
    e.preventDefault();
    router.back();
  };

  return (
    <Breadcrumb className={className}>
      {/* Teléfono: solo la vuelta, con altura de mando. */}
      <Link
        href={vuelta.href}
        onClick={alVolver(vuelta.href)}
        className="-ml-2 inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-medium text-brand-700 active:text-brand-800 sm:hidden"
      >
        <IconArrowLeft className="h-4 w-4" />
        {vuelta.label}
      </Link>

      <BreadcrumbList className="hidden sm:flex">
        {migas.map((m) => (
          <BreadcrumbItemConSeparador key={m.href}>
            <BreadcrumbLink asChild>
              <Link href={m.href} onClick={alVolver(m.href)} className="inline-flex items-center gap-1.5 py-1">
                {seccion && m.href === seccion.href && (
                  <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", seccion.hue.punto)} />
                )}
                {m.label}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItemConSeparador>
        ))}
        <BreadcrumbItem>
          <BreadcrumbPage className="max-w-[40ch]" title={actual}>{actual}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function BreadcrumbItemConSeparador({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BreadcrumbItem>{children}</BreadcrumbItem>
      <BreadcrumbSeparator />
    </>
  );
}
