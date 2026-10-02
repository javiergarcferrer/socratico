import * as React from "react";

import { cn } from "@/lib/cn";

/**
 * Barra de proporción — **una sola** en toda la plataforma.
 *
 * shadcn la trae sobre `@radix-ui/react-progress`, y aquí no: Radix la marca
 * como componente de cliente, y esta plataforma dibuja barras sobre todo en el
 * servidor —los veinte adjudicatarios de un ranking, la ejecución de cada
 * capítulo del presupuesto—. Cargar Radix por ellas mandaría al navegador un
 * componente de cliente por barra a cambio de nada: lo único que aporta es el
 * `role` y los `aria-value*`, que son cuatro atributos y están aquí escritos.
 *
 * Así queda un solo medidor para los dos casos, el vivo y el estático, en vez
 * de dos piezas que hacen lo mismo — que es como se rompen los sistemas.
 *
 * Esquina `rounded-sm`: una barra con el radio completo es una píldora, y aquí
 * las píldoras no entran (docs/INFRAESTRUCTURA.md §11). El color del relleno se pasa
 * por `indicadorClassName` porque una proporción **significa** algo distinto en
 * cada sitio —ejecución presupuestaria, reparto de votos, concentración de
 * contratos— y el significado manda sobre el adorno.
 */
function Progress({
  className,
  indicadorClassName,
  value,
  max = 100,
  children,
  ...props
}: Omit<React.HTMLAttributes<HTMLDivElement>, "role"> & {
  value: number | null | undefined;
  max?: number;
  indicadorClassName?: string;
  /**
   * Lo que se pinta **dentro del relleno**: la ejecución presupuestaria marca
   * ahí qué parte de lo devengado ya salió de caja. Va dentro y no al lado
   * porque es una fracción de la barra, no otra barra.
   */
  children?: React.ReactNode;
}) {
  const pct = Math.min(100, Math.max(0, ((value ?? 0) / max) * 100));
  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value ?? undefined}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-sm bg-hairline",
        className,
      )}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className={cn("bar-grow h-full bg-brand-500", indicadorClassName)}
        style={{ width: `${pct}%` }}
      >
        {children}
      </div>
    </div>
  );
}

export { Progress };
