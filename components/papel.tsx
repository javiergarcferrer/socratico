/**
 * Vocabulario del papel — lo que esta plataforma tiene y una librería no.
 *
 * Aquí vivía el sistema entero: la superficie, la cabecera, la marca de estado
 * y el botón. Desde la pasada de shadcn/ui esas cuatro **se fueron a
 * `components/ui/*`**, donde son `Card`, `CardHeader`, `Badge` y `Button` con
 * los mismos colores y la misma tipografía de siempre. No es una capa nueva
 * encima: es la misma pieza, movida, y por eso no queda un `Hoja` que envuelva
 * a `Card` — dos nombres para una cosa es exactamente la «segunda tabla» que
 * `lib/estados.ts` documenta como la forma concreta en que un sistema se
 * rompe.
 *
 * Lo que se queda es lo que **no existe fuera de esta casa**, porque no es
 * aspecto sino doctrina:
 *
 *  · `Rotulo` — el epígrafe cuyo punto es el sello. La regla única de la marca.
 *  · `Cifra` — un número **con su ancla**: de dónde sale y sobre qué base. Un
 *    número sin referencia obliga al lector a inventarse el contexto, y el
 *    contexto inventado es el error más caro de una plataforma de
 *    transparencia.
 *  · `TiraDeCifras` — la tira de casillas de un formulario: la forma canónica
 *    de presentar indicadores, sin tarjetas y sin sombras.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { textoAncla, type Ancla } from "@/lib/cifras";

/* ------------------------------------------------------------------ rótulo */

/**
 * Epígrafe de sección, como el encabezado de un formulario. Su punto es el
 * sello: la regla única de la identidad, aplicada aquí una vez para todos.
 */
export function Rotulo({
  children,
  className,
  conPunto = true,
  tono = "text-ink-soft",
  como: Etiqueta = "p",
  id,
}: {
  children: ReactNode;
  className?: string;
  conPunto?: boolean;
  tono?: string;
  /**
   * Cuando el epígrafe **es** el encabezado de un bloque —un grupo de una
   * lista, sin otro titular—, se pinta como `h2`/`h3` para que el lector de
   * pantalla lo encuentre. Envolver el `<p>` en un `h2` era HTML inválido.
   */
  como?: "p" | "h2" | "h3";
  id?: string;
}) {
  return (
    <Etiqueta id={id} className={cn("rotulo flex items-start gap-2", tono, className)}>
      {conPunto && (
        <span
          aria-hidden
          className="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full bg-sello-600"
        />
      )}
      <span>{children}</span>
    </Etiqueta>
  );
}

/* ------------------------------------------------------------------- datos */

/**
 * Una cifra del registro: monto, censo, plazo. Siempre en mono y tabular —se
 * copia, se compara y se verifica—, con su etiqueta encima y **su ancla
 * debajo**.
 *
 * El ancla no es decoración: un número sin referencia obliga al lector a
 * inventarse el contexto, y en una plataforma de transparencia el contexto
 * inventado es el error más caro. `ancla` declara de dónde sale la cifra —
 * censo, muestra o instantánea— y la línea se compone sola. Cuando no hay
 * nada honesto que decir, no se escribe nada: mejor un número desnudo que un
 * contexto fabricado.
 *
 * La cifra de una **muestra** nunca puede ser el denominador de un porcentaje.
 * `comparable()` en `lib/cifras.ts` lo decide; aquí solo se declara.
 */
export function Cifra({
  etiqueta,
  valor,
  nota,
  ancla,
  tono = "text-ink",
  className,
}: {
  etiqueta: ReactNode;
  valor: ReactNode;
  nota?: ReactNode;
  ancla?: Ancla;
  tono?: string;
  className?: string;
}) {
  const contexto = nota ?? textoAncla(ancla);
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs leading-tight text-ink-soft">{etiqueta}</span>
      <span className={cn("font-mono text-xl font-semibold tabular-nums", tono)}>
        {valor}
      </span>
      {/*
        12 px y no 11: esta línea es la que declara **la base del número** —si
        es un censo, una muestra o una instantánea— y es lo único que impide
        leer una muestra como un total. Lo esencial no se pone en cuerpo de
        pie de página; el único texto de la casa por debajo de 12 px es el
        `.rotulo`, que va en versalitas y espaciado para compensarlo.
      */}
      {contexto && (
        <span className="text-xs leading-snug text-ink-soft">{contexto}</span>
      )}
    </div>
  );
}

/**
 * Tira de cifras separadas por filetes verticales, como las casillas de un
 * formulario. Es la forma canónica de presentar indicadores: sin tarjetas,
 * sin sombras, sin adornos.
 */
export function TiraDeCifras({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid divide-y divide-hairline border-y border-hairline sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4 [&>*]:px-5 [&>*]:py-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
